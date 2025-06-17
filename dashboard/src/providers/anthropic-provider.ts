import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base-provider';
import { 
  LLMProviderConfig, 
  LLMMessage, 
  LLMResponse, 
  LLMTool, 
  ToolCall 
} from '../types/llm-providers';

export class AnthropicProvider extends BaseLLMProvider {
  private client?: Anthropic;
  private toolNameMapping: Map<string, string> = new Map(); // sanitized -> original

  async initialize(config: LLMProviderConfig): Promise<void> {
    this.config = config;
    
    if (!config.auth.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.auth.apiKey,
      dangerouslyAllowBrowser: true // Note: In production, API calls should go through your backend
    });
  }

  async generateResponse(
    messages: LLMMessage[], 
    tools?: LLMTool[], 
    options?: Record<string, any>
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('Provider not initialized');
    }

    try {
      // Convert messages to Anthropic format
      const anthropicMessages = this.convertMessages(messages);
      
      // Convert tools to Anthropic format
      const anthropicTools = tools ? this.convertToolsToAnthropic(tools) : undefined;

      const requestOptions: any = {
        model: this.config.model,
        max_tokens: this.config.maxTokens || 4096,
        messages: anthropicMessages,
      };

      // Add optional parameters
      if (this.config.temperature !== undefined) {
        requestOptions.temperature = this.config.temperature;
      }
      if (this.config.topP !== undefined) {
        requestOptions.top_p = this.config.topP;
      }
      if (anthropicTools && anthropicTools.length > 0) {
        requestOptions.tools = anthropicTools;
      }

      // Add any custom options
      if (options) {
        Object.assign(requestOptions, options);
      }

      const response = await this.client.messages.create(requestOptions);

      return this.convertAnthropicResponse(response);
    } catch (error: any) {
      console.error('Anthropic API Error:', error);
      
      // Handle specific API errors
      if (error?.status === 401) {
        throw new Error('Invalid API key. Please check your Anthropic API key.');
      } else if (error?.status === 404) {
        throw new Error('Model not found. Please check the model name or try a different model.');
      } else if (error?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error?.status === 400) {
        throw new Error('Bad request. Please check your configuration and try again.');
      } else {
        throw new Error(`API Error: ${error?.message || 'Unknown error occurred'}`);
      }
    }
  }

  validateConfig(config: LLMProviderConfig): boolean {
    return !!(
      config.auth?.apiKey &&
      config.model &&
      config.type === 'anthropic'
    );
  }

  getDefaultConfig(): Partial<LLMProviderConfig> {
    return {
      type: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      auth: { type: 'api-key' },
      temperature: 0.7,
      maxTokens: 4096,
    };
  }

  getSupportedModels(): string[] {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  private convertMessages(messages: LLMMessage[]): any[] {
    return messages.map(msg => {
      // Handle different message content types
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role === 'tool' ? 'user' : msg.role,
          content: msg.content,
        };
      }
      
      return {
        role: msg.role === 'tool' ? 'user' : msg.role,
        content: msg.content,
      };
    });
  }

  private convertToolsToAnthropic(tools: LLMTool[]): any[] {
    // Clear previous mapping
    this.toolNameMapping.clear();
    
    console.log('🔧 Converting tools for Anthropic:', tools.map(t => t.name));
    
    return tools.map(tool => {
      const sanitizedName = this.sanitizeToolName(tool.name);
      // Store the mapping from sanitized name back to original
      this.toolNameMapping.set(sanitizedName, tool.name);
      
      if (sanitizedName !== tool.name) {
        console.log(`🔧 Tool name sanitized: "${tool.name}" -> "${sanitizedName}"`);
      }
      
      return {
        name: sanitizedName,
        description: tool.description,
        input_schema: tool.inputSchema,
      };
    });
  }

  private sanitizeToolName(name: string): string {
    // Anthropic requires tool names to match pattern ^[a-zA-Z0-9_-]{1,64}$
    // Replace invalid characters with underscores and truncate to 64 chars
    const sanitized = name
      .replace(/[^a-zA-Z0-9_-]/g, '_')  // Replace invalid chars with underscore
      .replace(/_+/g, '_')              // Collapse multiple underscores
      .replace(/^_|_$/g, '')            // Remove leading/trailing underscores
      .substring(0, 64);                // Truncate to 64 characters
    
    // Ensure we have a valid name (at least 1 character)
    return sanitized || 'unknown_tool';
  }

  private convertAnthropicResponse(response: any): LLMResponse {
    // Extract text content
    const textParts = response.content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
    const content = textParts.join('\n') || '';

    // Extract tool calls
    const toolParts = response.content.filter((c: any) => c.type === 'tool_use');
    const toolCalls: ToolCall[] = toolParts.map((tool: any) => ({
      id: tool.id,
      name: this.toolNameMapping.get(tool.name) || tool.name, // Map back to original name
      arguments: tool.input,
    }));

    // Extract usage information if available
    const usage = response.usage ? {
      promptTokens: response.usage.input_tokens || 0,
      completionTokens: response.usage.output_tokens || 0,
      totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
    } : undefined;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }
}