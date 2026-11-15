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
            <Loader2 className="animate-spin text-action" size={32} />
        </div>
    );

    // Default design options to show if the designer hasn't added custom ones yet
    const catalogPackages = studio?.packages || [
        { id: 'pkg_1', title: 'Essential Stream Package', base_price: 99.00, details: 'Includes matching screens, profile banners, alert templates, and a clean chat box layout.' },
        { id: 'pkg_2', title: 'Premium Animated Overlays', base_price: 249.00, details: 'Includes custom moving stinger transitions, live webcam frames, and animated alerts.' }
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-6 p-4">
            <button onClick={() => navigate('/creator/discovery')} className="flex items-center gap-1.5 text-xs font-bold text-muted hover:text-ink transition-colors cursor-pointer">
                <ArrowLeft size={14} /> Back to Designer Search
            </button>

            {/* Profile Header Card */}
            <div className="bg-surface border border-line rounded-md p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-surface text-ink rounded-md flex items-center justify-center text-xl font-semibold uppercase">
                        {studio?.studio_name?.substring(0,2)}
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-ink">{studio?.studio_name}</h1>
                        <p className="text-xs text-action font-medium mt-0.5">{studio?.specialty || 'Visual Designer'}</p>
                    </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button className="flex-1 sm:flex-initial px-3 py-2 border rounded-md text-xs font-bold text-muted hover:bg-canvas flex items-center justify-center gap-1 cursor-pointer">
                        <Mail size={12} /> Contact
                    </button>
                    
                    <button 
                        onClick={() => navigate(`/creator/studio/${designerId}/commission`)}
                        className="flex-1 sm:flex-initial px-4 py-2 bg-action hover:bg-action text-on-action font-bold text-xs rounded-md flex items-center justify-center gap-1 cursor-pointer hover:text-on-action"
                    >
                        <Zap size={12} /> Custom Order
                    </button>
                </div>
            </div>

            {/* Available Work Packages */}
            <div>
                <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">Available Design Packages</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {catalogPackages.map((pkg) => (
                        <div key={pkg.id} className="bg-surface border border-line rounded-md p-4 flex flex-col justify-between">
                            <div className="space-y-2">
                                <div className="flex justify-between items-start gap-2">
                                    <h4 className="font-bold text-ink text-sm leading-tight">{pkg.title}</h4>
                                    <span className="font-mono text-xs font-semibold text-action">${pkg.base_price.toFixed(2)}</span>
                                </div>
                                <p className="text-xs text-muted leading-relaxed">{pkg.details}</p>
                            </div>
                            
                            <button 
                                onClick={() => navigate(`/creator/studio/${designerId}/commission`, { state: { referenceDesign: pkg } })}
                                className="w-full mt-4 py-2 bg-canvas hover:bg-canvas border border-line hover:border-line text-ink hover:text-action text-xs font-bold rounded-md transition cursor-pointer"
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