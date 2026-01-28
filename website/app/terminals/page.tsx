'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { daemonClient, DaemonState } from '@/lib/daemon-client';
import Link from 'next/link';

interface TerminalSession {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  lastActivity: string;
  bufferLines: number;
}

export default function TerminalsPage() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [connected, setConnected] = useState(false);
  const [daemonState, setDaemonState] = useState<DaemonState | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    daemonClient.connect();
    
    const checkConnection = setInterval(() => {
      setConnected(daemonClient.isConnected());
    }, 1000);

    const unsubscribe = daemonClient.subscribe((msg) => {
      if (msg.type === 'status' && msg.status) {
        setDaemonState(msg.status);
      } else if (msg.type === 'terminal-list' && (msg as any).sessions) {
        setSessions((msg as any).sessions);
      } else if (msg.type === 'terminal-created') {
        // Refresh session list
        daemonClient.requestTerminalList();
      } else if (msg.type === 'error') {
        setError(msg.data || 'Unknown error');
        setTimeout(() => setError(null), 5000);
      }
    });

    // Request current sessions on connection
    const requestSessions = setInterval(() => {
      if (daemonClient.isConnected()) {
        daemonClient.requestTerminalList();
      }
    }, 2000);

    return () => {
      clearInterval(checkConnection);
      clearInterval(requestSessions);
      unsubscribe();
    };
  }, []);

  const handleCreateTerminal = () => {
    if (!newProjectPath.trim()) return;
    
    daemonClient.createTerminal(newProjectPath.trim());
    setNewProjectPath('');
    setShowSetup(false);
  };

  const setupInstructions = `
# Agent Hub Terminal Setup

## 1. Start the Daemon

\`\`\`bash
cd ~/AgentHub/daemon
npm run dev
\`\`\`

## 2. Copy your auth token

The daemon will display your auth token:
\`\`\`
[Auth] Full token: ah_xxxxx...
\`\`\`

Paste it in the settings page or use the button below.

## 3. Create a terminal for your project

Click "New Terminal" and enter your project path.
The terminal will start and you can run \`gemini\` inside it.
`;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold">Agent Hub</Link>
            <span className="text-[var(--color-text-muted)]">/</span>
            <span className="text-lg">Terminals</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">
                {connected ? 'Daemon Connected' : 'Daemon Offline'}
              </span>
            </div>
            
            <button
              onClick={() => setShowSetup(true)}
              className="px-4 py-2 bg-[var(--agent-gemini)] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              + New Terminal
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-3 text-red-400 text-center">
          {error}
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {!connected ? (
          /* Daemon not connected - show setup instructions */
          <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <span className="text-3xl">🔌</span>
              Connect to Agent Hub Daemon
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold mb-4">Quick Start</h3>
                
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--agent-gemini)] text-white flex items-center justify-center font-bold shrink-0">1</div>
                    <div>
                      <p className="font-medium">Start the daemon</p>
                      <code className="text-sm bg-black/30 px-2 py-1 rounded block mt-1">
                        cd ~/AgentHub/daemon && npm run dev
                      </code>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--agent-gemini)] text-white flex items-center justify-center font-bold shrink-0">2</div>
                    <div>
                      <p className="font-medium">Copy the auth token</p>
                      <p className="text-sm text-[var(--color-text-muted)] mt-1">
                        Displayed in the daemon output
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--agent-gemini)] text-white flex items-center justify-center font-bold shrink-0">3</div>
                    <div>
                      <p className="font-medium">Paste token in Settings</p>
                      <Link href="/settings" className="text-[var(--agent-gemini)] text-sm hover:underline">
                        Open Settings →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-black/20 rounded-lg p-4 font-mono text-sm text-green-400">
                <div className="text-[var(--color-text-muted)] mb-2"># Terminal output:</div>
                <div>╔═══════════════════════════════════════════════════╗</div>
                <div>║        Agent Daemon v2.0 - Terminal Hub           ║</div>
                <div>╚═══════════════════════════════════════════════════╝</div>
                <div className="mt-2">[Auth] Full token: ah_xxxxxxxx...</div>
                <div>[Server] Listening on ws://0.0.0.0:3100</div>
                <div className="animate-pulse">█</div>
              </div>
            </div>
          </div>
        ) : sessions.length === 0 ? (
          /* Connected but no sessions */
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📺</div>
            <h2 className="text-2xl font-bold mb-2">No Terminal Sessions</h2>
            <p className="text-[var(--color-text-muted)] mb-6">
              Create a terminal to start working with Antigravity
            </p>
            <button
              onClick={() => setShowSetup(true)}
              className="px-6 py-3 bg-[var(--agent-gemini)] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              Create Terminal
            </button>
          </div>
        ) : (
          /* Show active sessions */
          <div className="grid gap-4">
            <h2 className="text-xl font-semibold">Active Terminals</h2>
            
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/terminals/${session.id}`}
                className="block bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 hover:border-[var(--agent-gemini)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[var(--agent-gemini)]/10 flex items-center justify-center">
                      <span className="text-2xl">📁</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{session.projectName}</h3>
                      <p className="text-sm text-[var(--color-text-muted)]">{session.projectPath}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-green-400">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm">Active</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      {session.bufferLines} lines in buffer
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* New Terminal Modal */}
      {showSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-elevated)] rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
            <h2 className="text-xl font-bold mb-4">Create New Terminal</h2>
            
            <p className="text-[var(--color-text-muted)] mb-4">
              Enter the full path to your project. A terminal will be created and you can run Antigravity commands inside.
            </p>
            
            <input
              type="text"
              value={newProjectPath}
              onChange={(e) => setNewProjectPath(e.target.value)}
              placeholder="/Users/sam/MyProject"
              className="w-full px-4 py-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg mb-4 font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTerminal()}
              autoFocus
            />
            
            <div className="bg-black/20 rounded-lg p-3 mb-4 text-sm">
              <p className="text-[var(--color-text-muted)]">💡 Tips:</p>
              <ul className="list-disc list-inside text-[var(--color-text-muted)] mt-1 space-y-1">
                <li>Use absolute paths (starting with /)</li>
                <li>Run <code className="bg-black/30 px-1 rounded">gemini</code> in the terminal to start Antigravity</li>
                <li>Output will be visible in real-time</li>
              </ul>
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSetup(false)}
                className="px-4 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTerminal}
                disabled={!newProjectPath.trim()}
                className="px-4 py-2 bg-[var(--agent-gemini)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
              >
                Create Terminal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
