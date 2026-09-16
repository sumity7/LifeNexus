import { env } from '../../../config/env.js';
import { AIError } from '../errors.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';

const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5';
const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';

/**
 * AI provider interface. Every provider implements:
 *
 *   name: string, model: string|null, available: boolean
 *   generate({ system, messages, maxTokens, effort })                       → { text, usage, refused? }
 *   stream({ system, messages, maxTokens, effort, onText })                 → { text, usage, refused? }
 *   structured({ system, messages, schema, maxTokens, effort, validate })   → { data, usage, refused? }
 *
 * Providers must throw `AIError` (friendly, code-tagged) for every failure.
 * API keys stay on the server; nothing here is ever sent to the browser.
 */
export class NotConfiguredProvider {
  name = 'none';
  model = null;
  available = false;

  constructor(issue) {
    this.issue = issue;
  }

  async generate() {
    throw new AIError('AI_NOT_CONFIGURED');
  }

  async stream() {
    throw new AIError('AI_NOT_CONFIGURED');
  }

  async structured() {
    throw new AIError('AI_NOT_CONFIGURED');
  }
}

export function createProvider(config = env) {
  if (config.AI_PROVIDER === 'anthropic') {
    const apiKey = config.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return new NotConfiguredProvider('missing_key');
    return new AnthropicProvider({
      apiKey,
      model: config.AI_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL,
      maxTokens: config.AI_MAX_OUTPUT_TOKENS ?? 16000,
      timeoutMs: config.AI_TIMEOUT_MS ?? 90000,
      refusalFallback: config.AI_REFUSAL_FALLBACK ?? 'default',
    });
  }
  if (config.AI_PROVIDER === 'gemini') {
    const apiKey = config.GEMINI_API_KEY?.trim();
    if (!apiKey) return new NotConfiguredProvider('missing_key');
    return new GeminiProvider({
      apiKey,
      // AI_MODEL is shared across providers; fall back to Gemini's own default unless explicitly overridden.
      model: config.AI_MODEL?.trim() || GEMINI_DEFAULT_MODEL,
      maxTokens: config.AI_MAX_OUTPUT_TOKENS ?? 8192,
      timeoutMs: config.AI_TIMEOUT_MS ?? 90000,
    });
  }
  return new NotConfiguredProvider('no_provider');
}

let provider;
export function getAIProvider() {
  provider ??= createProvider();
  return provider;
}

/** Test hook: swap the provider (API tests use a scripted provider). */
export function setAIProvider(next) {
  provider = next;
}
