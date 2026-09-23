/* ATWI · minijuegos · piezas · el ARRASTRE, común a todos los juegos
   ==========================================================================
   Una sola pieza para coger algo con el dedo o con el ratón, llevarlo y
   soltarlo. La usan Choque, Calco y Canastas; el juego que venga después
   también.

   POR QUÉ UNA PIEZA COMÚN (titular, 2026-09-22: «también ocurre en Calco…
   los elementos se sueltan durante el drag con touch mientras se desplazan por
   otras zonas de drop; el drop solo debe contar si suelto el touch, nunca
   soltarse solos»). Cada juego traía SU arrastre, escrito a mano, y los tres
   tenían los mismos agujeros --uno se arreglaba en Canastas y seguía abierto en
   Calco y en Choque--. La auditoría que lo destapó está en `docs/10` §5.5.
   Los agujeros, para que no vuelvan:

   1 · UN `pointercancel` SE TRATABA COMO SI SE HUBIERA SOLTADO. Con eventos
       de puntero el gesto del dedo es del navegador hasta que demuestra lo
       contrario: una pulsación larga, un menú, una selección de texto, un
       gesto del sistema… y el navegador manda `pointercancel`, casi siempre
       con las coordenadas en (0, 0). El código lo atendía como un soltar AHÍ:
       en Choque, un elemento cogido de un círculo se perdía.
   2 · `e.buttons === 0` MATABA EL GESTO CON CUALQUIER PUNTERO. Es una red para
       el `pointerup` perdido del RATÓN; con el dedo esa cuenta no es fiable en
       todos los navegadores.
   3 · NADA LE QUITABA EL GESTO AL NAVEGADOR. `touch-action: none` en el CSS
       evita que la pantalla se desplace, pero no la pulsación larga (menú,
       vibración, selección), ni los navegadores que no lo cumplen entero.

   LO QUE HACE ESTA PIEZA:
   · CON EL DEDO, EVENTOS TÁCTILES y no de puntero, con `preventDefault` en
     `touchstart` sobre lo que se puede coger: desde el primer instante no hay
     desplazamiento, ni pulsación larga, ni selección, ni zum, ni arrastre
     nativo de la imagen. El gesto es del juego hasta que el dedo se levanta.
   · LOS EVENTOS DEL DEDO SE ESCUCHAN EN EL ELEMENTO QUE SE TOCÓ, no en el
     documento: un toque se entrega SIEMPRE a su elemento de origen, también si
     el juego lo quita del DOM a mitad del gesto --Choque vacía el círculo del
     que sale el elemento--. Escuchando en el documento, esos eventos se
     perdían y el arrastre quedaba colgado.
   · SOLO SE SUELTA AL LEVANTAR EL DEDO QUE COGIÓ LA PIEZA (`touchend` de ese
     `identifier`) o el botón (`pointerup`). Otro contacto --la palma o la base
     del pulgar que rozan la pantalla al estirar la mano hacia arriba-- no
     empieza nada ni suelta nada (lo reproduce `tools/simular_arrastre.js
     --gesto palma --viejo 36cf6cb`).
   · Y SI ESE DEDO «SE LEVANTA» PERO HAY OTRO CONTACTO CERCA, o aparece uno en
     un instante, ES EL MISMO DEDO que la pantalla perdió y volvió a ver con
     otro número: el arrastre sigue con él. Era la causa de verdad en el
     teléfono del titular (ver `relevar`).
   · Un `touchcancel` del SISTEMA no es soltar: la pieza SE QUEDA EN LA MANO y
     el siguiente toque la retoma (ver `quedarEnMano`). Un `pointercancel` del
     ratón la devuelve a su sitio (`cancelar`).
   · Y SI ALGO CORTA EL GESTO, QUEDA ANOTADO en la Bitácora (`arrastre_cortado`)
     con el navegador y el evento: es la parte de la auditoría que desde aquí no
     se puede hacer, porque el teléfono es el de quien juega.

   ⚠️ El `preventDefault` en `touchstart` se come el `click` de ese toque, así
   que los TOQUES sobre lo que se puede coger los atiende esta pieza (`tocar`)
   y no el `click` del juego. `reciente()` le dice al `click` del juego que ese
   toque ya se atendió, por si algún navegador lo manda igual.
   ⚠️ Con RATÓN (o lápiz) sigue por eventos de puntero, que ahí no fallan.

   USO
     J.arrastre(caja, {
       nombre:   'calco',                       // para la Bitácora
       coger:    function (objetivo, x, y) {…}, // datos, o null si ahí no se coge nada
       empezar:  function (datos, x, y) {…},    // pasó el umbral: pinta el fantasma
       mover:    function (datos, x, y) {…},
       soltar:   function (datos, x, y) {…},    // SOLO al levantar el dedo o el botón
       cancelar: function (datos) {…},          // se cortó: lo cogido vuelve a su sitio
       tocar:    function (datos, objetivo) {…} // un toque sin mover (solo con el dedo)
     }) → { reciente: function () → bool }
   Los oyentes se quitan SOLOS cuando `caja` ya no está en el documento. */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);

  var UMBRAL = 6;                 // lo que hay que mover para que deje de ser un toque
  var HAY_TOQUE = 'ontouchstart' in window;

  /* La Bitácora: una anotación por gesto cortado, con tope propio para no
     inundarla (la base ya topa en veinte por minuto y persona). */
  var anotadas = 0;
  function anotarCorte(nombre, via, motivo, g, extra, suceso) {
    try {
      if (window.console) console.warn('[arrastre] ' + nombre + ': ' + motivo, extra || '');
      var nube = window.ATWI.nube;
      if (!nube || !nube.anotar || anotadas >= 5) return;
      anotadas++;
      var datos = {
        juego: nombre, via: via, motivo: motivo,
        empezado: !!(g && g.empezado),
        otros_toques: g ? g.otros || 0 : 0,
        version: (window.ATWI.config && window.ATWI.config.version) || '',
        ms: g ? Math.round(performance.now() - g.t0) : null,
        navegador: String(navigator.userAgent || '').slice(0, 240),
        toque: HAY_TOQUE, puntos: navigator.maxTouchPoints || 0
      };
      if (extra) for (var k in extra) datos[k] = extra[k];
      nube.anotar(suceso || 'arrastre_cortado', { nivel: suceso ? 'nota' : 'aviso', detalle: nombre + ': ' + motivo, datos: datos });
    } catch (e) { /* anotar nunca puede romper el juego */ }
  }

  J.arrastre = function (caja, o) {
    var g = null;               // {datos, x0, y0, empezado, via, id, objetivo, t0}
    var ultimoFin = 0;
    var nombre = o.nombre || 'juego';
    /* ⚠️ UNO SOLO POR CAJA. Calco y Choque montan el arrastre sobre la caja que
       les da la carcasa, y esa caja SOBREVIVE a un repintado del tablero: sin
       esto, el arrastre de la pintada anterior seguiría escuchando en ella con
       el estado viejo, y un mismo dedo movería dos cosas. El nuevo apaga al
       anterior. */
    if (caja.__arrastre) caja.__arrastre.apagar();

    function fin() { ultimoFin = performance.now(); }
    function seFue() {
      if (caja.isConnected) return false;
      soltarLaMano(false);
      quitarGlobales();
      quitarOtros();
      if (g && g.pendiente) clearTimeout(g.pendiente.reloj);
      if (g && g.objetivo) quitarDelObjetivo(g.objetivo);
      if (g && g.empezado && o.cancelar) { try { o.cancelar(g.datos); } catch (e) {} }
      g = null;
      return true;
    }

    function arrancar(objetivo, x, y, via, id) {
      var datos = o.coger(objetivo, x, y);
      if (datos === null || datos === undefined) return false;
      g = { datos: datos, x0: x, y0: y, empezado: false, via: via, id: id, objetivo: null, t0: performance.now(),
            ux: x, uy: y, otros: 0, relevos: 0, pendiente: null };
      return true;
    }
    function moverA(x, y) {
      g.ux = x; g.uy = y;
      if (!g.empezado) {
        if (Math.abs(x - g.x0) < UMBRAL && Math.abs(y - g.y0) < UMBRAL) return;
        g.empezado = true;
        o.empezar(g.datos, x, y);
      }
      o.mover(g.datos, x, y);
    }
    /* Terminar de verdad: el dedo o el botón se levantaron. */
    /* ⚠️ `fin()` SOLO cuando de verdad hubo gesto: un arrastre, o un toque del
       dedo que se atendió aquí. Un clic de ratón sin mover no pasa por aquí y
       tiene que llegarle entero al `click` del juego. */
    function terminar(x, y, objetivo) {
      var esto = g; g = null;
      /* Un arrastre que llegó bien a pesar de otro contacto por el camino (la
         palma): se anota como nota, porque es justo lo que el código anterior
         convertía en soltar donde no era y sirve para comprobarlo en el
         teléfono de quien juega. */
      if (esto.empezado && esto.relevos) {
        anotarCorte(nombre, esto.via, 'el dedo se volvió a detectar ' + esto.relevos + ' vez(es)', esto,
          { relevos: esto.relevos, como: esto.comoRelevo, tras_ms: esto.trasMs }, 'arrastre_relevo');
      } else if (esto.empezado && esto.otros) {
        anotarCorte(nombre, esto.via, 'otro contacto durante el arrastre', esto, null, 'arrastre_segundo_toque');
      }
      if (esto.empezado) { fin(); o.soltar(esto.datos, x, y); }
      else if (esto.via === 'toque' && o.tocar) { fin(); o.tocar(esto.datos, objetivo); }
    }
    /* Cortado desde fuera: NUNCA es soltar. */
    function cortar(motivo, extra) {
      quitarOtros();
      var esto = g; g = null;
      if (!esto.empezado) return;
      anotarCorte(nombre, esto.via, motivo, esto, extra);
      /* Con el dedo, si quien corta es el SISTEMA, la pieza SE QUEDA EN LA
         MANO (abajo). Lo demás --el ratón, la pestaña que se oculta-- la
         devuelve a su sitio. */
      if (esto.via === 'toque' && motivo === 'touchcancel') { quedarEnMano(esto); return; }
      fin();
      if (o.cancelar) o.cancelar(esto.datos);
    }

    /* ⚠️ LA PIEZA SE QUEDA EN LA MANO (titular, 2026-09-22: «el drop solo debe
       contar si suelto el touch, nunca soltarse solos»). Un `touchcancel` lo
       manda el SISTEMA y no la página: el rechazo de palma de Android cuando la
       mano se apoya al estirarse hacia arriba, un gesto del sistema, una
       notificación. Ningún código de página lo puede impedir. Lo que sí se
       puede es no tratarlo como un final: la pieza se queda flotando donde
       estaba el dedo, y EL SIGUIENTE TOQUE, esté donde esté, la retoma --si
       arrastra, sigue el arrastre; si solo toca, la suelta ahí--. Si en seis
       segundos no llega ningún toque, vuelve a su sitio. */
    var enMano = null;
    var MS_EN_MANO = 6000;
    function quedarEnMano(esto) {
      enMano = esto;
      esto.reloj = setTimeout(function () { soltarLaMano(true); }, MS_EN_MANO);
      document.body.classList.add('jg-en-mano');
      document.addEventListener('touchstart', retomar, { passive: false, capture: true });
    }
    /* Sin retomar: `devolver` la manda a su sitio (el tiempo se acabó). */
    function soltarLaMano(devolver) {
      if (!enMano) return;
      var esto = enMano; enMano = null;
      clearTimeout(esto.reloj);
      document.body.classList.remove('jg-en-mano');
      document.removeEventListener('touchstart', retomar, { capture: true });
      if (devolver) { fin(); if (o.cancelar) o.cancelar(esto.datos); }
    }
    function retomar(e) {
      if (!enMano) return;
      var d = e.changedTouches[0];
      if (!d) return;
      /* Este toque es de la pieza, no de lo que haya debajo. */
      e.preventDefault();
      e.stopPropagation();
      var esto = enMano;
      soltarLaMano(false);
      g = esto;
      g.id = d.identifier;
      g.objetivo = e.target;
      g.pendiente = null;
      ponerEnObjetivo(e.target);
      ponerOtros();
      moverA(d.clientX, d.clientY);
    }

    /* ⚠️ EL DEDO QUE SE PIERDE Y SE VUELVE A ENCONTRAR ES EL MISMO DEDO (titular,
       2026-09-22, y lo dijo su propio teléfono: la Bitácora trajo, de un Android
       10 con Chrome 153, un contacto nuevo en CADA arrastre --en Calco, seis en
       56 ms--). Hay pantallas táctiles que, en un movimiento rápido o en cierta
       zona del cristal, PIERDEN el dedo y lo vuelven a ver con otro número: para
       el navegador, un dedo se levantó y se apoyó otro. Fiarse del número
       soltaba la pieza sin que nadie levantara nada, que es exactamente «se
       suelta sola a mitad de camino».
       La regla: cuando el dedo de la pieza «se levanta», si A LA VEZ hay otro
       contacto apoyado CERCA, o aparece uno cerca en los `MS_RELEVO` siguientes,
       el arrastre sigue con ése. Una palma apoyada lejos no cuenta, y un levantar
       de verdad --nada cerca en ese instante-- suelta como siempre, con esa
       fracción de segundo de espera. */
    var RELEVO_PX = 140, MS_RELEVO = 140;
    function masCerca(lista) {
      var mejor = null, dmin = RELEVO_PX;
      for (var i = 0; i < lista.length; i++) {
        var t = lista[i];
        if (t.identifier === g.id) continue;
        var dd = Math.hypot(t.clientX - g.ux, t.clientY - g.uy);
        if (dd <= dmin) { dmin = dd; mejor = t; }
      }
      return mejor;
    }
    function relevar(t, como, trasMs) {
      g.id = t.identifier;
      g.objetivo = t.target || g.objetivo;   /* donde nació ese contacto: ahí le llegan sus eventos */
      ponerEnObjetivo(g.objetivo);
      g.relevos++;
      g.comoRelevo = como;
      g.trasMs = trasMs == null ? null : Math.round(trasMs);
      moverA(t.clientX, t.clientY);
    }
    /* Mientras hay arrastre con el dedo, CUALQUIER contacto nuevo, esté donde
       esté: se cuenta, no deja que el navegador lo use para nada y, si el dedo
       de la pieza acaba de perderse, se mira si es él. */
    function alOtroContacto(e) {
      if (!g || g.via !== 'toque') return;
      var nuevos = [].filter.call(e.changedTouches, function (t) { return t.identifier !== g.id; });
      if (!nuevos.length) return;
      e.preventDefault();
      g.otros += nuevos.length;
      if (!g.pendiente) return;
      var t = masCerca(nuevos);
      if (!t) return;
      var p = g.pendiente;
      clearTimeout(p.reloj);
      g.pendiente = null;
      relevar(t, 'despues', performance.now() - p.t);
    }
    function ponerOtros() { document.addEventListener('touchstart', alOtroContacto, { passive: false, capture: true }); }
    function quitarOtros() { document.removeEventListener('touchstart', alOtroContacto, { capture: true }); }

    /* ---------------------------------------------------------------- DEDO */
    function elDedo(e) {
      if (!g || g.via !== 'toque') return null;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === g.id) return e.changedTouches[i];
      }
      return null;
    }
    function alMoverDedo(e) {
      if (seFue() || !g || g.via !== 'toque') return;
      e.preventDefault();
      var d = elDedo(e);
      if (d) moverA(d.clientX, d.clientY);
    }
    function alLevantarDedo(e) {
      if (seFue()) return;
      var d = elDedo(e);
      if (!d) return;
      if (e.cancelable) e.preventDefault();
      var objetivo = g.objetivo;
      quitarDelObjetivo(objetivo);
      if (e.type === 'touchcancel') { cortar('touchcancel'); return; }
      /* ⚠️ TAMBIÉN ANTES DE HABERSE MOVIDO: la pantalla puede perder el dedo en
         el primer instante, cuando todavía no ha recorrido los seis píxeles que
         lo convierten en arrastre. Atenderlo como un toque terminaba el gesto y
         el dedo seguía moviéndose sin nada cogido (lo cazó la simulación). */
      /* ¿Otro contacto apoyado cerca en este mismo instante? Es el mismo dedo
         con otro número. */
      g.ux = d.clientX; g.uy = d.clientY;
      var otro = masCerca(e.touches);
      if (otro) { relevar(otro, 'a la vez', 0); return; }
      /* Si no, se espera un instante: la pantalla puede tardar en volver a
         verlo. Pasado ese instante sin nada cerca, se suelta donde se levantó. */
      g.pendiente = { x: d.clientX, y: d.clientY, objetivo: objetivo, t: performance.now(),
        reloj: setTimeout(function () {
          if (!g || !g.pendiente) return;
          var p = g.pendiente;
          g.pendiente = null;
          quitarOtros();
          terminar(p.x, p.y, p.objetivo);
        }, MS_RELEVO) };
    }
    function ponerEnObjetivo(el) {
      el.addEventListener('touchmove', alMoverDedo, { passive: false });
      el.addEventListener('touchend', alLevantarDedo, { passive: false });
      el.addEventListener('touchcancel', alLevantarDedo, { passive: false });
    }
    function quitarDelObjetivo(el) {
      if (!el) return;
      el.removeEventListener('touchmove', alMoverDedo);
      el.removeEventListener('touchend', alLevantarDedo);
      el.removeEventListener('touchcancel', alLevantarDedo);
    }
    function alApoyarDedo(e) {
      if (g) {
        /* Un segundo contacto mientras el primero arrastra --otro dedo, la
           palma, o el mismo dedo re-detectado--: aquí no empieza nada. Lo
           cuenta y lo mira `alOtroContacto`, que lo ve antes, esté donde esté. */
        if (g.via === 'toque') e.preventDefault();
        return;
      }
      var d = e.changedTouches[0];
      var objetivo = e.target;
      if (!d || !objetivo || !arrancar(objetivo, d.clientX, d.clientY, 'toque', d.identifier)) return;
      e.preventDefault();
      g.objetivo = objetivo;
      ponerEnObjetivo(objetivo);
      ponerOtros();
    }

    /* ------------------------------------------------------- RATÓN O LÁPIZ */
    function alMoverPuntero(e) {
      if (seFue() || !g || g.via !== 'puntero' || e.pointerId !== g.id) return;
      /* La red para un `pointerup` perdido, y SOLO con ratón. */
      if (e.pointerType === 'mouse' && !e.buttons) { cortar('sin-boton'); return; }
      moverA(e.clientX, e.clientY);
    }
    function alSoltarPuntero(e) {
      if (seFue() || !g || g.via !== 'puntero' || e.pointerId !== g.id) return;
      if (e.type === 'pointercancel') cortar('pointercancel', { tipo: e.pointerType });
      else terminar(e.clientX, e.clientY, e.target);
    }
    function alBajarPuntero(e) {
      if (g || e.button) return;
      /* El dedo ya lo atienden los eventos táctiles: por las dos vías lo
         cogido se movería dos veces. Donde NO hay eventos táctiles --una
         pantalla táctil de escritorio que solo manda punteros-- va por aquí. */
      if (e.pointerType === 'touch' && HAY_TOQUE) return;
      if (!arrancar(e.target, e.clientX, e.clientY, 'puntero', e.pointerId)) return;
      try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* sin captura, va por window */ }
    }

    /* ------------------------------------------------------------ GLOBALES */
    function alEsconderse() {
      if (seFue() || document.visibilityState !== 'hidden') return;
      if (enMano) { soltarLaMano(true); return; }
      if (g) cortar('pestana-oculta');
    }
    /* La pulsación larga con el ratón derecho o, si algún navegador la cuela,
       con el dedo: mientras hay gesto, ningún menú. */
    function sinMenu(e) { if (g) e.preventDefault(); }
    function sinNativo(e) { e.preventDefault(); }
    caja.addEventListener('touchstart', alApoyarDedo, { passive: false });
    caja.addEventListener('pointerdown', alBajarPuntero);
    caja.addEventListener('contextmenu', sinMenu);
    caja.addEventListener('dragstart', sinNativo);
    window.addEventListener('pointermove', alMoverPuntero);
    window.addEventListener('pointerup', alSoltarPuntero);
    window.addEventListener('pointercancel', alSoltarPuntero);
    document.addEventListener('visibilitychange', alEsconderse);
    function quitarGlobales() {
      window.removeEventListener('pointermove', alMoverPuntero);
      window.removeEventListener('pointerup', alSoltarPuntero);
      window.removeEventListener('pointercancel', alSoltarPuntero);
      document.removeEventListener('visibilitychange', alEsconderse);
    }

    /* Apagar: quitar TODO lo puesto y soltar lo que hubiera cogido (vuelve a
       su sitio). Lo llama el siguiente arrastre montado sobre la misma caja. */
    function apagar() {
      soltarLaMano(true);
      quitarOtros();
      if (g && g.pendiente) clearTimeout(g.pendiente.reloj);
      caja.removeEventListener('touchstart', alApoyarDedo);
      caja.removeEventListener('pointerdown', alBajarPuntero);
      caja.removeEventListener('contextmenu', sinMenu);
      caja.removeEventListener('dragstart', sinNativo);
      quitarGlobales();
      if (g && g.objetivo) quitarDelObjetivo(g.objetivo);
      if (g && g.empezado && o.cancelar) { try { o.cancelar(g.datos); } catch (e) {} }
      g = null;
      if (caja.__arrastre === yo) caja.__arrastre = null;
    }

    var yo = {
      /* ¿Acaba de terminar un gesto? Para que el `click` del juego no atienda
         lo que ya se atendió aquí --el clic que cierra un arrastre con ratón,
         o el que algún navegador mande tras un toque que ya se contó--. */
      reciente: function () { return performance.now() - ultimoFin < 450; },
      activo: function () { return !!g; },
      apagar: apagar
    };
    caja.__arrastre = yo;
    return yo;
  };
})();
