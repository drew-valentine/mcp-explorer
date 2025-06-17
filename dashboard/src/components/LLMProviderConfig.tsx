import React, { useState, useEffect } from 'react';
import { 
  LLMProviderConfig as ProviderConfig, 
  AuthConfig, 
  PROVIDER_PRESETS 
} from '../types/llm-providers';

interface Props {
  config: ProviderConfig;
  onChange: (config: ProviderConfig) => void;
  onTest?: (config: ProviderConfig) => Promise<boolean>;
  onClose: () => void;
}

export const LLMProviderConfig: React.FC<Props> = ({ 
  config, 
  onChange, 
  onTest, 
  onClose 
}) => {
  const [localConfig, setLocalConfig] = useState<ProviderConfig>(config);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const updateConfig = (updates: Partial<ProviderConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const updateAuth = (authUpdates: Partial<AuthConfig>) => {
    const newAuth = { ...localConfig.auth, ...authUpdates };
    updateConfig({ auth: newAuth });
  };

  const loadPreset = (presetId: string) => {
    const preset = PROVIDER_PRESETS[presetId];
    if (preset) {
      const newConfig = { 
        ...localConfig, 
        ...preset,
        id: localConfig.id, // Preserve the current ID
        name: preset.name || localConfig.name,
      };
      setLocalConfig(newConfig);
      onChange(newConfig);
    }
  };

  const handleTest = async () => {
    if (!onTest) return;
    
    setTesting(true);
    setTestResult(null);
    
    try {
      const success = await onTest(localConfig);
      setTestResult({ 
        success, 
        message: success 
          ? 'Connection successful! Server is reachable.' 
          : 'Connection failed. Please check if the server is running and the URL is correct.' 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      
      // Provide more helpful error messages for common issues
      let helpfulMessage = errorMessage;
      if (errorMessage.includes('fetch')) {
        helpfulMessage = 'Cannot reach server. Please check if LM Studio is running and serving on the correct port.';
      } else if (errorMessage.includes('CORS')) {
        helpfulMessage = 'CORS error. The server may not be configured to accept browser requests.';
      }
      
      setTestResult({ 
        success: false, 
        message: helpfulMessage
      });
    } finally {
      setTesting(false);
    }
  };

  const renderAuthSection = () => {
    switch (localConfig.auth.type) {
      case 'api-key':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={localConfig.auth.apiKey || ''}
              onChange={(e) => updateAuth({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            />
          </div>
        );
      
      case 'bearer-token':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Bearer Token
            </label>
            <input
              type="password"
              value={localConfig.auth.bearerToken || ''}
              onChange={(e) => updateAuth({ bearerToken: e.target.value })}
              placeholder="Bearer token..."
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            />
          </div>
        );
      
      case 'custom':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Custom Headers (JSON)
            </label>
            <textarea
              value={JSON.stringify(localConfig.auth.customHeaders || {}, null, 2)}
              onChange={(e) => {
                try {
                  const headers = JSON.parse(e.target.value);
                  updateAuth({ customHeaders: headers });
                } catch (error) {
                  // Invalid JSON, ignore for now
                }
              }}
              placeholder='{"Authorization": "Bearer token", "X-API-Key": "key"}'
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 h-20"
            />
          </div>
        );
      
      case 'none':
        return (
          <div className="text-sm text-gray-600">
            No authentication required
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">Configure LLM Provider</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {/* Quick Presets */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quick Setup
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(PROVIDER_PRESETS).map(([id, preset]) => (
                <button
                  key={id}
                  onClick={() => loadPreset(id)}
                  className="p-2 text-xs border border-gray-300 rounded hover:bg-gray-50 text-left"
                >
                  <div className="font-medium">{preset.name}</div>
                  <div className="text-gray-500">{preset.type}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Basic Configuration */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Provider Name
                </label>
                <input
                  type="text"
                  value={localConfig.name}
                  onChange={(e) => updateConfig({ name: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Provider Type
                </label>
                <select
                  value={localConfig.type}
                  onChange={(e) => updateConfig({ type: e.target.value as any })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            {/* Base URL for non-Anthropic providers */}
            {localConfig.type !== 'anthropic' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  value={localConfig.baseUrl || ''}
                  onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Model
              </label>
              <input
                type="text"
                value={localConfig.model}
                onChange={(e) => updateConfig({ model: e.target.value })}
                placeholder="gpt-4, claude-3-5-sonnet, llama3.2, etc."
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>

            {/* Authentication */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Authentication Type
              </label>
              <select
                value={localConfig.auth.type}
                onChange={(e) => updateAuth({ type: e.target.value as any })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-2"
              >
                <option value="none">None</option>
                <option value="api-key">API Key</option>
                <option value="bearer-token">Bearer Token</option>
                <option value="custom">Custom Headers</option>
              </select>
              {renderAuthSection()}
            </div>

            {/* Advanced Settings */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showAdvanced ? '▼' : '▶'} Advanced Settings
              </button>
              
              {showAdvanced && (
                <div className="mt-3 space-y-3 p-3 bg-gray-50 rounded">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Temperature
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={localConfig.temperature || 0.7}
                        onChange={(e) => updateConfig({ temperature: parseFloat(e.target.value) })}
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Max Tokens
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="32000"
                        value={localConfig.maxTokens || 4096}
                        onChange={(e) => updateConfig({ maxTokens: parseInt(e.target.value) })}
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    </div>
                  </div>
                  
                  {localConfig.type === 'openai-compatible' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Top P
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.1"
                          value={localConfig.topP || 1}
                          onChange={(e) => updateConfig({ topP: parseFloat(e.target.value) })}
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Frequency Penalty
                        </label>
                        <input
                          type="number"
                          min="-2"
                          max="2"
                          step="0.1"
                          value={localConfig.frequencyPenalty || 0}
                          onChange={(e) => updateConfig({ frequencyPenalty: parseFloat(e.target.value) })}
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Test Connection */}
          {onTest && (
            <div className="mt-6 p-3 bg-gray-50 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Configuration Test</span>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {testing ? 'Testing...' : 'Test'}
                </button>
              </div>
              
              <div className="text-xs text-gray-600 mb-2">
                Validates configuration format. For local LLMs, ensure your server is running before using the AI Agent.
              </div>
              
              {testResult && (
                <div className={`text-sm p-2 rounded ${
                  testResult.success 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </div>
              )}
              
              {localConfig.type === 'openai-compatible' && (
                <div className="mt-2 space-y-2">
                  <div className="text-xs text-blue-600">
                    💡 <strong>Local LLM Setup:</strong> Make sure your LLM server is running on {localConfig.baseUrl}
                  </div>
                  <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                    <div className="font-medium mb-1">⚠️ CORS Configuration Required</div>
                    <div className="mb-1">Most local LLMs need CORS headers to work with browsers:</div>
                    <div className="space-y-1 ml-2">
                      <div>• <strong>LM Studio:</strong> In Server tab, enable "Apply Template" and "CORS"</div>
                      <div>• <strong>Ollama:</strong> Set environment variable: <code className="bg-amber-100 px-1 rounded">OLLAMA_ORIGINS="*"</code></div>
                      <div>• <strong>Other:</strong> Enable CORS with <code className="bg-amber-100 px-1 rounded">Access-Control-Allow-Origin: *</code></div>
                    </div>
                    <div className="mt-2 text-xs text-blue-600">
                      💡 <strong>Context Length:</strong> For models with small context (4K tokens), use larger models or reduce max_tokens in advanced settings.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};