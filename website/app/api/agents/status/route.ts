/**
 * API Route: /api/agents/status
 * 
 * Returns the status of all configured agents.
 */

import { NextResponse } from 'next/server';
import { getAgentStatus } from '@/lib/agents/executor';

export async function GET() {
  try {
    const status = getAgentStatus();
    return NextResponse.json({ agents: status });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
