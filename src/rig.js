import * as THREE from 'three';

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const POSE_KEYS = ['az', 'pol', 'r', 'ty', 'shift'];
const MIN_CAMERA_Y = 2.2; // keep the lens above the water surface

// Moves the camera along spherical coordinates around the building. Interpolating
// angles and radius (rather than straight-line positions) gives each move a curved,
// orbital arc, which reads as a deliberate camera move rather than a slide.
export class CameraRig {
  constructor(camera, stages, reduced) {
    this.camera = camera;
    this.stages = stages;
    this.reduced = reduced;

    this.center = new THREE.Vector3();
    this.height = 1;
    this.dim = 1;
    this.minY = 0;
    this.fit = 1;
    this.shiftScale = 1;
    this.liftY = 0;
    this.vw = 1;
    this.vh = 1;

    this.pose = { ...stages[0].pose };
    this.from = null;
    this.to = null;
    this.t = 1;
    this.duration = 1.45;
    this.busy = false;
    this.onSettled = null;

    this.par = { x: 0, y: 0 };
    this.introT = 1;
    this.introDuration = 3.4;
    this.introActive = false;

    this._target = new THREE.Vector3();
  }

  setBounds(box) {
    box.getCenter(this.center);
    const size = box.getSize(new THREE.Vector3());
    this.height = size.y;
    this.dim = Math.max(size.x, size.y, size.z);
    this.minY = box.min.y;
  }

  setViewport(w, h) {
    this.vw = w;
    this.vh = h;
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Portrait screens need the building pulled back so its width still fits.
    this.fit = aspect < 1 ? THREE.MathUtils.clamp(0.78 / aspect, 1, 1.9) * (aspect < 0.9 ? 1.25 : 1) : 1;
    // Desktop-only framing shift, so the building sits in the right side of the frame.
    this.shiftScale = THREE.MathUtils.clamp((aspect - 0.9) / 0.5, 0, 1);
    // Portrait screens: lift the building above the copy block at the bottom.
    this.liftY = aspect < 0.9 ? 0.17 : 0;
    this.camera.updateProjectionMatrix();
  }

  goTo(index, duration, onSettled) {
    this.from = { ...this.pose };
    this.to = { ...this.stages[index].pose };
    this.t = 0;
    this.duration = duration;
    this.onSettled = onSettled;
    this.busy = true;
  }

  startIntro() {
    this.introT = 0;
    this.introActive = true;
  }

  update(dt, px, py) {
    if (this.introActive) {
      this.introT = Math.min(1, this.introT + dt / this.introDuration);
      if (this.introT >= 1) this.introActive = false;
    }
    const introK = Math.pow(1 - this.introT, 3); // 1 at the start of the intro, 0 once it has settled

    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.duration);
      const e = this.reduced ? this.t : easeInOutCubic(this.t);
      for (const k of POSE_KEYS) {
        this.pose[k] = this.from[k] + (this.to[k] - this.from[k]) * e;
      }
      if (this.t >= 1) {
        this.busy = false;
        const cb = this.onSettled;
        this.onSettled = null;
        if (cb) cb();
      }
    }

    // Cursor parallax: damped, so it trails gently and never jitters.
    const amount = this.reduced ? 0 : 1;
    const damp = 1 - Math.exp(-dt * 2.6);
    this.par.x += (px * amount - this.par.x) * damp;
    this.par.y += (py * amount - this.par.y) * damp;

    const az = this.pose.az + this.par.x * 0.05;
    const r = this.pose.r * this.dim * this.fit * (1 + 0.42 * introK);
    // ty is the look-at height as a fraction of the building, measured from its base.
    const ty = this.minY + this.pose.ty * this.height;

    let pol = this.pose.pol + this.par.y * 0.035;
    // Never let the camera drop below the water surface.
    const cosLimit = THREE.MathUtils.clamp((MIN_CAMERA_Y - ty) / r, -1, 1);
    pol = Math.min(pol, Math.acos(cosLimit), Math.PI - 0.06);
    pol = Math.max(pol, 0.06);

    const sp = Math.sin(pol);
    const cp = Math.cos(pol);
    this._target.set(this.center.x, ty, this.center.z);
    this.camera.position.set(
      this.center.x + r * sp * Math.cos(az),
      ty + r * cp,
      this.center.z + r * sp * Math.sin(az),
    );
    this.camera.lookAt(this._target);

    const shift = this.pose.shift * this.shiftScale;
    this.camera.setViewOffset(this.vw, this.vh, -shift * this.vw, this.liftY * this.vh, this.vw, this.vh);
  }
}
