import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../../api/axios';
import { 
    ChevronLeft, 
    ShieldCheck, 
    Download, 
    Layers, 
    CheckCircle2,
    ArrowRight,
    Loader2,
    Tag
} from 'lucide-react';

const DesignDetail = () => {
    const { slug } = useParams(); 
    const navigate = useNavigate();
    const [design, setDesign] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchDesignDetails = async () => {
            try {
                setLoading(true);
                setError(null);
                const { data } = await API.get(`/marketplace/product/${slug}`);
                setDesign(data.data); 
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to load design details.');
            } finally {
                setLoading(false);
            }
        };
        fetchDesignDetails();
    }, [slug]);

    if (loading) return (
        <div className="py-24 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#D4AF37]" size={40} />
        </div>
    );

    if (error || !design) return (
        <div className="py-24 flex flex-col items-center justify-center font-serif">
            <h2 className="text-2xl mb-4 text-center px-4">
                {error || "Masterpiece not found."}
            </h2>
            <button 
                onClick={() => navigate('/designer/marketplace')} 
                className="text-[#D4AF37] underline uppercase text-xs tracking-widest cursor-pointer hover:text-black transition-colors"
            >
                Return to Collection
            </button>
        </div>
    );

    return (
        <div className="selection:bg-[#D4AF37] selection:text-white space-y-8">
            
            {/* Top Navigation Row */}
            <div className="w-full">
                <button 
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] font-bold text-gray-400 hover:text-black transition-colors cursor-pointer"
                >
                    <ChevronLeft size={14} /> Back to Gallery
                </button>
            </div>

            {/* Main Details Presentation Core Layout */}
            <main className="w-full grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-24">
                
                {/* Left Column: Visual Manifestations */}
                <div className="space-y-8">
                    <div className="relative aspect-[4/5] bg-[#FBFBFB] rounded-xl overflow-hidden group border border-gray-100 shadow-sm">
                        <img 
                            src={design.watermarked_preview_url} 
                            alt={design.title} 
                            className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-105"
                        />
                        <div className="absolute top-6 right-6">
                            <span className="bg-white/80 text-[9px] backdrop-blur-xl px-4 py-1.5 uppercase tracking-[0.2em] font-bold border border-white/40 rounded-full shadow-2xs">
                                Verified Preview
                            </span>
                        </div>
                    </div>
                    
                    {/* Technical Specification Grid */}
                    <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-xl overflow-hidden">
                        <div className="bg-white p-6 text-center transition-colors hover:bg-gray-50/50">
                            <Layers size={18} className="mx-auto mb-3 text-[#D4AF37]" />
                            <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">State</p>
                            <p className="text-xs font-serif italic mt-1">{design.canvas_state ? 'Digital Source' : 'Standard'}</p>
                        </div>
                        <div className="bg-white p-6 text-center transition-colors hover:bg-gray-50/50">
                            <CheckCircle2 size={18} className="mx-auto mb-3 text-[#D4AF37]" />
                            <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Origin</p>
                            <p className="text-xs font-serif italic mt-1">Authentic SKU</p>
                        </div>
                        <div className="bg-white p-6 text-center transition-colors hover:bg-gray-50/50">
                            <Download size={18} className="mx-auto mb-3 text-[#D4AF37]" />
                            <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Format</p>
                            <p className="text-xs font-serif italic mt-1">Ready for Print</p>
                        </div>
                    </div>
                </div>

                {/* Right Column: Narrative Information & Pricing Matrix */}
                <div className="flex flex-col justify-between space-y-8">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 bg-gray-100 text-[8px] font-bold uppercase tracking-widest rounded-full">
                                    {design.product_type || 'Digital Asset'}
                                </span>
                                <span className="text-gray-200">|</span>
                                <span className="text-[10px] text-[#D4AF37] uppercase tracking-[0.4em] font-bold italic">
                                    {design.style_category}
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-serif font-light leading-tight uppercase tracking-tight text-gray-900">
                                {design.title}
                            </h1>
                            <p className="text-[11px] text-gray-400 uppercase tracking-widest font-bold">
                                Reference: {design.sku || `SKU-${slug?.substring(0, 8).toUpperCase()}`}
                            </p>
                        </div>

                        <div className="pt-2">
                            <h4 className="text-[10px] uppercase tracking-[0.3em] font-bold mb-3 flex items-center gap-2 text-gray-500">
                                <Tag size={12} className="text-[#D4AF37]" /> Design Narrative
                            </h4>
                            <p className="text-sm text-gray-600 leading-relaxed max-w-md font-light italic">
                                {design.description || "An exclusive digital creation crafted for modern ateliers. This piece embodies contemporary aesthetics with precise attention to detail and form."}
                            </p>
                        </div>
                    </div>

                    {/* Purchase System Controls Box */}
                    <div className="border-t border-gray-100 pt-8 space-y-8">
                        <div className="flex items-end justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                                    {design.license_type || 'Exclusive'} License
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-3xl md:text-4xl font-serif tracking-tight text-gray-900">
                                        ${parseFloat(design.discount_price || design.base_price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </p>
                                    {design.discount_price && (
                                        <p className="text-sm text-gray-400 line-through">
                                            ${parseFloat(design.base_price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase tracking-widest text-green-600 font-bold">Instant Release</p>
                                <p className="text-[9px] text-gray-400 italic">High-res assets provided seamlessly upon transaction clear</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <button className="group w-full bg-slate-900 text-white py-4.5 rounded-xl font-bold uppercase tracking-[0.3em] text-[10px] hover:bg-indigo-600 transition-all flex items-center justify-center gap-4 shadow-md cursor-pointer">
                                Acquire Ownership Parameters <ArrowRight size={14} className="group-hover:translate-x-1.5 transition-transform" />
                            </button>
                            
                            <div className="flex items-center justify-center gap-6 pt-2">
                                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-bold text-gray-400">
                                    <ShieldCheck size={13} className="text-gray-900" /> Encrypted Escrow
                                </div>
                                <div className="w-1 h-1 rounded-full bg-gray-200"></div>
                                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-bold text-gray-400">
                                    Full IP Transfer
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Curated Artist Creator Summary Box */}
                    <div className="pt-6 border-t border-gray-100">
                        <div className="p-5 bg-slate-900 text-white flex items-center justify-between rounded-xl shadow-xs">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shrink-0">
                                    <img 
                                        src={design.designer_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
                                        alt={design.designer_name || "Designer Profile"} 
                                        className="w-full h-full object-cover grayscale" 
                                    />
                                </div>
                                <div>
                                    <p className="text-[8px] uppercase tracking-[0.4em] text-[#D4AF37] mb-0.5 font-bold">Curated By</p>
                                    <h4 className="text-base font-serif italic tracking-wide">{design.designer_name || "Studio Artisan"}</h4>
                                </div>
                            </div>
                            <button 
                                onClick={() => navigate('/designer/profile-view')}
                                className="text-[9px] uppercase tracking-[0.2em] font-bold border-b border-[#D4AF37] text-[#D4AF37] pb-0.5 hover:text-white hover:border-white transition-all cursor-pointer"
                            >
                                Visit Atelier
                            </button>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default DesignDetail;