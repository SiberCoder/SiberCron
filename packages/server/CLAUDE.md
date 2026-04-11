# @sibercron/server — Fastify REST API + Socket.io Backend

Port: 3001. Fastify 5, ESM, TypeScript (tsx ile dev).

## Giriş Noktası: src/app.ts
- Fastify instance oluşturma, CORS, rate limiting (100 req/min/IP)
- Body limit: 10MB
- Route registration, Socket.io setup
- Wildcard webhook handler: `/api/v1/webhook/*`
- Stale execution cleanup on startup

## Database (src/db/database.ts)
**SQL değil!** In-memory Map + JSON dosya (`data/sibercron.json`).
- Debounced atomic write: setImmediate batch → tmp file → rename
- 5 koleksiyon: workflows, executions, credentials, socialAccounts, commandRegistrations + setupConfig
- Credential şifreleme: AES-256-GCM (dev modda plaintext)
- `migrations/` ve `repositories/` dizinleri var ama boş (scaffolded, kullanılmıyor)

## Routes (src/routes/) — Tümü /api/v1/ altında
- `health.ts` — GET / (status, queue, scheduler info)
- `workflows.ts` — CRUD + execute + activate/deactivate
- `executions.ts` — Liste (filterable) + detay + logs + cleanup
- `nodes.ts` — Node type definitions listesi
- `credentials.ts` — CRUD
- `setup.ts` — Config CRUD + AI provider yönetimi + Claude CLI detection
- `socialAccounts.ts` — CRUD + pairing
- `messaging.ts` — Incoming webhook receiver
- `commands.ts` — Slash command → workflow mapping
- `chat.ts` — AI Brain chat (POST /, GET /history, SSE stream)

## Servisler (src/services/)

### schedulerService.ts
- node-cron v4 ile aktif cron workflow zamanlama
- `init()`: DB'den aktif cron workflow'ları yükle, `schedule()` çağır
- Lifecycle: `onWorkflowActivated`, `onWorkflowDeactivated`, `onWorkflowUpdated`

### queueService.ts
- BullMQ + ioredis, queue: `sibercron:workflows`
- 3 retry, exponential backoff (5s base), max 3 concurrent, max 10 jobs/min
- **Redis yoksa:** 5 retry sonrası `executeDirectly()` fallback (in-process)

### aiBrainService.ts
- Çoklu AI provider: OpenAI, Anthropic, Ollama, Gemini, OpenRouter, Groq, Custom, Claude CLI
- 9 built-in tool: list_workflows, execute_workflow, create_workflow, get_execution_history, send_message, get_system_status, manage_account, activate_workflow, delete_workflow
- Per-conversation message history (in-memory Map)

### agentLoop.ts
- Claude CLI delegation loop (`claude -p`)
- 15 tool (system_status, workflow CRUD, file ops, shell_run)
- Tool call parse: `<tool_call>{json}</tool_call>` XML tags
- `shell_run` güvenlik: whitelist (ls, cat, git, node, pnpm...), `;`, `&&`, backtick engelleme

### Diğer servisler
- `executionLogStore` — Canlı circular log buffer
- `messagingService` — WhatsApp, Telegram, Discord, Slack mesaj gönderme
- `claudeCliService` — Claude CLI detection
- `aiProviderService` — AI provider config yönetimi

## WebSocket (Socket.io)
- Event'ler: `execution:started`, `execution:node:start`, `execution:node:done`, `execution:completed`, `execution:log`
- Room: `execution:{id}`
- Broadcast: `workflow:activated`, `workflow:deactivated`
