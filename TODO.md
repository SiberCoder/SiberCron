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
- [x] **@sibercron/nodes** - 13 hazir node
  - [x] Triggers: ManualTrigger, CronTrigger, WebhookTrigger
  - [x] AI: AIAgent (OpenAI + Anthropic destegi)
  - [x] Core: HttpRequest, Code, Conditional, Transform, Merge, Delay
  - [x] Messaging: TelegramSend, DiscordSend, SlackSend
- [x] **@sibercron/server** - Fastify REST API
  - [x] Workflow CRUD + execute + activate/deactivate
  - [x] Execution history API
  - [x] Node type listing API
  - [x] Credential CRUD API
  - [x] Health check endpoint
  - [x] Socket.io gercek zamanli execution streaming
  - [x] In-memory database (MVP icin)
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
- [x] **Docker** - Dockerfile (multi-stage) + docker-compose + nginx
- [x] **Dokumantasyon** - README, CONTRIBUTING, LICENSE (MIT), architecture.md, plugin-development.md, self-hosting.md
- [x] **GitHub** - CI workflow, issue templates (bug + feature)

---

### Yapilacaklar (Oncelik Sirasina Gore)

#### Oncelik 1: Calisir Hale Getirme
- [ ] pnpm install + tum paketleri build etme
- [ ] TypeScript derleme hatalarini duzeltme
- [ ] Server + Editor'u birlikte calistirma testi
- [ ] Temel akis testi: workflow olustur -> kaydet -> calistir

#### Oncelik 2: Eksik Ozellikler (Kisa Vade)
- [ ] Gercek SQLite/PostgreSQL veritabani (simdilik in-memory)
- [ ] Knex.js migration dosyalari
- [ ] BullMQ queue entegrasyonu (simdilik senkron calistirma)
- [ ] Cron scheduler (aktif workflow'lari zamaninda calistirma)
- [ ] Webhook endpoint handler (dinamik route olusturma)
- [ ] Credential sifreleme (AES-256-GCM)
- [ ] Expression evaluator ({{ $json.field }} sablonlari)

#### Oncelik 3: Ek Node'lar
- [ ] AISummarizer node
- [ ] AIClassifier node
- [ ] AIWebBrowser node (web scraping)
- [ ] TelegramTrigger node (incoming messages)
- [ ] GoogleSheets node
- [ ] MySQL / PostgreSQL query node
- [ ] Redis node
- [ ] Loop node
- [ ] Split node
- [ ] Email (SMTP) node

#### Oncelik 4: Editor Gelistirmeleri
- [ ] Undo/Redo (workflow editor'de)
- [ ] Workflow import/export (JSON)
- [ ] Template'den workflow olusturma
- [ ] Node output viewer (execution sonrasi JSON agaci)
- [ ] Keyboard shortcuts (Delete, Ctrl+S, Ctrl+Z)
- [ ] Minimap iyilestirmeleri
- [ ] Edge animasyonlari (calistirma sirasinda)
- [ ] Command palette (Ctrl+K)
- [ ] Workflow arama ve filtreleme

#### Oncelik 5: Production Ozellikleri
- [ ] Kullanici kimlik dogrulama (auth)
- [ ] Rol bazli erisim kontrolu (RBAC)
- [ ] Workflow versiyonlama
- [ ] Execution log retention policy
- [ ] Rate limiting
- [ ] API anahtari yonetimi
- [ ] Monitoring / metricsler
- [ ] Webhook guvenligi (HMAC imza dogrulama)

#### Oncelik 6: Ekosistem
- [ ] `create-sibercron-node` CLI araci
- [ ] Community node marketplace sayfasi
- [ ] Plugin auto-discovery (`sibercron-node-*` npm taramasi)
- [ ] Workflow template paylasimi
- [ ] API dokumantasyonu (OpenAPI/Swagger)

---

## Dosya Sayilari

| Paket | Kaynak Dosya | Aciklama |
|-------|-------------|----------|
| shared | 8 dosya | TypeScript types + constants |
| core | 5 dosya | Engine + Registry |
| nodes | 14 dosya | 13 node + index |
| server | 9 dosya | API routes + config + db |
| editor | 20 dosya | React components + pages + stores |
| root | 15 dosya | Config, docs, docker, CI |
| **Toplam** | **~71 kaynak dosya** | |

---

## Hizli Baslangic (WSL)

```bash
# WSL'de projeyi kopyala
cp -r /mnt/e/SiberCron ~/sibercron
cd ~/sibercron

# Bagimliliklari yukle
pnpm install

# Tum paketleri derle
pnpm build

# Gelistirme sunucularini baslat
pnpm dev
# Editor: http://localhost:5173
# API: http://localhost:3001
```
