// Emberwatch: a seven-night survival game for best-game-01. The keeper of a signal fire walks out
// into the dark for wood, carries it back and feeds the fire before it burns down, and holds the
// shades off with a mouse-aimed lantern beam and a flare. Lose all three hearts or let the fire die
// and the watch ends; keep it lit for seven nights and the sun comes up. Each dawn offers a gift
// that changes the run, and the game remembers your best score between visits.
//
// The game is this directory's game/ folder: plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request), drawn to a fixed
// 1280x720 canvas at a fixed 60 Hz step with synthesized WebAudio. There are no images or audio
// files; the scenery, the shades, the flames and every sound are generated in code from a seeded
// random stream, so ?seed=... and ?shot=start|play|upgrade|win stage the same frame again and again
// (those are the queries the four screenshots in screenshots/ were taken from).
//
// This program copies game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080 (pass --port to change).
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
