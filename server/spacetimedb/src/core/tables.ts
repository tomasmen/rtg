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
