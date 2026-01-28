/**
 * Import Antigravity ZIP Archive
 * Extracts a ZIP archive directly to ~/.gemini/antigravity/brain/
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import JSZip from 'jszip';

const BRAIN_DIR = join(homedir(), '.gemini/antigravity/brain');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Ensure brain directory exists
    if (!existsSync(BRAIN_DIR)) {
      mkdirSync(BRAIN_DIR, { recursive: true });
    }

    // Read ZIP file
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const results = {
      imported: 0,
      skipped: 0,
      files: 0,
      errors: [] as string[],
    };

    // Extract all files
    const entries = Object.entries(zip.files);
    
    for (const [path, zipEntry] of entries) {
      // Skip metadata file and directories
      if (path === '_export_metadata.json' || zipEntry.dir) continue;

      const targetPath = join(BRAIN_DIR, path);
      const conversationId = path.split('/')[0];

      try {
        // Create directory if needed
        const dir = dirname(targetPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Extract file
        const content = await zipEntry.async('nodebuffer');
        writeFileSync(targetPath, content);
        results.files++;
      } catch (err) {
        results.errors.push(`${path}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Count unique conversations
    const conversationIds = new Set(
      entries
        .map(([path]) => path.split('/')[0])
        .filter(id => id && id !== '_export_metadata.json')
    );
    results.imported = conversationIds.size;

    return NextResponse.json({
      success: true,
      ...results,
      message: `Imported ${results.imported} conversations (${results.files} files)`,
      targetPath: BRAIN_DIR,
    });

  } catch (error) {
    console.error('Import ZIP error:', error);
    return NextResponse.json({ 
      error: 'Failed to import ZIP',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
