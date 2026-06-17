import { describe, it, expect } from 'vitest';
import { START_FEN, legalMoves, applyMove, status } from './rules';

// perft: number of legal-move leaf nodes at the given depth, computed purely
// by recursively applying legalMoves/applyMove. This is the standard
// move-generation correctness test.
function perft(fen: string, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(fen);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const uci of moves) {
    nodes += perft(applyMove(fen, uci), depth - 1);
  }
  return nodes;
}

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POSITION3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const POSITION5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';

describe('perft — startpos', () => {
  it('perft(1) = 20', () => expect(perft(START_FEN, 1)).toBe(20));
  it('perft(2) = 400', () => expect(perft(START_FEN, 2)).toBe(400));
  it('perft(3) = 8902', () => expect(perft(START_FEN, 3)).toBe(8902));
});

describe('perft — Kiwipete', () => {
  it('perft(1) = 48', () => expect(perft(KIWIPETE, 1)).toBe(48));
  it('perft(2) = 2039', () => expect(perft(KIWIPETE, 2)).toBe(2039));
  it('perft(3) = 97862', () => expect(perft(KIWIPETE, 3)).toBe(97862), 30000);
});

describe('perft — Position3', () => {
  it('perft(1) = 14', () => expect(perft(POSITION3, 1)).toBe(14));
  it('perft(2) = 191', () => expect(perft(POSITION3, 2)).toBe(191));
  it('perft(3) = 2812', () => expect(perft(POSITION3, 3)).toBe(2812));
});

describe('perft — Position5', () => {
  it('perft(1) = 44', () => expect(perft(POSITION5, 1)).toBe(44));
  it('perft(2) = 1486', () => expect(perft(POSITION5, 2)).toBe(1486), 30000);
});

describe('startpos basics', () => {
  it('START_FEN is the standard start position', () => {
    expect(START_FEN).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
  it('has 20 legal opening moves', () => {
    expect(legalMoves(START_FEN).length).toBe(20);
  });
  it('start position is active and not in check', () => {
    expect(status(START_FEN)).toEqual({ state: 'active', winner: -1, check: false });
  });
  it('e2e4 produces the expected FEN with ep target', () => {
    expect(applyMove(START_FEN, 'e2e4')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    );
  });
});

describe('checkmate', () => {
  it('back-rank mate: black is checkmated, white (0) wins', () => {
    // Black king on g8 boxed in by its own pawns; white rook delivers mate on e8.
    const fen = '4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1';
    const s = status(fen);
    expect(s.state).toBe('checkmate');
    expect(s.winner).toBe(0); // white delivered the mate
    expect(s.check).toBe(true);
    expect(legalMoves(fen)).toEqual([]);
  });

  it("fool's mate: white is checkmated, black (1) wins", () => {
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const s = status(fen);
    expect(s.state).toBe('checkmate');
    expect(s.winner).toBe(1);
    expect(s.check).toBe(true);
  });
});

describe('stalemate', () => {
  it('classic king+queen stalemate (black to move, not in check, no moves)', () => {
    // Black king a8, white queen c7, white king c6. Black has no legal move.
    const fen = 'k7/2Q5/2K5/8/8/8/8/8 b - - 0 1';
    const s = status(fen);
    expect(s.state).toBe('stalemate');
    expect(s.winner).toBe(-1);
    expect(s.check).toBe(false);
    expect(legalMoves(fen)).toEqual([]);
  });
});

describe('castling', () => {
  it('white can castle both sides when path is clear', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const moves = legalMoves(fen);
    expect(moves).toContain('e1g1'); // kingside
    expect(moves).toContain('e1c1'); // queenside
  });

  it('kingside castle moves king e1->g1 and rook h1->f1', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const out = applyMove(fen, 'e1g1');
    expect(out).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
  });

  it('queenside castle moves king e1->c1 and rook a1->d1', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const out = applyMove(fen, 'e1c1');
    expect(out).toBe('r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1');
  });

  it('cannot castle through an attacked square', () => {
    // Black rook on f8 attacks f1, so white cannot castle kingside.
    const fen = 'r4rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    const moves = legalMoves(fen);
    expect(moves).not.toContain('e1g1');
    expect(moves).toContain('e1c1'); // queenside still fine
  });

  it('cannot castle out of check', () => {
    // Black rook on e8 checks the white king; castling is illegal.
    const fen = '4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    const moves = legalMoves(fen);
    expect(moves).not.toContain('e1g1');
    expect(moves).not.toContain('e1c1');
  });
});

describe('en passant', () => {
  it('captures the pawn that just double-pushed', () => {
    // White pawn e5, black plays d7d5 creating ep target d6; white exd6 e.p.
    const fen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const moves = legalMoves(fen);
    expect(moves).toContain('e5d6');
    const out = applyMove(fen, 'e5d6');
    // The captured black pawn on d5 must be removed; white pawn now on d6.
    expect(out).toBe('rnbqkbnr/ppp1pppp/3P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3');
  });
});

describe('promotion', () => {
  it('emits all four promotion choices', () => {
    const fen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
    const moves = legalMoves(fen);
    expect(moves).toContain('a7a8q');
    expect(moves).toContain('a7a8r');
    expect(moves).toContain('a7a8b');
    expect(moves).toContain('a7a8n');
  });

  it('promoting to queen places a queen', () => {
    const fen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
    const out = applyMove(fen, 'a7a8q');
    expect(out).toBe('Q7/8/8/8/8/8/8/k6K b - - 0 1');
  });

  it('capture-promotion to knight', () => {
    const fen = '1n6/P7/8/8/8/8/8/k6K w - - 0 1';
    const moves = legalMoves(fen);
    expect(moves).toContain('a7b8n'); // capture b8 and underpromote
    const out = applyMove(fen, 'a7b8n');
    expect(out).toBe('1N6/8/8/8/8/8/8/k6K b - - 0 1');
  });
});

describe('legality filter', () => {
  it('excludes king moves into check', () => {
    // White king e1, black rook e8 controls the e-file; king may not stay on e-file.
    const fen = '4r3/8/8/8/8/8/8/4K3 w - - 0 1';
    const moves = legalMoves(fen);
    expect(moves).not.toContain('e1e2'); // still on attacked e-file
    expect(moves).toContain('e1d1');
    expect(moves).toContain('e1f1');
    expect(moves).toContain('e1d2'); // off the e-file, safe
  });

  it('king cannot step along a checking rook file', () => {
    const fen = '4r3/8/8/8/8/8/8/4K3 w - - 0 1';
    const moves = legalMoves(fen).filter((m) => m.startsWith('e1'));
    // Legal king moves: d1, f1, d2, f2 (all off the e-file).
    expect(moves.sort()).toEqual(['e1d1', 'e1d2', 'e1f1', 'e1f2'].sort());
  });

  it('a pinned piece cannot move off the pin line', () => {
    // White king e1, white rook e2 pinned by black rook e8. Rook may move along
    // the e-file only.
    const fen = '4r3/8/8/8/8/8/4R3/4K3 w - - 0 1';
    const moves = legalMoves(fen).filter((m) => m.startsWith('e2'));
    // The pinned rook can only move along the e-file (capturing e8 or stepping).
    for (const m of moves) {
      expect(m.startsWith('e2e')).toBe(true);
    }
    expect(moves).toContain('e2e8'); // capturing the pinner is legal
    expect(moves).not.toContain('e2d2'); // leaving the file exposes the king
    expect(moves).not.toContain('e2f2');
  });

  it('must respond to check (only check-resolving moves are legal)', () => {
    // Black rook e8 checks white king e1; king must move off the file (no blockers/captures available).
    const fen = '4r3/8/8/8/8/8/8/4K3 w - - 0 1';
    const moves = legalMoves(fen);
    expect(moves.every((m) => m.startsWith('e1'))).toBe(true);
    expect(moves).not.toContain('e1e2');
  });
});

describe('insufficient material draw', () => {
  it('K vs K is a draw', () => {
    const s = status('8/8/8/4k3/8/8/4K3/8 w - - 0 1');
    expect(s.state).toBe('draw');
    expect(s.winner).toBe(-1);
  });
  it('K + bishop vs K is a draw', () => {
    const s = status('8/8/8/4k3/8/8/4K3/6B1 w - - 0 1');
    expect(s.state).toBe('draw');
  });
  it('K + two queens is NOT auto-draw (active)', () => {
    const s = status('8/8/8/4k3/8/8/4K3/3QQ3 w - - 0 1');
    expect(s.state).toBe('active');
  });
});

describe('fifty-move draw', () => {
  it('halfmove clock >= 100 is a draw', () => {
    const s = status('4k3/8/8/8/8/8/8/4K2R w - - 100 80');
    expect(s.state).toBe('draw');
    expect(s.winner).toBe(-1);
  });
});
