'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { daemonClient } from '@/lib/daemon-client';

// Dynamic import for xterm (client-side only)
let Terminal: any;
let FitAddon: any;
let WebLinksAddon: any;

export default function TerminalViewPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const connectedRef = useRef(false);
  
  const [connected, setConnected] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize xterm
  useEffect(() => {
    let mounted = true;
    
    const initTerminal = async () => {
      if (!terminalRef.current || termRef.current) return;
      
      // Dynamic imports
      const xtermModule = await import('@xterm/xterm');
      const fitModule = await import('@xterm/addon-fit');
      const linksModule = await import('@xterm/addon-web-links');
      
      // @ts-ignore - import CSS
      await import('@xterm/xterm/css/xterm.css');
      
      if (!mounted) return;
      
      Terminal = xtermModule.Terminal;
      FitAddon = fitModule.FitAddon;
      WebLinksAddon = linksModule.WebLinksAddon;
      
      // Create terminal
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#0a0a0a',
          foreground: '#e0e0e0',
          cursor: '#00ff88',
          cursorAccent: '#000',
          selectionBackground: 'rgba(255,255,255,0.2)',
          black: '#000000',
          red: '#ff6b6b',
          green: '#69db7c',
          yellow: '#fcc419',
          blue: '#4dabf7',
          magenta: '#da77f2',
          cyan: '#66d9e8',
          white: '#e0e0e0',
          brightBlack: '#666666',
          brightRed: '#ff8787',
          brightGreen: '#8ce99a',
          brightYellow: '#ffe066',
          brightBlue: '#74c0fc',
          brightMagenta: '#e599f7',
          brightCyan: '#99e9f2',
          brightWhite: '#ffffff',
        },
        allowTransparency: true,
        scrollback: 10000,
      });
      
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      
      term.open(terminalRef.current);
      fitAddon.fit();
      
      termRef.current = term;
      fitAddonRef.current = fitAddon;
      
      // Handle input - always send, daemonClient checks connection internally
      term.onData((data: string) => {
        daemonClient.terminalWrite(sessionId, data);
      });
      
      // Handle resize
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        daemonClient.terminalResize(sessionId, cols, rows);
      });
      
      setIsLoading(false);
    };
    
    initTerminal();
    
    return () => {
      mounted = false;
      termRef.current?.dispose();
    };
  }, [sessionId]);  // Only re-run on sessionId change

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      fitAddonRef.current?.fit();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Connect to daemon
  useEffect(() => {
    daemonClient.connect();
    let hasSubscribed = false;
    
    // Subscribe immediately if already connected
    if (daemonClient.isConnected()) {
      console.log('[Terminal] Already connected, subscribing immediately');
      daemonClient.terminalSubscribe(sessionId);
      daemonClient.requestTerminalList();
      hasSubscribed = true;
      setConnected(true);
      connectedRef.current = true;
    }
    
    // Check connection status more frequently (200ms) and subscribe when connected
    const checkConnection = setInterval(() => {
      const isConnected = daemonClient.isConnected();
      setConnected(isConnected);
      connectedRef.current = isConnected;
      
      // Subscribe once when we first connect
      if (isConnected && !hasSubscribed) {
        console.log('[Terminal] Connected, subscribing to session:', sessionId);
        daemonClient.terminalSubscribe(sessionId);
        daemonClient.requestTerminalList();
        hasSubscribed = true;
      }
    }, 200);  // Check every 200ms instead of 1000ms

    const unsubscribe = daemonClient.subscribe((msg) => {
      console.log('[Terminal] Received message:', msg.type);
      if (msg.type === 'terminal-output' && (msg as any).sessionId === sessionId) {
        console.log('[Terminal] Writing output, length:', ((msg as any).data || '').length);
        termRef.current?.write((msg as any).data || '');
      } else if (msg.type === 'terminal-exit' && (msg as any).sessionId === sessionId) {
        termRef.current?.write('\r\n\x1b[31m[Session ended]\x1b[0m\r\n');
        setError('Terminal session ended');
      } else if (msg.type === 'terminal-list') {
        const sessions = (msg as any).sessions || [];
        const session = sessions.find((s: any) => s.id === sessionId);
        if (session) {
          setProjectName(session.projectName);
        }
      } else if (msg.type === 'error') {
        setError(msg.data || 'Unknown error');
      }
    });

    // Request session info
    setTimeout(() => {
      daemonClient.requestTerminalList();
    }, 500);

    return () => {
      clearInterval(checkConnection);
      unsubscribe();
      daemonClient.terminalUnsubscribe(sessionId);
    };
  }, [sessionId]);  // Don't include connected in dependencies

  const handleClose = () => {
    if (confirm('Are you sure you want to close this terminal?')) {
      daemonClient.terminalClose(sessionId);
      router.push('/terminals');
    }
  };

  const handleRunGemini = () => {
    daemonClient.terminalRunGemini(sessionId);
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link 
            href="/terminals"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
          <div className="h-4 w-px bg-[var(--color-border)]" />
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="font-mono font-medium">
              {projectName || sessionId.slice(0, 12)}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunGemini}
            className="px-3 py-1.5 text-sm bg-[var(--agent-gemini)] text-white rounded-lg hover:opacity-90"
          >
            ▶ Run Gemini
          </button>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
          >
            Close
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-red-400 text-sm flex items-center justify-between shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-300">✕</button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[var(--color-text-muted)]">Loading terminal...</div>
        </div>
      )}

      {/* Terminal container */}
      <div 
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ 
          background: '#0a0a0a',
          opacity: isLoading ? 0 : 1,
          minHeight: '400px',
          height: '100%',
        }}
      />

      {/* Footer with tips */}
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-1.5 text-xs text-[var(--color-text-muted)] shrink-0">
        <span className="opacity-50">💡</span> Type commands like normal. Press <kbd className="bg-black/30 px-1 rounded">Ctrl+C</kbd> to interrupt.
        {!connected && <span className="ml-4 text-yellow-500">⚠ Disconnected - reconnecting...</span>}
      </footer>
    </div>
  );
}
