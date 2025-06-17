import React, { useState, useEffect } from 'react';
import { ServerStatus } from '../hooks/useWebSocket';

interface Props {
  servers: ServerStatus[];
  onListResources: (serverName: string) => Promise<any>;
  onReadResource: (serverName: string, uri: string) => Promise<any>;
}

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
  lastModified?: string;
}

interface ResourceData {
  [serverName: string]: {
    resources: Resource[];
    lastUpdated: number;
    loading: boolean;
  };
}

export const LiveResourceBrowser: React.FC<Props> = ({ 
  servers, 
  onListResources, 
  onReadResource 
}) => {
  const [resourceData, setResourceData] = useState<ResourceData>({});
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [resourceContent, setResourceContent] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  const connectedServers = servers.filter(s => s.connected);

  // Automatically fetch resources when server is selected
  useEffect(() => {
    if (selectedServer && !resourceData[selectedServer] && !resourceData[selectedServer]?.loading) {
      refreshServerResources(selectedServer);
    }
  }, [selectedServer]);

  // Auto-refresh logic with debouncing
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      const currentConnectedServers = servers.filter(s => s.connected);
      
      // Debounce: only refresh if enough time has passed since last refresh
      currentConnectedServers.forEach(server => {
        const lastRefresh = resourceData[server.name]?.lastUpdated || 0;
        const now = Date.now();
        const minRefreshInterval = Math.max(refreshInterval, 5000); // Minimum 5 seconds between refreshes
        
        if (now - lastRefresh >= minRefreshInterval) {
          refreshServerResources(server.name);
        } else {
          console.log(`⚡ LiveResourceBrowser: Skipping refresh for ${server.name} - too recent`);
        }
      });
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, servers.filter(s => s.connected).length]); // Only depend on number of connected servers

  const refreshServerResources = async (serverName: string) => {
    setResourceData(prev => ({
      ...prev,
      [serverName]: {
        ...prev[serverName],
        loading: true
      }
    }));

    try {
      const result = await onListResources(serverName);
      const resources = result?.resources || [];
      
      setResourceData(prev => ({
        ...prev,
        [serverName]: {
          resources: resources.map((resource: any) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
            size: resource.size,
            lastModified: resource.lastModified
          })),
          lastUpdated: Date.now(),
          loading: false
        }
      }));
    } catch (error) {
      console.error(`Failed to fetch resources for ${serverName}:`, error);
      setResourceData(prev => ({
        ...prev,
        [serverName]: {
          resources: [],
          lastUpdated: Date.now(),
          loading: false
        }
      }));
    }
  };

  const handleResourceSelect = async (resource: Resource) => {
    setSelectedResource(resource);
    setResourceContent('Loading content...');
    
    const serverName = selectedServer;
    if (serverName) {
      try {
        const result = await onReadResource(serverName, resource.uri);
        const content = result?.contents?.[0];
        
        if (content) {
          if (content.text) {
            setResourceContent(content.text);
          } else if (content.blob) {
            // Handle blob content (base64)
            try {
              const decodedContent = atob(content.blob);
              setResourceContent(decodedContent);
            } catch (e) {
              setResourceContent(`[Binary content - ${content.blob?.length || 0} bytes]`);
            }
          } else {
            setResourceContent(JSON.stringify(content, null, 2));
          }
        } else {
          setResourceContent('No content available');
        }
      } catch (error) {
        console.error(`Failed to read resource ${resource.uri}:`, error);
        setResourceContent(`Error loading content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };


  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getMimeTypeIcon = (mimeType?: string): string => {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('text/')) return '📝';
    if (mimeType.includes('json')) return '⚙️';
    if (mimeType.includes('markdown')) return '📋';
    return '📄';
  };

  const currentResources = selectedServer ? resourceData[selectedServer]?.resources || [] : [];
  const isLoading = selectedServer ? resourceData[selectedServer]?.loading || false : false;
  const lastUpdated = selectedServer ? resourceData[selectedServer]?.lastUpdated : null;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <span className="mr-2">📂</span>
          Live Resource Browser
        </h3>
        
        <div className="flex items-center space-x-2">
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-1"
            />
            Auto-refresh
          </label>
          
          {autoRefresh && (
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>
          )}
        </div>
      </div>

      {connectedServers.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <p>No connected servers</p>
          <p className="text-sm mt-1">Start the MCP client to browse resources</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Server & Resource List */}
          <div className="space-y-4">
            {/* Server Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    {server.name} ({server.resources} resources)
                  </option>
                ))}
              </select>
            </div>

            {/* Resource List */}
            {selectedServer && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Resources</h4>
                  {lastUpdated && (
                    <span className="text-xs text-gray-500">
                      Updated: {new Date(lastUpdated).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {isLoading ? (
                  <div className="text-center py-4 text-gray-500">
                    <div className="animate-spin inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    <span className="ml-2">Loading resources...</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {currentResources.length === 0 ? (
                      <div className="text-center text-gray-500 py-4">
                        <p>No resources available</p>
                        <p className="text-sm mt-1">This server has no resources to browse</p>
                      </div>
                    ) : (
                      currentResources.map((resource, index) => (
                        <div
                          key={index}
                          onClick={() => handleResourceSelect(resource)}
                          className={`border rounded p-3 cursor-pointer transition-all hover:shadow-md ${
                            selectedResource?.uri === resource.uri 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2">
                              <span className="text-lg">{getMimeTypeIcon(resource.mimeType)}</span>
                              <div>
                                <div className="font-medium text-gray-900">{resource.name}</div>
                                {resource.description && (
                                  <div className="text-sm text-gray-600">{resource.description}</div>
                                )}
                                <div className="text-xs text-gray-500 mt-1">
                                  {resource.mimeType} 
                                  {resource.size && ` • ${formatFileSize(resource.size)}`}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resource Content */}
          <div>
            {selectedResource ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Content Preview</h4>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">{selectedResource.mimeType}</span>
                    <button
                      onClick={() => handleResourceSelect(selectedResource)}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Reload
                    </button>
                  </div>
                </div>

                <div className="border rounded-lg">
                  <div className="bg-gray-50 px-3 py-2 border-b">
                    <div className="text-sm font-medium">{selectedResource.name}</div>
                    <div className="text-xs text-gray-500">{selectedResource.uri}</div>
                  </div>
                  
                  <div className="p-3">
                    <pre className="text-sm bg-gray-50 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                      {resourceContent || 'Loading content...'}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <div className="text-4xl mb-2">📂</div>
                <p>Select a resource to view its content</p>
                <p className="text-sm mt-1">Resources will be loaded in real-time</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};