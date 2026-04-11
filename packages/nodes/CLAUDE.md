# @sibercron/nodes — Built-in Node Implementations

17 node, sadece `@sibercron/shared`'e bağlı. Entry: `src/index.ts` → `builtinNodes: INodeType[]`

## Node Yapısı
Her node `INodeType` interface'ini implemente eder:
```typescript
{ definition: INodeTypeDefinition, execute(context: ExecutionContext): Promise<INodeExecutionData[]> }
```

## Trigger Node'ları (src/triggers/)
| Node | Type Key | Çıktı |
|------|----------|-------|
| ManualTrigger | sibercron.manualTrigger | { triggeredAt, type: 'manual' } |
| CronTrigger | sibercron.cronTrigger | { triggeredAt, cronExpression, type: 'cron' } |
| WebhookTrigger | sibercron.webhookTrigger | Gelen HTTP data veya { triggeredAt, type: 'webhook' } |

## Core Node'ları (src/core/)
| Node | Type Key | Davranış |
|------|----------|----------|
| HttpRequest | sibercron.httpRequest | GET/POST/PUT/DELETE/PATCH, context.helpers.httpRequest |
| Code | sibercron.code | `new Function('items', code)(items)` — JS çalıştır, array dönmeli |
| Conditional | sibercron.conditional | field-operator-value karşılaştırma, outputs: ['true','false'] |
| Transform | sibercron.transform | pick/rename/set field işlemleri |
| Merge | sibercron.merge | Tüm input item'ları tek array'e birleştir |
| Delay | sibercron.delay | setTimeout ile bekleme |
| Log | sibercron.log | Loglama + pass-through |

## AI Node'ları (src/ai/)
| Node | Type Key | Davranış |
|------|----------|----------|
| AIAgent | sibercron.aiAgent | Çoklu provider LLM çağrısı (OpenAI, Anthropic, Google, Ollama, OpenRouter, Groq, custom). JSON mode desteği |
| AutonomousDev | sibercron.autonomousDev | Claude CLI loop (`claude -p`), soru tespiti (regex, bilingual), 30-dk timeout, 10 iterasyon. 4 branch output: completed, maxIterations, stopped, error |

## Messaging Node'ları (src/messaging/)
| Node | Type Key | Credential |
|------|----------|------------|
| TelegramSend | sibercron.telegramSend | telegramBot (botToken) |
| DiscordSend | sibercron.discordSend | discordBot (botToken) |
| SlackSend | sibercron.slackSend | slackBot (botToken) |
| WhatsAppReceive | sibercron.whatsappReceive | WhatsApp Cloud API webhook data |
| WhatsAppSend | sibercron.whatsappSend | whatsappApi (accessToken, phoneNumberId) |

## Yeni Node Ekleme
1. `src/` altında uygun kategoride yeni dosya oluştur
2. `INodeType` implemente et (definition + execute)
3. `src/index.ts`'deki `builtinNodes` array'ine ekle
