import React, { useState, useEffect } from 'react';
import { History, Shield, Info, Activity } from 'lucide-react';
import API from '../../api/axios';

const AuditLog = () => {
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        // Mocking data - you'll need a backend route /superadmin/logs
        API.get('/superadmin/logs').then(res => setLogs(res.data));
    }, []);

    return (
        <div className="p-8 space-y-6">
           <header className="flex items-center gap-3">
    <div className="p-3 bg-black rounded-2xl">
        <Activity size={24} className="text-[#D4AF37]" />
    </div>
    <div>
        <h1 className="text-2xl font-bold">System Audit Log</h1>
        <p className="text-sm text-gray-500">Traceable history of all administrative actions.</p>
    </div>
</header>

            <div className="bg-[#1A1A1A] text-white rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
                <table className="w-full text-left">
                    <thead className="bg-white/5 text-[10px] uppercase tracking-[0.2em] text-gray-500">
                        <tr>
                            <th className="px-8 py-5">Admin</th>
                            <th className="px-8 py-5">Action</th>
                            <th className="px-8 py-5">Target</th>
                            <th className="px-8 py-5 text-right">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-8 py-4 text-[#D4AF37] font-bold">{log.admin_name}</td>
                                <td className="px-8 py-4">
                                    <span className="bg-white/10 px-2 py-1 rounded capitalize">{log.action_type}</span>
                                </td>
                                <td className="px-8 py-4 text-gray-400">{log.description}</td>
                                <td className="px-8 py-4 text-right text-gray-600">{new Date(log.created_at).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AuditLog;