import {
  TABLE_W, TABLE_H, BALL_R, POCKET_R, POCKETS, SCALE,
  CANVAS_W, CANVAS_H, wx, wy, ballColor,
} from './constants';

export interface DrawBall { num: number; x: number; y: number; pocketed: boolean }

export interface PoolScene {
  balls: DrawBall[];
  cue: { x: number; y: number } | null;
  aim: { angle: number; power: number } | null; // set while charging a shot
  showAimHint: boolean;                          // my turn + aiming (draw a faint aim line)
  aimAngle: number;                              // current hover aim angle
  ghost: { x: number; y: number } | null;        // ball-in-hand placement preview
}

export function draw(g: CanvasRenderingContext2D, scene: PoolScene): void {
  // wood frame
  g.fillStyle = '#3a2417';
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  g.fillStyle = '#4a2e1c';
  roundRect(g, 6, 6, CANVAS_W - 12, CANVAS_H - 12, 10);
  g.fill();

  // felt
  const fx = wx(0), fy = wy(0), fw = TABLE_W * SCALE, fh = TABLE_H * SCALE;
  g.fillStyle = '#0f7a43';
  g.fillRect(fx, fy, fw, fh);
  // subtle felt shading
  const grad = g.createLinearGradient(fx, fy, fx, fy + fh);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.14)');
  g.fillStyle = grad;
  g.fillRect(fx, fy, fw, fh);

  // baulk line (decor) at 1/4
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(wx(50), fy);
  g.lineTo(wx(50), fy + fh);
  g.stroke();

  // pockets
  for (const [px, py] of POCKETS) {
    g.fillStyle = '#0a0b0d';
    g.beginPath();
    g.arc(wx(px), wy(py), POCKET_R * SCALE, 0, Math.PI * 2);
    g.fill();
  }

  // ghost (ball-in-hand preview)
  if (scene.ghost) {
    g.fillStyle = 'rgba(245,244,238,0.4)';
    g.beginPath();
    g.arc(wx(scene.ghost.x), wy(scene.ghost.y), BALL_R * SCALE, 0, Math.PI * 2);
    g.fill();
  }

  // balls
  for (const b of scene.balls) {
    if (b.pocketed) continue;
    const cx = wx(b.x), cy = wy(b.y), r = BALL_R * SCALE;
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.arc(cx + 1.5, cy + 2.5, r, 0, Math.PI * 2);
    g.fill();
    // body
    g.fillStyle = ballColor(b.num);
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    // highlight
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(cx - r * 0.32, cy - r * 0.34, r * 0.28, 0, Math.PI * 2);
    g.fill();
    // ring for the cue so it reads on the felt
    if (b.num === 0) {
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // aim visuals
  if (scene.cue && (scene.showAimHint || scene.aim)) {
    const cx = wx(scene.cue.x), cy = wy(scene.cue.y);
    const angle = scene.aim ? scene.aim.angle : scene.aimAngle;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    // aim line forward
    g.strokeStyle = scene.aim ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.setLineDash([6, 7]);
    g.beginPath();
    g.moveTo(cx + dx * BALL_R * SCALE, cy + dy * BALL_R * SCALE);
    g.lineTo(cx + dx * 460, cy + dy * 460);
    g.stroke();
    g.setLineDash([]);

    if (scene.aim) {
      // cue stick behind the ball, pulled back proportional to power
      const pull = 24 + scene.aim.power * 120;
      const bx = cx - dx * (BALL_R * SCALE + pull);
      const by = cy - dy * (BALL_R * SCALE + pull);
      g.strokeStyle = '#c8a06a';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx - dx * 150, by - dy * 150);
      g.stroke();
      // power meter
      drawPowerMeter(g, scene.aim.power);
    }
  }
}

function drawPowerMeter(g: CanvasRenderingContext2D, power: number): void {
  const w = 160, h = 12, x = CANVAS_W / 2 - w / 2, y = CANVAS_H - 20;
  g.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(g, x - 3, y - 3, w + 6, h + 6, 6);
  g.fill();
  const col = power > 0.8 ? '#ef4444' : power > 0.5 ? '#f59e0b' : '#34d399';
  g.fillStyle = col;
  roundRect(g, x, y, w * power, h, 5);
  g.fill();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
