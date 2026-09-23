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
   la torre destino»). Solo la de ARRIBA se puede coger; se suelta sobre
   cualquier punto de la torre de destino --la torre entera es la diana, así no
   hay que apuntar a un hueco de 20 px con el dedo encima--, y se enciende el
   sitio exacto donde caería. Si no cabe ahí, la caja vuelve a su torre y la
   diana tiembla.
   ⚠️ El arrastre NO empieza en `pointerdown` sino al moverse seis píxeles, y
   `touch-action: none` va en el CSS: las dos lecciones de Calco y Choque.
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
    for (var k = 0; k < torre.length; k++) {
      var arriba = k === torre.length - 1;
      s += '<span class="jg-cn__caja' + (arriba && !bloqueado ? ' jg-cn__caja--arriba' : '') + '"' +
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

  J.ui.canastas = {
    msSalida: MS_SALIDA,

    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      /* Todo el hueco es de las torres: debajo ya no va nada. */
      var m = medidas(t, ctx.ancho, ctx.alto);
      var html = '';
      for (var i = 0; i < estado.torres.length; i++) html += torreHTML(t, estado.torres[i], i, ctx.bloqueado);
      caja.innerHTML =
        '<div class="jg-cn" style="' + estiloDe(m, t.cabe) + '">' + html + '</div>';

      if (ctx.bloqueado) return null;

      var tablero = caja.querySelector('.jg-cn');

      function torreEl(i) { return caja.querySelector('[data-torre="' + i + '"]'); }
      function cimaEl(i) {
        var el = torreEl(i);
        var l = el ? el.querySelectorAll('.jg-cn__caja') : [];
        return l.length ? l[l.length - 1] : null;
      }

      /* Qué torres admiten lo que se lleva `d`, y cuál está bajo el dedo. */
      function marcar(d, diana) {
        [].forEach.call(caja.querySelectorAll('.jg-cn__torre'), function (el) {
          var i = Number(el.dataset.torre);
          var ok = d >= 0 && puede(estado.torres, t.cabe, d, i);
          el.classList.toggle('jg-cn__torre--puede', ok);
          el.classList.toggle('jg-cn__torre--diana', ok && i === diana);
          el.classList.toggle('jg-cn__torre--origen', i === d);
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

      /* La caja nueva nace donde se soltó (o donde estaba, si fue con teclado)
         y se asienta en su sitio: FLIP, con la pieza de verdad y no una copia.
         Con reloj de CSS: si la pestaña no pinta, el tablero ya está bien. */
      var vueloDesde = null;
      function asentar(el, desde) {
        if (!el || !desde) return;
        var r1 = el.getBoundingClientRect();
        el.style.setProperty('--dx', Math.round(desde.left - r1.left) + 'px');
        el.style.setProperty('--dy', Math.round(desde.top - r1.top) + 'px');
        /* Quitar y volver a poner: una caja que vuelve dos veces seguidas a su
           torre ya tiene la clase, y sin esto la segunda no se animaría. */
        el.classList.remove('jg-cn__caja--cae');
        void el.offsetWidth;
        el.classList.add('jg-cn__caja--cae');
      }

      /* --- ARRASTRAR ------------------------------------------------------ */
      var UMBRAL = 6;
      var ar = null;            // {d, x0, y0, fantasma}

      function fantasmaEn(d, x, y) {
        var g = document.createElement('div');
        g.className = 'jg-arrastre jg-cn-fantasma';
        g.setAttribute('style', estiloDe(m, t.cabe));
        var torre = estado.torres[d];
        g.innerHTML = '<span class="jg-cn__caja">' + cajaHTML(t, torre[torre.length - 1]) + '</span>';
        document.body.appendChild(g);
        mover(g, x, y);
        return g;
      }
      function mover(g, x, y) { g.style.left = x + 'px'; g.style.top = y + 'px'; }
      function torreBajo(x, y) {
        var n = document.elementFromPoint(x, y);
        n = n && n.closest ? n.closest('[data-torre]') : null;
        return n && tablero.contains(n) ? Number(n.dataset.torre) : -1;
      }

      /* La red contra el arrastre nativo, para lo que venga después. */
      caja.addEventListener('dragstart', function (e) { e.preventDefault(); });

      tablero.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        var c = e.target.closest('.jg-cn__caja--arriba');
        if (!c) return;
        var torre = c.closest('[data-torre]');
        ar = { d: Number(torre.dataset.torre), x0: e.clientX, y0: e.clientY, fantasma: null };
      });

      /* Los oyentes viven en `window` --el dedo se sale del tablero a mitad del
         gesto-- y se quitan SOLOS cuando la pantalla ya no está: así la ronda
         siguiente no hereda los de la anterior. */
      function seFue() {
        if (caja.isConnected) return false;
        window.removeEventListener('pointermove', alMover);
        window.removeEventListener('pointerup', alSoltar);
        window.removeEventListener('pointercancel', alSoltar);
        if (ar && ar.fantasma) ar.fantasma.remove();
        ar = null;
        return true;
      }
      function cancelar() {
        if (ar && ar.fantasma) ar.fantasma.remove();
        ar = null;
        marcar(-1, -1);
      }

      window.addEventListener('pointermove', alMover);
      function alMover(e) {
        if (seFue() || !ar) return;
        /* Si el dedo ya no está apoyado no hay gesto: un `pointerup` se puede
           perder y sin esto quedaría una caja arrastrándose sola. */
        if (!e.buttons) { cancelar(); return; }
        if (!ar.fantasma) {
          if (Math.abs(e.clientX - ar.x0) < UMBRAL && Math.abs(e.clientY - ar.y0) < UMBRAL) return;
          ar.fantasma = fantasmaEn(ar.d, e.clientX, e.clientY);
        }
        mover(ar.fantasma, e.clientX, e.clientY);
        marcar(ar.d, torreBajo(e.clientX, e.clientY));
      }

      window.addEventListener('pointerup', alSoltar);
      window.addEventListener('pointercancel', alSoltar);
      function alSoltar(e) {
        if (seFue() || !ar) return;
        var esto = ar;
        ar = null;
        marcar(-1, -1);
        if (!esto.fantasma) return;               // fue un toque: no hace nada
        var desde = esto.fantasma.getBoundingClientRect();
        esto.fantasma.remove();
        var h = e.type === 'pointercancel' ? -1 : torreBajo(e.clientX, e.clientY);
        if (h >= 0 && puede(estado.torres, t.cabe, esto.d, h)) {
          vueloDesde = desde;
          ctx.jugar(esto.d * F + h);              // `actualizar` la asienta
          return;
        }
        /* No cabe ahí --o se soltó fuera--: la caja vuelve a su torre desde
           donde se soltó, y si había una torre debajo, ésa tiembla. */
        asentar(cimaEl(esto.d), desde);
        if (h >= 0 && h !== esto.d) temblar(h);
      }

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
        /* Con teclado no hubo fantasma: la caja sale de donde estaba. */
        var desde = vueloDesde;
        vueloDesde = null;
        if (!desde) {
          var antes = cimaEl(d);
          desde = antes ? antes.getBoundingClientRect() : null;
        }
        repintarTorre(d);
        repintarTorre(h);
        asentar(cimaEl(h), desde);
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
