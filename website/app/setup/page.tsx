'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { daemonClient } from '@/lib/daemon-client';

export default function SetupPage() {
  const [connected, setConnected] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [daemonUrl, setDaemonUrl] = useState('ws://localhost:3100');
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  useEffect(() => {
    daemonClient.connect();
    
    const interval = setInterval(() => {
      setConnected(daemonClient.isConnected());
      if (daemonClient.hasAuthToken()) {
        setSavedToken('configured');
      }
    }, 1000);

    setDaemonUrl(daemonClient.getDaemonUrl());
    
    return () => clearInterval(interval);
  }, []);

  const handleSaveToken = () => {
    if (authToken.trim()) {
      daemonClient.setAuthToken(authToken.trim());
      setSavedToken(authToken.trim());
      setAuthToken('');
    }
  };

  const handleSaveUrl = () => {
    daemonClient.setDaemonUrl(daemonUrl);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold">Agent Hub</Link>
            <span className="text-[var(--color-text-muted)]">/</span>
            <span className="text-lg">Setup</span>
          </div>
          
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
            connected ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-orange-500 animate-pulse'}`} />
            <span className="text-sm font-medium">
              {connected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🔌 Connect Antigravity Project</h1>
          <p className="text-[var(--color-text-muted)]">
            Follow these steps to view and interact with your Antigravity sessions from anywhere.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {/* Step 1: Start Daemon */}
          <div className={`bg-[var(--color-bg-elevated)] rounded-xl border ${
            step >= 1 ? 'border-[var(--agent-gemini)]' : 'border-[var(--color-border)]'
          } p-6`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                connected ? 'bg-green-500 text-white' : 'bg-[var(--agent-gemini)] text-white'
              }`}>
                {connected ? '✓' : '1'}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">Start the Agent Hub Daemon</h2>
                <p className="text-[var(--color-text-muted)] mb-4">
                  The daemon runs on your Mac and manages terminal sessions.
                </p>
                
                <div className="bg-black/30 rounded-lg p-4 font-mono text-sm mb-4">
                  <div className="text-[var(--color-text-muted)]"># Open a terminal and run:</div>
                  <div className="text-green-400 mt-1">cd ~/AgentHub/daemon && npm run dev</div>
                </div>

                {connected ? (
                  <div className="flex items-center gap-2 text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span>Daemon is running!</span>
                  </div>
                ) : (
                  <div className="text-orange-400 text-sm">
                    ⏳ Waiting for daemon connection...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 2: Configure Token */}
          <div className={`bg-[var(--color-bg-elevated)] rounded-xl border ${
            savedToken ? 'border-green-500/50' : 'border-[var(--color-border)]'
          } p-6`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                savedToken ? 'bg-green-500 text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
              }`}>
                {savedToken ? '✓' : '2'}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">Configure Auth Token</h2>
                <p className="text-[var(--color-text-muted)] mb-4">
                  Copy the auth token from the daemon output and paste it here.
                </p>

                <div className="bg-black/30 rounded-lg p-4 font-mono text-sm mb-4">
                  <div className="text-[var(--color-text-muted)]"># Look for this line in daemon output:</div>
                  <div className="text-yellow-400 mt-1">[Auth] Full token: ah_xxxxxxxxxxxxxxxx</div>
                </div>

                {savedToken ? (
                  <div className="flex items-center gap-2 text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span>Token configured!</span>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      placeholder="ah_xxxxx..."
                      className="flex-1 px-4 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg font-mono"
                    />
                    <button
                      onClick={handleSaveToken}
                      className="px-4 py-2 bg-[var(--agent-gemini)] text-white rounded-lg hover:opacity-90"
                    >
                      Save Token
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 3: Remote Access (optional) */}
          <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                3
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">Remote Access (Optional)</h2>
                <p className="text-[var(--color-text-muted)] mb-4">
                  To access from another device, configure the daemon URL with your Mac's IP address.
                </p>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={daemonUrl}
                    onChange={(e) => setDaemonUrl(e.target.value)}
                    placeholder="ws://192.168.1.x:3100"
                    className="flex-1 px-4 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg font-mono"
                  />
                  <button
                    onClick={handleSaveUrl}
                    className="px-4 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg hover:bg-[var(--color-bg-elevated)]"
                  >
                    Update
                  </button>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-300">
                  <strong>💡 Tip:</strong> The daemon displays your network IP at startup.
                  Use <code className="bg-black/20 px-1 rounded">ws://YOUR_IP:3100</code>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Create Terminal */}
          <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                4
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">Create Terminal Session</h2>
                <p className="text-[var(--color-text-muted)] mb-4">
                  Go to the Terminals page and create a session for your project.
                </p>

                <Link
                  href="/terminals"
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
                    connected && savedToken
                      ? 'bg-[var(--agent-gemini)] text-white hover:opacity-90'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)] cursor-not-allowed'
                  }`}
                >
                  <span>📺</span>
                  Go to Terminals
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-12 bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
          <h2 className="text-xl font-semibold mb-4">📚 How It Works</h2>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-2xl mb-2">1️⃣</div>
              <h3 className="font-medium mb-1">Terminal Sessions</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                Each project gets its own terminal. Run <code className="bg-black/30 px-1 rounded">gemini</code> to start Antigravity.
              </p>
            </div>
            
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-2xl mb-2">2️⃣</div>
              <h3 className="font-medium mb-1">Real-time Streaming</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                All terminal output is streamed live to the web interface.
              </p>
            </div>
            
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-2xl mb-2">3️⃣</div>
              <h3 className="font-medium mb-1">Interactive Control</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                Type commands directly in the browser. They're sent to the Mac in real-time.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
