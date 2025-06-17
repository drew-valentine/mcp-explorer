import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ServerStatus } from '../hooks/useWebSocket';

interface Props {
  servers: ServerStatus[];
  onListTools?: (serverName: string) => Promise<any>;
  onListResources?: (serverName: string) => Promise<any>;
  onListPrompts?: (serverName: string) => Promise<any>;
  initialSelectedServer?: string;
}

interface Capability {
  type: 'tool' | 'resource' | 'prompt';
  name: string;
  description?: string;
  schema?: any;
  examples?: string[];
  uri?: string;
  mimeType?: string;
}

interface ServerCapabilities {
  tools: Capability[];
  resources: Capability[];
  prompts: Capability[];
  loading: boolean;
  error?: string;
  lastFetched?: number;
}

export const CapabilityExplorer: React.FC<Props> = ({ 
  servers, 
  onListTools, 
  onListResources, 
  onListPrompts,
  initialSelectedServer 
}) => {
  const [selectedServer, setSelectedServer] = useState<string>(initialSelectedServer || '');
  const [selectedCapability, setSelectedCapability] = useState<Capability | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [serverCapabilities, setServerCapabilities] = useState<Record<string, ServerCapabilities>>({});
  
  // Track ongoing requests to prevent duplicates
  const ongoingRequests = useRef<Set<string>>(new Set());

  // Update selected server when initialSelectedServer prop changes
  useEffect(() => {
    if (initialSelectedServer) {
      setSelectedServer(initialSelectedServer);
    }
  }, [initialSelectedServer]);

  // Fetch capabilities for a server
  const fetchServerCapabilities = useCallback(async (serverName: string) => {
    if (!serverName) return;
    
    // Prevent concurrent calls to the same server
    if (ongoingRequests.current.has(serverName)) {
      console.log(`⚠️ Skipping duplicate capability fetch for ${serverName}`);
      return;
    }
    
    // Mark request as ongoing
    ongoingRequests.current.add(serverName);
    console.log(`🔄 Starting capability fetch for ${serverName}`);
    
    setServerCapabilities(prev => ({
      ...prev,
      [serverName]: {
        ...prev[serverName],
        tools: prev[serverName]?.tools || [],
        resources: prev[serverName]?.resources || [],
        prompts: prev[serverName]?.prompts || [],
        loading: true,
        error: undefined
      }
    }));

    try {
      const capabilities: ServerCapabilities = {
        tools: [],
        resources: [],
        prompts: [],
        loading: false,
        lastFetched: Date.now()
      };

      // Fetch tools
      if (onListTools) {
        try {
          const toolsResult = await onListTools(serverName);
          if (toolsResult?.tools) {
            capabilities.tools = toolsResult.tools.map((tool: any) => ({
              type: 'tool' as const,
              name: tool.name,
              description: tool.description || '',
              schema: tool.inputSchema,
              examples: generateToolExamples(tool)
            }));
          }
        } catch (error) {
          console.warn(`Failed to fetch tools for ${serverName}:`, error);
        }
      }

      // Fetch resources
      if (onListResources) {
        try {
          const resourcesResult = await onListResources(serverName);
          if (resourcesResult?.resources) {
            capabilities.resources = resourcesResult.resources.map((resource: any) => ({
              type: 'resource' as const,
              name: resource.name || resource.uri,
              description: resource.description || `Resource: ${resource.name || resource.uri}`,
              uri: resource.uri,
              mimeType: resource.mimeType,
              examples: [resource.uri]
            }));
          }
        } catch (error) {
          console.warn(`Failed to fetch resources for ${serverName}:`, error);
        }
      }

      // Fetch prompts (if supported) - Note: Most MCP servers don't implement prompts yet
      if (onListPrompts) {
        try {
          const promptsResult = await onListPrompts(serverName);
          if (promptsResult?.prompts) {
            capabilities.prompts = promptsResult.prompts.map((prompt: any) => ({
              type: 'prompt' as const,
              name: prompt.name,
              description: prompt.description || '',
              schema: prompt.arguments,
              examples: generatePromptExamples(prompt)
            }));
          }
        } catch (error) {
          // Prompts are optional in MCP, so this is expected for most servers
          console.debug(`Prompts not supported by ${serverName}:`, error);
        }
      }

      setServerCapabilities(prev => ({
        ...prev,
        [serverName]: capabilities
      }));

    } catch (error) {
      setServerCapabilities(prev => ({
        ...prev,
        [serverName]: {
          tools: [],
          resources: [],
          prompts: [],
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch capabilities'
        }
      }));
    } finally {
      // Always remove from ongoing requests when done
      ongoingRequests.current.delete(serverName);
      console.log(`✅ Finished capability fetch for ${serverName}`);
    }
  }, [onListTools, onListResources, onListPrompts]);

  // Fetch capabilities when selected server changes
  useEffect(() => {
    if (selectedServer) {
      const serverData = serverCapabilities[selectedServer];
      const serverStatus = servers.find(s => s.name === selectedServer);
      
      console.log(`🔍 useEffect checking ${selectedServer}: lastFetched=${!!serverData?.lastFetched}, ongoing=${ongoingRequests.current.has(selectedServer)}, serverHasCounts=${!!(serverStatus?.tools || serverStatus?.resources || serverStatus?.prompts)}`);
      
      // Always fetch detailed capabilities when server is selected (unless already fetched or in progress)
      if (!serverData?.lastFetched && !ongoingRequests.current.has(selectedServer)) {
        console.log(`🔄 Auto-loading detailed capabilities for ${selectedServer}`);
        fetchServerCapabilities(selectedServer);
      } else if (serverData?.lastFetched) {
        console.log(`✅ ${selectedServer} capabilities already loaded`);
      }
    }
  }, [selectedServer, fetchServerCapabilities]);

  // Generate example usage for tools
  const generateToolExamples = (tool: any): string[] => {
    const examples: string[] = [];
    const schema = tool.inputSchema;
    
    if (!schema?.properties) {
      examples.push(`${tool.name}()`);
      return examples;
    }

    const sampleParams: any = {};
    Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
      switch (prop.type) {
        case 'string':
          if (key.includes('location')) sampleParams[key] = 'San Francisco, CA';
          else if (key.includes('filename')) sampleParams[key] = 'readme.txt';
          else if (key.includes('title')) sampleParams[key] = 'Sample Title';
          else if (key.includes('query')) sampleParams[key] = 'search term';
          else sampleParams[key] = 'sample';
          break;
        case 'number':
          sampleParams[key] = key === 'a' ? 5 : key === 'b' ? 3 : 42;
          break;
        case 'array':
          sampleParams[key] = ['demo'];
          break;
        default:
          sampleParams[key] = null;
      }
    });

    const paramString = Object.entries(sampleParams)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    
    examples.push(`${tool.name}(${paramString})`);
    return examples;
  };

  // Generate example usage for prompts
  const generatePromptExamples = (prompt: any): string[] => {
    const examples: string[] = [`prompt:${prompt.name}`];
    if (prompt.arguments) {
      examples.push(`${prompt.name} with arguments`);
    }
    return examples;
  };

  const connectedServers = servers.filter(s => s.connected);
  const currentServerData = selectedServer ? serverCapabilities[selectedServer] : null;
  const currentCapabilities = currentServerData 
    ? [
        ...(currentServerData.tools || []), 
        ...(currentServerData.resources || []), 
        ...(currentServerData.prompts || [])
      ]
    : [];


  const getCapabilityIcon = (type: string): string => {
    switch (type) {
      case 'tool': return '🔧';
      case 'resource': return '📂';
      case 'prompt': return '💬';
      default: return '❓';
    }
  };

  const getCapabilityColor = (type: string): string => {
    switch (type) {
      case 'tool': return 'border-blue-200 bg-blue-50';
      case 'resource': return 'border-green-200 bg-green-50';
      case 'prompt': return 'border-purple-200 bg-purple-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getTypeStats = () => {
    if (!currentServerData) return { tool: 0, resource: 0, prompt: 0 };
    return {
      tool: currentServerData.tools?.length || 0,
      resource: currentServerData.resources?.length || 0,
      prompt: currentServerData.prompts?.length || 0
    };
  };

  const stats = getTypeStats();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <span className="mr-2">🔍</span>
          Capability Explorer
        </h3>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2 py-1 text-sm rounded ${
              viewMode === 'grid' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2 py-1 text-sm rounded ${
              viewMode === 'list' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {connectedServers.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <p>No connected servers</p>
          <p className="text-sm mt-1">Start the MCP client to explore capabilities</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Server Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Server
            </label>
            <select
              value={selectedServer}
              onChange={(e) => {
                setSelectedServer(e.target.value);
                setSelectedCapability(null);
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a server to explore its capabilities</option>
              {connectedServers.map(server => (
                <option key={server.name} value={server.name}>
                  {server.name}
                </option>
              ))}
            </select>
          </div>

          {/* Capability Stats */}
          {selectedServer && (
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.tool}</div>
                <div className="text-sm text-gray-600">🔧 Tools</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{stats.resource}</div>
                <div className="text-sm text-gray-600">📂 Resources</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.prompt}</div>
                <div className="text-sm text-gray-600">💬 Prompts</div>
              </div>
            </div>
          )}

          {/* Capabilities List/Grid */}
          {selectedServer && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Available Capabilities</h4>
                <button
                  onClick={() => fetchServerCapabilities(selectedServer)}
                  disabled={currentServerData?.loading}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {currentServerData?.loading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentCapabilities.map((capability, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedCapability(capability)}
                      className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                        getCapabilityColor(capability.type)
                      } ${
                        selectedCapability === capability ? 'ring-2 ring-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-lg">{getCapabilityIcon(capability.type)}</span>
                        <span className={`px-2 py-1 text-xs rounded ${
                          capability.type === 'tool' ? 'bg-blue-100 text-blue-800' :
                          capability.type === 'resource' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {capability.type}
                        </span>
                      </div>
                      <div className="font-medium text-gray-900 mb-1">{capability.name}</div>
                      <div className="text-sm text-gray-600">{capability.description}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {currentCapabilities.map((capability, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedCapability(capability)}
                      className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-sm ${
                        selectedCapability === capability ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-lg">{getCapabilityIcon(capability.type)}</span>
                          <div>
                            <div className="font-medium text-gray-900">{capability.name}</div>
                            <div className="text-sm text-gray-600">{capability.description}</div>
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded ${
                          capability.type === 'tool' ? 'bg-blue-100 text-blue-800' :
                          capability.type === 'resource' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {capability.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentServerData?.loading && (
                <div className="text-center text-gray-500 py-8">
                  <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
                  <p>Loading capabilities...</p>
                </div>
              )}
              
              {currentServerData?.error && (
                <div className="text-center text-red-500 py-8">
                  <p>Error loading capabilities: {currentServerData.error}</p>
                  <button
                    onClick={() => fetchServerCapabilities(selectedServer)}
                    className="text-blue-600 hover:text-blue-800 text-sm mt-1"
                  >
                    Try again
                  </button>
                </div>
              )}
              
              {!currentServerData?.loading && !currentServerData?.error && currentCapabilities.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <p>No capabilities found for this server</p>
                  <button
                    onClick={() => fetchServerCapabilities(selectedServer)}
                    className="text-blue-600 hover:text-blue-800 text-sm mt-1"
                  >
                    Try refreshing
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Capability Details */}
          {selectedCapability && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <h4 className="font-medium text-gray-900 mb-3">
                {getCapabilityIcon(selectedCapability.type)} {selectedCapability.name}
              </h4>
              
              {selectedCapability.description && (
                <p className="text-gray-700 mb-3">{selectedCapability.description}</p>
              )}

              {selectedCapability.schema && (
                <div className="mb-3">
                  <h5 className="text-sm font-medium text-gray-700 mb-1">Schema:</h5>
                  <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                    {JSON.stringify(selectedCapability.schema, null, 2)}
                  </pre>
                </div>
              )}

              {selectedCapability.examples && selectedCapability.examples.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-1">Examples:</h5>
                  <div className="space-y-1">
                    {selectedCapability.examples.map((example, index) => (
                      <code key={index} className="block text-xs bg-white p-2 rounded border">
                        {example}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};