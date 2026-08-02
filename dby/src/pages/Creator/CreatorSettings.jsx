import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Save, Lock, User, AlignLeft, ShieldCheck, Loader2, AlertTriangle, CheckCircle2, Briefcase, Tag, Box, X } from 'lucide-react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { AvaturnSDK } from '@avaturn/sdk'; 

export default function CreatorSettings() {
    const { user, setUser } = useAuth();
    const navigate = useNavigate();
    
    // UI States
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Avatar Engine States
    const [showRpmModal, setShowRpmModal] = useState(false);
    const [rpmAvatarUrl, setRpmAvatarUrl] = useState(''); // Secretly holds the 3D .glb link

    // Avaturn DOM Refs
    const avaturnContainerRef = useRef(null);
    const sdkInstance = useRef(null);

    const [form, setForm] = useState({
        full_name: '',
        company_name: '',
        preferred_category: '',
        brand_guidelines_summary: ''
    });

    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null); // Holds the 2D visible image
    const fileInputRef = useRef(null);

    // Pre-fill form with existing user data
    useEffect(() => {
        if (user) {
            setForm({
                full_name: user.full_name || '',
                company_name: user.company_name || '',
                preferred_category: user.preferred_category || '',
                brand_guidelines_summary: user.brand_guidelines_summary || ''
            });
            setAvatarPreview(user.profile_image_url);
        }
    }, [user]);

    const handleInputChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
    const handlePasswordChange = (e) => setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });

    // Standard Image Upload
    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setErrorMsg("Image size must be less than 5MB.");
            return;
        }

        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
        setRpmAvatarUrl(''); 
    };

    // BOOT THE AVATURN 3D ENGINE
    useEffect(() => {
        if (showRpmModal && avaturnContainerRef.current) {
            const initAvaturn = async () => {
                sdkInstance.current = new AvaturnSDK();
                
                await sdkInstance.current.init(avaturnContainerRef.current, { 
                    url: 'https://demo.avaturn.dev' 
                });
                
                sdkInstance.current.on('export', (data) => {
                    // 1. Capture the 3D .glb URL secretly for the Fitting Room
                    const finalAvatarUrl = data?.url || data?.httpURL || JSON.stringify(data);
                    setRpmAvatarUrl(finalAvatarUrl);
                    
                    // 2. Generate a stylish 2D portrait for the visible UI
                    const seed = user?.id || Math.random().toString(36).substring(7);
                    const flat2DImage = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=D4AF37`;
                    
                    setAvatarPreview(flat2DImage); 
                    setAvatarFile(null); 
                    setShowRpmModal(false);
                    setSuccessMsg("3D Mannequin synchronized. 2D Avatar set for profile.");
                });
            };
            
            initAvaturn();
        }
    }, [showRpmModal, user]);

    // Save Profile
    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            const formData = new FormData();
            formData.append('full_name', form.full_name);
            formData.append('company_name', form.company_name);
            formData.append('preferred_category', form.preferred_category);
            formData.append('brand_guidelines_summary', form.brand_guidelines_summary);

            if (rpmAvatarUrl) {
                // Sends the 2D image to be saved as your standard profile picture
                formData.append('remote_avatar_url', avatarPreview); 
                // Sends the 3D link to be saved for the studio (Requires backend update later)
                formData.append('remote_3d_mannequin_url', rpmAvatarUrl); 
            } else if (avatarFile) {
                formData.append('profile_image', avatarFile); 
            }

            const { data } = await API.put('/users/profile', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (setUser) setUser(data.data || data);
            setSuccessMsg("Brand Identity Matrix updated successfully.");
        } catch (err) {
            setErrorMsg(err.response?.data?.message || "Failed to update profile.");
        } finally {
            setLoading(false);
        }
    };

    const handleSecuritySubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setErrorMsg("New passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await API.put('/users/security', {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            });
            
            setSuccessMsg("Security protocols updated.");
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            setErrorMsg(err.response?.data?.message || "Failed to update security credentials.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-[#D4AF37] selection:text-black font-sans pb-32">
            
            <header className="pt-16 pb-12 px-6 md:px-12 border-b border-white/5 bg-[#0a0a0a]">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-3xl md:text-5xl font-serif text-white tracking-tighter mb-3">
                        Brand <span className="italic text-[#D4AF37]">Settings</span>
                    </h1>
                    <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/40">
                        Manage your creator identity, 3D mannequin, and security protocols.
                    </p>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 md:px-12 pt-12 relative z-10 space-y-12">
                
                {successMsg && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold shadow-inner backdrop-blur-md">
                        <CheckCircle2 size={16} /> {successMsg}
                    </div>
                )}

                {errorMsg && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold shadow-inner backdrop-blur-md">
                        <AlertTriangle size={16} /> {errorMsg}
                    </div>
                )}

                <form onSubmit={handleProfileSubmit} className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/5 blur-[80px] pointer-events-none"></div>

                    <h3 className="text-[10px] uppercase tracking-[0.4em] text-white/50 font-black mb-8 flex items-center gap-2 border-b border-white/5 pb-4">
                        <User size={14} className="text-[#D4AF37]" /> Brand Configuration
                    </h3>

                    {/* AVATAR UPLOAD & 3D STUDIO SECTION */}
                    <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
                        <div className="relative group shrink-0">
                            <div className="w-32 h-32 rounded-3xl overflow-hidden bg-[#111] border border-white/10 group-hover:border-[#D4AF37]/50 transition-colors shadow-xl relative flex items-center justify-center">
                                {/* 🚀 FIXED: Strictly renders standard 2D <img> tags so nothing breaks */}
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={40} className="text-white/20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                )}
                            </div>
                            <button 
                                type="button"
                                onClick={() => fileInputRef.current.click()}
                                className="absolute -bottom-3 -right-3 w-10 h-10 bg-[#111] text-white/50 hover:text-white border border-white/10 rounded-full flex items-center justify-center transition-colors z-20"
                            >
                                <Camera size={16} />
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                        </div>
                        
                        <div className="text-center md:text-left flex-1">
                            <p className="text-sm font-serif text-white mb-1">Brand Insignia or 3D Mannequin</p>
                            <p className="text-[9px] uppercase tracking-widest text-white/40 mb-4 leading-relaxed">
                                Upload a standard logo, or generate a realistic 3D digital avatar to be used in your virtual fitting room.
                            </p>
                            
                            <button 
                                type="button"
                                onClick={() => setShowRpmModal(true)}
                                className="px-6 py-3 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 hover:bg-[#D4AF37] hover:text-black text-[9px] uppercase tracking-[0.2em] font-black rounded-xl transition-all shadow-inner flex items-center justify-center md:justify-start gap-2 w-full md:w-auto"
                            >
                                <Box size={14} /> Synthesize 3D Avatar
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-2">
                            <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 pl-2">Creator Name (Personal)</label>
                            <div className="relative">
                                <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                                <input type="text" name="full_name" value={form.full_name} onChange={handleInputChange} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-[#D4AF37]/50 transition-colors" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 pl-2">Brand / Company Name</label>
                            <div className="relative">
                                <Briefcase size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                                <input type="text" name="company_name" value={form.company_name} onChange={handleInputChange} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-[#D4AF37]/50 transition-colors" placeholder="e.g. Atelier Studios" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 mb-8">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 pl-2">Preferred Category</label>
                        <div className="relative">
                            <Tag size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                            <select name="preferred_category" value={form.preferred_category} onChange={handleInputChange} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-[11px] uppercase tracking-widest font-bold text-white outline-none focus:border-[#D4AF37]/50 transition-colors appearance-none cursor-pointer [color-scheme:dark]">
                                <option value="">Select Primary Aesthetic</option>
                                <option value="Streetwear">Streetwear</option>
                                <option value="Avant-Garde">Avant-Garde</option>
                                <option value="Minimalism">Minimalism</option>
                                <option value="High-Fashion">High-Fashion</option>
                                <option value="Techwear">Techwear</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2 mb-10">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 pl-2">Brand Guidelines Summary</label>
                        <div className="relative">
                            <AlignLeft size={14} className="absolute left-4 top-4 text-white/20" />
                            <textarea name="brand_guidelines_summary" value={form.brand_guidelines_summary} onChange={handleInputChange} placeholder="Define your brand's core rules, colors, and vision for designers to reference..." className="w-full bg-[#111] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-[#D4AF37]/50 transition-colors min-h-[120px] resize-none leading-relaxed" />
                        </div>
                    </div>

                    <div className="flex justify-end pt-6 border-t border-white/5">
                        <button type="submit" disabled={loading} className="px-8 py-3.5 bg-[#D4AF37] hover:bg-white text-black font-black text-[9px] uppercase tracking-[0.3em] rounded-full transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Commit Changes
                        </button>
                    </div>
                </form>

                <form onSubmit={handleSecuritySubmit} className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
                    <h3 className="text-[10px] uppercase tracking-[0.4em] text-rose-500/70 font-black mb-8 flex items-center gap-2 border-b border-white/5 pb-4">
                        <Lock size={14} className="text-rose-500" /> Security Protocols
                    </h3>

                    <div className="space-y-6 mb-10">
                        <div className="space-y-2">
                            <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 pl-2">Current Password</label>
                            <input type="password" name="currentPassword" value={passwordForm.currentPassword} onChange={handlePasswordChange} required className="w-full bg-[#111] border border-white/10 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-rose-500/50 transition-colors" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 pl-2">New Password</label>
                                <input type="password" name="newPassword" value={passwordForm.newPassword} onChange={handlePasswordChange} required className="w-full bg-[#111] border border-white/10 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-rose-500/50 transition-colors" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 pl-2">Confirm Password</label>
                                <input type="password" name="confirmPassword" value={passwordForm.confirmPassword} onChange={handlePasswordChange} required className="w-full bg-[#111] border border-white/10 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-rose-500/50 transition-colors" />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-6 border-t border-white/5">
                        <button type="submit" disabled={loading} className="px-8 py-3.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white font-black text-[9px] uppercase tracking-[0.3em] rounded-full transition-all border border-rose-500/20 flex items-center gap-2">
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Update Security
                        </button>
                    </div>
                </form>
            </main>

            {showRpmModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-5xl h-full max-h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col">
                        
                        <div className="flex justify-between items-center p-6 border-b border-white/5 absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent">
                            <h3 className="text-[10px] uppercase tracking-[0.4em] font-black text-[#D4AF37] flex items-center gap-2 shadow-black drop-shadow-md">
                                <Box size={14} /> Avatar Synthesizer
                            </h3>
                            <button 
                                onClick={() => setShowRpmModal(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 transition-colors backdrop-blur-md"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div ref={avaturnContainerRef} className="w-full h-full relative z-10 bg-[#111]"></div>
                        
                    </div>
                </div>
            )}
        </div>
    );
}