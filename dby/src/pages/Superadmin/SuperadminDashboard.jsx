import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Users,
  UserCheck,
  HardDrive,
  Activity,
  DollarSign,
  Wallet,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from "lucide-react";

import API from "../../api/axios";
import { Link } from "react-router-dom";

/**
 * ============================================================
 * DesignByYou — Super Admin Dashboard
 * ============================================================
 *
 * Backend endpoints used:
 *
 * GET /superadmin/dashboard-stats
 * GET /superadmin/finance/overview
 * GET /superadmin/commission
 *
 * IMPORTANT:
 * - No fake "online users" count.
 * - No fake infrastructure health.
 * - No maintenance toggle here until persistent backend
 *   maintenance state exists.
 * - Financial values come from the existing transaction,
 *   booking, wallet and payout-request ledgers.
 * - Designer commission is tier-based and read-only.
 * - The booking remainder retained by the platform is not
 *   described as Designer commission.
 * ============================================================
 */

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [finance, setFinance] = useState(null);
  const [commissionPolicy, setCommissionPolicy] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /* ========================================================
       HELPERS
       ======================================================== */

  const numberValue = (value) => {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatMoney = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numberValue(value));
  };

  const getRoleCount = useCallback(
    (role) => {
      if (!Array.isArray(stats?.user_distribution)) {
        return 0;
      }

      const match = stats.user_distribution.find((item) => item.role === role);

      return numberValue(match?.count);
    },
    [stats],
  );

  /* ========================================================
       FETCH DASHBOARD DATA
       ======================================================== */

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const results = await Promise.allSettled([
        API.get("/superadmin/dashboard-stats"),
        API.get("/superadmin/finance/overview"),
        API.get("/superadmin/commission"),
      ]);

      const [statsResult, financeResult, commissionResult] = results;

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value.data);
      } else {
        console.error("Dashboard stats request failed:", statsResult.reason);
      }

      if (financeResult.status === "fulfilled") {
        setFinance(financeResult.value.data?.data || null);
      } else {
        console.error("Finance overview request failed:", financeResult.reason);
      }

      if (commissionResult.status === "fulfilled") {
        setCommissionPolicy(commissionResult.value.data?.data || null);
      } else {
        console.error("Commission request failed:", commissionResult.reason);
      }

      const failedRequests = results.filter(
        (result) => result.status === "rejected",
      );

      if (failedRequests.length === results.length) {
        setError("Unable to load Super Admin monitoring data.");
      } else if (failedRequests.length > 0) {
        setError(
          "Some monitoring data could not be loaded. The available data is shown below.",
        );
      }
    } catch (err) {
      console.error("Super Admin dashboard error:", err);

      setError("Unable to load Super Admin monitoring data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  /* ========================================================
       DERIVED USER INFORMATION
       ======================================================== */

  const totalCreators = getRoleCount("creator");
  const totalDesigners = getRoleCount("designer");
  const totalAdmins = getRoleCount("admin");
  const totalSuperadmins = getRoleCount("superadmin");

  const totalUsers = useMemo(() => {
    if (!Array.isArray(stats?.user_distribution)) {
      return 0;
    }

    return stats.user_distribution.reduce(
      (total, item) => total + numberValue(item.count),
      0,
    );
  }, [stats]);

  const tierPolicy = useMemo(() => {
    return Array.isArray(commissionPolicy?.policy)
      ? commissionPolicy.policy
      : [];
  }, [commissionPolicy]);

  const policyMismatches = numberValue(commissionPolicy?.policy_mismatches);

  const policyConsistent = commissionPolicy?.policy_consistent === true;

  const bookingPlatformRetained =
    finance?.revenue?.booking_platform_retained ??
    finance?.revenue?.booking_commission_revenue ??
    0;

  /* ========================================================
       LOADING
       ======================================================== */

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <RefreshCw size={28} className="animate-spin text-action" />

        <p className="text-[10px] text-muted font-semibold uppercase tracking-normal">
          Loading Platform Intelligence...
        </p>
      </div>
    );
  }

  /* ========================================================
       UI
       ======================================================== */

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-10">
      {/* =================================================
                HEADER
                ================================================= */}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={15} className="text-action" />

            <span className="text-[10px] font-semibold uppercase tracking-normal text-action">
              Super Admin Control
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-serif italic text-ink">
            Platform Overview
          </h1>

          <p className="text-muted text-sm mt-1">
            Users, bookings, revenue, escrow and payout monitoring.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="px-5 py-3 bg-surface border border-line rounded-md flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted hover:border-line hover:text-ink transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />

          {refreshing ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {/* =================================================
                PARTIAL LOAD WARNING
                ================================================= */}

      {error && (
        <div className="p-4 rounded-md bg-canvas border border-line flex items-start gap-3">
          <AlertTriangle
            size={18}
            className="text-action mt-0.5 flex-shrink-0"
          />

          <div>
            <p className="text-xs font-bold text-action">
              Monitoring Warning
            </p>

            <p className="text-xs text-action mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* =================================================
                USER / PROJECT QUICK STATS
                ================================================= */}

      <section className="space-y-4">
        <SectionHeading
          title="Platform Activity"
          subtitle="Account and booking overview"
        />

        <div className="divide-y divide-line rounded-md border border-line bg-surface px-4">
          <StatCard
            label="Total Creators"
            value={totalCreators}
          />

          <StatCard
            label="Total Designers"
            value={totalDesigners}
          />

          <Link to="/superadmin/designer-approvals" className="flex items-center justify-between gap-3 py-3 text-sm hover:underline">
            Review designer applications
            <span className="font-mono text-muted">{stats?.pending_designers == null ? "Count unavailable" : `${stats.pending_designers} pending`}</span>
          </Link>

          <StatCard
            label="Active Projects"
            value={numberValue(stats?.bookings?.active)}
          />
        </div>
      </section>

      {/* =================================================
                PLATFORM FINANCE
                ================================================= */}

      <section className="space-y-4">
        <SectionHeading
          title="Platform Finance"
          subtitle="Calculated from the existing transaction ledger"
        />

        <div className="divide-y divide-line rounded-md border border-line bg-surface px-4">
          <MoneyCard
            label="Total Platform Retained"
            value={formatMoney(finance?.revenue?.total_platform_fees)}
            note="Creator fees plus booking amount retained by platform"
          />

          <MoneyCard
            label="Platform Retained from Bookings"
            value={formatMoney(bookingPlatformRetained)}
            note="Booking base amount retained after Designer commission"
          />

          <MoneyCard
            label="Designer Earnings Released"
            value={formatMoney(finance?.revenue?.designer_earnings_released)}
            note="Net earnings credited to Designers"
          />

          <MoneyCard
            label="Pending Escrow"
            value={formatMoney(finance?.wallets?.pending_escrow_balance)}
            note="Designer funds currently locked"
          />
        </div>
      </section>

      {/* =================================================
                FINANCIAL BREAKDOWN
                ================================================= */}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue / Ledger */}

        <div className="bg-surface rounded-md border border-line overflow-hidden">
          <div className="p-4 border-b border-line">
            <h3 className="font-bold text-ink">Revenue & Ledger</h3>

            <p className="text-xs text-muted mt-1">
              Financial totals from recorded transactions.
            </p>
          </div>

          <div className="divide-y divide-line">
            <DataRow
              label="Creator / Platform Fees"
              value={formatMoney(finance?.revenue?.creator_platform_fees)}
            />

            <DataRow
              label="Platform Retained from Bookings"
              value={formatMoney(bookingPlatformRetained)}
            />

            <DataRow
              label="Completed Booking Release Volume"
              value={formatMoney(
                finance?.revenue?.completed_booking_release_volume,
              )}
            />

            <DataRow
              label="Designer Earnings Released"
              value={formatMoney(finance?.revenue?.designer_earnings_released)}
            />

            <DataRow
              label="Refund Volume"
              value={formatMoney(finance?.revenue?.refund_volume)}
            />

            <DataRow
              label="Total Ledger Transactions"
              value={numberValue(finance?.ledger?.total_transactions)}
            />
          </div>
        </div>

        {/* Wallet / Payout */}

        <div className="bg-surface rounded-md border border-line overflow-hidden">
          <div className="p-4 border-b border-line">
            <h3 className="font-bold text-ink">
              Wallet & Payout Position
            </h3>

            <p className="text-xs text-muted mt-1">
              Designer balances and payout activity.
            </p>
          </div>

          <div className="divide-y divide-line">
            <DataRow
              label="Designer Available Balance"
              value={formatMoney(finance?.wallets?.designer_available_balance)}
            />

            <DataRow
              label="Pending Escrow Balance"
              value={formatMoney(finance?.wallets?.pending_escrow_balance)}
            />

            <DataRow
              label="Pending Payout Balance"
              value={formatMoney(finance?.wallets?.pending_payout_balance)}
            />

            <Link className="flex items-center justify-between gap-2 py-3 text-sm hover:underline" to="/superadmin/finance?tab=payouts">
              Review pending payouts <span className="font-mono">{finance?.payouts?.pending_payout_requests ?? "Count unavailable"}</span>
            </Link>

            <DataRow
              label="Processing Payout Requests"
              value={numberValue(finance?.payouts?.processing_payout_requests)}
            />

            <DataRow
              label="Failed Payout Requests"
              value={numberValue(finance?.payouts?.failed_payout_requests)}
              alert={numberValue(finance?.payouts?.failed_payout_requests) > 0}
            />
          </div>
        </div>
      </section>

      {/* =================================================
                BOOKING MONITORING
                ================================================= */}

      <section className="space-y-4">
        <SectionHeading
          title="Booking Monitoring"
          subtitle="Current operational booking state"
        />

        <div className="bg-surface rounded-md border border-line overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 divide-x divide-y xl:divide-y-0 divide-line">
            <MiniMetric
              label="Total"
              value={numberValue(finance?.bookings?.total_bookings)}
            />

            <MiniMetric
              label="Funded"
              value={numberValue(finance?.bookings?.funded_bookings)}
            />

            <MiniMetric
              label="Active"
              value={numberValue(finance?.bookings?.active_projects)}
            />

            <MiniMetric
              label="Completed"
              value={numberValue(finance?.bookings?.completed_bookings)}
            />

            <MiniMetric
              label="Cancelled"
              value={numberValue(finance?.bookings?.cancelled_bookings)}
            />

            <MiniMetric
              label="Cancel Pending"
              value={numberValue(finance?.bookings?.cancellation_pending)}
              warning={numberValue(finance?.bookings?.cancellation_pending) > 0}
            />

            <MiniMetric
              label="Refund Pending"
              value={numberValue(finance?.bookings?.refund_pending)}
              warning={numberValue(finance?.bookings?.refund_pending) > 0}
            />

            <MiniMetric
              label="Refund Failed"
              value={numberValue(finance?.bookings?.refund_failed)}
              danger={numberValue(finance?.bookings?.refund_failed) > 0}
            />
          </div>
        </div>
      </section>

      {/* =================================================
                DESIGNER TIER COMMISSION POLICY
                ================================================= */}

      <section className="space-y-4">
        <SectionHeading
          title="Designer Tier Commission Policy"
          subtitle="Read-only payout share based on completed bookings"
        />

        <div className="bg-surface rounded-md border border-line overflow-hidden">
          <div className="p-4 border-b border-line flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={17} className="text-action" />

                <h3 className="font-bold text-ink">
                  Automatic Designer Commission
                </h3>
              </div>

              <p className="text-xs text-muted mt-2 max-w-3xl leading-relaxed">
                The percentage shown below is the share of the booking base
                amount credited to the Designer when a completed booking is
                released. Rates are controlled by tier and are not globally
                editable.
              </p>
            </div>

            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border ${
                policyConsistent
                  ? "bg-canvas border-line text-action"
                  : "bg-canvas border-line text-action"
              }`}
            >
              {policyConsistent ? (
                <CheckCircle2 size={15} />
              ) : (
                <AlertTriangle size={15} />
              )}

              <span className="text-[10px] font-semibold uppercase tracking-widest">
                {policyConsistent
                  ? "Policy Synchronized"
                  : `${policyMismatches} Mismatch${
                      policyMismatches === 1 ? "" : "es"
                    }`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 divide-x divide-y xl:divide-y-0 divide-line">
            {tierPolicy.length > 0 ? (
              tierPolicy.map((tier) => (
                <TierPolicyCard
                  key={tier.tier}
                  tier={tier.tier}
                  minimum={tier.minimum_completed_bookings}
                  maximum={tier.maximum_completed_bookings}
                  rate={tier.commission_rate}
                  designerCount={tier.designer_count}
                />
              ))
            ) : (
              <div className="xl:col-span-5 p-4 text-center text-sm text-muted">
                Designer tier policy data is unavailable.
              </div>
            )}
          </div>

          {!policyConsistent && policyMismatches > 0 && (
            <div className="m-6 mt-0 p-4 bg-canvas border border-line rounded-md flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="text-action mt-0.5 flex-shrink-0"
              />

              <div>
                <p className="text-xs font-bold text-action">
                  Stored Tier / Rate Mismatch
                </p>

                <p className="text-xs text-action mt-1 leading-relaxed">
                  {policyMismatches} Designer profile
                  {policyMismatches === 1 ? "" : "s"} do not currently match the
                  expected commission rate for their stored tier. Review those
                  profiles before production release.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =================================================
                FINANCE POSITION
                ================================================= */}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-surface rounded-md border border-line p-4">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted">
            Designer Profiles
          </p>

          <p className="text-3xl font-serif mt-2 text-ink">
            {numberValue(commissionPolicy?.designer_profiles)}
          </p>

          <p className="text-xs text-muted mt-4">
            Designer profiles currently covered by the tier commission policy.
          </p>
        </div>

        <div className="bg-surface rounded-md border border-line p-4">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted">
            Completed Booking Value
          </p>

          <p className="text-3xl font-serif mt-2 text-ink">
            {formatMoney(finance?.bookings?.completed_booking_value)}
          </p>

          <p className="text-xs text-muted mt-4">
            Agreed value of bookings currently marked completed.
          </p>
        </div>

        <div className="bg-surface rounded-md border border-line p-4">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted">
            Pending Payout Value
          </p>

          <p className="text-3xl font-serif mt-2 text-ink">
            {formatMoney(finance?.payouts?.pending_payout_request_value)}
          </p>

          <p className="text-xs text-muted mt-4">
            Value of manual payout requests currently waiting for processing.
          </p>
        </div>
      </section>

      {/* =================================================
                USER ROLE DISTRIBUTION
                ================================================= */}

      <section className="bg-surface rounded-md border border-line overflow-hidden">
        <div className="p-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-ink">User Role Distribution</h3>

            <p className="text-xs text-muted mt-1">
              {totalUsers} total registered platform accounts
            </p>
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Admins: {totalAdmins} • Superadmins: {totalSuperadmins}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-canvas text-[10px] uppercase tracking-normal text-muted">
                <th className="px-8 py-4">Role</th>

                <th className="px-8 py-4">Population</th>

                <th className="px-8 py-4">Distribution</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {Array.isArray(stats?.user_distribution) &&
                stats.user_distribution.map((item) => {
                  const count = numberValue(item.count);

                  const percentage =
                    totalUsers > 0
                      ? Math.min(100, (count / totalUsers) * 100)
                      : 0;

                  return (
                    <tr
                      key={item.role}
                      className="hover:bg-subtle transition-colors"
                    >
                      <td className="px-8 py-5 text-sm font-bold text-ink capitalize">
                        {item.role}
                      </td>

                      <td className="px-8 py-5 text-sm text-muted">
                        {count} members
                      </td>

                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-1.5 bg-subtle rounded-full overflow-hidden">
                            <div
                              className="h-full bg-action rounded-full text-on-action"
                              style={{
                                width: `${percentage}%`,
                              }}
                            />
                          </div>

                          <span className="text-[10px] font-bold text-muted">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

/* ============================================================
   REUSABLE COMPONENTS
   ============================================================ */

const SectionHeading = ({ title, subtitle }) => (
  <div>
    <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink">
      {title}
    </h2>

    <p className="text-xs text-muted mt-1">{subtitle}</p>
  </div>
);

const StatCard = ({ label, value }) => <DataRow label={label} value={value ?? 0} />;
const MoneyCard = ({ label, value, note }) => (
  <div className="py-2">
    <DataRow label={label} value={value} />
    <p className="text-xs text-muted">{note}</p>
  </div>
);

const DataRow = ({ label, value, alert = false }) => (
  <div className="px-6 py-4 flex items-center justify-between gap-4">
    <span className="text-xs text-muted">{label}</span>

    <span
      className={`text-sm font-bold font-mono ${
        alert ? "text-action" : "text-ink"
      }`}
    >
      {value}
    </span>
  </div>
);

const MiniMetric = ({ label, value, warning = false, danger = false }) => (
  <div className="p-4 min-h-[110px] flex flex-col justify-center">
    <p className="text-[11px] uppercase tracking-widest font-semibold text-muted">
      {label}
    </p>

    <p
      className={`text-2xl font-serif mt-2 ${
        danger ? "text-action" : warning ? "text-action" : "text-ink"
      }`}
    >
      {value}
    </p>
  </div>
);

const TierPolicyCard = ({ tier, minimum, maximum, rate, designerCount }) => {
  const tierLabel =
    typeof tier === "string" && tier.length > 0
      ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`
      : "Unknown";

  const minimumValue = numberOrZero(minimum);

  const bookingRange =
    maximum === null || maximum === undefined
      ? `${minimumValue}+`
      : `${minimumValue}–${numberOrZero(maximum)}`;

  return (
    <div className="p-4 min-h-[160px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold text-muted">
            {tierLabel}
          </p>

          <p className="text-3xl font-serif text-ink mt-2">
            {numberOrZero(rate)}%
          </p>
        </div>

        <div className="p-2.5 rounded-md bg-subtle">
          <DollarSign size={16} className="text-action" />
        </div>
      </div>

      <p className="text-[11px] text-muted mt-4">
        {bookingRange} completed bookings
      </p>

      <p className="text-[10px] text-muted mt-1">
        {numberOrZero(designerCount)} Designer
        {numberOrZero(designerCount) === 1 ? "" : "s"}
      </p>
    </div>
  );
};

const numberOrZero = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
};

export default SuperAdminDashboard;
