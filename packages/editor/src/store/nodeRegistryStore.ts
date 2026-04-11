import { create } from 'zustand';
import type { INodeTypeDefinition, NodeGroup } from '@sibercron/shared';
import { apiGet } from '../api/client';

interface NodeRegistryState {
  nodeTypes: INodeTypeDefinition[];
  isLoading: boolean;
  error: string | null;
  fetchNodeTypes: () => Promise<void>;
  getByName: (name: string) => INodeTypeDefinition | undefined;
  getGrouped: () => Record<NodeGroup, INodeTypeDefinition[]>;
}

const GROUP_ORDER: NodeGroup[] = [
  'trigger',
  'ai',
  'messaging',
  'core',
  'data',
  'transform',
];

export const useNodeRegistryStore = create<NodeRegistryState>((set, get) => ({
  nodeTypes: [],
  isLoading: false,
  error: null,

  fetchNodeTypes: async () => {
    set({ isLoading: true, error: null });
    try {
      const types = await apiGet<INodeTypeDefinition[]>('/nodes');
      set({ nodeTypes: types, isLoading: false });
    } catch (err) {
      // Fallback: provide built-in node type definitions for the MVP
      const fallbackTypes: INodeTypeDefinition[] = [
        {
          displayName: 'Manual Trigger',
          name: 'sibercron.manualTrigger',
          icon: 'Play',
          color: '#F59E0B',
          group: 'trigger',
          version: 1,
          description: 'Start workflow manually',
          inputs: [],
          outputs: ['main'],
          properties: [],
        },
        {
          displayName: 'Cron Trigger',
          name: 'sibercron.cronTrigger',
          icon: 'Clock',
          color: '#F59E0B',
          group: 'trigger',
          version: 1,
          description: 'Trigger on a cron schedule',
          inputs: [],
          outputs: ['main'],
          properties: [
            {
              name: 'cronExpression',
              displayName: 'Cron Expression',
              type: 'cron',
              required: true,
              default: '0 * * * *',
              description: 'Cron schedule expression',
            },
          ],
        },
        {
          displayName: 'Webhook Trigger',
          name: 'sibercron.webhookTrigger',
          icon: 'Globe',
          color: '#F59E0B',
          group: 'trigger',
          version: 1,
          description: 'Trigger via HTTP webhook',
          inputs: [],
          outputs: ['main'],
          properties: [
            {
              name: 'httpMethod',
              displayName: 'HTTP Method',
              type: 'select',
              default: 'POST',
              options: [
                { name: 'GET', value: 'GET' },
                { name: 'POST', value: 'POST' },
                { name: 'PUT', value: 'PUT' },
              ],
            },
            {
              name: 'path',
              displayName: 'Path',
              type: 'string',
              placeholder: '/my-webhook',
            },
          ],
        },
        {
          displayName: 'OpenAI Chat',
          name: 'sibercron.aiAgent',
          icon: 'Brain',
          color: '#8B5CF6',
          group: 'ai',
          version: 1,
          description: 'Send messages to OpenAI GPT models',
          inputs: ['main'],
          outputs: ['main'],
          credentials: [{ name: 'openaiApi', required: true }],
          properties: [
            {
              name: 'model',
              displayName: 'Model',
              type: 'select',
              default: 'gpt-4o',
              options: [
                { name: 'GPT-4o', value: 'gpt-4o' },
                { name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
                { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
              ],
            },
            {
              name: 'systemPrompt',
              displayName: 'System Prompt',
              type: 'code',
              default: 'You are a helpful assistant.',
              description: 'System message for the AI',
            },
            {
              name: 'userMessage',
              displayName: 'User Message',
              type: 'string',
              required: true,
              description: 'The message to send. Use {{$input.json.field}} for dynamic data.',
            },
            {
              name: 'temperature',
              displayName: 'Temperature',
              type: 'number',
              default: 0.7,
            },
          ],
        },
        {
          displayName: 'Otonom Gelistirme',
          name: 'sibercron.autonomousDev',
          icon: 'RefreshCcw',
          color: '#8B5CF6',
          group: 'ai',
          version: 1,
          description: 'AI ile otonom gelistirme dongusu',
          inputs: ['main'],
          outputs: ['completed', 'maxIterations', 'stopped', 'error'],
          properties: [
            {
              name: 'instruction',
              displayName: 'Talimat',
              type: 'code',
              required: true,
              description: 'AI\'ya verilecek gelistirme talimati',
            },
            {
              name: 'workingDirectory',
              displayName: 'Calisma Dizini',
              type: 'string',
              default: '.',
            },
            {
              name: 'model',
              displayName: 'Model',
              type: 'select',
              default: 'claude-sonnet-4-6',
              options: [
                { name: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
                { name: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
                { name: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
              ],
            },
            {
              name: 'maxLoopIterations',
              displayName: 'Maks Dongu Sayisi',
              type: 'number',
              default: 10,
            },
            {
              name: 'autoAnswerStrategy',
              displayName: 'Soru Cevaplama Stratejisi',
              type: 'select',
              default: 'useDefault',
              options: [
                { name: 'Varsayilan cevap ver', value: 'useDefault' },
                { name: 'AI ile cevap uret', value: 'contextual' },
                { name: 'Dur, donguyu bitir', value: 'stop' },
              ],
            },
            {
              name: 'defaultAnswer',
              displayName: 'Varsayilan Cevap',
              type: 'string',
              default: 'Evet, devam et. En iyi karari sen ver.',
              displayOptions: { show: { autoAnswerStrategy: ['useDefault'] } },
            },
            {
              name: 'cooldownMs',
              displayName: 'Bekleme Suresi (ms)',
              type: 'number',
              default: 2000,
            },
            {
              name: 'iterationTimeoutMs',
              displayName: 'Iterasyon Zaman Asimi (ms)',
              type: 'number',
              default: 300000,
            },
            {
              name: 'systemContext',
              displayName: 'Ek Sistem Baglami',
              type: 'code',
              default: '',
            },
          ],
        },
        {
          displayName: 'HTTP Request',
          name: 'sibercron.httpRequest',
          icon: 'Globe',
          color: '#6B7280',
          group: 'core',
          version: 1,
          description: 'Make HTTP API calls',
          inputs: ['main'],
          outputs: ['main'],
          properties: [
            {
              name: 'method',
              displayName: 'Method',
              type: 'select',
              default: 'GET',
              options: [
                { name: 'GET', value: 'GET' },
                { name: 'POST', value: 'POST' },
                { name: 'PUT', value: 'PUT' },
                { name: 'DELETE', value: 'DELETE' },
                { name: 'PATCH', value: 'PATCH' },
              ],
            },
            {
              name: 'url',
              displayName: 'URL',
              type: 'string',
              required: true,
              placeholder: 'https://api.example.com/endpoint',
            },
            {
              name: 'headers',
              displayName: 'Headers',
              type: 'json',
              default: '{}',
            },
            {
              name: 'body',
              displayName: 'Body',
              type: 'json',
              default: '{}',
              description: 'Request body (for POST/PUT/PATCH)',
            },
          ],
        },
        {
          displayName: 'Code',
          name: 'sibercron.code',
          icon: 'FileCode',
          color: '#6B7280',
          group: 'core',
          version: 1,
          description: 'Run custom JavaScript code',
          inputs: ['main'],
          outputs: ['main'],
          properties: [
            {
              name: 'code',
              displayName: 'JavaScript Code',
              type: 'code',
              required: true,
              default: '// Access input data via $input\nconst items = $input.all();\nreturn items;',
            },
          ],
        },
        {
          displayName: 'IF Condition',
          name: 'sibercron.conditional',
          icon: 'GitBranch',
          color: '#6B7280',
          group: 'core',
          version: 1,
          description: 'Route data based on conditions',
          inputs: ['main'],
          outputs: ['true', 'false'],
          properties: [
            {
              name: 'field',
              displayName: 'Field',
              type: 'string',
              required: true,
              placeholder: 'json.status',
            },
            {
              name: 'operation',
              displayName: 'Operation',
              type: 'select',
              default: 'equals',
              options: [
                { name: 'Equals', value: 'equals' },
                { name: 'Not Equals', value: 'notEquals' },
                { name: 'Contains', value: 'contains' },
                { name: 'Greater Than', value: 'greaterThan' },
                { name: 'Less Than', value: 'lessThan' },
              ],
            },
            {
              name: 'value',
              displayName: 'Value',
              type: 'string',
              required: true,
            },
          ],
        },
        {
          displayName: 'Telegram Send',
          name: 'sibercron.telegramSend',
          icon: 'Send',
          color: '#3B82F6',
          group: 'messaging',
          version: 1,
          description: 'Send a Telegram message',
          inputs: ['main'],
          outputs: ['main'],
          credentials: [{ name: 'telegramApi', required: true }],
          properties: [
            {
              name: 'chatId',
              displayName: 'Chat ID',
              type: 'string',
              required: true,
              placeholder: '123456789',
            },
            {
              name: 'text',
              displayName: 'Message',
              type: 'code',
              required: true,
            },
          ],
        },
        {
          displayName: 'Slack Send',
          name: 'sibercron.slackSend',
          icon: 'MessageSquare',
          color: '#3B82F6',
          group: 'messaging',
          version: 1,
          description: 'Send a Slack message',
          inputs: ['main'],
          outputs: ['main'],
          credentials: [{ name: 'slackApi', required: true }],
          properties: [
            {
              name: 'channel',
              displayName: 'Channel',
              type: 'string',
              required: true,
              placeholder: '#general',
            },
            {
              name: 'text',
              displayName: 'Message',
              type: 'code',
              required: true,
            },
          ],
        },
        {
          displayName: 'Log',
          name: 'sibercron.log',
          icon: 'FileText',
          color: '#6B7280',
          group: 'core',
          version: 1,
          description: 'Log data for debugging',
          inputs: ['main'],
          outputs: ['main'],
          properties: [
            {
              name: 'message',
              displayName: 'Message',
              type: 'string',
              default: '',
              description: 'Message to log',
            },
          ],
        },
        {
          displayName: 'Transform',
          name: 'sibercron.transform',
          icon: 'Shuffle',
          color: '#EC4899',
          group: 'transform',
          version: 1,
          description: 'Transform and reshape JSON data',
          inputs: ['main'],
          outputs: ['main'],
          properties: [
            {
              name: 'mode',
              displayName: 'Mode',
              type: 'select',
              default: 'expression',
              options: [
                { name: 'Expression', value: 'expression' },
                { name: 'Template', value: 'template' },
              ],
            },
            {
              name: 'expression',
              displayName: 'Transform Expression',
              type: 'code',
              required: true,
              default: '// Transform each item\nreturn { ...item, transformed: true };',
            },
          ],
        },
        {
          displayName: 'Merge',
          name: 'sibercron.merge',
          icon: 'GitMerge',
          color: '#EC4899',
          group: 'transform',
          version: 1,
          description: 'Merge multiple inputs into one',
          inputs: ['main'],
          outputs: ['main'],
          properties: [
            {
              name: 'operation',
              displayName: 'Operation',
              type: 'select',
              default: 'split',
              options: [
                { name: 'Split Array', value: 'split' },
                { name: 'Merge Items', value: 'merge' },
                { name: 'Aggregate', value: 'aggregate' },
              ],
            },
            {
              name: 'fieldToSplit',
              displayName: 'Field to Split',
              type: 'string',
              placeholder: 'json.items',
            },
          ],
        },
      ];

      set({
        nodeTypes: fallbackTypes,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch node types',
      });
    }
  },

  getByName: (name) => {
    return get().nodeTypes.find((nt) => nt.name === name);
  },

  getGrouped: () => {
    const types = get().nodeTypes;
    const grouped: Record<string, INodeTypeDefinition[]> = {};
    for (const g of GROUP_ORDER) {
      grouped[g] = [];
    }
    for (const nt of types) {
      if (!grouped[nt.group]) {
        grouped[nt.group] = [];
      }
      grouped[nt.group].push(nt);
    }
    return grouped as Record<NodeGroup, INodeTypeDefinition[]>;
  },
}));
