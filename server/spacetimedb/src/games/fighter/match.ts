import { t } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb from '../../schema';
import { fightTick, fightTickRef } from './tables';
import { step, initialFighter, type MatchState, type Inputs, type FighterState } from './sim';
import { DT, ROUND_SECONDS } from './constants';

const TICK_MICROS = 33_333n; // ~30 Hz

// Set up a fresh fight when a fighter room activates: two fighter rows, two
// input rows, the match row, and the repeating tick schedule.
export function startFightMatch(ctx: any, roomId: bigint): void {
  const members = [...ctx.db.roomMember.roomId.filter(roomId)].sort(
    (a: any, b: any) => a.slot - b.slot
  );
  if (members.length < 2) return;
  for (const m of members) {
    const s = initialFighter(m.slot);
    ctx.db.fighter.insert({
      id: 0n, roomId, identity: m.identity, slot: m.slot,
      x: s.x, y: s.y, vx: s.vx, vy: s.vy, facing: s.facing, hp: s.hp,
      phase: s.phase, phaseFrame: s.phaseFrame,
    });
    ctx.db.fightInput.insert({
      identity: m.identity, roomId, moveX: 0, jump: false, attack: false, block: false, seq: 0,
    });
  }
  const endsAtMicros = ctx.timestamp.microsSinceUnixEpoch + BigInt(ROUND_SECONDS) * 1_000_000n;
  ctx.db.fightMatch.insert({ roomId, status: 'fighting', tick: 0n, endsAtMicros });
  ctx.db.fightTick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS), roomId });
}

// Tear down all fight state for a room.
export function endFightMatch(ctx: any, roomId: bigint): void {
  for (const f of [...ctx.db.fighter.roomId.filter(roomId)]) ctx.db.fighter.id.delete(f.id);
  for (const ti of [...ctx.db.fightTick.iter()]) {
    if (ti.roomId === roomId) ctx.db.fightTick.scheduledId.delete(ti.scheduledId);
  }
  for (const fi of [...ctx.db.fightInput.iter()]) {
    if (fi.roomId === roomId) ctx.db.fightInput.identity.delete(fi.identity);
  }
  if (ctx.db.fightMatch.roomId.find(roomId)) ctx.db.fightMatch.roomId.delete(roomId);
}

// The caller updates their latest input intent. The tick reads it.
export const setInput = spacetimedb.reducer(
  { moveX: t.i8(), jump: t.bool(), attack: t.bool(), block: t.bool() },
  (ctx, { moveX, jump, attack, block }) => {
    const mine = [...ctx.db.fighter.identity.filter(ctx.sender)];
    if (mine.length === 0) return;
    const roomId = mine[0].roomId;
    const existing = ctx.db.fightInput.identity.find(ctx.sender);
    if (existing) {
      ctx.db.fightInput.identity.update({ ...existing, moveX, jump, attack, block, roomId, seq: existing.seq + 1 });
    } else {
      ctx.db.fightInput.insert({ identity: ctx.sender, roomId, moveX, jump, attack, block, seq: 0 });
    }
  }
);

// The 30 Hz scheduled tick: read state + inputs → pure step() → write back.
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
    return fi
      ? { moveX: fi.moveX, jump: fi.jump, attack: fi.attack, block: fi.block }
      : { moveX: 0, jump: false, attack: false, block: false };
  };

  const match: MatchState = {
    status: 'fighting',
    tick: Number(fm.tick),
    fighters: [toState(rows[0]), toState(rows[1])],
  };
  const next = step(match, [inputOf(rows[0].identity), inputOf(rows[1].identity)], DT);

  next.fighters.forEach((s, i) => {
    ctx.db.fighter.id.update({
      ...rows[i],
      x: s.x, y: s.y, vx: s.vx, vy: s.vy, facing: s.facing, hp: s.hp, phase: s.phase, phaseFrame: s.phaseFrame,
    });
  });

  const timedOut = ctx.timestamp.microsSinceUnixEpoch >= fm.endsAtMicros;
  let status = next.status;
  if (status === 'fighting' && timedOut) status = 'timeout';
  ctx.db.fightMatch.roomId.update({ ...fm, tick: fm.tick + 1n, status });

  if (status !== 'fighting') {
    // stop ticking and mark the room finished; fighter rows persist so clients
    // can show the result.
    for (const ti of [...ctx.db.fightTick.iter()]) {
      if (ti.roomId === roomId) ctx.db.fightTick.scheduledId.delete(ti.scheduledId);
    }
    const room = ctx.db.gameRoom.id.find(roomId);
    if (room) ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
  }
});

// Late-bind the tick reducer for the scheduled table (see tables.ts).
fightTickRef.fn = fighterTick;
