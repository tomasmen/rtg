import { describe, it, expect } from 'vitest';
import { substep, anyMoving, type Ball } from './physics';
import { BALL_R, POCKETS, MIN_SPEED } from './constants';

const ball = (num: number, x: number, y: number, vx = 0, vy = 0): Ball => ({ num, x, y, vx, vy, pocketed: false });

function settle(balls: Ball[], maxSteps = 2000): void {
  let n = 0;
  while (anyMoving(balls) && n++ < maxSteps) substep(balls, 1 / 180);
}

describe('friction', () => {
  it('a rolling ball slows to a stop', () => {
    const b = [ball(0, 50, 50, 200, 0)];
    settle(b);
    expect(b[0].vx).toBe(0);
    expect(b[0].vy).toBe(0);
    expect(b[0].x).toBeGreaterThan(50); // it did travel
  });
});

describe('ball-ball collision (no spin, equal mass)', () => {
  it('a moving ball transfers most of its speed to a resting ball', () => {
    const balls = [ball(0, 50, 50, 120, 0), ball(1, 50 + 2 * BALL_R + 0.01, 50, 0, 0)];
    // step just until they interact
    for (let i = 0; i < 6; i++) substep(balls, 1 / 180);
    expect(balls[1].vx).toBeGreaterThan(0);          // struck ball moves forward
    expect(balls[1].vx).toBeGreaterThan(balls[0].vx); // it took most of the speed
  });
});

describe('pockets', () => {
  it('a ball rolled into a corner pocket is potted', () => {
    const [px, py] = POCKETS[0]; // (0,0)
    const b = [ball(3, px + 20, py + 20, -300, -300)];
    settle(b);
    expect(b[0].pocketed).toBe(true);
  });
});

describe('cushions', () => {
  it('a ball bounces back off a rail', () => {
    const b = [ball(0, 30, 50, -200, 0)]; // toward the left rail, away from pockets (y=50)
    let bounced = false;
    for (let i = 0; i < 200 && !bounced; i++) {
      substep(b, 1 / 180);
      if (b[0].vx > 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(b[0].pocketed).toBe(false);
  });
});

describe('anyMoving', () => {
  it('reports motion only while a ball has velocity', () => {
    const b = [ball(0, 50, 50, MIN_SPEED + 50, 0)];
    expect(anyMoving(b)).toBe(true);
    settle(b);
    expect(anyMoving(b)).toBe(false);
  });
});
