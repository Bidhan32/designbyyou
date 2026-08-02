    import React, { createContext, useState, useEffect, useContext } from 'react';
    import API from '../api/axios';

    const AuthContext = createContext();

    export const AuthProvider = ({ children }) => {
        const [user, setUser] = useState(null);
        const [loading, setLoading] = useState(true);

        const loadUser = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                setLoading(false);
                return;
            }
            try {
                const { data } = await API.get('/auth/me'); 
                if (data && data.data) {
                    setUser(data.data);
                }
            } catch (err) {
                console.error("Session auto-login verification failed:", err);
                localStorage.removeItem('token');
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        // --- UPDATED LIFE CYCLE EFFECT ---
        useEffect(() => { 
            // Identify public authentication paths that shouldn't be auto-verified
            const publicAuthPaths = ['/login', '/register', '/verify-otp', '/forgot-password', '/reset-password'];
            
            if (publicAuthPaths.includes(window.location.pathname)) {
                // Stop loading state immediately and let the public component mount safely
                setLoading(false); 
                return;
            }

            loadUser(); 
        }, []); // Only runs when the app boots or shifts hard frames

        const login = (userData, token) => {
            localStorage.setItem('token', token);
            // Also ensure user object syncs locally if your protected routes query local storage
            localStorage.setItem('user', JSON.stringify(userData));
            setUser(userData);
        };

        const logout = () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            window.location.href = '/login';
        };

        return (
            <AuthContext.Provider value={{ user, setUser, login, logout, loading }}>
                {children}
            </AuthContext.Provider>
        );
    };

    export const useAuth = () => useContext(AuthContext);