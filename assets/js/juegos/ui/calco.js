/* ATWI · minijuegos · el tablero de «Calco»
   ==========================================================================
   La mitad con DOM de `logica/calco.js`: una cuadrícula y una paleta.

   DOS PANTALLAS EN LA MISMA CAJA, y las separa `ctx.muestra`:
     · muestra  → el patrón a la vista, sin paleta y sin poder tocar. Dura lo
                  que dura el 3-2-1, que corre en una esquina para no taparlo.
     · juego    → la cuadrícula vacía y la paleta debajo. Se toca un color y se
                  toca una celda; tocar otra vez la misma celda con el mismo
                  color la borra.

   ⚠️ CADA COLOR LLEVA SU FORMA (docs/10 §10.6): cuatro colores que solo se
   distinguen por el tono dejan fuera a quien no los separa, y este juego va
   entero de recordar cuál iba dónde. La forma se dibuja con `clip-path` sobre
   la misma pieza, así que no cuesta arte ni un archivo más.

   LO QUE SE MANDA SON LAS JUGADAS, no la cuadrícula: `ctx.jugar(n)` con el
   entero que la lógica entiende (`celda * 5 + color + 1`, y `+ 0` borra). El
   resultado lo saca el servidor repitiéndolas. */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);
  J.ui = J.ui || Object.create(null);

  var PASOS = 5;          // el mismo de logica/calco.js
  var VACIA = -1;

  /* El color elegido en la paleta. Vive fuera de `estado` a propósito: es de la
     pantalla, no de la partida --el servidor no tiene por qué saber con qué
     color estaba el dedo-- y no entra en ninguna jugada. */
  var elegido = 0;

  function celdaHTML(i, valor, tocable) {
    var clase = 'jg-cal' + (valor === VACIA ? '' : ' jg-cal--puesta');
    return '<button type="button" class="' + clase + '" data-cal="' + i + '"' +
      (valor === VACIA ? '' : ' style="--tono:' + valor + '"') +
      (tocable ? '' : ' disabled') +
      ' aria-label="' + (valor === VACIA ? 'vacía' : 'color ' + (valor + 1)) + '">' +
      (valor === VACIA ? '' : '<i class="jg-cal__forma"></i>') +
      '</button>';
  }

  function rejillaHTML(t, valores, lado, hueco, tocable) {
    var celdas = '';
    for (var i = 0; i < valores.length; i++) celdas += celdaHTML(i, valores[i], tocable);
    return '<div class="jg-rejilla" style="--cols:' + t.cols + ';--filas:' + t.filas +
      ';--celda:' + lado + 'px;--hueco:' + hueco + 'px">' + celdas + '</div>';
  }

  function paletaHTML(colores, disco) {
    var s = '';
    for (var c = 0; c < colores; c++) {
      s += '<button type="button" class="jg-tinta' + (c === elegido ? ' jg-tinta--puesta' : '') +
        '" data-tinta="' + c + '" style="--tono:' + c + ';--disco:' + disco + 'px"' +
        ' aria-pressed="' + (c === elegido) + '" aria-label="Color ' + (c + 1) + '">' +
        '<i class="jg-cal__forma"></i></button>';
    }
    return '<div class="jg-paleta">' + s + '</div>';
  }

  /* ⚠️ LA CELDA SE CALCULA CUADRADA Y EL HUECO CEDE ANTES QUE ELLA, igual que en
     Cuenta y por lo mismo: la forma se dibuja con `clip-path` sobre la caja, así
     que una casilla más ancha que alta deformaría el rombo y el triángulo. El
     alto disponible descuenta lo que ocupan la paleta y la pista, que en la
     pantalla de juego van debajo. */
  function medidas(t, ancho, alto) {
    var COMODO = 10, MINIMO = 4, DIGNA = 62;
    function ladoCon(h) {
      return Math.floor(Math.min(
        (ancho - (t.cols - 1) * h) / t.cols,
        (alto - (t.filas - 1) * h) / t.filas));
    }
    var hueco = COMODO;
    var lado = ladoCon(hueco);
    while (hueco > MINIMO && lado < DIGNA) {
      hueco -= 2;
      lado = ladoCon(hueco);
    }
    return { lado: Math.max(24, lado), hueco: hueco };
  }

  J.ui.calco = {
    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      if (ctx.muestra) {
        var mm = medidas(t, ctx.ancho, ctx.alto - 34);
        caja.innerHTML =
          rejillaHTML(t, t.patron, mm.lado, mm.hueco, false) +
          '<p class="jg-pista">Mírate el patrón: en un momento desaparece.</p>';
        return null;
      }

      /* La paleta y la pista ocupan alto: se les reserva antes de medir, o la
         cuadrícula empuja el botón fuera de la pantalla. */
      var ALTO_PALETA = 84;
      var m = medidas(t, ctx.ancho, ctx.alto - ALTO_PALETA);
      var disco = Math.max(34, Math.min(52, m.lado - 8));
      caja.innerHTML =
        rejillaHTML(t, estado.pintadas, m.lado, m.hueco, !ctx.bloqueado) +
        paletaHTML(t.colores, disco) +
        '<p class="jg-pista">Toca un color y toca su celda. <b>Tócala otra vez para borrarla.</b></p>';

      if (!ctx.bloqueado) {
        caja.addEventListener('click', function (e) {
          var tinta = e.target.closest('[data-tinta]');
          if (tinta) {
            elegido = Number(tinta.dataset.tinta);
            var todas = caja.querySelectorAll('[data-tinta]');
            for (var k = 0; k < todas.length; k++) {
              var puesta = Number(todas[k].dataset.tinta) === elegido;
              todas[k].classList.toggle('jg-tinta--puesta', puesta);
              todas[k].setAttribute('aria-pressed', String(puesta));
            }
            return;
          }
          var b = e.target.closest('[data-cal]');
          if (!b || b.disabled) return;
          var i = Number(b.dataset.cal);
          /* Tocar la celda con el color que ya tiene la borra; con otro, la
             repinta. La lógica rechaza «pintar lo que ya está», así que esta
             cuenta no es un adorno: es lo que hace que la jugada sea legal. */
          var k2 = estado.pintadas[i] === elegido ? 0 : elegido + 1;
          ctx.jugar(i * PASOS + k2);
        });
      }

      /* Repintar solo la celda que cambió: la cuadrícula entera parpadearía y
         aquí se toca muy seguido. */
      return function actualizar(est, jugada) {
        var i = Math.floor(jugada / PASOS);
        var b = caja.querySelector('[data-cal="' + i + '"]');
        if (!b) return;
        var v = est.pintadas[i];
        b.className = 'jg-cal' + (v === VACIA ? '' : ' jg-cal--puesta');
        b.innerHTML = v === VACIA ? '' : '<i class="jg-cal__forma"></i>';
        if (v === VACIA) b.removeAttribute('style');
        else b.style.setProperty('--tono', v);
        b.setAttribute('aria-label', v === VACIA ? 'vacía' : 'color ' + (v + 1));
        var s = window.ATWI.sonido;
        if (s && s.hay()) s.clac(0.5);
      };
    },

    /* La pieza de esta ronda en la pantalla de resultados (docs/10 §13.3): el
       icono del juego y lo que se compara, que aquí son aciertos y tiempo. */
    chocante: function (r) {
      if (!r) return null;
      /* ⚠️ LO DE MÁS SE DICE AQUÍ, y no es un detalle: la marca lo resta, así
         que dos rondas con los mismos aciertos pueden no empatar. Sin este
         término la fila del duelo enseñaba «0 de 7» en los dos lados y coronaba
         a uno, que es exactamente una pantalla afirmando algo que no se puede
         comprobar leyéndola. */
      return {
        icono: '<img class="jg-el__dibujo" src="../assets/img/juegos/juego-calco.webp" ' +
          'width="92" height="92" alt="" aria-hidden="true" decoding="async">',
        nombre: r.aciertos + ' de 7' + (r.demas ? ' −' + r.demas : '') +
          ' en ' + (Math.round(r.ms / 100) / 10) + ' s'
      };
    },

    resumenCorto: function (r) {
      return (r.completo ? '✓ ' : '') + r.aciertos + '/7 en ' + (Math.round(r.ms / 100) / 10) + ' s' +
        (r.demas ? ' · ' + r.demas + ' de más' : '');
    },

    resumenHTML: function (r) {
      return '<div class="jg-datos">' +
        '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-aciertos.webp" width="28" height="28" alt="" decoding="async">' +
          r.aciertos + ' de 7</span>' +
        (r.demas ? '<span class="jg-dato">' + r.demas + ' de más</span>' : '') +
        '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-tiempo.webp" width="28" height="28" alt="" decoding="async">' +
          (Math.round(r.ms / 100) / 10).toFixed(1) + ' s</span>' +
      '</div>';
    }
  };
})();
