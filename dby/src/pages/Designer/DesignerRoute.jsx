import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const DesignerRoute = () => {
    const { user, loading } = useAuth();

    // 1. Prevent redirection flashes while checking session tokens on boot
    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    // 2. Evaluate permissions matrix
    if (!user || user.role !== 'designer') {
        return <Navigate to="/login" replace />;
    }

    // 3. Authorized entry granted: Render children via Outlet nested slots
    return <Outlet />;
};

export default DesignerRoute;