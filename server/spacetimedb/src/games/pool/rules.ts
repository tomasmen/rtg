// Pure British 8-ball rules: given what happened on a shot, decide group
// assignment, fouls, whether the shooter continues, ball-in-hand, and win/loss.
// No IO — the tick gathers the shot facts from the physics events and calls this.

export type Assign = 'open' | 'red' | 'yellow';

export interface ShotInput {
  shooterGroup: Assign;                       // shooter's colour before the shot
  firstContact: 'red' | 'yellow' | 'black' | 'none'; // first ball the cue struck
  potted: { red: number; yellow: number; black: boolean; cue: boolean };
  remainingBefore: { red: number; yellow: number };  // counts before this shot
}

export interface ShotResult {
  assignedGroup: Assign;      // shooter's colour after the shot
  foul: boolean;
  continueTurn: boolean;      // shooter shoots again
  ballInHand: boolean;        // opponent places the cue (granted on a foul)
  ended: boolean;
  winnerIsShooter: boolean | null; // when ended
  reason: string;
}

export function resolveShot(input: ShotInput): ShotResult {
  const { shooterGroup, firstContact, potted, remainingBefore } = input;

  // What must the cue legally strike first?
  const cleared = shooterGroup !== 'open' && remainingBefore[shooterGroup] === 0;
  const legalFirst = (g: ShotInput['firstContact']): boolean => {
    if (shooterGroup === 'open') return g === 'red' || g === 'yellow';
    if (cleared) return g === 'black';
    return g === shooterGroup;
  };

  const scratch = potted.cue;
  const contactFoul = firstContact === 'none' || !legalFirst(firstContact);
  const oppPotFoul =
    (shooterGroup === 'red' && potted.yellow > 0) ||
    (shooterGroup === 'yellow' && potted.red > 0);
  const foul = scratch || contactFoul || oppPotFoul;

  // Assign a colour the first time an open shooter legally pots one.
  let assignedGroup: Assign = shooterGroup;
  if (shooterGroup === 'open' && !foul && (potted.red > 0 || potted.yellow > 0)) {
    assignedGroup = potted.red >= potted.yellow && potted.red > 0 ? 'red' : 'yellow';
  }

  // Potting the black ends the game immediately.
  if (potted.black) {
    const legalWin = cleared && !foul;
    return {
      assignedGroup, foul, continueTurn: false, ballInHand: false, ended: true,
      winnerIsShooter: legalWin,
      reason: legalWin ? 'Potted the black — you win! 🏆' : 'Potted the black illegally — you lose.',
    };
  }

  const pottedOwn =
    (assignedGroup === 'red' && potted.red > 0) ||
    (assignedGroup === 'yellow' && potted.yellow > 0);
  const continueTurn = !foul && pottedOwn;

  let reason: string;
  if (foul) reason = scratch ? 'Foul — cue potted (ball in hand).' : contactFoul ? 'Foul — wrong first contact (ball in hand).' : 'Foul — potted opponent (ball in hand).';
  else if (continueTurn) reason = 'Potted your colour — shoot again.';
  else if (potted.red + potted.yellow > 0) reason = 'Potted — turn passes.';
  else reason = 'No pot — turn passes.';

  return { assignedGroup, foul, continueTurn, ballInHand: foul, ended: false, winnerIsShooter: null, reason };
}
