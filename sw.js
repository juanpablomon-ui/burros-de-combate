/* Guarda la app en el equipo para que funcione sin internet. Subir VERSION en cada cambio. */
const VERSION = 'burros-0.48';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'luz.js', 'calculo.js', 'dem.js', 'curvas.js', 'mapa.js', 'seguir.js', 'pantalla-luz.js', 'documento.js', 'lib/html2canvas-1.4.1.js', 'lib/jspdf.umd.min.js', 'intercambio.js', 'doctrina.js', 'civil.js', 'app.js', 'manifest.webmanifest',
  'lib/wmm.js', 'lib/leaflet-1.9.4.js', 'lib/leaflet-1.9.4.css', 'lib/qrcode-generator-2.0.4.js', 'lib/jsQR-1.4.0.js', 'iconos/icono.svg', 'iconos/icono-180.png', 'iconos/icono-192.png', 'iconos/icono-512.png'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k))))); self.clients.claim(); });
// Primero la red (para recibir cambios); sin conexión, lo guardado.
self.addEventListener('fetch', e=>{
  if(e.request.method!=='GET') return;
  const mismo = new URL(e.request.url).origin===location.origin, rq = mismo && e.request.mode!=='navigate' ? new Request(e.request, {cache:'no-cache'}) : e.request;
  e.respondWith(fetch(rq).then(r=>{ const c = r.clone(); caches.open(VERSION).then(k=>k.put(e.request, c)); return r; })
    .catch(()=>caches.match(e.request, {ignoreSearch:true}).then(r=>r || caches.match('index.html'))));
});
