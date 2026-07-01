// Pure pool physics — no IO, no RNG, deterministic. The tick calls substep()
// several times per frame (finer dt = better collisions), collecting events the
// rules engine needs (which balls potted, what the cue hit first).

import {
  TABLE_W, TABLE_H, BALL_R, POCKET_R, POCKETS,
  FRICTION_DECEL, MIN_SPEED, REST_CUSHION, REST_BALL,
} from './constants';

export interface Ball {
  num: number;
  x: number; y: number;
  vx: number; vy: number;
  pocketed: boolean;
}

export interface PhysEvent {
  kind: 'pot' | 'contact' | 'cushion';
  num: number;    // the ball this is about (for 'contact', the cue or lower-num ball)
  other: number;  // for 'contact', the other ball; else -1
}

export function anyMoving(balls: Ball[]): boolean {
  return balls.some(b => !b.pocketed && (b.vx !== 0 || b.vy !== 0));
}

function pocketAt(x: number, y: number): boolean {
  for (const [px, py] of POCKETS) {
    if (Math.hypot(x - px, y - py) <= POCKET_R) return true;
  }
  return false;
}

// Advance the whole table by one small timestep. Mutates `balls` in place and
// returns the events that happened this step.
export function substep(balls: Ball[], dt: number): PhysEvent[] {
  const events: PhysEvent[] = [];

  // 1) integrate + friction
  for (const b of balls) {
    if (b.pocketed) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = sp - FRICTION_DECEL * dt;
      if (ns <= MIN_SPEED) {
        b.vx = 0; b.vy = 0;
      } else {
        const f = ns / sp;
        b.vx *= f; b.vy *= f;
      }
    }
  }

  // 2) pockets (before cushions so a ball entering a pocket isn't bounced out)
  for (const b of balls) {
    if (b.pocketed) continue;
    if (pocketAt(b.x, b.y)) {
      b.pocketed = true;
      b.vx = 0; b.vy = 0;
      events.push({ kind: 'pot', num: b.num, other: -1 });
    }
  }

  // 3) ball-ball elastic collisions (equal mass)
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= 2 * BALL_R) continue;
      const nx = dx / d, ny = dy / d;
      // separate overlap
      const overlap = 2 * BALL_R - d;
      a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
      // impulse along the normal
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = (-(1 + REST_BALL) * rel) / 2;
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
        events.push({ kind: 'contact', num: a.num, other: b.num });
      }
    }
  }

  // 4) cushions
  for (const b of balls) {
    if (b.pocketed) continue;
    let hit = false;
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = -b.vx * REST_CUSHION; hit = true; }
    else if (b.x > TABLE_W - BALL_R) { b.x = TABLE_W - BALL_R; b.vx = -b.vx * REST_CUSHION; hit = true; }
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = -b.vy * REST_CUSHION; hit = true; }
    else if (b.y > TABLE_H - BALL_R) { b.y = TABLE_H - BALL_R; b.vy = -b.vy * REST_CUSHION; hit = true; }
    if (hit) events.push({ kind: 'cushion', num: b.num, other: -1 });
  }

  return events;
}
