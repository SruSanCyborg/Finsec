/**
 * A thin client for Groq's OpenAI-compatible chat completions endpoint.
 *
 * This is the one place an actual language model runs in this codebase.
 * `engine/fix.ts` and `engine/ask.ts` both route through here rather than
 * calling `fetch` themselves, so there is exactly one place to point at when
 * asking what a model saw, what it was told, and what came back.
 */
import { loadEnvFile } from '../config/env-file.js';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export function groqConfigured(): boolean {
  loadEnvFile();
  return Boolean(process.env.GROQ_API_KEY);
}

export function groqModel(): string {
  loadEnvFile();
  return process.env.GROQ_MODEL ?? DEFAULT_MODEL;
}

export class GroqError extends Error {}

/**
 * One request, no streaming, no retry. A finding-sized prompt is small enough
 * that a single call is the whole budget — retrying a model that is down
 * would just make a broken fix take three times as long to fail.
 */
export async function askGroq(
  messages: GroqMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    jsonOnly?: boolean;
    /** gpt-oss models reason before answering, and the reasoning spends the
     * same token budget as the answer — 'low' is the right default for a
     * one-line fix or a 120-word explanation, where the reasoning is not the
     * point and a high effort was silently eating the whole budget before it
     * ever got to `content`. */
    reasoningEffort?: 'low' | 'medium' | 'high';
  },
): Promise<string> {
  loadEnvFile();
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError('GROQ_API_KEY is not set — there is no model to ask.');
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: groqModel(),
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 800,
        reasoning_effort: options?.reasoningEffort ?? 'low',
        ...(options?.jsonOnly ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (err) {
    throw new GroqError(`Could not reach Groq: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GroqError(`Groq returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new GroqError('Groq returned no content — try a higher maxTokens or reasoningEffort.');
  return content;
}
