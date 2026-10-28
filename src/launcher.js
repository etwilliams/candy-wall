import '@fontsource/press-start-2p';
import { sfx } from './launcher-sound.js';
import { graphics } from './graphics.js';
import * as hi from './wall-hibit.js';
import { CANDIES, drawCandy } from './candies.js';
import { enableMobileFullscreen } from './fullscreen.js';
import { registerServiceWorker } from './pwa.js';

enableMobileFullscreen();
registerServiceWorker();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H, scale;
const COLORS = ['#ff4d4d', '#ff944d', '#ffd24d', '#6bd86b', '#4dc3ff', '#9b6bff', '#ff6bd1'];
const TOUCH = matchMedia('(pointer: coarse)').matches;

const GAMES = [
  { name: 'CANDY WALL', blurb: 'Break the wall', href: './wall.html', art: drawWallArt },
  { name: 'CANDY GRID', blurb: 'Fill the lines', href: './candygrid.html', art: drawGridArt },
  { name: 'CANDY DROP', blurb: 'Stack the candy', href: './candydrop.html', art: drawDropArt },
  { name: 'CANDY POP', blurb: 'Match the sweets', href: './candypop.html', art: drawPopArt },
];

if (TOUCH) document.getElementById('hint').textContent = 'Tap a game to play';

let sel = 0, hover = -1, bgT = 0, introT = 0, leaveT = 0;
let stars = [], cards = [], panel = null, musicRow = null, soundRow = null, gfxRow = null, animRow = null, closeBtn = null;
let settingsOpen = false, hoverCol = 0; // hoverCol: the grid column to return to when moving up from settings

function layout() {
  W = window.innerWidth;
  H = window.innerHeight;
  // back the canvas with real device pixels so the smooth hi-bit sprites stay sharp on retina screens; drawing stays in CSS pixels
  const dpr = graphics.dpr();
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min(W / 480, H / 800);
  // a two-column grid of games with a wide settings button as the last tile
  const gap = Math.round(20 * Math.max(0.6, scale)), tsize = Math.min(76, W * 0.9 / 10), top = Math.max(tsize, H * 0.13) + tsize * 0.95 + 30, avail = H - top - 36;
  const sh = Math.round(Math.max(44, Math.min(72, avail * 0.12)));
  const rowsH = (avail - sh - gap * 2) / 2;
  const cw = Math.min((W * 0.92 - gap) / 2, 300, rowsH * 1.15), ch = Math.min(rowsH, cw * 1.15);
  const total = ch * 2 + sh + gap * 2, x0 = W / 2 - cw - gap / 2, y0 = top + Math.max(0, (avail - total) / 2);
  cards = GAMES.map((_, i) => ({
    x: Math.round(x0 + (i % 2) * (cw + gap)), y: Math.round(y0 + Math.floor(i / 2) * (ch + gap)),
    w: Math.round(cw), h: Math.round(ch),
  }));
  cards.push({ x: Math.round(x0), y: Math.round(y0 + (ch + gap) * 2), w: Math.round(cw * 2 + gap), h: sh });
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

const SETTINGS = GAMES.length; // the settings tile is the last item in the grid
function go(i) {
  if (leaveT) return;
  if (i === SETTINGS) { sel = i; settingsOpen = true; sfx.select(); return; }
  sel = i; leaveT = 1;
  sfx.select();
}

canvas.addEventListener('pointerdown', e => {
  sfx.unlock(); sfx.startMusic();
  const [x, y] = pointerPos(e);
  if (settingsOpen) {
    if (hit(musicRow, x, y)) sfx.toggleMusic();
    else if (hit(soundRow, x, y)) sfx.toggleMute();
    else if (hit(gfxRow, x, y)) graphics.toggle();
    else if (hit(animRow, x, y)) graphics.toggleLite();
    else if (hit(closeBtn, x, y) || !hit(panel, x, y)) settingsOpen = false;
    return;
  }
  const i = cardAt(x, y);
  if (i >= 0 && introT > 40) go(i);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const i = cardAt(...pointerPos(e));
  if (i !== hover) { hover = i; if (i >= 0 && i !== sel) { sel = i; sfx.move(); } }
});

// rectangles are { x, y, w, h } (top-left origin); the gear button is a centre point with a half-size
function hit(r, x, y) {
  if (!r) return false;
  return r.w === undefined ? Math.abs(x - r.x) < r.s && Math.abs(y - r.y) < r.s : x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

addEventListener('keydown', e => {
  sfx.unlock(); sfx.startMusic();
  const k = e.key;
  if (k === 'm' || k === 'M') sfx.toggleMute();
  else if (k === 's' || k === 'S') go(SETTINGS);
  else if (settingsOpen) {
    if (k === 'Escape') settingsOpen = false;
    else if (k === 'n' || k === 'N') sfx.toggleMusic();
  }
  else if (k >= '1' && k <= String(GAMES.length)) go(Number(k) - 1);
  else if (k.startsWith('Arrow')) {
    const col = sel % 2;
    if (k === 'ArrowLeft' && sel !== SETTINGS && col === 1) sel--;
    else if (k === 'ArrowRight' && sel !== SETTINGS && col === 0) sel++;
    else if (k === 'ArrowUp' && sel === SETTINGS) sel = 2 + hoverCol;
    else if (k === 'ArrowUp' && sel >= 2) sel -= 2;
    else if (k === 'ArrowDown' && sel >= 2 && sel !== SETTINGS) { hoverCol = col; sel = SETTINGS; }
    else if (k === 'ArrowDown' && sel < 2) sel += 2;
    else return;
    sfx.move();
  } else if (k === 'Enter' || k === ' ') go(sel);
});
addEventListener('resize', layout);

// --- drawing helpers (same 8-bit look as the games) ---
function text(str, x, y, size, color = '#fff', align = 'center') {
  ctx.fillStyle = color; ctx.font = graphics.font(size); ctx.textAlign = align;
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
  if (graphics.hibit) { hi.brick(ctx, x, y, w, h, color); return; }
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
  if (graphics.hibit) { hi.ball(ctx, cx, cy, r, r, color); return; }
  const n = Math.max(1, Math.round(r * 2 / px)), top = Math.round(cy - n * px / 2);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const dy = (i + 0.5 - n / 2) * px, w = Math.round(r * Math.sqrt(Math.max(0, 1 - (dy / (n * px / 2)) ** 2)) / px) * px;
    if (w > 0) ctx.fillRect(Math.round(cx) - w, top + i * px, w * 2, px);
  }
}

// dark recess behind a mini game board, and an empty cell inside one
function well(x, y, w, h) {
  ctx.fillStyle = '#0d0d1c';
  if (graphics.hibit) { hi.roundedRect(ctx, x, y, w, h, Math.min(w, h) * 0.06); ctx.fill(); } else ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function socket(x, y, w, h, alt) {
  if (graphics.hibit) { hi.socket(ctx, x, y, w, h); return; }
  ctx.fillStyle = alt ? '#191932' : '#15152b'; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawBackground() {
  if (graphics.lite) return; // limited animations: a plain backdrop
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
  pixelDisc(ballX(bgT), bottom - (bottom - top) * up, r, '#ffffff', 3);
  const pw = w * 0.34, pxx = Math.max(x, Math.min(x + w - pw, ballX(bgT - 6) - pw / 2));
  pixelBox(pxx, paddleY, pw, bh * 0.8, '#c9cde0', bpx);
}

// a mini block grid with a nearly complete row
function drawGridArt(x, y, w, h) {
  const n = 5, s = Math.min(w, h) / n, ox = x + (w - s * n) / 2, oy = y + (h - s * n) / 2;
  const fill = ['#ff4d4d', '#ffd24d', '#6bd86b', '#4dc3ff', '#9b6bff', '#ff6bd1', '#ff944d'];
  const pat = ['.....', '.....', '##.##', '#####', '#..#.']; // a gap waiting for a piece
  well(ox, oy, s * n, s * n);
  pat.forEach((row, r) => [...row].forEach((ch, c) => {
    const gap = Math.max(1, Math.round(s / 14)), px = Math.max(2, Math.round(s / 9));
    if (ch === '#') pixelBox(ox + c * s + gap / 2, oy + r * s + gap / 2, s - gap, s - gap, fill[(r * 3 + c) % fill.length], px);
    else socket(ox + c * s + gap / 2, oy + r * s + gap / 2, s - gap, s - gap, false);
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

// a mini match-three board: a hinting pair swaps, the row of three pops and the candy above falls in
function drawPopArt(x, y, w, h) {
  const n = 5, s = Math.min(w, h) / n, ox = x + (w - s * n) / 2, oy = y + (h - s * n) / 2;
  const rows = ['14320', '23142', '30413', '45002', '02341'].map(r => [...r].map(Number)); // swapping (2,1) with (3,1) lines up three reds in row 3
  const t = bgT % 240, ease = k => k * k * (3 - 2 * k), clamp = k => Math.max(0, Math.min(1, k));
  const swap = ease(clamp((t - 70) / 16)), pop = clamp((t - 88) / 18), fall = ease(clamp((t - 108) / 24));
  well(ox, oy, s * n, s * n);
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, s * n, s * n); ctx.clip();
  ctx.globalAlpha = t < 20 ? t / 20 : t > 210 ? (240 - t) / 30 : 1;
  const gap = Math.max(1, Math.round(s / 14));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    socket(ox + c * s + gap / 2, oy + r * s + gap / 2, s - gap, s - gap, (r + c) % 2 === 0);
  }
  const candy = (type, col, row, scale = 1) => {
    if (scale <= 0.05) return;
    const k = CANDIES[type];
    drawCandy(ctx, k.mask, ox + (col + 0.5) * s, oy + (row + 0.5) * s, s * 0.84 * scale, scale < 1 ? shade(k.color, (1 - scale) * 0.8) : k.color, { hibit: graphics.hibit });
  };
  for (let c = 0; c < n; c++) {
    const inMatch = c >= 1 && c <= 3; // the three reds pop and the candy above them drops a row
    for (let r = 0; r < n; r++) {
      const endRow = c === 1 && r === 2 ? 3 : c === 1 && r === 3 ? 2 : r;
      let row = r + (endRow - r) * swap, scale = 1;
      if (inMatch && endRow === 3) { if (t >= 108) continue; scale = 1 - pop; }
      else if (inMatch && endRow < 3) row += fall;
      if (c === 1 && r === 2 && t > 20 && t < 70) row += Math.sin(t * 0.3) * 0.07;
      candy(rows[r][c], c, row, scale);
    }
    if (inMatch && t >= 108) candy((c * 2 + 1) % 6, c, -1 + fall); // a fresh candy drops into the top
  }
  ctx.restore();
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
const BOLT = [
  '....##..',
  '...##...',
  '..###...',
  '.######.',
  '...###..',
  '...##...',
  '..##....',
  '..#.....',
];
const GEM = [
  '..####..',
  '.#.##.#.',
  '########',
  '#.####.#',
  '.#.##.#.',
  '..#..#..',
  '...##...',
  '........',
];
const SPEAKER = [
  '...#....',
  '..##..#.',
  '####...#',
  '####.#.#',
  '####.#.#',
  '####...#',
  '..##..#.',
  '...#....',
];
// 12x12 gear: a ring with a hole and eight teeth, built from distances so it stays symmetric
const GEAR = Array.from({ length: 12 }, (_, r) => Array.from({ length: 12 }, (_, c) => {
  const dx = c - 5.5, dy = r - 5.5, d = Math.hypot(dx, dy);
  const tooth = d <= 6.2 && Math.abs(((Math.atan2(dy, dx) * 4 / Math.PI) % 1 + 1.5) % 1 - 0.5) < 0.2;
  return (d <= 4.4 && d >= 1.9) || (tooth && d > 3) ? '#' : '.';
}).join(''));
// smooth vector icons for the hi-bit settings: kind is note | speaker | gem | gear, centred on (cx, cy) with half-size r
function iconHi(kind, cx, cy, r, color, off) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(r, r);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 0.14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'note') {
    for (const [x, y] of [[-0.45, 0.5], [0.4, 0.3]]) { ctx.beginPath(); ctx.ellipse(x, y, 0.28, 0.2, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 0.22, y - 0.05); ctx.lineTo(x + 0.22, y - 0.95); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-0.23, -0.45); ctx.lineTo(0.62, -0.95); ctx.lineTo(0.62, -0.62); ctx.lineTo(-0.23, -0.12); ctx.closePath(); ctx.fill();
  } else if (kind === 'speaker') {
    ctx.beginPath(); ctx.moveTo(-0.9, -0.3); ctx.lineTo(-0.5, -0.3); ctx.lineTo(-0.05, -0.8); ctx.lineTo(-0.05, 0.8); ctx.lineTo(-0.5, 0.3); ctx.lineTo(-0.9, 0.3); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 0.13;
    for (const rr of [0.4, 0.75]) { ctx.beginPath(); ctx.arc(-0.05, 0, rr, -0.8, 0.8); ctx.stroke(); }
  } else if (kind === 'bolt') {
    ctx.beginPath(); ctx.moveTo(0.2, -0.95); ctx.lineTo(-0.6, 0.15); ctx.lineTo(-0.05, 0.15); ctx.lineTo(-0.25, 0.95); ctx.lineTo(0.6, -0.2); ctx.lineTo(0.05, -0.2); ctx.closePath(); ctx.fill();
  } else if (kind === 'gem') {
    ctx.beginPath(); ctx.moveTo(-0.5, -0.8); ctx.lineTo(0.5, -0.8); ctx.lineTo(0.95, -0.2); ctx.lineTo(0, 0.95); ctx.lineTo(-0.95, -0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(-0.95, -0.2); ctx.lineTo(0.95, -0.2); ctx.moveTo(-0.5, -0.8); ctx.lineTo(-0.25, -0.2); ctx.lineTo(0, 0.95); ctx.moveTo(0.5, -0.8); ctx.lineTo(0.25, -0.2); ctx.lineTo(0, 0.95); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, 0, 0.68, 0, Math.PI * 2); ctx.arc(0, 0, 0.3, 0, Math.PI * 2, true); ctx.fill('evenodd');
    for (let a = 0; a < 8; a++) { ctx.save(); ctx.rotate(a * Math.PI / 4); hi.roundedRect(ctx, -0.17, -0.97, 0.34, 0.4, 0.08); ctx.fill(); ctx.restore(); }
  }
  if (off) { ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 0.16; ctx.beginPath(); ctx.moveTo(-0.9, 0.9); ctx.lineTo(0.9, -0.9); ctx.stroke(); }
  ctx.restore();
}
function drawSprite(rows, x, y, px, color) {
  ctx.fillStyle = color;
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') ctx.fillRect(x + c * px, y + r * px, px, px); }));
}
const KIND = new Map([[NOTE, 'note'], [SPEAKER, 'speaker'], [GEM, 'gem'], [BOLT, 'bolt']]);
function drawSettings() {
  if (!settingsOpen) { panel = musicRow = soundRow = gfxRow = animRow = closeBtn = null; return; }
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
  const pw = Math.round(Math.min(W * 0.9, 420)), ph = Math.round(Math.min(H * 0.85, 460));
  const px = Math.max(2, Math.round(pw / 90));
  panel = { x: Math.round(W / 2 - pw / 2), y: Math.round(H / 2 - ph / 2), w: pw, h: ph };
  if (graphics.hibit) hi.panel(ctx, panel.x, panel.y, pw, ph, ph * 0.05);
  else {
  ctx.fillStyle = '#ff6bd1'; ctx.fillRect(panel.x - px, panel.y - px, pw + px * 2, ph + px * 2);
  ctx.fillStyle = '#1e1e38'; ctx.fillRect(panel.x, panel.y, pw, ph);
  }
  const fs = Math.max(10, Math.min(20, pw * 0.05));
  ctx.textBaseline = 'middle';
  text('SETTINGS', W / 2, panel.y + ph * 0.1, fs * 1.2, '#ffd24d');
  const rh = Math.round(ph * 0.12), rx = panel.x + Math.round(pw * 0.06), rw = pw - Math.round(pw * 0.12);
  const row = (label, off, y, icon, value, valueColor = '#4dc3ff') => {
    const nx = rx + Math.round(rh * 0.3), ny = Math.round(y + rh / 2 - px * 4);
    if (graphics.hibit) {
      const rg = ctx.createLinearGradient(0, y, 0, y + rh);
      rg.addColorStop(0, '#4e4e86'); rg.addColorStop(1, '#34345a');
      ctx.fillStyle = rg; hi.roundedRect(ctx, rx, y, rw, rh, rh * 0.28); ctx.fill();
      iconHi(KIND.get(icon), nx + px * 4, y + rh / 2, rh * 0.3, off && !value ? '#888' : '#ff6bd1', off && !value);
    } else {
    ctx.fillStyle = '#34345a'; ctx.fillRect(rx, y, rw, rh);
    drawSprite(icon, nx, ny, px, off ? '#666' : '#ff6bd1');
    }
    if (!graphics.hibit && off && !value) for (let i = 0; i < 8; i++) {
      ctx.fillStyle = '#1b1b2f'; ctx.fillRect(nx + i * px - px, ny + (7 - i) * px, px, px);
      ctx.fillStyle = '#ff4d4d'; ctx.fillRect(nx + i * px, ny + (7 - i) * px, px, px);
    }
    text(label, nx + px * 10, y + rh / 2, fs, '#fff', 'left');
    text(value || (off ? 'OFF' : 'ON'), rx + rw - rh * 0.3, y + rh / 2, fs, value ? valueColor : off ? '#ff4d4d' : '#6bd86b', 'right');
    return { x: rx, y, w: rw, h: rh };
  };
  musicRow = row('MUSIC', sfx.musicOff, Math.round(panel.y + ph * 0.24), NOTE);
  soundRow = row('SOUNDS', sfx.muted, Math.round(panel.y + ph * 0.24 + rh * 1.2), SPEAKER);
  gfxRow = row('GRAPHICS', false, Math.round(panel.y + ph * 0.24 + rh * 2.4), GEM, graphics.hibit ? 'HI-BIT' : '8-BIT');
  animRow = row('ANIMATIONS', false, Math.round(panel.y + ph * 0.24 + rh * 3.6), BOLT, graphics.lite ? 'LIMITED' : 'FULL', graphics.lite ? '#ffb84d' : '#6bd86b');
  const bh = Math.round(ph * 0.11), bw = Math.round(pw * 0.4);
  closeBtn = { x: Math.round(W / 2 - bw / 2), y: Math.round(panel.y + ph * 0.84), w: bw, h: bh };
  if (graphics.hibit) {
    const cg = ctx.createLinearGradient(0, closeBtn.y, 0, closeBtn.y + bh);
    cg.addColorStop(0, '#ff9be3'); cg.addColorStop(1, '#ff6bd1');
    ctx.fillStyle = cg; hi.roundedRect(ctx, closeBtn.x, closeBtn.y, bw, bh, bh * 0.28); ctx.fill();
  } else { ctx.fillStyle = '#ff6bd1'; ctx.fillRect(closeBtn.x, closeBtn.y, bw, bh); }
  text('CLOSE', W / 2, closeBtn.y + bh / 2, fs * 0.9, '#1b1b2f');
  ctx.textBaseline = 'alphabetic';
}

function drawTitle() {
  const title = 'SUGAR RUSH';
  const size = Math.min(76, W * 0.9 / title.length);
  const x0 = W / 2 - (title.length * size) / 2 + size / 2, rest = Math.max(size, H * 0.13);
  ctx.textBaseline = 'middle';
  const DROP = 45, STAGGER = 5;
  [...title].forEach((ch, i) => {
    if (ch === ' ') return;
    const t = graphics.lite ? 1 : Math.max(0, Math.min(1, (introT - i * STAGGER) / DROP)); // limited animations: no drop-in
    if (t === 0) return;
    let y = rest - (1 - easeOutBounce(t)) * (rest + size);
    if (t === 1 && !graphics.lite) y += Math.sin(introT * 0.07 + i * 0.7) * size * 0.07;
    const color = COLORS[(i + (t === 1 && !graphics.lite ? Math.floor(introT / 18) : 0)) % COLORS.length];
    text(ch, x0 + i * size, y + size * 0.08, size, 'rgba(0,0,0,0.5)');
    text(ch, x0 + i * size, y, size, color);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = graphics.lite ? 1 : Math.max(0, Math.min(1, (introT - 80) / 30));
  text(TOUCH ? 'Tap a game' : 'Pick a game', W / 2, rest + size * 0.95, Math.max(9, size * 0.28), '#ffb3e6');
  ctx.globalAlpha = 1;
}

function drawSettingsTile(c, on) {
  const gp = Math.max(2, Math.floor(c.h * 0.6 / 12));
  const label = 'SETTINGS', fs = Math.min(20, c.w * 0.075);
  ctx.font = graphics.font(fs);
  const iconW = gp * 12, gapW = 16, total = iconW + gapW + ctx.measureText(label).width; // centre icon and label together
  const gx = Math.round(c.x + c.w / 2 - total / 2), gy = Math.round(c.y + c.h / 2 - gp * 6);
  if (graphics.hibit) iconHi('gear', gx + gp * 6, gy + gp * 6, gp * 6, on ? '#ffd24d' : '#ff6bd1');
  else drawSprite(GEAR, gx, gy, gp, on ? '#ffd24d' : '#ff6bd1');
  ctx.textBaseline = 'middle';
  text(label, gx + iconW + gapW, c.y + c.h / 2, fs, '#fff', 'left');
  ctx.textBaseline = 'alphabetic';
}

function drawCard(i) {
  const c = cards[i], g = GAMES[i], on = i === sel;
  const t = graphics.lite ? 1 : Math.max(0, Math.min(1, (introT - 30 - i * 12) / 30)); // cards bounce in one after the other (not when animations are limited)
  if (t === 0) return;
  const lift = graphics.lite ? 0 : (1 - easeOutBounce(t)) * H * 0.5 + (on ? -4 * scale + Math.sin(bgT * 0.12) * 3 * scale : 0);
  const px = Math.max(2, Math.round(c.w / 70));
  ctx.save();
  ctx.translate(0, Math.round(lift));
  if (leaveT && on && !graphics.lite) { const k = leaveT / 24; ctx.translate(c.x + c.w / 2, c.y + c.h / 2); ctx.scale(1 + k * 0.15, 1 + k * 0.15); ctx.translate(-(c.x + c.w / 2), -(c.y + c.h / 2)); }
  if (graphics.hibit) {
    const cr = Math.min(c.w, c.h) * 0.07;
    hi.panel(ctx, c.x, c.y, c.w, c.h, cr);
    if (on) { // glowing rainbow selection ring
      ctx.save();
      ctx.shadowColor = COLORS[Math.floor(bgT / 10) % COLORS.length]; ctx.shadowBlur = graphics.lite ? 0 : px * 6;
      ctx.strokeStyle = ctx.shadowColor; ctx.lineWidth = px * 1.5;
      hi.roundedRect(ctx, c.x - px, c.y - px, c.w + px * 2, c.h + px * 2, cr + px); ctx.stroke();
      ctx.restore();
    }
  } else {
  if (on) { ctx.fillStyle = COLORS[Math.floor(bgT / 10) % COLORS.length]; ctx.fillRect(c.x - px * 2, c.y - px * 2, c.w + px * 4, c.h + px * 4); } // rippling selection frame
  ctx.fillStyle = '#34345a'; ctx.fillRect(c.x - px, c.y - px, c.w + px * 2, c.h + px * 2);
  ctx.fillStyle = '#1e1e38'; ctx.fillRect(c.x, c.y, c.w, c.h);
  }
  if (i === SETTINGS) { drawSettingsTile(c, on); ctx.restore(); return; }
  const artH = c.h * 0.68, pad = c.w * 0.06;
  well(c.x + pad, c.y + pad, c.w - pad * 2, artH - pad);
  if (graphics.lite) { const t = bgT; bgT = 40; g.art(c.x + pad, c.y + pad, c.w - pad * 2, artH - pad); bgT = t; } // previews hold still
  else g.art(c.x + pad, c.y + pad, c.w - pad * 2, artH - pad);
  text(g.name, c.x + c.w / 2, c.y + artH + (c.h - artH) * 0.45, Math.min(20, c.w * 0.075), '#fff');
  text(g.blurb, c.x + c.w / 2, c.y + artH + (c.h - artH) * 0.8, Math.min(10, c.w * 0.038), on ? '#ffd24d' : '#aaa');
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawTitle();
  cards.forEach((_, i) => drawCard(i));
  drawSettings();
}

// fixed 60 Hz simulation: a 120/144 Hz display draws more often but nothing runs faster
const STEP_MS = 1000 / 60;
let lastFrame = 0, accumulator = 0;
function update() {
  bgT++; introT++;
  if (leaveT && ++leaveT > (graphics.lite ? 8 : 24)) location.href = GAMES[sel].href;
}
function loop(now) {
  if (!lastFrame) lastFrame = now;
  accumulator += Math.min(100, now - lastFrame);
  lastFrame = now;
  while (accumulator >= STEP_MS) { update(); accumulator -= STEP_MS; }
  if (!graphics.skipFrame()) draw();
  requestAnimationFrame(loop);
}
layout();
requestAnimationFrame(loop);

// start the music as soon as the page is up (when arriving from a game the browser already allows sound; on a cold
// visit it begins at the first tap or key press instead), and again when the page is restored from the back button
sfx.startMusic();
addEventListener('pageshow', e => { if (e.persisted) { sfx.unlock(); sfx.startMusic(); } });
