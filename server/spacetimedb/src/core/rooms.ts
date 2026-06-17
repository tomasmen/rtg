import { t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { getGame } from '../games/registry';
import { nextSlot, isFull, pickOpenRoomId, type OpenRoom } from './roomLogic';
import { startGame, endGame } from '../games/dispatch';

// ctx is the SpacetimeDB ReducerContext; typed as `any` here because its precise
// generic type is module-internal. DB shape is enforced at the table layer.

function inARoom(ctx: any): boolean {
  return [...ctx.db.roomMember.identity.filter(ctx.sender)].length > 0;
}

function setLocation(ctx: any, location: string): void {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, location });
}

// Create a fresh waiting room for `gameId`, seat the caller at slot 0.
function doCreateRoom(ctx: any, gameId: string): void {
  const game = getGame(gameId);
  if (!game) throw new Error(`unknown game: ${gameId}`);
  const room = ctx.db.gameRoom.insert({
    id: 0n,
    gameId,
    status: 'waiting',
    createdBy: ctx.sender,
    createdAt: ctx.timestamp,
  });
  ctx.db.roomMember.insert({ id: 0n, roomId: room.id, identity: ctx.sender, slot: 0 });
  setLocation(ctx, `${gameId}:${room.id}`);
}

// Seat the caller in an existing waiting room; activate it when it fills.
function doJoinRoom(ctx: any, roomId: bigint): void {
  const room = ctx.db.gameRoom.id.find(roomId);
  if (!room) throw new Error('no such room');
  if (room.status !== 'waiting') throw new Error('room not joinable');
  const game = getGame(room.gameId);
  if (!game) throw new Error('unknown game');
  const current = [...ctx.db.roomMember.roomId.filter(roomId)];
  const slot = nextSlot(current.map((m: any) => m.slot), game.maxPlayers);
  if (slot === null) throw new Error('room full');
  ctx.db.roomMember.insert({ id: 0n, roomId, identity: ctx.sender, slot });
  setLocation(ctx, `${room.gameId}:${roomId}`);
  if (isFull(current.length + 1, game.maxPlayers)) {
    const active = { ...room, status: 'active' };
    ctx.db.gameRoom.id.update(active);
    startGame(ctx, active);
  }
}

// Remove the caller from any room; delete empty rooms, finish active ones.
// Shared by leaveRoom and onDisconnect.
export function removeFromRooms(ctx: any): void {
  const mine = [...ctx.db.roomMember.identity.filter(ctx.sender)];
  for (const m of mine) {
    const room = ctx.db.gameRoom.id.find(m.roomId);
    ctx.db.roomMember.id.delete(m.id);
    if (room) {
      const remaining = [...ctx.db.roomMember.roomId.filter(m.roomId)];
      if (remaining.length === 0) {
        // Last member left: tear down any game-specific state (fighter/match/
        // tick/input rows) before deleting the room. endGame is idempotent, so
        // this is safe whether the room was waiting, active, or finished — and
        // fixes finished matches leaking orphaned fighter rows.
        endGame(ctx, room);
        ctx.db.gameRoom.id.delete(room.id);
      } else if (room.status === 'active') {
        endGame(ctx, room);
        ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
      }
    }
  }
}

export const createRoom = spacetimedb.reducer({ gameId: t.string() }, (ctx, { gameId }) => {
  if (inARoom(ctx)) throw new Error('already in a room');
  doCreateRoom(ctx, gameId);
});

export const joinRoom = spacetimedb.reducer({ roomId: t.u64() }, (ctx, { roomId }) => {
  if (inARoom(ctx)) throw new Error('already in a room');
  doJoinRoom(ctx, roomId);
});

export const quickMatch = spacetimedb.reducer({ gameId: t.string() }, (ctx, { gameId }) => {
  const game = getGame(gameId);
  if (!game) throw new Error(`unknown game: ${gameId}`);
  if (inARoom(ctx)) throw new Error('already in a room');
  const open: OpenRoom[] = [...ctx.db.gameRoom.iter()].map((r: any) => ({
    id: r.id,
    gameId: r.gameId,
    status: r.status,
    count: [...ctx.db.roomMember.roomId.filter(r.id)].length,
  }));
  const target = pickOpenRoomId(open, gameId, game.maxPlayers);
  if (target === null) doCreateRoom(ctx, gameId);
  else doJoinRoom(ctx, target);
});

export const leaveRoom = spacetimedb.reducer(ctx => {
  removeFromRooms(ctx);
  setLocation(ctx, 'arcade');
});
