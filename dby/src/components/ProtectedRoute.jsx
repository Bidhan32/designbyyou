import { Navigate, useLocation } from 'react-router-dom';

export const ProtectedRoute = ({ children, requiredRole }) => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const location = useLocation();

    // 1. If no token, kick them to login
    if (!token) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // 2. If a role is required (e.g., 'superadmin') and they don't have it
    if (requiredRole && user.role !== requiredRole) {
        // Send them to a "Not Authorized" page or back to their own dashboard
        return <Navigate to="/unauthorized" replace />;
    }

    return children;
};