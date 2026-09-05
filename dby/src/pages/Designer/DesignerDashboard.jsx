import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { 
  Briefcase, 
  CheckSquare, 
  Star, 
  TrendingUp, 
  ArrowRight, 
  Wallet,
  ShieldCheck,
  AlertTriangle,
  Compass,
  Award,
  Zap,
  CheckCircle2,
  FolderOpen
} from 'lucide-react';

const safeFloat = (value) => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0.00 : parsed;
};

// 🚀 THE DYNAMIC RANKING ALGORITHM (Updated for Light/Dark Mode)
const getDesignerRank = (completedCount) => {
    if (completedCount >= 50) return { name: 'GRAND VISIONARY', color: 'text-cyan-600 dark:text-cyan-300', border: 'border-cyan-400 dark:border-cyan-300', bg: 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/30 shadow-sm dark:shadow-[0_0_15px_rgba(34,211,238,0.2)]' };
    if (completedCount >= 20) return { name: 'MASTER CRAFTSMAN', color: 'text-[#b59220] dark:text-[#D4AF37]', border: 'border-[#b59220] dark:border-[#D4AF37]', bg: 'bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 border-[#D4AF37]/30 shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.2)]' };
    if (completedCount >= 5) return { name: 'ATELIER ASSOCIATE', color: 'text-slate-600 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-300', bg: 'bg-slate-100 dark:bg-slate-500/10 border-slate-200 dark:border-slate-500/30 shadow-sm dark:shadow-[0_0_15px_rgba(203,213,225,0.1)]' };
    return { name: 'VISIONARY APPRENTICE', color: 'text-amber-600 dark:text-amber-600', border: 'border-amber-400 dark:border-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 shadow-sm dark:shadow-[0_0_15px_rgba(217,119,6,0.1)]' };
};

export default function DesignerDashboard() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // 🚀 THE DYNAMIC STATE MATRIX
    const [stats, setStats] = useState({
        clearedCapital: 0,
        totalEarnings: 0,
        activeCommissions: 0,
        settledClearances: 0,
        recentSignals: []
    });

    useEffect(() => {
        let isMounted = true;
        
        const fetchDynamicDashboard = async () => {
            try {
                setLoading(true);
                setError('');
                
                // 🚀 HIGH-PERFORMANCE DATA SYNC: Fetch all 3 backend pillars simultaneously
                const [walletRes, ledgerRes, bookingsRes] = await Promise.allSettled([
                    API.get('/designer-finance/wallet'),
                    API.get('/designer-finance/ledger'),
                    API.get('/p2p-bookings/pipeline')
                ]);

                if (!isMounted) return;

                // Extract data safely, falling back to empty states if an endpoint fails
                const wallet = walletRes.status === 'fulfilled' ? walletRes.value.data.data : { available_balance: 0 };
                const ledger = ledgerRes.status === 'fulfilled' ? ledgerRes.value.data.data : [];
                const bookings = bookingsRes.status === 'fulfilled' ? bookingsRes.value.data.data : [];

                // 🧮 CALCULATE LIVE METRICS
                const activeCount = bookings.filter(b => ['accepted', 'progress', 'review_prototype', 'final_production', 'review_final', 'review'].includes(b.status)).length;
                const completedCount = bookings.filter(b => ['completed', 'delivered'].includes(b.status)).length;
                const totalRevenue = ledger.reduce((sum, tx) => sum + safeFloat(tx.gross_amount), 0);

                // Format Ledger History for the UI Signals
                const formattedSignals = ledger.slice(0, 5).map(tx => ({
                    id: tx.transaction_id || tx.id || Math.random().toString(),
                    description: `Booking Earnings: ${tx.sender_name || 'Client'}`,
                    amount: tx.gross_amount,
                    date: tx.created_at,
                    type: 'credit'
                }));

                setStats({
                    clearedCapital: safeFloat(wallet.available_balance),
                    totalEarnings: totalRevenue,
                    activeCommissions: activeCount,
                    settledClearances: completedCount, 
                    recentSignals: formattedSignals
                });

            } catch (err) {
                console.error("Dashboard Matrix Sync Error:", err);
                if (isMounted) setError("Failed to synchronize live database metrics.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchDynamicDashboard();
        return () => { isMounted = false; };
    }, []);

    // Extract the dynamic rank based on the current completed stats
    const currentRank = getDesignerRank(stats.settledClearances);

    return (
        <div className="space-y-8 max-w-[1600px] mx-auto relative z-10 animate-fade-in-up pb-20 transition-colors duration-300">
            
            {/* AMBIENT BACKGROUND GLOW */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1]">
                <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div>
            </div>

            {/* TOP IDENTITY & WALLET INTERFACE */}
            <div className="bg-white dark:bg-[#0a0a0a] p-8 md:p-10 rounded-3xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-8 relative overflow-hidden transition-colors duration-300">
                
                <div className="absolute top-[-50%] right-[10%] opacity-[0.03] dark:opacity-5 text-[#D4AF37] pointer-events-none rotate-12">
                    <Compass size={300} strokeWidth={0.5} />
                </div>

                <div className="space-y-4 relative z-10">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.4em] mb-2">
                        <Star size={12} className="fill-[#D4AF37]" /> Studio Command
                    </div>
                    <h1 className="text-4xl md:text-6xl font-serif font-light text-slate-900 dark:text-white tracking-tighter drop-shadow-sm dark:drop-shadow-lg leading-tight transition-colors">
                        Welcome, <span className="italic text-[#D4AF37] font-normal">{user?.full_name || 'Visionary'}</span>
                    </h1>
                    
                    {/* 🚀 UPGRADED: Dynamic Gamification Badge */}
                    <div className="flex flex-wrap items-center gap-4 pt-2">
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#111] border border-slate-200 dark:border-white/10 px-3 py-1.5 rounded-full shadow-sm dark:shadow-inner transition-colors">
                            <span className="text-[9px] uppercase tracking-[0.3em] text-slate-500 dark:text-white/40 font-bold">Class</span>
                            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/40"></div>
                            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-800 dark:text-white font-bold">{user?.role || 'Designer'}</span> 
                        </div>
                        
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${currentRank.bg}`}>
                            <span className={`text-[9px] uppercase tracking-[0.3em] font-bold ${currentRank.color} opacity-70`}>Rank</span>
                            <div className={`w-1 h-1 rounded-full ${currentRank.color}`}></div>
                            <span className={`text-[10px] uppercase tracking-[0.2em] font-black flex items-center gap-1.5 ${currentRank.color}`}>
                                <Award size={12} /> {currentRank.name}
                            </span>
                        </div>
                    </div>
                </div>
                
                {/* WALLET EXTRACTION NODE */}
                <div className="flex items-center gap-5 bg-slate-50 dark:bg-[#111] px-8 py-6 border border-slate-200 dark:border-white/5 rounded-3xl shrink-0 self-start md:self-auto shadow-sm dark:shadow-inner relative z-10 group overflow-hidden transition-colors">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4AF37]/5 blur-[20px] rounded-full group-hover:bg-[#D4AF37]/10 transition-colors"></div>
                    <div className="p-4 bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 border border-[#D4AF37]/20 dark:border-[#D4AF37]/30 rounded-2xl text-[#b59220] dark:text-[#D4AF37] group-hover:scale-110 transition-transform duration-500 shadow-sm dark:shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                        <Wallet size={24} />
                    </div>
                    <div>
                        <p className="text-[9px] text-slate-500 dark:text-white/40 font-bold tracking-[0.3em] uppercase mb-1 transition-colors">Cleared Capital</p>
                        <p className="text-4xl md:text-5xl font-serif text-slate-900 dark:text-white group-hover:text-[#D4AF37] dark:group-hover:text-[#D4AF37] transition-colors drop-shadow-sm dark:drop-shadow-md tracking-tight">
                            {loading ? (
                                <span className="animate-pulse opacity-40">$0.00</span>
                            ) : (
                                `$${stats.clearedCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            )}
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 p-5 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] border border-rose-200 dark:border-rose-500/20 flex items-center gap-3 backdrop-blur-md shadow-sm dark:shadow-inner transition-colors duration-300">
                    <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* QUICK SUMMARY KPI MATRIX */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Metric Card 1: Earnings */}
                <div className="bg-white dark:bg-[#0a0a0a] p-8 rounded-3xl border border-slate-200 dark:border-white/5 relative overflow-hidden shadow-lg dark:shadow-2xl group hover:border-[#D4AF37]/50 dark:hover:border-[#D4AF37]/30 transition-all duration-500 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 rounded-full blur-[40px] group-hover:bg-[#D4AF37]/10 transition-colors"></div>
                    <div className="flex justify-between items-start text-slate-400 dark:text-white/40 relative z-10 transition-colors">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Earnings Pipeline</p>
                        <TrendingUp size={16} className="text-[#D4AF37]/50 group-hover:text-[#D4AF37] transition-colors" />
                    </div>
                    {loading ? (
                        <div className="h-10 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 w-1/2 rounded-lg animate-pulse mt-5"></div>
                    ) : (
                        <p className="text-4xl font-serif text-slate-900 dark:text-white group-hover:text-[#D4AF37] dark:group-hover:text-[#D4AF37] transition-colors mt-5 tracking-tight relative z-10">
                            ${stats.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    )}
                    <div className="mt-6 border-t border-slate-100 dark:border-white/5 pt-4 transition-colors">
                        <span className="text-[9px] text-slate-500 dark:text-white/30 font-bold uppercase tracking-[0.2em] inline-flex items-center gap-1.5 relative z-10 transition-colors"> Total accumulated </span>
                    </div>
                </div>

                {/* Metric Card 2: Active */}
                <div className="bg-white dark:bg-[#0a0a0a] p-8 rounded-3xl border border-slate-200 dark:border-white/5 relative overflow-hidden shadow-lg dark:shadow-2xl group hover:border-indigo-400/50 dark:hover:border-indigo-500/30 transition-all duration-500 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-[40px] group-hover:bg-indigo-500/10 transition-colors"></div>
                    <div className="flex justify-between items-start text-slate-400 dark:text-white/40 relative z-10 transition-colors">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Active Bookings</p>
                        <Briefcase size={16} className="text-indigo-400/50 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
                    </div>
                    {loading ? (
                        <div className="h-10 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 w-1/3 rounded-lg animate-pulse mt-5"></div>
                    ) : (
                        <p className="text-4xl font-serif text-slate-900 dark:text-white group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors mt-5 tracking-tight relative z-10">
                            {stats.activeCommissions}
                        </p>
                    )}
                    <div className="mt-6 border-t border-slate-100 dark:border-white/5 pt-4 transition-colors">
                        <span className="text-[9px] text-slate-500 dark:text-white/30 font-bold uppercase tracking-[0.2em] inline-flex items-center gap-1.5 relative z-10 transition-colors"> In studio production </span>
                    </div>
                </div>

                {/* Metric Card 3: Settled */}
                <div className="bg-white dark:bg-[#0a0a0a] p-8 rounded-3xl border border-slate-200 dark:border-white/5 relative overflow-hidden shadow-lg dark:shadow-2xl group hover:border-emerald-400/50 dark:hover:border-emerald-500/30 transition-all duration-500 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[40px] group-hover:bg-emerald-500/10 transition-colors"></div>
                    <div className="flex justify-between items-start text-slate-400 dark:text-white/40 relative z-10 transition-colors">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Settled Clearances</p>
                        <CheckSquare size={16} className="text-emerald-400/50 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors" />
                    </div>
                    {loading ? (
                        <div className="h-10 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 w-1/3 rounded-lg animate-pulse mt-5"></div>
                    ) : (
                        <p className="text-4xl font-serif text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors mt-5 tracking-tight relative z-10">
                            {stats.settledClearances}
                        </p>
                    )}
                    <div className="mt-6 border-t border-slate-100 dark:border-white/5 pt-4 flex items-center justify-between transition-colors">
                         <span className="text-[9px] text-slate-500 dark:text-white/30 font-bold uppercase tracking-[0.2em] inline-flex items-center gap-1.5 relative z-10 transition-colors"> Archived deliverables </span>
                         {/* Display next rank goal if they aren't diamond yet */}
                         {stats.settledClearances < 50 && (
                             <span className="text-[9px] text-[#b59220]/70 dark:text-[#D4AF37]/50 font-mono tracking-widest">{stats.settledClearances}/{(stats.settledClearances < 5 ? 5 : stats.settledClearances < 20 ? 20 : 50)} to Next Rank</span>
                         )}
                    </div>
                </div>

                {/* Metric Card 4: Reputation */}
                <div className="bg-white dark:bg-[#0a0a0a] p-8 rounded-3xl border border-slate-200 dark:border-white/5 relative overflow-hidden shadow-lg dark:shadow-2xl group hover:border-[#D4AF37]/50 dark:hover:border-[#D4AF37]/30 transition-all duration-500 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-[40px] group-hover:bg-amber-500/10 transition-colors"></div>
                    <div className="flex justify-between items-start text-slate-400 dark:text-white/40 relative z-10 transition-colors">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Studio Reputation</p>
                        <Star size={16} className="text-amber-400/50 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors" />
                    </div>
                    {loading ? (
                        <div className="h-10 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 w-2/3 rounded-lg animate-pulse mt-5"></div>
                    ) : (
                        <p className="text-4xl font-serif text-[#D4AF37] mt-5 tracking-tight relative z-10 flex items-baseline gap-2">
                            {safeFloat(user?.avg_rating || 5).toFixed(1)} 
                            <span className="text-sm text-slate-400 dark:text-white/30 font-sans font-bold tracking-widest uppercase transition-colors">/ 5.0</span>
                        </p>
                    )}
                    <div className="mt-6 border-t border-slate-100 dark:border-white/5 pt-4 transition-colors">
                        <span className="text-[9px] text-slate-500 dark:text-white/30 font-bold uppercase tracking-[0.2em] inline-flex items-center gap-1.5 relative z-10 transition-colors"> Client evaluation matrix </span>
                    </div>
                </div>
            </div>

            {/* OPERATIONAL SPLITS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* Control Directive Hub */}
                <div className="bg-white dark:bg-[#0a0a0a] p-8 md:p-10 rounded-3xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-2xl space-y-8 relative overflow-hidden transition-colors duration-300">
                    <div className="absolute -bottom-10 -right-10 opacity-[0.03] text-slate-900 dark:text-white pointer-events-none rotate-45 transition-colors">
                        <Zap size={200} strokeWidth={1} />
                    </div>
                    
                    <div className="border-b border-slate-100 dark:border-white/5 pb-5 relative z-10 transition-colors">
                        <h3 className="font-serif text-3xl text-slate-900 dark:text-white tracking-wide mb-2 transition-colors">Studio Directives</h3>
                        <p className="text-[9px] uppercase tracking-[0.3em] text-[#D4AF37] font-bold">Quick access workspace nodes</p>
                    </div>
                    
                    <div className="flex flex-col gap-4 relative z-10">
                        <Link to="/designer/inventory" className="flex items-center justify-between p-6 rounded-2xl bg-slate-50 dark:bg-[#111] hover:bg-[#D4AF37] dark:hover:bg-[#D4AF37] border border-slate-200 dark:border-white/5 hover:border-[#D4AF37] dark:hover:border-[#D4AF37] transition-all duration-300 group cursor-pointer shadow-sm dark:shadow-inner hover:shadow-lg dark:hover:shadow-[0_10px_20px_rgba(212,175,55,0.2)]">
                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600 dark:text-white/70 group-hover:text-white dark:group-hover:text-black transition-colors flex items-center gap-3">
                                <FolderOpen size={16} className="text-[#D4AF37] group-hover:text-white dark:group-hover:text-black" /> Catalog Inventory
                            </span>
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/5 group-hover:bg-white/20 dark:group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                <ArrowRight size={14} className="text-slate-500 dark:text-white/40 group-hover:text-white dark:group-hover:text-black transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>
                        
                        <Link to="/designer/bookings" className="flex items-center justify-between p-6 rounded-2xl bg-slate-50 dark:bg-[#111] hover:bg-[#D4AF37] dark:hover:bg-[#D4AF37] border border-slate-200 dark:border-white/5 hover:border-[#D4AF37] dark:hover:border-[#D4AF37] transition-all duration-300 group cursor-pointer shadow-sm dark:shadow-inner hover:shadow-lg dark:hover:shadow-[0_10px_20px_rgba(212,175,55,0.2)]">
                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600 dark:text-white/70 group-hover:text-white dark:group-hover:text-black transition-colors flex items-center gap-3">
                                <Briefcase size={16} className="text-[#D4AF37] group-hover:text-white dark:group-hover:text-black" /> Booking Tracks
                            </span>
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/5 group-hover:bg-white/20 dark:group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                <ArrowRight size={14} className="text-slate-500 dark:text-white/40 group-hover:text-white dark:group-hover:text-black transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>
                        
                        <Link to="/designer/wallet" className="flex items-center justify-between p-6 rounded-2xl bg-slate-50 dark:bg-[#111] hover:bg-[#D4AF37] dark:hover:bg-[#D4AF37] border border-slate-200 dark:border-white/5 hover:border-[#D4AF37] dark:hover:border-[#D4AF37] transition-all duration-300 group cursor-pointer shadow-sm dark:shadow-inner hover:shadow-lg dark:hover:shadow-[0_10px_20px_rgba(212,175,55,0.2)]">
                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600 dark:text-white/70 group-hover:text-white dark:group-hover:text-black transition-colors flex items-center gap-3">
                                <Wallet size={16} className="text-[#D4AF37] group-hover:text-white dark:group-hover:text-black" /> Ledger Extractions
                            </span>
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/5 group-hover:bg-white/20 dark:group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                <ArrowRight size={14} className="text-slate-500 dark:text-white/40 group-hover:text-white dark:group-hover:text-black transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Audit Trail Signals */}
                <div className="lg:col-span-2 bg-white dark:bg-[#0a0a0a] p-8 md:p-10 rounded-3xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-2xl space-y-8 h-full flex flex-col transition-colors duration-300">
                    <div className="border-b border-slate-100 dark:border-white/5 pb-5 transition-colors">
                        <h3 className="font-serif text-3xl text-slate-900 dark:text-white tracking-wide mb-2 transition-colors">Recent Studio Signals</h3>
                        <p className="text-[9px] uppercase tracking-[0.3em] text-[#D4AF37] font-bold">Live marketplace ledger streams</p>
                    </div>
                    
                    <div className="flex-1">
                        {loading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map(n => (
                                    <div key={n} className="flex justify-between items-center p-6 bg-slate-50 dark:bg-[#111] border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm dark:shadow-inner animate-pulse transition-colors">
                                        <div className="space-y-3 w-1/2">
                                            <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-full"></div>
                                            <div className="h-2 bg-slate-200 dark:bg-white/10 rounded w-1/3"></div>
                                        </div>
                                        <div className="h-8 bg-slate-200 dark:bg-white/10 w-24 rounded-full"></div>
                                    </div>
                                ))}
                            </div>
                        ) : stats.recentSignals.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[250px] border border-slate-200 dark:border-white/5 rounded-3xl bg-slate-50 dark:bg-[#111] space-y-5 shadow-sm dark:shadow-inner p-8 transition-colors duration-300">
                                <div className="w-16 h-16 rounded-full bg-white dark:bg-[#0a0a0a] flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-colors">
                                    <ShieldCheck size={28} className="text-slate-300 dark:text-white/20" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-white/50 font-bold mb-2 transition-colors">No signals caught</p>
                                    <p className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold">Awaiting first clearance</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stats.recentSignals.map((activity, idx) => {
                                    const formattedDate = new Date(activity.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

                                    return (
                                        <div key={activity.id || idx} className="p-6 flex justify-between items-center text-xs hover:bg-slate-100 dark:hover:bg-[#111] bg-slate-50 dark:bg-[#111] border border-slate-200 dark:border-white/5 rounded-2xl transition-all duration-300 group shadow-sm dark:shadow-inner hover:shadow-md dark:hover:shadow-[0_10px_20px_rgba(0,0,0,0.3)]">
                                            <div className="space-y-2 pr-4 min-w-0 flex-1">
                                                <p className="font-bold text-slate-800 dark:text-white/80 line-clamp-1 group-hover:text-slate-900 dark:group-hover:text-white transition-colors tracking-wide text-sm">{activity.description}</p>
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 size={12} className="text-emerald-500/50" />
                                                    <p className="text-[10px] font-mono text-slate-500 dark:text-white/40 uppercase tracking-widest transition-colors">{formattedDate}</p>
                                                </div>
                                            </div>
                                            <span className="px-5 py-2.5 rounded-full text-[10px] font-mono font-bold tracking-[0.1em] border shrink-0 shadow-sm dark:shadow-[0_0_20px_rgba(16,185,129,0.15)] bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 transition-colors">
                                                +${safeFloat(activity.amount).toFixed(2)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}