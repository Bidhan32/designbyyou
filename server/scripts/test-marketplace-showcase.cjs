const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

for (const handler of ['getMarketplace', 'getDesignDetails']) {
  test(`${handler} exposes descriptive showcase data without sales fields`, async () => {
    let calls = 0;
    const context = { exports: {}, console, require: (name) => {
      assert.equal(name, '../config/db');
      return { query: async (sql) => {
        calls++;
        assert.doesNotMatch(sql, /base_price|discount_price|license_type/i);
        assert.match(sql, /d\.is_public = TRUE/);
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
