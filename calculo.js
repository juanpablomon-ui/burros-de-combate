/* BURROS DE COMBATE — motor de cálculo de marchas (sin dependencias; funciona en el navegador y en Node para las pruebas).
   Coordenadas: UTM directa/inversa de Snyder (USGS PP 1395), cambio de datum de Molodensky (3 parámetros), convergencia
   de meridianos, declinación (manual o WMM2025), rumbo magnético en grados y milésimas (6400).
   Tiempos: cartilla de la Escuela de Montaña (CRM 2013), MIDE / DIN 33466 y marcha general (velocidad por terreno).  */
const MARCHA = (function(){
  const rad = Math.PI/180, K0 = 0.9996;

  /* ---------- datums (traslación a WGS84) ---------- */
  const DATUMS = {
    WGS84:   {n:'WGS84 / SIRGAS-Chile (GPS, cartas IGM actuales)', a:6378137, f:1/298.257223563, d:[0, 0, 0]},
    PSAD56N: {n:'PSAD56 — Chile norte (norte de 21°30′ S)', a:6378388, f:1/297, d:[-270, 183, -390]},
    PSAD56S: {n:'PSAD56 — Chile sur (39° a 43°30′ S)', a:6378388, f:1/297, d:[-305, 243, -442]},
    PSAD56M: {n:'PSAD56 — media Sudamérica', a:6378388, f:1/297, d:[-288, 175, -376]},
    SAD69:   {n:'SAD69 — Chile (norte de 45° S)', a:6378160, f:1/298.25, d:[-75, -1, -44]}
  };
  const W = DATUMS.WGS84;

  /* ---------- UTM ---------- */
  function llAUtm(lat, lon, zona, el){
    el = el || W; const a = el.a, e2 = el.f*(2 - el.f), ep2 = e2/(1 - e2);
    zona = zona || Math.floor((lon + 180)/6) + 1;
    const p = lat*rad, l0 = (zona*6 - 183)*rad, N = a/Math.sqrt(1 - e2*Math.sin(p)**2), T = Math.tan(p)**2, C = ep2*Math.cos(p)**2,
      A = Math.cos(p)*(lon*rad - l0),
      M = a*((1 - e2/4 - 3*e2**2/64 - 5*e2**3/256)*p - (3*e2/8 + 3*e2**2/32 + 45*e2**3/1024)*Math.sin(2*p)
        + (15*e2**2/256 + 45*e2**3/1024)*Math.sin(4*p) - (35*e2**3/3072)*Math.sin(6*p));
    const e = K0*N*(A + (1 - T + C)*A**3/6 + (5 - 18*T + T*T + 72*C - 58*ep2)*A**5/120) + 500000;
    const n = K0*(M + N*Math.tan(p)*(A*A/2 + (5 - T + 9*C + 4*C*C)*A**4/24 + (61 - 58*T + T*T + 600*C - 330*ep2)*A**6/720)) + (lat<0 ? 1e7 : 0);
    const conv = Math.atan(Math.tan(lon*rad - l0)*Math.sin(p))/rad, k = K0*(1 + (1 + C)*A*A/2);
    return {e, n, zona, sur:lat<0, conv, k};
  }
  function utmALl(e, n, zona, sur, el){
    el = el || W; const a = el.a, e2 = el.f*(2 - el.f), ep2 = e2/(1 - e2), e1 = (1 - Math.sqrt(1 - e2))/(1 + Math.sqrt(1 - e2));
    const x = e - 500000, y = sur===false ? n : n - 1e7;
    const mu = y/K0/(a*(1 - e2/4 - 3*e2**2/64 - 5*e2**3/256));
    const p1 = mu + (3*e1/2 - 27*e1**3/32)*Math.sin(2*mu) + (21*e1**2/16 - 55*e1**4/32)*Math.sin(4*mu) + (151*e1**3/96)*Math.sin(6*mu) + (1097*e1**4/512)*Math.sin(8*mu);
    const N1 = a/Math.sqrt(1 - e2*Math.sin(p1)**2), T1 = Math.tan(p1)**2, C1 = ep2*Math.cos(p1)**2, R1 = a*(1 - e2)/(1 - e2*Math.sin(p1)**2)**1.5, D = x/(N1*K0);
    const lat = p1 - (N1*Math.tan(p1)/R1)*(D*D/2 - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*ep2)*D**4/24 + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*ep2 - 3*C1*C1)*D**6/720);
    const lon = zona*6 - 183 + ((D - (1 + 2*T1 + C1)*D**3/6 + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*ep2 + 24*T1*T1)*D**5/120)/Math.cos(p1))/rad;
    return {lat:lat/rad, lon};
  }
  /* Molodensky estándar: datum de entrada → WGS84 */
  function aWgs84(lat, lon, h, dat){
    const s = DATUMS[dat] || W; if(s===W) return {lat, lon};
    const a = s.a, f = s.f, e2 = f*(2 - f), b = a*(1 - f), da = W.a - a, df = W.f - f, [dX, dY, dZ] = s.d;
    const p = lat*rad, l = lon*rad, sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
    const Rn = a/Math.sqrt(1 - e2*sp*sp), Rm = a*(1 - e2)/(1 - e2*sp*sp)**1.5;
    const dp = (-dX*sp*cl - dY*sp*sl + dZ*cp + da*(Rn*e2*sp*cp)/a + df*(Rm*a/b + Rn*b/a)*sp*cp)/(Rm + (h||0));
    const dl = (-dX*sl + dY*cl)/((Rn + (h||0))*cp);
    return {lat:lat + dp/rad, lon:lon + dl/rad};
  }

  // WGS84 → datum de la carta (inversa por iteración; error < 1 mm)
  function deWgs84(lat, lon, h, dat){
    if(!DATUMS[dat] || DATUMS[dat]===W) return {lat, lon};
    let g = {lat, lon};
    for(let i=0; i<4; i++){ const w = aWgs84(g.lat, g.lon, h, dat); g = {lat:g.lat + (lat - w.lat), lon:g.lon + (lon - w.lon)}; }
    return g;
  }
  // posición en el mapa (WGS84) → campos del punto en su sistema (UTM o geográficas) y datum de la marcha
  function camposDesde(lat, lon, tipo, dat, zona){
    const g = deWgs84(lat, lon, 0, dat);
    if(tipo==='GEO') return {lat:Math.abs(g.lat).toFixed(6), lon:Math.abs(g.lon).toFixed(6), norte:g.lat>0 || undefined, este:g.lon>0 || undefined};
    const u = llAUtm(g.lat, g.lon, zona || undefined, DATUMS[dat] || W);
    return {zona:u.zona, e:Math.round(u.e), n:Math.round(u.n), norte:g.lat>0 || undefined};
  }

  /* ---------- lectura de coordenadas de un punto ---------- */
  // p: {tipo:'UTM', zona, e, n} | {tipo:'GEO', lat, lon} (grados decimales; S y W en positivo como en las cartas, o con signo)
  //    | {tipo:'GEO', latG, latM, latS, lonG, lonM, lonS}
  const num = v=>v===null || v===undefined || v==='' ? NaN : Number(String(v).replace(',', '.'));
  function gms(g, m, s){ g = num(g); if(isNaN(g)) return NaN; return Math.abs(g) + (num(m)||0)/60 + (num(s)||0)/3600; }
  // «33 21 36», «33°21'36.5"S», «33.36», «33 21.6» → grados decimales (sin signo)
  function leerAng(v){
    if(typeof v==='number') return Math.abs(v);
    const x = String(v||'').replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g); if(!x) return NaN;
    const [g, m, s] = x.map(Number); if(x.length>3 || (m!==undefined && m>=60) || (s!==undefined && s>=60)) return NaN;
    return g + (m||0)/60 + (s||0)/3600;
  }
  function puntoWgs(p, dat){
    let lat, lon;
    if(p.tipo==='GEO'){
      lat = p.latG!==undefined ? gms(p.latG, p.latM, p.latS) : leerAng(p.lat);
      lon = p.lonG!==undefined ? gms(p.lonG, p.lonM, p.lonS) : leerAng(p.lon);
      if(isNaN(lat) || isNaN(lon)) return null;
      lat = p.norte ? lat : -lat; lon = p.este ? lon : -lon;   // Chile: sur y oeste por defecto
    } else {
      const e = num(p.e), n = num(p.n), z = num(p.zona) || 19; if(isNaN(e) || isNaN(n)) return null;
      const s = DATUMS[dat] || W, o = utmALl(e, n, z, p.norte ? false : true, s); lat = o.lat; lon = o.lon;
    }
    return aWgs84(lat, lon, num(p.cota)||0, dat);
  }

  /* ---------- tabla de velocidades de marcha vertical en montaña (cartilla CRM 2013, Fig. 1-3), m de desnivel por hora ---------- */
  const TERRENOS = {
    sinNieve: {n:'Sin nieve — a pie'},
    nieve:    {n:'Con nieve — a pie (nieve hasta 30 cm)'},
    raquetas: {n:'Con nieve — sobre raquetas'},
    esquies:  {n:'Con nieve — sobre esquíes (solo tropa andina)'}
  };
  // [subida mín, subida máx, bajada] por carga 10 / 20 / 30 kg
  const TABLA_VERTICAL = {
    normal: {sinNieve:{10:[300, 350, 600], 20:[250, 300, 500], 30:[200, 250, 350]},
             nieve:   {10:[250, 250, 350], 20:[200, 200, 300], 30:[150, 150, 200]},
             raquetas:{10:[300, 300, 400], 20:[200, 200, 300], 30:[150, 150, 250]},
             esquies: null},
    andina: {sinNieve:{10:[450, 550, 700], 20:[350, 450, 550], 30:[250, 350, 400]},
             nieve:   {10:[300, 300, 400], 20:[250, 250, 350], 30:[200, 200, 300]},
             raquetas:{10:[350, 350, 450], 20:[250, 250, 350], 30:[200, 200, 300]},
             esquies: {10:[450, 450, 1200], 20:[350, 350, 1000], 30:[300, 300, 900]}}
  };
  // Velocidades de la tabla según tropa, terreno y carga. criterio 'min' (prudente, por defecto) | 'media' | 'max'
  function velVertical(tropa, terreno, carga, criterio){
    const t = (TABLA_VERTICAL[tropa] || {})[terreno]; if(!t) return null;
    const c = [10, 20, 30].reduce((m, x)=>Math.abs(x - carga)<Math.abs(m - carga) ? x : m, 10), [s1, s2, b] = t[c];
    return {sub:criterio==='max' ? s2 : criterio==='media' ? (s1 + s2)/2 : s1, baj:b, rango:s1===s2 ? String(s1) : s1 + '–' + s2, carga:c};
  }

  /* ---------- marcha general (ATP 3-21.18 Foot Marches, 2025, párr. 1-92, 1-101 y 3-28; EB-MC-002 n.º 8b) ----------
     Velocidades promedio en km/h que YA INCLUYEN el alto de 10 min por hora (paso 76 cm a 106 pasos/min = 4,8 km/h de marcha). */
  const VIAS = {camino:'Camino', campo:'Campo traviesa'};
  const VEL_GENERAL = {camino:{dia:4, noche:3.2}, campo:{dia:2.4, noche:1.6}};
  const velGeneral = (via, noche)=>(VEL_GENERAL[via] || VEL_GENERAL.camino)[noche ? 'noche' : 'dia'];

  /* ---------- columna (ATP 3-21.18 párr. 1-99, 1-104, 1-107, tabla 1-1; FM 21-18) ----------
     Cada soldado ocupa la distancia entre hombres + 0,4 m; en columna de a dos el largo se divide por 2
     (fila india 2 m = 2,4 m/hombre; de a dos 2 m = 1,2; de a dos 5 m = 2,7, como la tabla 1-1).
     Distancias por defecto: entre hombres 2–5 m de día / 1–3 m de noche; entre pelotones 50 m / 25 m; entre compañías 100 m / 50 m. */
  function columna(par, vKmh){
    const n = Math.max(0, Math.round(num(par.efectivo)||0)); if(!n) return null;
    const filas = num(par.filas)===1 ? 1 : 2, dh = num(par.distHombres) || (par.noche ? 2 : 5), u = Math.max(1, Math.round(num(par.unidades)||1));
    const du = num(par.distUnidades) || (par.noche ? 25 : 50), factor = (dh + 0.4)/filas;
    const largo = n*factor + (u - 1)*du, paso = largo/(vKmh*1000/60)/60;   // tiempo de paso en horas
    return {n, filas, dh, u, du, factor, largo, paso, vKmh};
  }

  /* ---------- calor y agua (TB MED 507, 2022, tabla 3-2) ----------
     WBGT en °C (convertido de °F). Por cada intensidad: [minutos de trabajo por hora (60 = sin límite), litros por hora].
     Máximo 1,4 L por hora (1½ qt) y 11,4 L por día (12 qt). */
  const QT = 0.946;
  const CALOR = [
    {cat:1, n:'1 — blanca',   desde:25.6, f:[60, .5], m:[60, .75], p:[40, .75], mp:[20, 1]},
    {cat:2, n:'2 — verde',    desde:27.8, f:[60, .5], m:[60, .75], p:[30, 1],   mp:[15, 1]},
    {cat:3, n:'3 — amarilla', desde:29.4, f:[60, .75], m:[60, .75], p:[30, 1],  mp:[10, 1]},
    {cat:4, n:'4 — roja',     desde:31.1, f:[60, .75], m:[50, .75], p:[20, 1],  mp:[10, 1]},
    {cat:5, n:'5 — negra',    desde:32.2, f:[60, 1],   m:[20, 1],   p:[15, 1],  mp:[10, 1]}];
  const TRABAJOS = {f:'Fácil (≈250 W)', moderado:'Moderado (≈425 W, p. ej. patrullar con ~14 kg)', pesado:'Pesado (≈600 W, p. ej. patrullar con ~20 kg)', mp:'Muy pesado (≈800 W)'};
  function calor(par, horas){
    const w = num(par.wbgt); if(isNaN(w)) return null;
    const c = [...CALOR].reverse().find(x=>w>=x.desde), k = ({f:'f', moderado:'m', pesado:'p', mp:'mp'})[par.trabajo] || 'm';
    if(!c) return {cat:0, n:'bajo la categoría 1', trabajo:60, lh:null, litros:null, wbgt:w};
    const [tr, qt] = c[k], lh = qt*QT, litros = Math.min(lh*horas, 12*QT);
    return {cat:c.cat, n:c.n, trabajo:tr, descanso:60 - tr, lh, litros, tope:lh*horas>12*QT, wbgt:w};
  }

  /* ---------- parámetros por defecto de una marcha ---------- */
  const METODOS = {
    cartilla: 'Cartilla Escuela de Montaña (pendiente > 5 % por desnivel, si no por distancia)',
    mide: 'MIDE / DIN 33466 (mayor de horizontal y vertical + mitad del menor)',
    general: 'Marcha general (velocidad según terreno, día o noche)'
  };
  function porDefecto(){
    return {metodo:'cartilla', tropa:'normal', terreno:'sinNieve', carga:20, criterio:'min',
      velSub:null, velBaj:null,   // null = de la tabla
      velLlano:4, pteCr:0.05, altos:0.10, imprev:0.10,
      velGeneral:null, via:'camino', noche:false,   // marcha general: velocidad de la tabla ATP según vía y día/noche
      efectivo:'', filas:2, distHombres:null, unidades:1, distUnidades:null,   // columna
      wbgt:'', trabajo:'moderado',   // calor y agua
      declAuto:true, decl:0, declFecha:'', declVar:0};
  }

  /* ---------- declinación a la fecha ---------- */
  function declinacion(par, lat, lon, fecha, cotaM){
    const f = fecha ? new Date(fecha + 'T12:00:00') : new Date();
    if(par.declAuto && typeof WMM!=='undefined' && lat!==undefined){
      const y = WMM.year(f); return {valor:WMM.decl(lat, lon, (cotaM||0)/1000, y), fuente:'WMM2025' + (WMM.valido(y) ? '' : ' (fuera de vigencia)')};
    }
    const d0 = num(par.decl) || 0, fr = par.declFecha ? new Date(par.declFecha + 'T12:00:00') : f;
    return {valor:d0 + (num(par.declVar)||0)/60*(f - fr)/(365.25*864e5), fuente:'manual'};
  }

  /* ---------- tiempo de un tramo (horas) ---------- */
  function tiempoTramo(dh, dv, par, vel){
    const th = dh/1000/(num(par.velLlano)||4), sub = Math.max(dv, 0), baj = Math.max(-dv, 0);
    const tv = sub/vel.sub + baj/vel.baj;
    if(par.metodo==='mide') return {t:Math.max(th, tv) + Math.min(th, tv)/2, como:'MIDE'};
    if(par.metodo==='general'){ const v = num(par.velGeneral) || velGeneral(vel.via || par.via, par.noche); return {t:dh/1000/v, como:'general', v}; }
    const pte = dh>0 ? dv/dh : (dv ? Infinity*Math.sign(dv) : 0), cr = num(par.pteCr) || 0.05;
    if(pte>cr) return {t:dv/vel.sub, como:'subida'};
    if(pte< -cr) return {t:-dv/vel.baj, como:'bajada'};
    return {t:th, como:'llano'};
  }

  /* ---------- cálculo completo del cuadro de marcha ---------- */
  // m: {fecha:'AAAA-MM-DD', hora:'HH:MM', datum, zona (vacío = la del primer punto), par:{...}, puntos:[{nombre, tipo, ..., cota, obs}]}
  function calcular(m){
    const par = Object.assign(porDefecto(), m.par || {}), dat = m.datum || 'WGS84';
    const vt = velVertical(par.tropa, par.terreno, par.carga, par.criterio) || velVertical('normal', 'sinNieve', par.carga, par.criterio);
    const vel = {sub:num(par.velSub) || vt.sub, baj:num(par.velBaj) || vt.baj, tabla:vt};
    const pts = (m.puntos || []).map((p, i)=>{
      const g = puntoWgs(p, dat), cota = num(p.cota);
      return {i, nombre:p.nombre || ('P' + (i + 1)), obs:p.obs || '', det:(num(p.det)||0)/60, ok:!!g && !isNaN(cota), lat:g && g.lat, lon:g && g.lon, cota};
    });
    const val = pts.filter(p=>p.ok);
    const zona = num(m.zona) || (val[0] ? Math.floor((val[0].lon + 180)/6) + 1 : 19);
    val.forEach(p=>Object.assign(p, {utm:llAUtm(p.lat, p.lon, zona)}));
    const ref = val[0], dec = declinacion(par, ref && ref.lat, ref && ref.lon, m.fecha, ref && ref.cota);
    const tramos = []; let acum = 0, dist = 0, sube = 0, baja = 0;
    for(let i=0; i<pts.length - 1; i++){
      const A = pts[i], B = pts[i + 1]; if(!A.ok || !B.ok) continue;
      const dE = B.utm.e - A.utm.e, dN = B.utm.n - A.utm.n, dg = Math.hypot(dE, dN), dh = dg/((A.utm.k + B.utm.k)/2), dv = B.cota - A.cota;
      const azC = dg ? (Math.atan2(dE, dN)/rad + 360)%360 : 0, azG = (azC + A.utm.conv + 360)%360, azM = (azG - dec.valor + 360)%360;
      const via = m.puntos[B.i].via || par.via, tt = tiempoTramo(dh, dv, par, Object.assign({}, vel, {via}));
      acum += tt.t; dist += dh; if(dv>0) sube += dv; else baja -= dv;
      tramos.push({de:A.nombre, a:B.nombre, iA:A.i, iB:B.i, dist:dh, distAcum:dist, cotaIni:A.cota, cotaFin:B.cota, dv,
        pte:dh ? dv/dh : 0, via, azC, azG, azM, mils:Math.round(azM*6400/360)%6400, t:tt.t, como:tt.como, tAcum:acum, obs:B.obs});
    }
    // detenciones planificadas en los puntos intermedios (comida, descanso, reorganización); no cuenta el último punto
    const det = pts.slice(0, -1).reduce((a, p)=>a + p.det, 0);
    const altos = acum*(num(par.altos)||0), imprev = (acum + altos + det)*(num(par.imprev)||0), total = acum + altos + det + imprev;
    const h0 = horaAHoras(m.hora);
    // hora estimada de llegada y salida en cada punto: partida + marcha acumulada con sus altos + detenciones anteriores
    // (los imprevistos quedan como reserva al final)
    let detAc = pts[0] ? pts[0].det : 0;
    tramos.forEach(t=>{ t.llegada = h0===null ? null : h0 + t.tAcum*(1 + (num(par.altos)||0)) + detAc;
      t.det = pts[t.iB].det; t.salida = t.llegada===null ? null : t.llegada + t.det; detAc += t.det; });
    const alto = val.reduce((x, p)=>!x || p.cota>x.cota ? p : x, null);
    // columna: velocidad media de la marcha (distancia / tiempo de marcha) para el tiempo de paso
    const vMedia = acum ? dist/1000/(acum*(1 + (num(par.altos)||0))) : velGeneral(par.via, par.noche), col = columna(par, vMedia || 4);
    const ter = h0===null ? null : h0 + total;
    // avisos doctrinarios
    const avisos = [];
    if(par.metodo==='general' && tramos.some(t=>Math.abs(t.pte)>=0.07)) avisos.push('Hay tramos con pendiente de 7 % o más: según ATP 3-21.18 (párr. 1-28) afectan la velocidad. Considera el método de la cartilla de montaña o MIDE.');
    if(dist>56000) avisos.push('Más de 56 km: sobre el máximo recomendado para una marcha forzada de 24 h (ATP 3-21.18 párr. 2-30). Divide en jornadas.');
    else if(dist>32000) avisos.push('Más de 32 km: es una marcha forzada (la jornada normal es 8 h a 4 km/h = 32 km, ATP 3-21.18 párr. 2-30). Planifica unas 24 h de recuperación.');
    return {par, vel, zona, decl:dec, puntos:pts, tramos, columna:col, calor:calor(par, total), avisos,
      res:{dist, sube, baja, marcha:acum, altos, det, imprev, total, partida:h0, termino:ter, terminoCola:ter===null || !col ? null : ter + col.paso, alto,
        conv:ref ? ref.utm.conv : null, lejos:val.some(p=>Math.abs(p.lon - (zona*6 - 183))>4)}};
  }

  /* ---------- rumbo y distancia entre dos posiciones (para seguir la marcha con GPS) ---------- */
  // mismo método que el cuadro: cuadrícula UTM de la zona de trabajo, convergencia y declinación
  function rumboEntre(a, b, zona, decl){
    const A = llAUtm(a.lat, a.lon, zona), B = llAUtm(b.lat, b.lon, zona), dE = B.e - A.e, dN = B.n - A.n, dg = Math.hypot(dE, dN);
    const azC = dg ? (Math.atan2(dE, dN)/rad + 360)%360 : 0, azG = (azC + A.conv + 360)%360, azM = (azG - (decl||0) + 360)%360;
    return {dist:dg/((A.k + B.k)/2), azC, azG, azM, mils:Math.round(azM*6400/360)%6400};
  }
  // proyección de una posición sobre un tramo A→B (en metros locales): fracción recorrida (0–1) y distancia a la línea
  function sobreTramo(p, a, b){
    const k = Math.cos(a.lat*rad)*111320, q = 110540, ax = 0, ay = 0, bx = (b.lon - a.lon)*k, by = (b.lat - a.lat)*q, px = (p.lon - a.lon)*k, py = (p.lat - a.lat)*q;
    const L2 = bx*bx + by*by, t = L2 ? Math.max(0, Math.min(1, (px*bx + py*by)/L2)) : 0;
    return {t, d:Math.hypot(px - (ax + t*bx), py - (ay + t*by))};
  }

  /* ---------- formatos ---------- */
  function horaAHoras(s){ const r = /^(\d{1,2}):?(\d{2})$/.exec(String(s||'').trim()); return r ? +r[1] + r[2]/60 : null; }
  function verDur(h){ if(h===null || h===undefined || isNaN(h)) return '—'; const m = Math.round(h*60); return m<60 ? m + ' min' : Math.floor(m/60) + ' h ' + String(m%60).padStart(2, '0') + ' min'; }
  function verHora(h){ if(h===null || h===undefined || isNaN(h)) return '—'; const m = Math.round(h*60), d = Math.floor(m/1440), r = ((m%1440) + 1440)%1440;
    return String(Math.floor(r/60)).padStart(2, '0') + ':' + String(r%60).padStart(2, '0') + (d>0 ? ' (+' + d + 'd)' : ''); }
  function verGms(v, pos, neg){ const a = Math.abs(v), g = Math.floor(a), mm = (a - g)*60, m = Math.floor(mm), s = (mm - m)*60;
    return g + '° ' + String(m).padStart(2, '0') + '′ ' + s.toFixed(1).padStart(4, '0') + '″ ' + (v<0 ? neg : pos); }
  const MGRS_LAT = 'CDEFGHJKLMNPQRSTUVWX';
  const banda = lat=>MGRS_LAT[Math.max(0, Math.min(19, Math.floor((lat + 80)/8)))];

  return {rumboEntre, sobreTramo, deWgs84, camposDesde, VIAS, VEL_GENERAL, velGeneral, columna, CALOR, TRABAJOS, calor, DATUMS, TERRENOS, TABLA_VERTICAL, METODOS, llAUtm, utmALl, aWgs84, puntoWgs, velVertical, porDefecto, declinacion,
    leerAng, tiempoTramo, calcular, horaAHoras, verDur, verHora, verGms, banda};
})();
if(typeof globalThis!=='undefined') globalThis.MARCHA = MARCHA;
