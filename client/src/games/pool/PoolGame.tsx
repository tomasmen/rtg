import { useEffect, useRef } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import { draw, type PoolScene, type DrawBall } from './render';
import { CANVAS_W, CANVAS_H, ux, uy, ballGroup, PULL_MAX } from './constants';

export function PoolGame({ roomId }: { roomId: bigint }) {
  const { identity } = useSpacetimeDB();
  const [ballsTbl] = useTable(tables.poolBall);
  const [games] = useTable(tables.poolGame);
  const [seatsTbl] = useTable(tables.poolSeat);
  const [players] = useTable(tables.player);
  const shoot = useReducer(reducers.poolShoot);
  const placeCue = useReducer(reducers.poolPlaceCue);
  const leaveRoom = useReducer(reducers.leaveRoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const balls = ballsTbl.filter(b => b.roomId === roomId);
  const game = games.find(g => g.roomId === roomId);
  const seats = seatsTbl.filter(s => s.roomId === roomId);
  const myHex = identity?.toHexString();
  const mySeatRow = seats.find(s => s.identity.toHexString() === myHex);
  const mySeat = mySeatRow ? mySeatRow.seat : -1;
  const nameOf = (hex: string) => players.find(p => p.identity.toHexString() === hex)?.displayName || 'anon';
  const seatName = (seat: number) => {
    const s = seats.find(x => x.seat === seat);
    return s ? nameOf(s.identity.toHexString()) : `Seat ${seat + 1}`;
  };

  const myTurn = !!game && game.status === 'active' && game.currentSeat === mySeat;

  // latest state for the rAF loop + input handlers
  const dataRef = useRef<{ balls: typeof balls; game: typeof game; myTurn: boolean }>({ balls: [], game: undefined, myTurn: false });
  dataRef.current = { balls, game, myTurn };

  const renderRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const inputRef = useRef<{ charging: boolean; angle: number; power: number; hoverAngle: number; ghost: { x: number; y: number } | null }>(
    { charging: false, angle: 0, power: 0, hoverAngle: 0, ghost: null }
  );

  // ---- pointer input (slingshot aim + ball-in-hand placement) ----
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const toWorld = (e: PointerEvent) => {
      const r = cvs.getBoundingClientRect();
      const px = (e.clientX - r.left) * (CANVAS_W / r.width);
      const py = (e.clientY - r.top) * (CANVAS_H / r.height);
      return { x: ux(px), y: uy(py) };
    };
    const cue = () => {
      const c = dataRef.current.balls.find(b => b.num === 0 && !b.pocketed);
      return c ? { x: c.x, y: c.y } : null;
    };

    const move = (e: PointerEvent) => {
      const g = dataRef.current.game;
      if (!g || !dataRef.current.myTurn) return;
      const w = toWorld(e);
      const c = cue();
      if (g.phase === 'ballinhand') { inputRef.current.ghost = w; return; }
      if (!c) return;
      if (inputRef.current.charging) {
        const dist = Math.hypot(w.x - c.x, w.y - c.y);
        inputRef.current.power = Math.max(0, Math.min(1, dist / PULL_MAX));
        inputRef.current.angle = Math.atan2(c.y - w.y, c.x - w.x); // fire away from the pull
      } else if (g.phase === 'aiming') {
        inputRef.current.hoverAngle = Math.atan2(w.y - c.y, w.x - c.x);
      }
    };
    const down = (e: PointerEvent) => {
      const g = dataRef.current.game;
      if (!g || !dataRef.current.myTurn) return;
      const w = toWorld(e);
      if (g.phase === 'ballinhand') { void placeCue({ x: w.x, y: w.y }); inputRef.current.ghost = null; return; }
      if (g.phase === 'aiming') { inputRef.current.charging = true; move(e); }
    };
    const up = () => {
      const inp = inputRef.current;
      if (inp.charging) {
        inp.charging = false;
        if (inp.power > 0.05 && dataRef.current.game?.phase === 'aiming' && dataRef.current.myTurn) {
          void shoot({ angle: inp.angle, power: inp.power });
        }
        inp.power = 0;
      }
    };
    cvs.addEventListener('pointermove', move);
    cvs.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      cvs.removeEventListener('pointermove', move);
      cvs.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [shoot, placeCue]);

  // ---- render loop ----
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const cvs = canvasRef.current;
      const g = cvs?.getContext('2d');
      if (g) {
        const { balls: bs, game: gm, myTurn: mt } = dataRef.current;
        const draws: DrawBall[] = bs.map(b => {
          const r = renderRef.current.get(b.num) ?? { x: b.x, y: b.y };
          r.x += (b.x - r.x) * 0.4;
          r.y += (b.y - r.y) * 0.4;
          renderRef.current.set(b.num, r);
          return { num: b.num, x: r.x, y: r.y, pocketed: b.pocketed };
        });
        const cueBall = bs.find(b => b.num === 0 && !b.pocketed);
        const inp = inputRef.current;
        const scene: PoolScene = {
          balls: draws,
          cue: cueBall ? { x: cueBall.x, y: cueBall.y } : null,
          aim: inp.charging ? { angle: inp.angle, power: inp.power } : null,
          showAimHint: !!mt && gm?.phase === 'aiming',
          aimAngle: inp.hoverAngle,
          ghost: mt && gm?.phase === 'ballinhand' ? inp.ghost : null,
        };
        draw(g, scene);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!game) {
    return (
      <section className="pool">
        <p className="muted">Racking the balls…</p>
        <button className="leave-game" onClick={() => void leaveRoom()}>Leave</button>
      </section>
    );
  }

  const redsLeft = balls.filter(b => !b.pocketed && ballGroup(b.num) === 'red').length;
  const yellowsLeft = balls.filter(b => !b.pocketed && ballGroup(b.num) === 'yellow').length;
  const groupLabel = (grp: string) => {
    if (grp === 'open') return 'open';
    const left = grp === 'red' ? redsLeft : yellowsLeft;
    return `${grp} · ${left} left`;
  };
  const over = game.status === 'ended';
  const result = over ? (game.winnerSeat === mySeat ? 'You win! 🏆' : `${seatName(game.winnerSeat)} wins`) : null;
  const turnText = over ? 'Game over'
    : game.phase === 'simulating' ? 'Balls rolling…'
    : myTurn ? (game.phase === 'ballinhand' ? 'Ball in hand — click to place, then drag to aim' : 'Your shot — drag back from the cue to aim & power')
    : `${seatName(game.currentSeat)}'s shot`;

  const Pill = ({ seat }: { seat: number }) => {
    const grp = seat === 0 ? game.group0 : game.group1;
    const cls = grp === 'red' ? 'red' : grp === 'yellow' ? 'yellow' : 'open';
    return (
      <div className={`pool-pill${game.currentSeat === seat && !over ? ' current' : ''}`}>
        <span className={`pool-grp ${cls}`} />
        <span className="pool-pname">{seatName(seat)}{seat === mySeat && <b> (you)</b>}</span>
        <span className="pool-gmeta">{groupLabel(grp)}</span>
      </div>
    );
  };

  return (
    <section className="pool">
      <div className="pool-topbar">
        <Pill seat={0} />
        <div className="pool-turn">{turnText}</div>
        <Pill seat={1} />
      </div>
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="pool-canvas" style={{ touchAction: 'none' }} />
      <div className="pool-log">{game.log}</div>
      {result && (
        <div className="result">
          <span>{result}</span>
          <button onClick={() => void leaveRoom()}>Back to arcade</button>
        </div>
      )}
      {!result && <button className="leave-game" onClick={() => void leaveRoom()}>Leave</button>}
    </section>
  );
}
