import { table, t } from 'spacetimedb/server';

// One row per active Monopoly room: the turn state machine + last dice.
// `phase`: 'rolling' (current player may roll) | 'rolled' (moved; must end turn)
//        | 'awaitBuy' (landed on an unowned property — M2) | 'ended'.
// Economy columns (cash lives on the player; pendingSpace/log here) are present
// from M1 so M2 doesn't force another schema migration.
export const monopolyGame = table(
  { name: 'monopoly_game', public: true },
  {
    roomId: t.u64().primaryKey(),
    status: t.string(),        // 'active' | 'ended'
    phase: t.string(),
    currentSeat: t.u8(),
    seatCount: t.u8(),
    die1: t.u8(),
    die2: t.u8(),
    doublesThisTurn: t.u8(),
    pendingSpace: t.i8(),      // property awaiting buy/auction decision (-1 = none) [M2]
    winnerSeat: t.i8(),        // -1 until the game ends
    log: t.string(),           // short recent-events feed for the HUD
  }
);

// One row per seated player in a Monopoly game.
export const monopolyPlayer = table(
  { name: 'monopoly_player', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    identity: t.identity().index('btree'),
    seat: t.u8(),
    vanStyle: t.u8(),          // index into the van livery palette
    cash: t.i32(),
    position: t.u8(),          // 0..39
    inJail: t.bool(),
    jailTurns: t.u8(),
    getOutCards: t.u8(),       // "get out of HR free" cards [M2]
    bankrupt: t.bool(),        // [M2]
  }
);

// One row per ownable space (property/railroad/utility) per game. Created at
// game start owned by the bank; M2+ mutates owner/houses/mortgaged.
export const monopolyProperty = table(
  { name: 'monopoly_property', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    spaceIdx: t.u8(),
    ownerSeat: t.i8(),         // -1 = bank
    houses: t.u8(),            // 0..4 houses, 5 = hotel
    mortgaged: t.bool(),
  }
);
