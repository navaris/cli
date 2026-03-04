/**
 * navaris swarm config
 * Configuration management
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { 
  configExists, 
  getConfigPath, 
  loadConfig, 
  ensureConfigDir,
} from '../../lib/config.js';

const EXAMPLE_CONFIG = `# Navaris Swarm Configuration
# Location: ~/.navaris/swarm.yaml

version: 1

orchestrator:
  node: navaris-mini

nodes:
  navaris-mini:
    host: 192.168.68.86
    user: navaris-swarm
    type: orchestrator
    
  # Raspberry Pi cluster nodes
  navcluster01:
    host: navcluster01.local
    user: pi
    type: worker
    role: trading-bot
    
  navcluster02:
    host: navcluster02.local
    user: pi
    type: worker
    role: trading-bot
    
  navcluster03:
    host: navcluster03.local
    user: pi
    type: worker
    role: hpc-node
    
  navcluster04:
    host: navcluster04.local
    user: pi
    type: worker
    role: hpc-node
    
  navcluster05:
    host: navcluster05.local
    user: pi
    type: worker
    role: hpc-node
    
  navcluster06:
    host: navcluster06.local
    user: pi
    type: worker
    role: hpc-node
    
  navcluster07:
    host: navcluster07.local
    user: pi
    type: worker
    role: monitoring
    
  navcluster08:
    host: navcluster08.local
    user: pi
    type: worker
    role: monitoring

  qnap-nas:
    host: nase46577.local
    user: admin
    type: storage
    probe: ping

services:
  openclaw-gateway:
    node: navaris-mini
    check: process
    process: openclaw-gateway
    
  telegram-bot:
    node: navaris-mini
    check: openclaw
    channel: telegram
    
  nas-mount-swarm:
    node: navaris-mini
    check: mount
    path: /Users/navaris-swarm/nas-mount/navaris-swarm
    
  nas-mount-labs:
    node: navaris-mini
    check: mount
    path: /Users/navaris-swarm/nas-mount/navaris-labs

ssh:
  identity: ~/.ssh/id_ed25519
  timeout: 10
  keepalive: true
`;

export const configCommand = new Command('config')
  .description('Show or initialize swarm configuration')
  .option('--init', 'Create example configuration file')
  .option('--path', 'Show configuration file path')
  .action(async (options) => {
    try {
      if (options.path) {
        console.log(getConfigPath());
        return;
      }

      if (options.init) {
        const configPath = getConfigPath();
        
        if (configExists()) {
          console.error(`Config already exists: ${configPath}`);
          console.error('Delete it first if you want to reinitialize.');
          process.exit(1);
        }

        ensureConfigDir();
        fs.writeFileSync(configPath, EXAMPLE_CONFIG, 'utf-8');
        console.log(`Created config: ${configPath}`);
        console.log('\nEdit the file to match your swarm topology.');
        return;
      }

      // Default: show current config
      if (!configExists()) {
        console.error(`Config not found: ${getConfigPath()}`);
        console.error("Run 'navaris swarm config --init' to create one.");
        process.exit(1);
      }

      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });
