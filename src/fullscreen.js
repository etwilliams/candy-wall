// On touch devices, go full screen on the first tap (browsers only allow it from a user gesture).
// Installed apps are already full screen via the manifest, and navigating to another page leaves
// full screen, so each page asks again on its first tap.
export function enableMobileFullscreen() {
  const root = document.documentElement;
  if (!matchMedia('(pointer: coarse)').matches || !root.requestFullscreen) return;
  if (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches) return;
  let tries = 0;
  const onTap = e => {
    if (e.pointerType === 'mouse' || document.fullscreenElement) return;
    if (++tries > 3) removeEventListener('pointerup', onTap, true);
    root.requestFullscreen({ navigationUI: 'hide' }).then(() => removeEventListener('pointerup', onTap, true)).catch(() => {});
  };
  addEventListener('pointerup', onTap, true);
}
