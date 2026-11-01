// Camera stages are expressed as orbit poses around the building's centre.
//   az   azimuth around the vertical axis (radians)
//   pol  polar angle from straight up (radians; > PI/2 looks up from below the centre)
//   r    orbit radius, in multiples of the building's largest dimension
//   ty   look-at height, as a fraction of the building's height, measured from its base
//   shift  horizontal framing shift (fraction of viewport width), used to push the
//          building into the right of the frame on desktop
export const STAGES = [
  {
    name: 'Approach',
    line: 'The main hall at three-quarter view, its roofline cut against a grey sky.',
    pose: { az: 0.62, pol: 1.26, r: 2.3, ty: 0.5, shift: 0.07 },
  },
  {
    name: 'Reflection',
    line: 'Low to the water, the structure doubles itself in the still surface.',
    pose: { az: -0.42, pol: 1.8, r: 2.35, ty: 0.42, shift: 0.07 },
  },
  {
    name: 'Ascent',
    line: 'A diagonal climb across the roof, the eaves falling away below.',
    pose: { az: 1.55, pol: 1.04, r: 2.45, ty: 0.55, shift: 0.07 },
  },
  {
    name: 'Plan',
    line: 'Directly above, the roof resolves into a single composed plane.',
    pose: { az: 2.25, pol: 0.2, r: 2.0, ty: 0.72, shift: 0.07 },
  },
  {
    name: 'Presence',
    line: 'Held at the waterline in falling snow, the building keeps its ground.',
    pose: { az: 0.95, pol: 1.34, r: 2.15, ty: 0.5, shift: 0.2 },
  },
];

// One deliberate gesture = one stage. Transitions run in this many seconds.
export const TRANSITION_SECONDS = 1.45;
// Trackpad momentum keeps sending wheel events; a gesture only counts after this much quiet.
export const WHEEL_QUIET_MS = 340;
// Minimum vertical swipe distance on touch, in CSS pixels.
export const SWIPE_MIN_PX = 36;

export const MODEL_URL = '/models/temple.glb';
export const CONTACT_HREF = 'mailto:hello@bidukostudio.com';

export const STRIP_LABELS = [
  'Waterline 0.00',
  'Plinth to ridge',
  'Hall axis A–A',
  'Bracket system',
  'Eave line',
  'Roof plane',
  'Overcast key light',
  'Continuous snowfall',
  'Still water',
  'Model by carolinefangel, CC BY 4.0',
];
