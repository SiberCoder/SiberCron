import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { NodeRegistry } from '@sibercron/core';

export async function nodeRoutes(
  fastify: FastifyInstance,
  opts: { registry: NodeRegistry },
): Promise<void> {
  const { registry } = opts;

  // GET / - List all registered node type definitions
  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    return registry.getDefinitions();
  });

  // GET /:name - Get single node type definition
  fastify.get('/:name', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const nodeType = registry.get(name);
    if (!nodeType) {
      reply.code(404);
      return { error: 'Node type not found' };
    }
    return nodeType.definition;
  });
}
