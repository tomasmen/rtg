import {
  ARENA_W, GROUND_Y, FIGHTER_W, GRAVITY, MOVE_SPEED, JUMP_V, MAX_HP,
  ATTACK_TOTAL_FRAMES, ATTACK_ACTIVE_FROM, ATTACK_RANGE, ATTACK_DAMAGE,
  HITSTUN_FRAMES, BLOCK_CHIP,
} from './constants';

export type FighterPhase = 'idle' | 'walk' | 'jump' | 'attack' | 'block' | 'hitstun' | 'ko';

export interface FighterState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  phase: FighterPhase;
  phaseFrame: number;
}

export interface Inputs {
  moveX: number;
  jump: boolean;
  attack: boolean;
  block: boolean;
}

export interface MatchState {
  status: 'fighting' | 'ko' | 'timeout';
  tick: number;
  fighters: [FighterState, FighterState];
}

export function initialFighter(slot: number): FighterState {
  return {
    x: slot === 0 ? ARENA_W * 0.3 : ARENA_W * 0.7,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing: slot === 0 ? 1 : -1,
    hp: MAX_HP,
    phase: 'idle',
    phaseFrame: 0,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Advance one fighter's locomotion + phase by a fixed timestep. Pure.
function stepFighter(f0: FighterState, input: Inputs, dt: number): FighterState {
  const f: FighterState = { ...f0 };
  const grounded = f.y <= GROUND_Y;

  // resolve timed phases first so control can resume the same frame
  if (f.phase === 'attack' && f.phaseFrame >= ATTACK_TOTAL_FRAMES) f.phase = grounded ? 'idle' : 'jump';
  if (f.phase === 'hitstun' && f.phaseFrame >= HITSTUN_FRAMES) f.phase = grounded ? 'idle' : 'jump';

  const locked = f.phase === 'attack' || f.phase === 'hitstun' || f.phase === 'ko';

  if (!locked) {
    if (input.attack && grounded) {
      f.phase = 'attack';
      f.vx = 0;
    } else if (input.block && grounded) {
      f.phase = 'block';
      f.vx = 0;
    } else {
      f.vx = input.moveX * MOVE_SPEED;
      if (input.jump && grounded) {
        f.vy = JUMP_V;
        f.phase = 'jump';
      } else if (grounded) {
        f.phase = input.moveX !== 0 ? 'walk' : 'idle';
      }
    }
  } else {
    f.vx = 0;
  }

  // integrate
  f.x += f.vx * dt;
  f.vy += GRAVITY * dt;
  f.y += f.vy * dt;
  if (f.y <= GROUND_Y) {
    f.y = GROUND_Y;
    f.vy = 0;
    if (f.phase === 'jump') f.phase = 'idle';
  }
  f.x = clamp(f.x, FIGHTER_W / 2, ARENA_W - FIGHTER_W / 2);

  f.phaseFrame = f.phase === f0.phase ? f.phaseFrame + 1 : 0;
  return f;
}

// Apply attacker's active-frame hit to victim (mutates victim). Pure-ish.
function resolveHit(attacker: FighterState, victim: FighterState): void {
  if (attacker.phase !== 'attack' || attacker.phaseFrame !== ATTACK_ACTIVE_FROM) return;
  if (victim.phase === 'ko') return;

  const front = attacker.x + attacker.facing * (FIGHTER_W / 2);
  const reach = front + attacker.facing * ATTACK_RANGE;
  const lo = Math.min(front, reach);
  const hi = Math.max(front, reach);
  const vLo = victim.x - FIGHTER_W / 2;
  const vHi = victim.x + FIGHTER_W / 2;
  const sameHeight = Math.abs(attacker.y - victim.y) < 100;
  if (!(sameHeight && hi >= vLo && lo <= vHi)) return;

  victim.hp -= victim.phase === 'block' ? BLOCK_CHIP : ATTACK_DAMAGE;
  victim.phase = 'hitstun';
  victim.phaseFrame = 0;
}

// Advance the whole match one fixed timestep. Pure.
export function step(prev: MatchState, inputs: [Inputs, Inputs], dt: number): MatchState {
  if (prev.status !== 'fighting') return prev;

  const fighters: [FighterState, FighterState] = [
    stepFighter(prev.fighters[0], inputs[0], dt),
    stepFighter(prev.fighters[1], inputs[1], dt),
  ];

  // each fighter faces the other
  fighters[0].facing = fighters[0].x <= fighters[1].x ? 1 : -1;
  fighters[1].facing = -fighters[0].facing;

  resolveHit(fighters[0], fighters[1]);
  resolveHit(fighters[1], fighters[0]);

  let status: MatchState['status'] = 'fighting';
  for (const f of fighters) {
    if (f.hp <= 0) {
      f.hp = 0;
      f.phase = 'ko';
      f.phaseFrame = 0;
      status = 'ko';
    }
  }

  return { status, tick: prev.tick + 1, fighters };
}
