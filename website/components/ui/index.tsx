'use client';

import { useState } from 'react';
import { AgentName } from '@/lib/agents/executor';

interface AgentSelectorProps {
  selected: AgentName;
  onSelect: (agent: AgentName) => void;
  agents: Record<AgentName, { available: boolean; name: string }>;
}

export function AgentSelector({ selected, onSelect, agents }: AgentSelectorProps) {
  return (
    <div className="flex gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg inline-flex">
      {(Object.entries(agents) as [AgentName, { available: boolean; name: string }][])
        .filter(([, config]) => config.available)
        .map(([key, config]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`agent-tab ${selected === key ? 'active' : ''}`}
          >
            {config.name}
          </button>
        ))}
    </div>
  );
}

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = "Message Agent Hub..." }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="input-field pr-12 resize-none min-h-[52px] max-h-[200px]"
        style={{ height: 'auto' }}
      />
      <button
        type="submit"
        disabled={disabled || !message.trim()}
        className="absolute right-3 bottom-3 p-2 rounded-lg bg-[var(--accent-gemini)] text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22,2 15,22 11,13 2,9" />
        </svg>
      </button>
    </form>
  );
}

interface MessageProps {
  role: 'user' | 'assistant';
  agent?: string;
  children?: React.ReactNode;
}

export function Message({ role, agent, children }: MessageProps) {
  const isUser = role === 'user';
  
  return (
    <div className={`message-container ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className={`avatar ${isUser ? 'avatar-user' : `avatar-${agent || 'gemini'}`}`}>
            {isUser ? 'U' : (agent?.[0]?.toUpperCase() || 'A')}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--text-secondary)] mb-1">
              {isUser ? 'You' : agent || 'Assistant'}
            </div>
            <div className="text-[var(--text-primary)]">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <span />
      <span />
      <span />
    </div>
  );
}

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'loading';
  label: string;
}

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`status-dot ${status === 'offline' ? 'offline' : ''}`} />
      <span className="text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}
