// LLM Provider Types and Interfaces

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | any[]; // Support both string and structured content
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface ToolResult {
  toolCallId: string;
  result: any;
  error?: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMTool {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema for tool parameters
}

export interface AuthConfig {
  type: 'none' | 'api-key' | 'bearer-token' | 'custom';
  apiKey?: string;
  bearerToken?: string;
  customHeaders?: Record<string, string>;
}

export interface LLMProviderConfig {
  // Provider identification
  id: string;
  name: string;
  type: 'anthropic' | 'openai-compatible' | 'custom';
  
  // Connection settings
  baseUrl?: string;
  model: string;
  auth: AuthConfig;
  
  // Generation parameters
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  
  // Provider-specific options
  customOptions?: Record<string, any>;
}

export interface LLMProvider {
  // Provider metadata
  readonly id: string;
  readonly name: string;
  readonly type: string;
  
  // Configuration
  config: LLMProviderConfig;
  
  // Core methods
  initialize(config: LLMProviderConfig): Promise<void>;
  generateResponse(
    messages: LLMMessage[], 
    tools?: LLMTool[], 
    options?: Record<string, any>
  ): Promise<LLMResponse>;
  
  // Provider-specific capabilities
  getSupportedModels?(): Promise<string[]> | string[];
  validateConfig(config: LLMProviderConfig): boolean;
  getDefaultConfig(): Partial<LLMProviderConfig>;
  
  // Optional health check
  healthCheck?(): Promise<boolean>;
}

// Built-in provider configurations
export const PROVIDER_PRESETS: Record<string, Partial<LLMProviderConfig>> = {
  // Anthropic
  'anthropic-claude': {
    id: 'anthropic-claude',
    name: 'Anthropic Claude',
    type: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    auth: { type: 'api-key' },
    temperature: 0.7,
    maxTokens: 4096,
  },
  
  // OpenAI
  'openai-gpt': {
    id: 'openai-gpt',
    name: 'OpenAI GPT',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4',
    auth: { type: 'api-key' },
    temperature: 0.7,
    maxTokens: 4096,
  },
  
  // Local LLMs
  'ollama-local': {
    id: 'ollama-local',
    name: 'Ollama (Local)',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    auth: { type: 'none' },
    temperature: 0.7,
    maxTokens: 4096,
  },
  
  'lm-studio': {
    id: 'lm-studio',
    name: 'LM Studio',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    model: 'llama-3.2-3b-instruct',
    auth: { type: 'none' },
    temperature: 0.7,
    maxTokens: 4096,
  },
  
  'text-generation-webui': {
    id: 'text-generation-webui',
    name: 'Text Generation WebUI',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:5000/v1',
    model: 'text-generation-webui',
    auth: { type: 'none' },
    temperature: 0.7,
    maxTokens: 4096,
  },
  
  // Custom endpoints
  'custom-endpoint': {
    id: 'custom-endpoint',
    name: 'Custom Endpoint',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:8000/v1',
    model: 'custom-model',
    auth: { type: 'none' },
    temperature: 0.7,
    maxTokens: 4096,
  },
};

// Provider factory function type
export type ProviderFactory = (config: LLMProviderConfig) => LLMProvider;

// Registry for providers
export interface ProviderRegistry {
  register(type: string, factory: ProviderFactory): void;
  create(config: LLMProviderConfig): LLMProvider;
  getAvailableTypes(): string[];
}