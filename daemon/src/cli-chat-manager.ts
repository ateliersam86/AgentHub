/**
 * CLI Chat Manager v4
 * 
 * Simplified: Only cold mode (spawn per message) which works reliably.
 * Real-time streaming limitation is a Gemini CLI issue - it buffers output.
 * Frontend handles perceived streaming via typewriter animation.
 */

import * as os from 'os';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { parseCLILine, CLIEvent, MessageAccumulator } from './cli-parser';
import { stripAnsi } from './terminal-parser';

export interface ChatSession {
  id: string;
  projectPath: string;
  projectName: string;
  subscribers: Set<(event: CLIEvent) => void>;
  isReady: boolean;
  model?: string;
  createdAt: Date;
  currentProcess?: ChildProcess;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
}

export interface ChatSessionInfo {
  id: string;
  projectPath: string;
  projectName: string;
  model?: string;
  isReady: boolean;
  createdAt: string;
}

class CLIChatManager {
  private sessions = new Map<string, ChatSession>();
  private geminiPath: string;

  constructor() {
    this.geminiPath = 'gemini';
  }

  private generateId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new CLI chat session
   */
  async create(projectPath: string): Promise<ChatSession> {
    const sessionId = this.generateId();
    const projectName = path.basename(projectPath);

    console.log(`[CLIChat] Creating session ${sessionId} for: ${projectName}`);

    const session: ChatSession = {
      id: sessionId,
      projectPath,
      projectName,
      subscribers: new Set(),
      isReady: true,
      model: 'gemini-3-pro',
      createdAt: new Date(),
      conversationHistory: [],
    };

    this.sessions.set(sessionId, session);

    this.broadcast(session, {
      type: 'init',
      timestamp: new Date(),
      sessionId,
      model: session.model,
    });

    return session;
  }

  /**
   * Send a message to the CLI
   */
  send(sessionId: string, message: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[CLIChat] Session not found: ${sessionId}`);
      return false;
    }

    console.log(`[CLIChat] Sending: ${message.slice(0, 50)}...`);

    // Add to history
    session.conversationHistory.push({ role: 'user', content: message });

    // Emit user message
    this.broadcast(session, {
      type: 'user_message',
      timestamp: new Date(),
      role: 'user',
      content: message,
    });

    // Emit thinking
    this.broadcast(session, {
      type: 'thinking',
      timestamp: new Date(),
    });

    // Spawn gemini with stream-json
    const args = ['-o', 'stream-json', '-p', message];
    
    console.log(`[CLIChat] Spawning: gemini ${args.join(' ')}`);
    
    const geminiProcess = spawn(this.geminiPath, args, {
      cwd: session.projectPath,
      env: {
        ...process.env,
        HOME: os.homedir(),
        PATH: process.env.PATH,
        SHELL: process.env.SHELL || '/bin/zsh',
      },
    });

    session.currentProcess = geminiProcess;
    const accumulator = new MessageAccumulator();
    let lineBuffer = '';
    const startTime = Date.now();

    geminiProcess.stdout?.on('data', (data: Buffer) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        const event = parseCLILine(line);
        if (event) {
          if (event.type === 'assistant_chunk') {
            const fullContent = accumulator.addChunk(event.content || '');
            // Broadcast with full accumulated content
            this.broadcast(session, { 
              ...event, 
              content: fullContent,
              isStreaming: true,
            });
          } else if (event.type === 'complete') {
            const finalContent = accumulator.complete();
            if (finalContent) {
              session.conversationHistory.push({ role: 'assistant', content: finalContent });
            }
            // Add duration if not present
            if (event.stats && !event.stats.durationMs) {
              event.stats.durationMs = Date.now() - startTime;
            }
            this.broadcast(session, event);
            accumulator.reset();
          } else {
            this.broadcast(session, event);
          }
        }
      }
    });

    geminiProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      // Skip noise
      if (!text.includes('Loaded') && !text.includes('Hook') && !text.includes('registry')) {
        console.log(`[CLIChat] stderr: ${text.trim()}`);
      }
    });

    geminiProcess.on('close', (code) => {
      console.log(`[CLIChat] Process exited with code ${code}`);
      session.currentProcess = undefined;
      if (code !== 0) {
        this.broadcast(session, {
          type: 'error',
          timestamp: new Date(),
          content: `Process exited with code ${code}`,
        });
      }
    });

    geminiProcess.on('error', (err) => {
      console.error(`[CLIChat] Process error:`, err);
      this.broadcast(session, {
        type: 'error',
        timestamp: new Date(),
        content: `Process error: ${err.message}`,
      });
    });

    return true;
  }

  /**
   * Subscribe to session events
   */
  subscribe(sessionId: string, callback: (event: CLIEvent) => void): () => void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[CLIChat] Session not found for subscription: ${sessionId}`);
      return () => {};
    }

    session.subscribers.add(callback);
    console.log(`[CLIChat] Subscriber added to ${sessionId}, total: ${session.subscribers.size}`);

    // Emit init for new subscriber if ready
    if (session.isReady) {
      callback({
        type: 'init',
        timestamp: new Date(),
        sessionId,
        model: session.model,
      });
    }

    return () => {
      session.subscribers.delete(callback);
    };
  }

  private broadcast(session: ChatSession, event: CLIEvent): void {
    session.subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (err) {
        console.error(`[CLIChat] Error in subscriber callback:`, err);
      }
    });
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    console.log(`[CLIChat] Closing session ${sessionId}`);
    
    if (session.currentProcess) {
      session.currentProcess.kill();
    }
    
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): ChatSessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      projectPath: session.projectPath,
      projectName: session.projectName,
      model: session.model,
      isReady: session.isReady,
      createdAt: session.createdAt.toISOString(),
    }));
  }

  closeAll(): void {
    console.log(`[CLIChat] Closing all ${this.sessions.size} sessions`);
    this.sessions.forEach((session) => {
      if (session.currentProcess) session.currentProcess.kill();
    });
    this.sessions.clear();
  }
}

export const cliChatManager = new CLIChatManager();
