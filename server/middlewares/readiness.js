// Share an outstanding probe so a database outage cannot build a queue of probes.
module.exports = function readiness(db, isStopping, timeoutMs = 3000) {
  let pending;
  return async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    if (isStopping()) return res.status(503).json({ status: 'NOT_READY' });
    if (!pending) {
      pending = Promise.resolve().then(() => db.query({ text: 'SELECT 1', query_timeout: timeoutMs }))
        .then(() => true, () => false).finally(() => { pending = null; });
    }
    let timer;
    const ready = await Promise.race([
      pending,
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
    clearTimeout(timer);
    const available = ready && !isStopping();
    return res.status(available ? 200 : 503).json({ status: available ? 'READY' : 'NOT_READY' });
  };
};
