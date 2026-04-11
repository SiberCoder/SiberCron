import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { db } from '../db/database.js';

const CreateCredentialSchema = z.object({
  name: z.string().min(1, 'name is required'),
  type: z.string().min(1, 'type is required'),
  data: z.record(z.unknown()),
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
    const body = request.body as Partial<{ name: string; type: string; data: Record<string, unknown> }>;
    const credential = db.updateCredential(id, body);
    if (!credential) {
      reply.code(404);
      return { error: 'Credential not found' };
    }
    // Return without the data field
    const { data: _data, ...safe } = credential;
    return safe;
  });

  // DELETE /:id - Delete credential
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteCredential(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Credential not found' };
    }
    reply.code(204);
    return;
  });
}
