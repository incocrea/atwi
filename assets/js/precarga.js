/* ATWI · la precarga de dibujos.
   ==========================================================================

   EL FALLO QUE ARREGLA, dicho por el titular: «pasa la animación y luego carga
   la imagen». Es el peor momento posible para que llegue tarde una pieza, porque
   una animación que ya empezó no se puede volver a empezar: o la figura está
   cuando el movimiento arranca, o ese movimiento se vio mal y no hay arreglo.

   DOS COSAS DISTINTAS, y conviene no confundirlas:

     1. QUE EL BYTE ESTE. De eso se encarga `sw.js`, que guarda los 287 dibujos
        —24 MB— la primera vez y luego solo vuelve a bajar los que cambian de
        hash. Este archivo le manda la orden y le dice en qué orden.

     2. QUE LA IMAGEN ESTE DECODIFICADA. No es lo mismo. Un WEBP de 620×960 que
        ya está en la caché todavía tarda unos milisegundos en convertirse en
        píxeles, y esos milisegundos caen justo en el primer fotograma. Por eso
        `listas()` espera a `decode()` y no solo a `onload`.

   EL ORDEN NO ES UN CAPRICHO. Las cuatro olas se bajan todas, pero de arriba a
   abajo: los iconos de la barra se ven en el primer segundo y las 228 figuras
   grandes no se ven hasta que alguien entra en una sala. Si fueran todas a la
   vez, las grandes se llevarían el ancho de banda de las chicas y la barra se
   pintaría sin iconos mientras se baja un sprite que nadie va a mirar todavía.

   Y NADA DE ESTO EMPIEZA ANTES DE QUE LA APP ESTE EN PANTALLA. Arrancar 24 MB
   compitiendo con el CSS y el catálogo haría más lento justo lo que hay que
   hacer rápido. Se espera al `load` y, para las dos olas pesadas, a que el
   navegador esté sin trabajo. */
(function () {
  'use strict';
  window.ATWI = window.ATWI || {};

  var MANIFIESTO = '../assets/datos/piezas.json';
  var ESPERA_PESADAS = 2500;       /* si no hay `requestIdleCallback` */
  var MS_TOPE = 3000;              /* lo que se espera por una pieza, como mucho */

  /* Las dos primeras hacen falta ya; las dos últimas son 21,7 MB que solo se ven
     dentro de una partida. */
  var OLAS_PRONTO = ['nucleo', 'marca'];
  var OLAS_LUEGO = ['fichas', 'figuras'];

  var manifiesto = null;
  var trabajador = null;

  /* --- Ahorro de datos ------------------------------------------------------
     SE RESPETA, y es lo único que puede frenar las 228 figuras. No es una
     opinión sobre si 22 MB son muchos: es que quien puso su teléfono en ahorro
     de datos pidió expresamente que nadie le bajara 22 MB de fondo, y una app
     que ignora eso es una app que no se vuelve a instalar. Las 48 piezas ligeras
     —iconos, fondos y las 30 fichas del selector: 0,7 MB— se bajan igual, porque
     sin ellas la interfaz se ve rota y eso no es un adorno.
     En cuanto la persona vuelva a una conexión normal, la siguiente visita baja
     el resto: la sincronización es reanudable por construcción. */
  function ahorrando() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return Boolean(c && c.saveData);
  }

  function cuandoNoHayaPrisa(hacer) {
    if (window.requestIdleCallback) requestIdleCallback(hacer, { timeout: 8000 });
    else setTimeout(hacer, ESPERA_PESADAS);
  }

  /* --- El trabajador de servicio -------------------------------------------- */
  function registrar() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    /* El scope es la raíz del sitio y no `/app/`: los dibujos cuelgan de
       `/assets/`, que está fuera de `/app/`, así que un trabajador registrado
       desde la app con scope propio no vería ni una sola pieza. */
    return navigator.serviceWorker.register('../sw.js', { scope: '../' })
      .then(function () { return navigator.serviceWorker.ready; })
      .catch(function () { return null; });   /* sin trabajador se sigue igual */
  }

  function pedirManifiesto() {
    if (manifiesto) return Promise.resolve(manifiesto);
    var v = (window.ATWI.config && window.ATWI.config.version) || '';
    return fetch(MANIFIESTO + (v ? '?v=' + v : ''))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { manifiesto = d; return d; })
      .catch(function () { return null; });
  }

  function mandar(olas) {
    if (!trabajador || !trabajador.active || !manifiesto || !olas.length) return;
    trabajador.active.postMessage({
      tipo: 'sincronizar', manifiesto: manifiesto, olas: olas
    });
  }

  /* --- Respaldo sin trabajador de servicio -----------------------------------
     Safari en navegación privada no da trabajadores, y un `file://` tampoco.
     Ahí se piden las piezas a pelo: no hay manifiesto ni hashes, pero la caché
     normal del navegador las guarda igual y la segunda pantalla ya no espera.
     Solo las ligeras: sin trabajador no hay forma de bajar 22 MB sin que se note
     en la pantalla de quien está jugando. */
  function aPelo(olas) {
    if (!manifiesto) return;
    var rutas = [];
    olas.forEach(function (o) {
      var e = manifiesto.olas[o];
      if (e) rutas = rutas.concat(Object.keys(e));
    });
    var i = 0;
    (function siguiente() {
      if (i >= rutas.length) return;
      var im = new Image();
      im.onload = im.onerror = siguiente;
      im.src = '../' + rutas[i++];
    })();
  }

  /* --- Lo que la app usa ----------------------------------------------------- */
  /**
   * Resuelve cuando las imágenes están DESCARGADAS Y DECODIFICADAS.
   * Nunca rechaza y nunca se queda colgada: con la red mala, una pantalla
   * quieta es peor que una figura que falta, así que a los tres segundos sigue.
   */
  function listas(rutas) {
    var esperas = (rutas || []).filter(Boolean).map(function (r) {
      return new Promise(function (listo) {
        var im = new Image();
        im.onload = function () {
          if (im.decode) im.decode().then(listo, listo);
          else listo();
        };
        im.onerror = listo;
        im.src = r;
      });
    });
    if (!esperas.length) return Promise.resolve();
    return Promise.race([
      Promise.all(esperas),
      new Promise(function (listo) { setTimeout(listo, MS_TOPE); })
    ]);
  }

  /** Cuántas piezas hay y cuánto pesan, para el panel de administración. */
  function inventario() {
    if (!manifiesto) return null;
    var r = { piezas: 0, bytes: 0, olas: {} };
    Object.keys(manifiesto.olas).forEach(function (o) {
      var e = manifiesto.olas[o];
      var b = Object.keys(e).reduce(function (s, k) { return s + e[k][1]; }, 0);
      r.olas[o] = { piezas: Object.keys(e).length, bytes: b };
      r.piezas += r.olas[o].piezas;
      r.bytes += b;
    });
    return r;
  }

  window.ATWI.precarga = {
    listas: listas,
    inventario: inventario,
    /** Lo que ya terminó de sincronizarse, para poder mirarlo desde la consola. */
    hechas: {}
  };

  /* --- Arranque -------------------------------------------------------------- */
  function arrancar() {
    Promise.all([registrar(), pedirManifiesto()]).then(function (par) {
      trabajador = par[0];
      if (!manifiesto) return;

      if (!trabajador) { aPelo(OLAS_PRONTO); return; }

      navigator.serviceWorker.addEventListener('message', function (e) {
        var d = e.data || {};
        if (d.tipo === 'ola-lista') window.ATWI.precarga.hechas[d.ola] = d.bajadas;
      });

      mandar(OLAS_PRONTO);
      cuandoNoHayaPrisa(function () {
        mandar(ahorrando() ? ['fichas'] : OLAS_LUEGO);
      });
    });
  }

  /* ⚠️ EN EL VISOR DE LA LANDING NO SE SINCRONIZA NADA (2026-09-17). La demo
     corre dentro de un iframe en una página informativa, y esto baja los 24 MB
     de dibujos del juego entero: bajárselos a alguien que entró a leer qué es
     ATWI y le dio a «ver partida» es exactamente lo que esta precarga existe
     para NO hacer —se pensó para quien ya está jugando, no para una visita—.
     La demo pide a demanda lo poco que pinta (las poses del encuentro y las
     fichas, por `precargarPoses`), que es un puñado de archivos y no una
     sincronización.
     Y de paso no registra el trabajador de servicio con scope en la raíz del
     sitio, que desde un iframe de la landing es otra cosa que nadie pidió. */
  function esElVisor() { return /[?&]demo=1/.test(location.search); }

  /* Después del `load`: hasta ahí, todo lo que se pida compite con el CSS, el
     JS y el catálogo, que es lo que de verdad tiene prisa. */
  if (esElVisor()) { /* nada */ }
  else if (document.readyState === 'complete') setTimeout(arrancar, 0);
  else window.addEventListener('load', arrancar);
}());
