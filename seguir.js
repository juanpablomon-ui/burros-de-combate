/* BURROS DE COMBATE — seguir la marcha en el teléfono (GPS).
   m.ejec = {estado:'marcha'|'alto'|'fin', inicio, fin, llegadas:{i:ms}, altos:[{ini, fin, motivo, lat, lon}], nov:[{t, txt, lat, lon}],
             track:[[lat, lon, ms]]}. El GPS sigue funcionando aunque se cambie de pestaña dentro de la app (no con la pantalla apagada:
   por eso se pide mantener la pantalla encendida). Llegada automática a menos de 40 m del punto (o 15 m + precisión del GPS).
   Adelanto/atraso: tiempo real desde la partida comparado con el plan (marcha con altos + detenciones) en el mismo lugar de la ruta. */
const Seguir = (function(){
  const M = MARCHA;
  const IC = {ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>', alto:'<path d="M9 5v14M15 5v14"/>', seguir:'<path d="M8 5l11 7-11 7z"/>', nov:'<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    ira:'<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z"/>', mas:'<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.2"/>', fin:'<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
    x:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', capa:'<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>', centro:'<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1.2"/>',
    norte:'<path d="M12 3.5l5 15-5-3.5-5 3.5z"/>', dest:'<path d="M12 4v16M6 10l6-6 6 6"/>', pos:'<circle cx="12" cy="11" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/>', horiz:'<path d="M2 17l6-7 4 4 3-3 7 6"/><path d="M2 20h20"/>', lista:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />'};
  const ic = (n, t)=>`<svg class="ico s-ico" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg><span>${t}</span>`;
  // puntero de la brújula (v0.99.28, elegido por el usuario): sobre la carta una punta de flecha maciza (A); en Navegar y en los datos
  // de la marcha un anillo con la marca hacia el punto y al centro cuánto girar y hacia qué lado (C). Verde < 10°, ocre, rojo > 90°.
  const punteroCarta = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><path class="fa" d="M0,-42 L23,17 L0,5 L-23,17 Z"/></svg>`;
  const punteroAnillo = `<div class="s-anillo" title="Dirección al punto según la brújula del teléfono"><svg viewBox="-80 -80 160 160" aria-hidden="true">
    <circle class="an-fondo" r="72"/><circle class="an-pista" r="60"/>
    <g class="an-gira" id="sFlecha"><circle r="80" fill="none"/><circle class="an-arco" r="60" pathLength="360" stroke-dasharray="40 320" transform="rotate(-110)"/><path class="an-punta" d="M0,-79 L13,-53 L-13,-53 Z"/></g>
    <text class="an-num" id="sGiro" y="8">—</text><text class="an-sub" id="sGiroTx" y="31"></text></svg></div>`;
  let plegada = false; try { plegada = localStorage.getItem('burros_barra')==='1'; } catch(e){}
  let irSolo = null, eligiendo = null;
  let A = null, watch = null, pos = null, rumboDisp = null, wake = null, mapa = null, capas = null, centrar = true;
  const $ = s=>document.querySelector(s);

  /* ---------- plan de referencia ---------- */
  // lista de puntos válidos con la hora planificada (horas desde la partida) de llegada y salida
  function plan(m){
    if(!m) return null;
    const R = A ? A.calcular(m) : M.calcular(m), r = R.res, pts = [];
    if(!R.tramos.length) return null;
    const p0 = R.puntos[R.tramos[0].iA];
    pts.push({i:p0.i, ev:true, nombre:p0.nombre, clave:p0.clave, obs:p0.obs, mochila:p0.mochila, lat:p0.lat, lon:p0.lon, cota:p0.cota, lleg:0, sal:p0.det});
    R.tramos.forEach(t=>{ const p = R.puntos[t.iB]; pts.push({i:p.i, ev:p.ev, nombre:p.nombre, clave:p.clave, obs:p.obs, mochila:p.mochila, lat:p.lat, lon:p.lon, cota:p.cota,
      lleg:t.llegada - r.partida, sal:t.salida - r.partida, tramo:t}); });
    return {R, pts};
  }
  const ahora = ()=>Date.now();
  const hh = ms=>{ const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const dur = ms=>M.verDur(ms/3600000);
  const dif = min=>{ const a = Math.round(Math.abs(min)); return a<1 ? 'a la hora' : (min>0 ? '▼ ' + a + ' min atrasado' : '▲ ' + a + ' min adelantado'); };
  const difCorta = min=>{ const a = Math.round(min); return (a>0 ? '+' : a<0 ? '−' : '±') + Math.abs(a) + ' min'; };
  const rotulo = p=>p.clave || p.nombre;   // por radio se usa el nombre clave
  const verbo = ()=>String((A.actual().par || {}).verbo || 'PASANDO').toUpperCase();   // palabra elegida para informar el paso
  const lineas = (k, def)=>String((A.actual().par || {})[k] || def).split(/\n+/).map(x=>x.trim()).filter(Boolean);
  // próximo evento (punto de control que se informa) aún no pasado
  function proxEv(m, P){ const E = m.ejec; for(let k=1; k<P.pts.length; k++) if(P.pts[k].ev && !E.llegadas[k]) return k; return null; }
  // distancia por la ruta desde la posición hasta el punto k (pasando por los quiebres)
  function distRuta(P, desde, k0, k){ let d = M.rumboEntre(desde, P.pts[k0], P.R.zona, 0).dist; for(let j=k0 + 1; j<=k; j++) d += P.pts[j].tramo.dist; return d; }
  function siguiente(m, P){ const E = m.ejec; for(let k=1; k<P.pts.length; k++) if(!E.llegadas[k]) return k; return null; }

  /* ---------- velocidad y ritmo (pedido del usuario, v0.82) ----------
     Ahora: los últimos 2 min del GPS (suavizado). Media en movimiento: lo recorrido por la ruta ÷ el tiempo sin altos; con altos: ÷ todo el
     tiempo. Plan: la del tramo en curso. Para llegar a la hora: lo que falta al próximo evento ÷ el tiempo hasta su hora planificada. */
  const hist = [];
  function velAhora(){ const t = ahora(), H = hist.filter(h=>t - h.t<=120000 && (h.acc || 0)<=50); if(H.length>=2 && H[H.length - 1].t - H[0].t>=20000){
      // se descartan los saltos del GPS imposibles a pie (más de 25 km/h entre dos lecturas)
      let d = 0, t = 0; for(let i=1; i<H.length; i++){ const s = M.sobreTramo(H[i], H[i - 1], H[i - 1]).d, dt = (H[i].t - H[i - 1].t)/36e5; if(dt>0 && s/1000/dt<=25){ d += s; t += dt; } }
      return t>=20/3600 ? d/1000/t : null; }
    return pos && pos.vel>=0 && pos.vel!==null ? pos.vel*3.6 : null; }
  function vertAhora(){ const t = ahora(), H = hist.filter(h=>t - h.t<=300000 && h.alt!==null && h.alt!==undefined); if(H.length<2 || H[H.length - 1].t - H[0].t<60000) return null;
    return (H[H.length - 1].alt - H[0].alt)/((H[H.length - 1].t - H[0].t)/36e5); }
  function velocidades(m, P, k, ke){
    const E = m.ejec, t = ahora(), rec = recorrido(m, P), mov = enMarcha(E)/60, tot = (t - E.inicio)/36e5;
    const q = k!==null ? P.pts[k] : null, p = ke!==null ? P.pts[ke] : null, plan = q && q.tramo ? q.tramo.v : null;
    let nec = null, horaP = null; if(p && pos){ const dr = distRuta(P, pos, k, ke); horaP = E.inicio + p.lleg*36e5; const h = (horaP - t)/36e5; nec = h>0 ? dr/1000/h : Infinity; }
    return {ahora:E.estado==='alto' ? null : velAhora(), mov:mov>0.02 && rec>30 ? rec/1000/mov : null, altos:tot>0.02 && rec>30 ? rec/1000/tot : null, plan, nec, horaP, p,
      vert:E.estado==='alto' ? null : vertAhora(), vertPlan:q && q.tramo && Math.abs(q.tramo.pte)>0.05 ? q.tramo.vVert*Math.sign(q.tramo.dv) : null, enAlto:E.estado==='alto'}; }
  const vr = v=>v>0 && isFinite(v) ? A.f(v, 1) + ' <small>km/h</small> · ' + M.verRitmo(v).replace(' min/km', '') + ' <small>min/km</small>' : '—';
  const claseVel = (v, plan)=>!(v>0) || !(plan>0) ? '' : v/plan<0.85 ? 'mal' : v/plan<0.95 ? 'ojo' : 'bien';
  const vg = (v, cl)=>{ const ok = v>0 && isFinite(v); return `<div class="vg ${cl || ''}"><i>Velocidad</i><b>${ok ? A.f(v, 1) + ' <small>km/h</small>' : '—'}</b><i>Ritmo</i><b>${ok ? M.verRitmo(v).replace(' min/km', '') + ' <small>min/km</small>' : '—'}</b></div>`; };
  // vista Navegación: los mismos cuadros que la carta (llegada, ahora, plan del tramo, para llegar a la hora) más las medias de la marcha
  function velHtml(V, lleg){
    const vt = (v, sube)=>v ? `<small>${sube>0 ? '↗' : '↘'} vertical ${A.f(Math.abs(v))} m/h</small>` : '';
    return `<div class="s-vel">
      ${lleg ? `<div><span>Llegada plan</span><b class="hora">${lleg.plan}</b>${lleg.est ? `<small>estimada ${lleg.est}</small>` : ''}</div>` : ''}
      <div><span>Ahora</span>${V.enAlto ? '<b>en alto</b>' : vg(V.ahora, claseVel(V.ahora, V.plan))}${V.vert!==null && !V.enAlto ? vt(V.vert, V.vert) : ''}</div>
      <div><span>Plan del tramo</span>${vg(V.plan)}${vt(V.vertPlan, V.vertPlan)}</div>
      <div><span>Para llegar a la hora</span>${V.nec===Infinity ? '<b class="mal">no alcanza</b>' : vg(V.nec)}${V.p ? `<small>a ${A.esc(rotulo(V.p))} a las ${hh(V.horaP)}</small>` : ''}</div>
      <div><span>Media en movimiento</span>${vg(V.mov, claseVel(V.mov, V.plan))}<small>sin contar los altos</small></div>
      <div><span>Media con altos</span>${vg(V.altos)}<small>contando los altos</small></div></div>`;
  }

  /* ---------- ir a un punto (v0.97, pedido del usuario) ----------
     Durante la marcha (`E.desvio` {dest, modo 'volver'|'solo', salida, fase 'ida'|'vuelta', ini, llegada}): se navega en línea recta al destino
     (un punto de la ruta, un punto de referencia, un lugar tocado en la carta o una coordenada UTM). Con «volver», al llegar la app guía de
     vuelta al lugar donde se dejó la ruta y la marcha sigue; queda anotado en `E.desvios`. Sin marcha (`irSolo`): solo navegar a ese punto. */
  function objetivo(m, P){
    const E = m && m.ejec, d = E && E.estado!=='fin' ? E.desvio : null; if(!d) return null;
    const vuelta = d.fase==='vuelta', dest = vuelta ? d.salida : d.dest, r = pos ? M.rumboEntre(pos, dest, P.R.zona, P.R.decl.valor) : null;
    return {vuelta, nombre:dest.nombre, dest, dist:r ? r.dist : null, az:r ? r.azM : null, mils:r ? r.mils : null,
      modo:vuelta ? 'vuelves a donde dejaste la ruta' : d.modo==='volver' ? 'después vuelves a la ruta' : 'solo ir a ese punto'}; }
  function llegarDesvio(auto){
    const m = A.actual(), E = m.ejec, d = E && E.desvio; if(!d) return;
    if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if(d.modo==='volver' && d.fase==='ida'){ d.fase = 'vuelta'; d.llegada = ahora(); A.guardar(); A.aviso((auto ? '📍 ' : '✔ ') + 'Llegaste a ' + d.dest.nombre + '. Ahora vuelve a la ruta.'); return pintar(); }
    terminarDesvio(false, auto);
  }
  function terminarDesvio(cancelado, auto){
    const m = A.actual(), E = m.ejec, d = E && E.desvio; if(!d) return;
    (E.desvios || (E.desvios = [])).push({nombre:d.dest.nombre, modo:d.modo, ini:d.ini, llegada:d.llegada || (cancelado ? null : ahora()), fin:ahora(), cancelado:!!cancelado});
    delete E.desvio; A.guardar(); A.aviso(cancelado ? 'Desvío cancelado: sigues la ruta' : (auto ? '📍 ' : '✔ ') + (d.modo==='volver' ? 'De vuelta en la ruta' : 'Llegaste a ' + d.dest.nombre)); pintar();
  }
  document.addEventListener('pointerdown', e=>{ const b = e.target.closest && e.target.closest('.s-binf .btn, .s-ctrl .btn, .s-acc .btn'); if(b && navigator.vibrate) navigator.vibrate(12); }, {passive:true});
  function cambiarModo(k){ modo = k; try { localStorage.setItem('burros_seguir', modo); } catch(e){} pintar(); }
  function menuMas(){
    A.dialogo(`<h3>Más</h3><div class="s-mas">
      <button class="btn" data-mm="vista">${ic('capa', 'Tipo de pantalla: datos, carta o ATAK')}</button><button class="btn" data-mm="nov">${ic('nov', 'Novedad')}</button><button class="btn" data-mm="reg">${ic('lista', 'Matriz de eventos')}</button>
      <button class="btn" data-mm="pos">${ic('pos', 'Mensaje de posición')}</button><button class="btn" data-mm="hor">${ic('horiz', 'Vuelta al horizonte')}</button><button class="btn" data-mm="desde">${ic('ira', 'Seguir desde otro punto (saltar puntos)')}</button>
      <button class="btn" data-mm="matriz">${ic('lista', 'Enviar la matriz completa')}</button></div>
      <div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`, d=>d.querySelectorAll('[data-mm]').forEach(b=>b.onclick = ()=>{ const k = b.dataset.mm; A.cerrarDialogo();
        if(k==='reg') cambiarModo(k); else if(k==='vista') elegirVista(); else if(k==='nov') novedad(); else if(k==='pos') verMensaje(mensaje('POS', {})); else if(k==='desde') elegirDesde(); else if(k==='matriz') enviar(textoMatriz(), 'Matriz de eventos'); else horizonte(); }));
  }
  // tres pantallas para navegar (v0.99.7, pedido del usuario): solo datos, carta con datos arriba y tipo ATAK (panel a la derecha que se oculta)
  function elegirVista(){
    A.dialogo(`<h3>Tipo de pantalla</h3><div class="s-mas">
      <button class="btn${modo==='nav' ? ' pri' : ''}" data-vv="nav">${ic('lista', 'Solo datos (números grandes, sin carta)')}</button>
      <button class="btn${modo==='carta' ? ' pri' : ''}" data-vv="carta">${ic('capa', 'Carta con los datos arriba')}</button>
      <button class="btn${modo==='atak' ? ' pri' : ''}" data-vv="atak">${ic('ira', 'Tipo ATAK: carta completa y panel a la derecha que se oculta')}</button></div>
      <div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`, d=>d.querySelectorAll('[data-vv]').forEach(b=>b.onclick = ()=>{ A.cerrarDialogo(); cambiarModo(b.dataset.vv); }));
  }
  // elegir el destino: punto de la ruta, punto de referencia, tocar la carta o escribir la coordenada
  function dialogoIrA(enMarcha){
    // cualquier punto (v0.99.3, pedido del usuario): de cualquier marcha guardada (sin activarla), tocado en la carta o una coordenada
    const cur = A.actual(), ms = (A.marchas ? A.marchas() : [cur]).filter(Boolean);
    const conRuta = ms.map(x=>{ let R = null; try { R = M.calcular(x); } catch(e){} return {m:x, R}; }).filter(x=>x.R && x.R.puntos.some(q=>q.ok));
    let sel = conRuta.find(x=>x.m.id===dialogoIrA.sel) || conRuta.find(x=>cur && x.m.id===cur.id) || conRuta[0];
    const dat = (cur && cur.datum) || 'WGS84', g0 = pos ? M.deWgs84(pos.lat, pos.lon, 0, dat) : null, u = g0 ? M.llAUtm(g0.lat, g0.lon, (cur && +cur.zona) || undefined, M.DATUMS[dat]) : null;
    const pintarD = ()=>{
      const R = sel && sel.R, vistos = new Set(), pts = R ? R.puntos.filter(q=>{ if(!q.ok || (!q.ev && !q.nombre)) return false; const c = q.lat.toFixed(5) + ',' + q.lon.toFixed(5); if(vistos.has(c)) return false; vistos.add(c); return true; }) : [];
      const prs = sel ? [].concat(...(sel.m.horizontes || []).map(h=>h.prs)) : [];
      A.dialogo(`<h3>🧭 Ir a un punto</h3>
        ${enMarcha ? `<p class="nota">«Ir y volver»: al llegar, la app te guía de vuelta al lugar donde dejaste la ruta y la marcha sigue.</p><div class="campos"><label class="c ancho">Después<select id="iMod"><option value="volver">↩ Ir y volver a la ruta</option><option value="solo">■ Solo ir a ese punto</option></select></label></div>` : '<p class="nota">Navegación directa a cualquier punto, con o sin marcha.</p>'}
        ${conRuta.length ? `<div class="campos"><label class="c ancho">Puntos de la marcha<select id="iMar">${conRuta.map(x=>`<option value="${x.m.id}"${x===sel ? ' selected' : ''}>${A.esc(x.m.nombre || 'Marcha')}${cur && x.m.id===cur.id ? ' (abierta)' : ''}</option>`).join('')}</select></label></div>
          <div class="s-mas">${pts.map((q, k)=>`<button class="btn" data-ip="${k}">◉ ${A.esc(q.nombre || 'punto')}${q.clave ? ' · ' + A.esc(q.clave) : ''}</button>`).join('')}</div>
          ${prs.length ? `<h4>Puntos de referencia de esa marcha</h4><div class="s-mas">${prs.map((q, i)=>`<button class="btn" data-ir="${i}">▲ ${A.esc(q.nombre)}</button>`).join('')}</div>` : ''}` : '<p class="nota">No hay marchas guardadas con puntos: toca el lugar en la carta o escribe la coordenada.</p>'}
        <h4>Cualquier otro lugar</h4><div class="s-mas"><button class="btn" id="iCarta">✛ Tocarlo en la carta</button></div>
        <div class="campos"><label class="c">Zona<input class="num" id="iZ" value="${u ? u.zona : (cur && +cur.zona) || 19}" inputmode="numeric"></label><label class="c">Este (m)<input class="num" id="iE" inputmode="numeric" placeholder="${u ? Math.round(u.e) : '350000'}"></label>
          <label class="c">Norte (m)<input class="num" id="iN" inputmode="numeric" placeholder="${u ? Math.round(u.n) : '6300000'}"></label></div>
        <div class="btns"><button class="btn" id="iUtm">Ir a esa coordenada</button><button class="btn" data-cerrar>Cancelar</button></div>
        <p class="nota">Coordenadas UTM en ${A.esc(dat)}.</p>`, d=>{
        const ir = dest=>{ const mo = enMarcha ? d.querySelector('#iMod').value : 'solo'; A.cerrarDialogo(); empezarIrA(dest, enMarcha, mo); };
        const mar = d.querySelector('#iMar'); if(mar) mar.onchange = ()=>{ dialogoIrA.sel = mar.value; sel = conRuta.find(x=>x.m.id===mar.value); pintarD(); };
        d.querySelectorAll('[data-ip]').forEach(b=>b.onclick = ()=>{ const q = pts[+b.dataset.ip]; ir({lat:q.lat, lon:q.lon, nombre:q.clave || q.nombre || 'el punto'}); });
        d.querySelectorAll('[data-ir]').forEach(b=>b.onclick = ()=>{ const q = prs[+b.dataset.ir]; ir({lat:q.lat, lon:q.lon, nombre:q.nombre}); });
        d.querySelector('#iCarta').onclick = ()=>{ eligiendo = {enMarcha, modo:enMarcha ? d.querySelector('#iMod').value : 'solo'}; A.cerrarDialogo();
          if(enMarcha && modo!=='carta') cambiarModo('carta'); else if(!enMarcha && !mapa){ irSolo = null; pintarSinRuta(true); } A.aviso('Toca el lugar en la carta'); };
        d.querySelector('#iUtm').onclick = ()=>{ const z = +d.querySelector('#iZ').value, e = +d.querySelector('#iE').value, n = +d.querySelector('#iN').value;
          if(!z || !e || !n) return A.aviso('Escribe la zona, el este y el norte');
          const g = M.utmALl(e, n, z, true, M.DATUMS[dat]), w = M.aWgs84(g.lat, g.lon, 0, dat); ir({lat:w.lat, lon:w.lon, nombre:'UTM ' + Math.round(e/1000) + ' ' + Math.round(n/1000)}); };
      });
    };
    pintarD();
  }
  const esc19 = m=>+m.zona || 19;
  function empezarIrA(dest, enMarcha, mo){
    const m = A.actual(), E = m && m.ejec;
    if(enMarcha && E && E.estado!=='fin'){ const P = plan(m), k = siguiente(m, P), q = P.pts[Math.max(0, (k===null ? P.pts.length : k) - 1)];
      E.desvio = {dest, modo:mo, fase:'ida', ini:ahora(), salida:{lat:pos ? pos.lat : q.lat, lon:pos ? pos.lon : q.lon, nombre:'donde dejaste la ruta'}}; A.guardar();
      A.aviso('🧭 Ir a ' + dest.nombre + (mo==='volver' ? ' y volver a la ruta' : '')); }
    else { irSolo = Object.assign({}, dest, {ini:ahora()}); A.aviso('🧭 Navegando a ' + dest.nombre); brujula(); }   // la brújula también al navegar a un punto (v0.99.27)
    pintar();
  }
  // sin marcha abierta o sin ruta: la carta con tu posición y «Ir a un punto»
  function pintarSinRuta(tocar){
    const c = $('#seguir'); if(!c) return; document.body.classList.add('con-mapa');
    c.innerHTML = `<div class="mapa-env s-carta s-dos"><div id="sMapa"></div><div class="s-bsup"><div class="b1">${tocar ? 'Toca en la carta el lugar al que quieres ir' : 'Sin ruta: navega a cualquier punto'}</div></div>
      <div class="s-ctrl">${modoVistaBtn()}<button class="btn" id="sOrient" aria-label="Orientación"></button><button class="btn" id="sCapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>
      <div class="s-binf"><button class="btn pri" id="sIrSolo2">${ic('ira', 'Ir a un punto')}</button></div></div>`;
    $('#sIrSolo2').onclick = ()=>dialogoIrA(false);
    if(tocar) eligiendo = eligiendo || {enMarcha:false, modo:'solo'};
    centrar = true; hacerMapa(null); iniciarGps();
  }
  function posSinRuta(){ if(!mapa || !capas || !pos) return; capas.clearLayers();
    L.circle([pos.lat, pos.lon], {radius:pos.acc||20, color:'#2a7fd4', weight:1, fillOpacity:.12}).addTo(capas);
    L.circleMarker([pos.lat, pos.lon], {radius:8, color:'#fff', weight:3, fillColor:'#2a7fd4', fillOpacity:1}).addTo(capas);
    if(centrar){ if(primera){ mapa.setView([pos.lat, pos.lon], 15, {animate:false}); primera = false; } else mapa.panTo([pos.lat, pos.lon], {animate:false}); } }
  // navegación sola a un punto (sin marcha): la misma carta con las dos barras
  // navegación sola a un punto: también con los tres tipos de pantalla (v0.99.18, pedido del usuario: «no puedo ver los tipos de pantalla»)
  function pintarSolo(c, P){
    const ctrl = `<div class="s-ctrl">${modoVistaBtn()}<button class="btn" id="sOrient" title="Norte arriba o destino arriba" aria-label="Orientación"></button><button class="btn" id="sCapa" title="Cambiar el mapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" title="Centrar en mi posición" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>`;
    if(modo==='nav'){
      c.innerHTML = `<div class="s-nav s-nav-solo"><div class="s-nav-d"><div class="tarjeta" id="sCab"></div></div><div class="s-nav-b"><div class="seg s-modos">${MODOS.filter(([k])=>k!=='reg').map(([k, n])=>`<button data-smodo="${k}" class="${modo===k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="s-acc"><button class="btn pri" id="sSoloFin">${ic('fin', 'Terminar la navegación')}</button></div></div></div>`;
      c.querySelectorAll('[data-smodo]').forEach(b=>b.onclick = ()=>cambiarModo(b.dataset.smodo));
      $('#sSoloFin').onclick = ()=>{ irSolo = null; pintar(); }; iniciarGps(); pintarSoloVivo(); return; }
    document.body.classList.add('con-mapa');
    if(modo==='atak'){
      c.innerHTML = `<div class="mapa-env s-carta s-atak${panelOculto ? ' oculto' : ''}"><div id="sMapa"></div><div class="s-franja" id="sFranja"></div>
        <div class="s-panel"><div class="s-pcab" id="sCab"></div></div><button class="s-pest" id="sPest" aria-label="Mostrar u ocultar los datos"></button>
        <div class="s-flecha s-flecha-g desvio" id="sFlecha">${punteroCarta}</div>${ctrl}<button class="btn pri s-pasando" id="sSoloFin">${ic('fin', 'Terminar la navegación')}</button></div>`;
      const pe = $('#sPest'), env = c.querySelector('.s-atak'), pp = ()=>{ pe.innerHTML = panelOculto ? '‹' : '›'; env.classList.toggle('oculto', panelOculto); };
      pp(); pe.onclick = ()=>{ panelOculto = !panelOculto; try { localStorage.setItem('burros_panel', panelOculto ? '1' : ''); } catch(e){} pp(); setTimeout(()=>{ if(mapa) mapa.invalidateSize({animate:false}); }, 300); };
      $('#sSoloFin').onclick = ()=>{ irSolo = null; pintar(); };
      centrar = true; hacerMapa(null); iniciarGps(); pintarSoloVivo(); return; }
    c.innerHTML = `<div class="mapa-env s-carta s-dos"><div id="sMapa"></div><div class="s-bsup" id="sCab"></div>
      <div class="s-flecha s-flecha-g desvio" id="sFlecha">${punteroCarta}</div><div class="s-ctrl">${modoVistaBtn()}<button class="btn" id="sOrient" title="Norte arriba o destino arriba" aria-label="Orientación"></button><button class="btn" id="sCapa" title="Cambiar el mapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" title="Centrar en mi posición" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>
      <div class="s-binf"><button class="btn pri" id="sSoloFin">${ic('fin', 'Terminar la navegación')}</button></div></div>`;
    $('#sSoloFin').onclick = ()=>{ irSolo = null; pintar(); };
    centrar = true; hacerMapa(null); iniciarGps(); pintarSoloVivo();   // sin la ruta de ninguna marcha: solo tu ubicación y el destino (v0.99.4)
  }
  // zona UTM y declinación: las de la marcha abierta, o las del lugar (WMM) si no hay ruta
  function geoRef(P, lat, lon){ if(P) return {zona:P.R.zona, dec:P.R.decl.valor}; const z = Math.floor((lon + 180)/6) + 1;
    let dec = 0; try { if(typeof WMM!=='undefined') dec = WMM.decl(lat, lon, 0, WMM.year(new Date())); } catch(e){} return {zona:z, dec}; }
  let decSolo = 0;
  function pintarSoloVivo(){
    const c = $('#sCab'); if(!c || !irSolo) return; const gr = geoRef(null, irSolo.lat, irSolo.lon); decSolo = gr.dec;
    const r = pos ? M.rumboEntre(pos, irSolo, gr.zona, gr.dec) : null, V = velAhora();
    if(r){ c.dataset.az = r.azM; if(r.dist<=Math.max(40, 15 + (pos.acc || 0)) && !irSolo.llego){ irSolo.llego = true; if(navigator.vibrate) navigator.vibrate([200, 100, 200]); A.aviso('📍 Llegaste a ' + irSolo.nombre); } }
    const dist = r ? (r.dist>=1000 ? A.f(r.dist/1000, 2) + ' km' : A.f(r.dist) + ' m') : '—', cel = (rot, val, sub, cl)=>`<div class="bc"><span>${rot}</span><b class="${cl || ''}">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const celdas = `${cel(irSolo.llego ? 'Llegaste a' : 'Ir a', A.esc(irSolo.nombre), 'en línea recta', 'desv')}${cel('Distancia', dist)}${cel('Rumbo mag.', r ? A.f(r.azM, 0) + '°' : '—', r ? r.mils + ' ‰' : '', 'ocre')}
      ${cel('Ahora', V ? A.f(V, 1) + ' km/h' : '—', V ? M.verRitmo(V) : '')}${cel('Llega aprox.', r ? hh(ahora() + r.dist/1000/(V>1 ? V : 4)*36e5) : '—', 'a ' + A.f(V>1 ? V : 4, 1) + ' km/h')}${cel('GPS', pos ? '±' + Math.round(pos.acc || 0) + ' m' : '—', pos ? '' : 'esperando señal')}`;
    if(modo==='nav') c.innerHTML = `<div class="s-prox">🧭 <b class="clave-tx">${irSolo.llego ? 'LLEGASTE A' : 'IR A'} ${A.esc(irSolo.nombre)}</b><small>en línea recta</small></div>
        <div class="s-grande"><div><span>Distancia</span><b>${dist}</b></div><div><span>Rumbo mag.</span><b class="ocre">${r ? A.f(r.azM, 0) + '°' : '—'}</b><small>${r ? r.mils + ' ‰' : ''}</small></div>
          ${punteroAnillo}</div>
        <div class="bcs">${cel('Ahora', V ? A.f(V, 1) + ' km/h' : '—', V ? M.verRitmo(V) : '')}${cel('Llega aprox.', r ? hh(ahora() + r.dist/1000/(V>1 ? V : 4)*36e5) : '—', 'a ' + A.f(V>1 ? V : 4, 1) + ' km/h')}${cel('GPS', pos ? '±' + Math.round(pos.acc || 0) + ' m' : '—', pos ? '' : 'esperando señal')}</div>`;
    else if(modo==='atak'){ c.innerHTML = `<div class="pcs">${celdas}</div>`; const fr = $('#sFranja'); if(fr) fr.innerHTML = `<b class="clave-tx">${A.esc(irSolo.nombre)}</b><span>${dist}</span><b class="ocre">${r ? A.f(r.azM, 0) + '°' : '—'}</b>`; }
    else c.innerHTML = `<div class="bcs">${celdas}</div>`;
    flecha(); if(mapa && capas){ capas.clearLayers(); L.circleMarker([irSolo.lat, irSolo.lon], {radius:12, color:'#6fb3d9', weight:3, fill:false}).addTo(capas);
      if(pos){ L.polyline([[pos.lat, pos.lon], [irSolo.lat, irSolo.lon]], {color:'#6fb3d9', weight:3, dashArray:'6 6'}).addTo(capas); L.circleMarker([pos.lat, pos.lon], {radius:8, color:'#fff', weight:3, fillColor:'#2a7fd4', fillOpacity:1}).addTo(capas);
        if(r) girar(azGiro(M.rumboEntre(pos, irSolo, gr.zona, 0).azG)); if(centrar) seguirPos(irSolo); } }
  }

  /* ---------- adelanto / atraso ---------- */
  // minutos de atraso (+) o adelanto (−): tiempo real transcurrido − tiempo planificado para llegar a esta parte de la ruta
  function atraso(m, P){
    const E = m.ejec, k = siguiente(m, P); if(k===null) return null;
    const ult = k - 1, a = P.pts[ult], b = P.pts[k];
    if(pos){ const s = M.sobreTramo(pos, a, b), tPlan = (a.sal + s.t*(b.lleg - a.sal))*60; return (ahora() - E.inicio)/60000 - tPlan; }
    return E.llegadas[ult]>0 ? (E.llegadas[ult] - E.inicio)/60000 - a.lleg*60 : null;   // sin GPS: lo de la última llegada
  }

  /* ---------- cronómetro de intervalos (carrera de combate) ----------
     Por distancia: según los metros recorridos por la ruta (posición GPS proyectada). Por tiempo: según los minutos de marcha
     (sin contar los altos). Por terreno: según el tramo en que se va (trote o paso). Al cambiar de fase suena y vibra. */
  let audio = null, ultFase = null;
  function sonido(rapido){
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if(audio.state==='suspended') audio.resume();
      (rapido ? [0, 0.22] : [0]).forEach(d=>{ const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + d;
        o.frequency.value = rapido ? 1320 : 660; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + 0.2); }); } catch(e){}
    if(navigator.vibrate) navigator.vibrate(rapido ? [300, 100, 300] : [600]);
  }
  // metros recorridos por la ruta desde el PIM (posición proyectada sobre el tramo en curso)
  function recorrido(m, P){ const k = siguiente(m, P); if(k===null) return P.R.res.dist;
    let d = 0; for(let j=1; j<k; j++) d += P.pts[j].tramo.dist;
    return pos ? d + M.sobreTramo(pos, P.pts[k - 1], P.pts[k]).t*P.pts[k].tramo.dist : d; }
  // minutos de marcha sin los altos
  function enMarcha(E){ const t = ahora(); return (t - E.inicio - E.altos.reduce((a, x)=>a + ((x.fin || t) - x.ini), 0))/60000; }
  function intervalo(m, P, corto){
    const par = P.R.par, E = m.ejec; if(par.metodo!=='battle' || !E) return null;
    const d = recorrido(m, P), min = enMarcha(E), cic = M.cicloBattle(par), ritmo = d>50 && min>=1 ? min/(d/1000) : null;
    let fase, falta, ciclo = null;
    if(par.brPatron==='terreno' || par.brPatron==='trote'){ const k = siguiente(m, P); if(k===null) return null;
      fase = P.pts[k].tramo.como==='paso' ? 'lento' : 'rapido'; let f = 0;
      for(let j=k; j<P.pts.length && (P.pts[j].tramo.como==='paso')===(fase==='lento'); j++) f += P.pts[j].tramo.dist;
      falta = A.f(Math.max(0, f - (d - (P.pts[k].tramo.distAcum - P.pts[k].tramo.dist)))) + ' m más'; }
    else { const L = cic.rap + cic.len; if(!(L>0)) return null; const x = cic.u==='m' ? d : min, r = x%L; ciclo = Math.floor(x/L) + 1;
      fase = r<cic.rap ? 'rapido' : 'lento'; const q = fase==='rapido' ? cic.rap - r : L - r;
      falta = cic.u==='m' ? A.f(q) + ' m más' : Math.floor(q) + ':' + String(Math.floor((q%1)*60)).padStart(2, '0') + ' min más'; }
    const pausa = E.estado==='alto';
    if(!pausa && ultFase && ultFase!==fase) sonido(fase==='rapido'); ultFase = pausa ? ultFase : fase;
    const nombre = par.brPatron==='terreno' || par.brPatron==='trote' ? (fase==='rapido' ? 'TROTAR' : 'CAMINAR') : (fase==='rapido' ? 'CORRER' : 'CAMINAR');
    const mt = P.R.meta, rObj = mt ? mt.ritmoMeta : P.R.res.dist ? P.R.res.marcha*60/(P.R.res.dist/1000) : null, mmss = x=>Math.floor(x) + ':' + String(Math.round((x%1)*60)).padStart(2, '0');
    if(corto) return `<span class="ch ${pausa ? 'pausa' : fase}">${pausa ? '⏸ ' : '▶ '}<b>${nombre}</b> ${falta}${ciclo ? ' · ciclo ' + ciclo : ''}</span>`;
    return `<div class="s-intervalo ${pausa ? 'pausa' : fase}"><b>${pausa ? '⏸ ' : '▶ '}${nombre}</b><span>${falta}</span>${ciclo ? `<span>ciclo ${ciclo}</span>` : ''}
      <small>${pausa ? 'intervalos en pausa durante el alto · ' : ''}${ritmo ? 'ritmo ' + mmss(ritmo) + ' min/km' : 'ritmo —'}${rObj ? ' · ' + (mt ? 'meta' : 'plan') + ' ' + mmss(rObj) + ' min/km' : ''} · ${A.f(d)} m recorridos</small></div>`;
  }

  /* ---------- GPS, brújula y pantalla encendida ---------- */
  let saltosGps = 0;
  function iniciarGps(){
    if(watch!==null || !navigator.geolocation) return;
    watch = navigator.geolocation.watchPosition(p=>{
      pos = {lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy, t:ahora(), vel:p.coords.speed, alt:p.coords.altitude};
      hist.push({t:pos.t, lat:pos.lat, lon:pos.lon, alt:pos.alt, acc:pos.acc}); while(hist.length && pos.t - hist[0].t>6*60000) hist.shift();
      const m = A.actual(), E = m && m.ejec;
      if(irSolo && (!E || E.estado==='fin')){ pintarSoloVivo(); return; }
      if($('#sIrSolo2')){ posSinRuta(); return; }   // sin ruta: solo la posición en la carta
      if(!E){ pintarPrevio(); return; }   // antes de partir: solo se muestra la posición y la distancia al PIM
      if(E.estado==='fin') return;
      const u = E.track[E.track.length - 1], du = u ? M.sobreTramo(pos, {lat:u[0], lon:u[1]}, {lat:u[0], lon:u[1]}).d : 0;
      // saltos del GPS (v0.99.10, visto en terreno): no se anotan las lecturas malas (más de 35 m de error; si se repiten 5 veces seguidas se
      // aceptan igual) y se borra el «pico»: un punto que se va lejos a más de 20 km/h y el siguiente vuelve cerca de donde se estaba
      const mala = u && (pos.acc || 0)>35; if(mala) saltosGps++; else saltosGps = 0;
      if(u && pos.t - u[2]>CORTE.ms && du>CORTE.m && E.estado!=='alto' && !E.desvio) reconstruir(m, E, u);   // volvió a grabar más adelante
      const quieto = E.estado==='alto' && du<=Math.max(30, 2*(pos.acc || 0));   // en un alto, el GPS «baila» sin moverse: no se anota
      if(!u || ((!mala || saltosGps>=5) && !quieto && (du>10 || pos.t - u[2]>60000))){ saltosGps = 0; E.track.push([+pos.lat.toFixed(6), +pos.lon.toFixed(6), pos.t, Math.round(pos.acc || 0)]); if(E.track.length>8000) E.track.splice(0, E.track.length - 8000);
        const T = E.track, n = T.length; if(n>=3){ const [a, b, c] = [T[n - 3], T[n - 2], T[n - 1]].map(t=>({lat:t[0], lon:t[1], t:t[2]})), d = (x, y)=>M.sobreTramo(x, y, y).d;
          const ab = d(a, b), bc = d(b, c), ac = d(a, c); if(ab>30 && bc>30 && ac<Math.min(ab, bc)/2 && ab/1000/Math.max(1/3600, (b.t - a.t)/36e5)>20) T.splice(n - 2, 1); } }
      // llegada automática
      const P = plan(m), k = P && siguiente(m, P);
      const O = P && objetivo(m, P);
      if(O && E.estado==='marcha'){ if(O.dist!==null && O.dist<=Math.max(40, 15 + (pos.acc||0))) llegarDesvio(true); }
      else if(k!==null && k!==undefined && E.estado==='marcha'){ const rad = Math.max(40, 15 + (pos.acc||0)), d = M.rumboEntre(pos, P.pts[k], P.R.zona, P.R.decl.valor).dist;
        if(d<=rad) llegar(k, true); else { const j = adelante(m, P, k, rad); if(j!==null) saltar(j, true); } }
      A.guardar(); pintarVivo();
    }, e=>{ pos = null; const x = $('#sGps'); if(x) x.textContent = e.code===1 ? 'GPS sin permiso: marca las llegadas a mano' : 'Sin señal GPS'; },
    {enableHighAccuracy:true, maximumAge:5000, timeout:30000});
  }
  function pararGps(){ if(watch!==null){ navigator.geolocation.clearWatch(watch); watch = null; } pos = null; }
  async function pantalla(on){
    try { if(on && 'wakeLock' in navigator && !wake){ wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', ()=>wake = null); }
      if(!on && wake){ await wake.release(); wake = null; } } catch(e){}
  }
  document.addEventListener('visibilitychange', ()=>{ const m = A && A.actual(); if(!document.hidden && m && m.ejec && m.ejec.estado!=='fin') pantalla(true); });
  // ángulo de la pantalla: con el teléfono en horizontal la brújula entrega el rumbo del borde de arriba del teléfono vertical (v0.99.10,
  // error visto en terreno): se suma el giro de la pantalla (iPhone: window.orientation; Android: screen.orientation.angle)
  const anguloPantalla = ios=>{ const w = typeof window.orientation==='number' ? window.orientation : null, s = screen.orientation && typeof screen.orientation.angle==='number' ? screen.orientation.angle : null;
    return (ios ? (w!==null ? w : s) : (s!==null ? s : w)) || 0; };
  let conBrujula = false, cuadroFlecha = 0;
  function brujula(){
    if(conBrujula) return; conBrujula = true;
    const fn = e=>{ let h = null; const ios = typeof e.webkitCompassHeading==='number';
      if(ios) h = e.webkitCompassHeading;                                                  // iPhone: respecto del norte magnético
      else if(e.absolute && typeof e.alpha==='number') h = (360 - e.alpha + 360)%360;      // Android: norte geográfico
      if(h===null) return; h = ((h + anguloPantalla(ios))%360 + 360)%360;
      // suavizado (v0.99.27): cada lectura acerca un tercio, por el camino corto; un salto de más de 45° (giro real o de pantalla) se toma entero
      const d = rumboDisp ? ((h - rumboDisp.h + 540)%360) - 180 : 0;
      rumboDisp = {h:!rumboDisp || Math.abs(d)>45 ? h : ((rumboDisp.h + d*0.5)%360 + 360)%360, mag:ios};
      if(!document.body.classList.contains('con-brujula')) document.body.classList.add('con-brujula');   // la flecha sin animación CSS: sigue al teléfono sin retraso (v0.99.32)
      if(!cuadroFlecha) cuadroFlecha = requestAnimationFrame(()=>{ cuadroFlecha = 0; flecha(); }); };   // una vez por cuadro, no 60 veces por segundo
    const activar = ()=>{ addEventListener('deviceorientationabsolute', fn); addEventListener('deviceorientation', fn); };
    if(typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function')
      DeviceOrientationEvent.requestPermission().then(r=>{ if(r==='granted') activar(); else conBrujula = false; }).catch(()=>{ conBrujula = false; });
    else activar();
  }

  /* ---------- acciones ---------- */
  function iniciar(){
    const m = A.actual(); if(!plan(m)) return A.aviso('Primero completa la ruta');
    if(A.calcular(m).par.metodo==='battle'){ ultFase = null; try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }   // el sonido se habilita con el toque
    m.ejec = {estado:'marcha', inicio:ahora(), fin:null, llegadas:{0:ahora()}, altos:[], nov:[], track:[], msgs:[]};
    A.guardar(); iniciarGps(); pantalla(true); brujula();
    mensaje('INI', {});
    pintar();
  }
  const avisoMochila = e=>({deja:'DEJAR LA MOCHILA DE SOSTENIMIENTO', dejaTodo:'DEJAR LAS DOS MOCHILAS', recogeB:'RECOGER LA MOCHILA DE SOSTENIMIENTO',
    recogeA:'RECOGER LA MOCHILA DE ASALTO', recoge:'RECOGER LAS DOS MOCHILAS'})[e] || '';
  function llegar(k, auto, sinTarjeta){
    const m = A.actual(), E = m.ejec, P = plan(m); if(!E || E.llegadas[k]) return;
    if(!P.pts[k].ev){ E.llegadas[k] = ahora(); A.guardar(); pintarVivo();   // quiebre de la ruta: sin mensaje (solo el aviso de la mochila)
      if(P.pts[k].mochila){ if(navigator.vibrate) navigator.vibrate([200, 100, 200]); A.aviso('🎒 ' + avisoMochila(P.pts[k].mochila) + ' aquí'); } return; }
    for(let j=1; j<k; j++) if(!E.llegadas[j]) E.llegadas[j] = P.pts[j].ev ? -1 : ahora();   // eventos saltados / quiebres ya pasados
    E.llegadas[k] = ahora();
    const d = (E.llegadas[k] - E.inicio)/60000 - P.pts[k].lleg*60, p = P.pts[k];
    if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const msgPC = mensaje('PC', {pc:p.nombre, clave:p.clave || '', n:k, h:hh(E.llegadas[k]), dif:Math.round(d)});
    if(k<P.pts.length - 1 && !sinTarjeta && tarjetaPaso(m, P, k, d, msgPC)) {}
    else A.aviso((auto ? '📍 ' : '✔ ') + verbo() + ' ' + rotulo(p) + ' — ' + dif(d) + (p.mochila ? ' · 🎒 ' + avisoMochila(p.mochila) : ''));
    if(k===P.pts.length - 1) terminar(true); else { A.guardar(); pintar(); }
  }
  /* ---------- línea de avance (v0.99.30, revisión de la app, etapa 2, estilo sobrio): los puntos de control en orden (pasados llenos, el
     próximo con anillo, los que faltan en gris, saltados con ×); el tramo en curso se llena con lo recorrido por la ruta; con más de 7
     puntos se ven los cercanos al próximo. Abajo: km recorridos de la ruta, puntos pasados y adelanto/atraso (o hora de término). */
  function lineaAvance(m, P, E, at, conTermino){
    const ev = P.pts.map((p, j)=>j).filter(j=>P.pts[j].ev), acum = [0]; for(let j=1; j<P.pts.length; j++) acum[j] = acum[j - 1] + P.pts[j].tramo.dist;
    if(ev.length<2) return '';
    const d = recorrido(m, P), tot = acum[acum.length - 1], ke = proxEv(m, P), iN = ke===null ? ev.length - 1 : ev.indexOf(ke);
    let a = 0, b = ev.length - 1; if(ev.length>7){ a = Math.max(0, Math.min(iN - 2, ev.length - 7)); b = a + 6; }
    let h = '';
    for(let i=a; i<=b; i++){ const j = ev[i], ll = E.llegadas[j], est = j===0 || ll>0 ? 'v' : ll===-1 ? 'sal' : j===ke ? 'prox' : 'pend';
      if(i>a){ const j0 = ev[i - 1], f = est==='v' || est==='sal' ? 1 : Math.max(0, Math.min(1, (d - acum[j0])/Math.max(1, acum[j] - acum[j0])));
        h += `<span class="av-s"><i style="width:${Math.round(f*100)}%"></i></span>`; }
      h += `<span class="av-p ${est}"><small>${A.esc(rotulo(P.pts[j]) || P.pts[j].nombre)}</small></span>`; }
    const hechos = ev.filter(j=>j && E.llegadas[j]>0).length, cls = at===null ? '' : at>5 ? 'mal' : at< -5 ? 'bien' : '';
    const der = conTermino ? (at===null ? '' : 'termina ' + hh(E.inicio + (P.R.res.total*60 + at)*60000))
      : at===null ? '' : `<span class="${cls}">${Math.abs(at)<1 ? 'a la hora' : (at<0 ? '▲ ' : '▼ ') + Math.round(Math.abs(at)) + ' min'}</span>`;
    return `<div class="avance${a>0 ? ' corta-i' : ''}${b<ev.length - 1 ? ' corta-d' : ''}"><div class="av-ln">${h}</div>
      <div class="av-tx"><span>${A.f(Math.min(d, tot)/1000, 1)} de ${A.f(tot/1000, 1)} km · ${hechos} de ${ev.length - 1} puntos</span><span>${der}</span></div></div>`;
  }
  /* ---------- confirmación al pasar un punto (v0.99.30): tarjeta grande que se cierra sola en 5 s; no tapa los botones de abajo
     (el fondo deja pasar los toques). «Enviar al C2» abre el envío del mensaje PASANDO. `burros_confirma` = '0' la apaga (pruebas). */
  let tTarjeta = null;
  function tarjetaPaso(m, P, k, d, msg){
    let on = true; try { on = localStorage.getItem('burros_confirma')!=='0'; } catch(e){}
    if(!on || !$('#seguir')) return false;
    const E = m.ejec, p = P.pts[k], ev = P.pts.map((q, j)=>j).filter(j=>P.pts[j].ev && j), hechos = ev.filter(j=>E.llegadas[j]>0).length;
    const sig = P.pts.findIndex((q, j)=>j>k && q.ev), q = sig>0 ? P.pts[sig] : null, r = q ? M.rumboEntre(p, q, P.R.zona, P.R.decl.valor) : null;
    let dist = 0; if(q) for(let j=k + 1; j<=sig; j++) dist += P.pts[j].tramo.dist;
    const at = Math.round(d), cl = Math.abs(at)<=5 ? 'bien' : at>0 ? 'mal' : 'bien';
    let el = $('#sOk'); if(el) el.remove(); clearTimeout(tTarjeta);
    el = document.createElement('div'); el.id = 'sOk';
    el.innerHTML = `<div class="ok-t"><div class="ok-c">✓</div><b>${A.esc(verbo() + ' ' + rotulo(p))}</b>
      <div class="ok-h ${cl}">${hh(E.llegadas[k])} · ${Math.abs(at)<1 ? 'a la hora' : Math.abs(at) + ' min ' + (at<0 ? 'adelantado' : 'atrasado')}</div>
      <div class="ok-s">${hechos} de ${ev.length} puntos${p.mochila ? ' · 🎒 ' + A.esc(avisoMochila(p.mochila)) : ''}</div>
      ${q ? `<div class="ok-n">Próximo: <b>${A.esc(rotulo(q))}</b> · ${dist>=1000 ? A.f(dist/1000, 2) + ' km' : A.f(dist) + ' m'} · ${A.f(r.azM, 0)}°<br>llega ${hh(E.inicio + q.lleg*36e5)}</div>` : ''}
      <div class="ok-b"><button class="btn" data-ok="env">Enviar al C2</button><button class="btn" data-ok="ok">Seguir</button></div></div>`;
    document.body.appendChild(el);
    const cerrar = ()=>{ clearTimeout(tTarjeta); el.remove(); };
    el.querySelector('[data-ok=ok]').onclick = cerrar;
    el.querySelector('[data-ok=env]').onclick = ()=>{ cerrar(); enviar(msg, verbo() + ' ' + rotulo(p)); };
    tTarjeta = setTimeout(cerrar, 5000);
    return true;
  }

  /* ---------- recorrido real: ida y regreso (v0.99.10, pedido del usuario: el regreso de otro color aunque pise la ida) ----------
     El regreso empieza en el punto anterior al primero marcado «Regreso» (los que deja «Volver por la ida»); si no hay, en el punto más
     lejano del inicio (si es el último, no hay regreso). Lo grabado después de llegar ahí (o a uno posterior) es regreso. */
  const COL_IDA = '#2a7fd4', COL_REG = '#e0453a';
  /* Suavizado del recorrido (v0.99.12, comparado con un Garmin en terreno: 8,8 km contra 8,0): cada lectura del GPS se corre unos metros a
     los lados y, sumadas punto por punto, esas idas y vueltas agregan ~10 %. Filtro de Kalman (posición y velocidad en cada eje, en metros;
     el error de cada lectura es su precisión, 10 m si no se guardó) con suavizado hacia atrás (Rauch-Tung-Striebel). Con datos simulados
     deja la distancia a menos de 2 % de la real. Se usa para la distancia GPS y para dibujar el recorrido; lo grabado no se cambia. */
  const Q_GPS = 0.05;
  function suavizar(T){
    const n = T.length; if(n<3) return T.map(t=>t.slice(0, 5));
    const la0 = T[0][0], lo0 = T[0][1], kx = Math.cos(la0*Math.PI/180)*111320, ky = 110540;
    const Z = T.map(t=>({x:(t[1] - lo0)*kx, y:(t[0] - la0)*ky, t:t[2]/1000, a:Math.max(3, t[3] || 10)}));
    const eje = k=>{ const xs = [], Ps = [], xp = [], Pp = []; let x = [Z[0][k], 0], P = [[Z[0].a*Z[0].a, 0], [0, 4]];
      for(let i=0; i<n; i++){
        if(i){ const dt = Math.max(0.1, Z[i].t - Z[i - 1].t); x = [x[0] + x[1]*dt, x[1]];
          const p01 = P[0][1] + dt*P[1][1] + Q_GPS*dt*dt/2; P = [[P[0][0] + 2*dt*P[0][1] + dt*dt*P[1][1] + Q_GPS*dt*dt*dt/3, p01], [p01, P[1][1] + Q_GPS*dt]]; }
        xp.push(x); Pp.push(P);
        const S = P[0][0] + Z[i].a*Z[i].a, K0 = P[0][0]/S, K1 = P[1][0]/S, y = Z[i][k] - x[0];
        x = [x[0] + K0*y, x[1] + K1*y]; P = [[(1 - K0)*P[0][0], (1 - K0)*P[0][1]], [P[1][0] - K1*P[0][0], P[1][1] - K1*P[0][1]]];
        xs.push(x); Ps.push(P); }
      const sm = xs.slice();
      for(let i=n - 2; i>=0; i--){ const dt = Math.max(0.1, Z[i + 1].t - Z[i].t), P = Ps[i], N = Pp[i + 1], det = N[0][0]*N[1][1] - N[0][1]*N[1][0]; if(!(Math.abs(det)>1e-12)) continue;
        const a = [[P[0][0] + P[0][1]*dt, P[0][1]], [P[1][0] + P[1][1]*dt, P[1][1]]], inv = [[N[1][1]/det, -N[0][1]/det], [-N[1][0]/det, N[0][0]/det]];
        const C = [[a[0][0]*inv[0][0] + a[0][1]*inv[1][0], a[0][0]*inv[0][1] + a[0][1]*inv[1][1]], [a[1][0]*inv[0][0] + a[1][1]*inv[1][0], a[1][0]*inv[0][1] + a[1][1]*inv[1][1]]];
        const d0 = sm[i + 1][0] - xp[i + 1][0], d1 = sm[i + 1][1] - xp[i + 1][1];
        sm[i] = [xs[i][0] + C[0][0]*d0 + C[0][1]*d1, xs[i][1] + C[1][0]*d0 + C[1][1]*d1]; }
      return sm.map(v=>v[0]); };
    const X = eje('x'), Y = eje('y');
    return T.map((t, i)=>[+(la0 + Y[i]/ky).toFixed(6), +(lo0 + X[i]/kx).toFixed(6), t[2], t[3], t[4]]);
  }
  /* Recorrido → ruta nueva (v0.99.14, pedido del usuario): el recorrido suavizado se reduce a sus quiebres (Douglas-Peucker: se deja un
     punto solo si la línea se aparta más de `tol` m; tol sube de 10 m hasta que queden ≤ 150 puntos) y se intercalan, por hora, los
     puntos de control a los que se llegó (con su nombre, clave y cota). Devuelve puntos para `nueva()`: el primero PIM y el último PTM.
     Las cotas de los puntos de control se marcan automáticas para que también se reemplacen por las del terreno: mezclar la cota escrita
     a mano con la del terreno (SRTM) en los quiebres inventaba subidas y bajadas (el ejemplo daba +2.065 m en vez de +688). */
  function puntosDeRecorrido(m, ej){
    const S = limpio((ej && ej.track) || [], m); if(S.length<2) return [];
    const la0 = S[0][0], kx = Math.cos(la0*Math.PI/180)*111320, ky = 110540, X = S.map(t=>({x:t[1]*kx, y:t[0]*ky}));
    const dp = tol=>{ const keep = new Array(S.length).fill(false); keep[0] = keep[S.length - 1] = true; const pila = [[0, S.length - 1]];
      while(pila.length){ const [a, b] = pila.pop(); let dm = 0, im = -1; const A = X[a], B = X[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
        for(let i=a + 1; i<b; i++){ const d = Math.abs(dy*(X[i].x - A.x) - dx*(X[i].y - A.y))/L; if(d>dm){ dm = d; im = i; } }
        if(dm>tol){ keep[im] = true; pila.push([a, im], [im, b]); } }
      return S.filter((t, i)=>keep[i]); };
    let tol = 10, V = dp(tol); while(V.length>150 && tol<200){ tol *= 1.5; V = dp(tol); }
    const geo = (lat, lon)=>({tipo:'GEO', lat:Math.abs(lat).toFixed(6), lon:Math.abs(lon).toFixed(6), norte:lat>0 || undefined, este:lon>0 || undefined});
    let L2 = V.map(t=>Object.assign(geo(t[0], t[1]), {nombre:'', ev:false, t:t[2], la:t[0], lo:t[1]}));
    // puntos de control a los que se llegó, en su lugar por la hora; se quitan los quiebres a menos de 25 m de ellos
    const P = plan(m);
    // solo si el recorrido pasó de verdad a menos de 60 m (v0.99.16: un punto marcado a mano o estimado por el que no se pasó metía un
    // desvío que nunca se caminó); su lugar en la ruta es el momento en que el recorrido pasó más cerca (el de hora más parecida si pasó 2 veces)
    if(P && ej.llegadas) P.pts.forEach((p, k)=>{ const h0 = ej.llegadas[k]; if(!(h0>0) || !p.ev || k===0 || k===P.pts.length - 1) return;
      const px = p.lon*kx, py = p.lat*ky; let h = null;
      S.forEach((t, i)=>{ if(Math.hypot(X[i].x - px, X[i].y - py)<=60 && (h===null || Math.abs(t[2] - h0)<Math.abs(h - h0))) h = t[2]; });
      if(h===null) return;
      const o = m.puntos[p.i] || {}, pc = Object.assign(geo(p.lat, p.lon), {nombre:o.nombre || p.nombre || '', clave:o.clave || '', cota:o.cota===undefined ? '' : o.cota, cotaAuto:true, ev:true, t:h, la:p.lat, lo:p.lon, pc:true});
      L2 = L2.filter((q, i)=>i===0 || i===L2.length - 1 || q.pc || Math.hypot((q.lo - p.lon)*kx, (q.la - p.lat)*ky)>25);
      let i = L2.findIndex((q, j)=>j>0 && q.t>=h); if(i<1) i = L2.length - 1; L2.splice(i, 0, pc); });
    L2[0] = Object.assign(L2[0], {nombre:'PIM', ev:true}); L2[L2.length - 1] = Object.assign(L2[L2.length - 1], {nombre:'PTM', ev:true});
    return L2.map(q=>{ const o = Object.assign({}, q); delete o.t; delete o.la; delete o.lo; delete o.pc; if(o.cota===undefined) o.cota = ''; return o; });
  }
  // distancia del recorrido GPS (m), suavizado
  /* Huecos rellenados (v0.99.17, pedido del usuario: «esa línea recta no corresponde»): un tramo sin grabar (más de CORTE.ms y CORTE.m)
     se completa, en este orden: (1) por donde ya se caminó en esta misma marcha (p. ej. se volvió por las mismas calles de la ida): los
     dos extremos del hueco a menos de 60 m de lo grabado antes; (2) por la ruta planificada (los dos extremos a menos de 80 m de ella);
     (3) si no, queda recto (hueco gris). Los puntos agregados van marcados como aproximados (5.º valor = 1, se dibujan de puntos) con la
     hora repartida por distancia. Sirve también para los recorridos grabados antes de la v0.99.13. */
  function rellenar(S, P){
    if(S.length<3) return S;
    const la0 = S[0][0], kx = Math.cos(la0*Math.PI/180)*111320, ky = 110540, d = (a, b)=>Math.hypot((a[1] - b[1])*kx, (a[0] - b[0])*ky);
    const out = [S[0]];
    for(let g=1; g<S.length; g++){ const A = S[g - 1], B = S[g];
      if(!(B[2] - A[2]>CORTE.ms && !B[4] && d(A, B)>CORTE.m)){ out.push(B); continue; }
      let via = null;
      // (1) por lo ya caminado: se deja fuera lo último antes del hueco (que está junto a A por haber llegado ahí)
      let k = out.length - 1; while(k>0 && d(out[k], A)<=60) k--;
      let iA = -1, iB = -1, dA = 60, dB = 60;
      for(let j=0; j<=k; j++){ const a = d(out[j], A), b = d(out[j], B); if(a<=dA){ dA = a; iA = j; } if(b<=dB){ dB = b; iB = j; } }
      if(iA>=0 && iB>=0 && iA!==iB){ const seg = iA<iB ? out.slice(iA, iB + 1) : out.slice(iB, iA + 1).reverse(); via = seg.map(t=>[t[0], t[1]]); }
      // (2) por la ruta planificada
      if(!via && P){ const acum = [0]; for(let j=1; j<P.pts.length; j++) acum[j] = acum[j - 1] + P.pts[j].tramo.dist;
        const proy = q=>{ let m = null; for(let j=1; j<P.pts.length; j++){ const s2 = M.sobreTramo({lat:q[0], lon:q[1]}, P.pts[j - 1], P.pts[j]); if(s2.d<=80 && (!m || s2.d<m.d)) m = {j, t:s2.t, d:s2.d, a:acum[j - 1] + s2.t*P.pts[j].tramo.dist}; } return m; };
        const a = proy(A), b = proy(B);
        if(a && b && a.a!==b.a){ via = []; if(a.a<b.a){ for(let j=a.j; j<b.j; j++) via.push([P.pts[j].lat, P.pts[j].lon]); } else { for(let j=a.j - 1; j>=b.j; j--) via.push([P.pts[j].lat, P.pts[j].lon]); } } }
      if(via && via.length){ const pts = [[A[0], A[1]]].concat(via, [[B[0], B[1]]]); let L = 0; const c = [0]; for(let i=1; i<pts.length; i++){ L += d(pts[i], pts[i - 1]); c.push(L); }
        for(let i=1; i<pts.length - 1; i++) out.push([pts[i][0], pts[i][1], Math.round(A[2] + (B[2] - A[2])*(L ? c[i]/L : 0)), 15, 1]);
        out.push(Object.assign(B.slice(), {4:1})); }
      else out.push(B); }
    return out;
  }
  // el recorrido listo para usar: suavizado y con los huecos rellenados
  const limpio = (T, m)=>rellenar(suavizar(T || []), m ? plan(m) : null);
  function distGps(T, m){ const S = limpio(T, m); let d = 0; for(let i=1; i<S.length; i++) d += M.sobreTramo({lat:S[i][0], lon:S[i][1]}, {lat:S[i - 1][0], lon:S[i - 1][1]}, {lat:S[i - 1][0], lon:S[i - 1][1]}).d; return d; }
  // cortes: más de 2 min sin lecturas y más de 150 m de salto (pantalla apagada, app cerrada): no se une con una línea recta
  // aprox = true: solo los pedazos completados por la ruta (pantalla apagada); false: solo lo grabado
  function cortar(S, aprox){ const L2 = [[]]; S.forEach((t, i)=>{ const u = S[i - 1]; if(!u) return;
      const hueco = t[2] - u[2]>CORTE.ms && !t[4] && M.sobreTramo({lat:t[0], lon:t[1]}, {lat:u[0], lon:u[1]}, {lat:u[0], lon:u[1]}).d>CORTE.m;
      if(hueco || !!(t[4] || 0)!==!!aprox){ if(L2[L2.length - 1].length) L2.push([]); return; }
      const c = L2[L2.length - 1]; if(!c.length) c.push([u[0], u[1]]); c.push([t[0], t[1]]); }); return L2.filter(x=>x.length>1); }
  function huecos(S){ const H = []; S.forEach((t, i)=>{ const u = S[i - 1];
      if(u && t[2] - u[2]>CORTE.ms && !t[4] && M.sobreTramo({lat:t[0], lon:t[1]}, {lat:u[0], lon:u[1]}, {lat:u[0], lon:u[1]}).d>CORTE.m) H.push([[u[0], u[1]], [t[0], t[1]]]); }); return H; }
  function partes(m, P){
    P = P || plan(m); const E = m.ejec, T0 = (E && E.track) || [], T = rellenar(suavizar(T0), P), hu = huecos(T), todo = cortar(T), tA = cortar(T, true);
    const sal = (ida, reg, ia, ra)=>({ida, reg, idaA:ia || tA, regA:ra || [], huecos:hu});
    if(!P || T.length<2) return sal(todo, []);
    let r = P.pts.findIndex(p=>/^Regreso/.test(p.obs || '')) - 1;
    if(r<1){ let dm = 0; P.pts.forEach((p, j)=>{ const d = M.rumboEntre(P.pts[0], p, P.R.zona, 0).dist; if(d>dm){ dm = d; r = j; } }); }
    if(!(r>=1 && r<P.pts.length - 1)) return sal(todo, []);
    let tR = null; for(let j=r; j<P.pts.length && tR===null; j++) if(E.llegadas[j]>0) tR = E.llegadas[j];
    if(tR===null) return sal(todo, []);
    const i = T.findIndex(t=>t[2]>=tR); if(i<0) return sal(todo, []);
    // se unen en el último punto antes de empezar el regreso
    return i<1 ? sal([], todo, [], tA) : sal(cortar(T.slice(0, i)), cortar(T.slice(i - 1)), cortar(T.slice(0, i), true), cortar(T.slice(i - 1), true));
  }

  /* ---------- pantalla apagada (v0.99.13, pedido del usuario: «¿puede hacerlo aproximando?») ----------
     Con la pantalla apagada el iPhone no le da el GPS a una app web. Al volver a grabar más adelante (más de 2 min y 150 m después), si
     la posición está sobre la ruta, el tramo sin registro se completa POR LA RUTA PLANIFICADA (puntos del recorrido marcados como
     aproximados, 5.º valor = 1) y los puntos por los que se pasó reciben una hora ESTIMADA, repartiendo el tiempo según la distancia
     (`E.estim[k] = 1`). Si la ruta pasa dos veces por el mismo lugar (ida y regreso), se elige la pasada que calza con el tiempo
     transcurrido a la velocidad que se traía. Si no está sobre la ruta, queda como hueco (línea gris de puntos). */
  const CORTE = {ms:120000, m:150};   // sin lecturas por más de 2 min y 150 m de salto (las pruebas lo achican)
  function reconstruir(m, E, u){
    const P = plan(m), k = P && siguiente(m, P); if(k===null || k===undefined || !P) return;
    const acum = [0]; for(let j=1; j<P.pts.length; j++) acum[j] = acum[j - 1] + P.pts[j].tramo.dist;
    const ul = {lat:u[0], lon:u[1]}, s0 = M.sobreTramo(ul, P.pts[k - 1], P.pts[k]), d1 = acum[k - 1] + s0.t*P.pts[k].tramo.dist;
    const v = (velAhora() || (P.R.res.marcha>0 ? P.R.res.dist/1000/P.R.res.marcha : 4))*1000/3600, dEsp = d1 + v*(pos.t - u[2])/1000;
    let mejor = null; const lim = Math.max(80, 2*(pos.acc || 0));
    for(let j=k; j<P.pts.length; j++){ const s = M.sobreTramo(pos, P.pts[j - 1], P.pts[j]); if(s.d>lim) continue;
      const d2 = acum[j - 1] + s.t*P.pts[j].tramo.dist; if(d2<=d1) continue;
      if(!mejor || Math.abs(d2 - dEsp)<Math.abs(mejor.d2 - dEsp)) mejor = {j, d2}; }
    if(!mejor) return;
    const t1 = u[2], t2 = pos.t, hora = d=>Math.round(t1 + (t2 - t1)*(d - d1)/(mejor.d2 - d1)), pas = [];
    for(let i=k; i<mejor.j; i++){ const h = hora(acum[i]); E.track.push([+P.pts[i].lat.toFixed(6), +P.pts[i].lon.toFixed(6), h, 15, 1]);
      if(!E.llegadas[i]){ E.llegadas[i] = h; (E.estim = E.estim || {})[i] = 1; if(P.pts[i].ev) pas.push(rotulo(P.pts[i]) + ' ≈' + hh(h)); } }
    const s2 = M.sobreTramo(pos, P.pts[mejor.j - 1], P.pts[mejor.j]), f = s2.t, a = P.pts[mejor.j - 1], b = P.pts[mejor.j];
    E.track.push([+(a.lat + (b.lat - a.lat)*f).toFixed(6), +(a.lon + (b.lon - a.lon)*f).toFixed(6), t2 - 1, 15, 1]);
    if(pas.length) A.aviso('📴 Con la pantalla apagada pasaste por ' + pas.join(', ') + ' (horas estimadas)');
  }

  /* ---------- puntos saltados (v0.99.10, pedido del usuario tras la prueba en terreno) ----------
     Una ruta puede no hacerse completa, saltarse puntos o juntarse antes (o por otro rumbo) con el regreso. Si se llega a un punto más
     adelante de la ruta, se marca la llegada y los anteriores quedan «saltados» (llegadas = −1). No cuentan los puntos que están en el
     mismo lugar que el último marcado (ida y regreso por el mismo punto, PIM = PTM), para no saltar al regreso al pasar por la ida. */
  function ultimoLugar(m, P){ const E = m.ejec; let u = 0; for(let j=1; j<P.pts.length; j++) if(E.llegadas[j]>0) u = j; return P.pts[u]; }
  function adelante(m, P, k, rad){
    const u = ultimoLugar(m, P);
    for(let j=k + 1; j<P.pts.length; j++){ const q = P.pts[j];
      if(M.rumboEntre(pos, q, P.R.zona, 0).dist<=Math.min(rad, 40) && M.rumboEntre(u, q, P.R.zona, 0).dist>80) return j; }
    return null; }
  // marca como saltados los puntos anteriores a j que faltan; auto = se llegó a j (GPS), si no se elige seguir hacia j
  function saltar(j, auto){
    const m = A.actual(), E = m.ejec, P = plan(m), sal = [];
    for(let i=1; i<j; i++) if(!E.llegadas[i]){ E.llegadas[i] = -1; if(P.pts[i].ev) sal.push(rotulo(P.pts[i])); }
    E.saltos = (E.saltos || []).concat([{t:ahora(), hasta:j, pts:sal}]);
    if(sal.length) A.aviso('⤼ Saltados: ' + sal.join(', ') + (auto ? '' : ' — sigues hacia ' + (rotulo(P.pts[j]) || 'el punto ' + j)));
    if(auto) llegar(j, true); else { A.guardar(); pintar(); }
  }
  // elegir a mano desde qué punto se sigue (Más → Seguir desde otro punto)
  function elegirDesde(){
    const m = A.actual(), P = plan(m), k = siguiente(m, P); if(k===null) return;
    const lista = P.pts.map((p, j)=>({p, j})).filter(x=>x.j>k && (x.p.ev || x.j===P.pts.length - 1));
    if(!lista.length) return A.aviso('No quedan puntos más adelante');
    A.dialogo(`<h3>⤼ Seguir desde otro punto</h3><p class="nota">Si la patrulla se salta puntos o se une antes al regreso: elige hacia qué punto sigue.
        Los anteriores quedan como <b>saltados</b> en la matriz y en el resultado. (Si el GPS te ve llegar a un punto más adelante, lo hace solo.)</p>
      <div class="s-mas">${lista.map(x=>`<button class="btn" data-dj="${x.j}">${A.esc(rotulo(x.p) + (x.p.clave && x.p.nombre ? ' (' + x.p.nombre + ')' : ''))} · plan ${hh(m.ejec.inicio + x.p.lleg*36e5)}${/^Regreso/.test(x.p.obs || '') ? ' · regreso' : ''}</button>`).join('')}</div>
      <div class="btns"><button class="btn" data-cerrar>Cancelar</button></div>`, d=>d.querySelectorAll('[data-dj]').forEach(b=>b.onclick = ()=>{ A.cerrarDialogo(); saltar(+b.dataset.dj, false); }));
  }
  function alto(){
    const m = A.actual(), E = m.ejec;
    if(E.estado==='alto'){ const a = E.altos[E.altos.length - 1]; a.fin = ahora(); E.estado = 'marcha'; A.guardar(); A.aviso('▶ Se reanuda la marcha (alto de ' + dur(a.fin - a.ini) + ')'); return pintar(); }
    const mot = lineas('motivosAlto', 'Alto horario\nComida\nLesionado');
    A.dialogo(`<h3>⏸ Alto</h3><p class="nota">¿Motivo del alto?</p>
      <div class="btns">${mot.map(x=>`<button class="btn" data-mot="${A.esc(x)}">${A.esc(x)}</button>`).join('')}</div>
      <div class="campos" style="margin-top:10px"><label class="c ancho">Otro motivo<input id="aOtro" placeholder="escribir…"></label></div>
      <div class="btns"><button class="btn pri" id="aOk">Registrar otro motivo</button><button class="btn" data-cerrar>Cancelar</button></div>`, d=>{
      const poner = motivo=>{ if(!motivo) return;
        E.altos.push({ini:ahora(), fin:null, motivo, lat:pos && pos.lat, lon:pos && pos.lon}); E.estado = 'alto';
        A.cerrarDialogo(); A.guardar(); if(!/^alto horario$/i.test(motivo)) mensaje('ALTO', {mot:motivo}); pintar(); };
      d.querySelectorAll('[data-mot]').forEach(b=>b.onclick = ()=>poner(b.dataset.mot));
      d.querySelector('#aOk').onclick = ()=>poner(d.querySelector('#aOtro').value.trim()); });
  }
  function novedad(){
    A.dialogo(`<h3>⚠ Novedad</h3>
      <div class="btns" style="margin:0 0 8px">${lineas('novedades', 'Lesionado\nRuta cortada').map(x=>`<button class="btn mini" data-nv="${A.esc(x)}">${A.esc(x)}</button>`).join('')}</div>
      <textarea id="nTxt" placeholder="Toca una novedad preparada o escribe…" style="font-family:var(--sans);font-size:15px"></textarea>
      <div class="btns"><button class="btn pri" id="nOk">Registrar y preparar mensaje</button><button class="btn" data-cerrar>Cancelar</button></div>`, d=>{
      d.querySelectorAll('[data-nv]').forEach(b=>b.onclick = ()=>{ const t = d.querySelector('#nTxt'); t.value = t.value.trim() ? t.value.trim() + ' — ' + b.dataset.nv : b.dataset.nv + ': '; t.focus(); });
      d.querySelector('#nOk').onclick = ()=>{ const t = d.querySelector('#nTxt').value.trim(); if(!t) return;
        const E = A.actual().ejec; E.nov.push({t:ahora(), txt:t, lat:pos && pos.lat, lon:pos && pos.lon}); A.guardar();
        mensaje('NOV', {txt:t}); A.cerrarDialogo(); pintar(); verMensaje(); }; });
  }
  function terminar(auto){
    const m = A.actual(), E = m.ejec; if(!E) return;
    const fin = ()=>{ if(E.estado==='alto'){ E.altos[E.altos.length - 1].fin = ahora(); } E.estado = 'fin'; E.fin = ahora();
      pararGps(); pantalla(false); mensaje('FIN', {}); A.guardar(); pintar(); };
    if(auto) return fin();
    const P = plan(m), falta = P ? P.pts.filter((p, j)=>j && p.ev && !E.llegadas[j]).map(rotulo) : [];
    // terminar y guardar, o descartar (v0.99.19, pedido del usuario: si se termina antes por algo, que no quede registrada)
    A.dialogo(`<h3>¿Terminar la marcha?</h3><p class="nota">Se detiene el GPS.${falta.length ? ' Faltan ' + falta.length + ' punto(s) (' + A.esc(falta.join(', ')) + '): quedan como no alcanzados.' : ''}</p>
      <div class="s-mas"><button class="btn pri" id="dSi">${ic('fin', 'Terminar y guardar el registro')}</button>
        <button class="btn peligro" id="dDesc">🗑 Terminar y descartar: no queda registrada</button><button class="btn" data-cerrar>Seguir marchando</button></div>`, d=>{
      d.querySelector('#dSi').onclick = ()=>{ A.cerrarDialogo(); fin(); };
      d.querySelector('#dDesc').onclick = ()=>{ A.cerrarDialogo(); setTimeout(()=>descartar(m), 200); }; });
  }

  // borrar el registro de esta ejecución (horas, altos, novedades, recorrido GPS) sin guardarlo en «Recorridos anteriores»
  function descartar(m){
    A.confirmar('¿Descartar esta marcha? Se borran las horas, los altos, las novedades y el recorrido GPS de esta vez; no queda en el resultado ni en los recorridos guardados. Los mensajes ya enviados al C2 no se pueden retirar.', ()=>{
      const E = m.ejec; if(E && E.estado!=='fin'){ pararGps(); pantalla(false); } irSolo = null;
      delete m.ejec; A.guardar(); A.aviso('🗑 Marcha descartada: no quedó registrada'); pintar(); });
  }

  /* ---------- mensajes para el C2 ---------- */
  function utmTxt(p){ const m = A.actual(), d = m.datum || 'WGS84', g = M.deWgs84(p.lat, p.lon, 0, d), u = M.llAUtm(g.lat, g.lon, +m.zona || undefined, M.DATUMS[d]);
    return u.zona + M.banda(g.lat) + ' ' + Math.round(u.e) + ' E ' + Math.round(u.n) + ' N'; }
  function mensaje(k, d){
    const m = A.actual(), E = m.ejec, P = plan(m), at = atraso(m, P), quien = '«' + (m.nombre || 'marcha') + '»' + (m.unidad ? ' (' + m.unidad + ')' : '');
    const donde = pos ? ' — posición ' + utmTxt(pos) : '';
    const txt = ({INI:'INICIO DE MARCHA ' + (P.pts[0].clave ? P.pts[0].clave + ' (' + P.pts[0].nombre + ') — ' : '') + quien + ' ' + hh(E.inicio),
      PC:verbo() + ' ' + (d.clave || d.pc) + ' — ' + quien + ' ' + d.h + ' (' + difCorta(d.dif) + ' respecto del plan)' + (d.clave ? ' [' + d.pc + ']' : ''),
      ALTO:'ALTO NO PLANIFICADO ' + quien + ' — ' + d.mot,
      NOV:'NOVEDAD ' + quien + ' — ' + d.txt,
      POS:'POSICIÓN ' + quien + (at===null ? '' : ' — ' + dif(at)),
      FIN:'FIN DE MARCHA ' + quien + ' ' + hh(E.fin || ahora()) + ' — duración ' + dur((E.fin || ahora()) - E.inicio)})[k] + donde;
    const datos = Object.assign({n:m.nombre, u:m.unidad, h:ahora()}, d, pos ? {lat:+pos.lat.toFixed(6), lon:+pos.lon.toFixed(6), acc:Math.round(pos.acc||0)} : {}, at!==null ? {atr:Math.round(at)} : {});
    // uso civil: texto simple para el contacto (sin código del C2); en posición, enlace al mapa
    const msg = Uso.civil() ? Uso.salida(txt) + (pos ? '\nhttps://maps.google.com/?q=' + pos.lat.toFixed(5) + ',' + pos.lon.toFixed(5) : '') : Uso.salida(txt) + '\n' + BDC.codigo(k==='INI' ? 'POS' : k, datos);
    E.msgs = (E.msgs || []).concat([{t:ahora(), k, msg}]).slice(-50); A.guardar();
    return msg;
  }
  function verMensaje(msg){
    const E = A.actual().ejec; msg = msg || (E.msgs && E.msgs.length ? E.msgs[E.msgs.length - 1].msg : null); if(!msg) return;
    const cod = msg.split('\n')[1];
    A.dialogo(`<h3>📡 Mensaje para el C2</h3><div class="mensaje">${A.esc(msg)}</div>
      <div class="btns"><button class="btn pri" id="mCop">📋 Copiar</button>${navigator.share ? '<button class="btn" id="mComp">↗ Compartir</button>' : ''}${Uso.civil() ? '' : '<button class="btn" id="mQr">▦ QR</button>'}<button class="btn" data-cerrar>Cerrar</button></div><div id="mQrC"></div>`, d=>{
      d.querySelector('#mCop').onclick = ()=>A.copiar(msg);
      if(d.querySelector('#mComp')) d.querySelector('#mComp').onclick = ()=>navigator.share({text:msg}).catch(()=>{});
      if(d.querySelector('#mQr')) d.querySelector('#mQr').onclick = ()=>{ const q = qrcode(0, 'L'); q.addData(cod, 'Byte'); q.make(); d.querySelector('#mQrC').innerHTML = `<div class="qr">${q.createSvgTag({cellSize:4, margin:2, scalable:true})}</div>`; }; });
  }

  /* ---------- enviar por… (v0.99.10, pedido del usuario): mantener presionado «PASANDO …» marca el paso y ofrece cómo mandarlo ---------- */
  function enviar(msg, titulo){
    if(!msg) return; const cod = msg.split('\n').find(x=>/^#BDC1:/.test(x));
    A.dialogo(`<h3>📡 ${A.esc(titulo || 'Enviar')}</h3><div class="mensaje">${A.esc(msg)}</div>
      <div class="s-mas"><a class="btn pri" id="eWa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <a class="btn" id="eSms" href="sms:${/iPhone|iPad|Mac/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(msg)}">✉ Mensaje de texto (SMS)</a>
        ${navigator.share ? '<button class="btn" id="eComp">↗ Compartir (otras apps)</button>' : ''}<button class="btn" id="eCop">📋 Copiar</button>
        ${cod && !Uso.civil() ? '<button class="btn" id="eQr">▦ QR para el C2</button>' : ''}</div>
      <div id="eQrC"></div><div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`, d=>{
      d.querySelector('#eCop').onclick = ()=>A.copiar(msg);
      if(d.querySelector('#eComp')) d.querySelector('#eComp').onclick = ()=>navigator.share({text:msg}).catch(()=>{});
      if(d.querySelector('#eQr')) d.querySelector('#eQr').onclick = ()=>{ const q = qrcode(0, 'L'); q.addData(cod, 'Byte'); q.make(); d.querySelector('#eQrC').innerHTML = `<div class="qr">${q.createSvgTag({cellSize:4, margin:2, scalable:true})}</div>`; }; });
  }
  // la matriz de eventos hasta ahora, en texto para un mensaje
  function textoMatriz(){
    const m = A.actual(), E = m.ejec, P = plan(m); if(!E || !P) return '';
    const L = ['MATRIZ DE EVENTOS «' + (m.nombre || 'marcha') + '»' + (m.unidad ? ' (' + m.unidad + ')' : '') + ' — ' + hh(ahora())];
    eventos(m, P).forEach(x=>L.push((x.real ? (x.est ? '≈' : '') + hh(x.t) + (x.est ? ' (estimada)' : '') : '(' + hh(x.plan) + ')') + ' ' + x.ev + (x.salta ? ' — SALTADO' : !x.real && x.tipo==='pc' ? ' — pendiente' : '') + (x.dif!==null && x.dif!==undefined && x.real ? ' (' + difCorta(x.dif) + ')' : '')));
    if(pos) L.push('Posición ' + utmTxt(pos));
    return Uso.salida(L.join('\n'));
  }
  function pasandoYEnviar(){
    const m = A.actual(), E = m.ejec, P = plan(m); if(!E || E.estado==='fin' || E.desvio) return;
    const k = proxEv(m, P), tl = k!==null ? verbo() + ' ' + rotulo(P.pts[k]) : '';
    A.dialogo(`<h3>📡 Enviar</h3><div class="s-mas">${k!==null ? `<button class="btn pri" id="ePas">✔ ${A.esc(tl)}: marcar y enviar</button>` : ''}
        <button class="btn" id="eMat">${ic('lista', 'Enviar la matriz completa (sin marcar)')}</button><button class="btn" id="ePos">${ic('pos', 'Enviar mi posición (sin marcar)')}</button></div>
      <div class="btns"><button class="btn" data-cerrar>Cancelar</button></div>`, d=>{
      if(d.querySelector('#ePas')) d.querySelector('#ePas').onclick = ()=>{ A.cerrarDialogo(); llegar(k, false, true);
        const x = (A.actual().ejec.msgs || []).filter(y=>y.k==='PC').pop(); if(x) setTimeout(()=>enviar(x.msg, tl), 250); };
      d.querySelector('#eMat').onclick = ()=>{ A.cerrarDialogo(); setTimeout(()=>enviar(textoMatriz(), 'Matriz de eventos'), 250); };
      d.querySelector('#ePos').onclick = ()=>{ A.cerrarDialogo(); setTimeout(()=>enviar(mensaje('POS', {}), 'Posición'), 250); }; });
  }

  /* ---------- pantalla ---------- */
  function abrir(cont, api){
    A = api; cerrarMapa();
    const m = A.actual(), E = m && m.ejec;
    decMarcha = null; flechaAcum = null;
    if(E && E.estado!=='fin'){ iniciarGps(); pantalla(true); }
    cont.innerHTML = '<div id="seguir"></div>';
    // la brújula (v0.99.27): al volver a la app con la marcha o la navegación en curso se enciende sola; el iPhone pide un toque para el
    // permiso, así que también se enciende con el primer toque en la pantalla
    if((E && E.estado!=='fin') || irSolo){ brujula(); cont.addEventListener('pointerdown', ()=>{ if(!rumboDisp) brujula(); }, {once:true}); }
    if(pedirIrA){ pedirIrA = false; pintar(); setTimeout(()=>dialogoIrA(!!(E && E.estado!=='fin')), 300); return; }
    if(pendiente){ const d = pendiente; pendiente = null; const en = !!(E && E.estado!=='fin'); if(en) modo = 'carta'; empezarIrA(d, en, en ? 'volver' : 'solo'); return; }
    pintar();
  }
  // tres formas de ver la marcha en curso: carta (mapa a pantalla completa), navegación (números grandes) y registro
  let modo = 'carta'; try { modo = localStorage.getItem('burros_seguir') || 'carta'; } catch(e){}
  const MODOS = [['nav', 'Datos'], ['carta', 'Carta'], ['atak', 'ATAK'], ['reg', 'Matriz']];
  let panelOculto = false; try { panelOculto = localStorage.getItem('burros_panel')==='1'; } catch(e){}
  function pintar(){
    const c = $('#seguir'); if(!c) return; const m = A.actual(), P = m ? plan(m) : null, E = m && m.ejec;
    cerrarMapa(); document.body.classList.remove('con-mapa');
    if(irSolo && (!E || E.estado==='fin')) return pintarSolo(c, P);
    if(!P) return pintarSinRuta(false);
    if(!E){ // antes de partir: la carta a pantalla completa con el plan encima y el botón de inicio abajo
      document.body.classList.add('con-mapa');
      c.innerHTML = `<div class="mapa-env s-carta s-previo"><div id="sMapa"></div>
        <div class="s-hud" id="sPrevio"></div>
        <div class="s-ctrl">${modoVistaBtn()}<button class="btn" id="sOrient" title="Norte arriba o destino arriba" aria-label="Orientación"></button><button class="btn" id="sCapa" title="Cambiar el mapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" title="Centrar en mi posición" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>
        <div class="s-pie"><div class="s-ini"><button class="btn pri grande" id="sIni">▶ Iniciar marcha</button><button class="btn" id="sIrSolo">🧭 Ir a un punto</button></div>
          <p class="s-ayuda">Mantén la app abierta y la pantalla encendida durante la marcha. Las llegadas a cada evento se marcan solas a menos de 40 m.</p></div></div>`;
      $('#sIni').onclick = iniciar; $('#sIrSolo').onclick = ()=>dialogoIrA(false);
      pintarPrevio(); hacerMapa(P); centrar = false;
      iniciarGps(); pintarPrevio(); return;
    }
    if(E.estado==='fin') return pintarFin(c, m, P);
    const sel = `<div class="seg s-modos">${MODOS.map(([k, n])=>`<button data-smodo="${k}" class="${modo===k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const des = !!E.desvio, bAlto = `<button class="btn ${E.estado==='alto' ? 'pri' : ''}" id="sAlto">${E.estado==='alto' ? ic('seguir', 'Reanudar') : ic('alto', 'Alto')}</button>`;
    const bIr = `<button class="btn${des ? ' pri' : ''}" id="sIrA">${des ? ic('x', 'Cancelar') : ic('ira', 'Ir a')}</button>`;
    const acc = `<div class="s-acc">
        <button class="btn pri" id="sLleg"></button>${bAlto}
        <button class="btn" id="sNov">${ic('nov', 'Novedad')}</button>${bIr}
        <button class="btn" id="sPos">${ic('pos', 'Posición')}</button>
        <button class="btn" id="sHor">${ic('horiz', 'Horizonte')}</button>
        <button class="btn peligro" id="sFin">${ic('fin', 'Terminar')}</button>
      </div>`;
    if(modo==='carta'){
      // carta (v0.97, pedido del usuario): datos en una barra pegada arriba y botones en otra abajo; la ruta queda libre al centro; flecha grande
      document.body.classList.add('con-mapa');
      c.innerHTML = `<div class="mapa-env s-carta s-dos"><div id="sMapa"></div>
        <div class="s-bsup${plegada ? ' plegada' : ''}" id="sCab" title="Tocar para achicar o agrandar"></div>
        <div class="s-flecha s-flecha-g" id="sFlecha" title="Hacia el próximo punto, según la brújula del teléfono">${punteroCarta}</div>
        <div class="s-ctrl">${modoVistaBtn()}<button class="btn" id="sOrient" title="Norte arriba o destino arriba" aria-label="Orientación"></button><button class="btn" id="sCapa" title="Cambiar el mapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" title="Centrar en mi posición" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>
        <div class="s-binf"><button class="btn pri" id="sLleg"></button>${bAlto}<button class="btn" id="sNov">${ic('nov', 'Novedad')}</button>${bIr}<button class="btn" id="sMas">${ic('mas', 'Más')}</button><button class="btn peligro" id="sFin">${ic('fin', 'Fin')}</button></div></div>`;
    } else if(modo==='atak'){
      // tipo ATAK: carta completa; datos y botones en un panel a la derecha que se oculta con la pestaña; PASANDO siempre a la vista
      document.body.classList.add('con-mapa');
      c.innerHTML = `<div class="mapa-env s-carta s-atak${panelOculto ? ' oculto' : ''}"><div id="sMapa"></div>
        <div class="s-franja" id="sFranja"></div>
        <div class="s-panel"><div class="s-pcab" id="sCab"></div><div class="s-pbtn">${bAlto}${bIr}<button class="btn" id="sMas">${ic('mas', 'Más')}</button><button class="btn peligro" id="sFin">${ic('fin', 'Fin')}</button></div></div>
        <button class="s-pest" id="sPest" aria-label="Mostrar u ocultar los datos"></button>
        <div class="s-flecha s-flecha-g" id="sFlecha" title="Hacia el próximo punto, según la brújula del teléfono">${punteroCarta}</div>
        <div class="s-ctrl">${modoVistaBtn()}<button class="btn" id="sOrient" title="Norte arriba o destino arriba" aria-label="Orientación"></button><button class="btn" id="sCapa" title="Cambiar el mapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" title="Centrar en mi posición" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>
        <button class="btn pri s-pasando" id="sLleg"></button></div>`;
    } else if(modo==='nav'){
      // en vertical: selector, datos y botones uno debajo del otro; en horizontal (v0.99.26, pedido del usuario): datos a la izquierda y
      // selector y botones en una columna a la derecha, para que todo quepa sin desplazar la pantalla
      c.innerHTML = `<div class="s-nav"><div class="s-nav-d"><div class="tarjeta" id="sCab"></div></div><div class="s-nav-b">${sel}<div class="tarjeta s-avc" id="sAvance"></div>${acc}</div></div>`;
    } else {
      c.innerHTML = `${sel}<h2>Matriz de eventos</h2>
        <p class="nota">Todos los eventos de la marcha en orden: los planificados (paso por cada punto con su nombre clave y hora prevista) y lo que va ocurriendo
          (hora real, diferencia con el plan, altos, novedades y posición). Lo pendiente se ve en gris.</p>
        <div id="sFicha"></div>${acc}`;
    }
    c.querySelectorAll('[data-smodo]').forEach(b=>b.onclick = ()=>cambiarModo(b.dataset.smodo));
    $('#sAlto').onclick = alto; const bnv = $('#sNov'); if(bnv) bnv.onclick = novedad; $('#sFin').onclick = ()=>terminar(false);
    const bp = $('#sPos'), bh = $('#sHor'), bm = $('#sMas'); if(bp) bp.onclick = ()=>verMensaje(mensaje('POS', {})); if(bh) bh.onclick = horizonte; if(bm) bm.onclick = menuMas;
    $('#sIrA').onclick = ()=>{ if(E.desvio) return A.confirmar('¿Cancelar el desvío y volver a seguir la ruta?', ()=>{ terminarDesvio(true); }); dialogoIrA(true); };
    { const b = $('#sLleg'); let tm = null; b.oncontextmenu = e=>e.preventDefault();
      b.addEventListener('pointerdown', ()=>{ clearTimeout(tm); tm = setTimeout(()=>{ tm = null; b.dataset.largo = '1'; if(navigator.vibrate) navigator.vibrate(40); pasandoYEnviar(); }, 650); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t=>b.addEventListener(t, ()=>{ clearTimeout(tm); tm = null; })); }
    $('#sLleg').onclick = e=>{ const b = e.currentTarget; if(b.dataset.largo){ delete b.dataset.largo; return; } if(b.dataset.ocupado) return; b.dataset.ocupado = '1'; setTimeout(()=>{ delete b.dataset.ocupado; }, 1500);   // sin doble toque
      if(E.desvio) return llegarDesvio(false); const k = proxEv(m, P); if(k!==null) llegar(k, false); };
    if(modo==='atak'){ centrar = true; hacerMapa(P); const pe = $('#sPest'), env = c.querySelector('.s-atak');
      const pp = ()=>{ pe.innerHTML = panelOculto ? '‹' : '›'; env.classList.toggle('oculto', panelOculto); };
      pp(); pe.onclick = ()=>{ panelOculto = !panelOculto; try { localStorage.setItem('burros_panel', panelOculto ? '1' : ''); } catch(e){} pp(); setTimeout(()=>{ if(mapa) mapa.invalidateSize({animate:false}); }, 300); }; }
    if(modo==='carta'){ centrar = true; hacerMapa(P);
      $('#sCab').onclick = ()=>{ plegada = !plegada; try { localStorage.setItem('burros_barra', plegada ? '1' : ''); } catch(e){} $('#sCab').classList.toggle('plegada', plegada); pintarVivo(); }; }
    pintarVivo();
  }
  function pintarVivo(){
    const m = A.actual(), E = m && m.ejec; if(!E || E.estado==='fin' || !$('#seguir')) return; const P = plan(m); decMarcha = P.R.decl.valor;
    const k = siguiente(m, P), q = k!==null ? P.pts[k] : null, ke = proxEv(m, P), p = ke!==null ? P.pts[ke] : null, at = atraso(m, P), t = ahora(), c = $('#sCab');
    const O = objetivo(m, P), b = $('#sLleg'), tl = O ? 'Llegué ' + (O.vuelta ? 'a la ruta' : 'a ' + O.nombre) : p ? verbo() + ' ' + rotulo(p) : ''; if(b && b.dataset.t!==tl){ b.dataset.t = tl; b.innerHTML = ic('ok', A.esc(tl)); }
    ficha(); mapaVivo();
    if(!c) return;
    let dist = '—', rumbo = '—', mils = '', fuera = '', eta = '';
    let quiebre = '', fueraD = 0;
    if(p && q && pos){ const r = M.rumboEntre(pos, q, P.R.zona, P.R.decl.valor), dr = distRuta(P, pos, k, ke);
      dist = dr>=1000 ? A.f(dr/1000, 2) + ' km' : A.f(dr) + ' m'; rumbo = A.f(r.azM, 0) + '°'; mils = r.mils + ' ‰'; c.dataset.az = r.azM;
      if(k!==ke) quiebre = 'rumbo al próximo quiebre (' + A.f(r.dist) + ' m) · distancia por la ruta';
      const a = P.pts[k - 1], s = M.sobreTramo(pos, a, q); if(s.d>Math.max(120, 3*(pos.acc||0))){ fuera = `<div class="alerta">Fuera de la ruta: ${A.f(s.d)} m de la línea</div>`; fueraD = s.d; } }
    // desvío («Ir a…»): la distancia y el rumbo son al destino, en línea recta
    if(O){ quiebre = ''; fuera = ''; if(O.dist!==null){ dist = O.dist>=1000 ? A.f(O.dist/1000, 2) + ' km' : A.f(O.dist) + ' m'; rumbo = A.f(O.az, 0) + '°'; mils = O.mils + ' ‰'; c.dataset.az = O.az; } else { dist = '—'; rumbo = '—'; mils = ''; } }
    const fl = $('#sFlecha'); if(fl) fl.classList.toggle('desvio', !!O);
    if(p) eta = 'llega plan ' + hh(E.inicio + p.lleg*3600000) + (at!==null ? ' · estimada ' + hh(E.inicio + p.lleg*3600000 + at*60000) : '');
    const ultAlto = E.estado==='alto' ? E.altos[E.altos.length - 1] : null, cls = at===null ? '' : at>5 ? 'mal' : at< -5 ? 'bien' : '';
    const gps = pos ? 'GPS ±' + Math.round(pos.acc||0) + ' m · ' + utmTxt(pos) : (navigator.geolocation ? 'Esperando señal GPS…' : 'Este equipo no tiene GPS: marca las llegadas a mano');
    const enAlto = (ultAlto ? `<div class="info">⏸ En alto (${A.esc(ultAlto.motivo)}) desde ${hh(ultAlto.ini)} — ${dur(t - ultAlto.ini)}</div>` : '') + (intervalo(m, P) || '');
    if(modo==='carta' || modo==='atak'){
      // barra de arriba: próximo (o destino del desvío), distancia, rumbo, ahora, plan y llegada; achicada, una sola línea
      const V = velocidades(m, P, k, ke), cel = (rot, val, sub, cl)=>`<div class="bc"><span>${rot}</span><b class="${cl || ''}">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
      const vk = v=>v>0 && isFinite(v) ? A.f(v, 1) + ' km/h' : '—', rk = v=>v>0 && isFinite(v) ? M.verRitmo(v) : '';
      const atC = at===null ? '' : `<span class="${cls}">${difCorta(at).replace(' min', "'")}</span>`;
      const vel = V.mov || V.ahora || V.plan || 4, llegaO = O && O.dist!==null ? hh(t + O.dist/1000/vel*36e5) : '—';
      const nom = O ? (O.vuelta ? 'VOLVER A LA RUTA' : 'IR A ' + A.esc(O.nombre)) : p ? A.esc(rotulo(p)) : '—';
      const celdas = O ? cel('Desvío', nom, O.modo, 'desv') + cel('Distancia', dist, 'en línea recta') + cel('Rumbo mag.', rumbo, mils, 'ocre')
          + cel('Ahora', V.enAlto ? 'en alto' : vk(V.ahora), V.enAlto ? '' : rk(V.ahora), claseVel(V.ahora, V.plan)) + cel('Llega aprox.', llegaO, 'a ' + vk(vel).replace(' km/h', '') + ' km/h') + cel('La marcha', at===null ? '—' : Math.abs(at)<1 ? 'a la hora' : (at<0 ? '▲ ' : '▼ ') + Math.round(Math.abs(at)) + ' min', at===null || Math.abs(at)<1 ? '' : at<0 ? 'adelantado' : 'atrasado', cls)
        : cel('Próximo', nom, p ? A.esc(p.clave ? p.nombre : p.obs || '') : '', 'clave-tx') + cel('Distancia', dist, quiebre ? 'por la ruta' : '') + cel('Rumbo mag.', rumbo, mils, 'ocre')
          + cel('Ahora', V.enAlto ? 'en alto' : vk(V.ahora), V.enAlto ? '' : rk(V.ahora), claseVel(V.ahora, V.plan)) + cel('Plan del tramo', vk(V.plan), rk(V.plan))
          + cel('Llega', p ? hh(E.inicio + p.lleg*3600000) : '—', at!==null && p ? 'est. ' + hh(E.inicio + p.lleg*3600000 + at*60000) + ' · ' + atC : '');
      // avisos (v0.99.6: tapaban la ruta): una sola línea de fichas pequeñas bajo los datos
      const chips = [intervalo(m, P, true) || '', ultAlto ? `<span class="ch pausa">⏸ Alto: ${A.esc(ultAlto.motivo)} · ${dur(t - ultAlto.ini)}</span>` : '',
        quiebre ? `<span class="ch">↪ ${quiebre.split(' · ')[0]}</span>` : '', fueraD ? `<span class="ch mal">Fuera de la ruta: ${A.f(fueraD)} m</span>` : '', !pos ? `<span class="ch">${navigator.geolocation ? 'Esperando GPS…' : 'Sin GPS'}</span>` : (pos.acc || 0)>30 ? `<span class="ch">GPS ±${Math.round(pos.acc)} m</span>` : ''].filter(Boolean).join('');
      const fila = chips ? `<div class="bchips">${chips}</div>` : '';
      const av = O ? '' : lineaAvance(m, P, E, at);
      if(modo==='atak'){ c.innerHTML = `${av}<div class="pcs">${celdas}</div>${fila}`; const fr = $('#sFranja'); if(fr) fr.innerHTML = `<b class="clave-tx">${nom}</b><span>${dist}</span><b class="ocre">${rumbo}</b>`; }
      else c.innerHTML = plegada ? `<div class="b1">${O ? '🧭 ' : ''}<b>${nom}</b> · ${dist} · <b class="ocre">${rumbo}</b>${at!==null && !O ? ' · ' + atC : ''}<span class="bmas">▾</span></div>${fila}`
        : `<div class="bcs">${celdas}</div>${av}${fila}`;
    } else {
      const sa = $('#sAvance'); if(sa){ const h = O ? '' : lineaAvance(m, P, E, at, true); sa.innerHTML = h; sa.style.display = h ? '' : 'none'; }
      c.innerHTML = `<div class="s-estado"><span>⏱ ${dur(t - E.inicio)} de marcha</span><span class="hud-est ${cls}">${at===null ? '' : dif(at)}</span></div>${enAlto}
        ${p || O ? `<div class="s-prox">${O ? `🧭 <b class="clave-tx">${O.vuelta ? 'VOLVER A LA RUTA' : 'IR A ' + A.esc(O.nombre)}</b><small>${A.esc(O.modo)} · en línea recta</small>` : `PRÓXIMO <b class="clave-tx">${A.esc(rotulo(p))}</b><small>${A.esc(p.clave ? p.nombre + (p.obs ? ' · ' + p.obs : '') : p.obs || '')}</small>`}</div>
        <div class="s-grande"><div><span>Distancia</span><b>${dist}</b></div><div><span>Rumbo mag.</span><b class="ocre">${rumbo}</b><small>${mils}</small></div>
          ${punteroAnillo}</div>
        ${quiebre ? `<div class="nota">↪ ${quiebre}</div>` : ''}` : ''}${velHtml(velocidades(m, P, k, ke), p ? {plan:hh(E.inicio + p.lleg*3600000), est:at!==null ? hh(E.inicio + p.lleg*3600000 + at*60000) : ''} : null)}${fuera}<div class="nota mono" id="sGps">${gps}</div>`;
    }
    flecha();
  }
  /* ---------- vuelta al horizonte en terreno (v0.89): desde la posición GPS (o el último punto pasado), con la línea de la brújula ---------- */
  function horizonte(){
    const m = A.actual(), P = plan(m), E = m.ejec, dec = P.R.decl.valor;
    let desde = pos ? {lat:pos.lat, lon:pos.lon, nombre:'tu posición'} : null;
    if(!desde){ const k = siguiente(m, P), q = P.pts[k===null ? P.pts.length - 1 : Math.max(0, k - 1)]; desde = {lat:q.lat, lon:q.lon, nombre:q.nombre, cota:q.cota}; }
    A.dialogo(`<h3>👁 Vuelta al horizonte desde ${A.esc(desde.nombre)}</h3><p class="nota">Calculando con el modelo de terreno…</p>`);
    Horizonte.calcular(desde.lat, desde.lon, {radio:5000, zs:desde.cota}).then(H=>{
      if(!H) return A.dialogo(`<h3>👁 Vuelta al horizonte</h3><p class="nota">No hay datos del terreno aquí: guarda la zona antes de salir (Mapa → ⬇ Sin señal, con «Curvas de nivel y cota»).</p><div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`);
      // los puntos de referencia guardados en la marcha que estén al alcance, más los cerros que asoman desde aquí
      const R = 6371000, rad = Math.PI/180, azDe = q=>{ const y = Math.sin((q.lon - desde.lon)*rad)*Math.cos(q.lat*rad), x = Math.cos(desde.lat*rad)*Math.sin(q.lat*rad) - Math.sin(desde.lat*rad)*Math.cos(q.lat*rad)*Math.cos((q.lon - desde.lon)*rad); return (Math.atan2(y, x)/rad + 360)%360; };
      const guardados = [].concat(...(m.horizontes || []).map(h=>h.prs)).map(q=>Object.assign({}, q, {az:azDe(q), d:DEM.dist(desde, q)})).filter(q=>q.d<=5000 && q.d>50)
        .map(q=>Object.assign(q, {ang:H.perfil[Math.round(q.az/Horizonte.PASO_AZ)%H.perfil.length].ang}));
      const prs = guardados.concat(H.prs.filter(p=>!guardados.some(q=>Math.abs(q.az - p.az)<3)).map((p, i)=>Object.assign({}, p, {nombre:'Cerro ' + A.f(Math.round(p.z)) + ' m'})));
      const mag = az=>((az - dec)%360 + 360)%360;
      A.dialogo(`<h3>👁 Vuelta al horizonte desde ${A.esc(desde.nombre)}</h3>
        <p class="nota">Alcance 5 km. La línea azul es hacia donde miras (brújula del teléfono); el panorama se corre solo. Rumbos magnéticos.</p>
        <div class="horiz-env" id="sHorEnv">${Horizonte.svg(H, prs, dec, {ancho:1440, alto:210, rumbo:null})}</div>
        <div class="tabla-env"><table class="t"><thead><tr><th class="tx">Referencia</th><th>Rumbo mag.</th><th>Distancia</th></tr></thead><tbody>
        ${prs.sort((a, b)=>mag(a.az) - mag(b.az)).map(p=>`<tr><td class="tx"><b>${A.esc(p.nombre)}</b></td><td>${A.f(Math.round(mag(p.az)))}° / ${Math.round(mag(p.az)*6400/360)%6400} ‰</td><td>${Horizonte.fmtD(p.d)}</td></tr>`).join('')}</tbody></table></div>
        <div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`);
      horDec = dec; flecha(); }).catch(()=>A.aviso('No se pudo calcular el horizonte'));
  }
  let horDec = 0;
  // sin brújula, la flecha grande apunta como en la carta (norte geográfico arriba): rumbo magnético + declinación
  // declinación de la marcha, guardada al pintar (v0.99.27: antes se recalculaba toda la marcha en cada lectura de la brújula)
  let decMarcha = null;
  const decPlan = ()=>{ if(irSolo) return decSolo; if(decMarcha!==null) return decMarcha; const m = A && A.actual(), P = m && plan(m); return P ? (decMarcha = P.R.decl.valor) : decSolo; };
  // la flecha gira por el camino corto (v0.99.27: de 359° a 1° daba una vuelta entera por la animación)
  let flechaAcum = null;
  const angFlecha = a=>{ flechaAcum = flechaAcum===null ? ((a%360) + 360)%360 : flechaAcum + ((((a - flechaAcum)%360) + 540)%360 - 180); return +flechaAcum.toFixed(1); };
  // color según cuánto hay que girar (d: -180..180, null sin brújula) y, en el anillo, los grados y el lado; vibra al quedar de frente (Android)
  let estRumbo = '';
  function marcarRumbo(f, d){
    const ab = d===null ? null : Math.abs(d), est = ab===null ? '' : ab < 10 ? 'ok' : ab > 90 ? 'lejos' : 'cerca', cont = f.closest('.s-anillo') || f;
    ['ok', 'cerca', 'lejos'].forEach(k=>cont.classList.toggle('r-' + k, est===k));
    if(est==='ok' && estRumbo && estRumbo!=='ok' && navigator.vibrate) navigator.vibrate(60);
    estRumbo = est;
    const g = $('#sGiro'), gt = $('#sGiroTx'); if(!g) return;
    g.textContent = ab===null ? '—' : Math.round(ab) + '°';
    gt.textContent = ab===null ? 'sin brújula' : ab < 3 ? 'de frente' : d > 0 ? 'a la derecha' : 'a la izquierda';
  }
  function flecha(){
    // panorama del horizonte abierto: mover la línea de la brújula y centrarla
    const g = document.getElementById('hRumbo'), env = document.getElementById('sHorEnv');
    if(g && env && rumboDisp){ const h = rumboDisp.mag ? rumboDisp.h : rumboDisp.h - horDec, x = ((h%360) + 360)%360/360*1440;
      g.setAttribute('transform', 'translate(' + x.toFixed(1) + ',0)'); env.scrollLeft = x - env.clientWidth/2; }
    const f = $('#sFlecha'), c = $('#sCab'); if(!f || !c || c.dataset.az===undefined) return;
    if(!rumboDisp){ f.style.opacity = f.classList.contains('s-flecha-g') ? .9 : .35; if(f.classList.contains('s-flecha-g')) f.style.transform = 'rotate(' + angFlecha(+c.dataset.az + decPlan() - (giro || 0)) + 'deg)'; f.title = 'Sin brújula: apunta con el norte hacia arriba, como la carta'; marcarRumbo(f, null); return; }
    const dec = decPlan(), h = rumboDisp.mag ? rumboDisp.h : rumboDisp.h - dec;
    f.style.opacity = 1; f.style.transform = 'rotate(' + angFlecha(+c.dataset.az - h) + 'deg)'; marcarRumbo(f, ((((+c.dataset.az - h)%360) + 540)%360) - 180);
    if(orient==='brujula' && mapa && giro!==null && !explorando){ const g = rumboGeo(); if(Math.abs((((g - giro)%360) + 540)%360 - 180)>2) girar(g); }
  }
  // matriz de eventos: eventos planificados (paso por cada punto) y reales (inicio, pasos, altos, novedades, fin) en orden de hora
  function eventos(m, P){ const E = m.ejec, ev = [];
    const posTxt = (la, lo)=>la===undefined || la===null ? '' : utmTxt({lat:la, lon:lo});
    ev.push({t:E.inicio, real:true, ev:'Inicio de marcha' + (P.pts[0].clave ? ' — ' + P.pts[0].clave : ''), punto:P.pts[0].nombre, plan:E.inicio, dif:0, tipo:'ini'});
    P.pts.forEach((p, k)=>{ if(!k || !p.ev) return; const r = E.llegadas[k], pl = E.inicio + p.lleg*3600000;
      ev.push({t:r>0 ? r : pl, real:r>0, ev:verbo() + ' ' + rotulo(p), punto:p.nombre, plan:pl, dif:r>0 ? (r - pl)/60000 : null, salta:r===-1, est:!!(E.estim && E.estim[k]), tipo:'pc'}); });
    E.altos.forEach(a=>ev.push({t:a.ini, real:true, ev:'Alto — ' + a.motivo + (a.fin ? ' (' + dur(a.fin - a.ini) + ')' : ' (en curso)'), pos:posTxt(a.lat, a.lon), tipo:'alto'}));
    E.nov.forEach(n=>ev.push({t:n.t, real:true, ev:'Novedad — ' + n.txt, pos:posTxt(n.lat, n.lon), tipo:'nov'}));
    if(E.fin) ev.push({t:E.fin, real:true, ev:'Fin de marcha', punto:P.pts[P.pts.length - 1].nombre, tipo:'fin'});
    ev.sort((x, y)=>x.t - y.t); return ev; }
  function ficha(){
    const c = $('#sFicha'); if(!c) return; const m = A.actual(), P = plan(m), ev = eventos(m, P);
    c.innerHTML = `<div class="tabla-env"><table class="t matriz"><thead><tr><th class="tx">Punto / posición</th><th>Plan</th><th>Real</th><th>Diferencia</th><th class="tx">Evento</th></tr></thead><tbody>
      ${ev.map(x=>`<tr class="${x.real ? '' : 'pend'} ${x.tipo}"><td class="tx"><b>${A.esc(x.punto || x.pos || '')}</b></td><td>${x.plan ? hh(x.plan) : ''}</td>
        <td>${x.salta ? 'saltado' : x.real ? (x.est ? '≈' : '') + hh(x.t) : '—'}</td>
        <td class="${x.dif===null || x.dif===undefined ? '' : x.dif>5 ? 'sube' : x.dif< -5 ? 'baja' : ''}">${x.dif===null || x.dif===undefined ? '' : difCorta(x.dif)}</td><td class="tx ev">${A.esc(x.ev)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  /* ---------- informe de fin de marcha (v0.99.30, revisión de la app, etapa 2, estilo sobrio): recorrido en una carta chica (ida azul,
     regreso rojo, ruta tenue), duración real y plan, cumplimiento del horario, distancia GPS, puntos alcanzados y cada punto con su hora
     plan, real y diferencia; botones: mensaje de fin al C2, resultado y reseña, y «Más…» (GPX, ruta nueva, imprimir, hacer de nuevo,
     descartar y la matriz completa; `burros_finmas` = '1' lo deja abierto). */
  let mapaFin = null;
  function pintarFin(c, m, P){
    const E = m.ejec, durReal = E.fin - E.inicio, altos = E.altos.reduce((a, x)=>a + ((x.fin || E.fin) - x.ini), 0);
    const km = distGps(E.track, m);
    const dTot = durReal/3600000 - P.R.res.total, dMin = Math.round(dTot*60);
    const ev = P.pts.map((p, j)=>({p, j})).filter(x=>x.j && x.p.ev), hechos = ev.filter(x=>E.llegadas[x.j]>0), sal = ev.filter(x=>E.llegadas[x.j]===-1), no = ev.filter(x=>!E.llegadas[x.j]);
    const fecha = d=>{ const x = new Date(d); return String(x.getDate()).padStart(2, '0') + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + x.getFullYear(); };
    let masAb = false; try { masAb = localStorage.getItem('burros_finmas')==='1'; } catch(e){}
    const filas = ev.map(({p, j})=>{ const r = E.llegadas[j], pl = E.inicio + p.lleg*36e5, d = r>0 ? Math.round((r - pl)/60000) : null;
      return `<tr><td class="tx"><b>${A.esc(rotulo(p))}</b></td><td>${hh(pl)}</td><td>${r>0 ? (E.estim && E.estim[j] ? '≈' : '') + hh(r) : r===-1 ? 'saltado' : '—'}</td><td class="${d===null ? '' : Math.abs(d)<=5 ? 'in-ok' : d>0 ? 'in-tarde' : 'in-antes'}">${d===null ? '' : difCorta(d)}</td></tr>`; }).join('');
    c.innerHTML = `<div class="informe"><div class="in-t">Informe de fin de marcha</div>
      <div class="in-n">${A.esc(m.nombre || 'Marcha')} · ${no.length || sal.length ? 'incompleta' : 'completa'}</div>
      <div class="nota">${fecha(E.inicio)} · ${hh(E.inicio)} → ${hh(E.fin)}${m.unidad ? ' · ' + A.esc(m.unidad) : ''}</div>
      ${E.track.length>1 ? '<div id="fMapa" class="in-mapa"></div>' : ''}
      <div class="kpis in-k"><div class="kpi"><div class="k">Duración</div><div class="v">${dur(durReal)}</div><div class="s">plan ${M.verDur(P.R.res.total)}</div></div>
        <div class="kpi"><div class="k">Horario</div><div class="v ${Math.abs(dMin)<=5 ? 'in-ok' : dMin>0 ? 'in-tarde' : 'in-antes'}">${Math.abs(dMin)<1 ? 'a la hora' : difCorta(dMin)}</div><div class="s">${Math.abs(dMin)<=5 ? 'dentro de 5 min' : dMin>0 ? 'atrasado' : 'adelantado'}</div></div>
        <div class="kpi"><div class="k">Distancia GPS</div><div class="v">${E.track.length>1 ? A.f(km/1000, 2) + ' <small>km</small>' : '—'}</div><div class="s">ruta ${A.f(P.R.res.dist/1000, 1)} km</div></div>
        <div class="kpi"><div class="k">Puntos</div><div class="v">${hechos.length} de ${ev.length}</div><div class="s">${sal.length ? sal.length + ' saltado' + (sal.length===1 ? '' : 's') : no.length ? no.length + ' sin pasar' : 'todos'}</div></div></div>
      <div class="${no.length || sal.length ? 'alerta' : 'info'}">Puntos de control: <b>${hechos.length} de ${ev.length}</b>${sal.length ? ' · saltados: ' + sal.map(x=>A.esc(rotulo(x.p))).join(', ') : ''}${no.length ? ' · no alcanzados: ' + no.map(x=>A.esc(rotulo(x.p))).join(', ') : ''}</div>
      <div class="tabla-env"><table class="t in-tb"><thead><tr><th class="tx">Punto</th><th>Plan</th><th>Real</th><th>Dif.</th></tr></thead><tbody>${filas}</tbody></table></div>
      <div class="desglose"><span>altos <b>${dur(altos)}</b> (${E.altos.length})</span><span>novedades <b>${E.nov.length}</b></span></div>
      <div class="btns in-b"><button class="btn pri" id="fMsg">📡 Mensaje de fin al C2</button><button class="btn" id="fRes">📊 Resultado y reseña</button></div>
      <details class="tarjeta in-mas"${masAb ? ' open' : ''}><summary>Más…</summary>
        <div class="btns"><button class="btn" id="fGpx">⬇ Recorrido (GPX)</button><button class="btn" id="fRuta">🧭 Guardar el recorrido como ruta nueva</button><button class="btn" id="fImp">🖨 Imprimir</button>
          <button class="btn" id="fRe">↺ Hacer de nuevo</button><button class="btn peligro" id="fDesc">🗑 Descartar (que no quede registrada)</button></div>
        <h3>Matriz de eventos</h3><div id="sFicha"></div></details></div>`;
    ficha();
    // la carta chica con el recorrido (sin tocar ni mover)
    const fm = $('#fMapa');
    if(fm && typeof L!=='undefined'){ const pr = prefMapa();
      mapaFin = L.map(fm, {zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false, touchZoom:false, boxZoom:false, keyboard:false});
      Mapa.capa(Mapa.efectiva(pr.base)).addTo(mapaFin);
      L.polyline(P.pts.map(q=>[q.lat, q.lon]), {color:'#e3a63a', weight:2, opacity:.7, dashArray:'6 6'}).addTo(mapaFin);
      const T = partes(m, P); [[T.ida, COL_IDA], [T.reg, COL_REG]].forEach(([l, col])=>{ if(l.length) L.polyline(l, {color:col, weight:4}).addTo(mapaFin); });
      mapaFin.fitBounds(L.latLngBounds(E.track.map(t=>[t[0], t[1]]).concat(P.pts.map(q=>[q.lat, q.lon]))), {padding:[14, 14], animate:false});
      const este = mapaFin; setTimeout(()=>{ if(mapaFin===este) mapaFin.invalidateSize({animate:false}); }, 50); }
    $('#fMsg').onclick = ()=>verMensaje((E.msgs || []).filter(x=>x.k==='FIN').pop()?.msg || mensaje('FIN', {}));
    $('#fGpx').onclick = ()=>{ if(E.track.length<2) return A.aviso('No hay recorrido GPS registrado');
      A.descargar((m.nombre || 'marcha').replace(/[^\w-]+/g, '_') + '_recorrido.gpx', `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Burros de Combate" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${A.esc(m.nombre)} — recorrido real</name><trkseg>
${E.track.map(t=>`<trkpt lat="${t[0]}" lon="${t[1]}"><time>${new Date(t[2]).toISOString()}</time></trkpt>`).join('\n')}
</trkseg></trk></gpx>
`, 'application/gpx+xml'); };
    $('#fImp').onclick = ()=>window.print();
    $('#fRuta').onclick = ()=>A.rutaDeRecorrido(m, E);
    $('#fRes').onclick = ()=>A.ir('resultado');
    $('#fDesc').onclick = ()=>descartar(m);
    $('#fRe').onclick = ()=>A.confirmar('¿Hacer la marcha de nuevo? El registro actual se quita de Seguir y su recorrido GPS queda guardado en Cuadro → Resultado (los 5 últimos).', ()=>{ archivar(m); delete m.ejec; A.guardar(); pintar(); });
  }

  // recorridos anteriores (v0.99.10, pedido del usuario: que el recorrido quede guardado): los 5 últimos, con sus horas
  function archivar(m){ const E = m.ejec; if(!E || !E.inicio || !(E.track || []).length) return;
    m.recorridos = (m.recorridos || []).concat([{inicio:E.inicio, fin:E.fin, track:E.track, llegadas:E.llegadas}]).slice(-5); }
  function gpx(nombre, T){ return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Burros de Combate" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${String(nombre).replace(/[&<>]/g, c=>({'&':'&amp;', '<':'&lt;', '>':'&gt;'})[c])}</name><trkseg>
${T.map(t=>`<trkpt lat="${t[0]}" lon="${t[1]}"><time>${new Date(t[2]).toISOString()}</time></trkpt>`).join('\n')}
</trkseg></trk></gpx>
`; }

  // datos del plan sobre la carta antes de partir, y dónde estoy respecto del PIM
  function pintarPrevio(){
    const c = $('#sPrevio'); if(!c) return; const m = A.actual(), P = plan(m); if(!P) return;
    const r = P.R.res, nEv = P.pts.filter(p=>p.ev).length, nQ = P.pts.length - nEv, pim = P.pts[0];
    let dPim = '';
    if(pos){ const x = M.rumboEntre(pos, pim, P.R.zona, P.R.decl.valor);
      dPim = x.dist<=Math.max(40, 15 + (pos.acc||0)) ? '<b class="bien">✔ Estás en el PIM</b>'
        : `Al PIM: <b>${x.dist>=1000 ? A.f(x.dist/1000, 2) + ' km' : A.f(x.dist) + ' m'}</b> · rumbo <b class="ocre">${A.f(x.azM, 0)}°</b> / ${x.mils} ‰`; }
    const luz = P.R.conLuz && typeof LUZ!=='undefined' ? LUZ.condicion(new Date(LUZ.inicioDia(m.fecha) + r.partida*36e5), pim.lat, pim.lon) : null;
    c.innerHTML = `<div class="hud1"><span>PLAN <b>${A.esc(m.nombre || 'Marcha')}</b>${m.unidad ? ' <small>' + A.esc(m.unidad) + '</small>' : ''}</span></div>
      <div class="prev-datos">
        <div><span>Partida</span><b>${M.verHora(r.partida)}</b></div><div><span>Término</span><b class="ocre">${M.verHora(r.termino)}</b></div>
        <div><span>Distancia</span><b>${A.f(r.dist/1000, 1)} km</b></div><div><span>Duración</span><b>${M.verDur(r.total).replace(/ min$/, '')}</b></div>
        <div><span>Eventos</span><b>${nEv}</b>${nQ ? ` <small>+${nQ} quiebres</small>` : ''}</div><div><span>Desnivel</span><b>+${A.f(r.sube)}</b> <small>/ −${A.f(r.baja)} m</small></div>
      </div>
      <div class="hud3 mono">${luz ? (luz.tipo==='dia' ? '☀ parte de día' : luz.oscuro ? (luz.conLuna ? '☾ parte de noche, con luna' : '● parte de noche, sin luna') : '◐ parte en crepúsculo') + (P.R.fracNoche>0 ? ' · ' + Math.round(P.R.fracNoche*100) + ' % de la marcha de noche' : '') + ' · ' : ''}primer evento: ${A.esc(P.pts.find((p, k)=>k && p.ev) ? rotulo(P.pts.find((p, k)=>k && p.ev)) : '—')}</div>
      <div class="hud3 mono" style="margin-top:4px">${pos ? dPim + ' · GPS ±' + Math.round(pos.acc||0) + ' m' : (navigator.geolocation ? 'Esperando señal GPS…' : 'Este equipo no tiene GPS')}</div>`;
    mapaVivo();
  }

  /* ---------- carta a pantalla completa ---------- */
  let primera = true;
  function hacerMapa(P){
    const el = $('#sMapa'); if(!el || typeof L==='undefined') return;
    const c0 = P ? [P.pts[0].lat, P.pts[0].lon] : irSolo ? [irSolo.lat, irSolo.lon] : pos ? [pos.lat, pos.lon] : [-33.45, -70.66];
    mapa = L.map(el, {zoomControl:false, attributionControl:false}).setView(c0, P || irSolo || pos ? 15 : 10);
    let base = 'topo'; try { base = JSON.parse(localStorage.getItem('burros_mapa') || '{}').base || 'topo'; } catch(e){}
    mapa.createPane('curvas').style.zIndex = 300; mapa.getPane('curvas').style.pointerEvents = 'none';
    mapa.createPane('relieve').style.zIndex = 240; mapa.getPane('relieve').style.pointerEvents = 'none'; ponerCapas();
    // con la carta girada no se puede arrastrar bien: al empezar a mover el dedo se endereza (norte arriba) para recorrerla
    { let x0 = null, y0 = null; el.addEventListener('pointerdown', e=>{ x0 = e.clientX; y0 = e.clientY; });
      el.addEventListener('pointermove', e=>{ if(x0===null || giro===null) return; if(Math.hypot(e.clientX - x0, e.clientY - y0)>12){ explorando = true; centrar = false; x0 = null; girar(null); marcarCentrar(); A.aviso('Recorriendo la carta (norte arriba). ◎ para volver a centrar'); } });
      el.addEventListener('pointerup', ()=>{ x0 = null; }); }
    capas = L.layerGroup().addTo(mapa);
    if(!P){ mapa.on('dragstart', ()=>{ centrar = false; marcarCentrar(); }); mapa.on('click', e=>{ if(!eligiendo) return; const el2 = eligiendo; eligiendo = null; empezarIrA({lat:e.latlng.lat, lon:e.latlng.lng, nombre:'el punto marcado'}, el2.enMarcha, el2.modo); });
      controles(); primera = true; const este = mapa; setTimeout(()=>{ if(mapa===este) mapa.invalidateSize({animate:false}); }, 50); return; }
    L.polyline(P.pts.map(p=>[p.lat, p.lon]), {color:'#14150f', weight:8, opacity:.5}).addTo(mapa);
    L.polyline(P.pts.map(p=>[p.lat, p.lon]), {color:'#e3a63a', weight:4, opacity:.95, dashArray:'8 6'}).addTo(mapa);
    // un rótulo por lugar: si la ruta vuelve a pasar por el mismo punto, se juntan los nombres («PIM / ECO»)
    const lugares = new Map();
    P.pts.forEach((p, k)=>{ if(!p.ev){ L.circleMarker([p.lat, p.lon], {radius:3, color:'#14150f', weight:1, fillColor:'#fff', fillOpacity:1}).addTo(mapa); return; }
      const key = p.lat.toFixed(5) + ',' + p.lon.toFixed(5), n = p.clave || p.nombre;
      if(!lugares.has(key)) lugares.set(key, {p, n:[]}); const l = lugares.get(key); if(!l.n.includes(n)) l.n.push(n); });
    lugares.forEach(({p, n})=>L.circleMarker([p.lat, p.lon], {radius:7, color:'#14150f', weight:2, fillColor:'#e3a63a', fillOpacity:1})
      .bindTooltip(n.join(' / '), {permanent:true, direction:'right', className:'s-etq'}).addTo(mapa));
    capas = L.layerGroup().addTo(mapa);
    // la ruta queda entre los datos de arriba y los botones de abajo
    const hud = document.querySelector('.s-hud, .s-bsup'), alto = hud ? hud.offsetHeight + 30 : 200, abajo = document.querySelector('.s-binf') ? 140 : 170;
    mapa.fitBounds(L.latLngBounds(P.pts.map(p=>[p.lat, p.lon])), {paddingTopLeft:[40, alto], paddingBottomRight:[60, abajo], animate:false});
    mapa.on('dragstart', ()=>{ centrar = false; marcarCentrar(); });

    controles();
    mapa.on('click', e=>{ if(!eligiendo) return; const el = eligiendo; eligiendo = null; empezarIrA({lat:e.latlng.lat, lon:e.latlng.lng, nombre:'el punto marcado'}, el.enMarcha, el.modo); });
    primera = true;
    const este = mapa; setTimeout(()=>{ if(mapa===este) mapa.invalidateSize({animate:false}); }, 50);
  }
  function mapaVivo(){
    if(!mapa || !capas) return; capas.clearLayers(); const m = A.actual(), E = m.ejec, P = plan(m);
    if(!E){ // antes de partir: mi posición y una línea hasta el PIM
      if(pos){ L.circle([pos.lat, pos.lon], {radius:pos.acc||20, color:'#2a7fd4', weight:1, fillOpacity:.12}).addTo(capas);
        L.circleMarker([pos.lat, pos.lon], {radius:8, color:'#fff', weight:3, fillColor:'#2a7fd4', fillOpacity:1}).addTo(capas);
        L.polyline([[pos.lat, pos.lon], [P.pts[0].lat, P.pts[0].lon]], {color:'#fff', weight:2, dashArray:'4 6', opacity:.9}).addTo(capas);
        if(centrar) mapa.panTo([pos.lat, pos.lon], {animate:false});
        else if(!mapa._conPos){ mapa._conPos = true;   // con la primera señal, encuadrar la ruta y mi posición
          const hud = document.querySelector('.s-hud'), alto = hud ? hud.offsetHeight + 70 : 200;
          mapa.fitBounds(L.latLngBounds(P.pts.map(p=>[p.lat, p.lon]).concat([[pos.lat, pos.lon]])), {paddingTopLeft:[40, alto], paddingBottomRight:[70, 170], animate:false}); } }
      L.circleMarker([P.pts[0].lat, P.pts[0].lon], {radius:13, color:'#fff', weight:3, fill:false}).addTo(capas);
      return; }
    { const T = partes(m, P); if(T.ida.length) L.polyline(T.ida, {color:COL_IDA, weight:4}).addTo(capas); if(T.reg.length) L.polyline(T.reg, {color:COL_REG, weight:4}).addTo(capas);
      if(T.idaA.length) L.polyline(T.idaA, {color:COL_IDA, weight:3, dashArray:'3 7'}).addTo(capas); if(T.regA.length) L.polyline(T.regA, {color:COL_REG, weight:3, dashArray:'3 7'}).addTo(capas);
      T.huecos.forEach(h=>L.polyline(h, {color:'#9a9a9a', weight:2, dashArray:'2 6'}).addTo(capas)); }
    const k = siguiente(m, P), ke = proxEv(m, P);
    if(ke!==null){ const e = P.pts[ke]; L.circleMarker([e.lat, e.lon], {radius:13, color:'#fff', weight:3, fill:false}).addTo(capas); }
    const O = objetivo(m, P);
    if(O){ L.circleMarker([O.dest.lat, O.dest.lon], {radius:12, color:'#6fb3d9', weight:3, fill:false}).addTo(capas);
      if(pos) L.polyline([[pos.lat, pos.lon], [O.dest.lat, O.dest.lon]], {color:'#6fb3d9', weight:3, dashArray:'6 6'}).addTo(capas); }
    else if(k!==null && pos){ const q = P.pts[k]; L.polyline([[pos.lat, pos.lon], [q.lat, q.lon]], {color:'#fff', weight:2, dashArray:'4 6', opacity:.9}).addTo(capas); }
    if(pos){ L.circle([pos.lat, pos.lon], {radius:pos.acc||20, color:'#2a7fd4', weight:1, fillOpacity:.12}).addTo(capas);
      L.circleMarker([pos.lat, pos.lon], {radius:8, color:'#fff', weight:3, fillColor:'#2a7fd4', fillOpacity:1}).addTo(capas);
      const dst = O ? O.dest : k!==null ? P.pts[k] : null;
      if(dst){ const az = M.rumboEntre(pos, dst, P.R.zona, 0).azG; girar(azGiro(az)); }
      if(centrar){ if(primera){ mapa.setView([pos.lat, pos.lon], Math.max(mapa.getZoom(), 16), {animate:false}); primera = false; } else seguirPos(); } }
  }
  /* ---------- controles de la carta de Seguir (v0.99, pedido del usuario): orientación, capa del mapa y centrado ----------
     Norte arriba (el destino queda donde está en la carta) o destino arriba (la carta gira para que el punto al que se va quede siempre
     arriba; se gira el contenedor del mapa, que se agranda a la diagonal para no dejar esquinas vacías; arrastrar queda desactivado).
     La capa (topográfica, satélite…) y las curvas se guardan en la misma preferencia del Mapa (`burros_mapa`). Centrado: sigue la posición;
     al mover la carta con el dedo se suelta y el botón ◎ se ilumina para volver a centrar. */
  let orient = 'norte'; try { orient = localStorage.getItem('burros_orient') || 'norte'; } catch(e){}
  // rumbo del teléfono respecto del norte geográfico (para girar la carta en el modo brújula)
  const rumboGeo = ()=>rumboDisp ? ((rumboDisp.mag ? rumboDisp.h + decPlan() : rumboDisp.h) + 360)%360 : null;
  const azGiro = az=>orient==='brujula' && rumboDisp ? rumboGeo() : az;
  let capaS = null, curvasS = null, relieveS = null, giro = null;
  const prefMapa = ()=>{ try { return JSON.parse(localStorage.getItem('burros_mapa') || '{}'); } catch(e){ return {}; } };
  function ponerCapas(){
    if(!mapa) return; const pr = prefMapa(), base = Mapa.efectiva(pr.base);   // sin señal, los mapas que la necesitan pasan al topográfico
    if(capaS) mapa.removeLayer(capaS); capaS = Mapa.capa(base).addTo(mapa);
    if(curvasS){ mapa.removeLayer(curvasS); curvasS = null; }
    if(pr.curvas!==false && !Mapa.BASES[base].sinCurvas && typeof Curvas!=='undefined') curvasS = Curvas.capa({claro:!!Mapa.BASES[base].claro, pane:'curvas'}).addTo(mapa);   // Google Terreno trae las suyas
    // relieve sombreado (Ruck Planner, si está encendido en el Mapa)
    if(relieveS){ mapa.removeLayer(relieveS); relieveS = null; }
    if(pr.relieve && Mapa.BASES[base].grupo && typeof Curvas!=='undefined' && Curvas.relieve && mapa.getPane('relieve')) relieveS = Curvas.relieve({pane:'relieve'}).addTo(mapa);
  }
  if(typeof window!=='undefined') ['online', 'offline'].forEach(ev=>window.addEventListener(ev, ()=>{ const b = Mapa.BASES[prefMapa().base];
    if(!mapa || !b || !b.conSenal) return; ponerCapas(); A.aviso(ev==='offline' ? 'Sin señal: cambié a «' + Mapa.BASES[Mapa.respaldo()].n + '»' : 'Con señal: volvió ' + b.n); }));
  const modoVistaBtn = ()=>(irSolo || (A && A.actual() && A.actual().ejec && A.actual().ejec.estado!=='fin')) ? `<button class="btn" id="sVista" title="Tipo de pantalla" aria-label="Pantalla">${ic('lista', 'Pantalla')}</button>` : '';
  function marcarCentrar(){ const b = $('#sCentrar'); if(b) b.classList.toggle('pri', !centrar || explorando); }
  function controles(){
    const bo = $('#sOrient'), bc = $('#sCapa'), bz = $('#sCentrar'), bv = $('#sVista'); if(!bo) return; if(bv) bv.onclick = elegirVista;
    const rotO = ()=>{ bo.innerHTML = orient==='destino' ? ic('dest', 'Destino') : orient==='brujula' ? ic('ira', 'Brújula') : ic('norte', 'Norte'); bo.classList.toggle('on', orient!=='norte'); }; rotO();
    // Norte arriba → Destino arriba → Brújula (la carta gira con el teléfono; v0.99.10, pedido del usuario) → Norte
    bo.onclick = ()=>{ orient = orient==='norte' ? 'destino' : orient==='destino' ? 'brujula' : 'norte'; try { localStorage.setItem('burros_orient', orient); } catch(e){}
      rotO(); if(orient==='norte') girar(null); if(orient==='brujula') brujula();
      A.aviso(orient==='destino' ? 'Destino arriba: la carta gira hacia el punto al que vas' : orient==='brujula' ? 'Brújula: la carta gira con el teléfono; lo que tienes al frente queda arriba' : 'Norte arriba');
      if(orient==='brujula') setTimeout(()=>{ if(orient==='brujula' && !rumboDisp) A.aviso('Este equipo no entrega la brújula: la carta gira hacia el destino'); }, 2500);
      if(irSolo) pintarSoloVivo(); else { mapaVivo(); } };
    bc.onclick = ()=>{ const pr = prefMapa();
      A.dialogo(`<h3>🗺 Mapa</h3><div class="s-mas">${Object.entries(Mapa.BASES).map(([k, b])=>`<button class="btn${(pr.base || 'topo')===k ? ' pri' : ''}" data-cb="${k}">${b.n}${b.falta ? ' · pronto' : b.conSenal ? ' · con señal' : ''}</button>`).join('')}</div>
        <label class="nota" style="display:block"><input type="checkbox" id="cCurv" ${pr.curvas!==false ? 'checked' : ''} style="width:auto;vertical-align:middle"> Curvas de nivel</label>
        <div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`, d=>{
        const guardarPr = o=>{ try { localStorage.setItem('burros_mapa', JSON.stringify(Object.assign(prefMapa(), o))); } catch(e){} ponerCapas(); };
        d.querySelectorAll('[data-cb]').forEach(b=>b.onclick = ()=>{ const B = Mapa.BASES[b.dataset.cb]; if(B && B.falta) return A.aviso(B.falta);
          guardarPr({base:b.dataset.cb}); A.cerrarDialogo(); if(B && B.conSenal && navigator.onLine===false) A.aviso('Sin señal: este mapa vuelve cuando haya señal; mientras, ' + Mapa.BASES[Mapa.respaldo()].n.toLowerCase()); });
        d.querySelector('#cCurv').onchange = e=>guardarPr({curvas:e.target.checked}); }); };
    bz.onclick = ()=>{ centrar = true; explorando = false; marcarCentrar(); zoomListo = false; if(pos && mapa) seguirPos(); else A.aviso('Esperando señal GPS…'); };
    marcarCentrar();
  }
  // girar la carta: az = rumbo geográfico al destino (null = norte arriba)
  let explorando = false;
  function girar(az){
    const el = $('#sMapa'); if(!el || !mapa) return; const cont = el.parentElement;
    if(az===null || az===undefined || orient==='norte' || explorando){ if(giro!==null){ giro = null; rotAcum = null; el.style.cssText = ''; delete el.dataset.dims; mapa.dragging.enable(); mapa.invalidateSize({animate:false}); } return; }
    const w = cont.clientWidth, h = cont.clientHeight, D = Math.ceil(Math.hypot(w, h)), dims = w + 'x' + h;
    if(giro===null || el.dataset.dims!==dims){ el.dataset.dims = dims; el.style.cssText = `position:absolute;inset:auto;right:auto;bottom:auto;width:${D}px;height:${D}px;left:${(w - D)/2}px;top:${(h - D)/2}px`; mapa.dragging.disable(); mapa.invalidateSize({animate:false}); }
    // el ángulo se acumula por el camino más corto (de 359° a 1° gira 2°, no una vuelta entera)
    rotAcum = rotAcum===null ? -az : rotAcum + ((((-az - rotAcum)%360) + 540)%360 - 180);
    // con la brújula la carta sigue al teléfono sin animación (las lecturas ya vienen suavizadas; con animación se sentía pegada, v0.99.32)
    el.style.transition = orient==='brujula' && rumboDisp ? 'none' : 'transform .6s';
    giro = az; el.style.transform = 'rotate(' + rotAcum + 'deg)'; flecha();
  }
  let rotAcum = null;
  addEventListener('resize', ()=>setTimeout(()=>{ if(giro!==null) girar(giro); if(centrar && pos && mapa) mapa.panTo([pos.lat, pos.lon], {animate:false}); }, 350));
  // seguir la posición: centrada; la primera vez, con un acercamiento que deja ver el destino
  let zoomListo = false;
  function seguirPos(dest){
    if(!mapa || !pos) return;
    if(!zoomListo && dest){ zoomListo = true; const dy = dest.lat - pos.lat, dx = dest.lon - pos.lon, z = mapa.getBoundsZoom(L.latLngBounds([[pos.lat - dy, pos.lon - dx], [pos.lat + dy, pos.lon + dx]]), false, L.point(70, 170));
      mapa.setView([pos.lat, pos.lon], Math.max(12, Math.min(17, z)), {animate:false}); }
    else mapa.panTo([pos.lat, pos.lon], {animate:false});
  }
  function cerrarMapa(){ if(mapaFin){ try { mapaFin.remove(); } catch(e){} mapaFin = null; } if(mapa){ try { mapa.remove(); } catch(e){} mapa = null; capas = null; } capaS = null; curvasS = null; relieveS = null; giro = null; zoomListo = false; explorando = false; }

  function cerrar(){ cerrarMapa(); const m = A && A.actual(); if(!(m && m.ejec && m.ejec.estado!=='fin')) pararGps(); }
  // desde el Mapa: «Navegar hasta aquí» (con una marcha en curso, como desvío que vuelve a la ruta)
  let pendiente = null, pedirIrA = false; function irA(dest){ pendiente = dest; } function abrirIrA(){ pedirIrA = true; }   // se aplica al abrir la pestaña Seguir
  return {abrir, cerrar, siguiente, plan, atraso, irA, abrirIrA, enMarcha:()=>watch!==null, partes, gpx, COL_IDA, COL_REG, suavizar, distGps, CORTE, puntosDeRecorrido};
})();
if(typeof globalThis!=='undefined') globalThis.Seguir = Seguir;
