import '@fontsource/press-start-2p';
import { sfx } from './candypop-sound.js';
import { CANDIES, ORB, drawCandy, shade } from './candies.js';
import { installBackButton } from './backbutton.js';
import { enableMobileFullscreen } from './fullscreen.js';
import { registerServiceWorker } from './pwa.js';
import { graphics } from './graphics.js';
import * as hi from './wall-hibit.js';

enableMobileFullscreen();
registerServiceWorker();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H;
const COLORS = ['#ff4d4d', '#ff944d', '#ffd24d', '#6bd86b', '#4dc3ff', '#9b6bff', '#ff6bd1'];
const N = 8; // the board is N x N
const START_MOVES = 20, LEVEL_MOVES = 8; // moves at the start, and moves earned for each goal reached
const goal = level => 250 * level * (level + 3); // total score needed to finish a level: 1000, 2500, 4500, ...
const PRAISE = ['', '', 'SWEET!', 'TASTY!', 'DELICIOUS!', 'DIVINE!', 'SUGAR RUSH!'];
const TOUCH = matchMedia('(pointer: coarse)').matches;
const START = TOUCH ? 'Tap' : 'Click';

// 9x5 pixel crown for the best score ('#' = lit pixel)
const CROWN = [
  '#...#...#',
  '##.###.##',
  '#########',
  '#########',
  '#########',
];

// a candy is { t, sp, x, y, vy, g, pop, dying }: t is its colour (-1 for the rainbow ball), sp its power-up
// (null | 'h' | 'v' | 'bomb' | 'rainbow'), x / y where it is drawn (in cells) and g whether it is falling
let grid, score, shownScore, best, moves, level, combo;
let state = 'play'; // play | over
let phase = 'idle'; // idle | swap | back | clear | fall | shuffle
const INTRO_FRAMES = 110;
let introT = 1; // 0..1 progress of the opening drop, as with the Candy Wall bricks
let phaseT = 0, idleT = 0, clearing = [], swapInfo = null, hintMove = null;
let swapKeys = new Set(); // the two cells just swapped: power-ups are born there
let paused = false;
let sel = null, down = null; // selected cell [r, c] and where the pointer went down
let parts = [], pops = [], beams = []; // pixel debris, floating text and power-up beams
let shake = 0, bgT = 0, overT = 0, newBest = false;
let stars = [];
// layout, set in layout()
let cell, gx, gy, hudH, scale;

try { best = Number(localStorage.getItem('candypop-best')) || 0; } catch { best = 0; }
function saveBest() { try { localStorage.setItem('candypop-best', String(best)); } catch { /* storage unavailable */ } }

// --- layout ---
function layout() {
  W = window.innerWidth;
  H = window.innerHeight;
  // back the canvas with real device pixels so the smooth hi-bit sprites stay sharp on retina screens; drawing stays in CSS pixels
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min(W / 480, H / 800);
  hudH = Math.max(120, Math.min(160, H * 0.2));
  cell = Math.max(10, Math.floor(Math.min((W - 56) / N, (H - hudH - 44) / N)));
  gx = Math.floor((W - cell * N) / 2);
  const top = Math.max(0, Math.floor((H - 44 - hudH - cell * N) / 2));
  gy = top + hudH;
  makeStars();
}

// --- game state ---
const numTypes = () => (level >= 3 ? 6 : 5); // a sixth colour joins from level 3
const randType = () => Math.floor(Math.random() * numTypes());
const key = (r, c) => r * N + c;
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

function mk(t, x, y) { return { t, sp: null, x, y, vy: 0, g: false, pop: 0, dying: 0, intro: null }; }

function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

function reset() {
  score = 0; shownScore = 0; level = 1; moves = START_MOVES; combo = 0; newBest = false;
  parts = []; pops = []; beams = []; sel = null; down = null; hintMove = null; swapKeys = new Set();
  grid = Array.from({ length: N }, () => Array(N).fill(null));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = mk(0, c, 0);
    g.intro = { delay: Math.random() * 0.5, dur: 0.3 + Math.random() * 0.2 }; // each candy drops in on its own start time and speed
    grid[r][c] = g;
  }
  randomizeTypes();
  introT = 0;
  phase = 'fall'; phaseT = 0;
}

// give every normal candy a colour without making a match, and make sure a move exists
function randomizeTypes() {
  const types = [...Array(numTypes()).keys()];
  const t = (r, c) => grid[r]?.[c]?.t;
  for (let tries = 0; tries < 50; tries++) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const g = grid[r][c];
      if (g.t < 0) continue;
      const bad = new Set();
      if (c >= 2 && t(r, c - 1) === t(r, c - 2)) bad.add(t(r, c - 1));
      if (r >= 2 && t(r - 1, c) === t(r - 2, c)) bad.add(t(r - 1, c));
      const opts = types.filter(x => !bad.has(x));
      g.t = opts[Math.floor(Math.random() * opts.length)];
    }
    if (findMove()) return;
  }
}

// runs of 3+ and the power-ups they leave behind: 4 in a row makes a striped candy, an L or T makes a wrapped
// one (3x3 blast) and 5 in a row makes a rainbow ball
function findMatches() {
  const runs = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N;) {
    const t = grid[r][c]?.t;
    let e = c + 1;
    if (t >= 0) while (e < N && grid[r][e]?.t === t) e++;
    if (t >= 0 && e - c >= 3) runs.push({ horiz: true, cells: Array.from({ length: e - c }, (_, i) => key(r, c + i)) });
    c = e;
  }
  for (let c = 0; c < N; c++) for (let r = 0; r < N;) {
    const t = grid[r][c]?.t;
    let e = r + 1;
    if (t >= 0) while (e < N && grid[e][c]?.t === t) e++;
    if (t >= 0 && e - r >= 3) runs.push({ horiz: false, cells: Array.from({ length: e - r }, (_, i) => key(r + i, c)) });
    r = e;
  }
  const counts = new Map();
  for (const run of runs) for (const k of run.cells) counts.set(k, (counts.get(k) || 0) + 1);
  const creations = new Map(), rank = { h: 1, v: 1, bomb: 2, rainbow: 3 };
  const put = (k, sp) => {
    if (grid[Math.floor(k / N)][k % N].sp) return; // an existing power-up just fires instead
    if (!creations.has(k) || rank[sp] > rank[creations.get(k)]) creations.set(k, sp);
  };
  for (const run of runs) {
    const origin = run.cells.find(k => swapKeys.has(k)) ?? run.cells[run.cells.length >> 1];
    if (run.cells.length >= 5) put(origin, 'rainbow');
    else if (run.cells.length === 4) put(origin, run.horiz ? 'v' : 'h');
  }
  for (const [k, n] of counts) if (n >= 2) put(k, 'bomb');
  return { matched: new Set(counts.keys()), creations };
}

// a swap that would work: [[r, c], [r, c]] or null
function findMove() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const r2 = r + dr, c2 = c + dc;
    if (!inside(r2, c2)) continue;
    const a = grid[r][c], b = grid[r2][c2];
    if (!a || !b) continue;
    if (a.t < 0 || b.t < 0 || (a.sp && b.sp)) return [[r, c], [r2, c2]];
    grid[r][c] = b; grid[r2][c2] = a;
    const ok = findMatches().matched.size > 0;
    grid[r][c] = a; grid[r2][c2] = b;
    if (ok) return [[r, c], [r2, c2]];
  }
  return null;
}

function commonestType() {
  const n = Array(CANDIES.length).fill(0);
  for (const row of grid) for (const g of row) if (g && g.t >= 0) n[g.t]++;
  const max = Math.max(...n), tops = n.map((v, i) => (v === max ? i : -1)).filter(i => i >= 0);
  return tops[Math.floor(Math.random() * tops.length)];
}

// add everything the power-ups in `keys` blow up (and chain into other power-ups)
function expand(keys, fx) {
  const seen = new Set(keys), queue = [...keys];
  const add = k => { if (!seen.has(k)) { seen.add(k); queue.push(k); } };
  while (queue.length) {
    const k = queue.pop(), r = Math.floor(k / N), c = k % N, g = grid[r][c];
    if (!g || !g.sp) continue;
    if (g.sp === 'h') { fx.push({ kind: 'h', r, c }); for (let i = 0; i < N; i++) add(key(r, i)); }
    else if (g.sp === 'v') { fx.push({ kind: 'v', r, c }); for (let i = 0; i < N; i++) add(key(i, c)); }
    else if (g.sp === 'bomb') {
      fx.push({ kind: 'bomb', r, c });
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inside(r + dr, c + dc)) add(key(r + dr, c + dc));
    } else {
      const t = commonestType(), targets = [];
      for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) if (grid[rr][cc]?.t === t) { add(key(rr, cc)); targets.push([rr, cc]); }
      fx.push({ kind: 'rainbow', r, c, targets });
    }
  }
  return seen;
}

function cellXY(r, c) { return [gx + c * cell, gy + r * cell]; }
function popText(str, x, y, size, color, life = 55) { pops.push({ str, x, y, size, color, life, max: life }); }

function burst(x, y, color, n = 5) { // x, y in cells
  const cx = gx + (x + 0.5) * cell, cy = gy + (y + 0.5) * cell;
  parts.push({ flash: true, x: cx, y: cy, life: 14, max: 14, size: cell });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (1 + Math.random() * 3.5) * scale;
    parts.push({
      x: cx + (Math.random() - 0.5) * cell * 0.6, y: cy + (Math.random() - 0.5) * cell * 0.6,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5 * scale, color: Math.random() < 0.25 ? '#ffd24d' : color,
      life: 30 + Math.random() * 22, max: 52, size: (3 + Math.random() * 4) * scale,
    });
  }
}

function addScore(n) {
  score += n;
  if (score > best) { if (!newBest && best > 0) { newBest = true; sfx.record(); } best = score; saveBest(); }
}

function startClear(matched, creations = new Map()) {
  const fx = [];
  const cells = expand(new Set([...matched].filter(k => !creations.has(k))), fx);
  let made = 0;
  for (const [k, sp] of creations) { // the power-up candy stays; everything else in the match goes
    if (cells.has(k)) continue;
    const g = grid[Math.floor(k / N)][k % N];
    g.sp = sp; g.pop = 1.5; made++;
    if (sp === 'rainbow') g.t = -1;
  }
  const gain = cells.size * 10 * combo + fx.length * 30 * combo + made * 50;
  addScore(gain);

  let sx = 0, sy = 0;
  for (const k of cells) { sx += k % N; sy += Math.floor(k / N); }
  const mx = gx + (sx / cells.size + 0.5) * cell, my = gy + (sy / cells.size + 0.5) * cell;
  popText('+' + gain, mx, my, Math.min(22, cell * 0.42), '#fff');
  if (combo >= 2) {
    popText(PRAISE[Math.min(combo, PRAISE.length - 1)], W / 2, gy + cell * 3.6, Math.min(32, cell * 0.62), '#ffd24d', 70);
    sfx.combo(combo);
  }

  sfx.match(combo, cells.size);
  if (fx.some(f => f.kind === 'h' || f.kind === 'v')) sfx.stripe();
  if (fx.some(f => f.kind === 'bomb')) sfx.bomb();
  if (fx.some(f => f.kind === 'rainbow')) sfx.rainbow();
  if (made) sfx.special();
  for (const f of fx) beams.push({ ...f, life: 22, max: 22 });
  shake = Math.max(shake, 1.5 + Math.min(cells.size, 14) * 0.5 + fx.length * 2);

  clearing = [...cells];
  swapKeys = new Set();
  phase = 'clear'; phaseT = 0;
}

function removeAndFall() {
  for (const k of clearing) {
    const r = Math.floor(k / N), c = k % N, g = grid[r][c];
    if (!g) continue;
    burst(g.x, g.y, g.t < 0 ? COLORS[Math.floor(Math.random() * COLORS.length)] : CANDIES[g.t].color, g.sp ? 9 : 5);
    grid[r][c] = null;
  }
  clearing = [];
  for (let c = 0; c < N; c++) {
    let write = N - 1;
    for (let r = N - 1; r >= 0; r--) {
      const g = grid[r][c];
      if (!g) continue;
      if (write !== r) { grid[write][c] = g; grid[r][c] = null; g.g = true; g.vy = 0; }
      write--;
    }
    const missing = write + 1;
    for (let r = write; r >= 0; r--) { // fresh candy stacked above the board
      const g = mk(randType(), c, r - missing);
      g.g = true;
      grid[r][c] = g;
    }
  }
  phase = 'fall'; phaseT = 0;
}

function settled() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = grid[r][c];
    if (g && (g.g || g.x !== c || g.y !== r)) return false;
  }
  return true;
}

function swapCells([r1, c1], [r2, c2]) {
  [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
}

function doSwap(a, b) {
  swapKeys = new Set([key(...a), key(...b)]);
  swapCells(a, b);
  const ga = grid[a[0]][a[1]], gb = grid[b[0]][b[1]];
  const valid = ga.t < 0 || gb.t < 0 || (ga.sp && gb.sp) || findMatches().matched.size > 0;
  swapInfo = { a, b, valid };
  phase = 'swap'; phaseT = 0; idleT = 0; hintMove = null; sel = null; down = null;
  sfx.swap();
}

// the swap is done and legal: spend the move and set off whatever it started
function resolveSwap() {
  const { a, b } = swapInfo, ga = grid[a[0]][a[1]], gb = grid[b[0]][b[1]];
  moves--; combo = 1;
  if (ga.t < 0 || gb.t < 0) { // a rainbow ball clears every candy of the colour it was swapped with
    const base = new Set();
    if (ga.t < 0 && gb.t < 0) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) base.add(key(r, c));
    } else {
      const [rb, other] = ga.t < 0 ? [a, gb] : [b, ga];
      grid[rb[0]][rb[1]].sp = null; // its blast is the colour sweep below
      base.add(key(...rb));
      const fx = { kind: 'rainbow', r: rb[0], c: rb[1], targets: [] };
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c].t === other.t) { base.add(key(r, c)); fx.targets.push([r, c]); }
      beams.push({ ...fx, life: 22, max: 22 });
    }
    startClear(base);
    sfx.rainbow();
  } else if (ga.sp && gb.sp) { // two power-ups swapped: both go off
    startClear(new Set([key(...a), key(...b)]));
  } else {
    const m = findMatches();
    startClear(m.matched, m.creations);
  }
}

function levelUp() {
  while (score >= goal(level)) {
    level++; moves += LEVEL_MOVES;
    const size = Math.min(34, cell * 0.66);
    popText('LEVEL ' + level + '!', W / 2, gy + cell * 3.2, size, '#6bd86b', 110);
    popText('+' + LEVEL_MOVES + ' MOVES', W / 2, gy + cell * 4.3, size * 0.6, '#fff', 110);
    for (let i = 0; i < 24; i++) burst(Math.random() * N - 0.5, Math.random() * N - 0.5, COLORS[i % COLORS.length], 2);
  }
  sfx.levelUp();
  shake = 6;
}

// every candy has settled with no match left: the turn is over
function afterFall() {
  const m = findMatches();
  if (m.matched.size) { combo++; startClear(m.matched, m.creations); return; }
  combo = 0;
  if (score >= goal(level)) levelUp();
  if (moves <= 0) { endGame(); return; }
  if (!findMove()) { // nothing left to swap: stir the board
    randomizeTypes();
    for (const row of grid) for (const g of row) g.pop = 1;
    popText('SHUFFLE!', W / 2, gy + cell * 3.6, Math.min(30, cell * 0.6), '#4dc3ff', 70);
    sfx.shuffle();
    phase = 'shuffle'; phaseT = 0;
    return;
  }
  phase = 'idle'; idleT = 0; hintMove = null;
}

function endGame() {
  state = 'over'; overT = 0; down = null; sel = null;
  sfx.setMusic(false);
  sfx.gameOver();
}

function startGame() {
  reset();
  state = 'play';
  paused = false;
  sfx.deal();
  sfx.setMusic(true);
}

// --- input ---

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return [(e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)];
}

function cellAt(x, y) {
  const r = Math.floor((y - gy) / cell), c = Math.floor((x - gx) / cell);
  return inside(r, c) ? [r, c] : null;
}

canvas.addEventListener('pointerdown', e => {
  sfx.unlock();
  const [x, y] = pointerPos(e);
  if (paused) { paused = false; sfx.setMusic(true); return; }
  if (state === 'over') { if (overT > 45) startGame(); return; }
  if (phase !== 'idle') return;
  const k = cellAt(x, y);
  if (!k) { sel = null; return; }
  if (sel && sel[0] === k[0] && sel[1] === k[1]) { sel = null; return; }
  if (sel && Math.abs(sel[0] - k[0]) + Math.abs(sel[1] - k[1]) === 1) { doSwap(sel, k); return; }
  sel = k; down = { x, y, r: k[0], c: k[1] };
  sfx.pick();
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => { // dragging a candy toward a neighbour swaps them
  if (!down || phase !== 'idle') return;
  const [x, y] = pointerPos(e), dx = x - down.x, dy = y - down.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.4) return;
  const r = down.r + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0), c = down.c + (Math.abs(dy) > Math.abs(dx) ? 0 : Math.sign(dx));
  const from = [down.r, down.c];
  down = null;
  if (inside(r, c)) doSwap(from, [r, c]);
});
canvas.addEventListener('pointerup', () => { down = null; });
canvas.addEventListener('pointercancel', () => { down = null; });

addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') sfx.toggleMute();
  else if (e.key === 'Escape' && state === 'play') {
    paused = !paused;
    sfx.setMusic(!paused);
    if (paused) { down = null; sel = null; }
  } else if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') {
    if (state === 'over' && overT > 45) startGame();
  } else if ((e.key === 'h' || e.key === 'H') && state === 'play' && phase === 'idle') {
    hintMove = findMove(); idleT = 300;
  }
});
addEventListener('blur', () => { if (state === 'play' && !paused) { paused = true; down = null; sel = null; sfx.setMusic(false); } });
addEventListener('resize', layout);

// --- update ---
function update() {
  if (paused) return;
  bgT++;
  shake *= 0.86;
  if (state === 'over') overT++;
  shownScore += Math.ceil((score - shownScore) * 0.12);
  if (shownScore > score) shownScore = score;

  if (introT < 1) introT = Math.min(1, introT + 1 / INTRO_FRAMES);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { // candies slide and fall to their cells
    const g = grid[r][c];
    if (!g) continue;
    if (g.intro) { // opening drop: bounce in from above the screen
      const t = Math.max(0, Math.min(1, (introT - g.intro.delay) / g.intro.dur)), y0 = -gy / cell - 1;
      g.y = t >= 1 ? r : y0 + (r - y0) * easeOutBounce(t);
      if (t >= 1) { g.intro = null; g.pop = 0.6; sfx.land(); }
      continue;
    }
    g.x += (c - g.x) * 0.4;
    if (Math.abs(c - g.x) < 0.02) g.x = c;
    if (g.g) {
      g.vy += 0.03; g.y += g.vy;
      if (g.y >= r) { g.y = r; g.g = false; g.vy = 0; g.pop = Math.max(g.pop, 0.6); }
    } else {
      g.y += (r - g.y) * 0.4;
      if (Math.abs(r - g.y) < 0.02) g.y = r;
    }
    if (g.pop > 0) g.pop = Math.max(0, g.pop - 0.08);
  }

  if (state === 'play') phaseUpdate();

  parts = parts.filter(d => {
    if (!d.flash) { d.x += d.vx; d.y += d.vy; d.vy += 0.22 * scale; }
    return --d.life > 0;
  });
  pops = pops.filter(t => { t.y -= 0.35 * scale; return --t.life > 0; });
  beams = beams.filter(b => --b.life > 0);
}

function phaseUpdate() {
  phaseT++;
  if (phase === 'idle') {
    if (++idleT === 300) hintMove = findMove();
  } else if (phase === 'clear') {
    for (const k of clearing) { const g = grid[Math.floor(k / N)][k % N]; if (g) g.dying = Math.min(1, phaseT / 14); }
    if (phaseT >= 14) removeAndFall();
  } else if (phase === 'shuffle') {
    if (phaseT >= 40) { phase = 'idle'; idleT = 0; }
  } else if (settled()) {
    if (phase === 'swap') {
      if (swapInfo.valid) resolveSwap();
      else { swapCells(swapInfo.a, swapInfo.b); sfx.nope(); phase = 'back'; phaseT = 0; }
    } else if (phase === 'back') {
      phase = 'idle'; idleT = 0;
    } else if (phase === 'fall') {
      afterFall();
    }
  }
}

// --- drawing ---
function text(str, x, y, size, color = '#fff', align = 'center') {
  ctx.fillStyle = color; ctx.font = graphics.font(size); ctx.textAlign = align;
  ctx.fillText(str, x, y);
}


function makeStars() {
  stars = [];
  const n = Math.round(W * H / 7000);
  for (let i = 0; i < n; i++)
    stars.push({ x: Math.random() * W, y: Math.random() * H, layer: i % 3, color: COLORS[i % COLORS.length], phase: Math.random() * 6.28 });
}

function drawBackground() {
  // faint diagonal candy stripes scrolling slowly
  const gap = 70 * scale, off = (bgT * 0.25 * scale) % (gap * COLORS.length);
  ctx.lineWidth = gap * 0.5;
  for (let i = -Math.ceil(H / gap) - 1; i < Math.ceil((W + H) / gap) + COLORS.length; i++) {
    ctx.strokeStyle = COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];
    ctx.globalAlpha = 0.045;
    const x = i * gap + off;
    ctx.beginPath(); ctx.moveTo(x + gap, -gap); ctx.lineTo(x - H - gap, H + gap); ctx.stroke();
  }
  // twinkling pixel stars drifting down
  for (const st of stars) {
    const speed = (st.layer + 1) * 0.12 * scale, size = Math.max(1, Math.round((st.layer + 1) * scale));
    const y = (st.y + bgT * speed) % H;
    ctx.globalAlpha = 0.25 + 0.2 * st.layer + 0.2 * Math.sin(bgT * 0.04 + st.phase);
    if (graphics.hibit) { hi.star(ctx, st.x, y, size, st.layer, st.color, ctx.globalAlpha); continue; }
    ctx.fillStyle = st.color;
    ctx.fillRect(Math.round(st.x), Math.round(y), size, size);
  }
  ctx.globalAlpha = 1;
}

function drawGem(g, hinted) {
  const bob = hinted ? Math.sin(bgT * 0.25) * cell * 0.07 : 0;
  const cx = gx + (g.x + 0.5) * cell + bob, cy = gy + (g.y + 0.5) * cell;
  const size = cell * 0.84 * (1 + g.pop * 0.2) * (1 - g.dying * 0.85);
  if (size < 2) return;
  if (g.t < 0) { // rainbow ball: every pixel row a different colour, cycling
    const rows = Array.from({ length: 7 }, (_, i) => COLORS[(i + Math.floor(bgT / 5)) % COLORS.length]);
    drawCandy(ctx, ORB, cx, cy, size * 1.08, '#fff', { rows, spin: bgT * 0.06, hibit: graphics.hibit });
  } else {
    const color = g.dying ? shade(CANDIES[g.t].color, g.dying * 0.8) : CANDIES[g.t].color;
    drawCandy(ctx, CANDIES[g.t].mask, cx, cy, size, color, { stripe: g.sp === 'h' || g.sp === 'v' ? g.sp : null, hibit: graphics.hibit });
  }
  if (g.sp === 'bomb' && !g.dying) { // wrapped candy: a pulsing white wrapper
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * Math.sin(bgT * 0.2)})`;
    ctx.lineWidth = Math.max(2, Math.round(cell / 14));
    if (graphics.hibit) { hi.roundedRect(ctx, cx - cell * 0.44, cy - cell * 0.44, cell * 0.88, cell * 0.88, cell * 0.24); ctx.stroke(); }
    else ctx.strokeRect(Math.round(cx - cell * 0.44), Math.round(cy - cell * 0.44), Math.round(cell * 0.88), Math.round(cell * 0.88));
  }
}

function drawBoard() {
  const pad = Math.max(4, Math.round(cell * 0.18)), px = Math.max(2, Math.round(cell / 9));
  const bw = cell * N;
  if (graphics.hibit) hi.panel(ctx, gx - pad - px, gy - pad - px, bw + 2 * (pad + px), bw + 2 * (pad + px), cell * 0.35);
  else {
  // dark panel with a pixel border
  ctx.fillStyle = '#0d0d1c';
  ctx.fillRect(gx - pad - px, gy - pad - px, bw + 2 * (pad + px), bw + 2 * (pad + px));
  ctx.fillStyle = '#34345a';
  ctx.fillRect(gx - pad - px, gy - pad - px, bw + 2 * (pad + px), px);
  ctx.fillRect(gx - pad - px, gy - pad - px, px, bw + 2 * (pad + px));
  ctx.fillStyle = '#05050f';
  ctx.fillRect(gx - pad - px, gy + bw + pad, bw + 2 * (pad + px), px);
  ctx.fillRect(gx + bw + pad, gy - pad - px, px, bw + 2 * (pad + px));
  ctx.fillStyle = '#1e1e38';
  ctx.fillRect(gx - pad, gy - pad, bw + 2 * pad, bw + 2 * pad);
  }

  const gap = Math.max(1, Math.round(cell / 14));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const [x, y] = cellXY(r, c);
    if (graphics.hibit) { hi.socket(ctx, x + gap / 2, y + gap / 2, cell - gap, cell - gap); continue; }
    ctx.fillStyle = (r + c) % 2 ? '#15152b' : '#191932';
    ctx.fillRect(Math.round(x + gap / 2), Math.round(y + gap / 2), cell - gap, cell - gap);
  }

  ctx.save();
  const clipTop = introT < 1 ? 0 : gy; // the opening drop falls from the top of the screen; later refills come out from behind the board edge
  ctx.beginPath(); ctx.rect(gx, clipTop, bw, gy + bw - clipTop); ctx.clip();
  const hinted = k => idleT >= 300 && hintMove && hintMove.some(([r, c]) => key(r, c) === k);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const g = grid[r][c]; if (g && !g.dying) drawGem(g, hinted(key(r, c))); }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const g = grid[r][c]; if (g && g.dying) drawGem(g); }
  if (sel && phase === 'idle') { // pulsing frame around the selected candy
    const [x, y] = cellXY(sel[0], sel[1]);
    ctx.strokeStyle = `rgba(255,255,255,${0.7 + 0.3 * Math.sin(bgT * 0.3)})`;
    ctx.lineWidth = Math.max(2, Math.round(cell / 12));
    if (graphics.hibit) { hi.roundedRect(ctx, x + gap + px / 2, y + gap + px / 2, cell - 2 * gap - px, cell - 2 * gap - px, cell * 0.24); ctx.stroke(); }
    else ctx.strokeRect(Math.round(x + gap + px / 2), Math.round(y + gap + px / 2), cell - 2 * gap - px, cell - 2 * gap - px);
  }
  ctx.restore();
}

function drawBeams() {
  const bw = cell * N;
  for (const b of beams) {
    const k = b.life / b.max, [x, y] = cellXY(b.r, b.c);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = graphics.hibit ? '#ffffff' : 'transparent'; ctx.shadowBlur = graphics.hibit ? cell * 0.5 : 0;
    if (b.kind === 'h' || b.kind === 'v') {
      const hz = b.kind === 'h', th = cell * 0.6 * k;
      const bx = hz ? gx : x + cell * 0.5 - th / 2, by = hz ? y + cell * 0.5 - th / 2 : gy, bwid = hz ? bw : th, bht = hz ? th : bw;
      if (graphics.hibit) { hi.roundedRect(ctx, bx, by, bwid, bht, th / 2); ctx.fill(); }
      else ctx.fillRect(Math.round(bx), Math.round(by), Math.round(bwid), Math.round(bht));
    } else if (b.kind === 'bomb') {
      const s = cell * (1 + (1 - k) * 2.2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, cell / 8);
      if (graphics.hibit) { ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, s / 2, 0, Math.PI * 2); ctx.stroke(); }
      else ctx.strokeRect(Math.round(x + cell / 2 - s / 2), Math.round(y + cell / 2 - s / 2), Math.round(s), Math.round(s));
    } else {
      ctx.strokeStyle = COLORS[Math.floor(bgT / 2) % COLORS.length]; ctx.lineWidth = Math.max(2, cell / 10);
      for (const [r, c] of b.targets) {
        const [tx, ty] = cellXY(r, c);
        ctx.beginPath();
        ctx.moveTo(x + cell / 2, y + cell / 2);
        ctx.lineTo((x + tx) / 2 + cell / 2 + (Math.random() - 0.5) * cell * 0.6, (y + ty) / 2 + cell / 2 + (Math.random() - 0.5) * cell * 0.6);
        ctx.lineTo(tx + cell / 2, ty + cell / 2);
        ctx.stroke();
      }
    }
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawCrown(x, y, px, color) { // x is the right edge
  if (graphics.hibit) { hi.crown(ctx, x, y, px, color); return; }
  CROWN.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '#') return;
    ctx.fillStyle = r === 4 ? shade(color, -0.3) : color;
    ctx.fillRect(Math.round(x - (9 - c) * px), Math.round(y + r * px), px, px);
  }));
}

function drawHud() {
  const hy = gy - hudH, bw = cell * N, right = gx + bw;
  const size = Math.min(26, cell * 0.5), lab = Math.max(8, size * 0.34);
  const sx = Math.max(gx, 52); // clear of the back button
  const labelY = hy + hudH * 0.17, valueY = labelY + size * 1.35;
  text('SCORE', sx, labelY, lab, '#aaa', 'left');
  text(String(shownScore), sx, valueY, size, '#fff', 'left');
  text('MOVES', W / 2, labelY, lab, '#aaa');
  text(String(moves), W / 2, valueY, size, moves <= 3 && Math.floor(bgT / 15) % 2 ? '#ff4d4d' : '#fff');
  const px = Math.max(2, Math.round(size / 9));
  drawCrown(right - 2 * px, labelY - 5 * px, px, '#ffd24d');
  text(String(best), right, valueY, size * 0.8, '#ffd24d', 'right');

  // level, goal and a progress bar just above the board
  const pad = Math.max(4, Math.round(cell * 0.18)), bpx = Math.max(2, Math.round(cell / 9));
  const barH = Math.max(6, Math.round(cell / 5)), barY = Math.round(gy - pad - bpx - barH - 6);
  const from = level > 1 ? goal(level - 1) : 0, k = Math.max(0, Math.min(1, (score - from) / (goal(level) - from)));
  text('LEVEL ' + level, gx, barY - 6, lab, '#fff', 'left');
  text('GOAL ' + goal(level), gx + lab * 9 + 12, barY - 6, lab, '#aaa', 'left');
  if (graphics.hibit) hi.bar(ctx, gx, barY, bw, barH, k, COLORS[Math.floor(bgT / 12) % COLORS.length]);
  else {
  ctx.fillStyle = '#0d0d1c'; ctx.fillRect(gx, barY, bw, barH);
  ctx.fillStyle = COLORS[Math.floor(bgT / 12) % COLORS.length];
  ctx.fillRect(gx, barY, Math.round(bw * k), barH);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(gx, barY, Math.round(bw * k), Math.max(1, Math.round(barH / 4)));
  ctx.strokeStyle = '#34345a'; ctx.lineWidth = 2; ctx.strokeRect(gx - 1, barY - 1, bw + 2, barH + 2);
  }
}

function drawFx() {
  for (const d of parts) {
    if (graphics.hibit) {
      const f = d.life / d.max;
      if (d.flash) hi.blast(ctx, d.x, d.y, d.size * (1 + (1 - f) * 0.4) * 0.8, f, true, '#ffffff');
      else hi.blast(ctx, d.x, d.y, d.size * 0.9, Math.min(1, d.life / 20), false, d.color);
      continue;
    }
    if (d.flash) {
      ctx.globalAlpha = d.life / d.max;
      ctx.fillStyle = '#fff';
      const s = d.size * (1 + (1 - d.life / d.max) * 0.4);
      ctx.fillRect(Math.round(d.x - s / 2), Math.round(d.y - s / 2), Math.round(s), Math.round(s));
    } else {
      ctx.globalAlpha = Math.min(1, d.life / 20);
      ctx.fillStyle = d.color;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), Math.round(d.size), Math.round(d.size));
    }
  }
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'middle';
  for (const t of pops) {
    const k = 1 - t.life / t.max;
    ctx.globalAlpha = Math.min(1, t.life / 20);
    const size = t.size * (k < 0.15 ? 0.6 + k / 0.15 * 0.4 : 1);
    text(t.str, t.x, t.y + size * 0.08, size, 'rgba(0,0,0,0.6)');
    text(t.str, t.x, t.y, size, t.color);
  }
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}


function draw() {
  ctx.save();
  if (shake > 0.3) ctx.translate((Math.random() - 0.5) * 2 * shake * scale, (Math.random() - 0.5) * 2 * shake * scale);
  ctx.clearRect(-20, -20, W + 40, H + 40);
  drawBackground();
  drawHud();
  drawBoard();
  drawBeams();
  drawFx();
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    text('Paused', W / 2, H / 2 - 10, Math.min(32, W * 0.08));
    text(TOUCH ? 'Tap to resume' : 'Press Esc or click to resume', W / 2, H / 2 + 30, 12, '#ccc');
  }
  if (state === 'over') {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, overT / 60)})`; ctx.fillRect(0, 0, W, H);
    if (overT > 20) {
      const s = Math.min(32, W * 0.08);
      text('Out of moves', W / 2, H / 2 - 40, s);
      text('Score ' + score + '  ·  Level ' + level, W / 2, H / 2 + 6, 13, '#fff');
      text(newBest ? 'New best!' : 'Best ' + best, W / 2, H / 2 + 34, 12, '#ffd24d');
      if (overT > 45) text(START + ' to play again', W / 2, H / 2 + 74, 12, '#ccc');
    }
  }
  ctx.restore();
}

if (TOUCH) document.getElementById('hint').textContent = 'Swipe or tap two neighbours to swap  ·  Match 3 or more  ·  Match 4 or 5 for power-ups  ·  Hit the goal before the moves run out';

// fixed 60 Hz simulation: a 120/144 Hz display draws more often but the game doesn't run faster
const STEP_MS = 1000 / 60;
let lastFrame = 0, accumulator = 0;
function loop(now) {
  if (!lastFrame) lastFrame = now;
  accumulator += Math.min(100, now - lastFrame);
  lastFrame = now;
  while (accumulator >= STEP_MS) { update(); accumulator -= STEP_MS; }
  draw();
  requestAnimationFrame(loop);
}
layout();
reset();
sfx.setMusic(true);
requestAnimationFrame(loop);

installBackButton({
  pause: () => { paused = true; down = null; sel = null; sfx.setMusic(false); },
  resume: () => { paused = false; sfx.setMusic(true); },
  isPlaying: () => state === 'play' && !paused,
});
