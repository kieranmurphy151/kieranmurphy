const VERSION="wk-19";
const FONTS="wk-fonts";
const CORE=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("wk-")&&k!==VERSION&&k!==FONTS).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
function timeout(ms){return new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),ms));}
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  if(u.origin===self.location.origin){
    if(r.mode==="navigate"){
      e.respondWith(Promise.race([fetch(r),timeout(4000)]).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(VERSION).then(c=>c.put("./index.html",cp));}return res;})
        .catch(()=>caches.match("./index.html").then(m=>m||fetch(r))));
      return;
    }
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(VERSION).then(c=>c.put(r,cp));}return res;})));
    return;
  }
  if(u.hostname==="fonts.googleapis.com"||u.hostname==="fonts.gstatic.com"){
    e.respondWith(caches.open(FONTS).then(c=>c.match(r).then(m=>{
      const net=fetch(r).then(res=>{if(res.ok||res.type==="opaque")c.put(r,res.clone());return res;}).catch(()=>m||Response.error());
      return m||net;
    })));
  }
});
