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
  let capaHoriz = null; const vistas = new Map();
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
        <button class="btn mini" id="mZonas" title="Guardar mapas para usar sin señal">⬇ Sin señal</button>
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
    capaGrid = L.layerGroup().addTo(map); capaHoriz = L.layerGroup().addTo(map); capaRuta = L.layerGroup().addTo(map);
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
    $('#mZonas').onclick = dialogoZonas;
    if(navigator.onLine===false) A.aviso('Sin señal: se ven las zonas de mapa guardadas');
    $('#mPerf').onclick = e=>{ pref.perfil = !pref.perfil; guardarPref(); e.currentTarget.classList.toggle('on', pref.perfil); perfil(); };
    cargarCartas(); ruta(); grid(); lectura(map.getCenter()); perfil(); curvas(); horizontes();
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
    // recorrido real del GPS (Seguir), debajo de la ruta planificada
    const T = (m.ejec && m.ejec.track) || []; if(T.length>1) L.polyline(T.map(t=>[t[0], t[1]]), {color:'#6fb3d9', weight:4, opacity:.85, dashArray:'6 5', interactive:false}).addTo(capaRuta);
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
    if(i>0 && !m.par.sinMochila){ const mo = (v, lbl, nota, txt)=>({ico:'🎒', lbl:(p.mochila===v ? '✓ ' : '') + lbl, nota, fn:()=>{ guardarDeshacer(); p.mochila = p.mochila===v ? '' : v; A.guardar(); ruta(); if(p.mochila) A.aviso('🎒 ' + txt + ' en ' + (p.nombre || 'este punto')); }});
      items.push(mo('deja', 'Dejar la mochila de sostenimiento aquí', 'sigue con la de asalto', 'Se deja la de sostenimiento'), mo('dejaTodo', 'Dejar las dos mochilas aquí', 'sigue solo con la 1.ª y 2.ª línea', 'Se dejan las mochilas'),
        mo('recogeB', 'Recoger la de sostenimiento aquí', 'se vuelve a tomar la 3.ª B', 'Se recoge la de sostenimiento'), mo('recogeA', 'Recoger la de asalto aquí', 'se vuelve a tomar la 3.ª A', 'Se recoge la de asalto'),
        mo('recoge', 'Recoger las dos aquí', 'se sigue con las dos mochilas', 'Se recogen las dos')); }
    items.push({ico:'✎', lbl:'Editar punto', nota:'nombre, cota, detención, observaciones', fn:()=>abrirHoja(i)});
    items.push({ico:'⏸', lbl:'Detención aquí', nota:(+p.det ? p.det + ' min' : 'sin detención') + ' (comida, descanso, reorganización)', fn:()=>{ abrirHoja(i); setTimeout(()=>{ const x = document.querySelector('[data-h=det]'); if(x){ x.focus(); x.select(); } }, 50); }});
    if(i>0) items.push({ico:'＋', lbl:'Insertar punto antes', nota:'a mitad del tramo anterior', fn:()=>{ const a = R.puntos[i - 1]; if(a && a.ok) insertar(i, L.latLng((a.lat + g.lat)/2, (a.lon + g.lon)/2)); }});
    if(i<m.puntos.length - 1) items.push({ico:'＋', lbl:'Insertar punto después', nota:'a mitad del tramo siguiente', fn:()=>{ const b = R.puntos[i + 1]; if(b && b.ok) insertar(i + 1, L.latLng((b.lat + g.lat)/2, (b.lon + g.lon)/2)); }});
    items.push({ico:'⤢', lbl:'Centrar el mapa aquí', fn:()=>map.setView([g.lat, g.lon], Math.max(map.getZoom(), 16))});
    items.push({ico:'👁', lbl:'Vuelta al horizonte desde aquí', nota:'panorama, puntos de referencia y zona vista', fn:()=>vueltaHorizonte(g.lat, g.lon, g.nombre || 'punto de ruta', null, g.cota)});
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
    items.push({ico:'👁', lbl:'Vuelta al horizonte desde aquí', nota:'panorama, puntos de referencia y zona vista', fn:()=>vueltaHorizonte(ll.lat, ll.lng, '')});
    abrirMenu(ev, '<b>Este lugar</b>', items);
    DEM.cotaPunto(ll.lat, ll.lng).then(r=>{ const x = document.getElementById('mmCota'); if(x) x.textContent = r ? '≈ ' + A.f(Math.round(r.v)) + ' m' : 'sin datos'; }).catch(()=>{});
  }
  function cerrarHoja(){ const h = $('#mHoja'); if(h){ h.hidden = true; h.innerHTML = ''; } if(sel!==null){ sel = null; ruta(); } }

  /* ---------- vuelta al horizonte (horizonte.js) ----------
     Se guarda en la marcha (`m.horizontes`): desde dónde, alcance, la silueta (ángulo del horizonte cada 0,5°, para el panorama y el
     documento sin volver a calcular) y los puntos de referencia elegidos y nombrados. En el mapa: el observador, los PR y la zona vista. */
  const silDe = H=>H.perfil.map(p=>Math.round(p.ang*100)/100);
  const comoH = h=>({lat:h.lat, lon:h.lon, radio:h.radio, perfil:h.sil.map((a, i)=>({az:i*Horizonte.PASO_AZ, ang:a}))});
  function horizontes(){
    if(!capaHoriz) return; capaHoriz.clearLayers(); const m = A.actual(); (m.horizontes || []).forEach(h=>{
      L.marker([h.lat, h.lon], {icon:L.divIcon({className:'m-obs', html:'👁', iconSize:[22, 22]})}).addTo(capaHoriz).bindTooltip('Vuelta al horizonte ' + (h.nombre ? 'desde ' + h.nombre : ''))
        .on('click', ()=>vueltaHorizonte(h.lat, h.lon, h.nombre, h.id, h.cotaPunto));
      h.prs.forEach((p, k)=>{ L.polyline([[h.lat, h.lon], [p.lat, p.lon]], {color:'#e3a63a', weight:1, opacity:.5, dashArray:'2 6', interactive:false}).addTo(capaHoriz);
        L.marker([p.lat, p.lon], {icon:L.divIcon({className:'m-pr', html:'▲ <b>' + A.esc(p.nombre || 'PR-' + (k + 1)) + '</b>', iconSize:null})}).addTo(capaHoriz); });
      if(h.vista) zonaVista(h); });
  }
  // zona vista: se calcula al abrir el mapa (queda en memoria mientras la app está abierta)
  async function zonaVista(h){
    const k = h.lat.toFixed(5) + ',' + h.lon.toFixed(5) + ',' + h.radio; let v = vistas.get(k);
    if(!v){ try { const H = await Horizonte.calcular(h.lat, h.lon, {radio:h.radio, zs:h.cotaPunto}); if(!H) return; v = Horizonte.imagenVista(H); vistas.set(k, v); } catch(e){ return; } }
    if(capaHoriz && map) L.imageOverlay(v.url, v.caja, {opacity:1, interactive:false, className:'m-vista'}).addTo(capaHoriz);
  }
  async function vueltaHorizonte(lat, lon, nombre, id, cota){
    const m = A.actual(), R = A.calcular(m), dec = R.decl.valor, guardado = (m.horizontes || []).find(h=>h.id===id || (Math.abs(h.lat - lat)<1e-6 && Math.abs(h.lon - lon)<1e-6));
    if(guardado && cota===undefined) cota = guardado.cotaPunto;
    let radio = guardado ? guardado.radio : 5000, H = null, prs = guardado ? guardado.prs.map(p=>Object.assign({usar:true}, p)) : null;
    const mag = az=>((az - dec)%360 + 360)%360, mils = az=>Math.round(mag(az)*6400/360)%6400;
    const titulo = nombre ? 'desde ' + A.esc(nombre) : 'desde este lugar';
    A.dialogo(`<h3>👁 Vuelta al horizonte ${titulo}</h3><p class="nota" id="hEst">Calculando con el modelo de terreno…</p>`);
    const calc = async()=>{ H = await Horizonte.calcular(lat, lon, {radio, zs:cota}).catch(()=>null);
      if(!H) return A.dialogo(`<h3>👁 Vuelta al horizonte</h3><p class="nota">No hay datos del terreno aquí. Necesita señal la primera vez (o una zona guardada con «Curvas de nivel y cota»).</p><div class="btns"><button class="btn" data-cerrar>Cerrar</button></div>`);
      const viejos = prs || []; prs = H.prs.map(p=>{ const v = viejos.find(q=>Math.abs(q.az - p.az)<=2 && Math.abs(q.d - p.d)<300); return Object.assign(p, {nombre:v ? v.nombre : '', usar:v ? v.usar!==false : true}); });
      // los PR nombrados antes que ya no salgan se conservan
      viejos.forEach(q=>{ if(q.nombre && !prs.some(p=>p.nombre===q.nombre)) prs.push(q); }); prs.sort((a, b)=>mag(a.az) - mag(b.az));
      pintar(); };
    const pintar = ()=>{ const usados = prs.filter(p=>p.usar);
      A.dialogo(`<h3>👁 Vuelta al horizonte ${titulo}</h3>
        <p class="nota">Desde ${A.f(Math.round(H.zs))} m (ojo a ${A.f(H.ojo, 1)} m), alcance ${Horizonte.fmtD(radio)}. Rumbos magnéticos (declinación ${A.f(dec, 1)}°). Desliza el panorama hacia los lados.</p>
        <div class="horiz-env">${Horizonte.svg(H, usados, dec, {ancho:1440, alto:210})}</div>
        <div class="campos"><label class="c">Alcance<select id="hRad">${[2000, 5000, 10000].map(r=>`<option value="${r}"${r===radio ? ' selected' : ''}>${r/1000} km</option>`).join('')}</select></label></div>
        <h4>Puntos de referencia</h4>
        <div class="tabla-env"><table class="t"><thead><tr><th></th><th class="tx">Nombre</th><th>Rumbo mag.</th><th>Distancia</th><th>Cota</th></tr></thead><tbody>
        ${prs.map((p, k)=>`<tr><td><input type="checkbox" data-hu="${k}" ${p.usar ? 'checked' : ''} style="width:auto"></td><td class="tx"><input data-hn="${k}" value="${A.esc(p.nombre || '')}" placeholder="PR-${usados.indexOf(p) + 1 || '—'}" style="min-width:120px"></td>
          <td>${A.f(Math.round(mag(p.az)))}° / ${mils(p.az)} ‰</td><td>${Horizonte.fmtD(p.d)}</td><td>${A.f(Math.round(p.z))} m</td></tr>`).join('') || '<tr><td colspan="5" class="nota">No asoman cerros destacados en el horizonte.</td></tr>'}</tbody></table></div>
        <p class="nota">Los marca la app solos: cerros y puntos que sobresalen en la línea del horizonte. Ponles nombre (o un nombre clave) y quita los que no sirvan.</p>
        <label class="nota" style="display:block"><input type="checkbox" id="hVista" ${!guardado || guardado.vista ? 'checked' : ''} style="width:auto;vertical-align:middle"> Mostrar en el mapa la <b>zona vista</b> (verde) y la <b>zona muerta</b> (roja) hasta ${Horizonte.fmtD(radio)}</label>
        <div class="btns"><button class="btn pri" id="hOk">✔ Guardar en la marcha</button><button class="btn" id="hOsm">Traer nombres de cerros (con señal)</button>
          ${guardado ? '<button class="btn peligro" id="hDel">Quitar</button>' : ''}<button class="btn" data-cerrar>Cerrar</button></div>`, d=>{
        d.querySelector('#hRad').onchange = e=>{ radio = +e.target.value; d.querySelector('.horiz-env').innerHTML = '<p class="nota">Calculando…</p>'; calc(); };
        d.querySelectorAll('[data-hu]').forEach(x=>x.onchange = ()=>{ prs[+x.dataset.hu].usar = x.checked; pintar(); });
        d.querySelectorAll('[data-hn]').forEach(x=>x.onchange = ()=>{ prs[+x.dataset.hn].nombre = x.value.trim(); pintar(); });
        d.querySelector('#hOsm').onclick = async e=>{ e.target.disabled = true; e.target.textContent = 'Buscando…';
          try { const n = await Horizonte.nombresOsm(lat, lon, radio, prs); A.aviso(n ? n + ' nombre(s) de OpenStreetMap' : 'No se encontraron nombres cerca de esos puntos'); pintar(); }
          catch(er){ A.aviso('Sin señal: no se pudieron traer los nombres'); e.target.disabled = false; e.target.textContent = 'Traer nombres de cerros (con señal)'; } };
        d.querySelector('#hOk').onclick = ()=>{ const L2 = (m.horizontes || (m.horizontes = [])), h = guardado || {id:'h' + Date.now().toString(36)};
          Object.assign(h, {nombre:nombre || '', lat, lon, radio, cotaPunto:isFinite(cota) ? cota : null, ojo:H.ojo, zs:Math.round(H.zs), sil:silDe(H), vista:d.querySelector('#hVista').checked,
            prs:prs.filter(p=>p.usar).map((p, k)=>({nombre:p.nombre || 'PR-' + (k + 1), az:p.az, ang:Math.round(p.ang*100)/100, d:Math.round(p.d), z:Math.round(p.z), lat:+p.lat.toFixed(6), lon:+p.lon.toFixed(6)}))});
          if(!guardado) L2.push(h); A.guardar(); A.cerrarDialogo(); horizontes(); A.aviso('Vuelta al horizonte guardada: ' + h.prs.length + ' punto(s) de referencia'); };
        const del = d.querySelector('#hDel'); if(del) del.onclick = ()=>{ m.horizontes = m.horizontes.filter(h=>h!==guardado); A.guardar(); A.cerrarDialogo(); horizontes(); A.aviso('Vuelta al horizonte quitada'); };
        // el panorama parte mostrando el norte al centro
        const env = d.querySelector('.horiz-env'); env.scrollLeft = 0; });
    };
    calc();
  }

  /* ---------- cartas propias ---------- */
  async function cargarCartas(){
    let cs = []; try { cs = await BD.todas(); } catch(e){ return; }
    if(!map) return;
    Object.values(cartasCapa).forEach(c=>map.removeLayer(c)); cartasCapa = {};
    cs.filter(c=>c.visible!==false).forEach(c=>{ cartasCapa[c.id] = L.imageOverlay(c.img, c.bounds, {pane:'cartas', opacity:c.opacidad || .8, interactive:false}).addTo(map); });
    return cs;
  }
  /* ---------- zonas de mapa para usar sin señal (zonas.js; el service worker las entrega sin internet) ---------- */
  let bajando = null;
  async function dialogoZonas(){
    const m = A.actual(), R = A.calcular(m), Z = Zonas.lista(), esp = await Zonas.espacio();
    const st = Object.assign({area:'ruta', km:'1', zmax:'15', capas:{[BASES[pref.base] && Zonas.CAPAS[pref.base] ? pref.base : 'topo']:true, terreno:true}}, dialogoZonas.st || {}); dialogoZonas.st = st;
    const zona = ()=>{ const caja = st.area==='ruta' ? Zonas.cajaRuta(R.puntos, +st.km) : (b=>[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()])(map.getBounds());
      return caja && {caja, capas:Object.keys(st.capas).filter(k=>st.capas[k]), zmax:+st.zmax}; };
    const fm = x=>A.f(x, x<10 ? 1 : 0), fecha = t=>new Date(t).toLocaleDateString('es-CL', {day:'numeric', month:'short', year:'numeric'});
    const pintar = ()=>{ const z = zona(), e = z && z.capas.length ? Zonas.estimar(z) : null, el = document.getElementById('zEst'); if(!el) return;
      el.innerHTML = !z ? '<span class="mal">Esta marcha aún no tiene puntos: elige «Lo que se ve en pantalla».</span>' : !e ? 'Elige al menos una capa.'
        : `<b>${A.f(e.n)} teselas</b> · cerca de <b>${fm(e.mb)} MB</b>${e.tope ? `<br><span class="mal">Es demasiado para una sola zona (más de ${A.f(Zonas.TOPE)}): achica el área, baja el detalle o elige menos capas.</span>` : ''}`;
      const b = document.getElementById('zBajar'); if(b) b.disabled = !e || e.tope; };
    A.dialogo(`<h3>⬇ Mapas para usar sin señal</h3>
      <p class="nota">Guarda en este equipo el mapa de una zona para verlo en terreno sin internet (en el Mapa y en Seguir), con las curvas de nivel y la cota automática.
        Hazlo antes de salir, con Wi-Fi. Las cartas propias (🗺 Cartas) ya quedan guardadas siempre.</p>
      ${Z.length ? `<h4>Zonas guardadas</h4>${Z.map(z=>`<div class="tarjeta" style="padding:8px 10px"><b>${A.esc(z.nombre)}</b> <small class="nota">${fecha(z.fecha)} · ${A.f(z.n)} teselas · ${fm(z.kb/1024)} MB</small>
        <div class="nota" style="margin:2px 0 6px">${z.capas.map(k=>Zonas.CAPAS[k] ? Zonas.CAPAS[k].n : k).join(' · ')} · detalle hasta ${z.zmax}${z.fallas ? ` · <span class="mal">${z.fallas} sin bajar</span>` : ''}</div>
        <div class="btns" style="margin:0"><button class="btn mini" data-zver="${z.id}">Ver en el mapa</button><button class="btn mini" data-zact="${z.id}">Completar lo que falta</button><button class="btn mini peligro" data-zbor="${z.id}">Borrar</button></div></div>`).join('')}` : ''}
      <h4>Guardar una zona nueva</h4>
      <div class="campos">
        <label class="c ancho">Área<select id="zArea"><option value="ruta"${st.area==='ruta' ? ' selected' : ''}>La ruta de esta marcha, con un margen</option><option value="vista"${st.area==='vista' ? ' selected' : ''}>Lo que se ve ahora en pantalla</option></select></label>
        <label class="c" id="zKmL"${st.area==='ruta' ? '' : ' hidden'}>Margen alrededor de la ruta<select id="zKm">${['0.5', '1', '2', '3', '5'].map(k=>`<option value="${k}"${st.km===k ? ' selected' : ''}>${k.replace('.', ',')} km</option>`).join('')}</select></label>
        <label class="c">Detalle hasta<select id="zZ">${[['13', '13 (≈ 1:50.000)'], ['14', '14 (≈ 1:25.000)'], ['15', '15 (≈ 1:15.000)'], ['16', '16 (≈ 1:8.000)']].map(([v, t])=>`<option value="${v}"${st.zmax===v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <div class="nota" style="margin:6px 0">Capas:</div>
      ${Object.entries(Zonas.CAPAS).map(([k, c])=>`<label class="nota" style="display:block;margin:3px 0"><input type="checkbox" data-zcap="${k}" ${st.capas[k] ? 'checked' : ''} style="width:auto;vertical-align:middle"> ${c.n}</label>`).join('')}
      <p class="nota" style="margin-top:4px">«Calles» (OpenStreetMap) no se puede guardar: su servidor no permite descargar zonas. Los mapas libres piden no bajar áreas grandes: guarda solo la zona de la marcha.</p>
      <div class="info" id="zEst"></div>
      <div id="zProg" hidden><div class="barra"><i id="zBarra" style="width:0"></i></div><div class="nota mono" id="zProgT"></div></div>
      ${esp ? `<p class="nota">Espacio usado por la app en este equipo: ${fm(esp.usado)} MB.</p>` : ''}
      <div class="btns"><button class="btn pri" id="zBajar">⬇ Guardar la zona</button><button class="btn" id="zParar" style="display:none">Detener</button><button class="btn" data-cerrar>Cerrar</button></div>`, d=>{
      d.querySelector('#zArea').onchange = e=>{ st.area = e.target.value; d.querySelector('#zKmL').hidden = st.area!=='ruta'; pintar(); };
      d.querySelector('#zKm').onchange = e=>{ st.km = e.target.value; pintar(); };
      d.querySelector('#zZ').onchange = e=>{ st.zmax = e.target.value; pintar(); };
      d.querySelectorAll('[data-zcap]').forEach(x=>x.onchange = ()=>{ st.capas[x.dataset.zcap] = x.checked; pintar(); });
      d.querySelectorAll('[data-zver]').forEach(b=>b.onclick = ()=>{ const z = Zonas.lista().find(x=>x.id===b.dataset.zver); if(!z) return; d.close();
        map.fitBounds([[z.caja[0], z.caja[1]], [z.caja[2], z.caja[3]]]); L.rectangle([[z.caja[0], z.caja[1]], [z.caja[2], z.caja[3]]], {color:'#e3a63a', weight:2, dashArray:'6 6', fill:false, interactive:false}).addTo(capaRuta); });
      d.querySelectorAll('[data-zbor]').forEach(b=>b.onclick = async()=>{ b.disabled = true; await Zonas.borrar(b.dataset.zbor); A.aviso('Zona borrada'); dialogoZonas(); });
      d.querySelectorAll('[data-zact]').forEach(b=>b.onclick = ()=>{ const z = Zonas.lista().find(x=>x.id===b.dataset.zact); if(z) bajar(d, z); });
      d.querySelector('#zBajar').onclick = ()=>{ const z = zona(); if(!z) return;
        bajar(d, Object.assign(z, {id:'z' + Date.now(), nombre:st.area==='ruta' ? (m.nombre || 'Marcha') : 'Zona de ' + (m.nombre || 'la marcha') + ' (pantalla)'})); };
      d.querySelector('#zParar').onclick = ()=>{ if(bajando) bajando.parar = true; };
      pintar(); });
  }
  async function bajar(d, zona){
    if(bajando) return; const ctl = bajando = {parar:false}, pr = d.querySelector('#zProg'), br = d.querySelector('#zBarra'), tx = d.querySelector('#zProgT');
    pr.hidden = false; d.querySelector('#zBajar').disabled = true; d.querySelector('#zParar').style.display = '';
    try {
      const r = await Zonas.descargar(zona, (h, t, kb, fa)=>{ br.style.width = (h/t*100).toFixed(1) + '%'; tx.textContent = A.f(h) + ' de ' + A.f(t) + ' teselas · ' + A.f(kb/1024, 1) + ' MB' + (fa ? ' · ' + fa + ' sin bajar' : ''); }, ctl);
      if(r.parado){ A.aviso('Descarga detenida: lo bajado queda guardado'); }
      Zonas.anotar(Object.assign({}, zona, {fecha:Date.now(), n:r.total, kb:Math.max(r.kb, zona.kb || 0), fallas:r.fallas}));
      A.aviso(r.fallas ? 'Zona guardada; ' + r.fallas + ' teselas no se pudieron bajar (toca «Completar lo que falta» con mejor señal)' : 'Zona guardada: el mapa se verá sin señal');
    } catch(e){ A.aviso('No se pudo guardar: ' + e.message); }
    bajando = null; if(d.open) dialogoZonas();
  }

  async function dialogoCartas(){
    let cs = []; try { cs = await BD.todas(); } catch(e){}
    A.dialogo(`<h3>🗺 Cartas propias</h3>
      <p class="nota">Carga tu carta IGM o un croquis en <b>PDF</b> o como imagen (JPG o PNG) y cálzala con dos puntos de coordenadas conocidas (cruces de cuadrícula lejanos entre sí).
        Queda guardada en este equipo y se ve sin señal.</p>
      ${cs.map(c=>`<div class="tarjeta" style="padding:10px"><b>${A.esc(c.nombre)}</b>
        <div class="campos" style="margin-top:6px"><label class="c">Transparencia<input type="range" min="0.2" max="1" step="0.05" value="${c.opacidad || .8}" data-op="${c.id}"></label>
        <label class="c"><span><input type="checkbox" data-vis="${c.id}" ${c.visible!==false ? 'checked' : ''} style="width:auto"> Mostrar</span></label></div>
        <div class="btns"><button class="btn mini" data-ir="${c.id}">Ir a la carta</button><button class="btn mini peligro" data-del="${c.id}">Quitar</button></div></div>`).join('') || '<p class="nota">Aún no hay cartas cargadas.</p>'}
      <div class="btns"><button class="btn pri" id="cNueva">＋ Cargar carta (PDF o imagen)</button><button class="btn" data-cerrar>Cerrar</button></div>`, d=>{
      d.querySelector('#cNueva').onclick = ()=>{ const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf,.pdf';
        i.onchange = ()=>{ const f = i.files[0]; if(!f) return; const nombre = f.name.replace(/\.\w+$/, '');
          if(/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) return abrirPdf(f, nombre);
          const r = new FileReader(); r.onload = ()=>calzar(String(r.result), nombre); r.readAsDataURL(f); }; i.click(); };
      d.querySelectorAll('[data-op]').forEach(x=>x.oninput = async()=>{ const c = cs.find(c=>c.id===x.dataset.op); c.opacidad = +x.value; if(cartasCapa[c.id]) cartasCapa[c.id].setOpacity(c.opacidad); await BD.poner(c); });
      d.querySelectorAll('[data-vis]').forEach(x=>x.onchange = async()=>{ const c = cs.find(c=>c.id===x.dataset.vis); c.visible = x.checked; await BD.poner(c); cargarCartas(); });
      d.querySelectorAll('[data-ir]').forEach(x=>x.onclick = ()=>{ const c = cs.find(c=>c.id===x.dataset.ir); A.cerrarDialogo(); map.fitBounds(c.bounds); });
      d.querySelectorAll('[data-del]').forEach(x=>x.onclick = async()=>{ await BD.borrar(x.dataset.del); await cargarCartas(); dialogoCartas(); });
    });
  }
  /* ---------- cartas en PDF (pdf.js 3.11.174 de Mozilla, Apache-2.0, el mismo del graficador; se carga solo al usarlo) ----------
     Se elige la página y se convierte en imagen de buena resolución (hasta 6.000 px de lado y 16 millones de píxeles, el límite del iPhone);
     luego se calza igual que una imagen. */
  let pdfjs = null;
  function cargarPdfjs(){
    if(pdfjs) return pdfjs;
    return pdfjs = new Promise((res, rej)=>{ const s = document.createElement('script'); s.src = 'lib/pdfjs-3.11.174/pdf.min.js';
      s.onload = ()=>{ try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs-3.11.174/pdf.worker.min.js'; res(pdfjsLib); } catch(e){ rej(e); } };
      s.onerror = ()=>{ pdfjs = null; rej(new Error('no se pudo cargar el lector de PDF')); }; document.head.appendChild(s); });
  }
  async function abrirPdf(f, nombre){
    A.aviso('Leyendo el PDF…');
    let doc; try { const lib = await cargarPdfjs(); doc = await lib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise; }
    catch(e){ return A.aviso('No se pudo leer el PDF: ' + (e.message || e)); }
    if(doc.numPages===1) return pdfAImagen(doc, 1, nombre);
    // varias páginas: elegir cuál (con vista previa)
    A.dialogo(`<h3>Elige la página de «${A.esc(nombre)}»</h3><p class="nota">El PDF tiene ${doc.numPages} páginas.</p>
      <div class="campos"><label class="c">Página<select id="pPag">${Array.from({length:doc.numPages}, (_, i)=>`<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label></div>
      <div class="calce" style="text-align:center"><canvas id="pVista" style="max-width:100%"></canvas></div>
      <div class="btns"><button class="btn pri" id="pOk">Usar esta página</button><button class="btn" data-cerrar>Cancelar</button></div>`, async d=>{
      const vista = async n=>{ const pg = await doc.getPage(n), v0 = pg.getViewport({scale:1}), v = pg.getViewport({scale:Math.min(1.2, 700/Math.max(v0.width, v0.height))}), c = d.querySelector('#pVista');
        c.width = v.width; c.height = v.height; await pg.render({canvasContext:c.getContext('2d'), viewport:v}).promise; };
      d.querySelector('#pPag').onchange = e=>vista(+e.target.value);
      d.querySelector('#pOk').onclick = ()=>pdfAImagen(doc, +d.querySelector('#pPag').value, nombre + (doc.numPages>1 ? ' (p. ' + d.querySelector('#pPag').value + ')' : ''));
      vista(1); });
  }
  async function pdfAImagen(doc, n, nombre){
    A.aviso('Convirtiendo la carta en imagen…');
    try {
      const pg = await doc.getPage(n), v0 = pg.getViewport({scale:1}), k = Math.min(6000/Math.max(v0.width, v0.height), Math.sqrt(16e6/(v0.width*v0.height)), 8);
      const v = pg.getViewport({scale:k}), c = document.createElement('canvas'); c.width = Math.floor(v.width); c.height = Math.floor(v.height);
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      await pg.render({canvasContext:cx, viewport:v}).promise;
      const img = c.toDataURL('image/jpeg', 0.85); c.width = c.height = 0;
      calzar(img, nombre);
    } catch(e){ A.aviso('No se pudo convertir la página: ' + (e.message || e)); }
  }
  // calce con dos puntos: se marca cada punto en la imagen y se escribe su coordenada UTM (datum de la carta).
  // La imagen se puede acercar (＋ / −) para marcar los cruces con precisión (cartas grandes, como las que vienen en PDF).
  function calzar(img, nombre){
    const m = A.actual(), pts = [{}, {}]; let cual = 0;
    A.dialogo(`<h3>Calzar «${A.esc(nombre)}»</h3>
      <p class="nota">1) Toca el <b>punto 1</b> en la imagen (un cruce de cuadrícula) y escribe su coordenada. 2) Lo mismo con el <b>punto 2</b>, lo más lejos posible del primero.</p>
      <div class="btns" style="margin:4px 0"><button class="btn mini" id="cMenos">−</button><button class="btn mini" id="cMas">＋ Acercar</button><button class="btn mini" id="cAjus">Ver entera</button></div>
      <div class="calce"><div class="calce-in"><img src="${img}" alt=""><span class="mk" id="k0" hidden>1</span><span class="mk" id="k1" hidden>2</span></div></div>
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
      // marcas: se guardan en píxeles de la imagen y se dibujan según el acercamiento
      const ponerMarcas = ()=>[0, 1].forEach(k=>{ const p = pts[k], el = d.querySelector('#k' + k); if(p.px===undefined || !im.naturalWidth) return;
        const f = im.clientWidth/im.naturalWidth; el.hidden = false; el.style.left = p.px*f + 'px'; el.style.top = p.py*f + 'px'; });
      let zoom = 1; const caja = d.querySelector('.calce');
      const acercar = z=>{ const cw = caja.clientWidth, cx = (caja.scrollLeft + cw/2)/(im.clientWidth || 1), cy = (caja.scrollTop + caja.clientHeight/2)/(im.clientHeight || 1);
        zoom = Math.max(1, Math.min(z, 16)); im.style.maxWidth = 'none'; im.style.width = (cw*zoom) + 'px';
        caja.scrollLeft = cx*im.clientWidth - cw/2; caja.scrollTop = cy*im.clientHeight - caja.clientHeight/2; ponerMarcas(); };
      d.querySelector('#cMas').onclick = ()=>acercar(zoom*2); d.querySelector('#cMenos').onclick = ()=>acercar(zoom/2); d.querySelector('#cAjus').onclick = ()=>acercar(1);
      im.onload = ()=>acercar(1);
      im.onclick = e=>{ const r = im.getBoundingClientRect(), sx = im.naturalWidth/r.width, sy = im.naturalHeight/r.height;
        pts[cual] = {px:(e.clientX - r.left)*sx, py:(e.clientY - r.top)*sy}; ponerMarcas();
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
  return {abrir, ruta, cerrar, BASES, vueltaHorizonte, comoH};
})();
if(typeof globalThis!=='undefined') globalThis.Mapa = Mapa;
