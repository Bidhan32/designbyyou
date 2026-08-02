import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { 
    Compass, Briefcase, Sliders, 
    LogOut, Wallet, Sparkles, User, Settings, ShoppingBag, Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
// 🚀 Import the ThemeToggle component
import ThemeToggle from '../components/ThemeToggle'; // Adjust path if needed

const CreatorLayout = () => {
    const { user, logout, loading } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
    
    // Ref to handle clicking outside of dropdown
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setProfileDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (loading) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#030303] relative overflow-hidden transition-colors duration-300">
                <div className="absolute inset-0 bg-[#D4AF37]/5 blur-[150px] rounded-full w-[40vw] h-[40vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
                <div className="relative z-10">
                    <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                    <div className="w-12 h-12 flex items-center justify-center text-slate-300 dark:text-white/20">
                        <Sparkles size={20} />
                    </div>
                </div>
            </div>
        );
    }

    if (!user || user.role !== 'creator') {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    const navigationItems = [
        { name: 'Showcase', path: '/creator/showcase', icon: Compass }, 
        { name: 'Directory', path: '/creator/directory', icon: Users },
        { name: 'Bookings', path: '/creator/bookings', icon: Briefcase },
        { name: 'Studio', path: '/creator/upload', icon: Sliders },
        { name: 'Sketch', path: '/creator/sketch', icon: Sliders }
    ];

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#030303] text-slate-900 dark:text-white font-sans antialiased selection:bg-[#D4AF37] selection:text-black transition-colors duration-300">
            
            {/* Cinematic Top Navigation Bar */}
            <header className="bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 sticky top-0 z-50 shadow-sm dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-colors duration-300">
                <div className="max-w-[1800px] mx-auto h-20 px-6 md:px-12 flex items-center justify-between">
                    
                    {/* Brand Identity */}
                    <Link to="/creator/showcase" className="flex items-center gap-3 group">
                        <div className="h-10 w-10 bg-slate-100 dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-center text-[#D4AF37] font-serif font-bold text-lg shadow-inner transition-colors group-hover:border-[#D4AF37]/50 group-hover:bg-[#D4AF37]/10">
                            D
                        </div>
                        <div className="leading-tight">
                            <span className="font-serif tracking-[0.15em] text-sm text-slate-900 dark:text-white block group-hover:text-[#D4AF37] transition-colors uppercase">DESIGNBYYOU</span>
                            <span className="text-[8px] uppercase tracking-[0.3em] font-black text-slate-500 dark:text-white/30 block transition-colors">Creator Hub</span>
                        </div>
                    </Link>

                    {/* Navigation - Premium Pill Track */}
                    <nav className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-[#111] p-1 rounded-full border border-slate-200 dark:border-white/5 shadow-inner transition-colors">
                        {navigationItems.map((item) => {
                            const isActive = location.pathname.startsWith(item.path);
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`px-5 py-2.5 rounded-full flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${
                                        isActive 
                                        ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-[0_0_15px_rgba(255,255,255,0.05)]' 
                                        : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    <item.icon size={12} className={isActive ? 'text-[#D4AF37]' : 'text-slate-400 dark:text-white/30'} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Profile Interaction Area */}
                    <div className="relative flex items-center gap-4" ref={dropdownRef}>
                        
                        {/* 🚀 THEME TOGGLE ADDED HERE */}
                        <ThemeToggle />

                        {/* Visual Subscription Indicator */}
                        {user.subscription_tier && user.subscription_tier !== 'free' && (
                            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/20">
                                <Sparkles size={10} className="text-[#D4AF37]" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-[#D4AF37]">Pro Tier</span>
                            </div>
                        )}

                        <button 
                            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)} 
                            className="h-10 w-10 rounded-full bg-slate-200 dark:bg-[#111] overflow-hidden border-2 border-slate-300 dark:border-white/10 transition-all hover:border-[#D4AF37]/50 cursor-pointer focus:outline-none shadow-inner"
                        >
                            <img 
                                src={user?.profile_image_url || "https://api.dicebear.com/7.x/bottts/svg?seed=creator"} 
                                alt="Avatar" 
                                className="w-full h-full object-cover"
                            />
                        </button>
                        
                        {profileDropdownOpen && (
                            <div className="absolute right-0 top-14 mt-2 w-56 bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                
                                <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 mb-2">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate transition-colors">{user?.full_name || 'Creator'}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-white/40 truncate transition-colors">{user?.email}</p>
                                </div>

                                <Link 
                                    to="/creator/profile" 
                                    onClick={() => setProfileDropdownOpen(false)}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors mb-1"
                                >
                                    <User size={14}/> View Profile
                                </Link>

                                <Link 
                                    to="/creator/settings" 
                                    onClick={() => setProfileDropdownOpen(false)}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors mb-1"
                                >
                                    <Settings size={14}/> Settings
                                </Link>

                                <Link 
                                    to="/creator/wallet" 
                                    onClick={() => setProfileDropdownOpen(false)}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors mb-2"
                                >
                                    <Wallet size={14}/> Wallet & Billing
                                </Link>

                                <div className="h-[1px] bg-slate-200 dark:bg-white/5 w-full mb-2" />

                                <button 
                                    onClick={handleLogout} 
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] font-black text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                                >
                                    <LogOut size={14}/> Secure Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="w-full relative z-10">
                <Outlet />
            </main>
        </div>
    );
};

export default CreatorLayout;