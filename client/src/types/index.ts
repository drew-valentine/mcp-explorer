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
}

export interface DashboardState {
  servers: ServerStatus[];
  messages: MCPMessage[];
  selectedMessage?: MCPMessage;
}