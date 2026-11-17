// Everything drawn on top of the moor: the HUD, the title card, the three gift cards between
// nights, and the pause, defeat and dawn panels. Layout is in playfield units (1280x720), so the
// same frame works on any window. The screen names live here too, since main and the renderer both
// speak them.

import { FIELD, FONT, FONT_TITLE, NIGHT, PALETTE } from './config.js';
import { carryCapacity, energyCapacity, fuelCapacity } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const PAD = 40;

export function drawText(context, str, x, y, options = {}) {
  const {
    size = 16,
    color = PALETTE.text,
    align = 'left',
    weight = '400',
    family = FONT,
    alpha = 1,
    baseline = 'alphabetic',
    shadow = 0,
    shadowColor = PALETTE.accent,
  } = options;
  context.save();
  context.globalAlpha *= alpha;
  context.fillStyle = color;
  context.font = `${weight} ${size}px ${family}`;
  context.textAlign = align;
  context.textBaseline = baseline;
  if (shadow > 0) {
    context.shadowColor = shadowColor;
    context.shadowBlur = shadow;
  }
  context.fillText(str, x, y);
  context.restore();
}

export function drawPanel(context, x, y, w, h, options = {}) {
  const { radius = 16, fill = PALETTE.panel, edge = PALETTE.panelEdge, lineWidth = 1 } = options;
  context.save();
  context.beginPath();
  context.roundRect(x, y, w, h, radius);
  context.fillStyle = fill;
  context.fill();
  if (edge) {
    context.strokeStyle = edge;
    context.lineWidth = lineWidth;
    context.stroke();
  }
  context.restore();
}

function wrap(context, str, maxWidth) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function flame(context, x, y, size, color, alpha = 1) {
  context.save();
  context.globalAlpha *= alpha;
  context.beginPath();
  context.moveTo(x, y - size);
  context.bezierCurveTo(x + size * 0.72, y - size * 0.28, x + size * 0.58, y + size * 0.85, x, y + size * 0.85);
  context.bezierCurveTo(x - size * 0.58, y + size * 0.85, x - size * 0.72, y - size * 0.28, x, y - size);
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function log(context, x, y, scale, alpha) {
  context.save();
  context.globalAlpha *= alpha;
  context.translate(x, y);
  context.rotate(-0.35);
  context.beginPath();
  context.roundRect(-11 * scale, -3.5 * scale, 22 * scale, 7 * scale, 3 * scale);
  context.fillStyle = PALETTE.wood;
  context.fill();
  context.beginPath();
  context.arc(11 * scale, 0, 3.5 * scale, 0, Math.PI * 2);
  context.fillStyle = PALETTE.woodLight;
  context.fill();
  context.restore();
}

function bar(context, x, y, w, h, ratio, color, options = {}) {
  const { track = 'rgba(120, 150, 180, 0.16)', radius = h / 2 } = options;
  context.save();
  context.beginPath();
  context.roundRect(x, y, w, h, radius);
  context.fillStyle = track;
  context.fill();
  if (ratio > 0) {
    context.beginPath();
    context.roundRect(x, y, Math.max(h, w * Math.min(1, ratio)), h, radius);
    context.fillStyle = color;
    context.fill();
  }
  context.restore();
}

export function drawHUD(context, state) {
  const keeper = state.keeper;
  const fuelCap = fuelCapacity(state);
  const energyCap = energyCapacity(state);
  const right = FIELD.width - PAD;

  // Night, score, and the tally of what the keeper has put down.
  drawText(context, `NIGHT ${state.night} / ${NIGHT.total}`, PAD, 42, { size: 13, color: PALETTE.muted, weight: '600' });
  drawText(context, String(state.score), PAD, 82, { size: 34, color: PALETTE.text, family: FONT_TITLE });
  drawText(context, `BANISHED ${state.stats.banished}`, PAD + 4, 104, { size: 11, color: PALETTE.dim, weight: '600' });

  // The night's clock across the top, quiet enough to ignore.
  const progress = Math.min(1, state.nightTime / NIGHT.seconds);
  bar(context, FIELD.width / 2 - 160, 28, 320, 4, progress, 'rgba(255, 180, 84, 0.55)');

  // Hearts as little lantern flames, five slots so a mended run has somewhere to go.
  for (let index = 0; index < 5; index += 1) {
    const x = right - 16 - index * 28;
    const lit = index < keeper.hearts;
    flame(context, x, 44, 10, lit ? PALETTE.fireMid : 'rgba(120, 150, 180, 0.22)', lit ? 1 : 1);
  }

  // Lantern charge under them.
  const energyRatio = state.beam.energy / energyCap;
  drawText(context, 'LANTERN', right, 66, { size: 10, color: PALETTE.dim, align: 'right', weight: '600' });
  bar(context, right - 168, 74, 168, 7, energyRatio, energyRatio > 0.2 ? PALETTE.gold : PALETTE.danger);

  // Fuel and what is being carried, along the bottom.
  const fuelRatio = state.fuel / fuelCap;
  drawText(context, 'FIRE', PAD, FIELD.height - 74, { size: 10, color: PALETTE.dim, weight: '600' });
  const fuelColor = fuelRatio < 0.2 ? PALETTE.danger : fuelRatio < 0.4 ? PALETTE.accent : PALETTE.fireMid;
  bar(context, PAD, FIELD.height - 62, 240, 16, fuelRatio, fuelColor);
  drawText(context, `${Math.round(state.fuel)} / ${fuelCap}`, PAD + 250, FIELD.height - 49, { size: 12, color: PALETTE.muted });

  const capacity = carryCapacity(state);
  drawText(context, 'LOGS', right, FIELD.height - 76, { size: 10, color: PALETTE.dim, align: 'right', weight: '600' });
  for (let index = 0; index < capacity; index += 1) {
    const x = right - 14 - index * 22;
    log(context, x, FIELD.height - 54, 0.8, index < keeper.carry ? 1 : 0.2);
  }
  drawText(context, `${keeper.carry} / ${capacity}`, right, FIELD.height - 34, { size: 11, color: PALETTE.muted, align: 'right' });

  // Warnings, only when they matter.
  if (fuelRatio < 0.22) {
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 7);
    drawText(context, 'FEED THE FIRE', FIELD.width / 2, FIELD.height - 104, {
      size: 21,
      color: PALETTE.danger,
      align: 'center',
      weight: '700',
      alpha: pulse,
    });
  } else if (keeper.carry === 0 && fuelRatio < 0.55) {
    drawText(context, 'GATHER WOOD', FIELD.width / 2, FIELD.height - 104, { size: 16, color: PALETTE.muted, align: 'center', weight: '600', alpha: 0.8 });
  }

  // The night banner, fading in and out over the first seconds.
  if (state.banner) {
    const shown = NIGHT.banner - state.banner.time;
    const fade = Math.min(1, shown / 0.35) * Math.min(1, state.banner.time / 0.6);
    drawText(context, state.banner.title, FIELD.width / 2, 206, {
      size: 52,
      color: PALETTE.text,
      align: 'center',
      family: FONT_TITLE,
      alpha: fade,
      shadow: 18,
      shadowColor: 'rgba(255, 150, 60, 0.35)',
    });
    drawText(context, state.banner.sub, FIELD.width / 2, 238, { size: 15, color: PALETTE.muted, align: 'center', alpha: fade, weight: '600' });
  }
}

export function drawTitle(context, state) {
  context.save();
  context.fillStyle = 'rgba(3, 5, 10, 0.52)';
  context.fillRect(0, 0, FIELD.width, FIELD.height);
  context.restore();

  drawText(context, 'EMBERWATCH', FIELD.width / 2, 246, {
    size: 92,
    color: PALETTE.gold,
    align: 'center',
    family: FONT_TITLE,
    shadow: 34,
    shadowColor: 'rgba(255, 150, 60, 0.5)',
  });
  drawText(context, 'Keep the signal fire alive until dawn.', FIELD.width / 2, 292, { size: 20, color: PALETTE.text, align: 'center' });

  const lines = [
    'WASD or arrows — walk the moor, gather wood, carry it back',
    'Mouse aims · hold the left button — lantern beam · Space, F or right-click — flare',
    'Seven nights. Three hearts. One fire. P to pause.',
  ];
  lines.forEach((line, index) => {
    drawText(context, line, FIELD.width / 2, 404 + index * 30, { size: 15, color: PALETTE.muted, align: 'center' });
  });

  const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
  drawText(context, 'PRESS ENTER OR CLICK TO BEGIN', FIELD.width / 2, 590, {
    size: 18,
    color: PALETTE.accent,
    align: 'center',
    weight: '700',
    alpha: pulse,
  });

  context.save();
  context.fillStyle = PALETTE.dim;
  context.font = `11px ${FONT}`;
  context.textAlign = 'center';
  context.fillText('an emberwatch on the north moor', FIELD.width / 2, 640);
  context.restore();
}

export function cardRects() {
  const width = 300;
  const height = 252;
  const gap = 28;
  const left = (FIELD.width - (width * 3 + gap * 2)) / 2;
  const top = 222;
  return [0, 1, 2].map((index) => ({ x: left + index * (width + gap), y: top, w: width, h: height }));
}

export function drawUpgrade(context, state) {
  context.save();
  context.fillStyle = 'rgba(3, 5, 10, 0.74)';
  context.fillRect(0, 0, FIELD.width, FIELD.height);
  context.restore();

  drawText(context, 'DAWN', FIELD.width / 2, 108, {
    size: 52,
    color: PALETTE.gold,
    align: 'center',
    family: FONT_TITLE,
    shadow: 26,
    shadowColor: 'rgba(255, 150, 60, 0.4)',
  });
  drawText(context, `Night ${state.night} is survived. Choose one gift for the nights ahead.`, FIELD.width / 2, 148, {
    size: 16,
    color: PALETTE.muted,
    align: 'center',
  });
  drawText(context, `SCORE ${state.score}  ·  ${state.stats.banished} BANISHED  ·  ${state.keeper.hearts} HEARTS`, FIELD.width / 2, 176, {
    size: 12,
    color: PALETTE.dim,
    align: 'center',
    weight: '600',
  });

  const rects = cardRects();
  const offers = state.offers ?? [];
  offers.forEach((card, index) => {
    const rect = rects[index];
    if (!rect) return;
    drawPanel(context, rect.x, rect.y, rect.w, rect.h, { radius: 18, fill: 'rgba(9, 15, 23, 0.95)', edge: 'rgba(255, 180, 84, 0.22)' });

    context.save();
    context.beginPath();
    context.arc(rect.x + 30, rect.y + 30, 13, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(255, 180, 84, 0.45)';
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
    drawText(context, String(index + 1), rect.x + 30, rect.y + 35, { size: 13, color: PALETTE.accent, align: 'center', weight: '700' });

    drawText(context, card.name, rect.x + rect.w / 2, rect.y + 78, { size: 24, color: PALETTE.accent, align: 'center', family: FONT_TITLE });
    context.save();
    context.beginPath();
    context.moveTo(rect.x + 40, rect.y + 98);
    context.lineTo(rect.x + rect.w - 40, rect.y + 98);
    context.strokeStyle = 'rgba(140, 180, 220, 0.16)';
    context.stroke();
    context.restore();

    context.save();
    context.font = `15px ${FONT}`;
    const lines = wrap(context, card.blurb, rect.w - 52);
    context.restore();
    lines.forEach((line, lineIndex) => {
      drawText(context, line, rect.x + rect.w / 2, rect.y + 136 + lineIndex * 23, { size: 15, color: PALETTE.muted, align: 'center' });
    });

    drawText(context, `PRESS ${index + 1}`, rect.x + rect.w / 2, rect.y + rect.h - 22, { size: 11, color: PALETTE.dim, align: 'center', weight: '600' });
  });
}

export function drawPause(context, state) {
  context.save();
  context.fillStyle = 'rgba(3, 5, 10, 0.6)';
  context.fillRect(0, 0, FIELD.width, FIELD.height);
  context.restore();

  drawPanel(context, FIELD.width / 2 - 260, 268, 520, 184, { radius: 20 });
  drawText(context, 'PAUSED', FIELD.width / 2, 330, { size: 44, color: PALETTE.text, align: 'center', family: FONT_TITLE });
  drawText(context, 'Press P or Enter to keep the watch.', FIELD.width / 2, 370, { size: 15, color: PALETTE.muted, align: 'center' });
  drawText(context, `NIGHT ${state.night} · SCORE ${state.score}`, FIELD.width / 2, 410, { size: 13, color: PALETTE.dim, align: 'center', weight: '600' });
}

export function drawOver(context, state, best) {
  context.save();
  context.fillStyle = 'rgba(3, 4, 8, 0.68)';
  context.fillRect(0, 0, FIELD.width, FIELD.height);
  context.restore();

  const width = 620;
  const height = 372;
  const x = (FIELD.width - width) / 2;
  const y = 168;
  drawPanel(context, x, y, width, height, { radius: 22 });

  const fireOut = state.overReason === 'fire';
  drawText(context, fireOut ? 'THE FIRE IS OUT' : 'THE KEEPER HAS FALLEN', FIELD.width / 2, y + 84, {
    size: 42,
    color: PALETTE.danger,
    align: 'center',
    family: FONT_TITLE,
  });
  drawText(context, fireOut ? 'The dark closes over the moor.' : 'There is no one left to tend the flame.', FIELD.width / 2, y + 118, {
    size: 16,
    color: PALETTE.muted,
    align: 'center',
  });

  const rows = [
    ['NIGHT REACHED', `${Math.min(state.night, NIGHT.total)} OF ${NIGHT.total}`],
    ['SHADES BANISHED', String(state.stats.banished)],
    ['WOOD FED', String(state.stats.fed)],
    ['SCORE', String(state.score)],
    ['BEST', String(Math.max(best, state.score))],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = y + 170 + index * 30;
    drawText(context, label, x + 90, rowY, { size: 12, color: PALETTE.dim, weight: '600' });
    drawText(context, value, x + width - 90, rowY, { size: 15, color: PALETTE.text, align: 'right', weight: '600' });
  });

  const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
  drawText(context, 'PRESS ENTER TO WATCH AGAIN', FIELD.width / 2, y + height - 30, {
    size: 14,
    color: PALETTE.accent,
    align: 'center',
    weight: '700',
    alpha: pulse,
  });
}

export function drawWin(context, state, best) {
  context.save();
  context.fillStyle = 'rgba(12, 9, 14, 0.52)';
  context.fillRect(0, 0, FIELD.width, FIELD.height);
  context.restore();

  const width = 660;
  const height = 392;
  const x = (FIELD.width - width) / 2;
  const y = 160;
  drawPanel(context, x, y, width, height, { radius: 22, fill: 'rgba(14, 12, 16, 0.9)', edge: 'rgba(255, 212, 121, 0.28)' });

  drawText(context, 'DAWN', FIELD.width / 2, y + 108, {
    size: 78,
    color: PALETTE.gold,
    align: 'center',
    family: FONT_TITLE,
    shadow: 30,
    shadowColor: 'rgba(255, 170, 80, 0.55)',
  });
  drawText(context, 'Seven nights kept. The signal fire holds.', FIELD.width / 2, y + 150, { size: 18, color: PALETTE.text, align: 'center' });

  const rows = [
    ['SHADES BANISHED', String(state.stats.banished)],
    ['WOOD FED', String(state.stats.fed)],
    ['HEARTS LEFT', String(state.keeper.hearts)],
    ['SCORE', String(state.score)],
    ['BEST', String(Math.max(best, state.score))],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = y + 200 + index * 28;
    drawText(context, label, x + 110, rowY, { size: 12, color: PALETTE.dim, weight: '600' });
    drawText(context, value, x + width - 110, rowY, { size: 15, color: PALETTE.text, align: 'right', weight: '600' });
  });

  const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.0);
  drawText(context, 'PRESS ENTER TO WATCH AGAIN', FIELD.width / 2, y + height - 28, {
    size: 14,
    color: PALETTE.accent,
    align: 'center',
    weight: '700',
    alpha: pulse,
  });
}
