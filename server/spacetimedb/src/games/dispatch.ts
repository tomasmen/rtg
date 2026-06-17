import { startFightMatch, endFightMatch } from './fighter/match';
import { startChessGame, endChessGame } from './chess/match';

// Generic hooks the room lifecycle calls when a room activates/finishes.
// Switch on gameId so core/rooms stays game-agnostic.
export function startGame(ctx: any, room: any): void {
  if (room.gameId === 'fighter') startFightMatch(ctx, room.id);
  else if (room.gameId === 'chess') startChessGame(ctx, room.id);
}

export function endGame(ctx: any, room: any): void {
  if (room.gameId === 'fighter') endFightMatch(ctx, room.id);
  else if (room.gameId === 'chess') endChessGame(ctx, room.id);
}
