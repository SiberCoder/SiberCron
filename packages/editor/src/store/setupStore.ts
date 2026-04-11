import { create } from 'zustand';
import type { AIProviderConfig } from '@sibercron/shared';
import { apiPost } from '../api/client';

export interface SetupConfig {
  ai: {
    openaiKey?: string;
    anthropicKey?: string;
    providers?: AIProviderConfig[];
  };
  messaging: {
    whatsapp?: { phoneNumber: string; apiKey: string; enabled: boolean };
    telegram?: { botToken: string; enabled: boolean };
    discord?: { botToken: string; webhookUrl: string; enabled: boolean };
    slack?: { botToken: string; workspace: string; enabled: boolean };
  };
  scheduling: {
    timezone: string;
    defaultCron: string;
    timeout: number;
    maxConcurrent: number;
  };
}

interface SetupState {
  currentStep: number;
  totalSteps: number;
  isComplete: boolean;
  config: SetupConfig;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateAIConfig: (data: Partial<SetupConfig['ai']>) => void;
  updateAIProviders: (providers: AIProviderConfig[]) => void;
  updateMessagingConfig: <P extends keyof SetupConfig['messaging']>(
    platform: P,
    data: SetupConfig['messaging'][P],
  ) => void;
  updateSchedulingConfig: (data: Partial<SetupConfig['scheduling']>) => void;
  completeSetup: () => void;
  saveConfig: () => Promise<void>;
}

export const useSetupStore = create<SetupState>((set, get) => ({
  currentStep: 0,
  totalSteps: 5,
  isComplete: localStorage.getItem('sibercron_setup_complete') === 'true',
  config: {
    ai: { providers: [] },
    messaging: {},
    scheduling: {
      timezone: 'Europe/Istanbul',
      defaultCron: '0 * * * *',
      timeout: 300,
      maxConcurrent: 5,
    },
  },

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => {
    const { currentStep, totalSteps } = get();
    if (currentStep < totalSteps - 1) set({ currentStep: currentStep + 1 });
  },
  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },

  updateAIConfig: (data) =>
    set((s) => ({ config: { ...s.config, ai: { ...s.config.ai, ...data } } })),

  updateAIProviders: (providers) =>
    set((s) => {
      const openai = providers.find((p) => p.name === 'openai' && p.enabled);
      const anthropic = providers.find((p) => p.name === 'anthropic' && p.enabled);
      return {
      config: {
        ...s.config,
        ai: {
          ...s.config.ai,
          providers,
          openaiKey: openai?.config.apiKey || s.config.ai.openaiKey,
          anthropicKey: anthropic?.config.apiKey || s.config.ai.anthropicKey,
        },
      },
    };
    }),

  updateMessagingConfig: (platform, data) =>
    set((s) => ({
      config: {
        ...s.config,
        messaging: { ...s.config.messaging, [platform]: data },
      },
    })),

  updateSchedulingConfig: (data) =>
    set((s) => ({
      config: {
        ...s.config,
        scheduling: { ...s.config.scheduling, ...data },
      },
    })),

  completeSetup: () => {
    localStorage.setItem('sibercron_setup_complete', 'true');
    set({ isComplete: true });
  },

  saveConfig: async () => {
    const { config } = get();
    await apiPost('/setup/config', config);
  },
}));
