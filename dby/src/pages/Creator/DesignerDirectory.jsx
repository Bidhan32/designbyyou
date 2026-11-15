import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";

import {
  Search,
  SlidersHorizontal,
  Star,
  Zap,
  Crown,
  CheckCircle2,
  ArrowUpRight,
  Loader2,
  ShieldAlert,
  Sparkles,
  Briefcase,
  DollarSign,
  MessageCircle,
  Video,
} from "lucide-react";

import API from "../../api/axios";
import { useAuth } from "../../context/AuthContext.helpers.js";

const SPECIALTIES = [
  "All",
  "Streetwear",
  "Avant-Garde",
  "Minimalism",
  "Haute-Couture",
  "Techwear",
  "Concept Art",
];

export default function DesignerDirectory() {
  const navigate = useNavigate();

  const { user } = useAuth();

  const isCreator = user?.role === "creator";

  const [designers, setDesigners] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  /*=======================================================
  Filter & Search States
  =======================================================*/

  const [searchQuery, setSearchQuery] = useState("");

  const [selectedSpecialty, setSelectedSpecialty] = useState("All");

  const [maxBudget, setMaxBudget] = useState(2000);

  const [sortBy, setSortBy] = useState("top_rated");

  /*=======================================================
  Fetch Bookable Designers

  Uses the same booking-safe backend directory as the
  Creator booking page.

  Backend is responsible for enforcing:

  role = designer
  approval_status = approved
  is_email_verified = true

  WhatsApp numbers are intentionally NOT requested here.
  =======================================================*/

  useEffect(() => {
    const controller = new AbortController();

    const fetchDesigners = async () => {
      try {
        setLoading(true);

        setError(null);

        const response = await API.get("/p2p-bookings/designers", {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const data = response?.data;

        const designerList = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];

        setDesigners(designerList);
      } catch (err) {
        if (
          err?.code === "ERR_CANCELED" ||
          err?.name === "CanceledError" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Failed to load designer directory:",
          err?.response?.data || err,
        );

        setDesigners([]);

        setError(
          err?.response?.data?.message ||
            "Unable to load designers.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    if (isCreator) {
      void fetchDesigners();
    } else {
      setDesigners([]);

      setLoading(false);
    }

    return () => {
      controller.abort();
    };
  }, [isCreator]);

  /*=======================================================
  Client-side Filtering & Sorting Logic
  =======================================================*/

  const filteredDesigners = useMemo(() => {
    return designers
      .filter((designer) => {
        const name = (
          designer.full_name ||
          designer.username ||
          ""
        ).toLowerCase();

        const bio = (designer.bio || "").toLowerCase();

        const query = searchQuery.toLowerCase().trim();

        const matchesSearch =
          !query || name.includes(query) || bio.includes(query);

        const designerSpecialties =
          designer.specialties || designer.style_categories || [];

        const matchesSpecialty =
          selectedSpecialty === "All" ||
          designerSpecialties.includes(selectedSpecialty) ||
          bio.includes(selectedSpecialty.toLowerCase());

        const startingRate = parseFloat(
          designer.starting_rate || designer.base_rate || 0,
        );

        const matchesPrice = startingRate <= maxBudget;

        return matchesSearch && matchesSpecialty && matchesPrice;
      })
      .sort((a, b) => {
        const rateA = parseFloat(a.starting_rate || a.base_rate || 0);

        const rateB = parseFloat(b.starting_rate || b.base_rate || 0);

        const ratingA = parseFloat(a.avg_rating || 5.0);

        const ratingB = parseFloat(b.avg_rating || 5.0);

        const bookingsA = parseInt(a.total_completed_bookings || 0, 10);

        const bookingsB = parseInt(b.total_completed_bookings || 0, 10);

        if (sortBy === "top_rated") {
          return ratingB - ratingA;
        }

        if (sortBy === "most_bookings") {
          return bookingsB - bookingsA;
        }

        if (sortBy === "price_low") {
          return rateA - rateB;
        }

        if (sortBy === "price_high") {
          return rateB - rateA;
        }

        return 0;
      });
  }, [designers, searchQuery, selectedSpecialty, maxBudget, sortBy]);

  /*=======================================================
  Role Guardrail Fallback
  =======================================================*/

  if (!isCreator) {
    return (
      <div
        className="
          min-h-screen bg-canvas flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300
        "
      >

        <div
          className="
            max-w-md w-full bg-surface border border-line rounded-md p-4 text-center relative z-10
          "
        >
          <ShieldAlert
            className="
              w-16 h-16 text-muted mx-auto mb-6
            "
          />

          <h2
            className="
              text-2xl font-serif text-ink tracking-wide mb-2
            "
          >
            Access Restricted
          </h2>

          <p
            className="
              text-[10px] text-muted uppercase tracking-normal font-bold mb-8 leading-relaxed
            "
          >
            Sign in with a creator account to browse designers.
          </p>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="
              w-full py-4 bg-subtle hover:bg-subtle text-ink text-[10px] font-bold uppercase tracking-normal rounded-md transition-all border border-line
            "
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="
        min-h-screen bg-canvas text-ink selection:bg-action selection:text-on-action font-sans relative overflow-x-hidden pb-32 transition-colors duration-300
      "
    >
      {/*===================================================
      Ambient Glow
      ===================================================*/}

      <div
        className="
          fixed inset-0 pointer-events-none overflow-hidden z-0
        "
      >

      </div>

      <main
        className="
          max-w-[1700px] mx-auto px-6 md:px-12 pt-12 relative z-10
        "
      >
        {/*=================================================
        Page Header
        =================================================*/}

        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Designers</h1>
          <p className="mt-1 text-sm text-muted">Choose a designer to view their profile or start a booking.</p>
        </header>

        {/*=================================================
        Controls Bar
        =================================================*/}

        <div
          className="
            bg-subtle border border-line rounded-md p-4 mb-4 space-y-4
          "
        >
          <div
            className="
              flex flex-col lg:flex-row gap-4 justify-between items-center
            "
          >
            {/* Search Bar */}

            <div
              className="
                relative w-full lg:w-[600px] group
              "
            >
              <Search
                className="
                  absolute left-5 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-action transition-colors
                "
                size={18}
              />

              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search designers" placeholder="Search designers"
                className="
                  w-full bg-subtle dark:bg-surface border border-line h-9 rounded-md py-1 pl-14 pr-6 text-xs text-ink caret-slate-900 dark:caret-white outline-none focus:border-line focus:bg-surface focus:ring-4 focus:ring-action transition-all placeholder:text-muted dark:focus:text-ink tracking-wide font-light
                "
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="
                    absolute right-5 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-ink uppercase font-bold
                  "
                >
                  Clear
                </button>
              )}
            </div>

            {/* Sort Selector */}

            <div
              className="
                flex items-center gap-3 w-full lg:w-auto justify-end
              "
            >
              <label
                className="
                  text-[11px] uppercase tracking-normal text-muted font-bold shrink-0 flex items-center gap-1.5
                "
              >
                <SlidersHorizontal size={12} />
                Sort By:
              </label>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="
                  bg-subtle dark:bg-surface border border-line rounded-md px-5 py-3 text-[10px] font-bold uppercase tracking-normal text-action outline-none focus:border-line focus:bg-surface focus:ring-4 focus:ring-action cursor-pointer [color-scheme:light] [&>option]:bg-white [&>option]:text-slate-900 dark:[color-scheme:dark] dark:[&>option]:bg-[#111] dark:[&>option]:text-white dark:focus:text-action
                "
              >
                <option value="top_rated">Top Rated ★</option>

                <option value="most_bookings">Most Bookings</option>

                <option value="price_low">Starting Price: Low to High</option>

                <option value="price_high">Starting Price: High to Low</option>
              </select>
            </div>
          </div>

          <div
            className="
              h-[1px] bg-subtle w-full
            "
          />

          <div
            className="
              grid grid-cols-1 lg:grid-cols-12 gap-8 items-center
            "
          >
            {/* Specialty Tabs */}

            <div
              className="
                lg:col-span-8 flex flex-wrap gap-2
              "
            >
              {SPECIALTIES.map((spec) => (
                <button
                  type="button"
                  key={spec}
                  onClick={() => setSelectedSpecialty(spec)}
                  className={`
                    px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-normal transition-all

                    ${
                      selectedSpecialty === spec
                        ? "bg-action text-on-action scale-105"
                        : "bg-subtle dark:bg-surface text-muted hover:text-ink hover:bg-subtle border border-line"
                    }
                  `}
                >
                  {spec}
                </button>
              ))}
            </div>

            {/* Max Starting Rate Filter */}

            <div
              className="
                lg:col-span-4 bg-subtle dark:bg-surface border border-line rounded-md p-4 flex flex-col gap-2
              "
            >
              <div
                className="
                  flex justify-between items-center text-[11px] font-bold uppercase tracking-widest
                "
              >
                <span
                  className="
                    text-muted flex items-center gap-1
                  "
                >
                  <DollarSign size={12} className="text-action" />
                  Max Starting Rate
                </span>

                <span
                  className="
                    font-mono text-action text-xs
                  "
                >
                  ${maxBudget} USD
                </span>
              </div>

              <input
                type="range"
                min="50"
                max="5000"
                step="50"
                value={maxBudget}
                onChange={(event) => setMaxBudget(Number(event.target.value))}
                className="
                  w-full h-1 bg-subtle rounded-md appearance-none cursor-pointer accent-action
                "
              />
            </div>
          </div>
        </div>

        {/*=================================================
        Results Grid
        =================================================*/}

        {error && (
          <div
            className="
              p-4 bg-subtle border border-line text-action text-xs font-mono uppercase tracking-widest text-center rounded-md mb-12
            "
          >
            {error}
          </div>
        )}

        {loading ? (
          <div
            className="
              flex flex-col items-center justify-center py-32 space-y-6
            "
          >
            <div className="relative">
              <div
                className="
                  absolute inset-0 border-t-2 border-line rounded-full animate-spin
                "
              />

              <Loader2
                className="
                  animate-spin text-muted
                "
                size={48}
              />
            </div>

            <span
              className="
                text-[10px] text-action font-bold uppercase tracking-normal animate-pulse
              "
            >
              Loading designers...
            </span>
          </div>
        ) : filteredDesigners.length === 0 ? (
          <div
            className="
              text-center py-28 border border-line bg-surface rounded-md space-y-4
            "
          >
            <Sparkles
              size={40}
              className="
                text-muted mx-auto
              "
            />

            <h3
              className="
                text-2xl font-serif italic text-ink
              "
            >
              No designers match these filters.
            </h3>

            <p
              className="
                text-[10px] uppercase tracking-widest text-muted font-bold
              "
            >
              Try expanding your budget slider or searching a different term.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearchQuery("");

                setSelectedSpecialty("All");

                setMaxBudget(5000);
              }}
              className="
                mt-4 px-6 py-2.5 bg-subtle hover:bg-subtle text-action text-[11px] uppercase tracking-widest font-bold rounded-md border border-line transition-colors
              "
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div
            className="
              grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8
            "
          >
            {filteredDesigners.map((designer) => {
              const designerId = designer.id || designer._id;

              const startingRate = parseFloat(
                designer.starting_rate || designer.base_rate || 0,
              );

              const rating = parseFloat(designer.avg_rating || 5.0).toFixed(1);

              const completedBookings = parseInt(
                designer.total_completed_bookings || 0,
                10,
              );

              return (
                <div
                  key={designerId}
                  className="
                    bg-surface border border-line rounded-md p-4 flex flex-col justify-between group hover:border-line transition-all duration-500 hover:-translate-y-1 relative overflow-hidden
                  "
                >

                  <div>
                    {/* Card Header */}

                    <div
                      className="
                        flex items-start justify-between gap-4 mb-6
                      "
                    >
                      <div className="relative">
                        <img
                          src={
                            designer.profile_image_url ||
                            `https://api.dicebear.com/7.x/bottts/svg?seed=${
                              designerId || designer.username
                            }`
                          }
                          alt={
                            designer.full_name ||
                            designer.username ||
                            "Designer"
                          }
                          className="
                            w-16 h-16 rounded-md object-cover border border-line group-hover:border-line transition-colors
                          "
                        />

                        <div
                          className="
                            absolute -bottom-1 -right-1 bg-surface dark:bg-canvas rounded-full p-0.5
                          "
                        >
                          <CheckCircle2 size={14} className="text-action" />
                        </div>
                      </div>

                      {/* Rating Badge */}

                      <div
                        className="
                          bg-subtle dark:bg-surface border border-line px-3 py-1.5 rounded-md flex items-center gap-1.5
                        "
                      >
                        <Star
                          size={12}
                          className="
                            text-action fill-action
                          "
                        />

                        <span
                          className="
                            text-[10px] font-mono font-bold text-ink
                          "
                        >
                          {rating}
                        </span>
                      </div>
                    </div>

                    {/* Designer Title & Bio */}

                    <h3
                      className="
                        text-xl font-serif text-ink group-hover:text-action transition-colors truncate
                      "
                    >
                      {designer.full_name ||
                        designer.username ||
                        "Anonymous Designer"}
                    </h3>

                    <p
                      className="
                        text-[11px] uppercase tracking-normal font-bold text-muted mt-0.5 mb-4
                      "
                    >
                      {designer.tagline || "Designer"}
                    </p>

                    <p
                      className="
                        text-xs text-ink dark:text-muted font-light line-clamp-2 leading-relaxed mb-6
                      "
                    >
                      {designer.bio ||
                        "Crafting avant-garde silhouettes and digital apparel concepts for modern creators."}
                    </p>

                    {/* Stats Row */}

                    <div
                      className="
                        grid grid-cols-2 gap-2 bg-subtle dark:bg-surface p-3 rounded-md border border-line mb-6 text-center
                      "
                    >
                      <div>
                        <p
                          className="
                            text-[11px] uppercase tracking-widest text-muted font-bold flex items-center justify-center gap-1
                          "
                        >
                          <Briefcase size={10} />
                          Completed
                        </p>

                        <p
                          className="
                            text-sm font-mono font-bold text-ink mt-0.5
                          "
                        >
                          {completedBookings}
                        </p>
                      </div>

                      <div
                        className="
                          border-l border-line
                        "
                      >
                        <p
                          className="
                            text-[11px] uppercase tracking-widest text-muted font-bold flex items-center justify-center gap-1
                          "
                        >
                          <DollarSign size={10} />
                          From
                        </p>

                        <p
                          className="
                            text-sm font-mono font-bold text-action mt-0.5
                          "
                        >
                          ${startingRate.toFixed(0)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/*=====================================
                  WhatsApp Availability

                  Informational only.

                  The phone number / wa.me link is NOT
                  exposed from the directory.

                  Actual WhatsApp contact remains behind
                  the private booking contact endpoint.
                  =====================================*/}

                  <div
                    className="
                      mb-3 rounded-md border border-line bg-subtle p-3
                    "
                  >
                    <div
                      className="
                        flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-action
                      "
                    >
                      <MessageCircle size={12} />
                      WhatsApp after booking
                    </div>

                    <p
                      className="
                        mt-1.5 text-[11px] leading-4 text-muted
                      "
                    >
                      Chat and video-call coordination can become available
                      after the Designer accepts your booking and contact
                      sharing is enabled.
                    </p>

                    <div
                      className="
                        mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted
                      "
                    >
                      <span
                        className="
                          inline-flex items-center gap-1
                        "
                      >
                        <MessageCircle size={10} />
                        Messaging
                      </span>

                      <span
                        className="
                          inline-flex items-center gap-1
                        "
                      >
                        <Video size={10} />
                        Video coordination
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}

                  <div
                    className="
                      space-y-2 pt-2 border-t border-line
                    "
                  >
                    <Link
                      to={`/creator/bookings/new?designer_id=${designerId}&budget=${startingRate}`}
                      className="
                        w-full py-3.5 bg-action hover:bg-action dark:hover:bg-surface text-on-action text-[11px] uppercase tracking-normal font-semibold rounded-md transition-all flex items-center justify-center gap-2
                      "
                    >
                      <Zap size={14} />
                      Initiate Booking
                    </Link>

                    <button
                      type="button"
                      onClick={() => navigate(`/directory/${designerId}`)}
                      className="
                        w-full py-2.5 bg-transparent hover:bg-subtle text-muted hover:text-ink text-[11px] uppercase tracking-normal font-bold rounded-md transition-colors flex items-center justify-center gap-1
                      "
                    >
                      View Portfolio
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
