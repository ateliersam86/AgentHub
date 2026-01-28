/**
 * API Route: /api/agents/stream
 * 
 * Stream responses from Gemini using direct API (fast, ~2-3s first token)
 * Uses Server-Sent Events (SSE) for real-time streaming
 */

import { NextRequest } from 'next/server';
import { streamGeminiResponse } from '@/lib/gemini/api-client';
import { db, schema } from '@/lib/db';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  try {
    const body = await request.json();
    const { prompt, conversationId, context } = body;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'prompt is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        let fullResponse = '';
        const startTime = Date.now();

        try {
          // Build context from previous messages if conversationId provided
          let messageContext: { role: 'user' | 'model'; text: string }[] = [];
          
          if (context && Array.isArray(context)) {
            messageContext = context.map((msg: { role: string; content: string }) => ({
              role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
              text: msg.content,
            }));
          }

          await streamGeminiResponse(
            prompt,
            {
              onToken: (token) => {
                fullResponse += token;
                sendEvent('token', { token });
              },
              onComplete: async (text) => {
                const elapsed = (Date.now() - startTime) / 1000;
                
                // Save to database
                let convId = conversationId;
                
                if (!convId) {
                  // Create new conversation
                  convId = randomUUID();
                  await db.insert(schema.conversations).values({
                    id: convId,
                    title: prompt.slice(0, 100) + (prompt.length > 100 ? '...' : ''),
                    agent: 'gemini',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  });
                } else {
                  // Update existing conversation
                  await db.update(schema.conversations)
                    .set({ updatedAt: new Date() })
                    .where(require('drizzle-orm').eq(schema.conversations.id, convId));
                }

                // Save messages
                await db.insert(schema.messages).values([
                  {
                    id: randomUUID(),
                    conversationId: convId,
                    role: 'user',
                    content: prompt,
                    timestamp: new Date(),
                  },
                  {
                    id: randomUUID(),
                    conversationId: convId,
                    role: 'assistant',
                    content: text,
                    timestamp: new Date(),
                  },
                ]);

                sendEvent('complete', { 
                  conversationId: convId, 
                  elapsed,
                  totalTokens: text.length, // Approximate
                });
                controller.close();
              },
              onError: (error) => {
                sendEvent('error', { message: error.message });
                controller.close();
              },
            },
            messageContext
          );
        } catch (error) {
          const err = error as Error;
          sendEvent('error', { message: err.message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const err = error as Error;
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
