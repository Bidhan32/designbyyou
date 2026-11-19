"use strict";

const COST = 10;

// Caller holds a transaction. Serialize with paid invoice grants and failed-job refunds.
async function balance(client, userId, reserve = false) {
  const result = await client.query(
    "SELECT available, paid_period::text, free_month::text FROM public.ai_image_balance($1,$2)",
    [userId, reserve]);
  const { available, paid_period, free_month } = result.rows[0];
  return paid_period ? { available, paidPeriod: paid_period } : { available, freeMonth: free_month };
}

module.exports = { COST, balance };
