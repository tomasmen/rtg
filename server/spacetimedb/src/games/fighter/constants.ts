// Arena is in abstract units; the client scales to canvas pixels.
export const ARENA_W = 800;
export const GROUND_Y = 0; // feet height above ground (y is up)
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
export const DT = 1 / 30; // fixed simulation timestep (seconds)

export const GRAVITY = -2000; // units/s^2
export const MOVE_SPEED = 320; // units/s
export const JUMP_V = 760; // units/s
export const MAX_HP = 100;

export const ATTACK_TOTAL_FRAMES = 12;
export const ATTACK_ACTIVE_FROM = 2; // damage lands on this frame of the attack
export const ATTACK_ACTIVE_TO = 5; // active window [from, to)
export const ATTACK_RANGE = 80; // reach beyond the fighter's front edge
export const ATTACK_DAMAGE = 9;
export const HITSTUN_FRAMES = 12;
export const BLOCK_CHIP = 1; // damage taken while blocking
export const ROUND_SECONDS = 60;
