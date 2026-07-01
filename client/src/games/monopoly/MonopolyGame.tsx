import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import { Board3D } from './scene/Board3D';
import { Van } from './scene/Van';
import { SPACES, VAN_COLORS } from './board';

// Pip faces for a die (1..6). Small, dependency-free.
const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
function Die({ n }: { n: number }) {
  if (n < 1) return null;
  const on = new Set(PIPS[n] ?? []);
  return (
    <span className="mono-die">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip${on.has(i) ? ' on' : ''}`} />
      ))}
    </span>
  );
}

export function MonopolyGame({ roomId }: { roomId: bigint }) {
  const { identity } = useSpacetimeDB();
  const [games] = useTable(tables.monopolyGame);
  const [mplayers] = useTable(tables.monopolyPlayer);
  const [players] = useTable(tables.player);
  const roll = useReducer(reducers.monopolyRoll);
  const endTurn = useReducer(reducers.monopolyEndTurn);
  const leaveRoom = useReducer(reducers.leaveRoom);

  const game = games.find(g => g.roomId === roomId);
  const seats = mplayers.filter(p => p.roomId === roomId).slice().sort((a, b) => a.seat - b.seat);
  const myHex = identity?.toHexString();
  const me = seats.find(p => p.identity.toHexString() === myHex);
  const nameOf = (hex: string) => players.find(p => p.identity.toHexString() === hex)?.displayName || 'anon';

  if (!game) {
    return (
      <section className="mono">
        <p className="muted">Setting up the board…</p>
        <button className="leave-game" onClick={() => void leaveRoom()}>Leave</button>
      </section>
    );
  }

  const myTurn = !!me && game.currentSeat === me.seat && game.status === 'active';
  const canRoll = myTurn && game.phase === 'rolling';
  const canEnd = myTurn && game.phase === 'rolled';
  const curSeat = seats.find(p => p.seat === game.currentSeat);
  const curName = curSeat ? nameOf(curSeat.identity.toHexString()) : `Seat ${game.currentSeat + 1}`;

  return (
    <section className="mono">
      <div className="mono-stage">
        <Canvas camera={{ position: [0, 22, 24], fov: 48 }} dpr={[1, 2]}>
          <color attach="background" args={['#0d0e13']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[12, 22, 8]} intensity={1.1} />
          <directionalLight position={[-10, 12, -6]} intensity={0.4} />
          <Board3D />
          {seats.map(p => (
            <Van key={p.seat} posIdx={p.position} seat={p.seat} color={VAN_COLORS[p.vanStyle % VAN_COLORS.length]} />
          ))}
          <OrbitControls enablePan={false} minDistance={14} maxDistance={46} maxPolarAngle={1.45} target={[0, 0, 0]} />
        </Canvas>

        {/* turn + dice (top-left) */}
        <div className="mono-turn">
          <span className="mono-turn-who">{myTurn ? 'Your turn' : `${curName}'s turn`}</span>
          <span className="mono-dice">
            <Die n={game.die1} /><Die n={game.die2} />
          </span>
        </div>

        {/* action bar (bottom-center) */}
        <div className="mono-actions">
          {canRoll && <button className="mono-btn primary" onClick={() => void roll()}>🎲 Roll</button>}
          {canEnd && <button className="mono-btn primary" onClick={() => void endTurn()}>End turn ▸</button>}
          {!myTurn && game.status === 'active' && <span className="mono-wait">Waiting for {curName}…</span>}
        </div>

        {/* player panel (top-right, scrollable) */}
        <aside className="mono-players">
          {seats.map(p => {
            const hex = p.identity.toHexString();
            const isCur = p.seat === game.currentSeat;
            const isMe = hex === myHex;
            return (
              <div key={p.seat} className={`mono-pcard${isCur ? ' current' : ''}`}>
                <span className="mono-swatch" style={{ background: VAN_COLORS[p.vanStyle % VAN_COLORS.length] }} />
                <div className="mono-pinfo">
                  <div className="mono-pname">{nameOf(hex)}{isMe && <span className="mono-you">YOU</span>}</div>
                  <div className="mono-pmeta">
                    ${p.cash} · {p.inJail ? '🔒 jail' : SPACES[p.position]?.name ?? `#${p.position}`}
                  </div>
                </div>
              </div>
            );
          })}
        </aside>
      </div>

      <div className="mono-log">{game.log}</div>
      <button className="leave-game" onClick={() => void leaveRoom()}>Leave</button>
    </section>
  );
}
