import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    Search, SlidersHorizontal, Star, Zap, Crown, User, 
    CheckCircle2, ArrowUpRight, Loader2, ShieldAlert, Sparkles,
    Briefcase, DollarSign
} from 'lucide-react';
import API from '../../api/axios'; // Adjust path as needed
import { useAuth } from '../../context/AuthContext';

const SPECIALTIES = ['All', 'Streetwear', 'Avant-Garde', 'Minimalism', 'Haute-Couture', 'Techwear', 'Concept Art'];

export default function DesignerDirectory() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isCreator = user?.role === 'creator';

    const [designers, setDesigners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filter & Search States
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSpecialty, setSelectedSpecialty] = useState('All');
    const [maxBudget, setMaxBudget] = useState(2000); // Max starting rate threshold
    const [sortBy, setSortBy] = useState('top_rated'); // 'top_rated' | 'most_bookings' | 'price_low' | 'price_high'

    // Fetch Designers
    useEffect(() => {
        const fetchDesigners = async () => {
            try {
                setLoading(true);
                // Fetch all users and filter for active designers
                const { data } = await API.get('/users');
                const userList = Array.isArray(data) ? data : data?.data || [];
                
                const verifiedDesigners = userList.filter(u => u.role === 'designer');
                setDesigners(verifiedDesigners);
                setError(null);
            } catch (err) {
                console.error("Failed to load designer directory:", err);
                setError("Unable to connect to the Visionary Directory.");
            } finally {
                setLoading(false);
            }
        };

        if (isCreator) {
            fetchDesigners();
        } else {
            setLoading(false);
        }
    }, [isCreator]);

    // Client-side Filtering & Sorting Logic
    const filteredDesigners = useMemo(() => {
        return designers
            .filter((designer) => {
                const name = (designer.full_name || designer.username || '').toLowerCase();
                const bio = (designer.bio || '').toLowerCase();
                const query = searchQuery.toLowerCase().trim();

                // 1. Search Query Match
                const matchesSearch = !query || name.includes(query) || bio.includes(query);

                // 2. Specialty Category Match
                const designerSpecialties = designer.specialties || designer.style_categories || [];
                const matchesSpecialty = selectedSpecialty === 'All' || 
                    designerSpecialties.includes(selectedSpecialty) ||
                    bio.includes(selectedSpecialty.toLowerCase());

                // 3. Price Filter Match (Starting Rate <= Max Budget)
                const startingRate = parseFloat(designer.starting_rate || designer.base_rate || 0);
                const matchesPrice = startingRate <= maxBudget;

                return matchesSearch && matchesSpecialty && matchesPrice;
            })
            .sort((a, b) => {
                const rateA = parseFloat(a.starting_rate || a.base_rate || 0);
                const rateB = parseFloat(b.starting_rate || b.base_rate || 0);
                const ratingA = parseFloat(a.avg_rating || 5.0);
                const ratingB = parseFloat(b.avg_rating || 5.0);
                const bookingsA = parseInt(a.total_completed_bookings || 0);
                const bookingsB = parseInt(b.total_completed_bookings || 0);

                if (sortBy === 'top_rated') return ratingB - ratingA;
                if (sortBy === 'most_bookings') return bookingsB - bookingsA;
                if (sortBy === 'price_low') return rateA - rateB;
                if (sortBy === 'price_high') return rateB - rateA;
                return 0;
            });
    }, [designers, searchQuery, selectedSpecialty, maxBudget, sortBy]);

    // Role Guardrail Fallback
    if (!isCreator) {
        return (
            <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-rose-500/5 blur-[150px] rounded-full w-[50vw] h-[50vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
                <div className="max-w-md w-full bg-[#0a0a0a] border border-white/5 rounded-3xl p-10 text-center shadow-2xl relative z-10">
                    <ShieldAlert className="w-16 h-16 text-rose-500/50 mx-auto mb-6" />
                    <h2 className="text-2xl font-serif text-white tracking-wide mb-2">Access Restricted</h2>
                    <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] font-bold mb-8 leading-relaxed">
                        The Visionary Directory is exclusively reserved for Verified Creators.
                    </p>
                    <button onClick={() => navigate('/')} className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-all border border-white/10">
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans relative overflow-x-hidden pb-32">
            
            {/* AMBIENT GLOW */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#D4AF37]/5 blur-[150px] rounded-full animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-indigo-500/5 blur-[150px] rounded-full"></div>
            </div>

            <main className="max-w-[1700px] mx-auto px-6 md:px-12 pt-12 relative z-10">
                
                {/* PAGE HEADER */}
                <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[9px] uppercase tracking-[0.4em] text-[#D4AF37] font-bold shadow-[0_0_20px_rgba(212,175,55,0.1)]">
                        <Crown size={12} /> Elite Visionary Network
                    </div>
                    <h1 className="text-5xl md:text-7xl font-serif font-light text-white tracking-tighter drop-shadow-2xl">
                        Commission <span className="italic text-[#D4AF37] font-bold">Designers</span>
                    </h1>
                    <p className="text-white/40 text-xs md:text-sm font-light uppercase tracking-widest max-w-xl mx-auto leading-relaxed">
                        Discover top digital architects, filter by rate, and launch instant escrow contracts.
                    </p>
                </div>

                {/* CONTROLS BAR: SEARCH, FILTERS & PRICE RANGE */}
                <div className="bg-[#0a0a0a]/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 md:p-8 mb-12 shadow-[0_20px_60px_rgba(0,0,0,0.8)] space-y-6">
                    
                    {/* Top Row: Search input + Sort dropdown */}
                    <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
                        
                        {/* Search Bar */}
                        <div className="relative w-full lg:w-[600px] group">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[#D4AF37] transition-colors" size={18} />
                            <input 
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by designer name, aesthetic, or keyword..."
                                className="w-full bg-[#111] border border-white/10 rounded-full py-4 pl-14 pr-6 text-xs text-white outline-none focus:border-[#D4AF37]/50 transition-all placeholder:text-white/20 tracking-wide font-light shadow-inner"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white uppercase font-bold">
                                    Clear
                                </button>
                            )}
                        </div>

                        {/* Sort Selector */}
                        <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
                            <label className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-bold shrink-0 flex items-center gap-1.5">
                                <SlidersHorizontal size={12} /> Sort By:
                            </label>
                            <select 
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="bg-[#111] border border-white/10 rounded-full px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37] outline-none focus:border-[#D4AF37]/50 cursor-pointer [color-scheme:dark]"
                            >
                                <option value="top_rated">Top Rated ★</option>
                                <option value="most_bookings">Most Bookings</option>
                                <option value="price_low">Starting Price: Low to High</option>
                                <option value="price_high">Starting Price: High to Low</option>
                            </select>
                        </div>
                    </div>

                    <div className="h-[1px] bg-white/5 w-full" />

                    {/* Bottom Row: Specialty Pills & Dynamic Budget Slider */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        
                        {/* Specialty Tabs */}
                        <div className="lg:col-span-8 flex flex-wrap gap-2">
                            {SPECIALTIES.map((spec) => (
                                <button 
                                    key={spec}
                                    onClick={() => setSelectedSpecialty(spec)}
                                    className={`px-4 py-2 rounded-full text-[9px] font-bold uppercase tracking-[0.2em] transition-all ${
                                        selectedSpecialty === spec 
                                            ? 'bg-[#D4AF37] text-black shadow-[0_0_15px_rgba(212,175,55,0.4)] scale-105' 
                                            : 'bg-[#111] text-white/40 hover:text-white hover:bg-white/5 border border-white/5'
                                    }`}
                                >
                                    {spec}
                                </button>
                            ))}
                        </div>

                        {/* Max Starting Rate Filter */}
                        <div className="lg:col-span-4 bg-[#111] border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest">
                                <span className="text-white/40 flex items-center gap-1">
                                    <DollarSign size={12} className="text-[#D4AF37]" /> Max Starting Rate
                                </span>
                                <span className="font-mono text-[#D4AF37] text-xs">${maxBudget} USD</span>
                            </div>
                            <input 
                                type="range" 
                                min="50" 
                                max="5000" 
                                step="50"
                                value={maxBudget}
                                onChange={(e) => setMaxBudget(Number(e.target.value))}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                            />
                        </div>

                    </div>
                </div>

                {/* RESULTS GRID */}
                {error && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono uppercase tracking-widest text-center rounded-2xl mb-12">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-6">
                        <div className="relative">
                            <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                            <Loader2 className="animate-spin text-white/20" size={48} />
                        </div>
                        <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.3em] animate-pulse">
                            Indexing Visionaries...
                        </span>
                    </div>
                ) : filteredDesigners.length === 0 ? (
                    <div className="text-center py-28 border border-white/5 bg-[#0a0a0a] rounded-3xl space-y-4">
                        <Sparkles size={40} className="text-white/10 mx-auto" />
                        <h3 className="text-2xl font-serif italic text-white">No visionaries matched your lens.</h3>
                        <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                            Try expanding your budget slider or searching a different term.
                        </p>
                        <button 
                            onClick={() => { setSearchQuery(''); setSelectedSpecialty('All'); setMaxBudget(5000); }} 
                            className="mt-4 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-[#D4AF37] text-[9px] uppercase tracking-widest font-bold rounded-full border border-white/10 transition-colors"
                        >
                            Reset All Filters
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {filteredDesigners.map((designer) => {
                            const startingRate = parseFloat(designer.starting_rate || designer.base_rate || 0);
                            const rating = parseFloat(designer.avg_rating || 5.0).toFixed(1);
                            const completedBookings = parseInt(designer.total_completed_bookings || 0);

                            return (
                                <div 
                                    key={designer.id || designer._id}
                                    className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6 flex flex-col justify-between group hover:border-[#D4AF37]/40 transition-all duration-500 shadow-2xl hover:-translate-y-1 relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 blur-[40px] pointer-events-none group-hover:bg-[#D4AF37]/10 transition-all"></div>

                                    <div>
                                        {/* Card Header: Avatar & Verified Badge */}
                                        <div className="flex items-start justify-between gap-4 mb-6">
                                            <div className="relative">
                                                <img 
                                                    src={designer.profile_image_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${designer.id || designer.username}`} 
                                                    alt={designer.full_name} 
                                                    className="w-16 h-16 rounded-2xl object-cover border border-white/10 group-hover:border-[#D4AF37] transition-colors shadow-lg"
                                                />
                                                <div className="absolute -bottom-1 -right-1 bg-black rounded-full p-0.5">
                                                    <CheckCircle2 size={14} className="text-[#D4AF37]" />
                                                </div>
                                            </div>

                                            {/* Rating Badge */}
                                            <div className="bg-[#111] border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-inner">
                                                <Star size={12} className="text-[#D4AF37] fill-[#D4AF37]" />
                                                <span className="text-[10px] font-mono font-bold text-white">{rating}</span>
                                            </div>
                                        </div>

                                        {/* Designer Title & Bio */}
                                        <h3 className="text-xl font-serif text-white group-hover:text-[#D4AF37] transition-colors truncate">
                                            {designer.full_name || designer.username || 'Anonymous Designer'}
                                        </h3>
                                        <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-white/40 mt-0.5 mb-4">
                                            {designer.tagline || 'Pro Garment Architect'}
                                        </p>

                                        <p className="text-xs text-white/60 font-light line-clamp-2 leading-relaxed mb-6">
                                            {designer.bio || "Crafting avant-garde silhouettes and digital apparel concepts for modern creators."}
                                        </p>

                                        {/* Stats Row */}
                                        <div className="grid grid-cols-2 gap-2 bg-[#111] p-3 rounded-2xl border border-white/5 mb-6 text-center">
                                            <div>
                                                <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold flex items-center justify-center gap-1">
                                                    <Briefcase size={10} /> Completed
                                                </p>
                                                <p className="text-sm font-mono font-bold text-white mt-0.5">{completedBookings}</p>
                                            </div>
                                            <div className="border-l border-white/5">
                                                <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold flex items-center justify-center gap-1">
                                                    <DollarSign size={10} /> From
                                                </p>
                                                <p className="text-sm font-mono font-bold text-[#D4AF37] mt-0.5">
                                                    ${startingRate.toFixed(0)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="space-y-2 pt-2 border-t border-white/5">
                                        <Link 
                                            to={`/creator/bookings/new?designer_id=${designer.id || designer._id}&budget=${startingRate}`}
                                            className="w-full py-3.5 bg-[#D4AF37] hover:bg-white text-black text-[9px] uppercase tracking-[0.25em] font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(212,175,55,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)]"
                                        >
                                            <Zap size={14} /> Initiate Commission
                                        </Link>

                                        <button 
                                            onClick={() => navigate(`/directory/${designer.id || designer._id}`)}
                                            className="w-full py-2.5 bg-transparent hover:bg-white/5 text-white/40 hover:text-white text-[8px] uppercase tracking-[0.2em] font-bold rounded-xl transition-colors flex items-center justify-center gap-1"
                                        >
                                            View Portfolio <ArrowUpRight size={12} />
                                        </button>
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                )}

            </main>
        </div>
    );
}