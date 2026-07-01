import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { tilePosition, seatOffset } from '../board';

// A chunky low-poly van (body + cabin + wheels) in the seat's livery colour. It
// smoothly drives to its target tile and bobs while moving. Deliberately basic —
// clean enough to swap for a real model later without touching callers.
export function Van({ posIdx, seat, color }: { posIdx: number; seat: number; color: string }) {
  const group = useRef<THREE.Group>(null);
  const init = tilePosition(posIdx);
  const off = seatOffset(seat);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = tilePosition(posIdx);
    const o = seatOffset(seat);
    const tx = t.x + o.x;
    const tz = t.z + o.z;
    const k = Math.min(1, dt * 6);
    g.position.x += (tx - g.position.x) * k;
    g.position.z += (tz - g.position.z) * k;
    const dist = Math.hypot(tx - g.position.x, tz - g.position.z);
    // hop while travelling, settle flat when arrived
    g.position.y = dist > 0.06 ? Math.abs(Math.sin(state.clock.elapsedTime * 12)) * 0.45 : 0;
  });

  return (
    <group ref={group} position={[init.x + off.x, 0, init.z + off.z]}>
      {/* body */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.3, 0.6, 0.8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* cabin (front) */}
      <mesh position={[0.5, 0.78, 0]}>
        <boxGeometry args={[0.42, 0.42, 0.72]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* windshield */}
      <mesh position={[0.72, 0.78, 0]}>
        <boxGeometry args={[0.06, 0.3, 0.6]} />
        <meshStandardMaterial color="#bfe6ff" />
      </mesh>
      {/* wheels */}
      {[[-0.4, -0.36], [0.4, -0.36], [-0.4, 0.36], [0.4, 0.36]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.18, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.16, 12]} />
          <meshStandardMaterial color="#141414" />
        </mesh>
      ))}
    </group>
  );
}
