const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function initEditorial({ onSoundChange } = {}) {
  const $ = (s) => document.querySelector(s);
  const structure = $('#structure');
  const inside = $('#inside');
  const visual = $('#architectureVisual');
  const revealRect = $('#revealRect');
  const scanBoundary = $('#scanBoundary');
  const revealPercent = $('#revealPercent');
  const planBoard = $('#planBoard');
  const planProgress = $('#planProgress');
  const tooltip = $('#planTooltip');
  const steps = [...document.querySelectorAll('.process-step')];
  const layers = [...document.querySelectorAll('.plan-layer')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let audio = null;
  let soundEnabled = false;
  let activeCue = null;

  function playCue(frequency = 620, duration = 0.14) {
    if (!soundEnabled || !audio) return;
    if (activeCue) { try { activeCue.stop(); } catch {} }
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, audio.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(180, frequency * 0.72), audio.ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, audio.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, audio.ctx.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + duration);
    osc.connect(gain); gain.connect(audio.master); osc.start(); osc.stop(audio.ctx.currentTime + duration + 0.02);
    activeCue = osc;
  }

  function progressFor(el) {
    const r = el.getBoundingClientRect();
    return clamp((innerHeight - r.top) / Math.max(1, r.height));
  }
  function update() {
    raf = 0;
    const p = reduced ? 1 : progressFor(structure);
    const height = 650 * p;
    revealRect.setAttribute('height', height.toFixed(1));
    scanBoundary.style.top = `${p * 100}%`;
    revealPercent.textContent = `${Math.round(p * 100).toString().padStart(2, '0')}%`;
    visual.style.setProperty('--reveal', `${p * 100}%`);

    const q = reduced ? 1 : progressFor(inside);
    const layerStops = [0.16, 0.36, 0.56, 0.72, 0.88, 1.0];
    layers.forEach((layer, i) => {
      const local = clamp((q - (layerStops[i] - 0.18)) / 0.18);
      layer.style.opacity = local.toFixed(3);
      layer.style.setProperty('--draw', `${local * 100}%`);
      layer.querySelectorAll('.draw').forEach((path) => {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len * (1 - local);
      });
    });
    planProgress.textContent = `ASSEMBLY ${Math.round(q * 100).toString().padStart(2, '0')}%`;
    const active = q < 0.34 ? 0 : q < 0.58 ? 1 : q < 0.8 ? 2 : 3;
    steps.forEach((step, i) => step.classList.toggle('is-active', i === active));
    document.body.classList.toggle('is-editorial', scrollY > innerHeight * 0.45);
    $('#backTop').classList.toggle('is-visible', scrollY > innerHeight * 0.7);
  }
  function requestUpdate() { if (!raf) raf = requestAnimationFrame(update); }
  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', requestUpdate, { passive: true });
  requestUpdate();

  document.querySelectorAll('.plan-marker').forEach((marker) => {
    const show = () => { tooltip.textContent = marker.dataset.note; tooltip.classList.add('is-active'); playCue(690, 0.11); };
    marker.addEventListener('mouseenter', show);
    marker.addEventListener('focus', show);
    marker.addEventListener('click', show);
    marker.addEventListener('mouseleave', () => tooltip.classList.remove('is-active'));
    marker.addEventListener('blur', () => tooltip.classList.remove('is-active'));
  });

  // A quiet synthesized pad and filtered noise provide a self-contained ambience.
  // Nothing is created or played until the visitor explicitly enables sound.
  function startAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    const master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination);
    const pad = ctx.createGain(); pad.gain.value = 0.035; pad.connect(master);
    [55, 82.41, 110].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = i === 1 ? 'sine' : 'triangle'; osc.frequency.value = freq;
      gain.gain.value = [0.45, 0.18, 0.12][i]; osc.connect(gain); gain.connect(pad); osc.start();
    });
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.18;
    const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 380;
    const wind = ctx.createGain(); wind.gain.value = 0.12; noise.connect(filter); filter.connect(wind); wind.connect(master);
    const waterFilter = ctx.createBiquadFilter(); waterFilter.type = 'bandpass'; waterFilter.frequency.value = 920; waterFilter.Q.value = 0.55;
    const waterBed = ctx.createGain(); waterBed.gain.value = 0.025; noise.connect(waterFilter); waterFilter.connect(waterBed); waterBed.connect(master);
    noise.start();
    ctx.resume().then(() => master.gain.setTargetAtTime(0.42, ctx.currentTime, 1.6));
    audio = { ctx, master, noise };
    return true;
  }
  const soundButton = $('#soundToggle');
  soundButton.addEventListener('click', () => {
    if (!soundEnabled) {
      if (!startAudio()) { soundButton.querySelector('.sound-label').textContent = 'AUDIO UNAVAILABLE'; return; }
      soundEnabled = true;
    } else {
      audio.master.gain.setTargetAtTime(0.0001, audio.ctx.currentTime, 0.35);
      soundEnabled = false;
    }
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.setAttribute('aria-label', soundEnabled ? 'Disable ambient sound' : 'Enable ambient sound');
    soundButton.querySelector('.sound-label').textContent = soundEnabled ? 'SOUND ON' : 'SOUND OFF';
    onSoundChange?.(soundEnabled);
  });
  $('#backTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
  $('#year').textContent = new Date().getFullYear();
  return { playTransition() { playCue(420, 0.22); }, playInspect() { playCue(760, 0.1); }, destroy() { removeEventListener('scroll', requestUpdate); audio?.ctx.close(); } };
}
