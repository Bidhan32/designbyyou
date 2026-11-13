const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('Shared showcase allows creators and designers through authenticated read-only routes', () => {
  const roles = [];
  const middleware = [];
  const routes = [];
  const protect = () => {};
  const router = { use: fn => middleware.push(fn), get: route => routes.push(route) };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../routes/creatorshowcaseroute.js'), 'utf8'), {
    module: { exports: {} }, require: name => {
      if (name === 'express') return { Router: () => router };
      if (name.includes('authMiddleware')) return { protect, authorize: (...allowed) => { roles.push(...allowed); return () => {}; } };
      if (name.includes('Controller')) return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  assert.equal(middleware[0], protect);
  assert.deepEqual(roles, ['creator', 'designer']);
  assert.deepEqual(routes, ['/discovery', '/pipeline', '/top-designers', '/item/:slug']);
});

for (const handler of ['getMarketplace', 'getDesignDetails']) {
  test(`${handler} exposes descriptive showcase data without sales fields`, async () => {
    let calls = 0;
    const context = { exports: {}, console, require: (name) => {
      assert.equal(name, '../config/db');
      return { query: async (sql) => {
        calls++;
        assert.doesNotMatch(sql, /base_price|discount_price|license_type/i);
        assert.match(sql, /d\.is_public = TRUE/);
        assert.match(sql, /u\.role = 'creator'/);
        assert.match(sql, /u\.approval_status = 'approved'/);
        assert.match(sql, /d\.is_published = TRUE/);
        return { rows: [{ id: 'design-id', title: 'Showcase design' }] };
      } };
    } };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../controllers/marketplaceController.js'), 'utf8'), context);
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await context.exports[handler]({ query: { minPrice: 'invalid', maxPrice: '100' }, params: { slug: 'showcase-design' } }, res);
    assert.equal(calls, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'success');
  });
}
