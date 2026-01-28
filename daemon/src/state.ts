/**
 * State Manager
 * Handles persistent state and auth token generation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const STATE_DIR = join(homedir(), '.agent-hub');
const STATE_FILE = join(STATE_DIR, 'daemon-state.json');
const AUTH_TOKEN_FILE = join(STATE_DIR, 'auth-token');

export interface DaemonState {
  activeProject: string | null;
  recentProjects: string[];
  cliPid: number | null;
  status: 'idle' | 'starting' | 'ready' | 'error';
  lastError?: string;
}

const DEFAULT_STATE: DaemonState = {
  activeProject: null,
  recentProjects: [],
  cliPid: null,
  status: 'idle',
};

/**
 * Ensure the state directory exists
 */
function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 }); // Restrict permissions
  }
}

/**
 * Get or generate auth token
 * Token is stored with restricted permissions (600)
 */
export function getAuthToken(): string {
  ensureStateDir();
  
  if (existsSync(AUTH_TOKEN_FILE)) {
    return readFileSync(AUTH_TOKEN_FILE, 'utf-8').trim();
  }
  
  // Generate new token
  const token = `ah_${uuidv4().replace(/-/g, '')}`;
  writeFileSync(AUTH_TOKEN_FILE, token, { mode: 0o600 });
  console.log(`[Auth] Generated new auth token: ${AUTH_TOKEN_FILE}`);
  
  return token;
}

/**
 * Validate auth token
 */
export function validateToken(token: string): boolean {
  const validToken = getAuthToken();
  return token === validToken;
}

/**
 * Load daemon state from disk
 */
export function loadState(): DaemonState {
  ensureStateDir();
  
  if (!existsSync(STATE_FILE)) {
    return { ...DEFAULT_STATE };
  }
  
  try {
    const data = readFileSync(STATE_FILE, 'utf-8');
    return { ...DEFAULT_STATE, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Save daemon state to disk
 */
export function saveState(state: DaemonState): void {
  ensureStateDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * Update state with partial changes
 */
export function updateState(updates: Partial<DaemonState>): DaemonState {
  const current = loadState();
  const newState = { ...current, ...updates };
  saveState(newState);
  return newState;
}

/**
 * Add a project to recent projects list
 */
export function addRecentProject(projectPath: string): void {
  const state = loadState();
  const recent = state.recentProjects.filter(p => p !== projectPath);
  recent.unshift(projectPath); // Add to front
  state.recentProjects = recent.slice(0, 10); // Keep last 10
  saveState(state);
}
