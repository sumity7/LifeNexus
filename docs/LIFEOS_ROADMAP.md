# LifeOS — Roadmap

## Shipped in this upgrade
Projects, Documents vault (expiry reminders, signed previews), Journal, Focus, Activity log, Notifications, cross-module Links + Life Graph, universal search with filters, Quick Capture, AI assistant (provider abstraction, permissions, confirmed actions, conversations), Daily brief, Weekly review, note AI actions, finance accounts/net worth/recurring/subscriptions/savings goals, weight trend, routine-step ↔ habit links, settings for notifications/AI/sessions/export.

## Next (P2)
- Import from the JSON export; scheduled backups.
- MFA (TOTP) and passkeys.
- OCR provider (e.g. cloud document AI) wired to the extraction interface; document summaries.
- Semantic search (embeddings) behind the existing search API.
- AI streaming responses in the assistant UI (provider already supports `stream`).
- Nutrition and body measurements in Health; personal health goals beyond weight.
- Routine "skip step" recorded explicitly (model field `skippedSteps` exists).
- Pagination for very large transaction and activity lists.
- Localization of UI strings (language preference already stored).

## Later
Travel, People, Lists, email and push notifications, Google Calendar/Drive sync, wearables, voice capture, offline/PWA, local AI models, automation rules ("when X then Y").
