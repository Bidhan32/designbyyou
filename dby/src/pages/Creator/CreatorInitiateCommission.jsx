import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, ArrowLeft, Send, Sparkles, AlertCircle, Shield } from 'lucide-react';
import API from '../../api/axios';
import { useToast } from '../../context/ToastContext';

const CreatorInitiateCommission = () => {
    const { designerId } = useParams(); 
    const navigate = useNavigate();
    const location = useLocation();
    const { showToast } = useToast();

    // Get package details if they clicked on a specific one from the portfolio
    const referenceDesign = location.state?.referenceDesign || null;

    const [designerProfile, setDesignerProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form fields
    const [briefText, setBriefText] = useState('');
    const [agreedPrice, setAgreedPrice] = useState(referenceDesign?.base_price || '');
    const [deadline, setDeadline] = useState('');

    useEffect(() => {
        const fetchDesignerDetails = async () => {
            try {
                const { data } = await API.get(`/all/designers/${designerId}`);
                setDesignerProfile(data.data);
            } catch (err) {
                console.error("Error loading designer details:", err);
                showToast("Could not load the designer profile.", "error");
                navigate(-1);
            } finally {
                setLoading(false);
            }
        };

        if (designerId) fetchDesignerDetails();
    }, [designerId, navigate, showToast]);

    const handleCreateCommissionOrder = async (e) => {
        e.preventDefault();
        
        if (!briefText.trim() || briefText.length < 20) {
            showToast("Please write a project brief with at least 20 characters.", "error");
            return;
        }

        if (Number(agreedPrice) <= 0) {
            showToast("Your budget offer must be higher than $0.00", "error");
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                designer_id: designerId,
                reference_design_id: referenceDesign?.id || null, 
                reference_design_title: referenceDesign?.title || 'Custom Studio Order',
                brief_text: briefText,
                agreed_price: parseFloat(agreedPrice),
                deadline: deadline || null
            };

            const { data } = await API.post('/creators/commissions/request', payload);

            if (data.status === 'success' || data.data) {
                showToast("Your design request has been sent to the designer!", "success");
                
                // SAFE ROUTING FIX: Check all possible backend response shapes using optional chaining.
                // If the backend doesn't send back an explicit ID, it safely drops back to the general bookings page.
                const bookingId = data?.data?.id || data?.data?.bookingId || data?.id;

                if (bookingId) {
                    navigate(`/creator/bookings/${bookingId}`);
                } else {
                    navigate('/creator/bookings');
                }
            }
        } catch (err) {
            console.error("Error creating order:", err);
            showToast(err.response?.data?.message || "Failed to send your design project request.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="h-[60vh] flex items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-16 animate-fade-in">
            
            <button 
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
            >
                <ArrowLeft size={14} /> Back to Studio Profile
            </button>

            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg uppercase shadow-xs">
                        {designerProfile?.studio_name?.substring(0, 2) || 'DS'}
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900">Hire {designerProfile?.studio_name || 'Designer'}</h1>
                        <p className="text-xs text-gray-400 mt-0.5">Start a secure, contract-backed custom design project.</p>
                    </div>
                </div>
                {referenceDesign && (
                    <div className="px-3 py-1.5 bg-gray-50 border border-gray-200/60 rounded-xl text-right shrink-0">
                        <span className="block text-[9px] uppercase tracking-wider font-bold text-gray-400">Selected Package</span>
                        <span className="text-xs font-bold text-gray-800 max-w-[200px] block truncate">{referenceDesign.title}</span>
                    </div>
                )}
            </div>

            <form onSubmit={handleCreateCommissionOrder} className="grid grid-cols-1 md:grid-cols-12 gap-8">
                
                <div className="md:col-span-8 space-y-6">
                    <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4 shadow-xs">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 border-b border-gray-50 pb-2">
                            <Sparkles size={16} className="text-indigo-600" />
                            Project Details & Requirements
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Project Brief</label>
                            <textarea 
                                value={briefText}
                                onChange={(e) => setBriefText(e.target.value)}
                                placeholder="Describe what you need. Mention sizes, required file types (.png, .psd, etc.), style style preferences, links to examples, or features you want included..."
                                rows={6}
                                className="w-full p-4 text-sm border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-300 resize-none leading-relaxed"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Target Completion Date (Optional)</label>
                            <input 
                                type="date"
                                value={deadline}
                                min={new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]} // Sets minimum to 2 days from today
                                onChange={(e) => setDeadline(e.target.value)}
                                className="w-full p-3 text-sm border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-gray-700 font-medium"
                            />
                        </div>
                    </div>
                </div>

                <div className="md:col-span-4 space-y-6">
                    <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-5 shadow-xs">
                        <div className="text-sm font-bold text-gray-900 border-b border-gray-50 pb-2">
                            Budget Offer
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Proposed Budget ($)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                                <input 
                                    type="number"
                                    value={agreedPrice}
                                    onChange={(e) => setAgreedPrice(e.target.value)}
                                    placeholder="0.00"
                                    min="1"
                                    step="0.01"
                                    className="w-full pl-8 pr-4 py-3 font-mono text-base font-bold text-gray-900 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                />
                            </div>
                            {referenceDesign?.base_price && (
                                <p className="text-[10px] text-gray-400 italic">
                                    The standard rate for this package is ${referenceDesign.base_price}.
                                </p>
                            )}
                        </div>

                        <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/60 flex gap-2">
                            <Shield size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                            <p className="text-[10px] leading-relaxed text-gray-500">
                                Submitting this form sends an official project request. Once accepted, your payment is held safely until the design is delivered.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {submitting ? (
                                <Loader2 className="animate-spin" size={14} />
                            ) : (
                                <>
                                    Send Design Request <Send size={12} />
                                </>
                            )}
                        </button>
                    </div>

                    <div className="p-4 bg-amber-50/40 border border-amber-100 rounded-2xl flex gap-3">
                        <AlertCircle size={16} className="text-amber-600 shrink-0" />
                        <p className="text-[10px] leading-relaxed text-amber-800 font-medium">
                            Designers can request adjustments or decline project briefs. You will not be charged until you review and officially confirm the order terms.
                        </p>
                    </div>
                </div>

            </form>
        </div>
    );
};

export default CreatorInitiateCommission;