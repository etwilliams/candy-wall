import { graphics } from './graphics.js';

// Hi-bit sprites for Candy Wall: smooth gradients, gloss and soft shadows in place of the 8-bit pixel shapes.
// Every function draws on the context it is given and uses the same geometry as its 8-bit counterpart.

const sb = v => (graphics.lite ? 0 : v); // shadow blur is the costliest effect here, so limited animations drop it

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(hex, amt) { // amt > 0 mixes toward white, < 0 toward black
  const t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  return `rgb(${rgb(hex).map(v => Math.round(v + (t - v) * a)).join(',')})`;
}
function rgba(hex, a) { return `rgba(${rgb(hex).join(',')},${a})`; }

// sizes can dip below zero during bounce-in animations, so clamp rather than let roundRect throw
function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2))); }

// glossy jelly brick
export function brick(ctx, x, y, w, h, color) {
  const r = h * 0.3;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = sb(h * 0.25); ctx.shadowOffsetY = h * 0.1;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, mix(color, 0.35)); g.addColorStop(0.5, color); g.addColorStop(1, mix(color, -0.35));
  ctx.fillStyle = g; round(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; round(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
  // sheen across the upper half, and a thin bounce light along the bottom
  const s = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
  s.addColorStop(0, 'rgba(255,255,255,0.55)'); s.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = s; round(ctx, x + w * 0.04, y + h * 0.07, w * 0.92, h * 0.46, r * 0.8); ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.18); round(ctx, x + w * 0.12, y + h * 0.82, w * 0.76, h * 0.07, h * 0.04); ctx.fill();
}

// two-hit brick: a carved stone slab in the candy's colour, cracked once it has been hit
export function toughBrick(ctx, b, w, h) {
  const { x, y } = b, r = h * 0.3, lw = Math.max(1, h * 0.07);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = sb(h * 0.25); ctx.shadowOffsetY = h * 0.1;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, mix(b.color, -0.05)); g.addColorStop(1, mix(b.color, -0.6));
  ctx.fillStyle = g; round(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
  ctx.save();
  round(ctx, x, y, w, h, r); ctx.clip();
  ctx.lineWidth = lw; ctx.lineCap = 'round';
  const joints = [[0, h / 2, w, h / 2]];
  for (const f of [1 / 3, 2 / 3]) joints.push([w * f, 0, w * f, h / 2]);
  for (const f of [1 / 6, 1 / 2, 5 / 6]) joints.push([w * f, h / 2, w * f, h]);
  for (const [dx, color] of [[lw, 'rgba(255,255,255,0.22)'], [0, 'rgba(0,0,0,0.5)']]) { // mortar groove with a lit lip
    ctx.strokeStyle = color; ctx.beginPath();
    for (const [x1, y1, x2, y2] of joints) { ctx.moveTo(x + x1 + dx * 0.5, y + y1 + dx); ctx.lineTo(x + x2 + dx * 0.5, y + y2 + dx); }
    ctx.stroke();
  }
  const s = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  s.addColorStop(0, 'rgba(255,255,255,0.28)'); s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s; ctx.fillRect(x, y, w, h * 0.5);
  if (b.hp < b.maxHp) {
    ctx.lineJoin = 'round';
    for (const [color, off, width] of [['rgba(255,255,255,0.45)', lw * 0.7, lw * 1.1], ['rgba(10,10,20,0.9)', 0, lw * 1.5]]) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      for (const line of b.crack) {
        ctx.beginPath();
        line.forEach(([cx, cy], i) => ctx[i ? 'lineTo' : 'moveTo'](x + cx * w + off, y + cy * h + off));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; round(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
}

// glass-like sphere with a specular highlight; rx/ry squash it along a bounce
export function ball(ctx, cx, cy, rx, ry, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = sb(Math.max(rx, ry) * 0.6); ctx.shadowOffsetY = Math.max(rx, ry) * 0.25;
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(-0.35, -0.4, 0.05, -0.1, -0.1, 1.15);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, mix(color, 0.45)); g.addColorStop(0.65, color); g.addColorStop(1, mix(color, -0.55));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; // specular spot
  ctx.beginPath(); ctx.ellipse(-0.38, -0.44, 0.22, 0.13, -0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// brushed-metal bumper with end caps
export function paddle(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = sb(h * 0.7); ctx.shadowOffsetY = h * 0.3;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, mix(color, 0.6)); g.addColorStop(0.45, color); g.addColorStop(0.55, mix(color, -0.25)); g.addColorStop(1, mix(color, -0.55));
  ctx.fillStyle = g; round(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; round(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h / 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; round(ctx, x + h * 0.5, y + h * 0.12, w - h, h * 0.18, h * 0.09); ctx.fill();
  for (const ex of [x + h * 0.55, x + w - h * 0.55]) { // rivets
    const rg = ctx.createRadialGradient(ex - 1, y + h * 0.45, 0, ex, y + h * 0.5, h * 0.2);
    rg.addColorStop(0, '#fff'); rg.addColorStop(1, mix(color, -0.5));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(ex, y + h * 0.5, h * 0.17, 0, Math.PI * 2); ctx.fill();
  }
}

// gel capsule: glassy body in the power-up colour (bad ones are dark with a glowing rim)
export function capsule(ctx, x, y, w, h, color, bad) {
  ctx.save();
  if (bad) { ctx.shadowColor = color; ctx.shadowBlur = sb(h * 0.6); }
  else { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = sb(h * 0.4); ctx.shadowOffsetY = h * 0.15; }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (bad) { g.addColorStop(0, '#3a1a22'); g.addColorStop(1, '#14070b'); }
  else { g.addColorStop(0, mix(color, 0.45)); g.addColorStop(0.5, color); g.addColorStop(1, mix(color, -0.45)); }
  ctx.fillStyle = g; round(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.restore();
  ctx.lineWidth = bad ? 2 : 1; ctx.strokeStyle = bad ? color : 'rgba(0,0,0,0.3)';
  round(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, h / 2); ctx.stroke();
  const s = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  s.addColorStop(0, `rgba(255,255,255,${bad ? 0.18 : 0.6})`); s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s; round(ctx, x + h * 0.25, y + h * 0.08, w - h * 0.5, h * 0.42, h * 0.2); ctx.fill();
}

// smooth rocket with a glowing flame
export function missile(ctx, mx, my, scale) {
  const w = 6 * scale, h = 16 * scale;
  const flame = h * (0.28 + Math.random() * 0.14);
  const fg = ctx.createLinearGradient(0, my + h * 0.8, 0, my + h * 0.8 + flame);
  fg.addColorStop(0, '#fff6c8'); fg.addColorStop(0.4, '#ff9a2f'); fg.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.fillStyle = fg; ctx.beginPath();
  ctx.moveTo(mx - w * 0.35, my + h * 0.8); ctx.quadraticCurveTo(mx, my + h * 0.8 + flame * 1.3, mx + w * 0.35, my + h * 0.8); ctx.fill();
  ctx.fillStyle = '#9b6bff'; // fins
  ctx.beginPath(); ctx.moveTo(mx - w / 2, my + h * 0.55); ctx.lineTo(mx - w * 1.1, my + h * 0.88); ctx.lineTo(mx - w / 2, my + h * 0.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(mx + w / 2, my + h * 0.55); ctx.lineTo(mx + w * 1.1, my + h * 0.88); ctx.lineTo(mx + w / 2, my + h * 0.8); ctx.fill();
  const bg = ctx.createLinearGradient(mx - w / 2, 0, mx + w / 2, 0);
  bg.addColorStop(0, '#9aa0b4'); bg.addColorStop(0.35, '#ffffff'); bg.addColorStop(1, '#7c8298');
  ctx.fillStyle = bg; ctx.fillRect(mx - w / 2, my + h * 0.25, w, h * 0.58);
  const ng = ctx.createLinearGradient(mx - w / 2, 0, mx + w / 2, 0);
  ng.addColorStop(0, '#ff7a7a'); ng.addColorStop(0.4, '#ff4d4d'); ng.addColorStop(1, '#a01e1e');
  ctx.fillStyle = ng; ctx.beginPath();
  ctx.moveTo(mx - w / 2, my + h * 0.26); ctx.quadraticCurveTo(mx - w * 0.3, my + h * 0.05, mx, my); ctx.quadraticCurveTo(mx + w * 0.3, my + h * 0.05, mx + w / 2, my + h * 0.26); ctx.fill();
}

// soft glowing ember for the fire trail; f runs 1 (fresh) -> 0 (gone)
export function ember(ctx, x, y, size, f) {
  const r = size * (0.7 + f * 0.9);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,240,170,${0.9 * f})`); g.addColorStop(0.4, `rgba(255,140,40,${0.6 * f})`); g.addColorStop(1, 'rgba(255,50,20,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// missile blast puff / bright flash
export function blast(ctx, x, y, size, f, flash, color) {
  const r = flash ? size * (1.2 - f * 0.6) : size * 1.2;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  if (flash) { g.addColorStop(0, f > 0.5 ? 'rgba(255,246,200,0.95)' : 'rgba(255,200,120,0.8)'); g.addColorStop(0.5, 'rgba(255,154,47,0.6)'); g.addColorStop(1, 'rgba(255,80,20,0)'); }
  else { g.addColorStop(0, rgba(color, Math.min(1, f * 2))); g.addColorStop(1, rgba(color, 0)); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// round twinkling star: a soft glow around a bright core; the nearest layer also gets a four-point sparkle
export function star(ctx, x, y, size, layer, color, alpha) {
  const r = size * 1.1 + layer * 0.8;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, rgba(color, 0.55)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mix(color, 0.7); ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
  if (layer === 2) {
    const l = r * 2.1, w = r * 0.18;
    ctx.fillStyle = rgba('#ffffff', 0.4 * alpha / 0.65);
    ctx.beginPath();
    ctx.moveTo(x - l, y); ctx.quadraticCurveTo(x - w, y - w, x, y - l); ctx.quadraticCurveTo(x + w, y - w, x + l, y);
    ctx.quadraticCurveTo(x + w, y + w, x, y + l); ctx.quadraticCurveTo(x - w, y + w, x - l, y); ctx.fill();
  }
}

// --- shared with Candy Grid ---

// dark rounded board panel with a lit rim
export function panel(ctx, x, y, w, h, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = sb(r * 1.2); ctx.shadowOffsetY = r * 0.4;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#26264a'); g.addColorStop(1, '#14142a');
  ctx.fillStyle = g; round(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; round(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); ctx.stroke();
}

// recessed empty cell
export function socket(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = g; round(ctx, x, y, w, h, h * 0.24); ctx.fill();
}

export function roundedRect(ctx, x, y, w, h, r) { round(ctx, x, y, w, h, r); }

// golden crown; xRight is its right edge and px its unit size (it is 9px wide)
export function crown(ctx, xRight, y, px, color) {
  const x0 = xRight - 9 * px, w = 9 * px;
  const g = ctx.createLinearGradient(0, y, 0, y + 5 * px);
  g.addColorStop(0, mix(color, 0.5)); g.addColorStop(1, mix(color, -0.25));
  ctx.fillStyle = g; ctx.lineJoin = 'round'; ctx.lineWidth = px * 0.5; ctx.strokeStyle = mix(color, -0.5);
  ctx.beginPath();
  ctx.moveTo(x0, y + 4.4 * px); ctx.lineTo(x0, y + 0.9 * px); ctx.lineTo(x0 + w * 0.25, y + 2.6 * px); ctx.lineTo(x0 + w * 0.5, y + 0.2 * px);
  ctx.lineTo(x0 + w * 0.75, y + 2.6 * px); ctx.lineTo(x0 + w, y + 0.9 * px); ctx.lineTo(x0 + w, y + 4.4 * px); ctx.closePath();
  ctx.fill(); ctx.stroke();
  for (const f of [0, 0.5, 1]) { // jewels on the tips
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x0 + w * f, y + (f === 0.5 ? 0.2 : 0.9) * px, px * 0.45, 0, Math.PI * 2); ctx.fill();
  }
}

// progress bar: dark rounded trough with a glossy fill
export function bar(ctx, x, y, w, h, k, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; round(ctx, x, y, w, h, h / 2); ctx.fill();
  const fw = Math.max(0, w * k);
  if (fw > 0) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, mix(color, 0.45)); g.addColorStop(0.5, color); g.addColorStop(1, mix(color, -0.3));
    ctx.fillStyle = g; round(ctx, x, y, Math.max(fw, h), h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; round(ctx, x + h * 0.25, y + h * 0.12, Math.max(0, Math.max(fw, h) - h * 0.5), h * 0.3, h * 0.15); ctx.fill();
  }
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; round(ctx, x, y, w, h, h / 2); ctx.stroke();
}
