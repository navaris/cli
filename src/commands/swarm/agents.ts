/**
 * navaris swarm agents
 * Display agent status
 */

import { Command } from 'commander';
import { loadConfig } from '../../lib/config.js';
import { probeAllAgents } from '../../lib/probes/index.js';
import { closeAllConnections } from '../../lib/ssh.js';
import { renderAgentsTUI } from '../../lib/renderers/tui.js';
import { renderAgentsJSON } from '../../lib/renderers/json.js';
import { renderAgentsMarkdown } from '../../lib/renderers/markdown.js';

export const agentsCommand = new Command('agents')
  .description('Display agent status')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output as Markdown')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const agents = await probeAllAgents(config);

      if (options.json) {
        console.log(renderAgentsJSON(agents));
      } else if (options.markdown) {
        console.log(renderAgentsMarkdown(agents));
      } else {
        renderAgentsTUI(agents);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    } finally {
      closeAllConnections();
    }
  });
