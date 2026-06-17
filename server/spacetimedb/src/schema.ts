import { schema } from 'spacetimedb/server';
import { player } from './core/tables';

// The module schema instance lives in its own file so that reducer files can
// import it (`import spacetimedb from '../schema'`) without creating a circular
// dependency with index.ts, which re-exports those reducer files. index.ts is
// the module entry and re-exports this as the default.
const spacetimedb = schema({ player });
export default spacetimedb;
