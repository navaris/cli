/**
 * Terminal UI renderer using Ink (React for CLI)
 */

import React from 'react';
import { render, Box, Text, Newline } from 'ink';
import type { SwarmStatus, ServiceProbeResult, AgentProbeResult, NodeProbeResult } from '../../types/probes.js';

const STATUS_COLORS = {
  ok: 'green',
  degraded: 'yellow',
  down: 'red',
  unknown: 'gray',
  active: 'green',
  idle: 'gray',
  stopped: 'red',
} as const;

const STATUS_SYMBOLS = {
  ok: '●',
  degraded: '◐',
  down: '○',
  unknown: '?',
  active: '●',
  idle: '○',
  stopped: '○',
} as const;

interface HeaderProps {
  title: string;
  healthy?: boolean;
  timestamp: number;
}

function Header({ title, healthy, timestamp }: HeaderProps) {
  const date = new Date(timestamp).toLocaleString();
  const healthIndicator = healthy !== undefined 
    ? (healthy ? '✓' : '!')
    : '';
  const healthColor = healthy ? 'green' : 'yellow';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">{title}</Text>
        {healthIndicator && (
          <Text color={healthColor}> [{healthIndicator}]</Text>
        )}
        <Text color="gray"> — {date}</Text>
      </Box>
      <Box>
        <Text color="gray">{'─'.repeat(60)}</Text>
      </Box>
    </Box>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="white">{title}</Text>
      <Box flexDirection="column" marginLeft={2}>
        {children}
      </Box>
    </Box>
  );
}

interface ServiceRowProps {
  service: ServiceProbeResult;
}

function ServiceRow({ service }: ServiceRowProps) {
  const color = STATUS_COLORS[service.status];
  const symbol = STATUS_SYMBOLS[service.status];

  return (
    <Box>
      <Text color={color}>{symbol}</Text>
      <Text> </Text>
      <Text>{service.id.padEnd(24)}</Text>
      <Text color={color}>{service.status.toUpperCase().padEnd(8)}</Text>
      <Text color="gray">{service.message || ''}</Text>
    </Box>
  );
}

interface AgentRowProps {
  agent: AgentProbeResult;
}

function AgentRow({ agent }: AgentRowProps) {
  const color = STATUS_COLORS[agent.status];
  const symbol = STATUS_SYMBOLS[agent.status];
  const emoji = agent.emoji || '';

  return (
    <Box>
      <Text color={color}>{symbol}</Text>
      <Text> </Text>
      <Text>{emoji}{agent.name.padEnd(20 - emoji.length)}</Text>
      <Text color={color}>{agent.status.toUpperCase().padEnd(8)}</Text>
      <Text color="gray">{agent.task || ''}</Text>
      {agent.repo && <Text color="gray"> [{agent.repo}]</Text>}
      {agent.runtime && <Text color="gray"> ({agent.runtime})</Text>}
    </Box>
  );
}

interface NodeRowProps {
  node: NodeProbeResult;
}

function NodeRow({ node }: NodeRowProps) {
  const color = STATUS_COLORS[node.status];
  const symbol = STATUS_SYMBOLS[node.status];
  
  const role = node.role ? ` (${node.role})` : '';
  const name = `${node.id}${role}`.padEnd(28);

  if (node.status === 'down') {
    return (
      <Box>
        <Text color={color}>{symbol}</Text>
        <Text> </Text>
        <Text>{name}</Text>
        <Text color={color}>OFFLINE</Text>
        {node.error && <Text color="gray"> — {node.error}</Text>}
      </Box>
    );
  }

  const cpu = node.metrics?.cpuPercent !== undefined
    ? `CPU ${node.metrics.cpuPercent.toString().padStart(3)}%`
    : '';
  const mem = node.metrics?.memoryUsedGB !== undefined
    ? `RAM ${node.metrics.memoryUsedGB}GB`
    : '';
  const uptime = node.metrics?.uptime || '';

  return (
    <Box>
      <Text color={color}>{symbol}</Text>
      <Text> </Text>
      <Text>{name}</Text>
      <Text color={color}>{node.status.toUpperCase().padEnd(8)}</Text>
      <Text color="cyan">{cpu.padEnd(10)}</Text>
      <Text color="magenta">{mem.padEnd(12)}</Text>
      <Text color="gray">{uptime}</Text>
    </Box>
  );
}

interface SwarmDashboardProps {
  status: SwarmStatus;
}

function SwarmDashboard({ status }: SwarmDashboardProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header 
        title="NAVARIS SWARM" 
        healthy={status.healthy}
        timestamp={status.timestamp}
      />

      {status.services.length > 0 && (
        <Section title="SERVICES">
          {status.services.map((service) => (
            <ServiceRow key={service.id} service={service} />
          ))}
        </Section>
      )}

      {status.agents.length > 0 && (
        <Section title="AGENTS">
          {status.agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </Section>
      )}

      {status.nodes.length > 0 && (
        <Section title="NODES">
          {status.nodes.map((node) => (
            <NodeRow key={node.id} node={node} />
          ))}
        </Section>
      )}

      <Box marginTop={1}>
        <Text color="gray">Press Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
}

interface ServicesViewProps {
  services: ServiceProbeResult[];
}

function ServicesView({ services }: ServicesViewProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="SERVICES" timestamp={Date.now()} />
      {services.map((service) => (
        <ServiceRow key={service.id} service={service} />
      ))}
    </Box>
  );
}

interface AgentsViewProps {
  agents: AgentProbeResult[];
}

function AgentsView({ agents }: AgentsViewProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="AGENTS" timestamp={Date.now()} />
      {agents.map((agent) => (
        <AgentRow key={agent.id} agent={agent} />
      ))}
    </Box>
  );
}

interface NodesViewProps {
  nodes: NodeProbeResult[];
}

function NodesView({ nodes }: NodesViewProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header title="NODES" timestamp={Date.now()} />
      {nodes.map((node) => (
        <NodeRow key={node.id} node={node} />
      ))}
    </Box>
  );
}

interface HealthViewProps {
  status: SwarmStatus;
}

function HealthView({ status }: HealthViewProps) {
  const icon = status.healthy ? '✓' : '!';
  const color = status.healthy ? 'green' : 'yellow';
  const text = status.healthy ? 'HEALTHY' : 'DEGRADED';

  const servicesOk = status.services.filter((s) => s.status === 'ok').length;
  const nodesOk = status.nodes.filter((n) => n.status === 'ok').length;
  const agentsActive = status.agents.filter((a) => a.status === 'active').length;

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text color={color} bold>{icon} Swarm {text}</Text>
      </Box>
      <Newline />
      <Text>Services: {servicesOk}/{status.services.length} OK</Text>
      <Text>Nodes: {nodesOk}/{status.nodes.length} OK</Text>
      <Text>Agents: {agentsActive}/{status.agents.length} active</Text>
    </Box>
  );
}

/**
 * Render the full swarm dashboard
 */
export function renderTUI(status: SwarmStatus): void {
  render(<SwarmDashboard status={status} />);
}

/**
 * Render services view
 */
export function renderServicesTUI(services: ServiceProbeResult[]): void {
  render(<ServicesView services={services} />);
}

/**
 * Render agents view
 */
export function renderAgentsTUI(agents: AgentProbeResult[]): void {
  render(<AgentsView agents={agents} />);
}

/**
 * Render nodes view
 */
export function renderNodesTUI(nodes: NodeProbeResult[]): void {
  render(<NodesView nodes={nodes} />);
}

/**
 * Render health view
 */
export function renderHealthTUI(status: SwarmStatus): void {
  render(<HealthView status={status} />);
}
