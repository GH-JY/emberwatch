// The little choices that carry a run from one night to the next: three cards are offered when a
// night is survived, and the one taken tilts the fire, the keeper or the lantern for good. Every
// card is a plain modifier applied once to the run's `mods`, so nothing here knows how a night runs.

export const CARD_POOL = [
  {
    id: 'wide-flame',
    name: 'Wide Flame',
    blurb: 'The fire climbs higher: +20 maximum fuel and 14% more light.',
    apply(state) {
      state.mods.fuelCap += 20;
      state.mods.fireRadius *= 1.14;
    },
  },
  {
    id: 'long-reach',
    name: 'Long Reach',
    blurb: 'The lantern beam pricks 90 further into the dark.',
    apply(state) {
      state.mods.range += 90;
    },
  },
  {
    id: 'steady-hand',
    name: 'Steady Hand',
    blurb: 'The beam sears 30% harder through a shade.',
    apply(state) {
      state.mods.beamDamage *= 1.3;
    },
  },
  {
    id: 'forager',
    name: 'Forager',
    blurb: 'The keeper can carry one more log before turning back.',
    apply(state) {
      state.mods.carry += 1;
    },
  },
  {
    id: 'quick-boots',
    name: 'Quick Boots',
    blurb: 'The keeper crosses the moor 12% faster, even laden.',
    apply(state) {
      state.mods.speed *= 1.12;
    },
  },
  {
    id: 'rich-pitch',
    name: 'Rich Pitch',
    blurb: 'Every log feeds the fire 8 more fuel.',
    apply(state) {
      state.mods.woodFuel += 8;
    },
  },
  {
    id: 'slow-burn',
    name: 'Slow Burn',
    blurb: 'The fire drinks its fuel 15% slower.',
    apply(state) {
      state.mods.drain *= 0.85;
    },
  },
  {
    id: 'emberbomb',
    name: 'Emberbomb',
    blurb: 'Flares reach 60 further and strike 30% harder.',
    apply(state) {
      state.mods.flareRadius += 60;
      state.mods.flareDamage *= 1.3;
    },
  },
  {
    id: 'oil-flask',
    name: 'Oil Flask',
    blurb: 'The lantern holds 30 more charge and recovers 6 faster.',
    apply(state) {
      state.mods.energyMax += 30;
      state.mods.energyRegen += 6;
    },
  },
  {
    id: 'glass-edge',
    name: 'Glass Edge',
    blurb: 'The beam fans wider, catching more of the dark.',
    apply(state) {
      state.mods.beamWidth += 0.03;
    },
  },
  {
    id: 'kindling',
    name: 'Kindling',
    blurb: 'Firelight itself sears shades 50% harder.',
    apply(state) {
      state.mods.burn *= 1.5;
    },
  },
  {
    id: 'mend',
    name: 'Mend',
    blurb: 'Bind the keeper’s wounds: restore one heart (to five at most).',
    apply(state) {
      state.keeper.hearts = Math.min(5, state.keeper.hearts + 1);
    },
  },
];

/** `count` distinct cards, drawn from a seeded stream so a replay offers the same choices. */
export function offerCards(rng, state, count = 3) {
  const pool = CARD_POOL.filter((card) => card.id !== 'mend' || state.keeper.hearts < 5);
  const drawn = [];
  const rest = pool.slice();
  while (drawn.length < count && rest.length > 0) {
    const index = Math.floor(rng() * rest.length);
    drawn.push(rest.splice(index, 1)[0]);
  }
  return drawn;
}
