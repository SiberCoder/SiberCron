import { create } from 'zustand';
import type { ChatMessage, SystemState, ChatResponse, ToolCallInfo } from '@sibercron/shared';
import { apiGet, apiPost, apiDelete } from '../api/client';
import { API_BASE_URL } from '../lib/config.js';

const LS_CONVERSATION_ID = 'sibercron_conversation_id';

function loadConversationId(): string {
  try {
    return localStorage.getItem(LS_CONVERSATION_ID) || 'main';
  } catch {
    return 'main';
  }
}

function persistConversationId(id: string) {
  try {
    localStorage.setItem(LS_CONVERSATION_ID, id);
  } catch {
    // ignore
  }
}

/** Streaming event from the SSE /stream endpoint */
export interface StreamEvent {
  type: 'thinking' | 'tool_start' | 'tool_done' | 'generating' | 'content' | 'done' | 'error';
  name?: string;
  args?: Record<string, unknown>;
  status?: string;
  result?: unknown;
  text?: string;
  message?: ChatMessage;
  error?: string;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  conversationId: string;
  systemState: SystemState | null;
  providerStatus: 'connected' | 'no_provider' | 'error';
  currentModel: string | null;
  currentProvider: string | null;
  contextDrawerOpen: boolean;

  // Streaming state
  streamingContent: string;
  streamingToolCalls: ToolCallInfo[];
  streamPhase: 'idle' | 'thinking' | 'tool_running' | 'generating' | 'content' | 'done';

  // Actions
  sendMessage: (content: string, settings?: { maxIterations?: number; temperature?: number; outputFormat?: string }, useStream?: boolean) => Promise<void>;
  loadHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  loadSystemContext: () => Promise<void>;
  newConversation: () => void;
  setContextDrawerOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  isSending: false,
  error: null,
  conversationId: loadConversationId(),
  systemState: null,
  providerStatus: 'no_provider',
  currentModel: null,
  currentProvider: null,
  contextDrawerOpen: false,

  // Streaming state
  streamingContent: '',
  streamingToolCalls: [],
  streamPhase: 'idle',

  sendMessage: async (content: string, settings?: { maxIterations?: number; temperature?: number; outputFormat?: string }, useStream = true) => {
    // Prevent concurrent sends
    if (get().isSending) return;

    const { conversationId } = get();

    // Add user message optimistically
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
      isLoading: true,
      isSending: true,
      error: null,
      streamingContent: '',
      streamingToolCalls: [],
      streamPhase: 'idle',
    }));

    if (useStream) {
      // ── SSE Streaming path ──────────────────────────────────────────
      try {
        const token = (() => {
          try { return localStorage.getItem('sibercron_access_token'); } catch { return null; }
        })();

        const apiBase = `${API_BASE_URL || ''}/api/v1`;
        const response = await fetch(`${apiBase}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: content,
            conversationId,
            ...(settings || {}),
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || response.statusText);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Stream not available');

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';
        const toolCalls: ToolCallInfo[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let event: StreamEvent;
            try { event = JSON.parse(jsonStr); } catch { continue; }

            switch (event.type) {
              case 'thinking':
                set({ streamPhase: 'thinking' });
                break;

              case 'tool_start':
                toolCalls.push({
                  name: event.name || 'unknown',
                  args: event.args || {},
                  status: 'pending',
                });
                set({ streamPhase: 'tool_running', streamingToolCalls: [...toolCalls] });
                break;

              case 'tool_done': {
                let idx = -1;
                for (let i = toolCalls.length - 1; i >= 0; i--) {
                  if (toolCalls[i].name === event.name) { idx = i; break; }
                }
                if (idx >= 0) {
                  toolCalls[idx] = {
                    ...toolCalls[idx],
                    status: (event.status as 'success' | 'error') || 'success',
                    result: event.result,
                  };
                }
                set({ streamingToolCalls: [...toolCalls] });
                break;
              }

              case 'generating':
                set({ streamPhase: 'generating' });
                break;

              case 'content':
                accumulatedContent += event.text || '';
                set({ streamPhase: 'content', streamingContent: accumulatedContent });
                break;

              case 'done': {
                const aiMessage = event.message as ChatMessage;
                if (aiMessage) {
                  const isNoProvider = aiMessage.metadata?.provider === 'none';
                  set((state) => ({
                    messages: [...state.messages.filter((m) => m.id !== userMsg.id), userMsg, aiMessage],
                    isLoading: false,
                    isSending: false,
                    streamPhase: 'done',
                    streamingContent: '',
                    streamingToolCalls: [],
                    providerStatus: isNoProvider ? 'no_provider' : 'connected',
                    currentModel: aiMessage.metadata?.model || state.currentModel,
                    currentProvider: aiMessage.metadata?.provider || state.currentProvider,
                  }));
                }
                break;
              }

              case 'error':
                set((state) => ({
                  messages: state.messages.filter((m) => m.id !== userMsg.id),
                  isLoading: false,
                  isSending: false,
                  streamPhase: 'idle',
                  streamingContent: '',
                  streamingToolCalls: [],
                  error: event.error || 'Stream hatasi',
                  providerStatus: 'error',
                }));
                break;
            }
          }
        }

        // If stream ended without a 'done' event, finalize
        if (get().isSending) {
          set({ isLoading: false, isSending: false, streamPhase: 'idle', streamingContent: '', streamingToolCalls: [] });
        }
      } catch (err) {
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== userMsg.id),
          isLoading: false,
          isSending: false,
          error: (err as Error).message,
          providerStatus: 'error',
          streamPhase: 'idle',
          streamingContent: '',
          streamingToolCalls: [],
        }));
      }
    } else {
      // ── Standard POST path (fallback) ─────────────────────────────
      try {
        const data = await apiPost<ChatResponse>('/chat', {
          message: content,
          conversationId,
          ...(settings || {}),
        });

        const aiMessage = data.message;
        const isNoProvider = aiMessage.metadata?.provider === 'none';

        set((state) => ({
          messages: [...state.messages.filter((m) => m.id !== userMsg.id), userMsg, aiMessage],
          isLoading: false,
          isSending: false,
          providerStatus: isNoProvider ? 'no_provider' : 'connected',
          currentModel: aiMessage.metadata?.model || state.currentModel,
          currentProvider: aiMessage.metadata?.provider || state.currentProvider,
        }));
      } catch (err) {
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== userMsg.id),
          isLoading: false,
          isSending: false,
          error: (err as Error).message,
          providerStatus: 'error',
        }));
      }
    }
  },

  loadHistory: async () => {
    const { conversationId } = get();
    try {
      const data = await apiGet<{ messages: ChatMessage[] }>(
        `/chat/history?conversationId=${encodeURIComponent(conversationId)}`,
      );
      set({ messages: data.messages });
    } catch {
      // Ignore - empty conversation
    }
  },

  clearHistory: async () => {
    const { conversationId } = get();
    try {
      await apiDelete(`/chat/history?conversationId=${encodeURIComponent(conversationId)}`);
      set({ messages: [] });
    } catch {
      // Ignore
    }
  },

  loadSystemContext: async () => {
    try {
      const data = await apiGet<{ state: SystemState }>('/chat/context');
      const state = data.state;

      set({
        systemState: state,
        providerStatus: state.aiProvider ? 'connected' : 'no_provider',
        currentModel: state.aiProvider?.model || null,
        currentProvider: state.aiProvider?.name || null,
      });
    } catch {
      set({ providerStatus: 'error' });
    }
  },

  newConversation: () => {
    const newId = `conv-${Date.now()}`;
    persistConversationId(newId);
    set({
      messages: [],
      conversationId: newId,
      error: null,
    });
  },

  setContextDrawerOpen: (open: boolean) => {
    set({ contextDrawerOpen: open });
  },
}));
