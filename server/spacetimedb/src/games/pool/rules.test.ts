import { describe, it, expect } from 'vitest';
import { resolveShot, type ShotInput } from './rules';

const base: ShotInput = {
  shooterGroup: 'open',
  firstContact: 'red',
  potted: { red: 0, yellow: 0, black: false, cue: false },
  remainingBefore: { red: 7, yellow: 7 },
};

describe('group assignment', () => {
  it('open table: legally potting a red assigns you reds and you continue', () => {
    const r = resolveShot({ ...base, firstContact: 'red', potted: { red: 1, yellow: 0, black: false, cue: false } });
    expect(r.assignedGroup).toBe('red');
    expect(r.foul).toBe(false);
    expect(r.continueTurn).toBe(true);
  });
  it('open table: potting a yellow assigns yellows', () => {
    const r = resolveShot({ ...base, firstContact: 'yellow', potted: { red: 0, yellow: 1, black: false, cue: false } });
    expect(r.assignedGroup).toBe('yellow');
    expect(r.continueTurn).toBe(true);
  });
});

describe('fouls', () => {
  it('scratching the cue is a foul with ball-in-hand', () => {
    const r = resolveShot({ ...base, potted: { red: 1, yellow: 0, black: false, cue: true } });
    expect(r.foul).toBe(true);
    expect(r.ballInHand).toBe(true);
    expect(r.continueTurn).toBe(false);
  });
  it('hitting nothing is a foul', () => {
    const r = resolveShot({ ...base, firstContact: 'none' });
    expect(r.foul).toBe(true);
  });
  it('assigned reds but hitting a yellow first is a foul', () => {
    const r = resolveShot({ ...base, shooterGroup: 'red', firstContact: 'yellow' });
    expect(r.foul).toBe(true);
  });
  it('potting the opponent colour is a foul', () => {
    const r = resolveShot({ ...base, shooterGroup: 'red', firstContact: 'red', potted: { red: 0, yellow: 1, black: false, cue: false } });
    expect(r.foul).toBe(true);
  });
});

describe('winning on the black', () => {
  it('potting the black after clearing your colour wins', () => {
    const r = resolveShot({
      shooterGroup: 'red', firstContact: 'black',
      potted: { red: 0, yellow: 0, black: true, cue: false },
      remainingBefore: { red: 0, yellow: 4 },
    });
    expect(r.ended).toBe(true);
    expect(r.winnerIsShooter).toBe(true);
  });
  it('potting the black early loses', () => {
    const r = resolveShot({
      shooterGroup: 'red', firstContact: 'red',
      potted: { red: 1, yellow: 0, black: true, cue: false },
      remainingBefore: { red: 3, yellow: 5 },
    });
    expect(r.ended).toBe(true);
    expect(r.winnerIsShooter).toBe(false);
  });
  it('potting the black while scratching loses even if your colour was cleared', () => {
    const r = resolveShot({
      shooterGroup: 'yellow', firstContact: 'black',
      potted: { red: 0, yellow: 0, black: true, cue: true },
      remainingBefore: { red: 2, yellow: 0 },
    });
    expect(r.ended).toBe(true);
    expect(r.winnerIsShooter).toBe(false);
  });
});

describe('turn passing', () => {
  it('a clean miss passes the turn without ball-in-hand', () => {
    const r = resolveShot({ ...base, shooterGroup: 'red', firstContact: 'red' });
    expect(r.foul).toBe(false);
    expect(r.continueTurn).toBe(false);
    expect(r.ballInHand).toBe(false);
  });
});
