/**
 * SSH connection manager using ssh2
 * 
 * Supports both ssh-agent (for encrypted keys) and direct key files.
 * On macOS, ssh-agent is preferred as it integrates with Keychain.
 */

import { Client, type ConnectConfig } from 'ssh2';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NodeConfig, SSHConfig } from '../types/config.js';
import { expandPath } from './config.js';

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
 * Build ssh2 connection config
 * 
 * Priority:
 * 1. ssh-agent (if available) - handles encrypted keys via Keychain
 * 2. Direct key file (if unencrypted)
 */
function buildConnectConfig(
  node: NodeConfig,
  sshConfig?: SSHConfig
): ConnectConfig {
  const agentSocket = getAgentSocket();
  const identity = sshConfig?.identity 
    ? expandPath(sshConfig.identity)
    : getDefaultIdentity();

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
 * Get or create an SSH connection to a node
 */
export async function getConnection(
  node: NodeConfig,
  sshConfig?: SSHConfig
): Promise<Client> {
  const key = getConnectionKey(node);
  
  // Check if we have an existing connection
  const existing = connectionPool.get(key);
  if (existing) {
    return existing;
  }

  // Create new connection
  const client = new Client();
  const config = buildConnectConfig(node, sshConfig);

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
 */
export async function exec(
  node: NodeConfig,
  command: string,
  sshConfig?: SSHConfig
): Promise<SSHExecResult> {
  const client = await getConnection(node, sshConfig);

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
  sshConfig?: SSHConfig
): Promise<boolean> {
  try {
    const result = await exec(node, 'echo ok', sshConfig);
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
  command: string,
  sshConfig?: SSHConfig
): Promise<SSHExecResult> {
  // Prepend PATH setup for Mac Mini with homebrew and npm-global
  const fullCommand = `export PATH=/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$HOME/.npm-global/bin:$PATH && ${command}`;
  return exec(node, fullCommand, sshConfig);
}
