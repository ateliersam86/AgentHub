/**
 * Agent Executor - Wrapper for CLI agents
 * 
 * This runs on the server (Next.js API routes) with full filesystem access.
 * It spawns the actual CLI commands (gemini, codex) using the user's OAuth credentials.
 */

import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

// NVM path for CLI binaries
const NVM_BIN = join(homedir(), '.nvm/versions/node/v20.19.5/bin');

export type AgentName = 'gemini' | 'codex' | 'claude';

export interface AgentConfig {
  name: string;
  command: string;
  execMode: boolean;
  color: string;
  credPath: string;
}

export const AGENTS: Record<AgentName, AgentConfig & { printMode?: boolean }> = {
  gemini: {
    name: 'Gemini',
    command: join(NVM_BIN, 'gemini'),
    execMode: false, // Uses pipe mode
    color: '#4285f4',
    credPath: join(homedir(), '.gemini/oauth_creds.json'),
  },
  codex: {
    name: 'Codex',
    command: join(NVM_BIN, 'codex'),
    execMode: true, // Uses exec mode
    color: '#a855f7',
    credPath: join(homedir(), '.codex/auth.json'),
  },
  claude: {
    name: 'Claude',
    command: join(NVM_BIN, 'claude'),
    execMode: false,
    printMode: true,
    color: '#ff7b54',
    credPath: join(homedir(), '.claude/DISABLED'), // Not available - no paid account
  },
};

/**
 * Check if an agent is available (credentials exist)
 */
export function isAgentAvailable(agent: AgentName): boolean {
  const config = AGENTS[agent];
  return existsSync(config.credPath);
}

/**
 * Get list of available agents
 */
export function getAvailableAgents(): AgentName[] {
  return (Object.keys(AGENTS) as AgentName[]).filter(isAgentAvailable);
}

/**
 * Get agent status
 */
export function getAgentStatus(): Record<AgentName, { available: boolean; name: string; color: string }> {
  const status: Record<string, { available: boolean; name: string; color: string }> = {};
  for (const [key, config] of Object.entries(AGENTS)) {
    status[key] = {
      available: existsSync(config.credPath),
      name: config.name,
      color: config.color,
    };
  }
  return status as Record<AgentName, { available: boolean; name: string; color: string }>;
}

/**
 * Call an agent with a prompt
 * 
 * @param agent - The agent to call (gemini, codex, claude)
 * @param prompt - The prompt to send
 * @returns The agent's response
 */
export async function callAgent(agent: AgentName, prompt: string): Promise<string> {
  const config = AGENTS[agent];
  
  if (!config) {
    throw new Error(`Unknown agent: ${agent}`);
  }
  
  if (!isAgentAvailable(agent)) {
    throw new Error(`${config.name} is not configured. Run the ${agent} CLI first to authenticate.`);
  }
  
  const startTime = Date.now();
  
  try {
    let result: string;
    
    if (config.execMode) {
      // Codex uses exec mode: `codex exec "prompt"`
      result = execSync(`${config.command} exec ${JSON.stringify(prompt)}`, {
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, PATH: `${NVM_BIN}:${process.env.PATH}` },
      });
    } else if (config.printMode) {
      // Claude uses -p flag: `claude -p "prompt"`
      result = execSync(`${config.command} -p ${JSON.stringify(prompt)}`, {
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, PATH: `${NVM_BIN}:${process.env.PATH}` },
      });
    } else {
      // Gemini uses pipe mode: `echo "prompt" | gemini`
      result = execSync(`echo ${JSON.stringify(prompt)} | ${config.command} 2>/dev/null`, {
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, PATH: `${NVM_BIN}:${process.env.PATH}` },
        shell: '/bin/bash',
      });
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${config.name}] Response in ${elapsed}s`);
    
    return result.trim();
  } catch (error) {
    const err = error as Error;
    throw new Error(`${config.name} failed: ${err.message}`);
  }
}

/**
 * Call agent with conversation context for multi-turn conversations
 */
export async function callAgentWithContext(
  agent: AgentName,
  prompt: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  let contextPrompt = '';
  
  if (history.length > 0) {
    contextPrompt = 'Previous conversation:\n';
    for (const { role, content } of history) {
      contextPrompt += `${role === 'user' ? 'User' : 'Assistant'}: ${content}\n`;
    }
    contextPrompt += '\nNew question: ';
  }
  
  return callAgent(agent, contextPrompt + prompt);
}

/**
 * Call all available agents in parallel (brainstorm)
 */
export async function brainstorm(prompt: string): Promise<Record<AgentName, { response?: string; error?: string; elapsed?: number }>> {
  const availableAgents = getAvailableAgents();
  const results: Record<string, { response?: string; error?: string; elapsed?: number }> = {};
  
  const promises = availableAgents.map(async (agent) => {
    const startTime = Date.now();
    try {
      const response = await callAgent(agent, prompt);
      results[agent] = { 
        response, 
        elapsed: (Date.now() - startTime) / 1000 
      };
    } catch (error) {
      const err = error as Error;
      results[agent] = { 
        error: err.message, 
        elapsed: (Date.now() - startTime) / 1000 
      };
    }
  });
  
  await Promise.all(promises);
  
  return results as Record<AgentName, { response?: string; error?: string; elapsed?: number }>;
}
