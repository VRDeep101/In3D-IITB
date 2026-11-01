import * as THREE from 'three';
import { COLORS } from './scene.js';

// Every overlay is attached as a child of its building mesh, so it follows the
// geometry exactly. Shaders work in world space for the feathered reveal mask.

// Pushes overlays a hair toward the camera so they sit on top of the surfaces they trace.
const BIAS = '      clip.z -= 0.0006 * clip.w;\n';

const EDGE_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 clip = projectionMatrix * viewMatrix * wp;
${BIAS}    gl_Position = clip;
  }
`;

const EDGE_FRAG = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uStrength;
  uniform float uGlobal;
  uniform float uAlpha;
  uniform vec3 uColor;
  varying vec3 vWorld;

  float h3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = h3(i);
    float n100 = h3(i + vec3(1.0, 0.0, 0.0));
    float n010 = h3(i + vec3(0.0, 1.0, 0.0));
    float n110 = h3(i + vec3(1.0, 1.0, 0.0));
    float n001 = h3(i + vec3(0.0, 0.0, 1.0));
    float n101 = h3(i + vec3(1.0, 0.0, 1.0));
    float n011 = h3(i + vec3(0.0, 1.0, 1.0));
    float n111 = h3(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }

  void main() {
    float d = distance(vWorld, uCenter);
    // Irregular, feathered boundary: the reveal is never a clean circle.
    float n = vnoise(vWorld * 0.18) * 0.65 + vnoise(vWorld * 0.41 + 3.7) * 0.35;
    float reach = uRadius * (0.6 + 0.8 * n);
    float mask = 1.0 - smoothstep(reach * 0.35, reach, d);
    float a = max(mask * uStrength, uGlobal) * uAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const GUIDE_VERT = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * viewMatrix * wp;
${BIAS}    gl_Position = clip;
  }
`;

const GUIDE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uDash;
  uniform vec3 uColor;
  varying vec3 vLocal;
  void main() {
    // Dashes flow along each guide line over time.
    float s = vLocal.x + vLocal.y + vLocal.z;
    float dash = step(0.5, fract(s * 0.25 - uTime * 0.6));
    float k = mix(1.0, 0.2 + 0.8 * dash, uDash);
    float a = uStrength * k * 0.9;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const ANCHOR_VERT = /* glsl */ `
  attribute float aRand;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixel;
  varying float vPulse;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPulse = 0.85 + 0.25 * sin(uTime * 2.2 + aRand * 6.2831);
    gl_PointSize = uSize * uPixel * vPulse;
    vec4 clip = projectionMatrix * mv;
${BIAS}    gl_Position = clip;
  }
`;

const ANCHOR_FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uRing;
  uniform float uStrength;
  varying float vPulse;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    float core = smoothstep(0.34, 0.24, r);
    float ring = smoothstep(0.07, 0.0, abs(r - 0.74));
    vec3 col = mix(uRing, uCore, core);
    float a = max(core, ring * 0.85) * uStrength;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }
`;

// Sample a set of feature vertices from the mesh's sharp edges, for anchor points.
function sampleFeatureVertices(edges, count) {
  const pos = edges.attributes.position.array;
  const total = pos.length / 3;
  const out = [];
  if (total === 0) return out;
  const stride = Math.max(1, Math.floor(total / count));
  for (let i = 0; i < total && out.length < count; i += stride) {
    out.push(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  }
  return out;
}

export function createInspector({ scene, meshes, camera, quality }) {
  // Uniforms shared by every material, so one update drives everything.
  const shared = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uRadius: { value: 14 },
    uStrength: { value: 0 },
    uGlobal: { value: 0 },
  };

  const edgeMat = new THREE.ShaderMaterial({
    uniforms: {
      uCenter: shared.uCenter,
      uRadius: shared.uRadius,
      uStrength: shared.uStrength,
      uGlobal: shared.uGlobal,
      uAlpha: { value: 0.85 },
      uColor: { value: COLORS.ice.clone() },
    },
    vertexShader: EDGE_VERT,
    fragmentShader: EDGE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const edgeLines = [];
  for (const mesh of meshes) {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 30);
    const lines = new THREE.LineSegments(edges, edgeMat);
    lines.visible = false;
    lines.matrixAutoUpdate = true;
    mesh.add(lines);
    edgeLines.push(lines);
    mesh.userData.anchors = sampleFeatureVertices(edges, 16);
  }

  const makeGuideMat = (dash) => new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uStrength: shared.uStrength,
      uDash: { value: dash },
      uColor: { value: COLORS.ice.clone() },
    },
    vertexShader: GUIDE_VERT,
    fragmentShader: GUIDE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const guideMat = makeGuideMat(1);
  const bracketMat = makeGuideMat(0);

  const anchorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uStrength: shared.uStrength,
      uSize: { value: 10 },
      uPixel: { value: quality.pixelRatio },
      uCore: { value: COLORS.warm.clone() },
      uRing: { value: COLORS.ice.clone() },
    },
    vertexShader: ANCHOR_VERT,
    fragmentShader: ANCHOR_FRAG,
    transparent: true,
    depthWrite: false,
  });

  // The hover group is re-parented onto whichever mesh is under the pointer.
  const hoverGroup = new THREE.Group();
  hoverGroup.visible = false;
  let hoverParent = null;
  let groupParts = [];

  function disposeGroupParts() {
    for (const obj of groupParts) {
      obj.removeFromParent();
      obj.geometry.dispose();
    }
    groupParts = [];
  }

  function buildHoverGroup(mesh) {
    disposeGroupParts();
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const { min, max } = bb;
    const size = bb.getSize(new THREE.Vector3());

    const corners = [];
    for (let i = 0; i < 8; i++) {
      corners.push(new THREE.Vector3(
        i & 1 ? max.x : min.x,
        i & 2 ? max.y : min.y,
        i & 4 ? max.z : min.z,
      ));
    }

    // Bounding-box guide lines (the 12 edges of the box).
    const edgePairs = [
      [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3],
      [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const guide = [];
    for (const [a, b] of edgePairs) {
      guide.push(corners[a].x, corners[a].y, corners[a].z, corners[b].x, corners[b].y, corners[b].z);
    }

    // Short L-shaped measurement brackets at each corner, pointing inward.
    const L = Math.max(size.x, size.y, size.z) * 0.12;
    const brackets = [];
    corners.forEach((c, i) => {
      const sx = i & 1 ? -1 : 1;
      const sy = i & 2 ? -1 : 1;
      const sz = i & 4 ? -1 : 1;
      brackets.push(
        c.x, c.y, c.z, c.x + sx * L, c.y, c.z,
        c.x, c.y, c.z, c.x, c.y + sy * L, c.z,
        c.x, c.y, c.z, c.x, c.y, c.z + sz * L,
      );
    });

    const guideGeo = new THREE.BufferGeometry();
    guideGeo.setAttribute('position', new THREE.Float32BufferAttribute(guide, 3));
    const guideLines = new THREE.LineSegments(guideGeo, guideMat);

    const bracketGeo = new THREE.BufferGeometry();
    bracketGeo.setAttribute('position', new THREE.Float32BufferAttribute(brackets, 3));
    const bracketLines = new THREE.LineSegments(bracketGeo, bracketMat);

    // Anchor points on the mesh's own feature vertices, plus its centre.
    const anchors = [...(mesh.userData.anchors || [])];
    anchors.push(bb.getCenter(new THREE.Vector3()));
    const apos = new Float32Array(anchors.length * 3);
    const arand = new Float32Array(anchors.length);
    anchors.forEach((v, i) => {
      apos[i * 3] = v.x;
      apos[i * 3 + 1] = v.y;
      apos[i * 3 + 2] = v.z;
      arand[i] = Math.random();
    });
    const anchorGeo = new THREE.BufferGeometry();
    anchorGeo.setAttribute('position', new THREE.BufferAttribute(apos, 3));
    anchorGeo.setAttribute('aRand', new THREE.BufferAttribute(arand, 1));
    const anchorPoints = new THREE.Points(anchorGeo, anchorMat);

    groupParts = [guideLines, bracketLines, anchorPoints];
    for (const part of groupParts) {
      part.frustumCulled = false;
      hoverGroup.add(part);
    }
  }

  // Structure mode labels the five largest elements.
  const largest = [...meshes]
    .map((mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const vol = box.getSize(new THREE.Vector3());
      return { mesh, center: box.getCenter(new THREE.Vector3()), volume: vol.x * vol.y * vol.z };
    })
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)
    .map((item) => ({
      index: meshes.indexOf(item.mesh),
      center: item.center,
    }));

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hoverPoint = new THREE.Vector3();
  let pointerActive = false;
  let hoverTarget = false;
  let structure = false;
  let busy = false;
  let hoveredIndex = -1;
  let raycastTimer = 0;

  const state = {
    hovering: false,
    hoveredIndex: -1,
    tagVisible: false,
    structureTags: [], // refreshed each frame: { index, center: Vector3, visible }
  };

  function setPointer(x, y) {
    if (x === null) {
      pointerActive = false;
      return;
    }
    ndc.set(x, y);
    pointerActive = true;
  }

  function setBusy(v) {
    busy = v;
  }

  function setStructure(on) {
    structure = on;
  }

  function update(dt, time) {
    shared.uTime.value = time;

    // Hover detection, throttled. Not while the camera is moving.
    raycastTimer -= dt;
    if (pointerActive && !busy && raycastTimer <= 0) {
      raycastTimer = 0.05;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        const hit = hits[0];
        hoverTarget = true;
        hoverPoint.copy(hit.point);
        const idx = meshes.indexOf(hit.object);
        if (hit.object !== hoverParent) {
          hoverGroup.removeFromParent();
          hit.object.add(hoverGroup);
          hoverParent = hit.object;
          buildHoverGroup(hit.object);
        }
        hoveredIndex = idx;
      } else {
        hoverTarget = false;
      }
    } else if (!pointerActive) {
      hoverTarget = false;
    }

    const hoverKs = 1 - Math.exp(-dt * (hoverTarget ? 7 : 4));
    const strengthGoal = hoverTarget && !busy ? 1 : 0;
    shared.uStrength.value += (strengthGoal - shared.uStrength.value) * hoverKs;

    if (hoverTarget) {
      shared.uCenter.value.lerp(hoverPoint, 1 - Math.exp(-dt * 12));
    }
    const dist = camera.position.distanceTo(shared.uCenter.value);
    const radiusGoal = THREE.MathUtils.clamp(dist * 0.11, 7, 20);
    shared.uRadius.value += (radiusGoal - shared.uRadius.value) * (1 - Math.exp(-dt * 4));

    const globalGoal = structure ? 0.32 : 0;
    shared.uGlobal.value += (globalGoal - shared.uGlobal.value) * (1 - Math.exp(-dt * 5));

    const edgesOn = shared.uStrength.value > 0.002 || shared.uGlobal.value > 0.002;
    for (const l of edgeLines) l.visible = edgesOn;
    hoverGroup.visible = shared.uStrength.value > 0.002;

    state.hovering = hoverTarget && !busy;
    state.hoveredIndex = hoverTarget ? hoveredIndex : -1;
    state.tagVisible = shared.uStrength.value > 0.08;

    // Structure tags are projected by the UI from these element centres.
    state.structureTags = largest.map((l) => ({
      index: l.index,
      center: l.center,
      visible: structure,
    }));
  }

  function dispose() {
    disposeGroupParts();
    for (const l of edgeLines) l.geometry.dispose();
    edgeMat.dispose();
    guideMat.dispose();
    bracketMat.dispose();
    anchorMat.dispose();
  }

  return {
    state,
    structureIndices: largest.map((l) => l.index),
    setPointer,
    setBusy,
    setStructure,
    update,
    dispose,
    centerOf: () => shared.uCenter.value,
  };
}
