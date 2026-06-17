# Phase 2 — Multi-Game Setup: Game Registry + Arcade Rooms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable foundation every game plugs into — a paradigm-agnostic `Game` registry plus a room/match lifecycle (create / join / quick-match / leave, slot assignment, auto-start when full, finish) and an arcade lobby UI (game tiles + a live waiting-room view). The fighter is *registered* as the first game so the flow works end-to-end, but its gameplay is Phase 3.

**Architecture:** Add a `core/` rooms layer and a `games/registry.ts` to the existing single SpacetimeDB module. Rooms are generic; a `GameDef` describes each game (`maxPlayers`, `realtime`, …) so the same lifecycle serves real-time and future turn-based games. The client gains an arcade view (tiles + quick-match + open rooms) and a waiting-room view, routed by the player's `location`. Pure room-logic helpers are unit-tested with **vitest** (newly introduced here; Phase 3's simulation will lean on it heavily).

**Tech Stack:** TypeScript · SpacetimeDB 2.6 (`spacetimedb/server`) · Vite + React + `spacetimedb/react` · vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-17-office-arcade-design.md` (§6 Game abstraction, §7 data model, §9 client flow).

**Branch:** `phase2-arcade-rooms` off `master`. Merge → auto-deploys (Phase 1 pipeline).

**Confirmed 2.6 API (from Phase 1):** `import { schema, table, t } from 'spacetimedb/server'`; reducers `export const fooBar = spacetimedb.reducer({...}, (ctx,args)=>{})` register on-wire as `foo_bar`; `ctx.sender`, `ctx.timestamp`; `ctx.db.<table>.<col>.find/update/delete`, `.insert`, `[...ctx.db.<table>.<index>.filter(x)]`, `[...ctx.db.<table>.iter()]`. Client: `useTable(tables.x)`, `useReducer(reducers.fooBar)` (named-args object), `useSpacetimeDB()` → `{ isActive, identity }`.

---

## File structure (this phase)

```
server/spacetimedb/src/
├── index.ts                aggregate schema + re-export all reducers/lifecycle
├── core/
│   ├── tables.ts           (existing) Player  + ADD GameRoom, RoomMember
│   ├── presence.ts         (NEW) move onConnect/onDisconnect/setName here; disconnect also leaves room
│   ├── rooms.ts            (NEW) createRoom, joinRoom, quickMatch, leaveRoom reducers
│   └── roomLogic.ts        (NEW) PURE helpers: nextSlot, pickOpenRoom, isFull  (unit-tested)
└── games/
    └── registry.ts         (NEW) GameDef interface + GAMES list (fighter registered)

server/spacetimedb/
├── vitest.config.ts        (NEW)
└── src/core/roomLogic.test.ts  (NEW)

client/src/
├── App.tsx                 route by connection + player.location → Arcade or WaitingRoom
├── games/registry.ts       (NEW) client game metadata (id, displayName) + GameClient interface
├── arcade/
│   ├── Arcade.tsx          (NEW) presence + game tiles + quick-match + open-room list
│   └── WaitingRoom.tsx     (NEW) members list + status + leave button
└── (App.css additions)
```

---

### Task 1: Verify re-exported reducers register (de-risk the multi-game split)

**Files:** temporary edits to `server/spacetimedb/src/index.ts` + a throwaway `src/_probe.ts`.

- [ ] **Step 1: Add a probe reducer in a separate file** (`server/spacetimedb/src/_probe.ts`)

```ts
import spacetimedb from './index';
import { t } from 'spacetimedb/server';

export const probePing = spacetimedb.reducer({ n: t.u32() }, (_ctx, { n }) => {
  console.info(`probe ${n}`);
});
```

- [ ] **Step 2: Re-export it from index.ts** — add at the end of `index.ts`:

```ts
export * from './_probe';
```

- [ ] **Step 3: Build + publish locally + inspect**

Run:
```bash
npm run build:server
spacetime publish rtg --server local -p server/spacetimedb -y
spacetime describe rtg --server local --json | grep -o '"name":"probe_ping"' | head -1
```
Expected: prints `"name":"probe_ping"` → re-exported reducers **do** register.

- [ ] **Step 4: Record the outcome and choose the structure**

- If it registered: per-game/per-module files re-exported from `index.ts` is the pattern. Proceed as planned.
- If it did NOT register: reducers must be declared in `index.ts`. Fallback: keep reducer *logic* in helper functions in `rooms.ts`/`presence.ts` and declare thin `spacetimedb.reducer(...)` wrappers in `index.ts` that call them. Adjust Tasks 2–5 to that shape.

- [ ] **Step 5: Remove the probe**

```bash
rm server/spacetimedb/src/_probe.ts
```
Remove the `export * from './_probe';` line from `index.ts`. Rebuild to confirm clean.

- [ ] **Step 6: Commit the decision as a note** (no code yet)

```bash
git add -A && git commit -m "chore: verify reducer re-export registration for multi-game split" --allow-empty
```

---

### Task 2: Game registry (server)

**Files:** Create `server/spacetimedb/src/games/registry.ts`.

- [ ] **Step 1: Define GameDef + GAMES**

```ts
// A registered game. `realtime` decides whether it gets a high-frequency tick
// (fighter) or is turn-based (future artillery game). Phase 2 uses only the
// metadata; tick wiring comes with each game.
export interface GameDef {
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  realtime: boolean;
}

export const GAMES: readonly GameDef[] = [
  { id: 'fighter', displayName: 'Fighter', minPlayers: 2, maxPlayers: 2, realtime: true },
];

export function getGame(id: string): GameDef | undefined {
  return GAMES.find(g => g.id === id);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:server`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add server/spacetimedb/src/games/registry.ts
git commit -m "feat(server): game registry (GameDef + fighter)"
```

---

### Task 3: Room tables

**Files:** Modify `server/spacetimedb/src/core/tables.ts`.

- [ ] **Step 1: Add GameRoom + RoomMember tables** (append to `tables.ts`)

```ts
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

// Membership of a player in a room. One row per (player in a room). `slot` is
// the player's seat (0..maxPlayers-1).
export const roomMember = table(
  { name: 'room_member', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    identity: t.identity().index('btree'),
    slot: t.u8(),
  }
);
```

- [ ] **Step 2: Build**

Run: `npm run build:server`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add server/spacetimedb/src/core/tables.ts
git commit -m "feat(server): GameRoom + RoomMember tables"
```

---

### Task 4: Pure room-logic helpers (TDD with vitest)

**Files:** Create `server/spacetimedb/vitest.config.ts`, `src/core/roomLogic.ts`, `src/core/roomLogic.test.ts`. Modify `server/spacetimedb/package.json` (add `test` script + vitest dev dep).

- [ ] **Step 1: Install vitest + add test script**

```bash
npm --prefix server/spacetimedb i -D vitest
```
Add to `server/spacetimedb/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: vitest config** (`server/spacetimedb/vitest.config.ts`)

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
```

- [ ] **Step 3: Write the failing tests** (`src/core/roomLogic.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { nextSlot, isFull, pickOpenRoomId } from './roomLogic';

describe('nextSlot', () => {
  it('returns 0 for an empty room', () => expect(nextSlot([], 2)).toBe(0));
  it('returns the lowest free slot', () => expect(nextSlot([0], 2)).toBe(1));
  it('fills gaps left by leavers', () => expect(nextSlot([1], 2)).toBe(0));
  it('returns null when full', () => expect(nextSlot([0, 1], 2)).toBe(null));
});

describe('isFull', () => {
  it('true when member count reaches max', () => expect(isFull(2, 2)).toBe(true));
  it('false when below max', () => expect(isFull(1, 2)).toBe(false));
});

describe('pickOpenRoomId', () => {
  const rooms = [
    { id: 1n, gameId: 'fighter', status: 'waiting', count: 1 },
    { id: 2n, gameId: 'fighter', status: 'active', count: 2 },
    { id: 3n, gameId: 'chess', status: 'waiting', count: 1 },
  ];
  it('picks a waiting, non-full room for the game', () =>
    expect(pickOpenRoomId(rooms, 'fighter', 2)).toBe(1n));
  it('ignores active/full and other games', () =>
    expect(pickOpenRoomId(rooms, 'chess', 2)).toBe(3n));
  it('returns null when none open', () =>
    expect(pickOpenRoomId(rooms, 'pong', 2)).toBe(null));
});
```

- [ ] **Step 4: Run tests, verify they FAIL**

Run: `npm --prefix server/spacetimedb test`
Expected: FAIL (module `./roomLogic` has no such exports).

- [ ] **Step 5: Implement** (`src/core/roomLogic.ts`)

```ts
// Pure helpers for room logic, decoupled from ctx.db so they are unit-testable.
export function nextSlot(usedSlots: number[], maxPlayers: number): number | null {
  for (let s = 0; s < maxPlayers; s++) {
    if (!usedSlots.includes(s)) return s;
  }
  return null;
}

export function isFull(memberCount: number, maxPlayers: number): boolean {
  return memberCount >= maxPlayers;
}

export interface OpenRoom { id: bigint; gameId: string; status: string; count: number; }

export function pickOpenRoomId(rooms: OpenRoom[], gameId: string, maxPlayers: number): bigint | null {
  const open = rooms.find(
    r => r.gameId === gameId && r.status === 'waiting' && r.count < maxPlayers
  );
  return open ? open.id : null;
}
```

- [ ] **Step 6: Run tests, verify they PASS**

Run: `npm --prefix server/spacetimedb test`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add server/spacetimedb/vitest.config.ts server/spacetimedb/src/core/roomLogic.ts server/spacetimedb/src/core/roomLogic.test.ts server/spacetimedb/package.json server/spacetimedb/package-lock.json
git commit -m "feat(server): pure room-logic helpers + vitest (TDD)"
```

---

### Task 5: Room reducers + presence-leaves-room

**Files:** Create `server/spacetimedb/src/core/rooms.ts`; create `src/core/presence.ts` (move presence out of index.ts); rewrite `src/index.ts` to aggregate + re-export. (If Task 1 said re-exports don't register, declare the reducers in index.ts calling helpers from rooms.ts/presence.ts instead.)

Helper used by several reducers — current members of a room and player location string:

- [ ] **Step 1: rooms.ts — reducers**

```ts
import { t } from 'spacetimedb/server';
import spacetimedb from '../index';
import { getGame } from '../games/registry';
import { nextSlot, isFull, pickOpenRoomId, type OpenRoom } from './roomLogic';

function members(ctx: any, roomId: bigint) {
  return [...ctx.db.roomMember.roomId.filter(roomId)];
}
function locationFor(gameId: string, roomId: bigint) {
  return `${gameId}:${roomId}`;
}
function setLocation(ctx: any, location: string) {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, location });
}

export const createRoom = spacetimedb.reducer({ gameId: t.string() }, (ctx, { gameId }) => {
  const game = getGame(gameId);
  if (!game) throw new Error(`unknown game: ${gameId}`);
  // a player may only be in one room
  if ([...ctx.db.roomMember.identity.filter(ctx.sender)].length > 0) {
    throw new Error('already in a room');
  }
  const room = ctx.db.gameRoom.insert({
    id: 0n, gameId, status: 'waiting', createdBy: ctx.sender, createdAt: ctx.timestamp,
  });
  ctx.db.roomMember.insert({ id: 0n, roomId: room.id, identity: ctx.sender, slot: 0 });
  setLocation(ctx, locationFor(gameId, room.id));
});

export const joinRoom = spacetimedb.reducer({ roomId: t.u64() }, (ctx, { roomId }) => {
  const room = ctx.db.gameRoom.id.find(roomId);
  if (!room) throw new Error('no such room');
  if (room.status !== 'waiting') throw new Error('room not joinable');
  if ([...ctx.db.roomMember.identity.filter(ctx.sender)].length > 0) {
    throw new Error('already in a room');
  }
  const game = getGame(room.gameId)!;
  const current = members(ctx, roomId);
  const slot = nextSlot(current.map(m => m.slot), game.maxPlayers);
  if (slot === null) throw new Error('room full');
  ctx.db.roomMember.insert({ id: 0n, roomId, identity: ctx.sender, slot });
  setLocation(ctx, locationFor(room.gameId, roomId));
  if (isFull(current.length + 1, game.maxPlayers)) {
    ctx.db.gameRoom.id.update({ ...room, status: 'active' });
  }
});

export const quickMatch = spacetimedb.reducer({ gameId: t.string() }, (ctx, { gameId }) => {
  const game = getGame(gameId);
  if (!game) throw new Error(`unknown game: ${gameId}`);
  if ([...ctx.db.roomMember.identity.filter(ctx.sender)].length > 0) {
    throw new Error('already in a room');
  }
  const open: OpenRoom[] = [...ctx.db.gameRoom.iter()].map(r => ({
    id: r.id, gameId: r.gameId, status: r.status,
    count: [...ctx.db.roomMember.roomId.filter(r.id)].length,
  }));
  const target = pickOpenRoomId(open, gameId, game.maxPlayers);
  if (target === null) {
    createRoom(ctx, { gameId });
  } else {
    joinRoom(ctx, { roomId: target });
  }
});

export const leaveRoom = spacetimedb.reducer((ctx) => {
  const mine = [...ctx.db.roomMember.identity.filter(ctx.sender)];
  for (const m of mine) {
    const room = ctx.db.gameRoom.id.find(m.roomId);
    ctx.db.roomMember.id.delete(m.id);
    if (room) {
      const remaining = [...ctx.db.roomMember.roomId.filter(m.roomId)];
      if (remaining.length === 0) ctx.db.gameRoom.id.delete(room.id);
      else if (room.status === 'active') ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
    }
  }
  setLocation(ctx, 'arcade');
});
```

Note: calling `createRoom(ctx, {...})` directly reuses the reducer body as a function — confirm in Task 1's build that reducers are callable this way; if not, factor the bodies into plain functions and have both the reducer and quickMatch call them.

- [ ] **Step 2: presence.ts — move presence here, and leave room on disconnect**

Move `onConnect`, `setName` from index.ts into `presence.ts` (using `import spacetimedb from '../index'`). Change `onDisconnect` to also delete the player's room memberships (reusing the same cleanup as `leaveRoom`) and set them offline:

```ts
export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const mine = [...ctx.db.roomMember.identity.filter(ctx.sender)];
  for (const m of mine) {
    const room = ctx.db.gameRoom.id.find(m.roomId);
    ctx.db.roomMember.id.delete(m.id);
    if (room) {
      const remaining = [...ctx.db.roomMember.roomId.filter(m.roomId)];
      if (remaining.length === 0) ctx.db.gameRoom.id.delete(room.id);
      else if (room.status === 'active') ctx.db.gameRoom.id.update({ ...room, status: 'finished' });
    }
  }
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, online: false, lastSeen: ctx.timestamp });
});
```

- [ ] **Step 3: index.ts — aggregate schema + re-export**

```ts
import { schema } from 'spacetimedb/server';
import { player, gameRoom, roomMember } from './core/tables';

const spacetimedb = schema({ player, gameRoom, roomMember });
export default spacetimedb;

export * from './core/presence';
export * from './core/rooms';
```
(If Task 1 found re-exports don't register, instead declare each reducer in index.ts.)

- [ ] **Step 4: Build + publish locally**

Run:
```bash
npm run build:server
spacetime publish rtg --server local -p server/spacetimedb -y
spacetime describe rtg --server local --json | grep -oE '"name":"(create_room|join_room|quick_match|leave_room|set_name)"'
```
Expected: all five reducer names present.

- [ ] **Step 5: CLI round-trip verification**

```bash
spacetime call rtg quick_match '"fighter"' --server local
spacetime sql rtg "SELECT id, game_id, status FROM game_room" --server local
spacetime sql rtg "SELECT room_id, slot FROM room_member" --server local
```
Expected: one waiting room for 'fighter' with one member at slot 0.

- [ ] **Step 6: Regenerate client bindings**

Run: `spacetime generate --lang typescript --out-dir client/src/module_bindings -p server/spacetimedb`
Expected: bindings now include gameRoom/roomMember tables + the new reducers.

- [ ] **Step 7: Commit**

```bash
git add server/spacetimedb/src client/src/module_bindings
git commit -m "feat(server): room lifecycle reducers (create/join/quick-match/leave) + disconnect cleanup"
```

---

### Task 6: Client — arcade lobby (tiles + quick-match + open rooms)

**Files:** Create `client/src/games/registry.ts`, `client/src/arcade/Arcade.tsx`. Modify `client/src/App.tsx`, `client/src/App.css`.

- [ ] **Step 1: Client game registry** (`client/src/games/registry.ts`)

```ts
// Client-side game metadata for tiles. Mirrors the server registry's public bits.
export interface GameMeta { id: string; displayName: string; blurb: string; }
export const GAMES: GameMeta[] = [
  { id: 'fighter', displayName: '🥊 Fighter', blurb: 'Networked 1v1 brawl' },
];

// Each playable game will implement this in Phase 3+.
export interface GameClient {
  mount(container: HTMLElement, roomId: bigint): void;
  unmount(): void;
}
```

- [ ] **Step 2: Arcade.tsx** — render presence, a tile per game with a Quick-match button, and a list of open `waiting` rooms with Join buttons.

```tsx
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings';
import { GAMES } from '../games/registry';

export function Arcade() {
  const [players] = useTable(tables.player);
  const [rooms] = useTable(tables.gameRoom);
  const [members] = useTable(tables.roomMember);
  const quickMatch = useReducer(reducers.quickMatch);
  const joinRoom = useReducer(reducers.joinRoom);

  const online = players.filter(p => p.online);
  const countFor = (roomId: bigint) => members.filter(m => m.roomId === roomId).length;

  return (
    <>
      <section className="tiles">
        {GAMES.map(g => (
          <div className="tile" key={g.id}>
            <h3>{g.displayName}</h3>
            <p>{g.blurb}</p>
            <button onClick={() => void quickMatch({ gameId: g.id })}>Quick match</button>
          </div>
        ))}
      </section>

      <section className="rooms">
        <h2>Open rooms</h2>
        {rooms.filter(r => r.status === 'waiting').length === 0 && <p className="muted">None yet — start one above.</p>}
        <ul>
          {rooms.filter(r => r.status === 'waiting').map(r => (
            <li key={r.id.toString()}>
              {r.gameId} · {countFor(r.id)} waiting
              <button onClick={() => void joinRoom({ roomId: r.id })}>Join</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="players">
        <h2>{online.length} online</h2>
        <ul>{players.map(p => (
          <li key={p.identity.toHexString()} className={p.online ? 'online' : 'offline'}>
            <span className="dot" />{p.displayName || 'anon'}
          </li>
        ))}</ul>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: pass (fix any reducer-arg shape mismatches, e.g. `joinRoom({ roomId })`).

- [ ] **Step 4: Commit**

```bash
git add client/src/games client/src/arcade/Arcade.tsx
git commit -m "feat(client): arcade lobby (game tiles + quick-match + open rooms)"
```

---

### Task 7: Client — waiting room + location routing

**Files:** Create `client/src/arcade/WaitingRoom.tsx`. Modify `client/src/App.tsx`, `client/src/App.css`.

- [ ] **Step 1: WaitingRoom.tsx** — show the room the player is in (members + slots + status), with a Leave button. Props: `roomId: bigint`.

```tsx
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings';

export function WaitingRoom({ roomId }: { roomId: bigint }) {
  const [rooms] = useTable(tables.gameRoom);
  const [members] = useTable(tables.roomMember);
  const [players] = useTable(tables.player);
  const leaveRoom = useReducer(reducers.leaveRoom);

  const room = rooms.find(r => r.id === roomId);
  const seated = members.filter(m => m.roomId === roomId).sort((a, b) => a.slot - b.slot);
  const nameOf = (id: string) => players.find(p => p.identity.toHexString() === id)?.displayName || 'anon';

  return (
    <section className="waiting">
      <h2>{room?.gameId ?? 'room'} — {room?.status ?? '…'}</h2>
      <ul>
        {seated.map(m => (
          <li key={m.id.toString()}>Slot {m.slot}: {nameOf(m.identity.toHexString())}</li>
        ))}
      </ul>
      {room?.status === 'waiting' && <p className="muted">Waiting for an opponent…</p>}
      {room?.status === 'active' && <p>Match starting… (gameplay arrives in Phase 3)</p>}
      <button onClick={() => void leaveRoom()}>Leave</button>
    </section>
  );
}
```

- [ ] **Step 2: App.tsx routing** — keep the header + name form; below it, route on the player's `location`: if `location` starts with a known prefix (not `'arcade'`) and matches a room id, render `<WaitingRoom roomId=… />`, else `<Arcade />`.

```tsx
// inside App, after `me` is computed:
const myRoomId = (() => {
  if (!me || !me.location || me.location === 'arcade') return null;
  const parts = me.location.split(':');           // 'fighter:123'
  return parts.length === 2 ? BigInt(parts[1]) : null;
})();
// ...
{myRoomId === null ? <Arcade /> : <WaitingRoom roomId={myRoomId} />}
```

- [ ] **Step 3: App.css** — add styles for `.tiles`, `.tile`, `.rooms`, `.waiting`, `.muted` (cards, buttons consistent with existing palette).

- [ ] **Step 4: Typecheck + build**

Run: `npm --prefix client run typecheck && npm --prefix client run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat(client): waiting-room view + location-based routing"
```

---

### Task 8: Local round-trip, then deploy + verify live

**Files:** none (verification + integration).

- [ ] **Step 1: Local two-client test** (local `spacetime dev` or `spacetime start` + published `rtg`, plus `npm --prefix client run dev`)

Open two browser contexts. In A: set a name, Quick-match Fighter → see a waiting room "Waiting for an opponent…". In B: set a name → the open room appears in the Arcade → Join → both clients show the room as `active` with two seated slots. In A: Leave → room cleans up. Verify presence/location updates live in both.

- [ ] **Step 2: Merge to master (auto-deploys)**

```bash
git checkout master && git merge phase2-arcade-rooms --ff-only && git push origin master
```

- [ ] **Step 3: Watch the deploy**

Run: `gh run watch <deploy-run-id> --repo tomasmen/rtg --exit-status`
Expected: publish-module + deploy-client both green.

- [ ] **Step 4: Verify live** at https://tomasmen.github.io/rtg/ with two browser contexts: quick-match + join produces a live shared waiting room that flips to `active` when full.

- [ ] **Step 5: Clean up branch**

```bash
git branch -d phase2-arcade-rooms && git push origin --delete phase2-arcade-rooms
```

---

## Definition of done (Phase 2)

- A `Game` registry exists; rooms are generic over it (ready for the fighter and a future turn-based game).
- On the live URL, two people can quick-match / join into a shared room that auto-activates when full, see each other live, and leave cleanly; disconnects clean up rooms.
- Pure room logic is covered by vitest; CI green; deployed.

## Next phase

- **Phase 3 — Fighter:** register the fighter's tables + a 30 Hz scheduled tick + a pure `sim.ts` (TDD), implement the `GameClient` for canvas rendering with interpolation + controls, and start the tick when a fighter room goes `active`.
