/* BURROS DE COMBATE — motor de cálculo de marchas (sin dependencias; funciona en el navegador y en Node para las pruebas).
   Coordenadas: UTM directa/inversa de Snyder (USGS PP 1395), cambio de datum de Molodensky (3 parámetros), convergencia
   de meridianos, declinación (manual o WMM2025), rumbo magnético en grados y milésimas (6400).
   Tiempos: montaña (por desnivel o por distancia según la pendiente), MIDE / DIN 33466 y marcha general (velocidad por terreno).  */
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
  const fmt = x=>String(Math.round(x*100)/100).replace('.', ',');
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

  /* ---------- tabla de velocidades de marcha vertical en montaña, m de desnivel por hora ---------- */
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
  // la tabla trae 10, 20 y 30 kg: para cargas intermedias se interpola (bajo 10 kg se usa 10; sobre 30 kg se usa 30 y se avisa)
  function velVertical(tropa, terreno, carga, criterio){
    const t = (TABLA_VERTICAL[tropa] || {})[terreno]; if(!t) return null;
    const k = Math.max(10, Math.min(30, num(carga) || 20)), c0 = k>=20 ? 20 : 10, c1 = c0 + 10, fr = (k - c0)/10;
    const fila = c=>{ const [s1, s2, b] = t[c]; return {s:criterio==='max' ? s2 : criterio==='media' ? (s1 + s2)/2 : s1, s1, s2, b}; };
    const a = fila(c0), z = fila(c1), it = (x, y)=>Math.round(x + (y - x)*fr);
    const s1 = it(a.s1, z.s1), s2 = it(a.s2, z.s2);
    return {sub:it(a.s, z.s), baj:it(a.b, z.b), rango:s1===s2 ? String(s1) : s1 + '–' + s2, carga:Math.round(k*10)/10, sobre30:num(carga)>30};
  }

  /* ---------- nombres clave de los puntos (para la radio: «PASANDO ALFA») ----------
     Cada punto (menos el primero) recibe el siguiente nombre de la lista elegida; si la ruta vuelve a pasar por el mismo lugar,
     repite el nombre. Un nombre escrito a mano en el punto (p.clave) se respeta y no se usa para los demás. */
  const CLAVES = {
    otan:{n:'Alfabeto fonético (ALFA, BRAVO, CHARLIE…)', l:['ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'JULIETT', 'KILO', 'LIMA', 'MIKE',
      'NOVEMBER', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY', 'X-RAY', 'YANKEE', 'ZULU']},
    animales:{n:'Animales de Chile (PUMA, CÓNDOR, HUEMUL…)', l:['PUMA', 'CÓNDOR', 'HUEMUL', 'GUANACO', 'ZORRO', 'PUDÚ', 'VICUÑA', 'ÑANDÚ', 'HALCÓN', 'LECHUZA', 'CHINCHILLA',
      'QUIRQUINCHO', 'HUILLÍN', 'COIPO', 'VIZCACHA', 'CARANCHO', 'TIUQUE', 'QUELTEHUE', 'PEUCO', 'LOICA', 'ZORZAL', 'CHERCÁN', 'DEGÚ', 'TRARO']},
    arboles:{n:'Árboles nativos (ALERCE, ARAUCARIA, COIGÜE…)', l:['ALERCE', 'ARAUCARIA', 'COIGÜE', 'RAULÍ', 'ROBLE', 'LENGA', 'ÑIRRE', 'CIPRÉS', 'MAÑÍO', 'QUILLAY', 'LITRE',
      'BOLDO', 'PEUMO', 'MAITÉN', 'CANELO', 'ULMO', 'LAUREL', 'TEPA', 'LUMA', 'ARRAYÁN', 'TAMARUGO', 'ESPINO', 'QUEULE', 'RUIL']},
    volcanes:{n:'Volcanes de Chile (VILLARRICA, LLAIMA, OSORNO…)', l:['VILLARRICA', 'LLAIMA', 'OSORNO', 'CALBUCO', 'LÁSCAR', 'PARINACOTA', 'LONQUIMAY', 'ANTUCO',
      'CHAITÉN', 'HUDSON', 'CORCOVADO', 'TUPUNGATITO', 'MAIPO', 'PUYEHUE', 'MOCHO', 'CHOSHUENCO', 'LANÍN', 'LLULLAILLACO', 'COPAHUE', 'CALLAQUI', 'SOLLIPULLI', 'QUETRUPILLÁN', 'MELIMOYU', 'YATE']},
    rios:{n:'Ríos de Chile (LOA, ELQUI, MAIPO…)', l:['LOA', 'LLUTA', 'COPIAPÓ', 'HUASCO', 'ELQUI', 'LIMARÍ', 'CHOAPA', 'ACONCAGUA', 'MAIPO', 'MAPOCHO', 'CACHAPOAL', 'TINGUIRIRICA',
      'MATAQUITO', 'MAULE', 'ÑUBLE', 'ITATA', 'LAJA', 'BIOBÍO', 'CAUTÍN', 'IMPERIAL', 'TOLTÉN', 'CALLE-CALLE', 'BUENO', 'MAULLÍN', 'PALENA', 'AYSÉN', 'BAKER', 'PASCUA', 'SERRANO']},
    ciudades:{n:'Ciudades de Chile (ARICA, IQUIQUE, CALAMA…)', l:['ARICA', 'IQUIQUE', 'CALAMA', 'ANTOFAGASTA', 'COPIAPÓ', 'VALLENAR', 'SERENA', 'OVALLE', 'VALPARAÍSO', 'SANTIAGO',
      'RANCAGUA', 'CURICÓ', 'TALCA', 'LINARES', 'CHILLÁN', 'CONCEPCIÓN', 'ANGOL', 'TEMUCO', 'VALDIVIA', 'OSORNO', 'PUERTO MONTT', 'CASTRO', 'COYHAIQUE', 'PUNTA ARENAS']},
    batallas:{n:'Batallas (CHACABUCO, MAIPÚ, YUNGAY…)', l:['CHACABUCO', 'MAIPÚ', 'RANCAGUA', 'EL ROBLE', 'YUNGAY', 'PISAGUA', 'DOLORES', 'TARAPACÁ', 'TACNA', 'ARICA', 'CHORRILLOS',
      'MIRAFLORES', 'SANGRA', 'CONCEPCIÓN', 'HUAMACHUCO', 'IQUIQUE', 'ANGAMOS', 'MEMBRILLAR', 'QUECHEREGUAS', 'TOPÁTER', 'LOS ÁNGELES', 'CALAMA']},
    aves:{n:'Aves de Chile (CÓNDOR, CHUCAO, LOICA…)', l:['CÓNDOR', 'CHUCAO', 'LOICA', 'TRARO', 'CHUNCHO', 'PEQUÉN', 'HUET-HUET', 'RAYADITO', 'CHINCOL', 'DIUCA', 'TORDO', 'ZORZAL',
      'TIUQUE', 'QUELTEHUE', 'CHERCÁN', 'PELÍCANO', 'PINGÜINO', 'FLAMENCO', 'CISNE', 'CARPINTERO', 'PICAFLOR', 'CACHUDITO', 'CHURRETE', 'BANDURRIA']},
    numeros:{n:'Números (UNO, DOS, TRES…)', l:['UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
      'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE']},
    colores:{n:'Colores (ROJO, AZUL, VERDE…)', l:['ROJO', 'AZUL', 'VERDE', 'NEGRO', 'BLANCO', 'GRIS', 'ORO', 'PLATA', 'NARANJO', 'MORADO', 'CELESTE', 'CAFÉ', 'ROSADO',
      'GRANATE', 'OCRE', 'BRONCE', 'CARMÍN', 'TURQUESA', 'MARFIL', 'CARBÓN']},
    propia:{n:'Lista propia (escrita por mí)', l:[]},
    ninguna:{n:'Sin nombres clave', l:[]}
  };
  // palabras de la lista propia: una por línea o separadas por coma
  const listaPropia = t=>String(t||'').split(/[\n,;]+/).map(x=>x.trim().toUpperCase()).filter(Boolean);
  function claves(pts, lista, propia){
    const L = lista==='propia' ? listaPropia(propia) : (CLAVES[lista] || CLAVES.otan).l, usadas = new Set(pts.filter(p=>p.ev).map(p=>p.claveManual).filter(Boolean)), lugar = {}; let k = 0;
    const libre = ()=>{ if(!L.length) return ''; for(let v=0; v<500; v++, k++){ const c = L[k%L.length] + (k>=L.length ? ' ' + (Math.floor(k/L.length) + 1) : ''); if(!usadas.has(c)){ usadas.add(c); k++; return c; } } return ''; };
    pts.forEach((p, i)=>{
      const sitio = p.ok ? p.lat.toFixed(5) + ',' + p.lon.toFixed(5) : null;
      if(!p.ev) p.clave = '';
      else if(p.claveManual) p.clave = p.claveManual;
      else if(sitio && lugar[sitio]) p.clave = lugar[sitio];
      else p.clave = libre();
      if(sitio && p.clave && !lugar[sitio]) lugar[sitio] = p.clave;
    });
  }

  /* ---------- marcha general: velocidades promedio en km/h según tipo de unidad, vía y día/noche ---------- */
  const VIAS = {camino1:'Camino de 1.ª clase', camino23:'Camino de 2.ª y 3.ª clase', sendero:'Sendero', campo:'Campo traviesa'};
  const UNIDADES = {pie:'A pie', montada:'Montada'};
  const VEL_GENERAL = {
    pie:     {camino1:{dia:5, noche:4}, camino23:{dia:5, noche:4}, sendero:{dia:4, noche:3}, campo:{dia:2.5, noche:1.5}},
    montada: {camino1:{dia:8, noche:6}, camino23:{dia:8, noche:6}, sendero:{dia:5, noche:2}, campo:{dia:5, noche:3}}};
  const JORNADA = {pie:40, montada:64};   // km por jornada de marcha
  const viaOk = v=>VIAS[v] ? v : v==='campo' ? 'campo' : 'camino1';   // 'camino' de versiones anteriores = camino de 1.ª clase
  const velGeneral = (via, noche, unidad)=>((VEL_GENERAL[unidad] || VEL_GENERAL.pie)[viaOk(via)])[noche ? 'noche' : 'dia'];

  /* ---------- columna (ATP 3-21.18 párr. 1-99, 1-104, 1-107, tabla 1-1; FM 21-18) ----------
     Cada soldado ocupa la distancia entre hombres + 0,4 m; en columna de a dos el largo se divide por 2
     (fila india 2 m = 2,4 m/hombre; de a dos 2 m = 1,2; de a dos 5 m = 2,7, como la tabla 1-1).
     Distancias por defecto: entre hombres 2–5 m de día / 1–3 m de noche; entre pelotones 50 m / 25 m; entre compañías 100 m / 50 m. */
  function columna(par, vKmh, noche){
    noche = noche===undefined ? par.luz==='noche' : noche;
    const n = Math.max(0, Math.round(num(par.efectivo)||0)); if(!n) return null;
    const filas = num(par.filas)===1 ? 1 : 2, dh = num(par.distHombres) || (noche ? 2 : 5), u = Math.max(1, Math.round(num(par.unidades)||1));
    const du = num(par.distUnidades) || (noche ? 25 : 50), factor = (dh + 0.4)/filas;
    const largo = n*factor + (u - 1)*du, paso = largo/(vKmh*1000/60)/60;   // tiempo de paso en horas
    return {n, filas, dh, u, du, factor, largo, paso, vKmh, noche};
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
  const TRABAJOS = {f:'Liviano (sin carga)', moderado:'Moderado (unos 14 kg)', pesado:'Pesado (unos 20 kg)', mp:'Muy pesado (30 kg o más, o trotando)'};
  // WBGT: el medido, o estimado con temperatura (°C) y humedad relativa (%) con la aproximación de la Oficina de Meteorología
  // de Australia para condiciones de sol moderado: WBGT ≈ 0,567·T + 0,393·e + 3,94 (e = presión de vapor en hPa)
  function wbgt(par){
    const w = num(par.wbgt); if(!isNaN(w)) return {v:w, fuente:'medido'};
    const t = num(par.temp), h = num(par.hum); if(isNaN(t) || isNaN(h)) return null;
    const e = (Math.max(0, Math.min(100, h))/100)*6.105*Math.exp(17.27*t/(237.7 + t));
    return {v:Math.round((0.567*t + 0.393*e + 3.94)*10)/10, fuente:'estimado', t, h};
  }
  // intensidad del trabajo según la carga por hombre (ejemplos del manual de calor: ~14 kg moderado, ~20 kg pesado)
  // carrera de combate = muy pesado; marcha forzada, al menos pesado
  const trabajoDe = (par, carga)=>{ if(par.trabajo && par.trabajo!=='auto') return par.trabajo; if(par.metodo==='battle') return 'mp';
    const t = (num(carga)||0)>=30 ? 'mp' : (num(carga)||0)>=18 ? 'pesado' : 'moderado'; return par.metodo==='forzada' && t==='moderado' ? 'pesado' : t; };
  function calor(par, horas, carga){
    const W = wbgt(par); if(!W) return null; const w = W.v, trab = trabajoDe(par, carga === undefined ? par.carga : carga);
    const c = [...CALOR].reverse().find(x=>w>=x.desde), k = ({f:'f', moderado:'m', pesado:'p', mp:'mp'})[trab] || 'm';
    const base = {wbgt:w, fuenteWbgt:W.fuente, trab, auto:!par.trabajo || par.trabajo==='auto'};
    if(!c) return Object.assign(base, {cat:0, n:'bajo la categoría 1', trabajo:60, descanso:0, lh:0.71, litros:Math.min(0.71*horas, 12*QT)});
    const [tr, qt] = c[k], lh = qt*QT, litros = Math.min(lh*horas, 12*QT);
    return Object.assign(base, {cat:c.cat, n:c.n, trabajo:tr, descanso:60 - tr, lh, litros, tope:lh*horas>12*QT});
  }

  /* ---------- parámetros por defecto de una marcha ---------- */
  const METODOS = {
    montana: 'Montaña (pendiente sobre 5 % por desnivel, si no por distancia)',
    mide: 'MIDE / DIN 33466 (mayor de horizontal y vertical + mitad del menor)',
    general: 'Marcha general (velocidad según unidad, vía y día o noche)',
    forzada: 'Marcha forzada (sin altos, ritmo alto)',
    battle: 'Carrera de combate (tramos rápidos y lentos)'
  };
  /* ---------- carrera de combate: se alternan tramos rápidos (trote) y lentos (paso) ----------
     Tres formas del patrón: por distancia (p. ej. 100 m rápido × 300 m lento), por tiempo (1 min × 3 min) y por terreno
     (formato británico: trote en lo plano y en bajada, paso en las subidas). En subidas sobre 15 % manda el tiempo de montaña si es mayor. */
  const PATRONES = {distancia:'Por distancia (metros rápidos × metros lentos)', tiempo:'Por tiempo (minutos rápidos × minutos lentos)', terreno:'Por terreno (trote en plano y bajada, paso en subida)'};
  const PRESETS_BR = {
    d100:{n:'100 m × 300 m', brPatron:'distancia', brRapido:100, brLento:300, brVelRap:9, brVelLen:6, brMetaKm:'', brMetaMin:''},
    d200:{n:'200 m × 200 m', brPatron:'distancia', brRapido:200, brLento:200, brVelRap:9, brVelLen:6, brMetaKm:'', brMetaMin:''},
    d400:{n:'400 m × 400 m', brPatron:'distancia', brRapido:400, brLento:400, brVelRap:9, brVelLen:6, brMetaKm:'', brMetaMin:''},
    t13:{n:'1 min × 3 min', brPatron:'tiempo', brMinRap:1, brMinLen:3, brVelRap:9, brVelLen:6, brMetaKm:'', brMetaMin:''},
    t22:{n:'2 min × 2 min', brPatron:'tiempo', brMinRap:2, brMinLen:2, brVelRap:9, brVelLen:6, brMetaKm:'', brMetaMin:''},
    britanico:{n:'Británico (comandos): 14,5 km en 90 min', brPatron:'terreno', brVelRap:11, brVelLen:6.5, brPteLim:5, brMetaKm:14.5, brMetaMin:90, carga:14},
    propio:{n:'Propio (escribo los valores)'}};
  // descripción corta del tipo de marcha para el cuadro y el documento
  function tipoMarcha(par){ const q = Object.assign(porDefecto(), par || {});
    if(q.metodo==='forzada') return 'Marcha forzada: +' + fmt(num(q.forzadaPct)||0) + ' % de ritmo, sin altos';
    if(q.metodo!=='battle') return {montana:'Montaña', mide:'MIDE', general:'Marcha general'}[q.metodo] || '';
    const pr = PRESETS_BR[q.brPreset];
    if(q.brPatron==='terreno') return 'Carrera de combate' + (q.brPreset==='britanico' ? ' (formato británico)' : '') + ': trote ' + fmt(num(q.brVelRap)||9) + ' km/h en plano y bajada, paso ' + fmt(num(q.brVelLen)||6) + ' km/h en subida';
    const c = cicloBattle(q); return 'Carrera de combate: ' + fmt(c.rap) + ' ' + c.u + ' rápido × ' + fmt(c.len) + ' ' + c.u + ' lento (media ' + fmt(velBattle(q)) + ' km/h)'; }
  // velocidad media del patrón (km/h); en el patrón por terreno, la del trote (la de cada tramo depende de su pendiente)
  function velBattle(par){
    const q = Object.assign({brPatron:'distancia', brRapido:100, brLento:300, brMinRap:1, brMinLen:3, brVelRap:9, brVelLen:6}, par || {});
    const vR = num(q.brVelRap) || 9, vL = num(q.brVelLen) || 6;
    if(q.brPatron==='terreno') return vR;
    if(q.brPatron==='tiempo'){ const a = Math.max(0, num(q.brMinRap)||0), b = Math.max(0, num(q.brMinLen)||0); return a + b ? (a*vR + b*vL)/(a + b) : vL; }
    const a = Math.max(0, num(q.brRapido)||0), b = Math.max(0, num(q.brLento)||0); return a + b ? (a + b)/(a/vR + b/vL) : vL;
  }
  // largo de un ciclo rápido + lento (m o min) y repeticiones en la distancia o tiempo dados
  function cicloBattle(par){ const q = Object.assign(porDefecto(), par || {});
    if(q.brPatron==='tiempo') return {rap:num(q.brMinRap)||0, len:num(q.brMinLen)||0, u:'min'};
    if(q.brPatron==='terreno') return null;
    return {rap:num(q.brRapido)||0, len:num(q.brLento)||0, u:'m'}; }
  function porDefecto(){
    return {metodo:'montana', tropa:'normal', terreno:'sinNieve', carga:20, criterio:'min',
      velSub:null, velBaj:null,   // null = de la tabla
      velLlano:4, pteCr:0.05, altos:0.10, imprev:0.10,
      claves:'otan', clavesPropias:'',   // lista de nombres clave de los puntos
      verbo:'PASANDO',                   // palabra para informar el paso por un punto («PASANDO ALFA»)
      motivosAlto:'Alto horario\nComida\nAgotamiento momentáneo\nLesionado\nReorganización\nOrientación\nAbastecimiento de agua\nContacto',
      novedades:'Lesionado\nRezagado\nRuta cortada\nCambio de itinerario\nContacto con el enemigo\nSin enlace\nMaterial perdido',
      velGeneral:null, via:'camino1', unidadTipo:'pie',   // marcha general: velocidad de la tabla según unidad, vía y día/noche
      luz:'auto', redNoche:25,   // luz: 'auto' (según la hora de cada tramo) | 'dia' | 'noche'; reducción nocturna (%) para montaña y MIDE
      efectivo:'', filas:2, distHombres:null, unidades:1, distUnidades:null,   // columna
      wbgt:'', temp:'', hum:'', trabajo:'auto', calorAltos:true,   // calor y agua: WBGT medido o temperatura y humedad; intensidad según la carga; el descanso por calor alarga la marcha
      fuenteVel:'',   // velocidades verticales: 'tabla' (tropa y carga) | 'mide' (300/500 m/h) | 'propia' (escritas); vacío = según los campos
      altosModo:'pct', altoCada:50, altoDur:10, altoPrimero:45, altoPrimeroDur:15,   // altos por % o por régimen programado
      cargaMat:false, cargaBase:'',
      // carrera de combate: patrón, tramos rápido/lento (m o min), velocidades (km/h), pendiente sobre la que se va al paso (%), meta opcional
      brPreset:'d100', brPatron:'distancia', brRapido:100, brLento:300, brMinRap:1, brMinLen:3, brVelRap:9, brVelLen:6, brPteLim:5, brMetaKm:'', brMetaMin:'',
      forzadaPct:20,   // marcha forzada: ritmo sobre el de la marcha general (%)   // carga por hombre calculada desde el material (+ peso base: armamento, munición, casco, chaleco)
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
  function tiempoTramo(dh, dv, par, vel, noche){
    const r = tiempoTramo0(dh, dv, par, vel, noche);
    if(noche && par.metodo!=='general' && par.metodo!=='forzada'){ const red = Math.min(80, Math.max(0, num(par.redNoche)||0))/100; r.t = r.t/(1 - red); }
    return Object.assign(r, {noche:!!noche});
  }
  function tiempoTramo0(dh, dv, par, vel, noche){
    const th = dh/1000/(num(par.velLlano)||4), sub = Math.max(dv, 0), baj = Math.max(-dv, 0);
    const tv = sub/vel.sub + baj/vel.baj;
    if(par.metodo==='mide') return {t:Math.max(th, tv) + Math.min(th, tv)/2, como:'MIDE'};
    if(par.metodo==='forzada'){ const r = tiempoTramo0(dh, dv, Object.assign({}, par, {metodo:'general'}), vel, noche), k = 1 + Math.max(0, num(par.forzadaPct)||0)/100;
      return {t:r.t/k, como:'forzada', v:r.v*k}; }
    if(par.metodo==='battle'){ const pte = dh>0 ? dv/dh : (dv>0 ? Infinity : 0), mont = tiempoTramo0(dh, dv, Object.assign({}, par, {metodo:'montana'}), vel, noche).t;
      const vR = num(par.brVelRap) || 9, vL = num(par.brVelLen) || 6;
      if(par.brPatron==='terreno'){ const lim = (isNaN(num(par.brPteLim)) ? 5 : num(par.brPteLim))/100;
        return pte>lim ? {t:pte>0.15 ? Math.max(dh/1000/vL, mont) : dh/1000/vL, como:'paso'} : {t:dh/1000/vR, como:'trote'}; }
      // en subidas de 7 % o más no se corre: al paso; sobre 15 %, el tiempo de montaña si es mayor
      return pte>=0.07 ? {t:pte>0.15 ? Math.max(dh/1000/vL, mont) : dh/1000/vL, como:'paso'} : {t:dh/1000/velBattle(par), como:'carrera'}; }
    if(par.metodo==='general'){ const via = vel.via || par.via, u = par.unidadTipo, base = velGeneral(via, noche, u);
      // velocidad escrita a mano = la de día; de noche se reduce en la misma proporción que la tabla
      const v = num(par.velGeneral) ? num(par.velGeneral)*(noche ? velGeneral(via, true, u)/velGeneral(via, false, u) : 1) : base;
      // con carga sobre unos 18 kg, la velocidad baja ≈ 2 km cada 6 h por cada 4,5 kg extra (manual de marchas a pie de EE.UU.)
      const extra = Math.max(0, (num(par.carga)||0) - 18.1), vf = par.cargaMat || par.cargaGeneral ? Math.max(v*0.5, v - extra/4.54*(2/6)) : v;
      return {t:dh/1000/vf, como:'general', v:vf}; }
    const pte = dh>0 ? dv/dh : (dv ? Infinity*Math.sign(dv) : 0), cr = num(par.pteCr) || 0.05;
    if(pte>cr) return {t:dv/vel.sub, como:'subida'};
    if(pte< -cr) return {t:-dv/vel.baj, como:'bajada'};
    return {t:th, como:'llano'};
  }

  /* ---------- cálculo completo del cuadro de marcha ---------- */
  // m: {fecha:'AAAA-MM-DD', hora:'HH:MM', datum, zona (vacío = la del primer punto), par:{...}, puntos:[{nombre, tipo, ..., cota, obs}]}
  // si la carga sale del material, primero se calcula la marcha con la carga escrita, con eso el material (agua según horas, etc.),
  // y se vuelve a calcular con la carga resultante (dos vueltas bastan)
  function calcular(m){
    const p = Object.assign(porDefecto(), m.par || {});
    if(!p.cargaMat || typeof pesoMaterial==='undefined') return calcular0(m);
    let R = calcular0(m), pm = null;
    for(let i=0; i<2; i++){ pm = pesoMaterial(m, R); if(!pm) break; R = calcular0(Object.assign({}, m, {par:Object.assign({}, m.par, {carga:pm.total})})); }
    if(pm){ R.carga = pesoMaterial(m, R); if(R.carga.total>36) R.avisos.push('Carga por hombre de ' + String(Math.round(R.carga.total*10)/10).replace('.', ',') + ' kg: sobre la carga de combate habitual (27–36 kg). Revisa el material o repártelo.');
      if(p.metodo!=='general' && R.carga.total>30) R.avisos.push('La tabla de velocidades de montaña llega hasta 30 kg: con más carga el tiempo real será mayor.'); }
    return R;
  }
  function calcular0(m){
    const par = Object.assign(porDefecto(), m.par || {}), dat = m.datum || 'WGS84';
    const vt = velVertical(par.tropa, par.terreno, par.carga, par.criterio) || velVertical('normal', 'sinNieve', par.carga, par.criterio);
    // de dónde salen las velocidades verticales: tabla de la tropa (según carga) · valores originales MIDE (300/500 m/h) · escritas a mano
    const fv = par.fuenteVel || (num(par.velSub) || num(par.velBaj) ? 'propia' : 'tabla');
    const vel = fv==='mide' ? {sub:300, baj:500, tabla:vt, fuente:'mide'}
      : fv==='propia' ? {sub:num(par.velSub) || vt.sub, baj:num(par.velBaj) || vt.baj, tabla:vt, fuente:'propia'}
      : {sub:vt.sub, baj:vt.baj, tabla:vt, fuente:'tabla'};
    const pts = (m.puntos || []).map((p, i)=>{
      const g = puntoWgs(p, dat), cota = num(p.cota);
      // ev: punto de control que se informa por radio (evento); si no, es solo un punto de ruta (quiebre del camino).
      // Las marchas antiguas no tienen el campo: todos sus puntos son eventos.
      return {i, nombre:p.nombre || '', ev:p.ev===undefined ? true : !!p.ev, claveManual:String(p.clave || '').trim().toUpperCase(), obs:p.obs || '', det:(num(p.det)||0)/60, ok:!!g && !isNaN(cota), lat:g && g.lat, lon:g && g.lon, cota};
    });
    // el primer y el último punto válidos siempre son eventos: PIM (inicio de marcha) y PTM (término de marcha)
    { const v = pts.filter(p=>p.ok); if(v.length){ v[0].ev = true; v[v.length - 1].ev = true;
        if(!v[0].nombre) v[0].nombre = 'PIM'; if(v.length>1 && !v[v.length - 1].nombre) v[v.length - 1].nombre = 'PTM'; } }
    pts.forEach((p, i)=>{ if(!p.nombre) p.nombre = p.ev ? 'P' + (i + 1) : ''; });
    claves(pts, par.claves, par.clavesPropias);
    const val = pts.filter(p=>p.ok);
    const zona = num(m.zona) || (val[0] ? Math.floor((val[0].lon + 180)/6) + 1 : 19);
    val.forEach(p=>Object.assign(p, {utm:llAUtm(p.lat, p.lon, zona)}));
    const ref = val[0], dec = declinacion(par, ref && ref.lat, ref && ref.lon, m.fecha, ref && ref.cota);
    const h0 = horaAHoras(m.hora);
    if(par.noche===true && par.luz==='auto') par.luz = 'noche';   // casilla «Marcha nocturna» de versiones anteriores
    // ¿está oscuro a esa hora? (después del crepúsculo náutico, según el sol en el PIM y la fecha de la marcha)
    const conLuz = typeof LUZ!=='undefined' && ref && m.fecha && h0!==null;
    const luzEn = h=>{ if(!conLuz || h===null) return null; return LUZ.condicion(new Date(LUZ.inicioDia(m.fecha) + h*36e5), ref.lat, ref.lon); };
    const esNoche = h=>par.luz==='noche' ? true : par.luz==='dia' ? false : !!((luzEn(h) || {}).oscuro);
    // altos: % del tiempo de marcha, o régimen programado (primer alto de P min a los Q min de marcha; luego D min cada C min)
    const reg = par.altosModo==='regimen', cada = (num(par.altoCada) || 50)/60, durA = (num(par.altoDur) || 10)/60, prim = (num(par.altoPrimero) || 45)/60, durP = (num(par.altoPrimeroDur) || 15)/60;
    const sinAltos = par.metodo==='battle' || par.metodo==='forzada';   // carrera de combate y marcha forzada: sin altos (salvo los que exige el calor)
    const altosNorm = tm=>{ if(sinAltos) return 0; if(!reg) return tm*(num(par.altos)||0); if(tm<=prim + 1e-9) return 0;   // altos ya hechos al llevar «tm» horas de marcha
      return durP + Math.floor((tm - prim - 1e-9)/cada)*durA; };
    // con calor, la tabla exige minutos de descanso por hora de trabajo: si son más que los altos, mandan los del calor
    const cal0 = par.calorAltos===false ? null : calor(par, 0), fCal = cal0 && cal0.trabajo<60 ? (60 - cal0.trabajo)/cal0.trabajo : 0;
    const altosHasta = tm=>Math.max(altosNorm(tm), tm*fCal);
    const fAl = sinAltos ? 1 + fCal : Math.max(reg ? 1 + durA/cada : 1 + (num(par.altos)||0), 1 + fCal);
    let detL = pts[0] ? pts[0].det : 0, tNoche = 0;
    const tramos = []; let acum = 0, dist = 0, sube = 0, baja = 0;
    for(let i=0; i<pts.length - 1; i++){
      const A = pts[i], B = pts[i + 1]; if(!A.ok || !B.ok) continue;
      const dE = B.utm.e - A.utm.e, dN = B.utm.n - A.utm.n, dg = Math.hypot(dE, dN), dh = dg/((A.utm.k + B.utm.k)/2), dv = B.cota - A.cota;
      const azC = dg ? (Math.atan2(dE, dN)/rad + 360)%360 : 0, azG = (azC + A.utm.conv + 360)%360, azM = (azG - dec.valor + 360)%360;
      const via = m.puntos[B.i].via || par.via, vv = Object.assign({}, vel, {via}), hIni = h0===null ? null : h0 + acum + altosHasta(acum) + detL;
      // primero con velocidad de día; si la mitad del tramo cae de noche, se recalcula con la de noche
      let tt = tiempoTramo(dh, dv, par, vv, false), mitad = hIni===null ? null : hIni + tt.t*fAl/2;
      if(esNoche(mitad)){ tt = tiempoTramo(dh, dv, par, vv, true); mitad = hIni===null ? null : hIni + tt.t*fAl/2; tNoche += tt.t; }
      const luz = luzEn(mitad);
      acum += tt.t; dist += dh; if(dv>0) sube += dv; else baja -= dv; detL += B.det;
      tramos.push({de:A.nombre, a:B.nombre, evA:A.ev, evB:B.ev, claveA:A.clave, claveB:B.clave, iA:A.i, iB:B.i, dist:dh, distAcum:dist, cotaIni:A.cota, cotaFin:B.cota, dv,
        pte:dh ? dv/dh : 0, via, azC, azG, azM, mils:Math.round(azM*6400/360)%6400, t:tt.t, como:tt.como, noche:tt.noche, luz, tAcum:acum, obs:B.obs});
    }
    // detenciones planificadas en los puntos intermedios (comida, descanso, reorganización); no cuenta el último punto
    const det = pts.slice(0, -1).reduce((a, p)=>a + p.det, 0);
    const altos = altosHasta(reg ? Math.max(0, acum - 1e-6) : acum), altosCalor = fCal>0 && acum*fCal>altosNorm(reg ? Math.max(0, acum - 1e-6) : acum), imprev = (acum + altos + det)*(num(par.imprev)||0), total = acum + altos + det + imprev;
    // hora estimada de llegada y salida en cada punto: partida + marcha acumulada con sus altos + detenciones anteriores
    // (los imprevistos quedan como reserva al final)
    let detAc = pts[0] ? pts[0].det : 0;
    tramos.forEach(t=>{ t.llegada = h0===null ? null : h0 + t.tAcum + altosHasta(t.tAcum) + detAc;
      t.det = pts[t.iB].det; t.salida = t.llegada===null ? null : t.llegada + t.det; detAc += t.det; });
    // tramos entre eventos: suman los quiebres (puntos de ruta) que hay entre un punto de control y el siguiente
    const tramosEv = []; let cur = null;
    tramos.forEach(t=>{
      if(!cur) cur = {de:t.de, iA:t.iA, claveA:t.claveA, cotaIni:t.cotaIni, dist:0, t:0, sube:0, baja:0, pteMax:0, subs:[], azM:t.azM, mils:t.mils, azC:t.azC, azG:t.azG, det:0};
      cur.subs.push(t); cur.dist += t.dist; cur.t += t.t; if(t.dv>0) cur.sube += t.dv; else cur.baja -= t.dv;
      if(Math.abs(t.pte)>Math.abs(cur.pteMax)) cur.pteMax = t.pte;
      if(t.evB){ Object.assign(cur, {a:t.a, iB:t.iB, claveB:t.claveB, cotaFin:t.cotaFin, dv:t.cotaFin - cur.cotaIni, distAcum:t.distAcum, tAcum:t.tAcum,
        llegada:t.llegada, salida:t.salida, det:t.det, obs:t.obs, quiebres:cur.subs.length - 1, como:cur.subs.length===1 ? t.como : ''});
        cur.pte = cur.dist ? cur.dv/cur.dist : 0; tramosEv.push(cur); cur = null; }
    });
    const eventos = pts.filter(p=>p.ok && p.ev).map(p=>p.i);
    const alto = val.reduce((x, p)=>!x || p.cota>x.cota ? p : x, null);
    // columna: velocidad media de la marcha (distancia / tiempo de marcha) para el tiempo de paso
    const fracNoche = acum ? tNoche/acum : (par.luz==='noche' ? 1 : 0);
    const vMedia = acum ? dist/1000/(acum + altos) : velGeneral(par.via, false, par.unidadTipo), col = columna(par, vMedia || 4, fracNoche>0.5);
    const ter = h0===null ? null : h0 + total;
    // avisos doctrinarios
    const avisos = [];
    if(par.metodo==='general' && tramos.some(t=>Math.abs(t.pte)>=0.07)) avisos.push('Hay tramos con pendiente de 7 % o más: afectan la velocidad. Considera el método de montaña o MIDE.');
    const jor = JORNADA[par.unidadTipo] || JORNADA.pie;
    if(dist>jor*1000) avisos.push('Más de ' + jor + ' km: sobre la jornada de marcha ' + (par.unidadTipo==='montada' ? 'montada' : 'a pie') + ' (' + jor + ' km). Divide en jornadas o planifica descanso y recuperación.');
    let meta = null;
    if(par.metodo==='battle'){ const v = velBattle(par), cic = cicloBattle(par), pas = tramos.filter(t=>t.como==='paso');
      const rep = cic && cic.rap + cic.len ? (cic.u==='m' ? dist/(cic.rap + cic.len) : acum*60/(cic.rap + cic.len)) : null;
      avisos.push('Carrera de combate: ' + (par.brPatron==='terreno' ? 'trote a ' + fmt(num(par.brVelRap)||9) + ' km/h en lo plano y en bajada, paso a ' + fmt(num(par.brVelLen)||6) + ' km/h en subidas sobre ' + fmt(isNaN(num(par.brPteLim)) ? 5 : num(par.brPteLim)) + ' %'
        : fmt(cic.rap) + ' ' + cic.u + ' rápido × ' + fmt(cic.len) + ' ' + cic.u + ' lento, velocidad media ' + fmt(Math.round(v*100)/100) + ' km/h' + (rep ? ', unas ' + Math.round(rep) + ' repeticiones' : ''))
        + '; sin altos. Exige tropa entrenada y aclimatada: vigila a los rezagados y el agua.');
      if(pas.length && par.brPatron!=='terreno') avisos.push('Hay subidas de 7 % o más: en ellas no se corre; se calculan al paso (y sobre 15 %, con el tiempo de montaña si es mayor).');
      const mk = num(par.brMetaKm), mm = num(par.brMetaMin);
      if(mk>0 && mm>0 && dist>0){ const ritmoMeta = mm/mk, plan = (acum + altos)*60, ritmo = plan/(dist/1000), objetivo = dist/1000*ritmoMeta;
        meta = {km:mk, min:mm, ritmoMeta, ritmo, objetivo, plan, cumple:plan<=objetivo + 1e-6, dif:plan - objetivo}; } }
    if(par.metodo==='forzada'){ avisos.push('Marcha forzada: ritmo ' + fmt(Math.max(0, num(par.forzadaPct)||0)) + ' % más rápido que la marcha general y sin altos. Se bebe caminando; planifica descanso y recuperación al llegar, y una reserva para los que no den el ritmo.');
      if(tramos.some(t=>Math.abs(t.pte)>=0.07)) avisos.push('Hay tramos con pendiente de 7 % o más: en ellos no se mantiene el ritmo de marcha forzada.'); }
    if(sinAltos && fCal>0) avisos.push('Con este calor (WBGT ' + fmt(cal0.wbgt) + ' °C, categoría ' + cal0.n + ') el calor exige descanso: ' + Math.round(60 - cal0.trabajo) + ' min por cada ' + cal0.trabajo + ' min de esfuerzo. Se agregaron altos por seguridad.');
    const regimen = reg && !sinAltos ? {cada:cada*60, dur:durA*60, primero:prim*60, primeroDur:durP*60, n:altos>0 ? 1 + Math.round((altos - durP)/durA) : 0} : null;
    return {meta, regimen, par, vel, zona, decl:dec, puntos:pts, tramos, tramosEv, eventos, columna:col, fracNoche, conLuz, calor:(c=>c ? Object.assign(c, {altosCalor}) : null)(calor(par, total)), avisos,
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

  return {tipoMarcha, velBattle, cicloBattle, PATRONES, PRESETS_BR, wbgt, trabajoDe, CLAVES, listaPropia, rumboEntre, sobreTramo, deWgs84, camposDesde, VIAS, UNIDADES, VEL_GENERAL, JORNADA, velGeneral, columna, CALOR, TRABAJOS, calor, DATUMS, TERRENOS, TABLA_VERTICAL, METODOS, llAUtm, utmALl, aWgs84, puntoWgs, velVertical, porDefecto, declinacion,
    leerAng, tiempoTramo, calcular, horaAHoras, verDur, verHora, verGms, banda};
})();
if(typeof globalThis!=='undefined') globalThis.MARCHA = MARCHA;
