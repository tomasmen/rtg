// Pure helpers for room logic, decoupled from ctx.db so they are unit-testable.

// The lowest unused seat in [0, maxPlayers), or null if the room is full.
export function nextSlot(usedSlots: number[], maxPlayers: number): number | null {
  for (let s = 0; s < maxPlayers; s++) {
    if (!usedSlots.includes(s)) return s;
  }
  return null;
}

export function isFull(memberCount: number, maxPlayers: number): boolean {
  return memberCount >= maxPlayers;
}

export interface OpenRoom {
  id: bigint;
  gameId: string;
  status: string;
  count: number;
}

// The id of a joinable room for `gameId` (waiting + has space), or null.
export function pickOpenRoomId(
  rooms: OpenRoom[],
  gameId: string,
  maxPlayers: number
): bigint | null {
  const open = rooms.find(
    r => r.gameId === gameId && r.status === 'waiting' && r.count < maxPlayers
  );
  return open ? open.id : null;
}
