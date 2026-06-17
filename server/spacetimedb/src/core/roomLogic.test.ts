import { describe, it, expect } from 'vitest';
import { nextSlot, isFull, pickOpenRoomId, type OpenRoom } from './roomLogic';

describe('nextSlot', () => {
  it('returns 0 for an empty room', () => expect(nextSlot([], 2)).toBe(0));
  it('returns the lowest free slot', () => expect(nextSlot([0], 2)).toBe(1));
  it('fills gaps left by leavers', () => expect(nextSlot([1], 2)).toBe(0));
  it('returns null when full', () => expect(nextSlot([0, 1], 2)).toBe(null));
});

describe('isFull', () => {
  it('true when member count reaches max', () => expect(isFull(2, 2)).toBe(true));
  it('false when below max', () => expect(isFull(1, 2)).toBe(false));
});

describe('pickOpenRoomId', () => {
  const rooms: OpenRoom[] = [
    { id: 1n, gameId: 'fighter', status: 'waiting', count: 1 },
    { id: 2n, gameId: 'fighter', status: 'active', count: 2 },
    { id: 3n, gameId: 'chess', status: 'waiting', count: 1 },
  ];
  it('picks a waiting, non-full room for the game', () =>
    expect(pickOpenRoomId(rooms, 'fighter', 2)).toBe(1n));
  it('ignores active/full and other games', () =>
    expect(pickOpenRoomId(rooms, 'chess', 2)).toBe(3n));
  it('returns null when none open', () =>
    expect(pickOpenRoomId(rooms, 'pong', 2)).toBe(null));
});
