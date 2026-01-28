/**
 * API Route: /api/agents/ask
 * 
 * Ask a single agent a question (one-shot).
 */

import { NextRequest, NextResponse } from 'next/server';
import { callAgent, AgentName, AGENTS } from '@/lib/agents/executor';
import { db, schema } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent, prompt } = body as { agent: AgentName; prompt: string };
    
    if (!agent || !prompt) {
      return NextResponse.json(
        { error: 'Missing agent or prompt' },
        { status: 400 }
      );
    }
    
    if (!AGENTS[agent]) {
      return NextResponse.json(
        { error: `Unknown agent: ${agent}` },
        { status: 400 }
      );
    }
    
    const startTime = Date.now();
    const response = await callAgent(agent, prompt);
    const elapsed = (Date.now() - startTime) / 1000;
    
    // Save to database
    const conversationId = randomUUID();
    const now = new Date();
    
    await db.insert(schema.conversations).values({
      id: conversationId,
      title: prompt.slice(0, 100) + (prompt.length > 100 ? '...' : ''),
      agent,
      createdAt: now,
      updatedAt: now,
    });
    
    await db.insert(schema.messages).values([
      {
        id: randomUUID(),
        conversationId,
        role: 'user',
        content: prompt,
        timestamp: now,
      },
      {
        id: randomUUID(),
        conversationId,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      },
    ]);
    
    return NextResponse.json({
      response,
      agent,
      elapsed,
      conversationId,
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
