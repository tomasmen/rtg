import { HEAD_R } from './constants';

// A single 2D point in the fighter's LOCAL frame.
export interface Vec {
  x: number;
  y: number;
}

// A stick-figure skeleton, expressed in a local frame whose origin is the
// midpoint between the two feet, with +y pointing UP and +x pointing in the
// fighter's FACING direction. The renderer translates this to canvas feet and
// flips y. `facing` (±1) mirrors every x so the same canonical pose serves both
// directions.
export interface Joints {
  head: Vec;
  neck: Vec;
  pelvis: Vec;
  hands: [Vec, Vec];   // [back, front] — front = index 1 = the facing side
  elbows: [Vec, Vec];  // [back, front]
  knees: [Vec, Vec];   // [back, front]
  feet: [Vec, Vec];    // [back, front]
  headR: number;
}

// Attack kinds the pose function understands. Mirrors the server `AttackKind`.
export type AttackKind = 'none' | 'light' | 'heavy' | 'air' | 'low' | 'sweep';

// Canonical standing reference heights (facing-right frame; +y up).
const PELVIS_Y = 52;
const NECK_Y = 92;
const HEAD_Y = NECK_Y + HEAD_R; // head circle centre sits above the neck
const SHOULDER_OFFS = 4;        // shoulders just below the neck
const CHEST_Y = 76;             // resting hand height (guard near the chest)
const STANCE = 14;              // half foot-spread in the canonical stance

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// Progress (0..1) across an attack's active reach, ramping up over `startup`
// frames, holding through the active window, then easing back during recovery.
function reach(phaseFrame: number, startup: number, activeTo: number, total: number): number {
  if (phaseFrame < startup) return clamp01(phaseFrame / Math.max(1, startup));
  if (phaseFrame < activeTo) return 1;
  const rec = (phaseFrame - activeTo) / Math.max(1, total - activeTo);
  return clamp01(1 - rec);
}

export function pose(
  phase: string,
  attackKind: AttackKind | string,
  phaseFrame: number,
  facing: number,
  t: number,
): Joints {
  // Build everything in a canonical facing-RIGHT frame (front = +x), then
  // mirror x by `facing` at the very end.
  const f = facing < 0 ? -1 : 1;

  // ---- baseline standing skeleton (idle) ----
  const bob = Math.sin(t * 4) * 1.5; // gentle breathing
  let pelvisY = PELVIS_Y + bob;
  let neckY = NECK_Y + bob;
  let headY = HEAD_Y + bob;
  let pelvisX = 0;
  let neckX = 0;
  let headX = 0;

  // feet
  let footBack: Vec = { x: -STANCE, y: 0 };
  let footFront: Vec = { x: STANCE, y: 0 };
  // knees sit between pelvis and feet
  let kneeBack: Vec = { x: -STANCE * 0.7, y: PELVIS_Y * 0.5 };
  let kneeFront: Vec = { x: STANCE * 0.7, y: PELVIS_Y * 0.5 };

  // hands resting in a raised guard near the chest
  let handBack: Vec = { x: 8, y: CHEST_Y + bob };
  let handFront: Vec = { x: 14, y: CHEST_Y + 4 + bob };
  let elbowBack: Vec = { x: 2, y: CHEST_Y - 12 + bob };
  let elbowFront: Vec = { x: 8, y: CHEST_Y - 10 + bob };

  switch (phase) {
    case 'walk': {
      // alternate the legs and swing the arms with a stride phase
      const s = Math.sin(phaseFrame * 0.5);
      footFront = { x: STANCE + s * 12, y: Math.max(0, s) * 6 };
      footBack = { x: -STANCE - s * 12, y: Math.max(0, -s) * 6 };
      kneeFront = { x: STANCE * 0.7 + s * 8, y: PELVIS_Y * 0.5 + 2 };
      kneeBack = { x: -STANCE * 0.7 - s * 8, y: PELVIS_Y * 0.5 + 2 };
      // slight forward lean
      neckX += 4;
      headX += 5;
      handFront = { x: 16 - s * 4, y: CHEST_Y };
      handBack = { x: 8 + s * 4, y: CHEST_Y };
      break;
    }

    case 'dash': {
      // committed forward lunge: deep lean, trailing back leg
      pelvisX += 6;
      neckX += 14;
      headX += 18;
      pelvisY -= 4;
      neckY -= 4;
      headY -= 4;
      footFront = { x: STANCE + 18, y: 0 };
      footBack = { x: -STANCE - 22, y: 6 };
      kneeFront = { x: STANCE + 12, y: PELVIS_Y * 0.45 };
      kneeBack = { x: -STANCE - 6, y: PELVIS_Y * 0.5 };
      handFront = { x: 24, y: CHEST_Y - 4 };
      handBack = { x: -2, y: CHEST_Y - 2 };
      elbowFront = { x: 16, y: CHEST_Y - 12 };
      elbowBack = { x: 2, y: CHEST_Y - 10 };
      break;
    }

    case 'crouch': {
      // duck: drop the whole skeleton and bend the knees outward
      const drop = 30;
      pelvisY = PELVIS_Y - drop + bob * 0.4;
      neckY = NECK_Y - drop * 1.1 + bob * 0.4;
      headY = HEAD_Y - drop * 1.2 + bob * 0.4;
      neckX += 4;
      headX += 6;
      footFront = { x: STANCE + 8, y: 0 };
      footBack = { x: -STANCE - 8, y: 0 };
      kneeFront = { x: STANCE + 16, y: (PELVIS_Y - drop) * 0.55 };
      kneeBack = { x: -STANCE - 16, y: (PELVIS_Y - drop) * 0.55 };
      handFront = { x: 14, y: CHEST_Y - drop };
      handBack = { x: 6, y: CHEST_Y - drop };
      elbowFront = { x: 10, y: CHEST_Y - drop - 8 };
      elbowBack = { x: 2, y: CHEST_Y - drop - 8 };
      break;
    }

    case 'jump': {
      // airborne tuck: pelvis up, knees pulled in, feet off the ground
      footFront = { x: STANCE - 2, y: 24 };
      footBack = { x: -STANCE + 6, y: 30 };
      kneeFront = { x: STANCE + 6, y: 34 };
      kneeBack = { x: -STANCE + 2, y: 38 };
      handFront = { x: 18, y: CHEST_Y + 8 };
      handBack = { x: -6, y: CHEST_Y + 8 };
      elbowFront = { x: 12, y: CHEST_Y };
      elbowBack = { x: -2, y: CHEST_Y };
      break;
    }

    case 'block': {
      // both forearms raised in front as a guard
      handFront = { x: 22, y: NECK_Y - 6 };
      handBack = { x: 18, y: NECK_Y - 12 };
      elbowFront = { x: 14, y: CHEST_Y - 4 };
      elbowBack = { x: 10, y: CHEST_Y - 8 };
      neckX -= 2;
      headX -= 2;
      break;
    }

    case 'blockstun': {
      // guard held but rocked slightly backward
      handFront = { x: 18, y: NECK_Y - 8 };
      handBack = { x: 14, y: NECK_Y - 14 };
      elbowFront = { x: 10, y: CHEST_Y - 4 };
      elbowBack = { x: 6, y: CHEST_Y - 8 };
      neckX -= 8;
      headX -= 12;
      break;
    }

    case 'hitstun': {
      // reel: head and torso snap backward, arms fling out
      neckX -= 12;
      headX -= 20;
      neckY -= 2;
      headY += 2;
      handFront = { x: 6, y: CHEST_Y + 10 };
      handBack = { x: -16, y: CHEST_Y + 6 };
      elbowFront = { x: 2, y: CHEST_Y - 4 };
      elbowBack = { x: -8, y: CHEST_Y - 6 };
      footFront = { x: STANCE + 6, y: 0 };
      footBack = { x: -STANCE - 4, y: 0 };
      break;
    }

    case 'ko': {
      // collapsed: head near the ground, body folded
      const dropP = 40;
      const dropH = 80;
      pelvisX -= 6;
      pelvisY = PELVIS_Y - dropP * 0.6;
      neckX -= 20;
      neckY = NECK_Y - dropH;
      headX -= 34;
      headY = HEAD_Y - dropH - 6;
      footFront = { x: STANCE + 20, y: 0 };
      footBack = { x: -STANCE - 4, y: 0 };
      kneeFront = { x: STANCE + 22, y: 14 };
      kneeBack = { x: -STANCE - 2, y: 16 };
      handFront = { x: -10, y: 18 };
      handBack = { x: -24, y: 12 };
      elbowFront = { x: -16, y: 30 };
      elbowBack = { x: -28, y: 26 };
      break;
    }

    case 'attack': {
      applyAttack(
        attackKind,
        phaseFrame,
        {
          setHandFront: (v) => (handFront = v),
          setElbowFront: (v) => (elbowFront = v),
          setHandBack: (v) => (handBack = v),
          setElbowBack: (v) => (elbowBack = v),
          setFootFront: (v) => (footFront = v),
          setKneeFront: (v) => (kneeFront = v),
          setFootBack: (v) => (footBack = v),
          leanNeck: (dx) => { neckX += dx; },
          leanHead: (dx) => { headX += dx; },
        },
      );
      break;
    }

    // 'idle' and any unknown phase keep the baseline.
    default:
      break;
  }

  const mirror = (v: Vec): Vec => ({ x: v.x * f, y: v.y });

  return {
    head: mirror({ x: headX, y: headY }),
    neck: mirror({ x: neckX, y: neckY }),
    pelvis: mirror({ x: pelvisX, y: pelvisY }),
    hands: [mirror(handBack), mirror(handFront)],
    elbows: [mirror(elbowBack), mirror(elbowFront)],
    knees: [mirror(kneeBack), mirror(kneeFront)],
    feet: [mirror(footBack), mirror(footFront)],
    headR: HEAD_R,
  };
}

interface AttackSetters {
  setHandFront: (v: Vec) => void;
  setElbowFront: (v: Vec) => void;
  setHandBack: (v: Vec) => void;
  setElbowBack: (v: Vec) => void;
  setFootFront: (v: Vec) => void;
  setKneeFront: (v: Vec) => void;
  setFootBack: (v: Vec) => void;
  leanNeck: (dx: number) => void;
  leanHead: (dx: number) => void;
}

const SHOULDER_Y = NECK_Y - SHOULDER_OFFS;

// Mutates the relevant limb toward the attack's reach. Frame-data windows match
// the server MOVES table so the visual extension tracks the active window.
function applyAttack(
  kind: AttackKind | string,
  phaseFrame: number,
  s: AttackSetters,
): void {
  switch (kind) {
    case 'light': {
      // arm jab from the shoulder, roughly torso-upper height
      const r = reach(phaseFrame, 2, 5, 7);
      const x = 18 + r * 40;
      s.setHandFront({ x, y: SHOULDER_Y - 4 });
      s.setElbowFront({ x: 10 + r * 18, y: SHOULDER_Y - 6 });
      s.leanNeck(r * 3);
      s.leanHead(r * 4);
      break;
    }
    case 'heavy': {
      // committed front kick: the support leg stays braced back while the kicking
      // leg drives forward at mid-torso height with the knee ON the pelvis→foot
      // line (no backward-bent knee), torso leans back for balance, back arm out.
      const r = reach(phaseFrame, 5, 10, 16);
      s.setFootFront({ x: STANCE + r * 56, y: 36 + r * 20 });  // foot → ~(70, 56)
      s.setKneeFront({ x: STANCE + r * 28, y: 46 + r * 6 });   // knee tracks the leg line
      s.setFootBack({ x: -STANCE - 12, y: 0 });                // support leg braced back
      s.setHandBack({ x: -20 - r * 8, y: CHEST_Y + 4 });       // back arm swings out for balance
      s.setHandFront({ x: 8 - r * 4, y: CHEST_Y - 2 });        // front guard tucks in
      s.setElbowFront({ x: 4, y: CHEST_Y - 8 });
      s.leanNeck(-r * 4); // lean torso back away from the kick
      s.leanHead(-r * 6);
      break;
    }
    case 'air': {
      // downward-angled air kick
      const r = reach(phaseFrame, 3, 12, 15);
      const x = STANCE + r * 40;
      s.setFootFront({ x, y: 18 - r * 16 });
      s.setKneeFront({ x: STANCE + r * 20, y: 36 });
      s.setFootBack({ x: -STANCE + 4, y: 30 });
      s.setHandFront({ x: 16, y: CHEST_Y + 6 });
      s.setHandBack({ x: -8, y: CHEST_Y + 6 });
      break;
    }
    case 'low': {
      // low poke: a crouched kick that stays near the floor
      const r = reach(phaseFrame, 4, 8, 12);
      const x = STANCE + r * 46;
      s.setFootFront({ x, y: 10 });
      s.setKneeFront({ x: STANCE + r * 22, y: 18 });
      s.setHandFront({ x: 12, y: PELVIS_Y - 6 });
      s.setHandBack({ x: 4, y: PELVIS_Y - 6 });
      s.setElbowFront({ x: 8, y: PELVIS_Y });
      s.setElbowBack({ x: 2, y: PELVIS_Y });
      s.leanNeck(r * 2);
      s.leanHead(r * 3);
      break;
    }
    case 'sweep': {
      // committed low sweep: the front leg scythes out long and low along the
      // floor while the body drops forward over a planted support leg, back hand
      // braced low for balance. Reads as a big, slow ground kick (a knockdown).
      const r = reach(phaseFrame, 6, 11, 20);
      s.setFootFront({ x: STANCE + r * 70, y: 6 });          // foot skims the floor, long reach
      s.setKneeFront({ x: STANCE + r * 34, y: 14 });
      s.setFootBack({ x: -STANCE - 8, y: 0 });               // planted support leg
      s.setHandBack({ x: -12 + r * 8, y: PELVIS_Y - 22 });   // back arm braces low
      s.setHandFront({ x: 14 + r * 10, y: PELVIS_Y - 4 });
      s.setElbowBack({ x: -6, y: PELVIS_Y - 8 });
      s.setElbowFront({ x: 8, y: PELVIS_Y - 2 });
      s.leanNeck(r * 9);   // crouch the torso forward into the sweep
      s.leanHead(r * 12);
      break;
    }
    default:
      break;
  }
}
