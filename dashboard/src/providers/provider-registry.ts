import { 
  LLMProvider, 
  LLMProviderConfig, 
  ProviderFactory, 
  ProviderRegistry 
} from '../types/llm-providers';

class LLMProviderRegistry implements ProviderRegistry {
  private factories = new Map<string, ProviderFactory>();

  register(type: string, factory: ProviderFactory): void {
    this.factories.set(type, factory);
  }

  create(config: LLMProviderConfig): LLMProvider {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(`Unknown provider type: ${config.type}`);
    }
    
    return factory(config);
  }

  getAvailableTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  isRegistered(type: string): boolean {
    return this.factories.has(type);
  }
}

// Global singleton registry
export const providerRegistry = new LLMProviderRegistry();

import { AnthropicProvider } from './anthropic-provider';
import { OpenAICompatibleProvider } from './openai-compatible-provider';

// Helper function to register all built-in providers
export function registerBuiltinProviders() {
  // Register providers synchronously
  providerRegistry.register('anthropic', (config) => new AnthropicProvider(config));
  providerRegistry.register('openai-compatible', (config) => new OpenAICompatibleProvider(config));
}