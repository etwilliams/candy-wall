// A small back-to-menu button (top left) that asks for confirmation before leaving.
// pause / resume / isPlaying let the game freeze itself while the dialog is open.
import { sound } from './sound.js';

export function installBackButton({ pause, resume, isPlaying, menuUrl = './' }) {
  const style = document.createElement('style');
  style.textContent = `
    .bb-btn { position: fixed; top: 4px; left: 4px; width: 40px; height: 40px; padding: 0; z-index: 10; cursor: pointer;
      background: rgba(30, 30, 56, 0.85); border: 2px solid #34345a; border-bottom-color: #05050f; border-right-color: #05050f; color: #ddd; }
    .bb-btn:hover, .bb-btn:focus-visible { background: #34345a; outline: none; }
    .bb-btn svg { display: block; margin: auto; shape-rendering: crispEdges; fill: currentColor; }
    .bb-overlay { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.65); font-family: 'Press Start 2P', monospace; }
    .bb-overlay[hidden] { display: none; }
    .bb-box { box-sizing: border-box; width: min(88vw, 360px); padding: 20px 16px; text-align: center; background: #1e1e38; color: #fff; border: 4px solid #34345a; border-bottom-color: #05050f; border-right-color: #05050f; }
    .bb-box h2 { margin: 0 0 12px; font-size: 14px; font-weight: normal; color: #ffd24d; }
    .bb-box .bb-msg { margin: 0 0 18px; font-size: 9px; line-height: 1.7; color: #bbb; }
    .bb-row { display: flex; gap: 12px; justify-content: center; }
    .bb-row button { flex: 1; font: inherit; font-size: 10px; padding: 12px 6px; cursor: pointer; color: #fff; background: #34345a; border: 2px solid #4a4a7a; border-bottom-color: #05050f; border-right-color: #05050f; }
    .bb-row button:hover, .bb-row button:focus-visible { background: #4a4a7a; outline: 2px solid #fff; outline-offset: 2px; }
    .bb-row .bb-quit { background: #a02a2a; border-color: #d24d4d; border-bottom-color: #4a0f0f; border-right-color: #4a0f0f; }
    .bb-row .bb-quit:hover, .bb-row .bb-quit:focus-visible { background: #c23a3a; }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'bb-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Back to menu');
  // a pixel-art left arrow
  btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 7 7"><path d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z"/></svg>';

  const overlay = document.createElement('div');
  overlay.className = 'bb-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = '<div class="bb-box"><h2></h2><div class="bb-msg"></div><div class="bb-row"><button type="button" class="bb-stay">Stay</button><button type="button" class="bb-quit">Quit</button></div></div>';
  document.body.append(btn, overlay);

  const title = overlay.querySelector('h2'), msg = overlay.querySelector('.bb-msg');
  const stay = overlay.querySelector('.bb-stay'), quit = overlay.querySelector('.bb-quit');
  let wasPlaying = false;

  function open() {
    wasPlaying = isPlaying();
    if (wasPlaying) pause();
    title.textContent = wasPlaying ? 'Quit game?' : 'Back to menu?';
    msg.textContent = wasPlaying ? 'Your current game will be lost.' : 'Return to the game menu.';
    overlay.hidden = false;
    stay.focus();
  }
  function close() {
    overlay.hidden = true;
    btn.blur();
    if (wasPlaying) resume();
    wasPlaying = false;
  }

  btn.addEventListener('click', open);
  stay.addEventListener('click', () => { sound.select(); close(); });
  quit.addEventListener('click', () => { sound.select(); setTimeout(() => { location.href = menuUrl; }, 280); }); // let the click sound finish
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); }); // tapping the backdrop cancels

  // while the dialog is open the game must not see key presses (Space would hard drop, arrows would move)
  addEventListener('keydown', e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); (document.activeElement === stay ? quit : stay).focus(); }
    e.stopPropagation();
  }, true);
}
