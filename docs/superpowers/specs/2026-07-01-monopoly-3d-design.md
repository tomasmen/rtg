# Monopoly (3D) + Arcade UI refresh — Design

**Status:** approved (2026-07-01). Built in milestones; each milestone ships and is live-verifiable.

## Goals

Add **Monopoly** as the arcade's third game: a server-authoritative, turn-based, full-classic
ruleset for **2–6 players**, rendered in **3D** (react-three-fiber, low-poly procedural — no
asset files), with **van tokens** (one distinct van per player; the office is a van company).
Win = last solvent player. Board is **office-themed** (40 spaces, classic Monopoly economics
re-skinned). Alongside it, a small **UI refresh** of the arcade lobby.

Priority per user: **functionality + basic 3D display first**; better van/board models come later
(keep `Van`/`Board`/`Piece` components swappable).

---

## Track A — Arcade UI refresh (small; ship first)

- **Hide offline players** on the lobby: `Arcade.tsx` renders every player; render the `online`
  subset instead (the "N online" heading already uses it).
- **Scrollable players list:** wrap the `<ul>` in a `max-height` + `overflow-y:auto` container.
- **Sleek/modern pass:** refined dark palette, tighter type scale + spacing, softer cards with
  subtle borders/shadow/gradient, crisp hover/active states on tiles + buttons. Self-contained
  in `App.css` (+ minor markup). No behavioural change.

---

## Track B — Monopoly

### Architecture (mirrors Chess, the existing turn-based game)

- Pure, unit-tested **rules engine**: `games/monopoly/board.ts` (40-space board + card decks,
  static data), `games/monopoly/rules.ts` (movement, landing resolution, rent, jail, build/
  mortgage legality, bankruptcy, trade/auction validation, win detection). No IO/RNG inside the
  engine — dice rolls and card draws are **inputs**, so it's fully testable.
- **Reducers** validate `ctx.sender` == current seat + correct phase, then mutate tables via the
  engine. Randomness (dice, card order) uses deterministic **`ctx.random`** in the reducer.
- `realtime:false` (no scheduled tick). Client subscribes to tables, renders 3D + HUD, calls
  reducers.

### Registry & rooms

- Server `GameDef { id:'monopoly', displayName:'Monopoly', minPlayers:2, maxPlayers:6, realtime:false }`.
- Client `GameMeta { id:'monopoly', displayName:'🚐 Monopoly', blurb:'Office property trading · 2–6' }`.
- **Core change — host-start:** 2–6-player rooms can't auto-start at "full" like the 2-player
  games. Add a **`startRoom`** reducer (host/creator only, requires seated count ≥ the game's
  `minPlayers`) that flips the room to `active` and calls `startGame`. `doJoinRoom` keeps
  auto-starting games whose `minPlayers === maxPlayers` (Fighter, Chess) unchanged; variable-size
  games wait for the host. `WaitingRoom` shows a **Start** button to the creator when
  `count ≥ minPlayers` and the room is still `waiting`.

### Data model (tables; all `public`)

- `monopoly_game` (pk `roomId`): `status` ('active'|'ended'), `phase` (turn phase — see state
  machine), `currentSeat` (u8), `die1`/`die2` (u8), `doublesCount` (u8), `winnerSeat` (i8, -1),
  `pendingSpace` (i8 — property just landed on, awaiting buy/auction; -1 none), `log` (string —
  short recent-events feed), plus auction fields (`auctionSpace` i8, `auctionSeat` u8 current
  bidder turn, `auctionHigh` i32, `auctionHighSeat` i8, `auctionActive` bool) and `pendingDebt`
  (i32) / `debtCreditorSeat` (i8) for bankruptcy resolution. This row is the turn state machine.
- `monopoly_player` (pk `id` autoInc; indexed by `roomId`): `roomId`, `identity`, `seat` (u8),
  `vanStyle` (u8 — index into a palette/shape table), `cash` (i32), `position` (u8 0–39),
  `inJail` (bool), `jailTurns` (u8), `getOutCards` (u8), `bankrupt` (bool).
- `monopoly_property` (pk `id` autoInc; indexed by `roomId`): `roomId`, `spaceIdx` (u8),
  `ownerSeat` (i8, -1 = bank), `houses` (u8 0–5; 5 = hotel), `mortgaged` (bool). One row per
  **ownable** space (properties, railroads, utilities) per game, created at game start.

### Board data (`board.ts`, static)

40 spaces with the **classic Monopoly layout/economics** (positions, prices, rent tables, house
costs, mortgage values, color groups, 4 railroads, 2 utilities, taxes, Chance ×3 / Community
Chest ×3, GO/Jail/Free Parking/Go-To-Jail) **re-skinned with office names** (e.g. GO, Coffee
Machine, Meeting Room, HR = Jail, Server Room, Exec Suite…). Card decks (Chance, Community Chest)
are static arrays of typed effects (`+cash`, `-cash`, `move-to`, `move-rel`, `goto-jail`,
`get-out-free`, `repairs` per house/hotel, `pay-each-player`, `collect-each-player`, `nearest-
railroad`/`nearest-utility`). Re-using classic economics keeps the game balanced without tuning.

### Turn state machine (`monopoly_game.phase`)

`rolling` → (roll) → move → resolve landing:
- unowned ownable → `awaitBuy` (buy, or decline → `auction`)
- owned by other, unmortgaged → pay rent (auto), stay `rolling`-done → `endTurn` (or extra roll on doubles)
- tax → pay; card space → draw+apply; go-to-jail → jail; jail/free-parking/GO → noop
- Doubles → roll again (3rd double → jail). `building`/`trading` are player-initiated any time
  during their turn (before endTurn). `ended` when one solvent player remains.

### Reducers

`rollDice`, `buyProperty`, `declineBuy` (→ auction), `placeBid`/`passBid`, `buildHouse`,
`sellHouse`, `mortgage`, `unmortgage`, `proposeTrade`/`respondTrade`, `payJailFine`,
`useJailCard`, `endTurn`, `declareBankruptcy`. Plus `startMonopoly`/`endMonopoly` wired through
`games/dispatch.ts`, and the shared `startRoom` in core/rooms.

### 3D client (`games/monopoly/`)

- `MonopolyGame.tsx`: subscribes to the 3 tables, lays out an r3f `<Canvas>` (the board) + a 2D
  HTML **HUD overlay** for all actions/menus.
- `scene/`: `Board3D` (40 extruded tiles in a ring, office colours + labels), `Van` (procedural
  low-poly, per-seat colour; animated hop between positions), `Building` (house cube / hotel bar),
  `Dice` (3D roll). Auto-framing camera (orbit + focus current player). All basic now, swappable.
- HUD (2D React overlay): turn/cash banner, dice-roll button, landed-property action card
  (Buy/Auction), property manager (build/sell/mortgage), trade dialog, auction dialog, jail
  options, **scrollable player sidebar** (van colour, name, cash, #props, jail), event log.
- Deps: `three`, `@react-three/fiber`, `@react-three/drei` (pinned to the client's React major).

### Milestones (each shippable & live-verifiable)

- **M1 — 3D foundation + movement** *(immediate focus)*: registry + tables + `startRoom`
  host-start + `startMonopoly` + `rollDice`/`endTurn` (movement, doubles, pass-GO position,
  3-doubles→jail). Client: 3D office board + procedural vans + 3D dice + hop animation + turn
  indicator + scrollable player panel. **Result:** 2–6 join → host starts → take turns → van
  moves around a 3D board, multiplayer. *No economy.* Engine tests for movement/doubles/jail-entry.
- **M2 — Economy:** buy/rent/taxes/Chance+CommunityChest/jail actions/GO salary/bankruptcy →
  last-one-standing win; HUD action cards. Engine tests for rent tables, cards, bankruptcy, win.
- **M3 — Development:** houses/hotels (even-build rule) + mortgages; rent reflects buildings; 3D
  houses/hotels. Engine tests for build legality + mortgage math.
- **M4 — Player economy:** trading (props+cash+get-out cards) + auctions (on declined buy).

### Testing

Pure-engine unit tests (vitest) like `chess/rules.test.ts`, grown per milestone: movement
wraparound, rent by space type (color-set doubling / railroad count / utility×dice), jail
transitions, card effects, bankruptcy asset transfer, build/mortgage legality, trade/auction
validation, win detection. A cash-conservation invariant check across a scripted playthrough.

### What's needed from the user

Nothing blocking — multi-client correctness is self-verifiable via chrome-devtools. User provides
"does it feel right" playtesting at each milestone, and better van/board models later.
