// Mirrors the server arena dimensions (scale 1: arena unit == canvas pixel).
export const ARENA_W = 800;
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
export const CROUCH_H = 78; // crouched silhouette height (head sits near here)
export const MAX_HP = 100;

export const CANVAS_W = 800;
export const CANVAS_H = 360;
export const GROUND_PX = CANVAS_H - 40; // canvas y of the ground line

// Best-of-3: how many round-wins fill the pip row under each HP bar.
export const ROUNDS_TO_WIN = 2;

// ---- Rendering / juice constants (Phase 4 stickfight polish) ----
export const COLORS = ['#38bdf8', '#fb7185'] as const; // slot0 cyan, slot1 rose
export const HEADBANDS = ['#0ea5e9', '#e11d48'] as const;
export const STROKE_W = 5;       // limb thickness
export const HEAD_R = 13;
export const PIP_R = 6;          // round-win pip radius
export const SHAKE_DECAY = 0.85; // per-frame multiplier
export const SHAKE_PER_DMG = 0.9;// shake magnitude per damage point
export const FLASH_FRAMES = 5;
export const HITSTOP_FRAMES = 4;
export const SPARK_COUNT = 8;
export const SPARK_LIFE = 14;    // frames
