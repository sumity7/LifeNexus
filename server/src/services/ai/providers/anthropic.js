import Anthropic from '@anthropic-ai/sdk';
import { AIError } from '../errors.js';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export const REFUSAL_TEXT = "I can't help with that request.";

const textOf = (message) => (message.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
const usageOf = (message) => ({ input: message.usage?.input_tokens ?? 0, output: message.usage?.output_tokens ?? 0 });

/** Translates SDK errors into friendly AIErrors (most specific first). */
export function mapProviderError(err) {
  if (err instanceof AIError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AIError('AI_TIMEOUT', { cause: err });
  if (err instanceof Anthropic.APIConnectionError) return new AIError('AI_UNAVAILABLE', { cause: err });
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new AIError('AI_AUTH', { cause: err });
  if (err instanceof Anthropic.RateLimitError) return new AIError('AI_RATE_LIMITED', { cause: err });
  if (err instanceof Anthropic.APIError && (err.status === undefined || err.status >= 500)) return new AIError('AI_UNAVAILABLE', { cause: err });
  if (err instanceof Anthropic.APIError) return new AIError('AI_REQUEST_REJECTED', { cause: err });
  return new AIError('AI_UNAVAILABLE', { cause: err });
}

/**
 * Claude via the official SDK. Thinking is adaptive by default on current
 * models; effort is tuned per call. Server-side refusal fallbacks are enabled
 * by default and switched off automatically if the account doesn't support them.
 */
export class AnthropicProvider {
  name = 'anthropic';
  available = true;

  constructor({ apiKey, model, maxTokens = 16000, timeoutMs = 90000, refusalFallback = 'default', client }) {
    this.client = client ?? new Anthropic({ apiKey, maxRetries: 2, timeout: timeoutMs });
    this.model = model;
    this.maxTokens = maxTokens;
    this.useFallback = refusalFallback === 'default';
  }

  async send(params) {
    try {
      if (this.useFallback) {
        try {
          return await this.client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' });
        } catch (err) {
          const unsupported = err instanceof Anthropic.BadRequestError && /fallback|beta/i.test(String(err.message));
          if (!unsupported) throw err;
          this.useFallback = false;
        }
      }
      return await this.client.messages.create(params);
    } catch (err) {
      throw mapProviderError(err);
    }
  }

  async generate({ system, messages, maxTokens, effort = 'medium' }) {
    const res = await this.send({ model: this.model, max_tokens: maxTokens ?? this.maxTokens, system, messages, output_config: { effort } });
    if (res.stop_reason === 'refusal') return { text: REFUSAL_TEXT, usage: usageOf(res), refused: true };
    return { text: textOf(res), usage: usageOf(res), stopReason: res.stop_reason };
  }

  async stream({ system, messages, maxTokens, effort = 'medium', onText }) {
    try {
      const stream = this.client.messages.stream({ model: this.model, max_tokens: maxTokens ?? this.maxTokens, system, messages, output_config: { effort } });
      if (onText) stream.on('text', onText);
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') return { text: REFUSAL_TEXT, usage: usageOf(final), refused: true };
      return { text: textOf(final), usage: usageOf(final), stopReason: final.stop_reason };
    } catch (err) {
      throw mapProviderError(err);
    }
  }

  /**
   * Constrained JSON output. Parses and (optionally) validates the shape;
   * one retry on malformed output, then AI_BAD_OUTPUT.
   */
  async structured({ system, messages, schema, maxTokens, effort = 'medium', validate }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.send({
        model: this.model,
        max_tokens: maxTokens ?? this.maxTokens,
        system,
        messages,
        output_config: { effort, format: { type: 'json_schema', schema } },
      });
      if (res.stop_reason === 'refusal') return { data: { reply: REFUSAL_TEXT, actions: [] }, usage: usageOf(res), refused: true };
      try {
        const data = JSON.parse(textOf(res));
        if (validate && !validate(data)) throw new Error('shape');
        return { data, usage: usageOf(res) };
      } catch {
        if (attempt === 1) throw new AIError('AI_BAD_OUTPUT');
      }
    }
    throw new AIError('AI_BAD_OUTPUT');
  }
}
