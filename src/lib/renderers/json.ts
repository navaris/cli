/**
 * JSON renderer
 * Outputs swarm status as structured JSON
 */

import type { SwarmStatus, ServiceProbeResult, AgentProbeResult, NodeProbeResult } from '../../types/probes.js';

/**
 * Render full swarm status as JSON
 */
export function renderJSON(status: SwarmStatus): string {
  return JSON.stringify(status, null, 2);
}

/**
 * Render services as JSON
 */
export function renderServicesJSON(services: ServiceProbeResult[]): string {
  return JSON.stringify({ services, timestamp: Date.now() }, null, 2);
}

/**
 * Render agents as JSON
 */
export function renderAgentsJSON(agents: AgentProbeResult[]): string {
  return JSON.stringify({ agents, timestamp: Date.now() }, null, 2);
}

/**
 * Render nodes as JSON
 */
export function renderNodesJSON(nodes: NodeProbeResult[]): string {
  return JSON.stringify({ nodes, timestamp: Date.now() }, null, 2);
}

/**
 * Render health check as JSON
 */
export function renderHealthJSON(status: SwarmStatus): string {
  return JSON.stringify({
    healthy: status.healthy,
    timestamp: status.timestamp,
    summary: {
      services: {
        total: status.services.length,
        ok: status.services.filter((s) => s.status === 'ok').length,
        down: status.services.filter((s) => s.status === 'down').length,
      },
      agents: {
        total: status.agents.length,
        active: status.agents.filter((a) => a.status === 'active').length,
      },
      nodes: {
        total: status.nodes.length,
        ok: status.nodes.filter((n) => n.status === 'ok').length,
        down: status.nodes.filter((n) => n.status === 'down').length,
      },
    },
  }, null, 2);
}
