/**
 * Agent Daemon v2.0 - Multi-Project Terminal Hub
 * 
 * WebSocket server that provides:
 * 1. Interactive terminal sessions per project (PTY)
 * 2. Real-time output streaming to web clients
 * 3. Multi-project support with session management
 * 
 * SECURITY: Binds to 0.0.0.0 for network access, requires auth token
 */

import { WebSocketServer, WebSocket } from 'ws';
import { getAuthToken, validateToken, loadState, updateState, addRecentProject } from './state.js';
import { streamGeminiResponse } from './gemini-api.js';
import { terminalManager, TerminalEvent, SessionInfo } from './terminal-manager.js';
import { cliChatManager, ChatSessionInfo } from './cli-chat-manager.js';
import { CLIEvent } from './cli-parser.js';
import * as os from 'os';

const PORT = 3100;
// Allow network access so web can connect from other devices
const HOST = '0.0.0.0';

interface IncomingMessage {
  type: 
    | 'chat' 
    | 'switch-project' 
    | 'list-projects' 
    | 'status' 
    | 'stop'
    // Terminal commands
    | 'terminal-create'
    | 'terminal-write'
    | 'terminal-resize'
    | 'terminal-close'
    | 'terminal-list'
    | 'terminal-subscribe'
    | 'terminal-unsubscribe'
    | 'terminal-run-gemini'
    // CLI Chat commands
    | 'cli-chat-create'
    | 'cli-chat-send'
    | 'cli-chat-subscribe'
    | 'cli-chat-list'
    | 'cli-chat-close';
  token: string;
  message?: string;
  projectPath?: string;
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  warmMode?: boolean;
  context?: { role: 'user' | 'model'; text: string }[];
}

interface OutgoingMessage {
  type: 
    | 'output' 
    | 'error' 
    | 'status' 
    | 'projects' 
    | 'ready' 
    | 'complete' 
    | 'token'
    // Terminal events
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
  status?: ReturnType<typeof loadState>;
  projects?: string[];
  token?: string;
  sessionId?: string;
  exitCode?: number;
  sessions?: SessionInfo[];
}

// Track connected clients and their terminal subscriptions
interface ClientState {
  ws: WebSocket;
  subscriptions: Set<string>; // Set of sessionIds
  unsubscribeFns: Map<string, () => void>; // sessionId -> unsubscribe function
}

const clients = new Map<WebSocket, ClientState>();

/**
 * Broadcast message to all connected clients
 */
function broadcast(message: OutgoingMessage): void {
  const data = JSON.stringify(message);
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * Send to specific client
 */
function sendTo(ws: WebSocket, message: OutgoingMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Handle incoming message from client
 */
async function handleMessage(ws: WebSocket, raw: string): Promise<void> {
  let msg: IncomingMessage;
  
  try {
    msg = JSON.parse(raw);
  } catch {
    sendTo(ws, { type: 'error', data: 'Invalid JSON' });
    return;
  }

  // SECURITY: Validate auth token
  if (!validateToken(msg.token)) {
    console.warn('[Security] Invalid auth token received');
    sendTo(ws, { type: 'error', data: 'Invalid auth token' });
    return;
  }

  const clientState = clients.get(ws);
  if (!clientState) return;

  switch (msg.type) {
    // === Original commands ===
    case 'status':
      sendTo(ws, { type: 'status', status: loadState() });
      break;

    case 'list-projects':
      const state = loadState();
      sendTo(ws, { type: 'projects', projects: state.recentProjects });
      break;

    case 'switch-project':
      if (!msg.projectPath) {
        sendTo(ws, { type: 'error', data: 'projectPath required' });
        return;
      }
      
      console.log(`[Daemon] Switching to project: ${msg.projectPath}`);
      
      addRecentProject(msg.projectPath);
      updateState({ 
        activeProject: msg.projectPath, 
        status: 'ready' 
      });
      
      broadcast({ type: 'ready', data: `Project loaded: ${msg.projectPath}` });
      broadcast({ type: 'status', status: loadState() });
      break;

    case 'chat':
      if (!msg.message) {
        sendTo(ws, { type: 'error', data: 'message required' });
        return;
      }

      const currentState = loadState();
      if (!currentState.activeProject) {
        sendTo(ws, { type: 'error', data: 'No project selected. Switch to a project first.' });
        return;
      }

      console.log(`[Daemon] Chat: ${msg.message.slice(0, 50)}...`);

      try {
        await streamGeminiResponse(
          msg.message,
          currentState.activeProject,
          {
            onToken: (token) => {
              sendTo(ws, { type: 'token', token });
            },
            onComplete: (fullText) => {
              sendTo(ws, { type: 'complete', data: fullText });
            },
            onError: (error) => {
              sendTo(ws, { type: 'error', data: error.message });
            },
          },
          msg.context
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        sendTo(ws, { type: 'error', data: errorMsg });
      }
      break;

    case 'stop':
      console.log('[Daemon] Clearing project...');
      updateState({ activeProject: null, status: 'idle' });
      broadcast({ type: 'status', status: loadState() });
      break;

    // === Terminal commands ===
    case 'terminal-create':
      if (!msg.projectPath) {
        sendTo(ws, { type: 'error', data: 'projectPath required' });
        return;
      }
      
      console.log(`[Daemon] Creating terminal for: ${msg.projectPath}`);
      
      try {
        const session = terminalManager.getOrCreateSession(msg.projectPath);
        
        // Auto-subscribe client to this terminal
        const unsubCreate = terminalManager.subscribe(session.id, (event) => {
          handleTerminalEvent(ws, event);
        });
        
        clientState.subscriptions.add(session.id);
        clientState.unsubscribeFns.set(session.id, unsubCreate);
        
        // Add to recent projects
        addRecentProject(msg.projectPath);
        
        sendTo(ws, { 
          type: 'terminal-created', 
          sessionId: session.id,
          data: session.projectName
        });
        
        // Broadcast updated list to all
        broadcast({ type: 'terminal-list', sessions: terminalManager.listSessions() });
      } catch (err: any) {
        console.error(`[Daemon] Terminal creation failed: ${err.message}`);
        sendTo(ws, { type: 'error', data: `Failed to create terminal: ${err.message}` });
      }
      break;

    case 'terminal-write':
      if (!msg.sessionId || msg.data === undefined) {
        sendTo(ws, { type: 'error', data: 'sessionId and data required' });
        return;
      }
      
      if (!terminalManager.write(msg.sessionId, msg.data)) {
        sendTo(ws, { type: 'error', data: 'Session not found' });
      }
      break;

    case 'terminal-resize':
      if (!msg.sessionId || !msg.cols || !msg.rows) {
        sendTo(ws, { type: 'error', data: 'sessionId, cols, and rows required' });
        return;
      }
      
      terminalManager.resize(msg.sessionId, msg.cols, msg.rows);
      break;

    case 'terminal-close':
      if (!msg.sessionId) {
        sendTo(ws, { type: 'error', data: 'sessionId required' });
        return;
      }
      
      terminalManager.close(msg.sessionId);
      sendTo(ws, { type: 'terminal-closed', sessionId: msg.sessionId });
      break;

    case 'terminal-list':
      const sessions = terminalManager.listSessions();
      sendTo(ws, { type: 'terminal-list', sessions });
      break;

    case 'terminal-subscribe':
      if (!msg.sessionId) {
        sendTo(ws, { type: 'error', data: 'sessionId required' });
        return;
      }
      
      console.log(`[Daemon] Client subscribing to terminal: ${msg.sessionId}`);
      if (!clientState.subscriptions.has(msg.sessionId)) {
        const unsub = terminalManager.subscribe(msg.sessionId, (event) => {
          handleTerminalEvent(ws, event);
        });
        clientState.subscriptions.add(msg.sessionId);
        clientState.unsubscribeFns.set(msg.sessionId, unsub);
        console.log(`[Daemon] Subscribed to terminal: ${msg.sessionId}`);
      } else {
        console.log(`[Daemon] Already subscribed to terminal: ${msg.sessionId}`);
      }
      break;

    case 'terminal-unsubscribe':
      if (!msg.sessionId) {
        sendTo(ws, { type: 'error', data: 'sessionId required' });
        return;
      }
      
      const unsubFn = clientState.unsubscribeFns.get(msg.sessionId);
      if (unsubFn) {
        unsubFn();
        clientState.subscriptions.delete(msg.sessionId);
        clientState.unsubscribeFns.delete(msg.sessionId);
      }
      break;

    case 'terminal-run-gemini':
      if (!msg.sessionId) {
        sendTo(ws, { type: 'error', data: 'sessionId required' });
        return;
      }
      
      console.log(`[Daemon] Starting Gemini in session ${msg.sessionId}`);
      terminalManager.runCommand(msg.sessionId, 'gemini');
      break;

    // ========== CLI Chat Commands ==========
    
    case 'cli-chat-create':
      if (!msg.projectPath) {
        sendTo(ws, { type: 'error', data: 'projectPath required' });
        return;
      }
      
      try {
        console.log(`[Daemon] Creating CLI chat for: ${msg.projectPath}`);
        const chatSession = await cliChatManager.create(msg.projectPath);
        sendTo(ws, { 
          type: 'cli-chat-created', 
          sessionId: chatSession.id,
          data: chatSession.model || 'gemini',
        });
      } catch (error) {
        console.error(`[Daemon] CLI chat creation failed:`, error);
        sendTo(ws, { type: 'error', data: `Failed to create CLI chat: ${error}` });
      }
      break;

    case 'cli-chat-send':
      if (!msg.sessionId || !msg.message) {
        sendTo(ws, { type: 'error', data: 'sessionId and message required' });
        return;
      }
      
      console.log(`[Daemon] CLI chat send to ${msg.sessionId}`);
      if (!cliChatManager.send(msg.sessionId, msg.message)) {
        sendTo(ws, { type: 'error', data: 'Failed to send message' });
      }
      break;

    case 'cli-chat-subscribe':
      if (!msg.sessionId) {
        sendTo(ws, { type: 'error', data: 'sessionId required' });
        return;
      }
      
      console.log(`[Daemon] CLI chat subscribe to ${msg.sessionId}`);
      const chatUnsub = cliChatManager.subscribe(msg.sessionId, (event: CLIEvent) => {
        sendTo(ws, {
          type: 'cli-chat-event',
          sessionId: msg.sessionId,
          data: JSON.stringify(event),
        });
      });
      clientState.unsubscribeFns.set(`chat_${msg.sessionId}`, chatUnsub);
      break;

    case 'cli-chat-list':
      const chatSessions = cliChatManager.listSessions();
      sendTo(ws, { 
        type: 'cli-chat-list', 
        data: JSON.stringify(chatSessions),
      });
      break;

    case 'cli-chat-close':
      if (!msg.sessionId) {
        sendTo(ws, { type: 'error', data: 'sessionId required' });
        return;
      }
      
      console.log(`[Daemon] Closing CLI chat ${msg.sessionId}`);
      cliChatManager.close(msg.sessionId);
      break;

    default:
      sendTo(ws, { type: 'error', data: `Unknown message type: ${msg.type}` });
  }
}

/**
 * Handle terminal events and forward to client
 */
function handleTerminalEvent(ws: WebSocket, event: TerminalEvent): void {
  switch (event.type) {
    case 'output':
      sendTo(ws, { 
        type: 'terminal-output', 
        sessionId: event.sessionId, 
        data: event.data 
      });
      break;
    case 'exit':
      sendTo(ws, { 
        type: 'terminal-exit', 
        sessionId: event.sessionId, 
        exitCode: event.exitCode 
      });
      break;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║        Agent Daemon v2.0 - Terminal Hub           ║');
  console.log('║   Multi-Project Interactive Terminals via Web     ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  // Get/generate auth token
  const token = getAuthToken();
  console.log(`[Auth] Token stored at: ~/.agent-hub/auth-token`);
  console.log(`[Auth] Full token: ${token}`);
  console.log('');

  // Create WebSocket server
  const wss = new WebSocketServer({ 
    host: HOST, 
    port: PORT,
  });

  const localIP = getLocalIP();
  console.log(`[Server] Listening on ws://${HOST}:${PORT}`);
  console.log(`[Server] Local access: ws://localhost:${PORT}`);
  if (localIP) {
    console.log(`[Server] Network access: ws://${localIP}:${PORT}`);
  }
  console.log('');

  // Handle connections
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[Server] Client connected from ${ip}`);
    
    // Initialize client state
    clients.set(ws, {
      ws,
      subscriptions: new Set(),
      unsubscribeFns: new Map(),
    });

    // Send current status and terminal list
    sendTo(ws, { type: 'status', status: loadState() });
    sendTo(ws, { type: 'terminal-list', sessions: terminalManager.listSessions() });

    ws.on('message', async (data) => {
      await handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      console.log(`[Server] Client disconnected from ${ip}`);
      
      // Cleanup subscriptions
      const clientState = clients.get(ws);
      if (clientState) {
        for (const unsubFn of clientState.unsubscribeFns.values()) {
          unsubFn();
        }
      }
      
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error(`[Server] WebSocket error:`, err);
      clients.delete(ws);
    });
  });

  // Display active project if exists
  const state = loadState();
  if (state.activeProject) {
    console.log(`[Daemon] Active project: ${state.activeProject}`);
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n[Daemon] Shutting down...');
    terminalManager.closeAll();
    wss.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Get local IP address for network access
 */
function getLocalIP(): string | undefined {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return undefined;
}

main().catch(console.error);
