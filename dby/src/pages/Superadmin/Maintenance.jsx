import React from 'react';
import { Hammer, Clock, Instagram, Twitter } from 'lucide-react';

const MaintenancePage = () => {
    return (
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 text-center">
            {/* Logo area */}
            <div className="mb-12">
                <h1 className="text-4xl md:text-6xl font-serif italic text-ink tracking-tighter">
                    DesignByYou
                </h1>
                <div className="h-px w-24 bg-action mx-auto mt-4 text-on-action"></div>
            </div>

            {/* Main Content */}
            <div className="max-w-md space-y-6">
                <h2 className="text-action text-xs font-bold uppercase tracking-normal">
                    System Refinement in Progress
                </h2>
                <p className="text-muted font-light leading-relaxed">
                    We are currently curated our digital atelier to provide you with a superior fashion experience. 
                    The platform will be live shortly.
                </p>
            </div>

            {/* Visual Element */}
            <div className="my-12 flex items-center gap-4 text-muted">
                <div className="h-[1px] w-12 bg-subtle"></div>
                <Clock size={20} className="animate-pulse" />
                <div className="h-[1px] w-12 bg-subtle"></div>
            </div>

            {/* Footer / Social Links */}
            <div className="fixed bottom-12 space-y-4">
                <p className="text-[10px] text-muted uppercase tracking-widest font-bold">
                    Follow the transformation
                </p>
                <div className="flex justify-center gap-6 text-muted">
                    <a href="#" className="hover:text-action transition-colors"><Instagram size={18} /></a>
                    <a href="#" className="hover:text-action transition-colors"><Twitter size={18} /></a>
                </div>
            </div>
        </div>
    );
};

export default MaintenancePage;