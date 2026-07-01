import { lazy, Suspense } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings';
import { FighterGame } from '../games/fighter/FighterGame';
import { ChessGame } from '../games/chess/ChessGame';
import { PoolGame } from '../games/pool/PoolGame';

// Lazy so three.js / react-three-fiber only download when a Monopoly room opens.
const MonopolyGame = lazy(() =>
  import('../games/monopoly/MonopolyGame').then(m => ({ default: m.MonopolyGame }))
);

// Shown when the player is in a room: the seated members, the room status, and a
// Leave button. When status flips to 'active', gameplay takes over. Variable-size
// games (Monopoly) also show the host a Start button once enough players joined.
export function WaitingRoom({ roomId }: { roomId: bigint }) {
  const { identity } = useSpacetimeDB();
  const [rooms] = useTable(tables.gameRoom);
  const [members] = useTable(tables.roomMember);
  const [players] = useTable(tables.player);
  const leaveRoom = useReducer(reducers.leaveRoom);
  const startRoom = useReducer(reducers.startRoom);

  const room = rooms.find(r => r.id === roomId);

  // Once a room is active (or finished after a result), hand off to the game,
  // which owns its own leave control.
  if (room?.gameId === 'fighter' && (room.status === 'active' || room.status === 'finished')) {
    return <FighterGame roomId={roomId} />;
  }
  if (room?.gameId === 'chess' && (room.status === 'active' || room.status === 'finished')) {
    return <ChessGame roomId={roomId} />;
  }
  if (room?.gameId === 'pool' && (room.status === 'active' || room.status === 'finished')) {
    return <PoolGame roomId={roomId} />;
  }
  if (room?.gameId === 'monopoly' && (room.status === 'active' || room.status === 'finished')) {
    return (
      <Suspense fallback={<section className="mono"><p className="muted">Loading 3D board…</p></section>}>
        <MonopolyGame roomId={roomId} />
      </Suspense>
    );
  }

  const seated = members
    .filter(m => m.roomId === roomId)
    .slice()
    .sort((a, b) => a.slot - b.slot);
  const nameOf = (hex: string) =>
    players.find(p => p.identity.toHexString() === hex)?.displayName || 'anon';

  const iAmHost = !!room && !!identity && room.createdBy.toHexString() === identity.toHexString();
  const canStart = room?.status === 'waiting' && iAmHost && seated.length >= 2;

  return (
    <section className="waiting">
      <h2>{room?.gameId ?? 'room'} — {room?.status ?? '…'}</h2>
      <ul className="seats">
        {seated.map(m => (
          <li key={m.id.toString()}>
            <span className="slot">Slot {m.slot + 1}</span>
            {nameOf(m.identity.toHexString())}
          </li>
        ))}
      </ul>
      {room?.status === 'waiting' && (
        <p className="muted">
          {room.gameId === 'monopoly'
            ? (canStart ? 'Ready when you are, host.' : 'Waiting for players (2–6)…')
            : 'Waiting for an opponent…'}
        </p>
      )}
      {room?.status === 'active' && <p className="active-msg">Match starting…</p>}
      {room?.status === 'finished' && <p className="muted">Match ended.</p>}
      <div className="waiting-actions">
        {canStart && <button className="start-game" onClick={() => void startRoom()}>Start game ▸</button>}
        <button onClick={() => void leaveRoom()}>Leave</button>
      </div>
    </section>
  );
}
