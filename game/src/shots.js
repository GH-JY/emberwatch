// The staged scenes behind ?shot=start|play|upgrade|win. Each one plays the real rules forward
// from a fresh seeded run, steered by a small autopilot (carry wood when the fire is low, feed it,
// keep the beam on the nearest shade, flare when something gets close), so a screenshot is a frame
// of a game that actually happened and the same seed stages the same frame again.

import { FIRE, LANTERN, STEP } from './config.js';
import { carryCapacity, fireRadius } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './ui.js';

const IDLE = { move: { x: 0, y: 0 }, aim: null, fire: false, flare: false };

/** Which card the pilot would take: first match in this list wins. */
const PREFERRED = [
  'wide-flame',
  'steady-hand',
  'long-reach',
  'forager',
  'slow-burn',
  'rich-pitch',
  'quick-boots',
  'oil-flask',
  'kindling',
  'emberbomb',
  'glass-edge',
  'mend',
];

export function chooseUpgrade(world) {
  const offers = world.state.offers;
  if (!offers || offers.length === 0) return false;
  for (const id of PREFERRED) {
    const card = offers.find((offer) => offer.id === id);
    if (card) return world.applyUpgrade(card.id);
  }
  return world.applyUpgrade(offers[0].id);
}

/** One frame of pilot input: where to walk, where to point the lantern, whether to loose a flare. */
export function autopilot(world) {
  const state = world.state;
  const keeper = state.keeper;
  const capacity = carryCapacity(state);

  let nearestShade = null;
  let nearestShadeDistance = Infinity;
  let threatToFire = null;
  let threatDistance = Infinity;
  const radius = fireRadius(state);
  for (const shade of state.shades) {
    if (shade.dead) continue;
    const distance = Math.hypot(shade.x - keeper.x, shade.y - keeper.y);
    if (distance < nearestShadeDistance) {
      nearestShadeDistance = distance;
      nearestShade = shade;
    }
    const toFire = Math.hypot(shade.x - FIRE.x, shade.y - FIRE.y);
    if (toFire < threatDistance) {
      threatDistance = toFire;
      threatToFire = shade;
    }
  }
  const defend = state.fuel < 45 && threatToFire !== null && threatDistance < radius + 200;
  const aimShade = defend ? threatToFire : nearestShade;

  let target;
  if (keeper.carry > 0 && (state.fuel < 85 || keeper.carry >= capacity)) {
    // Stand just off the fire, close enough for the logs to go in.
    const dx = keeper.x - FIRE.x;
    const dy = keeper.y - FIRE.y;
    const distance = Math.hypot(dx, dy) || 1;
    target = { x: FIRE.x + (dx / distance) * 46, y: FIRE.y + (dy / distance) * 32 };
  } else if (keeper.carry < capacity) {
    let nearestWood = null;
    let nearestWoodDistance = Infinity;
    for (const wood of state.woods) {
      if (!wood.active) continue;
      const distance = Math.hypot(wood.x - keeper.x, wood.y - keeper.y);
      if (distance < nearestWoodDistance) {
        nearestWoodDistance = distance;
        nearestWood = wood;
      }
    }
    target = nearestWood ? { x: nearestWood.x, y: nearestWood.y } : { x: FIRE.x + 100, y: FIRE.y + 72 };
  } else {
    target = { x: FIRE.x + 70, y: FIRE.y + 44 };
  }

  let move = { x: 0, y: 0 };
  if (target) {
    const dx = target.x - keeper.x;
    const dy = target.y - keeper.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 14) move = { x: dx / distance, y: dy / distance };
  }

  const energy = state.beam.energy;
  return {
    move,
    aim: aimShade ? { x: aimShade.x, y: aimShade.y } : null,
    // Hold the beam only when something is worth burning and there is charge to spare; the
    // lantern refills between bursts, and a pilot that never lets it rest goes dark.
    fire:
      Boolean(aimShade) &&
      nearestShadeDistance < LANTERN.range + 40 &&
      energy > (nearestShadeDistance < 180 ? 4 : 22),
    flare:
      Boolean(nearestShade) &&
      nearestShadeDistance < 110 &&
      energy >= LANTERN.flareCost + 25 &&
      state.flareCooldown <= 0,
  };
}

/**
 * Play the run forward until `isDone(state)` holds. Upgrades between nights are taken by the
 * pilot. Returns false if the run is lost or the step budget runs out first.
 */
export function advance(world, isDone, maxSteps) {
  for (let index = 0; index < maxSteps; index += 1) {
    const state = world.state;
    if (isDone(state)) return true;
    if (state.phase === 'lost' || state.phase === 'won') return false;
    if (state.phase === 'rest') {
      if (!chooseUpgrade(world)) return false;
      continue;
    }
    world.step(STEP, autopilot(world));
  }
  return false;
}

/** The screen the run actually ended on, so a failed staging attempt never fakes its scene. */
function currentScreen(state) {
  if (state.phase === 'won') return SCREEN_WIN;
  if (state.phase === 'lost') return SCREEN_OVER;
  if (state.phase === 'rest') return SCREEN_UPGRADE;
  return SCREEN_PLAY;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score to show.
 * Each attempt starts from the seed the page was opened with, plus the attempt number, so a seed
 * that cannot reach a scene (a pilot that dies on night two) rolls on to the next one, and if every
 * attempt falls short the honest end screen is shown instead of a mislabelled frame.
 */
export function stageShot(name, world) {
  const baseSeed = world.state.seed;

  if (name === 'play') {
    // A frame worth photographing: night four or later, the fire healthy, at least a couple of
    // shades on the field, and the lantern beam lit at the closest of them.
    const lively = (state) => {
      if (state.phase !== 'night' || state.night < 4 || state.nightTime < 12) return false;
      let onField = 0;
      let nearest = null;
      let nearestDistance = Infinity;
      for (const shade of state.shades) {
        if (shade.dead) continue;
        const distance = Math.hypot(shade.x - state.keeper.x, shade.y - state.keeper.y);
        if (distance < 620) onField += 1;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = shade;
        }
      }
      if (!nearest || !state.beam.firing) return false;
      // A target that both reads as closest and sits fully in frame, not clipped by an edge or
      // hidden under the interface.
      const framed = nearest.x > 190 && nearest.x < 1090 && nearest.y > 170 && nearest.y < 640;
      return onField >= 3 && framed && nearestDistance > 120 && nearestDistance < 340;
    };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      world.reset(baseSeed + attempt);
      world.beginNight(1);
      if (advance(world, lively, 16000)) {
        return { screen: SCREEN_PLAY, best: world.state.score };
      }
    }
    return { screen: currentScreen(world.state), best: world.state.score };
  }

  if (name === 'upgrade') {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      world.reset(baseSeed + attempt);
      world.beginNight(1);
      if (advance(world, (state) => state.phase === 'rest', 6000)) {
        return { screen: SCREEN_UPGRADE, best: world.state.score };
      }
    }
    return { screen: currentScreen(world.state), best: world.state.score };
  }

  if (name === 'win') {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      world.reset(baseSeed + attempt);
      world.beginNight(1);
      if (advance(world, (state) => state.phase === 'won', 28000)) {
        return { screen: SCREEN_WIN, best: world.state.score };
      }
    }
    return { screen: currentScreen(world.state), best: world.state.score };
  }

  // 'start' and anything else: the fire lit, the keeper standing, the title over it.
  world.reset(baseSeed);
  for (let index = 0; index < 240; index += 1) world.step(STEP, IDLE);
  return { screen: SCREEN_TITLE, best: 0 };
}
