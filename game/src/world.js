// The simulation. A run is seven nights on the moor: gather wood, carry it to the signal fire,
// keep the light up, and hold the shades off with the lantern beam and the flare. The world only
// reads a control ({ move, aim, fire, flare }) and returns event bits; screens and sound live
// outside it. The step is a pure function of its state and its seeded stream, so a staged scene
// replays exactly.

import { FIRE, KEEPER, LANTERN, NIGHT, PALETTE, SHADES, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createParticles } from './particles.js';
import { offerCards } from './upgrades.js';

export const EVENT_HURT = 1;
export const EVENT_OVER = 2;
export const EVENT_CLEAR = 4;
export const EVENT_WIN = 8;
export const EVENT_PICKUP = 16;
export const EVENT_FEED = 32;
export const EVENT_KILL = 64;
export const EVENT_FLARE = 128;

/** Where the keeper may walk: below the HUD, above the bottom edge, a margin off each side. */
const BOUNDS = { left: 34, right: 1246, top: 150, bottom: 700 };

const FIRE_ATTACK_INTERVAL = 1.4;
const PICKUP_INTERVAL = 0.16;

const IDLE = { move: { x: 0, y: 0 }, aim: null, fire: false, flare: false };

const MOD_DEFAULTS = {
  speed: 1,
  carry: 0,
  fuelCap: 0,
  drain: 1,
  woodFuel: 0,
  range: 0,
  beamDamage: 1,
  beamWidth: 0,
  energyMax: 0,
  energyRegen: 0,
  flareRadius: 0,
  flareDamage: 1,
  burn: 1,
  fireRadius: 1,
};

// The three derived numbers other modules (renderer, interface, autopilot) also need.
export function fireRadius(state) {
  return (FIRE.radiusBase + state.fuel * FIRE.radiusPerFuel) * state.mods.fireRadius;
}

export function carryCapacity(state) {
  return KEEPER.carryBase + state.mods.carry;
}

export function fuelCapacity(state) {
  return FIRE.maxFuel + state.mods.fuelCap;
}

export function energyCapacity(state) {
  return LANTERN.energyMax + state.mods.energyMax;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function makeWood(state) {
  const wood = { x: FIRE.x, y: FIRE.y + 200, active: true, timer: 0, bob: state.rng.range(0, Math.PI * 2) };
  placeWood(state, wood);
  return wood;
}

/** Somewhere in the dark within reach of the fire, never on top of the fire or another pile. */
function placeWood(state, wood) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const angle = state.rng.range(0, Math.PI * 2);
    const distance = state.rng.range(WORLD.woodSafeRadius + 40, 470);
    const x = FIRE.x + Math.cos(angle) * distance;
    const y = FIRE.y + Math.sin(angle) * distance * 0.72;
    if (x < BOUNDS.left + 24 || x > BOUNDS.right - 24 || y < BOUNDS.top + 24 || y > BOUNDS.bottom - 24) continue;
    let clear = true;
    for (const other of state.woods) {
      if (other !== wood && other.active && Math.hypot(other.x - x, other.y - y) < 56) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    wood.x = x;
    wood.y = y;
    return;
  }
  wood.x = FIRE.x + (state.rng() < 0.5 ? -260 : 260);
  wood.y = FIRE.y + 210;
}

function createRun(seed) {
  const state = {
    seed,
    rng: createRandom(seed),
    phase: 'lull',
    night: 1,
    nightTime: 0,
    time: 0,
    score: 0,
    fuel: FIRE.startFuel,
    fireFlicker: 0,
    fireHit: 0,
    emberTimer: 0,
    moteTimer: 0,
    keeper: {
      x: FIRE.x,
      y: FIRE.y + 96,
      vx: 0,
      vy: 0,
      carry: 0,
      hearts: KEEPER.hearts,
      invuln: 0,
      hurtFlash: 0,
      aimAngle: -Math.PI / 2,
      feedTimer: 0,
      pickupTimer: 0,
    },
    beam: { energy: LANTERN.energyMax, firing: false, sinceFire: 99 },
    flare: null,
    flareCooldown: 0,
    shades: [],
    woods: [],
    popups: [],
    toSpawn: 0,
    spawnTimer: 0,
    spawned: 0,
    banner: null,
    offers: null,
    upgrades: [],
    stats: { banished: 0, fed: 0, gathered: 0 },
    overReason: null,
    mods: { ...MOD_DEFAULTS },
    particles: createParticles(),
  };
  for (let index = 0; index < WORLD.woodMax; index += 1) state.woods.push(makeWood(state));
  return state;
}

export function createWorld(seed) {
  let state = createRun(seed);

  function beginNight(night) {
    const s = state;
    s.phase = 'night';
    s.night = night;
    s.nightTime = 0;
    s.toSpawn = NIGHT.spawnBudget(night);
    s.spawnTimer = 0;
    s.spawned = 0;
    s.offers = null;
    s.flare = null;
    s.flareCooldown = 0;
    s.keeper.feedTimer = 0;
    s.shades = [];
    s.beam.energy = energyCapacity(s);
    s.banner = {
      title: `NIGHT ${night}`,
      sub: night === 1 ? 'Feed the signal fire until dawn' : 'The dark comes again',
      time: NIGHT.banner,
    };
  }

  function lose(reason) {
    const s = state;
    if (s.phase === 'lost' || s.phase === 'won') return 0;
    s.phase = 'lost';
    s.overReason = reason;
    s.offers = null;
    s.banner = null;
    if (reason === 'fire') s.fuel = 0;
    for (let index = 0; index < 16; index += 1) s.particles.smoke(FIRE.x, FIRE.y - 18, 1.3);
    return EVENT_OVER;
  }

  function endNight() {
    const s = state;
    const bonus = 30 + s.night * 20 + s.keeper.hearts * 10;
    s.score += bonus;
    s.shades = [];
    s.flare = null;
    s.banner = null;
    if (s.night >= NIGHT.total) {
      s.phase = 'won';
      s.offers = null;
      return EVENT_WIN;
    }
    s.phase = 'rest';
    s.offers = offerCards(s.rng, s, 3);
    return EVENT_CLEAR;
  }

  function spawnShade() {
    const s = state;
    const kind = s.rng.pick(NIGHT.kinds(s.night));
    const def = SHADES[kind];
    const angle = s.rng.range(0, Math.PI * 2);
    const distance = WORLD.spawnRadius + s.rng.range(0, 150);
    s.shades.push({
      kind,
      x: FIRE.x + Math.cos(angle) * distance,
      y: FIRE.y + Math.sin(angle) * distance * 0.82,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      speed: def.speed,
      damage: def.damage,
      score: def.score,
      resist: def.beamResist,
      target: kind === 'skitter' ? 'keeper' : 'fire',
      attackTimer: 0,
      recover: 0,
      wobble: s.rng.range(0, Math.PI * 2),
      beamed: 0,
      flash: 0,
      dead: false,
      deathTimer: 0,
    });
    s.toSpawn -= 1;
    s.spawned += 1;
  }

  function step(dt, control) {
    const s = state;
    const input = control ?? IDLE;
    let events = 0;

    // Timers that keep running on every screen, so the title and the end cards stay alive.
    s.time += dt;
    s.fireFlicker += dt;
    if (s.fireHit > 0) s.fireHit = Math.max(0, s.fireHit - dt);
    if (s.keeper.hurtFlash > 0) s.keeper.hurtFlash = Math.max(0, s.keeper.hurtFlash - dt);
    if (s.flareCooldown > 0) s.flareCooldown = Math.max(0, s.flareCooldown - dt);
    if (s.banner) {
      s.banner.time -= dt;
      if (s.banner.time <= 0) s.banner = null;
    }
    if (s.flare) {
      s.flare.time -= dt;
      if (s.flare.time <= 0) s.flare = null;
    }
    for (const popup of s.popups) {
      popup.life -= dt;
      popup.y -= 28 * dt;
    }
    if (s.popups.length > 0) s.popups = s.popups.filter((popup) => popup.life > 0);
    s.particles.update(dt);

    s.emberTimer -= dt;
    if (s.emberTimer <= 0) {
      s.emberTimer = 0.055;
      if (s.fuel > 0) {
        const power = 0.4 + Math.min(1, s.fuel / 100) * 1.3;
        s.particles.ember(FIRE.x, FIRE.y - 14, power);
        if (s.rng() < 0.18) s.particles.smoke(FIRE.x, FIRE.y - 40, 0.7);
      } else if (s.phase === 'lost') {
        s.particles.smoke(FIRE.x, FIRE.y - 12, 1);
      }
    }
    s.moteTimer -= dt;
    if (s.moteTimer <= 0) {
      s.moteTimer = 0.5;
      s.particles.mote(s.rng.range(70, 1210), s.rng.range(230, 660));
    }

    if (s.phase !== 'night') return events;

    const mods = s.mods;
    const keeper = s.keeper;
    s.nightTime += dt;
    keeper.invuln = Math.max(0, keeper.invuln - dt);
    keeper.pickupTimer = Math.max(0, keeper.pickupTimer - dt);

    // --- The keeper walks ---
    const move = input.move ?? IDLE.move;
    const diagonal = move.x !== 0 && move.y !== 0 ? Math.SQRT1_2 : 1;
    const speed = KEEPER.speed * mods.speed * Math.pow(KEEPER.carrySlow, keeper.carry);
    const targetVx = move.x * speed * diagonal;
    const targetVy = move.y * speed * diagonal;
    const accel = KEEPER.accel * dt;
    keeper.vx += clamp(targetVx - keeper.vx, -accel, accel);
    keeper.vy += clamp(targetVy - keeper.vy, -accel, accel);
    if (move.x === 0) keeper.vx *= Math.max(0, 1 - KEEPER.friction * dt);
    if (move.y === 0) keeper.vy *= Math.max(0, 1 - KEEPER.friction * dt);
    keeper.x += keeper.vx * dt;
    keeper.y += keeper.vy * dt;
    if (keeper.x < BOUNDS.left) {
      keeper.x = BOUNDS.left;
      keeper.vx = 0;
    } else if (keeper.x > BOUNDS.right) {
      keeper.x = BOUNDS.right;
      keeper.vx = 0;
    }
    if (keeper.y < BOUNDS.top) {
      keeper.y = BOUNDS.top;
      keeper.vy = 0;
    } else if (keeper.y > BOUNDS.bottom) {
      keeper.y = BOUNDS.bottom;
      keeper.vy = 0;
    }

    // The keeper feeds the fire from arm's length; nobody stands in the flames.
    const standoff = Math.hypot(keeper.x - FIRE.x, keeper.y - FIRE.y);
    const keepOut = FIRE.feedRadius * 0.5;
    if (standoff < keepOut && standoff > 0) {
      keeper.x = FIRE.x + ((keeper.x - FIRE.x) / standoff) * keepOut;
      keeper.y = FIRE.y + ((keeper.y - FIRE.y) / standoff) * keepOut;
    }

    // --- Where the lantern points: the pointer, or the nearest shade for a keyboard player ---
    let aim = input.aim;
    if (!aim) {
      let nearest = null;
      let nearestDistance = Infinity;
      for (const shade of s.shades) {
        if (shade.dead) continue;
        const distance = (shade.x - keeper.x) ** 2 + (shade.y - keeper.y) ** 2;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = shade;
        }
      }
      if (nearest) aim = { x: nearest.x, y: nearest.y };
    }
    if (aim) keeper.aimAngle = Math.atan2(aim.y - keeper.y, aim.x - keeper.x);

    // --- The beam ---
    const firing = Boolean(input.fire) && s.beam.energy > 0;
    s.beam.firing = firing;
    if (firing) {
      s.beam.energy = Math.max(0, s.beam.energy - LANTERN.drain * dt);
      s.beam.sinceFire = 0;
      const range = LANTERN.range + mods.range;
      const half = LANTERN.halfAngle + mods.beamWidth;
      for (const shade of s.shades) {
        if (shade.dead) continue;
        const dx = shade.x - keeper.x;
        const dy = shade.y - keeper.y;
        const distance = Math.hypot(dx, dy);
        if (distance > range + shade.radius || distance === 0) continue;
        let offset = Math.atan2(dy, dx) - keeper.aimAngle;
        offset = Math.atan2(Math.sin(offset), Math.cos(offset));
        if (Math.abs(offset) > half + Math.atan2(shade.radius, Math.max(30, distance))) continue;
        shade.hp -= LANTERN.damage * mods.beamDamage * (1 - shade.resist) * dt;
        shade.beamed = 0.15;
        if (s.rng() < dt * 9) {
          s.particles.spark(shade.x, shade.y, Math.atan2(dy, dx) + Math.PI + s.rng.range(-0.6, 0.6), s.rng.range(40, 120));
        }
      }
    } else {
      s.beam.sinceFire += dt;
      if (s.beam.sinceFire >= LANTERN.regenDelay) {
        s.beam.energy = Math.min(energyCapacity(s), s.beam.energy + (LANTERN.regen + mods.energyRegen) * dt);
      }
    }

    // --- The flare: a ring of sparks that buys a breath of room ---
    if (input.flare && s.flareCooldown <= 0 && s.beam.energy >= LANTERN.flareCost) {
      s.beam.energy -= LANTERN.flareCost;
      s.flareCooldown = LANTERN.flareCooldown;
      const radius = LANTERN.flareRadius + mods.flareRadius;
      s.flare = { x: keeper.x, y: keeper.y, radius, time: 0.45, maxTime: 0.45 };
      for (const shade of s.shades) {
        if (shade.dead) continue;
        const dx = shade.x - keeper.x;
        const dy = shade.y - keeper.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance > radius + shade.radius) continue;
        shade.hp -= LANTERN.flareDamage * mods.flareDamage * (1 - shade.resist);
        shade.flash = 0.3;
        shade.x += (dx / distance) * 26;
        shade.y += (dy / distance) * 26;
      }
      for (let index = 0; index < 28; index += 1) {
        s.particles.spark(keeper.x, keeper.y, (index / 28) * Math.PI * 2, s.rng.range(120, 260));
      }
      events |= EVENT_FLARE;
    }

    // --- The shades: walk in, press the fire, or hunt the keeper ---
    const radius = fireRadius(s);
    const callShade = s.nightTime > NIGHT.prelude && s.toSpawn > 0;
    if (callShade) {
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0 && s.shades.length < WORLD.maxShades) {
        spawnShade();
        const activeSeconds = Math.max(1, NIGHT.seconds - NIGHT.prelude);
        s.spawnTimer = (activeSeconds / NIGHT.spawnBudget(s.night)) * s.rng.range(0.65, 1.25);
      }
    }

    for (const shade of s.shades) {
      if (shade.dead) {
        shade.deathTimer -= dt;
        continue;
      }
      shade.beamed = Math.max(0, shade.beamed - dt);
      shade.flash = Math.max(0, shade.flash - dt);

      const fireDx = shade.x - FIRE.x;
      const fireDy = shade.y - FIRE.y;
      const distanceToFire = Math.hypot(fireDx, fireDy);
      let speedFactor = 1;
      if (shade.beamed > 0) speedFactor *= LANTERN.slow;
      if (distanceToFire < radius + shade.radius) {
        shade.hp -= FIRE.lightBurn * mods.burn * dt;
        speedFactor *= FIRE.lightSlow;
      }

      if (shade.target === 'fire') {
        const stepLength = shade.speed * speedFactor * dt;
        const edge = distanceToFire - (radius + shade.radius * 0.6);
        if (edge > 6) {
          shade.x -= (fireDx / (distanceToFire || 1)) * stepLength;
          shade.y -= (fireDy / (distanceToFire || 1)) * stepLength;
        } else {
          shade.attackTimer += dt;
          if (shade.attackTimer >= FIRE_ATTACK_INTERVAL) {
            shade.attackTimer = 0;
            s.fuel = Math.max(0, s.fuel - shade.damage);
            s.fireHit = 0.3;
            s.particles.ember(FIRE.x, FIRE.y - 16, 1.5);
            if (s.popups.length < 30) {
              s.popups.push({ x: FIRE.x + s.rng.range(-20, 20), y: FIRE.y - 34, text: `-${shade.damage}`, life: 0.8, maxLife: 0.8, color: PALETTE.danger });
            }
          }
        }
      } else {
        if (shade.recover > 0) {
          shade.recover -= dt;
          const awayX = shade.x - keeper.x;
          const awayY = shade.y - keeper.y;
          const away = Math.hypot(awayX, awayY) || 1;
          shade.x += (awayX / away) * shade.speed * 0.5 * dt;
          shade.y += (awayY / away) * shade.speed * 0.5 * dt;
          continue;
        }
        const dx = keeper.x - shade.x;
        const dy = keeper.y - shade.y;
        const distance = Math.hypot(dx, dy) || 1;
        const weave = Math.sin(s.time * 5 + shade.wobble) * 0.55;
        const dirX = dx / distance - (dy / distance) * weave;
        const dirY = dy / distance + (dx / distance) * weave;
        if (distance > KEEPER.radius + shade.radius + 2) {
          shade.x += dirX * shade.speed * speedFactor * dt;
          shade.y += dirY * shade.speed * speedFactor * dt;
        } else if (keeper.invuln <= 0) {
          keeper.hearts -= 1;
          keeper.invuln = KEEPER.invulnerable;
          keeper.hurtFlash = 0.45;
          keeper.vx += (dx / distance) * -KEEPER.knockback;
          keeper.vy += (dy / distance) * -KEEPER.knockback;
          shade.x -= (dx / distance) * 30;
          shade.y -= (dy / distance) * 30;
          shade.recover = 1.4;
          s.particles.smoke(shade.x, shade.y, 1);
          events |= EVENT_HURT;
        }
      }
    }

    // --- Anything the beam, the fire or a flare finished ---
    for (const shade of s.shades) {
      if (shade.dead || shade.hp > 0) continue;
      shade.dead = true;
      shade.deathTimer = 0.4;
      s.score += shade.score;
      s.stats.banished += 1;
      events |= EVENT_KILL;
      if (s.popups.length < 30) {
        s.popups.push({ x: shade.x, y: shade.y - 12, text: `+${shade.score}`, life: 0.9, maxLife: 0.9, color: PALETTE.gold });
      }
      for (let index = 0; index < 10; index += 1) {
        s.particles.spark(shade.x, shade.y, s.rng.range(0, Math.PI * 2), s.rng.range(40, 160));
      }
      s.particles.smoke(shade.x, shade.y, 1.2);
    }
    s.shades = s.shades.filter((shade) => !shade.dead || shade.deathTimer > 0);

    // --- Wood: lie about, get picked up one log at a time, and feed the fire near it ---
    const capacity = carryCapacity(s);
    const fireDistance = Math.hypot(keeper.x - FIRE.x, keeper.y - FIRE.y);
    for (const wood of s.woods) {
      if (!wood.active) {
        wood.timer -= dt;
        if (wood.timer <= 0) {
          placeWood(s, wood);
          wood.active = true;
        }
        continue;
      }
      if (keeper.carry < capacity && keeper.pickupTimer <= 0 && Math.hypot(wood.x - keeper.x, wood.y - keeper.y) < KEEPER.pickupRadius + 12) {
        wood.active = false;
        wood.timer = WORLD.woodRespawn * s.rng.range(0.8, 1.2);
        keeper.carry += 1;
        keeper.pickupTimer = PICKUP_INTERVAL;
        s.stats.gathered += 1;
        events |= EVENT_PICKUP;
      }
    }

    if (keeper.carry > 0 && fireDistance < FIRE.feedRadius + 24) {
      keeper.feedTimer += dt;
      while (keeper.feedTimer >= KEEPER.feedInterval && keeper.carry > 0) {
        keeper.feedTimer -= KEEPER.feedInterval;
        keeper.carry -= 1;
        const gained = FIRE.woodFuel + mods.woodFuel;
        s.fuel = Math.min(fuelCapacity(s), s.fuel + gained);
        s.score += 12;
        s.stats.fed += 1;
        s.particles.ember(FIRE.x, FIRE.y - 20, 1.6);
        if (s.popups.length < 30) {
          s.popups.push({ x: FIRE.x, y: FIRE.y - 48, text: `+${gained}`, life: 0.8, maxLife: 0.8, color: PALETTE.accent });
        }
        events |= EVENT_FEED;
      }
    } else {
      keeper.feedTimer = 0;
    }

    // --- The fire burns down; an empty fire or a fallen keeper ends the watch ---
    const drain = (FIRE.drainBase + (s.night - 1) * FIRE.drainPerNight) * mods.drain;
    s.fuel = Math.max(0, s.fuel - drain * dt);

    if (keeper.hearts <= 0) events |= lose('keeper');
    else if (s.fuel <= 0) events |= lose('fire');
    else if (s.nightTime >= NIGHT.seconds) events |= endNight();

    return events;
  }

  return {
    get state() {
      return state;
    },
    reset(nextSeed) {
      state = createRun(nextSeed ?? state.seed);
    },
    beginNight,
    step,
    applyUpgrade(id) {
      const s = state;
      const card = s.offers?.find((candidate) => candidate.id === id) ?? s.offers?.[0];
      if (!card) return false;
      card.apply(s);
      s.upgrades.push(card.id);
      beginNight(s.night + 1);
      return true;
    },
  };
}
