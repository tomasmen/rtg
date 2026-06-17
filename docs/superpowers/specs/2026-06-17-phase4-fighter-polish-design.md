# Phase 4 — Fighter Polish ("Stickfight") Design

**Status:** Approved (2026-06-17). Supersedes nothing; extends the Phase 3 fighter.

**Goal:** Turn the server-authoritative 2D fighter from a correctness prototype (colored rectangles, one punch, single round) into a *nice, playable, good-feeling* game: procedural thin-line stick figures, a medium-depth move set, best-of-3 rounds, and impact juice (hitstop, screen shake, sparks, knockback). Stay server-authoritative, all-TypeScript, paradigm-agnostic for future games.

**Audience:** office walk-up 1v1, each player on their own device. Readability and pick-up-and-play beat fighting-game authenticity.

---

## 1. Decisions (locked)

| Topic | Decision |
|---|---|
| Depth | **Medium** — edge-jump, light/heavy attacks, air attack, dash, crouch, knockback, blockstun |
| Stick style | **Classic thin line** (circle head, single-stroke limbs), per-player color + colored headband |
| Animation | **Procedural / skeletal** — joints computed from `(phase, phaseFrame, facing, t)`; no sprite assets |
| Match | **Best-of-3** rounds, first to 2 round-wins, intro countdown + round pips |
| Juice | Hitstop + screen shake, hit sparks + white flash, knockback/stagger; **sound stubbed** (no-op `audio.ts`) |
| Block | **Omni-directional, dedicated key `L`** (held). No high/low blocking mind-game. |
| Crouch | A real duck: lowers hurtbox so a standing **heavy** whiffs over you; enables a **low poke**. No block-direction rules. |
| Anti-turtle | blockstun + chip on heavies + corner knockback + timeout-favors-higher-HP + can't-attack-while-blocking |
| Throws | Out of scope (YAGNI for medium). Noted as future. |
| Mobile/touch | Out of scope for Phase 4 (assumes laptops). Future: on-screen buttons. |

---

## 2. Controls

Keyboard, each player on their own device. On-screen hint reflects this.

| Action | Key(s) | Notes |
|---|---|---|
| Move | `A`/`D` or `←`/`→` | |
| Crouch | `S` or `↓` | duck |
| Jump | `W`/`↑`/`Space` | **edge-triggered**, one jump per press, single jump |
| Light (jab, arm) | `J` | edge-triggered |
| Heavy (kick, leg) | `K` | edge-triggered |
| Block | `L` (hold) | omni-directional |
| Dash / back-dash | double-tap `A` or `D` | detected server-side from `moveX` edges; no extra key |

---

## 3. Mechanics (numbers are the starting tuning; refined live)

All in arena units; `DT = 1/30`. Frame counts are sim ticks.

- **Edge-triggered jump.** Jump fires only on the rising edge of the jump input; must release and re-press. One jump (no air-jump). `JUMP_V = 760`.
- **Light attack (jab).** startup 3f → active 3–5f → total 9f. range 70, dmg 6, hitstun 10f, knockback 120 u/s, low recovery. Pressure tool. Uses an **arm** (drawn at torso-upper height).
- **Heavy attack (kick).** startup 7f → active 8–12f → total 22f. range 95, dmg 13, hitstun 18f, knockback 340 u/s, high recovery (punishable on whiff/block). Spacing/reward. Uses a **leg** (drawn at torso-mid height = a "high" that a crouch ducks under).
- **Air attack.** Pressing light or heavy while airborne → a single downward-angled **air kick**: active most of the airborne time, dmg 8, knockback 200, enables jump-ins. One per jump.
- **Low poke (crouch + light).** Crouching light = a **low** kick: range 75, dmg 5, must be reacted to on the ground; hits crouchers and standers alike.
- **Crouch.** Hold down → `phase='crouch'`. Lowers the fighter's hurtbox top so a standing **heavy** (high) and **air kick** whiff over the croucher; standing light and lows still connect. Can't move while crouching (can still block by also holding `L` → crouch-block, still omni). Releasing returns to idle.
- **Dash / back-dash.** Double-tap a direction within `DASH_TAP_WINDOW = 9f` → `phase='dash'`: a burst (`DASH_SPEED = 620`) for `DASH_FRAMES = 8`, then brief recovery. Forward dash closes distance; back-dash retreats. Committed (can't turn mid-dash).
- **Knockback + hitstun.** On hit, victim enters `hitstun` for the move's hitstun frames and gets `vx = knockbackDir * knockback`; friction (`GROUND_FRICTION = 1800 u/s²`) decays it. Clamped at walls (corner = victim stops, stun continues → corner pressure).
- **Block + blockstun.** Holding `L` (grounded) → `phase='block'`. A blocked hit: no hitstun, instead `phase='blockstun'` for `BLOCKSTUN_FRAMES = 8` (light) / `12` (heavy), small pushback, and **chip** (`BLOCK_CHIP_LIGHT = 0`, `BLOCK_CHIP_HEAVY = 2`). Can't attack while blocking or in blockstun.
- **Health / pacing.** `MAX_HP = 100`. ~8–12 clean hits per round; rounds land ~10–25s. `ROUND_SECONDS = 60` cap.

### High/low summary (no blocking mind-game)
Reading "high vs low" only governs **whether an attack connects vs a croucher**, never which way you block:
- Standing **heavy** (high kick) & **air kick** → whiff over a croucher.
- **Light**, **low poke** → hit a croucher.
- Block (`L`) stops everything regardless of stance.

---

## 4. Match / round state machine

`fightMatch` gains a round-level state machine driven by the existing 30 Hz tick using `ctx.timestamp` (deterministic):

```
intro ──(now ≥ phaseEndsAt)──▶ fighting ──(KO or timeout)──▶ roundEnd
   ▲                                                            │
   └──────────(next round: reset fighters)──── not match over ──┤
                                                                 │ match over
                                                                 ▼
                                                             matchEnd  (tick stops, room 'finished')
```

- **intro** (`INTRO_SECONDS = 2`): "Round N — FIGHT!", inputs ignored (sim not stepped). On expiry → `fighting`, set `endsAtMicros = now + ROUND_SECONDS`.
- **fighting**: step sim. Round ends on KO (winner = other slot) or timeout (winner = higher HP; exact tie → no point). → `roundEnd`, `phaseEndsAt = now + ROUND_END_SECONDS (2)`.
- **roundEnd**: pause showing "K.O.!"/result. On expiry: award round-win (if any), then if a side reached `ROUNDS_TO_WIN = 2` → `matchEnd`; else `round++`, reset both fighters to `initialFighter(slot)`, → `intro`.
- **matchEnd**: stop the tick, set room `status='finished'`; fighter rows persist so clients can show the winner. (See §7 cleanup.)

Round/match transition logic is **pure** in `rounds.ts` and unit-tested; `match.ts` does the table I/O, timestamps, and event emission.

---

## 5. Juice (client) + event bridge

Server emits transient **event-table** rows; clients react. The pure sim returns hit events; `match.ts` and the round machine emit them.

- **`fightEvent`** (`event: true, public: true`): `{ id u64 autoInc pk, roomId u64, kind string, x f32, y f32, amount f32 }`.
  - `kind`: `'hit' | 'block' | 'ko' | 'roundStart' | 'roundEnd' | 'matchEnd'`.
  - `amount`: damage (hit/block), round number (roundStart), winner slot (roundEnd/matchEnd).
  - Event rows broadcast via `onInsert` and are **not** stored client-side (verify server-side non-persistence against current SpacetimeDB docs during build; add cleanup only if they persist).
- **`step()` returns events.** New return shape `{ status, tick, fighters, events: SimEvent[] }` where `SimEvent = { kind:'hit'|'block', victimSlot, x, y, amount }`. Keeps the sim pure; `match.ts` inserts the matching `fightEvent` rows.
- **Client effects** (`effects.ts`, fed by `fightEvent.onInsert`, filtered by `roomId`):
  - **Hitstop**: client-side render freeze ~3–5 frames on `hit` (visual only; authoritative sim never pauses).
  - **Screen shake**: decaying random camera offset, magnitude ∝ `amount`.
  - **Hit sparks**: short-lived particles at `(x,y)`.
  - **White flash**: struck fighter tinted white a few frames (keyed by which slot, derived from victim position / a slot in the event — include `victimSlot` via `amount` sign or a dedicated lookup; simplest: nearest fighter to `(x,y)`).
  - **Knockback** is sim-driven; client just renders the slide + reel pose.
- **`audio.ts`** (stub): `playSfx(kind: string)` no-op, wired to the same `onInsert`. Adding real sound later = drop files + implement, no replumbing.
- **Input buffering** (client): an attack pressed a few frames before you're actionable still fires (buffer the intent briefly). Keeps combat responsive over the network.

---

## 6. Visuals — procedural skeleton

- **`skeleton.ts`** (pure, tested): `pose(phase, phaseFrame, facing, t) → Joints` where `Joints = { head:{x,y,r}, neck, hip, hands:[L,R], feet:[L,R], elbows/knees as needed }` in a local fighter frame (origin at feet, +y up). Deterministic; key poses snapshot-tested for sane coordinates.
- Poses: idle (breathing bob, hands-up stance), walk/dash (stride + lean), jump (tuck), crouch (low, bent knees), light (arm jab toward facing), heavy (wind-up + leg kick), air kick (angled), low poke, block (arms-up guard / crouched guard), hitstun (reel, head snap back), ko (slump).
- **`render.ts`** rewrite: background + ground, then for each fighter stroke bones between joints (round caps), circle head, per-player stroke color + a small filled **headband** so the two thin figures stay distinguishable; draw sparks/flash; apply the shake offset as a canvas transform. HP bars + **round pips** under each bar; round/intro/result banners.
- Facing flips the local frame horizontally.

---

## 7. Data model changes

**`fighter`** (public) — add: `attackKind string` (`'none'|'light'|'heavy'|'air'|'low'`, for rendering), and sim-internal memory used for edge/dash detection: `prevJump bool`, `prevLight bool`, `prevHeavy bool`, `prevMoveX i8`, `dashTapDir i8`, `dashTapFrames u32`. (Kept on `fighter` for a single-row read/write per tick; clients ignore the memory fields.)

**`fightInput`** (public) — replace `attack` with `light` + `heavy`, add `crouch`: `{ moveX i8, jump bool, light bool, heavy bool, block bool, crouch bool, seq u32 }`.

**`fightMatch`** (public) — add: `phase string` (`'intro'|'fighting'|'roundEnd'|'matchEnd'`), `round u32`, `roundWins0 u32`, `roundWins1 u32`, `phaseEndsAtMicros u64`. Keep `status` as overall (`'live'|'done'`), `tick`, `endsAtMicros` (per-round timer), `roomId`.

**`fightEvent`** (new, `event: true, public: true`) — §5.

**`setInput`** reducer args → `{ moveX i8, jump bool, light bool, heavy bool, block bool, crouch bool }`. Client `module_bindings` regenerated after publish.

**Cleanup / leak fix:** `endFightMatch` already deletes `fighter`/`fightTick`/`fightInput`/`fightMatch` for a room. Audit the room lifecycle so a *finished* room (KO/timeout/matchEnd) still routes through `endGame`→`endFightMatch` when both players leave or disconnect — fixing the orphaned-`fighter`-row leak. Verify in `core/rooms.ts` during build.

---

## 8. Files

**Server (`server/spacetimedb/src/games/fighter/`)**
- `constants.ts` — extend with all §3/§4 constants.
- `sim.ts` — extend `FighterState` (+`attackKind` + edge/dash memory), `Inputs` (`light`,`heavy`,`crouch`), pure `step()` returns `{...MatchState, events}`. Handles edge jump, light/heavy/air/low attacks, crouch hurtbox, dash, knockback, blockstun, friction. Heavy TDD.
- `rounds.ts` (new, pure) — round outcome + best-of-3 transition logic. Tested.
- `tables.ts` — column additions + `fightEvent`.
- `match.ts` — round state machine in the tick; reconstruct/​write extended state; emit `fightEvent`s; updated `setInput`; cleanup.

**Client (`client/src/games/fighter/`)**
- `skeleton.ts` (new, pure) — poses. Tested.
- `effects.ts` (new) — particles / shake / hitstop / flash state, fed by events.
- `audio.ts` (new) — `playSfx` stub.
- `render.ts` — skeleton + effects + pips + banners (rewrite).
- `constants.ts` — canvas/render constants (colors, pip layout, shake/flash params).
- `FighterGame.tsx` — new input mapping (light/heavy/crouch, edge jump, double-tap dash client-feel), `fightEvent` subscription → effects + audio, hitstop pause in the rAF loop, intro/round/result UI + pips.

**Tests (vitest):** `sim.test.ts` (edge jump, light vs heavy spacing/damage, air kick, low poke, crouch-ducks-heavy, dash burst, knockback decay + wall clamp, blockstun + chip, KO), `rounds.test.ts` (KO outcome, timeout-by-HP, tie, best-of-3 progression + match end), `skeleton.test.ts` (key poses produce in-bounds, sane joints).

---

## 9. Architecture invariants (don't regress)

- Sim stays **pure & deterministic** (no time/random/IO); all state from tables; `step()` returns data, `match.ts` does IO.
- Keep the `schema.ts` instance isolated; `index.ts` re-exports only spacetime exports (add nothing else); the scheduled-table late-bound holder pattern stays.
- Server-authoritative: clients send intents, render interpolated state, never simulate authoritatively. Hitstop/shake/sparks/flash are client-visual only.
- Game stays pluggable behind the `GameDef`/dispatch layer; nothing fighter-specific leaks into `core/`.

---

## 10. Verification

- All vitest green (existing 19 + new).
- CI green; publish to Maincloud; regenerate client bindings; deploy client to Pages.
- **Live two-client test** (chrome-devtools): two browsers, quick-match, verify edge jump (no bounce), light/heavy feel + knockback, crouch ducks heavy, dash, block + blockstun + chip, hitstop/shake/sparks/flash fire, best-of-3 intro→rounds→pips→match end, and clean teardown (no orphan rows via `spacetime sql`).
- Build executed under **ultracode** (Workflow orchestration where it adds value: parallel pure-module authoring + adversarial review), with TDD throughout.
