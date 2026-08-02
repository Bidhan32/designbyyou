import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
    return (
        <footer className="bg-white dark:bg-[#030303] border-t border-slate-200 dark:border-white/5 py-12 mt-auto relative overflow-hidden z-10 transition-colors duration-300">
            {/* Subtle Ethereal Bottom Glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37]/20 to-transparent"></div>
            
            <div className="max-w-[1600px] mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-8">
                
                {/* Copyright / Identification Area */}
                <div className="text-center md:text-left flex flex-col gap-2">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-[0.3em] transition-colors duration-300">
                        © 2026 MARKETPLACE PLATFORM INC.
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-white/40 uppercase tracking-widest font-medium transition-colors duration-300">
                        High-fidelity distribution infrastructure network for digital designers.
                    </p>
                </div>

                {/* Micro Footer Directory Anchor Navigation */}
                <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-white/40 transition-colors duration-300">
                    <Link to="/designer/explore" className="hover:text-[#D4AF37] dark:hover:text-[#D4AF37] transition-colors duration-300">
                        Catalog Explore
                    </Link>
                    <span className="text-slate-300 dark:text-white/10 hidden sm:inline transition-colors duration-300">•</span>
                    <a href="#terms" className="hover:text-[#D4AF37] dark:hover:text-[#D4AF37] transition-colors duration-300">
                        Licensing Terms
                    </a>
                    <span className="text-slate-300 dark:text-white/10 hidden sm:inline transition-colors duration-300">•</span>
                    <a href="#privacy" className="hover:text-[#D4AF37] dark:hover:text-[#D4AF37] transition-colors duration-300">
                        Security Protocols
                    </a>
                </div>
                
            </div>
        </footer>
    );
};

export default Footer;