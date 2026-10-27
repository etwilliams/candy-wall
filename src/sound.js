// Synthesized sound effects (Web Audio), so there are no audio files to load.
let ac = null;
let muted = false;
let lastBrick = 0;
let lastPop = 0;

export function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

// one oscillator with a quick attack and exponential decay; freq can sweep from -> to
export function tone({ type = 'sine', from, to = from, dur = 0.12, vol = 0.2, delay = 0, filter }) {
  const a = ctx();
  if (!a || muted) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = osc;
  if (filter) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filter.from, t);
    f.frequency.exponentialRampToValueAtTime(filter.to, t + dur);
    osc.connect(f);
    out = f;
  }
  out.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// lo-fi noise: each random sample is held for `hold` samples, which gives the crunchy 8-bit rumble
export function noise({ dur = 0.3, vol = 0.25, hold = 12, filter, delay = 0 }) {
  const a = ctx();
  if (!a || muted) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += hold) {
    const v = Math.random() * 2 - 1;
    for (let j = 0; j < hold && i + j < len; j++) data[i + j] = v;
  }
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = buf;
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = src;
  if (filter) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filter.from, t);
    f.frequency.exponentialRampToValueAtTime(filter.to, t + dur);
    src.connect(f);
    out = f;
  }
  out.connect(gain).connect(a.destination);
  src.start(t);
}

// --- background music: a small chiptune loop (A minor, 128 BPM) scheduled a moment ahead of time ---
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const STEP = 60 / 128 / 4; // one sixteenth note
const LEAD = [ // two bars of sixteenth steps; null is a rest
  69, null, 72, null, 76, null, 72, null,  69, null, 72, null, 79, null, 76, null,
  77, null, 74, null, 77, null, 81, null,  76, null, 72, null, 71, null, 69, null,
];
const BASS_ROOTS = [45, 45, 41, 43]; // one per half bar: A, A, F, G
let musicTimer = null, musicNext = 0, musicStep = 0;

function playStep(step, at) {
  const a = ctx();
  const d = Math.max(0, at - a.currentTime);
  const s = step % LEAD.length;
  if (LEAD[s] != null) tone({ type: 'square', from: midi(LEAD[s]), dur: STEP * 1.6, vol: 0.035, delay: d });
  if (s % 2 === 0) { // bouncing bass: root, octave, root, octave...
    const root = BASS_ROOTS[Math.floor(s / 8)];
    tone({ type: 'triangle', from: midi(s % 4 === 0 ? root : root + 12), dur: STEP * 1.8, vol: 0.11, delay: d });
  }
  if (s % 4 === 0) tone({ type: 'sine', from: 130, to: 45, dur: 0.1, vol: 0.2, delay: d }); // kick
  if (s % 4 === 2) noise({ dur: 0.04, vol: 0.03, hold: 1, delay: d }); // hat
}

function schedule() {
  const a = ctx();
  if (!a) return;
  while (musicNext < a.currentTime + 0.2) {
    playStep(musicStep++, musicNext);
    musicNext += STEP;
  }
}

export const sound = {
  // starts or pauses the loop; safe to call every frame
  setMusic(on) {
    if (on === (musicTimer !== null)) return;
    if (!on) { clearInterval(musicTimer); musicTimer = null; return; }
    const a = ctx();
    if (!a) return;
    musicNext = a.currentTime + 0.08;
    musicTimer = setInterval(schedule, 30);
  },

  // new level: a quick rising fanfare
  levelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: i === 3 ? 0.3 : 0.08, vol: 0.1, delay: i * 0.08 }));
    tone({ type: 'triangle', from: 261.63, dur: 0.4, vol: 0.18 });
  },

  // lost the ball: a quick falling 'wah-wah' with a low thud
  loseLife() {
    tone({ type: 'square', from: 520, to: 130, dur: 0.45, vol: 0.13, filter: { from: 3000, to: 500 } });
    [0, 0.12, 0.24].forEach(d => tone({ type: 'square', from: 340 - d * 500, dur: 0.1, vol: 0.06, delay: d + 0.05 }));
    tone({ type: 'sine', from: 120, to: 40, dur: 0.3, vol: 0.3, delay: 0.1 });
  },

  // game over: a slow falling line ending in a low rumble
  gameOver() {
    [392, 370, 349.23, 311.13].forEach((f, i) =>
      tone({ type: 'square', from: f, to: f * 0.97, dur: i === 3 ? 0.6 : 0.2, vol: 0.12, delay: i * 0.22 }));
    tone({ type: 'triangle', from: 98, to: 55, dur: 0.9, vol: 0.25, delay: 0.1 });
    noise({ dur: 0.5, vol: 0.15, hold: 16, filter: { from: 1200, to: 80 }, delay: 0.66 });
  },

  // call from a user gesture so the browser allows audio
  unlock() { ctx(); },
  toggleMute() { muted = !muted; return muted; },
  get muted() { return muted; },

  // a brick landing: a soft bubbly pop, pitched randomly so a cascade sounds lively
  pop() {
    const now = performance.now();
    if (now - lastPop < 30) return; // dozens can land within a few frames
    lastPop = now;
    const f = 350 + Math.random() * 450;
    tone({ type: 'sine', from: f * 1.8, to: f * 0.7, dur: 0.07, vol: 0.12 });
  },

  // higher rows (row 0 is the top) ring higher
  brick(row = 0, rows = 7) {
    const now = performance.now();
    if (now - lastBrick < 25) return; // a fireball can break several at once
    lastBrick = now;
    const f = 520 + (rows - 1 - row) * 70;
    tone({ type: 'square', from: f, to: f * 1.5, dur: 0.09, vol: 0.09 });
    tone({ type: 'triangle', from: f / 2, dur: 0.12, vol: 0.12 });
  },

  // rocket blast: crunchy noise burst over a falling square 'boom'; the small one is for a brick that survives
  explode(big = true) {
    if (big) {
      noise({ dur: 0.45, vol: 0.32, hold: 14, filter: { from: 4000, to: 150 } });
      tone({ type: 'square', from: 220, to: 35, dur: 0.4, vol: 0.2 });
      tone({ type: 'square', from: 880, to: 100, dur: 0.12, vol: 0.08 });
    } else {
      noise({ dur: 0.2, vol: 0.22, hold: 8, filter: { from: 3000, to: 300 } });
      tone({ type: 'square', from: 300, to: 80, dur: 0.15, vol: 0.14 });
    }
  },

  // dull crack when a tough brick takes its first hit
  crack() {
    tone({ type: 'sawtooth', from: 320, to: 70, dur: 0.1, vol: 0.14, filter: { from: 3000, to: 300 } });
    tone({ type: 'square', from: 1400, to: 500, dur: 0.04, vol: 0.06 });
  },

  paddle() {
    tone({ type: 'sine', from: 260, to: 110, dur: 0.12, vol: 0.3 });
    tone({ type: 'triangle', from: 520, to: 300, dur: 0.05, vol: 0.1 });
  },

  // punched hit / launch: rising whoosh with a heavy thump
  boost() {
    tone({ type: 'sawtooth', from: 180, to: 1100, dur: 0.28, vol: 0.14, filter: { from: 400, to: 5000 } });
    tone({ type: 'sine', from: 150, to: 50, dur: 0.2, vol: 0.4 });
    tone({ type: 'square', from: 900, to: 1800, dur: 0.1, vol: 0.05, delay: 0.05 });
  },

  // one sound per power-up / power-down, named after its type in main.js

  // three quick rising pops
  split() {
    [500, 700, 950].forEach((f, i) =>
      tone({ type: 'square', from: f, to: f * 1.3, dur: 0.07, vol: 0.1, delay: i * 0.06 }));
    tone({ type: 'triangle', from: 250, to: 500, dur: 0.2, vol: 0.12 });
  },

  // swelling boing, like something inflating
  big() {
    tone({ type: 'sine', from: 160, to: 520, dur: 0.32, vol: 0.3 });
    tone({ type: 'triangle', from: 320, to: 1040, dur: 0.32, vol: 0.1 });
    tone({ type: 'sine', from: 520, to: 380, dur: 0.12, vol: 0.2, delay: 0.32 });
  },

  // two tones stretching apart
  wide() {
    tone({ type: 'triangle', from: 440, to: 220, dur: 0.28, vol: 0.2 });
    tone({ type: 'triangle', from: 440, to: 880, dur: 0.28, vol: 0.2 });
    tone({ type: 'square', from: 880, dur: 0.06, vol: 0.06, delay: 0.28 });
  },

  // ignition whoosh with a few crackles
  fire() {
    tone({ type: 'sawtooth', from: 90, to: 500, dur: 0.4, vol: 0.18, filter: { from: 300, to: 4000 } });
    for (let i = 0; i < 5; i++)
      tone({ type: 'square', from: 700 + Math.random() * 1800, to: 300, dur: 0.03, vol: 0.07, delay: 0.05 + i * 0.07 });
  },

  // arming: ratcheting clicks, then a low clunk
  missile() {
    [600, 750, 900, 1100].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: 0.04, vol: 0.09, delay: i * 0.05 }));
    tone({ type: 'sine', from: 140, to: 70, dur: 0.15, vol: 0.3, delay: 0.22 });
  },

  // firing a missile: a short rising hiss
  shoot() {
    tone({ type: 'sawtooth', from: 220, to: 1000, dur: 0.15, vol: 0.1, filter: { from: 600, to: 5000 } });
    tone({ type: 'square', from: 120, to: 60, dur: 0.08, vol: 0.12 });
  },

  // slow ball: a low wobbling drop, like a record winding down
  slow() {
    tone({ type: 'triangle', from: 600, to: 150, dur: 0.5, vol: 0.2 });
    tone({ type: 'square', from: 300, to: 75, dur: 0.5, vol: 0.06, delay: 0.04 });
  },

  // fast ball (power-down): a rising siren zip
  fast() {
    tone({ type: 'sawtooth', from: 200, to: 1800, dur: 0.22, vol: 0.14, filter: { from: 800, to: 6000 } });
    tone({ type: 'square', from: 1800, to: 300, dur: 0.12, vol: 0.08, delay: 0.22 });
    tone({ type: 'square', from: 120, dur: 0.08, vol: 0.12, delay: 0.3 });
  },

  // extra life: the classic rising 1-up run
  life() {
    [659.25, 783.99, 1318.5, 1046.5, 1174.7, 1568].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: 0.09, vol: 0.1, delay: i * 0.075 }));
  },

  // sticky paddle powered up: a gooey squelch
  sticky() {
    tone({ type: 'square', from: 180, to: 520, dur: 0.12, vol: 0.12 });
    tone({ type: 'square', from: 520, to: 140, dur: 0.18, vol: 0.12, delay: 0.12 });
    tone({ type: 'sine', from: 90, dur: 0.1, vol: 0.2, delay: 0.3 });
  },

  // the ball sticking to the paddle
  stick() {
    tone({ type: 'square', from: 400, to: 160, dur: 0.07, vol: 0.12 });
    tone({ type: 'sine', from: 100, to: 60, dur: 0.1, vol: 0.2 });
  },

  // shield up: a shimmering hum
  shield() {
    tone({ type: 'triangle', from: 220, to: 440, dur: 0.35, vol: 0.18 });
    [880, 1109, 1319, 1760].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: 0.06, vol: 0.05, delay: 0.1 + i * 0.06 }));
  },

  // the shield saving the ball: a glassy zap
  shieldHit() {
    tone({ type: 'square', from: 1800, to: 300, dur: 0.25, vol: 0.12 });
    noise({ dur: 0.3, vol: 0.2, hold: 4, filter: { from: 6000, to: 400 } });
    tone({ type: 'sine', from: 140, to: 60, dur: 0.2, vol: 0.25 });
  },

  // power-down: two tones squeezed together, ending in a low buzz
  narrow() {
    tone({ type: 'sawtooth', from: 700, to: 250, dur: 0.3, vol: 0.12, filter: { from: 3000, to: 400 } });
    tone({ type: 'sawtooth', from: 150, to: 250, dur: 0.3, vol: 0.12, filter: { from: 3000, to: 400 } });
    tone({ type: 'square', from: 110, to: 80, dur: 0.18, vol: 0.14, delay: 0.3 });
  },
};
