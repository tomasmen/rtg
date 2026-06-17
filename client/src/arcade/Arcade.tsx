import { useState } from 'react';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings';
import { GAMES, type GameMeta } from '../games/registry';
import { CreateRoomPanel } from './CreateRoomPanel';

// The arcade lobby: game tiles (quick-match), a list of open rooms to join, and
// the online-players list.
export function Arcade() {
  const [players] = useTable(tables.player);
  const [rooms] = useTable(tables.gameRoom);
  const [members] = useTable(tables.roomMember);
  const quickMatch = useReducer(reducers.quickMatch);
  const joinRoom = useReducer(reducers.joinRoom);
  const [creating, setCreating] = useState<GameMeta | null>(null);

  const online = players.filter(p => p.online);
  const waiting = rooms.filter(r => r.status === 'waiting');
  const countFor = (roomId: bigint) => members.filter(m => m.roomId === roomId).length;

  return (
    <>
      <section className="tiles">
        {GAMES.map(g => (
          <div className="tile" key={g.id}>
            <h3>{g.displayName}</h3>
            <p>{g.blurb}</p>
            <div className="tile-actions">
              <button onClick={() => void quickMatch({ gameId: g.id })}>Quick match</button>
              <button className="secondary" onClick={() => setCreating(g)}>Create room</button>
            </div>
          </div>
        ))}
      </section>

      <section className="rooms">
        <h2>Open rooms</h2>
        {waiting.length === 0 && <p className="muted">None yet — start one above.</p>}
        <ul>
          {waiting.map(r => (
            <li key={r.id.toString()}>
              <span>{r.gameId} · {countFor(r.id)} waiting</span>
              <button onClick={() => void joinRoom({ roomId: r.id })}>Join</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="players">
        <h2>{online.length} online</h2>
        <ul>
          {players.map(p => (
            <li key={p.identity.toHexString()} className={p.online ? 'online' : 'offline'}>
              <span className="dot" />
              <span className="pname">{p.displayName || 'anon'}</span>
            </li>
          ))}
        </ul>
      </section>

      {creating && (
        <CreateRoomPanel
          gameId={creating.id}
          displayName={creating.displayName}
          onClose={() => setCreating(null)}
        />
      )}
    </>
  );
}
