// Keyboard and pointer input. Held keys steer and hold the beam; one-shot presses (start,
// restart, flare, pause, upgrade choice) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice. Pointer position is
// kept in playfield coordinates, where the keeper aims the lantern.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_FLARE = 4;
export const ACTION_CHOICE_1 = 8;
export const ACTION_CHOICE_2 = 16;
export const ACTION_CHOICE_3 = 32;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const FLARE = new Set(['KeyF']);
const CHOICES = [ACTION_CHOICE_1, ACTION_CHOICE_2, ACTION_CHOICE_3];
const CHOICE_KEYS = ['Digit1', 'Digit2', 'Digit3'];

/**
 * `toField(clientX, clientY)` converts a pointer event to playfield coordinates; the renderer
 * owns that mapping, so the input takes the function rather than guessing the canvas scale.
 */
export function createInput(target, toField) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let beam = false;
  let actions = 0;
  const pointer = { x: 640, y: 300, inside: false };

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (event.code === 'Space') {
      // Space starts and restarts from the menus and looses a flare in play; each screen reads
      // only the flag it cares about.
      if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_FLARE;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (FLARE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_FLARE;
    } else {
      const slot = CHOICE_KEYS.indexOf(event.code);
      if (slot >= 0 && !event.repeat) actions |= CHOICES[slot];
      else return;
    }
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
  });

  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    beam = false;
  });

  target.addEventListener('pointerdown', (event) => {
    toField(event.clientX, event.clientY, pointer);
    pointer.inside = true;
    if (event.button === 2) actions |= ACTION_FLARE;
    else if (event.button === 0) {
      beam = true;
      actions |= ACTION_CONFIRM;
    }
    event.preventDefault();
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) beam = false;
  });
  target.addEventListener('pointermove', (event) => {
    toField(event.clientX, event.clientY, pointer);
    pointer.inside = true;
  });
  target.addEventListener('pointerleave', () => {
    pointer.inside = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    direction() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    pointer,
    beam() {
      return beam;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    releaseBeam() {
      beam = false;
    },
  };
}
