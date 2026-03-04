# CLAUDE.md — navaris-cli

You are working on **navaris-cli**, the Navaris Labs unified command-line interface. Read this file in full before making any changes.

---

## Purpose

This CLI provides monitoring and management tools for the Navaris swarm infrastructure. The primary use case is real-time visibility into the distributed swarm of agents, services, and compute nodes.

**Current commands:**
- `navaris swarm status` — Full dashboard (TUI, JSON, or Markdown output)
- `navaris swarm services` — Service health checks
- `navaris swarm agents` — Agent status (OpenClaw + spawned agents)
- `navaris swarm nodes` — Node metrics (CPU, RAM, uptime)
- `navaris swarm health` — Quick health check with exit codes
- `navaris swarm config` — Configuration management

---

## Architecture

```
navaris-cli/
├── src/
│   ├── index.ts                   ← CLI entry point (commander)
│   ├── commands/
│   │   └── swarm/                 ← navaris swarm subcommands
│   ├── lib/
│   │   ├── config.ts              ← YAML config loader
│   │   ├── ssh.ts                 ← ssh2 connection manager
│   │   ├── probes/                ← Health probes (service, agent, node)
│   │   └── renderers/             ← Output formatters (TUI, JSON, Markdown)
│   └── types/
│       ├── config.ts              ← SwarmConfig types
│       └── probes.ts              ← ProbeResult types
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+ |
| Language | TypeScript (strict) |
| CLI framework | commander |
| Terminal UI | Ink (React for CLI) |
| SSH | ssh2 |
| Config | js-yaml |

---

## Configuration

The CLI reads configuration from `~/.navaris/swarm.yaml`. This file defines:
- **orchestrator** — The primary swarm controller node
- **nodes** — All nodes in the swarm (Mac Mini, Pi cluster, NAS)
- **services** — Services to monitor (OpenClaw, mounts, processes)
- **ssh** — SSH connection settings

Run `navaris swarm config --init` to create an example config.

---

## SSH Connection Management

The CLI uses ssh2 for SSH connections. Key points:
- Connections are pooled and reused
- Uses SSH key authentication (no passwords)
- Timeout and keepalive are configurable
- `execWithPath()` sets up PATH for tools like `openclaw`

---

## Probe System

Probes gather data from remote nodes:

| Probe Type | Description |
|------------|-------------|
| **Service** | Check process, mount, or OpenClaw health |
| **Agent** | Query OpenClaw agents + spawned swarm agents |
| **Node** | Gather CPU, RAM, uptime from macOS/Linux nodes |

Probes run in parallel for efficiency.

---

## Output Formats

All commands support three output formats:
- **TUI** (default) — Interactive terminal UI using Ink
- **JSON** (`--json`) — Structured JSON for scripting
- **Markdown** (`--markdown`) — Telegram-compatible for Zoe

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
node ./dist/index.js swarm status

# Link for global use
npm link
navaris swarm status

# Watch mode
npm run dev
```

---

## CI/CD

- Push to `main` triggers: lint → build → publish to GitHub Packages
- Package is published as `@navaris/cli` to `npm.pkg.github.com`
- Install via: `npm install -g @navaris/cli --registry=https://npm.pkg.github.com`

---

## Extending the CLI

To add new commands:

1. Create a new directory under `src/commands/` (e.g., `src/commands/infra/`)
2. Create command files following the pattern in `swarm/`
3. Export a parent command from `index.ts`
4. Add the command to `src/index.ts`

---

## Related Infrastructure

| Component | Description |
|-----------|-------------|
| Mac Mini (`navaris-mini`) | Swarm orchestrator, runs OpenClaw gateway |
| Pi Cluster (8 nodes) | Worker nodes for trading bots, HPC simulation |
| QNAP NAS | Shared storage for sessions, workspace, logs |
| OpenClaw | Agent framework with Telegram integration |

---

## What NOT to Do

- Do not hardcode hostnames or IPs — use config
- Do not store credentials in code — use SSH keys and Keychain
- Do not block on SSH connections — use async/await
- Do not add new dependencies without considering bundle size
- Do not push directly to `main` — use feature branches
