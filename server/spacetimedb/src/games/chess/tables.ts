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
    // --- clock (only meaningful when `clocked`) ---
    clocked: t.bool(),       // whether this game uses a chess clock
    whiteMs: t.i64(),        // white's remaining time (ms) as of turnStartMicros
    blackMs: t.i64(),        // black's remaining time (ms) as of turnStartMicros
    incMs: t.i64(),          // increment added to the mover's clock after each move
    turnStartMicros: t.u64(),// server time the side-to-move's clock started ticking
  }
);
