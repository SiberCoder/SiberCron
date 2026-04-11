import crypto from 'node:crypto';
import { claudeCliService } from './claudeCliService.js';
import { aiProviderService } from './aiProviderService.js';
import { queueService } from './queueService.js';
import { schedulerService } from './schedulerService.js';
import type {
  AIProviderConfig,
  ChatMessage,
  ToolCallInfo,
  SystemState,
} from '@sibercron/shared';
import { AI_PROVIDERS } from '@sibercron/shared';

import { db } from '../db/database.js';
import { messagingService } from './messagingService.js';

// ── Tool definitions the AI can invoke ─────────────────────────────────

const BRAIN_TOOLS = [
  {
    name: 'list_workflows',
    description: 'Tum workflow\'lari listeler',
    parameters: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['all', 'active', 'inactive'], description: 'Filtreleme durumu' },
      },
    },
  },
  {
    name: 'execute_workflow',
    description: 'Bir workflow\'u calistirir',
    parameters: {
      type: 'object' as const,
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID' },
        workflowName: { type: 'string', description: 'Workflow adi (ID yerine)' },
      },
    },
  },
  {
    name: 'create_workflow',
    description: 'Yeni bir workflow olusturur',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Workflow adi' },
        description: { type: 'string', description: 'Aciklama' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_execution_history',
    description: 'Son calistirma gecmisini getirir',
    parameters: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Kac adet' },
        workflowId: { type: 'string', description: 'Belirli bir workflow icin' },
      },
    },
  },
  {
    name: 'send_message',
    description: 'Bagli bir platform uzerinden mesaj gonderir',
    parameters: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'slack'], description: 'Platform' },
        target: { type: 'string', description: 'Hedef (telefon, chat_id, kanal vb.)' },
        message: { type: 'string', description: 'Gonderilecek mesaj' },
      },
      required: ['platform', 'target', 'message'],
    },
  },
  {
    name: 'get_system_status',
    description: 'Sistem durumunu getirir',
    parameters: { type: 'object' as const, properties: {} },
  },
  {
    name: 'manage_account',
    description: 'Sosyal hesap ayarlarini yonetir',
    parameters: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['list', 'connect', 'disconnect', 'test'], description: 'Islem' },
        platform: { type: 'string', description: 'Platform adi' },
        accountId: { type: 'string', description: 'Hesap ID' },
      },
    },
  },
  {
    name: 'activate_workflow',
    description: 'Workflow\'u aktif/pasif yapar',
    parameters: {
      type: 'object' as const,
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID' },
        active: { type: 'boolean', description: 'Aktif mi?' },
      },
      required: ['workflowId', 'active'],
    },
  },
  {
    name: 'delete_workflow',
    description: 'Workflow\'u siler',
    parameters: {
      type: 'object' as const,
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID' },
      },
      required: ['workflowId'],
    },
  },
];

// ── Helpers to format tools per provider ────────────────────────────────

function toolsForOpenAI() {
  return BRAIN_TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function toolsForAnthropic() {
  return BRAIN_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

// ── The AI Brain Service ────────────────────────────────────────────────

const startTime = Date.now();

export class AIBrainService {
  private conversations: Map<string, ChatMessage[]> = new Map();
  private defaultConversationId = 'main';

  // ── Build system prompt ───────────────────────────────────────────────

  buildSystemPrompt(state: SystemState): string {
    return `Sen SiberCron AI'sin. Turkce konusursun. Workflow otomasyon platformunun beynisin. Her seyi bilirsin ve kontrol edersin.

SISTEM: v${state.version} | Uptime: ${Math.floor(state.uptime / 60)}dk | AI: ${state.aiProvider?.name || '?'} (${state.aiProvider?.model || '?'})
WORKFLOW: ${state.workflows.total} toplam, ${state.workflows.active} aktif${state.workflows.recent.length > 0 ? '\n' + state.workflows.recent.map(w => `  - ${w.name} [${w.status}]`).join('\n') : ''}
EXECUTION: ${state.executions.total} toplam (basarili:${state.executions.success} hata:${state.executions.failed} calisan:${state.executions.running})
HESAPLAR: ${state.accounts.length > 0 ? state.accounts.map(a => `${a.platform}:${a.name}[${a.status}]`).join(', ') : 'yok'}
KOMUTLAR: /yardim /durum /calistir /son${state.commands.length > 0 ? ' ' + state.commands.map(c => '/' + c.command).join(' ') : ''}

Kullanici sana guveniyorr. Sistem hakkinda sorularda yukardaki verileri kullan.`;
  }

  // gatherFullSystemData removed - agent loop handles data gathering via tools

  // ── Get system state from database ────────────────────────────────────

  async getSystemState(): Promise<SystemState> {
    const workflowList = db.listWorkflows({ limit: 100 });
    const executionList = db.listExecutions({ limit: 100 });
    const accounts = db.listSocialAccounts();
    const commands = db.getCommands();

    const activeWorkflows = workflowList.data.filter((w) => w.isActive).length;

    const successExecs = executionList.data.filter((e) => e.status === 'success').length;
    const failedExecs = executionList.data.filter((e) => e.status === 'error').length;
    const runningExecs = executionList.data.filter((e) => e.status === 'running').length;

    const recent = workflowList.data.slice(0, 10).map((w) => {
      const lastExec = executionList.data.find((e) => e.workflowId === w.id);
      return {
        id: w.id,
        name: w.name,
        status: w.isActive ? 'aktif' : 'pasif',
        lastRun: lastExec?.createdAt,
      };
    });

    // Detect AI provider config
    const setupConfig = db.getSetupConfig() as Record<string, unknown> | null;
    let aiProvider: SystemState['aiProvider'] | undefined;

    if (setupConfig) {
      const aiConfig = setupConfig.ai as { providers?: AIProviderConfig[] } | undefined;
      if (aiConfig?.providers) {
        const defaultProvider = aiConfig.providers.find((p) => p.isDefault && p.enabled)
          || aiConfig.providers.find((p) => p.enabled);
        if (defaultProvider) {
          aiProvider = {
            name: defaultProvider.displayName,
            model: defaultProvider.config.defaultModel || 'varsayilan',
            status: 'connected',
          };
        }
      }
    }

    return {
      workflows: {
        total: workflowList.total,
        active: activeWorkflows,
        recent,
      },
      executions: {
        total: executionList.total,
        success: successExecs,
        failed: failedExecs,
        running: runningExecs,
      },
      accounts: accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        name: a.name,
        status: a.status,
        messageCount: a.stats.messagesSent + a.stats.messagesReceived,
      })),
      commands: commands.map((c) => ({
        command: c.command,
        description: c.description,
      })),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '0.1.0',
      aiProvider,
    };
  }

  // ── Resolve provider config from DB credentials ───────────────────────

  private resolveProviderConfig(): AIProviderConfig | null {
    return aiProviderService.getActiveProvider();
  }

  // ── Main chat function ────────────────────────────────────────────────

  async chat(
    userMessage: string,
    conversationId?: string,
    providerConfigOverride?: AIProviderConfig,
    settings?: { maxIterations?: number; temperature?: number; outputFormat?: string },
  ): Promise<ChatMessage> {
    const convId = conversationId || this.defaultConversationId;

    // Get or create conversation
    if (!this.conversations.has(convId)) {
      this.conversations.set(convId, []);
    }
    const messages = this.conversations.get(convId)!;

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    messages.push(userMsg);

    // Keep conversation bounded: retain only the last 100 messages to avoid
    // unbounded memory growth and AI provider token limit errors on long sessions.
    const MAX_MESSAGES = 100;
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }

    // Resolve provider config
    const providerConfig = providerConfigOverride || this.resolveProviderConfig();

    if (!providerConfig) {
      const noProviderMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          'AI saglayici yapilandirilmamis. Ayarlar sayfasindan bir AI saglayici (OpenAI, Anthropic, Ollama vb.) baglayarak beni aktif hale getirebilirsiniz.\n\nSetup sirasinda bir provider secip API anahtarinizi girin, ben de sizin icin calisabilirim!',
        timestamp: new Date().toISOString(),
        metadata: {
          provider: 'none',
        },
      };
      messages.push(noProviderMsg);
      return noProviderMsg;
    }

    // Build system state and prompt
    const state = await this.getSystemState();
    let systemPrompt = this.buildSystemPrompt(state);

    // CLI delegation now uses agent loop with tools - no need to inject full data
    if (providerConfig.authMethod === 'cli_delegation') {
      console.log('[AI Brain] Using agent loop for CLI delegation');
    }

    try {
      // Call AI provider
      const response = await this.callAI(systemPrompt, messages, providerConfig, settings);

      // Handle tool calls if any (skip if already executed by agent loop)
      const hasUnexecutedTools = response.metadata?.toolCalls?.some(t => t.status !== 'success' && t.status !== 'error');
      if (hasUnexecutedTools && response.metadata?.toolCalls) {
        for (const tool of response.metadata.toolCalls) {
          if (tool.status === 'success' || tool.status === 'error') continue; // Already executed
          try {
            tool.result = await this.executeTool(tool.name, tool.args);
            tool.status = 'success';
          } catch (err) {
            tool.result = { error: (err as Error).message };
            tool.status = 'error';
          }
        }

        // Call AI again with tool results for a final natural response
        const toolResultContent = response.metadata.toolCalls
          .map((t) => `Arac: ${t.name}\nSonuc: ${JSON.stringify(t.result)}`)
          .join('\n\n');

        const toolResultMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          content: `Arac sonuclari:\n${toolResultContent}`,
          timestamp: new Date().toISOString(),
        };
        messages.push(toolResultMsg);

        // Get the final response incorporating tool results
        try {
          const finalResponse = await this.callAI(systemPrompt, messages, providerConfig, settings);
          // Carry over tool calls from the first response for UI display
          finalResponse.metadata = {
            ...finalResponse.metadata,
            toolCalls: response.metadata.toolCalls,
          };
          messages.push(finalResponse);
          return finalResponse;
        } catch {
          // If second call fails, return the original response with tool results
          messages.push(response);
          return response;
        }
      }

      messages.push(response);
      return response;
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `AI saglayici ile iletisim hatasi: ${(err as Error).message}`,
        timestamp: new Date().toISOString(),
        metadata: {
          provider: providerConfig.name,
          model: providerConfig.config.defaultModel,
        },
      };
      messages.push(errorMsg);
      return errorMsg;
    }
  }

  // ── Execute a tool action ─────────────────────────────────────────────

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case 'list_workflows': {
        const status = args.status as string | undefined;
        const query: { isActive?: boolean } = {};
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;
        const result = db.listWorkflows(query);
        return result.data.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          isActive: w.isActive,
          triggerType: w.triggerType,
          updatedAt: w.updatedAt,
        }));
      }

      case 'execute_workflow': {
        let workflowId = args.workflowId as string | undefined;
        const workflowName = args.workflowName as string | undefined;

        if (!workflowId && workflowName) {
          const all = db.listWorkflows({ limit: 100 });
          const found = all.data.find(
            (w) => w.name.toLowerCase() === workflowName.toLowerCase(),
          );
          if (found) workflowId = found.id;
        }

        if (!workflowId) {
          return { error: 'Workflow bulunamadi' };
        }

        const workflow = db.getWorkflow(workflowId);
        if (!workflow) {
          return { error: `Workflow bulunamadi: ${workflowId}` };
        }

        // Queue the workflow for actual execution (uses BullMQ or direct fallback)
        const jobId = await queueService.addWorkflowJob(workflow.id, workflow.name, {
          triggeredBy: 'ai_brain',
          triggeredAt: new Date().toISOString(),
        });

        return {
          message: `Workflow "${workflow.name}" calistirildi`,
          jobId,
          workflowId: workflow.id,
        };
      }

      case 'create_workflow': {
        const name = args.name as string;
        const description = (args.description as string) || '';
        const defaultNodes = [
          {
            id: 'trigger-1',
            type: 'sibercron.manualTrigger',
            name: 'Manuel Tetikleyici',
            position: { x: 100, y: 200 },
            parameters: {},
          },
          {
            id: 'log-1',
            type: 'sibercron.log',
            name: 'Log',
            position: { x: 400, y: 200 },
            parameters: { message: '{{timestamp}} - Workflow calistı', logLevel: 'info' },
          },
        ];
        const defaultEdges = [
          { id: 'edge-1', source: 'trigger-1', sourceHandle: 'main', target: 'log-1', targetHandle: 'main' },
        ];
        const workflow = db.createWorkflow({
          name,
          description,
          nodes: defaultNodes,
          edges: defaultEdges,
        });
        return {
          message: `Workflow "${name}" olusturuldu`,
          id: workflow.id,
          name: workflow.name,
        };
      }

      case 'get_execution_history': {
        const limit = (args.limit as number) || 10;
        const workflowId = args.workflowId as string | undefined;
        const result = db.listExecutions({ limit, workflowId });
        return result.data.map((e) => ({
          id: e.id,
          workflowId: e.workflowId,
          workflowName: e.workflowName,
          status: e.status,
          startedAt: e.startedAt,
          createdAt: e.createdAt,
        }));
      }

      case 'send_message': {
        const platform = args.platform as string;
        const target = args.target as string;
        const message = args.message as string;

        // Find an account for this platform
        const accounts = db.listSocialAccounts();
        const account = accounts.find((a) => a.platform === platform && a.status === 'connected');

        if (!account) {
          return { error: `${platform} icin bagli hesap bulunamadi` };
        }

        const sent = await messagingService.send(platform, target, message, account.id);
        return {
          success: sent,
          message: sent
            ? `Mesaj ${platform} uzerinden gonderildi`
            : `Mesaj gonderilemedi`,
          platform,
          target,
        };
      }

      case 'get_system_status': {
        return await this.getSystemState();
      }

      case 'manage_account': {
        const action = (args.action as string) || 'list';
        if (action === 'list') {
          const accounts = db.listSocialAccounts();
          return accounts.map((a) => ({
            id: a.id,
            platform: a.platform,
            name: a.name,
            status: a.status,
            messageCount: a.stats.messagesSent + a.stats.messagesReceived,
          }));
        }
        return { message: `Hesap islemi: ${action}` };
      }

      case 'activate_workflow': {
        const workflowId = args.workflowId as string;
        const active = args.active as boolean;
        const updated = db.updateWorkflow(workflowId, { isActive: active } as Record<string, unknown>);
        if (!updated) {
          return { error: `Workflow bulunamadi: ${workflowId}` };
        }
        // Sync scheduler (cron jobs)
        if (active) {
          schedulerService.onWorkflowActivated(updated);
        } else {
          schedulerService.onWorkflowDeactivated(workflowId);
        }
        return {
          message: `Workflow "${updated.name}" ${active ? 'aktif' : 'pasif'} yapildi`,
          id: updated.id,
          isActive: updated.isActive,
        };
      }

      case 'delete_workflow': {
        const workflowId = args.workflowId as string;
        const workflow = db.getWorkflow(workflowId);
        if (!workflow) {
          return { error: `Workflow bulunamadi: ${workflowId}` };
        }
        schedulerService.onWorkflowDeactivated(workflowId);
        db.deleteWorkflow(workflowId);
        return { message: `Workflow "${workflow.name}" silindi`, id: workflowId };
      }

      default:
        return { error: `Bilinmeyen arac: ${name}` };
    }
  }

  // ── Call AI provider ──────────────────────────────────────────────────

  private async callAI(
    systemPrompt: string,
    messages: ChatMessage[],
    config: AIProviderConfig,
    settings?: { maxIterations?: number; temperature?: number; outputFormat?: string },
  ): Promise<ChatMessage> {
    const provider = config.name;

    // Filter to only user/assistant messages for the API call (not system tool-result msgs)
    const conversationMsgs = messages.filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system');

    switch (provider) {
      case 'openai':
      case 'openrouter':
      case 'groq':
      case 'custom':
        return this.callOpenAICompatible(systemPrompt, conversationMsgs, config);

      case 'anthropic':
        if (config.authMethod === 'cli_delegation' || config.authMethod === 'setup_token') {
          return this.callClaudeCliDelegation(systemPrompt, conversationMsgs, config, settings);
        }
        return this.callAnthropic(systemPrompt, conversationMsgs, config);

      case 'ollama':
        return this.callOllama(systemPrompt, conversationMsgs, config);

      case 'google':
        return this.callGoogle(systemPrompt, conversationMsgs, config);

      default:
        throw new Error(`Desteklenmeyen AI saglayici: ${provider}`);
    }
  }

  // ── OpenAI-compatible API (OpenAI, OpenRouter, Groq, Custom) ──────────

  private async callOpenAICompatible(
    systemPrompt: string,
    messages: ChatMessage[],
    config: AIProviderConfig,
  ): Promise<ChatMessage> {
    const providerMeta = AI_PROVIDERS[config.name];
    let baseUrl: string;

    if (config.name === 'custom') {
      baseUrl = config.config.customBaseUrl || config.config.baseUrl || '';
    } else {
      baseUrl = config.config.baseUrl || providerMeta?.defaultBaseUrl || 'https://api.openai.com/v1';
    }

    const apiKey = config.config.apiKey || config.config.customApiKey || '';
    const model = config.config.defaultModel || 'gpt-4o';

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as string,
        content: m.content,
      })),
    ];

    const body: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      tools: toolsForOpenAI(),
      temperature: config.config.temperature ?? 0.7,
      max_tokens: config.config.maxTokens || 4096,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    // OpenRouter specific headers
    if (config.name === 'openrouter') {
      headers['HTTP-Referer'] = 'https://sibercron.com';
      headers['X-Title'] = 'SiberCron AI Brain';
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`OpenAI API hatasi (${res.status}): ${error}`);
    }

    const data = (await res.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage?: { total_tokens?: number };
    };

    const choice = data.choices[0];
    if (!choice) {
      throw new Error('AI yanit vermedi');
    }

    const toolCalls: ToolCallInfo[] = [];
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        try {
          toolCalls.push({
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments),
            status: 'pending',
          });
        } catch {
          // Skip malformed tool calls
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: choice.message.content || '',
      timestamp: new Date().toISOString(),
      metadata: {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        tokensUsed: data.usage?.total_tokens,
        model,
        provider: config.name,
      },
    };
  }

  // ── Anthropic API ─────────────────────────────────────────────────────

  // ── Claude CLI Delegation (Agent Loop) ────────────────────────────────

  private async callClaudeCliDelegation(
    systemPrompt: string,
    messages: ChatMessage[],
    config: AIProviderConfig,
    settings?: { maxIterations?: number; temperature?: number; outputFormat?: string },
  ): Promise<ChatMessage> {
    const { runAgentLoop } = await import('./agentLoop.js');

    // Enrich system prompt based on output format
    let enrichedPrompt = systemPrompt;
    if (settings?.outputFormat === 'detailed') {
      enrichedPrompt += '\n\nKullanici detayli cevap istiyor. Aciklamali ve adim adim yaz.';
    } else if (settings?.outputFormat === 'developer') {
      enrichedPrompt += '\n\nKullanici gelistirici modunda. Teknik detaylar, kod ornekleri ve sistem bilgisi ver.';
    }

    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    // For setup_token auth, pass the token so CLI can authenticate
    const setupToken = config.authMethod === 'setup_token' ? (config.config.apiKey || config.config.setupToken) : undefined;

    const result = await runAgentLoop({
      systemPrompt: enrichedPrompt,
      userMessage: lastUser?.content || '',
      conversationHistory: history.slice(0, -1), // Exclude the current message
      model: config.config.defaultModel,
      maxIterations: settings?.maxIterations,
      setupToken: setupToken as string | undefined,
    });

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: result.response,
      timestamp: new Date().toISOString(),
      metadata: {
        provider: 'anthropic',
        model: config.config.defaultModel || 'claude-cli',
        toolCalls: result.toolCalls.length > 0
          ? result.toolCalls.map(tc => ({
              name: tc.tool,
              args: tc.args,
              result: tc.result,
              status: 'success' as const,
            }))
          : undefined,
      },
    };
  }

  private async callAnthropic(
    systemPrompt: string,
    messages: ChatMessage[],
    config: AIProviderConfig,
  ): Promise<ChatMessage> {
    const baseUrl = config.config.baseUrl || 'https://api.anthropic.com/v1';
    const apiKey = config.config.apiKey || '';
    const model = config.config.defaultModel || 'claude-sonnet-4-6';

    // Anthropic expects alternating user/assistant messages
    const anthropicMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // Include system-role messages as user messages (tool results)
    for (const m of messages) {
      if (m.role === 'system' && m.content.startsWith('Arac sonuclari:')) {
        anthropicMessages.push({ role: 'user', content: m.content });
      }
    }

    const body = {
      model,
      max_tokens: config.config.maxTokens || 4096,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: toolsForAnthropic(),
      temperature: config.config.temperature ?? 0.7,
    };

    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Anthropic API hatasi (${res.status}): ${error}`);
    }

    const data = (await res.json()) as {
      content: Array<{
        type: 'text' | 'tool_use';
        text?: string;
        name?: string;
        input?: Record<string, unknown>;
        id?: string;
      }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    let content = '';
    const toolCalls: ToolCallInfo[] = [];

    for (const block of data.content) {
      if (block.type === 'text') {
        content += block.text || '';
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name || '',
          args: block.input || {},
          status: 'pending',
        });
      }
    }

    const totalTokens =
      (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      metadata: {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        tokensUsed: totalTokens || undefined,
        model,
        provider: 'anthropic',
      },
    };
  }

  // ── Ollama API ────────────────────────────────────────────────────────

  private async callOllama(
    systemPrompt: string,
    messages: ChatMessage[],
    config: AIProviderConfig,
  ): Promise<ChatMessage> {
    const baseUrl = config.config.baseUrl || 'http://localhost:11434';
    const model = config.config.defaultModel || 'llama3.1';

    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
    ];

    const body = {
      model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: config.config.temperature ?? 0.7,
        num_predict: config.config.maxTokens || 4096,
      },
    };

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000), // Ollama can be slow
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Ollama API hatasi (${res.status}): ${error}`);
    }

    const data = (await res.json()) as {
      message?: { content: string };
      eval_count?: number;
      prompt_eval_count?: number;
    };

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: data.message?.content || '',
      timestamp: new Date().toISOString(),
      metadata: {
        tokensUsed: (data.eval_count || 0) + (data.prompt_eval_count || 0) || undefined,
        model,
        provider: 'ollama',
      },
    };
  }

  // ── Google Gemini API ─────────────────────────────────────────────────

  private async callGoogle(
    systemPrompt: string,
    messages: ChatMessage[],
    config: AIProviderConfig,
  ): Promise<ChatMessage> {
    const baseUrl = config.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const apiKey = config.config.apiKey || '';
    const model = config.config.defaultModel || 'gemini-2.0-flash';

    const contents = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: config.config.temperature ?? 0.7,
        maxOutputTokens: config.config.maxTokens || 4096,
      },
    };

    const res = await fetch(
      `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Google API hatasi (${res.status}): ${error}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content: { parts: Array<{ text?: string }> };
      }>;
      usageMetadata?: { totalTokenCount?: number };
    };

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      metadata: {
        tokensUsed: data.usageMetadata?.totalTokenCount,
        model,
        provider: 'google',
      },
    };
  }

  // ── Conversation management ───────────────────────────────────────────

  getConversation(conversationId?: string): ChatMessage[] {
    return this.conversations.get(conversationId || this.defaultConversationId) || [];
  }

  clearConversation(conversationId?: string): void {
    this.conversations.delete(conversationId || this.defaultConversationId);
  }

  listConversations(): string[] {
    return Array.from(this.conversations.keys());
  }
}

export const aiBrainService = new AIBrainService();
