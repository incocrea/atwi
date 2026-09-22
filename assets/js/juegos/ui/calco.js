/* ATWI · minijuegos · el tablero de «Calco»
   ==========================================================================
   La mitad con DOM de `logica/calco.js`: una cuadrícula y una paleta de
   stickers.

   DOS PANTALLAS EN LA MISMA CAJA, y las separa `ctx.muestra`:
     · muestra  → el patrón a la vista, sin paleta y sin poder tocar. Dura lo
                  que dura el 3-2-1, que corre abajo para no taparlo.
     · juego    → la cuadrícula vacía y la paleta debajo.

   EL GESTO (titular, 2026-09-22): poner es SOLO arrastrando un sticker de la
   paleta a su casilla, con el área de suelta resaltada al pasar por encima; y
   TOCAR una casilla que ya tiene sticker lo quita. Son dos gestos que no se
   pisan: uno trae y el otro devuelve.
   ⚠️ El arrastre NO empieza en `pointerdown` sino al MOVERSE seis píxeles, y
   eso es lo que deja convivir a los dos: un toque sigue siendo un toque. Lo que
   impide que el dedo scrollee en vez de arrastrar es `touch-action: none` en el
   CSS, no un `preventDefault` que se comería el toque.
   ⚠️ Y el teclado sigue vivo por su lado —Enter en un sticker lo toma, Enter en
   una casilla lo pone— porque un lector de pantalla no sabe arrastrar y el
   juego dejaría de poder jugarse. Va en `keydown` y NO en `click`, así que con
   el dedo o el ratón sigue siendo solo arrastrar, como se pidió.

   LO QUE SE MANDA SON LAS JUGADAS, no la cuadrícula: `ctx.jugar(n)` con el
   entero que la lógica entiende (`celda * 5 + ficha + 1`, y `+ 0` quita). El
   resultado lo saca el servidor repitiéndolas. */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);
  J.ui = J.ui || Object.create(null);

  var PASOS = 5;          // el mismo de logica/calco.js
  var VACIA = -1;

  /* Los 24 de la hoja, en el orden que la lógica cuenta: su índice ES el número
     que viaja en el tablero (`fichas`). ⚠️ NO SE REORDENA NI SE RECORTA esta
     lista sin subir `VERSION_REGLAS`: un teléfono con otro orden pondría otro
     dibujo en la misma ronda. */
  var HOJA = [
    'arcoiris', 'balon', 'camara', 'conejo', 'corazon', 'cupcake',
    'dona', 'estrella', 'gato', 'gema', 'huevo', 'lata',
    'leche', 'libro', 'luna', 'mando', 'manzana', 'osito',
    'patito', 'pizza', 'taza', 'trebol', 'zanahoria', 'zapatilla'
  ];

  /* ⚠️ `draggable="false"`: un `<img>` es arrastrable de serie, así que sin
     esto el navegador arranca SU arrastre de imagen —cursor de prohibido— y de
     paso manda un `pointercancel` que corta el nuestro a mitad del gesto. Es la
     lección de Choque. */
  function stickerHTML(cual, px) {
    return '<img class="jg-st" src="../assets/img/juegos/st-' + HOJA[cual] + '.webp" ' +
      'width="' + px + '" height="' + px + '" alt="" decoding="async" draggable="false">';
  }

  function celdaHTML(t, i, valor, px) {
    return '<button type="button" class="jg-cal' + (valor === VACIA ? '' : ' jg-cal--puesta') +
      '" data-cal="' + i + '"' +
      ' aria-label="' + (valor === VACIA ? 'casilla vacía' : HOJA[t.fichas[valor]]) + '">' +
      (valor === VACIA ? '' : stickerHTML(t.fichas[valor], px)) +
      '</button>';
  }

  function rejillaHTML(t, valores, lado, hueco) {
    var dentro = Math.round(lado * 0.82);
    var celdas = '';
    for (var i = 0; i < valores.length; i++) celdas += celdaHTML(t, i, valores[i], dentro);
    return '<div class="jg-rejilla" style="--cols:' + t.cols + ';--filas:' + t.filas +
      ';--celda:' + lado + 'px;--hueco:' + hueco + 'px">' + celdas + '</div>';
  }

  function paletaHTML(t, disco) {
    var s = '';
    for (var c = 0; c < t.distintos; c++) {
      s += '<button type="button" class="jg-tinta" data-tinta="' + c + '"' +
        ' style="--disco:' + disco + 'px" aria-label="Sticker ' + HOJA[t.fichas[c]] + '">' +
        stickerHTML(t.fichas[c], Math.round(disco * 0.86)) + '</button>';
    }
    return '<div class="jg-paleta">' + s + '</div>';
  }

  /* ⚠️ LA CASILLA SE CALCULA CUADRADA Y EL HUECO CEDE ANTES QUE ELLA, igual que
     en Cuenta y por lo mismo: el sticker se pinta dentro y una casilla más
     ancha que alta lo dejaría descentrado. El alto disponible descuenta lo que
     ocupan la paleta y la pista, que van debajo. */
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
          rejillaHTML(t, t.patron, mm.lado, mm.hueco) +
          '<p class="jg-pista">Mírate el patrón: en un momento desaparece.</p>';
        return null;
      }

      var ALTO_PALETA = 96;
      var m = medidas(t, ctx.ancho, ctx.alto - ALTO_PALETA);
      var disco = Math.max(40, Math.min(58, m.lado - 6));
      caja.innerHTML =
        rejillaHTML(t, estado.pintadas, m.lado, m.hueco) +
        paletaHTML(t, disco) +
        '<p class="jg-pista">Arrastra cada sticker a su casilla. ' +
        '<b>Toca una puesta para quitarla.</b></p>';

      if (ctx.bloqueado) return null;

      var dentro = Math.round(m.lado * 0.82);

      function repintaCelda(i, v) {
        var b = caja.querySelector('[data-cal="' + i + '"]');
        if (!b) return;
        b.className = 'jg-cal' + (v === VACIA ? '' : ' jg-cal--puesta');
        b.innerHTML = v === VACIA ? '' : stickerHTML(t.fichas[v], dentro);
        b.setAttribute('aria-label', v === VACIA ? 'casilla vacía' : HOJA[t.fichas[v]]);
      }

      /* --- ARRASTRAR ------------------------------------------------------ */
      var UMBRAL = 6;
      var ar = null;            // {ficha, x0, y0, fantasma}
      var comerClic = false;

      function fantasmaEn(ficha, x, y) {
        var g = document.createElement('div');
        g.className = 'jg-arrastre';
        g.innerHTML = stickerHTML(t.fichas[ficha], 84);
        document.body.appendChild(g);
        mover(g, x, y);
        return g;
      }
      function mover(g, x, y) { g.style.left = x + 'px'; g.style.top = y + 'px'; }
      function celdaBajo(x, y) {
        var n = document.elementFromPoint(x, y);
        return n && n.closest ? n.closest('[data-cal]') : null;
      }
      function marcarDiana(c) {
        [].forEach.call(caja.querySelectorAll('.jg-cal'), function (n) {
          n.classList.toggle('jg-cal--diana', n === c);
        });
      }

      /* La red contra el arrastre nativo, para lo que venga después sin tener
         que acordarse de marcarlo pieza por pieza. */
      caja.addEventListener('dragstart', function (e) { e.preventDefault(); });

      caja.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        /* El candado que se traga el clic posterior a un arrastre se suelta al
           empezar el gesto siguiente: en táctil ese clic no siempre llega, y si
           se quedara puesto se comería el toque de más tarde. */
        comerClic = false;
        var n = e.target.closest('[data-tinta]');
        if (!n) return;
        ar = { ficha: Number(n.dataset.tinta), x0: e.clientX, y0: e.clientY, fantasma: null };
      });

      /* Los oyentes viven en `window` --el dedo se sale de la caja a mitad del
         gesto-- y se quitan SOLOS cuando la pantalla ya no está en el documento:
         así la ronda siguiente no hereda los de la anterior y el juego no
         necesita que nadie le avise de que lo cerraron. */
      function seFue() {
        if (caja.isConnected) return false;
        window.removeEventListener('pointermove', alMover);
        window.removeEventListener('pointerup', alSoltar);
        window.removeEventListener('pointercancel', alSoltar);
        if (ar && ar.fantasma) ar.fantasma.remove();
        ar = null;
        return true;
      }

      window.addEventListener('pointermove', alMover);
      function alMover(e) {
        if (seFue() || !ar) return;
        /* Si el dedo ya no está apoyado no hay gesto: un `pointerup` se puede
           perder y sin esto quedaría un sticker arrastrándose solo. */
        if (!e.buttons) {
          if (ar.fantasma) ar.fantasma.remove();
          ar = null; marcarDiana(null); return;
        }
        if (!ar.fantasma) {
          if (Math.abs(e.clientX - ar.x0) < UMBRAL && Math.abs(e.clientY - ar.y0) < UMBRAL) return;
          ar.fantasma = fantasmaEn(ar.ficha, e.clientX, e.clientY);
        }
        mover(ar.fantasma, e.clientX, e.clientY);
        marcarDiana(celdaBajo(e.clientX, e.clientY));
      }

      window.addEventListener('pointerup', alSoltar);
      window.addEventListener('pointercancel', alSoltar);
      function alSoltar(e) {
        if (seFue() || !ar) return;
        var esto = ar; ar = null;
        marcarDiana(null);
        if (!esto.fantasma) return;        // fue un toque en la paleta: no pone nada
        esto.fantasma.remove();
        comerClic = true;
        var c = celdaBajo(e.clientX, e.clientY);
        if (!c) return;                    // soltar fuera no hace nada
        soltarEn(Number(c.dataset.cal), esto.ficha);
      }

      function soltarEn(i, ficha) {
        /* Soltar encima de una casilla que ya tiene ESE sticker es un gesto sin
           efecto, y la lógica lo rechaza: se atiende aquí para no mandar una
           jugada que el servidor va a tirar. */
        if (estado.pintadas[i] === ficha) return;
        ctx.jugar(i * PASOS + ficha + 1);
      }

      caja.addEventListener('click', function (e) {
        if (comerClic) { comerClic = false; return; }
        var b = e.target.closest('[data-cal]');
        if (!b) return;
        var i = Number(b.dataset.cal);
        /* TOCAR SOLO QUITA (titular): poner es arrastrar. Una casilla vacía no
           tiene nada que devolver, así que el toque no hace nada. */
        if (estado.pintadas[i] === VACIA) return;
        ctx.jugar(i * PASOS);
      });

      /* El camino de teclado, que el arrastre no cubre. */
      var tomada = -1;
      caja.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var p = e.target.closest('[data-tinta]');
        if (p) { tomada = Number(p.dataset.tinta); e.preventDefault(); return; }
        var b = e.target.closest('[data-cal]');
        if (!b) return;
        var i = Number(b.dataset.cal);
        e.preventDefault();
        if (estado.pintadas[i] !== VACIA) ctx.jugar(i * PASOS);
        else if (tomada >= 0) soltarEn(i, tomada);
      });

      return function actualizar(est, jugada) {
        var i = Math.floor(jugada / PASOS);
        repintaCelda(i, est.pintadas[i]);
        var s = window.ATWI.sonido;
        if (s && s.hay()) s.clac(0.5);
      };
    },

    /* La pieza de esta ronda en la pantalla de resultados (docs/10 §13.3). */
    chocante: function (r) {
      if (!r) return null;
      /* ⚠️ LO DE MÁS SE DICE AQUÍ: la marca lo resta, así que dos rondas con los
         mismos aciertos pueden no empatar. Sin este término la fila del duelo
         enseñaba «0 de 7» en los dos lados y coronaba a uno, que es una pantalla
         afirmando algo que no se puede comprobar leyéndola. */
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
