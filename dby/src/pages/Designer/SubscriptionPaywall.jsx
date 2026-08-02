import React, { useState } from 'react';
import { Crown, CheckCircle2, X, Loader2, Zap, AlertCircle } from 'lucide-react';
import API from '../../api/axios'; // Ensure this path points to your Axios setup

export default function SubscriptionPaywall({ isOpen, onClose }) {
    const [loadingPlan, setLoadingPlan] = useState(null);
    const [checkoutError, setCheckoutError] = useState(null);

    if (!isOpen) return null;

    // 🚨 IMPORTANT: Replace these IDs with your actual Stripe Price IDs
    const plans = [
        { 
            id: 'price_1MonthlyStripeIdHere', 
            name: 'Monthly', 
            price: 10, 
            interval: 'month', 
            desc: 'Perfect for occasional collaborations and single projects.' 
        },
        { 
            id: 'price_1BiannualStripeIdHere', 
            name: 'Biannual', 
            price: 27, 
            interval: '6 months', 
            desc: 'Our most popular tier. Save 55% over six months.', 
            highlight: true 
        },
        { 
            id: 'price_1YearlyStripeIdHere', 
            name: 'Yearly', 
            price: 100, 
            interval: 'year', 
            desc: 'For high-volume creative agencies and power users.' 
        }
    ];

    const handleSubscribe = async (priceId) => {
        setLoadingPlan(priceId);
        setCheckoutError(null);
        
        try {
            // Calls your Express server to generate a secure Stripe Session
            const { data } = await API.post('/subscriptions/create-checkout', { 
                priceId: priceId 
            });

            // Redirect the user to the Stripe-hosted checkout URL
            if (data.url) {
                window.location.href = data.url; 
            } else {
                throw new Error("Invalid session URL received from server.");
            }
        } catch (err) {
            console.error("Subscription Checkout Failed:", err);
            setCheckoutError(err.response?.data?.message || "Failed to connect to the secure payment gateway.");
            setLoadingPlan(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 md:px-8 animate-in fade-in duration-300 font-sans text-white">
            
            {/* Cinematic Blur Overlay */}
            <div 
                className="absolute inset-0 bg-[#050505]/80 backdrop-blur-xl transition-all" 
                onClick={onClose}
            ></div>
            
            {/* Modal Container */}
            <div className="relative w-full max-w-5xl bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-500">
                
                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    disabled={loadingPlan !== null}
                    className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors z-20 bg-black/50 p-2 rounded-full backdrop-blur-md disabled:opacity-50"
                >
                    <X size={20} />
                </button>

                {/* Header Section */}
                <div className="relative p-10 md:p-14 text-center border-b border-white/5 overflow-hidden">
                    <div className="absolute top-[-50%] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#D4AF37]/20 blur-[100px] pointer-events-none rounded-[100%]"></div>
                    
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D4AF37] to-amber-700 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(212,175,55,0.4)]">
                            <Crown size={32} className="text-black" />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-serif font-light text-white tracking-tighter mb-4 drop-shadow-lg">
                            Unlock <span className="italic text-[#D4AF37]">Unlimited</span> Bookings
                        </h2>
                        <p className="text-white/60 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                            Your free trial allocation has been utilized. Upgrade to an Atelier pass to secure unlimited Escrow contracts across the global network.
                        </p>
                    </div>
                </div>

                {/* Error Banner */}
                {checkoutError && (
                    <div className="bg-rose-500/10 border-b border-rose-500/20 px-8 py-3 flex items-center justify-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-widest">
                        <AlertCircle size={14} /> {checkoutError}
                    </div>
                )}

                {/* Pricing Grid */}
                <div className="p-8 md:p-12 bg-[#050505]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map((plan) => (
                            <div 
                                key={plan.id} 
                                className={`relative p-8 rounded-2xl flex flex-col transition-all duration-300 ${
                                    plan.highlight 
                                        ? 'bg-[#111] border border-[#D4AF37]/50 shadow-[0_0_30px_rgba(212,175,55,0.1)] scale-100 md:scale-105 z-10' 
                                        : 'bg-white/5 border border-white/5 hover:border-white/20 hover:bg-white/10'
                                }`}
                            >
                                {plan.highlight && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-black px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-lg">
                                        Most Popular
                                    </div>
                                )}
                                
                                <h3 className="text-white text-xl font-serif mb-2">{plan.name}</h3>
                                <p className="text-white/40 text-xs mb-6 h-8 leading-relaxed">{plan.desc}</p>
                                
                                <div className="flex items-end gap-1 mb-8">
                                    <span className="text-4xl font-light text-white tracking-tight">${plan.price}</span>
                                    <span className="text-white/40 text-sm mb-1 font-mono uppercase tracking-widest text-[9px]">/ {plan.interval}</span>
                                </div>

                                <ul className="space-y-4 mb-8 flex-1">
                                    <li className="flex items-start gap-3 text-xs text-white/70">
                                        <CheckCircle2 size={16} className="text-[#D4AF37] shrink-0" />
                                        Unlimited P2P Bookings
                                    </li>
                                    <li className="flex items-start gap-3 text-xs text-white/70">
                                        <CheckCircle2 size={16} className="text-[#D4AF37] shrink-0" />
                                        Zero Escrow Creation Fees
                                    </li>
                                    <li className="flex items-start gap-3 text-xs text-white/70">
                                        <CheckCircle2 size={16} className="text-[#D4AF37] shrink-0" />
                                        Priority Network Support
                                    </li>
                                </ul>

                                <button 
                                    onClick={() => handleSubscribe(plan.id)}
                                    disabled={loadingPlan !== null}
                                    className={`w-full py-4 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                                        plan.highlight
                                            ? 'bg-[#D4AF37] text-black hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] disabled:bg-[#D4AF37]/50 disabled:hover:bg-[#D4AF37]/50'
                                            : 'bg-white/10 text-white hover:bg-white hover:text-black border border-white/10 hover:border-white disabled:bg-white/5 disabled:text-white/30'
                                    }`}
                                >
                                    {loadingPlan === plan.id ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <><Zap size={14} /> Choose {plan.name}</>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}