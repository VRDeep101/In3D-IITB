import * as THREE from 'three';
import { STAGES, STRIP_LABELS, CONTACT_HREF } from './config.js';

const pad = (n) => String(n).padStart(2, '0');
const _v = new THREE.Vector3();

// Projects a world point to CSS pixels. Returns null if the point is behind the camera.
function toScreen(camera, world) {
  _v.copy(world).project(camera);
  if (_v.z > 1) return null;
  return {
    x: (_v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

export function createUI({ onSelect, onExplore }) {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const loader = $('loader');
  const loaderBar = $('loaderBar');
  const loaderValue = $('loaderValue');
  const loaderLabel = $('loaderLabel');
  const copyStack = $('copyStack');
  const stageNum = $('stageNum');
  const headline = $('headline');
  const hlOutline = $('hlOutline');
  const hlFill = $('hlFill');
  const hlScan = $('hlScan');
  const lede = $('lede');
  const exploreBtn = $('exploreBtn');
  const viewsToggle = $('viewsToggle');
  const views = $('views');
  const track = $('track');
  const cursor = $('cursor');
  const cursorTag = $('cursorTag');
  const elementTag = $('elementTag');
  const structureTags = $('structureTags');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Views panel: one button per stage.
  const viewButtons = STAGES.map((stage, i) => {
    const btn = document.createElement('button');
    btn.className = 'view';
    btn.type = 'button';
    btn.dataset.index = String(i);
    btn.innerHTML = `<span class="view-n">${pad(i + 1)}</span><span class="view-name">${stage.name}</span><span class="view-dot" aria-hidden="true"></span>`;
    btn.addEventListener('click', () => onSelect(i));
    views.querySelector('.views-list').appendChild(btn);
    return btn;
  });

  // Label strip: the list is written twice so the marquee loops seamlessly.
  const stripHtml = STRIP_LABELS.map((label) => `<span class="lbl">${label}</span><i class="sq" aria-hidden="true"></i>`).join('');
  track.innerHTML = stripHtml + stripHtml;

  $('contactLink').setAttribute('href', CONTACT_HREF);

  // Stage copy. Copy swaps during a soft fade so the text never jumps.
  let current = -1;
  let swapTimer = null;

  function applyStageText(i) {
    const s = STAGES[i];
    stageNum.textContent = pad(i + 1);
    hlOutline.textContent = s.name;
    hlFill.textContent = s.name;
    hlScan.textContent = s.name;
    lede.textContent = s.line;
  }

  function setStage(i, immediate = false) {
    if (i === current) return;
    current = i;
    viewButtons.forEach((b, k) => {
      b.classList.toggle('is-active', k === i);
      if (k === i) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    if (immediate || reduced) {
      applyStageText(i);
      return;
    }
    copyStack.classList.add('is-leaving');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      applyStageText(i);
      copyStack.classList.remove('is-leaving');
    }, 380);
  }

  // Headline scan: runs once per hover entry, across the whole headline.
  headline.addEventListener('pointerenter', () => {
    if (reduced) return;
    headline.classList.remove('is-scanning');
    void headline.offsetWidth; // restart the animation
    headline.classList.add('is-scanning');
  });
  headline.addEventListener('animationend', (e) => {
    if (e.animationName === 'scanBand') headline.classList.remove('is-scanning');
  });

  // Explore the Structure toggle.
  exploreBtn.addEventListener('click', () => onExplore());
  function setStructureUI(on) {
    exploreBtn.setAttribute('aria-pressed', String(on));
    exploreBtn.textContent = on ? 'Close The Structure' : 'Explore The Structure';
  }

  viewsToggle.addEventListener('click', () => {
    const collapsed = views.classList.toggle('is-collapsed');
    viewsToggle.setAttribute('aria-expanded', String(!collapsed));
  });

  // Cursor: a ring that trails the pointer, with a contextual label over the building.
  let cx = 0;
  let cy = 0;
  let tx = 0;
  let ty = 0;
  let cursorOn = false;
  let interactive = false;
  let mode = { building: false, link: false };

  function setCursorPointer(x, y, isInteractive = false) {
    tx = x;
    ty = y;
    interactive = isInteractive;
    if (!cursorOn) {
      cx = x;
      cy = y;
      cursorOn = true;
      cursor.classList.add('is-on');
    }
  }

  function hideCursor() {
    cursorOn = false;
    cursor.classList.remove('is-on');
  }

  function setCursorMode(building, link) {
    if (building === mode.building && link === mode.link) return;
    mode = { building, link };
    cursor.classList.toggle('is-building', building);
    cursor.classList.toggle('is-link', link);
    cursorTag.textContent = building ? 'Inspect' : '';
  }

  // Element tags for hover and structure mode.
  const structureNodes = new Map();
  function buildStructureTags(items) {
    structureTags.innerHTML = '';
    structureNodes.clear();
    for (const item of items) {
      const node = document.createElement('div');
      node.className = 'stag';
      node.innerHTML = `<span class="stag-dot" aria-hidden="true"></span><span class="stag-label">Element ${pad(item.index + 1)}</span>`;
      structureTags.appendChild(node);
      structureNodes.set(item.index, node);
    }
  }

  function setStructureTagsVisible(on) {
    structureTags.classList.toggle('is-on', on);
  }

  // Per-frame update of cursor, element tags, and structure tags.
  function frame(dt, camera, inspect, hoverCenter) {
    const k = 1 - Math.exp(-dt * 18);
    cx += (tx - cx) * k;
    cy += (ty - cy) * k;
    if (cursorOn) cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
    setCursorMode(inspect.hovering, interactive);

    if (inspect.tagVisible && hoverCenter) {
      const p = toScreen(camera, hoverCenter);
      if (p) {
        elementTag.style.transform = `translate3d(${p.x + 16}px, ${p.y - 16}px, 0)`;
        const idx = inspect.hoveredIndex;
        if (idx >= 0) elementTag.textContent = `Element ${pad(idx + 1)}`;
        elementTag.classList.add('is-on');
      }
    } else {
      elementTag.classList.remove('is-on');
    }

    for (const tag of inspect.structureTags) {
      const node = structureNodes.get(tag.index);
      if (!node) continue;
      const p = tag.visible ? toScreen(camera, tag.center) : null;
      if (p) {
        node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        node.classList.add('is-on');
      } else {
        node.classList.remove('is-on');
      }
    }
  }

  function setLoading(progress) {
    const pct = Math.round(progress * 100);
    loaderBar.style.transform = `scaleX(${progress})`;
    loaderValue.textContent = `${pct}%`;
  }

  function setError(message) {
    loaderLabel.textContent = message;
    loaderValue.textContent = '';
    loader.classList.add('is-error');
  }

  function hideLoader() {
    loader.classList.add('is-hidden');
    body.classList.add('is-ready');
  }

  return {
    setStage,
    setStructureUI,
    setCursorPointer,
    hideCursor,
    buildStructureTags,
    setStructureTagsVisible,
    frame,
    setLoading,
    setError,
    hideLoader,
    isReduced: reduced,
  };
}
