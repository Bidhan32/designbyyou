import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2, Lock, ShieldCheck, X } from 'lucide-react';

// Initialize your publishable stripe token key
const stripePromise = loadStripe("your_stripe_publishable_key_here");

function CheckoutForm({ clientSecret, totalAmount, onSuccess, onClose }) {
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
        payment_method: {
          card: elements.getElement(CardElement),
        }
      });

      if (result.error) {
        setPaymentError(result.error.message);
        setProcessing(false);
      } else if (result.paymentIntent.status === 'succeeded') {
        onSuccess();
      }
    } catch (err) {
      setPaymentError("Infrastructure connection dropped during payment handshake.");
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleCardPaymentSubmit} className="space-y-5 p-2">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Card Payment Allocation</label>
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
          <CardElement options={{
            style: {
              base: {
                fontSize: '14px',
                color: '#1e293b',
                '::placeholder': { color: '#94a3b8' },
              },
            }
          }} />
        </div>
      </div>

      {paymentError && (
        <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-600 font-semibold rounded-xl flex gap-2">
          <span>⚠️</span> {paymentError}
        </div>
      )}

      <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl flex gap-2 text-[11px] font-semibold text-indigo-700">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Your transaction is guarded by bank-grade Stripe vault containment layers.</span>
      </div>

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition shadow-md flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Escrowing Fund Locks...
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" /> Authorize & Pay ${totalAmount}
          </>
        )}
      </button>
    </form>
  );
}

export default function CheckoutModal({ isOpen, clientSecret, totalAmount, onSuccess, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-indigo-600" /> Secure Gateway Checkout
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">
          <Elements stripe={stripePromise}>
            <CheckoutForm 
              clientSecret={clientSecret} 
              totalAmount={totalAmount} 
              onSuccess={onSuccess} 
              onClose={onClose} 
            />
          </Elements>
        </div>
      </div>
    </div>
  );
}