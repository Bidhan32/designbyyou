import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { Download, FileText, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';

const OrderHistoryPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const { data } = await API.get('/ecommerce/orders/history');
                if (data.status === 'success') {
                    setOrders(data.data || []);
                }
            } catch (err) {
                console.error("Failed fetching order history archives:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, []);

    // Secure delivery file stream down-loader handler
    const handleDownloadAsset = async (orderItemId, filename) => {
        try {
            // Request a secure signed download stream URL from the backend matrix
            const res = await API.get(`/ecommerce/downloads/${orderItemId}`, { responseType: 'blob' });
            
            // Generate temporary dynamic anchor link mapping to download the media asset securely
            const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', filename || `design_asset_${orderItemId}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert("Secure media initialization stream failure. Please refresh and retry.");
        }
    };

    if (loading) {
        return (
            <div className="w-full max-w-5xl mx-auto py-20 px-6 text-center animate-pulse">
                <Loader2 className="animate-spin text-gray-300 mx-auto mb-4" size={24} />
                <p className="text-xs tracking-widest text-gray-400 uppercase font-mono">Syncing Vault Manifest...</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto py-16 px-6">
            <h1 className="text-4xl font-serif font-light mb-2">Vault <span className="italic font-normal text-[#D4AF37]">Library</span></h1>
            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400 font-bold mb-12">Your Verified Production Tokens & Assets</p>

            {orders.length === 0 ? (
                <div className="text-center py-24 border border-gray-100 rounded-3xl bg-gray-50/30">
                    <CheckCircle2 className="mx-auto text-gray-300 mb-4" size={28} />
                    <p className="text-sm font-serif italic text-gray-500">No assets procured yet.</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {orders.map((order) => (
                        <div key={order.order_id} className="border border-gray-100 rounded-3xl bg-white shadow-2xs overflow-hidden">
                            {/* Order Metadata Strip Header */}
                            <div className="bg-gray-50/70 border-b border-gray-100 px-8 py-5 flex flex-wrap justify-between items-center gap-4 text-xs font-mono text-gray-500">
                                <div className="flex gap-6">
                                    <p>ORDER ID: <span className="text-gray-900 font-bold">#{order.order_id.slice(-8).toUpperCase()}</span></p>
                                    <p>CLEARED: <span className="text-gray-900 font-bold">{new Date(order.created_at).toLocaleDateString()}</span></p>
                                </div>
                                <p className="font-serif text-sm font-bold text-gray-900">Total: ${parseFloat(order.total_amount).toFixed(2)}</p>
                            </div>

                            {/* Ordered Manifest Items Loop */}
                            <div className="divide-y divide-gray-50 px-8">
                                {(order.items || []).map((item) => (
                                    <div key={item.order_item_id} className="py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                        <div className="flex gap-4 items-center">
                                            <div className="h-14 w-14 bg-gray-50 rounded-xl overflow-hidden border border-gray-100 shrink-0">
                                                <img src={item.watermarked_preview_url || "/fallback-placeholder.png"} alt="" className="h-full w-full object-cover" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-medium text-gray-900 truncate uppercase tracking-tight">{item.title}</h4>
                                                <p className="text-[9px] font-mono text-gray-400 mt-0.5 uppercase tracking-wider">License: {item.license_type.replace('_', ' ')}</p>
                                            </div>
                                        </div>

                                        {/* Core Digital Action Delivery Switches */}
                                        <div className="flex flex-wrap items-center gap-3">
                                            <button 
                                                onClick={() => handleDownloadAsset(item.order_item_id, item.source_file_name)}
                                                className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold border border-black bg-black text-white hover:bg-[#D4AF37] hover:border-[#D4AF37] px-5 py-3 rounded-xl transition-all duration-300 shadow-2xs cursor-pointer"
                                            >
                                                <Download size={12} /> Production Files
                                            </button>
                                            <a 
                                                href={`${API.defaults.baseURL}/ecommerce/licenses/certificate/${item.order_item_id}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold border border-gray-200 text-gray-600 hover:text-black hover:border-black px-5 py-3 rounded-xl transition-all cursor-pointer"
                                            >
                                                <FileText size={12} /> Certificate <ExternalLink size={10} />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default OrderHistoryPage;