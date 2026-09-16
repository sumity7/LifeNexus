import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SmtpProvider } from '../src/services/email/smtp.js';
import { NotConfiguredProvider, createEmailProvider } from '../src/services/email/index.js';
import { passwordResetEmail } from '../src/services/email/templates.js';

describe('SmtpProvider (unit, mocked transport)', () => {
  it('send() forwards to/subject/html/text and the configured "from" address', async () => {
    let sent;
    const transport = { sendMail: async (msg) => { sent = msg; } };
    const provider = new SmtpProvider({ from: 'LifeOS <noreply@example.com>', transport });
    await provider.send({ to: 'user@example.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi' });
    assert.equal(sent.from, 'LifeOS <noreply@example.com>');
    assert.equal(sent.to, 'user@example.com');
    assert.equal(sent.subject, 'Hi');
    assert.equal(sent.html, '<p>hi</p>');
    assert.equal(sent.text, 'hi');
  });

  it('propagates a send failure (caller decides how to handle it)', async () => {
    const transport = { sendMail: async () => { throw new Error('connection refused'); } };
    const provider = new SmtpProvider({ from: 'a@b.com', transport });
    await assert.rejects(() => provider.send({ to: 'x@y.com', subject: 's' }), /connection refused/);
  });
});

describe('createEmailProvider() selection', () => {
  it('is unconfigured when EMAIL_PROVIDER=none', () => {
    const provider = createEmailProvider({ EMAIL_PROVIDER: 'none' });
    assert.ok(provider instanceof NotConfiguredProvider);
    assert.equal(provider.available, false);
  });

  it('is unconfigured when EMAIL_PROVIDER=smtp but SMTP_HOST/EMAIL_FROM are missing', () => {
    const provider = createEmailProvider({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: '', EMAIL_FROM: '' });
    assert.ok(provider instanceof NotConfiguredProvider);
  });

  it('builds a working SmtpProvider when fully configured', () => {
    const provider = createEmailProvider({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com', SMTP_PORT: 587, EMAIL_FROM: 'a@b.com' });
    assert.ok(provider instanceof SmtpProvider);
    assert.equal(provider.available, true);
  });
});

describe('NotConfiguredProvider', () => {
  it('throws a clear error rather than silently pretending to send', async () => {
    await assert.rejects(() => new NotConfiguredProvider().send({}), /not configured/i);
  });
});

describe('passwordResetEmail template', () => {
  it('includes the reset link in both html and text, and escapes the name', () => {
    const { subject, html, text } = passwordResetEmail('<script>alert(1)</script>', 'https://app.example.com/reset-password?token=abc');
    assert.match(subject, /reset/i);
    assert.ok(html.includes('https://app.example.com/reset-password?token=abc'));
    assert.ok(text.includes('https://app.example.com/reset-password?token=abc'));
    assert.ok(!html.includes('<script>alert(1)</script>'), 'the user-supplied name must never be injected as raw HTML');
    assert.match(html, /1 hour/);
  });

  it('falls back to a generic greeting when no name is given', () => {
    const { text } = passwordResetEmail('', 'https://x/y');
    assert.match(text, /Hi there/);
  });
});
