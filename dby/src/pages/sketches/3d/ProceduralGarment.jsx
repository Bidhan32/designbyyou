import React, { useRef } from 'react';
import { useSketchStore } from '../useSketchStore';

export const ProceduralGarment = () => {
  const meshRef = useRef();
  // Subscribe to the blueprint data from the global store
  const blueprint = useSketchStore((state) => state.blueprint);

  // Default state: What the user sees before generating
  if (!blueprint) {
    return (
      <mesh position={[0, 0, 0]}>
        {/* A simple capsule shape representing an avatar body */}
        <capsuleGeometry args={[0.3, 1, 4, 16]} />
        <meshStandardMaterial color="#d1d5db" wireframe={true} />
      </mesh>
    );
  }

  // Procedural Logic (Stage 3 prototype):
  // We use the JSON parameters to mathematically alter the shapes.
  const isLongSleeve = blueprint.sleeve === 'long';
  const isCropTop = blueprint.length === 'crop';

  const torsoHeight = isCropTop ? 0.6 : 1.2;
  const torsoYPos = isCropTop ? 0.3 : 0; // Shift up if cropped so shoulders align

  return (
    <group>
      {/* Procedural Torso */}
      <mesh position={[0, torsoYPos, 0]} ref={meshRef}>
        <cylinderGeometry args={[0.35, 0.35, torsoHeight, 32]} />
        <meshStandardMaterial color="#4f46e5" roughness={0.7} />
      </mesh>

      {/* Procedural Left Sleeve */}
      <mesh position={[-0.45, 0.4, 0]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.1, 0.1, isLongSleeve ? 0.8 : 0.3, 16]} />
        <meshStandardMaterial color="#4f46e5" roughness={0.7} />
      </mesh>

      {/* Procedural Right Sleeve */}
      <mesh position={[0.45, 0.4, 0]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0.1, 0.1, isLongSleeve ? 0.8 : 0.3, 16]} />
        <meshStandardMaterial color="#4f46e5" roughness={0.7} />
      </mesh>
    </group>
  );
};