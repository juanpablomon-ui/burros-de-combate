/* BURROS DE COMBATE — modelo digital de terreno (cota automática y perfil real del terreno).
   Fuente: teselas Terrarium (AWS Open Data / Mapzen, derivadas de SRTM ~30 m y otras), las mismas del graficador.
   cota = (R·256 + G + B/256) − 32768. Si una tesela no carga, se prueba Open-Meteo (Copernicus 90 m).
   Necesita internet la primera vez; las teselas vistas quedan en memoria mientras la app está abierta. */
const DEM = (function(){
  const Z = 13, URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const teselas = new Map(), pendientes = new Map();
  const mundo = 256*Math.pow(2, Z);
  function px(lat, lon){ const s = Math.sin(lat*Math.PI/180);
    return {x:(lon + 180)/360*mundo, y:(0.5 - Math.log((1 + s)/(1 - s))/(4*Math.PI))*mundo}; }
  function tesela(tx, ty){
    const k = tx + '/' + ty; if(teselas.has(k)) return Promise.resolve(teselas.get(k));
    if(pendientes.has(k)) return pendientes.get(k);
    const p = new Promise(res=>{
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = ()=>{ try {
        const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, 256, 256).data, a = new Float32Array(65536);
        for(let i=0; i<65536; i++) a[i] = d[i*4]*256 + d[i*4 + 1] + d[i*4 + 2]/256 - 32768;
        teselas.set(k, a); res(a); } catch(e){ teselas.set(k, null); res(null); } };
      img.onerror = ()=>{ teselas.set(k, null); res(null); };
      img.src = URL.replace('{z}', Z).replace('{x}', tx).replace('{y}', ty);
    }).finally(()=>pendientes.delete(k));
    pendientes.set(k, p); return p;
  }
  // cota interpolada (bilineal) en un punto; null si no hay datos
  async function cota(lat, lon){
    const p = px(lat, lon), x0 = Math.floor(p.x - 0.5), y0 = Math.floor(p.y - 0.5), fx = p.x - 0.5 - x0, fy = p.y - 0.5 - y0;
    const v = async(x, y)=>{ const t = await tesela(Math.floor(x/256), Math.floor(y/256)); return t ? t[(y%256)*256 + (x%256)] : null; };
    const [a, b, c, d] = await Promise.all([v(x0, y0), v(x0 + 1, y0), v(x0, y0 + 1), v(x0 + 1, y0 + 1)]);
    if([a, b, c, d].some(z=>z===null || !isFinite(z))) return null;
    return a*(1 - fx)*(1 - fy) + b*fx*(1 - fy) + c*(1 - fx)*fy + d*fx*fy;
  }
  async function cotaPunto(lat, lon){
    const z = await cota(lat, lon); if(z!==null) return {v:z, src:'SRTM 30 m'};
    try { const r = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + lat.toFixed(5) + '&longitude=' + lon.toFixed(5));
      const j = await r.json(); if(j && j.elevation && isFinite(j.elevation[0])) return {v:+j.elevation[0], src:'Copernicus 90 m'}; } catch(e){}
    return null;
  }
  // perfil del terreno entre puntos (lat, lon) cada 'paso' metros: [{d (m acumulados), z, tramo}]
  const dist = (a, b)=>{ const R = 6371000, r = Math.PI/180, dl = (b.lat - a.lat)*r, dn = (b.lon - a.lon)*r;
    const h = Math.sin(dl/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
  async function perfil(pts, paso){
    paso = paso || 30; const m = []; let acum = 0;
    for(let i=0; i<pts.length - 1; i++){
      const A = pts[i], B = pts[i + 1], L = dist(A, B), n = Math.max(1, Math.ceil(L/paso));
      for(let j=(i ? 1 : 0); j<=n; j++){ const t = j/n; m.push({d:acum + L*t, t, lat:A.lat + (B.lat - A.lat)*t, lon:A.lon + (B.lon - A.lon)*t, tramo:i}); }
      acum += L;
    }
    const zs = await Promise.all(m.map(p=>cota(p.lat, p.lon)));
    if(zs.some(z=>z===null)) return null;
    m.forEach((p, i)=>p.z = zs[i]);
    return m;
  }
  // subida/bajada acumuladas de un perfil (con umbral para no sumar el ruido del modelo)
  function desniveles(pf, umbral){
    umbral = umbral || 5; let sube = 0, baja = 0, ref = pf[0].z;
    pf.forEach(p=>{ const d = p.z - ref; if(d>=umbral){ sube += d; ref = p.z; } else if(d<= -umbral){ baja -= d; ref = p.z; } });
    return {sube, baja};
  }
  return {cota, cotaPunto, perfil, desniveles, dist};
})();
if(typeof globalThis!=='undefined') globalThis.DEM = DEM;
