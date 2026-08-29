"use strict";

/*
=========================================================
DesignByYou Backend Server
Express Application Entry Point
Version 3.5
=========================================================

Version 3.5 additions:

- Starts the P2P unpaid-booking expiry job after the HTTP
  server successfully begins listening.
- Stops the expiry job during graceful shutdown BEFORE the
  database pool is closed.
- Preserves Stripe raw-body webhook ordering.
=========================================================
*/

require("dotenv").config();

const path = require("path");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const db = require("./config/db");

/*=========================================================
Background Jobs
=========================================================*/

const {
  startP2PBookingExpiryJob,
  stopP2PBookingExpiryJob,
} = require("./job/p2pBookingExpiryJob");

/*=========================================================
Route Imports
=========================================================*/

const authRoutes = require("./routes/authRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const designerRoutes = require("./routes/designerRoutes");
const creatorRoutes = require("./routes/creatorRoutes");
const creatorFinanceRoutes = require("./routes/creatorFinanceRoute");
const marketplaceRoutes = require("./routes/marketplaceRoutes");
const p2pBookingRoutes = require("./routes/p2pBookingRoutes");
const aiFashionRoutes = require("./routes/aiFashionRoutes");
const virtualTryOnRoutes = require("./routes/virtualTryOnRoutes");
const chatRoutes = require("./routes/chatRoutes");
const userRoutes = require("./routes/userRoutes");
const designRoutes = require("./routes/designRoutes");
const designerProfileRoutes = require("./routes/designerProfileRoute");
const designerFinanceRoutes = require("./routes/designerFinanceRoutes");
const showcaseRoutes = require("./routes/showcaseRoute");
const subscriptionRoutes = require("./routes/subscriptionRoute");
const publicRoutes = require("./routes/publicRoutes");
const webhookRoutes = require("./routes/webhookController");
const creatorShowcaseRoutes = require("./routes/creatorshowcaseroute");
const avatarRoutes = require("./routes/avatarRoutes");
const showcaseHeroRoutes = require("./routes/showcaseHeroRoutes");

/*=========================================================
Application Configuration
=========================================================*/

const app = express();

const NODE_ENV = String(process.env.NODE_ENV || "development")
  .trim()
  .toLowerCase();

const isProduction = NODE_ENV === "production";

const parsedPort = Number(process.env.PORT);

const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 8080;

app.disable("x-powered-by");

/*=========================================================
Development API Cache Control

Disables Express ETags and browser API caching during
development so API responses normally return HTTP 200
instead of HTTP 304.
=========================================================*/

if (!isProduction) {
  app.disable("etag");

  app.use((req, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    res.setHeader("Pragma", "no-cache");

    res.setHeader("Expires", "0");

    res.setHeader("Surrogate-Control", "no-store");

    next();
  });
}

if (isProduction) {
  /*
  Required when the application runs behind a trusted
  reverse proxy such as Render, Railway, Heroku, Nginx
  or Cloudflare.
  */

  app.set("trust proxy", 1);
}

/*=========================================================
CORS Configuration
=========================================================*/

function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

const configuredOrigins = [
  process.env.CLIENT_URL,

  ...String(process.env.CLIENT_URLS || "").split(","),
]
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins);

const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const corsOptions = {
  origin(origin, callback) {
    /*
    Requests without an Origin header include Postman,
    mobile applications, server-to-server requests and
    Stripe webhooks.
    */

    if (!origin) {
      return callback(null, true);
    }

    const normalizedRequestOrigin = normalizeOrigin(origin);

    if (allowedOrigins.has(normalizedRequestOrigin)) {
      return callback(null, true);
    }

    /*
    Permit localhost and 127.0.0.1 automatically during
    development, regardless of the frontend port.
    */

    if (!isProduction && localhostPattern.test(normalizedRequestOrigin)) {
      return callback(null, true);
    }

    const error = new Error("This request origin is not allowed.");

    error.statusCode = 403;
    error.status = "fail";
    error.code = "CORS_NOT_ALLOWED";

    return callback(error);
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],

  exposedHeaders: ["Content-Disposition"],

  maxAge: 86400,
};

/*=========================================================
Application Security and Logging
=========================================================*/

app.use(
  helmet({
    /*
    API responses and uploaded images are consumed by
    a separate frontend origin.
    */

    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

app.use(cors(corsOptions));

if (NODE_ENV === "development") {
  app.use(morgan("dev"));
} else if (process.env.HTTP_LOGGING === "true") {
  app.use(morgan("combined"));
}

/*=========================================================
Health Checks
=========================================================*/

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "UP",

    environment: NODE_ENV,

    timestamp: new Date().toISOString(),
  });
});

app.get("/api/v1/health", (req, res) => {
  return res.status(200).json({
    status: "UP",

    environment: NODE_ENV,

    timestamp: new Date().toISOString(),
  });
});

/*=========================================================
Stripe Webhook Routes

Both webhook endpoints are mounted through this raw-body
prefix:

- /api/v1/webhooks/stripe
- /api/v1/webhooks/stripe/connect

IMPORTANT:

1. This mount must remain above express.json().
2. The webhook router must not call express.raw() again.
3. req.body reaches both webhook handlers as an untouched
   Buffer.
=========================================================*/

app.use(
  "/api/v1/webhooks",

  express.raw({
    type: "application/json",

    limit: "2mb",
  }),

  webhookRoutes,
);

/*=========================================================
Large Design Workspace Parser

Only this route receives the larger request-body allowance.
=========================================================*/

app.use(
  "/api/v1/workspace",

  express.json({
    limit: "50mb",
  }),

  express.urlencoded({
    extended: true,

    limit: "50mb",
  }),

  designRoutes,
);

/*=========================================================
Standard Body Parsers

All ordinary JSON routes are mounted after these parsers.
=========================================================*/

app.use(
  express.json({
    limit: "2mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,

    limit: "2mb",
  }),
);

/*=========================================================
Static Uploaded Assets

Avatar previews and other uploaded files are served from
the backend origin under /uploads.

Internal3D model assets may later be served from a
dedicated asset/CDN path.

This route remains for existing uploads.
=========================================================*/

app.use(
  "/uploads",

  express.static(path.join(process.cwd(), "uploads"), {
    fallthrough: true,

    index: false,

    dotfiles: "deny",

    maxAge: isProduction ? "7d" : 0,

    immutable: isProduction,
  }),
);

/*=========================================================
API Routes
=========================================================*/

app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/superadmin", superAdminRoutes);

app.use("/api/v1/showcase-hero", showcaseHeroRoutes);

app.use("/api/v1/designer", designerRoutes);

app.use("/api/v1/designer-settings", designerProfileRoutes);

app.use("/api/v1/designer-finance", designerFinanceRoutes);

app.use("/api/v1/creators", creatorRoutes);

app.use("/api/v1/creator-finance", creatorFinanceRoutes);

app.use("/api/v1/users", userRoutes);

app.use("/api/v1/marketplace", marketplaceRoutes);

app.use("/api/v1/p2p-bookings", p2pBookingRoutes);

app.use("/api/v1/virtual-tryon", virtualTryOnRoutes);
app.use("/api/v1/ai-fashion", aiFashionRoutes);

app.use("/api/v1/chat", chatRoutes);

app.use("/api/v1/subscription", subscriptionRoutes);

app.use("/api/v1/showcase", showcaseRoutes);

app.use("/api/v1/creator-showcase", creatorShowcaseRoutes);

app.use("/api/v1/all", publicRoutes);

/*
=========================================================
Shared Avatar API

The avatar router owns all shared creator/designer avatar
routes.

Current migration direction:

fashion_persona_2d
    -> legacy / fallback renderer

internal_3d
    -> primary 3D Fashion Persona engine

No external avatar-provider webhook is mounted here.
=========================================================
*/

app.use("/api/v1", avatarRoutes);

/*=========================================================
404 Handler
=========================================================*/

app.use((req, res) => {
  return res.status(404).json({
    status: "fail",

    message: `Can't find ${req.method} ${req.originalUrl} on this server.`,
  });
});

/*=========================================================
Global Error Handler
=========================================================*/

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  /* ---------------------------------------------------
    Invalid JSON request body
    --------------------------------------------------- */

  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    Object.prototype.hasOwnProperty.call(error, "body")
  ) {
    return res.status(400).json({
      status: "fail",

      message: "The request contains invalid JSON.",
    });
  }

  /* ---------------------------------------------------
    Request body too large
    --------------------------------------------------- */

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      status: "fail",

      message: "The submitted request is too large.",
    });
  }

  /* ---------------------------------------------------
    Unsupported request body type
    --------------------------------------------------- */

  if (error.type === "entity.unsupported") {
    return res.status(415).json({
      status: "fail",

      message: "The submitted content type is not supported.",
    });
  }

  /* ---------------------------------------------------
    CORS rejection
    --------------------------------------------------- */

  if (error.code === "CORS_NOT_ALLOWED") {
    return res.status(403).json({
      status: "fail",

      message: "This request origin is not allowed.",
    });
  }

  const requestedStatusCode = Number(error.statusCode || error.status);

  const statusCode =
    Number.isInteger(requestedStatusCode) &&
    requestedStatusCode >= 400 &&
    requestedStatusCode <= 599
      ? requestedStatusCode
      : 500;

  const status =
    error.status === "fail" || error.status === "error"
      ? error.status
      : statusCode >= 500
        ? "error"
        : "fail";

  if (statusCode >= 500) {
    console.error("GLOBAL SERVER ERROR:", {
      method: req.method,

      path: req.originalUrl,

      message: error.message,

      stack: NODE_ENV === "development" ? error.stack : undefined,
    });
  }

  return res.status(statusCode).json({
    status,

    message:
      statusCode >= 500 && isProduction
        ? "An unexpected server error occurred."
        : error.message || "An unexpected server error occurred.",

    ...(NODE_ENV === "development"
      ? {
          stack: error.stack,
        }
      : {}),
  });
});

/*=========================================================
Server Lifecycle
=========================================================*/

let server = null;

let shuttingDown = false;

/*=========================================================
Startup Information
=========================================================*/

function printStartupMessage() {
  const originSummary =
    configuredOrigins.length > 0
      ? configuredOrigins.join(", ")
      : isProduction
        ? "No browser origin configured"
        : "Localhost development origins";

  console.log(`
=========================================================
🚀 DesignByYou Server Running
📡 Port: ${PORT}
🌍 Environment: ${NODE_ENV}
🖥️ Allowed origins: ${originSummary}
🔐 Stripe platform webhook: /api/v1/webhooks/stripe
🏦 Stripe Connect webhook: /api/v1/webhooks/stripe/connect
🧑 Avatar API: /api/v1/avatar/me
🖼️ Uploaded assets: /uploads
⏳ P2P unpaid-booking expiry worker: ${
    String(process.env.P2P_UNPAID_BOOKING_EXPIRY_ENABLED ?? "true")
      .trim()
      .toLowerCase() === "false"
      ? "disabled"
      : "enabled"
  }
=========================================================
  `);

  if (!String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "").trim()) {
    console.warn(
      "WARNING: STRIPE_CONNECT_WEBHOOK_SECRET is not configured. Connected-account payout webhook requests will fail until it is added.",
    );
  }

  if (isProduction && configuredOrigins.length === 0) {
    console.warn(
      "WARNING: No CLIENT_URL or CLIENT_URLS value is configured. Browser requests will be rejected by CORS.",
    );
  }

  if (
    !isProduction &&
    configuredOrigins.some((origin) =>
      origin.includes("your-frontend-domain.com"),
    )
  ) {
    console.warn(
      "WARNING: CLIENT_URL still contains the placeholder frontend domain. Set it to your local frontend URL, such as http://localhost:5173.",
    );
  }
}

/*=========================================================
Start HTTP Server
=========================================================*/

function startServer() {
  if (server) {
    return server;
  }

  /*
  Do not start the background expiry worker until Node has
  successfully bound the HTTP listening socket.
  */

  server = app.listen(PORT, () => {
    printStartupMessage();

    try {
      startP2PBookingExpiryJob();
    } catch (error) {
      /*
        A synchronous startup problem in the worker should
        be visible immediately.

        The job itself also logs asynchronous sweep errors.
        */

      console.error("Unable to start P2P unpaid-booking expiry job:", error);
    }
  });

  server.on("error", (error) => {
    console.error("HTTP SERVER ERROR:", error);
  });

  return server;
}

/*=========================================================
Stop Background Jobs
=========================================================*/

async function stopBackgroundJobs() {
  try {
    await stopP2PBookingExpiryJob();

    console.log("P2P unpaid-booking expiry job stopped.");
  } catch (error) {
    /*
    Continue graceful shutdown even if a worker reports a
    shutdown problem.

    We still need to close HTTP and PostgreSQL resources.
    */

    console.error(
      "Unable to stop P2P unpaid-booking expiry job cleanly:",
      error,
    );
  }
}

/*=========================================================
Close HTTP Server
=========================================================*/

async function closeHttpServer() {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);

        return;
      }

      resolve();
    });

    /*
      Close idle keep-alive connections immediately when
      supported by the current Node.js version.

      Active requests are still allowed to finish normally.
      */

    server.closeIdleConnections?.();
  });

  /*
  Prevent accidental reuse of the closed server reference.
  */

  server = null;
}

/*=========================================================
Close Database Pool
=========================================================*/

async function closeDatabasePool() {
  if (typeof db?.end === "function") {
    await db.end();
  }
}

/*=========================================================
Graceful Shutdown
=========================================================*/

async function shutdownServer(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`${signal} received. Starting graceful shutdown...`);

  /*
  The worker may currently be performing Stripe/database
  reconciliation.

  Give the complete shutdown sequence enough time to finish
  safely before forcing remaining connections closed.
  */

  const forceShutdownTimer = setTimeout(
    () => {
      console.error(
        "Graceful shutdown timed out. Forcing remaining connections closed.",
      );

      server?.closeAllConnections?.();

      process.exit(1);
    },

    30000,
  );

  forceShutdownTimer.unref();

  try {
    /*
    Stop the recurring job first.

    stopP2PBookingExpiryJob() also waits for an active sweep
    to finish before returning.

    The database pool must therefore remain open until this
    step completes.
    */

    await stopBackgroundJobs();

    /*
    Stop accepting new HTTP requests after the worker has
    been disabled.
    */

    await closeHttpServer();

    console.log("HTTP server closed.");

    /*
    PostgreSQL is the final application resource to close.
    */

    await closeDatabasePool();

    console.log("Database pool closed.");

    clearTimeout(forceShutdownTimer);

    process.exit(exitCode);
  } catch (error) {
    clearTimeout(forceShutdownTimer);

    console.error("Graceful shutdown failed:", error);

    server?.closeAllConnections?.();

    process.exit(1);
  }
}

/*=========================================================
Process Handlers
=========================================================*/

function registerProcessHandlers() {
  process.on("unhandledRejection", (error) => {
    console.error("UNHANDLED PROMISE REJECTION:", error);

    void shutdownServer("unhandledRejection", 1);
  });

  process.on("uncaughtException", (error) => {
    console.error("UNCAUGHT EXCEPTION:", error);

    void shutdownServer("uncaughtException", 1);
  });

  process.on("SIGTERM", () => {
    void shutdownServer("SIGTERM", 0);
  });

  process.on("SIGINT", () => {
    void shutdownServer("SIGINT", 0);
  });
}

/*=========================================================
Application Bootstrap
=========================================================*/

if (require.main === module) {
  registerProcessHandlers();

  startServer();
}

/*=========================================================
Exports for Testing
=========================================================*/

module.exports = {
  app,

  startServer,

  shutdownServer,

  get server() {
    return server;
  },
};
