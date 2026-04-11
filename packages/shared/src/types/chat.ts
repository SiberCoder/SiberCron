/** AI Brain / Chat types */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    toolCalls?: ToolCallInfo[];
    tokensUsed?: number;
    model?: string;
    provider?: string;
  };
}

export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: 'pending' | 'success' | 'error';
}

export interface SystemState {
  workflows: {
    total: number;
    active: number;
    recent: Array<{ id: string; name: string; status: string; lastRun?: string }>;
  };
  executions: {
    total: number;
    success: number;
    failed: number;
    running: number;
  };
  accounts: Array<{
    id: string;
    platform: string;
    name: string;
    status: string;
    messageCount: number;
  }>;
  commands: Array<{ command: string; description: string }>;
  uptime: number;
  version: string;
  aiProvider?: {
    name: string;
    model: string;
    status: string;
  };
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  toolResults?: Array<{ name: string; result: unknown; status: string }>;
}
