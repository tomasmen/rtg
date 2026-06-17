// Pure board helpers for the chess client. No React, no rules engine — these
// only translate between FEN/UCI strings and board coordinates and filter the
// server-supplied legal-move list. All rules legality lives server-side.

// ---- Coordinate convention ---------------------------------------------------
// We use a single canonical index space, independent of board orientation:
//   index 0  = a8  (top-left from white's view)
//   index 7  = h8
//   index 56 = a1
//   index 63 = h1
// i.e. index = (8 - rank) * 8 + (file), where file a=0..h=7, rank 1..8.
// `parseFen` returns a 64-length array in this order so cells[0] is a8.

export type Color = 'w' | 'b';

/** Files a..h. */
const FILES = 'abcdefgh';

/**
 * Parse the board field (first space-delimited token) of a FEN string into a
 * flat 64-cell array. Each cell is a single FEN piece char (e.g. 'P', 'k') or
 * '' for an empty square. Index 0 = a8 ... index 63 = h1.
 */
export function parseFen(fen: string): string[] {
  const board = fen.trim().split(/\s+/)[0] ?? '';
  const cells: string[] = [];
  const ranks = board.split('/');
  for (const rank of ranks) {
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        const n = ch.charCodeAt(0) - 48;
        for (let i = 0; i < n; i++) cells.push('');
      } else {
        cells.push(ch);
      }
    }
  }
  // Defensive: a well-formed FEN yields exactly 64 cells.
  while (cells.length < 64) cells.push('');
  return cells.slice(0, 64);
}

/** Convert an algebraic square ('e4') to a canonical index (0 = a8 ... 63 = h1). */
export function squareToIndex(sq: string): number {
  const file = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]); // 1..8
  if (file < 0 || rank < 1 || rank > 8 || Number.isNaN(rank)) return -1;
  return (8 - rank) * 8 + file;
}

/** Convert a canonical index (0 = a8 ... 63 = h1) to an algebraic square ('e4'). */
export function indexToSquare(index: number): string {
  if (index < 0 || index > 63) return '';
  const file = index % 8;
  const rank = 8 - Math.floor(index / 8);
  return FILES[file] + String(rank);
}

/**
 * Which side does a piece char belong to? Uppercase = white, lowercase = black.
 * Returns null for '' / non-piece input.
 */
export function pieceColor(ch: string): Color | null {
  if (!ch) return null;
  if (ch >= 'A' && ch <= 'Z') return 'w';
  if (ch >= 'a' && ch <= 'z') return 'b';
  return null;
}

/** Split a UCI move into its parts. 'e2e4' -> {from:'e2', to:'e4'}; 'e7e8q' adds promo. */
export function fromTo(uci: string): { from: string; to: string; promo?: string } {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length > 4 ? uci[4] : undefined;
  return promo ? { from, to, promo } : { from, to };
}

/**
 * Given the legal-move list and a from-square, return the unique set of legal
 * target squares. Promotions collapse (e7e8q/e7e8r/... -> single 'e8').
 */
export function destsFrom(legalMoves: string[], fromSq: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const uci of legalMoves) {
    if (uci.slice(0, 2) !== fromSq) continue;
    const to = uci.slice(2, 4);
    if (!seen.has(to)) {
      seen.add(to);
      out.push(to);
    }
  }
  return out;
}

/**
 * Is the move from->to a promotion? True when the legal-move list contains a
 * move with this from/to plus a promotion suffix (e.g. 'e7e8q'). We trust the
 * server's legal list rather than re-deriving pawn-on-7th logic.
 */
export function isPromotion(legalMoves: string[], from: string, to: string): boolean {
  const prefix = from + to;
  return legalMoves.some(uci => uci.length > 4 && uci.slice(0, 4) === prefix);
}

/**
 * Find the canonical index of a given color's king from a parsed cell array.
 * Returns -1 if not found (shouldn't happen in a legal position).
 */
export function findKingIndex(cells: string[], color: Color): number {
  const target = color === 'w' ? 'K' : 'k';
  return cells.indexOf(target);
}
