# SiberCron

**Open-source AI-powered workflow automation platform.**

Combine visual drag-and-drop workflow building with AI agent capabilities. Build, schedule, and monitor automation workflows — all self-hosted and fully under your control.

> Think **n8n** meets **OpenClaw** — visual workflow editor + AI-powered automation nodes.

## Features

- **Visual Workflow Editor** — Drag-and-drop node-based editor built with React Flow
- **AI-Powered Nodes** — GPT-4, Claude integration for intelligent automation
- **Cron Scheduling** — Schedule workflows with cron expressions
- **Webhook Triggers** — Event-driven workflows via HTTP webhooks
- **13+ Built-in Nodes** — Triggers, AI, HTTP, Code, Conditional, Transform, Messaging
- **Multi-Channel Messaging** — Telegram, Slack, Discord integration
- **Real-time Monitoring** — Live execution tracking with Socket.io
- **Plugin System** — Extend with community nodes (`sibercron-node-*`)
- **Self-Hosted** — Your data stays on your infrastructure
- **MIT Licensed** — Free and open-source, no vendor lock-in

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9
- **Redis** (required for BullMQ job queue)

### 1. Clone & Install

```bash
git clone https://github.com/mustafayilmazdev/sibercron.git
cd sibercron
pnpm install
```

### 2. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Generate a secure encryption key
# Linux/macOS:
openssl rand -hex 32
# Windows (PowerShell):
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Open `.env` and fill in your `ENCRYPTION_KEY` and any API keys you plan to use. See [.env.example](.env.example) for all available options.

### 3. Start Development Servers

```bash
pnpm dev
```

This starts:
- **Editor** at [http://localhost:5173](http://localhost:5173)
- **API Server** at [http://localhost:3001](http://localhost:3001)

### Using Docker

```bash
git clone https://github.com/mustafayilmazdev/sibercron.git
cd sibercron
cp .env.example .env
# Edit .env with your settings, then:
docker compose up -d
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Architecture

```
sibercron/
├── packages/
│   ├── shared/    # TypeScript types & constants
│   ├── core/      # Workflow execution engine
│   ├── nodes/     # Built-in node implementations
│   ├── server/    # Fastify REST API + WebSocket
│   └── editor/    # React visual workflow editor
├── docker/        # Docker configuration
├── templates/     # Pre-built workflow templates
└── docs/          # Documentation
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS + React Flow |
| State | Zustand |
| Backend | Node.js + Fastify + TypeScript |
| Database | In-memory (MVP) / SQLite / PostgreSQL |
| Queue | BullMQ + Redis |
| Realtime | Socket.io |
| AI | OpenAI + Anthropic API |

## Built-in Nodes

### Triggers
- **Manual Trigger** — Execute workflows manually
- **Cron Trigger** — Schedule with cron expressions
- **Webhook Trigger** — Trigger via HTTP requests

### AI
- **AI Agent** — Chat completions with GPT-4 or Claude

### Core
- **HTTP Request** — Make API calls
- **Code** — Execute custom JavaScript
- **Conditional** — If/else branching
- **Transform** — Data mapping and transformation
- **Merge** — Combine multiple inputs
- **Delay** — Wait between steps

### Messaging
- **Telegram Send** — Send messages via Telegram Bot API
- **Discord Send** — Send to Discord webhooks
- **Slack Send** — Post messages to Slack channels

## Plugin Development

Create community nodes by publishing npm packages with the `sibercron-node-` prefix:

```typescript
import type { INodeType } from '@sibercron/shared';

export const MyCustomNode: INodeType = {
  definition: {
    displayName: 'My Custom Node',
    name: 'sibercron.myCustom',
    icon: 'Star',
    color: '#F59E0B',
    group: 'core',
    version: 1,
    description: 'Does something custom',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'myParam',
        displayName: 'My Parameter',
        type: 'string',
        required: true,
      },
    ],
  },
  async execute(context) {
    const items = context.getInputData();
    const myParam = context.getParameter<string>('myParam');
    return items.map(item => ({
      json: { ...item.json, customField: myParam },
    }));
  },
};
```

## API Reference

Base URL: `http://localhost:3001/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workflows` | List workflows |
| POST | `/workflows` | Create workflow |
| GET | `/workflows/:id` | Get workflow |
| PUT | `/workflows/:id` | Update workflow |
| DELETE | `/workflows/:id` | Delete workflow |
| POST | `/workflows/:id/execute` | Execute workflow |
| GET | `/executions` | List executions |
| GET | `/nodes` | List available node types |
| GET | `/credentials` | List credentials |
| GET | `/health` | Health check |

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — Free and open-source.

---

Built with care in Turkey.
