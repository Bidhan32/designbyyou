import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // 🛠️ Added for component navigation
import API from '../../api/axios';

const InventoryGrid = () => {
    const navigate = useNavigate(); // 🛠️ Initialized navigation hook
    const [designs, setDesigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Fetch Inventory on mount
    const fetchInventory = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await API.get('/designer/my-inventory');
            
            if (response.data && response.data.data) {
                setDesigns(response.data.data);
            } else if (Array.isArray(response.data)) {
                setDesigns(response.data);
            } else {
                setDesigns([]);
            }
        } catch (err) {
            console.error("Error collecting asset inventory:", err);
            setError(err.response?.data?.message || 'Failed to populate inventory matrix.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInventory();
    }, []);

    // Helper to verify image URL composition format paths
    const resolveImageUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('/') && !url.startsWith('//')) {
            return `${API.defaults.baseURL || ''}${url}`;
        }
        return url;
    };

    return (
        <div className="selection:bg-indigo-600 selection:text-white w-full space-y-6">
            
            {/* Context Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-3xs">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Portfolio Catalog Inventory</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Manage, monitor, and deploy exclusive designs to creators.</p>
                </div>
                <button 
                    onClick={() => navigate('/designer/upload')} // 🛠️ REDIRECT FIX: Change path string if your path differs (e.g. '/upload')
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-3 rounded-xl transition shadow-xs self-start sm:self-center cursor-pointer duration-150"
                >
                    + Upload New Design
                </button>
            </div>

            {/* Application Error Notification Toasts */}
            {error && <div className="p-4 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-medium">{error}</div>}

            {/* Inventory Visual Catalog Grid */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
                    {[1, 2, 3, 4].map(n => <div key={n} className="h-72 bg-gray-50 rounded-2xl"></div>)}
                </div>
            ) : designs.length === 0 ? (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl py-20 bg-white">
                    <p className="text-gray-400 text-sm font-semibold">Your catalog vaults are currently empty.</p>
                    <button 
                        onClick={() => navigate('/designer/upload')} // 🛠️ Empty State Redirect
                        className="text-indigo-600 hover:text-indigo-700 text-xs mt-2 font-bold underline cursor-pointer"
                    >
                        Click here to add your digital assets.
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {designs.map((item) => {
                        const targetImage = resolveImageUrl(item.watermarked_preview_url || item.preview_url);
                        
                        return (
                            <div key={item.id} className="bg-white rounded-2xl shadow-3xs border border-gray-100 overflow-hidden group flex flex-col justify-between hover:border-gray-200 transition duration-200">
                                <div>
                                    <div className="relative aspect-video bg-slate-50 overflow-hidden border-b border-gray-50 flex items-center justify-center p-2">
                                        {targetImage ? (
                                            <img 
                                                src={targetImage} 
                                                alt={item.title} 
                                                className="max-w-full max-h-full object-contain group-hover:scale-102 transition duration-300"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-50 p-4">
                                                <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 text-center">No Preview Available</span>
                                            </div>
                                        )}
                                        <span className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur-md text-xs font-black text-white px-2.5 py-1 rounded-lg tabular-nums shadow-xs">
                                            ${Number(item.base_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="p-4 space-y-2">
                                        <span className="inline-block text-[9px] uppercase font-bold tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                                            {(item.category || 'Asset').replace('-', ' ')}
                                        </span>
                                        <h3 className="font-bold text-gray-900 text-sm truncate uppercase tracking-tight">{item.title || "Untitled Asset"}</h3>
                                        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed font-medium">{item.description || "No description provided."}</p>
                                    </div>
                                </div>
                                
                                <div className="p-4 pt-0 mt-3 flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-50/60 pt-3">
                                    <span className="font-medium">SKU: <strong className="text-gray-500 font-mono text-[10px]">{item.sku || "N/A"}</strong></span>
                                    <span className={`capitalize px-2.5 py-0.5 rounded-md font-bold text-[10px] border ${
                                        item.is_published 
                                            ? "text-green-600 bg-green-50 border-green-100" 
                                            : "text-amber-600 bg-amber-50 border-amber-100"
                                    }`}>
                                        {item.is_published ? 'Live' : 'Draft'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default InventoryGrid;