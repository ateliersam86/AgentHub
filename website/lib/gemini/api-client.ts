/**
 * Gemini API Client with OAuth via Vertex AI
 * Uses Vertex AI endpoint which supports cloud-platform scope (Ultra subscription)
 * This provides fast streaming responses (~2-3s first token)
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const OAUTH_CREDS_PATH = join(homedir(), '.gemini/oauth_creds.json');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Vertex AI endpoint for Gemini (supports cloud-platform scope)
const REGION = 'us-central1';
const PROJECT_ID = process.env.GEMINI_PROJECT_ID || 'gen-lang-client-0493513267';
const MODEL = 'gemini-2.0-flash-001';

// Client credentials - must be set in environment for token refresh
// These can be obtained from the Gemini CLI source
const CLIENT_ID = process.env.GEMINI_OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GEMINI_OAUTH_CLIENT_SECRET || '';

interface OAuthCreds {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
  token_type: string;
}

// Get or create GCP project for Gemini
async function getProjectId(): Promise<string> {
  // Try to read from settings or env
  const settingsPath = join(homedir(), '.gemini/settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      if (settings.projectId) return settings.projectId;
    } catch {
      // Ignore
    }
  }
  
  // Check environment
  if (process.env.GEMINI_PROJECT_ID) {
    return process.env.GEMINI_PROJECT_ID;
  }
  
  // Default project - user should configure this
  return PROJECT_ID;
}

async function getValidToken(): Promise<string> {
  if (!existsSync(OAUTH_CREDS_PATH)) {
    throw new Error('OAuth credentials not found. Run `gemini` CLI first to authenticate.');
  }

  const creds: OAuthCreds = JSON.parse(readFileSync(OAUTH_CREDS_PATH, 'utf8'));
  
  // Check if token is expired (with 5 minute buffer)
  const now = Date.now();
  if (creds.expiry_date && creds.expiry_date < now + 5 * 60 * 1000) {
    console.log('[GeminiAPI] Refreshing OAuth token...');
    
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
    
    // Update credentials file
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

export async function streamGeminiResponse(
  prompt: string,
  callbacks: StreamCallbacks,
  context?: { role: 'user' | 'model'; text: string }[]
): Promise<void> {
  const accessToken = await getValidToken();
  const projectId = await getProjectId();

  // Vertex AI streaming endpoint
  const url = `https://${REGION}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${REGION}/publishers/google/models/${MODEL}:streamGenerateContent`;

  // Build messages with context
  const contents = [];
  
  if (context && context.length > 0) {
    for (const msg of context) {
      contents.push({
        role: msg.role,
        parts: [{ text: msg.text }],
      });
    }
  }
  
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

    // Collect full response first (it's fast, ~1-2s total)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullResponse += decoder.decode(value, { stream: true });
    }

    // Parse the JSON array response
    let fullText = '';
    try {
      // Vertex AI returns: [{...},{...},{...}]
      const chunks = JSON.parse(fullResponse);
      
      for (const chunk of chunks) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullText += text;
          callbacks.onToken(text);
        }
      }
    } catch (parseError) {
      // If JSON parse fails, try to extract text manually
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

// Non-streaming version
export async function callGeminiAPI(prompt: string, context?: { role: 'user' | 'model'; text: string }[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let result = '';
    streamGeminiResponse(prompt, {
      onToken: (token) => { result += token; },
      onComplete: () => resolve(result),
      onError: reject,
    }, context);
  });
}
