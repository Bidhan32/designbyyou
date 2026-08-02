import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, ArrowRight, PlayCircle, CheckCircle2, Clock, Upload, Lock, Plus, Calendar, Sparkles } from 'lucide-react';
import API from '../../api/axios';

const CreatorBookings = () => {
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
        const fetchCreatorBookings = async () => {
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
        
        if (currentUserId) fetchCreatorBookings();
    }, [currentUserId]);

    const filteredBookings = bookings.filter(booking => {
        if (activeTab === 'pending') return booking.status === 'pending';
        if (activeTab === 'active') return ['accepted', 'progress', 'review_prototype', 'final_production', 'review_final', 'review'].includes(booking.status);
        if (activeTab === 'completed') return ['completed', 'delivered', 'cancelled'].includes(booking.status);
        return true;
    });

    // 🚀 UPGRADED: Unified Status Labels with Digital Atelier Dark Mode Styling
    const getStatusDetails = (status, isClient, oppositeName) => {
        const shortName = oppositeName.split(' ')[0]; 

        switch (status) {
            case 'pending': 
                return { text: isClient ? 'Awaiting Your Funding' : 'Waiting on Client Funds', style: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
            case 'accepted':
            case 'progress': 
                return { text: isClient ? `${shortName} is Building Prototype` : 'Phase 1: Build Prototype', style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]' };
            case 'review_prototype': 
                return { text: isClient ? 'Action Required: Review Prototype' : 'Waiting on Client Review', style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
            case 'final_production':
                return { text: isClient ? `${shortName} is Building Final Assets` : 'Phase 2: Build Final Assets', style: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]' };
            case 'review_final':
            case 'review':
                return { text: isClient ? 'Action Required: Final Review' : 'Waiting for Final Payout', style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' };
            case 'completed':
            case 'delivered': 
                return { text: 'Settled & Paid', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
            case 'cancelled':
                return { text: 'Cancelled / Rejected', style: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
            default: 
                return { text: status, style: 'bg-white/5 text-white/50 border-white/10' };
        }
    };

    const formatDeadline = (dateString) => {
        if (!dateString) return 'TBD';
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); 
    };

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans relative overflow-x-hidden pb-32 animate-fade-in">
            
            {/* AMBIENT GLOW */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div>
            </div>
            
            {/* STICKY HEADER */}
            <div className="bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/5 sticky top-0 z-30 px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[9px] font-black text-[#D4AF37] uppercase tracking-[0.4em] mb-2">
                            <Sparkles size={12} /> Creator Workspace
                        </div>
                        <h1 className="text-3xl font-serif text-white tracking-tight drop-shadow-md">Active Contracts <span className="italic text-[#D4AF37]">Pipeline</span></h1>
                    </div>
                    <Link to="/creator/bookings/new" className="inline-flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-white text-black text-[10px] font-black tracking-[0.3em] uppercase py-4 px-6 rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.2)] hover:shadow-none hover:-translate-y-0.5">
                        <Plus size={14} /> New Contract
                    </Link>
                </div>
            </div>

            <div className="max-w-[1200px] mx-auto px-6 mt-12 space-y-8 relative z-10">
                
                {/* 🚀 UPGRADED: Tabs */}
                <div className="flex border-b border-white/5 gap-8">
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
                                className={`pb-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative flex items-center gap-3 ${
                                    activeTab === tab 
                                        ? 'border-b-2 border-[#D4AF37] text-white' 
                                        : 'border-b-2 border-transparent text-white/30 hover:text-white/60'
                                }`}
                            >
                                {tab}
                                <span className={`text-[9px] px-2.5 py-0.5 rounded-full border ${
                                    activeTab === tab ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30' : 'bg-white/5 text-white/40 border-transparent'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* 🚀 UPGRADED: List / Ledger */}
                {loading ? (
                    <div className="space-y-6">
                        {[1, 2, 3].map(n => <div key={n} className="h-40 bg-[#111] border border-white/5 rounded-3xl animate-pulse"></div>)}
                    </div>
                ) : filteredBookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center border border-white/5 rounded-3xl py-32 bg-[#0a0a0a] space-y-4 shadow-inner">
                        <div className="w-20 h-20 bg-[#111] rounded-full flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(212,175,55,0.05)]">
                            <Search size={32} className="text-white/20" />
                        </div>
                        <div className="text-center">
                            <p className="text-white text-lg font-serif tracking-wide">No Ledger Entries Found</p>
                            <p className="text-white/40 text-[10px] uppercase font-bold tracking-[0.2em] mt-2">There are no {activeTab} contracts in your pipeline.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {filteredBookings.map((order) => {
                            const isClient = currentUserId === order.creator_id;
                            const isProvider = currentUserId === order.designer_id;
                            
                            const oppositeUser = isClient 
                                ? { name: order.receiver_name || order.designer_name || 'Hired Partner', avatar: order.receiver_avatar || order.designer_avatar, label: "Hired Artist" }
                                : { name: order.sender_name || order.creator_name || 'Network Client', avatar: order.sender_avatar || order.creator_avatar, label: "Project Client" };

                            const statusConfig = getStatusDetails(order.status, isClient, oppositeUser.name);

                            return (
                                <Link to={`/creator/bookings/${order.id}`} key={order.id} className="bg-[#111] rounded-3xl border border-white/5 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 hover:border-[#D4AF37]/30 hover:bg-[#111]/80 transition-all duration-300 group block shadow-lg hover:shadow-[0_10px_40px_rgba(212,175,55,0.1)]">
                                    
                                    <div className="space-y-4 flex-1">
                                        {/* Status Header */}
                                        <div className="flex items-center gap-4 flex-wrap">
                                            <span className={`text-[9px] font-black px-3 py-1.5 rounded-lg border uppercase tracking-[0.2em] ${statusConfig.style}`}>
                                                {statusConfig.text}
                                            </span>
                                            <span className="text-[10px] font-mono text-white/30 bg-[#030303] px-3 py-1 rounded border border-white/5">
                                                REF: {String(order.id).substring(0, 8).toUpperCase()}
                                            </span>
                                            <span className={`text-[9px] font-black px-3 py-1 rounded uppercase tracking-[0.2em] border ${
                                                isClient ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            }`}>
                                                Role: {isClient ? 'Buyer' : 'Artist'}
                                            </span>
                                        </div>

                                        {/* Title & Brief */}
                                        <div>
                                            <h3 className="font-serif text-2xl text-white group-hover:text-[#D4AF37] transition-colors flex items-center gap-3">
                                                {order.reference_design_title || 'Custom Studio Contract'}
                                                <ArrowRight size={20} className="text-white/20 group-hover:text-[#D4AF37] group-hover:translate-x-2 transition-all duration-300 opacity-0 group-hover:opacity-100" />
                                            </h3>
                                            <p className="text-xs text-white/40 mt-2 leading-relaxed line-clamp-2 max-w-3xl font-light">
                                                {order.brief_text}
                                            </p>
                                        </div>

                                        {/* Data Footer */}
                                        <div className="pt-5 flex flex-wrap items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-white/40 border-t border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-full bg-[#030303] border border-white/10 flex items-center justify-center overflow-hidden">
                                                    {oppositeUser.avatar ? <img src={oppositeUser.avatar} alt="avatar" className="w-full h-full object-cover" /> : <User size={12} />}
                                                </div>
                                                <span>{oppositeUser.label}: <strong className="text-white">{oppositeUser.name}</strong></span>
                                            </div>
                                            
                                            <span className="hidden sm:block h-1 w-1 rounded-full bg-white/10"></span>
                                            
                                            <span>Valuation: <strong className="text-[#D4AF37] font-mono text-sm tracking-normal">${parseFloat(order.agreed_price || 0).toFixed(2)}</strong></span>

                                            <span className="hidden sm:block h-1 w-1 rounded-full bg-white/10"></span>
                                            
                                            <span className="flex items-center gap-2">
                                                <Calendar size={14} className="text-[#D4AF37]" />
                                                Target: <strong className="text-white">{formatDeadline(order.deadline)}</strong>
                                            </span>
                                        </div>
                                    </div>

                                    {/* 🚀 UPGRADED: Quick Actions Panel */}
                                    <div className="min-w-[200px] flex flex-col justify-center bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 self-stretch md:self-center items-center md:items-end shadow-inner">
                                        
                                        {/* Provider Action Prompts */}
                                        {isProvider && ['accepted', 'progress'].includes(order.status) && (
                                            <div className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/20">
                                                <PlayCircle size={14} /> Submit Prototype
                                            </div>
                                        )}
                                        {isProvider && order.status === 'final_production' && (
                                            <div className="text-[9px] text-cyan-400 font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-cyan-500/10 px-4 py-2 rounded-lg border border-cyan-500/20">
                                                <Upload size={14} /> Submit Final Files
                                            </div>
                                        )}
                                        {isProvider && ['review_prototype', 'review_final', 'review'].includes(order.status) && (
                                            <div className="text-[9px] text-white/40 font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                                <Clock size={14} className="text-[#D4AF37]" /> Awaiting Client
                                            </div>
                                        )}

                                        {/* Client Action Prompts */}
                                        {isClient && order.status === 'pending' && (
                                            <div className="text-[9px] text-amber-400 font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-amber-500/10 px-4 py-2 rounded-lg border border-amber-500/20">
                                                <Lock size={14} /> Fund Escrow Vault
                                            </div>
                                        )}
                                        {isClient && ['review_prototype', 'review_final', 'review'].includes(order.status) && (
                                            <div className="text-[9px] text-[#D4AF37] font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-[#D4AF37]/10 px-4 py-2 rounded-lg border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]">
                                                <CheckCircle2 size={14} /> Review Needed
                                            </div>
                                        )}
                                        {isClient && ['accepted', 'progress', 'final_production'].includes(order.status) && (
                                            <div className="text-[9px] text-white/40 font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                                <Clock size={14} className="text-cyan-400" /> Artist in Forge
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

export default CreatorBookings;