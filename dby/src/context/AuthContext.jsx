"use strict";

/*
=========================================================
DesignByYou Authentication Context
Session Storage, Restoration & Revocation
Version 2.0
=========================================================
*/

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import API from "../api/axios";

/*=========================================================
Context
=========================================================*/

const AuthContext = createContext(null);

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

  /*=====================================================
    Restore Session
    =====================================================*/

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      setUser(null);
      setLoading(false);

      return;
    }

    try {
      const { data } = await API.get("/auth/me");

      if (data?.status === "success" && data?.data) {
        setUser(data.data);

        /*
                    Keep this only for compatibility with
                    older frontend code that may read user
                    directly from localStorage.

                    AuthContext remains the real source of
                    truth.
                    */

        localStorage.setItem("user", JSON.stringify(data.data));
      } else {
        clearStoredAuth();

        setUser(null);
      }
    } catch (error) {
      /*
                Axios already clears revoked/expired session
                tokens for known authentication failures.

                We still clear here as a defensive fallback.
                */

      clearStoredAuth();

      setUser(null);

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

    try {
      const { data } = await API.get("/auth/me");

      const currentUser = data?.data || null;

      setUser(currentUser);

      if (currentUser) {
        localStorage.setItem("user", JSON.stringify(currentUser));
      }

      return currentUser;
    } catch (error) {
      clearStoredAuth();

      setUser(null);

      throw error;
    }
  }, []);

  /*=====================================================
    Context Value
    =====================================================*/

  const value = useMemo(
    () => ({
      user,

      setUser,

      loading,

      isAuthenticated: Boolean(user),

      login,

      logout,

      refreshUser,
    }),
    [user, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/*=========================================================
Hook
=========================================================*/

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
};
