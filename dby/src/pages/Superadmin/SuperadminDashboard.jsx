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
 * ============================================================
 */

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [finance, setFinance] = useState(null);
  const [commission, setCommission] = useState(null);

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
        setCommission(commissionResult.value.data?.data || null);
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

  const currentCommission = useMemo(() => {
    if (!commission) {
      return null;
    }

    if (commission.consistent === false) {
      return "Mixed";
    }

    const rate = Number(commission.commission_rate);

    if (!Number.isFinite(rate)) {
      return null;
    }

    return `${rate}%`;
  }, [commission]);

  /* ========================================================
       LOADING
       ======================================================== */

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <RefreshCw size={28} className="animate-spin text-[#D4AF37]" />

        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.25em]">
          Loading Platform Intelligence...
        </p>
      </div>
    );
  }

  /* ========================================================
       UI
       ======================================================== */

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-10">
      {/* =================================================
                HEADER
                ================================================= */}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={15} className="text-[#D4AF37]" />

            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D4AF37]">
              Super Admin Control
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-serif italic text-gray-900">
            Platform Overview
          </h1>

          <p className="text-gray-400 text-sm mt-1">
            Users, bookings, revenue, escrow and payout monitoring.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="px-5 py-3 bg-white border border-gray-200 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:border-black hover:text-black transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />

          {refreshing ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {/* =================================================
                PARTIAL LOAD WARNING
                ================================================= */}

      {error && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-3">
          <AlertTriangle
            size={18}
            className="text-amber-600 mt-0.5 flex-shrink-0"
          />

          <div>
            <p className="text-xs font-bold text-amber-800">
              Monitoring Warning
            </p>

            <p className="text-xs text-amber-700 mt-1">{error}</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard
            icon={<Users size={20} className="text-blue-500" />}
            label="Total Creators"
            value={totalCreators}
          />

          <StatCard
            icon={<HardDrive size={20} className="text-purple-500" />}
            label="Total Designers"
            value={totalDesigners}
          />

          <StatCard
            icon={<UserCheck size={20} className="text-[#D4AF37]" />}
            label="Pending Designers"
            value={numberValue(stats?.pending_designers)}
          />

          <StatCard
            icon={<Activity size={20} className="text-green-500" />}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <MoneyCard
            label="Total Platform Fees"
            value={formatMoney(finance?.revenue?.total_platform_fees)}
            note="All recorded platform fees"
            icon={<DollarSign size={20} className="text-green-600" />}
          />

          <MoneyCard
            label="Booking Commission"
            value={formatMoney(finance?.revenue?.booking_commission_revenue)}
            note="Commission from released bookings"
            icon={<DollarSign size={20} className="text-[#D4AF37]" />}
          />

          <MoneyCard
            label="Designer Earnings Released"
            value={formatMoney(finance?.revenue?.designer_earnings_released)}
            note="Net earnings credited to Designers"
            icon={<Wallet size={20} className="text-blue-600" />}
          />

          <MoneyCard
            label="Pending Escrow"
            value={formatMoney(finance?.wallets?.pending_escrow_balance)}
            note="Designer funds currently locked"
            icon={<Clock size={20} className="text-orange-500" />}
          />
        </div>
      </section>

      {/* =================================================
                FINANCIAL BREAKDOWN
                ================================================= */}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue / Ledger */}

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Revenue & Ledger</h3>

            <p className="text-xs text-gray-400 mt-1">
              Financial totals from recorded transactions.
            </p>
          </div>

          <div className="divide-y divide-gray-50">
            <DataRow
              label="Creator / Platform Fees"
              value={formatMoney(finance?.revenue?.creator_platform_fees)}
            />

            <DataRow
              label="Booking Commission Revenue"
              value={formatMoney(finance?.revenue?.booking_commission_revenue)}
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

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">
              Wallet & Payout Position
            </h3>

            <p className="text-xs text-gray-400 mt-1">
              Designer balances and payout activity.
            </p>
          </div>

          <div className="divide-y divide-gray-50">
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

            <DataRow
              label="Pending Payout Requests"
              value={numberValue(finance?.payouts?.pending_payout_requests)}
            />

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

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 divide-x divide-y xl:divide-y-0 divide-gray-100">
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
                COMMISSION CONFIGURATION
                ================================================= */}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">
                Current Commission
              </p>

              <p className="text-3xl font-serif mt-2 text-gray-900">
                {currentCommission ?? "—"}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-[#D4AF37]/10">
              <DollarSign size={20} className="text-[#D4AF37]" />
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            Applied through Designer commission rates when booking earnings are
            released.
          </p>

          {commission?.consistent === false && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
              Designer commission rates are currently inconsistent.
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">
            Completed Booking Value
          </p>

          <p className="text-3xl font-serif mt-2 text-gray-900">
            {formatMoney(finance?.bookings?.completed_booking_value)}
          </p>

          <p className="text-xs text-gray-400 mt-4">
            Agreed value of bookings currently marked completed.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">
            Pending Payout Value
          </p>

          <p className="text-3xl font-serif mt-2 text-gray-900">
            {formatMoney(finance?.payouts?.pending_payout_request_value)}
          </p>

          <p className="text-xs text-gray-400 mt-4">
            Value of payout requests currently waiting for processing.
          </p>
        </div>
      </section>

      {/* =================================================
                USER ROLE DISTRIBUTION
                ================================================= */}

      <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">User Role Distribution</h3>

            <p className="text-xs text-gray-400 mt-1">
              {totalUsers} total registered platform accounts
            </p>
          </div>

          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Admins: {totalAdmins} • Superadmins: {totalSuperadmins}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-[0.2em] text-gray-400">
                <th className="px-8 py-4">Role</th>

                <th className="px-8 py-4">Population</th>

                <th className="px-8 py-4">Distribution</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
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
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-8 py-5 text-sm font-bold text-gray-700 capitalize">
                        {item.role}
                      </td>

                      <td className="px-8 py-5 text-sm text-gray-500">
                        {count} members
                      </td>

                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#D4AF37] rounded-full"
                              style={{
                                width: `${percentage}%`,
                              }}
                            />
                          </div>

                          <span className="text-[10px] font-bold text-gray-400">
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

      {/* =================================================
                MONITORING STATUS
                ================================================= */}

      <section className="bg-green-50 border border-green-100 rounded-3xl p-5 flex items-start gap-3">
        <CheckCircle2
          size={20}
          className="text-green-600 flex-shrink-0 mt-0.5"
        />

        <div>
          <p className="text-sm font-bold text-green-800">
            Dashboard uses database-backed monitoring
          </p>

          <p className="text-xs text-green-700 mt-1 leading-relaxed">
            Revenue, commission, booking, escrow, wallet and payout values shown
            here are loaded from the Super Admin backend rather than hard-coded
            interface values.
          </p>
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
    <h2 className="text-sm font-black uppercase tracking-[0.18em] text-gray-900">
      {title}
    </h2>

    <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
  </div>
);

const StatCard = ({ icon, label, value }) => (
  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
    <div className="flex items-start justify-between mb-5">
      <div className="p-3 bg-gray-50 rounded-2xl">{icon}</div>
    </div>

    <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">
      {label}
    </p>

    <h4 className="text-3xl font-serif text-gray-900 mt-1">{value ?? 0}</h4>
  </div>
);

const MoneyCard = ({ icon, label, value, note }) => (
  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
    <div className="flex items-start justify-between mb-5">
      <div className="p-3 bg-gray-50 rounded-2xl">{icon}</div>
    </div>

    <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">
      {label}
    </p>

    <h4 className="text-2xl md:text-3xl font-serif text-gray-900 mt-1">
      {value}
    </h4>

    <p className="text-[10px] text-gray-400 mt-2">{note}</p>
  </div>
);

const DataRow = ({ label, value, alert = false }) => (
  <div className="px-6 py-4 flex items-center justify-between gap-4">
    <span className="text-xs text-gray-500">{label}</span>

    <span
      className={`text-sm font-bold font-mono ${
        alert ? "text-red-600" : "text-gray-900"
      }`}
    >
      {value}
    </span>
  </div>
);

const MiniMetric = ({ label, value, warning = false, danger = false }) => (
  <div className="p-5 min-h-[110px] flex flex-col justify-center">
    <p className="text-[9px] uppercase tracking-widest font-black text-gray-400">
      {label}
    </p>

    <p
      className={`text-2xl font-serif mt-2 ${
        danger ? "text-red-600" : warning ? "text-orange-600" : "text-gray-900"
      }`}
    >
      {value}
    </p>
  </div>
);

export default SuperAdminDashboard;
