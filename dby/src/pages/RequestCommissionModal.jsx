import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import API from '../../api/axios';

// Initialize Stripe globally using your publishable key
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_your_key_here');

const CheckoutForm = ({ designerId, designId, onClose, onBookingSuccess }) => {
    const stripe = useStripe();
    const elements = useElements();

    const [briefText, setBriefText] = useState('');
    const [agreedPrice, setAgreedPrice] = useState('');
    const [deadline, setDeadline] = useState('');
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentStep, setPaymentStep] = useState('details'); // 'details' | 'payment'
    const [clientSecret, setClientSecret] = useState('');
    const [createdBookingId, setCreatedBookingId] = useState('');
    const [error, setError] = useState('');

    // Step A: Submit custom text specifications to obtain Stripe Client Secret token
    const handleInitializeIntent = async (e) => {
        e.preventDefault();
        setIsProcessing(true);
        setError('');

        try {
            const { data } = await API.post('/commissions/request', {
                designer_id: designerId,
                design_id: designId || null,
                brief_text: briefText,
                agreed_price: parseFloat(agreedPrice),
                deadline: deadline || null
            });

            // Extract tracking references returned from creatorbookingscontroller
            setClientSecret(data.clientSecret);
            setCreatedBookingId(data.booking.id);
            setPaymentStep('payment'); // Advance view layer to card details
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to initialize structural parameters.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Step B: Submit card payment to Stripe & confirm validation logs via backend ledger
    const handleAuthorizePayment = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setIsProcessing(true);
        setError('');

        try {
            // Confirm transaction balance directly with Stripe's authorization network
            const payload = await stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: elements.getElement(CardElement),
                }
            });

            if (payload.error) {
                setError(`Payment Authorization Denied: ${payload.error.message}`);
                setIsProcessing(false);
                return;
            }

            // Step C: Inform backend controller that transaction cleared successfully
            await API.post('/commissions/verify-escrow', {
                paymentIntentId: payload.paymentIntent.id,
                bookingId: createdBookingId
            });

            if (onBookingSuccess) onBookingSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || 'Fatal error confirming internal security vault sync.');
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-4">
            {error && (
                <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-medium">
                    {error}
                </div>
            )}

            {paymentStep === 'details' ? (
                <form onSubmit={handleInitializeIntent} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Project Specifications & Brief</label>
                        <textarea
                            required
                            value={briefText}
                            onChange={(e) => setBriefText(e.target.value)}
                            placeholder="Detail aspect ratios, color systems, and structural guidelines..."
                            className="w-full text-sm border border-gray-200 rounded-xl p-3 h-24 focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contract Price ($ USD)</label>
                            <input
                                type="number"
                                required
                                min="1"
                                value={agreedPrice}
                                onChange={(e) => setAgreedPrice(e.target.value)}
                                placeholder="0.00"
                                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Target Deadline</label>
                            <input
                                type="date"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-50">
                        <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-bold rounded-xl cursor-pointer">
                            Cancel
                        </button>
                        <button type="submit" disabled={isProcessing} className="px-5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer">
                            {isProcessing ? 'Deploying Entry...' : 'Proceed to Funding'}
                        </button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleAuthorizePayment} className="space-y-4">
                    <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/60 text-[11px] text-indigo-800">
                        <strong>Escrow Initialization Target:</strong> Secured allocation of <strong>${parseFloat(agreedPrice).toFixed(2)}</strong>. Funds are locked into our clearing system and will not go to the designer until you approve their completed delivery.
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Credit or Debit Card</label>
                        <div className="border border-gray-200 rounded-xl p-3.5 bg-white shadow-2xs">
                            <CardElement 
                                options={{
                                    style: {
                                        base: { fontSize: '14px', color: '#1f2937', '::placeholder': { color: '#9ca3af' } }
                                    }
                                }} 
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-50">
                        <button type="button" onClick={() => setPaymentStep('details')} disabled={isProcessing} className="px-4 py-2 border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-bold rounded-xl cursor-pointer">
                            Back
                        </button>
                        <button type="submit" disabled={!stripe || isProcessing} className="px-5 py-2 bg-green-600 text-white hover:bg-green-700 text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 cursor-pointer">
                            {isProcessing ? 'Securing Vault Balance...' : `Authorize & Lock $${parseFloat(agreedPrice).toFixed(2)}`}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

// Root Parent Modal Element wrapping state trees within the critical Stripe Provider sandbox
const RequestCommissionModal = ({ isOpen, designerId, designId, designerName, onClose, onBookingSuccess }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 w-full max-w-md shadow-xl space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Contract Custom Assets</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Retaining professional placement with <span className="font-semibold text-gray-700">{designerName || "Verified Designer"}</span></p>
                </div>
                
                <Elements stripe={stripePromise}>
                    <CheckoutForm 
                        designerId={designerId} 
                        designId={designId} 
                        onClose={onClose} 
                        onBookingSuccess={onBookingSuccess} 
                    />
                </Elements>
            </div>
        </div>
    );
};

export default RequestCommissionModal;