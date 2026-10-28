// Candy Grid sound effects and music, built on the same Web Audio helpers as Candy Wall.
import { ctx, tone, noise, sound } from './sound.js';

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5, 1568]; // C major pentatonic
let lastPick = 0;

// --- background music: a gentle chiptune loop (C, Am, F, G at 112 BPM) scheduled a moment ahead of time ---
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const STEP = 60 / 112 / 4; // one sixteenth note
const LEAD = [ // two bars of sixteenth steps; null is a rest
  72, null, 76, null, 79, null, 76, null,  81, null, 79, null, 76, null, 72, null,
  77, null, 81, null, 84, null, 81, null,  83, null, 79, null, 74, null, 71, null,
];
const BASS_ROOTS = [48, 45, 41, 43]; // one per half bar: C, A, F, G
let musicTimer = null, musicNext = 0, musicStep = 0;

function playStep(step, at) {
  if (sound.musicOff) return;
  const d = Math.max(0, at - ctx().currentTime);
  const s = step % LEAD.length;
  if (LEAD[s] != null) tone({ type: 'square', from: midi(LEAD[s]), dur: STEP * 1.6, vol: 0.03, delay: d, music: true });
  if (s % 2 === 0) { // bouncing bass
    const root = BASS_ROOTS[Math.floor(s / 8)];
    tone({ type: 'triangle', from: midi(s % 4 === 0 ? root : root + 12), dur: STEP * 1.8, vol: 0.1, delay: d, music: true });
  }
  if (s % 8 === 0) tone({ type: 'sine', from: 120, to: 45, dur: 0.1, vol: 0.14, delay: d, music: true }); // soft kick
  if (s % 4 === 2) noise({ dur: 0.04, vol: 0.025, hold: 1, delay: d, music: true }); // hat
}

function schedule() {
  const a = ctx();
  if (!a) return;
  while (musicNext < a.currentTime + 0.2) {
    playStep(musicStep++, musicNext);
    musicNext += STEP;
  }
}

export const sfx = {
  unlock: sound.unlock,
  toggleMute: sound.toggleMute,
  get muted() { return sound.muted; },

  // starts or pauses the loop; safe to call every frame
  setMusic(on) {
    if (on === (musicTimer !== null)) return;
    if (!on) { clearInterval(musicTimer); musicTimer = null; return; }
    const a = ctx();
    if (!a) return;
    musicNext = a.currentTime + 0.08;
    musicTimer = setInterval(schedule, 30);
  },

  // picking a piece up: a tiny rising blip
  pick() {
    const now = performance.now();
    if (now - lastPick < 40) return;
    lastPick = now;
    tone({ type: 'square', from: 660, to: 990, dur: 0.05, vol: 0.07 });
  },

  // a piece landing on the grid: a soft thud with a bright tick
  place(size = 4) {
    tone({ type: 'sine', from: 240, to: 90, dur: 0.14, vol: 0.32 });
    tone({ type: 'triangle', from: 480 + size * 40, to: 300, dur: 0.06, vol: 0.1 });
    noise({ dur: 0.05, vol: 0.06, hold: 6, filter: { from: 3000, to: 300 } });
  },

  // dropped somewhere that doesn't fit: a short low buzz
  nope() {
    tone({ type: 'square', from: 220, to: 130, dur: 0.12, vol: 0.09, filter: { from: 2000, to: 300 } });
  },

  // lines cleared: a rising pentatonic run (longer for more lines, higher for a bigger combo) over a crunch
  clear(lines = 1, streak = 0) {
    const shift = Math.pow(2, Math.min(streak, 6) / 12);
    const count = Math.min(PENTA.length, 3 + lines * 2);
    for (let i = 0; i < count; i++)
      tone({ type: 'square', from: PENTA[i] * shift, dur: 0.09, vol: 0.09, delay: i * 0.055 });
    tone({ type: 'triangle', from: PENTA[0] / 2 * shift, dur: 0.35, vol: 0.2 });
    noise({ dur: 0.3, vol: 0.14 + lines * 0.02, hold: 10, filter: { from: 5000, to: 200 } });
    if (lines >= 3) tone({ type: 'square', from: 220, to: 40, dur: 0.35, vol: 0.14, delay: 0.05 });
  },

  // back-to-back clear: two bright pings
  combo(streak = 1) {
    const shift = Math.pow(2, Math.min(streak, 8) / 12);
    tone({ type: 'square', from: 1046.5 * shift, dur: 0.07, vol: 0.08, delay: 0.25 });
    tone({ type: 'square', from: 1568 * shift, dur: 0.14, vol: 0.08, delay: 0.32 });
  },

  // the board is empty: a long fanfare
  perfect() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: i === 6 ? 0.5 : 0.09, vol: 0.1, delay: 0.3 + i * 0.07 }));
    tone({ type: 'triangle', from: 261.63, dur: 0.8, vol: 0.2, delay: 0.3 });
  },

  // fresh pieces slide into the tray
  deal() {
    [440, 554.37, 659.25].forEach((f, i) =>
      tone({ type: 'triangle', from: f, dur: 0.06, vol: 0.09, delay: i * 0.06 }));
  },

  // no piece fits: a slow falling line ending in a low rumble
  gameOver() {
    [392, 370, 349.23, 311.13].forEach((f, i) =>
      tone({ type: 'square', from: f, to: f * 0.97, dur: i === 3 ? 0.6 : 0.2, vol: 0.12, delay: i * 0.22 }));
    tone({ type: 'triangle', from: 98, to: 55, dur: 0.9, vol: 0.25, delay: 0.1 });
    noise({ dur: 0.5, vol: 0.15, hold: 16, filter: { from: 1200, to: 80 }, delay: 0.66 });
  },

  // new best score
  record() {
    [659.25, 783.99, 1318.5, 1046.5, 1174.7, 1568].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: 0.09, vol: 0.1, delay: i * 0.075 }));
  },
};
