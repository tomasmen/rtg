import { useEffect, useRef } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import { draw, type DrawFighter, type DrawMatch } from './render';
import { newEffects, pushHit, tickEffects, type Effects } from './effects';
import { playSfx } from './audio';
import { CANVAS_W, CANVAS_H } from './constants';

export function FighterGame({ roomId }: { roomId: bigint }) {
  const { identity, getConnection } = useSpacetimeDB();
  const [fighters] = useTable(tables.fighter);
  const [matches] = useTable(tables.fightMatch);
  const [players] = useTable(tables.player);
  useTable(tables.fightEvent); // subscribe so fight_event onInsert callbacks fire

  const setInput = useReducer(reducers.setInput);
  const leaveRoom = useReducer(reducers.leaveRoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mine = fighters.filter(f => f.roomId === roomId);
  const match = matches.find(m => m.roomId === roomId);

  // Stash the latest synced data for the rAF loop (which has stable closures).
  const dataRef = useRef<{ fighters: typeof mine; players: typeof players; match: typeof match }>({
    fighters: [], players: [], match: undefined,
  });
  dataRef.current = { fighters: mine, players, match };

  // Smoothed on-screen positions per slot (interpolation toward server state).
  const renderRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Client-only juice state (shake / hitstop / flash / sparks).
  const effectsRef = useRef<Effects>(newEffects());

  // ---- keyboard input → setInput (only on change) ----
  useEffect(() => {
    const held = new Set<string>();
    let last = '';
    const compute = () => {
      const left = held.has('a') || held.has('arrowleft');
      const right = held.has('d') || held.has('arrowright');
      const moveX = (right ? 1 : 0) - (left ? 1 : 0);
      const jump = held.has('w') || held.has('arrowup') || held.has(' ');
      const crouch = held.has('s') || held.has('arrowdown');
      const light = held.has('j');
      const heavy = held.has('k');
      const block = held.has('l');
      const key = `${moveX}|${jump}|${crouch}|${light}|${heavy}|${block}`;
      if (key !== last) {
        last = key;
        void setInput({ moveX, jump, light, heavy, block, crouch });
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

  // ---- fightEvent broadcasts → juice + (stubbed) sound ----
  useEffect(() => {
    // getConnection() is loosely typed (DbConnectionImpl<any>); event-table
    // handles are reached via conn.db.<table>.onInsert.
    const conn: any = getConnection();
    if (!conn) return;
    const onEvent = (_ctx: any, ev: any) => {
      if (ev.roomId !== roomId) return;
      playSfx(ev.kind);
      if (ev.kind === 'hit' || ev.kind === 'block') {
        // victim = fighter nearest the contact point
        let victimSlot = -1;
        let best = Infinity;
        for (const f of dataRef.current.fighters) {
          const d = Math.abs(f.x - ev.x);
          if (d < best) { best = d; victimSlot = f.slot; }
        }
        pushHit(effectsRef.current, ev.x, ev.y, ev.amount, victimSlot, ev.kind === 'block');
      }
    };
    conn.db.fightEvent.onInsert(onEvent);
    return () => { conn.db.fightEvent.removeOnInsert(onEvent); };
  }, [getConnection, roomId]);

  // ---- render loop ----
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const cvs = canvasRef.current;
      const g = cvs?.getContext('2d');
      if (g) {
        const inHitstop = tickEffects(effectsRef.current, dt);
        const { fighters: fs, players: ps, match: mt } = dataRef.current;
        const nameOf = (hex: string) =>
          ps.find(p => p.identity.toHexString() === hex)?.displayName || 'anon';
        const t = now / 1000;
        const draws: DrawFighter[] = fs.map(f => {
          const r = renderRef.current.get(f.slot) ?? { x: f.x, y: f.y };
          // freeze interpolation during hitstop so impacts read as a hard stop
          if (!inHitstop) {
            r.x += (f.x - r.x) * 0.4;
            r.y += (f.y - r.y) * 0.4;
          }
          renderRef.current.set(f.slot, r);
          return {
            x: r.x, y: r.y, facing: f.facing, hp: f.hp, phase: f.phase, slot: f.slot,
            name: nameOf(f.identity.toHexString()),
            attackKind: f.attackKind, phaseFrame: f.phaseFrame, t,
          };
        });
        const dm: DrawMatch | undefined = mt
          ? { phase: mt.phase, round: mt.round, roundWins0: mt.roundWins0, roundWins1: mt.roundWins1, status: mt.status }
          : undefined;
        draw(g, { fighters: draws, effects: effectsRef.current, match: dm });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const myHex = identity?.toHexString();
  const result = (() => {
    if (!match || match.status !== 'done') return null;
    const me = mine.find(f => f.identity.toHexString() === myHex);
    if (!me) return 'Match over';
    const myWins = me.slot === 0 ? match.roundWins0 : match.roundWins1;
    const oppWins = me.slot === 0 ? match.roundWins1 : match.roundWins0;
    return myWins > oppWins ? 'You win the match! 🏆' : 'You lose the match';
  })();

  return (
    <section className="fighter">
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="arena" />
      <div className="controls-hint">
        Move <b>A/D</b> · Crouch <b>S</b> · Jump <b>W</b> · Light <b>J</b> · Heavy <b>K</b> · Block <b>L</b> · Dash <b>double-tap A/D</b>
      </div>
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
