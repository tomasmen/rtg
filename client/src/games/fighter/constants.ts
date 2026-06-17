// Mirrors the server arena dimensions (scale 1: arena unit == canvas pixel).
export const ARENA_W = 800;
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
export const CROUCH_H = 78; // crouched silhouette height (head sits near here)
export const MAX_HP = 100;

export const CANVAS_W = 1000;
export const CANVAS_H = 460;
export const GROUND_PX = CANVAS_H - 50;     // canvas y of the ground line
export const SCALE = CANVAS_W / ARENA_W;    // arena units → canvas px (1.25)
export const MAX_STAMINA = 100;

// Best-of-3: how many round-wins fill the pip row under each HP bar.
export const ROUNDS_TO_WIN = 2;

// ---- Rendering / juice constants (Phase 4 stickfight polish) ----
export const COLORS = ['#38bdf8', '#fb7185'] as const; // slot0 cyan, slot1 rose
export const HEADBANDS = ['#0ea5e9', '#e11d48'] as const;
export const STROKE_W = 5;       // limb thickness
export const HEAD_R = 13;
export const PIP_R = 6;          // round-win pip radius
export const SHAKE_DECAY = 0.8;  // per-frame multiplier (settles in ~6 frames)
export const SHAKE_PER_DMG = 0.6;// shake magnitude per damage point
export const SHAKE_MAX = 8;      // px cap — keeps heavies impactful without lurching the 360px arena
export const FLASH_FRAMES = 5;
export const HITSTOP_FRAMES = 4;
export const BLOCK_HITSTOP_FRAMES = 2; // lighter freeze on block so blockstrings don't stutter
export const SPARK_COUNT = 8;
export const SPARK_LIFE = 14;    // frames
