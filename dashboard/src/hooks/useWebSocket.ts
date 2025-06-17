import { useState, useEffect, useRef, useCallback } from 'react';

export interface MCPMessage {
  id: string;
  timestamp: number;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  serverName: string;
  direction: 'client-to-server' | 'server-to-client';
}

export interface ServerStatus {
  name: string;
  connected: boolean;
  capabilities: string[];
  resources: number;
  tools: number;
  prompts: number;
  lastMessage?: number;
  description?: string;
  running?: boolean;
}

export interface DashboardState {
  servers: ServerStatus[];
  messages: MCPMessage[];
  selectedMessage?: MCPMessage;
  connected: boolean;
}


export const useWebSocket = (url: string) => {
  const [state, setState] = useState<DashboardState>({
    servers: [],
    messages: [],
    connected: false,
  });
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 5;
  const isConnecting = useRef(false);
  
  // Request deduplication with time-based caching
  const ongoingRequests = useRef<Map<string, Promise<any>>>(new Map());
  const requestCache = useRef<Map<string, { result: any; timestamp: number }>>(new Map());
  const CACHE_DURATION = 2000; // 2 seconds cache for identical requests
  
  const createRequestKey = (type: string, serverName: string, params?: any) => {
    const paramString = params ? JSON.stringify(params) : '';
    return `${type}:${serverName}:${paramString}`;
  };
  
  const getCachedResult = (requestKey: string) => {
    const cached = requestCache.current.get(requestKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`⚡ Using cached result for ${requestKey}`);
      return cached.result;
    }
    return null;
  };
  
  const setCachedResult = (requestKey: string, result: any) => {
    requestCache.current.set(requestKey, { result, timestamp: Date.now() });
  };

  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting.current) return;
    
    try {
      isConnecting.current = true;
      console.log(`Attempting WebSocket connection to ${url}`);
      
      // Close existing connection if any
      if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
        console.log('Closing existing WebSocket connection');
        ws.current.close();
      }

      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setState(prev => ({ ...prev, connected: true }));
        setReconnectAttempts(0);
        isConnecting.current = false;
      };

      ws.current.onmessage = (event) => {
        try {
          // Rate limit console logging to prevent overwhelming during demo
          if (Math.random() < 0.1) { // Only log 10% of messages
            console.log('📬 Received WebSocket message:', event.data.substring(0, 200) + (event.data.length > 200 ? '...' : ''));
          }
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'initial-state':
              console.log('🎆 Received initial state with', data.data.servers?.length || 0, 'servers and', data.data.messages?.length || 0, 'messages');
              setState(prev => ({
                ...prev,
                servers: data.data.servers || [],
                messages: data.data.messages || [],
              }));
              break;
              
            case 'server-status':
            case 'server-status-update':
              console.log('🔄 Server status update:', data.data.length, 'servers');
              setState(prev => ({
                ...prev,
                servers: data.data,
              }));
              break;
              
            case 'new-message':
              console.log('📨 New message from', data.data.serverName);
              setState(prev => ({
                ...prev,
                messages: [...prev.messages, data.data].slice(-100), // Keep last 100 messages
              }));
              break;
              
            default:
              console.log('❓ Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error, 'Raw data:', event.data);
        }
      };

      ws.current.onclose = (event) => {
        const closeReasons = {
          1000: 'Normal closure',
          1001: 'Going away',
          1002: 'Protocol error', 
          1003: 'Unsupported data',
          1005: 'No status received',
          1006: 'Abnormal closure',
          1007: 'Invalid frame payload data',
          1008: 'Policy violation',
          1009: 'Message too big',
          1010: 'Mandatory extension',
          1011: 'Internal server error',
          1015: 'TLS handshake failure'
        };
        
        const reason = closeReasons[event.code as keyof typeof closeReasons] || 'Unknown';
        console.log(`❌ WebSocket disconnected: ${event.code} (${reason}) - ${event.reason || 'No reason provided'}`);
        setState(prev => ({ ...prev, connected: false }));
        isConnecting.current = false;
        
        // Only attempt to reconnect if it wasn't a manual close and we haven't exceeded attempts
        if (event.code !== 1000) {
          // Use current reconnectAttempts from state rather than closure
          setReconnectAttempts(currentAttempts => {
            if (currentAttempts < maxReconnectAttempts) {
              const timeout = Math.min(2000 + (currentAttempts * 1000), 10000);
              console.log(`🔄 Reconnecting in ${timeout}ms (attempt ${currentAttempts + 1}/${maxReconnectAttempts})`);
              
              reconnectTimeoutRef.current = setTimeout(() => {
                connect();
              }, timeout);
              
              return currentAttempts + 1;
            } else {
              console.error('❌ Max reconnection attempts reached. Stopping automatic reconnection.');
              return currentAttempts;
            }
          });
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        console.error('WebSocket readyState:', ws.current?.readyState);
        console.error('WebSocket URL:', ws.current?.url);
        isConnecting.current = false;
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      isConnecting.current = false;
    }
  }, [url]); // Remove reconnectAttempts dependency

  useEffect(() => {
    // Longer delay to ensure MCP client WebSocket server is ready and stable
    // This prevents race conditions with demo operations
    const initTimeout = setTimeout(() => {
      console.log('🔌 Attempting initial WebSocket connection...');
      connect();
    }, 3000); // Increased from 1s to 3s

    return () => {
      clearTimeout(initTimeout);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []); // Only run once on mount

  const sendMessage = useCallback((message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log(`📤 Dashboard: Sending message:`, message);
      ws.current.send(JSON.stringify(message));
    } else {
      console.error(`❌ Dashboard: Cannot send message, WebSocket state:`, ws.current?.readyState);
    }
  }, []);

  const executeTool = useCallback((serverName: string, toolName: string, params: any): Promise<any> => {
    const requestKey = createRequestKey('executeTool', serverName, { toolName, params });
    
    // Short debouncing for accidental double-clicks (500ms instead of 2s cache)
    const cachedResult = getCachedResult(requestKey);
    if (cachedResult && (Date.now() - requestCache.current.get(requestKey)!.timestamp) < 500) {
      console.log(`⚡ Preventing double-click tool execution: ${toolName} on ${serverName}`);
      return Promise.resolve(cachedResult);
    }
    
    return new Promise((resolve, reject) => {
      const requestId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Don't manually create request messages - client transport layer handles this
      
      // Store the resolver to call when we get a response
      const timeoutId = setTimeout(() => {
        // Don't manually create timeout messages - just reject
        reject(new Error('Tool execution timeout'));
      }, 30000); // 30 second timeout

      // Listen for the response (in a real implementation, you'd track this properly)
      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'tool-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            // Don't manually create response messages - client transport layer handles this
            
            if (data.error) {
              reject(new Error(data.error.message || 'Tool execution failed'));
            } else {
              // Only cache successful results for very short time (500ms for double-click prevention)
              setCachedResult(requestKey, data.result);
              resolve(data.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'execute-tool',
        requestId,
        serverName,
        toolName,
        params,
      });

      // Wait for actual response from the MCP client
      // The response will be handled by the handleResponse function above
    });
  }, [sendMessage]);

  const listResources = useCallback((serverName: string): Promise<any> => {
    const requestKey = createRequestKey('listResources', serverName);
    
    // Check cache first
    const cachedResult = getCachedResult(requestKey);
    if (cachedResult) {
      return Promise.resolve(cachedResult);
    }
    
    // Check for ongoing request
    const existingRequest = ongoingRequests.current.get(requestKey);
    if (existingRequest) {
      console.log(`♻️ Dashboard: Reusing existing listResources request for ${serverName}`);
      return existingRequest;
    }
    
    const promise = new Promise((resolve, reject) => {
      const requestId = `resources_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Don't manually create request messages - client transport layer handles this
      
      const timeoutId = setTimeout(() => {
        // Don't manually create timeout messages - just reject
        ongoingRequests.current.delete(requestKey);
        reject(new Error('List resources timeout'));
      }, 10000);

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'resources-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            // Don't manually create response messages - client transport layer handles this
            
            if (data.error) {
              ongoingRequests.current.delete(requestKey);
              reject(new Error(data.error.message || 'Failed to list resources'));
            } else {
              setCachedResult(requestKey, data.result);
              ongoingRequests.current.delete(requestKey);
              resolve(data.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'list-resources',
        requestId,
        serverName,
      });
    });
    
    // Store the promise for deduplication
    ongoingRequests.current.set(requestKey, promise);
    return promise;
  }, [sendMessage]);

  const readResource = useCallback((serverName: string, uri: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const requestId = `read_resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Log the request to message flow
      const requestMessage: MCPMessage = {
        id: requestId,
        timestamp: Date.now(),
        type: 'request',
        method: 'resources/read',
        params: { uri },
        serverName,
        direction: 'client-to-server',
      };
      
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, requestMessage].slice(-100)
      }));
      
      const timeoutId = setTimeout(() => {
        // Log timeout as error in message flow
        const errorMessage: MCPMessage = {
          id: `${requestId}_timeout`,
          timestamp: Date.now(),
          type: 'response',
          error: { message: 'Read resource timeout' },
          serverName,
          direction: 'server-to-client',
        };
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, errorMessage].slice(-100)
        }));
        reject(new Error('Read resource timeout'));
      }, 10000);

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'read-resource-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            // Log the response to message flow
            const responseMessage: MCPMessage = {
              id: `${requestId}_response`,
              timestamp: Date.now(),
              type: 'response',
              result: data.result,
              error: data.error,
              serverName,
              direction: 'server-to-client',
            };
            
            setState(prev => ({
              ...prev,
              messages: [...prev.messages, responseMessage].slice(-100)
            }));
            
            if (data.error) {
              reject(new Error(data.error.message || 'Failed to read resource'));
            } else {
              resolve(data.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'read-resource',
        requestId,
        serverName,
        uri,
      });
    });
  }, [sendMessage]);

  const getServerInfo = useCallback((serverName: string) => {
    sendMessage({
      type: 'get-server-info',
      serverName,
    });
  }, [sendMessage]);

  const listTools = useCallback((serverName: string): Promise<any> => {
    console.log(`🔧 Dashboard: Requesting tools for server: ${serverName}`);
    
    const requestKey = createRequestKey('listTools', serverName);
    
    // Check cache first
    const cachedResult = getCachedResult(requestKey);
    if (cachedResult) {
      return Promise.resolve(cachedResult);
    }
    
    // Check for ongoing request
    const existingRequest = ongoingRequests.current.get(requestKey);
    if (existingRequest) {
      console.log(`♻️ Dashboard: Reusing existing listTools request for ${serverName}`);
      return existingRequest;
    }
    
    const promise = new Promise((resolve, reject) => {
      const requestId = `tools_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Don't manually create request messages - client transport layer handles this
      
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Dashboard: Tools request timeout for server: ${serverName}`);
        // Don't manually create timeout messages - just reject
        ongoingRequests.current.delete(requestKey);
        reject(new Error('List tools timeout'));
      }, 10000);

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'tools-response' && data.requestId === requestId) {
            console.log(`✅ Dashboard: Received tools response for server: ${serverName}`, data);
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            // Don't manually create response messages - client transport layer handles this
            
            if (data.error) {
              console.log(`❌ Dashboard: Tools request error for ${serverName}:`, data.error);
              ongoingRequests.current.delete(requestKey);
              reject(new Error(data.error.message || 'Failed to list tools'));
            } else {
              console.log(`✅ Dashboard: Tools request success for ${serverName}:`, data.result);
              setCachedResult(requestKey, data.result);
              ongoingRequests.current.delete(requestKey);
              resolve(data.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'list-tools',
        requestId,
        serverName,
      });
    });
    
    // Store the promise for deduplication
    ongoingRequests.current.set(requestKey, promise);
    return promise;
  }, [sendMessage]);

  const sendCustomMessage = useCallback((message: any, serverName?: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const requestId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const targetServer = serverName || 'calculator-server';
      
      // IMPORTANT: No manual request logging here - let the client handle all message logging
      // This prevents duplicate messages in the message flow
      console.log(`📤 Dashboard sending custom message: ${message.method} to ${targetServer} with requestId: ${requestId}`);
      
      const timeoutId = setTimeout(() => {
        // Log timeout as error in message flow
        const errorMessage: MCPMessage = {
          id: `${requestId}_timeout`,
          timestamp: Date.now(),
          type: 'response',
          error: { message: 'Custom message timeout' },
          serverName: targetServer,
          direction: 'server-to-client',
        };
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, errorMessage].slice(-100)
        }));
        reject(new Error('Custom message timeout'));
      }, 15000); // 15 second timeout

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'custom-message-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            // Don't log the response here - the client already logs it and broadcasts it back
            // This prevents duplicate response messages in the message flow
            
            if (data.error) {
              reject(new Error(data.error.message || 'Custom message failed'));
            } else {
              resolve(data.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'send-custom-message',
        requestId,
        message,
        serverName: targetServer,
      });
    });
  }, [sendMessage]);

  const selectMessage = useCallback((message: MCPMessage | undefined) => {
    setState(prev => ({ ...prev, selectedMessage: message }));
  }, []);

  const manualReconnect = useCallback(() => {
    setReconnectAttempts(0);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    connect();
  }, [connect]);

  const addServer = useCallback((config: any): Promise<void> => {
    return new Promise((resolve, reject) => {
      const requestId = `add_server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Add server timeout'));
      }, 15000);

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'server-management-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            if (data.success) {
              resolve();
            } else {
              reject(new Error(data.error || 'Failed to add server'));
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'add-server',
        requestId,
        config,
      });
    });
  }, [sendMessage]);

  const removeServer = useCallback((serverId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const requestId = `remove_server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Remove server timeout'));
      }, 10000);

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'server-management-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            if (data.success) {
              resolve();
            } else {
              reject(new Error(data.error || 'Failed to remove server'));
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'remove-server',
        requestId,
        serverId,
      });
    });
  }, [sendMessage]);

  const testConnection = useCallback((config: any): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const requestId = `test_connection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection test timeout'));
      }, 10000);

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'server-management-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            if (data.success) {
              resolve(true);
            } else {
              reject(new Error(data.error || 'Connection test failed'));
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'test-connection',
        requestId,
        config,
      });
    });
  }, [sendMessage]);

  const toggleServer = useCallback((serverId: string, enabled: boolean): Promise<void> => {
    return new Promise((resolve, reject) => {
      const requestId = `toggle_server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Toggle server timeout'));
      }, 10000);

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'server-management-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            if (data.success) {
              resolve();
            } else {
              reject(new Error(data.error || 'Failed to toggle server'));
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'toggle-server',
        requestId,
        serverId,
        enabled,
      });
    });
  }, [sendMessage]);

  const getServerConfigs = useCallback((): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const requestId = `configs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Get server configs timeout'));
      }, 10000);

      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'server-configs-response' && data.requestId === requestId) {
            clearTimeout(timeoutId);
            ws.current?.removeEventListener('message', handleResponse);
            
            if (data.error) {
              reject(new Error(data.error.message || 'Failed to get server configs'));
            } else {
              resolve(data.configs || []);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (ws.current) {
        ws.current.addEventListener('message', handleResponse);
      }

      sendMessage({
        type: 'get-server-configs',
        requestId,
      });
    });
  }, [sendMessage]);

  return {
    ...state,
    executeTool,
    listResources,
    readResource,
    getServerInfo,
    listTools,
    sendCustomMessage,
    selectMessage,
    reconnectAttempts,
    maxReconnectAttempts,
    manualReconnect,
    addServer,
    removeServer,
    testConnection,
    toggleServer,
    getServerConfigs,
  };
};