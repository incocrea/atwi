/* ATWI · minijuegos · el tablero de «Cuenta», el juego de mentira
   ==========================================================================
   La mitad con DOM de `logica/prueba.js`: una cuadrícula de números y nada
   más. Existe para recorrer la carcasa entera antes de que haya un juego de
   verdad, y se va con él (Fase 11 de docs/10).

   Un tablero no decide nada: llama a `ctx.jugar(i)` y la carcasa contesta
   —aplica la lógica, anota la jugada y llama a `actualizar`—. Aquí se dibuja
   con lo que hay en `estado`, que es la única verdad. */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);
  J.ui = J.ui || Object.create(null);

  J.ui.prueba = {
    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      var lado = Math.min(ctx.ancho, ctx.alto);
      caja.innerHTML =
        '<div class="jg-cuadricula" style="--cols:' + t.cols + ';--filas:' + t.filas +
          ';--lado:' + Math.floor(lado) + 'px">' +
          t.celdas.map(function (n, i) {
            return '<button type="button" class="jg-celda' + (estado.quitadas[i] ? ' jg-celda--fuera' : '') +
              '" data-celda="' + i + '"' + (estado.quitadas[i] || ctx.bloqueado ? ' disabled' : '') + '>' +
              n + '</button>';
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
