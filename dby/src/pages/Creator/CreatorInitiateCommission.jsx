"use strict";

/*
=========================================================
DesignByYou
Creator Initiate Commission
Version 2.0
=========================================================

PURPOSE
---------------------------------------------------------

This component is now a compatibility / routing bridge.

Historically this page contained its own commission form
and submitted to:

POST /creators/commissions/request

That created a second booking workflow separate from the
secure P2P booking system.

All Creator-to-Designer commissions must now use the single
canonical flow:

CreatorCreateBooking
        ↓
POST /p2p-bookings/create
        ↓
Stripe PaymentIntent
        ↓
POST /p2p-bookings/verify-escrow
        ↓
P2P booking workflow

=========================================================
WHY KEEP THIS COMPONENT?
---------------------------------------------------------

Existing links elsewhere in the application may still
navigate to this route.

Instead of breaking those links, this component forwards
them safely into:

/creator/bookings/new

while preserving:

- designer_id
- design_id
- indicative budget

=========================================================
IMPORTANT
---------------------------------------------------------

This component:

- does NOT create bookings
- does NOT call Stripe
- does NOT calculate fees
- does NOT trust client-side financial state
- does NOT duplicate CreatorCreateBooking

=========================================================
*/

import React, {
  useEffect,
  useMemo,
} from "react";

import {
  ArrowLeft,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

/*=========================================================
Helpers
=========================================================*/

function cleanValue(value) {
  const cleaned =
    String(
      value ?? "",
    ).trim();

  if (
    !cleaned ||
    ["null", "undefined"].includes(
      cleaned.toLowerCase(),
    )
  ) {
    return null;
  }

  return cleaned;
}

function positiveMoney(value) {
  const amount =
    Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return Number(
    amount.toFixed(2),
  );
}

/*=========================================================
Creator Initiate Commission
=========================================================*/

export default function CreatorInitiateCommission() {
  const {
    designerId,
  } = useParams();

  const navigate =
    useNavigate();

  const location =
    useLocation();

  /*
  Older Showcase / Designer Profile links may still pass
  the selected design through route state.

  We only use safe routing context from that object.

  The backend will independently validate:

  - Designer
  - design ownership
  - publication state
  - agreed amount
  - booking type
  */

  const referenceDesign =
    location.state
      ?.referenceDesign ||
    null;

  /*=======================================================
  Destination
  =======================================================*/

  const destination =
    useMemo(() => {
      const safeDesignerId =
        cleanValue(
          designerId,
        );

      if (!safeDesignerId) {
        return null;
      }

      const params =
        new URLSearchParams();

      params.set(
        "designer_id",
        safeDesignerId,
      );

      const designId =
        cleanValue(
          referenceDesign?.id,
        );

      if (designId) {
        params.set(
          "design_id",
          designId,
        );
      }

      /*
      base_price is only an indicative starting budget.

      CreatorCreateBooking allows the Creator to edit it.

      The backend remains authoritative for the eventual
      agreed booking amount and Stripe charge.
      */

      const budget =
        positiveMoney(
          referenceDesign
            ?.base_price,
        );

      if (budget) {
        params.set(
          "budget",
          String(budget),
        );
      }

      return `/creator/bookings/new?${params.toString()}`;
    }, [
      designerId,
      referenceDesign?.id,
      referenceDesign?.base_price,
    ]);

  /*=======================================================
  Redirect to Canonical Booking Flow
  =======================================================*/

  useEffect(() => {
    if (!destination) {
      return;
    }

    /*
    replace:true prevents the browser Back button from
    bouncing between this legacy bridge and the canonical
    booking form.
    */

    navigate(
      destination,
      {
        replace: true,
      },
    );
  }, [
    destination,
    navigate,
  ]);

  /*=======================================================
  Invalid Legacy Route
  =======================================================*/

  if (!destination) {
    return (
      <div
        className="
          relative
          flex
          min-h-[65vh]
          items-center
          justify-center
          overflow-hidden
          px-4
          py-16
          text-slate-950

          dark:text-white
        "
      >
        <div
          className="
            pointer-events-none
            absolute
            left-1/2
            top-1/2
            h-96
            w-96
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-[#D4AF37]/10
            blur-[120px]
          "
        />

        <section
          className="
            relative
            z-10
            w-full
            max-w-lg
            rounded-[2rem]
            border
            border-slate-200
            bg-white
            p-8
            text-center
            shadow-[0_25px_80px_rgba(15,23,42,0.08)]

            dark:border-white/[0.07]
            dark:bg-[#090909]
            dark:shadow-[0_35px_100px_rgba(0,0,0,0.55)]
          "
        >
          <div
            className="
              mx-auto
              grid
              h-16
              w-16
              place-items-center
              rounded-2xl
              border
              border-[#D4AF37]/25
              bg-[#D4AF37]/10
              text-[#997619]

              dark:text-[#D4AF37]
            "
          >
            <Sparkles
              size={27}
            />
          </div>

          <p
            className="
              mt-6
              text-[9px]
              font-black
              uppercase
              tracking-[0.24em]
              text-[#98751A]

              dark:text-[#D4AF37]
            "
          >
            Booking Setup
          </p>

          <h1
            className="
              mt-3
              font-serif
              text-3xl
              font-light

              sm:text-4xl
            "
          >
            Designer unavailable
          </h1>

          <p
            className="
              mx-auto
              mt-4
              max-w-sm
              text-sm
              leading-7
              text-slate-500

              dark:text-white/40
            "
          >
            This booking link does not
            contain a valid Designer.
            Return to the directory and
            choose a Designer before
            starting a contract.
          </p>

          <button
            type="button"
            onClick={() =>
              navigate(
                "/creator/directory",
              )
            }
            className="
              mt-7
              inline-flex
              h-12
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-[#D4AF37]
              px-6
              text-[9px]
              font-black
              uppercase
              tracking-[0.18em]
              text-black
              transition

              hover:-translate-y-0.5
              hover:bg-[#E4C65D]
            "
          >
            <ArrowLeft
              size={14}
            />

            Designer Directory
          </button>
        </section>
      </div>
    );
  }

  /*=======================================================
  Redirect Screen

  Usually visible only briefly.
  =======================================================*/

  return (
    <div
      className="
        relative
        flex
        min-h-[65vh]
        items-center
        justify-center
        overflow-hidden
        px-4
        py-16
        text-slate-950

        dark:text-white
      "
    >
      <div
        className="
          pointer-events-none
          absolute
          left-1/2
          top-1/2
          h-[34rem]
          w-[34rem]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          bg-[#D4AF37]/10
          blur-[150px]
        "
      />

      <section
        className="
          relative
          z-10
          w-full
          max-w-md
          rounded-[2rem]
          border
          border-slate-200/80
          bg-white/90
          p-8
          text-center
          shadow-[0_25px_80px_rgba(15,23,42,0.07)]
          backdrop-blur-xl

          dark:border-white/[0.07]
          dark:bg-[#090909]/90
          dark:shadow-[0_35px_100px_rgba(0,0,0,0.55)]
        "
      >
        <div
          className="
            relative
            mx-auto
            grid
            h-16
            w-16
            place-items-center
            rounded-2xl
            border
            border-emerald-200
            bg-emerald-50
            text-emerald-600

            dark:border-emerald-400/20
            dark:bg-emerald-400/10
            dark:text-emerald-300
          "
        >
          <LockKeyhole
            size={25}
          />

          <span
            className="
              absolute
              -right-1
              -top-1
              grid
              h-6
              w-6
              place-items-center
              rounded-full
              border-2
              border-white
              bg-[#D4AF37]
              text-black

              dark:border-[#090909]
            "
          >
            <ShieldCheck
              size={12}
            />
          </span>
        </div>

        <p
          className="
            mt-6
            text-[9px]
            font-black
            uppercase
            tracking-[0.24em]
            text-[#98751A]

            dark:text-[#D4AF37]
          "
        >
          Secure Booking
        </p>

        <h1
          className="
            mt-3
            font-serif
            text-3xl
            font-light
          "
        >
          Preparing your contract
        </h1>

        <p
          className="
            mt-3
            text-sm
            leading-6
            text-slate-500

            dark:text-white/40
          "
        >
          Moving you to the secure
          booking and Stripe escrow
          workflow.
        </p>

        <Loader2
          size={20}
          className="
            mx-auto
            mt-7
            animate-spin
            text-[#98751A]

            dark:text-[#D4AF37]
          "
        />
      </section>
    </div>
  );
}