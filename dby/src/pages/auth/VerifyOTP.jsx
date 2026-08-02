import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import API from '../../api/axios';
import AuthLayout from '../../layouts/AuthLayout';
import { ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';

const VerifyOTP = () => {
    const navigate = useNavigate();
    const location = useLocation();
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);

    // --- HARD RELOAD FALLBACK STRATEGY ---
    // Extract email from navigation state, or fall back to short-term session memory
    const email = location.state?.email || sessionStorage.getItem('pending_verification_email') || "";

    // Save email to session storage if it arrived via navigation so we don't lose it on refresh
    useEffect(() => {
        if (location.state?.email) {
            sessionStorage.setItem('pending_verification_email', location.state.email);
        }
    }, [location.state?.email]);

    // Cleanup session safety record if they leave or finish verification
    const clearSessionEmail = () => {
        sessionStorage.removeItem('pending_verification_email');
    };

    // Handle digit input and secure core focus shifts
    const handleChange = (target, index) => {
        if (isNaN(target.value)) return false;

        // Correct React state array mutation path:
        const updatedOtp = [...otp];
        updatedOtp[index] = target.value;
        setOtp(updatedOtp);

        // Advance focus forward cleanly if value is present
        if (target.value && target.nextSibling) {
            target.nextSibling.focus();
        }
    };

    // Handle backspaces cleanly across isolated index blocks
    const handleKeyDown = (e, index) => {
        if (e.key === 'Backspace') {
            if (!otp[index] && e.target.previousSibling) {
                // If current block is empty, focus previous input and clear it
                e.target.previousSibling.focus();
            }
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        const otpCode = otp.join('');
        
        if (otpCode.length < 6) {
            return setError('Please enter all 6 digits.');
        }
        if (!email) {
            return setError('Verification email trace lost. Please register or login again.');
        }

        setLoading(true);
        setError('');

        try {
            await API.post('/auth/verify-otp', {
                email: email,
                otp: otpCode
            });
            
            alert("Identity Verified Successfully!");
            clearSessionEmail(); // Clean up session token footprint
            navigate('/login', { replace: true }); 
        } catch (err) {
            setError(err.response?.data?.message || "Invalid or expired code.");
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        if (!email) return alert("Email address missing.");
        setError('');
        try {
            // Adjust this endpoint to match your actual backend resend route structure
            await API.post('/auth/resend-otp', { email });
            alert("A new 6-digit verification code has been dispatched.");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to resend verification token.");
        }
    };

    return (
        <AuthLayout 
            title="Verify Identity" 
            subtitle={`We've sent a 6-digit code to ${email || 'your email'}.`}
            step="02"
        >
            <div className="space-y-8">
                <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mb-4">
                        <ShieldCheck className="text-[#D4AF37]" size={32} />
                    </div>
                </div>

                <form onSubmit={handleVerify} className="space-y-6">
                    <div className="flex justify-between gap-2 sm:gap-4">
                        {otp.map((data, index) => (
                            <input
                                key={index}
                                type="text"
                                maxLength="1"
                                inputMode="numeric"
                                className="w-10 h-12 sm:w-14 sm:h-16 text-center text-xl font-bold bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all"
                                value={data}
                                onChange={e => handleChange(e.target, index)}
                                onKeyDown={e => handleKeyDown(e, index)}
                                onFocus={e => e.target.select()}
                                required
                            />
                        ))}
                    </div>

                    {error && (
                        <p className="text-red-500 text-xs text-center font-medium animate-pulse">
                            {error}
                        </p>
                    )}

                    <button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-[#1A1A1A] text-white rounded-xl font-semibold tracking-wide hover:bg-black transition-all shadow-lg shadow-black/10 flex justify-center items-center gap-2 cursor-pointer disabled:bg-gray-400"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Verify & Activate"}
                    </button>
                </form>

                <div className="text-center space-y-4">
                    <button 
                        type="button"
                        onClick={handleResendCode}
                        className="text-xs text-gray-400 hover:text-[#D4AF37] uppercase tracking-widest font-bold transition-colors cursor-pointer"
                    >
                        Resend Code
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => {
                            clearSessionEmail();
                            navigate('/register');
                        }}
                        className="flex items-center justify-center gap-2 text-sm text-gray-500 w-full hover:text-black transition-colors cursor-pointer"
                    >
                        <ArrowLeft size={14} /> Back to registration
                    </button>
                </div>
            </div>
        </AuthLayout>
    );
};

export default VerifyOTP;