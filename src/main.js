import '@fontsource/press-start-2p';
import { sound } from './sound.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H;
const BASE_LIFT = 30, BOOST = 1.8; // paddle pop height (px at design size) and ball speed multiplier from a punched hit
let LIFT, scale, CAPSULE_W, CAPSULE_H; // scale: window size relative to the 640x480 design size
const BASE_W = 640; // speeds below are tuned for this width and scaled to the actual width

const COLORS = ['#ff4d4d', '#ff944d', '#ffd24d', '#6bd86b', '#4dc3ff', '#9b6bff', '#ff6bd1'];
const ROWS = 7, COLS = 10;
const BASE_H = 480;
// brick metrics at the 640x480 design size; layout() scales them to the window
const BASE_GAP = 4, BASE_TOP = 50, BASE_BH = 27;
let GAP, TOP, BH, BW;

const BALL_R = 10, BIG_SCALE = 1.8, MAX_BALLS = 9;
const PADDLE_W = 130, PADDLE_H = 14, WIDE_SCALE = 1.7, NARROW_SCALE = 0.6;
const EFFECT_FRAMES = 600; // ~10s at 60fps
const MISSILE_FRAMES = 480;
const MAX_LIVES = 5;
const DROP_CHANCE = 0.2;

// 8x8 pixel icons for the capsules ('#' = lit pixel)
const ICONS = {
  split: [ // three balls
    '........',
    '...##...',
    '...##...',
    '........',
    '.##..##.',
    '.##..##.',
    '........',
    '........',
  ],
  big: [ // a small ball inside a big one
    '..####..',
    '.#....#.',
    '#..##..#',
    '#.####.#',
    '#.####.#',
    '#..##..#',
    '.#....#.',
    '..####..',
  ],
  wide: [ // + over a long paddle (9 wide so the plus centers on a pixel)
    '....#....',
    '....#....',
    '..#####..',
    '....#....',
    '....#....',
    '.........',
    '.#######.',
    '#########',
  ],
  narrow: [ // - over a short paddle
    '.........',
    '.........',
    '.........',
    '..#####..',
    '.........',
    '.........',
    '...###...',
    '...###...',
  ],
  slow: [ // hourglass
    '########',
    '.######.',
    '..####..',
    '...##...',
    '...##...',
    '..#oo#..',
    '.#oooo#.',
    '########',
  ],
  fast: [ // lightning bolt
    '....###.',
    '...###..',
    '..###...',
    '.######.',
    '...###..',
    '..###...',
    '.###....',
    '.##.....',
  ],
  life: [ // heart
    '.##..##.',
    '########',
    '########',
    '########',
    '.######.',
    '..####..',
    '...##...',
    '........',
  ],
  sticky: [ // magnet ('o' marks the poles)
    'oo....oo',
    'oo....oo',
    '##....##',
    '##....##',
    '##....##',
    '.##..##.',
    '..####..',
    '........',
  ],
  shield: [
    '########',
    '##oooo##',
    '##oooo##',
    '##oooo##',
    '.##oo##.',
    '..####..',
    '...##...',
    '........',
  ],
  missile: [ // rocket pointing up ('o' is the accent color)
    '...##...',
    '..####..',
    '..####..',
    '..#oo#..',
    '..####..',
    '.######.',
    '.##..##.',
    '...oo...',
  ],
  fire: [ // flame with a bright core ('o' is the accent color)
    '....#...',
    '...##...',
    '..###.#.',
    '..#####.',
    '.###o###',
    '.##ooo##',
    '.##ooo##',
    '..####..',
  ],
};

// power-ups fall from bricks; power-downs (bad: true) have a low weight so they show up less often
const POWERUPS = {
  split:  { icon: ICONS.split, color: '#4dc3ff', weight: 3 },
  big:    { icon: ICONS.big, color: '#6bd86b', weight: 2 },
  wide:   { icon: ICONS.wide, color: '#ffd24d', weight: 3 },
  fire:   { icon: ICONS.fire, color: '#ff7a2f', iconColor: ['#5a1500', '#ffe08a'], weight: 2 },
  missile: { icon: ICONS.missile, color: '#b57bff', iconColor: ['#2a1450', '#ffd24d'], weight: 2 },
  slow:   { icon: ICONS.slow, color: '#35d6c0', iconColor: ['#08413b', '#eafffb'], weight: 2 },
  life:   { icon: ICONS.life, color: '#ff6b9a', weight: 0.8 },
  sticky: { icon: ICONS.sticky, color: '#c8e04d', iconColor: ['#2f3a05', '#ff4d4d'], weight: 2 },
  shield: { icon: ICONS.shield, color: '#dfe6f5', iconColor: ['#2d4a7a', '#7ab8ff'], weight: 1.5 },
  fast:   { icon: ICONS.fast, color: '#ff4d4d', weight: 1.2, bad: true },
  narrow: { icon: ICONS.narrow, color: '#ff4d4d', weight: 1.2, bad: true },
};
const BASE_CAPSULE_W = 46, BASE_CAPSULE_H = 25; // at the design size; layout() scales them

const paddle = { w: PADDLE_W, h: PADDLE_H, x: 0, y: 0, speed: 7, punch: 0 };
let balls, drops, missiles, sparks, debris, stuck;           // stuck: the single ball is resting on the paddle
let bigT, wideT, narrowT, missileT;          // remaining frames of timed effects

let bricks, lives, score, level, state; // state: 'title' | 'play' | 'lost'
let keys = {};
let paused = false;
let slowT = 0, fastT = 0, stickyT = 0, shield = false, speedMult = 1; // more effects: ball speed, sticky paddle, bottom shield
let shake = 0; // screen shake strength in design pixels; decays every frame
let bgT = 0, titleT = 0, stars = []; // animation clocks (frames) and the background starfield
const SLIDE_FRAMES = 110, BANNER_FRAMES = 150;
let slideT = 1, bannerT = 0; // slideT: 0..1 progress of the bricks sliding in; bannerT: frames left on the level banner

function newBall(x, y, dx, dy) {
  return { x, y, dx, dy, r: BALL_R * (scale || 1), boost: 1, pierce: 0, charged: false, fire: false, sq: 0, sqAxis: 'y' }; // sq: squash 0..1 after a bounce, along sqAxis
}

function layout() {
  const oldW = W, oldH = H;
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  scale = Math.min(W / BASE_W, H / BASE_H);
  const k = scale;
  GAP = BASE_GAP * k; TOP = BASE_TOP * k; BH = BASE_BH * k;
  LIFT = BASE_LIFT * k;
  CAPSULE_W = BASE_CAPSULE_W * k; CAPSULE_H = BASE_CAPSULE_H * k;
  paddle.h = PADDLE_H * k;
  BW = (W - GAP * (COLS + 1)) / COLS;
  paddle.y = H - 30 * k;
  if (oldW) {
    const kx = W / oldW, ky = H / oldH;
    paddle.x *= kx;
    for (const b of balls || []) { b.x *= kx; b.y *= ky; b.dx *= kx; b.dy *= kx; }
    for (const d of drops || []) { d.x *= kx; d.y *= ky; }
    for (const m of missiles || []) { m.x *= kx; m.y *= ky; }
  } else {
    paddle.w = PADDLE_W * k;
    paddle.x = W / 2 - paddle.w / 2;
  }
  paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
  placeBricks();
  makeStars();
}

// each brick drops in from above on its own random start time and speed, and bounces as it lands
function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
function placeBricks(playSounds = false) {
  for (const b of bricks || []) {
    const baseY = TOP + b.r * (BH + GAP);
    const t = Math.max(0, Math.min(1, (slideT - b.delay) / b.dur));
    b.x = GAP + b.c * (BW + GAP);
    b.y = -BH + (baseY + BH) * easeOutBounce(t);
    if (t >= 1 && !b.landed) { b.landed = true; if (playSounds) sound.pop(); }
  }
}

function buildBricks() {
  bricks = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      bricks.push(newBrick(r, c));
}

// a few bricks take two hits; more of them each level
function newBrick(r, c) {
  const tough = Math.random() < Math.min(0.3, 0.1 + 0.03 * (level - 1));
  return {
    r, c, x: 0, y: 0, delay: Math.random() * 0.5, dur: 0.3 + Math.random() * 0.2, // fall timing as a share of SLIDE_FRAMES
    color: COLORS[r % COLORS.length], alive: true,
    hp: tough ? 2 : 1, maxHp: tough ? 2 : 1, pts: (ROWS - r) * 10 * (tough ? 2 : 1),
    crack: tough ? makeCrack() : null,
  };
}

// jagged crack as points in 0..1 brick space: a main fissure top to bottom plus a side branch
function makeCrack() {
  const main = [[0.3 + Math.random() * 0.4, 0]];
  for (let i = 1; i <= 4; i++) main.push([Math.min(0.9, Math.max(0.1, main[i - 1][0] + (Math.random() - 0.5) * 0.3)), i / 4]);
  const from = main[2], dir = Math.random() < 0.5 ? -1 : 1;
  const branch = [from, [from[0] + dir * 0.12, from[1] + 0.12], [from[0] + dir * 0.22, from[1] + 0.08], [from[0] + dir * 0.3, from[1] + 0.2]];
  return [main, branch];
}

// each level is a little faster
function levelSpeed() { return 1 + 0.06 * (level - 1); }

function startNextLevel() {
  level++;
  sound.levelUp();
  buildBricks();
  slideT = 0;
  bannerT = BANNER_FRAMES;
  resetBall();
  placeBricks();
}

// slow parallax starfield in the candy colors; three layers, the nearer ones bigger and faster
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
    ctx.beginPath(); ctx.moveTo(x + gap, -gap); ctx.lineTo(x - H - gap, H + gap); ctx.stroke(); // run past the top and bottom edges so the slanted line ends stay off screen
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

function reset() {
  paused = false;
  debris = [];
  level = 1;
  buildBricks();
  slideT = 0; bannerT = BANNER_FRAMES; // bricks start off-screen and fall in once play begins
  layout();
  lives = 3; score = 0; state = 'play';
  resetBall();
}

// new ball on the paddle; clears falling power-ups and active effects
function resetBall() {
  balls = [newBall(0, 0, 0, 0)];
  stuck = true;
  drops = []; missiles = []; sparks = [];
  bigT = wideT = narrowT = missileT = 0;
  slowT = fastT = stickyT = 0; shield = false;
}

// let a caught ball go, aimed by where on the paddle it was caught
function releaseBall(b, boosted) {
  const a = (b.holdRatio - 0.5) * 2 * 65 * Math.PI / 180;
  b.dx = b.speed * Math.sin(a);
  b.dy = -b.speed * Math.cos(a);
  b.held = false;
  if (boosted) { b.boost = BOOST; b.pierce = 1; b.charged = true; }
}

function action() {
  sound.unlock();
  if (state === 'title') { state = 'play'; return; }
  if (paused) { paused = false; return; }
  if (state === 'play' && !stuck) {
    paddle.punch = 1;
    const held = balls.filter(b => b.held);
    if (held.length) { // sticky paddle: a click lets go with a boosted shot
      for (const b of held) releaseBall(b, true);
      sound.boost(); shake = Math.max(shake, 4);
    }
    if (missileT > 0) fireMissiles();
    return;
  }
  launch();
}

function launch() {
  if (state !== 'play') { reset(); return; }
  if (!stuck || slideT < 1) return; // wait for the new bricks to land
  stuck = false;
  const a = (Math.random() * 60 - 30) * Math.PI / 180;
  const s = 4.5 * W / BASE_W * levelSpeed();
  balls[0].dx = s * Math.sin(a);
  balls[0].dy = -s * Math.cos(a);
  // launch like a punched hit: the paddle pops up and sends the ball off charged
  paddle.punch = 1;
  sound.boost();
  shake = Math.max(shake, 4);
  const b = balls[0];
  b.y = paddle.y - LIFT - b.r;
  b.boost = BOOST; b.pierce = 1; b.charged = true;
}

function movePaddleTo(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (W / rect.width);
  paddle.x = Math.max(0, Math.min(W - paddle.w, x - paddle.w / 2));
}

addEventListener('keydown', e => {
  keys[e.key] = true;
  sound.unlock();
  if (e.key === 'm' || e.key === 'M') sound.toggleMute();
  if (e.key === 'Escape' && state === 'play' && !e.repeat) { paused = !paused; return; }
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) action(); }
});
addEventListener('keyup', e => keys[e.key] = false);
canvas.addEventListener('mousemove', e => movePaddleTo(e.clientX));
canvas.addEventListener('mousedown', action);
canvas.addEventListener('touchstart', e => { movePaddleTo(e.touches[0].clientX); action(); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', e => { movePaddleTo(e.touches[0].clientX); e.preventDefault(); }, { passive: false });

function maybeDrop(b) {
  if (Math.random() > DROP_CHANCE) return;
  const types = Object.keys(POWERUPS);
  let roll = Math.random() * types.reduce((sum, t) => sum + POWERUPS[t].weight, 0);
  let type = types[types.length - 1];
  for (const t of types) {
    roll -= POWERUPS[t].weight;
    if (roll < 0) { type = t; break; }
  }
  drops.push({ type, x: b.x + BW / 2, y: b.y + BH / 2 });
}

function applyPowerup(type) {
  sound[type]();
  if (type === 'split') {
    if (stuck) return;
    for (const b of balls.slice()) {
      for (const turn of [-0.45, 0.45]) {
        if (balls.length >= MAX_BALLS) break;
        const c = Math.cos(turn), s = Math.sin(turn);
        balls.push({ ...b, dx: b.dx * c - b.dy * s, dy: b.dx * s + b.dy * c });
      }
    }
  } else if (type === 'big') {
    bigT = EFFECT_FRAMES;
  } else if (type === 'wide') {
    wideT = EFFECT_FRAMES; narrowT = 0;
  } else if (type === 'narrow') {
    narrowT = EFFECT_FRAMES; wideT = 0;
  } else if (type === 'slow') {
    slowT = EFFECT_FRAMES; fastT = 0;
  } else if (type === 'fast') {
    fastT = EFFECT_FRAMES; slowT = 0;
  } else if (type === 'life') {
    if (lives < MAX_LIVES) lives++; else score += 500; // already full: bonus points instead
  } else if (type === 'sticky') {
    stickyT = EFFECT_FRAMES;
  } else if (type === 'shield') {
    shield = true;
  } else if (type === 'missile') {
    missileT = MISSILE_FRAMES;
  } else if (type === 'fire') {
    for (const b of balls) b.fire = true;
  }
}

// each click while armed fires a missile from both ends of the paddle
function fireMissiles() {
  sound.shoot();
  const y = paddle.y - LIFT;
  for (const f of [0.12, 0.88]) missiles.push({ x: paddle.x + paddle.w * f, y });
}

// rocket blast: a flash plus square pixel chunks in the brick's color that fly out and fall
function explode(b, big) {
  shake = Math.max(shake, big ? 7 : 3.5);
  const cx = b.x + BW / 2, cy = b.y + BH / 2;
  debris.push({ flash: true, x: cx, y: cy, life: 12, max: 12, size: (big ? 1.4 : 0.9) * BH });
  const n = big ? 14 : 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (1 + Math.random() * 3) * scale;
    debris.push({
      x: cx + (Math.random() - 0.5) * BW * 0.5, y: cy + (Math.random() - 0.5) * BH * 0.5,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - scale, color: Math.random() < 0.25 ? '#ffd24d' : b.color,
      life: 28 + Math.random() * 20, max: 48, size: (2 + Math.random() * 3) * scale,
    });
  }
}

function updateDebris() {
  debris = debris.filter(d => {
    if (!d.flash) { d.x += d.vx; d.y += d.vy; d.vy += 0.22 * scale; }
    return --d.life > 0;
  });
}

function updateMissiles() {
  if (missileT > 0) missileT--;
  const speed = 9 * scale, hw = 3 * scale;
  missiles = missiles.filter(m => {
    m.y -= speed;
    if (m.y < -20 * scale) return false;
    for (const b of bricks) {
      if (!b.alive || m.x + hw < b.x || m.x - hw > b.x + BW || m.y > b.y + BH || m.y + 16 * scale < b.y) continue;
      if (b.hp > 1) { b.hp--; sound.explode(false); explode(b, false); }
      else { b.alive = false; score += b.pts; maybeDrop(b); sound.explode(true); explode(b, true); }
      return false; // the missile is spent on impact
    }
    return true;
  });
}

// fire trail: chunky pixel puffs left along the ball's path that rise, shrink and cool from yellow to red
function emitFlames(ball, x0, y0) {
  const dist = Math.hypot(ball.x - x0, ball.y - y0);
  const n = Math.max(2, Math.ceil(dist / (ball.r * 0.7))); // fill the gap a fast ball covers in one frame
  for (let i = 1; i <= n && sparks.length < 500; i++) {
    const t = i / n, life = 18 + Math.random() * 18;
    sparks.push({
      x: x0 + (ball.x - x0) * t + (Math.random() - 0.5) * ball.r * 0.8,
      y: y0 + (ball.y - y0) * t + (Math.random() - 0.5) * ball.r * 0.8,
      vx: (Math.random() - 0.5) * 0.6 * scale, vy: -(0.3 + Math.random() * 0.7) * scale,
      life, max: life, size: ball.r * (0.55 + Math.random() * 0.4),
    });
  }
}

function updateSparks() {
  sparks = sparks.filter(p => { p.x += p.vx; p.y += p.vy; return --p.life > 0; });
}

function updatePaddle() {
  if (keys.ArrowLeft) paddle.x = Math.max(0, paddle.x - paddle.speed);
  if (keys.ArrowRight) paddle.x = Math.min(W - paddle.w, paddle.x + paddle.speed);

  if (wideT > 0) wideT--;
  if (narrowT > 0) narrowT--;
  const target = PADDLE_W * scale * (wideT > 0 ? WIDE_SCALE : narrowT > 0 ? NARROW_SCALE : 1);
  const oldW = paddle.w;
  paddle.w += (target - paddle.w) * 0.15;
  if (Math.abs(target - paddle.w) < 0.5) paddle.w = target;
  paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x + (oldW - paddle.w) / 2)); // grow/shrink around the center

  paddle.punch = Math.max(0, paddle.punch - 0.08);
}

function updateBall(ball, py) {
  ball.sq = Math.max(0, ball.sq - 0.12);
  if (ball.held) { // riding on the sticky paddle
    ball.x = paddle.x + ball.holdRatio * paddle.w;
    ball.y = py - ball.r;
    if (stickyT <= 0) releaseBall(ball, false);
    return;
  }
  if (!ball.charged) ball.boost = Math.max(1, ball.boost - 0.015);
  if (ball.boost === 1) ball.pierce = 0;

  // sub-step so a boosted ball can't skip through bricks or the paddle
  const mv = ball.boost * speedMult;
  const steps = Math.max(1, Math.ceil(Math.hypot(ball.dx, ball.dy) * mv / 6));
  for (let i = 0; i < steps; i++) {
    ball.x += ball.dx * mv / steps; ball.y += ball.dy * mv / steps;

    if (ball.x < ball.r) { ball.x = ball.r; ball.dx = Math.abs(ball.dx); ball.sq = 1; ball.sqAxis = 'x'; }
    if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.dx = -Math.abs(ball.dx); ball.sq = 1; ball.sqAxis = 'x'; }
    if (ball.y < ball.r) { ball.y = ball.r; ball.dy = Math.abs(ball.dy); ball.fire = false; ball.sq = 1; ball.sqAxis = 'y'; } // the top wall puts the fire out

    // the hit zone spans from the popped-up paddle down to its resting spot, so a ball caught below a fast pop still counts
    // paddle: angle depends on where the ball hits; a hit while the paddle is popped up boosts the ball
    if (ball.dy > 0 && ball.y + ball.r >= py && ball.y - ball.r <= paddle.y + paddle.h &&
        ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
      const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1..1
      const speed = Math.min(8 * W / BASE_W * levelSpeed(), Math.hypot(ball.dx, ball.dy));
      const a = hit * 65 * Math.PI / 180;
      ball.dx = speed * Math.sin(a);
      ball.dy = -speed * Math.cos(a);
      ball.y = py - ball.r;
      ball.sq = 1; ball.sqAxis = 'y';
      // a punched hit charges the ball: full boost holds until it bounces off a brick, then fades
      ball.charged = paddle.punch > 0.3;
      if (ball.charged) { ball.boost = BOOST; ball.pierce = 1; sound.boost(); } else sound.paddle();
      if (stickyT > 0) { // sticky paddle catches the ball until you click
        ball.held = true; ball.holdRatio = (ball.x - paddle.x) / paddle.w; ball.speed = speed;
        ball.dx = ball.dy = 0; ball.boost = 1; ball.charged = false; ball.pierce = 0;
        sound.stick();
        return;
      }
    }

    // shield: one bounce off the bottom saves a miss, then the shield is gone
    if (shield && ball.dy > 0 && ball.y + ball.r >= H - 8 * scale) {
      ball.y = H - 8 * scale - ball.r; ball.dy = -Math.abs(ball.dy);
      ball.sq = 1; ball.sqAxis = 'y';
      shield = false; sound.shieldHit(); shake = Math.max(shake, 5);
      for (let k = 0; k < 18; k++)
        debris.push({ x: Math.random() * W, y: H - 8 * scale, vx: (Math.random() - 0.5) * 2 * scale, vy: -(1 + Math.random() * 3) * scale,
          color: Math.random() < 0.5 ? '#dfe6f5' : '#7ab8ff', life: 25 + Math.random() * 15, max: 40, size: (2 + Math.random() * 2) * scale });
    }

    // bricks
    for (const b of bricks) {
      if (!b.alive) continue;
      if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + BW && ball.y + ball.r > b.y && ball.y - ball.r < b.y + BH) {
        const ox = Math.min(ball.x + ball.r - b.x, b.x + BW - (ball.x - ball.r));
        const oy = Math.min(ball.y + ball.r - b.y, b.y + BH - (ball.y - ball.r));
        // a fireball or a boosted ball's smash-through finishes a tough brick in one go; a normal hit only cracks it
        if (b.hp > 1 && !ball.fire && ball.pierce <= 0) {
          b.hp--;
          sound.crack();
          if (ox < oy) { ball.dx = -ball.dx; ball.x += ball.x < b.x + BW / 2 ? -ox : ox; }
          else { ball.dy = -ball.dy; ball.y += ball.y < b.y + BH / 2 ? -oy : oy; }
          ball.sq = 1; ball.sqAxis = ox < oy ? 'x' : 'y';
          ball.charged = false;
          const f = 1.005; ball.dx *= f; ball.dy *= f;
          break;
        }
        b.alive = false;
        score += b.pts;
        maybeDrop(b);
        sound.brick(b.r, ROWS);
        if (ball.fire) continue; // a fireball burns through everything
        // a boosted ball smashes through its first brick and bounces off the second
        if (ball.pierce > 0) ball.pierce--;
        else {
          if (ox < oy) ball.dx = -ball.dx; else ball.dy = -ball.dy;
          ball.sq = 1; ball.sqAxis = ox < oy ? 'x' : 'y';
          ball.charged = false;
        }
        // speed up slightly
        const f = 1.005; ball.dx *= f; ball.dy *= f;
        break;
      }
    }
  }
}

function update() {
  sound.setMusic(state === 'play' && !paused);
  if (state !== 'play' || paused) return;
  updatePaddle();
  updateDebris();

  if (slideT < 1) { slideT = Math.min(1, slideT + 1 / SLIDE_FRAMES); placeBricks(true); }
  if (bannerT > 0) bannerT--;

  if (bigT > 0) bigT--;
  if (slowT > 0) slowT--;
  if (fastT > 0) fastT--;
  if (stickyT > 0) stickyT--;
  speedMult = slowT > 0 ? 0.55 : fastT > 0 ? 1.45 : 1;
  const r = BALL_R * scale * (bigT > 0 ? BIG_SCALE : 1);
  for (const b of balls) b.r = r;

  if (stuck) {
    balls[0].x = paddle.x + paddle.w / 2;
    balls[0].y = paddle.y - r - 1;
    return;
  }

  const py = paddle.y - LIFT * paddle.punch;
  for (const b of balls) {
    const x0 = b.x, y0 = b.y;
    updateBall(b, py);
    if (b.fire) emitFlames(b, x0, y0);
  }
  updateSparks();

  updateMissiles();

  // falling power-ups: caught by the paddle or lost off the bottom
  const fall = 2.5 * W / BASE_W;
  drops = drops.filter(d => {
    d.y += fall;
    if (d.y - CAPSULE_H / 2 <= paddle.y + paddle.h && d.y + CAPSULE_H / 2 >= py &&
        d.x >= paddle.x - CAPSULE_W / 2 && d.x <= paddle.x + paddle.w + CAPSULE_W / 2) {
      applyPowerup(d.type);
      return false;
    }
    return d.y - CAPSULE_H / 2 < H;
  });

  if (bricks.every(b => !b.alive)) startNextLevel();

  balls = balls.filter(b => b.y - b.r <= H);
  if (balls.length === 0) {
    lives--;
    if (lives <= 0) { state = 'lost'; sound.gameOver(); } else { sound.loseLife(); resetBall(); }
  }
}

function text(str, x, y, size, color = '#fff', align = 'center') {
  ctx.fillStyle = color; ctx.font = `${size}px "Press Start 2P", monospace`; ctx.textAlign = align;
  ctx.fillText(str, x, y);
}

function drawMissile(m) {
  const w = 6 * scale, h = 16 * scale;
  ctx.fillStyle = '#e8e8f0';
  ctx.fillRect(m.x - w / 2, m.y + h * 0.25, w, h * 0.55);
  ctx.fillStyle = '#ff4d4d'; // nose cone
  ctx.beginPath(); ctx.moveTo(m.x - w / 2, m.y + h * 0.25); ctx.lineTo(m.x, m.y); ctx.lineTo(m.x + w / 2, m.y + h * 0.25); ctx.fill();
  ctx.fillStyle = '#b57bff'; // fins
  ctx.fillRect(m.x - w, m.y + h * 0.6, w * 0.5, h * 0.25); ctx.fillRect(m.x + w / 2, m.y + h * 0.6, w * 0.5, h * 0.25);
  ctx.fillStyle = Math.random() < 0.5 ? '#ffd24d' : '#ff7a2f'; // flickering exhaust
  ctx.fillRect(m.x - w * 0.3, m.y + h * 0.8, w * 0.6, h * 0.2 + Math.random() * h * 0.15);
}

function drawIcon(icon, d, color) {
  const px = Math.max(1, Math.round(CAPSULE_H * 0.62 / 8)); // whole-pixel size keeps the edges crisp
  const x0 = Math.round(d.x - px * icon[0].length / 2), y0 = Math.round(d.y - px * icon.length / 2);
  const [main, accent] = [].concat(color); // a single color, or [main, accent]
  icon.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === ' ' || c === '.') return;
    ctx.fillStyle = c === 'o' ? accent : main;
    ctx.fillRect(x0 + x * px, y0 + y * px, px, px);
  }));
}

function drawCapsule(d) {
  const p = POWERUPS[d.type];
  ctx.beginPath(); ctx.roundRect(d.x - CAPSULE_W / 2, d.y - CAPSULE_H / 2, CAPSULE_W, CAPSULE_H, CAPSULE_H / 2);
  if (p.bad) {
    ctx.fillStyle = '#2a0f14'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = p.color; ctx.stroke();
    drawIcon(p.icon, d, p.color);
  } else {
    ctx.fillStyle = p.color; ctx.fill();
    drawIcon(p.icon, d, p.iconColor || '#111');
  }
}

function drawTitle() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
  const title = 'CANDY WALL';
  const size = Math.min(64, W * 0.8 / title.length); // the pixel font is 1em wide per letter
  const x0 = W / 2 - (title.length * size) / 2 + size / 2;
  ctx.textBaseline = 'middle';
  const DROP = 45, STAGGER = 7; // frames for one letter to fall, and between letters
  const landedAt = (title.length - 1) * STAGGER + DROP;
  [...title].forEach((ch, i) => {
    if (ch === ' ') return;
    const t = Math.max(0, Math.min(1, (titleT - i * STAGGER) / DROP));
    if (t === 0) return; // not dropped in yet
    const x = x0 + i * size, rest = H / 2 - size;
    let y = rest - (1 - easeOutBounce(t)) * (rest + size); // bounces in from above the screen
    if (t === 1) y += Math.sin(titleT * 0.07 + i * 0.7) * size * 0.07; // then a gentle wobble
    const color = COLORS[(i + (t === 1 ? Math.floor(titleT / 18) : 0)) % COLORS.length]; // and the colors ripple along
    text(ch, x, y + size * 0.08, size, 'rgba(0,0,0,0.5)'); // drop shadow
    text(ch, x, y, size, color);
  });
  ctx.textBaseline = 'alphabetic';
  // tagline fades in once the letters have landed
  ctx.globalAlpha = Math.max(0, Math.min(1, (titleT - landedAt) / 30));
  text('its a wall of candy', W / 2, H / 2 - size * 0.15, size * 0.22, '#ffb3e6');
  ctx.globalAlpha = 1;
  if (titleT > landedAt && Math.floor(Date.now() / 500) % 2 === 0) text('Click or press Space to start', W / 2, H / 2 + size, Math.max(10, size * 0.28), '#ccc');
}

// two-hit brick: darker, with mortar lines like a brick wall, and cracks once it has taken a hit
function drawToughBrick(b, rad) {
  const lw = Math.max(1, BH * 0.07);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(b.x, b.y, BW, BH, rad); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(b.x, b.y, BW, BH);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + BH / 2); ctx.lineTo(b.x + BW, b.y + BH / 2);     // course line
  for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(b.x + BW * f, b.y); ctx.lineTo(b.x + BW * f, b.y + BH / 2); }
  for (const f of [1 / 6, 1 / 2, 5 / 6]) { ctx.moveTo(b.x + BW * f, b.y + BH / 2); ctx.lineTo(b.x + BW * f, b.y + BH); } // offset joints
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; // light edge on the top of each course
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + lw); ctx.lineTo(b.x + BW, b.y + lw);
  ctx.moveTo(b.x, b.y + BH / 2 + lw); ctx.lineTo(b.x + BW, b.y + BH / 2 + lw);
  ctx.stroke();
  if (b.hp < b.maxHp) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [color, off, width] of [['rgba(255,255,255,0.55)', lw * 0.7, lw * 1.2], ['rgba(10,10,20,0.9)', 0, lw * 1.6]]) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      for (const line of b.crack) {
        ctx.beginPath();
        line.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](b.x + x * BW + off, b.y + y * BH + off));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  if (shake > 0.3) ctx.translate((Math.random() - 0.5) * 2 * shake * scale, (Math.random() - 0.5) * 2 * shake * scale);
  drawScene();
  ctx.restore();
}

function drawScene() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();

  for (const b of bricks) {
    if (!b.alive) continue;
    const rad = BH * 0.28;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, BW, BH, rad); ctx.fill();
    if (b.maxHp > 1) drawToughBrick(b, rad);
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.roundRect(b.x + rad, b.y + BH * 0.1, BW - rad * 2, BH * 0.15, BH * 0.07); ctx.fill();
    }
  }

  for (const d of drops) drawCapsule(d);
  for (const m of missiles) drawMissile(m);
  if (shield) { // dashed pixel line along the bottom edge, marching sideways
    const dash = 12 * scale, gapW = 5 * scale, th = Math.max(2, Math.round(3 * scale)), y = Math.round(H - 8 * scale);
    const off = (bgT * 0.6 * scale) % (dash + gapW);
    for (let x = -dash + off; x < W; x += dash + gapW) {
      ctx.fillStyle = '#7ab8ff'; ctx.fillRect(Math.round(x), y - th, dash, th * 2);
      ctx.fillStyle = '#eaf4ff'; ctx.fillRect(Math.round(x), y - Math.floor(th / 2), dash, th);
    }
  }

  ctx.fillStyle = narrowT > 0 ? '#ff8a8a' : wideT > 0 ? '#ffe28a' : stickyT > 0 ? '#d6ec7a' : '#c9cde0';
  const padY = paddle.y - LIFT * paddle.punch;
  const ph = paddle.h, pw = paddle.w, px = paddle.x, py = padY, pad = ph * 0.4;
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, pad); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; // short rounded glint, same shape as the ball's
  ctx.beginPath(); ctx.roundRect(px + pad, py + ph * 0.14, paddle.h * 1.3, ph * 0.22, ph * 0.11); ctx.fill();

  if (missileT > 0) { // armed: little launchers on the paddle ends
    ctx.fillStyle = '#b57bff';
    for (const f of [0.12, 0.88]) ctx.fillRect(paddle.x + paddle.w * f - 3 * scale, padY - 5 * scale, 6 * scale, 6 * scale);
  }

  for (const d of debris) { // missile blasts, drawn as chunky squares for the 8-bit look
    const f = d.life / d.max;
    if (d.flash) {
      const sz = Math.round(d.size * (1.2 - f * 0.6));
      ctx.fillStyle = f > 0.5 ? '#fff6c8' : '#ff9a2f';
      ctx.fillRect(Math.round(d.x - sz / 2), Math.round(d.y - sz / 2), sz, sz);
    } else {
      ctx.globalAlpha = Math.min(1, f * 2);
      ctx.fillStyle = d.color;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), Math.ceil(d.size), Math.ceil(d.size));
      ctx.globalAlpha = 1;
    }
  }

  // fire trail: hard-edged squares snapped to a pixel grid that step down in size and color, no blur or fade
  const g = Math.max(2, Math.round(3 * scale));
  for (const p of sparks) {
    const f = p.life / p.max;
    ctx.fillStyle = f > 0.66 ? '#ffe08a' : f > 0.33 ? '#ff9a2f' : '#ff3d1f';
    const side = g * (f > 0.66 ? 3 : f > 0.33 ? 2 : 1);
    ctx.fillRect(Math.round(p.x / g) * g - side / 2, Math.round(p.y / g) * g - side / 2, side, side);
  }

  for (const ball of balls) {
    ctx.fillStyle = ball.fire ? '#ff5a1f' : ball.boost > 1 ? '#ffd24d' : '#c9cde0';
    // flatten along the bounce axis and bulge across it
    const along = ball.r * (1 - 0.3 * ball.sq), across = ball.r * (1 + 0.2 * ball.sq);
    const rx = ball.sqAxis === 'x' ? along : across, ry = ball.sqAxis === 'x' ? across : along;
    ctx.beginPath(); ctx.ellipse(ball.x, ball.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; // short rounded glint at the upper left, same shape as the paddle's
    ctx.beginPath(); ctx.roundRect(ball.x - rx * 0.62, ball.y - ry * 0.62, rx * 0.7, ry * 0.24, ball.r * 0.12); ctx.fill();
  }

  text(String(score).padStart(5, '0'), W / 2, TOP * 0.76, 26 * scale, '#fff'); // centered above the bricks
  text('Level ' + level, 10, 48, 10, '#aaa', 'left');
  // lives as little balls: solid with a glint while you have them, a faint outline once lost
  const lr = 8 * scale;
  for (let i = 0; i < Math.max(3, lives); i++) {
    const lx = W - 22 * scale - i * 26 * scale, ly = 24 * scale;
    ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    if (i < lives) {
      ctx.fillStyle = '#c9cde0'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.roundRect(lx - lr * 0.62, ly - lr * 0.62, lr * 0.7, lr * 0.24, lr * 0.12); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(201,205,224,0.3)'; ctx.lineWidth = Math.max(1, 1.5 * scale); ctx.stroke();
    }
  }

  // active timed effects, under the level label
  const active = [];
  if (bigT > 0) active.push(['Big ball', bigT, '#6bd86b']);
  if (missileT > 0) active.push(['Missiles', missileT, '#b57bff']);
  if (slowT > 0) active.push(['Slow ball', slowT, '#35d6c0']);
  if (fastT > 0) active.push(['Fast ball', fastT, '#ff4d4d']);
  if (stickyT > 0) active.push(['Sticky paddle', stickyT, '#c8e04d']);
  if (shield) active.push(['Shield', 0, '#7ab8ff']);
  if (wideT > 0) active.push(['Wide paddle', wideT, '#ffd24d']);
  if (narrowT > 0) active.push(['Narrow paddle', narrowT, '#ff4d4d']);
  if (balls.some(b => b.fire)) active.push(['Fireball', 0, '#ff7a2f']);
  active.forEach(([name, t, color], i) => {
    const label = t ? `${name} ${Math.ceil(t / 60)}s` : name;
    text(label, 10, 70 + i * 18, 10, color, 'left');
  });

  if (bannerT > 0 && state === 'play') {
    const fade = Math.min(1, bannerT / 30); // fade out over the last half second
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, H * 0.34, W, H * 0.2);
    text('LEVEL ' + level, W / 2, H * 0.42, Math.min(40, W * 0.07), '#ffd24d');
    text('SCORE ' + String(score).padStart(5, '0'), W / 2, H * 0.49, Math.min(18, W * 0.03), '#fff');
    ctx.globalAlpha = 1;
  }

  if (state === 'play' && stuck) text('Click or press Space to launch', W / 2, H / 2 + 60, 12, '#ccc');
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    text('Paused', W / 2, H / 2 - 10, 32);
    text('Press Esc or click to resume', W / 2, H / 2 + 30, 12, '#ccc');
  }
  if (state === 'title') drawTitle();
  else if (state !== 'play') {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
    text('Game over', W / 2, H / 2 - 10, 32);
    text('Score: ' + score + ' — click or press Space to play again', W / 2, H / 2 + 30, 12, '#ccc');
  }
}

function loop() {
  if (!paused) { bgT++; shake *= 0.86; }
  if (state === 'title') titleT++;
  update(); draw(); requestAnimationFrame(loop);
}
addEventListener('resize', layout);
reset();
state = 'title';
loop();
