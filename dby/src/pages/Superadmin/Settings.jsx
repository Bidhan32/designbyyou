"use strict";

/*
=========================================================
DesignByYou Super Admin Settings
Designer Tier Policy + Showcase Configuration
Version 3.1
=========================================================

Current backend support:

DESIGNER TIER COMMISSION POLICY
GET /api/v1/superadmin/commission

The commission policy is READ-ONLY.

Bronze
- 0 to 4 completed bookings
- Designer receives 10%

Silver
- 5 to 19 completed bookings
- Designer receives 15%

Gold
- 20 to 34 completed bookings
- Designer receives 20%

Platinum
- 35 to 49 completed bookings
- Designer receives 25%

Diamond
- 50+ completed bookings
- Designer receives 30%

There is intentionally NO global commission update endpoint.

SHOWCASE HERO
GET   /api/v1/superadmin/showcase-hero
PATCH /api/v1/superadmin/showcase-hero

The Showcase Hero configuration is shared by:

- CreatorShowcase.jsx
- DesignerMarketplace.jsx

Hero modes:

1. slideshow
   - 3 to 5 images when enabled
   - configurable rotation time

2. video
   - one background video
   - optional poster image

Only ONE mode is rendered at a time.

Maintenance mode is intentionally not exposed here until
there is persistent backend support for it.
=========================================================
*/

import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DollarSign,
  Image,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Video,
} from "lucide-react";

import API from "../../api/axios";

/*=========================================================
Hero Helpers
=========================================================*/

const createHeroState = (data = {}) => {
  const savedImages = Array.isArray(data.slideshow_images)
    ? data.slideshow_images.filter((item) => typeof item === "string")
    : [];

  /*
  Keep a minimum of 3 input slots visible in the Super Admin
  interface even when the Hero is currently disabled/empty.
  */

  const paddedImages = [...savedImages];

  while (paddedImages.length < 3) {
    paddedImages.push("");
  }

  return {
    revision: data.revision,
    campaign_looks: data.campaign_looks || [],
    mode: data.mode === "video" ? "video" : "slideshow",

    slideshow_images: paddedImages.slice(0, 5),

    video_url: typeof data.video_url === "string" ? data.video_url : "",

    video_poster_url:
      typeof data.video_poster_url === "string" ? data.video_poster_url : "",

    rotation_seconds: String(Number(data.rotation_seconds || 6)),

    is_enabled: data.is_enabled === true,
  };
};

const normalizeHeroForComparison = (hero) => ({
  campaign_looks: hero.campaign_looks,
  mode: hero.mode === "video" ? "video" : "slideshow",

  slideshow_images: Array.isArray(hero.slideshow_images)
    ? [...new Set(hero.slideshow_images.map((item) => String(item || "").trim()).filter(Boolean))]
    : [],

  video_url: String(hero.video_url || "").trim(),

  video_poster_url: String(hero.video_poster_url || "").trim(),

  rotation_seconds: String(Number(hero.rotation_seconds)),

  is_enabled: hero.is_enabled === true,
});

/*=========================================================
Commission Helpers
=========================================================*/

const formatTierLabel = (value) => {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  if (!text) {
    return "Unknown";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
};

const formatBookingRange = (tier) => {
  const minimum = Number(tier?.minimum_completed_bookings);

  const maximum = tier?.maximum_completed_bookings;

  if (!Number.isFinite(minimum)) {
    return "—";
  }

  if (maximum === null || maximum === undefined) {
    return `${minimum}+`;
  }

  const parsedMaximum = Number(maximum);

  if (!Number.isFinite(parsedMaximum)) {
    return `${minimum}+`;
  }

  return `${minimum}–${parsedMaximum}`;
};

/*=========================================================
System Settings
=========================================================*/

const SystemSettings = () => {
  /*=======================================================
  Designer Tier Commission State
  =======================================================*/

  const [commissionInfo, setCommissionInfo] = useState(null);

  /*=======================================================
  Showcase Hero State
  =======================================================*/

  const [hero, setHero] = useState(createHeroState());

  const [originalHero, setOriginalHero] = useState(createHeroState());

  const [conflictingHero, setConflictingHero] = useState(null);
  const [heroPreviewIndex, setHeroPreviewIndex] = useState(0);

  /*=======================================================
  General State
  =======================================================*/

  const [loading, setLoading] = useState(true);

  const [savingHero, setSavingHero] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  /*=======================================================
  Load Current Settings
  =======================================================*/

  const fetchSettings = useCallback(async () => {
    setLoading(true);

    setError("");
    setSuccess("");

    try {
      const [commissionResponse, heroResponse] = await Promise.all([
        API.get("/superadmin/commission"),

        API.get("/superadmin/showcase-hero"),
      ]);

      /* ------------------------------------------------
          Designer Tier Commission Policy
          ------------------------------------------------ */

      const commissionData = commissionResponse.data?.data;

      if (!commissionData) {
        throw new Error("Designer tier commission policy was not returned.");
      }

      setCommissionInfo(commissionData);

      /* ------------------------------------------------
          Showcase Hero
          ------------------------------------------------ */

      const heroData = heroResponse.data?.data;

      if (!heroData) {
        throw new Error("Showcase Hero configuration was not returned.");
      }

      const normalizedHero = createHeroState(heroData);

      setHero(normalizedHero);

      setOriginalHero(normalizedHero);

      setHeroPreviewIndex(0);
    } catch (err) {
      console.error("Failed to load platform settings:", err);

      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to load platform settings.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /*=======================================================
  Commission Derived State
  =======================================================*/

  const tierPolicy = useMemo(() => {
    return Array.isArray(commissionInfo?.policy) ? commissionInfo.policy : [];
  }, [commissionInfo]);

  const designerProfiles = Number(commissionInfo?.designer_profiles || 0);

  const policyMismatches = Number(commissionInfo?.policy_mismatches || 0);

  const policyConsistent = commissionInfo?.policy_consistent === true;

  /*=======================================================
  Hero Derived State
  =======================================================*/

  const cleanedHeroImages = useMemo(
    () =>
      hero.slideshow_images
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    [hero.slideshow_images],
  );

  const heroRotationNumber = Number(hero.rotation_seconds);

  const heroRotationValid =
    Number.isInteger(heroRotationNumber) &&
    heroRotationNumber >= 3 &&
    heroRotationNumber <= 30;

  const slideshowValid =
    cleanedHeroImages.length >= 3 && cleanedHeroImages.length <= 5;

  const videoValid = String(hero.video_url || "").trim().length > 0;

  const heroValid =
    heroRotationValid &&
    (!hero.is_enabled ||
      (hero.mode === "slideshow" ? slideshowValid : videoValid));

  const heroHasChanges =
    JSON.stringify(normalizeHeroForComparison(hero)) !==
    JSON.stringify(normalizeHeroForComparison(originalHero));

  const currentPreviewImage =
    cleanedHeroImages[
      heroPreviewIndex % Math.max(cleanedHeroImages.length, 1)
    ] || "";

  /*=======================================================
  Slideshow Preview Rotation
  =======================================================*/

  useEffect(() => {
    if (
      hero.mode !== "slideshow" ||
      cleanedHeroImages.length < 2 ||
      !heroRotationValid
    ) {
      return undefined;
    }

    const timer = window.setInterval(
      () => {
        setHeroPreviewIndex(
          (current) => (current + 1) % cleanedHeroImages.length,
        );
      },

      heroRotationNumber * 1000,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    hero.mode,
    cleanedHeroImages.length,
    heroRotationNumber,
    heroRotationValid,
  ]);

  useEffect(() => {
    if (heroPreviewIndex >= cleanedHeroImages.length) {
      setHeroPreviewIndex(0);
    }
  }, [cleanedHeroImages.length, heroPreviewIndex]);

  /*=======================================================
  Hero Form Helpers
  =======================================================*/

  const handleHeroImageChange = (index, value) => {
    setHero((current) => {
      const images = [...current.slideshow_images];

      images[index] = value;

      return {
        ...current,

        slideshow_images: images,
      };
    });

    setHeroPreviewIndex(0);

    if (error) {
      setError("");
    }

    if (success) {
      setSuccess("");
    }
  };

  const handleAddHeroImage = () => {
    setHero((current) => {
      if (current.slideshow_images.length >= 5) {
        return current;
      }

      return {
        ...current,

        slideshow_images: [...current.slideshow_images, ""],
      };
    });
  };

  const handleRemoveHeroImage = (index) => {
    setHero((current) => {
      if (current.slideshow_images.length <= 3) {
        return current;
      }

      return {
        ...current,

        slideshow_images: current.slideshow_images.filter(
          (_item, itemIndex) => itemIndex !== index,
        ),
      };
    });

    setHeroPreviewIndex(0);
  };

  /*=======================================================
  Save Showcase Hero
  =======================================================*/

  const handleSaveHero = async (event) => {
    event.preventDefault();

    if (savingHero || conflictingHero || !heroHasChanges) {
      return;
    }

    setError("");
    setSuccess("");

    if (!heroRotationValid) {
      setError(
        "Slideshow rotation must be an integer between 3 and 30 seconds.",
      );

      return;
    }

    if (hero.is_enabled && hero.mode === "slideshow" && !slideshowValid) {
      setError("An enabled slideshow requires between 3 and 5 image URLs.");

      return;
    }

    if (hero.is_enabled && hero.mode === "video" && !videoValid) {
      setError("An enabled video Hero requires a video URL.");

      return;
    }

    if (hero.is_enabled) {
      const modeLabel =
        hero.mode === "video" ? "background video" : "image slideshow";

      const confirmed = window.confirm(
        `Enable the shared Showcase Hero using the ${modeLabel}?\n\nThis background will be used by both Creator Showcase and Designer Marketplace.`,
      );

      if (!confirmed) {
        return;
      }
    }

    setSavingHero(true);

    try {
      const response = await API.patch("/superadmin/showcase-hero", {
        revision: originalHero.revision,
        campaign_looks: hero.campaign_looks.filter(look => [...cleanedHeroImages, hero.video_url].includes(look.media)),
        mode: hero.mode,

        slideshow_images: cleanedHeroImages,

        video_url: String(hero.video_url || "").trim() || null,

        video_poster_url: String(hero.video_poster_url || "").trim() || null,

        rotation_seconds: heroRotationNumber,

        is_enabled: hero.is_enabled,
      });

      const returned = response.data?.data;

      const normalized = createHeroState(
        returned || {
          ...hero,

          slideshow_images: cleanedHeroImages,
        },
      );

      setHero(normalized);

      setOriginalHero(normalized);

      setHeroPreviewIndex(0);

      setSuccess(
        response.data?.message ||
          "Showcase Hero configuration updated successfully.",
      );
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.data) {
        setConflictingHero(createHeroState(err.response.data.data));
        return;
      }
      console.error("Failed to update Showcase Hero:", err);

      setError(
        err.response?.data?.message ||
          "Failed to update Showcase Hero configuration.",
      );
    } finally {
      setSavingHero(false);
    }
  };

  /*=======================================================
  Loading
  =======================================================*/

  if (loading) {
    return (
      <div className="min-h-[420px] flex flex-col items-center justify-center gap-4">
        <RefreshCw
          size={28}
          className="animate-spin text-action"
          aria-hidden="true"
        />

        <p className="text-[10px] font-semibold uppercase tracking-normal text-muted">
          Loading Platform Configuration...
        </p>
      </div>
    );
  }

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-8 pb-20">
      {/*===============================================
      Header
      ===============================================*/}

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck
              size={15}
              className="text-action"
              aria-hidden="true"
            />

            <span className="text-[10px] font-semibold uppercase tracking-normal text-action">
              Super Admin Control
            </span>
          </div>

          <h1 className="text-3xl font-serif italic text-ink">
            Platform Settings
          </h1>

          <p className="text-muted text-sm mt-1">
            Review Designer tier commission policy and manage the shared
            Showcase presentation.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchSettings}
          disabled={savingHero || heroHasChanges || Boolean(conflictingHero)}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-surface border border-line rounded-md text-[10px] font-semibold uppercase tracking-widest text-muted hover:border-line hover:text-ink transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {/*===============================================
      Messages
      ===============================================*/}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-md bg-canvas border border-line flex items-start gap-3"
        >
          <AlertTriangle
            size={18}
            className="text-action mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />

          <div>
            <p className="text-xs font-bold text-action">
              Configuration Error
            </p>

            <p className="text-xs text-action mt-1">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-md bg-canvas border border-line flex items-start gap-3">
          <CheckCircle2
            size={18}
            className="text-action mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />

          <div>
            <p className="text-xs font-bold text-action">
              Configuration Updated
            </p>

            <p className="text-xs text-action mt-1">{success}</p>
          </div>
        </div>
      )}

      {/*===============================================
      Designer Tier Commission Policy
      ===============================================*/}

      <section className="bg-surface border border-line rounded-md overflow-hidden">
        <div className="p-4 border-b border-line">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-md bg-subtle">
                <DollarSign
                  size={22}
                  className="text-action"
                  aria-hidden="true"
                />
              </div>

              <div>
                <h2 className="text-lg font-bold text-ink">
                  Designer Tier Commission
                </h2>

                <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">
                  Designer commission is determined automatically by completed
                  bookings. The percentage shown for each tier is the portion of
                  the booking base amount credited to the Designer when a
                  completed booking is released.
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-canvas border border-line text-muted">
              <ShieldCheck
                size={14}
                className="text-action"
                aria-hidden="true"
              />

              <span className="text-[10px] font-semibold uppercase tracking-widest">
                Read Only Policy
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-7">
          {/* Summary */}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoCard label="Designer Profiles" value={designerProfiles} />

            <InfoCard label="Policy Mismatches" value={policyMismatches} />

            <InfoCard
              label="Policy Status"
              value={policyConsistent ? "Healthy" : "Review"}
            />
          </div>

          {/* Policy integrity warning */}

          {!policyConsistent && policyMismatches > 0 && (
            <div className="p-4 bg-canvas border border-line rounded-md flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="text-action mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="text-xs font-bold text-action">
                  Tier Policy Mismatch Detected
                </p>

                <p className="text-xs text-action mt-1 leading-relaxed">
                  {policyMismatches} Designer profile
                  {policyMismatches === 1 ? "" : "s"} currently do not match the
                  expected commission rate for their stored tier. The booking
                  release logic remains tier-based, but these records should be
                  reviewed.
                </p>
              </div>
            </div>
          )}

          {policyConsistent && (
            <div className="p-4 bg-canvas border border-line rounded-md flex items-start gap-3">
              <CheckCircle2
                size={17}
                className="text-action mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="text-xs font-bold text-action">
                  Tier Policy Synchronized
                </p>

                <p className="text-xs text-action mt-1 leading-relaxed">
                  Existing Designer profiles match the expected commission rate
                  for their current tier.
                </p>
              </div>
            </div>
          )}

          {/* Tier Table */}

          <div className="overflow-hidden rounded-md border border-line">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-canvas">
                  <tr>
                    <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                      Tier
                    </th>

                    <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                      Completed Bookings
                    </th>

                    <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                      Designer Commission
                    </th>

                    <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                      Designers
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-line">
                  {tierPolicy.length > 0 ? (
                    tierPolicy.map((tier, index) => (
                      <tr key={tier.tier || index} className="bg-surface">
                        <td className="px-5 py-5">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-md bg-subtle flex items-center justify-center">
                              <ShieldCheck
                                size={16}
                                className="text-action"
                                aria-hidden="true"
                              />
                            </div>

                            <div>
                              <p className="text-sm font-bold text-ink">
                                {formatTierLabel(tier.tier)}
                              </p>

                              <p className="text-[10px] text-muted mt-1 uppercase tracking-wider">
                                Tier {index + 1}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-5">
                          <p className="text-sm font-mono font-bold text-ink">
                            {formatBookingRange(tier)}
                          </p>
                        </td>

                        <td className="px-5 py-5">
                          <div className="inline-flex items-center px-3 py-1.5 rounded-md bg-canvas border border-line">
                            <span className="text-sm font-mono font-bold text-action">
                              {Number(tier.commission_rate || 0)}%
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-5">
                          <p className="text-sm font-mono font-bold text-ink">
                            {Number(tier.designer_count || 0)}
                          </p>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-10 text-center text-sm text-muted"
                      >
                        No tier policy information was returned.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Business rule explanation */}

          <div className="bg-canvas border border-line rounded-md p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Automatic Tier Progression
            </p>

            <p className="text-xs text-muted mt-3 leading-relaxed">
              Tier progression is based on completed bookings. The booking that
              reaches a threshold uses the new tier immediately. For example, a
              Designer completing their 5th booking receives the Silver 15%
              commission for that booking.
            </p>

            <p className="text-xs text-muted mt-2 leading-relaxed">
              Super Admin cannot manually overwrite these rates from this
              screen. This prevents a global setting from conflicting with the
              tier-based booking payout rules.
            </p>
          </div>
        </div>
      </section>

      {/*===============================================
      Showcase Hero Configuration
      ===============================================*/}

      <section className="bg-surface border border-line rounded-md overflow-hidden">
        <div className="p-4 border-b border-line">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-md bg-subtle">
                {hero.mode === "video" ? (
                  <Video
                    size={22}
                    className="text-action"
                    aria-hidden="true"
                  />
                ) : (
                  <Image
                    size={22}
                    className="text-action"
                    aria-hidden="true"
                  />
                )}
              </div>

              <div>
                <h2 className="text-lg font-bold text-ink">
                  Shared Showcase Hero
                </h2>

                <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">
                  Choose the background presentation shared by Creator Showcase
                  and Designer Marketplace. Only one media mode runs at a time.
                </p>
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md border ${
                hero.is_enabled
                  ? "bg-canvas border-line text-action"
                  : "bg-canvas border-line text-muted"
              }`}
            >
              <Power size={14} aria-hidden="true" />

              <span className="text-[10px] font-semibold uppercase tracking-widest">
                {hero.is_enabled ? "Hero Enabled" : "Hero Disabled"}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveHero} className="p-4">
          <fieldset disabled={savingHero} className="min-w-0 space-y-8">
          {/*===========================================
          Enable / Disable
          ===========================================*/}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-md bg-canvas border border-line">
            <div>
              <p className="text-sm font-bold text-ink">
                Use Super Admin Hero
              </p>

              <p className="text-xs text-muted mt-1 leading-relaxed">
                When disabled, both Showcase pages keep their existing fallback
                Hero backgrounds.
              </p>
            </div>

            <button
              type="button"
              disabled={savingHero}
              onClick={() => {
                setHero((current) => ({
                  ...current,

                  is_enabled: !current.is_enabled,
                }));

                setError("");
                setSuccess("");
              }}
              className={`relative inline-flex h-8 w-14 flex-shrink-0 rounded-md transition-colors disabled:opacity-50 ${
                hero.is_enabled ? "bg-canvas" : "bg-subtle"
              }`}
              aria-pressed={hero.is_enabled}
              aria-label="Toggle Showcase Hero"
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-surface transition-transform ${
                  hero.is_enabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/*===========================================
          Hero Mode
          ===========================================*/}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-normal text-muted mb-3">
              Hero Background Mode
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                disabled={savingHero}
                onClick={() => {
                  setHero((current) => ({
                    ...current,

                    mode: "slideshow",
                  }));

                  setHeroPreviewIndex(0);

                  setError("");
                  setSuccess("");
                }}
                className={`text-left p-4 rounded-md border transition-all ${
                  hero.mode === "slideshow"
                    ? "border-line bg-subtle"
                    : "border-line bg-canvas hover:border-line"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Image
                    size={20}
                    className={
                      hero.mode === "slideshow"
                        ? "text-action"
                        : "text-muted"
                    }
                    aria-hidden="true"
                  />

                  <div>
                    <p className="text-sm font-bold text-ink">
                      Image Slideshow
                    </p>

                    <p className="text-[11px] text-muted mt-1">
                      Loop between 3–5 background images.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={savingHero}
                onClick={() => {
                  setHero((current) => ({
                    ...current,

                    mode: "video",
                  }));

                  setError("");
                  setSuccess("");
                }}
                className={`text-left p-4 rounded-md border transition-all ${
                  hero.mode === "video"
                    ? "border-line bg-subtle"
                    : "border-line bg-canvas hover:border-line"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Video
                    size={20}
                    className={
                      hero.mode === "video" ? "text-action" : "text-muted"
                    }
                    aria-hidden="true"
                  />

                  <div>
                    <p className="text-sm font-bold text-ink">
                      Background Video
                    </p>

                    <p className="text-[11px] text-muted mt-1">
                      Play one muted looping cinematic video.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/*===========================================
          Slideshow Configuration
          ===========================================*/}

          {hero.mode === "slideshow" && (
            <div className="space-y-6">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-normal text-muted">
                      Slideshow Images
                    </p>

                    <p className="text-xs text-muted mt-2">
                      Add 3 to 5 HTTPS or application-relative image URLs.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddHeroImage}
                    disabled={savingHero || hero.slideshow_images.length >= 5}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-line text-[10px] font-semibold uppercase tracking-widest text-muted hover:border-line hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add Image
                  </button>
                </div>

                <div className="space-y-3">
                  {hero.slideshow_images.map((imageUrl, index) => (
                    <div
                      key={`showcase-hero-image-${index}`}
                      className="flex gap-3"
                    >
                      <div className="flex-1">
                        <label
                          htmlFor={`hero-image-${index}`}
                          className="block text-[11px] font-semibold uppercase tracking-widest text-muted mb-2"
                        >
                          Image {index + 1}
                          {index >= 3 ? " — Optional" : ""}
                        </label>

                        <input
                          id={`hero-image-${index}`}
                          type="url"
                          value={imageUrl}
                          disabled={savingHero}
                          placeholder="https://cdn.example.com/showcase-hero.jpg"
                          onChange={(event) =>
                            handleHeroImageChange(index, event.target.value)
                          }
                          className="w-full bg-canvas border border-line rounded-md px-4 py-3.5 text-sm text-ink outline-none focus:bg-surface focus:border-line transition-all disabled:opacity-60"
                        />
                      </div>

                      {hero.slideshow_images.length > 3 && (
                        <button
                          type="button"
                          disabled={savingHero}
                          onClick={() => handleRemoveHeroImage(index)}
                          className="self-end h-[50px] w-[50px] flex items-center justify-center rounded-md border border-line bg-canvas text-action hover:bg-subtle transition-all disabled:opacity-50"
                          aria-label={`Remove image ${index + 1}`}
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                  <span
                    className={
                      slideshowValid ? "text-action" : "text-muted"
                    }
                  >
                    {cleanedHeroImages.length} configured image
                    {cleanedHeroImages.length === 1 ? "" : "s"}
                  </span>

                  <span className="text-muted">Minimum 3 · Maximum 5</span>
                </div>
              </div>

              {/* Rotation */}

              <div className="max-w-sm">
                <label
                  htmlFor="hero-rotation"
                  className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-normal text-muted mb-2"
                >
                  <Clock3 size={13} aria-hidden="true" />
                  Rotation Time
                </label>

                <div className="relative">
                  <input
                    id="hero-rotation"
                    type="number"
                    min="3"
                    max="30"
                    step="1"
                    value={hero.rotation_seconds}
                    disabled={savingHero}
                    onChange={(event) => {
                      setHero((current) => ({
                        ...current,

                        rotation_seconds: event.target.value,
                      }));

                      setError("");

                      setSuccess("");
                    }}
                    className="w-full bg-canvas border border-line rounded-md px-4 pr-20 py-3.5 text-sm font-bold text-ink outline-none focus:bg-surface focus:border-line transition-all disabled:opacity-60"
                  />

                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted font-bold">
                    seconds
                  </span>
                </div>

                <p className="text-[11px] text-muted mt-2">
                  Allowed range: 3 to 30 seconds.
                </p>
              </div>
            </div>
          )}

          {(hero.mode === "video" ? [hero.video_url] : cleanedHeroImages).filter(Boolean).map((media, index) => {
            const look = hero.campaign_looks.find(entry => entry.media === media) || {media,title:"",slug:"",garment:""};
            return <fieldset key={media} className="my-4 grid gap-3 rounded-md border border-line p-4 sm:grid-cols-3">
              <legend className="px-2 font-semibold">Featured look {index + 1}</legend>
              {[["title","Campaign title"],["slug","Published design slug"],["garment","Garment photo URL for try-on"]].map(([field,label]) =>
                <label key={field} className="text-sm">{label}<input disabled={savingHero} value={look[field]} maxLength={field === "title" ? 120 : field === "slug" ? 200 : 2048}
                  className="mt-1 block w-full rounded-md border border-line bg-canvas p-2" onChange={e=>{
                    const value=e.target.value;
                    setHero(current=>({...current,campaign_looks:[...current.campaign_looks.filter(entry=>entry.media!==media),{...look,[field]:value}]}));
                  }} /></label>)}
            </fieldset>;
          })}
          {/*===========================================
          Video Configuration
          ===========================================*/}

          {hero.mode === "video" && (
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="hero-video-url"
                  className="block text-[10px] font-semibold uppercase tracking-normal text-muted mb-2"
                >
                  Background Video URL
                </label>

                <input
                  id="hero-video-url"
                  type="url"
                  value={hero.video_url}
                  disabled={savingHero}
                  placeholder="https://cdn.example.com/showcase-hero.mp4"
                  onChange={(event) => {
                    setHero((current) => ({
                      ...current,

                      video_url: event.target.value,
                    }));

                    setError("");

                    setSuccess("");
                  }}
                  className="w-full bg-canvas border border-line rounded-md px-4 py-3.5 text-sm text-ink outline-none focus:bg-surface focus:border-line transition-all disabled:opacity-60"
                />

                <p className="text-[11px] text-muted mt-2 leading-relaxed">
                  Use a compressed HTTPS video hosted on your media/CDN service.
                  The Showcase frontend will play it muted, looping and inline.
                </p>
              </div>

              <div>
                <label
                  htmlFor="hero-video-poster"
                  className="block text-[10px] font-semibold uppercase tracking-normal text-muted mb-2"
                >
                  Poster / Fallback Image URL
                </label>

                <input
                  id="hero-video-poster"
                  type="url"
                  value={hero.video_poster_url}
                  disabled={savingHero}
                  placeholder="https://cdn.example.com/showcase-poster.jpg"
                  onChange={(event) => {
                    setHero((current) => ({
                      ...current,

                      video_poster_url: event.target.value,
                    }));

                    setError("");

                    setSuccess("");
                  }}
                  className="w-full bg-canvas border border-line rounded-md px-4 py-3.5 text-sm text-ink outline-none focus:bg-surface focus:border-line transition-all disabled:opacity-60"
                />

                <p className="text-[11px] text-muted mt-2">
                  Optional but recommended for loading and fallback.
                </p>
              </div>
            </div>
          )}

          {/*===========================================
          Preview
          ===========================================*/}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-normal text-muted mb-3">
              Preview
            </p>

            <div className="relative overflow-hidden rounded-md bg-canvas border border-line aspect-[16/6] min-h-[240px]">
              {hero.mode === "slideshow" ? (
                currentPreviewImage ? (
                  <img
                    key={currentPreviewImage}
                    src={currentPreviewImage}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <HeroPreviewEmpty
                    icon={<Image size={30} />}
                    title="No slideshow images configured"
                    description="Add at least 3 image URLs to enable slideshow mode."
                  />
                )
              ) : hero.video_url ? (
                <video
                  key={hero.video_url}
                  className="absolute inset-0 h-full w-full object-cover"
                  src={hero.video_url}
                  poster={hero.video_poster_url || undefined}
                  controls
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : (
                <HeroPreviewEmpty
                  icon={<Video size={30} />}
                  title="No video configured"
                  description="Enter a video URL to preview Video mode."
                />
              )}

              {(currentPreviewImage ||
                (hero.mode === "video" && hero.video_url)) && (
                <>

                  <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-surface p-3">
                    <p className="text-[11px] md:text-[10px] font-semibold uppercase tracking-normal text-action">
                      Showcase Preview
                    </p>

                    <p className="text-xl md:text-3xl font-serif italic text-ink mt-2">
                      Design showcase
                    </p>
                  </div>
                </>
              )}

              {hero.mode === "slideshow" && cleanedHeroImages.length > 1 && (
                <div className="absolute z-10 right-5 bottom-5 flex items-center gap-2">
                  {cleanedHeroImages.map((_item, index) => (
                    <button
                      key={`preview-dot-${index}`}
                      type="button"
                      onClick={() => setHeroPreviewIndex(index)}
                      className={`h-2 rounded-md transition-all ${
                        index === heroPreviewIndex
                          ? "w-6 bg-surface"
                          : "w-2 bg-subtle hover:bg-subtle"
                      }`}
                      aria-label={`Preview slide ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              This preview demonstrates only the background treatment. Creator
              Showcase and Designer Marketplace will keep their own Hero text,
              buttons and page-specific content.
            </p>
          </div>

          {/*===========================================
          Current Mode Validation
          ===========================================*/}

          {hero.is_enabled && hero.mode === "slideshow" && !slideshowValid && (
            <div className="p-4 bg-canvas border border-line rounded-md flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="text-action mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="text-xs font-bold text-action">
                  Slideshow Not Ready
                </p>

                <p className="text-xs text-action mt-1">
                  Add between 3 and 5 image URLs before saving an enabled
                  slideshow.
                </p>
              </div>
            </div>
          )}

          {hero.is_enabled && hero.mode === "video" && !videoValid && (
            <div className="p-4 bg-canvas border border-line rounded-md flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="text-action mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="text-xs font-bold text-action">
                  Video Not Ready
                </p>

                <p className="text-xs text-action mt-1">
                  Add a background video URL before saving an enabled Video
                  Hero.
                </p>
              </div>
            </div>
          )}

          {/*===========================================
          Save Hero
          ===========================================*/}

          {conflictingHero && (
            <section className="space-y-3 rounded-md border border-line p-3" aria-label="Publishing conflict">
              <p role="alert">The live showcase changed. Your draft is still here.</p>
              <details open>
                <summary>Review the current live settings</summary>
                <dl className="mt-2 space-y-1 break-words text-sm">
                  <dt>Banner</dt><dd>{conflictingHero.is_enabled ? "Enabled" : "Disabled"} · {conflictingHero.mode}</dd>
                  <dt>Slides</dt><dd>{conflictingHero.slideshow_images.filter(Boolean).join(" • ") || "None"}</dd>
                  <dt>Slide duration</dt><dd>{conflictingHero.rotation_seconds} seconds</dd>
                  <dt>Video</dt><dd>{conflictingHero.video_url || "None"}</dd>
                  <dt>Poster</dt><dd>{conflictingHero.video_poster_url || "None"}</dd>
                </dl>
              </details>
              <button type="button" className="h-9 rounded-md border border-line px-3" onClick={() => {
                setOriginalHero(conflictingHero);
                setConflictingHero(null);
              }}>Keep editing my draft</button>
            </section>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            <button type="button" disabled={!heroHasChanges && !conflictingHero}
              className="h-9 rounded-md border border-line px-3 disabled:opacity-50"
              onClick={() => {
                const live = conflictingHero || originalHero;
                setHero(live);
                setOriginalHero(live);
                setConflictingHero(null);
                setHeroPreviewIndex(0);
                setError("");
                setSuccess("");
              }}>Discard changes</button>
            <button type="submit" disabled={!Number.isInteger(originalHero.revision) || !heroValid || !heroHasChanges || Boolean(conflictingHero)}
              className="h-9 rounded-md bg-action px-3 text-on-action disabled:bg-subtle disabled:text-muted">
              {savingHero ? "Publishing…" : "Publish to both showcases"}
            </button>
          </div>
          </fieldset>
        </form>
      </section>

      {/*===============================================
      Maintenance
      ===============================================*/}

      <section className="bg-canvas border border-line rounded-md p-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-surface rounded-md border border-line">
            <ShieldCheck
              size={20}
              className="text-muted"
              aria-hidden="true"
            />
          </div>

          <div>
            <h3 className="text-sm font-bold text-ink">
              Maintenance Mode
            </h3>

            <p className="text-xs text-muted mt-2 leading-relaxed max-w-2xl">
              Maintenance controls are not currently exposed because there is no
              persistent backend maintenance configuration. This avoids showing
              a control that appears to work but would not be reliable after a
              server restart.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

/*=========================================================
Small Components
=========================================================*/

const InfoCard = ({ label, value }) => (
  <div className="bg-canvas border border-line rounded-md p-4">
    <p className="text-[11px] uppercase tracking-widest font-semibold text-muted">
      {label}
    </p>

    <p className="text-xl font-serif text-ink mt-2">{value}</p>
  </div>
);

const HeroPreviewEmpty = ({ icon, title, description }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
    <div className="text-action">{icon}</div>

    <p className="text-sm font-bold text-ink mt-4">{title}</p>

    <p className="text-xs text-muted mt-2 max-w-sm leading-relaxed">
      {description}
    </p>
  </div>
);

export default SystemSettings;
