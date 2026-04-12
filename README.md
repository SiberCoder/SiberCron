# SiberCron

**Open-source, self-hosted autonomous AI development & workflow automation platform.**

Combines n8n's visual workflow editor with autonomous AI development capabilities in a single platform — runs on your own machine or server for fully autonomous software development and automation.

> Visual workflow builder + Autonomous AI developer + 41 built-in nodes + 13 AI providers. All under your control, self-hosted.

---

## What Does It Do?

### Autonomous Software Development
- **AutonomousDev Node** — Fully autonomous development loop via Claude CLI: writes code, runs tests, fixes bugs, and commits
- **AI Brain** — Manage workflows, files, shell commands, and messaging through natural language
- **Agent Loop** — AI agent managing your system with 15 tools: workflow CRUD, execution, file read/write, shell commands
- **Live Streaming** — Real-time monitoring of autonomous development output (session-aware resume, `--continue`)

### Visual Workflow Editor
- Drag-and-drop node-based editor (React Flow)
- Real-time execution monitoring with animated edges (running=blue, success=green, error=red)
- Node output viewer with collapsible JSON tree
- Expression evaluator — `{{ $json.field }}` template syntax with `$input`, `$item(n)`, `$env`, `$now`, `$timestamp`, `$runId` variables
- Command palette (Ctrl+K): search and run any action
- Keyboard shortcuts: `Ctrl+S` save, `Ctrl+Z` undo, `Ctrl+Shift+Z` redo, `Ctrl+E` execute, `Delete` remove node
- Workflow templates, import/export (JSON), undo/redo (up to 50 steps)

### 41 Built-in Nodes

#### Triggers (5)
| Node | Description |
|------|-------------|
| **Manual Trigger** | Manual execution from UI |
| **Cron Trigger** | Scheduled execution via cron expression |
| **Webhook Trigger** | HTTP-triggered workflows (HMAC-SHA256 signature verification, payload schema validation) |
| **Telegram Trigger** | Trigger on incoming Telegram messages (command/text/regex filter) |
| **GitHub Trigger** | Trigger on GitHub events: push, pull_request, issues, release (HMAC-SHA256 verification, event/repo/branch filter) |

#### AI (5)
| Node | Description |
|------|-------------|
| **AI Agent** | Multi-provider chat completions, JSON mode, streaming output |
| **Autonomous Dev** | Fully autonomous software development loop via Claude CLI |
| **AI Summarizer** | Text summarization (5 modes, multi-language, multi-provider) |
| **AI Classifier** | Text classification (multi-label, confidence score) |
| **AI Web Browser** | Analyze web page content with AI: summarize, Q&A, structured data extraction |

#### Core (25)
| Node | Description |
|------|-------------|
| **HTTP Request** | API calls (bearer/basic/apiKey auth, query params, timeout, retry) |
| **Code** | Run JavaScript in a secure sandbox |
| **Conditional** | If/else branching with 19 operators |
| **Switch** | N-way routing (5 cases + default, regex/contains/gt/lt) |
| **Transform** | Data transformation: pick/remove/rename/set/flatten/wrap |
| **Filter** | Filter item arrays with AND/OR condition logic |
| **Merge** | Combine multiple inputs with 6 merge modes |
| **Loop** | 3 modes: each item, count, array field |
| **Split** | 3 modes: chunk, by field, split text |
| **Aggregate** | count/sum/avg/min/max/concat/groupBy/unique operations |
| **Sort** | Field-based or random sorting, multi-key JSON sort |
| **Delay** | Wait for a specified duration |
| **Log** | Logging with template interpolation |
| **DateTime** | Date/time operations (12 operations, timezone, Intl API) |
| **Execute Workflow** | Run another workflow via API, wait for result (polling) or fire-and-forget |
| **DatabaseQuery** | PostgreSQL/MySQL parameterized queries |
| **Redis** | 16 operations (get/set/del/hget/hset/lpush/sadd/publish...) |
| **Google Sheets** | Read/write/update rows via service account |
| **Google Drive** | List/upload/download/delete/create folder |
| **Notion Database** | Query/create/update/archive/search pages |
| **GitHub** | Issue/PR/repo/release/comment operations (REST API v3) |
| **Jira** | Issue CRUD + JQL search, comments, transitions, project list (Cloud REST API v3) |
| **Airtable** | Record CRUD, search, upsert, filter (REST API) |
| **FTP/SFTP** | File transfer (list/download/upload/delete/rename/mkdir) |
| **RSS Feed** | Read and parse RSS/Atom feeds |

#### Messaging (6)
| Node | Description |
|------|-------------|
| **Telegram Send** | Send messages, photos, and documents |
| **Discord Send** | Webhook + Bot API, embed support |
| **Slack Send** | Block Kit, thread reply |
| **WhatsApp Receive** | Incoming message trigger |
| **WhatsApp Send** | Send messages via Cloud API |
| **Email SMTP** | HTML/text email, CC/BCC |

### AI Providers (13+)
- **OpenAI** — GPT-4o, GPT-4o-mini, o3-mini
- **Anthropic** — Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
- **Google Gemini** — 2.0 Flash, 2.5 Pro
- **Ollama** — Local models (fully offline)
- **Groq, Mistral, DeepSeek, X.AI, OpenRouter, Together, Perplexity, GitHub Copilot**
- **Custom Endpoint** — Any OpenAI-compatible API
- **Claude CLI Delegation** — Use your local `claude` CLI directly

### Production Features
- **JWT Authentication** + RBAC (admin/viewer roles)
- **API Key Management** — Per-user token generation (`scx_` prefix, SHA-256 hash)
- **Rate Limiting** — Per-endpoint (auth: 10/min, chat: 20/min, workflows: 60/min)
- **Webhook Security** — HMAC-SHA256 signature verification
- **Credential Encryption** — AES-256-GCM
- **Execution Retention** — Automatic cleanup of old execution records
- **Concurrent Execution Guard** — Prevent the same workflow from running simultaneously (can be disabled)
- **BullMQ Job Queue** — Reliable job queue with Redis (falls back to direct execution without Redis)
- **OpenAPI/Swagger** — Available at `/api/docs`
- **Docker** — Multi-stage Dockerfile + docker-compose + nginx

---

## Quick Start

### Requirements

- **Node.js** >= 18
- **pnpm** >= 9
- **Redis** (optional — for BullMQ job queue)

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

# Generate an encryption key
# Linux/macOS:
openssl rand -hex 32
# Windows (PowerShell):
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Open `.env` and set your `ENCRYPTION_KEY` and any API keys you plan to use.

### 3. Start Development Servers

```bash
pnpm dev
```

- **Editor** — [http://localhost:5173](http://localhost:5173)
- **API Server** — [http://localhost:3001](http://localhost:3001)
- **API Docs** — [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

### With Docker

```bash
git clone https://github.com/SiberCoder/SiberCron.git
cd SiberCron
cp .env.example .env
# Edit .env, then:
docker compose up -d
```

---

## Architecture

```
sibercron/
├── packages/
│   ├── shared/    # TypeScript types & constants
│   ├── core/      # Workflow execution engine (DAG, topological sort)
│   ├── nodes/     # 35+ built-in node implementations
│   ├── server/    # Fastify REST API + Socket.io + AI Brain + Agent Loop
│   └── editor/    # React visual workflow editor
├── docker/        # Dockerfile, Compose, nginx
├── docs/          # Architecture, plugin development, self-hosting
└── templates/     # Pre-built workflow templates
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite 6 + Tailwind CSS 3 + React Flow 12 |
| State | Zustand 5 |
| Backend | Node.js + Fastify 5 + TypeScript 5.6 |
| Database | In-memory JSON store (MVP) |
| Queue | BullMQ 5 + Redis (optional) |
| Realtime | Socket.io 4 |
| AI | 13+ providers (OpenAI, Anthropic, Gemini, Ollama, Groq, etc.) |
| Monorepo | pnpm workspaces + Turborepo |
| Encryption | AES-256-GCM (Node.js crypto) |

---

## AI Brain — Autonomous Management

SiberCron's built-in AI assistant manages your system through natural language:

```
"Check my API every 5 minutes, notify me on Telegram if it's down"
"List open issues in my GitHub repo and save them to Airtable"
"Find bugs in this project and fix them"
```

AI Brain tools:
- Workflow management (list, create, execute, activate, delete)
- Execution history and log access
- Cross-platform message sending
- File operations (read, write, list)
- Shell command execution
- System health monitoring

---

## API Reference

Base URL: `http://localhost:3001/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workflows` | List workflows (pagination, search, filter) |
| POST | `/workflows` | Create workflow |
| GET | `/workflows/:id` | Workflow details |
| PUT | `/workflows/:id` | Update workflow |
| DELETE | `/workflows/:id` | Delete workflow |
| POST | `/workflows/:id/execute` | Execute workflow |
| POST | `/workflows/:id/validate` | Validate workflow |
| GET | `/executions` | Execution history (filter: status, workflowId, date) |
| GET | `/executions/:id` | Execution details |
| GET | `/executions/:id/logs` | Live logs |
| GET | `/executions/trend` | 7-day trend data |
| GET | `/executions/node-errors` | Top error-producing nodes |
| POST | `/chat` | Send AI Brain message |
| GET | `/chat/history` | Conversation history |
| GET | `/nodes` | Available node types |
| CRUD | `/credentials` | Encrypted credentials |
| GET | `/health` | System health |
| GET | `/metrics` | Metrics (uptime, memory, error stats) |
| POST/GET | `/webhook/*` | Webhook trigger |

Full documentation: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

---

## Plugin Development

Create community nodes as npm packages with the `sibercron-node-` prefix:

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

Details: [Plugin Development Guide](docs/plugin-development.md)

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

[MIT](LICENSE) — Free and open source.

---

Built in Turkey.
