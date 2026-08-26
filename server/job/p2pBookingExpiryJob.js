"use strict";

/*
=========================================================
DesignByYou / FashionVision
P2P Unpaid Booking Expiry Job
Version 1.0
=========================================================

This job periodically invokes the expiry service.

Guarantees:

- no overlapping sweep in the same Node process
- PostgreSQL advisory locking handles multiple instances
- graceful shutdown can wait for the active sweep
- timer is configurable
=========================================================
*/

const {
  expireUnpaidBookingsOnce,
  getP2PBookingExpiryConfig,
} = require(
  "../services/p2pBookingExpiryService",
);

/*=========================================================
Configuration
=========================================================*/

const DEFAULT_SWEEP_SECONDS =
  60;

let timer = null;

let activeRun = null;

let stopping = false;

function readBoolean(
  name,
  fallback = true,
) {
  const raw = String(
    process.env[name] ?? "",
  )
    .trim()
    .toLowerCase();

  if (!raw) {
    return fallback;
  }

  if (
    [
      "1",
      "true",
      "yes",
      "on",
    ].includes(raw)
  ) {
    return true;
  }

  if (
    [
      "0",
      "false",
      "no",
      "off",
    ].includes(raw)
  ) {
    return false;
  }

  return fallback;
}

function readSweepSeconds() {
  const value = Number(
    process.env
      .P2P_UNPAID_BOOKING_SWEEP_SECONDS,
  );

  /*
  Minimum five seconds allows quick local testing without
  permitting an excessively tight production loop.
  */

  if (
    !Number.isInteger(value) ||
    value < 5 ||
    value > 3600
  ) {
    return DEFAULT_SWEEP_SECONDS;
  }

  return value;
}

/*=========================================================
Run One Sweep
=========================================================*/

async function runSweep() {
  if (stopping) {
    return null;
  }

  /*
  Prevent overlapping sweeps inside this Node process.
  */

  if (activeRun) {
    return activeRun;
  }

  activeRun =
    (async () => {
      try {
        const summary =
          await expireUnpaidBookingsOnce();

        if (
          summary.lockAcquired &&
          (
            summary.scanned >
              0 ||
            summary.failed >
              0
          )
        ) {
          console.log(
            "P2P unpaid-booking expiry sweep:",
            summary,
          );
        }

        return summary;
      } catch (error) {
        console.error(
          "P2P unpaid-booking expiry sweep failed:",
          error,
        );

        return null;
      } finally {
        activeRun =
          null;
      }
    })();

  return activeRun;
}

/*=========================================================
Start Job
=========================================================*/

function startP2PBookingExpiryJob() {
  if (timer) {
    return;
  }

  const enabled =
    readBoolean(
      "P2P_UNPAID_BOOKING_EXPIRY_ENABLED",
      true,
    );

  if (!enabled) {
    console.log(
      "P2P unpaid-booking expiry job is disabled.",
    );

    return;
  }

  stopping = false;

  const sweepSeconds =
    readSweepSeconds();

  const {
    ttlMinutes,
    batchSize,
  } =
    getP2PBookingExpiryConfig();

  console.log(
    `P2P unpaid-booking expiry job started (TTL ${ttlMinutes}m, sweep ${sweepSeconds}s, batch ${batchSize}).`,
  );

  /*
  Run once immediately on startup.
  */

  void runSweep();

  timer = setInterval(
    () => {
      void runSweep();
    },

    sweepSeconds *
      1000,
  );

  /*
  The interval itself should not prevent Node from exiting.
  */

  timer.unref?.();
}

/*=========================================================
Stop Job
=========================================================*/

async function stopP2PBookingExpiryJob() {
  stopping = true;

  if (timer) {
    clearInterval(
      timer,
    );

    timer = null;
  }

  /*
  Wait for a currently-running sweep before the database
  pool is closed during graceful shutdown.
  */

  if (activeRun) {
    await activeRun;
  }
}

/*=========================================================
Exports
=========================================================*/

module.exports = {
  startP2PBookingExpiryJob,

  stopP2PBookingExpiryJob,

  runP2PBookingExpirySweepNow:
    runSweep,
};