import spacetimedb from '../../schema';
import { BOARD, START_CASH, GO_SALARY, isOwnable } from './board';
import { makeRoll, resolveRoll } from './rules';

// ---- lifecycle (called from games/dispatch on room activate / teardown) ----

// Seat every room member, create the bank-owned property rows, and open the game
// on seat 0's roll. Seats are contiguous 0..n-1 (index after sorting by slot) so
// turn cycling is simple; van livery = seat index.
export function startMonopoly(ctx: any, roomId: bigint): void {
  const members = [...ctx.db.roomMember.roomId.filter(roomId)].sort(
    (a: any, b: any) => a.slot - b.slot
  );
  if (members.length < 2) return;

  members.forEach((m: any, i: number) => {
    ctx.db.monopolyPlayer.insert({
      id: 0n, roomId, identity: m.identity, seat: i, vanStyle: i,
      cash: START_CASH, position: 0, inJail: false, jailTurns: 0, getOutCards: 0, bankrupt: false,
    });
  });

  for (let idx = 0; idx < BOARD.length; idx++) {
    if (isOwnable(idx)) {
      ctx.db.monopolyProperty.insert({ id: 0n, roomId, spaceIdx: idx, ownerSeat: -1, houses: 0, mortgaged: false });
    }
  }

  ctx.db.monopolyGame.insert({
    roomId, status: 'active', phase: 'rolling', currentSeat: 0, seatCount: members.length,
    die1: 0, die2: 0, doublesThisTurn: 0, pendingSpace: -1, winnerSeat: -1,
    log: 'Game on — seat 1 to roll.',
  });
}

// Idempotent teardown of all Monopoly state for a room.
export function endMonopoly(ctx: any, roomId: bigint): void {
  for (const p of [...ctx.db.monopolyPlayer.roomId.filter(roomId)]) ctx.db.monopolyPlayer.id.delete(p.id);
  for (const pr of [...ctx.db.monopolyProperty.roomId.filter(roomId)]) ctx.db.monopolyProperty.id.delete(pr.id);
  if (ctx.db.monopolyGame.roomId.find(roomId)) ctx.db.monopolyGame.roomId.delete(roomId);
}

// ---- helpers ----

// The sender's player row + its game, with turn/phase validated. Throws otherwise.
function requireMyTurn(ctx: any, requirePhase: string | null): { me: any; game: any } {
  const mine = [...ctx.db.monopolyPlayer.identity.filter(ctx.sender)];
  const me = mine[0];
  if (!me) throw new Error('not in a Monopoly game');
  const game = ctx.db.monopolyGame.roomId.find(me.roomId);
  if (!game || game.status !== 'active') throw new Error('no active game');
  if (game.currentSeat !== me.seat) throw new Error('not your turn');
  if (requirePhase !== null && game.phase !== requirePhase) throw new Error(`cannot do that now (phase ${game.phase})`);
  return { me, game };
}

// Next non-bankrupt seat after the current one (M1 has no bankrupts).
function nextActiveSeat(ctx: any, game: any): number {
  const bySeat = new Map<number, any>();
  for (const p of [...ctx.db.monopolyPlayer.roomId.filter(game.roomId)]) bySeat.set(p.seat, p);
  let s = game.currentSeat;
  for (let i = 0; i < game.seatCount; i++) {
    s = (s + 1) % game.seatCount;
    const p = bySeat.get(s);
    if (p && !p.bankrupt) return s;
  }
  return game.currentSeat;
}

// ---- reducers ----

// Roll the dice and move. Handles doubles (roll again; 3rd → jail), Go-To-Jail,
// jail escape/attempts, and GO salary. Buying/rent/cards come in M2.
export const monopolyRoll = spacetimedb.reducer((ctx: any) => {
  const { me, game } = requireMyTurn(ctx, 'rolling');

  const d1 = ctx.random.integerInRange(1, 6);
  const d2 = ctx.random.integerInRange(1, 6);
  const roll = makeRoll(d1, d2);
  const res = resolveRoll({
    pos: me.position, inJail: me.inJail, jailTurns: me.jailTurns,
    doublesThisTurn: game.doublesThisTurn, roll,
  });

  const cash = me.cash + (res.passedGo ? GO_SALARY : 0);
  const inJail = res.wentToJail ? true : res.leftJail ? false : me.inJail;
  const jailTurns = res.wentToJail ? 0 : res.leftJail ? 0 : res.incrementJailTurn ? me.jailTurns + 1 : me.jailTurns;
  ctx.db.monopolyPlayer.id.update({ ...me, position: res.newPos, cash, inJail, jailTurns });

  const phase = res.rollAgain ? 'rolling' : 'rolled';
  const doublesThisTurn = res.rollAgain ? game.doublesThisTurn + 1 : game.doublesThisTurn;

  let log: string;
  const who = `Seat ${me.seat + 1}`;
  if (res.wentToJail) log = `${who} rolled ${d1}+${d2} → sent to HR (jail)!`;
  else if (res.incrementJailTurn) log = `${who} rolled ${d1}+${d2} in jail — no doubles, still stuck.`;
  else if (res.leftJail) log = `${who} escaped jail and moved to ${BOARD[res.newPos].name}.`;
  else log = `${who} rolled ${d1}+${d2}${res.rollAgain ? ' (double!)' : ''} → ${BOARD[res.newPos].name}${res.passedGo ? ' (+$200 GO)' : ''}.`;

  ctx.db.monopolyGame.roomId.update({ ...game, die1: d1, die2: d2, phase, doublesThisTurn, log });
});

// End the current player's turn and pass to the next seat.
export const monopolyEndTurn = spacetimedb.reducer((ctx: any) => {
  const { game } = requireMyTurn(ctx, 'rolled');
  const next = nextActiveSeat(ctx, game);
  ctx.db.monopolyGame.roomId.update({
    ...game, currentSeat: next, phase: 'rolling', doublesThisTurn: 0,
    log: `Seat ${next + 1} to roll.`,
  });
});
