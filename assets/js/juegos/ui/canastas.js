/* ATWI · minijuegos · el tablero de «Canastas»
   ==========================================================================
   La mitad con DOM de `logica/canastas.js`: seis torres de cajas apiladas
   sobre su tarima, un contador de movimientos y «Reiniciar».

   UNA CAJA ES UNA SOLA PIEZA: la caja de color con su sticker dentro (titular,
   2026-09-22: «de modo que caja y sticker se vuelven un solo elemento
   arrastrable»). Qué caja y qué sticker lo dice el tablero (`cajas`, `fichas`),
   emparejados por el tipo.

   EL GESTO ES ARRASTRAR (titular, el mismo día: «la lógica de movimiento cambia
   de dos clics a arrastrar la caja superior de cada torre a la zona superior de
   la torre destino»). Se coge el TRAMO de arriba --la de arriba y todas las
   iguales que tenga debajo-- y se coge POR CUALQUIERA DE ELLAS (titular, el
   mismo día: «cualquiera debe funcionar como seleccionable»): tres azules
   apiladas son una sola cosa que se mueve junta, así que exigir el asa de la de
   más arriba era hacer apuntar a una franja de 20 px. Se suelta sobre
   cualquier punto de la torre de destino --la torre entera es la diana--, y se
   encienden los huecos exactos donde caerá. Si no cabe ahí, el tramo vuelve a
   su torre y la diana tiembla.
   ⚠️ EL GESTO LO LLEVA LA PIEZA COMÚN `piezas/arrastre.js`: con el dedo va por
   eventos táctiles y solo suelta al levantarlo; ahí está por qué.
   ⚠️ Y EL TECLADO SIGUE VIVO por su lado --Enter en una torre coge su caja,
   Enter en otra la suelta--, porque un lector de pantalla no sabe arrastrar. Va
   en `keydown` y no en `click`, así que con el dedo o el ratón el único gesto
   es arrastrar, como se pidió.

   ⚠️ LA PANTALLA ES SOLO LAS TORRES (titular, 2026-09-22: «quítale también el
   botón de reiniciar y el contador de movimientos y las instrucciones de esta
   pantalla»). Las reglas ya las dice la presentación de la ronda, y los
   movimientos --que son lo que se compara-- los enseñan el recibo y la tabla del
   juez. Sin «Reiniciar», un callejón sin salida se paga con el reloj.

   LO QUE SE MANDA SON LAS JUGADAS, `desde * 8 + hasta`. El resultado lo saca el
   servidor repitiéndolas. */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);
  J.ui = J.ui || Object.create(null);

  var F = 8;               // el mismo de logica/canastas.js

  /* Las seis cajas de la plancha, en el orden que la lógica cuenta: su índice
     ES el número que viaja en el tablero (`cajas`). ⚠️ NO SE REORDENA sin subir
     `VERSION_REGLAS`, por lo mismo que la hoja de stickers. El banco comprueba
     que sean exactamente los `canasta-*.webp` de la carpeta. */
  var CAJAS = ['rosa', 'azul', 'verde', 'morado', 'naranja', 'crema'];

  /* LA GEOMETRÍA DE UNA CAJA, medida en la plancha y compartida con el icono
     del juego (`PASO`, `ST_LADO`, `ST_Y` en tools/cortar_juegos.py):
       ASPECTO  el lienzo de cada caja es 256×219.
       PASO     cuánto sube cada caja respecto a la de abajo, en altos de caja:
                la de arriba se apoya en el reborde de la de abajo y lo tapa.
       ST_LADO  el sticker, en altos de caja.
       ST_Y     la altura de su centro: el frente empieza donde acaba el
                reborde, al 44 %, y el sticker va en medio de lo que queda. */
  var ASPECTO = 256 / 219;
  var PASO = 0.70;
  /* 0,62 y no 0,50 (titular, con un ejemplo, 2026-09-22): el sticker tiene que
     llenar el frente de la caja, que va del 44 % al pie. Centrado a medio
     camino, al 72 %. */
  var ST_LADO = 0.62;
  var ST_Y = 0.72;

  /* Cuánto tarda la caja en asentarse donde se soltó, y lo que la carcasa
     espera antes de congelar el tablero al acabar: el movimiento que CIERRA la
     ronda es el que más se mira. */
  var MS_CAE = 200;
  var MS_SALIDA = 520;

  function seg(ms) { return (Math.round((ms || 0) / 100) / 10) + ' s'; }

  function rachaAbajo(t) {
    if (!t.length) return 0;
    var n = 1;
    while (n < t.length && t[n] === t[0]) n++;
    return n;
  }
  function completa(t, cabe) { return t.length === cabe && rachaAbajo(t) === cabe; }
  function rachaArriba(t) {
    if (!t.length) return 0;
    var n = 1;
    while (n < t.length && t[t.length - 1 - n] === t[t.length - 1]) n++;
    return n;
  }
  /* Cuántas se lleva un movimiento (la misma cuenta que la lógica): todas las
     iguales de arriba de `d`, o las que quepan en `h`. */
  function cuantasVan(tt, cabe, d, h) {
    return Math.min(rachaArriba(tt[d]), cabe - tt[h].length);
  }
  function puede(tt, cabe, d, h) {
    if (d === h) return false;
    var a = tt[d], b = tt[h];
    if (!a.length || b.length >= cabe) return false;
    return !b.length || b[b.length - 1] === a[a.length - 1];
  }

  /* ⚠️ EL TAMAÑO SALE DEL HUECO, Y SE PRUEBAN DOS MAQUETAS: una fila de seis
     torres o dos filas de tres. Se queda la que deja la caja más grande. En un
     teléfono gana la de dos filas (medido a 375×812: cajas de 94 px contra 49);
     en una pantalla ancha y baja, la de una.
     Todo sale de UN número, el ancho de la caja (`w`): su alto es `w / ASPECTO`
     y una torre llena mide una caja más tres pasos. */
  function medidas(t, ancho, alto) {
    var n = t.torres.length;
    var mejor = null;
    [1, 2].forEach(function (filas) {
      var cols = Math.ceil(n / filas);
      var gx = Math.max(10, Math.min(22, Math.floor(ancho * 0.05)));
      var gy = 18;
      var altoTorre = (1 + (t.cabe - 1) * PASO) / ASPECTO;   // en anchos de caja
      var porAncho = (ancho - (cols - 1) * gx) / cols;
      var porAlto = (alto - (filas - 1) * gy) / (filas * altoTorre);
      var w = Math.floor(Math.min(porAncho, porAlto, 104));
      if (!mejor || w > mejor.w) mejor = { w: w, cols: cols, gx: gx, gy: gy };
    });
    mejor.w = Math.max(34, mejor.w);
    mejor.h = Math.round(mejor.w / ASPECTO);
    return mejor;
  }

  function estiloDe(m, cabe) {
    return '--w:' + m.w + 'px;--h:' + m.h + 'px;--paso:' + PASO + ';--cabe:' + cabe +
      ';--st:' + Math.round(m.h * ST_LADO) + 'px;' +
      '--st-y:' + Math.round(m.h * ST_Y) + 'px;--cols:' + m.cols + ';--gx:' + m.gx + 'px;--gy:' + m.gy + 'px';
  }

  function nombreDe(t, tipo) {
    return 'caja ' + CAJAS[t.cajas[tipo]] + ' con ' + J.stickers.nombre(t.fichas[tipo]);
  }

  function nombreTorre(t, torre, i) {
    if (!torre.length) return 'Torre ' + (i + 1) + ', vacía';
    return 'Torre ' + (i + 1) + ', de abajo arriba: ' +
      torre.map(function (x) { return nombreDe(t, x); }).join('; ');
  }

  /* La caja con su sticker: una pieza. La usan la torre y el fantasma. */
  function cajaHTML(t, tipo) {
    return '<img class="jg-cn__img" src="../assets/img/juegos/canasta-' + CAJAS[t.cajas[tipo]] + '.webp" ' +
        'width="256" height="219" alt="" decoding="async" draggable="false">' +
      J.stickers.html(t.fichas[tipo], 96, 'jg-cn__st');
  }

  function torreHTML(t, torre, i, bloqueado) {
    var s = '';
    /* Las que se pueden coger: el tramo de iguales de arriba. */
    var coge = bloqueado ? 0 : rachaArriba(torre);
    for (var k = 0; k < torre.length; k++) {
      var clases = k >= torre.length - coge ? ' jg-cn__caja--coge' : '';
      if (clases && k === torre.length - 1) clases += ' jg-cn__caja--arriba';
      s += '<span class="jg-cn__caja' + clases + '"' +
        ' style="--k:' + k + ';z-index:' + (k + 1) + '">' + cajaHTML(t, torre[k]) + '</span>';
    }
    /* LOS HUECOS SON CAJAS FANTASMA (titular, con un ejemplo, 2026-09-22): la
       caja crema en gris y medio transparente, una por sitio libre. Dicen de un
       vistazo cuánto cabe en cada torre, y una torre vacía se ve como cuatro
       huecos en vez de como nada. El de más abajo (`--siguiente`) es donde
       caería la próxima: se enciende al arrastrar algo que cabe aquí. */
    for (var v = torre.length; v < t.cabe; v++) {
      s += '<span class="jg-cn__hueco' + (v === torre.length ? ' jg-cn__hueco--siguiente' : '') + '"' +
        ' style="--k:' + v + ';z-index:' + (v + 1) + '" aria-hidden="true">' +
        '<img class="jg-cn__img" src="../assets/img/juegos/canasta-crema.webp" width="256" height="219" ' +
          'alt="" decoding="async" draggable="false"></span>';
    }
    return '<div class="jg-cn__torre' + (completa(torre, t.cabe) ? ' jg-cn__torre--completa' : '') + '"' +
        ' data-torre="' + i + '"' + (bloqueado ? '' : ' role="button" tabindex="0"') +
        ' aria-label="' + nombreTorre(t, torre, i) + '">' + s + '</div>';
  }

  /* «¿CÓMO SE JUEGA?» (titular, 2026-09-22: «en el globo explicas la mecánica
     con texto y ejemplo gráfico»). Lo abre la carcasa desde la PORTADA de la
     ronda. Tres casos --encima de una igual, en una torre vacía, encima de otra
     distinta-- y la meta, una torre de cuatro iguales. Son torres de verdad en
     miniatura: mismo marcado, mismo CSS, otro tamaño.
     ⚠️ LAS CAJAS SON DE UN TABLERO DE EJEMPLO, no de la ronda: en la portada el
     de la ronda todavía no existe --en línea la semilla ni siquiera ha llegado
     del servidor, y no debe llegar antes de «Comenzar ronda»--. Semilla fija,
     así el ejemplo es siempre el mismo. */
  var SEMILLA_EJEMPLO = 20260922;
  function comoSeJuega(t) {
    var w = 38, h = Math.round(w / ASPECTO);
    var a = 0, b = t.tipos > 1 ? 1 : 0;
    function mini(tipos) {
      var s = '';
      for (var k = 0; k < tipos.length; k++) {
        s += tipos[k] < 0
          ? '<span class="jg-cn__hueco jg-cn__hueco--siguiente" style="--k:' + k + '">' +
              '<img class="jg-cn__img" src="../assets/img/juegos/canasta-crema.webp" width="256" height="219" alt="" draggable="false"></span>'
          : '<span class="jg-cn__caja" style="--k:' + k + ';z-index:' + (k + 1) + '">' + cajaHTML(t, tipos[k]) + '</span>';
      }
      return '<span class="jg-cn-mini" style="--n:' + tipos.length + '">' + s + '</span>';
    }
    function ejemplo(destino, vale, texto) {
      return '<li class="jg-como__ej">' + mini([a]) +
          '<span class="jg-como__flecha" aria-hidden="true">↓</span>' + mini(destino) +
          '<span class="jg-como__dice jg-como__dice--' + (vale ? 'si' : 'no') + '">' +
            (vale ? '✓ ' : '✗ ') + texto + '</span>' +
        '</li>';
    }
    return '<div class="jg-cn-como" style="--w:' + w + 'px;--h:' + h + 'px;--paso:' + PASO +
        ';--st:' + Math.round(h * ST_LADO) + 'px;--st-y:' + Math.round(h * ST_Y) + 'px">' +
        '<p class="jg-como__txt">Arrastra la <b>caja de arriba</b> de una torre y suéltala en otra; ' +
          'si encima hay <b>varias iguales, van juntas</b> y las coges por cualquiera. Solo caen en dos sitios:</p>' +
        '<ul class="jg-como__ejs" style="--cols:3">' +
          ejemplo([b, a], true, 'Encima de una igual') +
          ejemplo([-1], true, 'En una torre vacía') +
          ejemplo([a, b], false, 'Encima de otra, no') +
        '</ul>' +
        '<div class="jg-como__meta">' + mini([a, a, a, a]) +
          '<p class="jg-como__txt">Gana quien deja <b>cada torre con cuatro cajas iguales</b> en menos movimientos.</p>' +
        '</div>' +
      '</div>';
  }

  J.ui.canastas = {
    msSalida: MS_SALIDA,

    comoSeJuega: function () {
      return comoSeJuega(J.tablero('canastas', SEMILLA_EJEMPLO, 0, 'propone'));
    },

    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      /* Todo el hueco es de las torres: el «¿Cómo se juega?» vive en la
         portada de la ronda. */
      var m = medidas(t, ctx.ancho, ctx.alto);
      var html = '';
      for (var i = 0; i < estado.torres.length; i++) html += torreHTML(t, estado.torres[i], i, ctx.bloqueado);
      caja.innerHTML =
        '<div class="jg-cn" style="' + estiloDe(m, t.cabe) + '">' + html + '</div>';

      if (ctx.bloqueado) return null;

      var tablero = caja.querySelector('.jg-cn');

      function torreEl(i) { return caja.querySelector('[data-torre="' + i + '"]'); }
      /* Las `n` cajas de arriba de la torre `i`, de abajo arriba. */
      function cimasEl(i, n) {
        var el = torreEl(i);
        var l = el ? [].slice.call(el.querySelectorAll('.jg-cn__caja')) : [];
        return n > 0 ? l.slice(Math.max(0, l.length - n)) : [];
      }

      /* Qué torres admiten lo que se lleva `d`, cuál está bajo el dedo y, en
         ésa, CUÁNTOS huecos se van a llenar: si caben todas se encienden
         todas, y si no, solo las que caben --así se ve antes de soltar que
         alguna va a volver--. */
      function marcar(d, diana) {
        var tramo = d >= 0 ? rachaArriba(estado.torres[d]) : 0;
        [].forEach.call(caja.querySelectorAll('.jg-cn__torre'), function (el) {
          var i = Number(el.dataset.torre);
          var ok = d >= 0 && puede(estado.torres, t.cabe, d, i);
          el.classList.toggle('jg-cn__torre--puede', ok);
          el.classList.toggle('jg-cn__torre--diana', ok && i === diana);
          var van = ok && i === diana ? cuantasVan(estado.torres, t.cabe, d, i) : 0;
          var len = estado.torres[i].length;
          [].forEach.call(el.querySelectorAll('.jg-cn__hueco'), function (hu) {
            var k = Number(hu.style.getPropertyValue('--k'));
            hu.classList.toggle('jg-cn__hueco--llega', k >= len && k < len + van);
          });
          /* En la de origen se atenúa el TRAMO que viaja, no solo la de arriba. */
          var cajas = el.querySelectorAll('.jg-cn__caja');
          [].forEach.call(cajas, function (c, k) {
            c.classList.toggle('jg-cn__caja--sale', i === d && k >= cajas.length - tramo);
          });
        });
      }

      function temblar(i) {
        var el = torreEl(i);
        if (!el) return;
        el.classList.remove('jg-cn__torre--no');
        void el.offsetWidth;
        el.classList.add('jg-cn__torre--no');
      }

      function repintarTorre(i) {
        var el = torreEl(i);
        if (!el) return;
        var nuevo = document.createElement('div');
        nuevo.innerHTML = torreHTML(t, estado.torres[i], i, false);
        var n = nuevo.firstChild;
        var eraCompleta = el.classList.contains('jg-cn__torre--completa');
        /* Con teclado la torre tenía el foco: repintarla no puede tirarlo. */
        var conFoco = document.activeElement === el;
        el.replaceWith(n);
        if (conFoco) n.focus();
        /* El pop solo cuando SE COMPLETA, no cada vez que se repinta una que ya
           lo estaba. Va después de que la caja se asiente. */
        if (completa(estado.torres[i], t.cabe) && !eraCompleta) {
          setTimeout(function () {
            if (n.isConnected) n.classList.add('jg-cn__torre--hecha');
          }, MS_CAE - 40);
        }
      }

      /* Cada caja nueva nace donde se soltó (o donde estaba, si fue con
         teclado) y se asienta en su sitio: FLIP, con la pieza de verdad y no una
         copia. Con reloj de CSS: si la pestaña no pinta, el tablero ya está bien. */
      var vueloDesde = null;           // los rects del fantasma, de abajo arriba
      function asentar(els, desde) {
        if (!desde) return;
        els.forEach(function (el, k) {
          var r0 = desde[k];
          if (!el || !r0) return;
          var r1 = el.getBoundingClientRect();
          el.style.setProperty('--dx', Math.round(r0.left - r1.left) + 'px');
          el.style.setProperty('--dy', Math.round(r0.top - r1.top) + 'px');
          /* Quitar y volver a poner: una caja que vuelve dos veces seguidas a
             su torre ya tiene la clase, y sin esto la segunda no se animaría. */
          el.classList.remove('jg-cn__caja--cae');
          void el.offsetWidth;
          el.classList.add('jg-cn__caja--cae');
        });
      }
      function rectsDe(els) { return els.map(function (el) { return el.getBoundingClientRect(); }); }

      /* --- ARRASTRAR ------------------------------------------------------ */
      /* El gesto --dedo o ratón, cuándo empieza, cuándo se suelta y cuándo se
         corta-- lo lleva la pieza común `piezas/arrastre.js`, la misma de
         Calco y Choque. Aquí solo queda lo que es de Canastas: qué se coge, el
         fantasma, la diana y qué pasa al soltar. */

      /* El fantasma lleva el TRAMO entero apilado: se arrastra lo que se va a
         mover, no una caja que miente. */
      function fantasmaEn(d, tramo, x, y) {
        var g = document.createElement('div');
        g.className = 'jg-arrastre jg-cn-fantasma';
        g.setAttribute('style', estiloDe(m, t.cabe));
        var torre = estado.torres[d], s = '';
        for (var k = 0; k < tramo; k++) {
          s += '<span class="jg-cn__caja" style="--k:' + k + ';z-index:' + (k + 1) + '">' +
            cajaHTML(t, torre[torre.length - 1]) + '</span>';
        }
        g.innerHTML = '<span class="jg-cn-mini" style="--n:' + tramo + '">' + s + '</span>';
        document.body.appendChild(g);
        moverFantasma(g, x, y);
        return g;
      }
      function moverFantasma(g, x, y) { g.style.left = x + 'px'; g.style.top = y + 'px'; }
      function torreBajo(x, y) {
        var n = document.elementFromPoint(x, y);
        n = n && n.closest ? n.closest('[data-torre]') : null;
        return n && tablero.contains(n) ? Number(n.dataset.torre) : -1;
      }

      J.arrastre(tablero, {
        nombre: 'canastas',
        /* Se coge el tramo de iguales de arriba, por cualquiera de sus cajas.
           Se guarda POR DÓNDE (`ox`, `oy`): el fantasma se queda bajo el dedo
           en ese mismo punto, lo cojas por la de arriba o por la de abajo. Lo
           que decide la diana sigue siendo el DEDO, no el fantasma. */
        coger: function (objetivo, x, y) {
          var c = objetivo.closest ? objetivo.closest('.jg-cn__caja--coge') : null;
          if (!c || !tablero.contains(c)) return null;
          var d = Number(c.closest('[data-torre]').dataset.torre);
          var tramo = rachaArriba(estado.torres[d]);
          var els = cimasEl(d, tramo);
          if (!els.length) return null;
          var ra = els[0].getBoundingClientRect(), rb = els[els.length - 1].getBoundingClientRect();
          return {
            d: d, tramo: tramo, fantasma: null,
            ox: (Math.min(ra.left, rb.left) + Math.max(ra.right, rb.right)) / 2 - x,
            oy: (Math.min(ra.top, rb.top) + Math.max(ra.bottom, rb.bottom)) / 2 - y
          };
        },
        empezar: function (a, x, y) { a.fantasma = fantasmaEn(a.d, a.tramo, x + a.ox, y + a.oy); },
        mover: function (a, x, y) {
          moverFantasma(a.fantasma, x + a.ox, y + a.oy);
          marcar(a.d, torreBajo(x, y));
        },
        soltar: function (a, x, y) {
          marcar(-1, -1);
          var desde = rectsDe([].slice.call(a.fantasma.querySelectorAll('.jg-cn__caja')));
          a.fantasma.remove();
          var h = torreBajo(x, y);
          if (h >= 0 && puede(estado.torres, t.cabe, a.d, h)) {
            vueloDesde = desde;
            ctx.jugar(a.d * F + h);                 // `actualizar` las asienta
            return;
          }
          /* No cabe ahí --o se soltó fuera--: el tramo vuelve a su torre desde
             donde se soltó, y si había una torre debajo, ésa tiembla. */
          asentar(cimasEl(a.d, a.tramo), desde);
          if (h >= 0 && h !== a.d) temblar(h);
        },
        /* Se cortó sin que el dedo se levantara: vuelve a su torre, y nada
           tiembla porque nadie eligió un destino. */
        cancelar: function (a) {
          marcar(-1, -1);
          if (!a.fantasma) return;
          var desde = rectsDe([].slice.call(a.fantasma.querySelectorAll('.jg-cn__caja')));
          a.fantasma.remove();
          asentar(cimasEl(a.d, a.tramo), desde);
        }
      });

      /* --- EL TECLADO ----------------------------------------------------- */
      var tomada = -1;
      tablero.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var el = e.target.closest('[data-torre]');
        if (!el) return;
        e.preventDefault();
        var i = Number(el.dataset.torre);
        if (tomada < 0) {
          if (!estado.torres[i].length) return;
          tomada = i;
          marcar(i, -1);
          return;
        }
        var d = tomada;
        tomada = -1;
        marcar(-1, -1);
        if (i === d) return;
        if (puede(estado.torres, t.cabe, d, i)) ctx.jugar(d * F + i);
        else temblar(i);
      });

      return function actualizar(est, jugada) {
        var s = window.ATWI.sonido;
        var d = Math.floor(jugada / F), h = jugada % F;
        /* Cuántas llegaron: lo que creció la torre de destino --el DOM todavía
           enseña cómo estaba antes de la jugada--. */
        var torreH = torreEl(h);
        var antesH = torreH ? torreH.querySelectorAll('.jg-cn__caja').length : 0;
        var llegan = est.torres[h].length - antesH;
        var desde = vueloDesde;
        vueloDesde = null;
        /* Con teclado no hubo fantasma: salen de donde estaban. */
        if (!desde) desde = rectsDe(cimasEl(d, llegan));
        var vuelven = Math.max(0, desde.length - llegan);
        repintarTorre(d);
        repintarTorre(h);
        /* Las de arriba del fantasma son las que caben; las de abajo, si
           sobran, vuelven a su torre. */
        asentar(cimasEl(h, llegan), desde.slice(desde.length - llegan));
        if (vuelven) asentar(cimasEl(d, vuelven), desde.slice(0, vuelven));
        if (s && s.hay()) s.clac(completa(est.torres[h], t.cabe) ? 0.9 : 0.5);
      };
    },

    /* La pieza de esta ronda en la pantalla de resultados. Con el dibujo del
       juego y no con el reloj de arena: aquí lo que decide primero son los
       MOVIMIENTOS, y el reloj diría que se compara el tiempo. */
    chocante: function (r) {
      if (!r) return null;
      return {
        icono: '<img class="jg-el__dibujo" src="../assets/img/juegos/juego-canastas.webp" ' +
          'width="92" height="92" alt="" aria-hidden="true" decoding="async">',
        nombre: r.completo
          ? r.movimientos + ' mov. en ' + seg(r.ms)
          : r.completas + ' de ' + r.tipos + ' · ' + seg(r.ms)
      };
    },

    /* Una celda de la tabla del juez. Sin terminar, lo primero es cuántas
       torres quedaron hechas, que es lo primero que compara la marca. */
    resumenCorto: function (r) {
      return r.completo
        ? '✓ ' + r.movimientos + ' mov. en ' + seg(r.ms)
        : r.completas + ' de ' + r.tipos + ' torres · ' + r.movimientos + ' mov.';
    },

    resumenHTML: function (r) {
      return '<div class="jg-datos">' +
        (r.completo ? '' :
          '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-aciertos.webp" width="28" height="28" alt="" decoding="async">' +
            r.completas + ' de ' + r.tipos + ' torres</span>') +
        '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-pasos.webp" width="28" height="28" alt="" decoding="async">' +
          r.movimientos + ' ' + (r.movimientos === 1 ? 'movimiento' : 'movimientos') + '</span>' +
        '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-tiempo.webp" width="28" height="28" alt="" decoding="async">' +
          (Math.round(r.ms / 100) / 10).toFixed(1) + ' s</span>' +
      '</div>';
    }
  };
})();
