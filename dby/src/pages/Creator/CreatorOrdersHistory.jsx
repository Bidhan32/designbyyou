import React, { useEffect, useState } from 'react';
import API from '../../api/axios'; // 🟢 Adjust this relative path to point to your axios instance file

const CreatorOrdersHistory = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchOrderHistory = async () => {
            try {
                // 🟢 Uses your API instance with automatic token attachment and correct route nesting
                const response = await API.get('/creator/ecommerce/orders/history');
                
                // Maps data using the structure from your getHistoryManifest controller
                setOrders(response.data.data || []);
                setLoading(false);
            } catch (err) {
                console.error("Error retrieving ledger breakdown:", err);
                setError("Failed to load order history records.");
                setLoading(false);
            }
        };

        fetchOrderHistory();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto mt-10 p-6 bg-red-50 rounded-lg text-red-700 text-center">
                <p className="font-semibold">{error}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Order History</h1>
                    <p className="mt-2 text-sm text-gray-600">Manage and download your completed asset license acquisitions.</p>
                </div>

                {orders.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        <h3 className="mt-4 text-lg font-medium text-gray-900">No orders discovered</h3>
                        <p className="mt-1 text-sm text-gray-500">You haven't bought any commercial marketplace assets yet.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {orders.map((order) => (
                            <div key={order.order_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                {/* Order Info Bar */}
                                <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-gray-600">
                                    <div>
                                        <p className="text-xs uppercase font-semibold text-gray-400 tracking-wider">Date Placed</p>
                                        <p className="font-medium text-gray-900 mt-0.5">
                                            {new Date(order.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase font-semibold text-gray-400 tracking-wider">Total Amount</p>
                                        <p className="font-semibold text-gray-900 mt-0.5">${parseFloat(order.total_amount).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase font-semibold text-gray-400 tracking-wider">Order ID Reference</p>
                                        <p className="font-mono text-xs text-gray-500 mt-1 truncate max-w-[150px]" title={order.order_id}>
                                            {order.order_id}
                                        </p>
                                    </div>
                                    <div className="text-right flex flex-col justify-center items-end">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                            {order.payment_status}
                                        </span>
                                    </div>
                                </div>

                                {/* Items Bought in this Order */}
                                <ul className="divide-y divide-gray-200">
                                    {order.items && order.items.map((item) => (
                                        <li key={item.order_item_id} className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="h-16 w-16 bg-gray-100 rounded-lg border border-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                                    {item.watermarked_preview_url ? (
                                                        <img src={item.watermarked_preview_url} alt={item.title} className="h-full w-full object-cover" />
                                                    ) : (
                                                        <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="text-base font-semibold text-gray-900">{item.title || 'Marketplace Item'}</h4>
                                                    <p className="text-xs text-gray-500 mt-0.5 font-mono">Design ID: {item.design_id}</p>
                                                    <span className="inline-block mt-2 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded">
                                                        License: {item.license_type?.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="w-full sm:w-auto flex sm:flex-col justify-between sm:items-end items-center border-t sm:border-0 pt-4 sm:pt-0">
                                                {/* Download Link appears if order succeeded and high-res asset exists */}
                                                {item.source_file_url ? (
                                                    <a 
                                                        href={item.source_file_url} 
                                                        download
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-500 bg-white border border-gray-300 hover:border-indigo-300 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                                                    >
                                                        Download High-Res Asset
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">No download available</span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreatorOrdersHistory;