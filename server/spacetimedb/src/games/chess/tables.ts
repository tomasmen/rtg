import { table, t } from 'spacetimedb/server';

// One row per active chess room. The server is the sole authority: it stores the
// FEN, the precomputed legal-move set (so the client can highlight without its
// own engine), and the end-state. Move = UCI (e.g. 'e2e4', 'e1g1', 'e7e8q').
export const chessGame = table(
  { name: 'chess_game', public: true },
  {
    roomId: t.u64().primaryKey(),
    fen: t.string(),
    turn: t.string(),        // 'w' | 'b' — side to move
    status: t.string(),      // 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned'
    winner: t.i8(),          // -1 none/draw, 0 white (slot 0), 1 black (slot 1)
    legalMoves: t.string(),  // comma-separated UCI for the side to move ('' when over)
    lastMove: t.string(),    // UCI of the last move ('' initially)
    check: t.bool(),         // side to move is in check
  }
);
