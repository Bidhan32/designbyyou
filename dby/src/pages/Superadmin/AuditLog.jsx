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
        <div className="p-4 space-y-6">
           <header className="flex items-center gap-3">
    <div className="p-3 bg-canvas rounded-md">
        <Activity size={24} className="text-action" />
    </div>
    <div>
        <h1 className="text-2xl font-bold">System Audit Log</h1>
        <p className="text-sm text-muted">Traceable history of all administrative actions.</p>
    </div>
</header>

            <div className="bg-surface text-ink rounded-md overflow-hidden border border-line">
                <table className="w-full text-left">
                    <thead className="bg-subtle text-[10px] uppercase tracking-normal text-muted">
                        <tr>
                            <th className="px-8 py-5">Admin</th>
                            <th className="px-8 py-5">Action</th>
                            <th className="px-8 py-5">Target</th>
                            <th className="px-8 py-5 text-right">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line font-mono text-[11px]">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-subtle transition-colors">
                                <td className="px-8 py-4 text-action font-bold">{log.admin_name}</td>
                                <td className="px-8 py-4">
                                    <span className="bg-subtle px-2 py-1 rounded capitalize">{log.action_type}</span>
                                </td>
                                <td className="px-8 py-4 text-muted">{log.description}</td>
                                <td className="px-8 py-4 text-right text-muted">{new Date(log.created_at).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AuditLog;