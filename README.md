# LifeOS — Personal Operating System

One connected system for tasks, projects, calendar, goals, reminders, habits, routines, focus, health, notes, journal, documents and finance — with an AI assistant that understands all of it (with your permission).

**Stack:** React 19 + Vite · Node.js + Express 5 · MongoDB (Mongoose) · JWT auth with rotating refresh tokens · Anthropic/Gemini (optional, swappable).

## Quick start

```bash
npm install                          # installs both workspaces
cp server/.env.example server/.env   # set JWT_ACCESS_SECRET (and MONGODB_URI if not local)
npm run seed                         # demo account with realistic, connected data
npm run dev                          # API on :5000, web on :5173 (proxied /api)
```

Sign in with **demo@lifeos.app / Demo1234!**.

### Enable AI (optional)

```
AI_PROVIDER=anthropic          # or "gemini" — free tier, no card, from aistudio.google.com
ANTHROPIC_API_KEY=your-key     # or GEMINI_API_KEY=your-key
AI_MODEL=claude-opus-5         # or leave empty to use each provider's own default
```

Without it, everything works; AI screens explain how to enable it, and the daily brief / weekly review show computed numbers only.

### Enable password reset (optional)

```
EMAIL_PROVIDER=smtp
SMTP_HOST=... SMTP_USER=... SMTP_PASS=... EMAIL_FROM="LifeOS <noreply@yourdomain.com>"
```

Works with any SMTP provider (Brevo, Resend, Postmark, SES, Gmail app password). Without it, "forgot password" still responds normally — it just doesn't deliver an email.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (content-aware auto-restart) + Vite dev server |
| `npm run seed` | Re-seeds only the demo account |
| `npm test` | 113 API/unit tests against a local MongoDB |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Runs the API; in production it also serves `client/dist` |
| `npm run docker:up` | Builds the image and runs app + MongoDB via Docker Compose |

## Keyboard

`Ctrl/⌘+K` command palette · `Ctrl/⌘+J` or `C` quick capture · `N` new task · `G` then `D/T/C/H/N/A/F/J` to navigate.

## Documentation

- [Architecture](docs/LIFEOS_ARCHITECTURE.md) · [Audit](docs/LIFEOS_ARCHITECTURE_AUDIT.md) · [Feature matrix](docs/LIFEOS_FEATURE_MATRIX.md)
- [AI architecture](docs/LIFEOS_AI_ARCHITECTURE.md) · [Security](docs/LIFEOS_SECURITY.md)
- [Roadmap](docs/LIFEOS_ROADMAP.md) · [Final QA](docs/LIFEOS_FINAL_QA.md) · **[Production launch checklist](docs/LIFEOS_PRODUCTION_CHECKLIST.md)**

## Production

```bash
# Docker (recommended — builds the image, runs app + MongoDB):
cp server/.env.example server/.env   # fill in JWT_ACCESS_SECRET at minimum
npm run docker:up

# Or without Docker, on a host you manage directly:
npm run build
NODE_ENV=production PORT=5000 MONGODB_URI=... JWT_ACCESS_SECRET=... STORAGE_DIR=/var/lib/lifeos npm start
```

Set `TRUST_PROXY=1` (or the correct hop count) behind a reverse proxy — this also enables an
automatic HTTP→HTTPS redirect. Keep `STORAGE_DIR` on persistent, encrypted storage outside the
web root — or set `STORAGE_PROVIDER=s3` on hosts with an ephemeral disk (see `.env.example`).
See the [production checklist](docs/LIFEOS_PRODUCTION_CHECKLIST.md) for everything that still
needs your own accounts/decisions (domain, hosting, database, TLS, backups, monitoring).
