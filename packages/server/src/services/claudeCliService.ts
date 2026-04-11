import { spawn } from 'child_process';

export interface CliBackendConfig {
  command: string;      // 'claude' or full path
  args?: string[];
  sessionId?: string;
  timeout?: number;     // ms, default 120000
}

export interface CliBackendStatus {
  available: boolean;
  version?: string;
  path?: string;
  authenticated?: boolean;
  error?: string;
}

export class ClaudeCliService {
  /** Check if Claude CLI is installed and authenticated */
  async checkStatus(): Promise<CliBackendStatus> {
    try {
      const result = await this.execCommand('claude', ['--version']);
      const version = result.stdout.trim();

      // Check auth status
      let authenticated = false;
      try {
        const authCheck = await this.execCommand('claude', ['--print-system-prompt'], 5000);
        authenticated = authCheck.exitCode === 0;
      } catch {
        authenticated = false;
      }

      // Find path
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      const whichResult = await this.execCommand(whichCmd, ['claude']);

      return {
        available: true,
        version,
        path: whichResult.stdout.trim().split('\n')[0],
        authenticated,
      };
    } catch (err) {
      return { available: false, error: (err as Error).message };
    }
  }

  /**
   * Send a prompt to Claude CLI and get response.
   * This delegates to the locally installed Claude binary which handles its own auth.
   */
  async chat(prompt: string, options?: { systemPrompt?: string; model?: string; maxTokens?: number }): Promise<string> {
    const args: string[] = ['-p', prompt];
    if (options?.model) args.push('--model', options.model);
    if (options?.maxTokens) args.push('--max-tokens', String(options.maxTokens));

    const result = await this.execCommand('claude', args, 120000);
    if (result.exitCode !== 0) {
      throw new Error(`Claude CLI error: ${result.stderr}`);
    }
    return result.stdout;
  }

  private execCommand(
    command: string,
    args: string[],
    timeout = 30000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { shell: true, timeout });
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });
      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}

export const claudeCliService = new ClaudeCliService();
