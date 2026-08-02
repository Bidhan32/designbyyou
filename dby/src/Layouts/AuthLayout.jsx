import React from 'react';
import { Briefcase } from 'lucide-react';

const AuthLayout = ({ children, title, subtitle, step }) => {
    return (
        <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden">
                
                {/* Fixed Visual Side */}
                <div className="hidden lg:flex lg:col-span-5 bg-[#1A1A1A] relative flex-col justify-between p-12 text-white overflow-hidden">
                    <div className="absolute inset-0 z-0">
                        <img 
                            // Updated high-reliability fashion image link
                            src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1200" 
                            alt="Fashion Background" 
                            className="w-full h-full object-cover object-center opacity-50"
                            loading="eager"
                        />
                        {/* Gradient Overlay for better text readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    </div>

                    <div className="relative z-10">
                        <h1 className="text-xl font-bold tracking-[0.4em] uppercase text-[#D4AF37] mb-20">DesignByYou</h1>
                        <h2 className="text-4xl font-serif leading-tight mb-6 italic">Redefining the Couture Standard.</h2>
                        <p className="text-gray-400 font-light max-w-xs">Join the exclusive network of high-fashion creators.</p>
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-4 group">
                            <div className="p-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                                <Briefcase size={20} className="text-[#D4AF37]"/>
                            </div>
                            <span className="text-sm tracking-wide font-medium">Verified Artist Status</span>
                        </div>
                    </div>
                </div>

                {/* Dynamic Content Side */}
                <div className="lg:col-span-7 p-6 sm:p-10 lg:p-16">
                    <div className="flex justify-between items-start mb-10">
                        <div className="max-w-[70%]">
                            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
                            <p className="text-gray-400 text-sm mt-1">{subtitle}</p>
                        </div>
                        {step && (
                            <div className="text-right hidden sm:block">
                                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Step {step}</p>
                                <p className="text-xs font-bold text-[#D4AF37]">Identity Setup</p>
                            </div>
                        )}
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;