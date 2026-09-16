# LifeOS — Security

## Authentication & sessions
- bcrypt (12 rounds); generic login errors with timing equalisation.
- Access JWT (HS256, 15 min, issuer-checked) in memory only; `requireAuth` also verifies the user still exists.
- Refresh tokens: 48 random bytes, SHA-256 hashed at rest, `httpOnly` + `SameSite=Strict` + `Secure` in production, path `/api/auth`, rotated on use with a 30 s grace window; replay of an old token revokes all sessions.
- Sessions list/revoke (single and "others"); password change revokes all sessions.
- Password reset: single-use, SHA-256-hashed, 1-hour-expiry token (`PasswordReset`, TTL-indexed). `POST /auth/forgot-password` returns the identical response whether or not the account exists and whether or not sending actually succeeds — this is deliberate; a different response is exactly how attackers enumerate accounts. `POST /auth/reset-password` revokes every session and invalidates any other outstanding reset tokens for that user. Rate-limited separately from the other auth endpoints (5/15 min, not `skipSuccessfulRequests`) because it always returns 200 — if it shared the auth limiter's success-skipping, it would never actually throttle.
- Rate limits: auth 20/15 min, forgot-password 5/15 min, API 600/min, AI 20/min per user, uploads 30/min per user.

## Authorization
- Every model has a `user` field; every read/write filters by `req.user.id` (`findOwned`, scoped aggregates).
- Cross-references (task→goal/project, focus→task/goal/project, transaction→account/savings, routine step→habit, links, AI action ids) are verified to belong to the same user before saving.
- Links: both endpoints ownership-checked; self-links rejected.
- Tests cover cross-user access returning 404/400 for tasks, goals, projects, links, documents, notifications, AI actions.

## Input validation & injection
- zod schemas for params/query/body on every route; unknown fields stripped (no mass assignment of `user`).
- User text used in regex is escaped; query values are typed, so no operator injection.
- Notes HTML sanitized server-side (sanitize-html allow-list, safe link schemes); AI markdown rendered as React nodes (no HTML injection); AI note rewrites previewed with a sanitizer and re-sanitized on save.
- JSON body limit 1 MB; malformed JSON → 400.

## Documents
- Upload: MIME allow-list, 25 MB limit, single file, magic-byte check for PDF/images (spoofed types → 415), filename stripped of path separators/control chars.
- Storage keys generated server-side (`<userId>/<48 hex>.bin`), validated by regex and root-prefix check before any filesystem access; never returned to clients.
- File access: `GET /documents/:id/file` requires the bearer token **and** a 5-minute HMAC token bound to user + document; other users get 403/404.
- Responses: `Cache-Control: private, no-store`, `nosniff`, sandboxed CSP; only PDF/images/plain text served inline, everything else as attachment.
- Deleting a document removes the file, its expiry reminder and its links; deleting an account removes the user's storage directory.

## AI
- API keys only in server env; provider errors surfaced as 502 without leaking request contents.
- Context retrieval honours per-module permissions, including recent activity.
- Actions validated, user-scoped, confirmed explicitly, single-use, logged.
- Two interchangeable providers (Anthropic, Gemini) behind one interface — see `docs/LIFEOS_AI_ARCHITECTURE.md`.

## Storage & email (both optional, both fail safe)
- Documents: `STORAGE_PROVIDER=local` (disk) or `s3` (AWS S3 or any S3-compatible provider — R2, MinIO, Spaces, B2), same interface, selected by env only. `local` is unsuitable for hosts with ephemeral disks — the server warns at startup in production if so configured.
- Password-reset email: `EMAIL_PROVIDER=none` (default) or `smtp` (works with any SMTP-speaking provider). With `none`, forgot-password requests still succeed identically — they just don't deliver anything — so unconfigured email can never become an account-enumeration or error-leak vector.

## Transport & headers
- Helmet (CSP with `blob:` allowed only for img/frame previews, `object-src 'none'`), CORS allow-list, `trust proxy` configurable, `x-powered-by` disabled.
- Errors return `{ error: { message, code?, details? } }`; 5xx messages are generic; stack traces logged server-side only.

## Secrets
- `.env` git-ignored; `.env.example` documents every variable; env validated at startup (process exits listing only variable names).
- **Action item for the owner:** `server/.env` currently contains a MongoDB Atlas connection string with credentials. Rotate that password if the file was ever shared, and keep it out of version control.

## Known limitations
- No MFA/passkeys yet (sessions architecture supports adding a second factor at login).
- CSRF: refresh/logout rely on `SameSite=Strict` cookies; all other endpoints require a bearer token.
- Local disk storage is not encrypted at rest; use an encrypted volume or an S3 provider with SSE in production.
