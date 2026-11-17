// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area
// and the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the best score is kept between visits. */
export const BEST_KEY = 'emberwatch.best';

/** The signal fire: its fuel, how fast it burns, and the light it throws. */
export const FIRE = {
  x: 640,
  y: 372,
  startFuel: 78,
  maxFuel: 100,
  drainBase: 0.55,
  drainPerNight: 0.05,
  radiusBase: 96,
  radiusPerFuel: 2.35,
  feedRadius: 78,
  woodFuel: 25,
  hitDamage: 9,
  lightSlow: 0.62,
  lightBurn: 7,
};

/** The keeper: movement, carrying, hearts and the lantern's beam. */
export const KEEPER = {
  radius: 13,
  speed: 252,
  accel: 2100,
  friction: 9,
  carryBase: 3,
  carrySlow: 0.92,
  pickupRadius: 30,
  feedInterval: 0.28,
  hearts: 3,
  invulnerable: 1.35,
  knockback: 240,
};

export const LANTERN = {
  energyMax: 100,
  drain: 18,
  regen: 26,
  regenDelay: 0.35,
  range: 430,
  halfAngle: 0.16,
  damage: 42,
  slow: 0.7,
  flareCost: 40,
  flareRadius: 210,
  flareDamage: 85,
  flareKnockback: 300,
  flareCooldown: 1.0,
};

/** Shade kinds, in the order the nights unlock them. */
export const SHADES = {
  drifter: { hp: 30, speed: 58, radius: 13, damage: 4, score: 10, beamResist: 0 },
  skitter: { hp: 18, speed: 106, radius: 9, damage: 7, score: 12, beamResist: 0 },
  warden: { hp: 105, speed: 35, radius: 22, damage: 9, score: 25, beamResist: 0.45 },
};

export const NIGHT = {
  total: 7,
  seconds: 40,
  banner: 2.2,
  prelude: 3.0,
  spawnBudget: (night) => 3 + night * 3,
  kinds: (night) => {
    if (night >= 6) return ['drifter', 'skitter', 'skitter', 'warden'];
    if (night >= 4) return ['drifter', 'drifter', 'skitter', 'warden'];
    if (night >= 2) return ['drifter', 'drifter', 'skitter'];
    return ['drifter'];
  },
};

export const WORLD = {
  spawnRadius: 760,
  woodMin: 4,
  woodMax: 6,
  woodRespawn: 2.6,
  woodSafeRadius: 170,
  maxParticles: 420,
  maxShades: 48,
};

export const PALETTE = {
  backdrop: '#03050a',
  skyTop: '#050810',
  skyMid: '#0a1420',
  horizon: '#13222f',
  hillFar: '#12202e',
  hillNear: '#0a1420',
  ground: '#070d13',
  groundLine: '#0d1822',
  stone: '#1b2836',
  stoneLight: '#2a3a4c',
  moon: '#dbe7f2',
  moonGlow: 'rgba(198, 220, 240, 0.16)',
  fireCore: '#fff6d2',
  fireMid: '#ffb454',
  fireEdge: '#ff6a2b',
  fireGlow: 'rgba(255, 138, 58, 0.34)',
  ember: '#ffb066',
  beam: 'rgba(255, 236, 176, 0.9)',
  beamSoft: 'rgba(255, 214, 130, 0.16)',
  cloak: '#25384a',
  cloakDark: '#16232f',
  hood: '#0f1923',
  lantern: '#ffe3a3',
  shade: '#0b1118',
  shadeEdge: '#1a2734',
  shadeEye: '#a8ecff',
  shadeEyeAngry: '#ffd0a0',
  wood: '#7a5a3a',
  woodLight: '#b08a5c',
  text: '#e9f0f8',
  muted: '#8ea3b8',
  dim: '#54687c',
  panel: 'rgba(5, 9, 15, 0.88)',
  panelEdge: 'rgba(140, 180, 220, 0.16)',
  accent: '#ffb454',
  good: '#8fe3b6',
  danger: '#ff5d73',
  gold: '#ffd479',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
export const FONT_TITLE = '"Palatino Linotype", "Book Antiqua", Georgia, serif';
