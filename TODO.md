# SiberCron - Proje Durumu & TODO

## Proje Amaci
OpenClaw (AI otomasyon) + n8n (visual workflow builder) karisimi, acik kaynak, self-hosted bir workflow otomasyon platformu. Kullanicilar gorsel editorle node'lari suruklayip birakarak AI destekli otomasyon akislari olusturabilecek.

---

## Mevcut Durum: MVP Altyapisi Hazir

### Tamamlanan Isler

- [x] **Monorepo Altyapisi** - pnpm workspaces + Turborepo + TypeScript
- [x] **@sibercron/shared** - Tum TypeScript interface'leri (IWorkflow, INode, IExecution, INodeType, API types)
- [x] **@sibercron/core** - Workflow execution engine
  - [x] WorkflowEngine (topological sort, data passing, conditional branching)
  - [x] NodeExecutor (tekil node calistirma, timeout, error handling)
  - [x] NodeRegistry (node kayit ve kesfetme)
  - [x] ExecutionContext (node'lara input/parameter/credential saglar)
  - [x] ExpressionEvaluator ({{ $json.field }} template syntax)
- [x] **@sibercron/nodes** - 20 hazir node (guncellendi)
  - [x] Triggers: ManualTrigger, CronTrigger, WebhookTrigger
  - [x] AI: AIAgent (coklu provider), AutonomousDev (Claude CLI loop)
  - [x] Core: HttpRequest (auth/timeout/queryParams), Code (guvenli sandbox), Conditional (19 operator), Transform (pick/remove/rename/set/flatten/wrap), Merge (6 mod), Delay, Log (select logLevel), Loop (3 mod), Split (3 mod)
  - [x] Messaging: TelegramSend (text/photo/doc), DiscordSend (webhook+bot/embed), SlackSend (blocks/thread), WhatsAppReceive, WhatsAppSend, EmailSMTP
- [x] **@sibercron/server** - Fastify REST API
  - [x] Workflow CRUD + execute + activate/deactivate
  - [x] Execution history API
  - [x] Node type listing API
  - [x] Credential CRUD API
  - [x] Health check endpoint
  - [x] Socket.io gercek zamanli execution streaming
  - [x] In-memory database (MVP icin)
  - [x] BullMQ queue (Redis opsiyonel, fallback var)
  - [x] Cron scheduler (node-cron)
  - [x] Webhook endpoint handler
  - [x] Credential sifreleme (AES-256-GCM)
- [x] **@sibercron/editor** - React gorsel editor
  - [x] React Flow tabanli workflow canvas
  - [x] Node Palette (kategorili, surukleme destekli)
  - [x] Node Config Panel (dinamik form, property type'a gore)
  - [x] Editor Toolbar (kaydet, calistir, aktif/pasif toggle)
  - [x] BaseNode component (renkli, status gostergeli)
  - [x] Dashboard sayfasi (stats, son calistirmalar)
  - [x] Workflow listesi sayfasi
  - [x] Workflow editor sayfasi (tam ekran)
  - [x] Execution history sayfasi
  - [x] Credentials sayfasi (CRUD + modal)
  - [x] Templates sayfasi (4 hazir sablon)
  - [x] Zustand state management (workflow, execution, nodeRegistry stores)
  - [x] Socket.io client (canli execution takibi)
  - [x] Undo/Redo (history stack, max 50)
  - [x] Workflow import/export (JSON)
  - [x] Node output viewer (collapsible JSON tree)
  - [x] Keyboard shortcuts (Delete, Ctrl+S, Ctrl+Z, Ctrl+Shift+Z, Ctrl+E, Escape)
- [x] **Docker** - Dockerfile (multi-stage) + docker-compose + nginx
- [x] **Dokumantasyon** - README, CONTRIBUTING, LICENSE (MIT), architecture.md, plugin-development.md, self-hosting.md
- [x] **GitHub** - CI workflow, issue templates (bug + feature)

---

### Yapilacaklar (Oncelik Sirasina Gore)

#### Oncelik 1: Calisir Hale Getirme
- [x] pnpm install + tum paketleri build etme
- [x] TypeScript derleme hatalarini duzeltme
- [ ] Server + Editor'u birlikte calistirma testi
- [ ] Temel akis testi: workflow olustur -> kaydet -> calistir

#### Oncelik 2: Ek Node'lar
- [x] AISummarizer node (metin ozetleme)
- [x] AIClassifier node (metin siniflandirma)
- [ ] AIWebBrowser node (web scraping + AI ozet)
- [x] TelegramTrigger node (incoming messages)
- [ ] GoogleSheets node (read/write/append)
- [x] MySQL / PostgreSQL query node (DatabaseQuery)
- [x] Redis node (16 operasyon)
- [ ] FTP/SFTP node
- [x] RSS Feed node

#### Oncelik 3: Editor Gelistirmeleri
- [x] Template'den workflow olusturma (templates sayfasindan)
- [ ] Minimap iyilestirmeleri
- [x] Edge animasyonlari (calistirma sirasinda)
- [x] Command palette (Ctrl+K)
- [x] Workflow arama ve filtreleme
- [x] Node klonlama (Ctrl+D)
- [ ] Coklu node secimi + topluca silme/tasima
- [ ] Node gruplama / sub-workflow

#### Oncelik 4: Production Ozellikleri
- [ ] Kullanici kimlik dogrulama (auth)
- [ ] Rol bazli erisim kontrolu (RBAC)
- [ ] Workflow versiyonlama
- [x] Execution log retention policy (otomatik, env ile ayarlanabilir)
- [ ] Rate limiting (gelismis)
- [ ] API anahtari yonetimi
- [ ] Monitoring / metricsler
- [x] Webhook guvenligi (HMAC-SHA256 imza dogrulama)

#### Oncelik 5: Ekosistem
- [ ] `create-sibercron-node` CLI araci
- [ ] Community node marketplace sayfasi
- [ ] Plugin auto-discovery (`sibercron-node-*` npm taramasi)
- [ ] Workflow template paylasimi
- [ ] API dokumantasyonu (OpenAPI/Swagger)

---

## Hizli Baslangic

```bash
cd e:/SiberCron
pnpm install
pnpm build
pnpm dev
# Editor: http://localhost:5173
# API: http://localhost:3001
```
