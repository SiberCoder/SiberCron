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
  ): Promise<IExecution> {
    const executionId = crypto.randomUUID();
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
      );

      // ── Execute nodes in order ──────────────────────────────────────
      // Stores the output data produced by each node, keyed by node ID.
      const nodeOutputs = new Map<string, INodeExecutionData[]>();

      for (const nodeId of sortedNodeIds) {
        const nodeInstance = nodeMap.get(nodeId);
        if (!nodeInstance) continue;

        // Determine if this node should be skipped due to conditional branching
        if (shouldSkipNode(nodeId, incomingEdges, nodeOutputs, workflow.edges)) {
          execution.nodeResults[nodeId] = {
            nodeId,
            nodeName: nodeInstance.name,
            status: 'skipped',
          };
          continue;
        }

        emit('execution:node:start', { executionId, nodeId, nodeName: nodeInstance.name });

        // Collect input data from all upstream nodes connected to this node
        const inputData = gatherInputData(
          nodeId,
          incomingEdges,
          nodeOutputs,
          triggerData,
          nodeId === triggerNode.id,
        );

        // Inject executionId into input data so nodes can use it for live logging
        for (const item of inputData) {
          item.json.executionId = executionId;
        }

        const result = await this.executor.execute(
          nodeInstance.type,
          inputData,
          nodeInstance.parameters,
          nodeInstance.credentials,
          credentialResolver,
        );

        // Stamp the actual node ID onto the result
        result.nodeId = nodeId;
        result.nodeName = nodeInstance.name;

        execution.nodeResults[nodeId] = result;

        // Store output for downstream nodes
        if (result.status === 'success' && result.output) {
          nodeOutputs.set(
            nodeId,
            result.output.map((json) => ({ json })),
          );
        }

        emit('execution:node:done', {
          executionId,
          nodeId,
          nodeName: result.nodeName,
          status: result.status,
          output: result.output,
          error: result.error,
          durationMs: result.durationMs ?? 0,
        });

        // If a node fails and the workflow is not configured to continue, stop.
        if (result.status === 'error' && !workflow.settings?.continueOnFail) {
          throw new Error(
            `Node "${nodeInstance.name}" (${nodeId}) failed: ${result.error}`,
          );
        }
      }

      // ── Finalise execution ──────────────────────────────────────────
      const finishedAt = new Date();
      execution.status = 'success';
      execution.finishedAt = finishedAt.toISOString();
      execution.durationMs = finishedAt.getTime() - startedAt.getTime();
    } catch (err: unknown) {
      const finishedAt = new Date();
      execution.status = 'error';
      execution.errorMessage =
        err instanceof Error ? err.message : String(err);
      execution.finishedAt = finishedAt.toISOString();
      execution.durationMs = finishedAt.getTime() - startedAt.getTime();
    }

    emit('execution:completed', {
      executionId,
      status: execution.status,
      durationMs: execution.durationMs ?? 0,
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
): string[] {
  // Work on a copy so we don't mutate the original
  const inDegree = new Map(inDegreeSrc);
  const queue: string[] = [];

  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) {
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
 */
function shouldSkipNode(
  nodeId: string,
  incomingEdges: Map<string, IEdge[]>,
  nodeOutputs: Map<string, INodeExecutionData[]>,
  allEdges: IEdge[],
): boolean {
  const incoming = incomingEdges.get(nodeId) ?? [];
  if (incoming.length === 0) return false;

  // A node is skipped only when *every* incoming edge comes from a
  // conditional source whose chosen branch does not match.
  let allBlocked = true;

  for (const edge of incoming) {
    const sourceOutput = nodeOutputs.get(edge.source);

    // If the source hasn't produced output (e.g. it was skipped), this
    // path is blocked.
    if (!sourceOutput || sourceOutput.length === 0) {
      continue;
    }

    // Check if the source output specifies a branch
    const firstItem = sourceOutput[0];
    const branch = firstItem.json['branch'];

    if (branch === undefined) {
      // Source is not conditional, so this path is open
      allBlocked = false;
      break;
    }

    // Source is conditional: only allow if the edge's sourceHandle matches
    if (String(branch) === edge.sourceHandle) {
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

    // Respect conditional branching: only take data from edges whose
    // sourceHandle matches the branch (or from non-conditional nodes).
    const firstItem = sourceOutput[0];
    const branch = firstItem.json['branch'];

    if (branch !== undefined && String(branch) !== edge.sourceHandle) {
      continue;
    }

    inputData.push(...sourceOutput);
  }

  // If no upstream data was available, provide an empty item so the node
  // still has something to work with.
  return inputData.length > 0 ? inputData : [{ json: {} }];
}
