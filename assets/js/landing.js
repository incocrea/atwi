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
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', 'Pantalla ' + (i + 1) + ': ' + (p.dataset.titulo || ''));
    b.addEventListener('click', function () { ir(i); });
    cajaPuntos.appendChild(b);
    return b;
  });

  function ir(i) {
    i = Math.max(0, Math.min(i, pantallas.length - 1));
    pista.scrollTo({ left: pantallas[i].offsetLeft - pista.offsetLeft, behavior: 'smooth' });
  }

  /* QUIÉN MANDA ES EL SCROLL, no el clic. Las flechas y los puntos solo
     scrollean; el estado se pinta al llegar. Así el pase dice la verdad tanto
     si lo movió un botón como si lo movió el dedo. */
  function pintar() {
    var ancho = pista.clientWidth || 1;
    var i = Math.round(pista.scrollLeft / ancho);
    i = Math.max(0, Math.min(i, pantallas.length - 1));
    if (i === actual && puntos[i].getAttribute('aria-selected') === 'true') return;
    actual = i;
    if (rotulo) rotulo.textContent = pantallas[i].dataset.titulo || '';
    puntos.forEach(function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
    flechas.forEach(function (f) {
      var paso = parseInt(f.dataset.pase, 10);
      f.disabled = (paso < 0 && i === 0) || (paso > 0 && i === pantallas.length - 1);
    });
  }

  flechas.forEach(function (f) {
    f.addEventListener('click', function () { ir(actual + parseInt(f.dataset.pase, 10)); });
  });

  pista.addEventListener('scroll', function () {
    /* Sin `requestAnimationFrame`: el scroll dispara decenas de veces por
       gesto y esto solo toca atributos, pero repintarlo en cada evento hace
       trabajo de más en el móvil, que es donde se scrollea con el dedo. */
    if (pista.pendiente) return;
    pista.pendiente = requestAnimationFrame(function () {
      pista.pendiente = 0;
      pintar();
    });
  }, { passive: true });

  pista.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { ir(actual + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { ir(actual - 1); e.preventDefault(); }
  });

  window.addEventListener('resize', pintar);
  pintar();
}());
