import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ServerStatus } from '../hooks/useWebSocket';
import { useLLMProviders } from '../hooks/useLLMProviders';
import { LLMProviderConfig } from './LLMProviderConfig';
import { LLMMessage, LLMTool } from '../types/llm-providers';

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

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
}

export const AIAgent: React.FC<Props> = ({ servers, onExecuteTool, onListTools }) => {
  // Initialize messages from localStorage
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('ai-agent-chat-history');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load chat history:', error);
      return [];
    }
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableTools, setAvailableTools] = useState<MCPTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  
  const {
    providers,
    activeProviderId,
    activeProvider,
    addProvider,
    updateProvider,
    removeProvider,
    setActiveProvider,
    testProvider,
    createProviderFromPreset,
    hasValidActiveProvider,
  } = useLLMProviders();
  
  const [showConfig, setShowConfig] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('ai-agent-chat-history', JSON.stringify(messages));
    } catch (error) {
      console.warn('Failed to save chat history:', error);
    }
  }, [messages]);

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

  // Convert MCP tools to LLM format
  const convertToLLMTools = (): LLMTool[] => {
    return availableTools.map(tool => ({
      name: `${tool.serverName}_${tool.name}`,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  };

  const callDemoAPI = async (prompt: string): Promise<any> => {
    // Demo mode - simulate API response based on prompt analysis
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('weather')) {
      return {
        content: "I'll check the weather for you.",
        toolCalls: [
          {
            id: 'call_1',
            name: 'weather-server_get_weather',
            arguments: {
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
          toolCalls: [
            {
              id: 'call_1',
              name: `calculator-server_${operation}`,
              arguments: { a, b }
            }
          ]
        };
      }
    }
    
    if (lowerPrompt.includes('file') || lowerPrompt.includes('read')) {
      return {
        content: "I'll check the available files for you.",
        toolCalls: [
          {
            id: 'call_1',
            name: 'file-server_list_files',
            arguments: {}
          }
        ]
      };
    }
    
    if (lowerPrompt.includes('note')) {
      return {
        content: "I'll check your notes.",
        toolCalls: [
          {
            id: 'call_1',
            name: 'notes-server_list_notes',
            arguments: {}
          }
        ]
      };
    }
    
    return {
      content: `I understand you said: "${prompt}". I'm running in demo mode. Try asking me about the weather, to do some math, or to check files! Configure an LLM provider in settings for real AI integration.`,
      toolCalls: []
    };
  };

  const callLLMAPI = async (prompt: string, conversationHistory: LLMMessage[] = []): Promise<any> => {
    // Check if provider is available - if not, use demo mode
    if (!activeProvider || !hasValidActiveProvider) {
      return callDemoAPI(prompt);
    }

    try {
      const llmTools = convertToLLMTools();
      
      // Build messages array from conversation history or just the current prompt
      const messages: LLMMessage[] = conversationHistory.length > 0 ? conversationHistory : [
        {
          role: 'user',
          content: prompt
        }
      ];
      
      const response = await activeProvider.generateResponse(
        messages,
        llmTools.length > 0 ? llmTools : undefined
      );

      // Debug: Log the full response
      console.log('LLM API Response:', JSON.stringify(response, null, 2));
      
      return {
        content: response.content || "I'll help you with that.",
        toolCalls: response.toolCalls || []
      };
    } catch (error: any) {
      console.error('LLM API Error:', error);
      throw error;
    }
  };

  const executeToolCalls = async (toolCalls: any[]): Promise<ToolResult[]> => {
    const results: ToolResult[] = [];
    
    for (const toolCall of toolCalls) {
      try {
        // Extract server name and tool name
        const [serverName, ...toolNameParts] = toolCall.name.split('_');
        const toolName = toolNameParts.join('_');
        
        const result = await onExecuteTool(serverName, toolName, toolCall.arguments);
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
      // Initialize conversation history for tool chaining
      let conversationHistory: LLMMessage[] = [
        {
          role: 'user',
          content: userMessage.content
        }
      ];

      // Tool calling loop - continue until no more tool calls are made
      let maxIterations = 5; // Prevent infinite loops
      let iteration = 0;
      
      while (iteration < maxIterations) {
        console.log(`🔄 Tool calling iteration ${iteration + 1}`);
        
        // Send current conversation to LLM
        const response = await callLLMAPI('', conversationHistory);
        
        // Handle tool calls if present
        if (response.toolCalls && response.toolCalls.length > 0) {
          console.log(`🔧 LLM wants to call ${response.toolCalls.length} tool(s):`, response.toolCalls.map((t: any) => t.name));
          
          const toolCalls: ToolCall[] = response.toolCalls.map((tool: any) => ({
            id: tool.id,
            name: tool.name,
            arguments: tool.arguments,
            serverName: tool.name.split('_')[0]
          }));

          // Show assistant message with tool calls
          const assistantMessage: Message = {
            id: `msg_${Date.now()}_assistant_${iteration}`,
            role: 'assistant',
            content: response.content,
            timestamp: Date.now(),
            toolCalls,
          };
          
          setMessages(prev => [...prev, assistantMessage]);

          // Execute tool calls
          const toolResults = await executeToolCalls(response.toolCalls);

          // Update message with tool results
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessage.id 
              ? { ...msg, toolResults }
              : msg
          ));

          // Add to conversation history for next iteration
          conversationHistory.push({
            role: 'assistant',
            content: response.content.length > 0 ? [
              { type: 'text', text: response.content },
              ...response.toolCalls.map((tool: any) => ({
                type: 'tool_use',
                id: tool.id,
                name: tool.name,
                input: tool.arguments
              }))
            ] : response.toolCalls.map((tool: any) => ({
              type: 'tool_use',
              id: tool.id,
              name: tool.name,
              input: tool.arguments
            }))
          });

          conversationHistory.push({
            role: 'tool',
            content: toolResults.map(result => ({
              type: 'tool_result',
              tool_use_id: result.toolCallId,
              content: result.error 
                ? `Error: ${result.error}`
                : JSON.stringify(result.result, null, 2)
            }))
          });

          iteration++;
        } else {
          console.log(`✅ LLM provided final response (no more tool calls)`);
          
          // No more tool calls - this is the final response
          const finalMessage: Message = {
            id: `msg_${Date.now()}_final`,
            role: 'assistant',
            content: response.content,
            timestamp: Date.now(),
          };
          
          setMessages(prev => [...prev, finalMessage]);
          break; // Exit the loop
        }
      }

      if (iteration >= maxIterations) {
        console.warn(`⚠️ Tool calling loop reached maximum iterations (${maxIterations})`);
        const warningMessage: Message = {
          id: `msg_${Date.now()}_warning`,
          role: 'assistant',
          content: 'I reached the maximum number of tool calls for safety. The conversation may be incomplete.',
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, warningMessage]);
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

  const handleClearChat = () => {
    if (messages.length === 0) return;
    
    if (confirm('Are you sure you want to clear the chat history? This cannot be undone.')) {
      setMessages([]);
    }
  };

  const handleNewProvider = () => {
    const newProvider = createProviderFromPreset('ollama-local');
    newProvider.id = `provider_${Date.now()}`;
    addProvider(newProvider);
    setEditingProvider(newProvider.id);
  };

  const handleTestProvider = async (config: any) => {
    return await testProvider(config);
  };

  const connectedServers = servers.filter(s => s.connected);
  const activeProviderConfig = providers.find(p => p.id === activeProviderId);

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
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleClearChat}
            disabled={messages.length === 0}
            className={`px-3 py-1 text-sm rounded hover:bg-gray-200 ${
              messages.length > 0
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            title={messages.length > 0 ? 'Clear chat history' : 'No messages to clear'}
          >
            🗑️ Clear
          </button>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`px-3 py-1 text-sm rounded hover:bg-gray-200 ${
              hasValidActiveProvider 
                ? 'bg-green-100 text-green-700 border border-green-200' 
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            ⚙️ Config {hasValidActiveProvider && '•'}
          </button>
        </div>
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h4 className="font-medium mb-3">LLM Provider Configuration</h4>
          
          {/* Provider Selection */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Active Provider
            </label>
            <div className="flex items-center space-x-2">
              <select
                value={activeProviderId || ''}
                onChange={(e) => setActiveProvider(e.target.value || null)}
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="">Select a provider...</option>
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.type})
                  </option>
                ))}
              </select>
              <button
                onClick={handleNewProvider}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Active Provider Status */}
          {activeProviderConfig && (
            <div className="mb-4 p-3 bg-white rounded border">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-medium text-sm">{activeProviderConfig.name}</div>
                  <div className="text-xs text-gray-600">
                    {activeProviderConfig.type} • {activeProviderConfig.model}
                    {activeProviderConfig.baseUrl && ` • ${activeProviderConfig.baseUrl}`}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${
                    hasValidActiveProvider ? 'bg-green-500' : 'bg-red-500'
                  }`}></span>
                  <button
                    onClick={() => setEditingProvider(activeProviderConfig.id)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (providers.length === 1) {
                        alert('Cannot delete the last provider. Add another provider first.');
                        return;
                      }
                      if (confirm(`Are you sure you want to delete "${activeProviderConfig.name}"?`)) {
                        removeProvider(activeProviderConfig.id);
                      }
                    }}
                    disabled={providers.length === 1}
                    className={`text-xs ${
                      providers.length === 1
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-red-600 hover:text-red-800'
                    }`}
                    title={providers.length === 1 ? 'Cannot delete the last provider' : undefined}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* All Providers List */}
          {providers.length > 1 && (
            <div className="mb-4">
              <h5 className="text-xs font-medium text-gray-700 mb-2">All Providers ({providers.length})</h5>
              <div className="space-y-2">
                {providers.map(provider => (
                  <div key={provider.id} className="flex items-center justify-between p-2 bg-white rounded border text-xs">
                    <div className="flex-1">
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-gray-600">{provider.type} • {provider.model}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`w-2 h-2 rounded-full ${
                        provider.id === activeProviderId ? 'bg-green-500' : 'bg-gray-300'
                      }`} title={provider.id === activeProviderId ? 'Active' : 'Inactive'}></span>
                      <button
                        onClick={() => setActiveProvider(provider.id)}
                        disabled={provider.id === activeProviderId}
                        className={`px-2 py-1 rounded text-xs ${
                          provider.id === activeProviderId
                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                      >
                        {provider.id === activeProviderId ? 'Active' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setEditingProvider(provider.id)}
                        className="px-2 py-1 text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (providers.length === 1) {
                            alert('Cannot delete the last provider. Add another provider first.');
                            return;
                          }
                          if (confirm(`Are you sure you want to delete "${provider.name}"?`)) {
                            removeProvider(provider.id);
                          }
                        }}
                        disabled={providers.length === 1}
                        className={`px-2 py-1 ${
                          providers.length === 1
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-red-600 hover:text-red-800'
                        }`}
                        title={providers.length === 1 ? 'Cannot delete the last provider' : undefined}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p className="mb-1">
              <strong>Multi-LLM Support:</strong> Configure any LLM provider including local models.
            </p>
            <p className="mb-1">
              <strong>Demo Mode:</strong> Leave unconfigured for simulated responses (no API calls).
            </p>
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
          <span className={`px-2 py-1 rounded text-xs ${
            hasValidActiveProvider ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {hasValidActiveProvider ? `${activeProviderConfig?.name} ready` : 'Demo mode'}
          </span>
          <span className="text-gray-600">
            {toolsLoading ? (
              <span className="flex items-center space-x-1">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                <span>Loading tools...</span>
              </span>
            ) : (
              `${availableTools.length} tools available ${availableTools.length > 0 ? '(dynamic)' : ''}`
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

      {/* Provider Configuration Modal */}
      {editingProvider && (
        <LLMProviderConfig
          config={providers.find(p => p.id === editingProvider)!}
          onChange={(config) => updateProvider(editingProvider, config)}
          onTest={handleTestProvider}
          onClose={() => setEditingProvider(null)}
        />
      )}
    </div>
  );
};