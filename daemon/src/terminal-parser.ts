/**
 * Terminal Output Parser
 * 
 * Parses raw Gemini CLI terminal output (with ANSI codes)
 * into structured chat events.
 */

// ANSI escape code regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

/**
 * Detect if a line is a Gemini prompt (waiting for input)
 */
export function isPromptLine(line: string): boolean {
  const clean = stripAnsi(line).trim();
  // Gemini CLI shows ">" or similar as prompt
  return clean === '>' || clean === '❯' || clean.endsWith('> ') || clean.match(/^[>❯]\s*$/) !== null;
}

/**
 * Detect if output indicates Gemini is thinking
 */
export function isThinkingIndicator(text: string): boolean {
  const clean = stripAnsi(text).toLowerCase();
  return clean.includes('thinking') || 
         clean.includes('...') ||
         clean.includes('searching') ||
         clean.includes('reading');
}

/**
 * Detect tool usage in output
 */
export function detectToolUsage(text: string): { tool: string; action: string } | null {
  const clean = stripAnsi(text);
  
  // Common patterns for tool usage
  const patterns = [
    /Using tool:\s*(\w+)/i,
    /Running:\s*(.+)/i,
    /Executing:\s*(.+)/i,
    /\[(\w+)\]\s*(.+)/,
  ];
  
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      return { tool: match[1], action: match[2] || '' };
    }
  }
  
  return null;
}

export interface ParsedChunk {
  type: 'text' | 'prompt' | 'thinking' | 'tool' | 'code_start' | 'code_end';
  content: string;
  tool?: string;
  language?: string;
}

/**
 * Parse terminal output chunk
 */
export function parseTerminalChunk(chunk: string): ParsedChunk[] {
  const results: ParsedChunk[] = [];
  const lines = chunk.split('\n');
  
  let inCodeBlock = false;
  
  for (const line of lines) {
    const clean = stripAnsi(line);
    
    // Check for code block markers
    if (clean.startsWith('```')) {
      if (inCodeBlock) {
        results.push({ type: 'code_end', content: '' });
        inCodeBlock = false;
      } else {
        const lang = clean.slice(3).trim();
        results.push({ type: 'code_start', content: '', language: lang });
        inCodeBlock = true;
      }
      continue;
    }
    
    // Check for prompt
    if (isPromptLine(line)) {
      results.push({ type: 'prompt', content: clean });
      continue;
    }
    
    // Check for thinking
    if (isThinkingIndicator(line)) {
      results.push({ type: 'thinking', content: clean });
      continue;
    }
    
    // Check for tool usage
    const tool = detectToolUsage(line);
    if (tool) {
      results.push({ type: 'tool', content: clean, tool: tool.tool });
      continue;
    }
    
    // Regular text
    if (clean.trim()) {
      results.push({ type: 'text', content: clean });
    }
  }
  
  return results;
}

/**
 * Accumulator for terminal output that builds complete messages
 */
export class TerminalMessageAccumulator {
  private buffer: string = '';
  private isCollecting: boolean = false;
  private lastPromptTime: number = 0;
  
  /**
   * Add output chunk and return any complete messages
   */
  addChunk(chunk: string): { 
    content: string; 
    isComplete: boolean;
    isThinking: boolean;
  } {
    const clean = stripAnsi(chunk);
    
    // Check if we hit a prompt (message complete)
    if (isPromptLine(chunk)) {
      const content = this.buffer.trim();
      this.buffer = '';
      this.isCollecting = false;
      this.lastPromptTime = Date.now();
      
      return {
        content,
        isComplete: true,
        isThinking: false,
      };
    }
    
    // Check for thinking indicator
    if (isThinkingIndicator(chunk)) {
      return {
        content: this.buffer,
        isComplete: false,
        isThinking: true,
      };
    }
    
    // Accumulate text
    this.buffer += clean;
    this.isCollecting = true;
    
    return {
      content: this.buffer,
      isComplete: false,
      isThinking: false,
    };
  }
  
  /**
   * Get current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }
  
  /**
   * Reset the accumulator
   */
  reset(): void {
    this.buffer = '';
    this.isCollecting = false;
  }
  
  /**
   * Check if we're currently collecting a message
   */
  isActive(): boolean {
    return this.isCollecting;
  }
}
