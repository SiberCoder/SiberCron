import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { db } from '../db/database.js';

/**
 * Komut yönetim rotaları.
 * Sohbet komutlarını workflow'lara bağlar.
 */
export async function commandRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // GET / - Kayıtlı komutları listele
  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const commands = db.getCommands();

    // Yerleşik komutları da ekle
    const builtinCommands = [
      {
        id: 'builtin-yardim',
        command: 'yardim',
        description: 'Komut listesini gösterir',
        workflowId: '',
        platforms: ['whatsapp', 'telegram', 'discord', 'slack'],
        responseType: 'text' as const,
        builtin: true,
      },
      {
        id: 'builtin-durum',
        command: 'durum',
        description: 'Sistem durumunu gösterir',
        workflowId: '',
        platforms: ['whatsapp', 'telegram', 'discord', 'slack'],
        responseType: 'text' as const,
        builtin: true,
      },
      {
        id: 'builtin-calistir',
        command: 'calistir',
        description: 'Workflow çalıştırır (kullanım: /calistir <isim>)',
        workflowId: '',
        platforms: ['whatsapp', 'telegram', 'discord', 'slack'],
        responseType: 'workflow_output' as const,
        builtin: true,
      },
      {
        id: 'builtin-son',
        command: 'son',
        description: 'Son 5 çalıştırma sonucunu gösterir',
        workflowId: '',
        platforms: ['whatsapp', 'telegram', 'discord', 'slack'],
        responseType: 'text' as const,
        builtin: true,
      },
    ];

    return { builtin: builtinCommands, custom: commands };
  });

  // POST / - Yeni komut kaydet
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      command: string;
      description: string;
      workflowId: string;
      platforms: string[];
      responseType?: 'text' | 'workflow_output';
    };

    if (!body.command || !body.workflowId) {
      reply.code(400);
      return { error: 'command ve workflowId zorunludur.' };
    }

    // Yerleşik komutlarla çakışma kontrolü
    const reserved = ['yardim', 'help', 'durum', 'status', 'calistir', 'run', 'son', 'last'];
    if (reserved.includes(body.command.toLowerCase())) {
      reply.code(400);
      return { error: `"${body.command}" yerleşik bir komuttur, kullanılamaz.` };
    }

    // Aynı isimde komut var mı kontrol et
    const existing = db.getCommandByName(body.command.toLowerCase());
    if (existing) {
      reply.code(409);
      return { error: `"${body.command}" komutu zaten kayıtlı.` };
    }

    // İlişkili workflow'un varlığını kontrol et
    const workflow = db.getWorkflow(body.workflowId);
    if (!workflow) {
      reply.code(400);
      return { error: 'Belirtilen workflowId bulunamadı.' };
    }

    const command = db.registerCommand({
      command: body.command.toLowerCase(),
      description: body.description,
      workflowId: body.workflowId,
      platforms: body.platforms ?? ['whatsapp', 'telegram', 'discord', 'slack'],
      responseType: body.responseType,
    });

    reply.code(201);
    return command;
  });

  // PUT /:id - Komutu güncelle
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      command: string;
      description: string;
      workflowId: string;
      platforms: string[];
      responseType: 'text' | 'workflow_output';
    }>;

    const updated = db.updateCommand(id, body);
    if (!updated) {
      reply.code(404);
      return { error: 'Komut bulunamadı.' };
    }
    return updated;
  });

  // DELETE /:id - Komutu sil
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteCommand(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Komut bulunamadı.' };
    }
    reply.code(204);
    return;
  });
}
