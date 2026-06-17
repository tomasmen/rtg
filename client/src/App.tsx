import { useState, useEffect, type FormEvent } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from './module_bindings';
import { Arcade } from './arcade/Arcade';
import { WaitingRoom } from './arcade/WaitingRoom';
import './App.css';

const SAVED_NAME_KEY = 'rtg_name';

export default function App() {
  const { isActive, identity } = useSpacetimeDB();
  const [players] = useTable(tables.player);
  const setName = useReducer(reducers.setName);
  const [draft, setDraft] = useState(() => localStorage.getItem(SAVED_NAME_KEY) ?? '');

  const myHex = identity?.toHexString();
  const me = players.find(p => p.identity.toHexString() === myHex);

  // Re-apply the saved display name once connected (e.g. after a reload or a
  // server-side data reset) so the player never has to re-type it.
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_NAME_KEY);
    if (isActive && me && !me.displayName && saved) void setName({ name: saved });
  }, [isActive, me, setName]);

  // location is 'arcade' or '<gameId>:<roomId>' — route on it.
  const myRoomId = (() => {
    if (!me || !me.location || me.location === 'arcade') return null;
    const parts = me.location.split(':');
    return parts.length === 2 ? BigInt(parts[1]) : null;
  })();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (name) {
      localStorage.setItem(SAVED_NAME_KEY, name);
      void setName({ name });
      setDraft('');
    }
  };

  if (!isActive) {
    return (
      <main className="app">
        <p className="status">Connecting to the arcade…</p>
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <h1>🕹️ Office Arcade</h1>
        <span className="me">
          You are {me?.displayName ? <b>{me.displayName}</b> : <i>unnamed</i>}
        </span>
      </header>

      {myRoomId === null && (
        <form className="name-form" onSubmit={submit}>
          <input
            name="displayName"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={me?.displayName || 'Enter your name'}
            maxLength={24}
            aria-label="Your display name"
          />
          <button type="submit">Set name</button>
        </form>
      )}

      {myRoomId === null ? <Arcade /> : <WaitingRoom roomId={myRoomId} />}
    </main>
  );
}
