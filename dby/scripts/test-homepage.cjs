const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../public/home.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../public/home.js'), 'utf8');
for (const reduced of [false, true]) {
  const dom = new JSDOM(html, { url: 'https://dby.test/', runScripts: 'outside-only' });
  const { window } = dom;
  let pending;
  window.matchMedia = () => ({ matches: reduced, addEventListener() {} });
  window.setTimeout = callback => { pending = callback; return 1; };
  window.clearTimeout = () => { pending = null; };
  window.eval(script);
  const doc = window.document;
  const play = doc.getElementById('play-demo');
  assert.equal(play.getAttribute('aria-pressed'), String(!reduced));
  assert.equal(doc.querySelectorAll('h1').length, 1);
  if (!reduced) {
    for (let index = 0; index < 4; index++) { const callback = pending; pending = null; callback(); }
    assert.equal(doc.querySelector('.studio').dataset.step, '3');
    assert.equal(play.getAttribute('aria-pressed'), 'false');
    assert.equal(pending, null, 'The introduction must stop automatically');
  }
  doc.querySelector('[data-colour="clay"]').click();
  assert.equal(doc.querySelector('[data-colour="clay"]').getAttribute('aria-pressed'), 'true');
  assert.equal(doc.querySelector('[data-colour="moss"]').getAttribute('aria-pressed'), 'false');
  assert.match(doc.getElementById('garment-title').textContent, /terracotta/);
  assert.equal(doc.querySelector('.studio').style.getPropertyValue('--fabric'), '#ae6b51');
  doc.querySelector('button[data-step="2"]').click();
  assert.equal(doc.querySelector('.studio').dataset.step, '2');
  play.click();
  assert.equal(play.getAttribute('aria-pressed'), 'true');
  play.click();
  assert.equal(play.getAttribute('aria-pressed'), 'false');
  assert.equal(pending, null);
  for (const image of doc.images) assert.ok(fs.existsSync(path.join(__dirname, '../public', image.getAttribute('src'))));
  dom.window.close();
}
console.log('PASS: homepage demo stages, colour controls, pause/replay, finite autoplay, reduced-motion default and local images.');
