import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowListQuery,
  TriggerType,
  INodeExecutionResult,
} from '@sibercron/shared';
import { WS_EVENTS } from '@sibercron/shared';
import { WorkflowEngine } from '@sibercron/core';
import type { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';

import { db } from '../db/database.js';
import { schedulerService } from '../services/schedulerService.js';

// ── Zod Schemas ───────────────────────────────────────────────────────

const CreateWorkflowSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  description: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
  settings: z.record(z.unknown()).optional(),
  triggerType: z.enum(['manual', 'cron', 'webhook', 'event']).optional(),
  cronExpression: z.string().optional(),
  webhookPath: z.string().optional(),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
  settings: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  triggerType: z.enum(['manual', 'cron', 'webhook', 'event']).optional(),
  cronExpression: z.string().optional(),
  webhookPath: z.string().optional(),
});

export async function workflowRoutes(
  fastify: FastifyInstance,
  opts: { io: SocketIOServer; engine: WorkflowEngine },
): Promise<void> {
  const { io, engine } = opts;

  // GET / - List workflows (paginated, searchable)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as WorkflowListQuery;
    const result = db.listWorkflows({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      search: query.search,
      isActive: query.isActive !== undefined ? String(query.isActive) === 'true' : undefined,
      triggerType: query.triggerType as TriggerType | undefined,
    });
    return result;
  });

  // POST / - Create workflow
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
    }
    const body = parsed.data as CreateWorkflowRequest;
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

  // PUT /:id - Update workflow
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
    }
    const body = parsed.data as UpdateWorkflowRequest;
    const workflow = db.updateWorkflow(id, body);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    // Notify scheduler of changes (cron expression, active state, trigger type)
    schedulerService.onWorkflowUpdated(workflow);
    return workflow;
  });

  // DELETE /:id - Delete workflow
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    // Remove from scheduler before deleting
    schedulerService.onWorkflowDeactivated(id);
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

    const triggerData = (request.body as Record<string, unknown>) ?? {};
    const executionId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create execution immediately as "running" so UI can see it
    const runningExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running' as const,
      triggerType: 'manual' as const,
      nodeResults: {} as Record<string, INodeExecutionResult>,
      startedAt: now,
      createdAt: now,
    };
    db.createExecution(runningExecution);

    // Respond immediately
    reply.code(202);

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
          };
          if (nodeData.nodeId) {
            const existing = db.getExecution(executionId);
            if (existing) {
              existing.nodeResults[nodeData.nodeId] = {
                nodeId: nodeData.nodeId,
                nodeName: nodeData.nodeName ?? nodeData.nodeId,
                status: (nodeData.status ?? 'error') as INodeExecutionResult['status'],
                output: nodeData.output,
                error: nodeData.error,
                durationMs: nodeData.durationMs,
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
    }).catch((err) => {
      db.updateExecution(executionId, {
        status: 'error',
        errorMessage: (err as Error).message,
        finishedAt: new Date().toISOString(),
      });
    }).finally(() => {
      // Clean up the ID mapping to prevent memory leak
      const idMap = (globalThis as any).__executionIdMap as Map<string, string> | undefined;
      if (idMap) {
        for (const [engineId, apiId] of idMap) {
          if (apiId === executionId) {
            idMap.delete(engineId);
            break;
          }
        }
      }
    });

    return runningExecution;
  });

  // POST /:id/activate - Set isActive=true
  fastify.post('/:id/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workflow = db.updateWorkflow(id, { isActive: true } as Record<string, unknown>);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    // Schedule cron job if applicable
    schedulerService.onWorkflowActivated(workflow);
    io.emit('workflow:activated', { workflowId: id, workflow });
    return workflow;
  });

  // POST /:id/deactivate - Set isActive=false
  fastify.post('/:id/deactivate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workflow = db.updateWorkflow(id, { isActive: false } as Record<string, unknown>);
    if (!workflow) {
      reply.code(404);
      return { error: 'Workflow not found' };
    }
    // Remove cron job
    schedulerService.onWorkflowDeactivated(id);
    io.emit('workflow:deactivated', { workflowId: id, workflow });
    return workflow;
  });
}
