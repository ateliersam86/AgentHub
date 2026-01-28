/**
 * Export Antigravity Conversations as ZIP
 * Creates a complete .zip archive that can be extracted directly to ~/.gemini/antigravity/brain/
 */

import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';
import JSZip from 'jszip';

const BRAIN_DIR = join(homedir(), '.gemini/antigravity/brain');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('id');

  try {
    if (!existsSync(BRAIN_DIR)) {
      return NextResponse.json({ error: 'Antigravity brain directory not found' }, { status: 404 });
    }

    const zip = new JSZip();

    // Add metadata
    zip.file('_export_metadata.json', JSON.stringify({
      version: '2.0',
      exportedAt: new Date().toISOString(),
      sourceMachine: homedir().split('/').pop() || 'unknown',
      platform: process.platform,
      targetPath: '~/.gemini/antigravity/brain/',
      instructions: 'Extract this ZIP to ~/.gemini/antigravity/brain/ on the target machine',
    }, null, 2));

    if (conversationId) {
      // Export single conversation
      await addConversationToZip(zip, conversationId);
    } else {
      // Export all conversations
      const dirs = readdirSync(BRAIN_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'));

      for (const dir of dirs) {
        await addConversationToZip(zip, dir.name);
      }
    }

    // Generate ZIP as blob
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    // Return as downloadable file
    const filename = conversationId 
      ? `antigravity-${conversationId.slice(0, 8)}.zip`
      : `antigravity-full-export-${new Date().toISOString().split('T')[0]}.zip`;

    return new NextResponse(zipBlob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Export ZIP error:', error);
    return NextResponse.json({ 
      error: 'Failed to create export',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function addConversationToZip(zip: typeof JSZip.prototype, conversationId: string): Promise<void> {
  const convDir = join(BRAIN_DIR, conversationId);
  if (!existsSync(convDir)) return;

  await addFolderToZip(zip, convDir, conversationId);
}

async function addFolderToZip(zip: typeof JSZip.prototype, folderPath: string, zipPath: string): Promise<void> {
  const items = readdirSync(folderPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = join(folderPath, item.name);
    const zipFilePath = join(zipPath, item.name);

    if (item.isDirectory()) {
      await addFolderToZip(zip, fullPath, zipFilePath);
    } else {
      // Read file and add to zip
      const content = readFileSync(fullPath);
      zip.file(zipFilePath, content);
    }
  }
}
