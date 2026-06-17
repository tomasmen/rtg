// Pure, deterministic chess rules engine.
//
// No Date, no Math.random, no IO — operates only on the FEN string so it is
// safe to run inside a SpacetimeDB reducer.
//
// Board representation: a 64-element array indexed 0..63 where index 0 is a8
// and index 63 is h1 (FEN reading order, rank 8 -> rank 1, file a -> file h).
// File = index % 8 (0=a..7=h), rank-from-top = floor(index / 8) (0=rank8..7=rank1).
// Squares hold a single-character piece (uppercase = white, lowercase = black)
// or '' for empty.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type Color = 'w' | 'b';

interface Position {
  board: string[]; // length 64
  turn: Color;
  castling: string; // subset of "KQkq", or '' (we keep the literal string, '-' normalized to '')
  ep: number; // en-passant target square index, or -1
  halfmove: number;
  fullmove: number;
}

// ---------------------------------------------------------------------------
// Square <-> index helpers
// ---------------------------------------------------------------------------

// UCI square (e.g. "e4") -> board index.
function squareToIndex(sq: string): number {
  const file = sq.charCodeAt(0) - 97; // 'a' -> 0
  const rank = sq.charCodeAt(1) - 49; // '1' -> 0 ... '8' -> 7
  // index 0 is a8: row 0 is rank 8. rank 8 => rankFromTop 0; rank 1 => 7.
  const rankFromTop = 7 - rank;
  return rankFromTop * 8 + file;
}

// Board index -> UCI square (e.g. "e4").
function indexToSquare(idx: number): string {
  const file = idx % 8;
  const rankFromTop = Math.floor(idx / 8);
  const rank = 7 - rankFromTop;
  return String.fromCharCode(97 + file) + String.fromCharCode(49 + rank);
}

function fileOf(idx: number): number {
  return idx % 8;
}
function rankFromTopOf(idx: number): number {
  return Math.floor(idx / 8);
}

function isWhitePiece(p: string): boolean {
  return p !== '' && p === p.toUpperCase();
}
function isBlackPiece(p: string): boolean {
  return p !== '' && p === p.toLowerCase();
}
function colorOf(p: string): Color {
  return p === p.toUpperCase() ? 'w' : 'b';
}

// ---------------------------------------------------------------------------
// FEN parsing / serialization
// ---------------------------------------------------------------------------

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const [placement, turn, castling, ep, halfmove, fullmove] = parts;

  const board: string[] = new Array(64).fill('');
  const ranks = placement.split('/');
  let idx = 0;
  for (const rank of ranks) {
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        idx += ch.charCodeAt(0) - 48;
      } else {
        board[idx] = ch;
        idx++;
      }
    }
  }

  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: castling === '-' ? '' : castling,
    ep: ep && ep !== '-' ? squareToIndex(ep) : -1,
    halfmove: halfmove ? parseInt(halfmove, 10) : 0,
    fullmove: fullmove ? parseInt(fullmove, 10) : 1,
  };
}

export function toFen(pos: Position): string {
  let placement = '';
  for (let row = 0; row < 8; row++) {
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = pos.board[row * 8 + file];
      if (p === '') {
        empty++;
      } else {
        if (empty > 0) {
          placement += empty;
          empty = 0;
        }
        placement += p;
      }
    }
    if (empty > 0) placement += empty;
    if (row < 7) placement += '/';
  }

  const castling = pos.castling === '' ? '-' : pos.castling;
  const ep = pos.ep === -1 ? '-' : indexToSquare(pos.ep);
  return `${placement} ${pos.turn} ${castling} ${ep} ${pos.halfmove} ${pos.fullmove}`;
}

// ---------------------------------------------------------------------------
// Attack detection
// ---------------------------------------------------------------------------

// Offsets expressed as [fileDelta, rankFromTopDelta] so we can bounds-check.
const KNIGHT_DELTAS: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_DELTAS: [number, number][] = [
  [0, 1], [1, 1], [1, 0], [1, -1],
  [0, -1], [-1, -1], [-1, 0], [-1, 1],
];
const BISHOP_DELTAS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DELTAS: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function onBoard(file: number, rankFromTop: number): boolean {
  return file >= 0 && file < 8 && rankFromTop >= 0 && rankFromTop < 8;
}

// Is `target` attacked by any piece of color `by`?
function isSquareAttacked(board: string[], target: number, by: Color): boolean {
  const tf = fileOf(target);
  const tr = rankFromTopOf(target);

  // Pawn attacks. A white pawn (moving toward rank 8 = decreasing rankFromTop)
  // attacks the two diagonally-forward squares; so a square is attacked by a
  // white pawn that sits one rank below it (rankFromTop+1).
  if (by === 'w') {
    for (const df of [-1, 1]) {
      const f = tf + df;
      const r = tr + 1; // white pawn is below the target
      if (onBoard(f, r) && board[r * 8 + f] === 'P') return true;
    }
  } else {
    for (const df of [-1, 1]) {
      const f = tf + df;
      const r = tr - 1; // black pawn is above the target
      if (onBoard(f, r) && board[r * 8 + f] === 'p') return true;
    }
  }

  // Knight attacks.
  const knightChar = by === 'w' ? 'N' : 'n';
  for (const [df, dr] of KNIGHT_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (onBoard(f, r) && board[r * 8 + f] === knightChar) return true;
  }

  // King attacks.
  const kingChar = by === 'w' ? 'K' : 'k';
  for (const [df, dr] of KING_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (onBoard(f, r) && board[r * 8 + f] === kingChar) return true;
  }

  // Sliding attacks: bishops/queens on diagonals.
  const bishopChar = by === 'w' ? 'B' : 'b';
  const rookChar = by === 'w' ? 'R' : 'r';
  const queenChar = by === 'w' ? 'Q' : 'q';

  for (const [df, dr] of BISHOP_DELTAS) {
    let f = tf + df;
    let r = tr + dr;
    while (onBoard(f, r)) {
      const p = board[r * 8 + f];
      if (p !== '') {
        if (p === bishopChar || p === queenChar) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }

  for (const [df, dr] of ROOK_DELTAS) {
    let f = tf + df;
    let r = tr + dr;
    while (onBoard(f, r)) {
      const p = board[r * 8 + f];
      if (p !== '') {
        if (p === rookChar || p === queenChar) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }

  return false;
}

function findKing(board: string[], color: Color): number {
  const kingChar = color === 'w' ? 'K' : 'k';
  for (let i = 0; i < 64; i++) {
    if (board[i] === kingChar) return i;
  }
  return -1;
}

function inCheck(board: string[], color: Color): boolean {
  const king = findKing(board, color);
  if (king === -1) return false;
  return isSquareAttacked(board, king, color === 'w' ? 'b' : 'w');
}

// ---------------------------------------------------------------------------
// Pseudo-legal move generation
// ---------------------------------------------------------------------------

interface Move {
  from: number;
  to: number;
  promo?: string; // lowercase piece char for the promotion (q/r/b/n)
}

const PROMO_PIECES = ['q', 'r', 'b', 'n'];

function ownPiece(p: string, color: Color): boolean {
  return p !== '' && colorOf(p) === color;
}

function generatePseudoLegal(pos: Position): Move[] {
  const moves: Move[] = [];
  const { board, turn } = pos;

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p === '' || colorOf(p) !== turn) continue;
    const type = p.toLowerCase();
    const f = fileOf(i);
    const r = rankFromTopOf(i);

    switch (type) {
      case 'p':
        genPawn(pos, i, f, r, moves);
        break;
      case 'n':
        genStepper(board, turn, i, f, r, KNIGHT_DELTAS, moves);
        break;
      case 'b':
        genSlider(board, turn, i, f, r, BISHOP_DELTAS, moves);
        break;
      case 'r':
        genSlider(board, turn, i, f, r, ROOK_DELTAS, moves);
        break;
      case 'q':
        genSlider(board, turn, i, f, r, [...BISHOP_DELTAS, ...ROOK_DELTAS], moves);
        break;
      case 'k':
        genStepper(board, turn, i, f, r, KING_DELTAS, moves);
        genCastling(pos, i, moves);
        break;
    }
  }

  return moves;
}

function genStepper(
  board: string[],
  turn: Color,
  from: number,
  f: number,
  r: number,
  deltas: [number, number][],
  moves: Move[]
): void {
  for (const [df, dr] of deltas) {
    const nf = f + df;
    const nr = r + dr;
    if (!onBoard(nf, nr)) continue;
    const to = nr * 8 + nf;
    const target = board[to];
    if (target === '' || colorOf(target) !== turn) {
      moves.push({ from, to });
    }
  }
}

function genSlider(
  board: string[],
  turn: Color,
  from: number,
  f: number,
  r: number,
  deltas: [number, number][],
  moves: Move[]
): void {
  for (const [df, dr] of deltas) {
    let nf = f + df;
    let nr = r + dr;
    while (onBoard(nf, nr)) {
      const to = nr * 8 + nf;
      const target = board[to];
      if (target === '') {
        moves.push({ from, to });
      } else {
        if (colorOf(target) !== turn) moves.push({ from, to });
        break;
      }
      nf += df;
      nr += dr;
    }
  }
}

function genPawn(pos: Position, from: number, f: number, r: number, moves: Move[]): void {
  const { board, turn } = pos;
  // White pawns move toward rank 8 (decreasing rankFromTop); black toward rank 1.
  const dir = turn === 'w' ? -1 : 1;
  const startRankFromTop = turn === 'w' ? 6 : 1; // rank 2 (white) / rank 7 (black)
  const promoRankFromTop = turn === 'w' ? 0 : 7; // rank 8 (white) / rank 1 (black)

  // Single push.
  const oneR = r + dir;
  if (onBoard(f, oneR)) {
    const oneTo = oneR * 8 + f;
    if (board[oneTo] === '') {
      addPawnMove(from, oneTo, oneR === promoRankFromTop, moves);
      // Double push.
      if (r === startRankFromTop) {
        const twoR = r + 2 * dir;
        const twoTo = twoR * 8 + f;
        if (board[twoTo] === '') {
          moves.push({ from, to: twoTo });
        }
      }
    }
  }

  // Captures (including en passant).
  for (const df of [-1, 1]) {
    const nf = f + df;
    const nr = r + dir;
    if (!onBoard(nf, nr)) continue;
    const to = nr * 8 + nf;
    const target = board[to];
    if (target !== '' && colorOf(target) !== turn) {
      addPawnMove(from, to, nr === promoRankFromTop, moves);
    } else if (to === pos.ep && pos.ep !== -1) {
      moves.push({ from, to });
    }
  }
}

function addPawnMove(from: number, to: number, isPromo: boolean, moves: Move[]): void {
  if (isPromo) {
    for (const promo of PROMO_PIECES) moves.push({ from, to, promo });
  } else {
    moves.push({ from, to });
  }
}

function genCastling(pos: Position, kingIdx: number, moves: Move[]): void {
  const { board, turn, castling } = pos;
  const enemy: Color = turn === 'w' ? 'b' : 'w';

  // King must not currently be in check to castle.
  if (isSquareAttacked(board, kingIdx, enemy)) return;

  if (turn === 'w') {
    // White king starts on e1 (index 60). Kingside rook h1 (63), queenside a1 (56).
    if (kingIdx !== 60) return;
    if (castling.includes('K')) {
      // f1 (61), g1 (62) empty; e1,f1,g1 not attacked; rook on h1.
      if (
        board[61] === '' &&
        board[62] === '' &&
        board[63] === 'R' &&
        !isSquareAttacked(board, 61, enemy) &&
        !isSquareAttacked(board, 62, enemy)
      ) {
        moves.push({ from: 60, to: 62 });
      }
    }
    if (castling.includes('Q')) {
      // d1 (59), c1 (58), b1 (57) empty; e1,d1,c1 not attacked; rook on a1.
      if (
        board[59] === '' &&
        board[58] === '' &&
        board[57] === '' &&
        board[56] === 'R' &&
        !isSquareAttacked(board, 59, enemy) &&
        !isSquareAttacked(board, 58, enemy)
      ) {
        moves.push({ from: 60, to: 58 });
      }
    }
  } else {
    // Black king starts on e8 (index 4). Kingside rook h8 (7), queenside a8 (0).
    if (kingIdx !== 4) return;
    if (castling.includes('k')) {
      if (
        board[5] === '' &&
        board[6] === '' &&
        board[7] === 'r' &&
        !isSquareAttacked(board, 5, enemy) &&
        !isSquareAttacked(board, 6, enemy)
      ) {
        moves.push({ from: 4, to: 6 });
      }
    }
    if (castling.includes('q')) {
      if (
        board[3] === '' &&
        board[2] === '' &&
        board[1] === '' &&
        board[0] === 'r' &&
        !isSquareAttacked(board, 3, enemy) &&
        !isSquareAttacked(board, 2, enemy)
      ) {
        moves.push({ from: 4, to: 2 });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Make-move on an internal Position (used for legality filtering and applyMove)
// ---------------------------------------------------------------------------

function makeMove(pos: Position, move: Move): Position {
  const board = pos.board.slice();
  const turn = pos.turn;
  const enemy: Color = turn === 'w' ? 'b' : 'w';
  const piece = board[move.from];
  const type = piece.toLowerCase();

  const captured = board[move.to];
  let ep = -1;
  let halfmove = pos.halfmove + 1;

  // En passant capture: pawn moves diagonally onto the ep target square,
  // capturing the enemy pawn that sits beside the destination.
  if (type === 'p' && move.to === pos.ep && pos.ep !== -1) {
    const capRankFromTop = rankFromTopOf(move.to) + (turn === 'w' ? 1 : -1);
    const capIdx = capRankFromTop * 8 + fileOf(move.to);
    board[capIdx] = '';
  }

  // Move the piece.
  board[move.to] = piece;
  board[move.from] = '';

  // Promotion.
  if (move.promo) {
    board[move.to] = turn === 'w' ? move.promo.toUpperCase() : move.promo;
  }

  // Castling: move the rook too.
  if (type === 'k') {
    if (turn === 'w' && move.from === 60) {
      if (move.to === 62) {
        board[61] = 'R';
        board[63] = '';
      } else if (move.to === 58) {
        board[59] = 'R';
        board[56] = '';
      }
    } else if (turn === 'b' && move.from === 4) {
      if (move.to === 6) {
        board[5] = 'r';
        board[7] = '';
      } else if (move.to === 2) {
        board[3] = 'r';
        board[0] = '';
      }
    }
  }

  // Set en-passant target on a double pawn push.
  if (type === 'p') {
    const fromR = rankFromTopOf(move.from);
    const toR = rankFromTopOf(move.to);
    if (Math.abs(toR - fromR) === 2) {
      ep = ((fromR + toR) / 2) * 8 + fileOf(move.from);
    }
  }

  // Halfmove clock resets on pawn move or capture.
  if (type === 'p' || captured !== '') {
    halfmove = 0;
  }

  // Update castling rights.
  let castling = pos.castling;
  if (type === 'k') {
    if (turn === 'w') castling = castling.replace('K', '').replace('Q', '');
    else castling = castling.replace('k', '').replace('q', '');
  }
  // Rook moved from its home square.
  if (move.from === 56) castling = castling.replace('Q', '');
  if (move.from === 63) castling = castling.replace('K', '');
  if (move.from === 0) castling = castling.replace('q', '');
  if (move.from === 7) castling = castling.replace('k', '');
  // Rook captured on its home square.
  if (move.to === 56) castling = castling.replace('Q', '');
  if (move.to === 63) castling = castling.replace('K', '');
  if (move.to === 0) castling = castling.replace('q', '');
  if (move.to === 7) castling = castling.replace('k', '');

  const fullmove = turn === 'b' ? pos.fullmove + 1 : pos.fullmove;

  return { board, turn: enemy, castling, ep, halfmove, fullmove };
}

// ---------------------------------------------------------------------------
// Legal move generation
// ---------------------------------------------------------------------------

function legalMoveList(pos: Position): Move[] {
  const pseudo = generatePseudoLegal(pos);
  const legal: Move[] = [];
  const turn = pos.turn;
  for (const move of pseudo) {
    const next = makeMove(pos, move);
    // After the move it's the enemy's turn; the mover must not be in check.
    if (!inCheck(next.board, turn)) legal.push(move);
  }
  return legal;
}

function moveToUci(move: Move): string {
  return indexToSquare(move.from) + indexToSquare(move.to) + (move.promo ?? '');
}

function uciToMove(uci: string): Move {
  const from = squareToIndex(uci.slice(0, 2));
  const to = squareToIndex(uci.slice(2, 4));
  const promo = uci.length > 4 ? uci[4] : undefined;
  return { from, to, promo };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function legalMoves(fen: string): string[] {
  const pos = parseFen(fen);
  return legalMoveList(pos).map(moveToUci);
}

export function applyMove(fen: string, uci: string): string {
  const pos = parseFen(fen);
  const move = uciToMove(uci);
  return toFen(makeMove(pos, move));
}

function hasInsufficientMaterial(board: string[]): boolean {
  // Collect non-king pieces.
  const pieces: string[] = [];
  for (const p of board) {
    if (p === '') continue;
    const type = p.toLowerCase();
    if (type !== 'k') pieces.push(type);
  }
  // K vs K.
  if (pieces.length === 0) return true;
  // K + single minor (bishop or knight) vs K.
  if (pieces.length === 1 && (pieces[0] === 'b' || pieces[0] === 'n')) return true;
  return false;
}

export function status(
  fen: string
): { state: 'active' | 'checkmate' | 'stalemate' | 'draw'; winner: number; check: boolean } {
  const pos = parseFen(fen);
  const check = inCheck(pos.board, pos.turn);
  const legal = legalMoveList(pos);

  if (legal.length === 0) {
    if (check) {
      // Side to move is mated; the side that just moved (opposite) wins.
      const winner = pos.turn === 'w' ? 1 : 0; // white to move & mated => black (1) wins
      return { state: 'checkmate', winner, check: true };
    }
    return { state: 'stalemate', winner: -1, check: false };
  }

  if (pos.halfmove >= 100 || hasInsufficientMaterial(pos.board)) {
    return { state: 'draw', winner: -1, check };
  }

  return { state: 'active', winner: -1, check };
}
