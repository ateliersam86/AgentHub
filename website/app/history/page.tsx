'use client';

import { useEffect, useState, useRef } from 'react';
import { Header } from '@/components/layout';
import { ChatInput, Message, TypingIndicator } from '@/components/ui';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { AgentName } from '@/lib/agents/executor';

interface Conversation {
  id: string;
  title: string;
  agent: string;
  createdAt: string;
  updatedAt: string;
}

interface MessageType {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const AGENT_NAMES: Record<string, string> = {
  gemini: 'Gemini',
  codex: 'Codex',
};

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [continuing, setContinuing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/conversations?limit=50')
      .then((res) => res.json())
      .then((data) => {
        setConversations(data.conversations || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      setMessages(data.messages || []);
      setSelectedConv(data.conversation);
    } catch (error) {
      console.error(error);
    }
  };

  const handleContinue = async (prompt: string) => {
    if (!selectedId || !selectedConv) return;
    
    setContinuing(true);
    const userMsg: MessageType = { id: `user-${Date.now()}`, role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    
    try {
      const res = await fetch(`/api/conversations/${selectedId}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      
      const data = await res.json();
      
      const assistantMsg: MessageType = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.error ? `Error: ${data.error}` : data.response,
      };
      
      setMessages((prev) => [...prev, assistantMsg]);
      
      // Refresh conversation list
      const convRes = await fetch('/api/conversations?limit=50');
      const convData = await convRes.json();
      setConversations(convData.conversations || []);
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: 'error',
        role: 'assistant',
        content: `Error: ${error}`,
      }]);
    } finally {
      setContinuing(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedConv(null);
        setMessages([]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex h-screen">
      {/* Conversation List */}
      <div className="w-80 border-r border-[var(--border-primary)] flex flex-col">
        <div className="p-4 border-b border-[var(--border-primary)]">
          <h2 className="font-medium">History</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">{conversations.length} conversations</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-[var(--text-muted)]">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-[var(--text-muted)]">No conversations yet</div>
          ) : (
            <div className="p-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelect(conv.id)}
                  className={`w-full text-left p-3 rounded-lg mb-1 group transition-colors ${
                    selectedId === conv.id 
                      ? 'bg-[var(--bg-tertiary)]' 
                      : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{conv.title}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {AGENT_NAMES[conv.agent] || conv.agent} • {formatDate(conv.updatedAt || conv.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-red-500 transition-opacity"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Conversation Detail */}
      <div className="flex-1 flex flex-col">
        {selectedId && selectedConv ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-[var(--border-primary)]">
              <h3 className="font-medium">{selectedConv.title}</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {AGENT_NAMES[selectedConv.agent] || selectedConv.agent}
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {messages.map((msg) => (
                <Message 
                  key={msg.id} 
                  role={msg.role} 
                  agent={msg.role === 'assistant' ? AGENT_NAMES[selectedConv.agent] : undefined}
                >
                  {msg.role === 'assistant' ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </Message>
              ))}
              {continuing && (
                <div className="message-container message-assistant">
                  <div className="max-w-3xl mx-auto flex gap-4">
                    <div className={`avatar avatar-${selectedConv.agent}`}>
                      {AGENT_NAMES[selectedConv.agent]?.[0] || 'A'}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[var(--text-secondary)] mb-1">
                        {AGENT_NAMES[selectedConv.agent]}
                      </div>
                      <TypingIndicator />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Continue Input */}
            <div className="p-4 border-t border-[var(--border-primary)]">
              <ChatInput
                onSend={handleContinue}
                disabled={continuing}
                placeholder={`Continue with ${AGENT_NAMES[selectedConv.agent]}...`}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" className="mx-auto mb-4">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              <p className="text-[var(--text-muted)]">Select a conversation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
