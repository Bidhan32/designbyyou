import React, { useState, useEffect } from 'react';
import { Users, ShieldAlert, Activity, HardDrive, UserCheck, ChevronRight } from 'lucide-react';
import API from '../../api/axios';

const SuperAdminDashboard = () => {
    const [stats, setStats] = useState(null);
    const [maintenance, setMaintenance] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [statsRes, analyticRes] = await Promise.all([
                API.get('/superadmin/dashboard-stats'),
                API.get('/superadmin/analytics')
            ]);
            setStats(statsRes.data);
            setMaintenance(analyticRes.data.data.maintenance_status === 'true');
        } catch (err) {
            console.error("Error fetching admin data", err);
        } finally {
            setLoading(false);
        }
    };

    const toggleMaintenance = async () => {
        const newMode = !maintenance;
        try {
            await API.post('/superadmin/toggle-maintenance', { mode: newMode });
            setMaintenance(newMode);
        } catch (err) {
            alert("Failed to toggle maintenance mode");
        }
    };

    if (loading) return <div className="p-10 text-gray-400 uppercase tracking-widest text-xs">Initializing Terminal...</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-10">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-serif italic text-gray-900">Platform Overview</h1>
                    <p className="text-gray-400 text-sm">System Authority: Superadmin</p>
                </div>
                
                {/* Maintenance Toggle */}
                <button 
                    onClick={toggleMaintenance}
                    className={`px-6 py-3 rounded-xl border flex items-center gap-3 transition-all ${
                        maintenance 
                        ? 'bg-red-50 border-red-200 text-red-600' 
                        : 'bg-white border-gray-200 text-gray-600 hover:border-black'
                    }`}
                >
                    <ShieldAlert size={18} />
                    <span className="text-xs font-bold uppercase tracking-widest">
                        {maintenance ? 'Maintenance: ON' : 'System: Live'}
                    </span>
                </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard icon={<Activity className="text-green-500"/>} label="Online Now" value={stats?.online_users} color="green" />
                <StatCard icon={<UserCheck className="text-[#D4AF37]"/>} label="Pending Designers" value={stats?.pending_designers} color="gold" />
                <StatCard icon={<Users className="text-blue-500"/>} label="Total Creators" value={stats?.user_distribution.find(u => u.role === 'creator')?.count || 0} color="blue" />
                <StatCard icon={<HardDrive className="text-purple-500"/>} label="Total Designers" value={stats?.user_distribution.find(u => u.role === 'designer')?.count || 0} color="purple" />
            </div>

            {/* User Distribution Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 uppercase tracking-tighter">User Role Distribution</h3>
                    <button className="text-[#D4AF37] text-xs font-bold flex items-center gap-1 hover:underline">
                        VIEW ALL USERS <ChevronRight size={14}/>
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 text-[10px] uppercase tracking-[0.2em] text-gray-400">
                                <th className="px-8 py-4">Role</th>
                                <th className="px-8 py-4">Population</th>
                                <th className="px-8 py-4">System Priority</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {stats?.user_distribution.map((item, index) => (
                                <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-8 py-5 text-sm font-bold text-gray-700 capitalize">{item.role}</td>
                                    <td className="px-8 py-5 text-sm text-gray-500">{item.count} members</td>
                                    <td className="px-8 py-5">
                                        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-[#D4AF37]" 
                                                style={{ width: `${(item.count / 100) * 100}%` }}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ icon, label, value, color }) => (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex justify-between items-start">
            <div className="p-3 bg-gray-50 rounded-2xl">{icon}</div>
        </div>
        <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">{label}</p>
            <h4 className="text-3xl font-serif">{value}</h4>
        </div>
    </div>
);

export default SuperAdminDashboard;