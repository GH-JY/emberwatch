// A small seeded generator (mulberry32): the same seed always gives the same moor, the same
// wood and the same shades, so a screenshot staged from a seed can be taken again.

export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  /** A float in [min, max). */
  next.range = (min, max) => min + next() * (max - min);
  /** An integer in [min, max]. */
  next.int = (min, max) => Math.floor(min + next() * (max - min + 1));
  /** One of the given values. */
  next.pick = (values) => values[Math.floor(next() * values.length)];
  return next;
}
