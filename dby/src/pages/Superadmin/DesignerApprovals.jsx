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
        } catch {
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
        } catch {
            alert("Action failed. Ensure the update-status route exists.");
        }
    };

    if (loading) return <div className="p-4 text-muted animate-pulse">Scanning Application Queue...</div>;

    return (
        <div className="p-4 max-w-6xl mx-auto space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-serif italic text-ink">Designer Applications</h1>
                    <p className="text-muted text-sm">Review applications and approve eligible designers.</p>
                </div>
                <div className="bg-canvas text-action px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest border border-line">
                    {requests.length} Pending Review
                </div>
            </div>

            {requests.length === 0 ? (
                <div className="bg-surface border border-dashed border-line rounded-md p-20 text-center">
                    <Award className="mx-auto text-ink mb-4" size={48} />
                    <p className="text-muted font-medium">All applications have been processed.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {requests.map((req) => (
                        <div key={req.id} className="bg-surface rounded-md border border-line transition-all overflow-hidden flex flex-col md:flex-row">
                            
                            {/* Profile Sidebar */}
                            <div className="w-full md:w-64 bg-canvas p-4 flex flex-col items-center text-center border-r border-line">
                                <div className="w-24 h-24 rounded-md bg-surface mb-4 overflow-hidden border-2 border-line">
                                    {/* Assuming your backend provides the profile_image URL */}
                                    <img 
                                        src={req.profile_image || "https://ui-avatars.com/api/?name=" + req.full_name} 
                                        alt={req.full_name} 
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <h3 className="font-bold text-ink leading-tight">{req.full_name}</h3>
                                <p className="text-[10px] text-action font-bold uppercase tracking-widest mt-1">Applicant</p>
                                
                                <div className="mt-6 flex flex-col gap-2 w-full">
                                    <button 
                                        onClick={() => window.open(req.portfolio_url, '_blank')}
                                        className="w-full flex items-center justify-center gap-2 py-2 bg-surface border border-line rounded-md text-[10px] font-bold uppercase hover:border-line transition-colors"
                                    >
                                        Portfolio <ExternalLink size={12} />
                                    </button>
                                </div>
                            </div>

                            {/* Details & Bio */}
                            <div className="flex-1 p-4 relative">
                                <div className="grid grid-cols-2 gap-8 mb-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted">Email Address</p>
                                        <p className="text-sm font-medium">{req.email}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted">Location</p>
                                        <div className="flex items-center gap-1 text-sm font-medium">
                                            <MapPin size={14} className="text-muted" />
                                            {req.address || "Not Provided"}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1 mb-8">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted">Designer Philosophy / Bio</p>
                                    <p className="text-sm text-muted leading-relaxed italic">
                                        "{req.bio || "No bio provided with this application."}"
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => handleAction(req.id, 'active')}
                                        className="flex-1 bg-surface text-ink py-3 rounded-md hover:bg-canvas transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
                                    >
                                        <CheckCircle size={16} className="text-action" /> Approve Member
                                    </button>
                                    <button 
                                        onClick={() => handleAction(req.id, 'rejected')}
                                        className="px-6 py-3 border border-line text-muted hover:text-action hover:border-line rounded-md transition-all text-xs font-bold uppercase tracking-widest"
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