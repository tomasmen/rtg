// Client mirror of the pool table dimensions + canvas mapping. Kept in sync with
// server games/pool/constants.ts.

export const TABLE_W = 200;
export const TABLE_H = 100;
export const BALL_R = 2.6;
export const POCKET_R = 5.9;

export const POCKETS: [number, number][] = [
  [0, 0], [100, 0], [200, 0],
  [0, 100], [100, 100], [200, 100],
];

export const SCALE = 4;
export const RAIL = 30;
export const CANVAS_W = TABLE_W * SCALE + 2 * RAIL; // 860
export const CANVAS_H = TABLE_H * SCALE + 2 * RAIL; // 460

export const wx = (x: number): number => RAIL + x * SCALE;
export const wy = (y: number): number => RAIL + y * SCALE;
// inverse: canvas px → world
export const ux = (px: number): number => (px - RAIL) / SCALE;
export const uy = (py: number): number => (py - RAIL) / SCALE;

export type Group = 'cue' | 'red' | 'yellow' | 'black';
export function ballGroup(num: number): Group {
  if (num === 0) return 'cue';
  if (num === 8) return 'black';
  return num < 8 ? 'red' : 'yellow';
}

export function ballColor(num: number): string {
  const g = ballGroup(num);
  return g === 'cue' ? '#f5f4ee' : g === 'black' ? '#17181d' : g === 'red' ? '#d81f2a' : '#f2b705';
}

// How far you can pull back (world units) for max power.
export const PULL_MAX = 70;
