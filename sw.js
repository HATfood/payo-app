const CACHE='payu-v062-1-static';
const ASSETS=["./", "./index.html", "./style.css", "./app.js", "./customers.json", "./options.json", "./form_rules.json", "./legacy_export_schema.json", "./manifest.webmanifest", "./fonts/Vazirmatn-Variable.woff2", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon.png", "./admin.html", "./admin.js", "./admin.css"];

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})));
  if((await caches.keys()).includes('payu-v061-static'))await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('payu-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url),scope=new URL('./',self.registration.scope);
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 const path=url.pathname.slice(scope.pathname.length);
 if(!ASSETS.some(asset=>asset.slice(2)===path))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),saved=await cache.match(new URL(url.pathname,self.location.origin));
  if(saved)return saved;return fetch(req);
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING'){event.waitUntil(self.skipWaiting());return}
 if(event.data?.type!=='CHECK_OFFLINE')return;
 const port=event.ports?.[0];if(!port)return;
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE),checked=await Promise.all(ASSETS.map(async path=>!!(await cache.match(new URL(path,self.registration.scope)))));
  port.postMessage({ready:checked.every(Boolean),stored:checked.filter(Boolean).length,total:ASSETS.length,version:CACHE});
 })());
});
