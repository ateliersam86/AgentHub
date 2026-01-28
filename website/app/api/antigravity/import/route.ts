/**
 * Import Antigravity Conversations
 * Import conversations from another machine
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BRAIN_DIR = join(homedir(), '.gemini/antigravity/brain');

interface ImportedConversation {
  id: string;
  title: string;
  projectName?: string;
  exportedAt: string;
  artifacts: Record<string, string>;
}

interface ImportPayload {
  version: string;
  exportedAt: string;
  sourceMachine: string;
  platform: string;
  conversations: ImportedConversation[];
}

export async function POST(request: NextRequest) {
  try {
    const data: ImportPayload = await request.json();

    if (!data.version || !data.conversations) {
      return NextResponse.json({ error: 'Invalid import format' }, { status: 400 });
    }

    // Ensure brain directory exists
    if (!existsSync(BRAIN_DIR)) {
      mkdirSync(BRAIN_DIR, { recursive: true });
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const conv of data.conversations) {
      const convDir = join(BRAIN_DIR, conv.id);
      
      // Skip if already exists
      if (existsSync(convDir)) {
        results.skipped++;
        continue;
      }

      try {
        // Create conversation directory
        mkdirSync(convDir, { recursive: true });

        // Write artifacts
        for (const [filename, content] of Object.entries(conv.artifacts)) {
          writeFileSync(join(convDir, filename), content);
        }

        // Create import metadata
        writeFileSync(join(convDir, '.import_metadata.json'), JSON.stringify({
          importedAt: new Date().toISOString(),
          sourceMachine: data.sourceMachine,
          sourcePlatform: data.platform,
          originalProjectName: conv.projectName,
        }, null, 2));

        results.imported++;
      } catch (err) {
        results.errors.push(`${conv.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      message: `Imported ${results.imported} conversations, skipped ${results.skipped} existing`,
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ 
      error: 'Failed to import conversations',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
