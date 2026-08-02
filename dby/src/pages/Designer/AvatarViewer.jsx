import React, { useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PresentationControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStudioStore } from './store';
import { X, Shirt, Loader2 } from 'lucide-react';

// 🚀 TEXTURE PROCESSOR
const useGarmentTexture = (textureUrl) => {
    return useMemo(() => {
        if (!textureUrl) return null;
        const loader = new THREE.TextureLoader();
        const tex = loader.load(textureUrl);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        // Adjust for typical front-chest/vamp placement
        tex.repeat.set(1.2, 1.2); 
        tex.offset.set(-0.1, -0.1); 
        return tex;
    }, [textureUrl]);
};

// ---------------------------------------------------------
// 🚀 3D BASE MESHES (CLOTHING & SHOES)
// ---------------------------------------------------------

const TShirtMesh = ({ texture }) => (
    <group position={[0, 1.2, 0]}>
        {/* TO USE A REAL .GLB FILE LATER, UNCOMMENT THIS: */}
        {/* <primitive object={useGLTF('/models/tshirt.glb').scene} /> */}
        
        {/* Abstract T-Shirt Fallback */}
        <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.7, 0.6, 2, 32]} />
            <meshStandardMaterial color="#ffffff" map={texture} roughness={0.9} />
        </mesh>
        {/* Shoulders/Sleeves */}
        <mesh castShadow receiveShadow position={[0.8, 0.5, 0]} rotation={[0, 0, -Math.PI / 4]}>
            <cylinderGeometry args={[0.2, 0.2, 1, 16]} />
            <meshStandardMaterial color="#ffffff" map={texture} roughness={0.9} />
        </mesh>
        <mesh castShadow receiveShadow position={[-0.8, 0.5, 0]} rotation={[0, 0, Math.PI / 4]}>
            <cylinderGeometry args={[0.2, 0.2, 1, 16]} />
            <meshStandardMaterial color="#ffffff" map={texture} roughness={0.9} />
        </mesh>
    </group>
);

const DressMesh = ({ texture }) => (
    <group position={[0, 1, 0]}>
        <mesh castShadow receiveShadow>
            {/* Cone geometry mimics a flowing dress/skirt */}
            <coneGeometry args={[1.2, 3.5, 32, 1, true]} />
            <meshStandardMaterial color="#ffffff" map={texture} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
    </group>
);

const PantsMesh = ({ texture }) => (
    <group position={[0, 1, 0]}>
        {/* Left Leg */}
        <mesh castShadow receiveShadow position={[0.4, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.2, 2.5, 32]} />
            <meshStandardMaterial color="#ffffff" map={texture} roughness={0.9} />
        </mesh>
        {/* Right Leg */}
        <mesh castShadow receiveShadow position={[-0.4, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.2, 2.5, 32]} />
            <meshStandardMaterial color="#ffffff" map={texture} roughness={0.9} />
        </mesh>
        {/* Waistband */}
        <mesh castShadow receiveShadow position={[0, 1.3, 0]}>
            <cylinderGeometry args={[0.75, 0.7, 0.4, 32]} />
            <meshStandardMaterial color="#ffffff" map={texture} roughness={0.9} />
        </mesh>
    </group>
);

const SneakerMesh = ({ texture }) => (
    <group position={[0, 0.5, 0]}>
        {/* TO USE A REAL SNEAKER .GLB FILE LATER, UNCOMMENT THIS: */}
        {/* <primitive object={useGLTF('/models/sneaker.glb').scene} /> */}

        {/* Abstract Sneaker Fallback */}
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
            {/* Main Shoe Body (Vamp/Upper) */}
            <capsuleGeometry args={[0.4, 0.5, 1.5, 32]} />
            <meshStandardMaterial color="#ffffff" map={texture} roughness={0.6} />
        </mesh>
        {/* Sole */}
        <mesh castShadow receiveShadow position={[0, -0.6, 0]} scale={[1, 0.2, 2.5]}>
            <boxGeometry args={[0.9, 1, 1]} />
            <meshStandardMaterial color="#111111" roughness={0.2} />
        </mesh>
    </group>
);

// ---------------------------------------------------------
// 🚀 MAIN VIEWER COMPONENT
// ---------------------------------------------------------

export default function AvatarViewer() {
    const { currentTextureUrl, setIs3DMode, activeGarmentMesh } = useStudioStore();
    const texture = useGarmentTexture(currentTextureUrl);

    // Switch statement to render the correct item
    const renderActiveMesh = () => {
        switch(activeGarmentMesh) {
            case 'sneaker': return <SneakerMesh texture={texture} />;
            case 'dress': return <DressMesh texture={texture} />;
            case 'pants': return <PantsMesh texture={texture} />;
            case 'tshirt':
            default: return <TShirtMesh texture={texture} />;
        }
    };

    return (
        <div className="absolute inset-0 z-[100] bg-[#030303] flex flex-col animate-in fade-in duration-500 transition-colors">
            
            {/* 3D Viewer Header */}
            <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10 bg-gradient-to-b from-[#030303]/90 to-transparent pointer-events-none">
                <div className="pointer-events-auto">
                    <h2 className="text-2xl font-serif text-white flex items-center gap-3">
                        <Shirt className="text-[#D4AF37]" /> 
                        3D Fitting <span className="italic text-[#D4AF37]">Room</span>
                    </h2>
                    <p className="text-[10px] text-white/50 uppercase tracking-[0.3em] font-bold mt-1">
                        Viewing: {activeGarmentMesh.toUpperCase()}
                    </p>
                </div>
                
                <button 
                    onClick={() => setIs3DMode(false)}
                    className="pointer-events-auto flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-400 border border-white/10 hover:border-rose-500/50 rounded-full transition-all text-[10px] uppercase tracking-widest font-bold shadow-2xl"
                >
                    <X size={14} /> Return to 2D Canvas
                </button>
            </div>

            {/* The WebGL Canvas */}
            <div className="flex-1 cursor-grab active:cursor-grabbing">
                <Canvas shadows camera={{ position: [0, 1.5, 4], fov: 50 }}>
                    <Suspense fallback={null}>
                        {/* Professional Studio Lighting */}
                        <ambientLight intensity={0.5} />
                        <spotLight position={[5, 5, 5]} angle={0.15} penumbra={1} intensity={1} castShadow />
                        <spotLight position={[-5, 5, -5]} angle={0.15} penumbra={1} intensity={0.5} />
                        <Environment preset="city" /> 

                        <PresentationControls 
                            global 
                            rotation={[0, 0, 0]} 
                            polar={[-0.2, 0.2]} 
                            azimuth={[-Math.PI, Math.PI]} 
                            config={{ mass: 2, tension: 500 }} 
                            snap={{ mass: 4, tension: 1500 }}
                        >
                            {renderActiveMesh()}
                            
                            {/* Ground shadow for realism */}
                            <ContactShadows 
                                position={[0, -0.8, 0]} 
                                opacity={0.6} 
                                scale={10} 
                                blur={2.5} 
                                far={4} 
                            />
                        </PresentationControls>
                        
                        <OrbitControls enableZoom={true} enablePan={false} maxPolarAngle={Math.PI / 1.5} minPolarAngle={Math.PI / 4} />
                    </Suspense>
                </Canvas>
            </div>

            {/* Instructions overlay */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 bg-[#0a0a0a]/80 backdrop-blur-md border border-white/10 rounded-full pointer-events-none shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">
                    Click & Drag to rotate • Scroll to zoom
                </p>
            </div>
        </div>
    );
}