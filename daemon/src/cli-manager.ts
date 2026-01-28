/**
 * CLI Manager
 * Manages the Gemini CLI process lifecycle
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { updateState, addRecentProject } from './state.js';

export interface CliManagerEvents {
  'output': (data: string) => void;
  'error': (error: string) => void;
  'ready': () => void;
  'exit': (code: number | null) => void;
}

export class CliManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private projectPath: string | null = null;
  private buffer: string = '';
  private isReady: boolean = false;

  constructor() {
    super();
  }

  /**
   * Start Gemini CLI for a project
   */
  async start(projectPath: string): Promise<void> {
    // Kill existing process if any
    await this.stop();

    console.log(`[CLI] Starting Gemini for project: ${projectPath}`);
    updateState({ status: 'starting', activeProject: projectPath });

    this.projectPath = projectPath;
    this.buffer = '';
    this.isReady = false;

    // Spawn gemini CLI in interactive mode
    this.process = spawn('gemini', [], {
      cwd: projectPath,
      shell: true,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    if (!this.process.pid) {
      updateState({ status: 'error', lastError: 'Failed to spawn CLI' });
      this.emit('error', 'Failed to spawn Gemini CLI');
      return;
    }

    updateState({ cliPid: this.process.pid });
    addRecentProject(projectPath);

    // Handle stdout
    this.process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.buffer += text;
      this.emit('output', text);

      // Detect when CLI is ready (waiting for input)
      if (!this.isReady && (text.includes('❯') || text.includes('>'))) {
        this.isReady = true;
        updateState({ status: 'ready' });
        this.emit('ready');
      }
    });

    // Handle stderr
    this.process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.emit('output', text); // Treat stderr as output too
    });

    // Handle exit
    this.process.on('exit', (code) => {
      console.log(`[CLI] Process exited with code: ${code}`);
      updateState({ status: 'idle', cliPid: null });
      this.process = null;
      this.isReady = false;
      this.emit('exit', code);
    });

    // Handle error
    this.process.on('error', (err) => {
      console.error(`[CLI] Process error:`, err);
      updateState({ status: 'error', lastError: err.message });
      this.emit('error', err.message);
    });

    // Wait for ready or timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.isReady) {
          // Still consider it started even without prompt detection
          this.isReady = true;
          updateState({ status: 'ready' });
          resolve();
        }
      }, 5000);

      this.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(err));
      });
    });
  }

  /**
   * Send a message to the CLI
   */
  send(message: string): void {
    if (!this.process || !this.isReady) {
      this.emit('error', 'CLI not ready');
      return;
    }

    console.log(`[CLI] Sending: ${message.slice(0, 50)}...`);
    this.buffer = ''; // Clear buffer for new response
    this.process.stdin?.write(message + '\n');
  }

  /**
   * Stop the CLI process
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    console.log('[CLI] Stopping process...');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful exit doesn't work
        this.process?.kill('SIGKILL');
        resolve();
      }, 3000);

      this.process!.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      // Try graceful exit first
      this.process!.stdin?.write('/exit\n');
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGTERM');
        }
      }, 1000);
    });
  }

  /**
   * Get current project path
   */
  getProjectPath(): string | null {
    return this.projectPath;
  }

  /**
   * Check if CLI is ready
   */
  getIsReady(): boolean {
    return this.isReady;
  }

  /**
   * Get the accumulated output buffer
   */
  getBuffer(): string {
    return this.buffer;
  }
}

// Singleton instance
export const cliManager = new CliManager();
