/**
 * Configuration loader
 * Loads swarm config from ~/.navaris/swarm.yaml
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';
import type { SwarmConfig } from '../types/config.js';
import { setSwarmConfig } from './ssh.js';

const CONFIG_DIR = path.join(os.homedir(), '.navaris');
const CONFIG_FILE = path.join(CONFIG_DIR, 'swarm.yaml');

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Expand ~ to home directory in paths
 */
export function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Load swarm configuration from ~/.navaris/swarm.yaml
 */
export function loadConfig(): SwarmConfig {
  if (!configExists()) {
    throw new ConfigError(
      `Config file not found: ${CONFIG_FILE}\n` +
      `Run 'navaris swarm config --init' to create one.`
    );
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = yaml.load(content) as SwarmConfig;

    // Validate required fields
    if (!config.version) {
      throw new ConfigError('Missing required field: version');
    }
    if (!config.orchestrator?.node) {
      throw new ConfigError('Missing required field: orchestrator.node');
    }
    if (!config.nodes || Object.keys(config.nodes).length === 0) {
      throw new ConfigError('No nodes defined in config');
    }

    // Validate orchestrator node exists
    if (!config.nodes[config.orchestrator.node]) {
      throw new ConfigError(
        `Orchestrator node '${config.orchestrator.node}' not found in nodes`
      );
    }

    // Set the swarm config reference for SSH jump host resolution
    setSwarmConfig(config);

    return config;
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    if (err instanceof yaml.YAMLException) {
      throw new ConfigError(`Invalid YAML in config: ${err.message}`);
    }
    throw new ConfigError(`Failed to load config: ${err}`);
  }
}

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Write config to file
 */
export function writeConfig(config: SwarmConfig): void {
  ensureConfigDir();
  const content = yaml.dump(config, { indent: 2, lineWidth: 120 });
  fs.writeFileSync(CONFIG_FILE, content, 'utf-8');
}

/**
 * Get the orchestrator node config
 */
export function getOrchestratorNode(config: SwarmConfig) {
  const nodeId = config.orchestrator.node;
  const node = config.nodes[nodeId];
  if (!node) {
    throw new ConfigError(`Orchestrator node '${nodeId}' not found`);
  }
  return { id: nodeId, ...node };
}
