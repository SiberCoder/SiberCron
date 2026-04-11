import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * ExecuteWorkflow node — Başka bir SiberCron workflow'unu çalıştırır ve sonucunu bekler.
 *
 * Kullanım senaryoları:
 *  - Modüler workflow: ortak işlemleri ayrı bir workflow'a taşı, birden fazla yerden çağır
 *  - Hata yönetimi: alt workflow'u try/catch mantığıyla çağır
 *  - Paralel çalıştırma: birden fazla ExecuteWorkflow node'unu paralel branches'ta kullan
 *
 * Not: Kendi kendini çağırma (recursive) sonsuz döngüye yol açar — kaçının.
 */
export const ExecuteWorkflowNode: INodeType = {
  definition: {
    displayName: 'Execute Workflow',
    name: 'sibercron.executeWorkflow',
    icon: 'Workflow',
    color: '#F59E0B',
    group: 'core',
    version: 1,
    description: 'Başka bir SiberCron workflow\'unu çalıştırır ve sonucunu döner',
    // Node-level timeout: kullanıcının timeoutSeconds parametresini aşabilmek için
    // 30s varsayılan yerine 1 saat olarak ayarlandı. Gerçek limit timeoutSeconds'tan gelir.
    timeout: 3_600_000, // 1 hour max
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'workflowId',
        displayName: 'Workflow ID',
        type: 'string',
        default: '',
        required: true,
        description: 'Çalıştırılacak workflow\'un ID\'si (Workflow listesinden kopyalanabilir)',
      },
      {
        name: 'triggerData',
        displayName: 'Giriş Verisi (JSON)',
        type: 'json',
        default: '{}',
        description: 'Alt workflow\'a iletilecek tetikleyici veri. Boş bırakılırsa üstten gelen item\'ın json\'ı iletilir.',
      },
      {
        name: 'waitForCompletion',
        displayName: 'Tamamlanmasını Bekle',
        type: 'boolean',
        default: true,
        description: 'true: alt workflow bitene kadar bekler ve sonucu döner. false: sadece execution ID döner (fire-and-forget).',
      },
      {
        name: 'timeoutSeconds',
        displayName: 'Zaman Aşımı (saniye)',
        type: 'number',
        default: 300,
        description: 'Tamamlanmayı beklerken maksimum bekleme süresi (saniye). 0 = sınırsız.',
        displayOptions: { show: { waitForCompletion: [true] } },
      },
      {
        name: 'serverUrl',
        displayName: 'SiberCron Sunucu URL',
        type: 'string',
        default: 'http://localhost:3001',
        description: 'SiberCron API sunucusunun adresi. Uzak sunucu için değiştirin.',
      },
      {
        name: 'apiKey',
        displayName: 'API Anahtarı (opsiyonel)',
        type: 'string',
        default: '',
        description: 'Auth aktifse kullanılacak scx_... formatında API anahtarı. AUTH_ENABLED=false ise boş bırakın.',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const workflowId = (context.getParameter('workflowId') as string)?.trim();
    const triggerDataRaw = context.getParameter('triggerData');
    const waitForCompletion = context.getParameter('waitForCompletion') as boolean ?? true;
    const timeoutSeconds = (context.getParameter('timeoutSeconds') as number) ?? 300;
    const serverUrl = ((context.getParameter('serverUrl') as string) ?? 'http://localhost:3001').replace(/\/$/, '');
    const apiKey = (context.getParameter('apiKey') as string) ?? '';

    if (!workflowId) {
      throw new Error('Workflow ID boş olamaz');
    }

    // Build trigger data: use parameter JSON or fall back to first input item's json
    let triggerData: Record<string, unknown> = {};
    if (triggerDataRaw && triggerDataRaw !== '{}') {
      try {
        triggerData = typeof triggerDataRaw === 'string'
          ? JSON.parse(triggerDataRaw)
          : triggerDataRaw as Record<string, unknown>;
      } catch {
        // fallback to empty
      }
    } else if (items.length > 0) {
      triggerData = items[0].json;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // ── Step 1: Trigger the workflow ──────────────────────────────────────
    const executeResponse = await context.helpers.httpRequest({
      method: 'POST',
      url: `${serverUrl}/api/v1/workflows/${workflowId}/execute`,
      headers,
      body: triggerData,
    }) as { id?: string; status?: string; error?: string };

    const executionId = executeResponse?.id;
    if (!executionId) {
      throw new Error(
        `Alt workflow başlatılamadı (workflow: ${workflowId}): ${executeResponse?.error ?? JSON.stringify(executeResponse)}`,
      );
    }

    context.helpers.log(`[ExecuteWorkflow] Started execution ${executionId} for workflow ${workflowId}`);

    if (!waitForCompletion) {
      return [{ json: { executionId, workflowId, status: 'started', message: 'Workflow started, not waiting for completion' } }];
    }

    // ── Step 2: Poll until complete ───────────────────────────────────────
    const pollIntervalMs = 1500; // 1.5s between polls
    const maxPolls = timeoutSeconds > 0 ? Math.ceil((timeoutSeconds * 1000) / pollIntervalMs) : Infinity;
    let polls = 0;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (polls < maxPolls) {
      await sleep(pollIntervalMs);
      polls++;

      const execResponse = await context.helpers.httpRequest({
        method: 'GET',
        url: `${serverUrl}/api/v1/executions/${executionId}`,
        headers,
      }) as {
        id?: string;
        status?: string;
        nodeResults?: Record<string, unknown>;
        errorMessage?: string;
        durationMs?: number;
        finishedAt?: string;
      };

      const status = execResponse?.status;

      if (status === 'success' || status === 'completed') {
        context.helpers.log(`[ExecuteWorkflow] Execution ${executionId} completed successfully`);
        return [{
          json: {
            executionId,
            workflowId,
            status: 'success',
            durationMs: execResponse.durationMs,
            finishedAt: execResponse.finishedAt,
            nodeResults: execResponse.nodeResults ?? {},
          },
        }];
      }

      if (status === 'error' || status === 'failed') {
        throw new Error(
          `Alt workflow başarısız (execution: ${executionId}): ${execResponse.errorMessage ?? 'Bilinmeyen hata'}`,
        );
      }

      // status === 'running' or 'pending' — keep polling
      context.helpers.log(`[ExecuteWorkflow] Polling ${executionId}... (${polls}/${maxPolls === Infinity ? '∞' : maxPolls})`);
    }

    // Timeout exceeded
    throw new Error(
      `Alt workflow zaman aşımına uğradı (execution: ${executionId}, timeout: ${timeoutSeconds}s). ` +
      `Zaman aşımı değerini artırın veya "Tamamlanmasını Bekle" seçeneğini kapatın.`,
    );
  },
};
