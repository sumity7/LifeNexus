import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/lifeos'),
  JWT_ACCESS_SECRET: z
    .string({ required_error: 'JWT_ACCESS_SECRET is required (see server/.env.example)' })
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().max(90).default(7),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Documents
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./uploads'),
  // S3 (or any S3-compatible provider: Cloudflare R2, MinIO, DigitalOcean Spaces, Backblaze B2).
  // Required only when STORAGE_PROVIDER=s3 — see the warning below if it's missing.
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Only needed for non-AWS providers (R2/MinIO/Spaces/B2) — their S3-compatible endpoint URL.
  S3_ENDPOINT: z.string().optional(),
  // Needed for most non-AWS providers (path-style URLs instead of virtual-hosted-style).
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  EXTRACTION_PROVIDER: z.string().default(''),

  // Email (optional — LifeOS works fully without it; only password-reset delivery needs it).
  // "smtp" works with any SMTP-speaking provider: Gmail app password, Brevo, Resend, Postmark,
  // Mailgun, SES SMTP, or a self-hosted mail server.
  EMAIL_PROVIDER: z.enum(['smtp', 'none']).default('none'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // true for port 465 (implicit TLS); false for 587/25 (STARTTLS, upgraded automatically).
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // "LifeOS <noreply@yourdomain.com>" — required for EMAIL_PROVIDER=smtp.
  EMAIL_FROM: z.string().optional(),

  // AI (optional — LifeOS works without it, AI features show as "not configured")
  AI_PROVIDER: z.enum(['anthropic', 'gemini', 'none']).default('none'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  // Left empty to use each provider's own default model (see providers/index.js).
  AI_MODEL: z.string().optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).max(64000).default(16000),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600000).default(90000),
  AI_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(1000).default(20),
  // "default" enables Anthropic server-side refusal fallbacks; disabled automatically if unsupported.
  AI_REFUSAL_FALLBACK: z.enum(['default', 'off']).default('default'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Only report which variables are wrong — never echo their values.
  console.error('✖ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const AI_KEY_ENV = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };
const configuredAIKey = AI_KEY_ENV[parsed.data.AI_PROVIDER] ? parsed.data[AI_KEY_ENV[parsed.data.AI_PROVIDER]] : null;

// A missing AI key must not take the whole app down: AI reports "not configured" instead.
if (AI_KEY_ENV[parsed.data.AI_PROVIDER] && !configuredAIKey?.trim() && parsed.data.NODE_ENV !== 'test') {
  console.warn(`⚠ AI_PROVIDER=${parsed.data.AI_PROVIDER} but ${AI_KEY_ENV[parsed.data.AI_PROVIDER]} is empty — AI features are disabled until a key is set.`);
}
if (parsed.data.STORAGE_PROVIDER === 's3' && !parsed.data.S3_BUCKET?.trim() && parsed.data.NODE_ENV !== 'test') {
  console.warn('⚠ STORAGE_PROVIDER=s3 but S3_BUCKET is empty — document uploads will fail until it is set.');
}
if (parsed.data.NODE_ENV === 'production' && parsed.data.STORAGE_PROVIDER === 'local') {
  console.warn('⚠ STORAGE_PROVIDER=local in production — uploaded documents are lost on redeploy/restart on platforms with ephemeral disks. Use STORAGE_PROVIDER=s3 unless this server has a persistent volume mounted at STORAGE_DIR.');
}
const emailConfigured = parsed.data.EMAIL_PROVIDER === 'smtp' && !!parsed.data.SMTP_HOST?.trim() && !!parsed.data.EMAIL_FROM?.trim();
if (parsed.data.EMAIL_PROVIDER === 'smtp' && !emailConfigured && parsed.data.NODE_ENV !== 'test') {
  console.warn('⚠ EMAIL_PROVIDER=smtp but SMTP_HOST/EMAIL_FROM are incomplete — password-reset emails will not be delivered until this is set.');
}
if (parsed.data.NODE_ENV === 'production' && parsed.data.EMAIL_PROVIDER === 'none') {
  console.warn('⚠ EMAIL_PROVIDER=none in production — users who forget their password have no self-service way to recover their account.');
}

export const env = Object.freeze({
  ...parsed.data,
  aiEnabled: !!AI_KEY_ENV[parsed.data.AI_PROVIDER] && !!configuredAIKey?.trim(),
  emailEnabled: emailConfigured,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  clientOrigins: parsed.data.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
});
