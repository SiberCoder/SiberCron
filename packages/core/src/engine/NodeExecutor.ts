import type {
  INodeExecutionData,
  INodeExecutionResult,
} from '@sibercron/shared';
import { NODE_EXECUTION_TIMEOUT } from '@sibercron/shared';

import { NodeRegistry } from '../nodes/NodeRegistry.js';
import { ExecutionContext } from './ExecutionContext.js';
import { resolveParameterExpressions } from './ExpressionEvaluator.js';

/**
 * Executes a single node within a workflow.
 * Handles context creation, timing, and error wrapping.
 */
export class NodeExecutor {
  constructor(private readonly registry: NodeRegistry) {}

  async execute(
    nodeType: string,
    inputData: INodeExecutionData[],
    parameters: Record<string, unknown>,
    credentials?: Record<string, string>,
    credentialResolver?: (name: string) => Promise<Record<string, unknown>>,
  ): Promise<INodeExecutionResult> {
    const node = this.registry.get(nodeType);

    if (!node) {
      return {
        nodeId: '',
        nodeName: nodeType,
        status: 'error',
        error: `Unknown node type "${nodeType}". Make sure it is registered in the NodeRegistry.`,
      };
    }

    // Build a credential resolver that maps credential keys through the
    // provided credentials mapping, then delegates to the external resolver.
    const resolveCredential = credentialResolver && credentials
      ? async (name: string): Promise<Record<string, unknown>> => {
          const credentialId = credentials[name];
          if (!credentialId) {
            throw new Error(
              `No credential mapping found for "${name}" on this node.`,
            );
          }
          return credentialResolver(credentialId);
        }
      : undefined;

    // Resolve {{ expression }} templates in parameters before passing to the node
    const resolvedParameters = resolveParameterExpressions(parameters, {
      inputData,
      executionId: inputData[0]?.json?.executionId as string | undefined,
    });

    const context = new ExecutionContext(inputData, resolvedParameters, resolveCredential);

    const startedAt = new Date();
    try {
      const timeoutMs = node.definition.timeout ?? NODE_EXECUTION_TIMEOUT;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let output: INodeExecutionData[] = [];
      try {
        output = await Promise.race([
          node.execute(context),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`Node execution timed out after ${timeoutMs}ms`)),
              timeoutMs,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeoutHandle);
      }

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      return {
        nodeId: '',
        nodeName: node.definition.displayName,
        status: 'success',
        output: output.map((item) => item.json),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
      };
    } catch (err: unknown) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      return {
        nodeId: '',
        nodeName: node.definition.displayName,
        status: 'error',
        error: errorMessage,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
      };
    }
  }
}
