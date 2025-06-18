import { BaseLLMProvider } from './base-provider';
import { 
  LLMProviderConfig, 
  LLMMessage, 
  LLMResponse, 
  LLMTool, 
  ToolCall 
} from '../types/llm-providers';

export class OpenAICompatibleProvider extends BaseLLMProvider {
  async initialize(config: LLMProviderConfig): Promise<void> {
    console.log('🚀 OpenAI-compatible provider initialize() called');
    console.log('📝 Config received:', JSON.stringify(config, null, 2));
    
    this.config = config;
    
    if (!config.baseUrl) {
      console.log('❌ Missing base URL');
      throw new Error('Base URL is required for OpenAI-compatible provider');
    }

    // Validate connection if auth is required
    if (config.auth.type === 'api-key' && !config.auth.apiKey) {
      console.log('❌ Missing API key for api-key auth type');
      throw new Error('API key is required when auth type is api-key');
    }
    
    console.log('✅ OpenAI-compatible provider initialized successfully');
  }

  async generateResponse(
    messages: LLMMessage[], 
    tools?: LLMTool[], 
    options?: Record<string, any>
  ): Promise<LLMResponse> {
    console.log('💬 OpenAI-compatible provider generateResponse() called');
    console.log('💬 Input messages:', messages);
    console.log('💬 Input tools:', tools);
    console.log('💬 Input options:', options);
    
    try {
      // Convert messages to OpenAI format
      const openaiMessages = this.convertMessages(messages);
      console.log('🔄 Converted messages:', openaiMessages);
      
      // Convert tools to OpenAI format
      const openaiTools = tools ? this.convertToolsToOpenAI(tools) : undefined;
      console.log('🔄 Converted tools:', openaiTools);

      const requestBody: any = {
        model: this.config.model,
        messages: openaiMessages,
        max_tokens: openaiTools && openaiTools.length > 0 
          ? Math.max((this.config.maxTokens || 4096) - 500, 1000) // Leave buffer for tools but minimum 1000
          : this.config.maxTokens || 4096, // Full limit when no tools
        stream: false,
      };

      // Add optional parameters
      if (this.config.temperature !== undefined) {
        requestBody.temperature = this.config.temperature;
      }
      if (this.config.topP !== undefined) {
        requestBody.top_p = this.config.topP;
      }
      if (this.config.frequencyPenalty !== undefined) {
        requestBody.frequency_penalty = this.config.frequencyPenalty;
      }
      if (this.config.presencePenalty !== undefined) {
        requestBody.presence_penalty = this.config.presencePenalty;
      }
      
      // Always include tools if available - tools are important!
      if (openaiTools && openaiTools.length > 0) {
        requestBody.tools = openaiTools;
        requestBody.tool_choice = 'auto';
        console.log('🔧 Including all tools:', openaiTools.length);
      }

      // Add any custom options
      if (options) {
        Object.assign(requestBody, options);
      }

      console.log('📤 Final request body:', JSON.stringify(requestBody, null, 2));

      // For local LLMs, try a direct fetch approach to minimize CORS issues
      let response: Response;
      if (this.config.auth.type === 'none') {
        console.log('🌐 Using direct fetch for local LLM to minimize CORS issues');
        const baseUrl = this.config.baseUrl?.replace(/\/+$/, '') || 'http://localhost:1234/v1'; // Remove trailing slashes
        const url = `${baseUrl}/chat/completions`;
        console.log('🎯 Making request to:', url);
        
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log('❌ Direct fetch error:', errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
      } else {
        // Use the standard makeRequest for authenticated providers
        response = await this.makeRequest('/chat/completions', requestBody);
      }

      const responseData = await response.json();
      console.log('📥 Raw response data:', responseData);
      
      const convertedResponse = this.convertOpenAIResponse(responseData);
      console.log('🔄 Converted response:', convertedResponse);
      return convertedResponse;
    } catch (error: any) {
      console.error('❌ OpenAI-compatible API Error:', error);
      console.error('❌ Error stack:', error.stack);
      
      // Handle common error patterns
      if (error.message?.includes('fetch')) {
        throw new Error(`Connection failed: ${this.config.baseUrl}. Please check if the server is running.`);
      } else if (error.message?.includes('401')) {
        throw new Error('Authentication failed. Please check your API key or authentication settings.');
      } else if (error.message?.includes('404')) {
        throw new Error(`Model '${this.config.model}' not found. Please check the model name.`);
      } else if (error.message?.includes('429')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`API Error: ${error?.message || 'Unknown error occurred'}`);
      }
    }
  }

  validateConfig(config: LLMProviderConfig): boolean {
    if (!config.baseUrl || !config.model) {
      return false;
    }

    // Validate auth configuration
    switch (config.auth.type) {
      case 'api-key':
        return !!config.auth.apiKey;
      case 'bearer-token':
        return !!config.auth.bearerToken;
      case 'custom':
        return !!config.auth.customHeaders;
      case 'none':
        return true;
      default:
        return false;
    }
  }

  getDefaultConfig(): Partial<LLMProviderConfig> {
    return {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1', // Ollama default
      model: 'llama3.2',
      auth: { type: 'none' },
      temperature: 0.7,
      maxTokens: 4096,
    };
  }

  getSupportedModels(): string[] {
    // These are common models, but in practice they should be fetched from the API
    return [
      // Ollama models
      'llama3.2', 'llama3.1', 'llama3', 'llama2',
      'mistral', 'mixtral', 'codellama', 'phi3',
      'gemma', 'qwen', 'deepseek-coder',
      
      // OpenAI models
      'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
      
      // Generic local model names
      'local-model', 'text-generation-webui', 'custom-model',
    ];
  }

  // Real health check that makes an actual API call
  async healthCheck(): Promise<boolean> {
    console.log(`🩺 Starting real health check for ${this.name} at ${this.config.baseUrl}`);
    
    if (!this.config.baseUrl || !this.config.model) {
      console.log('❌ Health check failed: missing baseUrl or model');
      return false;
    }
    
    try {
      console.log('🌐 Making real API call to test the connection...');
      
      // Make a simple "Hello" request to test the actual API
      const response = await this.generateResponse([
        { role: 'user', content: 'Hello! Please respond with just "Hi" to confirm you are working.' }
      ]);
      
      console.log('✅ Health check API call successful:', response);
      console.log('✅ Response content:', response.content);
      
      // Consider it successful if we got any response content
      const isHealthy = !!(response && response.content && response.content.trim().length > 0);
      console.log(`✅ Health check result: ${isHealthy ? 'PASSED' : 'FAILED'}`);
      
      return isHealthy;
    } catch (error) {
      console.log('❌ Health check failed with error:', error);
      console.log('❌ Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  // Override to add model fetching capability
  async getSupportedModelsFromAPI(): Promise<string[]> {
    try {
      const modelsUrl = this.config.baseUrl ? 
        `${this.config.baseUrl.replace(/\/$/, '')}/models` : 
        '/models';
      
      const headers = this.buildHeaders();
      
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
        mode: 'cors',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          return data.data.map((model: any) => model.id || model.name).filter(Boolean);
        }
      }
      
      return this.getSupportedModels();
    } catch (error) {
      console.warn('Failed to fetch models from API, using defaults:', error);
      return this.getSupportedModels();
    }
  }

  private convertMessages(messages: LLMMessage[]): any[] {
    return messages.map(msg => {
      // Handle different message content types
      if (Array.isArray(msg.content)) {
        // For complex content (like tool results), convert to string
        const content = msg.content.map(c => {
          if (typeof c === 'string') return c;
          if (c.type === 'text') return c.text;
          if (c.type === 'tool_result') return `Tool result: ${JSON.stringify(c.content)}`;
          return JSON.stringify(c);
        }).join('\n');
        
        return {
          role: msg.role === 'tool' ? 'user' : msg.role,
          content,
        };
      }
      
      return {
        role: msg.role === 'tool' ? 'user' : msg.role,
        content: msg.content,
      };
    });
  }

  private convertToolsToOpenAI(tools: LLMTool[]): any[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }


  private convertOpenAIResponse(response: any): LLMResponse {
    if (!response.choices || response.choices.length === 0) {
      throw new Error('Invalid response format from OpenAI-compatible API');
    }

    const choice = response.choices[0];
    const message = choice.message;

    // Extract content
    let content = message.content || '';

    // Extract tool calls
    const toolCalls: ToolCall[] = [];
    
    // First, try standard OpenAI tool calls format
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string' 
              ? JSON.parse(tc.function.arguments) 
              : tc.function.arguments,
          });
        }
      }
    } else {
      // If no standard tool calls, try parsing custom format from content
      console.log('🔍 No standard OpenAI tool calls found, trying to parse custom format from content:', content);
      const { parsedToolCalls, cleanedContent } = this.parseCustomToolCalls(content);
      if (parsedToolCalls.length > 0) {
        console.log(`✅ Successfully parsed ${parsedToolCalls.length} custom tool call(s):`, parsedToolCalls);
      }
      toolCalls.push(...parsedToolCalls);
      content = cleanedContent;
    }

    // Extract usage information if available
    const usage = response.usage ? {
      promptTokens: response.usage.prompt_tokens || 0,
      completionTokens: response.usage.completion_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
    } : undefined;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }

  private parseCustomToolCalls(content: string): { parsedToolCalls: ToolCall[], cleanedContent: string } {
    const toolCalls: ToolCall[] = [];
    let cleanedContent = content;

    // Parse [TOOL_REQUEST]...[END_TOOL_REQUEST] format
    const toolRequestRegex = /\[TOOL_REQUEST\]\s*(.*?)\s*\[END_TOOL_REQUEST\]/gs;
    let match;
    
    while ((match = toolRequestRegex.exec(content)) !== null) {
      try {
        const jsonString = match[1].trim();
        const toolCall = JSON.parse(jsonString);
        if (toolCall.name && toolCall.arguments) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: toolCall.name,
            arguments: toolCall.arguments,
          });
          console.log('🔧 Parsed custom tool call:', toolCall);
        }
      } catch (error) {
        console.warn('Failed to parse custom tool call:', match[1], error);
      }
    }

    // Remove tool request blocks from content
    cleanedContent = content.replace(toolRequestRegex, '').trim();
    
    // Also remove thinking blocks <think>...</think>
    cleanedContent = cleanedContent.replace(/<think>.*?<\/think>/gs, '').trim();
    
    // Also handle other common custom formats (plain JSON function calls)
    if (toolCalls.length === 0) {
      // Look for standalone JSON objects that look like tool calls
      const jsonObjectRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{.*?\})\s*\}/gs;
      while ((match = jsonObjectRegex.exec(content)) !== null) {
        try {
          const args = JSON.parse(match[2]);
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: match[1],
            arguments: args,
          });
          console.log('🔧 Parsed JSON tool call format:', { name: match[1], arguments: args });
          // Remove this tool call from content
          cleanedContent = cleanedContent.replace(match[0], '').trim();
        } catch (error) {
          console.warn('Failed to parse JSON tool call:', match[0], error);
        }
      }
    }

    return { parsedToolCalls: toolCalls, cleanedContent };
  }
}