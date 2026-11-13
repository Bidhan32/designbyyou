const { test } = require('node:test');
const assert = require('node:assert/strict');
const readiness = require('../middlewares/readiness');
function response() {
  return { set(key, value) { this[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('readiness checks PostgreSQL and never caches its response', async () => {
  const res = response();
  await readiness({ query: async query => assert.equal(query.text, 'SELECT 1') }, () => false)({}, res);
  assert.equal(res.code, 200);
  assert.equal(res['Cache-Control'], 'no-store');
});
test('readiness fails closed without exposing database errors', async () => {
  const res = response();
  await readiness({ query: async () => { throw new Error('private database detail'); } }, () => false)({}, res);
  assert.equal(res.code, 503);
  assert.deepEqual(res.body, { status: 'NOT_READY' });
});
test('shutdown does not probe the database', async () => {
  const res = response();
  await readiness({ query: () => assert.fail('Unexpected database query') }, () => true)({}, res);
  assert.equal(res.code, 503);
});
test('stalled database probes time out and share one pending query', async () => {
  let calls = 0;
  const handler = readiness({ query: () => { calls++; return new Promise(() => {}); } }, () => false, 15);
  const results = [response(), response()];
  await Promise.all(results.map(res => handler({}, res)));
  assert.equal(calls, 1);
  assert.ok(results.every(res => res.code === 503));
});
