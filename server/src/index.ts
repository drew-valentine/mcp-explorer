#!/usr/bin/env node

import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';

const PORT = 8080;

interface ServerConfig {
  name: string;
  script: string;
  description: string;
}

const servers: ServerConfig[] = [
  {
    name: 'file-server',
    script: './dist/file-server.js',
    description: 'File system resource and tool server',
  },
  {
    name: 'calculator-server', 
    script: './dist/calculator-server.js',
    description: 'Calculator tool server',
  },
  {
    name: 'notes-server',
    script: './dist/notes-server.js',
    description: 'Note-taking server with SQLite persistence',
  },
  {
    name: 'weather-server',
    script: './dist/weather-server.js',
    description: 'Weather data and forecast server',
  },
];

class MCPServerManager {
  private wss: WebSocketServer;
  private activeServers: Map<string, any> = new Map();

  constructor() {
    this.wss = new WebSocketServer({ port: PORT });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws) => {
      console.log('Dashboard connected');

      // Send initial server status
      ws.send(JSON.stringify({
        type: 'server-status',
        data: this.getServerStatus(),
      }));

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Dashboard disconnected');
      });
    });
  }

  private handleWebSocketMessage(ws: any, data: any) {
    switch (data.type) {
      case 'get-server-status':
        ws.send(JSON.stringify({
          type: 'server-status',
          data: this.getServerStatus(),
        }));
        break;
      
      case 'start-server':
        this.startServer(data.serverName);
        break;
      
      case 'stop-server':
        this.stopServer(data.serverName);
        break;
    }
  }

  private getServerStatus() {
    return servers.map(server => ({
      name: server.name,
      description: server.description,
      running: this.activeServers.has(server.name),
    }));
  }

  private startServer(serverName: string) {
    const serverConfig = servers.find(s => s.name === serverName);
    if (!serverConfig || this.activeServers.has(serverName)) {
      return;
    }

    console.log(`Starting ${serverName}...`);
    
    const serverProcess = spawn('node', [serverConfig.script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    serverProcess.stdout?.on('data', (data) => {
      console.log(`[${serverName}] ${data}`);
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error(`[${serverName}] ${data}`);
    });

    serverProcess.on('close', (code) => {
      console.log(`${serverName} exited with code ${code}`);
      this.activeServers.delete(serverName);
      this.broadcastServerStatus();
    });

    this.activeServers.set(serverName, serverProcess);
    this.broadcastServerStatus();
  }

  private stopServer(serverName: string) {
    const serverProcess = this.activeServers.get(serverName);
    if (serverProcess) {
      console.log(`Stopping ${serverName}...`);
      serverProcess.kill();
      this.activeServers.delete(serverName);
      this.broadcastServerStatus();
    }
  }

  private broadcastServerStatus() {
    const status = this.getServerStatus();
    const message = JSON.stringify({
      type: 'server-status',
      data: status,
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  start() {
    console.log(`MCP Server Manager running on port ${PORT}`);
    console.log('Available servers:', servers.map(s => s.name).join(', '));
    
    // Auto-start all servers for demo
    setTimeout(() => {
      servers.forEach(server => this.startServer(server.name));
    }, 1000);
  }
}

const manager = new MCPServerManager();
manager.start();