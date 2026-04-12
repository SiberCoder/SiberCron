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
    if (message.length > 50_000) {
      reply.code(400);
      return { error: 'Mesaj çok uzun (max 50,000 karakter)' };
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

  // POST /stream - Server-Sent Events stream of chat response with live events
  fastify.post('/stream', async (request: FastifyRequest, reply: FastifyReply) => {
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
    if (message.length > 50_000) {
      reply.code(400);
      return { error: 'Mesaj çok uzun (max 50,000 karakter)' };
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    let aborted = false;
    const onClose = () => { aborted = true; };
    reply.raw.on('close', onClose);

    const sendEvent = (data: Record<string, unknown>) => {
      if (aborted) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch { /* client disconnected */ }
    };

    try {
      const response = await aiBrainService.chat(
        message.trim(),
        conversationId,
        undefined,
        { maxIterations, temperature, outputFormat },
        (event) => sendEvent(event),
      );

      if (!aborted) {
        // Stream content in chunks for a typing effect
        const content = response.content;
        const chunkSize = 12;
        for (let i = 0; i < content.length; i += chunkSize) {
          if (aborted) break;
          sendEvent({ type: 'content', text: content.slice(i, i + chunkSize) });
        }

        // Send the complete message at the end
        sendEvent({ type: 'done', message: response });
      }
    } catch (err) {
      sendEvent({ type: 'error', error: (err as Error).message });
    } finally {
      reply.raw.removeListener('close', onClose);
    }

    if (!aborted) reply.raw.end();
  });
}
