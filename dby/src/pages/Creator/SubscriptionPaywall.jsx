import React, { useState } from 'react';
import { X, CheckCircle2, Shield, Sparkles, Compass, Loader2, AlertCircle } from 'lucide-react';
import API from '../../api/axios';

export default function SubscriptionPaywall({ isOpen, onClose }) {
    const [selectedBilling, setSelectedBilling] = useState('yearly'); 
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);

    if (!isOpen) return null;

    // 🚀 YOUR ACTUAL STRIPE PRICING TIERS
    // REPLACE THE 'id' STRINGS BELOW WITH YOUR REAL STRIPE IDs (Starting with price_1...)
    const plans = {
        monthly: { 
            price: 35, 
            interval: 'month', 
            savings: null, 
            id: 'price_1TuVYyHJixGHOCjtQYycaDRx' 
        },
        quarterly: { 
            price: 20, // $60 total / 3 months = $20/mo display
            interval: 'month', 
            savings: 'Save $45/yr', 
            id: 'price_1TuVbxHJixGHOCjtNe59klTE', 
            total: 60 
        },
        yearly: { 
            price: 8.25, // $99 total / 12 months = $8.25/mo display
            interval: 'month', 
            savings: 'Save $321/yr', 
            id: 'price_1TuVciHJixGHOCjtjFnjThix', 
            total: 99 
        }
    };

    const currentPlan = plans[selectedBilling];

    // 🚀 THE SECURE CHECKOUT HANDLER
    const handleSubscribe = async () => {
        setIsProcessing(true);
        setError(null);
        
        try {
            // Ping your Node.js backend to generate a Stripe Checkout Session
            const { data } = await API.post('/subscriptions/create-checkout-session', {
                priceId: currentPlan.id,
                interval: selectedBilling
            });

            // Stripe backend will return a secure session URL
            if (data.url) {
                window.location.href = data.url; // Redirect to Stripe
            } else {
                throw new Error("Invalid gateway response.");
            }
        } catch (err) {
            console.error("Subscription initialization failed:", err);
            setError(err.response?.data?.message || "Failed to initialize secure checkout. Please try again.");
            setIsProcessing(false); // Only reset if failed. If success, they are leaving the page anyway.
        }
    };

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#030303]/80 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/10 via-transparent to-transparent pointer-events-none"></div>
                
                <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-4xl rounded-[2rem] shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden relative flex flex-col md:flex-row z-10">
                    
                    <button 
                        onClick={onClose} 
                        disabled={isProcessing}
                        className="absolute top-6 right-6 p-2 text-white/30 hover:text-white hover:bg-white/10 rounded-full transition-colors z-20 disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>

                    {/* LEFT COLUMN: The Pitch */}
                    <div className="flex-1 p-10 md:p-12 border-b md:border-b-0 md:border-r border-white/5 relative overflow-hidden flex flex-col justify-center">
                        <div className="absolute -bottom-20 -left-20 text-[#D4AF37] opacity-[0.03] pointer-events-none rotate-12">
                            <Compass size={400} strokeWidth={0.5} />
                        </div>
                        
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[9px] uppercase tracking-[0.4em] text-[#D4AF37] font-black mb-6 shadow-[0_0_20px_rgba(212,175,55,0.15)]">
                                <Sparkles size={12} /> The Pro Tier
                            </div>
                            <h2 className="text-4xl md:text-5xl font-serif font-light text-white tracking-tight leading-tight mb-6">
                                Unlock Unlimited <span className="italic text-[#D4AF37]">Access.</span>
                            </h2>
                            <p className="text-white/50 text-sm leading-relaxed tracking-wide font-light mb-10">
                                Stop paying connection fees on every project. Upgrade to the Pro Tier and initiate unlimited escrow contracts directly with top-tier designers.
                            </p>
                            
                            <div className="space-y-4">
                                {[
                                    "0% Platform Booking Fees",
                                    "Unlimited Escrow Contracts",
                                    "Priority Network Synchronization",
                                    "Exclusive Access to Diamond Tier Visionaries"
                                ].map((feature, i) => (
                                    <div key={i} className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-white/80">
                                        <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                                            <CheckCircle2 size={12} className="text-[#D4AF37]" />
                                        </div>
                                        {feature}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: The Pricing Logic */}
                    <div className="flex-1 p-10 md:p-12 bg-[#111] flex flex-col justify-center relative">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-6 text-center">Select Billing Cycle</h3>
                        
                        {/* Billing Toggles */}
                        <div className="bg-[#030303] p-1.5 rounded-2xl border border-white/5 flex gap-1 mb-10 shadow-inner relative">
                            {['monthly', 'quarterly', 'yearly'].map((cycle) => (
                                <button
                                    key={cycle}
                                    onClick={() => setSelectedBilling(cycle)}
                                    disabled={isProcessing}
                                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 relative disabled:opacity-50 ${
                                        selectedBilling === cycle 
                                        ? 'bg-[#0a0a0a] text-white shadow-[0_5px_15px_rgba(0,0,0,0.5)] border border-white/10' 
                                        : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                                    }`}
                                >
                                    {cycle}
                                    {plans[cycle].savings && (
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-black text-[8px] px-2 py-0.5 rounded-full whitespace-nowrap shadow-[0_0_10px_rgba(212,175,55,0.4)]">
                                            {plans[cycle].savings}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Price Display */}
                        <div className="text-center mb-8 h-24 flex flex-col justify-center">
                            <div className="flex justify-center gap-2 items-end">
                                <span className="text-2xl text-white/40 font-serif pb-2">$</span>
                                <span className="text-7xl font-serif tracking-tighter text-white drop-shadow-xl">{currentPlan.price}</span>
                                <span className="text-xs text-white/40 uppercase tracking-widest font-bold pb-3">/{currentPlan.interval}</span>
                            </div>
                            {currentPlan.total && (
                                <p className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-widest mt-2">
                                    Billed ${currentPlan.total} every {selectedBilling === 'quarterly' ? '3 months' : '12 months'}
                                </p>
                            )}
                        </div>

                        {/* Error Handling UI */}
                        {error && (
                            <div className="mb-4 text-[10px] uppercase tracking-widest text-rose-400 font-bold bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-center flex items-center justify-center gap-2">
                                <AlertCircle size={14} /> {error}
                            </div>
                        )}

                        <button 
                            onClick={handleSubscribe} 
                            disabled={isProcessing}
                            className="w-full py-5 bg-[#D4AF37] hover:bg-white text-black font-black uppercase tracking-[0.2em] text-[11px] rounded-xl flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_0_30px_rgba(212,175,55,0.2)] disabled:bg-[#111] disabled:text-white/30 disabled:border border-white/5 disabled:shadow-none"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="animate-spin" size={16} /> Connecting to Gateway...
                                </>
                            ) : (
                                <>
                                    <Shield size={16} /> Upgrade to Pro
                                </>
                            )}
                        </button>
                        
                        <p className="text-center text-[9px] text-white/30 uppercase tracking-widest font-bold mt-6">
                            Secure SSL Encryption. Cancel Anytime.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}