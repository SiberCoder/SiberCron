import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * WhatsApp Send node.
 * WhatsApp Cloud API üzerinden mesaj gönderir.
 */
export const WhatsAppSendNode: INodeType = {
  definition: {
    displayName: 'WhatsApp Send',
    name: 'sibercron.whatsappSend',
    icon: 'Send',
    color: '#25D366',
    group: 'messaging',
    version: 1,
    description: 'WhatsApp Cloud API ile mesaj gönderir',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'whatsappApi',
        required: true,
        displayName: 'WhatsApp API Credentials',
      },
    ],
    properties: [
      {
        name: 'phoneNumber',
        displayName: 'Phone Number',
        type: 'string',
        default: '',
        required: true,
        description: 'Mesaj gönderilecek telefon numarası (uluslararası format, ör: 905551234567)',
      },
      {
        name: 'message',
        displayName: 'Message',
        type: 'string',
        default: '',
        required: true,
        description: 'Gönderilecek mesaj metni',
      },
      {
        name: 'messageType',
        displayName: 'Message Type',
        type: 'select',
        default: 'text',
        required: false,
        description: 'Mesaj tipi',
        options: [
          { name: 'Text', value: 'text' },
          { name: 'Template', value: 'template' },
        ],
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const phoneNumber = context.getParameter<string>('phoneNumber');
    const message = context.getParameter<string>('message');
    const messageType = context.getParameter<string>('messageType') ?? 'text';
    const credentials = await context.getCredential('whatsappApi');

    const accessToken = credentials['accessToken'] as string;
    const phoneNumberId = credentials['phoneNumberId'] as string;

    context.helpers.log(`WhatsApp: ${phoneNumber} numarasına mesaj gönderiliyor`);

    let body: Record<string, unknown>;

    if (messageType === 'template') {
      body = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: message,
          language: { code: 'tr' },
        },
      };
    } else {
      body = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: message },
      };
    }

    const response = await context.helpers.httpRequest({
      url: `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    return [{ json: response as Record<string, unknown> }];
  },
};
