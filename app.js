/* BURROS DE COMBATE — pantallas: Marchas, Ruta (datos, parámetros y puntos), Cuadro (cuadro de marcha y navegación),
   Perfil (ficha de itinerario) y Enviar (C2 TOQUI, QR, archivos). Todo se guarda en este equipo (localStorage «burros_datos»). */
(function(){
  const VERSION = '0.99.23', M = MARCHA, $ = s=>document.querySelector(s), vista = $('#vista'), CLAVE = 'burros_datos';
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
  // un recorrido grabado (el último o uno guardado) → marcha nueva con su forma y los puntos de control a los que se llegó (v0.99.14)
  function rutaDeRecorrido(m, ej){
    const pts = Seguir.puntosDeRecorrido(m, ej); if(pts.length<2) return aviso('El recorrido no tiene suficientes puntos GPS');
    const d = new Date(ej.inicio || Date.now()), fe = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
    confirmar(`¿Crear una ruta nueva con el recorrido del ${fe}? Quedan ${pts.length} puntos (${pts.filter(p=>p.ev).length} de control); las cotas se buscan en el terreno. La marcha original no cambia.`, async()=>{
      const n = nueva({nombre:(m.nombre || 'Marcha') + ' — recorrido ' + fe, unidad:m.unidad || '', datum:'WGS84', zona:m.zona || '', par:JSON.parse(JSON.stringify(m.par || {})),
        puntos:pts.map(p=>punto(p.nombre, p))});
      ir('mapa'); aviso('✔ Ruta nueva creada: buscando las cotas…');
      const n2 = await completarCotas(n); if(S.actual===n.id) pintar();
      aviso(n2 ? '✔ Ruta nueva con ' + n2 + ' cotas del terreno (revísalas con la carta)' : '⚠ Sin conexión: completa las cotas en Datos (⛰ Completar cotas)'); });
  }
  async function completarCotas(m){
    const R = M.calcular(m), faltan = m.puntos.map((x, i)=>i).filter(i=>(m.puntos[i].cota==='' || m.puntos[i].cotaAuto) && R.puntos[i].lat!==null && R.puntos[i].lat!==undefined && !isNaN(R.puntos[i].lat));
    let n = 0; for(const i of faltan){ const r = await DEM.cotaPunto(R.puntos[i].lat, R.puntos[i].lon); if(r){ Object.assign(m.puntos[i], {cota:Math.round(r.v), cotaAuto:true, cotaSrc:r.src}); n++; } }
    guardar(); return n;
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
  // alto libre para la carta (Mapa y Seguir): la ventana menos la cabecera y las pestañas de abajo (si van abajo); se mide al girar el teléfono
  function medirAlto(){ const h = document.querySelector('.barra-sup'), t = document.getElementById('pestanas'); if(!h || !t) return;
    const abajo = getComputedStyle(t).position==='fixed' ? t.offsetHeight : 0; document.documentElement.style.setProperty('--alto-libre', Math.max(200, window.innerHeight - h.offsetHeight - abajo) + 'px'); }
  addEventListener('resize', ()=>{ medirAlto(); setTimeout(medirAlto, 300); }); addEventListener('orientationchange', ()=>setTimeout(medirAlto, 400)); setTimeout(medirAlto, 0);
  function ir(v){ S.v = v; guardar(); pintar(); window.scrollTo(0, 0); }
  /* guía de la marcha y ayuda (v0.99.20): datos para el semáforo, ir al paso (y a su sección) y «¿Qué hago aquí?» */
  function ctxGuia(m){
    const R = M.calcular(m), LS = Uso.civil() ? Uso.LISTA : LISTA, g = LS[0], L = m.lista || {};
    const ok = R.puntos.filter(p=>p.ok), zonaOk = ok.length>0 && Zonas.lista().some(z=>z.caja && ok.every(p=>p.lat>=z.caja[0] && p.lat<=z.caja[2] && p.lon>=z.caja[1] && p.lon<=z.caja[3]));
    return {R, civil:Uso.civil(), lista:{t:g.items.length, h:g.items.filter(x=>L[x[0]]).length}, zonaOk};
  }
  function irA(d){
    if(!d) return; ir(d.v);
    if(d.zonas) return setTimeout(()=>{ const b = $('#mZonas'); if(b) b.click(); }, 400);
    if(d.sec) setTimeout(()=>{ const el = [...vista.querySelectorAll('summary, .btn')].find(x=>x.textContent.includes(d.sec)); if(!el) return;
      const det = el.closest('details'); if(det) det.open = true; el.scrollIntoView({block:'center'}); el.classList.add('resalta'); setTimeout(()=>el.classList.remove('resalta'), 2500); }, 150);
  }
  // ejemplo guiado (v0.99.21): franja arriba con el paso, ‹ Anterior · Salir · Siguiente ›; se apaga si se abre otra marcha
  let tour = null; try { tour = JSON.parse(localStorage.getItem('burros_tour') || 'null'); } catch(e){}
  const tourGuardar = ()=>{ try { localStorage.setItem('burros_tour', tour ? JSON.stringify(tour) : ''); } catch(e){} };
  function tourIniciar(){ let e = S.marchas.find(x=>/\(EJEMPLO\)/.test(x.nombre)); if(!e) e = ejemplo(); S.actual = e.id; tour = {id:e.id, k:0}; tourGuardar(); tourIr(); }
  function tourIr(){ const st = Guia.TOUR[tour.k]; irA({v:st.v, sec:st.sec}); }
  const tourArriba = ()=>{ const b = $('#tourBar'), h = document.querySelector('.barra-sup'); if(b && h) b.style.top = Math.max(0, h.getBoundingClientRect().bottom) + 'px'; };
  addEventListener('scroll', tourArriba, {passive:true}); addEventListener('resize', tourArriba);
  function tourBarra(){
    let b = $('#tourBar'); const on = !!(tour && S.actual===tour.id && S.marchas.some(x=>x.id===tour.id));
    if(tour && !on){ tour = null; tourGuardar(); }
    if(!on){ if(b) b.remove(); return; }
    if(!b){ b = document.createElement('div'); b.id = 'tourBar'; document.body.appendChild(b); }
    const T = Guia.TOUR, st = T[tour.k], ult = tour.k===T.length - 1;
    b.innerHTML = `<div class="tb-t"><b>Ejemplo guiado · paso ${tour.k + 1} de ${T.length} · ${esc(st.n)}</b><span>${esc(st.t)}</span></div>
      <div class="tb-b"><button data-tb="ant"${tour.k ? '' : ' disabled'}>‹ Anterior</button><button data-tb="sal">Salir del ejemplo</button><button data-tb="sig">${ult ? 'Terminar ✓' : 'Siguiente ›'}</button></div>`;
    tourArriba();
    if(S.v!=='mapa' && S.v!=='seguir') vista.insertAdjacentHTML('afterbegin', `<div class="tour-esp" style="height:${b.offsetHeight + 6}px"></div>`);
    b.querySelectorAll('[data-tb]').forEach(x=>x.onclick = ()=>{ const k = x.dataset.tb;
      if(k==='sal' || (k==='sig' && ult)){ tour = null; tourGuardar(); ir('marchas'); return aviso(k==='sal' ? 'Saliste del ejemplo guiado' : '✔ Terminaste el ejemplo guiado: crea tu marcha con «＋ Nueva marcha»'); }
      tour.k += k==='sig' ? 1 : -1; tourGuardar(); tourIr(); });
  }
  function abrirEjemplo(v){ let e = S.marchas.find(x=>/\(EJEMPLO\)/.test(x.nombre)); if(!e) e = ejemplo(); S.actual = e.id; guardar(); ir(v); aviso('Abriste la marcha de ejemplo; vuelve a la tuya en Marchas'); }
  function enlazarAyuda(cont, v, enDialogo){
    cont.querySelectorAll('[data-ay]').forEach(b=>b.onclick = ()=>{ const k = b.dataset.ay;
      if(enDialogo) cerrarDialogo(); else { Guia.marcarVisto(v); const c = $('#ayudaC'); if(c) c.remove(); }
      if(k==='no'){ Guia.poner(false); aviso('Modo ayuda apagado: el botón ? de arriba sigue explicando cada pantalla'); }
      if(k==='ej') abrirEjemplo(v); }); }
  $('#bAyuda').onclick = ()=>{ const v = PESTANA[S.v] && Guia.AYUDA[S.v] ? S.v : S.v; if(!Guia.AYUDA[v]) return aviso('Sin ayuda para esta pantalla');
    dialogo(Guia.tarjeta(v, true), d=>enlazarAyuda(d, v, true)); };
  $('#pestanas').addEventListener('click', e=>{ const b = e.target.closest('button[data-v]'); if(b) ir(b.dataset.v); });
  // Perfil y Lista van dentro de la pestaña Cuadro
  // Perfil y Lista van dentro de Cuadro; Material va dentro de Datos de la marcha (pedido del usuario)
  const PESTANA = {perfil:'cuadro', lista:'cuadro', resultado:'cuadro', matriz:'cuadro', material:'ruta'};
  const subDatos = ()=>`<div class="seg subv no-imp">${[['ruta', 'Ruta y cálculo'], ['material', 'Material y carga']].map(([k, n])=>`<button data-sv="${k}" class="${S.v===k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const subCuadro = ()=>`<div class="seg subv no-imp">${[['cuadro', 'Cuadro de marcha y navegación'], ['perfil', 'Perfil'], ['matriz', 'Matriz'], ['lista', 'Lista'], ['resultado', 'Resultado']].map(([k, n])=>`<button data-sv="${k}" class="${S.v===k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  vista.addEventListener('click', e=>{ const b = e.target.closest('[data-sv]'); if(b) ir(b.dataset.sv); });
  function pintar(){
    const m = actual(); if(!m && S.v!=='marchas' && S.v!=='seguir') S.v = 'marchas';
    if(S.v==='ficha') S.v = 'cuadro';   // la ficha de navegación ahora está dentro del cuadro
    if(!({marchas:1, mapa:1, ruta:1, cuadro:1, perfil:1, lista:1, resultado:1, matriz:1, material:1, luz:1, seguir:1, enviar:1})[S.v]) S.v = 'marchas';
    if(S.v!=='mapa') Mapa.cerrar();
    if(S.v!=='seguir') Seguir.cerrar();
    document.body.classList.toggle('con-mapa', S.v==='mapa');
    document.querySelectorAll('#pestanas button').forEach(b=>{ b.classList.toggle('on', b.dataset.v===(PESTANA[S.v] || S.v)); b.disabled = !m && b.dataset.v!=='marchas' && b.dataset.v!=='seguir'; b.style.opacity = b.disabled ? .35 : 1; });
    $('#subtitulo').textContent = m ? m.nombre + (m.unidad ? ' · ' + m.unidad : '') : 'Planificación de marchas';
    ({marchas:vMarchas, mapa:vMapa, ruta:vRuta, cuadro:vCuadro, perfil:vPerfil, material:vMaterial, luz:vLuz, lista:vLista, resultado:vResultado, matriz:vMatriz, seguir:vSeguir, enviar:vEnviar})[S.v]();
    if(S.v==='ruta' || S.v==='material') vista.insertAdjacentHTML('afterbegin', subDatos());
    else if(PESTANA[S.v] || S.v==='cuadro') vista.insertAdjacentHTML('afterbegin', subCuadro());
    // modo ayuda: la primera vez en cada pantalla, qué se hace aquí (no en el Mapa ni en Seguir, que son a pantalla completa: ahí el botón ?)
    if(Guia.encendida() && !tour && !Guia.vistos()[S.v] && Guia.AYUDA[S.v] && S.v!=='mapa' && S.v!=='seguir'){
      const sub = vista.querySelector('.subv'); if(sub) sub.insertAdjacentHTML('afterend', Guia.tarjeta(S.v)); else vista.insertAdjacentHTML('afterbegin', Guia.tarjeta(S.v));
      enlazarAyuda(vista, S.v, false); }
    tourBarra();
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
        <span class="flecha">${m.id===S.actual ? `<button class="btn mini" data-cierra="${m.id}" title="Deja la marcha guardada, sin seleccionar">Cerrar</button> ` : ''}<button class="btn mini" data-dup="${m.id}">Duplicar</button> <button class="btn mini peligro" data-borra="${m.id}">Borrar</button></span></div>`;
    }).join('');
    const mA = actual(), G = mA ? Guia.html(mA, ctxGuia(mA)) : null;
    // inicio más claro (v0.99.21, etapa 2): la primera vez, tres caminos; con marchas, la guía resumida, la lista y lo demás en «Más»
    const primera = !S.marchas.length, masAb = primera || (()=>{ try { return localStorage.getItem('burros_mas')==='1'; } catch(e){ return false; } })();
    const guiaAb = (()=>{ try { return localStorage.getItem('burros_guia')==='1'; } catch(e){ return false; } })();
    const usoSeg = `<div class="seg seg-uso"><button data-uso="militar" class="${Uso.civil() ? '' : 'on'}">🪖 Militar</button><button data-uso="civil" class="${Uso.civil() ? 'on' : ''}">🥾 Civil</button></div>`;
    const mas = `<details class="tarjeta mas" id="mMas"${masAb ? ' open' : ''}><summary>Más</summary>
        <div class="btns"><button class="btn" id="bImportar">⤓ Importar archivo (JSON, GPX o KML)</button><button class="btn" id="bRecibir">📨 Recibir plan (código o QR)</button>
          <button class="btn" id="bEjemplo">Ver ejemplo (sin guía)</button>${primera ? '' : '<button class="btn" id="bTour2">▶ Ver ejemplo guiado</button>'}</div>
        <h3>Respaldo</h3><p class="nota">Las marchas quedan guardadas solo en este equipo. Guarda un respaldo para pasarlas a otro equipo o no perderlas.</p>
        <div class="btns"><button class="btn" id="bResp">⬇ Guardar respaldo</button><button class="btn" id="bCargar">⬆ Cargar respaldo</button></div>
        <h3>Paquete para terreno</h3><p class="nota">Arma un solo archivo con las marchas, las <b>cartas ya calzadas</b> y las <b>zonas de mapa sin señal</b>, y pásalo a la unidad por AirDrop, Quick Share, Bluetooth o cable, <b>sin internet</b>. Cada teléfono lo carga y queda listo.</p>
        <div class="btns"><button class="btn" id="bPaq">📦 Armar o cargar un paquete</button></div>
        <h3>Uso de la app</h3>${primera ? '' : usoSeg}<p class="nota">${Uso.civil() ? 'Montañismo, trekking, scouts, guías y rescate: sin armamento ni términos militares; plan de ruta para tu contacto de emergencia.' : 'Marchas militares: líneas de carga, nombres clave, mensajes al C2 y orden gráfica.'} Cambia cuando quieras: el cálculo es el mismo.</p>
        <div class="btns"><button class="btn mini${Guia.encendida() ? ' on' : ''}" id="bModoAy">❔ Modo ayuda: ${Guia.encendida() ? 'encendido' : 'apagado'}</button></div>
        <details class="tarjeta"><summary>Ver qué significa cada sigla</summary>
        <table class="t glosario"><tbody>${Uso.glosario(GLOSARIO).map(([k, v])=>`<tr><td class="tx"><b>${esc(k)}</b></td><td class="tx">${esc(v)}</td></tr>`).join('')}</tbody></table></details>
        <details class="tarjeta"><summary>Qué hace la app</summary><div class="nota">Marca la ruta <b>sobre el mapa o tu carta</b> (con cuadrícula UTM y cota automática) y calcula el <b>cuadro de marcha y navegación</b> (distancia, desnivel, pendiente, rumbo magnético en grados y milésimas, tiempos, altos,
        imprevistos y hora de llegada a cada punto), dibuja el <b>perfil del itinerario</b>, lo deja listo para imprimir y
        <b>envía el plan</b> al C2 (código de texto, QR, GPX, KML, GeoJSON o Excel).<br><br>
        Tiempos para <b>montaña</b> (tabla de velocidades por tropa, terreno y carga), el método MIDE / DIN 33466 o la
        <b>marcha general</b> (a pie o montada, según la vía), con velocidades de día o de noche según la hora de cada tramo. Pestaña <b>Luz</b>: sol, crepúsculos y luna del día de la marcha.
        Columna y tiempo de paso, agua y calor, lista de verificación antes, durante y después.
        Declinación magnética automática con el modelo WMM2025 (NOAA).<br><br>App no oficial: verifica siempre los resultados con la carta.
        <div class="mono" style="margin-top:8px;color:var(--tenue)">Versión ${VERSION}</div></details></details>`;
    if(primera) vista.innerHTML = `<h2>¿Qué quieres hacer?</h2>
      <button class="inicio pri" id="bNueva"><i>⌖</i><span><b>Planificar una marcha</b><small>Marcas la ruta y la app calcula el cuadro de marcha</small></span></button>
      <button class="inicio" id="bIrA"><i>🧭</i><span><b>Navegar a un punto</b><small>Sin ruta: brújula, distancia y rumbo a un lugar</small></span></button>
      <button class="inicio" id="bTour"><i>▶</i><span><b>Ver ejemplo guiado</b><small>Una marcha de ejemplo, paso a paso</small></span></button>
      <div class="uso-l"><span>Uso</span>${usoSeg}</div>${mas}`;
    else vista.innerHTML = `${G ? `<details class="tarjeta g-res" id="gDet"${guiaAb ? ' open' : ''}><summary><span class="g-cab"><b>${esc(mA.nombre)}</b><span>${G.pasos.filter(x=>x.est==='v').length} de 9 listos</span></span>
          <span class="g-bar"><i style="width:${Math.round(G.pasos.filter(x=>x.est==='v').length/9*100)}%"></i></span>
          <span class="g-sig">${(()=>{ const sg = G.pasos.find(x=>x.est==='r') || G.pasos.find(x=>x.est==='a'); return sg ? 'Siguiente: ' + sg.k + ' ' + esc(sg.n) + ' · ' : ''; })()}${G.pasos.filter(x=>x.falta && (x.est==='r' || x.est==='a')).length ? G.pasos.filter(x=>x.falta && (x.est==='r' || x.est==='a')).length + ' pendientes · ' : ''}<u>${guiaAb ? 'ocultar' : 'ver la guía'}</u></span></summary>${G.html}</details>` : ''}
      <h2>Mis marchas</h2>
      ${lista}
      <div class="btns"><button class="btn pri" id="bNueva">＋ Nueva marcha</button><button class="btn" id="bIrA">🧭 Navegar a un punto</button></div>
      ${mas}`;
    vista.querySelectorAll('[data-abrir]').forEach(d=>d.onclick = e=>{
      const b = e.target.closest('button');
      // cerrar la marcha abierta (v0.99.5): queda guardada pero sin seleccionar (p. ej. para navegar a cualquier punto sin ver su ruta)
      if(b && b.dataset.cierra){ const x = S.marchas.find(y=>y.id===b.dataset.cierra);
        if(x && x.ejec && x.ejec.estado!=='fin') return aviso('Esta marcha está en curso: termínala en Seguir antes de cerrarla');
        S.actual = null; guardar(); pintar(); return aviso('Marcha cerrada: sigue guardada; tócala para abrirla de nuevo'); }
      if(b && b.dataset.dup){ const o = JSON.parse(JSON.stringify(S.marchas.find(x=>x.id===b.dataset.dup))); o.nombre += ' (copia)'; nueva(o); return pintar(); }
      if(b && b.dataset.borra){ const x = S.marchas.find(x=>x.id===b.dataset.borra);
        return confirmar('¿Borrar la marcha «' + x.nombre + '»? No se puede deshacer.', ()=>{ S.marchas = S.marchas.filter(y=>y!==x); if(S.actual===x.id) S.actual = null; guardar(); pintar(); }); }
      S.actual = d.dataset.abrir; ir('mapa'); });
    vista.querySelectorAll('[data-uso]').forEach(b=>b.onclick = ()=>{ S.uso = b.dataset.uso; Uso.poner(S.uso); guardar(); pintar(); aviso(Uso.civil() ? '🥾 Uso civil' : '🪖 Uso militar'); });
    vista.querySelectorAll('[data-gpaso]').forEach(b=>b.onclick = e=>{ e.stopPropagation(); const x = G.pasos.find(y=>y.k===+b.dataset.gpaso); if(x) irA(x.ir); });
    $('#bModoAy').onclick = ()=>{ Guia.poner(!Guia.encendida()); aviso(Guia.encendida() ? '❔ Modo ayuda encendido: en cada pantalla aparece qué hacer' : 'Modo ayuda apagado (el botón ? sigue arriba)'); pintar(); };
    $('#bNueva').onclick = ()=>{ nueva(); ir('mapa'); };
    $('#bEjemplo').onclick = ()=>{ ejemplo(); ir('cuadro'); };
    [$('#bTour'), $('#bTour2')].forEach(b=>{ if(b) b.onclick = ()=>tourIniciar(); });
    $('#mMas').addEventListener('toggle', e=>{ if(!primera) try { localStorage.setItem('burros_mas', e.target.open ? '1' : ''); } catch(x){} });
    const gd = $('#gDet'); if(gd) gd.addEventListener('toggle', ()=>{ try { localStorage.setItem('burros_guia', gd.open ? '1' : ''); } catch(x){} const u = gd.querySelector('.g-sig u'); if(u) u.textContent = gd.open ? 'ocultar' : 'ver la guía'; });
    $('#bImportar').onclick = importarArchivo;
    $('#bPaq').onclick = dialogoPaquete;
    $('#bIrA').onclick = ()=>{ Seguir.abrirIrA(); ir('seguir'); };
    $('#bRecibir').onclick = recibir;
    $('#bResp').onclick = ()=>descargar('burros_respaldo_' + hoy() + '.json', JSON.stringify({app:'burros', v:1, marchas:S.marchas}, null, 1), 'application/json');
    $('#bCargar').onclick = ()=>elegirArchivo('.json,application/json', t=>{
      try { const d = JSON.parse(t), ms = (d.marchas || []).filter(m=>m && Array.isArray(m.puntos)); if(!ms.length) throw 0;
        const ids = new Set(S.marchas.map(m=>m.id)); let n = 0; ms.forEach(m=>{ if(!ids.has(m.id)){ S.marchas.push(m); n++; } });
        guardar(); pintar(); aviso('✔ ' + n + ' marcha' + (n===1 ? '' : 's') + ' cargada' + (n===1 ? '' : 's'));
      } catch(e){ aviso('⚠ El archivo no es un respaldo válido'); } });
  }
  /* ---------- paquete para terreno (paquete.js): marchas + cartas calzadas + zonas de mapa, para pasar sin internet ---------- */
  async function dialogoPaquete(){
    const inv = await Paquete.inventario(), m = actual(), fm = x=>f(x, x<10 ? 1 : 0);
    const st = dialogoPaquete.st || (dialogoPaquete.st = {marchas:'todas', cartas:true, zonas:true});
    const tam = ()=>(st.cartas ? inv.mbCartas : 0) + (st.zonas ? inv.mbZonas : 0) + 0.05;
    dialogo(`<h3>📦 Paquete para terreno</h3>
      <p class="nota">Para preparar a la unidad sin internet: el comandante arma el paquete (con señal, después de calzar las cartas y guardar las zonas) y lo reparte por AirDrop, Quick Share, Bluetooth o cable. Cada uno toca «Cargar un paquete».</p>
      <h4>Armar</h4>
      <div class="campos"><label class="c ancho">Marchas<select id="pqM"><option value="todas"${st.marchas==='todas' ? ' selected' : ''}>Todas (${S.marchas.length})</option>${m ? `<option value="actual"${st.marchas==='actual' ? ' selected' : ''}>Solo «${esc(m.nombre)}»</option>` : ''}<option value="no"${st.marchas==='no' ? ' selected' : ''}>Ninguna</option></select></label></div>
      ${inv.cartas ? `<label class="nota" style="display:block;margin:4px 0"><input type="checkbox" id="pqC" ${st.cartas ? 'checked' : ''} style="width:auto;vertical-align:middle"> Cartas propias calzadas (${inv.cartas}, ${fm(inv.mbCartas)} MB)</label>`
        : `<p class="nota" style="margin:4px 0">Cartas propias: <b>aún no hay en este equipo</b>. ${m ? '<button class="btn mini" id="pqIrC">🗺 Cargar y calzar una carta</button>' : ''}</p>`}
      ${inv.zonas ? `<label class="nota" style="display:block;margin:4px 0"><input type="checkbox" id="pqZ" ${st.zonas ? 'checked' : ''} style="width:auto;vertical-align:middle"> Zonas de mapa sin señal (${inv.zonas}, ≈ ${fm(inv.mbZonas)} MB)</label>`
        : `<p class="nota" style="margin:4px 0">Zonas de mapa sin señal: <b>aún no hay en este equipo</b>. ${m ? '<button class="btn mini" id="pqIrZ">⬇ Guardar una zona</button>' : ''}</p>`}
      ${!inv.cartas || !inv.zonas ? '<p class="nota" style="margin:4px 0"><small>Lo guardado queda en este navegador y en esta dirección de la app: lo de otro navegador u otra dirección (por ejemplo, la del computador) no aparece aquí.</small></p>' : ''}
      <p class="nota" id="pqTam">Tamaño aproximado: ${fm(tam())} MB.</p>
      <div id="pqProg" hidden><div class="barra"><i id="pqBarra" style="width:0"></i></div><div class="nota mono" id="pqTxt"></div></div>
      <div class="btns"><button class="btn pri" id="pqArmar">📦 Armar el paquete</button></div>
      <div class="btns" id="pqListo" style="display:none"><button class="btn pri" id="pqComp">📤 Compartir (AirDrop, Quick Share…)</button><button class="btn" id="pqGuar">⬇ Guardar archivo</button></div>
      <h4>Cargar</h4>
      <p class="nota">Elige el archivo «.burros» que te pasaron (queda en Archivos o Descargas). Si una marcha ya la tienes, se actualiza con la del paquete (se conservan tus horas reales y tu reseña).</p>
      <div class="btns"><button class="btn" id="pqCargar">📥 Cargar un paquete</button><button class="btn" data-cerrar>Cerrar</button></div>`, d=>{
      const prog = (t, fr)=>{ d.querySelector('#pqProg').hidden = false; d.querySelector('#pqTxt').textContent = t; d.querySelector('#pqBarra').style.width = Math.round((fr || 0)*100) + '%'; };
      d.querySelector('#pqM').onchange = e=>{ st.marchas = e.target.value; };
      const qc = d.querySelector('#pqC'), qz = d.querySelector('#pqZ');
      if(qc) qc.onchange = e=>{ st.cartas = e.target.checked; d.querySelector('#pqTam').textContent = 'Tamaño aproximado: ' + fm(tam()) + ' MB.'; };
      if(qz) qz.onchange = e=>{ st.zonas = e.target.checked; d.querySelector('#pqTam').textContent = 'Tamaño aproximado: ' + fm(tam()) + ' MB.'; };
      // ir directo al mapa a cargar una carta o guardar una zona
      const irA = id=>{ cerrarDialogo(); ir('mapa'); setTimeout(()=>{ const b = document.getElementById(id); if(b) b.click(); }, 700); };
      const ic = d.querySelector('#pqIrC'), iz = d.querySelector('#pqIrZ'); if(ic) ic.onclick = ()=>irA('mCartas'); if(iz) iz.onclick = ()=>irA('mZonas');
      d.querySelector('#pqArmar').onclick = async e=>{
        const ms = st.marchas==='todas' ? S.marchas : st.marchas==='actual' && m ? [m] : [];
        if(!ms.length && !(st.cartas && inv.cartas) && !(st.zonas && inv.zonas)) return aviso('No hay nada para armar');
        e.target.disabled = true; prog('Armando el paquete…', 0);
        try { const b = await Paquete.armar({marchas:ms, cartas:st.cartas && inv.cartas>0, zonas:st.zonas && inv.zonas>0}, prog);
          // listo: compartir o guardar con un toque nuevo (Safari solo permite compartir justo después de tocar un botón)
          const nombre = 'Paquete_Burros_' + hoy() + '.burros', fl = new File([b], nombre, {type:'application/octet-stream'});
          prog('Listo: paquete de ' + (b.size<1048576 ? f(Math.max(1, b.size/1024)) + ' KB' : fm(b.size/1048576) + ' MB') + '. Ahora compártelo o guárdalo.', 1);
          const ls = d.querySelector('#pqListo'); ls.style.display = '';
          const comp = d.querySelector('#pqComp'); comp.style.display = navigator.canShare && navigator.canShare({files:[fl]}) ? '' : 'none';
          comp.onclick = async()=>{ try { await navigator.share({files:[fl], title:'Paquete de Burros de Combate'}); aviso('✔ Paquete compartido'); }
            catch(er){ if(er && er.name==='AbortError') return; aviso('No se pudo compartir (' + (er && er.name || 'error') + '): usa «Guardar archivo»'); } };
          d.querySelector('#pqGuar').onclick = ()=>{ descargar(nombre, b, 'application/octet-stream'); aviso('Guardado en Descargas (en el iPhone: app Archivos → Descargas)'); };
        } catch(er){ aviso('No se pudo armar el paquete: ' + er.message); }
        e.target.disabled = false; };
      d.querySelector('#pqCargar').onclick = ()=>{ const i = document.createElement('input'); i.type = 'file';   // sin filtro: en el iPhone una extensión desconocida («.burros») quedaría bloqueada
        i.onchange = async()=>{ const fl = i.files[0]; if(!fl) return; prog('Leyendo…', 0);
          const ids = new Map(S.marchas.map((x, k)=>[x.id, k])); let ult = null;
          const alMarcha = o=>{ o.par = Object.assign(M.porDefecto(), o.par || {});
            if(ids.has(o.id)){ const k = ids.get(o.id), vieja = S.marchas[k]; if(!o.ejec && vieja.ejec) o.ejec = vieja.ejec; if(!o.resena && vieja.resena) o.resena = vieja.resena; S.marchas[k] = o; }
            else { if(!o.id) o.id = nid(); S.marchas.unshift(o); ids.set(o.id, 0); } ult = o; };
          try { const n = await Paquete.cargar(fl, alMarcha, prog); if(ult) S.actual = ult.id; guardar();
            prog('Listo', 1); aviso('✔ Paquete cargado: ' + [n.marchas + ' marcha(s)', n.cartas + ' carta(s)', n.zonas + ' zona(s) de mapa (' + n.teselas + ' teselas)'].join(', '));
            cerrarDialogo(); pintar();
          } catch(er){ aviso('⚠ No se pudo cargar: ' + er.message); } }; i.click(); };
    });
  }
  function elegirArchivo(accept, cb){
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = ()=>{ const fl = i.files[0]; if(!fl) return; const r = new FileReader(); r.onload = ()=>cb(String(r.result), fl.name); r.readAsText(fl); }; i.click();
  }
  function importarArchivo(){
    elegirArchivo('.json,.gpx,.kml,application/json,application/gpx+xml,application/vnd.google-earth.kml+xml', (t, nombre)=>{
      // JSON de Burros (una marcha o varias, con todo: material, puestos, pesos): se agregan; si ya existe una con el mismo id, como copia
      // carta ya calzada que compartieron (v0.99.23)
      if(/^\s*\{/.test(t) && /"app"\s*:\s*"burros-cartas?"/.test(t.slice(0, 200))){ Mapa.importarCartas(t).then(n=>aviso('✔ ' + (n===1 ? 'Carta ya calzada cargada' : n + ' cartas ya calzadas cargadas') + ': se ve en el Mapa (🗺 Cartas)')).catch(e=>aviso('⚠ ' + e.message)); return; }
      if(/^\s*\{/.test(t)){ try { const d = JSON.parse(t), ms = (d.marchas || (d.puntos ? [d] : [])).filter(x=>x && Array.isArray(x.puntos)); if(!ms.length) throw 0;
          const ids = new Set(S.marchas.map(x=>x.id)); let ult = null;
          ms.forEach(x=>{ const o = JSON.parse(JSON.stringify(x)); if(!o.id || ids.has(o.id)){ o.id = nid(); if(S.marchas.some(y=>y.nombre===o.nombre)) o.nombre += ' (importada)'; }
            o.par = Object.assign(M.porDefecto(), o.par || {}); S.marchas.unshift(o); ids.add(o.id); ult = o; });
          S.actual = ult.id; guardar(); ir('cuadro'); return aviso('✔ ' + ms.length + ' marcha' + (ms.length===1 ? '' : 's') + ' importada' + (ms.length===1 ? '' : 's') + ' (con material, puestos y pesos)');
        } catch(e){ return aviso('⚠ El archivo JSON no es una marcha de Burros de Combate'); } }
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
    resultado:m=>resultadoHtml(m, true), paquete:()=>dialogoPaquete(), navegarA:d=>{ Seguir.irA(d); ir('seguir'); }, marchas:()=>S.marchas, svgPerfil:(R, T, c)=>svgPerfil(R, T, c), terrenoDe:R=>terrenoDe(R), ir:v=>ir(v), rutaDeRecorrido:(m, e)=>rutaDeRecorrido(m, e)};
  // documento para imprimir o PDF (orden gráfica militar o civil); se abre desde cada pantalla con la sección que corresponde
  function documento(secUnica){ const m = actual(); if(!m) return;
    if(secUnica){ m.doc = m.doc || {}; m.doc.sec = Object.assign({mapa:false, perfil:false, cuadro:false, matriz:false, luz:false, claves:false, apoyo:false, carga:false, material:false, lista:false, horiz:false, resultado:false}, {[secUnica]:true}); }
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
    // tipos de tropa según el uso (militar o civil); el que está elegido siempre aparece
    const tropas = Object.fromEntries(Object.entries(M.TROPAS).filter(([k, t])=>k===p.tropa || (Uso.civil() ? t.civil || k==='andina' : !t.civil)).map(([k, t])=>[k, t.n + (t.est ? ' — estimado' : '')]));
    const TT = M.tropaDe(p.tropa);
    const terrenos = Object.fromEntries(Object.entries(M.TERRENOS).map(([k, v])=>[k, v.n]));
    const sinAl = p.metodo==='battle' || p.metodo==='forzada', vb = M.velBattle(p), carga = `<label class="c">Carga por hombre (kg)${!p.cargaManual && R.carga ? ' <small>del material</small>' : ''}<input class="num" data-par="carga" data-redibujar inputmode="decimal" value="${!p.cargaManual && R.carga ? f(R.carga.total, 1) : esc(p.carga)}" ${!p.cargaManual && R.carga ? 'disabled' : ''}></label>`;
    const campo = (k, n, ph)=>`<label class="c">${n}<input class="num" data-par="${k}" data-redibujar inputmode="decimal" value="${esc(p[k])}"${ph ? ` placeholder="${ph}"` : ''}></label>`;
    const camposBattle = `<label class="c ancho">Patrón preparado<select data-par="brPreset" data-redibujar>${opc(Object.fromEntries(Object.entries(M.PRESETS_BR).map(([k, v])=>[k, v.n])), p.brPreset || 'propio')}</select></label>
          <label class="c ancho">Forma del patrón<select data-par="brPatron" data-redibujar>${opc(M.PATRONES, p.brPatron)}</select></label><!--nota-->
          ${p.brPatron==='trote' ? `<label class="c">Ritmo trotando (min/km)<input class="num" data-par="brRitmo" data-redibujar value="${esc(p.brRitmo || '6:00')}" placeholder="6:00"><small>${M.verRitmo(vb)} = ${f(vb, 1)} km/h</small></label>${carga}${campo('brMetaKm', 'Meta: distancia (km)', 'opcional')}${campo('brMetaMin', 'Meta: tiempo (min)', 'opcional')}` : `
          ${p.brPatron==='distancia' ? campo('brRapido', 'Metros corriendo') + campo('brLento', 'Metros caminando') : p.brPatron==='tiempo' ? campo('brMinRap', 'Minutos corriendo') + campo('brMinLen', 'Minutos caminando') : campo('brPteLim', 'Se camina en subidas de más de (%)')}
          ${campo('brVelRap', p.brPatron==='terreno' ? 'Velocidad trotando (km/h)' : 'Velocidad corriendo (km/h)')}${campo('brVelLen', 'Velocidad caminando (km/h)')}
          ${carga}${campo('brMetaKm', 'Meta: distancia (km)', 'opcional')}${campo('brMetaMin', 'Meta: tiempo (min)', 'opcional')}`}`;
    const mt = R.meta, ritmo = x=>Math.floor(x) + ':' + String(Math.round((x - Math.floor(x))*60)).padStart(2, '0');
    // en palabras simples: cuándo se corre y cuándo se camina (pedido del usuario, v0.99.6)
    const notaSinAltos = p.metodo==='battle' ? `<p class="nota"><b>Cómo es:</b> ${p.brPatron==='trote' ? `se <b>trota todo el recorrido</b> a <b>${M.verRitmo(vb)}</b> (${f(vb, 1)} km/h), sin caminar; en las subidas de más de 15 % se usa el tiempo de montaña si es mayor. El ritmo se escribe en minutos por kilómetro («6:00», «5:30») o en km/h («10 km/h»).`
        : p.brPatron==='terreno' ? `se <b>trota</b> a ${f(+p.brVelRap||9, 1)} km/h en lo plano y en las bajadas, y se <b>camina</b> a ${f(+p.brVelLen||6, 1)} km/h en las subidas de más de ${esc(p.brPteLim)} %; en subidas de más de 15 % se usa el tiempo de montaña si es mayor.`
        : `se <b>corre ${p.brPatron==='tiempo' ? esc(p.brMinRap) + ' min' : esc(p.brRapido) + ' m'}</b> a ${f(+p.brVelRap||9, 1)} km/h, después se <b>camina ${p.brPatron==='tiempo' ? esc(p.brMinLen) + ' min' : esc(p.brLento) + ' m'}</b> a ${f(+p.brVelLen||6, 1)} km/h, y se repite hasta el final (velocidad media ${f(vb, 1)} km/h).
          En las subidas de 7 % o más no se corre, se camina (y en las de más de 15 % se usa el tiempo de montaña si es mayor).`} Sin altos; si el calor lo exige, se agregan descansos.
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
          ${p.metodo==='battle' ? camposBattle.replace('<!--nota-->', `<div class="c ancho">${notaSinAltos}</div>`) : p.metodo!=='general' && p.metodo!=='forzada' ? `
          <label class="c">Tropa<select data-par="tropa" data-redibujar>${opc(tropas, p.tropa)}</select></label>
          <label class="c">Terreno / modalidad<select data-par="terreno" data-redibujar>${opc(terrenos, p.terreno)}</select></label>
          <label class="c">Carga por hombre (kg)${!p.cargaManual && R.carga ? ' <small>del material</small>' : ''}<input class="num" data-par="carga" data-redibujar inputmode="decimal" value="${!p.cargaManual && R.carga ? f(R.carga.total, 1) : esc(p.carga)}" ${!p.cargaManual && R.carga ? 'disabled' : ''}></label>
          <label class="c ancho">Velocidades de subida y bajada<select data-par="fuenteVel" data-redibujar>${opc({tabla:'Tabla de la tropa (según tropa, terreno y carga)', mide:'Valores originales MIDE (300 m/h subida · 500 m/h bajada)', propia:'Las de mi unidad (escritas a mano)'}, R.vel.fuente)}</select></label>
          ${R.vel.fuente==='tabla' ? `<label class="c">Ritmo de la unidad<select data-par="criterio" data-redibujar>${opc({min:'Bajo: el valor más lento de la tabla', media:'Normal: el valor del medio', max:'Exigente: el valor más rápido de la tabla'}, p.criterio)}</select></label>` : ''}
          ${R.vel.fuente==='propia' ? `<label class="c">Subida (m/h)<input class="num" data-par="velSub" inputmode="numeric" value="${esc(p.velSub||'')}" placeholder="${f(vt.sub)}"></label>
          <label class="c">Bajada (m/h)<input class="num" data-par="velBaj" inputmode="numeric" value="${esc(p.velBaj||'')}" placeholder="${f(vt.baj)}"></label>` : ''}
          <label class="c">Llano (km/h)<input class="num" data-par="velLlano" inputmode="decimal" value="${esc(p.velLlano)}"></label>`
          : `<label class="c">Tipo de unidad<select data-par="unidadTipo" data-redibujar>${opc(M.UNIDADES, p.unidadTipo)}</select></label>
          <label class="c">Vía principal<select data-par="via" data-redibujar>${opc(Object.fromEntries(Object.entries(M.VIAS).map(([k, n])=>{ const v = (M.VEL_GENERAL[p.unidadTipo] || M.VEL_GENERAL.pie)[k]; return [k, n + (v ? ' (' + f(v.dia, 1) + ' km/h de día · ' + f(v.noche, 1) + ' de noche)' : '')]; })), M.VIAS[p.via] ? p.via : 'camino1')}</select></label>
          <label class="c">Velocidad de día (km/h)<input class="num" data-par="velGeneral" inputmode="decimal" value="${esc(p.velGeneral||'')}" placeholder="${f(M.velGeneral(p.via, false, p.unidadTipo), 1)}"></label>
          ${p.metodo==='forzada' ? `<label class="c">Ritmo más rápido (%)<input class="num" data-par="forzadaPct" inputmode="decimal" value="${esc(p.forzadaPct)}"></label>
          <label class="c">Carga por hombre (kg)${!p.cargaManual && R.carga ? ' <small>del material</small>' : ''}<input class="num" data-par="carga" data-redibujar inputmode="decimal" value="${!p.cargaManual && R.carga ? f(R.carga.total, 1) : esc(p.carga)}" ${!p.cargaManual && R.carga ? 'disabled' : ''}></label>` : ''}`}
          ${p.metodo!=='general' && p.metodo!=='forzada' ? `<label class="c">Reducción de noche (%)<input class="num" data-par="redNoche" inputmode="numeric" value="${esc(p.redNoche)}"></label>` : ''}
          ${sinAl ? '' : `<label class="c">Altos<select data-par="altosModo" data-redibujar>${opc({pct:'Un porcentaje del tiempo de marcha (p. ej. 10 %)', regimen:'Programados: tantos minutos cada tanto tiempo (p. ej. 10 min cada 50)'}, p.altosModo || 'pct')}</select></label>`}
          ${sinAl ? '' : p.altosModo==='regimen' ? `<label class="c">Primer alto a los (min)<input class="num" data-par="altoPrimero" inputmode="numeric" value="${esc(p.altoPrimero)}"></label>
          <label class="c">Primer alto de (min)<input class="num" data-par="altoPrimeroDur" inputmode="numeric" value="${esc(p.altoPrimeroDur)}"></label>
          <label class="c">Luego un alto cada (min)<input class="num" data-par="altoCada" inputmode="numeric" value="${esc(p.altoCada)}"></label>
          <label class="c">de (min)<input class="num" data-par="altoDur" inputmode="numeric" value="${esc(p.altoDur)}"></label>`
          : `<label class="c">Altos (% del tiempo de marcha)<input class="num" data-par="altos" data-pct inputmode="decimal" value="${pct(p.altos)}"></label>`}
          <label class="c">Imprevistos (%)<input class="num" data-par="imprev" data-pct inputmode="decimal" value="${pct(p.imprev)}"></label>
        </div>
        <p class="nota">${!p.cargaManual && R.carga ? `La carga sale del <b>Material</b> (Datos → Material y carga): <b>${f(R.carga.inicial, 1)} kg al partir</b> y ${f(R.carga.final, 1)} kg al llegar (el agua se bebe en el camino); cada tramo se calcula con su carga.` : R.sinEfectivo ? '<b style="color:var(--ocre)">Falta el efectivo</b> (Unidad y columna): sin él no se puede calcular la carga desde el material; se usa la carga escrita.' : 'Carga escrita a mano.'}
          <label style="display:block;margin:6px 0"><input type="checkbox" data-par="cargaManual" data-redibujar ${p.cargaManual ? 'checked' : ''} style="width:auto;vertical-align:middle"> Escribir la carga a mano</label>
          ${sinAl ? ' La carga define el esfuerzo para el calor.' : p.metodo!=='general' ? ' La tabla trae 10, 20 y 30 kg: con otra carga se interpola.' : ' En marcha general, con carga sobre unos 18 kg la velocidad baja.'}</p>
        ${sinAl && p.metodo!=='battle' ? notaSinAltos : ''}
        ${p.metodo!=='general' && !sinAl ? `<p class="nota">Tabla de velocidades de marcha vertical en montaña para ${esc(TT.base==='andina' ? 'tropa andina' : 'tropa normal')}, ${esc(M.TERRENOS[p.terreno].n.toLowerCase())}, ${f(vt.carga, 1)} kg:
          subida <b>${esc(vt.rango)} m/h</b>, bajada <b>${f(vt.baj)} m/h</b>.${TT.est ? ` <b>${esc(TT.n)}: ${TT.f>1 ? '+' : '−'}${Math.round(Math.abs(TT.f - 1)*100)} % sobre esa tabla (estimado).</b>` : ''}${p.terreno==='esquies' && TT.base==='normal' ? ' <b>Esquíes: la tabla solo trae valores para tropa andina.</b>' : ''}
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
        <details class="avanzado"><summary>⚙ Avanzado</summary><div class="campos">
          ${p.metodo==='montana' ? `<label class="c">Pendiente crítica (%)<input class="num" data-par="pteCr" data-pct inputmode="decimal" value="${pct(p.pteCr)}"></label>` : ''}
          <label class="c ancho"><span><input type="checkbox" data-par="ajusteAltura" data-redibujar ${p.ajusteAltura!==false ? 'checked' : ''} style="width:auto;vertical-align:middle"> Más lento en altura (sobre 1.500 m)</span></label></div>
          ${p.metodo==='montana' ? '<p class="nota">Sobre la pendiente crítica el tramo se calcula por el desnivel; bajo ella, por la distancia (5 % por defecto).</p>' : ''}
          <p class="nota">Sobre unos 1.500 m la capacidad física baja cerca de un <b>7 % por cada 1.000 m</b> (estudios de fisiología en altura); la tropa andina, de operaciones especiales o aclimatada pierde la mitad. Cada tramo se ajusta con su altura media.</p></details>
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
          <label class="c ancho">Formación<select data-par="formacion" data-redibujar>${(()=>{ const fk = p.formacion || (+p.filas===1 ? 'fila' : 'col2'), o = (t)=>Object.entries(M.FORMACIONES).filter(([, x])=>!!x.tac===t).map(([k, x])=>`<option value="${k}"${k===fk ? ' selected' : ''}>${esc(x.n)}</option>`).join('');
            return `<optgroup label="Administrativas">${o(false)}</optgroup>${Uso.civil() ? '' : `<optgroup label="Tácticas">${o(true)}</optgroup>`}`; })()}</select></label>
          <label class="c">Distancia entre hombres<select data-par="distTipo" data-redibujar>${opc(Object.fromEntries(Object.entries(M.DISTANCIAS).filter(([k])=>!Uso.civil() || k!=='peligro').map(([k, x])=>[k, x.n + ' (' + x.d[0] + ' m día · ' + x.d[1] + ' m noche)'])), p.distTipo || 'tactica')}</select></label>
          <label class="c">Distancia propia (m)<input class="num" data-par="distHombres" inputmode="decimal" value="${esc(p.distHombres||'')}" placeholder="${(M.DISTANCIAS[p.distTipo] || M.DISTANCIAS.tactica).d[R.fracNoche>0.5 ? 1 : 0]}"></label>
          ${Uso.civil() ? '' : `<label class="c ancho">Técnica de movimiento (toda la marcha)<select data-par="tecnica" data-redibujar>${opc(Object.fromEntries(Object.entries(M.TECNICAS).map(([k, x])=>[k, x.n + ' — ' + x.txt + (x.f<1 ? ' (−' + Math.round((1 - x.f)*100) + ' %)' : '')])), p.tecnica || 'desplazamiento')}</select></label>`}
          <label class="c">Unidades de marcha<input class="num" data-par="unidades" data-redibujar inputmode="numeric" value="${esc(p.unidades)}" placeholder="1"></label>
          ${(+p.unidades||1)>1 ? `<label class="c">Distancia entre unidades (m)<input class="num" data-par="distUnidades" inputmode="numeric" value="${esc(p.distUnidades||'')}" placeholder="${R.fracNoche>0.5 ? 25 : 50}"></label>` : ''}
        </div>
        ${p.efectivo ? '' : '<div class="alerta">Falta el <b>efectivo</b>: sin él no se calcula la columna, y el material y la carga quedan calculados para 1 hombre.</div>'}
        ${M.formacionDe(p).tac ? `<p class="nota"><b>Formación táctica:</b> el largo de la columna se estima con ${M.formacionDe(p).filas} hombres a lo ancho por fila (estimado).</p>` : ''}
        ${Uso.civil() ? '' : '<p class="nota">La técnica de movimiento hace más lenta la marcha: con vigilancia −25 %, por saltos −60 % (porcentajes <b>estimados</b>; el manual no da cifras). En cada punto puedes cambiar la técnica del tramo que llega a él.</p>'}
        <p class="nota">Referencia: entre hombres 2–5 m de día y 1–3 m de noche; entre pelotones 50 m (noche 25 m) y entre compañías 100 m (noche 50 m).
          Con esto se calcula el largo de la columna y el <b>tiempo de paso</b> (lo que demora la columna completa en pasar por un punto), y la hora en que la cola llega al final.</p>
      </details>

      <details class="tarjeta"><summary>Calor y agua<span class="res">${R.calor && R.calor.cat ? 'categoría ' + esc(R.calor.n) : 'opcional'}</span></summary>
        <div class="campos">
          <label class="c">Temperatura (°C)<input class="num" data-par="temp" data-redibujar inputmode="decimal" value="${esc(p.temp)}" placeholder="del pronóstico"></label>
          <label class="c">Humedad (%)<input class="num" data-par="hum" data-redibujar inputmode="numeric" value="${esc(p.hum)}" placeholder="del pronóstico"></label>
          <div class="c"><span>&nbsp;</span><button class="btn" id="bPron">🌡 Traer del pronóstico</button></div>
        </div>
        ${p.pron && +p.pron.temp===+String(p.temp).replace(',', '.') ? `<p class="nota">${p.pron.fuente==='pronóstico' ? 'Del <b>pronóstico</b>' : 'Del <b>clima normal</b> (promedio de ' + p.pron.anios + ' años: la fecha está lejos y aún no hay pronóstico)'} para el PIM:
          ${esc(p.pron.temp)} °C y ${esc(p.pron.hum)} % a las ${esc(p.pron.hora)} (la hora más calurosa de la marcha)${p.pron.viento ? ' · viento hasta ' + esc(p.pron.viento) + ' km/h' : ''}${p.pron.tmin!==undefined ? ' · mínima ' + esc(p.pron.tmin) + ' °C' : ''}.
          ${+p.pron.viento>=40 ? '<b style="color:var(--rojo)">Viento fuerte: cuidado en filos y cumbres.</b>' : ''}${p.pron.tmin!==undefined && +p.pron.tmin<=0 ? ' <b style="color:var(--azul)">Bajo 0 °C: riesgo de hielo y frío.</b>' : ''}</p>` : ''}
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
      <div class="btns" style="margin:4px 0 0"><button class="btn mini${todosPuntos() ? ' on' : ''}" id="bTodosP">${todosPuntos() ? '▴ Un punto por línea' : '▾ Ver todos los campos'}</button></div>
      <div id="puntos" class="${todosPuntos() ? 'puntos-todo' : ''}"></div>
      <div class="btns barra-puntos"><button class="btn pri" data-lp="punto">＋ Agregar punto</button><button class="btn" data-lp="regreso">↩ Agregar regreso (misma ruta)</button><button class="btn" data-lp="cotas">⛰ Completar cotas desde el terreno</button><button class="btn" data-lp="ver">Ver cuadro de marcha ›</button></div>`;
    pintarPuntos(); actualizarCalculos();
    $('#bTodosP').onclick = ()=>{ try { localStorage.setItem('burros_puntos', todosPuntos() ? '' : 'todo'); } catch(e){} const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    const lp = (k, fn)=>vista.querySelectorAll('[data-lp="' + k + '"]').forEach(b=>b.onclick = fn);
    lp('punto', ()=>{ const u = m.puntos[m.puntos.length - 1];
      m.puntos.push(punto('PC' + M.calcular(m).eventos.length, Object.assign(u ? {tipo:u.tipo, zona:u.zona} : {}, {ev:true}))); abiertoP = m.puntos.length - 1; guardar(); pintarPuntos(); actualizarCalculos();
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
    const bp = $('#bPron'); if(bp) bp.onclick = async()=>{ bp.disabled = true; bp.textContent = 'Buscando…';
      try { const r = await pronostico(m, M.calcular(m)); Object.assign(m.par, {temp:String(r.temp), hum:String(r.hum), pron:r}); guardar();
        const y = window.scrollY; pintar(); window.scrollTo(0, y); vista.querySelectorAll('details').forEach(d=>{ if(/Calor y agua/.test(d.querySelector('summary').textContent)) d.open = true; });
        aviso('🌡 ' + r.temp + ' °C y ' + r.hum + ' % (' + r.fuente + ')'); }
      catch(e){ bp.disabled = false; bp.textContent = '🌡 Traer del pronóstico'; aviso('⚠ ' + (e.message || 'Sin conexión: escribe la temperatura y la humedad')); } };
    lp('cotas', async()=>{
      const R = M.calcular(m), faltan = m.puntos.map((x, i)=>i).filter(i=>(m.puntos[i].cota==='' || m.puntos[i].cotaAuto) && R.puntos[i].lat!==null && R.puntos[i].lat!==undefined && !isNaN(R.puntos[i].lat));
      if(!faltan.length) return aviso('Todos los puntos tienen cota escrita');
      aviso('Buscando ' + faltan.length + ' cota' + (faltan.length===1 ? '' : 's') + '…'); const n = await completarCotas(m); pintar(); aviso(n ? '✔ ' + n + ' cota' + (n===1 ? '' : 's') + ' del terreno (revísalas con la carta)' : 'Sin conexión: no se pudieron obtener las cotas'); });
  }
  /* temperatura y humedad del pronóstico (Open-Meteo, gratuito, sin clave) en el PIM, en la hora más calurosa de la marcha.
     Hasta 16 días adelante (o hasta 3 meses atrás): pronóstico. Más lejos: promedio de esa fecha en los últimos 5 años (clima normal). */
  async function pronostico(m, R){
    const p0 = R.puntos.find(x=>x.ok); if(!p0) throw new Error('Primero ubica el PIM');
    if(!m.fecha || R.res.partida===null) throw new Error('Falta la fecha o la hora de partida');
    const ini = new Date(m.fecha + 'T00:00:00'), h0 = R.res.partida, h1 = R.res.partida + Math.max(R.res.total || 0, 1);
    const dia = d=>{ const x = new Date(ini.getTime() + d*864e5); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const dIni = dia(0), dFin = dia(Math.floor(h1/24)), dias = (ini - new Date(new Date().toDateString()))/864e5;
    const pedir = async url=>{ const r = await fetch(url); if(!r.ok) throw new Error('El servicio del pronóstico no respondió'); return r.json(); };
    const campos = 'hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto&latitude=' + p0.lat.toFixed(4) + '&longitude=' + p0.lon.toFixed(4);
    // de una respuesta: la hora más calurosa dentro de la marcha
    const peor = (j, desplaz)=>{ const H = j.hourly; let mejor = null, tmin = Infinity, vmax = 0;
      H.time.forEach((t, k)=>{ const d = new Date(t), hrs = (new Date(d.getTime() + desplaz*864e5) - ini)/36e5;
        if(hrs<h0 - 0.5 || hrs>h1 + 0.5 || H.temperature_2m[k]===null) return;
        tmin = Math.min(tmin, H.temperature_2m[k]); vmax = Math.max(vmax, H.wind_speed_10m[k] || 0);
        if(!mejor || H.temperature_2m[k]>mejor.temp) mejor = {temp:H.temperature_2m[k], hum:H.relative_humidity_2m[k], hora:t.slice(11, 16)}; });
      return mejor && Object.assign(mejor, {tmin, viento:vmax}); };
    if(dias<=15 && dias>=-90){
      const r = peor(await pedir('https://api.open-meteo.com/v1/forecast?' + campos + '&start_date=' + dIni + '&end_date=' + dFin), 0);
      if(!r) throw new Error('El pronóstico no trae datos para esas horas');
      return {temp:Math.round(r.temp), hum:Math.round(r.hum), hora:r.hora, viento:Math.round(r.viento), tmin:Math.round(r.tmin), fuente:'pronóstico'};
    }
    // clima normal: la misma fecha en los últimos 5 años con datos
    const anio = new Date().getFullYear(), res = [];
    for(let a=1; a<=5; a++){ const off = (ini.getFullYear() - (anio - a)), sh = s=>(+s.slice(0, 4) - off) + s.slice(4);
      try { const j = await pedir('https://archive-api.open-meteo.com/v1/archive?' + campos + '&start_date=' + sh(dIni) + '&end_date=' + sh(dFin));
        const desplaz = (ini - new Date(sh(dIni) + 'T00:00:00'))/864e5, r = peor(j, desplaz); if(r) res.push(r); } catch(e){} }
    if(!res.length) throw new Error('Sin conexión: escribe la temperatura y la humedad');
    const prom = k=>Math.round(res.reduce((x, r)=>x + r[k], 0)/res.length);
    return {temp:prom('temp'), hum:prom('hum'), hora:res[0].hora, viento:prom('viento'), tmin:prom('tmin'), fuente:'clima normal', anios:res.length};
  }
  /* puntos en una línea (v0.99.21, etapa 2 de «app más didáctica»): cada punto es una línea (n.º, nombre, clave, coordenada corta, cota)
     y se abre al tocarlo, uno a la vez; lo de menos uso queda en «Más detalles». «Ver todos los campos» (burros_puntos = 'todo') los abre todos. */
  let abiertoP = null;
  const todosPuntos = ()=>{ try { return localStorage.getItem('burros_puntos')==='todo'; } catch(e){ return false; } };
  function lineaPunto(m, Rc, i){
    const x = m.puntos[i], p = Rc.puntos[i], ev = p.ev, utm = x.tipo!=='GEO';
    const c = utm ? (x.e!=='' || x.n!=='' ? esc(x.e) + ' ' + esc(x.n) : '') : (x.lat!=='' || x.lon!=='' ? esc(x.lat) + ' · ' + esc(x.lon) : '');
    const falta = !p.ok ? (c ? 'coordenada incompleta' : 'sin coordenada') : x.cota==='' ? 'sin cota' : '';
    return `<span class="pl-n">${ev ? esc(x.nombre || '(sin nombre)') : '<span class="pl-q">quiebre</span>'}</span>${ev && p.clave ? `<span class="pl-cl">${esc(p.clave)}</span>` : ''}`
      + `<span class="pl-c">${c}${x.cota!=='' ? ' · ' + esc(x.cota) + ' m' : ''}${falta ? ` <b class="pl-mal">${falta}</b>` : ''}</span><span class="pl-e">${abiertoP===i ? '▴' : '✎'}</span>`;
  }
  function pintarPuntos(){
    const m = actual(), cont = $('#puntos'); if(!cont) return; const Rc = M.calcular(m);
    cont.innerHTML = `<datalist id="listaClaves">${(m.par.claves==='propia' ? M.listaPropia(m.par.clavesPropias) : (M.CLAVES[m.par.claves] || M.CLAVES.otan).l).map(c=>`<option value="${c}">`).join('')}</datalist>` + m.puntos.map((x, i)=>{
      const utm = x.tipo!=='GEO';
      return `${i ? `<div class="tramo-entre" id="tr${i}"></div>` : ''}
      <div class="tarjeta punto${Rc.puntos[i].ev ? '' : ' ruta'}${abiertoP===i ? ' abierto' : ''}" data-i="${i}"><span class="ord">${Rc.puntos[i].ev ? Rc.eventos.indexOf(i) + 1 || '·' : '·'}</span>
        <button class="p-lin" type="button" data-plin="${i}">${lineaPunto(m, Rc, i)}</button><div class="p-cuerpo">
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
        ${Rc.puntos[i].ev ? `<div class="extra" style="grid-template-columns:1fr"><label class="c">Nombre clave (vacío = automático)<input class="num clave" data-p="clave" value="${esc(x.clave||'')}" placeholder="${esc(Rc.puntos[i].clave || '')}" list="listaClaves"></label></div>` : ''}
        <details class="p-mas"${todosPuntos() ? ' open' : ''}><summary>Más detalles: observación, detención, velocidad${!Uso.civil() ? ', técnica' : ''}${!m.par.sinMochila ? ', mochila' : ''}</summary>
        ${['general', 'forzada'].includes(actual().par.metodo) && i ? `<div class="extra" style="grid-template-columns:1fr"><label class="c">Vía desde el punto anterior<select data-p="via">${'<option value="">Igual que la marcha (' + esc(M.VIAS[actual().par.via]) + ')</option>' + Object.entries(M.VIAS).map(([k, n])=>`<option value="${k}"${x.via===k ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>` : ''}
        <div class="extra"><label class="c">Observaciones (punto característico)<input data-p="obs" value="${esc(x.obs)}" placeholder="puente, portezuelo, cruce…"></label>
          <label class="c">Detención (min)<input class="num" data-p="det" inputmode="numeric" value="${esc(x.det)}" placeholder="0"></label></div>
        ${i ? (()=>{ const tr = Rc.tramos.find(z=>z.iB===i), vc = tr && !tr.velPropia ? tr.v : null;   // velocidad escrita a mano del tramo que llega aquí (v0.98; también en el Cuadro)
          return `<div class="extra" style="grid-template-columns:1fr"><label class="c">Velocidad desde el punto anterior (km/h, o ritmo en min/km: «18:30»)<input class="num" data-pvel="${i}" value="${x.vel ? esc(String(x.vel).replace('.', ',')) : ''}" placeholder="${vc ? 'calculada ' + f(vc, 1) + ' km/h · ' + M.verRitmo(vc) : 'vacío = la calculada'}"></label></div>`; })() : ''}
        ${i && !Uso.civil() ? `<div class="extra"><label class="c">Técnica desde el punto anterior<select data-p="tecnica"><option value="">Igual que la marcha (${esc((M.TECNICAS[m.par.tecnica] || M.TECNICAS.desplazamiento).n.toLowerCase())})</option>${Object.entries(M.TECNICAS).map(([k, t])=>`<option value="${k}"${x.tecnica===k ? ' selected' : ''}>${t.n}</option>`).join('')}</select></label>
          <label class="c">Formación en ese tramo<select data-p="formacion"><option value="">Igual que la marcha</option>${Object.entries(M.FORMACIONES).map(([k, t])=>`<option value="${k}"${x.formacion===k ? ' selected' : ''}>${t.n}</option>`).join('')}</select></label></div>` : ''}
        ${i && !m.par.sinMochila ? `<div class="extra" style="grid-template-columns:1fr"><label class="c">🎒 Mochila en este punto<select data-p="mochila"><option value="">— Sigue igual —</option><option value="deja"${x.mochila==='deja' ? ' selected' : ''}>Se deja la de sostenimiento (sigue con la de asalto)</option><option value="dejaTodo"${x.mochila==='dejaTodo' ? ' selected' : ''}>Se dejan las dos (sigue con 1.ª y 2.ª línea)</option><option value="recogeB"${x.mochila==='recogeB' ? ' selected' : ''}>Se recoge la de sostenimiento (3.ª B)</option><option value="recogeA"${x.mochila==='recogeA' ? ' selected' : ''}>Se recoge la de asalto (3.ª A)</option><option value="recoge"${x.mochila==='recoge' ? ' selected' : ''}>Se recogen las dos</option></select></label></div>` : ''}
        </details>
        <div class="estado" id="est${i}"></div>
        <div class="acc"><button class="btn mini" data-acc="carta" title="Marcar o corregir este punto tocando la carta">🗺 Ubicar en la carta</button><button class="btn mini" data-acc="sube" ${i ? '' : 'disabled'} aria-label="Subir">▲</button><button class="btn mini" data-acc="baja" ${i<m.puntos.length - 1 ? '' : 'disabled'} aria-label="Bajar">▼</button>
          <button class="btn mini" data-acc="dup">Duplicar</button><button class="btn mini peligro" data-acc="borra">Borrar</button></div>
      </div></div>`;
    }).join('');
  }
  // recalcula y actualiza los textos sin redibujar los campos (para no perder el foco al escribir)
  function actualizarCalculos(){
    const m = actual(), R = M.calcular(m);
    vista.querySelectorAll('.punto [data-plin]').forEach(b=>{ const i = +b.dataset.plin; if(m.puntos[i] && R.puntos[i]) b.innerHTML = lineaPunto(m, R, i); });
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
      if(t.dataset.par==='brPatron') m.par.brPreset = v==='trote' ? 'trote' : 'propio';
      if(/^br(?!P)/.test(t.dataset.par) && m.par.brPatron==='trote') m.par.brPreset = 'trote';   // en solo trote, el ritmo o la meta no cambian el patrón
      if(t.dataset.par==='brPreset'){ const q = Object.assign({}, M.PRESETS_BR[v] || {}); delete q.n; Object.assign(m.par, q); if(q.carga){ m.par.cargaGeneral = true; m.par.cargaManual = true; } }
      if(t.dataset.par==='verboSel'){ m.par.verbo = v==='otra' ? '' : v; guardar(); return; }
      if(t.dataset.par==='verbo') v = String(v).toUpperCase();
      m.par[t.dataset.par] = v; }
    else if(t.dataset.pvel!==undefined){ const i = +t.dataset.pvel, k = M.leerVel(t.value); if(k) m.puntos[i].vel = Math.round(k*1000)/1000; else delete m.puntos[i].vel; }
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
    if(b.dataset.plin!==undefined){ // abrir o cerrar el punto (uno a la vez)
      const ya = c.classList.contains('abierto'); vista.querySelectorAll('.punto.abierto').forEach(x=>x.classList.remove('abierto')); abiertoP = ya ? null : i;
      if(!ya){ c.classList.add('abierto'); c.scrollIntoView({block:'nearest'}); } actualizarCalculos(); return; }
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
      ${r.vMov ? `<span>velocidad en movimiento <b>${M.verVel(r.vMov)} · ${M.verRitmo(r.vMov)}</b></span><span>con altos <b>${M.verVel(r.vAltos)} · ${M.verRitmo(r.vAltos)}</b></span>` : ''}
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
      <p class="nota">${f(c.n)} hombres en ${esc(c.formacion.toLowerCase())}, ${f(c.dh, 1)} m entre hombres (${f(c.factor, 2)} m por hombre)${c.u>1 ? ', ' + c.u + ' unidades de marcha a ' + f(c.du) + ' m' : ''}.
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
  // velocidad y ritmo de un tramo (en movimiento); al tocarla se escribe otra (m.puntos[iB].vel, km/h). En montaña, también la vertical
  const ritmoC = v=>M.verRitmo(v).replace(' min/km', '');
  const velCelda = t=>t.v ? `<span class="velb${t.velPropia ? ' propia' : ''}" data-vel="${t.iB}" title="Tocar para escribir otra velocidad o ritmo">${f(t.v, 1)} · ${ritmoC(t.v)}${t.velPropia ? ' ✎' : ''}</span>${Math.abs(t.dv)>=20 && Math.abs(t.pte)>0.05 ? `<span class="s">${t.dv>0 ? '↗' : '↘'} ${f(t.vVert)} m/h</span>` : ''}` : '—';
  // tabla del cuadro de marcha y navegación (se usa en la pestaña Cuadro y en el documento)
  function tablaCuadro(m, R){
    const T = R.tramos, como = {subida:'↗', bajada:'↘', llano:'→', MIDE:'', general:''}, pteC = p=>Math.abs(p)>=0.3 ? 'fuerte' : '';
    const filas = R.puntos.filter(p=>p.ok).map(p=>{ const ll = T.find(t=>t.iB===p.i), sig = T.find(t=>t.iA===p.i);
      return {p, ll, sig, sal:ll ? ll.salida : R.res.partida + p.det, acum:ll ? ll.distAcum : 0, tac:ll ? ll.tAcum : 0}; });
    const nombre = p=>p.ev ? '<b>' + esc(p.nombre) + '</b>' : '↳ quiebre';
    const p0 = R.puntos.find(q=>q.ok), icoLuz = h=>{ if(!R.conLuz || h===null || h===undefined) return '';
      const c = LUZ.condicion(new Date(LUZ.inicioDia(m.fecha) + h*36e5), p0.lat, p0.lon);
      return `<span class="luzico" title="${LUZ.TIPOS[c.tipo]}${c.oscuro ? (c.conLuna ? ', con luna' : ', sin luna') : ''}">${c.tipo==='dia' ? '☀' : c.oscuro ? (c.conLuna ? '☾' : '●') : '◐'}</span>`; };
    const obs = (p, ll)=>[p.obs ? esc(p.obs) : '', ll && (ll.tecnica!=='desplazamiento' || ll.formacion) ? '<i>llega en ' + [ll.formacion ? M.FORMACIONES[ll.formacion].n.toLowerCase() : '', ll.tecnica!=='desplazamiento' ? M.TECNICAS[ll.tecnica].n.toLowerCase() : ''].filter(Boolean).join(', ') + '</i>' : '', ll && ll.det ? 'detención ' + Math.round(ll.det*60) + ' min' : '',
      p.mochila==='deja' ? '<b>🎒 se deja la mochila de sostenimiento</b>' : p.mochila==='dejaTodo' ? '<b>🎒 se dejan las mochilas</b>' : p.mochila==='recoge' ? '<b>🎒 se recogen las dos mochilas</b>' : p.mochila==='recogeB' ? '<b>🎒 se recoge la mochila de sostenimiento</b>' : p.mochila==='recogeA' ? '<b>🎒 se recoge la mochila de asalto</b>' : ''].filter(Boolean).join(' · ');
    return `
      <div class="tabla-env solo-ancho"><table class="t cmn">
        <thead><tr><th class="tx">Punto</th><th class="tx">Evento<br>(radio)</th><th>Hora<br>llegada</th><th>Hora<br>salida</th><th>Altitud<br>(m)</th>
          <th class="sig">Rumbo al siguiente<br>(° / ‰)</th><th class="sig">Distancia<br>(m)</th><th class="sig">Desnivel<br>(m)</th><th class="sig">Pendiente</th><th class="sig">Tiempo</th><th class="sig">Velocidad<br>(km/h · min/km)</th>
          <th>Dist. acum.<br>(km)</th><th>Tiempo<br>acum.</th><th class="tx">Observaciones</th></tr></thead>
        <tbody>${filas.map(({p, ll, sig, sal, acum, tac})=>`<tr class="${p.ev ? '' : 'sub'}"><td class="tx">${nombre(p)}</td><td class="tx">${p.ev ? evento(p.clave) : ''}</td>
          <td>${ll ? '<b>' + M.verHora(ll.llegada) + '</b>' + icoLuz(ll.llegada) : '—'}</td><td>${sig ? M.verHora(sal) : '—'}</td><td>${f(p.cota)}</td>
          ${sig ? `<td class="sig"><b>${f(sig.azM, 0)}°</b> / ${sig.mils}<span class="s">cuad. ${f(sig.azC, 1)} · geo. ${f(sig.azG, 1)}</span></td><td class="sig">${f(sig.dist)}</td>
            <td class="sig ${sig.dv>0 ? 'sube' : sig.dv<0 ? 'baja' : ''}">${sig.dv>0 ? '+' : ''}${f(sig.dv)}</td><td class="sig ${pteC(sig.pte)}">${f(sig.pte*100, 1)} %</td><td class="sig">${como[sig.como]||''} ${M.verDur(sig.t)}</td><td class="sig">${velCelda(sig)}</td>`
            : '<td class="sig">—</td><td class="sig"></td><td class="sig"></td><td class="sig"></td><td class="sig"></td><td class="sig"></td>'}
          <td>${f(acum/1000, 2)}</td><td>${ll ? M.verDur(tac) : '—'}</td><td class="obs tx">${obs(p, ll)}</td></tr>`).join('')}
          <tr class="tot"><td class="tx">Total</td><td></td><td></td><td>${M.verHora(R.res.termino)}<span class="s">término</span></td><td></td><td class="sig"></td><td class="sig">${f(R.res.dist)}</td>
            <td class="sig">+${f(R.res.sube)} / −${f(R.res.baja)}</td><td class="sig"></td><td class="sig">${M.verDur(R.res.marcha)}</td><td class="sig">${R.res.vMov ? f(R.res.vMov, 1) + ' · ' + ritmoC(R.res.vMov) + '<span class="s">media en movimiento</span>' : ''}</td><td>${f(R.res.dist/1000, 2)}</td><td></td><td class="tx obs">término con altos, detenciones e imprevistos</td></tr>
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
    const obs = (p, ll)=>[p.obs ? esc(p.obs) : '', ll && (ll.tecnica!=='desplazamiento' || ll.formacion) ? '<i>llega en ' + [ll.formacion ? M.FORMACIONES[ll.formacion].n.toLowerCase() : '', ll.tecnica!=='desplazamiento' ? M.TECNICAS[ll.tecnica].n.toLowerCase() : ''].filter(Boolean).join(', ') + '</i>' : '', ll && ll.det ? 'detención ' + Math.round(ll.det*60) + ' min' : '',
      p.mochila==='deja' ? '<b>🎒 se deja la mochila de sostenimiento</b>' : p.mochila==='dejaTodo' ? '<b>🎒 se dejan las mochilas</b>' : p.mochila==='recoge' ? '<b>🎒 se recogen las dos mochilas</b>' : p.mochila==='recogeB' ? '<b>🎒 se recoge la mochila de sostenimiento</b>' : p.mochila==='recogeA' ? '<b>🎒 se recoge la mochila de asalto</b>' : ''].filter(Boolean).join(' · ');
    vista.innerHTML = `${encabezado(m, R)}
      <h2>Resumen</h2>${kpis(R)}
      ${malos.length ? `<div class="alerta">${malos.length} punto${malos.length===1 ? '' : 's'} sin coordenada o cota válida (${malos.map(p=>esc(p.nombre || 'quiebre')).join(', ')}): sus tramos no se calcularon.</div>` : ''}
      ${R.avisos.map(a=>`<div class="alerta">${esc(a)}</div>`).join('')}
      ${R.res.lejos ? `<div class="alerta">Hay puntos a más de 4° del meridiano central de la zona ${R.zona}: revisa la zona UTM de trabajo.</div>` : ''}
      <h2>Cuadro de marcha y navegación</h2>
      ${tablaCuadro(m, R)}
      <div class="tramos-cel">${filas.map(({p, ll, sig, acum, tac})=>p.ev ? `<div class="tc"><div class="cab"><b>${esc(p.nombre)}</b><span class="hora">${ll ? M.verHora(ll.llegada) : 'sale ' + M.verHora(R.res.partida)}</span></div>
          ${sig ? `<div class="datos"><div><span>Rumbo al sig.</span><b class="rumbo">${f(sig.azM, 0)}°</b> <small>${sig.mils} ‰</small></div><div><span>Distancia</span>${f(sig.dist)} m</div><div><span>Tiempo</span>${M.verDur(sig.t)}</div><div><span>Velocidad · ritmo</span>${velCelda(sig)}</div>
            <div><span>Desnivel</span>${sig.dv>0 ? '+' : ''}${f(sig.dv)} m</div><div><span>Pendiente</span>${f(sig.pte*100, 1)} %</div><div><span>Acumulado</span>${f(acum/1000, 2)} km · ${M.verDur(tac)}</div></div>` : `<div class="nota">Término · ${f(acum/1000, 2)} km · ${M.verDur(tac)} de marcha</div>`}
          ${ll && p.clave ? `<div class="tc-ev">${evento(p.clave)}</div>` : ''}${obs(p, ll) ? `<div class="nota" style="margin-top:6px">${obs(p, ll)}</div>` : ''}</div>`
        : `<div class="tc quiebre">↳ quiebre · ${ll ? M.verHora(ll.llegada) : ''} · ${f(p.cota)} m${sig ? ` · rumbo <b>${f(sig.azM, 0)}°</b> / ${sig.mils} ‰ · ${f(sig.dist)} m` : ''}</div>`).join('')}</div>

      ${apoyo(R)}
      <p class="nota">Rumbos magnéticos con declinación ${f(R.decl.valor, 2)}° (${esc(R.decl.fuente)}) a la fecha de la marcha. Horas con ${Math.round(R.par.altos*100)} % de altos; los imprevistos (${M.verDur(R.res.imprev)}) quedan como reserva al final.
        Los quiebres (puntos de ruta) van en gris; los datos «al siguiente» son del tramo que sale de ese punto.
        Velocidad y ritmo del tramo en movimiento (sin altos); toca uno para escribir otro (✎ = escrito a mano).
        ${R.conLuz ? 'Luz al llegar: ☀ día · ◐ crepúsculo · ☾ noche con luna · ● noche sin luna' + (R.tramos.some(t=>t.noche) ? '; los tramos de noche (☾/●) se calcularon con velocidad de noche' : '') + '. Detalle en la pestaña <b>Luz</b>.' : ''}</p>
      <div class="btns no-imp"><button class="btn pri" id="bImp">📄 Documento / orden gráfica</button><button class="btn" id="bPerf">Ver perfil ›</button><button class="btn" id="bEnv">Enviar ›</button></div>`;
    $('#bImp').onclick = ()=>documento(); $('#bPerf').onclick = ()=>ir('perfil'); $('#bEnv').onclick = ()=>ir('enviar');
    // escribir la velocidad o el ritmo de un tramo (vacío = volver al cálculo)
    vista.querySelectorAll('[data-vel]').forEach(x=>x.onclick = ()=>{ const i = +x.dataset.vel, P = m.puntos[i], t = T.find(z=>z.iB===i); if(!P || !t) return;
      const v = prompt(`Velocidad del tramo ${t.de} → ${t.a} (ahora ${M.verVel(t.v)} · ${M.verRitmo(t.v)}).\nEscribe km/h (p. ej. 3,5) o ritmo en min/km (p. ej. 18:30 o «18 min»).\nVacío = volver al cálculo.`, P.vel ? f(+P.vel, 2) : '');
      if(v===null) return; const k = M.leerVel(v); if(String(v).trim() && !k) return aviso('No entendí la velocidad');
      if(k) P.vel = Math.round(k*1000)/1000; else delete P.vel; guardar(); const y = window.scrollY; vCuadro(); window.scrollTo(0, y); aviso(k ? 'Tramo a ' + M.verVel(k) + ' · ' + M.verRitmo(k) : 'Tramo con la velocidad calculada'); });
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
    const filas = MATERIAL.map(g=>{ const its = g.items.map(([id, n, cant, nota])=>{ const v = cantMat(m, c, cant); if(v===null || v===undefined) return null;
        return {id, n:String((Mt[id] || {}).nombre || '').trim() || n, n0:n, auto:String(v), nota:nota(c)}; }).filter(Boolean);
      return its.length ? {g:g.g, its} : null; }).filter(Boolean);
    if(extra.length) filas.push({g:'Otros (agregados por mí)', its:extra.map((x, i)=>({id:'x' + i, n:x.n, auto:x.cant || '', nota:x.modo==='i' ? 'por hombre' : 'de la unidad', propio:i}))});
    // orden por línea de equipamiento (por defecto) o por tipo de elemento
    {   // siempre por línea de equipo (se quitó el orden «por tipo de elemento», pedido del usuario)
      const pmo = R.carga || pesoMaterial(m, R), conPuesto = new Set(pmo ? pmo.items.filter(x=>x.puesto).map(x=>x.id) : []);
      const noCarga = it=>it.propio===undefined && (PESOS[it.id] || [0, 'c'])[1]==='x', L = {1:[], 2:[], 5:[], 3:[], 4:[], x:[], esp:[]};
      const esEsp = it=>conPuesto.has(it.id) || ESPECIAL.has(it.id);
      filas.forEach(({g, its})=>its.forEach(it=>L[esEsp(it) ? 'esp' : noCarga(it) ? 'x' : lineaDe(m, it.id)].push(Object.assign({}, it, {tipo:g}))));
      const porLinea = ORDEN_LINEAS.map(l=>({g:Uso.civil() ? LINEAS[l] : LINEAS[l] + ' — ' + LINEAS_TXT[l], linea:l, its:L[l]})).filter(x=>x.its.length || x.linea<4 || !papel);
      porLinea.forEach(x=>x.parte = 'lineas');
      if(L.esp.length) porLinea.push({g:'Equipo especial común de la patrulla — lo lleva un puesto o rota entre todos', its:L.esp, parte:'resto'});
      if(L.x.length) porLinea.push({g:'Datos y planificación (no se cargan)', its:L.x, parte:'resto'});
      filas.length = 0; porLinea.forEach(x=>filas.push(x));
    }
    if(!papel) return {c, filas, html:fichasMaterial(m, R, filas), lineas:fichasMaterial(m, R, filas.filter(x=>x.parte!=='resto')), resto:fichasMaterial(m, R, filas.filter(x=>x.parte==='resto'))};
    return {c, filas, html:filas.map(({g, its})=>`<h3 class="${papel ? 'doc-h3' : 'mat-g'}">${esc(g)}</h3><table class="t mat"><tbody>
      ${its.map(it=>{ const st = Mt[it.id] || {}; return `<tr class="${st.ok ? 'hecho' : ''}"><td class="tx ck">${papel ? (st.ok ? '☑' : '☐') : `<input type="checkbox" data-mt="${it.id}" ${st.ok ? 'checked' : ''}>`}</td>
        <td class="tx"><b>${esc(it.n)}</b>${it.nota ? `<span class="s">${esc(it.nota)}</span>` : ''}</td>
        <td class="cant">${papel ? esc(st.cant || it.auto) : `<input class="num" data-mc="${it.id}" value="${esc(st.cant || '')}" placeholder="${esc(it.auto)}">`}</td>
        <td class="kg">${(()=>{ const pz = PESOS[it.id] || [0, 'c'], kg0 = it.propio!==undefined ? '' : pz[0], noCarga = pz[1]==='x';
          return noCarga ? '<span class="s">no se carga</span>' : papel ? (st.kg || kg0) + ' kg' : `<input class="num" data-mk="${it.id}" value="${esc(st.kg || '')}" placeholder="${kg0} kg c/u" inputmode="decimal">`; })()}</td>
        <td class="lin">${(PESOS[it.id] || [0, 'c'])[1]==='x' ? '' : papel ? LINEAS[lineaDe(m, it.id)] : `<select data-ml="${it.id}" aria-label="Línea">${ORDEN_LINEAS.map(l=>`<option value="${l}"${lineaDe(m, it.id)===l ? ' selected' : ''}>${LINEAS[l].replace(' línea', '')}</option>`).join('')}</select>`}</td>
        ${papel ? '' : `<td>${it.propio!==undefined ? `<button class="btn mini peligro" data-mx="${it.propio}" aria-label="Quitar">✕</button>` : ''}</td>`}</tr>`; }).join('')}
      </tbody></table>`).join('')};
  }
  // unidad de medida de una cantidad («4,5 L», «6 pares», «3» = unidades) y su nombre en singular para el peso
  const UNI1 = {L:'L', pares:'par', 'juego(s)':'juego', juegos:'juego', sobres:'sobre', 'kit(s)':'kit', equipos:'equipo', u:'unidad'};
  const unidadDe = t=>{ const x = /^[\d.,+\s]+(.*)$/.exec(String(t || '').trim()); const u = x && x[1].trim(); return u || 'u'; };
  // en pantalla: una ficha por elemento, del ancho del teléfono: cantidad con su unidad × kg por unidad = kg (total y por hombre)
  // qué es cada línea, en el selector de línea de cada elemento (v0.99.6)
  const LINEA_OPC = {1:'1.ª línea · en el cuerpo y cinturón', 2:'2.ª línea · arma, casco, SPB o arnés', 5:'3.ª A · mochila de asalto', 3:'3.ª B · mochila de sostenimiento', 4:'4.ª · vehículo (no se carga)'};
  const mfAbiertos = new Set();
  const matAbiertas = ()=>{ try { const v = localStorage.getItem('burros_matlin'); return v==='todas' ? 'todas' : JSON.parse(v || '[]'); } catch(e){ return []; } };
  function fichasMaterial(m, R, filas){
    const Mt = m.material || {}, pm = R.carga || pesoMaterial(m, R), porId = {}; (pm ? pm.items : []).forEach(x=>porId[x.id] = x);
    // contenedores (cinturón de carga y SPB) con lo que llevan dentro: una sola ficha con el peso del conjunto; el contenido va adentro, plegado
    const agrupar = (its, ficha)=>{
      const grupos = Object.entries(CONTENEDORES).map(([k, C])=>({k, C, cont:its.find(i=>i.id===C.id), dentro:its.filter(i=>enDe(m, i.id)===k)})).filter(g=>g.cont);
      const fuera = new Set(grupos.flatMap(g=>g.dentro));
      return its.filter(i=>!fuera.has(i)).map(i=>{ const g = grupos.find(x=>x.cont===i); if(!g) return ficha(i);
        const kg = [g.cont, ...g.dentro].reduce((t, x)=>t + ((porId[x.id] || {}).porHombre || 0), 0), T = {cinturon:['Cinturón de carga completo', 'el cinturón y lo que lleva en las baleras y el morral', 'el cinturón'],
          spb:['SPB completo', 'porta placas, placas y lo que lleva en las baleras y bolsillos', 'el SPB'], arnes:['Arnés o sistema de carga completo', 'el arnés y lo que lleva', 'el arnés']}[g.k];
        return `<div class="mf-grupo"><div class="mf-grupo-t">${T[0]}: <b>${f(kg, 1)} kg por hombre</b> <small>(${T[1]})</small></div>
          ${ficha(g.cont)}${g.dentro.length ? `<details class="mf-dentro-d"><summary class="mf-dentro-t">Va en ${T[2]} (${g.dentro.length}): ${esc(g.dentro.map(x=>x.n.split(/[:(]/)[0].trim()).join(', '))}</summary><div class="mf-dentro">${g.dentro.map(ficha).join('')}</div></details>` : ''}</div>`; }).join('');
    };
    // dónde va un elemento individual (uso militar): en el SPB, en el cinturón o suelto (con su línea)
    const vaEn = (it, x)=>Uso.civil() || !x || (x.modo!=='i' && x.modo!=='h') || Object.values(CONTENEDORES).some(C=>C.id===it.id) ? '' : (()=>{ const e = enDe(m, it.id);
      return `<select data-men="${it.id}" aria-label="Va en"><option value="spb"${e==='spb' ? ' selected' : ''}${sinSPBde(m) ? ' disabled' : ''}>Va en el SPB</option><option value="arnes"${e==='arnes' ? ' selected' : ''}${conArnesDe(m) ? '' : ' disabled'}>Va en el arnés</option><option value="cinturon"${e==='cinturon' ? ' selected' : ''}>Va en el cinturón</option><option value="-"${!e ? ' selected' : ''}>Suelto (elige la línea)</option></select>`; })();
    // cada línea se pliega con su total (v0.99.22, etapa 3): se abre solo la que se ajusta; burros_matlin recuerda las abiertas ('todas' = todas)
    const ab = matAbiertas();
    return filas.map(({g, its, linea})=>`<details class="mat-lin" data-mlg="${esc(linea || g)}"${ab==='todas' || (ab.includes && ab.includes(String(linea || g))) ? ' open' : ''}><summary>${(()=>{ const [t, sub] = String(g).split(' — '), nIt = its.filter(it=>!(Mt[it.id] || {}).no).length;
        const kg = linea && pm ? f(pm.lineas[linea], 1) + ' kg' : '', nota = linea===4 ? 'no se suma' : (linea===3 || linea===5) && pm && pm.sinMochila ? 'se deja' : linea===3 && pm && pm.mochilaModo==='solo' ? 'no se lleva' : '';
        return `<span class="ml-t"><h3 class="mat-g">${esc(t)}</h3>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="ml-k">${kg ? `<b>${kg}</b>` : ''}<small>${nota ? nota + ' · ' : ''}${nIt} elemento${nIt===1 ? '' : 's'}</small></span>`; })()}</summary>
      ${linea && linea!==4 && pm ? `<div class="mat-pl"><label>Peso de la línea sin detallar los elementos <span class="mf-c"><input class="num" data-pl="${linea}" value="${esc((m.par.pesoLinea || {})[linea] || '')}" placeholder="${f(pm.lineasCalc[linea], 1)}" inputmode="decimal" aria-label="kg por hombre"><em>kg por hombre</em></span></label>
        <small>${(m.par.pesoLinea || {})[linea] ? '<b>reemplaza</b> la suma de los elementos (' + f(pm.lineasCalc[linea], 1) + ' kg)' + (linea===2 ? '; incluye el agua' : '') : 'vacío = la suma de los elementos de abajo'}</small></div>` : ''}
      <div class="mat-lista">${its.length ? '' : '<p class="nota">Sin elementos en esta línea.</p>'}${agrupar(its, it=>{
      const st = Mt[it.id] || {}, pz = PESOS[it.id] || [0, 'c'], noCarga = pz[1]==='x', kg0 = it.propio!==undefined ? '' : pz[0];
      const u = unidadDe(st.cant || it.auto), u1 = UNI1[u] || u.replace(/s$/, ''), x = porId[it.id], n = pm ? pm.n : 1;
      const total = x ? x.q*x.kg : 0, num0 = String(it.auto).replace(/[^\d.,+].*$/, '').trim() || it.auto;
      // individual: se escribe y se calcula por hombre; de grupo: total de la unidad repartido; agua: ya es por hombre
      const indiv = x && x.modo==='i', fq = v=>f(v, v%1 ? 1 : 0);
      const g = x && x.puesto ? pm.especial.find(e=>e.key===x.puesto) : null, pt = x && x.modo==='c' ? portDe(m, it.id) : null;
      const pesoTxt = noCarga ? '<span class="mf-nc">no se carga</span>' : g ? `<b>${f(x.porPortador, x.porPortador<1 ? 2 : 1)} kg</b><small>por portador</small>` : x ? `<b>${f(x.porHombre, x.porHombre<1 ? 2 : 1)} kg</b><small>por hombre</small>` : '';
      const botones = `<span class="mf-op">${it.propio===undefined ? `<button class="btn mini" data-mnom="${it.id}" title="Cambiar el nombre" aria-label="Cambiar el nombre">✎</button>` : ''}<button class="btn mini" data-mno="${it.id}">${st.no ? '↺ Se lleva' : 'No se lleva'}</button></span>`;
      if(st.no) return `<div class="mf mf-no"><div class="mf1"><span class="mf-n"><b>${esc(it.n)}</b><small>no se lleva en esta marcha</small></span>${botones}</div></div>`;
      // una fila por elemento (v0.99.22, etapa 3): cantidad y peso en una línea; se abre al tocarla para cambiar cantidad, peso o dónde va
      const cantTxt = indiv ? (st.cantH!==undefined && st.cantH!=='' ? st.cantH : st.cant ? fq(numCant(st.cant)/n) : fq(numCant(num0)/n)) + ' ' + (u==='u' ? 'por hombre' : u + ' por hombre') : (st.cant || num0) + (u==='u' ? '' : ' ' + u) + (x && x.modo==='c' ? ' para la unidad' : '');
      const abierta = ab==='todas' || mfAbiertos.has(it.id);
      return `<div class="mf${st.ok ? ' hecho' : ''}${abierta ? ' abierta' : ''}">
        <label class="mf1"><input type="checkbox" data-mt="${it.id}" ${st.ok ? 'checked' : ''}><span class="mf-n"><b>${esc(it.n)}</b>${it.nota ? `<small>${esc(it.nota)}</small>` : ''}</span><span class="mf-kg">${pesoTxt}</span></label>
        <button type="button" class="mf-res" data-mfed="${it.id}"><span class="r1">${esc(String(cantTxt))}${noCarga ? '' : ' · ' + esc(String(st.kg || kg0).replace('.', ',')) + ' kg c/u'}</span> <span class="ed">✎ cambiar</span><span class="ce">▴ Listo</span></button>
        <div class="mf2">${indiv ? `<span class="mf-c"><input class="num" data-mch="${it.id}" value="${esc(st.cantH!==undefined && st.cantH!=='' ? st.cantH : st.cant ? fq(numCant(st.cant)/n) : '')}" placeholder="${fq(numCant(num0)/n)}" inputmode="decimal" aria-label="Cantidad por hombre"><em>${esc(u==='u' ? 'unid.' : u)} por hombre</em></span>`
          : `<span class="mf-c"><input class="num" data-mc="${it.id}" value="${esc(st.cant || '')}" placeholder="${esc(num0)}" inputmode="decimal" aria-label="Cantidad"><em>${esc(u==='u' ? 'unid.' : u)}${x && x.modo==='c' ? ' para la unidad' : ''}</em></span>`}
          ${noCarga ? '' : `<span class="mf-x">×</span><span class="mf-c"><input class="num" data-mk="${it.id}" value="${esc(st.kg || '')}" placeholder="${String(kg0).replace(".", ",")}" inputmode="decimal" aria-label="kg por ${esc(u1)}"><em>${u1==='unidad' ? 'kg c/u' : 'kg/' + esc(u1)}</em></span>
          <span class="mf-x">=</span><span class="mf-t">${indiv ? f(x.porHombre, x.porHombre<10 ? 1 : 0) + ' kg <small>por hombre</small>' : f(total, total<10 ? 1 : 0) + ' kg' + (x && x.modo==='c' && n>1 ? ' <small>en total</small>' : '')}</span>
          ${vaEn(it, x)}${enDe(m, it.id) ? '' : `<select data-ml="${it.id}" aria-label="Línea">${ORDEN_LINEAS.map(l=>`<option value="${l}"${lineaDe(m, it.id)===l ? ' selected' : ''}>${LINEA_OPC[l]}</option>`).join('')}</select>`}`}
          ${botones}${it.propio!==undefined ? `<button class="btn mini peligro" data-mx="${it.propio}" aria-label="Quitar">✕</button>` : ''}</div>
        ${pt && !noCarga ? `<div class="mf2 mf-port"><label>Lo lleva <select data-pp="${it.id}"><option value="rota"${pt.rota ? ' selected' : ''}>Rotan entre todos</option>${Object.entries(PUESTOS).filter(([k])=>!Uso.civil() || k==='otro' || (OMES[k] && OMES[k].civil) || (!pt.rota && pt.puesto===k)).map(([k, nm])=>`<option value="${k}"${!pt.rota && pt.puesto===k ? ' selected' : ''}>${esc(nm)}</option>`).join('')}</select></label>
          ${pt.rota ? '' : `<span class="mf-c"><input class="num" data-pn="${it.id}" value="${esc(((st.port || {}).n) || '')}" placeholder="${g ? g.n : 1}" inputmode="numeric" aria-label="Portadores"><em>portador(es)</em></span>`}
          ${!pt.rota && pt.puesto==='otro' ? `<input data-pnom="${it.id}" value="${esc(pt.nombre)}" placeholder="nombre del puesto" aria-label="Nombre del puesto" style="flex:1 1 140px">` : ''}</div>` : ''}
        ${it.tipo ? `<div class="mf-s mf-tipo">${esc(it.tipo)}</div>` : ''}
        ${x && x.modo==='h' ? '<div class="mf-s">litros al partir (1 kg por litro + envase); se bebe en el camino' + (m.par.reabast==='si' ? ' y se repone en los puntos de agua' : '') + '</div>' : g ? `<div class="mf-s">${f(total, 1)} kg que lleva${g.n===1 ? ' 1 portador' : 'n ' + g.n + ' portadores'} (${esc(g.nombre.toLowerCase())})${g.n===1 ? '' : ', repartido'}: ${f(x.porPortador, 1)} kg cada uno</div>`
          : x && x.modo==='c' && n>1 ? `<div class="mf-s">rota entre todos: ${f(total, 1)} kg repartidos entre ${n} hombres = ${f(x.porHombre, 2)} kg por hombre</div>`
          : indiv && n>1 ? `<div class="mf2 mf-port"><label>Lo llevan <span class="mf-c"><input class="num" data-ll="${it.id}" value="${esc(st.llevan || '')}" placeholder="${n}" inputmode="numeric" aria-label="Cuántos lo llevan"><em>de ${n}</em></span></label></div>
          <div class="mf-s">en la unidad: ${fq(x.q)} ${esc(u==='u' ? 'unid.' : u)} · ${f(total, 1)} kg${x.llevan<n ? ' — lo llevan ' + x.llevan + ' de ' + n + ' (cuenta entero para ellos)' : ' (' + n + ' hombres)'}</div>` : ''}</div>`; })}
      ${linea ? `<div class="mf mf-nuevo"><div class="mf2" style="margin-left:0"><input data-an="${linea}" placeholder="Agregar a la ${LINEAS[linea]}: nombre" aria-label="Nombre">
        <span class="mf-c"><input class="num" data-ac="${linea}" placeholder="1" inputmode="decimal" aria-label="Cantidad"><em>cant.</em></span><span class="mf-c"><input class="num" data-ak="${linea}" placeholder="kg" inputmode="decimal" aria-label="kg c/u"><em>kg c/u</em></span>
        <select data-am="${linea}" aria-label="Cómo se lleva"><option value="i">por hombre (cada uno lleva uno)</option><option value="c"${linea===4 ? ' selected' : ''}>de la unidad (se reparte)</option></select><button class="btn mini pri" data-aa="${linea}">＋ Agregar</button></div></div>` : ''}</div></details>`).join('');
  }
  /* puesto de cada integrante (pedido del usuario): una fila por hombre con su puesto; los hombres de cada puesto se cuentan de ahí */
  function integrantesHtml(m, R){
    const pm = R.carga || pesoMaterial(m, R); if(!pm || pm.unidad) return '';
    const n = Math.max(1, Math.round(+m.par.efectivo || 0)); if(!(+m.par.efectivo>0)) return '';
    const P = (pm.puestos || []).filter(o=>OMES[o.key] || o.propio!==undefined), on = !!m.par.porIntegrante, I = m.integrantes || [];
    return `<details class="tarjeta integ"${on ? ' open' : ''}><summary>¿Quién es cada integrante?<span class="res">${on ? 'puesto elegido por integrante' : 'contando hombres por puesto'}</span></summary>
      ${on ? `<p class="nota">Elige el puesto de cada uno. Los que no cambies son fusileros o patrulleros.</p>
        <div class="integ-lista">${Array.from({length:n}, (_, i)=>`<label class="integ-f"><span>${i + 1}.</span><select data-int="${i}">${P.map(o=>`<option value="${o.base ? 'fusilero' : o.key}"${(I[i] || 'fusilero')===(o.base ? 'fusilero' : o.key) ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>`).join('')}</div>
        <div class="btns"><button class="btn mini" id="intNo">Volver a contar hombres por puesto</button></div>`
      : `<p class="nota">Hoy se escribe cuántos hombres hay en cada puesto. También puedes elegir el puesto de <b>cada integrante</b> (útil con pocos hombres, por ejemplo 1, 2 o 3).</p>
        <div class="btns"><button class="btn" id="intSi">Elegir el puesto de cada integrante (${n})</button></div>`}</details>`;
  }
  /* peso de la unidad: solo los kg de cada línea de cada integrante (nada más: sin agua ni equipo aparte) */
  function unidadHtml(m, R){
    const pm = R.carga || pesoMaterial(m, R); if(!pm || !pm.unidad) return '';
    if(!pm.hay) return '<div class="tarjeta vacio">Indica el efectivo (Datos → Unidad y columna) para tener una fila por integrante.</div>';
    const U = m.pesoUnidad || [], Ls = [1, 2, 5, 3], forma = formaUnidad(m);
    const seg = `<div class="seg" style="margin-bottom:8px"><button data-uforma="balanza" class="${forma==='balanza' ? 'on' : ''}">En la balanza (total de cada uno)</button><button data-uforma="lineas" class="${forma==='lineas' ? 'on' : ''}">Por líneas</button></div>`;
    if(forma==='balanza') return `<div class="tarjeta">${seg}<p class="nota">Cada integrante se sube a la balanza <b>con todo su equipo</b> (agua, munición, mochilas) y luego <b>sin equipo</b>:
        la diferencia es su carga. Si pesas solo el equipo, escríbelo en «Con todo» y deja «Sin equipo» vacío. El tiempo se calcula con <b>el más cargado</b>.
        Carga promedio de la unidad: <b>${f(pm.promedio, 1)} kg</b>.</p>
      <div class="tabla-env"><table class="t sop"><thead><tr><th class="tx">Integrante</th><th>Con todo (kg)</th><th>Sin equipo (kg)</th><th>Carga</th></tr></thead><tbody>
      ${pm.integrantes.map(x=>`<tr class="${pm.mas===x ? 'mas' : ''}"><td class="tx"><input data-pun="${x.i}" value="${esc((U[x.i] || {}).nombre || '')}" placeholder="Integrante ${x.i + 1}" aria-label="Nombre o puesto" style="width:100%;min-width:110px">${pm.mas===x ? ' <b class="mas-tag">más cargado</b>' : ''}</td>
        <td><input class="num" data-pu="${x.i}|con" value="${esc((U[x.i] || {}).con || '')}" placeholder="100" inputmode="decimal" aria-label="Peso con todo el equipo"></td>
        <td><input class="num" data-pu="${x.i}|sin" value="${esc((U[x.i] || {}).sin || '')}" placeholder="75" inputmode="decimal" aria-label="Peso sin equipo"></td><td><b>${f(x.total, 1)} kg</b></td></tr>`).join('')}
      </tbody></table></div></div>`;
    return `<div class="tarjeta">${seg}<p class="nota">Escribe cuánto pesa <b>cada línea de cada integrante</b>, ya con todo lo que lleva (agua, munición, equipo especial). La app no agrega nada:
        el tiempo se calcula con <b>el más cargado</b>. Promedio de la unidad: <b>${f(pm.promedio, 1)} kg</b>.</p>
      <div class="btns" style="margin:0 0 8px"><button class="btn mini" id="puCopiar">Copiar la fila 1 a todos los vacíos</button></div>
      <div class="tabla-env"><table class="t sop"><thead><tr><th class="tx">Integrante</th>${Ls.map(l=>`<th>${esc(LINEAS[l].replace(' línea', ''))}</th>`).join('')}<th>Total</th></tr></thead><tbody>
      ${pm.integrantes.map(x=>`<tr class="${pm.mas===x ? 'mas' : ''}"><td class="tx"><input data-pun="${x.i}" value="${esc((U[x.i] || {}).nombre || '')}" placeholder="Integrante ${x.i + 1}" aria-label="Nombre o puesto" style="width:100%;min-width:110px">${pm.mas===x ? ' <b class="mas-tag">más cargado</b>' : ''}</td>
        ${Ls.map(l=>`<td><input class="num" data-pu="${x.i}|${l}" value="${esc((U[x.i] || {})[l] || '')}" placeholder="0" inputmode="decimal" aria-label="${esc(LINEAS[l])}"></td>`).join('')}<td><b>${f(x.total, 1)}</b></td></tr>`).join('')}
      </tbody></table></div></div>`;
  }
  /* peso según SOP: los kg de cada línea de cada puesto, directo (sin los elementos). Vacío = lo del fusilero; en gris, lo que da el detalle */
  function sopHtml(m, R){
    const pm = R.carga || pesoMaterial(m, R); if(!pm || !pm.sop) return '';
    const S = m.sop || {}, Ls = [1, 2, 5, 3];
    return `<div class="tarjeta"><p class="nota">Escribe los <b>kilos por hombre</b> de cada línea según el SOP de tu unidad, <b>sin el agua</b>: el agua calculada (${f(pm.aguaKg, 1)} kg) se suma sola en la ${esc(LINEAS[pm.aguaL])}.
        Una casilla vacía vale <b>lo que muestra en gris</b>: lo que da el detalle por elementos (si cambias el fusilero, los demás puestos se mueven igual). El agua y el equipo especial común (lo que rota entre todos y lo asignado al puesto) se suman solos: se ven en sus columnas antes del total.</p>
      <div class="tabla-env"><table class="t sop"><thead><tr><th class="tx">Puesto</th><th>Hombres</th>${Ls.map(l=>`<th>${esc(LINEAS[l].replace(' línea', ''))}</th>`).join('')}<th>+ Agua</th><th>+ Equipo especial</th><th>Total</th></tr></thead><tbody>
      ${pm.puestos.filter(o=>OMES[o.key] || o.propio!==undefined).map(o=>{ const k = o.base ? 'fusilero' : o.key, st = (m.ome || {})[o.key] || {};
        return `<tr class="${pm.mas===o ? 'mas' : ''}"><td class="tx">${esc(o.nombre)}${pm.mas===o ? ' <b class="mas-tag">más cargado</b>' : ''}</td>
          <td>${o.base || o.porInt ? (pm.hay ? (o.base ? pm.fusileros : o.n) : '—') : `<input class="num" data-on="${o.key}" value="${esc(o.propio!==undefined ? ((m.omeExtra || [])[o.propio] || {}).cantidad || '' : st.n!==undefined ? st.n : '')}" placeholder="${Math.max(o.nDef, o.n || 0)}" inputmode="numeric" aria-label="Hombres">`}</td>
          ${Ls.map(l=>`<td><input class="num" data-sop="${k}|${l}" value="${esc((S[k] || {})[l] || '')}" placeholder="${f(pm.usa(k, l), 1)}" inputmode="decimal" aria-label="${esc(LINEAS[l])}"></td>`).join('')}
          <td class="sop-x">${f(o.aguaKg || 0, 1)}</td><td class="sop-x">${f(o.espKg || 0, 1)}</td>
          <td><b>${o.n>0 || o.base ? f(o.total, 1) : '—'}</b></td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }
  /* puestos u OME: cuántos hombres cumplen cada puesto y el equipo que llevan además del común (o en reemplazo) */
  function puestosHtml(m, R){
    const pm = R.carga || pesoMaterial(m, R); if(!pm) return '';
    const lista = pm.puestos.filter(o=>OMES[o.key] || o.propio!==undefined), nomComun = id=>{ const x = pm.items.find(y=>y.id===id); return x ? x.n.replace(/ \(.*\)$/, '').toLowerCase() : id; };
    const selL = (attr, v)=>`<select ${attr} aria-label="Línea">${ORDEN_LINEAS.map(l=>`<option value="${l}"${v===l ? ' selected' : ''}>${LINEAS[l].replace(' línea', '')}</option>`).join('')}</select>`;
    const abP = matAbiertas(), maxP = pm.especial.length ? Math.max(...pm.especial.map(g=>g.total - (pm.fusilero ? pm.fusilero.total : pm.comun))) : 0;
    return `<details class="tarjeta puestos-ome" data-mlg="ome"${abP==='todas' || (abP.includes && abP.includes('ome')) ? ' open' : ''}><summary><span class="ml-t"><b>Puestos (OME)</b><small>${pm.especial.length ? pm.especial.length + ' puesto' + (pm.especial.length===1 ? '' : 's') + ' con equipo propio' : 'todos iguales: nadie con equipo propio'}</small></span>${maxP>0 ? `<span class="ml-k"><b>+${f(maxP, 1)} kg</b><small>el que más</small></span>` : ''}</summary><h3>Puestos (OME)</h3>
      <p class="nota">Todos llevan el <b>equipo común</b> (las líneas de abajo). Cada puesto lleva además su equipo, o en reemplazo de algo común. Los puestos son eventuales:
        escribe cuántos hombres lo cumplen (0 = no hay). Los pesos son <b>estimados</b>: corrígelos con los de tu unidad.</p>
      ${lista.map(o=>{ const st = o.propio!==undefined ? (m.omeExtra || [])[o.propio] || {} : (m.ome || {})[o.key] || {};
        return `<details class="ome"${!o.base && o.n>0 ? ' open' : ''}><summary>${esc(o.nombre)}<span class="res">${o.base ? (pm.hay ? pm.fusileros + ' hombres (el resto) · ' + f(o.total, 1) + ' kg' : 'el resto') : o.n ? o.n + ' hombre' + (o.n===1 ? '' : 's') + ' · ' + f(o.total, 1) + ' kg' : 'no hay'}</span></summary>
          ${o.recibe && o.recibe.length ? `<p class="nota">Lleva además, de otros puestos: ${o.recibe.map(r=>'<b>' + esc(r.n.replace(/ \(.*\)$/, '')) + '</b> (de ' + esc(r.de.toLowerCase()) + ') ' + f(r.kg, 1) + ' kg').join(' · ')} por hombre.</p>` : ''}
          ${o.base ? '<p class="nota">Lleva el equipo común (las líneas de abajo) y lo que le pasen otros puestos.</p>' : `<div class="campos">
            ${o.porInt ? `<div class="c"><span>Hombres en este puesto</span><b class="mono">${o.n}</b><small>según «¿Quién es cada integrante?»</small></div>` : ''}<label class="c"${o.porInt ? ' hidden' : ''}>Hombres en este puesto<input class="num" data-on="${o.key}" value="${esc(o.propio!==undefined ? st.cantidad || '' : st.n!==undefined ? st.n : '')}" placeholder="${Math.max(o.nDef, o.n || 0)}" inputmode="numeric"></label>
            ${o.propio!==undefined ? `<label class="c">Nombre del puesto<input data-onom="${o.propio}" value="${esc(st.n || '')}"></label><div class="c"><span>&nbsp;</span><button class="btn mini peligro" data-oborra="${o.propio}">Quitar puesto</button></div>` : ''}</div>
            ${o.pareja ? `<p class="nota">Trabaja en pareja con el <b>${esc(o.pareja.toLowerCase())}</b>: por defecto, tantos hombres como ese puesto.</p>` : ''}
            ${o.reemplaza.length ? `<p class="nota">En reemplazo de: <b>${esc(o.reemplaza.map(nomComun).join(' y '))}</b> del equipo común.</p>` : ''}
            ${Object.keys(o.quita).length ? `<p class="nota">Lleva menos: ${esc(Object.entries(o.quita).map(([id, k])=>k + ' ' + nomComun(id)).join(', '))}.</p>` : ''}
            <div class="mat-lista">${o.kit.map(k=>`<div class="mf${k.quitar ? ' hecho' : ''}"><div class="mf-n"><b>${esc(k.n)}</b>${k.quitar ? '<small>no se lleva en esta marcha</small>' : ''}</div><div class="mf2" style="margin-left:0">
              ${k.propio ? `<span class="mf-t">${f(k.cant, k.cant%1 ? 1 : 0)} × ${f(k.kg, 2)} kg</span>` : `<span class="mf-c"><input class="num" data-okc="${o.key}|${k.id}" value="${esc(((st.kit || {})[k.id] || {}).cant || '')}" placeholder="${k.cant0}" inputmode="decimal" aria-label="Cantidad"><em>unid.</em></span>
              <span class="mf-x">×</span><span class="mf-c"><input class="num" data-okk="${o.key}|${k.id}" value="${esc(((st.kit || {})[k.id] || {}).kg || '')}" placeholder="${String(k.kg0).replace('.', ',')}" inputmode="decimal" aria-label="kg c/u"><em>kg c/u</em></span>`}
              <span class="mf-x">=</span><span class="mf-t">${f(k.cant*k.kg, 1)} kg</span>
              ${k.propio ? '' : selL(`data-okl="${o.key}|${k.id}"`, k.linea)}
              ${k.propio || k.quitar ? '' : `<select data-oka="${o.key}|${k.id}" aria-label="Lo lleva"><option value="">Lo lleva este puesto</option><option value="fusilero"${k.a==='fusilero' ? ' selected' : ''}>Lo llevan los fusileros (se lo reparten)</option>${lista.filter(x=>!x.base && x.key!==o.key).map(x=>`<option value="${x.key}"${k.a===x.key ? ' selected' : ''}>Lo lleva: ${esc(x.nombre.toLowerCase())}</option>`).join('')}<option value="rota"${k.a==='rota' ? ' selected' : ''}>Se reparte entre todos</option></select>`}
              ${k.a && !k.quitar ? `<div class="mf-s" style="flex-basis:100%;margin:0">→ ${k.a==='rota' ? 'se reparte entre todos los hombres' : k.a==='fusilero' ? 'lo llevan los fusileros (' + (pm.fusileros || 0) + ')' : 'lo lleva ' + esc((lista.find(x=>x.key===k.a) || {nombre:'otro puesto'}).nombre.toLowerCase())}: ${f(k.cant*k.kg*o.n, 1)} kg en total${k.a!=='rota' && (lista.find(x=>x.key===k.a) || {}).n===0 && k.a!=='fusilero' ? ' <b style="color:var(--rojo)">(ese puesto no tiene hombres)</b>' : ''}</div>` : ''}
              <button class="btn mini${k.quitar ? '' : ' peligro'}" data-okq="${o.key}|${k.id}"${k.propio ? ` data-okprop="${k.id.slice(1)}"` : ''}>${k.propio ? '✕' : k.quitar ? '↺ Se lleva' : 'No se lleva'}</button></div></div>`).join('')}
              <div class="mf mf-nuevo"><div class="mf2" style="margin-left:0"><input data-oan="${o.key}" placeholder="Agregar al equipo de ${esc(o.nombre.toLowerCase())}" aria-label="Nombre">
                <span class="mf-c"><input class="num" data-oac="${o.key}" placeholder="1" inputmode="decimal" aria-label="Cantidad"><em>unid.</em></span><span class="mf-c"><input class="num" data-oak="${o.key}" placeholder="kg" inputmode="decimal" aria-label="kg c/u"><em>kg c/u</em></span>
                ${selL(`data-oal="${o.key}"`, 2)}<button class="btn mini pri" data-oaa="${o.key}">＋ Agregar</button></div></div></div>`}
        </details>`; }).join('')}
      <div class="campos" style="margin-top:10px"><label class="c ancho">Otro puesto (zapador, jefe de patrulla, guía…)<input id="omeNuevo" placeholder="nombre del puesto"></label><div class="c"><span>&nbsp;</span><button class="btn" id="omeAgregar">＋ Agregar puesto</button></div></div></details>`;
  }
  // carga por hombre: peso base + material individual + parte del colectivo; con la opción de usarla en el cálculo de tiempos
  function cargaHtml(m, R){
    const pm = R.carga || pesoMaterial(m, R); if(!pm) return '';
    const top = pm.items.filter(x=>x.porHombre>0).slice(0, 5).map(x=>esc(x.n) + ' ' + f(x.porHombre, 1) + ' kg').join(' · ');
    const L = LIMITES_CARGA, ref = (v, lim)=>`<div class="s" style="color:var(--${v>lim ? 'rojo' : 'verde'})">${v>lim ? 'sobre' : 'bajo'} la referencia de ${lim} kg</div>`;
    return `<div class="tarjeta carga"><h3>Carga por hombre</h3>
      <div class="kpis">
        <div class="kpi ocre"><div class="k">${pm.mas ? 'El más cargado al partir' : 'Total por hombre al partir'}</div><div class="v">${f(pm.total, 1)} <small>kg</small></div>${pm.mas ? `<div class="s"><b>${esc(pm.mas.nombre)}</b>: con esta carga se calcula el tiempo</div>` : ''}<div class="s">${pm.balanza ? 'según la balanza' : pm.sinMochila ? 'sin mochila (se deja la 3.ª línea)' : 'con mochila'}${pm.final!==undefined && Math.abs(pm.final - pm.total)>0.05 ? ' · al llegar ' + f(pm.final, 1) + ' kg' : ''}</div></div>
        ${pm.balanza ? `<div class="kpi"><div class="k">Carga promedio de la unidad</div><div class="v">${f(pm.promedio, 1)} <small>kg</small></div><div class="s">pesada en la balanza (sin detalle por líneas)</div></div>` : [1, 2, 5, 3].map(l=>`<div class="kpi"${(l===3 || l===5) && pm.sinMochila || l===3 && pm.mochilaModo==='solo' ? ' style="opacity:.5"' : ''}><div class="k">${LINEAS[l]}</div><div class="v">${f(pm.lineas[l], 1)} <small>kg</small></div><div class="s">${esc(LINEAS_TXT[l])}${l===3 && pm.sinMochila ? ' · <b>se deja</b>' : ''}</div></div>`).join('')}</div>
      ${(()=>{ const ab = matAbiertas(); return `<details class="carga-det" data-mlg="carga"${ab==='todas' || (ab.includes && ab.includes('carga')) ? ' open' : ''}><summary>Detalle y opciones de la carga <small>carga de cada puesto, límites de referencia, mochila, agua y ración</small></summary>`; })()}
      ${pm.especial.length ? `<h4 class="carga-h">Carga de cada puesto (por línea)</h4><div class="tabla-env"><table class="t puestos"><thead><tr><th class="tx">Puesto</th><th>H.</th>${[1, 2, 5, 3].map(l=>`<th>${LINEAS[l].replace(' línea', '')}</th>`).join('')}<th>Total</th></tr></thead><tbody>
        ${[Object.assign({}, pm.fusilero || {nombre:PUESTOS.fusilero, lineas:pm.lineas, total:pm.comun}, {n:pm.fusileros, fus:true})].concat(pm.especial.slice().sort((a, b)=>b.total - a.total)).map(g=>`<tr class="${pm.mas===g || (g.fus && pm.mas===pm.fusilero) ? 'mas' : ''}"><td class="tx">${esc(g.nombre)}${pm.mas===g || (g.fus && pm.mas===pm.fusilero) ? ' <b class="mas-tag">más cargado</b>' : ''}${g.fus ? '<small>equipo común</small>' : g.reemplaza && g.reemplaza.length ? '<small>sin fusil</small>' : ''}</td>
          <td>${pm.hay ? g.n : '—'}</td>${[1, 2, 5, 3].map(l=>`<td>${f(g.lineas[l] || 0, 1)}</td>`).join('')}<td><b>${f(g.total, 1)} kg</b></td></tr>`).join('')}
        </tbody></table></div>
        <p class="nota">Todos llevan el equipo común; cada puesto lleva además su equipo (o en reemplazo, como la ametralladora en lugar del fusil) y su parte del equipo especial.
          El tiempo de la marcha se calcula con <b>el más cargado</b>.${pm.hay && pm.portadores>pm.n ? ' <b style="color:var(--rojo)">Hay más hombres en puestos (' + pm.portadores + ') que el efectivo (' + pm.n + ').</b>' : ''}</p>` : ''}
      ${Uso.civil() ? (()=>{ const pc = +String(m.par.pesoCorp || '').replace(',', '.') || 0, pct = pc ? pm.total/pc*100 : null;
        return `<div class="kpis"><div class="kpi"><div class="k">Porcentaje de tu peso</div><div class="v">${pct===null ? '—' : f(pct, 0) + ' <small>%</small>'}</div>
          <div class="s" style="color:var(--${pct===null ? 'tenue' : pct>25 ? 'rojo' : pct>20 ? 'ocre' : 'verde'})">${pct===null ? 'escribe tu peso corporal' : pct>25 ? 'sobre el 25 %: demasiado pesado' : pct>20 ? 'entre 20 y 25 %: pesado' : 'hasta 20 %: recomendable'}</div></div>
          <div class="kpi"><div class="k">Peso corporal (kg)</div><div class="v"><input class="num" id="mtPeso" inputmode="decimal" value="${esc(m.par.pesoCorp || '')}" placeholder="ej. 70" style="width:90px"></div><div class="s">promedio del grupo</div></div></div>
        <p class="nota">Referencia habitual en montaña: la mochila no debería pasar del <b>20 %</b> del peso de quien la lleva (hasta un 25 % en travesías de varios días). Es solo una referencia.</p>`; })() : pm.balanza ? `<p class="nota">Referencia: carga de combate hasta unos ${L.combate} kg; carga de marcha de aproximación hasta unos ${L.marcha} kg (manual de marchas a pie de EE.UU.).</p>` : `<div class="kpis">
        <div class="kpi"><div class="k">Carga de combate (1.ª + 2.ª)</div><div class="v">${f(pm.combate, 1)} <small>kg</small></div>${ref(pm.combate, L.combate)}</div>
        <div class="kpi"><div class="k">Carga de marcha (1.ª + 2.ª + 3.ª)</div><div class="v">${f(pm.marcha, 1)} <small>kg</small></div>${pm.marcha>L.marcha + 21 ? '<div class="s" style="color:var(--rojo)">carga de emergencia: marcha lenta, evitar el contacto</div>' : ref(pm.marcha, L.marcha)}</div></div>
      <p class="nota">Límites <b>referenciales</b> (manual de marchas a pie de EE.UU.): carga de combate hasta unos ${L.combate} kg; carga de marcha de aproximación hasta unos ${L.marcha} kg.
        ${pm.lineas[4] ? `4.ª línea (vehículo o apoyo): ${f(pm.lineas[4], 1)} kg por hombre, <b>no se suma</b>.` : '4.ª línea: lo que va en vehículos o con el apoyo logístico; no la carga el hombre (elige «4.ª» en un elemento para dejarlo ahí).'}</p>`}
      <div class="campos">
        ${!Uso.civil() ? '' : `<label class="c ancho"><span><input type="checkbox" id="mtPern" ${m.par.pernocta ? 'checked' : ''} style="width:auto;vertical-align:middle"> <b>Con pernocta</b> (saco, aislante, carpa, cocinilla, olla y aseo)</span></label>`}
        ${Uso.civil() ? '' : `<label class="c ancho"><span><input type="checkbox" id="mtMochila" ${m.par.sinMochila ? 'checked' : ''} style="width:auto;vertical-align:middle"> <b>Se deja la mochila</b> (toda la marcha solo con la 1.ª y 2.ª línea, sin ninguna mochila; p. ej. carrera de combate)</span></label>`}
        <label class="c ancho">Mochila de asalto o de misión<select id="mtMochModo"><option value="dentro"${(m.par.mochilaModo || 'dentro')==='dentro' ? ' selected' : ''}>Va dentro de la de sostenimiento</option><option value="separadas"${m.par.mochilaModo==='separadas' ? ' selected' : ''}>Las dos por separado</option><option value="solo"${m.par.mochilaModo==='solo' ? ' selected' : ''}>Solo la mochila de asalto (sin la de sostenimiento)</option></select></label>
        <label class="c">Reabastecimiento de agua en ruta<select id="mtReab"><option value="no"${m.par.reabast!=='si' ? ' selected' : ''}>No: se carga toda el agua</option><option value="si"${m.par.reabast==='si' ? ' selected' : ''}>Sí, en puntos de agua</option></select></label>
        <label class="c">Ración de combate<select id="mtRac"><option value="24"${m.par.racion!=='12' ? ' selected' : ''}>De 24 horas (3 comidas, ≈ 1,3 kg)</option><option value="12"${m.par.racion==='12' ? ' selected' : ''}>De 12 horas (2 comidas, ≈ 0,9 kg)</option></select></label>
        <label class="c">Otro peso por hombre (kg)<input class="num" id="mtBase" inputmode="decimal" value="${esc(m.par.cargaBase || '')}" placeholder="no listado"></label></div>
      <p class="nota">Esta carga se usa en toda la marcha: tiempos de cada tramo, calor y descansos. ${m.par.cargaManual ? '<b style="color:var(--ocre)">Ahora la carga está escrita a mano (Datos → Cálculo de tiempos).</b>' : ''}
        ${Uso.civil() ? 'Lo que sirve a todo el grupo (radio, botiquín grande, cuerda, carpas) va en «Equipo especial de la patrulla» y se reparte.' : 'El fusil, la munición, el casco y los chalecos están en la lista (Armamento y protección); el equipo que sirve a toda la unidad, en «Equipo especial de la patrulla».'} Usa «Otro peso» solo para lo que no esté en la lista${!Uso.civil() && +String(m.par.cargaBase || '').replace(',', '.')>0 ? ` — <b style="color:var(--ocre)">si ahí habías escrito el fusil, casco y chaleco, bórralo para no contarlos dos veces</b>` : ''}.
        Material de grupo repartido: ${f(pm.colect, 1)} kg por hombre, entre ${pm.hay ? pm.n + ' hombres' : '1 hombre: indica el efectivo en Datos → Unidad y columna'}. Más pesado por hombre: ${top || '—'}.
        Los pesos son <b>sugeridos</b>: cámbialos en «kg» de cada elemento. El agua de reabastecimiento en ruta no se suma.</p></details></div>`;
  }
  function vMaterial(){
    const m = actual(), R = M.calcular(m);
    if(!R.tramos.length){ vista.innerHTML = '<div class="tarjeta vacio">Completa la ruta para calcular el material.</div>'; return; }
    const H = htmlMaterial(m, R), tot = H.filas.reduce((a, g)=>a + g.its.length, 0), hechos = ()=>H.filas.reduce((a, g)=>a + g.its.filter(it=>(m.material||{})[it.id] && m.material[it.id].ok).length, 0);
    // paso 1: qué marcha es (v0.99.22, etapa 3; pedido del usuario: las patrullas duran de 24 h a los días necesarios → se multiplica por los días)
    const TIPOS = [['patrulla', 'Patrulla', 'raciones, baterías y calcetines por cada día; con pernocta (saco, carpa, cocinilla)'], ['invierno', 'Montaña en invierno', 'como la patrulla, más ropa de frío, gorro, guantes, lentes y polainas'],
      ['instruccion', 'Marcha de instrucción', 'equipo de combate sin munición ni granadas'], ['', 'Según la ruta', 'lo que corresponde a la duración y al terreno de la marcha (como hasta ahora)']];
    const tipo = m.par.tipoMat || '', conDias = tipo==='patrulla' || tipo==='invierno';
    vista.innerHTML = `<h2>Material para la marcha</h2>
      <h3 class="mat-parte">1. ¿Qué marcha es?</h3>
      <div class="tarjeta mat-tipo">${TIPOS.filter(([k])=>!Uso.civil() || k!=='instruccion').map(([k, n, d])=>`<button class="mt-op${tipo===k ? ' on' : ''}" data-tipo-mat="${k}"><span class="rd"></span><span><b>${n}</b><small>${d}</small></span></button>`).join('')}
        ${conDias ? `<label class="c mt-dias">Días de la ${tipo==='invierno' ? 'actividad' : 'patrulla'}<input class="num" id="mtDias" inputmode="numeric" value="${esc(m.par.dias || '')}" placeholder="1"><small>las raciones, baterías y calcetines se multiplican por los días</small></label>` : ''}</div>
      <h3 class="mat-parte">2. ¿Cómo se calcula el peso?</h3>
      <div class="seg" style="margin-bottom:8px"><button data-modo-carga="detalle" class="${m.par.modoCarga!=='sop' ? 'on' : ''}">Detallado por elementos</button><button data-modo-carga="sop" class="${m.par.modoCarga==='sop' ? 'on' : ''}">Por peso según SOP</button><button data-modo-carga="unidad" class="${m.par.modoCarga==='unidad' ? 'on' : ''}">Por peso de la unidad</button></div>
      <p class="nota" id="mtCuenta"></p>
      ${m.par.modoCarga==='sop' || m.par.modoCarga==='unidad' ? '' : `<div class="seg seg-vt" style="margin:6px 0"><button data-vt="0" class="${m.par.verTodo ? '' : 'on'}">Solo lo que corresponde</button><button data-vt="1" class="${m.par.verTodo ? 'on' : ''}">Todo el equipo</button></div>`}
      <div class="info">Calculado para <b>${H.c.hay ? H.c.n + ' hombres' : '1 hombre (indica el efectivo en Datos → Unidad y columna)'}</b>, ${M.verDur(H.c.horas)} de marcha y ${f(H.c.km, 1)} km${H.c.noche ? ', con ' + Math.round(H.c.noche*100) + ' % de noche' : ''}.
        El agua sale de la tabla de calor (${H.c.calorDato ? 'con el índice WBGT indicado' : 'sin índice WBGT: se usa calor bajo'}); las demás cantidades son <b>sugerencias</b>: escribe la tuya si la orden dice otra cosa.
        Aparecen solo los elementos que corresponden (noche, montaña, nieve, calor).</div>
      <h3 class="mat-parte">Carga de cada hombre</h3>
      ${cargaHtml(m, R)}
      ${integrantesHtml(m, R)}
      ${m.par.modoCarga==='unidad' ? `<h3 class="mat-parte">Peso de cada integrante</h3>${unidadHtml(m, R)}` : m.par.modoCarga==='sop' ? `<h3 class="mat-parte">3. Peso de cada puesto según SOP</h3>${sopHtml(m, R)}` : `<h3 class="mat-parte">3. Equipo que llevan todos (por línea)</h3>
      <div class="tarjeta">${H.lineas}</div>
      <h3 class="mat-parte">4. Equipo de cada puesto (OME)</h3>
      ${puestosHtml(m, R)}`}
      ${H.resto && m.par.modoCarga!=='unidad' ? `<h3 class="mat-parte">${m.par.modoCarga==='sop' ? '4' : '5'}. Equipo especial común</h3><div class="tarjeta">${H.resto}</div>` : ''}
      ${m.par.modoCarga==='unidad' ? '<div class="btns"><button class="btn pri" id="mtDoc">📄 Documento con la carga</button></div>' : `      <div class="tarjeta"><div class="campos"><label class="c ancho">Agregar otro elemento<input id="mtNuevo" placeholder="Ej: pala de campaña"></label><label class="c">Cantidad<input id="mtNuevoC" placeholder="Ej: 4"></label><label class="c">kg c/u<input id="mtNuevoK" placeholder="Ej: 1,2" inputmode="decimal"></label></div>
        <div class="btns"><button class="btn" id="mtAgregar">＋ Agregar</button><button class="btn" id="mtLimpia">Desmarcar todo</button><button class="btn pri" id="mtDoc">📄 Documento con el material</button></div></div>`}`;
    const cuenta = ()=>$('#mtCuenta').innerHTML = `<b>${hechos()} de ${tot}</b> listos.`; cuenta();
    const Mt = ()=>m.material || (m.material = {});
    vista.querySelectorAll('[data-mt]').forEach(x=>x.onchange = ()=>{ const o = Mt()[x.dataset.mt] || (Mt()[x.dataset.mt] = {}); o.ok = x.checked; x.closest('tr,.mf').classList.toggle('hecho', x.checked); guardar(); cuenta(); });
    let tC = null; const recarga = ()=>{ clearTimeout(tC); tC = setTimeout(()=>{ const y = window.scrollY, a = document.activeElement && document.activeElement.dataset; const foco = a && (a.ll ? '[data-ll="' + a.ll + '"]' : a.pu ? '[data-pu="' + a.pu + '"]' : a.sop ? '[data-sop="' + a.sop + '"]' : a.pl ? '[data-pl="' + a.pl + '"]' : a.on ? '[data-on="' + a.on + '"]' : a.okc ? '[data-okc="' + a.okc + '"]' : a.okk ? '[data-okk="' + a.okk + '"]' : a.pn ? '[data-pn="' + a.pn + '"]' : a.pnom ? '[data-pnom="' + a.pnom + '"]' : a.mch ? '[data-mch="' + a.mch + '"]' : a.mc ? '[data-mc="' + a.mc + '"]' : a.mk ? '[data-mk="' + a.mk + '"]' : document.activeElement.id ? '#' + document.activeElement.id : null);
      const ab = [...vista.querySelectorAll('details[open] > summary')].map(x=>x.firstChild.textContent);
      pintar(); vista.querySelectorAll('details > summary').forEach(x=>{ if(ab.includes(x.firstChild.textContent)) x.parentNode.open = true; });
      window.scrollTo(0, y); if(foco){ const e = vista.querySelector(foco); if(e){ e.focus(); const v = e.value; e.value = ''; e.value = v; } } }, 700); };
    vista.querySelectorAll('[data-mch]').forEach(x=>x.oninput = ()=>{ const o = Mt()[x.dataset.mch] || (Mt()[x.dataset.mch] = {}); o.cantH = x.value; delete o.cant; guardar(); recarga(); });
    vista.querySelectorAll('[data-mc]').forEach(x=>x.oninput = ()=>{ const o = Mt()[x.dataset.mc] || (Mt()[x.dataset.mc] = {}); o.cant = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-mno]').forEach(b=>b.onclick = ()=>{ const o = Mt()[b.dataset.mno] || (Mt()[b.dataset.mno] = {}); if(o.no) delete o.no; else o.no = true; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    vista.querySelectorAll('[data-mnom]').forEach(b=>b.onclick = ()=>{ const o = Mt()[b.dataset.mnom] || (Mt()[b.dataset.mnom] = {}); const v = prompt('Nombre del elemento (vacío = el nombre original)', o.nombre || '');
      if(v===null) return; if(v.trim()) o.nombre = v.trim(); else delete o.nombre; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    vista.querySelectorAll('[data-mfed]').forEach(b=>b.onclick = ()=>{ const c = b.closest('.mf'); c.classList.toggle('abierta'); if(c.classList.contains('abierta')) mfAbiertos.add(b.dataset.mfed); else mfAbiertos.delete(b.dataset.mfed); });
    vista.querySelectorAll('[data-vt]').forEach(b=>b.onclick = ()=>{ m.par.verTodo = b.dataset.vt==='1'; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    vista.querySelectorAll('[data-tipo-mat]').forEach(b=>b.onclick = ()=>{ m.par.tipoMat = b.dataset.tipoMat; if((b.dataset.tipoMat==='patrulla' || b.dataset.tipoMat==='invierno') && !(+m.par.dias>0)) m.par.dias = 1;
      guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    const md = $('#mtDias'); if(md) md.onchange = ()=>{ m.par.dias = String(Math.max(1, Math.round(+md.value.replace(',', '.') || 1))); guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    vista.querySelectorAll('details.mat-lin, details.carga-det, details.puestos-ome').forEach(d=>d.addEventListener('toggle', ()=>{ let a = matAbiertas(); if(a==='todas' && d.open) return; if(a==='todas') a = [...vista.querySelectorAll('details.mat-lin, details.carga-det, details.puestos-ome')].map(x=>x.dataset.mlg);
      const k = d.dataset.mlg; a = a.filter(x=>x!==k); if(d.open) a.push(k); try { localStorage.setItem('burros_matlin', JSON.stringify(a)); } catch(e){} }));
    vista.querySelectorAll('[data-men]').forEach(x=>x.onchange = ()=>{ const o = Mt()[x.dataset.men] || (Mt()[x.dataset.men] = {}); o.en = x.value; if(x.value!=='-') delete o.linea; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    vista.querySelectorAll('[data-ml]').forEach(x=>x.onchange = ()=>{ const o = Mt()[x.dataset.ml] || (Mt()[x.dataset.ml] = {}); o.linea = +x.value; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    vista.querySelectorAll('[data-mk]').forEach(x=>x.oninput = ()=>{ const o = Mt()[x.dataset.mk] || (Mt()[x.dataset.mk] = {}); o.kg = x.value; guardar(); recarga(); });
    const b = $('#mtBase'); if(b) b.oninput = ()=>{ m.par.cargaBase = b.value; guardar(); recarga(); };
    const mo = $('#mtMochila'); if(mo) mo.onchange = ()=>{ m.par.sinMochila = mo.checked; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    const pe = $('#mtPern'); if(pe) pe.onchange = ()=>{ m.par.pernocta = pe.checked; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    const pw = $('#mtPeso'); if(pw) pw.oninput = ()=>{ m.par.pesoCorp = pw.value; guardar(); recarga(); };
    // puestos (OME)
    const omeDe = k=>/^p\d+$/.test(k) ? (m.omeExtra || [])[+k.slice(1)] : ((m.ome || (m.ome = {}))[k] || (m.ome[k] = {}));
    const kitDe = (k, id)=>{ const o = omeDe(k); o.kit = o.kit || {}; return o.kit[id] || (o.kit[id] = {}); };
    const quieto = ()=>{ const y = window.scrollY; const ab = [...vista.querySelectorAll('details.ome[open] summary')].map(x=>x.firstChild.textContent); pintar(); window.scrollTo(0, y);
      vista.querySelectorAll('details.ome summary').forEach(x=>{ if(ab.includes(x.firstChild.textContent)) x.parentNode.open = true; }); };
    vista.querySelectorAll('[data-on]').forEach(x=>x.oninput = ()=>{ const k = x.dataset.on, o = omeDe(k); if(/^p\d+$/.test(k)) o.cantidad = x.value; else o.n = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-onom]').forEach(x=>x.oninput = ()=>{ m.omeExtra[+x.dataset.onom].n = x.value; guardar(); });
    vista.querySelectorAll('[data-oborra]').forEach(x=>x.onclick = ()=>{ m.omeExtra.splice(+x.dataset.oborra, 1); guardar(); quieto(); });
    vista.querySelectorAll('[data-okc]').forEach(x=>x.oninput = ()=>{ const [k, id] = x.dataset.okc.split('|'); kitDe(k, id).cant = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-okk]').forEach(x=>x.oninput = ()=>{ const [k, id] = x.dataset.okk.split('|'); kitDe(k, id).kg = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-okl]').forEach(x=>x.onchange = ()=>{ const [k, id] = x.dataset.okl.split('|'); kitDe(k, id).linea = +x.value; guardar(); quieto(); });
    vista.querySelectorAll('[data-oka]').forEach(x=>x.onchange = ()=>{ const [k, id] = x.dataset.oka.split('|'); kitDe(k, id).a = x.value; guardar(); quieto(); });
    vista.querySelectorAll('[data-okq]').forEach(x=>x.onclick = ()=>{ const [k, id] = x.dataset.okq.split('|');
      if(x.dataset.okprop!==undefined){ const o = omeDe(k), arr = /^p\d+$/.test(k) ? o.kit : o.extra; arr.splice(+x.dataset.okprop, 1); }
      else { const e = kitDe(k, id); e.quitar = !e.quitar; } guardar(); quieto(); });
    vista.querySelectorAll('[data-oaa]').forEach(x=>x.onclick = ()=>{ const k = x.dataset.oaa, n = vista.querySelector('[data-oan="' + k + '"]').value.trim(); if(!n) return aviso('Escribe el nombre del elemento');
      const it = {n, cant:vista.querySelector('[data-oac="' + k + '"]').value.trim() || '1', kg:vista.querySelector('[data-oak="' + k + '"]').value.trim(), linea:+vista.querySelector('[data-oal="' + k + '"]').value};
      const o = omeDe(k); if(/^p\d+$/.test(k)) (o.kit || (o.kit = [])).push(it); else (o.extra || (o.extra = [])).push(it); guardar(); quieto(); aviso('＋ ' + n); });
    const on = $('#omeAgregar'); if(on) on.onclick = ()=>{ const n = $('#omeNuevo').value.trim(); if(!n) return aviso('Escribe el nombre del puesto');
      (m.omeExtra || (m.omeExtra = [])).push({n, cantidad:'1', kit:[]}); guardar(); quieto(); aviso('＋ Puesto «' + n + '»'); };
    const mm = $('#mtMochModo'); if(mm) mm.onchange = ()=>{ m.par.mochilaModo = mm.value; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    const re = $('#mtReab'); if(re) re.onchange = ()=>{ m.par.reabast = re.value; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); if(re.value==='si') aviso('Marca los puntos de agua en la pestaña Datos'); };
    const ra = $('#mtRac'); if(ra) ra.onchange = ()=>{ m.par.racion = ra.value; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    vista.querySelectorAll('[data-mx]').forEach(x=>x.onclick = ()=>{ m.materialExtra.splice(+x.dataset.mx, 1); delete Mt()['x' + x.dataset.mx]; guardar(); pintar(); });
    if($('#mtAgregar')) $('#mtAgregar').onclick = ()=>{ const n = $('#mtNuevo').value.trim(); if(!n) return; (m.materialExtra || (m.materialExtra = [])).push({n, cant:$('#mtNuevoC').value.trim()});
      const k = $('#mtNuevoK').value.trim(); if(k){ const Mx = Mt(); Mx['x' + (m.materialExtra.length - 1)] = {kg:k}; } guardar(); pintar(); };
    const port = id=>{ const o = Mt()[id] || (Mt()[id] = {}); return o.port || (o.port = {}); };
    vista.querySelectorAll('[data-pp]').forEach(x=>x.onchange = ()=>{ const o = port(x.dataset.pp); if(x.value==='rota') o.rota = true; else { o.rota = false; o.puesto = x.value; }
      guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    vista.querySelectorAll('[data-pn]').forEach(x=>x.oninput = ()=>{ port(x.dataset.pn).n = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-pnom]').forEach(x=>x.oninput = ()=>{ port(x.dataset.pnom).nombre = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-int]').forEach(x=>x.onchange = ()=>{ (m.integrantes || (m.integrantes = []))[+x.dataset.int] = x.value; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    const iSi = $('#intSi'); if(iSi) iSi.onclick = ()=>{ // parte con lo que ya estaba contado por puesto
      const pm = R.carga || pesoMaterial(m, R), L = []; (pm.puestos || []).filter(o=>!o.base && o.n>0 && (OMES[o.key] || o.propio!==undefined)).forEach(o=>{ for(let k=0; k<o.n; k++) L.push(o.key); });
      const n = Math.max(1, Math.round(+m.par.efectivo || 1)); m.integrantes = Array.from({length:n}, (_, i)=>L[i] || 'fusilero'); m.par.porIntegrante = true; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    const iNo = $('#intNo'); if(iNo) iNo.onclick = ()=>{ m.par.porIntegrante = false; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); };
    vista.querySelectorAll('[data-ll]').forEach(x=>x.oninput = ()=>{ const o = Mt()[x.dataset.ll] || (Mt()[x.dataset.ll] = {}); o.llevan = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-pl]').forEach(x=>x.oninput = ()=>{ const o = m.par.pesoLinea || (m.par.pesoLinea = {}); o[x.dataset.pl] = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-modo-carga]').forEach(b=>b.onclick = ()=>{ m.par.modoCarga = b.dataset.modoCarga; guardar(); pintar(); });
    vista.querySelectorAll('[data-uforma]').forEach(b=>b.onclick = ()=>{ m.par.unidadForma = b.dataset.uforma; guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    const fila = i=>{ const U = m.pesoUnidad || (m.pesoUnidad = []); return U[i] || (U[i] = {}); };
    vista.querySelectorAll('[data-pu]').forEach(x=>x.oninput = ()=>{ const [i, l] = x.dataset.pu.split('|'); fila(+i)[l] = x.value; guardar(); recarga(); });
    vista.querySelectorAll('[data-pun]').forEach(x=>x.oninput = ()=>{ fila(+x.dataset.pun).nombre = x.value; guardar(); });
    const pc = $('#puCopiar'); if(pc) pc.onclick = ()=>{ const U = m.pesoUnidad || [], f0 = U[0] || {}, n = Math.max(1, Math.round(+m.par.efectivo || 1));
      for(let i=1; i<n; i++){ const f = fila(i); [1, 2, 5, 3].forEach(l=>{ if(f[l]===undefined || String(f[l]).trim()==='') f[l] = f0[l] || ''; }); } guardar(); pintar(); aviso('Fila 1 copiada a los vacíos'); };
    vista.querySelectorAll('[data-sop]').forEach(x=>x.oninput = ()=>{ const [k, l] = x.dataset.sop.split('|'), S = m.sop || (m.sop = {}); (S[k] || (S[k] = {}))[l] = x.value; guardar(); recarga(); });
    // agregar un elemento directo en una línea
    vista.querySelectorAll('[data-aa]').forEach(b=>b.onclick = ()=>{ const l = b.dataset.aa, n = vista.querySelector('[data-an="' + l + '"]').value.trim(); if(!n) return aviso('Escribe el nombre del elemento');
      const ex = m.materialExtra || (m.materialExtra = []), modo = vista.querySelector('[data-am="' + l + '"]').value;
      ex.push({n, cant:vista.querySelector('[data-ac="' + l + '"]').value.trim() || '1', modo}); const o = Mt()['x' + (ex.length - 1)] = {linea:+l};
      const k = vista.querySelector('[data-ak="' + l + '"]').value.trim(); if(k) o.kg = k;
      guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); aviso('＋ ' + n + ' en la ' + LINEAS[l]); });
    if($('#mtLimpia')) $('#mtLimpia').onclick = ()=>{ Object.values(Mt()).forEach(o=>o.ok = false); guardar(); pintar(); };
    $('#mtDoc').onclick = ()=>documento('material');
  }

  /* =====================================================================  LISTA  */
  /* =====================================================================  RESULTADO (plan / real y reseña)  */
  // horas reales: del registro de Seguir o anotadas a mano (sin GPS ni app en la marcha); la reseña la escribe el comandante
  const hhmm = ms=>{ const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const vr = v=>v>0 && isFinite(v) ? f(v, 1) + ' · ' + M.verRitmo(v).replace(' min/km', '') : '—';
  const difTxt = d=>d===null || d===undefined ? '—' : Math.abs(d)<1 ? 'a la hora' : (d>0 ? '+' : '−') + Math.round(Math.abs(d)) + ' min';
  const RESULTADOS = {cumplida:'Cumplida', parcial:'Cumplida parcialmente', no:'No cumplida'};
  function resultadoHtml(m, doc){
    const P = Seguir.plan(m), C = P && Resultado.calcular(m, P); if(!C) return doc ? '<p>La marcha aún no tiene horas reales.</p>' : '';
    const E = m.ejec, rs = m.resena || {}, cl = d=>d===null || d===undefined ? '' : d>5 ? 'sube' : d< -5 ? 'baja' : '';
    const kp = (k, v, s, c)=>`<div class="kpi${c ? ' ' + c : ''}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const dT = (C.durReal - C.durPlan)*60;
    let h = `<div class="kpis">${kp('Duración', M.verDur(C.durReal), 'plan ' + M.verDur(C.durPlan) + ' · ' + difTxt(dT), Math.abs(dT)>15 ? 'ocre' : '')}
        ${kp('En movimiento', M.verDur(C.movReal), 'plan ' + M.verDur(C.movPlan) + ' (tramos con hora real)')}
        ${kp('Altos y detenciones', M.verDur(C.altosReal), C.nAltos + ' alto(s) · plan ' + M.verDur(C.altosPlan))}
        ${kp('Velocidad en movimiento', C.vReal ? f(C.vReal, 1) + ' <small>km/h</small>' : '—', (C.vReal ? M.verRitmo(C.vReal) + ' · ' : '') + 'plan ' + vr(C.vPlan))}
        ${C.kmGps>50 ? kp('Recorrido GPS', f(C.kmGps/1000, 2) + ' <small>km</small>', 'ruta planificada ' + f(C.distRuta/1000, 2) + ' km') : ''}</div>
      ${Resultado.consejo(C) ? `<div class="info">${Resultado.consejo(C)}</div>` : ''}
      <div class="tabla-env"><table class="t res"><thead><tr><th class="tx">Evento</th><th>Hora plan</th><th>Hora real</th><th>Diferencia</th><th>Tramo plan / real</th><th>Velocidad plan<br>(km/h · min/km)</th><th>Velocidad real<br>(km/h · min/km)</th><th>Altos en el tramo</th></tr></thead><tbody>
      ${C.filas.map(r=>`<tr><td class="tx"><b>${esc(r.p.nombre)}</b>${r.p.clave ? ' <small>' + esc(r.p.clave) + '</small>' : ''}</td><td>${hhmm(r.plan)}</td>
        <td>${doc ? (r.real ? hhmm(r.real) : r.salta ? 'no marcado' : '—') : `<input type="time" class="num" data-hreal="${r.k}" value="${r.real ? hhmm(r.real) : ''}" style="width:118px">`}</td>
        <td class="${cl(r.dif)}">${r.k ? difTxt(r.dif) : 'partida'}</td><td>${r.dist ? M.verDur(r.tPlan) + ' / ' + M.verDur(r.tReal) : ''}</td><td>${r.dist ? vr(r.vPlan) : ''}</td>
        <td class="${r.vReal && r.vPlan ? (r.vReal/r.vPlan<0.85 ? 'sube' : r.vReal/r.vPlan>1.05 ? 'baja' : '') : ''}">${r.dist ? vr(r.vReal) : ''}</td><td>${r.altosReal>0.01 ? Math.round(r.altosReal*60) + ' min' : ''}</td></tr>`).join('')}
      </tbody></table></div>
      ${Object.keys(C.motivos).length ? `<p class="nota"><b>Altos por motivo:</b> ${Object.entries(C.motivos).map(([k, v])=>esc(k) + ' ' + Math.round(v) + ' min').join(' · ')}.</p>` : ''}
      ${(E.desvios || []).length ? `<p class="nota"><b>Desvíos:</b> ${E.desvios.map(x=>esc(x.nombre) + ' ' + hhmm(x.ini) + '–' + hhmm(x.fin) + ' (' + Math.round((x.fin - x.ini)/60000) + ' min' + (x.cancelado ? ', cancelado' : x.modo==='volver' ? ', ida y vuelta' : '') + ')').join(' · ')}.</p>` : ''}
      ${C.nov.length ? `<p class="nota"><b>Novedades:</b> ${C.nov.map(n=>hhmm(n.t) + ' ' + esc(n.txt)).join(' · ')}.</p>` : ''}`;
    if(doc) h += `<h3 class="doc-h3">Reseña</h3><table class="t"><tbody>
        <tr><td class="tx"><b>Resultado</b></td><td class="tx">${esc(RESULTADOS[rs.resultado] || '—')}</td></tr>
        ${[['texto', 'Qué pasó'], ['personal', 'Personal'], ['material', 'Material'], ['lecciones', 'Lecciones y recomendaciones']].map(([k, n])=>rs[k] ? `<tr><td class="tx"><b>${n}</b></td><td class="tx">${esc(rs[k]).replace(/\n/g, '<br>')}</td></tr>` : '').join('')}
        ${rs.autor ? `<tr><td class="tx"><b>Elaborado por</b></td><td class="tx">${esc(rs.autor)}</td></tr>` : ''}</tbody></table>
        ${E.manual ? '<p class="doc-nota">Horas reales anotadas a mano.</p>' : ''}`;
    return h;
  }
  // recorridos GPS de las veces anteriores (v0.99.10)
  const recorridosHtml = m=>(m.recorridos || []).length ? `<h2>Recorridos anteriores</h2><div class="tarjeta"><p class="nota">Los recorridos GPS de las veces anteriores que se hizo esta marcha (los 5 últimos).</p>
        ${m.recorridos.map((x, i)=>`<div class="btns" style="align-items:center"><span>${new Date(x.inicio).toLocaleDateString('es-CL')} ${hhmm(x.inicio)}${x.fin ? '–' + hhmm(x.fin) : ''} · ${x.track.length} lecturas</span><button class="btn mini" data-rver="${i}">🗺 Ver</button><button class="btn mini" data-rruta="${i}">🧭 Ruta nueva</button><button class="btn mini" data-rgpx="${i}">⬇ GPX</button><button class="btn mini peligro" data-rbor="${i}">Borrar</button></div>`).join('')}</div>` : '';
  function enlazarRecorridos(m){
    const nomA = (m.nombre || 'marcha').replace(/[^\w-]+/g, '_');
    vista.querySelectorAll('[data-rgpx]').forEach(b=>b.onclick = ()=>{ const x = m.recorridos[+b.dataset.rgpx]; descargar(nomA + '_recorrido_' + new Date(x.inicio).toISOString().slice(0, 10) + '.gpx', Seguir.gpx((m.nombre || '') + ' — recorrido ' + new Date(x.inicio).toLocaleDateString('es-CL'), x.track), 'application/gpx+xml'); });
    vista.querySelectorAll('[data-rruta]').forEach(b=>b.onclick = ()=>rutaDeRecorrido(m, m.recorridos[+b.dataset.rruta]));
    vista.querySelectorAll('[data-rver]').forEach(b=>b.onclick = ()=>{ Mapa.verRecorrido(+b.dataset.rver); ir('mapa'); });
    vista.querySelectorAll('[data-rbor]').forEach(b=>b.onclick = ()=>confirmar('¿Borrar ese recorrido guardado?', ()=>{ m.recorridos.splice(+b.dataset.rbor, 1); guardar(); pintar(); }));
  }
  function vResultado(){
    const m = actual(), P = Seguir.plan(m);
    if(!P){ vista.innerHTML = '<div class="tarjeta vacio">Faltan datos: la marcha necesita al menos dos puntos con coordenadas y cota.</div>'; return; }
    if(!m.ejec || !m.ejec.inicio){
      vista.innerHTML = `<h2>Resultado de la marcha</h2><div class="tarjeta"><p class="nota">Aquí se compara lo planificado con lo ejecutado y se escribe la reseña.
          Se llena solo al usar la pestaña <b>Seguir</b> durante la marcha. Si la marcha se hizo sin la app, anota las horas reales a mano.</p>
        <div class="campos"><label class="c">Hora real de partida<input type="time" id="rPart" value="${esc(m.hora || '')}"></label></div>
        <div class="btns"><button class="btn pri" id="rManual">✎ Anotar las horas reales a mano</button><button class="btn" id="rSeguir">Ir a Seguir</button></div></div>${recorridosHtml(m)}`;
      enlazarRecorridos(m);
      $('#rSeguir').onclick = ()=>ir('seguir');
      $('#rManual').onclick = ()=>{ const v = $('#rPart').value || m.hora || '08:00', d = new Date((m.fecha || new Date().toISOString().slice(0, 10)) + 'T' + v + ':00');
        m.ejec = {estado:'fin', manual:true, inicio:d.getTime(), fin:null, llegadas:{}, altos:[], nov:[], track:[], msgs:[]}; guardar(); pintar(); };
      return;
    }
    const rs = m.resena || (m.resena = {}), E = m.ejec;
    vista.innerHTML = `<h2>Resultado de la marcha</h2>
      <p class="nota">${E.manual ? 'Horas reales anotadas a mano' : 'Del registro de Seguir'}: partida real ${hhmm(E.inicio)}${E.fin ? ' · término ' + hhmm(E.fin) : E.manual ? '' : ' · marcha en curso'}.
        Puedes corregir o completar cualquier hora real. La velocidad es en movimiento (sin los altos).</p>
      ${resultadoHtml(m, false)}
      <h2>Reseña</h2><div class="tarjeta"><div class="campos">
        <label class="c">Resultado<select data-rs="resultado"><option value="">—</option>${Object.entries(RESULTADOS).map(([k, n])=>`<option value="${k}"${rs.resultado===k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="c">Elaborado por<input data-rs="autor" value="${esc(rs.autor || '')}" placeholder="grado y nombre"></label>
        ${[['texto', 'Qué pasó (desarrollo de la marcha)', 'hechos principales, cambios de ruta, clima…'], ['personal', 'Personal', 'lesionados, ampollas, agotamiento, rezagados'],
           ['material', 'Material', 'fallas, pérdidas, lo que sobró o faltó'], ['lecciones', 'Lecciones y recomendaciones', 'qué cambiar en la próxima marcha']].map(([k, n, ph])=>
          `<label class="c ancho">${n}<textarea data-rs="${k}" rows="3" placeholder="${ph}">${esc(rs[k] || '')}</textarea></label>`).join('')}</div></div>
      ${recorridosHtml(m)}
      <div class="btns"><button class="btn pri" id="rDoc">📄 Documento con el resultado</button>${(E.track || []).length>1 ? '<button class="btn" id="rMapa">🗺 Ver el recorrido en el mapa</button><button class="btn" id="rGpx">⬇ Recorrido (GPX)</button><button class="btn" id="rRuta">🧭 Guardar como ruta nueva</button>' : ''}
        ${E.manual ? '<button class="btn peligro" id="rBorrar">Borrar las horas anotadas</button>' : '<button class="btn peligro" id="rDesc">🗑 Descartar esta marcha (que no quede registrada)</button>'}</div>`;
    vista.querySelectorAll('[data-rs]').forEach(x=>x.oninput = ()=>{ rs[x.dataset.rs] = x.value; guardar(); });
    vista.querySelectorAll('[data-hreal]').forEach(x=>x.onchange = ()=>{ const k = +x.dataset.hreal;
      if(!x.value){ if(k) delete E.llegadas[k]; } else { const [hh, mm] = x.value.split(':').map(Number), d = new Date(E.inicio); d.setHours(hh, mm, 0, 0);
        let t = d.getTime(); if(k && t<E.inicio - 36e5) t += 864e5;   // pasó la medianoche
        if(k===0) E.inicio = t; else E.llegadas[k] = t;
        if(E.manual){ const ult = Math.max(0, ...Object.values(E.llegadas).filter(v=>v>0)); E.fin = ult || null; } }
      guardar(); const y = window.scrollY; pintar(); window.scrollTo(0, y); });
    $('#rDoc').onclick = ()=>documento('resultado');
    const mp = $('#rMapa'); if(mp) mp.onclick = ()=>{ Mapa.verRecorrido(-1); ir('mapa'); };
    const nomA = (m.nombre || 'marcha').replace(/[^\w-]+/g, '_'), gp = $('#rGpx');
    const rr = $('#rRuta'); if(rr) rr.onclick = ()=>rutaDeRecorrido(m, E);
    if(gp) gp.onclick = ()=>descargar(nomA + '_recorrido.gpx', Seguir.gpx((m.nombre || '') + ' — recorrido real', E.track), 'application/gpx+xml');
    enlazarRecorridos(m);
    const bd = $('#rDesc'); if(bd) bd.onclick = ()=>confirmar('¿Descartar esta marcha? Se borran las horas, los altos, las novedades y el recorrido GPS de esta vez; no queda en el resultado ni en los recorridos guardados. Los mensajes ya enviados al C2 no se pueden retirar.',
      ()=>{ delete m.ejec; guardar(); pintar(); aviso('🗑 Marcha descartada: no quedó registrada'); });
    const bo = $('#rBorrar'); if(bo) bo.onclick = ()=>confirmar('¿Borrar las horas reales anotadas?', ()=>{ delete m.ejec; guardar(); pintar(); });
  }
  // matriz de eventos (v0.99.18, pedido del usuario: verla en Cuadro): cada punto de control con su nombre clave y hora planificada; con
  // la marcha en curso o terminada, la hora real y la diferencia (≈ estimada, saltado), y los altos y novedades registrados
  function vMatriz(){
    const m = actual(), R = M.calcular(m);
    if(!R.tramos.length){ vista.innerHTML = '<div class="tarjeta vacio">Faltan datos: la marcha necesita al menos dos puntos con coordenadas y cota.</div>'; return; }
    vista.innerHTML = `<h2>Matriz de eventos</h2><p class="nota">Los puntos de control en orden de marcha, con su nombre clave para la radio y la hora planificada.
        Durante la marcha (pestaña Seguir) se completan la hora real y la diferencia con el plan.</p>
      <div class="tabla-env">${Documento.matrizHtml(apiMapa, m, R)}</div>
      <div class="btns"><button class="btn" id="mxDoc">📄 Documento con la matriz</button>${m.ejec && m.ejec.inicio && !m.ejec.manual ? '<button class="btn" id="mxSeg">Ir a Seguir</button>' : ''}</div>`;
    $('#mxDoc').onclick = ()=>documento('matriz'); const sg = $('#mxSeg'); if(sg) sg.onclick = ()=>ir('seguir');
  }
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
  /* Enviar en tres pasos (pedido del usuario): 1) qué marcha(s), 2) a quién (destino, no formato), 3) un solo botón «Enviar».
     En el teléfono abre el menú Compartir con el texto o el archivo; en el computador descarga o copia. Recuerda el último destino (S.envDest). */
  const DESTINOS = {
    c2:{n:'C2 TOQUI', d:'Archivo KML que el TOQUI abre como calco (botón 🌍 KML/GPX → importar)', mil:true},
    msg:{n:'Mensaje por radio o chat', d:'Texto del plan con código (el código lo lee otra Burros) o QR', una:true},
    tel:{n:'Otro teléfono con Burros', d:'La marcha completa (archivo, código o QR)'},
    gps:{n:'GPS de mano o Wikiloc', d:'Archivo GPX'},
    atak:{n:'ATAK', d:'Archivo KML (Import Manager → archivo local)'},
    earth:{n:'Google Earth o el graficador', d:'Archivo KML'},
    excel:{n:'Excel', d:'Cuadro de marcha (CSV)', una:true},
    doc:{n:'Imprimir o adjuntar', d:'Documento PDF o JPG', una:true},
    wsp:{n:'WhatsApp o correo', d:'Resumen en texto + archivo GPX'},
    contacto:{n:'Contacto de emergencia', d:'Plan de ruta con hora límite', una:true, civ:true}};
  async function compartirArchivo(nombre, texto, tipo, titulo, mensaje){
    try { const f = new File([texto], nombre, {type:tipo});
      if(navigator.canShare && navigator.canShare({files:[f]})){ await navigator.share(Object.assign({files:[f], title:titulo}, mensaje ? {text:mensaje} : {})); return 'compartido'; } } catch(e){ if(e && e.name==='AbortError') return 'cancelado'; }
    descargar(nombre, texto, tipo); if(mensaje) await copiar(mensaje); return 'descargado';
  }
  function vEnviar(){
    const civil = Uso.civil(), dests = Object.entries(DESTINOS).filter(([, d])=>civil ? !d.mil : !d.civ);
    const lista = S.marchas.map(m=>{ let R = null; try { R = M.calcular(m); } catch(e){} return {m, R, ok:!!(R && R.tramos.length)}; });
    if(!S.envSel || !S.envSel.some(id=>lista.some(x=>x.m.id===id && x.ok))) S.envSel = actual() ? [actual().id] : [];
    S.envSel = S.envSel.filter(id=>lista.some(x=>x.m.id===id && x.ok));
    if(!S.envDest || !dests.some(([k])=>k===S.envDest)) S.envDest = civil ? 'contacto' : 'c2';
    const sel = lista.filter(x=>S.envSel.includes(x.m.id)), D = DESTINOS[S.envDest], muchas = sel.length>1 && D.una;
    vista.innerHTML = `<h2>① ¿Qué marcha?</h2>
      <div class="tarjeta env-lista">${lista.length ? lista.map(x=>`<label class="env-m${x.ok ? '' : ' no'}"><input type="checkbox" data-env="${x.m.id}" ${S.envSel.includes(x.m.id) ? 'checked' : ''} ${x.ok ? '' : 'disabled'}>
          <span><b>${esc(x.m.nombre)}</b><small>${esc([x.m.unidad, x.m.fecha ? x.m.fecha.split('-').reverse().join('-') : '', x.m.hora, x.ok ? km(x.R.res.dist) + ' km · ' + M.verDur(x.R.res.total) : 'faltan datos de la ruta'].filter(Boolean).join(' · '))}</small></span>
          ${x.ok ? `<button class="btn mini" data-ver="${x.m.id}">Ver</button>` : ''}</label>`).join('') : '<p class="nota">No hay marchas guardadas.</p>'}</div>
      <h2>② ¿A quién?</h2>
      <div class="formatos env-dest">${dests.map(([k, d])=>`<button class="btn${S.envDest===k ? ' on' : ''}" data-dest="${k}"><b>${esc(d.n)}</b><small>${esc(d.d)}${d.una ? ' · una marcha' : ' · una o varias'}</small></button>`).join('')}</div>
      <h2>③ Enviar</h2>
      <div class="tarjeta" id="envPaso3">
        ${!sel.length ? '<p class="nota">Marca al menos una marcha arriba.</p>' : muchas ? `<div class="alerta">«${esc(D.n)}» admite una sola marcha: deja marcada solo una.</div>` : ''}
        ${S.envDest==='contacto' && sel.length===1 ? `<div class="campos"><label class="c">Si no hay noticias a las<input type="time" id="cvLim" value="${esc(sel[0].m.par.horaAviso || M.verHora((sel[0].R.res.termino || 0) + 1).slice(0, 5))}"></label>
          <label class="c">Teléfono del grupo<input id="cvTel" value="${esc(sel[0].m.par.contacto || '')}" placeholder="opcional" inputmode="tel"></label></div>` : ''}
        ${(S.envDest==='msg' || S.envDest==='contacto' || S.envDest==='wsp') && sel.length===1 ? `<div class="mensaje" id="msg">${esc(textoEnvio(S.envDest, sel[0]))}</div>` : ''}
        <div class="btns"><button class="btn pri grande" id="bEnviar" ${!sel.length || muchas ? 'disabled' : ''}>${navigator.share ? '↗ Enviar' : '⬇ Enviar'}${sel.length>1 ? ' (' + sel.length + ' marchas)' : ''}</button>
          ${(S.envDest==='msg' || S.envDest==='tel') && sel.length===1 ? '<button class="btn" id="bQr">▦ Mostrar QR</button><button class="btn" id="bCod">📋 Copiar código</button>' : ''}</div>
        <div id="qr"></div>
        <p class="nota">${navigator.share ? 'En el teléfono se abre el menú Compartir (WhatsApp, correo, AirDrop, Drive…).' : 'En el computador se descarga el archivo o se copia el mensaje.'}
          ${S.envDest==='atak' ? ' En ATAK: Import Manager → archivo local → elige el KML; la ruta y los puntos quedan como capa.' : ''}
          ${S.envDest==='c2' ? ' En el TOQUI: botón «🌍 KML/GPX» → importar → elige el archivo; la ruta y los puntos de control quedan como calco.' : ''}
          ${S.envDest==='tel' ? ' En el otro teléfono: Marchas → «Cargar respaldo» (archivo) o «Recibir plan» (código o QR).' : ''}</p>
      </div>
      ${civil ? '' : `<details class="tarjeta"><summary>Vínculo con el C2 TOQUI</summary><p class="nota">El TOQUI abre el archivo KML (o GPX o GeoJSON) como calco, con la ruta y los puntos de control. El mensaje con código no lo lee el TOQUI: sirve entre equipos con Burros. La conexión directa por red se hará cuando se defina con el TOQUI.</p></details>`}`;
    vista.querySelectorAll('[data-env]').forEach(c=>c.onchange = ()=>{ const id = c.dataset.env; S.envSel = c.checked ? [...new Set([...S.envSel, id])] : S.envSel.filter(x=>x!==id); guardar(); vEnviar(); });
    vista.querySelectorAll('[data-ver]').forEach(b=>b.onclick = e=>{ e.preventDefault(); S.actual = b.dataset.ver; ir('cuadro'); });
    vista.querySelectorAll('[data-dest]').forEach(b=>b.onclick = ()=>{ S.envDest = b.dataset.dest; guardar(); vEnviar(); });
    if($('#cvLim')) $('#cvLim').onchange = e=>{ sel[0].m.par.horaAviso = e.target.value; guardar(); $('#msg').textContent = textoEnvio('contacto', sel[0]); };
    if($('#cvTel')) $('#cvTel').oninput = e=>{ sel[0].m.par.contacto = e.target.value; guardar(); $('#msg').textContent = textoEnvio('contacto', sel[0]); };
    const cod = sel.length===1 ? BDC.mensajePlan(sel[0].m, sel[0].R).split('\n')[1] : '';
    if($('#bCod')) $('#bCod').onclick = ()=>copiar(cod);
    if($('#bQr')) $('#bQr').onclick = ()=>{
      try { const q = qrcode(0, 'L'); q.addData(cod, 'Byte'); q.make(); $('#qr').innerHTML = `<div class="qr">${q.createSvgTag({cellSize:4, margin:2, scalable:true})}</div><p class="nota">Léelo con «Recibir plan» en el otro equipo.</p>`; }
      catch(e){ $('#qr').innerHTML = '<div class="alerta">La ruta es demasiado larga para un QR: usa el archivo o el código.</div>'; } };
    $('#bEnviar').onclick = async()=>{ const r = await enviar(S.envDest, sel); if(r){ sel.forEach(x=>{ const mm = x && x.m ? x.m : S.marchas.find(y=>y.id===x); if(mm) mm.difundido = Date.now(); }); guardar(); } if(r==='compartido') aviso('✔ Enviado'); else if(r==='descargado') aviso('⬇ Archivo descargado' + (S.envDest==='wsp' ? ' y resumen copiado' : '')); else if(r==='copiado') aviso('📋 Mensaje copiado'); };
  }
  function textoEnvio(dest, x){ return dest==='contacto' ? planCivil(x.m, x.R) : dest==='wsp' ? BDC.lineaPlan(x.m, x.R) : BDC.mensajePlan(x.m, x.R); }
  async function enviar(dest, sel){
    const x = sel[0], nom = sel.length===1 ? x.m : {nombre:sel.length + '_marchas'}, tit = sel.length===1 ? 'Marcha — ' + x.m.nombre : sel.length + ' marchas';
    const textoCompartido = async t=>{ if(navigator.share){ try { await navigator.share({title:tit, text:t}); return 'compartido'; } catch(e){ if(e && e.name==='AbortError') return 'cancelado'; } } await copiar(t); return 'copiado'; };
    if(dest==='msg' || dest==='contacto') return textoCompartido(textoEnvio(dest, x));
    if(dest==='c2') return compartirArchivo(nombreArchivo(nom, 'kml'), BDC.kmlVarias(sel), 'application/vnd.google-earth.kml+xml', tit, sel.map(y=>BDC.lineaPlan(y.m, y.R)).join('\n\n'));
    if(dest==='tel') return compartirArchivo(nombreArchivo(nom, 'json'), JSON.stringify({app:'burros', v:1, marchas:sel.map(y=>y.m)}, null, 1), 'application/json', tit);
    if(dest==='gps') return compartirArchivo(nombreArchivo(nom, 'gpx'), BDC.gpxVarias(sel), 'application/gpx+xml', tit);
    if(dest==='atak' || dest==='earth') return compartirArchivo(nombreArchivo(nom, 'kml'), BDC.kmlVarias(sel), 'application/vnd.google-earth.kml+xml', tit);
    if(dest==='excel') return compartirArchivo(nombreArchivo(x.m, 'csv'), BDC.csv(x.m, x.R), 'text/csv;charset=utf-8', tit);
    if(dest==='wsp') return compartirArchivo(nombreArchivo(nom, 'gpx'), BDC.gpxVarias(sel), 'application/gpx+xml', tit, sel.map(y=>BDC.lineaPlan(y.m, y.R)).join('\n\n'));
    if(dest==='doc'){ S.actual = x.m.id; guardar(); documento(); return ''; }
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
