/* BURROS DE COMBATE — libro de marchas (v0.99.33, revisión de la app, estilo sobrio; maqueta aprobada por el usuario): registro de todas
   las marchas hechas (con Seguir o con las horas anotadas a mano en Resultado) y de sus recorridos anteriores («Hacer de nuevo»).
   Totales por mes, año o todo (marchas, incompletas, km, horas, desnivel, % a la hora ±5 min, la más larga, km por mes, velocidad real
   contra el plan con recomendación), una línea por marcha y la ficha de cada una. No se anota nada aparte: sale de `m.ejec` y
   `m.recorridos`; las descartadas no existen. */
const Libro = (function(){
  // registros: {m, ej, i (−1 = el último, ≥0 = recorrido guardado), ini, fin, dur, km, sube, dif, hechos, total, completa, factor, movReal, carga}
  function registros(marchas){
    const L = [];
    marchas.forEach(m=>{
      const tandas = [];
      if(m.ejec && m.ejec.inicio && (m.ejec.estado==='fin' || m.ejec.manual)) tandas.push({ej:m.ejec, i:-1});
      (m.recorridos || []).forEach((x, i)=>{ if(x && x.inicio && x.fin) tandas.push({ej:Object.assign({altos:[], nov:[]}, x), i}); });
      tandas.forEach(({ej, i})=>{
        const m2 = Object.assign({}, m, {ejec:ej}); let P = null, C = null;
        try { P = Seguir.plan(m2); C = P && Resultado.calcular(m2, P); } catch(e){}
        if(!P || !C) return;
        const ev = P.pts.map((p, j)=>j).filter(j=>j && P.pts[j].ev), real = ev.filter(j=>ej.llegadas && ej.llegadas[j]>0);
        if(!real.length && !(ej.track || []).length) return;   // sin ninguna hora real ni recorrido: no se hizo
        const ult = real[real.length - 1], dif = ult!==undefined ? Math.round((ej.llegadas[ult] - (ej.inicio + P.pts[ult].lleg*36e5))/60000) : null;
        const fin = ej.fin || (ult!==undefined ? ej.llegadas[ult] : ej.inicio);
        const km = (ej.track || []).length>1 ? Seguir.distGps(ej.track, m2)/1000 : C.dist/1000;
        L.push({m, ej, i, ini:ej.inicio, fin, dur:(fin - ej.inicio)/36e5, km, sube:P.R.res.sube || 0, dif, hechos:real.length, total:ev.length,
          completa:real.length===ev.length, factor:C.factor, movReal:C.movReal, vReal:C.vReal, vPlan:C.vPlan, durPlan:C.durPlan, carga:C.carga,
          resena:i===-1 ? (m.resena || {}) : {}}); }); });
    return L.sort((a, b)=>b.ini - a.ini);
  }
  const deMes = (t, ahora)=>{ const a = new Date(t), b = new Date(ahora); return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth(); };
  const deAnio = (t, ahora)=>new Date(t).getFullYear()===new Date(ahora).getFullYear();
  function filtrar(L, per, ahora){ ahora = ahora || Date.now(); return per==='mes' ? L.filter(x=>deMes(x.ini, ahora)) : per==='anio' ? L.filter(x=>deAnio(x.ini, ahora)) : L; }
  function totales(L){
    const conDif = L.filter(x=>x.dif!==null), conF = L.filter(x=>x.factor && x.movReal>=0.25), pesos = conF.reduce((a, x)=>a + x.movReal, 0);
    return {n:L.length, incompletas:L.filter(x=>!x.completa).length, km:L.reduce((a, x)=>a + x.km, 0), horas:L.reduce((a, x)=>a + x.dur, 0),
      sube:L.reduce((a, x)=>a + x.sube, 0), aHora:conDif.length ? conDif.filter(x=>Math.abs(x.dif)<=5).length/conDif.length : null,
      larga:L.reduce((a, x)=>!a || x.km>a.km ? x : a, null), factor:pesos ? conF.reduce((a, x)=>a + x.factor*x.movReal, 0)/pesos : null};
  }
  // km de los últimos 12 meses (hasta el mes actual)
  function porMes(L, ahora){ const b = new Date(ahora || Date.now()), o = [];
    for(let k=11; k>=0; k--){ const d = new Date(b.getFullYear(), b.getMonth() - k, 1);
      o.push({d, km:L.filter(x=>{ const t = new Date(x.ini); return t.getFullYear()===d.getFullYear() && t.getMonth()===d.getMonth(); }).reduce((a, x)=>a + x.km, 0)}); }
    return o; }
  function csv(L){
    const f = (x, d)=>String((+x).toFixed(d)).replace('.', ','), hh = t=>{ const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const fe = t=>{ const d = new Date(t); return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear(); };
    const filas = [['Fecha', 'Marcha', 'Unidad', 'Partida', 'Término', 'Duración (h)', 'Distancia (km)', 'Desnivel (m)', 'Diferencia con el horario (min)', 'Puntos alcanzados', 'Puntos', 'Velocidad real (km/h)', 'Velocidad plan (km/h)', 'Carga (kg)', 'Resultado']];
    L.forEach(x=>filas.push([fe(x.ini), x.m.nombre || '', x.m.unidad || '', hh(x.ini), hh(x.fin), f(x.dur, 2), f(x.km, 2), Math.round(x.sube), x.dif===null ? '' : x.dif, x.hechos, x.total,
      x.vReal ? f(x.vReal, 2) : '', x.vPlan ? f(x.vPlan, 2) : '', x.carga ? f(x.carga, 1) : '', ({cumplida:'Cumplida', parcial:'Cumplida parcialmente', no:'No cumplida'})[x.resena.resultado] || '']));
    return '﻿' + filas.map(r=>r.map(c=>/[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\r\n');
  }
  return {registros, filtrar, totales, porMes, csv};
})();
if(typeof globalThis!=='undefined') globalThis.Libro = Libro;
