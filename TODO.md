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
- [x] Server + Editor'u birlikte calistirma testi
- [x] Temel akis testi: workflow olustur -> kaydet -> calistir

#### Oncelik 2: Ek Node'lar
- [x] AISummarizer node (metin ozetleme)
- [x] AIClassifier node (metin siniflandirma)
- [x] AIWebBrowser node (web scraping + AI ozet)
- [x] TelegramTrigger node (incoming messages)
- [x] GoogleSheets node (getRows/appendRows/updateRange/clearRange, service account JWT auth)
- [x] MySQL / PostgreSQL query node (DatabaseQuery)
- [x] Redis node (16 operasyon)
- [x] FTP/SFTP node (list/download/upload/delete/rename/mkdir, basic-ftp + ssh2-sftp-client)
- [x] RSS Feed node
- [x] GoogleDrive node (upload/download/list/delete dosyalar)
- [x] NotionDatabase node (query/create/update sayfa)

#### Oncelik 3: Editor Gelistirmeleri
- [x] Template'den workflow olusturma (templates sayfasindan)
- [ ] Minimap iyilestirmeleri
- [x] Edge animasyonlari (calistirma sirasinda)
- [x] Command palette (Ctrl+K)
- [x] Workflow arama ve filtreleme
- [x] Node klonlama (Ctrl+D)
- [x] Coklu node secimi + topluca silme/tasima (rubber-band, Shift+click, bulk toolbar)
- [ ] Node gruplama / sub-workflow

#### Oncelik 4: Production Ozellikleri
- [x] Kullanici kimlik dogrulama (auth) — JWT, login/logout, register, refresh token
- [x] Rol bazli erisim kontrolu (RBAC) — admin/viewer, route koruma
- [x] Workflow versiyonlama (auto-snapshot, restore)
- [x] Execution log retention policy (otomatik, env ile ayarlanabilir)
- [x] Rate limiting (gelismis): endpoint bazli limit, Settings sayfasinda gorunum
- [x] API anahtari yonetimi (kullanici bazli token uretimi ve iptal — scx_ prefix, SHA-256 hash, Settings UI)
- [x] Monitoring / metricsler: /api/v1/metrics endpoint (uptime, memory, node error stats, execution trends)
- [x] Auth token suresini editor settings'den yapilandirma (JWT_TTL env + settings UI)
- [x] Workflow execution'larinda user bazli audit log (kim tetikledi)
- [ ] LoginPage'e "sifre unut" / ilk kurulum wizard'ina admin ayarla adimi ekle
- [x] Webhook guvenligi (HMAC-SHA256 imza dogrulama)
- [x] Node palette arama iyilestirmesi (otomatik grup acma)
- [x] Settings sayfasi sistem bilgisi paneli

#### Oncelik 4b: Devam
- [x] Workflow execution'larinda user bazli audit log — her execution'a `triggeredBy: { userId, username }` ekle
- [x] Rate limiting gelismis: endpoint bazli farkli limit (auth: 10/min, chat: 20/min, workflows: 60/min, genel: 200/min)
- [x] Auth token suresini editor settings'den yapilandirma (JWT_TTL env + settings UI)
- [x] Execution list sayfasinda workflow adiyla filtre + tarih aralik filtresi + triggeredBy filtresi (client-side, anlık)
- [x] Node config panelinde expression builder: kategorili, filtrelenebilir degisken listesi
- [ ] FTP/SFTP node: büyük dosyalar için streaming download desteği (şu an tüm dosyayı belleğe çekiyor)
- [x] Minimap iyilestirmeleri: node tipine gore renk, toggle butonu, konum duzeltme

#### Oncelik 4c: Yeni Gorevler
- [x] Auth token suresini editor settings'den yapilandirma (JWT_TTL env + settings UI)
- [x] Node config panelinde expression builder: `{{ $json. }}` yazinca onceki node cikti alanlarini onerir
- [x] Execution list'te `triggeredBy` sutunu (kim tetikledi) goster
- [x] WorkflowListPage'de workflow kategorilendirme / tag sistemi
- [x] Settings sayfasina rate limit degerlerini gosterme paneli (Sistem Bilgisi section'inda)
- [x] Webhook tetikleyici node'unda beklenen payload schema validation (JSON Schema subset)
- [x] Dashboard: en cok hata veren node istatistigi (node-level error chart)
- [x] WebhookTrigger: respondWith HTTP kodu secenegi (200/202/204)
- [x] WorkflowCanvas: klavye kisayollari tooltip butonu
- [x] AutonomousDev: session-aware devam (--continue), canli streaming cikti
- [x] BaseNode/WorkflowCanvas: skipped durumu destegi (slate renk)
- [x] LiveExecutionPanel: ai_streaming log tipi, otomatik reset (30s)

#### Oncelik 4d: Kalan Gelistirmeler
- [x] LoginPage'e "sifre unut" senaryosu (admin reset flow)
- [ ] FTP/SFTP node: buyuk dosyalar icin streaming download (su an tum dosyayi belleğe cekiyor)
- [ ] Node gruplama / sub-workflow (complex, lower priority)
- [x] Minimap toggle butonu ve konum duzeltme (minor)
- [x] Execution history export (CSV/JSON)
- [x] Workflow bulk operations (coklu aktifle/pasifle, toplu sil)
- [ ] AIAgent node: streaming output destegi (SSE)
- [x] Node config paneli: JSON field icin syntax highlighting editor

#### Oncelik 5: Ekosistem
- [ ] `create-sibercron-node` CLI araci
- [ ] Community node marketplace sayfasi
- [ ] Plugin auto-discovery (`sibercron-node-*` npm taramasi)
- [ ] Workflow template paylasimi
- [x] API dokumantasyonu (OpenAPI/Swagger) — @fastify/swagger-ui, /api/docs

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
