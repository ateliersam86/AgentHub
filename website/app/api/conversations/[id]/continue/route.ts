/**
 * API Route: /api/conversations/[id]/continue
 * 
 * Continue a conversation with a new message.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { callAgentWithContext, AgentName } from '@/lib/agents/executor';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { prompt } = body as { prompt: string };
    
    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing prompt' },
        { status: 400 }
      );
    }
    
    // Get conversation
    const conversation = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, id))
      .limit(1);
    
    if (conversation.length === 0) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    const conv = conversation[0];
    const agent = conv.agent as AgentName;
    
    // Get existing messages for context
    const existingMessages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, id))
      .orderBy(schema.messages.timestamp);
    
    // Build history for context
    const history = existingMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
    
    // Call agent with context
    const startTime = Date.now();
    const response = await callAgentWithContext(agent, prompt, history);
    const elapsed = (Date.now() - startTime) / 1000;
    
    const now = new Date();
    
    // Save new messages
    await db.insert(schema.messages).values([
      {
        id: randomUUID(),
        conversationId: id,
        role: 'user',
        content: prompt,
        timestamp: now,
      },
      {
        id: randomUUID(),
        conversationId: id,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      },
    ]);
    
    // Update conversation timestamp
    await db
      .update(schema.conversations)
      .set({ updatedAt: now })
      .where(eq(schema.conversations.id, id));
    
    return NextResponse.json({
      response,
      agent,
      elapsed,
      conversationId: id,
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
