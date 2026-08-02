import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../../api/axios';
import AuthLayout from '../../layouts/AuthLayout';
import { Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext'; // 1. Import your hook

const Login = () => {
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });

    const { login } = useAuth(); // 2. Hook into the global login trigger
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (error) setError(''); 
    };

   const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
        const { data } = await API.post('/auth/login', formData);
        
        // 1. Hand it directly to your central state dispatcher (Saves to state & localStorage)
        login(data.user, data.token);

        // 2. ✅ FIXED: Route dynamically depending on their assigned profile tier
        if (data.user?.role === 'creator') {
            navigate('/creator/showcase', { replace: true });
        } else if (data.user?.role === 'designer') {
            navigate('/designer/explore', { replace: true });
        } else {
            // Fallback for admins or unassigned accounts
            navigate('/unauthorized');
        }

    } catch (err) {
        const errorMessage = err.response?.data?.message || "Invalid email or password.";
        
        // --- INTERCEPT UNVERIFIED ACCOUNT STATUS ---
        if (errorMessage.toLowerCase().includes("verify") || err.response?.status === 403) {
            navigate('/verify-otp', { 
                state: { email: formData.email } 
            });
            return; 
        }

        setError(errorMessage);
    } finally {
        setLoading(false);
    }
};

    return (
        <AuthLayout 
            title="Welcome Back" 
            subtitle="Access your design studio and the global marketplace."
        >
            <form onSubmit={handleLogin} className="space-y-6">
                {/* Email Input */}
                <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 ml-1">
                        Email Address
                    </label>
                    <div className="relative">
                        <Mail className="absolute left-4 top-3.5 text-gray-400" size={18} />
                        <input 
                            name="email" 
                            type="email" 
                            placeholder="couture@designbyyou.com" 
                            onChange={handleChange} 
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all" 
                            required 
                        />
                    </div>
                </div>

                {/* Password Input */}
                <div className="space-y-1">
                    <div className="flex justify-between items-end mb-1">
                        <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 ml-1">
                            Password
                        </label>
                        <Link to="/forgot-password" className="text-[10px] uppercase tracking-widest font-bold text-[#D4AF37] hover:underline">
                            Forgot?
                        </Link>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-4 top-3.5 text-gray-400" size={18} />
                        <input 
                            name="password" 
                            type={showPassword ? "text" : "password"} 
                            placeholder="••••••••" 
                            onChange={handleChange} 
                            className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all" 
                            required 
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-500 text-xs p-3 rounded-xl text-center font-medium animate-in fade-in zoom-in duration-300">
                        {error}
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-semibold tracking-wide hover:bg-black transition-all shadow-xl shadow-black/5 flex justify-center items-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" /> : "Sign In to Studio"}
                </button>

                <div className="text-center pt-6 border-t border-gray-50">
                    <p className="text-sm text-gray-500">
                        Don't have an account? {' '}
                        <Link to="/register" className="text-[#D4AF37] font-bold hover:underline">
                            Join the Atelier
                        </Link>
                    </p>
                </div>
            </form>
        </AuthLayout>
    );
};

export default Login;