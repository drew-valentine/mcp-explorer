import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ServerStatus } from '../hooks/useWebSocket';
import Anthropic from '@anthropic-ai/sdk';

interface Props {
  servers: ServerStatus[];
  onExecuteTool: (serverName: string, toolName: string, params: any) => Promise<any>;
  onListTools: (serverName: string) => Promise<any>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

interface ToolCall {
  id: string;
  name: string;
  arguments: any;
  serverName: string;
}

interface ToolResult {
  toolCallId: string;
  result: any;
  error?: string;
}

interface AnthropicConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
}

export const AIAgent: React.FC<Props> = ({ servers, onExecuteTool, onListTools }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableTools, setAvailableTools] = useState<MCPTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [configLoadedFromStorage, setConfigLoadedFromStorage] = useState(false);
  const [config, setConfig] = useState<AnthropicConfig>(() => {
    // Load saved config from localStorage
    try {
      const savedConfig = localStorage.getItem('anthropic-config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        const loadedConfig = {
          apiKey: parsed.apiKey || '',
          model: parsed.model || 'claude-3-5-sonnet-20241022',
          maxTokens: parsed.maxTokens || 4096,
        };
        
        // Set flag if API key was loaded from storage
        if (loadedConfig.apiKey) {
          setConfigLoadedFromStorage(true);
        }
        
        return loadedConfig;
      }
    } catch (error) {
      console.warn('Failed to load saved Anthropic config:', error);
    }
    
    // Default config if nothing saved
    return {
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
    };
  });
  const [showConfig, setShowConfig] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('anthropic-config', JSON.stringify(config));
    } catch (error) {
      console.warn('Failed to save Anthropic config:', error);
    }
  }, [config]);

  // Track the last fetched server set to prevent duplicate fetches
  const lastFetchedServersRef = useRef<string>('');
  
  // Memoize connected server names to prevent unnecessary re-renders
  const connectedServerNames = useMemo(() => {
    return servers.filter(s => s.connected).map(s => s.name).sort();
  }, [servers]);

  // Fetch tools dynamically when connected servers change
  useEffect(() => {
    const fetchTools = async () => {
      if (connectedServerNames.length === 0) {
        setAvailableTools([]);
        setToolsLoading(false);
        return;
      }

      // Debounce rapid calls by checking if we already fetched for these servers
      const currentServerSet = connectedServerNames.join(',');
      
      if (currentServerSet === lastFetchedServersRef.current) {
        console.log('⚡ AIAgent: Skipping tool fetch - already fetched for current servers');
        return;
      }
      
      lastFetchedServersRef.current = currentServerSet;

      setToolsLoading(true);
      const tools: MCPTool[] = [];
      
      for (const serverName of connectedServerNames) {
        try {
          const result = await onListTools(serverName);
          if (result && result.tools) {
            result.tools.forEach((tool: any) => {
              tools.push({
                name: tool.name,
                description: tool.description || '',
                inputSchema: tool.inputSchema,
                serverName: serverName,
              });
            });
          }
        } catch (error) {
          console.warn(`Failed to fetch tools for ${serverName}:`, error);
        }
      }
      
      setAvailableTools(tools);
      setToolsLoading(false);
      console.log('Dynamic tools fetched:', tools);
    };

    // Add a small delay to debounce rapid successive calls
    const timeoutId = setTimeout(fetchTools, 100);
    return () => clearTimeout(timeoutId);
  }, [connectedServerNames, onListTools]);

  // Get available tools from dynamically fetched tools
  const getAvailableTools = () => {
    return availableTools.map(tool => ({
      name: `${tool.serverName}_${tool.name}`, // Prefix with server name for uniqueness
      description: tool.description,
      input_schema: tool.inputSchema,
      serverName: tool.serverName,
    }));
  };

  // Convert MCP tool schemas to Anthropic tool format
  const convertToAnthropicTools = () => {
    const availableTools = getAvailableTools();
    return availableTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }));
  };

  const callDemoAPI = async (prompt: string): Promise<any> => {
    // Demo mode - simulate API response based on prompt analysis
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('weather')) {
      return {
        content: "I'll check the weather for you.",
        tool_use: [
          {
            id: 'call_1',
            name: 'weather-server_get_weather',
            input: {
              location: lowerPrompt.includes('london') ? 'London, UK' : 
                       lowerPrompt.includes('tokyo') ? 'Tokyo, Japan' :
                       lowerPrompt.includes('new york') ? 'New York, NY' : 'San Francisco, CA'
            }
          }
        ]
      };
    }
    
    if (lowerPrompt.includes('calculate') || lowerPrompt.includes('math') || /\d+\s*[\+\-\*\/]\s*\d+/.test(lowerPrompt)) {
      const match = prompt.match(/(\d+)\s*[\+\-\*\/]\s*(\d+)/);
      if (match) {
        const a = parseInt(match[1]);
        const b = parseInt(match[2]);
        const operation = prompt.includes('+') ? 'add' : prompt.includes('*') ? 'multiply' : 'add';
        
        return {
          content: `I'll calculate that for you.`,
          tool_use: [
            {
              id: 'call_1',
              name: `calculator-server_${operation}`,
              input: { a, b }
            }
          ]
        };
      }
    }
    
    if (lowerPrompt.includes('file') || lowerPrompt.includes('read')) {
      return {
        content: "I'll check the available files for you.",
        tool_use: [
          {
            id: 'call_1',
            name: 'file-server_list_files',
            input: {}
          }
        ]
      };
    }
    
    if (lowerPrompt.includes('note')) {
      return {
        content: "I'll check your notes.",
        tool_use: [
          {
            id: 'call_1',
            name: 'notes-server_list_notes',
            input: {}
          }
        ]
      };
    }
    
    return {
      content: `I understand you said: "${prompt}". I'm running in demo mode. Try asking me about the weather, to do some math, or to check files! Add your Anthropic API key in settings for real Claude integration.`,
      tool_use: []
    };
  };

  const callAnthropicAPI = async (prompt: string, conversationHistory: any[] = []): Promise<any> => {
    // Check if API key is provided - if not, use demo mode
    if (!config.apiKey) {
      return callDemoAPI(prompt);
    }

    try {
      const anthropic = new Anthropic({
        apiKey: config.apiKey,
        dangerouslyAllowBrowser: true // Note: In production, API calls should go through your backend
      });

      const availableTools = convertToAnthropicTools();
      
      // Build messages array from conversation history or just the current prompt
      const messages = conversationHistory.length > 0 ? conversationHistory : [
        {
          role: 'user',
          content: prompt
        }
      ];
      
      const message = await anthropic.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        messages: messages,
        tools: availableTools.length > 0 ? availableTools : undefined,
      });

      // Debug: Log the full response
      console.log('Anthropic API Response:', JSON.stringify(message, null, 2));
      console.log('Message content:', message.content);

      // Process the response - check for both text and tool use
      const textParts = message.content.filter(c => c.type === 'text').map(c => c.text);
      const toolParts = message.content.filter(c => c.type === 'tool_use');
      
      console.log('Text parts:', textParts);
      console.log('Tool parts:', toolParts);
      
      return {
        content: textParts.join('\n') || "I'll help you with that.",
        tool_use: toolParts.map(tool => ({
          id: tool.id,
          name: tool.name,
          input: tool.input
        }))
      };
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
  };

  const executeToolCalls = async (toolCalls: any[]): Promise<ToolResult[]> => {
    const results: ToolResult[] = [];
    
    for (const toolCall of toolCalls) {
      try {
        // Extract server name and tool name
        const [serverName, ...toolNameParts] = toolCall.name.split('_');
        const toolName = toolNameParts.join('_');
        
        const result = await onExecuteTool(serverName, toolName, toolCall.input);
        results.push({
          toolCallId: toolCall.id,
          result
        });
      } catch (error) {
        results.push({
          toolCallId: toolCall.id,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    try {
      // Step 1: Send query to Claude with tool descriptions
      const response = await callAnthropicAPI(userMessage.content);
      
      // Handle tool calls if present
      if (response.tool_use && response.tool_use.length > 0) {
        const toolCalls: ToolCall[] = response.tool_use.map((tool: any) => ({
          id: tool.id,
          name: tool.name,
          arguments: tool.input,
          serverName: tool.name.split('_')[0]
        }));
        
        // Show assistant message with tool calls
        const assistantMessage: Message = {
          id: `msg_${Date.now()}_assistant`,
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
          toolCalls,
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Step 2: Execute tool calls through servers
        const toolResults = await executeToolCalls(response.tool_use);
        
        // Update message with tool results
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, toolResults }
            : msg
        ));
        
        // Step 3: Send results back to Claude for natural language response
        if (config.apiKey) {
          // For real Anthropic API, build proper conversation history with tool results
          const conversationHistory = [
            {
              role: 'user',
              content: userMessage.content
            },
            {
              role: 'assistant',
              content: response.content.length > 0 ? [
                { type: 'text', text: response.content },
                ...response.tool_use.map((tool: any) => ({
                  type: 'tool_use',
                  id: tool.id,
                  name: tool.name,
                  input: tool.input
                }))
              ] : response.tool_use.map((tool: any) => ({
                type: 'tool_use',
                id: tool.id,
                name: tool.name,
                input: tool.input
              }))
            },
            {
              role: 'user',
              content: toolResults.map(result => ({
                type: 'tool_result',
                tool_use_id: result.toolCallId,
                content: result.error 
                  ? `Error: ${result.error}`
                  : JSON.stringify(result.result, null, 2)
              }))
            }
          ];
          
          // Get Claude's natural language response
          const finalResponse = await callAnthropicAPI('', conversationHistory);
          
          const finalMessage: Message = {
            id: `msg_${Date.now()}_final`,
            role: 'assistant',
            content: finalResponse.content,
            timestamp: Date.now(),
          };
          
          setMessages(prev => [...prev, finalMessage]);
        } else {
          // Demo mode - generate a simple natural language response
          const successfulResults = toolResults.filter(r => !r.error);
          const failedResults = toolResults.filter(r => r.error);
          
          let finalResponse = '';
          
          if (successfulResults.length > 0) {
            finalResponse += "Great! Here's what I found:\n\n";
            successfulResults.forEach((result, index) => {
              const toolCall = toolCalls.find(tc => tc.id === result.toolCallId);
              if (toolCall) {
                const toolName = toolCall.name.split('_').pop();
                if (toolName === 'get_weather') {
                  const data = result.result;
                  finalResponse += `🌤️ Weather: It's ${data.temperature}°F in ${data.location} with ${data.condition}.\n`;
                } else if (toolName === 'add' || toolName === 'multiply') {
                  finalResponse += `🔢 Calculation: ${toolCall.arguments.a} ${toolName === 'add' ? '+' : '×'} ${toolCall.arguments.b} = ${result.result.result}\n`;
                } else if (toolName === 'list_files') {
                  const files = result.result.files || [];
                  finalResponse += `📁 Files: Found ${files.length} files: ${files.map((f: any) => f.name).join(', ')}\n`;
                } else if (toolName === 'list_notes') {
                  const notes = result.result.notes || [];
                  finalResponse += `📝 Notes: Found ${notes.length} notes: ${notes.map((n: any) => n.title).join(', ')}\n`;
                } else {
                  finalResponse += `✅ ${toolName}: Operation completed successfully.\n`;
                }
              }
            });
          }
          
          if (failedResults.length > 0) {
            finalResponse += "\n❌ Some operations failed:\n";
            failedResults.forEach(result => {
              finalResponse += `• ${result.error}\n`;
            });
          }
          
          const finalMessage: Message = {
            id: `msg_${Date.now()}_final`,
            role: 'assistant',
            content: finalResponse || "I've completed the requested operations.",
            timestamp: Date.now(),
          };
          
          setMessages(prev => [...prev, finalMessage]);
        }
      } else {
        // Simple response without tools
        const assistantMessage: Message = {
          id: `msg_${Date.now()}_assistant`,
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const connectedServers = servers.filter(s => s.connected);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center">
            <span className="mr-2">🤖</span>
            AI Agent
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Chat with an AI agent that can use MCP tools
          </p>
        </div>
        
        <button
          onClick={() => setShowConfig(!showConfig)}
          className={`px-3 py-1 text-sm rounded hover:bg-gray-200 ${
            configLoadedFromStorage 
              ? 'bg-green-100 text-green-700 border border-green-200' 
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          ⚙️ Config {configLoadedFromStorage && '•'}
        </button>
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h4 className="font-medium mb-3">Anthropic API Configuration</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-ant-..."
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Model
              </label>
              <select
                value={config.model}
                onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Max Tokens
              </label>
              <input
                type="number"
                value={config.maxTokens}
                onChange={(e) => setConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 4096 }))}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            <p className="mb-1">
              <strong>Real Anthropic Integration:</strong> Enter your API key to use actual Claude models with MCP tools.
            </p>
            <p className="mb-1">
              <strong>Demo Mode:</strong> Leave API key empty for simulated responses (no API calls).
            </p>
            {configLoadedFromStorage && (
              <div className="flex items-center justify-between">
                <p className="text-green-600">
                  ✅ <strong>Settings restored</strong> from previous session
                </p>
                <button
                  onClick={() => {
                    setConfig({
                      apiKey: '',
                      model: 'claude-3-5-sonnet-20241022',
                      maxTokens: 4096,
                    });
                    setConfigLoadedFromStorage(false);
                    localStorage.removeItem('anthropic-config');
                  }}
                  className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  Clear Saved Settings
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="mb-4 flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          <span className={`px-2 py-1 rounded text-xs ${
            connectedServers.length > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {connectedServers.length} servers connected
          </span>
          <span className="text-gray-600">
            {toolsLoading ? (
              <span className="flex items-center space-x-1">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                <span>Loading tools...</span>
              </span>
            ) : (
              `${getAvailableTools().length} tools available ${availableTools.length > 0 ? '(dynamic)' : ''}`
            )}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="border rounded-lg mb-4 h-96 overflow-y-auto bg-gray-50 p-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p className="mb-2">👋 Hi! I'm an AI agent that can use MCP tools.</p>
            <p className="text-sm">Try asking me to:</p>
            <ul className="text-sm mt-2 space-y-1">
              <li>• "What's the weather in San Francisco?"</li>
              <li>• "Calculate 15 + 27"</li>
              <li>• "List available files"</li>
              <li>• "Show me my notes"</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map(message => (
              <div key={message.id} className="flex gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  message.role === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">
                    {message.role} • {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                  
                  <div className={`p-3 rounded-lg ${
                    message.role === 'user' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
                  } border`}>
                    <pre className="whitespace-pre-wrap text-sm">{message.content}</pre>
                    
                    {/* Tool Calls */}
                    {message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-medium text-gray-600">Tool Calls:</div>
                        {message.toolCalls.map(toolCall => (
                          <div key={toolCall.id} className="bg-yellow-50 border border-yellow-200 rounded p-2">
                            <div className="text-xs font-medium">🔧 {toolCall.name}</div>
                            <div className="text-xs text-gray-600 mt-1">
                              <code>{JSON.stringify(toolCall.arguments)}</code>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Tool Results */}
                    {message.toolResults && message.toolResults.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-medium text-gray-600">Tool Results:</div>
                        {message.toolResults.map(result => (
                          <div key={result.toolCallId} className={`border rounded p-2 ${
                            result.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                          }`}>
                            <div className="text-xs">
                              {result.error ? (
                                <span className="text-red-700">❌ Error: {result.error}</span>
                              ) : (
                                <pre className="text-green-700 whitespace-pre-wrap">
                                  ✅ {JSON.stringify(result.result, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">
                  🤖
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">assistant • thinking...</div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm text-gray-600">Processing your request...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything... I can use weather, calculator, file, and notes tools!"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 resize-none"
          rows={2}
          disabled={isLoading || connectedServers.length === 0}
        />
        <button
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || isLoading || connectedServers.length === 0}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
      
      {connectedServers.length === 0 && (
        <div className="mt-2 text-sm text-red-600">
          Connect to MCP servers to enable AI agent functionality
        </div>
      )}
    </div>
  );
};