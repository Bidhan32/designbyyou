import React from 'react';
import { useAuth } from '../../context/AuthContext.helpers.js';
import { NavLink, useLocation } from 'react-router-dom';
import { 
    LayoutDashboard, 
    Users, 
    Settings, 
    LogOut, 
    ShieldCheck,
    ChevronRight
} from 'lucide-react';

const Sidebar = ({ closeSidebar }) => {
    const location = useLocation();
    const { logout } = useAuth();

    const menuItems = [
        { name: 'Overview', path: '/superadmin/dashboard', icon: <LayoutDashboard size={18} /> },
        { name: 'Designer approvals', path: '/superadmin/designer-approvals', icon: <ShieldCheck size={16} /> },
        { name: 'User Directory', path: '/superadmin/users', icon: <Users size={18} /> },
        { name: 'System Settings', path: '/superadmin/settings', icon: <Settings size={18} /> },
    ];

    const handleLogout = () => { void logout(); };

    const handleLinkClick = () => {
        if (window.innerWidth < 1024 && closeSidebar) {
            closeSidebar();
        }
    };

    return (
        <div className="h-full flex flex-col bg-surface text-ink border-r border-line">
            {/* Fixed Header in Sidebar */}
            <div className="p-4 flex-shrink-0">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-surface p-2 rounded-md">
                        <ShieldCheck size={22} className="text-ink" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[11px] font-semibold tracking-normal uppercase text-action">
                            Control Center
                        </span>
                        <h1 className="text-lg font-serif italic leading-none text-muted">DesignByYou</h1>
                    </div>
                </div>
                <div className="h-px w-full bg-surface" />
            </div>

            {/* Scrollable Navigation Area */}
            <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar-dark py-2">
                <p className="px-4 text-[10px] uppercase tracking-normal text-muted font-bold mb-4">
                    Management
                </p>
                
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={handleLinkClick}
                        className={({ isActive }) => `
                            flex items-center justify-between px-4 py-3.5 rounded-md transition-all duration-300 group
                            ${isActive 
                                ? 'bg-surface text-ink font-bold'
                                : 'text-muted hover:bg-subtle hover:text-ink'}
                        `}
                    >
                        <div className="flex items-center gap-3.5">
                            <span className={`transition-colors duration-300 ${location.pathname === item.path ? 'text-ink' : 'text-action'}`}>
                                {item.icon}
                            </span>
                            <span className="text-sm tracking-tight">{item.name}</span>
                        </div>
                        <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-all ${location.pathname === item.path ? 'text-muted' : 'text-muted'}`} />
                    </NavLink>
                ))}
            </nav>

            {/* Fixed Bottom Section */}
            <div className="p-4 flex-shrink-0">
                <div className="bg-surface p-4 rounded-md border border-line">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="relative">
                            <div className="w-11 h-11 rounded-md bg-surface flex items-center justify-center text-action font-bold border border-line">
                                SA
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-action border-4 border-line rounded-full text-on-action"></div>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-ink tracking-tight">Super Admin</p>
                            <p className="text-[10px] text-muted font-medium">Session: Encrypted</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-subtle hover:bg-action text-action hover:text-on-action rounded-md transition-all duration-300 text-[10px] font-semibold uppercase tracking-[0.15em] border border-line"
                    >
                        <LogOut size={14} /> Terminate Session
                    </button>
                </div>
                <p className="text-center mt-4 text-[11px] text-ink font-medium uppercase tracking-widest">
                    v3.1.2 Build Final
                </p>
            </div>
        </div>
    );
};

export default Sidebar;
