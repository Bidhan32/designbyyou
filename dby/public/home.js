(() => {
  const studio = document.querySelector('.studio');
  if (!studio) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const play = document.getElementById('play-demo');
  const status = document.getElementById('demo-status');
  const steps = [...document.querySelectorAll('button[data-step]')];
  const swatches = [...document.querySelectorAll('[data-colour]')];
  const labels = ['Start with a silhouette', 'Find your colour', 'Make your mark', 'A concept to come back to'];
  const colours = {
    moss: ['#78855c', '#65734d', '#bfc7a5', 'Moss / 01', 'moss green'],
    clay: ['#ae6b51', '#965a43', '#e0b29b', 'Clay / 02', 'terracotta'],
    blue: ['#647e8b', '#506975', '#a8c3cc', 'Slate / 03', 'slate blue'],
    ink: ['#3d4443', '#2e3533', '#88958c', 'Ink / 04', 'ink black'],
  };
  let step = 0;
  let playing = false;
  let timer;
  const update = value => {
    step = value;
    studio.dataset.step = String(step);
    steps.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.step) === step)));
    document.getElementById('annotation').textContent = labels[step];
    status.textContent = `${['Sketch', 'Colour', 'Detail', 'Keep'][step]} stage. ${labels[step]}. Illustrative demonstration only.`;
  };
  const stop = () => {
    clearTimeout(timer);
    playing = false;
    play.setAttribute('aria-pressed', 'false');
    play.textContent = 'Replay demo ▷';
  };
  const advance = () => {
    if (!playing) return;
    if (step === 3) { stop(); return; }
    update(step + 1);
    timer = setTimeout(advance, 2300);
  };
  play.addEventListener('click', () => {
    if (playing) { stop(); return; }
    playing = true;
    update(0);
    play.setAttribute('aria-pressed', 'true');
    play.textContent = 'Pause demo Ⅱ';
    timer = setTimeout(advance, 1800);
  });
  steps.forEach(button => button.addEventListener('click', () => { stop(); update(Number(button.dataset.step)); }));
  swatches.forEach(button => button.addEventListener('click', () => {
    const [fabric, collar, seam, name, title] = colours[button.dataset.colour];
    studio.style.setProperty('--fabric', fabric);
    studio.style.setProperty('--collar', collar);
    studio.style.setProperty('--seam', seam);
    document.getElementById('colour-name').textContent = name;
    document.getElementById('garment-title').textContent = `Illustrated ${title} jacket with contrasting seams`;
    swatches.forEach(swatch => swatch.setAttribute('aria-pressed', String(swatch === button)));
    stop(); update(Math.max(1, step));
    status.textContent = `${title} selected. Illustrative demonstration only.`;
  }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  motion.addEventListener('change', () => { if (motion.matches) stop(); });
  // One short introduction, then leave the controls to the visitor.
  if (!motion.matches) play.click();
})();
