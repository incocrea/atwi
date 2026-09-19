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
/* ⚠️ EL ENLACE DEL CORREO PUEDE CAER AQUI, Y AQUI NO HAY JUEGO (lo vio el
   titular, 2026-09-19: «el link que me llega al email me envía a atwi.app pero
   no directo al juego para continuar el registro»). Supabase construye el
   enlace con el `redirect_to` que se le pide, PERO si esa dirección no está en
   la lista blanca del proyecto la descarta sin avisar y usa el **Site URL**,
   que es la landing. Entonces la sesión llega colgada del fragmento de ESTA
   página —`#access_token=…`— y aquí no hay nadie que la recoja: el registro se
   queda a medias y lo que se ve es la portada.
   Esto lo reenvía al juego con su fragmento intacto, así que el alta sigue
   donde debe. **Es una red, no el arreglo**: la lista blanca tiene que tener
   `https://atwi.app/app/**` para que el enlace apunte bien desde el correo.
   Va lo primero del archivo y fuera del visor: no depende de que la página
   termine de montarse, y cuanto antes salte, menos se ve la landing. */
(function () {
  var h = location.hash || '';
  if (/[#&](access_token|error_description|error_code)=/.test(h)) {
    location.replace(location.origin + '/app/' + h);
  }
})();

(function () {
  'use strict';

  var boton = document.getElementById('visor-ver');
  var caja = document.getElementById('visor-caja');
  var portada = document.getElementById('visor-portada');
  if (!boton || !caja) return;

  /* EL MOVIL DE REFERENCIA, y es el mismo con el que se prueba el juego entero
     (CLAUDE.md: «el juego se prueba en vista movil, 375x812»). El iframe corre
     SIEMPRE a este tamano y lo que cambia es el `scale`: asi lo que se ve es el
     telefono de verdad, reducido, y no un layout distinto apretado en 300 px.
     El juego no es fluido —es una columna con las figuras y las fichas medidas
     en pixeles— asi que darle un viewport mas estrecho no lo encoge: lo rompe. */
  var ANCHO_MOVIL = 375;

  function escalar() {
    /* `clientWidth` y no `getBoundingClientRect().width`: el segundo devuelve el
       ancho YA escalado si algun dia el propio marco lleva transform, y entonces
       el factor se realimentaria. */
    var ancho = caja.clientWidth;
    if (ancho) caja.style.setProperty('--escala', ancho / ANCHO_MOVIL);
  }

  escalar();
  if (window.ResizeObserver) new ResizeObserver(escalar).observe(caja);
  else window.addEventListener('resize', escalar);

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

/* LAS HOJAS DE INFORMACIÓN (titular, 2026-09-18): `<dialog>` nativos que se abren
   desde un enlace con `data-pliego` y desde el `#` de la dirección, para que el
   juego pueda enlazar `../#privacidad`. Se cierran con el aspa, con Escape (lo
   da el navegador) y tocando el fondo. */
(function () {
  'use strict';
  function abrir(id) {
    var h = document.getElementById(id);
    if (!h || typeof h.showModal !== 'function' || h.open) return;
    h.showModal();
    h.querySelector('.pliego__caja').scrollTop = 0;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-pliego]');
    if (a) { e.preventDefault(); abrir(a.dataset.pliego); return; }
    var x = e.target.closest('[data-cerrar-pliego]');
    if (x) { x.closest('dialog').close(); return; }
    /* Tocar el fondo: el click cae en el propio <dialog>, no en su caja. */
    if (e.target.classList && e.target.classList.contains('pliego')) e.target.close();
  });
  var porHash = { '#privacidad': 'pliego-privacidad' };
  function delHash() { if (porHash[location.hash]) abrir(porHash[location.hash]); }
  window.addEventListener('hashchange', delHash);
  delHash();
})();
