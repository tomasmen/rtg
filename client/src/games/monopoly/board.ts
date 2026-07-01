// Client mirror of the board: names/types/colors for display + the 3D ring
// layout. Kept in sync with server board.ts (economics live server-side; the
// client only needs to draw the ring and label spaces).

export type SpaceType =
  | 'go' | 'property' | 'railroad' | 'utility' | 'tax'
  | 'chance' | 'chest' | 'jail' | 'gotojail' | 'parking';

export interface Space { name: string; type: SpaceType; group?: string }

export const SPACES: Space[] = [
  { name: 'GO', type: 'go' },
  { name: 'Coffee Machine', type: 'property', group: 'brown' },
  { name: 'Water Cooler', type: 'chest' },
  { name: 'Supply Closet', type: 'property', group: 'brown' },
  { name: 'Payroll Tax', type: 'tax' },
  { name: 'Loading Bay', type: 'railroad' },
  { name: 'Copy Room', type: 'property', group: 'lblue' },
  { name: 'Memo', type: 'chance' },
  { name: 'Pantry', type: 'property', group: 'lblue' },
  { name: 'Break Nook', type: 'property', group: 'lblue' },
  { name: 'HR — Jail', type: 'jail' },
  { name: 'Meeting Room A', type: 'property', group: 'pink' },
  { name: 'Power Room', type: 'utility' },
  { name: 'Meeting Room B', type: 'property', group: 'pink' },
  { name: 'Boardroom', type: 'property', group: 'pink' },
  { name: 'Mailroom', type: 'railroad' },
  { name: 'IT Helpdesk', type: 'property', group: 'orange' },
  { name: 'Water Cooler', type: 'chest' },
  { name: 'Dev Pod', type: 'property', group: 'orange' },
  { name: 'Design Studio', type: 'property', group: 'orange' },
  { name: 'Break Room', type: 'parking' },
  { name: 'Sales Floor', type: 'property', group: 'red' },
  { name: 'Memo', type: 'chance' },
  { name: 'Marketing', type: 'property', group: 'red' },
  { name: 'Finance', type: 'property', group: 'red' },
  { name: 'Delivery Dock', type: 'railroad' },
  { name: 'Server Room', type: 'property', group: 'yellow' },
  { name: 'Data Center', type: 'property', group: 'yellow' },
  { name: 'Server Cooling', type: 'utility' },
  { name: 'Cloud Ops', type: 'property', group: 'yellow' },
  { name: 'Sent to HR', type: 'gotojail' },
  { name: 'Exec Lounge', type: 'property', group: 'green' },
  { name: 'Legal', type: 'property', group: 'green' },
  { name: 'Water Cooler', type: 'chest' },
  { name: 'C-Suite Hallway', type: 'property', group: 'green' },
  { name: 'Courier', type: 'railroad' },
  { name: 'Memo', type: 'chance' },
  { name: 'Corner Office', type: 'property', group: 'dblue' },
  { name: 'Bonus Tax', type: 'tax' },
  { name: 'Executive Suite', type: 'property', group: 'dblue' },
];

export const GROUP_COLORS: Record<string, string> = {
  brown: '#7b4a2b', lblue: '#8fd3f4', pink: '#d6459a', orange: '#e8821e',
  red: '#e0322f', yellow: '#f1d413', green: '#2aa147', dblue: '#2452b0',
};

const TYPE_COLORS: Record<SpaceType, string> = {
  go: '#22c55e', property: '#3a3d4a', railroad: '#5b6472', utility: '#38a37b',
  tax: '#b04a4a', chance: '#d4649a', chest: '#4a86d0', jail: '#b7791f',
  gotojail: '#b91c1c', parking: '#2f3440',
};

export function tileColor(s: Space): string {
  if (s.type === 'property' && s.group) return GROUP_COLORS[s.group] ?? TYPE_COLORS.property;
  return TYPE_COLORS[s.type];
}

// One distinct van livery per seat.
export const VAN_COLORS: string[] = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];

// Half-extent of the board ring (tiles sit on the square perimeter).
export const RING_R = 11;

// World (x,z) position of a board space (idx 0..39). Corners at 0/10/20/30.
// idx 0 (GO) = bottom-right; runs left along the bottom, up the left side,
// right across the top, down the right side back toward GO.
export function tilePosition(idx: number): { x: number; z: number } {
  const R = RING_R;
  if (idx <= 10) return { x: R - (idx / 10) * 2 * R, z: R };            // bottom (right→left)
  if (idx <= 20) return { x: -R, z: R - ((idx - 10) / 10) * 2 * R };    // left (bottom→top)
  if (idx <= 30) return { x: -R + ((idx - 20) / 10) * 2 * R, z: -R };   // top (left→right)
  return { x: R, z: -R + ((idx - 30) / 10) * 2 * R };                   // right (top→bottom)
}

// Small per-seat offset so multiple vans on one tile don't overlap.
export function seatOffset(seat: number): { x: number; z: number } {
  const col = seat % 3;
  const row = Math.floor(seat / 3);
  return { x: (col - 1) * 0.5, z: (row - 0.5) * 0.5 };
}
