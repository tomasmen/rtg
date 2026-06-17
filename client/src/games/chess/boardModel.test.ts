import { describe, it, expect } from 'vitest';
import {
  parseFen,
  squareToIndex,
  indexToSquare,
  pieceColor,
  fromTo,
  destsFrom,
  isPromotion,
  findKingIndex,
} from './boardModel';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('parseFen', () => {
  it('parses START to the correct 64 pieces', () => {
    const cells = parseFen(START_FEN);
    expect(cells).toHaveLength(64);
    // index 0 = a8 = black rook
    expect(cells[0]).toBe('r');
    // index 4 = e8 = black king
    expect(cells[squareToIndex('e8')]).toBe('k');
    // index 7 = h8 = black rook
    expect(cells[7]).toBe('r');
    // black pawns on rank 7 (indices 8..15)
    for (let i = 8; i < 16; i++) expect(cells[i]).toBe('p');
    // empty middle (ranks 6..3 → indices 16..47)
    for (let i = 16; i < 48; i++) expect(cells[i]).toBe('');
    // white pawns on rank 2 (indices 48..55)
    for (let i = 48; i < 56; i++) expect(cells[i]).toBe('P');
    // white back rank (indices 56..63)
    expect(cells[56]).toBe('R');
    expect(cells[squareToIndex('e1')]).toBe('K');
    expect(cells[squareToIndex('d1')]).toBe('Q');
    expect(cells[63]).toBe('R');
  });

  it('handles a FEN with only the board field', () => {
    expect(parseFen('8/8/8/8/8/8/8/8')).toEqual(new Array(64).fill(''));
  });
});

describe('square <-> index round-trip', () => {
  it('maps the corners correctly', () => {
    expect(squareToIndex('a8')).toBe(0);
    expect(squareToIndex('h8')).toBe(7);
    expect(squareToIndex('a1')).toBe(56);
    expect(squareToIndex('h1')).toBe(63);
    expect(squareToIndex('e4')).toBe(36);
  });

  it('round-trips every square', () => {
    for (let i = 0; i < 64; i++) {
      expect(squareToIndex(indexToSquare(i))).toBe(i);
    }
    for (const sq of ['a1', 'h8', 'e4', 'd5', 'c2', 'f7']) {
      expect(indexToSquare(squareToIndex(sq))).toBe(sq);
    }
  });
});

describe('pieceColor', () => {
  it('classifies white, black and empty', () => {
    expect(pieceColor('K')).toBe('w');
    expect(pieceColor('P')).toBe('w');
    expect(pieceColor('k')).toBe('b');
    expect(pieceColor('q')).toBe('b');
    expect(pieceColor('')).toBeNull();
    expect(pieceColor('1')).toBeNull();
  });
});

describe('fromTo', () => {
  it('splits a plain move', () => {
    expect(fromTo('e2e4')).toEqual({ from: 'e2', to: 'e4' });
  });
  it('splits a promotion move', () => {
    expect(fromTo('e7e8q')).toEqual({ from: 'e7', to: 'e8', promo: 'q' });
  });
});

describe('destsFrom', () => {
  it('filters destinations for a from-square and dedupes promotions', () => {
    const legal = ['e2e3', 'e2e4', 'g1f3', 'g1h3', 'e7e8q', 'e7e8r', 'e7e8b', 'e7e8n'];
    expect(destsFrom(legal, 'e2').sort()).toEqual(['e3', 'e4']);
    expect(destsFrom(legal, 'g1').sort()).toEqual(['f3', 'h3']);
    // four promotion moves collapse to one target square
    expect(destsFrom(legal, 'e7')).toEqual(['e8']);
    expect(destsFrom(legal, 'a1')).toEqual([]);
  });
});

describe('isPromotion', () => {
  it('detects a 7th-rank pawn move offered as e7e8q', () => {
    const legal = ['e7e8q', 'e7e8r', 'e7e8b', 'e7e8n', 'd2d4'];
    expect(isPromotion(legal, 'e7', 'e8')).toBe(true);
    expect(isPromotion(legal, 'd2', 'd4')).toBe(false);
    expect(isPromotion(legal, 'a1', 'a2')).toBe(false);
  });
});

describe('findKingIndex', () => {
  it('finds both kings in the start position', () => {
    const cells = parseFen(START_FEN);
    expect(findKingIndex(cells, 'w')).toBe(squareToIndex('e1'));
    expect(findKingIndex(cells, 'b')).toBe(squareToIndex('e8'));
  });
});
