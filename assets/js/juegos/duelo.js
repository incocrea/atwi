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

    /* ⚠️ LOS DOS QUE JUEGAN VAN ABAJO Y DE CUERPO ENTERO (titular, 2026-09-22:
       «quita los users de arriba y sube más los resultados, porque abajo
       pondrás los avatares, no en círculos sino como en el modo versus, pero
       con la ilustración de estado neutro de cada uno»). Dos discos de 48 px
       arriba ocupaban una franja entera para decir quién es quién, y lo dicen
       mejor las figuras: cada una en su lado, mirándose, como en la cortinilla.
       LA POSE ES `frente` Y NO `plante`: aquí ya no se están retando --la
       partida terminó-- y la pose de versus contaría otra cosa. Van con
       `fondo: null` porque la mancha de color de detrás es del avatar redondo,
       y `mira` las voltea hacia el centro. */
    /* ⚠️ SIN NOMBRE DEBAJO (titular, 2026-09-22: «no les pongas el nombre a los
       avatares, cada quien reconoce el suyo»). En una partida local los dos
       están delante y en línea solo hay dos figuras: el rótulo decía lo que la
       cara ya dice, y encima obligaba a colgarlo por arriba de la figura para
       que no se lo comiera el recorte. */
    var abajo =
      '<div class="jg-d__abajo" aria-hidden="true">' +
        '<span class="jg-d__jug jg-d__jug--izq">' +
          window.ATWI.retrato(quien.propone.avatar, 'frente',
            { fondo: null, mira: 'derecha', color: quien.propone.color, clase: 'jg-d__fig' }) +
        '</span>' +
        '<span class="jg-d__jug jg-d__jug--der">' +
          window.ATWI.retrato(quien.invitado.avatar, 'frente',
            { fondo: null, mira: 'izquierda', color: quien.invitado.color, clase: 'jg-d__fig' }) +
        '</span>' +
      '</div>';

    var cuerpo = filas.map(function (f) {
      var m = J.juego(f.juego);
      /* Sin número de ronda (titular, 2026-09-22): la frase de cada choque ya
         dice qué pasó y son pocas filas; el número no situaba nada.
         ⚠️ Y EL NOMBRE DEL JUEGO VA CENTRADO ENCIMA DE SU PAR, SIEMPRE (titular,
         2026-09-22: «los nombres de los juegos jugados van en el centro superior
         de cada par de resultado»). Antes iba en el canto y solo con reparto
         mixto; centrado encabeza su par y es lo que separa una ronda de la
         siguiente cuando las figuras de abajo ocupan el sitio del encabezado. */
      /* ⚠️ EL NOMBRE DEL JUEGO VA EN MEDIO, Y SALE AL FINAL (titular,
         2026-09-22: «centra el nombre del juego entre los dos elementos que
         chocan; el nombre aparece después de que termina la animación»). Antes
         encabezaba su par desde el primer fotograma, y así compite con lo único
         que hay que mirar mientras las piezas vuelan. En el centro ocupa el
         hueco que la chispa deja cuando se apaga: primero el golpe, después
         quién ganó, y al final de qué juego era la ronda.
         ⚠️ Y SE FUE LA FRASE («Ronda para Dos», «El agua apaga el fuego»): eso
         lo dice el veredicto del juez dos pantallas después, y aquí era la misma
         cosa contada dos veces --con el agravante de que ocupaba un renglón por
         ronda, que es justo lo que hacía encoger los dibujos en un teléfono
         bajo--. */
      return '<div class="jg-d__fila">' +
          ladoHTML(f.propone, 'propone', f.gana, f.juego) +
          '<span class="jg-d__medio">' +
            '<span class="jg-d__chispa" aria-hidden="true"></span>' +
            '<span class="jg-d__juego">' + esc((m && m.nombre) || f.juego) + '</span>' +
          '</span>' +
          ladoHTML(f.invitado, 'invitado', f.gana, f.juego) +
        '</div>';
    }).join('');

    caja.innerHTML =
      '<div class="jg jg--duelo2' + (quieto ? ' jg--duelo2-quieto' : '') + '" aria-live="polite">' +
        '<div class="jg-d__filas">' + cuerpo + '</div>' + abajo +
      '</div>';

    /* ⚠️ Y DESPUÉS SE MIDE, PORQUE EL TAMAÑO DE LAS PIEZAS NO SABE DEL ALTO.
       Van en `clamp(58px, 21vw, 92px)`, o sea que ceden con el ANCHO: en un
       teléfono estrecho y BAJO no ceden nada y tres rondas no caben --medido, la
       última frase se metía 155 px dentro de la franja de las figuras--. Aquí se
       mide lo que de verdad ocupó y, si se pasa, las piezas encogen por pasos.
       Es lo mismo que hacen la ruleta del catálogo y el aire de «Antes de
       empezar»: la cuenta se hace con lo que hay en ese instante, y lo único que
       no depende de acertar el momento es mirar el resultado y corregirlo. */
    var filasCaja = caja.querySelector('.jg-d__filas');
    /* ⚠️ LO QUE OCUPA SE MIDE CON `offsetTop`, NO CON `scrollHeight` NI CON
       `getBoundingClientRect`: las piezas ENTRAN VOLANDO con `transform`, y las
       dos últimas cuentan ese desplazamiento --medido: daban «no cabe» hasta en
       una pantalla donde sobraban 16 px, y las fichas encogían sin motivo--.
       `offsetTop + offsetHeight` es la maquetación, que es lo que se pregunta. */
    function loQueOcupa() {
      var u = filasCaja && filasCaja.lastElementChild;
      return u ? u.offsetTop + u.offsetHeight : 0;
    }
    function ajustar() {
      if (!filasCaja || !filasCaja.isConnected) return;
      var lado = 92, aire = 20;
      /* Encogen las dos cosas a la vez: el dibujo y el aire entre pares. Con
         tres rondas en un teléfono bajo, solo con el dibujo no basta. */
      for (var i = 0; i < 5 && loQueOcupa() > filasCaja.clientHeight; i++) {
        lado = Math.max(40, Math.round(lado * 0.85));
        aire = Math.max(4, Math.round(aire * 0.7));
        filasCaja.style.setProperty('--jg-d-fig', lado + 'px');
        filasCaja.style.setProperty('--jg-d-gap', aire + 'px');
      }
    }
    ajustar();
    /* Una segunda pasada cuando las fuentes ya midieron: no están autoalojadas,
       así que la primera pintada va con la de respaldo y el texto puede crecer. */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustar);

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
