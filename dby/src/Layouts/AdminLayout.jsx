// 1. Added useEffect to the imports
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Sidebar from '../pages/Superadmin/Sidebar';

const AdminLayout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();
    
    useEffect(() => {
        const verifySession = () => {
            const token = localStorage.getItem('token');
            if (!token) {
                // Using .replace ensures they can't "Back" into the dashboard
                window.location.replace('/login');
            }
        };

        // Run check immediately on mount
        verifySession();

        // Check every time the user focuses the window (tabs back to the app)
        window.addEventListener('focus', verifySession);
        // Check if storage changes (logout in another tab)
        window.addEventListener('storage', verifySession);

        return () => {
            window.removeEventListener('focus', verifySession);
            window.removeEventListener('storage', verifySession);
        };
    }, []);

    // Clean up page name for the header
    const pageName = location.pathname.split('/').pop().replace(/-/g, ' ');

    return (
        <div className="flex bg-[#FDFDFD] h-screen overflow-hidden relative">
            {/* Overlay for mobile */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-72 bg-[#0F0F0F] transform transition-transform duration-300 ease-in-out
                lg:translate-x-0 lg:static lg:block h-full
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <Sidebar closeSidebar={() => setIsSidebarOpen(false)} />
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
                
                {/* Header */}
                <header className="h-20 border-b border-gray-100 bg-white/80 backdrop-blur-md flex-shrink-0 px-4 md:px-8 flex items-center justify-between z-30">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 hover:bg-gray-100 rounded-xl lg:hidden transition-colors"
                        >
                            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>

                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Portal / Control</span>
                            <span className="text-sm md:text-base text-black font-bold uppercase tracking-tighter truncate max-w-[150px] md:max-w-none">
                                {pageName || 'Secure Session'}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 md:gap-6">
                        <div className="hidden sm:flex flex-col items-end border-r border-gray-100 pr-4 md:pr-6">
                            <span className="text-[10px] font-bold text-green-500 uppercase flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                System Optimal
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium">Node: FRA-01</span>
                        </div>
                        
                        <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-[10px] font-bold">
                            SA
                        </div>
                    </div>
                </header>

                {/* Scrollable Content Section */}
                <div className="flex-1 overflow-y-auto bg-[#FDFDFD] custom-scrollbar">
                    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;