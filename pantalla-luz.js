/* BURROS DE COMBATE — pestaña «Luz»: cálculo de visibilidad del día de la marcha (en el PIM).
   Sol (salida, mediodía, puesta), crepúsculos matutino y vespertino (astronómico, náutico, primera/última luz, civil), luna (fase,
   iluminación, salida y puesta, horas de luz de luna en la noche), gráfico de 24 h con la ventana de la marcha y la condición de luz
   en cada evento. Se puede mirar otro día sin cambiar la fecha de la marcha. */
const PantallaLuz = (function(){
  let A = null, verFecha = null;
  const hh = t=>t ? String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') : '—';
  const dur = ms=>{ if(ms===null || ms===undefined || isNaN(ms)) return '—'; const m = Math.round(ms/60000); return m<60 ? m + ' min' : Math.floor(m/60) + ' h ' + String(m%60).padStart(2, '0') + ' min'; };
  const fechaTxt = f=>f.split('-').reverse().join('-');
  const sumaDias = (f, n)=>{ const d = new Date(LUZ.inicioDia(f) + n*864e5 + 12*36e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const COLOR = {dia:'#f2c46b', civil:'#d98e3a', nautico:'#7a5aa6', astro:'#3c3a6e', noche:'#14162b'};

  // dibujo de la luna con su fase (en el hemisferio sur la parte iluminada se ve al revés que en el norte)
  function dibujoLuna(f, sur, tam){
    const r = (tam || 56)/2 - 2, a = Math.cos(2*Math.PI*f), rx = Math.abs(a)*r, creciente = f<0.5;
    // parte iluminada para el hemisferio norte: creciente a la derecha
    const lado = creciente ? 1 : 0, gib = a<0;
    const d = `M0,${-r} A${r},${r} 0 0 ${lado} 0,${r} A${rx},${r} 0 0 ${gib ? lado : 1 - lado} 0,${-r} Z`;
    const esp = sur ? ' transform="scale(-1,1)"' : '';
    return `<svg viewBox="${-r - 2} ${-r - 2} ${2*r + 4} ${2*r + 4}" width="${tam || 56}" height="${tam || 56}" aria-label="Fase de la luna"><circle r="${r}" fill="#1f2230" stroke="#555a70" stroke-width="1"/><path d="${d}" fill="#f1ecd6"${esp}/></svg>`;
  }

  // gráfico: franja de luz (día/crepúsculos/noche), alturas del sol y de la luna, ventana de la marcha y eventos
  function grafico(fecha, lat, lon, R){
    const t0 = LUZ.inicioDia(fecha), fin = Math.max(24, R && R.res.termino!==null && R.res.termino!==undefined ? Math.ceil(R.res.termino) + 1 : 24), horas = Math.min(36, fin);
    const W = 1000, iz = 40, de = 12, X = h=>iz + (W - iz - de)*h/horas, yF = 18, hF = 26, y0 = 64, hA = 170, Y = a=>y0 + hA*(90 - a)/110;
    let s = '', paso = 5/60, prev = null, ini = 0;
    // franja de luz
    const n = Math.round(horas/paso);
    for(let k = 0; k<=n; k++){ const h = k*paso, c = LUZ.condicion(new Date(t0 + h*36e5), lat, lon).tipo;
      if(prev===null){ prev = c; ini = h; continue; }
      if(c!==prev){ s += `<rect x="${X(ini)}" y="${yF}" width="${X(h) - X(ini) + 0.5}" height="${hF}" fill="${COLOR[prev]}"/>`; prev = c; ini = h; }
    }
    s += `<rect x="${X(ini)}" y="${yF}" width="${X(horas) - X(ini)}" height="${hF}" fill="${COLOR[prev]}"/>`;
    // cuadrícula de alturas y horas
    [-18, -12, -6, 0, 30, 60, 90].forEach(a=>{ s += `<line x1="${iz}" x2="${W - de}" y1="${Y(a)}" y2="${Y(a)}" stroke="${a===0 ? '#6f705e' : '#2a2e20'}" stroke-dasharray="${a===0 ? '' : '2 4'}"/><text x="${iz - 4}" y="${Y(a) + 3}" font-size="9" text-anchor="end" fill="#6f705e">${a}°</text>`; });
    for(let h = 0; h<=horas; h += (horas>24 ? 3 : 2)){ s += `<line x1="${X(h)}" x2="${X(h)}" y1="${yF}" y2="${y0 + hA}" stroke="#2a2e20"/><text x="${X(h)}" y="${y0 + hA + 14}" font-size="10" text-anchor="middle" fill="#a3a28c">${String(h%24).padStart(2, '0')}:00</text>`; }
    // ventana de la marcha
    if(R && R.res.partida!==null && R.res.termino!==null){
      const a = X(Math.max(0, R.res.partida)), b = X(Math.min(horas, R.res.termino));
      s += `<rect x="${a}" y="${yF - 6}" width="${Math.max(2, b - a)}" height="${y0 + hA - yF + 6}" fill="#e3a63a" fill-opacity=".10" stroke="#e3a63a" stroke-dasharray="4 3"/>
        <text x="${a + 3}" y="${yF - 9}" font-size="11" font-weight="700" fill="#e3a63a">MARCHA ${A.M.verHora(R.res.partida)} → ${A.M.verHora(R.res.termino)}</text>`;
      // nombres en hasta 3 filas para que no se monten
      const ult = [-1e9, -1e9, -1e9];
      R.tramos.filter(t=>t.evB && t.llegada!==null && t.llegada<=horas).forEach(t=>{ const x = X(t.llegada), txt = A.esc(t.claveB || t.a), an = txt.length*6 + 8;
        let fila = ult.findIndex(u=>x - u>an); if(fila<0) fila = ult.indexOf(Math.min(...ult)); ult[fila] = x;
        s += `<line x1="${x}" x2="${x}" y1="${yF + hF}" y2="${y0 + hA}" stroke="#e3a63a" stroke-width="1"/><text x="${x}" y="${y0 + 10 + fila*12}" font-size="9.5" text-anchor="middle" fill="#ece8d8" stroke="#14150f" stroke-width="3" paint-order="stroke">${txt}</text>`; });
    }
    // curvas de altura del sol y de la luna
    const curva = fn=>{ const ps = []; for(let h = 0; h<=horas; h += 0.25){ const a = fn(new Date(t0 + h*36e5), lat, lon).alt; ps.push(X(h).toFixed(1) + ',' + Y(Math.max(-20, a)).toFixed(1)); } return ps.join(' '); };
    s += `<polyline points="${curva(LUZ.sol)}" fill="none" stroke="#f2c46b" stroke-width="2.2"/><polyline points="${curva(LUZ.luna)}" fill="none" stroke="#9fc3e6" stroke-width="2" stroke-dasharray="6 3"/>`;
    s += `<text x="${W - de}" y="${y0 + hA + 28}" font-size="10" text-anchor="end" fill="#a3a28c"><tspan fill="#f2c46b">━ sol</tspan>   <tspan fill="#9fc3e6">╍ luna</tspan>   altura sobre el horizonte</text>`;
    return `<svg viewBox="0 0 ${W} ${y0 + hA + 34}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Luz del día de la marcha" style="font-family:var(--mono)">${s}</svg>`;
  }

  function pintar(vista, api){
    A = api; const m = A.actual(), R = A.calcular(m), p0 = R.puntos.find(p=>p.ok);
    if(!p0){ vista.innerHTML = `<div class="tarjeta vacio">Marca al menos el PIM para calcular la luz del lugar.</div>`; return; }
    if(!m.fecha){ vista.innerHTML = `<div class="tarjeta vacio">Falta la fecha de la marcha (pestaña Puntos → Datos de la marcha).</div>`; return; }
    if(!verFecha || verFecha.marcha!==m.id) verFecha = {marcha:m.id, f:m.fecha};
    const f = verFecha.f, esDia = f===m.fecha, D = LUZ.dia(f, p0.lat, p0.lon), sur = p0.lat<0, t1 = LUZ.inicioDia(f) + 864e5;
    const sig = t=>t && t.valueOf()>=t1 ? ' <small>(día sig.)</small>' : '';
    const am = D.amanecer, at = D.atardecer, L = D.lunaNoche;
    // horas de luz de luna en la noche (entre el fin del crepúsculo náutico y el inicio del náutico del día siguiente)
    const D2 = LUZ.dia(sumaDias(f, 1), p0.lat, p0.lon), nIni = at.nautico ? at.nautico.valueOf() : t1 - 4*36e5, nFin = D2.amanecer.nautico ? D2.amanecer.nautico.valueOf() : t1 + 6*36e5;
    let tramos = [], dentro = false, desde = null;
    for(let t = nIni; t<=nFin; t += 5*60000){ const c = LUZ.luna(new Date(t), p0.lat, p0.lon).alt>0;
      if(c && !dentro){ dentro = true; desde = t; } if((!c || t + 5*60000>nFin) && dentro){ dentro = false; tramos.push([new Date(desde), new Date(t)]); } }
    tramos = tramos.filter(([a, b])=>b - a>=15*60000);   // menos de 15 min de luna no cuenta
    const lunaUtil = L.ilum>0.25;
    const noche = tramos.length ? tramos.map(([a, b])=>hh(a) + ' a ' + hh(b)).join(' y ') : 'sin luna en el cielo';
    const total = tramos.reduce((x, [a, b])=>x + (b - a), 0), largoNoche = nFin - nIni;
    // eventos de la marcha con su condición de luz
    const evs = esDia ? [{n:R.puntos[R.tramos[0] ? R.tramos[0].iA : 0].nombre, c:'', h:R.res.partida, t:null}].concat(R.tramos.filter(t=>t.evB).map(t=>({n:t.a, c:t.claveB, h:t.llegada, t})))
      .filter(e=>e.h!==null && e.h!==undefined).map(e=>Object.assign(e, {cond:LUZ.condicion(new Date(LUZ.inicioDia(f) + e.h*36e5), p0.lat, p0.lon)})) : [];
    const noct = esDia ? R.tramos.filter(t=>t.noche) : [];
    const ico = c=>c.tipo==='dia' ? '☀' : c.oscuro ? (c.conLuna ? '☾' : '●') : '◐';
    vista.innerHTML = `
      <h2>Luz y visibilidad</h2>
      <div class="tarjeta luz-cab">
        <div><div class="k">Día</div><div class="v mono">${fechaTxt(f)}</div>${esDia ? '<span class="nota">día de la marcha</span>' : '<span class="nota" style="color:var(--ocre)">otro día (solo para comparar)</span>'}</div>
        <div><div class="k">Lugar (PIM)</div><div class="v mono" style="font-size:14px">${A.M.verGms(p0.lat, 'N', 'S')}<br>${A.M.verGms(p0.lon, 'E', 'W')}</div></div>
        <div class="btns" style="margin:0"><button class="btn mini" data-d="-1">‹ Día anterior</button>${esDia ? '' : '<button class="btn mini" data-d="0">Día de la marcha</button>'}<button class="btn mini" data-d="1">Día siguiente ›</button></div>
      </div>
      <div class="perfil-env luz-graf">${grafico(f, p0.lat, p0.lon, esDia ? R : null)}</div>
      <div class="luz-ley nota">${Object.entries(LUZ.TIPOS).map(([k, n])=>`<span><i style="background:${COLOR[k]}"></i>${n}</span>`).join('')}</div>

      <div class="luz-grid">
        <div class="tarjeta"><h3>☀ Sol</h3>
          <table class="t luz-t"><tbody>
            <tr><td class="tx">Salida del sol</td><td><b>${hh(am.salida)}</b></td></tr>
            <tr><td class="tx">Mediodía (sol más alto, ${A.f(D.altMax, 0)}°)</td><td>${hh(D.mediodia)}</td></tr>
            <tr><td class="tx">Puesta del sol</td><td><b>${hh(at.puesta)}</b></td></tr>
            <tr><td class="tx">Duración del día</td><td>${D.duracion ? A.M.verDur(D.duracion) : '—'}</td></tr>
          </tbody></table></div>
        <div class="tarjeta"><h3>${dibujoLuna(L.fase, sur, 34)} Luna</h3>
          <table class="t luz-t"><tbody>
            <tr><td class="tx">Fase (en la noche)</td><td><b>${L.nombre}</b></td></tr>
            <tr><td class="tx">Iluminada</td><td><b>${Math.round(L.ilum*100)} %</b></td></tr>
            <tr><td class="tx">Días del ciclo</td><td>${A.f(L.edad, 1)} de 29,5</td></tr>
            <tr><td class="tx">Sale</td><td>${D.luna.sale.map(t=>hh(t) + sig(t)).join(' · ') || '—'}</td></tr>
            <tr><td class="tx">Se pone</td><td>${D.luna.pone.map(t=>hh(t) + sig(t)).join(' · ') || '—'}</td></tr>
            <tr><td class="tx">Luna en la noche</td><td>${noche}</td></tr>
          </tbody></table>
          <p class="nota">${!lunaUtil ? 'Luna con poca luz: <b>noche oscura</b> aunque esté en el cielo.' : tramos.length ? `Luz de luna durante <b>${dur(total)}</b> de ${dur(largoNoche)} de noche.` : 'La luna no estará en el cielo durante la noche: <b>noche oscura</b>.'}</p></div>
      </div>

      <div class="tarjeta"><h3>Crepúsculos</h3>
        <div class="tabla-env"><table class="t luz-crep"><thead><tr><th class="tx">Período</th><th class="tx">Sol bajo el horizonte</th><th>Matutino (amanecer)</th><th>Vespertino (atardecer)</th><th class="tx">Qué permite</th></tr></thead><tbody>
          <tr><td class="tx"><i class="pz" style="background:${COLOR.astro}"></i><b>Astronómico</b></td><td class="tx">12° a 18°</td><td>${hh(am.astro)} – ${hh(am.nautico)}</td><td>${hh(at.nautico)} – ${hh(at.astro)}${sig(at.astro)}</td><td class="tx obs">Casi oscuridad: para efectos militares se considera noche.</td></tr>
          <tr><td class="tx"><i class="pz" style="background:${COLOR.nautico}"></i><b>Náutico</b></td><td class="tx">6° a 12°</td><td>${hh(am.nautico)} – ${hh(am.civil)}</td><td>${hh(at.civil)} – ${hh(at.nautico)}</td><td class="tx obs">Transición luz/oscuridad: la mayoría de los movimientos a pie sin dificultad, con poca observación del adversario (visibilidad del orden de 350–400 m).</td></tr>
          <tr><td class="tx">↳ <b>${esDia ? 'Primera / última luz' : 'Primera / última luz'}</b></td><td class="tx">9°</td><td>${hh(am.primeraLuz)}</td><td>${hh(at.ultimaLuz)}</td><td class="tx obs">Desde la primera luz y hasta la última: observación de tiro y operaciones aéreas de día.</td></tr>
          <tr><td class="tx"><i class="pz" style="background:${COLOR.civil}"></i><b>Civil</b></td><td class="tx">0° a 6°</td><td>${hh(am.civil)} – ${hh(am.salida)}</td><td>${hh(at.puesta)} – ${hh(at.civil)}</td><td class="tx obs">Luz suficiente para cualquier actividad diurna.</td></tr>
        </tbody></table></div>
        <p class="nota">Cada crepúsculo dura ${am.astro && am.nautico ? dur(am.nautico - am.astro) + ' (astronómico), ' : ''}${am.nautico && am.civil ? dur(am.civil - am.nautico) + ' (náutico) y ' : ''}${am.civil && am.salida ? dur(am.salida - am.civil) + ' (civil)' : ''} en este lugar y fecha.
          Las velocidades de noche de la marcha se aplican cuando el sol está más de 12° bajo el horizonte (después del crepúsculo náutico).</p>
      </div>

      ${esDia ? `<div class="tarjeta"><h3>La marcha y la luz</h3>
        ${noct.length ? `<div class="alerta">${noct.length} tramo${noct.length===1 ? '' : 's'} se hacen de noche (${A.M.verDur(noct.reduce((x, t)=>x + t.t, 0))} de marcha) y se calcularon con velocidad de noche.</div>` : '<p class="nota">Toda la marcha se hace con luz (velocidades de día).</p>'}
        <div class="tabla-env"><table class="t"><thead><tr><th class="tx">Punto</th><th>Hora</th><th class="tx">Luz</th><th>Sol</th><th class="tx">Luna</th><th class="tx">Evento</th></tr></thead><tbody>
          ${evs.map(e=>`<tr class="${e.cond.oscuro ? 'noct' : ''}"><td class="tx"><b>${A.esc(e.n)}</b></td><td>${A.M.verHora(e.h)}</td><td class="tx">${ico(e.cond)} ${LUZ.TIPOS[e.cond.tipo]}</td><td>${A.f(e.cond.alt, 0)}°</td>
            <td class="tx">${e.cond.altLuna>0 ? 'en el cielo (' + Math.round(e.cond.ilum*100) + ' %)' : 'bajo el horizonte'}</td><td class="tx">${e.c ? A.evento(e.c) : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="nota">☀ día · ◐ crepúsculo · ☾ noche con luna · ● noche sin luna. Horas calculadas para el PIM; en una marcha larga cambian algunos minutos entre un extremo y otro.</p>
      </div>` : ''}`;
    vista.querySelectorAll('[data-d]').forEach(b=>b.onclick = ()=>{ const n = +b.dataset.d; verFecha.f = n===0 ? m.fecha : sumaDias(verFecha.f, n); pintar(vista, api); });
  }
  return {pintar, dibujoLuna, grafico};
})();
if(typeof globalThis!=='undefined') globalThis.PantallaLuz = PantallaLuz;
