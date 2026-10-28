import '@fontsource/fredoka/600.css';

// The arcade-wide graphics style: 'pixel' (8-bit) or 'hibit' (smooth, shaded sprites). Set from the settings dialogs.
let hibit = false, lite = false, frame = 0;
try { hibit = localStorage.getItem('arcade-graphics') === 'hibit'; } catch { /* storage unavailable: 8-bit */ }
try { lite = localStorage.getItem('arcade-animations') === 'limited'; } catch { /* storage unavailable: full animations */ }

// CSS keys off this attribute so the DOM buttons and dialogs switch style live
document.fonts?.load('600 16px Fredoka'); // canvas text doesn't trigger the download itself
const apply = () => { document.documentElement.dataset.gfx = hibit ? 'hibit' : 'pixel'; document.documentElement.dataset.anim = lite ? 'limited' : 'full'; };
apply();

export const graphics = {
  get hibit() { return hibit; },
  // canvas font: the pixel face in 8-bit, a rounded face in hi-bit (set a bit larger, since it is much narrower)
  font(size) { return hibit ? `600 ${size * 1.3}px Fredoka, sans-serif` : `${size}px "Press Start 2P", monospace`; },
  // limited animations, for old devices: no moving backdrop, no shadow blurs or screen shake, fewer particles,
  // half the redraws and a 1x canvas
  get lite() { return lite; },
  dpr() { return lite ? 1 : Math.min(3, window.devicePixelRatio || 1); },
  skipFrame() { return lite && (++frame & 1) === 1; },
  toggleLite() {
    lite = !lite;
    try { localStorage.setItem('arcade-animations', lite ? 'limited' : 'full'); } catch { /* storage unavailable */ }
    apply();
    dispatchEvent(new Event('resize')); // every screen re-lays out so the canvas picks up its new pixel density
    return lite;
  },
  toggle() {
    hibit = !hibit;
    try { localStorage.setItem('arcade-graphics', hibit ? 'hibit' : 'pixel'); } catch { /* storage unavailable */ }
    apply();
    return hibit;
  },
};
