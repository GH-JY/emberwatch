// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. Screens:
// title, play, paused, the card choice between nights, defeat and dawn.
//
// ?seed=N fixes the moor and the shade pattern. ?shot=start|play|upgrade|win (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_CLEAR, EVENT_FEED, EVENT_FLARE, EVENT_HURT, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_WIN } from './world.js';
import { ACTION_CHOICE_1, ACTION_CHOICE_2, ACTION_CHOICE_3, ACTION_CONFIRM, ACTION_FLARE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN, cardRects } from './ui.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const IDLE = { move: { x: 0, y: 0 }, aim: null, fire: false, flare: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.toField);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let flareQueued = false;
  let audioStarted = false;

  function announce(message) {
    status.textContent = message;
  }

  function ensureAudio() {
    if (!audioStarted) {
      audio.init();
      audioStarted = true;
    }
    audio.resume();
  }

  function finishRun(nextScreen, message, sound) {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    screen = nextScreen;
    audio.play(sound);
    announce(message);
  }

  function beginRun() {
    world.reset();
    world.beginNight(1);
    screen = SCREEN_PLAY;
    accumulator = 0;
    flareQueued = false;
    announce('Night 1. Keep the signal fire alive.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions === 0) return;

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        ensureAudio();
        beginRun();
      }
      return;
    }

    if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) {
        ensureAudio();
        beginRun();
      }
      return;
    }

    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        flareQueued = false;
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (actions & ACTION_FLARE) {
        flareQueued = true;
      }
      return;
    }

    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Watching.');
      }
      return;
    }

    if (screen === SCREEN_UPGRADE) {
      const offers = world.state.offers;
      if (!offers) return;
      const flags = [ACTION_CHOICE_1, ACTION_CHOICE_2, ACTION_CHOICE_3];
      let index = flags.findIndex((flag) => actions & flag);
      if (index < 0 && actions & ACTION_CONFIRM && input.pointer.inside) {
        const rects = cardRects();
        index = rects.findIndex(
          (rect) =>
            input.pointer.x >= rect.x &&
            input.pointer.x <= rect.x + rect.w &&
            input.pointer.y >= rect.y &&
            input.pointer.y <= rect.y + rect.h,
        );
      }
      if (index >= 0 && offers[index]) {
        const picked = offers[index];
        world.applyUpgrade(picked.id);
        screen = SCREEN_PLAY;
        accumulator = 0;
        audio.play('choose');
        announce(`Night ${world.state.night}. ${picked.name} chosen.`);
      }
    }
  }

  function stepOnce() {
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      world.step(STEP, IDLE);
      return;
    }
    if (screen !== SCREEN_PLAY) return;

    const flare = flareQueued;
    flareQueued = false;
    const state = world.state;
    const events = world.step(STEP, {
      move: input.direction(),
      aim: input.pointer.inside ? { x: input.pointer.x, y: input.pointer.y } : null,
      fire: input.beam(),
      flare,
    });

    if (events & EVENT_HURT) announce(`Hit. ${state.keeper.hearts} hearts left.`);
    if (events & EVENT_PICKUP) audio.play('pickup');
    if (events & EVENT_FEED) audio.play('feed');
    if (events & EVENT_KILL) audio.play('banish');
    if (events & EVENT_FLARE) audio.play('flare');

    if (events & EVENT_OVER) {
      const lost = state.overReason === 'fire' ? 'The fire is out.' : 'The keeper has fallen.';
      finishRun(SCREEN_OVER, `${lost} Score ${state.score}. Best ${best}.`, 'lost');
    } else if (events & EVENT_WIN) {
      finishRun(SCREEN_WIN, `Dawn. Seven nights kept. Score ${state.score}. Best ${best}.`, 'dawn');
    } else if (events & EVENT_CLEAR) {
      screen = SCREEN_UPGRADE;
      audio.play('night');
      announce('Night survived. Choose a gift with 1, 2 or 3.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += delta;
    handleActions();

    if (screen !== SCREEN_PAUSED && screen !== SCREEN_UPGRADE) {
      let substeps = 0;
      while (accumulator >= STEP && substeps < 12) {
        stepOnce();
        accumulator -= STEP;
        substeps += 1;
        if (screen === SCREEN_PAUSED || screen === SCREEN_UPGRADE) {
          accumulator = 0;
          break;
        }
      }
      if (substeps >= 12) accumulator = 0;
    } else {
      accumulator = 0;
    }

    const state = world.state;
    audio.setBeam(screen === SCREEN_PLAY && state.beam.firing);
    audio.fire(state.fuel, delta);
    renderer.draw(state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting shades press an unwatched fire.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberwatch. Press Enter or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
