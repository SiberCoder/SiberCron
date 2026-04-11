# SiberCron

**Open-source AI-powered workflow automation platform.**

Combine visual drag-and-drop workflow building with AI agent capabilities. Build, schedule, and monitor automation workflows — all self-hosted and fully under your control.

> Think **n8n** meets **AI Agents** — visual workflow editor + AI-powered automation with 9+ LLM providers.

---

## Features

### Visual Workflow Editor
- Drag-and-drop node-based editor built with React Flow
- Dynamic node configuration panel
- Real-time execution monitoring via Socket.io
- Workflow templates for quick start

### AI Integration (9+ Providers)
- **OpenAI** — GPT-4, GPT-4o, o3-mini
- **Anthropic** — Claude Sonnet 4.6, Haiku 4.5, Opus 4.6
- **Google Gemini** — 2.0 Flash, 2.5 Pro
- **Ollama** — Local models (fully offline)
- **Groq, Mistral, DeepSeek, X.AI, OpenRouter, Together, Perplexity**
- **Custom Endpoints** — Any OpenAI-compatible API
- **Claude CLI Delegation** — Use your local `claude` CLI directly

### AI Brain & Chat
- Natural language workflow management ("create a workflow that...")
- 14+ tool calling capabilities (workflow CRUD, execution, messaging, file ops, shell commands)
- Conversation history with context awareness
- Autonomous development loop for AI-driven task execution

### Multi-Channel Messaging
- **Telegram** — Bot API integration
- **Discord** — Webhook-based messaging
- **Slack** — Channel messaging via API
- **WhatsApp** — Cloud API with QR code pairing & incoming message triggers

### 17+ Built-in Nodes
- **Triggers** — Manual, Cron, Webhook, WhatsApp Receive
- **AI** — AI Agent (multi-provider), Autonomous Dev
- **Core** — HTTP Request, Code (JavaScript), Conditional, Transform, Merge, Delay, Log
- **Messaging** — Telegram Send, Discord Send, Slack Send, WhatsApp Send

### Scheduling & Execution
- Cron expressions for recurring workflows
- BullMQ job queue with Redis backend
- Real-time execution logs & status tracking
- Node-level error handling and conditional branching
- Topological sort execution order (Kahn's algorithm)

### Credential Management
- Encrypted credential storage
- Secrets never exposed in API responses
- Multiple auth methods: API key, OAuth 2.0, environment variables, CLI delegation

### Extensible Plugin System
- Create community nodes as npm packages (`sibercron-node-*`)
- Full TypeScript plugin interface
- Auto-discovery and dynamic registration

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9
- **Redis** (required for BullMQ job queue)

### 1. Clone & Install

```bash
git clone https://github.com/SiberCoder/SiberCron.git
cd SiberCron
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
git clone https://github.com/SiberCoder/SiberCron.git
cd SiberCron
cp .env.example .env
# Edit .env with your settings, then:
docker compose up -d
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Architecture

```
sibercron/
├── packages/
│   ├── shared/    # TypeScript types & constants
│   ├── core/      # Workflow execution engine
│   ├── nodes/     # 17+ built-in node implementations
│   ├── server/    # Fastify REST API + WebSocket + AI Brain
│   └── editor/    # React visual workflow editor
├── docker/        # Dockerfile, Compose, nginx
├── docs/          # Architecture, plugin dev, self-hosting
└── templates/     # Pre-built workflow templates
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS + React Flow |
| State | Zustand |
| Backend | Node.js + Fastify + TypeScript |
| Database | In-memory / SQLite / PostgreSQL |
| Queue | BullMQ + Redis |
| Realtime | Socket.io |
| AI | OpenAI, Anthropic, Gemini, Ollama, Groq, Mistral, DeepSeek + more |
| Monorepo | pnpm workspaces + Turborepo |

---

## Built-in Nodes

### Triggers
| Node | Description |
|------|-------------|
| **Manual Trigger** | Execute workflows manually via UI |
| **Cron Trigger** | Schedule with cron expressions |
| **Webhook Trigger** | Trigger via HTTP requests (GET, POST, PUT, DELETE) |
| **WhatsApp Receive** | Trigger on incoming WhatsApp messages |

### AI
| Node | Description |
|------|-------------|
| **AI Agent** | Multi-provider chat completions with JSON mode, system prompts, temperature control |
| **Autonomous Dev** | AI-powered autonomous loop that iterates on instructions with configurable max iterations |

### Core
| Node | Description |
|------|-------------|
| **HTTP Request** | Make API calls with headers & JSON body |
| **Code** | Execute custom JavaScript |
| **Conditional** | If/else branching (equals, contains, greaterThan, etc.) |
| **Transform** | Data mapping: pick fields, rename, set values |
| **Merge** | Combine multiple inputs into single output |
| **Delay** | Wait for specified duration |
| **Log** | Log messages with template interpolation |

### Messaging
| Node | Description |
|------|-------------|
| **Telegram Send** | Send messages via Telegram Bot API |
| **Discord Send** | Send to Discord via webhooks |
| **Slack Send** | Post messages to Slack channels |
| **WhatsApp Send** | Send via WhatsApp Cloud API (text & templates) |

---

## AI Brain

SiberCron includes a built-in AI assistant that can manage your workflows through natural language:

```
"Create a workflow that checks my API every 5 minutes and sends a Telegram alert if it's down"
```

Available AI tools:
- Workflow management (list, create, execute, activate, delete)
- Execution history & log retrieval
- Send messages across platforms
- File operations (read, write, list)
- Shell command execution
- System status monitoring

---

## API Reference

Base URL: `http://localhost:3001/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workflows` | List workflows (pagination, search, filter) |
| POST | `/workflows` | Create workflow |
| GET | `/workflows/:id` | Get workflow details |
| PUT | `/workflows/:id` | Update workflow |
| DELETE | `/workflows/:id` | Delete workflow |
| POST | `/workflows/:id/execute` | Execute workflow |
| GET | `/executions` | List executions (filter by status, workflowId) |
| GET | `/executions/:id` | Get execution details |
| GET | `/executions/:id/logs` | Get live execution logs |
| POST | `/chat` | Send message to AI Brain |
| GET | `/chat/history` | Get conversation history |
| GET | `/nodes` | List available node types |
| GET | `/credentials` | List credentials (secrets hidden) |
| POST | `/credentials` | Create encrypted credential |
| GET | `/social-accounts` | List connected messaging accounts |
| GET | `/health` | Health check |

---

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

See [Plugin Development Guide](docs/plugin-development.md) for details.

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — Free and open-source.

---

Built with care in Turkey.
