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
    pts.push({i:p0.i, ev:true, nombre:p0.nombre, clave:p0.clave, obs:p0.obs, lat:p0.lat, lon:p0.lon, cota:p0.cota, lleg:0, sal:p0.det});
    R.tramos.forEach(t=>{ const p = R.puntos[t.iB]; pts.push({i:p.i, ev:p.ev, nombre:p.nombre, clave:p.clave, obs:p.obs, lat:p.lat, lon:p.lon, cota:p.cota,
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
  function intervalo(m, P){
    const par = P.R.par, E = m.ejec; if(par.metodo!=='battle' || !E) return null;
    const d = recorrido(m, P), min = enMarcha(E), cic = M.cicloBattle(par), ritmo = d>50 && min>=1 ? min/(d/1000) : null;
    let fase, falta, ciclo = null;
    if(par.brPatron==='terreno'){ const k = siguiente(m, P); if(k===null) return null;
      fase = P.pts[k].tramo.como==='paso' ? 'lento' : 'rapido'; let f = 0;
      for(let j=k; j<P.pts.length && (P.pts[j].tramo.como==='paso')===(fase==='lento'); j++) f += P.pts[j].tramo.dist;
      falta = A.f(Math.max(0, f - (d - (P.pts[k].tramo.distAcum - P.pts[k].tramo.dist)))) + ' m más'; }
    else { const L = cic.rap + cic.len; if(!(L>0)) return null; const x = cic.u==='m' ? d : min, r = x%L; ciclo = Math.floor(x/L) + 1;
      fase = r<cic.rap ? 'rapido' : 'lento'; const q = fase==='rapido' ? cic.rap - r : L - r;
      falta = cic.u==='m' ? A.f(q) + ' m más' : Math.floor(q) + ':' + String(Math.floor((q%1)*60)).padStart(2, '0') + ' min más'; }
    const pausa = E.estado==='alto';
    if(!pausa && ultFase && ultFase!==fase) sonido(fase==='rapido'); ultFase = pausa ? ultFase : fase;
    const nombre = par.brPatron==='terreno' ? (fase==='rapido' ? 'TROTE' : 'PASO') : (fase==='rapido' ? 'RÁPIDO' : 'LENTO');
    const mt = P.R.meta, rObj = mt ? mt.ritmoMeta : P.R.res.dist ? P.R.res.marcha*60/(P.R.res.dist/1000) : null, mmss = x=>Math.floor(x) + ':' + String(Math.round((x%1)*60)).padStart(2, '0');
    return `<div class="s-intervalo ${pausa ? 'pausa' : fase}"><b>${pausa ? '⏸ ' : '▶ '}${nombre}</b><span>${falta}</span>${ciclo ? `<span>ciclo ${ciclo}</span>` : ''}
      <small>${pausa ? 'intervalos en pausa durante el alto · ' : ''}${ritmo ? 'ritmo ' + mmss(ritmo) + ' min/km' : 'ritmo —'}${rObj ? ' · ' + (mt ? 'meta' : 'plan') + ' ' + mmss(rObj) + ' min/km' : ''} · ${A.f(d)} m recorridos</small></div>`;
  }

  /* ---------- GPS, brújula y pantalla encendida ---------- */
  function iniciarGps(){
    if(watch!==null || !navigator.geolocation) return;
    watch = navigator.geolocation.watchPosition(p=>{
      pos = {lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy, t:ahora(), vel:p.coords.speed};
      const m = A.actual(), E = m && m.ejec;
      if(!E){ pintarPrevio(); return; }   // antes de partir: solo se muestra la posición y la distancia al PIM
      if(E.estado==='fin') return;
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
    if(A.calcular(m).par.metodo==='battle'){ ultFase = null; try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }   // el sonido se habilita con el toque
    m.ejec = {estado:'marcha', inicio:ahora(), fin:null, llegadas:{0:ahora()}, altos:[], nov:[], track:[], msgs:[]};
    A.guardar(); iniciarGps(); pantalla(true); brujula();
    mensaje('INI', {});
    pintar();
  }
  function llegar(k, auto){
    const m = A.actual(), E = m.ejec, P = plan(m); if(!E || E.llegadas[k]) return;
    if(!P.pts[k].ev){ E.llegadas[k] = ahora(); A.guardar(); pintarVivo(); return; }   // quiebre de la ruta: sin aviso ni mensaje
    for(let j=1; j<k; j++) if(!E.llegadas[j]) E.llegadas[j] = P.pts[j].ev ? -1 : ahora();   // eventos saltados / quiebres ya pasados
    E.llegadas[k] = ahora();
    const d = (E.llegadas[k] - E.inicio)/60000 - P.pts[k].lleg*60, p = P.pts[k];
    if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
    A.aviso((auto ? '📍 ' : '✔ ') + verbo() + ' ' + rotulo(p) + ' — ' + dif(d));
    mensaje('PC', {pc:p.nombre, clave:p.clave || '', n:k, h:hh(E.llegadas[k]), dif:Math.round(d)});
    if(k===P.pts.length - 1) terminar(true); else { A.guardar(); pintar(); }
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
    A.confirmar('¿Terminar la marcha? Se detiene el GPS y queda el registro.', fin);
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
  // tres formas de ver la marcha en curso: carta (mapa a pantalla completa), navegación (números grandes) y registro
  let modo = 'carta'; try { modo = localStorage.getItem('burros_seguir') || 'carta'; } catch(e){}
  const MODOS = [['carta', '🗺 Carta'], ['nav', '🧭 Navegación'], ['reg', '📋 Matriz']];
  function pintar(){
    const c = $('#seguir'); if(!c) return; const m = A.actual(), P = plan(m), E = m.ejec;
    cerrarMapa(); document.body.classList.remove('con-mapa');
    if(!P){ c.innerHTML = `<div class="tarjeta vacio">Completa la ruta (al menos dos puntos con cota) para poder seguir la marcha.</div>`; return; }
    if(!E){ // antes de partir: la carta a pantalla completa con el plan encima y el botón de inicio abajo
      document.body.classList.add('con-mapa');
      c.innerHTML = `<div class="mapa-env s-carta"><div id="sMapa"></div>
        <div class="s-hud" id="sPrevio"></div>
        <button class="btn s-centrar" id="sCentrar" title="Centrar en mi posición">◎</button>
        <div class="s-pie"><button class="btn pri grande" id="sIni">▶ Iniciar marcha</button>
          <p class="s-ayuda">Mantén la app abierta y la pantalla encendida durante la marcha. Las llegadas a cada evento se marcan solas a menos de 40 m.</p></div></div>`;
      $('#sIni').onclick = iniciar;
      pintarPrevio(); hacerMapa(P); centrar = false;
      $('#sCentrar').onclick = ()=>{ if(pos && mapa){ centrar = true; mapa.setView([pos.lat, pos.lon], Math.max(mapa.getZoom(), 16)); } else A.aviso('Esperando señal GPS…'); };
      iniciarGps(); pintarPrevio(); return;
    }
    if(E.estado==='fin') return pintarFin(c, m, P);
    const sel = `<div class="seg s-modos">${MODOS.map(([k, n])=>`<button data-smodo="${k}" class="${modo===k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const acc = `<div class="s-acc">
        <button class="btn pri" id="sLleg"></button>
        <button class="btn ${E.estado==='alto' ? 'pri' : ''}" id="sAlto">${E.estado==='alto' ? '▶ Reanudar' : '⏸ Alto'}</button>
        <button class="btn" id="sNov">⚠ Novedad</button>
        <button class="btn" id="sPos">📡 Posición</button>
        <button class="btn peligro" id="sFin">⏹ Terminar</button>
      </div>`;
    if(modo==='carta'){
      document.body.classList.add('con-mapa');
      c.innerHTML = `<div class="mapa-env s-carta"><div id="sMapa"></div>${sel}<div class="s-hud" id="sCab"></div>
        <button class="btn s-centrar" id="sCentrar" title="Centrar en mi posición">◎</button><div class="s-pie">${acc}</div></div>`;
    } else if(modo==='nav'){
      c.innerHTML = `${sel}<div class="tarjeta" id="sCab"></div>${acc}`;
    } else {
      c.innerHTML = `${sel}<h2>Matriz de eventos</h2>
        <p class="nota">Todos los eventos de la marcha en orden: los planificados (paso por cada punto con su nombre clave y hora prevista) y lo que va ocurriendo
          (hora real, diferencia con el plan, altos, novedades y posición). Lo pendiente se ve en gris.</p>
        <div id="sFicha"></div>${acc}`;
    }
    c.querySelectorAll('[data-smodo]').forEach(b=>b.onclick = ()=>{ modo = b.dataset.smodo; try { localStorage.setItem('burros_seguir', modo); } catch(e){} pintar(); });
    $('#sAlto').onclick = alto; $('#sNov').onclick = novedad; $('#sFin').onclick = ()=>terminar(false);
    $('#sPos').onclick = ()=>verMensaje(mensaje('POS', {}));
    $('#sLleg').onclick = ()=>{ const k = proxEv(m, P); if(k!==null) llegar(k, false); };
    if(modo==='carta'){ hacerMapa(P); $('#sCentrar').onclick = ()=>{ centrar = true; if(pos && mapa) mapa.setView([pos.lat, pos.lon], Math.max(mapa.getZoom(), 16)); else A.aviso('Esperando señal GPS…'); }; }
    pintarVivo();
  }
  function pintarVivo(){
    const m = A.actual(), E = m && m.ejec; if(!E || E.estado==='fin' || !$('#seguir')) return; const P = plan(m);
    const k = siguiente(m, P), q = k!==null ? P.pts[k] : null, ke = proxEv(m, P), p = ke!==null ? P.pts[ke] : null, at = atraso(m, P), t = ahora(), c = $('#sCab');
    const b = $('#sLleg'); if(b) b.textContent = p ? '✔ ' + verbo() + ' ' + rotulo(p) : '';
    ficha(); mapaVivo();
    if(!c) return;
    let dist = '—', rumbo = '—', mils = '', fuera = '', eta = '';
    let quiebre = '';
    if(p && q && pos){ const r = M.rumboEntre(pos, q, P.R.zona, P.R.decl.valor), dr = distRuta(P, pos, k, ke);
      dist = dr>=1000 ? A.f(dr/1000, 2) + ' km' : A.f(dr) + ' m'; rumbo = A.f(r.azM, 0) + '°'; mils = r.mils + ' ‰'; c.dataset.az = r.azM;
      if(k!==ke) quiebre = 'rumbo al próximo quiebre (' + A.f(r.dist) + ' m) · distancia por la ruta';
      const a = P.pts[k - 1], s = M.sobreTramo(pos, a, q); if(s.d>Math.max(120, 3*(pos.acc||0))) fuera = `<div class="alerta">Fuera de la ruta: ${A.f(s.d)} m de la línea</div>`; }
    if(p) eta = 'llega plan ' + hh(E.inicio + p.lleg*3600000) + (at!==null ? ' · estimada ' + hh(E.inicio + p.lleg*3600000 + at*60000) : '');
    const ultAlto = E.estado==='alto' ? E.altos[E.altos.length - 1] : null, cls = at===null ? '' : at>5 ? 'mal' : at< -5 ? 'bien' : '';
    const gps = pos ? 'GPS ±' + Math.round(pos.acc||0) + ' m · ' + utmTxt(pos) : (navigator.geolocation ? 'Esperando señal GPS…' : 'Este equipo no tiene GPS: marca las llegadas a mano');
    const enAlto = (ultAlto ? `<div class="info">⏸ En alto (${A.esc(ultAlto.motivo)}) desde ${hh(ultAlto.ini)} — ${dur(t - ultAlto.ini)}</div>` : '') + (intervalo(m, P) || '');
    if(modo==='carta'){
      c.innerHTML = `<div class="hud1"><span>PRÓXIMO <b class="clave-tx">${p ? A.esc(rotulo(p)) : '—'}</b>${p ? ' <small>' + A.esc(p.clave ? p.nombre + (p.obs ? ' · ' + p.obs : '') : p.obs || '') + '</small>' : ''}</span><span class="${cls}">${at===null ? '' : dif(at)}</span></div>
        <div class="hud2"><b>${dist}</b><b class="ocre">${rumbo}</b><small>${mils}</small><div class="s-flecha mini" id="sFlecha">↑</div></div>
        <div class="hud3 mono">⏱ ${dur(t - E.inicio)}${eta ? ' · ' + eta : ''}</div>${quiebre ? `<div class="hud3 mono">↪ ${quiebre}</div>` : ''}${enAlto}${fuera}<div class="hud3 mono" id="sGps">${gps}</div>`;
    } else {
      c.innerHTML = `<div class="s-estado"><span>⏱ ${dur(t - E.inicio)} de marcha</span><span class="${cls}">${at===null ? '' : dif(at)}</span></div>${enAlto}
        ${p ? `<div class="s-prox">PRÓXIMO <b class="clave-tx">${A.esc(rotulo(p))}</b><small>${A.esc(p.clave ? p.nombre + (p.obs ? ' · ' + p.obs : '') : p.obs || '')}</small></div>
        <div class="s-grande"><div><span>Distancia</span><b>${dist}</b></div><div><span>Rumbo mag.</span><b class="ocre">${rumbo}</b><small>${mils}</small></div>
          <div class="s-flecha" id="sFlecha" title="Dirección al punto según la brújula del teléfono">↑</div></div>
        <div class="nota mono">${eta}${quiebre ? '<br>↪ ' + quiebre : ''}</div>` : ''}${fuera}<div class="nota mono" id="sGps">${gps}</div>`;
    }
    flecha();
  }
  function flecha(){
    const f = $('#sFlecha'), c = $('#sCab'); if(!f || !c || c.dataset.az===undefined) return;
    if(!rumboDisp){ f.style.opacity = .25; return; }
    const P = plan(A.actual()), dec = P ? P.R.decl.valor : 0, h = rumboDisp.mag ? rumboDisp.h : rumboDisp.h - dec;
    f.style.opacity = 1; f.style.transform = 'rotate(' + ((+c.dataset.az - h + 360)%360) + 'deg)';
  }
  // matriz de eventos: eventos planificados (paso por cada punto) y reales (inicio, pasos, altos, novedades, fin) en orden de hora
  function ficha(){
    const c = $('#sFicha'); if(!c) return; const m = A.actual(), P = plan(m), E = m.ejec, ev = [];
    const posTxt = (la, lo)=>la===undefined || la===null ? '' : utmTxt({lat:la, lon:lo});
    ev.push({t:E.inicio, real:true, ev:'Inicio de marcha' + (P.pts[0].clave ? ' — ' + P.pts[0].clave : ''), punto:P.pts[0].nombre, plan:E.inicio, dif:0, tipo:'ini'});
    P.pts.forEach((p, k)=>{ if(!k || !p.ev) return; const r = E.llegadas[k], pl = E.inicio + p.lleg*3600000;
      ev.push({t:r>0 ? r : pl, real:r>0, ev:verbo() + ' ' + rotulo(p), punto:p.nombre, plan:pl, dif:r>0 ? (r - pl)/60000 : null, salta:r===-1, tipo:'pc'}); });
    E.altos.forEach(a=>ev.push({t:a.ini, real:true, ev:'Alto — ' + a.motivo + (a.fin ? ' (' + dur(a.fin - a.ini) + ')' : ' (en curso)'), pos:posTxt(a.lat, a.lon), tipo:'alto'}));
    E.nov.forEach(n=>ev.push({t:n.t, real:true, ev:'Novedad — ' + n.txt, pos:posTxt(n.lat, n.lon), tipo:'nov'}));
    if(E.fin) ev.push({t:E.fin, real:true, ev:'Fin de marcha', punto:P.pts[P.pts.length - 1].nombre, tipo:'fin'});
    ev.sort((x, y)=>x.t - y.t);
    c.innerHTML = `<div class="tabla-env"><table class="t matriz"><thead><tr><th class="tx">Punto / posición</th><th>Plan</th><th>Real</th><th>Diferencia</th><th class="tx">Evento</th></tr></thead><tbody>
      ${ev.map(x=>`<tr class="${x.real ? '' : 'pend'} ${x.tipo}"><td class="tx"><b>${A.esc(x.punto || x.pos || '')}</b></td><td>${x.plan ? hh(x.plan) : ''}</td>
        <td>${x.salta ? 'no marcado' : x.real ? hh(x.t) : '—'}</td>
        <td class="${x.dif===null || x.dif===undefined ? '' : x.dif>5 ? 'sube' : x.dif< -5 ? 'baja' : ''}">${x.dif===null || x.dif===undefined ? '' : difCorta(x.dif)}</td><td class="tx ev">${A.esc(x.ev)}</td></tr>`).join('')}
      </tbody></table></div>`;
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
      <h2>Matriz de eventos</h2><div id="sFicha"></div>
      <div class="btns"><button class="btn pri" id="fMsg">📡 Mensaje de fin al C2</button><button class="btn" id="fGpx">⬇ Recorrido (GPX)</button><button class="btn" id="fImp">🖨 Imprimir</button><button class="btn peligro" id="fRe">↺ Borrar registro</button></div>
      <p class="nota">Con la matriz de eventos y el recorrido real se hace la reseña del itinerario y el croquis de lo ejecutado.</p>`;
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
    mapa = L.map(el, {zoomControl:false, attributionControl:false}).setView([P.pts[0].lat, P.pts[0].lon], 15);
    let base = 'topo'; try { base = JSON.parse(localStorage.getItem('burros_mapa') || '{}').base || 'topo'; } catch(e){}
    const b = Mapa.BASES[base] || Mapa.BASES.topo; L.tileLayer(b.url, Object.assign({crossOrigin:'anonymous'}, b.o)).addTo(mapa);
    let conCurvas = true; try { conCurvas = JSON.parse(localStorage.getItem('burros_mapa') || '{}').curvas!==false; } catch(e){}
    if(conCurvas && typeof Curvas!=='undefined'){ mapa.createPane('curvas').style.zIndex = 300; mapa.getPane('curvas').style.pointerEvents = 'none'; Curvas.capa({claro:base==='sat', pane:'curvas'}).addTo(mapa); }
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
    const hud = document.querySelector('.s-hud'), alto = hud ? hud.offsetHeight + 70 : 200;
    mapa.fitBounds(L.latLngBounds(P.pts.map(p=>[p.lat, p.lon])), {paddingTopLeft:[40, alto], paddingBottomRight:[60, 170], animate:false});
    mapa.on('dragstart', ()=>centrar = false);
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
    if(E.track.length>1) L.polyline(E.track.map(t=>[t[0], t[1]]), {color:'#2a7fd4', weight:4}).addTo(capas);
    const k = siguiente(m, P), ke = proxEv(m, P);
    if(ke!==null){ const e = P.pts[ke]; L.circleMarker([e.lat, e.lon], {radius:13, color:'#fff', weight:3, fill:false}).addTo(capas); }
    if(k!==null && pos){ const q = P.pts[k]; L.polyline([[pos.lat, pos.lon], [q.lat, q.lon]], {color:'#fff', weight:2, dashArray:'4 6', opacity:.9}).addTo(capas); }
    if(pos){ L.circle([pos.lat, pos.lon], {radius:pos.acc||20, color:'#2a7fd4', weight:1, fillOpacity:.12}).addTo(capas);
      L.circleMarker([pos.lat, pos.lon], {radius:8, color:'#fff', weight:3, fillColor:'#2a7fd4', fillOpacity:1}).addTo(capas);
      if(centrar){ if(primera){ mapa.setView([pos.lat, pos.lon], Math.max(mapa.getZoom(), 16), {animate:false}); primera = false; } else mapa.panTo([pos.lat, pos.lon], {animate:false}); } }
  }
  function cerrarMapa(){ if(mapa){ try { mapa.remove(); } catch(e){} mapa = null; capas = null; } }

  function cerrar(){ cerrarMapa(); const m = A && A.actual(); if(!(m && m.ejec && m.ejec.estado!=='fin')) pararGps(); }
  return {abrir, cerrar, siguiente, plan, atraso, enMarcha:()=>watch!==null};
})();
if(typeof globalThis!=='undefined') globalThis.Seguir = Seguir;
