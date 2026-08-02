import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; 
import API from '../../api/axios';
import AuthLayout from '../../layouts/AuthLayout';
import { Mail, Lock, User, Globe, FileText, Camera, Loader2, Briefcase, Building } from 'lucide-react';

const Register = () => {
    const navigate = useNavigate(); 
    const [loading, setLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        password: '',
        confirm_password: '',
        role: 'creator', 
        portfolio_url: '',
        bio: '',
        // Separated address fields to match backend expectations
        address_line: '',
        city: '',
        country: '',
        // Added creator specific fields
        company_name: '',
        preferred_category: '',
        profileImage: null 
    });

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        if (name === 'profileImage') {
            const file = files[0];
            setFormData({ ...formData, profileImage: file });
            setImagePreview(URL.createObjectURL(file)); 
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (formData.password !== formData.confirm_password) {
            alert("Passwords do not match.");
            return;
        }

        setLoading(true);

        const data = new FormData();
        Object.keys(formData).forEach(key => {
            if (key === 'profileImage' && !formData[key]) return;
            data.append(key, formData[key]);
        });

        try {
            const response = await API.post('/auth/register', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            navigate('/verify-otp', { 
                state: { email: formData.email } 
            });

        } catch (err) {
            alert(err.response?.data?.message || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout 
            title="Create an Account" 
            subtitle="Join our exclusive community of designers and creators."
            step="01"
        >
            <form onSubmit={handleRegister} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                
                {/* Role Selection */}
                <div className="flex gap-4 mb-6">
                    {['creator', 'designer'].map((r) => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setFormData({ ...formData, role: r })}
                            className={`flex-1 py-2 rounded-xl border-2 transition-all capitalize font-medium cursor-pointer ${
                                formData.role === r 
                                    ? 'border-[#D4AF37] bg-[#D4AF37]/5 text-[#D4AF37]' 
                                    : 'border-gray-100 text-gray-400'
                            }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>

                {/* Profile Image Upload */}
                <div className="flex flex-col items-center justify-center mb-6">
                    <label className="relative cursor-pointer group">
                        <div className="w-24 h-24 rounded-full bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden group-hover:border-[#D4AF37] transition-all">
                            {imagePreview ? (
                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <Camera className="text-gray-300 group-hover:text-[#D4AF37]" size={32} />
                            )}
                        </div>
                        <input type="file" name="profileImage" onChange={handleChange} className="hidden" accept="image/*" />
                        <div className="absolute bottom-0 right-0 p-1.5 bg-[#1A1A1A] rounded-full text-white shadow-lg">
                            <FileText size={12} />
                        </div>
                    </label>
                    <span className="text-[10px] text-gray-400 mt-2 uppercase tracking-widest font-bold">Upload Portrait</span>
                </div>

                {/* Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative">
                        <User className="absolute left-4 top-3.5 text-gray-400" size={18} />
                        <input name="full_name" placeholder="Full Name" value={formData.full_name} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" required />
                    </div>
                    <div className="relative">
                        <Mail className="absolute left-4 top-3.5 text-gray-400" size={18} />
                        <input name="email" type="email" placeholder="Email Address" value={formData.email} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" required />
                    </div>
                </div>

                {/* Password Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative">
                        <Lock className="absolute left-4 top-3.5 text-gray-400" size={18} />
                        <input name="password" type="password" placeholder="Password" value={formData.password} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" required />
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-4 top-3.5 text-gray-400" size={18} />
                        <input name="confirm_password" type="password" placeholder="Confirm Password" value={formData.confirm_password} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" required />
                    </div>
                </div>

                {/* Creator Specific Fields */}
                {formData.role === 'creator' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="relative">
                            <Building className="absolute left-4 top-3.5 text-gray-400" size={18} />
                            <input name="company_name" placeholder="Company Name" value={formData.company_name} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" />
                        </div>
                        <div className="relative">
                            <Briefcase className="absolute left-4 top-3.5 text-gray-400" size={18} />
                            <input name="preferred_category" placeholder="Preferred Category (e.g., Fashion, Tech)" value={formData.preferred_category} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" />
                        </div>
                    </div>
                )}

                {/* Designer Specific Fields */}
                {formData.role === 'designer' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="relative">
                            <Globe className="absolute left-4 top-3.5 text-gray-400" size={18} />
                            <input name="portfolio_url" placeholder="Portfolio URL (e.g., Behance, Dribbble)" value={formData.portfolio_url} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" />
                        </div>
                        <div className="relative">
                            <Briefcase className="absolute left-4 top-3.5 text-gray-400" size={18} />
                            <input name="address_line" placeholder="Street Address" value={formData.address_line} onChange={handleChange} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <input name="city" placeholder="City" value={formData.city} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" />
                            <input name="country" placeholder="Country" value={formData.country} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37]" />
                        </div>
                        <textarea name="bio" placeholder="Brief Professional Bio" value={formData.bio} onChange={handleChange} rows="3" className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#D4AF37] resize-none" />
                    </div>
                )}

                <button 
                    disabled={loading}
                    className="w-full py-4 bg-[#1A1A1A] text-white rounded-xl font-semibold tracking-wide hover:bg-black transition-all shadow-lg shadow-black/10 flex justify-center items-center gap-2 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 className="animate-spin" /> : "Request Access"}
                </button>
            </form>
        </AuthLayout>
    );
};

export default Register;