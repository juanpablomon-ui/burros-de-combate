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
    ['d9', 'El enfermero o socorrista evalúa a la tropa en cada alto.', 'ATP 2-181'],
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
    ['fusil', 'Fusil (con correa y accesorios)', c=>c.n, c=>'1 por hombre; las armas de apoyo se agregan en «Otros»'],
    ['cargad', 'Cargadores con munición', c=>c.n*6, c=>'6 por hombre (dotación sugerida: ajústala)'],
    ['granada', 'Granadas de mano', c=>0, c=>'si la misión lo exige: escribe la cantidad total'],
    ['casco', 'Casco', c=>c.n, c=>'1 por hombre'],
    ['chaleco', 'Chaleco antibalas con placas', c=>c.n, c=>'escribe 0 si no se usa'],
    ['portaf', 'Chaleco o arnés portafuegos', c=>c.n, c=>'donde va la 2.ª línea']]},
  {g:'Agua y alimentación', items:[
    ['agua', 'Agua por hombre', c=>String(Math.ceil((c.aguaH*c.horas + 1)*2)/2).replace('.', ',') + ' L', c=>'≈ ' + c.aguaH.toFixed(2).replace('.', ',') + ' L/h × ' + c.horas.toFixed(1).replace('.', ',') + ' h + 1 L de reserva' + (c.calorDato ? '' : ' (sin índice de calor: se usa calor bajo)')],
    ['aguaT', 'Agua total de la unidad', c=>c.hay ? Math.ceil(c.n*(c.aguaH*c.horas + 1)) + ' L' : null, c=>'para ' + c.n + ' hombres'],
    ['cantimp', 'Cantimploras / odres (1 L)', c=>c.n*Math.min(3, Math.ceil(c.aguaH*c.horas + 1)), c=>'hasta 3 L por hombre'],
    ['reabast', 'Reabastecimiento de agua en ruta', c=>c.aguaH*c.horas + 1>3 ? Math.ceil(c.n*(c.aguaH*c.horas + 1 - 3)) + ' L' : null, c=>'lo que pasa de 3 L por hombre: planificar puntos de agua o vehículo'],
    ['potab', 'Pastillas o filtro potabilizador', c=>c.horas>6 ? Math.ceil(c.n/10) + ' juego(s)' : null, c=>'marcha larga: reabastecer en ruta'],
    ['sales', 'Sales de rehidratación / electrolitos', c=>c.horas>4 || c.calorCat>=3 ? c.n*Math.ceil(c.horas/4) + ' sobres' : null, c=>'1 sobre cada 4 h de marcha'],
    ['racion', 'Ración de combate', c=>c.horas>=6 ? c.n*Math.ceil(c.horas/8) : null, c=>'1 por hombre cada 8 h de marcha'],
    ['colac', 'Colación de marcha (barras, frutos secos)', c=>c.n, c=>'para los altos']]},
  {g:'Sanidad', items:[
    ['botInd', 'Botiquín individual (torniquete, venda)', c=>c.n, c=>'1 por hombre'],
    ['botGrp', 'Botiquín de grupo', c=>Math.max(1, Math.ceil(c.n/10)), c=>'1 cada 10 hombres'],
    ['socorr', 'Enfermero o socorrista', c=>Math.max(1, Math.ceil(c.n/30)), c=>'1 cada 30 hombres; revisa a la tropa en cada alto'],
    ['camilla', 'Camilla plegable', c=>c.n>=10 ? Math.ceil(c.n/40) : null, c=>'1 cada 40 hombres'],
    ['pies', 'Cuidado de pies: talco, parches para ampollas', c=>Math.max(1, Math.ceil(c.n/10)) + ' kit(s)', c=>'1 kit cada 10 hombres'],
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
    ['radio', 'Radio', c=>Math.max(1, c.unidades) + 1, c=>'1 por unidad de marcha + la del comandante'],
    ['batRad', 'Baterías de repuesto para radio', c=>(Math.max(1, c.unidades) + 1)*Math.max(1, Math.ceil(c.horas/8)), c=>'1 por radio cada 8 h'],
    ['claves', 'Lista de nombres clave y frecuencias', c=>Math.max(1, c.unidades) + 1, c=>'«PASANDO ALFA…»'],
    ['silbato', 'Silbato / señales', c=>Math.max(1, Math.ceil(c.n/10)), c=>'jefes de grupo']]},
  {g:'Equipo individual', items:[
    ['mochila', 'Mochila con la carga de la marcha', c=>c.n, c=>c.carga ? 'carga prevista ' + c.carga + ' kg' : ''],
    ['poncho', 'Poncho o chaqueta impermeable', c=>c.n, c=>''],
    ['abrigo', 'Ropa de abrigo (primera capa, polar)', c=>c.noche>0 || c.montana || c.nieve ? c.n : null, c=>'frío de noche o en altura'],
    ['gorro', 'Gorro y guantes', c=>c.nieve || c.montana ? c.n : null, c=>'montaña o nieve'],
    ['lentes', 'Lentes de sol', c=>c.nieve || c.montana ? c.n : null, c=>'reflejo de la nieve o del sol en altura'],
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
    ['cuerda', 'Cuerda de seguridad', c=>c.montana || c.nieve ? Math.max(1, Math.ceil(c.n/10)) : null, c=>'1 cada 10 hombres para pasos difíciles'],
    ['pala', 'Pala de nieve y sonda', c=>c.nieve ? Math.max(1, Math.ceil(c.n/10)) : null, c=>'1 cada 10 hombres']]}
];
// contexto de la marcha para calcular el material
function contextoMaterial(m, R){
  const p = R.par, hay = (+p.efectivo||0)>0, cal = R.calor;
  const aguaH = cal && cal.lh ? cal.lh : 0.71;   // sin índice de calor: categoría 1, trabajo moderado (¾ qt/h)
  return {n:hay ? Math.round(+p.efectivo) : 1, hay, horas:R.res.total || 0, km:R.res.dist/1000, noche:R.fracNoche || 0, aguaH, calorDato:!!(cal && cal.lh),
    calorCat:cal ? cal.cat : 0, montana:['montana', 'mide'].includes(p.metodo), nieve:p.terreno && p.terreno!=='sinNieve' && ['montana', 'mide'].includes(p.metodo), terreno:p.terreno,
    unidades:Math.max(1, Math.round(+p.unidades||1)), carga:p.metodo!=='general' ? p.carga : null};
}
if(typeof globalThis!=='undefined'){ globalThis.MATERIAL = MATERIAL; globalThis.contextoMaterial = contextoMaterial; }

/* Peso de cada elemento del material (kg por unidad, SUGERIDOS y editables en m.material[id].kg) y cómo se carga:
   'h' = cantidad por hombre (agua: se cargan hasta 3 L, 1 kg por litro) · 'i' = individual (1 por hombre, cantidad total de la unidad)
   · 'c' = colectivo (se reparte entre todos) · 'x' = no se carga (personas, planes, agua de reabastecimiento, totales). */
const PESOS = {fusil:[4, 'i'], cargad:[0.5, 'i'], granada:[0.4, 'i'], casco:[1.4, 'i'], chaleco:[8, 'i'], portaf:[1.2, 'i'], agua:[1, 'h'], aguaT:[0, 'x'], cantimp:[0.15, 'i'], reabast:[0, 'x'], potab:[0.1, 'c'], sales:[0.01, 'i'], racion:[0.7, 'i'], colac:[0.25, 'i'],
  botInd:[0.3, 'i'], botGrp:[2.5, 'c'], socorr:[0, 'x'], camilla:[7, 'c'], pies:[0.3, 'c'], calcet:[0.1, 'i'], manta:[0.06, 'c'], solar:[0.1, 'c'], evac:[0, 'x'],
  carta:[0.05, 'c'], brujula:[0.1, 'c'], gps:[0.25, 'c'], bateria:[0.25, 'c'], cuadro:[0.02, 'c'], reloj:[0, 'x'], marcador:[0.05, 'c'],
  radio:[1.5, 'c'], batRad:[0.5, 'c'], claves:[0.01, 'c'], silbato:[0.02, 'c'],
  mochila:[2, 'i'], poncho:[0.6, 'i'], abrigo:[0.8, 'i'], gorro:[0.2, 'i'], lentes:[0.05, 'i'], sombrero:[0.1, 'i'],
  linterna:[0.2, 'i'], luzquim:[0.03, 'c'], pilas:[0.1, 'i'], vision:[0.6, 'c'],
  bastones:[0.5, 'i'], polainas:[0.3, 'i'], raquetas:[2, 'i'], esquies:[4.5, 'i'], cuerda:[3.5, 'c'], pala:[1.5, 'c']};
/* Líneas de equipo: 1.ª en el cuerpo (supervivencia: agua, botiquín, navegación), 2.ª chaleco o arnés (combate: ración, radio, pilas),
   3.ª mochila (sustento: abrigo, poncho, material de grupo). Cada elemento trae una línea sugerida; se cambia en la tabla (m.material[id].linea). */
const LINEAS = {1:'1.ª línea', 2:'2.ª línea', 3:'3.ª línea', 4:'4.ª línea'};
const LINEAS_TXT = {1:'en el cuerpo: supervivencia', 2:'arma y portafuegos: combate', 3:'mochila: sostenimiento', 4:'vehículo o apoyo logístico: no la carga el hombre'};
// límites de referencia (manual de marchas a pie de EE.UU.): carga de combate ≈ 22 kg (48 lb), carga de marcha de aproximación ≈ 33 kg (72 lb)
const LIMITES_CARGA = {combate:22, marcha:33};
const LINEA_DE = {casco:1, chaleco:1, fusil:2, cargad:2, granada:2, portaf:2, agua:1, cantimp:1, sales:1, botInd:1, carta:1, brujula:1, gps:1, cuadro:1, marcador:1, claves:1, silbato:1, lentes:1, sombrero:1, gorro:1, linterna:1, luzquim:1, polainas:1, bastones:1,
  racion:2, colac:2, potab:2, radio:2, batRad:2, bateria:2, pilas:2, vision:2, manta:2};   // el resto: 3.ª línea
const lineaDe = (m, id)=>{ const l = +((m.material || {})[id] || {}).linea; return l>=1 && l<=4 ? l : LINEA_DE[id] || 3; };
const numCant = v=>{ const x = String(v===undefined || v===null ? '' : v).replace(',', '.').match(/\d+(\.\d+)?/); return x ? +x[0] : 0; };
// carga por hombre = otro peso escrito (`par.cargaBase`) + lo que se lleva de la 1.ª, 2.ª y 3.ª línea (la 3.ª no, si se deja la mochila:
// `par.sinMochila`); la 4.ª línea (vehículo) es solo referencia y no se suma. null si no hay material
function pesoMaterial(m, R){
  if(typeof contextoMaterial==='undefined') return null;
  const c = contextoMaterial(m, R), Mt = m.material || {}, base = numCant((m.par || {}).cargaBase), items = [];
  MATERIAL.forEach(g=>g.items.forEach(([id, n, cant])=>{ const v = cant(c); if(v===null || v===undefined) return;
    const st = Mt[id] || {}, q = numCant(st.cant || v), [kg0, modo] = PESOS[id] || [0, 'x'], kg = st.kg!==undefined && st.kg!=='' ? numCant(st.kg) : kg0;
    const porHombre = modo==='h' ? Math.min(q, 3)*kg : modo==='x' ? 0 : q*kg/c.n;
    items.push({id, n, kg, modo, q, porHombre, linea:lineaDe(m, id)}); }));
  (m.materialExtra || []).forEach((x, i)=>{ const st = Mt['x' + i] || {}, q = numCant(st.cant || x.cant) || 1, kg = numCant(st.kg);
    items.push({id:'x' + i, n:x.n, kg, modo:'c', q, porHombre:q*kg/c.n, linea:lineaDe(m, 'x' + i)}); });
  const sinMochila = !!(m.par || {}).sinMochila, lineas = {1:0, 2:0, 3:0, 4:0}; items.forEach(x=>{ if(x.modo!=='x') lineas[x.linea] += x.porHombre; });
  const lleva = x=>x.linea<=2 || (x.linea===3 && !sinMochila);
  const indiv = items.filter(x=>(x.modo==='h' || x.modo==='i') && lleva(x)).reduce((a, x)=>a + x.porHombre, 0), colect = items.filter(x=>x.modo==='c' && lleva(x)).reduce((a, x)=>a + x.porHombre, 0);
  return {base, indiv, colect, lineas, sinMochila, combate:base + lineas[1] + lineas[2], marcha:base + lineas[1] + lineas[2] + lineas[3], total:Math.round((base + indiv + colect)*10)/10, n:c.n, hay:c.hay, items:items.sort((a, b)=>b.porHombre - a.porHombre)};
}
if(typeof globalThis!=='undefined'){ globalThis.PESOS = PESOS; globalThis.pesoMaterial = pesoMaterial; globalThis.LINEAS = LINEAS; globalThis.LIMITES_CARGA = LIMITES_CARGA; globalThis.LINEAS_TXT = LINEAS_TXT; globalThis.lineaDe = lineaDe; }

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
