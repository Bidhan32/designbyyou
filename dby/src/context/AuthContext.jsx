import { AuthContext } from "./AuthContext.helpers.js";
"use strict";

/*
=========================================================
DesignByYou Authentication Context
Session Storage, Restoration & Revocation
Version 2.0
=========================================================
*/



import React, { useCallback, useEffect, useMemo, useState } from "react";

import API from "../api/axios";
import { requestSession } from "./sessionRequest";

/*=========================================================
Context
=========================================================*/



/*=========================================================
Helpers
=========================================================*/

function clearStoredAuth() {
  localStorage.removeItem("token");

  localStorage.removeItem("user");
}

/*=========================================================
Provider
=========================================================*/

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(null);

  /*=====================================================
    Restore Session
    =====================================================*/

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      setUser(null);
      setSessionError(null);
      setLoading(false);

      return;
    }

    setLoading(true);
    try {
      const currentUser = await requestSession(API, localStorage);
      if (currentUser !== undefined) setUser(currentUser);
      setSessionError(null);
    } catch (error) {
      setSessionError("Unable to restore your session. Please retry when your connection is available.");

      if (import.meta.env.DEV) {
        console.error(
          "Session restoration failed:",
          error.response?.data || error.message,
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /*=====================================================
    Initial Session Restoration

    Do NOT skip this based on current pathname.

    The previous implementation skipped /auth/me on public
    pages, which could leave an existing token unsynchronized
    for the entire SPA session.
    =====================================================*/

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  /*=====================================================
    Listen for Global Session Revocation
    =====================================================*/

  useEffect(() => {
    const handleSessionInvalidated = () => {
      clearStoredAuth();

      setUser(null);
      setSessionError(null);

      setLoading(false);
    };

    window.addEventListener(
      "auth:session-invalidated",
      handleSessionInvalidated,
    );

    return () => {
      window.removeEventListener(
        "auth:session-invalidated",
        handleSessionInvalidated,
      );
    };
  }, []);

  /*=====================================================
    Login
    =====================================================*/

  const login = useCallback((userData, token) => {
    if (!token || !userData) {
      throw new Error("Login response is missing authentication data.");
    }

    setSessionError(null);
    localStorage.setItem("token", token);

    /*
                Kept temporarily for compatibility.

                Components should prefer useAuth().user.
                */

    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
  }, []);

  /*=====================================================
    Logout
    =====================================================*/

  const logout = useCallback(() => {
    clearStoredAuth();

    setUser(null);

    /*
            Full navigation clears stale component state,
            pending requests and protected-route state.
            */

    window.location.assign("/login");
  }, []);

  /*=====================================================
    Refresh Current User

    Useful after profile/approval/subscription changes.
    =====================================================*/

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      setUser(null);

      return null;
    }

    const currentUser = await requestSession(API, localStorage);
    if (currentUser !== undefined) setUser(currentUser);
    setSessionError(null);
    return currentUser;
  }, []);

  /*=====================================================
    Context Value
    =====================================================*/

  const value = useMemo(
    () => ({
      user,

      setUser,

      loading,
      sessionError,
      retrySession: loadUser,

      isAuthenticated: Boolean(user),

      login,

      logout,

      refreshUser,
    }),
    [user, loading, sessionError, loadUser, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/*=========================================================
Hook
=========================================================*/
