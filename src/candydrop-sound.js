// Candy Drop sound effects and music, built on the same Web Audio helpers as the other games.
import { ctx, tone, noise, sound } from './sound.js';

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5, 1568]; // C major pentatonic
let lastMove = 0;

// --- background music: an upbeat chiptune loop (Dm, Bb, F, C at 132 BPM) scheduled a moment ahead of time ---
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const STEP = 60 / 132 / 4; // one sixteenth note
const LEAD = [ // two bars of sixteenth steps; null is a rest
  74, null, 77, null, 81, null, 77, null,  74, null, 77, null, 82, null, 77, null,
  77, null, 81, null, 84, null, 81, null,  79, null, 76, null, 72, null, 76, null,
];
const BASS_ROOTS = [38, 46, 41, 48]; // one per half bar: D, Bb, F, C
let musicTimer = null, musicNext = 0, musicStep = 0;

function playStep(step, at) {
  if (sound.musicOff) return;
  const d = Math.max(0, at - ctx().currentTime);
  const s = step % LEAD.length;
  if (LEAD[s] != null) tone({ type: 'square', from: midi(LEAD[s]), dur: STEP * 1.6, vol: 0.03, delay: d, music: true });
  if (s % 2 === 0) { // bouncing bass: root, octave, root, octave...
    const root = BASS_ROOTS[Math.floor(s / 8)];
    tone({ type: 'triangle', from: midi(s % 4 === 0 ? root : root + 12), dur: STEP * 1.8, vol: 0.1, delay: d, music: true });
  }
  if (s % 4 === 0) tone({ type: 'sine', from: 125, to: 45, dur: 0.1, vol: 0.17, delay: d, music: true }); // kick
  if (s % 4 === 2) noise({ dur: 0.04, vol: 0.028, hold: 1, delay: d, music: true }); // hat
  if (s % 8 === 4) noise({ dur: 0.09, vol: 0.05, hold: 5, filter: { from: 3500, to: 800 }, delay: d, music: true }); // snare
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

  // sliding sideways: a quiet tick
  move() {
    const now = performance.now();
    if (now - lastMove < 25) return;
    lastMove = now;
    tone({ type: 'square', from: 300, to: 260, dur: 0.025, vol: 0.04 });
  },

  rotate() { tone({ type: 'square', from: 520, to: 780, dur: 0.05, vol: 0.07 }); },

  // swapping with the hold box: a quick swoosh
  hold() {
    tone({ type: 'triangle', from: 300, to: 900, dur: 0.12, vol: 0.14 });
    tone({ type: 'square', from: 900, to: 450, dur: 0.08, vol: 0.05, delay: 0.1 });
  },

  // a piece settling: a soft thud
  lock() {
    tone({ type: 'sine', from: 200, to: 80, dur: 0.1, vol: 0.28 });
    noise({ dur: 0.04, vol: 0.05, hold: 6, filter: { from: 2500, to: 300 } });
  },

  // hard drop: a falling zip into a heavier thud
  hardDrop() {
    tone({ type: 'sawtooth', from: 1200, to: 200, dur: 0.08, vol: 0.08, filter: { from: 5000, to: 600 } });
    tone({ type: 'sine', from: 180, to: 50, dur: 0.2, vol: 0.4, delay: 0.05 });
    noise({ dur: 0.12, vol: 0.12, hold: 8, filter: { from: 3000, to: 200 }, delay: 0.05 });
  },

  // lines cleared: a rising pentatonic run over a crunch (longer for more lines)
  clear(lines = 1) {
    const count = Math.min(PENTA.length, 2 + lines * 2);
    for (let i = 0; i < count; i++)
      tone({ type: 'square', from: PENTA[i], dur: 0.09, vol: 0.09, delay: i * 0.05 });
    tone({ type: 'triangle', from: PENTA[0] / 2, dur: 0.35, vol: 0.2 });
    noise({ dur: 0.3, vol: 0.12 + lines * 0.02, hold: 10, filter: { from: 5000, to: 200 } });
    if (lines >= 4) { // four at once: a big fanfare on top
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone({ type: 'square', from: f, dur: i === 3 ? 0.4 : 0.08, vol: 0.09, delay: 0.3 + i * 0.07 }));
      tone({ type: 'square', from: 220, to: 40, dur: 0.4, vol: 0.14, delay: 0.05 });
    }
  },

  // new level: a quick rising fanfare
  levelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: i === 3 ? 0.3 : 0.08, vol: 0.1, delay: 0.35 + i * 0.08 }));
    tone({ type: 'triangle', from: 261.63, dur: 0.4, vol: 0.18, delay: 0.35 });
  },

  // stack hit the top: a slow falling line ending in a low rumble
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
