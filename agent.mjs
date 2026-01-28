#!/usr/bin/env node
/**
 * @sam/agent-cli - Multi-Agent Controller
 * 
 * Global CLI for interacting with AI agents (Gemini, Codex, Claude)
 * Uses OAuth/credentials from each agent's CLI installation.
 * 
 * Install globally:
 *   cd ~/dev/packages/agent-cli && npm link
 * 
 * Usage:
 *   agent ask gemini "Question"
 *   agent ask codex "Question"
 *   agent chat gemini
 *   agent brainstorm "Topic"
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as os from 'os';

// Colors
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = (agent, msg) => console.log(`${C.green}[${agent.toUpperCase()}]${C.reset} ${msg}`);
const error = (msg) => console.error(`${C.red}[ERROR]${C.reset} ${msg}`);

// Response directory
const RESPONSE_DIR = '/tmp/agent-responses';
if (!fs.existsSync(RESPONSE_DIR)) fs.mkdirSync(RESPONSE_DIR, { recursive: true });

// Agent configurations
const NVM_BIN = path.join(os.homedir(), '.nvm/versions/node/v20.19.5/bin');

const AGENTS = {
  gemini: {
    name: 'Gemini',
    command: `${NVM_BIN}/gemini`,
    color: C.blue,
    available: () => fs.existsSync(path.join(os.homedir(), '.gemini/oauth_creds.json')),
  },
  codex: {
    name: 'Codex',
    command: `${NVM_BIN}/codex`,
    execMode: true,  // Uses `codex exec "prompt"` instead of pipe
    color: C.magenta,
    available: () => fs.existsSync(path.join(os.homedir(), '.codex/auth.json')),
  },
};

/**
 * Call an agent (uses their CLI with proper auth)
 */
function callAgent(agentName, prompt) {
  const agent = AGENTS[agentName];
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);
  if (!agent.available()) throw new Error(`${agent.name} not configured. Run '${agentName}' CLI first.`);
  
  log(agentName, 'Processing...');
  const startTime = Date.now();
  
  try {
    let result;
    if (agent.execMode) {
      // Codex uses exec mode
      result = execSync(`${agent.command} exec ${JSON.stringify(prompt)}`, {
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, PATH: `${NVM_BIN}:${process.env.PATH}` },
      });
    } else {
      // Gemini uses pipe mode
      result = execSync(`echo ${JSON.stringify(prompt)} | ${agent.command} 2>/dev/null`, {
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, PATH: `${NVM_BIN}:${process.env.PATH}` },
      });
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(agentName, `Done in ${elapsed}s`);
    return result.trim();
  } catch (err) {
    throw new Error(`${agent.name} failed: ${err.message}`);
  }
}

/**
 * Call with context for multi-turn
 */
function callAgentWithContext(agentName, prompt, history) {
  let contextPrompt = '';
  if (history.length > 0) {
    contextPrompt = 'Previous conversation:\n';
    for (const { role, content } of history) {
      contextPrompt += `${role === 'user' ? 'User' : 'Assistant'}: ${content}\n`;
    }
    contextPrompt += '\nNew question: ';
  }
  return callAgent(agentName, contextPrompt + prompt);
}

/**
 * Single question
 */
function ask(agentName, prompt) {
  const response = callAgent(agentName, prompt);
  
  const filename = `${agentName}-${Date.now()}.md`;
  const filepath = path.join(RESPONSE_DIR, filename);
  fs.writeFileSync(filepath, `# ${AGENTS[agentName]?.name || agentName} Response\n\n**Prompt:** ${prompt}\n\n**Response:**\n${response}`);
  log(agentName, `Saved to ${filepath}`);
  
  return response;
}

/**
 * Multi-agent brainstorm
 */
function brainstorm(prompt) {
  console.log(`\n${C.blue}=== Multi-Agent Brainstorm ===${C.reset}\n`);
  
  const results = {};
  const availableAgents = Object.entries(AGENTS)
    .filter(([_, config]) => config.available())
    .map(([name]) => name);
  
  if (availableAgents.length === 0) {
    error('No agents configured. Run gemini or codex CLI first.');
    process.exit(1);
  }
  
  console.log(`Agents: ${availableAgents.join(', ')}\n`);
  
  for (const agentName of availableAgents) {
    try {
      results[agentName] = callAgent(agentName, prompt);
    } catch (err) {
      results[agentName] = `Error: ${err.message}`;
    }
    console.log();
  }
  
  // Display results
  console.log(`\n${C.cyan}=== Results ===${C.reset}\n`);
  for (const [name, response] of Object.entries(results)) {
    console.log(`${AGENTS[name].color}## ${AGENTS[name].name}${C.reset}\n${response}\n`);
  }
  
  // Save
  const filename = `brainstorm-${Date.now()}.md`;
  const filepath = path.join(RESPONSE_DIR, filename);
  let content = `# Multi-Agent Brainstorm\n\n**Topic:** ${prompt}\n**Date:** ${new Date().toISOString()}\n\n`;
  for (const [name, response] of Object.entries(results)) {
    content += `## ${AGENTS[name]?.name || name}\n\n${response}\n\n---\n\n`;
  }
  fs.writeFileSync(filepath, content);
  log('brainstorm', `Saved to ${filepath}`);
}

/**
 * Interactive chat
 */
function chat(agentName) {
  const agent = AGENTS[agentName];
  if (!agent) {
    error(`Unknown agent: ${agentName}`);
    process.exit(1);
  }
  
  console.log(`\n${agent.color}=== Chat with ${agent.name} ===${C.reset}`);
  console.log(`Type 'exit' to quit, 'clear' to reset context.\n`);
  
  let history = [];
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const askQuestion = () => {
    rl.question(`${C.cyan}You:${C.reset} `, (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }
      
      if (input.toLowerCase() === 'clear') {
        history = [];
        console.log('Context cleared.\n');
        askQuestion();
        return;
      }
      
      try {
        const response = callAgentWithContext(agentName, input, history);
        history.push({ role: 'user', content: input });
        history.push({ role: 'assistant', content: response });
        if (history.length > 20) history = history.slice(-20);
        
        console.log(`\n${agent.color}${agent.name}:${C.reset} ${response}\n`);
      } catch (err) {
        error(err.message);
      }
      askQuestion();
    });
  };
  
  askQuestion();
}

/**
 * Show status
 */
function status() {
  console.log(`\n${C.blue}=== Agent Status ===${C.reset}\n`);
  for (const [name, config] of Object.entries(AGENTS)) {
    const available = config.available();
    const icon = available ? `${C.green}●${C.reset}` : `${C.red}○${C.reset}`;
    console.log(`  ${icon} ${config.name}: ${available ? 'Ready' : 'Not configured'}`);
  }
  console.log();
}

/**
 * CLI
 */
function main() {
  const [,, command, ...args] = process.argv;
  
  try {
    switch (command) {
      case 'ask':
        if (args.length < 2) {
          error('Usage: agent ask <gemini|codex> <prompt>');
          process.exit(1);
        }
        const response = ask(args[0], args.slice(1).join(' '));
        console.log(`\n${C.green}Response:${C.reset}\n${response}`);
        break;
        
      case 'chat':
        if (!args[0]) {
          error('Usage: agent chat <gemini|codex>');
          process.exit(1);
        }
        chat(args[0]);
        break;
        
      case 'brainstorm':
        if (!args.length) {
          error('Usage: agent brainstorm <prompt>');
          process.exit(1);
        }
        brainstorm(args.join(' '));
        break;
        
      case 'status':
        status();
        break;
        
      default:
        console.log(`
${C.blue}@sam/agent-cli${C.reset} - Multi-Agent Controller

Usage: agent <command> [options]

Commands:
  ask <agent> <prompt>   Ask a single agent (gemini, codex)
  chat <agent>           Interactive multi-turn conversation
  brainstorm <prompt>    Ask all available agents
  status                 Show agent availability

Examples:
  agent ask gemini "Explain caching"
  agent ask codex "Write a function for X"
  agent chat gemini
  agent brainstorm "Best architecture for Echo?"

Install globally:
  cd ~/dev/packages/agent-cli && npm link
`);
    }
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
