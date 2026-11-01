import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createWaterNormals } from './textures.js';

export const COLORS = {
  midnight: new THREE.Color(0x0b1626),
  slate: new THREE.Color(0x1e3142),
  horizon: new THREE.Color(0x3a5366),
  ice: new THREE.Color(0x8fe3f2),
  warm: new THREE.Color(0xff5a36),
  warmSoft: new THREE.Color(0xff8a5c),
  snow: new THREE.Color(0xeaf4f9),
};

// Key light comes from above-left and in front, as soft overcast daylight.
export const KEY_DIR = new THREE.Vector3(-0.7, 0.75, 0.45).normalize();

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

// Procedural studio-style reflections for the PBR materials (no external HDRI download).
export function setupEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

export function createSky() {
  const geometry = new THREE.SphereGeometry(1500, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: COLORS.midnight },
      uHorizon: { value: COLORS.horizon },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float t = smoothstep(-0.02, 0.55, d.y);
        vec3 col = mix(uHorizon, uTop, pow(t, 0.8));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

export function createLights(scene, center, quality) {
  const hemi = new THREE.HemisphereLight(0xa9c9db, 0x0b1624, 1.0);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xdcecf7, 2.0);
  key.position.copy(center).addScaledVector(KEY_DIR, 220);
  key.target.position.copy(center);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const s = key.shadow.camera;
  s.left = -90; s.right = 90; s.top = 90; s.bottom = -90; s.near = 20; s.far = 520;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.25;
  scene.add(key);
  scene.add(key.target);

  // Faint warm rim from the far side: the vermilion accent in the lighting.
  const rim = new THREE.DirectionalLight(COLORS.warmSoft, 0.55);
  rim.position.copy(center).add(new THREE.Vector3(80, 25, -90));
  rim.target.position.copy(center);
  scene.add(rim);
  scene.add(rim.target);

  return { key, sunDir: KEY_DIR.clone() };
}

// Reflective water at the building's base. THREE.Water renders the scene into a
// mirrored target, so the temple, snow and sky all show up in the reflection.
export function createWater({ renderer, quality, center, waterY, sunDir }) {
  const geometry = new THREE.PlaneGeometry(9000, 9000);
  const water = new Water(geometry, {
    textureWidth: quality.waterRes,
    textureHeight: quality.waterRes,
    waterNormals: createWaterNormals(256),
    sunDirection: sunDir.clone().normalize(),
    sunColor: new THREE.Color(0x6f8fa3),
    waterColor: new THREE.Color(0x0c2332),
    distortionScale: 0.72,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(center.x, waterY - 0.02, center.z);
  water.material.uniforms.size.value = 4.5;
  water.material.uniforms.alpha.value = 0.96;
  water.renderOrder = 1;
  return water;
}

// Adds shadows and a tuned environment response to every imported mesh material.
export function tuneModel(model, maxAnisotropy) {
  const meshes = [];
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    meshes.push(obj);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      m.envMapIntensity = 0.55;
      for (const key of ['map', 'normalMap']) {
        if (m[key]) m[key].anisotropy = Math.min(maxAnisotropy, 8);
      }
    }
  });
  return meshes;
}
