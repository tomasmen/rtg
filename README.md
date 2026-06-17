# Office Arcade

**▶ Live:** https://tomasmen.github.io/rtg/ · **Backend dashboard:** https://spacetimedb.com/rtg

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

## Deployment (automatic)

Every push to `master` auto-deploys via GitHub Actions (`.github/workflows/deploy.yml`):

1. **`publish-module`** — installs the SpacetimeDB CLI, authenticates with the
   `SPACETIME_TOKEN` repo secret, and `spacetime publish`es the module to
   **Maincloud** (hot-swap — connected players stay connected).
2. **`deploy-client`** — builds the client (pointed at `wss://maincloud.spacetimedb.com`)
   and deploys it to **GitHub Pages** at https://tomasmen.github.io/rtg/.

`ci.yml` typechecks both packages and builds the client on every push/PR.

To deploy a backend-only change locally instead: `spacetime publish rtg --server maincloud -p server/spacetimedb -y`.
