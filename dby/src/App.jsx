import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// --- SYSTEM CONTEXT WRAPPERS ---
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import DesignerRoute from './pages/Designer/DesignerRoute'; 
import DesignerLayout from './Layouts/DesignerLayout'; 
import { ProtectedRoute } from './components/ProtectedRoute';

// --- AUTH PAGES ---
import Register from './pages/auth/Register';
import VerifyOTP from './pages/auth/VerifyOTP';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

// --- MARKETPLACE & DESIGNER PAGES ---
import DesignerMarketplace from './pages/Designer/DesignerMarketplace';
import DesignerDashboard from './pages/designer/DesignerDashboard';
import InventoryGrid from './pages/designer/InventoryGrid';
import DesignerBookings from './pages/designer/DesignerBookings';
import DesignerWallet from './pages/designer/DesignerWallet';
import DesignerUploadDesign from './pages/designer/DesignerUploadDesign';
import DesignDetail from './pages/designer/DesignDetail';
import ProfileSettings from './pages/Designer/ProfileSettings';
import ProfileView from './pages/Designer/ProfileView';
import OrderHistoryPage from './pages/Designer/OrderHistoryPage';
import CreatorLayout from './Layouts/CreatorLayout';
import CreatorBookings from './pages/Creator/CreatorBookings';
import CreatorBookingDetail from './pages/Creator/CreatorBookingDetail';
import CreatorInitiateCommission from './pages/Creator/CreatorInitiateCommission';
import DesignerOrders from './pages/Designer/DesignerOrders';
import DesignerStudioProfile from './pages/Creator/DesignerStudioProfile';
import CreatorOrdersHistory from './pages/Creator/CreatorOrdersHistory';
import CreatorUpload from './pages/Creator/CreatorUpload';
import CreatorWallet from './pages/Creator/CreatorWallet';
import DesignerCreateBooking from './pages/Designer/DesignerCreateBooking';
import DesignerBookingDetail from './pages/Designer/DesignerBookingDetail';
import CreatorShowcase from './pages/Creator/CreatorShowcase';
import CreatorShowcaseDetail from './pages/Creator/CreatorShowcaseDetail';
import CreatorCreateBooking from './pages/Creator/CreatorCreateBooking';
import DesignerShowcaseDetail from './pages/Designer/DesignerShowcaseDetail';
import DesignerDirectory from './pages/Creator/DesignerDirectory';
import CreatorProfile from './pages/Creator/CreatorProfile';
import CreatorSettings from './pages/Creator/CreatorSettings';
import ApparelStudioCanvas from './pages/sketches/ApparelStudioCanvas';
import FashionEditor from './pages/sketches/editor/FashionEditor';

// Initialize Stripe outside the component lifecycle
const stripePromise = loadStripe('pk_test_51TYG9lHJixGHOCjtBsRzd1Ifof7B3jUx6VLjrsQOyjsVrJlzzfZOKvDcTYyoCOEHppcmsJMxsvPFnEsjqUivBLJ000hGngvolq');

function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                {/* 🟢 Replaced single CartProvider with isolated role contexts */}
                        <Elements stripe={stripePromise}>
                            <Router>
                                <Routes>
                                    {/* --- PUBLIC / AUTH ROUTES --- */}
                                    <Route path="/register" element={<Register />} />
                                    <Route path="/verify-otp" element={<VerifyOTP />} />
                                    <Route path="/login" element={<Login />} />
                                    <Route path="/forgot-password" element={<ForgotPassword />} />
                                    <Route path="/reset-password" element={<ResetPassword />} />

                                    {/* --- PROTECTED DESIGNER ROUTE DOMAIN --- */}
                                    <Route element={<DesignerRoute />}>
                                       <Route
        path="/designer/fashion-editor"
        element={<FashionEditor />}
    />

    <Route
        path="/designer/fashion-editor/:designId"
        element={<FashionEditor />}
    />
                                        <Route path="/designer" element={<DesignerLayout />}>
                                            <Route index element={<Navigate to="/designer/explore" replace />} />
                                            <Route path="dashboard" element={<DesignerDashboard />} />
                                            <Route path="inventory" element={<InventoryGrid />} />
                                            <Route path="bookings" element={<DesignerBookings />} />
                                            <Route path="bookings/:id" element={<DesignerBookingDetail />} />
                                            
                                            <Route path="wallet" element={<DesignerWallet />} />
                                            <Route path="upload" element={<DesignerUploadDesign />} />
                                            <Route path="explore" element={<DesignerMarketplace />} />
                                            <Route path="orders" element={<DesignerOrders />} />
                                            <Route path="showcase/:slug" element={<DesignerShowcaseDetail />} />
                                            <Route path="sketch" element={<ApparelStudioCanvas />} />
                                            <Route path="bookings/new" element={<DesignerCreateBooking />} />
                                          
                                            
<Route path="sketch/:designId" element={<ApparelStudioCanvas />} />
                                        
                                         
                                            <Route path="profile-settings" element={<ProfileSettings />} />
                                            <Route path="profile-view" element={<ProfileView />} />
                                            <Route path="marketplace/product/:slug" element={<DesignDetail />} />
                                            <Route path="order-history" element={<OrderHistoryPage />} />
                                        </Route>
                                    </Route>

                                    {/* --- PROTECTED CREATOR ROUTE DOMAIN --- */}
                                 <Route path="/creator" element={<CreatorLayout />}>
    <Route index element={<Navigate to="/creator/showcase" replace />} />
    
    <Route path="bookings" element={<CreatorBookings />} />
    <Route path="bookings/:id" element={<CreatorBookingDetail />} />
    <Route path="studio/:designerId/commission" element={<CreatorInitiateCommission />} />
    <Route path="showcase" element={<CreatorShowcase />} />
    <Route path="showcase/:slug" element={<CreatorShowcaseDetail />} />
    <Route path="bookings/new" element={<CreatorCreateBooking />} />
    <Route path="sketch" element={<ApparelStudioCanvas/>} />
    <Route path="sketch/:designId" element={<ApparelStudioCanvas />} />
    <Route path="studio/:designerId" element={<DesignerStudioProfile />} />
    <Route path="directory" element={<DesignerDirectory />} />
    <Route path="wallet" element={<CreatorWallet />} />
    <Route path="profile" element={<CreatorProfile />} />
    <Route path="settings" element={<CreatorSettings />} />
    <Route path="fashion-editor" element={<FashionEditor />} />
<Route path="fashion-editor/:designId" element={<FashionEditor />} />
    
    {/* 🟢 ADD THIS LINE TO HANDLE REGISTERING THE CART PAGE TO THE ROUTER */}
    
    <Route path="orders/history" element={<CreatorOrdersHistory/>}/>
    <Route path="upload" element={<CreatorUpload/>}/>
    
</Route>

                                    {/* --- SYSTEM NAVIGATION LOGIC --- */}
                                    <Route path="/" element={<Navigate to="/login" replace />} />
                                    
                                    {/* 404 Atelier Not Found Viewport */}
                                    <Route 
                                        path="*" 
                                        element={
                                            <div className="h-screen flex items-center justify-center font-serif flex-col gap-4 bg-white">
                                                <h1 className="text-6xl text-gray-100 font-bold">404</h1>
                                                <p className="tracking-[0.5em] uppercase text-[10px] text-gray-400 font-bold">Atelier Not Found</p>
                                                <button 
                                                    onClick={() => window.history.back()} 
                                                    className="text-[#D4AF37] uppercase tracking-widest text-[10px] font-bold mt-8 border-b border-[#D4AF37] pb-1 hover:text-black hover:border-black transition-all cursor-pointer"
                                                >
                                                    Return to Gallery
                                                </button>
                                            </div>
                                        } 
                                    />
                                </Routes>
                            </Router>
                        </Elements>
                   
            </ToastProvider>
        </AuthProvider>
    );
}

export default App;