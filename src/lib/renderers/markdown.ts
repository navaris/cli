/**
 * Markdown renderer
 * Outputs swarm status as Telegram-compatible Markdown
 */

import type { SwarmStatus, ServiceProbeResult, AgentProbeResult, NodeProbeResult } from '../../types/probes.js';

const STATUS_ICONS = {
  ok: '✅',
  degraded: '⚠️',
  down: '❌',
  unknown: '❓',
  active: '🟢',
  idle: '⚪',
  stopped: '🔴',
} as const;

/**
 * Format uptime for display
 */
function formatUptime(uptime?: string): string {
  if (!uptime) return '';
  return uptime;
}

/**
 * Format memory for display
 */
function formatMemory(used?: number, total?: number): string {
  if (used === undefined) return '';
  if (total !== undefined) {
    return `${used}/${total}GB`;
  }
  return `${used}GB`;
}

/**
 * Render full swarm status as Markdown
 */
export function renderMarkdown(status: SwarmStatus): string {
  const lines: string[] = [];
  
  // Header
  const healthIcon = status.healthy ? '✅' : '⚠️';
  lines.push(`*Swarm Status* ${healthIcon}`);
  lines.push('');

  // Services (priority 1)
  if (status.services.length > 0) {
    lines.push('*Services*');
    for (const service of status.services) {
      const icon = STATUS_ICONS[service.status];
      const message = service.message ? ` — ${service.message}` : '';
      lines.push(`${icon} ${service.id}${message}`);
    }
    lines.push('');
  }

  // Agents (priority 2)
  if (status.agents.length > 0) {
    lines.push('*Agents*');
    for (const agent of status.agents) {
      const icon = STATUS_ICONS[agent.status];
      const emoji = agent.emoji ? `${agent.emoji} ` : '';
      const task = agent.task ? ` — ${agent.task}` : '';
      const runtime = agent.runtime ? ` (${agent.runtime})` : '';
      const repo = agent.repo ? ` [${agent.repo}]` : '';
      lines.push(`${icon} ${emoji}${agent.name}${task}${repo}${runtime}`);
    }
    lines.push('');
  }

  // Nodes (priority 3)
  if (status.nodes.length > 0) {
    lines.push('*Nodes*');
    for (const node of status.nodes) {
      const icon = STATUS_ICONS[node.status];
      const role = node.role ? ` (${node.role})` : '';
      
      if (node.status === 'down') {
        lines.push(`${icon} ${node.id}${role} — ${node.error || 'Offline'}`);
      } else if (node.type === 'storage') {
        lines.push(`${icon} ${node.id}${role}`);
      } else {
        const cpu = node.metrics?.cpuPercent !== undefined 
          ? `CPU ${node.metrics.cpuPercent}%` 
          : '';
        const mem = formatMemory(node.metrics?.memoryUsedGB, node.metrics?.memoryTotalGB);
        const uptime = formatUptime(node.metrics?.uptime);
        
        const metrics = [cpu, mem ? `RAM ${mem}` : '', uptime]
          .filter(Boolean)
          .join(' | ');
        
        lines.push(`${icon} ${node.id}${role}${metrics ? ` — ${metrics}` : ''}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Render services as Markdown
 */
export function renderServicesMarkdown(services: ServiceProbeResult[]): string {
  const lines: string[] = ['*Services*', ''];
  
  for (const service of services) {
    const icon = STATUS_ICONS[service.status];
    const message = service.message ? ` — ${service.message}` : '';
    lines.push(`${icon} ${service.id}${message}`);
  }
  
  return lines.join('\n');
}

/**
 * Render agents as Markdown
 */
export function renderAgentsMarkdown(agents: AgentProbeResult[]): string {
  const lines: string[] = ['*Agents*', ''];
  
  for (const agent of agents) {
    const icon = STATUS_ICONS[agent.status];
    const emoji = agent.emoji ? `${agent.emoji} ` : '';
    const task = agent.task ? ` — ${agent.task}` : '';
    const runtime = agent.runtime ? ` (${agent.runtime})` : '';
    lines.push(`${icon} ${emoji}${agent.name}${task}${runtime}`);
  }
  
  return lines.join('\n');
}

/**
 * Render nodes as Markdown
 */
export function renderNodesMarkdown(nodes: NodeProbeResult[]): string {
  const lines: string[] = ['*Nodes*', ''];
  
  for (const node of nodes) {
    const icon = STATUS_ICONS[node.status];
    const role = node.role ? ` (${node.role})` : '';
    
    if (node.status === 'down') {
      lines.push(`${icon} ${node.id}${role} — Offline`);
    } else {
      const cpu = node.metrics?.cpuPercent !== undefined 
        ? `CPU ${node.metrics.cpuPercent}%` 
        : '';
      const mem = formatMemory(node.metrics?.memoryUsedGB);
      const metrics = [cpu, mem ? `RAM ${mem}` : ''].filter(Boolean).join(' | ');
      
      lines.push(`${icon} ${node.id}${role}${metrics ? ` — ${metrics}` : ''}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Render health summary as Markdown
 */
export function renderHealthMarkdown(status: SwarmStatus): string {
  const icon = status.healthy ? '✅' : '⚠️';
  const healthText = status.healthy ? 'Healthy' : 'Degraded';
  
  const servicesOk = status.services.filter((s) => s.status === 'ok').length;
  const servicesDown = status.services.filter((s) => s.status === 'down');
  const servicesTotal = status.services.length;
  
  const nodesOk = status.nodes.filter((n) => n.status === 'ok').length;
  const nodesDown = status.nodes.filter((n) => n.status === 'down');
  const nodesTotal = status.nodes.length;
  
  const agentsActive = status.agents.filter((a) => a.status === 'active').length;
  const agentsTotal = status.agents.length;
  
  const lines = [
    `${icon} *Swarm ${healthText}*`,
    '',
    `Services: ${servicesOk}/${servicesTotal} OK`,
    `Nodes: ${nodesOk}/${nodesTotal} OK`,
    `Agents: ${agentsActive}/${agentsTotal} active`,
  ];

  // Show what's down
  if (servicesDown.length > 0) {
    lines.push('');
    lines.push('*Down:*');
    for (const s of servicesDown) {
      lines.push(`❌ ${s.id}${s.message ? ` — ${s.message}` : ''}`);
    }
  }

  if (nodesDown.length > 0) {
    if (servicesDown.length === 0) {
      lines.push('');
      lines.push('*Down:*');
    }
    for (const n of nodesDown) {
      lines.push(`❌ ${n.id}${n.error ? ` — ${n.error}` : ''}`);
    }
  }
  
  return lines.join('\n');
}
