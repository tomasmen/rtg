import { schema } from 'spacetimedb/server';
import { player, gameRoom, roomMember } from './core/tables';
import { fightMatch, fighter, fightInput, fightEvent, fightTick } from './games/fighter/tables';
import { chessGame } from './games/chess/tables';
import { monopolyGame, monopolyPlayer, monopolyProperty } from './games/monopoly/tables';

// The module schema instance lives in its own file so that reducer files can
// import it (`import spacetimedb from '../schema'`) without creating a circular
// dependency with index.ts, which re-exports those reducer files. index.ts is
// the module entry and re-exports this as the default.
const spacetimedb = schema({
  player,
  gameRoom,
  roomMember,
  fightMatch,
  fighter,
  fightInput,
  fightEvent,
  fightTick,
  chessGame,
  monopolyGame,
  monopolyPlayer,
  monopolyProperty,
});
export default spacetimedb;
