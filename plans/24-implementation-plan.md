# 24 — Implementation Plan

**Implements:** `specs/24-build-spec.md` v1.1 (58 acceptance criteria)
**Written:** 2026-08-24
**Status:** Stage 5 complete

## How to use this document

Stages run top to bottom. Two exceptions: Stage 9 is independent of the client and may run in parallel any time after Stage 1, and Stage 12 may run any time after Stage 8 — it gates step 11.5, and it is what lets the whole system be accepted before Stage 13 exists.

Every step carries the spec sections it implements and the numbered §12 acceptance criteria it closes. Per `CLAUDE.md`: when a step's acceptance criteria pass, check it. When every step in a stage is checked, check the stage and recommend a review and pull request before moving on.

Every one of the 58 criteria is claimed by at least one step. The map is at the end (§Coverage).

---

## Decisions taken

Fixed by the interview before writing this plan.

| Area | Decision |
|---|---|
| Stack | Next.js (App Router) + TypeScript, one app: participant client, facilitator console, and all §6.1 / §6.2.2 endpoints as route handlers. One repo, one deploy, no CORS. |
| Datastore | SQLite file via `better-sqlite3`. Rooms, sessions, snapshots, events. |
| Household estimator | Real fit against the ATUS extract in `datasets/`, own stage, emitting coefficients into the pack. Placeholder coefficients ship from Stage 1 so the client is testable before the fit lands. |
| Granularity | Stage → step → acceptance criteria. |
| Hosting | Self-hosted on a facilitator-controlled machine, fronted by a Cloudflare Tunnel on `hours.ced-global.com`. Forced by the SQLite file. The subdomain is delegated to Cloudflare on its own; the `ced-global.com` nameservers do not move. Stage 13. The system is provable without it — Stage 12 runs a full room on a LAN with no domain, no tunnel, and no internet, and doubles as the venue contingency. |

**Styling:** CSS Modules over a single token file. Chosen over a utility framework because §7.2–§7.6 specify exact geometry — 8% of viewport width, 12% opacity, `clamp(13px, bandHeight × 0.16, 34px)`, a 6 px stripe period — which are computed values, not scale steps. Tokens hold the hue ring, the overflow red, and the two type faces.

**Testing:** Vitest for the pure domain layer (Stage 1 is fully unit-testable with no DOM), React Testing Library for component behaviour, Playwright for the stage machine, refresh-resume, and the viewport criteria (16, 58). Criteria that are visual judgements (19, 41) get a Playwright screenshot plus a written check, not an assertion.

---

## Target layout

```
app/
  page.tsx                          participant shell, S1–S5 stage machine
  facilitate/[roomId]/page.tsx      console (§6.2)
  api/
    room/route.ts                   POST /room
    room/[roomId]/stage/route.ts    POST — facilitator flip
    room/[roomId]/status/route.ts   GET  — console poll
    session/route.ts                POST /session
    session/[id]/stage/route.ts     GET  — participant poll (RD-2)
    session/[id]/ready/route.ts
    session/[id]/complete/route.ts
    session/[id]/telemetry/route.ts
    pack/[version]/route.ts         GET  — the packUrl target
lib/
  domain/       activity, daytype, derive, fits, constraints
  pack/         types, loader, validator
  estimators/   registry, arith.freqDuration, household.v1 (coefficient eval)
  store/        answer map, localStorage persistence, session identity
  session/      api client, one-shot bootstrap, jittered stage poll
  api/          response + auth helpers, payload narrowing, stage ingest
  telemetry/    event queue, batching, snapshots
  db/           schema.sql, migrations, ids, queries
components/
  stack/        Stack, Band, Ruler, Unallocated, NotIncluded, DayToggle
  sheet/        Sheet, ScreenList, fields/*, DirectEntry
  stages/       S1Questionnaire, S3Hold, S4Reveal
packs/
  v1/pack.json  content pack (§4.1)
estimators/
  household.py  ATUS fit → coefficients (build tooling, not runtime)
```

---

## Resolved contradictions

Two places where the spec contradicted itself. Both are now decided; the build follows this section, not the sections it overrides.

### RD-1 — The ruler ticks: no scrim

**The contradiction.** §7.3 specifies a translucent scrim plate behind each tick number, spanning the spine's width, and AC 19 tests legibility *via* that plate. `specs/notes.txt`, committed after the spec, says:

> for the hour counter ruler, there should not be those visible translucent stripes. instead, there are exact ticks, and the numbers stand alone, will decide later with what color, for now just white

**Decided: follow the note.** Exact hairline ticks, numbers standing alone in white, no plate. §7.3's tick-scrim paragraph is struck, and with it the sentence *"The plate is the only element permitted to sit between the spine and the tick"* — nothing now sits between them.

**AC 19 is kept, with its test rewritten.** From "each tick number sits on a translucent scrim and is legible against every activity hue at full saturation" to just the second half: **legible against every activity hue at full saturation.** That was always the property; the plate was one way of guaranteeing it, and the note trades the guarantee for the cleaner mark.

**The risk that trade opens, and what happens if it fires.** §7.3's reasoning was that no single ruler colour holds contrast against ten arbitrary hues. Bare white is exactly such a colour, and the light end of the 36° ring — roughly hues 45°–90° — is where it will fail first. Tested in step 4.4, against all ten hues at full saturation, early in Stage 4 rather than at the acceptance sweep.

If white fails, the scrim does **not** come back on its own. The note defers a colour decision, so a failure returns to the user as that decision — a darker tick colour, a hue-ring adjustment at the light end, or an explicit reversal to the plate. **Affects Stage 4, step 4.4.**

**It fired, and the resolution is the hue ring.** Step 4.4's check found white failing on six of the ten hues — 1.56:1 at 72°, and under 4.5:1 everywhere from 36° to 180° plus 324°. Decided 2026-08-25 with the user: the ring moves from `hsl(h 72% 52%)` to `oklch(0.52 0.16 h)`, and white stays.

The reason it is the ring rather than the tick is that HSL's `lightness` is not perceptual. At one HSL lightness the yellow end of the ring is nearly four times as luminous as the blue end, so the v1 ring was uneven in exactly the property §7.5 says must not distinguish one band from another — and white was reading that unevenness. At a fixed OKLCH lightness the ring is evenly light in fact as well as in notation, the 36° spacing is untouched, and white clears 4.5:1 on every hue with room to spare (5.15:1 worst, 5.15–6.02 across the ring). Rejected: a flat darker tick, which fails at 252° and is marginal at four more; a per-hue tick colour, which would stop the scale reading as one ruler; and reinstating the plate, which is the mark the note asked to remove. Cost: the bands read as deeper tones, and the greens and yellows lose their brightness.

`components/stack/ruler-contrast.test.ts` asserts it, reading the tick colour and the spine's own declaration out of the stylesheets rather than restating either, so the ring and the tick cannot drift apart again without a red test. **Tokens: `--band-lightness`, `--band-chroma`.**

### RD-2 — `roomId` never reaches a participant

**The contradiction.** §6.1 has `POST /session` return `{ sessionId, token, roomId, packVersion, packUrl }` and has participants poll `GET /room/:roomId/stage`. §6.2.1 says the opposite:

> roomId is not derivable from joinCode. That separation is the only thing standing between a participant and the stage flag (§6.2.6), so roomId must never be sent to a participant client.

As written, every participant holds the one secret protecting the flag, and §6.2.6's scope argument collapses — the console is unauthenticated *on the strength of* roomId staying with the facilitator.

**Decided: §6.2.1 wins; the participant poll moves.**

- `POST /session` returns `{ sessionId, token, packVersion, packUrl }` — no `roomId`.
- Participants poll **`GET /session/:id/stage`** → `{ stageOpen, serverTime }`, the identical body, authenticated by the session token. The server resolves session → room internally.
- `GET /room/:roomId/stage` is dropped from the participant surface. The console reads `stageOpen` from `/room/:roomId/status`, which it already polls, so no route is lost.

Same poll cost and same 1 s cache window, per session rather than per room — forty sessions in a room is forty cheap cache entries, not one, which is the whole price of the change. In exchange, roomId never leaves the facilitator's browser and §6.2.6's stated protection actually holds. **Affects Stage 2, step 2.3.**

### Noted, resolved in-plan

§6.2.2 requires `inStage` to sum to `total`, but no endpoint reports a participant's stage. The server derives furthest stage from the `stage.enter` events already arriving in telemetry batches (§10), taking the max and never decreasing. A session starts at `s1` on creation, so the sum holds from the first row. See step 2.5.

**`stage.enter` carries a `stage` field.** §10's `Event` has `activityId` and `fieldId` and nothing that names a stage, so the derivation above had nowhere to read from. `Event` gains an optional `stage?: StageId`, with a matching `events.stage` column (schema v2). Rejected: folding it into `activityId`, which is grouped on to produce cut order and per-activity delta (§10) and would then hold both `leisure` and `s4`. Decided 2026-08-25 with the user. **Stage 2, step 2.5; consumed by Stage 10, step 10.4** — *time to fit* is measured from the S4 entry recovered from this column.

**Token transport is `Authorization: Bearer`.** §6.1 says auth is a session token but never says how it travels. Bearer header on all four session-scoped routes, keeping the credential out of URLs, browser history, and proxy logs; §6.1's 1 s cache on the stage poll is marked `private`, since the body is one participant's view. A missing token, a wrong token, and an unknown session all return 401 — a 404 on the last would make the route an oracle for which session ids exist. Decided 2026-08-25 with the user. **Stage 2, steps 2.3–2.5.**

**`packUrl` points at a route handler.** §6.1 has `POST /session` return a `packUrl` but names no route to serve it, and `packs/v1/pack.json` sits outside `public/` where nothing serves it. Added `GET /api/pack/:version`, which runs §4.6 validation before the bytes leave the server; `packs/v1/pack.json` stays the single canonical copy. Rejected: moving the pack under `public/`, which serves it unvalidated and splits the file from the layout below. Unknown versions 404 rather than falling through to v1, so a client asking for a pack this build lacks hits its §11 retry and last-good path instead of being handed different content under the version it asked for. Decided 2026-08-25 with the user. **Stage 2, step 2.2.**

**The multitasking statement gets its own page.** §13 requires it stated once in the questionnaire intro; the pack has the `intro.multitasking` key and §4.2's `Screen` has no slot for a standing note outside a screen. Stage 1 hung it on the first screen's `note`. Decided instead: a dedicated page before screen one, with its own Continue, and the dismissal persisted (`introSeen`) so "once" survives the refresh §11 requires be invisible. It is **not** counted in `s1.progress` — progress is over pack screens (§4.2.1), and this page is client chrome no pack declares. Decided 2026-08-25 with the user. **Stage 3, step 3.1.**

**The join screen belongs to Stage 3.** No step builds it, and S1 is unreachable without one: `ensureSession` needs a join code. Built here as enabling work, claiming no acceptance criterion of its own — a four-digit code, `POST /session`, and nothing else. A 404 is a wrong code and says so; any other failure is a retry and must not tell forty people their code is bad. Stage 6 still owns the stage machine. Decided 2026-08-25 with the user. **Stage 3.**

**§9's copy table is a floor, not a ceiling.** §9 requires that no string be hardcoded in the participant client, and its required-keys table names none of the client's own chrome — the navigation controls, the intro page, the join screen, the unit suffix beside a stepper. Fourteen keys added to the pack and to `REQUIRED_COPY_KEYS`, so a replacement pack cannot ship without them and leave a room reading raw key names. The facilitator console remains §9's stated exception and reads none of them. **Stage 3, steps 3.1–3.2.**

**Media closes against fixtures, not pack content.** No v1 screen declares an image, so AC 3 and AC 4 are proved against fixture screens through the real renderer rather than by shipping placeholder artwork the workshop does not want. The cap of 2 stays a pack-validation failure (`media-cap`), not a renderer truncation. Decided 2026-08-25 with the user. **Stage 3, step 3.2.**

---

## Stage 0 — Scaffold, tokens, database ✅

- [x] **0.1 Next.js + TypeScript app** — App Router, strict TS, ESLint, Vitest, Playwright. `.gitignore` extended for `node_modules`, `.next`, `*.sqlite`; the existing `datasets/` ignore stays.
  *AC: none (enabling)*

- [x] **0.2 Design tokens** — `styles/tokens.css`: the ten-hue ring computed at `360/n`, the overflow red, spine/body opacities (100% / 12%), the two faces (display for labels, utility face with `tabular-nums` for numbers and the toggle), and the 24 h rim colour. One file, so §7.5's evenness has a single source rather than ten literals. (§7.3, §7.5, §7.6)
  *AC: none (enabling; 20 is tested in 1.5 and 4.3)*

- [x] **0.3 SQLite schema and migration runner** — `lib/db/schema.sql`, opened once per process, WAL on. (§2.1, §6.1)
  ```sql
  rooms      (id TEXT PK, join_code TEXT UNIQUE, stage_open INT DEFAULT 0,
              opened_at INT, created_at INT)
  sessions   (id TEXT PK, room_id TEXT, token TEXT, stage TEXT DEFAULT 's1',
              ready_at INT, completed_at INT, created_at INT)
  snapshots  (id INTEGER PK, session_id TEXT, kind TEXT, json TEXT, t INT)
  events     (id INTEGER PK, session_id TEXT, t INT, type TEXT,
              activity_id TEXT, field_id TEXT, from_h REAL, to_h REAL)
  room_events(id INTEGER PK, room_id TEXT, type TEXT, t INT, ready INT, total INT)
  ```
  `snapshots.kind` is one of `s1` / `finish` / `complete` (§10). `room_events` carries `stage.open` and nothing else in v1 (§6.2.5).
  *AC: none (enabling)*

- [x] **0.4 Shared types** — `lib/domain/types.ts` and `lib/pack/types.ts` transcribed from §3.2, §4.1, §4.2, §4.3, §5, §10. `DayValue.mode` is the three-member union `'derived' | 'direct' | 'fallback'` from the outset — §4.3 rule 5 is not retrofittable onto a boolean.
  *AC: none (enabling)*

**Stage 0 done when:** `npm run dev` serves a blank shell, `npm test` runs, the schema applies to a fresh file, and `tsc --noEmit` is clean.

---

## Stage 1 — Domain core and content pack ✅

Pure functions, no DOM, no network. This is where §3.4's invariant lives and the cheapest place to get derivation right.

- [x] **1.1 Answer map and persistence** (§5) — flat `Record<fieldId, {value, at, revision}>`, `revision` incrementing on every edit. Derived hours are never written here. localStorage keyed by session id, written on every field change. On boot, restore the answer map alongside `sessionId`, `token`, selected day type, and furthest stage. Pack-version mismatch on restore keeps answers whose field ids still exist, drops the rest, and resumes at S1's first unanswered screen.
  *AC: 6 (with 3.6), 36 (with 2.6, 6.5)*

- [x] **1.2 Estimator registry** (§4.3) — `Map<estimatorId, Estimator>`. Two bundled implementations: `arith.freqDuration`, summing a section's frequency × duration field pairs, and `household.v1`, evaluating coefficients carried in the pack. Every estimator is a pure function of `(answers, dayType)` — no time, no randomness, no session state — and missing inputs resolve to pack defaults rather than to `NaN` or a throw.
  *AC: none directly (feeds 1.3, 9.x)*

- [x] **1.3 Derivation and mode machine** (§4.4, §4.3 rules 4–5) — the three-branch resolver, with `direct` the only short-circuit. A throw sets `mode: 'fallback'`, returns the pack default, and logs `estimator.fallback`; the next derivation pass retries it and a success returns it to `derived`. `direct` is never re-evaluated. Plain arithmetic runs through `arith.freqDuration`, so there is exactly one code path and nothing is special-cased per activity.
  *AC: 27*

- [x] **1.4 Totals, fits, constraints** (§3.4, §8.2) — `total`, `remaining` (may go negative; nothing clamps it), `overflow`, and `fits()` in its general both-day-types form. Constraint clamps: sleep ≥ 6 h/day; school ≥ 20 h/week in 5 h steps, weekend-disallowed; all others ≥ 0. Clamping is silent and emits `clamp.hit`.
  *AC: none directly (asserted in 5.3, 7.2)*

- [x] **1.5 Pack loader and validator** (§4.6) — all fourteen validation rules, including the three §4.6 additions: a default on every field in a gated section, a per-day-type default on every activity with a fallback path, and an even hue ring at `360/n`. Fails loudly in dev; falls back to the last-good cached pack in production.
  *AC: 20 (ring validated here, rendered in 4.3)*

- [x] **1.6 v1 content pack** (§3.3, §4.1, §9) — `packs/v1/pack.json`: ten activities in §3.3 order with hues at `order × 36°`, screens for every section, gates on the gated sections, defaults on every gated field, fallback defaults for `household` and `care`, placeholder `household.v1` coefficients (replaced in Stage 9), and every §9 copy key. Copy holds the §9 register: no norm, benchmark, comparison, or expectation, in any section. The multitasking statement (§13) goes in the questionnaire intro, once.
  *AC: 5*

**Stage 1 done when:** the domain layer has unit tests covering derivation in all three modes, the fallback→derived recovery path, `fits()` on both day types, every clamp, and all fourteen pack validation rules — and the v1 pack passes validation.

---

## Stage 2 — Session API and persistence ✅

- [x] **2.1 Room lifecycle** (§6.2.1) — `POST /room` → `{ roomId, joinCode, consoleUrl }` with `stage_open = false`. `joinCode` is four digits, no leading zero (1000–9999), unique among live rooms, regenerated on collision. `roomId` is a UUID and is not derivable from the code.
  *AC: 49 (with 2.2)*

- [x] **2.2 Session creation** (§6.1, **RD-2**) — `POST /session { joinCode }` resolves the code to a room and returns `{ sessionId, token, packVersion, packUrl }`. Unknown code → 404. `roomId` is **not** in the response and appears nowhere in participant-facing state — not in the URL, not in localStorage, not in a telemetry payload. A test asserts this on the response body.
  *AC: 49*

- [x] **2.3 Stage polling** (§6.1, §6.3, **RD-2**) — `GET /session/:id/stage` → `{ stageOpen, serverTime }`, token-authenticated, `Cache-Control: max-age=1`, resolving session → room server-side. The client polls at 3 s ± 500 ms jitter so forty phones do not align. Network failure keeps polling and surfaces nothing. No participant-facing route takes a `roomId` parameter.
  *AC: 34 (with 6.4)*

- [x] **2.4 Ready and complete** (§6.1) — `POST /session/:id/ready` stores the finish snapshot and sets `ready_at`; it does **not** touch the stage flag. `POST /session/:id/complete` stores the complete snapshot plus the trailing event batch and sets `completed_at`.
  *AC: 32 (with 6.2)*

- [x] **2.5 Telemetry ingest and stage derivation** (§6.1, §10, §6.2.2) — `POST /session/:id/telemetry` accepts a batch and appends to `events`. The same handler advances `sessions.stage` to the max `stage.enter` in the batch, monotonically — this is what makes `inStage` sum to `total` without a stage endpoint the spec never defined. A session is `s1` from creation.
  *AC: none directly (feeds 8.2, 10.x)*

- [x] **2.6 Idempotent session restore** (§5, §11) — the client calls `POST /session` exactly once per participant. On boot with a stored `sessionId` + `token` for the current pack version, it restores and resumes; it must not mint a second row, because `total` is the number the facilitator's decision rests on and a duplicate breaks `inStage` summing to it.
  *AC: 36 (with 1.1, 6.5)*

**Stage 2 done when:** every endpoint has a route test, an unknown join code 404s, a token from room A cannot read room B's session, and repeated boots against one stored session produce exactly one row.

---

## Stage 3 — S1 questionnaire ✅

- [x] **3.1 Screen renderer** (§4.2) — screens in pack order, one page at a time, multiple fields per screen as the normal case. Field types: `count`, `duration`, `clock`, `number`, `choice`, `multichoice`. Two day-scoped fields on one screen capture independently — wake time on workdays and wake time on weekend days do not share state.
  *AC: 1 (with 3.3), 2*

- [x] **3.2 Media** (§4.5) — 0–2 images. One sits between prompt and fields at full content width; two sit side by side at half. `aspect` reserves layout space before load so fields never jump. Every question is answerable with images blocked, and `alt` is required at pack validation.
  *AC: 3, 4*

- [x] **3.3 Gates** (§4.2.1) — one gate per section, on that section's first screen. A falsy answer skips the rest of that section and no other. No `showIf`, no field conditionals, no cross-section dependencies, no reordering. Flipping falsy→truthy reveals the remaining screens at their defaults, unanswered; truthy→falsy hides them and preserves their answers, so the round trip is lossless.
  *AC: 1, 7*

- [x] **3.4 Progress** (§4.2.1) — computed over reachable screens given current gate answers, recomputed when a gate changes. The total drops when a section is gated out; that is honest, and preferred over a bar that lies to stay monotonic.
  *AC: 8*

- [x] **3.5 Stack generation at S1 end** (§3.3, §7.7, §4.4) — on the last screen, derive the full stack: one band per non-zero activity in pack order, every zero-hour activity in Not included. A wholly unanswered section derives to non-zero hours from its field defaults and does **not** land in Not included — this is §4.6's default rule paying off, and it is what makes §4.2.1 rule 6 honest.
  *AC: 9, 10* — Stage 3 rendered this through a plain `StackSummary`, which said so in its own docblock and existed only until §7's instrument did. Stage 4 replaced it with the real editor; both criteria are now asserted against `components/stack/Stack.tsx`, which draws the same contents to §7's geometry.

- [x] **3.6 Answer persistence** (§5) — every field change writes through to localStorage; a mid-session refresh costs nothing.
  *AC: 6*

**Stage 3 done when:** a participant can complete the questionnaire, gate two sections out and back in without losing an answer, refresh mid-flow and resume in place, and reach a stack whose contents match §3.3.

---

## Stage 4 — Editor: toggle, stack, ruler, Not included ✅

The instrument. §7 is unusually specific and the criteria are correspondingly literal.

- [x] **4.1 Day-type toggle** (§7.1) — two segments above the stack, the only chrome between header and ruler. Each carries its day type's label and that day's **occupied hours** — `total(dt)`, not `remaining` — live, whether selected or not. Selecting changes which stack renders and nothing else: no answer, no derivation, no telemetry beyond a view event. Default `wd` on first entry to S2; the selection survives sheet open/close and refresh. Labels in the utility face, uppercase with letter-spacing; hours in `tabular-nums` so a changing total cannot reflow the tab.
  *AC: 11, 12, 14, 15*

- [x] **4.2 Breach signal on the toggle** (§7.1, §7.6) — when `total(dt) > 24`, that segment's hour count goes bold and overflow-red, selected or not. It shows occupied hours (`27.7 hr`), never `+3.7` and never `3.7 over`.
  *AC: 13*

- [x] **4.3 Geometry and band anatomy** (§7.2–§7.5) — full-bleed, zero horizontal margin at every supported width down to 320 px. `pxPerHour = (viewportHeight − headerH − toggleH − footerH) / 24`, recomputed on resize and orientation change. Band height is `hours × pxPerHour`, unclamped; the container is `max(24, total) × pxPerHour`, so an overflowing stack extends past the viewport and scrolls — intended, not a bug to fix. Spine at 8% of viewport width (25 px floor at 320 px) at full hue saturation; body at 92% in the same hue at 12% opacity. Label and hours right-aligned, inset 16 px. Hues read from the pack ring; colour is orientation, the label is identification.
  *AC: 16, 17, 20*

- [x] **4.4 Continuous ruler** (§7.3 as amended by **RD-1**) — ticks at 0/3/6/9/12/15/18/21/24, absolutely positioned against the stack container rather than per band, so it reads as one ruler across ten spines, rendered over the spine. Exact hairline ticks, numbers standing alone in white, **no translucent scrim** — nothing sits between the spine and the tick.
  **Legibility check, run here and not deferred to Stage 11:** render the ruler over all ten hues at full saturation and read every tick. The light end of the ring (roughly 45°–90°) is where bare white fails first. A failure returns to the user as the colour decision `specs/notes.txt` defers; it does not silently reinstate the plate.
  *AC: 18, 19 (19's test is "legible against every hue at full saturation" — see RD-1)*

- [x] **4.5 Type scaling and tap targets** (§7.4) — `labelSize = clamp(13px, bandHeight × 0.16, 34px)`, `hoursSize = labelSize × 0.72`; the label is omitted below a 20 px band. Tap target is independent of visual height: every band gets a ≥44 px transparent hit overlay that may overlap neighbours, and when overlays collide the **smaller** band wins — thin bands are the hard ones to hit.
  *AC: 21, 22*

- [x] **4.6 Unallocated** (§7.8) — bottom band, dashed 1 px outline, no fill, no spine, label from `band.unallocated`. No tap target. Absent entirely when `remaining ≤ 0`.
  *AC: none directly (asserted in 7.7's no-squeeze path)*

- [x] **4.7 Not included** (§7.7) — membership is `hours('wd') === 0 && hours('we') === 0`; zero on one day type only keeps the activity in the stack, rendering a band on the day it has hours. Sits below the 24 h line, reached by scrolling. Heading in the utility face at the stack's right-label inset; one muted full-width row per activity, ≥44 px, label only — no hue, no spine, no hour count. Cause is not distinguished: gated-out and answered-to-zero look identical, and the route to zero is telemetry, not UI. A footer count (`3 not included`) scrolls to it. Absent entirely when empty, with no empty-state copy. The stack never shrinks to fit the list on screen.
  *AC: 28, 29, 31*

- [x] **4.8 Options tab and session reset** (§7.9, §5) — a fixed sliver on the right edge at mid-height, 15% of the viewport tall, carrying a vertical ellipsis; editor only, and out of flow so §7.2's `pxPerHour` measurement is untouched. One item, **Start over**, behind a confirmation. `POST /session/:id/reset` deletes the row, its snapshots and its events in one transaction and mints a replacement in the same room — deleted rather than flagged so `total` keeps counting one row per participant (§6.2.2), and same-room so no join code is needed again and RD-2 holds. The server is asked before local state is cleared: a network failure destroys nothing and can be retried, while a 401 means the row is already gone and the client clears its record and falls back to the join screen.
  *AC: 22a, 22b, 22c*

**Stage 4 done when:** the stack renders at 320 px, 375 px, and landscape with no horizontal scroll; both toggle totals stay live and correct; the ruler is legible over every hue; a 0.25 h band is reliably tappable. — **All four hold.** `e2e/s2-editor.spec.ts` carries the geometry criteria in a real layout engine; `components/stack/*.test.tsx` carries the arithmetic behind them. The ruler took the RD-1 decision above to get there.

**Two things decided in the building, both small.** §9's copy table gains four more keys — `toggle.wd`, `toggle.we`, `toggle.hours` and `band.notIncludedCount` — on the same reasoning as the fourteen Stage 3 added: they are participant-facing strings the spec's table does not name, and a replacement pack that omits them leaves a room reading raw key names. The toggle's hours are one templated key rather than a number plus a unit, so a pack owns the whole figure. Separately, §7.4's 20 px label rule is applied to Unallocated as well as to bands: §7.8 calls it the bottom band, and a participant with six minutes of slack was getting a three-pixel dashed rule with a 13 px word spilling out of it across the 24-hour tick.

**A third, added afterwards (2026-08-26).** The spec had no way to start over: `ensureSession` short-circuits on any stored record, so a phone mid-run could only be reset by clearing its localStorage by hand — no use in a room, and no use rehearsing one (Stage 12). §7.9 and step 4.8 are the answer, and the shape of it was decided with the user: the server-side record is **deleted**, not flagged, because `total` counts session rows; the replacement is minted **in the same room**, because RD-2 leaves the client no `roomId` to rejoin with and re-reading the join code to forty people is worse than a server-side lookup; and the affordance is a **sliver**, because the alternative — a visible Start over in the footer — is a destructive control sitting under the thumb of someone rebalancing a stack. Seven copy keys join §9's table on the Stage 3 reasoning.

---

## Stage 5 — The sheet ✅

- [x] **5.1 Sheet shell** (§8.1) — rises from the bottom to 88% viewport height, rounded top corners, backdrop at 45% dim. Locks body scroll, traps focus, focuses the first focusable element on open. Closes on backdrop tap, Escape, downward drag past 25% of sheet height, or explicit Done. On close, the changed band animates to its new height over 200 ms, skipped under `prefers-reduced-motion`.
  *AC: 24*

- [x] **5.2 Prefilled replay and live header total** (§8.1) — the section's screens stacked vertically and scrollable, not paged: replay is review, and paging through four screens to fix one number is worse. Because the sheet occludes the stack, its header shows the activity's current computed total, updating live as fields change — the number substitutes for the visual the participant cannot see.
  *AC: 23*

- [x] **5.3 Constraints in the sheet** (§8.2) — sleep clamps at 6 h with the stepper disabled below; everything else clamps at 0. Clamping is silent, with no error copy — the control simply stops. Each clamp emits `clamp.hit`.
  *AC: 25*

- [x] **5.4 Direct entry** (§8.1, §4.3 rules 4–5) — "Set directly" flips the activity to `mode: 'direct'` and exposes numeric inputs for workday and weekend hours. It does not erase the underlying answers; reverting restores derivation from them unchanged. The estimator never reclaims a `direct` activity on its own.
  *AC: 26*

- [x] **5.5 Not-included row → sheet** (§7.7) — tapping a row opens that activity's sheet exactly as a band tap does, prefilled, including the gate at its falsy value if the section was gated out. Answering the gate truthy, or entering non-zero hours, moves the activity into the stack at its pack `order` on close, with the same 200 ms animation a height change gets.
  *AC: 30*

**Stage 5 done when:** every activity's sheet opens prefilled from both a band and a Not-included row, the header total tracks edits live, sleep will not go below 6, and direct entry round-trips without answer loss. — **All four hold.** `components/sheet/Sheet.test.tsx` drives the sheet through the editor rather than in isolation, because §8.1's sheet is defined by what it does to the thing behind it; `e2e/s2-sheet.spec.ts` carries the four properties only a layout engine settles — 88% of the viewport, a backdrop that really dims, a scroll that a wheel gesture really cannot move, and a band that really transitions over 200 ms.

**Two open readings, both taken with the user.**

**The header carries both day totals**, not one. §8.1 asks for "the activity's current computed total" and argues from occlusion — the number stands in for the band the participant cannot see. But a section's screens capture both day types at once ("On a workday" beside "On a weekend day"), so a single figure would sit still while half the controls moved. Both are shown, live, in the toggle's own idiom (§7.1: both segments show their own day's hours whether selected or not). Rejected: the weekly figure, which every field moves but which corresponds to no band and appears nowhere else in the editor.

**A gated-out section's sheet shows its gate alone**, and reveals the rest of the section in the same sheet the moment the gate is answered truthy. §7.7 promises the row opens "prefilled — including the gate, set to its falsy value" and that "answering the gate truthy, **or entering non-zero hours**, moves the activity into the stack"; the second clause is direct entry, which every sheet carries at its bottom. Rejected: showing every screen under a falsy gate, which offers fields that derive to zero for as long as the gate says no. Reachability is recomputed from the answer map on every render (§4.2.1), so the reveal needs no second code path.

**Four things decided in the building.**

**The stack is frozen while the sheet is up.** Derivation is live, so without a freeze a band has already moved behind the sheet and AC 24 has nothing left to animate on close. The editor snapshots the activities at open, renders that snapshot for as long as the sheet occludes it, and releases it on close with the 200 ms transition on. That is also what carries §7.7's arrival from Not included: the newcomer is laid out in the frozen frame at zero height, so it grows into place instead of appearing on top of the neighbours still sliding down. `Stack` gains `settling` and `emerging` for exactly this, both defaulting off, and the transition is scoped to the settle — a standing one would make §7.1's day-type switch a slide, where the spec says selecting a day changes which stack renders "and nothing else".

**Direct entry joins the persisted record.** §5's list of what a refresh must not cost predates the sheet and does not name the overrides, but its reason covers them: a value the participant typed is work they did. `PersistedState.authored` holds it, guarded on parse so a corrupt map costs the overrides rather than putting a `NaN` into every total, and cleared on a pack-version change for the same reason answers are pruned there. Hours for a *derived* activity stay out of storage, per §3.2's invariant.

**Taking an activity over clamps the value it starts from.** "Set directly" seeds both day types from what the activity currently derives to, and that seed is clamped like any other direct value (§8.2) — so an activity already under its floor comes *up* to it the moment the participant takes it over. A participant sleeping 23:30 to 05:00 derives 5.5 h; tapping Set directly moves them to 6. The alternative is a `direct` value that violates the constraint the sheet exists to enforce, which is worse; the jump is silent and logged as `clamp.hit`, exactly as §8.2 asks.

**§10's events reach a seam, not a queue.** Step 5.3 requires each clamp to emit `clamp.hit`, and an event not emitted at its moment cannot be recovered afterwards from any amount of state — so `clamp.hit`, `mode.direct`, `hours.change`, `sheet.open` and `sheet.close` are emitted where they happen, through an `onEvent` prop on the provider. Batching, retry and delivery stay Stage 10's (step 10.2), which is where the sink is filled in. `mode.direct` fires only on the transition into `direct`: §10 reads cut order off `hours.change`, and one per press would say the participant took the activity off the estimator ten times.

**No copy key was added.** The sheet's own chrome is `sheet.setDirect`, `sheet.done` and `unit.hours`, all already in §9's table or in Stage 3's additions; the header's day labels and hour figures reuse `toggle.wd`, `toggle.we` and `toggle.hours`, which are the same two words for the same two day types the toggle behind the sheet is showing. §9's rule is that no string is hardcoded, not that every surface owns a private copy of one.

---

## Stage 6 — Stage machine: Finish, hold, force-advance

- [ ] **6.1 Stage machine** (§2.2) — S1 → S2 → S3 → S4 → S5, with S2 re-enterable from itself on band replay and S3 → S4 one-way. Furthest stage reached is persisted, and is what a refresh resumes to.
  *AC: none directly (asserted in 6.2–6.5)*

- [ ] **6.2 Finish → ready** (§6.1, §6.3) — Finish snapshots the schedule, POSTs `/ready`, and enters S3. It marks the participant ready; it does **not** advance the stage. Stage advance is the facilitator's flag, never a participant action.
  *AC: 32*

- [ ] **6.3 Hold screen** (§9, §6.3) — `s3.title` plus `s3.lines[]` cycling, four or more, plausible and dull: a joke here signals the wait is theatre and the pause stops working. Minimum 5 s in **every** path, including when the flag is already true when the participant finishes. A refresh during S3 restarts the floor.
  *AC: 33*

- [ ] **6.4 Silent polling** (§6.3) — poll at 3 s ± 500 ms jitter throughout S3. On failure, keep polling and show nothing: a connection warning on the hold screen reads as a broken app. This is deliberately the opposite of the console rule in §6.2.3.
  *AC: 34*

- [ ] **6.5 Force-advance** (§6.3, §4.2.1 rule 6, §4.6) — a participant still in S1 or S2 when the flag flips has their current schedule snapshotted and `/ready` POSTed, then enters S3 for the full 5 s hold. Unanswered gates resolve **truthy** and unanswered sections derive from field defaults, so a participant pulled forward from question 2 reaches S4 with a full stack of pack-default hours rather than a hollow one. Emit `forced.advance`.
  *AC: 35, 36*

**Stage 6 done when:** all three §6.3 entry paths reach S4 with the 5 s floor intact, a force-advance from a fully unanswered S1 produces a full stack, and a refresh at each stage resumes correctly against one session row.

---

## Stage 7 — S4 reveal, school, overflow, completion

- [ ] **7.1 Reveal** (§9, §2.2, §7.1) — `s4.reveal.title` / `s4.reveal.body` deliver the StartSchool ask. Entry to S4 forces the day-type selection to `wd` — the only stage transition that touches view state — because school is workday-only and a participant sitting on the weekend segment would experience the reveal as nothing happening. The toggle stays operable immediately afterwards.
  *AC: 37*

- [ ] **7.2 School activity** (§3.3, §8.3) — inserted at S4 only, at `order: 0`, above sleep at the top of the stack. Weekly minimum 20 h across 5 workdays = 4 h/workday; adjustable upward only in 5 h weekly increments (25 → 5 h/day, 30 → 6 h/day); decrement disabled at 20; zero on weekend days, so the weekend stack is unaffected by the reveal. `locked` is true.
  *AC: 38, 39*

- [ ] **7.3 School sheet** (§8.3) — the weekly stepper and nothing else. It carries none of the questionnaire.
  *AC: 40*

- [ ] **7.4 Overflow rendering** (§7.6) — the 24 h line is an absolutely positioned rule at `24 × pxPerHour` with **one appearance**, identical before and after breach: it is a rim, not an alert. Everything below it carries a 45° red stripe overlay at 6 px period, implemented as one clipped overlay over the stack rather than per band, so a band straddling the line is striped only on its lower portion.
  *AC: 41*

- [ ] **7.5 Overflow silence** (§7.6) — no over-by text, no toast, no error message, and no count of the excess, anywhere in the client. The toggle segment's bold red occupied-hours figure (step 4.2) is the sole numeric signal, and it never states the excess.
  *AC: 42*

- [ ] **7.6 Rebalance and completion** (§8.4, §3.4) — stripes vanish and confirm enables when `fits()` is true on **both** day types. No auto-advance on `fits()`: a participant who lands under 24 by accident gets to look at what they did, and may keep adjusting before confirming. Confirm POSTs `/complete` and enters S5. Emit `fits` at the transition.
  *AC: 43*

- [ ] **7.7 The two edge outcomes** (§8.3, §8.4, §11) — a weekend already over 24 at S1 arrives at S4 with `fits()` false for a cause the forced workday view does not show; the red weekend segment plus the live toggle are what carry it, and both are required or confirm sits disabled with nothing on screen naming why. Separately, a participant with ≥4 h of workday slack has Unallocated absorb school entirely: no stripes, confirm enabled on entry, cut order empty. That is a valid outcome and a real finding — do not manufacture a breach.
  *AC: 44, 45*

**Stage 7 done when:** a breaching participant can rebalance to fit and confirm; a weekend-breaching participant can find and fix the cause; a slack-rich participant completes without ever seeing a stripe.

---

## Stage 8 — Facilitator console

Strings are hardcoded (§9): this is operator tooling for one known person, and no `fac.*` keys exist in the pack.

- [ ] **8.1 Route and layout** (§6.2, §6.2.1) — `/facilitate/:roomId`, laptop-first at desk width, holding down to 375 px with no horizontal scroll so the stage can be opened from a phone while walking the room. One responsive screen, not a second build. Reloading is safe at any moment and restores the same screen from the next poll.
  *AC: 56, 58*

- [ ] **8.2 Status poll and screen** (§6.2.2, §6.2.3) — `GET /room/:roomId/status` every 3 s → `{ total, ready, stageOpen, joinCode, inStage }`. Four elements, top to bottom: the join code, large and always visible, so a latecomer can be read the code without leaving the screen; `ready / total` in the largest type on the page; the five `inStage` counts, which sum to `total` and distinguish a straggler on question 2 from one on question 19; the button. Values swap on the poll with **no transition animation** — a count that tweens is a count that can be misread mid-flight. The console holds no local state.
  *AC: 50, 51*

- [ ] **8.3 Poll failure** (§6.2.3) — last known values stay on screen, dimmed, with a small reconnecting note. Deliberately the opposite of step 6.4: a stale hold screen worries a participant for nothing, but a stale console misleads someone about to make a decision from the numbers on it.
  *AC: 52*

- [ ] **8.4 Arming button** (§6.2.4) — Idle → Armed → POST. The armed label restates **`total`**, not `ready`, because the flag force-advances the whole room and a press at 3/40 should look wrong at the moment of confirming it. Armed reverts to Idle after 5 s without a second press. Enabled as soon as the room has one participant, and never gated on a ready threshold: waiting is a facilitation judgement, and a console that refuses to open the stage at 3/40 is wrong about who is running the room.
  *AC: 53*

- [ ] **8.5 Flip outcomes** (§6.2.4, §6.2.2) — `POST /room/:roomId/stage { open: true }` is idempotent; a second call on an open room is a no-op returning ok. Success replaces the button with a static **Stage open** state that cannot be pressed again — S3 → S4 is one-way and there is nothing to press twice. Failure returns to Idle with an inline error, never to a state implying the stage opened.
  *AC: 54, 55*

- [ ] **8.6 `stage.open` record** (§6.2.5) — written server-side once, when the flag flips, carrying `{ roomId, t, ready, total }`. No client involvement, and the §10 participant event union is unchanged. This is the room's `t = 0` for *time to fit, room*; without it that moment can only be inferred from the earliest `forced.advance` in the room, which does not exist if everyone had already finished.
  *AC: 57*

**Stage 8 done when:** the console drives a real room end to end from a laptop and from a 375 px phone, survives a reload and a dropped poll, and writes exactly one `stage.open` row.

---

## Stage 9 — Household estimator fit (independent)

Build tooling per §4.3: nothing in `estimators/` reaches the client. May run in parallel any time after Stage 1; until it lands, the pack carries the placeholder coefficients from step 1.6.

- [ ] **9.1 Environment** — install pandas, numpy, and statsmodels into the existing `.venv` (Python 3.14, currently pip-only). Pin in `estimators/requirements.txt`.

- [ ] **9.2 Load the extract** — `datasets/household/atusact-0325/atusact_0325.dat` and `atusresp-0325/atusresp_0325.dat` are comma-delimited with header rows. Join on `TUCASEID`. The codebook is `atusintcodebk0325.pdf`; the accompanying `.do` / `.sas` files carry the variable definitions.

- [ ] **9.3 Build the target** — sum `TUACTDUR24` over household activity codes (tier 1 = 02, per the codebook) per respondent-day, convert to hours, and split by day type from the diary day: `wd` for Monday–Friday, `we` for Saturday–Sunday. ATUS gives one diary day per respondent, so `wd` and `we` are two models fitted over two disjoint subsamples, not one model with a day term.

- [ ] **9.4 Features** — restricted to inputs the questionnaire can actually ask, because §4.3 rule 1 makes the estimator a pure function of the answer map. Household size, presence and count of children, employment status, partner presence. Every feature maps to a declared `field.id` in the pack, and every one of those fields carries a default (§4.6).

- [ ] **9.5 Fit and export** — a linear model per day type, weighted by the ATUS final weight. Export coefficients to `packs/v1/estimators/household.v1.json` in the shape `lib/estimators/household.v1` evaluates. Record R², residual spread, and the fallback default per day type — the fallback is what §4.3 rule 3 hands a participant, so it should be the weighted mean, not a guess.

- [ ] **9.6 Wire and verify** — replace the placeholder coefficients, confirm the pack still validates, and check the estimator against held-out rows. If the model does not reduce to a closed form, §4.3 says that is a reason to reconsider the model before reconsidering the bundled path — escalate rather than reaching for `POST /estimate`.

**Stage 9 done when:** `python estimators/household.py` reproduces the coefficient file from the extract, the client derives household hours from it with no network call, and a forced throw still lands on `fallback` and recovers.

---

## Stage 10 — Telemetry, snapshots, debrief

Per §10: *"Everything else in this document exists to produce per-activity delta and cut order. If a build decision trades against those two fields, the fields win."*

- [ ] **10.1 Event emission** (§10) — every member of the `EventType` union emitted at its moment: `screen.view`, `field.answer`, `field.revise`, `stage.enter`, `finish`, `forced.advance`, `sheet.open`, `sheet.close`, `hours.change`, `mode.direct`, `clamp.hit`, `estimator.fallback`, `fits`, `complete`. `hours.change` carries `from` and `to`, which is what makes cut order reconstructible. Moving an activity to Not included at S4 logs `hours.change` with `to: 0`, so it appears in cut order like any other reduction (§7.7).
  *AC: 47 (with 10.3)*

- [ ] **10.2 Queue and delivery** (§6.1, §11) — batched, fire-and-forget, retried with the next batch on failure. Never blocks the UI. Flushed on `/complete`.
  *AC: none directly*

- [ ] **10.3 Snapshots** (§10) — three: end of S1, at Finish (pre-reveal), and at complete (post-rebalance). `slack at finish` is `remaining('wd')` in the finish snapshot and must be recoverable from it without replaying events.
  *AC: 46, 47*

- [ ] **10.4 Both times to fit** (§10, §6.2.5) — *time to fit* is `fits` minus that participant's S4 entry; *time to fit, room* is `fits` minus the room's `stage.open`. For anyone force-advanced they differ by the 5 s hold plus their snapshot. Both are stored under distinct names; one name for both is explicitly forbidden. The first compares rebalance effort between participants; the second plots how the room moved after the flag flipped.
  *AC: 48*

- [ ] **10.5 Debrief derivation script** (§10) — reads the event log and snapshots for a room and emits the derived table: per-activity delta, cut order, first cut, sheet opens per activity during rebalance, sleep floor hit, school above minimum, both times to fit, slack at finish, no-squeeze. Output annotates first cut with slack at finish, because Unallocated absorbs school silently and a debrief quoting first cut alone may be quoting a participant who already gave up two hours without making a decision about it.
  *AC: none directly (consumes 10.1–10.4)*

**Stage 10 done when:** a full simulated room produces a debrief table in which cut order is reconstructible for every completing participant and both times to fit are present and distinct.

---

## Stage 11 — Edge cases, resilience, acceptance sweep

- [ ] **11.1 §11 table** — each row driven and verified: answers summing over 24 h at S1 allowed with no validation and the editor opening already striped; a mid-session joiner running S1 → S2 → S3 → S4 without skipping a stage; refresh at every stage; refresh during S3 restarting the floor; pack fetch failing through three backed-off retries, then last-good cache, then a hard error screen with a reload control; estimator throw; telemetry POST failure; stage poll failure; viewport under 320 px; landscape; every activity zeroed.

- [ ] **11.2 Accessibility** — greyscale usability (§7.5: colour is orientation, the label is identification), focus order and trap in the sheet, `prefers-reduced-motion` honoured on the 200 ms band animation, 44 px targets throughout, alt text present on all media.

- [ ] **11.3 Copy audit** (§9) — every string in the participant client comes from the pack and none is hardcoded; the register holds; no question copy implies a norm, benchmark, comparison, or expectation, including in screen time, sleep, and leisure.
  *AC: 5 (re-verified)*

- [ ] **11.4 Full 58-criterion sweep** — walk §12 top to bottom against a real device and a real room. Every criterion checked, with the two visual judgements (19, 41) recorded as screenshots.

- [ ] **11.5 Workshop dry run** — one facilitator, five to ten phones, end to end: room creation, join by code, questionnaire, finish, hold, flag, reveal, rebalance, complete, debrief output.
  Run over the LAN path (12.2), not a public hostname — 12.3 is this step. Acceptance does not wait on Stage 13.

**Stage 11 done when:** all 58 criteria pass and the dry run produces a usable debrief.

---

## Stage 12 — Rehearsal without deployment (independent)

Runs any time after Stage 8, and **gates 11.5**. The point is that nothing about the system's correctness should depend on a DNS record existing. A full room — facilitator, many participants, every stage, a real debrief — is provable on one machine with no domain, no tunnel, and no internet connection at all.

This is also the venue contingency. If the tunnel, the ISP, or the venue wifi fails on the day, 12.2 is the workshop running anyway off a laptop hotspot.

- [ ] **12.1 Simulated room, headless** — a Playwright spec driving one facilitator context and N participant contexts against a single dev server: join by code, S1, finish, hold, flag, force-advance, reveal, rebalance, complete. Runs in CI with N high enough to exercise the console's ready-count and poll behaviour (§6.2, 8.2). This is the repeatable version of 11.5 — it catches stage-machine and concurrency regressions on every change, where a phone rehearsal catches them once.
  *AC: none (proves 32\u201336, 50\u201355 without devices)*

- [ ] **12.2 LAN serving mode** — the same production build bound to `0.0.0.0` with an inbound firewall rule on the port, reachable from phones on the same wifi at `http://<lan-ip>:<port>`. The bind address is environment-driven, not hardcoded: rehearsal binds the LAN, 13.1 binds `127.0.0.1`. Plain HTTP is sufficient for v1 because nothing in the client needs a secure context — no camera, no service worker, and `localStorage` (§`lib/store`) works over HTTP. **If a later change introduces a secure-context API, this path needs TLS and this step is revisited**, via a local Caddy with a DNS-01 certificate rather than a self-signed one no phone will trust.
  *AC: none (enabling)*

- [ ] **12.3 Multi-phone LAN dry run** — 11.5's rehearsal, run over 12.2: one facilitator laptop, five to ten real phones on shared wifi or a laptop hotspot, end to end through the debrief. Real devices are what surface the criteria a headless run cannot — 16 and 58's viewports, tap targets, the ruler over live hues (4.4), and mobile URL-bar resize (4.3).
  *AC: closes the device half of 11.5*

- [ ] **12.4 Rehearsal data isolation** — rehearsals point at a separate SQLite file via the same documented env var as 13.1, so practice rooms never land in a real workshop's tables or pollute a debrief. Verified by checking that a rehearsal leaves the production file's `rooms` count unchanged.
  *AC: none (protects 46\u201348)*

**Stage 12 done when:** a full room completes headless with N simulated participants, and once from real phones over LAN against a rehearsal database — both with no DNS record, no tunnel, and no public hostname in existence.

---

## Stage 13 — Public deployment (last)

Runs last. Nothing depends on it: Stage 12 has already proven the room end to end from real devices, so this stage only makes a working system reachable from outside the building. Re-run 12.1 against the public hostname once it is up.

The app self-hosts on a machine the facilitator controls, fronted by a Cloudflare Tunnel on `hours.ced-global.com`. SQLite on a local file is what forces this: a serverless target has no persistent disk for `better-sqlite3` to write to. The consequence — the machine is a single point of failure for a live workshop — is what 13.4 and 13.5 exist to contain.

**Zone facts as of 2026-08-24**, established before choosing this route:

| Record | Points at | Status |
|---|---|---|
| NS | `dns1/dns2.registrar-servers.com` (Namecheap BasicDNS) | unchanged |
| apex, `www` | Vercel (`216.198.79.1`, `*.vercel-dns-017.com`) — the marketing site | unchanged |
| MX | Zoho (`mx.zoho.eu`, `mx2`, `mx3`) — company mail | unchanged |
| TXT | 3 records (SPF, Zoho verification, DKIM) | unchanged |

A full nameserver move to Cloudflare is rejected: it would drag company mail's MX and SPF/DKIM records through a migration, where one missed TXT record fails mail silently. Delegating one unused subdomain touches none of it, and rolls back by deleting two records.

- [ ] **13.1 Production process** — `next build && next start` behind an explicit `PORT`, bound to `127.0.0.1` and not `0.0.0.0`, so the tunnel is the only path in and the app is not exposed on venue wifi. `better-sqlite3` is a native module: pin the Node version and confirm it loads against the production build, not just the dev server. The database file lives outside `.next/` and outside the repo, at a documented absolute path, so a rebuild or a `git clean` cannot delete a workshop's data. WAL stays on (0.3).
  *AC: none (operational)*

- [ ] **13.2 Subdomain delegation** — `hours.ced-global.com` added to Cloudflare as its own zone (free plan), then two `NS` records at Namecheap on host `hours` pointing at the two Cloudflare nameservers it issues. Verify with `nslookup -type=NS hours.ced-global.com` before continuing, and re-verify that apex, `www`, and MX still resolve exactly as tabled above. If the subdomain zone is plan-gated at signup, the fallback is a small VPS running Caddy with a WireGuard tunnel home and a single `hours` A record at Namecheap — same isolation, no delegation.
  *AC: none (operational)*

- [ ] **13.3 Cloudflare Tunnel** — `cloudflared` installed on the host, `tunnel create`, `tunnel route dns` for `hours.ced-global.com`, and an ingress mapping that hostname to `http://localhost:<PORT>` with a `http_status:404` catch-all. Installed as a Windows service so it comes back after a reboot. TLS terminates at Cloudflare; no router port is forwarded and the home IP is never published. Polling (RD-2, 8.2) needs no tunnel-side configuration — there are no WebSockets in v1.
  *AC: none (operational)*

- [ ] **13.4 Host readiness** — sleep and hibernate disabled on AC power (`powercfg /change standby-timeout-ac 0`) and lid-close set to do nothing. A sleeping laptop takes the whole room down mid-session and is the realistic failure mode here, ahead of anything network-side. Checked as part of the pre-session routine, not once.
  *AC: none (operational)*

- [ ] **13.5 Backup and restart runbook** — a short written procedure covering: copy the SQLite file before and after every session; restart the app and the tunnel; and what a facilitator does if the host dies mid-room. Because one file holds every room, session, snapshot, and event, restore time matters more than any hardening. The runbook is the deliverable, not a script.
  *AC: none (operational)*

- [ ] **13.6 Public smoke test** — from a phone on mobile data, not the venue wifi: reach `https://hours.ced-global.com`, join by code, run S1 through the reveal, and confirm the certificate is valid and no mixed-content or absolute-`localhost` URL leaks into a response. Re-run immediately before any workshop run on the public hostname.
  *AC: none (operational)*

**Stage 13 done when:** `hours.ced-global.com` serves the production build over a valid certificate from an off-network device, the tunnel and app both survive a host reboot unattended, apex/`www`/MX resolve unchanged, and the runbook has been followed once from a cold start.

---

## Coverage

Every §12 criterion, and the step that closes it.

| AC | Step | AC | Step | AC | Step |
|---|---|---|---|---|---|
| 1 | 3.1, 3.3 | 21 | 4.5 | 41 | 7.4 |
| 2 | 3.1 | 22 | 4.5 | 42 | 7.5 |
| 3 | 3.2 | 23 | 5.2 | 43 | 7.6 |
| 4 | 3.2 | 24 | 5.1 | 44 | 7.7 |
| 5 | 1.6, 11.3 | 25 | 5.3 | 45 | 7.7 |
| 6 | 1.1, 3.6 | 26 | 5.4 | 46 | 10.3 |
| 7 | 3.3 | 27 | 1.3 | 47 | 10.1, 10.3 |
| 8 | 3.4 | 28 | 4.7 | 48 | 10.4 |
| 9 | 3.5 | 29 | 4.7 | 49 | 2.1, 2.2 |
| 10 | 3.5 | 30 | 5.5 | 50 | 8.2 |
| 11 | 4.1 | 31 | 4.7 | 51 | 8.2 |
| 12 | 4.1 | 32 | 6.2 | 52 | 8.3 |
| 13 | 4.2 | 33 | 6.3 | 53 | 8.4 |
| 14 | 4.1 | 34 | 6.4 | 54 | 8.5 |
| 15 | 4.1 | 35 | 6.5 | 55 | 8.5 |
| 16 | 4.3 | 36 | 1.1, 2.6, 6.5 | 56 | 8.1 |
| 17 | 4.3 | 37 | 7.1 | 57 | 8.6 |
| 18 | 4.4 | 38 | 7.2 | 58 | 8.1 |
| 19 | 4.4 | 39 | 7.2 | | |
| 20 | 1.5, 4.3 | 40 | 7.3 | | |

---

## Risks

| Risk | Where | Mitigation |
|---|---|---|
| White ticks fail against the light end of the hue ring (RD-1) | 4.4 | The live risk the no-scrim decision accepts. Tested against all ten hues inside Stage 4, not at the acceptance sweep. A failure is a colour decision for the user, not a rebuild and not a quiet return of the plate. |
| A `roomId` reaches a participant by another route (RD-2) | 2.2, 2.3 | The decision removes it from `POST /session`; the standing risk is it leaking back in via a telemetry payload or an error body. Asserted absent in the session-creation test. |
| Venue wifi during the reveal | 6.4, 8.3 | Bundled estimators mean no network call inside the questionnaire (§4.3). Polling is jittered; failures are silent participant-side and loud console-side. If the venue network or the tunnel fails outright, 12.2 runs the whole workshop off a laptop hotspot with no internet at all. |
| Household model will not reduce to a closed form | 9.6 | §4.3 is explicit: reconsider the model before reconsidering the bundled path. Escalate rather than adding `POST /estimate`. |
| `pxPerHour` thrash on mobile URL-bar resize | 4.3 | Compute from a stable viewport unit (`dvh`) and debounce resize; a stack that jumps on scroll reads as broken. |
| Cut order polluted by intermediate stepper values | 10.1 | Emit `hours.change` on commit, not on every stepper tick, so one 8→5 adjustment is one cut and not three. |
| Host machine sleeps, reboots, or dies mid-room | 13.4, 13.5, 12.2 | The cost of local hosting, accepted knowingly. Sleep disabled on AC and lid-close neutered as a pre-session check; the runbook makes restart-and-restore a 30-second operation rather than an improvisation. |
| One SQLite file holds every room's data | 13.1, 13.5, 12.4 | Path documented and kept outside the repo and `.next/`, so no rebuild or `git clean` can take it. Copied before and after every session. |
| Subdomain delegation disturbs the live marketing site or company mail | 13.2 | Two `NS` records on an unused host; apex, `www` (Vercel) and MX (Zoho) are never edited. Re-verified by lookup after delegation, and rolled back by deleting the two records. |
