#!/usr/bin/env node
/**
 * Navaris CLI
 * 
 * A unified command-line interface for Navaris Labs infrastructure
 * and swarm management.
 */

import { Command } from 'commander';
import { swarmCommand } from './commands/swarm/index.js';

const program = new Command();

program
  .name('navaris')
  .description('Navaris CLI - Infrastructure and swarm management tools')
  .version('0.1.0');

// Add command groups
program.addCommand(swarmCommand);

// Parse arguments
program.parse();
