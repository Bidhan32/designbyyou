"use strict";

const db = require("../../config/db");
const { storeModel } = require("./modelStorage");
const { getFalClient } = require("./falFashionService");
const model = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";

async function expire(owner = null) {
  await db.query(`UPDATE creator_model_jobs SET status='failed', updated_at=now() WHERE ($1::uuid IS NULL OR creator_id=$1) AND
    ((status='submitting' AND updated_at < now()-interval '5 minutes') OR
     (status IN ('processing','saving') AND created_at < now()-interval '24 hours'))`, [owner]);
}

async function synchronize(row) {
  const args = [row.id, row.creator_id];
  const poll = await db.query(`UPDATE creator_model_jobs SET next_check=now()+interval '8 seconds'
    WHERE id=$1 AND creator_id=$2 AND next_check<=now() AND
    (status='processing' OR (status='saving' AND updated_at < now()-interval '3 minutes'))`, args);
  if (!poll.rowCount) return;
  const fal = await getFalClient();
  const options = { requestId: row.provider_id, abortSignal: AbortSignal.timeout(30000) };
  try {
    const result = await fal.queue.status(model, options);
    if (result.error) throw Object.assign(new Error("Generation failed"), { status: 422 });
    if (result.status === "COMPLETED") {
      const { data } = await fal.queue.result(model, { ...options, abortSignal: AbortSignal.timeout(45000) });
      const url = new URL(data.model_glb.url);
      if (url.protocol !== "https:" || !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media"))) throw new Error("Unexpected model location");
      // Only one poller persists the output. A later poll can reclaim a crashed saver.
      const claim = await db.query(`UPDATE creator_model_jobs SET status='saving',updated_at=now()
        WHERE id=$1 AND creator_id=$2 AND (status='processing' OR (status='saving' AND updated_at < now()-interval '3 minutes')) RETURNING updated_at::text AS lease`, args);
      if (claim.rowCount) {
        const asset = "designbyyou_ai/models/" + row.creator_id + "/" + row.id + ".glb";
        const lease = claim.rows[0].lease;
        let storedAsset;
        try {
          storedAsset = await storeModel(url.href, asset, row.creator_id, row.id);
        } catch (error) {
          await db.query("UPDATE creator_model_jobs SET next_check=now()+interval '1 minute', updated_at=now()-interval '3 minutes' WHERE id=$1 AND status='saving' AND updated_at=$2", [row.id, lease]);
          throw Object.assign(new Error("Model storage will retry"), { code: error.code || "MODEL_STORAGE_RETRY" });
        }
        await db.query("UPDATE creator_model_jobs SET model_asset=$2,status='completed',updated_at=now() WHERE id=$1 AND status='saving' AND updated_at=$3", [row.id,storedAsset,lease]);
      }
    }
  } catch (err) {
    if (![404,410,422].includes(err.status)) throw err;
    await db.query("UPDATE creator_model_jobs SET status='failed',updated_at=now() WHERE id=$1 AND status='processing'", [row.id]);
  }

}

let timer, sweep;
async function sweepModels() {
  await expire();
  const { rows } = await db.query(`SELECT * FROM creator_model_jobs WHERE next_check<=now() AND
    (status='processing' OR (status='saving' AND updated_at < now()-interval '3 minutes'))
    ORDER BY next_check LIMIT 4`);
  await Promise.all(rows.map(row => synchronize(row).catch(err => console.error("[Image to 3D] Retry pending", row.id, err.code || err.status || err.name))));
}

function startModelWorker() {
  if (timer || !process.env.FAL_KEY) return;
  timer = setInterval(() => {
    if (!sweep) sweep = sweepModels().catch(err => console.error("[Image to 3D] Worker", err.code || err.name))
      .finally(() => { sweep = null; });
  }, 15000);
  timer.unref();
}
async function stopModelWorker() {
  clearInterval(timer);
  timer = null;
  await sweep;
}
module.exports = { model, expire, synchronize, startModelWorker, stopModelWorker };
