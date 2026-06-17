# Chess — Design (second game, turn-based)

**Status:** Approved (2026-06-17). Adds Chess to the arcade as the first
**turn-based** (`realtime: false`) game, exercising the paradigm-agnostic
`GameDef`/dispatch layer built in Phase 2.

**Goal:** A fully legal, playable 1v1 chess game: server-authoritative rules
(no illegal moves possible), standard end conditions, a clean click-to-move
board with legal-move highlighting.

## Architecture

Server-authoritative, turn-based (no scheduled tick). The pure rules engine
lives server-side and is the single source of legality. The server stores the
current legal-move set in the game row so the client can highlight moves
without its own engine.

Flow: `chessMove({uci})` → validate `uci ∈ legalMoves(fen)` and that the caller
owns the side to move → `applyMove` → recompute `legalMoves`/`status` → write the
row. `chessResign()` → other side wins. Seats: **slot 0 = white, slot 1 = black**.

## Data contract (shared by engine, server, client)

- **Board state:** FEN. `START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'`.
- **Move:** UCI string — `'e2e4'`, `'e1g1'` (castle = king's move), `'e7e8q'` (promotion: q/r/b/n suffix).
- **`chess_game` table** (public, one row per room):
  - `roomId u64 pk`
  - `fen string`
  - `turn string` — `'w'`|`'b'` (side to move)
  - `status string` — `'active'|'checkmate'|'stalemate'|'draw'|'resigned'`
  - `winner i8` — `-1` none/draw, `0` white, `1` black
  - `legalMoves string` — comma-separated UCI for the side to move (`''` when game over)
  - `lastMove string` — UCI of the last move (`''` initially) for highlighting
  - `check bool` — side to move is in check
- **Reducers:** `chessMove({ uci: t.string() })`, `chessResign()`.

## Rules engine API (`games/chess/rules.ts`, PURE — runs inside a reducer)

```ts
export const START_FEN: string;
export function legalMoves(fen: string): string[];          // all legal UCI for side to move
export function applyMove(fen: string, uci: string): string; // resulting FEN (assumes uci legal)
export function status(fen: string): { state: 'active' | 'checkmate' | 'stalemate' | 'draw'; winner: number; check: boolean };
```

- Full move generation for every piece incl. **castling** (rights + can't castle through/into/out of check, squares empty), **en passant**, **promotion** (4 moves q/r/b/n).
- Legality: a move is legal only if it does not leave the mover's king in check.
- `status`: no legal moves → `checkmate` (winner = side that just moved) if in check, else `stalemate` (draw). Else `draw` on fifty-move (halfmove clock ≥ 100) or insufficient material (K vs K, K+minor vs K). Else `active`. `check` = side to move attacked.
- **Determinism:** no Date/Math.random/IO (runs in a SpacetimeDB reducer). Pure functions only.
- **Correctness gate — perft** (count legal-move leaf nodes at depth d; the standard engine test):
  - startpos: perft(1)=20, perft(2)=400, perft(3)=8902
  - Kiwipete `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1`: perft(1)=48, perft(2)=2039, perft(3)=97862

Out of scope for v1 (note as follow-ups): threefold repetition, draw offers, clocks.

## Files

**Server (`server/spacetimedb/src/games/chess/`)**
- `rules.ts` (pure engine) + `rules.test.ts` (per-piece, special moves, mate/stalemate/draw, **perft**).
- `tables.ts` — `chessGame` table.
- `match.ts` — `startChessGame`/`endChessGame`, `chessMove`/`chessResign` reducers.
- Wire `schema.ts` (register `chessGame`), `index.ts` (export reducers), `games/registry.ts` (add chess `GameDef`, `realtime:false`), `games/dispatch.ts` (start/end chess).

**Client (`client/src/games/chess/`)**
- `boardModel.ts` (pure: FEN→8×8, square↔index, `destsFrom(legalMoves, sq)`, promotion detection) + `boardModel.test.ts`.
- `Board.tsx` — 8×8 render (Unicode glyphs), click-to-move + legal-dest highlight + last-move/check highlight + promotion picker, board flips to the local color.
- `ChessGame.tsx` — reads `chessGame` row, wires `onMove`→`chessMove`, status banner, resign, result.
- `client/src/games/registry.ts` — add chess tile; `arcade/WaitingRoom.tsx` — route chess rooms to `ChessGame`.

## Verification

All vitest green incl. perft; both packages typecheck/build; publish to Maincloud
(+ `--delete-data` fallback for the schema change); live: two clients, play moves
(legal-only enforced, highlights correct), reach a checkmate and a resign, clean teardown.
