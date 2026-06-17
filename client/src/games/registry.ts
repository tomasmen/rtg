// Client-side game metadata for the arcade tiles. Mirrors the public bits of
// the server registry.
export interface GameMeta {
  id: string;
  displayName: string;
  blurb: string;
}

export const GAMES: GameMeta[] = [
  { id: 'fighter', displayName: '🥊 Fighter', blurb: 'Networked 1v1 brawl' },
];

// Each playable game implements this in Phase 3+ (canvas mount/unmount).
export interface GameClient {
  mount(container: HTMLElement, roomId: bigint): void;
  unmount(): void;
}
