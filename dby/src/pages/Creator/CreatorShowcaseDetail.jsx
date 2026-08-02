import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
// 🚀 ADDED: Edit2 for the Remix button
import { ChevronLeft, Loader2, Zap, Sparkles, Star, Briefcase, Tag, Calendar, User, ShieldAlert, Lock, Edit2 } from 'lucide-react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function CreatorShowcaseDetail() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth(); 
    
    const isCreator = user?.role === 'creator';
    // Get the current user's ID safely
    const currentUserId = String(user?.id || user?._id);

    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isCreator) {
            setLoading(false);
            return;
        }

        const fetchItemDetails = async () => {
            try {
                setLoading(true);
                // 🚀 FIXED: Pointed to the dedicated creator-showcase route
                const { data } = await API.get(`/creator-showcase/item/${slug}`);
                setItem(data.data);
            } catch (err) {
                console.error("Failed to load showcase item:", err);
                setError("Portfolio item not found or no longer available.");
            } finally {
                setLoading(false);
            }
        };

        if (slug) fetchItemDetails();
    }, [slug, isCreator]);

    if (!isCreator) {
        return (
            <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-rose-500/5 blur-[150px] rounded-full w-[50vw] h-[50vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
                <div className="max-w-md w-full bg-[#0a0a0a] border border-white/5 rounded-3xl p-10 text-center shadow-2xl relative z-10">
                    <ShieldAlert className="w-16 h-16 text-rose-500/50 mx-auto mb-6" />
                    <h2 className="text-2xl font-serif text-white tracking-wide mb-2">Access Restricted</h2>
                    <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] font-bold mb-8 leading-relaxed">The Inspiration Directory is exclusively reserved for Verified Creators.</p>
                    <button onClick={() => navigate('/')} className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-all border border-white/10">Return to Safety</button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#030303] flex flex-col items-center justify-center gap-4">
                <div className="relative">
                    <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                    <Loader2 className="animate-spin text-white/20" size={40} />
                </div>
                <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.3em] animate-pulse">Summoning Masterpiece...</span>
            </div>
        );
    }

    if (error || !item) {
        return (
            <div className="min-h-screen bg-[#030303] flex flex-col items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] bg-rose-500/5 blur-[120px] rounded-full pointer-events-none z-0"></div>
                <div className="max-w-md w-full bg-[#0a0a0a] p-10 rounded-3xl border border-white/10 shadow-2xl text-center space-y-4 relative z-10 backdrop-blur-xl">
                    <Sparkles size={48} className="text-white/10 mx-auto mb-6" />
                    <h2 className="text-2xl font-serif text-white tracking-wide">Item Not Found</h2>
                    <p className="text-xs text-white/40 uppercase tracking-widest font-bold">{error}</p>
                    <Link to="/creator/showcase" className="inline-block mt-8 py-3 px-8 bg-[#D4AF37] text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-full hover:bg-white transition-all shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                        Return to Archive
                    </Link>
                </div>
            </div>
        );
    }

    // Determine if the logged-in user owns this asset
    const isOwnItem = String(item.designer_id) === currentUserId;

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans relative overflow-x-hidden pb-32 animate-fade-in">
            
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-[#D4AF37]/10 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '10s' }}></div>
                <div className="absolute bottom-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-[#6b5818]/5 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '14s' }}></div>
            </div>

            <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40 px-6 py-5 shadow-2xl">
                <div className="max-w-[1800px] mx-auto flex items-center justify-between">
                    <Link to="/creator/showcase" className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 hover:text-white transition-colors group">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors border border-white/5">
                            <ChevronLeft size={14} />
                        </div>
                        Back to Directory
                    </Link>
                    <div className="text-[9px] font-black uppercase tracking-[0.25em] bg-[#D4AF37]/10 text-[#D4AF37] px-4 py-2 rounded-full border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]">
                        {item.style_category || 'Creative Asset'}
                    </div>
                </div>
            </div>

            <div className="max-w-[1800px] mx-auto px-6 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
                
                <div className="lg:col-span-8 space-y-8">
                    <div className="bg-[#0a0a0a] rounded-3xl border border-white/5 shadow-2xl overflow-hidden aspect-[4/3] flex items-center justify-center relative group p-2">
                        <div className="w-full h-full rounded-2xl overflow-hidden relative bg-[#111]">
                            {item.watermarked_preview_url ? (
                                <img 
                                    src={item.watermarked_preview_url} 
                                    alt={item.title} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[1.5s] ease-out opacity-95 group-hover:opacity-100"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-white/10 gap-2">
                                    <Sparkles size={48} />
                                    <span className="text-[10px] uppercase tracking-widest font-black">Encrypted</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#030303]/80 via-transparent to-transparent pointer-events-none"></div>
                        </div>
                    </div>

                    <div className="bg-[#0a0a0a] rounded-3xl border border-white/5 shadow-2xl p-10 space-y-8">
                        <div>
                            <h1 className="text-4xl md:text-5xl font-serif font-light text-white tracking-tight leading-tight mb-4">
                                {item.title}
                            </h1>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Calendar size={12} className="text-[#D4AF37]" /> 
                                Synthesized {new Date(item.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                        
                        <div className="h-px w-full bg-gradient-to-r from-white/10 via-white/5 to-transparent"></div>

                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D4AF37] mb-4 flex items-center gap-2">
                                <Sparkles size={12} /> Concept Architecture
                            </h3>
                            <p className="text-white/70 leading-loose whitespace-pre-wrap font-light text-sm md:text-base">
                                {item.description || "No technical description provided by the visionary."}
                            </p>
                        </div>

                        {item.tags && item.tags.length > 0 && (
                            <div className="pt-4">
                                <div className="flex flex-wrap gap-2">
                                    {item.tags.map((tag, i) => (
                                        <span key={i} className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/50 bg-white/5 px-4 py-2 rounded-full border border-white/10 hover:border-white/20 hover:text-white transition-colors cursor-default shadow-inner">
                                            <Tag size={10} /> {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    
                    <div className="bg-[#111] rounded-3xl p-8 text-white border border-[#D4AF37]/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden sticky top-32">
                        <div className="absolute -top-20 -right-20 opacity-[0.03] text-[#D4AF37] rotate-12">
                            <Zap size={250} strokeWidth={1} />
                        </div>
                        
                        <div className="relative z-10 space-y-8">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.3em] font-black text-[#D4AF37] mb-3">Contract Valuation</p>
                                <div className="flex items-end gap-3">
                                    <span className="text-5xl font-serif tracking-tighter">${parseFloat(item.starting_price || item.base_price || 0).toFixed(0)}</span>
                                    <span className="text-[10px] text-white/40 mb-2 font-bold uppercase tracking-widest">Base Rate</span>
                                </div>
                            </div>

                            <p className="text-xs text-white/50 leading-relaxed border-t border-white/10 pt-6 font-light">
                                Initiate a secure escrow contract with the visionary to build a bespoke adaptation of this concept for your brand, or open it in the studio to experiment yourself.
                            </p>

                            {/* 🚀 ACTION BUTTONS AREA */}
                            <div className="space-y-3">
                                
                                {/* 🚀 REMIX BUTTON (Navigates to Canvas) */}
                                <button 
                                    onClick={() => navigate(`/creator/sketch?remix=${item.slug}`)}
                                    className="w-full py-4 bg-white/5 hover:bg-white/15 text-white border border-white/15 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
                                >
                                    <Edit2 size={14} className="inline-block mb-1" /> Remix & Experiment
                                </button>

                                {/* PRIMARY CTA (Book / Owned) */}
                                {isOwnItem ? (
                                    <div className="w-full py-4 bg-white/5 text-white/30 border border-white/10 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2 cursor-not-allowed shadow-inner">
                                        <Lock size={14} className="inline-block mb-1" /> Asset Owner
                                    </div>
                                ) : (
                                    <Link 
                                        to={`/creator/bookings/new?designer_id=${item.designer_id}&design_id=${item.design_id || item.id}&budget=${item.starting_price || item.base_price || 0}`} 
                                        className="w-full py-4 bg-[#D4AF37] hover:bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.2)] flex items-center justify-center gap-2 block text-center"
                                    >
                                        <Zap size={14} className="inline-block mb-1" /> Initiate Commission
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#0a0a0a] rounded-3xl border border-white/5 shadow-2xl p-8 space-y-6 relative overflow-hidden">
                        
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-16 h-16 rounded-full bg-[#111] border border-white/10 shadow-inner overflow-hidden flex-shrink-0">
                                {item.designer_avatar ? (
                                    <img src={item.designer_avatar} alt={item.designer_name} className="w-full h-full object-cover opacity-90" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20 m-auto mt-[4px]"><User size={24}/></div>
                                )}
                            </div>
                            <div>
                                <h3 className="font-serif text-white text-xl leading-tight mb-1">{item.designer_name}</h3>
                                <p className="text-[9px] font-black text-[#D4AF37] uppercase tracking-[0.2em]">Verified Visionary Pro</p>
                            </div>
                        </div>

                        {item.bio && (
                            <p className="text-xs text-white/50 leading-relaxed italic bg-[#111] p-5 rounded-2xl border border-white/5 shadow-inner relative z-10 font-light">
                                "{item.bio}"
                            </p>
                        )}

                        <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6 relative z-10">
                            <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center text-center hover:bg-white/10 hover:border-white/10 transition-all shadow-inner">
                                <Star size={16} className="text-[#D4AF37] mb-2 shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
                                <span className="text-xl font-serif text-white mb-1">{item.avg_rating || '5.0'}</span>
                                <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Rating</span>
                            </div>
                            <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center text-center hover:bg-white/10 hover:border-white/10 transition-all shadow-inner">
                                <Briefcase size={16} className="text-white/60 mb-2" />
                                <span className="text-xl font-serif text-white mb-1">{item.total_completed_bookings || '0'}</span>
                                <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Projects</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}