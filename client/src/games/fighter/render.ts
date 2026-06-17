import {
  FIGHTER_H,
  GROUND_PX,
  CANVAS_W,
  CANVAS_H,
  SCALE,
  MAX_HP,
  MAX_STAMINA,
  COLORS,
  HEADBANDS,
  STROKE_W,
  PIP_R,
  FLASH_FRAMES,
  SPARK_LIFE,
  ROUNDS_TO_WIN,
} from './constants';
import { pose, type Joints, type AttackKind } from './skeleton';
import type { Effects } from './effects';

const HP_W = 360; // HP/stamina bar width (px)

// One fighter's render snapshot. Positions are interpolated SIM coordinates
// (x across the arena, y = height above the ground), scaled to canvas px by
// SCALE. `attackKind`, `phaseFrame` and `t` drive the procedural skeleton pose.
export interface DrawFighter {
  x: number;
  y: number;
  facing: number;
  hp: number;
  stamina: number;
  phase: string;
  slot: number;
  name: string;
  attackKind: AttackKind | string;
  phaseFrame: number;
  t: number;
}

// The round/match HUD state the renderer needs (subset of `fightMatch`).
export interface DrawMatch {
  phase: string;            // 'intro' | 'fighting' | 'roundEnd' | 'matchEnd'
  round: number;
  roundWins0: number;
  roundWins1: number;
  status: string;           // 'live' | 'done'
  secondsLeft: number;      // round time remaining (s) while fighting; <0 = hide
}

export interface DrawScene {
  fighters: DrawFighter[];
  effects: Effects;
  match?: DrawMatch;
  mySlot: number;           // which fighter is the local player (-1 = unknown)
}

export function draw(g: CanvasRenderingContext2D, scene: DrawScene): void {
  const { fighters, effects, match, mySlot } = scene;

  // background (drawn outside the shake transform so the void never reveals edges)
  g.fillStyle = '#0f1018';
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ---- world space (shaken) ----
  g.save();
  const sx = (Math.random() * 2 - 1) * effects.shake;
  const sy = (Math.random() * 2 - 1) * effects.shake;
  g.translate(sx, sy);

  // ground
  g.fillStyle = '#15161d';
  g.fillRect(-20, GROUND_PX, CANVAS_W + 40, CANVAS_H - GROUND_PX + 20);
  g.strokeStyle = '#2e303a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-20, GROUND_PX + 0.5);
  g.lineTo(CANVAS_W + 20, GROUND_PX + 0.5);
  g.stroke();

  for (const f of fighters) {
    drawFighter(g, f, effects);
  }

  drawSparks(g, effects);

  g.restore();

  // ---- screen space HUD ----
  const slot0 = fighters.find((f) => f.slot === 0);
  const slot1 = fighters.find((f) => f.slot === 1);
  drawHp(g, 16, slot0?.hp ?? 0, slot0?.stamina ?? 0, slot0?.name ?? 'P1', false, mySlot === 0, COLORS[0]);
  drawHp(g, CANVAS_W - 16 - HP_W, slot1?.hp ?? 0, slot1?.stamina ?? 0, slot1?.name ?? 'P2', true, mySlot === 1, COLORS[1]);

  drawPips(g, 16, match?.roundWins0 ?? 0, false);
  drawPips(g, CANVAS_W - 16, match?.roundWins1 ?? 0, true);

  if (match && match.secondsLeft >= 0) drawTimer(g, match.secondsLeft);
  if (match) drawBanner(g, match);
}

// Round countdown, centred at the top between the two HP bars.
function drawTimer(g: CanvasRenderingContext2D, secondsLeft: number): void {
  g.save();
  g.font = 'bold 26px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = secondsLeft <= 10 ? '#f87171' : '#f3f4f6';
  g.fillText(String(secondsLeft), CANVAS_W / 2, 28);
  g.restore();
}

function drawFighter(g: CanvasRenderingContext2D, f: DrawFighter, effects: Effects): void {
  const feetX = f.x * SCALE;
  const feetY = GROUND_PX - f.y * SCALE; // sim y is height above ground; canvas y grows downward
  const j = pose(f.phase, f.attackKind, f.phaseFrame, f.facing, f.t);
  const color = COLORS[f.slot % COLORS.length];
  const r = j.headR * SCALE;

  // local (origin feet, +y up, arena units) → canvas (origin feet, +y down, px)
  const cx = (v: { x: number; y: number }): [number, number] => [feetX + v.x * SCALE, feetY - v.y * SCALE];

  const bones = (): void => {
    strokePath(g, [cx(j.neck), cx(j.pelvis)]);
    strokePath(g, [cx(j.pelvis), cx(j.knees[0]), cx(j.feet[0])]);
    strokePath(g, [cx(j.pelvis), cx(j.knees[1]), cx(j.feet[1])]);
    strokePath(g, [cx(j.neck), cx(j.elbows[0]), cx(j.hands[0])]);
    strokePath(g, [cx(j.neck), cx(j.elbows[1]), cx(j.hands[1])]);
  };

  g.save();
  if (f.phase === 'ko') g.globalAlpha = 0.4;

  g.lineWidth = STROKE_W * SCALE;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  bones();

  // head
  const [hx, hy] = cx(j.head);
  g.fillStyle = color;
  g.beginPath();
  g.arc(hx, hy, r, 0, Math.PI * 2);
  g.fill();

  // headband: a filled arc band across the front of the head
  const band = HEADBANDS[f.slot % HEADBANDS.length];
  const face = f.facing < 0 ? Math.PI : 0; // band faces the way the fighter looks
  g.fillStyle = band;
  g.beginPath();
  g.arc(hx, hy - r * 0.25, r, face - 1.1, face + 1.1);
  g.lineTo(hx, hy - r * 0.25);
  g.closePath();
  g.fill();

  // white flash overlay when this slot was just struck
  const flash = effects.flash[f.slot] ?? 0;
  if (flash > 0) {
    g.globalAlpha = (flash / FLASH_FRAMES) * 0.7;
    g.strokeStyle = '#ffffff';
    bones();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(hx, hy, r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // name above the head
  g.fillStyle = '#9ca3af';
  g.font = '12px system-ui';
  g.textAlign = 'center';
  g.fillText(f.name, feetX, feetY - FIGHTER_H * SCALE - 8);
}

function drawSparks(g: CanvasRenderingContext2D, effects: Effects): void {
  g.lineWidth = 2 * SCALE;
  g.lineCap = 'round';
  for (const s of effects.sparks) {
    const a = Math.max(0, s.life / SPARK_LIFE);
    const x = s.x * SCALE;
    const y = GROUND_PX - s.y * SCALE;
    const len = (4 + a * 6) * SCALE;
    const sp = Math.hypot(s.vx, s.vy) || 1;
    const dx = (s.vx / sp) * len;
    const dy = -(s.vy / sp) * len; // sim +y up → canvas down
    g.strokeStyle = s.blocked ? `rgba(125, 211, 252, ${a})` : `rgba(253, 224, 71, ${a})`; // blocked = cool blue, hit = warm
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - dx, y - dy);
    g.stroke();
  }
}

function strokePath(g: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  if (pts.length === 0) return;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

function drawHp(
  g: CanvasRenderingContext2D,
  x: number,
  hp: number,
  stamina: number,
  name: string,
  right: boolean,
  isMine: boolean,
  color: string,
): void {
  const w = HP_W;
  const h = 16;
  const pct = Math.max(0, Math.min(1, hp / MAX_HP));
  g.fillStyle = '#2e303a';
  g.fillRect(x, 16, w, h);
  g.fillStyle = pct > 0.3 ? '#34d399' : '#f87171';
  if (right) g.fillRect(x + w * (1 - pct), 16, w * pct, h);
  else g.fillRect(x, 16, w * pct, h);

  // stamina: a thin blue bar just under the HP bar
  const sp = Math.max(0, Math.min(1, stamina / MAX_STAMINA));
  g.fillStyle = '#23262f';
  g.fillRect(x, 36, w, 5);
  g.fillStyle = sp > 0.3 ? '#60a5fa' : '#ef4444'; // red when too low to act
  const sw = w * sp;
  if (right) g.fillRect(x + w - sw, 36, sw, 5);
  else g.fillRect(x, 36, sw, 5);

  // your own bar gets a coloured outline + a "YOU" tag so it's unmistakable
  if (isMine) {
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.strokeRect(x - 2, 14, w + 4, h + 4);
    g.fillStyle = color;
    g.font = 'bold 11px system-ui';
    g.textAlign = right ? 'right' : 'left';
    g.fillText('YOU', right ? x + w : x, 11);
  }
  g.fillStyle = '#f3f4f6';
  g.font = '12px system-ui';
  g.textAlign = right ? 'right' : 'left';
  g.fillText(name, right ? x + w : x, 54);
}

// Round-win pips under each HP bar: filled = won, hollow = remaining.
function drawPips(g: CanvasRenderingContext2D, edgeX: number, wins: number, right: boolean): void {
  const y = 66;
  const gap = PIP_R * 2 + 8;
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    const cx = right ? edgeX - PIP_R - i * gap : edgeX + PIP_R + i * gap;
    g.beginPath();
    g.arc(cx, y, PIP_R, 0, Math.PI * 2);
    if (i < wins) {
      g.fillStyle = '#fbbf24';
      g.fill();
    } else {
      g.strokeStyle = '#6b7280';
      g.lineWidth = 2;
      g.stroke();
    }
  }
}

function drawBanner(g: CanvasRenderingContext2D, match: DrawMatch): void {
  let text = '';
  switch (match.phase) {
    case 'intro':
      text = `Round ${match.round} — FIGHT!`;
      break;
    case 'roundEnd':
      text = 'K.O.!';
      break;
    case 'matchEnd':
      text = match.roundWins0 > match.roundWins1 ? 'Player 1 wins!' : 'Player 2 wins!';
      break;
    default:
      return; // 'fighting' shows no banner
  }
  g.save();
  g.font = 'bold 32px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(15,16,24,0.65)';
  const tw = g.measureText(text).width;
  g.fillRect(CANVAS_W / 2 - tw / 2 - 16, CANVAS_H / 2 - 28, tw + 32, 56);
  g.fillStyle = '#f3f4f6';
  g.fillText(text, CANVAS_W / 2, CANVAS_H / 2);
  g.restore();
}

// Re-export for callers that want the joint shape (e.g. tests / tooling).
export type { Joints };
