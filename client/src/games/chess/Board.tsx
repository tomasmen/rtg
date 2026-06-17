import { useState, useEffect } from 'react';
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
  PROMO_PIECES,
  type PromoPiece,
} from './constants';

export interface BoardProps {
  /** FEN of the current position (full FEN; only the board + side-to-move are used). */
  fen: string;
  /** Comma-free list of legal UCI moves for the side to move (server-supplied). */
  legalMoves: string[];
  /** UCI of the last move played, '' if none — highlights from/to squares. */
  lastMove: string;
  /** Whether the side to move is in check — highlights that side's king. */
  check: boolean;
  /** Board orientation; 'black' puts black pieces at the bottom. */
  orientation: 'white' | 'black';
  /** When false, clicks do nothing (spectating / not your turn). */
  interactive: boolean;
  /** Called with a full UCI string (incl. promotion suffix) when a move is chosen. */
  onMove: (uci: string) => void;
}

// Side to move from the FEN's second field ('w' | 'b'), defaulting to white.
function sideToMove(fen: string): Color {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

export function Board({
  fen,
  legalMoves,
  lastMove,
  check,
  orientation,
  interactive,
  onMove,
}: BoardProps) {
  // Currently-selected from-square (algebraic) and a pending promotion choice.
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);

  // Reset transient selection whenever the position or interactivity changes
  // (e.g. after a move lands, or it stops being our turn).
  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [fen, interactive]);

  const cells = parseFen(fen);
  const turn = sideToMove(fen);

  // Squares to highlight.
  const last = lastMove ? fromTo(lastMove) : null;
  const checkKingIdx = check ? findKingIndex(cells, turn) : -1;
  const dests = selected ? destsFrom(legalMoves, selected) : [];
  const destSet = new Set(dests);

  function attempt(from: string, to: string) {
    if (isPromotion(legalMoves, from, to)) {
      setPromo({ from, to });
    } else {
      onMove(from + to);
      setSelected(null);
    }
  }

  function handleSquareClick(sq: string) {
    if (!interactive || promo) return;
    const idx = squareToIndex(sq);
    const piece = cells[idx];

    // Completing a move onto a highlighted destination.
    if (selected && destSet.has(sq)) {
      attempt(selected, sq);
      return;
    }

    // Selecting / re-selecting one of our own pieces.
    if (piece && pieceColor(piece) === turn) {
      setSelected(prev => (prev === sq ? null : sq));
      return;
    }

    // Clicking empty / opponent / non-destination square deselects.
    setSelected(null);
  }

  function choosePromo(p: PromoPiece) {
    if (!promo) return;
    onMove(promo.from + promo.to + p);
    setPromo(null);
    setSelected(null);
  }

  // Render order: top row first. White-orientation goes index 0..63 (a8..h1);
  // black-orientation reverses so black sits at the bottom.
  const order: number[] = [];
  for (let i = 0; i < 64; i++) order.push(i);
  if (orientation === 'black') order.reverse();

  return (
    <div className="chess" role="grid" aria-label="chess board">
      <div className="chess-board">
        {order.map((idx, pos) => {
          const sq = indexToSquare(idx);
          const file = idx % 8;
          const rank = Math.floor(idx / 8); // 0 = rank8 row ... 7 = rank1 row
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

          const bg = isLight ? LIGHT_SQUARE : DARK_SQUARE;
          // Layered tints (check > selected > last move).
          const overlay = isCheck
            ? CHECK_BG
            : isSelected
              ? SELECTED_BG
              : isLastFrom || isLastTo
                ? LAST_MOVE_BG
                : null;

          const classes = ['chess-sq', isLight ? 'light' : 'dark'];
          if (isDest) classes.push(piece ? 'dest-capture' : 'dest');
          if (interactive) classes.push('clickable');

          return (
            <div
              key={sq}
              className={classes.join(' ')}
              style={{ background: bg }}
              role="gridcell"
              aria-label={sq}
              onClick={() => handleSquareClick(sq)}
            >
              {overlay && (
                <div className="chess-overlay" style={{ background: overlay }} />
              )}
              {/* File label on the bottom visual row; rank label on the left column. */}
              {visualRow === 7 && (
                <span className="coord file-coord">{sq[0]}</span>
              )}
              {visualCol === 0 && (
                <span className="coord rank-coord">{sq[1]}</span>
              )}
              {piece && (
                <span
                  className="chess-piece"
                  style={{ color: pcolor === 'w' ? WHITE_PIECE : BLACK_PIECE }}
                >
                  {GLYPHS[piece] ?? ''}
                </span>
              )}
              {isDest && <span className="chess-dot" aria-hidden="true" />}

              {/* Inline promotion picker anchored on the target square. */}
              {promo && promo.to === sq && (
                <div className="promo-picker" role="menu" aria-label="promote to">
                  {PROMO_PIECES.map(p => {
                    // Glyph for the picker matches the side to move's color.
                    const glyphKey = turn === 'w' ? p.toUpperCase() : p;
                    return (
                      <button
                        key={p}
                        type="button"
                        className="promo-choice"
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
    </div>
  );
}
