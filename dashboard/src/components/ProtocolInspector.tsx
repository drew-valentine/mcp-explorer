import React, { useState, useMemo } from 'react';
import { MCPMessage } from '../hooks/useWebSocket';
import { JSONEditor } from './JSONEditor';

interface Props {
  message?: MCPMessage;
  onClose: () => void;
  onSendMessage?: (message: any, serverName?: string) => Promise<any>;
  servers?: Array<{ name: string; connected: boolean }>;
  messages?: MCPMessage[];  // Added to find paired responses
}

export const ProtocolInspector: React.FC<Props> = ({ message, onClose, onSendMessage, servers = [], messages = [] }) => {
  const [activeTab, setActiveTab] = useState<'inspect' | 'compose'>('inspect');
  const [selectedServer, setSelectedServer] = useState<string>('calculator-server');
  const [newMessage, setNewMessage] = useState<any>({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/list',
    params: {}
  });
  const [lastResponse, setLastResponse] = useState<{
    request: any;
    response?: any;
    error?: string;
    status: 'pending' | 'success' | 'error';
    timestamp: number;
  } | null>(null);

  // Find paired response for the selected message using proper ID correlation
  const pairedResponse = useMemo(() => {
    if (!message || message.type !== 'request') return undefined;
    
    // Look for a response with the same ID (MCP protocol correlation)
    return messages.find(msg => 
      msg.type === 'response' &&
      msg.id === message.id
    );
  }, [message, messages]);

  // Helper functions for message inspection
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
      iso: date.toISOString(),
    };
  };

  const getMessageTypeInfo = (message: MCPMessage) => {
    if (message.type === 'request') {
      return {
        label: 'Request',
        icon: message.direction === 'client-to-server' ? '📤' : '📥',
        color: message.direction === 'client-to-server' ? 'blue' : 'purple'
      };
    } else if (message.type === 'response') {
      return {
        label: message.error ? 'Error Response' : 'Success Response',
        icon: message.error ? '❌' : '✅',
        color: message.error ? 'red' : 'green'
      };
    }
    return {
      label: 'Notification',
      icon: '📢',
      color: 'gray'
    };
  };

  const connectedServers = servers.filter(s => s.connected);

  const handleSendMessage = async () => {
    if (!onSendMessage) return;

    setLastResponse({
      request: newMessage,
      status: 'pending',
      timestamp: Date.now()
    });

    try {
      const response = await onSendMessage(newMessage, selectedServer);
      setLastResponse(prev => prev ? {
        ...prev,
        response,
        status: 'success',
        timestamp: Date.now()
      } : null);
    } catch (error) {
      setLastResponse(prev => prev ? {
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        timestamp: Date.now()
      } : null);
    }
  };

  const messageTemplates = [
    {
      name: 'List Tools',
      message: { jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} }
    },
    {
      name: 'List Resources',
      message: { jsonrpc: '2.0', id: Date.now(), method: 'resources/list', params: {} }
    },
    {
      name: 'Call Tool',
      message: { 
        jsonrpc: '2.0', 
        id: Date.now(), 
        method: 'tools/call', 
        params: { name: 'add', arguments: { a: 5, b: 3 } } 
      }
    },
    {
      name: 'Read Resource',
      message: { 
        jsonrpc: '2.0', 
        id: Date.now(), 
        method: 'resources/read', 
        params: { uri: 'file:///readme.txt' } 
      }
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center">
          <h2 className="text-xl font-semibold flex items-center mr-4">
            <span className="mr-2">🔬</span>
            Protocol Inspector
          </h2>
          
          {/* Tabs */}
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('inspect')}
              className={`px-3 py-1 text-sm rounded ${
                activeTab === 'inspect' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🔍 Inspect
            </button>
            <button
              onClick={() => setActiveTab('compose')}
              className={`px-3 py-1 text-sm rounded ${
                activeTab === 'compose' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              ✏️ Compose
            </button>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl"
        >
          ×
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'inspect' && (
          <div>
            {!message ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-lg mb-2">No message selected</p>
                <p className="text-sm">Select a message from the flow to inspect its details</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Request Overview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{getMessageTypeInfo(message).icon}</span>
                      <div>
                        <h3 className="font-semibold text-lg">{getMessageTypeInfo(message).label}</h3>
                        <p className="text-sm text-gray-600">
                          {message.serverName} • {formatTimestamp(message.timestamp).time}
                        </p>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium bg-${getMessageTypeInfo(message).color}-100 text-${getMessageTypeInfo(message).color}-800`}>
                      {message.direction || message.type}
                    </div>
                  </div>
                  
                  {message.method && (
                    <div className="mb-2">
                      <span className="text-sm font-medium text-gray-700">Method:</span>
                      <code className="ml-2 bg-white px-2 py-1 rounded text-sm">{message.method}</code>
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    <div>ID: {message.id}</div>
                    <div>Timestamp: {formatTimestamp(message.timestamp).iso}</div>
                  </div>
                  
                  {pairedResponse && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-lg">{pairedResponse.error ? '❌' : '✅'}</span>
                        <span className="text-sm font-medium text-gray-700">
                          {pairedResponse.error ? 'Error Response' : 'Success Response'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(pairedResponse.timestamp).time}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        <div>Response ID: {pairedResponse.id}</div>
                        <div>Response Time: {Math.abs(pairedResponse.timestamp - message.timestamp)}ms</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Request Content */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Request Details</h4>
                  <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto">
                    <pre className="text-sm">
                      {JSON.stringify({
                        id: message.id,
                        timestamp: message.timestamp,
                        type: message.type,
                        method: message.method,
                        params: message.params,
                        result: message.result,
                        error: message.error,
                        serverName: message.serverName,
                        direction: message.direction,
                      }, null, 2)}
                    </pre>
                  </div>
                </div>
                
                {/* Response Content */}
                {pairedResponse && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Response Details</h4>
                    <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto">
                      <pre className="text-sm">
                        {JSON.stringify({
                          id: pairedResponse.id,
                          timestamp: pairedResponse.timestamp,
                          type: pairedResponse.type,
                          method: pairedResponse.method,
                          params: pairedResponse.params,
                          result: pairedResponse.result,
                          error: pairedResponse.error,
                          serverName: pairedResponse.serverName,
                          direction: pairedResponse.direction,
                        }, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'compose' && (
          <div className="space-y-6">
            {/* Server Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Server
              </label>
              <select
                value={selectedServer}
                onChange={(e) => setSelectedServer(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {connectedServers.map(server => (
                  <option key={server.name} value={server.name}>
                    {server.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Message Templates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message Templates
              </label>
              <div className="grid grid-cols-2 gap-2">
                {messageTemplates.map((template, index) => (
                  <button
                    key={index}
                    onClick={() => setNewMessage({ ...template.message, id: Date.now() })}
                    className="p-2 text-sm border border-gray-200 rounded hover:bg-gray-50 text-left"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Editor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message Content
              </label>
              <JSONEditor 
                value={newMessage}
                onChange={setNewMessage}
                className="json-editor"
              />
            </div>

            {/* Send Button */}
            <div className="flex justify-between">
              <button
                onClick={() => setNewMessage({
                  jsonrpc: '2.0',
                  id: Date.now(),
                  method: 'tools/list',
                  params: {}
                })}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Reset Message
              </button>
              
              <button
                onClick={handleSendMessage}
                disabled={!onSendMessage || connectedServers.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Send Message
              </button>
            </div>

            {/* Response */}
            {lastResponse && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Response</h4>
                <div className={`p-4 rounded-lg border ${
                  lastResponse.status === 'pending' ? 'bg-yellow-50 border-yellow-200' :
                  lastResponse.status === 'success' ? 'bg-green-50 border-green-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-medium ${
                      lastResponse.status === 'pending' ? 'text-yellow-800' :
                      lastResponse.status === 'success' ? 'text-green-800' :
                      'text-red-800'
                    }`}>
                      {lastResponse.status === 'pending' ? '⏳ Pending...' :
                       lastResponse.status === 'success' ? '✅ Success' :
                       '❌ Error'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(lastResponse.timestamp).time}
                    </span>
                  </div>
                  
                  {lastResponse.status !== 'pending' && (
                    <pre className="text-sm bg-white p-3 rounded border overflow-auto">
                      {lastResponse.error ? 
                        lastResponse.error : 
                        JSON.stringify(lastResponse.response, null, 2)
                      }
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};