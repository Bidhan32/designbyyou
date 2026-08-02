import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, Link as LinkIcon, Instagram, Sparkles, ShieldCheck, Briefcase, Loader2, Package } from 'lucide-react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function CreatorProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // If no ID is passed in the URL, default to the logged-in user's ID
    const targetId = id || currentUser?.id || currentUser?._id;
    const isOwnProfile = String(targetId) === String(currentUser?.id || currentUser?._id);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                setLoading(true);
                const { data } = await API.get(`/users/${targetId}`);
                setProfile(data.data || data);
                setError(null);
            } catch (err) {
                console.error("Failed to fetch profile:", err);
                setError("Visionary profile could not be located.");
            } finally {
                setLoading(false);
            }
        };

        if (targetId) fetchProfile();
    }, [targetId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#030303] flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                    <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                    <Loader2 className="animate-spin text-white/20" size={48} />
                </div>
                <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.3em] animate-pulse">Decrypting Identity...</span>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6">
                <div className="text-center space-y-4">
                    <Sparkles size={40} className="text-white/10 mx-auto" />
                    <h2 className="text-2xl font-serif text-white italic">{error}</h2>
                    <button onClick={() => navigate(-1)} className="px-6 py-2 border border-white/10 text-[10px] uppercase tracking-widest text-white/50 hover:text-white rounded-full">Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans pb-32">
            
            {/* AMBIENT GLOW */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div>
            </div>

            {/* HEADER BANNER */}
            <header className="relative w-full h-[35vh] min-h-[300px] bg-[#0a0a0a] border-b border-white/5 z-10 overflow-hidden">
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#030303] to-transparent"></div>
            </header>

            <main className="max-w-[1200px] mx-auto px-6 md:px-12 relative z-20 -mt-24">
                
                {/* PROFILE IDENTITY CARD */}
                <div className="flex flex-col md:flex-row items-center md:items-end gap-8 mb-16">
                    <div className="relative shrink-0">
                        <img 
                            src={profile.profile_image_url || `https://api.dicebear.com/7.x/initials/svg?seed=${profile.full_name || 'Creator'}`} 
                            alt={profile.full_name} 
                            className="w-40 h-40 md:w-48 md:h-48 rounded-3xl object-cover border-4 border-[#030303] shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-[#111]"
                        />
                        <div className="absolute -bottom-2 -right-2 bg-[#D4AF37] p-2 rounded-full border-4 border-[#030303] shadow-lg">
                            <ShieldCheck size={20} className="text-black" />
                        </div>
                    </div>

                    <div className="text-center md:text-left flex-1">
                        <div className="inline-block px-3 py-1 mb-3 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] text-[9px] font-black uppercase tracking-[0.3em]">
                            Verified Brand Director
                        </div>
                        <h1 className="text-4xl md:text-6xl font-serif text-white tracking-tighter mb-2">
                            {profile.full_name || profile.username}
                        </h1>
                        <p className="text-sm md:text-base text-white/50 font-light max-w-2xl leading-relaxed">
                            {profile.bio || "Building the next generation of modern streetwear and luxury aesthetics. Focused on premium silhouettes and exclusive drops."}
                        </p>
                    </div>

                    {isOwnProfile && (
                        <button onClick={() => navigate('/creator/settings')} className="shrink-0 px-8 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] uppercase tracking-[0.2em] font-bold rounded-xl transition-all shadow-inner hover:-translate-y-1">
                            Edit Identity
                        </button>
                    )}
                </div>

                {/* STATS & LINKS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
                    <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 shadow-xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-[#D4AF37]">
                            <Briefcase size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Commissions</p>
                            <p className="text-2xl font-mono text-white mt-1">{profile.total_completed_bookings || 0}</p>
                        </div>
                    </div>

                    <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 shadow-xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/50">
                            <MapPin size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Base of Operations</p>
                            <p className="text-sm font-medium text-white mt-1 truncate">{profile.location || 'Global / Remote'}</p>
                        </div>
                    </div>

                    <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 shadow-xl flex flex-col justify-center gap-3">
                        <a href="#" className="flex items-center gap-3 text-sm text-white/60 hover:text-white transition-colors">
                            <LinkIcon size={16} /> <span className="truncate">{profile.website || 'atelier.com'}</span>
                        </a>
                        <a href="#" className="flex items-center gap-3 text-sm text-white/60 hover:text-[#D4AF37] transition-colors">
                            <Instagram size={16} /> <span className="truncate">@{profile.username || 'creator'}</span>
                        </a>
                    </div>
                </div>

                {/* BRAND ASSETS SECTION (Placeholder for their drops) */}
                <div className="space-y-8">
                    <h3 className="text-[10px] uppercase tracking-[0.4em] font-black text-white/50 flex items-center gap-3 border-b border-white/5 pb-4">
                        <Package size={16} className="text-white/30" /> Active Collections
                    </h3>
                    
                    <div className="flex flex-col items-center justify-center py-20 bg-[#0a0a0a] border border-white/5 rounded-[2rem] border-dashed">
                        <Sparkles size={32} className="text-white/10 mb-4" />
                        <h4 className="text-xl font-serif text-white/80">No active drops</h4>
                        <p className="text-[10px] uppercase tracking-widest text-white/30 mt-2">Collections will appear here once synthesized.</p>
                    </div>
                </div>

            </main>
        </div>
    );
}