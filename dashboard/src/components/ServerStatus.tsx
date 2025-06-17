import React from 'react';
import { ServerStatus as ServerStatusType } from '../hooks/useWebSocket';

interface Props {
  servers: ServerStatusType[];
  onServerClick: (serverName: string) => void;
}

export const ServerStatus: React.FC<Props> = ({ servers, onServerClick }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <span className="mr-2">🖥️</span>
        MCP Servers
        <span className="ml-2 text-sm text-gray-500">({servers.length} servers)</span>
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {servers.map((server) => (
          <div
            key={server.name}
            className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
              server.connected 
                ? 'border-green-200 bg-green-50 hover:bg-green-100' 
                : 'border-red-200 bg-red-50 hover:bg-red-100'
            }`}
            onClick={() => onServerClick(server.name)}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900">{server.name}</h3>
              <div className={`w-3 h-3 rounded-full ${
                server.connected ? 'bg-green-500' : 'bg-red-500'
              }`} />
            </div>
            
            {server.description && (
              <p className="text-sm text-gray-600 mb-3">{server.description}</p>
            )}
            
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tools:</span>
                <span className="font-medium">{server.tools || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Resources:</span>
                <span className="font-medium">{server.resources || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Prompts:</span>
                <span className="font-medium">{server.prompts || 0}</span>
              </div>
            </div>
            
            {server.lastMessage && (
              <div className="mt-2 text-xs text-gray-400">
                Last: {new Date(server.lastMessage).toLocaleTimeString()}
              </div>
            )}
            
            <div className="mt-2">
              <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                server.connected 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {server.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {servers.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          <p>No servers detected</p>
          <p className="text-sm mt-1">Start the MCP client to see servers appear here</p>
        </div>
      )}
    </div>
  );
};