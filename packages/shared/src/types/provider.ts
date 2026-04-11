/** AI Provider types for multi-provider, multi-auth support */

export type AIAuthMethod =
  | 'api_key'           // Direct API key
  | 'oauth_session'     // Browser OAuth / session token
  | 'local'             // Local model (Ollama, no auth needed)
  | 'custom_endpoint'   // OpenAI-compatible custom URL
  | 'cli_delegation'    // Claude CLI binary delegation
  | 'env_variable'      // Reference to environment variable
  | 'setup_token';      // One-time setup token (claude.ai subscription)

export type AIProviderName = 'openai' | 'anthropic' | 'google' | 'ollama' | 'openrouter' | 'groq' | 'custom' | 'mistral' | 'deepseek' | 'xai' | 'github_copilot' | 'together' | 'perplexity';

export interface AIProviderConfig {
  name: AIProviderName;
  displayName: string;
  authMethod: AIAuthMethod;
  enabled: boolean;
  isDefault: boolean;
  config: {
    // API Key auth
    apiKey?: string;

    // OAuth/Session auth
    sessionToken?: string;
    refreshToken?: string;
    expiresAt?: string;

    // Local model (Ollama)
    baseUrl?: string;  // e.g. http://localhost:11434
    autoDetect?: boolean;

    // Custom endpoint (OpenAI-compatible)
    customBaseUrl?: string;
    customApiKey?: string;

    // CLI delegation
    cliCommand?: string;    // default: 'claude'
    cliAvailable?: boolean;
    cliVersion?: string;
    cliAuthenticated?: boolean;

    // Environment variable reference
    envVariable?: string;   // e.g. 'ANTHROPIC_API_KEY'
    envResolved?: boolean;  // whether the env var was found

    // Setup token (claude.ai subscription)
    setupToken?: string;    // sk-ant-oat01-...

    // Common
    defaultModel?: string;
    availableModels?: string[];
    maxTokens?: number;
    temperature?: number;
  };
}

export interface AIModelConfig {
  id: string;
  name: string;
  provider: AIProviderName;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

export const AI_PROVIDERS: Record<AIProviderName, {
  displayName: string;
  icon: string;
  color: string;
  authMethods: AIAuthMethod[];
  defaultBaseUrl: string;
  models: AIModelConfig[];
}> = {
  openai: {
    displayName: 'OpenAI',
    icon: 'Sparkles',
    color: '#10A37F',
    authMethods: ['api_key', 'env_variable', 'oauth_session', 'custom_endpoint'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, supportsTools: true, supportsVision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, supportsTools: true, supportsVision: true },
      { id: 'o3-mini', name: 'o3-mini', provider: 'openai', contextWindow: 200000, supportsTools: true, supportsVision: false },
    ],
  },
  anthropic: {
    displayName: 'Anthropic',
    icon: 'Brain',
    color: '#D4A574',
    authMethods: ['api_key', 'cli_delegation', 'env_variable', 'setup_token', 'oauth_session'],
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', contextWindow: 200000, supportsTools: true, supportsVision: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', contextWindow: 200000, supportsTools: true, supportsVision: true },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', contextWindow: 1000000, supportsTools: true, supportsVision: true },
    ],
  },
  google: {
    displayName: 'Google Gemini',
    icon: 'Gem',
    color: '#4285F4',
    authMethods: ['api_key', 'env_variable', 'oauth_session'],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', contextWindow: 1000000, supportsTools: true, supportsVision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', contextWindow: 1000000, supportsTools: true, supportsVision: true },
    ],
  },
  ollama: {
    displayName: 'Ollama (Yerel)',
    icon: 'Server',
    color: '#FFFFFF',
    authMethods: ['local'],
    defaultBaseUrl: 'http://localhost:11434',
    models: [], // auto-detected
  },
  openrouter: {
    displayName: 'OpenRouter',
    icon: 'Route',
    color: '#6366F1',
    authMethods: ['api_key'],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    models: [],
  },
  groq: {
    displayName: 'Groq',
    icon: 'Zap',
    color: '#F55036',
    authMethods: ['api_key'],
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', contextWindow: 128000, supportsTools: true, supportsVision: false },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'groq', contextWindow: 32768, supportsTools: true, supportsVision: false },
    ],
  },
  custom: {
    displayName: 'Ozel Endpoint',
    icon: 'Settings',
    color: '#8B5CF6',
    authMethods: ['custom_endpoint'],
    defaultBaseUrl: '',
    models: [],
  },
  mistral: {
    displayName: 'Mistral AI',
    icon: 'Wind',
    color: '#FF7000',
    authMethods: ['api_key', 'env_variable'],
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral', contextWindow: 128000, supportsTools: true, supportsVision: true },
      { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral', contextWindow: 128000, supportsTools: true, supportsVision: false },
      { id: 'codestral-latest', name: 'Codestral', provider: 'mistral', contextWindow: 256000, supportsTools: true, supportsVision: false },
    ],
  },
  deepseek: {
    displayName: 'DeepSeek',
    icon: 'Telescope',
    color: '#4D6BFE',
    authMethods: ['api_key', 'env_variable'],
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', contextWindow: 131072, supportsTools: true, supportsVision: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek', contextWindow: 131072, supportsTools: true, supportsVision: false },
    ],
  },
  xai: {
    displayName: 'xAI (Grok)',
    icon: 'Bot',
    color: '#000000',
    authMethods: ['api_key', 'env_variable'],
    defaultBaseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-3', name: 'Grok 3', provider: 'xai', contextWindow: 131072, supportsTools: true, supportsVision: true },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', provider: 'xai', contextWindow: 131072, supportsTools: true, supportsVision: false },
    ],
  },
  github_copilot: {
    displayName: 'GitHub Copilot',
    icon: 'Github',
    color: '#24292F',
    authMethods: ['oauth_session'],
    defaultBaseUrl: 'https://api.githubcopilot.com',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (Copilot)', provider: 'github_copilot', contextWindow: 128000, supportsTools: true, supportsVision: true },
    ],
  },
  together: {
    displayName: 'Together AI',
    icon: 'Users',
    color: '#0F6FFF',
    authMethods: ['api_key', 'env_variable'],
    defaultBaseUrl: 'https://api.together.xyz/v1',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', provider: 'together', contextWindow: 131072, supportsTools: true, supportsVision: false },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B', provider: 'together', contextWindow: 131072, supportsTools: true, supportsVision: false },
    ],
  },
  perplexity: {
    displayName: 'Perplexity',
    icon: 'Search',
    color: '#20808D',
    authMethods: ['api_key', 'env_variable'],
    defaultBaseUrl: 'https://api.perplexity.ai',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', provider: 'perplexity', contextWindow: 200000, supportsTools: false, supportsVision: false },
      { id: 'sonar', name: 'Sonar', provider: 'perplexity', contextWindow: 128000, supportsTools: false, supportsVision: false },
    ],
  },
};
