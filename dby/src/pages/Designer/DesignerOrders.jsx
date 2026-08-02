import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { Loader2, Check, X, Upload, ExternalLink, AlertCircle, Coins } from 'lucide-react';

const DesignerOrders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Delivery Form State
    const [selectedOrderForDelivery, setSelectedOrderForDelivery] = useState(null);
    const [deliveryUrl, setDeliveryUrl] = useState('');
    const [deliveryMessage, setDeliveryMessage] = useState('');

    const fetchDesignerOrders = async () => {
        setLoading(true);
        try {
            // Adjust this endpoint to match your exact backend designer commissions route
            const { data } = await API.get('/designer/commissions/incoming');
            setOrders(data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch incoming commissions.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDesignerOrders();
    }, []);

    const handleAcceptOrder = async (orderId) => {
        setActionLoading(true);
        setError('');
        try {
            await API.patch(`/designer/commissions/${orderId}/accept`);
            setSuccess('Order accepted! Awaiting creator escrow deposit.');
            fetchDesignerOrders();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to accept order.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeclineOrder = async (orderId) => {
        if (!window.confirm('Are you sure you want to decline this project proposal?')) return;
        setActionLoading(true);
        setError('');
        try {
            await API.patch(`/designer/commissions/${orderId}/decline`);
            setSuccess('Proposal declined successfully.');
            fetchDesignerOrders();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to decline order.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSubmitDelivery = async (e) => {
        e.preventDefault();
        if (!deliveryUrl.trim()) return;

        setActionLoading(true);
        setError('');
        try {
            await API.post(`/designer/commissions/${selectedOrderForDelivery.id}/deliver`, {
                delivery_file_url: deliveryUrl,
                delivery_message: deliveryMessage
            });
            setSuccess('Assets delivered successfully! The creator has been notified to release escrow.');
            setSelectedOrderForDelivery(null);
            setDeliveryUrl('');
            setDeliveryMessage('');
            fetchDesignerOrders();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to submit delivery.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return (
        <div className="h-[60vh] flex items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-6 p-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Incoming Commissions</h1>
                <p className="text-sm text-gray-500">Manage client proposals, track funded milestones, and submit final production assets.</p>
            </div>

            {success && <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">{success}</div>}
            {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

            {orders.length === 0 ? (
                <div className="text-center py-16 bg-white border border-dashed rounded-2xl">
                    <p className="text-gray-400 text-sm">No incoming commissions found in your queue.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <div key={order.id} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row justify-between gap-6">
                            
                            <div className="space-y-3 flex-1">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono bg-gray-50 px-2 py-0.5 rounded border">ID: #{String(order.id).substring(0,8)}</span>
                                    <span className={`text-xs px-2.5 py-0.5 rounded-md font-semibold border capitalize ${
                                        order.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        order.status === 'accepted' && !order.escrow_locked ? 'bg-zinc-50 text-zinc-600 border-zinc-200' :
                                        'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}>
                                        {order.status === 'accepted' && !order.escrow_locked ? 'Awaiting Escrow Deposit' : order.status}
                                    </span>
                                </div>

                                <div>
                                    <h3 className="font-bold text-gray-900 text-base">{order.reference_design_title || 'Custom Asset Request'}</h3>
                                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">Client Brief: "{order.brief_text}"</p>
                                </div>

                                <div className="pt-2 flex items-center gap-4 text-xs text-gray-500 border-t border-gray-50">
                                    <span className="flex items-center gap-1"><Coins size={14} className="text-indigo-600" /> Payout: <strong>${parseFloat(order.agreed_price).toFixed(2)}</strong></span>
                                    {order.deadline && <span>Deadline: <strong>{new Date(order.deadline).toLocaleDateString()}</strong></span>}
                                </div>
                            </div>

                            {/* Action Control Panel */}
                            <div className="flex md:flex-col justify-end items-end gap-2 min-w-[160px]">
                                {order.status === 'pending' && (
                                    <>
                                        <button 
                                            onClick={() => handleAcceptOrder(order.id)}
                                            disabled={actionLoading}
                                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                                        >
                                            <Check size={12} /> Accept Contract
                                        </button>
                                        <button 
                                            onClick={() => handleDeclineOrder(order.id)}
                                            disabled={actionLoading}
                                            className="w-full py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                                        >
                                            <X size={12} /> Decline
                                        </button>
                                    </>
                                )}

                                {order.status === 'accepted' && !order.escrow_locked && (
                                    <div className="text-right p-3 bg-zinc-50 rounded-xl border border-zinc-100 w-full">
                                        <p className="text-[11px] text-zinc-500 italic leading-tight">Waiting for creator to securely fund the escrow budget vault.</p>
                                    </div>
                                )}

                                {order.status === 'accepted' && order.escrow_locked && (
                                    <button 
                                        onClick={() => setSelectedOrderForDelivery(order)}
                                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                        <Upload size={12} /> Submit Deliverables
                                    </button>
                                )}

                                {['review', 'completed', 'delivered'].includes(order.status) && (
                                    <div className="text-right space-y-1 w-full">
                                        <span className="text-xs text-green-600 font-bold block">✓ Assets Dispatched</span>
                                        {order.delivery_file_url && (
                                            <a href={order.delivery_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline">
                                                Review Package <ExternalLink size={10} />
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>

                        </div>
                    ))}
                </div>
            )}

            {/* Delivery Submission Overlay Modal */}
            {selectedOrderForDelivery && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <form onSubmit={handleSubmitDelivery} className="bg-white rounded-2xl border p-6 w-full max-w-md shadow-xl space-y-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Ship Project Deliverables</h2>
                            <p className="text-xs text-gray-400">Provide final asset asset storage networks links (S3, Drive, Dropbox).</p>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Asset Pack URL</label>
                                <input 
                                    type="url" 
                                    required
                                    placeholder="https://your-cloud-storage.com/final-pack.zip"
                                    value={deliveryUrl}
                                    onChange={(e) => setDeliveryUrl(e.target.value)}
                                    className="w-full p-2.5 text-xs border rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-hidden"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Completion Notes</label>
                                <textarea 
                                    placeholder="Add installation notes, file variant breakdowns, or usage hints..."
                                    rows={3}
                                    value={deliveryMessage}
                                    onChange={(e) => setDeliveryMessage(e.target.value)}
                                    className="w-full p-2.5 text-xs border rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-hidden resize-none"
                                />
                            </div>
                        </div>

                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-2">
                            <AlertCircle size={14} className="text-amber-700 shrink-0 mt-0.5" />
                            <p className="text-[10px] leading-relaxed text-amber-800">
                                This action shifts the order into active review. The creator will inspect the assets to authorize immediate escrow disbursement.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button 
                                type="button" 
                                onClick={() => setSelectedOrderForDelivery(null)}
                                className="px-3 py-1.5 border text-gray-500 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                disabled={actionLoading}
                                className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                            >
                                {actionLoading ? 'Uploading...' : 'Transmit Deliverables'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default DesignerOrders;