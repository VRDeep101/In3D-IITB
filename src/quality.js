// Picks rendering settings from the device. Touch screens and small viewports get the
// lighter tier; desktops with few cores get a middle tier.
export function detectQuality() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = coarse || small;
  // ?quality=low|medium|high overrides the automatic choice (useful for testing).
  const forced = new URLSearchParams(window.location.search).get('quality');
  const tier = ['low', 'medium', 'high'].includes(forced) ? forced : mobile ? 'low' : cores <= 4 ? 'medium' : 'high';
  const dpr = window.devicePixelRatio || 1;

  const table = {
    low: { pixelRatio: Math.min(dpr, 1.5), samples: 0, bloom: false, snowScale: 0.45, waterRes: 384, shadowSize: 1024 },
    medium: { pixelRatio: Math.min(dpr, 1.75), samples: 2, bloom: true, snowScale: 0.8, waterRes: 512, shadowSize: 2048 },
    high: { pixelRatio: Math.min(dpr, 2), samples: 4, bloom: true, snowScale: 1, waterRes: 768, shadowSize: 2048 },
  };
  return { tier, ...table[tier] };
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Watches frame times after start-up. If the average frame is consistently slow,
// it steps quality down one notch at a time (at most three steps), then stops.
export class FrameGovernor {
  constructor(onDowngrade) {
    this.onDowngrade = onDowngrade;
    this.warmup = 180;
    this.cooldown = 0;
    this.window = [];
    this.steps = 0;
  }

  sample(dt) {
    if (this.steps >= 3) return;
    if (this.warmup > 0) { this.warmup--; return; }
    if (this.cooldown > 0) { this.cooldown--; return; }
    this.window.push(dt);
    if (this.window.length < 120) return;
    const avg = this.window.reduce((a, b) => a + b, 0) / this.window.length;
    this.window.length = 0;
    if (avg > 0.027) {
      this.steps++;
      this.cooldown = 120;
      this.onDowngrade(this.steps);
    }
  }
}
