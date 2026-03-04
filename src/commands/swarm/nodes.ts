/**
 * navaris swarm nodes
 * Display node metrics
 */

import { Command } from 'commander';
import { loadConfig } from '../../lib/config.js';
import { probeAllNodes } from '../../lib/probes/index.js';
import { closeAllConnections } from '../../lib/ssh.js';
import { renderNodesTUI } from '../../lib/renderers/tui.js';
import { renderNodesJSON } from '../../lib/renderers/json.js';
import { renderNodesMarkdown } from '../../lib/renderers/markdown.js';

export const nodesCommand = new Command('nodes')
  .description('Display node metrics')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output as Markdown')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const nodes = await probeAllNodes(config);

      if (options.json) {
        console.log(renderNodesJSON(nodes));
      } else if (options.markdown) {
        console.log(renderNodesMarkdown(nodes));
      } else {
        renderNodesTUI(nodes);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    } finally {
      closeAllConnections();
    }
  });
