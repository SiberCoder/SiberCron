import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * WhatsApp Receive trigger node.
 * Triggers workflows with incoming WhatsApp messages.
 * Passes message data injected by webhook handler.
 */
export const WhatsAppReceiveNode: INodeType = {
  definition: {
    displayName: 'WhatsApp Receive',
    name: 'sibercron.whatsappReceive',
    icon: 'MessageSquare',
    color: '#25D366',
    group: 'trigger',
    version: 1,
    description: 'Trigger workflow with incoming WhatsApp messages',
    inputs: [],
    outputs: ['main'],
    properties: [
      {
        name: 'phoneFilter',
        displayName: 'Phone Filter',
        type: 'string',
        default: '',
        required: false,
        description: 'Filter messages from specific phone number (empty for all)',
      },
      {
        name: 'messageFilter',
        displayName: 'Message Filter (Regex)',
        type: 'string',
        default: '',
        required: false,
        description: 'Filter message content with regex (empty for all)',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const phoneFilter = context.getParameter<string>('phoneFilter');
    const messageFilter = context.getParameter<string>('messageFilter');

    // Get input data injected by webhook handler
    const inputData = context.getInputData();
    const items = inputData ?? [];

    const filtered = items.filter((item) => {
      const json = item.json as Record<string, unknown>;

      // Phone filter
      if (phoneFilter && json.from !== phoneFilter) {
        return false;
      }

      // Message regex filter
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
      context.helpers.log('WhatsApp Receive: No messages matching filters, skipping.');
      return [];
    }

    context.helpers.log(`WhatsApp Receive: received ${filtered.length} messages.`);
    return filtered;
  },
};
