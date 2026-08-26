/*
=========================================================
DesignByYou / FashionVision
Booking 3D Model Viewer
Version 1.0
=========================================================

Purpose
---------------------------------------------------------
Reusable interactive 3D viewer for booking deliverables.

Supports:

- GLB
- GLTF
- remote HTTP / HTTPS model URLs
- mouse / touch rotation
- zoom
- pan
- automatic model framing
- loading state
- model-load error state
- reset camera
- open original model URL

Used by:

- DesignerBookingDetail.jsx
- CreatorBookingDetail.jsx

=========================================================
*/

import React, {
  Component,
  Suspense,
  useMemo,
  useState,
} from "react";

import {
  Canvas,
} from "@react-three/fiber";

import {
  Bounds,
  Center,
  Clone,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";

import {
  AlertCircle,
  Box,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

/*=========================================================
Helpers
=========================================================*/

function isHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const parsed =
      new URL(value);

    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function cleanText(value) {
  return String(
    value || "",
  ).trim();
}

/*=========================================================
Model Loading Fallback
=========================================================*/

function ModelLoadingFallback() {
  return (
    <Html
      center
      transform={false}
    >
      <div className="flex min-w-[170px] items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/75 px-4 py-3 text-white shadow-xl backdrop-blur-md">
        <Loader2
          size={17}
          className="shrink-0 animate-spin text-[#D4AF37]"
        />

        <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.16em]">
          Loading 3D model
        </span>
      </div>
    </Html>
  );
}

/*=========================================================
Loaded Model
=========================================================*/

function BookingModel({
  modelUrl,
}) {
  const gltf =
    useGLTF(
      modelUrl,
    );

  if (!gltf?.scene) {
    return null;
  }

  return (
    <Center>
      <Clone
        object={
          gltf.scene
        }
        castShadow
        receiveShadow
      />
    </Center>
  );
}

/*=========================================================
Scene
=========================================================*/

function BookingModelScene({
  modelUrl,
}) {
  return (
    <>
      {/* Base lighting */}

      <ambientLight
        intensity={1.2}
      />

      <hemisphereLight
        intensity={1.35}
        groundColor="#2a2a2a"
      />

      <directionalLight
        position={[
          4,
          6,
          5,
        ]}
        intensity={2.3}
        castShadow
      />

      <directionalLight
        position={[
          -4,
          2,
          -3,
        ]}
        intensity={1}
      />

      {/* Automatically frame the supplied model */}

      <Bounds
        fit
        clip
        observe
        margin={1.25}
      >
        <Suspense
          fallback={
            <ModelLoadingFallback />
          }
        >
          <BookingModel
            modelUrl={
              modelUrl
            }
          />
        </Suspense>
      </Bounds>

      {/* User interaction */}

      <OrbitControls
        makeDefault
        enableRotate
        enableZoom
        enablePan
        minDistance={0.1}
        maxDistance={100}
        zoomSpeed={0.8}
        rotateSpeed={0.7}
        panSpeed={0.7}
      />
    </>
  );
}

/*=========================================================
Canvas Error Boundary

React Suspense handles loading, but model/network parsing
errors need a normal React error boundary.
=========================================================*/

class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(
    error,
  ) {
    return {
      hasError: true,

      message:
        error?.message ||
        "The 3D model could not be loaded.",
    };
  }

  componentDidCatch(
    error,
    errorInfo,
  ) {
    console.error(
      "Booking 3D model viewer failed:",
      error,
      errorInfo,
    );
  }

  componentDidUpdate(
    previousProps,
  ) {
    if (
      previousProps.resetKey !==
        this.props.resetKey &&
      this.state.hasError
    ) {
      this.setState({
        hasError: false,
        message: "",
      });
    }
  }

  render() {
    if (
      this.state.hasError
    ) {
      return this.props.fallback(
        this.state.message,
      );
    }

    return this.props.children;
  }
}

/*=========================================================
Error Display
=========================================================*/

function ModelErrorState({
  modelUrl,
  message,
  onRetry,
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
        <AlertCircle
          size={24}
        />
      </div>

      <h3 className="mt-5 text-base font-semibold text-slate-900 dark:text-white">
        3D model unavailable
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-white/45">
        The model could not be displayed inside the viewer.
        Check that the link points to a valid GLB or GLTF
        file and that the file host allows browser access.
      </p>

      {message && (
        <p className="mt-3 max-w-md break-words text-xs leading-5 text-rose-600/80 dark:text-rose-300/70">
          {message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={
            onRetry
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-[#D4AF37]/50 hover:text-[#9B791D] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60 dark:hover:text-[#D4AF37]"
        >
          <RefreshCw
            size={14}
          />

          Retry
        </button>

        {isHttpUrl(
          modelUrl,
        ) && (
          <a
            href={
              modelUrl
            }
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 text-[9px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-[#E2C45D]"
          >
            <ExternalLink
              size={14}
            />

            Open original
          </a>
        )}
      </div>
    </div>
  );
}

/*=========================================================
Empty / Invalid URL State
=========================================================*/

function EmptyModelState() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-400 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/30">
        <Box
          size={25}
        />
      </div>

      <h3 className="mt-5 text-base font-semibold text-slate-900 dark:text-white">
        No 3D model available
      </h3>

      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-white/40">
        A valid HTTP or HTTPS GLB/GLTF model URL has not
        been supplied for this booking milestone.
      </p>
    </div>
  );
}

/*=========================================================
Main Viewer
=========================================================*/

export default function BookingModelViewer({
  modelUrl,
  title = "3D Model",
  height = 420,
  className = "",
}) {
  const [
    viewerKey,
    setViewerKey,
  ] =
    useState(0);

  const normalizedUrl =
    useMemo(
      () =>
        cleanText(
          modelUrl,
        ),
      [
        modelUrl,
      ],
    );

  const validUrl =
    isHttpUrl(
      normalizedUrl,
    );

  const resetViewer =
    () => {
      setViewerKey(
        (current) =>
          current + 1,
      );
    };

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#090909] ${className}`}
    >
      {/* Viewer Toolbar */}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300">
            <Box
              size={17}
            />
          </div>

          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-700/70 dark:text-cyan-300/70">
              Interactive Viewer
            </p>

            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
          </div>
        </div>

        {validUrl && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                resetViewer
              }
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[9px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:border-[#D4AF37]/50 hover:text-[#9B791D] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55 dark:hover:text-[#D4AF37]"
            >
              <RefreshCw
                size={13}
              />

              Reset
            </button>

            <a
              href={
                normalizedUrl
              }
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[9px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55 dark:hover:text-cyan-300"
            >
              <ExternalLink
                size={13}
              />

              Open
            </a>
          </div>
        )}
      </div>

      {/* Viewer */}

      {!validUrl ? (
        <EmptyModelState />
      ) : (
        <ModelErrorBoundary
          key={
            `error-${viewerKey}-${normalizedUrl}`
          }
          resetKey={
            viewerKey
          }
          fallback={(
            message,
          ) => (
            <ModelErrorState
              modelUrl={
                normalizedUrl
              }
              message={
                message
              }
              onRetry={
                resetViewer
              }
            />
          )}
        >
          <div
            className="relative w-full bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.13),transparent_65%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.07),transparent_65%)]"
            style={{
              height:
                `${Math.max(
                  280,
                  Number(height) ||
                    420,
                )}px`,
            }}
          >
            <Canvas
              key={
                `canvas-${viewerKey}-${normalizedUrl}`
              }
              shadows
              dpr={[
                1,
                2,
              ]}
              camera={{
                position: [
                  0,
                  1.5,
                  4,
                ],

                fov:
                  45,

                near:
                  0.01,

                far:
                  1000,
              }}
              gl={{
                antialias:
                  true,

                alpha:
                  true,

                preserveDrawingBuffer:
                  false,
              }}
            >
              <BookingModelScene
                modelUrl={
                  normalizedUrl
                }
              />
            </Canvas>

            {/* Interaction hint */}

            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-black/10 bg-white/85 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/65 dark:text-white/45">
              Drag to rotate · Scroll to zoom
            </div>
          </div>
        </ModelErrorBoundary>
      )}
    </section>
  );
}