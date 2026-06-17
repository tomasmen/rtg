import { describe, it, expect } from 'vitest';
import { pose } from './skeleton';
import { FIGHTER_H } from './constants';

describe('skeleton pose', () => {
  it('idle head is above the feet and within height', () => {
    const j = pose('idle', 'none', 0, 1, 0);
    expect(j.head.y).toBeGreaterThan(j.pelvis.y);
    expect(j.head.y).toBeLessThanOrEqual(FIGHTER_H + 10);
    expect(j.feet[0].y).toBeCloseTo(0, 1);
  });

  it('crouch lowers the head vs idle', () => {
    expect(pose('crouch', 'none', 0, 1, 0).head.y).toBeLessThan(
      pose('idle', 'none', 0, 1, 0).head.y,
    );
  });

  it('facing mirrors x', () => {
    const r = pose('idle', 'none', 0, 1, 0);
    const l = pose('idle', 'none', 0, -1, 0);
    expect(Math.sign(r.hands[1].x - r.pelvis.x)).toBe(
      -Math.sign(l.hands[1].x - l.pelvis.x),
    );
  });

  it('a light attack extends a hand forward on active frames', () => {
    const idle = pose('idle', 'none', 0, 1, 0);
    const jab = pose('attack', 'light', 4, 1, 0);
    expect(jab.hands[1].x).toBeGreaterThan(idle.hands[1].x);
  });

  it('feet stay on the ground for grounded poses', () => {
    for (const phase of ['idle', 'walk', 'crouch', 'dash', 'block', 'hitstun']) {
      const j = pose(phase, 'none', 3, 1, 0.3);
      expect(j.feet[0].y).toBeLessThanOrEqual(8);
      expect(j.feet[1].y).toBeLessThanOrEqual(8);
    }
  });

  it('all joints stay within a sane bounding box', () => {
    const phases = ['idle', 'walk', 'crouch', 'jump', 'dash', 'attack', 'block', 'hitstun', 'ko'];
    const kinds = ['none', 'light', 'heavy', 'air', 'low'] as const;
    for (const phase of phases) {
      for (const kind of kinds) {
        for (let f = 0; f < 22; f++) {
          for (const facing of [1, -1]) {
            const j = pose(phase, kind, f, facing, f * 0.05);
            const all = [j.head, j.neck, j.pelvis, ...j.hands, ...j.elbows, ...j.knees, ...j.feet];
            for (const p of all) {
              expect(Number.isFinite(p.x)).toBe(true);
              expect(Number.isFinite(p.y)).toBe(true);
              expect(Math.abs(p.x)).toBeLessThan(200);
              expect(p.y).toBeGreaterThanOrEqual(-20);
              expect(p.y).toBeLessThanOrEqual(FIGHTER_H + 40);
            }
            expect(j.headR).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('jump tucks the feet up off the ground', () => {
    const j = pose('jump', 'none', 0, 1, 0);
    expect(j.feet[0].y).toBeGreaterThan(0);
  });

  it('ko slumps the head down near the ground', () => {
    const ko = pose('ko', 'none', 0, 1, 0);
    const idle = pose('idle', 'none', 0, 1, 0);
    expect(ko.head.y).toBeLessThan(idle.head.y);
  });

  it('a heavy attack extends a foot forward on active frames', () => {
    const idle = pose('idle', 'none', 0, 1, 0);
    const kick = pose('attack', 'heavy', 10, 1, 0);
    expect(kick.feet[1].x).toBeGreaterThan(idle.feet[1].x);
  });

  it('a low attack extends a foot forward and stays low', () => {
    const idle = pose('idle', 'none', 0, 1, 0);
    const low = pose('attack', 'low', 7, 1, 0);
    expect(low.feet[1].x).toBeGreaterThan(idle.feet[1].x);
    expect(low.feet[1].y).toBeLessThan(idle.head.y);
  });
});
