import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { db } from '../db/database.js';
import type { INodeInstance } from '@sibercron/shared';

const CreateCredentialSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  type: z.string().min(1, 'type is required').max(100),
  data: z.record(z.unknown()),
});

const UpdateCredentialSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().min(1).max(100).optional(),
  data: z.record(z.unknown()).optional(),
});

export async function credentialRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // GET / - List credentials (no data field exposed)
  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    return db.listCredentials();
  });

  // POST / - Create credential
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateCredentialSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
    }
    const body = parsed.data;
    const credential = db.createCredential(body);
    // Return without the data field
    const { data: _data, ...safe } = credential;
    reply.code(201);
    return safe;
  });

  // PUT /:id - Update credential
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateCredentialSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
    }
    const credential = db.updateCredential(id, parsed.data);
    if (!credential) {
      reply.code(404);
      return { error: 'Credential not found' };
    }
    // Return without the data field
    const { data: _data, ...safe } = credential;
    return safe;
  });

  // DELETE /:id - Delete credential (cascades: removes refs from all workflow nodes)
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteCredential(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Credential not found' };
    }

    // Cascade: remove credential reference from any workflow nodes using it
    const workflows = db.listWorkflows({ limit: 5000 });
    for (const workflow of workflows.data) {
      let changed = false;
      const updatedNodes = workflow.nodes.map((node: INodeInstance) => {
        if (!node.credentials) return node;
        const updatedCreds: Record<string, string> = {};
        let nodeChanged = false;
        for (const [key, val] of Object.entries(node.credentials)) {
          if (val === id) {
            nodeChanged = true;
          } else {
            updatedCreds[key] = val;
          }
        }
        if (nodeChanged) {
          changed = true;
          return { ...node, credentials: Object.keys(updatedCreds).length > 0 ? updatedCreds : undefined };
        }
        return node;
      });
      if (changed) {
        db.updateWorkflow(workflow.id, { nodes: updatedNodes });
      }
    }

    reply.code(204);
    return;
  });
}
