import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ChatRequest } from '@sibercron/shared';

import { aiBrainService } from '../services/aiBrainService.js';

/**
 * AI Brain chat routes.
 * Provides chat, conversation history, system context, and SSE streaming.
 */
export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  // POST / - Send a chat message to the AI brain
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as ChatRequest & {
      maxIterations?: number;
      temperature?: number;
      outputFormat?: string;
    };
    const { message, conversationId, maxIterations, temperature, outputFormat } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      reply.code(400);
      return { error: 'Mesaj alani bos olamaz' };
    }

    try {
      const response = await aiBrainService.chat(message.trim(), conversationId, undefined, {
        maxIterations,
        temperature,
        outputFormat,
      });

      const toolResults = response.metadata?.toolCalls?.map((tc) => ({
        name: tc.name,
        result: tc.result,
        status: tc.status || 'success',
      }));

      return {
        message: response,
        toolResults: toolResults && toolResults.length > 0 ? toolResults : undefined,
      };
    } catch (err) {
      reply.code(500);
      return { error: `AI islem hatasi: ${(err as Error).message}` };
    }
  });

  // GET /history - Get conversation history
  fastify.get('/history', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { conversationId } = request.query as { conversationId?: string };
    const messages = aiBrainService.getConversation(conversationId);
    return { messages };
  });

  // DELETE /history - Clear conversation history
  fastify.delete('/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.query as { conversationId?: string };
    aiBrainService.clearConversation(conversationId);
    reply.code(204);
    return;
  });

  // GET /context - Get current system state (what the AI knows)
  fastify.get('/context', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const state = await aiBrainService.getSystemState();
    return { state };
  });

  // GET /stream - Server-Sent Events stream of chat response
  fastify.get('/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const { message, conversationId } = request.query as {
      message?: string;
      conversationId?: string;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      reply.code(400);
      return { error: 'Mesaj alani bos olamaz' };
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    try {
      // Send a "thinking" event
      reply.raw.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);

      // Get the full response (non-streaming for now, but delivered as SSE)
      const response = await aiBrainService.chat(message.trim(), conversationId);

      // Send tool calls if any
      if (response.metadata?.toolCalls) {
        for (const tc of response.metadata.toolCalls) {
          reply.raw.write(
            `data: ${JSON.stringify({ type: 'tool_call', name: tc.name, status: tc.status, result: tc.result })}\n\n`,
          );
        }
      }

      // Send the final message in chunks to simulate streaming
      const content = response.content;
      const chunkSize = 20;
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        reply.raw.write(`data: ${JSON.stringify({ type: 'content', text: chunk })}\n\n`);
      }

      // Send done event
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'done', message: response })}\n\n`,
      );
    } catch (err) {
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`,
      );
    }

    reply.raw.end();
  });
}
