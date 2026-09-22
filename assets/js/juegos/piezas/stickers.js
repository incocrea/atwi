/* ATWI · minijuegos · LA HOJA DE STICKERS, una sola para todos
   ==========================================================================
   Los 24 `st-*.webp` que usan Calco y Frascos --y después Despensa, Dúos y
   Revoltijo--. Vivía escrita a mano dentro de `ui/calco.js`; al llegar el
   segundo juego que la necesita se muda aquí, que es lo que el plan pide de
   cada pieza técnica que un juego estrena (docs/10 §7: «cada juego deja su
   pieza como pieza COMÚN»). Dos listas de 24 nombres en dos archivos son dos
   listas que un día dicen cosas distintas.

   ⚠️ EL ORDEN ES EL CONTRATO. El índice dentro de esta lista ES el número que
   viaja en el tablero (`fichas`), así que NO SE REORDENA NI SE RECORTA sin
   subir `VERSION_REGLAS`: un teléfono con otro orden pondría otro dibujo en la
   misma ronda. Añadir uno al final tampoco es gratis: cambia de cuántos se
   sortea (`STICKERS` en cada lógica), y con él los tableros.
   El banco (`tools/probar_juegos.js`, 3-bis) comprueba que esta lista sea
   exactamente la carpeta y que cada lógica cuente los mismos.

   Es interfaz y no lógica: el servidor no necesita saber cómo se llama cada
   dibujo, solo cuántos hay. Por eso vive fuera de `logica/` y no se copia a la
   función de borde. */
(function () {
  'use strict';
  var J = window.ATWI.juegos = window.ATWI.juegos || Object.create(null);

  var HOJA = [
    'arcoiris', 'balon', 'camara', 'conejo', 'corazon', 'cupcake',
    'dona', 'estrella', 'gato', 'gema', 'huevo', 'lata',
    'leche', 'libro', 'luna', 'mando', 'manzana', 'osito',
    'patito', 'pizza', 'taza', 'trebol', 'zanahoria', 'zapatilla'
  ];

  /* Cómo se dice cada uno en voz alta, para el lector de pantalla: el nombre
     del archivo no lleva tildes ni espacios. */
  var DICHO = {
    arcoiris: 'arcoíris', balon: 'balón', camara: 'cámara', corazon: 'corazón',
    trebol: 'trébol', huevo: 'huevo frito'
  };

  function nombre(cual) {
    var n = HOJA[cual];
    return n ? (DICHO[n] || n) : '';
  }

  /* ⚠️ `draggable="false"` SIEMPRE: un `<img>` es arrastrable de serie, y el
     arrastre nativo del navegador se come cualquier gesto de puntero que el
     juego quiera hacer encima (la lección de Choque). */
  function html(cual, px, clase) {
    return '<img class="' + (clase || 'jg-st') + '" src="../assets/img/juegos/st-' + HOJA[cual] + '.webp" ' +
      'width="' + px + '" height="' + px + '" alt="" decoding="async" draggable="false">';
  }

  J.stickers = { HOJA: HOJA, nombre: nombre, html: html };
})();
