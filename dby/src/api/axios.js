"use strict";

/*
=========================================================
DesignByYou Axios API Client
Authentication & Global Response Handling
Version 2.0
=========================================================
*/

import axios from "axios";

/*=========================================================
API Client
=========================================================*/

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1",

  timeout: 30000,
});

/*=========================================================
Request Interceptor
=========================================================*/

API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers = config.headers || {};

      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },

  (error) => {
    return Promise.reject(error);
  },
);

/*=========================================================
Session Failure Codes
=========================================================*/

const INVALID_SESSION_CODES = new Set([
  "TOKEN_EXPIRED",
  "INVALID_TOKEN",
  "SESSION_REVOKED",
  "SESSION_REFRESH_REQUIRED",
  "ACCOUNT_NOT_FOUND",
]);

/*=========================================================
Response Interceptor
=========================================================*/

API.interceptors.response.use(
  (response) => response,

  (error) => {
    const status = error.response?.status;

    const data = error.response?.data;

    const code = data?.code;

    /*-------------------------------------------------
        Maintenance Mode
        -------------------------------------------------*/

    if (status === 503 && data?.isMaintenance === true) {
      if (window.location.pathname !== "/maintenance") {
        window.location.assign("/maintenance");
      }

      return Promise.reject(error);
    }

    /*-------------------------------------------------
        Invalid / Revoked Authentication Session

        Examples:

        TOKEN_EXPIRED
        SESSION_REVOKED
        INVALID_TOKEN
        SESSION_REFRESH_REQUIRED
        ACCOUNT_NOT_FOUND
        -------------------------------------------------*/

    if (status === 401 && INVALID_SESSION_CODES.has(code)) {
      localStorage.removeItem("token");

      localStorage.removeItem("user");

      /*
            Notify AuthContext immediately.

            This avoids importing AuthContext here and
            creating a circular dependency.
            */

      window.dispatchEvent(
        new CustomEvent("auth:session-invalidated", {
          detail: {
            code,
            message: data?.message || "Your session is no longer valid.",
          },
        }),
      );
    }

    return Promise.reject(error);
  },
);

export default API;
