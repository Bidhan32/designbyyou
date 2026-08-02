import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Mail, ShieldCheck, Zap } from 'lucide-react';
import API from '../../api/axios';

const DesignerStudioProfile = () => {
    const { designerId } = useParams();
    const navigate = useNavigate();
    const [studio, setStudio] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStudioProfile = async () => {
            try {
                const { data } = await API.get(`/all/designers/${designerId}`);
                setStudio(data.data);
            } catch (err) {
                console.error("Error fetching designer profile:", err);
                navigate('/creator/discovery');
            } finally {
                // Stop showing the loading spinner
                setLoading(false);
            }
        };
        if (designerId) fetchStudioProfile();
    }, [designerId, navigate]);

    if (loading) return (
        <div className="h-[60vh] flex items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
    );

    // Default design options to show if the designer hasn't added custom ones yet
    const catalogPackages = studio?.packages || [
        { id: 'pkg_1', title: 'Essential Stream Package', base_price: 99.00, details: 'Includes matching screens, profile banners, alert templates, and a clean chat box layout.' },
        { id: 'pkg_2', title: 'Premium Animated Overlays', base_price: 249.00, details: 'Includes custom moving stinger transitions, live webcam frames, and animated alerts.' }
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-6 p-4">
            <button onClick={() => navigate('/creator/discovery')} className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-900 transition-colors cursor-pointer">
                <ArrowLeft size={14} /> Back to Designer Search
            </button>

            {/* Profile Header Card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-gray-900 text-white rounded-2xl flex items-center justify-center text-xl font-black uppercase">
                        {studio?.studio_name?.substring(0,2)}
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">{studio?.studio_name}</h1>
                        <p className="text-xs text-indigo-600 font-medium mt-0.5">{studio?.specialty || 'Visual Designer'}</p>
                    </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button className="flex-1 sm:flex-initial px-3 py-2 border rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1 cursor-pointer">
                        <Mail size={12} /> Contact
                    </button>
                    
                    <button 
                        onClick={() => navigate(`/creator/studio/${designerId}/commission`)}
                        className="flex-1 sm:flex-initial px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                    >
                        <Zap size={12} /> Custom Order
                    </button>
                </div>
            </div>

            {/* Available Work Packages */}
            <div>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Available Design Packages</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {catalogPackages.map((pkg) => (
                        <div key={pkg.id} className="bg-white border border-gray-100 rounded-xl p-5 flex flex-col justify-between shadow-xs">
                            <div className="space-y-2">
                                <div className="flex justify-between items-start gap-2">
                                    <h4 className="font-bold text-gray-900 text-sm leading-tight">{pkg.title}</h4>
                                    <span className="font-mono text-xs font-black text-emerald-600">${pkg.base_price.toFixed(2)}</span>
                                </div>
                                <p className="text-xs text-gray-500 leading-relaxed">{pkg.details}</p>
                            </div>
                            
                            <button 
                                onClick={() => navigate(`/creator/studio/${designerId}/commission`, { state: { referenceDesign: pkg } })}
                                className="w-full mt-4 py-2 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 text-gray-700 hover:text-indigo-700 text-xs font-bold rounded-xl transition cursor-pointer"
                            >
                                Book This Package
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DesignerStudioProfile;