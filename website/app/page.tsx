'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AgentSelector, ChatInput, Message, TypingIndicator } from '@/components/ui';
import { ProjectSelector } from '@/components/ui/ProjectSelector';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { AgentName } from '@/lib/agents/executor';

interface AgentStatus {
  available: boolean;
  name: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  isStreaming?: boolean;
}

export default function ChatPage() {
  const [agents, setAgents] = useState<Record<AgentName, AgentStatus> | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentName>('gemini');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/agents/status')
      .then((res) => res.json())
      .then((data) => {
        setAgents(data.agents);
        const available = Object.entries(data.agents as Record<AgentName, AgentStatus>)
          .find(([, config]) => config.available);
        if (available) {
          setSelectedAgent(available[0] as AgentName);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (content: string) => {
    // Add user message
    const userMessage: ChatMessage = { role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    // Create placeholder for streaming response
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      agent: agents?.[selectedAgent]?.name,
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // Build context from current conversation
    const context = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    try {
      // Use streaming API for Gemini
      if (selectedAgent === 'gemini') {
        abortControllerRef.current = new AbortController();
        
        const response = await fetch('/api/agents/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt: content,
            conversationId,
            context,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // SSE format: "event: xxx\ndata: {...}\n\n"
          // Split by double newline to get complete events
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // Keep incomplete event in buffer

          for (const eventBlock of events) {
            if (!eventBlock.trim()) continue;
            
            const lines = eventBlock.split('\n');
            let eventType = '';
            let eventData = '';
            
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                eventData = line.slice(6);
              }
            }
            
            if (!eventType || !eventData) continue;
            
            try {
              const data = JSON.parse(eventData);
              
              if (eventType === 'token' && data.token) {
                // Update streaming message with new token
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (updated[lastIdx]?.isStreaming) {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: updated[lastIdx].content + data.token,
                    };
                  }
                  return updated;
                });
              } else if (eventType === 'complete') {
                setConversationId(data.conversationId);
                // Mark as not streaming
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (updated[lastIdx]?.isStreaming) {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      isStreaming: false,
                    };
                  }
                  return updated;
                });
              } else if (eventType === 'error') {
                throw new Error(data.message);
              }
            } catch (parseError) {
              // Skip parse errors for incomplete data
              console.warn('SSE parse error:', parseError);
            }
          }
        }
      } else {
        // Fallback to CLI for Codex (non-streaming)
        const res = await fetch('/api/agents/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent: selectedAgent, prompt: content }),
        });

        const data = await res.json();
        
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          updated[lastIdx] = {
            role: 'assistant',
            content: data.error ? `Error: ${data.error}` : data.response,
            agent: agents?.[selectedAgent]?.name,
            isStreaming: false,
          };
          return updated;
        });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          updated[lastIdx] = {
            role: 'assistant',
            content: `Error: ${error}`,
            agent: 'System',
            isStreaming: false,
          };
          return updated;
        });
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [agents, messages, selectedAgent, conversationId]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-medium">Agent Hub</h1>
          <ProjectSelector />
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              New chat
            </button>
          )}
        </div>
        {agents && (
          <AgentSelector
            selected={selectedAgent}
            onSelect={setSelectedAgent}
            agents={agents}
          />
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--agent-gemini)] to-[var(--agent-codex)] flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h2 className="text-xl font-medium mb-2">How can I help you?</h2>
              <p className="text-[var(--color-text-secondary)] text-sm">
                Responses are streamed in real-time for faster feedback.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <Message key={i} role={msg.role} agent={msg.agent}>
                {msg.role === 'assistant' ? (
                  msg.content ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    <TypingIndicator />
                  )
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </Message>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            onSend={handleSend}
            disabled={loading}
            placeholder={`Message ${agents?.[selectedAgent]?.name || 'agent'}...`}
          />
          <p className="text-xs text-center text-[var(--color-text-muted)] mt-2">
            Streaming enabled • Responses appear in real-time
          </p>
        </div>
      </div>
    </div>
  );
}
