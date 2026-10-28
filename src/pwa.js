// Offline support: the service worker is only registered in production builds so dev reloads stay fresh.
export function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
