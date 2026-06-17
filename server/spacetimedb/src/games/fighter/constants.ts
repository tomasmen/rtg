// Arena is in abstract units; the client scales to canvas pixels.
export const ARENA_W = 800;
export const GROUND_Y = 0; // feet height above ground (y is up)
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
export const CROUCH_H = 78;      // hurtbox top when crouching (highs whiff above this)
export const DT = 1 / 30;

export const GRAVITY = -2000;
export const MOVE_SPEED = 320;
export const AIR_CONTROL = 0.6;  // fraction of MOVE_SPEED steerable in the air
export const JUMP_V = 760;
export const MAX_HP = 100;
export const GROUND_FRICTION = 1800; // u/s^2 applied to knockback slide

export type AttackKind = 'none' | 'light' | 'heavy' | 'air' | 'low';

export interface MoveDef {
  startup: number;   // first active frame
  activeTo: number;  // active window is [startup, activeTo)
  total: number;     // recovery ends here
  range: number;     // reach beyond the fighter's front edge
  dmg: number;
  hitstun: number;
  kb: number;        // knockback speed (u/s) applied to victim
  hitsCrouch: boolean; // false => whiffs over a croucher (a "high")
  blockstun: number;
  chip: number;      // damage dealt on block
}

// Per-attack frame data — the single combat tuning table.
export const MOVES: Record<Exclude<AttackKind, 'none'>, MoveDef> = {
  light: { startup: 3, activeTo: 6,  total: 9,  range: 70, dmg: 6,  hitstun: 10, kb: 120, hitsCrouch: true,  blockstun: 8,  chip: 0 },
  heavy: { startup: 7, activeTo: 13, total: 22, range: 95, dmg: 13, hitstun: 18, kb: 340, hitsCrouch: false, blockstun: 12, chip: 2 },
  air:   { startup: 3, activeTo: 15, total: 18, range: 75, dmg: 8,  hitstun: 14, kb: 200, hitsCrouch: false, blockstun: 10, chip: 1 },
  low:   { startup: 5, activeTo: 10, total: 16, range: 75, dmg: 5,  hitstun: 12, kb: 120, hitsCrouch: true,  blockstun: 8,  chip: 0 },
};

export const DASH_TAP_WINDOW = 9;  // frames between taps to trigger a dash
export const DASH_SPEED = 620;
export const DASH_FRAMES = 8;

export const ROUND_SECONDS = 60;
export const ROUNDS_TO_WIN = 2;
export const INTRO_SECONDS = 2;
export const ROUND_END_SECONDS = 2;
