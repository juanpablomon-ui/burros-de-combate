/* BURROS DE COMBATE — guía de la marcha, lo que falta y ayuda en cada pantalla (etapa 1 de «app más didáctica», v0.99.20, pedido del
   usuario, maquetas mostradas antes; la misma idea que la guía del S-2 en INTEL del TOQUI).
   · Guía: 4 fases y 9 pasos con semáforo (v = listo, a = conviene completarlo, r = falta algo que hace que el cálculo salga mal,
     g = todavía no corresponde), un dato corto por paso, avance y botón al siguiente pendiente. Cada paso lleva a su pantalla.
   · Lo que falta: los pasos en rojo o amarillo con qué falta y por qué importa; «Ir ›» lleva a donde se arregla.
   · Ayuda: «¿Qué hago aquí?» por pantalla (3 o 4 líneas y un ejemplo con números). Con el modo ayuda encendido aparece sola la primera
     vez en cada pantalla (`burros_ayuda` = '0' la apaga; `burros_ayuda_vistos`). Las palabras se pasan a civil solas (Uso). */
const Guia = (function(){
  const M = MARCHA;
  const fmt = (x, d)=>(+x).toLocaleString('es-CL', {minimumFractionDigits:d || 0, maximumFractionDigits:d || 0});
  const hh = ms=>{ const d = new Date(ms); return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const esc = s=>String(s===undefined || s===null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ctx: {R, civil, lista:{h, t}, zonaOk}
  function estado(m, ctx){
    const R = ctx.R, p = m.par || {}, civil = ctx.civil, E = m.ejec;
    const ok = R.puntos.filter(x=>x.ok), sinCota = m.puntos.map((x, i)=>({x, i})).filter(({x, i})=>R.puntos[i] && R.puntos[i].lat!==null && R.puntos[i].lat!==undefined && !isNaN(R.puntos[i].lat) && x.cota==='');
    const hayRuta = R.tramos.length>0, pasos = [];
    const paso = (k, fase, n, est, dato, ir, falta)=>pasos.push({k, fase, n, est, dato, ir, falta});
    // A · Planificar
    if(ok.length<2) paso(1, 'A', 'Ruta en el mapa', 'r', 'falta la ruta', {v:'mapa'}, {t:'Falta la ruta', p:'Marca al menos dos puntos en el Mapa (o escríbelos en Datos)'});
    else if(sinCota.length) paso(1, 'A', 'Ruta en el mapa', 'r', sinCota.length + ' sin cota', {v:'ruta', sec:'⛰'},
      {t:sinCota.length + ' punto' + (sinCota.length===1 ? '' : 's') + ' sin cota', p:sinCota.slice(0, 4).map(({x, i})=>x.nombre || 'punto ' + (i + 1)).join(', ') + (sinCota.length>4 ? '…' : '') + ': el desnivel y los tiempos salen mal'});
    else paso(1, 'A', 'Ruta en el mapa', 'v', m.puntos.length + ' puntos', {v:'mapa'});
    paso(2, 'A', 'Cálculo de tiempos', hayRuta ? 'v' : 'g', hayRuta ? (M.METODOS[p.metodo] || '').split(':')[0].replace(/\s*\(.*$/, '').toLowerCase() : '', {v:'ruta', sec:'Cálculo de tiempos'});
    const conMaterial = Object.keys(m.material || {}).length>0 || p.cargaManual;   // se tocó algo del material, o la carga se escribió a mano
    if(!(+p.efectivo>0)) paso(3, 'A', 'Unidad y material', 'r', 'falta efectivo', {v:'ruta', sec:'Unidad y columna'}, {t:'Falta el efectivo', p:'Sin él no se calcula la columna ni la carga de cada uno'});
    // qué se revisa depende de cómo se calcula la carga (v0.99.25, pedido del usuario): por elementos → el material; por SOP → los kilos del
    // SOP; por peso de la unidad (balanza) → que estén anotados los pesos, no el material
    else if(p.modoCarga==='unidad'){ const n = Math.max(1, Math.round(+p.efectivo)), k = (m.pesoUnidad || []).slice(0, n).filter(x=>x && Object.values(x).some(v=>v!=='' && v!==null && v!==undefined)).length;
      if(k>=n) paso(3, 'A', 'Unidad y material', 'v', 'pesos de ' + n + (civil ? ' personas' : ' hombres'), {v:'material'});
      else paso(3, 'A', 'Unidad y material', 'a', k ? k + ' de ' + n + ' pesados' : 'faltan los pesos', {v:'material'}, {t:k ? 'Faltan pesos de la unidad: ' + k + ' de ' + n : 'Faltan los pesos de la unidad', p:'Anota el peso de cada integrante (en la balanza o por líneas); con eso se calcula la marcha'}); }
    else if(p.modoCarga==='sop'){ if(Object.keys(m.sop || {}).length) paso(3, 'A', 'Unidad y material', 'v', 'pesos según SOP', {v:'material'});
      else paso(3, 'A', 'Unidad y material', 'a', 'SOP sin revisar', {v:'material'}, {t:'Pesos del SOP sin revisar', p:'Revisa los kilos por línea de cada puesto según el SOP de tu unidad (vacío = lo que da el detalle)'}); }
    else if(!conMaterial) paso(3, 'A', 'Unidad y material', 'a', 'material sin revisar', {v:'material'}, {t:'Material sin revisar', p:'La carga sale de lo escrito (' + fmt(p.carga || 20) + ' kg), no del material que se lleva'});
    else paso(3, 'A', 'Unidad y material', 'v', fmt(p.efectivo) + (civil ? ' personas' : ' hombres'), {v:'material'});
    if(!m.fecha) paso(4, 'A', 'Luz, calor y agua', 'r', 'sin fecha', {v:'ruta', sec:'Fecha, hora y coordenadas'}, {t:'Sin fecha', p:'Sin fecha no se calculan la luz, la luna ni la declinación'});
    else if(!(p.temp!=='' && p.temp!==undefined && p.temp!==null) && !p.wbgt) paso(4, 'A', 'Luz, calor y agua', 'a', 'sin temperatura', {v:'ruta', sec:'Calor y agua'}, {t:'Sin temperatura ni humedad', p:'No se calculan el agua ni los altos por calor (botón «Traer del pronóstico»)'});
    else paso(4, 'A', 'Luz, calor y agua', 'v', p.temp ? fmt(p.temp) + ' °C' : 'listo', {v:'luz'});
    const planOk = !pasos.some(x=>x.est==='r');
    // B · Revisar y difundir
    paso(5, 'B', 'Cuadro y perfil', hayRuta ? 'v' : 'g', hayRuta ? fmt(R.res.dist/1000, 1) + ' km · ' + M.verDur(R.res.total) : '', {v:'cuadro'});
    if(m.difundido) paso(6, 'B', civil ? 'Plan al contacto' : 'Documento y envío al C2', 'v', 'enviado ' + hh(m.difundido), {v:'enviar'});
    else paso(6, 'B', civil ? 'Plan al contacto' : 'Documento y envío al C2', planOk && hayRuta ? 'a' : 'g', 'no enviado', {v:'enviar'},
      planOk && hayRuta ? {t:civil ? 'Plan sin dejar a tu contacto' : 'Plan no enviado al C2', p:civil ? 'Deja el plan de ruta a alguien que no va (por si no vuelves a la hora)' : 'El C2 no tiene el plan de la marcha (Enviar o documento)'} : null);
    // C · Ejecutar
    const enCurso = E && E.inicio && !E.manual && E.estado!=='fin', fin = E && E.inicio && (E.estado==='fin' || E.manual);
    const listaOk = ctx.lista.t && ctx.lista.h>=ctx.lista.t;
    if(!hayRuta) paso(7, 'C', 'Antes de salir', 'g', '', {v:'lista'});
    else if(fin) paso(7, 'C', 'Antes de salir', 'v', 'hecho', {v:'lista'});
    else if(!ctx.zonaOk) paso(7, 'C', 'Antes de salir', 'a', 'zona sin guardar', {v:'mapa', zonas:true}, {t:'Zona sin guardar para usar sin señal', p:'Sin señal no se verá la carta en terreno (Mapa → ⬇ Sin señal)'});
    else if(!listaOk) paso(7, 'C', 'Antes de salir', 'a', 'lista ' + ctx.lista.h + ' de ' + ctx.lista.t, {v:'lista'}, {t:'Lista de verificación: ' + ctx.lista.h + ' de ' + ctx.lista.t, p:'Revisa lo de antes de salir'});
    else paso(7, 'C', 'Antes de salir', 'v', 'listo', {v:'lista'});
    paso(8, 'C', 'Seguir la marcha', fin ? 'v' : enCurso ? 'a' : 'g', fin ? 'terminada' : enCurso ? 'en curso' : '', {v:'seguir'});
    // D · Después
    if(fin){ const rs = m.resena || {}; paso(9, 'D', 'Resultado y reseña', rs.resultado ? 'v' : 'a', rs.resultado ? 'reseña escrita' : 'falta reseña', {v:'resultado'},
      rs.resultado ? null : {t:'Falta la reseña', p:'Anota cómo resultó, el personal, el material y las lecciones'}); }
    else paso(9, 'D', 'Resultado y reseña', 'g', '', {v:'resultado'});
    return pasos;
  }
  const FASES = {A:'A · Planificar', B:'B · Revisar y difundir', C:'C · Ejecutar', D:'D · Después'};
  function html(m, ctx){
    const P = estado(m, ctx), listos = P.filter(x=>x.est==='v').length, sig = P.find(x=>x.est==='r') || P.find(x=>x.est==='a') || P.find(x=>x.est==='g');
    const falta = P.filter(x=>x.falta && (x.est==='r' || x.est==='a'));
    let h = `<div class="tarjeta guia" id="guia"><div class="g-cab"><b>Guía de la marcha</b><span>${listos} de ${P.length} listos</span></div>
      <div class="g-bar"><i style="width:${Math.round(listos/P.length*100)}%"></i></div>`;
    let fase = null;
    P.forEach(x=>{ if(x.fase!==fase){ fase = x.fase; h += `<div class="g-fase">${FASES[fase]}</div>`; }
      h += `<button class="g-paso" data-gpaso="${x.k}"><span class="g-d ${x.est}"></span><span class="g-n">${x.k} ${esc(x.n)}</span><span class="g-x">${esc(x.dato || '')}</span></button>`; });
    h += `</div>`;
    if(sig) h += `<div class="btns"><button class="btn pri" data-gpaso="${sig.k}">Siguiente: ${sig.k} ${esc(sig.n)} ›</button></div>`;
    if(falta.length) h += `<div class="tarjeta guia" id="falta"><div class="g-cab"><b>Lo que falta</b><span>${falta.length} pendiente${falta.length===1 ? '' : 's'}</span></div>
      ${falta.map(x=>`<button class="g-falta" data-gpaso="${x.k}"><span class="g-d ${x.est}"></span><span><b>${esc(x.falta.t)}</b><small>${esc(x.falta.p)}</small></span><span class="g-ir">Ir ›</span></button>`).join('')}
      <p class="nota g-ley"><span class="g-d r"></span> impide calcular bien · <span class="g-d a"></span> conviene · <span class="g-d v"></span> listo</p></div>`;
    return {html:h, pasos:P};
  }

  /* ---------- ayuda por pantalla ---------- */
  const AYUDA = {
    marchas:['Marchas', ['Aquí están tus marchas. Toca una para abrirla: arriba aparece la guía con los pasos y lo que falta.',
      'Sigue los pasos en orden: el semáforo te dice qué está listo (verde), qué conviene completar (amarillo) y qué falta (rojo).'],
      'Ejemplo: «3 Unidad y material» en rojo = falta el efectivo; tócalo y la app te lleva a donde se escribe.'],
    ruta:['Datos de la marcha', ['Aquí se escriben los datos que no se ven en el mapa: fecha y hora de partida, el método de cálculo, la unidad, el calor y los nombres clave.',
      'Cada tarjeta se abre al tocarla. Abajo están los puntos, en orden de marcha; la cota de cada punto es obligatoria (o se completa desde el terreno).'],
      'Ejemplo: partida 08:00, método «montaña», 30 hombres con 20 kg → la app calcula a qué hora se llega a cada punto.'],
    material:['Material y carga', ['Marca qué lleva cada uno y en qué línea o bolsillo. La app suma el peso y la carga por hombre sale de aquí.',
      'Con más carga se marcha más lento: el tiempo de la marcha se calcula con el más cargado.'],
      'Ejemplo: fusil 3,5 kg + SPB 9 kg + mochila 12 kg → 24,5 kg por hombre.'],
    mapa:['Mapa', ['Marca la ruta tocando el mapa con «＋ Agregar puntos», en orden de marcha. La cota se pone sola desde el terreno.',
      'Para ajustar, mantén presionado un punto y arrástralo; tocando una línea se mete un punto en ese tramo. ↶ deshace.'],
      'Ejemplo: PIM en el inicio del sendero, PC1 en el cruce, PC2 en el portezuelo y PTM al final.'],
    cuadro:['Cuadro de marcha y navegación', ['Es el resultado del cálculo: para cada tramo, rumbo, distancia, desnivel, pendiente, tiempo y hora de llegada.',
      'Con esto se navega y se informa por radio. «Documento» lo deja listo para imprimir o pasar a PDF.'],
      'Ejemplo: PC1 → PC2: rumbo 323°, 623 m, +180 m, 43 min, llega 09:24.'],
    perfil:['Perfil', ['El dibujo de las subidas y bajadas de la ruta, con los puntos de control.', 'Sirve para ver dónde están las pendientes fuertes y planificar los altos.'],
      'Ejemplo: la subida más dura está entre PC2 y PC3 (40 %).'],
    matriz:['Matriz de eventos', ['Cada punto de control con su nombre clave para la radio y la hora planificada.', 'Durante la marcha (Seguir) se completan la hora real y la diferencia con el plan.'],
      'Ejemplo: «PASANDO BRAVO» a las 08:34 (plan 08:30) → +4 min.'],
    lista:['Lista de verificación', ['Lo que hay que revisar antes, durante y después de la marcha. Marca cada cosa al hacerla.'],
      'Ejemplo: antes de salir, la zona del mapa guardada para usar sin señal.'],
    resultado:['Resultado y reseña', ['Compara lo planificado con lo que se hizo: horas, velocidad real y altos.', 'Escribe la reseña: cómo resultó, el personal, el material y las lecciones para la próxima.'],
      'Ejemplo: marchó 15 % más lento que el plan → la próxima, usar el ritmo «Bajo».'],
    luz:['Luz', ['Sol, crepúsculos y luna del día de la marcha en el lugar de la ruta.', 'Sirve para saber cuánto se marcha con luz y cuánto de noche.'],
      'Ejemplo: sale el sol 07:12, se pone 20:05; luna llena: noche clara.'],
    seguir:['Seguir', ['Durante la marcha: la app te dice el próximo punto, la distancia, el rumbo y si vas adelantado o atrasado. Al llegar a un punto lo marca sola (a menos de 40 m).',
      'Mantén la pantalla encendida. Mantén presionado «PASANDO» para enviar el mensaje por WhatsApp o SMS.'],
      'Ejemplo: «Próximo BRAVO · 715 m · 314° · llega 08:34».'],
    enviar:['Enviar', ['Envía el plan: ① elige la marcha, ② a quién (C2 TOQUI, otro teléfono, GPS, Excel…), ③ Enviar.'],
      'Ejemplo: al C2 TOQUI va un archivo KML que se abre como calco con la ruta y los puntos de control.']};
  const LS = (k, v)=>{ try { if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch(e){ return null; } };
  const encendida = ()=>LS('burros_ayuda')!=='0';
  const vistos = ()=>{ try { return JSON.parse(LS('burros_ayuda_vistos') || '{}'); } catch(e){ return {}; } };
  function marcarVisto(v){ const o = vistos(); o[v] = 1; LS('burros_ayuda_vistos', JSON.stringify(o)); }
  function poner(on){ LS('burros_ayuda', on ? '1' : '0'); if(on) LS('burros_ayuda_vistos', '{}'); }
  const tarjeta = (v, enDialogo)=>{ const a = AYUDA[v]; if(!a) return '';
    return `<div class="ayuda${enDialogo ? ' en-dialogo' : ''}" id="ayudaC"><b>${esc(a[0])}</b>${a[1].map(t=>`<p>${esc(t)}</p>`).join('')}<p class="ej">${esc(a[2])}</p>
      <div class="btns"><button class="btn pri" data-ay="ok">Entendido</button><button class="btn" data-ay="ej">Ver con el ejemplo</button>${enDialogo ? '' : '<button class="btn" data-ay="no">No mostrar más</button>'}</div></div>`; };
  /* ---------- ejemplo guiado (v0.99.21, etapa 2): los 9 pasos de la guía sobre la marcha de ejemplo ---------- */
  const TOUR = [
    {n:'Ruta en el mapa', v:'mapa', t:'La ruta se marca en el Mapa, en orden de marcha: PIM, PC1, PC2… y el regreso. La cota de cada punto se pone sola. El ejemplo sube al cerro Manquehue y vuelve por el mismo camino.'},
    {n:'Cálculo de tiempos', v:'ruta', sec:'Cálculo de tiempos', t:'Aquí se elige cómo se calcula: montaña, MIDE, marcha general, forzada o carrera de combate. El ejemplo usa «montaña», tropa normal y 20 kg.'},
    {n:'Unidad y material', v:'ruta', sec:'Unidad y columna', t:'Cuántos marchan, en qué formación y a qué distancia. Con el efectivo se calcula la columna; en «Material y carga» se marca lo que lleva cada uno.'},
    {n:'Luz, calor y agua', v:'luz', t:'Sol, crepúsculos y luna del día de la marcha. En Datos → «Calor y agua» se trae la temperatura del pronóstico y la app calcula el agua y los altos por calor.'},
    {n:'Cuadro y perfil', v:'cuadro', t:'El resultado del cálculo: por tramo, rumbo, distancia, desnivel, tiempo y hora de llegada. En «Perfil» se ven las subidas y bajadas.'},
    {n:'Documento y envío', v:'enviar', t:'Se envía el plan: al C2 TOQUI como calco, a otro teléfono, a un GPS o a Excel. Con «Documento» queda listo para imprimir.'},
    {n:'Antes de salir', v:'lista', t:'La lista de verificación de antes, durante y después. Antes de salir, guarda la zona del mapa para usarla sin señal (Mapa → ⬇ Sin señal).'},
    {n:'Seguir la marcha', v:'seguir', t:'Durante la marcha: próximo punto, distancia, rumbo y si se va adelantado o atrasado. Al llegar a cada punto lo marca sola; mantén presionado «PASANDO» para enviar el mensaje.'},
    {n:'Resultado y reseña', v:'resultado', t:'Después: se compara lo planificado con lo que se hizo y se escribe la reseña con las lecciones para la próxima.'}];
  return {estado, html, AYUDA, encendida, vistos, marcarVisto, poner, tarjeta, TOUR};
})();
if(typeof globalThis!=='undefined') globalThis.Guia = Guia;
