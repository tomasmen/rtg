import { table, t } from 'spacetimedb/server';

// Per-match state (one row per active fighter room).
export const fightMatch = table(
  { name: 'fight_match', public: true },
  {
    roomId: t.u64().primaryKey(),
    status: t.string(), // 'fighting' | 'ko' | 'timeout'
    tick: t.u64(),
    endsAtMicros: t.u64(),
  }
);

// One row per fighter in a match.
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
    attack: t.bool(),
    block: t.bool(),
    seq: t.u32(),
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
