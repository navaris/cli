/**
 * navaris swarm health
 * Quick health check with exit codes for scripting
 * 
 * Exit codes:
 *   0 = healthy
 *   1 = degraded (some issues but operational)
 *   2 = critical (major failures)
 */

import { Command } from 'commander';
import { loadConfig } from '../../lib/config.js';
import { probeSwarm } from '../../lib/probes/index.js';
import { closeAllConnections } from '../../lib/ssh.js';
import { renderHealthTUI } from '../../lib/renderers/tui.js';
import { renderHealthJSON } from '../../lib/renderers/json.js';
import { renderHealthMarkdown } from '../../lib/renderers/markdown.js';

export const healthCommand = new Command('health')
  .description('Quick health check (exit code: 0=healthy, 1=degraded, 2=critical)')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output as Markdown')
  .option('--quiet', 'Suppress output, only set exit code')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const status = await probeSwarm(config);

      // Determine severity
      const downServices = status.services.filter((s) => s.status === 'down');
      const downNodes = status.nodes.filter(
        (n) => n.status === 'down' && n.type !== 'storage'
      );
      
      const isCritical = downNodes.length > 0 || downServices.length >= 2;
      const isDegraded = !status.healthy;

      if (!options.quiet) {
        if (options.json) {
          console.log(renderHealthJSON(status));
        } else if (options.markdown) {
          console.log(renderHealthMarkdown(status));
        } else {
          renderHealthTUI(status);
        }
      }

      // Set exit code
      if (isCritical) {
        process.exit(2);
      } else if (isDegraded) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    } catch (err) {
      if (!options.quiet) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
      }
      process.exit(2);
    } finally {
      closeAllConnections();
    }
  });
