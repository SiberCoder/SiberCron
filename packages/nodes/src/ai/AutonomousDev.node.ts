import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/* ------------------------------------------------------------------ */
/*  Response classification                                            */
/* ------------------------------------------------------------------ */

const QUESTION_PATTERNS = [
  /\?\s*$/m,
  /\bshould I\b/i,
  /\bdo you want\b/i,
  /\bwhich (one|option|approach)\b/i,
  /\bplease (clarify|confirm|specify|choose)\b/i,
  /\bwould you (like|prefer)\b/i,
  /\bcan you (tell|provide|clarify)\b/i,
  /\bcould you\b/i,
  /\bwhat (do|should|would)\b/i,
  /\bI need (more|additional) (info|information|context|detail)\b/i,
  /\bhangisini\b/i,
  /\bhangi\b.*\bistersin/i,
  /\bne yapmami\b/i,
  /\bemin misin/i,
  /\bonaylar misin/i,
  /\bsecim yap/i,
];

function isQuestion(response: string): boolean {
  const lastParagraph = response.trim().split('\n').filter(Boolean).slice(-3).join('\n');
  return QUESTION_PATTERNS.some((p) => p.test(lastParagraph));
}

/* ------------------------------------------------------------------ */
/*  Claude CLI call                                                    */
/* ------------------------------------------------------------------ */

async function callClaude(
  prompt: string,
  model: string,
  cwd: string,
  timeoutMs: number,
  setupToken?: string,
): Promise<string> {
  const { spawn } = await import('child_process');

  const env = { ...process.env };
  if (setupToken) {
    env.CLAUDE_CODE_OAUTH_TOKEN = setupToken;
  }

  const args = ['-p', '--output-format', 'text'];
  if (model) args.push('--model', model);

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      timeout: timeoutMs,
      cwd,
      env,
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null) => {
      // code === null on Windows when process exits via stdin close - treat as success if we have output
      if (code !== 0 && code !== null && !stdout.trim()) {
        reject(new Error(`Claude CLI hata (${code}): ${stderr.trim() || stdout.trim()}`));
      } else if (!stdout.trim() && stderr.trim()) {
        reject(new Error(`Claude CLI hata: ${stderr.trim()}`));
      } else {
        resolve(stdout.trim());
      }
    });
    proc.on('error', (err: Error) => {
      reject(err);
    });

    // Write prompt to stdin and close
    proc.stdin?.write(prompt);
    proc.stdin?.end();
  });
}

/* ------------------------------------------------------------------ */
/*  Node definition                                                    */
/* ------------------------------------------------------------------ */

export const AutonomousDevNode: INodeType = {
  definition: {
    displayName: 'Otonom Gelistirme',
    name: 'sibercron.autonomousDev',
    icon: 'RefreshCcw',
    color: '#8B5CF6',
    group: 'ai',
    version: 1,
    description: 'AI ile otonom gelistirme dongusu - talimat ver, AI calissin, soru sorarsa cevapla, bitirirse tekrar baslat',
    inputs: ['main'],
    outputs: ['completed', 'maxIterations', 'stopped', 'error'],
    timeout: 14400000, // 4 hours
    properties: [
      {
        name: 'instruction',
        displayName: 'Talimat',
        type: 'code',
        required: true,
        description: 'AI\'ya verilecek gelistirme talimati (orn: "login sayfasi ekle")',
        placeholder: 'Yapilacak isi detayli olarak yazin...',
      },
      {
        name: 'workingDirectory',
        displayName: 'Calisma Dizini',
        type: 'string',
        default: '.',
        description: 'Projenin bulundugu dizin',
      },
      {
        name: 'model',
        displayName: 'Model',
        type: 'select',
        default: 'claude-sonnet-4-6',
        options: [
          { name: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
          { name: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
          { name: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
        ],
      },
      {
        name: 'maxLoopIterations',
        displayName: 'Maks Dongu Sayisi',
        type: 'number',
        default: 10,
        description: 'Guvenlik limiti - en fazla kac kez dongude kalsin',
      },
      {
        name: 'autoAnswerStrategy',
        displayName: 'Soru Cevaplama Stratejisi',
        type: 'select',
        default: 'useDefault',
        description: 'AI soru sordugunda ne yapilsin',
        options: [
          { name: 'Varsayilan cevap ver', value: 'useDefault' },
          { name: 'AI ile cevap uret', value: 'contextual' },
          { name: 'Dur, donguyu bitir', value: 'stop' },
        ],
      },
      {
        name: 'defaultAnswer',
        displayName: 'Varsayilan Cevap',
        type: 'string',
        default: 'Evet, devam et. En iyi karari sen ver.',
        description: 'AI soru sordugunda verilecek otomatik cevap',
        displayOptions: {
          show: { autoAnswerStrategy: ['useDefault'] },
        },
      },
      {
        name: 'cooldownMs',
        displayName: 'Bekleme Suresi (ms)',
        type: 'number',
        default: 2000,
        description: 'Her dongu arasi bekleme (rate-limit koruması)',
      },
      {
        name: 'iterationTimeoutMs',
        displayName: 'Iterasyon Zaman Asimi (ms)',
        type: 'number',
        default: 300000,
        description: 'Her bir AI cagrisi icin maks sure (5dk varsayilan)',
      },
      {
        name: 'systemContext',
        displayName: 'Ek Sistem Baglami',
        type: 'code',
        default: '',
        description: 'Her iterasyonda talimata eklenen ek baglamm (opsiyonel)',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const instruction = context.getParameter<string>('instruction');
    const workingDirectory = context.getParameter<string>('workingDirectory') || '.';
    const model = context.getParameter<string>('model') || 'claude-sonnet-4-6';
    const maxLoopIterations = context.getParameter<number>('maxLoopIterations') || 10;
    const autoAnswerStrategy = context.getParameter<string>('autoAnswerStrategy') || 'useDefault';
    const defaultAnswer = context.getParameter<string>('defaultAnswer') || 'Evet, devam et.';
    const cooldownMs = context.getParameter<number>('cooldownMs') || 2000;
    const iterationTimeoutMs = context.getParameter<number>('iterationTimeoutMs') || 300000;
    const systemContext = context.getParameter<string>('systemContext') || '';

    if (!instruction) {
      return [{ json: { error: 'Talimat gerekli', output: 'error' } }];
    }

    const inputData = context.getInputData();
    const dynamicInstruction = (inputData[0]?.json?.instruction as string) || instruction;
    const executionId = (inputData[0]?.json?.executionId as string) || '';

    const path = await import('node:path');
    const cwd = path.resolve(workingDirectory);

    let setupToken: string | undefined;
    try {
      const cred = await context.getCredential('aiProvider');
      setupToken = (cred?.setupToken as string) || (cred?.apiKey as string) || undefined;
    } catch { /* */ }

    // Live log emitter - sends logs via process events so server can capture
    const emitLog = (level: string, message: string, data?: Record<string, unknown>) => {
      context.helpers.log(`[AutonomousDev] ${message}`);
      try {
        process.emit('autonomousDev:log' as any, { executionId, level, message, data } as any);
      } catch { /* */ }
    };

    const conversationHistory: Array<{ role: 'instruction' | 'response' | 'answer'; content: string }> = [];
    let iterationCount = 0;
    let lastResponse = '';
    let exitReason: 'completed' | 'maxIterations' | 'error' | 'stopped' = 'maxIterations';

    emitLog('system', `Baslatiliyor: "${dynamicInstruction.slice(0, 120)}..."`, { maxIterations: maxLoopIterations, model });

    while (iterationCount < maxLoopIterations) {
      iterationCount++;

      let prompt = '';
      if (systemContext) prompt += `${systemContext}\n\n---\n\n`;
      prompt += `TALIMAT: ${dynamicInstruction}\n`;

      const recentHistory = conversationHistory.slice(-20);
      if (recentHistory.length > 0) {
        prompt += '\n--- ONCEKI ISLEMLER ---\n';
        for (const entry of recentHistory) {
          const prefix = entry.role === 'instruction' ? 'TALIMAT' : entry.role === 'response' ? 'AI' : 'KULLANICI';
          prompt += `\n${prefix}: ${entry.content}\n`;
        }
        prompt += '\n--- SIMDI DEVAM ET ---\n';
        prompt += `\nYukardaki talimata devam et. Daha once yaptiklarini tekrarlama, kaldgin yerden devam et.\n`;
      }

      emitLog('iteration', `Iterasyon ${iterationCount}/${maxLoopIterations} basliyor`, { iteration: iterationCount });
      emitLog('ai_request', `AI'ya gonderilen talimat (${prompt.length} karakter)`, { promptPreview: prompt.slice(0, 300) });

      try {
        const response = await callClaude(prompt, model, cwd, iterationTimeoutMs, setupToken);
        lastResponse = response;
        conversationHistory.push({ role: 'response', content: response });

        emitLog('ai_response', response.slice(0, 2000), { fullLength: response.length, iteration: iterationCount });

        const askedQuestion = isQuestion(response);

        if (askedQuestion) {
          emitLog('system', `AI soru sordu, strateji: ${autoAnswerStrategy}`);

          if (autoAnswerStrategy === 'stop') {
            emitLog('system', 'Strateji "dur" - dongu durduruluyor');
            exitReason = 'stopped';
            break;
          }

          let answer: string;
          if (autoAnswerStrategy === 'contextual') {
            const answerPrompt = `Bir AI gelistirici su talimati uyguluyor: "${dynamicInstruction}"\n\nAI su soruyu sordu:\n"${response.slice(-500)}"\n\nBu soruya kisa ve kararli bir cevap ver. Sadece cevabi yaz.`;
            emitLog('system', 'AI ile otomatik cevap uretiliyor...');
            try {
              answer = await callClaude(answerPrompt, model, cwd, 30000, setupToken);
            } catch {
              answer = defaultAnswer;
            }
          } else {
            answer = defaultAnswer;
          }

          conversationHistory.push({ role: 'answer', content: answer });
          emitLog('auto_answer', answer, { iteration: iterationCount });
        } else {
          emitLog('system', `Iterasyon ${iterationCount} tamamlandi, dongu devam ediyor`);
          conversationHistory.push({ role: 'instruction', content: `(Iterasyon ${iterationCount} tamamlandi, tekrar calisiyor)` });
        }
      } catch (err) {
        emitLog('error', `Hata: ${(err as Error).message}`, { iteration: iterationCount });
        exitReason = 'error';
        lastResponse = (err as Error).message;
        break;
      }

      if (iterationCount < maxLoopIterations) {
        await new Promise((r) => setTimeout(r, cooldownMs));
      }
    }

    // Natural loop exit (all iterations ran) is treated as completed
    if (exitReason === 'maxIterations') {
      exitReason = 'completed';
    }

    emitLog('system', `Sonuc: ${exitReason}, toplam ${iterationCount} iterasyon`);

    return [{
      json: {
        // branch field is used by the engine for conditional output routing
        branch: exitReason,
        output: exitReason,
        instruction: dynamicInstruction,
        totalIterations: iterationCount,
        lastResponse,
        conversationHistory: conversationHistory.map((h) => ({
          role: h.role,
          content: h.content.slice(0, 2000),
        })),
      },
    }];
  },
};
