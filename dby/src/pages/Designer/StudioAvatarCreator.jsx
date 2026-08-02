import React, { useState, useRef, useEffect } from 'react';
import { 
    Camera, UserCircle2, CheckCircle2, Loader2, Image as ImageIcon, X, 
    Dices, Shirt, Scissors, Smile, Glasses, Palette
} from 'lucide-react';

// 🚀 THE CHARACTER FORGE DATABASE (Validated API Parameters)
const AVATAR_OPTIONS = {
    skinColor: ['ffdbb4', 'edb98a', 'fd9841', 'd08b5b', 'ae5d29', '614335'],
    top: [
        'shortFlat', 'shortRound', 'shortWaved', 'sides', 'theCaesar', 
        'theCaesarAndSidePart', 'dreads01', 'dreads02', 'frizzle', 'shaggy', 
        'shaggyMullet', 'shortCurly', 'bigHair', 'bob', 'bun', 'curly', 
        'curvy', 'dreads', 'frida', 'fro', 'froAndBand', 'straight01', 
        'straight02', 'straightAndStrand', 'eyepatch', 'hat', 'hijab', 
        'turban', 'winterHat01', 'winterHat02'
    ],
    clothing: [
        'blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'graphicShirt', 
        'hoodie', 'overall', 'shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck'
    ],
    facialHair: ['none', 'beardMedium', 'beardLight', 'beardMajestic', 'moustacheFancy', 'moustacheMagnum'],
    accessories: ['none', 'kurt', 'prescription01', 'prescription02', 'round', 'sunglasses', 'wayfarers']
};

const StudioAvatarCreator = ({ currentAvatar, onSave, onClose }) => {
    const [preview, setPreview] = useState(currentAvatar || null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeCategory, setActiveCategory] = useState('top');
    
    // 🚀 CHARACTER STATE ENGINE
    const [charState, setCharState] = useState({
        skinColor: 1,      // index 1: 'edb98a'
        top: 0,            // index 0: 'shortFlat'
        clothing: 0,       // index 0: 'blazerAndShirt'
        facialHair: 0,     // index 0: 'none'
        accessories: 0     // index 0: 'none'
    });

    // 🚀 BULLETPROOF URL BUILDER
    // We construct the URL dynamically. If an option is 'none', we completely omit it.
    const buildAvatarUrl = () => {
        let url = 'https://api.dicebear.com/8.x/avataaars/png?size=500&backgroundColor=111111';
        
        const skin = AVATAR_OPTIONS.skinColor[charState.skinColor];
        const top = AVATAR_OPTIONS.top[charState.top];
        const clothing = AVATAR_OPTIONS.clothing[charState.clothing];
        const facialHair = AVATAR_OPTIONS.facialHair[charState.facialHair];
        const accessories = AVATAR_OPTIONS.accessories[charState.accessories];
        
        // Base attributes (always present)
        url += `&skinColor=${skin}&top=${top}&clothing=${clothing}`;
        
        // Optional attributes (omitted if 'none' to prevent 400 Bad Request errors)
        if (facialHair !== 'none') url += `&facialHair=${facialHair}`;
        if (accessories !== 'none') url += `&accessories=${accessories}`;
        
        return url;
    };

    // Live update the preview when character state changes
    useEffect(() => {
        setPreview(buildAvatarUrl());
    }, [charState]);

    // Handle selecting a specific trait from the grid
    const selectTrait = (category, index) => {
        setCharState(prev => ({ ...prev, [category]: index }));
    };

    // Randomize entire character
    const randomizeCharacter = () => {
        setCharState({
            skinColor: Math.floor(Math.random() * AVATAR_OPTIONS.skinColor.length),
            top: Math.floor(Math.random() * AVATAR_OPTIONS.top.length),
            clothing: Math.floor(Math.random() * AVATAR_OPTIONS.clothing.length),
            facialHair: Math.floor(Math.random() * AVATAR_OPTIONS.facialHair.length),
            accessories: Math.floor(Math.random() * AVATAR_OPTIONS.accessories.length)
        });
    };

    // 🚀 FINALIZE & CONVERT TO FILE
    // We download the generated PNG and convert it into a standard File object for your Node backend
    const handleConfirm = async () => {
        setIsProcessing(true);
        try {
            const finalUrl = buildAvatarUrl();
            const response = await fetch(finalUrl);
            if (!response.ok) throw new Error("Failed to capture avatar image.");
            
            const blob = await response.blob();
            const file = new File([blob], `studio_persona_${Date.now()}.png`, { type: 'image/png' });
            
            if (onSave) onSave(file, finalUrl);
        } catch (error) {
            console.error("Avatar Engine Error:", error);
            alert("Failed to render final identity. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    // Navigation Categories for the UI
    const categories = [
        { id: 'top', label: 'Hair & Headwear', icon: Scissors },
        { id: 'skinColor', label: 'Skin Tone', icon: Palette },
        { id: 'clothing', label: 'Clothing', icon: Shirt },
        { id: 'facialHair', label: 'Facial Hair', icon: Smile },
        { id: 'accessories', label: 'Eyewear', icon: Glasses }
    ];

    return (
        <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col md:flex-row max-w-5xl w-full h-[85vh] mx-auto relative">
            
            {/* AMBIENT GLOW */}
            <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-[#D4AF37]/5 blur-[120px] rounded-full pointer-events-none"></div>

            {/* 🚀 LEFT COLUMN: PREVIEW CANVAS */}
            <div className="md:w-[40%] p-10 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/5 relative bg-[#030303] shadow-inner shrink-0">
                <h3 className="absolute top-8 left-8 text-[9px] font-black uppercase tracking-[0.4em] text-[#D4AF37] flex items-center gap-2">
                    <UserCircle2 size={12} /> The Character Forge
                </h3>

                <div className="relative w-72 h-72 mt-8 flex items-center justify-center group">
                    <div className="absolute inset-[-10px] rounded-full border border-[#D4AF37]/20 group-hover:border-[#D4AF37]/50 transition-colors duration-700 animate-[spin_10s_linear_infinite]"></div>
                    <div className="absolute inset-[-20px] rounded-full border border-white/5 group-hover:border-[#D4AF37]/10 transition-colors duration-700 animate-[spin_15s_linear_infinite_reverse]"></div>
                    
                    <div className="w-full h-full rounded-full bg-[#111] border-2 border-[#D4AF37]/40 shadow-[0_0_50px_rgba(212,175,55,0.15)] overflow-hidden flex items-center justify-center relative z-10 transition-all duration-300">
                        {preview ? (
                            <img src={preview} alt="Avatar Render" className="w-full h-full object-cover scale-110" crossOrigin="anonymous" />
                        ) : (
                            <ImageIcon size={40} className="text-white/20" />
                        )}
                        {isProcessing && (
                            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                <Loader2 className="animate-spin text-[#D4AF37]" size={32} />
                                <span className="text-[9px] font-black uppercase tracking-widest text-[#D4AF37]">Rendering...</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-12 text-center relative z-10 space-y-4 w-full">
                    <button 
                        onClick={randomizeCharacter}
                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl border border-white/10 transition-all flex justify-center items-center gap-2"
                    >
                        <Dices size={14} /> Randomize Persona
                    </button>
                    
                    <button 
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className="w-full py-5 bg-[#D4AF37] text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-xl hover:bg-white transition-all duration-300 shadow-[0_0_30px_rgba(212,175,55,0.3)] flex justify-center items-center gap-2"
                    >
                        <CheckCircle2 size={16} /> Finalize Identity
                    </button>
                </div>
            </div>

            {/* 🚀 RIGHT COLUMN: THE MODULAR BUILDER */}
            <div className="md:w-[60%] flex flex-col h-full relative bg-[#0a0a0a]">
                
                {/* Header & Close Button */}
                <div className="p-8 pb-4 flex items-center justify-between border-b border-white/5 shrink-0">
                    <div>
                        <h4 className="text-xl font-serif text-white">Design Parameters</h4>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold mt-1">Select layers to build your digital twin.</p>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="p-2 text-white/30 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Category Navigation Tabs */}
                <div className="flex border-b border-white/5 bg-[#111]/50 overflow-x-auto scrollbar-none shrink-0 px-4">
                    {categories.map(cat => (
                        <button 
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`py-4 px-5 text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 border-b-2 transition-all duration-300 whitespace-nowrap ${
                                activeCategory === cat.id ? 'border-[#D4AF37] text-[#D4AF37]' : 'border-transparent text-white/40 hover:text-white/80'
                            }`}
                        >
                            <cat.icon size={14} /> {cat.label}
                        </button>
                    ))}
                </div>

                {/* Grid Options Container */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    
                    {/* Skin Tone Special Grid (Colors) */}
                    {activeCategory === 'skinColor' && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 animate-in fade-in duration-300">
                            {AVATAR_OPTIONS.skinColor.map((hex, index) => (
                                <button 
                                    key={hex}
                                    onClick={() => selectTrait('skinColor', index)}
                                    className={`h-20 rounded-2xl border-2 transition-all duration-200 ${
                                        charState.skinColor === index ? 'border-[#D4AF37] scale-105 shadow-[0_0_20px_rgba(212,175,55,0.3)]' : 'border-white/10 hover:border-white/30 hover:scale-105'
                                    }`}
                                    style={{ backgroundColor: `#${hex}` }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Standard Grid for Text Options (Hair, Clothes, etc.) */}
                    {activeCategory !== 'skinColor' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 animate-in fade-in duration-300">
                            {AVATAR_OPTIONS[activeCategory].map((option, index) => (
                                <button 
                                    key={option}
                                    onClick={() => selectTrait(activeCategory, index)}
                                    className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all duration-200 text-center ${
                                        charState[activeCategory] === index 
                                        ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.15)]' 
                                        : 'bg-[#111] border-white/5 text-white/50 hover:border-white/20 hover:text-white'
                                    }`}
                                >
                                    <span className="text-[10px] font-bold uppercase tracking-widest break-words w-full">
                                        {/* Format the camelCase string into readable text */}
                                        {option === 'none' ? 'None' : option.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudioAvatarCreator;