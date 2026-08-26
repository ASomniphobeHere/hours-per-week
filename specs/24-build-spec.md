# 24 — Build Specification

**Product:** a phone-first time-budget exercise for facilitated workshops.
**Version:** 1.3 — build spec
**Status of content:** the question list and the estimator models are *not* in this document. They are content, loaded as data, and are specified in §4 as interfaces. This document specifies the system that consumes them. A build is complete and testable with placeholder content.

### Changes in 1.3

The S4 reveal becomes two screens, and the school stepper gains a top. Both are specified in place; this list exists so a reader of 1.2 knows what moved.

| # | Was | Now | Where |
|---|---|---|---|
| 14 | §7.1 and §8.3 delivered the ask and the stack in one screen, and the weekly stepper appeared only in the sheet | The reveal is two screens — the commitment, then the pace: stepper, per-workday figure, and the outcome at the level set. The same three-part control is what the sheet carries | §1, §2.2, §7.1, §8.3, §9, §12 |
| 15 | School was "adjustable upward only" with no maximum | Ceiling of 40 h/week = 8 h/workday; the increment control disables at 40 exactly as the decrement disables at 20 | §8.2, §8.3, §11, §12 AC 39 |

AC 37, 39 and 40 keep their numbers and their subjects; 37a and 39a are added on the §7.9 precedent, so nothing renumbers.

**Known consequence, accepted (14).** The pace is chosen before its cost is visible. That is the intent — a pace picked in front of a striped stack is a pace picked to clear the stripes — but it means some participants commit to 40 h and retreat under the breach. That retreat is a finding, not a failure of the screen, and §10 now records the pace twice so it survives into the debrief instead of being flattened into one figure read at complete.

**Known consequence, accepted (14, second).** The outcome ladder is the only place in the participant client that states an expectation of any kind. §9 forbids norms and benchmarks in *question* copy, and the ladder is not question copy: it describes what the programme returns at a pace, never what the participant's week is like and never what anyone else chose. The distinction is load-bearing, and any rewrite of those five strings has to keep it.

### Changes in 1.2

Two places where 1.1 contradicted itself, resolved. Both are specified in place; this list exists so a reader of 1.1 knows what moved.

| # | Was | Now | Where |
|---|---|---|---|
| 12 | §7.3 put each tick number on a translucent scrim; a later note removed it | No scrim. Exact ticks, numbers standing alone, white for now | §7.3, §12 AC 19 |
| 13 | §6.1 returned `roomId` to every participant; §6.2.1 forbade it | `roomId` is facilitator-only; participants poll `GET /session/:id/stage` | §6.1, §6.2.1 |

The criteria count is unchanged at 58. AC 19 keeps its number and its subject; only its test moved, from "sits on a scrim and is legible" to "is legible".

**Known consequence, accepted (12).** §7.3's own argument was that no single ruler colour holds contrast against ten arbitrary hues at full saturation. Removing the plate reinstates exactly that risk, and white is exactly such a colour. It is accepted on the strength of the cleaner mark, and the tick colour is deliberately left open. If white fails against the light end of the hue ring, the answer is a colour, not the plate returning.

**Known consequence, accepted (13).** The stage poll is now cacheable per session rather than per room — forty entries in a forty-phone room instead of one. That is the price of §6.2.6 meaning what it says.

---

### Changes in 1.1

Eleven decisions the 1.0 draft left open or contradicted, resolved. Each is now specified in place; this list exists so a reader of 1.0 knows what moved.

| # | Was | Now | Where |
|---|---|---|---|
| 1 | "The stack", singular — no way to reach the weekend | Day-type toggle, one stack at a time | §7.1 *(new)* |
| 2 | S4 view unspecified | S4 forces `wd`, toggle stays live | §7.1, §2.2, §8.3 |
| 3 | Day total absent from the spec | In the toggle segments, per day, occupied hours | §7.1 |
| 4 | "The stripes are the entire signal" | Breached segment's count goes bold red; stripes carry the rest | §7.6 |
| 5 | Even hue ring **and** ≥40° apart — unsatisfiable at ten activities | Even ring, floor is 36° | §7.5, §4.6 |
| 6 | Ruler "in a colour that holds contrast" | Translucent scrim behind each tick | §7.3 |
| 7 | Estimator failure pinned an activity to `direct` forever | New `fallback` mode, recoverable; `direct` stays permanent | §3.2, §4.3, §4.4 |
| 8 | Rule 6 promised a full stack, derivation delivered zeros | Field defaults required in gated sections | §4.6, §4.4 |
| 9 | Token persistence unstated; refresh could mint a session | `sessionId` + `token` persisted with the answers | §5, §11 |
| 10 | *Time to fit* meant two different things | Two fields, named apart, both recorded | §10, §6.2.5 |
| 11 | Nothing covered school fitting inside existing slack | Valid outcome, specified, read against slack at finish | §8.4, §10, §11 |

Section 7 subsections renumbered by one to make room for §7.1. Acceptance criteria renumbered; there are now 58.

**Known consequence, accepted:** Unallocated absorbs school before any band does and emits no event, so the first *logged* cut is not the first real loss for any participant who had slack. Decision 11 accepts this rather than synthesising an event. §10 says how the debrief should read around it.

---

## 1. What the participant does

A participant opens the app on their phone in a workshop room. They answer a questionnaire about their week. The system turns those answers into a schedule — a day rendered as a vertical stack of activity bands filling a 24-hour container, with a toggle above it for the two day types the week is made of: a workday and a weekend day. They review it, correct anything wrong by tapping bands and re-answering, and press Finish.

They then wait on a loader while the rest of the room finishes. When the facilitator opens the next stage, every participant sees the same thing at the same moment: they forgot StartSchool, which requires a minimum of 20 hours per week. On a second screen they choose how much of their week to give it — 20 to 40 hours, each level stating what the programme returns at that pace — before any of it is drawn against their day. Then the school band appears at the top of their stack and the stack no longer fits: everything below the 24-hour line is struck through with red diagonal stripes.

They rebalance until the stripes are gone. What they cut, and in what order, is the output of the exercise.

---

## 2. System architecture

### 2.1 Components

| Component | Responsibility |
|---|---|
| Client (web, mobile-first) | Questionnaire, editor, loader, reveal, rebalance |
| Content pack | Question bank + estimator definitions, versioned, fetched at session start |
| Session API | Session creation, stage flag polling, ready marking, telemetry ingest |
| Facilitator console | Ready count, stage breakdown, stage flag toggle (§6.2) |

The client is a single-page app. There is no per-participant server state beyond a session row and a telemetry log; the schedule lives in the client and is uploaded at checkpoints.

### 2.2 Stage machine

```
S1 questionnaire ──Finish──> S3 hold ──flag──> S4 reveal
       │                        ▲                  │
       └──> S2 editor ──────────┘                  └──> S5 done
              ▲   │
              └───┘  (band tap → replay questions)
```

| Stage | Advance condition | Server-authoritative |
|---|---|---|
| S1 questionnaire | All screens answered | No |
| S2 editor | Participant presses Finish | No |
| S3 hold | `stage_open == true` **and** ≥5 s elapsed in S3 | Yes |
| S4 reveal + rebalance | `fits() == true` on **both** day types, and participant confirms | No |
| S5 done | — | — |

S2 is re-enterable from itself (band replay). S3 → S4 is one-way. A participant who is still in S1 or S2 when the flag flips is force-advanced (§6.3).

S4 opens on two screens before the stack — the commitment and the pace (§8.3) — and the participant reaches the striped stack only after committing to a weekly figure.

Entry to S4 forces the day-type selection to `wd` (§7.1); it is the only stage transition that touches view state.

---

## 3. Domain model

### 3.1 Day types

Exactly two: `wd` (workday) and `we` (weekend day). Weekend day count is fixed at **2**; workday count is fixed at **5**. Not configurable in v1.

```
weekly(activity) = hours(activity,'wd') × 5 + hours(activity,'we') × 2
```

### 3.2 Activity

```ts
type DayType = 'wd' | 'we';

interface DayValue {
  mode: 'derived' | 'direct' | 'fallback';
  hours: number;          // authoritative when mode !== 'derived'
  // when mode === 'derived', hours is recomputed from answers via §4.3
}

interface Activity {
  id: string;             // stable, matches a questionnaire section id
  label: string;
  hue: number;            // 0–360, see §7.5
  order: number;          // ascending = top to bottom
  wd: DayValue;
  we: DayValue;
  locked: boolean;        // school only
  constraint?: Constraint;
}

interface Constraint {
  minWeekly?: number;     // school: 20
  maxWeekly?: number;     // school: 40
  minDaily?: number;      // sleep: 6
  stepWeekly?: number;    // school: 5
  weekendAllowed: boolean;// school: false
}
```

**Invariant:** `hours` for a derived activity is never stored as source of truth. It is recomputed from the answer map on every read. This is what makes question replay safe — editing one answer cannot leave a stale total anywhere in the system.

### 3.3 Fixed activity set (v1)

| id | label | order | Notes |
|---|---|---|---|
| `school` | StartSchool | 0 | Inserted at S4 only. Top of stack, above sleep. |
| `sleep` | Sleep | 1 | Min 6 h per day |
| `work` | Work | 2 | |
| `commute` | Commute | 3 | |
| `eating` | Eating | 4 | |
| `household` | Household | 5 | Estimator-backed |
| `care` | Care | 6 | Gated; estimator-backed |
| `hygiene` | Personal care | 7 | |
| `admin` | Admin & errands | 8 | |
| `leisure` | Leisure | 9 | **Editable activity, not a residual** |
| `—` | Unallocated | last | Rendered as remainder; not an Activity |

`leisure` is a real activity with its own questions and its own band. `Unallocated` is the arithmetic remainder `24 − Σ hours` and is rendered as a dashed band with no tap target. An activity at zero hours is not a band at all — see §7.7.

The set is defined in the content pack, not hardcoded. The order column is authoritative for rendering, and for hue assignment: ten activities give an even ring at 36°, each activity taking the hue at its `order` index (§7.5).

### 3.4 Derived state

```ts
total(dayType)   = Σ activity.hours(dayType)
remaining(dt)    = 24 - total(dt)
overflow(dt)     = max(0, total(dt) - 24)
fits()           = overflow('wd') === 0 && overflow('we') === 0
```

`fits()` is the S4 completion condition. `remaining` may be negative; nothing clamps it.

---

## 4. Content layer (extension point)

The question bank and the estimators are content. They ship as a versioned pack fetched at session start, and can be replaced without a client release.

### 4.1 Pack shape

```ts
interface ContentPack {
  version: string;
  activities: ActivityDef[];      // §3.3 table, as data
  screens: Screen[];              // questionnaire, ordered
  estimators: EstimatorDef[];
  copy: Record<string, string>;   // §9
}
```

### 4.2 Screens and fields

A **screen** is one page of the questionnaire. It belongs to a section (= activity id) and holds **one or more fields**. Multiple fields per screen is the normal case, not an exception — e.g. wake time on workdays and wake time on weekend days sit on one screen.

```ts
interface Screen {
  id: string;
  sectionId: string;          // activity id this screen contributes to
  prompt: string;             // copy key
  note?: string;              // copy key, secondary line
  media?: Media[];            // 0–2 images, see §4.5
  fields: Field[];            // 1..n
}

interface Field {
  id: string;                 // stable answer key, e.g. "sleep.wake.wd"
  label: string;              // copy key
  type: 'count' | 'duration' | 'clock' | 'number' | 'choice' | 'multichoice';
  dayType?: DayType;          // when the field is day-scoped
  unit?: 'minutes' | 'hours' | 'times' | 'clock';
  min?: number; max?: number; step?: number;
  options?: { id: string; label: string }[];
  required: boolean;
  default?: unknown;
}
```

### 4.2.1 Branching

Branching exists, but only in one shape: a **gate** at the head of a section can skip the rest of that section.

```ts
interface Screen {
  // ...as above
  gate?: true;                // this screen gates its section
}

interface ActivityDef {
  // ...
  gateField?: string;         // field id whose falsy value skips the section
}
```

**Rules — these bound the entire branching surface:**

1. A gate is a single boolean or choice field on the first screen of a section.
2. A falsy gate answer skips **every remaining screen in that section, and only that section.** A gate never affects another section.
3. Gates are the only branching mechanism. No screen-level `showIf`, no field-level conditionals, no cross-section dependencies, no reordering.
4. A skipped section's activity resolves to zero hours and lands in **Not included** (§7.7).
5. Re-answering a gate to truthy in replay reveals the section's remaining screens at their defaults, unanswered. Re-answering to falsy hides them and preserves their answers — flipping the gate back and forth is lossless.
6. A gate field is always `required` and never has a default that skips. Force-advance from S1 (§6.3) treats an unanswered gate as **truthy**, so a participant pulled forward mid-questionnaire gets a full stack rather than a hollow one.

Everything outside a gate answer renders unconditionally. This keeps the property that made no-branching attractive — a section's screens are a fixed list, so replay is a fixed list — while sparing participants sections that don't apply to them.

**Progress** is computed over reachable screens given current gate answers, and recomputes when a gate changes. A participant who gates out two sections sees the total drop; that is honest and preferable to a progress bar that lies to stay monotonic.

### 4.3 Estimators

Some activities are not computed by arithmetic on their own answers. `household` is derived from a model fitted on time-use survey data taking demographic and household inputs. The system treats this as a named pure function.

```ts
interface EstimatorDef {
  id: string;                        // e.g. "household.v1"
  activityId: string;
  inputs: string[];                  // field ids it reads
  outputs: DayType[];                // which day types it produces
}

type Estimator = (answers: AnswerMap, dayType: DayType) => number; // hours
```

**Registry.** The client holds `Map<estimatorId, Estimator>`. Implementations may be:

- **Bundled** — a closed-form expression (linear model coefficients) shipped in the pack and evaluated client-side. No network, works offline, no latency in the questionnaire.
- **Remote** — `POST /estimate` with the input answers, returning hours. Use only if a model can't be reduced to coefficients.

**v1 uses the bundled path for every estimator, `household` included.** The model is fitted offline against the ATUS extract and only its coefficients ship. `estimators/` in this repo is therefore build tooling, not runtime code: nothing in it reaches the client.

This is a decision about the room, not about model quality. Forty phones on venue wifi, a network call inside a twenty-question flow, and §4.3 rule 3 catching every failure with a pack default — a remote estimator degrades exactly when the workshop is busiest. If `household` turns out not to reduce to a closed form, that is a reason to reconsider the model, and only then a reason to reconsider this.

**Contract rules:**

1. An estimator is a pure function of the answer map. No time, no randomness, no session state.
2. It must return a value for any answer map, including one where its inputs are unanswered. Missing inputs fall back to pack-defined defaults.
3. If an estimator throws or a remote call fails, the activity falls back to **`mode: 'fallback'`** with a pack-defined default value. The participant sees a number, never an error. Log `estimator.fallback`.
4. Estimator output is a starting value. The moment the participant edits that activity directly, `mode` flips to `direct` and the estimator no longer runs for it.
5. **`fallback` is recoverable; `direct` is not.** An activity in `fallback` is re-evaluated on the next derivation pass, and a successful evaluation returns it to `derived`. An activity in `direct` is never re-evaluated.

Rules 4 and 5 together carry the principle: the estimator is there so participants don't have to answer questions they'd answer badly, and it is not authoritative over the participant — but a transient network failure is not a participant decision and must not be recorded as one. Collapsing the two states means one dropped request pins an activity to a pack default for the rest of the session, including after the participant edits the very inputs the estimator reads.

Both non-derived modes are authoritative over the estimator while they hold. The difference is only in who set them and whether the system may unset it.

### 4.4 Derivation

```
hours(activity, dt):
  if activity[dt].mode == 'direct':      return activity[dt].hours
  if estimator exists for activity:
      try:                               return estimator(answers, dt)
      on throw:                          set mode = 'fallback'
                                         return pack default
  else:                                  return Σ over the activity's
                                           frequency × duration field pairs
```

A `fallback` activity takes the second branch, not the first: it is retried on every derivation pass and returns to `derived` the moment one succeeds (§4.3 rule 5). Only `direct` short-circuits.

The third branch — plain arithmetic — is itself expressed as a pack-declared estimator (`arith.freqDuration`) so there is exactly one code path. Nothing is special-cased per activity.

Because that branch sums the section's fields, **an unanswered section derives to zero unless its fields carry defaults.** This is why §4.6 requires a default on every field behind a gate: without it, §4.2.1 rule 6 promises a force-advanced participant a full stack and delivers an empty one.

### 4.5 Media

A screen may carry **0, 1, or 2 images**.

```ts
interface Media {
  src: string;          // CDN URL, or pack-relative path
  alt: string;          // copy key, required
  aspect: number;       // width / height, required — reserve space before load
}
```

Rendering: one image sits between prompt and fields, full content width. Two images sit side by side at half width. Aspect ratio is declared so layout space is reserved before load and the fields don't jump. Images are decorative-to-supporting; a participant must be able to answer every question with images failed to load. Alt text is required at pack validation.

Cap: 2. A third is a pack validation error.

### 4.6 Pack validation

Validate on load, fail loudly in dev, fall back to last-good pack in production:

- every `screen.sectionId` resolves to an activity
- every `field.id` unique across the pack
- every estimator's `inputs` resolve to existing field ids
- every activity is covered by ≥1 screen or an estimator
- every copy key referenced exists
- `media.length ≤ 2`, all have `alt` and `aspect`
- at most one gate per section, and it sits on that section's first screen
- every `activity.gateField` resolves to a field on that section's gate screen
- a gate field is `required` and its default is not the skipping value
- no section's estimator reads a field from a gated-out section unless that estimator declares a default for it
- **every field in a gated section declares a `default`**, so that a section revealed by an unanswered-gate-treated-as-truthy (§4.2.1 rule 6) derives to non-zero hours
- **every activity with a `fallback` path declares a default `hours` per day type**, used when its estimator throws (§4.3 rule 3)
- **activity hues form an even ring** — `360 / activities.length`, each activity's hue at its `order` index (§7.5)

---

## 5. Answer store

```ts
type AnswerMap = Record<string /* fieldId */, {
  value: unknown;
  at: number;        // epoch ms
  revision: number;  // increments on each edit, for telemetry
}>;
```

Flat, keyed by field id. Derived hours are **never** written here.

**Persistence.** Write to localStorage on every field change, keyed by session id. On boot, if a stored answer map exists for the current session and pack version, restore it and resume at the furthest stage reached. A mid-session refresh must not cost the participant twenty answers.

**Session identity persists with the answers.** `sessionId` and `token` are written to localStorage at session creation and restored on boot alongside the answer map. A refresh **must not** call `POST /session` again: `total` on the facilitator console counts sessions created (§6.2.2), so a second row inflates the one number the facilitator's decision rests on and breaks `inStage` summing to `total`.

Also persisted, for the same reason a refresh should be invisible: the selected day type (§7.1) and the furthest stage reached.

**Pack version mismatch** on restore: keep answers whose field ids still exist, drop the rest, resume at S1 at the first unanswered screen.

---

## 6. Session API and facilitator console

All endpoints JSON. Auth is a session token issued at start; no accounts. The facilitator console is unauthenticated by decision (§6.2.6).

### 6.1 Endpoints

```
POST /session
  body { joinCode: string }
  →  { sessionId, token, packVersion, packUrl }
     Resolves joinCode to a room. Unknown code → 404.
     No roomId in the response — see §6.2.1.

GET  /session/:id/stage
  →  { stageOpen: boolean, serverTime: number }
     Poll interval 3 s. Cheap, cacheable for 1 s.
     Token-authenticated; the server resolves session → room.

POST /session/:id/ready
  body { schedule: ScheduleSnapshot }
  →  { ok: true }
     Marks participant ready. Does NOT advance stage.

POST /session/:id/complete
  body { schedule: ScheduleSnapshot, events: Event[] }
  →  { ok: true }

POST /session/:id/telemetry
  body { events: Event[] }
  →  { ok: true }
     Batched, fire-and-forget, retried on next batch if failed.
```

### 6.2 Facilitator console

One screen, one button. The console exists to answer a single question — *has enough of the room finished?* — and to act on the answer. It holds no local state; everything on screen comes from the last poll.

**Device.** Laptop-first, designed at desk width where a facilitator running a workshop usually is. The layout holds down to 375 px so the stage can be opened from a phone while walking the room. One responsive screen, not a second build.

#### 6.2.1 Room lifecycle and route

```
POST /room
  →  { roomId, joinCode, consoleUrl }
     Creates a room with stage_open = false.
```

The console lives at `/facilitate/:roomId`, returned as `consoleUrl`. Reloading it is safe at any moment.

`joinCode` is short, unambiguous, and readable aloud across a room — four digits, no leading zero. Participants never see a roomId: they enter the code, or scan a QR encoding it, and `POST /session` resolves it. The code is valid for the life of the room.

roomId is not derivable from joinCode. That separation is the only thing standing between a participant and the stage flag (§6.2.6), so roomId must never be sent to a participant client.

**This governs §6.1.** The participant stage poll is `GET /session/:id/stage`, not a room-scoped route, and `POST /session` returns no roomId. No participant-facing route takes a roomId parameter, and roomId appears in no participant-facing state — not in a URL, not in localStorage, not in a telemetry payload. The room-scoped routes (`/room/:roomId/status`, `/room/:roomId/stage`) are the console's alone.

The cost is that the poll caches per session rather than per room. That is accepted: a spec that hands every participant the one secret protecting the flag has not protected it, and §6.2.6's scope argument rests entirely on this separation holding.

#### 6.2.2 Endpoints

```
GET  /room/:roomId/status
  →  { total, ready, stageOpen, joinCode,
        inStage: { s1, s2, s3, s4, s5 } }
     Poll 3 s.

POST /room/:roomId/stage
  body { open: true }
  →  { ok: true }
     Idempotent. A second call on an open room is a no-op returning ok.
```

`total` counts sessions created in the room. `ready` counts those that have POSTed `/ready`. `inStage` counts participants by furthest stage reached and sums to `total`.

#### 6.2.3 Screen

```
  ROOM  4712

         23 / 40
         ready

  S1 9   S2 8   S3 23   S4 0   S5 0

  ┌──────────────────────────────┐
  │        Open the reveal       │
  └──────────────────────────────┘
```

Four elements, top to bottom:

| Element | Content | Why it is there |
|---|---|---|
| Join code | `joinCode`, large, always visible | Read aloud to a latecomer without leaving the screen |
| Ready count | `ready / total`, largest type on the page | The one number the decision rests on |
| Stage breakdown | The five `inStage` counts | Distinguishes a straggler on question 2 from one on question 19 |
| Button | §6.2.4 | — |

Values swap on the 3 s poll with **no transition animation** — a count that tweens is a count that can be misread mid-flight.

On poll failure the last known values stay on screen, dimmed, with a small reconnecting note. This is the opposite of the S3 rule (§6.3), and deliberately so: a stale hold screen worries a participant for nothing, but a stale console misleads someone who is about to make a decision from the numbers on it.

#### 6.2.4 The button

Pressing the button does not open the stage. It arms it.

```
Idle ──press──> Armed ──press──> POST /stage ──> Open

"Open the reveal"   "Confirm — opens        (on failure:
                     for 40 participants"     back to Idle)
                       │
                       └─ 5 s, no second press ─> Idle
```

The armed label restates `total`, not `ready`. The flag force-advances the whole room (§6.3), including the seventeen who have not finished, and the label should name the number about to be acted on. A press at 3/40 should look wrong at the moment of confirming it.

After a successful POST the button is replaced by a static **Stage open** state. It does not re-arm: S3 → S4 is one-way (§2.2) and there is nothing to press twice. A failed POST returns to Idle with an inline error — never to a state that implies the stage opened.

The button is enabled as soon as the room has one participant. It is **not** gated on a ready threshold. Waiting is a facilitation judgement, and a console that refuses to open the stage at 3/40 is wrong about who is running the room.

#### 6.2.5 Telemetry

The press is a room-level fact, so the server records it. No client involvement, and the participant `Event` union in §10 is unchanged:

```
stage.open  { roomId, t, ready, total }
```

Written once, when the flag flips. This is the room's `t = 0`, and it is what *time to fit, room* in §10 is measured against. Without the record, that moment can only be inferred from the earliest `forced.advance` in the room — which does not exist if everyone had already finished.

It is not the only clock. §10 also records *time to fit* per participant, from their own S4 entry; for anyone force-advanced the two differ by the 5 s hold. Both are kept.

#### 6.2.6 No auth

The console is unauthenticated in v1. Anyone who reaches `/facilitate/:roomId` can open the stage, and `POST /room/:roomId/stage` accepts a call bearing a participant's session token.

This is a scope decision, not an oversight. The exposure is one boolean, in one room, for the length of one supervised workshop, and the only thing protecting it is that roomId never leaves the facilitator's browser (§6.2.1).

Do not build on this assumption. A second facilitator, a persistent room, or an unsupervised session all change the calculus (§13).

### 6.3 Gate semantics

The stage flag is a single room-scoped boolean. Three cases, all of which must be handled:

| Participant state when flag flips | Behaviour |
|---|---|
| In S3 (finished, waiting) | Advance to S4 once ≥5 s in S3 has elapsed |
| Finishes S2 *after* flag is already true | Enter S3, hold the **full 5 s minimum**, then S4 |
| Still in S1 or S2 | Force-advance: snapshot current schedule, POST ready, enter S3, hold 5 s, then S4 |

The 5-second floor applies in all three cases. A late finisher who skips straight to the reveal loses the beat the pause creates, and a forced-advance participant needs a moment to stop editing.

**Force-advance from S1** uses whatever has been answered so far, with unanswered activities at their pack defaults and unanswered gates treated as truthy (§4.2.1 rule 6). It is better to show a participant a partly-default schedule than to leave them out of the reveal.

**Polling, not websockets.** One boolean, a room on venue wifi, a session measured in minutes. Poll with jitter (3 s ± 500 ms) so 40 clients don't align. On network failure, keep polling; do not surface an error during S3 — a connection warning on the hold screen reads as a broken app.

---

## 7. Editor rendering

### 7.1 Day-type toggle

The editor renders **one day type at a time.** A two-segment toggle sits above the stack and is the only chrome between the header and the ruler.

```
┌─────────────┬─────────────┐
│  WORK DAY   │  weekend    │
│  23.7 hr    │  21.2 hr    │
├─────────────┴─────────────┤
│▓▓0▓                       │
│▌             Sleep   8 h  │
```

Each segment carries its day type's label and that day's **occupied hours** — `total(dt)`, not `remaining`. Both totals are live and both are always visible; the participant never has to switch tabs to learn what the other day looks like. This is what makes a weekend breach discoverable from the workday view, and it is the only reason `fits()` can fail for a reason the participant can see.

The toggle changes which stack is rendered. It changes nothing else: no answer, no derivation, no telemetry beyond a view event.

**Default.** `wd` on first entry to S2. The selected day type persists across sheet open and close, and across refresh.

**At S4.** The toggle is behind the two reveal screens (§8.3) and is first seen with school already in the stack. Entry to S4 forces the selection to `wd`, because school is workday-only (§8.3) and a participant sitting on the weekend segment would otherwise experience the reveal as nothing happening. The toggle stays live afterwards — a participant whose weekend was already over 24 at S1 (§11) must be able to reach it, or `fits()` blocks confirm with the cause off-screen.

**Breach.** When `total(dt) > 24`, that segment's hour count is set bold and in the overflow red. This applies to both segments, selected or not. See §7.6 — this is a deliberate exception to the stripes-only rule, and the only numeric overflow signal in the client.

**Type.** Label in the utility face, small caps or uppercase with letter-spacing; hours in the utility face with `tabular-nums` so the two segments' digits align and a changing total does not reflow the tab.

### 7.2 Geometry

Full-bleed. No horizontal margin on the stack container. The stack is the page.

```
pxPerHour = (viewportHeight - headerH - toggleH - footerH) / 24
```

Recomputed on resize and orientation change. A band's height is `hours × pxPerHour`, unclamped. The stack container's height is `max(24, total) × pxPerHour`, so an overflowing stack extends past the viewport and must be scrolled — this is intended, not a bug to fix.

### 7.3 Band anatomy

```
│▌                                                    │
│▌ 0                                                  │
│▌                                          Sleep     │
│▌                                          8 h       │
│▌ 3                                                  │
│▌                                                    │
 ▲▲                                              ▲
 ││                                              └ label + hours, right aligned
 │└ hour scale, left, overlapping the spine
 └ saturated spine, 8% of viewport width
```

- **Spine:** leftmost 8% of viewport width, full saturation of the band's hue.
- **Body:** remaining 92%, same hue at 12% opacity.
- **Hour scale:** ticks at 0, 3, 6, 9, 12, 15, 18, 21, 24. Positioned at the left edge, rendered *over* the spine. The scale is absolutely positioned against the stack container, not per-band — it is one continuous ruler.
- **Tick treatment:** exact ticks, and the numbers stand alone. **Nothing sits between the spine and the tick** — no plate, no scrim, no translucent stripe. The tick is a hairline rule and the number is set beside it.
- **Tick colour:** white for now, and deliberately open. An earlier draft guaranteed contrast with a translucent plate behind each number, on the argument that no single colour holds against ten arbitrary hues at full saturation. That argument still stands and the plate is still gone: the mark is worth more than the guarantee, and the risk is carried by the colour instead. Legibility against every hue at full saturation is a build check (§12 AC 19), not an assumption. If white fails, the resolution is a different tick colour or an adjustment to the light end of the hue ring — not the plate returning.
- **Label block:** activity label and hour count, right-aligned, inset 16 px from the right edge.

### 7.4 Type scaling

Label size scales with band height:

```
labelSize = clamp(13px, bandHeight × 0.16, 34px)
hoursSize = labelSize × 0.72
```

The lower clamp corresponds to roughly a 1-hour band. Below that, the band still renders its label at 13 px if there is vertical room, and omits it if `bandHeight < 20px`.

**Tap target tracks visual height.** Each band's hit area is a transparent overlay covering exactly the band and nothing else, so overlays never collide and a tap always opens the band under the finger. A thin band is correspondingly thin to hit; an earlier draft grew every overlay to a 44 px minimum, which bought the thin band area by stealing it from the neighbours a participant was far more likely to be aiming at.

### 7.5 Colour

Bands are distinguished by **hue spacing, not lightness**. At 12% opacity, lightness differences collapse to nothing. Assign hues at even intervals around the wheel from the pack.

With the v1 set of ten activities (§3.3) that interval is **36°**. An earlier draft of this section also required 40° between adjacent-in-order bands; the two rules are not simultaneously satisfiable at ten activities, and evenness is the property worth keeping. **The floor is 36°.** Pack validation checks the ring is even, not that any particular gap is met.

Colour is orientation, not identification. The label identifies the band. A participant must be able to use the app in greyscale.

### 7.6 Overflow

The 24-hour line is an absolutely positioned horizontal rule at `24 × pxPerHour` from the top of the stack. It has **one appearance** and never changes — same weight, same colour, before and after breach. It is a rim, not an alert.

Everything rendered below that line — the portions of bands that extend past it — carries a red diagonal stripe overlay at 45°, 6 px period. Implemented as a clipped overlay element over the stack, not per-band, so a band straddling the line is striped only on its lower portion.

**There is no over-by text, no toast, no error message, and no count of the excess.** Within the stack, the stripes are the entire signal.

**The one exception is the day total** (§7.1). When a day type breaches, its toggle segment's hour count is set bold and in the overflow red. This is a numeric overflow signal and it is deliberate:

- On the **selected** day it duplicates the stripes. Accepted. The total is already on screen and already changing; leaving it neutral while the stack is striped reads as an oversight rather than as restraint.
- On the **unselected** day it is the only signal available. Stripes cannot show you a stack you are not looking at, and without it `fits()` can block confirm at S4 with nothing on screen naming the cause.

The excess itself is still never stated. The segment shows occupied hours — `27.7 hr`, bold and red — not `+3.7` and not `3.7 over`. The participant reads the breach off a number they were already reading, and the size of the problem off the striped region.

The 24-hour rim rule is unaffected by all of this and still has exactly one appearance.

### 7.7 Not included

An activity computing to 0 hours renders **no band**. A 0-height band is a dead tap target participants will try to hit, and a band at some arbitrary minimum height would misrepresent the total.

Instead, zero-hour activities appear in a **Not included** list positioned **below the stack**, reached by scrolling past the 24-hour line.

**Membership.** An activity is in Not included when `hours('wd') === 0 && hours('we') === 0`. An activity with zero on one day type and non-zero on the other stays in the stack and renders a band only on the day type where it has hours.

**Cause is not distinguished.** A section gated out at S1 and a section answered with zeros land in the same list and look identical. The participant's route to zero is telemetry, not UI.

**Rendering.**

- Section heading, small, in the utility face, set at the same left inset as the stack's right-hand label block
- One row per activity: label at left, no hue, no spine, no hour count
- Full-width rows, minimum 44 px, tappable
- Muted throughout — this list is inventory, not part of the instrument

**Interaction.** Tapping a row opens that activity's sheet exactly as a band tap does, with its section's screens prefilled — including the gate, set to its falsy value if the section was gated out. Answering the gate truthy, or entering non-zero hours, moves the activity into the stack at its pack `order` position on sheet close, with the same 200 ms animation a height change gets.

**Discoverability.** The stack fills the viewport by design, so the list is below the fold. Indicate it: when Not included is non-empty, the stack container carries a bottom affordance — a count in the footer (`3 not included`) that scrolls to the list on tap. Do not shrink the stack to fit the list on screen; the stack owning the viewport is what makes it read as a full day.

**Empty state.** When every activity has hours, the section and its footer affordance are absent entirely. No empty-state copy.

**At S4.** Not included stays reachable during rebalance. A participant who wants to solve the squeeze by removing an activity moves it out of the stack, and that transition is exactly a cut to zero — log it as `hours.change` with `to: 0`, so it appears in cut order like any other reduction.

### 7.8 Unallocated

Rendered as the bottom band, dashed 1 px outline, no fill, no spine, label "Unallocated". No tap target. Disappears entirely when `remaining ≤ 0`.

### 7.9 Options tab

A sliver on the **right edge at mid-height**: a tab 15% of the viewport tall and three dots wide, rounded on its left side only, carrying a vertical ellipsis. It is `position: fixed` and therefore outside §7.2's chrome measurement — a tab in flow would shorten the day by its own width. Its height *and its offset from the top* are both in `svh`: a percentage resolves against the layout viewport, which is what a mobile address bar resizes, so `top: 50%` would walk the tab up and down the edge as the participant scrolls.

The panel it opens is inset from the right by the tab's own width plus a gap, so the control that opened it is never underneath it, and is anchored to the same `svh` offset so the two cannot drift apart mid-scroll. In the menu view it is sized to its one item; the confirmation takes the width its sentence needs.

The right edge is chosen because the rest of the editor's chrome is spoken for: the header fills with the S4 reveal, the footer with the Not included count and Finish. It is a sliver because §7.6's silence rule holds here too — nothing beside the stack may read as an alert or an instruction.

**Editor only.** The tab appears at S2 and after. The questionnaire, the intro and the join screen do not carry it.

**Contents.** One item in v1: **Start over**.

**Reset.** Two taps and a sentence, never one. The first opens the menu; the second opens a confirmation naming what is lost, and only its confirm button resets. A reset:

- deletes the participant's session row, snapshots and events **server-side**, outright — a flag would leave `total` counting one participant twice and break `inStage` summing to it (§6.2.2), and an abandoned run in the §10 debrief is a participant who never existed;
- mints a replacement session **in the same room**, so no join code is needed again and RD-2's rule that `roomId` never reaches a participant is untouched;
- clears the local record and returns the participant to the intro, at S1, with an empty answer map.

**Order and failure.** The server is asked first; local state is cleared only on its confirmation. A network failure has destroyed nothing and the confirmation stays up to be tapped again. A 401 means the row is already gone — a second tap racing the first — so the stored record is worthless and the client clears it and falls back to the join screen rather than stranding the phone on a session the server has forgotten.

---

## 8. Interaction

### 8.1 Band tap → sheet

Tapping a band opens a bottom sheet containing that section's screens, prefilled from the answer map.

**Sheet behaviour:**

- Rises from the bottom, 88% viewport height, rounded top corners, backdrop at 45% dim
- Locks body scroll while open
- Traps focus; first focusable element receives focus on open
- Closes on: backdrop tap, Escape, downward drag past 25% of sheet height, explicit Done
- On close, the stack animates the changed band to its new height over 200 ms (skipped under `prefers-reduced-motion`)

**Content:** the section's screens, stacked vertically and scrollable — not paged. Replay is review, and paging through four screens to fix one number is worse than scrolling.

At the bottom of the sheet: a direct-entry control. "Set directly" flips the activity to `mode: 'direct'` and exposes a numeric input for workday and weekend hours. Flipping to direct does not erase the underlying answers; flipping back restores derivation from them.

**Because the sheet occludes the stack**, the sheet header must show the activity's current computed total, updating live as fields change. The participant cannot see the consequence until dismissal, so the number substitutes for the visual.

### 8.2 Constraints in the sheet

| Activity | Constraint | Enforcement |
|---|---|---|
| `sleep` | ≥ 6 h per day | Input clamps at 6; stepper disables below |
| `school` | 20–40 h/week, 5 h steps, workdays only | See §8.3 |
| all others | ≥ 0 | Input clamps at 0 |

Clamping is silent. No error copy. The control simply stops.

### 8.3 School

School appears only at S4 and sits at `order: 0` — **above sleep, at the top of the stack**.

**The reveal is two screens, and the stack is on neither of them.**

1. **The commitment.** `s4.reveal.title` / `s4.reveal.body`: StartSchool is happening, and it takes a share of the week. One continue control. No number is asked for on this screen.
2. **The pace.** The weekly stepper, the per-workday figure it implies (`weekly / 5`), and beneath both the outcome at the level currently set. All three update on every step. Continue commits the level; the stack is then entered with school already at that height.

Splitting them is the point, not a layout convenience. A pace chosen in front of a striped stack is a pace chosen to remove the stripes — 20 for everyone, measuring nothing. Chosen before the cost is on screen, it is a statement of what the participant wants out of the programme, and what they then cut to afford it is the output of the exercise (§10).

The per-workday figure is the one cost the pace screen does show, and it is deliberately the general one: a participant should know that 40 h a week is eight hours of every workday before choosing it. What it takes from *their* week stays off-screen until the stack.

**The ladder.**

| Weekly | Per workday | Outcome |
|---|---|---|
| 20 h | 4 h | You will learn some things about product development. |
| 25 h | 5 h | *Placeholder — to be authored.* |
| 30 h | 6 h | *Placeholder — to be authored.* |
| 35 h | 7 h | *Placeholder — to be authored.* |
| 40 h | 8 h | You have a real chance to succeed developing your own startup. |

The endpoints are fixed content. The three middle rungs ship as placeholders in the pack until they are authored, and they interpolate that range under §9's register — plain, neutral, no encouragement, no second-person judgement. A build is complete and testable with the placeholders in place, on the same principle as the rest of §4's content.

The outcome copy is what makes the stepper a decision at all: a number that changes nothing but a band height is not something a participant can have a view about. It is also the only expectation the client states anywhere, and it states one about the programme — never about the participant's week, never about what other people in the room chose, and never implying that a rung is the right one.

**The rules.**

- Weekly minimum **20 h**, distributed across the 5 workdays → 4 h per workday
- Adjustable in **5 h weekly increments**, from 20 up to a maximum of **40 h** → 8 h per workday
- The decrement control is disabled at 20 h; the increment control is disabled at 40 h
- **Zero hours on weekend days.** School contributes nothing to the weekend stack.

**Why there is a ceiling.** 1.2 and earlier said "adjustable upward only" and named no maximum, which was harmless while the number meant nothing but a band height. Once every level states an outcome, an unbounded stepper walks past the last claim the pack can make, and 45 h sitting under the 40 h text is a worse screen than a disabled control. 40 h is also a full working day of school on every workday, on top of everything the participant already answered — the point at which the ask is visibly more than a week holds.

The outcome keys are addressed by weekly value (§9), so extending the ladder is a pack edit plus a `maxWeekly` change, not a client change.

School's sheet contains the same three-part control — stepper, per-workday figure, outcome — and nothing else. It carries none of the questionnaire. The pace screen and the sheet render **one** control, so the ladder a participant chose against is the ladder they meet again on the band.

**Lowering the pace is a legitimate route to fitting**, down to the 20 h floor. Giving up outcome rather than hours is one of the decisions this exercise exists to surface, and it appears in cut order like any other `hours.change` (§10).

Because school is workday-only, the weekend stack is unaffected by the reveal and will normally still fit. `fits()` is therefore effectively a workday condition — but implement it as the general form in §3.4 so a future weekend-bearing commitment doesn't require a rewrite.

**The general form is not decorative.** §11 permits an answer set over 24 h at S1, so a participant can arrive at S4 with a weekend that already breaches. For them `fits()` is false for a reason school did not cause and the workday stack does not show. Two things carry that case, and both are required: S4 forces the view to `wd` but leaves the toggle live (§7.1), and the weekend segment shows its total bold and red (§7.6). Without them the confirm control stays disabled with no cause on screen.

### 8.4 Rebalance completion

When `fits()` becomes true, the stripes disappear and a confirm control becomes enabled. The participant confirms; the client POSTs `/complete` and enters S5.

The participant may continue adjusting after fitting and before confirming. Do not auto-advance on `fits()` — a participant who lands under 24 by accident should get to look at what they did.

**`fits()` may already be true on entry to S4.** Unallocated (§7.8) absorbs school before any band does, so a participant whose workday slack covers the per-workday figure they chose — 4 h at 20 h/week, 8 h at 40 — takes the reveal without breaching: no stripes, confirm enabled immediately, cut order empty. This is a valid outcome and a real finding — their week had room — and nothing in the client marks it or compensates for it. See §11.

---

## 9. Copy

All strings live in the pack under `copy`. No string is hardcoded in the client.

**Scope.** This governs the participant client. The facilitator console's strings are hardcoded in its source: it is operator tooling for one known person rather than content, and coupling six labels to pack versioning buys nothing. No `fac.*` keys exist in the pack.

**Register:** plain, neutral, sentence case, active voice. No encouragement, no exclamation, no second-person judgement, no framing that suggests a right answer.

**Specifically forbidden in question copy:** any phrasing that implies a norm, a benchmark, a comparison to others, or an expectation. Questions ask what the participant does. They do not characterise it, contextualise it, or explain why it's being asked. A prompt that says "most people underestimate this" changes the answer and has no place in the instrument.

This applies to every section without exception, including screen time, sleep, and leisure.

**Required keys:**

| Key | Context |
|---|---|
| `s1.progress` | Section progress indicator |
| `s2.finish` | Finish button |
| `s3.title` | Loader heading |
| `s3.lines[]` | Cycling status lines, ≥4 |
| `s4.reveal.title` | Reveal heading |
| `s4.reveal.body` | Reveal body — the StartSchool ask |
| `s4.pace.title` | Pace screen heading |
| `s4.pace.perDay` | Per-workday figure on the pace screen and in the sheet, templated `{hours}` |
| `s4.pace.continue` | Pace screen continue control |
| `s4.school.outcome.20` … `.40` | The five ladder rungs (§8.3), addressed by weekly value |
| `s4.confirm` | Confirm button, enabled when `fits()` |
| `sheet.setDirect` | Direct-entry toggle |
| `sheet.done` | Sheet dismiss |
| `band.unallocated` | Unallocated band label |

**The outcome ladder** is content like every other string here, and the register applies to it in full. It is not question copy — it describes the programme at a pace rather than asking the participant anything — but the prohibition on comparison survives the move: no rung may reference other participants, other cohorts, or what is typical. Three of the five ship as placeholders (§8.3) and a pack is valid with them in place.

**S3 status lines** must be plausible and dull. They describe evaluation in generic terms. Nothing witty — a joke here signals that the wait is theatre, and the pause stops working.

---

## 10. Telemetry

The debrief is the point of the exercise; telemetry is the product output.

```ts
interface Event {
  t: number;                   // epoch ms
  type: EventType;
  activityId?: string;
  fieldId?: string;
  from?: number; to?: number;  // hours, for edits
}

type EventType =
  | 'screen.view' | 'field.answer' | 'field.revise'
  | 'stage.enter' | 'finish' | 'forced.advance'
  | 'sheet.open' | 'sheet.close'
  | 'hours.change' | 'mode.direct' | 'clamp.hit'
  | 'estimator.fallback'
  | 'fits' | 'complete';
```

**Snapshots** taken at three points: end of S1, at Finish (pre-reveal), at complete (post-rebalance).

**Derived fields the debrief needs:**

| Field | Derivation |
|---|---|
| Per-activity delta | complete snapshot − finish snapshot |
| Cut order | sequence of `hours.change` with `to < from` after S4 entry |
| First cut | first element of cut order — the most diagnostic single field |
| Sheet opens per activity during rebalance | count of `sheet.open` after S4 entry |
| Sleep floor hit | any `clamp.hit` on `sleep` |
| Pace at reveal | school weekly committed on the pace screen — chosen before any cost was on screen |
| School above minimum | school weekly > 20 at complete — the pace that survived the rebalance |
| Time to fit | `fits` timestamp − S4 entry, per participant |
| Time to fit, room | `fits` timestamp − `stage.open`, shared clock |
| Slack at finish | `remaining('wd')` in the finish snapshot |
| No-squeeze | `fits()` already true on S4 entry — slack ≥ school |

**Two times to fit, named apart.** §6.2.5 measures against the room's `stage.open`; the per-participant measure runs from that participant's S4 entry. For anyone force-advanced they differ by the 5 s hold plus their snapshot. Both are derivable from the event log at no cost, so record both rather than pick: the first compares rebalance effort between participants, the second plots how the room moved after the flag flipped. Do not use one name for both.

**Record the pace twice.** The pace screen (§8.3) puts the school figure in the participant's hands before the breach is visible, so *school above minimum* read at complete alone is two different facts wearing one name: what they wanted, and what they kept. A participant who takes 40 h and retreats to 25 under the stripes is the most interesting row in the debrief, and one figure erases them. The pace screen's commit is logged as `hours.change` like any other, so both ends are recoverable from the event log; report both.

**Read cut order against slack at finish.** Unallocated absorbs school before any band does, and that absorption emits no event (§7.8). So the first *logged* cut is not the first real loss for any participant who had slack — it is the first loss they had to make a decision about. Both readings are useful and they are not the same reading. A debrief that quotes first cut without slack at finish is quoting a participant who may have already given up two hours silently.

Everything else in this document exists to produce **per-activity delta** and **cut order**. If a build decision trades against those two fields, the fields win.

---

## 11. Edge cases

| Case | Required behaviour |
|---|---|
| Answers sum > 24 h at S1 | Allowed. Editor opens already striped. Do not validate the total at S1 — an over-24 answer set is a real finding. |
| Participant joins mid-session, flag already true | Full S1 → S2 at their own pace, then S3 with 5 s hold, then S4. Never skip stages. |
| Refresh at any stage | Resume at furthest stage reached, answers and selected day type intact. Restore `sessionId` and `token` from localStorage; do **not** call `POST /session` again (§5). |
| Refresh during S3 | Resume in S3, restart the 5 s floor |
| Pack fetch fails at boot | Retry ×3 with backoff, then last-good cached pack, then hard error screen with a reload control |
| Estimator throws | Fall back to pack default, `mode: 'fallback'`, log `estimator.fallback`, no user-visible error. Retried on the next derivation pass (§4.3 rule 5). |
| Telemetry POST fails | Queue and retry with the next batch. Never block the UI. |
| Stage poll fails during S3 | Keep polling silently. No connection warning on the hold screen. |
| Viewport under 320 px wide | Support. Spine at 8% is 25 px minimum. |
| Landscape orientation | Support by recomputing `pxPerHour`. Stack may exceed viewport; scroll. |
| Every activity zeroed | Stack is entirely Unallocated; every activity sits in Not included. Valid state. |
| School pushes weekend over 24 | Cannot occur (school is workday-only), but `fits()` must still evaluate both day types. |
| **Weekend already over 24 at S4** | `fits()` is false for a cause the forced workday view does not show. The weekend segment reads bold and red (§7.6) and the toggle stays live (§7.1) so the participant can reach it. Confirm stays disabled until both days fit. |
| **School fits inside existing slack** | Valid. No stripes, `fits()` true on S4 entry, confirm enabled immediately, cut order empty. The threshold is the pace they chose, not a fixed 4 h — 8 h of slack at 40 h/week — so the same participant can be slack-rich or breaching on a choice made one screen earlier. Do not manufacture a breach: a participant whose week had room is a finding, not a failure. Read against *slack at finish* (§10). |
| **Force-advance from S1 with nothing answered** | Every gate resolves truthy (§4.2.1 rule 6) and every section derives from its field defaults (§4.6), so the participant reaches S4 with a full stack of pack-default hours rather than an empty one. |
| Day-type toggle at S4 | Selection is forced to `wd` on S4 entry and remains changeable thereafter (§7.1). |

---

## 12. Acceptance criteria

**S1**
1. Every non-gated screen renders for every participant, in pack order. A falsy gate skips the rest of its own section and no other section.
2. A screen with two day-scoped fields captures both independently.
3. A screen with two images reserves layout space before load; fields do not shift.
4. All questions answerable with images blocked.
5. No question copy contains a norm, benchmark, or comparison.
6. Answers persist across refresh.
7. Flipping a gate falsy then truthy in replay preserves the section's other answers.
8. Progress recomputes over reachable screens when a gate changes.
9. On the last screen, the generated stack contains one band per non-zero activity, ordered per pack, and every zero-hour activity appears in Not included.

10. A section left wholly unanswered derives to non-zero hours from its field defaults; it does not land in Not included.

**S2 — day-type toggle**
11. Exactly one day type's stack renders at a time; the toggle selects which.
12. Both segments show their own day's occupied hours, live, whether selected or not.
13. A day type over 24 h shows its segment's hour count bold and in the overflow red — including when it is not the selected segment.
14. Segment digits are tabular; a changing total does not reflow the toggle.
15. Selected day type survives sheet open/close and refresh.

**S2 — stack**
16. Stack is full-bleed: zero horizontal margin at every supported width.
17. Spine is 8% of viewport width; body fill is the same hue at 12%.
18. Hour scale renders over the spine, ticks at 0/3/…/24, as one continuous ruler.
19. Each tick number is legible against every activity hue at full saturation, with nothing rendered between the spine and the tick.
20. Activity hues form an even ring at `360 / n`; no two are closer than that interval.
21. Every band is tappable over exactly its own height, and no overlay reaches into a neighbour.
22. Label type scales with band height and clamps at 13 px / 34 px.
22a. The options tab is present in the editor and absent everywhere else, and takes no part in the `pxPerHour` measurement.
22b. Reset is unreachable in one tap; on confirmation the session's row, snapshots and events are gone and one row remains in the room.
22c. A reset that fails on the network destroys nothing, locally or server-side.
23. Tapping a band opens its section's screens prefilled; changing a field updates the sheet header total live.
24. Sheet close animates the band; body scroll is locked while open; Escape closes.
25. Sleep cannot be set below 6 h; the control stops silently.
26. Direct entry overrides derivation; reverting restores it from unchanged answers.
27. An estimator failure sets `mode: 'fallback'`, not `direct`, and a later successful evaluation returns the activity to `derived`.
28. An activity at zero on both day types renders no band and appears in Not included.
29. Not included sits below the 24 h line, reached by scrolling; a footer count scrolls to it.
30. Tapping a Not included row opens its sheet; giving it hours moves it into the stack at its pack order.
31. Not included is absent entirely when empty — no empty-state copy.

**S3**
32. Finish enters the loader and marks ready; it does not advance the stage.
33. Loader displays a minimum of 5 s in every path, including when the flag is already true.
34. Poll failure produces no user-visible error.
35. A participant in S1 or S2 when the flag flips is force-advanced with a snapshot of current state.
36. A refresh at any stage restores the existing session and creates no second session row.

**S4**
37. Entry to S4 forces the toggle to `wd`; the toggle remains operable afterwards.
37a. The reveal is two screens — the commitment, then the pace — and neither renders the stack. The stack is reached only after the pace is committed.
38. School renders at the top of the stack, above sleep.
39. School weekly hours: minimum 20, maximum 40, increments of 5, decrement disabled at 20, increment disabled at 40, zero on weekend days.
39a. The pace screen shows the per-workday figure and the outcome for the level currently set, and both change on every step. The band enters the stack at the committed level.
40. School's sheet exposes the same three-part control as the pace screen — stepper, per-workday figure, outcome — and no questionnaire content.
41. Portions of bands below the 24 h line carry 45° red stripes; the rim rule's appearance is identical before and after breach.
42. The only numeric overflow signal anywhere in the client is the toggle segment's bold red hour count. No message, toast, delta, or excess figure appears — the segment shows occupied hours, never `+3.7`.
43. Confirm enables only when `fits()` for **both** day types; the app does not auto-advance on `fits()`.
44. A participant whose weekend breaches at S4 can reach the weekend stack and see the cause.
45. A participant whose slack exceeds school reaches S4 with no stripes and confirm already enabled.

**Telemetry**
46. Three snapshots recorded: S1 end, Finish, complete.
47. Cut order reconstructible from the event log for every completing participant.
48. Both times to fit recorded under distinct names, and `slack at finish` recoverable from the finish snapshot.

**Facilitator**
49. `POST /room` returns a joinCode that `POST /session` resolves to that room; an unknown code is rejected.
50. Console renders join code, `ready / total`, and all five stage counts; `inStage` sums to `total`.
51. Counts update on the 3 s poll with no transition animation.
52. Poll failure leaves the last values on screen, dimmed, with a reconnecting note.
53. The button requires two presses; the armed label restates `total` and reverts to idle after 5 s without a second press.
54. A successful POST replaces the button with a static Stage open state that cannot be pressed again.
55. A failed POST returns the button to idle with an inline error, in no state implying the stage opened.
56. Reloading the console at any point restores the same screen from the next poll.
57. One `stage.open` record is written per room, carrying `ready` and `total` at the moment of the flip.
58. Layout holds at 375 px with no horizontal scroll.

---

## 13. Out of scope for v1

Accounts, cross-session history, multi-room facilitation from one console, participant-visible comparison to the room, editing the activity set at runtime, more than two day types, weekend school, multitasking or secondary activities, branching beyond section gates.

**Facilitator auth is out of scope** (§6.2.6). The console is unauthenticated by decision, on the strength of the room being supervised for the length of one session.

**Multitasking is explicitly not modelled.** Every hour belongs to exactly one activity. State this once in the questionnaire intro so participants answer consistently; do not add a mechanism for it.
