/* BURROS DE COMBATE — intercambio con el C2 TOQUI, KÜTRAL, el graficador y otros sistemas.
   Mensaje: línea legible (se puede dictar por radio o pegar en un chat) + código «#BDC1:<base64url(JSON)>» (texto o QR).
   JSON: {v:1, k (tipo), i (id), t (ms), d (datos)}. Tipos:
     PLAN  plan de marcha completo (ruta, horario, parámetros)        → C2 / otros comandantes
     PC    llegada a un punto de control con adelanto/atraso          → C2
     POS   posición actual de la unidad                               → C2
     ALTO  alto no planificado (motivo)                               → C2
     NOV   novedad (lesionado, ruta cortada, etc.)                    → C2
     FIN   fin de marcha
   Archivos: GPX 1.1 (puntos + ruta), KML 2.2 (Google Earth), GeoJSON (sistemas SIG / C2), CSV (Excel).   */
const BDC = (function(){
  const PRE = '#BDC1:';
  const TIPOS = {PLAN:'Plan de marcha', PC:'Llegada a punto de control', POS:'Posición', ALTO:'Alto no planificado', NOV:'Novedad', FIN:'Fin de marcha'};

  /* base64url de texto UTF-8 (navegador y Node) */
  function b64e(s){
    if(typeof Buffer!=='undefined') return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const b = new TextEncoder().encode(s); let t = ''; b.forEach(x=>t += String.fromCharCode(x));
    return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64d(s){
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while(s.length%4) s += '=';
    if(typeof Buffer!=='undefined') return Buffer.from(s, 'base64').toString('utf8');
    const t = atob(s), b = new Uint8Array(t.length); for(let i=0; i<t.length; i++) b[i] = t.charCodeAt(i);
    return new TextDecoder().decode(b);
  }
  const r6 = x=>Math.round(x*1e6)/1e6;
  const id = ()=>Math.random().toString(36).slice(2, 10);

  /* ---------- mensajes ---------- */
  function codigo(k, d){ return PRE + b64e(JSON.stringify({v:1, k, i:id(), t:Date.now(), d})); }
  // Busca el primer código en un texto pegado (o leído de un QR) y lo devuelve como objeto
  function leer(txt){
    const r = new RegExp(PRE.replace('#', '\\#') + '([A-Za-z0-9_-]+)').exec(String(txt||'')); if(!r) return null;
    try { const o = JSON.parse(b64d(r[1])); return o && o.v===1 && TIPOS[o.k] ? o : null; } catch(e){ return null; }
  }

  // Plan de marcha → datos compactos (coordenadas en WGS84 decimales para que cualquier sistema las entienda)
  function datosPlan(m, R){
    // solo los parámetros distintos de los por defecto (QR más liviano)
    const def = MARCHA.porDefecto(), par = {}; Object.keys(R.par).forEach(k=>{ if(R.par[k]!==def[k] && R.par[k]!==null && R.par[k]!=='') par[k] = R.par[k]; });
    return {n:m.nombre||'', u:m.unidad||'', f:m.fecha||'', h:m.hora||'', z:R.zona, par, p:R.puntos.filter(p=>p.ok).map(p=>[p.nombre, r6(p.lat), r6(p.lon), p.cota, p.obs||'', Math.round(p.det*60)||0, p.clave||'', p.ev ? 1 : 0]),
      r:{km:+(R.res.dist/1000).toFixed(2), sube:Math.round(R.res.sube), baja:Math.round(R.res.baja), total:+R.res.total.toFixed(3)}};
  }
  // Datos del plan → marcha editable
  function marchaDePlan(d){
    return {nombre:d.n||'Marcha recibida', unidad:d.u||'', fecha:d.f||'', hora:d.h||'', datum:'WGS84', zona:'', par:d.par||{},
      puntos:(d.p||[]).map(([nombre, lat, lon, cota, obs, det, clave, ev])=>({nombre, tipo:'GEO', lat:Math.abs(lat), lon:Math.abs(lon),
        norte:lat>0 || undefined, este:lon>0 || undefined, cota, obs:obs||'', det:det||'', clave:clave||'', ev:ev===undefined ? true : !!ev}))};
  }
  const hhmm = h=>MARCHA.verHora(h);
  function lineaPlan(m, R){
    const ok = R.puntos.filter(p=>p.ok);
    return 'PLAN DE MARCHA «' + (m.nombre||'sin nombre') + '»' + (m.unidad ? ' — ' + m.unidad : '') +
      ' — partida ' + (m.fecha ? m.fecha.split('-').reverse().join('-') + ' ' : '') + hhmm(R.res.partida) +
      ' — ' + (R.res.dist/1000).toFixed(1).replace('.', ',') + ' km, +' + Math.round(R.res.sube) + '/−' + Math.round(R.res.baja) + ' m' +
      ' — duración ' + MARCHA.verDur(R.res.total) + ', término ' + hhmm(R.res.termino) +
      ' — ruta ' + ok.filter(p=>p.ev).map(p=>p.clave ? p.nombre + ' (' + p.clave + ')' : p.nombre).join(' → ');
  }
  function mensajePlan(m, R){ return lineaPlan(m, R) + '\n' + codigo('PLAN', datosPlan(m, R)); }

  /* ---------- archivos ---------- */
  const xml = s=>String(s===undefined || s===null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rot = p=>p.clave ? p.clave + ' (' + p.nombre + ')' : p.nombre;
  function gpx(m, R){
    const ok = R.puntos.filter(p=>p.ok), w = p=>`lat="${r6(p.lat)}" lon="${r6(p.lon)}"`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Burros de Combate" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${xml(m.nombre)}</name><desc>${xml(lineaPlan(m, R))}</desc></metadata>
${ok.filter(p=>p.ev).map(p=>`<wpt ${w(p)}><ele>${p.cota}</ele><name>${xml(rot(p))}</name>${p.obs ? `<desc>${xml(p.obs)}</desc>` : ''}</wpt>`).join('\n')}
<rte><name>${xml(m.nombre)}</name>
${ok.map(p=>`<rtept ${w(p)}><ele>${p.cota}</ele><name>${xml(rot(p))}</name></rtept>`).join('\n')}
</rte>
</gpx>
`;
  }
  function kml(m, R){
    const ok = R.puntos.filter(p=>p.ok), c = p=>`${r6(p.lon)},${r6(p.lat)},${p.cota}`;
    const llega = {}; R.tramos.forEach(t=>llega[t.iB] = t.llegada);
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<name>${xml(m.nombre)}</name><description>${xml(lineaPlan(m, R))}</description>
<Style id="ruta"><LineStyle><color>ff3aa6e3</color><width>4</width></LineStyle></Style>
<Placemark><name>${xml(m.nombre)}</name><styleUrl>#ruta</styleUrl><ExtendedData><Data name="tipo"><value>ruta</value></Data></ExtendedData><LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>${ok.map(c).join(' ')}</coordinates></LineString></Placemark>
${ok.filter(p=>p.ev).map(p=>`<Placemark><name>${xml(rot(p))}</name><description>${xml('Cota ' + p.cota + ' m' + (llega[p.i]!==undefined ? ' · llegada ' + hhmm(llega[p.i]) : ' · partida ' + hhmm(R.res.partida)) + (p.obs ? ' · ' + p.obs : ''))}</description><Point><coordinates>${c(p)}</coordinates></Point></Placemark>`).join('\n')}
</Document></kml>
`;
  }
  // varias marchas en un solo archivo (GPX con varias rutas; KML con una carpeta por marcha)
  function gpxVarias(L){
    if(L.length===1) return gpx(L[0].m, L[0].R);
    const cuerpo = x=>{ const t = gpx(x.m, x.R); return t.slice(t.indexOf('</metadata>') + 11, t.lastIndexOf('</gpx>')); };
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Burros de Combate" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${xml(L.length + ' marchas')}</name></metadata>${L.map(cuerpo).join('')}</gpx>
`;
  }
  function kmlVarias(L){
    if(L.length===1) return kml(L[0].m, L[0].R);
    const cuerpo = x=>{ const t = kml(x.m, x.R); return `<Folder><name>${xml(x.m.nombre)}</name><description>${xml(lineaPlan(x.m, x.R))}</description>` + t.slice(t.indexOf('<Placemark>'), t.lastIndexOf('</Document>')) + '</Folder>\n'; };
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<name>${xml(L.length + ' marchas')}</name>
<Style id="ruta"><LineStyle><color>ff3aa6e3</color><width>4</width></LineStyle></Style>
${L.map(cuerpo).join('')}</Document></kml>
`;
  }
  function geojson(m, R){
    const ok = R.puntos.filter(p=>p.ok), llega = {}; R.tramos.forEach(t=>llega[t.iB] = t);
    const f = [{type:'Feature', properties:{tipo:'ruta', nombre:m.nombre, unidad:m.unidad, fecha:m.fecha, partida:m.hora,
      distancia_km:+(R.res.dist/1000).toFixed(3), ascenso_m:Math.round(R.res.sube), descenso_m:Math.round(R.res.baja),
      duracion_h:+R.res.total.toFixed(3), termino:hhmm(R.res.termino)},
      geometry:{type:'LineString', coordinates:ok.map(p=>[r6(p.lon), r6(p.lat), p.cota])}}];
    ok.filter(p=>p.ev).forEach((p, j)=>{ const t = llega[p.i]; f.push({type:'Feature', properties:{tipo:'punto_control', orden:j + 1, nombre:p.nombre, clave:p.clave || null, cota:p.cota, obs:p.obs,
      llegada:t ? hhmm(t.llegada) : hhmm(R.res.partida), rumbo_mag_desde_anterior:t ? +t.azM.toFixed(1) : null, milesimas:t ? t.mils : null},
      geometry:{type:'Point', coordinates:[r6(p.lon), r6(p.lat), p.cota]}}); });
    return JSON.stringify({type:'FeatureCollection', features:f}, null, 1);
  }
  // CSV para Excel en español (separador «;», coma decimal, con BOM para que respete las tildes)
  function csv(m, R){
    const n = (x, d)=>x===null || x===undefined ? '' : (+x).toFixed(d).replace('.', ',');
    const q = s=>'"' + String(s===undefined || s===null ? '' : s).replace(/"/g, '""') + '"';
    const filas = [['Tramo', 'Nombre clave', 'Distancia (m)', 'Dist. acum. (km)', 'Cota inicial', 'Cota final', 'Desnivel (m)', 'Pendiente (%)',
      'Acimut cuadrícula (°)', 'Acimut geográfico (°)', 'Rumbo magnético (°)', 'Rumbo (milésimas)', 'Tiempo tramo', 'Tiempo acum.', 'Hora llegada', 'Observaciones']];
    R.tramosEv.forEach(t=>filas.push([t.de + ' → ' + t.a + (t.quiebres ? ' (' + t.quiebres + ' quiebres)' : ''), t.claveB || '', n(t.dist, 0), n(t.distAcum/1000, 2), t.cotaIni, t.cotaFin, t.dv, n(t.pte*100, 1),
      n(t.azC, 1), n(t.azG, 1), n(t.azM, 1), t.mils, MARCHA.verDur(t.t), MARCHA.verDur(t.tAcum), hhmm(t.llegada), t.obs]));
    filas.push([]);
    [['Distancia total (km)', n(R.res.dist/1000, 2)], ['Ascenso acumulado (m)', Math.round(R.res.sube)], ['Descenso acumulado (m)', Math.round(R.res.baja)],
     ['Tiempo de marcha', MARCHA.verDur(R.res.marcha)], ['Altos', MARCHA.verDur(R.res.altos)], ['Detenciones planificadas', MARCHA.verDur(R.res.det)],
     ['Imprevistos', MARCHA.verDur(R.res.imprev)], ['TIEMPO TOTAL', MARCHA.verDur(R.res.total)], ['Hora de partida', hhmm(R.res.partida)], ['Hora estimada de término', hhmm(R.res.termino)],
     ['Declinación magnética (°)', n(R.decl.valor, 2) + ' (' + R.decl.fuente + ')']].forEach(f=>filas.push(f));
    return '﻿' + [['CUADRO DE MARCHA — ' + (m.nombre||'')], ['Unidad', m.unidad||''], ['Fecha', m.fecha||''], []].concat(filas)
      .map(f=>f.map(c=>typeof c==='number' ? String(c) : q(c)).join(';')).join('\r\n');
  }

  /* ---------- importar GPX / KML (puntos de control) ---------- */
  // Devuelve [{nombre, lat, lon, cota}] con lat/lon con signo. Prefiere los waypoints / Placemark Point; si no hay, usa la ruta o el track
  // reducido a un máximo de 'max' puntos.
  function leerArchivo(texto, max){
    max = max || 30;
    const tags = (s, t)=>{ const r = new RegExp('<(?:\\w+:)?' + t + '\\b([^>]*)>([\\s\\S]*?)</(?:\\w+:)?' + t + '>', 'gi'), o = []; let x; while((x = r.exec(s))) o.push({at:x[1], in:x[2]}); return o; };
    const auto = new RegExp('<(?:\\w+:)?(wpt|rtept|trkpt)\\b([^>]*)/>', 'gi');
    const val = (s, t)=>{ const x = tags(s, t)[0]; return x ? x.in.replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
    const at = (s, a)=>{ const x = new RegExp(a + '\\s*=\\s*"([^"]*)"').exec(s); return x ? +x[1] : NaN; };
    let pts = [];
    if(/<gpx/i.test(texto)){
      const de = t=>tags(texto, t).map(x=>({nombre:val(x.in, 'name'), lat:at(x.at, 'lat'), lon:at(x.at, 'lon'), cota:parseFloat(val(x.in, 'ele'))}));
      pts = de('wpt'); if(pts.length) pts.forEach(p=>p.ev = true); if(!pts.length) pts = de('rtept'); if(!pts.length) pts = de('trkpt');
      if(!pts.length){ let x; while((x = auto.exec(texto))) pts.push({nombre:'', lat:at(x[2], 'lat'), lon:at(x[2], 'lon'), cota:NaN}); }
    } else if(/<kml/i.test(texto)){
      tags(texto, 'Placemark').forEach(pm=>{
        const nombre = val(pm.in, 'name'), pt = tags(pm.in, 'Point')[0], ls = tags(pm.in, 'LineString')[0];
        const cs = s=>val(s, 'coordinates').split(/\s+/).filter(Boolean).map(c=>c.split(',').map(Number));
        if(pt) cs(pt.in).forEach(([lon, lat, h])=>pts.push({nombre, lat, lon, cota:h, ev:true}));
        else if(ls && !pts.ruta) pts.ruta = cs(ls.in).map(([lon, lat, h], i)=>({nombre:'', lat, lon, cota:h}));
      });
      if(!pts.length && pts.ruta) pts = pts.ruta;
    }
    pts = pts.filter(p=>isFinite(p.lat) && isFinite(p.lon));
    if(pts.length>max){ const k = (pts.length - 1)/(max - 1); pts = Array.from({length:max}, (_, i)=>pts[Math.round(i*k)]); }
    return pts.map((p, i)=>{ const c = /^([A-ZÁÉÍÓÚÑÜ0-9 -]+) \((.+)\)$/.exec(p.nombre || '');   // «ALFA (PC1)» exportado por esta app
      return Object.assign(p, {ev:p.ev || i===0 || !!p.nombre, nombre:c ? c[2] : p.nombre || (i===0 ? 'PIM' : ''), clave:c ? c[1] : '', cota:isFinite(p.cota) && p.cota ? Math.round(p.cota) : ''}); });
  }

  return {PRE, TIPOS, codigo, leer, datosPlan, marchaDePlan, lineaPlan, mensajePlan, gpx, kml, gpxVarias, kmlVarias, geojson, csv, leerArchivo, b64e, b64d};
})();
if(typeof globalThis!=='undefined') globalThis.BDC = BDC;
