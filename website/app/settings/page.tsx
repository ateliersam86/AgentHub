'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout';
import { AgentName } from '@/lib/agents/executor';

interface AgentStatus {
  available: boolean;
  name: string;
}

export default function SettingsPage() {
  const [agents, setAgents] = useState<Record<AgentName, AgentStatus> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents/status')
      .then((res) => res.json())
      .then((data) => setAgents(data.agents))
      .catch(console.error);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/sync/cli-history', { method: 'POST' });
      const data = await res.json();
      setSyncResult(`Synced ${data.importedBrainstorms} brainstorms and ${data.importedConversations} conversations`);
    } catch (error) {
      setSyncResult(`Error: ${error}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <Header title="Settings" subtitle="Configure your agents and sync data" />

      {/* Sync */}
      <div className="card mb-6">
        <h3 className="font-medium mb-4">CLI Sync</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Import conversations from CLI into the web dashboard.
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn btn-primary"
        >
          {syncing ? 'Syncing...' : 'Sync CLI History'}
        </button>
        {syncResult && (
          <p className="text-sm text-[var(--accent-codex)] mt-3">{syncResult}</p>
        )}
      </div>

      {/* Agent Status */}
      <div className="card mb-6">
        <h3 className="font-medium mb-4">Agents</h3>
        
        {agents ? (
          <div className="space-y-3">
            {(Object.entries(agents) as [AgentName, AgentStatus][]).map(([key, config]) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)]"
              >
                <div className="flex items-center gap-3">
                  <span className={`status-dot ${config.available ? '' : 'offline'}`} />
                  <span className="font-medium">{config.name}</span>
                </div>
                <span className={`text-xs ${config.available ? 'text-[var(--accent-codex)]' : 'text-[var(--text-muted)]'}`}>
                  {config.available ? 'Ready' : 'Not configured'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--text-muted)]">Loading...</p>
        )}
      </div>

      {/* System */}
      <div className="card">
        <h3 className="font-medium mb-4">System</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">Database</span>
            <span className="font-mono text-xs">~/.agent-hub/conversations.db</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">Host</span>
            <span>Mac Mini</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">Version</span>
            <span>1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
