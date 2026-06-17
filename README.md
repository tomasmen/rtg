# Office Arcade

A browser-based, real-time multiplayer **office arcade** built on
[SpacetimeDB](https://spacetimedb.com). Open a URL, see who's online, pick a
game, and play. First game: a networked 1v1 2D fighter. Built so more games
(including a future turn-based artillery game) drop in cleanly.

**Stack:** all-TypeScript · SpacetimeDB module (server logic + DB) → Maincloud ·
Vite + React client → GitHub Pages. The browser connects directly to the
database over `wss://` — there is no separate API server.

## Layout

```
server/spacetimedb/   SpacetimeDB TypeScript module (tables, reducers) → WASM
client/               Vite + React client (connects directly to the DB)
docs/superpowers/     design spec + implementation plans
```

## Local development

Prereqs: Node 24+, the `spacetime` CLI (`curl -sSf https://install.spacetimedb.com | sh`), and `spacetime login`.

```bash
npm run install:all     # install server + client deps
npm run dev:server      # spacetime dev: builds, publishes locally, hot-reloads, regenerates bindings
npm run dev:client      # vite dev server for the client (separate terminal)
```

`spacetime dev` hot-swaps the module on save without disconnecting clients.

## Deployment

Pushing to the default branch auto-deploys via GitHub Actions: the module is
published to SpacetimeDB Maincloud and the client is built and deployed to
GitHub Pages. (Set up in Phase 1 — see `docs/superpowers/plans/`.)
