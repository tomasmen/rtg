import { t } from 'spacetimedb/server';
import spacetimedb from '../../schema';
import { START_FEN, legalMoves, applyMove, status } from './rules';

// Side to move from a FEN ('w' | 'b').
function turnOf(fen: string): string {
  return fen.split(' ')[1] ?? 'w';
}

// The seat→colour convention: slot 0 = white, slot 1 = black.
function colorOfSlot(slot: number): string {
  return slot === 0 ? 'w' : 'b';
}

// Create the starting position when a chess room activates.
export function startChessGame(ctx: any, roomId: bigint): void {
  const fen = START_FEN;
  const st = status(fen);
  ctx.db.chessGame.insert({
    roomId,
    fen,
    turn: turnOf(fen),
    status: st.state,
    winner: st.winner,
    legalMoves: legalMoves(fen).join(','),
    lastMove: '',
    check: st.check,
  });
}

// Tear down chess state for a room. Idempotent.
export function endChessGame(ctx: any, roomId: bigint): void {
  if (ctx.db.chessGame.roomId.find(roomId)) ctx.db.chessGame.roomId.delete(roomId);
}

function finishRoom(ctx: any, roomId: bigint): void {
  const room = ctx.db.gameRoom.id.find(roomId);
  if (room) ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
}

// Submit a move (UCI). Validated against the server's own legal-move set; only
// the player whose turn it is may move.
export const chessMove = spacetimedb.reducer({ uci: t.string() }, (ctx, { uci }) => {
  const mine = [...ctx.db.roomMember.identity.filter(ctx.sender)];
  if (mine.length === 0) return;
  const roomId = mine[0].roomId;
  const game = ctx.db.chessGame.roomId.find(roomId);
  if (!game || game.status !== 'active') return;

  // turn ownership
  if (game.turn !== colorOfSlot(mine[0].slot)) return;

  // legality: the move must be in the server-computed set
  const legal = game.legalMoves ? game.legalMoves.split(',') : [];
  if (!legal.includes(uci)) return;

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
  });
  if (st.state !== 'active') finishRoom(ctx, roomId);
});

// Resign — the opponent wins.
export const chessResign = spacetimedb.reducer((ctx) => {
  const mine = [...ctx.db.roomMember.identity.filter(ctx.sender)];
  if (mine.length === 0) return;
  const roomId = mine[0].roomId;
  const game = ctx.db.chessGame.roomId.find(roomId);
  if (!game || game.status !== 'active') return;
  const winner = mine[0].slot === 0 ? 1 : 0; // other side wins
  ctx.db.chessGame.roomId.update({ ...game, status: 'resigned', winner, legalMoves: '' });
  finishRoom(ctx, roomId);
});
