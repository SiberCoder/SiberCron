import '@fastify/jwt';
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // Both access tokens (sub + username + role) and refresh tokens (sub + type) share this shape
    payload: { sub: string; username?: string; role?: string; type?: string };
    user: { sub: string; username: string; role: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
