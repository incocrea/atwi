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
   · SOLO SE SUELTA AL LEVANTAR EL DEDO (`touchend`) o el botón (`pointerup`).
     Un `touchcancel` o un `pointercancel` NO son soltar: lo cogido vuelve a su
     sitio (`cancelar`), nunca cae donde estaba el dedo.
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
  function anotarCorte(nombre, via, motivo, g, extra) {
    try {
      if (window.console) console.warn('[arrastre] ' + nombre + ': cortado por ' + motivo, extra || '');
      var nube = window.ATWI.nube;
      if (!nube || !nube.anotar || anotadas >= 5) return;
      anotadas++;
      var datos = {
        juego: nombre, via: via, motivo: motivo,
        empezado: !!(g && g.empezado),
        ms: g ? Math.round(performance.now() - g.t0) : null,
        navegador: String(navigator.userAgent || '').slice(0, 240),
        toque: HAY_TOQUE, puntos: navigator.maxTouchPoints || 0
      };
      if (extra) for (var k in extra) datos[k] = extra[k];
      nube.anotar('arrastre_cortado', { nivel: 'aviso', detalle: nombre + ': ' + motivo, datos: datos });
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
      quitarGlobales();
      if (g && g.objetivo) quitarDelObjetivo(g.objetivo);
      if (g && g.empezado && o.cancelar) { try { o.cancelar(g.datos); } catch (e) {} }
      g = null;
      return true;
    }

    function arrancar(objetivo, x, y, via, id) {
      var datos = o.coger(objetivo, x, y);
      if (datos === null || datos === undefined) return false;
      g = { datos: datos, x0: x, y0: y, empezado: false, via: via, id: id, objetivo: null, t0: performance.now() };
      return true;
    }
    function moverA(x, y) {
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
      if (esto.empezado) { fin(); o.soltar(esto.datos, x, y); }
      else if (esto.via === 'toque' && o.tocar) { fin(); o.tocar(esto.datos, objetivo); }
    }
    /* Cortado desde fuera: NUNCA es soltar. Lo cogido vuelve a su sitio. */
    function cortar(motivo, extra) {
      var esto = g; g = null;
      if (!esto.empezado) return;
      fin();
      anotarCorte(nombre, esto.via, motivo, esto, extra);
      if (o.cancelar) o.cancelar(esto.datos);
    }

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
      if (e.type === 'touchcancel') cortar('touchcancel');
      else terminar(d.clientX, d.clientY, objetivo);
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
        /* Un segundo dedo mientras el primero arrastra: no empieza nada y
           tampoco deja que el navegador lo use para hacer zum. */
        if (g.via === 'toque') e.preventDefault();
        return;
      }
      var d = e.changedTouches[0];
      var objetivo = e.target;
      if (!d || !objetivo || !arrancar(objetivo, d.clientX, d.clientY, 'toque', d.identifier)) return;
      e.preventDefault();
      g.objetivo = objetivo;
      ponerEnObjetivo(objetivo);
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
      if (seFue() || !g || document.visibilityState !== 'hidden') return;
      cortar('pestana-oculta');
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
