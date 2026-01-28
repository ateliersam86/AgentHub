/**
 * CLI Output Parser
 * 
 * Parses Gemini CLI output in stream-json format into structured events
 * for the chat interface.
 */

export interface CLIEvent {
  type: 'init' | 'user_message' | 'assistant_chunk' | 'assistant_complete' | 
        'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'error' | 'raw';
  timestamp: Date;
  sessionId?: string;
  model?: string;
  role?: 'user' | 'assistant';
  content?: string;
  isStreaming?: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  stats?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    toolCalls: number;
  };
  raw?: string;
}

/**
 * Parse a single line of CLI output (stream-json format)
 */
export function parseCLILine(line: string): CLIEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Skip non-JSON lines (loading messages, etc.)
  if (!trimmed.startsWith('{')) {
    // Check for known status messages
    if (trimmed.includes('Thinking') || trimmed.includes('...')) {
      return {
        type: 'thinking',
        timestamp: new Date(),
        content: trimmed,
      };
    }
    // Skip other non-JSON lines
    return null;
  }

  try {
    const json = JSON.parse(trimmed);
    const timestamp = json.timestamp ? new Date(json.timestamp) : new Date();

    switch (json.type) {
      case 'init':
        return {
          type: 'init',
          timestamp,
          sessionId: json.session_id,
          model: json.model,
        };

      case 'message':
        if (json.role === 'user') {
          return {
            type: 'user_message',
            timestamp,
            role: 'user',
            content: json.content,
          };
        } else if (json.role === 'assistant') {
          // If delta:true, it's a streaming chunk
          return {
            type: json.delta ? 'assistant_chunk' : 'assistant_complete',
            timestamp,
            role: 'assistant',
            content: json.content,
            isStreaming: json.delta || false,
          };
        }
        break;

      case 'tool_call':
        return {
          type: 'tool_call',
          timestamp,
          toolName: json.tool || json.name,
          toolArgs: json.args || json.arguments,
        };

      case 'tool_result':
        return {
          type: 'tool_result',
          timestamp,
          toolName: json.tool || json.name,
          toolResult: json.result,
        };

      case 'result':
        return {
          type: 'complete',
          timestamp,
          stats: json.stats ? {
            totalTokens: json.stats.total_tokens || 0,
            inputTokens: json.stats.input_tokens || json.stats.input || 0,
            outputTokens: json.stats.output_tokens || json.stats.output || 0,
            durationMs: json.stats.duration_ms || 0,
            toolCalls: json.stats.tool_calls || 0,
          } : undefined,
        };

      case 'error':
        return {
          type: 'error',
          timestamp,
          content: json.message || json.error || 'Unknown error',
        };

      default:
        // Unknown type, return as raw
        return {
          type: 'raw',
          timestamp,
          raw: trimmed,
        };
    }
  } catch {
    // Not valid JSON, skip
    return null;
  }

  return null;
}

/**
 * Accumulator for building complete messages from streaming chunks
 */
export class MessageAccumulator {
  private currentMessage: string = '';
  private isStreaming: boolean = false;

  reset(): void {
    this.currentMessage = '';
    this.isStreaming = false;
  }

  addChunk(content: string): string {
    this.currentMessage += content;
    this.isStreaming = true;
    return this.currentMessage;
  }

  complete(): string {
    this.isStreaming = false;
    return this.currentMessage;
  }

  getCurrentMessage(): string {
    return this.currentMessage;
  }

  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }
}
