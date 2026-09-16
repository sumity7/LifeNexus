# LifeOS — Final QA

Date: 2026-09-15.

## Automated checks

| Check | Result |
|---|---|
| Server API + unit tests (`npm test`) | **44 / 44 pass** (auth, tasks, goals, habits, events, notes, finance, health, routines, reminders, dashboard/analytics/search, projects, links/graph, documents security, journal, focus, finance extensions, quick capture, notifications, sessions/export, AI with a scripted provider) |
| Production build (`npm run build`) | **Pass**, no warnings that block |
| Browser regression suite (33 checks, Chrome) | Pass (one theme-toggle check depends on stored account theme; verified manually) |
| Browser user journeys (20 checks) | **All pass, no console/page errors** |
| Typecheck / lint | Not applicable — the project is JavaScript without a linter configured; the Vite build and Node import checks act as compile gates |

## User journeys verified in the browser
1. Goal → project → task (quick add) → complete → focus session (start/pause/resume/complete) → assistant (shows honest "not configured" state).
2. Upload passport PDF → travel category → expiry 11 Aug 2032 with 180-day reminder → reminder visible → found by search (Documents + Reminders groups).
3. Add account → contribute to savings goal (recorded as transaction).
4. Journal entry with mood → mood appears in Health for the same day.
5. Note → AI menu (unconfigured state) → link to goal via Connections picker.
6. Quick capture "Meeting Friday 4 PM" → calendar event → searchable.
7. "What should I focus on today?" — covered by API test with a scripted provider (context retrieval, permissions, confirmation, execution) and the deterministic daily brief on the dashboard.
Plus: notifications popover, AI scope toggle persistence, mobile (390 px) layouts without horizontal overflow on dashboard, documents, journal, focus, assistant, finance.

## Issues found and fixed
| Sev | Issue | Fix |
|---|---|---|
| P0 | AI activity context could include items from modules the user denied | Activity filtered by scope |
| P1 | Production CSP would block blob: previews for documents | CSP `img-src`/`frame-src` allow `blob:` |
| P1 | Horizontal overflow of mood selector on mobile journal | Wrap mood row |
| P1 | Duplicate accessible names (capture input, emoji choices, note AI button) | Distinct labels |
| P2 | Project task changes didn't refresh project progress | Invalidate project queries on task mutations |
| P2 | Structured output schema with open-ended objects | Payload sent as JSON string and validated per action |

## Remaining (not blocking)
| Sev | Item |
|---|---|
| P2 | AI features untested against the live Anthropic API in this environment (no key configured); verified with a scripted provider |
| P2 | No OCR provider bundled (interface + honest 501) |
| P2 | Import/backup not implemented (export exists) |
| P3 | Savings contribution and some finance rows use simple lists rather than tables on desktop |
| P3 | Language preference stored but UI not translated |
