import { useState, useEffect, useRef } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import { Board } from './Board';

// Live remaining ms for `color`, ticking down if it's that side's turn.
function clockMs(game: any, color: string): number {
  const stored = Number(color === 'w' ? game.whiteMs : game.blackMs);
  if (game.turn === color && game.status === 'active') {
    const turnStartMs = Number(game.turnStartMicros / 1000n);
    return Math.max(0, stored - (Date.now() - turnStartMs));
  }
  return Math.max(0, stored);
}

function fmtClock(ms: number): string {
  if (ms < 10000) return (ms / 1000).toFixed(1);
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function ChessGame({ roomId }: { roomId: bigint }) {
  const { identity } = useSpacetimeDB();
  const [games] = useTable(tables.chessGame);
  const [members] = useTable(tables.roomMember);
  const chessMove = useReducer(reducers.chessMove);
  const chessResign = useReducer(reducers.chessResign);
  const chessClaimTimeout = useReducer(reducers.chessClaimTimeout);
  const leaveRoom = useReducer(reducers.leaveRoom);

  const game = games.find(g => g.roomId === roomId);
  const myHex = identity?.toHexString();
  const me = members.find(m => m.roomId === roomId && m.identity.toHexString() === myHex);
  const mySlot = me ? me.slot : -1;
  const myColor = mySlot === 0 ? 'w' : mySlot === 1 ? 'b' : null;

  // Drive the clock display + claim a flag fall when the side to move runs out.
  const gameRef = useRef(game);
  gameRef.current = game;
  const [, forceTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      const g = gameRef.current;
      if (!g || !g.clocked || g.status !== 'active') return;
      forceTick(n => n + 1);
      const stored = Number(g.turn === 'w' ? g.whiteMs : g.blackMs);
      const turnStartMs = Number(g.turnStartMicros / 1000n);
      if (stored - (Date.now() - turnStartMs) <= 0) void chessClaimTimeout();
    }, 250);
    return () => clearInterval(iv);
  }, [chessClaimTimeout]);

  if (!game) {
    return (
      <section className="chess">
        <p className="muted">Setting up the board…</p>
        <button onClick={() => void leaveRoom()}>Leave</button>
      </section>
    );
  }

  const legal = game.legalMoves ? game.legalMoves.split(',') : [];
  const over = game.status !== 'active';
  const interactive = game.status === 'active' && myColor != null && game.turn === myColor;
  const premovable = game.status === 'active' && myColor != null && game.turn !== myColor;
  const oppColor = myColor === 'w' ? 'b' : 'w';

  const statusText = (() => {
    switch (game.status) {
      case 'active': {
        const toMove = game.turn === 'w' ? 'White' : 'Black';
        return `${game.check ? 'Check! ' : ''}${game.turn === myColor ? 'Your move' : `${toMove} to move`}`;
      }
      case 'checkmate':
        return game.winner === mySlot ? 'Checkmate — you win! 🏆' : 'Checkmate — you lose';
      case 'timeout':
        return game.winner === mySlot ? 'You win on time! 🏆' : 'Out of time — you lose';
      case 'resigned':
        return game.winner === mySlot ? 'Opponent resigned — you win! 🏆' : 'You resigned';
      case 'stalemate':
        return 'Stalemate — draw';
      case 'draw':
        return 'Draw';
      default:
        return game.status;
    }
  })();

  const Clock = ({ color }: { color: string }) => {
    const ms = clockMs(game, color);
    const active = game.status === 'active' && game.turn === color;
    const low = game.clocked && ms < 10000;
    return (
      <div className={`chess-clock${active ? ' active' : ''}${low ? ' low' : ''}`}>
        {fmtClock(ms)}
      </div>
    );
  };

  return (
    <section className="chess">
      <div className="chess-status">{statusText}</div>
      {game.clocked && myColor && <Clock color={oppColor} />}
      <Board
        fen={game.fen}
        legalMoves={legal}
        lastMove={game.lastMove}
        check={game.check}
        orientation={myColor === 'b' ? 'black' : 'white'}
        interactive={interactive}
        premovable={premovable}
        myColor={myColor}
        onMove={(uci) => void chessMove({ uci })}
      />
      {game.clocked && myColor && <Clock color={myColor} />}
      <div className="chess-controls">
        {!over && <button onClick={() => void chessResign()}>Resign</button>}
        <button onClick={() => void leaveRoom()}>{over ? 'Back to arcade' : 'Leave'}</button>
      </div>
    </section>
  );
}
