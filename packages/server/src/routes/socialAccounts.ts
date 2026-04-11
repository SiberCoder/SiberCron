import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { db } from '../db/database.js';

/**
 * Sosyal hesap yönetim rotaları.
 * Bağlı mesajlaşma platformlarını CRUD ile yönetir.
 */
export async function socialAccountRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // GET / - Tüm bağlı hesapları listele
  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    return db.listSocialAccounts();
  });

  // POST / - Yeni hesap bağlantısı ekle
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      platform: string;
      name: string;
      identifier: string;
      config: Record<string, unknown>;
    };

    if (!body.platform || !body.name || !body.identifier) {
      reply.code(400);
      return { error: 'platform, name ve identifier zorunludur.' };
    }

    const account = db.createSocialAccount({
      platform: body.platform,
      name: body.name,
      identifier: body.identifier,
      config: body.config ?? {},
    });

    reply.code(201);
    return account;
  });

  // GET /:id - Hesap detaylarını getir
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const account = db.getSocialAccount(id);
    if (!account) {
      reply.code(404);
      return { error: 'Hesap bulunamadı.' };
    }
    return account;
  });

  // PUT /:id - Hesap yapılandırmasını güncelle
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string;
      identifier: string;
      config: Record<string, unknown>;
    }>;

    const account = db.updateSocialAccount(id, body);
    if (!account) {
      reply.code(404);
      return { error: 'Hesap bulunamadı.' };
    }
    return account;
  });

  // DELETE /:id - Hesabı sil
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteSocialAccount(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Hesap bulunamadı.' };
    }
    reply.code(204);
    return;
  });

  // POST /:id/test - Hesap bağlantısını test et
  fastify.post('/:id/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const account = db.getSocialAccount(id);
    if (!account) {
      reply.code(404);
      return { error: 'Hesap bulunamadı.' };
    }

    try {
      switch (account.platform) {
        case 'telegram': {
          const botToken = account.config.botToken as string;
          const res = await fetch(
            `https://api.telegram.org/bot${botToken}/getMe`,
          );
          const data = (await res.json()) as { ok: boolean };
          if (data.ok) {
            db.updateSocialAccount(id, { status: 'connected' });
            return { success: true, message: 'Telegram bağlantısı aktif.' };
          }
          db.updateSocialAccount(id, { status: 'error' });
          return { success: false, message: 'Telegram bot token geçersiz.' };
        }

        case 'whatsapp': {
          const accessToken = account.config.accessToken as string;
          const phoneNumberId = account.config.phoneNumberId as string;
          const res = await fetch(
            `https://graph.facebook.com/v18.0/${phoneNumberId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (res.ok) {
            db.updateSocialAccount(id, { status: 'connected' });
            return { success: true, message: 'WhatsApp bağlantısı aktif.' };
          }
          db.updateSocialAccount(id, { status: 'error' });
          return { success: false, message: 'WhatsApp API hatası.' };
        }

        case 'discord': {
          const webhookUrl = account.config.webhookUrl as string;
          // Discord webhook GET ile doğrulama
          const res = await fetch(webhookUrl, { method: 'GET' });
          if (res.ok) {
            db.updateSocialAccount(id, { status: 'connected' });
            return { success: true, message: 'Discord webhook aktif.' };
          }
          db.updateSocialAccount(id, { status: 'error' });
          return { success: false, message: 'Discord webhook geçersiz.' };
        }

        case 'slack': {
          const botToken = account.config.botToken as string;
          const res = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${botToken}`,
              'Content-Type': 'application/json',
            },
          });
          const data = (await res.json()) as { ok: boolean };
          if (data.ok) {
            db.updateSocialAccount(id, { status: 'connected' });
            return { success: true, message: 'Slack bağlantısı aktif.' };
          }
          db.updateSocialAccount(id, { status: 'error' });
          return { success: false, message: 'Slack token geçersiz.' };
        }

        default:
          return { success: false, message: 'Bilinmeyen platform.' };
      }
    } catch (err) {
      db.updateSocialAccount(id, { status: 'error' });
      return {
        success: false,
        message: `Bağlantı hatası: ${(err as Error).message}`,
      };
    }
  });

  // GET /:id/stats - Hesap istatistiklerini getir
  fastify.get('/:id/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const account = db.getSocialAccount(id);
    if (!account) {
      reply.code(404);
      return { error: 'Hesap bulunamadı.' };
    }
    return account.stats;
  });
}
