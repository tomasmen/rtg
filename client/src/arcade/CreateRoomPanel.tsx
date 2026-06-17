import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';

// Chess time-control presets (settings string is "minutes+incrementSeconds").
const CHESS_PRESETS: { label: string; settings: string }[] = [
  { label: 'No clock', settings: 'none' },
  { label: '1 + 0 · Bullet', settings: '1+0' },
  { label: '3 + 2 · Blitz', settings: '3+2' },
  { label: '5 + 0 · Blitz', settings: '5+0' },
  { label: '10 + 0 · Rapid', settings: '10+0' },
  { label: '15 + 10 · Rapid', settings: '15+10' },
  { label: '30 + 0 · Classical', settings: '30+0' },
];

export function CreateRoomPanel({
  gameId,
  displayName,
  onClose,
}: {
  gameId: string;
  displayName: string;
  onClose: () => void;
}) {
  const createRoom = useReducer(reducers.createRoom);
  const [min, setMin] = useState('5');
  const [inc, setInc] = useState('3');

  const create = (settings: string) => {
    void createRoom({ gameId, settings });
    onClose();
  };

  return (
    <div className="create-overlay" onClick={onClose}>
      <div className="create-panel" onClick={e => e.stopPropagation()}>
        <h3>Create {displayName} room</h3>

        {gameId === 'chess' ? (
          <>
            <p className="muted">Choose a time control</p>
            <div className="tc-grid">
              {CHESS_PRESETS.map(p => (
                <button key={p.settings} onClick={() => create(p.settings)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="tc-custom">
              <span>Custom</span>
              <input type="number" min="0" max="180" value={min} onChange={e => setMin(e.target.value)} aria-label="minutes" />
              <span>min +</span>
              <input type="number" min="0" max="60" value={inc} onChange={e => setInc(e.target.value)} aria-label="increment seconds" />
              <span>s</span>
              <button onClick={() => create(`${Number(min) || 0}+${Number(inc) || 0}`)}>Create</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">No options for this game.</p>
            <button onClick={() => create('')}>Create room</button>
          </>
        )}

        <button className="create-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
