import { t } from 'spacetimedb/server';
import spacetimedb from '../../schema';
import { START_FEN, legalMoves, applyMove, status } from './rules';

function turnOf(fen: string): string {
  return fen.split(' ')[1] ?? 'w';
}

// slot 0 = white, slot 1 = black.
function colorOfSlot(slot: number): string {
  return slot === 0 ? 'w' : 'b';
}

// Parse a room's chess time-control setting. Formats: '' / 'none' = no clock;
// 'MM+SS' = MM minutes + SS-second increment; 'MM' = MM minutes, no increment.
function parseTimeControl(settings: string): { clocked: boolean; initialMs: bigint; incMs: bigint } {
  const s = (settings || '').trim();
  if (!s || s === 'none') return { clocked: false, initialMs: 0n, incMs: 0n };
  const parts = s.split('+');
  const min = Number(parts[0]);
  const inc = parts.length > 1 ? Number(parts[1]) : 0;
  if (!Number.isFinite(min) || min <= 0) return { clocked: false, initialMs: 0n, incMs: 0n };
  return {
    clocked: true,
    initialMs: BigInt(Math.round(min * 60000)),
    incMs: BigInt(Math.round((Number.isFinite(inc) ? inc : 0) * 1000)),
  };
}

export function startChessGame(ctx: any, roomId: bigint): void {
  const fen = START_FEN;
  const st = status(fen);
  const room = ctx.db.gameRoom.id.find(roomId);
  const tc = parseTimeControl(room ? room.settings : '');
  ctx.db.chessGame.insert({
    roomId,
    fen,
    turn: turnOf(fen),
    status: st.state,
    winner: st.winner,
    legalMoves: legalMoves(fen).join(','),
    lastMove: '',
    check: st.check,
    clocked: tc.clocked,
    whiteMs: tc.initialMs,
    blackMs: tc.initialMs,
    incMs: tc.incMs,
    turnStartMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}

export function endChessGame(ctx: any, roomId: bigint): void {
  if (ctx.db.chessGame.roomId.find(roomId)) ctx.db.chessGame.roomId.delete(roomId);
}

function finishRoom(ctx: any, roomId: bigint): void {
  const room = ctx.db.gameRoom.id.find(roomId);
  if (room) ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
}

// Time remaining (ms) for the side to move, given the elapsed since turn start.
function liveRemaining(game: any, nowMicros: bigint): bigint {
  const elapsedMs = (nowMicros - game.turnStartMicros) / 1000n;
  const moverMs = game.turn === 'w' ? game.whiteMs : game.blackMs;
  return moverMs - elapsedMs;
}

function endByTimeout(ctx: any, game: any): void {
  const winner = game.turn === 'w' ? 1 : 0; // the side to move ran out → other wins
  ctx.db.chessGame.roomId.update({
    ...game,
    status: 'timeout',
    winner,
    legalMoves: '',
    whiteMs: game.turn === 'w' ? 0n : game.whiteMs,
    blackMs: game.turn === 'b' ? 0n : game.blackMs,
  });
  finishRoom(ctx, game.roomId);
}

// Submit a move (UCI). Validated against the server's legal-move set; only the
// player to move may move; applies the chess clock (deduct elapsed + increment).
export const chessMove = spacetimedb.reducer({ uci: t.string() }, (ctx, { uci }) => {
  const mine = [...ctx.db.roomMember.identity.filter(ctx.sender)];
  if (mine.length === 0) return;
  const roomId = mine[0].roomId;
  const game = ctx.db.chessGame.roomId.find(roomId);
  if (!game || game.status !== 'active') return;
  if (game.turn !== colorOfSlot(mine[0].slot)) return;

  const legal = game.legalMoves ? game.legalMoves.split(',') : [];
  if (!legal.includes(uci)) return;

  const now = ctx.timestamp.microsSinceUnixEpoch;
  let whiteMs = game.whiteMs;
  let blackMs = game.blackMs;

  if (game.clocked) {
    const remaining = liveRemaining(game, now);
    if (remaining <= 0n) { endByTimeout(ctx, game); return; } // move arrived too late
    const newMoverMs = remaining + game.incMs;
    if (game.turn === 'w') whiteMs = newMoverMs; else blackMs = newMoverMs;
  }

  const fen = applyMove(game.fen, uci);
  const st = status(fen);
  ctx.db.chessGame.roomId.update({
    ...game,
    fen,
    turn: turnOf(fen),
    status: st.state,
    winner: st.winner,
    legalMoves: st.state === 'active' ? legalMoves(fen).join(',') : '',
    lastMove: uci,
    check: st.check,
    whiteMs,
    blackMs,
    turnStartMicros: now,
  });
  if (st.state !== 'active') finishRoom(ctx, roomId);
});

// Either player may claim a flag fall; the server verifies the side to move is
// actually out of time before awarding the win.
export const chessClaimTimeout = spacetimedb.reducer((ctx) => {
  const mine = [...ctx.db.roomMember.identity.filter(ctx.sender)];
  if (mine.length === 0) return;
  const roomId = mine[0].roomId;
  const game = ctx.db.chessGame.roomId.find(roomId);
  if (!game || game.status !== 'active' || !game.clocked) return;
  if (liveRemaining(game, ctx.timestamp.microsSinceUnixEpoch) > 0n) return; // not flagged yet
  endByTimeout(ctx, game);
});

// Resign — the opponent wins.
export const chessResign = spacetimedb.reducer((ctx) => {
  const mine = [...ctx.db.roomMember.identity.filter(ctx.sender)];
  if (mine.length === 0) return;
  const roomId = mine[0].roomId;
  const game = ctx.db.chessGame.roomId.find(roomId);
  if (!game || game.status !== 'active') return;
  const winner = mine[0].slot === 0 ? 1 : 0;
  ctx.db.chessGame.roomId.update({ ...game, status: 'resigned', winner, legalMoves: '' });
  finishRoom(ctx, roomId);
});
