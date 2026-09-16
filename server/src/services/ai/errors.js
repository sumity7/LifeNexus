import { AppError } from '../../utils/AppError.js';

/**
 * Every AI failure the user can see. Messages are written for end users and
 * never include provider responses, request contents or credentials.
 */
export const AI_ERRORS = {
  AI_NOT_CONFIGURED: [503, "The AI assistant isn't set up on this server yet."],
  AI_DISABLED: [403, 'AI is turned off in your settings.'],
  AI_SCOPE_DISABLED: [403, 'AI access to this module is turned off in your settings.'],
  AI_AUTH: [503, 'The AI service rejected this server’s credentials. An administrator needs to check the API key.'],
  AI_RATE_LIMITED: [429, 'The AI service is busy right now. Please try again in a moment.'],
  AI_TIMEOUT: [504, 'The AI took too long to respond. Please try again.'],
  AI_UNAVAILABLE: [503, 'The AI service is temporarily unavailable. Please try again shortly.'],
  AI_BAD_OUTPUT: [502, "The AI returned a response that couldn't be used. Please try rephrasing."],
  AI_REQUEST_REJECTED: [502, "The AI service couldn't process this request."],
};

export class AIError extends AppError {
  constructor(code, { message, cause } = {}) {
    const [status, defaultMessage] = AI_ERRORS[code] ?? AI_ERRORS.AI_UNAVAILABLE;
    super(status, message ?? defaultMessage, { code });
    this.name = 'AIError';
    // Kept for server-side logging only; never serialized to clients.
    if (cause) Object.defineProperty(this, 'cause', { value: cause, enumerable: false });
  }
}
