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

export type AttackKind = 'none' | 'light' | 'heavy' | 'air' | 'low' | 'sweep';

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
  // crouch + heavy: a committed low sweep. Unlike the standing heavy (a high that
  // whiffs over a crouch), the sweep hits low (hitsCrouch) and lands a long-hitstun
  // knockdown with big knockback — slow to start/recover, so it's a read.
  sweep: { startup: 6, activeTo: 11, total: 20, range: 90, dmg: 11, hitstun: 18, kb: 380, hitsCrouch: true,  blockstun: 11, chip: 2 },
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

// ---- Per-room match configuration ----
// A room's `settings` string selects round time, health, a stamina difficulty
// preset, and match length. The sim is parameterized by the resolved config so
// the same pure step() serves every ruleset. Omitting config (quick-match, or an
// unparseable string) yields DEFAULT_FIGHT_CONFIG, which exactly reproduces the
// legacy constants above so existing behaviour and tests are unchanged.

// A bundle of every stamina knob. `enabled: false` disables the whole stamina
// system (jump/heavy/block never gated, no drain, no regen — the bar is hidden
// client-side). Presets let players pick a feel without tuning each number.
export interface StaminaConfig {
  enabled: boolean;
  max: number;
  jumpCost: number;
  heavyCost: number;
  blockDrain: number;       // per frame while guarding
  blockHitCost: number;     // chunk lost when a hit is blocked
  regen: number;            // per frame once regen resumes
  regenDelay: number;       // frames idle before regen resumes
  emptyRegenDelay: number;  // longer delay if you fully ran out
  usable: number;           // must regen back to this after a full drain to act again
}

// `normal` is defined in terms of the legacy constants so the two can't drift.
export const STAMINA_PRESETS: Record<string, StaminaConfig> = {
  off:      { enabled: false, max: MAX_STAMINA, jumpCost: 0,  heavyCost: 0,  blockDrain: 0,    blockHitCost: 0,  regen: 0,    regenDelay: 0,  emptyRegenDelay: 0,   usable: 0 },
  casual:   { enabled: true,  max: 140,         jumpCost: 18, heavyCost: 12, blockDrain: 0.35, blockHitCost: 10, regen: 1.3,  regenDelay: 25, emptyRegenDelay: 60,  usable: 20 },
  normal:   { enabled: true,  max: MAX_STAMINA, jumpCost: JUMP_COST, heavyCost: HEAVY_COST, blockDrain: BLOCK_DRAIN, blockHitCost: BLOCK_HIT_COST, regen: STAMINA_REGEN, regenDelay: REGEN_DELAY, emptyRegenDelay: EMPTY_REGEN_DELAY, usable: STAMINA_USABLE },
  hardcore: { enabled: true,  max: 80,          jumpCost: 32, heavyCost: 28, blockDrain: 0.85, blockHitCost: 26, regen: 0.55, regenDelay: 70, emptyRegenDelay: 150, usable: 35 },
};

export interface FightConfig {
  roundSeconds: number;   // 0 = no time limit (KO only)
  maxHp: number;
  roundsToWin: number;    // 1 = Bo1, 2 = Bo3, 3 = Bo5
  maxRounds: number;      // 2*roundsToWin - 1 (hard cap against endless draws)
  staminaName: string;    // normalized preset key (stored on the row, drives the client bar)
  stamina: StaminaConfig;
}

export const DEFAULT_FIGHT_SETTINGS = 't=60;hp=100;stam=normal;rw=2';

const clampInt = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(v)));

// Resolve a stamina preset by (case-insensitive) name, falling back to normal.
export function staminaByName(name: string): StaminaConfig {
  return STAMINA_PRESETS[(name || '').toLowerCase()] ?? STAMINA_PRESETS.normal;
}

// Parse a fighter room `settings` string ("t=60;hp=100;stam=normal;rw=2") into a
// validated config. Unknown keys are ignored; missing/garbage values fall back to
// the defaults, and every number is clamped to a sane range. Deterministic (safe
// to call inside a reducer).
export function parseFightConfig(settings: string): FightConfig {
  const kv: Record<string, string> = {};
  for (const part of (settings || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    kv[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  const num = (k: string, def: number): number => {
    const raw = kv[k];
    if (raw === undefined || raw === '') return def; // empty value → use default (Number('') is 0)
    const n = Number(raw);
    return Number.isFinite(n) ? n : def;
  };
  const roundSeconds = clampInt(num('t', 60), 0, 600);
  const maxHp = clampInt(num('hp', 100), 10, 1000);
  const roundsToWin = clampInt(num('rw', 2), 1, 5);
  const staminaName = STAMINA_PRESETS[(kv.stam || '').toLowerCase()] ? kv.stam.toLowerCase() : 'normal';
  return {
    roundSeconds,
    maxHp,
    roundsToWin,
    maxRounds: 2 * roundsToWin - 1,
    staminaName,
    stamina: staminaByName(staminaName),
  };
}

export const DEFAULT_FIGHT_CONFIG: FightConfig = parseFightConfig(DEFAULT_FIGHT_SETTINGS);
