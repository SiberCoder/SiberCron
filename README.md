# SiberCron

**Open-source, self-hosted autonomous AI development & workflow automation platform.**

n8n'in gorsel workflow editoru ile OpenClaw'un otonom AI gelistirme yeteneklerini tek bir platformda birlestiren, kendi bilgisayarinizda veya sunucunuzda calisan tam otonom yazilim gelistirme ve otomasyon sistemi.

> **n8n + OpenClaw** = Gorsel workflow builder + Otonom AI gelistirici + 35+ entegrasyon node'u + 13 AI provider destegi. Hepsi sizin kontrolunuzde, self-hosted.

---

## Ne Yapar?

### Otonom Yazilim Gelistirme
- **AutonomousDev Node** — Claude CLI uzerinden tam otonom gelistirme dongusu. Kod yazar, test eder, hatalari duzeltir, commit atar
- **AI Brain** — Dogal dil ile workflow yonetimi, dosya islemleri, shell komutlari, mesajlasma
- **Agent Loop** — 14+ tool ile AI ajaninin sistemi yonetmesi: workflow CRUD, execution, dosya okuma/yazma, kabuk komutlari
- **Canli Streaming** — Otonom gelistirme ciktisini gercek zamanli izleme (session-aware devam, `--continue`)

### Gorsel Workflow Editor
- Surukle-birak node-tabanli editor (React Flow)
- Gercek zamanli calistirma izleme (Socket.io)
- Node cikti goruntuleyici, expression builder, command palette (Ctrl+K)
- Workflow sablonlari, import/export, undo/redo, versiyon gecmisi

### 35+ Hazir Node

#### Trigger'lar (4)
| Node | Aciklama |
|------|----------|
| **Manual Trigger** | UI'dan manuel calistirma |
| **Cron Trigger** | Cron expression ile zamanlanmis calistirma |
| **Webhook Trigger** | HTTP istekleri ile tetikleme (HMAC-SHA256 imza dogrulama, payload schema validation) |
| **Telegram Trigger** | Gelen Telegram mesajlari ile tetikleme (komut/metin/regex filtre) |

#### AI (5)
| Node | Aciklama |
|------|----------|
| **AI Agent** | Coklu provider chat completions, JSON mode, streaming output |
| **Autonomous Dev** | Claude CLI ile tam otonom yazilim gelistirme dongusu |
| **AI Summarizer** | Metin ozetleme (5 mod, coklu dil, coklu provider) |
| **AI Classifier** | Metin siniflandirma (multi-label, confidence score) |
| **AI Web Browser** | Web sayfa icerigini AI ile analiz, ozet, soru-cevap, yapilandirilmis veri cikarma |

#### Core (20)
| Node | Aciklama |
|------|----------|
| **HTTP Request** | API cagrilari (bearer/basic/apiKey auth, query params, timeout, retry) |
| **Code** | Guvenli sandbox'ta JavaScript calistirma |
| **Conditional** | 19 operator ile if/else dallama |
| **Switch** | N-yollu routing (5 case + default, regex/contains/gt/lt) |
| **Transform** | Veri donusturme: pick/remove/rename/set/flatten/wrap |
| **Merge** | 6 mod ile coklu girisi birlestirme |
| **Loop** | 3 mod: each item, count, array field |
| **Split** | 3 mod: chunk, by field, split text |
| **Delay** | Belirli sure bekleme |
| **Log** | Template interpolation ile loglama |
| **DateTime** | Tarih/saat islemleri (12 operasyon, timezone, Intl API) |
| **DatabaseQuery** | PostgreSQL/MySQL parameterized queries |
| **Redis** | 16 operasyon (get/set/del/hget/hset/lpush/sadd/publish...) |
| **Google Sheets** | Service account ile satir okuma/yazma/guncelleme |
| **Google Drive** | Dosya listeleme/yukleme/indirme/silme/klasor olusturma |
| **Notion Database** | Sayfa sorgulama/olusturma/guncelleme/arsivleme/arama |
| **GitHub** | Issue/PR/repo/release/comment islemleri (REST API v3) |
| **Airtable** | Record CRUD, arama, upsert, filtreleme (REST API) |
| **FTP/SFTP** | Dosya transferi (list/download/upload/delete/rename/mkdir) |
| **RSS Feed** | RSS/Atom feed okuma ve parse etme |

#### Mesajlasma (6)
| Node | Aciklama |
|------|----------|
| **Telegram Send** | Mesaj/foto/dosya gonderme |
| **Discord Send** | Webhook + Bot API, embeds destegi |
| **Slack Send** | Block kit, thread reply |
| **WhatsApp Receive** | Gelen mesaj tetikleyici |
| **WhatsApp Send** | Cloud API ile mesaj gonderme |
| **Email SMTP** | HTML/text email, CC/BCC |

### AI Provider'lar (13+)
- **OpenAI** — GPT-4o, GPT-4o-mini, o3-mini
- **Anthropic** — Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
- **Google Gemini** — 2.0 Flash, 2.5 Pro
- **Ollama** — Local modeller (tamamen offline)
- **Groq, Mistral, DeepSeek, X.AI, OpenRouter, Together, Perplexity, GitHub Copilot**
- **Custom Endpoint** — Herhangi bir OpenAI-uyumlu API
- **Claude CLI Delegation** — Yerel `claude` CLI'yi dogrudan kullanma

### Production Ozellikleri
- **JWT Authentication** + RBAC (admin/viewer rolleri)
- **API Key Yonetimi** — Kullanici basi token uretimi (`scx_` prefix, SHA-256 hash)
- **Rate Limiting** — Endpoint bazli (auth: 10/dk, chat: 20/dk, workflows: 60/dk)
- **Webhook Guvenligi** — HMAC-SHA256 imza dogrulama
- **Credential Sifreleme** — AES-256-GCM
- **Execution Retention** — Otomatik eski kayit temizligi
- **Concurrent Execution Guard** — Ayni workflow'un es zamanli calismasini onleme (devre disi birakilabilir)
- **BullMQ Job Queue** — Redis ile guvenilir is kuyrugu (Redis yoksa direkt calistirma fallback)
- **OpenAPI/Swagger** — `/api/docs` endpoint'i
- **Docker** — Multi-stage Dockerfile + docker-compose + nginx

---

## Hizli Baslangic

### Gereksinimler

- **Node.js** >= 18
- **pnpm** >= 9
- **Redis** (opsiyonel — BullMQ is kuyrugu icin)

### 1. Klon & Kurulum

```bash
git clone https://github.com/SiberCoder/SiberCron.git
cd SiberCron
pnpm install
```

### 2. Ortam Yapilandirmasi

```bash
# .env dosyasini kopyala
cp .env.example .env

# Sifreleme anahtari olustur
# Linux/macOS:
openssl rand -hex 32
# Windows (PowerShell):
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

`.env` dosyasini acip `ENCRYPTION_KEY` ve kullanacaginiz API anahtarlarini girin.

### 3. Gelistirme Sunucularini Baslat

```bash
pnpm dev
```

- **Editor** — [http://localhost:5173](http://localhost:5173)
- **API Server** — [http://localhost:3001](http://localhost:3001)
- **API Docs** — [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

### Docker ile

```bash
git clone https://github.com/SiberCoder/SiberCron.git
cd SiberCron
cp .env.example .env
# .env dosyasini duzenle, sonra:
docker compose up -d
```

---

## Mimari

```
sibercron/
├── packages/
│   ├── shared/    # TypeScript tipleri & sabitler
│   ├── core/      # Workflow execution engine (DAG, topological sort)
│   ├── nodes/     # 35+ hazir node implementasyonu
│   ├── server/    # Fastify REST API + Socket.io + AI Brain + Agent Loop
│   └── editor/    # React gorsel workflow editor
├── docker/        # Dockerfile, Compose, nginx
├── docs/          # Mimari, plugin gelistirme, self-hosting
└── templates/     # Hazir workflow sablonlari
```

### Teknoloji Yigini

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite 6 + Tailwind CSS 3 + React Flow 12 |
| State | Zustand 5 |
| Backend | Node.js + Fastify 5 + TypeScript 5.6 |
| Database | In-memory JSON store (MVP) |
| Queue | BullMQ 5 + Redis (opsiyonel) |
| Realtime | Socket.io 4 |
| AI | 13+ provider (OpenAI, Anthropic, Gemini, Ollama, Groq, vb.) |
| Monorepo | pnpm workspaces + Turborepo |
| Sifreleme | AES-256-GCM (Node.js crypto) |

---

## AI Brain — Otonom Yonetim

SiberCron'un dahili AI asistani, dogal dil ile sisteminizi yonetir:

```
"Her 5 dakikada API'mi kontrol et, dusukse Telegram'dan bana bildir"
"GitHub repo'mdaki acik issue'lari listele ve Airtable'a kaydet"
"Bu projedeki hatalari bul ve duzelt"
```

AI Brain araclari:
- Workflow yonetimi (listele, olustur, calistir, aktifle, sil)
- Calistirma gecmisi ve log erisimi
- Platform arasi mesaj gonderme
- Dosya islemleri (oku, yaz, listele)
- Kabuk komutlari calistirma
- Sistem durumu izleme

---

## API Referansi

Base URL: `http://localhost:3001/api/v1`

| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | `/workflows` | Workflow listesi (pagination, arama, filtre) |
| POST | `/workflows` | Workflow olustur |
| GET | `/workflows/:id` | Workflow detaylari |
| PUT | `/workflows/:id` | Workflow guncelle |
| DELETE | `/workflows/:id` | Workflow sil |
| POST | `/workflows/:id/execute` | Workflow calistir |
| POST | `/workflows/:id/validate` | Workflow dogrulama |
| GET | `/executions` | Calistirma gecmisi (filtre: status, workflowId, tarih) |
| GET | `/executions/:id` | Calistirma detaylari |
| GET | `/executions/:id/logs` | Canli loglar |
| GET | `/executions/trend` | 7 gunluk trend verisi |
| GET | `/executions/node-errors` | En cok hata veren node'lar |
| POST | `/chat` | AI Brain mesaj gonder |
| GET | `/chat/history` | Konusma gecmisi |
| GET | `/nodes` | Mevcut node tipleri |
| CRUD | `/credentials` | Sifrelenmis kimlik bilgileri |
| GET | `/health` | Sistem durumu |
| GET | `/metrics` | Metrikler (uptime, memory, error stats) |
| POST/GET | `/webhook/*` | Webhook tetikleme |

Tam dokumantasyon: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

---

## Plugin Gelistirme

`sibercron-node-` prefix'i ile npm paketleri olusturarak topluluk node'lari gelistirebilirsiniz:

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

Detaylar: [Plugin Development Guide](docs/plugin-development.md)

---

## Katki

Katkilarinizi bekliyoruz! [CONTRIBUTING.md](CONTRIBUTING.md) dosyasina bakiniz.

## Lisans

[MIT](LICENSE) — Ozgur ve acik kaynak.

---

Turkiye'de gelistirildi.
