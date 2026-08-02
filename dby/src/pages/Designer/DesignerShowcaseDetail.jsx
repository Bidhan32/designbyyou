import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Zap, Tag, User, Clock, ShieldCheck, Share2, Lock, ShieldAlert, Edit2 } from 'lucide-react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function DesignerShowcaseDetail() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    
    // 🚀 STRICT ROLE GUARDRAIL: Designers only
    const isDesigner = user?.role === 'designer';
    const currentUserId = String(user?.id || user?._id);

    const [asset, setAsset] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isDesigner) {
            setLoading(false);
            return;
        }

        const fetchAssetDetails = async () => {
            try {
                setLoading(true);
                // 🚀 FIXED: Pointing to the optimized marketplace endpoint for the Designer side
                const { data } = await API.get(`/marketplace/product/${slug}`);
                setAsset(data.data);
                setError(null);
            } catch (err) {
                console.error("Failed to load asset details:", err);
                setError("This asset could not be located in the archives.");
            } finally {
                setLoading(false);
            }
        };

        if (slug) fetchAssetDetails();
    }, [slug, isDesigner]);

    // 🚀 SECURITY FALLBACK UI
    if (!isDesigner) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden transition-colors duration-300">
                <div className="absolute inset-0 bg-rose-500/5 blur-[150px] rounded-full w-[50vw] h-[50vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
                <div className="max-w-md w-full bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-3xl p-10 text-center shadow-xl dark:shadow-2xl relative z-10 transition-colors duration-300">
                    <ShieldAlert className="w-16 h-16 text-rose-500/50 mx-auto mb-6" />
                    <h2 className="text-2xl font-serif text-slate-900 dark:text-white tracking-wide mb-2">Access Restricted</h2>
                    <p className="text-[10px] text-slate-500 dark:text-white/50 uppercase tracking-[0.2em] font-bold mb-8 leading-relaxed">This view is restricted to Verified Visionary profiles.</p>
                    <button onClick={() => navigate('/')} className="w-full py-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-all border border-slate-200 dark:border-white/10">Return to Safety</button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[#030303] flex flex-col items-center justify-center gap-6 transition-colors duration-300">
                <div className="relative">
                    <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                    <Loader2 className="animate-spin text-slate-300 dark:text-white/20" size={48} />
                </div>
                <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.3em] animate-pulse">
                    Retrieving Masterpiece...
                </span>
            </div>
        );
    }

    if (error || !asset) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[#030303] flex flex-col items-center justify-center gap-4 text-slate-900 dark:text-white relative overflow-hidden transition-colors duration-300">
                <div className="absolute inset-0 bg-rose-500/5 blur-[150px] rounded-full w-[40vw] h-[40vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
                <div className="relative z-10 text-center">
                    <Sparkles size={40} className="text-slate-300 dark:text-white/20 mx-auto mb-4" />
                    <p className="font-serif text-2xl italic tracking-wide mb-2">Signal Lost.</p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/40 mb-8">{error}</p>
                    <button onClick={() => navigate('/designer/showcase')} className="px-8 py-4 border border-slate-300 dark:border-white/10 hover:border-[#D4AF37] dark:hover:border-[#D4AF37] text-[10px] uppercase tracking-widest transition-colors rounded-full bg-white dark:bg-[#0a0a0a] shadow-sm dark:shadow-none">
                        Return to Gallery
                    </button>
                </div>
            </div>
        );
    }

    // Map to owner_id to properly verify if the current user uploaded this
    const ownerId = String(asset.owner_id || asset.designer_id);
    const isOwnUpload = ownerId === currentUserId;
    const imageUrl = asset.high_res_file_url || asset.watermarked_preview_url;

    return (
        <div className="selection:bg-[#D4AF37] selection:text-black min-h-screen bg-slate-50 dark:bg-[#030303] text-slate-900 dark:text-white font-sans overflow-x-hidden transition-colors duration-300">
            
            {/* FLOATING GLASSMORPHIC NAV */}
            <nav className="fixed top-0 left-0 w-full z-50 bg-gradient-to-b from-slate-50/90 dark:from-[#030303]/90 to-transparent pt-6 pb-12 px-6 md:px-12 pointer-events-none transition-colors duration-300">
                <div className="max-w-[1600px] mx-auto flex justify-between items-center pointer-events-auto">
                    <button 
                        onClick={() => navigate('/designer/showcase')}
                        className="w-12 h-12 rounded-full bg-white/80 dark:bg-[#111]/80 border border-slate-200 dark:border-white/10 backdrop-blur-md flex items-center justify-center text-slate-600 dark:text-white/70 hover:text-[#D4AF37] dark:hover:text-[#D4AF37] hover:border-[#D4AF37]/50 hover:bg-slate-100 dark:hover:bg-black transition-all duration-300 shadow-lg dark:shadow-xl group"
                    >
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                    
                    <button className="w-12 h-12 rounded-full bg-white/80 dark:bg-[#111]/80 border border-slate-200 dark:border-white/10 backdrop-blur-md flex items-center justify-center text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-black transition-all duration-300 shadow-lg dark:shadow-xl">
                        <Share2 size={16} />
                    </button>
                </div>
            </nav>

            {/* FULL BLEED CINEMATIC HERO */}
            <header className="relative w-full h-[85vh] min-h-[600px] flex items-end">
                {/* Immersive Background Image */}
                <div className="absolute inset-0 w-full h-full">
                    {imageUrl ? (
                        <img 
                            src={imageUrl} 
                            alt={asset.title} 
                            className="w-full h-full object-cover opacity-60 dark:opacity-[0.85] mix-blend-multiply dark:mix-blend-screen animate-fade-in"
                        />
                    ) : (
                        <div className="w-full h-full bg-slate-100 dark:bg-[#0a0a0a] flex items-center justify-center transition-colors duration-300">
                            <Sparkles size={64} className="text-slate-300 dark:text-white/5" />
                        </div>
                    )}
                </div>

                {/* Vertical Fade (Blends image seamlessly into the background below) */}
                <div className="absolute inset-0 bg-gradient-to-b from-slate-50/40 dark:from-[#030303]/40 via-slate-50/60 dark:via-[#030303]/60 to-slate-50 dark:to-[#030303] opacity-100 transition-colors duration-300"></div>

                {/* Hero Content (Anchored to bottom left) */}
                <div className="relative z-10 w-full max-w-[1600px] mx-auto px-6 md:px-12 pb-16 animate-fade-in-up">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div className="max-w-3xl">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="h-[1px] w-8 bg-[#D4AF37]"></span>
                                <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-[#D4AF37]">
                                    {asset.style_category || 'Creative Concept'}
                                </span>
                            </div>
                            <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-light leading-[1.1] tracking-tighter text-slate-900 dark:text-white drop-shadow-lg dark:drop-shadow-2xl transition-colors duration-300">
                                {asset.title}
                            </h1>
                        </div>

                        {/* Hero Pricing & Action */}
                        <div className="flex-shrink-0 flex flex-col items-start md:items-end gap-6 md:pb-3">
                            <div className="text-left md:text-right">
                                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:text-white/50 font-bold mb-1 transition-colors">Commission Base</p>
                                <p className="text-5xl font-light font-mono text-[#D4AF37] drop-shadow-[0_0_10px_rgba(212,175,55,0.2)] dark:drop-shadow-[0_0_15px_rgba(212,175,55,0.4)]">
                                    ${parseFloat(asset.starting_price || asset.base_price || 0).toFixed(0)}
                                </p>
                            </div>

                            {/* ACTION BUTTONS WRAPPER */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                                
                                {/* REMIX BUTTON (Navigates to Studio) */}
                                <button 
                                    onClick={() => navigate(`/designer/sketch?remix=${asset.slug}`)}
                                    className="px-8 py-5 text-[10px] uppercase tracking-[0.3em] font-black border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/15 text-slate-800 dark:text-white flex items-center justify-center gap-3 backdrop-blur-xl shadow-sm dark:shadow-inner transition-colors duration-300"
                                >
                                    <Edit2 size={14} /> Remix & Experiment
                                </button>

                                {/* Enforcing the strict one-way booking rule */}
                                {isOwnUpload ? (
                                    <div className="px-8 py-5 text-[10px] uppercase tracking-[0.3em] font-black border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] flex items-center justify-center gap-3 backdrop-blur-xl shadow-inner">
                                        <ShieldCheck size={14} /> 
                                        Verified Owner
                                    </div>
                                ) : (
                                    <div className="px-8 py-5 text-[10px] uppercase tracking-[0.3em] font-black border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-[#111]/80 text-slate-400 dark:text-white/30 flex items-center justify-center gap-3 backdrop-blur-xl cursor-not-allowed shadow-sm dark:shadow-inner transition-colors duration-300">
                                        <Lock size={14} /> 
                                        Client Feature Only
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* EDITORIAL CONTENT BODY */}
            <main className="max-w-[1600px] mx-auto px-6 md:px-12 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 relative z-10">
                
                {/* Left Column: Vision & Brief */}
                <div className="lg:col-span-8 space-y-16 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                    
                    <section className="space-y-6">
                        <h3 className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-white/40 font-bold border-b border-slate-200 dark:border-white/10 pb-4 transition-colors duration-300">
                            The Vision
                        </h3>
                        <p className="font-serif text-2xl md:text-3xl text-slate-800 dark:text-white/80 leading-relaxed font-light whitespace-pre-wrap transition-colors duration-300">
                            {asset.description || "No project brief was provided for this asset."}
                        </p>
                    </section>

                    {/* Aesthetic Tags Display */}
                    {asset.tags && asset.tags.length > 0 && (
                        <section className="space-y-6">
                            <h3 className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-white/40 font-bold border-b border-slate-200 dark:border-white/10 pb-4 transition-colors duration-300">
                                Identity Matrix
                            </h3>
                            <div className="flex flex-wrap gap-3">
                                {asset.tags.map((tag, idx) => (
                                    <span key={idx} className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/5 text-slate-600 dark:text-white/60 text-[9px] uppercase tracking-[0.2em] font-bold px-4 py-2 shadow-sm dark:shadow-inner hover:text-slate-900 dark:hover:text-white transition-colors cursor-default duration-300">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* Right Column: Ledger / Specs */}
                <div className="lg:col-span-4 space-y-10 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                    
                    {/* The Artist Plaque */}
                    <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 p-8 relative overflow-hidden shadow-lg dark:shadow-2xl transition-colors duration-300">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 blur-[50px]"></div>
                        
                        <h3 className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-white/40 font-bold mb-6 transition-colors duration-300">
                            The Creator
                        </h3>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[#111] border border-slate-200 dark:border-white/10 shadow-inner overflow-hidden flex items-center justify-center shrink-0 transition-colors duration-300">
                                {asset.owner_avatar || asset.designer_avatar ? (
                                    <img src={asset.owner_avatar || asset.designer_avatar} alt="Creator" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={24} className="text-slate-300 dark:text-white/20" />
                                )}
                            </div>
                            <div>
                                <p className="font-serif text-2xl text-slate-900 dark:text-white transition-colors duration-300">{asset.owner_name || asset.designer_name || 'Anonymous'}</p>
                                <p className="text-[9px] text-[#D4AF37] font-black uppercase tracking-widest mt-1">Verified Artist</p>
                            </div>
                        </div>
                        
                        <div className="block w-full py-4 bg-slate-50 dark:bg-[#111] text-center text-[9px] uppercase tracking-[0.3em] font-bold text-slate-500 dark:text-white/50 border border-slate-200 dark:border-white/5 shadow-inner cursor-default transition-colors duration-300">
                            {isOwnUpload ? 'This is Your Profile' : 'Peer Profile View'}
                        </div>
                    </div>

                    {/* Spec Sheet Grid */}
                    <div className="space-y-6">
                        <h3 className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-white/40 font-bold border-b border-slate-200 dark:border-white/10 pb-4 transition-colors duration-300">
                            Asset Protocol
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                            <div>
                                <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-white/30 font-bold mb-2 flex items-center gap-1.5 transition-colors duration-300"><ShieldCheck size={12}/> License</p>
                                <p className="text-sm font-medium text-slate-800 dark:text-white/90 capitalize transition-colors duration-300">{asset.license_type || 'Standard Use'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-white/30 font-bold mb-2 flex items-center gap-1.5 transition-colors duration-300"><Tag size={12}/> Format</p>
                                <p className="text-sm font-medium text-slate-800 dark:text-white/90 capitalize transition-colors duration-300">{asset.product_type?.replace('_', ' ') || 'Digital Concept'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-white/30 font-bold mb-2 flex items-center gap-1.5 transition-colors duration-300"><Clock size={12}/> Published</p>
                                <p className="text-sm font-medium text-slate-800 dark:text-white/90 transition-colors duration-300">
                                    {new Date(asset.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                                </p>
                            </div>
                            <div>
                                <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-white/30 font-bold mb-2 flex items-center gap-1.5 transition-colors duration-300"><Zap size={12}/> Status</p>
                                <p className="text-sm font-medium text-emerald-500 dark:text-emerald-400 transition-colors duration-300">Available for Escrow</p>
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            {/* STICKY MOBILE CTA (Only visible on small screens) */}
            <div className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-slate-50 dark:from-[#030303] via-slate-50/90 dark:via-[#030303]/90 to-transparent md:hidden z-50 pointer-events-none flex flex-col gap-2 transition-colors duration-300">
                <div className="pointer-events-auto w-full">
                    <button 
                        onClick={() => navigate(`/designer/sketch?remix=${asset.slug}`)}
                        className="w-full py-4 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-800 dark:text-white border border-slate-300 dark:border-white/15 text-[10px] uppercase tracking-[0.2em] font-black flex items-center justify-center gap-2 shadow-md dark:shadow-inner backdrop-blur-xl transition-colors duration-300 mb-2"
                    >
                        <Edit2 size={14} /> Remix Concept
                    </button>
                    
                    {isOwnUpload ? (
                        <div className="w-full py-4 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 text-[10px] uppercase tracking-[0.2em] font-black flex items-center justify-center gap-2 shadow-inner backdrop-blur-xl">
                            <ShieldCheck size={14} /> Verified Owner
                        </div>
                    ) : (
                        <div className="w-full py-4 bg-slate-100/90 dark:bg-[#111]/90 text-slate-400 dark:text-white/30 border border-slate-200 dark:border-white/10 text-[10px] uppercase tracking-[0.2em] font-black flex items-center justify-center gap-2 backdrop-blur-xl shadow-sm dark:shadow-inner transition-colors duration-300">
                            <Lock size={14} /> Client Feature Only
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}