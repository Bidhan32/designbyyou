import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; 
import { CalendarDays, Settings, User, LogOut, Menu, X, Compass } from 'lucide-react'; 
// 🚀 Import the ThemeToggle component you created earlier
import ThemeToggle from './ThemeToggle'; // Adjust this path if your components folder is located elsewhere

const Navbar = () => {
    const { user, logout } = useAuth();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [imageError, setImageError] = useState(false);
    
    const dropdownRef = useRef(null);

    useEffect(() => {
        setImageError(false);
    }, [user]);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };
        if (dropdownOpen) {
            document.addEventListener('mousedown', handleOutsideClick);
        }
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [dropdownOpen]);

    const resolveImageSrc = (path) => {
        if (!path) return null;
        if (path.includes('localhost:5000') || path.includes('localhost:8000')) {
            return path.replace(':5000', ':8080').replace(':8000', ':8080').replace(/\\/g, '/');
        }
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        
        const BACKEND_URL = "http://localhost:8080"; 
        return `${BACKEND_URL}/${path.replace(/\\/g, '/')}`;
    };

    const getInitials = (name) => {
        if (!name) return '??';
        return name
            .split(' ')
            .map((word) => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const rawImagePath = user?.profile_image_url || user?.profileImageUrl || user?.profile_image;
    const profileImage = !imageError && rawImagePath ? resolveImageSrc(rawImagePath) : null;

    return (
        <nav className="bg-white/80 dark:bg-[#030303]/80 backdrop-blur-2xl border-b border-slate-200 dark:border-white/5 sticky top-0 z-50 h-20 shadow-sm dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)] select-none antialiased transition-colors duration-300">
            <div className="max-w-[1600px] mx-auto px-6 md:px-12 h-full flex items-center justify-between">
                
                {/* Brand Monolith Core */}
                <div className="flex items-center gap-10">
                    <Link to="/designer/explore" className="flex items-center gap-3 group">
                        <div className="h-8 w-8 bg-[#D4AF37] rounded-sm flex items-center justify-center font-black text-black text-xs tracking-tighter group-hover:scale-105 group-hover:shadow-[0_0_15px_rgba(212,175,55,0.4)] transition-all duration-300">
                            D
                        </div>
                        <span className="font-serif font-light text-slate-900 dark:text-white text-lg tracking-[0.2em] uppercase group-hover:text-[#D4AF37] transition-colors">
                            DesignBy<span className="font-bold">You</span>
                        </span>
                    </Link>

                    {/* Navigation Directives Container */}
                    <div className="hidden md:flex items-center gap-2 mt-1">
                        <NavLink 
                            to="/designer/explore" 
                            className={({ isActive }) => `flex items-center gap-1.5 px-4 py-2 text-[9px] font-bold uppercase tracking-[0.3em] rounded-full transition-all duration-300 ${
                                isActive ? 'text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30' : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                        >
                            <Compass size={12} /> The Exhibition
                        </NavLink>
                    </div>
                </div>

                {/* Right Context System Actions */}
                <div className="hidden md:flex items-center gap-6">
                    {user ? (
                        <div className="flex items-center gap-6">
                            
                            <Link to="/designer/dashboard" className="px-5 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-[#D4AF37] dark:hover:bg-[#D4AF37] border border-slate-200 dark:border-white/10 hover:border-[#D4AF37] text-slate-900 dark:text-white hover:text-black dark:hover:text-black font-bold text-[9px] uppercase tracking-[0.3em] rounded-full transition-all duration-500 shadow-sm hover:shadow-lg dark:shadow-none dark:hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                                Studio Workspace
                            </Link>

                            {/* 🚀 THEME TOGGLE (DESKTOP) */}
                            <ThemeToggle />

                            {/* Self-Governing Context Dropdown */}
                            <div className="relative" ref={dropdownRef}>
                                <button 
                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                    className="flex items-center gap-3 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-all border border-transparent hover:border-slate-200 dark:hover:border-white/10 cursor-pointer group"
                                >
                                    {profileImage ? (
                                        <img 
                                            src={profileImage} 
                                            alt={user?.full_name || "Profile"} 
                                            onError={() => setImageError(true)}
                                            className="h-8 w-8 rounded-full object-cover bg-slate-200 dark:bg-[#111] border border-slate-300 dark:border-white/20 group-hover:border-[#D4AF37] dark:group-hover:border-[#D4AF37] transition-colors"
                                        />
                                    ) : (
                                        <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[#D4AF37] flex items-center justify-center text-[10px] font-black tracking-wide group-hover:border-[#D4AF37] transition-colors">
                                            {getInitials(user?.full_name)}
                                        </div>
                                    )}
                                    <div className="hidden lg:flex flex-col items-start mr-2">
                                        <span className="text-[11px] font-bold text-slate-900 dark:text-white tracking-widest max-w-[100px] truncate group-hover:text-[#D4AF37] transition-colors">
                                            {user?.full_name}
                                        </span>
                                    </div>
                                    <span className={`text-slate-400 dark:text-white/40 text-[8px] hidden lg:inline transition-transform duration-300 ${dropdownOpen ? 'rotate-180 text-[#D4AF37]' : ''}`}>▼</span>
                                </button>

                                {dropdownOpen && (
                                    <div className="absolute right-0 mt-3 w-64 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 mb-2 bg-gradient-to-b from-slate-50 dark:from-white/5 to-transparent">
                                            <p className="text-sm font-serif text-slate-900 dark:text-white truncate">{user?.full_name}</p>
                                            <p className="text-[10px] font-mono text-slate-500 dark:text-white/40 truncate mt-1">{user?.email}</p>
                                        </div>
                                        
                                        <Link to="/designer/profile-view" onClick={() => setDropdownOpen(false)} className="flex items-center gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors">
                                            <User size={14} className="text-[#D4AF37]" /> Public Profile
                                        </Link>

                                        <Link to="/designer/bookings" onClick={() => setDropdownOpen(false)} className="flex items-center gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors">
                                            <CalendarDays size={14} className="text-[#D4AF37]" /> Collaboration Bookings
                                        </Link>

                                        <Link to="/designer/profile-settings" onClick={() => setDropdownOpen(false)} className="flex items-center gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors">
                                            <Settings size={14} className="text-[#D4AF37]" /> Node Settings
                                        </Link>
                                        
                                        <div className="border-t border-slate-100 dark:border-white/5 mt-2 pt-2">
                                            <button 
                                                onClick={() => { setDropdownOpen(false); logout(); }}
                                                className="w-full flex items-center gap-3 text-left px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer transition-colors rounded-b-xl"
                                            >
                                                <LogOut size={14} /> Disconnect Session
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            {/* 🚀 THEME TOGGLE (DESKTOP - NOT LOGGED IN) */}
                            <ThemeToggle />
                            
                            <Link to="/login" className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors">
                                Sign In
                            </Link>
                            <Link to="/register" className="px-5 py-2.5 bg-[#D4AF37] hover:bg-slate-900 dark:hover:bg-white text-black hover:text-white dark:hover:text-black font-bold text-[10px] uppercase tracking-[0.3em] rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.2)] hover:shadow-[0_0_25px_rgba(212,175,55,0.6)] dark:hover:shadow-[0_0_25px_rgba(255,255,255,0.6)]">
                                Get Started
                            </Link>
                        </div>
                    )}
                </div>

                {/* Mobile Responsive Structural Triggers */}
                <div className="flex items-center gap-4 md:hidden">
                    {/* 🚀 THEME TOGGLE (MOBILE) */}
                    <ThemeToggle />
                    
                    <button 
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 rounded-full text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 cursor-pointer transition-colors"
                    >
                        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
            </div>

            {/* Mobile Drawer Overlay Context */}
            {mobileMenuOpen && (
                <div className="md:hidden border-b border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xl px-6 py-6 space-y-4 shadow-xl dark:shadow-2xl absolute w-full left-0 top-20 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    {user && (
                        <div className="flex items-center gap-4 px-4 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl mb-4">
                            {profileImage ? (
                                <img 
                                    src={profileImage} 
                                    alt={user?.full_name || "Profile"} 
                                    onError={() => setImageError(true)}
                                    className="h-10 w-10 rounded-full object-cover bg-slate-200 dark:bg-[#111] border border-slate-300 dark:border-white/20"
                                />
                            ) : (
                                <div className="h-10 w-10 rounded-full bg-white dark:bg-white/5 border border-[#D4AF37]/50 text-[#D4AF37] flex items-center justify-center text-xs font-black tracking-wide shadow-sm">
                                    {getInitials(user?.full_name)}
                                </div>
                            )}
                            <div className="truncate">
                                <p className="text-sm font-serif text-slate-900 dark:text-white truncate">{user?.full_name}</p>
                                <p className="text-[10px] font-mono text-slate-500 dark:text-white/40 truncate">{user?.email}</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Link to="/designer/showcase" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600 dark:text-white/60 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 hover:text-[#D4AF37] dark:hover:text-[#D4AF37] transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/5">
                            Design Showcase
                        </Link>
                        
                        {user ? (
                            <>
                                <Link to="/designer/dashboard" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-black bg-[#D4AF37] rounded-xl shadow-md mt-2">
                                    Studio Workspace
                                </Link>

                                <Link to="/designer/bookings" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600 dark:text-white/60 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 hover:text-[#D4AF37] dark:hover:text-[#D4AF37] transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/5">
                                    Collaboration Bookings
                                </Link>

                                <Link to="/designer/profile-view" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600 dark:text-white/60 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 hover:text-[#D4AF37] dark:hover:text-[#D4AF37] transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/5">
                                    Public Profile
                                </Link>
                                
                                <Link to="/designer/profile-settings" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600 dark:text-white/60 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 hover:text-[#D4AF37] dark:hover:text-[#D4AF37] transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/5">
                                    Node Settings
                                </Link>
                                
                                <div className="pt-4 mt-4 border-t border-slate-200 dark:border-white/10">
                                    <button onClick={() => { setMobileMenuOpen(false); logout(); }} className="w-full text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-rose-500 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer transition-colors">
                                        Disconnect Session
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.3em] border border-slate-300 dark:border-white/20 rounded-xl text-slate-600 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors">
                                    Sign In
                                </Link>
                                <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.3em] bg-[#D4AF37] text-black rounded-xl hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors shadow-sm">
                                    Sign Up
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Navbar;