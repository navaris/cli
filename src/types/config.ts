/**
 * Swarm configuration types
 * Loaded from ~/.navaris/swarm.yaml
 */

export interface NodeConfig {
  host: string;
  user: string;
  type: 'orchestrator' | 'worker' | 'storage';
  role?: string;
  probe?: 'ssh' | 'ping';
}

export interface ServiceConfig {
  node: string;
  check: 'process' | 'mount' | 'openclaw' | 'ping';
  process?: string;
  path?: string;
  channel?: string;
}

export interface MountConfig {
  node: string;
  type: 'smb' | 'nfs';
  source: string;
  target: string;
}

export interface SSHConfig {
  identity?: string;
  timeout?: number;
  keepalive?: boolean;
  /** Per-host identity overrides (glob patterns supported) */
  identities?: Record<string, string>;
  /** Jump host configuration (ProxyJump equivalent) */
  jumpHost?: string;
  /** Per-host jump host overrides (glob patterns supported) */
  jumpHosts?: Record<string, string>;
}

export interface SwarmConfig {
  version: number;
  orchestrator: {
    node: string;
  };
  nodes: Record<string, NodeConfig>;
  services: Record<string, ServiceConfig>;
  mounts?: Record<string, MountConfig>;
  ssh?: SSHConfig;
}

export const DEFAULT_SSH_CONFIG: SSHConfig = {
  identity: '~/.ssh/id_ed25519',
  timeout: 10,
  keepalive: true,
};
