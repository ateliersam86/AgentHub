'use client';

import { useState, useEffect, useRef } from 'react';
import { DaemonState, daemonClient } from '@/lib/daemon-client';

interface ProjectSelectorProps {
  onProjectChange?: (project: string) => void;
}

export function ProjectSelector({ onProjectChange }: ProjectSelectorProps) {
  const [state, setState] = useState<DaemonState | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [projectInput, setProjectInput] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    daemonClient.connect();

    const unsubscribe = daemonClient.subscribe((msg) => {
      if (msg.type === 'status' && msg.status) {
        setState(msg.status);
      } else if (msg.type === 'projects' && msg.projects) {
        setProjects(msg.projects);
      } else if (msg.type === 'error' && msg.data?.includes('auth')) {
        setShowTokenInput(true);
      }
    });

    setTimeout(() => {
      daemonClient.requestStatus();
      daemonClient.requestProjects();
    }, 1000);

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProjectSelect = (project: string) => {
    daemonClient.switchProject(project);
    onProjectChange?.(project);
    setIsOpen(false);
  };

  const handleAddProject = () => {
    if (projectInput.trim()) {
      daemonClient.switchProject(projectInput.trim());
      onProjectChange?.(projectInput.trim());
      setShowAddProject(false);
      setProjectInput('');
      setIsOpen(false);
    }
  };

  const handleDisconnect = () => {
    daemonClient.stop();
    setIsOpen(false);
  };

  const handleRemoveProject = (project: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // For now, just filter locally - could add daemon endpoint later
    setProjects(prev => prev.filter(p => p !== project));
  };

  const handleTokenSubmit = () => {
    if (tokenInput.trim()) {
      daemonClient.setAuthToken(tokenInput.trim());
      setShowTokenInput(false);
      setTokenInput('');
    }
  };

  const isConnected = daemonClient.isConnected();
  const hasToken = daemonClient.hasAuthToken();
  const activeProject = state?.activeProject;
  const projectName = activeProject?.split('/').pop() || 'No project';

  const statusColor = !isConnected 
    ? 'bg-gray-500' 
    : state?.status === 'ready' 
      ? 'bg-green-500' 
      : state?.status === 'starting' 
        ? 'bg-yellow-500' 
        : 'bg-red-500';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Token input modal */}
      {showTokenInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-elevated)] p-6 rounded-xl shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-2">Configure Daemon Access</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Enter the auth token from <code className="text-xs bg-black/30 px-1 rounded">~/.agent-hub/auth-token</code>
            </p>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ah_xxxxx..."
              className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowTokenInput(false)} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
                Cancel
              </button>
              <button onClick={handleTokenSubmit} className="px-4 py-2 text-sm bg-[var(--agent-gemini)] text-white rounded-lg hover:opacity-90">
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add project modal */}
      {showAddProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-elevated)] p-6 rounded-xl shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-2">Link Local Project</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Enter the path to an existing project folder on this machine
            </p>
            <input
              type="text"
              value={projectInput}
              onChange={(e) => setProjectInput(e.target.value)}
              placeholder="/Users/sam/my-project"
              className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddProject(false)} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
                Cancel
              </button>
              <button onClick={handleAddProject} className="px-4 py-2 text-sm bg-[var(--agent-gemini)] text-white rounded-lg hover:opacity-90">
                Link Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project selector button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--color-bg-elevated)] transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-sm font-medium max-w-[150px] truncate">{projectName}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden z-40">
          {/* Status */}
          <div className="px-4 py-2 border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex justify-between items-center">
            <span>{isConnected ? `Status: ${state?.status || 'unknown'}` : 'Daemon offline'}</span>
            {activeProject && (
              <button onClick={handleDisconnect} className="text-red-400 hover:text-red-300">
                Disconnect
              </button>
            )}
          </div>

          {/* Recent projects */}
          {projects.length > 0 && (
            <div className="max-h-48 overflow-y-auto">
              {projects.map((project) => (
                <button
                  key={project}
                  onClick={() => handleProjectSelect(project)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-bg)] transition-colors flex items-center gap-2 group ${
                    project === activeProject ? 'bg-[var(--color-bg)]' : ''
                  }`}
                >
                  <svg className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="truncate flex-1">{project.split('/').pop()}</span>
                  {project === activeProject ? (
                    <span className="text-green-500">●</span>
                  ) : (
                    <button
                      onClick={(e) => handleRemoveProject(project, e)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-[var(--color-border)]">
            <button
              onClick={() => { setShowAddProject(true); setIsOpen(false); }}
              className="w-full px-4 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] flex items-center gap-2"
            >
              <span className="text-green-500">+</span> Add project...
            </button>
            
            {!hasToken && (
              <button
                onClick={() => { setShowTokenInput(true); setIsOpen(false); }}
                className="w-full px-4 py-2 text-left text-sm text-[var(--agent-gemini)] hover:bg-[var(--color-bg)]"
              >
                Set auth token...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
