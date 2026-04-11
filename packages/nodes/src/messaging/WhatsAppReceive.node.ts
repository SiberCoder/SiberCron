import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * WhatsApp Receive trigger node.
 * Gelen WhatsApp mesajlarıyla tetiklenen workflow'larda kullanılır.
 * Webhook handler tarafından enjekte edilen mesaj verisini iletir.
 */
export const WhatsAppReceiveNode: INodeType = {
  definition: {
    displayName: 'WhatsApp Receive',
    name: 'sibercron.whatsappReceive',
    icon: 'MessageSquare',
    color: '#25D366',
    group: 'trigger',
    version: 1,
    description: 'Gelen WhatsApp mesajlarıyla workflow tetikler',
    inputs: [],
    outputs: ['main'],
    properties: [
      {
        name: 'phoneFilter',
        displayName: 'Phone Filter',
        type: 'string',
        default: '',
        required: false,
        description: 'Belirli bir telefon numarasından gelen mesajları filtrele (boş bırakılırsa tümü)',
      },
      {
        name: 'messageFilter',
        displayName: 'Message Filter (Regex)',
        type: 'string',
        default: '',
        required: false,
        description: 'Mesaj içeriğini regex ile filtrele (boş bırakılırsa tümü)',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const phoneFilter = context.getParameter<string>('phoneFilter');
    const messageFilter = context.getParameter<string>('messageFilter');

    // Webhook handler tarafından enjekte edilen giriş verisini al
    const inputData = context.getInputData();
    const items = inputData ?? [];

    const filtered = items.filter((item) => {
      const json = item.json as Record<string, unknown>;

      // Telefon filtresi
      if (phoneFilter && json.from !== phoneFilter) {
        return false;
      }

      // Mesaj regex filtresi
      if (messageFilter) {
        const text = (json.text as string) ?? '';
        const regex = new RegExp(messageFilter, 'i');
        if (!regex.test(text)) {
          return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      context.helpers.log('WhatsApp Receive: Filtrelerle eşleşen mesaj yok, atlanıyor.');
      return [];
    }

    context.helpers.log(`WhatsApp Receive: ${filtered.length} mesaj alındı.`);
    return filtered;
  },
};
