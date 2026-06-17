import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings';

// Shown when the player is in a room: the seated members, the room status, and a
// Leave button. When status flips to 'active', gameplay (Phase 3) takes over.
export function WaitingRoom({ roomId }: { roomId: bigint }) {
  const [rooms] = useTable(tables.gameRoom);
  const [members] = useTable(tables.roomMember);
  const [players] = useTable(tables.player);
  const leaveRoom = useReducer(reducers.leaveRoom);

  const room = rooms.find(r => r.id === roomId);
  const seated = members
    .filter(m => m.roomId === roomId)
    .slice()
    .sort((a, b) => a.slot - b.slot);
  const nameOf = (hex: string) =>
    players.find(p => p.identity.toHexString() === hex)?.displayName || 'anon';

  return (
    <section className="waiting">
      <h2>{room?.gameId ?? 'room'} — {room?.status ?? '…'}</h2>
      <ul className="seats">
        {seated.map(m => (
          <li key={m.id.toString()}>
            <span className="slot">Slot {m.slot}</span>
            {nameOf(m.identity.toHexString())}
          </li>
        ))}
      </ul>
      {room?.status === 'waiting' && <p className="muted">Waiting for an opponent…</p>}
      {room?.status === 'active' && (
        <p className="active-msg">Match starting… (gameplay arrives in Phase 3)</p>
      )}
      {room?.status === 'finished' && <p className="muted">Match ended.</p>}
      <button onClick={() => void leaveRoom()}>Leave</button>
    </section>
  );
}
