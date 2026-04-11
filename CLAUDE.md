# SiberCron - AI-Powered Workflow Automation Platform

n8n benzeri, açık kaynak, self-hosted workflow otomasyon platformu. Görsel editörle node'ları sürükle-bırak ile AI destekli otomasyon akışları oluşturulur.

## Monorepo Yapısı

```
packages/
  shared/   → TypeScript type'ları ve sabitler (bağımlılık yok)
  core/     → Workflow execution engine (sadece shared'e bağlı, saf logic)
  nodes/    → 17 built-in node implementasyonu (sadece shared'e bağlı)
  server/   → Fastify REST API + Socket.io backend (core + nodes + shared)
  editor/   → React + Vite frontend (shared types, HTTP/WS ile server'a bağlanır)
```

Bağımlılık zinciri: `shared → core/nodes → server`, `editor` sadece `shared` types kullanır.

## Tech Stack

| Katman | Teknoloji |
|--------|-----------|
| Dil | TypeScript 5.6, ESM ("type": "module") |
| Monorepo | pnpm workspaces + Turborepo |
| Backend | Fastify 5, Socket.io 4 |
| Job Queue | BullMQ 5 + ioredis (Redis opsiyonel, yoksa direkt çalıştırır) |
| Cron | node-cron 4 |
| Database | In-memory JSON store (data/sibercron.json) — MVP, SQL yok |
| Şifreleme | AES-256-GCM (Node crypto) |
| Validasyon | Zod 3 |
| Frontend | React 19 + Vite 6 |
| Canvas | @xyflow/react 12 (React Flow) |
| State | Zustand 5 |
| CSS | Tailwind CSS 3 |
| Test | Vitest (core) |
| Dev | tsx (server watch) |

## Komutlar

```bash
pnpm install          # Bağımlılıkları yükle
pnpm dev              # Tüm paketleri dev modda başlat (turbo)
pnpm build            # Tüm paketleri derle
pnpm lint             # Lint çalıştır
pnpm test             # Test çalıştır
# Editor: http://localhost:5173
# API: http://localhost:3001
```

## Workflow Engine Tasarımı (packages/core)

1. DAG parse: `workflow.nodes[]` + `workflow.edges[]` → adjacency list
2. Kahn's BFS topological sort → döngü tespiti
3. Sırayla node çalıştır, her node'un output'u sonrakinin input'u
4. Conditional branching: `json.branch = 'true'|'false'` + `edge.sourceHandle` eşleşmesi
5. `continueOnFail=false` (default) → hata durumunda workflow durur
6. Event emit: `execution:started`, `execution:node:start`, `execution:node:done`, `execution:completed`

**Trigger tespiti:** Node name'de "trigger"/"cron"/"webhook" aranır, yoksa ilk zero-in-degree node.

## Database (packages/server/src/db/database.ts)

SQL değil! In-memory Map + JSON dosya (data/sibercron.json). Debounced atomic write (tmp → rename).

**Koleksiyonlar:**
- `workflows` — Map<id, IWorkflow>
- `executions` — Map<id, IExecution>
- `credentials` — Map<id, ICredentialWithData> (AES-256-GCM encrypted)
- `socialAccounts` — Map<id, ISocialAccount>
- `commandRegistrations` — Map<id, ICommandRegistration>
- `setupConfig` — Record<string, unknown>

## API Routes (packages/server/src/routes/)

Tümü `/api/v1/` altında:

| Prefix | Dosya | Ana Endpointler |
|--------|-------|-----------------|
| /health | health.ts | GET / (status, queue, scheduler) |
| /workflows | workflows.ts | GET, POST, GET/:id, PUT/:id, DELETE/:id, POST/:id/execute, activate, deactivate |
| /executions | executions.ts | GET (filterable), GET/:id, GET/:id/logs, POST/cleanup, DELETE/:id |
| /nodes | nodes.ts | GET / (tüm tanımlar), GET/:name |
| /credentials | credentials.ts | CRUD |
| /setup | setup.ts | POST/GET config, AI provider yönetimi |
| /social-accounts | socialAccounts.ts | CRUD + pairing |
| /messaging/webhook | messaging.ts | Gelen webhook |
| /chat | chat.ts | POST / (AI Brain), GET /history, DELETE /history |
| /webhook/* | app.ts (inline) | Wildcard webhook → workflow tetikleme |

## Node Tipleri (packages/nodes/src/)

**Trigger:** ManualTrigger, CronTrigger, WebhookTrigger, TelegramTrigger (incoming messages, command/text filter)
**Core:** HttpRequest (auth: bearer/basic/apiKey, query params, timeout), Code (vm sandbox: Date/JSON/Math/console/URL/Promise), Conditional (19 operatör), Transform (pick/remove/rename/set/flatten/wrap), Merge (6 mod), Delay, Log (select logLevel), Loop (each/count/arrayField), Split (chunk/byField/splitText)
**AI:** AIAgent (çoklu provider), AutonomousDev (Claude CLI loop), AISummarizer (concise/paragraph/bullets/keypoints/custom, çoklu dil), AIClassifier (multi-label, confidence score, çoklu provider)
**Data:** DatabaseQuery (PostgreSQL/MySQL, parameterized queries, CRUD), Redis (16 operasyon: get/set/del/hget/hset/lpush/lrange/sadd/publish...)
**Messaging:** TelegramSend (text/photo/document, parseMode, reply), DiscordSend (webhook + bot API, embeds), SlackSend (blocks, thread reply), WhatsAppReceive, WhatsAppSend, EmailSMTP (HTML/text, CC/BCC)

Her node `INodeType` interface'ini implemente eder: `{ definition: INodeTypeDefinition, execute(context) }`

## Editor Sayfaları (packages/editor/src/pages/)

| Path | Sayfa | Açıklama |
|------|-------|----------|
| /setup | SetupWizardPage | İlk kurulum sihirbazı |
| /chat | ChatPage | AI Brain chat (varsayılan) |
| /dashboard | DashboardPage | Genel istatistikler |
| /workflows | WorkflowListPage | Workflow listesi |
| /workflows/:id | WorkflowEditorPage | Görsel canvas editör |
| /executions | ExecutionHistoryPage | Çalıştırma geçmişi |
| /credentials | CredentialsPage | Kimlik bilgileri |
| /templates | TemplatesPage | Şablonlar |
| /accounts | SocialAccountsPage | Mesajlaşma hesapları |
| /settings | SettingsPage | Ayarlar |

## Zustand Store'ları (packages/editor/src/store/)

- `workflowStore` — Workflow CRUD, React Flow node/edge yönetimi, save/load/execute
- `chatStore` — AI Brain sohbet geçmişi
- `executionStore` — Çalıştırma geçmişi
- `nodeRegistryStore` — Mevcut node tipleri
- `setupStore` — Kurulum durumu
- `socialAccountsStore` — Sosyal hesap yönetimi

## Server Servisleri (packages/server/src/services/)

- `schedulerService` — node-cron ile aktif cron workflow'larını zamanlama
- `queueService` — BullMQ job queue (Redis yoksa direkt çalıştırma fallback)
- `aiBrainService` — Çoklu AI provider chat (OpenAI, Anthropic, Ollama, Gemini, Claude CLI)
- `agentLoop` — Claude CLI agentic loop (15 tool, XML tag ile tool call parse)
- `executionLogStore` — Canlı execution log buffer
- `messagingService` — Çoklu platform mesaj gönderme

## Shared Types (packages/shared/src/)

Ana interface'ler:
- `IWorkflow` — { id, name, nodes: INodeInstance[], edges: IEdge[], settings, isActive, triggerType, cronExpression, webhookPath }
- `INodeInstance` — { id, type, name, position, parameters, credentials? }
- `IEdge` — { id, source, target, sourceHandle?, targetHandle? }
- `INodeType` — { definition: INodeTypeDefinition, execute(context) }
- `IExecution` — { id, workflowId, status, nodeResults, startedAt, finishedAt }
- `INodeExecutionResult` — { status, output, error, durationMs }
- `ICredentialWithData` — { id, name, type, data }

## Önemli Tasarım Kararları

1. **Database MVP:** SQL yerine in-memory JSON store — hızlı prototipleme için
2. **Redis opsiyonel:** BullMQ bağlanamezsa direkt çalıştırma fallback
3. **Credential şifreleme:** AES-256-GCM, dev modda plaintext (uyarı ile)
4. **Node timeout:** Varsayılan 30s, node bazında override edilebilir
5. **Conditional branching:** Output item'a `branch` field eklenir, engine `sourceHandle` ile eşleştirir
6. **React Flow entegrasyonu:** Tüm node'lar `type: 'siberNode'` olarak render edilir

## Son Eklenen Özellikler

- **Expression Evaluator** (core): `{{ $json.field }}` template syntax, `$input`, `$item(n)`, `$env`, `$now`, `$timestamp`, `$runId` değişkenleri. NodeExecutor parametreleri otomatik resolve eder.
- **Loop Node**: 3 mod — Each Item, Count, Array Field. Loop metadata eklenir (_loopIndex, _loopTotal, etc.)
- **Split Node**: 3 mod — Chunk (batch), By Field Value, Split Text. Gruplama metadata'sı eklenir.
- **Email SMTP Node**: nodemailer ile SMTP üzerinden email gönderme. HTML/Text, CC/BCC desteği.
- **Undo/Redo**: workflowStore'da history array + historyIndex. Max 50 entry.
- **Keyboard Shortcuts**: Delete (node sil), Ctrl+S (kaydet), Ctrl+Z (geri al), Ctrl+Shift+Z/Ctrl+Y (ileri al), Ctrl+E (çalıştır), Escape (seçimi kaldır)
- **Workflow Import/Export**: JSON olarak dışa/içe aktarma. EditorToolbar'da Download/Upload butonları.
- **Node Output Viewer**: Execution sonrası her node'un JSON çıktısını collapsible tree olarak gösteren panel.
- **Node Düzeltmeleri**: Code node güvenli sandbox (builtins), Conditional 19 operatör, Transform 6 operasyon, Merge 6 mod, HttpRequest auth/timeout/queryParams, Telegram photo/doc, Discord webhook+bot+embeds, Slack blocks/thread
- **AISummarizer Node**: Metin özetleme (concise/paragraph/bullets/keypoints/custom), çoklu dil, çoklu provider
- **AIClassifier Node**: Metin sınıflandırma, multi-label, confidence score, JSON mode
- **TelegramTrigger Node**: Gelen mesaj tetikleyici, update type/chat/command/regex filtreler
- **DatabaseQuery Node**: PostgreSQL/MySQL, parameterized queries, insert/update/delete/select
- **Redis Node**: 16 operasyon (get/set/del/exists/keys/incr/hget/hset/hgetall/lpush/lrange/sadd/smembers/publish/ttl/expire)
- **Edge Animasyonları**: Execution sırasında edge renk ve animasyon (running=blue, success=green, error=red)
- **Command Palette (Ctrl+K)**: Arama destekli komut paneli — workflow kaydet/çalıştır/import/export, node ekle, navigasyon
- **JWT Authentication**: `@fastify/jwt` + bcryptjs. Login/logout/refresh/me endpointleri. `authStore` (Zustand) + `AuthGuard`. `AUTH_ENABLED=false` ile dev modda kapatılabilir.
- **RBAC**: `admin` ve `viewer` rolleri. İlk açılışta default admin oluşturulur (admin/admin).
- **GoogleSheets Node**: Google Sheets API v4, service account JWT auth (client_email + private_key). getRows/appendRows/updateRange/clearRange. Ek npm paketi gerekmez.

## Kurallar

- Git commit mesajları **İngilizce** yazılmalı
- Kullanıcı Türkçe konuşur, yanıtlar Türkçe olmalı
- ESM modüller kullanılır ("type": "module")
- Port: Server 3001, Editor 5173
- Node eklerken: dosya oluştur → index.ts'e import+export ekle → build kontrol
- Her değişiklikten sonra `pnpm build` ile doğrula
- Mevcut kodu oku, SONRA değiştir — körlemesine yazma

## Otonom Geliştirme Protokolü

Bu bölüm otonom/loop modunda çalışırken uygulanır:

### Döngü
1. **DURUM**: TODO.md oku → sıradaki `[ ]` görevi belirle
2. **BUILD**: `pnpm build` → hata varsa ÖNCE düzelt
3. **GELİŞTİR**: Görevi uygula (en az 3 somut iş/tur)
4. **DOĞRULA**: `pnpm build` → 0 hata olana kadar düzelt
5. **GÜNCELLE**: TODO.md'de tamamlananları `[x]` işaretle
6. **KEŞFET**: Kodu incelerken 2-3 yeni somut görev bul, TODO.md'ye ekle

### Görev Üretme Kaynakları
- Kod incelemesi: eksik error handling, validasyon, edge case
- Rakip analiz: n8n/Zapier/Make.com'da olup bizde olmayan özellikler
- UX: UI'da eksik/kötü/eksik olan feedback, loading state, empty state
- Performans: gereksiz re-render, büyük bundle, yavaş query
- Güvenlik: input sanitization, rate limiting, credential exposure
- Test: birim test eksikliği, integration test

### Görev Yazım Kuralı
KÖTÜ: "kodu iyileştir", "performansı artır"
İYİ: "HttpRequest node'a retry/exponential backoff desteği ekle"
İYİ: "WorkflowCanvas'ta 50+ node olunca render yavaşlıyor, virtualization ekle"
İYİ: "Code node sandbox'una fetch() desteği ekle"
