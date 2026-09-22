/* ATWI · minijuegos · el tablero de «Choque» (docs/10 §8.1)
   ==========================================================================
   LA SELECCIÓN ES UNA SOLA PANTALLA CON NÚMEROS (titular, 2026-09-21: «en vez
   de seleccionar un elemento, aceptar y luego seleccionar otro, vamos a
   acumularle puntos como turnos asignados: si le doy a un elemento lo marco
   con un 1, al siguiente le agrego un 2 en círculos pequeños, con posibilidad
   de reasignar»). Cada toque asigna la siguiente ronda libre; tocar una carta
   ya marcada la libera; y con todas repartidas se enciende «Confirmar
   selección». Reasignar es libre —eso reemplaza al recibo y a los
   reintentos— y con esto se va también la duda del titular sobre Fuego
   bloqueado: ya no hay «turno pasado» que agote nada, se ve todo el reparto
   junto.

   El círculo sigue A LA VISTA: la carta que se acaba de tocar ilumina en
   verde a las dos que vence y en rojo a las dos que la vencen, con la palabra
   al lado —el color solo no es información—.

   Y EL DUELO DE CARTAS (`duelo`): la escena de la revelación, ronda a ronda,
   ANTES del anuncio —si fuera después, el volteo llegaría con el ganador ya
   dicho y sin suspenso—. Dos cartas boca abajo, se voltean, y la frase del
   cruce dice quién venció. Con temporizadores y no con fotogramas (S29). */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);
  J.ui = J.ui || Object.create(null);

  var NOMBRES = { fuego: 'Fuego', metal: 'Metal', planta: 'Planta', rayo: 'Rayo', agua: 'Agua' };
  function m() { return J.juego('choque'); }
  function nombre(i) { return NOMBRES[m().ELEMENTOS[i]] || '?'; }
  function pieza(i, px) {
    return '<img class="jg-el__dibujo" src="../assets/img/juegos/el-' + m().ELEMENTOS[i] +
      '.webp" width="' + px + '" height="' + px + '" alt="" decoding="async">';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  J.ui.choque = {
    /* ------------------------------------------------------------------------
       LA ASIGNACIÓN (`deUnaVez`): `ctx.desde..ctx.hasta` son las rondas que
       faltan; `ctx.previas` lo ya enviado (en línea, tras una caída), que
       sale agotado. `asignado[elemento] = ronda`. */
    seleccion: function (caja, ctx) {
      var usados = {};
      (ctx.previas || []).forEach(function (r) {
        if (r && typeof r.elemento === 'number') usados[r.elemento] = true;
      });
      var rondas = [];
      for (var r = ctx.desde; r <= ctx.hasta; r++) rondas.push(r);

      caja.innerHTML =
        '<div class="jg-choque">' +
          '<div class="jg-choque__cartas">' +
            m().ELEMENTOS.map(function (_, i) {
              return '<button type="button" class="jg-el jg-el--' + m().ELEMENTOS[i] +
                (usados[i] ? ' jg-el--usado' : '') + '" data-el="' + i + '"' +
                (usados[i] ? ' disabled' : '') + ' aria-label="' + nombre(i) + '">' +
                '<span class="jg-el__num" hidden></span>' +
                pieza(i, 64) +
                '<span class="jg-el__nombre">' + nombre(i) + '</span>' +
                '<span class="jg-el__que" aria-hidden="true"></span>' +
              '</button>';
            }).join('') +
          '</div>' +
          '<p class="jg-pista" id="jg-choque-pista"></p>' +
          '<div class="jg-choque__pie">' +
            '<button type="button" class="boton boton--bloque boton--competencia" data-el-confirmar disabled>' +
              'Confirmar selección</button>' +
          '</div>' +
        '</div>';

      var asignado = {};        // elemento -> ronda
      var ultima = -1;          // la última carta tocada, para la iluminación

      function libres() {
        var puestos = Object.keys(asignado).map(function (k) { return asignado[k]; });
        return rondas.filter(function (r) { return puestos.indexOf(r) === -1; });
      }

      function repinta() {
        var quedan = libres();
        [].forEach.call(caja.querySelectorAll('.jg-el'), function (c) {
          var i = Number(c.dataset.el);
          var num = c.querySelector('.jg-el__num');
          if (num) {
            num.hidden = asignado[i] == null;
            num.textContent = asignado[i] != null ? asignado[i] : '';
          }
          c.classList.toggle('jg-el--puesto', asignado[i] != null);
          c.classList.remove('jg-el--gana', 'jg-el--pierde');
          var que = c.querySelector('.jg-el__que');
          if (que) que.textContent = '';
          if (ultima !== -1 && i !== ultima && !c.disabled) {
            if (m().vence(ultima, i)) { c.classList.add('jg-el--gana'); if (que) que.textContent = 'le ganas'; }
            else if (m().vence(i, ultima)) { c.classList.add('jg-el--pierde'); if (que) que.textContent = 'te gana'; }
          }
        });
        var p = caja.querySelector('#jg-choque-pista');
        if (p) {
          p.textContent = ultima !== -1
            ? nombre(ultima) + ' vence a ' +
              m().ELEMENTOS.map(function (_, i) { return i; })
                .filter(function (i) { return m().vence(ultima, i); }).map(nombre).join(' y a ') +
              '; pierde con los otros dos.' +
              (quedan.length ? ' Falta asignar ' + (quedan.length === 1 ? 'la ronda ' + quedan[0] : quedan.length + ' rondas') + '.' : '')
            : 'Toca un elemento para darle la ronda ' + (quedan[0] || '') +
              '; tócalo otra vez para soltarla.';
        }
        var b = caja.querySelector('[data-el-confirmar]');
        if (b) b.disabled = quedan.length > 0;
      }

      caja.addEventListener('click', function (e) {
        var c = e.target.closest('[data-el]');
        if (c && !c.disabled) {
          var i = Number(c.dataset.el);
          ultima = i;
          if (asignado[i] != null) {
            /* Tocar una marcada la libera: reasignar es quitar y volver a poner. */
            delete asignado[i];
          } else {
            var q = libres();
            if (q.length) asignado[i] = q[0];
          }
          repinta();
          return;
        }
        var b = e.target.closest('[data-el-confirmar]');
        if (b && !b.disabled) {
          /* Una jugada por ronda pendiente, EN SU ORDEN: la carta con el 1 es
             la ronda 1, aunque se haya asignado la última. */
          var porRonda = rondas.map(function (r) {
            for (var k in asignado) if (asignado[k] === r) return Number(k);
            return -1;
          });
          if (porRonda.indexOf(-1) !== -1) return;
          ctx.confirmar(porRonda);
        }
      });

      repinta();
    },

    /* La tabla del juez: el nombre del elemento. */
    resumenCorto: function (r) {
      return typeof r.elemento === 'number' && r.elemento >= 0 ? nombre(r.elemento) : '—';
    },

    /* El recibo genérico no se usa con `deUnaVez`, pero la espera en línea y
       las herramientas lo pueden pedir: la carta elegida. */
    resumenHTML: function (r) {
      if (typeof r.elemento !== 'number' || r.elemento < 0) return '<div class="jg-datos"><span class="jg-dato">Sin elemento</span></div>';
      return '<div class="jg-choque__elegida">' + pieza(r.elemento, 72) +
        '<span class="jg-el__nombre">' + nombre(r.elemento) + '</span></div>';
    },

    /* ------------------------------------------------------------------------
       EL DUELO: `filas` es el desglose del veredicto ({propone, invitado,
       gana, frase}), `personas` los dos con nombre y lado, `fin` lo que sigue
       (la revelación). Cada ronda: las dos cartas boca abajo entran, se
       voltean, la frase del cruce, y a la siguiente. Todo con reloj. */
    duelo: function (caja, filas, personas, fin) {
      var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var quien = { propone: personas[0], invitado: personas[1] };

      function cartaDuelo(res, lado) {
        var dentro = res && typeof res.elemento === 'number'
          ? pieza(res.elemento, 56) + '<span class="jg-el__nombre">' + nombre(res.elemento) + '</span>'
          : '<span class="jg-el__nombre">No jugó</span>';
        return '<div class="jg-duelo__lado">' +
          '<span class="jg-duelo__quien">' + window.ATWI.fichaHTML(quien[lado].avatar, 'avatar--mini', quien[lado].color) +
            esc(quien[lado].nombre) + '</span>' +
          '<div class="jg-carta' + (quieto ? ' jg-carta--abierta' : '') + '" data-lado="' + lado + '">' +
            '<div class="jg-carta__cara jg-carta__cara--dorso">' +
              '<img src="../assets/img/juegos/carta-reverso.webp" alt="" decoding="async">' +
            '</div>' +
            '<div class="jg-carta__cara jg-carta__cara--frente">' + dentro + '</div>' +
          '</div>' +
        '</div>';
      }

      var k = 0;
      var timers = [];
      /* CON REDUCED MOTION SE VA EL VOLTEO, NO EL TIEMPO DE LEER: las cartas
         salen ya abiertas y cada ronda se queda su ratito. Colapsarlo a cero
         convertía la escena en un parpadeo. */
      function luego(f, ms) { timers.push(setTimeout(f, quieto ? Math.min(ms, 1500) : ms)); }

      function ronda() {
        if (k >= filas.length) {
          luego(function () { timers.forEach(clearTimeout); fin(); }, 700);
          return;
        }
        var f = filas[k];
        var dice = f.gana === 'empate'
          ? (f.propone && f.invitado ? 'Mismo elemento: la ronda queda en tablas.' : 'Ronda sin jugar.')
          : (f.frase ? f.frase + '.' : 'Ronda para ' + esc(quien[f.gana].nombre) + '.');
        caja.innerHTML =
          '<div class="sala sala--centrada jg jg--duelo">' +
            '<p class="jg-ficha-ronda__t">Ronda ' + f.ronda + '</p>' +
            '<div class="jg-duelo">' + cartaDuelo(f.propone, 'propone') +
              '<span class="jg-duelo__vs">VS</span>' + cartaDuelo(f.invitado, 'invitado') + '</div>' +
            '<p class="jg-duelo__frase" id="jg-duelo-frase" aria-live="polite"></p>' +
          '</div>';
        /* El volteo: primero uno, después el otro, después la frase. El estado
           inicial tiene que estar calculado antes de girar (offsetHeight). */
        var cartas = caja.querySelectorAll('.jg-carta');
        void caja.offsetHeight;
        var s = window.ATWI.sonido;
        luego(function () { if (cartas[0]) cartas[0].classList.add('jg-carta--abierta'); if (s && s.hay()) s.clac(0.6); }, 700);
        luego(function () { if (cartas[1]) cartas[1].classList.add('jg-carta--abierta'); if (s && s.hay()) s.clac(0.8); }, 1500);
        luego(function () {
          var p = caja.querySelector('#jg-duelo-frase');
          if (p) p.textContent = dice;
          if (s && s.hay()) { if (f.gana === 'empate') s.clac(0.4); else s.choque(); }
        }, 2300);
        k++;
        luego(ronda, 3900);
      }
      ronda();
      /* Por si la sala se cierra a mitad: quien nos montó puede pararlo. */
      return function parar() { timers.forEach(clearTimeout); };
    }
  };
})();
