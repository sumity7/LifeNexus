# LifeOS — Production Launch Checklist

Everything below the line is code-level and already done. Everything above it needs
a decision or an account only you can make/create — nobody can do these for you.

## Things only you can decide or set up

- [ ] **Domain name + DNS** — point it at wherever you deploy.
- [ ] **Hosting for the app container** — a VPS (persistent disk, run `docker compose up -d`
      directly) or a platform (Render/Railway/Fly/etc. — ephemeral disk, see storage below).
- [ ] **MongoDB** — a production Atlas cluster (or self-hosted), on its own, **not** the one
      used for local development. Whitelist the host's IP (or `0.0.0.0/0` behind a strong
      password if the host's IP isn't static) in Atlas → Network Access.
- [ ] **TLS/SSL certificate** — automatic on most platforms and behind Nginx/Caddy with
      Let's Encrypt on a VPS. Set `TRUST_PROXY=1` (or the correct hop count) once it's in
      place — the app then issues secure cookies and redirects HTTP → HTTPS automatically
      (see `app.js`).
- [ ] **File storage** — if the host has an ephemeral disk (most free/hobby tiers), set
      `STORAGE_PROVIDER=s3` and create a bucket (AWS S3, Cloudflare R2, Backblaze B2, DO
      Spaces — any works, see `server/.env.example`). If the host has a real persistent
      volume, `STORAGE_PROVIDER=local` mounted there is fine.
- [ ] **Email for password reset** — an SMTP account from any provider (Brevo, Resend,
      Postmark, SES, even Gmail with an app password for low volume) and set
      `EMAIL_PROVIDER=smtp` + the `SMTP_*` vars. Without this, "forgot password" requests
      still succeed (never break the UI) but no email is actually sent — meaning nobody who
      forgets their password can get back in on their own.
- [ ] **AI provider key** — `ANTHROPIC_API_KEY` (paid) or `GEMINI_API_KEY` (free tier
      available) if you want the assistant live. The app works fully without one.
- [ ] **Secrets, for real this time** — generate a fresh `JWT_ACCESS_SECRET`
      (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) for
      production; never reuse the one from local `.env`. Set every secret through your
      host's environment-variable UI, never commit a real `.env`.
- [ ] **Backups** — Atlas has automatic backups on paid tiers; a self-hosted Mongo needs
      `mongodump` on a cron (or equivalent). Nothing in this app backs up the database for
      you.
- [ ] **Error tracking / uptime monitoring** (optional but recommended) — e.g. Sentry for
      exceptions, a pinger (UptimeRobot, Better Stack) hitting `GET /api/health`.
- [ ] **Legal pages** — privacy policy / terms of service, if this becomes a real
      multi-user product. Not something code can generate for you.

## What's already done (code-level)

- `Dockerfile` (multi-stage: builds the client, runs a single container serving both
  the API and the built SPA) + `docker-compose.yml` (app + Mongo, for a self-contained
  local "production-like" run — `npm run docker:up`).
- `.github/workflows/ci.yml` — runs the full test suite and the client build on every
  push/PR against a real MongoDB service container, plus a grep for secret-shaped
  strings in the built client bundle.
- gzip/brotli response compression; HTTPS redirect (only when `TRUST_PROXY` is set,
  so it can never cause a redirect loop on a setup without a proxy); Helmet security
  headers including HSTS; CORS allow-list; per-route rate limits.
- Swappable, fail-safe provider abstractions for AI (`services/ai/providers`),
  document storage (`services/storage`) and email (`services/email`) — each has a
  "not configured" state that degrades the relevant feature only, never crashes the
  app, and is env-var-selected with no code change needed to switch.
- Password reset (forgot-password → emailed single-use 1-hour token → reset), built
  to never leak account existence and to survive an unconfigured email provider.
- 113 automated tests (`npm test`), env validated at startup, `server/.env.example`
  documents every variable.

## Commands

```bash
# Local, self-contained "production-like" run (builds the image, starts Mongo + app):
cp server/.env.example server/.env   # fill in JWT_ACCESS_SECRET at minimum
npm run docker:up

# Build + run without Docker, on a host you manage directly:
npm run build
NODE_ENV=production PORT=5000 MONGODB_URI=... JWT_ACCESS_SECRET=... npm start
```
