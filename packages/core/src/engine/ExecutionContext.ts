import type {
  IExecutionContext,
  INodeExecutionData,
  HttpRequestOptions,
  HttpFullResponse,
} from '@sibercron/shared';

/**
 * Per-node execution context supplied to every node's `execute()` call.
 * Provides access to input data, parameters, credentials, and helper utilities.
 */
export class ExecutionContext implements IExecutionContext {
  private readonly inputData: INodeExecutionData[];
  private readonly parameters: Record<string, unknown>;
  private readonly credentialResolver?: (
    name: string,
  ) => Promise<Record<string, unknown>>;

  public readonly helpers: IExecutionContext['helpers'];

  constructor(
    inputData: INodeExecutionData[],
    parameters: Record<string, unknown>,
    credentialResolver?: (name: string) => Promise<Record<string, unknown>>,
  ) {
    this.inputData = inputData;
    this.parameters = parameters;
    this.credentialResolver = credentialResolver;

    this.helpers = {
      httpRequest: this.httpRequest.bind(this),
      log: this.log.bind(this),
    };
  }

  getInputData(): INodeExecutionData[] {
    return this.inputData;
  }

  getParameter<T = unknown>(name: string): T {
    return this.parameters[name] as T;
  }

  async getCredential(name: string): Promise<Record<string, unknown>> {
    if (!this.credentialResolver) {
      throw new Error(
        `No credential resolver configured. Cannot resolve credential "${name}".`,
      );
    }

    return this.credentialResolver(name);
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async httpRequest(options: HttpRequestOptions): Promise<unknown> {
    const { url, method = 'GET', headers, body, timeout, returnFullResponse } = options;

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeout && timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    // Automatically set Content-Type for JSON bodies unless already specified
    const mergedHeaders: Record<string, string> = { ...headers };
    if (body !== undefined) {
      const contentTypeLower = Object.keys(mergedHeaders).find(
        (k) => k.toLowerCase() === 'content-type',
      );
      if (!contentTypeLower) {
        mergedHeaders['Content-Type'] = 'application/json';
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';

      // Parse body regardless of status for full-response mode
      let parsedBody: unknown;
      if (contentType.includes('application/json')) {
        try { parsedBody = await response.json(); } catch { parsedBody = await response.text(); }
      } else {
        parsedBody = await response.text();
      }

      if (returnFullResponse) {
        // Collect all response headers into a plain object
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key] = value; });

        return {
          statusCode: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: parsedBody,
          ok: response.ok,
        } satisfies HttpFullResponse;
      }

      if (!response.ok) {
        const bodyStr = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
        throw new Error(
          `HTTP ${response.status} ${response.statusText}: ${bodyStr}`,
        );
      }

      return parsedBody;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`HTTP request timed out after ${timeout ?? 0}ms for ${url}`);
      }
      throw err;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  private log(message: string): void {
    console.log(`[SiberCron] ${message}`);
  }
}
