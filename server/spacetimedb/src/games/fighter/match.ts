import { t } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb from '../../schema';
import { fightTick, fightTickRef } from './tables';
import {
  step, initialFighter,
  type MatchState, type Inputs, type FighterState,
} from './sim';
import { roundOutcome, applyRoundWin } from './rounds';
import {
  DT, ARENA_W, ROUND_SECONDS, INTRO_SECONDS, ROUND_END_SECONDS, MAX_ROUNDS,
} from './constants';

const TICK_MICROS = 33_333n; // ~30 Hz
const SECOND = 1_000_000n;

// The sim fields of FighterState, pulled off a fighter table row.
function toState(r: any): FighterState {
  return {
    x: r.x, y: r.y, vx: r.vx, vy: r.vy, facing: r.facing, hp: r.hp,
    phase: r.phase, phaseFrame: r.phaseFrame,
    attackKind: r.attackKind, attackHasHit: r.attackHasHit, airAttackUsed: r.airAttackUsed,
    stunFrames: r.stunFrames, stamina: r.stamina, staminaCd: r.staminaCd, exhausted: r.exhausted, attackCd: r.attackCd,
    prevJump: r.prevJump, prevLight: r.prevLight, prevHeavy: r.prevHeavy,
    prevMoveX: r.prevMoveX, dashTapDir: r.dashTapDir, dashTapFrames: r.dashTapFrames,
  };
}

// Merge a FighterState back onto its row (preserves id/roomId/identity/slot).
function withState(row: any, s: FighterState): any {
  return {
    ...row,
    x: s.x, y: s.y, vx: s.vx, vy: s.vy, facing: s.facing, hp: s.hp,
    phase: s.phase, phaseFrame: s.phaseFrame,
    attackKind: s.attackKind, attackHasHit: s.attackHasHit, airAttackUsed: s.airAttackUsed,
    stunFrames: s.stunFrames, stamina: s.stamina, staminaCd: s.staminaCd, exhausted: s.exhausted, attackCd: s.attackCd,
    prevJump: s.prevJump, prevLight: s.prevLight, prevHeavy: s.prevHeavy,
    prevMoveX: s.prevMoveX, dashTapDir: s.dashTapDir, dashTapFrames: s.dashTapFrames,
  };
}

function emit(ctx: any, roomId: bigint, kind: string, victimSlot: number, x: number, y: number, amount: number): void {
  ctx.db.fightEvent.insert({ roomId, kind, victimSlot, x, y, amount });
}

function stopTick(ctx: any, roomId: bigint): void {
  for (const ti of [...ctx.db.fightTick.iter()]) {
    if (ti.roomId === roomId) ctx.db.fightTick.scheduledId.delete(ti.scheduledId);
  }
}

// Set up a fresh best-of-3 when a fighter room activates: two fighter rows, two
// input rows, the match row (starting in the round-1 intro), and the tick.
export function startFightMatch(ctx: any, roomId: bigint): void {
  const members = [...ctx.db.roomMember.roomId.filter(roomId)].sort(
    (a: any, b: any) => a.slot - b.slot
  );
  if (members.length < 2) return;
  for (const m of members) {
    const s = initialFighter(m.slot);
    ctx.db.fighter.insert(withState({ id: 0n, roomId, identity: m.identity, slot: m.slot }, s));
    ctx.db.fightInput.insert({
      identity: m.identity, roomId,
      moveX: 0, jump: false, light: false, heavy: false, block: false, crouch: false, seq: 0,
    });
  }
  const now = ctx.timestamp.microsSinceUnixEpoch;
  ctx.db.fightMatch.insert({
    roomId, status: 'live', phase: 'intro', round: 1,
    roundWins0: 0, roundWins1: 0, pendingWinner: -1,
    tick: 0n, endsAtMicros: 0n, phaseEndsAtMicros: now + BigInt(INTRO_SECONDS) * SECOND,
  });
  ctx.db.fightTick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS), roomId });
  emit(ctx, roomId, 'roundStart', -1, ARENA_W / 2, 0, 1);
}

// Tear down all fight state for a room. Idempotent (existence-checked).
export function endFightMatch(ctx: any, roomId: bigint): void {
  for (const f of [...ctx.db.fighter.roomId.filter(roomId)]) ctx.db.fighter.id.delete(f.id);
  stopTick(ctx, roomId);
  for (const fi of [...ctx.db.fightInput.iter()]) {
    if (fi.roomId === roomId) ctx.db.fightInput.identity.delete(fi.identity);
  }
  if (ctx.db.fightMatch.roomId.find(roomId)) ctx.db.fightMatch.roomId.delete(roomId);
}

// The caller updates their latest input intent. The tick reads it.
export const setInput = spacetimedb.reducer(
  { moveX: t.i8(), jump: t.bool(), light: t.bool(), heavy: t.bool(), block: t.bool(), crouch: t.bool() },
  (ctx, { moveX, jump, light, heavy, block, crouch }) => {
    const mine = [...ctx.db.fighter.identity.filter(ctx.sender)];
    if (mine.length === 0) return;
    const roomId = mine[0].roomId;
    const existing = ctx.db.fightInput.identity.find(ctx.sender);
    if (existing) {
      ctx.db.fightInput.identity.update({ ...existing, moveX, jump, light, heavy, block, crouch, roomId, seq: existing.seq + 1 });
    } else {
      ctx.db.fightInput.insert({ identity: ctx.sender, roomId, moveX, jump, light, heavy, block, crouch, seq: 0 });
    }
  }
);

// The 30 Hz scheduled tick: drives the round state machine.
export const fighterTick = spacetimedb.reducer({ timer: fightTick.rowType }, (ctx, { timer }) => {
  const roomId = timer.roomId;
  const fm = ctx.db.fightMatch.roomId.find(roomId);
  if (!fm || fm.status === 'done') return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const bump = (extra: Record<string, unknown>) =>
    ctx.db.fightMatch.roomId.update({ ...fm, tick: fm.tick + 1n, ...extra });

  const endMatch = (winnerSlot: number, wins0: number, wins1: number) => {
    bump({ phase: 'matchEnd', status: 'done', roundWins0: wins0, roundWins1: wins1 });
    emit(ctx, roomId, 'matchEnd', -1, ARENA_W / 2, 0, winnerSlot);
    stopTick(ctx, roomId);
    const room = ctx.db.gameRoom.id.find(roomId);
    if (room) ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
  };

  // --- intro: freeze, then start the round clock ---
  if (fm.phase === 'intro') {
    if (now >= fm.phaseEndsAtMicros) {
      bump({ phase: 'fighting', endsAtMicros: now + BigInt(ROUND_SECONDS) * SECOND });
    } else {
      bump({});
    }
    return;
  }

  // --- fighting: step the sim, emit hit events, check for round end ---
  if (fm.phase === 'fighting') {
    const rows = [...ctx.db.fighter.roomId.filter(roomId)].sort((a: any, b: any) => a.slot - b.slot);
    if (rows.length < 2) return;

    const inputOf = (id: any): Inputs => {
      const fi = ctx.db.fightInput.identity.find(id);
      return fi
        ? { moveX: fi.moveX, jump: fi.jump, light: fi.light, heavy: fi.heavy, block: fi.block, crouch: fi.crouch }
        : { moveX: 0, jump: false, light: false, heavy: false, block: false, crouch: false };
    };

    const match: MatchState = {
      status: 'fighting',
      tick: Number(fm.tick),
      fighters: [toState(rows[0]), toState(rows[1])],
    };
    const next = step(match, [inputOf(rows[0].identity), inputOf(rows[1].identity)], DT);

    next.fighters.forEach((s, i) => ctx.db.fighter.id.update(withState(rows[i], s)));
    for (const ev of next.events) emit(ctx, roomId, ev.kind, ev.victimSlot, ev.x, ev.y, ev.amount);

    const hp0 = next.fighters[0].hp;
    const hp1 = next.fighters[1].hp;
    const timedOut = now >= fm.endsAtMicros;
    const oc = roundOutcome(hp0, hp1, timedOut);

    if (oc.over) {
      if (hp0 <= 0 || hp1 <= 0) emit(ctx, roomId, 'ko', -1, ARENA_W / 2, 0, oc.winnerSlot);
      bump({ phase: 'roundEnd', pendingWinner: oc.winnerSlot, phaseEndsAtMicros: now + BigInt(ROUND_END_SECONDS) * SECOND });
    } else {
      bump({});
    }
    return;
  }

  // --- roundEnd: pause, then award the round and start the next or end the match ---
  if (fm.phase === 'roundEnd') {
    if (now < fm.phaseEndsAtMicros) { bump({}); return; }

    const res = applyRoundWin(fm.pendingWinner, fm.roundWins0, fm.roundWins1);
    emit(ctx, roomId, 'roundEnd', -1, ARENA_W / 2, 0, fm.pendingWinner);

    // End on 2 round-wins, or hard-cap total rounds so repeated draws can't loop forever.
    const reachedCap = fm.round >= MAX_ROUNDS;
    if (res.matchOver || reachedCap) {
      const winner = res.matchOver
        ? res.matchWinnerSlot
        : res.roundWins0 > res.roundWins1 ? 0 : res.roundWins1 > res.roundWins0 ? 1 : -1;
      endMatch(winner, res.roundWins0, res.roundWins1);
    } else {
      for (const r of [...ctx.db.fighter.roomId.filter(roomId)]) {
        ctx.db.fighter.id.update(withState(r, initialFighter(r.slot)));
      }
      const nextRound = fm.round + 1;
      bump({
        phase: 'intro', round: nextRound,
        roundWins0: res.roundWins0, roundWins1: res.roundWins1, pendingWinner: -1,
        phaseEndsAtMicros: now + BigInt(INTRO_SECONDS) * SECOND,
      });
      emit(ctx, roomId, 'roundStart', -1, ARENA_W / 2, 0, nextRound);
    }
    return;
  }
  // matchEnd: tick already stopped; nothing to do.
});

// Late-bind the tick reducer for the scheduled table (see tables.ts).
fightTickRef.fn = fighterTick;
