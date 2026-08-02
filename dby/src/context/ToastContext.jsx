import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle2, AlertCircle, ShoppingBag } from 'lucide-react';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    // Triggers a new toast. Type can be 'success', 'error', or 'cart'
    const showToast = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts((prevToasts) => [...prevToasts, { id, message, type }]);

        // Auto-dismiss after 4 seconds
        setTimeout(() => {
            setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
        }, 4000);
    }, []);

    const removeToast = (id) => {
        setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            
            {/* Toast Container Floating Stack */}
            <div className="fixed top-20 right-6 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className="pointer-events-auto w-full bg-white border border-gray-100 shadow-xl rounded-2xl p-4 flex items-start gap-3 transform translate-y-0 animate-slide-in transition-all duration-300"
                    >
                        {/* Dynamic Icon Configuration */}
                        <div className="shrink-0 mt-0.5">
                            {toast.type === 'success' && <CheckCircle2 size={18} className="text-emerald-600" />}
                            {toast.type === 'error' && <AlertCircle size={18} className="text-rose-600" />}
                            {toast.type === 'cart' && <ShoppingBag size={18} className="text-[#D4AF37]" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 leading-relaxed">
                                {toast.message}
                            </p>
                        </div>

                        {/* Dismiss Button */}
                        <button 
                            onClick={() => removeToast(toast.id)}
                            className="shrink-0 text-gray-300 hover:text-gray-900 transition-colors cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => useContext(ToastContext);