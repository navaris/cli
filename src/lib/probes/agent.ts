/**
 * Agent probes
 * Queries OpenClaw for agent status and swarm agent processes
 */

import type { SwarmConfig, NodeConfig } from '../../types/config.js';
import type { AgentProbeResult } from '../../types/probes.js';
import { exec, execWithPath } from '../ssh.js';
import { getOrchestratorNode } from '../config.js';

interface OpenClawAgent {
  id: string;
  name: string;
  identityEmoji?: string;
  isDefault?: boolean;
  model?: string;
}

interface SwarmAgentEntry {
  session: string;
  repo: string;
  branch: string;
  task: string;
  agent: string;
  started: string;
}

/**
 * Get OpenClaw agents from the gateway
 */
async function getOpenClawAgents(
  node: NodeConfig,
  nodeName: string,
  sshConfig: SwarmConfig['ssh']
): Promise<AgentProbeResult[]> {
  try {
    const result = await execWithPath(node, nodeName, 'openclaw agents list --json', sshConfig);
    
    if (result.code !== 0) {
      return [];
    }

    const agents: OpenClawAgent[] = JSON.parse(result.stdout);
    
    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: 'active' as const,
      task: 'listening',
      isDefault: agent.isDefault,
      emoji: agent.identityEmoji,
    }));
  } catch {
    return [];
  }
}

/**
 * Get swarm agents (spawned via spawn-agent.sh)
 */
async function getSwarmAgents(
  node: NodeConfig,
  nodeName: string,
  sshConfig: SwarmConfig['ssh']
): Promise<AgentProbeResult[]> {
  try {
    // Read active.jsonl
    const result = await exec(
      node,
      nodeName,
      'cat ~/swarm/agents/active.jsonl 2>/dev/null || echo ""',
      sshConfig
    );

    if (!result.stdout.trim()) {
      return [];
    }

    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const agents: AgentProbeResult[] = [];

    for (const line of lines) {
      try {
        const entry: SwarmAgentEntry = JSON.parse(line);
        
        // Check if the agent process is still running
        const pidFile = `~/swarm/agents/${entry.session}.pid`;
        const pidResult = await exec(
          node,
          nodeName,
          `cat ${pidFile} 2>/dev/null && ps -p $(cat ${pidFile} 2>/dev/null) -o pid= 2>/dev/null || echo ""`,
          sshConfig
        );
        
        const isRunning = pidResult.stdout.trim().length > 0;
        
        if (isRunning) {
          // Calculate runtime
          const startedAt = new Date(entry.started).getTime();
          const runtime = formatRuntime(Date.now() - startedAt);
          
          agents.push({
            id: entry.session,
            name: entry.agent,
            status: 'active',
            task: entry.task.substring(0, 50) + (entry.task.length > 50 ? '...' : ''),
            repo: entry.repo,
            runtime,
          });
        }
      } catch {
        // Skip invalid lines
      }
    }

    return agents;
  } catch {
    return [];
  }
}

/**
 * Format runtime duration
 */
function formatRuntime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Probe all agents
 */
export async function probeAllAgents(
  config: SwarmConfig
): Promise<AgentProbeResult[]> {
  const orchestratorName = config.orchestrator.node;
  const orchestrator = config.nodes[orchestratorName];
  
  const [openClawAgents, swarmAgents] = await Promise.all([
    getOpenClawAgents(orchestrator, orchestratorName, config.ssh),
    getSwarmAgents(orchestrator, orchestratorName, config.ssh),
  ]);

  return [...openClawAgents, ...swarmAgents];
}
