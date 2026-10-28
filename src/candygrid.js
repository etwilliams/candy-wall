import '@fontsource/press-start-2p';
import { sfx } from './candygrid-sound.js';
import { installBackButton } from './backbutton.js';
import { enableMobileFullscreen } from './fullscreen.js';
import { registerServiceWorker } from './pwa.js';

enableMobileFullscreen();
registerServiceWorker();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H;
const COLORS = ['#ff4d4d', '#ff944d', '#ffd24d', '#6bd86b', '#4dc3ff', '#9b6bff', '#ff6bd1'];
const N = 8; // the grid is N x N
const TRAY_SCALE = 0.55; // pieces waiting in the tray are drawn at this fraction of a grid cell
const TOUCH = matchMedia('(pointer: coarse)').matches;
const START = TOUCH ? 'Tap' : 'Click';

// piece shapes ('#' = filled); every piece is dealt in a random rotation. Higher weight = dealt more often
const SHAPE_DEFS = [
  [1, ['#']],
  [2, ['##']],
  [3, ['###']],
  [2, ['####']],
  [1, ['#####']],
  [3, ['##', '##']],
  [1, ['###', '###', '###']],
  [2, ['###', '###']],
  [3, ['#.', '##']],
  [2, ['#..', '#..', '###']],
  [3, ['#.', '#.', '##']],
  [2, ['.#', '.#', '##']],
  [2, ['###', '.#.']],
  [2, ['##.', '.##']],
  [2, ['.##', '##.']],
];

function parse(rows) {
  const cells = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') cells.push([r, c]); }));
  return { cells, w: rows[0].length, h: rows.length };
}
function rotate({ cells, w, h }) { // quarter turn clockwise
  return { cells: cells.map(([r, c]) => [c, h - 1 - r]), w: h, h: w };
}
const SHAPES = SHAPE_DEFS.map(([weight, rows]) => {
  const seen = new Set(), rots = [];
  let s = parse(rows);
  for (let i = 0; i < 4; i++, s = rotate(s)) {
    const key = s.cells.map(x => x.join()).sort().join('|');
    if (!seen.has(key)) { seen.add(key); rots.push(s); }
  }
  return { weight, rots };
});
const TOTAL_WEIGHT = SHAPES.reduce((a, s) => a + s.weight, 0);

function randomShape() {
  let t = Math.random() * TOTAL_WEIGHT;
  for (const s of SHAPES) if ((t -= s.weight) < 0) return s.rots[Math.floor(Math.random() * s.rots.length)];
  return SHAPES[0].rots[0];
}

// 9x5 pixel crown for the best score ('#' = lit pixel)
const CROWN = [
  '#...#...#',
  '##.###.##',
  '#########',
  '#########',
  '#########',
];

let grid, tray, score, shownScore, best, streak;
let state = 'title'; // title | play | over
let paused = false;
let drag = null; // { slot, x, y, touch, k }: the piece being carried, with its grab point
let parts = [], pops = []; // pixel debris and floating text
let shake = 0, bgT = 0, titleT = 0, overT = 0, newBest = false;
let stars = [];
// layout, set in layout()
let cell, gx, gy, headerH, trayY, scale;

let musicBtn = { x: 0, y: 0, s: 0 }; // hit box of the music button, set when drawn
try { sfx.toggleMusic(); if ((localStorage.getItem('candygrid-music') ?? localStorage.getItem('blockblast-music')) !== 'off') sfx.toggleMusic(); } catch { /* storage unavailable: music stays on */ }
try { best = Number(localStorage.getItem('candygrid-best') ?? localStorage.getItem('blockblast-best')) || 0; } catch { best = 0; }
function saveBest() { try { localStorage.setItem('candygrid-best', String(best)); } catch { /* storage unavailable */ } }

// --- layout ---
function layout() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  scale = Math.min(W / 480, H / 800);
  headerH = Math.max(64, Math.min(120, H * 0.14));
  cell = Math.max(10, Math.floor(Math.min((W - 56) / N, (H - headerH - 24) / (N + 3.4))));
  gx = Math.floor((W - cell * N) / 2);
  gy = Math.floor(headerH);
  trayY = gy + cell * N + (H - gy - cell * N) / 2;
  makeStars();
}

function slotCenter(i) { return [W / 3 * (i + 0.5), trayY]; }
function trayScale(p) { return Math.min(TRAY_SCALE, (W / 3) * 0.86 / (p.w * cell)); }
function slotRect(i, p) { // top-left and cell size of a piece resting in its tray slot
  const cs = cell * trayScale(p), [cx, cy] = slotCenter(i);
  return { x: cx - p.w * cs / 2, y: cy - p.h * cs / 2, cs };
}

// --- game state ---
function newTray() {
  const make = () => ({ ...randomShape(), color: COLORS[Math.floor(Math.random() * COLORS.length)], used: false, appear: 0, ret: null });
  let set;
  for (let tries = 0; tries < 40; tries++) { // make sure at least one piece fits somewhere, so a deal is never an instant loss
    set = [make(), make(), make()];
    if (set.some(anyFit)) break;
  }
  set.forEach((p, i) => { p.appear = -i * 0.4; });
  return set;
}

function reset() {
  grid = Array.from({ length: N }, () => Array(N).fill(null));
  score = 0; shownScore = 0; streak = 0; newBest = false;
  parts = []; pops = []; drag = null;
  tray = newTray();
}

function canPlace(p, r, c) {
  return p.cells.every(([pr, pc]) => {
    const rr = r + pr, cc = c + pc;
    return rr >= 0 && rr < N && cc >= 0 && cc < N && !grid[rr][cc];
  });
}
function anyFit(p) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (canPlace(p, r, c)) return true;
  return false;
}

// rows and columns that would be full if `extra` cells were filled
function fullLines(extra = []) {
  const filled = (r, c) => grid[r][c] || extra.some(([er, ec]) => er === r && ec === c);
  const rows = [], cols = [];
  for (let i = 0; i < N; i++) {
    if ([...Array(N).keys()].every(j => filled(i, j))) rows.push(i);
    if ([...Array(N).keys()].every(j => filled(j, i))) cols.push(i);
  }
  return { rows, cols };
}

function cellXY(r, c) { return [gx + c * cell, gy + r * cell]; }

function popText(str, x, y, size, color, life = 55) { pops.push({ str, x, y, size, color, life, max: life }); }

function burst(r, c, color, n = 5) {
  const [x, y] = cellXY(r, c), cx = x + cell / 2, cy = y + cell / 2;
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

function place(slot, r, c) {
  const p = tray[slot];
  p.used = true;
  for (const [pr, pc] of p.cells) grid[r + pr][c + pc] = { color: p.color, pop: 1 };
  sfx.place(p.cells.length);
  shake = Math.max(shake, 1.5);
  let gain = p.cells.length;

  const { rows, cols } = fullLines();
  const lines = rows.length + cols.length;
  if (lines) {
    const doomed = new Set();
    rows.forEach(rr => { for (let cc = 0; cc < N; cc++) doomed.add(rr * N + cc); });
    cols.forEach(cc => { for (let rr = 0; rr < N; rr++) doomed.add(rr * N + cc); });
    for (const k of doomed) {
      const rr = Math.floor(k / N), cc = k % N;
      burst(rr, cc, grid[rr][cc].color);
      grid[rr][cc] = null;
    }
    const bonus = 10 * lines * (lines + streak);
    gain += bonus;
    sfx.clear(lines, streak);
    if (streak >= 1) { sfx.combo(streak); popText('COMBO x' + (streak + 1), W / 2, gy + cell * 2.6, Math.min(28, cell * 0.5), '#ff6bd1', 70); }
    const praise = ['', '', 'NICE!', 'GREAT!', 'WOW!'][lines] || 'AMAZING!';
    if (praise) popText(praise, W / 2, gy + cell * 3.6, Math.min(36, cell * 0.7), '#ffd24d', 70);
    popText('+' + bonus, W / 2, gy + cell * 4.6, Math.min(24, cell * 0.45), '#fff');
    shake = Math.max(shake, 3 + lines * 2);
    streak++;
    if (grid.every(row => row.every(x => !x))) { // perfect clear
      gain += 100;
      sfx.perfect();
      popText('PERFECT!', W / 2, gy + cell * 5.6, Math.min(32, cell * 0.6), '#6bd86b', 90);
      shake = 10;
    }
  } else {
    streak = 0;
  }
  score += gain;
  if (score > best) { if (!newBest && best > 0) { newBest = true; sfx.record(); } best = score; saveBest(); }

  if (tray.every(t => t.used)) { tray = newTray(); sfx.deal(); }
  if (!tray.some(t => !t.used && anyFit(t))) endGame();
}

function endGame() {
  state = 'over'; overT = 0; drag = null;
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
function toggleMusic() {
  const off = sfx.toggleMusic();
  try { localStorage.setItem('candygrid-music', off ? 'off' : 'on'); } catch { /* storage unavailable */ }
}

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return [(e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)];
}

// where the carried piece's top-left corner is, and which grid cell that snaps to
function dragTopLeft() {
  const p = tray[drag.slot];
  const lift = cell * (drag.touch ? 1.6 : 0.5);
  return [drag.x - p.w * cell / 2, drag.y - p.h * cell / 2 - lift];
}
function dragTarget() {
  const p = tray[drag.slot], [x, y] = dragTopLeft();
  const r = Math.round((y - gy) / cell), c = Math.round((x - gx) / cell);
  return canPlace(p, r, c) ? { r, c } : null;
}

canvas.addEventListener('pointerdown', e => {
  sfx.unlock();
  const [x, y] = pointerPos(e);
  if (Math.abs(x - musicBtn.x) < musicBtn.s && Math.abs(y - musicBtn.y) < musicBtn.s) { toggleMusic(); return; }
  if (paused) { paused = false; sfx.setMusic(true); return; }
  if (state === 'title') { if (titleT > 60) startGame(); return; }
  if (state === 'over') { if (overT > 45) startGame(); return; }
  if (drag) return;
  for (let i = 0; i < 3; i++) { // pick the tray slot under the pointer (a generous hit area around each piece)
    const p = tray[i];
    if (p.used || p.ret) continue;
    const [cx, cy] = slotCenter(i);
    if (Math.abs(x - cx) < W / 6 && Math.abs(y - cy) < Math.max(cell * 1.8, p.h * cell * TRAY_SCALE / 2 + cell * 0.6)) {
      drag = { slot: i, x, y, touch: e.pointerType !== 'mouse', k: 0 };
      canvas.setPointerCapture(e.pointerId);
      sfx.pick();
      break;
    }
  }
});

canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  [drag.x, drag.y] = pointerPos(e);
});

function endDrag(e) {
  if (!drag) return;
  const p = tray[drag.slot];
  [drag.x, drag.y] = pointerPos(e);
  const target = e.type === 'pointercancel' ? null : dragTarget();
  if (target) {
    place(drag.slot, target.r, target.c);
  } else {
    const [x, y] = dragTopLeft();
    p.ret = { x, y, k: drag.k }; // glide back to the tray
    if (e.type !== 'pointercancel') sfx.nope();
  }
  drag = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') sfx.toggleMute();
  else if (e.key === 'n' || e.key === 'N') toggleMusic();
  else if (e.key === 'Escape' && state === 'play') {
    paused = !paused;
    sfx.setMusic(!paused);
    if (paused) drag = null;
  } else if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') {
    if ((state === 'title' && titleT > 60) || (state === 'over' && overT > 45)) startGame();
  }
});
addEventListener('blur', () => { if (state === 'play' && !paused) { paused = true; drag = null; sfx.setMusic(false); } });
addEventListener('resize', layout);

// --- update ---
function update() {
  if (paused) return;
  bgT++;
  shake *= 0.86;
  if (state === 'title') titleT++;
  if (state === 'over') overT++;
  shownScore += Math.ceil((score - shownScore) * 0.12);
  if (shownScore > score) shownScore = score;

  if (drag) drag.k = Math.min(1, drag.k + 0.18);
  for (const p of tray || []) {
    if (p.appear < 1) p.appear = Math.min(1, p.appear + 0.08);
    if (p.ret) { // glide back to the slot and shrink
      const i = tray.indexOf(p), r = slotRect(i, p);
      p.ret.x += (r.x - p.ret.x) * 0.3; p.ret.y += (r.y - p.ret.y) * 0.3; p.ret.k += (0 - p.ret.k) * 0.3;
      if (Math.abs(r.x - p.ret.x) + Math.abs(r.y - p.ret.y) < 2) p.ret = null;
    }
  }
  for (const row of grid || []) for (const g of row) if (g && g.pop > 0) g.pop = Math.max(0, g.pop - 0.1);

  parts = parts.filter(d => {
    if (!d.flash) { d.x += d.vx; d.y += d.vy; d.vy += 0.22 * scale; }
    return --d.life > 0;
  });
  pops = pops.filter(t => { t.y -= 0.35 * scale; return --t.life > 0; });
}

// --- drawing ---
function text(str, x, y, size, color = '#fff', align = 'center') {
  ctx.fillStyle = color; ctx.font = `${size}px "Press Start 2P", monospace`; ctx.textAlign = align;
  ctx.fillText(str, x, y);
}

function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

function shade(hex, amt) { // amt > 0 mixes toward white, < 0 toward black
  const n = parseInt(hex.slice(1), 16), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (t - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// flat color body, light top/left edge, dark bottom/right edge, notched corners and a two-pixel glint
function pixelBox(x, y, w, h, color, px) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = color;
  ctx.fillRect(x + px, y, w - 2 * px, h);
  ctx.fillRect(x, y + px, w, h - 2 * px);
  ctx.fillStyle = shade(color, -0.3);
  ctx.fillRect(x + px, y + h - px, w - 2 * px, px);
  ctx.fillRect(x + w - px, y + px, px, h - 2 * px);
  ctx.fillStyle = shade(color, 0.4);
  ctx.fillRect(x + px, y, w - 2 * px, px);
  ctx.fillRect(x, y + px, px, h - 2 * px);
  if (h >= px * 4 && w >= px * 6) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + px * 2, y + px * 2, px * 2, px);
  }
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
    ctx.fillStyle = st.color;
    ctx.fillRect(Math.round(st.x), Math.round(y), size, size);
  }
  ctx.globalAlpha = 1;
}

function drawBlock(x, y, cs, color) {
  const gap = Math.max(1, Math.round(cs / 14));
  pixelBox(x + gap / 2, y + gap / 2, cs - gap, cs - gap, color, Math.max(2, Math.round(cs / 9)));
}

function drawPiece(p, x, y, cs, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (const [r, c] of p.cells) drawBlock(x + c * cs, y + r * cs, cs, p.color);
  ctx.globalAlpha = 1;
}

function drawBoard(preview) {
  const pad = Math.max(4, Math.round(cell * 0.18)), px = Math.max(2, Math.round(cell / 9));
  const bw = cell * N;
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

  const hot = new Set(); // cells that would clear if the carried piece were dropped now
  if (preview) {
    const { rows, cols } = fullLines(preview.cells);
    rows.forEach(r => { for (let c = 0; c < N; c++) hot.add(r * N + c); });
    cols.forEach(c => { for (let r = 0; r < N; r++) hot.add(r * N + c); });
  }

  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const [x, y] = cellXY(r, c), g = grid[r][c], gap = Math.max(1, Math.round(cell / 14));
    if (!g) {
      ctx.fillStyle = '#15152b';
      ctx.fillRect(Math.round(x + gap / 2), Math.round(y + gap / 2), cell - gap, cell - gap);
    } else {
      const s = 1 + g.pop * 0.18; // a little squash-pop when a block lands
      const cs = cell * s, o = (cell - cs) / 2;
      drawBlock(x + o, y + o, cs, g.color);
    }
    if (hot.has(r * N + c)) {
      ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.12 * Math.sin(bgT * 0.3)})`;
      ctx.fillRect(Math.round(x + gap / 2), Math.round(y + gap / 2), cell - gap, cell - gap);
    }
  }

  if (preview) { // ghost of where the piece would land
    ctx.globalAlpha = 0.5;
    for (const [r, c] of preview.cells) { const [x, y] = cellXY(r, c); drawBlock(x, y, cell, preview.color); }
    ctx.globalAlpha = 1;
  }
}

function drawCrown(x, y, px, color) { // x is the right edge
  CROWN.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '#') return;
    ctx.fillStyle = r === 4 ? shade(color, -0.3) : color;
    ctx.fillRect(Math.round(x - (9 - c) * px), Math.round(y + r * px), px, px);
  }));
}

// 8x8 pixel music note, with a slash through it while the music is off
const NOTE = [
  '...#####',
  '...#...#',
  '...#...#',
  '...#...#',
  '.###.###',
  '####.###',
  '.##..##.',
  '........',
];
function drawMusicButton() {
  const px = Math.max(2, Math.round(cell / 14)), s = px * 8;
  const x = Math.round(W / 2 - s / 2), y = Math.round(headerH * 0.3);
  musicBtn = { x: x + s / 2, y: y + s / 2, s: Math.max(s, 24) * 0.9 };
  const off = sfx.musicOff;
  ctx.fillStyle = off ? '#666' : '#ff6bd1';
  NOTE.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') ctx.fillRect(x + c * px, y + r * px, px, px); }));
  if (off) for (let i = 0; i < 8; i++) { // diagonal slash with a dark edge
    ctx.fillStyle = '#1b1b2f'; ctx.fillRect(x + i * px - px, y + (7 - i) * px, px, px);
    ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x + i * px, y + (7 - i) * px, px, px);
  }
}

function drawHud() {
  drawMusicButton();
  const size = Math.min(34, cell * 0.62);
  const sx = Math.max(gx, 52); // clear of the back button
  text('SCORE', sx, headerH * 0.34, Math.max(8, size * 0.32), '#aaa', 'left');
  text(String(shownScore), sx, headerH * 0.34 + size * 1.25, size, '#fff', 'left');
  const px = Math.max(2, Math.round(size / 9)), right = gx + cell * N;
  drawCrown(right - 2 * px, headerH * 0.2, px, '#ffd24d');
  text(String(best), right, headerH * 0.34 + size * 1.25, size * 0.8, '#ffd24d', 'right');
}

function drawPieces() {
  for (let i = 0; i < 3; i++) {
    const p = tray[i];
    if (p.used || p.appear <= 0) continue;
    if (drag && drag.slot === i) continue;
    const r = slotRect(i, p);
    if (p.ret) { // flying back
      const cs = r.cs + (cell - r.cs) * p.ret.k;
      drawPiece(p, p.ret.x, p.ret.y, cs);
      continue;
    }
    const t = easeOutBounce(p.appear), cs = r.cs * t; // bounce in when dealt
    drawPiece(p, r.x + (r.cs * p.w - cs * p.w) / 2, r.y + (r.cs * p.h - cs * p.h) / 2, cs);
  }
  if (drag) {
    const p = tray[drag.slot], [x, y] = dragTopLeft(), r = slotRect(drag.slot, p);
    const cs = r.cs + (cell - r.cs) * drag.k;
    const cx = x + p.w * cell / 2, cy = y + p.h * cell / 2; // keep it centered as it grows
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; // drop shadow
    for (const [pr, pc] of p.cells) ctx.fillRect(Math.round(cx - p.w * cs / 2 + pc * cs + 4), Math.round(cy - p.h * cs / 2 + pr * cs + 8), cs, cs);
    drawPiece(p, cx - p.w * cs / 2, cy - p.h * cs / 2, cs);
  }
}

function drawFx() {
  for (const d of parts) {
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

function drawTitle() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
  const title = 'CANDY GRID';
  const size = Math.min(64, W * 0.88 / title.length);
  const x0 = W / 2 - (title.length * size) / 2 + size / 2;
  ctx.textBaseline = 'middle';
  const DROP = 45, STAGGER = 7;
  const landedAt = (title.length - 1) * STAGGER + DROP;
  [...title].forEach((ch, i) => {
    if (ch === ' ') return;
    const t = Math.max(0, Math.min(1, (titleT - i * STAGGER) / DROP));
    if (t === 0) return;
    const x = x0 + i * size, rest = H / 2 - size;
    let y = rest - (1 - easeOutBounce(t)) * (rest + size);
    if (t === 1) y += Math.sin(titleT * 0.07 + i * 0.7) * size * 0.07;
    const color = COLORS[(i + (t === 1 ? Math.floor(titleT / 18) : 0)) % COLORS.length];
    text(ch, x, y + size * 0.08, size, 'rgba(0,0,0,0.5)');
    text(ch, x, y, size, color);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = Math.max(0, Math.min(1, (titleT - landedAt) / 30));
  text('drop candy blocks, clear the lines', W / 2, H / 2 - size * 0.15, Math.min(size * 0.22, W * 0.03), '#ffb3e6');
  ctx.globalAlpha = 1;
  if (titleT > landedAt && Math.floor(Date.now() / 500) % 2 === 0) text(START + ' to start', W / 2, H / 2 + size, Math.max(10, size * 0.28), '#ccc');
  if (best > 0) text('Best ' + best, W / 2, H / 2 + size * 1.9, Math.max(10, size * 0.24), '#ffd24d');
}

function draw() {
  ctx.save();
  if (shake > 0.3) ctx.translate((Math.random() - 0.5) * 2 * shake * scale, (Math.random() - 0.5) * 2 * shake * scale);
  ctx.clearRect(-20, -20, W + 40, H + 40);
  drawBackground();
  if (state !== 'title') {
    let preview = null;
    if (drag) {
      const t = dragTarget();
      if (t) preview = { color: tray[drag.slot].color, cells: tray[drag.slot].cells.map(([r, c]) => [r + t.r, c + t.c]) };
    }
    drawHud();
    drawBoard(preview);
    drawPieces();
    drawFx();
  }
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    text('Paused', W / 2, H / 2 - 10, Math.min(32, W * 0.08));
    text(TOUCH ? 'Tap to resume' : 'Press Esc or click to resume', W / 2, H / 2 + 30, 12, '#ccc');
  }
  if (state === 'title') drawTitle();
  else if (state === 'over') {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, overT / 60)})`; ctx.fillRect(0, 0, W, H);
    if (overT > 20) {
      const s = Math.min(32, W * 0.08);
      text('Game over', W / 2, H / 2 - 30, s);
      text('Score ' + score, W / 2, H / 2 + 10, 14, '#fff');
      text(newBest ? 'New best!' : 'Best ' + best, W / 2, H / 2 + 38, 12, '#ffd24d');
      if (overT > 45) text(START + ' to play again', W / 2, H / 2 + 78, 12, '#ccc');
    }
  }
  ctx.restore();
}

if (TOUCH) document.getElementById('hint').textContent = 'Drag a piece onto the grid  ·  Fill a whole row or column to clear it  ·  Clear on back-to-back moves for combos';

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
state = 'title';
requestAnimationFrame(loop);


installBackButton({
  pause: () => { paused = true; drag = null; sfx.setMusic(false); },
  resume: () => { paused = false; sfx.setMusic(true); },
  isPlaying: () => state === 'play' && !paused,
});
