import React, { useState, useEffect } from 'react';
import { 
    Search, UserMinus, ShieldCheck, Mail, Download, 
    UserCheck, AlertTriangle, Eye, X, ExternalLink, 
    CheckCircle2, Ban, Loader2
} from 'lucide-react';
import API from '../../api/axios';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [selectedUser, setSelectedUser] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await API.get('/superadmin/users');
            // Ensure res.data is an array before setting
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Fetch failed", err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateRole = async (id, newRole) => {
        try {
            await API.patch(`/superadmin/update-role/${id}`, { role: newRole });
            // Local state update for instant UI response
            setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRole } : u));
        } catch (err) {
            alert("Role update failed");
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            await API.patch(`/superadmin/update-status/${id}`, { status: newStatus });
            setUsers(prev => prev.map(u => u.id === id ? { ...u, status: newStatus } : u));
            setIsModalOpen(false);
        } catch (err) {
            alert("Status update failed");
        }
    };

    const openReview = (user) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = 
            (u.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
            (u.email || "").toLowerCase().includes(searchTerm.toLowerCase());
        
        // Logic for 'pending' filter: checks status instead of role if needed
        const matchesRole = roleFilter === 'all' 
            ? true 
            : roleFilter === 'pending' 
                ? u.status === 'pending' 
                : u.role === roleFilter;

        return matchesSearch && matchesRole;
    });

    return (
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8 relative min-h-screen">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-serif italic text-gray-900">User Directory</h1>
                    <p className="text-gray-400 text-sm mt-1">Review applications and manage global permissions.</p>
                </div>
                <button className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg active:scale-95">
                    <Download size={14} /> Export Directory
                </button>
            </header>

            {/* Filter Bar */}
            <div className="flex flex-col lg:flex-row gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search by name or email..."
                        className="w-full pl-12 pr-4 py-3 bg-gray-50/50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-[#D4AF37] outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex overflow-x-auto gap-2 no-scrollbar">
                    {['all', 'designer', 'creator', 'admin', 'pending'].map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setRoleFilter(filter)}
                            className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                                roleFilter === filter ? 'bg-[#1A1A1A] text-white shadow-md' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                            }`}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
            </div>

            {/* User Table */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="animate-spin text-[#D4AF37]" size={40} />
                        <p className="text-gray-400 font-medium">Syncing Directory...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-50">
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">User Details</th>
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Current Role</th>
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Account Status</th>
                                    <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Management</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredUsers.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50/50 transition-all group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-400 border border-gray-200 overflow-hidden">
                                                    {user.profile_image ? (
                                                        <img src={user.profile_image} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="uppercase">{user.full_name?.charAt(0) || <Mail size={14}/>}</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{user.full_name || "Unknown User"}</p>
                                                    <p className="text-xs text-gray-400">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <select 
                                                value={user.role} 
                                                onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                                                className="text-[10px] font-bold uppercase bg-gray-100 border-none rounded-xl px-3 py-2 focus:ring-2 focus:ring-[#D4AF37] cursor-pointer hover:bg-gray-200 transition-colors"
                                            >
                                                <option value="creator">Creator</option>
                                                <option value="designer">Designer</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                                                user.status === 'active' ? 'bg-green-50 text-green-600' : 
                                                user.status === 'pending' ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
                                            }`}>
                                                {user.status || 'inactive'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => openReview(user)}
                                                    className="p-3 bg-gray-50 text-gray-600 rounded-xl hover:bg-[#D4AF37] hover:text-white transition-all shadow-sm"
                                                    title="View Full Profile"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleUpdateStatus(user.id, user.status === 'banned' ? 'active' : 'banned')}
                                                    className={`p-3 rounded-xl transition-all shadow-sm ${user.status === 'banned' ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                                                    title={user.status === 'banned' ? "Unban User" : "Ban User"}
                                                >
                                                    {user.status === 'banned' ? <UserCheck size={16} /> : <UserMinus size={16} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Slide-over Modal */}
            {isModalOpen && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-[2px] transition-opacity">
                    <div className="w-full max-w-xl h-full bg-white shadow-2xl p-8 overflow-y-auto animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h2 className="text-2xl font-serif italic">User Intelligence</h2>
                                <p className="text-sm text-gray-400">ID: #{selectedUser.id}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-8">
                            <section className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
                                        {selectedUser.profile_image ? (
                                            <img src={selectedUser.profile_image} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-xl font-black text-[#D4AF37] uppercase">{selectedUser.full_name?.charAt(0)}</span>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">{selectedUser.full_name}</h3>
                                        <p className="text-sm text-gray-500 capitalize">{selectedUser.role} • {selectedUser.level || 'Standard'}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-xs font-medium text-gray-500">
                                    <div>Email: <span className="text-gray-900 block font-bold truncate">{selectedUser.email}</span></div>
                                    <div>Last Active: <span className="text-gray-900 block font-bold">{selectedUser.last_seen ? new Date(selectedUser.last_seen).toLocaleDateString() : 'Recent'}</span></div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Extended Bio</h4>
                                <p className="text-sm text-gray-600 leading-relaxed bg-white border border-gray-100 p-4 rounded-2xl italic">
                                    {selectedUser.bio || "This user has not updated their biography yet."}
                                </p>
                                
                                {selectedUser.portfolio_url && (
                                    <a 
                                        href={selectedUser.portfolio_url} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-[#D4AF37] transition-all group"
                                    >
                                        <span className="text-sm font-bold text-gray-900">External Portfolio</span>
                                        <ExternalLink size={16} className="text-gray-400 group-hover:text-[#D4AF37]" />
                                    </a>
                                )}
                            </section>

                            <div className="pt-10 border-t border-gray-100">
                                <div className="flex flex-col gap-3">
                                    {selectedUser.status === 'pending' && (
                                        <button 
                                            onClick={() => handleUpdateStatus(selectedUser.id, 'active')}
                                            className="w-full py-4 bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-zinc-800 flex items-center justify-center gap-2 shadow-lg"
                                        >
                                            <CheckCircle2 size={18} className="text-[#D4AF37]" /> Approve Application
                                        </button>
                                    )}
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => handleUpdateStatus(selectedUser.id, 'rejected')}
                                            className="flex-1 py-4 border border-red-100 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-50 flex items-center justify-center gap-2"
                                        >
                                            <Ban size={16} /> Reject
                                        </button>
                                        <button 
                                            className="flex-1 py-4 border border-gray-200 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-50"
                                            onClick={() => setIsModalOpen(false)}
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;