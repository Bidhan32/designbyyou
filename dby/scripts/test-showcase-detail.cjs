const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://dby.test/' });
for (const name of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) globalThis[name] = dom.window[name];
window.scrollTo = () => {};
window.requestAnimationFrame = callback => setTimeout(callback, 0);
window.cancelAnimationFrame = clearTimeout;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, Routes, Route, useLocation } = require('react-router-dom');
const fixture = {
  design_id: '00000000-0000-4000-8000-000000000001', slug: 'linen-shirt', title: 'Linen shirt',
  owner_role: 'designer', designer_id: '00000000-0000-4000-8000-000000000002', owner_name: 'Test designer',
  watermarked_preview_url: 'https://example.test/shirt.png', preview_3d: { model: 'tshirt', colours: {}, artwork: {} },
};
let record, failLoad, failOpen, calls = [], location, root;
globalThis.__detail = {
  get: async url => { calls.push(['get', url]); if (failLoad) throw new Error('Connection failed'); return { data: { data: record } }; },
  post: async (...args) => { calls.push(['post', ...args]); if (failOpen) throw new Error('Try opening again'); return { data: { data: { project_id: '123' } } }; },
};
const h = React.createElement;
function Probe() { location = useLocation(); return null; }
(async () => {
  const built = await esbuild.build({ entryPoints: [path.resolve(__dirname, '../src/pages/Creator/CreatorShowcaseDetail.jsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false' }, plugins: [{ name: 'detail-services', setup(build) {
      build.onResolve({ filter: /api\/axios$/ }, () => ({ path: 'api', namespace: 'mock' }));
      build.onResolve({ filter: /ShowcaseGarment3D$/ }, () => ({ path: 'preview', namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path: name }) => ({ contents: name === 'api'
        ? 'export default globalThis.__detail' : 'export default function Preview(){return "Interactive garment preview"}' }));
    } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports);
  const Detail = module.exports.default;
  async function mount(audience, overrides = {}) {
    if (root) await act(() => root.unmount());
    calls = []; record = { ...fixture, ...overrides };
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(h(MemoryRouter, { initialEntries: [`/${audience}/showcase/linen-shirt`] },
      h(Routes, null, h(Route, { path: '/:audience/showcase/:slug', element: h(Detail, { audience }) }), h(Route, { path: '*', element: h('div') })), h(Probe))));
  }
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.includes(text));
  const click = node => act(async () => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await mount('creator');
  if (process.env.DETAIL_PREVIEW_FILE) {
    const fs = require('node:fs');
    const assetDir = path.resolve(__dirname, '../dist/assets');
    const css = fs.readdirSync(assetDir).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(assetDir, file), 'utf8')).join('\n');
    fs.writeFileSync(process.env.DETAIL_PREVIEW_FILE, `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${document.getElementById('root').innerHTML}</body></html>`);
  }
  assert.match(document.body.textContent, /Interactive garment preview/);
  const booking = [...document.querySelectorAll('a')].find(a => a.textContent.includes('Book this designer'));
  const params = new URL(booking.href).searchParams;
  assert.equal(params.get('design_id'), fixture.design_id);
  assert.equal(params.get('designer_id'), fixture.designer_id);
  await click(button('Open in Fashion Editor'));
  assert.equal(location.pathname, '/creator/fashion-editor/123');
  assert.equal(calls.find(call => call[0] === 'post')[1], `/creators/showcase/${fixture.design_id}/open-in-editor`);
  await mount('designer');
  assert.match(document.body.textContent, /Interactive garment preview/);
  assert.ok(!button('Open in Fashion Editor'));
  assert.ok(!document.querySelector('a[href*="bookings/new"]'));
  assert.ok(document.querySelector('a[href="/designer/explore"]'));
  await mount('creator', { owner_role: 'creator', designer_id: null, preview_3d: null });
  assert.ok(!document.querySelector('a[href*="bookings/new"]'));
  assert.ok(button('Open in Fashion Editor'));
  failOpen = true;
  await click(button('Open in Fashion Editor'));
  assert.match(document.querySelector('[role="alert"]').textContent, /Try opening again/);
  assert.equal(location.pathname, '/creator/showcase/linen-shirt');
  failOpen = false; failLoad = true;
  await mount('designer');
  assert.ok(document.querySelector('a[href="/designer/explore"]'));
  failLoad = false;
  await click(button('Try again'));
  assert.equal(document.querySelector('h1').textContent.trim(), 'Linen shirt');
  await act(() => root.unmount());
  console.log('PASS: shared 3D detail, role-specific actions, booking context, editor navigation/error recovery, role-safe back links and retry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
