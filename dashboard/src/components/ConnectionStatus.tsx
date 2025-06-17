import React from 'react';

interface Props {
  connected: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  onManualReconnect?: () => void;
}

export const ConnectionStatus: React.FC<Props> = ({ 
  connected, 
  reconnectAttempts, 
  maxReconnectAttempts,
  onManualReconnect
}) => {
  const getStatusColor = () => {
    if (connected) return 'bg-green-500';
    if (reconnectAttempts > 0 && reconnectAttempts < maxReconnectAttempts) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (connected) return 'Connected to MCP Client';
    if (reconnectAttempts > 0 && reconnectAttempts < maxReconnectAttempts) {
      return `Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`;
    }
    return 'Disconnected from MCP Client';
  };

  return (
    <div className={`p-4 rounded-lg mb-6 ${
      connected ? 'bg-green-50 border border-green-200' :
      reconnectAttempts > 0 ? 'bg-yellow-50 border border-yellow-200' :
      'bg-red-50 border border-red-200'
    }`}>
      <div className="flex items-center">
        <div className={`w-3 h-3 rounded-full ${getStatusColor()} mr-3`} />
        <span className={`font-medium ${
          connected ? 'text-green-800' :
          reconnectAttempts > 0 ? 'text-yellow-800' :
          'text-red-800'
        }`}>
          {getStatusText()}
        </span>
      </div>
      
      {!connected && (
        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-red-600">
            {reconnectAttempts >= maxReconnectAttempts 
              ? 'Connection failed. Check if MCP client is running.'
              : 'Make sure the MCP client is running on port 8081'
            }
          </p>
          {onManualReconnect && (
            <button
              onClick={onManualReconnect}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
            >
              Retry Connection
            </button>
          )}
        </div>
      )}
    </div>
  );
};