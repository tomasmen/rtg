import { table, t } from 'spacetimedb/server';

// A player in the arcade. One row per identity, which persists across
// reconnects (the client restores its identity from a saved token).
// `location` is 'arcade' for now; later it becomes e.g. 'fighter:<roomId>'.
export const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    online: t.bool(),
    lastSeen: t.timestamp(),
    location: t.string(),
  }
);

// A room groups players for one game session. status: waiting → active → finished.
export const gameRoom = table(
  { name: 'game_room', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    gameId: t.string().index('btree'),
    status: t.string(),
    createdBy: t.identity(),
    createdAt: t.timestamp(),
  }
);

// Membership of a player in a room. `slot` is the player's seat (0..maxPlayers-1).
export const roomMember = table(
  { name: 'room_member', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    identity: t.identity().index('btree'),
    slot: t.u8(),
  }
);
