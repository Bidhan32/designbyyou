/*
=========================================================
FashionVision Designer Bookings
Designer Contract Pipeline
Version 2.0
=========================================================
*/

import React, {
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";

import {
    AlertCircle,
    ArrowRight,
    BadgeDollarSign,
    Ban,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Compass,
    FileCheck2,
    Hourglass,
    Inbox,
    Loader2,
    LockKeyhole,
    PlayCircle,
    RefreshCw,
    Search,
    ShieldCheck,
    Sparkles,
    UploadCloud,
    UserRound
} from "lucide-react";

import {
    Link
} from "react-router-dom";

import API from "../../api/axios";

/*=========================================================
Booking Status Configuration
=========================================================*/

const BOOKING_STATUS = Object.freeze({
    PENDING: "pending",
    AWAITING_PAYMENT: "awaiting_payment",
    FUNDED: "funded",
    ACCEPTED: "accepted",
    PROGRESS: "progress",
    REVIEW_PROTOTYPE: "review_prototype",
    FINAL_PRODUCTION: "final_production",
    REVIEW_FINAL: "review_final",
    REVIEW: "review",
    CANCELLATION_PENDING: "cancellation_pending",
    COMPLETED: "completed",
    DELIVERED: "delivered",
    CANCELLED: "cancelled"
});

const TAB_DEFINITIONS = Object.freeze([
    {
        id: "pending",
        label: "New Requests",
        statuses: [
            BOOKING_STATUS.PENDING,
            BOOKING_STATUS.FUNDED
        ]
    },
    {
        id: "active",
        label: "In Progress",
        statuses: [
            BOOKING_STATUS.AWAITING_PAYMENT,
            BOOKING_STATUS.ACCEPTED,
            BOOKING_STATUS.PROGRESS,
            BOOKING_STATUS.REVIEW_PROTOTYPE,
            BOOKING_STATUS.FINAL_PRODUCTION,
            BOOKING_STATUS.REVIEW_FINAL,
            BOOKING_STATUS.REVIEW,
            BOOKING_STATUS.CANCELLATION_PENDING
        ]
    },
    {
        id: "completed",
        label: "Archive",
        statuses: [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.DELIVERED,
            BOOKING_STATUS.CANCELLED
        ]
    }
]);

const STATUS_PROGRESS = Object.freeze({
    [BOOKING_STATUS.PENDING]: 8,
    [BOOKING_STATUS.AWAITING_PAYMENT]: 18,
    [BOOKING_STATUS.FUNDED]: 24,
    [BOOKING_STATUS.ACCEPTED]: 32,
    [BOOKING_STATUS.PROGRESS]: 42,
    [BOOKING_STATUS.REVIEW_PROTOTYPE]: 56,
    [BOOKING_STATUS.FINAL_PRODUCTION]: 72,
    [BOOKING_STATUS.REVIEW_FINAL]: 88,
    [BOOKING_STATUS.REVIEW]: 88,
    [BOOKING_STATUS.CANCELLATION_PENDING]: 92,
    [BOOKING_STATUS.COMPLETED]: 100,
    [BOOKING_STATUS.DELIVERED]: 100,
    [BOOKING_STATUS.CANCELLED]: 100
});

/*=========================================================
Helpers
=========================================================*/

function safelyParseJson(value) {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function getStoredUserId() {
    const directId =
        localStorage.getItem("userId");

    if (directId) {
        return directId;
    }

    const storedUser =
        safelyParseJson(
            localStorage.getItem("user")
        );

    return (
        storedUser?.id ||
        storedUser?._id ||
        null
    );
}

function normalizeStatus(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function getFirstName(value) {
    const name = String(value || "")
        .trim();

    return name
        ? name.split(/\s+/)[0]
        : "Creator";
}

function formatCurrency(value) {
    const amount = Number(value);

    return new Intl.NumberFormat(
        "en-US",
        {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ).format(
        Number.isFinite(amount)
            ? amount
            : 0
    );
}

function formatDate(value) {
    if (!value) {
        return "Not scheduled";
    }

    const date = new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "Invalid date";
    }

    return date.toLocaleDateString(
        undefined,
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    );
}

function getDeadlineMessage(value) {
    if (!value) {
        return "Deadline not set";
    }

    const deadline = new Date(value);

    if (
        Number.isNaN(
            deadline.getTime()
        )
    ) {
        return "Deadline unavailable";
    }

    const difference =
        deadline.getTime() -
        Date.now();

    const days = Math.ceil(
        difference /
        86400000
    );

    if (days < 0) {
        return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    }

    if (days === 0) {
        return "Due today";
    }

    if (days === 1) {
        return "Due tomorrow";
    }

    return `${days} days remaining`;
}

function getApiErrorMessage(error) {
    return (
        error?.response?.data?.message ||
        error?.message ||
        "The contract pipeline could not be loaded."
    );
}

function getStatusDetails(status) {
    switch (
        normalizeStatus(status)
    ) {
        case BOOKING_STATUS.PENDING:
            return {
                label: "New Request",
                description: "Review the creator's brief and decide whether to accept this contract.",
                badgeClass: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
                icon: Hourglass
            };

        case BOOKING_STATUS.AWAITING_PAYMENT:
            return {
                label: "Awaiting Escrow",
                description: "You accepted this project. Work begins after the creator funds escrow.",
                badgeClass: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-300",
                icon: LockKeyhole
            };

        case BOOKING_STATUS.FUNDED:
            return {
                label: "Escrow Funded",
                description: "The payment is secured. Accept the project to begin prototype production.",
                badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
                icon: ShieldCheck
            };

        case BOOKING_STATUS.ACCEPTED:
        case BOOKING_STATUS.PROGRESS:
            return {
                label: "Prototype Production",
                description: "Build and submit the first prototype for creator review.",
                badgeClass: "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#8f7118] dark:text-[#e4c760]",
                icon: PlayCircle
            };

        case BOOKING_STATUS.REVIEW_PROTOTYPE:
            return {
                label: "Prototype Review",
                description: "Your prototype is with the creator. No action is needed right now.",
                badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300",
                icon: Clock3
            };

        case BOOKING_STATUS.FINAL_PRODUCTION:
            return {
                label: "Final Production",
                description: "The prototype was approved. Prepare and submit the final deliverables.",
                badgeClass: "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#8f7118] dark:text-[#e4c760]",
                icon: UploadCloud
            };

        case BOOKING_STATUS.REVIEW_FINAL:
        case BOOKING_STATUS.REVIEW:
            return {
                label: "Final Review",
                description: "The creator is reviewing your final delivery before payout release.",
                badgeClass: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
                icon: FileCheck2
            };

        case BOOKING_STATUS.CANCELLATION_PENDING:
            return {
                label: "Cancellation Processing",
                description: "Cancellation and any required refund reconciliation are being processed.",
                badgeClass: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
                icon: Ban
            };

        case BOOKING_STATUS.COMPLETED:
        case BOOKING_STATUS.DELIVERED:
            return {
                label: "Completed & Paid",
                description: "The contract is complete and the payout has been released.",
                badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
                icon: CheckCircle2
            };

        case BOOKING_STATUS.CANCELLED:
            return {
                label: "Cancelled",
                description: "This contract is closed and no further work is required.",
                badgeClass: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/45",
                icon: Ban
            };

        default:
            return {
                label: status || "Unknown",
                description: "Open the contract to review its current state.",
                badgeClass: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/50",
                icon: Clock3
            };
    }
}

function getNextAction(status) {
    switch (
        normalizeStatus(status)
    ) {
        case BOOKING_STATUS.PENDING:
            return {
                label: "Review Request",
                detail: "Accept or reject",
                icon: ArrowRight,
                accentClass: "text-amber-700 dark:text-amber-300",
                panelClass: "border-amber-200 bg-amber-50/80 dark:border-amber-400/15 dark:bg-amber-400/5"
            };

        case BOOKING_STATUS.FUNDED:
            return {
                label: "Accept & Begin",
                detail: "Escrow is secured",
                icon: ShieldCheck,
                accentClass: "text-emerald-700 dark:text-emerald-300",
                panelClass: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/15 dark:bg-emerald-400/5"
            };

        case BOOKING_STATUS.ACCEPTED:
        case BOOKING_STATUS.PROGRESS:
            return {
                label: "Submit Prototype",
                detail: "Phase one deliverable",
                icon: PlayCircle,
                accentClass: "text-[#9b791d] dark:text-[#D4AF37]",
                panelClass: "border-[#D4AF37]/25 bg-[#D4AF37]/5"
            };

        case BOOKING_STATUS.FINAL_PRODUCTION:
            return {
                label: "Submit Final Files",
                detail: "Complete the contract",
                icon: UploadCloud,
                accentClass: "text-[#9b791d] dark:text-[#D4AF37]",
                panelClass: "border-[#D4AF37]/25 bg-[#D4AF37]/5"
            };

        case BOOKING_STATUS.AWAITING_PAYMENT:
            return {
                label: "Awaiting Creator",
                detail: "Escrow payment pending",
                icon: LockKeyhole,
                accentClass: "text-orange-700 dark:text-orange-300",
                panelClass: "border-orange-200 bg-orange-50/80 dark:border-orange-400/15 dark:bg-orange-400/5"
            };

        case BOOKING_STATUS.REVIEW_PROTOTYPE:
            return {
                label: "Awaiting Review",
                detail: "Prototype submitted",
                icon: Clock3,
                accentClass: "text-indigo-700 dark:text-indigo-300",
                panelClass: "border-indigo-200 bg-indigo-50/80 dark:border-indigo-400/15 dark:bg-indigo-400/5"
            };

        case BOOKING_STATUS.REVIEW_FINAL:
        case BOOKING_STATUS.REVIEW:
            return {
                label: "Awaiting Payout",
                detail: "Final approval pending",
                icon: FileCheck2,
                accentClass: "text-violet-700 dark:text-violet-300",
                panelClass: "border-violet-200 bg-violet-50/80 dark:border-violet-400/15 dark:bg-violet-400/5"
            };

        case BOOKING_STATUS.CANCELLATION_PENDING:
            return {
                label: "Processing",
                detail: "Cancellation reconciliation",
                icon: Loader2,
                accentClass: "text-rose-700 dark:text-rose-300",
                panelClass: "border-rose-200 bg-rose-50/80 dark:border-rose-400/15 dark:bg-rose-400/5",
                spinning: true
            };

        case BOOKING_STATUS.COMPLETED:
        case BOOKING_STATUS.DELIVERED:
            return {
                label: "View Record",
                detail: "Completed contract",
                icon: CheckCircle2,
                accentClass: "text-emerald-700 dark:text-emerald-300",
                panelClass: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/15 dark:bg-emerald-400/5"
            };

        default:
            return {
                label: "View Contract",
                detail: "Open full workspace",
                icon: ArrowRight,
                accentClass: "text-slate-700 dark:text-white/70",
                panelClass: "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]"
            };
    }
}

/*=========================================================
Component
=========================================================*/

function DesignerBookings() {
    const currentUserId =
        useMemo(
            () => getStoredUserId(),
            []
        );

    const [bookings, setBookings] =
        useState([]);

    const [loading, setLoading] =
        useState(true);

    const [refreshing, setRefreshing] =
        useState(false);

    const [error, setError] =
        useState("");

    const [activeTab, setActiveTab] =
        useState("active");

    const [searchQuery, setSearchQuery] =
        useState("");

    const fetchBookings =
        useCallback(
            async ({ silent = false } = {}) => {
                if (!currentUserId) {
                    setLoading(false);
                    setError(
                        "Your account session could not be identified. Please sign in again."
                    );

                    return;
                }

                if (silent) {
                    setRefreshing(true);
                } else {
                    setLoading(true);
                }

                setError("");

                try {
                    const response =
                        await API.get(
                            "/p2p-bookings/pipeline"
                        );

                    const pipeline =
                        Array.isArray(
                            response?.data?.data
                        )
                            ? response.data.data
                            : [];

                    const designerBookings =
                        pipeline.filter(
                            booking =>
                                String(
                                    booking?.designer_id ||
                                    ""
                                ) ===
                                String(currentUserId)
                        );

                    setBookings(
                        designerBookings
                    );
                } catch (requestError) {
                    console.error(
                        "Unable to load designer bookings:",
                        requestError
                    );

                    setError(
                        getApiErrorMessage(
                            requestError
                        )
                    );
                } finally {
                    setLoading(false);
                    setRefreshing(false);
                }
            },
            [currentUserId]
        );

    useEffect(
        () => {
            fetchBookings();
        },
        [fetchBookings]
    );

    const tabCounts =
        useMemo(
            () => {
                return TAB_DEFINITIONS.reduce(
                    (counts, tab) => {
                        counts[tab.id] =
                            bookings.filter(
                                booking =>
                                    tab.statuses.includes(
                                        normalizeStatus(
                                            booking.status
                                        )
                                    )
                            ).length;

                        return counts;
                    },
                    {}
                );
            },
            [bookings]
        );

    const summary =
        useMemo(
            () => ({
                total:
                    bookings.length,

                actionRequired:
                    bookings.filter(
                        booking =>
                            [
                                BOOKING_STATUS.PENDING,
                                BOOKING_STATUS.FUNDED,
                                BOOKING_STATUS.PROGRESS,
                                BOOKING_STATUS.ACCEPTED,
                                BOOKING_STATUS.FINAL_PRODUCTION
                            ].includes(
                                normalizeStatus(
                                    booking.status
                                )
                            )
                    ).length,

                awaitingCreator:
                    bookings.filter(
                        booking =>
                            [
                                BOOKING_STATUS.AWAITING_PAYMENT,
                                BOOKING_STATUS.REVIEW_PROTOTYPE,
                                BOOKING_STATUS.REVIEW_FINAL,
                                BOOKING_STATUS.REVIEW
                            ].includes(
                                normalizeStatus(
                                    booking.status
                                )
                            )
                    ).length,

                completed:
                    bookings.filter(
                        booking =>
                            [
                                BOOKING_STATUS.COMPLETED,
                                BOOKING_STATUS.DELIVERED
                            ].includes(
                                normalizeStatus(
                                    booking.status
                                )
                            )
                    ).length
            }),
            [bookings]
        );

    const visibleBookings =
        useMemo(
            () => {
                const activeDefinition =
                    TAB_DEFINITIONS.find(
                        tab =>
                            tab.id ===
                            activeTab
                    ) ||
                    TAB_DEFINITIONS[1];

                const query =
                    searchQuery
                        .trim()
                        .toLowerCase();

                return [...bookings]
                    .filter(
                        booking =>
                            activeDefinition.statuses.includes(
                                normalizeStatus(
                                    booking.status
                                )
                            )
                    )
                    .filter(
                        booking => {
                            if (!query) {
                                return true;
                            }

                            const searchableText = [
                                booking.id,
                                booking.reference_design_title,
                                booking.brief_text,
                                booking.sender_name,
                                booking.creator_name,
                                booking.booking_type,
                                booking.status
                            ]
                                .filter(Boolean)
                                .join(" ")
                                .toLowerCase();

                            return searchableText.includes(
                                query
                            );
                        }
                    )
                    .sort(
                        (first, second) =>
                            new Date(
                                second.created_at ||
                                0
                            ).getTime() -
                            new Date(
                                first.created_at ||
                                0
                            ).getTime()
                    );
            },
            [
                activeTab,
                bookings,
                searchQuery
            ]
        );

    return (
        <main className="relative min-h-screen overflow-hidden bg-slate-50 pb-20 text-slate-950 antialiased transition-colors duration-300 dark:bg-[#030303] dark:text-white">
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div className="absolute -right-[12rem] -top-[14rem] h-[34rem] w-[34rem] rounded-full bg-[#D4AF37]/10 blur-[150px] dark:bg-[#D4AF37]/15" />
                <div className="absolute -bottom-[16rem] -left-[15rem] h-[38rem] w-[38rem] rounded-full bg-violet-500/5 blur-[170px] dark:bg-violet-500/10" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.025)_1px,transparent_1px)] bg-[size:38px_38px] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.018)_1px,transparent_1px)]" />
            </div>

            <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-2xl dark:border-white/5 dark:bg-[#070707]/80">
                <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10">
                    <div>
                        <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.35em] text-[#B89122] dark:text-[#D4AF37]">
                            <Compass size={14} />
                            Designer Operations
                        </div>

                        <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">
                            Contract
                            <span className="ml-3 italic text-[#B89122] dark:text-[#D4AF37]">
                                Pipeline
                            </span>
                        </h1>

                        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/45">
                            Review new requests, track escrow milestones and deliver every project from one focused workspace.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            fetchBookings({
                                silent: true
                            })
                        }
                        disabled={refreshing}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.18em] text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-[#D4AF37]/50 hover:text-[#9B791D] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:text-[#D4AF37]"
                    >
                        <RefreshCw
                            size={15}
                            className={
                                refreshing
                                    ? "animate-spin"
                                    : ""
                            }
                        />
                        Refresh
                    </button>
                </div>
            </header>

            <div className="relative z-10 mx-auto max-w-[1280px] space-y-8 px-5 pt-8 sm:px-8 lg:px-10">
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        {
                            label: "All Contracts",
                            value: summary.total,
                            icon: Inbox,
                            helper: "Designer assignments"
                        },
                        {
                            label: "Action Required",
                            value: summary.actionRequired,
                            icon: Sparkles,
                            helper: "Ready for your input"
                        },
                        {
                            label: "Awaiting Creator",
                            value: summary.awaitingCreator,
                            icon: Clock3,
                            helper: "Payment or review pending"
                        },
                        {
                            label: "Completed",
                            value: summary.completed,
                            icon: CheckCircle2,
                            helper: "Paid and archived"
                        }
                    ].map(
                        item => {
                            const Icon = item.icon;

                            return (
                                <article
                                    key={item.label}
                                    className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/5 dark:bg-[#0B0B0B]/90 dark:shadow-2xl"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-white/35">
                                                {item.label}
                                            </p>
                                            <p className="mt-3 text-3xl font-semibold tracking-tight">
                                                {item.value}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-white/40">
                                                {item.helper}
                                            </p>
                                        </div>

                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#9B791D] dark:text-[#D4AF37]">
                                            <Icon size={20} />
                                        </div>
                                    </div>
                                </article>
                            );
                        }
                    )}
                </section>

                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur dark:border-white/5 dark:bg-[#0A0A0A]/90 dark:shadow-2xl">
                    <div className="border-b border-slate-200 p-5 dark:border-white/5 sm:p-6">
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex gap-7 overflow-x-auto border-b border-slate-200 dark:border-white/10">
                                {TAB_DEFINITIONS.map(
                                    tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() =>
                                                setActiveTab(
                                                    tab.id
                                                )
                                            }
                                            className={`relative flex shrink-0 items-center gap-2 pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition ${
                                                activeTab === tab.id
                                                    ? "text-slate-950 dark:text-white"
                                                    : "text-slate-400 hover:text-slate-700 dark:text-white/35 dark:hover:text-white/70"
                                            }`}
                                        >
                                            {tab.label}

                                            <span className={`rounded-full border px-2 py-0.5 text-[9px] ${
                                                activeTab === tab.id
                                                    ? "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#9B791D] dark:text-[#D4AF37]"
                                                    : "border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/35"
                                            }`}>
                                                {tabCounts[tab.id] || 0}
                                            </span>

                                            {activeTab === tab.id && (
                                                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#D4AF37]" />
                                            )}
                                        </button>
                                    )
                                )}
                            </div>

                            <label className="relative block w-full xl:max-w-sm">
                                <Search
                                    size={16}
                                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30"
                                />

                                <input
                                    type="search"
                                    value={searchQuery}
                                    onChange={event =>
                                        setSearchQuery(
                                            event.target.value
                                        )
                                    }
                                    placeholder="Search contracts, clients or IDs"
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#D4AF37]/60 focus:bg-white focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25 dark:focus:bg-white/[0.06]"
                                />
                            </label>
                        </div>
                    </div>

                    {error ? (
                        <div className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-400/20 dark:bg-rose-400/10 sm:m-6">
                            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
                                        <AlertCircle size={21} />
                                    </div>

                                    <div>
                                        <h2 className="font-semibold text-rose-900 dark:text-rose-100">
                                            Could not load contracts
                                        </h2>
                                        <p className="mt-1 text-sm leading-6 text-rose-700/80 dark:text-rose-200/70">
                                            {error}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        fetchBookings()
                                    }
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-rose-800"
                                >
                                    <RefreshCw size={14} />
                                    Retry
                                </button>
                            </div>
                        </div>
                    ) : loading ? (
                        <div className="space-y-4 p-5 sm:p-6">
                            {[1, 2, 3].map(
                                item => (
                                    <div
                                        key={item}
                                        className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/5 dark:bg-white/[0.035]"
                                    />
                                )
                            )}
                        </div>
                    ) : visibleBookings.length === 0 ? (
                        <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-20 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-[#B89122] shadow-inner dark:border-white/10 dark:bg-white/[0.03] dark:text-[#D4AF37]">
                                {searchQuery ? (
                                    <Search size={30} />
                                ) : (
                                    <Inbox size={30} />
                                )}
                            </div>

                            <h2 className="mt-6 font-serif text-3xl font-light">
                                {searchQuery
                                    ? "No matching contracts"
                                    : `No ${TAB_DEFINITIONS.find(tab => tab.id === activeTab)?.label.toLowerCase()} yet`}
                            </h2>

                            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500 dark:text-white/40">
                                {searchQuery
                                    ? "Try a different client name, booking ID, project title or status."
                                    : "Contracts for this stage will appear here automatically as your booking workflow moves forward."}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4 p-5 sm:p-6">
                            {visibleBookings.map(
                                booking => {
                                    const status =
                                        normalizeStatus(
                                            booking.status
                                        );

                                    const statusDetails =
                                        getStatusDetails(
                                            status
                                        );

                                    const actionDetails =
                                        getNextAction(
                                            status
                                        );

                                    const StatusIcon =
                                        statusDetails.icon;

                                    const ActionIcon =
                                        actionDetails.icon;

                                    const creatorName =
                                        booking.sender_name ||
                                        booking.creator_name ||
                                        "Project Creator";

                                    const creatorAvatar =
                                        booking.sender_avatar ||
                                        booking.creator_avatar ||
                                        null;

                                    const projectTitle =
                                        booking.reference_design_title ||
                                        "Bespoke Design Commission";

                                    const progress =
                                        STATUS_PROGRESS[status] ??
                                        0;

                                    return (
                                        <Link
                                            key={booking.id}
                                            to={`/designer/bookings/${booking.id}`}
                                            className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/45 hover:shadow-xl dark:border-white/5 dark:bg-[#0D0D0D] dark:hover:border-[#D4AF37]/25 dark:hover:shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
                                        >
                                            <div className="grid gap-0 xl:grid-cols-[1fr_270px]">
                                                <div className="p-5 sm:p-7">
                                                    <div className="flex flex-wrap items-center gap-2.5">
                                                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.17em] ${statusDetails.badgeClass}`}>
                                                            <StatusIcon size={13} />
                                                            {statusDetails.label}
                                                        </span>

                                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/35">
                                                            {String(booking.id || "").slice(0, 8).toUpperCase()}
                                                        </span>

                                                        <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.17em] text-[#8F7118] dark:text-[#D4AF37]">
                                                            {booking.booking_type || "commission"}
                                                        </span>
                                                    </div>

                                                    <div className="mt-5">
                                                        <div className="flex items-start justify-between gap-5">
                                                            <div>
                                                                <h2 className="font-serif text-2xl font-light tracking-tight text-slate-950 transition group-hover:text-[#9B791D] dark:text-white dark:group-hover:text-[#D4AF37] sm:text-3xl">
                                                                    {projectTitle}
                                                                </h2>

                                                                <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-white/45">
                                                                    {booking.brief_text ||
                                                                        "No project brief was supplied."}
                                                                </p>
                                                            </div>

                                                            <ArrowRight className="hidden shrink-0 -translate-x-2 text-[#D4AF37] opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100 sm:block" />
                                                        </div>
                                                    </div>

                                                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/5 dark:bg-white/[0.025]">
                                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                                                                <UserRound size={13} />
                                                                Creator
                                                            </div>

                                                            <div className="mt-2 flex items-center gap-2.5">
                                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
                                                                    {creatorAvatar ? (
                                                                        <img
                                                                            src={creatorAvatar}
                                                                            alt={creatorName}
                                                                            className="h-full w-full object-cover"
                                                                        />
                                                                    ) : (
                                                                        <span className="text-xs font-bold text-slate-500 dark:text-white/40">
                                                                            {getFirstName(creatorName).charAt(0).toUpperCase()}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <span className="truncate text-sm font-semibold">
                                                                    {creatorName}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/5 dark:bg-white/[0.025]">
                                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                                                                <BadgeDollarSign size={13} />
                                                                Contract Value
                                                            </div>
                                                            <p className="mt-2 font-mono text-lg font-semibold text-[#9B791D] dark:text-[#D4AF37]">
                                                                {formatCurrency(booking.agreed_price)}
                                                            </p>
                                                        </div>

                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/5 dark:bg-white/[0.025]">
                                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                                                                <CalendarDays size={13} />
                                                                Deadline
                                                            </div>
                                                            <p className="mt-2 text-sm font-semibold">
                                                                {formatDate(booking.deadline)}
                                                            </p>
                                                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/35">
                                                                {getDeadlineMessage(booking.deadline)}
                                                            </p>
                                                        </div>

                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/5 dark:bg-white/[0.025]">
                                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                                                                <ShieldCheck size={13} />
                                                                Escrow
                                                            </div>
                                                            <p className={`mt-2 text-sm font-semibold ${
                                                                booking.escrow_locked
                                                                    ? "text-emerald-700 dark:text-emerald-300"
                                                                    : "text-slate-600 dark:text-white/55"
                                                            }`}>
                                                                {booking.escrow_locked
                                                                    ? "Secured"
                                                                    : "Not funded"}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-6">
                                                        <div className="mb-2 flex items-center justify-between gap-4">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                                                                Workflow Progress
                                                            </p>
                                                            <p className="text-[10px] font-semibold text-slate-500 dark:text-white/35">
                                                                {progress}%
                                                            </p>
                                                        </div>

                                                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                                                            <div
                                                                className="h-full rounded-full bg-gradient-to-r from-[#A88620] to-[#E2C45D] transition-all duration-700"
                                                                style={{
                                                                    width: `${progress}%`
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <aside className={`flex flex-col justify-between border-t p-5 dark:border-white/5 xl:border-l xl:border-t-0 ${actionDetails.panelClass}`}>
                                                    <div>
                                                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-current/15 bg-white/60 ${actionDetails.accentClass} dark:bg-black/20`}>
                                                            <ActionIcon
                                                                size={22}
                                                                className={
                                                                    actionDetails.spinning
                                                                        ? "animate-spin"
                                                                        : ""
                                                                }
                                                            />
                                                        </div>

                                                        <p className={`mt-5 text-[10px] font-black uppercase tracking-[0.2em] ${actionDetails.accentClass}`}>
                                                            Next Step
                                                        </p>

                                                        <h3 className="mt-2 text-lg font-semibold">
                                                            {actionDetails.label}
                                                        </h3>

                                                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/40">
                                                            {actionDetails.detail}
                                                        </p>
                                                    </div>

                                                    <div className="mt-6 border-t border-current/10 pt-4">
                                                        <p className="text-xs leading-5 text-slate-500 dark:text-white/40">
                                                            {statusDetails.description}
                                                        </p>

                                                        <div className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 transition group-hover:text-[#9B791D] dark:text-white/65 dark:group-hover:text-[#D4AF37]">
                                                            Open workspace
                                                            <ArrowRight size={14} />
                                                        </div>
                                                    </div>
                                                </aside>
                                            </div>
                                        </Link>
                                    );
                                }
                            )}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}

export default DesignerBookings;
