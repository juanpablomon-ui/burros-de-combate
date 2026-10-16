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
  let plegada = false; try { plegada = localStorage.getItem('burros_barra')==='1'; } catch(e){}
  let irSolo = null, eligiendo = null;
  let A = null, watch = null, pos = null, rumboDisp = null, wake = null, mapa = null, capas = null, centrar = true;
  const $ = s=>document.querySelector(s);

  /* ---------- plan de referencia ---------- */
  // lista de puntos válidos con la hora planificada (horas desde la partida) de llegada y salida
  function plan(m){
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
      <button class="btn" data-mm="nav">${ic('ira', 'Vista navegación (números grandes)')}</button><button class="btn" data-mm="reg">${ic('lista', 'Matriz de eventos')}</button>
      <button class="btn" data-mm="pos">${ic('pos', 'Mensaje de posición')}</button><button class="btn" data-mm="hor">${ic('horiz', 'Vuelta al horizonte')}</button></div>
      <div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`, d=>d.querySelectorAll('[data-mm]').forEach(b=>b.onclick = ()=>{ const k = b.dataset.mm; A.cerrarDialogo();
        if(k==='nav' || k==='reg') cambiarModo(k); else if(k==='pos') verMensaje(mensaje('POS', {})); else horizonte(); }));
  }
  // elegir el destino: punto de la ruta, punto de referencia, tocar la carta o escribir la coordenada
  function dialogoIrA(enMarcha){
    const m = A.actual(), P = plan(m), dat = m.datum || 'WGS84', prs = [].concat(...(m.horizontes || []).map(h=>h.prs));
    const vistos = new Set(), ev = P.pts.map((q, k)=>({q, k})).filter(x=>{ const c = x.q.lat.toFixed(5) + ',' + x.q.lon.toFixed(5); if(!x.q.ev || vistos.has(c)) return false; vistos.add(c); return true; }), u = pos ? M.llAUtm(M.deWgs84(pos.lat, pos.lon, 0, dat).lat, M.deWgs84(pos.lat, pos.lon, 0, dat).lon, +m.zona || undefined, M.DATUMS[dat]) : null;
    A.dialogo(`<h3>🧭 Ir a un punto</h3>
      ${enMarcha ? `<p class="nota">«Ir y volver»: al llegar, la app te guía de vuelta al lugar donde dejaste la ruta y la marcha sigue.</p><div class="campos"><label class="c ancho">Después<select id="iMod"><option value="volver">↩ Ir y volver a la ruta</option><option value="solo">■ Solo ir a ese punto</option></select></label></div>` : '<p class="nota">Navegación directa a un punto, sin marcha planificada.</p>'}
      <h4>Un punto de la ruta</h4><div class="s-mas">${ev.map(x=>`<button class="btn" data-ip="${x.k}">◉ ${A.esc(x.q.nombre)}${x.q.clave ? ' · ' + A.esc(x.q.clave) : ''}</button>`).join('')}</div>
      ${prs.length ? `<h4>Un punto de referencia</h4><div class="s-mas">${prs.map((q, i)=>`<button class="btn" data-ir="${i}">▲ ${A.esc(q.nombre)}</button>`).join('')}</div>` : ''}
      <h4>Otro lugar</h4><div class="s-mas"><button class="btn" id="iCarta">✛ Tocarlo en la carta</button></div>
      <div class="campos"><label class="c">Zona<input class="num" id="iZ" value="${u ? u.zona : esc19(m)}" inputmode="numeric"></label><label class="c">Este (m)<input class="num" id="iE" inputmode="numeric" placeholder="${u ? Math.round(u.e) : '350000'}"></label>
        <label class="c">Norte (m)<input class="num" id="iN" inputmode="numeric" placeholder="${u ? Math.round(u.n) : '6300000'}"></label></div>
      <div class="btns"><button class="btn" id="iUtm">Ir a esa coordenada</button><button class="btn" data-cerrar>Cancelar</button></div>
      <p class="nota">Coordenadas en ${A.esc(dat)}.</p>`, d=>{
      const ir = dest=>{ const mo = enMarcha ? d.querySelector('#iMod').value : 'solo'; A.cerrarDialogo(); empezarIrA(dest, enMarcha, mo); };
      d.querySelectorAll('[data-ip]').forEach(b=>b.onclick = ()=>{ const q = P.pts[+b.dataset.ip]; ir({lat:q.lat, lon:q.lon, nombre:rotulo(q)}); });
      d.querySelectorAll('[data-ir]').forEach(b=>b.onclick = ()=>{ const q = prs[+b.dataset.ir]; ir({lat:q.lat, lon:q.lon, nombre:q.nombre}); });
      d.querySelector('#iCarta').onclick = ()=>{ eligiendo = {enMarcha, modo:enMarcha ? d.querySelector('#iMod').value : 'solo'}; A.cerrarDialogo(); if(enMarcha && modo!=='carta') cambiarModo('carta'); A.aviso('Toca el lugar en la carta'); };
      d.querySelector('#iUtm').onclick = ()=>{ const z = +d.querySelector('#iZ').value, e = +d.querySelector('#iE').value, n = +d.querySelector('#iN').value;
        if(!z || !e || !n) return A.aviso('Escribe la zona, el este y el norte');
        const g = M.utmALl(e, n, z, true, M.DATUMS[dat]), w = M.aWgs84(g.lat, g.lon, 0, dat); ir({lat:w.lat, lon:w.lon, nombre:'UTM ' + Math.round(e/1000) + ' ' + Math.round(n/1000)}); };
    });
  }
  const esc19 = m=>+m.zona || 19;
  function empezarIrA(dest, enMarcha, mo){
    const m = A.actual(), E = m.ejec;
    if(enMarcha && E && E.estado!=='fin'){ const P = plan(m), k = siguiente(m, P), q = P.pts[Math.max(0, (k===null ? P.pts.length : k) - 1)];
      E.desvio = {dest, modo:mo, fase:'ida', ini:ahora(), salida:{lat:pos ? pos.lat : q.lat, lon:pos ? pos.lon : q.lon, nombre:'donde dejaste la ruta'}}; A.guardar();
      A.aviso('🧭 Ir a ' + dest.nombre + (mo==='volver' ? ' y volver a la ruta' : '')); }
    else { irSolo = Object.assign({}, dest, {ini:ahora()}); A.aviso('🧭 Navegando a ' + dest.nombre); }
    pintar();
  }
  // navegación sola a un punto (sin marcha): la misma carta con las dos barras
  function pintarSolo(c, P){
    document.body.classList.add('con-mapa');
    c.innerHTML = `<div class="mapa-env s-carta s-dos"><div id="sMapa"></div><div class="s-bsup" id="sCab"></div>
      <div class="s-flecha s-flecha-g desvio" id="sFlecha">↑</div><div class="s-ctrl"><button class="btn" id="sOrient" title="Norte arriba o destino arriba" aria-label="Orientación"></button><button class="btn" id="sCapa" title="Cambiar el mapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" title="Centrar en mi posición" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>
      <div class="s-binf"><button class="btn pri" id="sSoloFin">${ic('fin', 'Terminar la navegación')}</button></div></div>`;
    $('#sSoloFin').onclick = ()=>{ irSolo = null; pintar(); };
    centrar = true; hacerMapa(P); iniciarGps(); pintarSoloVivo();
  }
  function pintarSoloVivo(){
    const c = $('#sCab'); if(!c || !irSolo) return; const P = plan(A.actual());
    const r = pos ? M.rumboEntre(pos, irSolo, P.R.zona, P.R.decl.valor) : null, V = velAhora();
    if(r){ c.dataset.az = r.azM; if(r.dist<=Math.max(40, 15 + (pos.acc || 0)) && !irSolo.llego){ irSolo.llego = true; if(navigator.vibrate) navigator.vibrate([200, 100, 200]); A.aviso('📍 Llegaste a ' + irSolo.nombre); } }
    const dist = r ? (r.dist>=1000 ? A.f(r.dist/1000, 2) + ' km' : A.f(r.dist) + ' m') : '—', cel = (rot, val, sub, cl)=>`<div class="bc"><span>${rot}</span><b class="${cl || ''}">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    c.innerHTML = `<div class="bcs">${cel(irSolo.llego ? 'Llegaste a' : 'Ir a', A.esc(irSolo.nombre), 'en línea recta', 'desv')}${cel('Distancia', dist)}${cel('Rumbo mag.', r ? A.f(r.azM, 0) + '°' : '—', r ? r.mils + ' ‰' : '', 'ocre')}
      ${cel('Ahora', V ? A.f(V, 1) + ' km/h' : '—', V ? M.verRitmo(V) : '')}${cel('Llega aprox.', r ? hh(ahora() + r.dist/1000/(V>1 ? V : 4)*36e5) : '—', 'a ' + A.f(V>1 ? V : 4, 1) + ' km/h')}${cel('GPS', pos ? '±' + Math.round(pos.acc || 0) + ' m' : '—', pos ? '' : 'esperando señal')}</div>`;
    flecha(); if(mapa && capas){ capas.clearLayers(); L.circleMarker([irSolo.lat, irSolo.lon], {radius:12, color:'#6fb3d9', weight:3, fill:false}).addTo(capas);
      if(pos){ L.polyline([[pos.lat, pos.lon], [irSolo.lat, irSolo.lon]], {color:'#6fb3d9', weight:3, dashArray:'6 6'}).addTo(capas); L.circleMarker([pos.lat, pos.lon], {radius:8, color:'#fff', weight:3, fillColor:'#2a7fd4', fillOpacity:1}).addTo(capas);
        if(r) girar(M.rumboEntre(pos, irSolo, P.R.zona, 0).azG); if(centrar) seguirPos(irSolo); } }
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
      pos = {lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy, t:ahora(), vel:p.coords.speed, alt:p.coords.altitude};
      hist.push({t:pos.t, lat:pos.lat, lon:pos.lon, alt:pos.alt, acc:pos.acc}); while(hist.length && pos.t - hist[0].t>6*60000) hist.shift();
      const m = A.actual(), E = m && m.ejec;
      if(irSolo && (!E || E.estado==='fin')){ pintarSoloVivo(); return; }
      if(!E){ pintarPrevio(); return; }   // antes de partir: solo se muestra la posición y la distancia al PIM
      if(E.estado==='fin') return;
      const u = E.track[E.track.length - 1];
      if(!u || M.sobreTramo(pos, {lat:u[0], lon:u[1]}, {lat:u[0], lon:u[1]}).d>10 || pos.t - u[2]>60000){ E.track.push([+pos.lat.toFixed(6), +pos.lon.toFixed(6), pos.t]); if(E.track.length>8000) E.track.splice(0, E.track.length - 8000); }
      // llegada automática
      const P = plan(m), k = P && siguiente(m, P);
      const O = P && objetivo(m, P);
      if(O && E.estado==='marcha'){ if(O.dist!==null && O.dist<=Math.max(40, 15 + (pos.acc||0))) llegarDesvio(true); }
      else if(k!==null && k!==undefined && E.estado==='marcha'){ const d = M.rumboEntre(pos, P.pts[k], P.R.zona, P.R.decl.valor).dist;
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
  const avisoMochila = e=>({deja:'DEJAR LA MOCHILA DE SOSTENIMIENTO', dejaTodo:'DEJAR LAS DOS MOCHILAS', recogeB:'RECOGER LA MOCHILA DE SOSTENIMIENTO',
    recogeA:'RECOGER LA MOCHILA DE ASALTO', recoge:'RECOGER LAS DOS MOCHILAS'})[e] || '';
  function llegar(k, auto){
    const m = A.actual(), E = m.ejec, P = plan(m); if(!E || E.llegadas[k]) return;
    if(!P.pts[k].ev){ E.llegadas[k] = ahora(); A.guardar(); pintarVivo();   // quiebre de la ruta: sin mensaje (solo el aviso de la mochila)
      if(P.pts[k].mochila){ if(navigator.vibrate) navigator.vibrate([200, 100, 200]); A.aviso('🎒 ' + avisoMochila(P.pts[k].mochila) + ' aquí'); } return; }
    for(let j=1; j<k; j++) if(!E.llegadas[j]) E.llegadas[j] = P.pts[j].ev ? -1 : ahora();   // eventos saltados / quiebres ya pasados
    E.llegadas[k] = ahora();
    const d = (E.llegadas[k] - E.inicio)/60000 - P.pts[k].lleg*60, p = P.pts[k];
    if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
    A.aviso((auto ? '📍 ' : '✔ ') + verbo() + ' ' + rotulo(p) + ' — ' + dif(d) + (p.mochila ? ' · 🎒 ' + avisoMochila(p.mochila) : ''));
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
    // uso civil: texto simple para el contacto (sin código del C2); en posición, enlace al mapa
    const msg = Uso.civil() ? Uso.cambiar(txt) + (pos ? '\nhttps://maps.google.com/?q=' + pos.lat.toFixed(5) + ',' + pos.lon.toFixed(5) : '') : txt + '\n' + BDC.codigo(k==='INI' ? 'POS' : k, datos);
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

  /* ---------- pantalla ---------- */
  function abrir(cont, api){
    A = api; cerrarMapa();
    const m = A.actual(), E = m.ejec;
    if(E && E.estado!=='fin'){ iniciarGps(); pantalla(true); }
    cont.innerHTML = '<div id="seguir"></div>';
    if(pendiente){ const d = pendiente; pendiente = null; const en = !!(E && E.estado!=='fin'); if(en) modo = 'carta'; empezarIrA(d, en, en ? 'volver' : 'solo'); return; }
    pintar();
  }
  // tres formas de ver la marcha en curso: carta (mapa a pantalla completa), navegación (números grandes) y registro
  let modo = 'carta'; try { modo = localStorage.getItem('burros_seguir') || 'carta'; } catch(e){}
  const MODOS = [['carta', '🗺 Carta'], ['nav', '🧭 Navegación'], ['reg', '📋 Matriz']];
  function pintar(){
    const c = $('#seguir'); if(!c) return; const m = A.actual(), P = plan(m), E = m.ejec;
    cerrarMapa(); document.body.classList.remove('con-mapa');
    if(!P){ c.innerHTML = `<div class="tarjeta vacio">Completa la ruta (al menos dos puntos con cota) para poder seguir la marcha.</div>`; return; }
    if(irSolo && (!E || E.estado==='fin')) return pintarSolo(c, P);
    if(!E){ // antes de partir: la carta a pantalla completa con el plan encima y el botón de inicio abajo
      document.body.classList.add('con-mapa');
      c.innerHTML = `<div class="mapa-env s-carta"><div id="sMapa"></div>
        <div class="s-hud" id="sPrevio"></div>
        <div class="s-ctrl"><button class="btn" id="sOrient" title="Norte arriba o destino arriba" aria-label="Orientación"></button><button class="btn" id="sCapa" title="Cambiar el mapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" title="Centrar en mi posición" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>
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
        <div class="s-flecha s-flecha-g" id="sFlecha" title="Hacia el próximo punto, según la brújula del teléfono">↑</div>
        <div class="s-ctrl"><button class="btn" id="sOrient" title="Norte arriba o destino arriba" aria-label="Orientación"></button><button class="btn" id="sCapa" title="Cambiar el mapa" aria-label="Mapa">${ic('capa', 'Mapa')}</button><button class="btn" id="sCentrar" title="Centrar en mi posición" aria-label="Centrar">${ic('centro', 'Centrar')}</button></div>
        <div class="s-binf"><button class="btn pri" id="sLleg"></button>${bAlto}<button class="btn" id="sNov">${ic('nov', 'Novedad')}</button>${bIr}<button class="btn" id="sMas">${ic('mas', 'Más')}</button><button class="btn peligro" id="sFin">${ic('fin', 'Fin')}</button></div></div>`;
    } else if(modo==='nav'){
      c.innerHTML = `${sel}<div class="tarjeta" id="sCab"></div>${acc}`;
    } else {
      c.innerHTML = `${sel}<h2>Matriz de eventos</h2>
        <p class="nota">Todos los eventos de la marcha en orden: los planificados (paso por cada punto con su nombre clave y hora prevista) y lo que va ocurriendo
          (hora real, diferencia con el plan, altos, novedades y posición). Lo pendiente se ve en gris.</p>
        <div id="sFicha"></div>${acc}`;
    }
    c.querySelectorAll('[data-smodo]').forEach(b=>b.onclick = ()=>cambiarModo(b.dataset.smodo));
    $('#sAlto').onclick = alto; $('#sNov').onclick = novedad; $('#sFin').onclick = ()=>terminar(false);
    const bp = $('#sPos'), bh = $('#sHor'), bm = $('#sMas'); if(bp) bp.onclick = ()=>verMensaje(mensaje('POS', {})); if(bh) bh.onclick = horizonte; if(bm) bm.onclick = menuMas;
    $('#sIrA').onclick = ()=>{ if(E.desvio) return A.confirmar('¿Cancelar el desvío y volver a seguir la ruta?', ()=>{ terminarDesvio(true); }); dialogoIrA(true); };
    $('#sLleg').onclick = e=>{ const b = e.currentTarget; if(b.dataset.ocupado) return; b.dataset.ocupado = '1'; setTimeout(()=>{ delete b.dataset.ocupado; }, 1500);   // sin doble toque
      if(E.desvio) return llegarDesvio(false); const k = proxEv(m, P); if(k!==null) llegar(k, false); };
    if(modo==='carta'){ centrar = true; hacerMapa(P);
      $('#sCab').onclick = ()=>{ plegada = !plegada; try { localStorage.setItem('burros_barra', plegada ? '1' : ''); } catch(e){} $('#sCab').classList.toggle('plegada', plegada); pintarVivo(); }; }
    pintarVivo();
  }
  function pintarVivo(){
    const m = A.actual(), E = m && m.ejec; if(!E || E.estado==='fin' || !$('#seguir')) return; const P = plan(m);
    const k = siguiente(m, P), q = k!==null ? P.pts[k] : null, ke = proxEv(m, P), p = ke!==null ? P.pts[ke] : null, at = atraso(m, P), t = ahora(), c = $('#sCab');
    const O = objetivo(m, P), b = $('#sLleg'), tl = O ? 'Llegué ' + (O.vuelta ? 'a la ruta' : 'a ' + O.nombre) : p ? verbo() + ' ' + rotulo(p) : ''; if(b && b.dataset.t!==tl){ b.dataset.t = tl; b.innerHTML = ic('ok', A.esc(tl)); }
    ficha(); mapaVivo();
    if(!c) return;
    let dist = '—', rumbo = '—', mils = '', fuera = '', eta = '';
    let quiebre = '';
    if(p && q && pos){ const r = M.rumboEntre(pos, q, P.R.zona, P.R.decl.valor), dr = distRuta(P, pos, k, ke);
      dist = dr>=1000 ? A.f(dr/1000, 2) + ' km' : A.f(dr) + ' m'; rumbo = A.f(r.azM, 0) + '°'; mils = r.mils + ' ‰'; c.dataset.az = r.azM;
      if(k!==ke) quiebre = 'rumbo al próximo quiebre (' + A.f(r.dist) + ' m) · distancia por la ruta';
      const a = P.pts[k - 1], s = M.sobreTramo(pos, a, q); if(s.d>Math.max(120, 3*(pos.acc||0))) fuera = `<div class="alerta">Fuera de la ruta: ${A.f(s.d)} m de la línea</div>`; }
    // desvío («Ir a…»): la distancia y el rumbo son al destino, en línea recta
    if(O){ quiebre = ''; fuera = ''; if(O.dist!==null){ dist = O.dist>=1000 ? A.f(O.dist/1000, 2) + ' km' : A.f(O.dist) + ' m'; rumbo = A.f(O.az, 0) + '°'; mils = O.mils + ' ‰'; c.dataset.az = O.az; } else { dist = '—'; rumbo = '—'; mils = ''; } }
    const fl = $('#sFlecha'); if(fl) fl.classList.toggle('desvio', !!O);
    if(p) eta = 'llega plan ' + hh(E.inicio + p.lleg*3600000) + (at!==null ? ' · estimada ' + hh(E.inicio + p.lleg*3600000 + at*60000) : '');
    const ultAlto = E.estado==='alto' ? E.altos[E.altos.length - 1] : null, cls = at===null ? '' : at>5 ? 'mal' : at< -5 ? 'bien' : '';
    const gps = pos ? 'GPS ±' + Math.round(pos.acc||0) + ' m · ' + utmTxt(pos) : (navigator.geolocation ? 'Esperando señal GPS…' : 'Este equipo no tiene GPS: marca las llegadas a mano');
    const enAlto = (ultAlto ? `<div class="info">⏸ En alto (${A.esc(ultAlto.motivo)}) desde ${hh(ultAlto.ini)} — ${dur(t - ultAlto.ini)}</div>` : '') + (intervalo(m, P) || '');
    if(modo==='carta'){
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
      const avisoGps = !pos ? `<div class="bx">${gps}</div>` : (pos.acc || 0)>30 ? `<div class="bx">GPS poco preciso (±${Math.round(pos.acc)} m)</div>` : '';
      c.innerHTML = plegada ? `<div class="b1">${O ? '🧭 ' : ''}<b>${nom}</b> · ${dist} · <b class="ocre">${rumbo}</b>${at!==null && !O ? ' · ' + atC : ''}<span class="bmas">▾</span></div>${enAlto}${fuera}${avisoGps}`
        : `<div class="bcs">${celdas}</div>${quiebre ? `<div class="bx">↪ ${quiebre}</div>` : ''}${enAlto}${fuera}${avisoGps}`;
    } else {
      c.innerHTML = `<div class="s-estado"><span>⏱ ${dur(t - E.inicio)} de marcha</span><span class="hud-est ${cls}">${at===null ? '' : dif(at)}</span></div>${enAlto}
        ${p || O ? `<div class="s-prox">${O ? `🧭 <b class="clave-tx">${O.vuelta ? 'VOLVER A LA RUTA' : 'IR A ' + A.esc(O.nombre)}</b><small>${A.esc(O.modo)} · en línea recta</small>` : `PRÓXIMO <b class="clave-tx">${A.esc(rotulo(p))}</b><small>${A.esc(p.clave ? p.nombre + (p.obs ? ' · ' + p.obs : '') : p.obs || '')}</small>`}</div>
        <div class="s-grande"><div><span>Distancia</span><b>${dist}</b></div><div><span>Rumbo mag.</span><b class="ocre">${rumbo}</b><small>${mils}</small></div>
          <div class="s-flecha" id="sFlecha" title="Dirección al punto según la brújula del teléfono">↑</div></div>
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
  const decPlan = ()=>{ const m = A && A.actual(), P = m && plan(m); return P ? P.R.decl.valor : 0; };
  function flecha(){
    // panorama del horizonte abierto: mover la línea de la brújula y centrarla
    const g = document.getElementById('hRumbo'), env = document.getElementById('sHorEnv');
    if(g && env && rumboDisp){ const h = rumboDisp.mag ? rumboDisp.h : rumboDisp.h - horDec, x = ((h%360) + 360)%360/360*1440;
      g.setAttribute('transform', 'translate(' + x.toFixed(1) + ',0)'); env.scrollLeft = x - env.clientWidth/2; }
    const f = $('#sFlecha'), c = $('#sCab'); if(!f || !c || c.dataset.az===undefined) return;
    if(!rumboDisp){ f.style.opacity = f.classList.contains('s-flecha-g') ? .9 : .25; if(f.classList.contains('s-flecha-g')) f.style.transform = 'rotate(' + (+c.dataset.az + decPlan() - (giro || 0)) + 'deg)'; f.title = 'Sin brújula: apunta con el norte hacia arriba, como la carta'; return; }
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
      <div class="btns"><button class="btn pri" id="fMsg">📡 Mensaje de fin al C2</button><button class="btn" id="fRes">📊 Resultado y reseña</button><button class="btn" id="fGpx">⬇ Recorrido (GPX)</button><button class="btn" id="fImp">🖨 Imprimir</button><button class="btn peligro" id="fRe">↺ Borrar registro</button></div>
      <p class="nota">En <b>Cuadro → Resultado</b> está la comparación de lo planificado con lo ejecutado (horas, velocidades, altos) y la reseña.</p>`;
    ficha();
    $('#fMsg').onclick = ()=>verMensaje((E.msgs || []).filter(x=>x.k==='FIN').pop()?.msg || mensaje('FIN', {}));
    $('#fGpx').onclick = ()=>{ if(E.track.length<2) return A.aviso('No hay recorrido GPS registrado');
      A.descargar((m.nombre || 'marcha').replace(/[^\w-]+/g, '_') + '_recorrido.gpx', `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Burros de Combate" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${A.esc(m.nombre)} — recorrido real</name><trkseg>
${E.track.map(t=>`<trkpt lat="${t[0]}" lon="${t[1]}"><time>${new Date(t[2]).toISOString()}</time></trkpt>`).join('\n')}
</trkseg></trk></gpx>
`, 'application/gpx+xml'); };
    $('#fImp').onclick = ()=>window.print();
    $('#fRes').onclick = ()=>A.ir('resultado');
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
    mapa.createPane('curvas').style.zIndex = 300; mapa.getPane('curvas').style.pointerEvents = 'none'; ponerCapas();
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
    // con la carta girada no se puede arrastrar bien: al empezar a mover el dedo se endereza (norte arriba) para recorrerla
    { let x0 = null, y0 = null; el.addEventListener('pointerdown', e=>{ x0 = e.clientX; y0 = e.clientY; });
      el.addEventListener('pointermove', e=>{ if(x0===null || giro===null) return; if(Math.hypot(e.clientX - x0, e.clientY - y0)>12){ explorando = true; centrar = false; x0 = null; girar(null); marcarCentrar(); A.aviso('Recorriendo la carta (norte arriba). ◎ para volver a centrar'); } });
      el.addEventListener('pointerup', ()=>{ x0 = null; }); }
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
    if(E.track.length>1) L.polyline(E.track.map(t=>[t[0], t[1]]), {color:'#2a7fd4', weight:4}).addTo(capas);
    const k = siguiente(m, P), ke = proxEv(m, P);
    if(ke!==null){ const e = P.pts[ke]; L.circleMarker([e.lat, e.lon], {radius:13, color:'#fff', weight:3, fill:false}).addTo(capas); }
    const O = objetivo(m, P);
    if(O){ L.circleMarker([O.dest.lat, O.dest.lon], {radius:12, color:'#6fb3d9', weight:3, fill:false}).addTo(capas);
      if(pos) L.polyline([[pos.lat, pos.lon], [O.dest.lat, O.dest.lon]], {color:'#6fb3d9', weight:3, dashArray:'6 6'}).addTo(capas); }
    else if(k!==null && pos){ const q = P.pts[k]; L.polyline([[pos.lat, pos.lon], [q.lat, q.lon]], {color:'#fff', weight:2, dashArray:'4 6', opacity:.9}).addTo(capas); }
    if(pos){ L.circle([pos.lat, pos.lon], {radius:pos.acc||20, color:'#2a7fd4', weight:1, fillOpacity:.12}).addTo(capas);
      L.circleMarker([pos.lat, pos.lon], {radius:8, color:'#fff', weight:3, fillColor:'#2a7fd4', fillOpacity:1}).addTo(capas);
      const dst = O ? O.dest : k!==null ? P.pts[k] : null;
      if(dst){ const az = M.rumboEntre(pos, dst, P.R.zona, 0).azG; girar(az); }
      if(centrar){ if(primera){ mapa.setView([pos.lat, pos.lon], Math.max(mapa.getZoom(), 16), {animate:false}); primera = false; } else seguirPos(); } }
  }
  /* ---------- controles de la carta de Seguir (v0.99, pedido del usuario): orientación, capa del mapa y centrado ----------
     Norte arriba (el destino queda donde está en la carta) o destino arriba (la carta gira para que el punto al que se va quede siempre
     arriba; se gira el contenedor del mapa, que se agranda a la diagonal para no dejar esquinas vacías; arrastrar queda desactivado).
     La capa (topográfica, satélite…) y las curvas se guardan en la misma preferencia del Mapa (`burros_mapa`). Centrado: sigue la posición;
     al mover la carta con el dedo se suelta y el botón ◎ se ilumina para volver a centrar. */
  let orient = 'norte'; try { orient = localStorage.getItem('burros_orient') || 'norte'; } catch(e){}
  let capaS = null, curvasS = null, giro = null;
  const prefMapa = ()=>{ try { return JSON.parse(localStorage.getItem('burros_mapa') || '{}'); } catch(e){ return {}; } };
  function ponerCapas(){
    if(!mapa) return; const pr = prefMapa(), base = Mapa.BASES[pr.base] ? pr.base : 'topo', b = Mapa.BASES[base];
    if(capaS) mapa.removeLayer(capaS); capaS = L.tileLayer(b.url, Object.assign({crossOrigin:'anonymous'}, b.o)).addTo(mapa);
    if(curvasS){ mapa.removeLayer(curvasS); curvasS = null; }
    if(pr.curvas!==false && typeof Curvas!=='undefined') curvasS = Curvas.capa({claro:base==='sat', pane:'curvas'}).addTo(mapa);
  }
  function marcarCentrar(){ const b = $('#sCentrar'); if(b) b.classList.toggle('pri', !centrar || explorando); }
  function controles(){
    const bo = $('#sOrient'), bc = $('#sCapa'), bz = $('#sCentrar'); if(!bo) return;
    const rotO = ()=>{ bo.innerHTML = orient==='destino' ? ic('dest', 'Destino') : ic('norte', 'Norte'); bo.classList.toggle('on', orient==='destino'); }; rotO();
    bo.onclick = ()=>{ orient = orient==='norte' ? 'destino' : 'norte'; try { localStorage.setItem('burros_orient', orient); } catch(e){}
      rotO(); if(orient==='norte') girar(null);
      A.aviso(orient==='destino' ? 'Destino arriba: la carta gira hacia el punto al que vas' : 'Norte arriba'); if(irSolo) pintarSoloVivo(); else { mapaVivo(); } };
    bc.onclick = ()=>{ const pr = prefMapa();
      A.dialogo(`<h3>🗺 Mapa</h3><div class="s-mas">${Object.entries(Mapa.BASES).map(([k, b])=>`<button class="btn${(pr.base || 'topo')===k ? ' pri' : ''}" data-cb="${k}">${b.n}</button>`).join('')}</div>
        <label class="nota" style="display:block"><input type="checkbox" id="cCurv" ${pr.curvas!==false ? 'checked' : ''} style="width:auto;vertical-align:middle"> Curvas de nivel</label>
        <div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`, d=>{
        const guardarPr = o=>{ try { localStorage.setItem('burros_mapa', JSON.stringify(Object.assign(prefMapa(), o))); } catch(e){} ponerCapas(); };
        d.querySelectorAll('[data-cb]').forEach(b=>b.onclick = ()=>{ guardarPr({base:b.dataset.cb}); A.cerrarDialogo(); });
        d.querySelector('#cCurv').onchange = e=>guardarPr({curvas:e.target.checked}); }); };
    bz.onclick = ()=>{ centrar = true; explorando = false; marcarCentrar(); zoomListo = false; if(pos && mapa) seguirPos(); else A.aviso('Esperando señal GPS…'); };
    marcarCentrar();
  }
  // girar la carta: az = rumbo geográfico al destino (null = norte arriba)
  let explorando = false;
  function girar(az){
    const el = $('#sMapa'); if(!el || !mapa) return; const cont = el.parentElement;
    if(az===null || az===undefined || orient!=='destino' || explorando){ if(giro!==null){ giro = null; el.style.cssText = ''; delete el.dataset.dims; mapa.dragging.enable(); mapa.invalidateSize({animate:false}); } return; }
    const w = cont.clientWidth, h = cont.clientHeight, D = Math.ceil(Math.hypot(w, h)), dims = w + 'x' + h;
    if(giro===null || el.dataset.dims!==dims){ el.dataset.dims = dims; el.style.cssText = `position:absolute;inset:auto;right:auto;bottom:auto;width:${D}px;height:${D}px;left:${(w - D)/2}px;top:${(h - D)/2}px;transition:transform .6s`; mapa.dragging.disable(); mapa.invalidateSize({animate:false}); }
    giro = az; el.style.transform = 'rotate(' + (-az) + 'deg)'; flecha();
  }
  addEventListener('resize', ()=>setTimeout(()=>{ if(giro!==null) girar(giro); if(centrar && pos && mapa) mapa.panTo([pos.lat, pos.lon], {animate:false}); }, 350));
  // seguir la posición: centrada; la primera vez, con un acercamiento que deja ver el destino
  let zoomListo = false;
  function seguirPos(dest){
    if(!mapa || !pos) return;
    if(!zoomListo && dest){ zoomListo = true; const dy = dest.lat - pos.lat, dx = dest.lon - pos.lon, z = mapa.getBoundsZoom(L.latLngBounds([[pos.lat - dy, pos.lon - dx], [pos.lat + dy, pos.lon + dx]]), false, L.point(70, 170));
      mapa.setView([pos.lat, pos.lon], Math.max(12, Math.min(17, z)), {animate:false}); }
    else mapa.panTo([pos.lat, pos.lon], {animate:false});
  }
  function cerrarMapa(){ if(mapa){ try { mapa.remove(); } catch(e){} mapa = null; capas = null; } capaS = null; curvasS = null; giro = null; zoomListo = false; explorando = false; }

  function cerrar(){ cerrarMapa(); const m = A && A.actual(); if(!(m && m.ejec && m.ejec.estado!=='fin')) pararGps(); }
  // desde el Mapa: «Navegar hasta aquí» (con una marcha en curso, como desvío que vuelve a la ruta)
  let pendiente = null; function irA(dest){ pendiente = dest; }   // se aplica al abrir la pestaña Seguir
  return {abrir, cerrar, siguiente, plan, atraso, irA, enMarcha:()=>watch!==null};
})();
if(typeof globalThis!=='undefined') globalThis.Seguir = Seguir;
