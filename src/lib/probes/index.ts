/**
 * Probe orchestrator
 * Coordinates all probes and aggregates results
 */

import type { SwarmConfig } from '../../types/config.js';
import type { SwarmStatus } from '../../types/probes.js';
import { probeAllServices } from './service.js';
import { probeAllAgents } from './agent.js';
import { probeAllNodes } from './node.js';

export { probeAllServices } from './service.js';
export { probeAllAgents } from './agent.js';
export { probeAllNodes } from './node.js';

/**
 * Run all probes and return aggregated swarm status
 */
export async function probeSwarm(config: SwarmConfig): Promise<SwarmStatus> {
  const timestamp = Date.now();

  // Run all probes in parallel for efficiency
  const [services, agents, nodes] = await Promise.all([
    probeAllServices(config),
    probeAllAgents(config),
    probeAllNodes(config),
  ]);

  // Determine overall health
  const hasDownServices = services.some((s) => s.status === 'down');
  const hasDownNodes = nodes.some((n) => n.status === 'down' && n.type !== 'storage');
  const healthy = !hasDownServices && !hasDownNodes;

  return {
    timestamp,
    orchestrator: config.orchestrator.node,
    services,
    agents,
    nodes,
    healthy,
  };
}
