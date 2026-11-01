import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import './styles.css';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { STAGES, MODEL_URL, TRANSITION_SECONDS, WHEEL_QUIET_MS, SWIPE_MIN_PX } from './config.js';
import { detectQuality, prefersReducedMotion, FrameGovernor } from './quality.js';
import { createRenderer, setupEnvironment, createSky, createLights, createWater, tuneModel, COLORS } from './scene.js';
import { Snowfall } from './snow.js';
import { CameraRig } from './rig.js';
import { createInspector } from './inspect.js';
import { createUI } from './ui.js';

// ---------- Setup -----------------------------------------------------------

const reduced = prefersReducedMotion();
const finePointer = !window.matchMedia('(pointer: coarse)').matches;
const quality = detectQuality();
const canvas = document.getElementById('scene');

let index = 0;
let busy = false;
let modelReady = false;
let structureOn = false;

const ui = createUI({
  onSelect: (i) => goTo(i),
  onExplore: () => toggleStructure(),
});
ui.setStage(0, true);

let renderer;
try {
  renderer = createRenderer(canvas, quality);
} catch (err) {
  ui.setError('This experience needs WebGL. Try a current browser.');
  throw err;
}

const scene = new THREE.Scene();
scene.background = COLORS.midnight;
scene.fog = new THREE.FogExp2(COLORS.horizon, 0.0032);
setupEnvironment(renderer, scene);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.5, 2600);
const rig = new CameraRig(camera, STAGES, reduced);
rig.setViewport(window.innerWidth, window.innerHeight);

scene.add(createSky());

const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.5, 0.88);
bloom.enabled = quality.bloom;

const composer = (() => {
  const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    samples: quality.samples,
  });
  const c = new EffectComposer(renderer, target);
  c.setPixelRatio(quality.pixelRatio);
  c.setSize(window.innerWidth, window.innerHeight);
  c.addPass(new RenderPass(scene, camera));
  c.addPass(bloom);
  c.addPass(new OutputPass());
  return c;
})();

// Scene objects that depend on the model are created once it has loaded.
let water = null;
let snow = null;
let inspector = null;

// ---------- Stage director --------------------------------------------------

function goTo(i) {
  if (!modelReady || busy || i === index || i < 0 || i >= STAGES.length) return false;
  index = i;
  busy = true;
  inspector.setBusy(true);
  ui.setStage(i);
  rig.goTo(i, reduced ? 0.45 : TRANSITION_SECONDS, () => {
    busy = false;
    inspector.setBusy(false);
  });
  return true;
}

function toggleStructure() {
  if (!modelReady) return;
  structureOn = !structureOn;
  inspector.setStructure(structureOn);
  ui.setStructureUI(structureOn);
  ui.setStructureTagsVisible(structureOn);
}

// Wheel + trackpad: accumulate the complete gesture, then advance once settled.
let wheelTotal = 0;
let wheelTimer = 0;
window.addEventListener('wheel', (e) => {
  if (e.target.closest && e.target.closest('button, a')) return;
  e.preventDefault();
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(delta) < 0.01) return;
  wheelTotal += delta;
  window.clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(() => {
    if (!busy && Math.abs(wheelTotal) >= 8) goTo(index + Math.sign(wheelTotal));
    wheelTotal = 0;
  }, 115);
}, { passive: false });

let touchStartY = null;
window.addEventListener(
  'touchstart',
  (e) => {
    touchStartY = e.touches.length ? e.touches[0].clientY : null;
  },
  { passive: true },
);
window.addEventListener(
  'touchend',
  (e) => {
    if (touchStartY === null || !e.changedTouches.length) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    touchStartY = null;
    if (Math.abs(dy) >= SWIPE_MIN_PX) goTo(index + Math.sign(dy));
  },
  { passive: true },
);

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  let handled = true;
  switch (e.key) {
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
      goTo(index + 1);
      break;
    case 'ArrowUp':
    case 'PageUp':
      goTo(index - 1);
      break;
    case 'Home':
      goTo(0);
      break;
    case 'End':
      goTo(STAGES.length - 1);
      break;
    default:
      handled = false;
  }
  if (handled) e.preventDefault();
});

// ---------- Pointer ---------------------------------------------------------

const pointer = { px: 0, py: 0 };

window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  pointer.px = nx;
  pointer.py = ny;
  const overCanvas = e.target === canvas;
  const interactive = !!(e.target.closest && e.target.closest('a, button'));
  ui.setCursorPointer(e.clientX, e.clientY, interactive);
  if (inspector) inspector.setPointer(overCanvas ? nx : null, overCanvas ? -ny : null);
});
document.documentElement.addEventListener('pointerleave', () => {
  if (inspector) inspector.setPointer(null);
  ui.hideCursor();
});

// ---------- Model -----------------------------------------------------------

function onModelReady(gltf) {
  const model = gltf.scene;
  scene.add(model);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const meshes = tuneModel(model, renderer.capabilities.getMaxAnisotropy());

  const lights = createLights(scene, center, quality);

  water = createWater({ renderer, quality, center, waterY: box.min.y, sunDir: lights.sunDir });
  scene.add(water);

  snow = new Snowfall(quality);
  snow.group.position.set(center.x, box.min.y, center.z);
  scene.add(snow.group);
  snow.setPixelHeight(renderer.domElement.height, camera.fov);

  rig.setBounds(box);
  rig.setViewport(window.innerWidth, window.innerHeight);
  rig.update(0, 0, 0);
  rig.startIntro();

  inspector = createInspector({ scene, meshes, camera, quality });
  ui.buildStructureTags(inspector.structureIndices.map((i) => ({ index: i })));

  modelReady = true;
  ui.hideLoader();
}

const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  (gltf) => onModelReady(gltf),
  (event) => {
    if (event.total) ui.setLoading(event.loaded / event.total);
  },
  () => ui.setError('The structure could not be loaded. Refresh to try again.'),
);

// ---------- Resize and adaptive quality ------------------------------------

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  rig.setViewport(w, h);
  if (snow) snow.setPixelHeight(renderer.domElement.height, camera.fov);
}
window.addEventListener('resize', onResize);

const governor = new FrameGovernor((step) => {
  if (step === 1) {
    quality.pixelRatio = Math.max(1, quality.pixelRatio - 0.5);
    renderer.setPixelRatio(quality.pixelRatio);
    composer.setPixelRatio(quality.pixelRatio);
  } else if (step === 2) {
    bloom.enabled = false;
  } else if (step === 3 && snow) {
    snow.group.children.forEach((p) => {
      p.material.uniforms.uOpacity.value *= 0.7;
    });
  }
  onResize();
});

// ---------- Loop ------------------------------------------------------------

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  const px = finePointer && !reduced ? pointer.px : 0;
  const py = finePointer && !reduced ? pointer.py : 0;
  rig.update(dt, px, py);

  if (modelReady) {
    snow.update(elapsed);
    water.material.uniforms.time.value += dt * (reduced ? 0.18 : 0.52);
    inspector.update(dt, elapsed);
    ui.frame(dt, camera, inspector.state, inspector.centerOf());
  }

  composer.render(dt);
  governor.sample(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Teardown --------------------------------------------------------

function dispose() {
  if (inspector) inspector.dispose();
  if (snow) snow.dispose();
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        for (const key in m) {
          const v = m[key];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      });
    }
  });
  composer.dispose();
  renderer.dispose();
}
window.addEventListener('pagehide', dispose, { once: true });

// Small read-only handle for automated checks (stage, transition state, readiness).
window.__biduko = {
  goTo,
  get index() { return index; },
  get busy() { return busy; },
  get ready() { return modelReady; },
  scene,
  get hovering() { return inspector ? inspector.state.hovering : false; },
  get hoveredIndex() { return inspector ? inspector.state.hoveredIndex : -1; },
};
