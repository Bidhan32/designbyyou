import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../../api/axios';
import AuthLayout from '../../layouts/AuthLayout';
import { Mail, ArrowRight, Loader2, MessageSquare } from 'lucide-react';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleRequestOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Backend triggers the OTP email here
            await API.post('/auth/forgot-password', { email });
            
            // Navigate to Reset and pass the email so the user doesn't have to re-type it
            navigate('/reset-password', { state: { email } });
        } catch (err) {
            setError(err.response?.data?.message || "Email not found in our registry.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout 
            title="Lost your way?" 
            subtitle="Enter your registered email and we'll send a 6-digit verification code."
        >
            <form onSubmit={handleRequestOTP} className="space-y-6">
                <div className="relative">
                    <Mail className="absolute left-4 top-3.5 text-gray-400" size={18} />
                    <input 
                        type="email" 
                        placeholder="couture@designbyyou.com" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#D4AF37]" 
                        required 
                    />
                </div>

                {error && <p className="text-red-500 text-xs text-center">{error}</p>}

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-semibold hover:bg-black transition-all flex justify-center items-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" /> : <>Send Code <ArrowRight size={18} /></>}
                </button>
            </form>
        </AuthLayout>
    );
};

export default ForgotPassword;