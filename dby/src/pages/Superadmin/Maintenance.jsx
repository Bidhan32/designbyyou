import React from 'react';
import { Hammer, Clock, Instagram, Twitter } from 'lucide-react';

const MaintenancePage = () => {
    return (
        <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center p-6 text-center">
            {/* Logo area */}
            <div className="mb-12">
                <h1 className="text-4xl md:text-6xl font-serif italic text-white tracking-tighter">
                    DesignByYou
                </h1>
                <div className="h-px w-24 bg-[#D4AF37] mx-auto mt-4"></div>
            </div>

            {/* Main Content */}
            <div className="max-w-md space-y-6">
                <h2 className="text-[#D4AF37] text-xs font-bold uppercase tracking-[0.4em]">
                    System Refinement in Progress
                </h2>
                <p className="text-gray-400 font-light leading-relaxed">
                    We are currently curated our digital atelier to provide you with a superior fashion experience. 
                    The platform will be live shortly.
                </p>
            </div>

            {/* Visual Element */}
            <div className="my-12 flex items-center gap-4 text-white/20">
                <div className="h-[1px] w-12 bg-white/10"></div>
                <Clock size={20} className="animate-pulse" />
                <div className="h-[1px] w-12 bg-white/10"></div>
            </div>

            {/* Footer / Social Links */}
            <div className="fixed bottom-12 space-y-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">
                    Follow the transformation
                </p>
                <div className="flex justify-center gap-6 text-gray-400">
                    <a href="#" className="hover:text-[#D4AF37] transition-colors"><Instagram size={18} /></a>
                    <a href="#" className="hover:text-[#D4AF37] transition-colors"><Twitter size={18} /></a>
                </div>
            </div>
        </div>
    );
};

export default MaintenancePage;