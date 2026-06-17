# Phase 3 — Fighter: Server-Authoritative 2D Fighting Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable networked 1v1 2D fighter — two players in an `active` fighter room control fighters in real time; the server simulates authoritatively at a fixed 30 Hz; clients send inputs and render the synced state on a canvas.

**Architecture:** A **pure** `sim.ts` (fixed-timestep physics + combat, fully unit-tested) is driven by a 30 Hz **scheduled reducer**. When a fighter room goes `active`, the game dispatcher creates the match (two `Fighter` rows + a repeating `FightTick` schedule). Clients write input intents via a `setInput` reducer and subscribe to the fighter rows, rendering with interpolation. Visuals are deliberately basic (rectangles/capsules) — gameplay first.

**Tech Stack:** TypeScript · SpacetimeDB 2.6 (scheduled reducers, `ScheduleAt`) · vitest · Canvas 2D · `spacetimedb/react`.

**Reference spec:** `docs/superpowers/specs/2026-06-17-office-arcade-design.md` (§8 real-time fighter model).

**Branch:** `phase3-fighter` off `master`. Merge → auto-deploys.

**Confirmed conventions (Phases 1–2):** schema instance in `schema.ts`; reducers in per-feature files, re-exported **explicitly** from `index.ts` (only spacetime exports); pure logic in DB-free helpers (vitest); `ctx.db.<table>.<index>.filter(x)` returns an iterator (spread it); `insert` returns the row (auto-inc id resolved); reducers register on-wire as snake_case, client SDK exposes camelCase; scheduled tables: `table({ name, scheduled: (): any => reducerRef }, { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), ...extra })`, repeating via `ScheduleAt.interval(microsBigint)` (`import { ScheduleAt } from 'spacetimedb'`).

---

## File structure (this phase)

```
server/spacetimedb/src/
├── games/
│   ├── dispatch.ts            (NEW) startGame/endGame — switch on room.gameId
│   └── fighter/
│       ├── constants.ts       (NEW) arena/physics/combat constants (shared by sim + render via copy)
│       ├── sim.ts             (NEW) PURE step(state, inputs, dt) + helpers  (unit-tested)
│       ├── sim.test.ts        (NEW) vitest
│       ├── tables.ts          (NEW) fightMatch, fighter, fightInput, fightTick(scheduled)
│       └── match.ts           (NEW) startFightMatch, endFightMatch, fighterTick reducer, setInput reducer
├── core/rooms.ts              (MODIFY) call startGame on activate; endGame when finishing an active room
├── schema.ts                  (MODIFY) add fighter tables
└── index.ts                   (MODIFY) re-export fighter reducers (fighterTick, setInput)

client/src/
├── games/fighter/
│   ├── constants.ts           (NEW) copy of arena/render constants
│   ├── FighterGame.tsx        (NEW) canvas component: subscribe, render loop, input, interpolation
│   └── render.ts              (NEW) pure-ish draw helpers
├── arcade/WaitingRoom.tsx     (MODIFY) when status active + game fighter → render <FighterGame>
└── App.css                    (MODIFY) canvas styles
```

---

### Task 1: Fighter constants + pure sim — movement & gravity (TDD)

**Files:** Create `server/spacetimedb/src/games/fighter/constants.ts`, `sim.ts`, `sim.test.ts`.

- [ ] **Step 1: constants.ts**

```ts
// Arena is in abstract units; the client scales to canvas pixels.
export const ARENA_W = 800;
export const GROUND_Y = 0;          // feet height above ground
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
export const DT = 1 / 30;           // fixed timestep (seconds)

export const GRAVITY = -2000;       // units/s^2 (y is up)
export const MOVE_SPEED = 320;      // units/s
export const JUMP_V = 760;          // units/s
export const MAX_HP = 100;

export const ATTACK_TOTAL_FRAMES = 12;
export const ATTACK_ACTIVE_FROM = 2; // frames [2,5) deal damage
export const ATTACK_ACTIVE_TO = 5;
export const ATTACK_RANGE = 80;      // reach beyond the fighter's front edge
export const ATTACK_DAMAGE = 9;
export const HITSTUN_FRAMES = 12;
export const BLOCK_CHIP = 1;         // damage taken while blocking
export const ROUND_SECONDS = 60;
```

- [ ] **Step 2: Write failing tests** (`sim.test.ts`) — movement, gravity, ground, facing

```ts
import { describe, it, expect } from 'vitest';
import { step, initialFighter, type MatchState, type Inputs } from './sim';
import { ARENA_W, MOVE_SPEED, DT, GROUND_Y } from './constants';

const noInput: Inputs = { moveX: 0, jump: false, attack: false, block: false };
function freshMatch(): MatchState {
  return { status: 'fighting', tick: 0, fighters: [initialFighter(0), initialFighter(1)] };
}

describe('movement', () => {
  it('moves right with moveX=1', () => {
    const m = freshMatch();
    const x0 = m.fighters[0].x;
    const out = step(m, [{ ...noInput, moveX: 1 }, noInput], DT);
    expect(out.fighters[0].x).toBeCloseTo(x0 + MOVE_SPEED * DT, 1);
  });
  it('clamps inside the arena', () => {
    const m = freshMatch();
    m.fighters[0].x = ARENA_W - 1;
    const out = step(m, [{ ...noInput, moveX: 1 }, noInput], DT);
    expect(out.fighters[0].x).toBeLessThanOrEqual(ARENA_W);
  });
});

describe('gravity + ground', () => {
  it('a fighter in the air falls', () => {
    const m = freshMatch();
    m.fighters[0].y = 200; m.fighters[0].vy = 0;
    const out = step(m, [noInput, noInput], DT);
    expect(out.fighters[0].y).toBeLessThan(200);
  });
  it('does not sink below the ground', () => {
    const m = freshMatch();
    m.fighters[0].y = 1; m.fighters[0].vy = -1000;
    const out = step(m, [noInput, noInput], DT);
    expect(out.fighters[0].y).toBe(GROUND_Y);
    expect(out.fighters[0].vy).toBe(0);
  });
});

describe('facing', () => {
  it('each fighter faces the other', () => {
    const m = freshMatch();           // slot 0 left, slot 1 right
    const out = step(m, [noInput, noInput], DT);
    expect(out.fighters[0].facing).toBe(1);
    expect(out.fighters[1].facing).toBe(-1);
  });
});
```

- [ ] **Step 3: Run, verify FAIL**

Run: `npm --prefix server/spacetimedb test`
Expected: FAIL (no `./sim` exports).

- [ ] **Step 4: Implement `sim.ts` (movement/gravity/ground/facing; combat is Task 2)**

```ts
import {
  ARENA_W, GROUND_Y, FIGHTER_W, GRAVITY, MOVE_SPEED, JUMP_V, MAX_HP,
} from './constants';

export type FighterPhase = 'idle' | 'walk' | 'jump' | 'attack' | 'block' | 'hitstun' | 'ko';

export interface FighterState {
  x: number; y: number; vx: number; vy: number;
  facing: number; hp: number; phase: FighterPhase; phaseFrame: number;
}
export interface Inputs { moveX: number; jump: boolean; attack: boolean; block: boolean; }
export interface MatchState {
  status: 'fighting' | 'ko' | 'timeout';
  tick: number;
  fighters: [FighterState, FighterState];
}

export function initialFighter(slot: number): FighterState {
  return {
    x: slot === 0 ? ARENA_W * 0.3 : ARENA_W * 0.7,
    y: GROUND_Y, vx: 0, vy: 0,
    facing: slot === 0 ? 1 : -1,
    hp: MAX_HP, phase: 'idle', phaseFrame: 0,
  };
}

const onGround = (f: FighterState) => f.y <= GROUND_Y;
const busy = (f: FighterState) => f.phase === 'attack' || f.phase === 'hitstun' || f.phase === 'ko';

// Combat is layered on in Task 2; this version handles locomotion only.
export function step(prev: MatchState, inputs: [Inputs, Inputs], dt: number): MatchState {
  const fighters = prev.fighters.map((f, i) => stepFighter(f, inputs[i], dt)) as [FighterState, FighterState];
  // face the opponent
  fighters[0].facing = fighters[0].x <= fighters[1].x ? 1 : -1;
  fighters[1].facing = -fighters[0].facing;
  return { ...prev, tick: prev.tick + 1, fighters };
}

function stepFighter(f0: FighterState, input: Inputs, dt: number): FighterState {
  const f: FighterState = { ...f0 };
  const grounded = onGround(f);

  if (!busy(f)) {
    f.vx = input.moveX * MOVE_SPEED;
    if (input.jump && grounded) { f.vy = JUMP_V; f.phase = 'jump'; }
    else if (grounded) f.phase = input.moveX !== 0 ? 'walk' : 'idle';
  } else {
    f.vx = 0;
  }

  // integrate
  f.x += f.vx * dt;
  f.vy += GRAVITY * dt;
  f.y += f.vy * dt;
  if (f.y <= GROUND_Y) { f.y = GROUND_Y; f.vy = 0; if (f.phase === 'jump') f.phase = 'idle'; }
  f.x = Math.max(FIGHTER_W / 2, Math.min(ARENA_W - FIGHTER_W / 2, f.x));

  f.phaseFrame = f.phase === f0.phase ? f.phaseFrame + 1 : 0;
  return f;
}
```

- [ ] **Step 5: Run, verify PASS**

Run: `npm --prefix server/spacetimedb test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/spacetimedb/src/games/fighter/constants.ts server/spacetimedb/src/games/fighter/sim.ts server/spacetimedb/src/games/fighter/sim.test.ts
git commit -m "feat(fighter): pure sim — movement, gravity, facing (TDD)"
```

---

### Task 2: Pure sim — attacks, block, hitstun, KO/timeout (TDD)

**Files:** Modify `sim.ts`, `sim.test.ts`.

- [ ] **Step 1: Add failing combat tests** (`sim.test.ts`)

```ts
import {
  ATTACK_DAMAGE, ATTACK_RANGE, HITSTUN_FRAMES, MAX_HP,
} from './constants';

describe('attacks', () => {
  it('an attack in range damages the opponent', () => {
    const m = freshMatch();
    m.fighters[0].x = 380; m.fighters[1].x = 380 + 50; // within FIGHTER_W/2+ATTACK_RANGE
    let s = step(m, [{ ...noInput, attack: true }, noInput], DT);
    for (let i = 0; i < 4; i++) s = step(s, [noInput, noInput], DT); // advance through active frames
    expect(s.fighters[1].hp).toBeLessThan(MAX_HP);
  });
  it('an attack out of range does no damage', () => {
    const m = freshMatch(); // default spacing is far apart
    let s = step(m, [{ ...noInput, attack: true }, noInput], DT);
    for (let i = 0; i < 6; i++) s = step(s, [noInput, noInput], DT);
    expect(s.fighters[1].hp).toBe(MAX_HP);
  });
  it('blocking reduces damage to chip', () => {
    const m = freshMatch();
    m.fighters[0].x = 380; m.fighters[1].x = 430;
    let s = step(m, [{ ...noInput, attack: true }, { ...noInput, block: true }], DT);
    for (let i = 0; i < 4; i++) s = step(s, [noInput, { ...noInput, block: true }], DT);
    expect(s.fighters[1].hp).toBeGreaterThan(MAX_HP - ATTACK_DAMAGE);
  });
  it('a hit applies hitstun (victim cannot move)', () => {
    const m = freshMatch();
    m.fighters[0].x = 380; m.fighters[1].x = 430;
    let s = step(m, [{ ...noInput, attack: true }, noInput], DT);
    for (let i = 0; i < 4; i++) s = step(s, [noInput, noInput], DT);
    const xBefore = s.fighters[1].x;
    s = step(s, [noInput, { ...noInput, moveX: 1 }], DT);
    expect(s.fighters[1].x).toBeCloseTo(xBefore, 1);
    expect(s.fighters[1].phase).toBe('hitstun');
  });
});

describe('win conditions', () => {
  it('hp <= 0 ends the match as ko', () => {
    const m = freshMatch();
    m.fighters[1].hp = 1; m.fighters[0].x = 380; m.fighters[1].x = 430;
    let s = step(m, [{ ...noInput, attack: true }, noInput], DT);
    for (let i = 0; i < 5; i++) s = step(s, [noInput, noInput], DT);
    expect(s.status).toBe('ko');
    expect(s.fighters[1].phase).toBe('ko');
  });
});
```

- [ ] **Step 2: Run, verify the new tests FAIL**

Run: `npm --prefix server/spacetimedb test`
Expected: FAIL (no attack handling yet).

- [ ] **Step 3: Extend `sim.ts`** — handle attack start, active-frame hit detection, block, hitstun, KO. Add to `stepFighter` the attack/block/hitstun phase transitions, and add a post-pass in `step` that resolves hits:

```ts
import {
  ATTACK_TOTAL_FRAMES, ATTACK_ACTIVE_FROM, ATTACK_ACTIVE_TO, ATTACK_RANGE,
  ATTACK_DAMAGE, HITSTUN_FRAMES, BLOCK_CHIP, FIGHTER_W,
} from './constants';
```
- In `stepFighter` (before the locomotion block), advance timed phases:
  - if `phase==='attack'` and `phaseFrame >= ATTACK_TOTAL_FRAMES` → back to `idle`.
  - if `phase==='hitstun'` and `phaseFrame >= HITSTUN_FRAMES` → `idle`.
  - allow starting `attack` (from non-busy + grounded + `input.attack`) and `block` (held while non-busy).
- After both fighters stepped, in `step` resolve hits with a pure helper:

```ts
function frontEdge(f: FighterState): number { return f.x + f.facing * (FIGHTER_W / 2); }

function attackHits(attacker: FighterState, victim: FighterState): boolean {
  if (attacker.phase !== 'attack') return false;
  if (attacker.phaseFrame < ATTACK_ACTIVE_FROM || attacker.phaseFrame >= ATTACK_ACTIVE_TO) return false;
  const reach = frontEdge(attacker) + attacker.facing * ATTACK_RANGE;
  const lo = Math.min(frontEdge(attacker), reach);
  const hi = Math.max(frontEdge(attacker), reach);
  const vLo = victim.x - FIGHTER_W / 2, vHi = victim.x + FIGHTER_W / 2;
  const sameHeight = Math.abs(attacker.y - victim.y) < 100;
  return sameHeight && hi >= vLo && lo <= vHi;
}
```
In `step`, after stepping, for each (attacker, victim) pair: if `attackHits` and victim not already in `hitstun` from this frame, apply `ATTACK_DAMAGE` (or `BLOCK_CHIP` if `victim.phase==='block'`), set victim `phase='hitstun'`, `phaseFrame=0`. Then if any fighter `hp<=0` → that fighter `phase='ko'`, `status='ko'`. Guard against double-applying within the active window by only damaging on a single active frame (e.g. `phaseFrame===ATTACK_ACTIVE_FROM`), or track a per-attack `hasHit` flag on the attacker. Keep it simple: damage only when `attacker.phaseFrame === ATTACK_ACTIVE_FROM`.

- [ ] **Step 4: Run, verify all PASS**

Run: `npm --prefix server/spacetimedb test`
Expected: PASS (Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/spacetimedb/src/games/fighter/sim.ts server/spacetimedb/src/games/fighter/sim.test.ts
git commit -m "feat(fighter): pure sim — attacks, block, hitstun, KO (TDD)"
```

---

### Task 3: Fighter tables (state + input + scheduled tick)

**Files:** Create `server/spacetimedb/src/games/fighter/tables.ts`. Modify `schema.ts`.

- [ ] **Step 1: tables.ts**

```ts
import { table, t } from 'spacetimedb/server';
import { fighterTick } from './match';

export const fightMatch = table(
  { name: 'fight_match', public: true },
  { roomId: t.u64().primaryKey(), status: t.string(), tick: t.u64(), endsAtMicros: t.u64() }
);

export const fighter = table(
  { name: 'fighter', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    identity: t.identity().index('btree'),
    slot: t.u8(),
    x: t.f32(), y: t.f32(), vx: t.f32(), vy: t.f32(),
    facing: t.i8(), hp: t.f32(),
    phase: t.string(), phaseFrame: t.u32(),
  }
);

export const fightInput = table(
  { name: 'fight_input', public: true },
  {
    identity: t.identity().primaryKey(),
    roomId: t.u64(),
    moveX: t.i8(), jump: t.bool(), attack: t.bool(), block: t.bool(), seq: t.u32(),
  }
);

export const fightTick = table(
  { name: 'fight_tick', scheduled: (): any => fighterTick },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), roomId: t.u64() }
);
```
(`fightTick` references `fighterTick` from match.ts — a function reference behind `(): any =>`, so no eager circular evaluation. If the build complains about i8/f32, fall back to i32/f64 and adjust sim mapping.)

- [ ] **Step 2: Register in schema.ts** — add the four tables to `schema({ ... })` (alongside player, gameRoom, roomMember).

- [ ] **Step 3: Build** (after Task 4/5 create match.ts; tables.ts importing match.ts means this builds once match.ts exists — implement Tasks 4–5 then build).

This task is committed together with Tasks 4–5 (they form one buildable unit).

---

### Task 4: setInput reducer

**Files:** part of `server/spacetimedb/src/games/fighter/match.ts`.

- [ ] **Step 1: setInput** (writes the caller's latest intent)

```ts
export const setInput = spacetimedb.reducer(
  { moveX: t.i8(), jump: t.bool(), attack: t.bool(), block: t.bool() },
  (ctx, { moveX, jump, attack, block }) => {
    const mine = [...ctx.db.fighter.identity.filter(ctx.sender)];
    if (mine.length === 0) return; // not in a match
    const roomId = mine[0].roomId;
    const existing = ctx.db.fightInput.identity.find(ctx.sender);
    if (existing) {
      ctx.db.fightInput.identity.update({ ...existing, moveX, jump, attack, block, roomId, seq: existing.seq + 1 });
    } else {
      ctx.db.fightInput.insert({ identity: ctx.sender, roomId, moveX, jump, attack, block, seq: 0 });
    }
  }
);
```

---

### Task 5: Match lifecycle — start, tick, end; wire into rooms

**Files:** `server/spacetimedb/src/games/fighter/match.ts`, `server/spacetimedb/src/games/dispatch.ts`, modify `core/rooms.ts`, `index.ts`, then build + publish + verify.

- [ ] **Step 1: match.ts — start/end + tick** (uses sim.ts; maps tables ↔ sim state)

```ts
import { t } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb from '../../schema';
import { fightMatch, fighter, fightInput, fightTick } from './tables';
import { step, initialFighter, type MatchState, type Inputs, type FighterState } from './sim';
import { DT, ROUND_SECONDS } from './constants';

const TICK_MICROS = 33_333n; // ~30 Hz

export function startFightMatch(ctx: any, roomId: bigint): void {
  const members = [...ctx.db.roomMember.roomId.filter(roomId)].sort((a: any, b: any) => a.slot - b.slot);
  if (members.length < 2) return;
  members.forEach((m: any) => {
    const s: FighterState = initialFighter(m.slot);
    ctx.db.fighter.insert({
      id: 0n, roomId, identity: m.identity, slot: m.slot,
      x: s.x, y: s.y, vx: s.vx, vy: s.vy, facing: s.facing, hp: s.hp,
      phase: s.phase, phaseFrame: s.phaseFrame,
    });
    ctx.db.fightInput.insert({ identity: m.identity, roomId, moveX: 0, jump: false, attack: false, block: false, seq: 0 });
  });
  const endsAtMicros = ctx.timestamp.microsSinceUnixEpoch + BigInt(ROUND_SECONDS) * 1_000_000n;
  ctx.db.fightMatch.insert({ roomId, status: 'fighting', tick: 0n, endsAtMicros });
  ctx.db.fightTick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS), roomId });
}

export function endFightMatch(ctx: any, roomId: bigint): void {
  for (const f of [...ctx.db.fighter.roomId.filter(roomId)]) ctx.db.fighter.id.delete(f.id);
  for (const ti of [...ctx.db.fightTick.iter()]) if (ti.roomId === roomId) ctx.db.fightTick.scheduledId.delete(ti.scheduledId);
  const fm = ctx.db.fightMatch.roomId.find(roomId);
  if (fm) ctx.db.fightMatch.roomId.delete(roomId);
  for (const fi of [...ctx.db.fightInput.iter()]) if (fi.roomId === roomId) ctx.db.fightInput.identity.delete(fi.identity);
}

export const fighterTick = spacetimedb.reducer({ timer: fightTick.rowType }, (ctx, { timer }) => {
  const roomId = timer.roomId;
  const fm = ctx.db.fightMatch.roomId.find(roomId);
  if (!fm || fm.status !== 'fighting') return;
  const rows = [...ctx.db.fighter.roomId.filter(roomId)].sort((a: any, b: any) => a.slot - b.slot);
  if (rows.length < 2) return;

  const toState = (r: any): FighterState => ({
    x: r.x, y: r.y, vx: r.vx, vy: r.vy, facing: r.facing, hp: r.hp, phase: r.phase, phaseFrame: r.phaseFrame,
  });
  const inputOf = (id: any): Inputs => {
    const fi = ctx.db.fightInput.identity.find(id);
    return fi ? { moveX: fi.moveX, jump: fi.jump, attack: fi.attack, block: fi.block } : { moveX: 0, jump: false, attack: false, block: false };
  };
  const match: MatchState = { status: 'fighting', tick: Number(fm.tick), fighters: [toState(rows[0]), toState(rows[1])] };
  const next = step(match, [inputOf(rows[0].identity), inputOf(rows[1].identity)], DT);

  next.fighters.forEach((s, i) => {
    ctx.db.fighter.id.update({ ...rows[i], x: s.x, y: s.y, vx: s.vx, vy: s.vy, facing: s.facing, hp: s.hp, phase: s.phase, phaseFrame: s.phaseFrame });
  });

  const timedOut = ctx.timestamp.microsSinceUnixEpoch >= fm.endsAtMicros;
  let status = next.status;
  if (status === 'fighting' && timedOut) status = 'timeout';
  ctx.db.fightMatch.roomId.update({ ...fm, tick: fm.tick + 1n, status });
  if (status !== 'fighting') {
    // stop the tick; mark the room finished. Fighter rows persist so clients show the result.
    for (const ti of [...ctx.db.fightTick.iter()]) if (ti.roomId === roomId) ctx.db.fightTick.scheduledId.delete(ti.scheduledId);
    const room = ctx.db.gameRoom.id.find(roomId);
    if (room) ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
  }
});

// NOTE: the setInput reducer from Task 4 also lives in this match.ts file.
```
(`setInput` from Task 4 is defined in this same `match.ts`, alongside the tick.)

- [ ] **Step 2: dispatch.ts**

```ts
import { startFightMatch, endFightMatch } from './fighter/match';

export function startGame(ctx: any, room: any): void {
  if (room.gameId === 'fighter') startFightMatch(ctx, room.id);
}
export function endGame(ctx: any, room: any): void {
  if (room.gameId === 'fighter') endFightMatch(ctx, room.id);
}
```

- [ ] **Step 3: Wire into core/rooms.ts** — when `doJoinRoom` activates a room, call `startGame(ctx, room)`; in `removeFromRooms`, when a room transitions to `finished` (active room loses a member), call `endGame(ctx, room)` before/after. Add `import { startGame, endGame } from '../games/dispatch';`.

In `doJoinRoom`, replace the activation update with:
```ts
  if (isFull(current.length + 1, game.maxPlayers)) {
    const active = { ...room, status: 'active' };
    ctx.db.gameRoom.id.update(active);
    startGame(ctx, active);
  }
```
In `removeFromRooms`, where it sets an active room to `finished`:
```ts
      } else if (room.status === 'active') {
        endGame(ctx, room);
        ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
      }
```

- [ ] **Step 4: schema.ts + index.ts** — ensure fighter tables registered (Task 3) and re-export `fighterTick`, `setInput`:
```ts
export { fighterTick, setInput } from './games/fighter/match';
```

- [ ] **Step 5: Build + publish locally + verify schema**

Run:
```bash
npm run build:server
spacetime publish rtg --server local -p server/spacetimedb -y
spacetime describe rtg --server local --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("reducers:",(j.reducers||[]).map(r=>r.name).join(", "));console.log("tables:",(j.tables||[]).map(t=>t.name).join(", "))})'
```
Expected: reducers include `fighter_tick`, `set_input`; tables include `fight_match`, `fighter`, `fight_input`, `fight_tick`.

- [ ] **Step 6: Run unit tests + regenerate bindings + commit**

```bash
npm --prefix server/spacetimedb test
spacetime generate --lang typescript --out-dir client/src/module_bindings -p server/spacetimedb
git add server/spacetimedb/src client/src/module_bindings
git commit -m "feat(fighter): tables + tick + start/end wiring + setInput"
```

---

### Task 6: Client — canvas fighter renderer + input + interpolation

**Files:** Create `client/src/games/fighter/constants.ts`, `render.ts`, `FighterGame.tsx`.

- [ ] **Step 1: constants.ts (client copy)** — `ARENA_W`, `FIGHTER_W`, `FIGHTER_H`, `GROUND_Y`, `MAX_HP`, plus `CANVAS_W=800`, `CANVAS_H=360`, `SCALE = CANVAS_W / ARENA_W`.

- [ ] **Step 2: render.ts** — `draw(ctx2d, fighters, hpBySlot)`: clear, draw ground line, draw each fighter as a rounded rect (color by slot), an arm rectangle when `phase==='attack'`, a shield arc when `phase==='block'`, dim when `phase==='ko'`. Map sim coords → canvas: `cx = x * SCALE`, `cy = CANVAS_H - 20 - (y + FIGHTER_H) * SCALE_Y` (feet at ground). Draw HP bars top-left/top-right.

- [ ] **Step 3: FighterGame.tsx** — props `{ roomId: bigint }`.
  - `useTable(tables.fighter.where(r => r.roomId.eq(roomId)))` (or filter client-side) → fighter rows.
  - `useTable(tables.fightMatch...)` → status/result banner.
  - `useReducer(reducers.setInput)`; track held keys (A/D/←/→, W/Space, J attack, K block) in a ref; on any change call `setInput({ moveX, jump, attack, block })` (throttle to send only on change).
  - `requestAnimationFrame` loop: interpolate each fighter toward its latest synced position (keep previous + current snapshot with timestamps; lerp), call `draw`.
  - Show a “You win / You lose / Draw / KO” banner when `fightMatch.status !== 'fighting'`, with a “Back to arcade” button calling `reducers.leaveRoom`.

- [ ] **Step 4: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: pass (reconcile reducer/table accessor names: `reducers.setInput`, `tables.fighter`, `tables.fightMatch`).

- [ ] **Step 5: Commit**

```bash
git add client/src/games/fighter
git commit -m "feat(client/fighter): canvas renderer + input + interpolation"
```

---

### Task 7: Route active fighter rooms into the game

**Files:** Modify `client/src/arcade/WaitingRoom.tsx` (or App routing), `client/src/App.css`.

- [ ] **Step 1: Render the game when active** — in `WaitingRoom`, when `room.status === 'active'` and `room.gameId === 'fighter'`, render `<FighterGame roomId={roomId} />` instead of the “Match starting…” placeholder; keep the seats/leave UI for `waiting`/`finished`.

- [ ] **Step 2: Canvas CSS** — center the canvas, dark felt background, crisp pixels (`image-rendering`), responsive max-width.

- [ ] **Step 3: Typecheck + build**

Run: `npm --prefix client run typecheck && npm --prefix client run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add client/src
git commit -m "feat(client): route active fighter rooms into the canvas game"
```

---

### Task 8: Local 2-player playtest, then deploy + verify live

- [ ] **Step 1: Local playtest** — local `spacetime start` + published `rtg` + `npm --prefix client run dev`. Two browser contexts quick-match into the same room; confirm: the canvas shows two fighters, both move/jump/attack via keyboard, HP decreases on hits, blocking mitigates, a KO or 60s timeout ends the match with a banner, “Back to arcade” returns both players. Watch for desync/jitter; tune interpolation if needed.

- [ ] **Step 2: Deploy** — `git checkout master && git merge phase3-fighter --ff-only && git push origin master`.

- [ ] **Step 3: Watch deploy** — `gh run watch <deploy-id> --repo tomasmen/rtg --exit-status` (both jobs green).

- [ ] **Step 4: Verify live** at https://tomasmen.github.io/rtg/ with two browser contexts: quick-match → a real fight resolves.

- [ ] **Step 5: Clean up branch** — `git branch -d phase3-fighter`.

---

## Definition of done (Phase 3)

- Two people on the live URL quick-match and play a real-time 1v1 fight: move, jump, attack, block; hits reduce HP; KO or timeout ends the match with a result; both return to the arcade.
- The simulation is server-authoritative (clients only send inputs) and deterministic (fixed 30 Hz timestep), covered by vitest; CI green; deployed.

## Deferred (a Phase 4 “polish” plan)

Best-of-3 rounds, richer moves/combos, sprites/animation/juice, sound, mobile touch controls, client-side prediction + reconciliation, spectating.
