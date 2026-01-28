'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface Conversation {
  id: string;
  title: string;
  projectName?: string;
  lastModified: string;
  artifactCount: number;
  hasTaskMd: boolean;
  hasPlan: boolean;
  hasWalkthrough: boolean;
}

interface DeviceInfo {
  name: string;
  platform: string;
  homeDir: string;
}

type GroupMode = 'all' | 'project';

export default function AntigravityPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>('project');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/antigravity/conversations')
      .then(res => res.json())
      .then(data => {
        setConversations(data.conversations || []);
        setDevice(data.device || null);
        const projectNames = (data.conversations || []).map((c: Conversation) => c.projectName || 'Unknown');
        const uniqueProjects = Array.from(new Set<string>(projectNames));
        setExpandedGroups(new Set(uniqueProjects.slice(0, 3)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const groupedConversations = useMemo(() => {
    if (groupMode === 'all') return [{ name: 'All', conversations }];
    
    const groups: Record<string, Conversation[]> = {};
    for (const conv of conversations) {
      const key = conv.projectName || 'Unknown Project';
      if (!groups[key]) groups[key] = [];
      groups[key].push(conv);
    }
    return Object.entries(groups)
      .map(([name, convs]) => ({ name, conversations: convs }))
      .sort((a, b) => {
        if (a.name === 'Unknown Project') return 1;
        if (b.name === 'Unknown Project') return -1;
        return b.conversations.length - a.conversations.length;
      });
  }, [conversations, groupMode]);

  // Export as ZIP
  const handleExportZip = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/antigravity/export-zip');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `antigravity-export-${device?.name || 'backup'}-${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  // Import ZIP
  const handleImportZip = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/antigravity/import-zip', {
        method: 'POST',
        body: formData,
      });
      
      const result = await res.json();
      
      if (result.success) {
        setImportResult(`✅ ${result.message}\n📁 Extrait vers: ${result.targetPath}`);
        // Refresh list
        const refreshRes = await fetch('/api/antigravity/conversations');
        const refreshData = await refreshRes.json();
        setConversations(refreshData.conversations || []);
      } else {
        setImportResult(`❌ ${result.error}`);
      }
    } catch (err) {
      setImportResult(`❌ Erreur: ${err instanceof Error ? err.message : 'Fichier invalide'}`);
    } finally {
      setImporting(false);
    }
  };

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  const platformIcon = device?.platform === 'darwin' ? '🍎 Mac' : device?.platform === 'win32' ? '🪟 Windows' : '🐧 Linux';

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">← Back</Link>
            <h1 className="text-xl font-semibold">Sync Conversations</h1>
            {device && (
              <span className="text-sm bg-[var(--color-bg-elevated)] px-2 py-1 rounded border border-[var(--color-border)]">
                {platformIcon}
              </span>
            )}
          </div>
          <button onClick={handleExportZip} disabled={exporting}
            className="px-4 py-2 bg-[var(--agent-gemini)] text-white rounded-lg hover:opacity-90 disabled:opacity-50">
            {exporting ? '⏳ Export...' : '📦 Export ZIP'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {/* Clear instructions */}
        <div className="mb-6 p-5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl">
          <h3 className="font-semibold text-lg mb-3">📤 Exporter vers une autre machine</h3>
          <ol className="text-sm space-y-2 list-decimal list-inside text-[var(--color-text-secondary)]">
            <li>Clique <strong>"Export ZIP"</strong> ci-dessus</li>
            <li>Copie le fichier .zip sur l&apos;autre machine (USB, Cloud, email...)</li>
            <li>Sur l&apos;autre machine, ouvre Agent Hub et importe le ZIP ci-dessous</li>
            <li>Les conversations seront extraites dans <code className="bg-black/40 px-1.5 rounded text-xs">~/.gemini/antigravity/brain/</code></li>
            <li><strong>Antigravity CLI</strong> verra automatiquement ces conversations</li>
          </ol>
        </div>

        {/* Import section - prominent */}
        <div className="mb-8 p-5 border-2 border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-elevated)]">
          <h3 className="font-semibold text-lg mb-2">📥 Importer un export</h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Importe un fichier .zip exporté depuis un autre Mac, Windows ou Linux
          </p>
          
          {importResult && (
            <div className={`mb-4 p-4 rounded-lg text-sm whitespace-pre-wrap ${
              importResult.startsWith('✅') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {importResult}
            </div>
          )}
          
          <label className={`px-5 py-3 bg-[var(--agent-gemini)] text-white rounded-lg cursor-pointer hover:opacity-90 inline-block ${importing ? 'opacity-50' : ''}`}>
            {importing ? '⏳ Import en cours...' : '📁 Choisir un fichier .zip'}
            <input type="file" accept=".zip" className="hidden" disabled={importing}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportZip(file); }} />
          </label>
        </div>

        {/* Conversations list */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Conversations locales ({conversations.length})</h3>
          <select value={groupMode} onChange={e => setGroupMode(e.target.value as GroupMode)}
            className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm">
            <option value="project">Par projet</option>
            <option value="all">Tout</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-8 text-[var(--color-text-muted)]">Chargement...</div>
        ) : (
          <div className="space-y-3">
            {groupedConversations.map(group => (
              <div key={group.name} className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                <button onClick={() => toggleGroup(group.name)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-bg)] transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs transition-transform ${expandedGroups.has(group.name) ? 'rotate-90' : ''}`}>▶</span>
                    <span className="font-medium">{group.name}</span>
                    <span className="text-xs text-[var(--color-text-muted)] bg-black/20 px-1.5 py-0.5 rounded">{group.conversations.length}</span>
                  </div>
                </button>
                
                {expandedGroups.has(group.name) && (
                  <div className="border-t border-[var(--color-border)] max-h-60 overflow-y-auto">
                    {group.conversations.map(conv => (
                      <div key={conv.id} className="px-4 py-2 border-b border-[var(--color-border)]/50 last:border-b-0 hover:bg-[var(--color-bg)] text-sm">
                        <div className="flex items-center justify-between">
                          <span className="truncate">{conv.title}</span>
                          <span className="text-xs text-[var(--color-text-muted)]">{formatDate(conv.lastModified)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
