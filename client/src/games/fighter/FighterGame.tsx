import { useEffect, useRef } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import { draw, type DrawFighter } from './render';
import { CANVAS_W, CANVAS_H } from './constants';

export function FighterGame({ roomId }: { roomId: bigint }) {
  const { identity } = useSpacetimeDB();
  const [fighters] = useTable(tables.fighter);
  const [matches] = useTable(tables.fightMatch);
  const [players] = useTable(tables.player);
  const setInput = useReducer(reducers.setInput);
  const leaveRoom = useReducer(reducers.leaveRoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mine = fighters.filter(f => f.roomId === roomId);
  const match = matches.find(m => m.roomId === roomId);

  // Stash the latest synced data for the rAF loop (which has stable closures).
  const dataRef = useRef<{ fighters: typeof mine; players: typeof players }>({ fighters: [], players: [] });
  dataRef.current = { fighters: mine, players };

  // Smoothed on-screen positions per slot (interpolation toward server state).
  const renderRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // ---- keyboard input → setInput (only on change) ----
  useEffect(() => {
    const held = new Set<string>();
    let last = '';
    const compute = () => {
      const left = held.has('a') || held.has('arrowleft');
      const right = held.has('d') || held.has('arrowright');
      const moveX = (right ? 1 : 0) - (left ? 1 : 0);
      const jump = held.has('w') || held.has('arrowup') || held.has(' ');
      const attack = held.has('j');
      const block = held.has('k');
      const key = `${moveX}|${jump}|${attack}|${block}`;
      if (key !== last) {
        last = key;
        void setInput({ moveX, jump, attack, block });
      }
    };
    const down = (e: KeyboardEvent) => { held.add(e.key.toLowerCase()); compute(); };
    const up = (e: KeyboardEvent) => { held.delete(e.key.toLowerCase()); compute(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [setInput]);

  // ---- render loop ----
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const cvs = canvasRef.current;
      const g = cvs?.getContext('2d');
      if (g) {
        const { fighters: fs, players: ps } = dataRef.current;
        const nameOf = (hex: string) =>
          ps.find(p => p.identity.toHexString() === hex)?.displayName || 'anon';
        const draws: DrawFighter[] = fs.map(f => {
          const r = renderRef.current.get(f.slot) ?? { x: f.x, y: f.y };
          r.x += (f.x - r.x) * 0.4;
          r.y += (f.y - r.y) * 0.4;
          renderRef.current.set(f.slot, r);
          return {
            x: r.x, y: r.y, facing: f.facing, hp: f.hp, phase: f.phase, slot: f.slot,
            name: nameOf(f.identity.toHexString()),
          };
        });
        draw(g, draws);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const myHex = identity?.toHexString();
  const result = (() => {
    if (!match || match.status === 'fighting') return null;
    const me = mine.find(f => f.identity.toHexString() === myHex);
    const opp = mine.find(f => f.identity.toHexString() !== myHex);
    if (match.status === 'timeout') {
      if (!me || !opp) return "Time's up!";
      return me.hp > opp.hp ? 'You win! (time)' : me.hp < opp.hp ? 'You lose (time)' : 'Draw';
    }
    if (me && me.hp <= 0) return 'You lose — KO';
    return 'You win — KO!';
  })();

  return (
    <section className="fighter">
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="arena" />
      <div className="controls-hint">Move <b>A/D</b> · Jump <b>W</b> · Attack <b>J</b> · Block <b>K</b></div>
      {!result && (
        <button className="leave-game" onClick={() => void leaveRoom()}>Leave</button>
      )}
      {result && (
        <div className="result">
          <span>{result}</span>
          <button onClick={() => void leaveRoom()}>Back to arcade</button>
        </div>
      )}
    </section>
  );
}
