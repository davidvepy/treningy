// v3.2 intentionally does not register a service worker. This file remains only for old installs.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister().then(()=>self.clients.matchAll()).then(clients=>clients.forEach(c=>c.navigate(c.url)))));
