import '@fontsource/fredoka/600.css';

// The arcade-wide graphics style: 'pixel' (8-bit) or 'hibit' (smooth, shaded sprites). Set from the settings dialogs.
let hibit = false;
try { hibit = localStorage.getItem('arcade-graphics') === 'hibit'; } catch { /* storage unavailable: 8-bit */ }

// CSS keys off this attribute so the DOM buttons and dialogs switch style live
document.fonts?.load('600 16px Fredoka'); // canvas text doesn't trigger the download itself
const apply = () => { document.documentElement.dataset.gfx = hibit ? 'hibit' : 'pixel'; };
apply();

export const graphics = {
  get hibit() { return hibit; },
  // canvas font: the pixel face in 8-bit, a rounded face in hi-bit (set a bit larger, since it is much narrower)
  font(size) { return hibit ? `600 ${size * 1.3}px Fredoka, sans-serif` : `${size}px "Press Start 2P", monospace`; },
  toggle() {
    hibit = !hibit;
    try { localStorage.setItem('arcade-graphics', hibit ? 'hibit' : 'pixel'); } catch { /* storage unavailable */ }
    apply();
    return hibit;
  },
};
