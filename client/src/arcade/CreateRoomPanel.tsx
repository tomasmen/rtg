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

// Fighter option menus (settings string is "t=<sec>;hp=<n>;stam=<preset>;rw=<n>").
const FIGHTER_TIME = [
  { v: 30, l: '30s' },
  { v: 60, l: '60s' },
  { v: 99, l: '99s' },
  { v: 0, l: 'No limit' },
];
const FIGHTER_HP = [60, 100, 150, 200].map(v => ({ v, l: String(v) }));
const FIGHTER_STAM = [
  { v: 'off', l: 'Off' },
  { v: 'casual', l: 'Casual' },
  { v: 'normal', l: 'Normal' },
  { v: 'hardcore', l: 'Hardcore' },
];
const FIGHTER_ROUNDS = [
  { v: 1, l: 'Best of 1' },
  { v: 2, l: 'Best of 3' },
  { v: 3, l: 'Best of 5' },
];

// A labelled row of mutually-exclusive choices (radio-style buttons).
function OptGroup<T extends string | number>({
  label, options, value, onChange,
}: {
  label: string;
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="opt-group">
      <span className="opt-label">{label}</span>
      <div className="opt-row">
        {options.map(o => (
          <button
            key={String(o.v)}
            className={`opt-btn${o.v === value ? ' sel' : ''}`}
            onClick={() => onChange(o.v)}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  // chess custom clock
  const [min, setMin] = useState('5');
  const [inc, setInc] = useState('3');
  // fighter ruleset
  const [time, setTime] = useState(60);
  const [hp, setHp] = useState(100);
  const [stam, setStam] = useState('normal');
  const [rw, setRw] = useState(2);

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
        ) : gameId === 'fighter' ? (
          <>
            <p className="muted">Match settings</p>
            <OptGroup label="Round time" options={FIGHTER_TIME} value={time} onChange={setTime} />
            <OptGroup label="Health" options={FIGHTER_HP} value={hp} onChange={setHp} />
            <OptGroup label="Stamina" options={FIGHTER_STAM} value={stam} onChange={setStam} />
            <OptGroup label="Rounds" options={FIGHTER_ROUNDS} value={rw} onChange={setRw} />
            <button className="create-go" onClick={() => create(`t=${time};hp=${hp};stam=${stam};rw=${rw}`)}>
              Create room
            </button>
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
