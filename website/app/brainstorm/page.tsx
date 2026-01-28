'use client';

import { useState } from 'react';
import { Header } from '@/components/layout';
import { ChatInput, Message, TypingIndicator } from '@/components/ui';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { AgentName } from '@/lib/agents/executor';

interface BrainstormResult {
  response?: string;
  error?: string;
  elapsed?: number;
}

const AGENT_NAMES: Record<string, string> = {
  gemini: 'Gemini',
  codex: 'Codex',
};

export default function BrainstormPage() {
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState<Record<AgentName, BrainstormResult> | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalElapsed, setTotalElapsed] = useState<number | null>(null);

  const handleBrainstorm = async (inputPrompt: string) => {
    setPrompt(inputPrompt);
    setLoading(true);
    setResults(null);

    try {
      const res = await fetch('/api/agents/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inputPrompt }),
      });

      const data = await res.json();
      setResults(data.results);
      setTotalElapsed(data.totalElapsed);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[var(--border-primary)]">
        <h1 className="text-lg font-medium">Brainstorm</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Get perspectives from all agents simultaneously
        </p>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="max-w-3xl mx-auto">
            <div className="card mb-4">
              <p className="text-sm text-[var(--text-secondary)] mb-2">Prompt</p>
              <p>{prompt}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {['gemini', 'codex'].map((agent) => (
                <div key={agent} className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`avatar avatar-${agent}`}>
                      {AGENT_NAMES[agent][0]}
                    </div>
                    <span className="font-medium">{AGENT_NAMES[agent]}</span>
                  </div>
                  <TypingIndicator />
                </div>
              ))}
            </div>
          </div>
        ) : results ? (
          <div className="max-w-4xl mx-auto">
            {/* Prompt */}
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[var(--text-secondary)]">Prompt</span>
                {totalElapsed && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {totalElapsed.toFixed(1)}s total
                  </span>
                )}
              </div>
              <p className="text-lg">{prompt}</p>
            </div>

            {/* Results */}
            <div className="grid gap-6 md:grid-cols-2">
              {Object.entries(results).map(([agent, result]) => (
                <div key={agent} className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`avatar avatar-${agent}`}>
                        {AGENT_NAMES[agent]?.[0] || agent[0].toUpperCase()}
                      </div>
                      <span className="font-medium">{AGENT_NAMES[agent] || agent}</span>
                    </div>
                    {result.elapsed && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {result.elapsed.toFixed(1)}s
                      </span>
                    )}
                  </div>
                  
                  <div className="max-h-96 overflow-y-auto">
                    {result.error ? (
                      <p className="text-red-400 text-sm">{result.error}</p>
                    ) : result.response ? (
                      <MarkdownRenderer content={result.response} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
              </div>
              <h2 className="text-xl font-medium mb-2">Multi-Agent Brainstorm</h2>
              <p className="text-[var(--text-secondary)] text-sm">
                Enter a topic below to get perspectives from all available agents.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--border-primary)]">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            onSend={handleBrainstorm}
            disabled={loading}
            placeholder="What would you like to brainstorm?"
          />
        </div>
      </div>
    </div>
  );
}
