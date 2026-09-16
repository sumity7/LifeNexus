import { env } from '../../config/env.js';
import { SmtpProvider } from './smtp.js';

/**
 * Email provider interface: send({ to, subject, html, text }) → void (throws on failure).
 * Only SMTP ships (works with any SMTP-speaking provider). LifeOS works fully
 * without one configured — password reset requests still respond normally,
 * they just don't deliver an email (logged server-side).
 */
export class NotConfiguredProvider {
  name = 'none';
  available = false;

  async send() {
    throw new Error('Email is not configured (EMAIL_PROVIDER=none or SMTP settings are incomplete)');
  }
}

export function createEmailProvider(config = env) {
  if (config.EMAIL_PROVIDER === 'smtp') {
    if (!config.SMTP_HOST || !config.EMAIL_FROM) return new NotConfiguredProvider();
    return new SmtpProvider({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
      from: config.EMAIL_FROM,
    });
  }
  return new NotConfiguredProvider();
}

let provider;
export function getEmailProvider() {
  provider ??= createEmailProvider();
  return provider;
}

/** Test hook: swap the provider (tests use a scripted provider instead of a real SMTP server). */
export function setEmailProvider(next) {
  provider = next;
}
