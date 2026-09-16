# LifeOS — Feature Matrix

Status at audit time (Phase 0) with the required change. See the "Result" column for the state after implementation.

| FEATURE | STATUS (audit) | EXISTING IMPLEMENTATION | REQUIRED CHANGE | PRIORITY | RESULT |
|---|---|---|---|---|---|
| Auth (register/login/refresh/logout) | COMPLETE | JWT + rotating refresh cookie, bcrypt | Add session listing/revocation | P1 | Done (`GET/DELETE auth/sessions`) |
| Tasks CRUD, recurrence, subtasks, filters | COMPLETE | `controllers/tasks.js`, TasksPage | Add `project` ref, activity logging | P1 | Done |
| Projects | MISSING | Goals+milestones only | New Project entity: Goal → Project → Task | P1 | Done |
| Goals + milestones | COMPLETE | `Goal` with embedded milestones, progress service | Include project/focus in progress context | P2 | Done (detail shows projects, focus time) |
| Calendar (month/week/day, recurring) | COMPLETE | `Event`, client expansion | Links to tasks/notes/documents via Link | P2 | Done |
| Reminders (recurring, categories) | COMPLETE | `Reminder` | Link to documents (expiry) | P1 | Done (`source` ref) |
| Habits (streaks, heatmap) | COMPLETE | `Habit`, `HabitLog`, stats service | Routine step ↔ habit link | P2 | Done |
| Routines (steps, daily log) | COMPLETE | `Routine`, `RoutineLog` | Step → habit/task links, skip | P2 | Done (habit link; skip = leave unchecked; pause exists) |
| Health (water/sleep/mood/energy/weight/steps/workouts) | COMPLETE | `HealthLog`, `Workout` | Weight trend, health goals | P2 | Done (weight chart + target weight pref) |
| Notes (rich text, folders, tags, pin, search) | COMPLETE | Tiptap + sanitize-html | Archive, links, AI actions | P2 | Done |
| Journal | MISSING | Mood/energy live on HealthLog | New `JournalEntry`; reuse HealthLog mood/energy | P1 | Done |
| Documents (vault) | MISSING | — | New `Document` + storage provider + signed URLs + expiry | P1 | Done (local storage provider) |
| Document OCR / extraction | MISSING | — | Provider interface, null implementation | P2 | Done (interface only, documented) |
| Finance transactions + budgets | COMPLETE | `Transaction`, `Budget`, summary service | — | — | Kept |
| Finance accounts / net worth | MISSING | — | `Account` model, net worth summary | P2 | Done |
| Recurring transactions | MISSING | — | `RecurringTransaction`, posted on demand | P2 | Done |
| Subscriptions | MISSING | — | `Subscription` (name, amount, frequency, next payment) | P2 | Done |
| Savings goals | MISSING | — | `SavingsGoal` (target, current, monthly) | P2 | Done |
| Focus sessions (Pomodoro) | MISSING | — | `FocusSession` + page + analytics | P1 | Done |
| Activity log | MISSING | — | `ActivityLog` + `logActivity()` in controllers | P1 | Done |
| Notifications | MISSING | Toasts only | `Notification` model, sync rules, preferences, popover | P1 | Done |
| Cross-module links | MISSING | Task→Goal only | `Link` model + `/links` API + Connections panel | P1 | Done |
| Universal search | PARTIAL | 7 entity types, no filters | Add journal, documents, focus, routines; type filter; recent searches | P1 | Done |
| Quick Capture | PARTIAL | Quick-add task only | Global capture modal, deterministic parsing, NL-ready | P1 | Done |
| AI provider abstraction | MISSING | — | `services/ai/providers` (Anthropic + null) | P1 | Done |
| AI context retrieval + permissions | MISSING | — | Per-module retrievers filtered by `preferences.ai` | P1 | Done |
| AI conversations | MISSING | — | `AIConversation`, `AIMessage`, page | P1 | Done |
| AI actions with confirmation | MISSING | — | Structured proposals → confirm → execute → activity | P1 | Done |
| AI daily brief | MISSING | Dashboard greeting | Deterministic brief + optional AI narrative | P1 | Done |
| Weekly review | MISSING | Analytics page | `/review` page + AI narrative | P1 | Done |
| Module AI actions | MISSING | — | Contextual prompts per module | P2 | Done (prompt presets + note actions) |
| Life graph / context engine | MISSING | — | Link traversal used by AI context | P2 | Done (`services/graph.js`) |
| Settings: notifications / AI / sessions / data export | PARTIAL | Profile, appearance, prefs, password, delete | Add sections | P1 | Done |
| Security audit | PARTIAL | Strong baseline | Document access, upload validation, AI scoping | P0 | Done (see LIFEOS_SECURITY.md) |
| Tests | PARTIAL | 33 API tests | Cover new modules + AI + documents | P1 | Done |
| Documentation | PARTIAL | README | `/docs/*` | P2 | Done |
