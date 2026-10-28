// Candy Pop sound effects and music, built on the same Web Audio helpers as Candy Wall.
import { ctx, tone, noise, sound } from './sound.js';

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5, 1568]; // C major pentatonic
let lastPick = 0, lastLand = 0;

// --- background music: a bouncy chiptune loop (D, A, Bm, G at 120 BPM) scheduled a moment ahead of time ---
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const STEP = 60 / 120 / 4; // one sixteenth note
const LEAD = [ // four chords of eight sixteenth steps; null is a rest
  74, null, 78, null, 81, null, 78, 81,  73, null, 76, null, 81, null, 76, 73,
  74, null, 78, null, 83, null, 78, 83,  74, null, 79, null, 83, null, 79, 86,
];
const BASS_ROOTS = [50, 45, 47, 43]; // one per eight steps: D, A, B, G
let musicTimer = null, musicNext = 0, musicStep = 0;
let musicOff = false; // the music has its own mute; sound effects are unaffected

function playStep(step, at) {
  if (musicOff) return;
  const d = Math.max(0, at - ctx().currentTime);
  const s = step % LEAD.length;
  if (LEAD[s] != null) tone({ type: 'square', from: midi(LEAD[s]), dur: STEP * 1.5, vol: 0.03, delay: d });
  if (s % 2 === 0) { // bouncing bass
    const root = BASS_ROOTS[Math.floor(s / 8)];
    tone({ type: 'triangle', from: midi(s % 4 === 0 ? root : root + 12), dur: STEP * 1.8, vol: 0.1, delay: d });
  }
  if (s % 8 === 0 || s % 8 === 5) tone({ type: 'sine', from: 120, to: 45, dur: 0.1, vol: 0.14, delay: d }); // kick
  if (s % 4 === 2) noise({ dur: 0.04, vol: 0.025, hold: 1, delay: d }); // hat
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

  get musicOff() { return musicOff; },
  toggleMusic() { musicOff = !musicOff; return musicOff; },

  // starts or pauses the loop; safe to call every frame
  setMusic(on) {
    if (on === (musicTimer !== null)) return;
    if (!on) { clearInterval(musicTimer); musicTimer = null; return; }
    const a = ctx();
    if (!a) return;
    musicNext = a.currentTime + 0.08;
    musicTimer = setInterval(schedule, 30);
  },

  // selecting a candy: a tiny rising blip
  pick() {
    const now = performance.now();
    if (now - lastPick < 40) return;
    lastPick = now;
    tone({ type: 'square', from: 660, to: 990, dur: 0.05, vol: 0.07 });
  },

  // two candies trading places
  swap() {
    tone({ type: 'triangle', from: 330, to: 520, dur: 0.09, vol: 0.14 });
  },

  // a candy landing in the opening drop: a soft pop, only once audio is running so nothing queues up before the first tap
  land() {
    const a = ctx(), now = performance.now();
    if (!a || a.state !== 'running' || now - lastLand < 25) return;
    lastLand = now;
    tone({ type: 'sine', from: 380 + Math.random() * 160, to: 160, dur: 0.07, vol: 0.09 });
  },

  // a swap that makes no match: a short low buzz
  nope() {
    tone({ type: 'square', from: 220, to: 130, dur: 0.12, vol: 0.09, filter: { from: 2000, to: 300 } });
  },

  // candies popping: climbs the pentatonic scale with every cascade, longer for bigger clears
  match(combo = 1, count = 3) {
    const base = Math.min(combo - 1, PENTA.length - 3);
    const notes = Math.min(4, 1 + Math.floor(count / 3));
    for (let i = 0; i < notes; i++)
      tone({ type: 'square', from: PENTA[base + Math.min(i, 2)] * (i > 2 ? 2 : 1), dur: 0.09, vol: 0.1, delay: i * 0.05 });
    tone({ type: 'sine', from: 300, to: 100, dur: 0.12, vol: 0.2 });
    noise({ dur: 0.12, vol: 0.08 + Math.min(count, 12) * 0.006, hold: 4, filter: { from: 5000, to: 400 } });
  },

  // back-to-back cascade: two bright pings
  combo(combo = 2) {
    const shift = Math.pow(2, Math.min(combo, 8) / 12);
    tone({ type: 'square', from: 1046.5 * shift, dur: 0.07, vol: 0.08, delay: 0.2 });
    tone({ type: 'square', from: 1568 * shift, dur: 0.14, vol: 0.08, delay: 0.27 });
  },

  // a 4 or 5 match leaves a power-up behind: a shimmering chime
  special() {
    [784, 1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
      tone({ type: 'triangle', from: f, dur: 0.12, vol: 0.12, delay: 0.1 + i * 0.05 }));
  },

  // striped candy: a sweeping zap
  stripe() {
    tone({ type: 'sawtooth', from: 200, to: 1800, dur: 0.25, vol: 0.1, filter: { from: 4000, to: 800 } });
    noise({ dur: 0.25, vol: 0.12, hold: 6, filter: { from: 8000, to: 1000 } });
  },

  // wrapped candy: a boom
  bomb() {
    tone({ type: 'square', from: 180, to: 35, dur: 0.4, vol: 0.2 });
    tone({ type: 'sine', from: 100, to: 30, dur: 0.5, vol: 0.3 });
    noise({ dur: 0.45, vol: 0.22, hold: 12, filter: { from: 3000, to: 100 } });
  },

  // rainbow ball: a wild rising arpeggio
  rainbow() {
    for (let i = 0; i < 12; i++)
      tone({ type: 'square', from: PENTA[i % 5] * (i > 4 ? 2 : 1) * (i > 9 ? 2 : 1), dur: 0.07, vol: 0.09, delay: i * 0.04 });
    noise({ dur: 0.5, vol: 0.14, hold: 12, filter: { from: 7000, to: 300 } });
  },

  // goal reached: a short fanfare
  levelUp() {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: i === 6 ? 0.45 : 0.1, vol: 0.1, delay: 0.1 + i * 0.09 }));
    tone({ type: 'triangle', from: 261.63, dur: 0.9, vol: 0.2, delay: 0.1 });
  },

  // the board had no moves left and gets stirred
  shuffle() {
    for (let i = 0; i < 6; i++)
      tone({ type: 'triangle', from: 300 + (i % 2) * 200 + i * 40, dur: 0.05, vol: 0.1, delay: i * 0.05 });
  },

  // a fresh board drops in
  deal() {
    [440, 554.37, 659.25].forEach((f, i) =>
      tone({ type: 'triangle', from: f, dur: 0.06, vol: 0.09, delay: i * 0.06 }));
  },

  // out of moves: a slow falling line ending in a low rumble
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
