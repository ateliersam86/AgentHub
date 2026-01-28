/**
 * Database Schema - SQLite with Drizzle ORM
 * 
 * Database location: ~/.agent-hub/conversations.db
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Conversations table
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(), // UUID
  title: text('title').notNull(),
  agent: text('agent').notNull(), // gemini, codex, claude
  model: text('model'), // Optional: specific model used
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Messages table
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(), // UUID
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

// Agent configurations
export const agentConfigs = sqliteTable('agent_configs', {
  id: text('id').primaryKey(),
  agentName: text('agent_name').notNull().unique(), // gemini, codex, claude
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  settings: text('settings', { mode: 'json' }), // JSON settings
  lastUsed: integer('last_used', { mode: 'timestamp' }),
});

// Brainstorm sessions
export const brainstormSessions = sqliteTable('brainstorm_sessions', {
  id: text('id').primaryKey(), // UUID
  prompt: text('prompt').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Brainstorm responses (one per agent per session)
export const brainstormResponses = sqliteTable('brainstorm_responses', {
  id: text('id').primaryKey(), // UUID
  sessionId: text('session_id')
    .notNull()
    .references(() => brainstormSessions.id, { onDelete: 'cascade' }),
  agent: text('agent').notNull(),
  response: text('response'),
  error: text('error'),
  elapsed: integer('elapsed'), // milliseconds
});

// Types for TypeScript
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type AgentConfig = typeof agentConfigs.$inferSelect;
export type BrainstormSession = typeof brainstormSessions.$inferSelect;
export type BrainstormResponse = typeof brainstormResponses.$inferSelect;
