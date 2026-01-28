/**
 * Database Client - SQLite + Drizzle
 * 
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 * Database stored at ~/.agent-hub/conversations.db
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as schema from './schema';

// Database directory and path
const AGENT_HUB_DIR = join(homedir(), '.agent-hub');
const DB_PATH = join(AGENT_HUB_DIR, 'conversations.db');

// Ensure directory exists
if (!existsSync(AGENT_HUB_DIR)) {
  mkdirSync(AGENT_HUB_DIR, { recursive: true });
}

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
sqlite.pragma('journal_mode = WAL');

// Create Drizzle client
export const db = drizzle(sqlite, { schema });

// Initialize database tables if they don't exist
export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      agent TEXT NOT NULL,
      model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_configs (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      settings TEXT,
      last_used INTEGER
    );

    CREATE TABLE IF NOT EXISTS brainstorm_sessions (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brainstorm_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES brainstorm_sessions(id) ON DELETE CASCADE,
      agent TEXT NOT NULL,
      response TEXT,
      error TEXT,
      elapsed INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent);
    CREATE INDEX IF NOT EXISTS idx_brainstorm_responses_session ON brainstorm_responses(session_id);
  `);
  
  console.log('[DB] Database initialized at', DB_PATH);
}

// Initialize on first import
initializeDatabase();

// Export schema for use in queries
export { schema };
export type { 
  Conversation, 
  NewConversation, 
  Message, 
  NewMessage,
  AgentConfig,
  BrainstormSession,
  BrainstormResponse 
} from './schema';
