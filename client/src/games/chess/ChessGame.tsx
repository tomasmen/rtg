import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import { Board } from './Board';

// Binding glue around the pure <Board>: reads the chess_game row, enforces
// nothing itself (the server is authoritative), wires clicks to chessMove, and
// shows turn/result + resign/leave.
export function ChessGame({ roomId }: { roomId: bigint }) {
  const { identity } = useSpacetimeDB();
  const [games] = useTable(tables.chessGame);
  const [members] = useTable(tables.roomMember);
  const chessMove = useReducer(reducers.chessMove);
  const chessResign = useReducer(reducers.chessResign);
  const leaveRoom = useReducer(reducers.leaveRoom);

  const game = games.find(g => g.roomId === roomId);
  const myHex = identity?.toHexString();
  const me = members.find(m => m.roomId === roomId && m.identity.toHexString() === myHex);
  const mySlot = me ? me.slot : -1;
  const myColor = mySlot === 0 ? 'w' : mySlot === 1 ? 'b' : null;

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

  const statusText = (() => {
    switch (game.status) {
      case 'active': {
        const toMove = game.turn === 'w' ? 'White' : 'Black';
        const yours = game.turn === myColor;
        return `${game.check ? 'Check! ' : ''}${yours ? 'Your move' : `${toMove} to move`}`;
      }
      case 'checkmate':
        return game.winner === mySlot ? 'Checkmate — you win! 🏆' : 'Checkmate — you lose';
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

  return (
    <section className="chess">
      <div className="chess-status">{statusText}</div>
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
      <div className="chess-controls">
        {!over && <button onClick={() => void chessResign()}>Resign</button>}
        <button onClick={() => void leaveRoom()}>{over ? 'Back to arcade' : 'Leave'}</button>
      </div>
    </section>
  );
}
