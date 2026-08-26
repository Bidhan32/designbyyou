"use strict";

/*
=========================================================
DesignByYou Super Admin Settings
Platform Financial + Showcase Configuration
Version 3.0
=========================================================

Current backend support:

COMMISSION
GET   /api/v1/superadmin/commission
PATCH /api/v1/superadmin/update-commission

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
  Save,
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
  mode: hero.mode === "video" ? "video" : "slideshow",

  slideshow_images: Array.isArray(hero.slideshow_images)
    ? hero.slideshow_images.map((item) => String(item || "").trim())
    : [],

  video_url: String(hero.video_url || "").trim(),

  video_poster_url: String(hero.video_poster_url || "").trim(),

  rotation_seconds: String(hero.rotation_seconds || ""),

  is_enabled: hero.is_enabled === true,
});

/*=========================================================
System Settings
=========================================================*/

const SystemSettings = () => {
  /*=======================================================
  Commission State
  =======================================================*/

  const [commission, setCommission] = useState("");

  const [originalCommission, setOriginalCommission] = useState("");

  const [commissionInfo, setCommissionInfo] = useState(null);

  /*=======================================================
  Showcase Hero State
  =======================================================*/

  const [hero, setHero] = useState(createHeroState());

  const [originalHero, setOriginalHero] = useState(createHeroState());

  const [heroPreviewIndex, setHeroPreviewIndex] = useState(0);

  /*=======================================================
  General State
  =======================================================*/

  const [loading, setLoading] = useState(true);

  const [savingCommission, setSavingCommission] = useState(false);

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
        Commission
        ------------------------------------------------ */

      const commissionData = commissionResponse.data?.data;

      if (!commissionData) {
        throw new Error("Commission configuration was not returned.");
      }

      const rate = Number(commissionData.commission_rate);

      const normalizedRate = Number.isFinite(rate) ? String(rate) : "0";

      setCommission(normalizedRate);

      setOriginalCommission(normalizedRate);

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

  const commissionNumber = useMemo(() => Number(commission), [commission]);

  const commissionValid =
    commission !== "" &&
    Number.isFinite(commissionNumber) &&
    commissionNumber >= 0 &&
    commissionNumber <= 100;

  const commissionHasChanges =
    String(commission) !== String(originalCommission);

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
  Update Commission
  =======================================================*/

  const handleUpdateCommission = async (event) => {
    event.preventDefault();

    if (savingCommission) {
      return;
    }

    setError("");
    setSuccess("");

    if (!commissionValid) {
      setError("Commission rate must be between 0 and 100.");

      return;
    }

    const confirmed = window.confirm(
      `Change the platform booking commission to ${commissionNumber}% for all existing Designer profiles?\n\nThis rate will affect future booking releases.`,
    );

    if (!confirmed) {
      return;
    }

    setSavingCommission(true);

    try {
      const response = await API.patch("/superadmin/update-commission", {
        rate: commissionNumber,
      });

      const returnedRate = Number(
        response.data?.data?.commission_rate ?? commissionNumber,
      );

      const normalizedRate = String(returnedRate);

      setCommission(normalizedRate);

      setOriginalCommission(normalizedRate);

      setCommissionInfo((current) => ({
        ...(current || {}),

        commission_rate: returnedRate,

        minimum_rate: returnedRate,

        maximum_rate: returnedRate,

        average_rate: returnedRate,

        consistent: true,
      }));

      setSuccess(
        response.data?.message ||
          `Commission rate updated to ${returnedRate}%.`,
      );
    } catch (err) {
      console.error("Failed to update commission:", err);

      setError(
        err.response?.data?.message || "Failed to update commission rate.",
      );
    } finally {
      setSavingCommission(false);
    }
  };

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

    if (savingHero) {
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
          className="animate-spin text-[#D4AF37]"
          aria-hidden="true"
        />

        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
          Loading Platform Configuration...
        </p>
      </div>
    );
  }

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 pb-20">
      {/*===============================================
      Header
      ===============================================*/}

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck
              size={15}
              className="text-[#D4AF37]"
              aria-hidden="true"
            />

            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D4AF37]">
              Super Admin Control
            </span>
          </div>

          <h1 className="text-3xl font-serif italic text-gray-900">
            Platform Settings
          </h1>

          <p className="text-gray-400 text-sm mt-1">
            Manage platform commission and shared Showcase presentation.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchSettings}
          disabled={savingCommission || savingHero}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-gray-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:border-black hover:text-black transition-all disabled:opacity-50"
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
          className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-3"
        >
          <AlertTriangle
            size={18}
            className="text-red-600 mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />

          <div>
            <p className="text-xs font-bold text-red-700">
              Configuration Error
            </p>

            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-2xl bg-green-50 border border-green-100 flex items-start gap-3">
          <CheckCircle2
            size={18}
            className="text-green-600 mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />

          <div>
            <p className="text-xs font-bold text-green-800">
              Configuration Updated
            </p>

            <p className="text-xs text-green-700 mt-1">{success}</p>
          </div>
        </div>
      )}

      {/*===============================================
      Financial Configuration
      ===============================================*/}

      <section className="bg-white border border-gray-100 shadow-sm rounded-[2rem] overflow-hidden">
        <div className="p-6 md:p-8 border-b border-gray-100">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-[#D4AF37]/10">
              <DollarSign
                size={22}
                className="text-[#D4AF37]"
                aria-hidden="true"
              />
            </div>

            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Booking Commission
              </h2>

              <p className="text-sm text-gray-400 mt-1 max-w-2xl leading-relaxed">
                This percentage is deducted from a Designer&apos;s booking
                earnings when a completed booking is released.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleUpdateCommission}
          className="p-6 md:p-8 space-y-8"
        >
          <div className="max-w-md">
            <label
              htmlFor="platform-commission"
              className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2"
            >
              Platform Commission Rate
            </label>

            <div className="relative">
              <input
                id="platform-commission"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={commission}
                disabled={savingCommission}
                onChange={(event) => {
                  setCommission(event.target.value);

                  if (error) {
                    setError("");
                  }

                  if (success) {
                    setSuccess("");
                  }
                }}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 pr-12 py-4 text-lg font-mono font-bold text-gray-900 outline-none focus:bg-white focus:border-[#D4AF37] transition-all disabled:opacity-60"
              />

              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                %
              </span>
            </div>

            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
              Allowed range: 0% to 100%.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoCard
              label="Minimum Rate"
              value={`${Number(commissionInfo?.minimum_rate || 0)}%`}
            />

            <InfoCard
              label="Maximum Rate"
              value={`${Number(commissionInfo?.maximum_rate || 0)}%`}
            />

            <InfoCard
              label="Designer Profiles"
              value={Number(commissionInfo?.designer_profiles || 0)}
            />
          </div>

          {commissionInfo?.consistent === false && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="text-amber-600 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="text-xs font-bold text-amber-800">
                  Mixed Designer Commission Rates
                </p>

                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  Existing Designer profiles currently have different commission
                  rates. Saving this setting will synchronize all existing
                  Designer profiles to the selected rate.
                </p>
              </div>
            </div>
          )}

          {commissionValid && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Example on a $200 booking
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <ExampleValue label="Booking" value="$200.00" />

                <ExampleValue
                  label="Platform Commission"
                  value={`$${(200 * (commissionNumber / 100)).toFixed(2)}`}
                />

                <ExampleValue
                  label="Designer Net"
                  value={`$${(200 - 200 * (commissionNumber / 100)).toFixed(
                    2,
                  )}`}
                />
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-gray-400 max-w-lg leading-relaxed">
              Updating this setting changes the commission rate stored on
              existing Designer profiles. It does not rewrite historical
              transactions.
            </p>

            <button
              type="submit"
              disabled={
                savingCommission || !commissionValid || !commissionHasChanges
              }
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-black text-white text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {savingCommission ? (
                <>
                  <RefreshCw
                    size={15}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Updating...
                </>
              ) : (
                <>
                  <Save
                    size={15}
                    className="text-[#D4AF37]"
                    aria-hidden="true"
                  />
                  Save Commission
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/*===============================================
      Showcase Hero Configuration
      ===============================================*/}

      <section className="bg-white border border-gray-100 shadow-sm rounded-[2rem] overflow-hidden">
        <div className="p-6 md:p-8 border-b border-gray-100">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-[#D4AF37]/10">
                {hero.mode === "video" ? (
                  <Video
                    size={22}
                    className="text-[#D4AF37]"
                    aria-hidden="true"
                  />
                ) : (
                  <Image
                    size={22}
                    className="text-[#D4AF37]"
                    aria-hidden="true"
                  />
                )}
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Shared Showcase Hero
                </h2>

                <p className="text-sm text-gray-400 mt-1 max-w-2xl leading-relaxed">
                  Choose the background presentation shared by Creator Showcase
                  and Designer Marketplace. Only one media mode runs at a time.
                </p>
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border ${
                hero.is_enabled
                  ? "bg-green-50 border-green-100 text-green-700"
                  : "bg-gray-50 border-gray-100 text-gray-500"
              }`}
            >
              <Power size={14} aria-hidden="true" />

              <span className="text-[10px] font-black uppercase tracking-widest">
                {hero.is_enabled ? "Hero Enabled" : "Hero Disabled"}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveHero} className="p-6 md:p-8 space-y-8">
          {/*===========================================
          Enable / Disable
          ===========================================*/}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gray-50 border border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-900">
                Use Super Admin Hero
              </p>

              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
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
              className={`relative inline-flex h-8 w-14 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                hero.is_enabled ? "bg-black" : "bg-gray-300"
              }`}
              aria-pressed={hero.is_enabled}
              aria-label="Toggle Showcase Hero"
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                  hero.is_enabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/*===========================================
          Hero Mode
          ===========================================*/}

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3">
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
                className={`text-left p-5 rounded-2xl border transition-all ${
                  hero.mode === "slideshow"
                    ? "border-[#D4AF37] bg-[#D4AF37]/5 shadow-sm"
                    : "border-gray-100 bg-gray-50 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Image
                    size={20}
                    className={
                      hero.mode === "slideshow"
                        ? "text-[#D4AF37]"
                        : "text-gray-400"
                    }
                    aria-hidden="true"
                  />

                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      Image Slideshow
                    </p>

                    <p className="text-[11px] text-gray-500 mt-1">
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
                className={`text-left p-5 rounded-2xl border transition-all ${
                  hero.mode === "video"
                    ? "border-[#D4AF37] bg-[#D4AF37]/5 shadow-sm"
                    : "border-gray-100 bg-gray-50 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Video
                    size={20}
                    className={
                      hero.mode === "video" ? "text-[#D4AF37]" : "text-gray-400"
                    }
                    aria-hidden="true"
                  />

                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      Background Video
                    </p>

                    <p className="text-[11px] text-gray-500 mt-1">
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
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                      Slideshow Images
                    </p>

                    <p className="text-xs text-gray-500 mt-2">
                      Add 3 to 5 HTTPS or application-relative image URLs.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddHeroImage}
                    disabled={savingHero || hero.slideshow_images.length >= 5}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:border-black hover:text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
                          className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2"
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
                          className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-sm text-gray-900 outline-none focus:bg-white focus:border-[#D4AF37] transition-all disabled:opacity-60"
                        />
                      </div>

                      {hero.slideshow_images.length > 3 && (
                        <button
                          type="button"
                          disabled={savingHero}
                          onClick={() => handleRemoveHeroImage(index)}
                          className="self-end h-[50px] w-[50px] flex items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 transition-all disabled:opacity-50"
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
                      slideshowValid ? "text-green-600" : "text-gray-400"
                    }
                  >
                    {cleanedHeroImages.length} configured image
                    {cleanedHeroImages.length === 1 ? "" : "s"}
                  </span>

                  <span className="text-gray-400">Minimum 3 · Maximum 5</span>
                </div>
              </div>

              {/* Rotation */}

              <div className="max-w-sm">
                <label
                  htmlFor="hero-rotation"
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2"
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
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 pr-20 py-3.5 text-sm font-bold text-gray-900 outline-none focus:bg-white focus:border-[#D4AF37] transition-all disabled:opacity-60"
                  />

                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">
                    seconds
                  </span>
                </div>

                <p className="text-[11px] text-gray-400 mt-2">
                  Allowed range: 3 to 30 seconds.
                </p>
              </div>
            </div>
          )}

          {/*===========================================
          Video Configuration
          ===========================================*/}

          {hero.mode === "video" && (
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="hero-video-url"
                  className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2"
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
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-sm text-gray-900 outline-none focus:bg-white focus:border-[#D4AF37] transition-all disabled:opacity-60"
                />

                <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                  Use a compressed HTTPS video hosted on your media/CDN service.
                  The Showcase frontend will play it muted, looping and inline.
                </p>
              </div>

              <div>
                <label
                  htmlFor="hero-video-poster"
                  className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2"
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
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5 text-sm text-gray-900 outline-none focus:bg-white focus:border-[#D4AF37] transition-all disabled:opacity-60"
                />

                <p className="text-[11px] text-gray-400 mt-2">
                  Optional but recommended for loading and fallback.
                </p>
              </div>
            </div>
          )}

          {/*===========================================
          Preview
          ===========================================*/}

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3">
              Preview
            </p>

            <div className="relative overflow-hidden rounded-[1.75rem] bg-[#080808] border border-gray-200 aspect-[16/6] min-h-[240px]">
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
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-black/50" />

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

                  <div className="pointer-events-none absolute left-6 md:left-10 bottom-6 md:bottom-8">
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] text-[#D4AF37]">
                      Showcase Preview
                    </p>

                    <p className="text-xl md:text-3xl font-serif italic text-white mt-2">
                      Design Without Limits
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
                      className={`h-2 rounded-full transition-all ${
                        index === heroPreviewIndex
                          ? "w-6 bg-white"
                          : "w-2 bg-white/50 hover:bg-white/80"
                      }`}
                      aria-label={`Preview slide ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
              This preview demonstrates only the background treatment. Creator
              Showcase and Designer Marketplace will keep their own Hero text,
              buttons and page-specific content.
            </p>
          </div>

          {/*===========================================
          Current Mode Validation
          ===========================================*/}

          {hero.is_enabled && hero.mode === "slideshow" && !slideshowValid && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="text-amber-600 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="text-xs font-bold text-amber-800">
                  Slideshow Not Ready
                </p>

                <p className="text-xs text-amber-700 mt-1">
                  Add between 3 and 5 image URLs before saving an enabled
                  slideshow.
                </p>
              </div>
            </div>
          )}

          {hero.is_enabled && hero.mode === "video" && !videoValid && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="text-amber-600 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="text-xs font-bold text-amber-800">
                  Video Not Ready
                </p>

                <p className="text-xs text-amber-700 mt-1">
                  Add a background video URL before saving an enabled Video
                  Hero.
                </p>
              </div>
            </div>
          )}

          {/*===========================================
          Save Hero
          ===========================================*/}

          <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500 max-w-xl leading-relaxed">
                Saving changes updates the shared Hero configuration only. It
                does not modify designs, bookings, payments or historical data.
              </p>

              <p className="text-[10px] uppercase tracking-widest font-black text-gray-400 mt-2">
                Active Mode:{" "}
                <span className="text-gray-700">
                  {hero.mode === "video" ? "Video" : "Slideshow"}
                </span>
              </p>
            </div>

            <button
              type="submit"
              disabled={savingHero || !heroValid || !heroHasChanges}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-black text-white text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {savingHero ? (
                <>
                  <RefreshCw
                    size={15}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Saving...
                </>
              ) : (
                <>
                  <Save
                    size={15}
                    className="text-[#D4AF37]"
                    aria-hidden="true"
                  />
                  Save Showcase Hero
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/*===============================================
      Maintenance
      ===============================================*/}

      <section className="bg-gray-50 border border-gray-100 rounded-[2rem] p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-2xl border border-gray-100">
            <ShieldCheck
              size={20}
              className="text-gray-400"
              aria-hidden="true"
            />
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Maintenance Mode
            </h3>

            <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-2xl">
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
  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
    <p className="text-[9px] uppercase tracking-widest font-black text-gray-400">
      {label}
    </p>

    <p className="text-xl font-serif text-gray-900 mt-2">{value}</p>
  </div>
);

const ExampleValue = ({ label, value }) => (
  <div>
    <p className="text-[9px] uppercase tracking-widest font-black text-gray-400">
      {label}
    </p>

    <p className="text-lg font-mono font-bold text-gray-900 mt-1">{value}</p>
  </div>
);

const HeroPreviewEmpty = ({ icon, title, description }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
    <div className="text-[#D4AF37]">{icon}</div>

    <p className="text-sm font-bold text-white mt-4">{title}</p>

    <p className="text-xs text-gray-400 mt-2 max-w-sm leading-relaxed">
      {description}
    </p>
  </div>
);

export default SystemSettings;
