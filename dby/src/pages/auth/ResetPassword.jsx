import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import API from '../../api/axios';
import AuthLayout from '../../layouts/AuthLayout';
import { Lock, Hash, Loader2, CheckCircle2 } from 'lucide-react';

const ResetPassword = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Retrieve email passed from ForgotPassword
    const [formData, setFormData] = useState({
        email: location.state?.email || '',
        otp: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (error) setError('');
    };

    const handleReset = async (e) => {
        e.preventDefault();
        if (formData.newPassword !== formData.confirmPassword) {
            return setError("Passwords do not match.");
        }

        // Enforce basic length protection on the client side
        if (formData.newPassword.length < 6) {
            return setError("Password must be at least 6 characters long.");
        }

        setLoading(true);
        try {
            // Clean Payload: Only send what the Express controller actively destructures
            const payload = {
                email: formData.email,
                otp: formData.otp,
                newPassword: formData.newPassword
            };

            await API.post('/auth/reset-password', payload);
            setSuccess(true);
            setTimeout(() => navigate('/login'), 2500);
        } catch (err) {
            setError(err.response?.data?.message || "Reset failed. Please check your OTP code.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <AuthLayout title="Password Reset" subtitle="Access restored.">
                <div className="flex flex-col items-center py-10 text-center">
                    <CheckCircle2 className="text-green-500 mb-4" size={50} />
                    <p className="text-sm font-medium text-gray-600">Password updated successfully. Redirecting to studio login...</p>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout title="Finalize Reset" subtitle="Verify your identity with the code sent to your email.">
            <form onSubmit={handleReset} className="space-y-4">
                {/* Hidden input to hold the dynamic email state seamlessly */}
                <input name="email" value={formData.email} onChange={handleChange} className="hidden" readOnly />
                
                {/* OTP Token Field */}
                <div className="relative">
                    <Hash className="absolute left-4 top-3.5 text-gray-400" size={18} />
                    <input 
                        name="otp" 
                        type="text"
                        maxLength="6"
                        placeholder="6-Digit OTP" 
                        value={formData.otp}
                        onChange={handleChange} 
                        className="w-full pl-12 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all" 
                        required 
                    />
                </div>
                
                {/* New Password Field */}
                <div className="relative">
                    <Lock className="absolute left-4 top-3.5 text-gray-400" size={18} />
                    <input 
                        name="newPassword" 
                        type="password" 
                        placeholder="New Password" 
                        value={formData.newPassword}
                        onChange={handleChange} 
                        className="w-full pl-12 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all" 
                        required 
                    />
                </div>
                
                {/* Password Confirmation Field */}
                <div className="relative">
                    <Lock className="absolute left-4 top-3.5 text-gray-400" size={18} />
                    <input 
                        name="confirmPassword" 
                        type="password" 
                        placeholder="Confirm New Password" 
                        value={formData.confirmPassword}
                        onChange={handleChange} 
                        className="w-full pl-12 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37] focus:bg-white transition-all" 
                        required 
                    />
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-500 text-xs p-3 rounded-xl text-center font-medium animate-in fade-in zoom-in duration-300">
                        {error}
                    </div>
                )}

                <button 
                    type="submit"
                    disabled={loading} 
                    className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-black/5 flex justify-center items-center"
                >
                    {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "Save New Password"}
                </button>
            </form>
        </AuthLayout>
    );
};

export default ResetPassword;