import { useEffect, useRef } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import { draw, type DrawFighter, type DrawMatch } from './render';
import { newEffects, pushHit, tickEffects, type Effects } from './effects';
import { playSfx } from './audio';
import { CANVAS_W, CANVAS_H } from './constants';

export function FighterGame({ roomId }: { roomId: bigint }) {
  const { identity, getConnection, isActive } = useSpacetimeDB();
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
  const dataRef = useRef<{ fighters: typeof mine; players: typeof players; match: typeof match; mySlot: number }>({
    fighters: [], players: [], match: undefined, mySlot: -1,
  });
  dataRef.current = {
    fighters: mine, players, match,
    mySlot: mine.find(f => f.identity.toHexString() === identity?.toHexString())?.slot ?? -1,
  };

  // Smoothed on-screen positions per slot (interpolation toward server state).
  const renderRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Client-only juice state (shake / hitstop / flash / sparks).
  const effectsRef = useRef<Effects>(newEffects());

  // Detect an opponent leaving mid-match: their leave/disconnect tears down the
  // match row, so if we once saw a match here and it's now gone, we win by forfeit.
  const hadMatchRef = useRef(false);
  if (match) hadMatchRef.current = true;
  const opponentLeft = hadMatchRef.current && !match;

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
    const GAME_KEYS = new Set(['a', 'd', 'w', 's', 'j', 'k', 'l', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ']);
    const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement | null)?.tagName === 'INPUT';
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;                  // don't hijack the name field
      const k = e.key.toLowerCase();
      if (GAME_KEYS.has(k)) e.preventDefault();  // suppress page scroll / space-activates-button
      held.add(k);
      compute();
    };
    const up = (e: KeyboardEvent) => { held.delete(e.key.toLowerCase()); compute(); };
    const reset = () => { held.clear(); compute(); }; // focus loss / alt-tab → release stuck keys
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
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
        // victimSlot is authoritative from the server (no nearest-fighter guessing)
        pushHit(effectsRef.current, ev.x, ev.y, ev.amount, ev.victimSlot, ev.kind === 'block');
      }
    };
    conn.db.fightEvent.onInsert(onEvent);
    return () => { conn.db.fightEvent.removeOnInsert(onEvent); };
    // isActive in deps: re-register on reconnect (the connection object is rebuilt).
  }, [getConnection, roomId, isActive]);

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
        const { fighters: fs, players: ps, match: mt, mySlot } = dataRef.current;
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
            x: r.x, y: r.y, facing: f.facing, hp: f.hp, stamina: f.stamina, phase: f.phase, slot: f.slot,
            name: nameOf(f.identity.toHexString()),
            attackKind: f.attackKind, phaseFrame: f.phaseFrame, t,
          };
        });
        const dm: DrawMatch | undefined = mt
          ? {
              phase: mt.phase, round: mt.round, roundWins0: mt.roundWins0, roundWins1: mt.roundWins1, status: mt.status,
              secondsLeft: mt.phase === 'fighting'
                ? Math.max(0, Math.ceil((Number(mt.endsAtMicros) / 1000 - Date.now()) / 1000))
                : -1,
            }
          : undefined;
        draw(g, { fighters: draws, effects: effectsRef.current, match: dm, mySlot });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const myHex = identity?.toHexString();
  const result = (() => {
    if (opponentLeft) return 'Opponent left — you win! 🏆';
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
