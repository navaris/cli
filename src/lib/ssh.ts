/**
 * SSH connection manager using ssh2
 * 
 * Supports both ssh-agent (for encrypted keys) and direct key files.
 * On macOS, ssh-agent is preferred as it integrates with Keychain.
 * Also supports jump hosts (ProxyJump) for accessing nodes behind bastion hosts.
 */

import { Client, type ConnectConfig, type ClientChannel } from 'ssh2';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NodeConfig, SSHConfig, SwarmConfig } from '../types/config.js';
import { expandPath } from './config.js';

/** Reference to the full swarm config for jump host resolution */
let swarmConfigRef: SwarmConfig | undefined;

/** Semaphore for limiting concurrent jump host connections */
const jumpHostSemaphore = new Map<string, { queue: (() => void)[], active: number }>();
const MAX_CONCURRENT_JUMP_SESSIONS = 3;

/**
 * Acquire a slot for a jump host session
 */
async function acquireJumpSlot(jumpHost: string): Promise<void> {
  let sem = jumpHostSemaphore.get(jumpHost);
  if (!sem) {
    sem = { queue: [], active: 0 };
    jumpHostSemaphore.set(jumpHost, sem);
  }
  
  if (sem.active < MAX_CONCURRENT_JUMP_SESSIONS) {
    sem.active++;
    return;
  }
  
  // Wait for a slot
  return new Promise((resolve) => {
    sem!.queue.push(() => {
      sem!.active++;
      resolve();
    });
  });
}

/**
 * Release a jump host session slot
 */
function releaseJumpSlot(jumpHost: string): void {
  const sem = jumpHostSemaphore.get(jumpHost);
  if (!sem) return;
  
  sem.active--;
  const next = sem.queue.shift();
  if (next) next();
}

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class SSHError extends Error {
  constructor(
    message: string,
    public readonly host: string,
    public readonly code?: number
  ) {
    super(message);
    this.name = 'SSHError';
  }
}

/**
 * Connection pool to reuse SSH connections
 */
const connectionPool = new Map<string, Client>();

/**
 * Get connection key for pooling
 */
function getConnectionKey(node: NodeConfig): string {
  return `${node.user}@${node.host}`;
}

/**
 * Check if ssh-agent is available
 */
function getAgentSocket(): string | undefined {
  // Check SSH_AUTH_SOCK environment variable
  const authSock = process.env.SSH_AUTH_SOCK;
  if (authSock && fs.existsSync(authSock)) {
    return authSock;
  }
  return undefined;
}

/**
 * Read SSH private key from file
 */
function readPrivateKey(identityPath: string): Buffer | undefined {
  const expanded = expandPath(identityPath);
  if (!fs.existsSync(expanded)) {
    return undefined;
  }
  return fs.readFileSync(expanded);
}

/**
 * Get default SSH identity path
 */
function getDefaultIdentity(): string | undefined {
  const ed25519 = path.join(os.homedir(), '.ssh', 'id_ed25519');
  const rsa = path.join(os.homedir(), '.ssh', 'id_rsa');
  
  if (fs.existsSync(ed25519)) return ed25519;
  if (fs.existsSync(rsa)) return rsa;
  
  return undefined;
}

/**
 * Simple glob pattern matching for host names
 * Supports * wildcard only
 */
function matchHostPattern(pattern: string, hostname: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(hostname);
}

/**
 * Get identity file for a specific node
 * Checks per-host identities first, then falls back to default
 */
function getIdentityForNode(
  nodeName: string,
  sshConfig?: SSHConfig
): string | undefined {
  // Check per-host identity overrides
  if (sshConfig?.identities) {
    for (const [pattern, identityPath] of Object.entries(sshConfig.identities)) {
      if (matchHostPattern(pattern, nodeName)) {
        const expanded = expandPath(identityPath);
        if (fs.existsSync(expanded)) {
          return expanded;
        }
      }
    }
  }
  
  // Fall back to default identity
  if (sshConfig?.identity) {
    return expandPath(sshConfig.identity);
  }
  
  return getDefaultIdentity();
}

/**
 * Get jump host node name for a specific node
 * Returns undefined if no jump host is needed
 */
function getJumpHostForNode(
  nodeName: string,
  sshConfig?: SSHConfig
): string | undefined {
  // Check per-host jump host overrides
  if (sshConfig?.jumpHosts) {
    for (const [pattern, jumpHostName] of Object.entries(sshConfig.jumpHosts)) {
      if (matchHostPattern(pattern, nodeName)) {
        return jumpHostName;
      }
    }
  }
  
  // Fall back to default jump host
  return sshConfig?.jumpHost;
}

/**
 * Set the swarm config reference for jump host resolution
 */
export function setSwarmConfig(config: SwarmConfig): void {
  swarmConfigRef = config;
}

/**
 * Create a TCP tunnel through a jump host
 */
async function createJumpTunnel(
  jumpClient: Client,
  targetHost: string,
  targetPort: number
): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    jumpClient.forwardOut(
      '127.0.0.1',
      0,
      targetHost,
      targetPort,
      (err, stream) => {
        if (err) {
          reject(new SSHError(`Jump tunnel failed: ${err.message}`, targetHost));
          return;
        }
        resolve(stream);
      }
    );
  });
}

/**
 * Build ssh2 connection config
 * 
 * Priority:
 * 1. ssh-agent (if available) - handles encrypted keys via Keychain
 * 2. Direct key file (if unencrypted)
 */
function buildConnectConfig(
  node: NodeConfig,
  nodeName: string,
  sshConfig?: SSHConfig
): ConnectConfig {
  const agentSocket = getAgentSocket();
  const identity = getIdentityForNode(nodeName, sshConfig);

  const baseConfig: ConnectConfig = {
    host: node.host,
    port: 22,
    username: node.user,
    readyTimeout: (sshConfig?.timeout ?? 10) * 1000,
    keepaliveInterval: sshConfig?.keepalive ? 10000 : 0,
  };

  // Prefer ssh-agent for encrypted key support
  if (agentSocket) {
    return {
      ...baseConfig,
      agent: agentSocket,
    };
  }

  // Fall back to direct key file
  if (identity) {
    const privateKey = readPrivateKey(identity);
    if (privateKey) {
      return {
        ...baseConfig,
        privateKey,
      };
    }
  }

  throw new Error(
    'No SSH authentication method available. ' +
    'Either run ssh-agent or specify an unencrypted key.'
  );
}

/**
 * Get or create a direct SSH connection to a node
 * Note: For nodes behind jump hosts, use exec() which handles jump proxying
 */
export async function getConnection(
  node: NodeConfig,
  nodeName: string,
  sshConfig?: SSHConfig
): Promise<Client> {
  const key = getConnectionKey(node);
  
  // Check if we have an existing connection
  const existing = connectionPool.get(key);
  if (existing) {
    return existing;
  }

  // Direct connection
  const client = new Client();
  const config = buildConnectConfig(node, nodeName, sshConfig);

  return new Promise((resolve, reject) => {
    client
      .on('ready', () => {
        connectionPool.set(key, client);
        resolve(client);
      })
      .on('error', (err) => {
        reject(new SSHError(err.message, node.host));
      })
      .on('close', () => {
        connectionPool.delete(key);
      })
      .connect(config);
  });
}

/**
 * Execute a command on a remote node via SSH
 * 
 * If a jump host is configured for this node, the command is executed
 * by SSHing from the jump host to the target node.
 */
export async function exec(
  node: NodeConfig,
  nodeName: string,
  command: string,
  sshConfig?: SSHConfig
): Promise<SSHExecResult> {
  // Check if we need to go through a jump host
  const jumpHostName = getJumpHostForNode(nodeName, sshConfig);
  
  if (jumpHostName && swarmConfigRef) {
    const jumpNode = swarmConfigRef.nodes[jumpHostName];
    if (!jumpNode) {
      throw new SSHError(`Jump host '${jumpHostName}' not found in config`, node.host);
    }
    
    // Acquire a slot to avoid overwhelming the jump host
    await acquireJumpSlot(jumpHostName);
    
    try {
      // Execute via jump host: ssh to jump, then ssh to target
      const jumpClient = await getConnection(jumpNode, jumpHostName, sshConfig);
      
      // Escape the command for nested SSH
      const escapedCommand = command.replace(/'/g, "'\\''");
      
      // SSH from jump host to target node and execute command
      // Use the swarm identity key on the jump host
      const sshCommand = `ssh -i ~/.ssh/id_ed25519_swarm -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${node.user}@${node.host} '${escapedCommand}'`;
      
      return await new Promise<SSHExecResult>((resolve, reject) => {
        jumpClient.exec(sshCommand, (err, stream) => {
          if (err) {
            reject(new SSHError(err.message, node.host));
            return;
          }

          let stdout = '';
          let stderr = '';

          stream
            .on('close', (code: number) => {
              resolve({ stdout, stderr, code: code ?? 0 });
            })
            .on('data', (data: Buffer) => {
              stdout += data.toString();
            })
            .stderr.on('data', (data: Buffer) => {
              stderr += data.toString();
            });
        });
      });
    } finally {
      releaseJumpSlot(jumpHostName);
    }
  }
  
  // Direct connection
  const client = await getConnection(node, nodeName, sshConfig);

  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(new SSHError(err.message, node.host));
        return;
      }

      let stdout = '';
      let stderr = '';

      stream
        .on('close', (code: number) => {
          resolve({ stdout, stderr, code: code ?? 0 });
        })
        .on('data', (data: Buffer) => {
          stdout += data.toString();
        })
        .stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
    });
  });
}

/**
 * Test if a node is reachable via SSH
 */
export async function testConnection(
  node: NodeConfig,
  nodeName: string,
  sshConfig?: SSHConfig
): Promise<boolean> {
  try {
    const result = await exec(node, nodeName, 'echo ok', sshConfig);
    return result.code === 0 && result.stdout.trim() === 'ok';
  } catch {
    return false;
  }
}

/**
 * Close a specific connection
 */
export function closeConnection(node: NodeConfig): void {
  const key = getConnectionKey(node);
  const client = connectionPool.get(key);
  if (client) {
    client.end();
    connectionPool.delete(key);
  }
}

/**
 * Close all connections in the pool
 */
export function closeAllConnections(): void {
  for (const [key, client] of connectionPool) {
    client.end();
    connectionPool.delete(key);
  }
}

/**
 * Execute a command that requires specific PATH (e.g., for openclaw)
 */
export async function execWithPath(
  node: NodeConfig,
  nodeName: string,
  command: string,
  sshConfig?: SSHConfig
): Promise<SSHExecResult> {
  // Prepend PATH setup for Mac Mini with homebrew and npm-global
  const fullCommand = `export PATH=/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$HOME/.npm-global/bin:$PATH && ${command}`;
  return exec(node, nodeName, fullCommand, sshConfig);
}
