/* Guarda la app en el equipo para que funcione sin internet. Subir VERSION en cada cambio. */
const VERSION = 'burros-0.98';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'luz.js', 'calculo.js', 'dem.js', 'curvas.js', 'zonas.js', 'horizonte.js', 'resultado.js', 'paquete.js', 'mapa.js', 'seguir.js', 'pantalla-luz.js', 'documento.js', 'lib/html2canvas-1.4.1.js', 'lib/jspdf.umd.min.js', 'lib/pdfjs-3.11.174/pdf.min.js', 'lib/pdfjs-3.11.174/pdf.worker.min.js', 'intercambio.js', 'doctrina.js', 'civil.js', 'app.js', 'manifest.webmanifest',
  'lib/wmm.js', 'lib/leaflet-1.9.4.js', 'lib/leaflet-1.9.4.css', 'lib/qrcode-generator-2.0.4.js', 'lib/jsQR-1.4.0.js', 'iconos/icono.svg', 'iconos/icono-180.png', 'iconos/icono-192.png', 'iconos/icono-512.png'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ARCHIVOS))); self.skipWaiting(); });
// los mapas guardados (zonas sin señal y teselas ya vistas) no se borran al cambiar de versión
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION && !k.startsWith('burros-teselas')).map(k=>caches.delete(k))))); self.clients.claim(); });
/* Teselas de mapas y del modelo de terreno (v0.87): primero las de las zonas guardadas («burros-teselas»), luego la red (y se guardan
   en «burros-teselas-vistas», hasta unas 3.000); sin señal, las ya vistas. Así el mapa funciona sin internet en las zonas guardadas. */
const TESELAS = /^https:\/\/([a-c]\.)?tile\.(opentopomap|openstreetmap)\.org\/|^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_(Imagery|Topo_Map)\/MapServer\/tile\/|^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\//;
const norm = u=>String(u).replace(/^https:\/\/[a-c]\.tile\.(opentopomap|openstreetmap)\.org\//, 'https://tile.$1.org/');
let vistas = 0;
async function tesela(rq){
  const k = norm(rq.url), z = await caches.open('burros-teselas'), g = await z.match(k); if(g) return g;
  const v = await caches.open('burros-teselas-vistas');
  try { const r = await fetch(rq); if(r.ok){ v.put(k, r.clone()); if(++vistas%100===0) v.keys().then(ks=>{ const n = ks.length - 3000; for(let i=0; i<n; i++) v.delete(ks[i]); }); } return r; }
  catch(e){ const r = await v.match(k); if(r) return r; throw e; }
}
// Primero la red (para recibir cambios); sin conexión, lo guardado.
self.addEventListener('fetch', e=>{
  if(e.request.method!=='GET') return;
  if(TESELAS.test(e.request.url)) return e.respondWith(tesela(e.request));
  const mismo = new URL(e.request.url).origin===location.origin, rq = mismo && e.request.mode!=='navigate' ? new Request(e.request, {cache:'no-cache'}) : e.request;
  e.respondWith(fetch(rq).then(r=>{ const c = r.clone(); caches.open(VERSION).then(k=>k.put(e.request, c)); return r; })
    .catch(()=>caches.match(e.request, {ignoreSearch:true}).then(r=>r || caches.match('index.html'))));
});
