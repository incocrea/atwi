/* ==========================================================================
   ATWI · iconos.js
   Iconografía propia, en línea. Estilo Finch: trazo grueso, extremos y uniones
   redondeados, formas simples y llenas de aire. Nada de librerías externas:
   son ocho iconos y pesan menos que una petición.

   Uso:  ATWI.icono('negociacion', 28)  ->  cadena de SVG
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var TRAZOS = {
    /* Barra inferior */
    jugar: '<path d="M7 4.5h10a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 17 15.5h-3.2L10 19v-3.5H7A2.5 2.5 0 0 1 4.5 13V7A2.5 2.5 0 0 1 7 4.5Z"/><path d="M9 9.5h6M9 12h3.5"/>',
    catalogo: '<rect x="3.5" y="4.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="4.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="14.5" width="7" height="5" rx="2"/><rect x="13.5" y="14.5" width="7" height="5" rx="2"/>',
    historial: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3.5V8h4.5"/><path d="M12 8v4.4l3 1.8"/>',
    perfil: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',

    /* Los dos modos */
    debate: '<path d="M12 4v16"/><path d="M5 7h14"/><path d="M5 7 2.8 12.2a3.4 3.4 0 0 0 4.4 0Z"/><path d="M19 7l-2.2 5.2a3.4 3.4 0 0 0 4.4 0Z"/><path d="M8.5 20h7"/>',
    negociacion: '<path d="M12 19.5s-7-4.2-7-9A3.9 3.9 0 0 1 12 7.6 3.9 3.9 0 0 1 19 10.5c0 4.8-7 9-7 9Z"/>',

    /* Acciones */
    micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
    mas: '<path d="M12 5.5v13M5.5 12h13"/>',
    atras: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',

    /* Escuchar lo grabado antes de mandarlo */
    play: '<path d="M8.5 5.6a.9.9 0 0 1 1.36-.78l8.1 6.4a.9.9 0 0 1 0 1.56l-8.1 6.4A.9.9 0 0 1 8.5 18.4Z"/>',
    pausa: '<rect x="7.5" y="5" width="3.6" height="14" rx="1.6"/><rect x="12.9" y="5" width="3.6" height="14" rx="1.6"/>',
    parar: '<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3"/>',
    papelera: '<path d="M4.5 6.8h15"/><path d="M9.3 6.8V5.2a1.4 1.4 0 0 1 1.4-1.4h2.6a1.4 1.4 0 0 1 1.4 1.4v1.6"/><path d="M6.6 6.8 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.8-12.2"/>',
    repetir: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.5V8h-4.5"/>',

    /* Escribir y reescribir */
    lapiz: '<path d="M4.6 19.4h3.2L18.4 8.8a2.26 2.26 0 0 0-3.2-3.2L4.6 16.2Z"/><path d="M13.8 7l3.2 3.2"/>',
    volver: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3.5V8h4.5"/>',

    /* Cuenta */
    ajustes: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.7 6.7 5 5M19 19l-1.7-1.7M6.7 17.3 5 19M19 5l-1.7 1.7"/>',
    salir: '<path d="M15 4.5h2.5A2 2 0 0 1 19.5 6.5v11a2 2 0 0 1-2 2H15"/><path d="M10.5 8 6.5 12l4 4"/><path d="M6.5 12H15"/>',
    cerrar: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
    listo: '<path d="M5 12.6 9.7 17 19 6.8"/>',
    candado: '<rect x="4.8" y="10.5" width="14.4" height="9.2" rx="2.6"/><path d="M8.4 10.5V8a3.6 3.6 0 0 1 7.2 0v2.5"/>',
    aviso: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.8v4.6M12 15.9v.2"/>',
    buzon: '<path d="M18 9.2a6 6 0 1 0-12 0c0 4.3-1.4 5.6-2 6.3h16c-.6-.7-2-2-2-6.3Z"/><path d="M10 18.6a2.3 2.3 0 0 0 4 0"/>',
    /* Vínculo entre dos cuentas. Todavía sin versión ilustrada. */
    corazon: '<path d="M12 20s-7.4-4.4-7.4-9.5A4.1 4.1 0 0 1 12 7.9a4.1 4.1 0 0 1 7.4 2.6c0 5.1-7.4 9.5-7.4 9.5Z"/>'
  };

  /* Iconos ILUSTRADOS. Son PNG de pegatina generados con la API de imagen y
     recortados de una lámina, para que salgan todos de la misma mano. Los SVG
     de línea de abajo se quedan solo para lo que todavía no está ilustrado:
     flechas, cerrar y aviso, que son cromo de interfaz y no iconografía.
     La ruta es relativa a /app/, que es la única pantalla que los usa. */
  var ILUSTRADOS = ['jugar', 'catalogo', 'historial', 'perfil',
                    'debate', 'negociacion', 'micro', 'mas'];

  /** Devuelve el icono ilustrado si existe, y si no el SVG de línea. */
  window.ATWI.icono = function (nombre, tam) {
    if (ILUSTRADOS.indexOf(nombre) !== -1) {
      var t = tam || 24;
      return '<img class="ico" src="../assets/img/iconos/' + nombre + '.png" alt="" ' +
             'width="' + t + '" height="' + t + '" loading="lazy" decoding="async">';
    }
    return window.ATWI.iconoSVG(nombre, tam);
  };

  /* ==========================================================================
     PEGATINAS
     Iconos con el aspecto de los ilustrados —color plano y perfil blanco— pero
     dibujados en SVG en vez de generados como PNG. Sirven para las piezas que
     no están en la lámina y que no justifican gastar una tanda de la API de
     imagen: se ven de la misma familia, escalan sin pesar y se pueden recolorear.

     El perfil blanco sale de `paint-order: stroke`, que pinta el trazo DETRÁS
     del relleno; sin eso el trazo se comería la mitad del dibujo.
     ========================================================================== */
  var PEGATINAS = {
    /* Lápiz: goma rosa arriba, cuerpo ámbar, madera y mina abajo. */
    lapiz:
      '<g transform="rotate(45 12 12)">' +
        '<rect x="9.1" y="2.6" width="5.8" height="13.4" rx="1.4" fill="#F0B429"/>' +
        '<path d="M10.5 2.6h3a1.4 1.4 0 0 1 1.4 1.4v2.1H9.1V4a1.4 1.4 0 0 1 1.4-1.4Z" fill="#EE7FA8"/>' +
        '<path d="M9.1 16h5.8L12 21.2Z" fill="#E7D9C3"/>' +
        '<path d="M10.75 19h2.5L12 21.2Z" fill="#2E2A3F"/>' +
      '</g>'
  };

  /** Un icono con aspecto de pegatina: color plano y perfil blanco. */
  window.ATWI.pegatina = function (nombre, tam) {
    var d = PEGATINAS[nombre];
    if (!d) return window.ATWI.iconoSVG(nombre, tam);
    var t = tam || 24;
    return '<svg viewBox="0 0 24 24" width="' + t + '" height="' + t + '" ' +
      'style="paint-order:stroke" stroke="#FFFFFF" stroke-width="2.1" ' +
      'stroke-linejoin="round" stroke-linecap="round" ' +
      'aria-hidden="true" focusable="false">' + d + '</svg>';
  };

  /** El juego de líneas, para lo que aún no tiene ilustración. */
  window.ATWI.iconoSVG = function (nombre, tam) {
    var d = TRAZOS[nombre];
    if (!d) return '';
    var t = tam || 24;
    return '<svg viewBox="0 0 24 24" width="' + t + '" height="' + t +
      '" fill="none" stroke="currentColor" stroke-width="2.1" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      d + '</svg>';
  };
})();
