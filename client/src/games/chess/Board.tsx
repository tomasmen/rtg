import { useState, useEffect, useRef } from 'react';
import {
  parseFen,
  squareToIndex,
  indexToSquare,
  pieceColor,
  destsFrom,
  isPromotion,
  fromTo,
  findKingIndex,
  type Color,
} from './boardModel';
import {
  GLYPHS,
  LIGHT_SQUARE,
  DARK_SQUARE,
  WHITE_PIECE,
  BLACK_PIECE,
  SELECTED_BG,
  LAST_MOVE_BG,
  CHECK_BG,
  PREMOVE_BG,
  PROMO_PIECES,
  type PromoPiece,
} from './constants';

export interface BoardProps {
  /** FEN of the current position (full FEN; only the board + side-to-move are used). */
  fen: string;
  /** Legal UCI moves for the side to move (server-supplied). */
  legalMoves: string[];
  /** UCI of the last move played, '' if none — highlights from/to squares. */
  lastMove: string;
  /** Whether the side to move is in check — highlights that side's king. */
  check: boolean;
  /** Board orientation; 'black' puts black pieces at the bottom. */
  orientation: 'white' | 'black';
  /** When true it's my turn — clicks/drags make real moves. */
  interactive: boolean;
  /** When true I may queue a premove (game active, opponent to move, I'm a player). */
  premovable: boolean;
  /** My colour, for identifying my pieces while premoving. */
  myColor: Color | null;
  /** Called with a full UCI string (incl. promotion suffix) when a move is chosen. */
  onMove: (uci: string) => void;
}

// Side to move from the FEN's second field ('w' | 'b'), defaulting to white.
function sideToMove(fen: string): Color {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

// The algebraic square under a viewport point (or null), via the .chess-sq DOM.
function squareFromPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const sq = el?.closest?.('.chess-sq') as HTMLElement | null;
  return sq?.getAttribute('aria-label') ?? null;
}

interface DragState { from: string; x: number; y: number; premove: boolean; }

export function Board({
  fen,
  legalMoves,
  lastMove,
  check,
  orientation,
  interactive,
  premovable,
  myColor,
  onMove,
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const cells = parseFen(fen);
  const turn = sideToMove(fen);

  // Reset transient selection on position / interactivity change. The queued
  // premove deliberately PERSISTS across the opponent's move.
  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [fen, interactive]);

  // When it becomes my turn, fire the queued premove if it's now legal
  // (auto-queen on promotion); otherwise discard it.
  useEffect(() => {
    if (!interactive || !premove) return;
    const { from, to } = premove;
    const match =
      legalMoves.find(m => m.length === 5 && m.slice(0, 2) === from && m.slice(2, 4) === to && m[4] === 'q') ??
      legalMoves.find(m => m.length === 4 && m.slice(0, 2) === from && m.slice(2, 4) === to);
    setPremove(null);
    if (match) onMove(match);
  }, [interactive, premove, legalMoves, onMove]);

  // Drop a stale premove if the game is no longer in a premovable/active state.
  useEffect(() => {
    if (!premovable && !interactive) setPremove(null);
  }, [premovable, interactive]);

  const last = lastMove ? fromTo(lastMove) : null;
  const checkKingIdx = check ? findKingIndex(cells, turn) : -1;
  const dests = selected && interactive ? destsFrom(legalMoves, selected) : [];
  const destSet = new Set(dests);

  function attempt(from: string, to: string) {
    if (isPromotion(legalMoves, from, to)) {
      setPromo({ from, to });
    } else {
      onMove(from + to);
      setSelected(null);
    }
  }

  // Window-level pointer move/up while a drag is in flight.
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const destRef = useRef<Set<string>>(destSet);
  destRef.current = destSet;

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) =>
      setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const target = squareFromPoint(e.clientX, e.clientY);
      if (d.premove) {
        // queue a premove (any target square; validated when it's our turn)
        if (target && target !== d.from) {
          setPremove({ from: d.from, to: target });
          setSelected(null);
        } else if (target !== d.from) {
          setSelected(null);
        }
        // dropping back on the origin keeps the piece "selected" for a click target
      } else if (target && destRef.current.has(target)) {
        attempt(d.from, target);
      } else if (target !== d.from) {
        setSelected(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  function onSquarePointerDown(sq: string, e: React.PointerEvent) {
    if (promo) return;
    const idx = squareToIndex(sq);
    const piece = cells[idx];
    const pcolor = pieceColor(piece);

    if (interactive) {
      // complete a click move onto a highlighted destination
      if (selected && destSet.has(sq)) {
        e.preventDefault();
        attempt(selected, sq);
        return;
      }
      // pick up one of my pieces (select + begin drag)
      if (piece && pcolor === turn) {
        e.preventDefault();
        setSelected(sq);
        setDrag({ from: sq, x: e.clientX, y: e.clientY, premove: false });
        return;
      }
      setSelected(null);
      return;
    }

    if (premovable && myColor) {
      // pick up my piece to premove (select + begin premove-drag)
      if (piece && pcolor === myColor) {
        e.preventDefault();
        setSelected(sq);
        setPremove(null);
        setDrag({ from: sq, x: e.clientX, y: e.clientY, premove: true });
        return;
      }
      // click a target after a premove-from is selected
      if (selected) {
        e.preventDefault();
        if (sq !== selected) setPremove({ from: selected, to: sq });
        setSelected(null);
        return;
      }
      // click elsewhere clears a queued premove
      setPremove(null);
      return;
    }
  }

  function choosePromo(p: PromoPiece) {
    if (!promo) return;
    onMove(promo.from + promo.to + p);
    setPromo(null);
    setSelected(null);
  }

  // Render order: white-orientation 0..63 (a8..h1); black reverses.
  const order: number[] = [];
  for (let i = 0; i < 64; i++) order.push(i);
  if (orientation === 'black') order.reverse();

  const draggedPiece = drag ? cells[squareToIndex(drag.from)] : '';

  return (
    <div className="chess" role="grid" aria-label="chess board">
      <div className="chess-board">
        {order.map((idx, pos) => {
          const sq = indexToSquare(idx);
          const file = idx % 8;
          const rank = Math.floor(idx / 8);
          const isLight = (file + rank) % 2 === 0;
          const piece = cells[idx];
          const pcolor = pieceColor(piece);

          const visualRow = Math.floor(pos / 8);
          const visualCol = pos % 8;

          const isSelected = selected === sq;
          const isDest = destSet.has(sq);
          const isLastFrom = last?.from === sq;
          const isLastTo = last?.to === sq;
          const isCheck = idx === checkKingIdx;
          const isPremove = premove?.from === sq || premove?.to === sq;
          const isDragging = drag?.from === sq;

          const bg = isLight ? LIGHT_SQUARE : DARK_SQUARE;
          const overlay = isCheck
            ? CHECK_BG
            : isSelected
              ? SELECTED_BG
              : isPremove
                ? PREMOVE_BG
                : isLastFrom || isLastTo
                  ? LAST_MOVE_BG
                  : null;

          const classes = ['chess-sq', isLight ? 'light' : 'dark'];
          if (isDest) classes.push(piece ? 'dest-capture' : 'dest');
          if (interactive || premovable) classes.push('clickable');

          return (
            <div
              key={sq}
              className={classes.join(' ')}
              style={{ background: bg }}
              role="gridcell"
              aria-label={sq}
              onPointerDown={e => onSquarePointerDown(sq, e)}
            >
              {overlay && <div className="chess-overlay" style={{ background: overlay }} />}
              {visualRow === 7 && <span className="coord file-coord">{sq[0]}</span>}
              {visualCol === 0 && <span className="coord rank-coord">{sq[1]}</span>}
              {piece && !isDragging && (
                <span
                  className="chess-piece"
                  style={{ color: pcolor === 'w' ? WHITE_PIECE : BLACK_PIECE }}
                >
                  {GLYPHS[piece] ?? ''}
                </span>
              )}
              {isDest && <span className="chess-dot" aria-hidden="true" />}

              {promo && promo.to === sq && (
                <div className="promo-picker" role="menu" aria-label="promote to">
                  {PROMO_PIECES.map(p => {
                    const glyphKey = turn === 'w' ? p.toUpperCase() : p;
                    return (
                      <button
                        key={p}
                        type="button"
                        className="promo-choice"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation();
                          choosePromo(p);
                        }}
                        style={{ color: turn === 'w' ? WHITE_PIECE : BLACK_PIECE }}
                      >
                        {GLYPHS[glyphKey]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating piece that follows the cursor while dragging. */}
      {drag && draggedPiece && (
        <span
          className="chess-drag-piece"
          style={{
            left: drag.x,
            top: drag.y,
            color: pieceColor(draggedPiece) === 'w' ? WHITE_PIECE : BLACK_PIECE,
          }}
        >
          {GLYPHS[draggedPiece]}
        </span>
      )}
    </div>
  );
}
