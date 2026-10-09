/* BURROS DE COMBATE — lista de verificación de la marcha (antes, durante y después).
   Los id son fijos: se guardan las marcas por marcha en m.lista. */
const LISTA = [
  {fase:'Antes de la marcha', items:[
    ['a1', 'Leer la OPORD: itinerario, horarios y equipo necesario.', ''],
    ['a2', 'Reunir información: cartas topográficas, antecedentes de la unidad, personal que conozca la zona, imágenes satelitales y legajos topográficos.', ''],
    ['a3', 'Definir los puntos de control (tramos de igual pendiente y dirección, puntos característicos, referencias visuales) y sus nombres clave para la radio.', ''],
    ['a4', 'Punto inicial (PIM) y punto de término fáciles de reconocer en la carta y en el terreno; no en desfiladeros, cerros ni curvas cerradas; ninguna unidad pasa a través de otra.', 'ATP 1-110'],
    ['a5', 'Croquis de itinerario (transparencia o Google Earth) con la ruta y los puntos de control.', ''],
    ['a6', 'Cuadro de marcha, ficha de itinerario (perfil) y ficha de navegación plastificada.', ''],
    ['a7', 'Vuelta al horizonte si la ruta pasa por un portezuelo o una cumbre (azimut, distancia y altitud a tres puntos).', ''],
    ['a8', 'Orden de movimiento: velocidad, distancias, horas de partida y término, altos.', 'ATP ap. B'],
    ['a9', 'Ensayo de la reacción ante contacto.', 'ATP 1-117'],
    ['a10', 'Revisión previa del jefe y ajuste de la carga (combate 27–36 kg; aproximación hasta 45 kg).', 'ATP cap. 3'],
    ['a11', 'Pies: uñas cortas y rectas, limpios y secos con talco, calcetines secos sin hoyos, botas ya amoldadas.', 'ATP E-5'],
    ['a12', 'Hidratarse antes de partir; agua de reserva según la tabla de calor.', 'TB MED 507'],
    ['a13', 'Enviar el plan de marcha al C2.', '']]},
  {fase:'Durante la marcha', items:[
    ['d1', 'Alto de ajuste en la primera media hora (botas y equipo).', 'ATP 1-96'],
    ['d2', 'Primer alto de 15 min después de 45 min de marcha; luego 10 min cada 50 min.', 'ATP 2-62'],
    ['d3', 'Disciplina de marcha: formación, distancias, velocidad, luces, ruido, agua y comunicaciones.', 'ATP 1-31'],
    ['d4', 'Marcador de paso adelante; grupo de rezagados a la retaguardia.', 'ATP 1-97'],
    ['d5', 'Seguridad en cada alto.', 'ATP'],
    ['d6', 'Beber en cada alto y durante la marcha.', 'ATP 2-173'],
    ['d7', 'En los altos: sacarse una bota a la vez, masaje, talco, calcetines secos, tratar ampollas.', 'ATP E-6'],
    ['d8', 'Rotar armas pesadas y cargas hacia los menos cansados.', 'ATP'],
    ['d9', 'El enfermero u operador de trauma evalúa a la tropa en cada alto.', 'ATP 2-181'],
    ['d10', 'Matriz de eventos al día: informar «PASANDO …» en cada punto, altos con su motivo, novedades y nuevos puntos de control.', ''],
    ['d11', 'Fotos amplias anotando coordenada, azimut, fecha y hora.', '']]},
  {fase:'Después de la marcha', items:[
    ['p1', 'Seguridad del área y control del 100 % del personal y del equipo.', 'ATP 2-157'],
    ['p2', 'Cuidado de pies; lavar y secar calcetines; secar botas.', 'ATP E-7'],
    ['p3', 'Mantenimiento del equipo; reponer agua y alimento.', 'ATP'],
    ['p4', 'Recuperación de unas 24 h si la marcha fue agotadora.', 'ATP 3-31'],
    ['p5', 'Reseña del itinerario (descripción narrada, con tiempos de marcha y no horas).', ''],
    ['p6', 'Croquis de itinerario con la ruta realmente ejecutada.', ''],
    ['p7', 'Informe de reconocimiento (si corresponde) y set fotográfico.', '']]}
];
if(typeof globalThis!=='undefined') globalThis.LISTA = LISTA;

/* Material para la marcha: cada elemento calcula su cantidad con los datos de la marcha (c = contexto) o devuelve null si no
   corresponde. c = {n (efectivo, mínimo 1), hay (si se indicó el efectivo), horas, km, noche (fracción de la marcha de noche),
   montana, nieve, terreno, aguaH (L por hombre por hora), calorCat, unidades (de marcha), carga}. Las cantidades son SUGERENCIAS:
   el agua sale de la tabla de calor; el resto se ajusta según la orden. Ids fijos (las marcas y cantidades se guardan en m.material). */
const MATERIAL = [
  {g:'Armamento y protección', items:[
    ['fusil', 'Fusil (con correa y accesorios)', c=>c.civil ? null : c.n, c=>'1 por hombre; las armas de apoyo van en los puestos (OME)'],
    ['cargad', 'Cargadores con munición', c=>c.civil ? null : c.n*6, c=>'6 por hombre (dotación sugerida: ajústala)'],
    ['muniExtra', 'Cargadores adicionales (mochila de asalto)', c=>c.civil ? null : 0, c=>'munición extra para la tarea: cuántos por hombre'],
    ['granada', 'Granadas de mano', c=>c.civil ? null : 0, c=>'si la misión lo exige: escribe cuántas por hombre'],
    ['casco', 'Casco', c=>c.civil ? null : c.n, c=>'1 por hombre'],
    ['chaleco', 'Chaleco antibalas con placas', c=>c.civil ? null : c.n, c=>'escribe 0 si no se usa'],
    ['portaf', 'Cinturón de carga', c=>c.civil ? null : c.n, c=>'donde va la 2.ª línea']]},
  // equipo que sirve a toda la unidad para la misión o la marcha: se escribe el total y su peso se reparte entre todos
  {g:'Equipo especial de la patrulla', items:[
    ['radio', 'Radio', c=>Math.max(1, c.unidades) + 1, c=>'1 por unidad de marcha + la del comandante'],
    ['batRad', 'Baterías de repuesto para radio', c=>(Math.max(1, c.unidades) + 1)*Math.max(1, Math.ceil(c.horas/8)), c=>'1 por radio cada 8 h'],
    ['camilla', 'Camilla plegable', c=>c.n>=10 ? Math.ceil(c.n/40) : null, c=>'1 cada 40 hombres'],
    ['cuerda', 'Cuerda de seguridad', c=>c.montana || c.nieve ? Math.max(1, Math.ceil(c.n/10)) : null, c=>'1 cada 10 hombres para pasos difíciles'],
    ['otroEq', 'Otro equipo de la unidad', c=>0, c=>'o agrega elementos propios con «＋ Agregar»']]},
  {g:'Agua y alimentación', items:[
    ['agua', 'Agua por hombre (cantimplora o bolsa de hidratación)', c=>litros(c.agua.inicial) + ' L', c=>'≈ ' + litros(c.aguaH, 2) + ' L/h × ' + litros(c.agua.segs[0].fin - c.agua.segs[0].ini, 1) + ' h ' + (c.reabast ? 'hasta el primer punto de agua' : 'de marcha (sin reabastecimiento)') + ' + 1 L de reserva' + (c.calorDato ? '' : ' · sin datos de calor: se usa calor bajo') + (c.agua.diaria>11.4 ? ' · más de 11,4 L en el día: sobre el máximo recomendado' : '')],
    ['aguaT', 'Agua total de la unidad', c=>c.hay ? Math.ceil(c.n*(c.aguaH*c.horas + 1)) + ' L' : null, c=>'consumo de ' + c.n + ' hombres en toda la marcha'],
    ['reabast', 'Reabastecimiento de agua en ruta', c=>c.reabast ? c.agua.puntos + ' punto(s)' : null, c=>c.agua.puntos ? 'en cada punto de agua se repone hasta ' + litros(c.agua.max) + ' L por hombre' : 'marca los puntos de agua en Puntos'],
    ['potab', 'Pastillas o filtro potabilizador', c=>c.horas>6 || c.reabast ? Math.ceil(c.n/10) + ' juego(s)' : null, c=>'agua de ríos o vertientes'],
    ['sales', 'Sales de rehidratación / electrolitos', c=>c.horas>4 || c.calorCat>=3 ? c.n*Math.ceil(c.horas/4) + ' sobres' : null, c=>'1 sobre cada 4 h de marcha'],
    ['racion24', 'Ración de combate de 24 h (tipo MRE)', c=>c.racion!=='12' && c.horas>=6 ? c.n*Math.ceil(c.horas/24) : null, c=>'1 por hombre cada 24 h (3 comidas, ≈ 1,3 kg)'],
    ['racion12', 'Ración de combate de 12 h (tipo MRE)', c=>c.racion==='12' && c.horas>=6 ? c.n*Math.ceil(c.horas/12) : null, c=>'1 por hombre cada 12 h (2 comidas, ≈ 0,9 kg)'],
    ['colac', 'Colación de marcha (barras, frutos secos)', c=>c.n, c=>'para los altos']]},
  {g:'Sanidad', items:[
    ['ifak', 'IFAK: botiquín individual de combate', c=>c.n, c=>'torniquete, vendaje compresivo, gasa hemostática, sello de tórax, cánula y guantes'],
    ['botPA', 'Botiquín de primeros auxilios pequeño', c=>c.n, c=>'heridas menores, ampollas y cuidado de pies, medicamentos básicos'],
    ['socorr', 'Enfermero o socorrista', c=>Math.max(1, Math.ceil(c.n/30)), c=>'1 cada 30 hombres; revisa a la tropa en cada alto'],
    ['calcet', 'Calcetines de recambio', c=>c.n*(c.horas>8 ? 2 : 1) + ' pares', c=>'cambio a mitad de la marcha'],
    ['manta', 'Manta térmica', c=>Math.max(1, Math.ceil(c.n/10)), c=>'1 cada 10 hombres'],
    ['solar', 'Protector solar y labial', c=>c.noche<0.9 ? Math.max(1, Math.ceil(c.n/5)) : null, c=>'marcha con luz de día'],
    ['evac', 'Plan de evacuación (punto, vehículo, frecuencia)', c=>'1', c=>'para lesionados o rezagados']]},
  {g:'Navegación y control', items:[
    ['carta', 'Carta(s) de la zona', c=>Math.max(1, c.unidades) + '+', c=>'1 por unidad de marcha'],
    ['brujula', 'Brújula', c=>Math.max(1, Math.ceil(c.n/10)), c=>'1 por jefe de grupo'],
    ['gps', 'GPS o teléfono con Burros de Combate cargado', c=>Math.max(1, c.unidades), c=>'con la ruta y la batería llena'],
    ['bateria', 'Batería externa', c=>Math.max(1, c.unidades), c=>'para el teléfono / GPS'],
    ['cuadro', 'Cuadro de marcha y navegación impreso', c=>Math.max(1, c.unidades) + 1, c=>'1 por comandante + 1 de reserva'],
    ['reloj', 'Reloj sincronizado', c=>Math.max(1, Math.ceil(c.n/10)), c=>'jefes de grupo'],
    ['marcador', 'Marcador de paso / contador de pasos', c=>Math.max(1, c.unidades), c=>'a la cabeza de cada unidad']]},
  {g:'Comunicaciones', items:[
    ['claves', 'Lista de nombres clave y frecuencias', c=>Math.max(1, c.unidades) + 1, c=>'«PASANDO ALFA…»'],
    ['silbato', 'Silbato / señales', c=>Math.max(1, Math.ceil(c.n/10)), c=>'jefes de grupo']]},
  {g:'Equipo individual', items:[
    ['mochAs', 'Mochila de asalto o de misión', c=>c.mochilaModo==='dentro' ? null : c.n, c=>'munición, agua y elementos para la tarea'],
    ['mochila', 'Mochila de sostenimiento', c=>c.mochilaModo==='solo' ? null : c.n, c=>'para varios días' + (c.mochilaModo==='dentro' ? '; la de asalto va dentro' : '')],
    ['poncho', 'Poncho o chaqueta impermeable', c=>c.n, c=>''],
    ['abrigo', 'Ropa de abrigo (primera capa, polar)', c=>c.noche>0 || c.montana || c.nieve ? c.n : null, c=>'frío de noche o en altura'],
    ['gorro', 'Gorro y guantes', c=>c.nieve || c.montana ? c.n : null, c=>'montaña o nieve'],
    ['lentes', 'Lentes de sol', c=>c.nieve || c.montana ? c.n : null, c=>'reflejo de la nieve o del sol en altura'],
    ['saco', 'Saco de dormir', c=>c.pernocta ? c.n : null, c=>'marcha con pernocta'],
    ['aislante', 'Aislante (colchoneta)', c=>c.pernocta ? c.n : null, c=>'marcha con pernocta'],
    ['carpa', 'Carpa o vivac', c=>c.pernocta ? Math.ceil(c.n/2) : null, c=>'1 cada 2 (repartida)'],
    ['cocina', 'Cocinilla y gas', c=>c.pernocta ? Math.max(1, Math.ceil(c.n/4)) : null, c=>'1 cada 4 (repartida)'],
    ['olla', 'Olla y utensilios', c=>c.pernocta ? Math.max(1, Math.ceil(c.n/4)) : null, c=>'1 juego cada 4 (repartido)'],
    ['aseo', 'Útiles de aseo', c=>c.pernocta ? c.n : null, c=>'marcha con pernocta'],
    ['sombrero', 'Sombrero o jockey', c=>c.calorCat>=2 || (c.noche<0.5 && !c.nieve) ? c.n : null, c=>'sol y calor']]},
  {g:'Marcha de noche', items:[
    ['linterna', 'Linterna con filtro rojo', c=>c.noche>0 ? c.n : null, c=>'parte de la marcha es de noche'],
    ['luzquim', 'Luces químicas / marcas reflectantes', c=>c.noche>0 ? Math.max(2, Math.ceil(c.n/5)) : null, c=>'cabeza, cola y jefes de grupo'],
    ['pilas', 'Pilas de repuesto', c=>c.noche>0 ? c.n + ' juegos' : null, c=>'para linternas'],
    ['vision', 'Visores nocturnos (si se dispone)', c=>c.noche>0.3 ? Math.max(1, c.unidades) : null, c=>'más de un tercio de la marcha de noche']]},
  {g:'Montaña y nieve', items:[
    ['bastones', 'Bastones de marcha', c=>c.montana ? c.n + ' pares' : null, c=>'pendientes fuertes'],
    ['polainas', 'Polainas', c=>c.nieve ? c.n + ' pares' : null, c=>'nieve'],
    ['raquetas', 'Raquetas', c=>c.terreno==='raquetas' ? c.n + ' pares' : null, c=>'terreno «sobre raquetas»'],
    ['esquies', 'Esquíes y pieles de foca', c=>c.terreno==='esquies' ? c.n + ' equipos' : null, c=>'terreno «sobre esquíes»'],
    ['pala', 'Pala de nieve y sonda', c=>c.nieve ? Math.max(1, Math.ceil(c.n/10)) : null, c=>'1 cada 10 hombres']]}
];
// contexto de la marcha para calcular el material
function contextoMaterial(m, R){
  const p = R.par, hay = (+p.efectivo||0)>0, cal = R.calor;
  const aguaH = cal && cal.lh ? cal.lh : 0.71;   // sin índice de calor: categoría 1, trabajo moderado (¾ qt/h)
  const c0 = {mochilaModo:p.mochilaModo || 'dentro', civil:typeof Uso!=='undefined' && Uso.civil(), pernocta:!!p.pernocta, n:hay ? Math.round(+p.efectivo) : 1, hay, horas:R.res.total || 0, reabast:p.reabast==='si', racion:String(p.racion || '24'), km:R.res.dist/1000, noche:R.fracNoche || 0, aguaH, calorDato:!!(cal && cal.lh),
    calorCat:cal ? cal.cat : 0, montana:['montana', 'mide'].includes(p.metodo), nieve:p.terreno && p.terreno!=='sinNieve' && ['montana', 'mide'].includes(p.metodo), terreno:p.terreno,
    unidades:Math.max(1, Math.round(+p.unidades||1)), carga:p.metodo!=='general' ? p.carga : null};
  c0.agua = aguaPlan(m, R, aguaH, c0.reabast); return c0;
}
const litros = (x, d)=>String(Math.round(x*(d===2 ? 100 : d===1 ? 10 : 2))/(d===2 ? 100 : d===1 ? 10 : 2)).replace('.', ',');
/* Agua que se carga: sin reabastecimiento, toda la de la marcha (L/h × horas + 1 L de reserva); con reabastecimiento, en cada punto de
   agua (m.puntos[i].agua) se repone lo necesario hasta el siguiente + 1 L. Horas desde la partida proporcionales a la marcha acumulada. */
function aguaPlan(m, R, lh, reabast){
  const H = R.res.total || 0, mar = R.res.marcha || 0, cortes = [];
  if(reabast && mar) R.tramos.forEach(t=>{ const q = (m.puntos || [])[t.iB]; if(q && q.agua && t!==R.tramos[R.tramos.length - 1]) cortes.push(H*t.tAcum/mar); });
  const lim = [0, ...cortes, H], segs = [];
  for(let k=0; k<lim.length - 1; k++) segs.push({ini:lim[k], fin:lim[k + 1], litros:lh*(lim[k + 1] - lim[k]) + 1});
  return {lh, H, segs, inicial:segs[0].litros, max:Math.max(...segs.map(x=>x.litros)), puntos:cortes.length, diaria:(lh*H + 1)/Math.max(1, Math.ceil(H/24))};
}
// carga por hombre en cada tramo: la del partir menos el agua ya bebida (se repone en los puntos de agua)
function cargasTramo(m, R, pm){
  const ag = pm.items.find(x=>x.id==='agua'), conAgua = !!(ag && ag.lleva);
  const pl = conAgua ? contextoMaterial(m, R).agua : null, mar = R.res.marcha || 0, kgL = conAgua ? ag.kg : 0, ini = conAgua ? ag.q : 0;   // ag.q: litros al partir
  const enHora = h=>{ if(!pl) return 0; let k = pl.segs.findIndex(x=>h<x.fin + 1e-9); if(k<0) k = pl.segs.length - 1; const sg = pl.segs[k], lleno = k===0 ? ini : sg.litros;
    return Math.max(0, lleno - pl.lh*(h - sg.ini)); };
  // mochilas que se dejan en un punto y se recogen en otro, para el que manda en el tiempo (el más cargado): «deja» = la de sostenimiento
  // (se sigue con la de asalto), «dejaTodo» = las dos; el agua se cuenta aparte aunque vaya en la mochila
  const P = m.puntos || [], L = (pm.mas || {lineas:pm.lineas}).lineas, modo = pm.mochilaModo || 'dentro', menosAgua = l=>conAgua && ag.linea===l ? ag.porHombre : 0;
  const mo3 = pm.sinMochila || modo==='solo' ? 0 : L[3] - menosAgua(3), mo5 = pm.sinMochila ? 0 : (L[5] || 0) - menosAgua(5);
  const quita = e=>e==='deja' ? mo3 : e==='dejaTodo' ? mo3 + mo5 : 0;
  let est = ''; const sinEn = R.tramos.map(t=>{ const q = P[t.iA] || {}; if(q.mochila==='deja' || q.mochila==='dejaTodo') est = q.mochila; if(q.mochila==='recoge') est = ''; return quita(est); });
  const ult = R.tramos.length ? P[R.tramos[R.tramos.length - 1].iB] || {} : {}; if(ult.mochila==='recoge') est = ''; else if(ult.mochila==='deja' || ult.mochila==='dejaTodo') est = ult.mochila;
  const sin = quita(est);
  if(!pl && !sinEn.some(Boolean) && !sin) return null;
  const base = pm.total - ini*kgL, H = pl ? pl.H : R.res.total;
  return {tramos:R.tramos.map((t, k)=>{ const h = mar ? H*(t.tAcum - t.t/2)/mar : 0; return Math.round((base + enHora(h)*kgL - sinEn[k])*10)/10; }),
    inicial:pm.total, final:Math.round((base + enHora(H)*kgL - sin)*10)/10, sinEn, mochila:mo3 + mo5};
}
if(typeof globalThis!=='undefined'){ globalThis.MATERIAL = MATERIAL; globalThis.contextoMaterial = contextoMaterial; globalThis.aguaPlan = aguaPlan; globalThis.cargasTramo = cargasTramo; }

/* Peso de cada elemento del material (kg por unidad, SUGERIDOS y editables en m.material[id].kg) y cómo se carga:
   'h' = cantidad por hombre (agua: se cargan hasta 3 L, 1 kg por litro) · 'i' = individual (1 por hombre, cantidad total de la unidad)
   · 'c' = colectivo (se reparte entre todos) · 'x' = no se carga (personas, planes, agua de reabastecimiento, totales). */
const PESOS = {fusil:[4, 'i'], cargad:[0.5, 'i'], granada:[0.4, 'i'], casco:[1.4, 'i'], chaleco:[8, 'i'], portaf:[1.2, 'i'], agua:[1.1, 'h'], aguaT:[0, 'x'], reabast:[0, 'x'],
  radio:[1.5, 'c'], batRad:[0.5, 'c'], mochTr:[6, 'c'], camilla:[7, 'c'], ametr:[10, 'c'], muniAm:[3, 'c'], lanzac:[7, 'c'], cuerda:[3.5, 'c'], otroEq:[1, 'c'],
  muniExtra:[0.5, 'i'], mochAs:[1, 'i'], saco:[1.5, 'i'], aislante:[0.4, 'i'], carpa:[2.5, 'c'], cocina:[0.8, 'c'], olla:[0.4, 'c'], aseo:[0.2, 'i'],
  racion24:[1.3, 'i'], racion12:[0.9, 'i'], ifak:[0.5, 'i'], botPA:[0.3, 'i'], potab:[0.1, 'c'], sales:[0.01, 'i'], colac:[0.25, 'i'],
  socorr:[0, 'x'], calcet:[0.1, 'i'], manta:[0.06, 'c'], solar:[0.1, 'c'], evac:[0, 'x'],
  carta:[0.05, 'c'], brujula:[0.1, 'c'], gps:[0.25, 'c'], bateria:[0.25, 'c'], cuadro:[0.02, 'c'], reloj:[0, 'x'], marcador:[0.05, 'c'],
  claves:[0.01, 'c'], silbato:[0.02, 'c'],
  mochila:[2, 'i'], poncho:[0.6, 'i'], abrigo:[0.8, 'i'], gorro:[0.2, 'i'], lentes:[0.05, 'i'], sombrero:[0.1, 'i'],
  linterna:[0.2, 'i'], luzquim:[0.03, 'c'], pilas:[0.1, 'i'], vision:[0.6, 'c'],
  bastones:[0.5, 'i'], polainas:[0.3, 'i'], raquetas:[2, 'i'], esquies:[4.5, 'i'], pala:[1.5, 'c']};
/* Líneas de equipo (decisión del usuario, v0.51): 1.ª en el cuerpo (supervivencia), 2.ª chaleco, arnés y cinturón (combate, con casco y
   chaleco antibalas), 3.ª A mochila de asalto o de misión (la tarea: munición, agua, ración del día), 3.ª B mochila de sostenimiento (varios
   días) y 4.ª vehículo o apoyo (no se suma). Internamente 3.ª A = 5 y 3.ª B = 3 (las marchas guardadas con 3 siguen siendo la mochila). */
const LINEAS = {1:'1.ª línea', 2:'2.ª línea', 5:'3.ª línea A', 3:'3.ª línea B', 4:'4.ª línea'};
const LINEAS_TXT = {1:'en el cuerpo: supervivencia', 2:'chaleco, arnés y cinturón: combate', 5:'mochila de asalto o de misión: la tarea', 3:'mochila de sostenimiento: varios días', 4:'vehículo o apoyo logístico: no la carga el hombre'};
const ORDEN_LINEAS = [1, 2, 5, 3, 4];
// límites de referencia (manual de marchas a pie de EE.UU.): carga de combate ≈ 22 kg (48 lb), carga de marcha de aproximación ≈ 33 kg (72 lb)
const LIMITES_CARGA = {combate:22, marcha:33};
const LINEA_DE = {ifak:1, sales:1, carta:1, brujula:1, gps:1, cuadro:1, marcador:1, claves:1, silbato:1, lentes:1, sombrero:1, gorro:1, linterna:1, polainas:1, bastones:1,
  casco:2, chaleco:2, fusil:2, cargad:2, granada:2, portaf:2, agua:2, colac:2, radio:2, luzquim:2, vision:2, manta:2,
  muniExtra:5, mochAs:5, racion24:5, racion12:5, poncho:5, abrigo:5, pilas:5, batRad:5, bateria:5, potab:5, botPA:5};   // el resto: 3.ª B (sostenimiento)
const lineaDe = (m, id)=>{ const l = +((m.material || {})[id] || {}).linea; return l>=1 && l<=5 ? l : LINEA_DE[id] || 3; };
const numCant = v=>{ const x = String(v===undefined || v===null ? '' : v).replace(',', '.').match(/\d+(\.\d+)?/); return x ? +x[0] : 0; };
// carga por hombre = otro peso escrito (`par.cargaBase`) + lo que se lleva de la 1.ª, 2.ª y 3.ª línea (la 3.ª no, si se deja la mochila:
// `par.sinMochila`); la 4.ª línea (vehículo) es solo referencia y no se suma. null si no hay material
/* Equipo especial de la patrulla (pedido del usuario, v0.49): no lo llevan todos. Cada elemento de la unidad dice quién lo lleva: un puesto y
   cuántos portadores (se lo reparten entre ellos), o «rotan entre todos» (se reparte entre el efectivo, como antes). El tiempo de la marcha se
   calcula con el MÁS CARGADO. m.material[id].port = {puesto, n, nombre, rota}. */
/* Puestos u OME (Ocupación Militar Especializada; pedido del usuario, v0.51). Todos llevan el equipo común; cada puesto lleva ADEMÁS su
   equipo (kit, por hombre del puesto, con línea) y puede REEMPLAZAR elementos comunes (p. ej. la ametralladora en lugar del fusil y sus
   cargadores). Son eventuales: m.ome[k].n hombres (0 = no hay). Pesos ESTIMADOS, editables (m.ome[k].kit[id] = {cant, kg, linea, quitar}).
   Puestos propios en m.omeExtra [{n:nombre, kit:[{n, cant, kg, linea}]}]. civil: el puesto existe en uso civil. */
const OMES = {
  fusilero:{n:'Fusilero o patrullero', kit:[], civil:true},
  granadero:{n:'Fusilero granadero', kit:[['lanzaG', 'Lanzagranadas de 40 mm (bajo el fusil)', 1, 1.5, 2], ['gran40', 'Granadas de 40 mm', 12, 0.23, 2]], quita:{cargad:2}},
  ametr:{n:'Sirviente de ametralladora', reemplaza:['fusil', 'cargad'], kit:[['ametrP', 'Ametralladora con bípode', 1, 10, 2], ['cintas', 'Cintas de munición en el chaleco (100 tiros)', 2, 3, 2],
    ['cintasA', 'Cintas de munición en la mochila de asalto', 2, 3, 5], ['canon', 'Cañón de repuesto', 1, 3, 5]]},
  trauma:{n:'Enfermero u operador de trauma', civil:true, kit:[['mochTrK', 'Mochila de trauma', 1, 6, 5], ['torniq', 'Torniquetes y vendajes adicionales', 1, 0.6, 2]], def:c=>c.n>=6 ? 1 : 0},
  franco:{n:'Francotirador', reemplaza:['fusil', 'cargad'], kit:[['fPrec', 'Fusil de precisión con óptica', 1, 7, 2], ['muniPrec', 'Cargadores de precisión', 5, 0.3, 2],
    ['telem', 'Telémetro o prismáticos', 1, 0.6, 1], ['camuf', 'Bípode, apoyo y kit de camuflaje', 1, 1.5, 5]]},
  radio:{n:'Radioperador', civil:true, kit:[['antena', 'Antena y accesorios de radio', 1, 0.5, 5]]},
  antitanque:{n:'Apuntador antitanque', kit:[['lanzAT', 'Lanzacohetes o arma antitanque', 1, 7, 2], ['cohete', 'Cohetes o munición antitanque', 2, 3, 5]]}};
const PUESTOS = Object.assign(Object.fromEntries(Object.entries(OMES).map(([k, o])=>[k, o.n])), {otro:'Otro puesto'});
const ESPECIAL = new Set(['radio', 'batRad', 'camilla', 'cuerda', 'otroEq']);
const PORT_DEF = {radio:{puesto:'radio', cuenta:true}, batRad:{puesto:'radio'}, camilla:{rota:true}, cuerda:{rota:true}, otroEq:{rota:true}};
function portDe(m, id){
  const st = ((m.material || {})[id] || {}).port || {}, d = PORT_DEF[id] || {rota:true}, ps = st.puesto==='enfermero' ? 'trauma' : st.puesto;
  const rota = st.rota!==undefined ? !!st.rota : !!d.rota, puesto = PUESTOS[ps] ? ps : d.puesto || 'fusilero';
  return {rota, puesto, n:numCant(st.n) || 0, nombre:String(st.nombre || d.nombre || '').trim(), cuenta:!!d.cuenta};
}
// lista de puestos de una marcha: los de la doctrina (según el uso) y los propios, con su equipo ya combinado con lo que escribió el usuario
function omesDe(m, c){
  const civil = typeof Uso!=='undefined' && Uso.civil(), O = m.ome || {}, L = [];
  Object.entries(OMES).forEach(([k, o])=>{ if(civil && !o.civil) return; const st = O[k] || {}, ex = st.extra || [];
    const kit = o.kit.map(([id, n, cant, kg, linea])=>{ const s2 = (st.kit || {})[id] || {}; return {id, n, cant:s2.cant!==undefined && s2.cant!=='' ? numCant(s2.cant) : cant, kg:s2.kg!==undefined && s2.kg!=='' ? numCant(s2.kg) : kg,
      linea:+s2.linea || linea, quitar:!!s2.quitar, a:s2.a || '', cant0:cant, kg0:kg}; }).concat(ex.map((x, i)=>({id:'e' + i, n:x.n, cant:numCant(x.cant) || 1, kg:numCant(x.kg), linea:+x.linea || 2, propio:true})));
    L.push({key:k, nombre:o.n, n:st.n!==undefined && st.n!=='' ? numCant(st.n) : (o.def ? o.def(c) : 0), nDef:o.def ? o.def(c) : 0, kit, reemplaza:o.reemplaza || [], quita:o.quita || {}, base:k==='fusilero'}); });
  (m.omeExtra || []).forEach((x, i)=>L.push({key:'p' + i, nombre:x.n || 'Puesto propio', n:numCant(x.cantidad), nDef:0, propio:i,
    kit:(x.kit || []).map((y, j)=>({id:'e' + j, n:y.n, cant:numCant(y.cant) || 1, kg:numCant(y.kg), linea:+y.linea || 2, propio:true})), reemplaza:[], quita:{}}));
  return L;
}
function pesoMaterial(m, R){
  if(typeof contextoMaterial==='undefined') return null;
  const c = contextoMaterial(m, R), Mt = m.material || {}, base = numCant((m.par || {}).cargaBase), items = [];
  MATERIAL.forEach(g=>g.items.forEach(([id, n, cant])=>{ const v = cant(c); if(v===null || v===undefined) return;
    // cantidad escrita por hombre (`cantH`, elementos individuales) o total de la unidad (`cant`)
    const st = Mt[id] || {}, q = st.cantH!==undefined && st.cantH!=='' ? numCant(st.cantH)*c.n : numCant(st.cant || v), [kg0, modo] = PESOS[id] || [0, 'x'], kg = st.kg!==undefined && st.kg!=='' ? numCant(st.kg) : kg0;
    const porHombre = modo==='h' ? q*kg : modo==='x' ? 0 : q*kg/c.n;
    items.push({id, n, kg, modo, q, porHombre, linea:lineaDe(m, id)}); }));
  // elementos agregados por el usuario: por hombre (x.modo 'i', cantidad por hombre) o de la unidad (cantidad total, se reparte)
  (m.materialExtra || []).forEach((x, i)=>{ const st = Mt['x' + i] || {}, kg = numCant(st.kg), indiv = x.modo==='i';
    const q = indiv ? (st.cantH!==undefined && st.cantH!=='' ? numCant(st.cantH) : numCant(x.cant) || 1)*c.n : numCant(st.cant || x.cant) || 1;
    items.push({id:'x' + i, n:x.n, kg, modo:indiv ? 'i' : 'c', q, porHombre:q*kg/c.n, linea:lineaDe(m, 'x' + i)}); });
  const sinMochila = !!(m.par || {}).sinMochila, modoMo = (m.par || {}).mochilaModo || 'dentro';
  // qué líneas se llevan: la mochila de sostenimiento (3) no, si se va «solo con la de asalto» o sin mochila; la de asalto (5) no, si sin mochila
  const llevaL = l=>l===1 || l===2 || (l===5 && !sinMochila) || (l===3 && !sinMochila && modoMo!=='solo'), lleva = x=>llevaL(x.linea);
  // equipo de la unidad: o rota entre todos, o lo llevan los portadores de un puesto
  const grupos = {};
  items.forEach(x=>{ x.lleva = x.modo!=='x' && lleva(x); if(x.modo!=='c' || !(x.q>0)) return; const pt = portDe(m, x.id); x.rota = pt.rota; if(pt.rota) return;
    const key = pt.puesto==='otro' ? 'otro:' + (pt.nombre || 'Otro puesto') : pt.puesto;
    const g = grupos[key] || (grupos[key] = {key, puesto:pt.puesto, nombre:pt.puesto==='otro' ? pt.nombre || 'Otro puesto' : PUESTOS[pt.puesto], n:0, items:[]});
    g.n = Math.max(g.n, pt.n || (pt.cuenta ? Math.ceil(x.q) : 0)); g.items.push(x); x.puesto = key; x.porHombre = 0; });
  Object.values(grupos).forEach(g=>{ g.n = Math.max(1, g.n); g.kg = g.items.filter(x=>x.lleva).reduce((a, x)=>a + x.q*x.kg, 0)/g.n;
    g.items.forEach(x=>x.porPortador = x.q*x.kg/g.n); return g; });
  const lineas = {1:0, 2:0, 5:0, 3:0, 4:0}; items.forEach(x=>{ if(x.modo!=='x' && !x.puesto) lineas[x.linea] += x.porHombre; });
  let indiv = items.filter(x=>(x.modo==='h' || x.modo==='i') && x.lleva).reduce((a, x)=>a + x.porHombre, 0), colect = items.filter(x=>x.modo==='c' && x.lleva && !x.puesto).reduce((a, x)=>a + x.porHombre, 0);
  // puestos (OME): común − lo que reemplazan + su equipo + su parte del equipo especial + lo que les pasan otros puestos
  const porId = {}; items.forEach(x=>porId[x.id] = x);
  const lista = omesDe(m, c); lista.forEach(o=>{ const g = grupos[o.key]; o.n = Math.max(o.n, g ? g.n : 0); });
  const fus = lista.find(o=>o.base), nFus = Math.max(0, c.n - lista.filter(o=>!o.base).reduce((a, o)=>a + o.n, 0)); if(fus) fus.n = nFus;
  // equipo de un puesto que lleva otro puesto, los fusileros o todos («a»): el total (por hombre × hombres del puesto) se reparte entre ellos
  const mov = []; lista.forEach(o=>{ if(o.base || !(o.n>0)) return; o.kit.forEach(k=>{ if(!k.quitar && k.a && k.a!==o.key) mov.push({de:o, k, kg:k.cant*k.kg*o.n}); }); });
  mov.filter(x=>x.k.a==='rota' || (x.k.a==='fusilero' && !nFus)).forEach(x=>{ const kg = x.kg/c.n; lineas[x.k.linea] += kg; if(llevaL(x.k.linea)) colect += kg; });
  const comun = Math.round((base + indiv + colect)*10)/10;
  const puestos = lista.map(o=>{
    const g = grupos[o.key], li = Object.assign({}, lineas); let extra = 0; o.recibe = [];
    o.reemplaza.forEach(id=>{ const x = porId[id]; if(x && !x.puesto){ li[x.linea] -= x.porHombre; if(x.lleva) extra -= x.porHombre; } });
    Object.entries(o.quita).forEach(([id, k])=>{ const x = porId[id]; if(x && x.q>0){ const kg = Math.min(k, x.q/c.n)*x.kg; li[x.linea] -= kg; if(x.lleva) extra -= kg; } });
    o.kit.forEach(k=>{ if(k.quitar || (k.a && k.a!==o.key)) return; const kg = k.cant*k.kg; li[k.linea] = (li[k.linea] || 0) + kg; if(llevaL(k.linea)) extra += kg; });
    const n = o.n;
    // si el puesto tiene más hombres que los que pide el equipo especial, se lo reparten entre todos los del puesto
    if(g){ if(n>g.n){ g.kg = g.kg*g.n/n; g.items.forEach(x=>x.porPortador = x.porPortador*g.n/n); g.n = n; }
      g.items.forEach(x=>{ li[x.linea] += x.porPortador; }); extra += g.kg; }
    if(n>0) mov.filter(x=>x.k.a===o.key).forEach(x=>{ const kg = x.kg/n; li[x.k.linea] = (li[x.k.linea] || 0) + kg; if(llevaL(x.k.linea)) extra += kg; o.recibe.push({n:x.k.n, de:x.de.nombre, kg}); });
    return Object.assign(o, {n, lineas:li, kg:extra, total:Math.round((comun + extra)*10)/10, items:g ? g.items : [], esp:g || null}); });
  // puestos «otro» del equipo especial que no son OME
  Object.values(grupos).forEach(g=>{ if(!puestos.some(o=>o.key===g.key)){ const li = Object.assign({}, lineas); g.items.forEach(x=>{ li[x.linea] += x.porPortador; });
    puestos.push({key:g.key, nombre:g.nombre, n:g.n, kit:[], reemplaza:[], recibe:[], lineas:li, kg:g.kg, total:Math.round((comun + g.kg)*10)/10, items:g.items, esp:g}); } });
  const especial = puestos.filter(o=>!o.base && o.n>0), portadores = especial.reduce((a, g)=>a + g.n, 0);
  const fusilero = puestos.find(o=>o.base) || null;
  const mas = especial.concat(fusilero && fusilero.n>0 ? [fusilero] : []).reduce((a, g)=>!a || g.total>a.total ? g : a, null);
  return {base, indiv, colect, lineas, sinMochila, mochilaModo:modoMo, puestos, combate:base + lineas[1] + lineas[2], marcha:base + lineas[1] + lineas[2] + lineas[5] + lineas[3],
    comun, especial, portadores, fusileros:Math.max(0, c.n - portadores), fusilero, mas:mas && mas.total>comun ? mas : null, total:mas && mas.total>comun ? mas.total : comun,   // el tiempo se calcula con el más cargado
    n:c.n, hay:c.hay, items:items.sort((a, b)=>b.porHombre - a.porHombre)};
}
if(typeof globalThis!=='undefined'){ globalThis.PESOS = PESOS; globalThis.pesoMaterial = pesoMaterial; globalThis.LINEAS = LINEAS; globalThis.PUESTOS = PUESTOS; globalThis.OMES = OMES; globalThis.omesDe = omesDe; globalThis.ORDEN_LINEAS = ORDEN_LINEAS; globalThis.portDe = portDe; globalThis.ESPECIAL = ESPECIAL; globalThis.LIMITES_CARGA = LIMITES_CARGA; globalThis.LINEAS_TXT = LINEAS_TXT; globalThis.lineaDe = lineaDe; }

/* Siglas y términos que usa la app (tarjeta en Marchas) */
const GLOSARIO = [
  ['PIM', 'Punto inicial de marcha (partida).'], ['PTM', 'Punto de término de marcha (llegada).'], ['PC', 'Punto de control: evento intermedio de la ruta (PC1, PC2…).'],
  ['Evento', 'Punto de control que se informa por radio y lleva nombre clave («PASANDO ALFA»).'], ['Quiebre', 'Punto de ruta: solo dibuja el camino; no se informa.'],
  ['UTM', 'Cuadrícula de coordenadas en metros de las cartas (Este y Norte), por zonas; Chile continental usa las zonas 18 y 19.'],
  ['WGS84 / SIRGAS', 'Datum de los GPS y de las cartas IGM actuales.'], ['PSAD56 / SAD69', 'Datums de cartas IGM antiguas (difieren unos 200–400 m de WGS84).'],
  ['Datum', 'Sistema de referencia de la carta; dice en qué está medida la coordenada.'],
  ['Declinación magnética', 'Ángulo entre el norte geográfico y el magnético (el de la brújula).'], ['Convergencia', 'Ángulo entre el norte de la cuadrícula UTM y el norte geográfico.'],
  ['Rumbo magnético', 'Dirección que marca la brújula: acimut geográfico menos la declinación.'], ['‰ (milésimas)', 'Medida de ángulos: 6400 milésimas = una vuelta completa (360°).'],
  ['WMM', 'Modelo Magnético Mundial (NOAA): calcula la declinación según lugar y fecha.'],
  ['MIDE', 'Método de cálculo de horarios de excursión: tiempo = el mayor entre el horizontal y el vertical + la mitad del menor.'],
  ['DIN 33466', 'Norma alemana en que se basa el método MIDE.'], ['m/h', 'Metros de desnivel por hora (velocidad de subida o bajada).'],
  ['Pendiente', 'Desnivel dividido por la distancia horizontal, en %.'], ['Altos', 'Descansos durante la marcha (por % o programados cada cierto tiempo).'],
  ['Imprevistos', 'Reserva de tiempo para lo inesperado (se suma al término).'],
  ['Tiempo de paso', 'Lo que demora la columna completa en pasar por un punto.'],
  ['WBGT', 'Índice de estrés por calor que combina temperatura, humedad, sol y viento («temperatura de globo y bulbo húmedo»).'],
  ['C.C.M. / C.C.V.', 'Crepúsculo civil matutino / vespertino: sol entre 0° y 6° bajo el horizonte.'],
  ['C.N.M. / C.N.V.', 'Crepúsculo náutico matutino / vespertino: sol entre 6° y 12° bajo el horizonte.'],
  ['C.A.M. / C.A.V.', 'Crepúsculo astronómico matutino / vespertino: sol entre 12° y 18° bajo el horizonte.'],
  ['Primera / última luz', 'Sol a 9° bajo el horizonte (mitad del crepúsculo náutico).'],
  ['GDH', 'Grupo fecha-hora: día, hora y minutos, mes y año (ej. 081030OCT26).'], ['OPORD / O. Op.', 'Orden de operaciones.'],
  ['C2', 'Mando y control: el sistema o puesto que recibe los informes (ej. C2 TOQUI).'],
  ['GPS', 'Sistema de posicionamiento satelital (posición del teléfono).'], ['DEM / SRTM', 'Modelo digital de terreno: da la cota de cualquier punto (precisión ~30 m).'],
  ['GPX / KML / GeoJSON', 'Formatos de archivo de rutas y puntos (GPS, Google Earth, sistemas de mapas).'], ['CSV', 'Tabla de texto que abre Excel.'],
  ['QR', 'Código de cuadros que se lee con la cámara para pasar el plan de un teléfono a otro.']];
if(typeof globalThis!=='undefined') globalThis.GLOSARIO = GLOSARIO;
