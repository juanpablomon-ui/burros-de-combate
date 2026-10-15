/* BURROS DE COMBATE — paquete para terreno (pedido del usuario, v0.91): un solo archivo con las marchas, las cartas propias ya calzadas
   y las zonas de mapa guardadas (con sus teselas), para pasarlo de un teléfono a otro sin internet (AirDrop, Quick Share, Bluetooth, cable).
   Formato «.burros»: texto, una línea por registro (así se arma y se lee por partes, aunque pese cientos de MB):
     {"app":"burros-paquete","v":1,...}          cabecera
     {"t":"marcha","d":{…}}  {"t":"carta","d":{…}}  {"t":"zona","d":{…}}  {"t":"tesela","k":dirección,"c":tipo,"b":base64} */
const Paquete = (function(){
  // cartas propias (IndexedDB «burros_cartas», la misma base de mapa.js)
  const bd = (modo, fn)=>new Promise((res, rej)=>{ const r = indexedDB.open('burros_cartas', 1);
    r.onupgradeneeded = ()=>r.result.createObjectStore('cartas', {keyPath:'id'});
    r.onsuccess = ()=>{ const t = r.result.transaction('cartas', modo), q = fn(t.objectStore('cartas')); t.oncomplete = ()=>res(q && q.result); t.onerror = ()=>rej(t.error); };
    r.onerror = ()=>rej(r.error); });
  const cartas = ()=>bd('readonly', s=>s.getAll()).then(x=>x || []).catch(()=>[]);
  const ponerCarta = c=>bd('readwrite', s=>s.put(c));
  const b64 = buf=>{ const u = new Uint8Array(buf); let s = ''; for(let i=0; i<u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const deB64 = t=>{ const s = atob(t), u = new Uint8Array(s.length); for(let i=0; i<s.length; i++) u[i] = s.charCodeAt(i); return u; };
  // resumen de lo que hay para armar
  async function inventario(){ const cs = await cartas(), zs = Zonas.lista();
    return {cartas:cs.length, mbCartas:cs.reduce((a, c)=>a + (c.img || '').length, 0)/1048576, zonas:zs.length, mbZonas:zs.reduce((a, z)=>a + (z.kb || 0), 0)/1024*1.37}; }
  // arma el paquete: op {marchas:[…], cartas:bool, zonas:bool}; progreso(texto, fracción) → Blob
  async function armar(op, progreso){
    const partes = [], linea = o=>partes.push(JSON.stringify(o) + '\n'), cs = op.cartas ? await cartas() : [], zs = op.zonas ? Zonas.lista() : [];
    const urls = op.zonas && typeof caches!=='undefined' ? [...new Set(zs.flatMap(z=>Zonas.urls(z).map(Zonas.norm)))] : [];
    linea({app:'burros-paquete', v:1, fecha:Date.now(), n:{marchas:op.marchas.length, cartas:cs.length, zonas:zs.length, teselas:urls.length}});
    op.marchas.forEach(m=>linea({t:'marcha', d:m})); cs.forEach(c=>linea({t:'carta', d:c})); zs.forEach(z=>linea({t:'zona', d:z}));
    if(urls.length){ const c = await caches.open(Zonas.CACHE); let i = 0, n = 0;
      for(const k of urls){ const r = await c.match(k); i++; if(r){ linea({t:'tesela', k, c:r.headers.get('Content-Type') || 'image/png', b:b64(await r.arrayBuffer())}); n++; }
        if(progreso && i%50===0) progreso('Teselas ' + i + ' de ' + urls.length, i/urls.length); } }
    return new Blob(partes, {type:'application/octet-stream'});
  }
  // carga un paquete (File o Blob), por partes; alMarcha(m) decide cómo agregar cada marcha; progreso(texto, fracción) → resumen
  async function cargar(f, alMarcha, progreso){
    const n = {marchas:0, cartas:0, zonas:0, teselas:0}, dec = new TextDecoder(), PASO = 4*1048576, cache = typeof caches!=='undefined' ? await caches.open(Zonas.CACHE) : null;
    let resto = '', cab = null, pend = [];
    const uno = async t=>{ if(!t.trim()) return; const o = JSON.parse(t);
      if(!cab){ if(o.app!=='burros-paquete') throw new Error('no es un paquete de Burros de Combate'); cab = o; return; }
      if(o.t==='marcha'){ alMarcha(o.d); n.marchas++; }
      else if(o.t==='carta'){ await ponerCarta(o.d); n.cartas++; }
      else if(o.t==='zona'){ Zonas.anotar(o.d); n.zonas++; }
      else if(o.t==='tesela' && cache){ pend.push(cache.put(o.k, new Response(deB64(o.b), {headers:{'Content-Type':o.c}}))); n.teselas++; if(pend.length>=40){ await Promise.all(pend); pend = []; } } };
    for(let p=0; p<f.size; p += PASO){
      const txt = resto + dec.decode(await f.slice(p, p + PASO).arrayBuffer(), {stream:p + PASO<f.size}), L = txt.split('\n'); resto = L.pop();
      for(const l of L) await uno(l); if(progreso) progreso('Cargando… ' + Math.round(Math.min(1, (p + PASO)/f.size)*100) + ' %', Math.min(1, (p + PASO)/f.size)); }
    await uno(resto); await Promise.all(pend);
    if(!cab) throw new Error('el archivo está vacío o no es un paquete');
    return n;
  }
  return {inventario, armar, cargar};
})();
if(typeof globalThis!=='undefined') globalThis.Paquete = Paquete;
