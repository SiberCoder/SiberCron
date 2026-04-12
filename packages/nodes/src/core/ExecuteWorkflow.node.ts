import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * ExecuteWorkflow node — Executes another SiberCron workflow and waits for result.
 *
 * Use cases:
 *  - Modular workflow: move common operations to separate workflow, call from multiple places
 *  - Error handling: call sub-workflow with try/catch logic
 *  - Parallel execution: use multiple ExecuteWorkflow nodes in parallel branches
 *
 * Note: Self-calling (recursive) causes infinite loop — avoid it.
 */
export const ExecuteWorkflowNode: INodeType = {
  definition: {
    displayName: 'Execute Workflow',
    name: 'sibercron.executeWorkflow',
    icon: 'Workflow',
    color: '#F59E0B',
    group: 'core',
    version: 1,
    description: 'Execute another SiberCron workflow and return its result',
    // Node-level timeout: to allow user timeoutSeconds parameter to be respected
    // Set to 1 hour instead of 30s default. Actual limit comes from timeoutSeconds.
    timeout: 3_600_000, // 1 hour max
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'workflowId',
        displayName: 'Workflow',
        type: 'workflowId',
        default: '',
        required: true,
        description: 'Select the workflow to execute',
      },
      {
        name: 'triggerData',
        displayName: 'Input Data (JSON)',
        type: 'json',
        default: '{}',
        description: 'Trigger data to pass to sub-workflow. If empty, uses input item JSON.',
      },
      {
        name: 'waitForCompletion',
        displayName: 'Wait for Completion',
        type: 'boolean',
        default: true,
        description: 'true: wait for sub-workflow to finish and return result. false: only return execution ID (fire-and-forget).',
      },
      {
        name: 'timeoutSeconds',
        displayName: 'Timeout (seconds)',
        type: 'number',
        default: 300,
        description: 'Maximum wait time for completion (seconds). 0 = unlimited.',
        displayOptions: { show: { waitForCompletion: [true] } },
      },
      {
        name: 'serverUrl',
        displayName: 'SiberCron Server URL',
        type: 'string',
        default: 'http://localhost:3001',
        description: 'Address of SiberCron API server. Change for remote server.',
      },
      {
        name: 'apiKey',
        displayName: 'API Key (optional)',
        type: 'password',
        default: '',
        description: 'API key in scx_... format when auth is enabled. Leave empty if AUTH_ENABLED=false.',
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

    if (!workflowId || workflowId.trim() === '') {
      throw new Error('ExecuteWorkflow: workflowId parameter is required');
    }

    // Self-call protection: detect if target workflow is the same as the currently running one
    const currentWorkflowId = items[0]?.json?.['_workflowId'] as string | undefined;
    if (currentWorkflowId && workflowId === currentWorkflowId) {
      throw new Error(
        `ExecuteWorkflow: Self-call detected — workflow "${workflowId}" cannot call itself. ` +
        `This would cause an infinite loop.`,
      );
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
        `Failed to start sub-workflow (workflow: ${workflowId}): ${executeResponse?.error ?? JSON.stringify(executeResponse)}`,
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

    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    while (polls < maxPolls) {
      await sleep(pollIntervalMs);
      polls++;

      let execResponse: {
        id?: string;
        status?: string;
        nodeResults?: Record<string, unknown>;
        errorMessage?: string;
        durationMs?: number;
        finishedAt?: string;
      };

      try {
        execResponse = await context.helpers.httpRequest({
          method: 'GET',
          url: `${serverUrl}/api/v1/executions/${executionId}`,
          headers,
        }) as typeof execResponse;
        consecutiveErrors = 0;
      } catch (pollErr) {
        consecutiveErrors++;
        context.helpers.log(
          `[ExecuteWorkflow] Poll ${polls} failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${(pollErr as Error).message}`,
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(
            `Failed to get sub-workflow status (execution: ${executionId}): ${MAX_CONSECUTIVE_ERRORS} consecutive poll errors. Last error: ${(pollErr as Error).message}`,
          );
        }
        continue;
      }

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
          `Sub-workflow failed (execution: ${executionId}): ${execResponse.errorMessage ?? 'Unknown error'}`,
        );
      }

      // status === 'running' or 'pending' — keep polling
      context.helpers.log(`[ExecuteWorkflow] Polling ${executionId}... (${polls}/${maxPolls === Infinity ? '∞' : maxPolls})`);
    }

    // Timeout exceeded
    throw new Error(
      `Sub-workflow timed out (execution: ${executionId}, timeout: ${timeoutSeconds}s). ` +
      `Increase timeout value or disable "Wait for Completion" option.`,
    );
  },
};
