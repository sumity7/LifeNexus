import { env } from '../config/env.js';

/**
 * Document text-extraction / OCR provider interface.
 *
 *   isAvailable() → boolean
 *   extract({ buffer, mimeType }) → { text, metadata? }
 *
 * No extraction service is bundled. When EXTRACTION_PROVIDER is unset the
 * null provider reports "unavailable" and LifeOS never fabricates extracted
 * content. To add one, implement the two methods and register it below.
 */
class NullExtractionProvider {
  name = 'none';
  isAvailable() {
    return false;
  }
  async extract() {
    throw new Error('No extraction provider configured');
  }
}

/** Plain-text files need no OCR: read them directly so search/AI can use them. */
class PlainTextProvider {
  name = 'plain-text';
  isAvailable() {
    return true;
  }
  supports(mimeType) {
    return mimeType === 'text/plain' || mimeType === 'text/csv';
  }
  async extract({ buffer, mimeType }) {
    if (!this.supports(mimeType)) return null;
    return { text: buffer.toString('utf8').slice(0, 200_000) };
  }
}

let provider;
export function getExtractionProvider() {
  if (!provider) {
    switch (env.EXTRACTION_PROVIDER) {
      case 'none':
      case undefined:
      case '':
        provider = new NullExtractionProvider();
        break;
      default:
        provider = new NullExtractionProvider();
    }
  }
  return provider;
}

export const plainTextProvider = new PlainTextProvider();
