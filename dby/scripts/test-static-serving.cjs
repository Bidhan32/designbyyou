const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('serve-handler');
const config = require('../serve.json');
const directory = path.resolve(__dirname, '../dist');
const server = http.createServer((req, res) => handler(req, res, {
  ...config, public: directory,
}));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const home = await fetch(base);
    const homeHtml = await home.text();
    assert.equal(home.status, 200);
    assert.match(homeHtml, /<h1[^>]*>Imagine it/);
    assert.match(homeHtml, /rel="canonical" href="https:\/\/dby.studio\/"/);
    assert.doesNotMatch(homeHtml, /noindex/);
    assert.match(homeHtml, /application\/ld\+json/);
    const robots = await fetch(`${base}/robots.txt`);
    assert.match(await robots.text(), /Sitemap: https:\/\/dby.studio\/sitemap.xml/);
    const sitemap = await fetch(`${base}/sitemap.xml`);
    assert.match(await sitemap.text(), /<loc>https:\/\/dby.studio\/<\/loc>/);
    const page = await fetch(`${base}/creator/bookings`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.match(await page.text(), /content="noindex, follow"/);
    for (const route of ['/login', '/register', '/verify-otp', '/designer/explore', '/missing-page']) {
      const app = await fetch(`${base}${route}`);
      const html = await app.text();
      assert.match(html, /content="noindex, follow"/);
      assert.match(html, /<div id="root"><\/div>/);
    }
    const asset = fs.readdirSync(path.join(directory, 'assets')).find(name => name.endsWith('.js'));
    const response = await fetch(`${base}/assets/${asset}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    await response.arrayBuffer();
    console.log('PASS: indexable public homepage, canonical, structured data, robots and sitemap; app deep links remain noindex; asset caching and security headers.');
  } finally { server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
