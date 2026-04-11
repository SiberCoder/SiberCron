import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import QRCode from 'qrcode';

import { db } from '../db/database.js';
import { messagingService } from '../services/messagingService.js';
import { whatsappService } from '../services/whatsappService.js';
import { queueService } from '../services/queueService.js';

// Generate a secure webhook verify token if not provided via env
const WEBHOOK_VERIFY_TOKEN = (() => {
  const envToken = process.env.WEBHOOK_VERIFY_TOKEN;
  if (envToken) return envToken;
  const generated = crypto.randomBytes(32).toString('hex');
  console.log(`[Messaging] No WEBHOOK_VERIFY_TOKEN set. Generated token: ${generated}`);
  console.log('[Messaging] Set WEBHOOK_VERIFY_TOKEN env var to persist this token across restarts.');
  return generated;
})();

/**
 * Gelen mesaj webhook rotaları.
 * WhatsApp, Telegram, Discord ve Slack'ten gelen mesajları işler.
 */
export async function messagingRoutes(fastify: FastifyInstance): Promise<void> {

  // ── WhatsApp QR Code Pairing ────────────────────────────────────────

  // Start WhatsApp QR pairing
  fastify.post('/whatsapp/pair', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { accountId?: string } | undefined;
    const accountId = body?.accountId ?? 'default';

    try {
      const { sessionId, qrData, expiresIn } = await whatsappService.startPairing(accountId);

      // Generate QR image (white on transparent for dark UI)
      const qrImageUrl = await QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      reply.code(201);
      return { sessionId, qrData, qrImageUrl, expiresIn };
    } catch (err) {
      reply.code(500);
      return { error: `QR olusturma hatasi: ${(err as Error).message}` };
    }
  });

  // Get current QR status
  fastify.get('/whatsapp/pair/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = whatsappService.getSession(sessionId);

    if (!session) {
      reply.code(404);
      return { error: 'Oturum bulunamadi.' };
    }

    let qrImageUrl: string | undefined;
    if (session.qrCode && session.state === 'qr_ready') {
      qrImageUrl = await QRCode.toDataURL(session.qrCode, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    }

    return {
      sessionId: session.id,
      state: session.state,
      qrData: session.qrCode,
      qrImageUrl,
      phoneNumber: session.phoneNumber,
      name: session.name,
      connectedAt: session.connectedAt,
    };
  });

  // Confirm pairing (simulated for MVP, real impl would be automatic via whatsapp-web.js)
  fastify.post('/whatsapp/pair/:sessionId/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as { phoneNumber: string; name: string };

    if (!body.phoneNumber || !body.name) {
      reply.code(400);
      return { error: 'phoneNumber ve name alanlari gerekli.' };
    }

    try {
      const session = await whatsappService.confirmPairing(sessionId, body.phoneNumber, body.name);
      return {
        sessionId: session.id,
        state: session.state,
        phoneNumber: session.phoneNumber,
        name: session.name,
        connectedAt: session.connectedAt,
      };
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }
  });

  // Disconnect WhatsApp session
  fastify.post('/whatsapp/pair/:sessionId/disconnect', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = whatsappService.getSession(sessionId);

    if (!session) {
      reply.code(404);
      return { error: 'Oturum bulunamadi.' };
    }

    await whatsappService.disconnect(sessionId);
    return { sessionId, state: 'disconnected' };
  });

  // ── WhatsApp Webhook Doğrulama (GET) ─────────────────────────────────

  fastify.get('/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    // Use secure verify token from environment
    const verifyToken = WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      reply.code(200);
      return challenge;
    }

    reply.code(403);
    return { error: 'Doğrulama başarısız.' };
  });

  // ── WhatsApp Gelen Mesaj (POST) ──────────────────────────────────────

  fastify.post('/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from: string;
              type: string;
              text?: { body: string };
              id: string;
            }>;
            metadata?: { phone_number_id: string };
          };
        }>;
      }>;
    };

    // WhatsApp Cloud API webhook formatını çözümle
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messageData = value?.messages?.[0];

    if (!messageData) {
      // Durum güncellemesi veya boş bildirim
      reply.code(200);
      return { status: 'ok' };
    }

    const senderPhone = messageData.from;
    const messageText = messageData.text?.body ?? '';
    const phoneNumberId = value?.metadata?.phone_number_id ?? '';

    // Gelen mesaj istatistiklerini güncelle
    const whatsappAccounts = db
      .listSocialAccounts()
      .filter((a) => a.platform === 'whatsapp');
    const matchingAccount = whatsappAccounts.find(
      (a) => (a.config.phoneNumberId as string) === phoneNumberId,
    );
    if (matchingAccount) {
      db.incrementAccountStats(matchingAccount.id, 'messagesReceived');
    }

    // Komut kontrolü (/ ile başlayan mesajlar)
    await handleCommand(
      messageText,
      'whatsapp',
      senderPhone,
      matchingAccount?.id ?? '',
    );

    reply.code(200);
    return { status: 'ok' };
  });

  // ── Telegram Webhook (POST) ──────────────────────────────────────────

  fastify.post('/telegram', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    // Always respond 200 quickly to Telegram to prevent retries
    reply.code(200);

    const message = (body.message ?? body.edited_message ?? body.channel_post) as Record<string, unknown> | undefined;
    const chatId = message ? String((message.chat as Record<string, unknown>)?.id ?? '') : '';
    const messageText = typeof message?.text === 'string' ? message.text : '';

    // Update stats
    const telegramAccounts = db.listSocialAccounts().filter((a) => a.platform === 'telegram');
    const matchingAccount = telegramAccounts[0];
    if (matchingAccount) db.incrementAccountStats(matchingAccount.id, 'messagesReceived');

    // ── 1. Trigger active TelegramTrigger workflows ──────────────────────
    const { data: eventWorkflows } = db.listWorkflows({ isActive: true, triggerType: 'event' as any, limit: 100 });
    const telegramTriggerWorkflows = eventWorkflows.filter((w) =>
      w.nodes.some((n) => n.type === 'sibercron.telegramTrigger'),
    );

    for (const wf of telegramTriggerWorkflows) {
      try {
        // Pass the raw Telegram update as trigger data.
        // TelegramTrigger node expects update fields (message, callback_query, etc.) at the top level.
        await queueService.addWorkflowJob(wf.id, wf.name, body as Record<string, unknown>, {
          method: 'webhook',
          webhookPath: '/messaging/webhook/telegram',
        });
      } catch (err) {
        fastify.log.error(`[TelegramTrigger] Failed to trigger workflow ${wf.id}: ${(err as Error).message}`);
      }
    }

    // ── 2. Handle slash commands ─────────────────────────────────────────
    if (messageText) {
      await handleCommand(messageText, 'telegram', chatId, matchingAccount?.id ?? '');
    }

    return { status: 'ok' };
  });

  // ── Discord Etkileşim (POST) ─────────────────────────────────────────

  fastify.post('/discord', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      type?: number;
      data?: { name?: string; options?: Array<{ value: string }> };
      channel_id?: string;
    };

    // Discord ping doğrulaması (type 1)
    if (body.type === 1) {
      return { type: 1 };
    }

    // Slash komut etkileşimi (type 2)
    if (body.type === 2 && body.data?.name) {
      const commandName = body.data.name;
      const discordAccounts = db
        .listSocialAccounts()
        .filter((a) => a.platform === 'discord');
      const matchingAccount = discordAccounts[0];
      if (matchingAccount) {
        db.incrementAccountStats(matchingAccount.id, 'messagesReceived');
      }

      await handleCommand(
        `/${commandName}`,
        'discord',
        body.channel_id ?? '',
        matchingAccount?.id ?? '',
      );

      return {
        type: 4,
        data: { content: `Komut /${commandName} işleniyor...` },
      };
    }

    reply.code(200);
    return { status: 'ok' };
  });

  // ── Slack Etkinlik (POST) ────────────────────────────────────────────

  fastify.post('/slack', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      type?: string;
      challenge?: string;
      event?: {
        type: string;
        text?: string;
        channel?: string;
        user?: string;
        bot_id?: string;
      };
    };

    // URL doğrulama challenge'ı
    if (body.type === 'url_verification') {
      return { challenge: body.challenge };
    }

    // Etkinlik callback
    if (body.type === 'event_callback' && body.event) {
      const event = body.event;

      // Bot mesajlarını yoksay
      if (event.bot_id) {
        reply.code(200);
        return { status: 'ok' };
      }

      if (
        (event.type === 'message' || event.type === 'app_mention') &&
        event.text
      ) {
        const slackAccounts = db
          .listSocialAccounts()
          .filter((a) => a.platform === 'slack');
        const matchingAccount = slackAccounts[0];
        if (matchingAccount) {
          db.incrementAccountStats(matchingAccount.id, 'messagesReceived');
        }

        await handleCommand(
          event.text,
          'slack',
          event.channel ?? '',
          matchingAccount?.id ?? '',
        );
      }
    }

    reply.code(200);
    return { status: 'ok' };
  });
}

// ── Komut işleme yardımcısı ────────────────────────────────────────────

async function handleCommand(
  messageText: string,
  platform: string,
  target: string,
  accountId: string,
): Promise<void> {
  const trimmed = messageText.trim();

  // Komut değilse otomatik yanıt kontrolü
  if (!trimmed.startsWith('/')) {
    // Otomatik yanıt workflow'larını kontrol et (whatsapp_auto tipi)
    const workflows = db.listWorkflows({ triggerType: 'webhook' as any });
    // Otomatik yanıt workflow'u varsa tetiklenebilir
    return;
  }

  // Komutu çözümle
  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  // Yerleşik komutlar
  switch (commandName) {
    case 'yardim':
    case 'help': {
      const commands = db.getCommands();
      const response = messagingService.formatHelpResponse(commands);
      await messagingService.send(platform, target, response, accountId);
      return;
    }

    case 'durum':
    case 'status': {
      const workflows = db.listWorkflows();
      const executions = db.listExecutions();
      const response = messagingService.formatStatusResponse({
        workflows: workflows.total,
        activeWorkflows: workflows.data.filter((w) => w.isActive).length,
        executions: executions.total,
        uptime: Math.floor(process.uptime()),
      });
      await messagingService.send(platform, target, response, accountId);
      return;
    }

    case 'calistir':
    case 'run': {
      if (!args) {
        await messagingService.send(
          platform,
          target,
          '⚠️ Kullanım: /calistir <workflow_adı>',
          accountId,
        );
        return;
      }
      // Workflow adına göre bul
      const allWorkflows = db.listWorkflows({ search: args });
      if (allWorkflows.data.length === 0) {
        await messagingService.send(
          platform,
          target,
          `❌ Workflow bulunamadı: ${args}`,
          accountId,
        );
        return;
      }
      await messagingService.send(
        platform,
        target,
        `⚡ Workflow tetikleniyor: ${allWorkflows.data[0].name}`,
        accountId,
      );

      // Execute the workflow via queueService (supports Redis + direct fallback)
      try {
        const wf = allWorkflows.data[0];
        await queueService.addWorkflowJob(wf.id, wf.name, {
          triggeredBy: 'messaging_command',
          platform,
          target,
          accountId,
        });
        await messagingService.send(
          platform,
          target,
          `⚡ Workflow tetiklendi: ${wf.name}`,
          accountId,
        );
      } catch (execErr: unknown) {
        await messagingService.send(
          platform,
          target,
          `❌ Workflow calistirma hatasi: ${(execErr as Error).message || 'Bilinmeyen hata'}`,
          accountId,
        );
      }

      if (accountId) {
        db.incrementAccountStats(accountId, 'workflowsTriggered');
      }
      return;
    }

    case 'son':
    case 'last': {
      const recentExecs = db.listExecutions({ limit: 5 });
      const response = messagingService.formatExecutionResponse(
        recentExecs.data.map((e) => ({
          id: e.id,
          workflowId: e.workflowId,
          status: e.status,
          createdAt: e.createdAt,
        })),
      );
      await messagingService.send(platform, target, response, accountId);
      return;
    }
  }

  // Özel komutları kontrol et
  const registration = db.getCommandByName(commandName);
  if (registration) {
    // Komutun bu platformda aktif olup olmadığını kontrol et
    if (!registration.platforms.includes(platform)) {
      await messagingService.send(
        platform,
        target,
        `⚠️ Bu komut ${platform} platformunda kullanılamaz.`,
        accountId,
      );
      return;
    }

    // İlişkili workflow'u tetikle
    const workflow = db.getWorkflow(registration.workflowId);
    if (workflow) {
      await messagingService.send(
        platform,
        target,
        `⚡ Komut çalıştırılıyor: /${commandName}`,
        accountId,
      );
      try {
        await queueService.addWorkflowJob(workflow.id, workflow.name, {
          triggeredBy: 'messaging_command',
          command: commandName,
          args,
          platform,
          target,
          accountId,
        });
      } catch (execErr: unknown) {
        await messagingService.send(
          platform,
          target,
          `❌ Workflow baslatma hatasi: ${(execErr as Error).message}`,
          accountId,
        );
      }
      if (accountId) {
        db.incrementAccountStats(accountId, 'workflowsTriggered');
      }
    } else {
      await messagingService.send(
        platform,
        target,
        `❌ Komuta bağlı workflow bulunamadı.`,
        accountId,
      );
    }
    return;
  }

  // Bilinmeyen komut
  await messagingService.send(
    platform,
    target,
    `❓ Bilinmeyen komut: /${commandName}\n/yardim yazarak komut listesine bakabilirsiniz.`,
    accountId,
  );
}
