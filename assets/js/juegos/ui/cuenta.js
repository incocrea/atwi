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

  J.ui.cuenta = {
    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      var lado = Math.min(ctx.ancho, ctx.alto);
      /* UN SET DE ICONOS AL AZAR EN CADA CARGA (titular, 2026-09-21): la ficha
         ES el numero. Es COSMETICO --no toca la logica ni la jugada-- asi que
         va con `Math.random` y no con la semilla; da igual que los dos lados en
         linea vean formas distintas. Son 8 sets (columnas de la hoja) y el
         numero es la fila. */
      var set = Math.floor(Math.random() * 8);
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

      /* Repintar solo lo que cambió: la celda que se fue y el número que sigue. */
      return function actualizar(est, jugada) {
        var b = caja.querySelector('[data-celda="' + jugada + '"]');
        if (b && est.quitadas[jugada]) { b.classList.add('jg-celda--fuera'); b.disabled = true; }
        var p = caja.querySelector('.jg-pista b');
        if (p) p.textContent = est.sig;
      };
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
