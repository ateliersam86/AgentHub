/**
 * Daemon Client v2.0
 * WebSocket client for communicating with the local agent-daemon
 * Supports multi-project terminal sessions
 */

export interface DaemonState {
  activeProject: string | null;
  recentProjects: string[];
  cliPid: number | null;
  status: 'idle' | 'starting' | 'ready' | 'error';
  lastError?: string;
}

export interface TerminalSession {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  lastActivity: string;
  bufferLines: number;
}

export interface DaemonMessage {
  type: 
    | 'output' 
    | 'error' 
    | 'status' 
    | 'projects' 
    | 'ready' 
    | 'complete'
    | 'terminal-output'
    | 'terminal-exit'
    | 'terminal-created'
    | 'terminal-list'
    | 'terminal-closed'
    // CLI Chat events
    | 'cli-chat-event'
    | 'cli-chat-created'
    | 'cli-chat-list';
  data?: string;
  status?: DaemonState;
  projects?: string[];
  sessionId?: string;
  exitCode?: number;
  sessions?: TerminalSession[];
}

type MessageHandler = (msg: DaemonMessage) => void;

class DaemonClient {
  private ws: WebSocket | null = null;
  private authToken: string | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private daemonUrl: string = 'ws://localhost:3100';

  constructor() {
    // Only run in browser
    if (typeof window !== 'undefined') {
      this.loadAuthToken();
      this.loadDaemonUrl();
    }
  }

  /**
   * Load auth token from localStorage
   */
  private loadAuthToken(): void {
    this.authToken = localStorage.getItem('daemon-auth-token');
  }

  /**
   * Load daemon URL from localStorage (allows network access)
   */
  private loadDaemonUrl(): void {
    const storedUrl = localStorage.getItem('daemon-url');
    if (storedUrl) {
      this.daemonUrl = storedUrl;
    }
  }

  /**
   * Set auth token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    localStorage.setItem('daemon-auth-token', token);
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Set daemon URL (for network access)
   */
  setDaemonUrl(url: string): void {
    this.daemonUrl = url;
    localStorage.setItem('daemon-url', url);
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Get current daemon URL
   */
  getDaemonUrl(): string {
    return this.daemonUrl;
  }

  /**
   * Connect to the daemon
   */
  connect(): void {
    if (typeof window === 'undefined') return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      console.log(`[Daemon] Connecting to ${this.daemonUrl}...`);
      this.ws = new WebSocket(this.daemonUrl);

      this.ws.onopen = () => {
        console.log('[Daemon] Connected');
        this.connected = true;
        this.requestStatus();
        this.requestTerminalList();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: DaemonMessage = JSON.parse(event.data);
          this.handlers.forEach(handler => handler(msg));
        } catch (err) {
          console.error('[Daemon] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[Daemon] Disconnected');
        this.connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[Daemon] WebSocket error:', err);
        this.connected = false;
      };
    } catch (err) {
      console.error('[Daemon] Failed to connect:', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from daemon
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  /**
   * Send a message to the daemon (public for terminal commands)
   */
  send(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Daemon] Not connected, cannot send message');
      return;
    }

    if (!this.authToken) {
      console.warn('[Daemon] No auth token set');
      return;
    }

    this.ws.send(JSON.stringify({
      type,
      token: this.authToken,
      ...payload,
    }));
  }

  // === Status & Projects ===

  requestStatus(): void {
    this.send('status');
  }

  requestProjects(): void {
    this.send('list-projects');
  }

  switchProject(projectPath: string): void {
    this.send('switch-project', { projectPath });
  }

  chat(message: string): void {
    this.send('chat', { message });
  }

  stop(): void {
    this.send('stop');
  }

  // === Terminal Commands ===

  /**
   * Request list of active terminal sessions
   */
  requestTerminalList(): void {
    this.send('terminal-list');
  }

  /**
   * Create a new terminal for a project
   */
  createTerminal(projectPath: string): void {
    this.send('terminal-create', { projectPath });
  }

  /**
   * Write data to a terminal
   */
  terminalWrite(sessionId: string, data: string): void {
    this.send('terminal-write', { sessionId, data });
  }

  /**
   * Resize a terminal
   */
  terminalResize(sessionId: string, cols: number, rows: number): void {
    this.send('terminal-resize', { sessionId, cols, rows });
  }

  /**
   * Close a terminal session
   */
  terminalClose(sessionId: string): void {
    this.send('terminal-close', { sessionId });
  }

  /**
   * Subscribe to a terminal's output
   */
  terminalSubscribe(sessionId: string): void {
    this.send('terminal-subscribe', { sessionId });
  }

  /**
   * Unsubscribe from a terminal's output
   */
  terminalUnsubscribe(sessionId: string): void {
    this.send('terminal-unsubscribe', { sessionId });
  }

  /**
   * Run gemini command in a terminal
   */
  terminalRunGemini(sessionId: string): void {
    this.send('terminal-run-gemini', { sessionId });
  }

  // === CLI Chat Methods ===

  /**
   * Create a new CLI chat session
   */
  cliChatCreate(projectPath: string): void {
    this.send('cli-chat-create', { projectPath });
  }

  /**
   * Send a message to CLI chat
   */
  cliChatSend(sessionId: string, message: string): void {
    this.send('cli-chat-send', { sessionId, message });
  }

  /**
   * Subscribe to CLI chat events
   */
  cliChatSubscribe(sessionId: string): void {
    this.send('cli-chat-subscribe', { sessionId });
  }

  /**
   * List CLI chat sessions
   */
  cliChatList(): void {
    this.send('cli-chat-list', {});
  }

  /**
   * Close CLI chat session
   */
  cliChatClose(sessionId: string): void {
    this.send('cli-chat-close', { sessionId });
  }

  // === Subscriptions ===

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  hasAuthToken(): boolean {
    return !!this.authToken;
  }
}

// Singleton instance
export const daemonClient = new DaemonClient();
