import React, { useState, useEffect } from 'react';
import { 
    ShieldAlert, Globe, Server, Save, RefreshCw, 
    Database, DollarSign, Download, Trash2 
} from 'lucide-react';
import API from '../../api/axios';

const SystemSettings = () => {
    const [maintenance, setMaintenance] = useState(false);
    const [commission, setCommission] = useState(10);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await API.get('/superadmin/analytics');
            // Assuming your backend returns these values
            setMaintenance(res.data.data.maintenance_status === 'true');
            setCommission(res.data.data.commission_rate || 10);
        } catch (err) {
            console.error("Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    const handleMaintenanceToggle = async () => {
        const confirmMsg = maintenance 
            ? "Switching to LIVE mode. Users will be able to access the platform. Continue?" 
            : "Switching to MAINTENANCE mode. All non-admin users will be locked out. Continue?";

        if (!window.confirm(confirmMsg)) return;

        setSaving(true);
        try {
            await API.post('/superadmin/toggle-maintenance', { mode: !maintenance });
            setMaintenance(!maintenance);
        } catch (err) {
            alert("Failed to update system mode");
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateCommission = async () => {
        setSaving(true);
        try {
            await API.patch('/superadmin/update-commission', { rate: commission });
            alert("Commission rate updated successfully");
        } catch (err) {
            alert("Failed to update commission");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-10 text-gray-400 animate-pulse">Loading System Config...</div>;

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8 pb-20">
            <header>
                <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-tighter">System Configuration</h1>
                <p className="text-gray-400 text-sm">Global overrides and platform state management.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Maintenance Mode Card (Full Width) */}
                <div className={`md:col-span-2 p-8 rounded-3xl border transition-all ${
                    maintenance ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100 shadow-sm'
                }`}>
                    <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                            <div className={`p-3 rounded-2xl ${maintenance ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                <ShieldAlert size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Maintenance Mode</h3>
                                <p className="text-sm text-gray-500 max-w-md mt-1">
                                    Stop all public traffic. Only Superadmins can bypass this screen.
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={handleMaintenanceToggle}
                            disabled={saving}
                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                                maintenance ? 'bg-red-600' : 'bg-gray-200'
                            }`}
                        >
                            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                                maintenance ? 'translate-x-7' : 'translate-x-1'
                            }`} />
                        </button>
                    </div>
                </div>

                {/* 2. Financial Controls */}
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-6">
                            <DollarSign size={18} className="text-[#D4AF37]" />
                            <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest">Financial Controls</h3>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Platform Commission (%)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    value={commission}
                                    onChange={(e) => setCommission(e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-transparent rounded-xl focus:border-[#D4AF37] outline-none text-sm transition-all font-mono"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">%</span>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleUpdateCommission}
                        className="mt-6 w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all"
                    >
                        Update Commission
                    </button>
                </div>

                {/* 3. General Metadata */}
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-2">
                        <Globe size={18} className="text-[#D4AF37]" />
                        <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest">General Settings</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Platform Name</label>
                            <input type="text" defaultValue="DesignByYou" className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Concierge Email</label>
                            <input type="email" defaultValue="admin@dby.com" className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm" />
                        </div>
                    </div>
                </div>

                {/* 4. Infrastructure Status */}
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm md:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Server size={18} className="text-green-500" />
                            <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest">Infrastructure</h3>
                        </div>
                        <span className="text-[10px] font-black text-green-500 uppercase px-2 py-1 bg-green-50 rounded-lg">Operational</span>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                        <div className="flex justify-between items-center py-3 border-b border-gray-50">
                            <div className="flex items-center gap-3">
                                <Database size={14} className="text-gray-400" />
                                <span className="text-sm font-medium">PostgreSQL Database</span>
                            </div>
                            <span className="text-xs text-gray-400 font-mono">v14.5 - Active</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-gray-50">
                            <div className="flex items-center gap-3">
                                <RefreshCw size={14} className="text-gray-400" />
                                <span className="text-sm font-medium">Auto-Backups</span>
                            </div>
                            <span className="text-xs text-gray-400 font-mono">Enabled (Daily)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. Danger Zone */}
            <div className="pt-12 border-t border-red-100">
                <h3 className="text-red-600 text-[10px] font-black uppercase tracking-[0.3em] mb-6">Danger Zone</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button className="flex items-center justify-between p-6 bg-white border border-red-100 rounded-[2rem] hover:bg-red-50 transition-all group">
                        <div className="text-left">
                            <p className="text-sm font-bold text-gray-900 group-hover:text-red-600 transition-colors">Export Master Data</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-tighter">Download all users & orders as .csv</p>
                        </div>
                        <Download size={20} className="text-gray-300 group-hover:text-red-400" />
                    </button>
                    
                    <button className="flex items-center justify-between p-6 bg-white border border-red-100 rounded-[2rem] hover:bg-red-50 transition-all group">
                        <div className="text-left">
                            <p className="text-sm font-bold text-gray-900 group-hover:text-red-600 transition-colors">Flush System Cache</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-tighter">Force re-validation of all sessions</p>
                        </div>
                        <Trash2 size={20} className="text-gray-300 group-hover:text-red-400" />
                    </button>
                </div>
            </div>

            {/* Global Save Button */}
            <div className="fixed bottom-8 right-8">
                <button className="bg-black text-white px-8 py-4 rounded-2xl flex items-center gap-3 hover:scale-105 shadow-2xl transition-all text-xs font-bold uppercase tracking-widest">
                    <Save size={18} className="text-[#D4AF37]" />
                    {saving ? "Processing..." : "Save All Changes"}
                </button>
            </div>
        </div>
    );
};

export default SystemSettings;