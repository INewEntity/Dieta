// Service worker: funciona sin conexión y muestra los avisos push.
const CACHE = 'dieta-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './badge-96.png'];
const PUSH_API = 'https://dieta-avisos.dieta-avisos.workers.dev';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Red primero para la página (así llegan las actualizaciones); caché si no hay conexión.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// El servidor manda un push vacío cuando toca un aviso; aquí se recogen y se muestran.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let items = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch(PUSH_API + '/inbox', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({endpoint: sub && sub.endpoint})});
      items = (await r.json()).items || [];
    } catch (_) {}
    // Android exige mostrar algo en cada push
    if (!items.length) items = [{title: 'Dieta', body: 'Tienes un aviso. Abre la app para verlo.', tag: 'dieta', url: '#hoy'}];
    await Promise.all(items.map(n => self.registration.showNotification(n.title, {
      body: n.body, tag: n.tag || n.nid, icon: 'icon-192.png', badge: 'badge-96.png', data: {url: n.url || ''},
    })));
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL('./index.html' + ((e.notification.data && e.notification.data.url) || ''), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(async cs => {
    const c = cs.find(x => 'focus' in x);
    if (c) { try { await c.navigate(target); } catch (_) {} return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
