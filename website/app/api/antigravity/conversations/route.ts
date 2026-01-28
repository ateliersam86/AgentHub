/**
 * Antigravity Conversations API
 * Lists and exports conversations from ~/.gemini/antigravity/brain/
 */

import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BRAIN_DIR = join(homedir(), '.gemini/antigravity/brain');

interface Conversation {
  id: string;
  title: string;
  projectName?: string; // Extracted from artifacts
  lastModified: string;
  artifactCount: number;
  hasTaskMd: boolean;
  hasPlan: boolean;
  hasWalkthrough: boolean;
}

interface ExportedConversation {
  id: string;
  title: string;
  projectName?: string;
  exportedAt: string;
  artifacts: Record<string, string>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  const id = searchParams.get('id');

  try {
    if (!existsSync(BRAIN_DIR)) {
      return NextResponse.json({ conversations: [], error: 'Antigravity brain directory not found' });
    }

    if (action === 'export') {
      if (id) {
        const exported = exportConversation(id);
        return NextResponse.json(exported);
      } else {
        const conversations = listConversations();
        const exported = conversations.map(c => exportConversation(c.id));
        return NextResponse.json({
          version: '1.0',
          exportedAt: new Date().toISOString(),
          sourceMachine: homedir().split('/').pop() || 'unknown',
          platform: process.platform,
          conversations: exported,
        });
      }
    }

    const conversations = listConversations();
    return NextResponse.json({ 
      conversations,
      device: {
        name: homedir().split('/').pop() || 'unknown',
        platform: process.platform,
        homeDir: homedir(),
      }
    });

  } catch (error) {
    console.error('Antigravity API error:', error);
    return NextResponse.json({ error: 'Failed to read conversations' }, { status: 500 });
  }
}

function extractProjectName(convDir: string): string | undefined {
  // Try to find project paths in artifacts
  const files = ['implementation_plan.md', 'task.md', 'walkthrough.md'];
  
  for (const file of files) {
    const path = join(convDir, file);
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      // Match patterns like /Users/xxx/ProjectName/ or file:///path/to/Project/
      const patterns = [
        /file:\/\/\/[^\/]+\/[^\/]+\/([^\/\s\)]+)\//g,        // file:// URLs
        /\/Users\/[^\/]+\/([^\/\s\)]+)(?:\/|$)/g,            // Mac paths
        /\/home\/[^\/]+\/([^\/\s\)]+)(?:\/|$)/g,             // Linux paths
        /[A-Z]:\\Users\\[^\\]+\\([^\\\/\s\)]+)(?:\\|$)/gi,   // Windows paths
      ];
      
      for (const pattern of patterns) {
        const matches = [...content.matchAll(pattern)];
        // Find most common project name
        const names = matches.map(m => m[1]).filter(n => 
          n && !n.includes('.') && n.length > 2 && n !== 'src' && n !== 'app'
        );
        if (names.length > 0) {
          // Return most frequent
          const freq = names.reduce((acc, n) => ({ ...acc, [n]: (acc[n] || 0) + 1 }), {} as Record<string, number>);
          return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
        }
      }
    }
  }
  return undefined;
}

function listConversations(): Conversation[] {
  const dirs = readdirSync(BRAIN_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));

  return dirs.map(dir => {
    const convDir = join(BRAIN_DIR, dir.name);
    const files = readdirSync(convDir).filter(f => !f.startsWith('.'));
    
    let title = dir.name.slice(0, 8) + '...';
    const taskPath = join(convDir, 'task.md');
    if (existsSync(taskPath)) {
      const content = readFileSync(taskPath, 'utf-8');
      const firstLine = content.split('\n').find(l => l.startsWith('# '));
      if (firstLine) title = firstLine.replace('# ', '').slice(0, 50);
    }

    const stat = statSync(convDir);
    const projectName = extractProjectName(convDir);

    return {
      id: dir.name,
      title,
      projectName,
      lastModified: stat.mtime.toISOString(),
      artifactCount: files.filter(f => f.endsWith('.md')).length,
      hasTaskMd: existsSync(taskPath),
      hasPlan: existsSync(join(convDir, 'implementation_plan.md')),
      hasWalkthrough: existsSync(join(convDir, 'walkthrough.md')),
    };
  }).sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
}

function exportConversation(id: string): ExportedConversation {
  const convDir = join(BRAIN_DIR, id);
  
  if (!existsSync(convDir)) {
    throw new Error(`Conversation ${id} not found`);
  }

  const files = readdirSync(convDir).filter(f => 
    f.endsWith('.md') && !f.includes('.resolved')
  );

  const artifacts: Record<string, string> = {};
  for (const file of files) {
    const content = readFileSync(join(convDir, file), 'utf-8');
    artifacts[file] = content;
  }

  // Extract project name from paths in artifacts (NOT full path)
  let projectName: string | undefined;
  const planPath = join(convDir, 'implementation_plan.md');
  if (existsSync(planPath)) {
    const content = readFileSync(planPath, 'utf-8');
    // Look for patterns like /Users/xxx/ProjectName or C:\Users\xxx\ProjectName
    const match = content.match(/(?:\/|\\)([^\/\\]+?)(?:\/|\\)(?:src|app|lib|components)/);
    if (match) projectName = match[1];
  }

  // Get title
  let title = id.slice(0, 8);
  if (artifacts['task.md']) {
    const firstLine = artifacts['task.md'].split('\n').find(l => l.startsWith('# '));
    if (firstLine) title = firstLine.replace('# ', '');
  }

  return {
    id,
    title,
    exportedAt: new Date().toISOString(),
    artifacts,
    projectName,
  };
}
