import React, { useState, useEffect } from 'react';
import { ServerStatus } from '../hooks/useWebSocket';
import { JSONEditor } from './JSONEditor';

interface Props {
  servers: ServerStatus[];
  onExecuteTool: (serverName: string, toolName: string, params: any) => Promise<any>;
  onListTools: (serverName: string) => Promise<any>;
}

interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export const ToolExecutor: React.FC<Props> = ({ servers, onExecuteTool, onListTools }) => {
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [toolParams, setToolParams] = useState<any>({});
  const [serverTools, setServerTools] = useState<Record<string, ToolSchema[]>>({});
  const [toolsLoading, setToolsLoading] = useState<Record<string, boolean>>({});
  const [userEditedParams, setUserEditedParams] = useState<boolean>(false);
  const [executionHistory, setExecutionHistory] = useState<Array<{
    id: string;
    timestamp: number;
    server: string;
    tool: string;
    params: any;
    status: 'pending' | 'success' | 'error';
    result?: any;
  }>>([]);

  const fetchServerTools = async (serverName: string) => {
    if (toolsLoading[serverName]) return;
    
    setToolsLoading(prev => ({ ...prev, [serverName]: true }));
    
    try {
      const result = await onListTools(serverName);
      if (result && result.tools) {
        setServerTools(prev => ({
          ...prev,
          [serverName]: result.tools.map((tool: any) => ({
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || { type: 'object', properties: {}, required: [] }
          }))
        }));
      }
    } catch (error) {
      console.warn(`Failed to fetch tools for ${serverName}:`, error);
    } finally {
      setToolsLoading(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const connectedServers = servers.filter(s => s.connected);
  const currentTools = selectedServer ? serverTools[selectedServer] || [] : [];
  const currentTool = currentTools.find(t => t.name === selectedTool);

  // Automatically fetch tools when server is selected
  useEffect(() => {
    if (selectedServer && !serverTools[selectedServer] && !toolsLoading[selectedServer]) {
      fetchServerTools(selectedServer);
    }
  }, [selectedServer]);

  useEffect(() => {
    if (selectedServer && !selectedTool && currentTools.length > 0) {
      setSelectedTool(currentTools[0].name);
    }
  }, [selectedServer, currentTools, selectedTool]);

  useEffect(() => {
    if (currentTool && !userEditedParams) {
      // Only generate default parameters if user hasn't edited them
      const defaultParams: any = {};
      Object.entries(currentTool.inputSchema.properties || {}).forEach(([key, schema]: [string, any]) => {
        if (currentTool.inputSchema.required?.includes(key)) {
          switch (schema.type) {
            case 'string':
              defaultParams[key] = schema.description?.includes('location') ? 'San Francisco, CA' :
                                  schema.description?.includes('filename') ? 'readme.txt' :
                                  schema.description?.includes('title') ? 'Sample Title' :
                                  schema.description?.includes('query') ? 'search term' : '';
              break;
            case 'number':
              defaultParams[key] = 5; // Changed from hardcoded 10
              break;
            case 'array':
              defaultParams[key] = [];
              break;
            case 'object':
              defaultParams[key] = {};
              break;
            default:
              defaultParams[key] = null;
          }
        }
      });
      setToolParams(defaultParams);
    }
  }, [currentTool, userEditedParams]);

  const handleParamsChange = (newParams: any) => {
    setToolParams(newParams);
    setUserEditedParams(true);
  };

  // Reset user edited flag when changing tools
  useEffect(() => {
    setUserEditedParams(false);
  }, [selectedTool]);

  const handleExecute = async () => {
    if (!selectedServer || !selectedTool) return;

    const executionId = `exec_${Date.now()}`;
    const newExecution = {
      id: executionId,
      timestamp: Date.now(),
      server: selectedServer,
      tool: selectedTool,
      params: toolParams,
      status: 'pending' as const,
    };

    setExecutionHistory(prev => [newExecution, ...prev.slice(0, 9)]); // Keep last 10

    try {
      const response = await onExecuteTool(selectedServer, selectedTool, toolParams);
      
      setExecutionHistory(prev => 
        prev.map(exec => 
          exec.id === executionId 
            ? { ...exec, status: 'success' as const, result: response }
            : exec
        )
      );
    } catch (error) {
      setExecutionHistory(prev => 
        prev.map(exec => 
          exec.id === executionId 
            ? { 
                ...exec, 
                status: 'error' as const, 
                result: { 
                  error: error instanceof Error ? error.message : 'Unknown error occurred',
                  details: error
                }
              }
            : exec
        )
      );
    }
  };

  const generateSampleParams = () => {
    if (!currentTool || !currentTool.inputSchema?.properties) return;

    const sampleParams: any = {};
    Object.entries(currentTool.inputSchema.properties).forEach(([key, schema]: [string, any]) => {
      switch (schema.type) {
        case 'string':
          if (key === 'location') {
            sampleParams[key] = ['New York, NY', 'London, UK', 'Tokyo, Japan'][Math.floor(Math.random() * 3)];
          } else if (key === 'filename') {
            sampleParams[key] = ['readme.txt', 'config.json'][Math.floor(Math.random() * 2)];
          } else if (key === 'title') {
            sampleParams[key] = `Sample Note ${Math.floor(Math.random() * 100)}`;
          } else if (key === 'content') {
            sampleParams[key] = 'This is sample content for demonstration purposes.';
          } else if (key === 'query') {
            sampleParams[key] = ['weather', 'notes', 'demo'][Math.floor(Math.random() * 3)];
          } else {
            sampleParams[key] = `sample_${key}`;
          }
          break;
        case 'number':
          sampleParams[key] = Math.floor(Math.random() * 100) + 1;
          break;
        case 'array':
          sampleParams[key] = ['demo', 'sample'];
          break;
        default:
          sampleParams[key] = null;
      }
    });
    setToolParams(sampleParams);
    setUserEditedParams(true);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <span className="mr-2">⚡</span>
        Manual Tool Execution
      </h3>

      {connectedServers.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <p>No connected servers</p>
          <p className="text-sm mt-1">Start the MCP client to execute tools</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tool Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Server
              </label>
              <select
                value={selectedServer}
                onChange={(e) => {
                  setSelectedServer(e.target.value);
                  setSelectedTool('');
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a server</option>
                {connectedServers.map(server => (
                  <option key={server.name} value={server.name}>
                    {server.name} ({server.tools} tools)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tool
              </label>
              <select
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                disabled={!selectedServer}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">
                  {selectedServer && currentTools.length === 0 && toolsLoading[selectedServer]
                    ? 'Loading tools...' 
                    : selectedServer && currentTools.length === 0
                    ? 'No tools available'
                    : 'Select a tool'}
                </option>
                {currentTools.map(tool => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tool Information */}
          {currentTool && (
            <div className="border rounded-lg p-4 bg-blue-50">
              <h4 className="font-medium text-blue-900 mb-2">{currentTool.name}</h4>
              <p className="text-sm text-blue-700 mb-3">{currentTool.description}</p>
              
              {/* Schema Information */}
              <div className="text-xs">
                <span className="font-medium">Required:</span> {
                  currentTool.inputSchema?.required?.length > 0 
                    ? currentTool.inputSchema.required.join(', ')
                    : 'None'
                }
              </div>
            </div>
          )}

          {/* Parameters */}
          {currentTool && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Parameters</h4>
                <button
                  onClick={generateSampleParams}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Generate Sample
                </button>
              </div>
              
              <JSONEditor 
                value={toolParams}
                onChange={handleParamsChange}
                className="json-editor"
              />
            </div>
          )}

          {/* Execute Button */}
          <div className="flex justify-end">
            <button
              onClick={handleExecute}
              disabled={!selectedServer || !selectedTool}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Execute Tool
            </button>
          </div>

          {/* Execution History */}
          {executionHistory.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Recent Executions</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {executionHistory.map(execution => (
                  <div
                    key={execution.id}
                    className={`border rounded p-3 text-sm ${
                      execution.status === 'success' ? 'border-green-200 bg-green-50' :
                      execution.status === 'error' ? 'border-red-200 bg-red-50' :
                      'border-yellow-200 bg-yellow-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {execution.server} → {execution.tool}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded ${
                          execution.status === 'success' ? 'bg-green-100 text-green-800' :
                          execution.status === 'error' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {execution.status}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {new Date(execution.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-gray-600 space-y-2">
                      <div>
                        Params: <code className="bg-white px-1 rounded text-xs">
                          {JSON.stringify(execution.params)}
                        </code>
                      </div>
                      {execution.result && (
                        <div>
                          <span className="font-medium">Response:</span>
                          <div className="mt-1 bg-white border rounded p-2 max-h-32 overflow-y-auto">
                            <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                              {typeof execution.result === 'string' 
                                ? execution.result 
                                : JSON.stringify(execution.result, null, 2)
                              }
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
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