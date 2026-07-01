import { t } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb from '../../schema';
import { poolTick, poolTickRef } from './tables';
import { substep, anyMoving, type Ball } from './physics';
import { resolveShot, type Assign } from './rules';
import {
  rackPositions, CUE_START, MAX_SHOT_V, ballGroup,
  BALL_R, TABLE_W, TABLE_H,
} from './constants';

const TICK_MICROS = 33_333n; // ~30 Hz
const SUBSTEPS = 6;
const SUB_DT = 1 / 180; // SUBSTEPS * SUB_DT = 1/30
const MAX_SHOT_TICKS = 360; // ~12s safety cap

// ---- lifecycle ----

export function startPool(ctx: any, roomId: bigint): void {
  const members = [...ctx.db.roomMember.roomId.filter(roomId)].sort((a: any, b: any) => a.slot - b.slot);
  if (members.length < 2) return;
  members.forEach((m: any, i: number) => {
    ctx.db.poolSeat.insert({ id: 0n, roomId, identity: m.identity, seat: i });
  });
  ctx.db.poolBall.insert({ id: 0n, roomId, num: 0, x: CUE_START.x, y: CUE_START.y, vx: 0, vy: 0, pocketed: false });
  for (const p of rackPositions()) {
    ctx.db.poolBall.insert({ id: 0n, roomId, num: p.num, x: p.x, y: p.y, vx: 0, vy: 0, pocketed: false });
  }
  ctx.db.poolGame.insert({
    roomId, status: 'active', phase: 'aiming', currentSeat: 0, seatCount: members.length,
    group0: 'open', group1: 'open', winnerSeat: -1, ballInHand: false, log: 'Break!',
    firstContact: 'none', pottedRed: 0, pottedYellow: 0, pottedBlack: false, cueScratched: false, shotTicks: 0,
  });
}

export function endPool(ctx: any, roomId: bigint): void {
  for (const b of [...ctx.db.poolBall.roomId.filter(roomId)]) ctx.db.poolBall.id.delete(b.id);
  for (const s of [...ctx.db.poolSeat.roomId.filter(roomId)]) ctx.db.poolSeat.id.delete(s.id);
  stopTick(ctx, roomId);
  if (ctx.db.poolGame.roomId.find(roomId)) ctx.db.poolGame.roomId.delete(roomId);
}

function stopTick(ctx: any, roomId: bigint): void {
  for (const ti of [...ctx.db.poolTick.iter()]) {
    if (ti.roomId === roomId) ctx.db.poolTick.scheduledId.delete(ti.scheduledId);
  }
}

function mySeat(ctx: any): { seat: number; roomId: bigint } | null {
  const rows = [...ctx.db.poolSeat.identity.filter(ctx.sender)];
  return rows.length ? { seat: rows[0].seat, roomId: rows[0].roomId } : null;
}

function cueRow(ctx: any, roomId: bigint): any {
  for (const b of [...ctx.db.poolBall.roomId.filter(roomId)]) if (b.num === 0) return b;
  return null;
}

// ---- reducers ----

// Fire the cue ball at `angle` (radians) with `power` in [0,1]; the tick sims it.
export const poolShoot = spacetimedb.reducer(
  { angle: t.f32(), power: t.f32() },
  (ctx, { angle, power }) => {
    const mine = mySeat(ctx);
    if (!mine) throw new Error('not in a pool game');
    const game = ctx.db.poolGame.roomId.find(mine.roomId);
    if (!game || game.status !== 'active') throw new Error('no active game');
    if (game.currentSeat !== mine.seat) throw new Error('not your turn');
    if (game.phase !== 'aiming') throw new Error('cannot shoot now');

    const p = Math.max(0.05, Math.min(1, power));
    const speed = p * MAX_SHOT_V;
    const cue = cueRow(ctx, mine.roomId);
    if (!cue) throw new Error('no cue ball');
    ctx.db.poolBall.id.update({ ...cue, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });

    ctx.db.poolGame.roomId.update({
      ...game, phase: 'simulating', ballInHand: false, log: 'Shooting…',
      firstContact: 'none', pottedRed: 0, pottedYellow: 0, pottedBlack: false, cueScratched: false, shotTicks: 0,
    });
    ctx.db.poolTick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS), roomId: mine.roomId });
  }
);

// Ball-in-hand: place the cue ball at (x,y) after a foul, then aim.
export const poolPlaceCue = spacetimedb.reducer(
  { x: t.f32(), y: t.f32() },
  (ctx, { x, y }) => {
    const mine = mySeat(ctx);
    if (!mine) throw new Error('not in a pool game');
    const game = ctx.db.poolGame.roomId.find(mine.roomId);
    if (!game || game.status !== 'active') throw new Error('no active game');
    if (game.currentSeat !== mine.seat) throw new Error('not your turn');
    if (game.phase !== 'ballinhand') throw new Error('not ball-in-hand');
    const cue = cueRow(ctx, mine.roomId);
    if (!cue) throw new Error('no cue ball');
    const cx = Math.max(BALL_R, Math.min(TABLE_W - BALL_R, x));
    const cy = Math.max(BALL_R, Math.min(TABLE_H - BALL_R, y));
    ctx.db.poolBall.id.update({ ...cue, x: cx, y: cy, vx: 0, vy: 0, pocketed: false });
    ctx.db.poolGame.roomId.update({ ...game, phase: 'aiming', ballInHand: false, log: 'Ball in hand — take your shot.' });
  }
);

// ---- the 30 Hz simulation tick ----

export const poolTicker = spacetimedb.reducer({ timer: poolTick.rowType }, (ctx, { timer }) => {
  const roomId = timer.roomId;
  const game = ctx.db.poolGame.roomId.find(roomId);
  if (!game || game.phase !== 'simulating') { stopTick(ctx, roomId); return; }

  const rows = [...ctx.db.poolBall.roomId.filter(roomId)];
  const balls: Ball[] = rows.map(r => ({ num: r.num, x: r.x, y: r.y, vx: r.vx, vy: r.vy, pocketed: r.pocketed }));

  let firstContact = game.firstContact;
  let pottedRed = game.pottedRed;
  let pottedYellow = game.pottedYellow;
  let pottedBlack = game.pottedBlack;
  let cueScratched = game.cueScratched;

  for (let s = 0; s < SUBSTEPS; s++) {
    for (const ev of substep(balls, SUB_DT)) {
      if (ev.kind === 'pot') {
        const g = ballGroup(ev.num);
        if (ev.num === 0) cueScratched = true;
        else if (g === 'red') pottedRed += 1;
        else if (g === 'yellow') pottedYellow += 1;
        else if (g === 'black') pottedBlack = true;
      } else if (ev.kind === 'contact' && ev.num === 0 && firstContact === 'none') {
        firstContact = ballGroup(ev.other);
      }
    }
  }

  // write back only changed balls
  rows.forEach((r, i) => {
    const b = balls[i];
    if (r.x !== b.x || r.y !== b.y || r.vx !== b.vx || r.vy !== b.vy || r.pocketed !== b.pocketed) {
      ctx.db.poolBall.id.update({ ...r, x: b.x, y: b.y, vx: b.vx, vy: b.vy, pocketed: b.pocketed });
    }
  });

  const shotTicks = game.shotTicks + 1;
  const settled = !anyMoving(balls) || shotTicks >= MAX_SHOT_TICKS;
  if (!settled) {
    ctx.db.poolGame.roomId.update({ ...game, firstContact, pottedRed, pottedYellow, pottedBlack, cueScratched, shotTicks });
    return;
  }

  // ---- shot settled: resolve ----
  stopTick(ctx, roomId);

  const redsLeft = balls.filter(b => !b.pocketed && ballGroup(b.num) === 'red').length;
  const yellowsLeft = balls.filter(b => !b.pocketed && ballGroup(b.num) === 'yellow').length;
  const shooterGroup = (game.currentSeat === 0 ? game.group0 : game.group1) as Assign;

  const res = resolveShot({
    shooterGroup,
    firstContact: firstContact as 'red' | 'yellow' | 'black' | 'none',
    potted: { red: pottedRed, yellow: pottedYellow, black: pottedBlack, cue: cueScratched },
    remainingBefore: { red: redsLeft + pottedRed, yellow: yellowsLeft + pottedYellow },
  });

  // respawn a scratched cue ball onto the table
  if (cueScratched) {
    const cue = cueRow(ctx, roomId);
    if (cue) ctx.db.poolBall.id.update({ ...cue, x: CUE_START.x, y: CUE_START.y, vx: 0, vy: 0, pocketed: false });
  }

  const group0 = game.currentSeat === 0 ? res.assignedGroup : game.group0;
  const group1 = game.currentSeat === 1 ? res.assignedGroup : game.group1;

  if (res.ended) {
    const winnerSeat = res.winnerIsShooter ? game.currentSeat : (game.currentSeat === 0 ? 1 : 0);
    ctx.db.poolGame.roomId.update({
      ...game, status: 'ended', phase: 'ended', winnerSeat, group0, group1, log: res.reason,
      firstContact, pottedRed, pottedYellow, pottedBlack, cueScratched, shotTicks,
    });
    const room = ctx.db.gameRoom.id.find(roomId);
    if (room) ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
    return;
  }

  const nextSeat = res.continueTurn ? game.currentSeat : (game.currentSeat === 0 ? 1 : 0);
  ctx.db.poolGame.roomId.update({
    ...game, currentSeat: nextSeat, phase: res.ballInHand ? 'ballinhand' : 'aiming',
    ballInHand: res.ballInHand, group0, group1, log: res.reason,
    firstContact, pottedRed, pottedYellow, pottedBlack, cueScratched, shotTicks,
  });
});

// Late-bind the tick reducer for the scheduled table.
poolTickRef.fn = poolTicker;
