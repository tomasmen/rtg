import { describe, it, expect } from 'vitest';
import { step, initialFighter, type Inputs, type MatchState } from './sim';
import {
  ARENA_W, FIGHTER_W, MOVE_SPEED, DT, GROUND_Y, MAX_HP, MOVES,
} from './constants';

const NEUTRAL: Inputs = { moveX: 0, jump: false, light: false, heavy: false, block: false, crouch: false };

const m = (
  a: ReturnType<typeof initialFighter>,
  b: ReturnType<typeof initialFighter>,
): MatchState => ({ status: 'fighting', tick: 0, fighters: [a, b] });

function freshMatch(): MatchState {
  return m(initialFighter(0), initialFighter(1));
}

describe('movement', () => {
  it('moves right with moveX=1', () => {
    const s = freshMatch();
    const x0 = s.fighters[0].x;
    const out = step(s, [{ ...NEUTRAL, moveX: 1 }, NEUTRAL], DT);
    expect(out.fighters[0].x).toBeCloseTo(x0 + MOVE_SPEED * DT, 1);
  });
  it('clamps inside the arena', () => {
    const s = freshMatch();
    s.fighters[0].x = ARENA_W - 1;
    const out = step(s, [{ ...NEUTRAL, moveX: 1 }, NEUTRAL], DT);
    expect(out.fighters[0].x).toBeLessThanOrEqual(ARENA_W);
  });
});

describe('gravity + ground', () => {
  it('a fighter in the air falls', () => {
    const s = freshMatch();
    s.fighters[0].y = 200;
    s.fighters[0].vy = 0;
    const out = step(s, [NEUTRAL, NEUTRAL], DT);
    expect(out.fighters[0].y).toBeLessThan(200);
  });
  it('does not sink below the ground', () => {
    const s = freshMatch();
    s.fighters[0].y = 1;
    s.fighters[0].vy = -1000;
    const out = step(s, [NEUTRAL, NEUTRAL], DT);
    expect(out.fighters[0].y).toBe(GROUND_Y);
    expect(out.fighters[0].vy).toBe(0);
  });
});

describe('facing', () => {
  it('each fighter faces the other', () => {
    const s = freshMatch();
    const out = step(s, [NEUTRAL, NEUTRAL], DT);
    expect(out.fighters[0].facing).toBe(1);
    expect(out.fighters[1].facing).toBe(-1);
  });
});

describe('A2.1 edge-triggered jump', () => {
  it('jump is edge-triggered: holding jump only launches once', () => {
    let s = freshMatch();
    const hold: Inputs = { ...NEUTRAL, jump: true };
    s = step(s, [hold, NEUTRAL], DT);          // rising edge -> launch
    const vyAfterLaunch = s.fighters[0].vy;
    expect(vyAfterLaunch).toBeGreaterThan(0);
    // land them: keep holding jump; must NOT relaunch while held
    for (let i = 0; i < 90; i++) s = step(s, [hold, NEUTRAL], DT);
    expect(s.fighters[0].y).toBeCloseTo(GROUND_Y, 1);   // back on ground, didn't bounce
    expect(s.fighters[0].vy).toBeCloseTo(0, 1);
  });
  it('releasing then re-pressing jump launches again', () => {
    let s = freshMatch();
    s = step(s, [{ ...NEUTRAL, jump: true }, NEUTRAL], DT);
    for (let i = 0; i < 90; i++) s = step(s, [NEUTRAL, NEUTRAL], DT); // land, jump released
    s = step(s, [{ ...NEUTRAL, jump: true }, NEUTRAL], DT);           // new edge
    expect(s.fighters[0].vy).toBeGreaterThan(0);
  });
});

describe('A2.2 light vs heavy: damage, range, recovery', () => {
  it('light attack deals 6 once and recovers', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 380; b.x = 430;            // within light range
    let s = m(a, b);
    const hpStart = b.hp;
    for (let i = 0; i < MOVES.light.total; i++) s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);
    expect(s.fighters[1].hp).toBe(hpStart - MOVES.light.dmg); // exactly one hit
    // recovered
    s = step(s, [NEUTRAL, NEUTRAL], DT);
    expect(s.fighters[0].phase).not.toBe('attack');
  });
  it('heavy attack deals 13 and out-ranges light', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 360; b.x = 470;            // out of light range, within heavy
    let s = m(a, b);
    for (let i = 0; i < MOVES.heavy.total; i++) s = step(s, [{ ...NEUTRAL, heavy: true }, NEUTRAL], DT);
    expect(s.fighters[1].hp).toBe(MAX_HP - MOVES.heavy.dmg);
  });
  it('light whiffs when fully out of range', () => {
    const s = freshMatch(); // default spacing is far apart (240 vs 560)
    let r = s;
    for (let i = 0; i < MOVES.light.total; i++) r = step(r, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);
    expect(r.fighters[1].hp).toBe(MAX_HP);
  });
  it('holding light only jabs once until released', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 380; b.x = 430;
    let s = m(a, b);
    // hold light across more than two full move cycles
    for (let i = 0; i < MOVES.light.total * 3; i++) s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);
    expect(s.fighters[1].hp).toBe(MAX_HP - MOVES.light.dmg); // only the first edge fired
  });
});

describe('A2.3 knockback + friction', () => {
  it('a hit knocks the victim back and the slide decays', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 380; b.x = 430; let s = m(a, b);
    for (let i = 0; i < MOVES.heavy.startup + 1; i++) s = step(s, [{ ...NEUTRAL, heavy: true }, NEUTRAL], DT);
    const justHitX = s.fighters[1].x;
    expect(s.fighters[1].phase).toBe('hitstun');
    expect(s.fighters[1].vx).toBeGreaterThan(0);     // pushed right (away from attacker on the left)
    for (let i = 0; i < MOVES.heavy.hitstun; i++) s = step(s, [NEUTRAL, NEUTRAL], DT);
    expect(s.fighters[1].x).toBeGreaterThan(justHitX); // moved away
    expect(Math.abs(s.fighters[1].vx)).toBeLessThan(40); // friction decayed it
  });
  it('knockback clamps at the wall', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    b.x = ARENA_W - FIGHTER_W / 2; a.x = b.x - 50; let s = m(a, b);
    for (let i = 0; i < 30; i++) s = step(s, [{ ...NEUTRAL, heavy: true }, NEUTRAL], DT);
    expect(s.fighters[1].x).toBeLessThanOrEqual(ARENA_W - FIGHTER_W / 2 + 0.001);
  });
});

describe('A2.4 block + blockstun + chip', () => {
  it('blocking a heavy: chip only, blockstun, no hitstun', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 360; b.x = 470; let s = m(a, b);
    for (let i = 0; i < MOVES.heavy.startup + 1; i++) {
      s = step(s, [{ ...NEUTRAL, heavy: true }, { ...NEUTRAL, block: true }], DT);
    }
    expect(s.fighters[1].hp).toBe(MAX_HP - MOVES.heavy.chip);
    expect(s.fighters[1].phase).toBe('blockstun');
  });
  it('blocking a light: zero chip, blockstun', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 380; b.x = 430; let s = m(a, b);
    for (let i = 0; i < MOVES.light.startup + 1; i++) {
      s = step(s, [{ ...NEUTRAL, light: true }, { ...NEUTRAL, block: true }], DT);
    }
    expect(s.fighters[1].hp).toBe(MAX_HP - MOVES.light.chip);
    expect(s.fighters[1].phase).toBe('blockstun');
  });
});

describe('A2.5 crouch ducks highs', () => {
  it('crouch ducks under a heavy but eats a low', () => {
    let a = initialFighter(0), b = initialFighter(1); a.x = 360; b.x = 470;
    let s = m(a, b);
    for (let i = 0; i < MOVES.heavy.total; i++) {
      s = step(s, [{ ...NEUTRAL, heavy: true }, { ...NEUTRAL, crouch: true }], DT);
    }
    expect(s.fighters[1].hp).toBe(MAX_HP); // heavy whiffed over the crouch

    a = initialFighter(0); b = initialFighter(1); a.x = 400; b.x = 460; s = m(a, b);
    for (let i = 0; i < MOVES.low.total; i++) {
      s = step(s, [{ ...NEUTRAL, light: true, crouch: true }, { ...NEUTRAL, crouch: true }], DT);
    }
    expect(s.fighters[1].hp).toBe(MAX_HP - MOVES.low.dmg); // low poke connects
  });
});

describe('A2.6 dash', () => {
  it('double-tap dashes; single tap walks', () => {
    // single tap: normal walk speed
    let s = freshMatch();
    s = step(s, [{ ...NEUTRAL, moveX: 1 }, NEUTRAL], DT);
    const walkVx = s.fighters[0].vx;
    // double-tap: release then re-press within window
    s = freshMatch();
    s = step(s, [{ ...NEUTRAL, moveX: 1 }, NEUTRAL], DT);   // tap 1 (edge 0->1)
    s = step(s, [NEUTRAL, NEUTRAL], DT);                    // release
    s = step(s, [{ ...NEUTRAL, moveX: 1 }, NEUTRAL], DT);   // tap 2 within window -> dash
    expect(s.fighters[0].phase).toBe('dash');
    expect(Math.abs(s.fighters[0].vx)).toBeGreaterThan(Math.abs(walkVx));
  });
});

describe('A2.7 air attack', () => {
  it('attacking in the air uses the air kick', () => {
    let s = freshMatch();
    s = step(s, [{ ...NEUTRAL, jump: true }, NEUTRAL], DT);     // launch
    s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);    // air attack
    expect(s.fighters[0].attackKind).toBe('air');
    expect(s.fighters[0].phase).toBe('attack');
  });
});

describe('A2.8 KO', () => {
  it('hp <= 0 ends the match as ko', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 380; b.x = 430; b.hp = 1;
    let s = m(a, b);
    for (let i = 0; i < MOVES.light.total; i++) s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);
    expect(s.status).toBe('ko');
    expect(s.fighters[1].phase).toBe('ko');
  });
});

describe('A2.9 step returns hit events', () => {
  it('step returns a hit event on connect', () => {
    const a = initialFighter(0); const b = initialFighter(1); a.x = 380; b.x = 430;
    let s = m(a, b); let hit;
    for (let i = 0; i < MOVES.light.total; i++) {
      const r = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);
      s = r;
      if (r.events.length) hit = r.events[0];
    }
    expect(hit).toBeTruthy();
    expect(hit!.kind).toBe('hit');
    expect(hit!.victimSlot).toBe(1);
    expect(hit!.amount).toBe(MOVES.light.dmg);
  });
  it('step returns a block event when the hit is blocked', () => {
    const a = initialFighter(0); const b = initialFighter(1); a.x = 360; b.x = 470;
    let s = m(a, b); let ev;
    for (let i = 0; i < MOVES.heavy.total; i++) {
      const r = step(s, [{ ...NEUTRAL, heavy: true }, { ...NEUTRAL, block: true }], DT);
      s = r;
      if (r.events.length) ev = r.events[0];
    }
    expect(ev).toBeTruthy();
    expect(ev!.kind).toBe('block');
    expect(ev!.victimSlot).toBe(1);
    expect(ev!.amount).toBe(MOVES.heavy.chip);
  });
});

describe('review fixes', () => {
  it('a simultaneous light trade damages BOTH fighters (no slot-0 priority)', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 380; b.x = 430; // within light range of each other
    let s = m(a, b);
    const hp0 = a.hp; const hp1 = b.hp;
    for (let i = 0; i < MOVES.light.total; i++) {
      s = step(s, [{ ...NEUTRAL, light: true }, { ...NEUTRAL, light: true }], DT);
    }
    expect(s.fighters[0].hp).toBe(hp0 - MOVES.light.dmg);
    expect(s.fighters[1].hp).toBe(hp1 - MOVES.light.dmg);
  });

  it('only one air attack per jump', () => {
    const a = initialFighter(0); a.y = 600; a.vy = 0; // high in the air
    const b = initialFighter(1);
    let s = m(a, b);
    s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT); // first air attack
    expect(s.fighters[0].attackKind).toBe('air');
    // run it to completion while still airborne
    for (let i = 0; i < MOVES.air.total + 1; i++) s = step(s, [NEUTRAL, NEUTRAL], DT);
    expect(s.fighters[0].y).toBeGreaterThan(GROUND_Y);
    expect(s.fighters[0].phase).not.toBe('attack');
    // a second light press in the same jump must NOT start another air attack
    s = step(s, [{ ...NEUTRAL, light: true }, NEUTRAL], DT);
    expect(s.fighters[0].attackKind).toBe('none');
    expect(s.fighters[0].phase).not.toBe('attack');
  });

  it('back-dash retreats but keeps facing the opponent', () => {
    const a = initialFighter(0); const b = initialFighter(1);
    a.x = 300; b.x = 500; // opponent on the right → a faces +1
    let s = m(a, b);
    s = step(s, [{ ...NEUTRAL, moveX: -1 }, NEUTRAL], DT); // tap 1 (away)
    s = step(s, [NEUTRAL, NEUTRAL], DT);                   // release
    s = step(s, [{ ...NEUTRAL, moveX: -1 }, NEUTRAL], DT); // tap 2 → back-dash
    expect(s.fighters[0].phase).toBe('dash');
    expect(s.fighters[0].vx).toBeLessThan(0);  // retreating left
    expect(s.fighters[0].facing).toBe(1);      // still facing the opponent
  });
});
