/**
 * Terminal Manager - Gère les sessions PTY pour chaque projet
 * 
 * Chaque projet peut avoir une session terminal interactive
 * accessible via WebSocket depuis le web
 */

import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

interface TerminalSession {
  id: string;
  projectPath: string;
  projectName: string;
  ptyProcess: pty.IPty;
  buffer: string[];
  maxBufferLines: number;
  createdAt: Date;
  lastActivity: Date;
  subscribers: Set<(data: TerminalEvent) => void>;
}

export interface TerminalEvent {
  type: 'output' | 'exit' | 'error' | 'created' | 'list';
  sessionId: string;
  data?: string;
  exitCode?: number;
  sessions?: SessionInfo[];
}

export interface SessionInfo {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  lastActivity: string;
  bufferLines: number;
}

class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private projectToSession = new Map<string, string>(); // projectPath -> sessionId
  private shell: string;
  
  constructor() {
    // Detect shell
    this.shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
  }

  /**
   * Génère un ID unique pour une session
   */
  private generateId(): string {
    return `term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Crée ou récupère une session pour un projet
   */
  getOrCreateSession(projectPath: string): TerminalSession {
    // Check if session already exists for this project
    const existingId = this.projectToSession.get(projectPath);
    if (existingId && this.sessions.has(existingId)) {
      const session = this.sessions.get(existingId)!;
      session.lastActivity = new Date();
      return session;
    }

    // Validate project path exists
    if (!fs.existsSync(projectPath)) {
      console.error(`[Terminal] Project path does not exist: ${projectPath}`);
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Create new session
    const id = this.generateId();
    const projectName = path.basename(projectPath);
    
    console.log(`[Terminal] Creating session ${id} for project: ${projectName}`);
    console.log(`[Terminal] Using shell: ${this.shell}`);
    console.log(`[Terminal] CWD: ${projectPath}`);

    // Build clean environment (avoid spreading potentially problematic vars)
    const cleanEnv: Record<string, string> = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME || os.homedir(),
      USER: process.env.USER || os.userInfo().username,
      SHELL: this.shell,
      TERM: 'xterm-256color',
      LANG: process.env.LANG || 'en_US.UTF-8',
      AGENT_HUB: '1',
    };

    // Add NVM if present
    if (process.env.NVM_DIR) {
      cleanEnv.NVM_DIR = process.env.NVM_DIR;
    }

    // Spawn PTY process with try/catch
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(this.shell, ['-l'], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: projectPath,
        env: cleanEnv,
      });
    } catch (err: any) {
      console.error(`[Terminal] Failed to spawn PTY: ${err.message}`);
      throw new Error(`Failed to create terminal: ${err.message}`);
    }

    const session: TerminalSession = {
      id,
      projectPath,
      projectName,
      ptyProcess,
      buffer: [],
      maxBufferLines: 5000,
      createdAt: new Date(),
      lastActivity: new Date(),
      subscribers: new Set(),
    };

    // Handle PTY output
    ptyProcess.onData((data) => {
      session.lastActivity = new Date();
      
      // Add to buffer
      const lines = data.split('\n');
      session.buffer.push(...lines);
      
      // Trim buffer if too large
      if (session.buffer.length > session.maxBufferLines) {
        session.buffer = session.buffer.slice(-session.maxBufferLines);
      }

      // Broadcast to subscribers
      this.broadcast(session, { type: 'output', sessionId: id, data });
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[Terminal] Session ${id} exited with code ${exitCode}`);
      this.broadcast(session, { type: 'exit', sessionId: id, exitCode });
      this.sessions.delete(id);
      this.projectToSession.delete(projectPath);
    });

    // Store session
    this.sessions.set(id, session);
    this.projectToSession.set(projectPath, id);

    // Notify about creation
    this.broadcast(session, { type: 'created', sessionId: id });

    return session;
  }

  /**
   * Récupère une session par ID
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Récupère une session par chemin de projet
   */
  getSessionByProject(projectPath: string): TerminalSession | undefined {
    const sessionId = this.projectToSession.get(projectPath);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Envoie des données au terminal
   */
  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.ptyProcess.write(data);
    session.lastActivity = new Date();
    return true;
  }

  /**
   * Redimensionne le terminal
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.ptyProcess.resize(cols, rows);
    return true;
  }

  /**
   * Ferme une session
   */
  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    console.log(`[Terminal] Closing session ${sessionId}`);
    session.ptyProcess.kill();
    this.sessions.delete(sessionId);
    this.projectToSession.delete(session.projectPath);
    return true;
  }

  /**
   * S'abonne aux événements d'une session
   */
  subscribe(sessionId: string, callback: (event: TerminalEvent) => void): () => void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Return dummy unsubscribe
      return () => {};
    }

    session.subscribers.add(callback);
    
    // Send current buffer to new subscriber
    if (session.buffer.length > 0) {
      callback({
        type: 'output',
        sessionId,
        data: session.buffer.join('\n'),
      });
    }

    // Return unsubscribe function
    return () => {
      session.subscribers.delete(callback);
    };
  }

  /**
   * Broadcast un événement à tous les abonnés d'une session
   */
  private broadcast(session: TerminalSession, event: TerminalEvent): void {
    session.subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (err) {
        console.error('[Terminal] Error in subscriber callback:', err);
      }
    });
  }

  /**
   * Liste toutes les sessions actives
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      projectPath: session.projectPath,
      projectName: session.projectName,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      bufferLines: session.buffer.length,
    }));
  }

  /**
   * Récupère le buffer d'une session
   */
  getBuffer(sessionId: string, lastN?: number): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    
    if (lastN && lastN > 0) {
      return session.buffer.slice(-lastN);
    }
    return [...session.buffer];
  }

  /**
   * Lance une commande dans une session (ex: démarrer gemini)
   */
  runCommand(sessionId: string, command: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.ptyProcess.write(command + '\r');
    session.lastActivity = new Date();
    return true;
  }

  /**
   * Ferme toutes les sessions
   */
  closeAll(): void {
    console.log(`[Terminal] Closing all ${this.sessions.size} sessions`);
    for (const [id] of this.sessions) {
      this.close(id);
    }
  }
}

// Singleton instance
export const terminalManager = new TerminalManager();
