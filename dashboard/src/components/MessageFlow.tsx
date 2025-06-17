import React, { useMemo } from 'react';
import { MCPMessage } from '../hooks/useWebSocket';

interface MessagePair {
  id: string;
  request: MCPMessage;
  response?: MCPMessage;
  timestamp: number;
  serverName: string;
}

interface Props {
  messages: MCPMessage[];
  selectedMessage?: MCPMessage;
  onMessageSelect: (message: MCPMessage) => void;
}

export const MessageFlow: React.FC<Props> = ({ messages, selectedMessage, onMessageSelect }) => {
  const messagePairs = useMemo(() => {
    const pairs: MessagePair[] = [];
    const requestsById = new Map<string, MCPMessage>();
    const responsesById = new Map<string, MCPMessage>();
    
    // First pass: organize messages by ID and type
    messages.forEach(message => {
      if (message.type === 'request') {
        requestsById.set(message.id, message);
      } else if (message.type === 'response') {
        responsesById.set(message.id, message);
      }
    });
    
    // Second pass: create pairs using proper ID correlation
    messages.forEach(message => {
      if (message.type === 'request') {
        // Look for response with same ID (MCP protocol correlation)
        const response = responsesById.get(message.id);
        
        pairs.push({
          id: message.id,
          request: message,
          response: response,
          timestamp: message.timestamp,
          serverName: message.serverName
        });
      } else if (message.type === 'response') {
        // Only create standalone response pairs if no matching request exists
        const request = requestsById.get(message.id);
        if (!request) {
          pairs.push({
            id: message.id,
            request: message as any, // Treat response as standalone item
            response: undefined,
            timestamp: message.timestamp,
            serverName: message.serverName
          });
        }
      } else {
        // Handle notifications as standalone items
        pairs.push({
          id: message.id,
          request: message,
          response: undefined,
          timestamp: message.timestamp,
          serverName: message.serverName
        });
      }
    });
    
    // Remove duplicates and sort by timestamp, newest first
    const uniquePairs = Array.from(new Map(pairs.map(p => [p.id, p])).values());
    return uniquePairs.slice(-20).reverse();
  }, [messages]);

  const getPairIcon = (pair: MessagePair) => {
    const request = pair.request;
    if (request.type === 'request') {
      if (pair.response) {
        return pair.response.error ? '❌' : '✅';
      }
      return request.direction === 'client-to-server' ? '📤' : '⏳';
    } else if (request.type === 'response') {
      return request.error ? '❌' : '✅';
    } else {
      return '📢';
    }
  };

  const getPairColor = (pair: MessagePair) => {
    const request = pair.request;
    if (request.type === 'request') {
      if (pair.response) {
        return pair.response.error 
          ? 'border-red-200 bg-red-50' 
          : 'border-green-200 bg-green-50';
      }
      return request.direction === 'client-to-server' 
        ? 'border-blue-200 bg-blue-50' 
        : 'border-purple-200 bg-purple-50';
    } else if (request.type === 'response') {
      return request.error 
        ? 'border-red-200 bg-red-50' 
        : 'border-green-200 bg-green-50';
    } else {
      return 'border-yellow-200 bg-yellow-50';
    }
  };

  const getPairTitle = (pair: MessagePair) => {
    const request = pair.request;
    if (request.type === 'request') {
      const method = request.method || 'Unknown Method';
      if (pair.response) {
        return pair.response.error ? `${method} (Error)` : `${method} (Success)`;
      }
      return `${method} (${request.direction})`;
    } else if (request.type === 'response') {
      return request.error ? 'Error Response' : 'Success Response';
    } else {
      return 'Notification';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <span className="mr-2">🔄</span>
        Message Flow
        <span className="ml-2 text-sm text-gray-500">({messages.length} total)</span>
      </h2>
      
      <div className="space-y-2 max-h-[70vh] overflow-y-auto">
        {messagePairs.map((pair) => {
          const isSelected = selectedMessage?.id === pair.request.id || (pair.response && selectedMessage?.id === pair.response.id);
          return (
            <div
              key={pair.id}
              className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
                getPairColor(pair)
              } ${
                isSelected ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => onMessageSelect(pair.request)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <span>{getPairIcon(pair)}</span>
                  <span className="font-medium text-sm">{getPairTitle(pair)}</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span className="bg-gray-100 px-2 py-1 rounded">{pair.serverName}</span>
                  <span>{new Date(pair.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
              
              {pair.request.method && (
                <div className="text-sm text-gray-600 mb-1">
                  Method: <code className="bg-gray-100 px-1 rounded">{pair.request.method}</code>
                </div>
              )}
              
              {pair.request.params && (
                <div className="text-sm text-gray-600 mb-1">
                  Params: <code className="bg-gray-100 px-1 rounded text-xs">
                    {JSON.stringify(pair.request.params).substring(0, 100)}
                    {JSON.stringify(pair.request.params).length > 100 ? '...' : ''}
                  </code>
                </div>
              )}
              
              {pair.response && pair.response.result && (
                <div className="text-sm text-gray-600 mb-1">
                  Result: <code className="bg-gray-100 px-1 rounded text-xs">
                    {JSON.stringify(pair.response.result).substring(0, 100)}
                    {JSON.stringify(pair.response.result).length > 100 ? '...' : ''}
                  </code>
                </div>
              )}
              
              {pair.response && pair.response.error && (
                <div className="text-sm text-red-600 mb-1">
                  Error: <code className="bg-red-100 px-1 rounded text-xs">
                    {JSON.stringify(pair.response.error).substring(0, 100)}
                    {JSON.stringify(pair.response.error).length > 100 ? '...' : ''}
                  </code>
                </div>
              )}
              
              {pair.request.error && (
                <div className="text-sm text-red-600 mb-1">
                  Error: <code className="bg-red-100 px-1 rounded text-xs">
                    {JSON.stringify(pair.request.error).substring(0, 100)}
                    {JSON.stringify(pair.request.error).length > 100 ? '...' : ''}
                  </code>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {messages.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          <p>No messages yet</p>
          <p className="text-sm mt-1">Messages will appear here as MCP operations occur</p>
        </div>
      )}
      
      {messages.length > 20 && (
        <div className="mt-4 text-sm text-gray-500 text-center">
          Showing last 20 of {messages.length} messages
        </div>
      )}
    </div>
  );
};