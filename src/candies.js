// Glossy vector candies shared by Candy Pop and the launcher. `mask` names the shape.
export const CANDIES = [
  { color: '#ff4d4d', mask: 'circle' },
  { color: '#4dc3ff', mask: 'diamond' },
  { color: '#6bd86b', mask: 'triangle' },
  { color: '#ffd24d', mask: 'star' },
  { color: '#9b6bff', mask: 'square' },
  { color: '#ff6bd1', mask: 'heart' },
];
export const ORB = 'orb'; // the rainbow candy is a ball with a spinning ring of colour

export function shade(hex, amt) { // amt > 0 mixes toward white, < 0 toward black
  const n = parseInt(hex.slice(1), 16), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (t - v) * a));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

// outline of a candy of half-size r centred on the origin
function outline(ctx, shape, r) {
  ctx.beginPath();
  if (shape === 'circle' || shape === 'orb') ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  else if (shape === 'diamond') { ctx.moveTo(0, -r); ctx.lineTo(r * 0.82, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.82, 0); ctx.closePath(); }
  else if (shape === 'triangle') { ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.95, r * 0.75); ctx.lineTo(-r * 0.95, r * 0.75); ctx.closePath(); }
  else if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.46 : r * 1.02;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d + r * 0.06);
    }
    ctx.closePath();
  } else if (shape === 'square') ctx.roundRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.42);
  else { // heart
    ctx.moveTo(0, r * 0.88);
    ctx.bezierCurveTo(-r * 1.25, r * 0.1, -r * 0.95, -r * 0.95, 0, -r * 0.4);
    ctx.bezierCurveTo(r * 0.95, -r * 0.95, r * 1.25, r * 0.1, 0, r * 0.88);
  }
}

// Candies are drawn small (RES x RES) with hard edges and scaled up without smoothing: chunkier than a vector
// shape, finer than a 7x7 sprite.
const RES = 22;
const cache = new Map();

function bake(shape, color, { rows, stripe, spin = 0 }) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = RES;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const r = RES / 2;
  c.translate(r, r);
  c.lineJoin = 'round';
  outline(c, shape, r - 0.5);
  c.lineWidth = 3; c.strokeStyle = rows ? '#3a3a5a' : shade(color, -0.55); c.stroke(); // dark outline
  if (rows && c.createConicGradient) {
    const g = c.createConicGradient(spin, 0, 0);
    rows.forEach((col, i) => g.addColorStop(i / rows.length, col));
    g.addColorStop(1, rows[0]);
    c.fillStyle = g; c.fill();
  } else {
    c.fillStyle = shade(color, -0.3); c.fill(); // shadow side
  }
  c.save();
  outline(c, shape, r - 0.5); c.clip();
  if (!rows) { // lit body, shifted up and left so a dark rim shows below and right
    c.translate(-1.6, -1.6);
    outline(c, shape, r - 0.5); c.fillStyle = color; c.fill();
    c.translate(1.6, 1.6);
  }
  if (stripe) {
    c.fillStyle = rows ? '#fff' : shade(color, 0.75);
    for (const d of [-0.33, 0.33]) {
      if (stripe === 'h') c.fillRect(-r, Math.round(r * d) - 1, r * 2, 3);
      else c.fillRect(Math.round(r * d) - 1, -r, 3, r * 2);
    }
  }
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.75)'; // blocky glint
  c.fillRect(-r * 0.5 | 0, -r * 0.5 | 0, 3, 2);
  c.fillRect(-r * 0.5 | 0, (-r * 0.5 | 0) + 2, 2, 2);
  const img = c.getImageData(0, 0, RES, RES), d = img.data; // no soft edges
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  c.putImageData(img, 0, 0);
  return cv;
}

// smooth hi-bit candy: gradient body, dark outline, bands for the striped ones, soft specular highlight
function drawCandyHi(ctx, shape, cx, cy, size, color, { rows, stripe, spin = 0 }) {
  const r = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  outline(ctx, shape, r);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = r * 0.35; ctx.shadowOffsetY = r * 0.14;
  if (rows && ctx.createConicGradient) {
    const g = ctx.createConicGradient(spin, 0, 0);
    rows.forEach((col, i) => g.addColorStop(i / rows.length, col));
    g.addColorStop(1, rows[0]);
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(-r * 0.6, -r, r * 0.6, r);
    g.addColorStop(0, shade(color, 0.4)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.45));
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.restore();
  ctx.save();
  outline(ctx, shape, r); ctx.clip();
  if (rows) { // shade the rainbow ball like a sphere
    const sg = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    sg.addColorStop(0, 'rgba(255,255,255,0.65)'); sg.addColorStop(0.5, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = sg; ctx.fillRect(-r, -r, size, size);
  } else {
    const sg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 1.1);
    sg.addColorStop(0, 'rgba(255,255,255,0.35)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(-r, -r, size, size);
  }
  if (stripe) {
    ctx.fillStyle = rows ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)';
    for (const d of [-0.33, 0.33]) {
      if (stripe === 'h') ctx.fillRect(-r, r * d - r * 0.07, size, r * 0.14);
      else ctx.fillRect(r * d - r * 0.07, -r, r * 0.14, size);
    }
  }
  ctx.restore();
  outline(ctx, shape, r);
  ctx.lineWidth = Math.max(1, size * 0.045); ctx.strokeStyle = rows ? 'rgba(40,40,70,0.9)' : shade(color, -0.55); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; // specular spot
  ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.2, r * 0.12, -0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawCandy(ctx, shape, cx, cy, size, color, opts = {}) {
  if (opts.hibit) { drawCandyHi(ctx, shape, cx, cy, size, color, opts); return; }
  const animated = !!opts.rows; // the rainbow ball spins, so it is redrawn rather than cached
  const k = `${shape}|${color}|${opts.stripe || ''}`;
  let sprite = animated ? bake(shape, color, opts) : cache.get(k);
  if (!sprite) cache.set(k, sprite = bake(shape, color, opts));
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const s = size;
  ctx.drawImage(sprite, Math.round(cx - s / 2), Math.round(cy - s / 2), Math.round(s), Math.round(s));
  ctx.imageSmoothingEnabled = was;
}
