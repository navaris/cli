# Navaris CLI

Unified command-line interface for Navaris Labs infrastructure and swarm management.

## Installation

```bash
# From GitHub Packages
npm install -g @navaris/cli --registry=https://npm.pkg.github.com

# Or clone and link
git clone https://github.com/navaris/navaris-cli.git
cd navaris-cli
npm install
npm run build
npm link
```

## Quick Start

```bash
# Initialize configuration
navaris swarm config --init

# Edit ~/.navaris/swarm.yaml to match your topology

# Check swarm health
navaris swarm health

# View full dashboard
navaris swarm status
```

## Commands

### `navaris swarm status`

Display the full swarm dashboard with services, agents, and nodes.

```bash
navaris swarm status              # Interactive TUI
navaris swarm status --json       # JSON output
navaris swarm status --markdown   # Telegram-compatible Markdown
```

### `navaris swarm services`

Display service health status.

```bash
navaris swarm services
navaris swarm services --json
```

### `navaris swarm agents`

Display agent status (OpenClaw and spawned agents).

```bash
navaris swarm agents
navaris swarm agents --json
```

### `navaris swarm nodes`

Display node metrics (CPU, RAM, uptime).

```bash
navaris swarm nodes
navaris swarm nodes --json
```

### `navaris swarm health`

Quick health check with exit codes for scripting.

- Exit 0: Healthy
- Exit 1: Degraded
- Exit 2: Critical

```bash
navaris swarm health --quiet && echo "All good!"
```

### `navaris swarm config`

Configuration management.

```bash
navaris swarm config              # Show current config
navaris swarm config --init       # Create example config
navaris swarm config --path       # Show config file path
```

## Configuration

The CLI reads from `~/.navaris/swarm.yaml`. Example:

```yaml
version: 1

orchestrator:
  node: navaris-mini

nodes:
  navaris-mini:
    host: 192.168.68.86
    user: navaris-swarm
    type: orchestrator

  navcluster01:
    host: navcluster01.local
    user: pi
    type: worker
    role: trading-bot

services:
  openclaw-gateway:
    node: navaris-mini
    check: process
    process: openclaw-gateway

ssh:
  identity: ~/.ssh/id_ed25519
  timeout: 10
```

## Requirements

- Node.js 22+
- SSH access to swarm nodes (key-based authentication)
- `~/.navaris/swarm.yaml` configuration file

## License

MIT
