# Phase 1 — Foundation & Autonomous Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the office-arcade monorepo with a minimal-but-real SpacetimeDB TypeScript backend (Player + presence) and a connected React client, wired to fully autonomous CI/CD that publishes the backend to Maincloud and deploys the frontend to GitHub Pages on every push.

**Architecture:** Single SpacetimeDB module (one Maincloud database) holding a `core/` layer; a Vite + React static client that connects directly to the database over `wss://`. GitHub Actions publishes the module and deploys the static client. This phase deliberately ships the autonomous pipeline first, so every later phase auto-deploys.

**Tech Stack:** TypeScript everywhere · SpacetimeDB 2.6 (TS server module → WASM) · Vite + React · npm workspaces · GitHub Actions · GitHub Pages · SpacetimeDB Maincloud.

**Reference spec:** `docs/superpowers/specs/2026-06-17-office-arcade-design.md`

**Confirmed environment:** node v24, npm 11, `spacetime` CLI 2.6.0, `gh` authed as `tomasmen`, `spacetime login` done (identity `c2004d…2988d`). Repo is a fresh git repo on `master` with one commit (the spec).

**API note:** SpacetimeDB 2.x TS module API used below (confirmed from official docs): `schema({...})`, `table({ name, ... }, { col: t.type()... })`, `t.identity()/t.string()/t.bool()/t.timestamp()/t.u64()`, `.primaryKey()`, `.autoInc()`, lifecycle reducers `client_connected`/`client_disconnected`, and `spacetimedb.reducer({args}, (ctx,args)=>{})`. **Task 1 verifies the exact template shape**; if the scaffolded template differs, reconcile the snippets in Tasks 2–3 to the real generated API before writing more code (do not fight the template).

---

## File structure (created this phase)

```
rtg/
├── package.json                  npm workspaces root
├── .gitignore
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              schema() aggregation + module entry
│       └── core/
│           ├── tables.ts         Player table
│           └── presence.ts       client_connected/disconnected + set_name
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts            base = '/<repo>/'
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── connection.ts         DbConnection builder (URI/module from env)
│       ├── module_bindings/      generated (committed)
│       └── App.tsx               name entry + online-players list
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
└── README.md
```

---

### Task 1: Scaffold the monorepo and a buildable SpacetimeDB TS module

**Files:**
- Create: `package.json` (root, workspaces), `.gitignore`, `README.md`
- Create/confirm: `server/` via `spacetime` scaffolding

- [ ] **Step 1: Inspect the TS module template options**

Run: `spacetime init --help` and `spacetime dev --help`
Expected: confirm how to scaffold a TypeScript **server module** (e.g. `spacetime init --lang typescript server` or a `--template`). Note the exact command and the generated file layout.

- [ ] **Step 2: Scaffold the server module**

Use the command discovered in Step 1 to generate the module into `server/`. Then read every generated file to learn the real API surface (exact import paths, how `schema`/`table`/`reducer` are exposed in 2.6.0).
Expected: a `server/` dir with a sample table + reducer that `spacetime build` accepts.

- [ ] **Step 3: Write the root workspace package.json**

```json
{
  "name": "rtg",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["server", "client"],
  "scripts": {
    "dev:server": "spacetime dev --project-path server",
    "typecheck": "npm run -ws --if-present typecheck",
    "test": "npm run -ws --if-present test",
    "build:client": "npm -w client run build"
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
*.wasm
.spacetime/
.DS_Store
*.local
```
(Keep `client/src/module_bindings/` tracked — bindings are committed.)

- [ ] **Step 5: Build the module to verify the toolchain**

Run: `spacetime build --project-path server` (or the equivalent confirmed in Step 1)
Expected: a successful WASM build with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo + spacetimedb ts module"
```

---

### Task 2: Define the `Player` core table + presence lifecycle

**Files:**
- Create: `server/src/core/tables.ts`, `server/src/core/presence.ts`
- Modify: `server/src/index.ts` (aggregate schema, export reducers)

Reconcile the exact API with the template from Task 1 before writing.

- [ ] **Step 1: Define the Player table** (`server/src/core/tables.ts`)

```ts
import { table, t } from 'spacetimedb';

export const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    online: t.bool(),
    lastSeen: t.timestamp(),
    location: t.string(), // 'arcade' for now
  }
);
```

- [ ] **Step 2: Presence + naming reducers** (`server/src/core/presence.ts`)

```ts
// client_connected: upsert player row, mark online, location 'arcade'.
// client_disconnected: mark player offline, update lastSeen.
// set_name(name): update the caller's displayName.
// Use ctx.sender (caller identity) and ctx.timestamp per the template's API.
```
Implement the three reducers using the real lifecycle hook names/signatures confirmed in Task 1 (`client_connected`, `client_disconnected`, and a `set_name` reducer taking `{ name: t.string() }`). Upsert by checking `ctx.db.player.identity.find(ctx.sender)`.

- [ ] **Step 3: Aggregate in `index.ts`**

Wire `schema({ player })` (object form — never `schema(player)`) and export the reducers so the module registers them. Match the template's aggregation pattern exactly.

- [ ] **Step 4: Build**

Run: `spacetime build --project-path server`
Expected: success.

- [ ] **Step 5: Local round-trip smoke test**

Run (background): `spacetime dev --project-path server`
Then in another shell: `spacetime sql <module> "SELECT * FROM player"` after connecting a client (do in Task 3), or use `spacetime logs`.
Expected: module publishes locally and is queryable.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): player table + presence/naming reducers"
```

---

### Task 3: React client that connects and shows online players

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`, `client/src/connection.ts`, `client/src/App.tsx`
- Generate: `client/src/module_bindings/` via `spacetime generate`

- [ ] **Step 1: Scaffold Vite React-TS client**

Run: `npm create vite@latest client -- --template react-ts` then trim the boilerplate. Add the SDK: `npm -w client i @clockworklabs/spacetimedb-sdk`.

- [ ] **Step 2: Generate bindings**

Run: `spacetime generate --lang typescript --out-dir client/src/module_bindings --project-path server`
Expected: typed `DbConnection`, `Player`, reducer wrappers generated.

- [ ] **Step 3: `connection.ts`**

```ts
import { DbConnection } from './module_bindings';

const URI = import.meta.env.VITE_STDB_URI ?? 'ws://localhost:3000';
const MODULE = import.meta.env.VITE_STDB_MODULE ?? 'rtg';

export function connect(onReady: (conn: DbConnection) => void) {
  return DbConnection.builder()
    .withUri(URI)
    .withModuleName(MODULE)
    .withToken(localStorage.getItem('stdb_token') ?? undefined)
    .onConnect((conn, _id, token) => {
      localStorage.setItem('stdb_token', token);
      conn.subscriptionBuilder().subscribe(['SELECT * FROM player']);
      onReady(conn);
    })
    .onConnectError((_c, e) => console.error('connect error', e))
    .build();
}
```

- [ ] **Step 4: `App.tsx` — presence + name entry**

Render: connection status, a text input that calls `conn.reducers.setName(name)`, and a live list of `player` rows (online ones highlighted) driven by `db.player.onInsert/onUpdate/onDelete`. Show total online count.

- [ ] **Step 5: `vite.config.ts` base path**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/', // CI sets '/<repo>/' for Pages
});
```

- [ ] **Step 6: Add client scripts** (`client/package.json`)

```json
{ "scripts": { "dev": "vite", "build": "tsc -b && vite build", "typecheck": "tsc --noEmit" } }
```

- [ ] **Step 7: Manual local round-trip verification**

With `spacetime dev` running: `npm -w client run dev`, open two browser tabs, set names, confirm both players appear online in both tabs in real time. Stop the dev server after.
Expected: real-time presence works end-to-end locally.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(client): connect to spacetimedb + live presence list"
```

---

### Task 4: Create the GitHub repo and push

**Files:** none (infra)

- [ ] **Step 1: Create the repo (private) and set as remote**

Run: `gh repo create rtg --private --source=. --remote=origin --push`
Expected: repo `tomasmen/rtg` created, `master` pushed. Record the repo name for the Pages base path.

- [ ] **Step 2: Commit any remaining files**

```bash
git add -A && git commit -m "chore: track remaining project files" || echo "nothing to commit"
git push -u origin master
```

---

### Task 5: CI workflow (typecheck + build on PRs/pushes)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write ci.yml**

```yaml
name: CI
on:
  push:
    branches: [master, main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test --if-present
      - run: npm run build:client
        env: { VITE_BASE: '/rtg/' }
```

- [ ] **Step 2: Commit + push + verify green**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck + build workflow"
git push
gh run watch
```
Expected: CI run succeeds.

---

### Task 6: Deploy workflow — publish to Maincloud + deploy to Pages

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Mint a CI token and store it as a secret**

Read the login token from `~/.config/spacetime/cli.toml` and set it without echoing the value:
```bash
gh secret set SPACETIME_TOKEN --body "$(spacetime login show --token 2>/dev/null || sed -n 's/^spacetimedb_token *= *"\(.*\)"/\1/p' ~/.config/spacetime/cli.toml)"
```
(Confirm the actual flag/key name in Step 1 of Task 1's CLI inspection; use `spacetime login --token <T>` semantics for CI auth.)

- [ ] **Step 2: Decide the Maincloud database name**

Use `rtg` (or `rtg-arcade` if taken). Publish once manually to claim it:
`spacetime publish --server maincloud rtg --project-path server`
Expected: module live on Maincloud; note the `wss://` URI for the client env.

- [ ] **Step 3: Write deploy.yml**

```yaml
name: Deploy
on:
  push:
    branches: [master, main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency: { group: deploy, cancel-in-progress: true }
jobs:
  publish-module:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install spacetime CLI
        run: curl -sSf https://install.spacetimedb.com | sh && echo "$HOME/.local/share/spacetime/bin/current" >> $GITHUB_PATH
      - name: Publish module to Maincloud
        run: spacetime publish --server maincloud rtg --project-path server --yes
        env: { SPACETIME_TOKEN: ${{ secrets.SPACETIME_TOKEN }} }
  deploy-client:
    needs: publish-module
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deploy.outputs.page_url }}' }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24', cache: 'npm' }
      - run: npm ci
      - name: Build client
        run: npm run build:client
        env:
          VITE_BASE: '/rtg/'
          VITE_STDB_URI: 'wss://maincloud.spacetimedb.com'
          VITE_STDB_MODULE: 'rtg'
      - uses: actions/upload-pages-artifact@v3
        with: { path: client/dist }
      - id: deploy
        uses: actions/deploy-pages@v4
```
(Reconcile the CLI auth env/flag and exact Maincloud URI with what Task 1 / Step 2 confirm.)

- [ ] **Step 4: Enable Pages (Actions source)**

Run: `gh api -X POST repos/tomasmen/rtg/pages -f build_type=workflow` (or enable via `gh repo edit` / Settings if the API call differs).

- [ ] **Step 5: Push, watch, verify live**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: publish to maincloud + deploy client to pages"
git push
gh run watch
```
Expected: module publishes to Maincloud, client deploys; open the Pages URL in two devices and confirm live cross-device presence.

- [ ] **Step 6: Write README with the live URL + dev instructions**

Document: live URL, `spacetime login`, `npm run dev:server`, `npm -w client run dev`, and how CI auto-deploys.

```bash
git add README.md && git commit -m "docs: readme with live url + dev workflow" && git push
```

---

## Definition of done (Phase 1)

- Pushing to `master` auto-publishes the module to Maincloud and deploys the client to GitHub Pages within ~1–2 min.
- Two people on different devices open the Pages URL, set names, and see each other online in real time.
- `npm run typecheck` and CI are green.

## Next phases (separate plans, after Phase 1 is live)

- **Phase 2 — Arcade & rooms:** game tiles, `GameRoom`/`RoomMember`, create/join/quick-match, match lifecycle, location-based presence.
- **Phase 3 — Fighter:** `sim.ts` (pure, TDD), 30 Hz scheduled tick, `FightInput`/`Fighter`/`FightMatch` tables, canvas client with interpolation + controls.
- **Phase 4 — Polish:** art, juice, win/lose flow, best-of-3.
