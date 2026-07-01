import { SPACES, tilePosition, tileColor } from '../board';

// The board: a dark base plate plus 40 colored tiles laid out on the square ring.
// Basic-but-real 3D for M1; labels/detail come later (the HUD names spaces).
export function Board3D() {
  return (
    <group>
      <mesh position={[0, -0.2, 0]} receiveShadow>
        <boxGeometry args={[26, 0.4, 26]} />
        <meshStandardMaterial color="#0b140e" />
      </mesh>
      {SPACES.map((s, idx) => {
        const { x, z } = tilePosition(idx);
        const isCorner = idx % 10 === 0;
        const size = isCorner ? 2.1 : 1.9;
        return (
          <mesh key={idx} position={[x, 0, z]}>
            <boxGeometry args={[size, isCorner ? 0.45 : 0.35, size]} />
            <meshStandardMaterial color={tileColor(s)} />
          </mesh>
        );
      })}
    </group>
  );
}
