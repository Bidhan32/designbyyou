import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import { 
    User, Mail, Camera, Loader2, Shield, CheckCircle2, 
    AlertCircle, Briefcase, Sliders, Globe, FileText, MapPin,
    Lock, Unlock, Clock, KeyRound, LockKeyhole, Compass, ShieldCheck, Sparkles
} from 'lucide-react';
import StudioAvatarCreator from './StudioAvatarCreator';

const ProfileSetting = () => {
    const { user, setUser } = useAuth();
    
    // UI Navigation States
    const [activeTab, setActiveTab] = useState('identity'); 
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [error, setError] = useState('');

    // Avatar Modal State
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

    // Project Bookings Engine States
    const [bookings, setBookings] = useState([]);
    const [bookingsLoading, setBookingsLoading] = useState(false);

    // Profile Form State
    const [formData, setFormData] = useState({
        full_name: user?.full_name || '',
        email: user?.email || '',
        bio: user?.bio || '',
        portfolio_url: user?.portfolio_url || '',
        commission_rate: user?.commission_rate || '0.00',
        address_line: user?.address_line || '',
        city: user?.city || '',
        country: user?.country || '',
    });

    const [securityData, setSecurityData] = useState({
        current_password: '', new_password: '', confirm_password: '',
    });

    const resolveImageSrc = (path) => {
        if (!path) return '';
        if (path.includes('localhost:5000') || path.includes('localhost:8000')) {
            return path.replace(':5000', ':8080').replace(':8000', ':8080').replace(/\\/g, '/');
        }
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        return `http://localhost:8080/${path.replace(/\\/g, '/')}`;
    };
    
    const [previewUrl, setPreviewUrl] = useState(resolveImageSrc(user?.profile_image_url || user?.profile_image || ''));

    useEffect(() => {
        if (user) {
            setFormData({
                full_name: user.full_name || '', email: user.email || '', bio: user.bio || '',
                portfolio_url: user.portfolio_url || '', commission_rate: user.commission_rate || '0.00',
                address_line: user.address_line || '', city: user.city || '', country: user.country || '',
            });
            setPreviewUrl(resolveImageSrc(user.profile_image_url || user.profile_image));
        }
    }, [user]);

    useEffect(() => {
        setError(''); setSuccessMessage('');
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'bookings') {
            const loadStudioContracts = async () => {
                try {
                    setBookingsLoading(true);
                    const { data } = await API.get('/designer/my-bookings');
                    const normalizedPayload = data.data || data.bookings || data;
                    setBookings(Array.isArray(normalizedPayload) ? normalizedPayload : []);
                } catch (err) {
                    console.error("Failed to fetch project listings:", err);
                } finally {
                    setBookingsLoading(false);
                }
            };
            loadStudioContracts();
        }
    }, [activeTab]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (error) setError('');
        if (successMessage) setSuccessMessage('');
    };

    const handleSecurityChange = (e) => {
        setSecurityData({ ...securityData, [e.target.name]: e.target.value });
        if (error) setError('');
        if (successMessage) setSuccessMessage('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true); setError(''); setSuccessMessage('');

        const dataToSend = new FormData();
        Object.keys(formData).forEach(key => {
            if (formData[key] !== undefined && formData[key] !== null) {
                dataToSend.append(key, formData[key]);
            }
        });

        try {
            const { data } = await API.patch('/designer/update-profile', dataToSend, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (data.status === 'success' || data.user || data.data) {
                const updatedUser = data.user || data.data;
                setUser(updatedUser); 
                setSuccessMessage('Your profile info has been updated successfully.');
                setFormData(prev => ({ ...prev, profile_image: undefined }));
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save changes.');
        } finally {
            setLoading(false);
        }
    };

    const handleSecuritySubmit = async (e) => {
        e.preventDefault();
        if (securityData.new_password !== securityData.confirm_password) {
            setError('Your new passwords do not match.');
            return;
        }
        setLoading(true); setError(''); setSuccessMessage('');

        try {
            await API.patch('/auth/change-password', {
                currentPassword: securityData.current_password,
                newPassword: securityData.new_password
            });
            setSuccessMessage('Your password has been changed securely.');
            setSecurityData({ current_password: '', new_password: '', confirm_password: '' });
        } catch (err) {
            setError(err.response?.data?.message || 'Could not update your password. Please verify your current password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans relative overflow-hidden pb-32 animate-fade-in">
            <div className="fixed inset-0 pointer-events-none z-0"><div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-[#D4AF37]/5 blur-[150px] rounded-full"></div></div>

            <div className="max-w-[1200px] mx-auto px-6 mt-12 relative z-10 space-y-8">
                
                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-[-50%] right-[10%] opacity-[0.03] text-white pointer-events-none rotate-12"><Compass size={300} strokeWidth={0.5} /></div>
                    <div className="space-y-3 relative z-10">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.4em] mb-2"><Sparkles size={12} /> Identity Engine</div>
                        <h1 className="text-4xl md:text-5xl font-serif font-light text-white tracking-tight drop-shadow-md">Studio <span className="italic text-[#D4AF37]">Settings</span></h1>
                        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">Manage your profile info, security configurations, and active contracts.</p>
                    </div>
                    <div className="flex items-center gap-4 relative z-10">
                        {user?.tier && <span className="text-[9px] font-black tracking-[0.3em] bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.1)] px-4 py-2 rounded-full uppercase">{user.tier} Tier</span>}
                        <div className="flex items-center gap-2 px-4 py-2 bg-[#111] border border-white/10 rounded-full shadow-inner"><ShieldCheck size={14} className="text-[#D4AF37]" /><span className="text-[9px] font-black tracking-widest text-white/50 uppercase">{user?.role || 'Designer'}</span></div>
                    </div>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl shadow-2xl relative overflow-hidden">
                    <div className="flex border-b border-white/5 px-8 md:px-12 bg-[#111]/50 overflow-x-auto scrollbar-none gap-8">
                        {[{ id: 'identity', icon: Sliders, label: 'Profile Info' }, { id: 'security', icon: LockKeyhole, label: 'Security' }, { id: 'bookings', icon: Briefcase, label: 'Escrow Ledger' }].map((tab) => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-5 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 border-b-2 transition-all duration-300 whitespace-nowrap ${activeTab === tab.id ? 'border-[#D4AF37] text-[#D4AF37]' : 'border-transparent text-white/30 hover:text-white/60'}`}><tab.icon size={14} /> {tab.label}</button>
                        ))}
                    </div>

                    {activeTab === 'identity' && (
                        <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-10 animate-fade-in-up">
                            <div className="flex flex-col items-center md:items-start space-y-4">
                                <label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Studio Identity Mark</label>
                                <div onClick={() => setIsAvatarModalOpen(true)} className="group relative w-32 h-32 rounded-full border border-[#D4AF37]/30 bg-[#111] flex items-center justify-center overflow-hidden cursor-pointer transition-all duration-500 shadow-[0_0_30px_rgba(212,175,55,0.1)] hover:shadow-[0_0_40px_rgba(212,175,55,0.3)]">
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                    ) : (
                                        <User size={40} className="text-white/20" />
                                    )}
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-[#D4AF37] transition-all duration-300">
                                        <Camera size={24} className="mb-2" />
                                        <span className="text-[9px] font-black tracking-widest uppercase border border-[#D4AF37]/30 px-3 py-1 rounded-full bg-black/40">Edit Studio Mark</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex flex-col gap-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Full Name / Studio Name</label><div className="relative"><User className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" size={16} /><input name="full_name" type="text" value={formData.full_name} onChange={handleChange} className="w-full pl-12 pr-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm text-white font-medium transition-all shadow-inner" required /></div></div>
                                <div className="flex flex-col gap-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Communication Relay (Email)</label><div className="relative"><Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" size={16} /><input name="email" type="email" value={formData.email} onChange={handleChange} className="w-full pl-12 pr-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm text-white font-medium transition-all shadow-inner" required /></div></div>
                                <div className="flex flex-col gap-2 md:col-span-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">External Portfolio Archive</label><div className="relative"><Globe className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" size={16} /><input name="portfolio_url" type="url" placeholder="https://behance.net/yourname" value={formData.portfolio_url} onChange={handleChange} className="w-full pl-12 pr-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm text-white font-medium transition-all shadow-inner placeholder:text-white/20" /></div></div>
                                <div className="flex flex-col gap-2 md:col-span-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Studio Biography</label><div className="relative"><FileText className="absolute left-5 top-5 text-white/30" size={16} /><textarea name="bio" rows="4" placeholder="Tell clients about your unique design style and background..." value={formData.bio} onChange={handleChange} className="w-full pl-12 pr-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm text-white font-light leading-relaxed transition-all resize-none shadow-inner placeholder:text-white/20" /></div></div>
                            </div>

                            <div className="border-t border-white/5 pt-8 space-y-6">
                                <h3 className="text-xl font-serif text-white tracking-wide">Operational Parameters</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="flex flex-col gap-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Commission Rate</label><input name="commission_rate" type="number" step="0.01" min="0" max="1" value={formData.commission_rate} onChange={handleChange} className="w-full px-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm font-mono text-[#D4AF37] transition-all shadow-inner font-bold" /></div>
                                    <div className="flex flex-col gap-2 md:col-span-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Headquarters (Street)</label><div className="relative"><MapPin className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" size={16} /><input name="address_line" type="text" placeholder="123 Creative Studio Lane" value={formData.address_line} onChange={handleChange} className="w-full pl-12 pr-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm text-white font-medium transition-all shadow-inner placeholder:text-white/20" /></div></div>
                                    <div className="flex flex-col gap-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">City</label><input name="city" type="text" placeholder="New York" value={formData.city} onChange={handleChange} className="w-full px-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm text-white font-medium transition-all shadow-inner placeholder:text-white/20" /></div>
                                    <div className="flex flex-col gap-2 md:col-span-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Region / Country</label><input name="country" type="text" placeholder="United States" value={formData.country} onChange={handleChange} className="w-full px-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm text-white font-medium transition-all shadow-inner placeholder:text-white/20" /></div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-2">
                                {error && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-[0.2em] p-4 rounded-xl flex items-center gap-3 shadow-inner"><AlertCircle size={16} className="flex-shrink-0" /> {error}</div>}
                                {successMessage && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-[0.2em] p-4 rounded-xl flex items-center gap-3 shadow-inner"><CheckCircle2 size={16} className="flex-shrink-0" /> {successMessage}</div>}

                                <button type="submit" disabled={loading} className="w-full py-5 bg-[#D4AF37] text-black rounded-xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white disabled:bg-[#111] disabled:text-white/30 disabled:border border-white/5 disabled:shadow-none transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.2)] flex justify-center items-center gap-2">
                                    {loading ? <Loader2 className="animate-spin" size={16} /> : "Update Identity Database"}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'security' && (
                        <form onSubmit={handleSecuritySubmit} className="p-8 md:p-12 space-y-8 max-w-2xl animate-fade-in-up">
                            <div className="space-y-2 border-b border-white/5 pb-6">
                                <h3 className="text-2xl font-serif text-white tracking-wide">Cryptographic Security</h3>
                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Maintain network integrity by updating your cipher.</p>
                            </div>
                            <div className="space-y-6">
                                <div className="flex flex-col gap-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Current Access Code</label><div className="relative"><KeyRound className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" size={16} /><input name="current_password" type="password" placeholder="••••••••" value={securityData.current_password} onChange={handleSecurityChange} className="w-full pl-12 pr-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm font-mono text-white transition-all shadow-inner" required /></div></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-white/5 pt-6">
                                    <div className="flex flex-col gap-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">New Access Code</label><input name="new_password" type="password" placeholder="••••••••" value={securityData.new_password} onChange={handleSecurityChange} className="w-full px-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm font-mono text-white transition-all shadow-inner" required /></div>
                                    <div className="flex flex-col gap-2"><label className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">Verify Access Code</label><input name="confirm_password" type="password" placeholder="••••••••" value={securityData.confirm_password} onChange={handleSecurityChange} className="w-full px-5 py-4 bg-[#111] border border-white/5 rounded-xl outline-none focus:border-[#D4AF37]/50 text-sm font-mono text-white transition-all shadow-inner" required /></div>
                                </div>
                            </div>
                            <div className="space-y-4 pt-2">
                                {error && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-[0.2em] p-4 rounded-xl flex items-center gap-3 shadow-inner"><AlertCircle size={16} className="flex-shrink-0" /> {error}</div>}
                                {successMessage && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-[0.2em] p-4 rounded-xl flex items-center gap-3 shadow-inner"><CheckCircle2 size={16} className="flex-shrink-0" /> {successMessage}</div>}
                                <button type="submit" disabled={loading} className="w-full py-5 bg-[#D4AF37] text-black rounded-xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white disabled:bg-[#111] disabled:text-white/30 disabled:border border-white/5 transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.2)] flex justify-center items-center gap-2">
                                    {loading ? <Loader2 className="animate-spin" size={16} /> : "Initialize Security Update"}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'bookings' && (
                        <div className="p-8 md:p-12 space-y-8 animate-fade-in-up">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#111] border border-white/5 p-6 rounded-2xl shadow-inner">
                                <div className="flex items-center justify-between border-b sm:border-b-0 sm:border-r border-white/5 pb-4 sm:pb-0 sm:pr-6"><div className="space-y-1"><p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Liquid Capital</p><p className="text-[10px] text-white/20 uppercase font-bold">Ready for extraction</p></div><span className="text-3xl font-serif text-white tabular-nums drop-shadow-md">${Number(user?.available_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex items-center justify-between sm:pl-6 pt-4 sm:pt-0"><div className="space-y-1"><p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-bold">Vaulted Escrow</p><p className="text-[10px] text-white/20 uppercase font-bold">Secured in pipelines</p></div><span className="text-3xl font-serif text-[#D4AF37] tabular-nums drop-shadow-md">${Number(user?.pending_escrow_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            </div>

                            {bookingsLoading ? (
                                <div className="py-20 flex items-center justify-center"><Loader2 className="animate-spin text-[#D4AF37]" size={32} /></div>
                            ) : bookings.length === 0 ? (
                                <div className="border border-white/5 bg-[#111] rounded-2xl py-20 text-center space-y-4 shadow-inner"><div className="w-16 h-16 bg-[#030303] rounded-full flex items-center justify-center mx-auto border border-white/5"><Briefcase size={24} className="text-white/20" /></div><div><h4 className="text-xl font-serif text-white/80">Ledger Empty</h4><p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mt-2">No historical contracts or active pipelines found.</p></div></div>
                            ) : (
                                <div className="space-y-5">
                                    {bookings.map((contract) => (
                                        <div key={contract.id} className="border border-white/5 bg-[#111] rounded-2xl p-6 hover:border-[#D4AF37]/30 transition-all duration-300 shadow-lg flex flex-col group">
                                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4"><div className="flex items-center gap-3"><span className="text-[10px] font-mono font-bold text-white/30 bg-[#030303] px-3 py-1.5 rounded-lg border border-white/5">REF: {contract.id.slice(0, 8).toUpperCase()}</span><span className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border bg-indigo-500/10 text-indigo-400 border-indigo-500/30">{contract.status || 'Active'}</span></div><div className="flex items-center gap-4"><div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border bg-emerald-500/10 text-emerald-400 border-emerald-500/30"><Lock size={12} /> Vault Locked</div><span className="text-2xl font-serif text-white tabular-nums drop-shadow-md">${Number(contract.agreed_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div></div>
                                            <div className="py-4 space-y-2"><h4 className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold">Contract Specifications</h4><p className="text-xs text-white/70 leading-relaxed font-light">{contract.brief_text || "No custom specifications provided."}</p></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

      {/* 🚀 THE AVATAR CREATION MODAL OVERLAY (SCROLL FIX) */}
            {isAvatarModalOpen && (
                <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#030303]/95 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="min-h-screen flex items-center justify-center p-4 py-12 md:py-20">
                        <StudioAvatarCreator
                            currentAvatar={previewUrl}
                            onSave={(fileData, previewData) => {
                                setPreviewUrl(previewData); // Instantly update UI Preview
                                setFormData({ ...formData, profile_image: fileData }); // Load standard File object for backend
                                setIsAvatarModalOpen(false);
                            }}
                            onClose={() => setIsAvatarModalOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileSetting;