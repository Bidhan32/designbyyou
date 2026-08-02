import React, { useState, useEffect, useMemo } from 'react';
import API from '../../api/axios';
import { 
    Wallet, ArrowUpRight, Clock, CheckCircle, AlertTriangle, 
    Building2, ListFilter, Sparkles, ArrowDownLeft, Loader2, Lock, TrendingUp, Plus, X, ArrowDownToLine, FileText
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
// 🚀 IMPORT THEME HOOK
import { useTheme } from '../../context/ThemeContext';

// 🚀 INITIALIZE STRIPE
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const safeFloat = (value) => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0.00 : parsed;
};

// 🚀 STRIPE CHECKOUT FORM
function CheckoutForm({ clientSecret, totalAmount, onSuccess }) {
    const stripe = useStripe();
    const elements = useElements();
    const { theme } = useTheme(); // 🚀 Read the current theme
    const [processing, setProcessing] = useState(false);
    const [paymentError, setPaymentError] = useState(null);
  
    const handleCardPaymentSubmit = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setProcessing(true);
        setPaymentError(null);
  
        try {
            const result = await stripe.confirmCardPayment(clientSecret, {
                payment_method: { card: elements.getElement(CardElement) }
            });
            if (result.error) {
                setPaymentError(result.error.message);
                setProcessing(false);
            } else if (result.paymentIntent.status === 'succeeded') {
                onSuccess(result.paymentIntent.id);
            }
        } catch (err) {
            setPaymentError("Network connection dropped.");
            setProcessing(false);
        }
    };
  
    return (
        <form onSubmit={handleCardPaymentSubmit} className="space-y-5">
            <div className="p-4 bg-white dark:bg-[#030303] border border-slate-300 dark:border-white/10 rounded-xl focus-within:border-[#D4AF37] dark:focus-within:border-[#D4AF37]/50 transition-colors shadow-sm dark:shadow-inner">
                <CardElement options={{ 
                    style: { 
                        base: { 
                            fontSize: '14px', 
                            // 🚀 Dynamically swap Stripe colors based on your Tailwind theme!
                            color: theme === 'dark' ? '#ffffff' : '#0f172a', 
                            fontFamily: 'system-ui, sans-serif',
                            '::placeholder': { color: theme === 'dark' ? '#ffffff40' : '#94a3b8' }, 
                            iconColor: '#D4AF37'
                        },
                        invalid: { color: '#ef4444', iconColor: '#ef4444' }
                    } 
                }} />
            </div>
            {paymentError && <div className="text-[10px] uppercase tracking-widest text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-500/10 p-3 rounded-lg border border-rose-200 dark:border-rose-500/20 text-center transition-colors duration-300">{paymentError}</div>}
            <button type="submit" disabled={!stripe || processing} className="w-full py-4 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-md dark:shadow-[0_0_20px_rgba(212,175,55,0.2)] disabled:bg-slate-200 dark:disabled:bg-white/5 disabled:text-slate-400 dark:disabled:text-white/30 disabled:shadow-none">
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Authorize Funding (${Number(totalAmount).toFixed(2)})
            </button>
        </form>
    );
}

const DesignerWallet = () => {
    const [walletData, setWalletData] = useState({ available_balance: 0, pending_escrow_balance: 0 });
    const [payouts, setPayouts] = useState([]);
    const [earnings, setEarnings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    
    // Action Toggle
    const [actionType, setActionType] = useState('withdraw');

    // Withdraw States
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [payoutMethod, setPayoutMethod] = useState('stripe');
    const [payoutDetails, setPayoutDetails] = useState('');
    
    // Deposit States
    const [depositAmount, setDepositAmount] = useState('');
    const [checkoutSecret, setCheckoutSecret] = useState(null);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState('earnings');

    const fetchWalletData = async () => {
        try {
            setLoading(true);
            setError('');
            const [walletRes, payoutsRes, ledgerRes] = await Promise.all([
                API.get('/designer-finance/wallet'),   
                API.get('/designer-finance/payouts'),   
                API.get('/designer-finance/ledger')    
            ]);
            setWalletData(walletRes.data?.data || { available_balance: 0, pending_escrow_balance: 0 });
            setPayouts(payoutsRes.data?.data || []);
            setEarnings(ledgerRes.data?.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to sync ledger matrix.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchWalletData(); }, []);

    const ledgerMetrics = useMemo(() => {
        const available = safeFloat(walletData.available_balance);
        const pending = safeFloat(walletData.pending_escrow_balance);
        const withdrawn = payouts
            .filter(p => p.status === 'processed' || p.status === 'completed')
            .reduce((sum, p) => sum + safeFloat(p.amount), 0);
        return { available, pending, withdrawn };
    }, [walletData, payouts]);

    const handleWithdrawalRequest = async (e) => {
        e.preventDefault();
        const amountNum = parseFloat(withdrawAmount);
        if (isNaN(amountNum) || amountNum <= 0) return setError('Invalid amount.');
        if (amountNum > ledgerMetrics.available) return setError('Insufficient available capital.');

        setIsSubmitting(true);
        try {
            await API.post('/designer-finance/payouts', { amount: amountNum, payoutMethod, accountDetails: payoutDetails });
            setSuccessMessage(`Payout request for $${amountNum.toFixed(2)} dispatched.`);
            setWithdrawAmount(''); setPayoutDetails('');
            setActiveTab('payouts'); 
            await fetchWalletData();
        } catch (err) {
            setError(err.response?.data?.message || 'Transaction rejected.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDepositRequest = async (e) => {
        e.preventDefault();
        const amountNum = parseFloat(depositAmount);
        if (isNaN(amountNum) || amountNum <= 0) return setError('Invalid deposit amount.');

        setIsSubmitting(true);
        try {
            const { data } = await API.post('/designer-finance/wallet/deposit', { amount: amountNum });
            if (data.clientSecret) {
                setCheckoutSecret(data.clientSecret);
                setIsCheckoutOpen(true);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to initialize secure gateway.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDepositSuccess = async (paymentIntentId) => {
        try {
            await API.post('/designer-finance/wallet/verify-deposit', {
                paymentIntentId: paymentIntentId,
                amount: parseFloat(depositAmount)
            });
            setIsCheckoutOpen(false);
            setDepositAmount('');
            setSuccessMessage('Capital successfully loaded into your secure wallet.');
            await fetchWalletData();
        } catch (err) {
            setError("Payment succeeded, but ledger sync failed.");
            setIsCheckoutOpen(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#030303] text-slate-900 dark:text-white p-6 md:p-12 space-y-10 relative overflow-x-hidden animate-fade-in transition-colors duration-300">
            <div className="fixed inset-0 pointer-events-none z-0"><div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div></div>

            <div className="max-w-[1600px] mx-auto border-b border-slate-200 dark:border-white/5 pb-8 relative z-10 transition-colors duration-300">
                <div className="flex items-center gap-2 text-[9px] font-bold text-[#D4AF37] uppercase tracking-[0.4em] mb-3"><Sparkles size={12} /> Studio Ledger</div>
                <h1 className="text-5xl font-serif font-light tracking-tighter text-slate-900 dark:text-white transition-colors duration-300">Capital <span className="italic text-[#D4AF37]">Management</span></h1>
            </div>

            <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                {[
                    { title: "Cleared Capital", val: ledgerMetrics.available, icon: Wallet, color: "text-emerald-500 dark:text-emerald-400" },
                    { title: "Escrow Locked", val: ledgerMetrics.pending, icon: Lock, color: "text-[#D4AF37]" },
                    { title: "Total Lifetime Out", val: ledgerMetrics.withdrawn, icon: TrendingUp, color: "text-indigo-500 dark:text-indigo-400" }
                ].map((m, i) => (
                    <div key={i} className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 p-8 rounded-3xl shadow-lg dark:shadow-2xl flex items-center justify-between transition-colors duration-300">
                        <div>
                            <p className="text-[9px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-[0.3em] mb-2 transition-colors duration-300">{m.title}</p>
                            <p className="text-4xl font-serif text-slate-900 dark:text-white tracking-tight transition-colors duration-300">${m.val.toFixed(2)}</p>
                        </div>
                        <div className={`p-4 rounded-2xl bg-slate-50 dark:bg-white/5 ${m.color} transition-colors duration-300`}><m.icon size={20} /></div>
                    </div>
                ))}
            </div>

            <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
                
                {/* ACTIONS PANEL */}
                <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-3xl p-8 shadow-lg dark:shadow-2xl space-y-8 h-fit transition-colors duration-300">
                    <div className="border-b border-slate-100 dark:border-white/5 pb-6 transition-colors duration-300">
                        <div className="flex bg-slate-100 dark:bg-[#111] p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 transition-colors duration-300">
                            {['withdraw', 'deposit'].map(type => (
                                <button key={type} onClick={() => setActionType(type)} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-[0.2em] rounded-xl transition-all duration-300 ${actionType === type ? 'bg-white dark:bg-[#030303] text-slate-900 dark:text-white shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent' : 'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70'}`}>
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* WITHDRAWAL FORM */}
                    {actionType === 'withdraw' ? (
                        <form onSubmit={handleWithdrawalRequest} className="space-y-5">
                            <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="w-full bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-white/10 rounded-xl p-4 text-sm font-mono focus:border-[#D4AF37] dark:focus:border-[#D4AF37] outline-none transition-colors duration-300 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30" placeholder="Amount ($)" />
                            <button className="w-full py-4 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all duration-300 shadow-md dark:shadow-[0_0_20px_rgba(212,175,55,0.2)]">Confirm Settlement</button>
                        </form>
                    ) : (
                    /* DEPOSIT FORM */
                        <form onSubmit={handleDepositRequest} className="space-y-5">
                            <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="w-full bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-[#D4AF37]/30 rounded-xl p-4 text-sm font-mono focus:border-[#D4AF37] outline-none transition-colors duration-300 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30" placeholder="Deposit Amount ($)" />
                            <button className="w-full py-4 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all duration-300 shadow-md dark:shadow-[0_0_20px_rgba(212,175,55,0.2)]">Secure Gateway</button>
                        </form>
                    )}
                </div>

                {/* LEDGER / TRANSACTIONS LIST */}
                <div className="lg:col-span-2 bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-3xl p-8 shadow-lg dark:shadow-2xl transition-colors duration-300">
                    <div className="flex gap-8 border-b border-slate-200 dark:border-white/5 pb-6 mb-6 transition-colors duration-300">
                        {['earnings', 'payouts'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`text-[10px] font-bold uppercase tracking-[0.3em] transition-colors duration-300 ${activeTab === tab ? 'text-[#D4AF37]' : 'text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50'}`}>{tab}</button>
                        ))}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-600 dark:text-white/60">
                            <thead className="text-[9px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/60 transition-colors duration-300">
                                <tr>
                                    <th className="p-4 font-bold">Reference</th>
                                    <th className="p-4 font-bold">Amount</th>
                                    <th className="p-4 font-bold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(activeTab === 'earnings' ? earnings : payouts).map((tx, i) => (
                                    <tr key={i} className="border-t border-slate-100 dark:border-white/5 transition-colors duration-300">
                                        <td className="p-4 font-mono text-slate-700 dark:text-white/80">#{String(tx.transaction_id || tx.request_id || i).slice(0, 8)}</td>
                                        <td className="p-4 font-bold text-[#D4AF37]">${parseFloat(tx.gross_amount || tx.amount).toFixed(2)}</td>
                                        <td className="p-4">
                                            <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-white/5 text-[9px] font-bold tracking-wider uppercase text-slate-600 dark:text-white/80 transition-colors duration-300">
                                                {tx.status || 'Settled'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {(activeTab === 'earnings' ? earnings : payouts).length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="p-8 text-center text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/20 transition-colors duration-300">
                                            No ledger entries found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* SECURE CHECKOUT MODAL OVERLAY */}
            {isCheckoutOpen && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 dark:bg-[#030303]/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl transition-colors duration-300 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-white">Secure Gateway</h3>
                            <button onClick={() => setIsCheckoutOpen(false)} className="text-slate-400 hover:text-rose-500 dark:text-white/30 dark:hover:text-rose-400 transition-colors"><X size={18} /></button>
                        </div>
                        <Elements stripe={stripePromise}>
                            <CheckoutForm clientSecret={checkoutSecret} totalAmount={depositAmount} onSuccess={handleDepositSuccess} />
                        </Elements>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DesignerWallet;