import React, { useState, useEffect } from 'react';
import { Loader2, ShieldCheck, Coins, FileText, ArrowUpRight, Sparkles, AlertCircle } from 'lucide-react';
import API from '../../api/axios'; 

const CreatorWallet = () => {
    const [metrics, setMetrics] = useState({ locked_escrow_balance: 0, total_lifespan_spend: 0 });
    const [ledger, setLedger] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchCreatorFinancialData();
    }, []);

    const fetchCreatorFinancialData = async () => {
        try {
            setLoading(true);
            setError('');
            
            // Parallel extraction across your secure backend endpoints
            const [summaryRes, ledgerRes] = await Promise.all([
                API.get('/creator-finance/summary'),
                API.get('/creator-finance/ledger')
            ]);

            setMetrics(summaryRes.data?.data || { locked_escrow_balance: 0, total_lifespan_spend: 0 });
            setLedger(ledgerRes.data?.data || []);
        } catch (err) {
            console.error("Error synchronizing creator financial ledger:", err);
            setError(err.response?.data?.message || 'Failed to sync platform payment matrix.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#030303] flex flex-col items-center justify-center gap-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-[#D4AF37]/5 blur-[150px] rounded-full w-[40vw] h-[40vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
                <div className="relative z-10">
                    <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                    <Loader2 className="animate-spin text-white/20" size={40} />
                </div>
                <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.3em] animate-pulse relative z-10">Decrypting Ledger...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans relative overflow-x-hidden pb-32 animate-fade-in">
            
            {/* AMBIENT BREATHING GLOW */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '10s' }}></div>
            </div>

            <div className="max-w-[1400px] mx-auto px-6 mt-12 relative z-10">
                
                {/* Header Section */}
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-serif font-light text-white tracking-tight leading-tight mb-3">
                        Financial <span className="italic text-[#D4AF37]">Ledger</span>
                    </h1>
                    <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">Track deposit invoices, active escrow protections, and project payments.</p>
                </div>

                {error && (
                    <div className="mb-8 p-5 bg-rose-500/5 border border-rose-500/20 text-[10px] uppercase tracking-widest text-rose-400 font-bold rounded-2xl flex items-center gap-3 shadow-inner">
                        <AlertCircle size={16} className="text-rose-500 shrink-0" /> {error}
                    </div>
                )}

                {/* --- METRICS GRID --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    
                    {/* Metric 1: Total Spent */}
                    <div className="bg-[#0a0a0a] p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 p-4 opacity-[0.02] text-white group-hover:text-[#D4AF37] transition-colors duration-700 pointer-events-none rotate-12">
                            <Coins size={120} strokeWidth={1} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Total Capital Allocated</p>
                            <p className="text-4xl font-serif text-white tracking-tight drop-shadow-md mb-2">
                                ${parseFloat(metrics.total_lifespan_spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            <span className="text-[9px] text-[#D4AF37] font-black uppercase tracking-widest inline-flex items-center gap-1.5 bg-[#D4AF37]/10 px-3 py-1.5 rounded-lg border border-[#D4AF37]/20 shadow-inner">
                                <ShieldCheck size={12} /> Billed via Stripe
                            </span>
                        </div>
                    </div>

                    {/* Metric 2: Escrow Lock */}
                    <div className="bg-[#111] p-8 rounded-3xl border border-[#D4AF37]/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
                        <div className="absolute -right-4 -top-4 p-4 opacity-[0.05] text-[#D4AF37] group-hover:scale-110 transition-transform duration-700 pointer-events-none -rotate-12">
                            <ShieldCheck size={120} strokeWidth={1} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] mb-4">Active Escrow Safeguard</p>
                            <p className="text-4xl font-serif text-white tracking-tight drop-shadow-md mb-2">
                                ${parseFloat(metrics.locked_escrow_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            <span className="text-[9px] text-white/50 font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                                Secured in Vault
                            </span>
                        </div>
                    </div>

                    {/* Metric 3: Ledger Count */}
                    <div className="bg-[#0a0a0a] p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 p-4 opacity-[0.02] text-white group-hover:text-indigo-400 transition-colors duration-700 pointer-events-none rotate-12">
                            <FileText size={120} strokeWidth={1} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Transaction Logs</p>
                            <p className="text-4xl font-serif text-white tracking-tight drop-shadow-md mb-2">{ledger.length}</p>
                            <span className="text-[9px] text-indigo-400 font-black uppercase tracking-widest inline-flex items-center gap-1.5 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 shadow-inner">
                                <ArrowUpRight size={12} /> Recorded Events
                            </span>
                        </div>
                    </div>
                </div>

                {/* --- INVOICE HISTORY TABLE --- */}
                <div className="bg-[#0a0a0a] rounded-3xl border border-white/5 shadow-2xl overflow-hidden relative z-10">
                    <div className="px-8 py-6 border-b border-white/5 bg-[#111]/50 flex items-center gap-4">
                        <div className="p-3 bg-[#030303] rounded-xl border border-white/10 shadow-inner"><FileText size={16} className="text-[#D4AF37]" /></div>
                        <div>
                            <h3 className="text-lg font-serif text-white tracking-wide">Billing & Payment History</h3>
                            <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-bold mt-1">Official itemized ledger statements.</p>
                        </div>
                    </div>

                    {ledger.length === 0 ? (
                        <div className="p-20 text-center flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-[#111] border border-white/5 flex items-center justify-center shadow-inner">
                                <Sparkles size={24} className="text-white/20" />
                            </div>
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">No transactional logs found.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-[#030303] text-white/30 uppercase text-[9px] font-black tracking-[0.2em] border-b border-white/5">
                                        <th className="py-5 px-8">Transaction / ID</th>
                                        <th className="py-5 px-8">Recipient Account</th>
                                        <th className="py-5 px-8">Date Processed</th>
                                        <th className="py-5 px-8">Gateway Intent</th>
                                        <th className="py-5 px-8 text-right">Gross Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-sm">
                                    {ledger.map((tx) => {
                                        const isEscrowLock = tx.transaction_type === 'escrow_lock';
                                        const isRefund = tx.transaction_type === 'refund';
                                        
                                        return (
                                            <tr key={tx.transaction_id} className="hover:bg-[#111] transition-colors group">
                                                <td className="py-5 px-8">
                                                    <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-[8px] font-black tracking-[0.2em] uppercase border mb-2 shadow-inner
                                                        ${isEscrowLock ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 
                                                          isRefund ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                                                          'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                                        {tx.transaction_type.replace('_', ' ')}
                                                    </span>
                                                    <div className="font-mono text-[10px] text-white/30 group-hover:text-white/50 transition-colors">
                                                        ID: {tx.transaction_id.substring(0, 12)}...
                                                    </div>
                                                </td>
                                                <td className="py-5 px-8 font-serif text-white">
                                                    {tx.recipient_name || <span className="text-white/40 italic font-sans text-xs">Platform System</span>}
                                                </td>
                                                <td className="py-5 px-8 text-white/50 font-light text-xs">
                                                    {new Date(tx.created_at).toLocaleDateString('en-US', {
                                                        year: 'numeric', month: 'short', day: 'numeric'
                                                    })}
                                                </td>
                                                <td className="py-5 px-8">
                                                    <span className="font-mono text-[10px] text-white/40 bg-[#030303] px-3 py-1.5 rounded-lg border border-white/5 shadow-inner">
                                                        {tx.stripe_payment_intent_id ? tx.stripe_payment_intent_id.substring(0, 14) + "..." : 'N/A'}
                                                    </span>
                                                </td>
                                                <td className={`py-5 px-8 text-right font-black font-mono text-lg ${isRefund ? 'text-rose-400' : 'text-[#D4AF37]'}`}>
                                                    {isRefund ? '+' : ''}${parseFloat(tx.gross_amount).toFixed(2)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreatorWallet;