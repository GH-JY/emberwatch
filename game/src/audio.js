// Every sound is synthesised here with the Web Audio API: there are no audio files, so the game
// stays a handful of static files. The context is created on the first gesture (browsers refuse
// one before that) and every voice is short-lived and quiet, mixed under one master gain.

const MASTER = 0.5;

export function createAudio() {
  let context = null;
  let master = null;
  let noise = null;
  let beamVoice = null;
  let windGain = null;
  let crackleTimer = 0;
  let enabled = true;

  function makeNoise() {
    const length = context.sampleRate * 1.2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let value = 0;
    for (let index = 0; index < length; index += 1) {
      value = value * 0.98 + (Math.random() * 2 - 1) * 0.02;
      data[index] = value * 6;
    }
    return buffer;
  }

  function startWind() {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    windGain = context.createGain();
    windGain.gain.value = 0.055;
    source.connect(filter).connect(windGain).connect(master);
    source.start();
  }

  function init() {
    if (context || !enabled) return;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) {
      enabled = false;
      return;
    }
    context = new Ctor();
    master = context.createGain();
    master.gain.value = MASTER;
    master.connect(context.destination);
    noise = makeNoise();
    startWind();
    const hum = context.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 88;
    const humFilter = context.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 340;
    beamVoice = context.createGain();
    beamVoice.gain.value = 0;
    hum.connect(humFilter).connect(beamVoice).connect(master);
    hum.start();
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume();
  }

  function tone(type, from, to, duration, volume, delay = 0) {
    if (!context) return;
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function burst(duration, volume, frequency, type = 'lowpass') {
    if (!context) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = 1.4;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  return {
    init,
    resume,
    setBeam(on) {
      if (!context) return;
      const target = on ? 0.05 : 0;
      beamVoice.gain.cancelScheduledValues(context.currentTime);
      beamVoice.gain.setTargetAtTime(target, context.currentTime, 0.06);
    },
    /** Fire crackle, called with the fuel so a low fire goes quiet. */
    fire(fuel, dt) {
      if (!context || fuel <= 0) return;
      crackleTimer -= dt;
      if (crackleTimer > 0) return;
      crackleTimer = 0.12 + Math.random() * 0.5;
      burst(0.06 + Math.random() * 0.08, 0.025 + Math.random() * 0.03, 900 + Math.random() * 1400, 'bandpass');
    },
    play(name) {
      if (!context) return;
      resume();
      if (name === 'pickup') {
        tone('triangle', 660, 990, 0.12, 0.05);
        tone('sine', 990, 1320, 0.1, 0.03, 0.06);
      } else if (name === 'feed') {
        burst(0.28, 0.12, 700);
        tone('sine', 180, 300, 0.2, 0.04);
      } else if (name === 'flare') {
        burst(0.42, 0.16, 2400);
        tone('sine', 210, 54, 0.42, 0.09);
      } else if (name === 'zap') {
        burst(0.07, 0.03, 2600, 'highpass');
      } else if (name === 'banish') {
        burst(0.3, 0.09, 1200);
        tone('sine', 300, 80, 0.3, 0.05);
      } else if (name === 'hurt') {
        tone('square', 150, 60, 0.18, 0.08);
        burst(0.16, 0.07, 500);
      } else if (name === 'night') {
        tone('sine', 196, 196, 1.4, 0.06);
        tone('sine', 294, 294, 1.2, 0.035, 0.05);
      } else if (name === 'dawn') {
        tone('sine', 261, 261, 1.8, 0.06);
        tone('sine', 329, 329, 1.8, 0.045, 0.18);
        tone('sine', 392, 392, 2.0, 0.04, 0.36);
      } else if (name === 'choose') {
        tone('triangle', 520, 780, 0.14, 0.05);
      } else if (name === 'lost') {
        tone('sine', 130, 65, 1.6, 0.07);
        tone('sine', 98, 49, 1.8, 0.05, 0.2);
      }
    },
  };
}
