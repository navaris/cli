/**
 * Probe result types
 */

export type ProbeStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export interface ServiceProbeResult {
  id: string;
  status: ProbeStatus;
  message?: string;
  details?: Record<string, unknown>;
  checkedAt: number;
}

export interface AgentProbeResult {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'stopped';
  task?: string;
  repo?: string;
  runtime?: string;
  isDefault?: boolean;
  emoji?: string;
}

export interface NodeProbeResult {
  id: string;
  status: ProbeStatus;
  type: 'orchestrator' | 'worker' | 'storage';
  role?: string;
  metrics?: {
    cpuPercent?: number;
    memoryUsedGB?: number;
    memoryTotalGB?: number;
    uptime?: string;
  };
  error?: string;
  checkedAt: number;
}

export interface SwarmStatus {
  timestamp: number;
  orchestrator: string;
  services: ServiceProbeResult[];
  agents: AgentProbeResult[];
  nodes: NodeProbeResult[];
  healthy: boolean;
}
