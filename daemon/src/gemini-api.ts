/**
 * Gemini API Client
 * Direct integration with Vertex AI (same as website streaming API)
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const OAUTH_CREDS_PATH = join(homedir(), '.gemini/oauth_creds.json');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Vertex AI configuration
const REGION = 'us-central1';
const PROJECT_ID = process.env.GEMINI_PROJECT_ID || 'gen-lang-client-0493513267';
const MODEL = 'gemini-2.0-flash-001';

// OAuth client credentials - must be set in environment
// These can be obtained from the Gemini CLI source
const CLIENT_ID = process.env.GEMINI_OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GEMINI_OAUTH_CLIENT_SECRET || '';

interface OAuthCreds {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

async function getValidToken(): Promise<string> {
  if (!existsSync(OAUTH_CREDS_PATH)) {
    throw new Error('OAuth credentials not found. Run `gemini` CLI first to authenticate.');
  }

  const creds: OAuthCreds = JSON.parse(readFileSync(OAUTH_CREDS_PATH, 'utf8'));
  
  // Check if token is expired
  const now = Date.now();
  if (creds.expiry_date && creds.expiry_date < now + 5 * 60 * 1000) {
    console.log('[API] Refreshing OAuth token...');
    
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const newTokens = await response.json();
    
    const updatedCreds: OAuthCreds = {
      ...creds,
      access_token: newTokens.access_token,
      expiry_date: Date.now() + (newTokens.expires_in * 1000),
    };
    
    writeFileSync(OAUTH_CREDS_PATH, JSON.stringify(updatedCreds, null, 2));
    return newTokens.access_token;
  }

  return creds.access_token;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

/**
 * Stream a response from Gemini API
 */
export async function streamGeminiResponse(
  prompt: string,
  projectPath: string,
  callbacks: StreamCallbacks,
  context?: { role: 'user' | 'model'; text: string }[]
): Promise<void> {
  const accessToken = await getValidToken();

  const url = `https://${REGION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${REGION}/publishers/google/models/${MODEL}:streamGenerateContent`;

  // Build system prompt with project context
  const systemPrompt = `You are an AI assistant helping with a coding project.
Project path: ${projectPath}
You have access to the project files and can help with code modifications, debugging, and general development tasks.`;

  const contents = [];
  
  // Add system context
  contents.push({
    role: 'user',
    parts: [{ text: systemPrompt }],
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'Understood. I\'m ready to help with this project.' }],
  });
  
  // Add conversation history
  if (context && context.length > 0) {
    for (const msg of context) {
      contents.push({
        role: msg.role,
        parts: [{ text: msg.text }],
      });
    }
  }
  
  // Add current prompt
  contents.push({
    role: 'user',
    parts: [{ text: prompt }],
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      callbacks.onError(new Error(`Gemini API error: ${response.status} - ${errorText}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError(new Error('No response body'));
      return;
    }

    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullResponse += decoder.decode(value, { stream: true });
    }

    // Parse the JSON array response
    let fullText = '';
    try {
      const chunks = JSON.parse(fullResponse);
      for (const chunk of chunks) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullText += text;
          callbacks.onToken(text);
        }
      }
    } catch {
      // Fallback: extract text with regex
      const textMatches = fullResponse.matchAll(/"text":\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g);
      for (const match of textMatches) {
        const text = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        fullText += text;
        callbacks.onToken(text);
      }
    }

    callbacks.onComplete(fullText);
  } catch (error) {
    callbacks.onError(error as Error);
  }
}
