import '@fastify/jwt';
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; username: string; role: string };
    user: { sub: string; username: string; role: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
