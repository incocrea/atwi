/* ==========================================================================
   ATWI · landing.js
   Lo ÚNICO que hace la landing: mover el pase de pantallas.

   NO CARGA NADA DEL JUEGO. `app.js` son miles de líneas que no pintan nada de
   esta página, así que la landing tiene su propio archivo de veinte.

   Y EL PASE SE MUEVE SOLO SIN JAVASCRIPT: la pista es un contenedor que
   scrollea con `scroll-snap`, o sea que con el dedo funciona aunque esto no
   llegue a cargar. Lo que añade el script son las FLECHAS, los PUNTOS y el
   rótulo de qué se está mirando — comodidad de escritorio, donde no hay dedo.
   Por eso los puntos se crean aquí y no en el HTML: un control que no puede
   funcionar sin script no debe existir cuando el script no está.
   ========================================================================== */
(function () {
  'use strict';

  var pista = document.getElementById('pase');
  if (!pista) return;

  var pantallas = [].slice.call(pista.children);
  var rotulo = document.getElementById('pase-texto');
  var cajaPuntos = document.getElementById('pase-puntos');
  var flechas = [].slice.call(document.querySelectorAll('[data-pase]'));
  var actual = 0;

  var puntos = pantallas.map(function (p, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pase__punto';
    b.setAttribute('aria-label', 'Pantalla ' + (i + 1) + ': ' + (p.dataset.titulo || ''));
    b.addEventListener('click', function () { ir(i); });
    cajaPuntos.appendChild(b);
    return b;
  });

  function ir(i) {
    i = Math.max(0, Math.min(i, pantallas.length - 1));
    var destino = pantallas[i].offsetLeft - pista.offsetLeft;
    /* ⚠️ EL SCROLL SUAVE NO CORRE SI LA PESTAÑA NO PINTA, y entonces no es que
       se vea feo: es que NO SE MUEVE. Medido con la pestaña en segundo plano:
       `scrollTo({behavior:'smooth'})` deja el `scrollLeft` en 0 y el pase se
       queda congelado en la primera pantalla. Es el mismo fallo de fondo que
       ya tuvo el globo con `requestAnimationFrame`: lo que depende del ciclo
       de pintado no ocurre cuando no hay pintado. Con la pestaña escondida
       nadie está mirando la animación, así que se salta y se va al sitio. */
    /* Y quien pidio menos movimiento tampoco lo quiere aqui: eso lo hacia
       una regla `@media` sobre `scroll-behavior`, que ya no existe. */
    var quieto = document.visibilityState === 'hidden' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    pista.scrollTo({ left: destino, behavior: quieto ? 'auto' : 'smooth' });
    /* Y el estado se marca YA, sin esperar a que el scroll llegue: con el
       viaje suave, dos toques seguidos en la flecha ocurren antes de que el
       primero termine, y si `actual` esperara al final los dos pedirían la
       misma pantalla. El scroll lo confirma —o lo corrige, si el dedo se
       lleva la pista a otro sitio a mitad del viaje—. */
    marcar(i);
  }

  function marcar(i) {
    if (i === actual && puntos[i].getAttribute('aria-current') === 'true') return;
    actual = i;
    if (rotulo) rotulo.textContent = pantallas[i].dataset.titulo || '';
    puntos.forEach(function (b, j) { b.setAttribute('aria-current', j === i ? 'true' : 'false'); });
    flechas.forEach(function (f) {
      var paso = parseInt(f.dataset.pase, 10);
      f.disabled = (paso < 0 && i === 0) || (paso > 0 && i === pantallas.length - 1);
    });
  }

  /* EL DEDO TAMBIÉN MANDA, no solo los botones: la pista scrollea sola, así que
     el estado se recalcula con lo que diga el scroll. */
  function pintar() {
    var ancho = pista.clientWidth || 1;
    marcar(Math.max(0, Math.min(Math.round(pista.scrollLeft / ancho), pantallas.length - 1)));
  }

  flechas.forEach(function (f) {
    f.addEventListener('click', function () { ir(actual + parseInt(f.dataset.pase, 10)); });
  });

  /* ⚠️ SIN `requestAnimationFrame` PARA JUNTAR EVENTOS, y esto costó una vuelta:
     ese callback no corre si la pestaña no pinta, así que el pase se movía y
     el rótulo, los puntos y las flechas se quedaban diciendo «pantalla 1» —y,
     peor, `actual` no avanzaba, o sea que la flecha siguiente volvía a pedir
     la misma pantalla y el pase no pasaba de la segunda—. Es la misma lección
     que el globo: lo que cuelga del ciclo de pintado no ocurre sin pintado.
     El evento de scroll dispara muchas veces por gesto, y lo que se hace en
     cada una es una resta y una comparación que casi siempre sale por el
     `return` de arriba; el único coste de layout, `clientWidth`, se lee ahí
     mismo porque el ancho de la pista cambia con la ventana. */
  pista.addEventListener('scroll', pintar, { passive: true });

  pista.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { ir(actual + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { ir(actual - 1); e.preventDefault(); }
  });

  window.addEventListener('resize', pintar);
  pintar();
}());
