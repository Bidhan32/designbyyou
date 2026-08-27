import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
    LayoutDashboard, 
    Users, 
    Settings, 
    LogOut, 
    ShieldCheck,
    ChevronRight
} from 'lucide-react';

const Sidebar = ({ closeSidebar }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { name: 'Overview', path: '/superadmin/dashboard', icon: <LayoutDashboard size={18} /> },
        { name: 'User Directory', path: '/superadmin/users', icon: <Users size={18} /> },
        { name: 'System Settings', path: '/superadmin/settings', icon: <Settings size={18} /> },
    ];

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.clear();
        window.location.replace('/login');
    };

    const handleLinkClick = () => {
        if (window.innerWidth < 1024 && closeSidebar) {
            closeSidebar();
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#0F0F0F] text-white border-r border-white/5">
            {/* Fixed Header in Sidebar */}
            <div className="p-8 flex-shrink-0">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-gradient-to-br from-[#D4AF37] to-[#AA8A2E] p-2 rounded-xl shadow-lg shadow-[#D4AF37]/10">
                        <ShieldCheck size={22} className="text-black" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black tracking-[0.3em] uppercase text-[#D4AF37]">
                            Control Center
                        </span>
                        <h1 className="text-lg font-serif italic leading-none text-white/90">DesignByYou</h1>
                    </div>
                </div>
                <div className="h-px w-full bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
            </div>

            {/* Scrollable Navigation Area */}
            <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar-dark py-2">
                <p className="px-4 text-[10px] uppercase tracking-[0.2em] text-gray-600 font-bold mb-4">
                    Management
                </p>
                
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={handleLinkClick}
                        className={({ isActive }) => `
                            flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 group
                            ${isActive 
                                ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8962E] text-black font-bold shadow-xl shadow-[#D4AF37]/10' 
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'}
                        `}
                    >
                        <div className="flex items-center gap-3.5">
                            <span className={`transition-colors duration-300 ${location.pathname === item.path ? 'text-black' : 'text-[#D4AF37]'}`}>
                                {item.icon}
                            </span>
                            <span className="text-sm tracking-tight">{item.name}</span>
                        </div>
                        <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-all ${location.pathname === item.path ? 'text-black/50' : 'text-white/20'}`} />
                    </NavLink>
                ))}
            </nav>

            {/* Fixed Bottom Section */}
            <div className="p-4 flex-shrink-0">
                <div className="bg-gradient-to-b from-white/[0.03] to-transparent p-5 rounded-[2rem] border border-white/5 backdrop-blur-md">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="relative">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center text-[#D4AF37] font-bold border border-white/10">
                                SA
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-4 border-[#0F0F0F] rounded-full"></div>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-white tracking-tight">Super Admin</p>
                            <p className="text-[10px] text-gray-500 font-medium">Session: Encrypted</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all duration-300 text-[10px] font-black uppercase tracking-[0.15em] border border-red-500/10"
                    >
                        <LogOut size={14} /> Terminate Session
                    </button>
                </div>
                <p className="text-center mt-4 text-[9px] text-gray-700 font-medium uppercase tracking-widest">
                    v3.1.2 Build Final
                </p>
            </div>
        </div>
    );
};

export default Sidebar;