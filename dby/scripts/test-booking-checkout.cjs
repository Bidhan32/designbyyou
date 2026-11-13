const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://dby.test/' });
for (const name of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) globalThis[name] = dom.window[name];
window.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const id = '00000000-0000-4000-8000-000000000001';
let root, finishPayment, confirms = 0, verifies = 0, failVerify = true, status = 'requires_payment_method';
const user = { id: 'creator', full_name: 'Creator', email: 'creator@example.test' };
globalThis.__checkout = {
  user,
  api: {
    get: async url => ({ data: url.endsWith('/payment') ? {
      booking: { id, designer_id: 'designer', agreed_price: 100, brief_text: 'Test brief', status: 'pending' },
      designerName: 'Designer', clientSecret: 'pi_test_secret', paymentIntentStatus: status,
      payment: { baseAmount: 100, connectionFee: 5, totalAmount: 105, currency: 'usd' },
    } : { data: [] } }),
    post: async url => {
      assert.equal(url, '/p2p-bookings/verify-escrow');
      verifies++;
      if (failVerify) throw new Error('Confirmation temporarily unavailable');
      return { data: { status: 'success' } };
    },
  },
  stripe: {
    retrievePaymentIntent: async () => ({ paymentIntent: { status } }),
    confirmCardPayment: () => { confirms++; return new Promise(resolve => { finishPayment = resolve; }); },
  },
};
(async () => {
  const built = await esbuild.build({ entryPoints: [path.resolve(__dirname, '../src/pages/Creator/CreatorCreateBooking.jsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify({ VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_mock', DEV: false }) },
    plugins: [{ name: 'checkout-services', setup(build) {
      build.onResolve({ filter: /api\/axios$|AuthContext.helpers.js$|^@stripe\// }, args => ({ path: args.path, namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path: name }) => ({ contents:
        name.includes('axios') ? 'export default globalThis.__checkout.api' :
        name.includes('AuthContext') ? 'export const useAuth=()=>({user:globalThis.__checkout.user})' :
        name === '@stripe/stripe-js' ? 'export const loadStripe=()=>Promise.resolve({})' :
        'export const Elements=({children})=>children; export const CardElement=()=>null; export const useStripe=()=>globalThis.__checkout.stripe; export const useElements=()=>({getElement:()=>({})});' }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports);
  const Page = module.exports.default;
  async function mount() {
    if (root) await act(() => root.unmount());
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [`/creator/bookings/new?booking_id=${id}`] }, React.createElement(Page))));
  }
  const submit = () => act(async () => document.querySelector('[role="dialog"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await mount();
  assert.ok(document.querySelector('[role="dialog"]'));
  await submit();
  assert.equal(confirms, 1);
  assert.equal(document.querySelector('[aria-label="Close checkout"]').disabled, true);
  await submit();
  assert.equal(confirms, 1);
  await act(async () => finishPayment({ paymentIntent: { status: 'succeeded' } }));
  assert.equal(verifies, 1);
  assert.match(document.body.textContent, /Check payment confirmation/);
  failVerify = false;
  await submit();
  assert.equal(verifies, 2);
  assert.equal(confirms, 1);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  status = 'succeeded';
  await mount();
  await submit();
  assert.equal(confirms, 1, 'Refreshing a paid booking must only verify it');
  assert.equal(verifies, 3);
  await act(() => root.unmount());
  console.log('PASS: checkout resumes existing booking, blocks concurrent submits/close, retries verification without another payment, and recovers paid bookings after refresh.');
})().catch(error => { console.error(error); process.exitCode = 1; });
