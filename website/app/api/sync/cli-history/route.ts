/**
 * API Route: /api/sync/cli-history
 * 
 * Import CLI brainstorm and conversation files into the database.
 * This allows seeing all agent interactions (both from CLI and web) in History.
 */

import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const CLI_RESPONSE_DIR = '/tmp/agent-responses';

interface ParsedBrainstorm {
  topic: string;
  date: string;
  agents: Array<{
    name: string;
    response: string;
  }>;
}

function parseBrainstormFile(content: string): ParsedBrainstorm | null {
  try {
    const lines = content.split('\n');
    let topic = '';
    let date = '';
    const agents: Array<{ name: string; response: string }> = [];
    
    let currentAgent = '';
    let currentResponse: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('**Topic:**')) {
        topic = line.replace('**Topic:**', '').trim();
      } else if (line.startsWith('**Date:**')) {
        date = line.replace('**Date:**', '').trim();
      } else if (line.startsWith('## ')) {
        // Save previous agent
        if (currentAgent && currentResponse.length > 0) {
          agents.push({ name: currentAgent, response: currentResponse.join('\n').trim() });
        }
        currentAgent = line.replace('## ', '').trim().toLowerCase();
        currentResponse = [];
      } else if (currentAgent && line !== '---') {
        currentResponse.push(line);
      }
    }
    
    // Save last agent
    if (currentAgent && currentResponse.length > 0) {
      agents.push({ name: currentAgent, response: currentResponse.join('\n').trim() });
    }
    
    return topic ? { topic, date, agents } : null;
  } catch {
    return null;
  }
}

interface ParsedConversation {
  agent: string;
  prompt: string;
  response: string;
}

function parseConversationFile(content: string, filename: string): ParsedConversation | null {
  try {
    // Extract agent from filename (e.g., "gemini-1234.md" -> "gemini")
    const agent = filename.split('-')[0];
    
    const promptMatch = content.match(/\*\*Prompt:\*\*\s*([\s\S]*?)(?=\*\*Response:\*\*)/);
    const responseMatch = content.match(/\*\*Response:\*\*\s*([\s\S]*)/);
    
    if (promptMatch && responseMatch) {
      return {
        agent,
        prompt: promptMatch[1].trim(),
        response: responseMatch[1].trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST() {
  try {
    if (!existsSync(CLI_RESPONSE_DIR)) {
      return NextResponse.json({ 
        message: 'No CLI responses directory found',
        imported: 0 
      });
    }
    
    const files = readdirSync(CLI_RESPONSE_DIR).filter(f => f.endsWith('.md'));
    let importedBrainstorms = 0;
    let importedConversations = 0;
    
    for (const file of files) {
      const filepath = `${CLI_RESPONSE_DIR}/${file}`;
      const content = readFileSync(filepath, 'utf8');
      const timestamp = parseInt(file.match(/(\d+)/)?.[1] || '0');
      const createdAt = timestamp > 1000000000000 ? new Date(timestamp) : new Date();
      
      if (file.startsWith('brainstorm-')) {
        const parsed = parseBrainstormFile(content);
        if (parsed && parsed.agents.length > 0) {
          const sessionId = randomUUID();
          
          // Check if already imported (by checking exact timestamp)
          const existing = await db.select().from(schema.brainstormSessions).limit(1);
          
          await db.insert(schema.brainstormSessions).values({
            id: sessionId,
            prompt: parsed.topic,
            createdAt,
          }).onConflictDoNothing();
          
          for (const agent of parsed.agents) {
            await db.insert(schema.brainstormResponses).values({
              id: randomUUID(),
              sessionId,
              agent: agent.name,
              response: agent.response,
              error: null,
              elapsed: null,
            }).onConflictDoNothing();
          }
          
          importedBrainstorms++;
        }
      } else {
        // Regular conversation file
        const parsed = parseConversationFile(content, file);
        if (parsed) {
          const conversationId = randomUUID();
          
          await db.insert(schema.conversations).values({
            id: conversationId,
            title: parsed.prompt.slice(0, 100) + (parsed.prompt.length > 100 ? '...' : ''),
            agent: parsed.agent,
            createdAt,
            updatedAt: createdAt,
          }).onConflictDoNothing();
          
          await db.insert(schema.messages).values([
            {
              id: randomUUID(),
              conversationId,
              role: 'user',
              content: parsed.prompt,
              timestamp: createdAt,
            },
            {
              id: randomUUID(),
              conversationId,
              role: 'assistant',
              content: parsed.response,
              timestamp: createdAt,
            },
          ]).onConflictDoNothing();
          
          importedConversations++;
        }
      }
    }
    
    return NextResponse.json({
      message: 'CLI history synced',
      importedBrainstorms,
      importedConversations,
      totalFiles: files.length,
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
