/* BURROS DE COMBATE — zonas de mapa para usar sin señal (pedido del usuario, v0.87).
   Se descargan las teselas de un área (la ruta con un margen, o lo que se ve en pantalla) para las capas elegidas y hasta un nivel de
   detalle, y se guardan en el caché del navegador «burros-teselas». El service worker (sw.js) las entrega primero desde ahí, así el
   mapa, las curvas de nivel y la cota automática funcionan en terreno sin internet. Las zonas se anotan en localStorage «burros_zonas».
   Descarga cuidadosa: pocas a la vez y con tope por zona (los servidores de mapas libres piden no bajar áreas grandes). */
const Zonas = (function(){
  const CACHE = 'burros-teselas', CLAVE = 'burros_zonas', TOPE = 6000, A_LA_VEZ = 4;
  // capas que se pueden guardar (las calles de OpenStreetMap no: su servidor prohíbe la descarga masiva)
  const CAPAS = {
    topo:   {n:'Topográfica (OpenTopoMap)', url:'https://tile.opentopomap.org/{z}/{x}/{y}.png', zmax:17, kb:25},
    sat:    {n:'Satélite (Esri)', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', zmax:19, kb:30},
    etopo:  {n:'Topo Esri', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', zmax:19, kb:20},
    terreno:{n:'Curvas de nivel y cota automática (modelo de terreno)', url:'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', zmax:15, kb:90}};
  // la misma tesela puede venir de a.tile…, b.tile… o c.tile…: se guarda con una sola dirección
  const norm = u=>String(u).replace(/^https:\/\/[a-c]\.tile\.(opentopomap|openstreetmap)\.org\//, 'https://tile.$1.org/');
  const ZMIN = 10;
  const tx = (lon, z)=>Math.floor((lon + 180)/360*Math.pow(2, z));
  const ty = (lat, z)=>{ const r = lat*Math.PI/180; return Math.floor((1 - Math.log(Math.tan(r) + 1/Math.cos(r))/Math.PI)/2*Math.pow(2, z)); };
  const nivelesDe = (k, zmax)=>{ const c = CAPAS[k]; const z1 = Math.min(zmax, c.zmax), r = []; for(let z=ZMIN; z<=z1; z++) r.push(z); return r; };
  // direcciones de todas las teselas de una zona {caja:[s, o, n, e], capas:[…], zmax}
  function urls(zona){
    const [s, o, n, e] = zona.caja, L = [];
    zona.capas.forEach(k=>{ const c = CAPAS[k]; if(!c) return;
      nivelesDe(k, zona.zmax).forEach(z=>{ const x0 = tx(o, z), x1 = tx(e, z), y0 = ty(n, z), y1 = ty(s, z);
        for(let x=x0; x<=x1; x++) for(let y=y0; y<=y1; y++) L.push(c.url.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }); });
    return L;
  }
  function estimar(zona){ let n = 0, kb = 0; const [s, o, nn, e] = zona.caja;
    zona.capas.forEach(k=>{ const c = CAPAS[k]; if(!c) return; nivelesDe(k, zona.zmax).forEach(z=>{ const q = (tx(e, z) - tx(o, z) + 1)*(ty(s, z) - ty(nn, z) + 1); n += q; kb += q*c.kb; }); });
    return {n, mb:kb/1024, tope:n>TOPE}; }
  // caja de la ruta con un margen en km
  function cajaRuta(puntos, km){ const ok = puntos.filter(p=>p.ok); if(!ok.length) return null;
    const la = ok.map(p=>p.lat), lo = ok.map(p=>p.lon), s = Math.min(...la), n = Math.max(...la), dLa = km/111.32, dLo = km/(111.32*Math.cos((s + n)/2*Math.PI/180));
    return [s - dLa, Math.min(...lo) - dLo, n + dLa, Math.max(...lo) + dLo]; }
  const lista = ()=>{ try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch(e){ return []; } };
  const guardar = L=>{ try { localStorage.setItem(CLAVE, JSON.stringify(L)); } catch(e){} };
  const hay = ()=>typeof caches!=='undefined';
  // descarga (las que ya están se saltan); progreso(hechas, total, kb); se detiene con control.parar = true
  async function descargar(zona, progreso, control){
    if(!hay()) throw new Error('Este navegador no permite guardar mapas');
    const U = urls(zona), c = await caches.open(CACHE); let i = 0, hechas = 0, kb = 0, fallas = 0;
    async function uno(){ while(i<U.length && !(control && control.parar)){ const u = U[i++];
        try { const k = norm(u); let r = await c.match(k);
          if(!r){ r = await fetch(u, {mode:'cors'}); if(!r.ok) throw new Error(r.status); const b = await r.clone().blob(); kb += b.size/1024; await c.put(k, r); }
        } catch(e){ fallas++; }
        hechas++; if(progreso) progreso(hechas, U.length, kb, fallas); } }
    await Promise.all(Array.from({length:A_LA_VEZ}, uno));
    return {total:U.length, hechas, kb, fallas, parado:!!(control && control.parar)};
  }
  // agrega o reemplaza la zona en la lista
  function anotar(zona){ const L = lista().filter(z=>z.id!==zona.id); L.unshift(zona); guardar(L); }
  // borra la zona y sus teselas (las que no use otra zona)
  async function borrar(id){
    const L = lista(), z = L.find(x=>x.id===id); if(!z) return; const resto = L.filter(x=>x.id!==id); guardar(resto);
    if(!hay()) return; const otras = new Set(resto.flatMap(x=>urls(x).map(norm))), c = await caches.open(CACHE);
    await Promise.all(urls(z).map(norm).filter(u=>!otras.has(u)).map(u=>c.delete(u)));
  }
  async function espacio(){ try { const e = await navigator.storage.estimate(); return {usado:e.usage/1048576, total:e.quota/1048576}; } catch(e){ return null; } }
  /* sin service worker (la app de iPhone con Capacitor, etapa 4 de Ruck Planner; o el navegador antes de que se active): la tesela del
     modelo de terreno se busca en las zonas guardadas y en las ya vistas; si no está, se baja y se guarda en las vistas (hasta unas 3.000) */
  let vistas = 0;
  async function cargar(img, url){
    if((navigator.serviceWorker && navigator.serviceWorker.controller) || !hay()){ img.src = url; return; }
    try { const k = norm(url), v = await caches.open(CACHE + '-vistas'); let r = await (await caches.open(CACHE)).match(k) || await v.match(k);
      if(!r){ r = await fetch(url); if(r.ok){ await v.put(k, r.clone()); if(++vistas%100===0) v.keys().then(ks=>{ for(let i=0; i<ks.length - 3000; i++) v.delete(ks[i]); }); } }
      if(!r.ok) throw new Error(r.status);
      const u = URL.createObjectURL(await r.blob()); img.addEventListener('load', ()=>URL.revokeObjectURL(u), {once:true}); img.src = u;
    } catch(e){ img.src = url; }
  }
  return {CAPAS, CACHE, TOPE, norm, urls, estimar, cajaRuta, lista, anotar, descargar, borrar, espacio, cargar};
})();
if(typeof globalThis!=='undefined') globalThis.Zonas = Zonas;
