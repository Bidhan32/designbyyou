import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom'; 
import { Search, Sparkles, DollarSign, Calendar, FileText, Loader2, Plus, CheckCircle2, Lock, X, AlertCircle, Compass, ShieldAlert, ArrowLeft } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import API from '../../api/axios'; 
import { useAuth } from '../../context/AuthContext';

import SubscriptionPaywall from './SubscriptionPaywall'; 

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function CheckoutForm({ clientSecret, totalAmount, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
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
      <div className="p-4 bg-[#030303] border border-white/10 rounded-xl focus-within:border-[#D4AF37]/50 focus-within:shadow-[0_0_15px_rgba(212,175,55,0.1)] transition-all shadow-inner">
        <CardElement options={{ 
            style: { 
                base: { 
                    fontSize: '14px', 
                    color: '#ffffff',
                    fontFamily: 'system-ui, sans-serif',
                    '::placeholder': { color: '#ffffff40' },
                    iconColor: '#D4AF37'
                },
                invalid: { color: '#ef4444', iconColor: '#ef4444' }
            } 
        }} />
      </div>
      {paymentError && (
          <div className="text-[10px] uppercase tracking-widest text-rose-400 font-bold bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-center flex items-center justify-center gap-2">
              <AlertCircle size={14} /> {paymentError}
          </div>
      )}
      <button type="submit" disabled={!stripe || processing} className="w-full py-4 bg-[#D4AF37] hover:bg-white text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.2)] disabled:bg-[#111] disabled:text-white/30 disabled:border border-white/5 disabled:shadow-none">
        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Authorize Payment (${Number(totalAmount).toFixed(2)})
      </button>
    </form>
  );
}

export default function CreatorCreateBooking() {
  const [searchParams] = useSearchParams(); 
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const isCreator = user?.role === 'creator';
  const isSubscribed = user?.subscription_tier && user?.subscription_tier !== 'free';

  // 🚀 THE FIX: Aggressive URL Parameter Sanitization
  const cleanParam = (param) => {
      const val = searchParams.get(param);
      if (!val) return null;
      const cleanVal = val.trim().toLowerCase();
      if (cleanVal === 'undefined' || cleanVal === 'null') return null;
      return val.trim();
  };

  const showcaseDesignerId = cleanParam('designer_id');
  const showcaseDesignId = cleanParam('design_id');
  
  // 🚀 THE FIX: Ensure Budget is strictly a number or an empty string
  const rawBudget = cleanParam('budget');
  const parsedBudget = parseFloat(rawBudget);
  const showcaseBudget = isNaN(parsedBudget) ? '' : parsedBudget.toString();

  const isDirectMode = !!showcaseDesignerId;

  const [availablePeers, setAvailablePeers] = useState([]);
  const [loadingPeers, setLoadingPeers] = useState(true);
  const [peerError, setPeerError] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeer, setSelectedPeer] = useState(null);
  
  const [agreedPrice, setAgreedPrice] = useState(showcaseBudget);
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
    if (!isCreator) {
        setLoadingPeers(false);
        return;
    }

    const currentUserId = String(user?.id || user?._id);
    if (showcaseDesignerId && showcaseDesignerId === currentUserId) {
        setPeerError("Protocol Violation: You cannot initiate an escrow contract with your own account.");
        setLoadingPeers(false);
        return;
    }

    API.get('/users')
      .then(res => {
        const users = Array.isArray(res.data) ? res.data : res.data?.data || [];
        const designersOnly = users.filter(u => u.role === 'designer');
        setAvailablePeers(designersOnly);
        
        if (showcaseDesignerId) {
            const matchedPeer = designersOnly.find(u => String(u.id || u._id) === String(showcaseDesignerId));
            if (matchedPeer) {
                setSelectedPeer(matchedPeer);
            } else {
                setPeerError("The selected Visionary could not be found in the network.");
            }
        }
      })
      .catch(() => setPeerError("Failed to fetch designer network from secure connection."))
      .finally(() => setLoadingPeers(false));
  }, [showcaseDesignerId, isCreator, user]); 

  const filteredPeers = availablePeers.filter(p => {
    const search = searchQuery.toLowerCase();
    return (p.name || p.username || p.full_name || '').toLowerCase().includes(search);
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
      setFormError(err.response?.data?.message || "Escrow pipeline error. Please verify your inputs.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isCreator) {
      return (
          <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-rose-500/5 blur-[150px] rounded-full w-[50vw] h-[50vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
              <div className="max-w-md w-full bg-[#0a0a0a] border border-white/5 rounded-3xl p-10 text-center shadow-2xl relative z-10">
                  <ShieldAlert className="w-16 h-16 text-rose-500/50 mx-auto mb-6" />
                  <h2 className="text-2xl font-serif text-white tracking-wide mb-2">Access Restricted</h2>
                  <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] font-bold mb-8 leading-relaxed">Only Verified Creators are authorized to initiate commissioning contracts.</p>
                  <button onClick={() => navigate('/')} className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-all border border-white/10">Return to Safety</button>
              </div>
          </div>
      );
  }

  if (successState) {
    return (
      <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#D4AF37]/5 blur-[150px] rounded-full w-[50vw] h-[50vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
        <div className="max-w-md w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-10 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 animate-fade-in-up">
          <div className="w-20 h-20 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-[#D4AF37]/30 shadow-[0_0_30px_rgba(212,175,55,0.2)]">
              <CheckCircle2 className="w-10 h-10 text-[#D4AF37]" />
          </div>
          <h2 className="text-3xl font-serif text-white tracking-wide mb-3">Escrow Secured</h2>
          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] leading-relaxed font-bold mb-10">Your contract valuation funds have been safely deposited in the vault.</p>
          <button onClick={() => navigate('/creator/bookings')} className="w-full py-4 bg-[#D4AF37] hover:bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.2)]">Enter Pipeline</button>
        </div>
      </div>
    );
  }

  const baseValue = parseFloat(agreedPrice) || 0;
  const platformFee = isSubscribed ? 0 : baseValue * 0.10;
  const totalValue = baseValue + platformFee;

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black pb-16 antialiased relative">
      
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[10%] left-[-10%] w-[50vw] h-[50vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div>
      </div>

      <div className="bg-[#0a0a0a]/80 border-b border-white/5 sticky top-0 z-40 px-6 py-6 backdrop-blur-2xl shadow-2xl">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10 animate-fade-in-up">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-[#D4AF37] uppercase tracking-[0.4em] mb-2">
                <Compass size={12} /> Command Center
            </div>
            <h1 className="text-3xl md:text-4xl font-serif font-light tracking-tight drop-shadow-xl">
                Initialize <span className="italic text-[#D4AF37]">Commission</span>
            </h1>
            {isDirectMode && (
                <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[9px] text-white/40 uppercase tracking-[0.3em] font-bold mt-3 hover:text-white transition-colors">
                    <ArrowLeft size={10} /> Back to Showcase
                </button>
            )}
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.3em] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-5 py-2.5 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.1)] flex items-center gap-2 w-max">
            <Lock size={12} /> Secure Network Sync
          </span>
        </div>
      </div>

      <div className={`max-w-[1400px] mx-auto px-6 mt-12 grid grid-cols-1 ${isDirectMode ? 'place-items-center' : 'lg:grid-cols-12'} gap-10 relative z-10`}>
        
        {!isDirectMode && (
            <div className="lg:col-span-4 bg-[#0a0a0a] border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col min-h-[500px] lg:h-[800px] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 blur-[40px] rounded-full pointer-events-none"></div>
            
            <div className="relative mb-6 group z-10 shrink-0">
                <Search className="w-4 h-4 text-white/30 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-[#D4AF37] transition-colors" />
                <input type="text" placeholder="QUERY DESIGNER DIRECTORY..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl pl-12 pr-5 py-4 text-xs font-light text-white focus:outline-none focus:border-[#D4AF37]/50 focus:shadow-[0_0_15px_rgba(212,175,55,0.05)] transition-all placeholder:text-white/30 tracking-wider shadow-inner" />
            </div>
            
            <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
                {loadingPeers ? (
                <div className="h-full flex flex-col items-center justify-center text-[10px] uppercase tracking-[0.2em] font-bold text-[#D4AF37] gap-3"><Loader2 className="w-6 h-6 animate-spin" /> Querying Matrix...</div>
                ) : peerError ? (
                <div className="text-[10px] uppercase tracking-widest text-rose-400 p-5 text-center bg-rose-500/10 rounded-xl border border-rose-500/20 shadow-inner">{peerError}</div>
                ) : filteredPeers.length === 0 ? (
                <div className="text-[10px] uppercase tracking-widest text-white/40 p-5 text-center bg-white/5 rounded-xl border border-white/5 shadow-inner">No Verified Designers Found.</div>
                ) : filteredPeers.map(peer => {
                const isSelected = String(selectedPeer?.id || selectedPeer?._id) === String(peer.id || peer._id);
                return (
                    <div key={peer.id || peer._id} onClick={() => setSelectedPeer(peer)} className={`p-5 rounded-2xl border text-xs cursor-pointer flex justify-between items-center transition-all duration-300 ${isSelected ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10 shadow-[0_0_20px_rgba(212,175,55,0.15)] translate-x-1' : 'border-white/5 bg-[#111] hover:bg-white/5 hover:border-white/10'}`}>
                    <div>
                        <span className={`block font-serif text-lg leading-none mb-1 ${isSelected ? 'text-white' : 'text-white/80'}`}>{peer.name || peer.full_name || peer.username}</span>
                        <span className={`block text-[8px] font-black uppercase tracking-[0.2em] ${isSelected ? 'text-[#D4AF37]' : 'text-white/30'}`}>Verified Pro</span>
                    </div>
                    <div className={`flex items-center justify-center w-5 h-5 rounded-full border transition-colors ${isSelected ? 'border-[#D4AF37] bg-transparent' : 'border-white/10 bg-[#030303]'}`}>
                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,1)]"></div>}
                    </div>
                    </div>
                );
                })}
            </div>
            </div>
        )}

        <div className={`${isDirectMode ? 'w-full max-w-4xl' : 'lg:col-span-8'} bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 md:p-10 shadow-2xl flex flex-col justify-between min-h-[600px] relative overflow-hidden`}>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none"></div>
          
          <form onSubmit={handleInitEscrowRequest} className="space-y-6 flex flex-col h-full justify-between relative z-10">
            <div className="space-y-6">
              
              {formError && (
                <div className="p-5 bg-rose-500/5 border border-rose-500/20 text-[10px] uppercase tracking-widest text-rose-400 rounded-2xl font-bold flex items-center gap-3 backdrop-blur-md shadow-inner">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  <p>{formError}</p>
                </div>
              )}

              {loadingPeers && isDirectMode ? (
                  <div className="p-8 bg-[#111] border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-inner">
                      <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D4AF37]">Locking Target Visionary...</span>
                  </div>
              ) : selectedPeer ? (
                <div className="p-6 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-2xl flex items-center justify-between shadow-[0_0_30px_rgba(212,175,55,0.05)] backdrop-blur-md animate-fade-in">
                  <div>
                      <span className="text-[#D4AF37] font-black uppercase tracking-[0.3em] text-[9px] block mb-2">Direct Commission Target</span>
                      <span className="font-serif text-2xl sm:text-3xl text-white">{selectedPeer.name || selectedPeer.full_name || selectedPeer.username}</span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-[#D4AF37]/10 flex items-center justify-center border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.2)] shrink-0">
                      <CheckCircle2 className="text-[#D4AF37] w-6 h-6" />
                  </div>
                </div>
              ) : (
                <div className="p-8 bg-[#111] border border-dashed border-white/10 text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 rounded-2xl text-center shadow-inner">
                    {peerError || "Please select a Visionary from the directory to begin protocol."}
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] flex items-center gap-2"><DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" /> Valuation Allocation</label>
                  {/* 🚀 THE FIX: We fallback to empty string so React never forces "undefined" into the DOM */}
                  <input type="number" required disabled={!selectedPeer} min="1" placeholder="Amount ($)" value={agreedPrice} onChange={(e) => setAgreedPrice(e.target.value)} className="w-full bg-[#111] border border-white/5 rounded-xl px-5 py-4 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 focus:shadow-[0_0_15px_rgba(212,175,55,0.05)] transition-all disabled:opacity-30 disabled:cursor-not-allowed placeholder:text-white/20 tracking-wider shadow-inner" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-[#D4AF37]" /> Target Deadline</label>
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
                    className="w-full bg-[#111] border border-white/5 rounded-xl px-5 py-4 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 focus:shadow-[0_0_15px_rgba(212,175,55,0.05)] transition-all disabled:opacity-30 disabled:cursor-not-allowed tracking-wider shadow-inner [color-scheme:dark]" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[#D4AF37]" /> Contract Brief & Specifications</label>
                <textarea required disabled={!selectedPeer} rows={4} placeholder={isDirectMode ? "Provide details on how you want this concept adapted for your brand..." : "Describe the aesthetic, layout, features, and technical requirements..."} value={briefText} onChange={(e) => setBriefText(e.target.value)} className="w-full bg-[#111] border border-white/5 rounded-xl px-5 py-4 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 focus:shadow-[0_0_15px_rgba(212,175,55,0.05)] transition-all resize-none disabled:opacity-30 disabled:cursor-not-allowed placeholder:text-white/20 tracking-wide font-light leading-relaxed shadow-inner custom-scrollbar" />
              </div>

              <div className="bg-[#111] border border-white/5 rounded-2xl p-6 shadow-inner space-y-4">
                  <div className="flex justify-between items-center text-[10px] text-white/50 font-bold uppercase tracking-widest">
                      <span>Escrow Allocation</span>
                      <span className="text-white font-mono">${baseValue.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                      <span className="text-white/50">Platform Connection Fee</span>
                      {isSubscribed ? (
                          <span className="text-[#D4AF37]">Waived (Pro)</span>
                      ) : (
                          <span className="text-white font-mono">${platformFee.toFixed(2)}</span>
                      )}
                  </div>

                  {!isSubscribed && (
                      <div className="pt-2">
                          <button 
                              type="button" 
                              onClick={() => setShowPaywall(true)}
                              className="w-full py-3 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] text-[9px] uppercase tracking-[0.2em] font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(212,175,55,0.1)]"
                          >
                              <Sparkles size={12} /> Subscribe to Waive All Fees
                          </button>
                      </div>
                  )}

                  <div className="h-px w-full bg-white/5"></div>
                  
                  <div className="flex justify-between items-center text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]">
                      <span>Total Authorization</span>
                      <span className="font-mono">${totalValue.toFixed(2)}</span>
                  </div>
              </div>

            </div>

            <button type="submit" disabled={submitting || !selectedPeer} className="w-full py-5 mt-4 bg-[#D4AF37] hover:bg-white disabled:bg-[#111] disabled:text-white/20 disabled:border border-white/5 disabled:shadow-none text-black font-black text-[10px] tracking-[0.3em] uppercase rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_0_30px_rgba(212,175,55,0.2)] shrink-0">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Initialize Escrow Request
            </button>
          </form>
        </div>
      </div>

      {isCheckoutOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#030303]/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="min-h-screen flex items-center justify-center p-4 py-12">
            <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-md rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden p-8 space-y-8 relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 blur-[50px] rounded-full pointer-events-none"></div>
              
              <div className="flex items-center justify-between border-b border-white/5 pb-5 relative z-10">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Secure Gateway</span>
                <button 
                  onClick={() => setIsCheckoutOpen(false)} 
                  className="p-2 text-white/30 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="relative z-10">
                  <Elements stripe={stripePromise}>
                    <CheckoutForm clientSecret={checkoutSecret} totalAmount={totalValue} onSuccess={() => { setIsCheckoutOpen(false); setSuccessState(true); }} />
                  </Elements>
              </div>
            </div>
          </div>
        </div>
      )}

      <SubscriptionPaywall 
          isOpen={showPaywall} 
          onClose={() => setShowPaywall(false)} 
      />

    </div>
  );
}