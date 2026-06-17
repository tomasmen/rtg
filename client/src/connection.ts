import { DbConnection } from './module_bindings';

// Connection target. Defaults to the local `spacetime start` server + the `rtg`
// database; CI overrides these for the Maincloud deploy via Vite env vars.
const URI = import.meta.env.VITE_STDB_URI ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_STDB_DB ?? 'rtg';
const TOKEN_KEY = 'rtg_stdb_token';

// Reuse a saved token so the same browser keeps a stable identity across reloads.
const savedToken = localStorage.getItem(TOKEN_KEY);

let builder = DbConnection.builder().withUri(URI).withDatabaseName(DB_NAME);
if (savedToken) {
  builder = builder.withToken(savedToken);
}

export const connectionBuilder = builder
  .onConnect((_conn, _identity, token) => {
    localStorage.setItem(TOKEN_KEY, token);
  })
  .onConnectError((_ctx, err) => {
    console.error('SpacetimeDB connection error:', err);
  });
