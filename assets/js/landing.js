/* ==========================================================================
   ATWI · landing.js
   Lo ÚNICO que hace la landing: encender el visor de la partida.

   NO CARGA NADA DEL JUEGO. `app.js` son miles de líneas que no pintan nada de
   esta página; lo que el visor enseña corre dentro de un iframe, en su propio
   documento, y esta página solo lo mete en el marco del teléfono.

   ⚠️ Y LO METE AL PULSAR, NO AL CARGAR. El iframe es la app entera más 438 KB
   de audio: bajárselo a todo el que entra a leer qué es ATWI sería gastar los
   datos de alguien por si acaso. Hasta que se toca el botón, aquí no hay más
   que una portada de 3 KB.
   ========================================================================== */
(function () {
  'use strict';

  var boton = document.getElementById('visor-ver');
  var caja = document.getElementById('visor-caja');
  var portada = document.getElementById('visor-portada');
  if (!boton || !caja) return;

  boton.addEventListener('click', function () {
    boton.disabled = true;
    boton.textContent = 'Cargando…';

    var marco = document.createElement('iframe');
    marco.className = 'visor__marco';
    marco.title = 'Una partida de ATWI, de principio a fin';
    /* `allow="autoplay"`: la voz del personaje arranca al tocar una
       intervención DENTRO del iframe, y sin esto algunos navegadores no dejan
       sonar a un documento embebido aunque el gesto haya ocurrido en él. */
    marco.setAttribute('allow', 'autoplay');
    /* El demo no escribe nada ni sale de aquí, pero el iframe se acota igual:
       lo que necesita es correr su script y nada más. `same-origin` hace falta
       porque el juego guarda cosas en `localStorage` al arrancar. */
    marco.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    marco.src = 'app/?demo=1';

    marco.addEventListener('load', function () {
      /* La portada se va AL CARGAR y no al pulsar: quitarla antes deja el
         teléfono en blanco los segundos que tarda, y un hueco vacío después de
         tocar un botón se lee como que algo falló. */
      if (portada) portada.remove();
      caja.dataset.puesto = '1';
    });

    caja.appendChild(marco);
  });
}());
