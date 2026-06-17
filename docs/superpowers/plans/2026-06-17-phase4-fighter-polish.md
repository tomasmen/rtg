# Phase 4 — Fighter Polish ("Stickfight") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 3 fighter prototype into a nice, playable, good-feeling game — procedural thin-line stick figures, medium-depth mechanics (edge-jump, light/heavy/air/low attacks, dash, crouch, knockback, blockstun), best-of-3 rounds, and impact juice (hitstop, screen shake, sparks, flash).

**Architecture:** Server stays authoritative at 30 Hz. The pure `sim.ts` `step()` now also *returns* hit events (stays pure). `match.ts` runs a per-round state machine (intro → fighting → roundEnd → matchEnd) and emits transient `fightEvent` rows. The client subscribes to `fightEvent` to drive purely-visual juice, renders fighters from a pure `skeleton.ts` pose function, and applies hitstop/shake/sparks/flash in the rAF loop.

**Tech Stack:** SpacetimeDB 2.6 TS module (WASM), Vite+React client, `spacetimedb/react`, vitest. Full design: `docs/superpowers/specs/2026-06-17-phase4-fighter-polish-design.md` (read it — this plan assumes its decisions).

**Conventions reminder (see `rtg-spacetimedb-gotchas` memory):** keep `schema.ts` isolated; `index.ts` re-exports only spacetime exports; scheduled-table late-bound holder stays; reducers register snake_case / SDK is camelCase; named-arg reducers called with an object. Server tests: `npm --prefix server/spacetimedb test`. Client tests: `npm --prefix client test`. Typecheck: `npm --prefix server/spacetimedb run typecheck` and `npm --prefix client run build`.

**Execution note (ultracode):** the two pure tracks — **Group A (server core)** and **Group B (client visual)** — touch disjoint files and may be built in parallel. **Group C (integration)** is sequential and driven inline because it needs the publish→`spacetime generate`→typecheck→deploy→live-verify loop. **Group D** finishes with an adversarial-review workflow + live two-client test.

---

## File Structure

**Server `server/spacetimedb/src/games/fighter/`**
- `constants.ts` — arena/physics + a `MOVES` table (per-attack frame data) + round/dash/block constants. Single source of tuning.
- `sim.ts` — pure types (`FighterState`, `Inputs`, `MatchState`, `SimEvent`) + `initialFighter` + `step()` (returns `{status,tick,fighters,events}`). The whole fighter physics/combat machine. Pure & deterministic.
- `rounds.ts` *(new)* — pure best-of-3 logic: `roundOutcome`, `applyRoundWin`. No IO.
- `tables.ts` — extend `fighter`/`fightInput`/`fightMatch` columns; add `fightEvent` event table.
- `match.ts` — round state machine in the tick reducer; reconstruct/write extended state; emit `fightEvent`; new `setInput`; teardown.

**Client `client/src/games/fighter/`**
- `constants.ts` — canvas + render constants (colors, pip layout, shake/flash/spark params, skeleton dimensions).
- `skeleton.ts` *(new)* — pure `pose(phase, phaseFrame, facing, t) → Joints`. No canvas.
- `effects.ts` *(new)* — mutable effect state (sparks, shake, hitstop, per-slot flash) + `pushEvent`, `tickEffects`. No canvas, no network.
- `audio.ts` *(new)* — `playSfx(kind)` no-op stub.
- `render.ts` — draw skeleton + ground + sparks + flash + shake transform + HP bars + round pips + banners.
- `FighterGame.tsx` — input mapping, `fightEvent` subscription → effects+audio, hitstop-aware rAF loop, intro/round/result UI.

**Tests:** `server/spacetimedb/src/games/fighter/sim.test.ts`, `rounds.test.ts`; `client/src/games/fighter/skeleton.test.ts`.

---

## Group A — Server pure core (TDD; parallelizable with Group B)

### Task A1: Constants

**Files:** Modify `server/spacetimedb/src/games/fighter/constants.ts`

- [ ] **Step 1: Replace the file with the extended constants**

```ts
// Arena is in abstract units; the client scales to canvas pixels.
export const ARENA_W = 800;
export const GROUND_Y = 0; // feet height above ground (y is up)
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
export const CROUCH_H = 78;      // hurtbox top when crouching (highs whiff above this)
export const DT = 1 / 30;

export const GRAVITY = -2000;
export const MOVE_SPEED = 320;
export const AIR_CONTROL = 0.6;  // fraction of MOVE_SPEED steerable in the air
export const JUMP_V = 760;
export const MAX_HP = 100;
export const GROUND_FRICTION = 1800; // u/s^2 applied to knockback slide

export type AttackKind = 'none' | 'light' | 'heavy' | 'air' | 'low';

export interface MoveDef {
  startup: number;   // first active frame
  activeTo: number;  // active window is [startup, activeTo)
  total: number;     // recovery ends here
  range: number;     // reach beyond the fighter's front edge
  dmg: number;
  hitstun: number;
  kb: number;        // knockback speed (u/s) applied to victim
  hitsCrouch: boolean; // false => whiffs over a croucher (a "high")
  blockstun: number;
  chip: number;      // damage dealt on block
}

// Per-attack frame data — the single combat tuning table.
export const MOVES: Record<Exclude<AttackKind, 'none'>, MoveDef> = {
  light: { startup: 3, activeTo: 6,  total: 9,  range: 70, dmg: 6,  hitstun: 10, kb: 120, hitsCrouch: true,  blockstun: 8,  chip: 0 },
  heavy: { startup: 7, activeTo: 13, total: 22, range: 95, dmg: 13, hitstun: 18, kb: 340, hitsCrouch: false, blockstun: 12, chip: 2 },
  air:   { startup: 3, activeTo: 15, total: 18, range: 75, dmg: 8,  hitstun: 14, kb: 200, hitsCrouch: false, blockstun: 10, chip: 1 },
  low:   { startup: 5, activeTo: 10, total: 16, range: 75, dmg: 5,  hitstun: 12, kb: 120, hitsCrouch: true,  blockstun: 8,  chip: 0 },
};

export const DASH_TAP_WINDOW = 9;  // frames between taps to trigger a dash
export const DASH_SPEED = 620;
export const DASH_FRAMES = 8;

export const ROUND_SECONDS = 60;
export const ROUNDS_TO_WIN = 2;
export const INTRO_SECONDS = 2;
export const ROUND_END_SECONDS = 2;
```

- [ ] **Step 2: Verify it compiles** — `npm --prefix server/spacetimedb run typecheck` (will still pass; sim.ts not yet using new names). Expected: no errors, or only errors in sim.ts you fix in A2.
- [ ] **Step 3: Commit** — `git add server/spacetimedb/src/games/fighter/constants.ts && git commit -m "feat(fighter): combat frame-data + round/dash constants"`

---

### Task A2: Sim — types, edge inputs, attacks, crouch, dash, knockback, blockstun (TDD)

**Files:** Modify `sim.ts`; Modify `sim.test.ts`

This is the heart. Build it test-first, one mechanic per cycle. Final type shapes (define these first so all tests compile):

```ts
export type FighterPhase =
  | 'idle' | 'walk' | 'crouch' | 'jump' | 'dash'
  | 'attack' | 'block' | 'blockstun' | 'hitstun' | 'ko';

export interface FighterState {
  x: number; y: number; vx: number; vy: number; facing: number; hp: number;
  phase: FighterPhase; phaseFrame: number;
  attackKind: AttackKind;
  attackHasHit: boolean;      // prevents an active window from multi-hitting
  // input-edge & dash memory (sim-internal; persisted on the fighter row):
  prevJump: boolean; prevLight: boolean; prevHeavy: boolean;
  prevMoveX: number; dashTapDir: number; dashTapFrames: number;
}

export interface Inputs {
  moveX: number; jump: boolean; light: boolean; heavy: boolean;
  block: boolean; crouch: boolean;
}

export interface SimEvent { kind: 'hit' | 'block'; victimSlot: number; x: number; y: number; amount: number; }

export interface MatchState { status: 'fighting' | 'ko' | 'timeout'; tick: number; fighters: [FighterState, FighterState]; }
```

`initialFighter(slot)` returns all fields (memory fields zeroed: `prevJump/prevLight/prevHeavy=false`, `prevMoveX=0`, `dashTapDir=0`, `dashTapFrames=DASH_TAP_WINDOW`, `attackKind='none'`, `attackHasHit=false`, `phase='idle'`).

`step(prev, inputs, dt)` returns `{ status, tick: prev.tick+1, fighters, events }`. It: (1) steps each fighter's locomotion/phase via `stepFighter`, collecting no events; (2) sets facing toward the opponent; (3) runs `resolveHit` for each attacker→victim which *mutates the victim and pushes a `SimEvent`*; (4) checks KO. `resolveHit` damages only while `startup <= attacker.phaseFrame < activeTo` AND `!attacker.attackHasHit`; on a connect it sets `attacker.attackHasHit = true`. A blocked hit (victim grounded + `block` held, recorded via `phase==='block'`) → `kind:'block'`, chip damage, `phase='blockstun'`, small pushback; else `kind:'hit'`, full damage, `phase='hitstun'`, `vx = dir*move.kb`. Highs (`hitsCrouch:false`) miss when the victim `phase==='crouch'`.

**Behavior to encode (each is a test → implement → pass → commit cycle):**

- [ ] **A2.1 Edge-triggered jump.** Holding jump across two ticks jumps only once.
```ts
import { describe, it, expect } from 'vitest';
import { step, initialFighter, type Inputs, type MatchState } from './sim';
import { DT, JUMP_V, GROUND_Y } from './constants';
const NEUTRAL: Inputs = { moveX: 0, jump: false, light: false, heavy: false, block: false, crouch: false };
const m = (a: ReturnType<typeof initialFighter>, b: ReturnType<typeof initialFighter>): MatchState =>
  ({ status: 'fighting', tick: 0, fighters: [a, b] });

it('jump is edge-triggered: holding jump only launches once', () => {
  let s = m(initialFighter(0), initialFighter(1));
  const hold: Inputs = { ...NEUTRAL, jump: true };
  s = step(s, [hold, NEUTRAL], DT);          // rising edge -> launch
  const vyAfterLaunch = s.fighters[0].vy;
  expect(vyAfterLaunch).toBeGreaterThan(0);
  // land them: keep holding jump; must NOT relaunch while held
  for (let i = 0; i < 90; i++) s = step(s, [hold, NEUTRAL], DT);
  expect(s.fighters[0].y).toBeCloseTo(GROUND_Y, 1);   // back on ground, didn't bounce
  expect(s.fighters[0].vy).toBeCloseTo(0, 1);
});
it('releasing then re-pressing jump launches again', () => {
  let s = m(initialFighter(0), initialFighter(1));
  s = step(s, [{ ...NEUTRAL, jump: true }, NEUTRAL], DT);
  for (let i = 0; i < 90; i++) s = step(s, [NEUTRAL, NEUTRAL], DT); // land, jump released
  s = step(s, [{ ...NEUTRAL, jump: true }, NEUTRAL], DT);           // new edge
  expect(s.fighters[0].vy).toBeGreaterThan(0);
});
```

- [ ] **A2.2 Light vs heavy: damage, range, recovery.** Place fighters in range; verify light deals `LIGHT.dmg` once and recovers by `total`; heavy deals more and reaches farther/recovers slower. (Edge-trigger attacks too — holding `light` jabs once until released.)
```ts
it('light attack deals 6 once and recovers', () => {
  const a = initialFighter(0); const b = initialFighter(1);
  a.x = 380; b.x = 430;            // within light range (70 + half widths)
  let s = m(a, b);
  const hpStart = b.hp;
  for (let i = 0; i < 9; i++) s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);
  expect(s.fighters[1].hp).toBe(hpStart - 6); // exactly one hit
  // recovered
  s = step(s, [NEUTRAL, NEUTRAL], DT);
  expect(s.fighters[0].phase).not.toBe('attack');
});
it('heavy attack deals 13 and out-ranges light', () => {
  const a = initialFighter(0); const b = initialFighter(1);
  a.x = 360; b.x = 470;            // out of light range, within heavy
  let s = m(a, b);
  for (let i = 0; i < 22; i++) s = step(s, [{ ...NEUTRAL, heavy: true }, NEUTRAL], DT);
  expect(s.fighters[1].hp).toBe(94 - 0); // 100 - 13 = 87? -> see note
});
```
  *Note:* assert `b.hp === 100 - MOVES.heavy.dmg`. Import `MOVES` rather than hardcoding. Fix the literal above to `expect(s.fighters[1].hp).toBe(100 - MOVES.heavy.dmg)`.

- [ ] **A2.3 Knockback + friction.** A hit pushes the victim away from the attacker, and the slide decays (vx → 0 over hitstun) without crossing through the attacker.
```ts
it('a hit knocks the victim back and the slide decays', () => {
  const a = initialFighter(0); const b = initialFighter(1);
  a.x = 380; b.x = 430; let s = m(a, b);
  for (let i = 0; i < 7; i++) s = step(s, [{ ...NEUTRAL, heavy: true }, NEUTRAL], DT);
  const justHitX = s.fighters[1].x;
  expect(s.fighters[1].phase).toBe('hitstun');
  expect(s.fighters[1].vx).toBeGreaterThan(0);     // pushed right (away from attacker on the left)
  for (let i = 0; i < 18; i++) s = step(s, [NEUTRAL, NEUTRAL], DT);
  expect(s.fighters[1].x).toBeGreaterThan(justHitX); // moved away
  expect(Math.abs(s.fighters[1].vx)).toBeLessThan(40); // friction decayed it
});
it('knockback clamps at the wall', () => {
  const a = initialFighter(0); const b = initialFighter(1);
  b.x = ARENA_W - FIGHTER_W / 2; a.x = b.x - 50; let s = m(a, b);
  for (let i = 0; i < 30; i++) s = step(s, [{ ...NEUTRAL, heavy: true }, NEUTRAL], DT);
  expect(s.fighters[1].x).toBeLessThanOrEqual(ARENA_W - FIGHTER_W / 2 + 0.001);
});
```

- [ ] **A2.4 Block + blockstun + chip.** A blocking victim takes chip (heavy=2, light=0), no hitstun, enters blockstun, and can't act during blockstun.
```ts
it('blocking a heavy: chip only, blockstun, no hitstun', () => {
  const a = initialFighter(0); const b = initialFighter(1);
  a.x = 360; b.x = 470; let s = m(a, b);
  for (let i = 0; i < 13; i++) s = step(s, [{ ...NEUTRAL, heavy: true }, { ...NEUTRAL, block: true }], DT);
  expect(s.fighters[1].hp).toBe(100 - MOVES.heavy.chip);
  expect(s.fighters[1].phase).toBe('blockstun');
});
```

- [ ] **A2.5 Crouch ducks highs.** A crouching victim is missed by heavy (high) but hit by the low poke.
```ts
it('crouch ducks under a heavy but eats a low', () => {
  let a = initialFighter(0), b = initialFighter(1); a.x = 360; b.x = 470;
  let s = m(a, b);
  for (let i = 0; i < 13; i++) s = step(s, [{ ...NEUTRAL, heavy: true }, { ...NEUTRAL, crouch: true }], DT);
  expect(s.fighters[1].hp).toBe(100); // heavy whiffed over the crouch
  a = initialFighter(0); b = initialFighter(1); a.x = 400; b.x = 460; s = m(a, b);
  for (let i = 0; i < 16; i++) s = step(s, [{ ...NEUTRAL, light: true, crouch: true }, { ...NEUTRAL, crouch: true }], DT);
  expect(s.fighters[1].hp).toBe(100 - MOVES.low.dmg); // low poke connects
});
```

- [ ] **A2.6 Dash.** Double-tapping a direction within the window produces a burst of speed; a single tap does not.
```ts
it('double-tap dashes; single tap walks', () => {
  // single tap: normal walk speed
  let s = m(initialFighter(0), initialFighter(1));
  s = step(s, [{ ...NEUTRAL, moveX: 1 }, NEUTRAL], DT);
  const walkVx = s.fighters[0].vx;
  // double-tap: release then re-press within window
  s = m(initialFighter(0), initialFighter(1));
  s = step(s, [{ ...NEUTRAL, moveX: 1 }, NEUTRAL], DT);   // tap 1 (edge 0->1)
  s = step(s, [NEUTRAL, NEUTRAL], DT);                    // release
  s = step(s, [{ ...NEUTRAL, moveX: 1 }, NEUTRAL], DT);   // tap 2 within window -> dash
  expect(s.fighters[0].phase).toBe('dash');
  expect(Math.abs(s.fighters[0].vx)).toBeGreaterThan(Math.abs(walkVx));
});
```

- [ ] **A2.7 Air attack.** Attacking while airborne yields an `air` attack that can hit a grounded opponent below/in-front.
```ts
it('attacking in the air uses the air kick', () => {
  let s = m(initialFighter(0), initialFighter(1));
  s = step(s, [{ ...NEUTRAL, jump: true }, NEUTRAL], DT);     // launch
  s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);    // air attack
  expect(s.fighters[0].attackKind).toBe('air');
  expect(s.fighters[0].phase).toBe('attack');
});
```

- [ ] **A2.8 KO ends the match.** Drive hp to 0 → `status==='ko'`, victim `phase==='ko'`. (Adapt the existing KO test to the new attack inputs.)

- [ ] **A2.9 `step` returns hit events.** A connecting hit pushes one `SimEvent` with `kind:'hit'`, the victim's slot, contact `x`, and `amount===dmg`; a blocked hit pushes `kind:'block'`.
```ts
it('step returns a hit event on connect', () => {
  const a = initialFighter(0); const b = initialFighter(1); a.x = 380; b.x = 430;
  let s = m(a, b); let hit;
  for (let i = 0; i < 9; i++) { s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT); if (s.events.length) hit = s.events[0]; }
  expect(hit).toBeTruthy();
  expect(hit!.kind).toBe('hit'); expect(hit!.victimSlot).toBe(1); expect(hit!.amount).toBe(MOVES.light.dmg);
});
```

- [ ] For **each** A2.x: write the test, run `npm --prefix server/spacetimedb test -- sim` and watch it fail, implement the minimal change in `sim.ts`, re-run to green, then `git add -A && git commit -m "feat(fighter sim): <mechanic>"`.

**Implementation guidance for `stepFighter` (write to satisfy the tests):**
1. Compute `grounded = f.y <= GROUND_Y`.
2. Resolve finished phases by `phaseFrame`: `attack` when `phaseFrame >= MOVES[attackKind].total`; `hitstun`/`blockstun` when `>=` their stored frame budget (recompute from the move that caused it — store budget by setting `phase` and reading `MOVES`; simplest: hitstun lasts a fixed read from the move at hit time — store it by using `attackKind` of the *attacker*; to avoid cross-references, store the remaining stun as `phaseFrame` countdown is awkward, so instead: when applying a hit, set victim `phase='hitstun'`, `phaseFrame=0`, and let it end at a value carried in a small lookup — use a constant `HITSTUN_MAX = max move hitstun` is wrong. **Decision:** store stun length by writing `attackHasHit`/reuse: add field `stunFrames` to FighterState set at hit time; phase ends when `phaseFrame >= stunFrames`. Add `stunFrames: number` to the type and `initialFighter`).** Resolve `dash` at `>= DASH_FRAMES`.
3. `locked = phase ∈ {attack, hitstun, blockstun, dash, ko}`.
4. Edges: `jumpEdge/lightEdge/heavyEdge = input.x && !f.prevX`. Dash: track `prevMoveX`; on edge `0→d` (d≠0), if `dashTapDir===d && dashTapFrames < DASH_TAP_WINDOW` → start dash dir d (set `phase='dash'`, `vx=d*DASH_SPEED`, `phaseFrame=0`), else `dashTapDir=d; dashTapFrames=0`. Always `dashTapFrames++`.
5. If not locked & grounded: priority heavy → light(or low if crouch) → dash(if triggered) → block → crouch → (locomotion + jumpEdge). Starting an attack sets `phase='attack'`, `attackKind=...`, `attackHasHit=false`, `vx=0`. If not locked & airborne: allow air attack on light/heavy edge (set `attackKind='air'`) once; otherwise air drift `vx = moveX*MOVE_SPEED*AIR_CONTROL`.
6. If locked: zero input-driven vx; for `hitstun`/`blockstun` apply friction toward 0 (`vx -= sign(vx)*GROUND_FRICTION*dt`, clamp through 0); `dash` keeps its vx; `attack` keeps vx=0 (grounded) or air drift if `air`.
7. Integrate x, vy (gravity), y; ground-clamp; wall-clamp x to `[FIGHTER_W/2, ARENA_W-FIGHTER_W/2]`. On landing from `jump`/air-`attack` → `idle`.
8. Update memory: `prevJump/Light/Heavy=input.*`, `prevMoveX=input.moveX`; `phaseFrame = sameAsBefore ? +1 : 0`.

`resolveHit(attacker, victim, victimSlot, events)`: only while `MOVES[attacker.attackKind]` active window & `!attacker.attackHasHit`; compute reach from attacker front; horizontal overlap with victim; vertical: skip if `!move.hitsCrouch && victim.phase==='crouch'`; if hit → set `attacker.attackHasHit=true`; if victim grounded & blocking (`victim.phase==='block'`) → chip + `blockstun` (set `stunFrames=move.blockstun`) + small pushback + push `{kind:'block',...}`; else damage + `hitstun` (`stunFrames=move.hitstun`) + `vx=dir*move.kb` + push `{kind:'hit',...}`. Contact `x` = victim front edge facing attacker; `y` = mid-torso height.

*(Add `stunFrames: number` to the FighterState type, `initialFighter` (=0), and the table/match round-trip in Group C.)*

---

### Task A3: rounds.ts — best-of-3 (TDD)

**Files:** Create `rounds.ts`, `rounds.test.ts`

- [ ] **Step 1: Tests**
```ts
import { describe, it, expect } from 'vitest';
import { roundOutcome, applyRoundWin } from './rounds';

it('KO: winner is the fighter with hp>0', () => {
  expect(roundOutcome(0, 50, false)).toEqual({ over: true, winnerSlot: 1 }); // slot0 hp 0
  expect(roundOutcome(40, 0, false)).toEqual({ over: true, winnerSlot: 0 });
});
it('still fighting when both alive and not timed out', () => {
  expect(roundOutcome(40, 50, false)).toEqual({ over: false, winnerSlot: -1 });
});
it('timeout: higher hp wins; equal hp = draw (no winner)', () => {
  expect(roundOutcome(60, 40, true)).toEqual({ over: true, winnerSlot: 0 });
  expect(roundOutcome(40, 40, true)).toEqual({ over: true, winnerSlot: -1 });
});
it('applyRoundWin tracks wins and ends match at 2', () => {
  expect(applyRoundWin(0, 0, 0)).toEqual({ roundWins0: 1, roundWins1: 0, matchOver: false, matchWinnerSlot: -1 });
  expect(applyRoundWin(1, 1, 1)).toEqual({ roundWins0: 1, roundWins1: 2, matchOver: true, matchWinnerSlot: 1 });
  expect(applyRoundWin(-1, 1, 1)).toEqual({ roundWins0: 1, roundWins1: 1, matchOver: false, matchWinnerSlot: -1 }); // draw: no change
});
```

- [ ] **Step 2: Implementation**
```ts
import { ROUNDS_TO_WIN } from './constants';

export function roundOutcome(hp0: number, hp1: number, timedOut: boolean):
  { over: boolean; winnerSlot: number } {
  if (hp0 <= 0 || hp1 <= 0) return { over: true, winnerSlot: hp0 <= 0 ? 1 : 0 };
  if (timedOut) return { over: true, winnerSlot: hp0 === hp1 ? -1 : hp0 > hp1 ? 0 : 1 };
  return { over: false, winnerSlot: -1 };
}

export function applyRoundWin(winnerSlot: number, wins0: number, wins1: number):
  { roundWins0: number; roundWins1: number; matchOver: boolean; matchWinnerSlot: number } {
  const r0 = wins0 + (winnerSlot === 0 ? 1 : 0);
  const r1 = wins1 + (winnerSlot === 1 ? 1 : 0);
  const matchOver = r0 >= ROUNDS_TO_WIN || r1 >= ROUNDS_TO_WIN;
  const matchWinnerSlot = !matchOver ? -1 : r0 >= ROUNDS_TO_WIN ? 0 : 1;
  return { roundWins0: r0, roundWins1: r1, matchOver, matchWinnerSlot };
}
```

- [ ] **Step 3: Run** `npm --prefix server/spacetimedb test -- rounds` → green. **Commit.**

---

## Group B — Client pure/visual (parallelizable with Group A)

### Task B1: Client render constants

**Files:** Modify `client/src/games/fighter/constants.ts`

- [ ] Add (keep existing `ARENA_W`, `FIGHTER_W/H`, `MAX_HP`, `CANVAS_W/H`, `GROUND_PX`):
```ts
export const COLORS = ['#38bdf8', '#fb7185'] as const; // slot0 cyan, slot1 rose
export const HEADBANDS = ['#0ea5e9', '#e11d48'] as const;
export const STROKE_W = 5;       // limb thickness
export const HEAD_R = 13;
export const PIP_R = 6;          // round-win pip radius
export const SHAKE_DECAY = 0.85; // per-frame multiplier
export const SHAKE_PER_DMG = 0.9;// shake magnitude per damage point
export const FLASH_FRAMES = 5;
export const HITSTOP_FRAMES = 4;
export const SPARK_COUNT = 8;
export const SPARK_LIFE = 14;    // frames
```

- [ ] Typecheck via `npm --prefix client run build` later (Group C); commit now: `git commit -m "feat(fighter client): render constants"`.

### Task B2: skeleton.ts (pure poses, TDD)

**Files:** Create `client/src/games/fighter/skeleton.ts`, `skeleton.test.ts`

- [ ] **Interface:**
```ts
export interface Vec { x: number; y: number; }
export interface Joints {
  head: Vec; neck: Vec; pelvis: Vec;
  hands: [Vec, Vec]; elbows: [Vec, Vec];
  knees: [Vec, Vec]; feet: [Vec, Vec];
  headR: number;
}
// Local frame: origin at the feet midpoint, +x = facing direction, +y = UP (caller flips/translates).
export function pose(phase: string, phaseFrame: number, facing: number, t: number): Joints;
```
`t` is a free-running time (seconds) for idle breathing. The function returns joint positions for the given phase; `facing` (±1) mirrors x. Poses: idle (hands up near chest, slight bob via `sin(t*4)`), walk (legs alternate via `sin`), crouch (pelvis/knees lowered, head down to ~CROUCH height), jump (knees tucked), dash (lean forward, trailing leg), attack: branch on a passed attack kind — **augment signature** to `pose(phase, attackKind, phaseFrame, facing, t)` so attacks pick arm-jab / leg-kick / air-kick / low-kick reach by `phaseFrame` (extend on the active frames). block (forearms raised in front), hitstun (head/torso snap back), ko (collapsed, head near ground).

- [ ] **Tests** assert structural sanity (cheap, robust to tuning):
```ts
import { describe, it, expect } from 'vitest';
import { pose } from './skeleton';
import { FIGHTER_H } from './constants';
it('idle head is above the feet and within height', () => {
  const j = pose('idle', 'none', 0, 1, 0);
  expect(j.head.y).toBeGreaterThan(j.pelvis.y);
  expect(j.head.y).toBeLessThanOrEqual(FIGHTER_H + 10);
  expect(j.feet[0].y).toBeCloseTo(0, 1);
});
it('crouch lowers the head vs idle', () => {
  expect(pose('crouch', 'none', 0, 1, 0).head.y).toBeLessThan(pose('idle', 'none', 0, 1, 0).head.y);
});
it('facing mirrors x', () => {
  const r = pose('idle', 'none', 0, 1, 0); const l = pose('idle', 'none', 0, -1, 0);
  expect(Math.sign(r.hands[1].x - r.pelvis.x)).toBe(-Math.sign(l.hands[1].x - l.pelvis.x));
});
it('a light attack extends a hand forward on active frames', () => {
  const idle = pose('idle', 'none', 0, 1, 0);
  const jab = pose('attack', 'light', 4, 1, 0);
  expect(jab.hands[1].x).toBeGreaterThan(idle.hands[1].x);
});
```

- [ ] Run `npm --prefix client test -- skeleton` → green. **Commit.**

### Task B3: effects.ts (juice state)

**Files:** Create `client/src/games/fighter/effects.ts`

- [ ] No tests required (visual, time-based); keep it a small pure-ish state module:
```ts
import { SHAKE_DECAY, SHAKE_PER_DMG, FLASH_FRAMES, HITSTOP_FRAMES, SPARK_COUNT, SPARK_LIFE } from './constants';

export interface Spark { x: number; y: number; vx: number; vy: number; life: number; }
export interface Effects { shake: number; hitstop: number; flash: [number, number]; sparks: Spark[]; }
export const newEffects = (): Effects => ({ shake: 0, hitstop: 0, flash: [0, 0], sparks: [] });

// kind: 'hit'|'block'|'ko'|...; victimSlot derived by caller (nearest fighter).
export function pushHit(e: Effects, x: number, y: number, amount: number, victimSlot: number, blocked: boolean): void {
  e.shake = Math.min(14, e.shake + amount * SHAKE_PER_DMG);
  e.hitstop = HITSTOP_FRAMES;
  if (!blocked && victimSlot >= 0) e.flash[victimSlot] = FLASH_FRAMES;
  const n = blocked ? Math.floor(SPARK_COUNT / 2) : SPARK_COUNT;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    e.sparks.push({ x, y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, life: SPARK_LIFE });
  }
}
// Advance effects one rendered frame. Returns whether we are in hitstop (caller pauses fighter interpolation).
export function tickEffects(e: Effects, dt: number): boolean {
  e.shake *= SHAKE_DECAY;
  e.flash[0] = Math.max(0, e.flash[0] - 1);
  e.flash[1] = Math.max(0, e.flash[1] - 1);
  e.sparks = e.sparks.filter(s => (s.life -= 1) > 0);
  for (const s of e.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy -= 600 * dt; }
  if (e.hitstop > 0) { e.hitstop -= 1; return true; }
  return false;
}
```

- [ ] Commit: `git commit -m "feat(fighter client): effects (shake/hitstop/flash/sparks)"`

### Task B4: audio.ts (stub)

**Files:** Create `client/src/games/fighter/audio.ts`
```ts
// Sound is stubbed for Phase 4 (see spec §5). Wire-compatible no-op: adding real
// sounds later means implementing playSfx, no call-site changes.
export function playSfx(_kind: string): void { /* intentionally silent for now */ }
```
- [ ] Commit.

### Task B5: render.ts rewrite

**Files:** Modify `client/src/games/fighter/render.ts`

- [ ] Implement `draw(g, { fighters, effects, match })` where `fighters: DrawFighter[]` now also carry `attackKind`, `phaseFrame`, and the interpolated `t`. Steps:
  1. Apply shake: `g.save(); g.translate(rand*shake, rand*shake)` around the world draw.
  2. Background + ground (keep current).
  3. For each fighter: convert sim `(x,y)` to canvas; get `joints = pose(phase, attackKind, phaseFrame, facing, t)`; translate to the fighter's canvas feet; stroke bones (neck→pelvis, pelvis→knees→feet, neck→elbows→hands) with `lineWidth=STROKE_W`, `lineCap='round'`, stroke color `COLORS[slot]`; fill head circle; fill a small `HEADBANDS[slot]` arc on the head; if `flash[slot]>0` overlay white at reduced alpha; `ko` → alpha 0.4.
  4. Draw sparks (small bright segments fading by `life`).
  5. Restore shake transform; draw HUD in screen space: HP bars (keep), **round pips** under each bar (`roundWins0/1` filled vs empty circles up to `ROUNDS_TO_WIN`), and a center banner from `match.phase` (`'Round N'` / `'FIGHT!'` / `'K.O.!'` / result).
- [ ] Verified at integration (Group C build). Commit: `git commit -m "feat(fighter client): skeletal renderer + pips + banners"`.

---

## Group C — Integration (sequential, inline)

### Task C1: Tables

**Files:** Modify `server/spacetimedb/src/games/fighter/tables.ts`

- [ ] `fighter`: add `attackKind: t.string()`, `attackHasHit: t.bool()`, `stunFrames: t.u32()`, `prevJump: t.bool()`, `prevLight: t.bool()`, `prevHeavy: t.bool()`, `prevMoveX: t.i8()`, `dashTapDir: t.i8()`, `dashTapFrames: t.u32()`.
- [ ] `fightInput`: replace `attack` with `light: t.bool()`, `heavy: t.bool()`; add `crouch: t.bool()`.
- [ ] `fightMatch`: add `phase: t.string()`, `round: t.u32()`, `roundWins0: t.u32()`, `roundWins1: t.u32()`, `phaseEndsAtMicros: t.u64()`. Keep `status`, `tick`, `endsAtMicros`, `roomId`.
- [ ] Add event table (event tables take **no primary key** — per docs the `damageEvent` example is data-columns-only):
```ts
export const fightEvent = table(
  { name: 'fight_event', public: true, event: true },
  {
    roomId: t.u64(),
    kind: t.string(),   // 'hit'|'block'|'ko'|'roundStart'|'roundEnd'|'matchEnd'
    x: t.f32(), y: t.f32(), amount: t.f32(),
  }
);
```
- [ ] Register `fightEvent` in `schema.ts`'s `schema({...})`.
- [ ] **Event-table semantics (verified via context7, SpacetimeDB docs `tables/event-tables`):** rows are **ephemeral broadcasts** — visible only within the inserting transaction, broadcast to subscribers on commit, **not stored** client-side (`count()`=0, `iter()` empty, only `onInsert` fires) and not retained server-side. ⇒ **No pruning needed.** Client reads them via `conn.db.fightEvent.onInsert((ctx, ev) => …)` with camelCase fields (`ev.roomId`,`ev.kind`,`ev.x`,`ev.y`,`ev.amount`); use `removeOnInsert` on cleanup. `useTable` will NOT surface event rows.

### Task C2: match.ts — round machine + events + setInput + teardown

**Files:** Modify `server/spacetimedb/src/games/fighter/match.ts`

- [ ] `startFightMatch`: insert fighters via the full extended `initialFighter` shape; insert `fightInput` rows `{moveX:0,jump:false,light:false,heavy:false,block:false,crouch:false,seq:0}`; insert `fightMatch` with `phase:'intro'`, `round:1`, `roundWins0:0`, `roundWins1:0`, `status:'live'`, `tick:0n`, `endsAtMicros:0n`, `phaseEndsAtMicros = now + INTRO_SECONDS*1e6`; emit `fightEvent {kind:'roundStart', amount:1}`.
- [ ] `setInput` reducer: args `{ moveX:t.i8(), jump:t.bool(), light:t.bool(), heavy:t.bool(), block:t.bool(), crouch:t.bool() }`; update/insert `fightInput` accordingly.
- [ ] `fighterTick`: branch on `fm.phase`:
  - `intro`: if `now >= phaseEndsAtMicros` → set `phase:'fighting'`, `endsAtMicros = now + ROUND_SECONDS*1e6`. Do not step the sim.
  - `fighting`: reconstruct `MatchState` (round-trip ALL new fighter fields), `next = step(...)`. Write fighters back (all fields). For each `next.events` insert a `fightEvent` (`hit`/`block`, with `x,y,amount`). Compute `timedOut = now >= endsAtMicros`. `oc = roundOutcome(hp0, hp1, timedOut)`. If `oc.over`: set `phase:'roundEnd'`, `phaseEndsAtMicros = now + ROUND_END_SECONDS*1e6`, store the pending winner (reuse a field: write `amount` via a `fightEvent {kind:'ko' or 'roundEnd-pending'}` — simplest: emit `fightEvent{kind:'ko', amount: winnerSlot}` now and recompute winner at roundEnd from hp, OR store winner in `round` high bits — **Decision:** recompute the winner at `roundEnd` transition from current hp + a stored `timedOut` is unavailable; therefore store the winner by writing it into a new transient: reuse `endsAtMicros`? No. **Cleanest:** add a `pendingWinner: t.i8()` column to `fightMatch` set here.) Add `pendingWinner` to the C1 column list.
  - `roundEnd`: if `now >= phaseEndsAtMicros`: `res = applyRoundWin(pendingWinner, roundWins0, roundWins1)`. Emit `fightEvent{kind:'roundEnd', amount: pendingWinner}`. If `res.matchOver`: `phase:'matchEnd'`, `status:'done'`; emit `fightEvent{kind:'matchEnd', amount: res.matchWinnerSlot}`; stop the tick (delete `fightTick` rows for room); set room `status:'finished'`. Else: `round+1`, reset both fighter rows to `initialFighter(slot)` (full shape), `phase:'intro'`, `phaseEndsAtMicros = now + INTRO_SECONDS*1e6`, write `roundWins*`; emit `fightEvent{kind:'roundStart', amount: round+1}`.
  - always increment `tick`.
- [ ] Keep `fightTickRef.fn = fighterTick;` at file end.
- [ ] Confirm `index.ts` still exports `{ fighterTick, setInput }` (unchanged names).

### Task C3: Publish locally, regenerate bindings, fix typecheck

- [ ] `spacetime start` (background) if not running; `spacetime publish rtg --server local --delete-data always --yes -p server/spacetimedb` (schema changed → wipe local data).
- [ ] `spacetime generate --lang typescript --out-dir client/src/module_bindings -p server/spacetimedb` to regenerate bindings (new `setInput` args, `fightEvent`, new columns).
- [ ] `npm --prefix server/spacetimedb run typecheck` and `npm --prefix client run build` → fix any mismatches. Commit: `git commit -m "feat(fighter): tables + round state machine + event emission"`.

### Task C4: FighterGame.tsx

**Files:** Modify `client/src/games/fighter/FighterGame.tsx`

- [ ] Input mapping → `setInput({ moveX, jump, light, heavy, block, crouch })`: `light=J`, `heavy=K`, `block=L` (hold), `crouch = S/↓`, `jump = W/↑/Space`, `moveX` from A/D/←/→. Keep the "only send on change" diffing. (No client dash logic — server detects double-tap from `moveX`.)
- [ ] Subscribe to `fightEvent`: on insert for this `roomId`, call `pushHit(effects, x, y, amount, nearestSlot, kind==='block')` for `hit`/`block`, and `playSfx(kind)` for all kinds; for `roundStart/roundEnd/matchEnd/ko` also `playSfx`. Determine `nearestSlot` from the closest fighter to `(x,y)`. Use the bindings' event-callback API (verify exact hook in C3; likely `conn.db.fightEvent.onInsert(cb)` via `useSpacetimeDB().conn`, since `useTable` won't surface event rows).
- [ ] rAF loop: `const stop = tickEffects(effects, frameDt)`; if `stop` (hitstop) **don't** advance fighter interpolation this frame (freeze), but still decay sparks already handled. Pass `effects` + `match` (phase/round/roundWins) into `draw`.
- [ ] UI: banner is now driven by `match.phase`/`round`/`status` (intro "Round N — FIGHT!", roundEnd "K.O.!", matchEnd result "You win/lose the match"); keep the persistent Leave button until `status==='done'`. Update the controls hint: `Move A/D · Crouch S · Jump W · Light J · Heavy K · Block L · Dash: double-tap A/D`.
- [ ] `npm --prefix client run build` → green. Commit: `git commit -m "feat(fighter client): new inputs, event-driven juice, round UI"`.

### Task C5: Teardown / leak fix

**Files:** Read `server/spacetimedb/src/core/rooms.ts`; modify if needed.

- [ ] Trace `leaveRoom`/`onDisconnect` → `removeFromRooms` → `endGame`. Confirm a **finished** room (status `'finished'`) still routes through `endGame`→`endFightMatch` when its members leave/disconnect (so `fighter`/`fightMatch`/`fightInput`/`fightTick` are all deleted). If finished rooms are skipped, fix so they are cleaned. Add a test or a `spacetime sql` check in Group D.
- [ ] Commit any change: `git commit -m "fix(fighter): clean up fight rows when a finished room empties"`.

---

## Group D — Verify & ship

### Task D1: Full test + typecheck

- [ ] `npm --prefix server/spacetimedb test` (all sim + rounds green) and `npm --prefix client test` (skeleton green); `npm --prefix server/spacetimedb run typecheck` and `npm --prefix client run build` clean.

### Task D2: Deploy + live two-client verification

- [ ] Push to `master` (triggers CI publish to Maincloud + Pages deploy). Wait for the workflow to go green (`gh run watch`).
- [ ] chrome-devtools: open two pages on the live URL, set names, quick-match. Verify: edge jump (hold W ⇒ no bounce; tap to jump), light/heavy feel + visible knockback, crouch ducks a heavy, dash on double-tap, block + blockstun + chip, hitstop+shake+sparks+flash fire on hits, best-of-3 (intro banner → rounds → pips increment → match end), and the result screen.
- [ ] `spacetime sql rtg "SELECT roomId FROM fighter"` after both leave a finished match → expect zero orphan rows.

### Task D3: Adversarial review workflow + fixes

- [ ] Run a review **Workflow**: parallel reviewers over dimensions — (a) sim determinism/purity & networking (event-table usage, no nondeterminism), (b) combat correctness vs spec frame-data, (c) round state-machine edge cases (draws, simultaneous KO, disconnect mid-round), (d) client feel/UX & React effect lifecycles, (e) test coverage gaps. Adversarially verify each finding; fix confirmed issues; re-run D1/D2 as needed.
- [ ] Update memory (`rtg-phase4-next` → done; note new mechanics/feel) and the README controls section.

---

## Self-Review

**Spec coverage:** depth mechanics → A1/A2; best-of-3 → A3/C2; thin-line skeleton → B1/B2/B5; juice (hitstop/shake/sparks/flash) → B1/B3/C4; sound stub → B4; omni-block + crouch-duck → A2.4/A2.5; event bridge → C1/C2/C4; data-model changes → C1; controls → C4; leak fix → C5; verification → D. All covered.

**Placeholder scan:** Two spots resolved inline rather than left vague — (1) hitstun/blockstun length stored via a new `stunFrames` FighterState field (and `fightMatch.pendingWinner` for the deferred round winner); both added to the C1 column list and A2 type. (2) event-table persistence is an explicit context7 verification step (C1), not an assumption.

**Type consistency:** `Inputs{moveX,jump,light,heavy,block,crouch}` ↔ `setInput` args ↔ `fightInput` columns match. `FighterState` (with `attackKind`, `attackHasHit`, `stunFrames`, `prev*`, `dashTap*`) ↔ `fighter` columns match. `SimEvent{kind,victimSlot,x,y,amount}` ↔ `fightEvent` row + `pushHit` args align. `pose()` signature is the augmented 5-arg form (`phase, attackKind, phaseFrame, facing, t`) consistently in B2 and B5.
