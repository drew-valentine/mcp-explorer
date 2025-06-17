import React, { useState, useEffect } from 'react';
import { ServerStatus } from '../hooks/useWebSocket';

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

interface Props {
  servers: ServerStatus[];
  onAddServer: (config: ServerConfig) => Promise<void>;
  onRemoveServer: (serverId: string) => Promise<void>;
  onTestConnection: (config: ServerConfig) => Promise<boolean>;
  onToggleServer: (serverId: string, enabled: boolean) => Promise<void>;
  onGetServerConfigs: () => Promise<ServerConfig[]>;
}

export const ServerManager: React.FC<Props> = ({
  servers,
  onAddServer,
  onRemoveServer,
  onTestConnection,
  onToggleServer,
  onGetServerConfigs,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [serverConfigs, setServerConfigs] = useState<ServerConfig[]>([]);
  const [formData, setFormData] = useState<Partial<ServerConfig>>({
    name: '',
    description: '',
    connectionType: 'stdio',
    command: '',
    args: [],
    enabled: true,
    isBuiltIn: false,
  });
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Load server configurations from client on mount
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const configs = await onGetServerConfigs();
        console.log('Loaded server configurations from client:', configs);
        setServerConfigs(configs);
      } catch (error) {
        console.error('Failed to load server configurations:', error);
      }
    };

    loadConfigs();
  }, [onGetServerConfigs]);


  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      errors.name = 'Server name is required';
    } else if (serverConfigs.some(s => s.name.toLowerCase() === formData.name?.toLowerCase())) {
      errors.name = 'Server name already exists';
    }

    if (formData.connectionType === 'stdio') {
      if (!formData.command?.trim()) {
        errors.command = 'Command is required for stdio connection';
      }
    } else if (formData.connectionType === 'websocket' || formData.connectionType === 'sse') {
      if (!formData.url?.trim()) {
        errors.url = 'URL is required for WebSocket/SSE connection';
      } else if (!formData.url.match(/^https?:\/\/.+/)) {
        errors.url = 'URL must start with http:// or https://';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const config: ServerConfig = {
      id: `custom-${Date.now()}`,
      name: formData.name!,
      description: formData.description || '',
      connectionType: formData.connectionType!,
      command: formData.command,
      args: formData.args || [],
      url: formData.url,
      enabled: formData.enabled!,
      isBuiltIn: false,
    };

    try {
      await onAddServer(config);
      setServerConfigs(prev => [...prev, config]);
      setFormData({
        name: '',
        description: '',
        connectionType: 'stdio',
        command: '',
        args: [],
        enabled: true,
        isBuiltIn: false,
      });
      setShowAddForm(false);
      setFormErrors({});
    } catch (error) {
      setFormErrors({ general: error instanceof Error ? error.message : 'Failed to add server' });
    }
  };

  const handleTestConnection = async (config: ServerConfig) => {
    setTestingConnection(config.id);
    try {
      const success = await onTestConnection(config);
      if (!success) {
        alert('Connection test failed');
      } else {
        alert('Connection test successful!');
      }
    } catch (error) {
      alert(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTestingConnection(null);
    }
  };

  const handleRemoveServer = async (config: ServerConfig) => {
    if (config.isBuiltIn) {
      alert('Cannot remove built-in servers');
      return;
    }

    if (confirm(`Are you sure you want to remove "${config.name}"?`)) {
      try {
        await onRemoveServer(config.name);
        setServerConfigs(prev => prev.filter(s => s.id !== config.id));
      } catch (error) {
        alert(`Failed to remove server: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleToggleServer = async (config: ServerConfig) => {
    try {
      const newEnabled = !config.enabled;
      await onToggleServer(config.name, newEnabled);
      setServerConfigs(prev => prev.map(s => 
        s.id === config.id ? { ...s, enabled: newEnabled } : s
      ));
    } catch (error) {
      alert(`Failed to toggle server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getServerStatus = (config: ServerConfig) => {
    const status = servers.find(s => s.name === config.name);
    return status?.connected ? 'connected' : config.enabled ? 'disconnected' : 'disabled';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600 bg-green-100';
      case 'disconnected': return 'text-red-600 bg-red-100';
      case 'disabled': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const connectionTypeOptions = [
    { value: 'stdio', label: 'Standard I/O (stdio)', description: 'Run as subprocess with stdin/stdout' },
    { value: 'websocket', label: 'WebSocket', description: 'Connect via WebSocket URL' },
    { value: 'sse', label: 'Server-Sent Events', description: 'Connect via SSE endpoint' },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold flex items-center">
            <span className="mr-2">🔧</span>
            MCP Server Management
          </h2>
          <p className="text-gray-600 text-sm mt-1">
            Manage and configure Model Context Protocol servers
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center space-x-2"
        >
          <span>➕</span>
          <span>Add Server</span>
        </button>
      </div>

      {/* Add Server Form */}
      {showAddForm && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-4">Add New MCP Server</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formErrors.general && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {formErrors.general}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Server Name *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="my-custom-server"
                />
                {formErrors.name && <p className="text-red-600 text-xs mt-1">{formErrors.name}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="What does this server do?"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Connection Type *
              </label>
              <select
                value={formData.connectionType}
                onChange={(e) => setFormData(prev => ({ ...prev, connectionType: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {connectionTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-gray-500 text-xs mt-1">
                {connectionTypeOptions.find(o => o.value === formData.connectionType)?.description}
              </p>
            </div>

            {formData.connectionType === 'stdio' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Command *
                    </label>
                    <input
                      type="text"
                      value={formData.command || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, command: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.command ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="node, python, docker, ./my-server, etc."
                    />
                    {formErrors.command && <p className="text-red-600 text-xs mt-1">{formErrors.command}</p>}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Arguments
                    </label>
                    <input
                      type="text"
                      value={formData.args?.join(' ') || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        args: e.target.value.split(' ').filter(arg => arg.trim()) 
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="server.js --port 3000 (or: run -i --rm mcp/time for Docker)"
                    />
                    <p className="text-gray-500 text-xs mt-1">Space-separated arguments</p>
                  </div>
                </div>
                
                {/* Docker Examples */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">📦 Docker Examples:</h4>
                  <div className="space-y-1 text-xs text-blue-800">
                    <div>
                      <strong>Command:</strong> <code>docker</code> | 
                      <strong> Arguments:</strong> <code>run -i --rm mcp/time</code>
                    </div>
                    <div>
                      <strong>Command:</strong> <code>docker</code> | 
                      <strong> Arguments:</strong> <code>run -it --rm mcp/postgres --connection-string postgresql://...</code>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-blue-700">
                    💡 <strong>Tip:</strong> Ensure Docker is installed and running. Use <code>-i</code> flag for interactive stdin.
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Server URL *
                </label>
                <input
                  type="url"
                  value={formData.url || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.url ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="http://localhost:3000/mcp or ws://localhost:3000/mcp"
                />
                {formErrors.url && <p className="text-red-600 text-xs mt-1">{formErrors.url}</p>}
              </div>
            )}

            <div className="flex items-center justify-between pt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Enable automatically</span>
              </label>
              
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add Server
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Server List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900">Configured Servers ({serverConfigs.length})</h3>
        
        {serverConfigs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No servers configured</p>
            <p className="text-sm mt-1">Add your first MCP server to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {serverConfigs.map(config => {
              const status = getServerStatus(config);
              const serverInfo = servers.find(s => s.name === config.name);
              
              return (
                <div key={config.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="font-medium text-gray-900">{config.name}</h4>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(status)}`}>
                          {status}
                        </span>
                        {config.isBuiltIn && (
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                            Built-in
                          </span>
                        )}
                      </div>
                      
                      <p className="text-gray-600 text-sm mb-2">{config.description}</p>
                      
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>Type: {config.connectionType}</span>
                        {config.connectionType === 'stdio' ? (
                          <span>Command: {config.command} {config.args?.join(' ')}</span>
                        ) : (
                          <span>URL: {config.url}</span>
                        )}
                        {serverInfo && (
                          <>
                            <span>Tools: {serverInfo.tools}</span>
                            <span>Resources: {serverInfo.resources}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleTestConnection(config)}
                        disabled={testingConnection === config.id}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                      >
                        {testingConnection === config.id ? 'Testing...' : 'Test'}
                      </button>
                      
                      <button
                        onClick={() => handleToggleServer(config)}
                        className={`px-3 py-1 text-sm rounded ${
                          config.enabled 
                            ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {config.enabled ? 'Disable' : 'Enable'}
                      </button>
                      
                      {!config.isBuiltIn && (
                        <button
                          onClick={() => handleRemoveServer(config)}
                          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};