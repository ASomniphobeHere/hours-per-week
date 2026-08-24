# 24 — Build Specification

**Product:** a phone-first time-budget exercise for facilitated workshops.
**Version:** 1.0 — build spec
**Status of content:** the question list and the estimator models are *not* in this document. They are content, loaded as data, and are specified in §4 as interfaces. This document specifies the system that consumes them. A build is complete and testable with placeholder content.

---

## 1. What the participant does

A participant opens the app on their phone in a workshop room. They answer a questionnaire about their week. The system turns those answers into a schedule — a single day rendered as a vertical stack of activity bands filling a 24-hour container. They review it, correct anything wrong by tapping bands and re-answering, and press Finish.

They then wait on a loader while the rest of the room finishes. When the facilitator opens the next stage, every participant sees the same thing at the same moment: they forgot StartSchool, which requires a minimum of 20 hours per week. The school band appears at the top of their stack and the stack no longer fits — everything below the 24-hour line is struck through with red diagonal stripes.

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
| S4 reveal + rebalance | `fits() == true` and participant confirms | No |
| S5 done | — | — |

S2 is re-enterable from itself (band replay). S3 → S4 is one-way. A participant who is still in S1 or S2 when the flag flips is force-advanced (§6.3).

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
  mode: 'derived' | 'direct';
  hours: number;          // authoritative when mode === 'direct'
  // when mode === 'derived', hours is recomputed from answers via §4.3
}

interface Activity {
  id: string;             // stable, matches a questionnaire section id
  label: string;
  hue: number;            // 0–360, see §7.4
  order: number;          // ascending = top to bottom
  wd: DayValue;
  we: DayValue;
  locked: boolean;        // school only
  constraint?: Constraint;
}

interface Constraint {
  minWeekly?: number;     // school: 20
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

`leisure` is a real activity with its own questions and its own band. `Unallocated` is the arithmetic remainder `24 − Σ hours` and is rendered as a dashed band with no tap target. An activity at zero hours is not a band at all — see §7.6.

The set is defined in the content pack, not hardcoded. The order column is authoritative for rendering.

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
4. A skipped section's activity resolves to zero hours and lands in **Not included** (§7.6).
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

- **Bundled** — a closed-form expression (linear model coefficients) shipped in the pack and evaluated client-side. Preferred: no network, works offline, no latency in the questionnaire.
- **Remote** — `POST /estimate` with the input answers, returning hours. Use only if a model can't be reduced to coefficients.

**Contract rules:**

1. An estimator is a pure function of the answer map. No time, no randomness, no session state.
2. It must return a value for any answer map, including one where its inputs are unanswered. Missing inputs fall back to pack-defined defaults.
3. If an estimator throws or a remote call fails, the activity falls back to `mode: 'direct'` with a pack-defined default value. The participant sees a number, never an error. Log the fallback.
4. Estimator output is a starting value. The moment the participant edits that activity directly, `mode` flips to `direct` and the estimator no longer runs for it.

Rule 4 is important: the estimator is there so participants don't have to answer questions they'd answer badly. It is not authoritative over the participant.

### 4.4 Derivation

```
hours(activity, dt):
  if activity[dt].mode == 'direct':      return activity[dt].hours
  if estimator exists for activity:      return estimator(answers, dt)
  else:                                  return Σ over the activity's
                                           frequency × duration field pairs
```

The third branch — plain arithmetic — is itself expressed as a pack-declared estimator (`arith.freqDuration`) so there is exactly one code path. Nothing is special-cased per activity.

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

**Pack version mismatch** on restore: keep answers whose field ids still exist, drop the rest, resume at S1 at the first unanswered screen.

---

## 6. Session API and facilitator console

All endpoints JSON. Auth is a session token issued at start; no accounts. The facilitator console is unauthenticated by decision (§6.2.6).

### 6.1 Endpoints

```
POST /session
  body { joinCode: string }
  →  { sessionId, token, roomId, packVersion, packUrl }
     Resolves joinCode to a room. Unknown code → 404.

GET  /room/:roomId/stage
  →  { stageOpen: boolean, serverTime: number }
     Poll interval 3 s. Cheap, cacheable for 1 s.

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

Written once, when the flag flips. This is the room's `t = 0`: every participant's S4 entry, and so every *time to fit* in §10, is measured against it. Without the record, that moment can only be inferred from the earliest `forced.advance` in the room — which does not exist if everyone had already finished.

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

### 7.1 Geometry

Full-bleed. No horizontal margin on the stack container. The stack is the page.

```
pxPerHour = (viewportHeight - headerH - footerH) / 24
```

Recomputed on resize and orientation change. A band's height is `hours × pxPerHour`, unclamped. The stack container's height is `max(24, total) × pxPerHour`, so an overflowing stack extends past the viewport and must be scrolled — this is intended, not a bug to fix.

### 7.2 Band anatomy

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
- **Hour scale:** ticks at 0, 3, 6, 9, 12, 15, 18, 21, 24. Positioned at the left edge, rendered *over* the spine, in a colour that holds contrast against saturated fill. The scale is absolutely positioned against the stack container, not per-band — it is one continuous ruler.
- **Label block:** activity label and hour count, right-aligned, inset 16 px from the right edge.

### 7.3 Type scaling

Label size scales with band height:

```
labelSize = clamp(13px, bandHeight × 0.16, 34px)
hoursSize = labelSize × 0.72
```

The lower clamp corresponds to roughly a 1-hour band. Below that, the band still renders its label at 13 px if there is vertical room, and omits it if `bandHeight < 20px`.

**Tap target is independent of visual height.** Any band, however thin, has a minimum 44 px hit area, achieved with a transparent overlay that may overlap neighbours. When overlays collide, the smaller band wins the overlap — thin bands are the hard ones to hit.

### 7.4 Colour

Bands are distinguished by **hue spacing, not lightness**. At 12% opacity, lightness differences collapse to nothing. Assign hues at even intervals around the wheel from the pack, keeping adjacent-in-order bands at least 40° apart.

Colour is orientation, not identification. The label identifies the band. A participant must be able to use the app in greyscale.

### 7.5 Overflow

The 24-hour line is an absolutely positioned horizontal rule at `24 × pxPerHour` from the top of the stack. It has **one appearance** and never changes — same weight, same colour, before and after breach. It is a rim, not an alert.

Everything rendered below that line — the portions of bands that extend past it — carries a red diagonal stripe overlay at 45°, 6 px period. Implemented as a clipped overlay element over the stack, not per-band, so a band straddling the line is striped only on its lower portion.

**There is no over-by text, no toast, no error message, no count.** The stripes are the entire signal.

### 7.6 Not included

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

### 7.7 Unallocated

Rendered as the bottom band, dashed 1 px outline, no fill, no spine, label "Unallocated". No tap target. Disappears entirely when `remaining ≤ 0`.

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
| `school` | ≥ 20 h/week, 5 h steps, workdays only | See §8.3 |
| all others | ≥ 0 | Input clamps at 0 |

Clamping is silent. No error copy. The control simply stops.

### 8.3 School

School appears only at S4 and sits at `order: 0` — **above sleep, at the top of the stack**.

- Weekly minimum **20 h**, distributed across the 5 workdays → 4 h per workday
- Adjustable **upward only**, in **5 h weekly increments** → 25 h (5 h/day), 30 h (6 h/day), and so on
- The decrement control is disabled at 20 h
- **Zero hours on weekend days.** School contributes nothing to the weekend stack.

School's sheet contains only the weekly-hours stepper. It carries none of the questionnaire.

Because school is workday-only, the weekend stack is unaffected by the reveal and will normally still fit. `fits()` is therefore effectively a workday condition — but implement it as the general form in §3.4 so a future weekend-bearing commitment doesn't require a rewrite.

### 8.4 Rebalance completion

When `fits()` becomes true, the stripes disappear and a confirm control becomes enabled. The participant confirms; the client POSTs `/complete` and enters S5.

The participant may continue adjusting after fitting and before confirming. Do not auto-advance on `fits()` — a participant who lands under 24 by accident should get to look at what they did.

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
| `s4.confirm` | Confirm button, enabled when `fits()` |
| `sheet.setDirect` | Direct-entry toggle |
| `sheet.done` | Sheet dismiss |
| `band.unallocated` | Unallocated band label |

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
| School above minimum | school weekly > 20 at complete |
| Time to fit | `fits` timestamp − S4 entry |

Everything else in this document exists to produce **per-activity delta** and **cut order**. If a build decision trades against those two fields, the fields win.

---

## 11. Edge cases

| Case | Required behaviour |
|---|---|
| Answers sum > 24 h at S1 | Allowed. Editor opens already striped. Do not validate the total at S1 — an over-24 answer set is a real finding. |
| Participant joins mid-session, flag already true | Full S1 → S2 at their own pace, then S3 with 5 s hold, then S4. Never skip stages. |
| Refresh at any stage | Resume at furthest stage reached, answers intact |
| Refresh during S3 | Resume in S3, restart the 5 s floor |
| Pack fetch fails at boot | Retry ×3 with backoff, then last-good cached pack, then hard error screen with a reload control |
| Estimator throws | Fall back to pack default, `mode: 'direct'`, log `estimator.fallback`, no user-visible error |
| Telemetry POST fails | Queue and retry with the next batch. Never block the UI. |
| Stage poll fails during S3 | Keep polling silently. No connection warning on the hold screen. |
| Viewport under 320 px wide | Support. Spine at 8% is 25 px minimum. |
| Landscape orientation | Support by recomputing `pxPerHour`. Stack may exceed viewport; scroll. |
| Every activity zeroed | Stack is entirely Unallocated; every activity sits in Not included. Valid state. |
| School pushes weekend over 24 | Cannot occur (school is workday-only), but `fits()` must still evaluate both day types. |

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

**S2**
10. Stack is full-bleed: zero horizontal margin at every supported width.
11. Spine is 8% of viewport width; body fill is the same hue at 12%.
12. Hour scale renders over the spine, ticks at 0/3/…/24, as one continuous ruler.
13. A 0.25 h band is tappable (≥44 px hit area) though visually a rule.
14. Label type scales with band height and clamps at 13 px / 34 px.
15. Tapping a band opens its section's screens prefilled; changing a field updates the sheet header total live.
16. Sheet close animates the band; body scroll is locked while open; Escape closes.
17. Sleep cannot be set below 6 h; the control stops silently.
18. Direct entry overrides derivation; reverting restores it from unchanged answers.
19. An activity at zero on both day types renders no band and appears in Not included.
20. Not included sits below the 24 h line, reached by scrolling; a footer count scrolls to it.
21. Tapping a Not included row opens its sheet; giving it hours moves it into the stack at its pack order.
22. Not included is absent entirely when empty — no empty-state copy.

**S3**
23. Finish enters the loader and marks ready; it does not advance the stage.
24. Loader displays a minimum of 5 s in every path, including when the flag is already true.
25. Poll failure produces no user-visible error.
26. A participant in S1 or S2 when the flag flips is force-advanced with a snapshot of current state.

**S4**
27. School renders at the top of the stack, above sleep.
28. School weekly hours: minimum 20, increments of 5, decrement disabled at 20, zero on weekend days.
29. School's sheet exposes only the weekly stepper — no questionnaire content.
30. Portions of bands below the 24 h line carry 45° red stripes; the rim rule's appearance is identical before and after breach.
31. No numeric overflow message appears anywhere.
32. Confirm enables only when `fits()`; the app does not auto-advance on `fits()`.

**Telemetry**
33. Three snapshots recorded: S1 end, Finish, complete.
34. Cut order reconstructible from the event log for every completing participant.

**Facilitator**
35. `POST /room` returns a joinCode that `POST /session` resolves to that room; an unknown code is rejected.
36. Console renders join code, `ready / total`, and all five stage counts; `inStage` sums to `total`.
37. Counts update on the 3 s poll with no transition animation.
38. Poll failure leaves the last values on screen, dimmed, with a reconnecting note.
39. The button requires two presses; the armed label restates `total` and reverts to idle after 5 s without a second press.
40. A successful POST replaces the button with a static Stage open state that cannot be pressed again.
41. A failed POST returns the button to idle with an inline error, in no state implying the stage opened.
42. Reloading the console at any point restores the same screen from the next poll.
43. One `stage.open` record is written per room, carrying `ready` and `total` at the moment of the flip.
44. Layout holds at 375 px with no horizontal scroll.

---

## 13. Out of scope for v1

Accounts, cross-session history, multi-room facilitation from one console, participant-visible comparison to the room, editing the activity set at runtime, more than two day types, weekend school, multitasking or secondary activities, branching beyond section gates.

**Facilitator auth is out of scope** (§6.2.6). The console is unauthenticated by decision, on the strength of the room being supervised for the length of one session.

**Multitasking is explicitly not modelled.** Every hour belongs to exactly one activity. State this once in the questionnaire intro so participants answer consistently; do not add a mechanism for it.
