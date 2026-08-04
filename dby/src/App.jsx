import React from "react";

import {
    BrowserRouter as Router,
    Navigate,
    Route,
    Routes
} from "react-router-dom";

import {
    Elements
} from "@stripe/react-stripe-js";

import {
    loadStripe
} from "@stripe/stripe-js";

import "./App.css";

/*=========================================================
System Context
=========================================================*/

import {
    AuthProvider
} from "./context/AuthContext";

import {
    ToastProvider
} from "./context/ToastContext";

/*=========================================================
Route Protection and Layouts
=========================================================*/

import DesignerRoute from "./pages/Designer/DesignerRoute";

import DesignerLayout from "./Layouts/DesignerLayout";
import CreatorLayout from "./Layouts/CreatorLayout";

/*=========================================================
Authentication Pages
=========================================================*/

import Register from "./pages/auth/Register";
import VerifyOTP from "./pages/auth/VerifyOTP";
import Login from "./pages/auth/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

/*=========================================================
Designer Pages
=========================================================*/

import DesignerMarketplace from "./pages/Designer/DesignerMarketplace";
import DesignerDashboard from "./pages/designer/DesignerDashboard";
import InventoryGrid from "./pages/designer/InventoryGrid";
import DesignerBookings from "./pages/designer/DesignerBookings";
import DesignerWallet from "./pages/designer/DesignerWallet";
import DesignerUploadDesign from "./pages/designer/DesignerUploadDesign";
import DesignDetail from "./pages/designer/DesignDetail";

import ProfileSettings from "./pages/Designer/ProfileSettings";
import ProfileView from "./pages/Designer/ProfileView";
import OrderHistoryPage from "./pages/Designer/OrderHistoryPage";
import DesignerOrders from "./pages/Designer/DesignerOrders";
import DesignerCreateBooking from "./pages/Designer/DesignerCreateBooking";
import DesignerBookingDetail from "./pages/Designer/DesignerBookingDetail";
import DesignerShowcaseDetail from "./pages/Designer/DesignerShowcaseDetail";

/*=========================================================
Creator Pages
=========================================================*/

import CreatorBookings from "./pages/Creator/CreatorBookings";
import CreatorBookingDetail from "./pages/Creator/CreatorBookingDetail";
import CreatorInitiateCommission from "./pages/Creator/CreatorInitiateCommission";
import DesignerStudioProfile from "./pages/Creator/DesignerStudioProfile";
import CreatorOrdersHistory from "./pages/Creator/CreatorOrdersHistory";
import CreatorUpload from "./pages/Creator/CreatorUpload";
import CreatorWallet from "./pages/Creator/CreatorWallet";
import CreatorShowcase from "./pages/Creator/CreatorShowcase";
import CreatorShowcaseDetail from "./pages/Creator/CreatorShowcaseDetail";
import CreatorCreateBooking from "./pages/Creator/CreatorCreateBooking";
import DesignerDirectory from "./pages/Creator/DesignerDirectory";
import CreatorProfile from "./pages/Creator/CreatorProfile";
import CreatorSettings from "./pages/Creator/CreatorSettings";

/*=========================================================
Professional 2D Fashion Editor
=========================================================*/

import FashionEditor from "./pages/sketches/editor/FashionEditor";

/*=========================================================
Stripe
=========================================================*/

const stripePromise = loadStripe(
    "pk_test_51TYG9lHJixGHOCjtBsRzd1Ifof7B3jUx6VLjrsQOyjsVrJlzzfZOKvDcTYyoCOEHppcmsJMxsvPFnEsjqUivBLJ000hGngvolq"
);

/*=========================================================
404 Page
=========================================================*/

function NotFoundPage() {
    const goBack = () => {
        window.history.back();
    };

    return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-white font-serif">
            <h1 className="text-6xl font-bold text-gray-100">
                404
            </h1>

            <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-gray-400">
                Atelier Not Found
            </p>

            <button
                type="button"
                onClick={goBack}
                className="mt-8 cursor-pointer border-b border-[#D4AF37] pb-1 text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] transition-all hover:border-black hover:text-black"
            >
                Return to Gallery
            </button>
        </div>
    );
}

/*=========================================================
Application
=========================================================*/

function App() {
    return (
        <Router>
            <AuthProvider>
                <ToastProvider>
                    <Elements
                        stripe={
                            stripePromise
                        }
                    >
                        <Routes>
                            {/*=================================
                            Public Authentication Routes
                            =================================*/}

                            <Route
                                path="/register"
                                element={
                                    <Register />
                                }
                            />

                            <Route
                                path="/verify-otp"
                                element={
                                    <VerifyOTP />
                                }
                            />

                            <Route
                                path="/login"
                                element={
                                    <Login />
                                }
                            />

                            <Route
                                path="/forgot-password"
                                element={
                                    <ForgotPassword />
                                }
                            />

                            <Route
                                path="/reset-password"
                                element={
                                    <ResetPassword />
                                }
                            />

                            {/*=================================
                            Protected Designer Routes
                            =================================*/}

                            <Route
                                element={
                                    <DesignerRoute />
                                }
                            >
                                {/*
                                Full-screen 2D fashion editor routes.

                                These stay outside DesignerLayout so
                                the editor receives the complete screen.
                                */}

                                <Route
                                    path="/designer/fashion-editor"
                                    element={
                                        <FashionEditor
                                            role="designer"
                                        />
                                    }
                                />

                                <Route
                                    path="/designer/fashion-editor/:designId"
                                    element={
                                        <FashionEditor
                                            role="designer"
                                        />
                                    }
                                />

                                {/*
                                Existing sketch URLs now open the same
                                professional 2D FashionEditor.
                                */}

                                <Route
                                    path="/designer/sketch"
                                    element={
                                        <FashionEditor
                                            role="designer"
                                        />
                                    }
                                />

                                <Route
                                    path="/designer/sketch/:designId"
                                    element={
                                        <FashionEditor
                                            role="designer"
                                        />
                                    }
                                />

                                <Route
                                    path="/designer"
                                    element={
                                        <DesignerLayout />
                                    }
                                >
                                    <Route
                                        index
                                        element={
                                            <Navigate
                                                to="/designer/explore"
                                                replace
                                            />
                                        }
                                    />

                                    <Route
                                        path="dashboard"
                                        element={
                                            <DesignerDashboard />
                                        }
                                    />

                                    <Route
                                        path="inventory"
                                        element={
                                            <InventoryGrid />
                                        }
                                    />

                                    <Route
                                        path="bookings"
                                        element={
                                            <DesignerBookings />
                                        }
                                    />

                                    <Route
                                        path="bookings/new"
                                        element={
                                            <DesignerCreateBooking />
                                        }
                                    />

                                    <Route
                                        path="bookings/:id"
                                        element={
                                            <DesignerBookingDetail />
                                        }
                                    />

                                    <Route
                                        path="wallet"
                                        element={
                                            <DesignerWallet />
                                        }
                                    />

                                    <Route
                                        path="upload"
                                        element={
                                            <DesignerUploadDesign />
                                        }
                                    />

                                    <Route
                                        path="explore"
                                        element={
                                            <DesignerMarketplace />
                                        }
                                    />

                                    <Route
                                        path="orders"
                                        element={
                                            <DesignerOrders />
                                        }
                                    />

                                    <Route
                                        path="showcase/:slug"
                                        element={
                                            <DesignerShowcaseDetail />
                                        }
                                    />

                                    <Route
                                        path="profile-settings"
                                        element={
                                            <ProfileSettings />
                                        }
                                    />

                                    <Route
                                        path="profile-view"
                                        element={
                                            <ProfileView />
                                        }
                                    />

                                    <Route
                                        path="marketplace/product/:slug"
                                        element={
                                            <DesignDetail />
                                        }
                                    />

                                    <Route
                                        path="order-history"
                                        element={
                                            <OrderHistoryPage />
                                        }
                                    />
                                </Route>
                            </Route>

                            {/*=================================
                            Creator Full-Screen Editor Routes
                            =================================*/}

                            <Route
                                path="/creator/fashion-editor"
                                element={
                                    <FashionEditor
                                        role="creator"
                                    />
                                }
                            />

                            <Route
                                path="/creator/fashion-editor/:designId"
                                element={
                                    <FashionEditor
                                        role="creator"
                                    />
                                }
                            />

                            <Route
                                path="/creator/sketch"
                                element={
                                    <FashionEditor
                                        role="creator"
                                    />
                                }
                            />

                            <Route
                                path="/creator/sketch/:designId"
                                element={
                                    <FashionEditor
                                        role="creator"
                                    />
                                }
                            />

                            {/*=================================
                            Creator Dashboard Routes
                            =================================*/}

                            <Route
                                path="/creator"
                                element={
                                    <CreatorLayout />
                                }
                            >
                                <Route
                                    index
                                    element={
                                        <Navigate
                                            to="/creator/showcase"
                                            replace
                                        />
                                    }
                                />

                                <Route
                                    path="bookings"
                                    element={
                                        <CreatorBookings />
                                    }
                                />

                                <Route
                                    path="bookings/new"
                                    element={
                                        <CreatorCreateBooking />
                                    }
                                />

                                <Route
                                    path="bookings/:id"
                                    element={
                                        <CreatorBookingDetail />
                                    }
                                />

                                <Route
                                    path="studio/:designerId/commission"
                                    element={
                                        <CreatorInitiateCommission />
                                    }
                                />

                                <Route
                                    path="studio/:designerId"
                                    element={
                                        <DesignerStudioProfile />
                                    }
                                />

                                <Route
                                    path="showcase"
                                    element={
                                        <CreatorShowcase />
                                    }
                                />

                                <Route
                                    path="showcase/:slug"
                                    element={
                                        <CreatorShowcaseDetail />
                                    }
                                />

                                <Route
                                    path="directory"
                                    element={
                                        <DesignerDirectory />
                                    }
                                />

                                <Route
                                    path="wallet"
                                    element={
                                        <CreatorWallet />
                                    }
                                />

                                <Route
                                    path="profile"
                                    element={
                                        <CreatorProfile />
                                    }
                                />

                                <Route
                                    path="settings"
                                    element={
                                        <CreatorSettings />
                                    }
                                />

                                <Route
                                    path="orders/history"
                                    element={
                                        <CreatorOrdersHistory />
                                    }
                                />

                                <Route
                                    path="upload"
                                    element={
                                        <CreatorUpload />
                                    }
                                />
                            </Route>

                            {/*=================================
                            Root Navigation
                            =================================*/}

                            <Route
                                path="/"
                                element={
                                    <Navigate
                                        to="/login"
                                        replace
                                    />
                                }
                            />

                            {/*=================================
                            Not Found
                            =================================*/}

                            <Route
                                path="*"
                                element={
                                    <NotFoundPage />
                                }
                            />
                        </Routes>
                    </Elements>
                </ToastProvider>
            </AuthProvider>
        </Router>
    );
}

export default App;