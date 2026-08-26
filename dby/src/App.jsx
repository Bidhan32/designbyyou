"use strict";

/*
=========================================================
DesignByYou Application Router
Authentication, Role Protection & Application Routes
Version 2.2
=========================================================

Version 2.2:

- Fashion Editor is a Creator-only product feature.
- Designer Fashion Editor routes remain removed.
- Creator Fashion Editor cloud project backend is active.
- Creator Fashion Editor routes are now enabled.
- Legacy Creator sketch URLs redirect to Fashion Editor.
=========================================================
*/

import React from "react";

import {
  BrowserRouter as Router,
  Link,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";

import { Elements } from "@stripe/react-stripe-js";

import { loadStripe } from "@stripe/stripe-js";

import "./App.css";

/*=========================================================
System Context
=========================================================*/

import { AuthProvider, useAuth } from "./context/AuthContext";

import { ToastProvider } from "./context/ToastContext";

/*=========================================================
Route Protection
=========================================================*/

/*
IMPORTANT:

If your ProtectedRoute.jsx is not located at:

src/components/ProtectedRoute.jsx

change ONLY this import path.
*/

import ProtectedRoute from "./components/ProtectedRoute";

/*=========================================================
Layouts
=========================================================*/

import DesignerLayout from "./Layouts/DesignerLayout";

import CreatorLayout from "./Layouts/CreatorLayout";
import AdminLayout from "./Layouts/AdminLayout";

/*=========================================================
Authentication Pages
=========================================================*/

import Register from "./pages/auth/Register";

import VerifyOTP from "./pages/auth/VerifyOTP";

import Login from "./pages/auth/Login";

import ForgotPassword from "./pages/auth/ForgotPassword";

import ResetPassword from "./pages/auth/ResetPassword";

/*=========================================================
Shared Avatar System



The SAME AvatarStudio component is used by:
- Designer
- Creator
=========================================================*/

import AvatarStudio from "./pages/avatar/AvatarStudio";

import SuperAdminDashboard from "./pages/Superadmin/SuperadminDashboard";

import UserManagement from "./pages/Superadmin/UserManagement";

import DesignerApprovals from "./pages/Superadmin/DesignerApprovals";

import SystemSettings from "./pages/Superadmin/Settings";

/*=========================================================
Designer Pages
=========================================================*/

import DesignerMarketplace from "./pages/Designer/DesignerMarketplace";

import DesignerDashboard from "./pages/Designer/DesignerDashboard";

import InventoryGrid from "./pages/Designer/InventoryGrid";

import DesignerBookings from "./pages/Designer/DesignerBookings";

import DesignerWallet from "./pages/Designer/DesignerWallet";

import DesignerUploadDesign from "./pages/Designer/DesignerUploadDesign";

import DesignDetail from "./pages/Designer/DesignDetail";

import ProfileSettings from "./pages/Designer/DesignerProfileSettings";

import ProfileView from "./pages/Designer/DesignerProfileView";

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
Creator Fashion Editor

Fashion Editor belongs to Creator accounts only.

Creator cloud project endpoints are now available at:

/api/v1/creators/editor-projects
/api/v1/creators/editor-projects/:projectId

The editor supports:

- create cloud project
- load cloud project
- save cloud project
- optimistic version protection

Creator Showcase publishing remains separate.
=========================================================*/

import FashionEditor from "./pages/sketches/editor/FashionEditor";

/*=========================================================
Development-Only Pages
=========================================================*/


/*=========================================================
Stripe
=========================================================*/

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY || "";

const stripePromise = STRIPE_PUBLIC_KEY ? loadStripe(STRIPE_PUBLIC_KEY) : null;

/*=========================================================
Shared Loading Screen
=========================================================*/

function SessionLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#030303]">
      <div className="flex flex-col items-center gap-4">
        <Loader2
          className="animate-spin text-[#D4AF37]"
          size={30}
          aria-hidden="true"
        />

        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400 dark:text-white/40">
          Restoring Session
        </span>
      </div>
    </div>
  );
}

/*=========================================================
Root Redirect

Authenticated users go directly to their own area.

No session:
→ /login

Creator:
→ /creator/showcase

Designer:
→ /designer/explore

Other internal roles:
→ /unauthorized
=========================================================*/

function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <SessionLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = String(user.role || "")
    .trim()
    .toLowerCase();

  if (role === "creator") {
    return <Navigate to="/creator/showcase" replace />;
  }

if (role === "designer") {
  return <Navigate to="/designer/explore" replace />;
}

if (role === "superadmin") {
  return <Navigate to="/superadmin/dashboard" replace />;
}

return <Navigate to="/unauthorized" replace />;
}

/*=========================================================
Unauthorized Page
=========================================================*/

function UnauthorizedPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <SessionLoadingScreen />;
  }

  const role = String(user?.role || "")
    .trim()
    .toLowerCase();

  let homePath = "/login";

  let homeLabel = "Return to Sign In";

  if (role === "creator") {
    homePath = "/creator/showcase";

    homeLabel = "Return to Creator Studio";
  }

  if (role === "designer") {
    homePath = "/designer/explore";

    homeLabel = "Return to Designer Studio";
  }

  if (role === "superadmin") {
  homePath = "/superadmin/dashboard";

  homeLabel = "Return to Super Admin";
}

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[#030303]">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-500/10">
          <ShieldAlert className="text-rose-500" size={30} aria-hidden="true" />
        </div>

        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.4em] text-[#D4AF37]">
          Access Restricted
        </p>

        <h1 className="mb-4 text-3xl font-serif text-gray-900 dark:text-white">
          This studio isn't available to your account
        </h1>

        <p className="mb-8 text-sm leading-6 text-gray-500 dark:text-white/50">
          Your account is signed in, but your current role does not have
          permission to open this section.
        </p>

        <Link
          to={homePath}
          replace="true"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-6 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-black dark:bg-white dark:text-black"
        >
          <ArrowLeft size={15} aria-hidden="true" />

          {homeLabel}
        </Link>
      </div>
    </div>
  );
}

/*=========================================================
404 Page
=========================================================*/

function NotFoundPage() {
  const goBack = () => {
    window.history.back();
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-white font-serif dark:bg-[#030303]">
      <h1 className="text-6xl font-bold text-gray-100 dark:text-white/10">
        404
      </h1>

      <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-gray-400 dark:text-white/35">
        Atelier Not Found
      </p>

      <button
        type="button"
        onClick={goBack}
        className="mt-8 cursor-pointer border-b border-[#D4AF37] pb-1 text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] transition-all hover:border-black hover:text-black dark:hover:border-white dark:hover:text-white"
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
          <Elements stripe={stripePromise}>
            <Routes>
              {/*=========================================
              Public Authentication Routes
              =========================================*/}

              <Route path="/register" element={<Register />} />

              <Route path="/verify-otp" element={<VerifyOTP />} />

              <Route path="/login" element={<Login />} />

              <Route path="/forgot-password" element={<ForgotPassword />} />

              <Route path="/reset-password" element={<ResetPassword />} />

              {/*=========================================
              Unauthorized
              =========================================*/}

              <Route path="/unauthorized" element={<UnauthorizedPage />} />

              {/*=========================================
              Development-Only Test Route

              This route does NOT exist in a production
              Vite build.
              =========================================*/}




{/*=========================================
SUPER ADMIN

Every route inside this block requires:

- authenticated session
- current database role = superadmin

Normal admins, creators and designers cannot enter.
=========================================*/}

<Route element={<ProtectedRoute requiredRole="superadmin" />}>
  <Route path="/superadmin" element={<AdminLayout />}>
    <Route
      index
      element={<Navigate to="/superadmin/dashboard" replace />}
    />

    <Route
      path="dashboard"
      element={<SuperAdminDashboard />}
    />

    <Route
      path="users"
      element={<UserManagement />}
    />

    <Route
      path="designer-approvals"
      element={<DesignerApprovals />}
    />

    <Route
      path="approvals"
      element={<Navigate to="/superadmin/designer-approvals" replace />}
    />

    <Route
      path="settings"
      element={<SystemSettings />}
    />
  </Route>
</Route>
              {/*=========================================
              DESIGNER

              Every route inside this block requires:

              - authenticated session
              - current database role = designer

              Pending designers remain allowed to enter
              normal designer screens.

              Sensitive backend actions continue to enforce
              approval / email verification separately.

              IMPORTANT:

              Fashion Editor is NOT a Designer feature.
              Designers therefore have no Fashion Editor
              route in this application.
              =========================================*/}

              <Route element={<ProtectedRoute requiredRole="designer" />}>
                {/*=======================================
                Legacy Designer Sketch Redirects

                Old Designer sketch URLs must NOT expose
                the Creator Fashion Editor.

                Send them back to Designer Explore.
                =======================================*/}

                <Route
                  path="/designer/sketch"
                  element={<Navigate to="/designer/explore" replace />}
                />

                <Route
                  path="/designer/sketch/:legacyDesignId"
                  element={<Navigate to="/designer/explore" replace />}
                />

                {/*=======================================
                Designer Dashboard Layout
                =======================================*/}

                <Route path="/designer" element={<DesignerLayout />}>
                  <Route
                    index
                    element={<Navigate to="/designer/explore" replace />}
                  />

                  <Route path="dashboard" element={<DesignerDashboard />} />

                  {/*=====================================
                  Shared Avatar Studio
                  =====================================*/}

                  <Route path="avatar-studio" element={<AvatarStudio />} />

                  <Route path="inventory" element={<InventoryGrid />} />

                  <Route path="bookings" element={<DesignerBookings />} />

                  <Route
                    path="bookings/new"
                    element={<DesignerCreateBooking />}
                  />

                  <Route
                    path="bookings/:id"
                    element={<DesignerBookingDetail />}
                  />

                  <Route path="wallet" element={<DesignerWallet />} />

                  <Route path="upload" element={<DesignerUploadDesign />} />

                  <Route path="explore" element={<DesignerMarketplace />} />

                  <Route path="orders" element={<DesignerOrders />} />

                  <Route
                    path="showcase/:slug"
                    element={<DesignerShowcaseDetail />}
                  />

                  <Route
                    path="profile-settings"
                    element={<ProfileSettings />}
                  />

                  <Route path="profile-view" element={<ProfileView />} />

                  <Route
                    path="marketplace/product/:slug"
                    element={<DesignDetail />}
                  />

                  <Route path="order-history" element={<OrderHistoryPage />} />
                </Route>
              </Route>

              {/*=========================================
              CREATOR

              Every route inside this block requires:

              - authenticated session
              - current database role = creator

              Creators do NOT require admin approval.

              Sensitive financial actions requiring verified
              email remain enforced by the backend.

              Fashion Editor belongs here,
              NOT inside the Designer area.
              =========================================*/}

              <Route element={<ProtectedRoute requiredRole="creator" />}>
                {/*=======================================
                Creator Fashion Editor

                Creator-only professional 2D editor.

                Cloud project operations use:

                /api/v1/creators/editor-projects
                /api/v1/creators/editor-projects/:projectId
                =======================================*/}

                <Route
                  path="/creator/fashion-editor"
                  element={<FashionEditor />}
                />

                <Route
                  path="/creator/fashion-editor/:projectId"
                  element={<FashionEditor />}
                />

                {/*=======================================
                Legacy Creator Sketch Redirects

                Old Creator sketch URLs now redirect to
                the canonical Creator Fashion Editor.
                =======================================*/}

                <Route
                  path="/creator/sketch"
                  element={<Navigate to="/creator/fashion-editor" replace />}
                />

                <Route
                  path="/creator/sketch/:legacyDesignId"
                  element={<Navigate to="/creator/fashion-editor" replace />}
                />

                {/*=======================================
                Creator Dashboard Layout
                =======================================*/}

                <Route path="/creator" element={<CreatorLayout />}>
                  <Route
                    index
                    element={<Navigate to="/creator/showcase" replace />}
                  />

                  {/*=====================================
                  Shared Avatar Studio
                  =====================================*/}

                  <Route path="avatar-studio" element={<AvatarStudio />} />

                  <Route path="bookings" element={<CreatorBookings />} />

                  <Route
                    path="bookings/new"
                    element={<CreatorCreateBooking />}
                  />

                  <Route
                    path="bookings/:id"
                    element={<CreatorBookingDetail />}
                  />

                  <Route
                    path="studio/:designerId/commission"
                    element={<CreatorInitiateCommission />}
                  />

                  <Route
                    path="studio/:designerId"
                    element={<DesignerStudioProfile />}
                  />

                  <Route path="showcase" element={<CreatorShowcase />} />

                  <Route
                    path="showcase/:slug"
                    element={<CreatorShowcaseDetail />}
                  />

                  <Route path="directory" element={<DesignerDirectory />} />

                  <Route path="wallet" element={<CreatorWallet />} />

                  <Route path="profile" element={<CreatorProfile />} />

                  <Route path="settings" element={<CreatorSettings />} />

                  <Route
                    path="orders/history"
                    element={<CreatorOrdersHistory />}
                  />

                  <Route path="upload" element={<CreatorUpload />} />
                </Route>
              </Route>

              {/*=========================================
              Root Navigation
              =========================================*/}

              <Route path="/" element={<HomeRedirect />} />

              {/*=========================================
              Not Found
              =========================================*/}

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Elements>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
