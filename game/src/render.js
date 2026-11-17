// The painter. It draws the moor from the simulation's state and nothing else: sky and stars, the
// fire and its light, the keeper, the shades, the beam, the flare, and then the interface. The
// playfield is a fixed 1280x720 and the canvas is letterboxed to the window, so every coordinate
// in the game is in the same units. Scenery is built once per run from the seed.

import { FIELD, FIRE, LANTERN, PALETTE } from './config.js';
import { createRandom } from './random.js';
import { fireRadius, fuelCapacity } from './world.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WIN,
  drawHUD,
  drawOver,
  drawPause,
  drawTitle,
  drawUpgrade,
  drawWin,
} from './ui.js';

const HORIZON = 300;
const MOON = { x: 1016, y: 108, r: 44 };

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

// --- Scenery: stars, two ridges, the ring of stones and a little grass, all from the run's seed ---

function buildScenery(seed) {
  const rng = createRandom((seed ^ 0x51ed270b) >>> 0);
  const stars = [];
  for (let index = 0; index < 120; index += 1) {
    stars.push({
      x: rng.range(0, FIELD.width),
      y: rng.range(6, HORIZON - 12),
      r: rng.range(0.5, 1.7),
      phase: rng.range(0, Math.PI * 2),
      alpha: rng.range(0.25, 0.85),
    });
  }
  function ridge(baseline, low, high) {
    const points = [];
    let y = baseline;
    for (let x = -40; x <= FIELD.width + 40; x += 64) {
      y = clamp(y + rng.range(-18, 18), baseline - high, baseline - low);
      points.push({ x, y });
    }
    return points;
  }
  const stones = [];
  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2 + rng.range(-0.12, 0.12);
    const radius = 134 + rng.range(-16, 16);
    stones.push({
      x: FIRE.x + Math.cos(angle) * radius,
      y: FIRE.y + Math.sin(angle) * radius * 0.42,
      w: rng.range(12, 22),
      h: rng.range(8, 14),
      tilt: rng.range(-0.4, 0.4),
      light: rng.range(0.2, 0.8),
    });
  }
  const tufts = [];
  for (let index = 0; index < 64; index += 1) {
    tufts.push({
      x: rng.range(16, FIELD.width - 16),
      y: rng.range(HORIZON + 24, FIELD.height - 14),
      length: rng.range(4, 10),
      lean: rng.range(-4, 4),
      alpha: rng.range(0.08, 0.24),
    });
  }
  return { stars, ridgeFar: ridge(HORIZON - 6, 34, 78), ridgeNear: ridge(HORIZON + 24, 12, 50), stones, tufts };
}

const sceneryCache = new WeakMap();

function sceneryFor(state) {
  let scenery = sceneryCache.get(state);
  if (!scenery) {
    scenery = buildScenery(state.seed);
    sceneryCache.set(state, scenery);
  }
  return scenery;
}

// --- Small shapes reused by several layers ---

function flameShape(context, x, baseY, width, height, sway) {
  context.beginPath();
  context.moveTo(x, baseY - height);
  context.bezierCurveTo(x + width * 0.9, baseY - height * 0.34 + sway, x + width * 0.62, baseY - height * 0.04, x, baseY);
  context.bezierCurveTo(x - width * 0.62, baseY - height * 0.04, x - width * 0.9, baseY - height * 0.34 - sway, x, baseY - height);
  context.closePath();
}

function blob(context, x, y, radius, wobble, time, points = 9) {
  context.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const r = radius * (1 + Math.sin(angle * 3 + time * 3 + wobble) * 0.12 + Math.cos(angle * 2 - time * 2 + wobble) * 0.08);
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r * 0.92;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function drawSky(context, scenery, state, dawn) {
  const sky = context.createLinearGradient(0, 0, 0, HORIZON + 60);
  if (dawn) {
    sky.addColorStop(0, '#131a33');
    sky.addColorStop(0.55, '#3c3a58');
    sky.addColorStop(1, '#b96a48');
  } else {
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(0.6, PALETTE.skyMid);
    sky.addColorStop(1, PALETTE.horizon);
  }
  context.fillStyle = sky;
  context.fillRect(0, 0, FIELD.width, HORIZON + 60);

  // Stars, fading out as the sun comes.
  const starAlpha = dawn ? 0.15 : 1;
  context.save();
  for (const star of scenery.stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(state.time * 1.3 + star.phase);
    context.globalAlpha = star.alpha * twinkle * starAlpha;
    context.fillStyle = '#cfe0f2';
    context.fillRect(star.x, star.y, star.r, star.r);
  }
  context.restore();

  // Moon, or the sun lifting out of the ridge at dawn.
  const light = dawn ? { x: 876, y: HORIZON - 26, r: 54, color: '#ffd9a0' } : { x: MOON.x, y: MOON.y, r: MOON.r, color: PALETTE.moon };
  const glow = context.createRadialGradient(light.x, light.y, light.r * 0.2, light.x, light.y, light.r * 4.4);
  glow.addColorStop(0, dawn ? 'rgba(255, 190, 120, 0.5)' : PALETTE.moonGlow);
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.fillStyle = glow;
  context.fillRect(light.x - light.r * 4.5, light.y - light.r * 4.5, light.r * 9, light.r * 9);
  context.restore();

  context.beginPath();
  context.arc(light.x, light.y, light.r, 0, Math.PI * 2);
  context.fillStyle = light.color;
  context.fill();
  if (!dawn) {
    context.save();
    context.globalAlpha = 0.12;
    context.fillStyle = '#9fb4c8';
    context.beginPath();
    context.arc(light.x - 14, light.y - 8, 9, 0, Math.PI * 2);
    context.arc(light.x + 12, light.y + 10, 12, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function drawRidges(context, scenery) {
  const drawRidge = (points, bottom, color) => {
    context.beginPath();
    context.moveTo(-40, bottom);
    for (const point of points) context.lineTo(point.x, point.y);
    context.lineTo(FIELD.width + 40, bottom);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  };
  drawRidge(scenery.ridgeFar, HORIZON + 48, PALETTE.hillFar);
  drawRidge(scenery.ridgeNear, HORIZON + 90, PALETTE.hillNear);
}

function drawGround(context, scenery) {
  const ground = context.createLinearGradient(0, HORIZON, 0, FIELD.height);
  ground.addColorStop(0, '#0a1219');
  ground.addColorStop(0.45, PALETTE.ground);
  ground.addColorStop(1, '#04070c');
  context.fillStyle = ground;
  context.fillRect(0, HORIZON, FIELD.width, FIELD.height - HORIZON);

  context.save();
  for (const tuft of scenery.tufts) {
    context.globalAlpha = tuft.alpha;
    context.strokeStyle = '#4d6a58';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(tuft.x, tuft.y);
    context.lineTo(tuft.x + tuft.lean, tuft.y - tuft.length);
    context.stroke();
  }
  context.restore();
}

function drawFireLight(context, state) {
  const radius = fireRadius(state);
  if (state.fuel <= 0) return;
  const flicker = 0.94 + 0.06 * Math.sin(state.fireFlicker * 9) + 0.03 * Math.sin(state.fireFlicker * 23);
  context.save();

  // The warm pool the fire throws across the ground. The gradient is drawn in a flattened space
  // so it reaches zero exactly at the edge of the ellipse instead of stopping at a visible rim,
  // and it is clipped to the ground so it does not turn the night sky brown.
  context.beginPath();
  context.rect(0, HORIZON, FIELD.width, FIELD.height - HORIZON);
  context.clip();
  context.translate(FIRE.x, FIRE.y + 34);
  context.scale(1, 0.56);
  context.globalCompositeOperation = 'lighter';
  const poolRadius = radius * 0.84 * flicker;
  const pool = context.createRadialGradient(0, 0, 8, 0, 0, poolRadius);
  pool.addColorStop(0, 'rgba(255, 190, 120, 0.34)');
  pool.addColorStop(0.34, 'rgba(255, 152, 74, 0.15)');
  pool.addColorStop(0.7, 'rgba(255, 126, 48, 0.05)');
  pool.addColorStop(1, 'rgba(255, 116, 40, 0)');
  context.fillStyle = pool;
  context.beginPath();
  context.arc(0, 0, poolRadius, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // A tighter halo in the air right around the flames.
  context.save();
  context.globalCompositeOperation = 'lighter';
  const haloRadius = 140 + 80 * Math.min(1, state.fuel / 100);
  const halo = context.createRadialGradient(FIRE.x, FIRE.y - 26, 8, FIRE.x, FIRE.y - 26, haloRadius);
  halo.addColorStop(0, 'rgba(255, 206, 132, 0.26)');
  halo.addColorStop(0.55, 'rgba(255, 156, 76, 0.09)');
  halo.addColorStop(1, 'rgba(255, 120, 40, 0)');
  context.fillStyle = halo;
  context.fillRect(FIRE.x - haloRadius, FIRE.y - 26 - haloRadius, haloRadius * 2, haloRadius * 2);
  context.restore();
}

function drawStones(context, scenery) {
  context.save();
  for (const stone of scenery.stones) {
    context.save();
    context.translate(stone.x, stone.y);
    context.rotate(stone.tilt);
    context.beginPath();
    context.ellipse(0, 0, stone.w / 2, stone.h / 2, 0, 0, Math.PI * 2);
    context.fillStyle = PALETTE.stone;
    context.fill();
    context.beginPath();
    context.ellipse(-stone.w * 0.08, -stone.h * 0.18, stone.w * 0.42, stone.h * 0.26, 0, Math.PI, Math.PI * 2);
    context.fillStyle = `rgba(84, 112, 138, ${0.18 + stone.light * 0.3})`;
    context.fill();
    context.restore();
  }
  context.restore();
}

function drawWoods(context, state) {
  context.save();
  for (const wood of state.woods) {
    if (!wood.active) continue;
    const bob = Math.sin(state.time * 1.8 + wood.bob) * 1.2;
    context.save();
    context.translate(wood.x, wood.y + bob);
    context.rotate(-0.35);
    context.beginPath();
    context.roundRect(-15, -5, 30, 10, 4);
    context.fillStyle = PALETTE.wood;
    context.fill();
    context.rotate(0.75);
    context.beginPath();
    context.roundRect(-13, -4, 26, 8, 4);
    context.fillStyle = '#5e462f';
    context.fill();
    context.rotate(-0.4);
    context.beginPath();
    context.arc(15, 0, 4.4, 0, Math.PI * 2);
    context.fillStyle = PALETTE.woodLight;
    context.fill();
    context.restore();

    // A faint warmth so a log reads even at the edge of the firelight.
    context.save();
    context.globalCompositeOperation = 'lighter';
    const glow = context.createRadialGradient(wood.x, wood.y, 2, wood.x, wood.y, 26);
    glow.addColorStop(0, 'rgba(255, 190, 120, 0.12)');
    glow.addColorStop(1, 'rgba(255, 190, 120, 0)');
    context.fillStyle = glow;
    context.fillRect(wood.x - 26, wood.y - 26, 52, 52);
    context.restore();
  }
  context.restore();
}

function drawShades(context, state) {
  for (const shade of state.shades) {
    const dying = shade.dead;
    const alpha = dying ? Math.max(0, shade.deathTimer / 0.4) : 1;
    if (alpha <= 0) continue;
    const scale = dying ? 1 + (1 - alpha) * 0.45 : 1;
    const radius = shade.radius * scale;

    context.save();
    context.globalAlpha = alpha;

    // A soft pool of darkness, so the shade sits in the scene rather than on it.
    const body = context.createRadialGradient(shade.x, shade.y, radius * 0.15, shade.x, shade.y, radius * 1.85);
    body.addColorStop(0, 'rgba(8, 13, 20, 0.98)');
    body.addColorStop(0.65, 'rgba(8, 13, 20, 0.72)');
    body.addColorStop(1, 'rgba(8, 13, 20, 0)');
    context.fillStyle = body;
    blob(context, shade.x, shade.y, radius * 1.7, shade.wobble, state.time);
    context.fill();

    // The solid wisp of the body.
    context.fillStyle = PALETTE.shade;
    blob(context, shade.x, shade.y, radius, shade.wobble, state.time * 1.4);
    context.fill();
    // Near the fire a shade catches the light on its edges; out in the dark it catches the moon.
    const lit = Math.hypot(shade.x - FIRE.x, shade.y - FIRE.y) < fireRadius(state) + shade.radius;
    context.strokeStyle = lit ? 'rgba(255, 168, 100, 0.4)' : 'rgba(92, 132, 168, 0.55)';
    context.lineWidth = 1.2;
    context.stroke();

    // Eyes, turned toward what the shade is after.
    const target = shade.target === 'keeper' ? state.keeper : FIRE;
    const angle = Math.atan2(target.y - shade.y, target.x - shade.x);
    const sideX = Math.cos(angle + Math.PI / 2);
    const sideY = Math.sin(angle + Math.PI / 2);
    const forwardX = Math.cos(angle) * radius * 0.28;
    const forwardY = Math.sin(angle) * radius * 0.28;
    const eyeColor = shade.target === 'keeper' ? PALETTE.shadeEyeAngry : PALETTE.shadeEye;
    for (const side of [-1, 1]) {
      const ex = shade.x + forwardX + sideX * side * radius * 0.34;
      const ey = shade.y + forwardY + sideY * side * radius * 0.34;
      context.save();
      context.globalCompositeOperation = 'lighter';
      const eyeGlow = context.createRadialGradient(ex, ey, 0.5, ex, ey, radius * 0.7);
      eyeGlow.addColorStop(0, eyeColor);
      eyeGlow.addColorStop(1, 'rgba(168, 236, 255, 0)');
      context.globalAlpha = alpha * 0.55;
      context.fillStyle = eyeGlow;
      context.fillRect(ex - radius, ey - radius, radius * 2, radius * 2);
      context.restore();
      context.beginPath();
      context.arc(ex, ey, Math.max(1.4, radius * 0.12), 0, Math.PI * 2);
      context.fillStyle = eyeColor;
      context.fill();
    }

    if (shade.kind === 'warden') {
      context.strokeStyle = 'rgba(70, 96, 122, 0.8)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(shade.x - radius * 0.55, shade.y - radius * 0.85);
      context.lineTo(shade.x - radius * 0.3, shade.y - radius * 1.5);
      context.moveTo(shade.x + radius * 0.55, shade.y - radius * 0.85);
      context.lineTo(shade.x + radius * 0.3, shade.y - radius * 1.5);
      context.stroke();
    }

    if (shade.beamed > 0) {
      context.strokeStyle = 'rgba(255, 227, 163, 0.45)';
      context.lineWidth = 1.5;
      blob(context, shade.x, shade.y, radius * 1.15, shade.wobble, state.time * 1.4);
      context.stroke();
    }
    if (shade.flash > 0) {
      context.globalAlpha = alpha * Math.min(0.75, shade.flash * 2.4);
      context.fillStyle = '#fff1cf';
      blob(context, shade.x, shade.y, radius, shade.wobble, state.time * 1.4);
      context.fill();
    }
    context.restore();
  }
}

function drawKeeper(context, state) {
  const keeper = state.keeper;
  const blink = keeper.invuln > 0 && Math.floor(keeper.invuln * 12) % 2 === 0;
  context.save();
  context.globalAlpha = blink ? 0.5 : 1;

  context.beginPath();
  context.ellipse(keeper.x, keeper.y + 19, 17, 6, 0, 0, Math.PI * 2);
  context.fillStyle = 'rgba(0, 0, 0, 0.45)';
  context.fill();

  // The lantern's small halo goes behind the figure, so the keeper stays a dark silhouette
  // inside his own light instead of being washed out by it.
  const handX = keeper.x + Math.cos(keeper.aimAngle) * 19;
  const handY = keeper.y - 6 + Math.sin(keeper.aimAngle) * 13;
  context.save();
  context.globalCompositeOperation = 'lighter';
  const halo = context.createRadialGradient(handX, handY, 1, handX, handY, 15);
  halo.addColorStop(0, 'rgba(255, 227, 163, 0.4)');
  halo.addColorStop(1, 'rgba(255, 227, 163, 0)');
  context.fillStyle = halo;
  context.fillRect(handX - 15, handY - 15, 30, 30);
  context.restore();

  const cloak = context.createLinearGradient(keeper.x - 16, keeper.y - 16, keeper.x + 16, keeper.y + 20);
  cloak.addColorStop(0, PALETTE.cloak);
  cloak.addColorStop(1, PALETTE.cloakDark);
  context.beginPath();
  context.moveTo(keeper.x - 16, keeper.y + 17);
  context.quadraticCurveTo(keeper.x - 13, keeper.y - 4, keeper.x, keeper.y - 15);
  context.quadraticCurveTo(keeper.x + 13, keeper.y - 4, keeper.x + 16, keeper.y + 17);
  context.quadraticCurveTo(keeper.x, keeper.y + 23, keeper.x - 16, keeper.y + 17);
  context.closePath();
  context.fillStyle = cloak;
  context.fill();
  context.strokeStyle = 'rgba(96, 128, 156, 0.35)';
  context.lineWidth = 1;
  context.stroke();

  context.beginPath();
  context.arc(keeper.x, keeper.y - 19, 9, 0, Math.PI * 2);
  context.fillStyle = PALETTE.hood;
  context.fill();
  context.beginPath();
  context.arc(keeper.x + Math.cos(keeper.aimAngle) * 2.5, keeper.y - 19 + Math.sin(keeper.aimAngle) * 2.5, 4.4, 0, Math.PI * 2);
  context.fillStyle = '#060a0f';
  context.fill();

  // The lantern in the leading hand.
  context.strokeStyle = PALETTE.cloakDark;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(keeper.x, keeper.y - 4);
  context.lineTo(handX, handY);
  context.stroke();

  context.beginPath();
  context.arc(handX, handY, 3.4, 0, Math.PI * 2);
  context.fillStyle = PALETTE.lantern;
  context.fill();

  if (keeper.hurtFlash > 0) {
    // A red ring that snaps inward, not a disc that hides the keeper.
    const t = Math.min(1, keeper.hurtFlash / 0.45);
    context.globalAlpha = 0.55 * t;
    context.strokeStyle = PALETTE.danger;
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(keeper.x, keeper.y - 4, 22 + (1 - t) * 12, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawBeam(context, state) {
  if (!state.beam.firing) return;
  const keeper = state.keeper;
  const range = LANTERN.range + state.mods.range;
  const half = LANTERN.halfAngle + state.mods.beamWidth;
  const angle = keeper.aimAngle;
  const originX = keeper.x + Math.cos(angle) * 19;
  const originY = keeper.y - 6 + Math.sin(angle) * 13;
  const flicker = 0.86 + 0.14 * Math.sin(state.time * 41) * Math.sin(state.time * 13);

  context.save();
  context.globalCompositeOperation = 'lighter';
  context.globalAlpha = flicker;
  const cone = context.createRadialGradient(originX, originY, 6, originX, originY, range);
  cone.addColorStop(0, 'rgba(255, 236, 176, 0.5)');
  cone.addColorStop(0.45, 'rgba(255, 214, 130, 0.17)');
  cone.addColorStop(1, 'rgba(255, 214, 130, 0)');
  context.beginPath();
  context.moveTo(originX, originY);
  context.arc(originX, originY, range, angle - half, angle + half);
  context.closePath();
  context.fillStyle = cone;
  context.fill();

  context.globalAlpha = flicker * 0.75;
  const core = context.createLinearGradient(originX, originY, originX + Math.cos(angle) * range, originY + Math.sin(angle) * range);
  core.addColorStop(0, 'rgba(255, 246, 210, 0.7)');
  core.addColorStop(1, 'rgba(255, 246, 210, 0)');
  context.strokeStyle = core;
  context.lineWidth = 2.4;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(originX, originY);
  context.lineTo(originX + Math.cos(angle) * range * 0.92, originY + Math.sin(angle) * range * 0.92);
  context.stroke();
  context.restore();
}

function drawFire(context, state) {
  const ratio = clamp(state.fuel / fuelCapacity(state), 0, 1);
  context.save();

  // Charred logs, always there.
  context.strokeStyle = '#241810';
  context.lineWidth = 6;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(FIRE.x - 26, FIRE.y + 8);
  context.lineTo(FIRE.x + 22, FIRE.y + 2);
  context.moveTo(FIRE.x - 18, FIRE.y - 2);
  context.lineTo(FIRE.x + 26, FIRE.y + 10);
  context.stroke();

  if (state.fuel > 0) {
    const sway = Math.sin(state.time * 11) * 5 + Math.sin(state.time * 7 + 2) * 3;
    const height = 30 + 74 * ratio;
    const hit = state.fireHit > 0 ? state.fireHit * 2 : 0;

    context.globalCompositeOperation = 'lighter';
    context.globalAlpha = 0.85;
    flameShape(context, FIRE.x + sway * 0.2, FIRE.y + 6, 28 + 14 * ratio, height, sway);
    context.fillStyle = PALETTE.fireEdge;
    context.fill();
    context.globalAlpha = 0.9;
    flameShape(context, FIRE.x - sway * 0.15, FIRE.y + 6, 19 + 9 * ratio, height * 0.72, -sway * 0.6);
    context.fillStyle = PALETTE.fireMid;
    context.fill();
    context.globalAlpha = 1;
    flameShape(context, FIRE.x + sway * 0.1, FIRE.y + 4, 10 + 5 * ratio, height * 0.44, sway * 0.4);
    context.fillStyle = PALETTE.fireCore;
    context.fill();
    if (hit > 0) {
      context.globalAlpha = Math.min(0.8, hit);
      const flash = context.createRadialGradient(FIRE.x, FIRE.y - 10, 4, FIRE.x, FIRE.y - 10, 90);
      flash.addColorStop(0, 'rgba(255, 240, 210, 0.9)');
      flash.addColorStop(1, 'rgba(255, 240, 210, 0)');
      context.fillStyle = flash;
      context.fillRect(FIRE.x - 90, FIRE.y - 100, 180, 180);
    }
  }
  context.restore();
}

function drawFlare(context, state) {
  if (!state.flare) return;
  const t = 1 - state.flare.time / state.flare.maxTime;
  const radius = state.flare.radius * Math.min(1, t + 0.12);
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.globalAlpha = (1 - t) * 0.8;
  context.strokeStyle = '#ffe6a8';
  context.lineWidth = 6 - t * 4;
  context.beginPath();
  context.arc(state.flare.x, state.flare.y, radius, 0, Math.PI * 2);
  context.stroke();
  const glow = context.createRadialGradient(state.flare.x, state.flare.y, radius * 0.2, state.flare.x, state.flare.y, radius);
  glow.addColorStop(0, 'rgba(255, 214, 130, 0)');
  glow.addColorStop(0.8, 'rgba(255, 214, 130, 0.16)');
  glow.addColorStop(1, 'rgba(255, 214, 130, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(state.flare.x, state.flare.y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawPopups(context, state) {
  context.save();
  context.textAlign = 'center';
  for (const popup of state.popups) {
    const alpha = Math.min(1, (popup.life / popup.maxLife) * 2);
    context.globalAlpha = alpha;
    context.fillStyle = popup.color;
    context.font = `700 15px ${'"Segoe UI", system-ui, sans-serif'}`;
    context.fillText(popup.text, popup.x, popup.y);
  }
  context.restore();
}

function drawVignette(context, dawn) {
  const vignette = context.createRadialGradient(FIELD.width / 2, FIELD.height * 0.46, 240, FIELD.width / 2, FIELD.height * 0.46, 860);
  vignette.addColorStop(0, 'rgba(2, 4, 8, 0)');
  vignette.addColorStop(0.62, 'rgba(2, 4, 8, 0.14)');
  vignette.addColorStop(1, dawn ? 'rgba(2, 4, 8, 0.34)' : 'rgba(2, 4, 8, 0.5)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, FIELD.width, FIELD.height);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  let dpr = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    scale = Math.min(width / FIELD.width, height / FIELD.height);
    offsetX = (width - FIELD.width * scale) / 2;
    offsetY = (height - FIELD.height * scale) / 2;
  }

  window.addEventListener('resize', resize);
  resize();

  function draw(state, screen, best) {
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, width, height);
    context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);

    // Everything below is in playfield units; clip so scenery that runs past the field's edge
    // does not paint into the letterbox. Save/restore keeps the clip from outliving the frame.
    context.save();
    context.beginPath();
    context.rect(0, 0, FIELD.width, FIELD.height);
    context.clip();

    const scenery = sceneryFor(state);
    const dawn = screen === SCREEN_WIN || state.phase === 'won';

    drawSky(context, scenery, state, dawn);
    drawRidges(context, scenery);
    drawGround(context, scenery);
    drawFireLight(context, state);
    drawStones(context, scenery);
    drawWoods(context, state);
    drawShades(context, state);
    drawFire(context, state);
    drawKeeper(context, state);
    drawBeam(context, state);
    drawFlare(context, state);
    state.particles.draw(context);
    drawPopups(context, state);
    drawVignette(context, dawn);

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      drawHUD(context, state);
    }
    if (screen === SCREEN_TITLE) drawTitle(context, state);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(context, state);
    else if (screen === SCREEN_PAUSED) drawPause(context, state);
    else if (screen === SCREEN_OVER) drawOver(context, state, best);
    else if (screen === SCREEN_WIN) drawWin(context, state, best);
    context.restore();
  }

  /** Pointer (client) coordinates to playfield units, for the keeper's aim. */
  function toField(clientX, clientY, out) {
    const rect = canvas.getBoundingClientRect();
    out.x = (clientX - rect.left - offsetX) / scale;
    out.y = (clientY - rect.top - offsetY) / scale;
    return out;
  }

  return { draw, toField };
}
