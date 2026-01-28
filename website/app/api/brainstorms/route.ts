/**
 * API Route: /api/brainstorms
 * 
 * Get all brainstorm sessions with their responses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // Get brainstorm sessions
    const sessions = await db
      .select()
      .from(schema.brainstormSessions)
      .orderBy(desc(schema.brainstormSessions.createdAt))
      .limit(limit);
    
    // Get responses for each session
    const sessionsWithResponses = await Promise.all(
      sessions.map(async (session) => {
        const responses = await db
          .select()
          .from(schema.brainstormResponses)
          .where(eq(schema.brainstormResponses.sessionId, session.id));
        
        return {
          ...session,
          responses: responses.reduce((acc, r) => {
            acc[r.agent] = { response: r.response, error: r.error, elapsed: r.elapsed };
            return acc;
          }, {} as Record<string, { response: string | null; error: string | null; elapsed: number | null }>),
        };
      })
    );
    
    return NextResponse.json({
      sessions: sessionsWithResponses,
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
