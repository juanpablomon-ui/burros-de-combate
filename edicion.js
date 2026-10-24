/* Edición de la app (v0.99.35, pedido del usuario): «completa» = Burros de Combate (la de siempre, con el material por líneas) o
   «tienda» = Ruck Planner (para vender en la App Store: público general y militares, sin la lista de equipo; la carga es un solo número por
   persona o el peso de cada integrante en la balanza). El mismo código sirve a las dos: fuentes/generar_ruck.py arma la carpeta ruck_planner/
   y cambia esta línea a tienda:true. */
const EDICION = {tienda:false};
if(typeof globalThis!=='undefined') globalThis.EDICION = EDICION;
