# LifeOS — Architecture Audit (Phase 0)

Audit date: 2026-09-15. Performed against the repository on disk before the "Personal Operating System" upgrade. Everything below was verified by reading the code, not inferred from screenshots.

## 1. Current architecture

| Layer | Implementation |
|---|---|
| Frontend | React 19 + Vite 6, React Router 7, TanStack Query 5, Recharts 3, Tiptap 2 (notes), lucide-react, date-fns. Plain CSS with design tokens (no Tailwind). |
| Backend | Node 22 ESM, Express 5, Mongoose 8, zod validation, helmet, cors, express-rate-limit, morgan, sanitize-html. |
| Database | MongoDB (local or Atlas via `MONGODB_URI`). No migration tool — Mongoose schemas with defaults; additive schema changes are backward compatible. |
| Auth | bcrypt (12 rounds); short-lived JWT access token (15 min, memory-only on client); rotating refresh token (random, SHA-256 hashed in `Session`, `httpOnly`/`SameSite=Strict` cookie scoped to `/api/auth`, 30 s rotation grace, replay ⇒ revoke all sessions). |
| Authorization | `requireAuth` middleware sets `req.user.id`; every query includes `user: req.user.id` (`findOwned` helper). No roles. |
| Routing | Single `routes/index.js`; `/api/auth/*` public + protected; everything else behind `requireAuth`. Client routes are lazy-loaded pages under `AppShell`. |
| State | Server state in React Query; UI state local; auth/theme/toast/confirm/editor in React contexts. |
| Design system | `styles/tokens.css` (light/dark + 7 accents), `base.css`, `components.css` (btn, input, card, badge, modal, menu, toast, tabs…), `layout.css`, `features.css`. UI kit in `components/ui/*`. |
| File storage | **None.** |
| AI | **None.** |
| Notifications | **None** (only in-app toasts). |
| Analytics | `GET /api/analytics` computes productivity/habit/goal/finance/health series + rule-based insights. |
| Search | `GET /api/search` regex search across tasks, notes, goals, habits, events, reminders, transactions; `Ctrl+K` palette + `/search` page. |
| Tests | `node --test` + supertest: 33 tests (auth, tasks, goals, habits, events, notes, finance, health, routines, reminders, dashboard, analytics, search, unit utils). Browser E2E script lives outside the repo (scratchpad). |
| Deployment | `npm run build` → `client/dist`; production API serves the SPA. Env validated by zod in `config/env.js`. |
| Env vars | `NODE_ENV, PORT, MONGODB_URI, JWT_ACCESS_SECRET, JWT_ACCESS_TTL, REFRESH_TOKEN_DAYS, CLIENT_ORIGIN, TRUST_PROXY`. |

## 2. Current modules

Dashboard (customizable widgets), Analytics, Tasks, Calendar, Goals (+ detail), Reminders, Habits, Routines, Health, Notes, Finance, Search, Settings. Sidebar sections: Overview / Plan / Grow / Manage.

## 3. Current database entities

| Model | Key fields | Notes |
|---|---|---|
| User | name, email, passwordHash, preferences{theme, accent, currency, weekStartsOn, waterGoalMl, sleepGoalHours, dashboardWidgets[]} | |
| Session | user, tokenHash, expiresAt, revokedAt (TTL index) | |
| Task | title, notes, status, priority, dueDate, dueTime, tags, subtasks[], recurrence, goal→Goal, milestone(id), completedOn/At, spawnedNext | |
| Goal | title, description, category, status, color, startDate, deadline, milestones[{title, dueDate, done}] | Milestones embedded. |
| Habit / HabitLog | frequency daily/weekly, days[], timesPerWeek, archived, order / (habit, date) unique | |
| Event | start, end, allDay, color, recurrence{freq, interval, until} | Occurrences expanded client-side. |
| Folder / Note | name,color / title, content (sanitized HTML), plainText, folder, tags, pinned | |
| Transaction / Budget | type, amount, category, description, date / category, limit | |
| HealthLog / Workout | (user,date) unique; water, sleep, quality, mood, energy, weight, steps, notes / type, duration, intensity, calories, distance | |
| Routine / RoutineLog | type, timeOfDay, days[], steps[{title, durationMin}], active / (routine,date) completedSteps[] | |
| Reminder | date, time, category, recurrence, leadDays, important, completed | |

## 4. Current API endpoints (all under `/api`)

Auth: `POST auth/register|login|refresh|logout|change-password`, `GET/PATCH/DELETE auth/me`.
Tasks: `GET/POST tasks`, `GET/PATCH/DELETE tasks/:id`, `POST tasks/:id/toggle`.
Habits: `GET/POST habits`, `PUT habits/order`, `GET/PATCH/DELETE habits/:id`, `POST habits/:id/toggle`.
Goals: CRUD + `POST/PATCH/DELETE goals/:id/milestones[/:milestoneId]`.
Events: CRUD (`GET events?from&to`). Notes: CRUD + `notes/tags`, `notes/folders` CRUD.
Finance: `finance/summary`, `finance/transactions` CRUD, `finance/budgets` CRUD.
Health: `health/summary`, `health/logs[/:date]`, `POST health/logs/:date/water`, `health/workouts` CRUD.
Routines: CRUD + `steps/:stepId/toggle`, `complete`, `reset`. Reminders: CRUD + `complete`.
Aggregates: `GET dashboard`, `GET analytics`, `GET search`, `GET health` (liveness).

## 5. UI / component structure

- `components/ui` — Button/IconButton, Field/Input/Select/Textarea/Checkbox/Switch/ColorPicker/WeekdayPicker/ChoiceGroup/TagInput, Card/PageHeader/Badge/ProgressBar/ProgressRing/StatTile/Segmented/Tabs/SectionLabel, Spinner/Skeleton/EmptyState/ErrorState/QueryState, Modal (focus trap), Menu (keyboard).
- `components/FormModal`, `ChartCard` (chart + table toggle), `RankList`, `charts.jsx` (theme-aware Recharts helpers).
- `context/EditorContext` — single owner of every create/edit dialog (`openEditor(type, {item, defaults})`), usable from any screen and the command palette.
- `features/*` — per-module form modals and row components reused across pages (e.g. `TaskRow` on dashboard, tasks, goal detail, calendar).

## 6. Existing relationships

- Task → Goal (+ milestone id); Goal progress = milestones + linked tasks.
- Routine ↔ RoutineLog; Habit ↔ HabitLog; Journal-like fields (mood/energy) already live on HealthLog.
- Recurring reminders/tasks roll forward. Nothing else is linked: notes, events, documents, finance, health, focus have no cross-references.

## 7. Reusable components (confirmed)

Every UI primitive above, `FormModal`, `QueryState`, `EmptyState`, `Menu`, `ChartCard`, `RankList`, `TaskRow`, `QuickAddTask`, `useFormState`, `useHotkey`, `useDebounce`, chart theme hook, `buildSearchGroups`.

## 8. Technical debt

- `routes/index.js` is a single 150-line file; fine now, will grow — split per module when adding modules.
- Several pages carry small `<style>` blocks; acceptable but should move to CSS files as pages grow.
- No activity/audit trail, so nothing can power "what happened this week" beyond per-model timestamps.
- Milestone linkage from Task uses a bare ObjectId (`milestone`), validated manually.
- Tests assume a local MongoDB; no CI config.
- No pagination on list endpoints (limits of 500–1000 rows instead).

## 9. Risks

- Atlas latency (~4 s connect on this network) makes first load slow; the API is otherwise fast.
- Regex search does not scale beyond tens of thousands of documents per user; acceptable for a personal app, but a text index / semantic search seam should exist.
- Adding file uploads introduces a new attack surface (path traversal, MIME spoofing, size) — must be handled server-side.
- AI must never bypass per-user scoping or user permissions.

## 10. Missing functionality (vs. product vision)

Projects, Documents (vault), Journal, Focus, Activity log, Notifications, cross-module links, Quick Capture, AI (provider, context, permissions, actions, conversations, daily brief, weekly review), finance accounts/subscriptions/savings goals/net worth, notes archive, routine step ↔ habit links, settings for notifications/AI/sessions/data export.

## 11. Recommended architecture (adopted)

Keep the stack. Add, without replacing:

1. **Domain models** (additive): Project, ActivityLog, Notification, Link (generic relationship edge), Document, JournalEntry, FocusSession, Account, RecurringTransaction, Subscription, SavingsGoal, AIConversation/AIMessage/AIInsight. Extend Task (`project`), Routine steps (`habit`, `task`), Note (`archived`), User preferences (notifications, ai, timezone, language).
2. **Relationship layer**: a single `Link` collection `{user, from:{type,id}, to:{type,id}}` for optional many-to-many context, plus explicit refs for the common hierarchy (Goal → Project → Task). No graph DB.
3. **Activity log** written by controllers through one `logActivity()` service; drives weekly review and AI context.
4. **Notifications** generated by an idempotent `syncNotifications()` on read (no scheduler needed) from reminders, document expiry, overdue tasks, budget overruns, AI insights; filtered by `preferences.notifications`.
5. **Storage provider** interface (local disk implementation) + short-lived HMAC-signed URLs for document preview/download; **extraction provider** interface (null implementation; no fake OCR).
6. **AI provider** interface (`generate`, `stream`, `structured`) with an Anthropic implementation and a null provider; context retrieval per module filtered by AI permissions; structured action proposals confirmed by the user before execution; everything logged.
7. Client: new pages reuse the UI kit and `EditorContext`; global Quick Capture; notifications popover; AI page + contextual "Ask AI" entry points.
