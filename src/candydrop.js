import '@fontsource/press-start-2p';
import { sfx } from './candydrop-sound.js';
import { installBackButton } from './backbutton.js';
import { enableMobileFullscreen } from './fullscreen.js';
import { registerServiceWorker } from './pwa.js';
import { graphics } from './graphics.js';
import * as hi from './wall-hibit.js';

enableMobileFullscreen();
registerServiceWorker();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H, scale;
const COLORS = ['#ff4d4d', '#ff944d', '#ffd24d', '#6bd86b', '#4dc3ff', '#9b6bff', '#ff6bd1'];
const COLS = 10, ROWS = 20;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const START = TOUCH ? 'Tap' : 'Click or press Space';

// the seven pieces: each is a matrix of 0/1 that rotates in place
const PIECES = {
  I: { color: '#4dc3ff', m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  O: { color: '#ffd24d', m: [[1, 1], [1, 1]] },
  T: { color: '#9b6bff', m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  S: { color: '#6bd86b', m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  Z: { color: '#ff4d4d', m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  J: { color: '#ff6bd1', m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  L: { color: '#ff944d', m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
};
const TYPES = Object.keys(PIECES);

// try these offsets in order when a rotation doesn't fit (a simple wall kick)
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
const GRAVITY = [48, 40, 33, 27, 22, 18, 14, 11, 8, 6, 5, 4, 3, 2, 1]; // frames per row at each level
const LOCK_FRAMES = 30, MAX_LOCK_RESETS = 15, CLEAR_FRAMES = 26;
const DAS = 10, ARR = 2; // frames before a held key repeats, and between repeats
const LINE_SCORES = [0, 100, 300, 500, 800];
const NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'CANDY DROP!'];

let board, cur, hold, canHold, bag, queue;
let score, shownScore, lines, level, best, combo, newBest;
let state = 'play'; // play | over
let paused = false;
let fallT, lockT, lockResets, clearing; // clearing: { rows, t } while full lines flash
let keys = { left: false, right: false, down: false }, dasT = 0, softT = 0;
let parts = [], pops = [];
let shake = 0, bgT = 0, overT = 0;
let stars = [];
let touch = null; // the finger steering the piece
let holdRect = { x: 0, y: 0, w: 0, h: 0 };
// layout, set in layout()
let cell, gx, gy, wide, L;

try { best = Number(localStorage.getItem('candydrop-best')) || 0; } catch { best = 0; }
function saveBest() { try { localStorage.setItem('candydrop-best', String(best)); } catch { /* storage unavailable */ } }

// --- layout: side panels on wide windows, a header with hold and next on narrow ones ---
function layout() {
  W = window.innerWidth;
  H = window.innerHeight;
  // back the canvas with real device pixels so the smooth hi-bit sprites stay sharp on retina screens; drawing stays in CSS pixels
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min(W / 480, H / 800);
  const sideNeed = 4.6;
  const cellWide = Math.min((W - 24) / (COLS + 2 * sideNeed), (H - 40) / ROWS);
  const cellNarrow = Math.min((W - 24) / COLS, (H - 56) / (ROWS + 4.7));
  wide = cellWide >= cellNarrow;
  cell = Math.max(8, Math.floor(wide ? cellWide : cellNarrow));
  gx = Math.floor((W - cell * COLS) / 2);
  gy = Math.floor(wide ? (H - cell * ROWS) / 2 : H - 36 - cell * ROWS);
  L = {};
  if (wide) {
    const bw = cell * 4, left = gx - cell * 0.8 - bw, right = gx + cell * COLS + cell * 0.8;
    L.hold = { x: left, y: gy, w: bw, h: cell * 3.2 };
    L.stats = { x: left, y: gy + cell * 4.2 };
    L.next = { x: right, y: gy, w: bw, h: cell * 9.8 };
    L.nextPs = cell * 0.7;
  } else {
    const top = Math.max(4, gy - cell * 4.7), by = top + cell * 1.7;
    L.hold = { x: gx, y: by, w: cell * 3.2, h: cell * 2.9 };
    L.next = { x: gx + cell * COLS - cell * 5.4, y: by, w: cell * 5.4, h: cell * 2.9 };
    L.nextPs = cell * 0.4;
    L.statsY = top;
  }
  holdRect = L.hold;
  makeStars();
}

// --- pieces ---
function rotateCW(m) { const n = m.length, o = m.map(r => r.map(() => 0)); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) o[c][n - 1 - r] = m[r][c]; return o; }
function rotateCCW(m) { const n = m.length, o = m.map(r => r.map(() => 0)); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) o[n - 1 - c][r] = m[r][c]; return o; }
function cellsOf(m) { const out = []; m.forEach((row, r) => row.forEach((v, c) => { if (v) out.push([r, c]); })); return out; }

function nextType() {
  if (!bag.length) { bag = [...TYPES]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } } // 7-bag: every piece shows up once per round
  return bag.pop();
}
function takeNext() {
  while (queue.length < 4) queue.push(nextType());
  return queue.shift();
}

function spawn(type) {
  const m = PIECES[type].m.map(r => [...r]);
  const firstRow = m.findIndex(r => r.some(Boolean));
  cur = { type, m, x: Math.floor((COLS - m.length) / 2), y: -firstRow };
  fallT = 0; lockT = 0; lockResets = 0;
  if (!fits(cur.m, cur.x, cur.y)) { endGame(); return false; }
  return true;
}

function fits(m, x, y) {
  for (const [r, c] of cellsOf(m)) {
    const rr = y + r, cc = x + c;
    if (cc < 0 || cc >= COLS || rr >= ROWS) return false;
    if (rr >= 0 && board[rr][cc]) return false;
  }
  return true;
}
function grounded() { return !fits(cur.m, cur.x, cur.y + 1); }
function ghostY() { let y = cur.y; while (fits(cur.m, cur.x, y + 1)) y++; return y; }

// moving or turning a grounded piece buys a little more time, up to a limit
function touched() {
  if (grounded() && lockResets < MAX_LOCK_RESETS) { lockT = 0; lockResets++; }
}

function move(dx) {
  if (!active()) return false;
  if (!fits(cur.m, cur.x + dx, cur.y)) return false;
  cur.x += dx;
  sfx.move();
  touched();
  return true;
}

function rotatePiece(dir) {
  if (!active() || cur.type === 'O') return;
  const m = dir > 0 ? rotateCW(cur.m) : rotateCCW(cur.m);
  for (const [kx, ky] of KICKS) {
    if (fits(m, cur.x + kx, cur.y + ky)) {
      cur.m = m; cur.x += kx; cur.y += ky;
      sfx.rotate();
      touched();
      return;
    }
  }
}

function softStep() {
  if (!active()) return;
  if (fits(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 1; fallT = 0; }
}

function hardDrop() {
  if (!active()) return;
  const y = ghostY(), d = y - cur.y;
  // a few pixel streaks along the path
  for (const [r, c] of cellsOf(cur.m)) {
    for (let k = 0; k < 2; k++) parts.push({ x: gx + (cur.x + c + Math.random()) * cell, y: gy + (cur.y + r + Math.random() * Math.max(1, d)) * cell, vx: 0, vy: 0.5 * scale, color: PIECES[cur.type].color, life: 14, max: 14, size: 3 * scale });
  }
  cur.y = y;
  score += 2 * d;
  sfx.hardDrop();
  shake = Math.max(shake, 3);
  lock();
}

function active() { return state === 'play' && !paused && !clearing && cur; }

function holdPiece() {
  if (!active() || !canHold) return;
  const type = cur.type;
  const swap = hold;
  hold = type;
  canHold = false;
  sfx.hold();
  spawn(swap || takeNext());
}

function lock() {
  const color = PIECES[cur.type].color;
  let outOfBounds = false;
  for (const [r, c] of cellsOf(cur.m)) {
    const rr = cur.y + r, cc = cur.x + c;
    if (rr < 0) { outOfBounds = true; continue; }
    board[rr][cc] = { color, pop: 1 };
  }
  sfx.lock();
  canHold = true;
  const full = [];
  for (let r = 0; r < ROWS; r++) if (board[r].every(Boolean)) full.push(r);
  cur = null;
  if (outOfBounds) { endGame(); return; }
  if (full.length) {
    clearing = { rows: full, t: 0 };
    for (const r of full) for (let c = 0; c < COLS; c++) burst(r, c, board[r][c].color);
    const gain = LINE_SCORES[full.length] * level + (combo > 0 ? 50 * combo * level : 0);
    score += gain;
    lines += full.length;
    sfx.clear(full.length);
    popText(NAMES[full.length], gx + cell * COLS / 2, gy + cell * 6, Math.min(30, cell * 0.8), full.length === 4 ? '#ffd24d' : '#fff', 70);
    popText('+' + gain, gx + cell * COLS / 2, gy + cell * 7.4, Math.min(22, cell * 0.55), '#ffb3e6');
    if (combo > 0) popText('COMBO x' + (combo + 1), gx + cell * COLS / 2, gy + cell * 8.8, Math.min(20, cell * 0.5), '#ff6bd1', 60);
    combo++;
    shake = Math.max(shake, 2 + full.length * 2);
    const newLevel = 1 + Math.floor(lines / 10);
    if (newLevel > level) {
      level = newLevel;
      sfx.levelUp();
      popText('LEVEL ' + level, gx + cell * COLS / 2, gy + cell * 4, Math.min(34, cell * 0.9), '#6bd86b', 90);
    }
  } else {
    combo = 0;
    spawn(takeNext());
  }
  if (score > best) { if (!newBest && best > 0) { newBest = true; sfx.record(); } best = score; saveBest(); }
}

function finishClear() {
  const rows = clearing.rows;
  board = board.filter((_, r) => !rows.includes(r));
  while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
  clearing = null;
  spawn(takeNext());
}

function endGame() {
  state = 'over'; overT = 0; cur = null; touch = null;
  keys = { left: false, right: false, down: false };
  sfx.setMusic(false);
  sfx.gameOver();
}

function reset() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bag = []; queue = []; hold = null; canHold = true; cur = null; clearing = null;
  score = 0; shownScore = 0; lines = 0; level = 1; combo = 0; newBest = false;
  parts = []; pops = [];
}

function startGame() {
  reset();
  state = 'play';
  paused = false;
  sfx.setMusic(true);
  spawn(takeNext());
}

function popText(str, x, y, size, color, life = 55) { pops.push({ str, x, y, size, color, life, max: life }); }

function burst(r, c, color) {
  const cx = gx + c * cell + cell / 2, cy = gy + r * cell + cell / 2;
  parts.push({ flash: true, x: cx, y: cy, life: 14, max: 14, size: cell });
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2, v = (1 + Math.random() * 3.5) * scale;
    parts.push({
      x: cx + (Math.random() - 0.5) * cell * 0.6, y: cy + (Math.random() - 0.5) * cell * 0.6,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5 * scale, color: Math.random() < 0.25 ? '#ffd24d' : color,
      life: 30 + Math.random() * 22, max: 52, size: (3 + Math.random() * 4) * scale,
    });
  }
}

// --- input ---
function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return [(e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)];
}
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function resume() { paused = false; sfx.setMusic(true); }
function pause() { paused = true; keys = { left: false, right: false, down: false }; touch = null; sfx.setMusic(false); }

canvas.addEventListener('pointerdown', e => {
  sfx.unlock();
  const [x, y] = pointerPos(e);
  if (paused) { resume(); return; }
  if (state === 'over') { if (overT > 45) startGame(); return; }
  if (inRect(x, y, holdRect)) { holdPiece(); return; }
  if (e.pointerType === 'mouse') return; // the mouse only clicks; touch steers
  touch = { ax: x, ay: y, sx: x, sy: y, t: performance.now(), moved: false };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  if (!touch) return;
  const [x, y] = pointerPos(e), step = cell * 0.85;
  if (Math.hypot(x - touch.sx, y - touch.sy) > 10) touch.moved = true;
  while (x - touch.ax >= step) { move(1); touch.ax += step; }
  while (touch.ax - x >= step) { move(-1); touch.ax -= step; }
  if (Math.abs(y - touch.sy) > Math.abs(x - touch.sx)) { // mostly vertical: soft drop with the finger
    while (y - touch.ay >= step) { softStep(); touch.ay += step; }
  } else touch.ay = Math.max(touch.ay, y);
});

function endTouch(e) {
  if (!touch) return;
  const [x, y] = pointerPos(e), dt = performance.now() - touch.t, dy = y - touch.sy, dx = x - touch.sx;
  if (e.type === 'pointerup') {
    if (!touch.moved && dt < 300) rotatePiece(1); // a quick tap turns the piece
    else if (dy > cell * 2.5 && dy / Math.max(dt, 1) > 0.7 && Math.abs(dx) < dy * 0.6) hardDrop(); // a fast flick down drops it
  }
  touch = null;
}
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);

const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowDown: 'down', s: 'down', S: 'down' };
addEventListener('keydown', e => {
  sfx.unlock();
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(k)) e.preventDefault();
  if (k === 'm' || k === 'M') { sfx.toggleMute(); return; }
  if (state !== 'play') {
    if ((k === ' ' || k === 'Enter') && (state === 'over' && overT > 45)) startGame();
    return;
  }
  if (k === 'Escape' || k === 'p' || k === 'P') { paused ? resume() : pause(); return; }
  if (paused) return;
  if (KEYMAP[k]) {
    const dir = KEYMAP[k];
    if (!keys[dir]) {
      keys[dir] = true;
      if (dir === 'left') { keys.right = false; dasT = 0; move(-1); }
      if (dir === 'right') { keys.left = false; dasT = 0; move(1); }
      if (dir === 'down') softT = 0;
    }
    return;
  }
  if (e.repeat) return;
  if (k === 'ArrowUp' || k === 'x' || k === 'X' || k === 'w' || k === 'W') rotatePiece(1);
  else if (k === 'z' || k === 'Z') rotatePiece(-1);
  else if (k === ' ') hardDrop();
  else if (k === 'c' || k === 'C' || k === 'Shift') holdPiece();
});
addEventListener('keyup', e => { if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false; });
addEventListener('blur', () => { if (state === 'play' && !paused) pause(); });
addEventListener('resize', layout);

// --- update ---
function update() {
  if (paused) return;
  bgT++;
  shake *= 0.86;
  if (state === 'over') overT++;
  shownScore += Math.ceil((score - shownScore) * 0.12);
  if (shownScore > score) shownScore = score;

  parts = parts.filter(d => {
    if (!d.flash) { d.x += d.vx; d.y += d.vy; d.vy += 0.22 * scale; }
    return --d.life > 0;
  });
  pops = pops.filter(t => { t.y -= 0.35 * scale; return --t.life > 0; });
  for (const row of board || []) for (const g of row) if (g && g.pop > 0) g.pop = Math.max(0, g.pop - 0.1);

  if (state !== 'play') return;
  if (clearing) { if (++clearing.t >= CLEAR_FRAMES) finishClear(); return; }
  if (!cur) return;

  // held keys repeat after a short delay
  if (keys.left || keys.right) {
    dasT++;
    if (dasT >= DAS && (dasT - DAS) % ARR === 0) move(keys.left ? -1 : 1);
  }
  if (keys.down && ++softT % 2 === 0) softStep();

  // gravity
  if (++fallT >= GRAVITY[Math.min(level - 1, GRAVITY.length - 1)]) {
    fallT = 0;
    if (fits(cur.m, cur.x, cur.y + 1)) cur.y++;
  }
  // lock delay: a piece resting on the stack settles after a moment
  if (grounded()) { if (++lockT >= LOCK_FRAMES) lock(); } else lockT = 0;
}

// --- drawing ---
function text(str, x, y, size, color = '#fff', align = 'center') {
  ctx.fillStyle = color; ctx.font = graphics.font(size); ctx.textAlign = align;
  ctx.fillText(str, x, y);
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
function drawBlock(x, y, cs, color) {
  const gap = Math.max(1, Math.round(cs / 14));
  if (graphics.hibit) { hi.brick(ctx, x + gap / 2, y + gap / 2, cs - gap, cs - gap, color); return; }
  pixelBox(x + gap / 2, y + gap / 2, cs - gap, cs - gap, color, Math.max(2, Math.round(cs / 9)));
}

function makeStars() {
  stars = [];
  const n = Math.round(W * H / 7000);
  for (let i = 0; i < n; i++)
    stars.push({ x: Math.random() * W, y: Math.random() * H, layer: i % 3, color: COLORS[i % COLORS.length], phase: Math.random() * 6.28 });
}

function drawBackground() {
  const gap = 70 * scale, off = (bgT * 0.25 * scale) % (gap * COLORS.length);
  ctx.lineWidth = gap * 0.5;
  for (let i = -Math.ceil(H / gap) - 1; i < Math.ceil((W + H) / gap) + COLORS.length; i++) {
    ctx.strokeStyle = COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];
    ctx.globalAlpha = 0.045;
    const x = i * gap + off;
    ctx.beginPath(); ctx.moveTo(x + gap, -gap); ctx.lineTo(x - H - gap, H + gap); ctx.stroke();
  }
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

// a dark panel with a pixel border
function panel(x, y, w, h, px) {
  if (graphics.hibit) { hi.panel(ctx, x - px, y - px, w + 2 * px, h + 2 * px, cell * 0.35); return; }
  ctx.fillStyle = '#34345a'; ctx.fillRect(x - px, y - px, w + 2 * px, h + 2 * px);
  ctx.fillStyle = '#05050f'; ctx.fillRect(x - px, y + h, w + 2 * px, px); ctx.fillRect(x + w, y - px, px, h + 2 * px);
  ctx.fillStyle = '#1e1e38'; ctx.fillRect(x, y, w, h);
}

function drawBoard() {
  const bw = cell * COLS, bh = cell * ROWS, px = Math.max(2, Math.round(cell / 9)), pad = Math.max(3, Math.round(cell * 0.15));
  panel(gx - pad, gy - pad, bw + 2 * pad, bh + 2 * pad, px);
  const gap = Math.max(1, Math.round(cell / 14));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = gx + c * cell, y = gy + r * cell, g = board[r][c];
    if (!g) {
      if (graphics.hibit) hi.socket(ctx, x + gap / 2, y + gap / 2, cell - gap, cell - gap);
      else { ctx.fillStyle = '#15152b'; ctx.fillRect(Math.round(x + gap / 2), Math.round(y + gap / 2), cell - gap, cell - gap); }
    } else if (clearing && clearing.rows.includes(r)) {
      const blink = Math.floor(clearing.t / 3) % 2 ? g.color : '#ffffff'; // blink white before the line goes
      if (graphics.hibit) hi.brick(ctx, x + gap / 2, y + gap / 2, cell - gap, cell - gap, blink);
      else { ctx.fillStyle = blink; ctx.fillRect(Math.round(x + gap / 2), Math.round(y + gap / 2), cell - gap, cell - gap); }
    } else {
      const s = 1 + g.pop * 0.18, cs = cell * s, o = (cell - cs) / 2;
      drawBlock(x + o, y + o, cs, g.color);
    }
  }
  if (cur && state === 'play') {
    const color = PIECES[cur.type].color, gyy = ghostY();
    ctx.globalAlpha = 0.28;
    for (const [r, c] of cellsOf(cur.m)) if (gyy + r >= 0) drawBlock(gx + (cur.x + c) * cell, gy + (gyy + r) * cell, cell, color); // landing preview
    ctx.globalAlpha = 1;
    for (const [r, c] of cellsOf(cur.m)) if (cur.y + r >= 0) drawBlock(gx + (cur.x + c) * cell, gy + (cur.y + r) * cell, cell, color);
  }
}

// a piece centered in a box, drawn at preview size
function drawMini(type, cx, cy, ps, alpha = 1) {
  const cells = cellsOf(PIECES[type].m);
  const minR = Math.min(...cells.map(p => p[0])), maxR = Math.max(...cells.map(p => p[0]));
  const minC = Math.min(...cells.map(p => p[1])), maxC = Math.max(...cells.map(p => p[1]));
  const ox = cx - (maxC - minC + 1) * ps / 2, oy = cy - (maxR - minR + 1) * ps / 2;
  ctx.globalAlpha = alpha;
  for (const [r, c] of cells) drawBlock(ox + (c - minC) * ps, oy + (r - minR) * ps, ps, PIECES[type].color);
  ctx.globalAlpha = 1;
}

function drawBox(r, label) {
  const px = Math.max(2, Math.round(cell / 12));
  panel(r.x, r.y, r.w, r.h, px);
  text(label, r.x + r.w / 2, r.y + Math.max(11, cell * 0.5), Math.max(7, Math.round(cell * 0.3)), '#aaa');
}

function drawHud() {
  const sz = Math.max(8, Math.round(cell * 0.3));
  drawBox(L.hold, 'HOLD');
  if (hold) drawMini(hold, L.hold.x + L.hold.w / 2, L.hold.y + L.hold.h * 0.6, cell * (wide ? 0.7 : 0.55), canHold ? 1 : 0.35);
  drawBox(L.next, 'NEXT');
  if (wide) {
    for (let i = 0; i < 3; i++) if (queue[i]) drawMini(queue[i], L.next.x + L.next.w / 2, L.next.y + cell * (2.2 + i * 2.9), L.nextPs);
  } else {
    for (let i = 0; i < 3; i++) if (queue[i]) drawMini(queue[i], L.next.x + L.next.w * (0.2 + i * 0.3), L.next.y + L.next.h * 0.6, L.nextPs);
  }
  if (wide) {
    const x = L.stats.x, y = L.stats.y, big = Math.min(26, cell * 0.6);
    text('SCORE', x, y, sz, '#aaa', 'left'); text(String(shownScore), x, y + big * 1.3, big, '#fff', 'left');
    text('LEVEL', x, y + big * 3.2, sz, '#aaa', 'left'); text(String(level), x, y + big * 4.5, big, '#ffd24d', 'left');
    text('LINES', x, y + big * 6.4, sz, '#aaa', 'left'); text(String(lines), x, y + big * 7.7, big, '#6bd86b', 'left');
    text('BEST', x, y + big * 9.6, sz, '#aaa', 'left'); text(String(best), x, y + big * 10.9, big * 0.8, '#ff6bd1', 'left');
  } else {
    const y = L.statsY + cell * 0.55, big = Math.min(22, cell * 0.6), px = gx + cell * COLS;
    const sx = Math.max(gx, 52); // clear of the back button
    text('SCORE', sx, y, sz, '#aaa', 'left'); text(String(shownScore), sx, y + big * 1.2, big, '#fff', 'left');
    text('LEVEL', gx + cell * 5.6, y, sz, '#aaa', 'center'); text(String(level), gx + cell * 5.6, y + big * 1.2, big, '#ffd24d', 'center');
    text('LINES', px, y, sz, '#aaa', 'right'); text(String(lines), px, y + big * 1.2, big, '#6bd86b', 'right');
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
  drawHud(); drawBoard(); drawFx();
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    text('Paused', W / 2, H / 2 - 10, Math.min(32, W * 0.08));
    text(TOUCH ? 'Tap to resume' : 'Press Esc or click to resume', W / 2, H / 2 + 30, 12, '#ccc');
  }
  if (state === 'over') {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, overT / 60)})`; ctx.fillRect(0, 0, W, H);
    if (overT > 20) {
      text('Game over', W / 2, H / 2 - 40, Math.min(32, W * 0.08));
      text('Score ' + score, W / 2, H / 2, 14, '#fff');
      text('Level ' + level + '  ·  Lines ' + lines, W / 2, H / 2 + 26, 10, '#aaa');
      text(newBest ? 'New best!' : 'Best ' + best, W / 2, H / 2 + 52, 12, '#ffd24d');
      if (overT > 45) text(START + ' to play again', W / 2, H / 2 + 90, 12, '#ccc');
    }
  }
  ctx.restore();
}

if (TOUCH) document.getElementById('hint').textContent = 'Drag: move  ·  Tap: rotate  ·  Flick down: drop  ·  Tap HOLD: swap';

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
startGame();
requestAnimationFrame(loop);

installBackButton({ pause, resume, isPlaying: () => state === 'play' && !paused });
