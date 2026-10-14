/* BURROS DE COMBATE — vuelta al horizonte (pedido del usuario, v0.89).
   Desde un punto, con el modelo de terreno (las mismas teselas de las curvas y la cota, también sin señal en las zonas guardadas):
   · la línea del horizonte en 360° (rayos cada 0,5°, muestras cada 20–60 m hasta el alcance, con la curvatura de la Tierra y la
     refracción normal, k = 0,13), con el observador a 1,7 m sobre el suelo;
   · los cerros y puntos destacados que asoman en el horizonte (máximos de la silueta que sobresalen ≥ 0,4° en ±12°), con rumbo, distancia
     y cota: los puntos de referencia (PR) que el usuario puede nombrar;
   · la zona vista y la zona muerta (lo que se ve y lo que no hasta el alcance), como imagen para el mapa.
   Los rumbos internos son geográficos; la pantalla los muestra magnéticos con la declinación de la marcha. */
const Horizonte = (function(){
  const R = 6371000, K = 0.13, PASO_AZ = 0.5, rad = Math.PI/180;
  // muestras a lo largo de un rayo: más juntas cerca
  function distancias(radio){ const D = []; for(let d=20; d<=radio; d += d<1000 ? 20 : d<3000 ? 40 : 60) D.push(d); return D; }
  /* cálculo con una función de cota h(lat, lon) (sin espera). Devuelve {z0, ojo, perfil:[{az, ang, d, lat, lon, z}], vis (por rayo,
     visible o no en cada muestra), D (distancias), prs (puntos destacados)} */
  function calcularCon(h, lat, lon, op){
    op = Object.assign({radio:5000, ojo:1.7}, op || {});
    // cota del suelo: la del punto de la ruta si se conoce (el modelo de 30 m suele quedar bajo en las cumbres); si no, la del modelo
    const zm = h(lat, lon), zs = op.zs!==undefined && op.zs!==null && isFinite(op.zs) ? Math.max(+op.zs, zm===null ? -Infinity : zm) : zm; if(zs===null) return null;
    const z0 = zs + op.ojo, D = distancias(op.radio), cosL = Math.cos(lat*rad), perfil = [], vis = [];
    for(let i=0; i<360/PASO_AZ; i++){
      const az = i*PASO_AZ, s = Math.sin(az*rad), c = Math.cos(az*rad), v = new Uint8Array(D.length);
      let max = -Infinity, best = null;
      for(let j=0; j<D.length; j++){ const d = D[j], la = lat + d*c/111320, lo = lon + d*s/(111320*cosL), z = h(la, lo); if(z===null) continue;
        const a = Math.atan2(z - d*d/(2*R)*(1 - K) - z0, d);
        if(a>=max){ v[j] = 1; max = a; best = {d, lat:la, lon:lo, z}; } }
      vis.push(v); perfil.push(Object.assign({az, ang:max===-Infinity ? 0 : max/rad}, best || {d:op.radio, lat, lon, z:zs}));
    }
    // lo que queda justo en el borde del alcance es el corte, no un cerro: no cuenta como punto destacado
    return {lat, lon, zs, z0, ojo:op.ojo, radio:op.radio, D, perfil, vis, prs:destacados(perfil).filter(p=>p.d<op.radio - 200)};
  }
  // cerros que asoman en la silueta: máximo local en ±12° que sobresale al menos 0,4° sobre lo más bajo de esa ventana, a más de 150 m
  function destacados(P){
    const n = P.length, w = Math.round(12/PASO_AZ), L = [];
    for(let i=0; i<n; i++){ const a = P[i].ang; if(P[i].d<150) continue; let es = true, min = a;
      for(let k=-w; k<=w && es; k++){ if(!k) continue; const q = P[(i + k + n)%n].ang; if(q>a || (q===a && k<0)) es = false; if(q<min) min = q; }
      if(es && a - min>=0.4) L.push(Object.assign({prom:a - min}, P[i])); }
    return L.sort((x, y)=>y.prom - x.prom).slice(0, 12).sort((x, y)=>x.az - y.az);
  }
  // cálculo con el modelo de terreno (carga las teselas del área)
  async function calcular(lat, lon, op){
    op = Object.assign({radio:5000, ojo:1.7}, op || {});
    const h = await DEM.area(lat, lon, op.radio + 100); return calcularCon(h, lat, lon, op);
  }
  // imagen de la zona vista (verde claro) y muerta (rojizo) sobre la caja del alcance: {url, caja:[[s, o], [n, e]]}
  function imagenVista(H, tam){
    tam = tam || 240; const c = document.createElement('canvas'); c.width = c.height = tam; const x = c.getContext('2d'), im = x.createImageData(tam, tam), d = im.data;
    const r = H.radio, cosL = Math.cos(H.lat*rad), dLa = r/111320, dLo = r/(111320*cosL), nAz = H.vis.length, D = H.D;
    for(let j=0; j<tam; j++) for(let i=0; i<tam; i++){
      const dx = ((i + 0.5)/tam*2 - 1)*r, dy = (1 - (j + 0.5)/tam*2)*r, dist = Math.hypot(dx, dy), o = (j*tam + i)*4; if(dist>r || dist<20) continue;
      const az = (Math.atan2(dx, dy)/rad + 360)%360, k = Math.round(az/PASO_AZ)%nAz; let lo = 0, hi = D.length - 1; while(lo<hi){ const m = (lo + hi)>>1; if(D[m]<dist) lo = m + 1; else hi = m; }
      const v = H.vis[k][lo]; if(v){ d[o] = 110; d[o + 1] = 210; d[o + 2] = 110; d[o + 3] = 60; } else { d[o] = 190; d[o + 1] = 50; d[o + 2] = 40; d[o + 3] = 75; } }
    x.putImageData(im, 0, 0);
    return {url:c.toDataURL('image/png'), caja:[[H.lat - dLa, H.lon - dLo], [H.lat + dLa, H.lon + dLo]]};
  }
  // panorama en SVG: silueta del horizonte en 360° con rumbos magnéticos (dec = declinación, + al este) y los PR
  // op: {ancho (px por 360°), alto, claro (colores para papel), rumbo (línea de la brújula, magnético)}
  function svg(H, prs, dec, op){
    op = Object.assign({ancho:1440, alto:200, claro:false}, op || {});
    const W = op.ancho, Hh = op.alto, top = 34, base = Hh - 22, angs = H.perfil.map(p=>p.ang), amax = Math.max(1, ...angs), amin = Math.min(-1, ...angs);
    const mag = az=>((az - dec)%360 + 360)%360, X = az=>mag(az)/360*W, Y = a=>top + (amax - a)/(amax - amin)*(base - top);
    const col = op.claro ? {cielo:'#eef3f8', tierra:'#8a8a6a', borde:'#3d3d2a', txt:'#222', tn:'#666', pr:'#b3261e', lin:'#999'} : {cielo:'#1a1f26', tierra:'#5c5a3e', borde:'#c9b98a', txt:'#eee', tn:'#a9a58e', pr:'#e3a63a', lin:'#555'};
    // silueta ordenada por rumbo magnético, cerrada abajo
    const P = H.perfil.map(p=>({x:X(p.az), y:Y(p.ang)})).sort((a, b)=>a.x - b.x), pts = [[0, P[P.length - 1].y]].concat(P.map(p=>[p.x, p.y]), [[W, P[0].y]]);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" class="horiz-svg" font-family="Inter,Arial,sans-serif">
      <rect width="${W}" height="${Hh}" fill="${col.cielo}"/>
      <polygon points="${pts.map(p=>p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} ${W},${Hh} 0,${Hh}" fill="${col.tierra}" stroke="${col.borde}" stroke-width="1.2"/>`;
    // el horizonte verdadero (0°)
    if(amin<0 && amax>0) s += `<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="${col.lin}" stroke-dasharray="3 5"/>`;
    // escala: rayas cada 10°, rótulo cada 30° (con N, E, S, O)
    const card = {0:'N', 90:'E', 180:'S', 270:'O'};
    for(let g=0; g<360; g += 10){ const x = g/360*W; s += `<line x1="${x}" x2="${x}" y1="${Hh - 20}" y2="${Hh - (g%30 ? 14 : 8)}" stroke="${col.tn}"/>`;
      if(g%30===0) s += `<text x="${x + 2}" y="${Hh - 4}" font-size="11" fill="${card[g] ? col.pr : col.tn}" font-weight="${card[g] ? 700 : 400}">${card[g] || g + '°'}</text>`; }
    // puntos de referencia
    (prs || []).forEach((p, i)=>{ const x = X(p.az), y = Y(p.ang); const t = p.nombre || ('PR-' + (i + 1));
      s += `<line x1="${x}" x2="${x}" y1="${y - 4}" y2="${top - 6}" stroke="${col.pr}" stroke-width="1"/><circle cx="${x}" cy="${y}" r="3.5" fill="${col.pr}"/>
        <text x="${x + 3}" y="${top - 18}" font-size="11" font-weight="700" fill="${col.txt}">${esc(t)}</text><text x="${x + 3}" y="${top - 7}" font-size="10" fill="${col.tn}">${Math.round(mag(p.az))}° · ${fmtD(p.d)}</text>`; });
    // rumbo de la brújula (magnético): se mueve desde afuera cambiando x de #hRumbo
    if(op.rumbo!==undefined){ const x = op.rumbo===null ? -100 : ((op.rumbo%360) + 360)%360/360*W;
      s += `<g id="hRumbo" transform="translate(${x},0)"><line x1="0" x2="0" y1="0" y2="${Hh}" stroke="#6fb3d9" stroke-width="2"/><text x="3" y="12" font-size="11" fill="#6fb3d9">hacia donde miras</text></g>`; }
    return s + '</svg>';
  }
  const esc = t=>String(t).replace(/[&<>"]/g, c=>({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);
  const fmtD = d=>d>=1000 ? (d/1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m';
  // nombres de cerros de OpenStreetMap (con señal): cumbres a menos de 400 m de cada PR
  async function nombresOsm(lat, lon, radio, prs){
    const q = '[out:json][timeout:20];node(around:' + Math.round(radio + 500) + ',' + lat.toFixed(5) + ',' + lon.toFixed(5) + ')["natural"~"peak|hill|saddle"]["name"];out;';
    const r = await fetch('https://overpass-api.de/api/interpreter', {method:'POST', body:'data=' + encodeURIComponent(q), headers:{'Content-Type':'application/x-www-form-urlencoded'}});
    const j = await r.json(), C = (j.elements || []).map(e=>({nombre:e.tags.name, lat:e.lat, lon:e.lon}));
    let n = 0; prs.forEach(p=>{ if(p.nombre) return; let mejor = null, dm = 400;
      C.forEach(c=>{ const d = DEM.dist(p, c); if(d<dm){ dm = d; mejor = c; } }); if(mejor){ p.nombre = mejor.nombre; n++; } });
    return n;
  }
  return {calcular, calcularCon, destacados, imagenVista, svg, nombresOsm, fmtD, PASO_AZ};
})();
if(typeof globalThis!=='undefined') globalThis.Horizonte = Horizonte;
