import { table, t } from 'spacetimedb/server';

// Per-match state (one row per active fighter room). Carries the best-of-3
// round state machine: phase (intro|fighting|roundEnd|matchEnd), the current
// round, per-slot round wins, and the deadline for the current phase.
export const fightMatch = table(
  { name: 'fight_match', public: true },
  {
    roomId: t.u64().primaryKey(),
    status: t.string(),            // 'live' | 'done'
    phase: t.string(),             // 'intro' | 'fighting' | 'roundEnd' | 'matchEnd'
    round: t.u32(),
    roundWins0: t.u32(),
    roundWins1: t.u32(),
    pendingWinner: t.i8(),         // round winner slot decided at fighting->roundEnd (-1 = draw)
    tick: t.u64(),
    endsAtMicros: t.u64(),         // current round's fight timer deadline
    phaseEndsAtMicros: t.u64(),    // intro / roundEnd pause deadline
  }
);

// One row per fighter in a match. Mirrors sim.FighterState exactly (the tick
// reconstructs FighterState from these columns, steps the pure sim, and writes
// the result back). The prev*/dashTap* columns are sim-internal edge/dash memory
// the client ignores; attackKind/phase/phaseFrame drive the procedural skeleton.
export const fighter = table(
  { name: 'fighter', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    identity: t.identity().index('btree'),
    slot: t.u8(),
    x: t.f32(),
    y: t.f32(),
    vx: t.f32(),
    vy: t.f32(),
    facing: t.i8(),
    hp: t.f32(),
    phase: t.string(),
    phaseFrame: t.u32(),
    attackKind: t.string(),
    attackHasHit: t.bool(),
    airAttackUsed: t.bool(),
    stunFrames: t.u32(),
    prevJump: t.bool(),
    prevLight: t.bool(),
    prevHeavy: t.bool(),
    prevMoveX: t.i8(),
    dashTapDir: t.i8(),
    dashTapFrames: t.u32(),
  }
);

// Latest input intent per player (the tick reads this).
export const fightInput = table(
  { name: 'fight_input', public: true },
  {
    identity: t.identity().primaryKey(),
    roomId: t.u64(),
    moveX: t.i8(),
    jump: t.bool(),
    light: t.bool(),
    heavy: t.bool(),
    block: t.bool(),
    crouch: t.bool(),
    seq: t.u32(),
  }
);

// Transient hit/round events broadcast to clients to drive juice (hitstop,
// shake, sparks, flash) and (future) sound. Event-table rows are ephemeral:
// not stored client- or server-side; only `onInsert` fires. No primary key.
export const fightEvent = table(
  { name: 'fight_event', public: true, event: true },
  {
    roomId: t.u64(),
    kind: t.string(),   // 'hit' | 'block' | 'ko' | 'roundStart' | 'roundEnd' | 'matchEnd'
    victimSlot: t.i8(), // for hit/block: who got struck (-1 for non-combat events)
    x: t.f32(),
    y: t.f32(),
    amount: t.f32(),
  }
);

// Late-bound reference to the tick reducer. match.ts assigns `.fn` once it has
// defined the reducer; the scheduled arrow reads it lazily. This keeps schema.ts
// (which imports this file) from transitively importing the reducer module,
// avoiding a circular-dependency TDZ error.
export const fightTickRef: { fn: unknown } = { fn: null };

export const fightTick = table(
  { name: 'fight_tick', scheduled: (): any => fightTickRef.fn },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    roomId: t.u64(),
  }
);
