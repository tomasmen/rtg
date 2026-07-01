import { describe, it, expect } from 'vitest';
import { makeRoll, advance, resolveRoll } from './rules';
import { BOARD, JAIL_IDX, GO_TO_JAIL_IDX } from './board';

const free = (pos: number, d1: number, d2: number, doublesThisTurn = 0) =>
  resolveRoll({ pos, inJail: false, jailTurns: 0, doublesThisTurn, roll: makeRoll(d1, d2) });

describe('board integrity', () => {
  it('has 40 spaces indexed 0..39', () => {
    expect(BOARD.length).toBe(40);
    BOARD.forEach((s, i) => expect(s.idx).toBe(i));
  });
  it('corners are placed correctly', () => {
    expect(BOARD[0].type).toBe('go');
    expect(BOARD[JAIL_IDX].type).toBe('jail');
    expect(BOARD[20].type).toBe('parking');
    expect(BOARD[GO_TO_JAIL_IDX].type).toBe('gotojail');
  });
  it('has 28 ownable spaces (22 properties + 4 railroads + 2 utilities)', () => {
    const props = BOARD.filter(s => s.type === 'property').length;
    const rails = BOARD.filter(s => s.type === 'railroad').length;
    const utils = BOARD.filter(s => s.type === 'utility').length;
    expect(props).toBe(22);
    expect(rails).toBe(4);
    expect(utils).toBe(2);
  });
});

describe('makeRoll', () => {
  it('sums dice and flags doubles', () => {
    expect(makeRoll(3, 4)).toEqual({ d1: 3, d2: 4, total: 7, isDouble: false });
    expect(makeRoll(5, 5)).toEqual({ d1: 5, d2: 5, total: 10, isDouble: true });
  });
});

describe('advance', () => {
  it('moves forward without wrapping', () => {
    expect(advance(0, 7)).toEqual({ pos: 7, passedGo: false });
  });
  it('wraps past GO and flags salary', () => {
    expect(advance(38, 5)).toEqual({ pos: 3, passedGo: true }); // 38+5=43 -> 3
  });
  it('landing exactly on GO counts as passed', () => {
    expect(advance(38, 2)).toEqual({ pos: 0, passedGo: true }); // 38+2=40 -> 0
  });
});

describe('resolveRoll — free movement', () => {
  it('moves by the dice total', () => {
    const r = free(0, 2, 3);
    expect(r.newPos).toBe(5);
    expect(r.wentToJail).toBe(false);
    expect(r.rollAgain).toBe(false);
  });
  it('collects GO salary when wrapping', () => {
    const r = free(39, 3, 1); // 39+4=43 -> 3
    expect(r.newPos).toBe(3);
    expect(r.passedGo).toBe(true);
  });
  it('a double lets the player roll again', () => {
    const r = free(0, 3, 3);
    expect(r.newPos).toBe(6);
    expect(r.rollAgain).toBe(true);
  });
  it('three doubles in a row → jail (no move)', () => {
    const r = free(6, 2, 2, 2); // already rolled 2 doubles this turn
    expect(r.wentToJail).toBe(true);
    expect(r.newPos).toBe(JAIL_IDX);
    expect(r.rollAgain).toBe(false);
  });
  it('landing on Go-To-Jail sends you to jail (no GO salary)', () => {
    const r = free(GO_TO_JAIL_IDX - 4, 1, 3); // land exactly on idx 30
    expect(r.newPos).toBe(JAIL_IDX);
    expect(r.wentToJail).toBe(true);
    expect(r.passedGo).toBe(false);
  });
});

describe('resolveRoll — jail', () => {
  const jail = (jailTurns: number, d1: number, d2: number) =>
    resolveRoll({ pos: JAIL_IDX, inJail: true, jailTurns, doublesThisTurn: 0, roll: makeRoll(d1, d2) });

  it('rolling doubles releases you and moves (no extra roll)', () => {
    const r = jail(0, 4, 4);
    expect(r.leftJail).toBe(true);
    expect(r.newPos).toBe(JAIL_IDX + 8);
    expect(r.rollAgain).toBe(false);
  });
  it('a failed early attempt keeps you jailed and ticks the counter', () => {
    const r = jail(0, 2, 5);
    expect(r.leftJail).toBe(false);
    expect(r.incrementJailTurn).toBe(true);
    expect(r.newPos).toBe(JAIL_IDX);
  });
  it('the third failed attempt forces release + move', () => {
    const r = jail(2, 2, 5); // 2 prior fails → this is the 3rd
    expect(r.leftJail).toBe(true);
    expect(r.incrementJailTurn).toBe(false);
    expect(r.newPos).toBe(JAIL_IDX + 7);
  });
});
