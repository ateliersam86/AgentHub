/**
 * API Route: /api/agents/brainstorm
 * 
 * Ask all available agents the same question in parallel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { brainstorm, getAvailableAgents, AgentName } from '@/lib/agents/executor';
import { db, schema } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body as { prompt: string };
    
    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing prompt' },
        { status: 400 }
      );
    }
    
    const availableAgents = getAvailableAgents();
    
    if (availableAgents.length === 0) {
      return NextResponse.json(
        { error: 'No agents configured. Run gemini or codex CLI first.' },
        { status: 400 }
      );
    }
    
    const startTime = Date.now();
    const results = await brainstorm(prompt);
    const totalElapsed = (Date.now() - startTime) / 1000;
    
    // Save to database
    const sessionId = randomUUID();
    const now = new Date();
    
    await db.insert(schema.brainstormSessions).values({
      id: sessionId,
      prompt,
      createdAt: now,
    });
    
    const responseValues = Object.entries(results).map(([agent, result]) => ({
      id: randomUUID(),
      sessionId,
      agent,
      response: result.response || null,
      error: result.error || null,
      elapsed: result.elapsed ? Math.round(result.elapsed * 1000) : null,
    }));
    
    await db.insert(schema.brainstormResponses).values(responseValues);
    
    return NextResponse.json({
      sessionId,
      prompt,
      results,
      totalElapsed,
      agents: availableAgents,
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
