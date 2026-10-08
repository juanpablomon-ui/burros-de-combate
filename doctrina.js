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
