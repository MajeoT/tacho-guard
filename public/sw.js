/* TachoGuard service worker: keeps the app on the phone so it opens with no signal.
   Change VERSION whenever you deploy a new build so phones pick up the update. */
const VERSION='tg-2026-10-11-6';
const SHELL=['./','index.html','config.js','signs.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==VERSION).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==location.origin)return; /* database and sign in calls go straight to the network */
 e.respondWith((async()=>{
  const c=await caches.open(VERSION);
  const hit=await c.match(r,{ignoreSearch:true});
  const net=fetch(r).then(res=>{if(res&&res.ok)c.put(r,res.clone());return res}).catch(()=>null);
  if(hit){e.waitUntil(net);return hit}
  const res=await net;
  if(res)return res;
  if(r.mode==='navigate')return (await c.match('index.html'))||Response.error();
  return Response.error()})())});
