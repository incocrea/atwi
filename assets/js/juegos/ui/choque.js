/* ATWI · minijuegos · el tablero de «Choque» (docs/10 §8.1)
   ==========================================================================
   LA SELECCIÓN ES UNA SOLA PANTALLA CON NÚMEROS (titular, 2026-09-21: «en vez
   de seleccionar un elemento, aceptar y luego seleccionar otro, vamos a
   acumularle puntos como turnos asignados: si le doy a un elemento lo marco
   con un 1, al siguiente le agrego un 2 en círculos pequeños, con posibilidad
   de reasignar»). Con todas repartidas se enciende «Confirmar selección».
   Reasignar es libre —eso reemplaza al recibo y a los reintentos— y con esto se
   va también la duda del titular sobre Fuego bloqueado: ya no hay «turno
   pasado» que agote nada, se ve todo el reparto junto.

   Y UN ELEMENTO PUEDE LLEVAR VARIAS RONDAS (titular, el mismo día: «si doy dos
   veces clic en el mismo elemento no se deselecciona, se le acumula otro turno
   si está disponible»). Así que **el toque siempre suma** mientras quede una
   ronda libre; cuando ya no queda ninguna, el toque en uno asignado SUELTA su
   última —ése es el único gesto de quitar, y el renglón de ayuda lo dice en el
   momento en que empieza a valer—. Repetir no es un atajo: tres fuegos ganan
   las tres rondas contra quien no los contrarresta y las pierden todas contra
   quien sí, así que el veredicto dejó de anular el repetido.

   NO HAY CARTA, HAY FIGURA (mockup del titular): la pieza es el dibujo grande
   con su placa debajo y los números flotando encima; el marco blanco se fue.
   Lo que dice si una está puesta es **el color** —las que no llevan ronda van
   en gris— y el tamaño. El círculo sigue A LA VISTA: la que se acaba de tocar
   ilumina con un halo verde a las dos que vence y rojo a las dos que la vencen,
   con la palabra debajo —el color solo no es información—.

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
       faltan —en línea, tras una caída, las ya enviadas no están en esa lista—.
       `asignado[elemento]` es la LISTA de rondas que lleva esa figura. */
    seleccion: function (caja, ctx) {
      var rondas = [];
      for (var r = ctx.desde; r <= ctx.hasta; r++) rondas.push(r);

      caja.innerHTML =
        '<div class="jg-choque">' +
          '<div class="jg-choque__cartas">' +
            m().ELEMENTOS.map(function (_, i) {
              return '<button type="button" class="jg-el jg-el--' + m().ELEMENTOS[i] +
                '" data-el="' + i + '">' +
                '<span class="jg-el__nums" aria-hidden="true"></span>' +
                pieza(i, 80) +
                '<span class="jg-el__nombre">' + nombre(i) + '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
          /* ⚠️ QUIÉN VENCE A QUIÉN VA EN UN GLOBO, NO EN LAS CARTAS (titular,
             2026-09-21). Cada carta llevaba «te gana» / «le ganas» respecto a la
             última tocada, y eso confunde por dos motivos: aquí todavía no se
             juega contra nadie --no hay con qué comparar-- y al asignar varias
             rondas quedan varios indicadores encendidos sin decir de cuál se
             habla. El círculo entero, que es lo que de verdad hay que saber, se
             consulta cuando se quiere. */
          '<p class="jg-pista" id="jg-choque-pista"></p>' +
          '<p class="jg-choque__ayuda">' +
            '<button type="button" class="jg-choque__comovence" data-el-ayuda>' +
              (window.ATWI.icono ? window.ATWI.icono('ayuda-azul', 22) : '') +
              '<span>¿Quién vence a quién?</span>' +
            '</button>' +
          '</p>' +
          '<div class="jg-choque__pie">' +
            '<button type="button" class="boton boton--bloque boton--competencia" data-el-confirmar disabled>' +
              'Confirmar selección</button>' +
          '</div>' +
        '</div>';

      var asignado = Object.create(null);   // elemento -> [rondas]
      /* `ultima` se fue con los rótulos: existía solo para iluminar las cartas
         según la última tocada, que es justo lo que confundía. */

      function suyas(i) { return asignado[i] || []; }
      function libres() {
        var puestos = [];
        Object.keys(asignado).forEach(function (k) { puestos = puestos.concat(asignado[k]); });
        return rondas.filter(function (r) { return puestos.indexOf(r) === -1; });
      }
      function enLetra(ns) {
        return ns.length === 1 ? 'la ronda ' + ns[0]
          : 'las rondas ' + ns.slice(0, -1).join(', ') + ' y ' + ns[ns.length - 1];
      }

      function repinta() {
        var quedan = libres();
        [].forEach.call(caja.querySelectorAll('.jg-el'), function (c) {
          var i = Number(c.dataset.el);
          var mias = suyas(i);
          /* Los números se PINTAN, no se esconden: un `hidden` sobre algo con
             `display` propio no oculta nada (lo enseñó `.micro-prueba`, y el
             círculo vacío que el titular vio en tres figuras era eso mismo). */
          var nums = c.querySelector('.jg-el__nums');
          if (nums) nums.innerHTML = mias.map(function (n) {
            return '<b class="jg-el__num">' + n + '</b>';
          }).join('');
          c.classList.toggle('jg-el--puesto', mias.length > 0);
          c.setAttribute('aria-label', nombre(i) + (mias.length ? ', ' + enLetra(mias) : ', sin asignar'));
        });
        /* LA PISTA DICE QUÉ HACER, y nada más. La frase «X vence a Y y a Z»
           se fue con los rótulos de las cartas: hablaba del último tocado, que
           con varias rondas asignadas no se sabe cuál es. Vive en el globo. */
        var p = caja.querySelector('#jg-choque-pista');
        if (p) {
          p.textContent = quedan.length
            ? 'Toca un elemento para darle la ronda ' + quedan[0] + '. Puedes repetir el mismo.'
            : 'Ya están ' + enLetra(rondas) + '. Toca uno asignado para soltar su última.';
        }
        var b = caja.querySelector('[data-el-confirmar]');
        if (b) b.disabled = quedan.length > 0;
      }

      /* EL CÍRCULO ENTERO, a un toque: los cinco con lo que vencen, en el mismo
         orden en que están en el tablero. Se dice con las FRASES de la lógica
         —«el metal corta la planta»— que es lo que hace el círculo memorable en
         vez de una tabla que hay que estudiar. */
      function comoVence() {
        var els = m().ELEMENTOS;
        var filas = els.map(function (_, i) {
          var gana = els.map(function (__, k) { return k; })
            .filter(function (k) { return m().vence(i, k); });
          return '<li class="jg-vence__f">' +
              pieza(i, 34) +
              '<span class="jg-vence__t"><b>' + esc(nombre(i)) + '</b> vence a ' +
                gana.map(function (k) { return esc(nombre(k)); }).join(' y a ') + '</span>' +
            '</li>';
        }).join('');
        return '<ul class="jg-vence">' + filas + '</ul>' +
          '<p class="chico tenue centrado">Cada uno vence a dos y pierde con los otros dos. ' +
            'Si los dos eligen el mismo, la ronda queda en tablas.</p>';
      }

      caja.addEventListener('click', function (e) {
        var ay = e.target.closest('[data-el-ayuda]');
        if (ay) {
          if (window.ATWI.globo) {
            window.ATWI.globo.abrir(ay, { titulo: '¿Quién vence a quién?' },
              { tinte: 'competencia', etiqueta: 'Quién vence a quién', cuerpo: comoVence() });
          }
          return;
        }
        var c = e.target.closest('[data-el]');
        if (c) {
          var i = Number(c.dataset.el);
          var q = libres();
          if (q.length) asignado[i] = suyas(i).concat(q[0]);
          else if (suyas(i).length) {
            /* Sin rondas libres, el toque en uno asignado suelta su última:
               es el único gesto de quitar, y por eso la pista lo dice. */
            asignado[i] = suyas(i).slice(0, -1);
            if (!asignado[i].length) delete asignado[i];
          }
          repinta();
          return;
        }
        var b = e.target.closest('[data-el-confirmar]');
        if (b && !b.disabled) {
          /* Una jugada por ronda pendiente, EN SU ORDEN: la figura con el 1 es
             la ronda 1, aunque se haya asignado la última. */
          var porRonda = rondas.map(function (r) {
            var cual = -1;
            Object.keys(asignado).forEach(function (k) {
              if (asignado[k].indexOf(r) !== -1) cual = Number(k);
            });
            return cual;
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
