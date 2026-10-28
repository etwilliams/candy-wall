// A settings button (top right) that opens the arcade-wide Music / Sounds switches.
// pause / resume / isPlaying let the game freeze itself while the dialog is open.
import { sound } from './sound.js';
import { graphics } from './graphics.js';

// 12x12 gear: a ring with a hole and eight teeth, built from distances so it stays symmetric
function gearPath() {
  let d = '';
  for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
    const dx = c - 5.5, dy = r - 5.5, dist = Math.hypot(dx, dy);
    const tooth = dist <= 6.2 && Math.abs(((Math.atan2(dy, dx) * 4 / Math.PI) % 1 + 1.5) % 1 - 0.5) < 0.2;
    if ((dist <= 4.4 && dist >= 1.9) || (tooth && dist > 3)) d += `M${c} ${r}h1v1h-1z`;
  }
  return d;
}

const SMOOTH_GEAR = '<svg class="gfx-hi" width="26" height="26" viewBox="-10 -10 20 20"><g fill="currentColor"><path fill-rule="evenodd" d="M0 -6.6A6.6 6.6 0 1 1 0 6.6A6.6 6.6 0 1 1 0 -6.6ZM0 -2.8A2.8 2.8 0 1 0 0 2.8A2.8 2.8 0 1 0 0 -2.8Z"/><rect x="-1.7" y="-9.2" width="3.4" height="4" rx="0.8" transform="rotate(0)"/><rect x="-1.7" y="-9.2" width="3.4" height="4" rx="0.8" transform="rotate(45)"/><rect x="-1.7" y="-9.2" width="3.4" height="4" rx="0.8" transform="rotate(90)"/><rect x="-1.7" y="-9.2" width="3.4" height="4" rx="0.8" transform="rotate(135)"/><rect x="-1.7" y="-9.2" width="3.4" height="4" rx="0.8" transform="rotate(180)"/><rect x="-1.7" y="-9.2" width="3.4" height="4" rx="0.8" transform="rotate(225)"/><rect x="-1.7" y="-9.2" width="3.4" height="4" rx="0.8" transform="rotate(270)"/><rect x="-1.7" y="-9.2" width="3.4" height="4" rx="0.8" transform="rotate(315)"/></g></svg>';

// shared hi-bit look for the corner buttons and dialogs: rounded, glossy, soft shadows, smooth icons
export const HIBIT_CSS = p => `
    .${p}-btn svg.gfx-hi { display: none; shape-rendering: geometricPrecision; }
    [data-gfx=hibit] .${p}-btn svg.gfx-hi { display: block; }
    [data-gfx=hibit] .${p}-btn svg.gfx-px { display: none; }
    .bb-btn svg.gfx-hi { fill: none; }
    [data-gfx=hibit] #hint, [data-gfx=hibit] .${p}-overlay { font-family: Fredoka, sans-serif; font-weight: 600; }
    [data-gfx=hibit] #hint { font-size: 12px; line-height: 1.4; }
    [data-gfx=hibit] .${p}-box h2 { font-size: 24px; letter-spacing: 0.04em; }
    [data-gfx=hibit] .${p}-box button { font-size: 18px; }
    [data-gfx=hibit] .${p}-box .bb-msg { font-size: 15px; line-height: 1.5; }
    [data-gfx=hibit] .${p}-btn { border-radius: 12px; border: 1px solid rgba(255,255,255,0.22); color: #fff;
      background: linear-gradient(180deg, rgba(110,110,170,0.9), rgba(40,40,86,0.92)); backdrop-filter: blur(4px);
      box-shadow: 0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.3); }
    [data-gfx=hibit] .${p}-btn:hover, [data-gfx=hibit] .${p}-btn:focus-visible { background: linear-gradient(180deg, rgba(140,140,205,0.95), rgba(60,60,115,0.95)); }
    [data-gfx=hibit] .${p}-box { border-radius: 18px; border: 1px solid rgba(255,255,255,0.25);
      background: linear-gradient(180deg, #2c2c52, #17172e); box-shadow: 0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3); }
    [data-gfx=hibit] .${p}-box button { border-radius: 10px; border: 1px solid rgba(255,255,255,0.2);
      background: linear-gradient(180deg, #4e4e86, #34345a); box-shadow: 0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3); }
    [data-gfx=hibit] .${p}-box button:hover, [data-gfx=hibit] .${p}-box button:focus-visible { background: linear-gradient(180deg, #62629e, #46467a); }
    [data-gfx=hibit] .${p}-box .${p}-close { background: linear-gradient(180deg, #ff9be3, #ff6bd1); }
    [data-gfx=hibit] .${p}-box .${p}-quit { background: linear-gradient(180deg, #d24d4d, #a02a2a); }
    [data-gfx=hibit] .${p}-box .${p}-close:hover, [data-gfx=hibit] .${p}-box .${p}-close:focus-visible { background: linear-gradient(180deg, #ffb3ec, #ff85d9); }
    [data-gfx=hibit] .${p}-box .${p}-quit:hover, [data-gfx=hibit] .${p}-box .${p}-quit:focus-visible { background: linear-gradient(180deg, #e66, #c23a3a); }
`;

export function installSettingsButton({ pause, resume, isPlaying }) {
  const style = document.createElement('style');
  style.textContent = `
    .st-btn { position: fixed; top: 4px; right: 4px; width: 40px; height: 40px; padding: 0; z-index: 10; cursor: pointer;
      background: rgba(30, 30, 56, 0.85); border: 2px solid #34345a; border-bottom-color: #05050f; border-right-color: #05050f; color: #ddd; }
    .st-btn:hover, .st-btn:focus-visible { background: #34345a; outline: none; }
    .st-btn svg { display: block; margin: auto; shape-rendering: crispEdges; fill: currentColor; }
    .st-overlay { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.65); font-family: 'Press Start 2P', monospace; }
    .st-overlay[hidden] { display: none; }
    .st-box { box-sizing: border-box; width: min(88vw, 360px); padding: 20px 16px; text-align: center; background: #1e1e38; color: #fff; border: 4px solid #ff6bd1; }
    .st-box h2 { margin: 0 0 16px; font-size: 14px; font-weight: normal; color: #ffd24d; }
    .st-box button { display: flex; justify-content: space-between; width: 100%; box-sizing: border-box; margin: 0 0 10px; font: inherit; font-size: 11px; padding: 14px 12px; cursor: pointer; color: #fff; background: #34345a; border: 2px solid #4a4a7a; border-bottom-color: #05050f; border-right-color: #05050f; }
    .st-box button:hover, .st-box button:focus-visible { background: #4a4a7a; outline: 2px solid #fff; outline-offset: 2px; }
    .st-box .st-state { color: #6bd86b; }
    .st-box button[data-off] .st-state { color: #ff4d4d; }
    .st-box .st-gfx { color: #4dc3ff; }
    .st-box .st-close { justify-content: center; margin: 8px 0 0; background: #ff6bd1; color: #1b1b2f; border-color: #ff9be3; border-bottom-color: #8a2a6e; border-right-color: #8a2a6e; }
    .st-box .st-close:hover, .st-box .st-close:focus-visible { background: #ff8be0; }
  ` + HIBIT_CSS('st');
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'st-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Settings');
  btn.innerHTML = `<svg class="gfx-px" width="24" height="24" viewBox="0 0 12 12"><path d="${gearPath()}"/></svg>${SMOOTH_GEAR}`;

  const overlay = document.createElement('div');
  overlay.className = 'st-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `<div class="st-box"><h2>SETTINGS</h2>
    <button type="button" class="st-music"><span>MUSIC</span><span class="st-state"></span></button>
    <button type="button" class="st-sounds"><span>SOUNDS</span><span class="st-state"></span></button>
    <button type="button" class="st-graphics"><span>GRAPHICS</span><span class="st-state st-gfx"></span></button>
    <button type="button" class="st-close">CLOSE</button></div>`;
  document.body.append(btn, overlay);

  const music = overlay.querySelector('.st-music'), sounds = overlay.querySelector('.st-sounds'), closeBtn = overlay.querySelector('.st-close'), gfx = overlay.querySelector('.st-graphics');
  let wasPlaying = false;

  function refresh() {
    for (const [el, off] of [[music, sound.musicOff], [sounds, sound.muted]]) {
      el.toggleAttribute('data-off', off);
      el.querySelector('.st-state').textContent = off ? 'OFF' : 'ON';
    }
  }
  function refreshGfx() { gfx.querySelector('.st-state').textContent = graphics.hibit ? 'HI-BIT' : '8-BIT'; }
  function open() {
    wasPlaying = isPlaying();
    if (wasPlaying) pause();
    refresh(); refreshGfx();
    overlay.hidden = false;
    closeBtn.focus();
  }
  function close() {
    overlay.hidden = true;
    btn.blur();
    if (wasPlaying) resume();
    wasPlaying = false;
  }

  btn.addEventListener('click', () => { sound.tick(); open(); });
  music.addEventListener('click', () => { sound.toggleMusic(); refresh(); });
  sounds.addEventListener('click', () => { sound.toggleMute(); refresh(); sound.tick(); }); // the tick plays only when sounds are now on
  gfx.addEventListener('click', () => { graphics.toggle(); refreshGfx(); sound.tick(); });
  closeBtn.addEventListener('click', () => { sound.select(); close(); });
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });

  // while the dialog is open the game must not see key presses
  addEventListener('keydown', e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    e.stopPropagation();
  }, true);
}
