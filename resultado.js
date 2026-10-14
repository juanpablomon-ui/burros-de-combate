/* BURROS DE COMBATE — resultado de la marcha: comparación planificado / ejecutado y reseña (pedido del usuario, v0.90).
   Usa el registro de Seguir (`m.ejec`: inicio, fin, llegadas por punto, altos, novedades, recorrido GPS) o las horas reales anotadas a
   mano. Por cada evento: hora plan y real, diferencia; por cada tramo entre eventos con hora real: tiempo, velocidad y ritmo en movimiento
   (sin los altos) plan y real. Totales, altos por motivo, y la rapidez real de la unidad comparada con el plan (sirve para la próxima).
   La reseña (`m.resena`) la escribe el comandante: resultado, qué pasó, personal, material y lecciones. */
const Resultado = (function(){
  // P = Seguir.plan(m): {R, pts:[{nombre, clave, ev, lleg, sal (h desde la partida), tramo}]}
  function calcular(m, P){
    const E = m.ejec; if(!E || !E.inicio || !P) return null;
    const fin = E.fin || Date.now(), altos = E.altos || [], llegadas = E.llegadas || {};
    // minutos de alto dentro de un intervalo [a, b] (ms)
    const altoEn = (a, b)=>altos.reduce((t, x)=>t + Math.max(0, Math.min(b, x.fin || fin) - Math.max(a, x.ini)), 0);
    const filas = [{k:0, p:P.pts[0], plan:E.inicio, real:E.inicio, dif:0}];
    let ant = 0, antReal = E.inicio;
    for(let k=1; k<P.pts.length; k++){ const p = P.pts[k], r = llegadas[k]; if(!p.ev) continue;
      const plan = E.inicio + p.lleg*36e5, fila = {k, p, plan, real:r>0 ? r : null, salta:r===-1, dif:r>0 ? (r - plan)/60000 : null};
      if(r>0){ // tramo desde el evento anterior con hora real
        let dist = 0, tMov = 0; for(let j=ant + 1; j<=k; j++){ dist += P.pts[j].tramo.dist; tMov += P.pts[j].tramo.t; }
        const sal = ant===0 ? E.inicio : antReal, tReal = (r - sal)/36e5, aReal = altoEn(sal, r)/36e5;
        Object.assign(fila, {desde:P.pts[ant], dist, tPlan:p.lleg - P.pts[ant].sal, tReal, movPlan:tMov, movReal:Math.max(0.0001, tReal - aReal), altosReal:aReal,
          vPlan:tMov>0 ? dist/1000/tMov : null, vReal:tReal - aReal>0 ? dist/1000/(tReal - aReal) : null});
        ant = k; antReal = r; }
      filas.push(fila); }
    const conTramo = filas.filter(f=>f.dist), dist = conTramo.reduce((a, f)=>a + f.dist, 0), movPlan = conTramo.reduce((a, f)=>a + f.movPlan, 0), movReal = conTramo.reduce((a, f)=>a + f.movReal, 0);
    const durReal = (fin - E.inicio)/36e5, altosReal = altoEn(E.inicio, fin)/36e5;
    let km = 0; const T = E.track || []; for(let i=1; i<T.length; i++) km += DEM.dist({lat:T[i - 1][0], lon:T[i - 1][1]}, {lat:T[i][0], lon:T[i][1]});
    const vPlan = movPlan>0 ? dist/1000/movPlan : null, vReal = movReal>0 ? dist/1000/movReal : null;
    const motivos = {}; altos.forEach(x=>{ const k = x.motivo || 'Alto'; motivos[k] = (motivos[k] || 0) + ((x.fin || fin) - x.ini)/60000; });
    return {filas, terminada:!!E.fin, durPlan:P.R.res.total, durReal, altosPlan:P.R.res.altos + P.R.res.det, altosReal, nAltos:altos.length, motivos,
      dist, distRuta:P.R.res.dist, kmGps:km, movPlan, movReal, vPlan, vReal, vAltosReal:durReal>0 && dist>0 ? dist/1000/(movReal + altosReal) : null,
      factor:vPlan && vReal ? vReal/vPlan : null, nov:E.nov || [], carga:P.R.carga ? P.R.carga.total : +P.R.par.carga || null};
  }
  // recomendación para la próxima marcha según la rapidez real
  function consejo(C){
    if(!C || !C.factor || C.movReal<0.25) return '';
    const pct = Math.round(Math.abs(C.factor - 1)*100);
    if(pct<5) return 'La unidad marchó al ritmo planificado (diferencia de ' + pct + ' %): el cálculo sirve tal cual para marchas parecidas.';
    return 'En movimiento, la unidad marchó <b>' + pct + ' % más ' + (C.factor<1 ? 'lento' : 'rápido') + '</b> que el plan' + (C.carga ? ' con ' + String(Math.round(C.carga*10)/10).replace('.', ',') + ' kg' : '') +
      '. Para una marcha parecida, ' + (C.factor<1 ? 'usa el ritmo «Bajo»' : 'usa el ritmo «Exigente»') + ' o escribe una velocidad propia cercana a <b>' + C.vReal.toFixed(1).replace('.', ',') + ' km/h</b>.';
  }
  return {calcular, consejo};
})();
if(typeof globalThis!=='undefined') globalThis.Resultado = Resultado;
