# Office Arcade — Real-Time Multiplayer Game Platform

**Status:** Approved design · **Date:** 2026-06-17

A browser-based "office arcade": a lobby where people see who's online, pick a
game, and play together in real time. The first game is a networked 1v1 2D
fighter. The platform is built so additional games — including a future
turn-based, destructible-terrain artillery game (Worms-style) — drop in without
reworking the core.

## 1. Goals

- **Real-time, browser-based, zero-install** — open a URL and play.
- **Multi-game from day one** — an arcade shell + a clean `Game` abstraction;
  the fighter is the first title, not the only one.
- **All TypeScript, end-to-end** — server module, client, and generated bindings
  share one language and one type system.
- **Server-authoritative** — the backend owns game state; clients send input
  intents and render synced state.
- **Fully autonomous CI** — every push auto-deploys the backend (Maincloud) and
  the frontend (GitHub Pages). `spacetime dev` hot-swaps locally during dev.
- **Paradigm-agnostic core** — supports both real-time (tick-driven) and
  turn-based games so the future artillery game is not blocked.

## 2. Non-goals (YAGNI)

- No Worms/artillery implementation now — only an abstraction that won't block it.
- No accounts/passwords — anonymous SpacetimeDB identity + a chosen display name.
- No ranking, matchmaking skill, chat, spectating, or mobile-optimised controls
  in v1 (the lobby/match model leaves room for them later).
- No best-of-3, character roster, or rich art in v1 — single round, simple
  capsule fighters; both are easy follow-ups.

## 3. Decisions (locked)

| Area | Decision | Why |
|---|---|---|
| Backend host | **SpacetimeDB Maincloud** | Managed, free for small usage, one-command deploy, ideal for autonomous CI. |
| Language | **TypeScript everywhere** | Server modules now fully support TS (compiled to WASM); one type system across stack. |
| Client host | **GitHub Pages** | Free, auto-deploys from Actions; `gh` already authed. Static client connects directly to Maincloud over `wss://`. |
| Fighter mode | **Networked 1v1** | Each player on their own device; showcases the real-time backend; fits the office vibe. |
| Backend structure | **Single module, pluggable games** | One DB, one connection, shared presence, simplest CI; per-game code isolated and extractable later. |

## 4. High-level architecture

```
┌─────────────────────────────┐          ┌──────────────────────────────────┐
│  GitHub Pages (static)      │          │  SpacetimeDB Maincloud            │
│                             │   wss    │  (single module / one database)   │
│  • React arcade shell       │ ◄──────► │  • core: Player, presence, rooms  │
│  • canvas game clients      │  direct  │  • games/fighter: state + tick    │
│  • generated TS bindings    │  socket  │  • scheduled reducers (30 Hz tick)│
└─────────────────────────────┘          └──────────────────────────────────┘
        ↑ browser downloads app                  ↑ browser opens a typed WS,
                                                   subscribes to state,
                                                   calls reducers (inputs)
```

The browser loads static files from Pages, then opens a typed WebSocket directly
to Maincloud. There is no separate API/Node server — SpacetimeDB is the backend.

## 5. Repository layout (npm workspaces monorepo)

```
rtg/
├── server/                       SpacetimeDB TypeScript module → WASM
│   ├── src/
│   │   ├── index.ts              module entry: aggregates schema() from core + games
│   │   ├── core/
│   │   │   ├── tables.ts         Player, GameRoom, RoomMember
│   │   │   ├── presence.ts       client_connected / client_disconnected lifecycle
│   │   │   └── rooms.ts          create_room, join_room, quick_match, leave_room (match auto-starts when a room fills to the game's player count)
│   │   └── games/
│   │       ├── registry.ts       Game interface + registration
│   │       └── fighter/
│   │           ├── tables.ts     FightMatch, Fighter, FightInput, FightTick (scheduled)
│   │           ├── reducers.ts   set_input, start/end match wiring
│   │           ├── tick.ts       scheduled tick reducer (reads tables → step → writes)
│   │           └── sim.ts        PURE step(state, inputs, dt) → state  (unit-tested)
│   └── package.json
├── client/                       Vite + React + TS (static SPA)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── connection.ts         DbConnection → Maincloud (wss), token in localStorage
│   │   ├── module_bindings/      GENERATED via `spacetime generate` (committed)
│   │   ├── arcade/               lobby shell: name entry, presence list, game tiles, room list
│   │   └── games/
│   │       ├── GameClient.ts     interface: mount(canvas, conn, roomId) / unmount()
│   │       └── fighter/
│   │           ├── FighterClient.ts   render loop + interpolation + input mapping
│   │           └── render.ts          canvas drawing
│   ├── vite.config.ts            base set to '/<repo>/' for Pages
│   └── package.json
├── .github/workflows/
│   ├── ci.yml                    PRs/pushes: typecheck both, vitest, build client
│   └── deploy.yml                push to main: publish module + generate + build + deploy Pages
├── docs/superpowers/specs/
├── package.json                  workspaces: ["server", "client"]
└── README.md
```

## 6. The `Game` abstraction (multi-game + Worms-ready)

A registered game declares metadata the core uses to manage its lifecycle
generically:

```ts
interface GameDef {
  id: string;            // 'fighter'
  displayName: string;   // 'Fighter'
  minPlayers: number;    // 2
  maxPlayers: number;    // 2
  realtime: boolean;     // true → high-freq scheduled tick; false → turn-based
}
```

- **Real-time games** (fighter): on match start, the game schedules a periodic
  tick reducer that advances simulation. Clients send input intents between ticks.
- **Turn-based games** (future artillery): `realtime: false`, no high-freq tick;
  state advances from discrete action reducers (aim, fire) plus per-turn timers.
  Such a game registers its own tables (e.g. destructible terrain, projectiles)
  and reducers; **core's room/match lifecycle is unchanged**.

The `core/` layer owns: identity/presence, room creation/joining, slot
assignment, match start/finish, and player location. It calls into a game's
start/end hooks but knows nothing about game-specific rules — that is the seam
that keeps the platform paradigm-agnostic.

## 7. Backend data model

**Core tables**

- `Player { identity (pk), displayName, online, lastSeen, location }`
  — `location` is `'arcade'` or `'fighter:<roomId>'`, drives presence display.
- `GameRoom { id (pk, autoInc), gameId, status('waiting'|'active'|'finished'), hostIdentity, createdAt }`
- `RoomMember { id (pk, autoInc), roomId (index), identity, slot(u8) }`

**Fighter tables**

- `FightMatch { roomId (pk), status('countdown'|'fighting'|'ko'|'timeout'), roundEndsAt, tick(u64) }`
- `Fighter { id (pk, autoInc), roomId (index), identity, slot(u8), x, y, vx, vy, facing(i8), hp(f32), state(string), stateFrame(u32) }`
- `FightInput { identity (pk), roomId, moveX(i8 -1/0/1), jump(bool), attackLight(bool), attackHeavy(bool), block(bool), seq(u32) }`
  — latest input intent per player; reducers write it, the tick reads it.
- `FightTick { id (pk, autoInc), roomId, scheduledAt: ScheduleAt }` — scheduled
  table driving the `fighter_tick` reducer (~33 ms ≈ 30 Hz).

## 8. Real-time fighter model (server-authoritative)

1. Client sends **input intents** only, via `set_input` reducer — never positions.
2. `fighter_tick` (scheduled, 30 Hz) reads the match's `Fighter` rows + latest
   `FightInput`, runs the **pure** `step(state, inputs, dt) → state`, writes
   authoritative results back to tables, increments `tick`, and reschedules.
3. Clients **subscribe** to their match (`SELECT * FROM fighter WHERE roomId=…`,
   `SELECT * FROM fight_match WHERE roomId=…`) and render with **interpolation**
   between received states (+ optional light local prediction of own fighter).
4. Combat: AABB hitboxes per attack frame; light/heavy attacks apply damage +
   hitstun; block reduces/negates damage. State machine: `idle, walk, jump,
   attack_light, attack_heavy, block, hitstun, ko`.
5. **Match:** 1v1, single round, two HP bars + round timer. Win by KO
   (hp ≤ 0) or higher HP at timeout. On finish, set statuses, stop the tick,
   return players to `arcade`.

Keeping `sim.ts` a pure function (no DB calls) makes the physics/combat
unit-testable in isolation and reusable for client-side prediction later.

## 9. Client architecture & flow

- **connection.ts** — builds `DbConnection` to Maincloud over `wss://`, persists
  the auth token in `localStorage`, exposes the live connection.
- **arcade/** — name entry → lobby showing online players (presence) and game
  tiles → pick Fighter → **quick-match** (auto-pair into a waiting room) or join
  a listed open room → enter match view.
- **GameClient interface** — `mount(canvas, conn, roomId)` sets up subscriptions +
  render loop + input handlers; `unmount()` tears them down. The shell selects
  the client by `gameId`, so adding a game is: register server-side + add a
  `GameClient` implementation.
- **fighter/** — canvas renderer drawing capsule fighters with limbs, HP bars,
  names, and a timer; maps keys to `set_input` calls; interpolates between synced
  states for smoothness.
- **Controls:** A/D or ←/→ move · W/Space jump · J light attack · K heavy attack ·
  L/Shift block.

## 10. CI/CD & deployment

- **Local dev:** `spacetime dev` runs a local instance and **hot-swaps** the
  module on save without disconnecting clients; Vite dev server for the client.
- **ci.yml** (PRs & pushes): install → typecheck `server` + `client` → run vitest
  → build client. Gate for correctness before deploy.
- **deploy.yml** (push to `main`):
  1. install the spacetime CLI on the runner;
  2. `spacetime publish` the module to Maincloud, non-interactively, using the
     `SPACETIME_TOKEN` GitHub Actions secret (module hot-swaps — connected
     players stay connected);
  3. `spacetime generate --lang typescript` to refresh bindings;
  4. Vite build (correct `base`) → deploy to GitHub Pages.
- **Result:** ~1–2 min from push to live for both halves.

## 11. Autonomy setup

**One manual step (user):** run `spacetime login` once (browser auth — cannot be
automated). Suggested: type `! spacetime login` in the session.

**Then Claude handles autonomously:**
- create the GitHub repo under `tomasmen` and push;
- read the Maincloud token from `~/.config/spacetime/cli.toml` and set it as the
  `SPACETIME_TOKEN` Actions secret via `gh secret set`;
- enable GitHub Pages; commit both workflows;
- from then on, every push auto-deploys.

## 12. Testing strategy (TDD)

- **sim.ts** — pure simulation: tests written first (movement, gravity, attack
  hit/miss, hitstun, block, KO, timeout). Highest-value coverage.
- **core reducers** — room lifecycle: create/join/quick-match/slot assignment,
  start/finish transitions.
- **client** — light-touch unit tests on input mapping + interpolation helpers.

## 13. Future: turn-based artillery (Worms-style) — accommodation only

Not implemented now. The design must not block it:

- Register as a game with `realtime: false` (no high-freq tick; per-turn timer).
- Its own tables: destructible terrain (e.g. heightmap/bitmap), worms/units,
  in-flight projectiles; its own reducers (move, aim, fire, end-turn).
- Reuses core room/match lifecycle and the client `GameClient` interface
  unchanged. This is the explicit reason the core is paradigm-agnostic.

## 14. Deferred / open questions

- Art style and polish for the fighter (will check in before going deep).
- Best-of-3 rounds, multiple characters/moves, mobile/touch controls.
- Reconnect/spectate handling and idle-room cleanup specifics.

## 15. Rough milestones

1. Monorepo scaffold + local `spacetime dev` round-trip (connect, see a Player).
2. Core: identity/presence + arcade lobby (online list, game tiles).
3. Rooms: create/join/quick-match + match start/finish lifecycle.
4. Fighter: tables + pure `sim.ts` (TDD) + 30 Hz tick + input reducers.
5. Fighter client: canvas render + interpolation + controls.
6. CI/CD: `ci.yml`, `deploy.yml`, Maincloud publish + Pages deploy live.
7. Polish pass (art, juice, win/lose flow) — separate spec/plan.
