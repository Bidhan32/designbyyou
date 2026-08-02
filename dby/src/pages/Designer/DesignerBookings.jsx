import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, ArrowRight, PlayCircle, CheckCircle2, Clock, Upload, Lock, Calendar, Compass, User, Sparkles } from 'lucide-react';
import API from '../../api/axios';

const DesignerBookings = () => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('active');

    // Bulletproof ID Grabber
    const getUserId = () => {
        const directId = localStorage.getItem('userId');
        if (directId) return directId;
        const userObj = localStorage.getItem('user');
        if (userObj) {
            const parsed = JSON.parse(userObj);
            return parsed.id || parsed._id; 
        }
        return null;
    };
    
    const currentUserId = getUserId();

    useEffect(() => {
        const fetchDesignerBookings = async () => {
            try {
                setLoading(true);
                const { data } = await API.get('/p2p-bookings/pipeline');
                setBookings(data.data || []);
            } catch (err) {
                console.error("Error fetching pipeline:", err);
            } finally {
                setLoading(false);
            }
        };
        
        if (currentUserId) fetchDesignerBookings();
    }, [currentUserId]);

    const filteredBookings = bookings.filter(booking => {
        if (activeTab === 'pending') return booking.status === 'pending';
        if (activeTab === 'active') return ['accepted', 'progress', 'review_prototype', 'final_production', 'review_final', 'review'].includes(booking.status);
        if (activeTab === 'completed') return ['completed', 'delivered', 'cancelled'].includes(booking.status);
        return true;
    });

    // 🚀 UPGRADED: Light & Dark Mode Status Badges
    const getStatusDetails = (status, isClient, oppositeName) => {
        const shortName = oppositeName.split(' ')[0]; 

        switch (status) {
            case 'pending': 
                return { text: isClient ? 'Awaiting Your Funding' : 'Waiting on Client Funds', style: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20 shadow-sm dark:shadow-[0_0_15px_rgba(245,158,11,0.1)]' };
            case 'accepted':
            case 'progress': 
                return { text: isClient ? `${shortName} is Building Prototype` : 'Phase 1: Build Prototype', style: 'bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 text-[#b59220] dark:text-[#D4AF37] border-[#D4AF37]/30 ring-1 ring-[#D4AF37]/20 shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.15)]' };
            case 'review_prototype': 
                return { text: isClient ? 'Action Required: Review Prototype' : 'Waiting on Client Review', style: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30 shadow-sm dark:shadow-[0_0_15px_rgba(99,102,241,0.15)]' };
            case 'final_production':
                return { text: isClient ? `${shortName} is Building Final Assets` : 'Phase 2: Build Final Assets', style: 'bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 text-[#b59220] dark:text-[#D4AF37] border-[#D4AF37]/30 ring-1 ring-[#D4AF37]/20 shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.15)]' };
            case 'review_final':
            case 'review':
                return { text: isClient ? 'Action Required: Final Review' : 'Waiting for Final Payout', style: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30 shadow-sm dark:shadow-[0_0_15px_rgba(99,102,241,0.15)]' };
            case 'completed':
            case 'delivered': 
                return { text: 'Settled & Paid', style: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' };
            case 'cancelled':
                return { text: 'Cancelled / Rejected', style: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' };
            default: 
                return { text: status, style: 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/60 border-slate-200 dark:border-white/10' };
        }
    };

    const formatDeadline = (dateString) => {
        if (!dateString) return 'TBD';
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); 
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#030303] text-slate-900 dark:text-white selection:bg-[#D4AF37] selection:text-black pb-16 antialiased relative overflow-hidden transition-colors duration-300">
            
            {/* AMBIENT BACKGROUND GLOW */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '10s' }}></div>
                <div className="absolute bottom-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-[#6b5818]/5 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '14s' }}></div>
            </div>

            {/* STICKY GLASS HEADER */}
            <div className="bg-white/80 dark:bg-[#0a0a0a]/80 border-b border-slate-200 dark:border-white/5 sticky top-0 z-40 px-6 py-8 backdrop-blur-2xl shadow-sm dark:shadow-2xl transition-colors duration-300">
                <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10 animate-fade-in-up">
                    <div>
                        <div className="flex items-center gap-2 text-[9px] font-bold text-[#D4AF37] uppercase tracking-[0.4em] mb-3">
                            <Compass size={12} /> Unified Workspace
                        </div>
                        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tighter drop-shadow-sm dark:drop-shadow-xl transition-colors">
                            Active Contracts <span className="italic text-[#D4AF37]">Pipeline</span>
                        </h1>
                    </div>
                </div>
            </div>

            <div className="max-w-[1200px] mx-auto px-6 mt-12 space-y-8 relative z-10">
                
                {/* ATELIER TABS */}
                <div className="flex border-b border-slate-200 dark:border-white/10 gap-8 overflow-x-auto scrollbar-hide transition-colors duration-300">
                    {['pending', 'active', 'completed'].map((tab) => {
                        const count = bookings.filter(b => {
                            if (tab === 'pending') return b.status === 'pending';
                            if (tab === 'active') return ['accepted', 'progress', 'review_prototype', 'final_production', 'review_final', 'review'].includes(b.status);
                            if (tab === 'completed') return ['completed', 'delivered', 'cancelled'].includes(b.status);
                            return false;
                        }).length;

                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`pb-4 text-[10px] font-bold uppercase tracking-[0.25em] transition-all duration-300 relative flex items-center gap-2 whitespace-nowrap ${
                                    activeTab === tab 
                                        ? 'border-b-2 border-[#D4AF37] text-slate-900 dark:text-white' 
                                        : 'border-b-2 border-transparent text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/80'
                                }`}
                            >
                                {tab}
                                <span className={`text-[9px] px-2.5 py-0.5 rounded-full transition-colors ${
                                    activeTab === tab 
                                        ? 'bg-[#D4AF37]/10 dark:bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30' 
                                        : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-white/40 border border-slate-200 dark:border-white/5'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* LIST / PIPELINE */}
                {loading ? (
                    <div className="space-y-4 pt-4">
                        {[1, 2, 3].map(n => (
                            <div key={n} className="h-36 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-3xl animate-pulse"></div>
                        ))}
                    </div>
                ) : filteredBookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center border border-slate-200 dark:border-white/5 rounded-3xl py-32 bg-white dark:bg-[#0a0a0a] space-y-6 shadow-md dark:shadow-2xl backdrop-blur-sm transition-colors duration-300">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-[#111] rounded-2xl flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-inner">
                            <Sparkles size={28} className="text-[#D4AF37]/50" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-slate-900 dark:text-white text-2xl font-serif tracking-wide transition-colors">No {activeTab} contracts</p>
                            <p className="text-slate-500 dark:text-white/40 text-[10px] uppercase tracking-[0.2em] font-bold transition-colors">Your operational queue for this phase is currently empty.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5 pt-2">
                        {filteredBookings.map((order) => {
                            const isClient = currentUserId === order.creator_id;
                            const isProvider = currentUserId === order.designer_id;
                            
                            const oppositeUser = isClient 
                                ? { name: order.receiver_name || order.designer_name || 'Hired Partner', avatar: order.receiver_avatar || order.designer_avatar, label: "Hired Partner" }
                                : { name: order.sender_name || order.creator_name || 'Network Client', avatar: order.sender_avatar || order.creator_avatar, label: "Project Client" };

                            const statusConfig = getStatusDetails(order.status, isClient, oppositeUser.name);

                            return (
                                <Link 
                                    to={`/designer/bookings/${order.id}`} 
                                    key={order.id} 
                                    className="bg-white dark:bg-[#0a0a0a] rounded-3xl border border-slate-200 dark:border-white/5 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-[#D4AF37]/50 dark:hover:border-[#D4AF37]/30 hover:bg-slate-50 dark:hover:bg-[#111] hover:-translate-y-1 transition-all duration-500 group block shadow-md dark:shadow-xl hover:shadow-lg dark:hover:shadow-[0_20px_40px_rgba(212,175,55,0.1)]"
                                >
                                    <div className="space-y-5 flex-1">
                                        
                                        {/* Status Header */}
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className={`text-[9px] font-black px-3.5 py-1.5 rounded-full border uppercase tracking-[0.2em] transition-colors duration-300 ${statusConfig.style}`}>
                                                {statusConfig.text}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-500 dark:text-white/30 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-md border border-slate-200 dark:border-white/5 transition-colors duration-300">
                                                ID: {String(order.id).substring(0, 8).toUpperCase()}
                                            </span>
                                            <span className={`text-[9px] font-black px-3.5 py-1.5 rounded-full uppercase tracking-[0.2em] border transition-colors duration-300 ${isClient ? 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border-slate-200 dark:border-white/10' : 'bg-[#D4AF37]/10 text-[#b59220] dark:text-[#D4AF37] border-[#D4AF37]/20'}`}>
                                                Role: {isClient ? 'Client' : 'Creator'}
                                            </span>
                                        </div>

                                        {/* Body */}
                                        <div>
                                            <h3 className="font-serif text-2xl md:text-3xl text-slate-900 dark:text-white group-hover:text-[#D4AF37] dark:group-hover:text-[#D4AF37] transition-colors flex items-center gap-3 tracking-wide">
                                                {order.reference_design_title || 'Bespoke Studio Contract'}
                                                <ArrowRight size={20} className="text-[#D4AF37] opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 ease-out" />
                                            </h3>
                                            <p className="text-[11px] md:text-xs text-slate-500 dark:text-white/50 mt-3 leading-relaxed line-clamp-2 max-w-3xl font-light tracking-wide transition-colors">
                                                {order.brief_text}
                                            </p>
                                        </div>

                                        {/* Metadata Footer */}
                                        <div className="pt-5 flex flex-wrap items-center gap-6 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500 dark:text-white/40 border-t border-slate-200 dark:border-white/5 transition-colors duration-300">
                                            <div className="flex items-center gap-3">
                                                <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-[#111] border border-slate-300 dark:border-white/20 flex items-center justify-center overflow-hidden shadow-inner transition-colors duration-300">
                                                    {oppositeUser.avatar ? <img src={oppositeUser.avatar} alt="avatar" className="w-full h-full object-cover" /> : <User size={12} className="text-slate-400 dark:text-white/30" />}
                                                </div>
                                                <span>{oppositeUser.label}: <strong className="text-slate-900 dark:text-white">{oppositeUser.name}</strong></span>
                                            </div>
                                            
                                            <span className="hidden sm:block h-4 w-px bg-slate-200 dark:bg-white/10 transition-colors"></span>
                                            
                                            <span>Valuation: <strong className="text-[#D4AF37] font-mono text-[12px] ml-1.5">${parseFloat(order.agreed_price || 0).toFixed(2)}</strong></span>

                                            <span className="hidden sm:block h-4 w-px bg-slate-200 dark:bg-white/10 transition-colors"></span>
                                            
                                            <span className="flex items-center gap-1.5">
                                                <Calendar size={12} className="text-slate-400 dark:text-white/30" />
                                                Due: <strong className="text-slate-900 dark:text-white text-[11px] ml-1">{formatDeadline(order.deadline)}</strong>
                                            </span>
                                        </div>
                                    </div>

                                    {/* QUICK ACTIONS PANEL */}
                                    <div className="min-w-[220px] flex flex-col justify-center bg-slate-50 dark:bg-[#111] p-5 rounded-2xl border border-slate-200 dark:border-white/5 self-stretch md:self-center items-center md:items-end shadow-inner group-hover:border-slate-300 dark:group-hover:border-white/10 transition-colors duration-300">
                                        
                                        {/* Provider Action Prompts */}
                                        {isProvider && ['accepted', 'progress'].includes(order.status) && (
                                            <div className="text-[9px] text-[#D4AF37] font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-[#D4AF37]/10 px-5 py-3 rounded-full border border-[#D4AF37]/30 shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.15)]">
                                                <PlayCircle size={14} /> Submit Prototype
                                            </div>
                                        )}
                                        {isProvider && order.status === 'final_production' && (
                                            <div className="text-[9px] text-[#D4AF37] font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-[#D4AF37]/10 px-5 py-3 rounded-full border border-[#D4AF37]/30 shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.15)]">
                                                <Upload size={14} /> Submit Final Files
                                            </div>
                                        )}
                                        {isProvider && ['review_prototype', 'review_final', 'review'].includes(order.status) && (
                                            <div className="text-[9px] text-slate-500 dark:text-white/50 font-bold uppercase tracking-[0.2em] flex items-center gap-2 bg-white dark:bg-white/5 px-5 py-3 rounded-full border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none transition-colors">
                                                <Clock size={14} /> Awaiting Client
                                            </div>
                                        )}

                                        {/* Client Action Prompts */}
                                        {isClient && order.status === 'pending' && (
                                            <div className="text-[9px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 px-5 py-3 rounded-full border border-amber-200 dark:border-amber-500/30">
                                                <Lock size={14} /> Fund Escrow
                                            </div>
                                        )}
                                        {isClient && ['review_prototype', 'review_final', 'review'].includes(order.status) && (
                                            <div className="text-[9px] text-indigo-700 dark:text-white font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-indigo-100 dark:bg-indigo-500/40 px-5 py-3 rounded-full border border-indigo-300 dark:border-indigo-400 shadow-sm dark:shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                                                <CheckCircle2 size={14} /> Review Needed
                                            </div>
                                        )}
                                        {isClient && ['accepted', 'progress', 'final_production'].includes(order.status) && (
                                            <div className="text-[9px] text-slate-500 dark:text-white/50 font-bold uppercase tracking-[0.2em] flex items-center gap-2 bg-white dark:bg-white/5 px-5 py-3 rounded-full border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none transition-colors">
                                                <Clock size={14} /> Artist is Working
                                            </div>
                                        )}
                                        
                                        {/* Fallback for statuses with no explicit action */}
                                        {['completed', 'delivered', 'cancelled'].includes(order.status) && (
                                            <div className="text-[9px] text-slate-400 dark:text-white/30 font-bold uppercase tracking-[0.2em] transition-colors">
                                                View Record
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DesignerBookings;