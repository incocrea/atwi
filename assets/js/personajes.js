/* ==========================================================================
   ATWI · personajes.js
   Kai y Luna: las dos figuras que sirven de avatar, de retrato de quien habla
   y de contrincantes en la pantalla de versus.

   POR QUÉ EL FONDO NO ESTÁ EN EL PNG. La hoja de referencia traía detrás de
   cada pose una mancha suave de color —un óvalo en los retratos, unas
   pinceladas en diagonal en la de plante— que le da el aire de cada estado. Si
   eso se quema en el PNG, la figura deja de poder ponerse sobre cualquier
   fondo: en la barra, en una tarjeta, sobre el tinte del modo. Así que las
   figuras se generaron recortadas, con su perfil blanco de pegatina y nada
   detrás, y la mancha se dibuja aquí en SVG. Se recolorea, se escala sin pesar
   y se puede quitar donde estorbe.

   Uso:
     ATWI.retrato('kai', 'frente', { fondo: 'disco' })   -> cadena de HTML
     ATWI.fondoPersonaje('luna', 'estela')               -> cadena de SVG
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  /* Los colores salen de la paleta de la hoja de personajes, que NO es la de
     la app: Kai va en azul y Luna en rosa. Cada uno lleva tres tonos del mismo
     color —el de la mancha, el del refuerzo y el fuerte para detalles— porque
     con uno solo la mancha queda plana y con degradado incumpliría la regla de
     que aquí no hay degradados. */
  var GENTE = {
    kai: { nombre: 'Kai', tinte: '#E8F4FF', medio: '#BFE4FF', fuerte: '#6EC6FF' },
    luna: { nombre: 'Luna', tinte: '#FDEDF3', medio: '#FFC9DB', fuerte: '#FF8FB1' }
  };

  var POSES = {
    frente: 'de frente',      // retrato: avatar del perfil y pantalla de versus
    plante: 'en guardia',     // cuerpo entero, listo para el turno
    hablando: 'hablando',     // mientras graba: la mano y la boca, sin globo
    ganar: 'festejando',      // el resultado, para quien gana
    /* El puño va de UNO EN UNO y no los dos juntos a propósito: en Negociación
       no hay versus sino equipo, y cada uno entra desde su lado hasta chocar en
       el centro. La animación necesita las dos piezas sueltas. Kai mira a la
       derecha y Luna a la izquierda, que es como se encuentran. */
    puno: 'ofreciendo el puño',
    derrota: 'encajándolo'    // sentado, sin lágrimas: se pierde de buen humor
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Las dos manchas. Van en dos óvalos y no en uno con degradado: dos tonos
     planos dan la misma sensación de volumen y respetan la regla de la casa. */
  function disco(c) {
    return '<ellipse cx="50" cy="51" rx="49" ry="47" fill="' + c.tinte + '"/>' +
           '<ellipse cx="47" cy="47" rx="38" ry="36" fill="' + c.medio + '" opacity=".5"/>';
  }

  /* La estela de la pose de guardia: cuatro pinceladas en diagonal, más
     separadas y más finas según se alejan, que es lo que las hace leer como
     movimiento y no como rayas. */
  function estela(c) {
    var trazos = [[8, 74, 62, 12, 15], [30, 88, 84, 26, 10], [-6, 52, 40, -6, 7], [46, 96, 96, 46, 5]];
    var d = '<rect x="0" y="0" width="100" height="100" rx="14" fill="' + c.tinte + '"/>';
    trazos.forEach(function (t, i) {
      d += '<path d="M' + t[0] + ' ' + t[1] + ' L' + t[2] + ' ' + t[3] + '" ' +
           'stroke="' + c.medio + '" stroke-width="' + t[4] + '" stroke-linecap="round" ' +
           'fill="none" opacity="' + (0.75 - i * 0.13).toFixed(2) + '"/>';
    });
    return d;
  }

  /* El óvalo se ESTIRA a la caja y la estela se RECORTA. No es un capricho: un
     óvalo que conserva su proporción dentro de una caja alta deja de ser óvalo
     y pasa a leerse como un panel de fondo, mientras que unas pinceladas
     estiradas se enderezan y dejan de parecer movimiento. */
  var FONDOS = {
    disco: [disco, 'none'],
    estela: [estela, 'xMidYMid slice']
  };

  /** La mancha de color de un personaje, suelta. `tipo` es 'disco' o 'estela'. */
  window.ATWI.fondoPersonaje = function (quien, tipo) {
    var c = GENTE[quien];
    var f = FONDOS[tipo];
    if (!c || !f) return '';
    return '<svg class="retrato__fondo" viewBox="0 0 100 100" ' +
      'preserveAspectRatio="' + f[1] + '" aria-hidden="true" focusable="false">' +
      f[0](c) + '</svg>';
  };

  /* HACIA DÓNDE MIRA CADA POSE. Hace falta para poder ponerlas cara a cara: en
     un encuentro quien va a la izquierda tiene que mirar a la derecha y al
     revés, y si no coincide con cómo se dibujó, la figura se voltea.

     No todas se dibujaron igual a propósito: las de guardia miran las dos a la
     derecha, pero las del puño se dibujaron ya enfrentadas —Kai a la derecha y
     Luna a la izquierda— porque ahí los puños tienen que encontrarse y el
     dibujo del brazo no es simétrico. */
  var MIRA = {
    plante: { kai: 'derecha', luna: 'derecha' },
    puno: { kai: 'derecha', luna: 'izquierda' },
    hablando: { kai: 'derecha', luna: 'izquierda' }
  };

  /**
   * El personaje entero: la mancha detrás y la figura encima.
   * @param quien 'kai' o 'luna'
   * @param pose  una clave de POSES
   * @param op    { fondo: 'disco'|'estela'|null, clase: '', mira: 'derecha'|'izquierda' }
   */
  window.ATWI.retrato = function (quien, pose, op) {
    var c = GENTE[quien];
    if (!c || !POSES[pose]) return '';
    op = op || {};
    var fondo = op.fondo === null ? '' : window.ATWI.fondoPersonaje(quien, op.fondo || 'disco');
    var natural = (MIRA[pose] || {})[quien];
    var voltea = op.mira && natural && op.mira !== natural;
    return '<span class="retrato ' + (op.clase || '') + (voltea ? ' retrato--volteado' : '') +
        '" data-quien="' + quien + '">' +
        fondo +
        /* `loading="eager"` a propósito. Estas figuras NACEN FUERA DEL LIENZO
           —entran desde el borde— y con carga diferida el navegador puede no
           bajarlas nunca, porque nunca «entran en vista» a su manera de
           mirarlo. Con una sí y con otra no, que es peor: parece que falta un
           jugador. Son dos imágenes por pantalla, no una lista. */
        '<img class="retrato__fig" src="../assets/img/personajes/' + quien + '-' + pose + '.png" ' +
          'alt="' + esc(c.nombre + ', ' + POSES[pose]) + '" loading="eager" decoding="async">' +
      '</span>';
  };

  /**
   * Deja las poses en la caché antes de que hagan falta. Se llama al abrir la
   * sala: entre eso y el encuentro pasan más de cinco segundos, de sobra para
   * que lleguen, y así la entrada no empieza con una figura a medio pintar.
   */
  window.ATWI.precargarPoses = function (quienes, poses) {
    (quienes || []).forEach(function (q) {
      (poses || []).forEach(function (p) {
        if (!GENTE[q] || !POSES[p]) return;
        var im = new Image();
        im.src = '../assets/img/personajes/' + q + '-' + p + '.png';
      });
    });
  };

  /** Quiénes hay, para pintar el selector de avatar. */
  window.ATWI.quienes = function () {
    return Object.keys(GENTE).map(function (k) {
      return { clave: k, nombre: GENTE[k].nombre, color: GENTE[k].fuerte };
    });
  };

  /** ¿Es una clave de personaje? Sirve para distinguir lo guardado de lo viejo. */
  window.ATWI.esPersonaje = function (quien) { return Object.prototype.hasOwnProperty.call(GENTE, quien); };

  /** El nombre propio, para leerlo en pantalla. */
  window.ATWI.nombrePersonaje = function (quien) { return (GENTE[quien] || GENTE.kai).nombre; };

  /** Su color fuerte. Es el que marca su voz en la sala. */
  window.ATWI.colorPersonaje = function (quien) { return (GENTE[quien] || GENTE.kai).fuerte; };

  /**
   * El OTRO. Con dos personajes esto decide solo, y por eso al invitado local no
   * se le pregunta: si yo soy Kai, él es Luna. Dos fichas iguales no se
   * distinguen en la sala, que es justo para lo que sirven.
   */
  window.ATWI.otroPersonaje = function (quien) { return quien === 'luna' ? 'kai' : 'luna'; };

  /**
   * La ficha redonda: la cara dentro de su disco, con un aro de color alrededor.
   * El color NO es el fondo —el fondo es el tinte del personaje y no se toca—
   * sino el borde: es lo que cada quien elige para distinguir su ficha de la
   * del otro sin tener que cambiar de personaje.
   */
  window.ATWI.fichaHTML = function (quien, clase, borde) {
    if (!window.ATWI.esPersonaje(quien)) quien = 'kai';
    return '<span class="avatar avatar--pj ' + (clase || '') + '"' +
        (borde ? ' style="--borde-ficha:' + esc(borde) + '"' : '') +
        ' data-quien="' + quien + '">' +
        window.ATWI.fondoPersonaje(quien, 'disco') +
        '<img class="retrato__fig" src="../assets/img/personajes/' + quien + '-frente.png" ' +
          'alt="' + esc(GENTE[quien].nombre) + '" loading="lazy" decoding="async">' +
      '</span>';
  };
})();
