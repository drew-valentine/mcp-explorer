import React from 'react';
import { MCPMessage } from '../hooks/useWebSocket';

interface Props {
  message?: MCPMessage;
  onClose: () => void;
}

export const MessageInspector: React.FC<Props> = ({ message, onClose }) => {
  if (!message) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <span className="mr-2">🔍</span>
          Message Inspector
        </h2>
        <div className="text-center text-gray-500 py-8">
          <p>Select a message from the flow to inspect its details</p>
        </div>
      </div>
    );
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
      iso: date.toISOString(),
    };
  };

  const timestamp = formatTimestamp(message.timestamp);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-xl font-semibold flex items-center">
          <span className="mr-2">🔍</span>
          Message Inspector
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl"
        >
          ×
        </button>
      </div>
      
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Metadata */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Metadata</h3>
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium text-gray-500">ID:</span>
                <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-sm">{message.id}</code>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Type:</span>
                <span className={`ml-2 px-2 py-1 rounded text-sm ${
                  message.type === 'request' ? 'bg-blue-100 text-blue-800' :
                  message.type === 'response' ? 'bg-green-100 text-green-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {message.type}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Server:</span>
                <span className="ml-2 bg-gray-100 px-2 py-1 rounded text-sm">{message.serverName}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Direction:</span>
                <span className={`ml-2 px-2 py-1 rounded text-sm ${
                  message.direction === 'client-to-server' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {message.direction}
                </span>
              </div>
              {message.method && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Method:</span>
                  <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-sm">{message.method}</code>
                </div>
              )}
            </div>
          </div>

          {/* Timestamp */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Timestamp</h3>
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium text-gray-500">Date:</span>
                <span className="ml-2 text-sm">{timestamp.date}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Time:</span>
                <span className="ml-2 text-sm">{timestamp.time}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">ISO:</span>
                <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs">{timestamp.iso}</code>
              </div>
            </div>
          </div>
        </div>

        {/* Params */}
        {message.params && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-900 mb-3">Parameters</h3>
            <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(message.params, null, 2)}
            </pre>
          </div>
        )}

        {/* Result */}
        {message.result && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-900 mb-3">Result</h3>
            <pre className="bg-green-50 p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(message.result, null, 2)}
            </pre>
          </div>
        )}

        {/* Error */}
        {message.error && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-900 mb-3">Error</h3>
            <pre className="bg-red-50 p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(message.error, null, 2)}
            </pre>
          </div>
        )}

        {/* Raw JSON */}
        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 mb-3">Raw JSON</h3>
          <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
            {JSON.stringify(message, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};