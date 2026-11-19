"use strict";

const COST = 10;

// Caller holds a transaction. Serialize with paid invoice grants and failed-job refunds.
async function balance(client, userId, reserve = false) {
  await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
  const paid = await client.query(`SELECT period_start::text, granted + carried - spent AS available
    FROM membership_ai_credit_periods WHERE user_id=$1 AND period_start <= now() AND period_end > now()`, [userId]);
  if (paid.rowCount) {
    const { period_start, available } = paid.rows[0];
    if (reserve && available >= COST) await client.query(
      "UPDATE membership_ai_credit_periods SET spent=spent+$3 WHERE user_id=$1 AND period_start=$2",
      [userId, period_start, COST]);
    return { available, paidPeriod: period_start };
  }

  // UTC calendar months for the baseline free allowance, including legacy members.
  const month = "date_trunc('month', now() AT TIME ZONE 'UTC')::date";
  await client.query(`INSERT INTO free_ai_credit_months(user_id, month_start, allowance)
    SELECT $1, ${month}, 50 + COALESCE((
      SELECT CASE WHEN month_start = (${month} - interval '1 month')::date THEN (allowance-allocated)/10
                  ELSE 5 END FROM free_ai_credit_months WHERE user_id=$1 AND month_start < ${month}
      ORDER BY month_start DESC LIMIT 1), 0)
    ON CONFLICT DO NOTHING`, [userId]);
  const free = await client.query(`SELECT month_start::text, allowance-allocated AS available
    FROM free_ai_credit_months WHERE user_id=$1 AND month_start=${month}`, [userId]);
  const { month_start, available } = free.rows[0];
  if (reserve && available >= COST) await client.query(
    "UPDATE free_ai_credit_months SET allocated=allocated+$3 WHERE user_id=$1 AND month_start=$2",
    [userId, month_start, COST]);
  return { available, freeMonth: month_start };
}

module.exports = { COST, balance };
