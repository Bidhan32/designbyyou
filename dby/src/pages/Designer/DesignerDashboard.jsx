import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import API from '../../api/axios';
import { useAuth } from "../../context/AuthContext.helpers.js";
import {
  Briefcase,
  ArrowRight,
  Wallet,
  ShieldCheck,
  Zap,
  CheckCircle2,
  FolderOpen
} from 'lucide-react';

const safeFloat = (value) => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0.00 : parsed;
};

// 🚀 THE DYNAMIC RANKING ALGORITHM (Updated for Light/Dark Mode)
const getDesignerRank = completed => {
    if (completed >= 50) return "Grand Visionary";
    if (completed >= 20) return "Master Craftsman";
    if (completed >= 5) return "Atelier Associate";
    return "Visionary Apprentice";
};

const currency = value => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

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

            <header className="border-b border-line pb-4">
                <h1 className="text-2xl font-semibold">Designer workspace</h1>
                <p className="mt-1 text-sm text-muted">{user?.full_name} · {currentRank}</p>
            </header>
            {error && <p role="alert" className="rounded-md border border-line p-3">{error}</p>}
            <dl className="divide-y divide-line rounded-md border border-line bg-surface px-4">
                {[
                    ["Available earnings", currency(stats.clearedCapital)],
                    ["Total earnings", currency(stats.totalEarnings)],
                    ["Active bookings", stats.activeCommissions],
                    ["Completed bookings", stats.settledClearances],
                    ["Next rank", stats.settledClearances < 50 ? [5, 20, 50].find(goal => goal > stats.settledClearances) + " completed bookings" : "Highest rank"],
                    ["Rating", user?.avg_rating == null ? "No ratings yet" : safeFloat(user.avg_rating).toFixed(1) + " / 5"],
                ].map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-2 text-sm"><dt>{label}</dt><dd className="font-mono tabular-nums">{loading ? "…" : value}</dd></div>)}
            </dl>
            {/* OPERATIONAL SPLITS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                {/* Control Directive Hub */}
                <div className="bg-surface p-4 rounded-md border border-line space-y-8 relative overflow-hidden transition-colors duration-300">

                    <div className="border-b border-line pb-5 relative z-10 transition-colors">
                        <h3 className="font-sans text-3xl text-ink tracking-wide mb-2 transition-colors">Quick actions</h3>
                    </div>

                    <div className="flex flex-col gap-4 relative z-10">
                        <Link to="/designer/inventory" className="flex items-center justify-between p-4 rounded-md bg-canvas dark:bg-surface hover:bg-action dark:hover:bg-action border border-line hover:border-line dark:hover:border-line transition-all duration-300 group cursor-pointer">
                            <span className="text-xs font-bold tracking-normal text-muted group-hover:text-zinc-100 dark:group-hover:text-zinc-950 transition-colors flex items-center gap-3">
                                <FolderOpen size={16} className="text-action group-hover:text-zinc-100 dark:group-hover:text-zinc-950" /> Your portfolio
                            </span>
                            <div className="w-8 h-8 rounded-full bg-canvas dark:bg-subtle group-hover:bg-subtle dark:group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                <ArrowRight size={14} className="text-muted group-hover:text-zinc-100 dark:group-hover:text-zinc-950 transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>

                        <Link to="/designer/bookings" className="flex items-center justify-between p-4 rounded-md bg-canvas dark:bg-surface hover:bg-action dark:hover:bg-action border border-line hover:border-line dark:hover:border-line transition-all duration-300 group cursor-pointer">
                            <span className="text-xs font-bold tracking-normal text-muted group-hover:text-zinc-100 dark:group-hover:text-zinc-950 transition-colors flex items-center gap-3">
                                <Briefcase size={16} className="text-action group-hover:text-zinc-100 dark:group-hover:text-zinc-950" /> Your bookings
                            </span>
                            <div className="w-8 h-8 rounded-full bg-canvas dark:bg-subtle group-hover:bg-subtle dark:group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                <ArrowRight size={14} className="text-muted group-hover:text-zinc-100 dark:group-hover:text-zinc-950 transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>

                        <Link to="/designer/wallet" className="flex items-center justify-between p-4 rounded-md bg-canvas dark:bg-surface hover:bg-action dark:hover:bg-action border border-line hover:border-line dark:hover:border-line transition-all duration-300 group cursor-pointer">
                            <span className="text-xs font-bold tracking-normal text-muted group-hover:text-zinc-100 dark:group-hover:text-zinc-950 transition-colors flex items-center gap-3">
                                <Wallet size={16} className="text-action group-hover:text-zinc-100 dark:group-hover:text-zinc-950" /> Withdraw earnings
                            </span>
                            <div className="w-8 h-8 rounded-full bg-canvas dark:bg-subtle group-hover:bg-subtle dark:group-hover:bg-black/10 flex items-center justify-center transition-colors">
                                <ArrowRight size={14} className="text-muted group-hover:text-zinc-100 dark:group-hover:text-zinc-950 transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Audit Trail Signals */}
                <div className="lg:col-span-2 bg-surface p-4 rounded-md border border-line space-y-8 h-full flex flex-col transition-colors duration-300">
                    <div className="border-b border-line pb-5 transition-colors">
                        <h3 className="font-sans text-3xl text-ink tracking-wide mb-2 transition-colors">Recent activity</h3>
                    </div>

                    <div className="flex-1">
                        {loading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map(n => (
                                    <div key={n} className="flex justify-between items-center p-4 bg-canvas dark:bg-surface border border-line rounded-md animate-pulse transition-colors">
                                        <div className="space-y-3 w-1/2">
                                            <div className="h-3 bg-canvas dark:bg-subtle rounded w-full"></div>
                                            <div className="h-2 bg-canvas dark:bg-subtle rounded w-1/3"></div>
                                        </div>
                                        <div className="h-8 bg-canvas dark:bg-subtle w-24 rounded-full"></div>
                                    </div>
                                ))}
                            </div>
                        ) : stats.recentSignals.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[250px] border border-line rounded-md bg-canvas dark:bg-surface space-y-5 p-4 transition-colors duration-300">
                                <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center border border-line transition-colors">
                                    <ShieldCheck size={28} className="text-muted" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs tracking-normal text-muted font-bold mb-2 transition-colors">No recent activity</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stats.recentSignals.map((activity, idx) => {
                                    const formattedDate = new Date(activity.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

                                    return (
                                        <div key={activity.id || idx} className="p-4 flex justify-between items-center text-xs hover:bg-canvas dark:hover:bg-surface bg-canvas dark:bg-surface border border-line rounded-md transition-all duration-300 group">
                                            <div className="space-y-2 pr-4 min-w-0 flex-1">
                                                <p className="font-bold text-ink dark:text-muted line-clamp-1 group-hover:text-ink dark:group-hover:text-ink transition-colors tracking-wide text-sm">{activity.description}</p>
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 size={12} className="text-muted" />
                                                    <p className="text-xs font-mono text-muted tracking-widest transition-colors">{formattedDate}</p>
                                                </div>
                                            </div>
                                            <span className="px-5 py-2.5 rounded-full text-xs font-mono font-bold tracking-normal border shrink-0 bg-canvas dark:bg-subtle border-line text-action transition-colors">
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