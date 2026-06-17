import { describe, it, expect } from 'vitest';
import { roundOutcome, applyRoundWin } from './rounds';

describe('roundOutcome', () => {
  it('KO: winner is the fighter with hp>0', () => {
    expect(roundOutcome(0, 50, false)).toEqual({ over: true, winnerSlot: 1 }); // slot0 hp 0
    expect(roundOutcome(40, 0, false)).toEqual({ over: true, winnerSlot: 0 });
  });
  it('still fighting when both alive and not timed out', () => {
    expect(roundOutcome(40, 50, false)).toEqual({ over: false, winnerSlot: -1 });
  });
  it('timeout: higher hp wins; equal hp = draw (no winner)', () => {
    expect(roundOutcome(60, 40, true)).toEqual({ over: true, winnerSlot: 0 });
    expect(roundOutcome(40, 40, true)).toEqual({ over: true, winnerSlot: -1 });
  });
  it('double KO (both hp<=0) is a draw, not a slot-1 win', () => {
    expect(roundOutcome(0, 0, false)).toEqual({ over: true, winnerSlot: -1 });
  });
});

describe('applyRoundWin', () => {
  it('applyRoundWin tracks wins and ends match at 2 (default best-of-3)', () => {
    expect(applyRoundWin(0, 0, 0)).toEqual({ roundWins0: 1, roundWins1: 0, matchOver: false, matchWinnerSlot: -1 });
    expect(applyRoundWin(1, 1, 1)).toEqual({ roundWins0: 1, roundWins1: 2, matchOver: true, matchWinnerSlot: 1 });
    expect(applyRoundWin(-1, 1, 1)).toEqual({ roundWins0: 1, roundWins1: 1, matchOver: false, matchWinnerSlot: -1 }); // draw: no change
  });

  it('best-of-1 (roundsToWin=1): a single round win ends the match', () => {
    expect(applyRoundWin(0, 0, 0, 1)).toEqual({ roundWins0: 1, roundWins1: 0, matchOver: true, matchWinnerSlot: 0 });
  });

  it('best-of-5 (roundsToWin=3): needs three round wins', () => {
    expect(applyRoundWin(1, 0, 2, 3)).toEqual({ roundWins0: 0, roundWins1: 3, matchOver: true, matchWinnerSlot: 1 });
    expect(applyRoundWin(1, 0, 1, 3)).toEqual({ roundWins0: 0, roundWins1: 2, matchOver: false, matchWinnerSlot: -1 });
  });
});
