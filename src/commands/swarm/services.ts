/**
 * navaris swarm services
 * Display service health status
 */

import { Command } from 'commander';
import { loadConfig } from '../../lib/config.js';
import { probeAllServices } from '../../lib/probes/index.js';
import { closeAllConnections } from '../../lib/ssh.js';
import { renderServicesTUI } from '../../lib/renderers/tui.js';
import { renderServicesJSON } from '../../lib/renderers/json.js';
import { renderServicesMarkdown } from '../../lib/renderers/markdown.js';

export const servicesCommand = new Command('services')
  .description('Display service health status')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output as Markdown')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const services = await probeAllServices(config);

      if (options.json) {
        console.log(renderServicesJSON(services));
      } else if (options.markdown) {
        console.log(renderServicesMarkdown(services));
      } else {
        renderServicesTUI(services);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    } finally {
      closeAllConnections();
    }
  });
