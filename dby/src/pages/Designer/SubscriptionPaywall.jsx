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
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 md:px-8 animate-in fade-in duration-300 font-sans text-ink">
            
            {/* Cinematic Blur Overlay */}
            <div 
                className="absolute inset-0 bg-subtle transition-all"
                onClick={onClose}
            ></div>
            
            {/* Modal Container */}
            <div className="relative w-full max-w-5xl bg-surface border border-line rounded-md overflow-hidden animate-in zoom-in-95 duration-500">
                
                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    disabled={loadingPlan !== null}
                    className="absolute top-6 right-6 text-muted hover:text-ink transition-colors z-20 bg-black/50 p-2 rounded-md disabled:opacity-50"
                >
                    <X size={20} />
                </button>

                {/* Header Section */}
                <div className="relative p-4 text-center border-b border-line overflow-hidden">

                    
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-6">
                            <Crown size={32} className="text-ink" />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-serif font-light text-ink tracking-tighter mb-4">
                            Unlock <span className="italic text-action">Unlimited</span> Bookings
                        </h2>
                        <p className="text-muted text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                            Your free trial has ended. Choose a subscription to continue booking.
                        </p>
                    </div>
                </div>

                {/* Error Banner */}
                {checkoutError && (
                    <div className="bg-subtle border-b border-line px-8 py-3 flex items-center justify-center gap-2 text-action text-xs font-bold uppercase tracking-widest">
                        <AlertCircle size={14} /> {checkoutError}
                    </div>
                )}

                {/* Pricing Grid */}
                <div className="p-4 bg-canvas">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map((plan) => (
                            <div 
                                key={plan.id} 
                                className={`relative p-4 rounded-md flex flex-col transition-all duration-300 ${
                                    plan.highlight 
                                        ? 'bg-surface border border-line scale-100 md:scale-105 z-10'
                                        : 'bg-subtle border border-line hover:border-line hover:bg-subtle'
                                }`}
                            >
                                {plan.highlight && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-action text-on-action px-4 py-1 rounded-md text-[11px] font-semibold uppercase tracking-normal">
                                        Most Popular
                                    </div>
                                )}
                                
                                <h3 className="text-ink text-xl font-serif mb-2">{plan.name}</h3>
                                <p className="text-muted text-xs mb-6 h-8 leading-relaxed">{plan.desc}</p>
                                
                                <div className="flex items-end gap-1 mb-8">
                                    <span className="text-4xl font-light text-ink tracking-tight">${plan.price}</span>
                                    <span className="text-muted text-sm mb-1 font-mono uppercase tracking-widest text-[11px]">/ {plan.interval}</span>
                                </div>

                                <ul className="space-y-4 mb-8 flex-1">
                                    <li className="flex items-start gap-3 text-xs text-muted">
                                        <CheckCircle2 size={16} className="text-action shrink-0" />
                                        Unlimited P2P Bookings
                                    </li>
                                    <li className="flex items-start gap-3 text-xs text-muted">
                                        <CheckCircle2 size={16} className="text-action shrink-0" />
                                        Zero Escrow Creation Fees
                                    </li>
                                    <li className="flex items-start gap-3 text-xs text-muted">
                                        <CheckCircle2 size={16} className="text-action shrink-0" />
                                        Priority Network Support
                                    </li>
                                </ul>

                                <button 
                                    onClick={() => handleSubscribe(plan.id)}
                                    disabled={loadingPlan !== null}
                                    className={`w-full py-4 rounded-md text-[10px] font-bold uppercase tracking-normal transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                                        plan.highlight
                                            ? 'bg-action text-on-action hover:bg-surface disabled:bg-subtle disabled:hover:bg-action'
                                            : 'bg-subtle text-ink hover:bg-surface hover:text-ink border border-line hover:border-line disabled:bg-subtle disabled:text-muted'
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