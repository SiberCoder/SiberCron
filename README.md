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

## Screenshots & Features

### Workflow Editor - Visual Canvas
Drag-and-drop node editor with real-time execution monitoring:
- Visual node connections and data flow
- Live execution status (running/success/error states)
- Animated edges showing active workflow path
- Node output viewer with collapsible JSON tree
- Keyboard shortcuts for fast workflow design

![Workflow Editor](./docs/screenshots/editor-canvas.png)

### AI Brain - Natural Language Control
Chat interface to manage your entire system:
- Create and execute workflows via natural language
- Monitor execution in real-time
- Run shell commands and file operations
- Send messages across platforms (Telegram, Slack, Discord, etc.)

![AI Brain Chat](./docs/screenshots/ai-brain-chat.png)

### Node Palette - 41 Built-in Integrations
One-click access to all available nodes:
- Search and filter nodes by type
- Drag nodes directly onto canvas
- Built-in documentation for each node
- Categorized by function (Triggers, AI, Core, Data, Messaging)

![Node Palette](./docs/screenshots/node-palette.png)

### Execution History & Logs
Monitor all workflow runs with detailed logs:
- Filter by status, workflow, date range
- View node-by-node execution times
- Stream live logs during execution
- Download execution reports

![Execution History](./docs/screenshots/execution-history.png)

---

## Why SiberCron?

| Feature | SiberCron | n8n | Zapier | Make |
|---------|-----------|-----|--------|------|
| **Self-hosted** | ✅ Full control | ✅ Enterprise | ❌ Cloud only | ❌ Cloud only |
| **Autonomous AI** | ✅ Claude CLI loop | ❌ No | ❌ No | ❌ No |
| **Visual Editor** | ✅ Drag-drop | ✅ Drag-drop | ✅ Web UI | ✅ Web UI |
| **Local AI Models** | ✅ Ollama support | ❌ No | ❌ No | ❌ No |
| **Open Source** | ✅ MIT | ✅ Custom | ❌ Proprietary | ❌ Proprietary |
| **Cost** | ✅ Free | ✅ Free/Paid | ⚠️ Paid | ⚠️ Paid |
| **Coding Workflows** | ✅ Autonomous Dev | ❌ No | ❌ No | ⚠️ Limited |
| **41 Nodes** | ✅ Built-in | ❌ 400+ (complex) | ❌ 6000+ (SaaS) | ❌ 1000+ (SaaS) |

**SiberCron is for you if:**
- You want **full autonomy** over your infrastructure
- You need **autonomous AI development** (bug fixes, feature implementation)
- You prefer **open source** and **no vendor lock-in**
- You work with **sensitive data** (healthcare, finance) and need on-premises
- You want to run **local AI models** (Ollama) without cloud costs

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

### With Docker (Recommended)

```bash
git clone https://github.com/SiberCoder/SiberCron.git
cd SiberCron
cp .env.example .env
# Edit .env with your API keys, then:
docker compose up -d
```

**Services start at:**
- Editor: http://localhost:5173
- API: http://localhost:3001
- Redis: localhost:6379

---

## Real-World Use Cases

### 📊 Data Pipeline Automation
```
GitHub Issue → Parse Labels → Save to Airtable → Notify Slack
├─ GitHub Trigger (watch issues)
├─ Transform (extract labels)
├─ Airtable (create record)
└─ Slack Send (notify team)
```

### 🤖 Autonomous Code Fixes
```
Daily Health Check → Find Failed Tests → AutonomousDev → Commit Fix
├─ Cron Trigger (daily 2 AM)
├─ Code (run test suite)
├─ Conditional (if failed)
├─ AutonomousDev (Claude fixes code)
└─ GitHub (create commit)
```

### 📧 Multi-Channel Notifications
```
API Latency Alert → Check Threshold → Route to Multiple Channels
├─ HTTP Request (fetch metrics)
├─ Conditional (if > 500ms)
├─ Telegram Send (on-call engineer)
├─ Slack Send (team channel)
├─ Email SMTP (escalation)
└─ Discord Send (incident channel)
```

### 🔄 Data Sync Across Platforms
```
Airtable Record Change → Transform → Sync to 3 Services
├─ Webhook Trigger (Airtable change)
├─ Transform (normalize data)
├─ Split (3 copies)
├─ Notion (sync page)
├─ Google Sheets (append row)
└─ Database (insert/update)
```

---

## Architecture

```
sibercron/
├── packages/
│   ├── shared/    # TypeScript types & constants
│   ├── core/      # Workflow execution engine (DAG, topological sort)
│   ├── nodes/     # 41 built-in node implementations
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

SiberCron's built-in AI assistant manages your system through natural language. No workflows needed — just ask:

```
💬 "Check my API every 5 minutes, notify me on Telegram if it's down"
   → Creates cron workflow, adds HTTP check + Telegram alert

💬 "List open GitHub issues and save them to Airtable"
   → Fetches from GitHub API, creates Airtable records

💬 "Find bugs in this project and fix them"
   → Runs AutonomousDev with Claude CLI for autonomous coding
```

**AI Brain Capabilities:**
- ✅ Workflow CRUD — create, execute, pause, activate workflows
- ✅ Autonomous coding — write code, test, commit via Claude CLI
- ✅ Cross-platform messaging — Telegram, Slack, Discord, WhatsApp, Email
- ✅ File operations — read, write, list, search files
- ✅ Shell commands — run bash/PowerShell safely
- ✅ Execution monitoring — view logs, status, trends
- ✅ Credential management — secure API key handling
- ✅ System health — CPU, memory, uptime monitoring

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

---

## Roadmap & Future

Planned features for upcoming releases:

- **Database UI** — Visual database explorer and query builder
- **Multi-user & Teams** — Collaborate on workflows with role-based access
- **Workflow Versioning** — Full Git-like history for all workflows
- **Performance Monitoring** — Detailed metrics dashboard (latency, throughput, errors)
- **Custom Node Builder** — Visual interface to create nodes without coding
- **Slack Bot Integration** — Control SiberCron directly from Slack
- **Mobile App** — iOS/Android support for monitoring
- **Advanced Caching** — Redis-backed state management for complex workflows
- **Workflow Marketplace** — Share and discover community workflows

[View full roadmap →](./docs/roadmap.md)

---

## Contributing

Contributions are welcome! Whether it's bug fixes, new nodes, documentation, or features — we'd love your help.

**Getting Started:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test locally with `pnpm dev`
4. Commit with a clear message: `git commit -m 'feat: add amazing feature'`
5. Push and open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

**Ways to Contribute:**
- 🐛 Report bugs in [GitHub Issues](https://github.com/SiberCoder/SiberCron/issues)
- 📚 Improve documentation
- 🤖 Create new nodes (see [Plugin Development](docs/plugin-development.md))
- 🎨 Design improvements
- 🧪 Write tests

---

## Community & Support

- 💬 [GitHub Discussions](https://github.com/SiberCoder/SiberCron/discussions) — Ask questions, share workflows
- 🐛 [Issue Tracker](https://github.com/SiberCoder/SiberCron/issues) — Report bugs
- 📖 [Documentation](./docs/) — Architecture, self-hosting, plugins

---

## License

[MIT](LICENSE) — Free and open source.

---

Built with ❤️ in Turkey. 🇹🇷
