import { useState, useEffect, useCallback } from 'react';
import { 
  LLMProvider, 
  LLMProviderConfig, 
  PROVIDER_PRESETS 
} from '../types/llm-providers';
import { providerRegistry, registerBuiltinProviders } from '../providers/provider-registry';

interface ProviderState {
  providers: LLMProviderConfig[];
  activeProviderId: string | null;
  activeProvider: LLMProvider | null;
}

export function useLLMProviders() {
  const [state, setState] = useState<ProviderState>({
    providers: [],
    activeProviderId: null,
    activeProvider: null,
  });
  
  const [initializing, setInitializing] = useState(true);

  // Initialize built-in providers and load saved configurations
  useEffect(() => {
    const initialize = async () => {
      // Register built-in providers
      registerBuiltinProviders();
      
      // Load saved providers from localStorage
      try {
        const saved = localStorage.getItem('llm-providers');
        if (saved) {
          const { providers, activeProviderId } = JSON.parse(saved);
          setState(prev => ({
            ...prev,
            providers: providers || [],
            activeProviderId: activeProviderId || null,
          }));
        } else {
          // Initialize with default Anthropic provider
          const defaultProvider: LLMProviderConfig = {
            id: 'anthropic-default',
            name: 'Anthropic Claude',
            type: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
            auth: { type: 'api-key', apiKey: '' },
            temperature: 0.7,
            maxTokens: 4096,
          };
          
          setState(prev => ({
            ...prev,
            providers: [defaultProvider],
            activeProviderId: defaultProvider.id,
          }));
        }
      } catch (error) {
        console.warn('Failed to load saved LLM providers:', error);
      }
      
      setInitializing(false);
    };

    initialize();
  }, []);

  // Save to localStorage whenever providers change
  useEffect(() => {
    if (!initializing) {
      try {
        localStorage.setItem('llm-providers', JSON.stringify({
          providers: state.providers,
          activeProviderId: state.activeProviderId,
        }));
      } catch (error) {
        console.warn('Failed to save LLM providers:', error);
      }
    }
  }, [state.providers, state.activeProviderId, initializing]);

  // Initialize active provider when it changes
  useEffect(() => {
    const initializeActiveProvider = async () => {
      if (!state.activeProviderId) {
        setState(prev => ({ ...prev, activeProvider: null }));
        return;
      }

      const config = state.providers.find(p => p.id === state.activeProviderId);
      if (!config) {
        setState(prev => ({ ...prev, activeProvider: null }));
        return;
      }

      try {
        const provider = providerRegistry.create(config);
        await provider.initialize(config);
        setState(prev => ({ ...prev, activeProvider: provider }));
      } catch (error) {
        console.error('Failed to initialize provider:', error);
        setState(prev => ({ ...prev, activeProvider: null }));
      }
    };

    if (!initializing) {
      initializeActiveProvider();
    }
  }, [state.activeProviderId, state.providers, initializing]);

  const addProvider = useCallback((config: LLMProviderConfig) => {
    setState(prev => ({
      ...prev,
      providers: [...prev.providers, config],
    }));
  }, []);

  const updateProvider = useCallback((id: string, updates: Partial<LLMProviderConfig>) => {
    setState(prev => ({
      ...prev,
      providers: prev.providers.map(p => 
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  }, []);

  const removeProvider = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      providers: prev.providers.filter(p => p.id !== id),
      activeProviderId: prev.activeProviderId === id ? null : prev.activeProviderId,
    }));
  }, []);

  const setActiveProvider = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, activeProviderId: id }));
  }, []);

  const testProvider = useCallback(async (config: LLMProviderConfig): Promise<boolean> => {
    console.log('🔍 Testing provider with REAL API call:', config.name, 'Type:', config.type);
    console.log('📋 Config details:', JSON.stringify(config, null, 2));
    
    try {
      console.log('⚡ Creating provider instance...');
      const provider = providerRegistry.create(config);
      
      console.log('🔧 Initializing provider...');
      await provider.initialize(config);
      
      console.log('🌐 Making real API call to test model...');
      const healthResult = provider.healthCheck ? await provider.healthCheck() : true;
      console.log('✅ Real API test result:', healthResult);
      
      if (healthResult) {
        console.log('🎉 SUCCESS: Model responded correctly to test call!');
      } else {
        console.log('❌ FAILED: Model did not respond as expected');
      }
      
      return healthResult;
    } catch (error) {
      console.error('❌ Provider test failed:', error);
      
      // Log specific error details for debugging
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          console.error('🌐 Network Error: Cannot connect to server');
        } else if (error.message.includes('401')) {
          console.error('🔐 Auth Error: Invalid API key or authentication');
        } else if (error.message.includes('404')) {
          console.error('🔍 Not Found: Model or endpoint not found');
        } else if (error.message.includes('CORS')) {
          console.error('🚫 CORS Error: Server not configured for browser requests');
        } else {
          console.error('💥 API Error:', error.message);
        }
      }
      
      console.error('❌ Full error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      return false;
    }
  }, []);

  const createProviderFromPreset = useCallback((presetId: string, customId?: string): LLMProviderConfig => {
    const preset = PROVIDER_PRESETS[presetId];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetId}`);
    }

    return {
      ...preset,
      id: customId || `${presetId}-${Date.now()}`,
      name: preset.name || presetId,
    } as LLMProviderConfig;
  }, []);

  return {
    // State
    providers: state.providers,
    activeProviderId: state.activeProviderId,
    activeProvider: state.activeProvider,
    initializing,

    // Actions
    addProvider,
    updateProvider,
    removeProvider,
    setActiveProvider,
    testProvider,
    createProviderFromPreset,

    // Utilities
    getProvider: (id: string) => state.providers.find(p => p.id === id),
    hasValidActiveProvider: !!(state.activeProvider && state.activeProviderId),
  };
}