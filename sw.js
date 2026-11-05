const CACHE='payu-v061-static';
const ASSETS=["./", "./index.html", "./style.css", "./app.js", "./customers.json", "./options.json", "./form_rules.json", "./legacy_export_schema.json", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon.png", "./admin.html", "./admin.js", "./admin.css"];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('payu-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // Favour offline availability, versioned cache updated when a new service worker installs.
    const saved=await cache.match(req);
    if(saved)return saved;
    const res=await fetch(req);
    if(res.ok)await cache.put(req,res.clone());
    return res;
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type!=='CHECK_OFFLINE')return;
  const port=event.ports?.[0];if(!port)return;
  event.waitUntil((async()=>{
    const c=await caches.open(CACHE);const checked=await Promise.all(ASSETS.map(async p=>!!(await c.match(new URL(p,self.registration.scope)))));
    port.postMessage({ready:checked.every(Boolean),stored:checked.filter(Boolean).length,total:ASSETS.length});
  })());
});
