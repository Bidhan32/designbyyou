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

import React, { lazy } from "react";
import RouteContent from "./components/RouteContent";
import CreatorScrollReset from "./components/CreatorScrollReset";
import SkipToContent from "./components/SkipToContent";

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



import { AuthProvider } from "./context/AuthContext";


import { useAuth } from "./context/AuthContext.helpers.js";

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

const DesignerLayout = lazy(() => import("./Layouts/DesignerLayout"));

const CreatorLayout = lazy(() => import("./Layouts/CreatorLayout"));
const AdminLayout = lazy(() => import("./Layouts/AdminLayout"));

/*=========================================================
Authentication Pages
=========================================================*/

const Register = lazy(() => import("./pages/auth/Register"));

const VerifyOTP = lazy(() => import("./pages/auth/VerifyOTP"));

const Login = lazy(() => import("./pages/auth/Login"));

const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));

const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));

/*=========================================================
Shared Avatar System



The SAME AvatarStudio component is used by:
- Designer
- Creator
=========================================================*/

const AvatarStudio = lazy(() => import("./pages/avatar/AvatarStudio"));

const SuperAdminDashboard = lazy(() => import("./pages/Superadmin/SuperadminDashboard"));

const UserManagement = lazy(() => import("./pages/Superadmin/UserManagement"));

const DesignerApprovals = lazy(() => import("./pages/Superadmin/DesignerApprovals"));

const SystemSettings = lazy(() => import("./pages/Superadmin/Settings"));

/*=========================================================
Designer Pages
=========================================================*/

const DesignerMarketplace = lazy(() => import("./pages/Designer/DesignerMarketplace"));

const DesignerDashboard = lazy(() => import("./pages/Designer/DesignerDashboard"));

const InventoryGrid = lazy(() => import("./pages/Designer/InventoryGrid"));

const DesignerBookings = lazy(() => import("./pages/Designer/DesignerBookings"));

const DesignerWallet = lazy(() => import("./pages/Designer/DesignerWallet"));

const DesignerUploadDesign = lazy(() => import("./pages/Designer/DesignerUploadDesign"));

const DesignDetail = lazy(() => import("./pages/Designer/DesignDetail"));

const ProfileSettings = lazy(() => import("./pages/Designer/DesignerProfileSettings"));

const ProfileView = lazy(() => import("./pages/Designer/DesignerProfileView"));

const OrderHistoryPage = lazy(() => import("./pages/Designer/OrderHistoryPage"));

const DesignerOrders = lazy(() => import("./pages/Designer/DesignerOrders"));

const DesignerBookingDetail = lazy(() => import("./pages/Designer/DesignerBookingDetail"));

const DesignerShowcaseDetail = lazy(() => import("./pages/Designer/DesignerShowcaseDetail"));

/*=========================================================
Creator Pages
=========================================================*/

const CreatorBookings = lazy(() => import("./pages/Creator/CreatorBookings"));

const CreatorBookingDetail = lazy(() => import("./pages/Creator/CreatorBookingDetail"));

const CreatorInitiateCommission = lazy(() => import("./pages/Creator/CreatorInitiateCommission"));

const DesignerStudioProfile = lazy(() => import("./pages/Creator/DesignerStudioProfile"));

const CreatorOrdersHistory = lazy(() => import("./pages/Creator/CreatorOrdersHistory"));

const CreatorUpload = lazy(() => import("./pages/Creator/CreatorUpload"));

const CreatorWallet = lazy(() => import("./pages/Creator/CreatorWallet"));

const CreatorShowcase = lazy(() => import("./pages/Creator/CreatorShowcase"));

const CreatorShowcaseDetail = lazy(() => import("./pages/Creator/CreatorShowcaseDetail"));

const CreatorCreateBooking = lazy(() => import("./pages/Creator/CreatorCreateBooking"));

const DesignerDirectory = lazy(() => import("./pages/Creator/DesignerDirectory"));

const CreatorProfile = lazy(() => import("./pages/Creator/CreatorProfile"));

const CreatorSettings = lazy(() => import("./pages/Creator/CreatorSettings"));

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

const CreatorProjects = lazy(() => import("./pages/Creator/CreatorProjects"));
const FashionEditor = lazy(() => import("./pages/sketches/editor/FashionEditor"));
const CreatorToolsPage = lazy(() => import("./pages/Creator/CreatorToolsPage"));
const CreatorBackgroundRemover = lazy(() => import("./pages/Creator/CreatorBackgroundRemover"));
const CreatorCostumeExtractor = lazy(() => import("./pages/Creator/CreatorCostumeExtractor"));
const CreatorTextToImage = lazy(() => import("./pages/Creator/CreatorTextToImage"));
const CreatorSketchToImage = lazy(() => import("./pages/Creator/CreatorSketchToImage"));
const CreatorVirtualTryOn = lazy(() => import("./pages/Creator/CreatorVirtualTryOn"));
const CreatorMultiViewGenerator = lazy(() => import("./pages/Creator/CreatorMultiViewGenerator"));
const CreatorPatternExtractor = lazy(() => import("./pages/Creator/CreatorPatternExtractor"));


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
      <SkipToContent />
      <CreatorScrollReset />
      <AuthProvider>
        <ToastProvider>
          <Elements stripe={stripePromise}>
            <RouteContent fullScreen>
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

                  <Route path="dashboard" element={<SuperAdminDashboard />} />

                  <Route path="users" element={<UserManagement />} />

                  <Route
                    path="designer-approvals"
                    element={<DesignerApprovals />}
                  />

                  <Route
                    path="approvals"
                    element={
                      <Navigate to="/superadmin/designer-approvals" replace />
                    }
                  />

                  <Route path="settings" element={<SystemSettings />} />
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
                    element={<Navigate to="/designer/bookings" replace />}
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

                  {}

                  <Route path="avatar-studio" element={<AvatarStudio />} />

                  <Route path="projects" element={<CreatorProjects />} />
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

                  <Route path="tools" element={<CreatorToolsPage />} />
                  <Route
  path="tools/background-remover"
  element={<CreatorBackgroundRemover />}
/>
                <Route
  path="tools/costume-extractor"
  element={<CreatorCostumeExtractor />}
/>

<Route
  path="tools/text-to-image"
  element={<CreatorTextToImage />}
/>

<Route
  path="tools/sketch-to-image"
  element={<CreatorSketchToImage />}
/>

<Route
  path="tools/virtual-try-on"
  element={<CreatorVirtualTryOn />}
/>

<Route
  path="tools/multi-view-generator"
  element={<CreatorMultiViewGenerator />}
/>


<Route
  path="tools/pattern-extractor"
  element={<CreatorPatternExtractor />}
/>


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
            </RouteContent>
          </Elements>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
