'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { daemonClient } from '@/lib/daemon-client';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

interface CLIEvent {
  type: 'init' | 'user_message' | 'assistant_chunk' | 'assistant_complete' | 
        'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'error' | 'raw';
  timestamp: string;
  sessionId?: string;
  model?: string;
  role?: 'user' | 'assistant';
  content?: string;
  isStreaming?: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  stats?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    toolCalls: number;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  stats?: CLIEvent['stats'];
  toolCalls?: { name: string; args: any; result?: string }[];
}

export default function CLIChatPage() {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [projectPath, setProjectPath] = useState('/Users/samuelmuselet/AgentHub');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Connect to daemon and handle events
  useEffect(() => {
    daemonClient.connect();
    
    const checkConnection = setInterval(() => {
      setConnected(daemonClient.isConnected());
    }, 500);

    const unsubscribe = daemonClient.subscribe((msg) => {
      // Handle CLI chat created
      if (msg.type === 'cli-chat-created' && msg.sessionId) {
        console.log('[CLIChat] Session created:', msg.sessionId);
        setSessionId(msg.sessionId);
        setModel(msg.data || 'gemini');
        setIsLoading(false);
        
        // Subscribe to events
        daemonClient.cliChatSubscribe(msg.sessionId);
        
        // Add system message
        const modeInfo = msg.data?.includes('warm') ? 'WARM' : 'COLD';
        setIsWarm(modeInfo === 'WARM');
        setMessages([{
          id: `sys_${Date.now()}`,
          role: 'system',
          content: `Connected to ${msg.data || 'Gemini'} (${modeInfo} mode). Project: ${projectPath}`,
          timestamp: new Date(),
        }]);
      }
      
      // Handle CLI chat events
      if (msg.type === 'cli-chat-event' && msg.data) {
        try {
          const event: CLIEvent = JSON.parse(msg.data);
          handleCLIEvent(event);
        } catch (e) {
          console.error('[CLIChat] Failed to parse event:', e);
        }
      }
    });

    return () => {
      clearInterval(checkConnection);
      unsubscribe();
    };
  }, [projectPath]);

  // Handle CLI events
  const handleCLIEvent = useCallback((event: CLIEvent) => {
    console.log('[CLIChat] Event:', event.type, event);
    
    switch (event.type) {
      case 'init':
        setModel(event.model || 'gemini');
        break;
        
      case 'user_message':
        // Already added when sending
        break;
        
      case 'assistant_chunk':
        setIsThinking(false);
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            // Update existing streaming message
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: event.content || '' }
            ];
          } else {
            // Create new streaming message
            return [
              ...prev,
              {
                id: `assistant_${Date.now()}`,
                role: 'assistant',
                content: event.content || '',
                timestamp: new Date(),
                isStreaming: true,
              }
            ];
          }
        });
        break;
        
      case 'thinking':
        setIsThinking(true);
        break;
        
      case 'tool_call':
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant') {
            const toolCalls = lastMsg.toolCalls || [];
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                toolCalls: [...toolCalls, { name: event.toolName || '', args: event.toolArgs }]
              }
            ];
          }
          return prev;
        });
        break;
        
      case 'tool_result':
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.toolCalls) {
            const toolCalls = lastMsg.toolCalls.map(tc => 
              tc.name === event.toolName ? { ...tc, result: event.toolResult } : tc
            );
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, toolCalls }
            ];
          }
          return prev;
        });
        break;
        
      case 'complete':
        setIsLoading(false);
        setIsThinking(false);
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, isStreaming: false, stats: event.stats }
            ];
          }
          return prev;
        });
        break;
        
      case 'error':
        setIsLoading(false);
        setIsThinking(false);
        setMessages(prev => [
          ...prev,
          {
            id: `error_${Date.now()}`,
            role: 'system',
            content: `❌ Error: ${event.content}`,
            timestamp: new Date(),
          }
        ]);
        break;
    }
  }, []);

  // Create session
  const createSession = useCallback(() => {
    if (!connected) return;
    setIsLoading(true);
    daemonClient.cliChatCreate(projectPath);
  }, [connected, projectPath]);

  // Send message
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !sessionId || isLoading) return;
    
    const message = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    
    // Add user message immediately
    setMessages(prev => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      }
    ]);
    
    // Send to CLI
    daemonClient.cliChatSend(sessionId, message);
  }, [inputValue, sessionId, isLoading]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-medium">CLI Chat</h1>
          {model && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--agent-gemini)]/20 text-[var(--agent-gemini)]">
              {model}
            </span>
          )}
          {isThinking && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-500 animate-pulse">
              Thinking...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-[var(--color-text-muted)]">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {!sessionId ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--agent-gemini)] to-purple-600 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h2 className="text-xl font-medium mb-2">CLI-Powered Chat</h2>
              <p className="text-[var(--color-text-secondary)] text-sm mb-4">
                Full project context • Token stats • Real Gemini CLI
              </p>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                className="w-full px-3 py-2 mb-4 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm"
                placeholder="Project path..."
              />
              <button
                onClick={createSession}
                disabled={!connected || isLoading}
                className="px-6 py-2 rounded-lg bg-[var(--agent-gemini)] text-white font-medium disabled:opacity-50"
              >
                {isLoading ? 'Starting...' : 'Start Chat'}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-[var(--agent-gemini)] text-white'
                      : msg.role === 'system'
                      ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] text-sm'
                      : 'bg-[var(--color-bg-elevated)] border border-[var(--color-border)]'
                  }`}
                >
                  {/* Message content */}
                  {msg.role === 'assistant' ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                  
                  {/* Tool calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.toolCalls.map((tc, i) => (
                        <details key={i} className="text-xs bg-black/10 rounded-lg p-2">
                          <summary className="cursor-pointer font-medium">
                            🔧 {tc.name}
                          </summary>
                          <pre className="mt-2 overflow-x-auto text-[10px]">
                            {JSON.stringify(tc.args, null, 2)}
                          </pre>
                          {tc.result && (
                            <pre className="mt-2 overflow-x-auto text-[10px] text-green-400">
                              {tc.result.slice(0, 500)}...
                            </pre>
                          )}
                        </details>
                      ))}
                    </div>
                  )}
                  
                  {/* Stats */}
                  {msg.stats && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-xs opacity-60">
                      {(msg.stats.durationMs / 1000).toFixed(1)}s • {msg.stats.totalTokens.toLocaleString()} tokens
                      {msg.stats.toolCalls > 0 && ` • ${msg.stats.toolCalls} tools`}
                    </div>
                  )}
                  
                  {/* Streaming indicator */}
                  {msg.isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
                  )}
                </div>
              </div>
            ))}
            
            {/* Thinking indicator */}
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-[var(--color-bg-elevated)] rounded-2xl px-4 py-3 text-[var(--color-text-muted)]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {sessionId && (
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
              className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] resize-none focus:outline-none focus:border-[var(--agent-gemini)]"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="px-4 py-3 rounded-xl bg-[var(--agent-gemini)] text-white disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
