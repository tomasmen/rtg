// Module entry: re-export the schema (default) and every reducer/lifecycle hook
// explicitly. Each feature lives in its own file and imports the schema instance
// from ./schema, which keeps this aggregator free of circular dependencies.
// Only spacetime exports (reducers/lifecycle) may be re-exported here — plain
// helpers (e.g. removeFromRooms) must NOT be, or the module loader rejects them.
export { default } from './schema';

export { onConnect, onDisconnect, setName } from './core/presence';
export { createRoom, joinRoom, quickMatch, leaveRoom } from './core/rooms';
export { fighterTick, setInput } from './games/fighter/match';
