// Pooled particles: embers off the fire, smoke and sparks off the shades, motes, and the flare's
// ring. One fixed pool is reused for the whole run, so a busy night allocates nothing.

import { WORLD } from './config.js';

export const KIND_EMBER = 0;
export const KIND_SMOKE = 1;
export const KIND_SPARK = 2;
export const KIND_MOTE = 3;

const COLORS = {
  0: ['#ffd9a0', '#ffb066', '#ff8a3d'],
  1: ['rgba(30, 44, 58, 0.5)', 'rgba(18, 28, 38, 0.45)'],
  2: ['#ffe9b8', '#ffc470'],
  3: ['rgba(150, 200, 230, 0.5)', 'rgba(110, 160, 200, 0.35)'],
};

export function createParticles() {
  const pool = [];
  for (let index = 0; index < WORLD.maxParticles; index += 1) {
    pool.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, spin: 0 });
  }
  let cursor = 0;

  function take() {
    for (let index = 0; index < pool.length; index += 1) {
      const particle = pool[(cursor + index) % pool.length];
      if (!particle.active) {
        cursor = (cursor + index + 1) % pool.length;
        return particle;
      }
    }
    return null;
  }

  function spawn(kind, x, y, vx, vy, life, size) {
    const particle = take();
    if (!particle) return;
    particle.active = true;
    particle.kind = kind;
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.life = life;
    particle.maxLife = life;
    particle.size = size;
    particle.spin = Math.random() * Math.PI * 2;
  }

  return {
    pool,
    ember(x, y, power = 1) {
      spawn(KIND_EMBER, x + (Math.random() - 0.5) * 14, y, (Math.random() - 0.5) * 30 * power, -40 - Math.random() * 70 * power, 0.7 + Math.random() * 1.1, 1.2 + Math.random() * 2);
    },
    smoke(x, y, power = 1) {
      spawn(KIND_SMOKE, x + (Math.random() - 0.5) * 12, y, (Math.random() - 0.5) * 26 * power, -14 - Math.random() * 22, 1.1 + Math.random() * 0.9, 6 + Math.random() * 8);
    },
    spark(x, y, angle, speed) {
      spawn(KIND_SPARK, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.25 + Math.random() * 0.35, 1 + Math.random() * 1.6);
    },
    mote(x, y) {
      spawn(KIND_MOTE, x, y, (Math.random() - 0.5) * 8, -6 - Math.random() * 10, 3 + Math.random() * 3, 1 + Math.random() * 1.5);
    },
    update(dt) {
      for (let index = 0; index < pool.length; index += 1) {
        const particle = pool[index];
        if (!particle.active) continue;
        particle.life -= dt;
        if (particle.life <= 0) {
          particle.active = false;
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.kind === KIND_SMOKE) {
          particle.vx *= 1 - 0.8 * dt;
          particle.vy -= 6 * dt;
          particle.size += 9 * dt;
        } else if (particle.kind === KIND_MOTE) {
          particle.vx += Math.sin(particle.spin + particle.life * 2) * 6 * dt;
          particle.spin += dt * 2;
        } else {
          particle.vy += 42 * dt;
          particle.vx *= 1 - 1.4 * dt;
        }
      }
    },
    draw(context) {
      for (let index = 0; index < pool.length; index += 1) {
        const particle = pool[index];
        if (!particle.active) continue;
        const t = particle.life / particle.maxLife;
        const colors = COLORS[particle.kind];
        context.globalAlpha = particle.kind === KIND_SMOKE ? t * 0.55 : Math.min(1, t * 1.4);
        context.fillStyle = colors[t > 0.5 ? 0 : 1];
        if (particle.kind === KIND_SMOKE) {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size * (1.2 - t * 0.3), 0, Math.PI * 2);
          context.fill();
        } else if (particle.kind === KIND_SPARK) {
          context.fillRect(particle.x, particle.y, particle.size, particle.size);
        } else {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size * (0.4 + t * 0.8), 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
    },
  };
}
