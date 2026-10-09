/* BURROS DE COMBATE — documento para imprimir o guardar en PDF (como la «orden gráfica» del C2), en formato MILITAR o CIVIL.
   Militar: clasificación arriba y abajo de cada hoja, ejemplar, escalón superior y propio, lugar y GDH, anexo, referencias (carta),
   firmas y distribución. Civil: título, organización, autor y fecha. Secciones a elección: mapa de la ruta (orden gráfica), perfil,
   cuadro de marcha y navegación, matriz de eventos, luz y visibilidad, nombres clave para la radio, columna y agua, lista de verificación.
   Se muestra una vista previa en hojas blancas; «Imprimir» usa la impresión del navegador (allí se elige «Guardar como PDF»).
   La configuración se guarda en la marcha (m.doc). */
const Documento = (function(){
  let A = null, mapaDoc = null;
  const $ = s=>document.querySelector(s);
  const SECCIONES = [['mapa', 'Mapa de la ruta (orden gráfica)'], ['perfil', 'Perfil del itinerario'], ['cuadro', 'Cuadro de marcha y navegación'],
    ['matriz', 'Matriz de eventos'], ['luz', 'Luz y visibilidad (sol, crepúsculos, luna)'], ['claves', 'Nombres clave y eventos para la radio'],
    ['apoyo', 'Columna, calor y agua'], ['carga', 'Carga por hombre'], ['material', 'Material para la marcha'], ['lista', 'Lista de verificación']];
  // colores del documento: paleta (títulos, tarjetas, líneas), color de la ruta en el mapa
  const PALETAS = {oliva:'Verde oliva', azul:'Azul', gris:'Gris (blanco y negro)', arena:'Arena'};
  const RUTAS = {azul:['Azul', '#0b3d91'], rojo:['Rojo', '#b3261e'], negro:['Negro', '#111111'], magenta:['Magenta', '#b0127a']};
  const colorRuta = d=>(RUTAS[d.ruta] || RUTAS.azul)[1];
  // figuras claras (ahorran tinta): se cambian los colores oscuros de la pantalla por colores para papel
  const CLARO = [['#14150f', '#ffffff'], ['#1c1e16', '#f4f4f0'], ['#22251b', '#eaeae4'], ['#2a2e20', '#d6d6cc'], ['#353a29', '#cdcdc2'], ['#14162b', '#3b4060'],
    ['#6f705e', '#6b6b6b'], ['#a3a28c', '#444444'], ['#ece8d8', '#111111'], ['#f2c46b', '#a06a00'], ['#9fc3e6', '#1f5fa8'], ['#e3a63a', '#9a5b00'], ['#fff"', '#111"']];
  const aClaro = svg=>CLARO.reduce((t, [a, b])=>t.split(a).join(b), svg);
  const CLASIF = ['SECRETO', 'RESERVADO', 'CONFIDENCIAL', 'SIN CLASIFICACIÓN'];
  const ahora = ()=>{ const d = new Date(), M3 = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return String(d.getDate()).padStart(2, '0') + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + M3[d.getMonth()] + String(d.getFullYear()).slice(2); };
  function porDefecto(m){
    const cv = Uso.civil();
    return {formato:cv ? 'civil' : 'militar', clasif:cv ? '' : 'RESERVADO', ejemplar:'1', ejemplares:'3', sup:'', propio:m.unidad || '', lugar:'', gdh:'',
      anexo:'', titulo:cv ? 'PLAN DE RUTA' : 'ORDEN GRÁFICA DE MARCHA', sub:m.nombre || '', carta:'', elab:'', firmas:'', distrib:'', autor:'', org:m.unidad || '',
      hoja:'A4', orient:'v', escala:'auto', capa:'topo', curvas:true, grilla:true, paleta:'oliva', figuras:'claras', ruta:'azul',
      sec:{mapa:true, perfil:true, cuadro:true, matriz:!cv, luz:true, claves:!cv, apoyo:false, carga:true, material:true, lista:false}};
  }

  /* ---------- formulario ---------- */
  function abrir(api){
    A = api; const m = A.actual(); m.doc = Object.assign(porDefecto(m), m.doc || {}); m.doc.sec = Object.assign(porDefecto(m).sec, m.doc.sec || {});
    let ov = $('#docVista'); if(!ov){ ov = document.createElement('div'); ov.id = 'docVista'; document.body.appendChild(ov); }
    ov.hidden = false; document.body.classList.add('con-doc');
    const d = m.doc, mil = d.formato==='militar', esc = A.esc;
    const inp = (k, lab, ph, ancho)=>`<label class="c${ancho ? ' ancho' : ''}">${lab}<input data-doc="${k}" value="${esc(d[k])}" placeholder="${esc(ph || '')}"></label>`;
    const ta = (k, lab, ph)=>`<label class="c ancho">${lab}<textarea data-doc="${k}" placeholder="${esc(ph || '')}" style="font-family:var(--sans);font-size:14px;min-height:60px">${esc(d[k])}</textarea></label>`;
    const sel = (k, lab, ops)=>`<label class="c">${lab}<select data-doc="${k}" data-redoc>${Object.entries(ops).map(([v, n])=>`<option value="${v}"${String(d[k])===v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    ov.innerHTML = `<div class="doc-barra no-imp"><b>📄 Documento</b><span class="nota" id="docEstado">Vista previa · descarga en PDF o JPG, o imprime (escala 100 %)</span>
        <button class="btn pri" id="docPdf">⬇ PDF</button><button class="btn" id="docJpg">⬇ JPG</button><button class="btn" id="docImp">🖨 Imprimir</button><button class="btn" id="docCerrar">✕ Cerrar</button></div>
      <details class="tarjeta doc-config no-imp" open><summary>Formato y contenido</summary>
        <div class="campos">
          ${sel('formato', 'Formato', {militar:'Militar (orden gráfica)', civil:'Civil'})}
          ${sel('hoja', 'Hoja', {A4:'A4', Letter:'Carta', Legal:'Oficio'})}
          ${sel('orient', 'Orientación', {v:'Vertical', h:'Horizontal'})}
          ${sel('paleta', 'Colores', PALETAS)}
          ${sel('figuras', 'Perfil y luz', {claras:'Fondo blanco (ahorra tinta)', oscuras:'Fondo oscuro'})}
          ${inp('titulo', 'Título', mil ? 'ORDEN GRÁFICA DE MARCHA' : 'Plan de marcha')}
          ${inp('sub', 'Subtítulo', 'nombre de la marcha')}
        </div>
        ${mil ? `<h2>Formato militar</h2><div class="campos">
          ${sel('clasif', 'Clasificación', Object.fromEntries(CLASIF.map(c=>[c, c])))}
          ${inp('ejemplar', 'Ejemplar N.º', '1')}${inp('ejemplares', 'de', '3')}
          ${inp('sup', 'Escalón superior', 'Ej: II DIVISIÓN')}${inp('propio', 'Propio escalón', 'Ej: RI 1 «BUIN»')}
          ${inp('lugar', 'Lugar', 'Ej: Santiago')}${inp('gdh', 'GDH (grupo fecha-hora)', ahora())}
          ${inp('anexo', 'Anexo (arriba a la derecha)', 'Ej: ANEXO 3 (MARCHA) A LA O. OP. N.º 5', true)}
          ${inp('carta', 'Referencias: carta(s)', 'Ej: Hoja Santiago 1:50.000 · IGM ed. 2006', true)}
          ${inp('elab', 'Quien elabora', 'Ej: S-3')}
          ${ta('firmas', 'Firmas (una por línea: grado, nombre y cargo)', 'Ej: CAP. JUAN PÉREZ — Comandante de compañía')}
          ${ta('distrib', 'Distribución (una por línea)', 'Ej: Cdte. RI 1 · S-3 · Archivo')}
        </div>` : `<h2>Formato civil</h2><div class="campos">${inp('org', 'Organización', 'Ej: Club Andino')}${inp('autor', 'Autor', 'Nombre')}</div>`}
        <h2>Contenido</h2>
        <div class="doc-secs">${SECCIONES.map(([k, n])=>`<label><input type="checkbox" data-sec="${k}" ${d.sec[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>
        ${d.sec.mapa ? `<h2>Mapa</h2><div class="campos">
          ${sel('escala', 'Escala', {auto:'Ajustar a la ruta', 10000:'1:10.000', 25000:'1:25.000', 50000:'1:50.000', 100000:'1:100.000'})}
          ${sel('capa', 'Capa', Object.fromEntries(Object.entries(Mapa.BASES).map(([k, b])=>[k, b.n])))}
          ${sel('ruta', 'Color de la ruta', Object.fromEntries(Object.entries(RUTAS).map(([k, v])=>[k, v[0]])))}
          <label class="c"><span><input type="checkbox" data-docb="curvas" ${d.curvas ? 'checked' : ''} style="width:auto"> Curvas de nivel</span></label>
          <label class="c"><span><input type="checkbox" data-docb="grilla" ${d.grilla ? 'checked' : ''} style="width:auto"> Cuadrícula UTM</span></label></div>` : ''}
      </details>
      <div class="doc-paginas" id="docPag"></div>`;
    // eventos del formulario
    let t = null;
    const redibujar = ()=>{ clearTimeout(t); t = setTimeout(()=>{ A.guardar(); armar(); }, 350); };
    ov.querySelectorAll('[data-doc]').forEach(x=>{ x.oninput = ()=>{ d[x.dataset.doc] = x.value; x.dataset.redoc!==undefined ? (A.guardar(), abrir(A)) : redibujar(); }; });
    ov.querySelectorAll('[data-sec]').forEach(x=>x.onchange = ()=>{ d.sec[x.dataset.sec] = x.checked; A.guardar(); abrir(A); });
    ov.querySelectorAll('[data-docb]').forEach(x=>x.onchange = ()=>{ d[x.dataset.docb] = x.checked; A.guardar(); armar(); });
    $('#docCerrar').onclick = cerrar;
    $('#docImp').onclick = imprimir;
    $('#docPdf').onclick = ()=>exportar('pdf'); $('#docJpg').onclick = ()=>exportar('jpg');
    armar();
  }
  function cerrar(){ const ov = $('#docVista'); if(ov){ ov.hidden = true; ov.innerHTML = ''; } if(mapaDoc){ try { mapaDoc.remove(); } catch(e){} mapaDoc = null; }
    document.body.classList.remove('con-doc'); const st = $('#docPagina'); if(st) st.remove(); }
  function imprimir(){
    document.body.classList.add('doc-imprimir');
    const fin = ()=>{ document.body.classList.remove('doc-imprimir'); removeEventListener('afterprint', fin); };
    addEventListener('afterprint', fin);
    setTimeout(()=>{ window.print(); setTimeout(fin, 1500); }, 200);
  }

  /* ---------- el documento ---------- */
  function armar(){
    const m = A.actual(), d = m.doc, R = A.calcular(m), mil = d.formato==='militar', esc = A.esc, f = A.f, M = A.M, cont = $('#docPag'); if(!cont) return;
    if(mapaDoc){ try { mapaDoc.remove(); } catch(e){} mapaDoc = null; }
    // tamaño de hoja para la impresión
    let st = $('#docPagina'); if(!st){ st = document.createElement('style'); st.id = 'docPagina'; document.head.appendChild(st); }
    st.textContent = `@media print{ @page{ size:${d.hoja} ${d.orient==='h' ? 'landscape' : 'portrait'}; margin:12mm 12mm 14mm; } }`;
    cont.className = 'doc-paginas ' + (d.orient==='h' ? 'apaisado' : 'vertical') + ' hoja-' + d.hoja;
    if(!R.tramos.length){ cont.innerHTML = '<div class="doc-hoja"><p>Faltan datos de la ruta para armar el documento.</p></div>'; return; }
    const r = R.res, cls = mil ? `<div class="doc-clasif">${esc(d.clasif)}</div>` : '';
    const fecha = m.fecha ? m.fecha.split('-').reverse().join('-') : '';
    // encabezado
    const cab = mil ? `
      <div class="doc-cab mil">
        <div class="izq">EJEMPLAR N.º ${esc(d.ejemplar || '__')} DE ${esc(d.ejemplares || '__')}<br>${esc(d.sup)}${d.sup ? '<br>' : ''}${esc(d.propio)}<br>${esc(d.lugar)}${d.lugar ? ', ' : ''}${esc(d.gdh || ahora())}</div>
        <div class="der">${esc(d.anexo)}</div>
      </div>
      <h1 class="doc-tit">${esc(d.titulo || 'ORDEN GRÁFICA DE MARCHA')}</h1>
      ${d.sub ? `<div class="doc-sub">${esc(d.sub)}</div>` : ''}
      <div class="doc-ref"><b>Referencias:</b> ${d.carta ? 'Carta ' + esc(d.carta) + '. ' : ''}Datum ${esc(m.datum)}, zona UTM ${R.zona}. Declinación magnética ${f(R.decl.valor, 2)}° (${esc(R.decl.fuente)}).
        Horas locales. Marcha del ${fecha}, partida PIM ${M.verHora(r.partida)}.</div>`
      : `<div class="doc-cab civ"><div class="izq">${esc(d.org)}</div><div class="der">${fecha}</div></div>
      <h1 class="doc-tit civ">${esc(d.titulo || 'Plan de marcha')}</h1>${d.sub ? `<div class="doc-sub">${esc(d.sub)}</div>` : ''}
      ${d.autor ? `<div class="doc-ref">Preparado por: ${esc(d.autor)}</div>` : ''}`;
    // resumen en tarjetas con ícono y número grande (las más importantes, destacadas)
    const ico = {dist:'<path d="M3 17h18M5 17V9m4 8v-4m4 4V7m4 10v-6"/>', des:'<path d="M2 20l7-11 4 6 3-4 6 9z"/>', par:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
      ter:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', tot:'<path d="M9 2h6M12 8v5M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/>', met:'<circle cx="12" cy="12" r="9"/><path d="M12 7l3 8-3-2-3 2z"/>',
      ev:'<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', carga:'<path d="M7 7h10l2 14H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>', alt:'<path d="M6 4v16M18 4v16M6 12h12"/>'};
    const tarj = (k, lab, val, sub, dest)=>`<div class="dr${dest ? ' dest' : ''}"><svg viewBox="0 0 24 24">${ico[k]}</svg><div><span>${lab}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
    const resumen = `<div class="doc-res">
      ${tarj('dist', 'Distancia', f(r.dist/1000, 2) + ' km', R.eventos.length + ' eventos', true)}
      ${tarj('par', 'Partida (PIM)', M.verHora(r.partida), fecha, true)}
      ${tarj('ter', 'Término estimado', M.verHora(r.termino), 'con altos e imprevistos', true)}
      ${tarj('tot', 'Tiempo total', M.verDur(r.total), 'marcha ' + M.verDur(r.marcha), true)}
      ${tarj('des', 'Ascenso / descenso', '+' + f(r.sube) + ' / −' + f(r.baja) + ' m', r.alto ? 'punto más alto ' + esc(r.alto.nombre) + ' ' + f(r.alto.cota) + ' m' : '')}
      ${tarj('met', ['battle', 'forzada'].includes(R.par.metodo) ? 'Tipo de marcha' : 'Método', esc(({montana:'Montaña', mide:'MIDE', general:'Marcha general', forzada:'Marcha forzada', battle:'Carrera de combate'})[R.par.metodo] || ''),
        (['battle', 'forzada'].includes(R.par.metodo) ? esc(M.tipoMarcha(R.par).replace(/^[^:]*: /, '')) + (R.meta ? ' · meta ' + (R.meta.cumple ? 'cumple' : 'faltan ' + Math.round(R.meta.dif) + ' min') : '') + ' · ' : '') + (R.tramos.some(t=>t.noche) ? 'con tramos de noche' : 'de día'))}
      ${tarj('ev', 'Eventos', R.eventos.length, R.eventos.map(i=>R.puntos[i].clave).filter(Boolean).slice(0, 4).join(' · ') + (R.eventos.length>4 ? '…' : ''))}
      ${tarj('carga', 'Carga por hombre', f(R.carga ? R.carga.total : +R.par.carga || 0, 1) + ' kg', R.carga ? (R.carga.final!==undefined ? 'al llegar ' + f(R.carga.final, 1) + ' kg · ' : '') + 'líneas ' + [1, 2, 3].map(l=>f(R.carga.lineas[l], 1)).join(' / ') + (R.carga.sinMochila ? ' · sin mochila' : '') : 'escrita a mano')}
      ${tarj('alt', 'Altos / imprevistos', (['battle', 'forzada'].includes(R.par.metodo) ? (r.altos>0 ? 'por calor' : 'sin altos') : R.regimen ? R.regimen.dur + ' min c/' + R.regimen.cada : Math.round(R.par.altos*100) + ' %') + ' / ' + Math.round(R.par.imprev*100) + ' %', M.verDur(r.altos) + ' / ' + M.verDur(r.imprev))}</div>`;
    const fig = (html, id)=>d.figuras==='oscuras' ? `<div class="doc-osc"${id ? ` id="${id}"` : ''}>${html}</div>` : `<div class="doc-fig"${id ? ` id="${id}"` : ''}>${aClaro(html)}</div>`;
    const sec = (titulo, html, nueva)=>`<section class="doc-sec${nueva ? ' salto' : ''}"><h2 class="doc-h2">${titulo}</h2>${html}</section>`;
    const S = d.sec; let n = 0, partes = [];
    if(S.mapa) partes.push(sec('Ruta de marcha', `<div class="doc-mapa" id="docMapa"></div><div class="doc-mapa-pie" id="docMapaPie"></div>`));
    if(S.perfil) partes.push(sec('Perfil del itinerario', fig(A.svgPerfil(R), 'docPerfil'), partes.length>0));
    if(S.cuadro) partes.push(sec('Cuadro de marcha y navegación', A.tablaCuadro(m, R), partes.length>0));
    if(S.matriz) partes.push(sec('Matriz de eventos', matriz(m, R), partes.length>0));
    if(S.luz) partes.push(sec('Luz y visibilidad', luz(m, R, fig), partes.length>0));
    if(S.claves) partes.push(sec('Nombres clave y eventos para la radio', claves(m, R), partes.length>0));
    if(S.apoyo) partes.push(sec('Columna, calor y agua', A.apoyo(R) || '<p>Sin datos de columna ni de calor (pestaña Datos).</p>', partes.length>0));
    if(S.carga) partes.push(sec('Carga por hombre', carga(m, R), partes.length>0));
    if(S.material) partes.push(sec('Material para la marcha', A.material(m, R), partes.length>0));
    if(S.lista) partes.push(sec('Lista de verificación', lista(m), partes.length>0));
    const firmas = mil ? `<div class="doc-firmas">${String(d.firmas || '').split(/\n+/).map(x=>x.trim()).filter(Boolean).map(x=>`<div><div class="linea"></div>${esc(x)}</div>`).join('')}</div>
        ${d.elab ? `<div class="doc-ref">Elaborado por: ${esc(d.elab)}</div>` : ''}
        ${d.distrib ? `<div class="doc-distr"><b>DISTRIBUCIÓN:</b><br>${String(d.distrib).split(/\n+/).map(x=>esc(x.trim())).filter(Boolean).join('<br>')}</div>` : ''}`
      : `<div class="doc-ref civ">Generado con Burros de Combate · ${new Date().toLocaleDateString('es-CL')}</div>`;
    const bloques = [cab + resumen + (partes[0] || '')].concat(partes.slice(1)); bloques[bloques.length - 1] += firmas;
    cont.innerHTML = `<div class="doc-hoja ${mil ? 'militar' : 'civil'} pal-${d.paleta || 'oliva'}">${mil ? `<div class="doc-clasif arriba">${esc(d.clasif)}</div><div class="doc-clasif abajo">${esc(d.clasif)}</div>` : ''}
      ${bloques.map(b=>`<div class="doc-blq">${b}</div>`).join('')}</div>`;
    if(S.mapa) setTimeout(()=>dibujarMapa(m, R), 30);
    if(S.perfil) A.terrenoDe(R).then(T=>{ const e = $('#docPerfil'); if(T && e) e.innerHTML = d.figuras==='oscuras' ? A.svgPerfil(R, T) : aClaro(A.svgPerfil(R, T)); });
  }

  /* ---------- descargar en PDF o JPG ----------
     Cada bloque (encabezado + primera sección, y luego cada sección) se convierte en imagen (html2canvas) y se arma el PDF
     hoja por hoja (jsPDF), con la clasificación arriba y abajo de cada hoja en formato militar. El JPG es una sola imagen larga.
     Las bibliotecas se cargan solo al descargar. */
  const cargar = src=>new Promise((ok, mal)=>{ if(document.querySelector('script[src="' + src + '"]')) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
  const HOJAS = {A4:[210, 297], Letter:[215.9, 279.4], Legal:[215.9, 355.6]};
  async function capturar(){
    await cargar('lib/html2canvas-1.4.1.js');
    const bs = [...document.querySelectorAll('#docPag .doc-blq')], out = [];
    for(const b of bs) out.push(await html2canvas(b, {scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false}));
    return out;
  }
  async function exportar(tipo){
    const m = A.actual(), d = m.doc, est = $('#docEstado'), nombre = (d.sub || m.nombre || 'marcha').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '') || 'marcha';
    const btns = [$('#docPdf'), $('#docJpg')]; btns.forEach(b=>b.disabled = true); if(est) est.textContent = 'Preparando ' + tipo.toUpperCase() + '…';
    try {
      for(let i=0; i<60 && $('#docMapa') && !$('#docMapa').classList.contains('listo'); i++) await new Promise(r=>setTimeout(r, 200));   // el mapa ya dibujado
      const cs = await capturar();
      if(tipo==='jpg'){
        const W = Math.max(...cs.map(c=>c.width)), gap = 40, H = cs.reduce((a, c)=>a + c.height + gap, gap), cv = document.createElement('canvas');
        cv.width = W + 2*gap; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
        let y = gap; cs.forEach(c=>{ g.drawImage(c, gap, y); y += c.height + gap; });
        if(d.formato==='militar'){ g.fillStyle = '#000'; g.font = 'bold 28px Helvetica, Arial'; g.textAlign = 'center'; g.fillText(d.clasif, cv.width/2, 30); g.fillText(d.clasif, cv.width/2, cv.height - 10); }
        bajar(await new Promise(r=>cv.toBlob(r, 'image/jpeg', 0.9)), nombre + '.jpg');
      } else {
        await cargar('lib/jspdf.umd.min.js');
        const [pw, ph] = HOJAS[d.hoja] || HOJAS.A4, horiz = d.orient==='h', W = horiz ? ph : pw, H = horiz ? pw : ph, mg = 12, top = 14, bot = 14;
        const pdf = new jspdf.jsPDF({orientation:horiz ? 'landscape' : 'portrait', unit:'mm', format:[pw, ph]});
        const usable = H - top - bot, ancho = W - 2*mg; let y = top, primera = true;
        const marca = ()=>{ if(d.formato!=='militar') return; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text(d.clasif, W/2, 8, {align:'center'}); pdf.text(d.clasif, W/2, H - 5, {align:'center'}); };
        const nueva = ()=>{ if(!primera) pdf.addPage(); primera = false; y = top; marca(); };
        nueva();
        cs.forEach((c, i)=>{
          const mmPorPx = ancho/c.width; let alto = c.height*mmPorPx;
          if(i>0) nueva();   // cada sección parte en hoja nueva
          // si no cabe, se corta en trozos del alto de la hoja
          let desde = 0;
          while(desde<c.height){
            const quedan = (top + usable - y), pxQueCaben = Math.floor(quedan/mmPorPx), h = Math.min(c.height - desde, pxQueCaben);
            if(h<40 && desde<c.height){ nueva(); continue; }
            const t = document.createElement('canvas'); t.width = c.width; t.height = h; t.getContext('2d').drawImage(c, 0, desde, c.width, h, 0, 0, c.width, h);
            pdf.addImage(t.toDataURL('image/jpeg', 0.92), 'JPEG', mg, y, ancho, h*mmPorPx); y += h*mmPorPx; desde += h;
            if(desde<c.height) nueva();
          }
        });
        bajar(pdf.output('blob'), nombre + '.pdf');
      }
      if(est) est.textContent = '✔ ' + tipo.toUpperCase() + ' listo (revisa la carpeta de descargas)';
    } catch(e){ if(est) est.textContent = '⚠ No se pudo crear el ' + tipo.toUpperCase() + ': ' + (e && e.message || e); }
    btns.forEach(b=>b.disabled = false);
  }
  async function bajar(blob, nombre){
    // en el teléfono, si se puede, se ofrece compartir (WhatsApp, correo, Archivos); si no, se descarga
    try { const fl = new File([blob], nombre, {type:blob.type});
      if(navigator.canShare && navigator.canShare({files:[fl]}) && /iPhone|iPad|Android/i.test(navigator.userAgent)){ await navigator.share({files:[fl], title:nombre}); return; } } catch(e){}
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* ---------- secciones ---------- */
  function matriz(m, R){
    const esc = A.esc, M = A.M, E = m.ejec, pts = R.eventos.map(i=>R.puntos[i]);
    const llega = {}; R.tramos.forEach(t=>{ llega[t.iB] = t; });
    const hh = ms=>{ const x = new Date(ms); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
    // índice de cada punto en la secuencia que usa Seguir (primer punto + el final de cada tramo), para leer las horas reales
    const sec = R.tramos.length ? [R.tramos[0].iA].concat(R.tramos.map(t=>t.iB)) : [];
    const filas = pts.map((p, k)=>{ const t = llega[p.i], hp = k===0 ? R.res.partida : t && t.llegada;
      let real = '', dif = '';
      if(E && E.inicio){ const j = sec.indexOf(p.i), x = E.llegadas ? E.llegadas[j] : null;
        if(x>0){ real = hh(x); const d = Math.round((x - (E.inicio + (hp - R.res.partida)*36e5))/60000); dif = (d>0 ? '+' : d<0 ? '−' : '±') + Math.abs(d) + ' min'; }
        else if(x===-1) real = 'no marcado'; }
      return `<tr><td class="tx"><b>${esc(p.nombre)}</b></td><td class="tx">${p.clave ? A.evento(p.clave) : ''}</td><td>${M.verHora(hp)}</td><td>${real}</td><td>${dif}</td><td class="tx obs">${esc(p.obs)}${k===0 ? ' (inicio de marcha)' : ''}</td></tr>`; });
    let extra = '';
    if(E){ const ev = [];
      (E.altos || []).forEach(a=>ev.push([a.ini, 'Alto — ' + a.motivo + (a.fin ? ' (' + Math.round((a.fin - a.ini)/60000) + ' min)' : '')]));
      (E.nov || []).forEach(x=>ev.push([x.t, 'Novedad — ' + x.txt]));
      if(E.inicio) ev.push([E.inicio, 'Inicio real de la marcha']); if(E.fin) ev.push([E.fin, 'Fin real de la marcha']);
      ev.sort((a, b)=>a[0] - b[0]);
      if(ev.length) extra = `<h3 class="doc-h3">Ejecución registrada</h3><table class="t"><thead><tr><th>Hora</th><th class="tx">Evento</th></tr></thead><tbody>${ev.map(([t, x])=>`<tr><td>${hh(t)}</td><td class="tx">${esc(x)}</td></tr>`).join('')}</tbody></table>`; }
    return `<table class="t"><thead><tr><th class="tx">Punto</th><th class="tx">Evento (radio)</th><th>Hora plan</th><th>Hora real</th><th>Diferencia</th><th class="tx">Observaciones</th></tr></thead><tbody>${filas.join('')}</tbody></table>
      <p class="doc-nota">Las columnas «Hora real» y «Diferencia» se completan en la marcha.</p>${extra}`;
  }
  function luz(m, R, fig){
    const p0 = R.puntos.find(p=>p.ok); if(!p0 || !m.fecha || typeof LUZ==='undefined') return '<p>Falta la fecha o el PIM.</p>';
    const D = LUZ.dia(m.fecha, p0.lat, p0.lon), am = D.amanecer, at = D.atardecer, L = D.lunaNoche;
    const hh = t=>t ? String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') : '—';
    const tSol = new Date(LUZ.inicioDia(m.fecha) + ((R.res.partida||12)%24)*36e5);
    return `${fig(PantallaLuz.grafico(m.fecha, p0.lat, p0.lon, R, Object.assign({}, A)))}
      <table class="t"><thead><tr><th class="tx"></th><th>Matutino</th><th>Vespertino</th></tr></thead><tbody>
        <tr><td class="tx">Crepúsculo astronómico (C.A.M. / C.A.V., 12°–18°)</td><td>${hh(am.astro)} – ${hh(am.nautico)}</td><td>${hh(at.nautico)} – ${hh(at.astro)}</td></tr>
        <tr><td class="tx">Crepúsculo náutico (C.N.M. / C.N.V., 6°–12°)</td><td>${hh(am.nautico)} – ${hh(am.civil)}</td><td>${hh(at.civil)} – ${hh(at.nautico)}</td></tr>
        <tr><td class="tx">Primera / última luz (9°)</td><td>${hh(am.primeraLuz)}</td><td>${hh(at.ultimaLuz)}</td></tr>
        <tr><td class="tx">Crepúsculo civil (C.C.M. / C.C.V., 0°–6°)</td><td>${hh(am.civil)} – ${hh(am.salida)}</td><td>${hh(at.puesta)} – ${hh(at.civil)}</td></tr>
        <tr><td class="tx"><b>Salida / puesta del sol</b></td><td><b>${hh(am.salida)}</b></td><td><b>${hh(at.puesta)}</b></td></tr>
      </tbody></table>
      <p class="doc-nota">Luna en la noche: <b>${L.nombre}</b>, ${Math.round(L.ilum*100)} % iluminada; sale ${D.luna.sale.map(hh).join(' / ') || '—'}, se pone ${D.luna.pone.map(hh).join(' / ') || '—'}.
        ${R.tramos.some(t=>t.noche) ? 'Hay tramos que se hacen de noche (velocidad de noche).' : 'Toda la marcha se hace con luz.'}</p>
      ${fig(PantallaLuz.esquema(D, tSol, p0.lat, p0.lon, Object.assign({}, A)).svg)}`;
  }
  // carga por hombre: total, base, individual y colectivo repartido; detalle por elemento (kg por hombre)
  function carga(m, R){
    const esc = A.esc, f = A.f, pm = R.carga || (typeof pesoMaterial!=='undefined' ? pesoMaterial(m, R) : null);
    if(!pm) return `<p>Carga escrita a mano: <b>${f(+R.par.carga || 0, 1)} kg</b> por hombre.</p>`;
    const its = pm.items.filter(x=>x.porHombre>0.005);
    return `<div class="doc-res doc-carga">
        <div class="dr dest"><div><span>Total por hombre</span><b>${f(pm.comun!==undefined ? pm.comun : pm.total, 1)} kg</b><small>${pm.mas ? 'fusilero o patrullero' : R.carga ? 'usada en el cálculo de tiempos' : 'no usada en el cálculo (carga a mano ' + f(+R.par.carga || 0, 1) + ' kg)'}</small></div></div>
        ${pm.mas ? `<div class="dr dest"><div><span>El más cargado</span><b>${f(pm.total, 1)} kg</b><small>${esc(pm.mas.nombre)}: con esta carga se calcula el tiempo</small></div></div>` : ''}
        ${[1, 2, 3].map(l=>`<div class="dr"><div><span>${LINEAS[l]}</span><b>${f(pm.lineas[l], 1)} kg</b><small>${esc(LINEAS_TXT[l])}${l===3 && pm.sinMochila ? ' · se deja' : ''}</small></div></div>`).join('')}
        <div class="dr"><div><span>Carga de combate (1.ª + 2.ª)</span><b>${f(pm.combate, 1)} kg</b><small>referencia: hasta ${LIMITES_CARGA.combate} kg</small></div></div>
        <div class="dr"><div><span>Carga de marcha (con 3.ª)</span><b>${f(pm.marcha, 1)} kg</b><small>referencia: hasta ${LIMITES_CARGA.marcha} kg</small></div></div></div>
      ${pm.sinMochila ? '<p class="doc-nota"><b>La marcha se hace sin mochila:</b> la 3.ª línea se deja y no se suma.</p>' : ''}
      ${pm.especial && pm.especial.length ? `<table class="t"><thead><tr><th class="tx">Puesto</th><th>Hombres</th><th class="tx">Equipo especial</th><th>Equipo kg</th><th>Total kg</th></tr></thead><tbody>
        <tr><td class="tx">${A.esc(PUESTOS.fusilero)}</td><td>${pm.hay ? Math.max(0, pm.n - pm.portadores) : '—'}</td><td class="tx">—</td><td>—</td><td>${f(pm.comun, 1)}</td></tr>
        ${pm.especial.slice().sort((a, b)=>b.total - a.total).map(g=>`<tr><td class="tx">${A.esc(g.nombre)}${pm.mas===g ? ' <b>(el más cargado)</b>' : ''}</td><td>${g.n}</td><td class="tx">${A.esc(g.items.map(x=>x.n.replace(/ \(.*\)$/, '')).join(', '))}</td><td>+${f(g.kg, 1)}</td><td><b>${f(g.total, 1)}</b></td></tr>`).join('')}
        </tbody></table><p class="doc-nota">El tiempo de la marcha se calcula con el más cargado.</p>` : ''}
      ${pm.total>36 ? '<p class="doc-nota"><b>Sobre la carga de combate habitual (27–36 kg).</b></p>' : ''}
      <table class="t"><thead><tr><th class="tx">Elemento</th><th>Cantidad</th><th>kg c/u</th><th class="tx">Cómo se lleva</th><th>kg por hombre</th></tr></thead><tbody>
        ${[1, 2, 3, 4].map(l=>{ const g = its.filter(x=>x.linea===l); return g.length ? `<tr class="sub"><td class="tx" colspan="4"><b>${LINEAS[l]}</b> — ${esc(LINEAS_TXT[l])}${l===4 || (l===3 && pm.sinMochila) ? ' (no se suma)' : ''}</td><td><b>${f(pm.lineas[l], 2)}</b></td></tr>` + g.map(x=>`<tr><td class="tx">${esc(x.n)}</td><td>${f(x.q, x.q%1 ? 1 : 0)}</td><td>${f(x.kg, 2)}</td><td class="tx">${x.modo==='h' ? 'cada hombre (agua: hasta 3 L)' : x.modo==='i' ? 'individual' : 'colectivo, repartido'}</td><td>${f(x.porHombre, 2)}</td></tr>`).join('') : ''; }).join('')}
        ${pm.base ? `<tr class="tot"><td class="tx">Otro peso por hombre</td><td></td><td></td><td></td><td>${f(pm.base, 2)}</td></tr>` : ''}
        <tr class="tot"><td class="tx"><b>Total por hombre</b>${pm.mas ? ' (sin equipo especial)' : ''}</td><td></td><td></td><td></td><td><b>${f(pm.comun!==undefined ? pm.comun : pm.total, 1)} kg</b></td></tr>
      </tbody></table>`;
  }
  function claves(m, R){
    const esc = A.esc;
    return `<table class="t"><thead><tr><th class="tx">N.º</th><th class="tx">Punto</th><th class="tx">Nombre clave</th><th class="tx">Por radio</th><th>Hora plan</th></tr></thead><tbody>
      ${R.eventos.map((i, k)=>{ const p = R.puntos[i], t = R.tramos.find(x=>x.iB===i);
        return `<tr><td class="tx">${k + 1}</td><td class="tx"><b>${esc(p.nombre)}</b></td><td class="tx"><b>${esc(p.clave || '—')}</b></td><td class="tx">${p.clave ? A.evento(p.clave) : ''}</td><td>${A.M.verHora(k===0 ? R.res.partida : t && t.llegada)}</td></tr>`; }).join('')}
    </tbody></table>
    <p class="doc-nota">Motivos de alto: ${esc(String(R.par.motivosAlto || '').split(/\n+/).filter(Boolean).join(' · '))}.<br>Novedades: ${esc(String(R.par.novedades || '').split(/\n+/).filter(Boolean).join(' · '))}.</p>`;
  }
  function lista(m){
    const L = m.lista || {};
    return (Uso.civil() ? Uso.LISTA : LISTA).map(g=>`<h3 class="doc-h3">${A.esc(g.fase)}</h3><ul class="doc-lista">${g.items.map(([id, t])=>`<li>${L[id] ? '☑' : '☐'} ${A.esc(t)}</li>`).join('')}</ul>`).join('');
  }

  /* ---------- mapa de la orden gráfica ----------
     Leaflet solo carga las teselas (carta y curvas). Cuando terminan, se dibuja TODO en un lienzo propio (teselas, cuadrícula UTM,
     ruta, eventos, escala y norte) y se pone como imagen encima: así sale igual en pantalla, PDF, JPG e impresión. */
  function dibujarMapa(m, R){
    const el = $('#docMapa'), d = m.doc; if(!el || typeof L==='undefined') return;
    const ok = R.puntos.filter(p=>p.ok), b = L.latLngBounds(ok.map(p=>[p.lat, p.lon]));
    mapaDoc = L.map(el, {zoomControl:false, attributionControl:false, zoomSnap:0, fadeAnimation:false, zoomAnimation:false, inertia:false, dragging:false, scrollWheelZoom:false});
    const base = Mapa.BASES[d.capa] || Mapa.BASES.topo;
    const capa = L.tileLayer(base.url, Object.assign({crossOrigin:'anonymous'}, base.o)).addTo(mapaDoc);
    if(d.escala!=='auto'){ const c = b.getCenter(), mpp = (+d.escala)*0.0254/96, z = Math.log2(156543.03392*Math.cos(c.lat*Math.PI/180)/mpp); mapaDoc.setView(c, z, {animate:false}); }
    else mapaDoc.fitBounds(b, {padding:[40, 40], animate:false});
    let curvas = null;
    if(d.curvas && typeof Curvas!=='undefined'){ mapaDoc.createPane('curvas').style.zIndex = 300; curvas = Curvas.capa({claro:d.capa==='sat', pane:'curvas'}).addTo(mapaDoc); }
    const este = mapaDoc; let hecho = false;
    const listo = ()=>{ if(hecho || mapaDoc!==este) return; hecho = true; setTimeout(()=>{ if(mapaDoc===este) rasterizar(m, R, base); }, 250); };
    let cargadas = 0; const n = curvas ? 2 : 1, una = ()=>{ if(++cargadas>=n) listo(); };
    capa.once('load', una); if(curvas) curvas.once('load', una);
    setTimeout(listo, 5000);   // sin internet: se dibuja igual (sin carta)
  }
  function rasterizar(m, R, base){
    const el = $('#docMapa'), d = m.doc; if(!el || !mapaDoc) return;
    const W = el.clientWidth, H = el.clientHeight, k = 2, cv = document.createElement('canvas'); cv.width = W*k; cv.height = H*k;
    const g = cv.getContext('2d'); g.scale(k, k); g.fillStyle = '#e8e6df'; g.fillRect(0, 0, W, H);
    const r0 = el.getBoundingClientRect();
    // teselas de la carta y de las curvas, en su posición real
    el.querySelectorAll('img.leaflet-tile, canvas.leaflet-tile').forEach(t=>{ const r = t.getBoundingClientRect();
      try { if(t.tagName==='IMG' && !(t.complete && t.naturalWidth)) return; g.drawImage(t, r.left - r0.left, r.top - r0.top, r.width, r.height); } catch(e){} });
    const P = (lat, lon)=>{ const p = mapaDoc.latLngToContainerPoint([lat, lon]); return [p.x, p.y]; };
    const ok = R.puntos.filter(p=>p.ok), zona = R.zona, sur = ok[0].lat<0, bb = mapaDoc.getBounds();
    // cuadrícula UTM con sus kilómetros en el borde
    if(d.grilla){ const esq = [[bb.getSouth(), bb.getWest()], [bb.getNorth(), bb.getEast()], [bb.getSouth(), bb.getEast()], [bb.getNorth(), bb.getWest()]].map(([la, lo])=>A.M.llAUtm(la, lo, zona));
      const e0 = Math.min(...esq.map(u=>u.e)), e1 = Math.max(...esq.map(u=>u.e)), n0 = Math.min(...esq.map(u=>u.n)), n1 = Math.max(...esq.map(u=>u.n));
      const paso = (e1 - e0)>25000 ? 10000 : 1000, ll = (e, n)=>{ const x = A.M.utmALl(e, n, zona, sur); return P(x.lat, x.lon); };
      g.strokeStyle = 'rgba(29,59,138,.7)'; g.lineWidth = 0.8; g.font = 'bold 10px Helvetica, Arial'; g.fillStyle = '#1d3b8a';
      const etq = (t, x, y, al)=>{ g.save(); g.textAlign = al; g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText(t, x, y); g.fillText(t, x, y); g.restore(); };
      for(let e = Math.ceil(e0/paso)*paso; e<=e1; e += paso){ const a = ll(e, n0), z = ll(e, n1); g.beginPath(); g.moveTo(...a); g.lineTo(...z); g.stroke();
        const x = a[0] + (z[0] - a[0])*((H - 4 - a[1])/((z[1] - a[1]) || 1)); etq(String(Math.round(e/1000)%100).padStart(2, '0'), x, H - 4, 'center'); }
      for(let n = Math.ceil(n0/paso)*paso; n<=n1; n += paso){ const a = ll(e0, n), z = ll(e1, n); g.beginPath(); g.moveTo(...a); g.lineTo(...z); g.stroke();
        const y = a[1] + (z[1] - a[1])*((3 - a[0])/((z[0] - a[0]) || 1)); etq(String(Math.round(n/1000)%100).padStart(2, '0'), 3, y + 3, 'left'); } }
    // ruta: borde blanco y línea roja; quiebres como puntos chicos
    const pts = ok.map(p=>P(p.lat, p.lon));
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); pts.forEach((q, i)=>i ? g.lineTo(...q) : g.moveTo(...q)); g.stroke();
    const cr = colorRuta(d); g.strokeStyle = cr; g.lineWidth = 3.5; g.beginPath(); pts.forEach((q, i)=>i ? g.lineTo(...q) : g.moveTo(...q)); g.stroke();
    ok.forEach((p, i)=>{ if(p.ev) return; g.fillStyle = '#fff'; g.strokeStyle = cr; g.lineWidth = 1.2; g.beginPath(); g.arc(...pts[i], 2.6, 0, 7); g.fill(); g.stroke(); });
    // eventos: «DELTA · PC3 10:12 / 11:46» (mismo lugar, una sola etiqueta)
    const llega = {}; R.tramos.forEach(t=>{ llega[t.iB] = t.llegada; });
    const lugares = new Map();
    ok.forEach((p, i)=>{ if(!p.ev) return; const key = p.lat.toFixed(5) + ',' + p.lon.toFixed(5), h = llega[p.i]!==undefined ? llega[p.i] : R.res.partida, nom = (p.clave ? p.clave + ' · ' : '') + p.nombre;
      if(!lugares.has(key)) lugares.set(key, {q:pts[i], n:new Map()}); const gm = lugares.get(key).n; if(!gm.has(nom)) gm.set(nom, []); gm.get(nom).push(A.M.verHora(h)); });
    g.font = 'bold 10.5px Helvetica, Arial';
    lugares.forEach(({q, n})=>{ const t = [...n].map(([nom, hs])=>nom + ' ' + hs.join(' / ')).join(' · ');
      g.fillStyle = cr; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(...q, 6, 0, 7); g.fill(); g.stroke();
      const w = g.measureText(t).width + 8; let x = q[0] + 10, y = q[1] - 8; if(x + w>W - 4) x = q[0] - 10 - w; if(y<4) y = 4; if(y + 15>H - 4) y = H - 19;
      g.fillStyle = '#fff'; g.fillRect(x, y, w, 15); g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x, y, w, 15); g.fillStyle = '#000'; g.fillText(t, x + 4, y + 11); });
    // escala gráfica y norte
    const c = mapaDoc.getCenter(), mpp = 156543.03392*Math.cos(c.lat*Math.PI/180)/Math.pow(2, mapaDoc.getZoom());
    const largo = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].find(x=>x/mpp>=90) || 10000, px = largo/mpp, x0 = 12, y0 = H - 22;
    g.fillStyle = 'rgba(255,255,255,.88)'; g.fillRect(x0 - 6, y0 - 16, px + 60, 30);
    [0, 1].forEach(j=>{ g.fillStyle = j ? '#fff' : '#000'; g.fillRect(x0 + j*px/2, y0, px/2, 6); }); g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x0, y0, px, 6);
    g.fillStyle = '#000'; g.font = 'bold 10px Helvetica, Arial'; g.textAlign = 'left'; g.fillText('0', x0 - 3, y0 - 4); g.textAlign = 'right'; g.fillText(largo>=1000 ? largo/1000 + ' km' : largo + ' m', x0 + px + 40, y0 + 7); g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,.88)'; g.fillRect(W - 34, 8, 26, 38); g.fillStyle = '#000'; g.beginPath(); g.moveTo(W - 21, 12); g.lineTo(W - 28, 32); g.lineTo(W - 21, 27); g.lineTo(W - 14, 32); g.closePath(); g.fill();
    g.font = 'bold 11px Helvetica, Arial'; g.textAlign = 'center'; g.fillText('N', W - 21, 43); g.textAlign = 'left';
    g.font = '8px Helvetica, Arial'; g.fillStyle = 'rgba(0,0,0,.7)'; g.textAlign = 'right'; g.fillText(base.o.attribution.replace(/&copy;/g, '©'), W - 4, H - 3); g.textAlign = 'left';
    // la imagen reemplaza al mapa vivo
    let img = el.querySelector('img.doc-mapa-img'); if(!img){ img = document.createElement('img'); img.className = 'doc-mapa-img'; img.alt = 'Mapa de la ruta'; }
    try { img.src = cv.toDataURL('image/jpeg', 0.92); } catch(e){ return; }   // teselas sin permiso CORS: queda el mapa vivo
    try { mapaDoc.remove(); } catch(e){} mapaDoc = null; el.innerHTML = ''; el.appendChild(img); el.classList.add('listo');
    const pie = $('#docMapaPie'), esc = Math.round(mpp/(0.0254/96)), b2 = L.latLngBounds(ok.map(p=>[p.lat, p.lon])), cabe = d.escala==='auto' || bb.contains(b2);
    if(pie) pie.innerHTML = `Escala ${d.escala==='auto' ? 'aproximada ' : ''}1:${A.f(d.escala==='auto' ? esc : +d.escala)} (al imprimir al 100 %) · cuadrícula UTM zona ${zona} · ruta en ${(RUTAS[d.ruta] || RUTAS.azul)[0].toLowerCase()}; eventos con nombre clave y hora.
      ${cabe ? '' : '<br><b>La ruta no cabe completa a esta escala: se muestra la parte central. Usa «Ajustar a la ruta» u otra escala.</b>'}`;
  }
  return {abrir, cerrar, exportar, SECCIONES};
})();
if(typeof globalThis!=='undefined') globalThis.Documento = Documento;
