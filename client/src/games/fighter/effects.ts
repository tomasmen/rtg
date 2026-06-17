import { SHAKE_DECAY, SHAKE_PER_DMG, SHAKE_MAX, FLASH_FRAMES, HITSTOP_FRAMES, BLOCK_HITSTOP_FRAMES, SPARK_COUNT, SPARK_LIFE } from './constants';

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  blocked: boolean; // blocked hits render in a distinct (cool) color
}

export interface Effects {
  shake: number;
  hitstop: number;
  flash: [number, number];
  sparks: Spark[];
}

export const newEffects = (): Effects => ({ shake: 0, hitstop: 0, flash: [0, 0], sparks: [] });

// kind: 'hit'|'block'|'ko'|...; victimSlot derived by caller (nearest fighter).
export function pushHit(
  e: Effects,
  x: number,
  y: number,
  amount: number,
  victimSlot: number,
  blocked: boolean,
): void {
  e.shake = Math.min(SHAKE_MAX, e.shake + amount * SHAKE_PER_DMG);
  e.hitstop = Math.max(e.hitstop, blocked ? BLOCK_HITSTOP_FRAMES : HITSTOP_FRAMES);
  if (blocked) {
    e.shake = Math.max(e.shake, 2.5); // a 0-chip block still gets a small cue
  } else if (victimSlot === 0 || victimSlot === 1) {
    e.flash[victimSlot] = FLASH_FRAMES;
  }
  const n = blocked ? Math.floor(SPARK_COUNT / 2) : SPARK_COUNT;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    // blocked hits spray slower and shorter-lived (a deflection, not a clean burst)
    const speed = blocked ? 120 : 180;
    const life = blocked ? Math.floor(SPARK_LIFE * 0.7) : SPARK_LIFE;
    e.sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, blocked });
  }
}

// Advance effects one rendered frame. Returns whether we are in hitstop (caller
// pauses fighter interpolation).
export function tickEffects(e: Effects, dt: number): boolean {
  e.shake *= SHAKE_DECAY;
  e.flash[0] = Math.max(0, e.flash[0] - 1);
  e.flash[1] = Math.max(0, e.flash[1] - 1);
  e.sparks = e.sparks.filter((s) => (s.life -= 1) > 0);
  for (const s of e.sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy -= 600 * dt;
  }
  if (e.hitstop > 0) {
    e.hitstop -= 1;
    return true;
  }
  return false;
}
