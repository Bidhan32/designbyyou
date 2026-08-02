import React from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar'; 
import Footer from '../components/Footer'; 
import { Loader2 } from 'lucide-react';

/**
 * Enterprise Production Designer Layout Perimeter Gate
 * Enforces role authentication routing, prevents CLS layout structural displacement,
 * and maintains the unified luxury branding across all nested studio modules.
 */
const DesignerLayout = () => {
    const { user, loading } = useAuth();

    // Shared premium workspace navigation nodes matching your peer collaboration matrix
    const workspaceLinks = [
        { path: '/designer/dashboard', label: 'Workspace Hub' },
        { path: '/designer/inventory', label: 'Portfolio Showcase' }, 
        { path: '/designer/bookings', label: 'Client Bookings' },
        { path: '/designer/wallet', label: 'Financial Wallet' },
        { path: '/designer/upload', label: 'Upload Module' },
        { path: '/designer/sketch', label: 'Studio Sketch' },
    ];

    // ─── PROTECTION GATE 1: PREVENT STATE FLASHES ────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center bg-slate-50 dark:bg-[#030303] min-h-screen space-y-6 transition-colors duration-300">
                <div className="relative">
                    <div className="absolute inset-0 border-t-2 border-[#D4AF37] rounded-full animate-spin"></div>
                    <Loader2 className="animate-spin text-slate-300 dark:text-white/20" size={40} />
                </div>
                <span className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] font-bold select-none animate-pulse">Verifying Studio Authority...</span>
            </div>
        );
    }

    // ─── PROTECTION GATE 2: ENFORCE ROLE PERIMETERS ──────────────────────
    if (!user || user.role?.toLowerCase() !== 'designer') {
        return (
            <div className="flex flex-col justify-center items-center bg-slate-50 dark:bg-[#030303] min-h-screen text-center p-6 antialiased selection:bg-[#D4AF37] selection:text-black transition-colors duration-300">
                <h2 className="text-3xl md:text-5xl font-serif font-light text-slate-900 dark:text-white tracking-tighter mb-4">Access <span className="italic text-[#D4AF37]">Restricted</span></h2>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/40 max-w-sm mb-8 leading-relaxed">
                    This digital terminal environment is strictly configured for registered studio designers.
                </p>
                <Link 
                    to="/" 
                    className="px-6 py-3 bg-[#D4AF37] text-black text-[10px] font-bold uppercase tracking-[0.3em] rounded-full hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-black hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] transition-all duration-300"
                >
                    Return to Exhibition
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#030303] text-slate-900 dark:text-white selection:bg-[#D4AF37] selection:text-black antialiased relative transition-colors duration-300">
            
            {/* 1. Global Site Navigation Interface */}
            <Navbar />

            {/* 2. Premium Sub-Navigation Dock 
                Note: top-20 perfectly offsets the 80px (h-20) height of your new Navbar 
            */}
            <div className="bg-white/80 dark:bg-[#030303]/80 backdrop-blur-2xl border-b border-slate-200 dark:border-white/5 sticky top-20 z-40 shadow-sm dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)] transition-colors duration-300">
                <div className="max-w-[1600px] mx-auto px-6 md:px-12 flex items-center justify-between h-14">
                    <div className="flex items-center gap-4 w-full md:w-auto overflow-hidden">
                        <span className="hidden lg:inline-block text-[9px] font-black tracking-[0.3em] text-slate-400 dark:text-white/30 uppercase border-r border-slate-200 dark:border-white/10 pr-5 mr-2 shrink-0 select-none transition-colors">
                            Studio Panel
                        </span>
                        
                        {/* Mobile Defensively Padded Navigation Track */}
                        <nav className="flex items-center gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide py-2 w-full md:w-auto pr-4">
                            {workspaceLinks.map((link) => (
                                <NavLink
                                    key={link.path}
                                    to={link.path}
                                    className={({ isActive }) =>
                                        `px-4 py-2 rounded-full text-[9px] font-bold uppercase tracking-[0.2em] transition-all duration-300 shrink-0 select-none ${
                                            isActive
                                                ? 'bg-slate-50 dark:bg-white/5 text-[#D4AF37] border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]'
                                                : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white border border-transparent hover:border-slate-200 dark:hover:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
                                        }`
                                    }
                                >
                                    {link.label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>

                    {/* Operational Node Signal Tag */}
                    <div className="hidden xl:flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-[#D4AF37] bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 border border-[#D4AF37]/20 px-3 py-1.5 rounded-full shrink-0 select-none shadow-[0_0_10px_rgba(212,175,55,0.05)] dark:shadow-[0_0_10px_rgba(212,175,55,0.1)] transition-colors">
                        <span className="h-1.5 w-1.5 bg-[#D4AF37] rounded-full animate-pulse shadow-[0_0_5px_rgba(212,175,55,0.8)]"></span>
                        Secure Studio Feed
                    </div>
                </div>
            </div>

            {/* 3. Managed Content Injection Area */}
            <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 md:p-12 min-h-[calc(100vh-220px)] relative z-10">
                <Outlet />
            </main>

            {/* 4. Global Site System Footer */}
            <Footer />
        </div>
    );
};

export default DesignerLayout;