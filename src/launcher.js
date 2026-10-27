import '@fontsource/press-start-2p';
import { sfx } from './launcher-sound.js';
import { enableMobileFullscreen } from './fullscreen.js';

enableMobileFullscreen();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H, scale;
const COLORS = ['#ff4d4d', '#ff944d', '#ffd24d', '#6bd86b', '#4dc3ff', '#9b6bff', '#ff6bd1'];
const TOUCH = matchMedia('(pointer: coarse)').matches;

const GAMES = [
  { name: 'CANDY WALL', blurb: 'Break the wall', href: './wall.html', art: drawWallArt },
  { name: 'CANDY GRID', blurb: 'Fill the lines', href: './candygrid.html', art: drawGridArt },
  { name: 'CANDY DROP', blurb: 'Stack the candy', href: './candydrop.html', art: drawDropArt },
];

if (TOUCH) document.getElementById('hint').textContent = 'Tap a game to play';

let sel = 0, hover = -1, bgT = 0, introT = 0, leaveT = 0;
let stars = [], cards = [], musicBtn = { x: 0, y: 0, s: 0 };
try { sfx.toggleMusic(); if (localStorage.getItem('launcher-music') !== 'off') sfx.toggleMusic(); } catch { /* storage unavailable: music stays on */ }

function layout() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  scale = Math.min(W / 480, H / 800);
  const n = GAMES.length, wide = W > H * 1.1, gap = Math.round(24 * Math.max(0.6, scale));
  const cw = wide ? Math.min((W * 0.94 - gap * (n - 1)) / n, 300) : Math.min(W * 0.84, 340);
  const ch = wide ? Math.min(H * 0.55, cw * 1.15) : Math.min((H * 0.74 - gap * (n - 1)) / n, cw * 0.78);
  const total = wide ? cw * n + gap * (n - 1) : ch * n + gap * (n - 1);
  const top = wide ? H / 2 - ch / 2 + H * 0.06 : H * 0.2 + (H * 0.78 - total) / 2;
  cards = GAMES.map((_, i) => ({
    x: Math.round(wide ? W / 2 - total / 2 + i * (cw + gap) : W / 2 - cw / 2),
    y: Math.round(wide ? top : top + i * (ch + gap)),
    w: Math.round(cw), h: Math.round(ch),
  }));
  stars = [];
  const starCount = Math.round(W * H / 7000);
  for (let i = 0; i < starCount; i++)
    stars.push({ x: Math.random() * W, y: Math.random() * H, layer: i % 3, color: COLORS[i % COLORS.length], phase: Math.random() * 6.28 });
}

// --- input ---
function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return [(e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)];
}
function cardAt(x, y) { return cards.findIndex(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h); }

function go(i) {
  if (leaveT) return;
  sel = i; leaveT = 1;
  sfx.select();
}

canvas.addEventListener('pointerdown', e => {
  sfx.unlock(); sfx.startMusic();
  const [x, y] = pointerPos(e);
  if (Math.abs(x - musicBtn.x) < musicBtn.s && Math.abs(y - musicBtn.y) < musicBtn.s) { toggleMusic(); return; }
  const i = cardAt(x, y);
  if (i >= 0 && introT > 40) go(i);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const i = cardAt(...pointerPos(e));
  if (i !== hover) { hover = i; if (i >= 0 && i !== sel) { sel = i; sfx.move(); } }
});

function toggleMusic() {
  const off = sfx.toggleMusic();
  try { localStorage.setItem('launcher-music', off ? 'off' : 'on'); } catch { /* storage unavailable */ }
}

addEventListener('keydown', e => {
  sfx.unlock(); sfx.startMusic();
  const k = e.key;
  if (k === 'm' || k === 'M') sfx.toggleMute();
  else if (k === 'n' || k === 'N') toggleMusic();
  else if (k >= '1' && k <= String(GAMES.length)) go(Number(k) - 1);
  else if (['ArrowLeft', 'ArrowUp'].includes(k) || ['ArrowRight', 'ArrowDown'].includes(k)) {
    sel = (sel + (k === 'ArrowLeft' || k === 'ArrowUp' ? GAMES.length - 1 : 1)) % GAMES.length;
    sfx.move();
  } else if (k === 'Enter' || k === ' ') go(sel);
});
addEventListener('resize', layout);

// --- drawing helpers (same 8-bit look as the games) ---
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
function pixelDisc(cx, cy, r, color, px) { // stepped ball
  const n = Math.max(1, Math.round(r * 2 / px)), top = Math.round(cy - n * px / 2);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const dy = (i + 0.5 - n / 2) * px, w = Math.round(r * Math.sqrt(Math.max(0, 1 - (dy / (n * px / 2)) ** 2)) / px) * px;
    if (w > 0) ctx.fillRect(Math.round(cx) - w, top + i * px, w * 2, px);
  }
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
    ctx.fillStyle = st.color;
    ctx.fillRect(Math.round(st.x), Math.round(y), size, size);
  }
  ctx.globalAlpha = 1;
}

// a mini breakout scene: rows of bricks, a paddle and a ball
function drawWallArt(x, y, w, h) {
  const cols = 6, rows = 4, g = Math.max(2, Math.round(w / 70));
  const bw = (w - g * (cols + 1)) / cols, bh = Math.min(bw * 0.5, h * 0.14), bpx = Math.max(2, Math.round(bh / 6));
  const r = Math.max(5, w * 0.035), PERIOD = 110, CONTACT = PERIOD / 2;
  const wallBottom = y + g + rows * (bh + g), paddleY = y + h - bh * 1.4;
  // the ball bounces between the paddle and the wall, sliding sideways; the brick it hits is knocked out and grows back a moment later
  const tri = (t, period) => { const p = (((t % period) + period) % period) / period; return p < 0.5 ? p * 2 : 2 - p * 2; };
  const ballX = t => x + r + tri(t + 40, 330) * (w - 2 * r);
  const lastContact = bgT - ((((bgT - CONTACT) % PERIOD) + PERIOD) % PERIOD); // time of the most recent touch of the wall
  const hitCol = Math.min(cols - 1, Math.max(0, Math.floor((ballX(lastContact) - x) / (w / cols))));
  const hidden = lastContact >= 0 && bgT - lastContact < 70 ? hitCol : -1;
  for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
    if (rr === rows - 1 && c === hidden) continue;
    pixelBox(x + g + c * (bw + g), y + g + rr * (bh + g), bw, bh, COLORS[(rr * 2 + c) % COLORS.length], bpx);
  }
  const up = tri(bgT, PERIOD), top = wallBottom + r, bottom = paddleY - r;
  pixelDisc(ballX(bgT), bottom - (bottom - top) * up, r, '#fff', 3);
  const pw = w * 0.34, pxx = Math.max(x, Math.min(x + w - pw, ballX(bgT - 6) - pw / 2));
  pixelBox(pxx, paddleY, pw, bh * 0.8, '#c9cde0', bpx);
}

// a mini block grid with a nearly complete row
function drawGridArt(x, y, w, h) {
  const n = 5, s = Math.min(w, h) / n, ox = x + (w - s * n) / 2, oy = y + (h - s * n) / 2;
  const fill = ['#ff4d4d', '#ffd24d', '#6bd86b', '#4dc3ff', '#9b6bff', '#ff6bd1', '#ff944d'];
  const pat = ['.....', '.....', '##.##', '#####', '#..#.']; // a gap waiting for a piece
  ctx.fillStyle = '#0d0d1c'; ctx.fillRect(Math.round(ox), Math.round(oy), Math.round(s * n), Math.round(s * n));
  pat.forEach((row, r) => [...row].forEach((ch, c) => {
    const gap = Math.max(1, Math.round(s / 14)), px = Math.max(2, Math.round(s / 9));
    if (ch === '#') pixelBox(ox + c * s + gap / 2, oy + r * s + gap / 2, s - gap, s - gap, fill[(r * 3 + c) % fill.length], px);
    else { ctx.fillStyle = '#15152b'; ctx.fillRect(Math.round(ox + c * s + gap / 2), Math.round(oy + r * s + gap / 2), Math.round(s - gap), Math.round(s - gap)); }
  }));
  // the gap's piece bobbing above the grid
  const bob = Math.sin(bgT * 0.08) * s * 0.12;
  pixelBox(ox + 2 * s + s * 0.07, oy + s * 0.55 + bob, s * 0.86, s * 0.86, '#ff944d', Math.max(2, Math.round(s / 9)));
}

// a mini falling-block scene: a stack with a gap and a piece dropping in
function drawDropArt(x, y, w, h) {
  const cols = 6, rows = 6, s = Math.min(w / cols, h / rows), ox = x + (w - s * cols) / 2, oy = y + (h - s * rows) / 2;
  const gap = Math.max(1, Math.round(s / 14)), px = Math.max(2, Math.round(s / 9));
  const stack = ['......', '......', '......', '#.....', '##.###', '######'];
  const col = ['#4dc3ff', '#ffd24d', '#9b6bff', '#6bd86b', '#ff4d4d', '#ff6bd1', '#ff944d'];
  stack.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') pixelBox(ox + c * s + gap / 2, oy + r * s + gap / 2, s - gap, s - gap, col[(r + c * 2) % col.length], px); }));
  // an upside-down T steps down one row at a time into the gap, rests there, then fades and starts over
  const t = bgT % 330, row = Math.min(3, Math.floor(t / 45));
  ctx.globalAlpha = t > 300 ? (330 - t) / 30 : 1;
  [[0, 0], [0, 1], [0, 2], [1, 1]].forEach(([r, c]) =>
    pixelBox(ox + (c + 1) * s + gap / 2, oy + (r + row) * s + gap / 2, s - gap, s - gap, '#9b6bff', px));
  ctx.globalAlpha = 1;
}

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
  const px = Math.max(2, Math.round(6 * Math.max(0.6, scale))), s = px * 8;
  const x = Math.round(W - s - 14), y = 14;
  musicBtn = { x: x + s / 2, y: y + s / 2, s: Math.max(s, 24) * 0.9 };
  const off = sfx.musicOff;
  ctx.fillStyle = off ? '#666' : '#ff6bd1';
  NOTE.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') ctx.fillRect(x + c * px, y + r * px, px, px); }));
  if (off) for (let i = 0; i < 8; i++) {
    ctx.fillStyle = '#1b1b2f'; ctx.fillRect(x + i * px - px, y + (7 - i) * px, px, px);
    ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x + i * px, y + (7 - i) * px, px, px);
  }
}

function drawTitle() {
  const title = 'CANDY ARCADE';
  const size = Math.min(48, W * 0.88 / title.length);
  const x0 = W / 2 - (title.length * size) / 2 + size / 2, rest = Math.max(size, H * 0.13);
  ctx.textBaseline = 'middle';
  const DROP = 45, STAGGER = 5;
  [...title].forEach((ch, i) => {
    if (ch === ' ') return;
    const t = Math.max(0, Math.min(1, (introT - i * STAGGER) / DROP));
    if (t === 0) return;
    let y = rest - (1 - easeOutBounce(t)) * (rest + size);
    if (t === 1) y += Math.sin(introT * 0.07 + i * 0.7) * size * 0.07;
    const color = COLORS[(i + (t === 1 ? Math.floor(introT / 18) : 0)) % COLORS.length];
    text(ch, x0 + i * size, y + size * 0.08, size, 'rgba(0,0,0,0.5)');
    text(ch, x0 + i * size, y, size, color);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = Math.max(0, Math.min(1, (introT - 80) / 30));
  text(TOUCH ? 'Tap a game' : 'Pick a game', W / 2, rest + size * 0.95, Math.max(9, size * 0.28), '#ffb3e6');
  ctx.globalAlpha = 1;
}

function drawCard(i) {
  const c = cards[i], g = GAMES[i], on = i === sel;
  const t = Math.max(0, Math.min(1, (introT - 30 - i * 12) / 30)); // cards bounce in one after the other
  if (t === 0) return;
  const lift = (1 - easeOutBounce(t)) * H * 0.5 + (on ? -4 * scale + Math.sin(bgT * 0.12) * 3 * scale : 0);
  const px = Math.max(2, Math.round(c.w / 70));
  ctx.save();
  ctx.translate(0, Math.round(lift));
  if (leaveT && on) { const k = leaveT / 24; ctx.translate(c.x + c.w / 2, c.y + c.h / 2); ctx.scale(1 + k * 0.15, 1 + k * 0.15); ctx.translate(-(c.x + c.w / 2), -(c.y + c.h / 2)); }
  if (on) { ctx.fillStyle = COLORS[Math.floor(bgT / 10) % COLORS.length]; ctx.fillRect(c.x - px * 2, c.y - px * 2, c.w + px * 4, c.h + px * 4); } // rippling selection frame
  ctx.fillStyle = '#34345a'; ctx.fillRect(c.x - px, c.y - px, c.w + px * 2, c.h + px * 2);
  ctx.fillStyle = '#1e1e38'; ctx.fillRect(c.x, c.y, c.w, c.h);
  const artH = c.h * 0.68, pad = c.w * 0.06;
  ctx.fillStyle = '#0d0d1c'; ctx.fillRect(c.x + pad, c.y + pad, c.w - pad * 2, artH - pad);
  g.art(c.x + pad, c.y + pad, c.w - pad * 2, artH - pad);
  text(g.name, c.x + c.w / 2, c.y + artH + (c.h - artH) * 0.45, Math.min(20, c.w * 0.075), '#fff');
  text(g.blurb, c.x + c.w / 2, c.y + artH + (c.h - artH) * 0.8, Math.min(10, c.w * 0.038), on ? '#ffd24d' : '#aaa');
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawTitle();
  GAMES.forEach((_, i) => drawCard(i));
  drawMusicButton();
}

// fixed 60 Hz simulation: a 120/144 Hz display draws more often but nothing runs faster
const STEP_MS = 1000 / 60;
let lastFrame = 0, accumulator = 0;
function update() {
  bgT++; introT++;
  if (leaveT && ++leaveT > 24) location.href = GAMES[sel].href;
}
function loop(now) {
  if (!lastFrame) lastFrame = now;
  accumulator += Math.min(100, now - lastFrame);
  lastFrame = now;
  while (accumulator >= STEP_MS) { update(); accumulator -= STEP_MS; }
  draw();
  requestAnimationFrame(loop);
}
layout();
requestAnimationFrame(loop);
