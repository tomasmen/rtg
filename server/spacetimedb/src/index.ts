import { t } from 'spacetimedb/server';
import spacetimedb from './schema';

// index.ts is the module entry. The schema default is re-exported from schema.ts;
// reducers/lifecycle are declared here (and, for larger features, re-exported
// from sibling files that also import the schema from ./schema).
export { default } from './schema';

// Mark a player online when they connect, creating their row on first connect.
export const onConnect = spacetimedb.clientConnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({
      ...existing,
      online: true,
      lastSeen: ctx.timestamp,
      location: 'arcade',
    });
  } else {
    ctx.db.player.insert({
      identity: ctx.sender,
      displayName: '',
      online: true,
      lastSeen: ctx.timestamp,
      location: 'arcade',
    });
  }
});

// Mark a player offline when they disconnect.
export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({
      ...existing,
      online: false,
      lastSeen: ctx.timestamp,
    });
  }
});

// Set (or change) the caller's display name. Names are trimmed and capped.
export const setName = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const trimmed = name.trim().slice(0, 24);
    const existing = ctx.db.player.identity.find(ctx.sender);
    if (existing) {
      ctx.db.player.identity.update({ ...existing, displayName: trimmed });
    } else {
      ctx.db.player.insert({
        identity: ctx.sender,
        displayName: trimmed,
        online: true,
        lastSeen: ctx.timestamp,
        location: 'arcade',
      });
    }
  }
);
