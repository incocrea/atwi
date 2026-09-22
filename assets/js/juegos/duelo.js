/* ATWI · minijuegos · LA REVELACIÓN DE LAS RONDAS
   ==========================================================================
   Las rondas se enseñan TODAS A LA VEZ, cada lado entrando desde el suyo hasta
   chocar en el centro (titular, 2026-09-21: «no es una por una destapando cada
   carta, no son cards, son elementos; cada uno entra volando desde su lado,
   chocan; todas las rondas se muestran en simultánea»).

   ⚠️ ESTO ERA DE CHOQUE Y AHORA ES DE TODOS (pivote del titular, 2026-09-22:
   «se vuelve nuestra pantalla reutilizable de presentación de resultados para
   todo el modo»). Vivía en `ui/choque.js` y hablaba de elementos —fuego, agua,
   metal—, así que una ronda de Cuenta salía como «No jugó» al lado de otra que
   sí se jugó: la escena no sabía leer su resumen y lo daba por vacío.

   EL CONTRATO CON UN JUEGO es una sola función, opcional:

     ui.<id>.chocante(resumen) -> { icono: '<html>', nombre: 'Fuego' }

   `icono` es el dibujo que vuela --lleva la clase `jg-el__dibujo`, que es lo que
   el CSS escala y apaga-- y `nombre` la píldora de debajo.

   ⚠️ LO QUE SE COMPARA POR TIEMPO VUELA CON EL RELOJ DE ARENA, Y ESO LO DECIDE
   LA ESCENA (titular, 2026-09-22: «independientemente del juego, el icono que
   acompaña el tiempo del jugador es el de reloj de arena; Choque es un caso
   especial, pues sí tiene sentido comparar los elementos»). Cuenta hacía volar
   su ficha de número y eso decía «se compara el 16 contra el 12» cuando lo que
   decide es el reloj. Por eso `icono` es OPCIONAL: un juego que no lo traiga y
   cuyo resumen tenga `ms` vuela con el reloj, sin declarar nada —que es lo que
   van a ser ocho de los diez—. Declarar icono propio es la excepción, y hoy
   solo la usa Choque.

   CON REPARTO MIXTO CADA FILA DICE A QUÉ SE JUGÓ, y solo entonces: si las tres
   rondas son del mismo juego, el rótulo lo repetiría tres veces.
   ========================================================================== */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* El reloj de arena: el mismo de la pestaña Historial, que ya está publicado
     y en la ola `nucleo` --no hay pieza nueva que bajar--. */
  function relojHTML() {
    return '<img class="jg-el__dibujo" src="../assets/img/iconos/historial.png" ' +
      'alt="" decoding="async">';
  }
  function segundos(ms) { return (Math.round((ms || 0) / 100) / 10) + ' s'; }

  /** Lo que se ve de una jugada: del juego si lo dice, y si no, su resumen. */
  function chocanteDe(idJuego, resumen) {
    if (!resumen) return null;
    var ui = (J.ui || {})[idJuego];
    var c = (ui && typeof ui.chocante === 'function') ? ui.chocante(resumen) : null;
    if (!c) {
      /* Sin ficha del juego: el tiempo, que es lo que comparan casi todos. */
      c = { nombre: resumen.ms != null ? segundos(resumen.ms)
                                       : ((ui && ui.resumenCorto) ? ui.resumenCorto(resumen) : '—') };
    }
    /* El icono es opcional: si el juego no trae el suyo y la ronda se midió con
       reloj, vuela el reloj. */
    if (!c.icono) c.icono = resumen.ms != null ? relojHTML() : '';
    return c;
  }

  /**
   * @param caja     dónde pintar
   * @param filas    las del veredicto: { ronda, juego, propone, invitado, gana, frase }
   * @param personas [quien propone, quien invita]
   * @param fin      se llama al pulsar «Ver el resultado»
   * @returns una función que corta la escena si la pantalla se va antes
   */
  J.duelo = function (caja, filas, personas, fin) {
    var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var quien = { propone: personas[0], invitado: personas[1] };
    /* Solo se nombra el juego si no son todos el mismo. */
    var juegos = filas.map(function (f) { return f.juego; });
    var mixto = juegos.some(function (x) { return x !== juegos[0]; });

    function ladoHTML(res, lado, gana, idJuego) {
      var c = chocanteDe(idJuego, res);
      /* El que pierde se apaga; el que gana se queda a color. En empate no se
         apaga ninguno: nadie perdió. */
      var pierde = c && gana !== 'empate' && gana !== lado;
      return '<div class="jg-d__lado jg-d__lado--' + (lado === 'propone' ? 'izq' : 'der') +
          (pierde ? ' jg-d__lado--pierde' : '') + (gana === lado ? ' jg-d__lado--gana' : '') + '">' +
          (c ? c.icono + '<span class="jg-el__nombre">' + esc(c.nombre) + '</span>'
             : '<span class="jg-el__nombre">No jugó</span>') +
        '</div>';
    }

    /* Cada avatar va ARRIBA y CENTRADO sobre su columna (titular, 2026-09-22):
       avatar encima, nombre debajo. El hueco de en medio copia la columna de la
       chispa de las filas, para que los dos avatares caigan centrados sobre sus
       elementos. */
    var cab =
      '<div class="jg-d__cab">' +
        '<span class="jg-d__quien">' +
          window.ATWI.fichaHTML(quien.propone.avatar, 'avatar--mini', quien.propone.color) +
          '<b>' + esc(quien.propone.nombre) + '</b></span>' +
        '<span class="jg-d__quien-hueco" aria-hidden="true"></span>' +
        '<span class="jg-d__quien jg-d__quien--der">' +
          window.ATWI.fichaHTML(quien.invitado.avatar, 'avatar--mini', quien.invitado.color) +
          '<b>' + esc(quien.invitado.nombre) + '</b></span>' +
      '</div>';

    var cuerpo = filas.map(function (f) {
      var dice = f.gana === 'empate'
        ? (f.propone && f.invitado ? (f.frase ? f.frase + '.' : 'La ronda queda en tablas.')
                                   : 'Ronda sin jugar.')
        : (f.frase ? f.frase + '.' : 'Ronda para ' + quien[f.gana].nombre + '.');
      var m = J.juego(f.juego);
      /* Sin número de ronda (titular, 2026-09-22): la frase de cada choque ya
         dice qué pasó y son pocas filas; el número no situaba nada. Lo que sí
         hace falta con reparto mixto es a QUÉ se jugó esta. */
      return '<div class="jg-d__fila">' +
          (mixto ? '<span class="jg-d__ronda">' + esc((m && m.nombre) || f.juego) + '</span>' : '') +
          ladoHTML(f.propone, 'propone', f.gana, f.juego) +
          '<span class="jg-d__chispa" aria-hidden="true"></span>' +
          ladoHTML(f.invitado, 'invitado', f.gana, f.juego) +
          '<p class="jg-d__dice">' + esc(dice) + '</p>' +
        '</div>';
    }).join('');

    caja.innerHTML =
      '<div class="jg jg--duelo2' + (quieto ? ' jg--duelo2-quieto' : '') + '" aria-live="polite">' +
        cab + '<div class="jg-d__filas">' + cuerpo + '</div>' +
      '</div>';

    var timers = [];
    var s = window.ATWI.sonido;
    /* El golpe suena cuando chocan, que es el 40 % de una animación de 1290 ms
       (un 30 % más lenta que antes, titular 2026-09-22) —los dos lados llegan al
       centro a la vez, así que es UN sonido y no uno por fila—. Con
       `reduced-motion` no hay vuelo y tampoco golpe. */
    if (!quieto && s && s.hay()) timers.push(setTimeout(function () { s.choque(); }, 520));

    /* ⚠️ NO SE PASA SOLO AL RESULTADO (titular, 2026-09-21: «después de
       presentar el choque no sigas automáticamente al resultado, agrega un
       botón de ver resultado, por si el user quiere revisar las
       comparaciones»). Con las tres rondas juntas hay algo que LEER —quién
       ganó cada una y por qué—, y un temporizador decide por quien está
       leyendo. El botón sale cuando el choque terminó, no antes: si estuviera
       desde el primer fotograma se podría saltar la escena sin verla. */
    var pie = document.querySelector('#m-partida .modal__pie');
    function ponerBoton() {
      if (!pie || !caja.isConnected) return;
      pie.innerHTML = '<button type="button" class="boton boton--bloque boton--grande ' +
        'boton--competencia jg-d__ver" data-el-ver>Ver el resultado</button>';
      var b = pie.querySelector('[data-el-ver]');
      if (b) b.addEventListener('click', function () { b.disabled = true; fin(); });
    }
    timers.push(setTimeout(ponerBoton, quieto ? 200 : 1450));

    return function parar() {
      timers.forEach(clearTimeout);
      /* El botón vive en el pie, fuera de `caja`: si la escena se corta a
         mitad no se va solo con el cuerpo y se quedaría sobre la pantalla
         siguiente. */
      if (pie) { var v = pie.querySelector('[data-el-ver]'); if (v) v.remove(); }
    };
  };
})();
