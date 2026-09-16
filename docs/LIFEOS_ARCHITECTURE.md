# LifeOS — Architecture

LifeOS is a single connected system: every module stores data in MongoDB, scoped to a user, and connects through explicit references, a generic link layer, an activity log, and an AI context engine.

```
React SPA (Vite)
  └─ React Query hooks ── fetch client (bearer token, silent refresh)
        │
Express 5 API  ── requireAuth ── zod validate ── controllers ── services ── Mongoose ── MongoDB
                                                    │
                     activity log · notifications · links/graph · storage provider · AI layer
```

## Domain model

| Area | Collections | Key relationships |
|---|---|---|
| Plan | Task, Project, Goal (embedded milestones), Event, Reminder | Goal → Project → Task; Task → Goal/milestone; Reminder.source → Document |
| Grow | Habit, HabitLog, Routine (steps), RoutineLog, FocusSession, HealthLog, Workout | Routine step → Habit (check-off mirrors); Focus → Task/Project/Goal |
| Knowledge | Note, Folder, JournalEntry, Document | Journal reads mood/energy from the day's HealthLog (single record) |
| Finance | Transaction, Budget, Account, RecurringTransaction, Subscription, SavingsGoal | Transaction → Account (balance sync), → SavingsGoal; SavingsGoal → Goal |
| Platform | User, Session, ActivityLog, Notification, Link | Link = undirected edge between any two entities of one user |
| AI | AIConversation, AIMessage (with proposed actions), AIInsight (cached brief/review) | Message actions → created entity id |

All day-based data uses `YYYY-MM-DD` keys in the user's local calendar; the client sends its "today".

## Cross-cutting services (`server/src/services`)

- `activity.js` — `logActivity()` called by controllers for meaningful actions (never throws).
- `links.js` — create/list/delete links, entity registry (label + route per type), cleanup on delete.
- `graph.js` — Life Graph neighbourhood: structural relations (goal→projects→tasks, focus, savings, document reminders) merged with user links.
- `notifications.js` — idempotent `syncNotifications()` derives notifications (overdue tasks, reminders, expiring documents, goal deadlines, subscriptions, budgets) on read; respects `preferences.notifications`.
- `storage/` — storage provider interface; local disk implementation with server-generated keys.
- `extraction.js` — OCR/text extraction provider interface; null provider by default, plain-text passthrough.
- `capture.js` — deterministic Quick Capture parser (dates, times, amounts, type).
- `brief.js`, `review.js` — deterministic daily brief and weekly review metrics.
- `ai/` — provider abstraction, context retrieval, actions, prompts, chat orchestration (see LIFEOS_AI_ARCHITECTURE.md).

## API surface (additions in this upgrade)

`/projects`, `/links`, `/graph`, `/activity`, `/notifications`, `/documents` (+ `/file` signed, `/extract`), `/journal` (+ `/calendar`), `/focus` (active, sessions, pause/resume/complete/abandon, log, summary), `/finance/accounts|recurring|subscriptions|savings`, `/capture/parse`, `/ai/status|brief|review|chat|actions|proposals/execute|conversations`, `/notes/:id/ai`, `/auth/sessions`, `/auth/export`. Search accepts `types`, `from`, `to`, `tag`.

## Client structure additions

- Pages: Assistant (`/ai`), Weekly review, Projects (+ detail), Focus, Journal, Documents.
- Global: Quick Capture (`Ctrl+J` / `C`), notifications popover, focus pill in the top bar, extended command palette (actions + recent searches).
- Shared components: `ConnectionsPanel` (links + graph + picker), `Markdown` (safe renderer), `ActionProposals` (confirm/dismiss), `NoteAIMenu`.
- Dashboard widgets: Daily brief, Document alerts, Focus time (customizable like the rest).

## Extension points

| Future feature | Hook |
|---|---|
| S3/GCS storage | implement `save/read/remove/removeAll`, register in `storage/index.js` |
| OCR / extraction | implement `isAvailable/extract`, set `EXTRACTION_PROVIDER` |
| Other AI providers / local models | implement `generate/stream/structured` in `ai/providers` |
| Semantic search | add an embeddings searcher next to `SEARCHERS` in `controllers/search.js` |
| Email / push notifications | consume `Notification` documents (keys are idempotent) |
| Google Calendar / Drive, wearables | map external items into existing models + `Link` |
| Travel, People, Lists | new model + entry in `ENTITY_REGISTRY`, search, AI retriever |
| Scheduled jobs | `syncNotifications`, `postDueRecurring` are idempotent and can run on a cron |
