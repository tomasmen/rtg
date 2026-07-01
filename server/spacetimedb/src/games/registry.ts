// A registered game. `realtime` decides whether it gets a high-frequency tick
// (the fighter) or is turn-based (a future artillery game). Phase 2 uses only
// the metadata; per-game tick/table wiring arrives with each game.
export interface GameDef {
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  realtime: boolean;
}

export const GAMES: readonly GameDef[] = [
  { id: 'fighter', displayName: 'Fighter', minPlayers: 2, maxPlayers: 2, realtime: true },
  { id: 'chess', displayName: 'Chess', minPlayers: 2, maxPlayers: 2, realtime: false },
  { id: 'monopoly', displayName: 'Monopoly', minPlayers: 2, maxPlayers: 6, realtime: false },
];

export function getGame(id: string): GameDef | undefined {
  return GAMES.find(g => g.id === id);
}
