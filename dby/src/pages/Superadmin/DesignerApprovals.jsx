import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, ExternalLink, User, MapPin, Award } from 'lucide-react';
import API from '../../api/axios';

const DesignerApprovals = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            // Fetching users with designer role. 
            // In a production app, you might create a specific endpoint for /pending-designers
            const res = await API.get('/superadmin/users?role=designer');
            const pending = res.data.filter(user => user.status === 'pending');
            setRequests(pending);
        } catch (err) {
            console.error("Failed to load requests");
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id, status) => {
        try {
            // We use your existing update-role or a custom status endpoint
            // Assuming your backend supports a status update:
            await API.patch(`/superadmin/update-status/${id}`, { status });
            setRequests(prev => prev.filter(req => req.id !== id));
        } catch (err) {
            alert("Action failed. Ensure the update-status route exists.");
        }
    };

    if (loading) return <div className="p-10 text-gray-400 animate-pulse">Scanning Application Queue...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-serif italic text-gray-900">Designer Applications</h1>
                    <p className="text-gray-400 text-sm">Review and verify the next generation of couture talent.</p>
                </div>
                <div className="bg-orange-50 text-orange-600 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border border-orange-100">
                    {requests.length} Pending Review
                </div>
            </div>

            {requests.length === 0 ? (
                <div className="bg-white border border-dashed border-gray-200 rounded-3xl p-20 text-center">
                    <Award className="mx-auto text-gray-200 mb-4" size={48} />
                    <p className="text-gray-400 font-medium">All applications have been processed.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {requests.map((req) => (
                        <div key={req.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col md:flex-row">
                            
                            {/* Profile Sidebar */}
                            <div className="w-full md:w-64 bg-gray-50 p-8 flex flex-col items-center text-center border-r border-gray-100">
                                <div className="w-24 h-24 rounded-2xl bg-white shadow-inner mb-4 overflow-hidden border-2 border-white">
                                    {/* Assuming your backend provides the profile_image URL */}
                                    <img 
                                        src={req.profile_image || "https://ui-avatars.com/api/?name=" + req.full_name} 
                                        alt={req.full_name} 
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <h3 className="font-bold text-gray-900 leading-tight">{req.full_name}</h3>
                                <p className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-widest mt-1">Applicant</p>
                                
                                <div className="mt-6 flex flex-col gap-2 w-full">
                                    <button 
                                        onClick={() => window.open(req.portfolio_url, '_blank')}
                                        className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-bold uppercase hover:border-black transition-colors"
                                    >
                                        Portfolio <ExternalLink size={12} />
                                    </button>
                                </div>
                            </div>

                            {/* Details & Bio */}
                            <div className="flex-1 p-8 relative">
                                <div className="grid grid-cols-2 gap-8 mb-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Email Address</p>
                                        <p className="text-sm font-medium">{req.email}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Location</p>
                                        <div className="flex items-center gap-1 text-sm font-medium">
                                            <MapPin size={14} className="text-gray-400" />
                                            {req.address || "Not Provided"}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1 mb-8">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Designer Philosophy / Bio</p>
                                    <p className="text-sm text-gray-600 leading-relaxed italic">
                                        "{req.bio || "No bio provided with this application."}"
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => handleAction(req.id, 'active')}
                                        className="flex-1 bg-[#1A1A1A] text-white py-3 rounded-xl hover:bg-black transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
                                    >
                                        <CheckCircle size={16} className="text-[#D4AF37]" /> Approve Member
                                    </button>
                                    <button 
                                        onClick={() => handleAction(req.id, 'rejected')}
                                        className="px-6 py-3 border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 rounded-xl transition-all text-xs font-bold uppercase tracking-widest"
                                    >
                                        <XCircle size={16} /> Decline
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DesignerApprovals;