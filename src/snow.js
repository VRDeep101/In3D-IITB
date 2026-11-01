import * as THREE from 'three';
import { createSnowSprite } from './textures.js';

const VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uRadius;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSway;
  uniform float uSizeWorld;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float speed = uSpeed * (0.7 + aSeed * 0.6);
    // Flakes fall and wrap around the volume, so the snowfall never runs out.
    p.y = mod(p.y - uTime * speed, uHeight);
    p.x += sin(uTime * (0.35 + aSeed * 0.3) + aSeed * 40.0) * uSway
         + sin(uTime * 0.12 + aSeed * 9.0) * uSway * 1.6;
    p.z += cos(uTime * (0.28 + aSeed * 0.2) + aSeed * 23.0) * uSway * 0.8;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = max(-mv.z, 0.1);
    gl_PointSize = clamp(uSizeWorld * uScale / depth, 1.0, 40.0);

    float vertical = smoothstep(0.0, 10.0, p.y) * (1.0 - smoothstep(uHeight - 22.0, uHeight, p.y));
    float radial = 1.0 - smoothstep(uRadius * 0.7, uRadius, length(p.xz));
    float nearFade = smoothstep(2.0, 16.0, depth);
    float farFade = 1.0 - smoothstep(170.0, 260.0, depth);
    vAlpha = vertical * radial * nearFade * farFade * (0.6 + 0.4 * fract(aSeed * 7.13));

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;

  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const LAYERS = [
  { count: 3600, size: 0.2, speed: 3.6, sway: 1.2, opacity: 0.55 },
  { count: 2200, size: 0.3, speed: 5.8, sway: 1.8, opacity: 0.65 },
  { count: 220, size: 0.55, speed: 9.5, sway: 3.2, opacity: 0.42 },
];

export class Snowfall {
  constructor(quality) {
    this.group = new THREE.Group();
    this.height = 130;
    this.radius = 130;
    this.time = { value: 0 };
    this.scale = { value: 1000 };
    this.sprite = createSnowSprite(64);
    this.layers = [];

    for (const L of LAYERS) {
      const n = Math.max(40, Math.round(L.count * quality.snowScale));
      const pos = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() * 2 - 1) * this.radius;
        pos[i * 3 + 1] = Math.random() * this.height;
        pos[i * 3 + 2] = (Math.random() * 2 - 1) * this.radius;
        seed[i] = Math.random();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: this.time,
          uHeight: { value: this.height },
          uRadius: { value: this.radius },
          uScale: this.scale,
          uSpeed: { value: L.speed },
          uSway: { value: L.sway },
          uSizeWorld: { value: L.size },
          uMap: { value: this.sprite },
          uColor: { value: new THREE.Color(0xeaf6ff) },
          uOpacity: { value: L.opacity },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 2;
      this.group.add(points);
      this.layers.push({ geometry, material });
    }
  }

  // Converts world-size flakes to pixels: size_px = world * (pixel height / (2 tan(fov/2))) / depth.
  setPixelHeight(pixelHeight, fovDeg) {
    this.scale.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(t) {
    this.time.value = t;
  }

  dispose() {
    for (const { geometry, material } of this.layers) {
      geometry.dispose();
      material.dispose();
    }
    this.sprite.dispose();
  }
}
