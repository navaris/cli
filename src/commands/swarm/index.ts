/**
 * navaris swarm
 * Swarm monitoring and management commands
 */

import { Command } from 'commander';
import { statusCommand } from './status.js';
import { servicesCommand } from './services.js';
import { agentsCommand } from './agents.js';
import { nodesCommand } from './nodes.js';
import { healthCommand } from './health.js';
import { configCommand } from './config.js';

export const swarmCommand = new Command('swarm')
  .description('Swarm monitoring and management')
  .addCommand(statusCommand)
  .addCommand(servicesCommand)
  .addCommand(agentsCommand)
  .addCommand(nodesCommand)
  .addCommand(healthCommand)
  .addCommand(configCommand);
