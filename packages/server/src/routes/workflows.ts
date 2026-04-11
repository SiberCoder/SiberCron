import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowListQuery,
  TriggerType,
  INodeExecutionResult,
  IExecutionTrigger,
} from '@sibercron/shared';
import { WS_EVENTS } from '@sibercron/shared';
import { WorkflowEngine } from '@sibercron/core';
import type { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';

import { db } from '../db/database.js';
import { schedulerService } from '../services/schedulerService.js';
import { queueService } from '../services/queueService.js';

// ── Helpers ────────────────────────────────────────────────────────────

/** Valid URL-safe webhook path: starts with /, only alphanumeric/-/_ */
const WEBHOOK_PATH_RE = /^\/[a-zA-Z0-9\-_/]+$/;

/** Reserved system prefixes that cannot be used as webhook paths */
const RESERVED_PATHS = ['/health', '/metrics', '/auth', '/api', '/docs'];

function validateWebhookPath(path: string): string | null {
  if (!path.startsWith('/')) path = `/${path}`;
  if (!WEBHOOK_PATH_RE.test(path)) return 'Webhook path must contain only letters, numbers, hyphens, underscores, and slashes';
  if (RESERVED_PATHS.some((r) => path.startsWith(r))) return `Webhook path cannot start with reserved prefix: ${RESERVED_PATHS.join(', ')}`;
  return null; // valid
}

/** Validate that every edge references existing node IDs */
function validateEdges(
  nodes: Array<{ id: string }> | undefined,
  edges: Array<{ id: string; source: string; target: string }> | undefined,
): string | null {
  if (!edges?.length || !nodes) return null;
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) return `Edge "${edge.id}" references unknown source node "${edge.source}"`;
    if (!nodeIds.has(edge.target)) return `Edge "${edge.id}" references unknown target node "${edge.target}"`;
    if (edge.source === edge.target) return `Edge "${edge.id}" creates a self-loop on node "${edge.source}"`;
  }
  return null;
}

// ── Zod Schemas ───────────────────────────────────────────────────────

const TagsSchema = z
  .array(z.string().min(1).max(50).regex(/^[a-zA-Z0-9_\-\s]+$/, 'Tag contains invalid characters'))
  .max(10)
  .optional();

const CreateWorkflowSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  description: z.string().max(2000).optional(),
  tags: TagsSchema,
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
  settings: z.record(z.unknown()).optional(),
  triggerType: z.enum(['manual', 'cron', 'webhook', 'event']).optional(),
  cronExpression: z.string().max(100).optional(),
  webhookPath: z.string().max(255).optional(),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  tags: TagsSchema,
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
  settings: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  triggerType: z.enum(['manual', 'cron', 'webhook', 'event']).optional(),
  cronExpression: z.string().max(100).optional(),
  webhookPath: z.string().max(255).optional(),
});

/** Returns true and sends 403 when the requesting user is not an admin. */
function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = request.user as { role?: string } | undefined;
  if (user && user.role !== 'admin') {
    reply.code(403).send({ error: 'Admin role required' });
    return true;
  }
  return false;
}

export async function workflowRoutes(
  fastify: FastifyInstance,
  opts: { io: SocketIOServer; engine: WorkflowEngine },
): Promise<void> {
  const { io, engine } = opts;

  // GET / - List workflows (paginated, searchable)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as WorkflowListQuery & { withLastExecution?: string };
    const result = db.listWorkflows({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      search: query.search,
      isActive: query.isActive !== undefined ? String(query.isActive) === 'true' : undefined,
      triggerType: query.triggerType as TriggerType | undefined,
      tag: query.tag,
    });
    // Optionally annotate each workflow with its last execution status
    if (query.withLastExecution === 'true') {
      const annotated = result.data.map((wf) => ({
        ...wf,
        lastExecution: db.getLastExecution(wf.id),
      }));
      return { ...result, data: annotated };
    }
    return result;
  });

  // GET /stats - Aggregate workflow statistics
  fastify.get('/stats', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const all = db.listWorkflows({ limit: 1000 });
    const byTrigger: Record<string, number> = {};
    let active = 0;
    for (const wf of all.data) {
      byTrigger[wf.triggerType] = (byTrigger[wf.triggerType] ?? 0) + 1;
      if (wf.isActive) active++;
    }
    const { activeJobs: scheduledCronJobs } = schedulerService.getStatus();
    return {
      total: all.total,
      active,
      inactive: all.total - active,
      byTrigger,
      scheduledCronJobs,
    };
  });

  // POST / - Create workflow (admin only)
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    if (requireAdmin(request, reply)) return;
    const parsed = CreateWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
    }
    const body = parsed.data as CreateWorkflowRequest;

    // Check for duplicate name
    const nameConflict = db.listWorkflows({ search: body.name, limit: 50 });
    if (nameConflict.data.some((w) => w.name.toLowerCase() === body.name.toLowerCase())) {
      reply.code(409);
      return { error: `A workflow named "${body.name}" already exists` };
    }

    // Validate cron expression
    if (body.cronExpression) {
      if (!schedulerService.validateCron(body.cronExpression)) {
        reply.code(400);
        return { error: `Invalid cron expression: "${body.cronExpression}"` };
      }
    }

    // Validate edge references
    const edgeErr = validateEdges(body.nodes as Array<{ id: string }>, body.edges as Array<{ id: string; source: string; target: string }>);
    if (edgeErr) { reply.code(400); return { error: edgeErr }; }

    // Validate and normalize webhook path
    if (body.webhookPath) {
      const pathErr = validateWebhookPath(body.webhookPath);
      if (pathErr) { reply.code(400); return { error: pathErr }; }
      if (!body.webhookPath.startsWith('/')) body.webhookPath = `/${body.webhookPath}`;

      const conflict = db.listWorkflows({ webhookPath: body.webhookPath, limit: 1 });
      if (conflict.total > 0) {
        reply.code(409);
        return { error: `Webhook path "${body.webhookPath}" is already used by workflow "${conflict.data[0].name}"` };
      }
    }

    const workflow = db.createWorkflow(body);
    reply.code(201);
    return workflow;
  });

  // GET /:id - Get workflow by id
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workflow = db.getWorkflow(id);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    return workflow;
  });

  // PUT /:id - Update workflow (admin only)
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const parsed = UpdateWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
    }
    const body = parsed.data as UpdateWorkflowRequest;

    // Validate cron expression if provided
    if (body.cronExpression) {
      if (!schedulerService.validateCron(body.cronExpression)) {
        reply.code(400);
        return { error: `Invalid cron expression: "${body.cronExpression}"` };
      }
    }

    // Validate edge references when both nodes and edges are supplied
    if (body.nodes && body.edges) {
      const edgeErr = validateEdges(body.nodes as Array<{ id: string }>, body.edges as Array<{ id: string; source: string; target: string }>);
      if (edgeErr) { reply.code(400); return { error: edgeErr }; }
    }

    // Validate and enforce webhook path uniqueness (skip check if path unchanged)
    if (body.webhookPath) {
      const pathErr = validateWebhookPath(body.webhookPath);
      if (pathErr) { reply.code(400); return { error: pathErr }; }
      if (!body.webhookPath.startsWith('/')) body.webhookPath = `/${body.webhookPath}`;

      const conflict = db.listWorkflows({ webhookPath: body.webhookPath, limit: 1 });
      if (conflict.total > 0 && conflict.data[0].id !== id) {
        reply.code(409);
        return { error: `Webhook path "${body.webhookPath}" is already used by workflow "${conflict.data[0].name}"` };
      }
    }

    const workflow = db.updateWorkflow(id, body);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    // Notify scheduler of changes (cron expression, active state, trigger type)
    schedulerService.onWorkflowUpdated(workflow);
    return workflow;
  });

  // DELETE /:id - Delete workflow (admin only)
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const query = request.query as { force?: string };

    // Guard: prevent deleting a workflow that has active executions
    if (query.force !== 'true') {
      const running = db.listExecutions({ workflowId: id, status: 'running', limit: 1 });
      if (running.total > 0) {
        reply.code(409);
        return { error: 'Workflow has active executions. Stop them first or pass ?force=true to override.' };
      }
    }

    // Remove from scheduler and queue before deleting
    schedulerService.onWorkflowDeactivated(id);
    await queueService.removeJobsByWorkflowId(id);
    const deleted = db.deleteWorkflow(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    reply.code(204);
    return;
  });

  // POST /:id/execute - Execute workflow manually
  fastify.post('/:id/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workflow = db.getWorkflow(id);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }

    // Prevent concurrent execution unless explicitly allowed via settings
    if (!workflow.settings?.allowConcurrent) {
      const runningExecs = db.listExecutions({ workflowId: id, status: 'running', limit: 1 });
      if (runningExecs.total > 0) {
        reply.code(409);
        return { error: 'Workflow is already running. Wait for it to finish or enable concurrent execution in settings.' };
      }
    }

    // Pre-execution validation: fail fast on structural errors
    if (!workflow.nodes || workflow.nodes.length === 0) {
      reply.code(422);
      return { error: 'Workflow has no nodes. Add at least one node before executing.' };
    }
    // Check that all referenced credentials exist
    const missingCreds: string[] = [];
    for (const node of workflow.nodes) {
      if (!node.credentials) continue;
      for (const [credType, credId] of Object.entries(node.credentials)) {
        if (typeof credId === 'string' && credId && !db.getCredential(credId)) {
          missingCreds.push(`"${node.name}" → ${credType}`);
        }
      }
    }
    if (missingCreds.length > 0) {
      reply.code(422);
      return { error: `Missing credentials: ${missingCreds.join(', ')}. Update the node configuration before executing.` };
    }

    const triggerData = (request.body as Record<string, unknown>) ?? {};
    const executionId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Build triggeredBy from JWT or API key auth
    const jwtUser = request.user as { sub?: string; username?: string; role?: string; apiKeyId?: string; apiKeyName?: string } | undefined;
    const triggeredBy: IExecutionTrigger = {
      method: 'manual',
      userId: jwtUser?.sub,
      username: jwtUser?.username,
      apiKeyId: jwtUser?.apiKeyId,
      apiKeyName: jwtUser?.apiKeyName,
    };

    // Create execution immediately as "running" so UI can see it
    const runningExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running' as const,
      triggerType: 'manual' as const,
      triggeredBy,
      nodeResults: {} as Record<string, INodeExecutionResult>,
      startedAt: now,
      createdAt: now,
    };
    db.createExecution(runningExecution);

    // Broadcast globally so dashboards & live panels pick up new executions immediately
    io.emit(WS_EVENTS.WORKFLOW_EXECUTION_STARTED, {
      workflowId: workflow.id,
      workflowName: workflow.name,
      executionId,
      startedAt: now,
    });

    // Respond immediately
    reply.code(202);

    // Pass API execution ID so nodes (like AutonomousDev) can use it for log correlation
    triggerData._apiExecutionId = executionId;

    // Execute in background
    engine.execute(
      workflow,
      triggerData,
      (event, data) => {
        const room = `execution:${executionId}`;
        // Always replace the engine's internal executionId with our API executionId
        const payload = { ...data as Record<string, unknown>, executionId };

        // Map engine's executionId to our API executionId for live logs (first event)
        if (event === 'execution:started') {
          const engineId = (data as { executionId?: string })?.executionId;
          if (engineId) {
            const idMap = (globalThis as any).__executionIdMap as Map<string, string> | undefined;
            idMap?.set(engineId, executionId);
          }
        }

        // Update running execution in DB on node completion
        if (event === WS_EVENTS.EXECUTION_NODE_DONE) {
          const nodeData = data as {
            nodeId?: string;
            nodeName?: string;
            status?: string;
            output?: Record<string, unknown>[];
            error?: string;
            durationMs?: number;
            startedAt?: string;
            finishedAt?: string;
          };
          if (nodeData.nodeId) {
            const existing = db.getExecution(executionId);
            if (existing) {
              const now = new Date().toISOString();
              const durationMs = nodeData.durationMs ?? 0;
              existing.nodeResults[nodeData.nodeId] = {
                nodeId: nodeData.nodeId,
                nodeName: nodeData.nodeName ?? nodeData.nodeId,
                status: (nodeData.status ?? 'error') as INodeExecutionResult['status'],
                output: nodeData.output,
                error: nodeData.error,
                durationMs,
                // Use engine-provided timestamps when available, fall back to approximation
                startedAt: nodeData.startedAt ?? new Date(Date.now() - durationMs).toISOString(),
                finishedAt: nodeData.finishedAt ?? now,
              };
              db.updateExecution(executionId, { nodeResults: existing.nodeResults });
            }
          }
        }

        // Emit only to the execution room — avoids duplicate events on subscribed clients
        io.to(room).emit(event, payload);
      },
      async (credentialId: string) => {
        const cred = db.getCredential(credentialId);
        if (!cred) throw new Error(`Credential "${credentialId}" not found`);
        return cred.data;
      },
    ).then((result) => {
      // Persist final execution state; execution:completed was already emitted via onEvent
      db.updateExecution(executionId, {
        status: result.status,
        nodeResults: result.nodeResults,
        errorMessage: result.errorMessage,
        finishedAt: result.finishedAt,
        durationMs: result.durationMs,
      });
      // Broadcast globally so WorkflowListPage execution badges update live
      io.emit(WS_EVENTS.WORKFLOW_EXECUTION_COMPLETED, {
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId,
        status: result.status,
        durationMs: result.durationMs,
        finishedAt: result.finishedAt,
        errorMessage: result.errorMessage,
      });
    }).catch((err) => {
      db.updateExecution(executionId, {
        status: 'error',
        errorMessage: (err as Error).message,
        finishedAt: new Date().toISOString(),
      });
    }).finally(() => {
      // Clean up ALL entries for this executionId to prevent memory leak
      const idMap = (globalThis as any).__executionIdMap as Map<string, string> | undefined;
      if (idMap) {
        for (const [engineId, apiId] of idMap) {
          if (apiId === executionId) idMap.delete(engineId);
        }
      }
    });

    return runningExecution;
  });

  // POST /:id/duplicate - Clone a workflow (admin only)
  fastify.post('/:id/duplicate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const original = db.getWorkflow(id);
    if (!original) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }

    const duplicate = db.createWorkflow({
      name: `${original.name} (Copy)`,
      description: original.description,
      nodes: original.nodes,
      edges: original.edges,
      settings: original.settings,
      triggerType: original.triggerType,
      cronExpression: original.cronExpression,
      webhookPath: original.webhookPath
        ? `${original.webhookPath}-copy-${Date.now()}`
        : undefined,
    });

    reply.code(201);
    return duplicate;
  });

  // GET /:id/export - Export workflow as JSON
  fastify.get('/:id/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workflow = db.getWorkflow(id);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }

    const exportData = {
      $schema: 'sibercron/workflow/v1',
      exportedAt: new Date().toISOString(),
      workflow: {
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
        settings: workflow.settings,
        triggerType: workflow.triggerType,
        cronExpression: workflow.cronExpression,
        webhookPath: workflow.webhookPath,
      },
    };

    void reply.header('Content-Disposition', `attachment; filename="${workflow.name.replace(/[^a-z0-9]/gi, '_')}.json"`);
    void reply.header('Content-Type', 'application/json');
    return exportData;
  });

  // POST /import - Import a workflow from JSON (admin only)
  fastify.post('/import', async (request: FastifyRequest, reply: FastifyReply) => {
    if (requireAdmin(request, reply)) return;
    const body = request.body as Record<string, unknown>;

    if (!body || body['$schema'] !== 'sibercron/workflow/v1' || !body['workflow']) {
      reply.code(400);
      return { error: 'Invalid export file. Expected a SiberCron workflow export.' };
    }

    const wf = body['workflow'] as Record<string, unknown>;
    const parsed = CreateWorkflowSchema.safeParse(wf);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid workflow data', details: parsed.error.flatten().fieldErrors };
    }

    const workflow = db.createWorkflow(parsed.data as CreateWorkflowRequest);
    reply.code(201);
    return workflow;
  });

  // GET /:id/validate - Check if a workflow is ready to execute
  // Returns { valid: bool, warnings: string[], errors: string[] }
  fastify.get('/:id/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workflow = db.getWorkflow(id);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Must have at least one node
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow has no nodes');
    }

    // 2. Must have a trigger node (name contains trigger/cron/webhook, or zero-in-degree)
    const TRIGGER_HINT = /trigger|cron|webhook/i;
    const hasTrigger = workflow.nodes.some(
      (n) => TRIGGER_HINT.test(n.name) || TRIGGER_HINT.test(n.type),
    );
    if (!hasTrigger && workflow.nodes.length > 0) {
      warnings.push('No trigger node detected — workflow can only be run manually');
    }

    // 3. Cron expression must be valid if triggerType is cron
    if (workflow.triggerType === 'cron') {
      if (!workflow.cronExpression) {
        errors.push('Cron trigger requires a cron expression');
      }
    }

    // 4. Webhook path must be set if triggerType is webhook
    if (workflow.triggerType === 'webhook') {
      if (!workflow.webhookPath) {
        errors.push('Webhook trigger requires a webhook path');
      }
    }

    // 5. Check that all assigned credentials actually exist in the DB
    const missingCredentials: string[] = [];
    for (const node of workflow.nodes) {
      if (!node.credentials) continue;
      for (const [credType, credId] of Object.entries(node.credentials)) {
        if (typeof credId === 'string' && credId) {
          const cred = db.getCredential(credId);
          if (!cred) {
            missingCredentials.push(`Node "${node.name}" — credential "${credType}" (${credId}) not found`);
          }
        }
      }
    }
    errors.push(...missingCredentials);

    // 6. Check for duplicate webhookPath conflicts with other workflows
    if (workflow.webhookPath) {
      const normalized = workflow.webhookPath.toLowerCase();
      const { data: others } = db.listWorkflows({ triggerType: 'webhook', isActive: true, limit: 200 });
      const conflict = others.find(
        (w) => w.id !== id && (w.webhookPath ?? '').toLowerCase() === normalized,
      );
      if (conflict) {
        warnings.push(`Webhook path conflicts with active workflow "${conflict.name}" (${conflict.id})`);
      }
    }

    const valid = errors.length === 0;
    return { valid, errors, warnings };
  });

  // POST /:id/activate - Set isActive=true (admin only)
  fastify.post('/:id/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const workflow = db.updateWorkflow(id, { isActive: true });
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    // Schedule cron job if applicable
    schedulerService.onWorkflowActivated(workflow);
    io.emit(WS_EVENTS.WORKFLOW_ACTIVATED, { workflowId: id, workflow });
    return workflow;
  });

  // POST /:id/deactivate - Set isActive=false (admin only)
  fastify.post('/:id/deactivate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const workflow = db.updateWorkflow(id, { isActive: false });
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    // Remove cron job and flush pending queue jobs
    schedulerService.onWorkflowDeactivated(id);
    await queueService.removeJobsByWorkflowId(id);
    io.emit(WS_EVENTS.WORKFLOW_DEACTIVATED, { workflowId: id, workflow });
    return workflow;
  });

  // ── Version History ────────────────────────────────────────────────────

  // GET /:id/versions - list version snapshots (newest first, max 20)
  fastify.get('/:id/versions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workflow = db.getWorkflow(id);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    const versions = db.getWorkflowVersions(id).map((v) => ({
      version: v.version,
      workflowId: v.workflowId,
      savedAt: v.savedAt,
      label: v.label,
      nodeCount: v.snapshot.nodes?.length ?? 0,
      name: v.snapshot.name,
    }));
    return { versions };
  });

  // POST /:id/versions/:version/restore - restore a snapshot (admin only)
  fastify.post('/:id/versions/:version/restore', async (request: FastifyRequest, reply: FastifyReply) => {
    if (requireAdmin(request, reply)) return;
    const { id, version } = request.params as { id: string; version: string };
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) {
      reply.code(400);
      return { error: 'Invalid version number' };
    }
    const restored = db.restoreWorkflowVersion(id, versionNum);
    if (!restored) {
      reply.code(404);
      return { error: 'Version not found' };
    }
    // Notify scheduler if it was active
    if (restored.isActive && restored.triggerType === 'cron' && restored.cronExpression) {
      schedulerService.onWorkflowUpdated(restored);
    }
    return { workflow: restored, message: `Restored to version ${versionNum}` };
  });
}
