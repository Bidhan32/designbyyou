import React, { useState, useRef } from 'react';
import { 
    Camera, UploadCloud, Sparkles, CheckCircle2, 
    Loader2, X, Fingerprint, Image as ImageIcon, Briefcase, Film, Palette, Zap
} from 'lucide-react';

const AI_STYLES = [
    { id: 'executive', name: 'Corporate Executive', icon: Briefcase, prompt: 'Ultra-realistic corporate headshot, sharp suit, studio lighting, 8k resolution' },
    { id: 'cinematic', name: 'Cinematic Portrait', icon: Film, prompt: 'Cinematic lighting, dramatic shadows, editorial photography, 35mm lens' },
    { id: 'creative', name: 'Creative Studio', icon: Palette, prompt: 'Modern minimalist studio, soft natural light, designer clothing, highly detailed face' }
];

const ProAvatarForge = ({ onSave, onClose }) => {
    const [sourceImage, setSourceImage] = useState(null);
    const [sourceFile, setSourceFile] = useState(null);
    const [selectedStyle, setSelectedStyle] = useState('executive');
    const [resultImage, setResultImage] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSourceFile(file);
            setSourceImage(URL.createObjectURL(file));
            setResultImage(null);
        }
    };

    const handleGenerate = async () => {
        if (!sourceFile) return;
        setIsGenerating(true);

        try {
            const formData = new FormData();
            formData.append('image', sourceFile);
            formData.append('prompt', AI_STYLES.find(s => s.id === selectedStyle).prompt);

            const { data } = await API.post('/designer/avatar/generate', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (data.generated_image_url) {
                setResultImage(data.generated_image_url);
            }
        } catch (error) {
            console.error("Forge Error:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleConfirm = async () => {
        if (!resultImage) return;
        setIsGenerating(true);
        try {
            const response = await fetch(resultImage);
            const blob = await response.blob();
            const file = new File([blob], `pro_avatar_${Date.now()}.png`, { type: 'image/png' });
            if (onSave) onSave(file, resultImage);
        } catch (error) {
            console.error("Failed to process image:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col lg:flex-row w-full max-w-[1100px] h-[80vh] mx-auto relative animate-in zoom-in-95 duration-300">
            
            {/* 🚀 LEFT: THE VISUAL FORGE */}
            <div className="lg:w-[45%] p-8 bg-[#030303] border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D4AF37] flex items-center gap-2">
                    <Fingerprint size={12} /> Identity Preview
                </h3>
                
                <div className="flex-1 flex flex-col items-center justify-center gap-8">
                    <div className="relative w-64 h-64 rounded-full border border-white/10 bg-[#111] flex items-center justify-center overflow-hidden shadow-2xl">
                        {resultImage ? (
                            <img src={resultImage} alt="Final AI Render" className="w-full h-full object-cover" />
                        ) : (
                            <div className="text-white/10 flex flex-col items-center gap-2">
                                <ImageIcon size={40} />
                                <span className="text-[9px] uppercase tracking-widest font-bold">Pending Generation</span>
                            </div>
                        )}
                        
                        {isGenerating && (
                            <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center">
                                <Loader2 className="animate-spin text-[#D4AF37] mb-2" size={32} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]">Forging Reality...</span>
                            </div>
                        )}
                    </div>
                </div>

                <button 
                    onClick={handleConfirm}
                    disabled={!resultImage || isGenerating}
                    className="w-full py-5 bg-[#D4AF37] text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(212,175,55,0.2)] disabled:opacity-30 disabled:shadow-none flex justify-center items-center gap-2"
                >
                    <CheckCircle2 size={16} /> Finalize Identity
                </button>
            </div>

            {/* 🚀 RIGHT: CONTROL PANEL */}
            <div className="lg:w-[55%] p-10 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h4 className="text-2xl font-serif text-white">Photorealistic Forge</h4>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-2">Upload your raw image and select your style.</p>
                    </div>
                    {onClose && <button onClick={onClose} className="text-white/30 hover:text-white"><X size={20} /></button>}
                </div>

                <div className="space-y-8">
                    {/* Upload */}
                    <div className="space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/50">Upload Selfie</label>
                        <div onClick={() => fileInputRef.current.click()} className="w-full border-2 border-dashed border-white/10 hover:border-[#D4AF37]/30 bg-[#111] rounded-xl p-6 flex flex-col items-center cursor-pointer transition-all">
                            <UploadCloud size={20} className={sourceImage ? 'text-[#D4AF37]' : 'text-white/30'} />
                            <span className="text-[10px] font-bold mt-2">{sourceImage ? 'Image Loaded' : 'Click to Upload'}</span>
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                    </div>

                    {/* Styles */}
                    <div className="space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/50">Select Aesthetic</label>
                        <div className="grid grid-cols-1 gap-3">
                            {AI_STYLES.map((style) => (
                                <button key={style.id} onClick={() => setSelectedStyle(style.id)} className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${selectedStyle === style.id ? 'bg-[#D4AF37]/10 border-[#D4AF37]' : 'bg-[#111] border-white/5'}`}>
                                    <div className={`p-2 rounded ${selectedStyle === style.id ? 'bg-[#D4AF37] text-black' : 'bg-[#030303] text-white/30'}`}><style.icon size={16} /></div>
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{style.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || !sourceFile}
                        className="w-full py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase tracking-[0.3em] text-[10px] rounded-xl transition-all flex justify-center items-center gap-2 disabled:opacity-30"
                    >
                        <Zap size={14} className="text-[#D4AF37]" /> Generate Identity
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProAvatarForge;