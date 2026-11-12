const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(file, dependencies) {
  const context = { exports: {}, module: { exports: {} }, console,
    require: (name) => { if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`); return dependencies[name]; } };
  context.module.exports = context.exports;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), context);
  return context.module.exports;
}
function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
test('workspace lookup scopes private data to the authenticated owner', async () => {
  const controller = load('../controllers/designController.js', { '../config/db': {
    query: async (sql, values) => {
      assert.match(sql, /id = \$1 AND owner_id = \$2/);
      assert.deepEqual(Array.from(values), ['design-id', 'owner-id']);
      return { rows: [] };
    }
  } });
  const res = response();
  await controller.loadSketch({ params: { designId: 'design-id' }, user: { id: 'owner-id' } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.data, undefined);
});
test('workspace lookup returns an owned design', async () => {
  const design = { id: 'design-id', canvas_state: { private: true } };
  const controller = load('../controllers/designController.js', { '../config/db': { query: async () => ({ rows: [design] }) } });
  const res = response();
  await controller.loadSketch({ params: { designId: 'design-id' }, user: { id: 'owner-id' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data, design);
});
test('all workspace routes are registered after authentication', () => {
  const registered = [];
  const router = { use: (...args) => registered.push(['use', ...args]) };
  for (const method of ['get', 'post', 'patch', 'put']) router[method] = (...args) => registered.push([method, ...args]);
  const protect = () => {};
  load('../routes/designRoutes.js', { express: { Router: () => router },
    '../controllers/designController': new Proxy({}, { get: () => () => {} }),
    '../middlewares/authMiddleware': { protect } });
  assert.equal(registered[0][0], 'use');
  assert.equal(registered[0][1], protect);
  assert.equal(registered.filter(([method]) => method !== 'use').length, 9);
});
test('legacy AI never dispatches paid work or returns fake success', async () => {
  const controller = load('../controllers/designController.js', { '../config/db': {
    query: () => { throw Error('Must not access the database'); }
  } });
  for (const name of ['transformSketchToApparel', 'virtualTryOnRender']) {
    const res = response();
    await controller[name]({}, res);
    assert.equal(res.statusCode, 501);
    assert.equal(res.body.code, 'LEGACY_WORKSPACE_AI_UNAVAILABLE');
  }
});
