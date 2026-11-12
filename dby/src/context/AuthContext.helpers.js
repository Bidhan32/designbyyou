// Shared helpers and state kept separate from the React refresh boundary.
/*
=========================================================
DesignByYou Authentication Context
Session Storage, Restoration & Revocation
Version 2.0
=========================================================
*/

import { createContext, useContext } from "react";

const AuthContext = createContext(null);

const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
};

export { AuthContext, useAuth };
