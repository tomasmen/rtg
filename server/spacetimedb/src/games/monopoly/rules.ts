// Pure Monopoly rules. No IO, no RNG (dice are inputs), no table access — so the
// whole thing is unit-testable. Reducers generate dice via ctx.random and apply
// these outcomes to the tables. M1 scope: dice, movement around the ring, doubles
// (roll-again; three-in-a-row → jail), landing on Go-To-Jail, and jail entry/exit.
// Economy (rent/buy/tax/cards/bankruptcy) arrives in M2.

import { BOARD, JAIL_IDX, GO_TO_JAIL_IDX, MAX_JAIL_TURNS } from './board';

export interface Roll {
  d1: number;
  d2: number;
  total: number;
  isDouble: boolean;
}

export function makeRoll(d1: number, d2: number): Roll {
  return { d1, d2, total: d1 + d2, isDouble: d1 === d2 };
}

// Advance `steps` (>0) around the 40-space ring. `passedGo` is true when the move
// wraps past or lands on GO (idx 0) — i.e. the player is owed GO salary.
export function advance(pos: number, steps: number): { pos: number; passedGo: boolean } {
  const raw = pos + steps;
  return { pos: raw % 40, passedGo: raw >= 40 };
}

export interface RollResolution {
  newPos: number;
  passedGo: boolean;      // owed GO salary (collected on pass or land)
  wentToJail: boolean;    // sent to jail (3rd double, or landed on Go-To-Jail)
  leftJail: boolean;      // was in jail, now released and moved
  incrementJailTurn: boolean; // failed a jail escape this attempt (still jailed)
  rollAgain: boolean;     // rolled a double while free → same player rolls again
}

// Resolve one dice roll into a movement outcome given the roller's current state.
// `doublesThisTurn` is how many doubles this player has already rolled this turn
// (0, 1, or 2) — the third consecutive double sends them to jail.
export function resolveRoll(params: {
  pos: number;
  inJail: boolean;
  jailTurns: number;
  doublesThisTurn: number;
  roll: Roll;
}): RollResolution {
  const { pos, inJail, jailTurns, doublesThisTurn, roll } = params;

  if (inJail) {
    if (roll.isDouble) {
      // escape by doubles: move out, but no bonus extra roll
      const adv = advance(JAIL_IDX, roll.total);
      return { newPos: adv.pos, passedGo: adv.passedGo, wentToJail: false, leftJail: true, incrementJailTurn: false, rollAgain: false };
    }
    if (jailTurns + 1 >= MAX_JAIL_TURNS) {
      // final failed attempt: forced to leave and move (M2 will charge the fine)
      const adv = advance(JAIL_IDX, roll.total);
      return { newPos: adv.pos, passedGo: adv.passedGo, wentToJail: false, leftJail: true, incrementJailTurn: false, rollAgain: false };
    }
    // still stuck
    return { newPos: JAIL_IDX, passedGo: false, wentToJail: false, leftJail: false, incrementJailTurn: true, rollAgain: false };
  }

  // free to move
  if (doublesThisTurn === 2 && roll.isDouble) {
    // three doubles in a row → straight to jail
    return { newPos: JAIL_IDX, passedGo: false, wentToJail: true, leftJail: false, incrementJailTurn: false, rollAgain: false };
  }

  const adv = advance(pos, roll.total);
  if (BOARD[adv.pos].type === 'gotojail') {
    return { newPos: JAIL_IDX, passedGo: false, wentToJail: true, leftJail: false, incrementJailTurn: false, rollAgain: false };
  }
  return { newPos: adv.pos, passedGo: adv.passedGo, wentToJail: false, leftJail: false, incrementJailTurn: false, rollAgain: roll.isDouble };
}

// Sanity re-export so callers don't reach into board.ts for the jail index.
export { JAIL_IDX, GO_TO_JAIL_IDX };
