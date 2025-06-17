import React, { useState } from 'react';
import { ServerStatus } from '../hooks/useWebSocket';

interface Props {
  servers: ServerStatus[];
  onExecuteTool: (serverName: string, toolName: string, params: any) => Promise<any>;
  onListResources: (serverName: string) => Promise<any>;
  onReadResource: (serverName: string, uri: string) => Promise<any>;
  onListTools: (serverName: string) => Promise<any>;
}

interface ToolResult {
  serverName: string;
  toolName: string;
  params: any;
  result?: any;
  error?: string;
  timestamp: number;
}

interface ResourceList {
  serverName: string;
  resources?: any[];
  error?: string;
  timestamp: number;
}


interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export const ResourceBrowser: React.FC<Props> = ({
  servers,
  onExecuteTool,
  onListResources,
  onReadResource: _onReadResource,
  onListTools,
}) => {
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [customParams, setCustomParams] = useState<string>('{}');
  const [customTool, setCustomTool] = useState<string>('');
  const [serverTools, setServerTools] = useState<Record<string, MCPTool[]>>({});
  const [toolsLoading, setToolsLoading] = useState<Record<string, boolean>>({});
  const [resourcesLoading, setResourcesLoading] = useState<Record<string, boolean>>({});
  const [executingTools, setExecutingTools] = useState<Record<string, boolean>>({});
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [resourceLists, setResourceLists] = useState<ResourceList[]>([]);

  const fetchServerTools = async (serverName: string) => {
    if (toolsLoading[serverName]) return;
    
    setToolsLoading(prev => ({ ...prev, [serverName]: true }));
    
    try {
      const result = await onListTools(serverName);
      if (result && result.tools) {
        setServerTools(prev => ({
          ...prev,
          [serverName]: result.tools
        }));
      }
    } catch (error) {
      console.warn(`Failed to fetch tools for ${serverName}:`, error);
    } finally {
      setToolsLoading(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const handleListResources = async (serverName: string) => {
    if (resourcesLoading[serverName]) return;
    
    setResourcesLoading(prev => ({ ...prev, [serverName]: true }));
    
    try {
      const result = await onListResources(serverName);
      setResourceLists(prev => [{
        serverName,
        resources: result?.resources || [],
        timestamp: Date.now()
      }, ...prev.filter(r => r.serverName !== serverName).slice(0, 4)]); // Keep last 5 lists
    } catch (error) {
      setResourceLists(prev => [{
        serverName,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      }, ...prev.filter(r => r.serverName !== serverName).slice(0, 4)]);
    } finally {
      setResourcesLoading(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const handleExecuteSampleTool = async (serverName: string, toolName: string, params: any) => {
    const toolKey = `${serverName}-${toolName}`;
    setExecutingTools(prev => ({ ...prev, [toolKey]: true }));
    
    try {
      const result = await onExecuteTool(serverName, toolName, params);
      setToolResults(prev => [{
        serverName,
        toolName,
        params,
        result,
        timestamp: Date.now()
      }, ...prev.slice(0, 9)]); // Keep last 10 results
    } catch (error) {
      setToolResults(prev => [{
        serverName,
        toolName,
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      }, ...prev.slice(0, 9)]);
    } finally {
      setExecutingTools(prev => ({ ...prev, [toolKey]: false }));
    }
  };

  const generateSampleParams = (tool: MCPTool): any => {
    const schema = tool.inputSchema;
    if (!schema || !schema.properties) return {};
    
    const params: any = {};
    Object.keys(schema.properties).forEach(key => {
      const prop = schema.properties[key];
      switch (prop.type) {
        case 'string':
          params[key] = prop.description?.includes('location') ? 'San Francisco, CA' : 'sample';
          break;
        case 'number':
          params[key] = 42;
          break;
        case 'boolean':
          params[key] = true;
          break;
        case 'array':
          params[key] = ['demo'];
          break;
        default:
          params[key] = 'sample';
      }
    });
    return params;
  };

  const handleExecuteCustomTool = async () => {
    if (!selectedServer || !customTool) return;
    
    const toolKey = `${selectedServer}-${customTool}`;
    setExecutingTools(prev => ({ ...prev, [toolKey]: true }));
    
    try {
      const params = JSON.parse(customParams);
      const result = await onExecuteTool(selectedServer, customTool, params);
      setToolResults(prev => [{
        serverName: selectedServer,
        toolName: customTool,
        params,
        result,
        timestamp: Date.now()
      }, ...prev.slice(0, 9)]);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setToolResults(prev => [{
          serverName: selectedServer,
          toolName: customTool,
          params: customParams,
          error: 'Invalid JSON parameters',
          timestamp: Date.now()
        }, ...prev.slice(0, 9)]);
      } else {
        setToolResults(prev => [{
          serverName: selectedServer,
          toolName: customTool,
          params: customParams,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        }, ...prev.slice(0, 9)]);
      }
    } finally {
      setExecutingTools(prev => ({ ...prev, [toolKey]: false }));
    }
  };

  const connectedServers = servers.filter(s => s.connected);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <span className="mr-2">🔧</span>
        Tool & Resource Browser
      </h3>
      
      {connectedServers.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <p>No connected servers</p>
          <p className="text-sm mt-1">Start the MCP client to interact with servers</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick Actions */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Quick Actions</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connectedServers.map(server => (
                <div key={server.name} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="font-medium">{server.name}</h5>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleListResources(server.name)}
                        disabled={resourcesLoading[server.name]}
                        className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        {resourcesLoading[server.name] ? '⟳' : '📂'} Resources
                      </button>
                      <button
                        onClick={() => fetchServerTools(server.name)}
                        disabled={toolsLoading[server.name]}
                        className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200 disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        {toolsLoading[server.name] ? '⟳' : '🔧'} Tools
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {serverTools[server.name] ? (
                      serverTools[server.name].map((tool: MCPTool, index: number) => {
                        const sampleParams = generateSampleParams(tool);
                        return (
                          <div key={index} className="flex items-center justify-between text-sm py-1">
                            <div className="flex-1 min-w-0 mr-2">
                              <div className="flex items-center space-x-2">
                                <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{tool.name}</code>
                                <span className="text-gray-600 text-xs truncate">
                                  {tool.description || 'No description'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 mt-1 font-mono truncate">
                                {JSON.stringify(sampleParams).length > 40 
                                  ? JSON.stringify(sampleParams).substring(0, 40) + '...}'
                                  : JSON.stringify(sampleParams)
                                }
                              </div>
                            </div>
                            <button
                              onClick={() => handleExecuteSampleTool(server.name, tool.name, sampleParams)}
                              disabled={executingTools[`${server.name}-${tool.name}`]}
                              className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs hover:bg-green-200 disabled:bg-gray-100 disabled:text-gray-400 flex-shrink-0"
                            >
                              {executingTools[`${server.name}-${tool.name}`] ? '⟳' : '▶️'}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-gray-500 py-2 text-sm">
                        <p>Click "🔧 Tools" to load available tools</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Tool Execution */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Custom Tool Execution</h4>
            <div className="border rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Server
                  </label>
                  <select
                    value={selectedServer}
                    onChange={(e) => setSelectedServer(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a server</option>
                    {connectedServers.map(server => (
                      <option key={server.name} value={server.name}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tool Name
                  </label>
                  <input
                    type="text"
                    value={customTool}
                    onChange={(e) => setCustomTool(e.target.value)}
                    placeholder="e.g. add, get_weather, create_note"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parameters (JSON)
                </label>
                <textarea
                  value={customParams}
                  onChange={(e) => setCustomParams(e.target.value)}
                  rows={3}
                  placeholder='{"param1": "value1", "param2": 123}'
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <button
                onClick={handleExecuteCustomTool}
                disabled={!selectedServer || !customTool || executingTools[`${selectedServer}-${customTool}`]}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {executingTools[`${selectedServer}-${customTool}`] ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Executing...</span>
                  </>
                ) : (
                  <span>Execute Tool</span>
                )}
              </button>
            </div>
          </div>

          {/* Tool Results */}
          {toolResults.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Recent Tool Results</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {toolResults.map((result, index) => (
                  <div key={index} className={`p-3 rounded border ${
                    result.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-sm">{result.serverName}</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">{result.toolName}</code>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    <div className="text-xs space-y-1">
                      <div className="text-gray-600">
                        <strong>Params:</strong> <code className="bg-gray-100 px-1 rounded">{JSON.stringify(result.params)}</code>
                      </div>
                      
                      {result.error ? (
                        <div className="text-red-700">
                          <strong>Error:</strong> {result.error}
                        </div>
                      ) : (
                        <div className="text-green-700">
                          <strong>Result:</strong>
                          <pre className="bg-white p-2 rounded border mt-1 text-xs overflow-x-auto">
                            {JSON.stringify(result.result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resource Lists */}
          {resourceLists.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Recent Resource Lists</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {resourceLists.map((resourceList, index) => (
                  <div key={index} className={`p-3 rounded border ${
                    resourceList.error ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{resourceList.serverName}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(resourceList.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    {resourceList.error ? (
                      <div className="text-red-700 text-sm">
                        <strong>Error:</strong> {resourceList.error}
                      </div>
                    ) : (
                      <div className="text-sm">
                        <strong>Resources ({resourceList.resources?.length || 0}):</strong>
                        {resourceList.resources && resourceList.resources.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {resourceList.resources.map((resource: any, idx: number) => (
                              <div key={idx} className="bg-white p-2 rounded border text-xs">
                                <div className="font-medium">{resource.name || resource.uri}</div>
                                {resource.description && (
                                  <div className="text-gray-600">{resource.description}</div>
                                )}
                                {resource.mimeType && (
                                  <div className="text-gray-500">Type: {resource.mimeType}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-gray-500 mt-1">No resources found</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};