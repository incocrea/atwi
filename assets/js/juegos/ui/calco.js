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

  /* Los 24 de la hoja viven en `piezas/stickers.js` desde que Canastas también
     los usa (2026-09-22): una lista de 24 nombres escrita en dos archivos es
     una lista que un día dice dos cosas. Su índice ES el número que viaja en
     el tablero (`fichas`), y allí está el aviso de por qué no se reordena. */
  var HOJA = J.stickers.HOJA;

  /* ⚠️ `draggable="false"`: un `<img>` es arrastrable de serie, así que sin
     esto el navegador arranca SU arrastre de imagen —cursor de prohibido— y de
     paso manda un `pointercancel` que corta el nuestro a mitad del gesto. Es la
     lección de Choque. */
  function stickerHTML(cual, px) {
    return '<img class="jg-st" src="../assets/img/juegos/st-' + HOJA[cual] + '.webp" ' +
      'width="' + px + '" height="' + px + '" alt="" decoding="async" draggable="false">';
  }

  /* `seVa` es el sticker del PATRÓN que se desvanece en una casilla vacía al
     empezar a jugar (ver `pintar`). Es decorado: no cuenta como puesto, no lo
     nombra la etiqueta y se lo lleva el primer sticker que caiga ahí. */
  function celdaHTML(t, i, valor, px, seVa) {
    return '<button type="button" class="jg-cal' + (valor === VACIA ? '' : ' jg-cal--puesta') +
      '" data-cal="' + i + '"' +
      ' aria-label="' + (valor === VACIA ? 'casilla vacía' : HOJA[t.fichas[valor]]) + '">' +
      (valor !== VACIA ? stickerHTML(t.fichas[valor], px) :
        seVa !== undefined && seVa !== VACIA ? stickerHTML(t.fichas[seVa], px).replace('class="jg-st"', 'class="jg-st jg-st--se-va"') : '') +
      '</button>';
  }

  function rejillaHTML(t, valores, lado, hueco, patronQueSeVa) {
    var dentro = Math.round(lado * 0.82);
    var celdas = '';
    for (var i = 0; i < valores.length; i++) {
      celdas += celdaHTML(t, i, valores[i], dentro, patronQueSeVa ? patronQueSeVa[i] : undefined);
    }
    return '<div class="jg-rejilla" style="--cols:' + t.cols + ';--filas:' + t.filas +
      ';--celda:' + lado + 'px;--hueco:' + hueco + 'px">' + celdas + '</div>';
  }

  /* En la muestra la paleta YA ESTÁ, pero no se toca (`jg-paleta--espera`): se
     pinta para que al empezar no aparezca nada nuevo que empuje la rejilla. */
  function paletaHTML(t, disco, espera) {
    var s = '';
    for (var c = 0; c < t.distintos; c++) {
      s += '<button type="button" class="jg-tinta" data-tinta="' + c + '"' +
        (espera ? ' tabindex="-1" aria-hidden="true"' : '') +
        ' style="--disco:' + disco + 'px" aria-label="Sticker ' + HOJA[t.fichas[c]] + '">' +
        stickerHTML(t.fichas[c], Math.round(disco * 0.86)) + '</button>';
    }
    return '<div class="jg-paleta' + (espera ? ' jg-paleta--espera' : '') + '">' + s + '</div>';
  }

  /* Cuánto dura el desvanecido del patrón al empezar a jugar (titular). Es el
     mismo número que la animación `jg-se-va` de juegos.css. */
  var MS_SE_VA = 800;
  /* El estado cuya muestra se acaba de pintar: si la pintada siguiente es la de
     jugar ESE MISMO estado, es la transición y el patrón se desvanece. Se
     compara el objeto y no un booleano porque reintentar monta un estado nuevo
     y ahí la muestra vuelve a empezar. */
  var vioLaMuestra = null;

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
    /* «¿CÓMO SE JUEGA?», el globo de la portada (titular, 2026-09-22): los tres
       momentos de la ronda en tres rejillas de cajas de madera en miniatura
       --míralo, se esconde, cálcalo--. Lo que dice del ganador sale de la marca
       (`[completo, aciertos − de más, −ms]`). */
    comoSeJuega: function () {
      var a = HOJA.indexOf('estrella'), b = HOJA.indexOf('gato');
      function rejilla(celdas) {
        return '<span class="jg-cal-mini">' + celdas.map(function (v) {
          return '<span class="jg-cal-mini__c">' + (v >= 0 ? J.stickers.html(v, 64, 'jg-cal-mini__st') : '') + '</span>';
        }).join('') + '</span>';
      }
      return '<p class="jg-como__txt">Mira el patrón mientras corre la cuenta atrás: <b>después se esconde</b>.</p>' +
        '<ul class="jg-como__ejs" style="--cols:3">' +
          '<li class="jg-como__ej">' + rejilla([a, -1, -1, b]) + '<span class="jg-como__dice">1 · Míralo</span></li>' +
          '<li class="jg-como__ej">' + rejilla([-1, -1, -1, -1]) + '<span class="jg-como__dice">2 · Se esconde</span></li>' +
          '<li class="jg-como__ej">' + rejilla([a, -1, -1, b]) + '<span class="jg-como__dice jg-como__dice--si">3 · Cálcalo</span></li>' +
        '</ul>' +
        '<p class="jg-como__txt"><b>Arrastra cada sticker a su caja</b>; toca uno puesto para quitarlo. ' +
          'Gana quien lo calca entero; si no, quien acierta más, y poner de más resta.</p>';
    },

    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      /* ⚠️ LA MUESTRA Y EL JUEGO SON LA MISMA MAQUETA (titular, 2026-09-22: «las
         cajas están en una posición y al iniciar la partida se mueven al
         aparecer el set de iconos… esto marea y confunde»). Eran dos: la muestra
         reservaba 34 px para la pista y el juego 96 para la paleta, así que la
         rejilla cambiaba de tamaño y de sitio justo en el instante en que hay que
         recordar DÓNDE estaba cada sticker. Ahora las dos fases pintan lo mismo
         —rejilla, la banda del conteo, la paleta y una pista de alto fijo— y lo
         único que cambia es lo que hay DENTRO de las casillas.
         La banda es el hueco donde flota el 3-2-1 durante la muestra (la carcasa
         lo coloca sobre `[data-conteo]`); en el juego se queda vacía, porque
         quitarla movería todo lo de debajo. */
      var RESERVA = 44 + 16 + 58 + 12 + 40;   // banda + paleta con su margen + pista
      var m = medidas(t, ctx.ancho, ctx.alto - RESERVA);
      var disco = Math.max(40, Math.min(58, m.lado - 6));
      /* EL PATRÓN NO DESAPARECE DE GOLPE: se desvanece en 800 ms (titular: «un
         poco de ayuda a la memoria de dónde estaba»). Solo en la primera pintada
         de juego tras la muestra de este mismo estado. */
      var seVa = !ctx.muestra && vioLaMuestra === estado;
      vioLaMuestra = ctx.muestra ? estado : null;
      caja.innerHTML =
        rejillaHTML(t, ctx.muestra ? t.patron : estado.pintadas, m.lado, m.hueco,
          seVa ? t.patron : null) +
        '<div class="jg-cal-banda"' + (ctx.muestra ? ' data-conteo' : '') + '></div>' +
        paletaHTML(t, disco, ctx.muestra) +
        (ctx.muestra ?
          '<p class="jg-pista jg-pista--fija">Mírate el patrón: en un momento desaparece.</p>' :
          '<p class="jg-pista jg-pista--fija">Arrastra los stickers a las cajas, o de una caja a otra. ' +
          '<b>Toca uno puesto para quitarlo.</b></p>');
      if (seVa) {
        /* Con reloj y no con `animationend`: las animaciones no avanzan en una
           pestaña que no pinta (S29), y un sticker del patrón que se quedara
           puesto sería una pista que el otro jugador no tuvo. */
        setTimeout(function () {
          [].forEach.call(caja.querySelectorAll('.jg-st--se-va'), function (n) { n.remove(); });
        }, MS_SE_VA + 50);
      }

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
      var ar = null;            // {ficha, origen, x0, y0, fantasma}
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
        if (n) {
          ar = { ficha: Number(n.dataset.tinta), origen: -1, x0: e.clientX, y0: e.clientY, fantasma: null };
          return;
        }
        /* UN STICKER YA PUESTO TAMBIÉN SE ARRASTRA (titular, 2026-09-22: «quiero
           poder arrastrar stickers ya ubicados a otra caja; si es una caja
           ocupada se intercambian, esto facilita reorganizar para probar»).
           Hasta soltarlo es el mismo gesto que el de la paleta, y el umbral de
           seis píxeles sigue separándolo del toque: tocar sin mover todavía
           QUITA, como antes. */
        var c = e.target.closest('[data-cal]');
        if (!c) return;
        var i = Number(c.dataset.cal);
        if (estado.pintadas[i] === VACIA) return;
        ar = { ficha: estado.pintadas[i], origen: i, x0: e.clientX, y0: e.clientY, fantasma: null };
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
          ar = null; marcarDiana(null); marcarOrigen(-1); return;
        }
        if (!ar.fantasma) {
          if (Math.abs(e.clientX - ar.x0) < UMBRAL && Math.abs(e.clientY - ar.y0) < UMBRAL) return;
          ar.fantasma = fantasmaEn(ar.ficha, e.clientX, e.clientY);
          marcarOrigen(ar.origen);
        }
        mover(ar.fantasma, e.clientX, e.clientY);
        marcarDiana(celdaBajo(e.clientX, e.clientY));
      }

      /* La caja de la que sale el sticker se queda con él atenuado mientras
         viaja: se ve de dónde viene y a dónde vuelve si se suelta fuera. */
      function marcarOrigen(i) {
        [].forEach.call(caja.querySelectorAll('.jg-cal'), function (n) {
          n.classList.toggle('jg-cal--origen', Number(n.dataset.cal) === i);
        });
      }

      window.addEventListener('pointerup', alSoltar);
      window.addEventListener('pointercancel', alSoltar);
      function alSoltar(e) {
        if (seFue() || !ar) return;
        var esto = ar; ar = null;
        marcarDiana(null);
        marcarOrigen(-1);
        /* Sin fantasma no hubo arrastre: fue un toque. En la paleta no pone
           nada, y en una caja lo atiende el `click`, que quita. */
        if (!esto.fantasma) return;
        esto.fantasma.remove();
        comerClic = true;
        var c = celdaBajo(e.clientX, e.clientY);
        if (!c) return;                    // soltar fuera no hace nada: se queda donde estaba
        if (esto.origen >= 0) moverEntre(esto.origen, Number(c.dataset.cal));
        else soltarEn(Number(c.dataset.cal), esto.ficha);
      }

      function soltarEn(i, ficha) {
        /* Soltar encima de una casilla que ya tiene ESE sticker es un gesto sin
           efecto, y la lógica lo rechaza: se atiende aquí para no mandar una
           jugada que el servidor va a tirar. */
        if (estado.pintadas[i] === ficha) return;
        ctx.jugar(i * PASOS + ficha + 1);
      }

      /* ¿Quedaría el tablero igual al patrón si la casilla `celda` tuviera
         `valor` y todo lo demás siguiera como está? */
      function calcariaCon(celda, valor) {
        var p = t.patron;
        for (var k = 0; k < p.length; k++) {
          if ((k === celda ? valor : estado.pintadas[k]) !== p[k]) return false;
        }
        return true;
      }

      /* MOVER O INTERCAMBIAR ES DOS JUGADAS DE LAS DE SIEMPRE, no una nueva:
         poner en el destino lo que venía y dejar en el origen lo que había en el
         destino —nada si estaba vacío—. Así ni la lógica ni el servidor cambian:
         repiten exactamente lo que ya sabían repetir.
         ⚠️ Y EL ORDEN SE ELIGE, porque entre las dos jugadas hay un tablero a
         medias y la ronda se gana en cuanto el tablero calca el patrón. Poner
         primero en el destino deja el sticker EN LAS DOS cajas un instante; si
         justo eso fuera el patrón, se ganaría con un tablero que quien juega no
         pidió —su movimiento termina en otro—. En ese caso se empieza por el
         origen, y ahí el tablero a medias no puede calcar el patrón: las dos
         cosas a la vez pedirían que el destino tuviera dos stickers distintos.
         Así se gana SOLO con el tablero que resulta del gesto. */
      function moverEntre(o, d) {
        if (o === d) return;
        var a = estado.pintadas[o], b = estado.pintadas[d];
        if (a === VACIA || a === b) return;        // mismo sticker: nada cambia
        var alDestino = d * PASOS + a + 1;
        var alOrigen = b === VACIA ? o * PASOS : o * PASOS + b + 1;
        var orden = calcariaCon(d, a) ? [alOrigen, alDestino] : [alDestino, alOrigen];
        /* Si la primera cierra la ronda, la segunda la rechaza la carcasa
           (`jugar` solo acepta con la ronda en juego). */
        if (ctx.jugar(orden[0])) ctx.jugar(orden[1]);
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
