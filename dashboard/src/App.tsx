import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ServerStatus } from './components/ServerStatus';
import { MessageFlow } from './components/MessageFlow';
import { NetworkVisualization } from './components/NetworkVisualization';
import { ResourceBrowser } from './components/ResourceBrowser';
import { ProtocolInspector } from './components/ProtocolInspector';
import { ToolExecutor } from './components/ToolExecutor';
import { LiveResourceBrowser } from './components/LiveResourceBrowser';
import { CapabilityExplorer } from './components/CapabilityExplorer';
import { AIAgent } from './components/AIAgent';
import { ServerManager } from './components/ServerManager';

function App() {
  const {
    servers,
    messages,
    selectedMessage,
    connected,
    reconnectAttempts,
    maxReconnectAttempts,
    selectMessage,
    getServerInfo,
    executeTool,
    listResources,
    readResource,
    listTools,
    sendCustomMessage,
    manualReconnect,
    addServer,
    removeServer,
    testConnection,
    toggleServer,
    getServerConfigs,
  } = useWebSocket('ws://localhost:8081');

  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'resources' | 'capabilities' | 'protocol' | 'ai-agent' | 'servers'>('overview');
  const [selectedServerForCapabilities, setSelectedServerForCapabilities] = useState<string>('');

  // Clear selected server when leaving capabilities tab
  useEffect(() => {
    if (activeTab !== 'capabilities') {
      setSelectedServerForCapabilities('');
    }
  }, [activeTab]);

  const handleServerClick = (serverName: string) => {
    getServerInfo(serverName);
    // Navigate to capabilities tab and focus on the selected server
    setSelectedServerForCapabilities(serverName);
    setActiveTab('capabilities');
  };

  const handleMessageSelect = (message: any) => {
    selectMessage(message);
  };

  const handleCloseInspector = () => {
    selectMessage(undefined);
  };

  const handleSendMessage = async (message: any, serverName?: string) => {
    // Send custom message through WebSocket to the client
    console.log('Sending custom message:', message, 'to server:', serverName);
    return await sendCustomMessage(message, serverName);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            MCP Explorer
          </h1>
          <p className="text-gray-600">
            Real-time visualization of Model Context Protocol communication
          </p>
        </header>
        
        <ConnectionStatus 
          connected={connected}
          reconnectAttempts={reconnectAttempts}
          maxReconnectAttempts={maxReconnectAttempts}
          onManualReconnect={manualReconnect}
        />
        
        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'servers', label: 'Server Manager', icon: '🔧' },
                { id: 'ai-agent', label: 'AI Agent', icon: '🤖' },
                { id: 'tools', label: 'Tool Executor', icon: '⚡' },
                { id: 'resources', label: 'Resource Browser', icon: '📂' },
                { id: 'capabilities', label: 'Capabilities', icon: '🔍' },
                { id: 'protocol', label: 'Protocol Inspector', icon: '🔬' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
        
        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'overview' && (
            <>
              <ServerStatus 
                servers={servers}
                onServerClick={handleServerClick}
              />
              
              <div className="w-full">
                <NetworkVisualization 
                  servers={servers}
                  messages={messages}
                />
              </div>
            </>
          )}
          
          {activeTab === 'servers' && (
            <ServerManager
              servers={servers}
              onAddServer={addServer}
              onRemoveServer={removeServer}
              onTestConnection={testConnection}
              onToggleServer={toggleServer}
              onGetServerConfigs={getServerConfigs}
            />
          )}
          
          {activeTab === 'ai-agent' && (
            <AIAgent
              servers={servers}
              onExecuteTool={executeTool}
              onListTools={listTools}
            />
          )}
          
          {activeTab === 'tools' && (
            <ToolExecutor
              servers={servers}
              onExecuteTool={executeTool}
              onListTools={listTools}
            />
          )}
          
          {activeTab === 'resources' && (
            <LiveResourceBrowser
              servers={servers}
              onListResources={listResources}
              onReadResource={readResource}
            />
          )}
          
          {activeTab === 'capabilities' && (
            <CapabilityExplorer
              servers={servers}
              onListTools={listTools}
              onListResources={listResources}
              initialSelectedServer={selectedServerForCapabilities}
            />
          )}
          
          {activeTab === 'protocol' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <MessageFlow 
                messages={messages}
                selectedMessage={selectedMessage}
                onMessageSelect={handleMessageSelect}
              />
              
              <div className="space-y-6">
                <ProtocolInspector
                  message={selectedMessage}
                  onClose={handleCloseInspector}
                  onSendMessage={handleSendMessage}
                  servers={servers}
                  messages={messages}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Stats Footer */}
        <footer className="mt-8 text-center text-sm text-gray-500">
          <div className="flex justify-center space-x-6">
            <span>Servers: {servers.length}</span>
            <span>Messages: {messages.length}</span>
            <span>Connected: {servers.filter(s => s.connected).length}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;