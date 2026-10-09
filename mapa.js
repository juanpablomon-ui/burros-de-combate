/* BURROS DE COMBATE — la ruta sobre el mapa o la carta.
   Capas: topográfica (OpenTopoMap, con curvas de nivel), satélite (Esri), topográfica Esri y calles (OpenStreetMap),
   y cartas propias (imagen JPG/PNG de la carta IGM, calzada con dos puntos de coordenadas conocidas; se guardan en IndexedDB).
   Cuadrícula UTM en el datum de la marcha (coincide con la de la carta). Tocar el mapa agrega puntos; arrastrarlos los mueve;
   tocar la línea inserta un punto; la cota se toma sola del modelo de terreno (dem.js) si el campo está vacío o era automático. */
const Mapa = (function(){
  const M = MARCHA;
  const BASES = {
    topo:  {n:'Topográfica', url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', o:{maxZoom:17, subdomains:'abc', attribution:'© OpenTopoMap (CC-BY-SA) · © OpenStreetMap'}},
    sat:   {n:'Satélite', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', o:{maxZoom:19, attribution:'Esri World Imagery'}},
    etopo: {n:'Topo Esri', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', o:{maxZoom:19, attribution:'Esri World Topo'}},
    calles:{n:'Calles', url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', o:{maxZoom:19, attribution:'© OpenStreetMap'}}
  };
  let map = null, A = null, capaBase = null, capaRuta = null, capaGrid = null, cartasCapa = {}, agregar = false, sel = null, deshacer = [];
  const pref = {base:'topo', grid:true, perfil:false, curvas:true};
  try { Object.assign(pref, JSON.parse(localStorage.getItem('burros_mapa') || '{}')); } catch(e){}
  const guardarPref = ()=>{ try { localStorage.setItem('burros_mapa', JSON.stringify(pref)); } catch(e){} };
  const $ = (s, r)=>(r || document).querySelector(s);

  /* ---------- cartas propias (IndexedDB) ---------- */
  const BD = (()=>{ let db = null;
    const abrir = ()=>db ? Promise.resolve(db) : new Promise((res, rej)=>{ const r = indexedDB.open('burros_cartas', 1);
      r.onupgradeneeded = ()=>r.result.createObjectStore('cartas', {keyPath:'id'}); r.onsuccess = ()=>{ db = r.result; res(db); }; r.onerror = ()=>rej(r.error); });
    const tx = (modo, fn)=>abrir().then(d=>new Promise((res, rej)=>{ const t = d.transaction('cartas', modo), s = t.objectStore('cartas'), r = fn(s); t.oncomplete = ()=>res(r && r.result); t.onerror = ()=>rej(t.error); }));
    return {todas:()=>tx('readonly', s=>s.getAll()), poner:c=>tx('readwrite', s=>s.put(c)), borrar:id=>tx('readwrite', s=>s.delete(id))};
  })();

  /* ---------- abrir el mapa en un contenedor ---------- */
  function abrir(cont, api){
    A = api; cerrar(); sel = null; cartasCapa = {};
    const m = A.actual(); agregar = !A.calcular(m).puntos.some(p=>p.ok);
    cont.innerHTML = `<div class="mapa-env">
      <div id="mapa"></div>
      <div class="m-sup">
        <div class="seg m-bases">${Object.entries(BASES).map(([k, b])=>`<button data-base="${k}" class="${pref.base===k ? 'on' : ''}">${b.n}</button>`).join('')}</div>
        <button class="btn mini ${pref.grid ? 'on' : ''}" id="mGrid" title="Cuadrícula UTM">▦ UTM</button>
        <button class="btn mini ${pref.curvas ? 'on' : ''}" id="mCurvas" title="Curvas de nivel sobre cualquier capa">〰 Curvas</button>
        <button class="btn mini" id="mCartas" title="Cartas propias">🗺 Cartas</button>
      </div>
      <div class="m-lectura mono" id="mLect"></div>
      <div class="m-cruz"></div>
      <div class="m-hoja" id="mHoja" hidden></div>
      <div class="m-inf">
        <div class="m-perfil" id="mPerfil" hidden></div>
        <div class="m-res mono" id="mRes"></div>
        <div class="m-acc">
          <button class="btn ${agregar ? 'pri' : ''}" id="mAgregar">＋ Agregar puntos</button>
          <button class="btn" id="mDeshacer" title="Deshacer">↶</button>
          <button class="btn" id="mEncuadrar" title="Ver toda la ruta">⤢</button>
          <button class="btn" id="mYo" title="Mi posición">◎</button>
          <button class="btn ${pref.perfil ? 'on' : ''}" id="mPerf" title="Perfil del terreno">⛰ Perfil</button>
        </div>
      </div>
    </div>`;
    const ok = A.calcular(m).puntos.filter(p=>p.ok);
    map = L.map($('#mapa', cont), {zoomControl:true, attributionControl:true, doubleClickZoom:false}).setView(ok.length ? [ok[0].lat, ok[0].lon] : [-33.45, -70.66], ok.length ? 14 : 9);
    if(ok.length>1) map.fitBounds(L.latLngBounds(ok.map(p=>[p.lat, p.lon])), {padding:[40, 40], animate:false});
    else if(A.vistaMapa) map.setView(A.vistaMapa.c, A.vistaMapa.z, {animate:false});
    ponerBase(pref.base, true);
    map.createPane('cartas').style.zIndex = 250;
    map.createPane('curvas').style.zIndex = 300; map.getPane('curvas').style.pointerEvents = 'none';
    capaGrid = L.layerGroup().addTo(map); capaRuta = L.layerGroup().addTo(map);
    map.on('moveend', ()=>{ A.vistaMapa = {c:map.getCenter(), z:map.getZoom()}; grid(); lectura(map.getCenter()); });
    map.on('mousemove', e=>lectura(e.latlng, true));
    map.on('click', e=>{ cerrarMenu(); if(ubicando!==null) return ponerUbicado(e.latlng); if(agregar) agregarPunto(e.latlng); else cerrarHoja(); });
    map.on('contextmenu', e=>{ L.DomEvent.preventDefault(e); menuLugar(e.latlng, e.originalEvent); });
    map.on('movestart zoomstart', cerrarMenu);
    // botones
    cont.querySelectorAll('[data-base]').forEach(b=>b.onclick = ()=>{ pref.base = b.dataset.base; guardarPref(); ponerBase(pref.base); curvas();
      cont.querySelectorAll('[data-base]').forEach(x=>x.classList.toggle('on', x===b)); });
    $('#mCurvas').onclick = e=>{ pref.curvas = !pref.curvas; guardarPref(); e.currentTarget.classList.toggle('on', pref.curvas); curvas();
      if(pref.curvas && map.getZoom()<10) A.aviso('Acerca el mapa para ver las curvas de nivel'); };
    $('#mGrid').onclick = e=>{ pref.grid = !pref.grid; guardarPref(); e.currentTarget.classList.toggle('on', pref.grid); grid(); };
    $('#mAgregar').onclick = ()=>{ agregar = !agregar; $('#mAgregar').classList.toggle('pri', agregar); cont.querySelector('.mapa-env').classList.toggle('agregando', agregar);
      A.aviso(agregar ? 'Toca el mapa para agregar puntos en orden de marcha' : 'Modo agregar desactivado'); };
    cont.querySelector('.mapa-env').classList.toggle('agregando', agregar);
    $('#mDeshacer').onclick = ()=>{ const u = deshacer.pop(); if(!u) return A.aviso('Nada que deshacer'); A.actual().puntos = u; A.guardar(); cerrarHoja(); ruta(); };
    $('#mEncuadrar').onclick = encuadrar;
    $('#mYo').onclick = miPosicion;
    $('#mCartas').onclick = dialogoCartas;
    $('#mPerf').onclick = e=>{ pref.perfil = !pref.perfil; guardarPref(); e.currentTarget.classList.toggle('on', pref.perfil); perfil(); };
    cargarCartas(); ruta(); grid(); lectura(map.getCenter()); perfil(); curvas();
    ubicando = null; if(A.ubicar!==undefined && A.ubicar!==null){ const k = A.ubicar; A.ubicar = null; agregar = false; const b = $('#mAgregar'); if(b) b.classList.remove('pri'); modoUbicar(k); }
    const este = map; setTimeout(()=>{ if(map===este) map.invalidateSize({animate:false}); }, 50);
    return map;
  }
  // curvas de nivel calculadas del modelo de terreno (claras sobre el satélite, café sobre los mapas)
  let capaCurvas = null;
  function curvas(){
    if(!map) return; if(capaCurvas){ map.removeLayer(capaCurvas); capaCurvas = null; }
    if(pref.curvas) capaCurvas = Curvas.capa({claro:pref.base==='sat', pane:'curvas'}).addTo(map);
  }
  function ponerBase(k){ if(capaBase) map.removeLayer(capaBase); const b = BASES[k] || BASES.topo; capaBase = L.tileLayer(b.url, Object.assign({crossOrigin:'anonymous'}, b.o)).addTo(map); }
  function encuadrar(){ const ok = A.calcular(A.actual()).puntos.filter(p=>p.ok); if(!ok.length) return A.aviso('Aún no hay puntos');
    if(ok.length===1) map.setView([ok[0].lat, ok[0].lon], 15); else map.fitBounds(L.latLngBounds(ok.map(p=>[p.lat, p.lon])), {padding:[40, 40]}); }
  function miPosicion(){
    if(!navigator.geolocation) return A.aviso('Este equipo no entrega la posición');
    if(!window.isSecureContext) return A.dialogo(`<h3>◎ Mi posición</h3><p class="nota">La posición solo funciona con una dirección segura (https).
      Abre la app desde <b>https://juanpablomon-ui.github.io/burros-de-combate/</b>.</p><div class="btns"><button class="btn" data-cerrar>Entendido</button></div>`);
    A.aviso('Buscando posición…');
    const poner = p=>{ const ll = [p.coords.latitude, p.coords.longitude];
      map.setView(ll, Math.max(map.getZoom(), 15));
      L.circleMarker(ll, {radius:8, color:'#6fb3d9', fillColor:'#6fb3d9', fillOpacity:.5}).addTo(capaRuta).bindTooltip('Mi posición (±' + Math.round(p.coords.accuracy) + ' m)').openTooltip(); };
    // en el computador no hay GPS: la posición sale del Wi-Fi; si la de alta precisión falla o demora, se pide la normal
    const fallo = e=>{
      const pc = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent), mac = /Mac/i.test(navigator.platform || navigator.userAgent);
      const txt = e.code===1 ? (pc ? `El navegador o el computador no dan permiso para la ubicación.<br><br><b>1.</b> En la barra de direcciones, toca el ícono a la izquierda de la dirección y deja <b>Ubicación: Permitir</b>.<br>
          <b>2.</b> ${mac ? 'En el Mac: <b>Configuración del Sistema → Privacidad y seguridad → Localización</b>: actívala y activa tu navegador (Chrome, Safari o Edge).' : 'En Windows: <b>Configuración → Privacidad y seguridad → Ubicación</b>: actívala y permite que las apps de escritorio la usen.'}<br>
          <b>3.</b> Vuelve a cargar la página y toca ◎ otra vez.` : 'No hay permiso para la ubicación: actívalo en los ajustes del teléfono para el navegador y vuelve a intentar.')
        : e.code===2 ? (pc ? 'El computador no pudo calcular dónde está. Sin GPS, la posición sale del <b>Wi-Fi</b>: revisa que el Wi-Fi esté encendido (aunque uses cable) y que la Localización del sistema esté activa.' : 'Sin señal GPS: sal a un lugar abierto y vuelve a intentar.')
        : 'La posición demoró demasiado. Vuelve a intentar' + (pc ? ' (en el computador sale del Wi-Fi y puede tardar).' : ' en un lugar abierto.');
      A.dialogo(`<h3>◎ No se pudo obtener la posición</h3><p class="nota">${txt}</p><div class="btns"><button class="btn" data-cerrar>Entendido</button></div>`); };
    navigator.geolocation.getCurrentPosition(poner, e=>{ if(e.code===1) return fallo(e);
      navigator.geolocation.getCurrentPosition(poner, fallo, {enableHighAccuracy:false, timeout:20000, maximumAge:600000}); }, {enableHighAccuracy:true, timeout:10000});
  }

  /* ---------- lectura de coordenadas (en el datum de la marcha) ---------- */
  function lectura(ll, raton){
    const m = A.actual(), d = m.datum || 'WGS84', g = M.deWgs84(ll.lat, ll.lng, 0, d), u = M.llAUtm(g.lat, g.lon, +m.zona || undefined, M.DATUMS[d]);
    $('#mLect').textContent = (raton ? '' : '✛ ') + u.zona + M.banda(g.lat) + '  ' + A.f(u.e) + ' E  ' + A.f(u.n) + ' N  ·  ' + (d==='WGS84' ? 'WGS84' : d.replace(/[NSM]$/, '')) + '  ·  ' + escala();
  }
  function escala(){ const c = map.getCenter(), mpp = 40075016.686*Math.cos(c.lat*Math.PI/180)/Math.pow(2, map.getZoom() + 8);
    const s = mpp/0.000264583; const r = [5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000].find(x=>x>=s*0.8) || Math.round(s);
    return '≈1:' + A.f(r); }

  /* ---------- cuadrícula UTM ---------- */
  function grid(){
    capaGrid.clearLayers(); if(!pref.grid || !map) return;
    const z = map.getZoom(); if(z<9) return;
    const m = A.actual(), d = m.datum || 'WGS84', el = M.DATUMS[d], b = map.getBounds(), c = map.getCenter();
    const zona = +m.zona || Math.floor((c.lng + 180)/6) + 1, sur = c.lat<0;
    const aUtm = (lat, lon)=>{ const g = M.deWgs84(lat, lon, 0, d); return M.llAUtm(g.lat, g.lon, zona, el); };
    const aLL = (e, n)=>{ const g = M.utmALl(e, n, zona, sur, el), w = M.aWgs84(g.lat, g.lon, 0, d); return [w.lat, w.lon]; };
    const esq = [aUtm(b.getSouth(), b.getWest()), aUtm(b.getSouth(), b.getEast()), aUtm(b.getNorth(), b.getWest()), aUtm(b.getNorth(), b.getEast())];
    const e0 = Math.min(...esq.map(u=>u.e)), e1 = Math.max(...esq.map(u=>u.e)), n0 = Math.min(...esq.map(u=>u.n)), n1 = Math.max(...esq.map(u=>u.n));
    const paso = z>=12 ? 1000 : 10000; if((e1 - e0)/paso>60 || (n1 - n0)/paso>60) return;
    const est = {color:'#1d3b8a', weight:z>=14 ? 1.1 : 0.8, opacity:.55, interactive:false};
    const lab = (ll, t, cls)=>L.marker(ll, {interactive:false, icon:L.divIcon({className:'m-gridlab ' + cls, html:t, iconSize:null})}).addTo(capaGrid);
    const km = v=>{ const k = Math.round(v/1000); return paso>=10000 ? String(k) : '<small>' + Math.floor(k/100) + '</small>' + String(k%100).padStart(2, '0'); };
    for(let e = Math.ceil(e0/paso)*paso; e<=e1; e += paso){
      const ps = []; for(let i=0; i<=10; i++) ps.push(aLL(e, n0 + (n1 - n0)*i/10));
      L.polyline(ps, est).addTo(capaGrid);
      const p = map.latLngToContainerPoint(aLL(e, n0)); lab(map.containerPointToLatLng([p.x, map.getSize().y - 70]), km(e), 'v');
    }
    for(let n = Math.ceil(n0/paso)*paso; n<=n1; n += paso){
      const ps = []; for(let i=0; i<=10; i++) ps.push(aLL(e0 + (e1 - e0)*i/10, n));
      L.polyline(ps, est).addTo(capaGrid);
      const p = map.latLngToContainerPoint(aLL(e0, n)); lab(map.containerPointToLatLng([4, p.y]), km(n), 'h');
    }
  }

  /* ---------- la ruta ---------- */
  const colPte = p=>{ const a = Math.abs(p); return a<0.05 ? '#3f8f2a' : a<0.15 ? '#c9a400' : a<0.3 ? '#e08a1a' : '#d43d1f'; };
  function ruta(){
    if(!map) return; capaRuta.clearLayers();
    const m = A.actual(), R = A.calcular(m), ok = R.puntos;
    const llega = {}; R.tramos.forEach(t=>{ llega[t.iB] = t; });
    // tramos coloreados por pendiente (tocar para insertar un punto)
    R.tramos.forEach(t=>{ const a = ok[t.iA], b = ok[t.iB];
      const ln = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {color:'#14150f', weight:9, opacity:.55}).addTo(capaRuta);
      const l2 = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {color:colPte(t.pte), weight:5, opacity:.95}).addTo(capaRuta);
      [ln, l2].forEach(x=>{ x.on('click', e=>{ L.DomEvent.stop(e); insertar(t.iB, e.latlng); });
        x.on('contextmenu', e=>{ L.DomEvent.stop(e); L.DomEvent.preventDefault(e); menuTramo(t, e.latlng, e.originalEvent); }); });
      l2.bindTooltip(`${A.esc(t.de)} → ${A.esc(t.a)}: ${A.f(t.dist)} m · ${t.dv>=0 ? '+' : ''}${A.f(t.dv)} m (${A.f(t.pte*100, 0)} %) · rumbo ${A.f(t.azM, 0)}° / ${t.mils} ‰ · ${M.verDur(t.t)}`, {sticky:true});
    });
    // los puntos en el mismo lugar (ida y vuelta) van en un solo marcador; al arrastrarlo se mueven todos
    const grupos = new Map(), nEv = {}; R.eventos.forEach((i, k)=>nEv[i] = k + 1);
    ok.forEach((p, i)=>{ if(!p.ok) return;
      if(!p.ev){ // punto de ruta: solo marca el camino
        const mk = L.marker([p.lat, p.lon], {icon:L.divIcon({className:'m-ruta' + (sel===i ? ' sel' : ''), iconSize:[14, 14], iconAnchor:[7, 7]}), draggable:true, autoPan:true}).addTo(capaRuta);
        mk.on('click', e=>{ L.DomEvent.stop(e); abrirHoja(i); });
        mk.on('contextmenu', e=>{ L.DomEvent.stop(e); L.DomEvent.preventDefault(e); menuPunto([i], e.originalEvent); });
        mk.on('dragstart', ()=>guardarDeshacer()); mk.on('dragend', e=>mover(i, e.target.getLatLng()));
        return; }
      const k = p.lat.toFixed(5) + ',' + p.lon.toFixed(5); if(!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(i); });
    grupos.forEach(ids=>{
      const p = ok[ids[0]], horas = ids.map(i=>llega[i] ? M.verHora(llega[i].llegada) : (i===0 ? M.verHora(R.res.partida) : '')).filter(Boolean);
      const nombres = [...new Set(ids.map(i=>ok[i].nombre))], cls = [...new Set(ids.map(i=>ok[i].clave).filter(Boolean))];
      const ic = L.divIcon({className:'m-pto' + (ids.includes(sel) ? ' sel' : '') + (ids.includes(0) ? ' ini' : '') + (ids.length>1 ? ' multi' : ''), iconSize:[26, 26], iconAnchor:[13, 13],
        html:`<span class="n">${ids.map(i=>nEv[i]).join('·')}</span><span class="et"${ids.length>1 ? ` style="left:${ids.map(i=>nEv[i]).join('·').length*7.5 + 18}px"` : ''}>${cls.length ? `<i class="clave">${A.esc(cls.join(' / '))}</i> ` : ''}<b>${A.esc(nombres.join(' / '))}</b> ${isNaN(p.cota) ? '' : A.f(p.cota) + ' m'}${horas.length ? ' · ' + horas.join(' / ') : ''}</span>`});
      const mk = L.marker([p.lat, p.lon], {icon:ic, draggable:true, autoPan:true}).addTo(capaRuta);
      mk.on('click', e=>{ L.DomEvent.stop(e); abrirHoja(ids.includes(sel) && ids.length>1 ? ids[(ids.indexOf(sel) + 1)%ids.length] : ids[0]); });
      mk.on('contextmenu', e=>{ L.DomEvent.stop(e); L.DomEvent.preventDefault(e); menuPunto(ids, e.originalEvent); });
      mk.on('dragstart', ()=>guardarDeshacer());
      mk.on('dragend', e=>{ const ll = e.target.getLatLng(); ids.forEach(i=>mover(i, ll, true)); A.guardar(); ruta(); ids.forEach(i=>cotaAuto(i)); if(ids.includes(sel)) abrirHoja(sel); });
    });
    resumen(R);
    if(pref.perfil){ clearTimeout(ruta._t); ruta._t = setTimeout(perfil, 400); }
  }

  /* ---------- perfil bajo el mapa: al pasar el dedo o el mouse se marca el lugar en el mapa ---------- */
  let capaCursor = null, terrenoAct = null;
  function perfil(){
    const el = $('#mPerfil'); if(!el || !map) return;
    if(!pref.perfil){ el.hidden = true; if(capaCursor) capaCursor.clearLayers(); return; }
    el.hidden = false; const R = A.calcular(A.actual());
    if(!R.tramos.length){ el.innerHTML = '<div class="nota" style="padding:10px">Marca al menos dos puntos para ver el perfil.</div>'; return; }
    const dibujar = T=>{ terrenoAct = T; el.innerHTML = A.svgPerfil(R, T, Math.max(420, Math.min(1000, Math.round((el.clientWidth || 600)*1.4)))) + `<div class="m-perfil-txt nota mono">${T ? '■ terreno real (SRTM) · ' : ''}— línea entre puntos · ${A.f(R.res.dist/1000, 2)} km · +${A.f(R.res.sube)}/−${A.f(R.res.baja)} m</div>`; cursor(el, R); };
    dibujar(null);
    A.terrenoDe(R).then(T=>{ if(T && pref.perfil && $('#mPerfil')===el) dibujar(T); });
  }
  function cursor(el, R){
    const sv = el.querySelector('svg'); if(!sv) return;
    if(!capaCursor) capaCursor = L.layerGroup().addTo(map);
    const x0 = +sv.dataset.x0, x1 = +sv.dataset.x1, D = +sv.dataset.d, y0 = +sv.dataset.y0, y1 = +sv.dataset.y1, ar = +sv.dataset.ar, alto = +sv.dataset.alto;
    const g = sv.querySelector('#pCursor');
    const mover = e=>{
      const r = sv.getBoundingClientRect(), VW = sv.viewBox.baseVal.width, vx = (e.clientX - r.left)/r.width*VW, d = Math.max(0, Math.min(D, (vx - x0)/(x1 - x0)*D));
      const t = R.tramos.find(t=>t.distAcum>=d) || R.tramos[R.tramos.length - 1], ini = t.distAcum - t.dist, fr = t.dist ? (d - ini)/t.dist : 0;
      const a = R.puntos[t.iA], b = R.puntos[t.iB], lat = a.lat + (b.lat - a.lat)*fr, lon = a.lon + (b.lon - a.lon)*fr;
      let z = t.cotaIni + (t.cotaFin - t.cotaIni)*fr;
      if(terrenoAct){ let mejor = terrenoAct[0]; terrenoAct.forEach(p=>{ if(Math.abs(p.x - d)<Math.abs(mejor.x - d)) mejor = p; }); z = mejor.z; }
      const X = x0 + (x1 - x0)*d/D, Yc = ar + alto - alto*(z - y0)/(y1 - y0 || 1);
      g.style.display = ''; g.querySelector('line').setAttribute('x1', X); g.querySelector('line').setAttribute('x2', X);
      g.querySelector('circle').setAttribute('cx', X); g.querySelector('circle').setAttribute('cy', Yc);
      const tx = g.querySelector('text'); tx.setAttribute('x', X + (X>VW*0.75 ? -8 : 8)); tx.setAttribute('text-anchor', X>VW*0.75 ? 'end' : 'start');
      tx.textContent = A.f(d/1000, 2) + ' km · ' + A.f(z) + ' m';
      capaCursor.clearLayers();
      L.circleMarker([lat, lon], {radius:8, color:'#fff', weight:3, fillColor:'#e86a4c', fillOpacity:1, interactive:false}).addTo(capaCursor);
      lectura(L.latLng(lat, lon), true);
    };
    sv.addEventListener('pointermove', mover); sv.addEventListener('pointerdown', mover);
    sv.addEventListener('pointerleave', ()=>{ g.style.display = 'none'; capaCursor.clearLayers(); });
  }
  function resumen(R){
    const r = R.res, e = $('#mRes'); if(!e) return;
    e.innerHTML = R.tramos.length ? `<b>${A.f(r.dist/1000, 2)} km</b> · +${A.f(r.sube)}/−${A.f(r.baja)} m · ${M.verDur(r.total)} · término <b>${M.verHora(r.termino)}</b>`
      : (R.puntos.filter(p=>p.ok).length ? 'Agrega el siguiente punto' : 'Toca el mapa para poner el PIM');
  }
  // si los nombres siguen el patrón PIM, PC1, PC2… sin repetirse, se renumeran en orden al insertar o borrar
  function renumerar(m){
    const R = A.calcular(m), ev = R.eventos.slice(1).filter(i=>i!==R.eventos[R.eventos.length - 1] || m.puntos[i].ev);   // eventos intermedios (y el final si fue marcado)
    const ns = ev.map(i=>m.puntos[i].nombre);
    if(new Set(ns).size!==ns.length || !ns.every(n=>!n || /^PC\d+$/.test(n))) return;
    ev.forEach((i, k)=>{ m.puntos[i].nombre = 'PC' + (k + 1); });
  }
  function guardarDeshacer(){ deshacer.push(JSON.parse(JSON.stringify(A.actual().puntos))); if(deshacer.length>30) deshacer.shift(); }
  function campos(m, ll, base){
    const tipo = base && base.tipo || (m.puntos.length ? m.puntos[m.puntos.length - 1].tipo : 'UTM');
    return Object.assign({tipo}, M.camposDesde(ll.lat, ll.lng, tipo, m.datum, +m.zona || undefined));
  }
  // el punto nuevo ocupa el primer punto sin coordenadas (los de una marcha nueva) o va al final
  const vacio = p=>p.tipo==='GEO' ? (p.lat==='' || p.lat===undefined) && (p.lon==='' || p.lon===undefined) : (p.e==='' || p.e===undefined) && (p.n==='' || p.n===undefined);
  function agregarPunto(ll){
    const m = A.actual(); guardarDeshacer();
    let i = m.puntos.findIndex(vacio);
    if(i<0){ m.puntos.push(A.punto('', Object.assign(campos(m, ll), {ev:false}))); i = m.puntos.length - 1; }
    else Object.assign(m.puntos[i], campos(m, ll, m.puntos[i]));
    if(i===0){ m.puntos[0].ev = true; if(!m.puntos[0].nombre) m.puntos[0].nombre = 'PIM'; }
    A.guardar(); ruta(); cotaAuto(i);
  }
  function insertar(pos, ll){
    const m = A.actual(); guardarDeshacer();
    const p = A.punto('', Object.assign(campos(m, ll, m.puntos[pos]), {ev:false})); m.puntos.splice(pos, 0, p);
    A.guardar(); ruta(); cotaAuto(pos); A.aviso('Punto de ruta insertado (márcalo como evento si se informa por radio)'); abrirHoja(pos);
  }
  function mover(i, ll, sinDibujar){
    const m = A.actual(), p = m.puntos[i]; Object.assign(p, campos(m, ll, p));
    if(p.cotaAuto) p.cota = '';
    if(sinDibujar) return;
    A.guardar(); ruta(); cotaAuto(i); if(sel===i) abrirHoja(i);
  }
  // cota del modelo de terreno si el campo está vacío o era automático (lo escrito a mano no se toca)
  function cotaAuto(i){
    const m = A.actual(), p = m.puntos[i]; if(!p || (p.cota!=='' && !p.cotaAuto)) return;
    const g = A.calcular(m).puntos[i]; if(!g || g.lat===undefined || g.lat===null) return;
    DEM.cotaPunto(g.lat, g.lon).then(r=>{
      if(!r){ A.aviso('Sin cota automática (¿sin internet?): escríbela desde la carta'); return; }
      if(A.actual()!==m || m.puntos[i]!==p) return;
      p.cota = Math.round(r.v); p.cotaAuto = true; p.cotaSrc = r.src; A.guardar(); ruta(); if(sel===i) abrirHoja(i);
    });
  }

  /* ---------- hoja de edición de un punto ---------- */
  function abrirHoja(i){
    sel = i; const m = A.actual(), p = m.puntos[i], R = A.calcular(m), g = R.puntos[i], h = $('#mHoja'); if(!p || !h) return;
    const t = R.tramos.find(x=>x.iB===i), s = R.tramos.find(x=>x.iA===i);
    h.hidden = false;
    const fijo = R.eventos[0]===i || R.eventos[R.eventos.length - 1]===i, esEv = g && g.ev;
    h.innerHTML = `<div class="cab"><span class="ord">${esEv ? R.eventos.indexOf(i) + 1 : '·'}</span><input data-h="nombre" value="${A.esc(p.nombre)}" aria-label="Nombre" placeholder="${esEv ? '' : 'punto de ruta'}"><button class="btn mini" id="hCerrar" aria-label="Cerrar">✕</button></div>
      <label class="h-ev"><input type="checkbox" id="hEv" ${esEv ? 'checked' : ''} ${fijo ? 'disabled' : ''}> <b>Evento</b> — punto de control que se informa por radio${fijo ? ' (la partida y la llegada siempre lo son)' : ''}</label>
      <div class="mono nota">${g && g.ok ? M.verGms(g.lat, 'N', 'S') + ' ' + M.verGms(g.lon, 'E', 'W') : ''}<br>${p.tipo==='GEO' ? '' : 'UTM ' + A.esc(p.zona) + ' · ' + A.f(+p.e) + ' E · ' + A.f(+p.n) + ' N (' + A.esc(m.datum) + ')'}</div>
      <div class="campos">
        <label class="c">Cota (m)${p.cotaAuto ? ' <small>≈ ' + A.esc(p.cotaSrc || 'terreno') + '</small>' : ''}<input class="num" data-h="cota" inputmode="numeric" value="${A.esc(p.cota)}"></label>
        <label class="c">Detención (min)<input class="num" data-h="det" inputmode="numeric" value="${A.esc(p.det)}" placeholder="0"></label>
        ${esEv ? `<label class="c ancho">Nombre clave (vacío = automático)<input class="num clave" data-h="clave" value="${A.esc(p.clave || '')}" placeholder="${A.esc(g && g.clave || '')}" list="hClaves"></label>
          <datalist id="hClaves">${(m.par.claves==='propia' ? M.listaPropia(m.par.clavesPropias) : (M.CLAVES[m.par.claves] || M.CLAVES.otan).l).map(c=>`<option value="${c}">`).join('')}</datalist>` : ''}
        <label class="c ancho">Observaciones<input data-h="obs" value="${A.esc(p.obs)}" placeholder="puente, portezuelo, cruce…"></label>
      </div>
      ${t || s ? `<div class="mono nota">${t ? 'Desde ' + A.esc(t.de) + ': ' + A.f(t.dist) + ' m, ' + (t.dv>=0 ? '+' : '') + A.f(t.dv) + ' m, llega ' + M.verHora(t.llegada) : ''}${t && s ? '<br>' : ''}${s ? 'Al siguiente: rumbo <b>' + A.f(s.azM, 0) + '°</b> / ' + s.mils + ' ‰, ' + A.f(s.dist) + ' m' : ''}</div>` : ''}
      <div class="btns"><button class="btn mini" data-hacc="ant" ${i ? '' : 'disabled'}>‹ Anterior</button><button class="btn mini" data-hacc="sig" ${i<m.puntos.length - 1 ? '' : 'disabled'}>Siguiente ›</button>
        <button class="btn mini peligro" data-hacc="borra">Borrar punto</button></div>`;
    h.querySelectorAll('[data-h]').forEach(inp=>inp.oninput = ()=>{ const k = inp.dataset.h; p[k] = inp.value; if(k==='cota'){ delete p.cotaAuto; delete p.cotaSrc; }
      A.guardar(); clearTimeout(h._t); h._t = setTimeout(()=>{ ruta(); }, 300); });
    $('#hCerrar').onclick = cerrarHoja;
    $('#hEv').onchange = e=>{ ponerEvento(i, e.target.checked); abrirHoja(i); };
    h.querySelectorAll('[data-hacc]').forEach(b=>b.onclick = ()=>{ const a = b.dataset.hacc;
      if(a==='ant') return abrirHoja(i - 1); if(a==='sig') return abrirHoja(i + 1);
      if(a==='borra') borrarPunto(i); });
    ruta();
    if(g && g.ok && !map.getBounds().pad(-0.15).contains([g.lat, g.lon])) map.panTo([g.lat, g.lon]);
  }
  /* ---------- ubicar un punto de la lista tocando la carta (botón «🗺 Ubicar en la carta» de Datos) ---------- */
  let ubicando = null;
  function bandaUbicar(html){ let b = document.getElementById('mUbicar'); if(!html){ if(b) b.remove(); return; }
    if(!b){ b = document.createElement('div'); b.id = 'mUbicar'; b.className = 'm-ubicar'; $('#mapa').parentNode.appendChild(b); } b.innerHTML = html; return b; }
  function modoUbicar(i){
    const m = A.actual(), p = m.puntos[i], g = A.calcular(m).puntos[i]; if(!p) return;
    ubicando = i; cerrarHoja();
    const nom = A.esc(p.nombre || (i===0 ? 'PIM' : 'punto ' + (i + 1)));
    const b = bandaUbicar(`<span>📍 Toca la carta donde va <b>«${nom}»</b>${g && g.ok ? ' (ahora está en el círculo)' : ''}</span><button class="btn mini" id="uCancelar">Cancelar</button>`);
    b.querySelector('#uCancelar').onclick = ()=>{ ubicando = null; bandaUbicar(null); A.ir('ruta'); };
    if(g && g.ok){ map.setView([g.lat, g.lon], Math.max(map.getZoom(), 15));
      L.circleMarker([g.lat, g.lon], {radius:22, color:'#e3a63a', weight:3, fill:false, dashArray:'5 5', interactive:false}).addTo(capaRuta); }
  }
  function ponerUbicado(ll){
    const i = ubicando, m = A.actual(); ubicando = null; guardarDeshacer();
    if(i===0 && !m.puntos[0].nombre) m.puntos[0].nombre = 'PIM';
    mover(i, ll);
    const nom = A.esc(m.puntos[i].nombre || 'el punto');
    const b = bandaUbicar(`<span>✔ <b>${nom}</b> ubicado (la cota se completa sola)</span><button class="btn mini pri" id="uVolver">‹ Volver a los datos</button><button class="btn mini" id="uOtro">Corregir</button><button class="btn mini" id="uListo">Seguir en la carta</button>`);
    b.querySelector('#uVolver').onclick = ()=>{ bandaUbicar(null); A.ir('ruta'); };
    b.querySelector('#uOtro').onclick = ()=>modoUbicar(i);
    b.querySelector('#uListo').onclick = ()=>bandaUbicar(null);
  }
  function ponerEvento(i, si){
    const m = A.actual(), p = m.puntos[i], R = A.calcular(m); guardarDeshacer(); p.ev = si;
    if(si && !p.nombre) p.nombre = 'PC' + R.eventos.filter(x=>x<i).length;
    if(!si){ p.nombre = /^PC\d+$/.test(p.nombre) ? '' : p.nombre; p.clave = ''; }
    renumerar(m); A.guardar(); ruta();
  }
  function borrarPunto(i){ const m = A.actual(); guardarDeshacer(); m.puntos.splice(i, 1); renumerar(m); A.guardar(); cerrarHoja(); ruta(); A.aviso('Punto borrado (↶ para deshacer)'); }

  /* ---------- menú del botón derecho (en el teléfono: mantener presionado) ----------
     Como en el C2 TOQUI: arriba los datos del lugar (tocar para copiar), abajo las acciones. */
  function cerrarMenu(){ const x = document.getElementById('mMenu'); if(x) x.remove(); }
  function abrirMenu(ev, titulo, items){
    cerrarMenu(); if(!ev) return;
    const d = document.createElement('div'); d.id = 'mMenu'; d.className = 'm-menu';
    d.innerHTML = `<div class="mm-tit">${titulo}</div>` + items.map((it, k)=>it.sep ? '<div class="mm-sep"></div>'
      : it.dato ? `<button class="mm-dato" data-k="${k}" title="Copiar"><span>${A.esc(it.lbl)}</span><b class="mono" ${it.id ? `id="${it.id}"` : ''}>${A.esc(it.val)}</b></button>`
      : `<button class="mm-acc${it.peligro ? ' peligro' : ''}" data-k="${k}" ${it.no ? 'disabled' : ''}><span class="mm-ico">${it.ico || ''}</span>${A.esc(it.lbl)}${it.nota ? `<small>${A.esc(it.nota)}</small>` : ''}</button>`).join('');
    document.body.appendChild(d);
    d.querySelectorAll('[data-k]').forEach(b=>b.onclick = e=>{ e.stopPropagation(); const it = items[+b.dataset.k]; cerrarMenu();
      if(it.dato) A.copiar(it.copia || it.val); else if(it.fn) it.fn(); });
    const x = ev.clientX, y = ev.clientY, r = d.getBoundingClientRect();
    d.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + 'px'; d.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px';
  }
  // se cierra al tocar fuera o con Escape (un solo par de escuchas para todos los menús)
  document.addEventListener('pointerdown', e=>{ const d = document.getElementById('mMenu'); if(d && !d.contains(e.target)) cerrarMenu(); }, true);
  addEventListener('keydown', e=>{ if(e.key==='Escape') cerrarMenu(); }, true);
  // datos de coordenadas de un lugar (en el datum de la marcha), como filas que se copian
  function datosLugar(lat, lon){
    const m = A.actual(), dat = m.datum || 'WGS84', u = M.camposDesde(lat, lon, 'UTM', dat, +m.zona || undefined);
    const utm = u.zona + M.banda(lat) + ' ' + A.f(+u.e) + ' E ' + A.f(+u.n) + ' N', gms = M.verGms(lat, 'N', 'S') + '  ' + M.verGms(lon, 'E', 'W');
    return [{dato:true, lbl:'UTM (' + dat + ')', val:utm}, {dato:true, lbl:'Geográficas', val:gms}, {dato:true, lbl:'Decimal', val:lat.toFixed(6) + ', ' + lon.toFixed(6)}];
  }
  function menuPunto(ids, ev){
    const m = A.actual(), R = A.calcular(m), i = ids.includes(sel) ? sel : ids[0], p = m.puntos[i], g = R.puntos[i]; if(!g || !g.ok) return;
    const fijo = R.eventos[0]===i || R.eventos[R.eventos.length - 1]===i, t = R.tramos.find(x=>x.iB===i), s = R.tramos.find(x=>x.iA===i);
    const items = datosLugar(g.lat, g.lon);
    items.push({dato:true, lbl:'Cota', val:isNaN(g.cota) ? '—' : A.f(g.cota) + ' m'});
    if(t) items.push({dato:true, lbl:'Llega', val:M.verHora(t.llegada) + ' · ' + A.f(t.distAcum/1000, 2) + ' km'});
    if(s) items.push({dato:true, lbl:'Al siguiente', val:A.f(s.azM, 0) + '° / ' + s.mils + ' ‰ · ' + A.f(s.dist) + ' m'});
    items.push({sep:true});
    if(ids.length>1) ids.forEach(k=>{ if(k!==i) items.push({ico:'⇄', lbl:'Elegir «' + (m.puntos[k].nombre || 'punto') + '» (n.º ' + (k + 1) + ')', nota:'mismo lugar, otra pasada', fn:()=>menuPunto([k].concat(ids.filter(x=>x!==k)), ev)}); });
    items.push(g.ev ? {ico:'○', lbl:'Quitar evento', nota:fijo ? 'la partida y la llegada siempre son eventos' : 'queda como punto de ruta', no:fijo, fn:()=>ponerEvento(i, false)}
      : {ico:'◉', lbl:'Marcar como evento', nota:'punto de control que se informa por radio', fn:()=>ponerEvento(i, true)});
    if(m.par.reabast==='si' && !fijo) items.push({ico:'💧', lbl:p.agua ? 'Quitar punto de agua' : 'Marcar punto de agua', nota:'se repone el agua aquí', fn:()=>{ guardarDeshacer(); p.agua = !p.agua; A.guardar(); ruta(); A.aviso(p.agua ? '💧 Punto de agua' : 'Ya no es punto de agua'); }});
    items.push({ico:'✎', lbl:'Editar punto', nota:'nombre, cota, detención, observaciones', fn:()=>abrirHoja(i)});
    items.push({ico:'⏸', lbl:'Detención aquí', nota:(+p.det ? p.det + ' min' : 'sin detención') + ' (comida, descanso, reorganización)', fn:()=>{ abrirHoja(i); setTimeout(()=>{ const x = document.querySelector('[data-h=det]'); if(x){ x.focus(); x.select(); } }, 50); }});
    if(i>0) items.push({ico:'＋', lbl:'Insertar punto antes', nota:'a mitad del tramo anterior', fn:()=>{ const a = R.puntos[i - 1]; if(a && a.ok) insertar(i, L.latLng((a.lat + g.lat)/2, (a.lon + g.lon)/2)); }});
    if(i<m.puntos.length - 1) items.push({ico:'＋', lbl:'Insertar punto después', nota:'a mitad del tramo siguiente', fn:()=>{ const b = R.puntos[i + 1]; if(b && b.ok) insertar(i + 1, L.latLng((b.lat + g.lat)/2, (b.lon + g.lon)/2)); }});
    items.push({ico:'⤢', lbl:'Centrar el mapa aquí', fn:()=>map.setView([g.lat, g.lon], Math.max(map.getZoom(), 16))});
    items.push({sep:true}, {ico:'🗑', lbl:'Borrar punto', peligro:true, fn:()=>borrarPunto(i)});
    abrirMenu(ev, `${g.ev ? '◉' : '·'} <b>${A.esc(g.nombre || 'Punto de ruta')}</b>${g.clave ? ` <i class="clave">${A.esc(g.clave)}</i>` : ''}<small>${g.ev ? 'evento n.º ' + (R.eventos.indexOf(i) + 1) : 'punto de ruta'}</small>`, items);
  }
  function menuTramo(t, ll, ev){
    const items = [{dato:true, lbl:'Tramo', val:t.de + ' → ' + t.a}, {dato:true, lbl:'Rumbo', val:A.f(t.azM, 0) + '° / ' + t.mils + ' ‰'},
      {dato:true, lbl:'Distancia', val:A.f(t.dist) + ' m · ' + (t.dv>=0 ? '+' : '') + A.f(t.dv) + ' m (' + A.f(t.pte*100, 0) + ' %)'}, {dato:true, lbl:'Tiempo', val:M.verDur(t.t)}, {sep:true},
      {ico:'＋', lbl:'Insertar punto aquí', nota:'punto de ruta en este lugar', fn:()=>insertar(t.iB, ll)},
      {ico:'◉', lbl:'Insertar evento aquí', nota:'punto de control que se informa por radio', fn:()=>{ insertar(t.iB, ll); ponerEvento(t.iB, true); abrirHoja(t.iB); }}];
    abrirMenu(ev, '<b>Tramo</b><small>' + A.esc(t.de) + ' → ' + A.esc(t.a) + '</small>', items.concat(datosLugar(ll.lat, ll.lng).map(x=>Object.assign(x, {lbl:x.lbl + ' (este lugar)'}))));
  }
  function menuLugar(ll, ev){
    const m = A.actual(), R = A.calcular(m), ok = R.puntos.filter(p=>p.ok), u = ok[ok.length - 1];
    const items = datosLugar(ll.lat, ll.lng);
    items.push({dato:true, lbl:'Cota', val:'…', id:'mmCota'});
    if(u){ const r = M.rumboEntre(u, {lat:ll.lat, lon:ll.lng}, R.zona, R.decl.valor); items.push({dato:true, lbl:'Desde ' + (u.nombre || 'el último punto'), val:A.f(r.azM, 0) + '° / ' + r.mils + ' ‰ · ' + A.f(r.dist) + ' m'}); }
    items.push({sep:true}, {ico:'＋', lbl:ok.length ? 'Agregar punto aquí' : 'Poner el PIM aquí', nota:ok.length ? 'al final de la ruta' : 'inicio de la marcha', fn:()=>agregarPunto(ll)});
    if(ok.length) items.push({ico:'◉', lbl:'Agregar evento aquí', nota:'al final, como punto de control', fn:()=>{ agregarPunto(ll); const k = A.actual().puntos.length - 1; ponerEvento(k, true); abrirHoja(k); }});
    items.push({ico:'⤢', lbl:'Centrar el mapa aquí', fn:()=>map.panTo(ll)});
    abrirMenu(ev, '<b>Este lugar</b>', items);
    DEM.cotaPunto(ll.lat, ll.lng).then(r=>{ const x = document.getElementById('mmCota'); if(x) x.textContent = r ? '≈ ' + A.f(Math.round(r.v)) + ' m' : 'sin datos'; }).catch(()=>{});
  }
  function cerrarHoja(){ const h = $('#mHoja'); if(h){ h.hidden = true; h.innerHTML = ''; } if(sel!==null){ sel = null; ruta(); } }

  /* ---------- cartas propias ---------- */
  async function cargarCartas(){
    let cs = []; try { cs = await BD.todas(); } catch(e){ return; }
    if(!map) return;
    Object.values(cartasCapa).forEach(c=>map.removeLayer(c)); cartasCapa = {};
    cs.filter(c=>c.visible!==false).forEach(c=>{ cartasCapa[c.id] = L.imageOverlay(c.img, c.bounds, {pane:'cartas', opacity:c.opacidad || .8, interactive:false}).addTo(map); });
    return cs;
  }
  async function dialogoCartas(){
    let cs = []; try { cs = await BD.todas(); } catch(e){}
    A.dialogo(`<h3>🗺 Cartas propias</h3>
      <p class="nota">Carga una imagen (JPG o PNG) de tu carta IGM o de un croquis y cálzala con dos puntos de coordenadas conocidas (cruces de cuadrícula lejanos entre sí).
        Si tienes la carta en PDF, sácale una captura o expórtala como imagen.</p>
      ${cs.map(c=>`<div class="tarjeta" style="padding:10px"><b>${A.esc(c.nombre)}</b>
        <div class="campos" style="margin-top:6px"><label class="c">Transparencia<input type="range" min="0.2" max="1" step="0.05" value="${c.opacidad || .8}" data-op="${c.id}"></label>
        <label class="c"><span><input type="checkbox" data-vis="${c.id}" ${c.visible!==false ? 'checked' : ''} style="width:auto"> Mostrar</span></label></div>
        <div class="btns"><button class="btn mini" data-ir="${c.id}">Ir a la carta</button><button class="btn mini peligro" data-del="${c.id}">Quitar</button></div></div>`).join('') || '<p class="nota">Aún no hay cartas cargadas.</p>'}
      <div class="btns"><button class="btn pri" id="cNueva">＋ Cargar carta (imagen)</button><button class="btn" data-cerrar>Cerrar</button></div>`, d=>{
      d.querySelector('#cNueva').onclick = ()=>{ const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
        i.onchange = ()=>{ const f = i.files[0]; if(!f) return; const r = new FileReader(); r.onload = ()=>calzar(String(r.result), f.name.replace(/\.\w+$/, '')); r.readAsDataURL(f); }; i.click(); };
      d.querySelectorAll('[data-op]').forEach(x=>x.oninput = async()=>{ const c = cs.find(c=>c.id===x.dataset.op); c.opacidad = +x.value; if(cartasCapa[c.id]) cartasCapa[c.id].setOpacity(c.opacidad); await BD.poner(c); });
      d.querySelectorAll('[data-vis]').forEach(x=>x.onchange = async()=>{ const c = cs.find(c=>c.id===x.dataset.vis); c.visible = x.checked; await BD.poner(c); cargarCartas(); });
      d.querySelectorAll('[data-ir]').forEach(x=>x.onclick = ()=>{ const c = cs.find(c=>c.id===x.dataset.ir); A.cerrarDialogo(); map.fitBounds(c.bounds); });
      d.querySelectorAll('[data-del]').forEach(x=>x.onclick = async()=>{ await BD.borrar(x.dataset.del); await cargarCartas(); dialogoCartas(); });
    });
  }
  // calce con dos puntos: se marca cada punto en la imagen y se escribe su coordenada UTM (datum de la carta)
  function calzar(img, nombre){
    const m = A.actual(), pts = [{}, {}]; let cual = 0;
    A.dialogo(`<h3>Calzar «${A.esc(nombre)}»</h3>
      <p class="nota">1) Toca el <b>punto 1</b> en la imagen (un cruce de cuadrícula) y escribe su coordenada. 2) Lo mismo con el <b>punto 2</b>, lo más lejos posible del primero.</p>
      <div class="calce"><img src="${img}" alt=""><span class="mk" id="k0" hidden>1</span><span class="mk" id="k1" hidden>2</span></div>
      <div class="campos">
        <label class="c ancho">Datum de la carta<select id="cDat">${Object.entries(M.DATUMS).map(([k, v])=>`<option value="${k}"${k===m.datum ? ' selected' : ''}>${A.esc(v.n)}</option>`).join('')}</select></label>
        <label class="c">Zona<input class="num" id="cZona" value="${A.esc(m.zona || 19)}" inputmode="numeric"></label></div>
      ${[0, 1].map(k=>`<div class="campos" style="margin-top:8px"><label class="c"><span>Punto ${k + 1} <button class="btn mini" data-cual="${k}">Marcar</button> <small id="cEst${k}">sin marcar</small></span></label>
        <label class="c">Este (m)<input class="num" id="cE${k}" inputmode="numeric"></label><label class="c">Norte (m)<input class="num" id="cN${k}" inputmode="numeric"></label></div>`).join('')}
      <div class="btns"><button class="btn pri" id="cOk">Aplicar calce</button><button class="btn" data-cerrar>Cancelar</button></div>`, d=>{
      const im = d.querySelector('.calce img');
      const marca = k=>{ cual = k; d.querySelectorAll('[data-cual]').forEach(b=>b.classList.toggle('pri', +b.dataset.cual===k)); };
      marca(0);
      d.querySelectorAll('[data-cual]').forEach(b=>b.onclick = ()=>marca(+b.dataset.cual));
      im.onclick = e=>{ const r = im.getBoundingClientRect(), sx = im.naturalWidth/r.width, sy = im.naturalHeight/r.height;
        pts[cual] = {px:(e.clientX - r.left)*sx, py:(e.clientY - r.top)*sy};
        const k = d.querySelector('#k' + cual); k.hidden = false; k.style.left = (e.clientX - r.left) + 'px'; k.style.top = (e.clientY - r.top) + 'px';
        d.querySelector('#cEst' + cual).textContent = 'marcado'; if(cual===0) marca(1); };
      d.querySelector('#cOk').onclick = async()=>{
        const dat = d.querySelector('#cDat').value, zona = +d.querySelector('#cZona').value || 19, el = M.DATUMS[dat];
        const en = [0, 1].map(k=>({e:+d.querySelector('#cE' + k).value, n:+d.querySelector('#cN' + k).value}));
        if(pts.some(p=>p.px===undefined) || en.some(p=>!p.e || !p.n)) return A.aviso('Marca los dos puntos y escribe sus coordenadas');
        const dpx = pts[1].px - pts[0].px, dpy = pts[1].py - pts[0].py, dE = en[1].e - en[0].e, dN = en[1].n - en[0].n;
        if(Math.hypot(dpx, dpy)<20) return A.aviso('Los puntos están muy cerca en la imagen');
        // semejanza: (dE + i·dN) = (a + i·b)·(dpx − i·dpy)   (en la imagen y crece hacia abajo)
        const den = dpx*dpx + dpy*dpy, a = (dE*dpx - dN*dpy)/den, b = (dN*dpx + dE*dpy)/den;
        const aEN = (x, y)=>{ const rx = x - pts[0].px, ry = -(y - pts[0].py); return {e:en[0].e + a*rx - b*ry, n:en[0].n + b*rx + a*ry}; };
        const aLL = p=>{ const g = M.utmALl(p.e, p.n, zona, true, el), w = M.aWgs84(g.lat, g.lon, 0, dat); return [w.lat, w.lon]; };
        const W = im.naturalWidth, H = im.naturalHeight, esq = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y])=>aLL(aEN(x, y)));
        const bounds = [[Math.min(...esq.map(c=>c[0])), Math.min(...esq.map(c=>c[1]))], [Math.max(...esq.map(c=>c[0])), Math.max(...esq.map(c=>c[1]))]];
        const rot = Math.abs(Math.atan2(b, a)*180/Math.PI), escalaM = Math.hypot(a, b);
        const c = {id:Date.now().toString(36), nombre, img, bounds, opacidad:.8, visible:true};
        try { await BD.poner(c); } catch(e){ return A.aviso('No se pudo guardar la carta (¿imagen muy grande?)'); }
        A.cerrarDialogo(); await cargarCartas(); map.fitBounds(bounds);
        A.aviso('✔ Carta calzada (' + A.f(escalaM, 2) + ' m por píxel)' + (rot>2 ? ' — la imagen está girada ' + A.f(rot, 1) + '°: endereza la imagen para mayor precisión' : ''));
      };
    });
  }

  function cerrar(){ cerrarMenu(); if(!map) return; const m = map; map = null; capaCursor = null; capaCurvas = null; try { m.stop(); m.off(); m.remove(); } catch(e){} }
  return {abrir, ruta, cerrar, BASES};
})();
if(typeof globalThis!=='undefined') globalThis.Mapa = Mapa;
