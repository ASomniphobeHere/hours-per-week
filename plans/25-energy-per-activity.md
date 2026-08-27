# 25 — Energy per activity

**Implements:** an addition to `specs/24-build-spec.md` v1.4 that the spec does not yet contain. This plan is the specification for it until §§2–12 are amended.
**Extends:** `plans/24-implementation-plan.md` — one new stage, slotted after Stage 8 and before Stage 10.
**Written:** 2026-08-27
**Status:** not started

---

## What this adds

Every activity gains an **energy level** the participant sets on a five-point scale, from −2 (drains) to +2 (gains). A new participant-facing stage sits between the editor and the reveal, gated by its own facilitator press, in which the participant rates each activity in their week. The rating is hours-weighted at the end: an activity's contribution is `hours × level`, so a week has a net energy figure per day type and per week.

The stage machine grows from five members to seven:

```
s1 questionnaire ──> s2 editor ──Finish──> s3 hold ──gate 1──> s4 energy
                        ▲   │                                     │
                        └───┘  (band tap → replay)                ▼
                                                               s5 hold
                                                                  │
                                             s7 done <── s6 reveal ┘  gate 2
```

**Scope boundary.** This plan builds the attribute, the stage, the gate, and the pure arithmetic. It does **not** build the S7 summary display — whether a workday, a weekend day, or a whole week reads as net-energy-positive is rendered by a separate agent working from §Handoff below. Everything that agent needs is a function and a snapshot field this plan ships and tests.

---

## Decisions taken

Resolved with the user before writing, 2026-08-27.

| Area | Decision | Rejected |
|---|---|---|
| Scale | **Five-point, −2 … +2.** `net(dt) = Σ hours(dt) × level` | A forced gain/drain binary; a gain/neutral/drain ternary. Both were cheaper stages and coarser data; the user took the resolution. |
| Stage ids | **Renumber straight through.** Energy is `s4`, the second hold `s5`, reveal `s6`, done `s7`. | Adding `energy` / `hold2` as new ids beside the existing five; suffixing the holds `s3e` / `s3w`. Both avoided the renumber; the user took the readable machine over the cheap migration. The cost is named in §The renumber and in §Risks. |
| Room gate | **Ordinal.** `rooms.open_stage ∈ {0,1,2}`, monotonic. `POST /room/:id/stage { to }`, `GET /session/:id/stage → { openStage }`. | Two independent booleans, which can express `reveal open, energy never opened` — a state the flow forbids; a self-opening energy stage, which stops the room moving together. |
| School's level | **Pack-declared.** `ActivityDef.energy` carries it; the participant does not rate `school`. | Asking on the pace screen after the commitment; excluding school from the net entirely. |

### Resolved in this plan, not by the user

**Levels are participant state, not answers.** They live in `PersistedState.energy: Record<activityId, EnergyLevel>`, beside `authored`, and not in the `AnswerMap`. `authored` is the precedent and the reasoning is the same one §5 gives for it: the answer map is the questionnaire's, keyed by pack field ids, consumed by estimators, gates and `s1.progress`. An energy level is none of those things — no estimator reads it, no gate turns on it, and it must not move the progress count on a screen it does not belong to. Putting it in the answer map would mean minting a field per activity, on a screen outside the questionnaire, that `reachableScreens` then has to be taught to skip.

**Only activities with hours are rated.** A row appears for every non-locked activity with `hours > 0` on either day type at the moment the stage opens. A gated-out section and a zeroed activity contribute `0 × level = 0` to every net figure, so rating them buys nothing and costs a tap each. The edge this opens is real and accepted: an activity restored from **Not included** during the S6 rebalance (§7.7) was never rated and stays at `0`. It is neutral rather than wrong, and the alternative — sending the participant back to a stage the room has left — is worse.

**No level is preselected, and Continue waits for all of them.** Neutral is `0`, and `0` is also what an untouched row would hold; if the control shipped with the middle rung lit, the two would be indistinguishable in the data and a participant who tapped nothing would read as one who considered every activity and called them all neutral. So rows start unset, the control shows no selection, and the continue control enables when the last row is rated. Force-advance (§E.5) is the one path that produces zeros nobody chose, and it is logged as such.

**Hours are not shown on the rating screen.** The row is a label and its hue chip. The rating is about what an activity does to the participant, and putting `40 h` beside `Work` invites them to rate the size instead of the experience — the weighting is the instrument's job and it happens after. The cost, stated: a participant who calls a 30-minute activity +2 and an 8-hour one −1 may find the S7 figure counter-intuitive, because they rated experiences and were scored on hours. That is the finding, not a defect, and it is the S7 agent's copy problem.

**The second hold gets its own copy.** `s5.title` / `s5.lines[]`, not a reuse of `s3.*`. Same component, different strings — a wait screen that reads identically to one seen four minutes earlier reads as a stuck app, and §6.3 already forbids the client saying anything that looks like breakage during a hold.

**No second `/ready`.** `POST /session/:id/ready` keeps its meaning — the participant finished the editor — and no endpoint is added for "finished rating". The facilitator's second decision is read off `inStage.s5`, which the console already polls and which counts exactly the people waiting on gate 2. One endpoint fewer, and `ready / total` keeps meaning one thing throughout.

---

## The renumber

Taken knowingly against a live collision: `stage-10-cut-summary` is being built in parallel and its steps 10.6–10.7 name S5 throughout. **That branch's `s5` is this plan's `s7`.** Merge order and the exact edits are in §Edits to plan 24.

| Was | Is | Screen |
|---|---|---|
| `s1` | `s1` | questionnaire |
| `s2` | `s2` | editor |
| `s3` | `s3` | hold — gate 1 |
| — | `s4` | **energy** (new) |
| — | `s5` | **hold — gate 2** (new) |
| `s4` | `s6` | reveal, pace, striped stack |
| `s5` | `s7` | done / summary |

**Two stores hold stage ids and both need migrating.**

*The database.* `sessions.stage` holds `'s4'` and `'s5'` rows meaning reveal and done. `schema-003-stage-renumber.sql` rewrites them — `'s5' → 's7'` then `'s4' → 's6'`, in that order so nothing collides — and the migration runner's existing test covers that it runs once.

*localStorage.* A phone that refreshes across the deploy holds `stage: 's4'` meaning *reveal* and would resume into the energy stage. `PersistedState` gains `v: 2`; a record without it keeps its answers, its `authored` hours and its session identity, and resumes at **`s2`** rather than at the stage it names. The stage pointer is the only field whose meaning changed, and the editor is the safe place to land — re-enterable, non-destructive, and the stage every path passes through. Pre-workshop this costs nobody anything; mid-workshop it would cost one participant a Finish press.

---

## Spec amendments

The build follows this section rather than the sections it overrides, on the convention `plans/24-implementation-plan.md` §Resolved contradictions established.

- **§2.2** — the stage table gains `s4 energy` (advance: every listed activity rated **and** `openStage ≥ 2`, server-authoritative) and `s5 hold` (advance: `openStage == 2` **and** ≥5 s elapsed, server-authoritative). `s4`/`s5` in the current table become `s6`/`s7`. "Entry to S4 forces the day-type selection to `wd`" moves to **S6** — it is the reveal that needs the workday on screen.
- **§3.2** — `Activity` gains `energy?: EnergyLevel`, pack-declared and populated only for `locked` activities.
- **§3.4** — derived state gains `net(dt)` and `netWeekly`, defined in §E.1.
- **§4.1** — `ContentPack` gains `energy: EnergyDef`.
- **§4.6** — three validation rules, in §E.2.
- **§6.1 / §6.2.2** — `stage_open: boolean` becomes `openStage: 0 | 1 | 2` on both the participant poll and the console status; `POST /room/:id/stage` takes `{ to }` rather than `{ open: true }`. `inStage` gains `s6` and `s7`.
- **§6.2.3 / §6.2.4** — the console runs the arm-and-confirm sequence twice, against two different labels and two different counts (§E.8).
- **§6.2.5** — one `stage.open` record per **flip**, two per room, distinguished by `to`. The room's `t = 0` for *time to fit, room* is the `to = 2` record.
- **§6.3** — the gate table is restated per level in §E.5.
- **§9** — nine keys join the required table (§E.2).
- **§10** — `EventType` gains `energy.set`; `ScheduleSnapshot` gains `energy` and `net`.
- **§12** — eight criteria added (59–66) and four amended (33, 37, 50, 53–55).

---

## Stage E — Energy per activity

Depends on Stages 6, 7 and 8 (all complete). Blocks step 10.6, which cannot show a net-energy figure that does not exist yet.

- [x] **E.1 The energy domain** (§3.2, §3.4) — `lib/domain/energy.ts`, pure and DOM-free.

  ```ts
  export type EnergyLevel = -2 | -1 | 0 | 1 | 2;
  export type EnergyLevels = Record<string /* activityId */, EnergyLevel>;

  /** Pack constant for a locked activity, the participant's level otherwise, 0 if unset. */
  export function energyOf(activity: Activity, levels: EnergyLevels): EnergyLevel;

  /** Σ hours(dt) × level. Units: energy-hours. */
  export function netEnergy(activities: Activity[], levels: EnergyLevels, dt: DayType): number;

  /** net('wd') × 5 + net('we') × 2 — §3.1's week, not a re-derivation of it. */
  export function netWeekly(activities: Activity[], levels: EnergyLevels): number;

  export function polarity(net: number): 'positive' | 'neutral' | 'negative';
  ```

  `netWeekly` calls `netEnergy` twice and multiplies by `DAYS_PER_WEEK`, so the week is defined in one place (§3.1) and cannot drift from `weekly()`.

  **`polarity` takes a tolerance of `1e-9`, against this plan's own instruction.** The instruction was to compare against exact zero, on the grounds that hours land on quarter-hours and levels are integers. Half of that survived the building: a week whose levels are all `0` does sum to exactly `0`, because every term is a product with zero, and that is the zero that actually happens — an unrated week, and a force-advanced one. The other half does not. Pack fallbacks carry values like `1.7` and the household estimator emits arbitrary reals, so two terms that cancel in arithmetic can miss each other by an ulp and report a level week as `negative`. The granularity that means anything here is 0.25 energy-hours — a quarter of an hour at one rung — so a tolerance nine orders of magnitude below it hides no tie a participant could produce. Both cases are tests.
  *AC: 65 (with E.9)*

  **Built 2026-08-27.** `lib/domain/energy.ts` and `lib/domain/energy.test.ts` (19 tests); `EnergyLevel`, `EnergyLevels` and `Activity.energy` live in `lib/domain/types.ts` with the rest of §3.2 and are re-exported from `energy.ts`, so §Handoff's import path holds without a cycle. `ENERGY_LEVELS` and `isEnergyLevel` ship here too — E.2's pack validation and E.9's persistence both need to know what a rung is, and the scale is domain vocabulary rather than either one's private business. AC 65 stays open until E.9 gives it a snapshot to assert against.

- [x] **E.2 Pack: the energy block** (§4.1, §4.6, §9) — `ContentPack` gains:

  ```ts
  interface EnergyDef {
    prompt: string;              // copy key
    note?: string;               // copy key
    scale: { value: EnergyLevel; label: string }[];  // label is a copy key
  }
  ```

  `ActivityDef` gains `energy?: EnergyLevel`. Three validation rules, failing loudly in dev and falling back to last-good in production like every other §4.6 rule:

  - `energy.scale` holds exactly the five values −2 … +2, each once, each with a resolving copy key;
  - every `locked` activity declares `energy`;
  - no non-locked activity declares it — the participant owns that value, and a pack that shipped one would silently overrule them.

  **Copy, and a correction to this plan's own list.** It named nine keys for `REQUIRED_COPY_KEYS`, four of which should not be there. `s4.energy.title` and `s4.energy.note` duplicate `energy.prompt` and `energy.note`, which the block above declares by name and `copy-key-exists` already checks resolve; requiring a second fixed name for the same string would only stop a pack calling it something else. The five `energy.level.*` keys are the same case — they are `scale[].label` values, checked dynamically, and hardcoding their names would forbid a pack that spells its rungs differently. So the required table gains **two** keys, which are the two the *client* asks for by name and no pack declares: `s4.energy.continue` and `s5.title`. `s5.lines[]` joins on §9's own terms — a minimum of four, checked by the same rule as `s3.lines[]`, now run over both prefixes.

  The register applies in full — the rung labels describe the participant's experience and may not characterise it, so no rung says anything like *healthy*, *productive* or *wasted*, and `v1.test.ts` asserts it the way it already asserts the outcome ladder. `packs/v1/pack.json` ships `school: { energy: 2 }`; the value is content and the facilitator may change it without a client release.
  *AC: 59 (with E.6)*

  **Built 2026-08-27.** Three rules — `energy-scale`, `energy-locked-declared`, `energy-participant-owned` — take §4.6 from fourteen to seventeen, each fired by its own test. `holdLines(pack, prefix)` gained a prefix so E.7's second hold reads its lines through the same function, and `HOLD_LINES_PREFIXES` is what the four-line minimum now runs over. `ContentPack.energy` is required rather than optional: a pack without it cannot run the stage, and an optional block would push that failure from load time into the middle of a room.

- [ ] **E.3 The renumber** (§2.2) — mechanical, in its own commit, no behaviour change and no new screens. `StageId`, `STAGE_ORDER`, `Stages.tsx`, `persist.ts`, `queries.ts` (`inStage`), `Console.tsx`, and every e2e spec that names a stage. `schema-003-stage-renumber.sql` rewrites `sessions.stage`; `PersistedState.v = 2` drops a stale stage pointer to `s2` (§The renumber). The commit is reviewable as a rename: after it, the machine is `s1 → s2 → s3 → s6 → s7` with two ids unused, and every existing test passes with its names updated.
  *AC: none directly — every criterion it touches is re-asserted by E.5–E.8*

- [ ] **E.4 The gate becomes an ordinal** (§6.1, §6.2.2, §6.2.4, §6.2.5) — `schema-004-open-stage.sql` adds `rooms.open_stage INTEGER NOT NULL DEFAULT 0`, backfills `stage_open × 2` (a room that was open was open to the reveal), and drops `stage_open`. `room_events` gains `to_stage INTEGER`, so §6.2.5's one-record-per-flip becomes two records distinguished by level, each carrying `ready` and `total` at that moment.

  `openStage(roomId, to)` is **monotonic**: a call at or below the room's current level is a no-op that returns `ok`, which keeps §6.2.4's idempotence and extends it — a facilitator who double-presses the second button, or presses the first after the second, changes nothing. `POST /room/:id/stage` takes `{ to: 1 | 2 }`; anything else is a 400. `{ open: true }` is not accepted — it names a boolean that no longer exists, and a route that guessed which level it meant would guess wrong half the time.

  `GET /session/:id/stage` returns `{ openStage, serverTime }`, same 1 s `private` cache. `GET /room/:id/status` returns `openStage` in place of `stageOpen`.
  *AC: 62, 63*

- [ ] **E.5 Gate semantics at two levels** (§6.3) — the poll now reports an ordinal, and Stage 6's rule survives intact by reading it the same way: **force-advance keys off an observed increase, never off a reading.** A client remembers the lowest level it has seen; a participant who joins after both presses is never yanked out of a question, and runs `s1 → s2 → s3 → s4 → s5 → s6` at their own pace, holding 5 s at each of the two holds because both gates are already satisfied.

  | Participant state | Level reaches 1 | Level reaches 2 |
  |---|---|---|
  | In s3 (finished, waiting) | advance to s4 once ≥5 s in s3 | — |
  | In s4 (rating) | — | advance to s5, hold 5 s, then s6; unrated activities stay at `0` |
  | In s5 (waiting) | — | advance to s6 once ≥5 s in s5 |
  | Finishes s2 after level 1 | enter s3, hold the full 5 s, then s4 | — |
  | Still in s1 or s2 | snapshot, POST `/ready`, s3, hold 5 s, then s4 | same, then straight through s4 and s5 with a 5 s hold at each; every activity at `0` |

  The 5 s floor applies to both holds and to every path, for the reason §6.3 gives once: it is a beat in the room, not a network wait. It is measured in memory on both holds and a refresh restarts it (§11).

  A participant pulled past the energy stage emits `forced.advance` with `stage: 's6'`, so the log distinguishes them from someone who rated everything and moved on — a run of zeros that nobody chose must not read as a week of perfect neutrality in the debrief.
  *AC: 64; 33 amended (the floor holds at both holds)*

- [ ] **E.6 The rating screen** (§9, §7.5) — `components/participant/Energy.tsx`. One row per activity with hours on either day type, in `order`: the hue chip, the label, and a five-rung control from `energy.scale`. No hours, no bands, no spine — the stack is a picture of a week and this is a question about it (§Decisions).

  Rows start unset and the continue control enables on the last rating. Colour is orientation and the label is identification (§7.5), so the chip is never the only thing distinguishing two rows and the screen is usable in greyscale. Targets are 44 px, which is what fixes the control to five rungs rather than seven: five rungs at 44 px fit across 320 px with the label above them, and seven do not.

  Each commit emits `energy.set { activityId, from, to }` — `from` absent on the first rating for a row, present on a change, which makes a revised rating visible in the log as a revision rather than as two independent facts.
  *AC: 59, 60, 61*

- [ ] **E.7 The second hold** (§6.3, §9) — the `Hold` component, `s5.title` and `s5.lines[]`, and the same silent jittered poll. Plausible and dull for the same reason §9 gives, and distinct from `s3.*` so the second wait does not read as the first one repeating.
  *AC: 33 (amended)*

- [ ] **E.8 Console: two presses** (§6.2.2, §6.2.3, §6.2.4) — one sequence per gate, run in order, each arm-and-confirm with a 5 s revert and each restating `total` in its armed label. Gate 2's control is inert until gate 1 is open — the machine cannot skip the energy stage, and a console that let it be skipped would strand every participant in `s4`.

  **The number above the button changes with the gate.** Before gate 1 it is `ready / total`, unchanged. After gate 1 it is `inStage.s5 / total` — the people who have finished rating and are waiting — because that is the count the second decision rests on, and `ready` after gate 1 counts something already settled. Same type, same position, same no-transition rule (§6.2.3).

  The breakdown goes from five counts to seven and must still sum to `total`. At 375 px seven counts wrap to two rows rather than shrinking; §12's AC 58 is a no-horizontal-scroll rule, not a one-line rule.
  *AC: 66; 50 amended (seven counts); 53–55 amended (per press)*

- [ ] **E.9 Snapshot and persistence** (§5, §10) — `ScheduleSnapshot` gains `energy: EnergyLevels` and `net: { wd: number; we: number; weekly: number }`. Both are populated on the `complete` snapshot and absent from `s1` and `finish`, which are taken before the stage exists — no fourth `SnapshotKind`, and the `snapshots.kind` CHECK is untouched.

  `net` is stored as well as derivable, and the test asserts they agree: the debrief and the S7 screen read the stored figure, and `netEnergy` recomputed from `activities` and `energy` in the same snapshot must equal it. A stored figure that can drift from its own inputs is worse than no stored figure, so the equality is a test rather than a comment.

  `PersistedState` gains `energy`, written on every rating like every other field change (§5).
  *AC: 65*

- [ ] **E.10 Tests and sweep** — unit: `energy.test.ts` over zero-hour activities, locked school taking the pack constant, an unset level reading `0`, and `netWeekly` against a hand-computed week. Component: the rating control unset → rated → revised, and continue gated on completeness. E2E: `e2e/energy.spec.ts` drives a real room through both presses, including a participant force-advanced past the rating screen and one who joins after both presses. Regression: every existing e2e spec passes under the renumbered ids. Console at 375 px with seven counts.

**Stage E done when:** a room is driven end to end through two facilitator presses; a participant rates every activity, holds twice, rebalances and completes; the complete snapshot carries their levels and a net figure that recomputes to itself; a participant force-advanced from S1 reaches S6 with zeros that are logged as forced; and `inStage`'s seven counts sum to `total` throughout.

---

## New acceptance criteria

Numbered from 59, continuing §12's sequence.

**Energy**
59. Every non-locked activity with hours on either day type appears exactly once on the rating screen, in `order`; a gated-out or zeroed activity appears not at all, and `school` never appears.
60. No rung is preselected on any row, and the continue control is disabled until every row is rated.
61. A rating survives a refresh at S4 and is restored to the rung that was chosen.
62. `POST /room/:id/stage { to: 1 }` opens the energy stage and not the reveal: a participant in S3 advances to S4 after the 5 s floor, and a participant in S5 does not move.
63. `POST /room/:id/stage { to: 2 }` advances a participant waiting in S5 to S6 after the 5 s floor. A call with `to` at or below the room's current level returns `ok` and changes nothing.
64. A participant still in S1 or S2 when the level reaches 2 is force-advanced through both holds to S6, with every activity at level `0` and a `forced.advance` naming S6.
65. The `complete` snapshot carries every activity's level and the three net figures, and `netEnergy` recomputed from that snapshot's own `activities` and `energy` equals the stored `net`.
66. The console renders seven stage counts summing to `total`, runs both press sequences in order with gate 2 inert until gate 1 is open, and holds at 375 px with no horizontal scroll.

**Amended**
- **33** — the 5 s floor holds on **both** holds, in every entry path, and a refresh restarts whichever one is on screen.
- **37** — entry to **S6**, not S4, forces the day-type selection to `wd`.
- **50** — seven stage counts, not five.
- **53, 54, 55** — each applies to each of the two press sequences independently.

---

## Handoff — what the S7 summary agent gets

Everything below exists and is tested when Stage E is done. The other agent builds no arithmetic.

```ts
import { netEnergy, netWeekly, polarity, energyOf } from '@/lib/domain/energy';
import type { EnergyLevel, EnergyLevels } from '@/lib/domain/energy';

netEnergy(activities, levels, 'wd')   // energy-hours, one workday
netEnergy(activities, levels, 'we')   // energy-hours, one weekend day
netWeekly(activities, levels)         // energy-hours, the week (×5 / ×2)
polarity(n)                           // 'positive' | 'neutral' | 'negative'
```

- Levels come from `session.energy` live, and from `snapshot.energy` on the `complete` snapshot.
- `snapshot.net` holds `{ wd, we, weekly }` already computed at confirm.
- `school` is included in every figure at its pack-declared level; it is not the participant's rating and the copy should not imply it is.
- Copy keys `s7.*` are the summary agent's to add. `s4.energy.*`, `s5.*` and `energy.level.*` are this plan's and are already in the pack.
- **The weighting is worth reading before designing the screen.** The figure is hours-weighted, and sleep is eight of a workday's twenty-four hours. A participant who rates sleep +2 starts a workday at +16 and will read net-positive against almost any working day; one who rates it 0 will not. That is a property of the instrument, not a bug to correct in this plan — but a screen that announces *your workday is net-energy-positive* without qualification is announcing, for many participants, a fact about how they rated sleep. Whether to show the number, the sign, a per-activity breakdown, or all three is the summary agent's decision, and it should be made with this in front of it.

---

## Edits to plan 24

`plans/24-implementation-plan.md` is being edited in parallel on `stage-10-cut-summary`. Nothing in this plan touches that file, so the two merge without conflict. When both land, make these edits in one commit:

1. Insert a pointer after Stage 8: *"**Stage E — Energy per activity** (`plans/25-energy-per-activity.md`) runs here. It blocks step 10.6."*
2. In the header, `**Implements:** … 58 numbered acceptance criteria` becomes 66, plus the lettered ones.
3. **Steps 10.6 and 10.7 are about `s7`, not `s5`.** Every occurrence of S5 in those two steps means the done stage, which the renumber moved. The screen, the reasoning and the copy keys are unchanged; `s5.title` / `s5.noCuts.*` become `s7.*`, because `s5.*` now names the second hold's status lines.
4. Step 10.6 gains the net-energy figures as a second thing the screen may show, per §Handoff.
5. The Coverage table gains rows 59–66 against E.1–E.10.
6. Risks gains the two rows below.

---

## Risks

| Risk | Where addressed |
|---|---|
| The renumber lands on top of, or under, the parallel S5 summary branch and one of them silently keeps the old meaning of `s5` | E.3 is a standalone commit that renames and nothing else, and §Edits to plan 24 item 3 names every string that must move with it. Merge `stage-10-cut-summary` **first**, then this stage, so the rename passes over finished code rather than under code being written. |
| Hour-weighted net is dominated by sleep, and most workdays read net-positive regardless of the working day | Named in §Handoff and handed to the summary agent as a design input rather than corrected here. The arithmetic is what the user specified; what the screen says about it is the open question. |
| Ten rows of five rungs is a long stage in a room that has already answered twenty questions | E.6 keeps it one screen with no per-row navigation, and §Decisions keeps zero-hour activities off it. If it still runs long, the lever is the pack: `energy.scale` is content, and a three-rung pack is a valid pack under E.2's rules only if §4.6's five-value check is relaxed — which is a decision to bring back, not to take in the building. |
| A second facilitator press is a second thing to forget, and a room stuck in `s4` looks like a room that is working | E.8 puts `inStage.s5 / total` above the second button in the same position as `ready / total`, so the count that says *they are waiting for you* is the largest thing on the console at that moment. |
