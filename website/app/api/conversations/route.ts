/**
 * API Route: /api/conversations
 * 
 * Get all conversations with pagination.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const conversations = await db
      .select()
      .from(schema.conversations)
      .orderBy(desc(schema.conversations.updatedAt))
      .limit(limit)
      .offset(offset);
    
    return NextResponse.json({ conversations });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
