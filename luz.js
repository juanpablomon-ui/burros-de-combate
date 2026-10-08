/* BURROS DE COMBATE — luz y visibilidad: sol, crepúsculos y luna para un lugar y una fecha.
   Fórmulas astronómicas públicas de baja precisión (posición del sol y de la luna; error de 1–2 min en las horas),
   suficientes para planificar. Las horas se dan en la hora local del equipo (Date de JavaScript).
   Crepúsculos según la altura del sol bajo el horizonte: civil 0°–6°, náutico 6°–12°, astronómico 12°–18°;
   «primera / última luz» a 9° (mitad del crepúsculo náutico). Salida y puesta del sol con −0,833° (refracción y radio). */
const LUZ = (function(){
  const rad = Math.PI/180, dia = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad*23.4397;
  const dias = d=>d.valueOf()/dia - 0.5 + J1970 - J2000;
  const ra = (l, b)=>Math.atan2(Math.sin(l)*Math.cos(e) - Math.tan(b)*Math.sin(e), Math.cos(l));
  const dec = (l, b)=>Math.asin(Math.sin(b)*Math.cos(e) + Math.cos(b)*Math.sin(e)*Math.sin(l));
  const altura = (H, phi, de)=>Math.asin(Math.sin(phi)*Math.sin(de) + Math.cos(phi)*Math.cos(de)*Math.cos(H));
  const azimut = (H, phi, de)=>Math.atan2(Math.sin(H), Math.cos(H)*Math.sin(phi) - Math.tan(de)*Math.cos(phi));
  const sideral = (d, lw)=>rad*(280.16 + 360.9856235*d) - lw;
  function solCoord(d){
    const M = rad*(357.5291 + 0.98560028*d), C = rad*(1.9148*Math.sin(M) + 0.02*Math.sin(2*M) + 0.0003*Math.sin(3*M));
    const L = M + C + rad*102.9372 + Math.PI; return {dec:dec(L, 0), ra:ra(L, 0)};
  }
  function lunaCoord(d){
    const L = rad*(218.316 + 13.176396*d), M = rad*(134.963 + 13.064993*d), F = rad*(93.272 + 13.229350*d);
    const l = L + rad*6.289*Math.sin(M), b = rad*5.128*Math.sin(F), dist = 385001 - 20905*Math.cos(M);
    return {ra:ra(l, b), dec:dec(l, b), dist};
  }
  // altura del sol y de la luna (grados) en un instante
  function sol(t, lat, lon){ const d = dias(t), c = solCoord(d), H = sideral(d, rad*-lon) - c.ra;
    return {alt:altura(H, rad*lat, c.dec)/rad, az:(azimut(H, rad*lat, c.dec)/rad + 180)%360}; }
  function luna(t, lat, lon){ const d = dias(t), c = lunaCoord(d), H = sideral(d, rad*-lon) - c.ra, phi = rad*lat;
    let h = altura(H, phi, c.dec);
    h -= Math.asin(6378/c.dist)*Math.cos(h);   // paralaje
    return {alt:h/rad, az:(azimut(H, phi, c.dec)/rad + 180)%360}; }
  // fase: 0 = nueva, 0,25 = cuarto creciente, 0,5 = llena, 0,75 = cuarto menguante; fracción iluminada 0–1
  function fase(t){
    const d = dias(t), s = solCoord(d), m = lunaCoord(d), sd = 149598000;
    const phi = Math.acos(Math.sin(s.dec)*Math.sin(m.dec) + Math.cos(s.dec)*Math.cos(m.dec)*Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sd*Math.sin(phi), m.dist - sd*Math.cos(phi));
    const ang = Math.atan2(Math.cos(s.dec)*Math.sin(s.ra - m.ra), Math.sin(s.dec)*Math.cos(m.dec) - Math.cos(s.dec)*Math.sin(m.dec)*Math.cos(s.ra - m.ra));
    const f = 0.5 + 0.5*inc*(ang<0 ? -1 : 1)/Math.PI;
    return {fase:f, ilum:(1 + Math.cos(inc))/2, edad:f*29.530588};
  }
  const NOMBRES = ['Luna nueva', 'Creciente', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Menguante'];
  const nombreFase = f=>NOMBRES[Math.floor(((f + 1/16)%1)*8)];

  // cruces de una altura (grados) durante el intervalo [t0, t1], muestreando cada minuto
  function cruces(fn, t0, t1, umbral){
    const out = []; let a = fn(new Date(t0)).alt - umbral;
    for(let t = t0 + 60000; t<=t1; t += 60000){ const b = fn(new Date(t)).alt - umbral;
      if((a<0) !== (b<0)) out.push({t:new Date(t - 60000*b/(b - a)), sube:b>a}); a = b; }
    return out;
  }
  // día local (00:00 a 24:00) de una fecha 'AAAA-MM-DD'
  const inicioDia = f=>{ const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d).valueOf(); };

  // todo el cálculo de luz para un día y un lugar (con margen hasta el mediodía siguiente para la noche)
  function dia_(fecha, lat, lon){
    const t0 = inicioDia(fecha), t1 = t0 + dia, t2 = t1 + dia/2;
    const S = t=>sol(t, lat, lon), Lu = t=>luna(t, lat, lon);
    const uno = (umbral, sube)=>{ const c = cruces(S, t0, t1, umbral).find(x=>x.sube===sube); return c ? c.t : null; };
    const r = {fecha, lat, lon,
      amanecer:{astro:uno(-18, true), nautico:uno(-12, true), primeraLuz:uno(-9, true), civil:uno(-6, true), salida:uno(-0.833, true)},
      atardecer:{puesta:uno(-0.833, false), civil:uno(-6, false), ultimaLuz:uno(-9, false), nautico:uno(-12, false), astro:uno(-18, false)}};
    // mediodía (altura máxima del sol)
    let mx = -99, tm = null; for(let t = t0; t<=t1; t += 300000){ const a = S(new Date(t)).alt; if(a>mx){ mx = a; tm = new Date(t); } }
    r.mediodia = tm; r.altMax = mx;
    r.duracion = r.amanecer.salida && r.atardecer.puesta ? (r.atardecer.puesta - r.amanecer.salida)/36e5 : null;
    // luna: salidas y puestas desde el inicio del día hasta el mediodía siguiente
    const cl = cruces(Lu, t0, t2, 0.133);
    r.luna = Object.assign(fase(new Date(t0 + dia/2)), {sale:cl.filter(c=>c.sube).map(c=>c.t), pone:cl.filter(c=>!c.sube).map(c=>c.t)});
    r.luna.nombre = nombreFase(r.luna.fase);
    // fase a medianoche (la que importa para la noche)
    r.lunaNoche = fase(new Date(t1)); r.lunaNoche.nombre = nombreFase(r.lunaNoche.fase);
    return r;
  }

  // condición de luz en un instante: día / crepúsculo civil / náutico / astronómico / noche, y si hay luna sobre el horizonte
  function condicion(t, lat, lon){
    const a = sol(t, lat, lon).alt, l = luna(t, lat, lon).alt, f = fase(t);
    const tipo = a> -0.833 ? 'dia' : a> -6 ? 'civil' : a> -12 ? 'nautico' : a> -18 ? 'astro' : 'noche';
    const conLuna = l>0 && f.ilum>0.25;   // luna útil: sobre el horizonte y al menos un cuarto iluminada
    return {tipo, alt:a, altLuna:l, ilum:f.ilum, conLuna, oscuro:a<= -12};   // oscuro = después del crepúsculo náutico
  }
  const TIPOS = {dia:'Día', civil:'Crepúsculo civil', nautico:'Crepúsculo náutico', astro:'Crepúsculo astronómico', noche:'Noche'};
  return {sol, luna, fase, nombreFase, dia:dia_, condicion, TIPOS, cruces, inicioDia};
})();
if(typeof globalThis!=='undefined') globalThis.LUZ = LUZ;
