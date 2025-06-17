import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Props {
  value: any;
  onChange?: (value: any) => void;
  readOnly?: boolean;
  className?: string;
}

export const JSONEditor: React.FC<Props> = ({ 
  value, 
  onChange, 
  readOnly = false, 
  className = '' 
}) => {
  const [jsonString, setJsonString] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, setIsFormatted] = useState(true);
  const [isUserEditing, setIsUserEditing] = useState(false);
  const lastPropsValueRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Memoize the stringified value to prevent unnecessary updates
  const valueString = useMemo(() => {
    try {
      if (value === null || value === undefined) {
        return '';
      }
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }, [value]);

  useEffect(() => {
    // Only update if user is not currently editing and the actual prop value changed
    if (!isUserEditing && value !== lastPropsValueRef.current) {
      setJsonString(valueString);
      setError(null);
      lastPropsValueRef.current = value;
    }
  }, [value, valueString, isUserEditing]);

  const handleChange = (newValue: string) => {
    setIsUserEditing(true);
    setJsonString(newValue);
    
    if (!onChange || readOnly) return;

    try {
      const parsed = JSON.parse(newValue);
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const handleFocus = () => {
    setIsUserEditing(true);
  };

  const handleBlur = () => {
    setIsUserEditing(false);
  };

  const formatJSON = () => {
    try {
      const parsed = JSON.parse(jsonString);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonString(formatted);
      setError(null);
      setIsFormatted(true);
    } catch (err) {
      setError('Cannot format invalid JSON');
    }
  };

  const compactJSON = () => {
    try {
      const parsed = JSON.parse(jsonString);
      const compact = JSON.stringify(parsed);
      setJsonString(compact);
      setError(null);
      setIsFormatted(false);
    } catch (err) {
      setError('Cannot compact invalid JSON');
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const validateJSON = () => {
    if (!jsonString) return false;
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  };

  const getLineCount = () => {
    return (jsonString || '').split('\n').length;
  };

  return (
    <div className={`border rounded-lg ${className}`}>
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center justify-between p-2 bg-gray-50 border-b">
          <div className="flex items-center space-x-2">
            <button
              onClick={formatJSON}
              disabled={!validateJSON()}
              className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400"
            >
              Format
            </button>
            <button
              onClick={compactJSON}
              disabled={!validateJSON()}
              className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200 disabled:bg-gray-100 disabled:text-gray-400"
            >
              Compact
            </button>
            <button
              onClick={copyToClipboard}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
            >
              Copy
            </button>
          </div>
          
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <span>{getLineCount()} lines</span>
            <span>•</span>
            <span>{(jsonString || '').length} chars</span>
            {error && (
              <>
                <span>•</span>
                <span className="text-red-500">⚠ Invalid JSON</span>
              </>
            )}
            {!error && validateJSON() && (
              <>
                <span>•</span>
                <span className="text-green-500">✓ Valid</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={jsonString || ''}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          readOnly={readOnly}
          className={`w-full font-mono text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            readOnly ? 'bg-gray-50' : 'bg-white'
          } ${error ? 'border-red-300' : ''}`}
          rows={Math.min(Math.max(getLineCount(), 10), 30)}
          placeholder={readOnly ? '' : 'Enter valid JSON...'}
          spellCheck={false}
        />
        
        {/* Line numbers */}
        <div className="absolute left-0 top-0 p-3 text-xs text-gray-400 pointer-events-none font-mono leading-5">
          {Array.from({ length: getLineCount() }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        
        {/* Indent guide */}
        <style>{`
          .json-editor textarea {
            padding-left: ${Math.max(String(getLineCount()).length * 8 + 20, 40)}px;
          }
        `}</style>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-2 bg-red-50 border-t border-red-200 text-sm text-red-600">
          <span className="font-medium">JSON Error:</span> {error}
        </div>
      )}
    </div>
  );
};