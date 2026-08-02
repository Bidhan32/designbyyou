import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom'; 
import { Search, Sparkles, DollarSign, Calendar, FileText, Loader2, Plus, CheckCircle2, Lock, X, AlertCircle, Compass } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import API from '../../api/axios'; 
// 🚀 IMPORT THEME HOOK
import { useTheme } from '../../context/ThemeContext';
// 🚀 IMPORT THE PAYWALL COMPONENT
import SubscriptionPaywall from './SubscriptionPaywall'; 

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function CheckoutForm({ clientSecret, totalAmount, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const { theme } = useTheme(); // 🚀 Read current theme for Stripe
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
        onSuccess();
      }
    } catch (err) {
      setPaymentError("Network connection dropped.");
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleCardPaymentSubmit} className="space-y-5">
      <div className="p-4 bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-white/10 rounded-xl focus-within:border-[#D4AF37] dark:focus-within:border-[#D4AF37]/50 transition-colors shadow-sm dark:shadow-inner">
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
      <button type="submit" disabled={!stripe || processing} className="w-full py-4 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl flex items-center justify-center gap-2 transition-all shadow-md dark:shadow-[0_0_20px_rgba(212,175,55,0.2)] disabled:bg-slate-200 dark:disabled:bg-white/5 disabled:text-slate-400 dark:disabled:text-white/30 disabled:shadow-none">
        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Authorize Payment (${Number(totalAmount).toLocaleString()})
      </button>
    </form>
  );
}

export default function DesignerCreateBooking() {
  const [searchParams] = useSearchParams(); 
  const navigate = useNavigate();

  const showcaseDesignerId = searchParams.get('designer_id');
  const showcaseDesignId = searchParams.get('design_id');
  const showcaseBudget = searchParams.get('budget');

  const [availablePeers, setAvailablePeers] = useState([]);
  const [loadingPeers, setLoadingPeers] = useState(true);
  const [peerError, setPeerError] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeer, setSelectedPeer] = useState(null);
  
  const [agreedPrice, setAgreedPrice] = useState(showcaseBudget || '');
  const [deadline, setDeadline] = useState('');
  const [briefText, setBriefText] = useState('');
  const [formError, setFormError] = useState(null); 

  const [checkoutSecret, setCheckoutSecret] = useState(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successState, setSuccessState] = useState(false);

  const [showPaywall, setShowPaywall] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    API.get('/users')
      .then(res => {
        const users = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setAvailablePeers(users);
        
        // Bulletproof String Matching
        if (showcaseDesignerId) {
            const matchedPeer = users.find(u => String(u.id || u._id) === String(showcaseDesignerId));
            if (matchedPeer) {
                setSelectedPeer(matchedPeer);
            }
        }
      })
      .catch(() => setPeerError("Failed to fetch platform users from backend connection pool."))
      .finally(() => setLoadingPeers(false));
  }, [showcaseDesignerId]); 

  const filteredPeers = availablePeers.filter(p => {
    const search = searchQuery.toLowerCase();
    return (p.name || p.username || p.full_name || '').toLowerCase().includes(search) || (p.role || '').toLowerCase().includes(search);
  });

  const handleInitEscrowRequest = async (e) => {
    e.preventDefault();
    if (!selectedPeer) return;
    
    setFormError(null); 
    setSubmitting(true);
    
    try {
      const response = await API.post('/p2p-bookings/create', {
        receiver_id: selectedPeer.id || selectedPeer._id,
        design_id: showcaseDesignId || null, 
        agreed_price: parseFloat(agreedPrice),
        deadline,
        brief_text: briefText
      });
      if (response.data?.clientSecret) {
        setCheckoutSecret(response.data.clientSecret);
        setIsCheckoutOpen(true);
      }
    } catch (err) {
      if (err.response?.data?.code === 'PAYWALL_TRIGGER') {
          setShowPaywall(true);
      } else {
          setFormError(err.response?.data?.message || "Escrow pipeline error. Please verify your inputs.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (successState) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#030303] flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
        <div className="absolute inset-0 bg-[#D4AF37]/5 blur-[150px] rounded-full w-[50vw] h-[50vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="max-w-md w-full bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 rounded-3xl p-10 text-center shadow-lg dark:shadow-[0_0_50px_rgba(212,175,55,0.1)] relative z-10 animate-fade-in-up transition-colors duration-300">
          <div className="w-20 h-20 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#D4AF37]/30 shadow-sm dark:shadow-[0_0_20px_rgba(212,175,55,0.2)]">
              <CheckCircle2 className="w-10 h-10 text-[#D4AF37]" />
          </div>
          <h2 className="text-3xl font-serif text-slate-900 dark:text-white tracking-tight mb-2 transition-colors">Escrow Secured</h2>
          <p className="text-[11px] text-slate-500 dark:text-white/50 uppercase tracking-[0.2em] leading-relaxed font-bold mb-8 transition-colors">Your contract allocation funds have been safely transferred to the vault.</p>
          <button onClick={() => navigate('/designer/bookings')} className="w-full py-4 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-all shadow-md dark:shadow-[0_0_20px_rgba(212,175,55,0.2)]">Enter Pipeline</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-900 dark:text-white pb-16 antialiased relative transition-colors duration-300">
      
      {/* AMBIENT BACKGROUND GLOW */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[20%] left-[10%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div>
      </div>

      {/* HEADER */}
      <div className="bg-white/80 dark:bg-[#030303]/80 border-b border-slate-200 dark:border-white/5 sticky top-0 z-30 px-6 py-6 backdrop-blur-2xl transition-colors duration-300 shadow-sm dark:shadow-none">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10 animate-fade-in-up">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-[#D4AF37] uppercase tracking-[0.4em] mb-2">
                <Compass size={12} /> Contract Generation
            </div>
            <h1 className="text-3xl md:text-4xl font-serif font-light tracking-tighter drop-shadow-sm dark:drop-shadow-xl transition-colors">
                Initialize <span className="italic text-[#D4AF37]">Escrow</span>
            </h1>
            {showcaseDesignId && <p className="text-[9px] text-slate-500 dark:text-white/30 uppercase tracking-[0.3em] font-bold mt-2 transition-colors">Sourced from Exhibition</p>}
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.3em] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-4 py-2 rounded-full shadow-sm dark:shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-colors">
            Secure Network Sync
          </span>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* USERS LIST CONTAINER (LEFT COLUMN) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-lg dark:shadow-2xl flex flex-col h-[560px] transition-colors duration-300">
          <div className="relative mb-5 group">
            <Search className="w-4 h-4 text-slate-400 dark:text-white/40 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-[#D4AF37] dark:group-focus-within:text-[#D4AF37] transition-colors" />
            <input type="text" placeholder="QUERY CREATOR DIRECTORY..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-xs font-light text-slate-900 dark:text-white focus:outline-none focus:border-[#D4AF37] dark:focus:border-[#D4AF37]/50 transition-colors placeholder:text-slate-400 dark:placeholder:text-white/30 tracking-wider shadow-sm dark:shadow-inner" />
          </div>
          
          <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {loadingPeers ? (
              <div className="h-full flex flex-col items-center justify-center text-[10px] uppercase tracking-[0.2em] font-bold text-[#D4AF37] gap-3"><Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" /> Querying Matrix...</div>
            ) : peerError ? (
              <div className="text-[10px] uppercase tracking-widest text-rose-600 dark:text-rose-400 p-4 text-center bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-200 dark:border-rose-500/20 transition-colors">{peerError}</div>
            ) : filteredPeers.map(peer => {
              const isSelected = String(selectedPeer?.id || selectedPeer?._id) === String(peer.id || peer._id);
              return (
                <div key={peer.id || peer._id} onClick={() => setSelectedPeer(peer)} className={`p-4 rounded-2xl border text-xs cursor-pointer flex justify-between items-center transition-all duration-300 shadow-sm dark:shadow-none ${isSelected ? 'border-[#D4AF37] bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 dark:shadow-[0_0_15px_rgba(212,175,55,0.15)]' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#030303] hover:bg-slate-100 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'}`}>
                  <div>
                    <span className={`block font-serif text-base transition-colors ${isSelected ? 'text-[#D4AF37]' : 'text-slate-900 dark:text-white'}`}>{peer.name || peer.full_name || peer.username}</span>
                    <span className="block text-[9px] text-slate-500 dark:text-white/40 font-bold uppercase tracking-[0.2em] mt-1 transition-colors">{peer.role || 'Creator'}</span>
                  </div>
                  <div className={`flex items-center justify-center w-5 h-5 rounded-full border transition-colors ${isSelected ? 'border-[#D4AF37] bg-transparent' : 'border-slate-300 dark:border-white/20 bg-transparent'}`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] shadow-[0_0_5px_rgba(212,175,55,0.8)]"></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* INPUT FORM SCHEMATICS CONTAINER (RIGHT COLUMN) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-white/5 rounded-3xl p-8 shadow-lg dark:shadow-2xl flex flex-col justify-between h-[560px] transition-colors duration-300">
          <form onSubmit={handleInitEscrowRequest} className="space-y-6 flex flex-col h-full justify-between">
            <div className="space-y-6">
              
              {/* Conflict Error Banner */}
              {formError && (
                <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-[10px] uppercase tracking-widest text-rose-600 dark:text-rose-400 rounded-xl font-bold flex items-start gap-3 transition-colors">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <p className="mt-0.5">{formError}</p>
                </div>
              )}

              {selectedPeer ? (
                <div className="p-5 bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 border border-[#D4AF37]/20 dark:border-[#D4AF37]/30 text-xs rounded-2xl flex items-center justify-between shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.05)] transition-colors">
                  <div>
                      <span className="text-[#D4AF37] font-bold uppercase tracking-[0.3em] text-[9px] block mb-1">Contract Recipient Assessed</span>
                      <span className="font-serif text-2xl text-slate-900 dark:text-white transition-colors">{selectedPeer.name || selectedPeer.full_name || selectedPeer.username}</span>
                  </div>
                  <CheckCircle2 className="text-[#D4AF37] w-8 h-8 opacity-50" />
                </div>
              ) : (
                <div className="p-6 bg-slate-50 dark:bg-[#030303] border border-dashed border-slate-300 dark:border-white/10 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 dark:text-white/40 rounded-2xl text-center shadow-sm dark:shadow-none transition-colors">
                    Please select a creator from the directory to begin.
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-slate-500 dark:text-white/50 tracking-[0.2em] flex items-center gap-2 transition-colors"><DollarSign className="w-3 h-3 text-[#D4AF37]" /> Valuation Allocation</label>
                  <input type="number" required disabled={!selectedPeer} min="1" placeholder="Amount ($)" value={agreedPrice} onChange={(e) => setAgreedPrice(e.target.value)} className="w-full bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#D4AF37] dark:focus:border-[#D4AF37]/50 transition-colors disabled:opacity-50 dark:disabled:opacity-30 disabled:cursor-not-allowed placeholder:text-slate-400 dark:placeholder:text-white/20 tracking-wider shadow-sm dark:shadow-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-slate-500 dark:text-white/50 tracking-[0.2em] flex items-center gap-2 transition-colors"><Calendar className="w-3 h-3 text-[#D4AF37]" /> Target Deadline</label>
                  <input 
                    type="date" 
                    required 
                    disabled={!selectedPeer} 
                    min={today} 
                    value={deadline} 
                    onChange={(e) => {
                      setDeadline(e.target.value);
                      setFormError(null); 
                    }} 
                    className="w-full bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#D4AF37] dark:focus:border-[#D4AF37]/50 transition-colors disabled:opacity-50 dark:disabled:opacity-30 disabled:cursor-not-allowed tracking-wider shadow-sm dark:shadow-none [color-scheme:light] dark:[color-scheme:dark]" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-500 dark:text-white/50 tracking-[0.2em] flex items-center gap-2 transition-colors"><FileText className="w-3 h-3 text-[#D4AF37]" /> Contract Brief & Specifications</label>
                <textarea required disabled={!selectedPeer} rows={4} placeholder="Describe the aesthetic, layout, features, and technical specs..." value={briefText} onChange={(e) => setBriefText(e.target.value)} className="w-full bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#D4AF37] dark:focus:border-[#D4AF37]/50 transition-colors resize-none disabled:opacity-50 dark:disabled:opacity-30 disabled:cursor-not-allowed placeholder:text-slate-400 dark:placeholder:text-white/20 tracking-wide font-light leading-relaxed shadow-sm dark:shadow-none" />
              </div>
            </div>

            <button type="submit" disabled={submitting || !selectedPeer} className="w-full py-4 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white disabled:bg-slate-200 dark:disabled:bg-white/5 disabled:text-slate-400 dark:disabled:text-white/20 disabled:border border-slate-300 dark:border-white/10 disabled:shadow-none text-black hover:text-white dark:hover:text-black font-bold text-[10px] tracking-[0.3em] uppercase rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-md dark:shadow-[0_0_20px_rgba(212,175,55,0.2)]">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Initialize Escrow Request
            </button>
          </form>
        </div>
      </div>

      {/* STRIPE ELEMENT MODAL */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-[#030303]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 w-full max-w-md rounded-3xl shadow-2xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden p-8 space-y-6 animate-in zoom-in-95 duration-300 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4 transition-colors">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-white transition-colors">Secure Gateway</span>
              <button 
                onClick={() => setIsCheckoutOpen(false)} 
                className="p-2 text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <Elements stripe={stripePromise}>
              <CheckoutForm clientSecret={checkoutSecret} totalAmount={parseFloat(agreedPrice) || 0} onSuccess={() => { setIsCheckoutOpen(false); setSuccessState(true); }} />
            </Elements>
          </div>
        </div>
      )}

      {/* SUBSCRIPTION PAYWALL MODAL */}
      <SubscriptionPaywall 
          isOpen={showPaywall} 
          onClose={() => setShowPaywall(false)} 
      />

    </div>
  );
}