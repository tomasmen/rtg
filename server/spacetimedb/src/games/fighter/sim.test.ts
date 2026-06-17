import { describe, it, expect } from 'vitest';
import { step, initialFighter, type MatchState, type Inputs } from './sim';
import {
  ARENA_W, MOVE_SPEED, DT, GROUND_Y, MAX_HP, ATTACK_DAMAGE,
} from './constants';

const noInput: Inputs = { moveX: 0, jump: false, attack: false, block: false };
function freshMatch(): MatchState {
  return { status: 'fighting', tick: 0, fighters: [initialFighter(0), initialFighter(1)] };
}

describe('movement', () => {
  it('moves right with moveX=1', () => {
    const m = freshMatch();
    const x0 = m.fighters[0].x;
    const out = step(m, [{ ...noInput, moveX: 1 }, noInput], DT);
    expect(out.fighters[0].x).toBeCloseTo(x0 + MOVE_SPEED * DT, 1);
  });
  it('clamps inside the arena', () => {
    const m = freshMatch();
    m.fighters[0].x = ARENA_W - 1;
    const out = step(m, [{ ...noInput, moveX: 1 }, noInput], DT);
    expect(out.fighters[0].x).toBeLessThanOrEqual(ARENA_W);
  });
});

describe('gravity + ground', () => {
  it('a fighter in the air falls', () => {
    const m = freshMatch();
    m.fighters[0].y = 200;
    m.fighters[0].vy = 0;
    const out = step(m, [noInput, noInput], DT);
    expect(out.fighters[0].y).toBeLessThan(200);
  });
  it('does not sink below the ground', () => {
    const m = freshMatch();
    m.fighters[0].y = 1;
    m.fighters[0].vy = -1000;
    const out = step(m, [noInput, noInput], DT);
    expect(out.fighters[0].y).toBe(GROUND_Y);
    expect(out.fighters[0].vy).toBe(0);
  });
});

describe('facing', () => {
  it('each fighter faces the other', () => {
    const m = freshMatch(); // slot 0 left, slot 1 right
    const out = step(m, [noInput, noInput], DT);
    expect(out.fighters[0].facing).toBe(1);
    expect(out.fighters[1].facing).toBe(-1);
  });
});

describe('attacks', () => {
  it('an attack in range damages the opponent', () => {
    const m = freshMatch();
    m.fighters[0].x = 380;
    m.fighters[1].x = 430;
    let s = step(m, [{ ...noInput, attack: true }, noInput], DT);
    for (let i = 0; i < 5; i++) s = step(s, [noInput, noInput], DT);
    expect(s.fighters[1].hp).toBeLessThan(MAX_HP);
  });
  it('an attack out of range does no damage', () => {
    const m = freshMatch(); // default spacing is far apart
    let s = step(m, [{ ...noInput, attack: true }, noInput], DT);
    for (let i = 0; i < 6; i++) s = step(s, [noInput, noInput], DT);
    expect(s.fighters[1].hp).toBe(MAX_HP);
  });
  it('blocking reduces damage to chip', () => {
    const m = freshMatch();
    m.fighters[0].x = 380;
    m.fighters[1].x = 430;
    let s = step(m, [{ ...noInput, attack: true }, { ...noInput, block: true }], DT);
    for (let i = 0; i < 5; i++) s = step(s, [noInput, { ...noInput, block: true }], DT);
    expect(s.fighters[1].hp).toBeGreaterThan(MAX_HP - ATTACK_DAMAGE);
  });
  it('a hit applies hitstun (victim cannot move)', () => {
    const m = freshMatch();
    m.fighters[0].x = 380;
    m.fighters[1].x = 430;
    let s = step(m, [{ ...noInput, attack: true }, noInput], DT);
    for (let i = 0; i < 5; i++) s = step(s, [noInput, noInput], DT);
    expect(s.fighters[1].phase).toBe('hitstun');
    const xBefore = s.fighters[1].x;
    s = step(s, [noInput, { ...noInput, moveX: 1 }], DT);
    expect(s.fighters[1].x).toBeCloseTo(xBefore, 1);
  });
});

describe('win conditions', () => {
  it('hp <= 0 ends the match as ko', () => {
    const m = freshMatch();
    m.fighters[1].hp = 1;
    m.fighters[0].x = 380;
    m.fighters[1].x = 430;
    let s = step(m, [{ ...noInput, attack: true }, noInput], DT);
    for (let i = 0; i < 6; i++) s = step(s, [noInput, noInput], DT);
    expect(s.status).toBe('ko');
    expect(s.fighters[1].phase).toBe('ko');
  });
});
