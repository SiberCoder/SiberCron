import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/* ------------------------------------------------------------------ */
/*  Response classification                                            */
/* ------------------------------------------------------------------ */

const DONE_PATTERNS = [
  /\btask (is |has been )?(complete|done|finished|accomplished)\b/i,
  /\ball (tasks?|steps?|items?) (are |have been )?(complete|done|finished)\b/i,
  /\bsuccessfully (implement|complet|finish|creat)/i,
  /\bI (have |'ve )?(complete|finish|implement|done)/i,
  /\bgörev tamamlandı\b/i,
  /\btüm (adımlar|görevler|işlemler) tamamlandı\b/i,
  /\başarıyla tamamlandı\b/i,
  /\büretim hazır\b/i,
];

function isDone(response: string): boolean {
  const lastParagraph = response.trim().split('\n').filter(Boolean).slice(-5).join('\n');
  return DONE_PATTERNS.some((p) => p.test(lastParagraph));
}

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

/**
 * Format a tool call into a clean, human-readable line for live display.
 * Instead of raw JSON like `[Tool: Bash({"command":"pnpm build 2>&1","timeout":120000})]`
 * shows: `🔧 Bash: pnpm build 2>&1`
 */
function formatToolCall(name: string, input: Record<string, unknown>): string {
  const icons: Record<string, string> = {
    Bash: '⚡', Read: '📄', Write: '✏️', Edit: '✏️', Grep: '🔍', Glob: '📂',
    Agent: '🤖', TodoWrite: '📋', WebFetch: '🌐', WebSearch: '🌐',
  };
  const icon = icons[name] ?? '🔧';

  switch (name) {
    case 'Bash': {
      const cmd = String(input.command ?? '').split('\n')[0].slice(0, 120);
      const desc = input.description ? ` — ${input.description}` : '';
      return `${icon} ${cmd}${desc}\n`;
    }
    case 'Read':
      return `${icon} Reading: ${formatPath(String(input.file_path ?? ''))}\n`;
    case 'Write':
      return `${icon} Writing: ${formatPath(String(input.file_path ?? ''))}\n`;
    case 'Edit':
      return `${icon} Editing: ${formatPath(String(input.file_path ?? ''))}\n`;
    case 'Grep':
      return `${icon} Searching: "${input.pattern}" ${input.path ? 'in ' + formatPath(String(input.path)) : ''}\n`;
    case 'Glob':
      return `${icon} Finding files: ${input.pattern}\n`;
    case 'Agent':
      return `${icon} Subtask: ${input.description ?? input.prompt?.toString().slice(0, 80) ?? name}\n`;
    case 'TodoWrite':
      return `${icon} Updating task list\n`;
    default: {
      const summary = Object.entries(input).map(([k, v]) => `${k}=${String(v).slice(0, 50)}`).join(', ');
      return `${icon} ${name}: ${summary.slice(0, 120)}\n`;
    }
  }
}

function formatPath(fullPath: string): string {
  // e:/SiberCron/packages/editor/src/pages/Foo.tsx → editor/src/pages/Foo.tsx
  return fullPath.replace(/.*?packages\//, '').replace(/\\/g, '/');
}

/* ------------------------------------------------------------------ */
/*  Claude CLI call — session-aware with live streaming                 */
/* ------------------------------------------------------------------ */

interface ClaudeCallOptions {
  prompt: string;
  model: string;
  cwd: string;
  timeoutMs: number;
  setupToken?: string;
  signal?: AbortSignal;
  /** If provided, resume this session instead of starting a new one */
  sessionId?: string;
  /** Called with each chunk of stdout as it arrives */
  onChunk?: (chunk: string) => void;
  /** Called immediately when session ID is first detected */
  onSessionId?: (sessionId: string) => void;
}

interface ClaudeCallResult {
  response: string;
  /** Session ID extracted from stderr for --continue */
  sessionId?: string;
}

async function callClaude(options: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const { prompt, model, cwd, timeoutMs, setupToken, signal, sessionId, onChunk, onSessionId } = options;
  const { spawn, execSync } = await import('child_process');
  const { existsSync } = await import('node:fs');

  const env = { ...process.env };
  if (setupToken) {
    env.CLAUDE_CODE_OAUTH_TOKEN = setupToken;
  }

  // Build args: use stream-json + verbose for real-time output
  // --resume SESSION_ID: continue in the same conversation (keeps full context)
  // --verbose: required for stream-json to work with --print
  const args: string[] = ['-p', '--verbose', '--output-format', 'stream-json', '--include-partial-messages'];
  if (sessionId) {
    args.push('--resume', sessionId);
  }
  if (model) args.push('--model', model);

  // Detect WSL UNC paths (\\wsl.localhost\...) and Linux absolute paths on Windows
  const isWindows = process.platform === 'win32';
  const isWslPath = isWindows && (
    cwd.startsWith('\\\\wsl.localhost') ||
    cwd.startsWith('//wsl.localhost') ||
    cwd.startsWith('\\\\wsl$')
  );

  // Validate cwd — if it doesn't exist, fall back to process.cwd() to avoid ENOENT
  let effectiveCwd = cwd;
  if (!existsSync(cwd)) {
    effectiveCwd = process.cwd();
  }

  // For WSL paths: run claude inside WSL so Linux tools work correctly
  // Convert UNC path \\wsl.localhost\Ubuntu\home\... -> /home/...
  let spawnCommand = 'claude';
  let spawnArgs = args;
  let spawnShell: boolean = isWindows;

  if (isWslPath) {
    const wslLinuxPath = cwd
      .replace(/^\\\\wsl\.localhost\\[^\\]+/i, '')
      .replace(/^\/\/wsl\.localhost\/[^/]+/i, '')
      .replace(/\\/g, '/') || '/';
    // Pass CLAUDE_CODE_OAUTH_TOKEN into WSL via WSLENV
    if (setupToken) {
      env.WSLENV = (env.WSLENV ? env.WSLENV + ':' : '') + 'CLAUDE_CODE_OAUTH_TOKEN/u';
    }
    const claudeCmd = `cd '${wslLinuxPath.replace(/'/g, "'\\''")}' && claude ${args.join(' ')}`;
    spawnCommand = 'wsl.exe';
    spawnArgs = ['-e', 'bash', '-lc', claudeCmd];
    spawnShell = false;
    effectiveCwd = process.cwd(); // wsl.exe spawns from a Windows cwd
  }

  return new Promise((resolve, reject) => {
    let timedOut = false;
    let aborted = false;

    const proc = spawn(spawnCommand, spawnArgs, {
      cwd: effectiveCwd,
      env,
      shell: spawnShell,
    });

    let rawStdout = '';
    let stderr = '';
    let fullResponse = '';
    let detectedSessionId: string | undefined;

    // Parse stream-json: each line is a JSON object
    // Types: "system" (init), "assistant" (partial/final text), "result" (final summary)
    let lineBuf = '';
    proc.stdout?.on('data', (d: Buffer) => {
      const text = d.toString();
      rawStdout += text;
      lineBuf += text;

      // Process complete lines
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? ''; // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          // Extract session ID — CLI uses snake_case (session_id)
          const eventSessionId = event.session_id ?? event.sessionId;
          if (eventSessionId && eventSessionId !== detectedSessionId) {
            detectedSessionId = eventSessionId;
            onSessionId?.(eventSessionId as string);
          }

          // Partial assistant message — stream to UI in human-readable format
          if (event.type === 'assistant' && event.message?.content) {
            const content = event.message.content;
            if (typeof content === 'string') {
              onChunk?.(content);
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  onChunk?.(block.text);
                } else if (block.type === 'tool_use') {
                  onChunk?.(formatToolCall(block.name, block.input));
                } else if (block.type === 'tool_result') {
                  const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
                  onChunk?.(`  ↳ ${text.slice(0, 300)}\n`);
                }
              }
            }
          }

          // Result message — final summary
          if (event.type === 'result') {
            fullResponse = event.result ?? event.content ?? '';
            if (event.sessionId) detectedSessionId = event.sessionId;
            if (event.session_id) detectedSessionId = event.session_id;
          }
        } catch {
          // Not JSON — treat as raw text output (fallback)
          if (line.trim()) {
            onChunk?.(line + '\n');
            fullResponse += line + '\n';
          }
        }
      }
    });

    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    // Kill entire process tree on Windows, single process on Unix
    const killProc = () => {
      try {
        if (process.platform === 'win32' && proc.pid) {
          execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
        } else {
          proc.kill('SIGTERM');
        }
      } catch { /* process may already be dead */ }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProc();
    }, timeoutMs);

    if (signal) {
      const onAbort = () => { aborted = true; killProc(); };
      signal.addEventListener('abort', onAbort, { once: true });
      proc.on('close', () => signal.removeEventListener('abort', onAbort));
    }

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`));
        return;
      }
      if (aborted) {
        reject(new Error('Claude CLI aborted'));
        return;
      }

      // Use fullResponse from stream-json parsing; fall back to rawStdout
      const responseText = fullResponse.trim() || rawStdout.trim();

      if (code !== 0 && code !== null && !responseText) {
        reject(new Error(`Claude CLI error (${code}): ${stderr.trim() || rawStdout.trim()}`));
      } else if (!responseText && stderr.trim()) {
        reject(new Error(`Claude CLI error: ${stderr.trim()}`));
      } else {
        // Use session ID from stream-json events, or try to extract from stderr
        const sid = detectedSessionId
          ?? stderr.match(/session[:\s]+([a-f0-9-]+)/i)?.[1]
          ?? stderr.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/)?.[1];
        resolve({
          response: responseText,
          sessionId: sid,
        });
      }
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.stdin?.write(prompt);
    proc.stdin?.end();
  });
}

/* ------------------------------------------------------------------ */
/*  Node definition                                                    */
/* ------------------------------------------------------------------ */

export const AutonomousDevNode: INodeType = {
  definition: {
    displayName: 'Autonomous Development',
    name: 'sibercron.autonomousDev',
    icon: 'RefreshCcw',
    color: '#8B5CF6',
    group: 'ai',
    version: 1,
    description: 'AI autonomous development loop - give instruction, AI works, answer if asked, restart when done',
    inputs: ['main'],
    outputs: ['completed', 'maxIterations', 'stopped', 'error'],
    timeout: 14400000, // 4 hours
    properties: [
      {
        name: 'instruction',
        displayName: 'Instruction',
        type: 'code',
        required: true,
        description: 'Development instruction for the AI (e.g., "add login page")',
        placeholder: 'Write the task in detail...',
      },
      {
        name: 'workingDirectory',
        displayName: 'Working Directory',
        type: 'string',
        default: '.',
        description: 'Directory where the project is located',
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
        displayName: 'Max Loop Iterations',
        type: 'number',
        default: 10,
        description: 'Safety limit - maximum iterations in the loop',
      },
      {
        name: 'autoAnswerStrategy',
        displayName: 'Question Answer Strategy',
        type: 'select',
        default: 'useDefault',
        description: 'What to do when AI asks a question',
        options: [
          { name: 'Use default answer', value: 'useDefault' },
          { name: 'Generate answer with AI', value: 'contextual' },
          { name: 'Stop the loop', value: 'stop' },
        ],
      },
      {
        name: 'defaultAnswer',
        displayName: 'Default Answer',
        type: 'string',
        default: 'Yes, continue. Make the best decision.',
        description: 'Auto answer when AI asks a question',
        displayOptions: {
          show: { autoAnswerStrategy: ['useDefault'] },
        },
      },
      {
        name: 'cooldownMs',
        displayName: 'Cooldown (ms)',
        type: 'number',
        default: 2000,
        description: 'Wait time between iterations (rate-limit protection)',
      },
      {
        name: 'iterationTimeoutMs',
        displayName: 'Iteration Timeout (ms)',
        type: 'number',
        default: 900000,
        description: 'Max time per AI call (15min default)',
      },
      {
        name: 'systemContext',
        displayName: 'Extra System Context',
        type: 'code',
        default: '',
        description: 'Extra context added to instruction in each iteration (optional)',
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
      return [{ json: { error: 'Instruction is required', output: 'error' } }];
    }

    const inputData = context.getInputData();
    const dynamicInstruction = (inputData[0]?.json?.instruction as string) || instruction;
    const executionId = (inputData[0]?.json?.executionId as string) || '';
    // Resume support: pick up session ID from a previous interrupted execution
    const resumeSessionId = (inputData[0]?.json?._resumeSessionId as string) || undefined;

    const path = await import('node:path');
    const cwd = path.resolve(workingDirectory);
    // Data directory for session files — always use server's DATA_DIR so executions.ts
    // can find them during resume, regardless of the workingDirectory parameter.
    const dataDir = process.env['DATA_DIR'] ?? path.join(process.cwd(), 'data');

    let setupToken: string | undefined;
    try {
      const cred = await context.getCredential('aiProvider');
      setupToken = (cred?.setupToken as string) || (cred?.apiKey as string) || undefined;
    } catch { /* */ }

    // Live log emitter
    const emitLog = (level: string, message: string, data?: Record<string, unknown>) => {
      context.helpers.log(`[AutonomousDev] ${message}`);
      try {
        (process.emit as any)('autonomousDev:log', { executionId, level, message, data });
      } catch { /* */ }
    };

    const conversationHistory: Array<{ role: 'instruction' | 'response' | 'answer'; content: string }> = [];
    let iterationCount = 0;
    let lastResponse = '';
    let exitReason: 'completed' | 'maxIterations' | 'error' | 'stopped' = 'maxIterations';
    let currentSessionId: string | undefined = resumeSessionId;

    emitLog('system', `Starting: "${dynamicInstruction.slice(0, 120)}..."${resumeSessionId ? ` (session resume: ${resumeSessionId.slice(0, 8)}...)` : ''}`, { maxIterations: maxLoopIterations, model, resumeSessionId });

    while (iterationCount < maxLoopIterations) {
      iterationCount++;

      // Build prompt
      let prompt = '';
      if (iterationCount === 1 && !resumeSessionId) {
        // First iteration (fresh start): full instruction + context + safety rules
        if (systemContext) prompt += `${systemContext}\n\n---\n\n`;
        prompt += dynamicInstruction;
        prompt += '\n\nCRITICAL RULES:\n- Do NOT create subagents/alt agents. Do all work in a single session.\n- Do NOT run build commands like pnpm build, tsc, npx tsc (dev server running, dist changes crash server).\n- Do NOT verify build after making changes.';
      } else if (iterationCount === 1 && resumeSessionId) {
        // First iteration but resuming a previous session
        prompt = 'Server restarted. Continue from where you left off. Do not repeat previous actions, pick up from where you stopped.';
        emitLog('system', 'Resuming previous session', { sessionId: resumeSessionId });
      } else {
        // Subsequent iterations: continuation prompt
        // If we have a session ID, Claude already has context — just nudge it
        if (currentSessionId) {
          const lastEntry = conversationHistory[conversationHistory.length - 1];
          if (lastEntry?.role === 'answer') {
            prompt = lastEntry.content;
          } else {
            prompt = 'Continue. Pick up from where you left off, do not repeat previous actions.';
          }
        } else {
          // No session continuity — rebuild context from history
          if (systemContext) prompt += `${systemContext}\n\n---\n\n`;
          prompt += `INSTRUCTION: ${dynamicInstruction}\n`;
          const recentHistory = conversationHistory.slice(-20);
          if (recentHistory.length > 0) {
            prompt += '\n--- PREVIOUS ACTIONS ---\n';
            for (const entry of recentHistory) {
              const prefix = entry.role === 'instruction' ? 'INSTRUCTION' : entry.role === 'response' ? 'AI' : 'USER';
              prompt += `\n${prefix}: ${entry.content.slice(0, 1000)}\n`;
            }
            prompt += '\n--- NOW CONTINUE ---\n';
            prompt += 'Continue the instruction above. Do not repeat previous actions, pick up from where you left off.\n';
          }
        }
      }

      emitLog('iteration', `Iteration ${iterationCount}/${maxLoopIterations} starting${currentSessionId ? ' (session resume)' : ' (new session)'}`, {
        iteration: iterationCount,
        sessionId: currentSessionId,
      });

      // Stream buffer for live display
      let streamBuffer = '';
      let lastEmitTime = 0;

      try {
        const result = await callClaude({
          prompt,
          model,
          cwd,
          timeoutMs: iterationTimeoutMs,
          setupToken,
          sessionId: currentSessionId,
          onChunk: (chunk) => {
            streamBuffer += chunk;
            // Emit streaming updates every 500ms to avoid flooding
            const now = Date.now();
            if (now - lastEmitTime > 500) {
              lastEmitTime = now;
              // Show last 500 chars of the stream
              const preview = streamBuffer.slice(-500);
              emitLog('ai_streaming', preview, {
                iteration: iterationCount,
                totalLength: streamBuffer.length,
              });
            }
          },
          onSessionId: (sid) => {
            // Save session ID IMMEDIATELY to disk so resume works even if server crashes
            currentSessionId = sid;
            emitLog('system', `Session ID: ${sid.slice(0, 8)}...`, { sessionId: sid });
            // Use dynamic import for ESM compatibility, write async but don't await
            import('node:fs').then((fs) => {
              const sessionFile = path.join(dataDir, `.autonomousDev-session-${executionId}.json`);
              fs.writeFileSync(sessionFile, JSON.stringify({
                sessionId: sid,
                executionId,
                iteration: iterationCount,
                timestamp: new Date().toISOString(),
              }));
              emitLog('system', `Session saved to file: ${sessionFile}`);
            }).catch(() => { /* best-effort */ });
            try {
              (process.emit as any)('autonomousDev:sessionUpdate', {
                executionId, sessionId: sid, iteration: iterationCount,
              });
            } catch { /* */ }
          },
        });

        lastResponse = result.response;
        conversationHistory.push({ role: 'response', content: result.response });

        // Session ID already saved by onSessionId callback (fires immediately).
        // Just update currentSessionId from result as a fallback.
        if (result.sessionId && !currentSessionId) {
          currentSessionId = result.sessionId;
        }

        // Emit full response
        emitLog('ai_response', result.response.slice(0, 3000), {
          fullLength: result.response.length,
          iteration: iterationCount,
          sessionId: currentSessionId,
        });

        const askedQuestion = isQuestion(result.response);
        const taskDone = !askedQuestion && isDone(result.response);

        if (taskDone) {
          emitLog('system', 'AI completed task, stopping loop');
          exitReason = 'completed';
          break;
        }

        if (askedQuestion) {
          emitLog('system', `AI asked a question, strategy: ${autoAnswerStrategy}`);

          if (autoAnswerStrategy === 'stop') {
            emitLog('system', 'Strategy "stop" - stopping loop');
            exitReason = 'stopped';
            break;
          }

          let answer: string;
          if (autoAnswerStrategy === 'contextual') {
            const answerPrompt = `An AI developer is executing this instruction: "${dynamicInstruction}"\n\nThe AI asked this question:\n"${result.response.slice(-500)}"\n\nGive a short and decisive answer to this question. Only write the answer.`;
            emitLog('system', 'Generating auto answer with AI...');
            try {
              const answerResult = await callClaude({
                prompt: answerPrompt,
                model,
                cwd,
                timeoutMs: 30000,
                setupToken,
              });
              answer = answerResult.response;
            } catch {
              answer = defaultAnswer;
            }
          } else {
            answer = defaultAnswer;
          }

          conversationHistory.push({ role: 'answer', content: answer });
          emitLog('auto_answer', answer, { iteration: iterationCount });
        } else {
          emitLog('system', `Iteration ${iterationCount} completed, loop continuing`);
          conversationHistory.push({ role: 'instruction', content: `(Iteration ${iterationCount} completed)` });
        }
      } catch (err) {
        emitLog('error', `Error: ${(err as Error).message}`, { iteration: iterationCount });
        // Session might be broken, reset it
        currentSessionId = undefined;
        exitReason = 'error';
        lastResponse = (err as Error).message;
        break;
      }

      if (iterationCount < maxLoopIterations) {
        await new Promise((r) => setTimeout(r, cooldownMs));
      }
    }

    // exitReason is 'maxIterations' only when the budget was fully exhausted
    // without an explicit done/stop/error signal. 'completed' fires when isDone()
    // detects the AI finished the task early.

    emitLog('system', `Result: ${exitReason}, total ${iterationCount} iterations, session: ${currentSessionId?.slice(0, 8) ?? 'none'}`);

    return [{
      json: {
        branch: exitReason,
        output: lastResponse,
        instruction: dynamicInstruction,
        totalIterations: iterationCount,
        lastResponse,
        sessionId: currentSessionId,
        conversationHistory: conversationHistory.map((h) => ({
          role: h.role,
          content: h.content.slice(0, 2000),
        })),
      },
    }];
  },
};
