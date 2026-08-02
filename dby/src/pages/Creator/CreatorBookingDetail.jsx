import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import API from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { 
    ChevronLeft, Lock, Unlock, Calendar, Coins, FileText, 
    CheckCircle2, Loader2, ShieldCheck, MessageSquare, 
    ArrowUpRight, Sparkles, Upload, PlayCircle, AlertCircle, XCircle
} from 'lucide-react';

const CreatorBookingDetail = () => {
    const { id: bookingId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();

    // 🚀 FIX 1: Bulletproof ID Grabber to ensure roles always calculate correctly
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
            
            // 🚀 FIX 2: Prevent 'cancelled' from triggering a false acceptance state
            if (targetBooking.status !== 'pending' && targetBooking.status !== 'cancelled') {
                setProviderHasAccepted(true);
            }
            
            setBooking(targetBooking); 
        } catch (err) {
            showToast(err.response?.data?.message || err.message, "error");
            navigate('/creator/bookings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (bookingId) fetchBookingDetails();
    }, [bookingId]);

    // 🚀 NEW: UTC-Safe Deadline Formatter
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

    if (loading) return <div className="min-h-screen bg-[#030303] flex items-center justify-center"><Loader2 className="animate-spin text-[#D4AF37]" size={40} /></div>;
    if (!booking) return null;

    const isClient = currentUserId === booking.creator_id;
    const isProvider = currentUserId === booking.designer_id;
    const isPastPrototype = ['final_production', 'review_final', 'completed', 'review'].includes(booking.status);
    const isReviewState = ['review_prototype', 'review_final', 'review'].includes(booking.status);

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans relative overflow-x-hidden animate-fade-in">
            
            {/* AMBIENT GLOW */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div>
            </div>

            <div className="max-w-[1200px] mx-auto space-y-8 pb-32 pt-12 px-6 relative z-10">
                
                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-8 gap-6">
                    <div>
                        <Link to="/creator/bookings" className="flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] font-black text-white/40 hover:text-[#D4AF37] transition-colors w-fit mb-4">
                            <ChevronLeft size={14} /> Back to Pipeline
                        </Link>
                        <h1 className="text-3xl md:text-4xl font-serif tracking-wide text-white">
                            Contract <span className="italic text-[#D4AF37]">Workspace</span>
                        </h1>
                    </div>
                    
                    <div className="flex items-center gap-4 flex-wrap">
                        <span className="font-mono text-[10px] text-white/30 bg-[#111] px-4 py-2 rounded-lg border border-white/5 shadow-inner">
                            REF: {String(booking.id).substring(0, 8).toUpperCase()}
                        </span>
                        <span className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] border ${
                            booking.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]' :
                            booking.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 
                            isReviewState ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.15)]' :
                            booking.escrow_locked ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                            {booking.status === 'cancelled' ? 'Cancelled' : booking.status === 'completed' ? 'Fulfilled' : isReviewState ? 'Action Required' : booking.escrow_locked ? 'In Production' : providerHasAccepted ? 'Awaiting Funding' : 'Awaiting Artist Acceptance'}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    
                    {/* LEFT COLUMN: INTEL & REVIEWS */}
                    <div className="lg:col-span-7 space-y-8">
                        
                        {/* CANCELLATION BANNER */}
                        {booking.status === 'cancelled' && (
                            <div className="p-6 bg-rose-500/5 border border-rose-500/20 rounded-2xl space-y-3 shadow-inner">
                                <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2 uppercase tracking-widest">
                                    <AlertCircle size={18} /> Contract Cancelled / Rejected
                                </h3>
                                <p className="text-xs text-rose-300/70 leading-relaxed font-light">Reason: {booking.cancellation_reason || "No reason provided."}</p>
                            </div>
                        )}

                        {/* CLIENT REVIEW BANNER WITH REVISION OPTION */}
                        {isClient && isReviewState && (
                            <section className="bg-[#111] border border-[#D4AF37]/30 rounded-3xl p-8 space-y-8 shadow-[0_0_30px_rgba(212,175,55,0.05)] relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 blur-[40px] rounded-full pointer-events-none"></div>
                                
                                <div className="flex items-center gap-4 border-b border-white/5 pb-6 relative z-10">
                                    <div className="p-3 bg-[#D4AF37]/10 rounded-xl border border-[#D4AF37]/20 text-[#D4AF37]">
                                        <Sparkles size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-serif text-white tracking-wide">Review {booking.status === 'review_prototype' ? 'Prototype' : 'Final Deliverables'}</h2>
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-white/40 mt-1">The hired artist has submitted work for your approval.</p>
                                    </div>
                                </div>
                                
                                <div className="p-6 bg-[#030303] rounded-2xl border border-white/5 shadow-inner space-y-4 relative z-10">
                                    <a href={booking.status === 'review_prototype' ? booking.prototype_file_url : booking.delivery_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37] hover:text-white transition-colors">
                                        <FileText size={16} /> Open Delivered Assets <ArrowUpRight size={14} />
                                    </a>
                                    {(booking.prototype_message || booking.delivery_message) && (
                                        <p className="text-xs text-white/60 italic bg-[#111] p-4 rounded-xl border border-white/5 font-light leading-relaxed">
                                            "{booking.status === 'review_prototype' ? booking.prototype_message : booking.delivery_message}"
                                        </p>
                                    )}
                                </div>

                                {/* REVISION FORM TOGGLE */}
                                {isRequestingRevision ? (
                                    <form onSubmit={handleRequestRevision} className="space-y-4 p-6 bg-[#030303] rounded-2xl border border-rose-500/20 shadow-inner relative z-10">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">What needs to be changed?</p>
                                        <textarea value={revisionNotes} onChange={(e) => setRevisionNotes(e.target.value)} required rows={4} placeholder="List out your requested tweaks clearly..." className="w-full bg-[#111] border border-white/5 rounded-xl p-4 text-sm text-white focus:border-rose-500/50 outline-none resize-none font-light custom-scrollbar" />
                                        <div className="flex gap-3">
                                            <button type="button" onClick={() => setIsRequestingRevision(false)} className="flex-1 py-4 bg-[#111] hover:bg-white/5 border border-white/10 text-white/60 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all">Cancel</button>
                                            <button type="submit" disabled={approvingAction} className="flex-1 py-4 bg-rose-900/50 hover:bg-rose-900 border border-rose-500/30 text-rose-200 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl flex justify-center items-center gap-2 transition-all">
                                                {approvingAction ? <Loader2 className="animate-spin" size={14} /> : "Submit Revision"}
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4 relative z-10">
                                        <button onClick={() => setIsRequestingRevision(true)} className="w-full py-5 bg-[#030303] border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all shadow-inner">
                                            Request Changes
                                        </button>
                                        <button 
                                            onClick={() => handleApproveAction(booking.status === 'review_prototype' ? 'approve-prototype' : 'release', "Work Approved!")} 
                                            disabled={approvingAction} 
                                            className="w-full py-5 text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-white shadow-[0_0_20px_rgba(212,175,55,0.2)]"
                                        >
                                            {approvingAction ? <Loader2 className="animate-spin" size={14} /> : booking.status === 'review_prototype' ? "Approve Prototype" : "Approve & Release Funds"}
                                        </button>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* PROJECT PARAMETERS */}
                        <section className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 shadow-2xl space-y-6">
                            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                                <div className="p-3 bg-[#111] rounded-xl border border-white/10 shadow-inner"><FileText size={18} className="text-white/40" /></div>
                                <h2 className="text-xl font-serif text-white tracking-wide">Project Brief</h2>
                            </div>
                            <p className="text-sm text-white/60 leading-relaxed bg-[#111] p-6 rounded-2xl border border-white/5 shadow-inner font-light italic">
                                "{booking.brief_text}"
                            </p>
                        </section>

                        {/* 3-PHASE TIMELINE */}
                        <section className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 shadow-2xl space-y-8">
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6">
                                <h2 className="text-xl font-serif text-white tracking-wide">Production Timeline</h2>
                                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-[#D4AF37] bg-[#D4AF37]/10 px-3 py-1.5 rounded border border-[#D4AF37]/20 shadow-inner">
                                    Active Sync: LIVE
                                </span>
                            </div>
                            
                            <div className="space-y-10 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-white/10">
                                
                                {/* Phase 1 */}
                                <div className="relative pl-12">
                                    <div className={`absolute left-0 top-0 h-8 w-8 rounded-full border-2 flex items-center justify-center bg-[#0a0a0a] z-10 transition-colors ${booking.escrow_locked ? 'border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'border-white/10'}`}>
                                        {booking.escrow_locked ? <CheckCircle2 size={16} className="text-[#D4AF37]"/> : <div className="h-2 w-2 bg-white/20 rounded-full" />}
                                    </div>
                                    <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] ${booking.escrow_locked ? 'text-white' : 'text-white/40'}`}>Phase 1: Escrow Secured</h4>
                                </div>

                                {/* Phase 2 */}
                                <div className="relative pl-12">
                                    <div className={`absolute left-0 top-0 h-8 w-8 rounded-full border-2 flex items-center justify-center bg-[#0a0a0a] z-10 transition-colors ${isPastPrototype ? 'border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'border-white/10'}`}>
                                        {isPastPrototype ? <CheckCircle2 size={16} className="text-[#D4AF37]"/> : <div className="h-2 w-2 bg-white/20 rounded-full" />}
                                    </div>
                                    <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] ${isPastPrototype ? 'text-white' : 'text-white/40'}`}>Phase 2: Prototype Approved</h4>
                                </div>

                                {/* Phase 3 */}
                                <div className="relative pl-12">
                                    <div className={`absolute left-0 top-0 h-8 w-8 rounded-full border-2 flex items-center justify-center bg-[#0a0a0a] z-10 transition-colors ${booking.status === 'completed' ? 'border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'border-white/10'}`}>
                                        {booking.status === 'completed' ? <CheckCircle2 size={16} className="text-[#D4AF37]"/> : <div className="h-2 w-2 bg-white/20 rounded-full" />}
                                    </div>
                                    <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] ${booking.status === 'completed' ? 'text-white' : 'text-white/40'}`}>Phase 3: Final Delivery</h4>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* RIGHT COLUMN: ACTION PANEL */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="bg-[#111] border border-white/5 rounded-3xl p-8 text-white space-y-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-[-10%] right-[-10%] p-4 opacity-[0.02] text-white pointer-events-none rotate-12">
                                <Coins size={200} strokeWidth={1} />
                            </div>
                            
                            <div className="space-y-4 relative z-10">
                                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                    <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Escrow Ledger</p>
                                    {booking.escrow_locked ? (
                                        <span className="flex items-center gap-2 text-[9px] text-[#D4AF37] font-black uppercase tracking-widest bg-[#D4AF37]/10 px-3 py-1.5 rounded-md border border-[#D4AF37]/30 shadow-inner"><Lock size={12}/> Secured</span>
                                    ) : (
                                        <span className="flex items-center gap-2 text-[9px] text-amber-400 font-black uppercase tracking-widest bg-amber-500/10 px-3 py-1.5 rounded-md border border-amber-500/20 shadow-inner"><Unlock size={12}/> Unfunded</span>
                                    )}
                                </div>
                                <h3 className="text-5xl font-serif tracking-tight drop-shadow-md">
                                    ${Number(booking.agreed_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h3>
                                
                                <div className="pt-4 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white/40 bg-[#030303] p-4 rounded-xl border border-white/5 shadow-inner">
                                    <Calendar size={16} className="text-[#D4AF37]" />
                                    Deadline: <span className="text-white">{formatDeadline(booking.deadline)}</span>
                                </div>
                            </div>

                            {/* PROVIDER VIEW - ACCEPT OR REJECT GATE */}
                            {isProvider && booking.status === 'pending' && !providerHasAccepted && (
                                <div className="relative z-10 pt-6 border-t border-white/5 space-y-4">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-white mb-2">Incoming Contract Request</p>
                                    
                                    <textarea 
                                        placeholder="If declining, add a brief reason here..." 
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        className="w-full bg-[#030303] border border-white/10 rounded-xl p-4 text-xs text-white outline-none resize-none focus:border-rose-500/50 custom-scrollbar shadow-inner"
                                        rows={3}
                                    />

                                    <div className="flex gap-4">
                                        <button onClick={handleRejectProject} disabled={isRejecting || isAccepting} className="flex-1 py-4 bg-[#0a0a0a] hover:bg-rose-900/50 text-rose-400 font-black uppercase tracking-[0.2em] text-[9px] rounded-xl transition-all border border-rose-500/20 shadow-inner flex justify-center gap-2">
                                            {isRejecting ? <Loader2 className="animate-spin" size={14} /> : <><XCircle size={14}/> Decline</>}
                                        </button>
                                        <button onClick={handleAcceptProject} disabled={isRejecting || isAccepting} className="flex-1 py-4 bg-[#D4AF37] hover:bg-white text-black font-black uppercase tracking-[0.2em] text-[9px] rounded-xl transition-all flex justify-center gap-2 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                                            {isAccepting ? <Loader2 className="animate-spin" size={14} /> : <><CheckCircle2 size={14}/> Accept Project</>}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* CLIENT VIEW: Funding (Only visible AFTER Provider Accepts) */}
                            {isClient && providerHasAccepted && !booking.escrow_locked && !['completed', 'cancelled'].includes(booking.status) && (
                                <div className="relative z-10 pt-6 border-t border-white/5 space-y-6">
                                    <p className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.2em] flex items-center gap-2 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20"><CheckCircle2 size={14}/> Artist Accepted Contract</p>
                                    <button onClick={handleFundEscrow} disabled={fundingEscrow} className="w-full py-5 bg-[#D4AF37] hover:bg-white text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-xl flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(212,175,55,0.2)] transition-all">
                                        {fundingEscrow ? <Loader2 className="animate-spin" size={16} /> : <><Lock size={16} /> Authorize & Fund Escrow</>}
                                    </button>
                                </div>
                            )}

                            {/* CLIENT VIEW: Waiting for Acceptance */}
                            {isClient && booking.status === 'pending' && !providerHasAccepted && (
                                <div className="relative z-10 pt-6 border-t border-white/5">
                                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl shadow-inner">
                                        <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 leading-relaxed">Contract active. Awaiting artist acceptance before vault initialization.</p>
                                    </div>
                                </div>
                            )}

                            {/* PROVIDER VIEW: Forms */}
                            {isProvider && providerHasAccepted && booking.escrow_locked && !['completed', 'cancelled'].includes(booking.status) && (
                                <div className="relative z-10 space-y-6 pt-6 border-t border-white/5">
                                    
                                    {['accepted', 'progress'].includes(booking.status) && (
                                        <form onSubmit={(e) => handleSubmitPhase(e, 'prototype')} className="space-y-4">
                                            <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em] flex items-center gap-2"><PlayCircle size={14}/> Submit Prototype</p>
                                            <input type="url" placeholder="Paste Prototype Link..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} required className="w-full bg-[#030303] border border-white/10 rounded-xl px-4 py-4 text-xs text-white outline-none shadow-inner focus:border-indigo-500/50 transition-colors" />
                                            <button type="submit" disabled={submittingAction} className="w-full py-4 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/30 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl flex justify-center items-center gap-2 transition-all">
                                                {submittingAction ? <Loader2 className="animate-spin" size={14} /> : <><Upload size={14}/> Transmit Prototype</>}
                                            </button>
                                        </form>
                                    )}

                                    {booking.status === 'final_production' && (
                                        <form onSubmit={(e) => handleSubmitPhase(e, 'final')} className="space-y-4">
                                            <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.2em] flex items-center gap-2"><CheckCircle2 size={14}/> Submit Final Files</p>
                                            <input type="url" placeholder="Paste Final Deliverables Link..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} required className="w-full bg-[#030303] border border-white/10 rounded-xl px-4 py-4 text-xs text-white outline-none shadow-inner focus:border-cyan-500/50 transition-colors" />
                                            <button type="submit" disabled={submittingAction} className="w-full py-4 bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 border border-cyan-500/30 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl flex justify-center items-center gap-2 transition-all">
                                                {submittingAction ? <Loader2 className="animate-spin" size={14} /> : <><Upload size={14}/> Transmit Final Assets</>}
                                            </button>
                                        </form>
                                    )}
                                </div>
                            )}

                            {/* DANGER ZONE - CANCELLATION */}
                            {isClient && !['completed', 'cancelled'].includes(booking.status) && (
                                <div className="relative z-10 mt-8 pt-6 border-t border-white/5 space-y-4">
                                    <p className="text-[10px] text-rose-400 font-black uppercase tracking-[0.2em] flex items-center gap-2"><AlertCircle size={14} /> Danger Zone</p>
                                    <textarea 
                                        placeholder="Reason for cancellation..." 
                                        value={cancellationReason}
                                        onChange={(e) => setCancellationReason(e.target.value)}
                                        className="w-full bg-[#030303] border border-white/10 rounded-xl p-4 text-xs text-white outline-none resize-none focus:border-rose-500/50 shadow-inner custom-scrollbar"
                                        rows={3}
                                    />
                                    <button 
                                        onClick={handleCancelProject} 
                                        disabled={isCancelling}
                                        className="w-full py-4 bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-500/20 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl transition-all flex justify-center items-center gap-2 shadow-inner"
                                    >
                                        {isCancelling ? <Loader2 className="animate-spin" size={14} /> : "Cancel Project & Request Refund"}
                                    </button>
                                </div>
                            )}

                            {booking.status === 'completed' && (
                                <div className="relative z-10 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center mt-6 shadow-inner">
                                    <p className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.3em]">Contract Settled & Closed</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreatorBookingDetail;