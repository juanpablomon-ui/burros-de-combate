/* BURROS DE COMBATE — pantallas: Marchas, Ruta (datos, parámetros y puntos), Cuadro (cuadro de marcha y navegación),
   Perfil (ficha de itinerario) y Enviar (C2 TOQUI, QR, archivos). Todo se guarda en este equipo (localStorage «burros_datos»). */
(function(){
  const VERSION = '0.44', M = MARCHA, $ = s=>document.querySelector(s), vista = $('#vista'), CLAVE = 'burros_datos';
  const esc = s=>String(s===undefined || s===null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f = (x, d)=>x===null || x===undefined || isNaN(x) ? '—' : (+x).toLocaleString('es-CL', {minimumFractionDigits:d||0, maximumFractionDigits:d||0});
  const km = m=>f(m/1000, m<10000 ? 2 : 1);
  const nid = ()=>Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- datos ---------- */
  let S = {marchas:[], actual:null, v:'marchas'};
  try { const d = JSON.parse(localStorage.getItem(CLAVE)); if(d && Array.isArray(d.marchas)) S = Object.assign(S, d); } catch(e){}
  S.marchas.forEach(m=>{ m.par = Object.assign(M.porDefecto(), m.par || {}); if(m.par.metodo==='cartilla') m.par.metodo = 'montana';
    if(m.par.motivosAlto && !/agotamiento/i.test(m.par.motivosAlto)) m.par.motivosAlto = m.par.motivosAlto.replace(/(Comida\n?)/, '$1Agotamiento momentáneo\n');
    const u = m.puntos[m.puntos.length - 1]; if(m.puntos.length>1 && u && (u.nombre==='PIM' || u.nombre==='TÉRMINO')) u.nombre = 'PTM'; });   // el término de marcha se llama PTM   // parámetros completos; nombre antiguo del método
  Uso.poner(S.uso); Uso.observar();
  let tGuardar = null;
  const guardar = ()=>{ clearTimeout(tGuardar); tGuardar = setTimeout(()=>{ tGuardar = null; try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch(e){ aviso('⚠ No se pudo guardar en este equipo'); } }, 250); };
  // al cerrar o pasar a segundo plano se guarda de inmediato (no esperar la pausa)
  const guardarYa = ()=>{ if(tGuardar){ clearTimeout(tGuardar); tGuardar = null; try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch(e){} } };
  addEventListener('pagehide', guardarYa); document.addEventListener('visibilitychange', ()=>{ if(document.hidden) guardarYa(); });
  const actual = ()=>S.marchas.find(m=>m.id===S.actual) || null;
  const hoy = ()=>{ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function nueva(datos){
    const m = Object.assign({id:nid(), nombre:'Nueva marcha', unidad:'', fecha:hoy(), hora:'08:00', datum:'WGS84', zona:'', par:M.porDefecto(), puntos:[]}, datos || {});
    m.par = Object.assign(M.porDefecto(), !datos && Uso.civil() ? Uso.parCivil() : {}, m.par || {}); m.id = nid();
    if(!m.puntos.length) m.puntos = [punto(Uso.civil() ? 'Inicio' : 'PIM')];
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
    pts[pts.length - 1].nombre = 'PTM';
    if(Uso.civil()){ pts[0].nombre = 'Inicio'; pts[pts.length - 1].nombre = 'Término'; }
    return nueva(Object.assign({nombre:'Cerro Manquehue (EJEMPLO)', unidad:Uso.civil() ? 'Grupo de ejemplo' : 'Sección de ejemplo', puntos:pts},
      Uso.civil() ? {par:Object.assign(M.porDefecto(), Uso.parCivil(), {efectivo:8})} : {}));
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
  // Perfil y Lista van dentro de la pestaña Cuadro
  const PESTANA = {perfil:'cuadro', lista:'cuadro', material:'cuadro'};
  const subCuadro = ()=>`<div class="seg subv no-imp">${[['cuadro', 'Cuadro de marcha y navegación'], ['perfil', 'Perfil'], ['material', 'Material'], ['lista', 'Lista']].map(([k, n])=>`<button data-sv="${k}" class="${S.v===k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  vista.addEventListener('click', e=>{ const b = e.target.closest('[data-sv]'); if(b) ir(b.dataset.sv); });
  function pintar(){
    const m = actual(); if(!m && S.v!=='marchas') S.v = 'marchas';
    if(S.v==='ficha') S.v = 'cuadro';   // la ficha de navegación ahora está dentro del cuadro
    if(!({marchas:1, mapa:1, ruta:1, cuadro:1, perfil:1, lista:1, material:1, luz:1, seguir:1, enviar:1})[S.v]) S.v = 'marchas';
    if(S.v!=='mapa') Mapa.cerrar();
    if(S.v!=='seguir') Seguir.cerrar();
    document.body.classList.toggle('con-mapa', S.v==='mapa');
    document.querySelectorAll('#pestanas button').forEach(b=>{ b.classList.toggle('on', b.dataset.v===(PESTANA[S.v] || S.v)); b.disabled = !m && b.dataset.v!=='marchas'; b.style.opacity = b.disabled ? .35 : 1; });
    $('#subtitulo').textContent = m ? m.nombre + (m.unidad ? ' · ' + m.unidad : '') : 'Planificación de marchas';
    ({marchas:vMarchas, mapa:vMapa, ruta:vRuta, cuadro:vCuadro, perfil:vPerfil, material:vMaterial, luz:vLuz, lista:vLista, seguir:vSeguir, enviar:vEnviar})[S.v]();
    if(PESTANA[S.v] || S.v==='cuadro') vista.insertAdjacentHTML('afterbegin', subCuadro());
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
    vista.innerHTML = `<div class="tarjeta uso"><div class="uso-t">${S.uso ? 'Uso de la app' : '¿Cómo vas a usar Burros de Combate?'}</div>
        <div class="seg"><button data-uso="militar" class="${Uso.civil() ? '' : 'on'}">🪖 Militar</button><button data-uso="civil" class="${Uso.civil() ? 'on' : ''}">🥾 Civil</button></div>
        <p class="nota">${Uso.civil() ? 'Montañismo, trekking, scouts, guías y rescate: sin armamento ni términos militares; plan de ruta para tu contacto de emergencia.' : 'Marchas militares: líneas de carga, nombres clave, mensajes al C2 y orden gráfica.'} Cambia cuando quieras: el cálculo es el mismo.</p></div>
      <h2>Mis marchas</h2>
      ${lista || `<div class="tarjeta vacio">Aún no hay marchas.<br>Crea una nueva o abre el ejemplo para ver cómo funciona.</div>`}
      <div class="btns"><button class="btn pri" id="bNueva">＋ Nueva marcha</button><button class="btn" id="bEjemplo">Ver ejemplo</button>
        <button class="btn" id="bImportar">⤓ Importar GPX / KML</button><button class="btn" id="bRecibir">📨 Recibir plan (código o QR)</button></div>
      <h2>Respaldo</h2>
      <div class="tarjeta nota">Las marchas quedan guardadas solo en este equipo. Guarda un respaldo para pasarlas a otro equipo o no perderlas.
        <div class="btns"><button class="btn" id="bResp">⬇ Guardar respaldo</button><button class="btn" id="bCargar">⬆ Cargar respaldo</button></div></div>
      <h2>Siglas y términos</h2>
      <details class="tarjeta"><summary>Ver qué significa cada sigla</summary>
        <table class="t glosario"><tbody>${Uso.glosario(GLOSARIO).map(([k, v])=>`<tr><td class="tx"><b>${esc(k)}</b></td><td class="tx">${esc(v)}</td></tr>`).join('')}</tbody></table></details>
      <h2>Qué hace</h2>
      <div class="tarjeta nota">Marca la ruta <b>sobre el mapa o tu carta</b> (con cuadrícula UTM y cota automática) y calcula el <b>cuadro de marcha y navegación</b> (distancia, desnivel, pendiente, rumbo magnético en grados y milésimas, tiempos, altos,
        imprevistos y hora de llegada a cada punto), dibuja el <b>perfil del itinerario</b>, lo deja listo para imprimir y
        <b>envía el plan</b> al C2 (código de texto, QR, GPX, KML, GeoJSON o Excel).<br><br>
        Tiempos para <b>montaña</b> (tabla de velocidades por tropa, terreno y carga), el método MIDE / DIN 33466 o la
        <b>marcha general</b> (a pie o montada, según la vía), con velocidades de día o de noche según la hora de cada tramo. Pestaña <b>Luz</b>: sol, crepúsculos y luna del día de la marcha.
        Columna y tiempo de paso, agua y calor, lista de verificación antes, durante y después.
        Declinación magnética automática con el modelo WMM2025 (NOAA).<br><br>App no oficial: verifica siempre los resultados con la carta.
        <div class="mono" style="margin-top:8px;color:var(--tenue)">Versión ${VERSION}</div></div>`;
    vista.querySelectorAll('[data-abrir]').forEach(d=>d.onclick = e=>{
      const b = e.target.closest('button');
      if(b && b.dataset.dup){ const o = JSON.parse(JSON.stringify(S.marchas.find(x=>x.id===b.dataset.dup))); o.nombre += ' (copia)'; nueva(o); return pintar(); }
      if(b && b.dataset.borra){ const x = S.marchas.find(x=>x.id===b.dataset.borra);
        return confirmar('¿Borrar la marcha «' + x.nombre + '»? No se puede deshacer.', ()=>{ S.marchas = S.marchas.filter(y=>y!==x); if(S.actual===x.id) S.actual = null; guardar(); pintar(); }); }
      S.actual = d.dataset.abrir; ir('mapa'); });
    vista.querySelectorAll('[data-uso]').forEach(b=>b.onclick = ()=>{ S.uso = b.dataset.uso; Uso.poner(S.uso); guardar(); pintar(); aviso(Uso.civil() ? '🥾 Uso civil' : '🪖 Uso militar'); });
    $('#bNueva').onclick = ()=>{ nueva(); ir('mapa'); };
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
        norte:p.lat>0 || undefined, este:p.lon>0 || undefined, cota:p.cota, clave:p.clave, ev:p.ev}))});
      ir('mapa'); aviso('✔ ' + pts.length + ' puntos importados' + (sinCota ? ' — completa la cota de ' + sinCota : ''));
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
  const apiMapa = {actual, guardar, punto, aviso, dialogo, cerrarDialogo, confirmar, copiar, descargar, esc, f, calcular:m=>M.calcular(m), vistaMapa:null,
    M, evento:c=>evento(c), tablaCuadro:(m, R)=>tablaCuadro(m, R), apoyo:R=>apoyo(R), material:(m, R)=>{ const pm = R.carga || pesoMaterial(m, R);
      return (pm ? `<p class="doc-nota"><b>Carga por hombre: ${f(pm.total, 1)} kg</b> (1.ª línea ${f(pm.lineas[1], 1)} + 2.ª línea ${f(pm.lineas[2], 1)} + 3.ª línea ${f(pm.lineas[3], 1)}${pm.sinMochila ? ', <b>se deja</b>' : ''}${pm.base ? ' + otro peso ' + f(pm.base, 1) : ''}).</p>` : '') + htmlMaterial(m, R, true).html; },
    svgPerfil:(R, T, c)=>svgPerfil(R, T, c), terrenoDe:R=>terrenoDe(R), ir:v=>ir(v)};
  // documento para imprimir o PDF (orden gráfica militar o civil); se abre desde cada pantalla con la sección que corresponde
  function documento(secUnica){ const m = actual(); if(!m) return;
    if(secUnica){ m.doc = m.doc || {}; m.doc.sec = Object.assign({mapa:false, perfil:false, cuadro:false, matriz:false, luz:false, claves:false, apoyo:false, carga:false, material:false, lista:false}, {[secUnica]:true}); }
    Documento.abrir(apiMapa); }
  function vLuz(){ PantallaLuz.pintar(vista, Object.assign({}, apiMapa, {M, evento}));
    vista.insertAdjacentHTML('beforeend', '<div class="btns no-imp"><button class="btn pri" id="bImpL">📄 Documento con la luz y visibilidad</button></div>');
    $('#bImpL').onclick = ()=>documento('luz'); }
  function vMapa(){ vista.innerHTML = '<div id="mapaCont"></div>'; Mapa.abrir($('#mapaCont'), apiMapa); }
  function vSeguir(){ vista.innerHTML = '<div id="seguirCont"></div>'; Seguir.abrir($('#seguirCont'), apiMapa); }
  function vRuta(){
    const m = actual(), p = m.par, R = M.calcular(m);
    const opc = (o, sel)=>Object.entries(o).map(([k, n])=>`<option value="${k}"${k===sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
    const vt = R.vel.tabla, pct = x=>Math.round((x||0)*1000)/10;
    const tropas = {normal:'Tropa normal', andina:'Tropa andina'};
    const terrenos = Object.fromEntries(Object.entries(M.TERRENOS).map(([k, v])=>[k, v.n]));
    const sinAl = p.metodo==='battle' || p.metodo==='forzada', vb = M.velBattle(p), carga = `<label class="c">Carga por hombre (kg)${!p.cargaManual && R.carga ? ' <small>del material</small>' : ''}<input class="num" data-par="carga" data-redibujar inputmode="decimal" value="${!p.cargaManual && R.carga ? f(R.carga.total, 1) : esc(p.carga)}" ${!p.cargaManual && R.carga ? 'disabled' : ''}></label>`;
    const campo = (k, n, ph)=>`<label class="c">${n}<input class="num" data-par="${k}" data-redibujar inputmode="decimal" value="${esc(p[k])}"${ph ? ` placeholder="${ph}"` : ''}></label>`;
    const camposBattle = `<label class="c ancho">Patrón preparado<select data-par="brPreset" data-redibujar>${opc(Object.fromEntries(Object.entries(M.PRESETS_BR).map(([k, v])=>[k, v.n])), p.brPreset || 'propio')}</select></label>
          <label class="c ancho">Forma del patrón<select data-par="brPatron" data-redibujar>${opc(M.PATRONES, p.brPatron)}</select></label>
          ${p.brPatron==='distancia' ? campo('brRapido', 'Rápido (m)') + campo('brLento', 'Lento (m)') : p.brPatron==='tiempo' ? campo('brMinRap', 'Rápido (min)') + campo('brMinLen', 'Lento (min)') : campo('brPteLim', 'Al paso en subidas sobre (%)')}
          ${campo('brVelRap', p.brPatron==='terreno' ? 'Trote (km/h)' : 'Velocidad rápida (km/h)')}${campo('brVelLen', p.brPatron==='terreno' ? 'Paso (km/h)' : 'Velocidad lenta (km/h)')}
          ${carga}${campo('brMetaKm', 'Meta: distancia (km)', 'opcional')}${campo('brMetaMin', 'Meta: tiempo (min)', 'opcional')}`;
    const mt = R.meta, ritmo = x=>Math.floor(x) + ':' + String(Math.round((x - Math.floor(x))*60)).padStart(2, '0');
    const notaSinAltos = p.metodo==='battle' ? `<p class="nota">${p.brPatron==='terreno' ? `Trote a <b>${f(+p.brVelRap||9, 1)} km/h</b> en lo plano y en bajada; al paso (<b>${f(+p.brVelLen||6, 1)} km/h</b>) en subidas sobre ${esc(p.brPteLim)} %; en subidas sobre 15 %, el tiempo de montaña si es mayor.`
        : `Patrón con velocidad media <b>${f(vb, 2)} km/h</b> (${p.brPatron==='tiempo' ? esc(p.brMinRap) + ' min rápido a ' + f(+p.brVelRap||9, 1) + ' km/h × ' + esc(p.brMinLen) + ' min lento a ' + f(+p.brVelLen||6, 1) + ' km/h' : esc(p.brRapido) + ' m rápido a ' + f(+p.brVelRap||9, 1) + ' km/h × ' + esc(p.brLento) + ' m lento a ' + f(+p.brVelLen||6, 1) + ' km/h'}).
          En subidas de 7 % o más no se corre: van al paso (sobre 15 %, el tiempo de montaña si es mayor).`} Carrera de combate <b>sin altos</b>; si el calor lo exige, se agregan descansos.
        ${mt ? `<br>Meta: ${f(mt.km, 1)} km en ${f(mt.min)} min = ritmo ${ritmo(mt.ritmoMeta)} min/km. Plan: ritmo <b>${ritmo(mt.ritmo)} min/km</b> → ${mt.cumple ? '<b style="color:var(--verde,#7bbf6a)">cumple</b> (' + Math.round(-mt.dif) + ' min de margen)' : '<b style="color:var(--rojo)">no cumple: faltan ' + Math.round(mt.dif) + ' min</b>'}.` : ''}
        ${p.brPatron==='terreno' ? `Formato británico: 14,5 km en 90 min (10 min por milla), en grupo, con unos 14 kg más el fusil; trote en lo plano y en bajada, paso en subida.` : ''}</p>`
      : `<p class="nota">Marcha forzada: velocidad de la marcha general <b>${esc(p.forzadaPct)} % más rápida</b> y <b>sin altos</b> (se bebe caminando). Si el calor lo exige, se agregan descansos. Al llegar, la unidad necesita descanso y recuperación.</p>`;
    vista.innerHTML = `<div class="btns" style="margin:0 0 12px"><button class="btn" id="bAlMapa">🗺 Ver y editar la ruta en el mapa</button></div>
      <details class="tarjeta" ${m.puntos.some(x=>x.cota!=='') ? '' : 'open'}><summary>Fecha, hora y coordenadas<span class="res">${esc(m.fecha ? m.fecha.split('-').reverse().join('-') : '')} ${esc(m.hora)}</span></summary>
        <div class="campos">
          <label class="c ancho">Nombre / itinerario<input data-m="nombre" value="${esc(m.nombre)}"></label>
          <label class="c ancho">Unidad<input data-m="unidad" value="${esc(m.unidad)}" placeholder="p. ej. 2.ª Sección, 1.ª Cía."></label>
          <label class="c">Fecha<input type="date" data-m="fecha" value="${esc(m.fecha)}"></label>
          <label class="c">Hora de partida (PIM)<input type="time" data-m="hora" value="${esc(m.hora)}"></label>
          <label class="c ancho">Datum de las coordenadas<select data-m="datum">${opc(Object.fromEntries(Object.entries(M.DATUMS).map(([k, v])=>[k, v.n])), m.datum)}</select></label>
          <label class="c ancho">Día y noche para las velocidades<select data-par="luz" data-redibujar>${opc({auto:'Automático según la hora de cada tramo (recomendado)', dia:'Toda la marcha de día', noche:'Toda la marcha de noche'}, p.luz==='auto' && p.noche===true ? 'noche' : p.luz)}</select></label>
        </div>
        <p class="nota">GPS y cartas IGM nuevas: WGS84. Cartas IGM antiguas: PSAD56 o SAD69 (lo dice el margen de la carta).</p>
        <details class="avanzado"><summary>⚙ Avanzado</summary><div class="campos">
          <label class="c">Zona UTM de trabajo<input class="num" data-m="zona" inputmode="numeric" value="${esc(m.zona)}" placeholder="auto (${R.zona})"></label></div>
          <p class="nota">Se calcula sola con el PIM. Cámbiala solo si la ruta cruza el límite entre las zonas 18 y 19 (meridiano 72° W).</p></details>
      </details>

      <details class="tarjeta"><summary>Cálculo de tiempos<span class="res">${esc(({montana:'Montaña', mide:'MIDE', general:'Marcha general', forzada:'Marcha forzada', battle:'Carrera de combate'})[p.metodo])} · ${sinAl ? 'sin altos' : 'altos '}${sinAl ? '' : p.altosModo==='regimen' ? esc(p.altoDur) + ' min cada ' + esc(p.altoCada) : pct(p.altos) + ' %'} · imprev. ${pct(p.imprev)} %</span></summary>
        <div class="campos">
          <label class="c ancho">Método<select data-par="metodo" data-redibujar>${opc(Object.fromEntries(Object.entries(M.METODOS).filter(([k])=>!Uso.civil() || !['forzada', 'battle'].includes(k) || k===p.metodo)), p.metodo)}</select></label>
          ${p.metodo==='battle' ? camposBattle : p.metodo!=='general' && p.metodo!=='forzada' ? `
          <label class="c">Tropa<select data-par="tropa" data-redibujar>${opc(tropas, p.tropa)}</select></label>
          <label class="c">Terreno / modalidad<select data-par="terreno" data-redibujar>${opc(terrenos, p.terreno)}</select></label>
          <label class="c">Carga por hombre (kg)${!p.cargaManual && R.carga ? ' <small>del material</small>' : ''}<input class="num" data-par="carga" data-redibujar inputmode="decimal" value="${!p.cargaManual && R.carga ? f(R.carga.total, 1) : esc(p.carga)}" ${!p.cargaManual && R.carga ? 'disabled' : ''}></label>
          <label class="c ancho">Velocidades de subida y bajada<select data-par="fuenteVel" data-redibujar>${opc({tabla:'Tabla de la tropa (según tropa, terreno y carga)', mide:'Valores originales MIDE (300 m/h subida · 500 m/h bajada)', propia:'Las de mi unidad (escritas a mano)'}, R.vel.fuente)}</select></label>
          ${R.vel.fuente==='tabla' ? `<label class="c">Ritmo de la unidad<select data-par="criterio" data-redibujar>${opc({min:'Bajo', media:'Normal', max:'Exigente'}, p.criterio)}</select></label>` : ''}
          ${R.vel.fuente==='propia' ? `<label class="c">Subida (m/h)<input class="num" data-par="velSub" inputmode="numeric" value="${esc(p.velSub||'')}" placeholder="${f(vt.sub)}"></label>
          <label class="c">Bajada (m/h)<input class="num" data-par="velBaj" inputmode="numeric" value="${esc(p.velBaj||'')}" placeholder="${f(vt.baj)}"></label>` : ''}
          <label class="c">Llano (km/h)<input class="num" data-par="velLlano" inputmode="decimal" value="${esc(p.velLlano)}"></label>`
          : `<label class="c">Tipo de unidad<select data-par="unidadTipo" data-redibujar>${opc(M.UNIDADES, p.unidadTipo)}</select></label>
          <label class="c">Vía principal<select data-par="via" data-redibujar>${opc(M.VIAS, M.VIAS[p.via] ? p.via : 'camino1')}</select></label>
          <label class="c">Velocidad de día (km/h)<input class="num" data-par="velGeneral" inputmode="decimal" value="${esc(p.velGeneral||'')}" placeholder="${f(M.velGeneral(p.via, false, p.unidadTipo), 1)}"></label>
          ${p.metodo==='forzada' ? `<label class="c">Ritmo más rápido (%)<input class="num" data-par="forzadaPct" inputmode="decimal" value="${esc(p.forzadaPct)}"></label>
          <label class="c">Carga por hombre (kg)${!p.cargaManual && R.carga ? ' <small>del material</small>' : ''}<input class="num" data-par="carga" data-redibujar inputmode="decimal" value="${!p.cargaManual && R.carga ? f(R.carga.total, 1) : esc(p.carga)}" ${!p.cargaManual && R.carga ? 'disabled' : ''}></label>` : ''}`}
          ${p.metodo!=='general' && p.metodo!=='forzada' ? `<label class="c">Reducción de noche (%)<input class="num" data-par="redNoche" inputmode="numeric" value="${esc(p.redNoche)}"></label>` : ''}
          ${sinAl ? '' : `<label class="c">Altos<select data-par="altosModo" data-redibujar>${opc({pct:'% del tiempo de marcha', regimen:'Programados (cada cierto tiempo)'}, p.altosModo || 'pct')}</select></label>`}
          ${sinAl ? '' : p.altosModo==='regimen' ? `<label class="c">Primer alto a los (min)<input class="num" data-par="altoPrimero" inputmode="numeric" value="${esc(p.altoPrimero)}"></label>
          <label class="c">Primer alto de (min)<input class="num" data-par="altoPrimeroDur" inputmode="numeric" value="${esc(p.altoPrimeroDur)}"></label>
          <label class="c">Luego un alto cada (min)<input class="num" data-par="altoCada" inputmode="numeric" value="${esc(p.altoCada)}"></label>
          <label class="c">de (min)<input class="num" data-par="altoDur" inputmode="numeric" value="${esc(p.altoDur)}"></label>`
          : `<label class="c">Altos (% del tiempo de marcha)<input class="num" data-par="altos" data-pct inputmode="decimal" value="${pct(p.altos)}"></label>`}
          <label class="c">Imprevistos (%)<input class="num" data-par="imprev" data-pct inputmode="decimal" value="${pct(p.imprev)}"></label>
        </div>
        <p class="nota">${!p.cargaManual && R.carga ? `La carga sale del <b>Material</b> (Cuadro → Material): <b>${f(R.carga.inicial, 1)} kg al partir</b> y ${f(R.carga.final, 1)} kg al llegar (el agua se bebe en el camino); cada tramo se calcula con su carga.` : R.sinEfectivo ? '<b style="color:var(--ocre)">Falta el efectivo</b> (Unidad y columna): sin él no se puede calcular la carga desde el material; se usa la carga escrita.' : 'Carga escrita a mano.'}
          <label style="display:block;margin:6px 0"><input type="checkbox" data-par="cargaManual" data-redibujar ${p.cargaManual ? 'checked' : ''} style="width:auto;vertical-align:middle"> Escribir la carga a mano</label>
          ${sinAl ? ' La carga define el esfuerzo para el calor.' : p.metodo!=='general' ? ' La tabla trae 10, 20 y 30 kg: con otra carga se interpola.' : ' En marcha general, con carga sobre unos 18 kg la velocidad baja.'}</p>
        ${sinAl ? notaSinAltos : ''}
        ${p.metodo!=='general' && !sinAl ? `<p class="nota">Tabla de velocidades de marcha vertical en montaña para ${esc(tropas[p.tropa].toLowerCase())}, ${esc(M.TERRENOS[p.terreno].n.toLowerCase())}, ${f(vt.carga, 1)} kg:
          subida <b>${esc(vt.rango)} m/h</b>, bajada <b>${f(vt.baj)} m/h</b>.${p.terreno==='esquies' && p.tropa==='normal' ? ' <b>Esquíes: la tabla solo trae valores para tropa andina.</b>' : ''}
          ${R.vel.fuente==='tabla' ? 'Ritmo: bajo = valor menor del rango, normal = el medio, exigente = el mayor. ' : ''}Si conoces el rendimiento real de tu unidad, elige «Las de mi unidad».</p>` : ''}
        ${p.metodo==='general' || p.metodo==='forzada' ? `<div class="tabla-env" style="margin:10px 0"><table class="t"><thead><tr><th class="tx">Velocidades ${esc(M.UNIDADES[p.unidadTipo].toLowerCase())} (km/h)</th>${Object.values(M.VIAS).map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead>
          <tbody>${['dia', 'noche'].map(dn=>`<tr><td class="tx">${dn==='dia' ? 'Día' : 'Noche'}</td>${Object.keys(M.VIAS).map(v=>`<td>${f(M.VEL_GENERAL[p.unidadTipo][v][dn], 1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <p class="nota">En cada punto puedes cambiar la vía del tramo. Jornada de marcha ${esc(M.UNIDADES[p.unidadTipo].toLowerCase())}: <b>${M.JORNADA[p.unidadTipo]} km</b>.
          Si escribes una velocidad de día, la de noche baja en la misma proporción que la tabla. Si la velocidad de tu unidad ya incluye los altos, deja los altos en 0 %.</p>` : ''}
        <p class="nota">${p.luz==='dia' ? 'Toda la marcha se calcula con velocidades de día.' : p.luz==='noche' ? 'Toda la marcha se calcula con velocidades de noche.'
          : 'Día o noche se decide solo, tramo por tramo: si la mitad del tramo cae <b>después del crepúsculo náutico</b> (sol más de 12° bajo el horizonte), se usa la velocidad de noche. Detalle en la pestaña <b>Luz</b>.'}
          ${p.metodo!=='general' && p.metodo!=='forzada' ? ' De noche, en montaña, MIDE y carrera de combate la velocidad baja en el porcentaje indicado.' : ''}</p>
        <p class="nota">${p.metodo==='montana' ? 'Tramos con pendiente sobre la crítica (5 %) se calculan por el desnivel (DM = 60 × DV / VM); el resto por la distancia (DM = 60 × DH / VM). ' : ''}
          ${sinAl ? '' : p.altosModo==='regimen' ? `Altos programados: primer alto de ${esc(p.altoPrimeroDur)} min a los ${esc(p.altoPrimero)} min de marcha; luego ${esc(p.altoDur)} min cada ${esc(p.altoCada)} min (régimen habitual: 15 min a los 45 y luego 10 cada 50). Se ubican en las horas de llegada.`
            : 'Por defecto 10 % de altos; súbelos según el entrenamiento, la carga y la dificultad.'}
          Imprevistos (10 % por defecto, sobre marcha + altos): reserva para lo inesperado, incluido el agotamiento momentáneo; durante la marcha, los altos no planificados se registran en Seguir con su motivo.
          ${R.vel.fuente==='mide' ? '<br>Valores originales MIDE: 300 m/h de subida y 500 m/h de bajada, sin importar tropa ni carga.' : ''}</p>
        ${p.metodo==='montana' ? `<details class="avanzado"><summary>⚙ Avanzado</summary><div class="campos">
          <label class="c">Pendiente crítica (%)<input class="num" data-par="pteCr" data-pct inputmode="decimal" value="${pct(p.pteCr)}"></label></div>
          <p class="nota">Sobre esta pendiente el tramo se calcula por el desnivel; bajo ella, por la distancia (5 % por defecto).</p></details>` : ''}
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

      <details class="tarjeta"><summary>Unidad y columna<span class="res">${R.columna ? f(R.columna.n) + ' hombres · ' + f(R.columna.largo) + ' m' : '<b style="color:var(--rojo)">falta el efectivo</b>'}</span></summary>
        <div class="campos">
          <label class="c">Efectivo (hombres)<input class="num" data-par="efectivo" data-redibujar inputmode="numeric" value="${esc(p.efectivo)}" placeholder="p. ej. 120"></label>
          <label class="c">Formación<select data-par="filas" data-numero>${opc({2:'Columna de a dos', 1:'Fila india'}, String(p.filas))}</select></label>
          <label class="c">Distancia entre hombres (m)<input class="num" data-par="distHombres" inputmode="decimal" value="${esc(p.distHombres||'')}" placeholder="${R.fracNoche>0.5 ? 2 : 5}"></label>
          <label class="c">Unidades de marcha<input class="num" data-par="unidades" data-redibujar inputmode="numeric" value="${esc(p.unidades)}" placeholder="1"></label>
          ${(+p.unidades||1)>1 ? `<label class="c">Distancia entre unidades (m)<input class="num" data-par="distUnidades" inputmode="numeric" value="${esc(p.distUnidades||'')}" placeholder="${R.fracNoche>0.5 ? 25 : 50}"></label>` : ''}
        </div>
        ${p.efectivo ? '' : '<div class="alerta">Falta el <b>efectivo</b>: sin él no se calcula la columna, y el material y la carga quedan calculados para 1 hombre.</div>'}
        <p class="nota">Referencia: entre hombres 2–5 m de día y 1–3 m de noche; entre pelotones 50 m (noche 25 m) y entre compañías 100 m (noche 50 m).
          Con esto se calcula el largo de la columna y el <b>tiempo de paso</b> (lo que demora la columna completa en pasar por un punto), y la hora en que la cola llega al final.</p>
      </details>

      <details class="tarjeta"><summary>Calor y agua<span class="res">${R.calor && R.calor.cat ? 'categoría ' + esc(R.calor.n) : 'opcional'}</span></summary>
        <div class="campos">
          <label class="c">Temperatura (°C)<input class="num" data-par="temp" data-redibujar inputmode="decimal" value="${esc(p.temp)}" placeholder="del pronóstico"></label>
          <label class="c">Humedad (%)<input class="num" data-par="hum" data-redibujar inputmode="numeric" value="${esc(p.hum)}" placeholder="del pronóstico"></label>
        </div>
        ${R.calor ? `<div class="info">${R.calor.cat ? `Calor <b>categoría ${esc(R.calor.n)}</b>` : 'Calor <b>sin restricción</b>'} (índice ${f(R.calor.wbgt, 1)} °C${R.calor.fuenteWbgt==='medido' ? ', medido' : ''}).
          ${R.calor.trabajo<60 ? `<br>Cada hora: <b>${R.calor.trabajo} min de marcha y ${R.calor.descanso} min de descanso</b>.` : '<br>Sin descansos extra por calor.'}
          <br>Agua: <b>${f(R.calor.lh, 1)} L por hora</b> por hombre.
          ${R.calor.altosCalor ? '<br><b>La marcha se alargó para dar ese descanso.</b>' : ''}</div>`
          : '<p class="nota">Escribe la temperatura y la humedad del pronóstico para saber los descansos y el agua que exige el calor.</p>'}
        <details class="avanzado"><summary>⚙ Avanzado</summary><div class="campos">
          <label class="c">Índice de calor medido (WBGT, °C)<input class="num" data-par="wbgt" data-redibujar inputmode="decimal" value="${esc(p.wbgt)}" placeholder="si tienes medidor"></label>
          <label class="c ancho">Esfuerzo<select data-par="trabajo" data-redibujar>${opc(Object.assign({auto:'Según la carga (ahora: ' + (M.TRABAJOS[M.trabajoDe(p, R.carga ? R.carga.total : p.carga)] || '').split(' (')[0].toLowerCase() + ')'}, M.TRABAJOS), p.trabajo || 'auto')}</select></label>
          <label class="c ancho"><span><input type="checkbox" data-par="calorAltos" data-redibujar ${p.calorAltos!==false ? 'checked' : ''} style="width:auto;vertical-align:middle"> Agregar a la marcha el descanso que exige el calor</span></label></div>
          <p class="nota">El índice se estima con temperatura y humedad para sol moderado; con sol fuerte y sin viento puede ser mayor. El esfuerzo sale solo de la carga por hombre: cámbialo solo si quieres.</p></details>
      </details>

      <details class="tarjeta" id="dClaves"><summary>Nombres clave y eventos para la radio<span class="res">${esc(((p.verbo || 'PASANDO') + ' ' + (R.puntos[1] && R.puntos[1].clave || '…')).toUpperCase())}</span></summary>
        <div class="campos">
          <label class="c ancho">Lista de nombres clave<select data-par="claves" data-redibujar>${opc(Object.fromEntries(Object.entries(M.CLAVES).map(([k, v])=>[k, v.n])), p.claves)}</select></label>
          ${p.claves==='propia' ? `<label class="c ancho">Mi lista (una palabra por línea o separadas por coma)<textarea data-par="clavesPropias" data-redibujar-al-salir placeholder="LOBO&#10;OSO&#10;TIGRE">${esc(p.clavesPropias)}</textarea></label>` : ''}
          <label class="c">Palabra para informar el paso<select data-par="verboSel" data-redibujar>${opc({PASANDO:'PASANDO', EN:'EN', 'LLEGANDO A':'LLEGANDO A', CRUZANDO:'CRUZANDO', 'SOBRE':'SOBRE', otra:'Otra (escribir)'}, ['PASANDO', 'EN', 'LLEGANDO A', 'CRUZANDO', 'SOBRE'].includes(p.verbo || 'PASANDO') ? (p.verbo || 'PASANDO') : 'otra')}</select></label>
          ${['PASANDO', 'EN', 'LLEGANDO A', 'CRUZANDO', 'SOBRE'].includes(p.verbo || 'PASANDO') ? '' : `<label class="c">Palabra propia<input data-par="verbo" value="${esc(p.verbo)}" style="text-transform:uppercase"></label>`}
        </div>
        <p class="nota">Por radio: <b class="mono">«${esc((p.verbo || 'PASANDO').toUpperCase())} ${esc(R.puntos[1] && R.puntos[1].clave || 'ALFA')}»</b>. Cada punto recibe el siguiente nombre de la lista; si la ruta vuelve
          a pasar por el mismo lugar, se repite. Escribe un nombre en la tabla para cambiarlo a mano (vacío = el de la lista).</p>
        <div class="tabla-env"><table class="t"><thead><tr><th class="tx">Evento N.º</th><th class="tx">Punto</th><th class="tx">Nombre clave</th><th class="tx">Evento (radio)</th></tr></thead><tbody>
          ${m.puntos.map((x, i)=>R.puntos[i].ev ? `<tr><td class="tx">${R.eventos.indexOf(i) + 1}</td><td class="tx"><b>${esc(x.nombre)}</b></td><td class="tx"><input class="num clave" data-pc="${i}" value="${esc(x.clave || '')}" placeholder="${esc(R.puntos[i].clave || '')}" list="listaClaves" style="max-width:180px;padding:5px 8px"></td>
            <td class="tx" id="ev${i}">${evento(R.puntos[i].clave)}</td></tr>` : '').join('')}
        </tbody></table></div>
        <div class="btns"><button class="btn mini" id="bClavesAuto">↺ Todos automáticos (borrar los escritos a mano)</button></div>
        <h2>Eventos durante la marcha</h2>
        <p class="nota">Listas que aparecen con un toque en la pestaña Seguir. Una por línea; puedes agregar, quitar o cambiar el orden.</p>
        <div class="campos">
          <label class="c">Motivos de alto<textarea data-par="motivosAlto">${esc(p.motivosAlto)}</textarea></label>
          <label class="c">Novedades preparadas<textarea data-par="novedades">${esc(p.novedades)}</textarea></label>
        </div>
      </details>

      <h2>Puntos de control</h2>
      <p class="nota">En orden de marcha: PIM, PC1, PC2… (y el regreso si corresponde). Coordenadas UTM o geográficas (escribe <span class="mono">33 21 36</span> o <span class="mono">33.36</span>; sur y oeste se asumen). La cota es obligatoria.</p>
      <div class="btns barra-puntos"><button class="btn pri" data-lp="punto">＋ Agregar punto</button><button class="btn" data-lp="regreso">↩ Agregar regreso (misma ruta)</button><button class="btn" data-lp="cotas">⛰ Completar cotas desde el terreno</button><button class="btn" data-lp="ver">Ver cuadro de marcha ›</button></div>
      <div id="puntos"></div>
      <div class="btns barra-puntos"><button class="btn pri" data-lp="punto">＋ Agregar punto</button><button class="btn" data-lp="regreso">↩ Agregar regreso (misma ruta)</button><button class="btn" data-lp="cotas">⛰ Completar cotas desde el terreno</button><button class="btn" data-lp="ver">Ver cuadro de marcha ›</button></div>`;
    pintarPuntos(); actualizarCalculos();
    const lp = (k, fn)=>vista.querySelectorAll('[data-lp="' + k + '"]').forEach(b=>b.onclick = fn);
    lp('punto', ()=>{ const u = m.puntos[m.puntos.length - 1];
      m.puntos.push(punto('PC' + M.calcular(m).eventos.length, Object.assign(u ? {tipo:u.tipo, zona:u.zona} : {}, {ev:true}))); guardar(); pintarPuntos(); actualizarCalculos();
      const c = vista.querySelectorAll('.punto'); c[c.length - 1].scrollIntoView({behavior:'smooth', block:'center'}); });
    lp('regreso', ()=>{ if(m.puntos.length<2) return aviso('Primero ingresa la ida');
      m.puntos.slice(0, -1).reverse().forEach(x=>m.puntos.push(Object.assign({}, x, {det:'', obs:x.obs ? 'Regreso — ' + x.obs : 'Regreso'})));
      const u = m.puntos[m.puntos.length - 1]; if(!u.nombre || u.nombre==='PIM') u.nombre = 'PTM';   // término de marcha
      guardar(); pintarPuntos(); actualizarCalculos(); aviso('↩ Regreso agregado'); });
    lp('ver', ()=>ir('cuadro')); $('#bAlMapa').onclick = ()=>ir('mapa');
    $('#bClavesAuto').onclick = ()=>{ m.puntos.forEach(x=>{ x.clave = ''; }); guardar(); pintar(); $('#dClaves').open = true; aviso('↺ Nombres clave automáticos'); };
    vista.querySelectorAll('[data-pc]').forEach(inp=>inp.oninput = ()=>{ m.puntos[+inp.dataset.pc].clave = inp.value; guardar();
      const R2 = M.calcular(m); vista.querySelectorAll('[data-pc]').forEach(o=>{ o.placeholder = R2.puntos[+o.dataset.pc].clave || ''; const e = $('#ev' + o.dataset.pc); if(e) e.innerHTML = evento(R2.puntos[+o.dataset.pc].clave); });
      const pc = vista.querySelector('.punto[data-i="' + inp.dataset.pc + '"] [data-p=clave]'); if(pc) pc.value = inp.value; });
    const ta = vista.querySelector('[data-redibujar-al-salir]'); if(ta) ta.onchange = ()=>{ pintar(); $('#dClaves').open = true; };
    lp('cotas', async()=>{
      const R = M.calcular(m), faltan = m.puntos.map((x, i)=>i).filter(i=>(m.puntos[i].cota==='' || m.puntos[i].cotaAuto) && R.puntos[i].lat!==null && R.puntos[i].lat!==undefined && !isNaN(R.puntos[i].lat));
      if(!faltan.length) return aviso('Todos los puntos tienen cota escrita');
      aviso('Buscando ' + faltan.length + ' cota' + (faltan.length===1 ? '' : 's') + '…'); let n = 0;
      for(const i of faltan){ const r = await DEM.cotaPunto(R.puntos[i].lat, R.puntos[i].lon); if(r){ Object.assign(m.puntos[i], {cota:Math.round(r.v), cotaAuto:true, cotaSrc:r.src}); n++; } }
      guardar(); pintar(); aviso(n ? '✔ ' + n + ' cota' + (n===1 ? '' : 's') + ' del terreno (revísalas con la carta)' : 'Sin conexión: no se pudieron obtener las cotas'); });
  }
  function pintarPuntos(){
    const m = actual(), cont = $('#puntos'); if(!cont) return; const Rc = M.calcular(m);
    cont.innerHTML = `<datalist id="listaClaves">${(m.par.claves==='propia' ? M.listaPropia(m.par.clavesPropias) : (M.CLAVES[m.par.claves] || M.CLAVES.otan).l).map(c=>`<option value="${c}">`).join('')}</datalist>` + m.puntos.map((x, i)=>{
      const utm = x.tipo!=='GEO';
      return `${i ? `<div class="tramo-entre" id="tr${i}"></div>` : ''}
      <div class="tarjeta punto${Rc.puntos[i].ev ? '' : ' ruta'}" data-i="${i}"><span class="ord">${Rc.puntos[i].ev ? Rc.eventos.indexOf(i) + 1 || '·' : '·'}</span>
        <label class="h-ev"><input type="checkbox" data-ev ${Rc.puntos[i].ev ? 'checked' : ''} ${Rc.eventos[0]===i || Rc.eventos[Rc.eventos.length - 1]===i ? 'disabled' : ''}> <b>Evento</b> (se informa por radio)${Rc.puntos[i].ev ? '' : ' — sin marcar es solo un punto de ruta'}</label>
        ${m.par.reabast==='si' && i>0 && i<m.puntos.length - 1 ? `<label class="h-ev"><input type="checkbox" data-agua ${x.agua ? 'checked' : ''}> <b>💧 Punto de agua</b> (se repone el agua)</label>` : ''}
        <div class="fila"><label class="c">Nombre del punto<input data-p="nombre" value="${esc(x.nombre)}" placeholder="${Rc.puntos[i].ev ? '' : 'punto de ruta'}"></label>
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
        ${['general', 'forzada'].includes(actual().par.metodo) && i ? `<div class="extra" style="grid-template-columns:1fr"><label class="c">Vía desde el punto anterior<select data-p="via">${'<option value="">Igual que la marcha (' + esc(M.VIAS[actual().par.via]) + ')</option>' + Object.entries(M.VIAS).map(([k, n])=>`<option value="${k}"${x.via===k ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>` : ''}
        ${Rc.puntos[i].ev ? `<div class="extra" style="grid-template-columns:1fr"><label class="c">Nombre clave (vacío = automático)<input class="num clave" data-p="clave" value="${esc(x.clave||'')}" placeholder="${esc(Rc.puntos[i].clave || '')}" list="listaClaves"></label></div>` : ''}
        <div class="extra"><label class="c">Observaciones (punto característico)<input data-p="obs" value="${esc(x.obs)}" placeholder="puente, portezuelo, cruce…"></label>
          <label class="c">Detención (min)<input class="num" data-p="det" inputmode="numeric" value="${esc(x.det)}" placeholder="0"></label></div>
        <div class="estado" id="est${i}"></div>
        <div class="acc"><button class="btn mini" data-acc="carta" title="Marcar o corregir este punto tocando la carta">🗺 Ubicar en la carta</button><button class="btn mini" data-acc="sube" ${i ? '' : 'disabled'} aria-label="Subir">▲</button><button class="btn mini" data-acc="baja" ${i<m.puntos.length - 1 ? '' : 'disabled'} aria-label="Bajar">▼</button>
          <button class="btn mini" data-acc="dup">Duplicar</button><button class="btn mini peligro" data-acc="borra">Borrar</button></div>
      </div>`;
    }).join('');
  }
  // recalcula y actualiza los textos sin redibujar los campos (para no perder el foco al escribir)
  function actualizarCalculos(){
    const m = actual(), R = M.calcular(m);
    vista.querySelectorAll('.punto').forEach(c=>{ const k = c.querySelector('[data-p=clave]'), p = R.puntos[+c.dataset.i]; if(k && p) k.placeholder = p.clave || ''; });
    R.puntos.forEach((p, i)=>{ const e = $('#est' + i); if(!e) return;
      const x = m.puntos[i], tiene = x.tipo==='GEO' ? (x.lat!=='' || x.lon!=='') : (x.e!=='' || x.n!=='');
      e.className = 'estado' + (!p.ok && tiene ? ' mal' : '');
      e.textContent = p.ok ? M.verGms(p.lat, 'N', 'S') + '  ' + M.verGms(p.lon, 'E', 'W') + '  ·  ' + p.utm.zona + M.banda(p.lat) + ' ' + f(p.utm.e) + ' E ' + f(p.utm.n) + ' N (WGS84)'
        : !tiene ? 'Ingresa las coordenadas' : (isNaN(p.cota) ? 'Falta la cota' : 'Coordenada no válida'); });
    m.puntos.forEach((_, i)=>{ const e = $('#tr' + i); if(!e) return; const t = R.tramos.find(t=>t.iB===i);
      e.innerHTML = t ? `<span>↓ <b>${f(t.dist)} m</b></span><span>${t.dv>=0 ? '+' : ''}${f(t.dv)} m (${f(t.pte*100, 1)} %)</span><span>rumbo <b>${f(t.azM, 1)}°</b> · ${t.mils} ‰</span><span>${M.verDur(t.t)}</span><span>llega ${M.verHora(t.llegada)}</span>${R.carga ? `<span>carga ${f(t.carga, 1)} kg</span>` : ''}` : ''; });
    const d = $('#declTxt');
    if(d) d.innerHTML = R.puntos.some(p=>p.ok) ? `Declinación a la fecha: <b>${f(R.decl.valor, 2)}° ${R.decl.valor>=0 ? 'Este' : 'Oeste'}</b> (${esc(R.decl.fuente)}). Rumbo magnético = acimut geográfico − declinación.
      <details class="avanzado"><summary>⚙ Avanzado</summary><p class="nota">Convergencia en el PIM: ${f(R.res.conv, 2)}° (diferencia entre el norte de la cuadrícula y el geográfico; la app la aplica sola).</p></details>` : 'Se calcula al ingresar el primer punto.';
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
      else if(t.dataset.par==='carga'){ v = String(v).replace(',', '.'); m.par.cargaGeneral = true; }
      if(t.dataset.par==='luz') delete m.par.noche;
      if(['temp', 'hum', 'wbgt'].includes(t.dataset.par)) v = String(v).replace(',', '.');
      if(['altoPrimero', 'altoPrimeroDur', 'altoCada', 'altoDur', 'forzadaPct'].includes(t.dataset.par) || /^br(?!P)/.test(t.dataset.par)){ v = String(v).replace(',', '.'); if(/^br(?!P)/.test(t.dataset.par)) m.par.brPreset = 'propio'; }
      if(t.dataset.par==='brPatron') m.par.brPreset = 'propio';
      if(t.dataset.par==='brPreset'){ const q = Object.assign({}, M.PRESETS_BR[v] || {}); delete q.n; Object.assign(m.par, q); if(q.carga){ m.par.cargaGeneral = true; m.par.cargaManual = true; } }
      if(t.dataset.par==='verboSel'){ m.par.verbo = v==='otra' ? '' : v; guardar(); return; }
      if(t.dataset.par==='verbo') v = String(v).toUpperCase();
      m.par[t.dataset.par] = v; }
    else if(t.dataset.p){ const i = +t.closest('.punto').dataset.i; m.puntos[i][t.dataset.p] = t.value; if(t.dataset.p==='cota'){ delete m.puntos[i].cotaAuto; delete m.puntos[i].cotaSrc; } }
    else return;
    guardar();
    if(t.dataset.redibujar!==undefined) return;   // lo redibuja el evento «change»
    actualizarCalculos();
  });
  vista.addEventListener('change', e=>{
    if(S.v==='ruta' && e.target.dataset.ev!==undefined){ const m = actual(), i = +e.target.closest('.punto').dataset.i, p = m.puntos[i];
      p.ev = e.target.checked; if(p.ev && !p.nombre) p.nombre = 'PC' + M.calcular(m).eventos.filter(x=>x<i).length; if(!p.ev){ p.clave = ''; if(/^PC\d+$/.test(p.nombre)) p.nombre = ''; }
      guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); return; }
    if(S.v==='ruta' && e.target.dataset.agua!==undefined){ const m = actual(), i = +e.target.closest('.punto').dataset.i; m.puntos[i].agua = e.target.checked; guardar(); actualizarCalculos(); return; }
    if(S.v==='ruta' && e.target.dataset.redibujar!==undefined){
      // al redibujar se mantienen abiertas las mismas tarjetas (y la que contiene el campo cambiado)
      const titulo = d=>(d.querySelector('summary') || {}).firstChild ? d.querySelector('summary').firstChild.textContent.trim() : '';
      const abiertas = new Set([...vista.querySelectorAll('details[open]')].map(titulo)), propia = e.target.closest('details'); if(propia) abiertas.add(titulo(propia));
      const y = window.scrollY; pintar(); window.scrollTo(0, y);
      vista.querySelectorAll('details').forEach(d=>{ if(abiertas.has(titulo(d))) d.open = true; }); } });
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
    else if(b.dataset.acc==='carta'){ apiMapa.ubicar = i; return ir('mapa'); }
    else if(b.dataset.acc==='dup') P.splice(i + 1, 0, Object.assign({}, P[i], {nombre:P[i].nombre + "'"}));
    else if(b.dataset.acc==='borra'){ return confirmar('¿Borrar el punto «' + P[i].nombre + '»?', ()=>{ P.splice(i, 1); guardar(); pintarPuntos(); actualizarCalculos(); }); }
    else return;
    guardar(); pintarPuntos(); actualizarCalculos();
  });

  /* =====================================================================  CUADRO  */
  function encabezado(m, R){
    return `<div class="solo-imp"><b>CUADRO DE MARCHA Y NAVEGACIÓN — ${esc(m.nombre)}</b><br>Unidad: ${esc(m.unidad)} · Fecha: ${esc(m.fecha.split('-').reverse().join('-'))} · Partida: ${esc(m.hora)}
      · Datum ${esc(m.datum)} · Zona ${R.zona} · Declinación ${f(R.decl.valor, 2)}° · Método: ${esc(['battle', 'forzada'].includes(R.par.metodo) ? M.tipoMarcha(R.par) : M.METODOS[R.par.metodo])}</div>`;
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
      <span>punto más alto <b>${r.alto ? esc(r.alto.nombre) + ' ' + f(r.alto.cota) + ' m' : '—'}</b></span>${R.carga && R.carga.final!==undefined ? `<span>carga <b>${f(R.carga.inicial, 1)} kg</b> al partir → <b>${f(R.carga.final, 1)} kg</b> al llegar</span>` : ''}</div>
    ${['battle', 'forzada'].includes(R.par.metodo) ? `<div class="desglose"><span><b>${esc(M.tipoMarcha(R.par))}</b></span>${R.meta ? `<span>meta ${f(R.meta.km, 1)} km en ${f(R.meta.min)} min: <b style="color:var(--${R.meta.cumple ? 'verde' : 'rojo'})">${R.meta.cumple ? 'cumple (' + Math.round(-R.meta.dif) + ' min de margen)' : 'faltan ' + Math.round(R.meta.dif) + ' min'}</b></span>` : ''}</div>` : ''}`;
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
      ${a.trabajo<60 ? `<div class="alerta">Con esta categoría, cada hora solo ${a.trabajo} min de trabajo y ${a.descanso} de descanso (TB MED 507). ${a.altosCalor ? 'Los altos de la marcha ya se ajustaron a este descanso.' : R.par.calorAltos===false ? 'El tiempo del cuadro <b>no</b> considera estos descansos (opción desactivada en Calor y agua).' : 'Los altos de la marcha ya cubren este descanso.'}</div>` : ''}
      ${a.tope ? '<div class="alerta">La marcha supera el máximo diario de agua (11,4 L). Revisa la duración o divide la marcha.</div>' : ''}
      <p class="nota">TB MED 507 (2022), tabla 3-2. No beber más de 1,4 L por hora. Ajustar ± 0,25 L/h por diferencias individuales y por sol o sombra.${R.columna ? ' Total de la unidad: <b>' + f(a.litros*R.columna.n) + ' L</b>.' : ''}</p>`
      : `<p class="nota">WBGT ${f(a.wbgt, 1)} °C: bajo la categoría 1 de TB MED 507, sin restricción de trabajo. Igual hidratarse en cada alto.</p>`);
    return h;
  }
  // texto del evento para la radio: «PASANDO ALFA» (palabra elegida en Nombres clave)
  function evento(clave){ const m = actual(); return clave ? `<span class="clave-ev">${esc(((m.par && m.par.verbo) || 'PASANDO').toUpperCase())} <b>${esc(clave)}</b></span>` : ''; }
  // tabla del cuadro de marcha y navegación (se usa en la pestaña Cuadro y en el documento)
  function tablaCuadro(m, R){
    const T = R.tramos, como = {subida:'↗', bajada:'↘', llano:'→', MIDE:'', general:''}, pteC = p=>Math.abs(p)>=0.3 ? 'fuerte' : '';
    const filas = R.puntos.filter(p=>p.ok).map(p=>{ const ll = T.find(t=>t.iB===p.i), sig = T.find(t=>t.iA===p.i);
      return {p, ll, sig, sal:ll ? ll.salida : R.res.partida + p.det, acum:ll ? ll.distAcum : 0, tac:ll ? ll.tAcum : 0}; });
    const nombre = p=>p.ev ? '<b>' + esc(p.nombre) + '</b>' : '↳ quiebre';
    const p0 = R.puntos.find(q=>q.ok), icoLuz = h=>{ if(!R.conLuz || h===null || h===undefined) return '';
      const c = LUZ.condicion(new Date(LUZ.inicioDia(m.fecha) + h*36e5), p0.lat, p0.lon);
      return `<span class="luzico" title="${LUZ.TIPOS[c.tipo]}${c.oscuro ? (c.conLuna ? ', con luna' : ', sin luna') : ''}">${c.tipo==='dia' ? '☀' : c.oscuro ? (c.conLuna ? '☾' : '●') : '◐'}</span>`; };
    const obs = (p, ll)=>esc(p.obs) + (ll && ll.det ? (p.obs ? ' · ' : '') + 'detención ' + Math.round(ll.det*60) + ' min' : '');
    return `
      <div class="tabla-env solo-ancho"><table class="t cmn">
        <thead><tr><th class="tx">Punto</th><th class="tx">Evento<br>(radio)</th><th>Hora<br>llegada</th><th>Hora<br>salida</th><th>Altitud<br>(m)</th>
          <th class="sig">Rumbo al siguiente<br>(° / ‰)</th><th class="sig">Distancia<br>(m)</th><th class="sig">Desnivel<br>(m)</th><th class="sig">Pendiente</th><th class="sig">Tiempo</th>
          <th>Dist. acum.<br>(km)</th><th>Tiempo<br>acum.</th><th class="tx">Observaciones</th></tr></thead>
        <tbody>${filas.map(({p, ll, sig, sal, acum, tac})=>`<tr class="${p.ev ? '' : 'sub'}"><td class="tx">${nombre(p)}</td><td class="tx">${p.ev ? evento(p.clave) : ''}</td>
          <td>${ll ? '<b>' + M.verHora(ll.llegada) + '</b>' + icoLuz(ll.llegada) : '—'}</td><td>${sig ? M.verHora(sal) : '—'}</td><td>${f(p.cota)}</td>
          ${sig ? `<td class="sig"><b>${f(sig.azM, 0)}°</b> / ${sig.mils}<span class="s">cuad. ${f(sig.azC, 1)} · geo. ${f(sig.azG, 1)}</span></td><td class="sig">${f(sig.dist)}</td>
            <td class="sig ${sig.dv>0 ? 'sube' : sig.dv<0 ? 'baja' : ''}">${sig.dv>0 ? '+' : ''}${f(sig.dv)}</td><td class="sig ${pteC(sig.pte)}">${f(sig.pte*100, 1)} %</td><td class="sig">${como[sig.como]||''} ${M.verDur(sig.t)}</td>`
            : '<td class="sig">—</td><td class="sig"></td><td class="sig"></td><td class="sig"></td><td class="sig"></td>'}
          <td>${f(acum/1000, 2)}</td><td>${ll ? M.verDur(tac) : '—'}</td><td class="obs tx">${obs(p, ll)}</td></tr>`).join('')}
          <tr class="tot"><td class="tx">Total</td><td></td><td></td><td>${M.verHora(R.res.termino)}<span class="s">término</span></td><td></td><td class="sig"></td><td class="sig">${f(R.res.dist)}</td>
            <td class="sig">+${f(R.res.sube)} / −${f(R.res.baja)}</td><td class="sig"></td><td class="sig">${M.verDur(R.res.marcha)}</td><td>${f(R.res.dist/1000, 2)}</td><td></td><td class="tx obs">término con altos, detenciones e imprevistos</td></tr>
        </tbody></table></div>
`;
  }
  // CUADRO DE MARCHA Y NAVEGACIÓN: una fila por punto (eventos y quiebres). Del punto: horas, altitud y acumulados;
  // hacia el siguiente: rumbo, distancia, desnivel, pendiente y tiempo; al final, observaciones y el evento para la radio.
  function vCuadro(){
    const m = actual(), R = M.calcular(m), T = R.tramos;
    if(!T.length){ vista.innerHTML = `<div class="tarjeta vacio">Faltan datos: se necesitan al menos dos puntos con coordenadas y cota.<div class="btns" style="justify-content:center"><button class="btn pri" id="bR">Ir a la ruta</button></div></div>`;
      return $('#bR').onclick = ()=>ir('ruta'); }
    const malos = R.puntos.filter(p=>!p.ok);
    const como = {subida:'↗', bajada:'↘', llano:'→', MIDE:'', general:''};
    const pteC = p=>Math.abs(p)>=0.3 ? 'fuerte' : '';
    const filas = R.puntos.filter(p=>p.ok).map(p=>{ const ll = T.find(t=>t.iB===p.i), sig = T.find(t=>t.iA===p.i);
      return {p, ll, sig, sal:ll ? ll.salida : R.res.partida + p.det, acum:ll ? ll.distAcum : 0, tac:ll ? ll.tAcum : 0}; });
    const nombre = p=>p.ev ? '<b>' + esc(p.nombre) + '</b>' : '↳ quiebre';
    // condición de luz al llegar a cada punto: ☀ día · ◐ crepúsculo · ☾ noche con luna · ● noche sin luna
    const p0 = R.puntos.find(q=>q.ok), icoLuz = h=>{ if(!R.conLuz || h===null || h===undefined) return '';
      const c = LUZ.condicion(new Date(LUZ.inicioDia(m.fecha) + h*36e5), p0.lat, p0.lon);
      return `<span class="luzico" title="${LUZ.TIPOS[c.tipo]}${c.oscuro ? (c.conLuna ? ', con luna' : ', sin luna') : ''}">${c.tipo==='dia' ? '☀' : c.oscuro ? (c.conLuna ? '☾' : '●') : '◐'}</span>`; };
    const obs = (p, ll)=>esc(p.obs) + (ll && ll.det ? (p.obs ? ' · ' : '') + 'detención ' + Math.round(ll.det*60) + ' min' : '');
    vista.innerHTML = `${encabezado(m, R)}
      <h2>Resumen</h2>${kpis(R)}
      ${malos.length ? `<div class="alerta">${malos.length} punto${malos.length===1 ? '' : 's'} sin coordenada o cota válida (${malos.map(p=>esc(p.nombre || 'quiebre')).join(', ')}): sus tramos no se calcularon.</div>` : ''}
      ${R.avisos.map(a=>`<div class="alerta">${esc(a)}</div>`).join('')}
      ${R.res.lejos ? `<div class="alerta">Hay puntos a más de 4° del meridiano central de la zona ${R.zona}: revisa la zona UTM de trabajo.</div>` : ''}
      <h2>Cuadro de marcha y navegación</h2>
      ${tablaCuadro(m, R)}
      <div class="tramos-cel">${filas.map(({p, ll, sig, acum, tac})=>p.ev ? `<div class="tc"><div class="cab"><b>${esc(p.nombre)}</b><span class="hora">${ll ? M.verHora(ll.llegada) : 'sale ' + M.verHora(R.res.partida)}</span></div>
          ${sig ? `<div class="datos"><div><span>Rumbo al sig.</span><b class="rumbo">${f(sig.azM, 0)}°</b> <small>${sig.mils} ‰</small></div><div><span>Distancia</span>${f(sig.dist)} m</div><div><span>Tiempo</span>${M.verDur(sig.t)}</div>
            <div><span>Desnivel</span>${sig.dv>0 ? '+' : ''}${f(sig.dv)} m</div><div><span>Pendiente</span>${f(sig.pte*100, 1)} %</div><div><span>Acumulado</span>${f(acum/1000, 2)} km · ${M.verDur(tac)}</div></div>` : `<div class="nota">Término · ${f(acum/1000, 2)} km · ${M.verDur(tac)} de marcha</div>`}
          ${ll && p.clave ? `<div class="tc-ev">${evento(p.clave)}</div>` : ''}${obs(p, ll) ? `<div class="nota" style="margin-top:6px">${obs(p, ll)}</div>` : ''}</div>`
        : `<div class="tc quiebre">↳ quiebre · ${ll ? M.verHora(ll.llegada) : ''} · ${f(p.cota)} m${sig ? ` · rumbo <b>${f(sig.azM, 0)}°</b> / ${sig.mils} ‰ · ${f(sig.dist)} m` : ''}</div>`).join('')}</div>

      ${apoyo(R)}
      <p class="nota">Rumbos magnéticos con declinación ${f(R.decl.valor, 2)}° (${esc(R.decl.fuente)}) a la fecha de la marcha. Horas con ${Math.round(R.par.altos*100)} % de altos; los imprevistos (${M.verDur(R.res.imprev)}) quedan como reserva al final.
        Los quiebres (puntos de ruta) van en gris; los datos «al siguiente» son del tramo que sale de ese punto.
        ${R.conLuz ? 'Luz al llegar: ☀ día · ◐ crepúsculo · ☾ noche con luna · ● noche sin luna' + (R.tramos.some(t=>t.noche) ? '; los tramos de noche (☾/●) se calcularon con velocidad de noche' : '') + '. Detalle en la pestaña <b>Luz</b>.' : ''}</p>
      <div class="btns no-imp"><button class="btn pri" id="bImp">📄 Documento / orden gráfica</button><button class="btn" id="bPerf">Ver perfil ›</button><button class="btn" id="bEnv">Enviar ›</button></div>`;
    $('#bImp').onclick = ()=>documento(); $('#bPerf').onclick = ()=>ir('perfil'); $('#bEnv').onclick = ()=>ir('enviar');
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
  // compacto: versión baja para el panel del mapa (solo nombres de los puntos)
  function svgPerfil(R, T, compacto){
    const ok = R.puntos.filter(p=>p.ok); if(R.tramos.length<1) return '';
    const xs = [0], W = typeof compacto==='number' ? compacto : 1000, iz = compacto ? 46 : 78, de = 16, ar = 14, alto = compacto ? 150 : 260,
      barras = compacto ? [['Puntos', 22]] : [['Horario', 28], ['Distancia (km)', 28], ['Desnivel (m)', 28], ['Puntos', 40]];
    R.tramos.forEach(t=>xs.push(t.distAcum));
    const D = R.res.dist || 1, cotas = ok.map(p=>p.cota).concat(T ? T.map(p=>p.z) : []), cmin = Math.min(...cotas), cmax = Math.max(...cotas), pad = Math.max(20, (cmax - cmin)*0.12);
    const y0 = Math.floor((cmin - pad)/50)*50, y1 = Math.ceil((cmax + pad)/50)*50;
    const X = d=>iz + (W - iz - de)*d/D, Y = c=>ar + alto - alto*(c - y0)/(y1 - y0 || 1);
    // la ruta puede pasar varias veces por el mismo punto (ida y vuelta): los puntos del perfil son los de cada tramo
    const serie = [{d:0, c:R.tramos[0].cotaIni, n:R.tramos[0].de, h:R.res.partida, ev:true}].concat(R.tramos.map(t=>({d:t.distAcum, c:t.cotaFin, n:t.a, h:t.llegada, t, ev:t.evB})));
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
      // rótulos solo en los eventos (los puntos de ruta son quiebres sin nombre); el desnivel es desde el evento anterior
      const evs = serie.filter(p=>p.ev);
      evs.forEach((p, i)=>{ const x = X(p.d), lim = i===0 ? 'start' : i===evs.length - 1 ? 'end' : 'middle', dv = i ? p.c - evs[i - 1].c : 0;
        const jj = compacto ? 3 : j, txt = [M.verHora(p.h), f(p.d/1000, 1), i ? (dv>0 ? '+' : '') + f(dv) : '0', compacto ? (i ? p.t.claveB : (R.puntos[R.tramos[0].iA] || {}).clave) || p.n : p.n][jj];
        // no amontonar textos: solo si hay espacio desde el anterior
        if(i && X(p.d) - X(evs[i - 1].d)<(jj===3 && compacto ? 50 : 34) && (jj<3 || compacto)) return;
        s += jj===3 ? `<text x="${x}" y="${yb + 15}" text-anchor="${lim}" font-size="11" font-weight="700" fill="#ece8d8">${esc(txt)}</text>`
          : `<text x="${x}" y="${yb + h/2 + 4}" text-anchor="${lim}" font-size="10.5" fill="${j===0 ? '#f2c46b' : j===2 && i ? (dv>0 ? '#e86a4c' : '#6fb3d9') : '#ece8d8'}">${txt}</text>`; });
      yb += h; });
    // líneas verticales en los eventos; los quiebres solo llevan un punto chico
    serie.forEach(p=>{ s += p.ev ? `<line x1="${X(p.d)}" x2="${X(p.d)}" y1="${Y(p.c)}" y2="${fin}" stroke="#6f705e" stroke-width=".8" stroke-dasharray="3 3"/><circle cx="${X(p.d)}" cy="${Y(p.c)}" r="4" fill="#14150f" stroke="#f2c46b" stroke-width="2"/>`
      : `<circle cx="${X(p.d)}" cy="${Y(p.c)}" r="2.5" fill="#ece8d8"/>`; });
    // exageración vertical del dibujo
    const exa = ((W - iz - de)/D)/(alto/(y1 - y0 || 1));
    if(!compacto) s += `<text x="${W - de}" y="${ar - 2}" text-anchor="end" font-size="10" fill="#6f705e">exageración vertical ×${f(1/exa, 1)}</text>`;
    // línea del cursor (la mueve el panel del mapa)
    if(compacto) s += `<g id="pCursor" style="display:none"><line y1="${ar}" y2="${ar + alto}" stroke="#fff" stroke-width="1.5"/><circle r="5" fill="#fff" stroke="#14150f" stroke-width="2"/><text y="${ar + 10}" font-size="13" font-weight="700" fill="#fff" stroke="#14150f" stroke-width="3" paint-order="stroke"></text></g>`;
    return `<svg viewBox="0 0 ${W} ${fin + 6}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Perfil del itinerario" data-x0="${iz}" data-x1="${W - de}" data-d="${D}" data-y0="${y0}" data-y1="${y1}" data-ar="${ar}" data-alto="${alto}">${s}</svg>`;
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
      <div class="btns no-imp"><button class="btn pri" id="bImp">📄 Documento con el perfil</button><button class="btn" id="bImp2">📄 Documento completo</button></div>`;
    $('#bImp').onclick = ()=>documento('perfil'); $('#bImp2').onclick = ()=>documento();
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
        (extra>=30 || desv.length ? `<div class="alerta">${extra>=30 ? 'El terreno sube ' + f(extra) + ' m más de lo que muestran los puntos: el tiempo calculado puede quedar corto. ' : ''}${desv.length ? 'Agrega puntos de control donde cambia la pendiente en: <b>' + desv.map(x=>esc(x.t.de) + ' → ' + esc(x.t.a) + ' (se aparta ' + f(x.mx) + ' m)').join(', ') + '</b>. Así cada tramo queda con una pendiente pareja.' : ''}</div>` : '');
    });
  }

  /* =====================================================================  MATERIAL  */
  // elementos necesarios para la marcha, con la cantidad calculada (se puede escribir otra) y marca de «listo»; elementos propios al final
  function htmlMaterial(m, R, papel){
    const c = contextoMaterial(m, R), Mt = m.material || {}, extra = m.materialExtra || [];
    const filas = MATERIAL.map(g=>{ const its = g.items.map(([id, n, cant, nota])=>{ const v = cant(c); if(v===null || v===undefined) return null;
        return {id, n, auto:String(v), nota:nota(c)}; }).filter(Boolean);
      return its.length ? {g:g.g, its} : null; }).filter(Boolean);
    if(extra.length) filas.push({g:'Otros (agregados por mí)', its:extra.map((x, i)=>({id:'x' + i, n:x.n, auto:x.cant || '', nota:'', propio:i}))});
    if(!papel) return {c, filas, html:fichasMaterial(m, R, filas)};
    return {c, filas, html:filas.map(({g, its})=>`<h3 class="${papel ? 'doc-h3' : 'mat-g'}">${esc(g)}</h3><table class="t mat"><tbody>
      ${its.map(it=>{ const st = Mt[it.id] || {}; return `<tr class="${st.ok ? 'hecho' : ''}"><td class="tx ck">${papel ? (st.ok ? '☑' : '☐') : `<input type="checkbox" data-mt="${it.id}" ${st.ok ? 'checked' : ''}>`}</td>
        <td class="tx"><b>${esc(it.n)}</b>${it.nota ? `<span class="s">${esc(it.nota)}</span>` : ''}</td>
        <td class="cant">${papel ? esc(st.cant || it.auto) : `<input class="num" data-mc="${it.id}" value="${esc(st.cant || '')}" placeholder="${esc(it.auto)}">`}</td>
        <td class="kg">${(()=>{ const pz = PESOS[it.id] || [0, 'c'], kg0 = it.propio!==undefined ? '' : pz[0], noCarga = pz[1]==='x';
          return noCarga ? '<span class="s">no se carga</span>' : papel ? (st.kg || kg0) + ' kg' : `<input class="num" data-mk="${it.id}" value="${esc(st.kg || '')}" placeholder="${kg0} kg c/u" inputmode="decimal">`; })()}</td>
        <td class="lin">${(PESOS[it.id] || [0, 'c'])[1]==='x' ? '' : papel ? LINEAS[lineaDe(m, it.id)] : `<select data-ml="${it.id}" aria-label="Línea">${[1, 2, 3, 4].map(l=>`<option value="${l}"${lineaDe(m, it.id)===l ? ' selected' : ''}>${l}.ª</option>`).join('')}</select>`}</td>
        ${papel ? '' : `<td>${it.propio!==undefined ? `<button class="btn mini peligro" data-mx="${it.propio}" aria-label="Quitar">✕</button>` : ''}</td>`}</tr>`; }).join('')}
      </tbody></table>`).join('')};
  }
  // unidad de medida de una cantidad («4,5 L», «6 pares», «3» = unidades) y su nombre en singular para el peso
  const UNI1 = {L:'L', pares:'par', 'juego(s)':'juego', juegos:'juego', sobres:'sobre', 'kit(s)':'kit', equipos:'equipo', u:'unidad'};
  const unidadDe = t=>{ const x = /^[\d.,+\s]+(.*)$/.exec(String(t || '').trim()); const u = x && x[1].trim(); return u || 'u'; };
  // en pantalla: una ficha por elemento, del ancho del teléfono: cantidad con su unidad × kg por unidad = kg (total y por hombre)
  function fichasMaterial(m, R, filas){
    const Mt = m.material || {}, pm = R.carga || pesoMaterial(m, R), porId = {}; (pm ? pm.items : []).forEach(x=>porId[x.id] = x);
    return filas.map(({g, its})=>`<h3 class="mat-g">${esc(g)}</h3><div class="mat-lista">${its.map(it=>{
      const st = Mt[it.id] || {}, pz = PESOS[it.id] || [0, 'c'], noCarga = pz[1]==='x', kg0 = it.propio!==undefined ? '' : pz[0];
      const u = unidadDe(st.cant || it.auto), u1 = UNI1[u] || u.replace(/s$/, ''), x = porId[it.id], n = pm ? pm.n : 1;
      const total = x ? x.q*x.kg : 0, num0 = String(it.auto).replace(/[^\d.,+].*$/, '').trim() || it.auto;
      // individual: se escribe y se calcula por hombre; de grupo: total de la unidad repartido; agua: ya es por hombre
      const indiv = x && x.modo==='i', fq = v=>f(v, v%1 ? 1 : 0);
      const pesoTxt = noCarga ? '<span class="mf-nc">no se carga</span>' : x ? `<b>${f(x.porHombre, x.porHombre<1 ? 2 : 1)} kg</b><small>por hombre</small>` : '';
      return `<div class="mf${st.ok ? ' hecho' : ''}">
        <label class="mf1"><input type="checkbox" data-mt="${it.id}" ${st.ok ? 'checked' : ''}><span class="mf-n"><b>${esc(it.n)}</b>${it.nota ? `<small>${esc(it.nota)}</small>` : ''}</span><span class="mf-kg">${pesoTxt}</span></label>
        <div class="mf2">${indiv ? `<span class="mf-c"><input class="num" data-mch="${it.id}" value="${esc(st.cantH!==undefined && st.cantH!=='' ? st.cantH : st.cant ? fq(numCant(st.cant)/n) : '')}" placeholder="${fq(numCant(num0)/n)}" inputmode="decimal" aria-label="Cantidad por hombre"><em>${esc(u==='u' ? 'unid.' : u)} por hombre</em></span>`
          : `<span class="mf-c"><input class="num" data-mc="${it.id}" value="${esc(st.cant || '')}" placeholder="${esc(num0)}" inputmode="decimal" aria-label="Cantidad"><em>${esc(u==='u' ? 'unid.' : u)}${x && x.modo==='c' ? ' para la unidad' : ''}</em></span>`}
          ${noCarga ? '' : `<span class="mf-x">×</span><span class="mf-c"><input class="num" data-mk="${it.id}" value="${esc(st.kg || '')}" placeholder="${String(kg0).replace(".", ",")}" inputmode="decimal" aria-label="kg por ${esc(u1)}"><em>${u1==='unidad' ? 'kg c/u' : 'kg/' + esc(u1)}</em></span>
          <span class="mf-x">=</span><span class="mf-t">${indiv ? f(x.porHombre, x.porHombre<10 ? 1 : 0) + ' kg <small>por hombre</small>' : f(total, total<10 ? 1 : 0) + ' kg' + (x && x.modo==='c' && n>1 ? ' <small>en total</small>' : '')}</span>
          <select data-ml="${it.id}" aria-label="Línea">${[1, 2, 3, 4].map(l=>`<option value="${l}"${lineaDe(m, it.id)===l ? ' selected' : ''}>${l===4 ? '4.ª (vehículo)' : l + '.ª línea'}</option>`).join('')}</select>`}
          ${it.propio!==undefined ? `<button class="btn mini peligro" data-mx="${it.propio}" aria-label="Quitar">✕</button>` : ''}</div>
        ${x && x.modo==='h' ? '<div class="mf-s">litros al partir (1 kg por litro + envase); se bebe en el camino' + (m.par.reabast==='si' ? ' y se repone en los puntos de agua' : '') + '</div>' : x && x.modo==='c' && n>1 ? `<div class="mf-s">de grupo: ${f(total, 1)} kg repartidos entre ${n} hombres = ${f(x.porHombre, 2)} kg por hombre</div>`
          : indiv && n>1 ? `<div class="mf-s">en la unidad: ${fq(x.q)} ${esc(u==='u' ? 'unid.' : u)} · ${f(total, 1)} kg (${n} hombres)</div>` : ''}</div>`; }).join('')}</div>`).join('');
  }
  // carga por hombre: peso base + material individual + parte del colectivo; con la opción de usarla en el cálculo de tiempos
  function cargaHtml(m, R){
    const pm = R.carga || pesoMaterial(m, R); if(!pm) return '';
    const top = pm.items.filter(x=>x.porHombre>0).slice(0, 5).map(x=>esc(x.n) + ' ' + f(x.porHombre, 1) + ' kg').join(' · ');
    const L = LIMITES_CARGA, ref = (v, lim)=>`<div class="s" style="color:var(--${v>lim ? 'rojo' : 'verde'})">${v>lim ? 'sobre' : 'bajo'} la referencia de ${lim} kg</div>`;
    return `<div class="tarjeta carga"><h3>Carga por hombre</h3>
      <div class="kpis">
        <div class="kpi ocre"><div class="k">Total por hombre al partir</div><div class="v">${f(pm.total, 1)} <small>kg</small></div><div class="s">${pm.sinMochila ? 'sin mochila (se deja la 3.ª línea)' : 'con mochila'}${pm.final!==undefined && Math.abs(pm.final - pm.total)>0.05 ? ' · al llegar ' + f(pm.final, 1) + ' kg' : ''}</div></div>
        ${[1, 2, 3].map(l=>`<div class="kpi"${l===3 && pm.sinMochila ? ' style="opacity:.5"' : ''}><div class="k">${LINEAS[l]}</div><div class="v">${f(pm.lineas[l], 1)} <small>kg</small></div><div class="s">${esc(LINEAS_TXT[l])}${l===3 && pm.sinMochila ? ' · <b>se deja</b>' : ''}</div></div>`).join('')}</div>
      ${Uso.civil() ? (()=>{ const pc = +String(m.par.pesoCorp || '').replace(',', '.') || 0, pct = pc ? pm.total/pc*100 : null;
        return `<div class="kpis"><div class="kpi"><div class="k">Porcentaje de tu peso</div><div class="v">${pct===null ? '—' : f(pct, 0) + ' <small>%</small>'}</div>
          <div class="s" style="color:var(--${pct===null ? 'tenue' : pct>25 ? 'rojo' : pct>20 ? 'ocre' : 'verde'})">${pct===null ? 'escribe tu peso corporal' : pct>25 ? 'sobre el 25 %: demasiado pesado' : pct>20 ? 'entre 20 y 25 %: pesado' : 'hasta 20 %: recomendable'}</div></div>
          <div class="kpi"><div class="k">Peso corporal (kg)</div><div class="v"><input class="num" id="mtPeso" inputmode="decimal" value="${esc(m.par.pesoCorp || '')}" placeholder="ej. 70" style="width:90px"></div><div class="s">promedio del grupo</div></div></div>
        <p class="nota">Referencia habitual en montaña: la mochila no debería pasar del <b>20 %</b> del peso de quien la lleva (hasta un 25 % en travesías de varios días). Es solo una referencia.</p>`; })() : `<div class="kpis">
        <div class="kpi"><div class="k">Carga de combate (1.ª + 2.ª)</div><div class="v">${f(pm.combate, 1)} <small>kg</small></div>${ref(pm.combate, L.combate)}</div>
        <div class="kpi"><div class="k">Carga de marcha (1.ª + 2.ª + 3.ª)</div><div class="v">${f(pm.marcha, 1)} <small>kg</small></div>${pm.marcha>L.marcha + 21 ? '<div class="s" style="color:var(--rojo)">carga de emergencia: marcha lenta, evitar el contacto</div>' : ref(pm.marcha, L.marcha)}</div></div>
      <p class="nota">Límites <b>referenciales</b> (manual de marchas a pie de EE.UU.): carga de combate hasta unos ${L.combate} kg; carga de marcha de aproximación hasta unos ${L.marcha} kg.
        ${pm.lineas[4] ? `4.ª línea (vehículo o apoyo): ${f(pm.lineas[4], 1)} kg por hombre, <b>no se suma</b>.` : '4.ª línea: lo que va en vehículos o con el apoyo logístico; no la carga el hombre (elige «4.ª» en un elemento para dejarlo ahí).'}</p>`}
      <div class="campos">
        <label class="c ancho"><span><input type="checkbox" id="mtPern" ${m.par.pernocta ? 'checked' : ''} style="width:auto;vertical-align:middle"> <b>Con pernocta</b> (saco, aislante, carpa, cocinilla, olla y aseo)</span></label>
        ${Uso.civil() ? '' : `<label class="c ancho"><span><input type="checkbox" id="mtMochila" ${m.par.sinMochila ? 'checked' : ''} style="width:auto;vertical-align:middle"> <b>Se deja la mochila</b> (la marcha se hace solo con la 1.ª y 2.ª línea; p. ej. carrera de combate o asalto)</span></label>`}
        <label class="c">Reabastecimiento de agua en ruta<select id="mtReab"><option value="no"${m.par.reabast!=='si' ? ' selected' : ''}>No: se carga toda el agua</option><option value="si"${m.par.reabast==='si' ? ' selected' : ''}>Sí, en puntos de agua</option></select></label>
        <label class="c">Ración de combate<select id="mtRac"><option value="24"${m.par.racion!=='12' ? ' selected' : ''}>De 24 horas</option><option value="12"${m.par.racion==='12' ? ' selected' : ''}>De 12 horas</option></select></label>
        <label class="c">Otro peso por hombre (kg)<input class="num" id="mtBase" inputmode="decimal" value="${esc(m.par.cargaBase || '')}" placeholder="no listado"></label></div>
      <p class="nota">Esta carga se usa en toda la marcha: tiempos de cada tramo, calor y descansos. ${m.par.cargaManual ? '<b style="color:var(--ocre)">Ahora la carga está escrita a mano (Datos → Cálculo de tiempos).</b>' : ''}
        ${Uso.civil() ? 'Lo que sirve a todo el grupo (radio, botiquín grande, cuerda, carpas) va en «Equipo especial de la unidad» y se reparte.' : 'El fusil, la munición, el casco y los chalecos están en la lista (Armamento y protección); el equipo que sirve a toda la unidad, en «Equipo especial de la unidad».'} Usa «Otro peso» solo para lo que no esté en la lista${!Uso.civil() && +String(m.par.cargaBase || '').replace(',', '.')>0 ? ` — <b style="color:var(--ocre)">si ahí habías escrito el fusil, casco y chaleco, bórralo para no contarlos dos veces</b>` : ''}.
        Material de grupo repartido: ${f(pm.colect, 1)} kg por hombre, entre ${pm.hay ? pm.n + ' hombres' : '1 hombre: indica el efectivo en Datos → Unidad y columna'}. Más pesado por hombre: ${top || '—'}.
        Los pesos son <b>sugeridos</b>: cámbialos en «kg» de cada elemento. El agua de reabastecimiento en ruta no se suma.</p></div>`;
  }
  function vMaterial(){
    const m = actual(), R = M.calcular(m);
    if(!R.tramos.length){ vista.innerHTML = '<div class="tarjeta vacio">Completa la ruta para calcular el material.</div>'; return; }
    const H = htmlMaterial(m, R), tot = H.filas.reduce((a, g)=>a + g.its.length, 0), hechos = ()=>H.filas.reduce((a, g)=>a + g.its.filter(it=>(m.material||{})[it.id] && m.material[it.id].ok).length, 0);
    vista.innerHTML = `<h2>Material para la marcha</h2>
      <p class="nota" id="mtCuenta"></p>
      <div class="info">Calculado para <b>${H.c.hay ? H.c.n + ' hombres' : '1 hombre (indica el efectivo en Datos → Unidad y columna)'}</b>, ${M.verDur(H.c.horas)} de marcha y ${f(H.c.km, 1)} km${H.c.noche ? ', con ' + Math.round(H.c.noche*100) + ' % de noche' : ''}.
        El agua sale de la tabla de calor (${H.c.calorDato ? 'con el índice WBGT indicado' : 'sin índice WBGT: se usa calor bajo'}); las demás cantidades son <b>sugerencias</b>: escribe la tuya si la orden dice otra cosa.
        Aparecen solo los elementos que corresponden (noche, montaña, nieve, calor).</div>
      ${cargaHtml(m, R)}
      <div class="tarjeta">${H.html}</div>
      <div class="tarjeta"><div class="campos"><label class="c ancho">Agregar otro elemento<input id="mtNuevo" placeholder="Ej: pala de campaña"></label><label class="c">Cantidad<input id="mtNuevoC" placeholder="Ej: 4"></label><label class="c">kg c/u<input id="mtNuevoK" placeholder="Ej: 1,2" inputmode="decimal"></label></div>
        <div class="btns"><button class="btn" id="mtAgregar">＋ Agregar</button><button class="btn" id="mtLimpia">Desmarcar todo</button><button class="btn pri" id="mtDoc">📄 Documento con el material</button></div></div>`;
    const cuenta = ()=>$('#mtCuenta').innerHTML = `<b>${hechos()} de ${tot}</b> listos.`; cuenta();
    const Mt = ()=>m.material || (m.material = {});
    vista.querySelectorAll('[data-mt]').forEach(x=>x.onchange = ()=>{ const o = Mt()[x.dataset.mt] || (Mt()[x.dataset.mt] = {}); o.ok = x.checked; x.closest('tr,.mf').classList.toggle('hecho', x.checked); guardar(); cuenta(); });
    let tC = null; const recarga = ()=>{ clearTimeout(tC); tC = setTimeout(()=>{ const y = window.scrollY, a = document.activeElement && document.activeElement.dataset; const foco = a && (a.mch ? '[data-mch="' + a.mch + '"]' : a.mc ? '[data-mc="' + a.mc + '"]' : a.mk ? '[data-mk="' + a.mk + '"]' : document.activeElement.id ? '#' + document.activeElement.id : null);
      pintar(); window.scrollTo(0, y); if(foco){ const e = vista.querySelector(foco); if(e){ e.focus(); const v = e.value; e.value = ''; e.value = v; } } }, 700); };
    vista.querySelectorAll('[data-mch]').forEach(x=>x.oninput = ()=>{ const o = Mt()[x.dataset.mch] || (Mt()[x.dataset.mch] = {}); o.cantH = x.value; delete o.cant; guardar(); recarga(); });
    vista.querySelectorAll('[data-mc]').forEach(x=>x.oninput = ()=>{ const o = Mt()[x.dataset.mc] || (Mt()[x.dataset.mc] = {}); o.cant = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-ml]').forEach(x=>x.onchange = ()=>{ const o = Mt()[x.dataset.ml] || (Mt()[x.dataset.ml] = {}); o.linea = +x.value; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    vista.querySelectorAll('[data-mk]').forEach(x=>x.oninput = ()=>{ const o = Mt()[x.dataset.mk] || (Mt()[x.dataset.mk] = {}); o.kg = x.value; guardar(); recarga(); });
    const b = $('#mtBase'); if(b) b.oninput = ()=>{ m.par.cargaBase = b.value; guardar(); recarga(); };
    const mo = $('#mtMochila'); if(mo) mo.onchange = ()=>{ m.par.sinMochila = mo.checked; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    const pe = $('#mtPern'); if(pe) pe.onchange = ()=>{ m.par.pernocta = pe.checked; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    const pw = $('#mtPeso'); if(pw) pw.oninput = ()=>{ m.par.pesoCorp = pw.value; guardar(); recarga(); };
    const re = $('#mtReab'); if(re) re.onchange = ()=>{ m.par.reabast = re.value; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); if(re.value==='si') aviso('Marca los puntos de agua en la pestaña Datos'); };
    const ra = $('#mtRac'); if(ra) ra.onchange = ()=>{ m.par.racion = ra.value; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    vista.querySelectorAll('[data-mx]').forEach(x=>x.onclick = ()=>{ m.materialExtra.splice(+x.dataset.mx, 1); delete Mt()['x' + x.dataset.mx]; guardar(); pintar(); });
    $('#mtAgregar').onclick = ()=>{ const n = $('#mtNuevo').value.trim(); if(!n) return; (m.materialExtra || (m.materialExtra = [])).push({n, cant:$('#mtNuevoC').value.trim()});
      const k = $('#mtNuevoK').value.trim(); if(k){ const Mx = Mt(); Mx['x' + (m.materialExtra.length - 1)] = {kg:k}; } guardar(); pintar(); };
    $('#mtLimpia').onclick = ()=>{ Object.values(Mt()).forEach(o=>o.ok = false); guardar(); pintar(); };
    $('#mtDoc').onclick = ()=>documento('material');
  }

  /* =====================================================================  LISTA  */
  function vLista(){
    const LS = Uso.civil() ? Uso.LISTA : LISTA, ids = new Set(LS.flatMap(g=>g.items.map(x=>x[0])));
    const m = actual(), L = m.lista || (m.lista = {}), tot = LS.reduce((a, g)=>a + g.items.length, 0), hechos = ()=>Object.entries(L).filter(([k, v])=>v && ids.has(k)).length;
    vista.innerHTML = `<h2>Lista de verificación</h2><p class="nota" id="lCuenta"></p>` + LS.map(g=>`<h2>${esc(g.fase)}</h2><div class="tarjeta lista">` +
      g.items.map(([id, t, fuente])=>`<label class="item"><input type="checkbox" data-l="${id}" ${L[id] ? 'checked' : ''}><span>${esc(t)}${fuente ? ` <small>${esc(fuente)}</small>` : ''}</span></label>`).join('') + '</div>').join('') +
      `<div class="btns no-imp"><button class="btn" id="bLimpia">Desmarcar todo</button><button class="btn" id="bImp">📄 Documento con la lista</button></div>`;
    const cuenta = ()=>$('#lCuenta').innerHTML = `<b>${hechos()} de ${tot}</b> listos.`;
    cuenta();
    vista.querySelectorAll('[data-l]').forEach(c=>c.onchange = ()=>{ L[c.dataset.l] = c.checked; guardar(); cuenta(); });
    $('#bLimpia').onclick = ()=>{ m.lista = {}; guardar(); pintar(); };
    $('#bImp').onclick = ()=>documento('lista');
  }

  /* =====================================================================  ENVIAR  */
  function vEnviar(){
    const m = actual(), R = M.calcular(m);
    if(!R.tramos.length){ vista.innerHTML = `<div class="tarjeta vacio">Completa la ruta antes de enviarla.<div class="btns" style="justify-content:center"><button class="btn pri" id="bR">Ir a la ruta</button></div></div>`; return $('#bR').onclick = ()=>ir('ruta'); }
    const msg = BDC.mensajePlan(m, R), cod = msg.split('\n')[1];
    if(Uso.civil()) return enviarCivil(m, R, cod);
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
        <button class="btn" id="bImp"><b>📄 Documento / orden gráfica</b><small>Militar o civil: mapa, perfil, cuadro, matriz, luz… para imprimir o PDF</small></button>
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
    $('#bImp').onclick = ()=>documento();
  }

  // uso civil: plan de ruta en texto simple para el contacto de emergencia (lo que se recomienda dejar antes de salir)
  function planCivil(m, R){
    const r = R.res, fecha = m.fecha ? m.fecha.split('-').reverse().join('-') : '', n = +m.par.efectivo || 0;
    const limite = m.par.horaAviso || M.verHora((r.termino===null ? 0 : r.termino) + 1).slice(0, 5);
    const ev = R.eventos.map(i=>{ const p = R.puntos[i], t = R.tramos.find(x=>x.iB===i), h = t ? t.llegada : r.partida;
      return '• ' + Uso.cambiar(p.nombre) + (p.obs ? ' (' + p.obs + ')' : '') + ' — ' + M.verHora(h) + ' — ' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5); });
    return ['PLAN DE RUTA — ' + m.nombre, (m.unidad ? 'Grupo: ' + m.unidad : 'Grupo') + (n ? ' · ' + n + ' persona' + (n===1 ? '' : 's') : ''),
      'Fecha: ' + fecha + ' · salida ' + M.verHora(r.partida) + ' · llegada estimada ' + M.verHora(r.termino),
      'Distancia ' + km(r.dist) + ' km · subida +' + f(r.sube) + ' m · bajada −' + f(r.baja) + ' m · duración ' + M.verDur(r.total),
      'Ruta y horas estimadas:', ...ev,
      'Punto de partida en el mapa: https://maps.google.com/?q=' + R.puntos[R.eventos[0]].lat.toFixed(5) + ',' + R.puntos[R.eventos[0]].lon.toFixed(5),
      (m.par.contacto ? 'Contacto del grupo: ' + m.par.contacto + '\n' : '') + 'SI NO HAY NOTICIAS A LAS ' + limite + ', llamar a emergencias: 133 Carabineros · 136 Socorro Andino · 131 SAMU.'].join('\n');
  }
  function enviarCivil(m, R, cod){
    const r = R.res, lim0 = M.verHora((r.termino===null ? 0 : r.termino) + 1).slice(0, 5);
    vista.innerHTML = `<h2>Plan de ruta para tu contacto de emergencia</h2>
      <div class="tarjeta">
        <p class="nota">Antes de salir, deja este plan a alguien que <b>no</b> va en la ruta: dónde van, quiénes, a qué hora vuelven y a qué hora debe dar aviso si no tiene noticias.</p>
        <div class="campos"><label class="c">Si no hay noticias a las<input type="time" id="cvLim" value="${esc(m.par.horaAviso || lim0)}"></label>
          <label class="c">Teléfono del grupo<input id="cvTel" value="${esc(m.par.contacto || '')}" placeholder="opcional" inputmode="tel"></label></div>
        <div class="mensaje" id="msg">${esc(planCivil(m, R))}</div>
        <div class="btns"><button class="btn pri" id="bCop">📋 Copiar</button>${navigator.share ? '<button class="btn" id="bComp">↗ Compartir (WhatsApp, correo…)</button>' : ''}</div>
      </div>
      <h2>Archivos</h2>
      <div class="formatos">
        <button class="btn" data-arch="gpx"><b>GPX</b><small>GPS de mano, Garmin, Wikiloc y apps de montaña</small></button>
        <button class="btn" data-arch="kml"><b>KML</b><small>Google Earth y Google Maps</small></button>
        <button class="btn" data-arch="geojson"><b>GeoJSON</b><small>Sistemas de mapas (QGIS, ArcGIS)</small></button>
        <button class="btn" data-arch="csv"><b>Excel (CSV)</b><small>Cuadro de la ruta</small></button>
        <button class="btn" data-arch="json"><b>Marcha (JSON)</b><small>Para abrirla en otro equipo con esta app</small></button>
        <button class="btn" id="bImp"><b>📄 Documento / plan de ruta</b><small>Mapa, perfil, cuadro, luz… para imprimir o PDF</small></button>
      </div>
      <details class="tarjeta"><summary>Pasar la ruta a otro teléfono con Burros de Combate</summary>
        <p class="nota">Código o QR que se abre con «Recibir plan» en la pestaña Marchas.</p>
        <div class="btns"><button class="btn" id="bCod">📋 Copiar código</button><button class="btn" id="bQr">▦ Mostrar QR</button></div><div id="qr"></div></details>`;
    const msg = ()=>$('#msg').textContent;
    $('#cvLim').onchange = e=>{ m.par.horaAviso = e.target.value; guardar(); $('#msg').textContent = planCivil(m, R); };
    $('#cvTel').oninput = e=>{ m.par.contacto = e.target.value; guardar(); $('#msg').textContent = planCivil(m, R); };
    $('#bCop').onclick = ()=>copiar(msg());
    if($('#bComp')) $('#bComp').onclick = ()=>navigator.share({title:'Plan de ruta — ' + m.nombre, text:msg()}).catch(()=>{});
    $('#bCod').onclick = ()=>copiar(cod);
    $('#bQr').onclick = ()=>{
      try { const q = qrcode(0, 'L'); q.addData(cod, 'Byte'); q.make(); $('#qr').innerHTML = `<div class="qr">${q.createSvgTag({cellSize:4, margin:2, scalable:true})}</div>`; }
      catch(e){ $('#qr').innerHTML = '<div class="alerta">La ruta es demasiado larga para un QR: usa el código o un archivo.</div>'; } };
    vista.querySelectorAll('[data-arch]').forEach(b=>b.onclick = ()=>{ const k = b.dataset.arch;
      if(k==='gpx') descargar(nombreArchivo(m, 'gpx'), BDC.gpx(m, R), 'application/gpx+xml');
      if(k==='kml') descargar(nombreArchivo(m, 'kml'), BDC.kml(m, R), 'application/vnd.google-earth.kml+xml');
      if(k==='geojson') descargar(nombreArchivo(m, 'geojson'), BDC.geojson(m, R), 'application/geo+json');
      if(k==='csv') descargar(nombreArchivo(m, 'csv'), BDC.csv(m, R), 'text/csv;charset=utf-8');
      if(k==='json') descargar(nombreArchivo(m, 'json'), JSON.stringify({app:'burros', v:1, marchas:[m]}, null, 1), 'application/json'); });
    $('#bImp').onclick = ()=>documento();
  }

  /* ---------- inicio ---------- */
  pintar();
  // actualización automática: se busca una versión nueva al abrir y al volver a la app; si la hay, se ofrece recargar
  if('serviceWorker' in navigator && location.protocol!=='file:'){
    const habia = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).then(reg=>{
      const buscar = ()=>reg.update().catch(()=>{});
      document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) buscar(); }); setInterval(buscar, 5*60000);
    }).catch(()=>{});
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(!habia) return;
      const b = document.createElement('button'); b.className = 'nueva-version'; b.textContent = '⟳ Hay una versión nueva — tocar para actualizar';
      b.onclick = ()=>location.reload(); document.body.appendChild(b); });
  }
})();
