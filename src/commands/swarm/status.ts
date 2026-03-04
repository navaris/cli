/**
 * navaris swarm status
 * Display full swarm dashboard
 */

import { Command } from 'commander';
import { loadConfig } from '../../lib/config.js';
import { probeSwarm } from '../../lib/probes/index.js';
import { closeAllConnections } from '../../lib/ssh.js';
import { renderTUI } from '../../lib/renderers/tui.js';
import { renderJSON } from '../../lib/renderers/json.js';
import { renderMarkdown } from '../../lib/renderers/markdown.js';

export const statusCommand = new Command('status')
  .description('Display swarm status dashboard')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output as Markdown (for Telegram)')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const status = await probeSwarm(config);

      if (options.json) {
        console.log(renderJSON(status));
      } else if (options.markdown) {
        console.log(renderMarkdown(status));
      } else {
        renderTUI(status);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    } finally {
      closeAllConnections();
    }
  });
