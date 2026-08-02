import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api/axios';
import { Image as ImageIcon, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

// 🚀 1. IMPORT THE STORE
import { useSketchStore } from "../sketches/useSketchStore";
const INITIAL_FORM_STATE = {
    title: '', 
    base_price: '', 
    description: '', 
    style_category: 'Streetwear', 
    product_type: 'sketch',
    license_type: 'commercial',
    category: 'MERCH'
};

export default function CreatorUpload() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    
    const [displayImage, setDisplayImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null); 
    
    const [form, setForm] = useState(INITIAL_FORM_STATE);
    const [tags, setTags] = useState([]);
    const [tagInput, setTagInput] = useState('');
    
    const imageInputRef = useRef(null);

    // 🚀 2. PULL BRIDGE DATA FROM STORE
    const { pendingStudioImage, setPendingStudioImage, strokes } = useStudioStore();

    // 🚀 3. CATCH INCOMING SKETCHES FROM THE CAD ENGINE
    useEffect(() => {
        if (pendingStudioImage) {
            setDisplayImage(pendingStudioImage);
            setPreviewUrl(URL.createObjectURL(pendingStudioImage));
            setPendingStudioImage(null); // Clear the bridge so it doesn't reload later
        }
    }, [pendingStudioImage, setPendingStudioImage]);

    // Cleanup object URLs to prevent memory leaks
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const handleInputChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const preventEnterSubmit = (e) => {
        if (e.key === 'Enter') e.preventDefault();
    };

    // Tag Management
    const handleAddTag = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const cleanTag = tagInput.trim().toLowerCase().replace(/[^\w\s-]/g, '');
            if (cleanTag && !tags.includes(cleanTag)) {
                setTags([...tags, cleanTag]);
            }
            setTagInput('');
        }
    };

    const handleRemoveTag = (indexToRemove) => {
        setTags(tags.filter((_, idx) => idx !== indexToRemove));
    };

    // Image Validation & Preview (Max 5MB)
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setErrorMsg('');
            if (file.size > 5 * 1024 * 1024) {
                throw new Error(`Image exceeds the maximum 5MB threshold.`);
            }
            if (!file.type.startsWith('image/')) {
                throw new Error("Only image files (JPG, PNG, WEBP) are accepted.");
            }
            
            setDisplayImage(file);
            setPreviewUrl(URL.createObjectURL(file)); 
        } catch (err) {
            setErrorMsg(err.message);
            if (imageInputRef.current) imageInputRef.current.value = '';
        }
    };

    const clearFileSlot = () => {
        setDisplayImage(null);
        setPreviewUrl(null);
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccess(false);

        if (!displayImage) {
            setErrorMsg("A showcase image is required to publish this asset.");
            return;
        }

        setLoading(true);

        // Catch lingering tags
        const finalTags = [...tags];
        if (tagInput.trim()) {
            const cleanTag = tagInput.trim().toLowerCase().replace(/[^\w\s-]/g, '');
            if (cleanTag && !finalTags.includes(cleanTag)) finalTags.push(cleanTag);
        }

        const multipartData = new FormData();
        
        Object.keys(form).forEach(key => {
            multipartData.append(key, form[key]);
        });
        
        multipartData.append('tags', JSON.stringify(finalTags));
        multipartData.append('preview', displayImage);
        
        // 🚀 4. APPEND VECTOR CANVAS STATE TO DATABASE PAYLOAD
        multipartData.append('canvas_state', JSON.stringify(strokes));

        try {
            await API.post('/creators/marketplace/upload', multipartData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            }); 
            
            setSuccess(true);
            setTimeout(() => {
                navigate('/creator/showcase');
            }, 1000);

        } catch (err) {
            setErrorMsg(err.response?.data?.message || "Upload failed. Please check your connection.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="selection:bg-neutral-900 selection:text-white w-full min-h-screen bg-[#F9F9F8] antialiased">
            <main className="max-w-3xl mx-auto py-16 px-4 md:px-8">
                
                {/* Header */}
                <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <span className="h-[1px] w-6 bg-neutral-300"></span>
                        <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-neutral-400">Creator Studio</span>
                        <span className="h-[1px] w-6 bg-neutral-300"></span>
                    </div>
                    <h1 className="text-4xl font-serif font-medium text-gray-950 tracking-tight">
                        Publish to <span className="italic font-light text-neutral-600">Showcase</span>
                    </h1>
                </div>

                {/* Alerts */}
                {success && (
                    <div className="mb-8 bg-neutral-900 text-white rounded-lg p-4 flex items-center gap-4 text-xs tracking-wide uppercase border border-neutral-800 animate-in fade-in duration-200">
                        <CheckCircle2 className="text-white flex-shrink-0" size={16} />
                        <p className="font-medium">Asset published successfully. Routing to directory...</p>
                    </div>
                )}

                {errorMsg && (
                    <div className="mb-8 bg-red-50 border border-red-100 text-red-900 rounded-lg p-4 flex items-center gap-4 text-xs font-semibold tracking-wide uppercase animate-in fade-in duration-200">
                        <AlertCircle className="text-red-600 flex-shrink-0" size={16} />
                        <p className="font-medium">{errorMsg}</p>
                    </div>
                )}

                {/* Main Form Box */}
                <form onSubmit={handleUploadSubmit} className="bg-white border border-gray-100 rounded-2xl p-8 shadow-[0_10px_40px_rgba(0,0,0,0.03)] space-y-10">
                    
                    {/* Visual Asset Dropzone */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 border-b border-gray-100 pb-3">Showcase Visual</h3>
                        
                        <div className={`relative border-2 border-dashed rounded-xl overflow-hidden text-center transition-all ${
                            previewUrl ? 'border-transparent bg-neutral-100' : 'border-gray-200 hover:bg-gray-50/50 hover:border-gray-300'
                        }`}>
                            
                            {/* Hidden Input stays mounted so refs work perfectly */}
                            <input type="file" ref={imageInputRef} id="file-upload" accept="image/jpeg, image/png, image/webp" 
                                   className="hidden" onChange={handleFileChange} disabled={loading} />
                            
                            {previewUrl ? (
                                <div className="relative w-full h-64 group">
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
                                        <button type="button" onClick={clearFileSlot} className="text-[10px] font-bold uppercase tracking-widest text-white flex items-center gap-2 px-5 py-2.5 bg-red-600/90 rounded-md hover:bg-red-600 transition-colors shadow-xl">
                                            <X size={14} /> Remove Asset
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center py-16 px-4">
                                    <ImageIcon className="mx-auto mb-4 text-gray-300" size={32} />
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-900">Click to Upload Image</p>
                                    <p className="text-[10px] text-gray-400 mt-2 font-medium">JPG, PNG, or WEBP • Max 5MB</p>
                                </label>
                            )}
                        </div>
                    </div>

                    {/* Meta Data Configuration */}
                    <div className="space-y-8 pt-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 border-b border-gray-100 pb-3">Asset Details</h3>
                        
                        {/* Title (Full Width) */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Design Title</label>
                            <input type="text" value={form.title} required disabled={loading} onKeyDown={preventEnterSubmit}
                                   placeholder="e.g. Asymmetrical Silk Blazer"
                                   onChange={e => handleInputChange('title', e.target.value)} 
                                   className="w-full border-b border-gray-200 py-2 outline-none focus:border-black text-sm transition-colors font-medium text-gray-900 placeholder-gray-300" />
                        </div>

                        {/* Row 1: Price & Style */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Starting Price (USD)</label>
                                <input type="number" min="1" step="0.01" value={form.base_price} required disabled={loading} onKeyDown={preventEnterSubmit}
                                       placeholder="0.00"
                                       onChange={e => handleInputChange('base_price', e.target.value)} 
                                       className="w-full border-b border-gray-200 py-2 outline-none focus:border-black text-sm font-mono transition-colors font-medium text-gray-900 placeholder-gray-300" />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Style Category</label>
                                <select value={form.style_category} disabled={loading} onChange={e => handleInputChange('style_category', e.target.value)} 
                                        className="w-full bg-transparent border-b border-gray-200 py-2 outline-none focus:border-black text-xs font-bold uppercase tracking-wider text-gray-800 cursor-pointer">
                                    <option value="Streetwear">Streetwear</option>
                                    <option value="Avant-Garde">Avant-Garde</option>
                                    <option value="Minimalism">Minimalism</option>
                                    <option value="Haute-Couture">Haute-Couture</option>
                                    <option value="Techwear">Techwear</option>
                                </select>
                            </div>
                        </div>

                        {/* Row 2: Product Type & License */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Format</label>
                                <select value={form.product_type} disabled={loading} onChange={e => handleInputChange('product_type', e.target.value)} 
                                        className="w-full bg-transparent border-b border-gray-200 py-2 outline-none focus:border-black text-xs font-bold uppercase tracking-wider text-gray-800 cursor-pointer">
                                    <option value="sketch">Physical Concept</option>
                                    <option value="3d_garment">3D Digital Garment</option>
                                    <option value="tech_pack">Tech Pack</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">License</label>
                                <select value={form.license_type} disabled={loading} onChange={e => handleInputChange('license_type', e.target.value)} 
                                        className="w-full bg-transparent border-b border-gray-200 py-2 outline-none focus:border-black text-xs font-bold uppercase tracking-wider text-gray-800 cursor-pointer">
                                    <option value="commercial">Commercial Rights</option>
                                    <option value="exclusive">Exclusive Rights</option>
                                    <option value="standard">Standard License</option>
                                </select>
                            </div>
                        </div>

                        {/* Row 3: SKU & Tags */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Category Tag</label>
                                <select value={form.category} disabled={loading} onChange={e => handleInputChange('category', e.target.value)} 
                                        className="w-full bg-transparent border-b border-gray-200 py-2 outline-none focus:border-black text-xs font-bold uppercase tracking-wider text-gray-800 cursor-pointer">
                                    <option value="MERCH">Merchandise</option>
                                    <option value="GARMENT">Apparel</option>
                                    <option value="EDITION">Capsule Collection</option>
                                    <option value="ASSET">General Asset</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Tags (Press Enter)</label>
                                <input type="text" value={tagInput} disabled={loading} onKeyDown={handleAddTag} onChange={e => setTagInput(e.target.value)} 
                                       placeholder="silk, organic, modern..."
                                       className="w-full border-b border-gray-200 py-2 outline-none focus:border-black text-sm text-gray-900 font-medium placeholder-gray-300" />
                            </div>
                        </div>
                        
                        {/* Dynamic Tag Display */}
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {tags.map((tag, idx) => (
                                    <span key={idx} className="bg-gray-50 text-gray-600 text-[9px] uppercase tracking-wider font-bold pl-3 pr-2 py-1.5 rounded-md border border-gray-100 flex items-center gap-1.5 shadow-sm">
                                        {tag}
                                        <button type="button" onClick={() => handleRemoveTag(idx)} className="text-gray-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer">
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Description */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Description</label>
                            <textarea value={form.description} required disabled={loading} onChange={e => handleInputChange('description', e.target.value)} 
                                      placeholder="Share the story, mood, or context behind this design..."
                                      className="w-full border-b border-gray-200 py-3 outline-none focus:border-black text-sm resize-none h-20 text-gray-900 font-medium leading-relaxed placeholder-gray-300" />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-6 border-t border-gray-100">
                        <button type="submit" disabled={loading} className="w-full bg-black text-white py-4 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-neutral-800 disabled:bg-gray-100 disabled:text-gray-400 transition-all duration-200 cursor-pointer flex items-center justify-center min-h-[56px] shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                            {loading ? <Loader2 className="animate-spin" size={16} /> : "Publish to Showcase"}
                        </button>
                    </div>

                </form>
            </main>
        </div>
    );
}