import nodemailer from 'nodemailer';

/**
 * Plain SMTP — works with literally any provider that speaks SMTP: a Gmail
 * app password, Brevo/Resend/Postmark/Mailgun/SES SMTP relays, or a
 * self-hosted mail server. No vendor SDK, no lock-in.
 */
export class SmtpProvider {
  name = 'smtp';
  available = true;

  constructor({ host, port = 587, secure = false, user, pass, from, transport }) {
    this.from = from;
    this.transport = transport ?? nodemailer.createTransport({
      host,
      port,
      secure, // true for 465 (implicit TLS); false for 587/25 (STARTTLS, upgraded automatically)
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send({ to, subject, html, text }) {
    await this.transport.sendMail({ from: this.from, to, subject, html, text });
  }
}
