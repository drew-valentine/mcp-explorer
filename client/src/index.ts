#!/usr/bin/env node

// Polyfills for Node.js environment
import { EventSource } from 'eventsource';
import WebSocket from 'ws';

// Make these available globally for the MCP SDK
(global as any).EventSource = EventSource;
(global as any).WebSocket = WebSocket;

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { MCPMessage, ServerStatus } from './types/index.js';

const DASHBOARD_PORT = 8081;

interface MCPServer {
  name: string;
  client: Client;
  transport: any; // Support all transport types
  process: any;
  connected: boolean;
  toolsCount?: number;
  resourcesCount?: number;
  promptsCount?: number;
  config?: any; // Store the original configuration
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
  reconnectTimeout?: NodeJS.Timeout;
  lastDisconnectTime?: number;
  lastCapabilityFetch?: number; // Track when capabilities were last fetched
}

interface ServerConfig {
  id: string;
  name: string;
  description: string;
  connectionType: 'stdio' | 'sse' | 'websocket';
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

class MCPClient {
  private servers: Map<string, MCPServer> = new Map();
  private serverConfigs: Map<string, ServerConfig> = new Map();
  private wss: WebSocketServer;
  private messageHistory: MCPMessage[] = [];
  private messageIdCounter = 0;
  private configFilePath = './server-configs.json';
  // pendingRequests removed - no longer needed with client-level interception

  constructor() {
    console.log(`Creating WebSocket server on port ${DASHBOARD_PORT}`);
    this.wss = new WebSocketServer({ port: DASHBOARD_PORT });
    this.setupWebSocketServer();
    this.loadServerConfigs();
    
    this.wss.on('listening', () => {
      console.log(`✅ WebSocket server listening on port ${DASHBOARD_PORT}`);
    });
    
    this.wss.on('error', (error) => {
      console.error('❌ WebSocket server error:', error);
    });
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      console.log(`✅ Dashboard connected to client from ${req.socket.remoteAddress}`);
      console.log(`WebSocket protocol: ${ws.protocol}, extensions: ${ws.extensions}`);

      // Send initial state
      try {
        const serverStatus = this.getServerStatus();
        const initialState = {
          type: 'initial-state',
          data: {
            servers: serverStatus,
            messages: this.messageHistory,
          },
        };
        console.log(`Sending initial state with ${serverStatus.length} servers:`, serverStatus.map(s => `${s.name}(${s.connected})`));
        ws.send(JSON.stringify(initialState));
      } catch (error) {
        console.error('Error sending initial state:', error);
      }

      // Set up heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.ping();
        } else {
          clearInterval(heartbeat);
        }
      }, 30000); // Send ping every 30 seconds

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data).catch(error => {
            console.error('Error handling WebSocket message:', error);
            // Send error response back to dashboard
            if (data.requestId) {
              try {
                ws.send(JSON.stringify({
                  type: 'error-response',
                  requestId: data.requestId,
                  error: { message: error instanceof Error ? error.message : 'WebSocket message handling failed' }
                }));
              } catch (sendError) {
                console.error('Error sending error response:', sendError);
              }
            }
          });
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('pong', () => {
        // Connection is alive, heartbeat received
      });

      ws.on('close', (code, reason) => {
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
        
        const reasonText = closeReasons[code as keyof typeof closeReasons] || 'Unknown';
        console.log(`❌ Dashboard disconnected from client: ${code} (${reasonText}) - ${reason || 'No reason provided'}`);
        clearInterval(heartbeat);
      });

      ws.on('error', (error) => {
        console.error('WebSocket connection error:', error);
        clearInterval(heartbeat);
      });
    });
  }

  private async handleWebSocketMessage(ws: any, data: any) {
    console.log(`Handling WebSocket message: ${data.type} for server: ${data.serverName || data.serverId || 'N/A'}`);
    
    switch (data.type) {
      case 'execute-tool':
        await this.executeToolFromDashboard(ws, data.requestId, data.serverName, data.toolName, data.params);
        break;
      
      case 'list-resources':
        await this.listResourcesFromDashboard(ws, data.requestId, data.serverName);
        break;
      
      case 'read-resource':
        await this.readResourceFromDashboard(ws, data.requestId, data.serverName, data.uri);
        break;
      
      case 'get-server-info':
        await this.getServerInfoFromDashboard(data.serverName);
        break;
      
      case 'send-custom-message':
        await this.sendCustomMessageToServerWithResponse(ws, data.requestId, data.serverName, data.message);
        break;
      
      case 'list-tools':
        await this.listToolsFromDashboard(ws, data.requestId, data.serverName);
        break;
      
      case 'add-server':
        await this.addServerFromDashboard(ws, data.requestId, data.config);
        break;
      
      case 'remove-server':
        await this.removeServerFromDashboard(ws, data.requestId, data.serverId);
        break;
      
      case 'test-connection':
        await this.testServerConnectionFromDashboard(ws, data.requestId, data.config);
        break;
      
      case 'toggle-server':
        await this.toggleServerFromDashboard(ws, data.requestId, data.serverId, data.enabled);
        break;
      
      case 'get-server-configs':
        await this.getServerConfigsFromDashboard(ws, data.requestId);
        break;
        
      default:
        console.log(`Unknown WebSocket message type: ${data.type}`);
        break;
    }
  }

  private async connectToServer(serverName: string, command: string, args?: string[]): Promise<void> {
    console.log(`🚀 Attempting to connect to server "${serverName}" with command: "${command}", args: [${(args || []).join(', ')}]`);
    
    try {
      return await this.connectToServerWithTransport(serverName, () => new StdioClientTransport({
        command: command,
        args: args || [],
      }));
    } catch (error) {
      // Provide helpful error messages for common Docker issues
      if (error instanceof Error && error.message.includes('ENOENT')) {
        if (command === 'docker') {
          console.error(`❌ Docker command not found. Make sure Docker is installed and available in PATH.`);
          throw new Error(`Docker command not found. Please ensure Docker is installed and running on your system.`);
        } else {
          console.error(`❌ Command "${command}" not found. Check if the command is installed and available in PATH.`);
          throw new Error(`Command "${command}" not found. Please check if it's installed and available in your system PATH.`);
        }
      }
      throw error;
    }
  }

  private async connectToServerSSE(serverName: string, url: string): Promise<void> {
    return this.connectToServerWithTransport(serverName, () => new SSEClientTransport(new URL(url)));
  }

  private async connectToServerWebSocket(serverName: string, url: string): Promise<void> {
    return this.connectToServerWithTransport(serverName, () => new WebSocketClientTransport(new URL(url)));
  }

  private async connectToServerWithTransport(serverName: string, createTransport: () => any): Promise<void> {
    try {
      console.log(`Connecting to MCP server: ${serverName}`);

      // Check if server is already connected
      if (this.servers.has(serverName) && this.servers.get(serverName)?.connected) {
        console.log(`${serverName} already connected`);
        return;
      }

      // Create real MCP client and transport
      const transport = createTransport();

      const client = new Client(
        {
          name: 'mcp-demo-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Set up message intercepting for visualization - client-level only
      // (Transport layer logging removed to prevent duplicates)

      // Connect the client to the transport
      await client.connect(transport);
      console.log(`✓ Connected to real MCP server: ${serverName}`);
      
      // Also intercept specific high-level client methods instead of the low-level request method
      const originalCallTool = client.callTool.bind(client);
      client.callTool = async (request: any) => {
        const requestId = (++this.messageIdCounter).toString();
        
        // Log the request
        this.logMessage({
          id: requestId,
          timestamp: Date.now(),
          type: 'request',
          method: 'tools/call',
          params: request,
          result: undefined,
          error: undefined,
          serverName,
          direction: 'client-to-server',
        });
        
        try {
          // Execute the original request
          const response = await originalCallTool(request);
          
          // Log the response with the same ID as the request
          this.logMessage({
            id: requestId,
            timestamp: Date.now(),
            type: 'response',
            method: 'tools/call',
            params: request,
            result: response,
            error: undefined,
            serverName,
            direction: 'server-to-client',
          });
          
          return response;
        } catch (error) {
          // Log error responses
          this.logMessage({
            id: requestId,
            timestamp: Date.now(),
            type: 'response',
            method: 'tools/call',
            params: request,
            result: undefined,
            error: error instanceof Error ? { message: error.message } : { message: 'Unknown error' },
            serverName,
            direction: 'server-to-client',
          });
          
          throw error;
        }
      };
      
      const originalListTools = client.listTools.bind(client);
      client.listTools = async () => {
        const requestId = (++this.messageIdCounter).toString();
        
        // Log the request
        this.logMessage({
          id: requestId,
          timestamp: Date.now(),
          type: 'request',
          method: 'tools/list',
          params: {},
          result: undefined,
          error: undefined,
          serverName,
          direction: 'client-to-server',
        });
        
        try {
          // Execute the original request
          const response = await originalListTools();
          
          // Log the response with the same ID as the request
          this.logMessage({
            id: requestId,
            timestamp: Date.now(),
            type: 'response',
            method: 'tools/list',
            params: {},
            result: response,
            error: undefined,
            serverName,
            direction: 'server-to-client',
          });
          
          return response;
        } catch (error) {
          // Log error responses
          this.logMessage({
            id: requestId,
            timestamp: Date.now(),
            type: 'response',
            method: 'tools/list',
            params: {},
            result: undefined,
            error: error instanceof Error ? { message: error.message } : { message: 'Unknown error' },
            serverName,
            direction: 'server-to-client',
          });
          
          throw error;
        }
      };
      
      const originalListResources = client.listResources.bind(client);
      client.listResources = async () => {
        const requestId = (++this.messageIdCounter).toString();
        
        // Log the request
        this.logMessage({
          id: requestId,
          timestamp: Date.now(),
          type: 'request',
          method: 'resources/list',
          params: {},
          result: undefined,
          error: undefined,
          serverName,
          direction: 'client-to-server',
        });
        
        try {
          // Execute the original request
          const response = await originalListResources();
          
          // Log the response with the same ID as the request
          this.logMessage({
            id: requestId,
            timestamp: Date.now(),
            type: 'response',
            method: 'resources/list',
            params: {},
            result: response,
            error: undefined,
            serverName,
            direction: 'server-to-client',
          });
          
          return response;
        } catch (error) {
          // Log error responses
          this.logMessage({
            id: requestId,
            timestamp: Date.now(),
            type: 'response',
            method: 'resources/list',
            params: {},
            result: undefined,
            error: error instanceof Error ? { message: error.message } : { message: 'Unknown error' },
            serverName,
            direction: 'server-to-client',
          });
          
          throw error;
        }
      };

      // Handle transport events
      transport.onerror = (error: Error) => {
        console.error(`${serverName} transport error:`, error);
        this.handleServerDisconnection(serverName);
      };

      transport.onclose = () => {
        console.log(`${serverName} transport closed`);
        this.handleServerDisconnection(serverName);
      };

      this.servers.set(serverName, {
        name: serverName,
        client,
        transport,
        process: null, // Transport handles the process
        connected: true,
        config: this.serverConfigs.get(serverName), // Store config reference
        lastCapabilityFetch: 0, // Track when capabilities were last fetched
      });

      this.broadcastServerStatus();

      // Get initial server capabilities from real server
      await this.getServerCapabilities(serverName);

    } catch (error) {
      console.error(`Failed to connect to real server ${serverName}:`, error);
      this.handleServerDisconnection(serverName);
    }
  }


  private handleServerDisconnection(serverName: string, shouldReconnect: boolean = true) {
    const server = this.servers.get(serverName);
    if (server) {
      console.log(`Server ${serverName} disconnected`);
      server.connected = false;
      server.lastDisconnectTime = Date.now();
      this.broadcastServerStatus();
      
      if (shouldReconnect && server.config) {
        this.attemptReconnection(serverName);
      }
    }
  }

  private async attemptReconnection(serverName: string) {
    const server = this.servers.get(serverName);
    const config = this.serverConfigs.get(serverName);
    
    if (!server || !config || !config.enabled) {
      console.log(`Skipping reconnection for ${serverName}: server=${!!server}, config=${!!config}, enabled=${config?.enabled}`);
      return;
    }
    
    // Initialize reconnection state
    const maxAttempts = 5;
    const currentAttempts = server.reconnectAttempts || 0;
    
    if (currentAttempts >= maxAttempts) {
      console.error(`❌ Max reconnection attempts (${maxAttempts}) reached for ${serverName}`);
      return;
    }
    
    // Exponential backoff: 2s, 3s, 4s, 5s, 6s, capped at 10s
    const delay = Math.min(2000 + (currentAttempts * 1000), 10000);
    console.log(`🔄 Scheduling reconnection for ${serverName} in ${delay}ms (attempt ${currentAttempts + 1}/${maxAttempts})`);
    
    // Clear any existing reconnection timeout
    if (server.reconnectTimeout) {
      clearTimeout(server.reconnectTimeout);
    }
    
    server.reconnectTimeout = setTimeout(async () => {
      try {
        console.log(`🔌 Attempting to reconnect to ${serverName}...`);
        server.reconnectAttempts = currentAttempts + 1;
        
        // Attempt reconnection using the stored config
        await this.connectToServerWithConfig(config);
        
        // Reset reconnection attempts on successful connection
        server.reconnectAttempts = 0;
        if (server.reconnectTimeout) {
          clearTimeout(server.reconnectTimeout);
          server.reconnectTimeout = undefined;
        }
        console.log(`✅ Successfully reconnected to ${serverName}`);
        
      } catch (error) {
        console.error(`❌ Failed to reconnect to ${serverName} (attempt ${server.reconnectAttempts}/${maxAttempts}):`, error);
        // The error will trigger handleServerDisconnection again, which will schedule the next attempt
      }
    }, delay);
  }

  private async manualReconnectServer(serverName: string) {
    const server = this.servers.get(serverName);
    const config = this.serverConfigs.get(serverName);
    
    if (!server || !config) {
      console.error(`Cannot manually reconnect ${serverName}: missing server or config`);
      return;
    }
    
    console.log(`🔄 Manual reconnection triggered for ${serverName}`);
    
    // Clear any pending automatic reconnection
    if (server.reconnectTimeout) {
      clearTimeout(server.reconnectTimeout);
      server.reconnectTimeout = undefined;
    }
    
    // Reset reconnection attempts for manual reconnection
    server.reconnectAttempts = 0;
    
    try {
      await this.connectToServerWithConfig(config);
      console.log(`✅ Manual reconnection successful for ${serverName}`);
    } catch (error) {
      console.error(`❌ Manual reconnection failed for ${serverName}:`, error);
      // Start automatic reconnection attempts after manual failure
      this.attemptReconnection(serverName);
    }
  }

  private async getServerCapabilities(serverName: string) {
    const server = this.servers.get(serverName);
    if (!server) return;

    // Check if we already have recent capability data to avoid duplicate calls
    const now = Date.now();
    const lastCapabilityFetch = server.lastCapabilityFetch || 0;
    const CAPABILITY_CACHE_DURATION = 5000; // 5 seconds
    
    if (now - lastCapabilityFetch < CAPABILITY_CACHE_DURATION) {
      console.log(`⚡ Skipping capability fetch for ${serverName} - already fetched recently`);
      return;
    }
    
    server.lastCapabilityFetch = now;

    try {
      // List tools
      console.log(`🔧 Fetching tools for ${serverName} (server-side)`);
      const tools = await server.client.listTools();
      server.toolsCount = tools.tools?.length || 0;
      console.log(`${serverName} tools:`, tools.tools?.map(t => t.name));

      // List resources if supported
      try {
        const resources = await server.client.listResources();
        server.resourcesCount = resources.resources?.length || 0;
        console.log(`${serverName} resources:`, resources.resources?.map(r => r.name));
      } catch (e) {
        server.resourcesCount = 0;
        // Resources might not be supported
      }

      // List prompts if supported
      try {
        const prompts = await server.client.listPrompts();
        server.promptsCount = prompts.prompts?.length || 0;
        console.log(`${serverName} prompts:`, prompts.prompts?.map(p => p.name));
      } catch (e) {
        server.promptsCount = 0;
        // Prompts might not be supported
      }

      // Update the server in the map
      this.servers.set(serverName, server);
      
      // Broadcast updated status after capabilities are fetched
      this.broadcastServerStatus();

    } catch (error) {
      console.error(`Error getting ${serverName} capabilities:`, error);
    }
  }

  private async executeToolFromDashboard(ws: any, requestId: string, serverName: string, toolName: string, params: any) {
    try {
      const server = this.servers.get(serverName);
      if (!server) {
        console.error(`Server ${serverName} not found`);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'tool-response',
            requestId,
            error: { message: `Server ${serverName} not found` }
          }));
        }
        return;
      }

      if (!server.connected) {
        console.error(`Server ${serverName} is not connected`);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'tool-response',
            requestId,
            error: { message: `Server ${serverName} is not connected` }
          }));
        }
        return;
      }

      console.log(`Executing tool ${toolName} on ${serverName} with params:`, params);
      const result = await server.client.callTool({
        name: toolName,
        arguments: params,
      });

      console.log(`Tool ${toolName} result:`, result);
      
      // Send response back to dashboard
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'tool-response',
          requestId,
          result
        }));
      }
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      try {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'tool-response',
            requestId,
            error: { message: error instanceof Error ? error.message : 'Tool execution failed' }
          }));
        }
      } catch (sendError) {
        console.error('Error sending tool error response:', sendError);
      }
    }
  }

  private async listResourcesFromDashboard(ws: any, requestId: string, serverName: string) {
    const server = this.servers.get(serverName);
    if (!server) {
      ws.send(JSON.stringify({
        type: 'resources-response',
        requestId,
        error: { message: `Server ${serverName} not found` }
      }));
      return;
    }

    try {
      const result = await server.client.listResources();
      console.log(`${serverName} resources:`, result);
      
      ws.send(JSON.stringify({
        type: 'resources-response',
        requestId,
        result
      }));
    } catch (error) {
      console.error(`Error listing resources for ${serverName}:`, error);
      ws.send(JSON.stringify({
        type: 'resources-response',
        requestId,
        error: { message: error instanceof Error ? error.message : 'Failed to list resources' }
      }));
    }
  }

  private async readResourceFromDashboard(ws: any, requestId: string, serverName: string, uri: string) {
    const server = this.servers.get(serverName);
    if (!server) {
      ws.send(JSON.stringify({
        type: 'read-resource-response',
        requestId,
        error: { message: `Server ${serverName} not found` }
      }));
      return;
    }

    try {
      const result = await server.client.readResource({ uri });
      console.log(`${serverName} resource ${uri}:`, result);
      
      ws.send(JSON.stringify({
        type: 'read-resource-response',
        requestId,
        result
      }));
    } catch (error) {
      console.error(`Error reading resource ${uri} from ${serverName}:`, error);
      ws.send(JSON.stringify({
        type: 'read-resource-response',
        requestId,
        error: { message: error instanceof Error ? error.message : 'Failed to read resource' }
      }));
    }
  }

  private async listToolsFromDashboard(ws: any, requestId: string, serverName: string) {
    try {
      const server = this.servers.get(serverName);
      if (!server) {
        console.log(`Server ${serverName} not found. Available servers:`, Array.from(this.servers.keys()));
        ws.send(JSON.stringify({
          type: 'tools-response',
          requestId,
          error: { message: `Server ${serverName} not found` }
        }));
        return;
      }

      if (!server.connected) {
        console.log(`Server ${serverName} is not connected`);
        ws.send(JSON.stringify({
          type: 'tools-response',
          requestId,
          error: { message: `Server ${serverName} is not connected` }
        }));
        return;
      }

      console.log(`Listing tools for ${serverName}...`);
      const result = await server.client.listTools();
      console.log(`${serverName} tools:`, result);
      
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify({
          type: 'tools-response',
          requestId,
          result
        }));
      } else {
        console.error('WebSocket connection closed while sending tools response');
      }
    } catch (error) {
      console.error(`Error listing tools for ${serverName}:`, error);
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(JSON.stringify({
            type: 'tools-response',
            requestId,
            error: { message: error instanceof Error ? error.message : 'Failed to list tools' }
          }));
        }
      } catch (sendError) {
        console.error('Error sending tools error response:', sendError);
      }
    }
  }

  private async getServerInfoFromDashboard(serverName: string) {
    const server = this.servers.get(serverName);
    if (!server) return;

    try {
      const [tools, resources] = await Promise.allSettled([
        server.client.listTools(),
        server.client.listResources(),
      ]);

      console.log(`${serverName} info:`, {
        tools: tools.status === 'fulfilled' ? tools.value : null,
        resources: resources.status === 'fulfilled' ? resources.value : null,
      });
    } catch (error) {
      console.error(`Error getting info for ${serverName}:`, error);
    }
  }

  private async sendCustomMessageToServerWithResponse(ws: any, requestId: string, serverName: string, message: any) {
    const server = this.servers.get(serverName);
    if (!server) {
      console.error(`Server ${serverName} not found`);
      ws.send(JSON.stringify({
        type: 'custom-message-response',
        requestId,
        error: { message: `Server ${serverName} not found` }
      }));
      return;
    }

    try {
      console.log(`Sending custom message to ${serverName}:`, message);
      
      // Don't manually log here - transport layer will handle it automatically
      
      // Handle real server responses based on the message type
      let response;
      
      if (message.method === 'tools/list') {
        response = await server.client.listTools();
      } else if (message.method === 'resources/list') {
        response = await server.client.listResources();
      } else if (message.method === 'tools/call') {
        response = await server.client.callTool({
          name: message.params.name,
          arguments: message.params.arguments || {},
        });
      } else if (message.method === 'resources/read') {
        response = await server.client.readResource({ uri: message.params.uri });
      } else {
        response = { result: `Custom message processed by ${serverName}`, message };
      }

      // Don't manually log response - transport layer will handle it automatically
      
      console.log(`Custom message response from ${serverName}:`, response);
      
      // Send response back to dashboard
      ws.send(JSON.stringify({
        type: 'custom-message-response',
        requestId,
        result: response
      }));
    } catch (error) {
      console.error(`Error sending custom message to ${serverName}:`, error);
      
      // Don't manually log error - transport layer will handle it automatically
      
      // Send error response back to dashboard
      ws.send(JSON.stringify({
        type: 'custom-message-response',
        requestId,
        error: { message: error instanceof Error ? error.message : 'Custom message failed' }
      }));
    }
  }


  private async addServerFromDashboard(ws: any, requestId: string, config: any) {
    try {
      console.log(`Adding server: ${config.name}`);
      
      // Validate the config
      if (!config.name || !config.connectionType) {
        throw new Error('Invalid server configuration');
      }

      if (this.servers.has(config.name) || this.serverConfigs.has(config.name)) {
        throw new Error('Server already exists');
      }

      // Save the configuration
      this.serverConfigs.set(config.name, config);
      this.saveServerConfigs();

      // Connect to the new server if enabled
      if (config.enabled) {
        if (config.connectionType === 'stdio' && config.command) {
          await this.connectToServerWithConfig(config);
        } else if ((config.connectionType === 'sse' || config.connectionType === 'websocket') && config.url) {
          await this.connectToServerWithConfig(config);
        } else {
          throw new Error('Invalid server configuration for connection type');
        }
      }

      // Broadcast updated server status to all clients
      this.broadcastServerStatus();

      ws.send(JSON.stringify({
        type: 'server-management-response',
        requestId,
        success: true,
        message: `Server ${config.name} added successfully`
      }));
    } catch (error) {
      console.error(`Error adding server:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add server';
      
      // Provide more specific error messages for common issues
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('EventSource is not defined')) {
        userFriendlyMessage = 'SSE connection failed: Server may not be running or URL is incorrect';
      } else if (errorMessage.includes('WebSocket is not defined')) {
        userFriendlyMessage = 'WebSocket connection failed: Server may not be running or URL is incorrect';
      } else if (errorMessage.includes('ECONNREFUSED')) {
        userFriendlyMessage = 'Connection refused: Server is not running at the specified URL';
      } else if (errorMessage.includes('ENOTFOUND')) {
        userFriendlyMessage = 'Host not found: Check the server URL';
      }
      
      ws.send(JSON.stringify({
        type: 'server-management-response',
        requestId,
        success: false,
        error: userFriendlyMessage
      }));
    }
  }

  private async removeServerFromDashboard(ws: any, requestId: string, serverId: string) {
    try {
      console.log(`Removing server: ${serverId}`);
      
      // Find server by ID or name
      let serverName = serverId;
      const config = this.serverConfigs.get(serverId);
      if (config) {
        serverName = config.name;
      }
      
      const server = this.servers.get(serverName);
      if (server) {
        // Clear any pending reconnection timeout
        if (server.reconnectTimeout) {
          clearTimeout(server.reconnectTimeout);
        }
        
        // Manually disconnect without triggering reconnection
        this.handleServerDisconnection(serverName, false);
        
        // Disconnect and remove the server
        if (server.transport) {
          server.transport.close?.();
        }
        this.servers.delete(serverName);
      }
      
      // Remove the configuration
      this.serverConfigs.delete(serverName);
      this.saveServerConfigs();
      
      this.broadcastServerStatus();

      ws.send(JSON.stringify({
        type: 'server-management-response',
        requestId,
        success: true,
        message: `Server ${serverName} removed successfully`
      }));
    } catch (error) {
      console.error(`Error removing server:`, error);
      ws.send(JSON.stringify({
        type: 'server-management-response',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove server'
      }));
    }
  }

  private async testServerConnectionFromDashboard(ws: any, requestId: string, config: any) {
    try {
      console.log(`Testing connection for: ${config.name}`);
      
      // Validate the config structure
      if (config.connectionType === 'stdio') {
        if (!config.command) {
          throw new Error('Command is required for stdio connection');
        }
      } else if (config.connectionType === 'websocket' || config.connectionType === 'sse') {
        if (!config.url) {
          throw new Error('URL is required for WebSocket/SSE connection');
        }
        
        // For web-based connections, try to actually test the connection
        try {
          // Create transport directly without using connectToServerWithTransport to avoid saving test servers
          let transport;
          if (config.connectionType === 'sse') {
            transport = new SSEClientTransport(new URL(config.url));
          } else {
            transport = new WebSocketClientTransport(new URL(config.url));
          }
          
          // Create a temporary client for testing
          const testClient = new Client(
            {
              name: 'mcp-demo-client-test',
              version: '1.0.0',
            },
            {
              capabilities: {},
            }
          );
          
          // Try to connect (this will throw if it fails)
          await testClient.connect(transport);
          
          // If we get here, connection succeeded - clean up immediately
          try {
            transport.close?.();
          } catch (cleanupError) {
            console.warn('Error cleaning up test transport:', cleanupError);
          }
        } catch (error) {
          throw new Error(`Failed to connect to ${config.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      ws.send(JSON.stringify({
        type: 'server-management-response',
        requestId,
        success: true,
        message: `Connection test for ${config.name} passed`
      }));
    } catch (error) {
      console.error(`Error testing connection:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      
      // Provide more specific error messages
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('ECONNREFUSED')) {
        userFriendlyMessage = 'Connection refused: Server is not running at the specified URL';
      } else if (errorMessage.includes('ENOTFOUND')) {
        userFriendlyMessage = 'Host not found: Check the server URL';
      } else if (errorMessage.includes('Invalid URL')) {
        userFriendlyMessage = 'Invalid URL format';
      }
      
      ws.send(JSON.stringify({
        type: 'server-management-response',
        requestId,
        success: false,
        error: userFriendlyMessage
      }));
    }
  }

  private async toggleServerFromDashboard(ws: any, requestId: string, serverId: string, enabled: boolean) {
    try {
      console.log(`Toggling server ${serverId} to ${enabled ? 'enabled' : 'disabled'}`);
      
      // Find and update the server configuration
      const config = this.serverConfigs.get(serverId);
      if (!config) {
        throw new Error(`Server configuration for ${serverId} not found`);
      }
      
      // Update the enabled status in the configuration
      config.enabled = enabled;
      this.serverConfigs.set(serverId, config);
      
      // Save the updated configuration
      this.saveServerConfigs();
      
      if (enabled) {
        // Re-enable server - reconnect if not already connected
        const server = this.servers.get(serverId);
        if (!server || !server.connected) {
          console.log(`Reconnecting ${serverId} because it was enabled`);
          await this.connectToServerWithConfig(config);
        }
      } else {
        // Disable server - disconnect and prevent reconnection
        const server = this.servers.get(serverId);
        if (server) {
          // Clear any pending reconnection timeout and disable reconnection
          if (server.reconnectTimeout) {
            clearTimeout(server.reconnectTimeout);
            server.reconnectTimeout = undefined;
          }
          
          // Manually disconnect without triggering reconnection
          this.handleServerDisconnection(serverId, false);
          
          if (server.transport) {
            server.transport.close?.();
          }
        }
      }
      
      this.broadcastServerStatus();

      ws.send(JSON.stringify({
        type: 'server-management-response',
        requestId,
        success: true,
        message: `Server ${serverId} ${enabled ? 'enabled' : 'disabled'} successfully`
      }));
    } catch (error) {
      console.error(`Error toggling server:`, error);
      ws.send(JSON.stringify({
        type: 'server-management-response',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to toggle server'
      }));
    }
  }

  private async getServerConfigsFromDashboard(ws: any, requestId: string) {
    try {
      const configs = Array.from(this.serverConfigs.values());
      console.log(`Sending ${configs.length} server configurations to dashboard`);
      
      ws.send(JSON.stringify({
        type: 'server-configs-response',
        requestId,
        configs
      }));
    } catch (error) {
      console.error(`Error getting server configurations:`, error);
      ws.send(JSON.stringify({
        type: 'server-configs-response',
        requestId,
        error: error instanceof Error ? error.message : 'Failed to get server configurations'
      }));
    }
  }

  private async connectToServerWithConfig(config: any): Promise<void> {
    const serverName = config.name;
    
    if (config.connectionType === 'stdio') {
      let command = config.command;
      let args = config.args || [];
      
      // Handle common case where full command is accidentally put in command field
      if (command && command.includes(' ') && args.length === 0) {
        console.log(`⚠️ Detected space in command field, attempting to split: "${command}"`);
        const parts = command.split(' ').filter((part: string) => part.trim());
        if (parts.length > 1) {
          command = parts[0];
          args = parts.slice(1);
          console.log(`🔧 Split into command: "${command}", args: [${args.join(', ')}]`);
        }
      }
      
      await this.connectToServer(serverName, command, args);
    } else if (config.connectionType === 'sse') {
      if (!config.url) {
        throw new Error('URL is required for SSE connection');
      }
      await this.connectToServerSSE(serverName, config.url);
    } else if (config.connectionType === 'websocket') {
      if (!config.url) {
        throw new Error('URL is required for WebSocket connection');
      }
      await this.connectToServerWebSocket(serverName, config.url);
    } else {
      throw new Error(`Connection type ${config.connectionType} not yet implemented`);
    }
  }

  private logMessage(message: MCPMessage) {
    this.messageHistory.push(message);
    
    // Keep only last 100 messages
    if (this.messageHistory.length > 100) {
      this.messageHistory = this.messageHistory.slice(-100);
    }

    // Broadcast to dashboard
    this.broadcastMessage(message);
  }

  private broadcastMessage(message: MCPMessage) {
    const data = JSON.stringify({
      type: 'new-message',
      data: message,
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  }

  private getServerStatus(): ServerStatus[] {
    return Array.from(this.servers.values()).map(server => {
      const serverMessages = this.messageHistory.filter(m => m.serverName === server.name);
      const lastMessage = serverMessages.slice(-1)[0];
      
      // Get real capabilities from the server's cached data
      const capabilities = [];
      if (server.toolsCount !== undefined && server.toolsCount > 0) capabilities.push('tools');
      if (server.resourcesCount !== undefined && server.resourcesCount > 0) capabilities.push('resources');
      if (server.promptsCount !== undefined && server.promptsCount > 0) capabilities.push('prompts');
      
      return {
        name: server.name,
        connected: server.connected,
        capabilities,
        resources: server.resourcesCount || 0,
        tools: server.toolsCount || 0,
        prompts: server.promptsCount || 0,
        lastMessage: lastMessage?.timestamp,
        description: this.getServerDescription(server.name),
        running: server.connected,
      };
    });
  }

  private loadServerConfigs() {
    // Add built-in server configurations
    const builtInServers: ServerConfig[] = [
      {
        id: 'file-server',
        name: 'file-server',
        description: 'File system resource and tool server',
        connectionType: 'stdio',
        command: 'node',
        args: ['../server/dist/file-server.js'],
        enabled: true,
        isBuiltIn: true,
      },
      {
        id: 'calculator-server',
        name: 'calculator-server',
        description: 'Mathematical calculation tools',
        connectionType: 'stdio',
        command: 'node',
        args: ['../server/dist/calculator-server.js'],
        enabled: true,
        isBuiltIn: true,
      },
      {
        id: 'notes-server',
        name: 'notes-server',
        description: 'Note-taking with SQLite persistence',
        connectionType: 'stdio',
        command: 'node',
        args: ['../server/dist/notes-server.js'],
        enabled: true,
        isBuiltIn: true,
      },
      {
        id: 'weather-server',
        name: 'weather-server',
        description: 'Weather data and forecasting',
        connectionType: 'stdio',
        command: 'node',
        args: ['../server/dist/weather-server.js'],
        enabled: true,
        isBuiltIn: true,
      },
    ];

    builtInServers.forEach(config => {
      this.serverConfigs.set(config.name, config);
    });

    // Load custom server configurations
    try {
      if (existsSync(this.configFilePath)) {
        const configData = readFileSync(this.configFilePath, 'utf8');
        const configs: ServerConfig[] = JSON.parse(configData);
        
        configs.forEach(config => {
          // Filter out any test servers that might have been accidentally saved
          if (!config.name.startsWith('test-')) {
            this.serverConfigs.set(config.name, config);
          }
        });
        
        console.log(`Loaded ${configs.length} custom server configurations`);
      }
    } catch (error) {
      console.error('Error loading server configurations:', error);
    }
  }

  private saveServerConfigs() {
    try {
      const configs = Array.from(this.serverConfigs.values()).filter(config => 
        !config.isBuiltIn && !config.name.startsWith('test-')
      );
      writeFileSync(this.configFilePath, JSON.stringify(configs, null, 2));
      console.log(`Saved ${configs.length} server configurations`);
    } catch (error) {
      console.error('Error saving server configurations:', error);
    }
  }

  private getServerDescription(serverName: string): string {
    // Check if it's a custom server first
    const config = this.serverConfigs.get(serverName);
    if (config && config.description) {
      return config.description;
    }
    
    // Fall back to built-in descriptions
    const descriptions = {
      'file-server': 'File system resource and tool server',
      'calculator-server': 'Calculator tool server',
      'notes-server': 'Note-taking server with SQLite persistence',
      'weather-server': 'Weather data and forecast server',
    };
    return (descriptions as any)[serverName] || 'MCP Server';
  }

  private broadcastServerStatus() {
    const status = this.getServerStatus();
    const message = JSON.stringify({
      type: 'server-status-update',
      data: status,
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  async start() {
    console.log(`MCP Client running on port ${DASHBOARD_PORT}`);

    // Wait for the system to be ready, then connect servers sequentially
    setTimeout(async () => {
      console.log('Starting server connections...');
      
      // Connect to all enabled servers from configuration
      const enabledConfigs = Array.from(this.serverConfigs.values()).filter(config => config.enabled);
      
      for (const config of enabledConfigs) {
        try {
          await this.connectToServerWithConfig(config);
          console.log(`✓ ${config.name} connection initiated`);
          
          // Longer delay between connections to prevent overwhelming
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`✗ Failed to connect to ${config.name}:`, error);
        }
      }
      
      console.log(`All ${enabledConfigs.length} server connections initiated`);
      
      // Wait for connections to stabilize before running demo
      // Only run demo if explicitly enabled via environment variable
      if (process.env.RUN_DEMO === 'true') {
        setTimeout(() => {
          const connectedServers = Array.from(this.servers.values()).filter(s => s.connected);
          if (connectedServers.length > 0) {
            console.log(`Running demo with ${connectedServers.length} connected servers...`);
            this.runDemo();
          } else {
            console.log('No servers connected, skipping demo');
          }
        }, 10000); // Increased delay to 10 seconds to let dashboard stabilize
      } else {
        console.log('Demo disabled. Set RUN_DEMO=true environment variable to enable automatic demo.');
      }
    }, 3000); // Wait 3 seconds for system startup
  }

  private async runDemo() {
    console.log('\n--- Running Demo Operations ---');
    
    const connectedServers = Array.from(this.servers.values()).filter(s => s.connected);
    console.log(`Demo running with ${connectedServers.length} connected servers`);

    // Demo operations with delays between them
    const demoOperations = [
      { server: 'calculator-server', operation: () => this.demoCalculator() },
      { server: 'file-server', operation: () => this.demoFileOperations() },
      { server: 'notes-server', operation: () => this.demoNotes() },
      { server: 'weather-server', operation: () => this.demoWeather() },
    ];

    for (const demo of demoOperations) {
      const server = this.servers.get(demo.server);
      if (server && server.connected) {
        try {
          console.log(`Running ${demo.server} demo...`);
          await demo.operation();
          await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between demos
        } catch (error) {
          console.error(`Demo error for ${demo.server}:`, error);
        }
      } else {
        console.log(`Skipping ${demo.server} demo (not connected)`);
      }
    }
    
    console.log('--- Demo Complete ---\n');
  }

  private async demoCalculator() {
    const server = this.servers.get('calculator-server');
    if (!server || !server.connected) return;

    // Manually create messages for demo
    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'request',
      method: 'tools/call',
      params: { name: 'add', arguments: { a: 5, b: 3 } },
      serverName: 'calculator-server',
      direction: 'client-to-server',
    });

    const result1 = await server.client.callTool({
      name: 'add',
      arguments: { a: 5, b: 3 },
    });

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'response',
      result: result1,
      serverName: 'calculator-server',
      direction: 'server-to-client',
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'request',
      method: 'tools/call',
      params: { name: 'multiply', arguments: { a: 4, b: 7 } },
      serverName: 'calculator-server',
      direction: 'client-to-server',
    });

    const result2 = await server.client.callTool({
      name: 'multiply',
      arguments: { a: 4, b: 7 },
    });

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'response',
      result: result2,
      serverName: 'calculator-server',
      direction: 'server-to-client',
    });
  }

  private async demoFileOperations() {
    const server = this.servers.get('file-server');
    if (!server || !server.connected) return;

    // Manually create messages for demo
    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'request',
      method: 'tools/call',
      params: { name: 'list_files', arguments: {} },
      serverName: 'file-server',
      direction: 'client-to-server',
    });

    const result1 = await server.client.callTool({
      name: 'list_files',
      arguments: {},
    });

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'response',
      result: result1,
      serverName: 'file-server',
      direction: 'server-to-client',
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'request',
      method: 'tools/call',
      params: { name: 'read_file', arguments: { filename: 'readme.txt' } },
      serverName: 'file-server',
      direction: 'client-to-server',
    });

    const result2 = await server.client.callTool({
      name: 'read_file',
      arguments: { filename: 'readme.txt' },
    });

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'response',
      result: result2,
      serverName: 'file-server',
      direction: 'server-to-client',
    });
  }

  private async demoNotes() {
    const server = this.servers.get('notes-server');
    if (!server || !server.connected) return;

    // Manually create messages for demo
    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'request',
      method: 'tools/call',
      params: { name: 'list_notes', arguments: { limit: 3 } },
      serverName: 'notes-server',
      direction: 'client-to-server',
    });

    const result1 = await server.client.callTool({
      name: 'list_notes',
      arguments: { limit: 3 },
    });

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'response',
      result: result1,
      serverName: 'notes-server',
      direction: 'server-to-client',
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'request',
      method: 'tools/call',
      params: { 
        name: 'create_note', 
        arguments: { 
          title: 'Demo Note', 
          content: 'This note was created via MCP protocol!',
          tags: ['demo', 'mcp']
        }
      },
      serverName: 'notes-server',
      direction: 'client-to-server',
    });

    const result2 = await server.client.callTool({
      name: 'create_note',
      arguments: { 
        title: 'Demo Note', 
        content: 'This note was created via MCP protocol!',
        tags: ['demo', 'mcp']
      },
    });

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'response',
      result: result2,
      serverName: 'notes-server',
      direction: 'server-to-client',
    });
  }

  private async demoWeather() {
    const server = this.servers.get('weather-server');
    if (!server || !server.connected) return;

    // Manually create messages for demo
    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'request',
      method: 'tools/call',
      params: { name: 'get_weather', arguments: { location: 'San Francisco, CA' } },
      serverName: 'weather-server',
      direction: 'client-to-server',
    });

    const result1 = await server.client.callTool({
      name: 'get_weather',
      arguments: { location: 'San Francisco, CA' },
    });

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'response',
      result: result1,
      serverName: 'weather-server',
      direction: 'server-to-client',
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'request',
      method: 'tools/call',
      params: { 
        name: 'compare_weather', 
        arguments: { 
          location1: 'San Francisco, CA',
          location2: 'New York, NY'
        }
      },
      serverName: 'weather-server',
      direction: 'client-to-server',
    });

    const result2 = await server.client.callTool({
      name: 'compare_weather',
      arguments: { 
        location1: 'San Francisco, CA',
        location2: 'New York, NY'
      },
    });

    this.logMessage({
      id: (++this.messageIdCounter).toString(),
      timestamp: Date.now(),
      type: 'response',
      result: result2,
      serverName: 'weather-server',
      direction: 'server-to-client',
    });
  }
}

const client = new MCPClient();
client.start().catch(console.error);