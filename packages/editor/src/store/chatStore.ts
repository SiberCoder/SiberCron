import { create } from 'zustand';
import type { ChatMessage, SystemState, ChatResponse } from '@sibercron/shared';
import { apiGet, apiPost, apiDelete } from '../api/client';

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

  // Actions
  sendMessage: (content: string, settings?: { maxIterations?: number; temperature?: number; outputFormat?: string }) => Promise<void>;
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
  conversationId: 'main',
  systemState: null,
  providerStatus: 'no_provider',
  currentModel: null,
  currentProvider: null,
  contextDrawerOpen: false,

  sendMessage: async (content: string, settings?: { maxIterations?: number; temperature?: number; outputFormat?: string }) => {
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
    }));

    try {
      const data = await apiPost<ChatResponse>('/chat', {
        message: content,
        conversationId,
        ...(settings || {}),
      });

      const aiMessage = data.message;

      // Determine provider status from response
      const isNoProvider = aiMessage.metadata?.provider === 'none';

      set((state) => ({
        // Replace temp user message with server-side conversation
        messages: [...state.messages.filter((m) => m.id !== userMsg.id), userMsg, aiMessage],
        isLoading: false,
        isSending: false,
        providerStatus: isNoProvider ? 'no_provider' : 'connected',
        currentModel: aiMessage.metadata?.model || state.currentModel,
        currentProvider: aiMessage.metadata?.provider || state.currentProvider,
      }));
    } catch (err) {
      set((state) => ({
        // Remove the optimistic user message so the chat doesn't show an orphaned message
        messages: state.messages.filter((m) => m.id !== userMsg.id),
        isLoading: false,
        isSending: false,
        error: (err as Error).message,
        providerStatus: 'error',
      }));
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
