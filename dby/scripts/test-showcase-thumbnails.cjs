const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'HTMLElement']) globalThis[name] = dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const calls = [];
const snapshots = [];
globalThis.__thumbnailTest = {
  get: async (url) => {
    calls.push(url);
    return { data: { data: { preview_3d: url.endsWith('/unsupported') ? null : { model: 'tshirt' } } } };
  },
  capture: (callback) => { snapshots.push(callback); },
};
(async () => {
  const built = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/pages/Creator/ShowcaseThumbnail.jsx')],
    jsx: 'automatic', bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'preview-services', setup(build) {
      build.onResolve({ filter: /^react(\/.*)?$/ }, args => ({ path: args.path, external: true }));
      build.onResolve({ filter: /api\/axios$/ }, () => ({ path: 'api', namespace: 'mock' }));
      build.onResolve({ filter: /ShowcaseGarment3D$/ }, () => ({ path: 'renderer', namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path: name }) => ({ contents: name === 'api'
        ? 'export default {get: globalThis.__thumbnailTest.get};'
        : 'import {useEffect} from "react"; export default function Renderer({onSnapshot}) { useEffect(()=>{globalThis.__thumbnailTest.capture(onSnapshot)},[onSnapshot]); return null; }' }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports);
  const Thumbnail = module.exports.default;
  const root = createRoot(document.getElementById('root'));
  const item = (slug, source_type = 'fashion_editor') => ({ slug, source_type, title: slug, watermarked_preview_url: `/images/${slug}.png` });
  const render = async (items) => React.act(async () => root.render(React.createElement(React.Fragment, null,
    ...items.map(value => React.createElement(Thumbnail, { key: value.slug, item: value })))));
  await render([item('first'), item('second'), item('upload', 'upload')]);
  assert.equal(calls.length, 1, 'Only one garment is requested/rendered at a time');
  assert.equal(snapshots.length, 1);
  assert.equal(document.querySelectorAll('img').length, 1, 'Uploads show their original image while garments wait for 3D');
  await React.act(async () => snapshots.shift()('data:image/webp;base64,FIRST'));
  assert.equal(calls.length, 2);
  assert.equal(document.querySelector('img[alt="first"]').src, 'data:image/webp;base64,FIRST');
  await React.act(async () => snapshots.shift()('data:image/webp;base64,SECOND'));
  await render([]);
  await render([item('first'), item('unsupported')]);
  assert.equal(calls.filter(url => url.endsWith('/first')).length, 1, 'Finished thumbnails are reused');
  assert.ok(document.querySelector('img[alt="unsupported"]').src.endsWith('/images/unsupported.png'));
  await render([item('cancelled'), item('after-cancel')]);
  await render([item('after-cancel')]);
  assert.ok(calls.some(url => url.endsWith('/after-cancel')), 'Unmount releases the render queue');
  await React.act(async () => root.unmount());
  console.log('PASS: sequential 3D rendering, static image replacement, cache reuse, upload/unsupported fallback, unmount cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
