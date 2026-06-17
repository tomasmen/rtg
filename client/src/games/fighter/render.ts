import { FIGHTER_W, FIGHTER_H, GROUND_PX, CANVAS_W, CANVAS_H, MAX_HP } from './constants';

export interface DrawFighter {
  x: number;
  y: number;
  facing: number;
  hp: number;
  phase: string;
  slot: number;
  name: string;
}

const COLORS = ['#38bdf8', '#fb7185']; // slot 0 cyan, slot 1 rose

export function draw(g: CanvasRenderingContext2D, fighters: DrawFighter[]): void {
  // background + ground
  g.fillStyle = '#0f1018';
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  g.fillStyle = '#15161d';
  g.fillRect(0, GROUND_PX, CANVAS_W, CANVAS_H - GROUND_PX);
  g.strokeStyle = '#2e303a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, GROUND_PX + 0.5);
  g.lineTo(CANVAS_W, GROUND_PX + 0.5);
  g.stroke();

  for (const f of fighters) {
    const cx = f.x;
    const feet = GROUND_PX - f.y;
    const top = feet - FIGHTER_H;
    g.save();
    if (f.phase === 'ko') g.globalAlpha = 0.4;

    // body
    g.fillStyle = COLORS[f.slot % 2];
    roundRect(g, cx - FIGHTER_W / 2, top, FIGHTER_W, FIGHTER_H, 10);
    g.fill();

    // facing marker
    g.fillStyle = '#0f1018';
    g.fillRect(cx + f.facing * 12 - 3, top + 26, 6, 8);

    // attack arm
    if (f.phase === 'attack') {
      g.fillStyle = '#fde047';
      const armX = f.facing > 0 ? cx + FIGHTER_W / 2 : cx - FIGHTER_W / 2 - 70;
      g.fillRect(armX, top + 42, 70, 16);
    }

    // block shield
    if (f.phase === 'block') {
      g.fillStyle = 'rgba(163,230,53,0.55)';
      const sx = f.facing > 0 ? cx + FIGHTER_W / 2 : cx - FIGHTER_W / 2 - 12;
      g.fillRect(sx, top + 20, 12, FIGHTER_H - 40);
    }
    g.restore();

    // name
    g.fillStyle = '#9ca3af';
    g.font = '12px system-ui';
    g.textAlign = 'center';
    g.fillText(f.name, cx, top - 8);
  }

  // HP bars
  const slot0 = fighters.find(f => f.slot === 0);
  const slot1 = fighters.find(f => f.slot === 1);
  drawHp(g, 16, slot0?.hp ?? 0, slot0?.name ?? 'P1', false);
  drawHp(g, CANVAS_W - 16 - 300, slot1?.hp ?? 0, slot1?.name ?? 'P2', true);
}

function drawHp(g: CanvasRenderingContext2D, x: number, hp: number, name: string, right: boolean): void {
  const w = 300;
  const h = 16;
  const pct = Math.max(0, Math.min(1, hp / MAX_HP));
  g.fillStyle = '#2e303a';
  g.fillRect(x, 16, w, h);
  g.fillStyle = pct > 0.3 ? '#34d399' : '#f87171';
  if (right) g.fillRect(x + w * (1 - pct), 16, w * pct, h);
  else g.fillRect(x, 16, w * pct, h);
  g.fillStyle = '#f3f4f6';
  g.font = '12px system-ui';
  g.textAlign = right ? 'right' : 'left';
  g.fillText(name, right ? x + w : x, 46);
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
