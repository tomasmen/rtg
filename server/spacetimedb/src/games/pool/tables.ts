import { table, t } from 'spacetimedb/server';

// One row per ball on a table (cue = num 0). Clients subscribe and render;
// the tick writes positions each frame while a shot simulates.
export const poolBall = table(
  { name: 'pool_ball', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    num: t.u8(),          // 0 cue · 1-7 red · 8 black · 9-15 yellow
    x: t.f32(),
    y: t.f32(),
    vx: t.f32(),
    vy: t.f32(),
    pocketed: t.bool(),
  }
);

// Per-match state: turn/phase machine + this-shot accumulators the tick fills in
// (so the rules engine can resolve once the balls settle).
export const poolGame = table(
  { name: 'pool_game', public: true },
  {
    roomId: t.u64().primaryKey(),
    status: t.string(),         // 'active' | 'ended'
    phase: t.string(),          // 'aiming' | 'simulating' | 'ballinhand' | 'ended'
    currentSeat: t.u8(),
    seatCount: t.u8(),
    group0: t.string(),         // 'open' | 'red' | 'yellow'
    group1: t.string(),
    winnerSeat: t.i8(),         // -1 until ended
    ballInHand: t.bool(),
    log: t.string(),
    // shot accumulators (reset on each poolShoot)
    firstContact: t.string(),   // 'none' | 'red' | 'yellow' | 'black'
    pottedRed: t.u8(),
    pottedYellow: t.u8(),
    pottedBlack: t.bool(),
    cueScratched: t.bool(),
    shotTicks: t.u32(),         // safety guard against a never-settling shot
  }
);

// Which identity holds each seat (0/1).
export const poolSeat = table(
  { name: 'pool_seat', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    identity: t.identity().index('btree'),
    seat: t.u8(),
  }
);

// Late-bound tick reducer ref (breaks the table↔reducer circular dep; see fighter).
export const poolTickRef: { fn: unknown } = { fn: null };

export const poolTick = table(
  { name: 'pool_tick', scheduled: (): any => poolTickRef.fn },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    roomId: t.u64(),
  }
);
