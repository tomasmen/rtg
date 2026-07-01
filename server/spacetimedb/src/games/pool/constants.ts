// British 8-ball pool: a 2:1 table, 7 red + 7 yellow object balls, 1 black, and
// the white cue. Simple physics (no spin): balls carry linear velocity, slow by
// friction, collide elastically, bounce off cushions, and drop into 6 pockets.
// All units are abstract table units; the client scales to canvas pixels.

export const TABLE_W = 200; // length (long axis)
export const TABLE_H = 100; // width
export const BALL_R = 2.6;
export const POCKET_R = 5.9; // capture radius (a bit larger than the ball)

// 4 corners + 2 in the middle of the long rails.
export const POCKETS: readonly [number, number][] = [
  [0, 0], [TABLE_W / 2, 0], [TABLE_W, 0],
  [0, TABLE_H], [TABLE_W / 2, TABLE_H], [TABLE_W, TABLE_H],
];

export const FRICTION_DECEL = 118; // units/s^2 (cloth drag; shots settle in a few s)
export const MIN_SPEED = 3.2;      // below this a ball is treated as stopped
export const REST_CUSHION = 0.9;   // cushion bounciness
export const REST_BALL = 0.95;     // ball-ball restitution
export const MAX_SHOT_V = 440;     // power 1.0 → this launch speed

export const CUE_START = { x: 50, y: TABLE_H / 2 };  // head-spot break position
export const FOOT_X = 150;                            // rack apex x
export const SPOT_Y = TABLE_H / 2;

export type Group = 'cue' | 'red' | 'yellow' | 'black';

// Ball numbering: 0 = cue, 1..7 = reds, 8 = black, 9..15 = yellows.
export function ballGroup(num: number): Group {
  if (num === 0) return 'cue';
  if (num === 8) return 'black';
  return num < 8 ? 'red' : 'yellow';
}

// Triangle rack order (15 positions, apex first) with the black on the spot
// (center of the middle row). Reds/yellows interleaved for a mixed look.
export const RACK_ORDER: readonly number[] = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];

// World positions for a fresh rack: apex nearest the cue, rows fanning toward +x.
export function rackPositions(): { num: number; x: number; y: number }[] {
  const gap = 0.15;
  const d = 2 * BALL_R + gap;
  const dx = (d * Math.sqrt(3)) / 2;
  const out: { num: number; x: number; y: number }[] = [];
  let idx = 0;
  for (let r = 0; r < 5; r++) {
    for (let j = 0; j <= r; j++) {
      out.push({ num: RACK_ORDER[idx++], x: FOOT_X + r * dx, y: SPOT_Y + (j - r / 2) * d });
    }
  }
  return out;
}
