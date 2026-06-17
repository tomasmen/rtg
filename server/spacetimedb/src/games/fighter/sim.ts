import {
  ARENA_W, GROUND_Y, FIGHTER_W, FIGHTER_H, CROUCH_H, GRAVITY, MOVE_SPEED,
  AIR_CONTROL, JUMP_V, MAX_HP, GROUND_FRICTION,
  DASH_TAP_WINDOW, DASH_SPEED, DASH_FRAMES,
  MOVES, type AttackKind,
} from './constants';

export type FighterPhase =
  | 'idle' | 'walk' | 'crouch' | 'jump' | 'dash'
  | 'attack' | 'block' | 'blockstun' | 'hitstun' | 'ko';

export interface FighterState {
  x: number; y: number; vx: number; vy: number; facing: number; hp: number;
  phase: FighterPhase; phaseFrame: number;
  attackKind: AttackKind;
  attackHasHit: boolean;      // prevents an active window from multi-hitting
  stunFrames: number;         // length of the current hitstun/blockstun (frames)
  // input-edge & dash memory (sim-internal; persisted on the fighter row):
  prevJump: boolean; prevLight: boolean; prevHeavy: boolean;
  prevMoveX: number; dashTapDir: number; dashTapFrames: number;
}

export interface Inputs {
  moveX: number; jump: boolean; light: boolean; heavy: boolean;
  block: boolean; crouch: boolean;
}

export interface SimEvent {
  kind: 'hit' | 'block';
  victimSlot: number;
  x: number;
  y: number;
  amount: number;
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
    attackKind: 'none',
    attackHasHit: false,
    stunFrames: 0,
    prevJump: false,
    prevLight: false,
    prevHeavy: false,
    prevMoveX: 0,
    dashTapDir: 0,
    dashTapFrames: DASH_TAP_WINDOW,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Decay a knockback slide toward 0 by friction without overshooting through 0.
function applyFriction(vx: number, dt: number): number {
  if (vx === 0) return 0;
  const dec = GROUND_FRICTION * dt;
  if (Math.abs(vx) <= dec) return 0;
  return vx - Math.sign(vx) * dec;
}

// Begin an attack on `f`, committing to its frame data.
function startAttack(f: FighterState, kind: AttackKind): void {
  f.phase = 'attack';
  f.attackKind = kind;
  f.attackHasHit = false;
  f.phaseFrame = 0;
}

// Advance one fighter's locomotion + phase by a fixed timestep. Pure (returns a new state).
function stepFighter(f0: FighterState, input: Inputs, dt: number): FighterState {
  const f: FighterState = { ...f0 };
  const grounded = f.y <= GROUND_Y;

  // --- resolve finished timed phases so control can resume the same frame ---
  if (f.phase === 'attack' && f.phaseFrame >= MOVES[f.attackKind as Exclude<AttackKind, 'none'>].total) {
    f.phase = grounded ? 'idle' : 'jump';
    f.attackKind = 'none';
  }
  if ((f.phase === 'hitstun' || f.phase === 'blockstun') && f.phaseFrame >= f.stunFrames) {
    f.phase = grounded ? 'idle' : 'jump';
  }
  if (f.phase === 'dash' && f.phaseFrame >= DASH_FRAMES) {
    f.phase = grounded ? 'idle' : 'jump';
  }

  const locked =
    f.phase === 'attack' || f.phase === 'hitstun' || f.phase === 'blockstun' ||
    f.phase === 'dash' || f.phase === 'ko';

  // --- input edges ---
  const jumpEdge = input.jump && !f.prevJump;
  const lightEdge = input.light && !f.prevLight;
  const heavyEdge = input.heavy && !f.prevHeavy;

  // --- dash double-tap detection (track regardless of lock so timing stays honest) ---
  let dashTriggered = 0; // direction of a freshly-triggered dash, 0 = none
  const moveDir = input.moveX > 0 ? 1 : input.moveX < 0 ? -1 : 0;
  const prevDir = f.prevMoveX > 0 ? 1 : f.prevMoveX < 0 ? -1 : 0;
  if (moveDir !== 0 && prevDir === 0) {
    // rising edge of a directional press
    if (f.dashTapDir === moveDir && f.dashTapFrames < DASH_TAP_WINDOW) {
      dashTriggered = moveDir;
    } else {
      f.dashTapDir = moveDir;
      f.dashTapFrames = 0;
    }
  }
  f.dashTapFrames += 1;

  if (!locked) {
    if (grounded) {
      // grounded action priority: heavy -> light/low -> dash -> block -> crouch -> locomotion(+jump)
      if (heavyEdge) {
        startAttack(f, 'heavy');
        f.vx = 0;
      } else if (lightEdge) {
        startAttack(f, input.crouch ? 'low' : 'light');
        f.vx = 0;
      } else if (dashTriggered !== 0) {
        f.phase = 'dash';
        f.phaseFrame = 0;
        f.facing = dashTriggered;
        f.vx = dashTriggered * DASH_SPEED;
      } else if (input.block) {
        f.phase = 'block';
        f.vx = 0;
      } else if (input.crouch) {
        f.phase = 'crouch';
        f.vx = 0;
      } else {
        f.vx = input.moveX * MOVE_SPEED;
        if (jumpEdge) {
          f.vy = JUMP_V;
          f.phase = 'jump';
        } else {
          f.phase = input.moveX !== 0 ? 'walk' : 'idle';
        }
      }
    } else {
      // airborne: one air attack per jump, else air drift
      if (lightEdge || heavyEdge) {
        startAttack(f, 'air');
      } else {
        f.vx = input.moveX * MOVE_SPEED * AIR_CONTROL;
      }
    }
  } else {
    // locked phases
    if (f.phase === 'hitstun' || f.phase === 'blockstun') {
      f.vx = applyFriction(f.vx, dt);
    } else if (f.phase === 'dash') {
      // keep dash velocity (committed)
    } else if (f.phase === 'attack') {
      if (f.attackKind === 'air') {
        f.vx = input.moveX * MOVE_SPEED * AIR_CONTROL;
      } else {
        f.vx = 0;
      }
    } else {
      f.vx = 0; // ko
    }
  }

  // --- integrate ---
  f.x += f.vx * dt;
  f.vy += GRAVITY * dt;
  f.y += f.vy * dt;
  if (f.y <= GROUND_Y) {
    f.y = GROUND_Y;
    f.vy = 0;
    // landed: a jump or an air attack resolves to idle on touchdown
    if (f.phase === 'jump') f.phase = 'idle';
    if (f.phase === 'attack' && f.attackKind === 'air') {
      f.phase = 'idle';
      f.attackKind = 'none';
    }
  }
  f.x = clamp(f.x, FIGHTER_W / 2, ARENA_W - FIGHTER_W / 2);

  // --- update edge/dash memory ---
  f.prevJump = input.jump;
  f.prevLight = input.light;
  f.prevHeavy = input.heavy;
  f.prevMoveX = input.moveX;

  // --- phase frame counter ---
  // A freshly-entered phase counts as its first elapsed frame (1); continuing
  // phases increment. This makes a phase that lasts N frames free up on the
  // step after N steps (resolution checks `phaseFrame >= total`).
  f.phaseFrame = f.phase === f0.phase ? f.phaseFrame + 1 : 1;
  return f;
}

// Top of a fighter's hurtbox (lowered while crouching so highs whiff over it).
function hurtTop(victim: FighterState): number {
  return victim.phase === 'crouch' ? CROUCH_H : FIGHTER_H;
}

// Apply attacker's active-frame hit to victim (mutates victim, pushes a SimEvent). Pure-ish.
function resolveHit(
  attacker: FighterState,
  victim: FighterState,
  victimSlot: number,
  events: SimEvent[],
): void {
  if (attacker.phase !== 'attack' || attacker.attackKind === 'none') return;
  if (attacker.attackHasHit) return;
  if (victim.phase === 'ko') return;

  const move = MOVES[attacker.attackKind];
  if (!(attacker.phaseFrame >= move.startup && attacker.phaseFrame < move.activeTo)) return;

  // crouch ducks highs
  if (!move.hitsCrouch && victim.phase === 'crouch') return;

  // horizontal reach test from the attacker's front edge
  const front = attacker.x + attacker.facing * (FIGHTER_W / 2);
  const reach = front + attacker.facing * move.range;
  const lo = Math.min(front, reach);
  const hi = Math.max(front, reach);
  const vLo = victim.x - FIGHTER_W / 2;
  const vHi = victim.x + FIGHTER_W / 2;
  if (!(hi >= vLo && lo <= vHi)) return;

  // vertical overlap: attacker's strike must be within the victim's hurtbox span
  const top = hurtTop(victim);
  if (!(attacker.y <= victim.y + top && attacker.y + FIGHTER_H >= victim.y)) return;

  attacker.attackHasHit = true;

  const dir = attacker.facing; // push victim away from attacker
  const contactX = victim.x - attacker.facing * (FIGHTER_W / 2); // victim's near edge
  const contactY = victim.y + top / 2; // mid-torso height

  const blocking = victim.y <= GROUND_Y && (victim.phase === 'block' || victim.phase === 'blockstun');
  if (blocking) {
    victim.hp -= move.chip;
    victim.phase = 'blockstun';
    victim.phaseFrame = 0;
    victim.stunFrames = move.blockstun;
    victim.vx = dir * (move.kb * 0.25); // small pushback
    events.push({ kind: 'block', victimSlot, x: contactX, y: contactY, amount: move.chip });
  } else {
    victim.hp -= move.dmg;
    victim.phase = 'hitstun';
    victim.phaseFrame = 0;
    victim.stunFrames = move.hitstun;
    victim.vx = dir * move.kb;
    victim.attackKind = 'none';
    victim.attackHasHit = false;
    events.push({ kind: 'hit', victimSlot, x: contactX, y: contactY, amount: move.dmg });
  }
}

// Advance the whole match one fixed timestep. Pure. Returns data + transient hit events.
export function step(
  prev: MatchState,
  inputs: [Inputs, Inputs],
  dt: number,
): { status: MatchState['status']; tick: number; fighters: [FighterState, FighterState]; events: SimEvent[] } {
  if (prev.status !== 'fighting') {
    return { status: prev.status, tick: prev.tick, fighters: prev.fighters, events: [] };
  }

  const fighters: [FighterState, FighterState] = [
    stepFighter(prev.fighters[0], inputs[0], dt),
    stepFighter(prev.fighters[1], inputs[1], dt),
  ];

  // each fighter faces the other (only while actionable — dash/attack commit facing)
  const a = fighters[0];
  const b = fighters[1];
  const faceCommitted = (f: FighterState) => f.phase === 'dash' || f.phase === 'attack';
  if (!faceCommitted(a)) a.facing = a.x <= b.x ? 1 : -1;
  if (!faceCommitted(b)) b.facing = b.x <= a.x ? 1 : -1;

  const events: SimEvent[] = [];
  resolveHit(fighters[0], fighters[1], 1, events);
  resolveHit(fighters[1], fighters[0], 0, events);

  let status: MatchState['status'] = 'fighting';
  for (const f of fighters) {
    if (f.hp <= 0) {
      f.hp = 0;
      f.phase = 'ko';
      f.phaseFrame = 0;
      f.attackKind = 'none';
      status = 'ko';
    }
  }

  return { status, tick: prev.tick + 1, fighters, events };
}
