const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://dby.test/' });
for (const name of ['window', 'document', 'HTMLElement', 'KeyboardEvent']) globalThis[name] = dom.window[name];
HTMLElement.prototype.getClientRects = () => [{}];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
(async () => {
  const built = await esbuild.build({ entryPoints: [path.resolve(__dirname, '../src/components/useModalFocus.js')], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports);
  const useModalFocus = module.exports.default;
  let closeCount = 0;
  const h = React.createElement;
  function Harness({ open, canClose = true }) {
    const ref = useModalFocus(open, () => closeCount++, canClose);
    return h(React.Fragment, null,
      h('button', { id: 'trigger' }, 'Open'),
      open && h('section', { ref, tabIndex: -1, role: 'dialog' }, h('button', { id: 'first' }, 'First'), h('button', { id: 'last' }, 'Last')));
  }
  const root = createRoot(document.getElementById('root'));
  const render = props => act(() => root.render(h(Harness, props)));
  const key = (value, shiftKey = false) => act(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })));
  await render({ open: false });
  const trigger = document.getElementById('trigger');
  trigger.focus();
  await render({ open: true });
  assert.equal(document.activeElement.id, 'first');
  assert.equal(trigger.inert, true);
  assert.equal(document.body.style.overflow, 'hidden');
  await key('Tab', true);
  assert.equal(document.activeElement.id, 'last');
  await key('Tab');
  assert.equal(document.activeElement.id, 'first');
  trigger.focus();
  assert.equal(document.activeElement.id, 'first');
  await render({ open: true, canClose: false });
  await key('Escape');
  assert.equal(closeCount, 0);
  await render({ open: true });
  await key('Escape');
  assert.equal(closeCount, 1);
  await render({ open: false });
  assert.equal(document.activeElement, trigger);
  assert.ok(!trigger.inert);
  assert.equal(document.body.style.overflow, '');
  await act(() => root.unmount());
  console.log('PASS: modal initial focus, Tab wrapping, background isolation, busy Escape guard, trigger restoration and scroll cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
