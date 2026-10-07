/* BURROS DE COMBATE — pantallas: Marchas, Ruta (datos, parámetros y puntos), Cuadro (cuadro de marcha y ficha de navegación),
   Perfil (ficha de itinerario) y Enviar (C2 TOQUI, QR, archivos). Todo se guarda en este equipo (localStorage «burros_datos»). */
(function(){
  const M = MARCHA, $ = s=>document.querySelector(s), vista = $('#vista'), CLAVE = 'burros_datos';
  const esc = s=>String(s===undefined || s===null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f = (x, d)=>x===null || x===undefined || isNaN(x) ? '—' : (+x).toLocaleString('es-CL', {minimumFractionDigits:d||0, maximumFractionDigits:d||0});
  const km = m=>f(m/1000, m<10000 ? 2 : 1);
  const nid = ()=>Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- datos ---------- */
  let S = {marchas:[], actual:null, v:'marchas'};
  try { const d = JSON.parse(localStorage.getItem(CLAVE)); if(d && Array.isArray(d.marchas)) S = Object.assign(S, d); } catch(e){}
  let tGuardar = null;
  const guardar = ()=>{ clearTimeout(tGuardar); tGuardar = setTimeout(()=>{ tGuardar = null; try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch(e){ aviso('⚠ No se pudo guardar en este equipo'); } }, 250); };
  // al cerrar o pasar a segundo plano se guarda de inmediato (no esperar la pausa)
  const guardarYa = ()=>{ if(tGuardar){ clearTimeout(tGuardar); tGuardar = null; try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch(e){} } };
  addEventListener('pagehide', guardarYa); document.addEventListener('visibilitychange', ()=>{ if(document.hidden) guardarYa(); });
  const actual = ()=>S.marchas.find(m=>m.id===S.actual) || null;
  const hoy = ()=>{ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function nueva(datos){
    const m = Object.assign({id:nid(), nombre:'Nueva marcha', unidad:'', fecha:hoy(), hora:'08:00', datum:'WGS84', zona:'', par:M.porDefecto(), puntos:[]}, datos || {});
    m.par = Object.assign(M.porDefecto(), m.par || {}); m.id = nid();
    if(!m.puntos.length) m.puntos = [punto('PIM'), punto('PC1')];
    S.marchas.unshift(m); S.actual = m.id; guardar(); return m;
  }
  function punto(nombre, base){ return Object.assign({nombre, tipo:'UTM', zona:19, e:'', n:'', lat:'', lon:'', cota:'', obs:'', det:''}, base || {}); }
  function ejemplo(){
    const P = [['PIM', 'UTM', 354503, 6306601, 950, 'Inicio de sendero'], ['PC1', 'UTM', 353984, 6307092, 1080, 'Cruce de huellas'],
      ['PC2', 'GEO', '33 21 36', '70 34 28.2', 1270, 'Portezuelo'], ['PC3', 'GEO', '33 21 19.8', '70 34 42.6', 1450, 'Antena'],
      ['CUMBRE', 'GEO', '33 21 7.2', '70 34 52.3', 1638, 'Cumbre — vuelta al horizonte']];
    const pts = P.map(([nombre, tipo, a, b, cota, obs])=>punto(nombre, tipo==='UTM' ? {tipo, e:a, n:b, cota, obs} : {tipo, lat:a, lon:b, cota, obs}));
    pts[4].det = 20;
    pts.slice(0, 4).reverse().forEach(p=>pts.push(Object.assign({}, p, {obs:'Regreso — ' + p.obs, det:''})));
    return nueva({nombre:'Cerro Manquehue (EJEMPLO)', unidad:'Sección de ejemplo', puntos:pts});
  }

  /* ---------- avisos y diálogos ---------- */
  let tAviso = null;
  function aviso(t){ const a = $('#aviso'); a.textContent = t; a.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(()=>a.hidden = true, 2600); }
  const dlg = $('#dialogo');
  function dialogo(html, alAbrir){ dlg.innerHTML = html; if(!dlg.open) dlg.showModal(); dlg.querySelectorAll('[data-cerrar]').forEach(b=>b.onclick = ()=>dlg.close()); if(alAbrir) alAbrir(dlg); }
  dlg.addEventListener('close', ()=>{ if(dlg._parar) { dlg._parar(); dlg._parar = null; } });
  const cerrarDialogo = ()=>dlg.open && dlg.close();
  function confirmar(txt, si){ dialogo(`<h3>${esc(txt)}</h3><div class="btns"><button class="btn peligro" id="dSi">Sí</button><button class="btn" data-cerrar>Cancelar</button></div>`,
    d=>d.querySelector('#dSi').onclick = ()=>{ dlg.close(); si(); }); }
  function descargar(nombre, texto, tipo){
    const b = new Blob([texto], {type:tipo || 'text/plain'}), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const nombreArchivo = (m, ext)=>(m.nombre || 'marcha').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '') + '.' + ext;
  async function copiar(t){ try { await navigator.clipboard.writeText(t); aviso('📋 Copiado'); } catch(e){ aviso('No se pudo copiar: selecciónalo a mano'); } }

  /* ---------- navegación ---------- */
  function ir(v){ S.v = v; guardar(); pintar(); window.scrollTo(0, 0); }
  $('#pestanas').addEventListener('click', e=>{ const b = e.target.closest('button[data-v]'); if(b) ir(b.dataset.v); });
  function pintar(){
    const m = actual(); if(!m && S.v!=='marchas') S.v = 'marchas';
    if(!(S.v==='ruta' && S.rutaModo!=='lista')) Mapa.cerrar();
    document.body.classList.toggle('con-mapa', S.v==='ruta' && S.rutaModo!=='lista');
    document.querySelectorAll('#pestanas button').forEach(b=>{ b.classList.toggle('on', b.dataset.v===S.v); b.disabled = !m && b.dataset.v!=='marchas'; b.style.opacity = b.disabled ? .35 : 1; });
    $('#subtitulo').textContent = m ? m.nombre + (m.unidad ? ' · ' + m.unidad : '') : 'Planificación de marchas';
    ({marchas:vMarchas, ruta:vRuta, cuadro:vCuadro, perfil:vPerfil, lista:vLista, enviar:vEnviar})[S.v]();
  }

  /* =====================================================================  MARCHAS  */
  function vMarchas(){
    const lista = S.marchas.map(m=>{
      let r = null; try { r = M.calcular(m); } catch(e){}
      const ok = r && r.tramos.length;
      return `<div class="tarjeta marcha${m.id===S.actual ? ' on' : ''}" data-abrir="${m.id}">
        <div><div class="n">${esc(m.nombre)}</div>
        <div class="d">${esc(m.unidad || 'sin unidad')} · ${m.fecha ? esc(m.fecha.split('-').reverse().join('-')) : 'sin fecha'} ${esc(m.hora||'')}</div>
        <div class="d">${ok ? km(r.res.dist) + ' km · +' + f(r.res.sube) + ' m · ' + M.verDur(r.res.total) : (m.puntos.length + ' puntos · faltan datos')}</div></div>
        <span class="flecha"><button class="btn mini" data-dup="${m.id}">Duplicar</button> <button class="btn mini peligro" data-borra="${m.id}">Borrar</button></span></div>`;
    }).join('');
    vista.innerHTML = `<h2>Mis marchas</h2>
      ${lista || `<div class="tarjeta vacio">Aún no hay marchas.<br>Crea una nueva o abre el ejemplo para ver cómo funciona.</div>`}
      <div class="btns"><button class="btn pri" id="bNueva">＋ Nueva marcha</button><button class="btn" id="bEjemplo">Ver ejemplo</button>
        <button class="btn" id="bImportar">⤓ Importar GPX / KML</button><button class="btn" id="bRecibir">📨 Recibir plan (código o QR)</button></div>
      <h2>Respaldo</h2>
      <div class="tarjeta nota">Las marchas quedan guardadas solo en este equipo. Guarda un respaldo para pasarlas a otro equipo o no perderlas.
        <div class="btns"><button class="btn" id="bResp">⬇ Guardar respaldo</button><button class="btn" id="bCargar">⬆ Cargar respaldo</button></div></div>
      <h2>Qué hace</h2>
      <div class="tarjeta nota">Marca la ruta <b>sobre el mapa o tu carta</b> (con cuadrícula UTM y cota automática) y calcula el <b>cuadro de marcha</b> (distancia, desnivel, pendiente, rumbo magnético en grados y milésimas, tiempos, altos,
        imprevistos y hora de llegada a cada punto), dibuja el <b>perfil del itinerario</b>, arma la <b>ficha de navegación</b> para imprimir y
        <b>envía el plan</b> al C2 (código de texto, QR, GPX, KML, GeoJSON o Excel).<br><br>
        Tiempos según la <b>Cartilla de Planificación de Marcha en Montaña (Escuela de Montaña, CRM 2013)</b>, el método MIDE / DIN 33466 o la
        <b>marcha general</b> (velocidades, columna y tiempo de paso de ATP 3-21.18 Foot Marches, 2025). Agua y calor según TB MED 507 (2022). Lista de verificación antes, durante y después.
        Declinación magnética automática con el modelo WMM2025 (NOAA).<br><br>App no oficial: verifica siempre los resultados con la carta.</div>`;
    vista.querySelectorAll('[data-abrir]').forEach(d=>d.onclick = e=>{
      const b = e.target.closest('button');
      if(b && b.dataset.dup){ const o = JSON.parse(JSON.stringify(S.marchas.find(x=>x.id===b.dataset.dup))); o.nombre += ' (copia)'; nueva(o); return pintar(); }
      if(b && b.dataset.borra){ const x = S.marchas.find(x=>x.id===b.dataset.borra);
        return confirmar('¿Borrar la marcha «' + x.nombre + '»? No se puede deshacer.', ()=>{ S.marchas = S.marchas.filter(y=>y!==x); if(S.actual===x.id) S.actual = null; guardar(); pintar(); }); }
      S.actual = d.dataset.abrir; ir('ruta'); });
    $('#bNueva').onclick = ()=>{ nueva(); ir('ruta'); };
    $('#bEjemplo').onclick = ()=>{ ejemplo(); ir('cuadro'); };
    $('#bImportar').onclick = importarArchivo;
    $('#bRecibir').onclick = recibir;
    $('#bResp').onclick = ()=>descargar('burros_respaldo_' + hoy() + '.json', JSON.stringify({app:'burros', v:1, marchas:S.marchas}, null, 1), 'application/json');
    $('#bCargar').onclick = ()=>elegirArchivo('.json,application/json', t=>{
      try { const d = JSON.parse(t), ms = (d.marchas || []).filter(m=>m && Array.isArray(m.puntos)); if(!ms.length) throw 0;
        const ids = new Set(S.marchas.map(m=>m.id)); let n = 0; ms.forEach(m=>{ if(!ids.has(m.id)){ S.marchas.push(m); n++; } });
        guardar(); pintar(); aviso('✔ ' + n + ' marcha' + (n===1 ? '' : 's') + ' cargada' + (n===1 ? '' : 's'));
      } catch(e){ aviso('⚠ El archivo no es un respaldo válido'); } });
  }
  function elegirArchivo(accept, cb){
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = ()=>{ const fl = i.files[0]; if(!fl) return; const r = new FileReader(); r.onload = ()=>cb(String(r.result), fl.name); r.readAsText(fl); }; i.click();
  }
  function importarArchivo(){
    elegirArchivo('.gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml', (t, nombre)=>{
      const pts = BDC.leerArchivo(t, 40);
      if(!pts.length) return aviso('⚠ No se encontraron puntos en el archivo');
      const sinCota = pts.filter(p=>p.cota==='').length;
      nueva({nombre:nombre.replace(/\.(gpx|kml)$/i, ''), puntos:pts.map(p=>punto(p.nombre, {tipo:'GEO', lat:Math.abs(p.lat).toFixed(6), lon:Math.abs(p.lon).toFixed(6),
        norte:p.lat>0 || undefined, este:p.lon>0 || undefined, cota:p.cota}))});
      ir('ruta'); aviso('✔ ' + pts.length + ' puntos importados' + (sinCota ? ' — completa la cota de ' + sinCota : ''));
    });
  }

  /* recibir un plan (pegar código o leer QR con la cámara) */
  function recibir(){
    dialogo(`<h3>📨 Recibir plan de marcha</h3>
      <p class="nota">Pega el mensaje completo (o solo el código <span class="mono">#BDC1:…</span>) o lee el QR con la cámara.</p>
      <textarea id="rTxt" placeholder="#BDC1:…"></textarea>
      <div id="rCam"></div>
      <div class="btns"><button class="btn pri" id="rOk">Abrir</button><button class="btn" id="rQr">📷 Leer QR</button><button class="btn" data-cerrar>Cancelar</button></div>`, d=>{
      const abrir = t=>{ const o = BDC.leer(t);
        if(!o) return aviso('⚠ No se encontró un código válido');
        if(o.k!=='PLAN') return aviso('Es un mensaje de tipo «' + BDC.TIPOS[o.k] + '», no un plan');
        dlg.close(); nueva(BDC.marchaDePlan(o.d)); ir('cuadro'); aviso('✔ Plan recibido'); };
      d.querySelector('#rOk').onclick = ()=>abrir(d.querySelector('#rTxt').value);
      d.querySelector('#rQr').onclick = ()=>leerQR(d.querySelector('#rCam'), abrir);
    });
  }
  async function leerQR(cont, cb){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return aviso('La cámara no está disponible (se necesita https)');
    let st;
    try { st = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); } catch(e){ return aviso('No se pudo abrir la cámara'); }
    cont.innerHTML = '<video class="lector" playsinline muted></video>';
    const v = cont.querySelector('video'), c = document.createElement('canvas'), x = c.getContext('2d', {willReadFrequently:true});
    v.srcObject = st; await v.play(); let vivo = true;
    const parar = ()=>{ vivo = false; st.getTracks().forEach(t=>t.stop()); }; dlg._parar = parar;
    (function ciclo(){
      if(!vivo) return;
      if(v.videoWidth){ c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0);
        const r = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if(r && r.data){ parar(); cont.innerHTML = ''; return cb(r.data); } }
      requestAnimationFrame(ciclo);
    })();
  }

  /* =====================================================================  RUTA  */
  const apiMapa = {actual, guardar, punto, aviso, dialogo, cerrarDialogo, esc, f, calcular:m=>M.calcular(m), vistaMapa:null};
  const selRuta = ()=>`<div class="seg ruta-modo"><button data-rm="mapa" class="${S.rutaModo!=='lista' ? 'on' : ''}">🗺 Mapa</button><button data-rm="lista" class="${S.rutaModo==='lista' ? 'on' : ''}">☰ Datos<span class="largo"> y puntos</span></button></div>`;
  vista.addEventListener('click', e=>{ const b = e.target.closest('[data-rm]'); if(b){ S.rutaModo = b.dataset.rm; guardar(); pintar(); } });
  function vRuta(){
    if(S.rutaModo!=='lista'){ vista.innerHTML = selRuta() + '<div id="mapaCont"></div>'; Mapa.abrir($('#mapaCont'), apiMapa); return; }
    const m = actual(), p = m.par, R = M.calcular(m);
    const opc = (o, sel)=>Object.entries(o).map(([k, n])=>`<option value="${k}"${k===sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
    const vt = R.vel.tabla, pct = x=>Math.round((x||0)*1000)/10;
    const tropas = {normal:'Tropa normal', andina:'Tropa andina'};
    const terrenos = Object.fromEntries(Object.entries(M.TERRENOS).map(([k, v])=>[k, v.n]));
    vista.innerHTML = selRuta() + `
      <details class="tarjeta" ${m.puntos.some(x=>x.cota!=='') ? '' : 'open'}><summary>Datos de la marcha<span class="res">${esc(m.fecha ? m.fecha.split('-').reverse().join('-') : '')} ${esc(m.hora)}</span></summary>
        <div class="campos">
          <label class="c ancho">Nombre / itinerario<input data-m="nombre" value="${esc(m.nombre)}"></label>
          <label class="c ancho">Unidad<input data-m="unidad" value="${esc(m.unidad)}" placeholder="p. ej. 2.ª Sección, 1.ª Cía."></label>
          <label class="c">Fecha<input type="date" data-m="fecha" value="${esc(m.fecha)}"></label>
          <label class="c">Hora de partida (PIM)<input type="time" data-m="hora" value="${esc(m.hora)}"></label>
          <label class="c ancho">Datum de las coordenadas<select data-m="datum">${opc(Object.fromEntries(Object.entries(M.DATUMS).map(([k, v])=>[k, v.n])), m.datum)}</select></label>
          <label class="c">Zona UTM de trabajo<input class="num" data-m="zona" inputmode="numeric" value="${esc(m.zona)}" placeholder="auto (${R.zona})"></label>
          <label class="c ancho"><span><input type="checkbox" data-par="noche" data-redibujar ${p.noche ? 'checked' : ''} style="width:auto;vertical-align:middle"> Marcha nocturna (menor velocidad y distancias más cortas)</span></label>
        </div>
        <p class="nota">GPS y cartas IGM nuevas: WGS84. Cartas IGM antiguas: PSAD56 o SAD69 (lo dice el margen de la carta).</p>
      </details>

      <details class="tarjeta"><summary>Cálculo de tiempos<span class="res">${esc(({cartilla:'Cartilla montaña', mide:'MIDE', general:'Marcha general'})[p.metodo])} · altos ${pct(p.altos)} % · imprev. ${pct(p.imprev)} %</span></summary>
        <div class="campos">
          <label class="c ancho">Método<select data-par="metodo" data-redibujar>${opc(M.METODOS, p.metodo)}</select></label>
          ${p.metodo!=='general' ? `
          <label class="c">Tropa<select data-par="tropa" data-redibujar>${opc(tropas, p.tropa)}</select></label>
          <label class="c">Terreno / modalidad<select data-par="terreno" data-redibujar>${opc(terrenos, p.terreno)}</select></label>
          <label class="c">Carga (kg)<select data-par="carga" data-redibujar data-numero>${opc({10:'10 kg', 20:'20 kg', 30:'30 kg'}, String(p.carga))}</select></label>
          <label class="c">Valor de la tabla<select data-par="criterio" data-redibujar>${opc({min:'Menor (prudente)', media:'Promedio', max:'Mayor'}, p.criterio)}</select></label>
          <label class="c">Subida (m/h)<input class="num" data-par="velSub" inputmode="numeric" value="${esc(p.velSub||'')}" placeholder="${f(vt.sub)}"></label>
          <label class="c">Bajada (m/h)<input class="num" data-par="velBaj" inputmode="numeric" value="${esc(p.velBaj||'')}" placeholder="${f(vt.baj)}"></label>
          <label class="c">Llano (km/h)<input class="num" data-par="velLlano" inputmode="decimal" value="${esc(p.velLlano)}"></label>
          ${p.metodo==='cartilla' ? `<label class="c">Pendiente crítica (%)<input class="num" data-par="pteCr" data-pct inputmode="decimal" value="${pct(p.pteCr)}"></label>` : ''}`
          : `<label class="c">Vía principal<select data-par="via" data-redibujar>${opc(M.VIAS, p.via)}</select></label>
          <label class="c">Velocidad (km/h)<input class="num" data-par="velGeneral" inputmode="decimal" value="${esc(p.velGeneral||'')}" placeholder="${f(M.velGeneral(p.via, p.noche), 1)}"></label>`}
          <label class="c">Altos (% del tiempo de marcha)<input class="num" data-par="altos" data-pct inputmode="decimal" value="${pct(p.altos)}"></label>
          <label class="c">Imprevistos (%)<input class="num" data-par="imprev" data-pct inputmode="decimal" value="${pct(p.imprev)}"></label>
        </div>
        ${p.metodo!=='general' ? `<p class="nota">Tabla de la cartilla (Fig. 1-3) para ${esc(tropas[p.tropa].toLowerCase())}, ${esc(M.TERRENOS[p.terreno].n.toLowerCase())}, ${vt.carga} kg:
          subida <b>${esc(vt.rango)} m/h</b>, bajada <b>${f(vt.baj)} m/h</b>.${p.terreno==='esquies' && p.tropa==='normal' ? ' <b>Esquíes: la tabla solo trae valores para tropa andina.</b>' : ''}
          Deja vacía la casilla para usar la tabla, o escribe otra velocidad si conoces el rendimiento real de tu unidad.</p>` : ''}
        ${p.metodo==='general' ? `<p class="nota">Velocidades de ATP 3-21.18 (2025): camino ${f(4, 1)} km/h de día y ${f(3.2, 1)} de noche; campo traviesa ${f(2.4, 1)} y ${f(1.6, 1)} km/h
          (con carga de 18 kg o menos). <b>Ya incluyen el alto de 10 min por hora</b>, por eso los altos quedan en 0 %. En cada punto puedes cambiar la vía del tramo.
          Con más carga, la ATP indica unos 2 km menos cada 6 h por cada 4,5 kg sobre 18 kg: escribe una velocidad menor si corresponde.</p>` : ''}
        <p class="nota">${p.metodo==='cartilla' ? 'Cartilla: tramos con pendiente sobre la crítica (5 %) se calculan por el desnivel (DM = 60 × DV / VM); el resto por la distancia (DM = 60 × DH / VM). ' : ''}
          La cartilla indica 10 % de altos y 10 % de imprevistos (sobre marcha + altos); súbelos según el entrenamiento, la carga y la dificultad.</p>
        <h2>Declinación magnética</h2>
        <div class="campos">
          <label class="c ancho"><span><input type="checkbox" data-par="declAuto" data-redibujar ${p.declAuto ? 'checked' : ''} style="width:auto;vertical-align:middle"> Calcular automática (modelo WMM2025, según lugar y fecha)</span></label>
          ${p.declAuto ? '' : `
          <label class="c">Declinación (° , Este +)<input class="num" data-par="decl" inputmode="decimal" value="${esc(p.decl)}"></label>
          <label class="c">Fecha de ese valor<input type="date" data-par="declFecha" value="${esc(p.declFecha)}"></label>
          <label class="c">Variación anual (′/año, Este +)<input class="num" data-par="declVar" inputmode="decimal" value="${esc(p.declVar)}"></label>`}
        </div>
        <p class="nota" id="declTxt"></p>
      </details>

      <details class="tarjeta"><summary>Unidad y columna<span class="res">${R.columna ? f(R.columna.n) + ' hombres · ' + f(R.columna.largo) + ' m' : 'opcional'}</span></summary>
        <div class="campos">
          <label class="c">Efectivo (hombres)<input class="num" data-par="efectivo" inputmode="numeric" value="${esc(p.efectivo)}" placeholder="p. ej. 120"></label>
          <label class="c">Formación<select data-par="filas" data-numero>${opc({2:'Columna de a dos', 1:'Fila india'}, String(p.filas))}</select></label>
          <label class="c">Distancia entre hombres (m)<input class="num" data-par="distHombres" inputmode="decimal" value="${esc(p.distHombres||'')}" placeholder="${p.noche ? 2 : 5}"></label>
          <label class="c">Unidades de marcha<input class="num" data-par="unidades" inputmode="numeric" value="${esc(p.unidades)}" placeholder="1"></label>
          <label class="c">Distancia entre unidades (m)<input class="num" data-par="distUnidades" inputmode="numeric" value="${esc(p.distUnidades||'')}" placeholder="${p.noche ? 25 : 50}"></label>
        </div>
        <p class="nota">ATP 3-21.18: entre hombres 2–5 m de día y 1–3 m de noche; entre pelotones 50 m (noche 25 m) y entre compañías 100 m (noche 50 m).
          Con esto se calcula el largo de la columna y el <b>tiempo de paso</b> (lo que demora la columna completa en pasar por un punto), y la hora en que la cola llega al final.</p>
      </details>

      <details class="tarjeta"><summary>Calor y agua<span class="res">${R.calor && R.calor.cat ? 'categoría ' + esc(R.calor.n) : 'opcional'}</span></summary>
        <div class="campos">
          <label class="c">Índice WBGT previsto (°C)<input class="num" data-par="wbgt" inputmode="decimal" value="${esc(p.wbgt)}" placeholder="p. ej. 29"></label>
          <label class="c ancho">Intensidad del trabajo<select data-par="trabajo">${opc(M.TRABAJOS, p.trabajo)}</select></label>
        </div>
        <p class="nota">Tabla de TB MED 507 (2022): según el índice de calor (WBGT, medido con el equipo de la unidad o estimado) da los minutos de trabajo y descanso por hora y el agua por hora.
          Máximo 1,4 L por hora y 11,4 L por día.</p>
      </details>

      <h2>Puntos de control</h2>
      <p class="nota">En orden de marcha: PIM, PC1, PC2… (y el regreso si corresponde). Coordenadas UTM o geográficas (escribe <span class="mono">33 21 36</span> o <span class="mono">33.36</span>; sur y oeste se asumen). La cota es obligatoria.</p>
      <div id="puntos"></div>
      <div class="btns"><button class="btn pri" id="bPunto">＋ Agregar punto</button><button class="btn" id="bRegreso">↩ Agregar regreso (misma ruta)</button><button class="btn" id="bCotas">⛰ Completar cotas desde el terreno</button><button class="btn" id="bVer">Ver cuadro de marcha ›</button></div>`;
    pintarPuntos(); actualizarCalculos();
    $('#bPunto').onclick = ()=>{ const u = m.puntos[m.puntos.length - 1];
      m.puntos.push(punto('PC' + m.puntos.length, u ? {tipo:u.tipo, zona:u.zona} : {})); guardar(); pintarPuntos(); actualizarCalculos();
      const c = vista.querySelectorAll('.punto'); c[c.length - 1].scrollIntoView({behavior:'smooth', block:'center'}); };
    $('#bRegreso').onclick = ()=>{ if(m.puntos.length<2) return aviso('Primero ingresa la ida');
      m.puntos.slice(0, -1).reverse().forEach(x=>m.puntos.push(Object.assign({}, x, {det:'', obs:x.obs ? 'Regreso — ' + x.obs : 'Regreso'})));
      guardar(); pintarPuntos(); actualizarCalculos(); aviso('↩ Regreso agregado'); };
    $('#bVer').onclick = ()=>ir('cuadro');
    $('#bCotas').onclick = async()=>{
      const R = M.calcular(m), faltan = m.puntos.map((x, i)=>i).filter(i=>(m.puntos[i].cota==='' || m.puntos[i].cotaAuto) && R.puntos[i].lat!==null && R.puntos[i].lat!==undefined && !isNaN(R.puntos[i].lat));
      if(!faltan.length) return aviso('Todos los puntos tienen cota escrita');
      aviso('Buscando ' + faltan.length + ' cota' + (faltan.length===1 ? '' : 's') + '…'); let n = 0;
      for(const i of faltan){ const r = await DEM.cotaPunto(R.puntos[i].lat, R.puntos[i].lon); if(r){ Object.assign(m.puntos[i], {cota:Math.round(r.v), cotaAuto:true, cotaSrc:r.src}); n++; } }
      guardar(); pintar(); aviso(n ? '✔ ' + n + ' cota' + (n===1 ? '' : 's') + ' del terreno (revísalas con la carta)' : 'Sin conexión: no se pudieron obtener las cotas'); };
  }
  function pintarPuntos(){
    const m = actual(), cont = $('#puntos'); if(!cont) return;
    cont.innerHTML = m.puntos.map((x, i)=>{
      const utm = x.tipo!=='GEO';
      return `${i ? `<div class="tramo-entre" id="tr${i}"></div>` : ''}
      <div class="tarjeta punto" data-i="${i}"><span class="ord">${i + 1}</span>
        <div class="fila"><label class="c">Nombre del punto<input data-p="nombre" value="${esc(x.nombre)}"></label>
          <div class="seg"><button data-tipo="UTM" class="${utm ? 'on' : ''}">UTM</button><button data-tipo="GEO" class="${utm ? '' : 'on'}">Geográficas</button></div></div>
        ${utm ? `<div class="coords">
          <label class="c">Zona<input class="num" data-p="zona" inputmode="numeric" value="${esc(x.zona)}"></label>
          <label class="c">Este (m)<input class="num" data-p="e" inputmode="numeric" value="${esc(x.e)}" placeholder="354503"></label>
          <label class="c">Norte (m)<input class="num" data-p="n" inputmode="numeric" value="${esc(x.n)}" placeholder="6306601"></label>
          <label class="c cota">Cota (m)${x.cotaAuto ? ' ≈' : ''}<input class="num" data-p="cota" inputmode="numeric" value="${esc(x.cota)}"></label></div>`
        : `<div class="coords geo">
          <label class="c">Latitud ${x.norte ? 'N' : 'S'}<input class="num" data-p="lat" inputmode="decimal" value="${esc(x.lat)}" placeholder="33 21 36"></label>
          <label class="c">Longitud ${x.este ? 'E' : 'W'}<input class="num" data-p="lon" inputmode="decimal" value="${esc(x.lon)}" placeholder="70 34 28"></label>
          <label class="c cota">Cota (m)${x.cotaAuto ? ' ≈' : ''}<input class="num" data-p="cota" inputmode="numeric" value="${esc(x.cota)}"></label></div>`}
        ${actual().par.metodo==='general' && i ? `<div class="extra" style="grid-template-columns:1fr"><label class="c">Vía desde el punto anterior<select data-p="via">${'<option value="">Igual que la marcha (' + esc(M.VIAS[actual().par.via]) + ')</option>' + Object.entries(M.VIAS).map(([k, n])=>`<option value="${k}"${x.via===k ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>` : ''}
        <div class="extra"><label class="c">Observaciones (punto característico)<input data-p="obs" value="${esc(x.obs)}" placeholder="puente, portezuelo, cruce…"></label>
          <label class="c">Detención (min)<input class="num" data-p="det" inputmode="numeric" value="${esc(x.det)}" placeholder="0"></label></div>
        <div class="estado" id="est${i}"></div>
        <div class="acc"><button class="btn mini" data-acc="sube" ${i ? '' : 'disabled'} aria-label="Subir">▲</button><button class="btn mini" data-acc="baja" ${i<m.puntos.length - 1 ? '' : 'disabled'} aria-label="Bajar">▼</button>
          <button class="btn mini" data-acc="dup">Duplicar</button><button class="btn mini peligro" data-acc="borra">Borrar</button></div>
      </div>`;
    }).join('');
  }
  // recalcula y actualiza los textos sin redibujar los campos (para no perder el foco al escribir)
  function actualizarCalculos(){
    const m = actual(), R = M.calcular(m);
    R.puntos.forEach((p, i)=>{ const e = $('#est' + i); if(!e) return;
      const x = m.puntos[i], tiene = x.tipo==='GEO' ? (x.lat!=='' || x.lon!=='') : (x.e!=='' || x.n!=='');
      e.className = 'estado' + (!p.ok && tiene ? ' mal' : '');
      e.textContent = p.ok ? M.verGms(p.lat, 'N', 'S') + '  ' + M.verGms(p.lon, 'E', 'W') + '  ·  ' + p.utm.zona + M.banda(p.lat) + ' ' + f(p.utm.e) + ' E ' + f(p.utm.n) + ' N (WGS84)'
        : !tiene ? 'Ingresa las coordenadas' : (isNaN(p.cota) ? 'Falta la cota' : 'Coordenada no válida'); });
    m.puntos.forEach((_, i)=>{ const e = $('#tr' + i); if(!e) return; const t = R.tramos.find(t=>t.iB===i);
      e.innerHTML = t ? `<span>↓ <b>${f(t.dist)} m</b></span><span>${t.dv>=0 ? '+' : ''}${f(t.dv)} m (${f(t.pte*100, 1)} %)</span><span>rumbo <b>${f(t.azM, 1)}°</b> · ${t.mils} ‰</span><span>${M.verDur(t.t)}</span><span>llega ${M.verHora(t.llegada)}</span>` : ''; });
    const d = $('#declTxt');
    if(d) d.innerHTML = R.puntos.some(p=>p.ok) ? `Declinación a la fecha: <b>${f(R.decl.valor, 2)}° ${R.decl.valor>=0 ? 'Este' : 'Oeste'}</b> (${esc(R.decl.fuente)}). Convergencia en el PIM: ${f(R.res.conv, 2)}°.
      Rumbo magnético = acimut geográfico − declinación.` : 'Se calcula al ingresar el primer punto.';
    return R;
  }
  // edición: datos de la marcha, parámetros y puntos
  vista.addEventListener('input', e=>{
    const t = e.target, m = actual(); if(!m || S.v!=='ruta') return;
    if(t.dataset.m){ m[t.dataset.m] = t.value; if(t.dataset.m==='nombre' || t.dataset.m==='unidad') $('#subtitulo').textContent = m.nombre + (m.unidad ? ' · ' + m.unidad : ''); }
    else if(t.dataset.par){ let v = t.type==='checkbox' ? t.checked : t.value;
      if(t.dataset.pct) v = v==='' ? 0 : Number(String(v).replace(',', '.'))/100;
      else if(t.dataset.numero) v = Number(v);
      else if(['velSub', 'velBaj', 'velLlano', 'velGeneral', 'decl', 'declVar'].includes(t.dataset.par)) v = v==='' ? null : String(v).replace(',', '.');
      if(t.dataset.par==='metodo'){ if(v==='general' && m.par.metodo!=='general') m.par.altos = 0; else if(v!=='general' && m.par.metodo==='general' && !m.par.altos) m.par.altos = 0.10; }
      m.par[t.dataset.par] = v; }
    else if(t.dataset.p){ const i = +t.closest('.punto').dataset.i; m.puntos[i][t.dataset.p] = t.value; if(t.dataset.p==='cota'){ delete m.puntos[i].cotaAuto; delete m.puntos[i].cotaSrc; } }
    else return;
    guardar();
    if(t.dataset.redibujar!==undefined) return;   // lo redibuja el evento «change»
    actualizarCalculos();
  });
  vista.addEventListener('change', e=>{ if(S.v==='ruta' && e.target.dataset.redibujar!==undefined){ const y = window.scrollY; pintar(); window.scrollTo(0, y);
    const d = vista.querySelectorAll('details'); d[1] && (d[1].open = true); } });
  vista.addEventListener('click', e=>{
    if(S.v!=='ruta') return; const m = actual(), b = e.target.closest('button'); if(!b) return;
    const c = b.closest('.punto'); if(!c) return; const i = +c.dataset.i, P = m.puntos;
    if(b.dataset.tipo){ if(P[i].tipo===b.dataset.tipo) return;
      // al cambiar de sistema, se convierte la coordenada que ya estaba escrita
      const R = M.calcular(m), p = R.puntos[i];
      if(p.ok && m.datum==='WGS84'){
        if(b.dataset.tipo==='GEO'){ P[i].lat = Math.abs(p.lat).toFixed(6); P[i].lon = Math.abs(p.lon).toFixed(6); P[i].norte = p.lat>0 || undefined; P[i].este = p.lon>0 || undefined; }
        else { const u = M.llAUtm(p.lat, p.lon); P[i].zona = u.zona; P[i].e = Math.round(u.e); P[i].n = Math.round(u.n); }
      }
      P[i].tipo = b.dataset.tipo; }
    else if(b.dataset.acc==='sube' && i>0) [P[i - 1], P[i]] = [P[i], P[i - 1]];
    else if(b.dataset.acc==='baja' && i<P.length - 1) [P[i + 1], P[i]] = [P[i], P[i + 1]];
    else if(b.dataset.acc==='dup') P.splice(i + 1, 0, Object.assign({}, P[i], {nombre:P[i].nombre + "'"}));
    else if(b.dataset.acc==='borra'){ return confirmar('¿Borrar el punto «' + P[i].nombre + '»?', ()=>{ P.splice(i, 1); guardar(); pintarPuntos(); actualizarCalculos(); }); }
    else return;
    guardar(); pintarPuntos(); actualizarCalculos();
  });

  /* =====================================================================  CUADRO  */
  function encabezado(m, R){
    return `<div class="solo-imp"><b>CUADRO DE MARCHA — ${esc(m.nombre)}</b><br>Unidad: ${esc(m.unidad)} · Fecha: ${esc(m.fecha.split('-').reverse().join('-'))} · Partida: ${esc(m.hora)}
      · Datum ${esc(m.datum)} · Zona ${R.zona} · Declinación ${f(R.decl.valor, 2)}° · Método: ${esc(M.METODOS[R.par.metodo])}</div>`;
  }
  function kpis(R){
    const r = R.res;
    return `<div class="kpis">
      <div class="kpi"><div class="k">Distancia</div><div class="v">${km(r.dist)} <small>km</small></div></div>
      <div class="kpi"><div class="k">Ascenso / descenso</div><div class="v">+${f(r.sube)} <small>/ −${f(r.baja)} m</small></div></div>
      <div class="kpi"><div class="k">Tiempo total</div><div class="v">${r.total>=1 ? M.verDur(r.total).replace(' min', '') : M.verDur(r.total)}</div></div>
      <div class="kpi ocre"><div class="k">Término estimado</div><div class="v">${M.verHora(r.termino)}</div></div>
    </div>
    <div class="desglose"><span>marcha <b>${M.verDur(r.marcha)}</b></span><span>+ altos <b>${M.verDur(r.altos)}</b></span>${r.det ? `<span>+ detenciones <b>${M.verDur(r.det)}</b></span>` : ''}<span>+ imprevistos <b>${M.verDur(r.imprev)}</b></span>
      <span>punto más alto <b>${r.alto ? esc(r.alto.nombre) + ' ' + f(r.alto.cota) + ' m' : '—'}</b></span></div>`;
  }
  function apoyo(R){
    const c = R.columna, a = R.calor; let h = '';
    if(c) h += `<h2>Columna</h2><div class="kpis">
      <div class="kpi"><div class="k">Largo de la columna</div><div class="v">${f(c.largo)} <small>m</small></div></div>
      <div class="kpi"><div class="k">Tiempo de paso</div><div class="v">${M.verDur(c.paso)}</div></div>
      <div class="kpi"><div class="k">Cabeza llega al final</div><div class="v">${M.verHora(R.res.termino)}</div></div>
      <div class="kpi ocre"><div class="k">Cola llega al final</div><div class="v">${M.verHora(R.res.terminoCola)}</div></div></div>
      <p class="nota">${f(c.n)} hombres en ${c.filas===1 ? 'fila india' : 'columna de a dos'}, ${f(c.dh, 1)} m entre hombres (${f(c.factor, 2)} m por hombre)${c.u>1 ? ', ' + c.u + ' unidades de marcha a ' + f(c.du) + ' m' : ''}.
        Tiempo de paso a la velocidad media de la marcha (${f(c.vKmh, 1)} km/h con altos). Las horas del cuadro son de la cabeza de la columna.</p>`;
    if(a) h += `<h2>Calor y agua</h2>` + (a.cat ? `<div class="kpis">
      <div class="kpi"><div class="k">Categoría de calor</div><div class="v" style="font-size:18px">${esc(a.n)}</div></div>
      <div class="kpi"><div class="k">Trabajo / descanso</div><div class="v">${a.trabajo>=60 ? 'sin límite' : a.trabajo + '/' + a.descanso + ' <small>min</small>'}</div></div>
      <div class="kpi"><div class="k">Agua por hora</div><div class="v">${f(a.lh, 2)} <small>L</small></div></div>
      <div class="kpi ocre"><div class="k">Agua por hombre (marcha)</div><div class="v">${f(a.litros, 1)} <small>L</small></div></div></div>
      ${a.trabajo<60 ? `<div class="alerta">Con esta categoría, cada hora solo ${a.trabajo} min de trabajo y ${a.descanso} de descanso (TB MED 507). El tiempo del cuadro <b>no</b> considera estos descansos: súbelos en «Altos» o cambia la hora de partida.</div>` : ''}
      ${a.tope ? '<div class="alerta">La marcha supera el máximo diario de agua (11,4 L). Revisa la duración o divide la marcha.</div>' : ''}
      <p class="nota">TB MED 507 (2022), tabla 3-2. No beber más de 1,4 L por hora. Ajustar ± 0,25 L/h por diferencias individuales y por sol o sombra.${R.columna ? ' Total de la unidad: <b>' + f(a.litros*R.columna.n) + ' L</b>.' : ''}</p>`
      : `<p class="nota">WBGT ${f(a.wbgt, 1)} °C: bajo la categoría 1 de TB MED 507, sin restricción de trabajo. Igual hidratarse en cada alto.</p>`);
    return h;
  }
  function vCuadro(){
    const m = actual(), R = M.calcular(m), T = R.tramos;
    if(!T.length){ vista.innerHTML = `<div class="tarjeta vacio">Faltan datos: se necesitan al menos dos puntos con coordenadas y cota.<div class="btns" style="justify-content:center"><button class="btn pri" id="bR">Ir a la ruta</button></div></div>`;
      return $('#bR').onclick = ()=>ir('ruta'); }
    const malos = R.puntos.filter(p=>!p.ok);
    const como = {subida:'↗', bajada:'↘', llano:'→', MIDE:'', general:''};
    const pteC = p=>Math.abs(p)>=0.3 ? 'fuerte' : '';
    vista.innerHTML = `${encabezado(m, R)}
      <h2>Resumen</h2>${kpis(R)}
      ${malos.length ? `<div class="alerta">${malos.length} punto${malos.length===1 ? '' : 's'} sin coordenada o cota válida (${malos.map(p=>esc(p.nombre)).join(', ')}): sus tramos no se calcularon.</div>` : ''}
      ${R.avisos.map(a=>`<div class="alerta">${esc(a)}</div>`).join('')}
      ${R.res.lejos ? `<div class="alerta">Hay puntos a más de 4° del meridiano central de la zona ${R.zona}: revisa la zona UTM de trabajo.</div>` : ''}
      <h2>Cuadro de marcha</h2>
      <div class="tabla-env solo-ancho"><table class="t">
        <thead><tr><th class="tx">Tramo</th><th>Distancia<br>(m)</th><th>Dist. acum.<br>(km)</th><th>Cota<br>inicial</th><th>Cota<br>final</th><th>Desnivel<br>(m)</th><th>Pendiente</th>
          <th>Rumbo<br>mag. (°)</th><th>Rumbo<br>(‰)</th><th>Tiempo<br>tramo</th><th>Tiempo<br>acum.</th><th>Hora<br>llegada</th><th class="tx">Observaciones</th></tr></thead>
        <tbody>${T.map(t=>`<tr><td class="tx"><b>${esc(t.de)}</b> → <b>${esc(t.a)}</b></td><td>${f(t.dist)}</td><td>${f(t.distAcum/1000, 2)}</td><td>${f(t.cotaIni)}</td><td>${f(t.cotaFin)}</td>
          <td class="${t.dv>0 ? 'sube' : t.dv<0 ? 'baja' : ''}">${t.dv>0 ? '+' : ''}${f(t.dv)}</td><td class="${pteC(t.pte)}">${f(t.pte*100, 1)} %</td>
          <td><b>${f(t.azM, 1)}</b><span class="s">cuad. ${f(t.azC, 1)} · geo. ${f(t.azG, 1)}</span></td><td>${t.mils}</td>
          <td>${como[t.como]||''} ${M.verDur(t.t)}</td><td>${M.verDur(t.tAcum)}</td><td><b>${M.verHora(t.llegada)}</b>${t.det ? `<span class="s">sale ${M.verHora(t.salida)}</span>` : ''}</td><td class="obs tx">${esc(t.obs)}${t.det ? (t.obs ? ' · ' : '') + 'detención ' + Math.round(t.det*60) + ' min' : ''}</td></tr>`).join('')}
          <tr class="tot"><td class="tx">Total</td><td>${f(R.res.dist)}</td><td>${f(R.res.dist/1000, 2)}</td><td></td><td></td><td>+${f(R.res.sube)} / −${f(R.res.baja)}</td><td></td><td></td><td></td><td>${M.verDur(R.res.marcha)}</td><td></td><td>${M.verHora(R.res.termino)}</td><td class="tx obs">con altos, detenciones e imprevistos</td></tr>
        </tbody></table></div>
      <div class="tramos-cel">${T.map(t=>`<div class="tc"><div class="cab"><b>${esc(t.de)} → ${esc(t.a)}</b><span class="hora">${M.verHora(t.llegada)}</span></div>
        <div class="datos"><div><span>Rumbo mag.</span><b class="rumbo">${f(t.azM, 0)}°</b> <small>${t.mils} ‰</small></div><div><span>Distancia</span>${f(t.dist)} m</div><div><span>Tiempo</span>${M.verDur(t.t)}</div>
          <div><span>Desnivel</span>${t.dv>0 ? '+' : ''}${f(t.dv)} m</div><div><span>Pendiente</span>${f(t.pte*100, 1)} %</div><div><span>Acumulado</span>${f(t.distAcum/1000, 2)} km · ${M.verDur(t.tAcum)}</div></div>
        ${t.obs || t.det ? `<div class="nota" style="margin-top:6px">${esc(t.obs)}${t.det ? (t.obs ? ' · ' : '') + 'detención ' + Math.round(t.det*60) + ' min, sale ' + M.verHora(t.salida) : ''}</div>` : ''}</div>`).join('')}</div>

      ${apoyo(R)}
      <h2 class="salto">Ficha de navegación</h2>
      <div class="tabla-env"><table class="t">
        <thead><tr><th class="tx">Punto</th><th>Hora<br>llegada</th><th>Hora<br>salida</th><th>Altitud<br>(m)</th><th>Rumbo al siguiente<br>(° / ‰)</th><th>Distancia<br>(m)</th><th class="tx">Observaciones</th></tr></thead>
        <tbody>${R.puntos.filter(p=>p.ok).map(p=>{ const ll = T.find(t=>t.iB===p.i), sig = T.find(t=>t.iA===p.i), sal = ll ? ll.salida : R.res.partida + p.det;
          return `<tr><td class="tx"><b>${esc(p.nombre)}</b></td><td>${ll ? M.verHora(ll.llegada) : '—'}</td><td>${sig ? M.verHora(sal) : '—'}</td><td>${f(p.cota)}</td>
            <td>${sig ? '<b>' + f(sig.azM, 0) + '°</b> / ' + sig.mils : '—'}</td><td>${sig ? f(sig.dist) : '—'}</td><td class="obs tx">${esc(p.obs)}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="nota">Rumbos magnéticos con declinación ${f(R.decl.valor, 2)}° (${esc(R.decl.fuente)}) a la fecha de la marcha. Horas con ${Math.round(R.par.altos*100)} % de altos; los imprevistos (${M.verDur(R.res.imprev)}) quedan como reserva al final.</p>
      <div class="btns no-imp"><button class="btn pri" id="bImp">🖨 Imprimir / PDF</button><button class="btn" id="bPerf">Ver perfil ›</button><button class="btn" id="bEnv">Enviar ›</button></div>`;
    $('#bImp').onclick = ()=>window.print(); $('#bPerf').onclick = ()=>ir('perfil'); $('#bEnv').onclick = ()=>ir('enviar');
  }

  /* =====================================================================  PERFIL (ficha de itinerario)  */
  // perfil del terreno real (modelo digital) a lo largo de la ruta; se guarda en memoria por ruta
  const terrenos = new Map();
  const claveRuta = R=>R.tramos.map(t=>{ const a = R.puntos[t.iA], b = R.puntos[t.iB]; return a.lat.toFixed(5) + ',' + a.lon.toFixed(5) + '>' + b.lat.toFixed(5) + ',' + b.lon.toFixed(5); }).join('|');
  function terrenoDe(R){
    const k = claveRuta(R); if(terrenos.has(k)) return Promise.resolve(terrenos.get(k));
    const pts = [R.puntos[R.tramos[0].iA]].concat(R.tramos.map(t=>R.puntos[t.iB]));
    return DEM.perfil(pts, 25).then(pf=>{ if(pf){ const ini = [0].concat(R.tramos.map(t=>t.distAcum));
      pf.forEach(p=>p.x = ini[p.tramo] + p.t*R.tramos[p.tramo].dist); } terrenos.set(k, pf); return pf; });
  }
  function svgPerfil(R, T){
    const ok = R.puntos.filter(p=>p.ok); if(R.tramos.length<1) return '';
    const xs = [0], W = 1000, iz = 78, de = 16, ar = 14, alto = 260, barras = [['Horario', 28], ['Distancia (km)', 28], ['Desnivel (m)', 28], ['Puntos', 40]];
    R.tramos.forEach(t=>xs.push(t.distAcum));
    const D = R.res.dist || 1, cotas = ok.map(p=>p.cota).concat(T ? T.map(p=>p.z) : []), cmin = Math.min(...cotas), cmax = Math.max(...cotas), pad = Math.max(20, (cmax - cmin)*0.12);
    const y0 = Math.floor((cmin - pad)/50)*50, y1 = Math.ceil((cmax + pad)/50)*50;
    const X = d=>iz + (W - iz - de)*d/D, Y = c=>ar + alto - alto*(c - y0)/(y1 - y0 || 1);
    // la ruta puede pasar varias veces por el mismo punto (ida y vuelta): los puntos del perfil son los de cada tramo
    const serie = [{d:0, c:R.tramos[0].cotaIni, n:R.tramos[0].de, h:R.res.partida}].concat(R.tramos.map(t=>({d:t.distAcum, c:t.cotaFin, n:t.a, h:t.llegada, t})));
    let s = '';
    // cuadrícula de cotas
    const paso = [50, 100, 200, 250, 500, 1000].find(p=>(y1 - y0)/p<=7) || 1000;
    for(let c = Math.ceil(y0/paso)*paso; c<=y1; c += paso) s += `<line x1="${iz}" x2="${W - de}" y1="${Y(c)}" y2="${Y(c)}" stroke="#353a29" stroke-dasharray="2 4"/><text x="${iz - 6}" y="${Y(c) + 4}" text-anchor="end" font-size="11" fill="#a3a28c">${c}</text>`;
    // área y línea por tramo (color según pendiente)
    if(T){ s += `<path d="M${X(0)},${Y(y0)} ${T.map(p=>`L${X(p.x).toFixed(1)},${Y(p.z).toFixed(1)}`).join(' ')} L${X(D)},${Y(y0)} Z" fill="#6f705e" fill-opacity=".28"/>`
      + `<path d="M${T.map(p=>`${X(p.x).toFixed(1)},${Y(p.z).toFixed(1)}`).join(' L')}" fill="none" stroke="#a3a28c" stroke-width="1.6"/>`; }
    const area = `M${X(0)},${Y(y0)} ` + serie.map(p=>`L${X(p.d)},${Y(p.c)}`).join(' ') + ` L${X(D)},${Y(y0)} Z`;
    s += `<defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3a63a" stop-opacity=".35"/><stop offset="1" stop-color="#e3a63a" stop-opacity=".03"/></linearGradient></defs><path d="${area}" fill="url(#gA)"/>`;
    const col = p=>{ const a = Math.abs(p); return a<0.05 ? '#8fbf5a' : a<0.15 ? '#e3c23a' : a<0.3 ? '#e3a63a' : '#e86a4c'; };
    R.tramos.forEach((t, i)=>{ const a = serie[i], b = serie[i + 1];
      s += `<line x1="${X(a.d)}" y1="${Y(a.c)}" x2="${X(b.d)}" y2="${Y(b.c)}" stroke="${col(t.pte)}" stroke-width="3.5" stroke-linecap="round"/>`;
      const mx = (X(a.d) + X(b.d))/2, my = (Y(a.c) + Y(b.c))/2;
      if(X(b.d) - X(a.d)>46) s += `<text x="${mx}" y="${my - 8}" text-anchor="middle" font-size="10" fill="${col(t.pte)}">${f(t.pte*100, 0)}%</text>`; });
    // barras inferiores
    let yb = ar + alto + 18; const fin = yb + barras.reduce((a, b)=>a + b[1], 0);
    barras.forEach(([n, h], j)=>{ s += `<rect x="${iz}" y="${yb}" width="${W - iz - de}" height="${h}" fill="${j%2 ? '#1c1e16' : '#22251b'}"/><text x="${iz - 6}" y="${yb + h/2 + 4}" text-anchor="end" font-size="10" fill="#a3a28c">${n.split(' ')[0]}</text>`;
      serie.forEach((p, i)=>{ const x = X(p.d), lim = i===0 ? 'start' : i===serie.length - 1 ? 'end' : 'middle';
        const txt = [M.verHora(p.h), f(p.d/1000, 1), i ? (p.t.dv>0 ? '+' : '') + f(p.t.dv) : '0', p.n][j];
        // no amontonar textos: solo si hay espacio desde el anterior
        if(i && X(p.d) - X(serie[i - 1].d)<34 && j<3) return;
        s += j===3 ? `<text x="${x}" y="${yb + 15}" text-anchor="${lim}" font-size="11" font-weight="700" fill="#ece8d8">${esc(txt)}</text>`
          : `<text x="${x}" y="${yb + h/2 + 4}" text-anchor="${lim}" font-size="10.5" fill="${j===0 ? '#f2c46b' : j===2 && i ? (p.t.dv>0 ? '#e86a4c' : '#6fb3d9') : '#ece8d8'}">${txt}</text>`; });
      yb += h; });
    // líneas verticales de cada punto
    serie.forEach(p=>{ s += `<line x1="${X(p.d)}" x2="${X(p.d)}" y1="${Y(p.c)}" y2="${fin}" stroke="#6f705e" stroke-width=".8" stroke-dasharray="3 3"/><circle cx="${X(p.d)}" cy="${Y(p.c)}" r="4" fill="#14150f" stroke="#f2c46b" stroke-width="2"/>`; });
    // exageración vertical (la cartilla usa 1:25.000 vertical / 1:50.000 horizontal = ×2)
    const exa = ((W - iz - de)/D)/(alto/(y1 - y0 || 1));
    s += `<text x="${W - de}" y="${ar - 2}" text-anchor="end" font-size="10" fill="#6f705e">exageración vertical ×${f(1/exa, 1)}</text>`;
    return `<svg viewBox="0 0 ${W} ${fin + 6}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Perfil del itinerario">${s}</svg>`;
  }
  function vPerfil(){
    const m = actual(), R = M.calcular(m);
    if(!R.tramos.length){ vista.innerHTML = `<div class="tarjeta vacio">Faltan datos para el perfil.<div class="btns" style="justify-content:center"><button class="btn pri" id="bR">Ir a la ruta</button></div></div>`; return $('#bR').onclick = ()=>ir('ruta'); }
    const fuertes = R.tramos.filter(t=>Math.abs(t.pte)>=0.3);
    vista.innerHTML = `${encabezado(m, R).replace('CUADRO DE MARCHA', 'FICHA DE ITINERARIO')}
      <h2>Perfil del itinerario</h2>${kpis(R)}
      <div class="perfil-env" id="perfilSvg">${svgPerfil(R)}</div>
      <p class="nota" id="terrenoTxt">Cargando el perfil real del terreno…</p>
      <p class="nota">Color de cada tramo según la pendiente: <span style="color:#8fbf5a">■</span> menos de 5 % · <span style="color:#e3c23a">■</span> 5–15 % · <span style="color:#e3a63a">■</span> 15–30 % · <span style="color:#e86a4c">■</span> 30 % o más.
        ${fuertes.length ? '<br>Tramos más exigentes: <b>' + fuertes.map(t=>esc(t.de) + ' → ' + esc(t.a) + ' (' + f(t.pte*100, 0) + ' %)').join(', ') + '</b>.' : ''}</p>
      <div class="btns no-imp"><button class="btn pri" id="bImp">🖨 Imprimir / PDF</button></div>`;
    $('#bImp').onclick = ()=>window.print();
    terrenoDe(R).then(T=>{ const e = $('#terrenoTxt'); if(!e || S.v!=='perfil') return;
      if(!T){ e.textContent = 'Sin conexión: no se pudo cargar el perfil real del terreno (se muestra la línea entre puntos).'; return; }
      $('#perfilSvg').innerHTML = svgPerfil(R, T);
      const d = DEM.desniveles(T, 5), extra = Math.max(0, d.sube - R.res.sube);
      // pendiente máxima del terreno en tramos de ~100 m
      let pmax = 0; for(let i=0, j=0; i<T.length; i++){ while(j<T.length && T[j].x - T[i].x<100) j++; if(j<T.length) pmax = Math.max(pmax, Math.abs(T[j].z - T[i].z)/(T[j].x - T[i].x)); }
      // tramos donde el terreno se aparta de la línea recta entre puntos
      const desv = R.tramos.map((t, k)=>{ const ps = T.filter(p=>p.tramo===k); let mx = 0; ps.forEach(p=>{ const z = t.cotaIni + (t.cotaFin - t.cotaIni)*p.t; mx = Math.max(mx, Math.abs(p.z - z)); }); return {t, mx}; })
        .filter(x=>x.mx>=40);
      e.innerHTML = `<span style="color:#a3a28c">■</span> Terreno real (modelo SRTM ~30 m): sube <b>${f(d.sube)} m</b> y baja <b>${f(d.baja)} m</b> (los puntos de control dan +${f(R.res.sube)}/−${f(R.res.baja)} m).
        Pendiente máxima del terreno ≈ <b>${f(pmax*100, 0)} %</b>.` +
        (extra>=30 || desv.length ? `<div class="alerta">${extra>=30 ? 'El terreno sube ' + f(extra) + ' m más de lo que muestran los puntos: el tiempo calculado puede quedar corto. ' : ''}${desv.length ? 'Agrega puntos de control donde cambia la pendiente en: <b>' + desv.map(x=>esc(x.t.de) + ' → ' + esc(x.t.a) + ' (se aparta ' + f(x.mx) + ' m)').join(', ') + '</b>. La cartilla pide tramos de igual pendiente.' : ''}</div>` : '');
    });
  }

  /* =====================================================================  LISTA  */
  function vLista(){
    const m = actual(), L = m.lista || (m.lista = {}), tot = LISTA.reduce((a, g)=>a + g.items.length, 0), hechos = ()=>Object.values(L).filter(Boolean).length;
    vista.innerHTML = `<h2>Lista de verificación</h2><p class="nota" id="lCuenta"></p>` + LISTA.map(g=>`<h2>${esc(g.fase)}</h2><div class="tarjeta lista">` +
      g.items.map(([id, t, fuente])=>`<label class="item"><input type="checkbox" data-l="${id}" ${L[id] ? 'checked' : ''}><span>${esc(t)}${fuente ? ` <small>${esc(fuente)}</small>` : ''}</span></label>`).join('') + '</div>').join('') +
      `<div class="btns no-imp"><button class="btn" id="bLimpia">Desmarcar todo</button><button class="btn" id="bImp">🖨 Imprimir</button></div>`;
    const cuenta = ()=>$('#lCuenta').innerHTML = `<b>${hechos()} de ${tot}</b> listos. Fuentes: Cartilla de Planificación de Marcha en Montaña (CRM 2013), ATP 3-21.18 Foot Marches (2025) y TB MED 507 (2022).`;
    cuenta();
    vista.querySelectorAll('[data-l]').forEach(c=>c.onchange = ()=>{ L[c.dataset.l] = c.checked; guardar(); cuenta(); });
    $('#bLimpia').onclick = ()=>{ m.lista = {}; guardar(); pintar(); };
    $('#bImp').onclick = ()=>window.print();
  }

  /* =====================================================================  ENVIAR  */
  function vEnviar(){
    const m = actual(), R = M.calcular(m);
    if(!R.tramos.length){ vista.innerHTML = `<div class="tarjeta vacio">Completa la ruta antes de enviarla.<div class="btns" style="justify-content:center"><button class="btn pri" id="bR">Ir a la ruta</button></div></div>`; return $('#bR').onclick = ()=>ir('ruta'); }
    const msg = BDC.mensajePlan(m, R), cod = msg.split('\n')[1];
    vista.innerHTML = `<h2>Mensaje del plan de marcha</h2>
      <div class="tarjeta">
        <p class="nota">Una línea para leer o dictar por radio y un <b>código</b> que otro equipo con Burros de Combate (o el C2) abre con todos los datos.
          Pégalo en el chat, correo o sistema de mensajes, o muestra el QR.</p>
        <div class="mensaje" id="msg">${esc(msg)}</div>
        <div class="btns"><button class="btn pri" id="bCop">📋 Copiar mensaje</button>${navigator.share ? '<button class="btn" id="bComp">↗ Compartir</button>' : ''}<button class="btn" id="bQr">▦ Mostrar QR</button></div>
        <div id="qr"></div>
      </div>
      <h2>Archivos</h2>
      <div class="formatos">
        <button class="btn" data-arch="gpx"><b>GPX</b><small>GPS de mano, Garmin, apps de navegación, ATAK</small></button>
        <button class="btn" data-arch="kml"><b>KML</b><small>Google Earth, graficador, sistemas SIG</small></button>
        <button class="btn" data-arch="geojson"><b>GeoJSON</b><small>Sistemas C2 y SIG (QGIS, ArcGIS)</small></button>
        <button class="btn" data-arch="csv"><b>Excel (CSV)</b><small>Cuadro de marcha para anexar a la OPORD</small></button>
        <button class="btn" data-arch="json"><b>Marcha (JSON)</b><small>Para abrirla en otro equipo con esta app</small></button>
        <button class="btn" id="bImp"><b>🖨 Imprimir / PDF</b><small>Cuadro de marcha y ficha de navegación</small></button>
      </div>
      <h2>Vínculo con el C2 TOQUI</h2>
      <div class="tarjeta nota">
        Hoy el plan llega al C2 de tres formas, sin depender de cómo esté hecho el sistema:
        <b>1)</b> el mensaje con código (texto), <b>2)</b> el QR y <b>3)</b> archivos estándar (KML, GPX, GeoJSON) que cualquier C2 o SIG puede cargar como calco.
        Durante la marcha se enviarán además la llegada a cada punto de control (adelanto/atraso), la posición, los altos y las novedades.
        <div class="info">Para la conexión directa por red (como KÜTRAL), hay que saber qué formato acepta el TOQUI. Esta app ya usa formatos abiertos, así que el
          enlace se puede hacer apenas se conozca esa información.</div>
      </div>`;
    $('#bCop').onclick = ()=>copiar(msg);
    if($('#bComp')) $('#bComp').onclick = ()=>navigator.share({title:'Plan de marcha — ' + m.nombre, text:msg}).catch(()=>{});
    $('#bQr').onclick = ()=>{
      try { const q = qrcode(0, 'L'); q.addData(cod, 'Byte'); q.make(); $('#qr').innerHTML = `<div class="qr">${q.createSvgTag({cellSize:4, margin:2, scalable:true})}</div><p class="nota">Léelo con «Recibir plan» en otro equipo.</p>`; }
      catch(e){ $('#qr').innerHTML = '<div class="alerta">La ruta es demasiado larga para un QR: usa el mensaje de texto o un archivo.</div>'; } };
    vista.querySelectorAll('[data-arch]').forEach(b=>b.onclick = ()=>{ const k = b.dataset.arch;
      if(k==='gpx') descargar(nombreArchivo(m, 'gpx'), BDC.gpx(m, R), 'application/gpx+xml');
      if(k==='kml') descargar(nombreArchivo(m, 'kml'), BDC.kml(m, R), 'application/vnd.google-earth.kml+xml');
      if(k==='geojson') descargar(nombreArchivo(m, 'geojson'), BDC.geojson(m, R), 'application/geo+json');
      if(k==='csv') descargar(nombreArchivo(m, 'csv'), BDC.csv(m, R), 'text/csv;charset=utf-8');
      if(k==='json') descargar(nombreArchivo(m, 'json'), JSON.stringify({app:'burros', v:1, marchas:[m]}, null, 1), 'application/json'); });
    $('#bImp').onclick = ()=>{ ir('cuadro'); setTimeout(()=>window.print(), 300); };
  }

  /* ---------- inicio ---------- */
  pintar();
  if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
