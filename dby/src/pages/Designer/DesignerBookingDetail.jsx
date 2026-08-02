import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import API from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { 
    ChevronLeft, Lock, Unlock, Calendar, Coins, FileText, 
    CheckCircle2, Loader2, ShieldCheck, MessageSquare, 
    ArrowUpRight, Sparkles, Upload, PlayCircle, AlertCircle, XCircle, Compass
} from 'lucide-react';

const DesignerBookingDetail = () => {
    const { id: bookingId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();

    // Bulletproof ID Grabber
    const getUserId = () => {
        const directId = localStorage.getItem('userId');
        if (directId) return directId;
        const userObj = localStorage.getItem('user');
        if (userObj) {
            const parsed = JSON.parse(userObj);
            return parsed.id || parsed._id; 
        }
        return null;
    };
    
    const currentUserId = getUserId();

    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Action States
    const [fundingEscrow, setFundingEscrow] = useState(false);
    const [approvingAction, setApprovingAction] = useState(false);
    const [submittingAction, setSubmittingAction] = useState(false);
    
    // Provider Acceptance States
    const [isAccepting, setIsAccepting] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [providerHasAccepted, setProviderHasAccepted] = useState(false); 
    const [rejectionReason, setRejectionReason] = useState('');

    // Form States
    const [urlInput, setUrlInput] = useState('');
    const [messageInput, setMessageInput] = useState('');
    
    // Revision States
    const [isRequestingRevision, setIsRequestingRevision] = useState(false);
    const [revisionNotes, setRevisionNotes] = useState('');

    // Cancellation States
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancellationReason, setCancellationReason] = useState('');

    const fetchBookingDetails = async () => {
        setLoading(true);
        try {
            const { data } = await API.get(`/p2p-bookings/pipeline`);
            const targetBooking = (data.data || []).find(b => b.id === bookingId);
            if (!targetBooking) throw new Error("Contract not found.");
            
            if (targetBooking.status !== 'pending' && targetBooking.status !== 'cancelled') {
                setProviderHasAccepted(true);
            }
            
            setBooking(targetBooking); 
        } catch (err) {
            showToast(err.response?.data?.message || err.message, "error");
            navigate('/designer/bookings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (bookingId) fetchBookingDetails();
    }, [bookingId]);

    const formatDeadline = (dateString) => {
        if (!dateString) return 'TBD';
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); 
    };

    // --- CLIENT ACTIONS ---
    const handleFundEscrow = async () => {
        if (!booking || !booking.stripe_payment_intent_id) return;
        setFundingEscrow(true);
        try {
            const { data } = await API.post('/p2p-bookings/verify-escrow', { bookingId, paymentIntentId: booking.stripe_payment_intent_id });
            if (data.status === 'success') {
                showToast("Capital secured.", "success");
                await fetchBookingDetails(); 
            }
        } catch (err) { showToast(err.response?.data?.message || "Escrow fault.", "error"); } 
        finally { setFundingEscrow(false); }
    };

    const handleApproveAction = async (endpoint, successMsg) => {
        setApprovingAction(true);
        try {
            const { data } = await API.post(`/p2p-bookings/${bookingId}/${endpoint}`);
            if (data.status === 'success') {
                showToast(successMsg, "success");
                await fetchBookingDetails();
            }
        } catch (err) { showToast("Action failed.", "error"); } 
        finally { setApprovingAction(false); }
    };

    const handleRequestRevision = async (e) => {
        e.preventDefault();
        if (!revisionNotes.trim()) return showToast("Please provide revision feedback.", "error");
        
        setApprovingAction(true);
        const currentPhase = booking.status === 'review_prototype' ? 'prototype' : 'final';
        
        try {
            await API.post(`/p2p-bookings/${bookingId}/request-revision`, { notes: revisionNotes, currentPhase });
            showToast("Revision requested. Artist notified.", "success");
            setIsRequestingRevision(false);
            setRevisionNotes('');
            await fetchBookingDetails();
        } catch (err) { showToast("Failed to request revision.", "error"); } 
        finally { setApprovingAction(false); }
    };

    const handleCancelProject = async () => {
        if (!cancellationReason.trim()) return showToast("Please provide a reason for cancellation.", "error");
        setIsCancelling(true);
        try {
            await API.post(`/p2p-bookings/${bookingId}/cancel`, { reason: cancellationReason });
            showToast("Contract successfully cancelled. Refund initiated.", "success");
            await fetchBookingDetails(); 
        } catch (err) { 
            showToast(err.response?.data?.message || "Cancellation failed.", "error"); 
        } finally { 
            setIsCancelling(false); 
        }
    };

    // --- PROVIDER ACTIONS ---
    const handleAcceptProject = async () => {
        setIsAccepting(true);
        try {
            await API.post(`/p2p-bookings/${bookingId}/accept`);
            showToast("Project Accepted! Waiting for client to fund escrow.", "success");
            setProviderHasAccepted(true); 
            await fetchBookingDetails();
        } catch (err) { showToast("Failed to accept project.", "error"); }
        finally { setIsAccepting(false); }
    };

    const handleRejectProject = async () => {
        if (!rejectionReason.trim()) return showToast("Please provide a reason for declining.", "error");
        setIsRejecting(true);
        try {
            await API.post(`/p2p-bookings/${bookingId}/reject`, { reason: rejectionReason });
            showToast("Project Rejected.", "success");
            await fetchBookingDetails();
        } catch (err) { showToast("Failed to reject project.", "error"); }
        finally { setIsRejecting(false); }
    };

    const handleSubmitPhase = async (e, phase) => {
        e.preventDefault();
        if (!urlInput) return showToast("Please provide a valid link.", "error");
        setSubmittingAction(true);
        
        const endpoint = phase === 'prototype' ? 'submit-prototype' : 'submit-final';
        try {
            await API.post(`/p2p-bookings/${bookingId}/${endpoint}`, { file_url: urlInput, message: messageInput });
            showToast("Work submitted for review!", "success");
            setUrlInput(''); setMessageInput('');
            await fetchBookingDetails();
        } catch (err) { showToast("Failed to submit work.", "error"); } 
        finally { setSubmittingAction(false); }
    };

    if (loading) return (
        <div className="h-screen flex flex-col items-center justify-center space-y-6 bg-slate-50 dark:bg-[#030303] transition-colors duration-300">
            <div className="relative">
                <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                <Loader2 className="animate-spin text-slate-300 dark:text-white/20" size={40} />
            </div>
            <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.3em] animate-pulse">Decrypting Contract...</span>
        </div>
    );
    
    if (!booking) return null;

    const isClient = currentUserId === booking.creator_id;
    const isProvider = currentUserId === booking.designer_id;
    const isPastPrototype = ['final_production', 'review_final', 'completed', 'review'].includes(booking.status);
    const isReviewState = ['review_prototype', 'review_final', 'review'].includes(booking.status);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#030303] text-slate-900 dark:text-white selection:bg-[#D4AF37] selection:text-black font-sans relative overflow-x-hidden pb-32 animate-fade-in transition-colors duration-300">
            
            {/* AMBIENT GLOW */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[10%] right-[10%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 dark:bg-[#D4AF37]/5 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '8s' }}></div>
            </div>

            {/* HEADER AREA */}
            <div className="bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 sticky top-0 z-40 px-6 py-6 shadow-sm dark:shadow-2xl transition-colors duration-300">
                <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <Link to="/designer/bookings" className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white transition-colors group w-fit">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-slate-200 dark:group-hover:bg-white/10 transition-colors border border-slate-200 dark:border-white/5">
                            <ChevronLeft size={14} />
                        </div>
                        Back to Pipeline
                    </Link>
                    <div className="flex items-center gap-4 flex-wrap">
                        <span className="font-mono text-[10px] text-slate-500 dark:text-white/40 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/5 shadow-inner transition-colors duration-300">
                            Ref: {String(booking.id).substring(0, 8)}
                        </span>
                        <span className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-sm dark:shadow-lg transition-colors duration-300 ${
                            booking.status === 'cancelled' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 dark:shadow-[0_0_15px_rgba(244,63,94,0.15)]' :
                            booking.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 dark:shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 
                            isReviewState ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30 dark:shadow-[0_0_15px_rgba(99,102,241,0.15)]' :
                            booking.escrow_locked ? 'bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 text-[#b59220] dark:text-[#D4AF37] border-[#D4AF37]/30 dark:shadow-[0_0_15px_rgba(212,175,55,0.15)]' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 dark:shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                        }`}>
                            {booking.status === 'cancelled' ? 'Cancelled' : booking.status === 'completed' ? 'Fulfilled' : isReviewState ? 'Action Required' : booking.escrow_locked ? 'In Production' : providerHasAccepted ? 'Awaiting Funding' : 'Awaiting Artist Acceptance'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="max-w-[1400px] mx-auto px-6 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10">
                
                {/* LEFT COLUMN: MAIN CONTENT */}
                <div className="lg:col-span-7 space-y-8">
                    
                    {/* CANCELLATION BANNER */}
                    {booking.status === 'cancelled' && (
                        <div className="p-8 bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 rounded-3xl space-y-3 shadow-md dark:shadow-2xl backdrop-blur-xl transition-colors duration-300">
                            <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-3 uppercase tracking-widest transition-colors">
                                <AlertCircle size={18} /> Contract Cancelled / Rejected
                            </h3>
                            <p className="text-xs text-rose-500 dark:text-rose-400/70 leading-relaxed font-light tracking-wide pl-8 border-l border-rose-200 dark:border-rose-500/20 ml-2.5 transition-colors">
                                Reason: {booking.cancellation_reason || "No reason provided."}
                            </p>
                        </div>
                    )}

                    {/* CLIENT REVIEW BANNER WITH REVISION OPTION */}
                    {isClient && isReviewState && (
                        <section className="bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 rounded-3xl p-8 md:p-10 space-y-8 shadow-sm dark:shadow-[0_20px_50px_rgba(99,102,241,0.05)] backdrop-blur-xl transition-colors duration-300">
                            <div className="flex items-center gap-5 border-b border-indigo-200 dark:border-indigo-500/10 pb-6 transition-colors">
                                <div className="p-4 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl border border-indigo-300 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-sm dark:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-colors">
                                    <Sparkles size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-serif text-slate-900 dark:text-white tracking-wide transition-colors">Review {booking.status === 'review_prototype' ? 'Prototype' : 'Final Deliverables'}</h2>
                                    <p className="text-[10px] text-slate-500 dark:text-white/50 tracking-[0.2em] mt-2 uppercase font-bold transition-colors">The hired artist has submitted work for your approval.</p>
                                </div>
                            </div>
                            
                            <div className="p-6 bg-white dark:bg-[#030303] rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-inner space-y-5 transition-colors duration-300">
                                <a href={booking.status === 'review_prototype' ? booking.prototype_file_url : booking.delivery_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors">
                                    <FileText size={16} /> Open Delivered Assets <ArrowUpRight size={14} />
                                </a>
                                {(booking.prototype_message || booking.delivery_message) && (
                                    <p className="text-xs text-slate-600 dark:text-white/60 italic bg-slate-50 dark:bg-white/5 p-5 rounded-xl border border-slate-200 dark:border-white/5 font-light leading-relaxed transition-colors">
                                        "{booking.status === 'review_prototype' ? booking.prototype_message : booking.delivery_message}"
                                    </p>
                                )}
                            </div>

                            {/* REVISION FORM TOGGLE */}
                            {isRequestingRevision ? (
                                <form onSubmit={handleRequestRevision} className="space-y-5 p-6 bg-white dark:bg-[#030303] rounded-2xl border border-rose-200 dark:border-rose-500/30 shadow-sm dark:shadow-inner transition-colors duration-300">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-rose-500 dark:text-rose-400 flex items-center gap-2 transition-colors"><AlertCircle size={14}/> What needs to be changed?</p>
                                    <textarea value={revisionNotes} onChange={(e) => setRevisionNotes(e.target.value)} required rows={4} placeholder="List out your requested tweaks clearly..." className="w-full bg-slate-50 dark:bg-[#111] border border-slate-300 dark:border-white/10 rounded-xl px-5 py-4 text-xs text-slate-900 dark:text-white focus:border-rose-400 dark:focus:border-rose-500/50 outline-none resize-none transition-colors shadow-sm dark:shadow-inner" />
                                    <div className="flex gap-4">
                                        <button type="button" onClick={() => setIsRequestingRevision(false)} className="flex-1 py-4 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all border border-slate-200 dark:border-white/10">Cancel</button>
                                        <button type="submit" disabled={approvingAction} className="flex-1 py-4 bg-rose-50 dark:bg-rose-600/20 hover:bg-rose-100 dark:hover:bg-rose-600/40 border border-rose-200 dark:border-rose-500/50 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl flex justify-center transition-all shadow-sm dark:shadow-[0_0_15px_rgba(244,63,94,0.15)]">
                                            {approvingAction ? <Loader2 className="animate-spin" size={14} /> : "Submit Revision"}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="grid grid-cols-2 gap-5 pt-2">
                                    <button onClick={() => setIsRequestingRevision(true)} className="w-full py-5 bg-white dark:bg-[#030303] border border-slate-200 dark:border-white/10 hover:border-rose-300 dark:hover:border-rose-500/40 text-slate-600 dark:text-white/60 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-slate-50 dark:hover:bg-transparent font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all shadow-sm dark:shadow-inner">
                                        Request Changes
                                    </button>
                                    <button 
                                        onClick={() => handleApproveAction(booking.status === 'review_prototype' ? 'approve-prototype' : 'release', "Work Approved!")} 
                                        disabled={approvingAction} 
                                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all flex items-center justify-center gap-2 shadow-md dark:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                                    >
                                        {approvingAction ? <Loader2 className="animate-spin" size={14} /> : booking.status === 'review_prototype' ? "Approve Prototype" : "Approve & Release Funds"}
                                    </button>
                                </div>
                            )}
                        </section>
                    )}

                    {/* PROJECT PARAMETERS */}
                    <section className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-3xl p-8 md:p-10 shadow-lg dark:shadow-2xl relative overflow-hidden transition-colors duration-300">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 blur-[50px] rounded-full pointer-events-none"></div>
                        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-white/5 pb-6 mb-6 relative z-10 transition-colors">
                            <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 transition-colors"><FileText size={20} className="text-[#D4AF37]" /></div>
                            <h2 className="text-2xl font-serif text-slate-900 dark:text-white tracking-wide transition-colors">Project Brief</h2>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-white/60 leading-loose font-light tracking-wide bg-slate-50 dark:bg-[#111] p-6 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-inner relative z-10 whitespace-pre-wrap transition-colors duration-300">
                            "{booking.brief_text}"
                        </p>
                    </section>

                    {/* 3-PHASE TIMELINE */}
                    <section className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-3xl p-8 md:p-10 shadow-lg dark:shadow-2xl relative overflow-hidden transition-colors duration-300">
                        <div className="flex items-center justify-between mb-10 relative z-10">
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-white/40 transition-colors">Production Timeline</h2>
                            <span className="text-[9px] font-mono font-bold text-[#D4AF37] uppercase tracking-widest bg-[#D4AF37]/10 px-4 py-1.5 rounded-full border border-[#D4AF37]/20 shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.1)]">Active Sync: LIVE</span>
                        </div>
                        
                        <div className="space-y-12 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-white/10 z-10 transition-colors">
                            
                            <div className="relative pl-14">
                                <div className={`absolute left-0 top-0 h-10 w-10 rounded-full border-2 flex items-center justify-center bg-white dark:bg-[#0a0a0a] z-10 transition-colors ${booking.escrow_locked ? 'border-[#D4AF37] shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'border-slate-200 dark:border-white/10'}`}>
                                    {booking.escrow_locked ? <CheckCircle2 size={16} className="text-[#D4AF37]"/> : <div className="h-2 w-2 bg-slate-300 dark:bg-white/20 rounded-full" />}
                                </div>
                                <h4 className={`text-xs font-bold uppercase tracking-[0.2em] pt-2.5 transition-colors ${booking.escrow_locked ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/30'}`}>Phase 1: Escrow Secured</h4>
                            </div>

                            <div className="relative pl-14">
                                <div className={`absolute left-0 top-0 h-10 w-10 rounded-full border-2 flex items-center justify-center bg-white dark:bg-[#0a0a0a] z-10 transition-colors ${isPastPrototype ? 'border-[#D4AF37] shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'border-slate-200 dark:border-white/10'}`}>
                                    {isPastPrototype ? <CheckCircle2 size={16} className="text-[#D4AF37]"/> : <div className="h-2 w-2 bg-slate-300 dark:bg-white/20 rounded-full" />}
                                </div>
                                <h4 className={`text-xs font-bold uppercase tracking-[0.2em] pt-2.5 transition-colors ${isPastPrototype ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/30'}`}>Phase 2: Prototype Approved</h4>
                            </div>

                            <div className="relative pl-14">
                                <div className={`absolute left-0 top-0 h-10 w-10 rounded-full border-2 flex items-center justify-center bg-white dark:bg-[#0a0a0a] z-10 transition-colors ${booking.status === 'completed' ? 'border-[#D4AF37] shadow-sm dark:shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'border-slate-200 dark:border-white/10'}`}>
                                    {booking.status === 'completed' ? <CheckCircle2 size={16} className="text-[#D4AF37]"/> : <div className="h-2 w-2 bg-slate-300 dark:bg-white/20 rounded-full" />}
                                </div>
                                <h4 className={`text-xs font-bold uppercase tracking-[0.2em] pt-2.5 transition-colors ${booking.status === 'completed' ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/30'}`}>Phase 3: Final Delivery</h4>
                            </div>

                        </div>
                    </section>
                </div>

                {/* RIGHT COLUMN: ACTION PANEL */}
                <div className="lg:col-span-5 space-y-8">
                    <div className="bg-white dark:bg-[#111] rounded-3xl p-8 md:p-10 text-slate-900 dark:text-white space-y-8 shadow-xl dark:shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-slate-200 dark:border-[#D4AF37]/20 relative overflow-hidden sticky top-32 transition-colors duration-300">
                        
                        <div className="absolute top-[-20%] right-[-10%] opacity-[0.03] text-[#D4AF37] pointer-events-none rotate-12">
                            <Compass size={300} strokeWidth={0.5} />
                        </div>
                        
                        <div className="space-y-5 relative z-10 border-b border-slate-200 dark:border-white/5 pb-8 transition-colors">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-[#D4AF37]">Escrow Ledger</p>
                                {booking.escrow_locked ? (
                                    <span className="flex items-center gap-1.5 text-[9px] text-[#D4AF37] font-bold uppercase tracking-[0.2em] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-3 py-1.5 rounded-full shadow-[0_0_10px_rgba(212,175,55,0.1)]">
                                        <Lock size={12}/> Secured
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-[9px] text-amber-500 dark:text-amber-400 font-bold uppercase tracking-[0.2em] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-1.5 rounded-full">
                                        <Unlock size={12}/> Unfunded
                                    </span>
                                )}
                            </div>
                            <h3 className="text-6xl font-serif tracking-tighter text-slate-900 dark:text-white drop-shadow-sm dark:drop-shadow-xl transition-colors">
                                ${Number(booking.agreed_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h3>
                            
                            <div className="pt-2 flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest transition-colors">
                                <Calendar size={12} className="text-[#D4AF37]" />
                                Deadline: <span className="text-slate-900 dark:text-white">{formatDeadline(booking.deadline)}</span>
                            </div>
                        </div>

                        {/* PROVIDER VIEW - ACCEPT OR REJECT GATE */}
                        {isProvider && booking.status === 'pending' && !providerHasAccepted && (
                            <div className="relative z-10 space-y-5">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-[9px] uppercase tracking-[0.2em] text-[#D4AF37] transition-colors">
                                    <Sparkles size={10} /> Incoming Request
                                </div>
                                
                                <textarea 
                                    placeholder="If declining, provide a brief reason..." 
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-white/10 rounded-xl p-4 text-xs text-slate-900 dark:text-white outline-none resize-none focus:border-[#D4AF37] dark:focus:border-[#D4AF37]/50 transition-colors shadow-sm dark:shadow-inner"
                                    rows={2}
                                />

                                <div className="flex gap-4 pt-2">
                                    <button onClick={handleRejectProject} disabled={isRejecting || isAccepting} className="flex-1 py-4 bg-slate-50 dark:bg-[#030303] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-500 dark:text-white/50 hover:text-rose-600 dark:hover:text-rose-400 font-bold uppercase tracking-[0.2em] text-[9px] rounded-xl transition-all border border-slate-200 dark:border-white/10 hover:border-rose-300 dark:hover:border-rose-500/30 flex justify-center items-center gap-2 shadow-sm dark:shadow-inner">
                                        {isRejecting ? <Loader2 className="animate-spin" size={14} /> : <><XCircle size={14}/> Decline</>}
                                    </button>
                                    <button onClick={handleAcceptProject} disabled={isRejecting || isAccepting} className="flex-[1.5] py-4 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black font-bold uppercase tracking-[0.2em] text-[9px] rounded-xl transition-all flex justify-center items-center gap-2 shadow-md dark:shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                                        {isAccepting ? <Loader2 className="animate-spin" size={14} /> : <><CheckCircle2 size={14}/> Accept Project</>}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* CLIENT VIEW: Funding */}
                        {isClient && providerHasAccepted && !booking.escrow_locked && !['completed', 'cancelled'].includes(booking.status) && (
                            <div className="relative z-10 space-y-6">
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-[0.2em] flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-500/20 w-fit transition-colors">
                                    <CheckCircle2 size={12}/> Artist Accepted
                                </p>
                                <button onClick={handleFundEscrow} disabled={fundingEscrow} className="w-full py-5 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-xl flex items-center justify-center gap-2 shadow-md dark:shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all duration-300">
                                    {fundingEscrow ? <Loader2 className="animate-spin" size={14} /> : "Authorize & Fund Escrow"}
                                </button>
                            </div>
                        )}

                        {/* CLIENT VIEW: Waiting for Acceptance */}
                        {isClient && booking.status === 'pending' && !providerHasAccepted && (
                            <div className="relative z-10">
                                <div className="p-5 bg-slate-50 dark:bg-[#030303] border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-inner rounded-xl transition-colors duration-300">
                                    <p className="text-xs font-light tracking-wide text-slate-500 dark:text-white/50 leading-relaxed text-center transition-colors">Contract sent. Waiting for the artist to accept the terms before you fund escrow.</p>
                                </div>
                            </div>
                        )}

                        {/* PROVIDER VIEW: Forms */}
                        {isProvider && providerHasAccepted && booking.escrow_locked && !['completed', 'cancelled'].includes(booking.status) && (
                            <div className="relative z-10 space-y-8">
                                
                                {['accepted', 'progress'].includes(booking.status) && (
                                    <form onSubmit={(e) => handleSubmitPhase(e, 'prototype')} className="space-y-5 bg-slate-50 dark:bg-[#030303] p-6 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-inner transition-colors duration-300">
                                        <p className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.2em] flex items-center gap-2"><PlayCircle size={14}/> Submit Prototype</p>
                                        <input type="url" placeholder="Paste Prototype Link..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} required className="w-full bg-white dark:bg-[#111] border border-slate-300 dark:border-white/10 rounded-xl px-5 py-4 text-xs text-slate-900 dark:text-white outline-none focus:border-[#D4AF37] dark:focus:border-[#D4AF37]/50 transition-colors shadow-sm dark:shadow-inner" />
                                        <button type="submit" disabled={submittingAction} className="w-full py-4 bg-slate-200 dark:bg-white/10 hover:bg-[#D4AF37] dark:hover:bg-[#D4AF37] hover:text-white dark:hover:text-black border border-slate-300 dark:border-white/10 hover:border-[#D4AF37] dark:hover:border-[#D4AF37] text-slate-800 dark:text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl flex justify-center items-center gap-2 transition-all">
                                            {submittingAction ? <Loader2 className="animate-spin" size={14} /> : <><Upload size={14}/> Send Prototype</>}
                                        </button>
                                    </form>
                                )}

                                {booking.status === 'final_production' && (
                                    <form onSubmit={(e) => handleSubmitPhase(e, 'final')} className="space-y-5 bg-slate-50 dark:bg-[#030303] p-6 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-inner transition-colors duration-300">
                                        <p className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.2em] flex items-center gap-2"><CheckCircle2 size={14}/> Submit Final Files</p>
                                        <input type="url" placeholder="Paste Final Deliverables Link..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} required className="w-full bg-white dark:bg-[#111] border border-slate-300 dark:border-white/10 rounded-xl px-5 py-4 text-xs text-slate-900 dark:text-white outline-none focus:border-[#D4AF37] dark:focus:border-[#D4AF37]/50 transition-colors shadow-sm dark:shadow-inner" />
                                        <button type="submit" disabled={submittingAction} className="w-full py-4 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl flex justify-center items-center gap-2 transition-all shadow-md dark:shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                                            {submittingAction ? <Loader2 className="animate-spin" size={14} /> : <><Upload size={14}/> Send Final Assets</>}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}

                        {/* DANGER ZONE - CANCELLATION */}
                        {isClient && !['completed', 'cancelled'].includes(booking.status) && (
                            <div className="relative z-10 mt-12 pt-8 border-t border-slate-200 dark:border-white/5 space-y-5 transition-colors">
                                <p className="text-[10px] text-rose-600 dark:text-rose-500 font-bold uppercase tracking-[0.3em] flex items-center gap-2"><AlertCircle size={14}/> Danger Zone</p>
                                <textarea 
                                    placeholder="Reason for cancellation..." 
                                    value={cancellationReason}
                                    onChange={(e) => setCancellationReason(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-[#030303] border border-slate-300 dark:border-white/5 rounded-xl p-5 text-xs text-slate-900 dark:text-white outline-none resize-none focus:border-rose-400 dark:focus:border-rose-500/50 transition-colors shadow-sm dark:shadow-inner"
                                    rows={2}
                                />
                                <button 
                                    onClick={handleCancelProject} 
                                    disabled={isCancelling}
                                    className="w-full py-4 bg-slate-100 dark:bg-[#030303] hover:bg-rose-50 dark:hover:bg-rose-900/40 border border-slate-300 dark:border-white/5 hover:border-rose-300 dark:hover:border-rose-900/50 text-slate-500 dark:text-white/40 hover:text-rose-600 dark:hover:text-rose-400 font-bold uppercase tracking-[0.2em] text-[9px] rounded-xl transition-all flex justify-center gap-2 shadow-sm dark:shadow-inner"
                                >
                                    {isCancelling ? <Loader2 className="animate-spin" size={14} /> : "Cancel Project & Refund"}
                                </button>
                            </div>
                        )}

                        {booking.status === 'completed' && (
                            <div className="relative z-10 p-6 bg-slate-50 dark:bg-[#030303] border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-inner rounded-2xl text-center mt-8 transition-colors duration-300">
                                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-2 transition-colors">
                                    <ShieldCheck size={18}/> Contract Settled
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DesignerBookingDetail;