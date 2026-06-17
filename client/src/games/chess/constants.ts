// Pure presentation constants for the chess board. No rules logic lives here.

// Unicode glyphs keyed by FEN piece char (uppercase = white, lowercase = black).
export const GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

// Square colors (classic light/dark wood-ish neutral palette).
export const LIGHT_SQUARE = '#ebecd0';
export const DARK_SQUARE = '#739552';

// Piece glyph colors — white pieces drawn light with a dark outline, black dark.
export const WHITE_PIECE = '#fafafa';
export const BLACK_PIECE = '#1b1b1b';

// Highlight colors.
export const SELECTED_BG = 'rgba(255, 215, 0, 0.45)';   // currently-picked piece square
export const LAST_MOVE_BG = 'rgba(255, 235, 100, 0.40)'; // from/to of the last move
export const CHECK_BG = 'rgba(231, 76, 60, 0.65)';       // king in check
export const DEST_DOT = 'rgba(20, 20, 20, 0.30)';        // legal destination dot
export const CAPTURE_RING = 'rgba(20, 20, 20, 0.30)';    // legal capture ring

// Sizing (CSS-driven; the board scales to its container, this is the max width).
export const BOARD_MAX_PX = 480;

// Promotion picker order (matches UCI suffix letters q/r/b/n).
export const PROMO_PIECES = ['q', 'r', 'b', 'n'] as const;
export type PromoPiece = (typeof PROMO_PIECES)[number];
