# LifeOS — AI Architecture

The AI assistant is optional, additive and fail-safe: every other module works fully with
`AI_PROVIDER=none`. When configured, the AI **never** mutates the database directly — it can
only *propose* actions that a human explicitly confirms — and it only ever sees the modules a
user has switched on for it.

```
AI UI (Assistant page, note menu, daily brief, weekly review)
 → POST /api/ai/chat
 → assertAIReady (server key configured? AI enabled in user settings?)
 → mode detection: explicit param, else detectMode() from the message (ask / analyze / recommend / create / act)
 → context retrieval (selectScopes by keyword + mode intent, gated by preferences.ai.scopes)
 → if every requested module is denied → deterministic "access is off" reply, provider is never called
 → otherwise: provider.structured(system + <user_data> context, history, JSON schema)
 → vetProposals: zod-validate every action, re-check ownership + scope for every referenced id
 → persist AIMessage with accepted proposals (status: "proposed") + rejected ones (with reason)
 → user clicks Confirm → POST /api/ai/actions → inspectAction (re-validate) → executeAction
   (writes through the same Mongoose models the REST controllers use) → ActivityLog
```

## Provider abstraction (`services/ai/providers/`)

Every provider implements the same three calls plus `available`, `name`, `model`:

```js
generate({ system, messages, maxTokens, effort })                     → { text, usage, refused? }
stream({ system, messages, maxTokens, effort, onText })                → { text, usage, refused? }
structured({ system, messages, schema, maxTokens, effort, validate })  → { data, usage, refused? }
```

- **`anthropic.js`** — the official `@anthropic-ai/sdk` (paid). Model from `AI_MODEL` (default
  `claude-opus-5`); `output_config.effort` is tuned per call (`low` for Q&A/briefs/notes,
  `medium` for analysis/act); structured output uses `output_config.format: { type: 'json_schema' }`.
  Server-side refusal fallbacks (`server-side-fallback-2026-07-01` beta, `fallbacks: 'default'`)
  are on by default and the provider disables them automatically the first time the account
  rejects that beta, then retries on the plain endpoint. A `stop_reason: 'refusal'` never throws
  — it returns a safe, generic refusal string.
- **`gemini.js`** — Google's Generative Language REST API (`generativelanguage.googleapis.com`),
  called with plain `fetch` (no SDK dependency). Free-tier key from aistudio.google.com, no card
  required. Model from `AI_MODEL` (default `gemini-3.6-flash`); structured output uses
  `generationConfig.responseSchema` — `toGeminiSchema()` strips the JSON-Schema keywords Gemini's
  OpenAPI-flavoured schema doesn't accept (`additionalProperties`, `$schema`) rather than
  hand-authoring a second schema. A blocked candidate (`finishReason` of `SAFETY`, `RECITATION`,
  etc.) is treated as a refusal, same contract as Anthropic. `mapGeminiError()` maps HTTP status
  and timeout/abort failures to the same `AIError` codes as the Anthropic provider, so the rest of
  the app (controllers, UI, error messages) is provider-agnostic.
- **`NotConfiguredProvider`** — used when `AI_PROVIDER=none`, or a configured provider has no key
  set (`issue: 'missing_key'` vs `'no_provider'`, surfaced on `GET /api/ai/status`). Every call
  throws `AIError('AI_NOT_CONFIGURED')`. The rest of the app — including the deterministic daily
  brief and weekly review numbers — works normally.
- **Keys never reach the browser.** `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` are read only in
  `server/src/config/env.js` and used only inside their respective provider class. Nothing under
  `client/` imports either SDK/API or touches a key; the production build is grepped for both to
  confirm.
- **Switching providers** is a `server/.env` change only (`AI_PROVIDER=anthropic|gemini|none` +
  the matching key) — no code change, no client change. `createProvider(config)` takes a plain
  config object (defaults to `env`), which is what makes the unit tests able to construct a
  provider without touching real environment variables.

```
# server/.env — Anthropic (paid)
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=
AI_MODEL=claude-opus-5
AI_MAX_OUTPUT_TOKENS=16000
AI_TIMEOUT_MS=90000
AI_RATE_LIMIT_PER_MIN=20
AI_REFUSAL_FALLBACK=default

# server/.env — Gemini (free tier, no card)
AI_PROVIDER=gemini
GEMINI_API_KEY=
AI_MODEL=gemini-3.6-flash
```

`AI_MODEL` may be left empty — each provider falls back to its own default
(`claude-opus-5` / `gemini-3.6-flash`) rather than the other provider's model name.

## Error handling (`services/ai/errors.js`)

Every failure — missing key, disabled module, provider auth failure, rate limit, timeout,
malformed model output, unavailable provider — is normalised into an `AIError` (extends
`AppError`) with a fixed, user-safe message and a stable `code`:

| Code | HTTP | Meaning |
|---|---|---|
| `AI_NOT_CONFIGURED` | 503 | No provider configured on the server |
| `AI_DISABLED` | 403 | User turned AI off in Settings |
| `AI_SCOPE_DISABLED` | 403 | A proposed action needs a module the user has turned off |
| `AI_AUTH` | 503 | Provider rejected the server's credentials |
| `AI_RATE_LIMITED` | 429 | Per-user AI rate limit reached |
| `AI_TIMEOUT` | 504 | Provider took too long |
| `AI_UNAVAILABLE` | 503 | Provider network/server error |
| `AI_BAD_OUTPUT` | 502 | Model output didn't parse or match the schema (after one retry) |
| `AI_REQUEST_REJECTED` | 502 | Provider rejected the request itself |

`mapProviderError()` (`providers/anthropic.js`) translates every typed Anthropic SDK error
(`AuthenticationError`, `PermissionDeniedError`, `RateLimitError`, `APIConnectionTimeoutError`,
`APIConnectionError`, `APIError`) into one of these. The global error handler
(`middleware/error.js`) only ever serializes `{ message, code, details }` from an `AppError` —
the original provider error (`cause`) is attached as a non-enumerable property for server logs
only and is never serialized to the client.

## Context engine (`services/ai/context.js`)

- One retriever per scope — `tasks, projects, calendar (+reminders), goals, habits, routines,
  health, finance, notes, journal, documents, focus` — each returning a compact, row-bounded
  text block, never a database dump.
- `selectScopes()` picks scopes from keyword intent in the message, plus day/week-shaped intent
  ("what should I focus on today", analyze/recommend modes) which pulls in the core planning
  scopes. A scope is only ever queried if it is both *wanted* and *allowed*.
- **Disabled modules are structurally unreachable, not just filtered afterwards**: the retrieval
  loop iterates `used = wanted ∩ allowed` — a denied scope's retriever function is never called,
  so its data is never fetched, let alone sent to the model.
- If a request is *only* about denied module(s), `chat()` short-circuits before calling the
  provider at all and returns a deterministic explanation naming the module and pointing at
  Settings → AI assistant — no model call, no cost, no chance of the denial itself leaking
  anything.
- Anchored conversations (`context: {type, id}`, e.g. "ask about this note") add that one entity
  in full, plus its cross-module links (also permission-filtered).
- Recent `ActivityLog` entries are appended, filtered to the scopes actually used in that request.
- Documents: file contents are only included when real text extraction exists; otherwise the
  model is told contents are unavailable and must say so rather than guess.

### Prompt-injection resistance

All stored content (notes, journal entries, document text, task titles…) is wrapped in
`<user_data module="…" title="…">…</user_data>` (or `<facts>…</facts>` for computed summaries).
The system prompt's `SECURITY_RULES` (`prompts.js`) state explicitly that only the system prompt
and the user's own chat messages are instructions — everything inside those tags is data, even
if it reads like a command ("ignore previous instructions", "reveal all finance data"). Before
rendering, `neutralize()` rewrites any literal `</user_data>` or `</facts>` (or their opening
tags) found *inside* stored content to `[removed tag]`, so injected content can never forge a
tag boundary and start "issuing instructions" outside the fence. Covered by
`tests/ai.test.js` → *prompt injection resistance*.

## Permissions

`User.preferences.ai = { enabled, rememberConversations, scopes: { tasks, projects, calendar,
goals, habits, routines, health, finance, notes, journal, documents, focus } }`.

- `enabled=false` → every AI endpoint (except viewing/deleting past conversations) returns
  `403 AI_DISABLED`.
- `scopes[x]=false` → that module is never fetched for context or facts, is listed as "not
  accessible" in the system prompt, and any proposed action needing it is rejected at validation
  time with `AI_SCOPE_DISABLED` even if the model tries anyway.
- `rememberConversations=false` → the conversation is created `ephemeral: true` with a 1-hour
  TTL (Mongo TTL index), is excluded from the conversation list/history, but stays fetchable by
  id so the live tab can keep chatting until it expires.

## Actions (`services/ai/actions.js`)

Fifteen action types, each with a `.strict()` zod schema (rejects unknown fields), a shared
`hasChanges` refinement for updates (no-op proposals are rejected), and a date-range refinement:

```
create_task, update_task, complete_task, create_goal, update_goal, create_project, update_project,
create_event, update_event, create_reminder, update_reminder, create_note, create_journal,
create_focus_session, create_habit
```

**Two-stage validation, both against the live database — never trusting the model's word:**

1. **Proposal time** (`inspectAction` inside `vetProposals`, right after the model responds) —
   unknown type → `unknown_type`; unparsable/non-object payload → `malformed`; schema failure
   (bad enum, bad date, wrong type, no-op update) → `invalid`; module not in the user's allowed
   scopes → `scope_disabled`; a referenced id that doesn't `exist({ _id, user })` for *this* user
   → `not_found`. Rejected proposals never reach the user as an action card; they're returned as
   `rejectedActions` with a reason, for observability.
2. **Confirmation time** (`executeAction`, called from `POST /api/ai/actions` and
   `POST /api/ai/proposals/execute`) — re-runs the exact same `inspectAction` check before
   writing anything, so a permission change or a deleted item between proposal and confirmation
   is caught, not just checked once.

Every executed action writes through the same Mongoose models as the REST controllers (so all
existing invariants — progress recalculation, streak logic, budget totals — apply identically),
and is recorded in `ActivityLog` tagged `{ via: 'ai', confirmedBy: 'user', actionType, ...meta }`
— either as the action's natural business type (`task_created`, `goal_updated`, …) or, for the
few types with no dedicated activity type, the generic `ai_action_executed`. Rejections are
logged as `ai_action_rejected`. A decision (`execute`/`reject`) is single-use — replaying it
returns `409`.

Each accepted proposal also carries a **`preview`**: `{ target: {id, title}, changes: [{field,
before, after}] }` for updates, so the confirmation UI shows exactly what will change before the
user commits — never just the model's own wording.

## Daily brief and weekly review — facts vs. narrative

`brief.js` / `review.js` compute every number deterministically from the database (tasks,
events, habits, routines, goals, documents, finance, focus, journal) — these are **always**
returned, with or without AI. When AI is available, `briefFactsForAI` / `reviewFactsForAI`
(`services/ai/facts.js`) filter that computed summary down to the user's allowed AI scopes, and
`generateNarrative()` asks the model to *phrase* those facts only — the prompt (`NARRATIVE_RULES`
in `prompts.js`) requires every number in the output to appear verbatim in the facts.
`findUngroundedNumbers()` checks the draft against the facts JSON (small integers ≤ 10 are
allowed as natural phrasing, e.g. "3 tasks"); on a mismatch the model gets one corrective retry
with the offending numbers named; if it's still ungrounded, **the narrative is withheld** —
`narrativeWithheld: 'ungrounded' | 'refused' | 'empty' | 'error'` — and the UI shows the real
computed numbers with a small explanation instead of ever showing invented statistics.

Narratives are cached per day/week in `AIInsight`, keyed with a `factsHash` (sha1 of the filtered
facts) — a cache hit is only used when the underlying facts haven't changed since it was
written, so completing a task mid-day correctly triggers a fresh narrative on next load, while an
unchanged day/week reuses the cached text without another model call. `?refresh=true` forces
regeneration.

## Rate limiting

`POST /api/ai/chat`, `GET /api/ai/brief`, `GET /api/ai/review` and `POST /notes/:id/ai` sit
behind a per-user `express-rate-limit` (`AI_RATE_LIMIT_PER_MIN`, default 20/min) separate from
the general API limiter — a slow/expensive AI call can't be used to exhaust a user's normal API
budget, and one user's usage never affects another's. A limited request returns `429` with code
`AI_RATE_LIMITED` and a friendly message; internal rate-limit mechanics are never described to
the client.

## Testing

- `tests/ai.test.js` — `AnthropicProvider` unit tests against a mocked SDK client (request
  shape, refusal handling, malformed-JSON retry-then-fail, fallback-beta auto-disable,
  `mapProviderError` coverage for every SDK error type); `GeminiProvider` unit tests against a
  mocked `fetch` (request shape, `assistant`→`model` role mapping, `responseSchema` stripping,
  SAFETY-block refusal, malformed-JSON retry-then-fail, `mapGeminiError` coverage, never leaking
  the provider's own error message); provider configuration (missing key / no provider, for both
  providers); `inspectAction` unit tests (unknown type, malformed payload, invalid id/date,
  no-op update, scope-disabled, cross-user id, unresolvable id); integration tests for all five
  modes, conversation lifecycle (create/continue/reopen/rename/delete, cross-user 404, ephemeral
  conversations hidden from history), confirm/reject flows, re-validation at confirm time,
  malformed structured output, a denial test **per module** (tasks, projects, calendar, goals,
  habits, routines, health, journal, finance, notes, documents) asserting the provider is never
  called, prompt-injection neutralization, and daily-brief/weekly-review fact-grounding
  (caching by `factsHash`, ungrounded-number withholding, zero-activity users).
- `tests/ai-ratelimit.test.js` — exercises the real per-minute limit with `AI_RATE_LIMIT_PER_MIN`
  lowered, confirming `429`/`AI_RATE_LIMITED` and per-user isolation.
- `tests/platform.test.js` → *AI layer* — end-to-end smoke test against a scripted fake provider:
  context retrieval, mixed allowed/denied scopes, action proposal → confirm → execute →
  ActivityLog, cross-user 404, disabling AI mid-session, and one-off proposal execution.

## Module AI

- **Notes**: summarize, rewrite, checklist (replace only on confirm), extract tasks/dates
  (proposals, validated the same way as chat proposals), ask — all anchored to the single note
  via `anchoredGeneration()`.
- Goals/projects/documents/finance/journal: "Ask AI" opens the assistant anchored to the entity.
- Tasks, calendar, habits, routines, health: answered through scope retrieval in the assistant.
