/**
 * Node probes
 * Gather metrics from cluster nodes (CPU, RAM, uptime)
 */

import type { SwarmConfig, NodeConfig } from '../../types/config.js';
import type { NodeProbeResult } from '../../types/probes.js';
import { exec, testConnection } from '../ssh.js';

/**
 * Parse macOS CPU usage from top output
 */
function parseMacOSCpu(output: string): number | undefined {
  // Example: "CPU usage: 12.34% user, 5.67% sys, 81.99% idle"
  const match = output.match(/CPU usage:\s*([\d.]+)%\s*user,\s*([\d.]+)%\s*sys/);
  if (match) {
    const user = parseFloat(match[1]);
    const sys = parseFloat(match[2]);
    return Math.round(user + sys);
  }
  return undefined;
}

/**
 * Parse Linux CPU usage from /proc/stat
 */
function parseLinuxCpu(output: string): number | undefined {
  // This is a simplified approach - for accurate CPU we'd need two samples
  // For now, just return idle percentage inverted
  const match = output.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (match) {
    const user = parseInt(match[1]);
    const nice = parseInt(match[2]);
    const system = parseInt(match[3]);
    const idle = parseInt(match[4]);
    const total = user + nice + system + idle;
    return Math.round(((total - idle) / total) * 100);
  }
  return undefined;
}

/**
 * Parse macOS memory from vm_stat
 */
function parseMacOSMemory(output: string): { used: number; total: number } | undefined {
  // Get page size and page counts
  const pageSize = 16384; // Default page size on Apple Silicon
  const freeMatch = output.match(/Pages free:\s*(\d+)/);
  const activeMatch = output.match(/Pages active:\s*(\d+)/);
  const inactiveMatch = output.match(/Pages inactive:\s*(\d+)/);
  const wiredMatch = output.match(/Pages wired down:\s*(\d+)/);
  const compressedMatch = output.match(/Pages occupied by compressor:\s*(\d+)/);
  
  if (activeMatch && wiredMatch) {
    const active = parseInt(activeMatch[1]) * pageSize;
    const wired = parseInt(wiredMatch[1]) * pageSize;
    const compressed = compressedMatch ? parseInt(compressedMatch[1]) * pageSize : 0;
    const free = freeMatch ? parseInt(freeMatch[1]) * pageSize : 0;
    const inactive = inactiveMatch ? parseInt(inactiveMatch[1]) * pageSize : 0;
    
    const used = active + wired + compressed;
    const total = used + free + inactive;
    
    return {
      used: used / (1024 * 1024 * 1024), // Convert to GB
      total: total / (1024 * 1024 * 1024),
    };
  }
  return undefined;
}

/**
 * Parse Linux memory from free -m
 */
function parseLinuxMemory(output: string): { used: number; total: number } | undefined {
  // Example: "Mem:           7851        1234        5678..."
  const match = output.match(/Mem:\s+(\d+)\s+(\d+)/);
  if (match) {
    return {
      total: parseInt(match[1]) / 1024, // Convert MB to GB
      used: parseInt(match[2]) / 1024,
    };
  }
  return undefined;
}

/**
 * Parse uptime output
 */
function parseUptime(output: string): string {
  // Example: " 12:34:56 up 3 days, 14:23, ..."
  const match = output.match(/up\s+(.+?),\s+\d+\s+user/);
  if (match) {
    return match[1].trim();
  }
  // Simpler format
  const simpleMatch = output.match(/up\s+(.+?)(?:,|$)/);
  if (simpleMatch) {
    return simpleMatch[1].trim();
  }
  return 'unknown';
}

/**
 * Detect OS type (macOS or Linux)
 */
async function detectOS(
  node: NodeConfig,
  nodeName: string,
  sshConfig: SwarmConfig['ssh']
): Promise<'macos' | 'linux' | 'unknown'> {
  try {
    const result = await exec(node, nodeName, 'uname -s', sshConfig);
    const os = result.stdout.trim().toLowerCase();
    if (os === 'darwin') return 'macos';
    if (os === 'linux') return 'linux';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Probe a single node
 */
export async function probeNode(
  nodeId: string,
  node: NodeConfig,
  sshConfig: SwarmConfig['ssh']
): Promise<NodeProbeResult> {
  const checkedAt = Date.now();

  // First check if node is reachable
  const isReachable = await testConnection(node, nodeId, sshConfig);
  
  if (!isReachable) {
    return {
      id: nodeId,
      status: 'down',
      type: node.type,
      role: node.role,
      error: 'Unreachable',
      checkedAt,
    };
  }

  // For storage nodes, just return reachable status
  if (node.type === 'storage' || node.probe === 'ping') {
    return {
      id: nodeId,
      status: 'ok',
      type: node.type,
      role: node.role,
      checkedAt,
    };
  }

  try {
    const os = await detectOS(node, nodeId, sshConfig);
    
    let cpuPercent: number | undefined;
    let memoryUsedGB: number | undefined;
    let memoryTotalGB: number | undefined;
    let uptime: string | undefined;

    if (os === 'macos') {
      // macOS metrics
      const [cpuResult, memResult, uptimeResult] = await Promise.all([
        exec(node, nodeId, 'top -l 1 -n 0 | grep "CPU usage"', sshConfig),
        exec(node, nodeId, 'vm_stat', sshConfig),
        exec(node, nodeId, 'uptime', sshConfig),
      ]);
      
      cpuPercent = parseMacOSCpu(cpuResult.stdout);
      const mem = parseMacOSMemory(memResult.stdout);
      if (mem) {
        memoryUsedGB = mem.used;
        memoryTotalGB = mem.total;
      }
      uptime = parseUptime(uptimeResult.stdout);
      
    } else if (os === 'linux') {
      // Linux metrics (Pi nodes)
      const [cpuResult, memResult, uptimeResult] = await Promise.all([
        exec(node, nodeId, 'head -1 /proc/stat | awk \'{print $2, $3, $4, $5}\'', sshConfig),
        exec(node, nodeId, 'free -m | grep Mem:', sshConfig),
        exec(node, nodeId, 'uptime', sshConfig),
      ]);
      
      cpuPercent = parseLinuxCpu(cpuResult.stdout);
      const mem = parseLinuxMemory(memResult.stdout);
      if (mem) {
        memoryUsedGB = mem.used;
        memoryTotalGB = mem.total;
      }
      uptime = parseUptime(uptimeResult.stdout);
    }

    return {
      id: nodeId,
      status: 'ok',
      type: node.type,
      role: node.role,
      metrics: {
        cpuPercent,
        memoryUsedGB: memoryUsedGB ? Math.round(memoryUsedGB * 10) / 10 : undefined,
        memoryTotalGB: memoryTotalGB ? Math.round(memoryTotalGB * 10) / 10 : undefined,
        uptime,
      },
      checkedAt,
    };
  } catch (err) {
    return {
      id: nodeId,
      status: 'degraded',
      type: node.type,
      role: node.role,
      error: `Metrics collection failed: ${err}`,
      checkedAt,
    };
  }
}

/**
 * Probe all nodes
 */
export async function probeAllNodes(
  config: SwarmConfig
): Promise<NodeProbeResult[]> {
  const results = await Promise.all(
    Object.entries(config.nodes).map(([id, node]) =>
      probeNode(id, node, config.ssh)
    )
  );

  return results;
}
