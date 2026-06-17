import { useState, type FormEvent } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from './module_bindings';
import './App.css';

export default function App() {
  const { isActive, identity } = useSpacetimeDB();
  const [players, ready] = useTable(tables.player);
  const setName = useReducer(reducers.setName);
  const [draft, setDraft] = useState('');

  const myHex = identity?.toHexString();
  const me = players.find(p => p.identity.toHexString() === myHex);
  const onlineCount = players.filter(p => p.online).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (name) {
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

      <section className="players">
        <h2>{onlineCount} online{ready ? '' : ' …'}</h2>
        <ul>
          {players
            .slice()
            .sort((a, b) => Number(b.online) - Number(a.online))
            .map(p => {
              const hex = p.identity.toHexString();
              return (
                <li key={hex} className={p.online ? 'online' : 'offline'}>
                  <span className="dot" />
                  <span className="pname">{p.displayName || 'anon'}</span>
                  {hex === myHex && <span className="you">you</span>}
                </li>
              );
            })}
        </ul>
      </section>
    </main>
  );
}
