/* ATWI · minijuegos · el tablero de «Choque» (docs/10 §8.1)
   ==========================================================================
   Las cinco cartas de elemento, con el círculo A LA VISTA: nadie tiene que
   memorizar la matriz, porque al tocar una carta se iluminan en verde las dos
   a las que vence y en rojo las dos que la vencen. Tocar EXPLORA; lo que juega
   es «Confirmar», y eso es lo único que llega a la lógica.

   Los elementos ya usados en rondas anteriores salen agotados —N elementos
   distintos, uno por ronda— y la pista dice cuántos quedan, como la
   infografía («te quedan 2 por usar»).

   Y EL DUELO DE CARTAS (`duelo`): la escena de la revelación, ronda a ronda,
   ANTES del anuncio —si fuera después, el volteo llegaría con el ganador ya
   dicho y sin suspenso—. Dos cartas boca abajo, se voltean, y la frase del
   cruce dice quién venció. Con temporizadores y no con fotogramas (S29), y
   con `prefers-reduced-motion` sin volteo: las cartas salen ya abiertas. */
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

  function carta(i, op) {
    op = op || {};
    return '<button type="button" class="jg-el jg-el--' + m().ELEMENTOS[i] +
      (op.usado ? ' jg-el--usado' : '') + '" data-el="' + i + '"' +
      (op.usado ? ' disabled' : '') + ' aria-label="' + nombre(i) + '">' +
      pieza(i, 64) +
      '<span class="jg-el__nombre">' + nombre(i) + '</span>' +
      '<span class="jg-el__que" aria-hidden="true"></span>' +
    '</button>';
  }

  J.ui.choque = {
    pintar: function (caja, estado, ctx) {
      /* Lo ya usado por MÍ en rondas anteriores: la carcasa lo trae en
         `ctx.previas` (los resúmenes de mis rondas enviadas). */
      var usados = {};
      (ctx.previas || []).forEach(function (r) {
        if (r && typeof r.elemento === 'number') usados[r.elemento] = true;
      });
      var quedan = 5 - Object.keys(usados).length;

      caja.innerHTML =
        '<div class="jg-choque">' +
          '<div class="jg-choque__cartas">' +
            m().ELEMENTOS.map(function (_, i) { return carta(i, { usado: usados[i] }); }).join('') +
          '</div>' +
          '<p class="jg-pista" id="jg-choque-pista">' +
            (quedan < 5 ? 'Te quedan ' + quedan + ' por usar. ' : '') +
            'Toca un elemento para ver a quién vence.</p>' +
          '<div class="jg-choque__pie">' +
            '<button type="button" class="boton boton--bloque boton--competencia" data-el-confirmar disabled>' +
              'Confirmar elemento</button>' +
          '</div>' +
        '</div>';

      var elegido = -1;

      function ilumina() {
        [].forEach.call(caja.querySelectorAll('.jg-el'), function (c) {
          var i = Number(c.dataset.el);
          c.classList.remove('jg-el--puesto', 'jg-el--gana', 'jg-el--pierde');
          var que = c.querySelector('.jg-el__que');
          if (que) que.textContent = '';
          if (elegido === -1 || c.disabled) return;
          if (i === elegido) c.classList.add('jg-el--puesto');
          else if (m().vence(elegido, i)) { c.classList.add('jg-el--gana'); if (que) que.textContent = 'le ganas'; }
          else if (m().vence(i, elegido)) { c.classList.add('jg-el--pierde'); if (que) que.textContent = 'te gana'; }
        });
        var b = caja.querySelector('[data-el-confirmar]');
        if (b) b.disabled = elegido === -1 || ctx.bloqueado;
        var p = caja.querySelector('#jg-choque-pista');
        if (p && elegido !== -1) {
          p.textContent = nombre(elegido) + ' vence a ' +
            m().ELEMENTOS.map(function (_, i) { return i; })
              .filter(function (i) { return m().vence(elegido, i); }).map(nombre).join(' y a ') +
            '; pierde con los otros dos.';
        }
      }

      if (!ctx.bloqueado) {
        caja.addEventListener('click', function (e) {
          var c = e.target.closest('[data-el]');
          if (c && !c.disabled) {
            /* Tocar EXPLORA (y tocar el puesto lo suelta): la decisión es el botón. */
            var i = Number(c.dataset.el);
            elegido = elegido === i ? -1 : i;
            ilumina();
            return;
          }
          var b = e.target.closest('[data-el-confirmar]');
          if (b && !b.disabled && elegido !== -1) ctx.jugar(elegido);
        });
      }

      return function actualizar() { /* la ronda acaba con la jugada: nada que repintar */ };
    },

    /* La tabla del juez: el nombre del elemento. */
    resumenCorto: function (r) {
      return typeof r.elemento === 'number' && r.elemento >= 0 ? nombre(r.elemento) : '—';
    },

    /* El recibo: la carta elegida, en grande. */
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
      function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      var k = 0;
      var timers = [];
      function luego(f, ms) { timers.push(setTimeout(f, quieto ? 0 : ms)); }

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
