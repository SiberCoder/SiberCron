# @sibercron/editor — React Görsel Workflow Editörü

React 19 + Vite 6. Port: 5173. @xyflow/react 12 (canvas), Zustand 5 (state), Tailwind CSS 3.

## Sayfalar (src/pages/)
| Path | Bileşen | Açıklama |
|------|---------|----------|
| /setup | SetupWizardPage | İlk kurulum sihirbazı |
| /chat | ChatPage | AI Brain chat (varsayılan landing) |
| /dashboard | DashboardPage | İstatistikler |
| /workflows | WorkflowListPage | Workflow listesi |
| /workflows/:id | WorkflowEditorPage | Canvas editör |
| /executions | ExecutionHistoryPage | Çalıştırma geçmişi |
| /credentials | CredentialsPage | Kimlik bilgileri |
| /templates | TemplatesPage | Şablonlar |
| /accounts | SocialAccountsPage | Mesajlaşma hesapları |
| /settings | SettingsPage | Ayarlar |

`SetupGuard`: `localStorage.sibercron_setup_complete === 'true'` kontrolü, yoksa `/setup`'a yönlendirir.

## Store'lar (src/store/)
- `workflowStore` — Ana store. React Flow node/edge yönetimi + API çağrıları
  - `loadWorkflow(id)` — API'den fetch, INodeInstance[] → React Flow Node[] dönüşümü
  - `saveWorkflow()` — React Flow → INodeInstance[] dönüşümü, triggerType/cronExpression/webhookPath otomatik tespit
  - `executeWorkflow()` — POST /workflows/:id/execute
  - Tüm node'lar `type: 'siberNode'` olarak kaydedilir, `data: { nodeType, label, parameters, credentials }`
- `chatStore` — AI Brain sohbet
- `executionStore` — Çalıştırma geçmişi
- `nodeRegistryStore` — Node tip tanımları
- `setupStore` — Kurulum durumu
- `socialAccountsStore` — Sosyal hesap yönetimi

## Bileşenler (src/components/)
- `BaseNode` — Renkli, status göstergeli node bileşeni
- `NodePalette` — Kategorili, sürükleme destekli node listesi
- `NodeConfigPanel` — Dinamik form, property type'a göre
- `EditorToolbar` — Kaydet, çalıştır, aktif/pasif toggle

## API İletişimi
- Base URL: `http://localhost:3001/api/v1`
- Socket.io: `http://localhost:3001`
- Fetch ile REST API çağrıları
