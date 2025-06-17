import { 
  LLMProvider, 
  LLMProviderConfig, 
  LLMMessage, 
  LLMResponse, 
  LLMTool 
} from '../types/llm-providers';

export abstract class BaseLLMProvider implements LLMProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly type: string;
  public config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.config = config;
  }

  // Abstract methods that must be implemented by subclasses
  abstract initialize(config: LLMProviderConfig): Promise<void>;
  abstract generateResponse(
    messages: LLMMessage[], 
    tools?: LLMTool[], 
    options?: Record<string, any>
  ): Promise<LLMResponse>;
  abstract validateConfig(config: LLMProviderConfig): boolean;
  abstract getDefaultConfig(): Partial<LLMProviderConfig>;

  // Optional methods with default implementations
  getSupportedModels(): string[] {
    return [this.config.model];
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check - try to generate a minimal response
      await this.generateResponse([
        { role: 'user', content: 'Hello' }
      ]);
      return true;
    } catch (error) {
      console.warn(`Health check failed for ${this.name}:`, error);
      return false;
    }
  }

  // Utility methods for subclasses
  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    switch (this.config.auth.type) {
      case 'api-key':
        if (this.config.auth.apiKey) {
          // Different providers use different header formats
          if (this.config.type === 'anthropic') {
            headers['x-api-key'] = this.config.auth.apiKey;
            headers['anthropic-version'] = '2023-06-01';
          } else {
            headers['Authorization'] = `Bearer ${this.config.auth.apiKey}`;
          }
        }
        break;
      
      case 'bearer-token':
        if (this.config.auth.bearerToken) {
          headers['Authorization'] = `Bearer ${this.config.auth.bearerToken}`;
        }
        break;
      
      case 'custom':
        if (this.config.auth.customHeaders) {
          Object.assign(headers, this.config.auth.customHeaders);
        }
        break;
      
      case 'none':
        // For local LLMs with no auth, use minimal headers to avoid CORS preflight
        console.log('🔓 Using no authentication headers for local LLM');
        break;
    }

    console.log('📋 Built headers:', headers);
    return headers;
  }

  protected async makeRequest(
    endpoint: string, 
    body: any, 
    options?: RequestInit
  ): Promise<Response> {
    const url = this.config.baseUrl ? 
      `${this.config.baseUrl.replace(/\/$/, '')}${endpoint}` : 
      endpoint;

    const headers = this.buildHeaders();
    
    console.log('🌐 Making HTTP request:', {
      method: options?.method || 'POST',
      url,
      endpoint,
      headers,
      body: JSON.stringify(body, null, 2),
      provider: this.name
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      mode: 'cors', // Explicitly set CORS mode
      ...options,
    });

    console.log('📡 HTTP response:', {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      provider: this.name
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ HTTP error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response;
  }

  // Simple health check that avoids CORS preflight issues
  async simpleHealthCheck(): Promise<boolean> {
    try {
      // For local servers, try the base URL without /v1 suffix
      const baseUrl = this.config.baseUrl?.replace(/\/v1\/?$/, '') || this.config.baseUrl;
      
      if (baseUrl) {
        // Simple connectivity test using no-cors mode
        await fetch(baseUrl, {
          method: 'GET',
          mode: 'no-cors', // Avoids CORS preflight
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn(`Simple health check failed for ${this.name}:`, error);
      return false;
    }
  }

  // Helper to convert MCP tools to provider-specific format
  protected convertMCPTools(tools: LLMTool[]): any[] {
    // Default implementation - can be overridden by providers
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }));
  }

  // Helper to extract tool calls from provider response
  protected extractToolCalls(response: any): { content: string; toolCalls?: any[] } {
    // Default implementation - should be overridden by specific providers
    return {
      content: typeof response === 'string' ? response : JSON.stringify(response),
      toolCalls: [],
    };
  }
}