import crypto from 'node:crypto';

import type {
  IWorkflow,
  IExecution,
  INodeExecutionData,
  INodeExecutionResult,
  INodeInstance,
  IEdge,
} from '@sibercron/shared';

import { NodeRegistry } from '../nodes/NodeRegistry.js';
import { NodeExecutor } from './NodeExecutor.js';

export type ExecutionEventHandler = (event: string, data: unknown) => void;
export type CredentialResolver = (id: string) => Promise<Record<string, unknown>>;

/**
 * Main workflow orchestrator.
 * Resolves execution order via topological sort, runs each node in sequence,
 * and wires outputs between connected nodes.
 */
export class WorkflowEngine {
  private readonly executor: NodeExecutor;

  constructor(private readonly registry: NodeRegistry) {
    this.executor = new NodeExecutor(registry);
  }

  async execute(
    workflow: IWorkflow,
    triggerData?: Record<string, unknown>,
    onEvent?: ExecutionEventHandler,
    credentialResolver?: CredentialResolver,
    /** Pass previous nodeResults to resume from where it left off. Completed nodes will be skipped. */
    resumeFrom?: Record<string, INodeExecutionResult>,
  ): Promise<IExecution> {
    const executionId = crypto.randomUUID();
    // If the server passed an API execution ID, use that for node input injection
    // so nodes like AutonomousDev can correlate logs with the correct execution.
    const nodeExecutionId = (triggerData?._apiExecutionId as string) || executionId;
    const startedAt = new Date();

    const emit = (event: string, data: unknown): void => {
      onEvent?.(event, data);
    };

    emit('execution:started', { executionId, workflowId: workflow.id });

    const execution: IExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      triggerType: workflow.triggerType,
      nodeResults: {},
      startedAt: startedAt.toISOString(),
      createdAt: startedAt.toISOString(),
    };

    // ── Workflow-level timeout ────────────────────────────────────────
    // If any node has a custom timeout longer than the workflow timeout,
    // extend the workflow timeout to accommodate it (e.g. AutonomousDev = 4h).
    const maxNodeTimeout = workflow.nodes.reduce((max, n) => {
      const nodeDef = this.registry.get(n.type);
      return Math.max(max, nodeDef?.definition.timeout ?? 0);
    }, 0);
    const configuredTimeout = workflow.settings?.timeout ?? 300_000; // default 5 min
    const workflowTimeoutMs = Math.max(configuredTimeout, maxNodeTimeout > 0 ? maxNodeTimeout + 60_000 : 0);
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    // Shared cancellation flag — prevents runExecution from overwriting the
    // timeout error status if it continues running after the timeout fires.
    let cancelled = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => {
          cancelled = true;
          reject(new Error(`Workflow timed out after ${workflowTimeoutMs / 1000}s`));
        },
        workflowTimeoutMs,
      );
    });

    const runExecution = async () => {
    try {
      // ── Build graph structures ──────────────────────────────────────
      const nodeMap = new Map<string, INodeInstance>();
      for (const node of workflow.nodes) {
        nodeMap.set(node.id, node);
      }

      const { adjacency, incomingEdges, inDegree } = buildGraph(
        workflow.nodes,
        workflow.edges,
      );

      // ── Find trigger node ───────────────────────────────────────────
      const triggerNode = findTriggerNode(workflow.nodes, inDegree);

      if (!triggerNode) {
        throw new Error(
          'No trigger node found. A workflow must have at least one trigger node ' +
            '(a node with group "trigger" or no incoming edges).',
        );
      }

      // ── Topological sort (Kahn's algorithm) ─────────────────────────
      const sortedNodeIds = topologicalSort(
        workflow.nodes,
        adjacency,
        inDegree,
        triggerNode.id,
      );

      // ── Execute nodes in order ──────────────────────────────────────
      // Stores the output data produced by each node, keyed by node ID.
      const nodeOutputs = new Map<string, INodeExecutionData[]>();
      // Tracks nodes explicitly skipped due to conditional branching (not due to failure).
      // Used by shouldSkipNode to distinguish "failed but continueOnFail" from "wrong branch".
      const skippedNodeIds = new Set<string>();

      // ── Resume support: pre-populate outputs from previous run ─────
      if (resumeFrom) {
        for (const [nodeId, prevResult] of Object.entries(resumeFrom)) {
          if (prevResult.status === 'success' && prevResult.output) {
            nodeOutputs.set(nodeId, prevResult.output.map((json) => ({ json })));
          } else if (prevResult.status === 'skipped') {
            skippedNodeIds.add(nodeId);
          }
        }
      }

      for (const nodeId of sortedNodeIds) {
        // Stop executing further nodes if the workflow was cancelled by timeout
        if (cancelled) break;

        const nodeInstance = nodeMap.get(nodeId);
        if (!nodeInstance) continue;

        // Skip nodes already completed in a previous run (resume mode)
        if (resumeFrom?.[nodeId]?.status === 'success' || resumeFrom?.[nodeId]?.status === 'skipped') {
          execution.nodeResults[nodeId] = resumeFrom[nodeId];
          emit('execution:node:done', {
            executionId,
            nodeId,
            nodeName: nodeInstance.name,
            status: resumeFrom[nodeId].status,
            output: resumeFrom[nodeId].output,
            durationMs: 0,
          });
          continue;
        }

        // Determine if this node should be skipped due to conditional branching
        if (shouldSkipNode(nodeId, incomingEdges, nodeOutputs, skippedNodeIds)) {
          skippedNodeIds.add(nodeId);
          execution.nodeResults[nodeId] = {
            nodeId,
            nodeName: nodeInstance.name,
            status: 'skipped',
          };
          // Emit so the live UI can immediately show the skipped status
          emit('execution:node:done', {
            executionId,
            nodeId,
            nodeName: nodeInstance.name,
            status: 'skipped',
            durationMs: 0,
          });
          continue;
        }

        const nodeStartedAt = new Date().toISOString();
        emit('execution:node:start', { executionId, nodeId, nodeName: nodeInstance.name, startedAt: nodeStartedAt });

        // Collect input data from all upstream nodes connected to this node
        const inputData = gatherInputData(
          nodeId,
          incomingEdges,
          nodeOutputs,
          triggerData,
          nodeId === triggerNode.id,
        );

        // Inject executionId and resume data into input so nodes can use them.
        const resumeSessionId = triggerData?._resumeSessionId as string | undefined;
        for (const item of inputData) {
          item.json.executionId = nodeExecutionId;
          if (resumeSessionId) {
            item.json._resumeSessionId = resumeSessionId;
          }
        }

        // Build a stream emitter for AI nodes: emits tokens via process events
        const streamEmitter = (token: string) => {
          process.emit('ai:stream', {
            executionId,
            nodeId,
            nodeName: nodeInstance.name,
            token,
          });
        };

        const result = await this.executor.execute(
          nodeInstance.type,
          inputData,
          nodeInstance.parameters,
          nodeInstance.credentials,
          credentialResolver,
          executionId,
          streamEmitter,
        );

        // Stamp the actual node ID onto the result
        result.nodeId = nodeId;
        result.nodeName = nodeInstance.name;

        // Store full output for downstream nodes BEFORE truncation
        if (result.status === 'success' && result.output) {
          nodeOutputs.set(nodeId, result.output.map((json) => ({ json })));
        }

        // Truncate output stored in the execution record to prevent large payloads
        // from bloating the database. Downstream nodes already got the full data above.
        const MAX_STORED_ITEMS = 500;
        const storedResult: INodeExecutionResult =
          result.output && result.output.length > MAX_STORED_ITEMS
            ? {
                ...result,
                output: [
                  ...result.output.slice(0, MAX_STORED_ITEMS),
                  {
                    _truncated: true,
                    _totalItems: result.output.length,
                    _storedItems: MAX_STORED_ITEMS,
                    _message: `Output truncated: first ${MAX_STORED_ITEMS} of ${result.output.length} items stored`,
                  },
                ],
              }
            : result;

        const nodeFinishedAt = new Date().toISOString();
        // Stamp timestamps onto the stored result for the timeline chart
        storedResult.startedAt = nodeStartedAt;
        storedResult.finishedAt = nodeFinishedAt;
        execution.nodeResults[nodeId] = storedResult;

        emit('execution:node:done', {
          executionId,
          nodeId,
          nodeName: storedResult.nodeName,
          status: storedResult.status,
          output: storedResult.output,
          error: storedResult.error,
          durationMs: storedResult.durationMs ?? 0,
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
        });

        // If a node fails and the workflow is not configured to continue, stop.
        if (result.status === 'error' && !workflow.settings?.continueOnFail) {
          throw new Error(
            `Node "${nodeInstance.name}" (${nodeId}) failed: ${result.error}`,
          );
        }
      }

      // ── Finalise execution ──────────────────────────────────────────
      // Don't overwrite the timeout error set by the outer catch
      if (!cancelled) {
        const finishedAt = new Date();
        execution.status = 'success';
        execution.finishedAt = finishedAt.toISOString();
        execution.durationMs = finishedAt.getTime() - startedAt.getTime();
      }
    } catch (err: unknown) {
      // Don't overwrite the timeout error set by the outer catch
      if (!cancelled) {
        const finishedAt = new Date();
        execution.status = 'error';
        execution.errorMessage =
          err instanceof Error ? err.message : String(err);
        execution.finishedAt = finishedAt.toISOString();
        execution.durationMs = finishedAt.getTime() - startedAt.getTime();
      }
    }

    return execution;
    }; // end runExecution

    try {
      await Promise.race([runExecution(), timeoutPromise]);
    } catch (err: unknown) {
      const finishedAt = new Date();
      execution.status = 'error';
      execution.errorMessage = err instanceof Error ? err.message : String(err);
      execution.finishedAt = finishedAt.toISOString();
      execution.durationMs = finishedAt.getTime() - startedAt.getTime();
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    }

    emit('execution:completed', {
      executionId,
      status: execution.status,
      durationMs: execution.durationMs ?? 0,
      finishedAt: execution.finishedAt,
      errorMessage: execution.errorMessage,
    });

    return execution;
  }
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

interface GraphInfo {
  /** nodeId -> list of target nodeIds */
  adjacency: Map<string, string[]>;
  /** nodeId -> list of edges coming into this node */
  incomingEdges: Map<string, IEdge[]>;
  /** nodeId -> count of incoming edges */
  inDegree: Map<string, number>;
}

function buildGraph(nodes: INodeInstance[], edges: IEdge[]): GraphInfo {
  const adjacency = new Map<string, string[]>();
  const incomingEdges = new Map<string, IEdge[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    incomingEdges.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    const targets = adjacency.get(edge.source);
    if (targets) {
      targets.push(edge.target);
    }

    const incoming = incomingEdges.get(edge.target);
    if (incoming) {
      incoming.push(edge);
    }

    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  return { adjacency, incomingEdges, inDegree };
}

function findTriggerNode(
  nodes: INodeInstance[],
  inDegree: Map<string, number>,
): INodeInstance | undefined {
  // Prefer a node whose type name contains "trigger" or belongs to the trigger group.
  // Since we don't have full node-type metadata here, we check the type name heuristic
  // and fall back to a node with zero in-degree.
  const triggerByName = nodes.find(
    (n) =>
      n.type.toLowerCase().includes('trigger') ||
      n.type.toLowerCase().includes('cron') ||
      n.type.toLowerCase().includes('webhook'),
  );
  if (triggerByName) return triggerByName;

  // Fall back: first node with no incoming edges
  return nodes.find((n) => (inDegree.get(n.id) ?? 0) === 0);
}

function topologicalSort(
  nodes: INodeInstance[],
  adjacency: Map<string, string[]>,
  inDegreeSrc: Map<string, number>,
  triggerNodeId?: string,
): string[] {
  // Work on a copy so we don't mutate the original
  const inDegree = new Map(inDegreeSrc);
  const queue: string[] = [];

  // Add trigger node first so it always executes before other root nodes
  if (triggerNodeId && (inDegree.get(triggerNodeId) ?? 0) === 0) {
    queue.push(triggerNodeId);
  }
  for (const node of nodes) {
    if (node.id !== triggerNodeId && (inDegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
    }
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbour of adjacency.get(current) ?? []) {
      const deg = (inDegree.get(neighbour) ?? 1) - 1;
      inDegree.set(neighbour, deg);
      if (deg === 0) {
        queue.push(neighbour);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    const processedSet = new Set(sorted);
    const cycleNodes = nodes
      .filter((n) => !processedSet.has(n.id))
      .map((n) => n.name || n.id);
    throw new Error(
      `Workflow contains a cycle involving nodes: ${cycleNodes.join(', ')}. Topological sort could not complete.`,
    );
  }

  return sorted;
}

/**
 * Determines whether a node should be skipped because it sits on a
 * conditional branch that was not taken.
 *
 * A conditional node signals which branch to follow by including a `branch`
 * field in its output JSON. Only edges whose `sourceHandle` matches the
 * branch value should propagate; downstream nodes reachable exclusively
 * through non-matching handles are skipped.
 *
 * NOTE: A node that failed while `continueOnFail=true` has no output but
 * should NOT block its downstream — only explicitly skipped nodes (wrong
 * conditional branch) should propagate the skip. We distinguish them via
 * `skippedNodeIds`.
 */
function shouldSkipNode(
  nodeId: string,
  incomingEdges: Map<string, IEdge[]>,
  nodeOutputs: Map<string, INodeExecutionData[]>,
  skippedNodeIds: Set<string>,
): boolean {
  const incoming = incomingEdges.get(nodeId) ?? [];
  if (incoming.length === 0) return false;

  // A node is skipped only when *every* incoming edge comes from a
  // conditional source whose chosen branch does not match.
  let allBlocked = true;

  for (const edge of incoming) {
    const sourceOutput = nodeOutputs.get(edge.source);

    if (!sourceOutput || sourceOutput.length === 0) {
      if (skippedNodeIds.has(edge.source)) {
        // Source was explicitly skipped (wrong conditional branch) → this path is blocked.
        continue;
      }
      // Source had no output due to failure (continueOnFail) or is a trigger with no data.
      // Treat this path as open so downstream nodes still execute.
      allBlocked = false;
      break;
    }

    // Check if the source output specifies branch routing
    const firstItem = sourceOutput[0];
    const firstBranch = firstItem.json['branch'];

    if (firstBranch === undefined) {
      // Source is not conditional — this path is always open
      allBlocked = false;
      break;
    }

    // Source uses branch routing. Check if any item's branch matches this edge's handle.
    const handle = edge.sourceHandle ?? undefined;
    if (handle === undefined) {
      // Edge has no sourceHandle → accepts any branch output
      allBlocked = false;
      break;
    }
    const hasMatchingItem = sourceOutput.some((item) => String(item.json['branch']) === handle);
    if (hasMatchingItem) {
      allBlocked = false;
      break;
    }
  }

  return allBlocked;
}

/**
 * Collect input data for a node from its upstream connections.
 */
function gatherInputData(
  nodeId: string,
  incomingEdges: Map<string, IEdge[]>,
  nodeOutputs: Map<string, INodeExecutionData[]>,
  triggerData: Record<string, unknown> | undefined,
  isTriggerNode: boolean,
): INodeExecutionData[] {
  // Trigger node receives the external trigger data (if any)
  if (isTriggerNode) {
    return triggerData ? [{ json: triggerData }] : [{ json: {} }];
  }

  const incoming = incomingEdges.get(nodeId) ?? [];
  const inputData: INodeExecutionData[] = [];

  for (const edge of incoming) {
    const sourceOutput = nodeOutputs.get(edge.source);
    if (!sourceOutput || sourceOutput.length === 0) continue;

    const edgeHandle = edge.sourceHandle ?? undefined;

    if (edgeHandle !== undefined) {
      // Per-item branch filtering: collect only items whose branch field matches
      // this edge's sourceHandle. Items without a branch field pass through on
      // any edge (non-conditional sources wired to a labelled port).
      const filtered = sourceOutput.filter((item) => {
        const itemBranch = item.json['branch'];
        return itemBranch === undefined || String(itemBranch) === edgeHandle;
      });
      if (filtered.length === 0) continue;
      inputData.push(...filtered);
    } else {
      // No sourceHandle on this edge: pass all items regardless of branch.
      // This preserves backward-compat for edges that don't use labelled ports.
      inputData.push(...sourceOutput);
    }
  }

  // If no upstream data was available, provide an empty item so the node
  // still has something to work with.
  return inputData.length > 0 ? inputData : [{ json: {} }];
}
