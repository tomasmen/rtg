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

// Per-attack frame data — the single combat tuning table. Tuned snappy: short
// startup + recovery so moves don't linger. (skeleton.ts mirrors these windows.)
export const MOVES: Record<Exclude<AttackKind, 'none'>, MoveDef> = {
  light: { startup: 2, activeTo: 5,  total: 7,  range: 70, dmg: 6,  hitstun: 6,  kb: 160, hitsCrouch: true,  blockstun: 6, chip: 0 },
  heavy: { startup: 5, activeTo: 10, total: 16, range: 95, dmg: 13, hitstun: 13, kb: 340, hitsCrouch: false, blockstun: 9, chip: 2 },
  air:   { startup: 3, activeTo: 12, total: 15, range: 75, dmg: 8,  hitstun: 11, kb: 200, hitsCrouch: false, blockstun: 8, chip: 1 },
  low:   { startup: 4, activeTo: 8,  total: 12, range: 75, dmg: 5,  hitstun: 9,  kb: 120, hitsCrouch: true,  blockstun: 6, chip: 0 },
};

export const DASH_TAP_WINDOW = 9;  // frames between taps to trigger a dash
export const DASH_SPEED = 640;
export const DASH_FRAMES = 6;

// Recovery gap enforced after any attack before the next can start. Combined with
// the shorter light hitstun, this guarantees a victim an escape window (~6 frames)
// instead of being trapped in a point-blank light-attack spam-lock.
export const ATTACK_COOLDOWN = 6;

// ---- Stamina ----
// Jumping, holding block, and getting hit while blocking spend stamina. It
// regenerates after a short idle delay; you cannot jump/block while empty, and
// fully draining it imposes a longer cooldown before regen resumes.
export const MAX_STAMINA = 100;
export const JUMP_COST = 25;           // per jump
export const HEAVY_COST = 20;          // per heavy attack (gated when too low)
export const BLOCK_DRAIN = 0.55;       // per frame while holding block (~16/s)
export const BLOCK_HIT_COST = 18;      // chunk lost when a hit is blocked
export const STAMINA_REGEN = 0.8;      // per frame once regen starts (~24/s)
export const REGEN_DELAY = 45;         // ~1.5s after the last drain before regen
export const EMPTY_REGEN_DELAY = 105;  // ~3.5s if you fully ran out
export const STAMINA_USABLE = 25;      // once fully drained, must regen back to this before acting again

export const ROUND_SECONDS = 40;       // shorter so passive rounds don't drag
export const ROUNDS_TO_WIN = 2;
export const MAX_ROUNDS = 5;            // hard cap so repeated draws can't loop forever
export const INTRO_SECONDS = 2;
export const ROUND_END_SECONDS = 2;
