/**
 * A thin client for Google's Generative Language API (Gemini).
 *
 * A second, separate model provider from `engine/groq.ts` — Cerebus's fix
 * generation and chat stay on Groq; this one exists for the attack-path
 * narrative specifically, because that's the feature it was asked for. Kept
 * as its own file rather than folded into `groq.ts` so the two providers
 * don't share a config shape neither actually needs to.
 */
import { loadEnvFile } from '../config/env-file.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-flash-latest';

export function geminiConfigured(): boolean {
  loadEnvFile();
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModel(): string {
  loadEnvFile();
  return process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
}

export class GeminiError extends Error {}

/**
 * One request, no streaming, no retry — same discipline as `askGroq`.
 *
 * `maxOutputTokens` needs real headroom regardless of `thinkingBudget`: this
 * model spent 600+ tokens "thinking" even with the budget set to 0 in
 * testing, and a tight limit truncates the visible answer to nothing before
 * it gets to write it, not just to a short one.
 */
export async function askGemini(
  systemInstruction: string,
  userContent: string,
  options?: { maxOutputTokens?: number; temperature?: number },
): Promise<string> {
  loadEnvFile();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError('GEMINI_API_KEY is not set — there is no model to ask.');
  }

  const url = `${ENDPOINT}/${geminiModel()}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: userContent }] }],
        generationConfig: {
          maxOutputTokens: options?.maxOutputTokens ?? 1024,
          temperature: options?.temperature ?? 0.3,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch (err) {
    throw new GeminiError(`Could not reach Gemini: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GeminiError(`Gemini returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new GeminiError('Gemini returned no content — try a higher maxOutputTokens.');
  return text;
}
