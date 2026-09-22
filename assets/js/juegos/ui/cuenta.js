/* ATWI · minijuegos · el tablero de «Cuenta»
   ==========================================================================
   La mitad con DOM de `logica/cuenta.js`: una cuadrícula de números y nada
   más. Nació como el juego de mentira de la Fase 0 y el titular lo conservó
   en el catálogo (2026-09-21); se mejora después.

   Un tablero no decide nada: llama a `ctx.jugar(i)` y la carcasa contesta
   —aplica la lógica, anota la jugada y llama a `actualizar`—. Aquí se dibuja
   con lo que hay en `estado`, que es la única verdad. */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);
  J.ui = J.ui || Object.create(null);

  /* EL SET ES DEL TABLERO Y SE DECIDE UNA VEZ POR RONDA (titular, 2026-09-22):
     antes `pintar` sorteaba un set en CADA repintado --y la carcasa repinta el
     tablero tres veces por ronda: bajo la cuenta atras, al desbloquear y al
     congelarlo al final--, asi que el set que se veia en el 3-2-1 no era el que
     se jugaba. El memo se cuelga del OBJETO estado, que la carcasa crea nuevo
     por ronda (`inicial`) y reutiliza en los repintados: consistente dentro de
     la ronda, distinto entre rondas. Y el CONTEO usa OTRO set --distinto al del
     tablero-- para dar variedad al empezar. */
  var memo = null;
  /* LOS SETS QUE SE JUEGAN. La hoja trae ocho (estrella, círculo, corazón,
     hoja, hexágono, zanahoria, cuadrado, nube), y la ZANAHORIA (índice 5) está
     fuera por decisión del titular (2026-09-22): ni se sortea para el tablero,
     ni para el 3-2-1, ni sale en el probador. Sigue en la hoja --quitarla
     obligaría a recortar las dos y cambiarles el hash--, así que devolverla es
     volver a meter el 5 en esta lista. */
  var ACTIVOS = [0, 1, 2, 3, 4, 6, 7];
  /* ⚠️ EL SET SE PUEDE FIJAR DESDE EL PROBADOR (titular, 2026-09-22: «para
     Cuenta quiero poder escoger una variante de números y que todas las
     partidas salgan con ese set, para auditar mejor sus ilustraciones sin
     esperar que me salgan al azar»). `fijo` es el valor elegido o vacío; vacío
     es lo de siempre, o sea al azar, así que la partida de verdad --que nunca
     trae ajustes-- no cambia de comportamiento.
     El del CONTEO sigue sorteándose aparte y distinto del tablero: son dos
     hojas que se ven seguidas y con el mismo set el 3-2-1 se confundiría con
     las fichas de debajo. */
  function sets(estado, fijo) {
    /* ⚠️ SIN ARGUMENTO SIGNIFICA «EL QUE YA HABÍA», y esa distinción hace falta:
       `conteo()` no recibe `ctx` --la carcasa lo llama con el número y nada
       más-- así que si «sin valor» se tomara como «al azar», pintar el 3-2-1
       invalidaría el memo y el set fijado se perdería justo antes de jugar. */
    var puesto = fijo === undefined
      ? (memo ? memo.fijo : null)
      : ((fijo === 0 || fijo) && fijo !== '' ? Number(fijo) : null);
    if (puesto !== null && ACTIVOS.indexOf(puesto) === -1) puesto = null;
    if (!memo || memo.estado !== estado || memo.fijo !== puesto) {
      var j = puesto !== null ? puesto : ACTIVOS[Math.floor(Math.random() * ACTIVOS.length)];
      /* El del conteo, de los activos y distinto del tablero. */
      var otros = ACTIVOS.filter(function (x) { return x !== j; });
      var c = otros[Math.floor(Math.random() * otros.length)];
      memo = { estado: estado, fijo: puesto, juego: j, conteo: c };
    }
    return memo;
  }

  /** Los sets que se juegan, para el selector del probador. El nombre
      conserva su número de la hoja («Set 7» sigue siendo el cuadrado). */
  function setsDisponibles() {
    var l = [{ clave: '', nombre: 'Al azar' }];
    ACTIVOS.forEach(function (i) { l.push({ clave: String(i), nombre: 'Set ' + (i + 1) }); });
    return l;
  }

  J.ui.cuenta = {
    /* LO QUE ESTE JUEGO DEJA CONFIGURAR EN EL PROBADOR. Es el contrato genérico:
       el probador pinta lo que haya aquí y devuelve los valores en
       `ctx.ajustes`, así que un juego nuevo trae sus opciones sin que el
       probador sepa nada de él. */
    ajustes: [
      { clave: 'set', nombre: 'Variante de números', opciones: setsDisponibles() }
    ],
    /* Lo que tarda una ficha en irse del todo: 500 ms rota más los 250 del
       desvanecido (`transition: opacity .25s` en `.jg-celda`). La carcasa lo lee
       para no congelar el tablero encima de la última rotura. Si cambia el CSS,
       cambia aquí. */
    msSalida: 750,

    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      /* ⚠️ LA CELDA SE CALCULA CUADRADA, Y ESO NO ES UN DETALLE (titular,
         2026-09-22: «los iconos se están deformando, achatando; nunca
         deformarlos, escálalos completos»). Antes el lado salía de
         `min(ancho, alto)` del hueco y el CSS montaba la rejilla con
         `aspect-ratio: cols/filas` y `max-height: 100%`: cuando mandaba el
         ALTO, ese tope recortaba la rejilla sin avisar, las casillas se volvían
         más anchas que altas y la ficha —que se pinta con `background-size`—
         se estiraba para llenarlas. Ahora el lado sale de las DOS medidas a la
         vez y las casillas se declaran cuadradas, así que no hay nada que
         estirar.
         Y EL HUECO CEDE ANTES QUE LA FICHA (titular, «reduce un poco la
         distancia entre ellos para no generar scroll, esto es norma»): se
         empieza por el hueco cómodo y se aprieta solo si con él las fichas
         salen pequeñas. Nunca al revés. */
      var HUECO_COMODO = 10, HUECO_MINIMO = 4, FICHA_DIGNA = 96;
      function ladoCon(h) {
        return Math.floor(Math.min(
          (ctx.ancho - (t.cols - 1) * h) / t.cols,
          (ctx.alto - (t.filas - 1) * h) / t.filas));
      }
      var hueco = HUECO_COMODO;
      var lado = ladoCon(hueco);
      while (hueco > HUECO_MINIMO && lado < FICHA_DIGNA) {
        hueco -= 2;
        lado = ladoCon(hueco);
      }
      lado = Math.max(24, lado);
      /* La ficha ES el numero (cosmetico: no toca la logica ni la jugada). El
         set del tablero es el mismo en toda la ronda --lo fija `sets()`-- y el
         numero es la fila. */
      var set = sets(estado, ctx && ctx.ajustes && ctx.ajustes.set).juego;
      caja.innerHTML =
        '<div class="jg-cuadricula jg-cuadricula--fichas" style="--cols:' + t.cols + ';--filas:' + t.filas +
          ';--celda:' + lado + 'px;--hueco:' + hueco + 'px;--set:' + set + '">' +
          t.celdas.map(function (n, i) {
            /* La ficha se pinta con `background-position`; el numero va en
               `aria-label` porque en pantalla lo dice el dibujo. `--n` es la
               fila (0..15) del numero en la hoja. */
            return '<button type="button" class="jg-celda' + (estado.quitadas[i] ? ' jg-celda--fuera' : '') +
              '" data-celda="' + i + '" style="--n:' + (n - 1) + '" aria-label="' + n + '"' +
              (estado.quitadas[i] || ctx.bloqueado ? ' disabled' : '') + '></button>';
          }).join('') +
        '</div>' +
        '<p class="jg-pista">Toca los números en orden: sigue el <b>' + estado.sig + '</b></p>';

      if (!ctx.bloqueado) {
        caja.addEventListener('click', function (e) {
          var b = e.target.closest('[data-celda]');
          if (!b || b.disabled) return;
          var i = Number(b.dataset.celda);
          var antes = estado.sig;
          if (!ctx.jugar(i)) return;
          /* Un fallo se ve en el sitio: la celda tiembla. El acierto se va. */
          if (estado.sig === antes) {
            b.classList.remove('jg-celda--mal'); void b.offsetWidth; b.classList.add('jg-celda--mal');
          }
        });
      }

      /* Repintar solo lo que cambió: la celda que se fue y el número que sigue.
         AL ACERTAR NO DESAPARECE DE GOLPE (titular, 2026-09-22): pasa 500 ms a su
         icono ROTO, con un sonido de algo que se rompe, y luego se va. `actualizar`
         solo corre en el acierto --el toque errado suma fallo y no quita celda--,
         así que aquí siempre es una ficha que se rompe. */
      return function actualizar(est, jugada) {
        var b = caja.querySelector('[data-celda="' + jugada + '"]');
        if (b && est.quitadas[jugada]) {
          b.disabled = true;
          b.classList.add('jg-celda--rota');
          var s = window.ATWI.sonido;
          if (s && s.hay()) s.romper();
          setTimeout(function () { b.classList.add('jg-celda--fuera'); }, 500);
        }
        var p = caja.querySelector('.jg-pista b');
        if (p) p.textContent = est.sig;
      };
    },

    /* LO QUE ENSEÑA EN LA REVELACIÓN (contrato de `juegos/duelo.js`).
       ⚠️ AQUÍ NO SE DECLARA ICONO, Y ESO ES LA DECISIÓN (titular, 2026-09-22:
       «el icono que acompaña el tiempo del jugador es el de reloj de arena, no
       uno del juego»). Volaba la ficha del número, y eso decía «se compara el 16
       contra el 12» cuando lo que decide la ronda es el reloj. Sin icono propio,
       la escena pone el suyo: el reloj de arena, igual para los ocho juegos que
       se miden con tiempo.
       El TEXTO sí es suyo: con la ficha fuera, «12 de 16» no se ve en ningún
       sitio, y no haber completado es justo lo que explica un tiempo alto. */
    chocante: function (r) {
      if (!r) return null;
      var s = (Math.round(r.ms / 100) / 10) + ' s';
      return { nombre: r.completo ? s : (r.hechas + ' de 16 · ' + s) };
    },

    /* Una celda de la tabla del juez: cuántos, y en cuánto. */
    resumenCorto: function (r) {
      return (r.completo ? '✓ ' : '') + r.hechas + ' en ' + (Math.round(r.ms / 100) / 10) + ' s' +
        (r.fallos ? ' · ' + r.fallos + ' fallo' + (r.fallos === 1 ? '' : 's') : '');
    },

    resumenHTML: function (r) {
      return '<div class="jg-datos">' +
        '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-aciertos.webp" width="28" height="28" alt="" decoding="async">' +
          r.hechas + ' número' + (r.hechas === 1 ? '' : 's') + '</span>' +
        '<span class="jg-dato">' + r.fallos + ' fallo' + (r.fallos === 1 ? '' : 's') + '</span>' +
        '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-tiempo.webp" width="28" height="28" alt="" decoding="async">' +
          (Math.round(r.ms / 100) / 10).toFixed(1) + ' s</span>' +
      '</div>';
    }
  };
})();
