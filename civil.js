/* BURROS DE COMBATE — uso militar o civil (montañismo, trekking, scouts, guías, rescate).
   El cálculo es el mismo; en modo civil cambian las palabras, el material, la lista, el glosario, Enviar y Seguir.
   Uso.modo se guarda en burros_datos.uso. Las palabras se cambian solas en pantalla (Uso.traducir, con un observador del DOM). */
const Uso = (function(){
  let modo = 'militar';
  try { modo = (JSON.parse(localStorage.getItem('burros_datos')) || {}).uso === 'civil' ? 'civil' : 'militar'; } catch(e){}
  const civil = ()=>modo==='civil';

  // palabras militares → civiles (las más largas primero; se respetan mayúsculas tal como están escritas)
  const PALABRAS = [
    ['ORDEN GRÁFICA DE MARCHA', 'PLAN DE RUTA'], ['Orden gráfica', 'Plan de ruta'], ['orden gráfica', 'plan de ruta'],
    ['Documento / orden gráfica', 'Documento / plan de ruta'], ['anexar a la OPORD', 'adjuntar al plan de ruta'], ['la OPORD', 'el plan de ruta'], ['OPORD', 'plan de ruta'],
    ['Equipo especial común de la patrulla', 'Equipo común del grupo'], ['Equipo de cada puesto (OME)', 'Equipo de cada rol'], ['Puestos (OME)', 'Roles del grupo'], ['Equipo especial común', 'Equipo común del grupo'], ['Equipo especial de la patrulla', 'Equipo común del grupo'], ['Fusilero o patrullero', 'Integrante'], ['Comandante o jefe de patrulla', 'Guía o líder del grupo'], ['Radioperador', 'Encargado de radio'], ['Sirviente de ametralladora', 'Portador'], ['el más cargado', 'el más cargado'], ['Mochila de trauma (enfermero u operador de trauma)', 'Botiquín grande del grupo (primeros auxilios avanzados)'],
    ['IFAK: botiquín individual de combate', 'Botiquín individual de emergencia'], ['Ración de combate', 'Comida del día (ración)'], ['ración de combate', 'comida del día'],
    ['la carga de combate habitual (27–36 kg)', 'una carga razonable (revisa el porcentaje de tu peso)'],
    ['Matriz de eventos', 'Registro de la ruta'], ['matriz de eventos', 'registro de la ruta'],
    ['Nombres clave y eventos para la radio', 'Puntos de control y radio'],
    ['Unidad y columna', 'Grupo y columna'], ['Unidades de marcha', 'Grupos de marcha'], ['unidades de marcha', 'grupos de marcha'], ['unidad de marcha', 'grupo de marcha'],
    ['Distancia entre unidades', 'Distancia entre grupos'], ['entre unidades', 'entre grupos'],
    ['toda la unidad', 'todo el grupo'], ['de la unidad', 'del grupo'], ['a la unidad', 'al grupo'], ['la unidad', 'el grupo'], ['La unidad', 'El grupo'],
    ['Tropa normal', 'Grupo normal'], ['Tropa andina', 'Grupo con experiencia en altura'], ['tropa andina', 'grupo con experiencia en altura'],
    ['tropa normal', 'grupo normal'], ['de la tropa', 'del grupo'], ['la tropa', 'el grupo'], ['Tropa', 'Grupo'], ['tropa', 'grupo'],
    ['Total por hombre', 'Total por persona'], ['Carga por hombre', 'Carga por persona'], ['por hombre', 'por persona'], ['cada hombre', 'cada persona'],
    ['Hombres', 'Personas'], ['hombres', 'personas'], ['hombre', 'persona'],
    ['Efectivo', 'Número de personas'], ['falta el efectivo', 'falta el número de personas'], ['Falta el efectivo', 'Falta el número de personas'],
    ['el efectivo', 'el número de personas'], ['efectivo', 'número de personas'],
    ['jefes de grupo', 'líderes'], ['jefe de grupo', 'líder'], ['comandante', 'guía'], ['Comandante', 'Guía'],
    ['Altos programados', 'Descansos programados'], ['Primer alto', 'Primer descanso'], ['primer alto', 'primer descanso'], ['Luego un alto', 'Luego un descanso'],
    ['⏸ Alto', '⏸ Descanso'], ['En alto', 'En descanso'], ['ALTO NO PLANIFICADO', 'DESCANSO NO PLANIFICADO'], ['Alto horario', 'Descanso'],
    ['Altos', 'Descansos'], ['altos', 'descansos'], ['un alto', 'un descanso'], ['del alto', 'del descanso'], ['el alto', 'el descanso'],
    ['INICIO DE MARCHA', 'INICIO'], ['FIN DE MARCHA', 'LLEGADA'],
    ['Eventos', 'Puntos de control'], ['eventos', 'puntos de control'], ['Evento', 'Punto de control'], ['evento', 'punto de control'],
    ['Cuchillo o bayoneta', 'Cuchillo o cortaplumas'], ['3.ª línea A', 'Mochila de día'], ['3.ª línea B', 'Mochila grande'], ['3.ª A', 'Mochila de día'], ['3.ª B', 'Mochila grande'], ['1.ª línea', 'En el cuerpo'], ['2.ª línea', 'Cinturón y bolsillos'], ['3.ª línea', 'Mochila'], ['4.ª línea', 'Se queda en el vehículo'], ['4.ª (vehículo)', 'Vehículo'],
    ['Rezagado', 'Persona atrasada'], ['rezagados', 'atrasados'],
    ['C2', 'contacto']];
  const RE = PALABRAS.map(([a, b])=>[new RegExp('(^|[^\\wÁÉÍÓÚÑáéíóúñ])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\wÁÉÍÓÚÑáéíóúñ])', 'g'), b]);
  // PIM / PTM como palabras sueltas (no dentro de otras)
  RE.push([/(^|[^\wÁÉÍÓÚÑáéíóúñ])PIM(?![\wÁÉÍÓÚÑáéíóúñ])/g, 'Inicio'], [/(^|[^\wÁÉÍÓÚÑáéíóúñ])PTM(?![\wÁÉÍÓÚÑáéíóúñ])/g, 'Término']);
  const cambiar = t=>{ let s = t; for(const [r, b] of RE) s = s.replace(r, (x, pre)=>pre + b); return s; };
  const SALTAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE']);
  function traducir(raiz){
    if(!civil() || !raiz) return;
    if(raiz.nodeType===3){ const v = cambiar(raiz.nodeValue); if(v!==raiz.nodeValue) raiz.nodeValue = v; return; }
    if(raiz.nodeType!==1 || SALTAR.has(raiz.tagName) || (raiz.classList && raiz.classList.contains('mensaje'))) return;
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {acceptNode:n=>{ const p = n.parentElement; return p && !SALTAR.has(p.tagName) && !p.closest('.mensaje,.sin-traducir') ? 1 : 2; }});
    const nodos = []; while(w.nextNode()) nodos.push(w.currentNode);
    nodos.forEach(n=>{ const v = cambiar(n.nodeValue); if(v!==n.nodeValue) n.nodeValue = v; });
    raiz.querySelectorAll('[placeholder],[title],[aria-label]').forEach(e=>['placeholder', 'title', 'aria-label'].forEach(a=>{ const v = e.getAttribute(a); if(v){ const c = cambiar(v); if(c!==v) e.setAttribute(a, c); } }));
  }
  // observa lo que se dibuja y lo traduce al vuelo (pantallas, diálogos, documento, avisos)
  let obs = null;
  function observar(){
    if(obs || typeof MutationObserver==='undefined') return;
    obs = new MutationObserver(lista=>{ if(!civil()) return; lista.forEach(r=>{ if(r.type==='characterData') return; r.addedNodes.forEach(traducir); }); });
    obs.observe(document.body, {childList:true, subtree:true});
  }
  function poner(m){ modo = m==='civil' ? 'civil' : 'militar'; document.body.classList.toggle('civil', civil()); const b = document.querySelector('#pestanas [data-v=enviar] span'); if(b) b.textContent = civil() ? 'Compartir' : 'Enviar'; }

  /* ---------- lista de verificación civil ---------- */
  const LISTA = [
    {fase:'Antes de salir', items:[
      ['ca1', 'Elegir una ruta acorde a la experiencia y el estado físico del grupo más débil.', ''],
      ['ca2', 'Revisar el pronóstico del tiempo (viento, lluvia, nieve, calor) y la hora de puesta de sol.', ''],
      ['ca3', 'Permisos y accesos: parque, propietario del terreno, zona fronteriza, temporada.', ''],
      ['ca4', 'Dejar el plan de ruta a un contacto de emergencia: ruta, integrantes, hora de salida, hora límite de regreso y qué hacer si no hay noticias.', ''],
      ['ca5', 'Fijar una hora límite de regreso (hora de retirada): si no se llega a la cumbre o al punto clave a esa hora, se regresa.', ''],
      ['ca6', 'Mapa o carta, brújula y teléfono con la ruta cargada y la batería llena (más batería externa).', ''],
      ['ca7', 'Botiquín, agua suficiente, comida, abrigo, impermeable, linterna y protección solar.', ''],
      ['ca8', 'Revisar el equipo y el calzado (ya amoldado); calcetines secos.', ''],
      ['ca9', 'Saber los teléfonos de emergencia y si hay señal en la ruta.', ''],
      ['ca10', 'Hidratarse antes de partir.', '']]},
    {fase:'Durante la ruta', items:[
      ['cd1', 'Ir al ritmo del más lento; nadie camina solo ni se separa del grupo.', ''],
      ['cd2', 'Primer descanso corto en la primera media hora para ajustar calzado y mochila.', ''],
      ['cd3', 'Beber y comer un poco en cada descanso; no esperar a tener sed.', ''],
      ['cd4', 'Controlar la hora en cada punto de control; respetar la hora límite de regreso.', ''],
      ['cd5', 'Tratar las ampollas apenas aparecen.', ''],
      ['cd6', 'Observar el clima: ante tormenta, niebla o viento fuerte, evaluar regresar.', ''],
      ['cd7', 'Informar al contacto en los puntos con señal.', '']]},
    {fase:'Al regresar', items:[
      ['cp1', 'Contar a todo el grupo y avisar la llegada al contacto de emergencia.', ''],
      ['cp2', 'Cuidado de pies; secar el equipo.', ''],
      ['cp3', 'Anotar tiempos reales para mejorar la próxima planificación.', '']]}];

  /* ---------- glosario civil ---------- */
  const SACAR = new Set(['GDH', 'OPORD / O. Op.', 'C2', 'Evento', '‰ (milésimas)']);
  const glosario = g=>civil() ? g.filter(([k])=>!SACAR.has(k)).map(([k, v])=>k==='PIM' ? ['Inicio', 'Punto de partida de la ruta.'] : k==='PTM' ? ['Término', 'Punto de llegada de la ruta.'] : [k, cambiar(v)]) : g;

  // valores por defecto de una marcha nueva en modo civil
  const parCivil = ()=>({claves:'ninguna', verbo:'EN', altos:0.10,
    motivosAlto:'Descanso\nComida\nAgotamiento momentáneo\nLesionado\nMirador / foto\nOrientación\nAgua\nClima',
    novedades:'Lesionado\nPersona atrasada\nRuta cortada\nCambio de ruta\nClima adverso\nSin señal\nMaterial perdido'});

  return {get modo(){ return modo; }, civil, poner, traducir, observar, cambiar, LISTA, glosario, parCivil};
})();
if(typeof globalThis!=='undefined') globalThis.Uso = Uso;
