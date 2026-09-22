/* ATWI · minijuegos · el tablero de «Frascos»
   ==========================================================================
   La mitad con DOM de `logica/frascos.js`: seis frascos de cristal con los
   stickers apilados dentro, un contador de movimientos y «Reiniciar».

   EL GESTO, que es el del género y el que fija el plan (docs/10 §8.3): TOCAR un
   frasco levanta su sticker de arriba; TOCAR otro lo manda allí, volando. Tocar
   el mismo lo deja caer otra vez. Si el segundo no lo admite --otro sticker
   arriba, o lleno--, la selección pasa a ése: casi siempre es lo que se quería
   hacer a continuación, y un «no» con temblor obligaría a tocar dos veces.
   ⚠️ TOCAR Y NO ARRASTRAR, a diferencia de Calco y Choque: aquí lo que se mide
   son MOVIMIENTOS, y un juego de movimientos se juega a ritmo --dos toques son
   más rápidos que un arrastre y no se equivocan de destino por soltar a medio
   camino--. Todo son `<button>`, así que el teclado y el lector de pantalla
   juegan igual sin nada aparte.

   LOS FRASCOS DONDE PUEDE CAER SE INSINÚAN al levantar uno. No regala
   estrategia --dice qué es legal, no qué conviene-- y ahorra el toque que el
   juego contaría como intento fallido en la cabeza de quien juega.

   LO QUE SE MANDA SON LAS JUGADAS, `desde * 8 + hasta`, y «Reiniciar» es la 64.
   El resultado lo saca el servidor repitiéndolas. */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);
  J.ui = J.ui || Object.create(null);

  var F = 8;               // los mismos de logica/frascos.js
  var REINICIAR = F * F;

  /* Cuánto dura el vuelo de un sticker (la animación `jg-fr-vuela` de
     juegos.css dice el mismo número) y, con el pop del frasco completo, lo que
     la carcasa espera antes de congelar el tablero al acabar: el movimiento que
     CIERRA la ronda es el que más se mira. */
  var MS_VUELO = 280;
  var MS_SALIDA = 520;

  function seg(ms) { return (Math.round((ms || 0) / 100) / 10) + ' s'; }

  function rachaAbajo(f) {
    if (!f.length) return 0;
    var n = 1;
    while (n < f.length && f[n] === f[0]) n++;
    return n;
  }
  function lleno(f, cabe) { return f.length === cabe && rachaAbajo(f) === cabe; }
  function puede(fr, cabe, d, h) {
    if (d === h) return false;
    var a = fr[d], b = fr[h];
    if (!a.length || b.length >= cabe) return false;
    return !b.length || b[b.length - 1] === a[a.length - 1];
  }
  function iguales(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].length !== b[i].length) return false;
      for (var k = 0; k < a[i].length; k++) if (a[i][k] !== b[i][k]) return false;
    }
    return true;
  }

  /* ⚠️ EL TAMAÑO SALE DEL HUECO, Y SE PRUEBAN DOS MAQUETAS: una fila de seis o
     dos filas de tres. Se queda la que deja el sticker más grande. En un
     teléfono gana casi siempre la de dos filas --seis frascos en 330 px dejan
     stickers de 40 px, y el plan dice que por debajo de 44 ya cuesta
     reconocerlos--; en una pantalla ancha y baja, la de una.
     Todo sale de UN número, el lado del sticker (`s`): el frasco es `s` más su
     cristal, y su alto es `cabe` stickers más el hueco de encima donde se
     levanta el de arriba. Como en Cuenta y Calco, lo que cede antes es el aire. */
  function medidas(t, ancho, alto) {
    var n = t.frascos.length;
    var mejor = null;
    [1, 2].forEach(function (filas) {
      var cols = Math.ceil(n / filas);
      var gx = Math.max(8, Math.min(18, Math.floor(ancho * 0.04)));
      var gy = 16;
      /* ancho de un frasco = s * 1.28 (cristal a los dos lados)
         alto de una fila   = s * cabe * 1.06 + s * 0.42 (culo y boca)
                              + s * 0.6 (donde se levanta el de arriba) */
      var porAncho = (ancho - (cols - 1) * gx) / (cols * 1.28);
      var porAlto = (alto - (filas - 1) * gy) / (filas * (t.cabe * 1.06 + 0.42 + 0.6));
      var s = Math.floor(Math.min(porAncho, porAlto, 78));
      if (!mejor || s > mejor.s) mejor = { s: s, cols: cols, gx: gx, gy: gy };
    });
    mejor.s = Math.max(28, mejor.s);
    return mejor;
  }

  function estiloDe(m) {
    var s = m.s;
    return '--s:' + s + 'px;--pad:' + Math.round(s * 0.14) + 'px;--g:' + Math.round(s * 0.06) + 'px;' +
      '--alza:' + Math.round(s * 0.6) + 'px;--cols:' + m.cols + ';--gx:' + m.gx + 'px;--gy:' + m.gy + 'px';
  }

  function nombreFrasco(t, f, i) {
    if (!f.length) return 'Frasco ' + (i + 1) + ', vacío';
    var st = J.stickers;
    return 'Frasco ' + (i + 1) + ': ' + f.map(function (x) { return st.nombre(t.fichas[x]); }).join(', ') +
      ' (arriba: ' + st.nombre(t.fichas[f[f.length - 1]]) + ')';
  }

  function dentroHTML(t, f) {
    var s = '';
    for (var k = 0; k < f.length; k++) s += J.stickers.html(t.fichas[f[k]], 96, 'jg-fr__st');
    return s;
  }

  function frascoHTML(t, f, i, bloqueado) {
    return '<button type="button" class="jg-frasco' + (lleno(f, t.cabe) ? ' jg-frasco--lleno' : '') + '"' +
        ' data-fr="' + i + '"' + (bloqueado ? ' tabindex="-1"' : '') +
        ' aria-label="' + nombreFrasco(t, f, i) + '">' +
        '<span class="jg-frasco__cuerpo">' + dentroHTML(t, f) + '</span>' +
      '</button>';
  }

  function movimientosHTML(n) {
    return '<b>' + n + '</b> ' + (n === 1 ? 'movimiento' : 'movimientos');
  }

  J.ui.frascos = {
    msSalida: MS_SALIDA,

    pintar: function (caja, estado, ctx) {
      var t = estado.tablero;
      /* Debajo de los frascos van la barra (contador y «Reiniciar») y la pista,
         de alto fijo: si la pista cambiara de alto empujaría los frascos. */
      var RESERVA = 44 + 12 + 44 + 12;
      var m = medidas(t, ctx.ancho, ctx.alto - RESERVA);
      var fr = estado.frascos;
      var html = '';
      for (var i = 0; i < fr.length; i++) html += frascoHTML(t, fr[i], i, ctx.bloqueado);
      var intacto = iguales(fr, t.frascos);
      caja.innerHTML =
        '<div class="jg-fr" style="' + estiloDe(m) + '">' + html + '</div>' +
        '<div class="jg-fr-barra">' +
          '<span class="jg-fr-mov"><img class="jg-pieza" src="../assets/img/juegos/jg-pasos.webp" ' +
            'width="26" height="26" alt="" decoding="async">' +
            '<span data-fr-mov>' + movimientosHTML(estado.movimientos) + '</span></span>' +
          '<button type="button" class="boton boton--suave jg-fr-reinicia" data-fr-reinicia' +
            (ctx.bloqueado || intacto ? ' disabled' : '') + '>Reiniciar</button>' +
        '</div>' +
        '<p class="jg-pista jg-pista--fija">Toca un frasco y luego otro para pasar el sticker de arriba. ' +
          '<b>Solo cae sobre un frasco vacío o sobre su mismo sticker.</b></p>';

      if (ctx.bloqueado) return null;

      var elegido = -1;

      function frasco(i) { return caja.querySelector('[data-fr="' + i + '"]'); }
      function cima(i) {
        var c = frasco(i);
        var l = c ? c.querySelectorAll('.jg-fr__st') : [];
        return l.length ? l[l.length - 1] : null;
      }

      /* Levantar el de arriba del elegido e insinuar dónde puede caer. */
      function marcar() {
        var f = estado.frascos;
        [].forEach.call(caja.querySelectorAll('.jg-frasco'), function (b) {
          var i = Number(b.dataset.fr);
          b.classList.toggle('jg-frasco--elegido', i === elegido);
          b.classList.toggle('jg-frasco--puede', elegido >= 0 && puede(f, t.cabe, elegido, i));
          b.setAttribute('aria-pressed', i === elegido ? 'true' : 'false');
        });
        [].forEach.call(caja.querySelectorAll('.jg-fr__st--alzado'), function (n) {
          n.classList.remove('jg-fr__st--alzado');
        });
        if (elegido >= 0) {
          var c = cima(elegido);
          if (c) c.classList.add('jg-fr__st--alzado');
        }
      }

      function repintarFrasco(i) {
        var b = frasco(i);
        if (!b) return;
        var f = estado.frascos[i];
        b.querySelector('.jg-frasco__cuerpo').innerHTML = dentroHTML(t, f);
        b.setAttribute('aria-label', nombreFrasco(t, f, i));
        var eraLleno = b.classList.contains('jg-frasco--lleno');
        var esLleno = lleno(f, t.cabe);
        b.classList.toggle('jg-frasco--lleno', esLleno);
        /* El pop solo cuando SE COMPLETA, no cada vez que se repinta uno que ya
           lo estaba. Va después del vuelo, que es cuando el sticker llega. */
        if (esLleno && !eraLleno) {
          setTimeout(function () {
            if (!b.isConnected) return;
            b.classList.remove('jg-frasco--hecho');
            void b.offsetWidth;
            b.classList.add('jg-frasco--hecho');
          }, MS_VUELO - 40);
        }
      }

      function repintarBarra() {
        var n = caja.querySelector('[data-fr-mov]');
        if (n) n.innerHTML = movimientosHTML(estado.movimientos);
        var r = caja.querySelector('[data-fr-reinicia]');
        if (r) r.disabled = iguales(estado.frascos, t.frascos);
      }

      function tocar(i) {
        var f = estado.frascos;
        if (elegido < 0) {
          if (!f[i].length) return;           // de un vacío no hay nada que levantar
          elegido = i;
          marcar();
          return;
        }
        if (i === elegido) { elegido = -1; marcar(); return; }
        if (puede(f, t.cabe, elegido, i)) {
          var jugada = elegido * F + i;
          elegido = -1;
          ctx.jugar(jugada);                  // `actualizar` hace el vuelo
          return;
        }
        /* No cabe ahí: la selección pasa a ése, si tiene algo que levantar. */
        elegido = f[i].length ? i : -1;
        marcar();
      }

      caja.addEventListener('dragstart', function (e) { e.preventDefault(); });
      caja.addEventListener('click', function (e) {
        if (e.target.closest('[data-fr-reinicia]')) {
          elegido = -1;
          ctx.jugar(REINICIAR);
          return;
        }
        var b = e.target.closest('[data-fr]');
        if (!b) return;
        tocar(Number(b.dataset.fr));
      });

      return function actualizar(est, jugada) {
        var s = window.ATWI.sonido;
        if (jugada === REINICIAR) {
          for (var k = 0; k < est.frascos.length; k++) repintarFrasco(k);
          elegido = -1;
          marcar();
          repintarBarra();
          if (s && s.hay()) s.clac(0.3);
          return;
        }
        var d = Math.floor(jugada / F), h = jugada % F;
        /* EL VUELO ES UN FLIP: se mide dónde estaba el sticker (todavía en su
           frasco, levantado) ANTES de repintar, se repinta, se mide dónde quedó,
           y el nuevo arranca desplazado a la posición vieja y vuelve a su sitio.
           Así lo que vuela es el sticker de verdad y no una copia que hay que
           limpiar después. Con reloj de CSS y sin temporizador que lo pinte: si
           la pestaña no pinta, el tablero ya está bien de todas formas. */
        var antes = cima(d);
        var r0 = antes ? antes.getBoundingClientRect() : null;
        repintarFrasco(d);
        repintarFrasco(h);
        var ahora = cima(h);
        if (r0 && ahora) {
          var r1 = ahora.getBoundingClientRect();
          ahora.style.setProperty('--dx', Math.round(r0.left - r1.left) + 'px');
          ahora.style.setProperty('--dy', Math.round(r0.top - r1.top) + 'px');
          ahora.classList.add('jg-fr__st--vuela');
        }
        marcar();
        repintarBarra();
        if (s && s.hay()) s.clac(lleno(est.frascos[h], t.cabe) ? 0.9 : 0.5);
      };
    },

    /* La pieza de esta ronda en la pantalla de resultados. Con el dibujo del
       juego y no con el reloj de arena: aquí lo que decide primero son los
       MOVIMIENTOS, y el reloj diría que se compara el tiempo. */
    chocante: function (r) {
      if (!r) return null;
      return {
        icono: '<img class="jg-el__dibujo" src="../assets/img/juegos/juego-frascos.webp" ' +
          'width="92" height="92" alt="" aria-hidden="true" decoding="async">',
        nombre: r.completo
          ? r.movimientos + ' mov. en ' + seg(r.ms)
          : r.llenos + ' de ' + r.tipos + ' · ' + seg(r.ms)
      };
    },

    /* Una celda de la tabla del juez. Sin terminar, lo primero es cuántos
       frascos quedaron hechos, que es lo primero que compara la marca. */
    resumenCorto: function (r) {
      return r.completo
        ? '✓ ' + r.movimientos + ' mov. en ' + seg(r.ms)
        : r.llenos + ' de ' + r.tipos + ' frascos · ' + r.movimientos + ' mov.';
    },

    resumenHTML: function (r) {
      return '<div class="jg-datos">' +
        (r.completo ? '' :
          '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-aciertos.webp" width="28" height="28" alt="" decoding="async">' +
            r.llenos + ' de ' + r.tipos + ' frascos</span>') +
        '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-pasos.webp" width="28" height="28" alt="" decoding="async">' +
          r.movimientos + ' ' + (r.movimientos === 1 ? 'movimiento' : 'movimientos') + '</span>' +
        '<span class="jg-dato"><img class="jg-pieza" src="../assets/img/juegos/jg-tiempo.webp" width="28" height="28" alt="" decoding="async">' +
          (Math.round(r.ms / 100) / 10).toFixed(1) + ' s</span>' +
      '</div>';
    }
  };
})();
