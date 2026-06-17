import { ROUNDS_TO_WIN } from './constants';

// Pure best-of-3 round logic. No IO, no time, no randomness.

export function roundOutcome(hp0: number, hp1: number, timedOut: boolean):
  { over: boolean; winnerSlot: number } {
  if (hp0 <= 0 && hp1 <= 0) return { over: true, winnerSlot: -1 }; // double KO = draw
  if (hp0 <= 0 || hp1 <= 0) return { over: true, winnerSlot: hp0 <= 0 ? 1 : 0 };
  if (timedOut) return { over: true, winnerSlot: hp0 === hp1 ? -1 : hp0 > hp1 ? 0 : 1 };
  return { over: false, winnerSlot: -1 };
}

export function applyRoundWin(winnerSlot: number, wins0: number, wins1: number):
  { roundWins0: number; roundWins1: number; matchOver: boolean; matchWinnerSlot: number } {
  const r0 = wins0 + (winnerSlot === 0 ? 1 : 0);
  const r1 = wins1 + (winnerSlot === 1 ? 1 : 0);
  const matchOver = r0 >= ROUNDS_TO_WIN || r1 >= ROUNDS_TO_WIN;
  const matchWinnerSlot = !matchOver ? -1 : r0 >= ROUNDS_TO_WIN ? 0 : 1;
  return { roundWins0: r0, roundWins1: r1, matchOver, matchWinnerSlot };
}
