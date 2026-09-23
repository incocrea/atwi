/* ATWI · minijuegos · el tablero de «Choque» (docs/10 §8.1)
   ==========================================================================
   LA SELECCIÓN ES UNA SOLA PANTALLA CON NÚMEROS (titular, 2026-09-21: «en vez
   de seleccionar un elemento, aceptar y luego seleccionar otro, vamos a
   acumularle puntos como turnos asignados: si le doy a un elemento lo marco
   con un 1, al siguiente le agrego un 2 en círculos pequeños, con posibilidad
   de reasignar»). Con todas repartidas se manda con «Siguiente reto» o «Enviar».
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
  /* ⚠️ `draggable="false"` NO ES UN ADORNO: ES LO QUE HACE QUE EL ARRASTRE
     FUNCIONE (titular, 2026-09-21: «si intento arrastrar los elementos me sale
     un prohibido y no los mete en el círculo»). Un `<img>` es arrastrable POR
     DEFECTO, así que al mover el dedo o el ratón el navegador arrancaba SU
     propio arrastre de imagen —el del icono de prohibido— y con él llegaba un
     `pointercancel` que mataba el nuestro a mitad del gesto. El arrastre de
     puntero estaba bien escrito; lo secuestraba el nativo. */
  function pieza(i, px) {
    return '<img class="jg-el__dibujo" src="../assets/img/juegos/el-' + m().ELEMENTOS[i] +
      '.webp" width="' + px + '" height="' + px + '" alt="" decoding="async" draggable="false">';
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

      /* ⚠️ EL BOTÓN VA EN EL PIE DEL MODAL (titular, 2026-09-22: «igual al de
         los otros juegos, para que se entienda como un solo flujo entre juegos
         consecutivos y en la misma posición»). Dentro del cuerpo quedaba en otro
         sitio y con otro tamaño que el «Siguiente reto» del recibo de Cuenta o
         Calco, y al encadenar juegos saltaba de sitio. Lo arma la carcasa
         (`ctx.boton`), así que es literalmente el mismo botón. Sin pie --un
         llamador viejo-- vuelve al cuerpo, como estaba. */
      var textoBoton = ctx.hasta >= (ctx.rondas || ctx.hasta) ? 'Enviar' : 'Siguiente reto';
      function botonHTML() {
        return ctx.boton ? ctx.boton(textoBoton)
          : '<button type="button" class="boton boton--bloque boton--competencia">' + textoBoton + '</button>';
      }
      caja.innerHTML =
        '<div class="jg-choque">' +
          /* LOS TURNOS SON LOS CÍRCULOS DE ARRIBA, y son el ESTADO: lo que hay
             dentro de cada uno se juega en ese orden. */
          '<div class="jg-turnos">' +
            rondas.map(function (r) {
              return '<button type="button" class="jg-turno" data-turno="' + r + '">' +
                  '<span class="jg-turno__hueco"></span>' +
                  '<span class="jg-turno__n">' + r + '</span>' +
                '</button>';
            }).join('') +
          '</div>' +
          '<div class="jg-choque__cartas">' +
            m().ELEMENTOS.map(function (_, i) {
              return '<button type="button" class="jg-el jg-el--' + m().ELEMENTOS[i] +
                '" data-el="' + i + '">' +
                pieza(i, 104) +
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
          /* EL LEMA ES FIJO (titular, 2026-09-22): «¡Arrastra tu elemento a
             jugar!», con selección o sin ella. La instrucción que cambiaba
             según el estado era letra chica que nadie leía, y lo que dice el
             estado ya lo dice el círculo. */
          '<p class="jg-choque__lema">¡Arrastra tu elemento a jugar!</p>' +
          /* «¿CÓMO SE JUEGA?» Y NO «¿QUIÉN VENCE A QUIÉN?» (titular, 2026-09-22):
             el mismo enlace en todos los juegos, que explica la mecánica entera
             --no solo el círculo-- y se encuentra en el mismo sitio. */
          '<p class="jg-choque__ayuda">' +
            '<button type="button" class="jg-choque__comovence jg-comojuega" data-el-ayuda>' +
              (window.ATWI.icono ? window.ATWI.icono('ayuda-azul', 30) : '') +
              '<span>¿Cómo se juega?</span>' +
            '</button>' +
          '</p>' +
          (ctx.pie ? '' : '<div class="jg-choque__pie">' + botonHTML() + '</div>') +
        '</div>';

      /* EL ESTADO ES EL DE LOS CÍRCULOS: `puesto[ronda] = elemento` o nulo.
         Los cinco de abajo son una PALETA —siempre a color, siempre
         disponibles— y por eso repetir sale gratis: el mismo elemento se
         arrastra a dos turnos. */
      var puesto = Object.create(null);
      rondas.forEach(function (r) { puesto[r] = -1; });

      function libres() { return rondas.filter(function (r) { return puesto[r] < 0; }); }

      function repinta() {
        [].forEach.call(caja.querySelectorAll('.jg-turno'), function (c) {
          var r = Number(c.dataset.turno), e = puesto[r];
          var hueco = c.querySelector('.jg-turno__hueco');
          /* Se PINTA, no se esconde: un `hidden` sobre algo con `display` propio
             no oculta nada —lo enseñó `.micro-prueba`, y los círculos vacíos que
             el titular vio sobre tres figuras eran exactamente eso—. */
          if (hueco) hueco.innerHTML = e < 0 ? '' : pieza(e, 128);
          c.classList.toggle('jg-turno--lleno', e >= 0);
          if (e >= 0) c.dataset.el = String(e); else delete c.dataset.el;
          c.setAttribute('aria-label', 'Turno ' + r + (e < 0 ? ', vacío' : ': ' + nombre(e) + '. Tócalo para vaciarlo.'));
        });
      }

      /* --- ARRASTRAR (titular, 2026-09-21: «el jugador arrastra el elemento al
         círculo del turno en que quiere que se juegue»). Con eventos de puntero,
         que valen igual para el dedo y para el ratón.
         ⚠️ El arrastre NO empieza en `pointerdown` sino al MOVERSE seis píxeles:
         así un toque sigue siendo un toque —y con él siguen vivos el teclado y
         el lector de pantalla, que no saben arrastrar—. Lo que impide que el
         dedo scrollee en vez de arrastrar es `touch-action: none` en el CSS, no
         un `preventDefault` que se comería el toque. */
      var UMBRAL = 6;
      var ar = null;        // {el, desde, x0, y0, fantasma}
      var comerClic = false;

      function fantasmaEn(i, x, y) {
        var g = document.createElement('div');
        g.className = 'jg-arrastre';
        g.innerHTML = pieza(i, 96);
        document.body.appendChild(g);
        mover(g, x, y);
        return g;
      }
      function mover(g, x, y) { g.style.left = x + 'px'; g.style.top = y + 'px'; }
      function turnoBajo(x, y) {
        var n = document.elementFromPoint(x, y);
        return n && n.closest ? n.closest('[data-turno]') : null;
      }
      function marcarDiana(t) {
        [].forEach.call(caja.querySelectorAll('.jg-turno'), function (c) {
          c.classList.toggle('jg-turno--diana', c === t);
        });
      }

      /* Y LA RED: cualquier arrastre nativo que se cuele se corta aquí. El
         `draggable="false"` de las piezas es lo que lo evita; esto cubre lo que
         venga después —un fondo, un nombre seleccionable— sin tener que
         acordarse de marcarlo pieza por pieza. */
      caja.addEventListener('dragstart', function (e) { e.preventDefault(); });

      caja.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        /* ⚠️ El candado que se traga el clic de después de un arrastre se suelta
           aquí, al empezar el gesto siguiente: en táctil no SIEMPRE llega ese
           clic, y si el candado se quedara puesto se comería el toque de más
           tarde —medido: el toque siguiente a un arrastre no hacía nada—. */
        comerClic = false;
        var n = e.target.closest('[data-el]');
        if (!n) return;
        /* De un círculo solo se arrastra si tiene algo dentro. */
        ar = { el: Number(n.dataset.el), desde: n.dataset.turno ? Number(n.dataset.turno) : -1,
               x0: e.clientX, y0: e.clientY, fantasma: null };
      });

      /* Los oyentes viven en `window` porque el dedo se sale de la caja a mitad
         del gesto, y SE QUITAN SOLOS cuando la pantalla se fue: `caja` ya no
         está en el documento, así que la siguiente ronda no hereda los de la
         anterior. Se limpia aquí y no desde la carcasa para que el juego no
         necesite que nadie le avise de que lo cerraron. */
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
        /* ⚠️ SI EL DEDO YA NO ESTÁ APOYADO, NO HAY GESTO. Un `pointerup` se
           puede perder —lo enseñó el probador del navegador, que emite el
           `down` y el `move` y no el `up`— y sin esto el puntero quedaría
           arrastrando un elemento sin que nadie lo esté tocando. */
        if (!e.buttons) { if (ar.fantasma) ar.fantasma.remove(); ar = null; marcarDiana(null); return; }
        if (!ar.fantasma) {
          if (Math.abs(e.clientX - ar.x0) < UMBRAL && Math.abs(e.clientY - ar.y0) < UMBRAL) return;
          ar.fantasma = fantasmaEn(ar.el, e.clientX, e.clientY);
          if (ar.desde >= 0) { puesto[ar.desde] = -1; repinta(); }
        }
        mover(ar.fantasma, e.clientX, e.clientY);
        marcarDiana(turnoBajo(e.clientX, e.clientY));
      }

      window.addEventListener('pointerup', alSoltar);
      window.addEventListener('pointercancel', alSoltar);
      function alSoltar(e) {
        if (seFue() || !ar) return;
        var esto = ar; ar = null;
        if (!esto.fantasma) return;                 // fue un toque, lo atiende `click`
        esto.fantasma.remove();
        marcarDiana(null);
        comerClic = true;
        var t = turnoBajo(e.clientX, e.clientY);
        if (t) puesto[Number(t.dataset.turno)] = esto.el;
        /* Soltar fuera de un círculo viniendo de uno lo deja vacío: ése es el
           gesto de quitar, y es el mismo que ya hizo al levantarlo. */
        repinta();
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
          /* «Fuego: vence Metal y Planta» (titular, 2026-09-21): dos puntos tras
             el nombre y SIN la «a» delante de cada uno. Son cinco renglones que
             se leen en columna y no una frase suelta: el «vence a … y a …»
             sonaba bien de uno en uno y en lista es una preposición repetida
             diez veces que hay que saltarse para llegar a los nombres. */
          return '<li class="jg-vence__f">' +
              pieza(i, 34) +
              '<span class="jg-vence__t"><b>' + esc(nombre(i)) + ':</b> vence ' +
                gana.map(function (k) { return esc(nombre(k)); }).join(' y ') + '</span>' +
            '</li>';
        }).join('');
        return '<p class="jg-como__txt">Arrastra un elemento a cada círculo: es lo que juegas en esa ronda. ' +
            'La ganas si tu elemento <b>vence</b> al del otro.</p>' +
          '<ul class="jg-vence">' + filas + '</ul>' +
          '<p class="chico tenue centrado">Cada uno vence a dos y pierde con los otros dos. ' +
            'Si los dos eligen el mismo, la ronda queda en tablas.</p>';
      }

      caja.addEventListener('click', function (e) {
        /* El clic que cierra un arrastre no es un toque: se come. */
        if (comerClic) { comerClic = false; return; }
        var ay = e.target.closest('[data-el-ayuda]');
        if (ay) {
          if (window.ATWI.globo) {
            window.ATWI.globo.abrir(ay, { titulo: '¿Cómo se juega?' },
              { tinte: 'competencia', etiqueta: 'Cómo se juega', cuerpo: comoVence() });
          }
          return;
        }
        /* TOCAR SIGUE VALIENDO, y no es un atajo de más: es el único camino con
           teclado o lector de pantalla, que no saben arrastrar. Un elemento se
           va al primer turno vacío; un círculo con algo dentro se vacía. */
        var t = e.target.closest('[data-turno]');
        if (t) {
          puesto[Number(t.dataset.turno)] = -1;
          repinta();
          return;
        }
        var c = e.target.closest('[data-el]');
        if (c) {
          var q = libres();
          if (q.length) puesto[q[0]] = Number(c.dataset.el);
          repinta();
          return;
        }
      });

      function confirmar() {
        /* Una jugada por ronda pendiente, EN SU ORDEN: lo que haya en el
           círculo 1 se juega primero. */
        var porRonda = rondas.map(function (r) { return puesto[r]; });
        if (porRonda.indexOf(-1) !== -1) {
          if (window.ATWI.aviso) window.ATWI.aviso(rondas.length === 1
            ? 'Arrastra un elemento al círculo primero.'
            : 'Falta poner un elemento en cada círculo.');
          [].forEach.call(caja.querySelectorAll('.jg-turno:not(.jg-turno--lleno)'), function (c) {
            c.classList.add('jg-turno--diana');
            setTimeout(function () { c.classList.remove('jg-turno--diana'); }, 700);
          });
          return;
        }
        ctx.confirmar(porRonda);
      }
      if (ctx.pie) ctx.pie.innerHTML = botonHTML();
      var elBoton = ctx.pie ? ctx.pie.querySelector('button') : caja.querySelector('.jg-choque__pie button');
      if (elBoton) elBoton.addEventListener('click', confirmar);

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

    /* LO QUE ESTE JUEGO ENSEÑA EN LA REVELACIÓN (contrato de `juegos/duelo.js`,
       pivote del titular, 2026-09-22). La escena era de Choque y ahora es de
       todos: aquí queda solo lo que es suyo --qué elemento jugó-- y el vuelo, el
       choque, el apagado del que pierde y el botón viven en un sitio. */
    chocante: function (r) {
      if (!r || typeof r.elemento !== 'number') return null;
      return { icono: pieza(r.elemento, 62), nombre: nombre(r.elemento) };
    }
  };
})();
