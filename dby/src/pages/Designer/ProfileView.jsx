import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useParams, useNavigate, Link } from 'react-router-dom';
import API from '../../api/axios';
import { 
    User, Shield, Palette, LayoutGrid, Award, Loader2, ShoppingBag, 
    Globe, MapPin, Sparkles, Compass, Zap, ArrowRight, ShieldCheck, Mail
} from 'lucide-react';

// 🚀 GAMIFIED RANK ALGORITHM
const getDesignerRank = (completedCount = 0) => {
    if (completedCount >= 50) return { name: 'GRAND VISIONARY', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]' };
    if (completedCount >= 20) return { name: 'MASTER CRAFTSMAN', color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10 border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.2)]' };
    if (completedCount >= 5) return { name: 'ATELIER ASSOCIATE', color: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/30 shadow-[0_0_15px_rgba(203,213,225,0.1)]' };
    return { name: 'VISIONARY APPRENTICE', color: 'text-amber-600', bg: 'bg-amber-900/20 border-amber-800/30 shadow-[0_0_15px_rgba(217,119,6,0.1)]' };
};

const ProfileView = () => {
    const { user: loggedUser } = useAuth();
    const { designerId } = useParams(); // If viewing someone else's profile
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('designs');
    const [profileData, setProfileData] = useState(null);
    const [userDesigns, setUserDesigns] = useState([]);
    const [loading, setLoading] = useState(true);

    // 🚀 DUAL-ROLE ARCHITECTURE
    const isOwnProfile = !designerId || String(designerId) === String(loggedUser?.id);
    const isCreator = loggedUser?.role === 'creator';

    // Image path resolver synced with backend assets
    const resolveImageSrc = (url) => {
        if (!url) return '';
        if (url.startsWith('/') && !url.startsWith('//')) return `${API.defaults.baseURL || ''}${url}`;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        const base = API.defaults.baseURL || "http://localhost:8080";
        return `${base}/${url.replace(/\\/g, '/')}`;
    };

    useEffect(() => {
        const fetchCatalogAndProfile = async () => {
            try {
                setLoading(true);
                
                if (isOwnProfile) {
                    // Fetch my own inventory
                    const { data } = await API.get('/designer/my-inventory');
                    const targetData = data.data || data.designs || data;
                    setUserDesigns(Array.isArray(targetData) ? targetData : []);
                    setProfileData(loggedUser);
                } else {
                    // Fetch public profile for Creators/Other Designers
                    const [profileRes, designsRes] = await Promise.all([
                        API.get(`/users/${designerId}`), // Adjust this endpoint to match your public user fetch
                        API.get(`/showcase/pipeline?designer_id=${designerId}`)
                    ]);
                    setProfileData(profileRes.data?.data || profileRes.data);
                    setUserDesigns(designsRes.data?.data || []);
                }

            } catch (err) {
                console.error("Error loading profile matrix:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchCatalogAndProfile();
    }, [designerId, isOwnProfile, loggedUser]);

    const userAvatar = resolveImageSrc(profileData?.profile_image_url || profileData?.profile_image || '');
    const currentRank = getDesignerRank(profileData?.total_completed_bookings || 0);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#030303] flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                    <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                    <Loader2 className="animate-spin text-white/20" size={40} />
                </div>
                <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.3em] animate-pulse">Syncing Portfolio...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans relative overflow-x-hidden pb-32 animate-fade-in">
            
            {/* AMBIENT GLOW */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div>
            </div>

            <div className="max-w-[1400px] mx-auto space-y-8 px-6 mt-12 relative z-10">
                
                {/* 🚀 HIGH-END HEADER PROFILE SECTION */}
                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-[-50%] right-[5%] opacity-[0.03] text-white pointer-events-none rotate-12">
                        <Compass size={400} strokeWidth={0.5} />
                    </div>

                    <div className="flex flex-col md:flex-row items-center text-center md:text-left gap-8 relative z-10">
                        {/* Glowing Avatar */}
                        <div className="w-32 h-32 rounded-full border border-[#D4AF37]/30 bg-[#111] flex-shrink-0 overflow-hidden flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.15)] relative group">
                            <div className="absolute inset-0 bg-[#D4AF37]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 pointer-events-none"></div>
                            {userAvatar ? (
                                <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <User size={40} className="text-white/20" />
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="flex flex-col md:flex-row items-center gap-4">
                                <h1 className="text-4xl md:text-5xl font-serif text-white tracking-tight drop-shadow-md">
                                    {profileData?.full_name || profileData?.username || "Visionary Designer"}
                                </h1>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-inner">
                                    <ShieldCheck size={12} /> Verified {profileData?.role || 'Designer'}
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs font-mono text-white/40 uppercase tracking-widest">
                                {profileData?.email && (
                                    <span className="flex items-center gap-1.5"><Mail size={12} className="text-[#D4AF37]" /> {profileData.email}</span>
                                )}
                                {(profileData?.city || profileData?.country) && (
                                    <>
                                        <span className="hidden md:inline">|</span>
                                        <span className="flex items-center gap-1.5"><MapPin size={12} className="text-[#D4AF37]" /> {[profileData.city, profileData.country].filter(Boolean).join(', ')}</span>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center justify-center md:justify-start pt-2">
                                <span className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-[0.3em] ${currentRank.bg} ${currentRank.color}`}>
                                    <Award size={12} /> {currentRank.name}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 🚀 CREATOR BOOKING TUNNEL: Only Creators see this CTA when viewing others */}
                    {!isOwnProfile && isCreator && (
                        <div className="relative z-10 w-full md:w-auto">
                            <button 
                                onClick={() => navigate(`/creator/bookings/new?designer_id=${profileData.id}`)}
                                className="w-full md:w-auto px-10 py-5 bg-[#D4AF37] hover:bg-white text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_0_30px_rgba(212,175,55,0.3)] hover:-translate-y-1"
                            >
                                <Zap size={16} /> Initiate Commission
                            </button>
                        </div>
                    )}
                </div>

                {/* MAIN SPLIT CONTENT AREA */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
                    
                    {/* LEFT COLUMN: QUICK STATS */}
                    <div className="lg:col-span-1 bg-[#0a0a0a] border border-white/5 p-6 md:p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-[30px] rounded-full pointer-events-none"></div>
                        
                        <h3 className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] font-bold border-b border-white/5 pb-4">Studio Metrics</h3>
                        
                        <div className="space-y-4">
                            <div className="p-5 bg-[#111] rounded-2xl border border-white/5 shadow-inner">
                                <span className="text-3xl font-serif text-white">{userDesigns.length}</span>
                                <p className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-bold mt-1">Catalog Assets</p>
                            </div>
                            
                            {/* ONLY the actual designer sees their available balance */}
                            {isOwnProfile && (
                                <div className="p-5 bg-[#111] rounded-2xl border border-white/5 shadow-inner">
                                    <span className="text-3xl font-serif text-white tracking-tight">
                                        ${Number(profileData?.available_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    <p className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-bold mt-1 flex items-center gap-1.5">
                                        Available Capital
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: INTERACTIVE PORTFOLIO & ABOUT */}
                    <div className="lg:col-span-3 space-y-6 bg-[#0a0a0a] border border-white/5 p-6 md:p-8 rounded-3xl shadow-2xl">
                        
                        {/* Tab Switch Links */}
                        <div className="flex border-b border-white/5 gap-8">
                            <button 
                                onClick={() => setActiveTab('designs')} 
                                className={`pb-4 text-[10px] font-bold uppercase tracking-[0.3em] flex items-center gap-2 border-b-2 transition-all duration-300 whitespace-nowrap ${activeTab === 'designs' ? 'border-[#D4AF37] text-white' : 'border-transparent text-white/30 hover:text-white/60'}`}
                            >
                                <Palette size={14} /> Showcase
                            </button>
                            <button 
                                onClick={() => setActiveTab('about')} 
                                className={`pb-4 text-[10px] font-bold uppercase tracking-[0.3em] flex items-center gap-2 border-b-2 transition-all duration-300 whitespace-nowrap ${activeTab === 'about' ? 'border-[#D4AF37] text-white' : 'border-transparent text-white/30 hover:text-white/60'}`}
                            >
                                <LayoutGrid size={14} /> Profile Bio
                            </button>
                        </div>

                        {activeTab === 'designs' ? (
                            /* PORTFOLIO GRID */
                            userDesigns.length === 0 ? (
                                <div className="bg-[#111] border border-white/5 p-16 text-center rounded-2xl space-y-4 shadow-inner">
                                    <ShoppingBag size={32} className="mx-auto text-white/10" />
                                    <div>
                                        <h4 className="text-xl font-serif italic text-white/80">No assets in the archive</h4>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mt-2">The portfolio is currently empty.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
                                    {userDesigns.map((design, index) => {
                                        const displayImage = resolveImageSrc(design.watermarked_preview_url || design.preview_url || design.image_url || design.image || '');
                                        const currentValuation = design.base_price || design.price || 0;

                                        return (
                                            <div key={design.id || index} className="bg-[#111] border border-white/5 rounded-2xl overflow-hidden group hover:border-[#D4AF37]/50 transition-all duration-500 shadow-lg flex flex-col relative cursor-pointer">
                                                
                                                <div className="h-64 bg-[#030303] overflow-hidden relative">
                                                    {displayImage ? (
                                                        <img src={displayImage} alt={design.title || "Design"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out opacity-80 group-hover:opacity-100" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/10 bg-[#0a0a0a]"><Palette size={32} /></div>
                                                    )}
                                                    
                                                    {/* Deep Hover Shadow */}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                                                    <span className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-white/10 rounded-lg text-[#D4AF37] shadow-lg">
                                                        ${Number(currentValuation).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                                
                                                <div className="p-6 flex-1 flex flex-col justify-between relative z-10 border-t border-white/5">
                                                    <div>
                                                        <h4 className="text-sm font-serif text-white tracking-wide line-clamp-1 group-hover:text-[#D4AF37] transition-colors">{design.title || "Conceptual Masterpiece"}</h4>
                                                        <p className="text-[11px] text-white/40 line-clamp-2 leading-relaxed font-light mt-2">{design.description || "No concept description provided for this design option."}</p>
                                                    </div>
                                                    
                                                    {(design.style_category || design.category) && (
                                                        <span className="inline-block mt-4 text-[8px] font-black bg-white/5 border border-white/10 text-white/50 px-2.5 py-1 uppercase tracking-[0.2em] rounded-md w-max">
                                                            {design.style_category || design.category}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Creator Fast-Action Hover */}
                                                {!isOwnProfile && isCreator && (
                                                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/creator/bookings/new?designer_id=${profileData.id}&design_id=${design.id}&budget=${currentValuation}`);
                                                            }}
                                                            className="px-6 py-3 bg-[#D4AF37] text-black text-[9px] font-black uppercase tracking-[0.2em] rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(212,175,55,0.4)] hover:bg-white hover:scale-105 transition-all"
                                                        >
                                                            <Zap size={14} /> Book Concept
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        ) : (
                            
                            /* TAB CONTENT: ABOUT INFO PANEL */
                            <div className="space-y-8 animate-fadeIn">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em] flex items-center gap-2"><Sparkles size={14} /> Artist Biography</h3>
                                    <div className="p-6 bg-[#111] border border-white/5 rounded-2xl shadow-inner">
                                        <p className="text-xs text-white/60 leading-loose font-light whitespace-pre-wrap">
                                            {profileData?.bio || "The archives currently contain no biographical data for this visionary. The work speaks for itself."}
                                        </p>
                                    </div>
                                </div>

                                {/* External Links block if portfolio URL exists */}
                                {profileData?.portfolio_url && (
                                    <div className="border-t border-white/5 pt-6 space-y-4">
                                        <h4 className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">External Archives</h4>
                                        <a href={profileData.portfolio_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-between w-full sm:w-auto p-4 bg-[#111] border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 transition-all group">
                                            <span className="flex items-center gap-3"><Globe size={16} className="text-[#D4AF37]" /> Access External Portfolio</span>
                                            <ArrowRight size={14} className="text-white/20 group-hover:text-[#D4AF37] transition-colors sm:ml-6" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileView;