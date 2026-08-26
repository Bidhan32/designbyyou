"use strict";

/*
=========================================================
DesignByYou Protected Route
Authentication & Role Authorization
Version 2.0
=========================================================
*/

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Loader2 } from "lucide-react";

import { useAuth } from "../context/AuthContext";

/*
IMPORTANT:

If ProtectedRoute.jsx is not located where this import works:

    ../context/AuthContext

adjust ONLY that import path to match your project structure.
*/

export const ProtectedRoute = ({ children, requiredRole }) => {
  const location = useLocation();

  const { user, loading } = useAuth();

  /*=====================================================
    Wait Until AuthContext Validates Existing JWT

    This prevents:

    browser refresh
        ↓
    user temporarily null
        ↓
    incorrect redirect to /login
    =====================================================*/

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            className="animate-spin text-[#D4AF37]"
            size={28}
            aria-hidden="true"
          />

          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400">
            Restoring Session
          </span>
        </div>
      </div>
    );
  }

  /*=====================================================
    Not Authenticated

    We do NOT trust localStorage token existence here.

    AuthContext already called /auth/me and validated:

    - JWT signature
    - expiry
    - token_version
    - current database user
    =====================================================*/

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{
          from: location,
        }}
        replace
      />
    );
  }

  /*=====================================================
    Role Authorization
    =====================================================*/

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  /*=====================================================
    Render Protected Content

    Supports BOTH:

    <ProtectedRoute>
        <SomePage />
    </ProtectedRoute>

    and nested React Router routes using <Outlet />.
    =====================================================*/

  return children || <Outlet />;
};

export default ProtectedRoute;
