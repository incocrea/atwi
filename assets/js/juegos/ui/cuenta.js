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
  function sets(estado) {
    if (!memo || memo.estado !== estado) {
      var j = Math.floor(Math.random() * 8);
      var c = Math.floor(Math.random() * 7); if (c >= j) c += 1;   // c en [0,8) sin j
      memo = { estado: estado, juego: j, conteo: c };
    }
    return memo;
  }

  J.ui.cuenta = {
    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      var lado = Math.min(ctx.ancho, ctx.alto);
      /* La ficha ES el numero (cosmetico: no toca la logica ni la jugada). El
         set del tablero es el mismo en toda la ronda --lo fija `sets()`-- y el
         numero es la fila. */
      var set = sets(estado).juego;
      caja.innerHTML =
        '<div class="jg-cuadricula jg-cuadricula--fichas" style="--cols:' + t.cols + ';--filas:' + t.filas +
          ';--lado:' + Math.floor(lado) + 'px;--set:' + set + '">' +
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

    /* LA CUENTA ATRÁS (3-2-1) USA OTRO SET (titular, 2026-09-22): la carcasa la
       pinta y aquí le damos la ficha del número n (1..3) de un set DISTINTO al
       del tablero, para dar variedad al empezar. `aria-hidden` porque la carcasa
       ya anuncia el número por su región `aria-live`. */
    conteo: function (estado, n) {
      return '<span class="jg-conteo-ficha" style="--set:' + sets(estado).conteo +
        ';--n:' + (n - 1) + '" aria-hidden="true"></span>';
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
