/**
 * Service health probes
 */

import type { SwarmConfig, ServiceConfig, NodeConfig } from '../../types/config.js';
import type { ServiceProbeResult, ProbeStatus } from '../../types/probes.js';
import { exec, execWithPath, testConnection } from '../ssh.js';

/**
 * Check if a process is running
 */
async function checkProcess(
  node: NodeConfig,
  processName: string,
  sshConfig: SwarmConfig['ssh']
): Promise<ServiceProbeResult> {
  try {
    const result = await exec(node, `pgrep -f "${processName}"`, sshConfig);
    const pids = result.stdout.trim().split('\n').filter(Boolean);
    
    if (pids.length > 0) {
      return {
        id: processName,
        status: 'ok',
        message: `PID ${pids[0]}`,
        details: { pids },
        checkedAt: Date.now(),
      };
    }
    
    return {
      id: processName,
      status: 'down',
      message: 'Process not running',
      checkedAt: Date.now(),
    };
  } catch (err) {
    return {
      id: processName,
      status: 'unknown',
      message: `Probe failed: ${err}`,
      checkedAt: Date.now(),
    };
  }
}

/**
 * Check if a mount point is mounted
 */
async function checkMount(
  node: NodeConfig,
  mountPath: string,
  sshConfig: SwarmConfig['ssh']
): Promise<ServiceProbeResult> {
  try {
    // Check if path exists and is a mount point
    const result = await exec(
      node,
      `test -d "${mountPath}" && mount | grep -q "${mountPath}" && echo "mounted" || echo "not_mounted"`,
      sshConfig
    );
    
    const isMounted = result.stdout.trim() === 'mounted';
    
    return {
      id: mountPath,
      status: isMounted ? 'ok' : 'down',
      message: isMounted ? 'Mounted' : 'Not mounted',
      details: { path: mountPath },
      checkedAt: Date.now(),
    };
  } catch (err) {
    return {
      id: mountPath,
      status: 'unknown',
      message: `Probe failed: ${err}`,
      checkedAt: Date.now(),
    };
  }
}

/**
 * Check OpenClaw health
 */
async function checkOpenClaw(
  node: NodeConfig,
  channel: string | undefined,
  sshConfig: SwarmConfig['ssh']
): Promise<ServiceProbeResult> {
  try {
    const result = await execWithPath(node, 'openclaw health --json', sshConfig);
    
    if (result.code !== 0) {
      return {
        id: 'openclaw',
        status: 'down',
        message: 'OpenClaw health check failed',
        checkedAt: Date.now(),
      };
    }

    const health = JSON.parse(result.stdout);
    
    // If checking a specific channel
    if (channel && health.channels?.[channel]) {
      const channelHealth = health.channels[channel];
      const isOk = channelHealth.probe?.ok ?? false;
      
      return {
        id: `openclaw-${channel}`,
        status: isOk ? 'ok' : 'degraded',
        message: isOk 
          ? `@${channelHealth.probe?.bot?.username ?? channel}`
          : 'Channel probe failed',
        details: channelHealth,
        checkedAt: Date.now(),
      };
    }

    // General OpenClaw health
    return {
      id: 'openclaw',
      status: health.ok ? 'ok' : 'degraded',
      message: health.ok ? 'Healthy' : 'Degraded',
      details: { 
        agents: health.agents?.map((a: { agentId: string }) => a.agentId),
        channels: health.channelOrder,
      },
      checkedAt: Date.now(),
    };
  } catch (err) {
    return {
      id: 'openclaw',
      status: 'unknown',
      message: `Probe failed: ${err}`,
      checkedAt: Date.now(),
    };
  }
}

/**
 * Check if a node is reachable via ping/SSH
 */
async function checkPing(
  node: NodeConfig,
  sshConfig: SwarmConfig['ssh']
): Promise<ServiceProbeResult> {
  try {
    const isReachable = await testConnection(node, sshConfig);
    
    return {
      id: node.host,
      status: isReachable ? 'ok' : 'down',
      message: isReachable ? 'Reachable' : 'Unreachable',
      checkedAt: Date.now(),
    };
  } catch (err) {
    return {
      id: node.host,
      status: 'down',
      message: `Unreachable: ${err}`,
      checkedAt: Date.now(),
    };
  }
}

/**
 * Probe a single service
 */
export async function probeService(
  serviceId: string,
  service: ServiceConfig,
  nodes: Record<string, NodeConfig>,
  sshConfig: SwarmConfig['ssh']
): Promise<ServiceProbeResult> {
  const node = nodes[service.node];
  if (!node) {
    return {
      id: serviceId,
      status: 'unknown',
      message: `Node '${service.node}' not found`,
      checkedAt: Date.now(),
    };
  }

  let result: ServiceProbeResult;

  switch (service.check) {
    case 'process':
      if (!service.process) {
        return {
          id: serviceId,
          status: 'unknown',
          message: 'No process name specified',
          checkedAt: Date.now(),
        };
      }
      result = await checkProcess(node, service.process, sshConfig);
      result.id = serviceId;
      return result;

    case 'mount':
      if (!service.path) {
        return {
          id: serviceId,
          status: 'unknown',
          message: 'No mount path specified',
          checkedAt: Date.now(),
        };
      }
      result = await checkMount(node, service.path, sshConfig);
      result.id = serviceId;
      return result;

    case 'openclaw':
      result = await checkOpenClaw(node, service.channel, sshConfig);
      result.id = serviceId;
      return result;

    case 'ping':
      result = await checkPing(node, sshConfig);
      result.id = serviceId;
      return result;

    default:
      return {
        id: serviceId,
        status: 'unknown',
        message: `Unknown check type: ${service.check}`,
        checkedAt: Date.now(),
      };
  }
}

/**
 * Probe all services
 */
export async function probeAllServices(
  config: SwarmConfig
): Promise<ServiceProbeResult[]> {
  if (!config.services) return [];

  const results = await Promise.all(
    Object.entries(config.services).map(([id, service]) =>
      probeService(id, service, config.nodes, config.ssh)
    )
  );

  return results;
}
