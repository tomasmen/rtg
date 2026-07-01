// The office-themed Monopoly board: 40 spaces around the ring, using the classic
// Monopoly economics (prices, rents, house costs, mortgage values, color groups,
// 4 railroads, 2 utilities, taxes) re-skinned with office names. Static data — no
// per-game state lives here (that's in the tables). Positions run 0..39; the
// client lays them out on a square ring (11 tiles per side, shared corners).
//
// M1 uses only `type`/`name`/`group` (movement + display). The economic fields
// (`price`/`rent`/`houseCost`/`mortgage`/`tax`) are defined now for M2+.

export type SpaceType =
  | 'go'
  | 'property'
  | 'railroad'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'chest'
  | 'jail'      // "just visiting" corner
  | 'gotojail'
  | 'parking';

export interface Space {
  idx: number;
  name: string;
  type: SpaceType;
  group?: string;   // color group id for properties (drives rent doubling + build sets)
  price?: number;   // property / railroad / utility purchase price
  rent?: number[];  // property: [base,1h,2h,3h,4h,hotel]; railroad: [1,2,3,4 owned]
  houseCost?: number;
  mortgage?: number;
  tax?: number;     // tax spaces: amount owed
}

// Corners + key positions (classic layout).
export const GO_IDX = 0;
export const JAIL_IDX = 10;
export const PARKING_IDX = 20;
export const GO_TO_JAIL_IDX = 30;

// Money rules.
export const START_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const MAX_JAIL_TURNS = 3; // forced to pay + move on the 3rd jail turn

export const BOARD: readonly Space[] = [
  { idx: 0,  name: 'GO — Payday',      type: 'go' },
  { idx: 1,  name: 'Coffee Machine',   type: 'property', group: 'brown',  price: 60,  rent: [2, 10, 30, 90, 160, 250],       houseCost: 50,  mortgage: 30 },
  { idx: 2,  name: 'Water Cooler',     type: 'chest' },
  { idx: 3,  name: 'Supply Closet',    type: 'property', group: 'brown',  price: 60,  rent: [4, 20, 60, 180, 320, 450],      houseCost: 50,  mortgage: 30 },
  { idx: 4,  name: 'Payroll Tax',      type: 'tax', tax: 200 },
  { idx: 5,  name: 'Loading Bay',      type: 'railroad', price: 200, rent: [25, 50, 100, 200], mortgage: 100 },
  { idx: 6,  name: 'Copy Room',        type: 'property', group: 'lblue',  price: 100, rent: [6, 30, 90, 270, 400, 550],      houseCost: 50,  mortgage: 50 },
  { idx: 7,  name: 'Memo',             type: 'chance' },
  { idx: 8,  name: 'Pantry',           type: 'property', group: 'lblue',  price: 100, rent: [6, 30, 90, 270, 400, 550],      houseCost: 50,  mortgage: 50 },
  { idx: 9,  name: 'Break Nook',       type: 'property', group: 'lblue',  price: 120, rent: [8, 40, 100, 300, 450, 600],     houseCost: 50,  mortgage: 60 },
  { idx: 10, name: 'HR — Jail',        type: 'jail' },
  { idx: 11, name: 'Meeting Room A',   type: 'property', group: 'pink',   price: 140, rent: [10, 50, 150, 450, 625, 750],    houseCost: 100, mortgage: 70 },
  { idx: 12, name: 'Power Room',       type: 'utility',  price: 150, mortgage: 75 },
  { idx: 13, name: 'Meeting Room B',   type: 'property', group: 'pink',   price: 140, rent: [10, 50, 150, 450, 625, 750],    houseCost: 100, mortgage: 70 },
  { idx: 14, name: 'Boardroom',        type: 'property', group: 'pink',   price: 160, rent: [12, 60, 180, 500, 700, 900],    houseCost: 100, mortgage: 80 },
  { idx: 15, name: 'Mailroom',         type: 'railroad', price: 200, rent: [25, 50, 100, 200], mortgage: 100 },
  { idx: 16, name: 'IT Helpdesk',      type: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950],    houseCost: 100, mortgage: 90 },
  { idx: 17, name: 'Water Cooler',     type: 'chest' },
  { idx: 18, name: 'Dev Pod',          type: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950],    houseCost: 100, mortgage: 90 },
  { idx: 19, name: 'Design Studio',    type: 'property', group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000],   houseCost: 100, mortgage: 100 },
  { idx: 20, name: 'Break Room',       type: 'parking' },
  { idx: 21, name: 'Sales Floor',      type: 'property', group: 'red',    price: 220, rent: [18, 90, 250, 700, 875, 1050],   houseCost: 150, mortgage: 110 },
  { idx: 22, name: 'Memo',             type: 'chance' },
  { idx: 23, name: 'Marketing',        type: 'property', group: 'red',    price: 220, rent: [18, 90, 250, 700, 875, 1050],   houseCost: 150, mortgage: 110 },
  { idx: 24, name: 'Finance',          type: 'property', group: 'red',    price: 240, rent: [20, 100, 300, 750, 925, 1100],  houseCost: 150, mortgage: 120 },
  { idx: 25, name: 'Delivery Dock',    type: 'railroad', price: 200, rent: [25, 50, 100, 200], mortgage: 100 },
  { idx: 26, name: 'Server Room',      type: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150],  houseCost: 150, mortgage: 130 },
  { idx: 27, name: 'Data Center',      type: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150],  houseCost: 150, mortgage: 130 },
  { idx: 28, name: 'Server Cooling',   type: 'utility',  price: 150, mortgage: 75 },
  { idx: 29, name: 'Cloud Ops',        type: 'property', group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150, mortgage: 140 },
  { idx: 30, name: 'Sent to HR',       type: 'gotojail' },
  { idx: 31, name: 'Exec Lounge',      type: 'property', group: 'green',  price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150 },
  { idx: 32, name: 'Legal',            type: 'property', group: 'green',  price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150 },
  { idx: 33, name: 'Water Cooler',     type: 'chest' },
  { idx: 34, name: 'C-Suite Hallway',  type: 'property', group: 'green',  price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, mortgage: 160 },
  { idx: 35, name: 'Courier',          type: 'railroad', price: 200, rent: [25, 50, 100, 200], mortgage: 100 },
  { idx: 36, name: 'Memo',             type: 'chance' },
  { idx: 37, name: 'Corner Office',    type: 'property', group: 'dblue',  price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, mortgage: 175 },
  { idx: 38, name: 'Bonus Tax',        type: 'tax', tax: 100 },
  { idx: 39, name: 'Executive Suite',  type: 'property', group: 'dblue',  price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, mortgage: 200 },
];

// A space is "ownable" if it can have an owner (property/railroad/utility).
export function isOwnable(idx: number): boolean {
  const s = BOARD[idx];
  return s.type === 'property' || s.type === 'railroad' || s.type === 'utility';
}

// Van livery palette (one per seat). Distinct, readable on the board.
export const VAN_COLORS: readonly string[] = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
];
