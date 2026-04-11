import { create } from 'zustand';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';

export interface SocialAccount {
  id: string;
  platform: 'whatsapp' | 'telegram' | 'discord' | 'slack';
  name: string;
  identifier: string;
  status: 'connected' | 'disconnected' | 'configuring';
  config: Record<string, unknown>;
  stats: {
    messagesSent: number;
    messagesReceived: number;
    workflowsTriggered: number;
  };
  lastActivity?: string;
  createdAt: string;
}

interface SocialAccountsState {
  accounts: SocialAccount[];
  loading: boolean;
  fetchAccounts: () => Promise<void>;
  addAccount: (
    platform: SocialAccount['platform'],
    config: Record<string, unknown>,
  ) => Promise<void>;
  updateAccount: (
    id: string,
    config: Record<string, unknown>,
  ) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  testConnection: (
    id: string,
  ) => Promise<{ success: boolean; message: string }>;
}

export const useSocialAccountsStore = create<SocialAccountsState>(
  (set, get) => ({
    accounts: [],
    loading: false,

    fetchAccounts: async () => {
      set({ loading: true });
      try {
        const accounts = await apiGet<SocialAccount[]>('/social-accounts');
        set({ accounts });
      } catch {
        /* ignore */
      } finally {
        set({ loading: false });
      }
    },

    addAccount: async (platform, config) => {
      const account = await apiPost<SocialAccount>('/social-accounts', {
        platform,
        config,
      });
      set((s) => ({ accounts: [...s.accounts, account] }));
    },

    updateAccount: async (id, config) => {
      const updated = await apiPut<SocialAccount>(
        `/social-accounts/${id}`,
        config,
      );
      set((s) => ({
        accounts: s.accounts.map((a) => (a.id === id ? updated : a)),
      }));
    },

    removeAccount: async (id) => {
      await apiDelete(`/social-accounts/${id}`);
      set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }));
    },

    testConnection: async (id) => {
      return apiPost<{ success: boolean; message: string }>(
        `/social-accounts/${id}/test`,
      );
    },
  }),
);
