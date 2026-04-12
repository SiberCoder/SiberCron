import { spawn } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/database.js';

// Tool definitions - what the agent can do
const AGENT_TOOLS = [
  {
    name: 'system_status',
    description: 'Get current system status (uptime, workflows, executions, accounts)',
    parameters: {},
  },
  {
    name: 'workflow_list',
    description: 'List all workflows',
    parameters: {},
  },
  {
    name: 'workflow_create',
    description: 'Create a new workflow',
    parameters: { name: 'string (required)', description: 'string', triggerType: 'manual|cron|webhook' },
  },
  {
    name: 'workflow_execute',
    description: 'Execute a workflow by ID or name',
    parameters: { id: 'string', name: 'string (alternative to id)' },
  },
  {
    name: 'workflow_delete',
    description: 'Delete a workflow by ID',
    parameters: { id: 'string (required)' },
  },
  {
    name: 'workflow_activate',
    description: 'Activate or deactivate a workflow',
    parameters: { id: 'string (required)', active: 'boolean (required)' },
  },
  {
    name: 'execution_list',
    description: 'List recent executions',
    parameters: { limit: 'number (default 10)', workflowId: 'string (optional filter)' },
  },
  {
    name: 'account_list',
    description: 'List connected social accounts',
    parameters: {},
  },
  {
    name: 'message_send',
    description: 'Send a message through a connected platform',
    parameters: { platform: 'whatsapp|telegram|discord|slack', target: 'string (chat/channel ID)', message: 'string' },
  },
  {
    name: 'credential_list',
    description: 'List stored credentials (names only, no secrets)',
    parameters: {},
  },
  {
    name: 'file_read',
    description: 'Read a file from the project directory',
    parameters: { path: 'string (required, relative to project root)' },
  },
  {
    name: 'file_write',
    description: 'Write content to a file',
    parameters: { path: 'string (required)', content: 'string (required)' },
  },
  {
    name: 'file_list',
    description: 'List files in a directory',
    parameters: { path: 'string (default: project root)', pattern: 'string (glob pattern, optional)' },
  },
  {
    name: 'shell_run',
    description: 'Run a shell command',
    parameters: { command: 'string (required)', cwd: 'string (optional, defaults to project root)' },
  },
  {
    name: 'config_get',
    description: 'Get current SiberCron configuration',
    parameters: {},
  },
  {
    name: 'config_set',
    description: 'Update SiberCron configuration',
    parameters: { key: 'string (e.g. scheduling.timezone)', value: 'any' },
  },
];

// Build the tool description for the system prompt
function buildToolsPrompt(): string {
  let prompt = 'Kullanabilicegin araclar:\n\n';
  for (const tool of AGENT_TOOLS) {
    prompt += `### ${tool.name}\n${tool.description}\n`;
    if (Object.keys(tool.parameters).length > 0) {
      prompt += `Parametreler: ${JSON.stringify(tool.parameters)}\n`;
    }
    prompt += '\n';
  }
  prompt += `Bir arac kullanmak icin cevabinda su formati kullan:
<tool_call>
{"tool": "tool_name", "args": {"param1": "value1"}}
</tool_call>

Birden fazla arac kullanabilirsin. Arac sonuclari sana gonderilecek.
Arac kullanmana gerek yoksa normal cevap ver.`;
  return prompt;
}

// Mask sensitive values in tool args before logging
function maskSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['key', 'token', 'secret', 'password', 'credential', 'auth'];
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
      masked[k] = '***masked***';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      masked[k] = maskSensitiveArgs(v as Record<string, unknown>);
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

// Whitelist of allowed base commands for shell_run.
// NOTE: 'find' is included but -exec is blocked by the backtick/$() injection check.
// Backticks and $() substitution are always rejected regardless of command.
const ALLOWED_COMMANDS = [
  // File navigation & reading
  'ls', 'cat', 'head', 'tail', 'echo', 'pwd', 'date', 'wc', 'sort', 'grep',
  // File operations
  'cp', 'mv', 'mkdir', 'rm', 'touch', 'chmod', 'chown',
  // Text processing
  'cut', 'tr', 'sed', 'awk', 'diff', 'uniq',
  // Search
  'find', 'locate', 'which', 'whereis',
  // System info
  'df', 'du', 'free', 'uname', 'whoami', 'id', 'env', 'printenv',
  // Process
  'ps', 'kill', 'pkill',
  // Network
  'curl', 'wget', 'ping', 'netstat', 'ss',
  // Node / package managers
  'node', 'npm', 'pnpm', 'npx', 'yarn',
  // Version control
  'git',
  // WSL / cross-platform
  'wsl', 'bash', 'sh', 'zsh',
  // Archive
  'tar', 'zip', 'unzip', 'gzip', 'gunzip',
  // Misc
  'xargs', 'tee', 'stat', 'file', 'strings', 'less', 'more',
];

// Validate and sanitize a shell command
function sanitizeCommand(command: string): { valid: boolean; error?: string } {
  const trimmed = command.trim();
  if (!trimmed) return { valid: false, error: 'Empty command' };

  // Split on pipes and check each segment
  const segments = trimmed.split(/\s*\|\s*/);
  for (const segment of segments) {
    const baseCommand = segment.trim().split(/\s+/)[0];
    if (!ALLOWED_COMMANDS.includes(baseCommand)) {
      return { valid: false, error: `Command not allowed: ${baseCommand}. Allowed: ${ALLOWED_COMMANDS.join(', ')}` };
    }
  }

  // Reject the most dangerous injection vectors only
  if (/`/.test(trimmed)) return { valid: false, error: 'Backticks are not allowed' };
  if (/\$\(/.test(trimmed)) return { valid: false, error: '$() substitution is not allowed' };

  return { valid: true };
}

// Execute a tool and return result
async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  console.log(`[Agent] executeTool: "${name}" args:`, JSON.stringify(maskSensitiveArgs(args)));
  const PROJECT_ROOT = path.resolve(process.cwd(), '../..');

  switch (name) {
    case 'system_status': {
      const workflows = db.listWorkflows({ limit: 100 });
      const executions = db.listExecutions({ limit: 100 });
      const accounts = db.listSocialAccounts();
      return {
        uptime: process.uptime(),
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        workflows: { total: workflows.total, active: workflows.data.filter(w => w.isActive).length },
        executions: {
          total: executions.total,
          success: executions.data.filter(e => e.status === 'success').length,
          failed: executions.data.filter(e => e.status === 'error').length,
        },
        accounts: accounts.length,
        version: '0.1.0',
      };
    }
    case 'workflow_list': {
      const list = db.listWorkflows({ limit: 50 });
      return list.data.map(w => ({
        id: w.id,
        name: w.name,
        active: w.isActive,
        trigger: w.triggerType,
        nodes: (w.nodes as unknown[])?.length || 0,
      }));
    }
    case 'workflow_create': {
      const triggerType = (args.triggerType as string) || 'manual';
      // Build default nodes based on trigger type
      const triggerNodeId = 'trigger-1';
      const logNodeId = 'log-1';
      const isCron = triggerType === 'cron';
      const defaultNodes = [
        {
          id: triggerNodeId,
          type: isCron ? 'sibercron.cronTrigger' : 'sibercron.manualTrigger',
          name: isCron ? 'Cron Tetikleyici' : 'Manuel Tetikleyici',
          position: { x: 100, y: 200 },
          parameters: isCron ? { cronExpression: '* * * * *' } : {},
        },
        {
          id: logNodeId,
          type: 'sibercron.log',
          name: 'Log',
          position: { x: 400, y: 200 },
          parameters: { message: '{{timestamp}} - Workflow calistı', logLevel: 'info' },
        },
      ];
      const defaultEdges = [
        {
          id: 'edge-1',
          source: triggerNodeId,
          sourceHandle: 'main',
          target: logNodeId,
          targetHandle: 'main',
        },
      ];
      const wf = db.createWorkflow({
        name: (args.name as string) || 'New Workflow',
        description: args.description as string,
        nodes: defaultNodes,
        edges: defaultEdges,
        triggerType: triggerType as 'manual' | 'cron' | 'webhook' | 'event',
      });
      return { success: true, id: wf.id, name: wf.name };
    }
    case 'workflow_execute': {
      // Find by name or id
      let wfId = args.id as string | undefined;
      if (!wfId && args.name) {
        const list = db.listWorkflows({ limit: 100 });
        const found = list.data.find(w => w.name.toLowerCase().includes((args.name as string).toLowerCase()));
        if (found) wfId = found.id;
      }
      if (!wfId) return { error: 'Workflow bulunamadi' };
      const wf = db.getWorkflow(wfId);
      if (!wf) return { error: 'Workflow bulunamadi' };
      if (!wf.isActive) return { error: `Workflow "${wf.name}" aktif degil. Once aktif edin.` };
      // Use queueService so credential resolver, socket events, and BullMQ retry all work correctly.
      const { queueService } = await import('./queueService.js');
      const jobId = await queueService.addWorkflowJob(wf.id, wf.name, {
        triggeredBy: 'agent_loop',
        triggeredAt: new Date().toISOString(),
      });
      return { success: true, jobId, workflowId: wf.id, workflowName: wf.name };
    }
    case 'workflow_delete': {
      // Stop scheduler before deleting so cron job doesn't keep running
      const { schedulerService } = await import('./schedulerService.js');
      schedulerService.onWorkflowDeactivated(args.id as string);
      const deleted = db.deleteWorkflow(args.id as string);
      return { success: deleted };
    }
    case 'workflow_activate': {
      const active = args.active as boolean;
      // Use db.updateWorkflow so the change is persisted and returned through normal update path.
      const updated = db.updateWorkflow(args.id as string, { isActive: active } as Record<string, unknown>);
      if (!updated) return { error: 'Workflow bulunamadi' };
      // Sync scheduler so cron jobs are started/stopped accordingly.
      const { schedulerService } = await import('./schedulerService.js');
      if (active) {
        schedulerService.onWorkflowActivated(updated);
      } else {
        schedulerService.onWorkflowDeactivated(updated.id);
      }
      return { success: true, active: updated.isActive };
    }
    case 'execution_list': {
      const list = db.listExecutions({
        limit: (args.limit as number) || 10,
        workflowId: args.workflowId as string,
      });
      return list.data.map(e => ({
        id: e.id,
        workflow: e.workflowName,
        status: e.status,
        duration: e.durationMs,
        date: e.createdAt,
      }));
    }
    case 'account_list': {
      return db.listSocialAccounts().map(a => ({
        id: a.id,
        platform: a.platform,
        name: a.name,
        status: a.status,
      }));
    }
    case 'message_send': {
      const { messagingService } = await import('./messagingService.js');
      const sent = await messagingService.send(
        args.platform as string,
        args.target as string,
        args.message as string,
        '',
      );
      return { success: sent };
    }
    case 'credential_list': {
      return db.listCredentials().map(c => ({ id: c.id, name: c.name, type: c.type }));
    }
    case 'file_read': {
      const filePath = path.resolve(PROJECT_ROOT, args.path as string);
      // Security: only allow reading within project
      if (!filePath.startsWith(PROJECT_ROOT)) return { error: 'Proje dizini disina erisilemez' };
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return {
          path: args.path,
          content: content.length > 10000 ? content.substring(0, 10000) + '\n...(truncated)' : content,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    case 'file_write': {
      const filePath = path.resolve(PROJECT_ROOT, args.path as string);
      if (!filePath.startsWith(PROJECT_ROOT)) return { error: 'Proje dizini disina yazilamaz' };
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, args.content as string, 'utf-8');
        return { success: true, path: args.path };
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    case 'file_list': {
      const dirPath = path.resolve(PROJECT_ROOT, (args.path as string) || '');
      if (!dirPath.startsWith(PROJECT_ROOT)) return { error: 'Proje dizini disina erisilemez' };
      try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        return items.slice(0, 50).map(i => ({
          name: i.name,
          type: i.isDirectory() ? 'dir' : 'file',
        }));
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    case 'shell_run': {
      const commandStr = args.command as string;
      const validation = sanitizeCommand(commandStr);
      if (!validation.valid) {
        return { error: `Command rejected: ${validation.error}` };
      }
      const rawCwd = args.cwd ? path.resolve(PROJECT_ROOT, args.cwd as string) : PROJECT_ROOT;
      // Prevent path traversal: cwd must stay within PROJECT_ROOT
      const cwd = rawCwd.startsWith(PROJECT_ROOT) ? rawCwd : PROJECT_ROOT;
      const isWindows = process.platform === 'win32';
      return new Promise((resolve) => {
        const proc = isWindows
          ? spawn('powershell.exe', ['-NoProfile', '-Command', commandStr], { cwd, timeout: 30000, shell: false })
          : spawn('bash', ['-c', commandStr], { cwd, timeout: 30000, shell: false });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d: Buffer) => {
          stdout += d.toString();
        });
        proc.stderr?.on('data', (d: Buffer) => {
          stderr += d.toString();
        });
        proc.on('close', (code) => {
          resolve({
            exitCode: code,
            stdout: stdout.substring(0, 5000),
            stderr: stderr.substring(0, 2000),
          });
        });
        proc.on('error', (e) => resolve({ error: e.message }));
      });
    }
    case 'config_get': {
      return db.getSetupConfig();
    }
    case 'config_set': {
      const current = (db.getSetupConfig() || {}) as Record<string, unknown>;
      const keys = (args.key as string).split('.');
      let obj = current;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
        obj = obj[keys[i]] as Record<string, unknown>;
      }
      obj[keys[keys.length - 1]] = args.value;
      db.saveSetupConfig(current);
      return { success: true };
    }
    default:
      return { error: `Bilinmeyen arac: ${name}` };
  }
}

// Parse tool calls from Claude's response
function parseToolCalls(text: string): Array<{ tool: string; args: Record<string, unknown> }> {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const regex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as { tool?: string; args?: Record<string, unknown> };
      if (parsed.tool) calls.push({ tool: parsed.tool, args: parsed.args || {} });
    } catch {
      /* skip malformed */
    }
  }
  return calls;
}

// Get text content (everything outside tool_call blocks)
function getTextContent(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
}

// The main agent loop
export async function runAgentLoop(options: {
  systemPrompt: string;
  userMessage: string;
  conversationHistory: Array<{ role: string; content: string }>;
  model?: string;
  maxIterations?: number;
  setupToken?: string;
}): Promise<{
  response: string;
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: unknown }>;
}> {
  const maxIter = options.maxIterations || 5;
  const allToolCalls: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> = [];

  // Build initial prompt
  const toolsPrompt = buildToolsPrompt();
  let currentPrompt = `${options.systemPrompt}\n\n${toolsPrompt}`;

  // Add conversation history
  for (const msg of options.conversationHistory.slice(-6)) {
    const prefix = msg.role === 'user' ? 'Kullanici' : 'Asistan';
    currentPrompt += `\n\n${prefix}: ${msg.content}`;
  }

  currentPrompt += `\n\nKullanici: ${options.userMessage}`;

  for (let i = 0; i < maxIter; i++) {
    // Call Claude
    const response = await callClaude(currentPrompt, options.model, options.setupToken);

    // Parse tool calls
    const toolCalls = parseToolCalls(response);

    if (toolCalls.length === 0) {
      // No tool calls - return final response
      return { response: getTextContent(response) || response, toolCalls: allToolCalls };
    }

    // Execute tools
    const results: string[] = [];
    for (const tc of toolCalls) {
      const result = await executeTool(tc.tool, tc.args);
      allToolCalls.push({ ...tc, result });
      results.push(`Arac: ${tc.tool}\nSonuc: ${JSON.stringify(result, null, 2)}`);
    }

    // Append results and continue
    currentPrompt += `\n\nAsistan: ${response}\n\n[Arac Sonuclari]\n${results.join('\n\n')}\n\nYukardaki arac sonuclarina gore kullaniciya cevap ver. Baska arac kullanman gerekiyorsa kullan.`;
  }

  // Max iterations reached
  return { response: 'Maksimum islem sayisina ulasildi.', toolCalls: allToolCalls };
}

// Call Claude CLI with prompt via stdin (cross-platform, no temp file needed)
async function callClaude(prompt: string, model?: string, setupToken?: string): Promise<string> {
  const args = ['-p', '--output-format', 'text'];
  if (model) args.push('--model', model);

  // Pass setup token as environment variable if provided
  const env = { ...process.env };
  if (setupToken) {
    env.CLAUDE_CODE_OAUTH_TOKEN = setupToken;
  }

  // On Windows, .cmd scripts require shell:true to be resolved by the OS
  const isWindows = process.platform === 'win32';

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      timeout: 120000,
      env,
      shell: isWindows,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    // Write prompt to claude's stdin, then close it
    proc.stdin?.write(prompt, 'utf-8');
    proc.stdin?.end();

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        const errDetail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`Claude CLI hata: ${errDetail}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err: Error) => { reject(err); });
  });
}

export { AGENT_TOOLS, buildToolsPrompt, executeTool, parseToolCalls };
