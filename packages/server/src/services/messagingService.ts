import { db } from '../db/database.js';
import type { ICommandRegistration, ISocialAccount } from '../db/database.js';

/**
 * Merkezi mesaj gönderme servisi.
 * Tüm platformlara (WhatsApp, Telegram, Discord, Slack) mesaj gönderir.
 */
export class MessagingService {
  // ── WhatsApp ─────────────────────────────────────────────────────────

  async sendWhatsApp(
    phoneNumber: string,
    message: string,
    accountId: string,
  ): Promise<boolean> {
    const account = db.getSocialAccount(accountId);
    if (!account) return false;

    const { accessToken, phoneNumberId } = account.config as {
      accessToken: string;
      phoneNumberId: string;
    };

    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'text',
            text: { body: message },
          }),
        },
      );

      if (res.ok) {
        db.incrementAccountStats(accountId, 'messagesSent');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[MessagingService] WhatsApp send failed:', error);
      return false;
    }
  }

  // ── Telegram ─────────────────────────────────────────────────────────

  async sendTelegram(
    chatId: string,
    message: string,
    accountId: string,
  ): Promise<boolean> {
    const account = db.getSocialAccount(accountId);
    if (!account) return false;

    const { botToken } = account.config as { botToken: string };

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
          }),
        },
      );

      if (res.ok) {
        db.incrementAccountStats(accountId, 'messagesSent');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[MessagingService] Telegram send failed:', error);
      return false;
    }
  }

  // ── Discord ──────────────────────────────────────────────────────────

  async sendDiscord(
    webhookUrl: string,
    content: string,
    accountId: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.ok || res.status === 204) {
        db.incrementAccountStats(accountId, 'messagesSent');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[MessagingService] Discord send failed:', error);
      return false;
    }
  }

  // ── Slack ────────────────────────────────────────────────────────────

  async sendSlack(
    channel: string,
    text: string,
    accountId: string,
  ): Promise<boolean> {
    const account = db.getSocialAccount(accountId);
    if (!account) return false;

    const { botToken } = account.config as { botToken: string };

    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel, text }),
      });

      if (res.ok) {
        const data = (await res.json()) as { ok: boolean };
        if (data.ok) {
          db.incrementAccountStats(accountId, 'messagesSent');
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('[MessagingService] Slack send failed:', error);
      return false;
    }
  }

  // ── Genel gönderim (platforma göre yönlendirir) ─────────────────────

  async send(
    platform: string,
    target: string,
    message: string,
    accountId: string,
  ): Promise<boolean> {
    switch (platform) {
      case 'whatsapp':
        return this.sendWhatsApp(target, message, accountId);
      case 'telegram':
        return this.sendTelegram(target, message, accountId);
      case 'discord':
        return this.sendDiscord(target, message, accountId);
      case 'slack':
        return this.sendSlack(target, message, accountId);
      default:
        return false;
    }
  }

  // ── Yerleşik komut yanıt formatlayıcıları ───────────────────────────

  formatHelpResponse(commands: ICommandRegistration[]): string {
    if (commands.length === 0) {
      return '📋 Kayıtlı komut bulunamadı.\n\nYerleşik komutlar:\n/yardim - Komut listesini gösterir\n/durum - Sistem durumunu gösterir\n/calistir <isim> - Workflow çalıştırır\n/son - Son 5 çalıştırma sonucu';
    }

    let text = '📋 *Kullanılabilir Komutlar*\n\n';
    text += '🔧 *Yerleşik:*\n';
    text += '/yardim - Komut listesini gösterir\n';
    text += '/durum - Sistem durumunu gösterir\n';
    text += '/calistir <isim> - Workflow çalıştırır\n';
    text += '/son - Son 5 çalıştırma sonucu\n\n';
    text += '⚡ *Özel Komutlar:*\n';

    for (const cmd of commands) {
      text += `/${cmd.command} - ${cmd.description}\n`;
    }

    return text;
  }

  formatStatusResponse(data: {
    workflows: number;
    activeWorkflows: number;
    executions: number;
    uptime: number;
  }): string {
    const hours = Math.floor(data.uptime / 3600);
    const minutes = Math.floor((data.uptime % 3600) / 60);

    return (
      `📊 *SiberCron Durum*\n\n` +
      `🔄 Toplam Workflow: ${data.workflows}\n` +
      `✅ Aktif Workflow: ${data.activeWorkflows}\n` +
      `📝 Toplam Çalıştırma: ${data.executions}\n` +
      `⏱ Çalışma Süresi: ${hours}s ${minutes}dk`
    );
  }

  formatExecutionResponse(
    executions: Array<{
      id: string;
      workflowId: string;
      status: string;
      createdAt: string;
    }>,
  ): string {
    if (executions.length === 0) {
      return '📝 Henüz çalıştırma kaydı yok.';
    }

    let text = '📝 *Son Çalıştırmalar*\n\n';

    for (const exec of executions) {
      const statusIcon =
        exec.status === 'completed'
          ? '✅'
          : exec.status === 'failed'
            ? '❌'
            : '⏳';
      const date = new Date(exec.createdAt).toLocaleString('tr-TR');
      text += `${statusIcon} ${exec.id.slice(0, 8)} - ${exec.status} (${date})\n`;
    }

    return text;
  }
}

export const messagingService = new MessagingService();
