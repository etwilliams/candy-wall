// Launcher menu music and sounds, built on the same Web Audio helpers as the games.
import { ctx, tone, noise, sound } from './sound.js';

// --- background music: a bright chiptune loop (G, Em, C, D at 124 BPM) scheduled a moment ahead of time ---
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const STEP = 60 / 124 / 4; // one sixteenth note
const LEAD = [ // two bars of sixteenth steps; null is a rest
  79, null, 83, 86, 83, null, 79, null,  76, null, 79, 83, 79, null, 76, null,
  72, null, 76, 79, 84, null, 79, null,  74, null, 78, 81, 86, null, 81, null,
];
const BASS_ROOTS = [43, 40, 36, 38]; // one per half bar: G, E, C, D
let musicTimer = null, musicNext = 0, musicStep = 0;
let musicOff = false;

function playStep(step, at) {
  if (musicOff) return;
  const d = Math.max(0, at - ctx().currentTime);
  const s = step % LEAD.length;
  if (LEAD[s] != null) tone({ type: 'square', from: midi(LEAD[s]), dur: STEP * 1.5, vol: 0.03, delay: d });
  if (s % 2 === 0) {
    const root = BASS_ROOTS[Math.floor(s / 8)];
    tone({ type: 'triangle', from: midi(s % 4 === 0 ? root : root + 12), dur: STEP * 1.8, vol: 0.1, delay: d });
  }
  if (s % 4 === 0) tone({ type: 'sine', from: 125, to: 45, dur: 0.1, vol: 0.16, delay: d }); // kick
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

  // starts the loop; safe to call repeatedly (needs a user gesture first)
  startMusic() {
    if (musicTimer !== null) return;
    const a = ctx();
    if (!a) return;
    musicNext = a.currentTime + 0.08;
    musicTimer = setInterval(schedule, 30);
  },

  // moving the highlight between games
  move() { tone({ type: 'square', from: 660, to: 880, dur: 0.05, vol: 0.07 }); },

  // picking a game: a rising run with a thump
  select() { sound.select(); },
};
