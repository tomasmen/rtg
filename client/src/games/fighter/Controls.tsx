// A game-style controls/keybind panel: keycap chips grouped into Movement and
// Combat, with the combo moves (low kick, sweep) surfaced so players discover
// the crouch attacks. Pure presentation — no state.

interface Bind {
  keys: string[];      // one keycap each; joined with '+'
  label: string;
  tap?: boolean;       // render a "tap" prefix (for the double-tap dash)
}

const MOVEMENT: Bind[] = [
  { keys: ['A', 'D'], label: 'Move' },
  { keys: ['W'], label: 'Jump' },
  { keys: ['S'], label: 'Crouch' },
  { keys: ['A', 'A'], label: 'Dash', tap: true },
];

const COMBAT: Bind[] = [
  { keys: ['J'], label: 'Light' },
  { keys: ['K'], label: 'Heavy' },
  { keys: ['L'], label: 'Block' },
  { keys: ['S', 'J'], label: 'Low kick' },
  { keys: ['S', 'K'], label: 'Sweep' },
];

function Keys({ keys, joiner }: { keys: string[]; joiner: '+' | '' }) {
  return (
    <span className="kc-keys">
      {keys.map((k, i) => (
        <span key={i} className="kc-key-wrap">
          {i > 0 && joiner && <span className="kc-plus">{joiner}</span>}
          <kbd className="kc-key">{k}</kbd>
        </span>
      ))}
    </span>
  );
}

function Bind({ bind }: { bind: Bind }) {
  return (
    <div className="kc-bind">
      {bind.tap && <span className="kc-tap">tap</span>}
      <Keys keys={bind.keys} joiner={bind.tap ? '' : '+'} />
      <span className="kc-label">{bind.label}</span>
    </div>
  );
}

export function Controls() {
  return (
    <div className="controls-panel">
      <div className="kc-col">
        <span className="kc-title">Move</span>
        <div className="kc-binds">
          {MOVEMENT.map(b => <Bind key={b.label} bind={b} />)}
        </div>
      </div>
      <div className="kc-divider" />
      <div className="kc-col">
        <span className="kc-title">Fight</span>
        <div className="kc-binds">
          {COMBAT.map(b => <Bind key={b.label} bind={b} />)}
        </div>
      </div>
    </div>
  );
}
