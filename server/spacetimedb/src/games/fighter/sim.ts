import {
  ARENA_W, GROUND_Y, FIGHTER_W, FIGHTER_H, CROUCH_H, GRAVITY, MOVE_SPEED,
  AIR_CONTROL, JUMP_V, GROUND_FRICTION,
  DASH_TAP_WINDOW, DASH_SPEED, DASH_FRAMES, ATTACK_COOLDOWN,
  MOVES, type AttackKind,
  DEFAULT_FIGHT_CONFIG, type FightConfig,
} from './constants';

export type FighterPhase =
  | 'idle' | 'walk' | 'crouch' | 'jump' | 'dash'
  | 'attack' | 'block' | 'blockstun' | 'hitstun' | 'ko';

export interface FighterState {
  x: number; y: number; vx: number; vy: number; facing: number; hp: number;
  phase: FighterPhase; phaseFrame: number;
  attackKind: AttackKind;
  attackHasHit: boolean;      // prevents an active window from multi-hitting
  airAttackUsed: boolean;     // one air attack per jump
  stunFrames: number;         // length of the current hitstun/blockstun (frames)
  stamina: number;            // 0..MAX_STAMINA — spent by jump/block/heavy
  staminaCd: number;          // frames until stamina regen may resume
  exhausted: boolean;         // fully drained — no draining actions until regen >= STAMINA_USABLE
  attackCd: number;           // recovery gap before the next attack may start
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

export function initialFighter(slot: number, cfg: FightConfig = DEFAULT_FIGHT_CONFIG): FighterState {
  return {
    x: slot === 0 ? ARENA_W * 0.3 : ARENA_W * 0.7,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing: slot === 0 ? 1 : -1,
    hp: cfg.maxHp,
    phase: 'idle',
    phaseFrame: 0,
    attackKind: 'none',
    attackHasHit: false,
    airAttackUsed: false,
    stunFrames: 0,
    stamina: cfg.stamina.max,
    staminaCd: 0,
    exhausted: false,
    attackCd: 0,
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

// Settle the regen cooldown after spending stamina; if fully drained, flag
// exhaustion (no draining actions until regen climbs back to `usable`).
function spendStaminaSettle(f: FighterState, cfg: FightConfig): void {
  if (f.stamina <= 0) {
    f.stamina = 0;
    f.exhausted = true;
    f.staminaCd = cfg.stamina.emptyRegenDelay;
  } else {
    f.staminaCd = cfg.stamina.regenDelay;
  }
}

// Advance one fighter's locomotion + phase by a fixed timestep. Pure (returns a new state).
function stepFighter(f0: FighterState, input: Inputs, dt: number, cfg: FightConfig): FighterState {
  const f: FighterState = { ...f0 };
  const stam = cfg.stamina;
  const grounded = f.y <= GROUND_Y;

  // --- resolve finished timed phases so control can resume the same frame ---
  if (f.phase === 'attack' && f.phaseFrame >= MOVES[f.attackKind as Exclude<AttackKind, 'none'>].total) {
    f.phase = grounded ? 'idle' : 'jump';
    f.attackKind = 'none';
    f.attackCd = ATTACK_COOLDOWN; // brief recovery before the next attack
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
      // grounded action priority: heavy/sweep -> light/low -> dash -> block -> crouch -> locomotion(+jump)
      if (heavyEdge && f.attackCd === 0 && (!stam.enabled || (!f.exhausted && f.stamina >= stam.heavyCost))) {
        // crouch + heavy = sweep (a low knockdown); standing heavy = the high kick
        startAttack(f, input.crouch ? 'sweep' : 'heavy');
        f.vx = 0;
        if (stam.enabled) {
          f.stamina -= stam.heavyCost;
          spendStaminaSettle(f, cfg);
        }
      } else if (lightEdge && f.attackCd === 0) {
        startAttack(f, input.crouch ? 'low' : 'light');
        f.vx = 0;
      } else if (dashTriggered !== 0) {
        // committed burst in the tap direction; facing stays toward the opponent
        // (set by the match-level auto-face) so a back-dash retreats without
        // spinning around. faceCommitted keeps it from turning mid-dash.
        f.phase = 'dash';
        f.phaseFrame = 0;
        f.vx = dashTriggered * DASH_SPEED;
      } else if (input.block && (!stam.enabled || (f.stamina > 0 && !f.exhausted))) {
        f.phase = 'block';
        f.vx = 0;
      } else if (input.crouch) {
        f.phase = 'crouch';
        f.vx = 0;
      } else {
        f.vx = input.moveX * MOVE_SPEED;
        if (jumpEdge && (!stam.enabled || (!f.exhausted && f.stamina >= stam.jumpCost))) {
          f.vy = JUMP_V;
          f.phase = 'jump';
          f.airAttackUsed = false; // fresh jump → air attack available again
          if (stam.enabled) {
            f.stamina -= stam.jumpCost;
            spendStaminaSettle(f, cfg);
          }
        } else {
          f.phase = input.moveX !== 0 ? 'walk' : 'idle';
        }
      }
    } else {
      // airborne: at most one air attack per jump, else air drift
      if ((lightEdge || heavyEdge) && !f.airAttackUsed) {
        startAttack(f, 'air');
        f.airAttackUsed = true;
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
    f.airAttackUsed = false; // grounded → reset for the next jump
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

  // --- stamina: drain while guarding, else regen after the cooldown ---
  if (!stam.enabled) {
    // System disabled (the "Off" preset): pin the bar full so nothing gates and
    // the (hidden) HUD bar never reads empty.
    f.stamina = stam.max;
    f.exhausted = false;
    f.staminaCd = 0;
  } else if (f.phase === 'block') {
    f.stamina -= stam.blockDrain;
    if (f.stamina <= 0) {
      f.stamina = 0;
      f.exhausted = true;
      f.staminaCd = stam.emptyRegenDelay;
      f.phase = 'idle'; // out of stamina → the guard drops
    } else {
      f.staminaCd = stam.regenDelay;
    }
  } else if (f.staminaCd > 0) {
    // Recovering: futile attempts (gated by `exhausted`/cost) never reach here,
    // so a depleted player's cooldown ticks down uninterrupted.
    f.staminaCd -= 1;
  } else if (f.stamina < stam.max) {
    f.stamina = Math.min(stam.max, f.stamina + stam.regen);
    if (f.exhausted && f.stamina >= stam.usable) f.exhausted = false; // recovered enough to act
  }

  if (f.attackCd > 0) f.attackCd -= 1;

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

// Apply an attacker's active-frame hit to a victim. `atk`/`vic` are PRE-resolution
// snapshots (so a simultaneous mutual trade resolves both blows fairly, regardless
// of order); mutations land on the live objects `atkLive`/`vicLive`, and a SimEvent
// is pushed. Pure-ish.
function resolveHit(
  atkLive: FighterState,
  atk: FighterState,
  vicLive: FighterState,
  vic: FighterState,
  victimSlot: number,
  events: SimEvent[],
  cfg: FightConfig,
): void {
  if (atk.phase !== 'attack' || atk.attackKind === 'none') return;
  if (atk.attackHasHit) return;
  if (vic.phase === 'ko') return;

  const move = MOVES[atk.attackKind];
  if (!(atk.phaseFrame >= move.startup && atk.phaseFrame < move.activeTo)) return;

  // crouch ducks highs
  if (!move.hitsCrouch && vic.phase === 'crouch') return;

  // horizontal reach test from the attacker's front edge
  const front = atk.x + atk.facing * (FIGHTER_W / 2);
  const reach = front + atk.facing * move.range;
  const lo = Math.min(front, reach);
  const hi = Math.max(front, reach);
  const vLo = vic.x - FIGHTER_W / 2;
  const vHi = vic.x + FIGHTER_W / 2;
  if (!(hi >= vLo && lo <= vHi)) return;

  // vertical overlap: attacker's strike must be within the victim's hurtbox span
  const top = hurtTop(vic);
  if (!(atk.y <= vic.y + top && atk.y + FIGHTER_H >= vic.y)) return;

  atkLive.attackHasHit = true;

  const dir = atk.facing; // push victim away from attacker
  const contactX = vic.x - atk.facing * (FIGHTER_W / 2); // victim's near edge
  const contactY = vic.y + top / 2; // mid-torso height

  const blocking = vic.y <= GROUND_Y && (vic.phase === 'block' || vic.phase === 'blockstun');
  if (blocking) {
    vicLive.hp -= move.chip;
    vicLive.phase = 'blockstun';
    vicLive.phaseFrame = 0;
    vicLive.stunFrames = move.blockstun;
    vicLive.vx = dir * (move.kb * 0.25); // small pushback
    if (cfg.stamina.enabled) {
      vicLive.stamina = Math.max(0, vicLive.stamina - cfg.stamina.blockHitCost); // blocking a hit costs a chunk
      if (vicLive.stamina <= 0) { vicLive.exhausted = true; vicLive.staminaCd = cfg.stamina.emptyRegenDelay; }
      else vicLive.staminaCd = cfg.stamina.regenDelay;
    }
    events.push({ kind: 'block', victimSlot, x: contactX, y: contactY, amount: move.chip });
  } else {
    vicLive.hp -= move.dmg;
    vicLive.phase = 'hitstun';
    vicLive.phaseFrame = 0;
    vicLive.stunFrames = move.hitstun;
    vicLive.vx = dir * move.kb;
    vicLive.attackKind = 'none';
    vicLive.attackHasHit = false;
    events.push({ kind: 'hit', victimSlot, x: contactX, y: contactY, amount: move.dmg });
  }
}

// Advance the whole match one fixed timestep. Pure. Returns data + transient hit events.
export function step(
  prev: MatchState,
  inputs: [Inputs, Inputs],
  dt: number,
  cfg: FightConfig = DEFAULT_FIGHT_CONFIG,
): { status: MatchState['status']; tick: number; fighters: [FighterState, FighterState]; events: SimEvent[] } {
  if (prev.status !== 'fighting') {
    return { status: prev.status, tick: prev.tick, fighters: prev.fighters, events: [] };
  }

  const fighters: [FighterState, FighterState] = [
    stepFighter(prev.fighters[0], inputs[0], dt, cfg),
    stepFighter(prev.fighters[1], inputs[1], dt, cfg),
  ];

  // each fighter faces the other (only while actionable — dash/attack commit facing)
  const a = fighters[0];
  const b = fighters[1];
  const faceCommitted = (f: FighterState) => f.phase === 'dash' || f.phase === 'attack';
  if (!faceCommitted(a)) a.facing = a.x <= b.x ? 1 : -1;
  if (!faceCommitted(b)) b.facing = b.x <= a.x ? 1 : -1;

  // Resolve both hits against PRE-resolution snapshots so a simultaneous mutual
  // trade lands both blows instead of letting slot 0 cancel slot 1's strike.
  const events: SimEvent[] = [];
  const snap0 = { ...a };
  const snap1 = { ...b };
  resolveHit(a, snap0, b, snap1, 1, events, cfg);
  resolveHit(b, snap1, a, snap0, 0, events, cfg);

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
