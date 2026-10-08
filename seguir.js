/* BURROS DE COMBATE — seguir la marcha en el teléfono (GPS).
   m.ejec = {estado:'marcha'|'alto'|'fin', inicio, fin, llegadas:{i:ms}, altos:[{ini, fin, motivo, lat, lon}], nov:[{t, txt, lat, lon}],
             track:[[lat, lon, ms]]}. El GPS sigue funcionando aunque se cambie de pestaña dentro de la app (no con la pantalla apagada:
   por eso se pide mantener la pantalla encendida). Llegada automática a menos de 40 m del punto (o 15 m + precisión del GPS).
   Adelanto/atraso: tiempo real desde la partida comparado con el plan (marcha con altos + detenciones) en el mismo lugar de la ruta. */
const Seguir = (function(){
  const M = MARCHA;
  let A = null, watch = null, pos = null, rumboDisp = null, wake = null, mapa = null, capas = null, centrar = true;
  const $ = s=>document.querySelector(s);

  /* ---------- plan de referencia ---------- */
  // lista de puntos válidos con la hora planificada (horas desde la partida) de llegada y salida
  function plan(m){
    const R = A.calcular(m), r = R.res, pts = [];
    if(!R.tramos.length) return null;
    const p0 = R.puntos[R.tramos[0].iA];
    pts.push({i:p0.i, nombre:p0.nombre, obs:p0.obs, lat:p0.lat, lon:p0.lon, cota:p0.cota, lleg:0, sal:p0.det});
    R.tramos.forEach(t=>{ const p = R.puntos[t.iB]; pts.push({i:p.i, nombre:p.nombre, obs:p.obs, lat:p.lat, lon:p.lon, cota:p.cota,
      lleg:t.llegada - r.partida, sal:t.salida - r.partida, tramo:t}); });
    return {R, pts};
  }
  const ahora = ()=>Date.now();
  const hh = ms=>{ const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const dur = ms=>M.verDur(ms/3600000);
  const dif = min=>{ const a = Math.round(Math.abs(min)); return a<1 ? 'a la hora' : (min>0 ? '▼ ' + a + ' min atrasado' : '▲ ' + a + ' min adelantado'); };
  const difCorta = min=>{ const a = Math.round(min); return (a>0 ? '+' : a<0 ? '−' : '±') + Math.abs(a) + ' min'; };
  function siguiente(m, P){ const E = m.ejec; for(let k=1; k<P.pts.length; k++) if(!E.llegadas[k]) return k; return null; }

  /* ---------- adelanto / atraso ---------- */
  // minutos de atraso (+) o adelanto (−): tiempo real transcurrido − tiempo planificado para llegar a esta parte de la ruta
  function atraso(m, P){
    const E = m.ejec, k = siguiente(m, P); if(k===null) return null;
    const ult = k - 1, a = P.pts[ult], b = P.pts[k];
    if(pos){ const s = M.sobreTramo(pos, a, b), tPlan = (a.sal + s.t*(b.lleg - a.sal))*60; return (ahora() - E.inicio)/60000 - tPlan; }
    return E.llegadas[ult]>0 ? (E.llegadas[ult] - E.inicio)/60000 - a.lleg*60 : null;   // sin GPS: lo de la última llegada
  }

  /* ---------- GPS, brújula y pantalla encendida ---------- */
  function iniciarGps(){
    if(watch!==null || !navigator.geolocation) return;
    watch = navigator.geolocation.watchPosition(p=>{
      pos = {lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy, t:ahora(), vel:p.coords.speed};
      const m = A.actual(), E = m && m.ejec; if(!E || E.estado==='fin') return;
      const u = E.track[E.track.length - 1];
      if(!u || M.sobreTramo(pos, {lat:u[0], lon:u[1]}, {lat:u[0], lon:u[1]}).d>10 || pos.t - u[2]>60000){ E.track.push([+pos.lat.toFixed(6), +pos.lon.toFixed(6), pos.t]); if(E.track.length>8000) E.track.splice(0, E.track.length - 8000); }
      // llegada automática
      const P = plan(m), k = P && siguiente(m, P);
      if(k!==null && k!==undefined && E.estado==='marcha'){ const d = M.rumboEntre(pos, P.pts[k], P.R.zona, P.R.decl.valor).dist;
        if(d<=Math.max(40, 15 + (pos.acc||0))) llegar(k, true); }
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
  function brujula(){
    const fn = e=>{ let h = null;
      if(typeof e.webkitCompassHeading==='number') h = e.webkitCompassHeading;           // iPhone: respecto del norte magnético
      else if(e.absolute && typeof e.alpha==='number') h = (360 - e.alpha + 360)%360;      // Android: norte geográfico
      if(h!==null){ rumboDisp = {h, mag:typeof e.webkitCompassHeading==='number'}; flecha(); } };
    const activar = ()=>{ addEventListener('deviceorientationabsolute', fn); addEventListener('deviceorientation', fn); };
    if(typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function')
      DeviceOrientationEvent.requestPermission().then(r=>{ if(r==='granted') activar(); }).catch(()=>{});
    else activar();
  }

  /* ---------- acciones ---------- */
  function iniciar(){
    const m = A.actual(); if(!plan(m)) return A.aviso('Primero completa la ruta');
    m.ejec = {estado:'marcha', inicio:ahora(), fin:null, llegadas:{0:ahora()}, altos:[], nov:[], track:[], msgs:[]};
    A.guardar(); iniciarGps(); pantalla(true); brujula();
    mensaje('INI', {});
    pintar();
  }
  function llegar(k, auto){
    const m = A.actual(), E = m.ejec, P = plan(m); if(!E || E.llegadas[k]) return;
    for(let j=1; j<k; j++) if(!E.llegadas[j]) E.llegadas[j] = -1;   // puntos saltados
    E.llegadas[k] = ahora();
    const d = (E.llegadas[k] - E.inicio)/60000 - P.pts[k].lleg*60, p = P.pts[k];
    if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
    A.aviso((auto ? '📍 ' : '✔ ') + 'Llegada a ' + p.nombre + ' — ' + dif(d));
    mensaje('PC', {pc:p.nombre, n:k, h:hh(E.llegadas[k]), dif:Math.round(d)});
    if(k===P.pts.length - 1) terminar(true); else { A.guardar(); pintar(); }
  }
  function alto(){
    const m = A.actual(), E = m.ejec;
    if(E.estado==='alto'){ const a = E.altos[E.altos.length - 1]; a.fin = ahora(); E.estado = 'marcha'; A.guardar(); A.aviso('▶ Se reanuda la marcha (alto de ' + dur(a.fin - a.ini) + ')'); return pintar(); }
    A.dialogo(`<h3>⏸ Alto</h3><p class="nota">¿Motivo del alto?</p>
      <div class="btns">${['Alto horario', 'Comida', 'Lesionado', 'Reorganización', 'Orientación', 'Contacto', 'Otro'].map(x=>`<button class="btn" data-mot="${x}">${x}</button>`).join('')}</div>
      <div class="btns"><button class="btn" data-cerrar>Cancelar</button></div>`, d=>d.querySelectorAll('[data-mot]').forEach(b=>b.onclick = ()=>{
        E.altos.push({ini:ahora(), fin:null, motivo:b.dataset.mot, lat:pos && pos.lat, lon:pos && pos.lon}); E.estado = 'alto';
        A.cerrarDialogo(); A.guardar(); if(b.dataset.mot!=='Alto horario') mensaje('ALTO', {mot:b.dataset.mot}); pintar(); }));
  }
  function novedad(){
    A.dialogo(`<h3>⚠ Novedad</h3><textarea id="nTxt" placeholder="Lesionado, ruta cortada, cambio de itinerario…" style="font-family:var(--sans);font-size:15px"></textarea>
      <div class="btns"><button class="btn pri" id="nOk">Registrar y preparar mensaje</button><button class="btn" data-cerrar>Cancelar</button></div>`, d=>{
      d.querySelector('#nOk').onclick = ()=>{ const t = d.querySelector('#nTxt').value.trim(); if(!t) return;
        const E = A.actual().ejec; E.nov.push({t:ahora(), txt:t, lat:pos && pos.lat, lon:pos && pos.lon}); A.guardar();
        mensaje('NOV', {txt:t}); A.cerrarDialogo(); pintar(); verMensaje(); }; });
  }
  function terminar(auto){
    const m = A.actual(), E = m.ejec; if(!E) return;
    const fin = ()=>{ if(E.estado==='alto'){ E.altos[E.altos.length - 1].fin = ahora(); } E.estado = 'fin'; E.fin = ahora();
      pararGps(); pantalla(false); mensaje('FIN', {}); A.guardar(); pintar(); };
    if(auto) return fin();
    A.confirmar('¿Terminar la marcha? Se detiene el GPS y queda el registro.', fin);
  }

  /* ---------- mensajes para el C2 ---------- */
  function utmTxt(p){ const m = A.actual(), d = m.datum || 'WGS84', g = M.deWgs84(p.lat, p.lon, 0, d), u = M.llAUtm(g.lat, g.lon, +m.zona || undefined, M.DATUMS[d]);
    return u.zona + M.banda(g.lat) + ' ' + Math.round(u.e) + ' E ' + Math.round(u.n) + ' N'; }
  function mensaje(k, d){
    const m = A.actual(), E = m.ejec, P = plan(m), at = atraso(m, P), quien = '«' + (m.nombre || 'marcha') + '»' + (m.unidad ? ' (' + m.unidad + ')' : '');
    const donde = pos ? ' — posición ' + utmTxt(pos) : '';
    const txt = ({INI:'INICIO DE MARCHA ' + quien + ' ' + hh(E.inicio),
      PC:'LLEGADA A ' + d.pc + ' ' + quien + ' ' + d.h + ' (' + difCorta(d.dif) + ' respecto del plan)',
      ALTO:'ALTO NO PLANIFICADO ' + quien + ' — ' + d.mot,
      NOV:'NOVEDAD ' + quien + ' — ' + d.txt,
      POS:'POSICIÓN ' + quien + (at===null ? '' : ' — ' + dif(at)),
      FIN:'FIN DE MARCHA ' + quien + ' ' + hh(E.fin || ahora()) + ' — duración ' + dur((E.fin || ahora()) - E.inicio)})[k] + donde;
    const datos = Object.assign({n:m.nombre, u:m.unidad, h:ahora()}, d, pos ? {lat:+pos.lat.toFixed(6), lon:+pos.lon.toFixed(6), acc:Math.round(pos.acc||0)} : {}, at!==null ? {atr:Math.round(at)} : {});
    const msg = txt + '\n' + BDC.codigo(k==='INI' ? 'POS' : k, datos);
    E.msgs = (E.msgs || []).concat([{t:ahora(), k, msg}]).slice(-50); A.guardar();
    return msg;
  }
  function verMensaje(msg){
    const E = A.actual().ejec; msg = msg || (E.msgs && E.msgs.length ? E.msgs[E.msgs.length - 1].msg : null); if(!msg) return;
    const cod = msg.split('\n')[1];
    A.dialogo(`<h3>📡 Mensaje para el C2</h3><div class="mensaje">${A.esc(msg)}</div>
      <div class="btns"><button class="btn pri" id="mCop">📋 Copiar</button>${navigator.share ? '<button class="btn" id="mComp">↗ Compartir</button>' : ''}<button class="btn" id="mQr">▦ QR</button><button class="btn" data-cerrar>Cerrar</button></div><div id="mQrC"></div>`, d=>{
      d.querySelector('#mCop').onclick = ()=>A.copiar(msg);
      if(d.querySelector('#mComp')) d.querySelector('#mComp').onclick = ()=>navigator.share({text:msg}).catch(()=>{});
      d.querySelector('#mQr').onclick = ()=>{ const q = qrcode(0, 'L'); q.addData(cod, 'Byte'); q.make(); d.querySelector('#mQrC').innerHTML = `<div class="qr">${q.createSvgTag({cellSize:4, margin:2, scalable:true})}</div>`; }; });
  }

  /* ---------- pantalla ---------- */
  function abrir(cont, api){
    A = api; cerrarMapa();
    const m = A.actual(), E = m.ejec;
    if(E && E.estado!=='fin'){ iniciarGps(); pantalla(true); }
    cont.innerHTML = '<div id="seguir"></div>'; pintar();
  }
  function pintar(){
    const c = $('#seguir'); if(!c) return; const m = A.actual(), P = plan(m), E = m.ejec;
    cerrarMapa();
    if(!P){ c.innerHTML = `<div class="tarjeta vacio">Completa la ruta (al menos dos puntos con cota) para poder seguir la marcha.</div>`; return; }
    if(!E){ // antes de partir
      c.innerHTML = `<h2>Seguir la marcha</h2>
        <div class="tarjeta">
          <div class="kpis"><div class="kpi"><div class="k">Puntos</div><div class="v">${P.pts.length}</div></div><div class="kpi"><div class="k">Distancia</div><div class="v">${A.f(P.R.res.dist/1000, 1)} <small>km</small></div></div>
            <div class="kpi"><div class="k">Partida plan</div><div class="v">${M.verHora(P.R.res.partida)}</div></div><div class="kpi"><div class="k">Duración plan</div><div class="v">${M.verDur(P.R.res.total).replace(' min', '')}</div></div></div>
          <button class="btn pri grande" id="sIni">▶ Iniciar marcha</button>
          <p class="nota">Al iniciar se registra la hora real de partida y el teléfono va mostrando el próximo punto de control, la distancia, el rumbo y si vas
            adelantado o atrasado. Las llegadas se marcan solas al pasar a menos de 40 m del punto (o con el botón).<br>
            <b>Mantén la app abierta y la pantalla encendida</b> (se pide automáticamente); con la pantalla apagada el teléfono deja de entregar el GPS a la app.
            El GPS necesita que la app esté publicada en https o abierta en este mismo equipo.</p>
        </div>`;
      $('#sIni').onclick = iniciar; return;
    }
    if(E.estado==='fin') return pintarFin(c, m, P);
    c.innerHTML = `<div class="seg-cab tarjeta" id="sCab"></div>
      <div class="s-mapa" id="sMapa"></div>
      <div class="s-acc">
        <button class="btn pri" id="sLleg"></button>
        <button class="btn ${E.estado==='alto' ? 'pri' : ''}" id="sAlto">${E.estado==='alto' ? '▶ Reanudar' : '⏸ Alto'}</button>
        <button class="btn" id="sNov">⚠ Novedad</button>
        <button class="btn" id="sPos">📡 Enviar posición</button>
        <button class="btn peligro" id="sFin">⏹ Terminar</button>
      </div>
      <h2>Ficha de reconocimiento</h2><div id="sFicha"></div>`;
    $('#sAlto').onclick = alto; $('#sNov').onclick = novedad; $('#sFin').onclick = ()=>terminar(false);
    $('#sPos').onclick = ()=>verMensaje(mensaje('POS', {}));
    $('#sLleg').onclick = ()=>{ const k = siguiente(m, P); if(k!==null) llegar(k, false); };
    hacerMapa(P);
    pintarVivo();
  }
  function pintarVivo(){
    const c = $('#sCab'); if(!c) return; const m = A.actual(), P = plan(m), E = m.ejec; if(!E || E.estado==='fin') return;
    const k = siguiente(m, P), p = k!==null ? P.pts[k] : null, at = atraso(m, P), t = ahora();
    let dist = '—', rumbo = '—', mils = '', fuera = '', eta = '';
    if(p && pos){ const r = M.rumboEntre(pos, p, P.R.zona, P.R.decl.valor); dist = r.dist>=1000 ? A.f(r.dist/1000, 2) + ' km' : A.f(r.dist) + ' m'; rumbo = A.f(r.azM, 0) + '°'; mils = r.mils + ' ‰'; c.dataset.az = r.azM;
      const a = P.pts[k - 1], s = M.sobreTramo(pos, a, p); if(s.d>Math.max(120, 3*(pos.acc||0))) fuera = `<div class="alerta">Fuera de la ruta: ${A.f(s.d)} m de la línea ${A.esc(a.nombre)} → ${A.esc(p.nombre)}</div>`; }
    if(p) eta = 'llegada plan ' + hh(E.inicio + p.lleg*3600000) + (at!==null ? ' · estimada ' + hh(E.inicio + p.lleg*3600000 + at*60000) : '');
    const ultAlto = E.estado==='alto' ? E.altos[E.altos.length - 1] : null;
    c.innerHTML = `<div class="s-estado"><span>⏱ ${dur(t - E.inicio)} de marcha</span><span class="${at===null ? '' : at>5 ? 'mal' : at< -5 ? 'bien' : ''}">${at===null ? '' : dif(at)}</span></div>
      ${ultAlto ? `<div class="info">⏸ En alto (${A.esc(ultAlto.motivo)}) desde ${hh(ultAlto.ini)} — ${dur(t - ultAlto.ini)}</div>` : ''}
      ${p ? `<div class="s-prox">PRÓXIMO <b>${A.esc(p.nombre)}</b>${p.obs ? ' <small>' + A.esc(p.obs) + '</small>' : ''}</div>
      <div class="s-grande"><div><span>Distancia</span><b>${dist}</b></div><div><span>Rumbo mag.</span><b class="ocre">${rumbo}</b><small>${mils}</small></div>
        <div class="s-flecha" id="sFlecha" title="Dirección al punto según la brújula del teléfono">↑</div></div>
      <div class="nota mono">${eta}</div>` : ''}
      ${fuera}
      <div class="nota mono" id="sGps">${pos ? 'GPS ±' + Math.round(pos.acc||0) + ' m · ' + utmTxt(pos) : (navigator.geolocation ? 'Esperando señal GPS…' : 'Este equipo no tiene GPS: marca las llegadas a mano')}</div>`;
    const b = $('#sLleg'); if(b) b.textContent = p ? '✔ Llegué a ' + p.nombre : '';
    flecha(); ficha(); mapaVivo();
  }
  function flecha(){
    const f = $('#sFlecha'), c = $('#sCab'); if(!f || !c || c.dataset.az===undefined) return;
    if(!rumboDisp){ f.style.opacity = .25; return; }
    const P = plan(A.actual()), dec = P ? P.R.decl.valor : 0, h = rumboDisp.mag ? rumboDisp.h : rumboDisp.h - dec;
    f.style.opacity = 1; f.style.transform = 'rotate(' + ((+c.dataset.az - h + 360)%360) + 'deg)';
  }
  function ficha(){
    const c = $('#sFicha'); if(!c) return; const m = A.actual(), P = plan(m), E = m.ejec;
    c.innerHTML = `<div class="tabla-env"><table class="t"><thead><tr><th class="tx">Punto</th><th>Plan</th><th>Real</th><th>Diferencia</th></tr></thead><tbody>
      ${P.pts.map((p, k)=>{ const r = E.llegadas[k], plan = E.inicio + p.lleg*3600000, d = r>0 ? (r - plan)/60000 : null;
        return `<tr><td class="tx"><b>${A.esc(p.nombre)}</b></td><td>${hh(plan)}</td><td>${r>0 ? hh(r) : r===-1 ? 'no marcado' : '—'}</td><td class="${d===null ? '' : d>5 ? 'sube' : d< -5 ? 'baja' : ''}">${d===null ? '' : difCorta(d)}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${E.altos.length ? `<p class="nota">Altos: ${E.altos.map(a=>hh(a.ini) + ' ' + A.esc(a.motivo) + (a.fin ? ' (' + dur(a.fin - a.ini) + ')' : ' (en curso)')).join(' · ')}</p>` : ''}
      ${E.nov.length ? `<p class="nota">Novedades: ${E.nov.map(n=>hh(n.t) + ' ' + A.esc(n.txt)).join(' · ')}</p>` : ''}`;
  }
  function pintarFin(c, m, P){
    const E = m.ejec, durReal = E.fin - E.inicio, altos = E.altos.reduce((a, x)=>a + ((x.fin || E.fin) - x.ini), 0);
    let km = 0; for(let i=1; i<E.track.length; i++) km += M.rumboEntre({lat:E.track[i - 1][0], lon:E.track[i - 1][1]}, {lat:E.track[i][0], lon:E.track[i][1]}, P.R.zona, 0).dist;
    const dTot = durReal/3600000 - P.R.res.total;
    c.innerHTML = `<h2>Marcha terminada</h2>
      <div class="kpis"><div class="kpi"><div class="k">Duración real</div><div class="v">${dur(durReal)}</div></div>
        <div class="kpi"><div class="k">Plan</div><div class="v">${M.verDur(P.R.res.total)}</div></div>
        <div class="kpi ${dTot*60>5 ? '' : 'ocre'}"><div class="k">Diferencia</div><div class="v">${difCorta(dTot*60)}</div></div>
        <div class="kpi"><div class="k">Recorrido GPS</div><div class="v">${E.track.length>1 ? A.f(km/1000, 2) + ' <small>km</small>' : '—'}</div></div></div>
      <div class="desglose"><span>partida <b>${hh(E.inicio)}</b></span><span>término <b>${hh(E.fin)}</b></span><span>altos <b>${dur(altos)}</b> (${E.altos.length})</span><span>novedades <b>${E.nov.length}</b></span></div>
      <h2>Ficha de reconocimiento</h2><div id="sFicha"></div>
      <div class="btns"><button class="btn pri" id="fMsg">📡 Mensaje de fin al C2</button><button class="btn" id="fGpx">⬇ Recorrido (GPX)</button><button class="btn" id="fImp">🖨 Imprimir</button><button class="btn peligro" id="fRe">↺ Borrar registro</button></div>
      <p class="nota">Con la ficha de reconocimiento y el recorrido real se hace la reseña del itinerario y el croquis de lo ejecutado (cartilla, después de la marcha).</p>`;
    ficha();
    $('#fMsg').onclick = ()=>verMensaje((E.msgs || []).filter(x=>x.k==='FIN').pop()?.msg || mensaje('FIN', {}));
    $('#fGpx').onclick = ()=>{ if(E.track.length<2) return A.aviso('No hay recorrido GPS registrado');
      A.descargar((m.nombre || 'marcha').replace(/[^\w-]+/g, '_') + '_recorrido.gpx', `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Burros de Combate" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${A.esc(m.nombre)} — recorrido real</name><trkseg>
${E.track.map(t=>`<trkpt lat="${t[0]}" lon="${t[1]}"><time>${new Date(t[2]).toISOString()}</time></trkpt>`).join('\n')}
</trkseg></trk></gpx>
`, 'application/gpx+xml'); };
    $('#fImp').onclick = ()=>window.print();
    $('#fRe').onclick = ()=>A.confirmar('¿Borrar el registro de esta marcha (horas reales, altos, recorrido)?', ()=>{ delete m.ejec; A.guardar(); pintar(); });
  }

  /* ---------- mapa pequeño ---------- */
  function hacerMapa(P){
    const el = $('#sMapa'); if(!el || typeof L==='undefined') return;
    mapa = L.map(el, {zoomControl:false, attributionControl:false}).setView([P.pts[0].lat, P.pts[0].lon], 15);
    const b = Mapa.BASES.topo; L.tileLayer(b.url, Object.assign({crossOrigin:'anonymous'}, b.o)).addTo(mapa);
    L.polyline(P.pts.map(p=>[p.lat, p.lon]), {color:'#e3a63a', weight:4, opacity:.9, dashArray:'6 6'}).addTo(mapa);
    P.pts.forEach((p, k)=>L.circleMarker([p.lat, p.lon], {radius:6, color:'#14150f', weight:2, fillColor:'#e3a63a', fillOpacity:1}).bindTooltip(p.nombre).addTo(mapa));
    capas = L.layerGroup().addTo(mapa);
    mapa.fitBounds(L.latLngBounds(P.pts.map(p=>[p.lat, p.lon])), {padding:[20, 20], animate:false});
    mapa.on('dragstart', ()=>centrar = false);
  }
  function mapaVivo(){
    if(!mapa || !capas) return; capas.clearLayers(); const E = A.actual().ejec;
    if(E.track.length>1) L.polyline(E.track.map(t=>[t[0], t[1]]), {color:'#6fb3d9', weight:4}).addTo(capas);
    if(pos){ L.circle([pos.lat, pos.lon], {radius:pos.acc||20, color:'#6fb3d9', weight:1, fillOpacity:.15}).addTo(capas);
      L.circleMarker([pos.lat, pos.lon], {radius:7, color:'#fff', weight:2, fillColor:'#2a7fd4', fillOpacity:1}).addTo(capas);
      if(centrar) mapa.panTo([pos.lat, pos.lon], {animate:false}); }
  }
  function cerrarMapa(){ if(mapa){ try { mapa.remove(); } catch(e){} mapa = null; capas = null; } }

  return {abrir, cerrar:cerrarMapa, siguiente, plan, atraso, enMarcha:()=>watch!==null};
})();
if(typeof globalThis!=='undefined') globalThis.Seguir = Seguir;
