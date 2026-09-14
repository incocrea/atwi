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

  /* LOS SEIS. Kai y Luna no son nuevos —son la versión castaña de las láminas
     nuevas— y a su lado entran Nico y Dante, y Nina y Maya. El orden es el de
     la lámina: castaño, afro, rubio. */
  var GENTE = {
    kai: { nombre: 'Kai' },
    nico: { nombre: 'Nico' },
    dante: { nombre: 'Dante' },
    luna: { nombre: 'Luna' },
    nina: { nombre: 'Nina' },
    maya: { nombre: 'Maya' }
  };

  /* EL COLOR ES DEL JUGADOR, NO DEL PERSONAJE, y esto cambió: antes Kai era
     azul y Luna rosa, para siempre, y encima había diez colores de aro que solo
     pintaban el borde del avatar. Ahora hay CUATRO y cada uno es un dibujo
     distinto —la chaqueta y las zapatillas van pintadas en la lámina—, así que
     elegir color elige sprite, y con él el fondo y el borde.

     Los tonos NO están elegidos a ojo: se sacaron de la propia ropa. Se
     compararon las cuatro variantes del mismo personaje píxel a píxel, se
     tomaron los que cambian entre ellas —que son la ropa, porque la piel y el
     pelo no cambian— y de ésos el tono dominante con saturación de verdad. A
     ojo salía el color de la piel, que es lo que más superficie ocupa. */
  var COLORES = {
    azul:     { nombre: 'Azul',     tono: '#0878F8' },
    verde:    { nombre: 'Verde',    tono: '#98D868' },
    amarillo: { nombre: 'Amarillo', tono: '#F8E838' },
    morado:   { nombre: 'Morado',   tono: '#C888F8' }
  };
  var COLOR_DE_SERIE = 'azul';

  function elColor(color) {
    return COLORES[color] ? color : COLOR_DE_SERIE;
  }

  var POSES = {
    frente: 'de frente',      // retrato: avatar del perfil y pantalla de versus
    plante: 'en guardia',     // cuerpo entero, listo para el turno
    hablando: 'hablando',     // mientras graba: la mano y la boca, sin globo
    ganar: 'festejando',      // el resultado, para quien gana
    /* El puño va de UNO EN UNO y no los dos juntos a propósito: en Negociación
       no hay versus sino equipo, y cada uno entra desde su lado hasta chocar en
       el centro. La animación necesita las dos piezas sueltas. En las láminas
       nuevas los seis miran a la derecha, así que a quien va a la derecha de la
       pantalla se le voltea. */
    puno: 'ofreciendo el puño',
    /* SENTADO Y NO «DERROTA». En la lámina vieja esta pose era el consuelo de
       quien perdía; en la nueva la persona está sentada, sonriendo y con la
       mano en la barbilla, que no lee como derrota sino como ESPERANDO. Se la
       llama por lo que se ve, no por dónde se pensaba usarla: para la derrota
       hará falta otra, y quien lea esto dentro de seis meses no tiene por qué
       adivinar que «derrota» era un dibujo contento. */
    sentado: 'esperando'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * Aclara un color hacia el blanco. Se calcula aquí y no con `color-mix` de
   * CSS porque donde no haya soporte el relleno sale inválido y la mancha
   * desaparece sin avisar; esto da un rgb() que entiende cualquier navegador.
   * @param p cuánto blanco lleva, de 0 a 1
   */
  function aclarar(hex, p) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    var v = [0, 2, 4].map(function (i) {
      var n = parseInt(h.substr(i, 2), 16);
      return Math.round(n + (255 - n) * p);
    });
    return 'rgb(' + v.join(',') + ')';
  }

  /**
   * Los dos tonos de la mancha, sacados del color que eligió quien juega. Van
   * muy aclarados a propósito: detrás de la figura, y la figura ya lleva ese
   * mismo color en la ropa. A plena saturación se comerían el dibujo.
   */
  function tonos(color) {
    var t = COLORES[elColor(color)].tono;
    return { tinte: aclarar(t, 0.86), medio: aclarar(t, 0.62) };
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

  /**
   * La mancha de color de un personaje, suelta.
   * @param tipo  'disco' o 'estela'
   * @param color 'azul' | 'verde' | 'amarillo' | 'morado'
   */
  window.ATWI.fondoPersonaje = function (quien, tipo, color) {
    var f = FONDOS[tipo];
    if (!GENTE[quien] || !f) return '';
    return '<svg class="retrato__fondo" viewBox="0 0 100 100" ' +
      'preserveAspectRatio="' + f[1] + '" aria-hidden="true" focusable="false">' +
      f[0](tonos(color)) + '</svg>';
  };

  /* HACIA DÓNDE MIRA CADA POSE. Hace falta para poder ponerlas cara a cara: en
     un encuentro quien va a la izquierda tiene que mirar a la derecha y al
     revés, y si no coincide con cómo se dibujó, la figura se voltea.

     EN LAS LÁMINAS NUEVAS LOS SEIS MIRAN IGUAL. Antes Kai y Luna se dibujaron
     ya enfrentados en la pose del puño; ahora los seis la tienen hacia la
     derecha, así que a quien va a la derecha de la pantalla hay que voltearlo.
     Las demás poses son frontales y no se voltean: `plante` y `hablando` sí
     estaban aquí y se quitaron, porque voltear una figura de frente le da la
     vuelta al logotipo de la camiseta sin ganar nada. */
  var TODOS_A_LA_DERECHA = { kai: 'derecha', nico: 'derecha', dante: 'derecha',
                             luna: 'derecha', nina: 'derecha', maya: 'derecha' };
  var MIRA = {
    puno: TODOS_A_LA_DERECHA,
    /* `plante` TAMBIEN. Estaba fuera y en el versus salian los dos mirando al
       mismo lado, que en una pantalla que dice VS entre ellos se lee raro: uno
       le esta dando la espalda al otro. Volteando al de la derecha se ponen
       cara a cara. El precio es que a esa figura se le invierte el logotipo de
       la camiseta, y a este tamaño no se lee. */
    plante: TODOS_A_LA_DERECHA
  };

  /**
   * El personaje entero: la mancha detrás y la figura encima.
   * @param quien 'kai' o 'luna'
   * @param pose  una clave de POSES
   * @param op    { fondo, clase, mira, color } — `color` es el aro de quien juega
   */
  window.ATWI.retrato = function (quien, pose, op) {
    var c = GENTE[quien];
    if (!c || !POSES[pose]) return '';
    op = op || {};
    var color = elColor(op.color);
    var fondo = op.fondo === null ? ''
      : window.ATWI.fondoPersonaje(quien, op.fondo || 'disco', color);
    var natural = (MIRA[pose] || {})[quien];
    var voltea = op.mira && natural && op.mira !== natural;
    return '<span class="retrato ' + (op.clase || '') + (voltea ? ' retrato--volteado' : '') +
        '" data-quien="' + quien + '" data-pose="' + pose + '">' +
        fondo +
        /* `loading="eager"` a propósito. Estas figuras NACEN FUERA DEL LIENZO
           —entran desde el borde— y con carga diferida el navegador puede no
           bajarlas nunca, porque nunca «entran en vista» a su manera de
           mirarlo. Con una sí y con otra no, que es peor: parece que falta un
           jugador. Son dos imágenes por pantalla, no una lista. */
        marcos(quien, color, pose, esc(c.nombre + ', ' + POSES[pose])) +
      '</span>';
  };

  /** La ruta de una pieza. Todas miden lo mismo —280x400— y la figura va
      apoyada abajo y centrada, así que cambiar de personaje o de color no mueve
      nada dentro del marco. */
  window.ATWI.pieza = function (quien, color, pose) {
    return '../assets/img/personajes/' + quien + '-' + elColor(color) + '-' + pose + '.webp';
  };

  /* CUÁNTOS FOTOGRAMAS TIENE CADA POSE. Ninguna tiene más de uno, y eso es una
     PÉRDIDA respecto a lo que había: la pose de hablar llevaba tres —boca
     abierta, media y cerrada— que se alternaban para animar el habla. Esos tres
     dibujos venían de una lámina de bocas aparte, y esa lámina solo existe para
     el dibujo viejo de Kai y Luna; las láminas nuevas traen UNA sola pose de
     hablar. Hasta que haya bocas nuevas, la figura no mueve los labios: se
     queda quieta mientras suena la voz.

     La buena noticia, para cuando se retome: la boca está en la cara y la cara
     NO cambia con el color, así que probablemente baste una lámina por
     personaje —seis— y no una por personaje y color, que serían veinticuatro. */
  var MARCOS = {};

  function marcos(quien, color, pose, alt) {
    var n = MARCOS[pose] || 1;
    if (n === 1) {
      return '<img class="retrato__fig" src="' + window.ATWI.pieza(quien, color, pose) + '" ' +
             'alt="' + alt + '" loading="eager" decoding="async">';
    }
    var out = '';
    for (var i = 1; i <= n; i++) {
      out += '<img class="retrato__fig" data-marco="' + i + '"' + (i > 1 ? ' hidden' : '') +
             ' src="' + window.ATWI.pieza(quien, color, pose + '-' + i) + '" ' +
             'alt="' + (i === 1 ? alt : '') + '" loading="eager" decoding="async">';
    }
    return out;
  }

  /**
   * LA BOCA. Es la técnica de siempre en animación: dos o tres dibujos de boca
   * que se alternan mientras suena la voz —«lip flap»—, no una boca que se
   * deforma. Aquí van tres y el ciclo es abierta, media, cerrada, media: así el
   * paso de abierta a cerrada no es un salto.
   *
   * 110 ms por fotograma, que son unos nueve por segundo. Más rápido parece
   * nervioso y más lento parece que mastica.
   * @param caja el `.retrato` de quien habla
   * @param habla si está sonando algo ahora mismo
   */
  var latido = null;
  window.ATWI.animarBoca = function (caja, habla) {
    if (latido) { clearInterval(latido); latido = null; }
    if (!caja) return;
    var m = caja.querySelectorAll('[data-marco]');
    if (m.length < 3) return;
    var orden = [0, 1, 2, 1];
    var i = 0;
    function pinta(n) {
      for (var k = 0; k < m.length; k++) m[k].hidden = (k !== n);
    }
    pinta(0);
    if (!habla) return;
    latido = setInterval(function () {
      i = (i + 1) % orden.length;
      pinta(orden[i]);
    }, 110);
  };

  /**
   * Deja las poses en la caché antes de que hagan falta. Se llama al abrir la
   * sala: entre eso y el encuentro pasan más de cinco segundos, de sobra para
   * que lleguen, y así la entrada no empieza con una figura a medio pintar.
   */
  /* DEVUELVE UNA PROMESA, y ese es el punto. Antes disparaba las peticiones y se
     olvidaba: quien la llamaba seguía adelante y la animación de entrada
     empezaba con las figuras a medio bajar. En un teléfono que abre la app por
     primera vez eso se ve fatal —los personajes aparecen a trozos o de golpe a
     mitad del movimiento— y no hay forma de arreglarlo después: una animación
     que ya empezó no se puede volver a empezar sin que se note.

     Espera a que estén DECODIFICADAS, no solo descargadas: una imagen bajada
     pero sin decodificar todavía pinta en blanco el primer fotograma.

     Nunca rechaza y nunca se queda colgada. Si una imagen falla, se sigue: es
     preferible una figura que falta a una partida que no arranca. Y el tope de
     tiempo existe porque en una red mala esto puede tardar lo que quiera, y
     nadie va a mirar una pantalla quieta más de tres segundos. */
  var MS_TOPE_PRECARGA = 3000;

  window.ATWI.precargarPoses = function (quienes, poses, colores) {
    var esperas = [];
    (quienes || []).forEach(function (q, i) {
      (poses || []).forEach(function (p) {
        if (!GENTE[q] || !POSES[p]) return;
        esperas.push(new Promise(function (listo) {
          var im = new Image();
          im.onload = function () {
            if (im.decode) im.decode().then(listo, listo);
            else listo();
          };
          im.onerror = listo;
          /* El color va en paralelo a `quienes`: en la sala cada lado tiene el
             suyo, y bajar la pieza del color equivocado no adelanta nada. */
          im.src = window.ATWI.pieza(q, (colores || [])[i], p);
        }));
      });
    });
    if (!esperas.length) return Promise.resolve();
    return Promise.race([
      Promise.all(esperas),
      new Promise(function (listo) { setTimeout(listo, MS_TOPE_PRECARGA); })
    ]);
  };

  /** Quiénes hay, para pintar el selector de avatar. */
  window.ATWI.quienes = function () {
    return Object.keys(GENTE).map(function (k) {
      return { clave: k, nombre: GENTE[k].nombre };
    });
  };

  /** Los cuatro colores, para pintar el selector. */
  window.ATWI.colores = function () {
    return Object.keys(COLORES).map(function (k) {
      return { clave: k, nombre: COLORES[k].nombre, tono: COLORES[k].tono };
    });
  };

  /** El color válido más cercano. Lo guardado de partidas viejas es un
      hexadecimal de los diez aros que había, y eso ya no apunta a ningún
      dibujo: cae en azul en vez de dejar la figura sin imagen. */
  window.ATWI.elColor = elColor;

  /** ¿Es una clave de personaje? Sirve para distinguir lo guardado de lo viejo. */
  window.ATWI.esPersonaje = function (quien) { return Object.prototype.hasOwnProperty.call(GENTE, quien); };

  /** El nombre propio, para leerlo en pantalla. */
  window.ATWI.nombrePersonaje = function (quien) { return (GENTE[quien] || GENTE.kai).nombre; };

  /** El tono del color con el que juega alguien. Es el que marca su voz en la
      sala, y ya no depende del personaje sino de lo que eligió. */
  window.ATWI.colorPersonaje = function (color) { return COLORES[elColor(color)].tono; };

  /**
   * El OTRO. En la partida local al invitado no se le pregunta: se le da uno
   * distinto del mío, porque dos fichas iguales no se distinguen en la sala y
   * eso es justo para lo que sirven. Con seis ya no hay una única respuesta, así
   * que se coge el siguiente de la lista y se da la vuelta al llegar al final.
   */
  window.ATWI.otroPersonaje = function (quien) {
    var l = Object.keys(GENTE);
    var i = l.indexOf(quien);
    return l[(i < 0 ? 0 : i + 1) % l.length];
  };

  /**
   * La ficha redonda: la cara dentro de su disco, con un aro alrededor. El aro
   * y el disco llevan el color de quien juega —el mismo que la ropa del dibujo—
   * porque desde 2026-09-13 el color no es un adorno aparte: es el sprite.
   */
  window.ATWI.fichaHTML = function (quien, clase, color) {
    if (!window.ATWI.esPersonaje(quien)) quien = 'kai';
    color = elColor(color);
    return '<span class="avatar avatar--pj ' + (clase || '') + '"' +
        ' style="--borde-ficha:' + esc(COLORES[color].tono) + '"' +
        /* Sin `data-color` aqui: el selector de color del perfil escucha ese
           atributo, y ponerlo tambien en la cara hacia que tocar un personaje
           se leyera como tocar un color. La ficha no necesita anunciarlo. */
        ' data-quien="' + quien + '">' +
        window.ATWI.fondoPersonaje(quien, 'disco', color) +
        '<img class="retrato__fig" src="' + window.ATWI.pieza(quien, color, 'frente') + '" ' +
          'alt="' + esc(GENTE[quien].nombre) + '" loading="lazy" decoding="async">' +
      '</span>';
  };
})();
