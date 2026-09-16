import { AIError } from '../errors.js';

export const REFUSAL_TEXT = "I can't help with that request.";
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const BLOCKED_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);

const systemText = (system) => (Array.isArray(system) ? system.map((b) => b.text ?? '').join('\n\n') : String(system ?? ''));
const toContents = (messages) => messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content ?? '') }] }));
const partsToText = (parts) => (parts ?? []).map((p) => p.text ?? '').join('');
const usageOf = (data) => ({ input: data?.usageMetadata?.promptTokenCount ?? 0, output: data?.usageMetadata?.candidatesTokenCount ?? 0 });

/**
 * Gemini's `responseSchema` is an OpenAPI-3.0-flavoured subset of JSON Schema:
 * no `additionalProperties`, no `$schema`, no string-encoded union tricks. Strip
 * what it doesn't accept rather than hand-authoring a second schema.
 */
function toGeminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const { additionalProperties, $schema, ...rest } = schema;
  const out = {};
  for (const [key, value] of Object.entries(rest)) {
    out[key] = key === 'properties' && value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toGeminiSchema(v)]))
      : toGeminiSchema(value);
  }
  return out;
}

/** Translates transport/HTTP failures into friendly AIErrors (most specific first). */
export function mapGeminiError(err) {
  if (err instanceof AIError) return err;
  if (err?.isTimeout) return new AIError('AI_TIMEOUT', { cause: err });
  const status = err?.status;
  if (status === 401 || status === 403) return new AIError('AI_AUTH', { cause: err });
  if (status === 429) return new AIError('AI_RATE_LIMITED', { cause: err });
  if (status === 400) return new AIError('AI_REQUEST_REJECTED', { cause: err });
  return new AIError('AI_UNAVAILABLE', { cause: err });
}

/**
 * Google Gemini via the plain REST API (no SDK dependency — one `fetch` call
 * per turn). Interface-compatible with AnthropicProvider so it's a drop-in
 * alternative when a free-tier key is preferable to a paid Anthropic key.
 */
export class GeminiProvider {
  name = 'gemini';
  available = true;

  constructor({ apiKey, model, maxTokens = 8192, timeoutMs = 90000, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async call(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${API_BASE}/models/${this.model}:${path}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(data?.error?.message ?? `Gemini HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      if (err?.name === 'AbortError') {
        const timeout = new Error('Gemini request timed out');
        timeout.isTimeout = true;
        throw timeout;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async generate({ system, messages, maxTokens }) {
    let data;
    try {
      data = await this.call('generateContent', {
        systemInstruction: { parts: [{ text: systemText(system) }] },
        contents: toContents(messages),
        generationConfig: { maxOutputTokens: maxTokens ?? this.maxTokens },
      });
    } catch (err) {
      throw mapGeminiError(err);
    }
    const candidate = data.candidates?.[0];
    if (!candidate || BLOCKED_REASONS.has(candidate.finishReason)) return { text: REFUSAL_TEXT, usage: usageOf(data), refused: true };
    return { text: partsToText(candidate.content?.parts), usage: usageOf(data) };
  }

  // Gemini's SSE stream isn't wired up (the app doesn't call provider.stream() yet);
  // fall back to a single non-streaming call so the interface stays complete.
  async stream({ system, messages, maxTokens }) {
    return this.generate({ system, messages, maxTokens });
  }

  /**
   * Constrained JSON output via `responseSchema`. One retry on malformed/invalid
   * output, then AI_BAD_OUTPUT — same contract as AnthropicProvider.
   */
  async structured({ system, messages, schema, maxTokens, validate }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let data;
      try {
        data = await this.call('generateContent', {
          systemInstruction: { parts: [{ text: systemText(system) }] },
          contents: toContents(messages),
          generationConfig: { maxOutputTokens: maxTokens ?? this.maxTokens, responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) },
        });
      } catch (err) {
        throw mapGeminiError(err);
      }
      const candidate = data.candidates?.[0];
      if (!candidate || BLOCKED_REASONS.has(candidate.finishReason)) return { data: { reply: REFUSAL_TEXT, actions: [] }, usage: usageOf(data), refused: true };
      try {
        const parsed = JSON.parse(partsToText(candidate.content?.parts));
        if (validate && !validate(parsed)) throw new Error('shape');
        return { data: parsed, usage: usageOf(data) };
      } catch {
        if (attempt === 1) throw new AIError('AI_BAD_OUTPUT');
      }
    }
    throw new AIError('AI_BAD_OUTPUT');
  }
}
