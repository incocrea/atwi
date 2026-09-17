/* ==========================================================================
   ATWI · app.js
   El caparazón del juego: navegación entre vistas, pintado de cada pantalla y
   el flujo de proponer un debate.

   Dos reglas de producto que este archivo hace cumplir y que no son negociables
   (docs/02-modos-y-catalogo.md):
     1. El modo NO se impone: quien crea el debate lo PROPONE y el invitado lo
        acepta o pide el otro. La interfaz nunca dice «empezar», dice «proponer».
     2. En ningún texto se promete que un tema quede superado ni que un conflicto
        quede resuelto. Hay una lista de palabras prohibidas en §9.4.7.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var datos = window.ATWI.datos;
  var icono = window.ATWI.icono;
  var iconoSVG = window.ATWI.iconoSVG;   // a la fuerza el de línea
  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  var $$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var DESCARGO = cfg.descargo;

  /* El nombre del modo con el «IA» resaltado: negoc·IA·ción, controvers·IA. */
  function nombreModo(clave) {
    var m = cfg.modos[clave];
    if (!m) return '';
    return esc(m.partido[0]) + '<b class="ia">' + esc(m.partido[1]) + '</b>' + esc(m.partido[2]);
  }

  function modoLlano(clave) { return (cfg.modos[clave] || {}).nombre || ''; }

  /* El nombre del modo DIBUJADO: no es el nombre en negrita, es una pieza de
     arte con su placa y sus adornos, de la misma mano que los iconos. Se usa
     donde el nombre es el titular —la carta del home y su explicación—; en
     sitios pequeños sigue mandando el texto, que a ese tamaño se lee mejor. */
  function rotuloModo(clave, clase) {
    return '<img class="' + clase + '" src="../assets/img/rotulos/' + clave + '.png" ' +
           'alt="' + esc(modoLlano(clave)) + '" decoding="async">';
  }
  /* La sala también lo pinta, y no tiene por qué saber dónde viven los PNG. */
  window.ATWI.rotuloModo = rotuloModo;

  /* ======================================================================
     Navegación entre vistas
     ====================================================================== */
  var VISTAS = ['jugar', 'catalogo', 'historial', 'perfil'];
  var vistaActual = 'jugar';

  function irA(nombre) {
    if (VISTAS.indexOf(nombre) === -1) return;
    /* AL ENTRAR AL CATÁLOGO SE BARAJA, y solo al entrar. Rebarajar en cada
       pintada dejaría la lista saltando mientras se escribe en el buscador o se
       toca un filtro, que es lo contrario de poder elegir. */
    if (nombre === 'catalogo' && vistaActual !== 'catalogo') barajar();
    /* Salir de la portada cuesta una entrada de historial: así el atrás del
       teléfono devuelve a la portada en vez de cerrar la app. Saltar entre las
       otras pestañas no apila más, porque desde cualquiera de ellas el atrás
       lleva al mismo sitio. */
    if (vistaActual === 'jugar' && nombre !== 'jugar') entrar();
    vistaActual = nombre;
    $$('.vista').forEach(function (v) {
      if (v.id === 'v-' + nombre) v.setAttribute('data-activa', '');
      else v.removeAttribute('data-activa');
    });
    $$('.barra-item').forEach(function (b) {
      if (b.dataset.vista === nombre) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    var v = $('#v-' + nombre);
    if (v) v.scrollTop = 0;
    /* Cada pantalla inunda el marco con su color. */
    var marco = $('.marco');
    if (marco) marco.setAttribute('data-ctx', nombre);
    refrescarFichaCabecera();
    pintar(nombre);
  }

  /* El atajo al perfil vive en la cabecera, al lado del buzón, salvo en Jugar
     —donde la ficha grande del saludo ya hace de atajo— y en el propio Perfil,
     donde no tendría a dónde llevar. */
  function refrescarFichaCabecera() {
    var b = $('#ficha-cabecera');
    if (!b) return;
    var p = datos.perfil();
    b.hidden = vistaActual === 'perfil' || vistaActual === 'jugar';
    /* CON SU COLOR. Antes daba igual --el color era un aro y esta cara va sin
       aro-- pero ahora el color ES el dibujo: sin pasarlo, quien juega de
       amarillo se ve de azul en su propia cabecera. */
    b.innerHTML = window.ATWI.fichaHTML(p.avatar, 'avatar--cabecera-cara', p.avatarBorde);
  }

  /* ======================================================================
     EL ATRÁS DEL TELÉFONO
     Instalada como PWA, el botón atrás de Android sacaba de la app de golpe,
     tuviera lo que tuviera abierto: un modal a pantalla completa, el catálogo
     dentro de una categoría o una partida a medias. Es la queja más razonable
     que puede tener alguien con un juego instalado.

     Cómo se arregla: cada vez que se abre algo se mete una entrada en el
     historial, y cuando el teléfono va atrás se deshace UN nivel. La cuenta la
     lleva `profundidad`; si llega a cero, ya no hay a dónde volver y el atrás
     sale de la app, que es lo que la gente espera en la portada.

     `retroceder()` no reimplementa nada: pulsa el mismo control de salida que
     ya hay en pantalla. Así el atrás del teléfono hace EXACTAMENTE lo mismo que
     el aspa, incluida la pregunta de «¿seguro que sales de la partida?».
     ====================================================================== */
  var pilaModales = [];
  var profundidad = 0;      // entradas de historial nuestras, sin consumir
  var restaurando = false;  // dentro de retroceder(): no se apila nada

  function apilarPaso() {
    profundidad++;
    try { history.pushState({ atwi: profundidad }, ''); } catch (e) { /* file:// */ }
  }

  function entrar() {
    if (restaurando) return;
    apilarPaso();
  }

  /** Deshace un nivel. Devuelve false si ya no quedaba nada que deshacer. */
  function retroceder() {
    restaurando = true;
    var hecho = true;
    /* LA REVELACIÓN SE RECONOCE POR SU CAJA, no por un botón suyo. Aquí se
       buscaba `[data-accion="ver-desglose"]`, que dejó de existir al partir el
       resultado en dos pantallas, así que el atrás no encontraba nada, seguía
       de largo y acababa saliéndose de `/app/`: se volvía sin `?local=1`, o sea
       a la puerta, y parecía que la app te echaba después de probar un
       resultado. Un selector que nombra un botón concreto se rompe en silencio
       cada vez que ese botón cambia de nombre; la caja no cambia. */
    var revelacion = $('.revelacion:not([hidden])');
    var sala = $('#m-partida');

    if (revelacion) {
      /* Atrás hace lo mismo que «Salir»: la partida ya está guardada. */
      window.ATWI.veredicto.alAtras();
    } else if (sala && !sala.hidden) {
      $('#m-partida [data-accion="p-salir"]').click();
      /* Si dice que no quiere salir, se le devuelve su entrada: la partida
         sigue abierta y el siguiente atrás tiene que volver a preguntar. */
      if (!sala.hidden) apilarPaso();
    } else if (pilaModales.length) {
      ocultarModal(pilaModales[pilaModales.length - 1]);
    } else if (vistaActual === 'catalogo' && categoriaAbierta) {
      categoriaAbierta = null; pintarCatalogo();
    } else if (vistaActual === 'catalogo' && modoPublico) {
      modoPublico = null; categoriaAbierta = null; pintarCatalogo();
    } else if (vistaActual !== 'jugar') {
      irA('jugar');
    } else {
      hecho = false;
    }

    restaurando = false;
    return hecho;
  }

  window.addEventListener('popstate', function () {
    if (profundidad > 0) profundidad--;
    if (!retroceder() && profundidad > 0) {
      /* Quedaban entradas de más —pasa al abrir la sala, que cierra tres
         modales de una vez—. Se consumen solas en vez de tragarse un toque. */
      history.back();
    }
  });

  /* ======================================================================
     Modales a pantalla completa
     ====================================================================== */
  function abrirModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    pilaModales.push(id);
    /* EL ÚLTIMO EN ABRIRSE ES EL QUE SE VE. Sin esto mandaba el orden del HTML,
       y como `m-preparar` está escrito después que `m-perfil`, la ficha del
       invitado se abría DETRÁS de «Antes de empezar»: respondía a los toques
       pero no se veía. El orden de apilado lo decide quien abre, no el archivo. */
    m.style.zIndex = 40 + pilaModales.length;
    var foco = $('.modal__cuerpo', m) || m;
    foco.scrollTop = 0;
    entrar();
  }

  /** Cierra de verdad. Solo lo llama retroceder(), que es quien manda. */
  function ocultarModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = true;
    m.style.zIndex = '';
    pilaModales = pilaModales.filter(function (x) { return x !== id; });
  }

  /**
   * Cerrar DESDE LA INTERFAZ. No oculta: va atrás en el historial, y es el
   * popstate el que cierra. Si no pasara por aquí, la cuenta de entradas se
   * desajustaría y el atrás del teléfono empezaría a tragarse toques.
   */
  function cerrarModal(id) {
    var objetivo = id || pilaModales[pilaModales.length - 1];
    if (!objetivo) return;
    if (profundidad > 0) history.back();
    else ocultarModal(objetivo);
  }

  /** Cierra varios de golpe, como al entrar a la sala. */
  function cerrarModales(ids) {
    ids.forEach(ocultarModal);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pilaModales.length) cerrarModal();
  });

  /* ======================================================================
     Vista: Jugar
     ====================================================================== */
  /* --- Lo que espera a quien entra ------------------------------------------
     ESTO ESTABA EN LA PORTADA Y SE FUE AL BUZÓN (decisión del titular,
     2026-09-15). Era una tarjeta grande encima del selector de modo que decía
     «Tu resultado está listo», y tenía dos problemas: se comía el sitio de lo
     que la pantalla viene a ofrecer —elegir modo y jugar— y duplicaba en la
     portada algo que ya tiene su sitio, que es la campana.

     Ahora la campana late cuando hay algo, y al abrirla está esto arriba.
     **No se borró el aviso: se mudó.** Quitarlo sin más habría dejado un
     resultado sin ver sin ninguna forma de enterarse, porque estos tres estados
     NO están en la tabla `avisos` —los calcula el cliente mirando el historial—
     y el buzón solo leía esa tabla. */
  var LO_QUE_ESPERA = {
    'sin-ver':         ['Tu resultado está listo', 'premio', 'Tocá para verlo'],
    'falta-veredicto': ['Falta el resultado', 'curso', 'Tocá para pedirlo otra vez'],
    'en-curso':        ['Partida sin terminar', 'curso', '']
  };

  /** Las partidas que piden algo, en orden de prisa. */
  function partidasQueEsperan() {
    var lista = historial || [];
    var fuera = [];
    ['sin-ver', 'falta-veredicto', 'en-curso'].forEach(function (e) {
      lista.forEach(function (d) { if (estadoDe(d) === e) fuera.push(d); });
    });
    return fuera;
  }

  function filaQueEspera(d) {
    var e = estadoDe(d);
    var q = LO_QUE_ESPERA[e] || ['', 'curso', ''];
    var pie = e === 'en-curso'
      ? (d.turnos_grabados || []).length + ' de ' + ((d.turnos || 3) * 2) +
        ' intervenciones · tocá para seguir'
      : q[2];
    return '<button class="tarjeta aviso-veredicto" data-tono="' + q[1] + '" ' +
        'data-partida="' + esc(d.id) + '">' +
        '<span class="aviso-veredicto__eti">' + esc(q[0]) + '</span>' +
        '<span class="aviso-veredicto__tema">' + esc(d.enunciado || 'Sin tema') + '</span>' +
        quienesJugaron(d) +
        '<span class="chico suave">' + esc(pie) + '</span>' +
      '</button>';
  }

  function pintarJugar() {
    var p = datos.perfil();
    var caja = $('#v-jugar');

    caja.innerHTML =
      /* La ficha del saludo ES el atajo al perfil: es lo más grande de la
         pantalla y es donde la mano va a buscarse a sí misma. */
      '<div class="saludo">' +
        '<button class="avatar-boton" data-vista="perfil" aria-label="Tu perfil">' +
          avatarHTML(p) + '</button>' +
        '<div class="saludo__datos">' +
          '<h1 class="saludo__hola">' + (p.nombre ? '¡Hola, ' + esc(p.nombre) + '!' : '¡Hola!') + '</h1>' +
          '<p class="chico suave">Nivel ' + p.nivel + ' · ' + p.puntos + ' de ' + p.puntosNivel + ' puntos</p>' +
          '<div class="nivel-barra"><i style="width:' + Math.min(100, Math.round(p.puntos / p.puntosNivel * 100)) + '%"></i></div>' +
        '</div>' +
      '</div>' +

      /* EL VEREDICTO QUE TE ESTÁ ESPERANDO, delante de todo. Quien cerró la app
         mientras el juez leía no tiene por qué acordarse de ir al historial a
         buscarlo: si hay un resultado sin ver, lo primero que ve al entrar es
         que está ahí, y un toque lo abre con la ceremonia entera.
         MIENTRAS NO HAYA AVISO QUE LLEGUE DE FUERA, ÉSTA ES LA NOTIFICACIÓN.
         El titular eligió empezar solo por dentro de la app (2026-09-15), así
         que este es el único sitio donde eso se anuncia. */

      /* EL MODO SE ELIGE AQUÍ, AL PRINCIPIO. Antes se elegía al final, justo
         antes de grabar, después de haber buscado el tema: para entonces ya
         tenías medio pie dentro y la elección llegaba como un trámite. Y la
         explicación de cada modo vivía en otra tarjeta, de adorno, que nadie
         relacionaba con el botón. Ahora es una sola cosa: la tarjeta explica y
         la tarjeta empieza. */
      /* SIN TÍTULO ENCIMA (titular, 2026-09-16). Decía «Selecciona el modo» y
         es lo único que hay en esa parte de la portada: tres cartas grandes,
         cada una con su nombre dibujado y un botón de ayuda. Un rótulo que
         describe lo que ya se ve gasta el alto que necesitan las cartas. */
      '<div class="cartas-modo">' +
        cartaModo('debate') +
        cartaModo('negociacion') +
        cartaModo('competencia') +
      '</div>' +

      /* EN EL HOME EL AVISO NO LLEVA TARJETA. Detrás hay un fondo dibujado, y
         una caja lavanda encima lo tapaba justo en el tercio de abajo. Sin caja
         el fondo se ve entero y el texto se sostiene con una sombra blanca
         suave, que es lo que lo despega sin poner una pared. En las otras
         pantallas el aviso sí lleva su caja: ahí el fondo es liso. */
      '<div class="aviso-ia aviso-ia--desnudo" style="margin-top:var(--e-5)">' +
        iconoSVG('aviso', 20) +
        '<span>' + DESCARGO + '</span>' +
      '</div>' +

      /* EL PROBADOR, Y SOLO PARA QUIEN PUEDE VERLO. Aquí había cinco botones
         sueltos, uno por caso, con todo lo demás cerrado: el juez salía por
         sorteo, los personajes del perfil y el texto era siempre el mismo. Para
         mirar una escena concreta —este juez, estos dos, este final— no había
         forma. El botón abre una pantalla donde la escena se arma a mano. */
      (puedeProbar()
        ? '<h2 style="margin:var(--e-6) 0 var(--e-3)">Solo para vos</h2>' +
          '<button class="boton boton--suave boton--bloque" data-accion="probador">' +
            'Probador de resultados</button>'
        : '');
  }

  /* ========================================================================
     EL PROBADOR DE RESULTADOS
     Arma la escena del veredicto a mano y la reproduce: modo, cómo termina,
     qué juez la presenta y las dos fichas con su nombre, su personaje y su
     color. Existe para poder mirar la pantalla del resultado sin jugar una
     partida entera ni gastar un veredicto de verdad, que cuesta 0,19 USD y
     ochenta segundos.

     LO QUE SE ELIGE ES LA ESCENA; EL TEXTO SIGUE SIENDO DE MENTIRA. Las
     justificaciones, los números de la rúbrica y el acuerdo son fijos y salen
     de la partida de prueba que ya se juzgó (eccb39ff), así que son plausibles
     y no redondos. Lo que se prueba aquí es el ENCUADRE —dónde cae cada figura,
     qué tapa qué, cómo queda un nombre largo— y para eso el texto da igual con
     tal de que tenga el largo de uno real.

     QUIÉN LO VE: la cuenta del titular, por correo, y el modo de pruebas. Lo
     segundo no es una puerta abierta —`dePruebas()` exige localhost ADEMÁS de
     `?local=1`, así que en atwi.app no existe— y hace falta: en local no hay
     sesión, o sea que no hay correo que comparar, y sin esto el probador sería
     invisible justo donde se prueba.
     ======================================================================== */
  var SUPER_ADMIN = 'leoncitobravo2013@gmail.com';

  function puedeProbar() {
    var ent = window.ATWI.entrada;
    if (ent && ent.dePruebas && ent.dePruebas()) return true;
    var correo = window.ATWI.auth ? window.ATWI.auth.correo() : '';
    return String(correo).trim().toLowerCase() === SUPER_ADMIN;
  }

  /* LOS FINALES POSIBLES, por modo. No es una lista de adorno: es la lista
     REAL de lo que el árbitro puede devolver, y por eso Controversia tiene
     cuatro y Negociación dos. El día que aparezca un final nuevo se agrega
     aquí y el probador ya sabe reproducirlo. */
  var FINALES = {
    debate: [
      { clave: 'gana-1', nombre: 'Gana el de la izquierda' },
      { clave: 'gana-2', nombre: 'Gana el de la derecha' },
      { clave: 'empate', nombre: 'Empate' },
      /* LAS DOS PARADAS SON PANTALLAS DISTINTAS y hasta hoy solo se podia mirar
         una. La blanda es asimetria --la ronda no tuvo partido-- y lleva su
         reporte; la dura es senal de seguridad y no lleva NINGUN registro. */
      { clave: 'parada', nombre: 'Para: no hubo partido' },
      { clave: 'parada-dura', nombre: 'Para por seguridad' }
    ],
    /* NEGOCIACIÓN TIENE DOS FINALES Y NO TRES. Hubo un «Sin mediador (hoy)»
       aquí —descuido de cuando Negociación no tenía más final que ése— y
       después la pantalla a la que llevaba, «Ronda guardada», se quitó entera
       (decisión del titular, 2026-09-15): una llamada que no contesta no
       termina la partida, la deja esperando. Los finales de un modo son los
       desenlaces que la pareja puede alcanzar; una avería no es uno. */
    negociacion: [
      { clave: 'acuerdo', nombre: 'Con acuerdo' },
      { clave: 'sin-acuerdo', nombre: 'Sin acuerdo' }
    ]
  };

  /* EL ÚLTIMO SET SE RECUERDA, Y SOBREVIVE AL REFRESCO (decisión del titular,
     2026-09-14). Ajustar un encuadre es cambiar una cosa, mirar, recargar para
     ver el CSS nuevo y volver a mirar: si al recargar se pierden el juez, los
     dos personajes y el final elegidos, cada vuelta cuesta ocho toques de
     rearmar la escena, y el trabajo pasa a ser rearmarla. */
  var CLAVE_PROBADOR = 'atwi.probador.v1';
  /* QUÉ CONTESTA EL MODELO, que es otra cosa que «cómo termina». «Cómo termina»
     es la escena del final; esto es lo que devuelve la llamada, y de ello salen
     caminos que la pareja recorre de otra manera. Solo lo usa el ensayo, que
     arranca en el instante en que se mandó la última intervención (petición del
     titular, 2026-09-15).

     CADA MODO TIENE SU LISTA porque no contestan lo mismo: el árbitro puntúa y
     el mediador propone. Lo único que comparten es poder pararse por seguridad
     y poder no contestar, que son los dos fallos del sistema y no del juego. */
  var CONTESTA = {
    debate: [
      { clave: 'gana', nombre: 'Gana uno' },
      { clave: 'empate', nombre: 'Empate' },
      { clave: 'parada', nombre: 'Para: no hubo partido' },
      { clave: 'parada-dura', nombre: 'Para por seguridad' },
      { clave: 'no-contesta', nombre: 'No llega respuesta' }
    ],
    negociacion: [
      { clave: 'dos', nombre: 'Propone dos acuerdos' },
      { clave: 'sin-propuestas', nombre: 'No encuentra ninguno' },
      { clave: 'parada', nombre: 'Para por seguridad' },
      { clave: 'no-contesta', nombre: 'No llega respuesta' }
    ]
  };

  var probador = null;

  function probadorDeFabrica() {
    var p = datos.perfil();
    return {
      modo: 'debate',
      final: 'gana-2',
      contesta: { debate: 'gana', negociacion: 'dos' },
      juez: juezPorDefecto(),
      publico: 'pareja',
      uno: { nombre: p.nombre || 'Tú', avatar: p.avatar || 'kai',
             color: window.ATWI.elColor(p.avatarBorde) },
      dos: { nombre: 'Diana', avatar: distintoDeMi(p.avatar), color: 'verde' }
    };
  }

  /* LO GUARDADO NO SE CREE, SE REVISA CAMPO A CAMPO. Lo que hay en
     `localStorage` puede ser de una versión anterior: un personaje que se
     renombró, un juez que no existe, o —el más fácil de provocar— un `final`
     que era de Controversia guardado junto a un `modo` que ahora es Negociación.
     Cualquiera de esos deja la pantalla a medio pintar o revienta al reproducir,
     y el fallo aparecería días después sin nada que lo relacione con esto. Cada
     campo que no se reconozca cae en el de fábrica, que siempre es válido. */
  function enLista(lista, valor, porDefecto) {
    return lista.some(function (x) { return x.clave === valor; }) ? valor : porDefecto;
  }

  function probadorSaneado(e) {
    var base = probadorDeFabrica();
    if (!e || typeof e !== 'object') return base;
    var ficha = function (q, porDefecto) {
      q = q || {};
      return {
        nombre: typeof q.nombre === 'string' ? q.nombre.slice(0, datos.NOMBRE_MAX)
                                             : porDefecto.nombre,
        avatar: window.ATWI.esPersonaje(q.avatar) ? q.avatar : porDefecto.avatar,
        /* `elColor` ya devuelve el de serie si no lo reconoce. */
        color: window.ATWI.elColor(q.color)
      };
    };
    var s = {
      modo: FINALES[e.modo] ? e.modo : base.modo,
      publico: MESAS_PROBADOR.some(function (m) { return m.clave === e.publico; })
        ? e.publico : base.publico,
      juez: window.ATWI.esJuez(e.juez) ? e.juez : base.juez,
      /* UNA RESPUESTA POR MODO, no una sola compartida: «gana» no existe en
         Negociación ni «dos» en Controversia, así que con una sola cambiar de
         modo dejaba elegida una respuesta imposible. */
      contesta: {
        debate: enLista(CONTESTA.debate, (e.contesta || {}).debate, base.contesta.debate),
        negociacion: enLista(CONTESTA.negociacion, (e.contesta || {}).negociacion,
                             base.contesta.negociacion)
      },
      uno: ficha(e.uno, base.uno),
      dos: ficha(e.dos, base.dos)
    };
    /* El final se valida CONTRA EL MODO ya saneado, no contra la lista entera. */
    var finales = FINALES[s.modo].map(function (f) { return f.clave; });
    s.final = finales.indexOf(e.final) !== -1 ? e.final : finales[0];
    return s;
  }

  function estadoProbador() {
    if (probador) return probador;
    var crudo = null;
    try { crudo = JSON.parse(localStorage.getItem(CLAVE_PROBADOR) || 'null'); }
    catch (e) { crudo = null; }
    probador = probadorSaneado(crudo);
    return probador;
  }

  function guardarProbador() {
    try { localStorage.setItem(CLAVE_PROBADOR, JSON.stringify(probador)); }
    catch (e) { /* modo incógnito */ }
  }

  /* CON QUIÉN SE JUEGA, EN EL PROBADOR. Los nombres van sin el «Con» de las
     cartas del catálogo: aquí son tres opciones en una fila de chips, no tres
     cartas, y el «Con mi pareja» repetido tres veces no cabe ni hace falta. */
  var MESAS_PROBADOR = [
    { clave: 'pareja', nombre: 'Pareja' },
    { clave: 'amigos', nombre: 'Amigos' },
    { clave: 'familia', nombre: 'Familia' }
  ];

  function chipsProbador(campo, opciones, puesto) {
    return '<div class="filtros">' + opciones.map(function (o) {
      return '<button type="button" class="chip chip--filtro" data-pb="' + campo + '" ' +
        'data-val="' + o.clave + '"' + (o.clave === puesto ? ' aria-pressed="true"' : '') +
        '>' + esc(o.nombre) + '</button>';
    }).join('') + '</div>';
  }

  /* UNA FICHA DEL PROBADOR. Es el mismo trío que el perfil —nombre, cara,
     color— pero sin veto: aquí se puede poner a los dos iguales a propósito,
     que es justamente uno de los casos que hay que poder mirar. */
  function fichaProbador(cual, q, titulo) {
    return '<div class="pb-ficha">' +
      '<span class="pb-ficha__t">' + esc(titulo) + '</span>' +
      '<input class="campo" data-pb-nombre="' + cual + '" type="text" ' +
        'maxlength="' + datos.NOMBRE_MAX + '" placeholder="Nombre" ' +
        'value="' + esc(q.nombre) + '">' +
      '<div class="pb-caras">' +
        window.ATWI.quienes().map(function (x) {
          return '<button type="button" class="pb-cara" data-pb-cara="' + cual + '" ' +
            'data-val="' + x.clave + '"' +
            (x.clave === q.avatar ? ' aria-pressed="true"' : '') +
            ' aria-label="' + esc(x.nombre) + '" title="' + esc(x.nombre) + '">' +
            window.ATWI.fichaHTML(x.clave, 'pb-cara__f', q.color) +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="colores">' +
        window.ATWI.colores().map(function (c) {
          return '<button type="button" class="color" data-pb-color="' + cual + '" ' +
            'data-val="' + c.clave + '"' +
            (c.clave === q.color ? ' aria-pressed="true"' : '') +
            ' aria-label="' + esc(c.nombre) + '"><i style="background:' + c.tono + '"></i>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function cuerpoProbador() {
    var e = estadoProbador();
    return '<div class="apilado">' +
      '<div><span class="pb-ficha__t">El modo</span>' +
        chipsProbador('modo', [{ clave: 'debate', nombre: 'Controversia' },
                               { clave: 'negociacion', nombre: 'Negociación' }], e.modo) +
      '</div>' +

      '<div><span class="pb-ficha__t">Cómo termina</span>' +
        chipsProbador('final', FINALES[e.modo], e.final) +
      '</div>' +

      /* Y EL CONTROL VOLVIÓ, que es lo que decía aquí que pasaría. Se había
         quitado el 2026-09-14 porque no cambiaba nada de lo que esta pantalla
         sirve para mirar —`publico` solo lo leía `ganadorNegociacion[publico]`,
         y las dos ramas daban el mismo texto—, con la nota de que volvería el
         día que las mesas dijeran cosas distintas. Ese día es hoy: **el
         estallido del encuentro lleva el color de la mesa**, así que con este
         chip se miran los tres sin cambiar de partida. Son tres y ya no dos:
         Familia llegó el 2026-09-16. */
      '<div><span class="pb-ficha__t">Con quién se juega</span>' +
        '<p class="chico tenue" style="margin:2px 0 6px">Tiñe el VS y el choque ' +
          'de puños de «Reproducir la entrada».</p>' +
        chipsProbador('publico', MESAS_PROBADOR, e.publico) +
      '</div>' +

      /* LA NOTA VA ENCIMA DE LAS FICHAS (ajuste del titular, 2026-09-15). Debajo
         se leía como un pie de página de algo que ya se había tocado: cuando
         llegabas a ella ya habías elegido. Arriba dice para qué sirve el control
         ANTES de usarlo, que es cuando sirve de algo. */
      '<div><span class="pb-ficha__t">Qué contesta ' +
        (e.modo === 'negociacion' ? 'el mediador' : 'el juez') + '</span>' +
        '<p class="chico tenue" style="margin:2px 0 6px">Solo para «Reproducir fin ' +
          'de ronda», que arranca al mandar la última intervención.</p>' +
        chipsProbador('contesta', CONTESTA[e.modo], e.contesta[e.modo]) +
      '</div>' +

      '<div><span class="pb-ficha__t">Quién lo presenta</span>' +
        '<div class="jueces-rejilla" style="margin-top:var(--e-2)">' +
          window.ATWI.jueces().map(function (q) {
            return '<button type="button" class="juez-ficha' +
              (e.juez === q.clave ? ' juez-ficha--puesta' : '') + '" ' +
              'data-pb-juez="' + q.clave + '">' +
              window.ATWI.fichaJuezHTML(q.clave) +
              '<span class="juez-ficha__n">' + esc(q.nombre) + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      fichaProbador('uno', e.uno, 'La ficha de la izquierda') +
      fichaProbador('dos', e.dos, 'La ficha de la derecha') +

      '<p class="chico tenue">El texto del veredicto —las justificaciones, los ' +
        'números y el acuerdo— es siempre el mismo y es de mentira. Lo que cambia ' +
        'aquí es la escena.</p>' +
    '</div>';
  }

  /* TRES PROPUESTAS DE MENTIRA, con la forma de las de verdad: texto y las dos
     anclas. Las anclas son lo que hace comprobable el anclaje bilateral --cada
     propuesta tiene que apoyarse en algo que dijo CADA uno-- así que si aquí
     faltaran, la pantalla se vería bien en el ensayo y rota con el mediador. */
  /* DOS PROPUESTAS DE MENTIRA, con la forma de las de verdad: texto y las dos
     anclas. Las anclas son lo que hace comprobable el anclaje bilateral --cada
     propuesta tiene que apoyarse en algo que dijo CADA uno-- así que si aquí
     faltaran, la pantalla se vería bien en el ensayo y rota con el mediador.
     `--mirar` de la votación: poner la lista en vacío ensaya la otra salida, la
     de «no hay acuerdo que proponerles». */
  var PROPUESTAS_DE_MENTIRA = [
    { texto: 'Los platos se lavan antes de dormir, los lave quien los lave, y el que ' +
             'cocinó esa noche no lava.',
      recogeUno: 'Vos dijiste que no querés levantarte con la cocina sucia.',
      recogeDos: 'Vos dijiste que cocinar ya es tu parte del trabajo.' },
    { texto: 'Si cenamos después de las diez, quedan en remojo y se lavan a la mañana ' +
             'siguiente antes del café.',
      recogeUno: 'Vos dijiste que a esa hora ya no te da la cabeza.',
      recogeDos: 'Vos dijiste que lo que te molesta es encontrarlos al día siguiente.' }
  ];

  /* LO QUE LOS DOS ENSAYOS NECESITAN. Quién juega, en qué modo y con qué juez:
     es lo único del probador que la sala mira, y lo miran los dos igual. */
  function mesaDelProbador() {
    var e = estadoProbador();
    var ficha = function (q, porDefecto) {
      return { nombre: (q.nombre || '').trim() || porDefecto,
               avatar: q.avatar, color: q.color };
    };
    return { quien: [ficha(e.uno, 'Tú'), ficha(e.dos, 'La otra parte')],
             modo: e.modo, juez: e.juez, publico: e.publico };
  }

  /* EL SORTEO Y LA CORTINILLA, sin montar una partida (titular, 2026-09-16).
     El modo manda también aquí: en Controversia los dos se plantan y cae el VS,
     en Pacto siguen hasta chocar el puño. O sea que las dos escenas se miran
     con el mismo selector de arriba, sin tocar nada más. */
  function ensayarLaEntrada() {
    cerrarModales(['m-probador']);
    window.ATWI.partida.ensayarLaEntrada(mesaDelProbador());
  }

  function ensayarDesdeElFinal() {
    var e = estadoProbador();
    var mesa = mesaDelProbador();
    /* `cerrarModales` Y NO `cerrarModal`, que es lo que hace la partida de
       verdad al entrar en la sala. La diferencia no es de estilo: `cerrarModal`
       cierra PIDIENDO UN ATRÁS, y el atrás es asíncrono --pasa por `popstate`--
       así que la sala se abría antes de que el probador se fuera. Y como
       `m-partida` no pasa por `abrirModal`, se queda en el z-index 40 de serie
       mientras el probador estaba en 41: la sala quedaba debajo, invisible.
       Peor todavía, cuando el `popstate` llegaba, `retroceder()` ya veía la sala
       abierta y se iba por la rama de «¿seguro que salís de la partida?». */
    cerrarModales(['m-probador']);
    mesa.contesta = e.contesta[e.modo];
    mesa.propuestas = PROPUESTAS_DE_MENTIRA;
    window.ATWI.partida.ensayarDesdeElFinal(mesa);
  }

  function abrirProbador() {
    estadoProbador();
    repintarProbador();
    abrirModal('m-probador');
  }

  /* Repinta el cuerpo entero, y puede: aquí no hay nada a medio escribir que
     se pueda perder salvo los dos nombres, y esos se guardan en el estado a
     cada tecla.

     Y GUARDA. Toda la pantalla cambia el estado y después repinta, así que este
     es el único sitio por el que pasan TODOS los cambios menos uno —el nombre,
     que a propósito no repinta para no perder el foco— y ese guarda por su
     cuenta. Poner el guardado en cada manejador sería cuatro sitios donde
     olvidarse de uno. */
  function repintarProbador() {
    var m = $('#m-probador');
    if (!m) return;
    guardarProbador();
    m.className = 'modal modal--' + estadoProbador().modo;
    $('#m-probador .modal__cuerpo').innerHTML = cuerpoProbador();
    /* El ensayo vale para los dos modos: en Controversia recorre la
       deliberación y el veredicto, en Negociación la elección y la firma. */
    var votar = $('#pb-votar');
    if (votar) votar.hidden = false;
  }

  /* UN VEREDICTO DE MENTIRA, CON TODOS SUS CAMPOS. Existe para poder mirar la
     pantalla del resultado sin jugar una partida entera ni gastar un veredicto
     de verdad, que cuesta 0,19 USD y ochenta segundos.

     LLEVA LOS CAMPOS DEL ÁRBITRO DE VERDAD --`loMejor`, `justificacion`,
     `desglose` con su rúbrica de cinco criterios, `duelo` con las dos fichas y
     `juez`-- porque si trajera menos, la pantalla se vería bien aquí y rota con
     un veredicto real. Los números salen de la partida de prueba que ya se
     juzgó (eccb39ff), así que son plausibles y no redondos.

     `simulado` va en FALSO a propósito, aunque esto sea lo más simulado que
     hay: ese aviso dice «el juez no está conectado y esto salió de un sorteo»,
     y aquí lo que se está mirando es justamente cómo queda un veredicto que sí
     vino del juez. Para ver el otro aviso está el botón de la partida real sin
     servidor. */
  function veredictoDeMentira() {
    var e = estadoProbador();
    var uno = { nombre: (e.uno.nombre || '').trim() || 'Tú',
                avatar: e.uno.avatar, color: e.uno.color };
    var dos = { nombre: (e.dos.nombre || '').trim() || 'La otra persona',
                avatar: e.dos.avatar, color: e.dos.color };
    var r = {
      simulado: false, modo: e.modo, publico: e.publico, tema: 'La manta',
      juez: e.juez || juezPorDefecto(),
      duelo: [{ nombre: uno.nombre, avatar: uno.avatar, color: uno.color, gano: false },
              { nombre: dos.nombre, avatar: dos.avatar, color: dos.color, gano: false }],
      /* No hay nada que hacer al cerrar: el probador sigue abierto DEBAJO —la
         revelación va a z-index 60 y un modal a 41— así que al salir de la
         explicación se vuelve a él sin reabrir nada. Reabrirlo aquí sería
         además pelearse con el historial: esto corre dentro del `popstate`. */
      alCerrar: function () {}
    };

    /* NEGOCIACIÓN: los dos igual. Con acuerdo ganan los dos --aquí ganar es de
       los dos o no es de nadie-- y sin acuerdo los dos sentados, que no es
       derrota de nadie contra nadie sino que hoy no salió. */
    if (e.final === 'acuerdo' || e.final === 'sin-acuerdo') {
      r.tema = 'los platos';
      var hay = e.final === 'acuerdo';
      r.duelo[0].gano = r.duelo[1].gano = hay;
      r.acuerdo = hay
        ? 'Si cenamos después de las diez, los platos se quedan en remojo y se lavan a ' +
          'la mañana siguiente antes del café.'
        : null;
      return r;
    }

    if (e.final === 'parada' || e.final === 'parada-dura') {
      /* Sin puntuación y sin ganador: en esa rama el juez no puntúa nada, así
         que un `desglose` de mentira aquí enseñaría algo que nunca existe. */
      r.sinResultado = e.final === 'parada-dura' ? 'dura' : 'blanda';
      /* LA DURA NO TRAE «LO QUE DIJO CADA UNO» y no es un descuido: `docs/02`
         §578 dice «ningún registro». El probador tiene que enseñar la pantalla
         que la partida de verdad puede enseñar, no una parecida. */
      if (e.final === 'parada-dura') return r;
      r.loQueDijo = [
        { nombre: uno.nombre, texto: 'Habló de que gastar de más cuando hay gente le deja ' +
          'una sensación que le dura, y de que a veces siente que se gasta por la situación.' },
        { nombre: dos.nombre, texto: 'Sostuvo que con gente delante se gasta lo que ' +
          'corresponde, y que lo que representan fuera de casa importa.' }
      ];
      return r;
    }

    /* LA RÚBRICA FLOJA Y LA BUENA, y quien gana se lleva la buena. Con el
       empate las dos quedan a un punto, que es como se ve de verdad un empate:
       no dos columnas idénticas --eso no pasa nunca-- sino una diferencia que
       no llega al umbral. */
    var floja = { pertinencia: 78, solidez: 67, evidencia: 34, escucha: 52, tono: 90, total: 63.6 };
    var buena = e.final === 'empate'
      ? { pertinencia: 78, solidez: 68, evidencia: 33, escucha: 59, tono: 90, total: 64.6 }
      : { pertinencia: 80, solidez: 74, evidencia: 66, escucha: 71, tono: 90, total: 74.2 };
    var gana1 = e.final === 'gana-1';
    r.desglose = { criterios: 5, personas: [
      { nombre: uno.nombre, color: uno.color, rubrica: gana1 ? buena : floja },
      { nombre: dos.nombre, color: dos.color, rubrica: gana1 ? floja : buena }
    ] };
    r.loMejor = [
      { nombre: uno.nombre, texto: 'Sostuvo que el problema es el tamaño de la manta y no ' +
        'el número, y lo apoyó en algo que ya habían probado juntos.' },
      { nombre: dos.nombre, texto: 'Marcó que lo que la despierta es el movimiento y no la ' +
        'tela, y ofreció una prueba con plazo para comprobarlo.' }
    ];

    if (e.final === 'empate') {
      r.empate = true;
      r.motivoEmpate = 'parejo';
      r.justificacion = 'La pertinencia fue pareja: las dos respuestas se ajustaron al ' +
        'enunciado. En solidez, cada postura trajo una razón identificable. La evidencia ' +
        'concreta fue escasa en los dos casos, y eso dejó la diferencia bajo el umbral.';
      return r;
    }

    r.ganador = gana1 ? uno.nombre : dos.nombre;
    r.duelo[gana1 ? 0 : 1].gano = true;
    r.justificacion = 'La evidencia concreta inclinó el resultado: dos ocasiones frente a ' +
      'ninguna. En pertinencia quedaron parejas. La escucha sumó del lado que marcó el ' +
      'punto exacto de desacuerdo.';
    return r;
  }

  /* La carta de un modo: nombre, icono y dos salidas. NADA MÁS.
     La explicación se fue a su propio modal. En la carta ocupaba cinco
     renglones de letra pequeña que hay que leer para decidir, y quien ya sabe
     de qué va —o sea, a partir de la segunda partida— tenía que saltárselos
     cada vez para llegar al botón. Ahora la portada se lee de un vistazo y la
     explicación está a un toque de quien la necesite. */
  /* LAS DOS CARTAS VAN LADO A LADO Y EN COLUMNA (mockup del titular,
     2026-09-16). Estaban de lado —dibujo a la izquierda, botones a la derecha—
     y apiladas una sobre otra. La forma nueva es la de una carta de juego:
     dibujo arriba, una línea de qué se hace, las dos salidas abajo con su
     palabra, y una franja al pie. Lo que se gana es que los dos modos se ven
     a la vez y se comparan sin scroll, que es la decisión que pide la pantalla.

     Y LOS SIGNOS VUELVEN A TENER PALABRA. La quitaron porque al apilarse no
     cabía --«Explícame» partía en dos renglones--; en columna y con la carta a
     media pantalla sí cabe, y debajo del signo en vez de al lado. El signo
     sigue haciendo el trabajo de reconocerse a distancia y la palabra quita la
     duda de qué pasa al tocarlo, que en el teléfono no se puede resolver
     pasando el cursor por encima. */
  /* LA CARTA ENTERA ES EL BOTÓN DE JUGAR (titular, 2026-09-16), y el signo de
     ayuda es lo único que se toca aparte. El play se va: eran dos dianas
     compitiendo en una carta de 166 px, y la de verdad —«quiero este modo»— es
     la carta, que es lo que la mano va a tocar de todas formas.

     DOS BOTONES HERMANOS Y NO UNO DENTRO DE OTRO. Un `<button>` dentro de otro
     `<button>` no es HTML válido y el navegador lo desarma; con `role="button"`
     sobre un div habría que escribir a mano el Enter y el Espacio. Así que la
     carta es un botón de verdad y el de ayuda va a su lado, colocado encima con
     posición absoluta: los dos se tabulan, los dos se pulsan con teclado y no
     hay nada que emular.

     Y EL ORDEN DE LOS MANEJADORES YA RESOLVÍA EL SOLAPE: `data-explicar` se
     mira antes que `data-crear` y corta con `return`, así que tocar la ayuda no
     dispara además la carta. */
  /* LA CARTA DE MODO ES UNA FILA (mockup del titular, 2026-09-16), y esto revoca
     lo de ponerlas lado a lado que este archivo defendía hace unas horas.

     POR QUÉ CAMBIA EL ARGUMENTO. Apiladas se decía que «no se comparan, se lee
     una, se baja y se lee la otra», y eso valía con DOS cartas verticales de
     media pantalla. Con TRES, en columnas de 110 px, lo que no cabe es el
     nombre del modo: quedaba el rótulo dibujado y dos renglones apretados. En
     fila cabe el nombre escrito AL LADO del rótulo, que es lo que de verdad
     dice a qué se juega, y las tres se abarcan de una mirada igual: son tres
     renglones, no tres pantallas.

     TRES COLUMNAS DENTRO: el rótulo dibujado, el texto y el disco de ayuda.
     El disco es un botón hermano y no va dentro —un `<button>` dentro de otro
     no es HTML válido y el navegador lo desarma—, así que se coloca encima con
     posición absoluta y la carta le reserva el sitio con su `padding-right`. */
  function cartaModo(clave) {
    var m = cfg.modos[clave] || {};
    return '<div class="carta-modo-caja">' +
        '<button class="carta-modo carta-modo--' + clave + '" data-crear="' + clave + '" ' +
                'aria-label="Jugar a ' + esc(modoLlano(clave)) + '">' +
          rotuloModo(clave, 'carta-modo__rotulo') +
          /* SIN EL NOMBRE ESCRITO (titular, 2026-09-16): el rótulo dibujado ya
             dice «Controversia», y ponerlo otra vez al lado en letra normal era
             decir dos veces lo mismo en la misma fila. Queda la línea de qué se
             juega, que es lo único que el dibujo no puede decir. */
          (m.gancho ? '<span class="carta-modo__gancho">' + esc(m.gancho) + '</span>' : '') +
          /* El zócalo dibujado del pie: globos de diálogo en Juicio, brotes en
             Pacto, estrellas en QuiénGane. Va fuera del flujo y por detrás; el
             hueco se lo hace el `padding-bottom` de la carta. */
          '<img class="carta-modo__base" src="../assets/img/iconos/base-' + clave + '.png" ' +
            'alt="" aria-hidden="true" loading="lazy" decoding="async">' +
        '</button>' +
        /* EL SIGNO SE QUEDA, y sin palabra: una interrogación no hay que
           traducirla. El nombre va en `aria-label` —que es lo que anuncia un
           lector de pantalla— y en `title` para el escritorio. */
        '<button class="carta-modo__explica" data-explicar="' + clave + '" ' +
          'aria-label="Cómo funciona ' + esc(modoLlano(clave)) + '" title="Cómo funciona">' +
          window.ATWI.iconoDeModo('ayuda', clave, 46) +
        '</button>' +
      '</div>';
  }

  /* El modal de la explicación hace juego con su carta: mismo color de fondo y
     el mismo rótulo dibujado. Termina en «Jugar», porque quien acaba de
     entender un modo suele querer probarlo ahí mismo. */
  var explicando = null;

  function abrirExplicar(clave) {
    var m = cfg.modos[clave];
    if (!m) return;
    explicando = clave;

    $('#m-explicar').className = 'modal modal--' + clave;
    $('#m-explicar .modal__titulo').textContent = 'Cómo se juega';
    $('#m-explicar .modal__cuerpo').innerHTML =
      '<div class="explica explica--' + clave + '">' +
        rotuloModo(clave, 'explica__rotulo') +
        /* La frase que importa va en párrafo aparte, entrecomillada y en
           cursiva: leída de corrido dentro del texto se perdía entre lo demás,
           y es justo lo único que hay que llevarse de esta pantalla. */
        '<p class="explica__que">' + esc(m.que) + '</p>' +
        '<p class="explica__clave">«' + esc(m.clave) + '»</p>' +
      '</div>';

    $('#m-explicar .modal__pie button').className =
      'boton boton--bloque boton--grande boton--' + clave;
    abrirModal('m-explicar');
  }

  /* La tarjeta NO es un botón: dentro lleva otro —personalizar— y un botón
     dentro de otro no es HTML válido. Es una caja con el botón grande arriba
     —tocar el tema— y la fila de chips debajo, donde el de personalizar cabe
     como uno más porque eso es lo que parece. */
  function tarjetaTema(t) {
    var hecho = datos.yaDebatido(t.id);
    var tocado = t.propio || datos.estaReescrito(t.id);
    return '<div class="tarjeta tema-caja' + (hecho ? ' tema--hecho' : '') + '">' +
        '<button class="tema" data-tema="' + esc(t.id) + '">' +
          '<span class="tema__titulo">' + esc(t.titulo) + '</span>' +
          '<span class="tema__enunciado">' + esc(t.enunciado) + '</span>' +
        '</button>' +
        '<div class="tema__pie">' +
          /* EL PRIMER CHIP DICE DE QUÉ VA LA FICHA, y no es el mismo dato en
             las dos clases: un tema trae su `intensidad` —ligera, profunda— y
             un premio trae su familia —elige, libra, recibe—. Con el nombre
             del campo escrito a mano, los 150 premios pintaban un chip VACÍO.
             Se toma el que haya; si no hay ninguno, no se pinta chip. */
          (t.intensidad || t.categoria
            ? '<span class="chip chip--' + esc(t.intensidad || t.categoria) + '">' +
                esc(t.intensidad || t.categoria) + '</span>'
            : '') +
          (hecho
            ? '<span class="chip chip--hecho">' + iconoSVG('listo', 13) + ' Ya debatido</span>'
            : '<span class="chip chip--nuevo">Sin estrenar</span>') +
          /* Directo al editor, sin pasar por el detalle: quien ve un tema que
             no encaja con su discusión quiere arreglarlo ahí mismo. */
          '<button class="chip chip--editar" data-editar-tema="' + esc(t.id) + '">' +
            icono('lapiz', 22) +
            (tocado ? 'Editar' : 'Personalizar') + '</button>' +
        '</div>' +
      '</div>';
  }

  /* ======================================================================
     Vista: Catálogo
     ====================================================================== */
  var categoriaAbierta = null;
  var buscadorAbierto = false;   // el campo de texto del catálogo, plegado de serie

  /* EL CATÁLOGO SE BARAJA EN CADA ENTRADA (titular, 2026-09-16): 105 temas en un
     orden fijo son la misma primera pantalla siempre, y a la tercera visita ya
     no se lee —se reconoce y se salta—. Barajándolo, lo que hay arriba cambia y
     vuelve a haber algo que mirar.

     SE GUARDA UN NÚMERO POR TEMA Y NO SE BARAJA LA LISTA. La lista se vuelve a
     pedir en cada pintada —al escribir, al filtrar—, así que barajarla ahí la
     dejaría saltando bajo el dedo. Con un número fijo por tema, el orden es el
     mismo hasta que alguien vuelva a entrar.

     Y los temas que aparezcan después —uno propio recién escrito— se atienden
     solos: piden su número la primera vez que se los ordena. */
  var azarDeTema = {};

  /* LAS TRES MESAS (mockup del titular, 2026-09-16). `familia` es la nueva: la
     que no se eligió y de la que no se puede uno ir —hermanos, primos, tíos—, y
     por eso sus temas no son ni los de la pareja ni los de los amigos.

     La frase de cada una dice DE QUÉ SE DISCUTE ahí, no quién es quién: al
     abrirla lo que se ve es una lista de temas, y esto tiene que dejar claro
     cuál de las tres listas va a salir. */
  var PUBLICOS = [
    ['pareja', 'Con mi pareja', 'Convivencia, dinero del día a día, horarios y pantallas.',
      ['Convivencia', 'Dinero', 'Horarios']],
    ['amigos', 'Con amigos', 'La cuenta, los planes, el grupo y los viajes juntos.',
      ['Planes', 'Viajes', 'La cuenta']],
    ['familia', 'Con familia', 'Hermanos, primos y tíos: comidas, fiestas y costumbres.',
      ['Comidas', 'Fiestas', 'Costumbres']]
  ];

  /* Una carta por mesa: el dibujo arriba, el nombre, de qué va, y la peana de
     color al pie. La peana es un PNG y no un degradado de CSS porque tiene
     forma —corazones, estrellas, nubes— y es lo que le da el aire de carta de
     juego a una pantalla que si no sería una lista de tres botones. */
  /* El nombre de la mesa para una cabecera de una sola línea. Sale de la misma
     tabla que las cartas —un solo sitio— quitándole el corte de renglón, que
     ahí sirve para que «Con mi pareja» quepa en una carta de 108 px. */
  function nombrePublico(clave) {
    for (var i = 0; i < PUBLICOS.length; i++) {
      if (PUBLICOS[i][0] === clave) return PUBLICOS[i][1].replace('<br>', ' ');
    }
    return 'Con mi pareja';
  }

  /* LA CARTA DE MESA, TAMBIÉN EN FILA (mismo mockup). El dibujo a la izquierda,
     el nombre y de qué va, y debajo TRES PALABRAS de lo que se discute ahí.

     LAS TRES PALABRAS NO SON DECORACIÓN: la frase de debajo ya dice de qué va
     la mesa, pero se lee entera o no se lee; los chips se ven de refilón y son
     lo que deja comparar las tres mesas sin leer los tres párrafos. Salen de la
     misma tabla `PUBLICOS`, en la cuarta columna, para que nombre, frase y
     chips no se puedan desincronizar. */
  function cartaPublico(p) {
    return '<button class="publico publico--' + p[0] + '" data-publico="' + p[0] + '">' +
        '<span class="publico__alto">' + icono(p[0], 76) + '</span>' +
        '<img class="publico__base" src="../assets/img/iconos/base-' + p[0] + '.png" ' +
          'alt="" aria-hidden="true" loading="lazy" decoding="async">' +
        '<span class="publico__texto">' +
          '<span class="publico__nombre">' + p[1].replace(/<br>/g, ' ') + '</span>' +
          '<span class="publico__que">' + esc(p[2]) + '</span>' +
          (p[3] ? '<span class="publico__marcas">' + p[3].map(function (x) {
            return '<span class="publico__marca">' + esc(x) + '</span>';
          }).join('') + '</span>' : '') +
        '</span>' +
      '</button>';
  }

  var ultimaMesa;               // para saber cuándo se cambió de mesa

  function barajar() { azarDeTema = {}; }

  /* SE BARAJA CADA VEZ QUE SE ABRE UNA LISTA, y abrir una lista es dos cosas:
     entrar a la vista Catálogo —eso lo ve `irA`— y elegir mesa, que no cambia
     de vista y por eso hacía falta mirarlo aquí. Vale para las tres.

     LO QUE NO CUENTA COMO ABRIR es repintar la misma lista: escribir en el
     buscador o tocar un filtro. Ahí la lista se vuelve a pedir varias veces por
     segundo, y rebarajarla dejaría los temas saltando bajo el dedo justo
     mientras se intenta leer uno. */
  function barajarSiEsOtraMesa() {
    if (modoPublico === ultimaMesa) return;
    ultimaMesa = modoPublico;
    barajar();
  }

  function azarDe(id) {
    if (!(id in azarDeTema)) azarDeTema[id] = Math.random();
    return azarDeTema[id];
  }
  var modoPublico = null;   // 'pareja' | 'amigos'; null = todavia no ha elegido
  var busqueda = '';        // texto del buscador
  var filtro = 'todos';     // 'todos' | 'sin' | 'con'

  /* La CLAVE de la categoría sigue siendo «Mis temas»: es lo que llevan
     guardados los temas ya escritos, y cambiarla obligaría a migrarlos. Lo que
     cambia es cómo se llama en pantalla. */
  var ETIQUETA_MIS = 'Mis propios temas';

  /* LO QUE SE ELIGE NO SE LLAMA IGUAL EN LOS TRES MODOS. En Controversia y en
     Pacto es un TEMA —algo de lo que hablar—; en QuiénGane es un PREMIO —algo
     que llevarse—. Son cuatro frases y estaban escritas a mano en cuatro
     sitios: puestas aquí, el día que entre un modo más se añade una columna y
     no hay que ir a buscarlas.
     Se decide por `propuesta.modo` y no por un parámetro, porque las cuatro
     salen de la misma pantalla y esa pantalla ya sabe a qué se está jugando. */
  function palabras() {
    var premio = propuesta.modo === 'competencia';
    return premio ? {
      mis: 'Mis propios premios',
      hay: 'Los premios que escribiste, para jugártelos.',
      vacio: 'Lo que quieras poner en juego y no está en la lista, escríbelo aquí.',
      cambian: 'Los premios cambian según con quién estés jugando.',
      escribir: 'Escribir un premio',
      primero: 'Escribir el primer premio',
      ninguno: 'El catálogo trae los premios de siempre, pero los suyos son suyos. ' +
               'Escribe qué se lleva quien gane y se juega igual que cualquier otro.'
    } : {
      mis: ETIQUETA_MIS,
      hay: 'Los temas que escribiste, para debatir o negociar.',
      vacio: 'Lo que discutes y no está en la lista, escríbelo aquí para debatir o negociar.',
      cambian: 'Los temas cambian según con quién estés debatiendo.',
      escribir: 'Escribir un tema',
      primero: 'Escribir el primer tema',
      ninguno: 'El catálogo trae las discusiones más comunes, pero las suyas son suyas. ' +
               'Escribe el enunciado y las dos posturas, y se juega igual que cualquier otro tema.'
    };
  }

  /** Deja el catálogo como recién abierto: en la pregunta de con quién juegas. */
  function reiniciarCatalogo() {
    modoPublico = null;
    categoriaAbierta = null;
    busqueda = '';
    filtro = 'todos';
  }

  /* Elegido el modo en la portada, hay que poder verlo —y cambiarlo— sin
     llegar hasta el final. La cinta va arriba de todas las pantallas del
     catálogo, con el color del modo. */
  function cintaModo() {
    if (!propuesta.modo) return '';
    var m = cfg.modos[propuesta.modo] || {};
    return '<button class="cinta-modo cinta-modo--' + propuesta.modo + '" ' +
            'data-accion="cambiar-modo" aria-label="Cambiar de modo">' +
        /* El rótulo dibujado en lugar de icono más nombre: ya trae dentro su
           icono y su color, así que ponerle otro al lado era decirlo dos veces. */
        rotuloModo(propuesta.modo, 'cinta-modo__rotulo') +
        /* CON EL NOMBRE Y LA LÍNEA DE QUÉ SE JUEGA (mockup del titular,
           2026-09-16). La cinta llevaba el dibujo y un botón de «Cambiar modo»,
           y nada más: quien entra al catálogo sin venir de la portada veía un
           rótulo y no sabía a qué había entrado. La frase es la misma `gancho`
           que usan las cartas de la portada — un solo sitio. */
        '<span class="cinta-modo__texto">' +
          '<span class="cinta-modo__nombre">Modo ' + esc(m.nombre || '') + '</span>' +
          (m.gancho ? '<span class="cinta-modo__que">' + esc(m.gancho) + '</span>' : '') +
        '</span>' +
        /* SIN LA PALABRA (titular). Decía «Cambiar modo» al lado del icono de
           cambiar: el dibujo ya es el reciclaje, así que la palabra repetía lo
           que el signo dice, y aquí el sitio se lo come el texto descriptivo.
           El nombre vive en el `aria-label` del botón. */
        '<span class="cinta-modo__cambiar">' + icono('cambiar', 26) + '</span>' +
      '</button>';
  }

  function pintarCatalogo() {
    var caja = $('#v-catalogo');
    var cinta = cintaModo();
    /* EN QUE PASO VA, para que el CSS pueda poner el fondo que toca. Se marca
       aqui y no se deduce del contenido: el paso ya se decide en esta funcion y
       leerlo de la pantalla seria adivinar lo que ya se sabe. */
    /* CON QUIÉN SE JUEGA, A LA CAPA DE DATOS, y se fija AQUÍ —un solo sitio—
       en vez de en cada punto donde cambia `modoPublico`: así no hay manera de
       que la lista se pinte con el filtro de la otra mesa. */
    barajarSiEsOtraMesa();
    datos.publicoDeJuego(modoPublico);
    /* Y QUÉ CLASE DE FICHA TOCA. En QuiénGane no se elige un tema de qué hablar
       sino un premio que llevarse, y los dos viven en el mismo catálogo. Va
       aquí, junto a la mesa, porque las dos cosas acotan la misma lista y
       separarlas sería tener dos sitios donde acordarse de lo mismo. */
    datos.claseDeJuego(propuesta.modo === 'competencia' ? 'premio' : 'tema');
    caja.dataset.paso = modoPublico || 'modo';
    caja.dataset.modo = propuesta.modo || '';

    // Paso 0: con quien se juega. De eso depende que temas tienen sentido.
    if (!modoPublico) {
      /* SIN BAJADA (titular, 2026-09-16). Decía «los temas cambian según con
         quién estés debatiendo», que es lo que las tres cartas ya enseñan: cada
         una trae su nombre, de qué va y tres palabras de lo que se discute
         ahí. Una frase que anuncia lo que hay justo debajo gasta el alto que
         necesitan las cartas. */
      caja.innerHTML = cinta +
        '<h1 class="vista__titulo" style="margin-bottom:var(--e-4)">¿Con quién juegas?</h1>' +
        '<div class="publicos">' + PUBLICOS.map(cartaPublico).join('') + '</div>';
      return;
    }

    datos.catalogo().then(function (cat) {
      var buscando = busqueda.trim() !== '' || filtro !== 'todos';

      /* LA ÚNICA COLECCIÓN QUE SIGUE ABRIÉNDOSE APARTE SON LOS TEMAS PROPIOS, y
         no es una categoría que se salvó: es de quien juega, se escribe desde
         dentro y puede estar vacía, así que mezclada entre los 105 del catálogo
         no tendría dónde poner su botón de escribir ni su estado vacío.
         Aquí había además la rama de las doce categorías del catálogo; se fue
         con ellas. */
      if (categoriaAbierta === datos.MIS_TEMAS) {
        var mios = datos.temasDe(datos.MIS_TEMAS);
        var visibles = datos.buscar(busqueda, filtro);
        var temas = mios.filter(function (x) { return visibles.indexOf(x) !== -1; });

        caja.innerHTML = cinta +
          '<div class="fila fila--cabecera" style="margin-bottom:var(--e-3)">' +
            '<button class="boton-icono" data-accion="catalogo-atras" aria-label="Volver al catálogo">' + icono('atras', 22) + '</button>' +
            /* SIN LA MANITO ✍️ delante del título (titular, 2026-09-16): era un
               emoji —lo dibujaba el sistema— y encima decía lo mismo que el
               botón de debajo, que sí lleva el icono de la casa. */
            '<div class="vista__titulo"><h1 style="font-size:var(--t-h2)">' + esc(palabras().mis) + '</h1>' +
            '<p class="chico suave">' + temas.length + ' de ' + mios.length + '</p></div>' +
          '</div>' +

          '<button class="boton boton--bloque" data-accion="tema-nuevo" style="margin-bottom:var(--e-3)">' +
            icono('mas', 20) + esc(palabras().escribir) + '</button>' +

          (temas.length
            ? '<div class="apilado">' + temas.map(tarjetaTema).join('') + '</div>'
            /* Y EL DIBUJO DEL HUECO ES EL MISMO «MÁS», y se toca: aquí solo hay
               una cosa que hacer, así que el sitio donde se mira es el sitio
               donde hay que poder tocar. */
            : estadoVacio(icono('mas', 76), 'Todavía no escribieron ninguno',
                palabras().ninguno, 'tema-nuevo', palabras().primero));
        devolverFoco();
        return;
      }

      /* LA LISTA VA DIRECTA, SIN CARPETAS (petición del titular, 2026-09-16).
         Había un paso intermedio de doce categorías —«En la cocina y la mesa»,
         «En la alcoba»— y para llegar a un tema había que acertar primero en
         qué carpeta lo habían guardado. Ese acierto es trabajo de quien busca y
         lo hace sobre un reparto que no eligió: un tema de horarios puede estar
         en «rutinas» o en «pantallas» y las dos son defendibles.

         Lo que las categorías daban —el orden de «por dónde suele salir la
         discusión»— NO se pierde: `datos.todos()` mantiene ese orden, así que
         la lista corrida sigue empezando por lo que sale antes. Lo que
         desaparece es tener que abrir una carpeta para verlo. */
      /* DOS REGLAS DE ORDEN, Y LA PRIMERA MANDA (titular, 2026-09-16):

         1. LOS YA DEBATIDOS AL FINAL. Con 105 temas de corrido, los jugados
            quedaban repartidos por la lista y empujaban hacia abajo a los que
            todavía se pueden jugar, que son a los que se viene. No se ESCONDEN
            —el chip «Ya debatidos» los trae de vuelta—: solo dejan pasar.
         2. LOS PENDIENTES, AL AZAR. Ver `azarDeTema`.

         Los ya debatidos NO se barajan: ahí no se busca novedad sino volver a
         encontrar uno concreto, y para eso el orden estable ayuda. */
      var temas = datos.buscar(busqueda, filtro).slice().sort(function (a, b) {
        var da = datos.yaDebatido(a.id) ? 1 : 0;
        var db = datos.yaDebatido(b.id) ? 1 : 0;
        if (da !== db) return da - db;
        return da ? 0 : azarDe(a.id) - azarDe(b.id);
      });
      var propios = datos.cuantosPropios();

      caja.innerHTML = cinta +
        '<div class="fila fila--cabecera" style="margin-bottom:var(--e-3)">' +
          '<button class="boton-icono" data-accion="cambiar-publico" aria-label="Volver">' + icono('atras', 22) + '</button>' +
          '<h1 class="vista__titulo" style="font-size:var(--t-h2)">' +
            nombrePublico(modoPublico) + '</h1>' +
          botonBuscar() +
        '</div>' +
        /* AQUÍ IBA «105 temas, ordenados por dónde y cuándo suele salir la
           discusión. Llevas 7 debatidos.» Lo quitó el titular: describía el
           reparto por categorías, que ya no existe, y además dos renglones
           fijos de letra chica en la primera pantalla son dos renglones que se
           leen una vez y se saltan siempre. */
        barraBusqueda() +
        /* La cuenta solo sale cuando se acotó algo. Fija era una descripción;
           así es la respuesta a lo que acabas de pedir. */
        (buscando
          ? '<p class="chico suave" style="margin:var(--e-3) 0 0">' +
              temas.length + ' de ' + cat.total + ' temas</p>'
          : '') +

        /* El catálogo es una plantilla: lo que no está, se escribe. Va ARRIBA
           de la lista, porque escribir el tema propio es lo que hace que la
           pareja vuelva cuando el catálogo se acaba. */
        /* SIN EMOJI A LA IZQUIERDA Y CON EL «MÁS» DIBUJADO A LA DERECHA
           (titular, 2026-09-16). Llevaba la manito ✍️ —un emoji, o sea la única
           pieza de esta tarjeta que dibujaba el sistema— y a la derecha un signo
           «+» escrito con la tipografía. Dos maneras distintas de decir «aquí se
           crea algo», y ninguna de las dos era el icono que el juego ya tiene
           para crear. Ahora la tarjeta dice una cosa sola, y la dice con el
           dibujo. Cuando ya hay temas propios, ese sitio lleva cuántos son:
           entonces el dato manda sobre la invitación. */
        '<button class="categoria categoria--propia categoria--sin-emoji" ' +
                'data-categoria="' + esc(datos.MIS_TEMAS) + '">' +
          '<span><span class="categoria__nombre">' + esc(palabras().mis) + '</span>' +
          '<span class="categoria__que">' +
            esc(propios ? palabras().hay : palabras().vacio) +
          '</span></span>' +
          '<span class="categoria__n">' + (propios || icono('mas', 34)) + '</span>' +
        '</button>' +

        (temas.length
          ? '<div class="apilado">' + temas.map(tarjetaTema).join('') + '</div>'
          : estadoVacio('🔍', 'Nada por aquí', 'Prueba con otra palabra o cambia el filtro.'));
      devolverFoco();
    }).catch(function () {
      caja.innerHTML = estadoVacio('😕', 'No se pudo cargar el catálogo', 'Comprueba que estás sirviendo el sitio con tools/servir.ps1 y no abriendo el archivo directamente.');
    });
  }

  /* ======================================================================
     Vista: Historial
     ====================================================================== */
  /* EL HISTORIAL SALE DEL SERVIDOR, no de `localStorage`. Se escribio cuando no
     habia backend y leia `p.partidas`, que no se llena nunca: por eso salia
     vacio aunque hubiera partidas jugadas.

     Y se puede volver a oir, que es para lo que existe: la voz del personaje se
     guarda sin plazo, asi que una partida de hace meses se escucha igual. */
  var historial = null;

  function pintarHistorial() {
    var caja = $('#v-historial');
    var titulo = '<h1 class="vista__titulo" style="margin-bottom:var(--e-4)">Historial</h1>';

    if (!window.ATWI.nube || !window.ATWI.nube.hay()) {
      caja.innerHTML = titulo + estadoVacio('📜', 'Entrá con tu cuenta',
        'El historial vive en el servidor, para que lo tengas en cualquier teléfono. ' +
        'Sin sesión no hay nada que traer.');
      return;
    }

    if (!historial) {
      caja.innerHTML = titulo + '<p class="chico tenue">Buscando tus partidas…</p>';
      window.ATWI.nube.historial().then(function (l) {
        historial = l;
        if (vistaActual === 'historial') pintarHistorial();
      });
      /* LAS ACTAS VIENEN EN LA MISMA VISITA, en paralelo y sin esperarlas. Las
         necesita esta pantalla dos veces: la puerta a la lista, y sobre todo el
         aviso de borrar, que tiene que decir siempre que el acuerdo se va con
         la partida. Un aviso que solo avisa a veces es peor que ninguno. */
      if (!actas) window.ATWI.nube.acuerdos().then(function (l) { actas = l || []; });
      return;
    }

    if (!historial.length) {
      /* ESTE TEXTO DECÍA QUE LAS RONDAS A MEDIAS NO ENTRAN, y eso cambió
         (2026-09-15): ahora entran y se retoman. Lo que sí sigue siendo verdad
         es que una ronda sin ninguna intervención no aparece: no hay nada que
         oír ni que seguir. */
      caja.innerHTML = titulo + estadoVacio('📜', 'Todavía no hay nada',
        'Aquí van a estar sus partidas: las terminadas, con su resultado, y las que ' +
        'dejaron a medias, para seguirlas cuando quieran. El historial nunca se ' +
        'sobrescribe: una revancha añade una versión nueva y la anterior sigue ahí.');
      return;
    }

    /* LAS ACTAS SON OTRA VISTA DE ESTA PANTALLA, NO OTRA PANTALLA (corrección
       del titular, 2026-09-15). Estaban detrás de una tarjeta que abría un
       modal, y eso obliga a salir de donde estabas para volver a entrar. Como
       chip, se cambia de lo que se está mirando sin moverse de sitio: las
       partidas de este móvil, las de en línea, o lo que acordaron. */
    if (vistaHistorial === 'actas') return pintarActas(caja, titulo);

    /* EL FILTRO NO TIENE «TODAS» (decisión del titular, 2026-09-15). Local y en
       línea son dos maneras de jugar que esperan cosas distintas: en la local
       están los dos delante y la partida se termina de una sentada; en la de en
       línea se manda lo propio y se espera. Mezcladas en una lista, la de en
       línea --que es la que pide algo de vos-- se pierde entre las otras. */
    var lista = historial.filter(function (d) {
      return esEnLinea(d) === (vistaHistorial === 'linea');
    });

    caja.innerHTML = titulo + barraDondeJuego() +
      (lista.length ? '' : (vistaHistorial === 'linea'
        ? estadoVacio('🌐', 'Todavía no hay partidas en línea',
            'Jugar cada quien desde su teléfono —mandar lo tuyo y que te avise ' +
            'cuando conteste la otra parte— es lo que sigue. Por ahora las ' +
            'partidas son las de este teléfono, y están en la otra pestaña.')
        : estadoVacio('📜', 'Ninguna partida en este teléfono',
            'Aquí van las que juegan los dos sentados en el mismo móvil.'))) +
      lista.map(function (d) {
        var t = d.turnos_grabados || [];
        /* EL ESTADO VA ARRIBA DEL TODO y no en el pie: es el motivo por el que
           esa fila se toca, y un aviso debajo de la duración se lee después de
           haber decidido. */
        var e = estadoDe(d);
        var rot = ROTULO_ESTADO[e];
        /* Y CUÁNTO LE FALTA, que en una partida a medias es el dato. «3 de 6»
           dice de un vistazo si queda una tarde o un minuto.
           NINGUNA FILA SE PINTA BLOQUEADA: todas llevan a algún sitio. */
        var total = (d.turnos || 3) * 2;
        /* EL AVANCE SE DICE SIEMPRE, incluso «0 de 6» (petición del titular,
           2026-09-15). Decía «sin intervenciones», que suena a partida rota;
           «0 de 6» dice lo mismo y además dice que está esperando el primer
           turno. Y en una partida remota eso no es un detalle: el invitado pudo
           haberla aceptado y no haber hablado todavía, y esa diferencia
           --aceptada pero sin empezar-- solo se ve con el contador puesto.

           VA PEGADO AL ESTADO Y SIN FRASE. Primero llevaba además un «seguir
           jugando» o un «pedir el resultado», y en 375 px esa fila competía con
           los dos nombres: los apretaba hasta «Mo…» y «Di…». La frase no hacía
           falta —el estado ya dice qué es— y los nombres sí. */
        var avance = t.length + ' de ' + total;
        /* LOS DATOS ARRIBA Y LA PREGUNTA DE CUERPO (rediseño pedido por el
           titular, 2026-09-15, sobre la tarjeta dibujada). Antes la pregunta iba
           en medio y todo lo demás repartido encima y debajo, así que para saber
           de qué partida se trataba había que leer la tarjeta entera de arriba
           abajo. Ahora hay dos zonas: una CABECERA con todo lo que identifica y
           sitúa --en qué estado está, cuándo fue, quiénes jugaron y por dónde
           van-- y debajo la pregunta sola, que es lo que se lee. */
        /* EL DÍA Y EL MODO VAN JUNTOS, EN LA MISMA LÍNEA (ajuste del titular,
           2026-09-15). El rótulo vivía en una columna aparte a la derecha y
           quedaba un par de píxeles por debajo del día, que es de esas cosas que
           no se saben nombrar pero se ven. Puestos en la misma fila se alinean
           solos y además se leen como lo que son: las dos señas de la partida
           --cuándo fue y a qué se jugó--. */
        return '<div class="tarjeta partida-fila" data-familia="' +
            (FAMILIA[e] || 'hecha') + '"' +
            (meEspera(d) ? ' data-espera' : '') + '>' +
          '<button class="partida" ' +
            (rot ? 'data-tono="' + rot[1] + '" ' : '') +
            'data-partida="' + esc(d.id) + '">' +
            /* Fila 1: en qué estado está y por dónde va · cuándo y a qué. */
            '<span class="partida__alto">' +
              '<span class="partida__estado' +
                  (rot ? '' : ' partida__estado--hecha') + '">' +
                esc(rot ? rot[0] : 'Terminada') +
                '<span class="partida__avance">' + esc(avance) + '</span>' +
              '</span>' +
              '<span class="partida__senas">' +
                '<span class="partida__cuando">' + esc(cuando(d.creado)) + '</span>' +
                window.ATWI.rotuloModo(d.modo === 'debate' ? 'debate' : 'negociacion',
                                       'partida__modo') +
              '</span>' +
            '</span>' +
            /* Fila 2: quiénes jugaron. */
            '<span class="partida__alto">' + quienesJugaron(d) + '</span>' +
            '<span class="partida__tema">' + esc(d.enunciado || 'Sin tema') + '</span>' +
          '</button>' +
          /* LA PAPELERA VA SIEMPRE, tenga turnos o no. Una partida vacia
             tambien ocupa sitio en la lista, y no poder quitarla obliga a
             cargar con ella para siempre. Abajo a la derecha: es lo ultimo que
             se decide sobre una tarjeta, y arriba competia con el modo. */
          '<button class="partida__borrar" data-borrar="' + esc(d.id) + '"' +
            ' aria-label="Borrar esta partida">' +
            icono('papelera', 22) + '</button>' +
        '</div>';
      }).join('');
  }

  /* --- Borrar una partida ------------------------------------------------------
     SE PREGUNTA ANTES, Y SE DICE QUE SE LLEVA. Quien no usa abogado suena con su
     propia voz, y esa grabacion se conserva para poder volver a oirla: es la
     unica que hay. Borrar la partida la borra de verdad --el archivo, no solo la
     fila-- y eso no se deshace. Un boton de papelera que actua al primer toque
     seria perder una conversacion por rozar la pantalla.

     Y ES LA PERSONA QUIEN DECIDE, no un plazo. Decision del titular
     (2026-09-13): si se guarda indefinidamente, tiene que poder quitarse cuando
     se quiera, y sin dar explicaciones ni esperar a que caduque. */
  function abrirOlvidar(id) {
    var d = (historial || []).filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var t = d.turnos_grabados || [];
    /* Cuantas se oyen con la voz de quien las dijo. Son las que de verdad
       desaparecen: las del abogado son un dibujo leyendo un texto. */
    var propias = t.filter(function (x) { return !x.abogado; }).length;

    $('#m-olvidar .modal__cuerpo').innerHTML =
      '<p class="chico tenue" style="margin-bottom:var(--e-3)">' +
        esc(cuando(d.creado)) + '</p>' +
      '<p style="font-weight:800;margin-bottom:var(--e-4);line-height:1.35">' +
        esc(d.enunciado || 'Sin tema') + '</p>' +
      '<p class="chico" style="margin-bottom:var(--e-4)">' +
        (t.length
          ? 'Se van las <b>' + t.length + ' intervenciones</b> y el resultado. ' +
            (propias
              ? 'De esas, <b>' + propias + '</b> ' + (propias === 1 ? 'es' : 'son') +
                ' tu grabación, así que también se borra' + (propias === 1 ? '' : 'n') +
                ' del servidor.'
              : 'Todas se oyen con la voz del personaje.')
          : 'Esta partida no llegó a tener intervenciones.') +
      '</p>' +
      /* Y EL ACTA SE VA CON ELLA, que es lo que nadie espera (lo señaló el
         titular, 2026-09-15). `acuerdos.debate` es `on delete cascade`, así que
         borrar la partida se lleva el acuerdo que firmaron en ella --y eso se
         consulta meses después, cuando ya nadie se acuerda de qué partida
         salió--. Avisarlo aquí es la diferencia entre borrar una grabación y
         perder sin querer lo que quedaron. */
      (actaDe(id)
        ? '<p class="chico" style="margin-bottom:var(--e-4)">' +
            'Y se va <b>el acuerdo que firmaron en esta partida</b>, el que está en ' +
            '«Lo que acordaron». Es lo único que queda de lo que quedaron.' +
          '</p>'
        : '') +
      '<p class="chico tenue">No se puede deshacer.</p>';

    /* EL PIE, CON LOS DOS DEL MISMO TAMAÑO. Suave y con el tono aparte, no un
       bloque rojo: es el mismo criterio que el borrar de la sala --esto es un
       juego, no un formulario-- y el mismo gesto, así que se ve igual. */
    $('#m-olvidar .modal__pie').innerHTML =
      '<p class="chico olvidar-fallo" hidden></p>' +
      '<button class="boton boton--bloque boton--grande boton--suave boton--borrar"' +
        ' data-olvidar-ya="' + esc(id) + '">Borrarla</button>' +
      '<button class="boton boton--suave boton--bloque boton--grande boton--punteado" ' +
        'data-cerrar="m-olvidar">Dejarla donde está</button>';

    abrirModal('m-olvidar');
    /* EL COLOR VA DESPUÉS DE ABRIR, y solo aquí: `tintarModal()` no puede
       adivinarlo porque no depende de qué se está jugando sino de QUÉ PARTIDA se
       está por borrar, que puede ser de otro modo y de hace meses. */
    var m = $('#m-olvidar');
    m.classList.remove('modal--debate', 'modal--negociacion');
    m.classList.add(d.modo === 'negociacion' ? 'modal--negociacion' : 'modal--debate');
  }

  function olvidarPartida(id, boton) {
    boton.disabled = true;
    boton.textContent = 'Borrando…';
    window.ATWI.nube.olvidar(id).then(function (r) {
      if (!r || !r.borrado) {
        boton.disabled = false;
        boton.textContent = 'Reintentar';
        /* ENCIMA DE LOS BOTONES, no al final del modal: puesto al final cae
           debajo de «dejarla donde está» y se lee después de las dos salidas,
           cuando lo que dice es justo por qué una de ellas no funcionó. Vive en
           el pie, ya creado y escondido. */
        var aviso = $('#m-olvidar .olvidar-fallo');
        if (!aviso) return;
        aviso.hidden = false;
        /* SE DICE QUE NO SE BORRO NADA, y es verdad: la funcion de borde no
           toca la fila si los audios no se fueron. Decir «puede que si, puede
           que no» sobre la voz de alguien es lo peor que se puede contestar.

           Y SE DICE POR QUE. Esto era una sola frase sin causa, asi que cuando
           fallo de verdad --el titular, 2026-09-15-- no habia nada que mirar ni
           en la pantalla ni en ningun sitio. El motivo ya lo tenia `nube.js`
           guardado en `ultimoFallo` y se estaba tirando. Ahora se enseña en
           pequeño y ademas se anota en la bitacora, que para eso esta. */
        var porque = window.ATWI.nube.ultimoFallo && window.ATWI.nube.ultimoFallo();
        aviso.innerHTML = 'No se pudo borrar, y no se borró nada. Probá otra vez.' +
          (porque ? '<br><span class="tenue">' + esc(porque) + '</span>' : '');
        if (window.ATWI.nube.anotar) {
          window.ATWI.nube.anotar('borrar_fallo', { debate: id, detalle: porque || '' });
        }
        return;
      }
      /* Se quita de la lista que ya esta en memoria en vez de volver a pedirla:
         la persona acaba de decir que se vaya y verla desaparecer es la
         respuesta. Pedir el historial otra vez son dos segundos de tarjeta
         todavia ahi. */
      historial = (historial || []).filter(function (x) { return x.id !== id; });
      /* Y EL ACTA CON ELLA, en memoria igual que en la base: `acuerdos.debate`
         es `on delete cascade`, así que la fila ya no está. Dejarla en la lista
         mostraría un acuerdo de una partida que acaba de desaparecer --y al
         tocarlo llevaría a una partida que ya no existe--. */
      actas = (actas || []).filter(function (a) {
        return !a.debate || a.debate.id !== id;
      });
      cerrarModal('m-olvidar');
      pintarHistorial();
    });
  }

  /* «Hoy», «ayer» y la fecha. Un historial de partidas de pareja se lee por lo
     reciente: «hace dos días» dice mas que «13/09». */
  /* SIN LA HORA (decisión del titular, 2026-09-15). Un historial de partidas de
     pareja se lee por lo reciente que es algo, no por el minuto en que pasó:
     «Hoy» ya dice todo lo que hace falta para situarla, y «Hoy · 05:00» gastaba
     media fila de cabecera en un dato que nadie usa. Lo que ganó ese sitio es el
     rótulo del modo, que sí distingue una partida de otra. */
  function cuando(iso) {
    var d = new Date(iso);
    var hoy = new Date();
    var dias = Math.floor((hoy.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0))
                          / 86400000);
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    if (dias < 7) return 'Hace ' + dias + ' días';
    return d.toLocaleDateString('es', { day: 'numeric', month: 'long' });
  }

  /* --- Volver a oír una partida ------------------------------------------------
     SE ABRE LA SALA, no una pantalla nueva. Se escribio primero como una lista
     dentro de un modal propio --ficha, duracion y un boton de play por
     intervencion-- y era peor lo mismo: perdia la figura grande, el reproductor
     sobre la cabeza y el encadenado, que son justo lo que hace que una partida
     se relea como una conversacion y no como una carpeta de audios.

     Reproducir una partida es ponerla otra vez: la misma sala, con las casillas
     ya llenas y sin boton de grabar. */
  /* EN QUÉ PUNTO ESTÁ CADA PARTIDA. El historial dejó de ser la lista de lo
     terminado y pasó a ser donde viven todas (decisión del titular,
     2026-09-15), así que cada fila tiene que decir en qué punto está y qué se
     puede hacer con ella. Son cinco y solo cuatro se enseñan.

       · sin-empezar     ni una intervención  ->  «Empezar». AQUÍ SALÍAN
                         BLOQUEADAS y era un descuido: la fila se pintaba con el
                         botón `disabled` --heredado de cuando abrir una partida
                         solo servía para oírla, y sin audios no había nada que
                         oír-- así que el historial enseñaba cinco tarjetas
                         grises que no hacían nada y no decían por qué.
                         No hay que esconderlas: una partida sin empezar tiene
                         todo lo suyo decidido --el tema, el modo, los turnos,
                         quién juzga y con qué fichas-- y lo único que le falta
                         es la primera intervención. Se retoma como cualquier
                         otra y arranca en el turno 1.
       · en-curso        faltan intervenciones  ->  «Seguir jugando»
       · falta-veredicto están las seis y no hay resultado  ->  «Pedir el
                         resultado», que retoma en la pantalla de deliberar.
       · sin-ver         hay resultado y nadie lo miró  ->  «Ver el resultado»,
                         con la revelación entera.
       · terminada       se jugó y se vio  ->  repaso.

     `falta-veredicto` ES SOLO DE CONTROVERSIA, y no por capricho: en Negociación
     no hay árbitro todavía, así que una ronda de Pacto cerrada NUNCA tiene fila
     en `resultados`. Marcarla como «falta el resultado» pondría un aviso
     permanente sobre algo que no está roto. El día que exista el mediador, esta
     excepción se cae sola. */
  function estadoDe(d) {
    var hechos = (d.turnos_grabados || []).length;
    var total = (d.turnos || 3) * 2;
    if (!hechos) return 'sin-empezar';
    if (hechos < total) return 'en-curso';
    if (!d.resultado) return d.modo === 'debate' ? 'falta-veredicto' : 'terminada';
    return d.resultado.visto ? 'terminada' : 'sin-ver';
  }

  /* QUIÉNES JUGARON, con su cara (petición del titular, 2026-09-15). La lista
     decía el tema y la fecha, y en una lista de partidas del mismo tema --que
     es lo que pasa al probar, y lo que va a pasar con las revanchas-- no había
     manera de distinguir una de otra.

     LOS DOS LADOS SIEMPRE, hablaran o no. La ficha sale del debate, que la sella
     al abrirse desde la migración 0031, y no de los turnos: así una partida que
     nadie empezó también enseña contra quién iba a ser. Para las partidas
     viejas, que no la tienen sellada, se cae a los turnos. */
  function quienesJugaron(d) {
    var t = d.turnos_grabados || [];
    var abreP = d.abre_lado !== 'invitado';
    function lado(cual, i) {
      /* `orden` EMPIEZA EN 1, así que quien abre tiene los IMPARES. Estaba al
         revés, igual que en `mesaDelDebate()` —de donde se copió— y con el
         mismo efecto: las dos caras cambiadas de sitio. Aquí solo se nota en
         las partidas viejas, que son las únicas que llegan a usar este respaldo
         (las nuevas traen la ficha sellada por la migración 0031). */
      var par = ((cual === 'propone') === abreP) ? 1 : 0;
      var x = t.filter(function (q) { return (q.orden || 0) % 2 === par; })[0];
      /* Y PARA EL LADO `propone`, EL PERFIL DE ESTA CUENTA COMO ÚLTIMO RECURSO.
         Las partidas abiertas antes de la migración 0031 no sellaban su ficha,
         así que la tarjeta enseñaba UNA sola cara --la del invitado-- y un «vs»
         a medias. Quien propuso es quien está mirando la lista. */
      var mio = cual === 'propone' ? datos.perfil() : null;
      var nombre = d[cual + '_nombre'] || (x && x.nombre) || (mio && mio.nombre);
      var avatar = d[cual + '_avatar'] || (x && x.avatar) || (mio && mio.avatar);
      var color = d[cual + '_color'] || (x && x.color) || (mio && mio.color);
      if (!nombre && !avatar) return null;
      return '<span class="jugaron__uno">' +
          window.ATWI.fichaHTML(avatar || (i ? 'luna' : 'kai'), 'jugaron__cara', color) +
          '<span class="jugaron__nombre">' + esc(nombre || '—') + '</span>' +
        '</span>';
    }
    var a = lado('propone', 0);
    var b = lado('invitado', 1);
    if (!a && !b) return '';
    /* «VS» EN CONTROVERSIA Y «Y» EN NEGOCIACIÓN (corrección del titular,
       2026-09-15). En Pacto no hay dos lados enfrentados: los dos proponen
       sobre el mismo tema y el resultado es de los dos o no es de nadie --por
       eso el veredicto dice «Ambos» y no un nombre--. Un «vs» ahí contradice el
       modo entero en dos letras, y encima en la pantalla donde la pareja repasa
       lo que hizo junta. */
    var junta = d.modo === 'negociacion';
    /* CÓMO ACABÓ VA AQUÍ, JUNTO A ELLOS (corrección del titular, 2026-09-16).
       Estaba arriba, al lado de «Terminada», y ahí se leía como un estado más
       de la partida. Pero «Empate» o «Ganó Harold» no dicen en qué punto está
       la ronda: dicen algo SOBRE ESTAS DOS PERSONAS, y puesto detrás de sus dos
       caras se lee solo, sin tener que buscar arriba de quién se habla. */
    var final = comoAcabo(d);
    return '<span class="jugaron">' + (a || '') +
      (a && b ? '<span class="jugaron__vs">' + (junta ? 'y' : 'vs') + '</span>' : '') +
      (b || '') +
      (final ? '<span class="jugaron__final">' + esc(final) + '</span>' : '') +
      '</span>';
  }

  /* LOS CINCO ESTADOS SE AGRUPAN EN TRES FAMILIAS, y de ahí sale el tinte de la
     tarjeta (decisión del titular, 2026-09-15). Los cinco hacen falta para
     saber qué pasa al tocar; tres son los que se ven de un vistazo bajando por
     la lista, y son los que el titular nombró: en curso, lista para veredicto y
     completada.

     EL TINTE ES MUY SUAVE A PROPÓSITO. Es para recorrer la lista con el ojo, no
     para llamar la atención: una tarjeta con color fuerte se lee como un aviso,
     y aquí ninguna de las tres es un problema. El rótulo de arriba sigue siendo
     quien dice exactamente cuál es. */
  var FAMILIA = {
    'sin-empezar': 'curso',
    'en-curso': 'curso',
    'falta-veredicto': 'veredicto',
    'sin-ver': 'veredicto',
    'terminada': 'hecha'
  };

  /* LOCAL O EN LÍNEA. La marca honesta es `aceptado_por`: en una partida local
     quien juega enfrente agarró este mismo teléfono y no tiene cuenta, así que
     nadie la aceptó. En una remota la acepta alguien con perfil.
     HOY TODAS SON LOCALES --la partida remota no existe-- y la pestaña de en
     línea sale vacía diciéndolo. No es un filtro de adorno: el día que exista,
     mezclar las dos en una sola lista sería mezclar dos maneras de jugar que
     esperan cosas distintas de vos. */
  function esEnLinea(d) { return Boolean(d && d.aceptado_por); }

  /* ¿ESTA PARTIDA ME ESTÁ ESPERANDO A MÍ? (regla del titular, 2026-09-16).
     Las que sí brillan en la lista; las demás, no.

     LA MITAD DEL VALOR ESTÁ EN LAS QUE NO BRILLAN. Una lista donde todo llama
     la atención no señala nada, y aquí la diferencia es concreta: entre «te
     toca» y «le toca al otro» hay una acción tuya o ninguna. Por eso una
     partida remota esperando al otro se queda apagada aunque esté a medias.

     TRES CASOS, y los tres son lo mismo dicho de tres maneras —hay algo que
     solo puedo hacer yo—:
       · a medias y me toca grabar,
       · terminada y sin veredicto, que hay que volver a pedirlo,
       · con el veredicto listo y sin abrir.
     `terminada` no entra: ahí no queda nada por hacer.

     Y EN PARTIDA LOCAL ME TOCA SIEMPRE, sea de quien sea el turno: el teléfono
     es uno solo y quien lo tiene en la mano soy yo. Es el único caso que hoy
     se puede ver —la remota no existe— y por eso la rama de en línea está
     escrita con el freno puesto: si no se puede saber de quién es el turno, no
     brilla. Encender de más es peor que no encender, porque lo que se aprende
     es a ignorar el brillo. */
  function meEspera(d) {
    var e = estadoDe(d);
    if (e === 'sin-ver' || e === 'falta-veredicto') return true;
    if (e !== 'en-curso' && e !== 'sin-empezar') return false;
    if (!esEnLinea(d)) return true;

    var yo = window.ATWI.auth && window.ATWI.auth.sesion();
    yo = yo && yo.user && yo.user.id;
    if (!yo) return false;
    /* MI LADO, Y EL LADO QUE TOCA. `orden` empieza en 1 y quien abre tiene los
       impares, así que la intervención que viene —la número `hechas + 1`— es de
       quien abre cuando es impar. Es la misma cuenta de `quienesJugaron`, y ahí
       ya estuvo al revés una vez, con las dos caras cambiadas de sitio. */
    var mio = d.propone === yo ? 'propone' : d.aceptado_por === yo ? 'invitado' : null;
    if (!mio) return false;
    var abre = d.abre_lado === 'invitado' ? 'invitado' : 'propone';
    var siguiente = ((d.turnos_grabados || []).length + 1) % 2 === 1
      ? abre : (abre === 'propone' ? 'invitado' : 'propone');
    return siguiente === mio;
  }

  /* QUÉ SE ESTÁ MIRANDO EN EL HISTORIAL. Tres vistas de la misma pantalla y una
     sola a la vez: las partidas de este móvil, las de en línea, o las actas.

     LAS ACTAS ENTRAN AQUÍ Y NO EN UN MODAL (corrección del titular,
     2026-09-15). Estaban detrás de una tarjeta que abría otra pantalla, y eso
     obliga a salir de donde estabas para volver a entrar. Como chip se cambia
     de vista sin moverse de sitio, que es lo que uno hace cuando va a comparar
     --«¿esto lo acordamos o solo lo hablamos?»--.

     SE RECUERDA mientras dure la pestaña: quien viene a mirar sus acuerdos los
     vuelve a mirar al minuto siguiente, y volver siempre a «local» le esconde
     lo que venía a ver. */
  var vistaHistorial = 'local';

  /* La de acuerdos solo sale si hay Negociaciones jugadas. Un chip que lleva
     siempre a una lista vacía es un chip que enseña a no tocarlo. */
  function hayNegociaciones() {
    return (historial || []).some(function (d) { return d.modo === 'negociacion'; });
  }

  function barraDondeJuego() {
    var op = [['local', 'En este móvil'], ['linea', 'En línea']];
    /* «Acuerdos» y no «Lo que acordaron» (titular, 2026-09-15): los otros dos
       chips son dos palabras y uno de cuatro los descolocaba. Además la frase
       larga ya está dentro, en el aviso de que es un recordatorio. */
    if (hayNegociaciones()) op.push(['actas', 'Acuerdos']);
    return '<div class="filtros filtros--donde">' +
      op.map(function (x) {
        return '<button class="chip chip--filtro" data-donde="' + x[0] + '"' +
          (vistaHistorial === x[0] ? ' aria-pressed="true"' : '') + '>' + esc(x[1]) + '</button>';
      }).join('') +
    '</div>';
  }

  /* El rótulo de cada estado y su color. Los tres primeros son los que piden
     algo; `terminada` no lleva nada, que una lista donde todo grita no señala
     nada. */
  var ROTULO_ESTADO = {
    'sin-empezar': ['Sin empezar', 'curso'],
    'en-curso': ['Sin terminar', 'curso'],
    'falta-veredicto': ['Falta el resultado', 'curso'],
    'sin-ver': ['Tu resultado está listo', 'premio']
  };

  /* CÓMO ACABÓ, en dos palabras (petición del titular, 2026-09-16). La fila de
     una partida terminada decía «Terminada» y nada más, así que para saber en
     qué quedó había que abrirla. En una lista de veinte, eso es abrirlas todas.

     Va junto al estado y no en su propia línea: es la MISMA pregunta —«¿qué
     pasó con esta?»— y partirla en dos renglones haría la tarjeta más alta sin
     decir nada más. */
  function comoAcabo(d) {
    var r = d.resultado;
    if (!r || !r.tipo_resultado) return '';
    if (r.tipo_resultado === 'empate_tecnico') return 'Empate';
    if (r.tipo_resultado === 'sin_resultado_blando') return 'Sin veredicto';
    if (r.tipo_resultado === 'sin_resultado_duro') return 'Partida detenida';
    if (r.tipo_resultado === 'ganador') {
      /* El nombre, no el lado. «Ganó propone» no se lo dice a nadie. */
      var lado = r.ganador_lado === 'invitado' ? 'invitado' : 'propone';
      var quien = lado === 'invitado'
        ? (d.invitado_nombre || 'la otra parte')
        : (d.propone_nombre || 'vos');
      return 'Ganó ' + quien;
    }
    return '';
  }

  /* DE DÓNDE SE ABRIÓ LA PARTIDA, para poder devolver ahí (corrección del
     titular, 2026-09-15). A una partida se entra por dos puertas --la tarjeta de
     la portada y la fila del historial-- y al salir volvía siempre al historial,
     así que abrirla desde la portada te dejaba en otra pantalla. */
  var volverTrasLaPartida = 'historial';

  /* UNA SOLA PUERTA PARA TODAS, y cada estado entra por donde le toca. Antes
     esto siempre abría el repaso, que era lo único que había. */
  function abrirPartida(id) {
    var d = (historial || []).filter(function (x) { return x.id === id; })[0];
    /* SI NO ESTÁ EN LA LISTA, SE PIDE. El historial trae las 20 últimas y las
       actas llegan hasta 50: una partida vieja puede tener acta y no estar
       cargada, y tocarla no puede no hacer nada. */
    if (!d) {
      if (!window.ATWI.nube || !window.ATWI.nube.partida) return;
      window.ATWI.nube.partida(id).then(function (traida) {
        if (!traida) return;
        historial = (historial || []).concat([traida]);
        abrirPartida(id);
      });
      return;
    }
    volverTrasLaPartida = vistaActual === 'jugar' ? 'jugar' : 'historial';
    var e = estadoDe(d);
    /* Empezarla, seguirla o pedir el resultado que falta: las tres son retomar
       la misma partida, y `reanudar()` decide dónde deja a la persona. */
    if (e === 'sin-empezar' || e === 'en-curso' || e === 'falta-veredicto') {
      return window.ATWI.partida.reanudar(d);
    }
    /* ESTRENO O REPASO, y la diferencia es toda la pantalla: un veredicto que
       nadie vio se abre con la revelación entera --redoble, entrada,
       serpentinas-- porque es la primera vez, y uno ya visto se abre en repaso,
       a oír las intervenciones. */
    window.ATWI.partida.repasar(d, { estrenar: e === 'sin-ver' });
  }

  /* --- LAS ACTAS ---------------------------------------------------------------
     Todas juntas, abiertas desde el historial (petición del titular,
     2026-09-15). No son una pestaña propia porque son DE las partidas; lo que
     les da pantalla es que se consultan por otro motivo --«¿qué habíamos
     quedado?»-- y buscarlas partida por partida sería lo contrario de un
     recordatorio.

     SE GUARDAN EN MEMORIA como el historial, y por lo mismo: entrar y salir de
     la lista no puede costar una petición cada vez. Se tira al firmar una
     nueva. */
  var actas = null;

  /* Se pinta DENTRO del historial, en su sitio: el título y los chips se
     quedan, y lo único que cambia es la lista de abajo. */
  function pintarActas(caja, titulo) {
    var cabecera = titulo + barraDondeJuego();
    if (!actas) {
      caja.innerHTML = cabecera + '<p class="chico tenue">Buscando sus actas…</p>';
      window.ATWI.nube.acuerdos().then(function (l) {
        actas = l || [];
        if (vistaActual === 'historial') pintarHistorial();
      });
      return;
    }
    if (!actas.length) {
      caja.innerHTML = cabecera + estadoVacio('🤝', 'Todavía no hay actas',
        'Cuando cierren una Negociación —con acuerdo o sin él— queda aquí lo que ' +
        'quedaron. Es un recordatorio, no un contrato.');
      return;
    }
    caja.innerHTML = cabecera +
      /* SE DICE LO QUE ES, Y ES LA REGLA 1 DEL PRODUCTO. `docs/02` §9.4.7
         prohíbe prometer que un tema queda resuelto: el acta es un recordatorio
         de lo que se acordó, nada más, y esta pantalla —que es donde se vuelve
         a leer— es justo donde hay que decirlo. */
      '<p class="chico tenue" style="margin-bottom:var(--e-4)">Un recordatorio de lo ' +
        'que quedaron, no un contrato: nadie está obligado a cumplirlo, y si deja de ' +
        'servirles lo vuelven a hablar.</p>' +
      /* MISMA TARJETA QUE EL HISTORIAL (titular, 2026-09-15): `.tarjeta` con
         `.partida` dentro, la cabecera de estado y fecha, y el enunciado de
         cuerpo. Lo que no lleva es lo que aquí no dice nada: el rótulo del modo
         --todas son de Pacto, marcarlo en todas no distingue ninguna-- ni la
         papelera, porque un acta no se borra por su cuenta: se va con su
         partida, y esa se borra desde el historial.
         Y SE TOCA: lleva a la partida de la que salió. */
      actas.map(function (a) {
        var d = a.debate || {};
        var hubo = a.tipo === 'acuerdo';
        return '<div class="tarjeta partida-fila" data-tipo="' + esc(a.tipo) + '">' +
            '<button class="partida" data-acta-de="' + esc(d.id || '') + '">' +
              '<span class="partida__alto">' +
                '<span class="partida__estado' +
                    (hubo ? '' : ' partida__estado--hecha') + '">' +
                  (hubo ? 'Acuerdo' : 'Sin acuerdo') +
                '</span>' +
                '<span class="partida__cuando">' + esc(cuando(a.creado)) + '</span>' +
              '</span>' +
              '<span class="partida__tema">' + esc(d.enunciado || 'Sin tema') + '</span>' +
              '<span class="acta-fila__texto">' + esc(a.texto) + '</span>' +
            '</button>' +
          '</div>';
      }).join('');
  }

  /* ¿Esta partida tiene acta? Lo lee de la lista en memoria, que se trae JUNTO
     con el historial por este mismo motivo: el aviso de borrar tiene que decir
     siempre que el acuerdo se va, y uno que solo avisa a veces es peor que
     ninguno. La petición no se desperdicia --la puerta a las actas está en esa
     misma pantalla--. */
  function actaDe(debateId) {
    return (actas || []).filter(function (a) {
      return a.debate && a.debate.id === debateId;
    })[0] || null;
  }

  /* Al firmar una nueva, la lista en memoria ya no es la de ahora. */
  window.ATWI.olvidarActas = function () { actas = null; };

  /* De vuelta al historial después de estrenar un veredicto guardado, con la
     lista recién pedida para que la insignia de «sin ver» ya no esté. */
  /* Se vuelve a donde se estaba, no a un sitio fijo. Y la fila se actualiza EN
     MEMORIA --`visto` puesto, que es justo lo que acaba de pasar en el
     servidor-- en vez de tirar el historial entero: tirándolo, la portada se
     quedaba sin saber si había OTRO resultado pendiente hasta que alguien
     entrara al historial a que se volviera a pedir. */
  window.ATWI.alEstrenarVeredicto = function (id) {
    var d = (historial || []).filter(function (x) { return x.id === id; })[0];
    if (d && d.resultado) d.resultado.visto = new Date().toISOString();
    irA(volverTrasLaPartida);
  };

  /* Y al terminar una partida jugada entera, lo mismo. Este enganche estaba
     declarado en `partida.js` y no lo definía nadie, así que cerrar el
     veredicto de una partida recién jugada dejaba al fondo la pantalla de
     antes con el historial viejo: la partida que se acababa de jugar no
     aparecía hasta recargar. */
  window.ATWI.alTerminarPartida = function () {
    historial = null;
    irA(volverTrasLaPartida);
  };

  /* Buscador y filtros. Van juntos porque responden a la misma pregunta:
     «¿qué me queda por debatir de esto?». */
  /* EL CAMPO DE TEXTO SE PLIEGA Y LOS FILTROS NO (petición del titular,
     2026-09-16). No es la misma clase de control: los tres chips son el estado
     de la lista —se leen sin usarlos y dicen que se puede acotar—, mientras que
     el campo de texto es una herramienta que solo sirve cuando ya sabes qué
     palabra buscar, y ocupaba una fila entera de la primera pantalla para eso. */
  function barraBusqueda() {
    var f = [['todos', 'Todos'], ['sin', 'Sin estrenar'], ['con', 'Ya debatidos']];
    return '<div class="buscador">' +
        (buscadorAbierto
          ? '<input class="campo" id="q" type="search" inputmode="search" placeholder="Buscar un tema…" ' +
            'value="' + esc(busqueda) + '" autocomplete="off">'
          : '') +
        '<div class="filtros">' +
          f.map(function (x) {
            return '<button class="chip chip--filtro" data-filtro="' + x[0] + '"' +
                   (filtro === x[0] ? ' aria-pressed="true"' : '') + '>' + x[1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  /* La lupa que lo abre y lo cierra. Cambia a una cruz cuando está abierto: el
     mismo botón hace las dos cosas y tiene que decir cuál va a hacer ahora. */
  function botonBuscar() {
    return '<button class="boton-icono boton-icono--derecha" data-accion="buscar" ' +
        'aria-expanded="' + (buscadorAbierto ? 'true' : 'false') + '" ' +
        'aria-label="' + (buscadorAbierto ? 'Cerrar la búsqueda' : 'Buscar un tema') + '">' +
        icono(buscadorAbierto ? 'cerrar' : 'lupa', 24) +
      '</button>';
  }

  /* EL DIBUJO DEL ESTADO VACÍO PUEDE SER LA SALIDA (titular, 2026-09-16). Donde
     el hueco tiene UNA manera de llenarse, el dibujo que anuncia el hueco es el
     sitio donde la mano va a ir a tocar; dejarlo inerte obliga a subir la vista
     a buscar el botón. `accion` y `queHace` van juntos: sin la etiqueta, un
     lector de pantalla anunciaría un botón sin nombre. */
  function estadoVacio(emoji, titulo, texto, accion, queHace) {
    var pieza = '<div class="vacio__emoji">' + emoji + '</div>';
    if (accion) {
      pieza = '<button class="vacio__boton" data-accion="' + accion + '" ' +
              'aria-label="' + esc(queHace || titulo) + '">' + pieza + '</button>';
    }
    return '<div class="vacio">' + pieza +
        '<h2 style="margin-bottom:var(--e-2)">' + esc(titulo) + '</h2>' +
        '<p class="chico">' + esc(texto) + '</p>' +
      '</div>';
  }

  /* ======================================================================
     Vista: Perfil
     ====================================================================== */
  function pintarPerfil() {
    var p = datos.perfil();
    var caja = $('#v-perfil');
    var insignias = ['🦷', '🍽️', '🐕', '🎬', '💶', '⏰', '😄', '🛋️'];

    /* LA TARJETA DE LA CUENTA NO DESAPARECE NUNCA cuando hay servidor. Antes
       dependía de que `dentro()` dijera que sí, y si la sesión se torcía —o si
       el correo aún no había llegado del servidor— la fila entera se esfumaba
       y no había por dónde cerrar sesión ni saber con qué cuenta se estaba.
       Ahora siempre está: con sesión enseña el correo y «Salir», y sin ella lo
       dice y ofrece entrar. */
    var auth = window.ATWI.auth;
    var hayServidor = Boolean(auth && auth.hayServidor());
    var dentro = Boolean(auth && auth.dentro());
    var correo = dentro ? auth.correo() : '';

    /* El correo vive dentro de la sesión y a veces llega después —al volver del
       enlace del correo la sesión no lo trae—. Se pregunta y se repinta. */
    if (dentro && !correo && !pintarPerfil.preguntando) {
      pintarPerfil.preguntando = true;
      auth.quienSoy().then(function () { pintarPerfil.preguntando = false; pintarPerfil(); })
                     .catch(function () { pintarPerfil.preguntando = false; });
    }

    caja.innerHTML =
      /* Toda la ficha es un botón: el nombre y el dibujo se cambian desde
         aquí. Antes solo decía «Sin nombre todavía» y no había por dónde
         escribirlo. */
      '<button class="ficha" data-accion="editar-ficha">' +
        avatarHTML(p, 'ficha__avatar') +
        '<span class="ficha__nombre">' +
          (p.nombre ? esc(p.nombre) : 'Ponte un nombre') +
          icono('lapiz', 22) +
        '</span>' +
        '<span class="chico suave">Nivel ' + p.nivel + '</span>' +
      '</button>' +

      /* La cuenta va ARRIBA, no enterrada bajo las insignias: quien busca
         cambiar de cuenta no debería tener que hacer scroll para encontrarlo. */
      (hayServidor
        ? '<div class="cuenta">' +
            '<span class="cuenta__quien">' +
              '<span class="cuenta__eti">' + (dentro ? 'Sesión iniciada' : 'Sin sesión') + '</span>' +
              '<span class="cuenta__correo">' +
                (dentro ? esc(correo || 'Tu cuenta') : 'Entra para jugar con otra persona') +
              '</span>' +
            '</span>' +
            (dentro
              ? '<button class="boton boton--suave cuenta__salir" data-accion="salir">' +
                  icono('salir', 22) + 'Salir</button>'
              : '<button class="boton boton--suave cuenta__salir" data-accion="entrar">Entrar</button>') +
          '</div>'
        : '') +

      '<div class="contadores" style="margin-top:var(--e-4)">' +
        contador(p.debates, 'Debates', 'debate') +
        contador(p.acuerdos, 'Acuerdos', 'acuerdo') +
        contador(p.semanasActivas, 'Semanas', 'premio') +
      '</div>' +

      /* Aquí había una tarjeta explicando que no hay marcador entre jugadores.
         La REGLA sigue en pie y no se negocia —contadores separados, jamás lado
         a lado, ni Elo ni clasificación de ningún tipo; ver CLAUDE.md—, pero no
         hace falta anunciarla en pantalla: una decisión de diseño que funciona
         no necesita defenderse cada vez que se abre el perfil. */
      '<h2 style="margin:var(--e-5) 0 var(--e-3)">Insignias</h2>' +
      '<div class="insignias">' +
        insignias.map(function (e, i) {
          var ganada = i < p.insignias.length;
          return '<div class="insignia' + (ganada ? '' : ' insignia--bloqueada') + '">' + (ganada ? e : '🔒') + '</div>';
        }).join('') +
      '</div>' +

      '<div class="apilado" style="margin-top:var(--e-6)">' +
        '<button class="boton boton--fantasma boton--bloque" data-accion="olvidar">Borrar mis datos de este dispositivo</button>' +
      '</div>';
  }

  function contador(n, que, familia) {
    return '<div class="contador' + (familia ? ' contador--' + familia : '') + '">' +
        '<div class="contador__n">' + n + '</div>' +
        '<div class="contador__que">' + que + '</div>' +
      '</div>';
  }

  /* --- Editar la ficha: el nombre y el personaje ------------------------------
     El nombre vive en el servidor y el aparato solo lo copia, así que se guarda
     en los dos sitios. Sin servidor se queda en local y ya está.

     Antes esto era un dibujo de una lista de emojis más un color de una lista de
     diez. Ahora son Kai y Luna, y con ellos se va la elección de color: el color
     es del personaje, y dejar elegirlo aparte permitía a Kai salir en rosa y a
     Luna en azul, que es romperles la identidad. */
  /* EL COLOR DEJÓ DE SER UN ARO. Había diez tonos y lo único que cambiaban era
     el borde del avatar; ahora hay cuatro y cada uno es un DIBUJO distinto, con
     la chaqueta y las zapatillas pintadas en la lámina. La lista vive en
     `personajes.js` junto a las piezas, no aquí: si se separan, el día que
     entre un color nuevo habrá un selector que ofrece un dibujo que no existe. */
  var personajeElegido = 'kai';
  var colorElegido = 'azul';

  /** El círculo del avatar: la cara del personaje, con su aro de color. */
  function avatarHTML(p, clase) {
    return window.ATWI.fichaHTML(p.avatar, clase, p.avatarBorde);
  }

  /** La muestra en vivo de la ficha que se está editando. */
  function muestraFicha() {
    return window.ATWI.fichaHTML(personajeElegido, 'avatar--retrato', colorElegido)
      .replace('class="avatar', 'id="f-muestra" class="avatar');
  }

  /* La misma pantalla sirve para mi ficha y para la del invitado. Lo único que
     cambia es de dónde salen los valores, si se pide el nombre, y que al
     invitado no se le deja mi color: dos fichas iguales no se distinguen en
     la sala, que es justo para lo que sirven. */
  var editandoFicha = 'yo';    // 'yo' | 'invitado'

  function abrirFicha(quien) {
    editandoFicha = quien === 'invitado' ? 'invitado' : 'yo';
    var deInvitado = editandoFicha === 'invitado';
    var p = datos.perfil();
    var g = deInvitado ? fichaDelInvitado(($('#p-otro') && $('#p-otro').value || '').trim()) : null;

    personajeElegido = deInvitado ? g.avatar : p.avatar;
    colorElegido = window.ATWI.elColor(deInvitado ? g.color : p.avatarBorde);

    /* EL VETO CAMBIÓ DE EJE, y no por gusto. Antes se apartaba MI COLOR —dos
       aros iguales no se distinguían— y dos Kai en la misma sala valían. Ahora
       el color ES el dibujo, así que dos Kai en azul son la misma figura
       exacta: indistinguibles de verdad, no solo parecidas. Lo que se aparta
       pasa a ser MI PERSONAJE, y el color queda libre —decisión del titular:
       «no podrán ser el mismo personaje, eso es suficiente»—. */
    var vetado = deInvitado ? p.avatar : '';
    var chocaba = deInvitado && personajeElegido === vetado;
    if (chocaba) personajeElegido = window.ATWI.otroPersonaje(vetado);

    $('#m-perfil .modal__titulo').textContent = deInvitado
      ? (g.nombre ? 'La ficha de ' + g.nombre : 'La ficha de tu invitado')
      : 'Tu ficha';

    /* El retrato va AL LADO del nombre, no centrado encima: centrado se comía
       unos 120 px de alto y obligaba a hacer scroll en una pantalla que se
       decide de un vistazo. Es además el mismo patrón que la ficha del
       invitado, donde el círculo ya vive junto a su campo. */
    $('#m-perfil .modal__cuerpo').innerHTML =
      '<div class="apilado-5" style="padding-top:var(--e-3)">' +

        (deInvitado
          /* También en fila, por lo mismo: centrado y con tres renglones de
             explicación debajo, esta pantalla pedía scroll. */
          ? '<div class="con-ficha">' +
              muestraFicha() +
              '<span class="chico suave">Solo para jugar aquí: no es una cuenta ni tiene ' +
                'historial. Se recuerda en este teléfono.</span>' +
            '</div>'
          : '<label style="display:block">' +
              '<span class="chico" style="font-weight:700">¿Cómo te llamamos?</span>' +
              '<span class="con-ficha" style="margin-top:6px">' +
                muestraFicha() +
                '<input class="campo" id="f-nombre" data-nombre type="text" maxlength="' + datos.NOMBRE_MAX + '" ' +
                  'autocomplete="given-name" placeholder="Tu nombre" value="' + esc(p.nombre) + '">' +
              '</span>' +
              /* Se dice ANTES de escribir, no al rechazar: la razón del límite
                 —el rótulo de la sala— se explica sola con «así te ve». */
              '<span class="chico tenue" style="display:block;margin-top:6px">' +
                'Tu primer nombre o un apodo, una sola palabra: así te ve la otra ' +
                'persona en la sala y en el resultado.</span>' +
            '</label>') +

        /* CADA PERSONAJE APARECE UNA VEZ, no cuatro. Decisión del titular: la
           cara se elige aquí y el color aparte, y al tocar una cara se carga su
           variante del color que esté puesto. Poner las veinticuatro fichas
           sería la misma decisión partida en dos pantallas. */
        '<div>' +
          '<span class="chico" style="font-weight:700">' +
            (deInvitado ? '¿Con quién juega?' : '¿Con quién juegas?') + '</span>' +
          '<div class="personajes" style="margin-top:var(--e-2)">' +
            window.ATWI.quienes().map(function (q) {
              var suyo = q.clave === vetado;
              return '<button class="personaje' + (suyo ? ' personaje--tomado' : '') + '"' +
                ' data-personaje="' + q.clave + '"' + (suyo ? ' disabled' : '') +
                (q.clave === personajeElegido ? ' aria-pressed="true"' : '') +
                ' style="--pj:' + window.ATWI.colorPersonaje(colorElegido) + '">' +
                window.ATWI.fichaHTML(q.clave, 'personaje__cara', colorElegido) +
                '<span class="personaje__nombre">' + esc(q.nombre) + '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
          (deInvitado
            ? '<p class="chico' + (chocaba ? ' aviso-aro' : ' tenue') + '" style="margin-top:6px">' +
              (chocaba
                ? 'Ese personaje ya es el tuyo, así que le pusimos otro.'
                : 'El tuyo está apartado: dos figuras iguales no se distinguen en ' +
                  'la sala.') + '</p>'
            : '') +
        '</div>' +

        /* EL COLOR NO ES UN ADORNO: es la ropa del dibujo. Al tocarlo se
           recargan las seis caras de arriba, porque lo que se está eligiendo es
           con qué versión se juega. */
        '<div>' +
          '<span class="chico" style="font-weight:700">' +
            (deInvitado ? 'Su color' : 'Tu color') + '</span>' +
          '<div class="colores" style="margin-top:var(--e-2)">' +
            window.ATWI.colores().map(function (c) {
              return '<button class="color" data-color="' + c.clave + '"' +
                (c.clave === colorElegido ? ' aria-pressed="true"' : '') +
                ' aria-label="' + esc(c.nombre) + '">' +
                '<i style="background:' + c.tono + '"></i></button>';
            }).join('') +
          '</div>' +
          '<p class="chico tenue" style="margin-top:6px">' +
            'Cambia la ropa del personaje, no solo el borde. Los dos pueden ' +
            'llevar el mismo.</p>' +
        '</div>' +

        '<p class="chico" id="f-error" style="color:var(--peligro)"></p>' +
      '</div>';

    $('#m-perfil .modal__pie button').textContent = deInvitado ? 'Listo' : 'Guardar';
    abrirModal('m-perfil');
    setTimeout(function () { var n = $('#f-nombre'); if (n && !p.nombre) n.focus(); }, 60);
  }

  function refrescarMuestra() {
    var m = $('#f-muestra');
    if (m) m.outerHTML = muestraFicha();
  }

  function guardarFicha() {
    /* La del invitado no se guarda en ningún perfil: se queda en la propuesta y
       se recuerda al empezar la partida, cuando ya se sabe su nombre. */
    if (editandoFicha === 'invitado') {
      propuesta.otroAvatar = personajeElegido;
      propuesta.otroColor = colorElegido;
      cerrarModal('m-perfil');
      var bf0 = $('#p-ficha-otro');
      if (bf0) bf0.outerHTML = window.ATWI.fichaHTML(propuesta.otroAvatar, 'avatar--chico', colorElegido)
        .replace('class="avatar', 'id="p-ficha-otro" class="avatar');
      refrescarRepresentantes();
      return;
    }

    var nombre = datos.limpiarNombre($('#f-nombre').value);
    var mal = datos.errorDeNombre(nombre);
    if (mal) { $('#f-error').textContent = mal; return; }

    var fichaElegida = personajeElegido;
    datos.actualizar({ nombre: nombre, avatar: fichaElegida, avatarBorde: colorElegido });
    cerrarModal('m-perfil');
    pintarPerfil();
    refrescarFichaCabecera();
    if (vistaActual === 'jugar') pintarJugar();

    if (window.ATWI.auth && window.ATWI.auth.dentro()) {
      var auth = window.ATWI.auth;
      /* El color todavía no tiene columna en la base: va en la migración 0010,
         que está escrita y sin aplicar. Se intenta con él y, si el servidor lo
         rechaza por no conocerlo, se reintenta sin él para no perder el nombre
         por un campo de adorno. */
      auth.guardarPerfil({ nombre: nombre, avatar: fichaElegida, avatar_fondo: colorElegido })
        .catch(function () {
          return auth.guardarPerfil({ nombre: nombre, avatar: fichaElegida });
        })
        .catch(function () { /* sin red se queda en local y se reintenta al volver */ });
    }
  }

  /* ======================================================================
     El buzón
     ====================================================================== */
  /* Cada tipo lleva el icono ILUSTRADO que le corresponde de verdad, no un
     emoji del sistema —que cada teléfono dibuja a su manera— ni uno prestado
     por parecido. Seis de los ocho tipos tienen el suyo:

       invitacion → los bocadillos: alguien te habla
       tu_turno   → el micrófono: te toca grabar
       resultado  → la insignia: es el momento de premio
       revancha   → el mazo: una revancha es un debate
       revision   → las manos: revisar un acuerdo es negociar
       acuerdo    → las manos, por lo mismo

     `vinculo` y `plataforma` todavía NO tienen icono ilustrado propio y van con
     el de línea, que se recolorea solo con el tono del tipo. Generarlos cuesta
     crédito de la API de imagen, así que no se hace sin autorización. */
  var ICONO_AVISO = {
    invitacion: 'jugar', tu_turno: 'micro', resultado: 'perfil', revancha: 'debate',
    revision: 'negociacion', acuerdo: 'negociacion',
    vinculo: 'corazon', plataforma: 'aviso'
  };

  function haceCuanto(iso) {
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'ahora mismo';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    var d = Math.floor(h / 24);
    return d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }

  /* LA CAMPANA CUENTA LAS DOS COSAS: los avisos del buzón y las partidas que
     esperan algo. Contaba solo los primeros, así que un resultado sin ver dejaba
     la campana apagada —y desde que la tarjeta de la portada se fue, eso sería
     no avisar de nada—.

     Y LATE, no solo lleva un punto: la marca de «hay algo» tiene que verse sin
     mirar el número, porque el número es de 12 px en una esquina. La animación
     va en la campana entera y se para sola a las seis repeticiones: un adorno
     que se mueve para siempre deja de leerse como un aviso y pasa a ser parte
     del mueble. */
  function refrescarPunto() {
    datos.avisos().then(function (lista) {
      var sinLeer = lista.filter(function (a) { return !a.leido; }).length +
                    partidasQueEsperan().length;
      var p = $('#buzon-punto');
      var b = $('.buzon-boton');
      if (!p) return;
      p.hidden = sinLeer === 0;
      p.textContent = sinLeer > 9 ? '9+' : String(sinLeer);
      if (b) {
        /* Se reinicia la animación quitando y poniendo la clase: si ya estaba
           puesta, el navegador no la vuelve a lanzar y un aviso nuevo pasaría
           sin que la campana se moviera. */
        b.classList.remove('buzon-boton--late');
        if (sinLeer) { void b.offsetWidth; b.classList.add('buzon-boton--late'); }
      }
    });
  }

  function abrirBuzon() {
    var caja = $('#m-buzon .modal__cuerpo');
    caja.innerHTML = '<p class="chico tenue centrado" style="padding:var(--e-6) 0">Un momento…</p>';
    abrirModal('m-buzon');

    datos.avisos().then(function (lista) {
      /* LO QUE ESPERA VA ARRIBA, antes que el buzón. Estas son las partidas que
         piden algo —un resultado sin recoger, una ronda a medias— y son la razón
         por la que la campana late. Van primero porque se resuelven tocándolas:
         lo de abajo es correo, esto es una tarea.
         No salen de la tabla `avisos`: se calculan del historial, y por eso
         antes vivían en una tarjeta de la portada. */
      var esperan = partidasQueEsperan();
      if (!lista.length && !esperan.length) {
        caja.innerHTML = estadoVacio('📭', 'Buzón vacío',
          'Aquí llegan las invitaciones a debatir, los avisos de que te toca grabar y los resultados.');
        return;
      }
      caja.innerHTML =
        (esperan.length
          ? '<div class="apilado" style="margin-bottom:var(--e-4)">' +
            esperan.map(filaQueEspera).join('') + '</div>'
          : '') +
        (lista.length ? '<div class="apilado">' + lista.map(function (a) {
        return '<button class="aviso' + (a.leido ? '' : ' aviso--nuevo') + '" ' +
            'data-tipo="' + esc(a.tipo) + '" ' +
            (a.debate ? 'data-ir-debate="' + esc(a.debate) + '"' : '') + '>' +
            '<span class="aviso__icono">' + icono(ICONO_AVISO[a.tipo] || 'aviso', 28) + '</span>' +
            '<span class="aviso__texto">' +
              '<span class="aviso__titulo">' + esc(a.titulo) + '</span>' +
              (a.cuerpo ? '<span class="aviso__cuerpo">' + esc(a.cuerpo) + '</span>' : '') +
              '<span class="aviso__cuando">' + haceCuanto(a.creado) + '</span>' +
            '</span>' +
          '</button>';
        }).join('') + '</div>' : '');

      /* Abrir el buzón es leerlo. Se marca todo lo que hay dentro.
         LAS PARTIDAS QUE ESPERAN NO SE MARCAN: no son correo, son tareas. Un
         resultado sin ver sigue sin verse aunque hayas abierto el buzón, y la
         campana tiene que seguir latiendo hasta que lo abras de verdad. */
      var nuevos = lista.filter(function (a) { return !a.leido; }).map(function (a) { return a.id; });
      if (nuevos.length) datos.marcarLeidos(nuevos).then(refrescarPunto);
    });
  }

  /* ======================================================================
     Flujo: proponer un debate
     ====================================================================== */
  var propuesta = { temaId: null, modo: null, turnos: null, juez: null };

  /* EL ULTIMO JUEZ SE RECUERDA, igual que la ficha del invitado. Quien
     encontro uno que le gusta no tiene que volver a buscarlo cada partida, y
     quien no lo ha tocado nunca se lleva uno AL AZAR la primera vez en vez de
     siempre el mismo: seis jueces de los que solo se ve uno no son seis. */
  var ULTIMO_JUEZ = 'atwi-juez';
  function juezPorDefecto() {
    var j;
    try { j = localStorage.getItem(ULTIMO_JUEZ); } catch (e) { j = null; }
    if (j && window.ATWI.esJuez(j)) return j;
    var todos = window.ATWI.jueces();
    return todos[Math.floor(Math.random() * todos.length)].clave;
  }
  function recordarJuez(j) {
    try { localStorage.setItem(ULTIMO_JUEZ, j); } catch (e) {}
  }
  /* Duración estimada de una partida según los turnos por persona. Sale de
     docs/03 §19: grabar, esperar al otro, transcribir y el veredicto. */
  /* Cuánto dura una partida según los turnos que se elijan. La tabla se queda
     completa aunque hoy solo se ofrezcan hasta tres: es una referencia de
     duración, no la lista de lo que se ofrece --eso sale de `turnosMax`--. */
  var MINUTOS = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 12 };

  function opcionesDeTurnos() {
    var l = [];
    for (var n = cfg.reglas.turnosMin; n <= cfg.reglas.turnosMax; n++) l.push(n);
    return l;
  }

  function abrirTema(id) {
    var t = datos.tema(id);
    if (!t) return;
    propuesta.temaId = id;
    /* El modo NO se toca aquí: viene elegido desde la portada. Antes se ponía a
       null y se preguntaba después; ahora llegar hasta un tema sin modo sería
       llegar por un camino que ya no existe, pero se cubre por si acaso. */
    if (!propuesta.modo) propuesta.modo = 'debate';
    if (!propuesta.turnos) propuesta.turnos = cfg.reglas.turnosPorDefecto;

    /* El tema ya lleva el color del modo: desde que se elige, el flujo entero
       va teñido y no hay que recordarlo de memoria. */
    $('#m-tema').className = 'modal modal--' + propuesta.modo;
    $('#m-tema .modal__pie button').className =
      'boton boton--bloque boton--grande boton--' + propuesta.modo;
    $('#m-tema .modal__titulo').textContent = t.titulo;

    /* CADA TROZO SE RETOCA POR SEPARADO. El enunciado y las dos posturas se
       tocan y se editan solos, sin abrir el editor entero. Es el último
       momento antes de empezar y lo que se quiere ahí es afinar una frase, no
       reescribir el tema; obligar a pasar por el formulario completo para
       cambiar media línea hacía que nadie la cambiara. */
    $('#m-tema .modal__cuerpo').innerHTML =
      '<button class="tarjeta tarjeta--aire retocable" data-retocar="enunciado" ' +
              'style="margin-bottom:var(--e-3)">' +
        '<span class="retocable__texto" style="font-family:var(--display);font-weight:800;' +
          'font-size:var(--t-h3);line-height:1.25">' + esc(t.enunciado) + '</span>' +
        '<span class="retocable__lapiz">' + icono('lapiz', 22) + '</span>' +
      '</button>' +

      /* Aquí iban «las dos posturas», una debajo de otra, y se fueron con el
         reparto: el tema es lo que se discute, no dos lados entre los que
         elegir. Siguen existiendo en el catálogo y se editan desde
         «Personalizar», porque son el material del filtro de seguridad —un tema
         que no admite dos posturas defendibles no es un desacuerdo— pero ya no
         se enseñan antes de jugar.

         Ya no hay boton de «Editar tema»: cada trozo se toca y se edita solo,
         asi que abrir el formulario entero sobra y ademas competia con los
         lapices que tiene al lado. */
      '<div class="aviso-ia">' + iconoSVG('aviso', 20) +
        '<span>Hablen libre: no hay lados asignados. Si el enunciado no se parece a la ' +
        'discusión de ustedes, tócalo y reescríbelo — el tema es una plantilla, no una ' +
        'sentencia.</span>' +
      '</div>';

    abrirModal('m-tema');
  }

  /* ======================================================================
     Retocar una sección suelta del tema
     ====================================================================== */
  /* Ya solo se retoca el enunciado: las posturas se fueron del tema. */
  var SECCIONES = {
    enunciado: { titulo: 'La pregunta', minimo: 15, max: 240,
                 pista: 'Una pregunta de opinión, con las dos salidas dentro y sin ' +
                        'inclinarse por ninguna.',
                 corto: 'La pregunta se queda corta: tiene que plantear el desacuerdo entero.' }
  };
  var retocando = null;

  function abrirRetocar(campo) {
    var t = datos.tema(propuesta.temaId);
    var s = SECCIONES[campo];
    if (!t || !s) return;
    retocando = campo;

    $('#m-retocar').className = 'modal modal--' + propuesta.modo;
    $('#m-retocar .modal__titulo').textContent = s.titulo;
    $('#m-retocar .modal__cuerpo').innerHTML =
      '<p class="chico suave" style="margin-bottom:var(--e-4)">' +
        'Cambia solo esto. Lo demás del tema se queda como está.</p>' +
      '<textarea class="campo campo--parrafo" id="r-texto" rows="4" maxlength="' + s.max + '">' +
        esc(t[campo]) + '</textarea>' +
      '<p class="chico tenue" style="margin-top:6px">' + esc(s.pista) + '</p>' +
      '<p class="chico" id="r-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>';

    $('#m-retocar .modal__pie button').className =
      'boton boton--bloque boton--grande boton--' + propuesta.modo;
    abrirModal('m-retocar');
    setTimeout(function () { var c = $('#r-texto'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }, 80);
  }

  function guardarRetoque() {
    var s = SECCIONES[retocando];
    var valor = ($('#r-texto').value || '').trim();
    if (valor.length < s.minimo) { $('#r-error').textContent = s.corto; return; }

    var campos = {};
    campos[retocando] = valor;
    var guardado = datos.retocarTema(propuesta.temaId, campos);

    cerrarModal('m-retocar');
    pintarCatalogo();
    if (!guardado) return;

    /* Se vuelve a donde se estaba. Si el retoque salió de «Antes de empezar»,
       esa pantalla se repinta conservando la postura elegida y los nombres ya
       escritos: quien está a un toque de grabar no debería perder nada por
       corregir una frase. */
    if (!$('#m-preparar').hidden) {
      abrirPreparar(true);
      revisarPreparar();
    } else if (!$('#m-tema').hidden) {
      abrirTema(guardado.id);
    }
  }

  /* ======================================================================
     Escribir un tema
     Dos cosas con la misma pantalla, porque para quien escribe son la misma:
       · REESCRIBIR uno del catálogo. El original no se toca y se puede volver.
       · CREAR uno propio, que cae en «Mis temas».
     El enunciado y las dos posturas son el material con el que trabaja el
     árbitro, así que son lo único obligatorio.
     ====================================================================== */
  var escribiendo = null;   // {id, propio} · id null = tema nuevo

  function abrirEscribir(id) {
    var t = id ? datos.tema(id) : null;
    var propio = Boolean(t && t.propio);
    var reescrito = Boolean(t && !propio && datos.estaReescrito(id));
    escribiendo = { id: id || null, propio: propio || !id };

    /* EL FORMULARIO ES EL MISMO Y PIDE OTRA COSA. En QuiénGane no se escribe
       una pregunta sino un premio, así que cambian el título, la ayuda, las
       dos etiquetas, el ejemplo y el aviso de abajo —que en los temas explica
       la prueba de las dos respuestas defendibles y aquí no viene a cuento—.
       Lo que NO cambia es el mecanismo: mismo modal, mismo guardado, mismo
       borrado. Duplicar la pantalla para cambiar seis frases habría dejado dos
       sitios donde arreglar el mismo fallo. */
    var esPremio = propuesta.modo === 'competencia';

    $('#m-escribir .modal__titulo').textContent = !t
      ? (esPremio ? 'Tu propio premio' : 'Tu propio tema')
      : (esPremio ? 'Editar premio' : 'Editar tema');

    $('#m-escribir .modal__cuerpo').innerHTML =
      '<p class="chico suave" style="margin-bottom:var(--e-4)">' +
        (t && !propio
          ? (esPremio
              ? 'Cambia el premio para que se parezca a lo que ustedes se jugarían. ' +
                'El original del catálogo no se toca: puedes volver a él cuando quieras.'
              : 'Cambia la pregunta para que se parezca a la discusión de ustedes. ' +
                'El tema original del catálogo no se toca: puedes volver a él cuando quieras.')
          : (esPremio
              ? 'Escribe qué hace o qué deja quien pierda. Algo concreto, entre ustedes ' +
                'dos, que se pueda cumplir esta semana.'
              : 'Escríbelo como una pregunta de opinión, con las dos salidas dentro. ' +
                'Nadie elige lado: cada quien dice lo suyo al hablar.')) +
      '</p>' +

      (reescrito
        ? '<div class="reescrito" style="margin-bottom:var(--e-4)">' +
            window.ATWI.iconoSVG('lapiz', 16) +
            '<span>Reescrito por <strong>' + esc(t.editadoPor || 'alguien') + '</strong>' +
            (t.editado ? ' · ' + haceCuanto(t.editado) : '') + '</span>' +
          '</div>'
        : '') +

      '<div class="apilado-5">' +
        campoTexto('e-titulo', 'Título corto', t ? t.titulo : '', 'input',
                   esPremio
                     ? 'Cómo lo van a ver en la lista. Por ejemplo: «El control remoto».'
                     : 'Cómo lo van a ver en la lista. Por ejemplo: «El tubo de pasta».', 60) +
        campoTexto('e-enunciado', esPremio ? 'El premio' : 'La pregunta',
                   t ? t.enunciado : '', 'textarea',
                   esPremio
                     ? 'Por ejemplo: «Quien gane controla la tele todo el fin de semana» ' +
                       'o «Quien pierda lava los platos tres días».'
                     : 'Una pregunta de opinión. Por ejemplo: «¿Los platos se lavan al ' +
                       'terminar de comer o pueden esperar a la mañana?».', 240) +

        '<p class="chico" id="e-error" style="color:var(--peligro)"></p>' +
      '</div>' +

      /* LA PRUEBA QUE ANTES HACÍAN LAS POSTURAS. Se pedían dos y si una era
         indefendible el tema no valía. Sin ellas, la prueba se hace sobre la
         propia pregunta, y por eso este aviso dice qué tiene que cumplir: si
         solo admite una respuesta decente, no es un desacuerdo, es un acusado y
         un fiscal, y el árbitro no tendría nada que arbitrar. */
      '<div class="aviso-ia" style="margin-top:var(--e-4)">' + iconoSVG('aviso', 20) +
        (esPremio
          /* La misma idea que el aviso de los temas, por el otro lado: allí se
             protege al que perdería un juicio injusto y aquí al que perdería
             algo que no quería apostar. Lo dice también la línea `clave` del
             modo, y es la regla que hace que este modo sea un juego. */
          ? '<span>Es <strong>entre ustedes dos</strong>: quien pierda hace o deja algo a ' +
            'quien gane. Que se pueda cumplir esta semana y que perderlo no duela.</span>'
          : '<span>Escríbelo como <strong>pregunta</strong>, y que las dos respuestas se ' +
            'puedan defender. Si solo hay una respuesta decente, eso no es un desacuerdo: ' +
            'es una acusación, y el resultado no valdría nada.</span>') +
      '</div>' +

      (reescrito
        ? '<button class="boton boton--fantasma boton--bloque" data-accion="devolver-tema" ' +
          'style="margin-top:var(--e-5)">' + icono('cambiar', 22) +
          'Volver al tema del catálogo</button>'
        : '') +
      (propio
        ? '<button class="boton boton--fantasma boton--bloque" data-accion="borrar-tema" ' +
          'style="margin-top:var(--e-3);color:var(--peligro)">Borrar este ' +
          (esPremio ? 'premio' : 'tema') + '</button>'
        : '');

    var guardar = $('#e-guardar');
    if (guardar) guardar.textContent = esPremio ? 'Guardar el premio' : 'Guardar el tema';

    abrirModal('m-escribir');
    setTimeout(function () { var n = $('#e-titulo'); if (n && !t) n.focus(); }, 60);
  }

  /* El peso del tema —ligera, media, profunda— ya no se elige al escribirlo:
     todos valen lo mismo a la hora de jugarlos. Se conserva el que traiga el
     tema del catálogo para no perder el dato, y los propios nacen en «media». */
  var intensidadElegida = 'media';

  function campoTexto(id, etiqueta, valor, tipo, pista, max) {
    var control = tipo === 'textarea'
      ? '<textarea class="campo campo--parrafo" id="' + id + '" rows="3" maxlength="' + max + '">' + esc(valor) + '</textarea>'
      : '<input class="campo" id="' + id + '" type="text" maxlength="' + max + '" value="' + esc(valor) + '">';
    return '<label style="display:block">' +
        '<span class="chico" style="font-weight:700">' + esc(etiqueta) + '</span>' +
        '<span style="display:block;margin-top:6px">' + control + '</span>' +
        '<span class="chico tenue" style="display:block;margin-top:6px">' + pista + '</span>' +
      '</label>';
  }

  function guardarTema() {
    var v = function (id) { return ($('#' + id).value || '').trim(); };
    var titulo = v('e-titulo'), enunciado = v('e-enunciado');
    /* CADA CLASE SE VALIDA CONTRA LO QUE ES. A un tema se le exige que ofrezca
       dos salidas —sin eso no hay nada que discutir—; a un premio eso no se le
       puede pedir, porque no es una disyuntiva sino una sola cosa que alguien
       se lleva. Lo que sí se le pide es que se sepa DE QUIÉN es: sin eso, «las
       próximas tres películas» no dice quién las elige. */
    var esPremio = propuesta.modo === 'competencia';
    var fallo = titulo.length < 3 ? 'El título necesita al menos tres letras.' : esPremio
      ? (enunciado.length < 12
          ? 'El premio se queda corto: di qué se lleva quien gane.'
          : !/gane|pierda|ganador|perdedor/i.test(enunciado)
            ? 'Falta de quién es: escríbelo como «Quien gane…» o «Quien pierda…».' : '')
      : (enunciado.length < 15
          ? 'La pregunta se queda corta: tiene que plantear el desacuerdo entero.'
          /* No se exige el signo de interrogación —hay preguntas sin él— pero sí
             que ofrezca dos salidas, que es lo que hace que haya qué discutir. */
          : !/\bo\b/i.test(enunciado)
            ? 'Falta la otra salida: la pregunta tiene que ofrecer dos.' : '');
    if (fallo) { $('#e-error').textContent = fallo; return; }

    var t = datos.tema(escribiendo.id);
    var campos = { titulo: titulo, enunciado: enunciado,
                   intensidad: (t && t.intensidad) || intensidadElegida };
    var guardado = escribiendo.propio
      ? datos.guardarTemaPropio(Object.assign({ id: escribiendo.id }, campos))
      : datos.reescribir(escribiendo.id, campos);

    cerrarModal('m-escribir');
    pintarCatalogo();
    /* Si se estaba mirando ese tema, se vuelve a abrir ya con lo nuevo. */
    if (propuesta.temaId === guardado.id || !$('#m-tema').hidden) abrirTema(guardado.id);
  }

  /* ======================================================================
     Antes de empezar: quién defiende qué, y con quién se juega
     Sin esto la partida arrancaba con «Tú» contra «La otra parte» y sin decir
     quién defendía cuál de las dos posturas, que es justo lo que el árbitro
     tiene que juzgar.
     ====================================================================== */
  /* Los invitados con los que ya se jugó en este teléfono, para no volver a
     escribirles el nombre ni volver a elegirles la ficha. */
  function invitadosPrevios() { return datos.invitados(); }

  /* AQUÍ ESTABAN LOS ATAJOS DE INVITADO y se quitaron (decisión del titular,
     2026-09-14). Eran una lista para tocar de un vistazo, pasaron de tres a dos
     por falta de sitio, y al final ni dos hacían falta: quien juega en este
     teléfono es casi siempre la misma persona, y para esa el campo ya viene
     relleno. Una lista de dos donde uno es siempre el bueno no es un atajo, es
     una pregunta de más.

     LO QUE SE RECUERDA SIGUE ESTANDO: `datos.recordarInvitado` guarda el último
     y `abrirPreparar` lo pone en el campo. Desaparece la pantalla, no la
     memoria. */

  /**
   * La ficha del invitado. Ya no se elige: es el personaje que no soy yo. Con
   * dos, la cuenta sale sola, y además garantiza lo que antes se pedía a mano
   * apartando mi color —que las dos fichas se distingan en la sala—.
   * Se ignora a propósito lo que hubiera guardado de partidas viejas: si me
   * cambio de personaje, el invitado tiene que moverse conmigo.
   */
  /** Un personaje que no sea el mío. Si el que viene ya lo es, el siguiente. */
  function distintoDeMi(quien) {
    var mio = datos.perfil().avatar;
    return quien === mio ? window.ATWI.otroPersonaje(mio) : quien;
  }

  function fichaDelInvitado(nombre) {
    var g = nombre ? datos.invitado(nombre) : null;
    return {
      nombre: (g ? g.nombre : nombre) || '',
      /* Si ya jugó en este teléfono se le devuelve su ficha; si no, el personaje
         que yo NO soy, que es lo que suele querer.

         Y NUNCA EL MÍO, venga de donde venga. Lo guardado puede chocar sin que
         nadie haya hecho nada raro: basta que yo cambie de personaje después de
         la última partida con esa persona. Antes valían dos Kai porque los
         distinguía el aro; desde que el color es el dibujo, dos Kai en el mismo
         color son la misma figura exacta. */
      avatar: distintoDeMi((g && g.avatar) || propuesta.otroAvatar ||
                           window.ATWI.otroPersonaje(datos.perfil().avatar)),
      /* El color SÍ puede repetirse —lo que distingue ahora es la figura— así
         que el invitado hereda el mío si no tiene uno propio. Darle otro a la
         fuerza sería decidir por él algo que ya no hace falta decidir. */
      color: window.ATWI.elColor((g && g.color) || propuesta.otroColor ||
                                 datos.perfil().avatarBorde)
    };
  }

  /**
   * `repintando` vuelve a dibujar la pantalla SIN reabrirla: se usa al retocar
   * un texto desde aquí. Reabrirla apilaría otra entrada de historial y
   * perdería la postura ya elegida y los nombres escritos.
   */
  function abrirPreparar(repintando) {
    var t = datos.tema(propuesta.temaId);
    if (!t) return;
    var p = datos.perfil();
    /* El último con quien se jugó viene puesto: nombre, personaje y aro. En un
       teléfono compartido se repite casi siempre la misma pareja, y escribir el
       mismo nombre cada vez es trabajo que la app ya sabe hacer. */
    propuesta.juez = propuesta.juez || juezPorDefecto();
    propuesta.otro = propuesta.otro || (invitadosPrevios()[0] || {}).nombre || '';
    var g = fichaDelInvitado(propuesta.otro);
    propuesta.otroAvatar = g.avatar;
    propuesta.otroColor = g.color;

    $('#m-preparar').className = 'modal modal--' + propuesta.modo;
    $('#m-preparar .modal__cuerpo').innerHTML =
      /* AQUÍ ARRIBA IBA EL ENUNCIADO, EN UNA TARJETA RETOCABLE, Y SE QUITÓ
         (decisión del titular, 2026-09-14). El argumento para tenerlo era que
         este es el último momento antes de grabar y es cuando se ve que una
         frase no dice lo que se discute de verdad. Pero el enunciado YA SE LEYÓ
         Y SE CONFIRMÓ en la pantalla anterior --`m-tema`, que lleva la misma
         tarjeta con su lápiz-- y va a estar presente TODA la ronda en la
         cabecera de la sala. Repetirlo aquí no añadía una oportunidad de
         corregirlo, añadía un renglón de leer lo mismo por tercera vez, y
         empujaba hacia abajo lo que esta pantalla sí decide: turnos, invitado,
         abogados y juez.
         El camino para corregirlo no se pierde: está una pantalla atrás, y
         desde aquí se llega con el botón de volver. */
      /* LA ETIQUETA Y LOS CÍRCULOS EN EL MISMO RENGLÓN. Al encogerlos a la
         mitad, el título ocupaba un renglón entero para presentar tres piezas
         que ya no lo llenaban, y la pantalla ganaba altura sin ganar nada. */
      '<div class="turnos-linea">' +
        /* «Turnos por persona» y no «¿Cuántos turnos?» (decisión del titular):
           la pregunta no decía DE QUÉ eran los turnos, y tres turnos son tres
           de cada uno, o sea seis intervenciones. Quien leía la pregunta podía
           entender que eran tres en total y elegir pensando en la mitad de
           partida de la que iba a jugar. */
        '<h3 style="margin:0">Turnos por persona</h3>' +
        '<div class="turnos-fila">' +
        /* LA LISTA SALE DE LA CONFIGURACIÓN, no escrita a mano. Estaba fija en
           `[1,2,3,4,5]`, así que bajar `turnosMax` no habría cambiado nada:
           la pantalla habría seguido ofreciendo cinco y la base los habría
           rechazado al guardar. */
        opcionesDeTurnos().map(function (n) {
          var conCupo = cfg.reglas.turnosConCupo.indexOf(n) !== -1;
          return '<button class="turno-ficha' + (conCupo ? ' turno-ficha--cupo' : '') + '" ' +
            'data-turnos="' + n + '"' + (propuesta.turnos === n ? ' aria-pressed="true"' : '') + '>' +
            '<span class="turno-ficha__n">' + n + '</span>' +
            '<span class="turno-ficha__min">' + MINUTOS[n] + ' min</span>' +
          '</button>';
        }).join('') +
        '</div>' +
      '</div>' +
      (cfg.reglas.turnosConCupo.length
        ? '<p class="chico tenue" style="margin:var(--e-2) 0 var(--e-5)">' +
            cfg.reglas.turnosConCupo.join(' y ') + ' turnos necesitan cupo.</p>'
        : '<div style="height:var(--e-4)"></div>') +

      /* AQUÍ NO SE ENSEÑA NINGUNA POSTURA. Ni para elegir ni como ejemplo: se
         probó a dejarlas de pista y siguen siendo punteros —leerlas antes de
         hablar ya te coloca en un lado—. El tema se plantea y cada quien opina
         libre. Si los dos acaban a favor de lo mismo con palabras distintas,
         vale igual, y el juez lo dice: es la discusión de horas en la que los
         dos defendían la misma idea sin enterarse. */

      /* SOLO EL INVITADO (decisión del titular, 2026-09-14). El campo del
         nombre propio se quitó: viene del perfil y ya se ve en la cabecera y en
         la línea de abogado, así que preguntarlo aquí era pedir dos veces algo
         que no cambia. Lo que sí cambia cada partida es con quién se juega, y
         eso es lo único que queda. Para cambiarse el nombre está Perfil. */

      /* La ficha del invitado se toca para elegirle dibujo y color. No es una
         cuenta: es alguien que agarró este teléfono. Pero su ficha se recuerda,
         así que la próxima vez que juegue sale como salió. */
      /* «Su nombre» se leía como «el nombre de uno» y había quien ponía el
         suyo dos veces. «Nombre de invitado» no admite esa lectura. */
      /* LOS ATAJOS VAN EN EL RENGLÓN DEL RÓTULO, a la derecha. Estaban debajo
         del campo y del texto de ayuda, o sea DESPUÉS de haber leído «escribí
         un nombre»: quien ya jugó con alguien lo escribía entero antes de ver
         que podía tocarlo. Arriba se ven antes de empezar a escribir, que es
         cuando sirven. */
      '<div class="fila-invitado">' +
        /* UN SOLO RÓTULO. Estaban «Invitado local» de título y «Nombre de
           invitado» de etiqueta, uno encima del otro diciendo lo mismo. Se
           queda el título, con los atajos a su derecha en la misma fila. */
        /* «Invitado» a secas: que la partida es local se sabe desde que se
           eligió «Jugar los dos en este móvil», y repetirlo aquí contesta una
           pregunta que nadie se estaba haciendo. */
        '<h3 style="margin:0">Invitado</h3>' +
      '</div>' +
      /* EL CAMPO PRIMERO Y LA FICHA DESPUÉS. Va en el orden del HTML y no con
         `row-reverse`: así el tabulador pasa por el nombre antes que por el
         dibujo, que es el orden en que se rellena. */
      '<div class="con-ficha" style="margin-top:6px">' +
        '<input class="campo" id="p-otro" data-nombre type="text" maxlength="' + datos.NOMBRE_MAX + '" ' +
          'autocomplete="off" placeholder="¿Con quién juegas?" value="' + esc(propuesta.otro) + '">' +
        '<button type="button" class="avatar-boton" data-accion="ficha-invitado" ' +
          'aria-label="Elegir el aro de su ficha">' +
          window.ATWI.fichaHTML(propuesta.otroAvatar, 'avatar--chico', propuesta.otroColor)
            .replace('class="avatar', 'id="p-ficha-otro" class="avatar') +
        '</button>' +
      '</div>' +
      /* Aquí había un párrafo explicando «una sola palabra, primer nombre o
         apodo». Se fue: el campo ya no ADMITE un espacio ni una letra de más,
         así que la regla se aprende al escribir en vez de leyéndola. Lo único
         que el campo no puede decir solo —que tocando el círculo se le elige
         personaje— lo dice el propio círculo al tocarlo. */

      /* Los tres últimos, y solo tres: es una lista para tocar de un vistazo, no
         un historial. Cuentan como el mismo quien repite NOMBRE Y PERSONAJE;
         el mismo nombre con otro personaje es otra ficha. */
      /* EL ABOGADO. Se elige POR SEPARADO y antes de empezar: uno puede jugar
         con abogado y el otro a pelo, y esa asimetría es parte de la gracia.
         Va aquí y no dentro de la sala porque cambiar las reglas a mitad de
         partida no es una opción, y porque cambia lo que cuesta cada turno. */
      '<h3 class="centrado" style="margin:var(--e-5) 0 var(--e-2)">¿Quién los representa?</h3>' +
      /* UNA LÍNEA, y el resto en el modal. Aquí estaba el párrafo entero
         explicando qué hace un abogado y qué riesgo tiene: cuatro renglones
         para una decisión que la mayoría va a dejar como viene, y encima
         repetidos, porque el modal lo vuelve a decir justo cuando hace falta
         leerlo —al elegir—. */
      '<p class="chico tenue centrado" style="margin-bottom:var(--e-4)">' +
        'Cada quien se representa a sí mismo. Prendé la llave para que un ' +
        'personaje te haga de abogado.</p>' +
      pintarRepresentantes() +

      /* EL JUEZ VA DEBAJO DE LOS DOS, y el sitio es la mitad de la decision.
         Arriba de ellos se leeria como el titulo de la seccion; al lado, como
         un tercer duelista. Debajo se lee en el orden correcto: estos dos
         discuten, y este los juzga.

         Es un renglon y no dos retratos como los abogados, y tambien a
         proposito: el abogado cambia lo que el juez va a OIR --es media
         partida-- mientras que el juez, por ahora, solo cambia quien lo cuenta
         al final. Darle el mismo peso en pantalla diria que pesa lo mismo. */
      '<h3 class="centrado" style="margin:var(--e-5) 0 var(--e-2)">¿Quién juzga?</h3>' +
      pintarJuez() +

      '<p class="chico" id="p-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>' +

      /* Y aquí había un aviso diciendo que quién abre se sortea. También se
         fue: el botón dice «Sortear quién abre» y a continuación se ve la
         ruleta girando. Explicar por escrito lo que se va a ver en pantalla dos
         segundos después es contar el final antes de la película. */
      '';

    var b = $('#m-preparar .modal__pie button');
    b.className = 'boton boton--bloque boton--grande boton--' + propuesta.modo;
    /* Se revisa AL ABRIR y no solo al escribir. Antes el botón nacía apagado y
       lo encendía elegir postura; sin ese paso, con los dos nombres ya puestos
       —que es el caso normal— el botón se quedaba apagado sin nada que hacer
       para encenderlo salvo tocar un campo. */
    revisarPreparar();
    if (!repintando) abrirModal('m-preparar');
  }

  /* QUIÉN REPRESENTA A CADA UNO EN ESTE DUELO, que ya no es lo mismo que su
     avatar de perfil. Dos ejes que estaban pegados:

       «Tu voz»      -> se ve tu avatar de perfil y se oye tu grabación.
       un personaje -> se ve y se oye ese personaje, de abogado.

     DOS ABOGADOS NO PUEDEN SER EL MISMO PERSONAJE: se distinguen por dibujo y
     por voz, y con la misma cara y la misma voz no se distinguen. Pero solo
     entre abogados —quien va con su voz no bloquea a nadie, porque lo que de
     verdad los separa es que una de las dos voces es humana—.

     Aquí el bloqueo es de pantalla porque los dos eligen en el mismo teléfono.
     En remoto lo arbitra la base con un índice único (migración 0019): el
     primer INSERT que llega gana. Dos relojes distintos no pueden decidirlo. */
  function pintarRepresentantes() {
    var p = datos.perfil();
    var lados = [
      { k: 'yo', repre: propuesta.repreYo, ficha: p.avatar, color: p.avatarBorde },
      { k: 'otro', repre: propuesta.repreOtro, ficha: propuesta.otroAvatar,
        color: propuesta.otroColor }
    ];
    return '<div class="repres">' + lados.map(function (x) {
      /* La ficha que se ve es la del DUELO: el abogado si lo hay, el avatar de
         perfil si no. Se ve de un vistazo con quién se va a jugar, sin abrir
         nada. */
      var suyo = x.repre || x.ficha;
      var conAbogado = Boolean(x.repre);
      /* EL COLOR DE LA PIEZA ES EL DE SU FICHA, no el del modo. Cuando hay
         abogado, el aro y el tinte salen del color que eligió quien juega
         --azul, verde, amarillo o morado-- porque eso es lo que ya hace el
         dibujo: «el abogado sale en el color de perfil de quien lo contrata,
         que es lo que lo hace reconociblemente suyo». Con el color del modo,
         las dos piezas se encendían iguales y dejaban de ser de nadie. */
      return '<div class="repre' + (conAbogado ? ' repre--conabogado' : '') + '"' +
          ' style="--suyo:' + window.ATWI.colorPersonaje(x.color) + '">' +
          /* EL RETRATO MANDA. Esto eran dos tarjetas de ancho completo con la
             ficha diminuta a un lado: ocupaban media pantalla para enseñar dos
             dibujos de 26 px. Ahora son dos retratos grandes uno al lado del
             otro —que es como se van a ver en el choque de puños— con su nombre
             y su llave debajo. La decisión se ve, no se lee. */
          /* SIEMPRE EN EL COLOR DEL CLIENTE, también con abogado. Aquí se
             pasaba `null` cuando había abogado, porque el color era un aro y un
             aro ajeno confundía. Ahora el color es la ropa y la regla del
             titular es al revés: el abogado sale en el color de perfil de quien
             lo contrata, que es lo que lo hace reconociblemente suyo. */
          '<div class="repre__retrato">' +
            window.ATWI.fichaHTML(suyo, 'avatar--duelo', x.color) +
          '</div>' +
          '<span class="repre__quien" id="repre-' + x.k + '"></span>' +
          '<button type="button" class="repre__llave" data-abogado="' + x.k + '"' +
            (conAbogado ? ' aria-pressed="true"' : '') +
            ' aria-label="Usar abogado"></button>' +
          /* EL MISMO TEXTO PARA LOS DOS. Decía «Tu voz» y «Su voz», que en un
             teléfono compartido no aclara nada —el «tu» cambia de dueño cada
             turno— y además no decía lo que de verdad significa la llave
             apagada: que suena la grabación de la persona y no hay abogado. */
          '<span class="repre__como">' +
            /* «Luna defiende» y no «Luna lo defiende»: ese «lo» le pone sexo
               masculino a quien está siendo defendido, y quien está siendo
               defendido puede ser cualquiera. Sin él la frase es genérica y
               además más corta, que en este renglón se agradece. */
            (conAbogado ? esc(window.ATWI.nombrePersonaje(x.repre)) + ' defiende'
                        : 'Voz original, sin abogado') +
          '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function pintarJuez() {
    var j = propuesta.juez;
    return '<button type="button" class="juez-linea" data-accion="elegir-juez">' +
      window.ATWI.fichaJuezHTML(j) +
      '<span class="juez-linea__texto">' +
        '<span class="juez-linea__n">' + esc(window.ATWI.nombrePersonaje(j)) + '</span>' +
        '<span class="juez-linea__que">Escucha la ronda y da el veredicto</span>' +
      '</span>' +
      '<span class="juez-linea__cambiar">Cambiar</span>' +
    '</button>';
  }

  /* EL SELECTOR DE JUEZ. Como el de abogados pero sin veto: el juez es UNO para
     toda la partida y no se enfrenta a nadie, asi que ninguno queda ocupado. */
  function abrirJueces() {
    $('#m-jueces .modal__cuerpo').innerHTML =
      '<p class="chico tenue" style="margin-bottom:var(--e-2)">' +
        'Está presente toda la ronda y es quien presenta el resultado. ' +
        'Cambia la cara y la voz; no cambia cómo se puntúa.</p>' +
      '<div class="jueces-rejilla">' +
        window.ATWI.jueces().map(function (q) {
          return '<button type="button" class="juez-ficha' +
              (propuesta.juez === q.clave ? ' juez-ficha--puesta' : '') + '"' +
              ' data-juez-es="' + q.clave + '">' +
              window.ATWI.fichaJuezHTML(q.clave) +
              '<span class="juez-ficha__n">' + esc(q.nombre) + '</span>' +
            '</button>';
        }).join('') +
      '</div>';
    $('#m-jueces').className = 'modal modal--' + propuesta.modo;
    abrirModal('m-jueces');
  }

  /* EL PANEL DE ABOGADOS, en su propio modal. Se abre al encender la llave y se
     cierra al elegir: una decisión, una pantalla.

     EL QUE YA SE LLEVÓ EL OTRO SALE EN GRIS, no tachado ni escondido. Escondido,
     la rejilla se recoloca y no se entiende por qué hay uno menos; tachado hay
     que dibujar una raya encima de una cara. En gris se ve quién es y se ve que
     no está, que es lo que hay que entender. */
  var eligiendoPara = 'yo';

  function abrirAbogados(cual) {
    eligiendoPara = cual;
    var mio = cual === 'yo' ? propuesta.repreYo : propuesta.repreOtro;
    var delOtro = cual === 'yo' ? propuesta.repreOtro : propuesta.repreYo;
    /* El propio sale del perfil y ya no de un campo: ese campo se quitó. */
    var nombre = cual === 'yo' ? datos.perfil().nombre
                               : (($('#p-otro') || {}).value || '');

    var miColor = window.ATWI.elColor(cual === 'yo'
      ? datos.perfil().avatarBorde : (propuesta.otroColor || datos.perfil().avatarBorde));

    $('#m-abogados .modal__titulo').textContent =
      nombre.trim() ? 'El abogado de ' + nombre.trim() : 'Elegí el abogado';

    $('#m-abogados .modal__cuerpo').innerHTML =
      '<p class="chico tenue" style="margin-bottom:var(--e-2)">' +
        'Va a usar su voz y va a decir tu idea mejor dicha. No puede argumentar por ' +
        'vos ni traer datos que no diste. <b>¡Pero atención!</b> Puede que te ' +
        'malinterprete, como un mal abogado de verdad.</p>' +
      '<div class="abogados-rejilla">' +
        window.ATWI.quienes().map(function (q) {
          var ocupado = delOtro === q.clave;
          return '<button type="button" class="abogado-ficha' +
              (mio === q.clave ? ' abogado-ficha--puesta' : '') +
              (ocupado ? ' abogado-ficha--ocupada' : '') + '"' +
              ' data-abogado-es="' + q.clave + '"' + (ocupado ? ' disabled' : '') + '>' +
              /* EN EL COLOR DE SU CLIENTE. Decisión del titular: el abogado no
                 elige color, sale en el del perfil de quien lo contrata. Así la
                 figura que se ve en la sala es reconociblemente tuya aunque la
                 cara sea de otro. */
              window.ATWI.fichaHTML(q.clave, 'abogado-ficha__cara', miColor) +
              '<span class="abogado-ficha__n">' + esc(q.nombre) + '</span>' +
              '<span class="abogado-ficha__nota">' +
                (ocupado ? 'Ya lo tomó la otra parte' : esc(comoHabla(q.clave))) +
              '</span>' +
            '</button>';
        }).join('') +
      '</div>';
    /* LLEVA EL MODO, como las demás pantallas previas a la partida. Es la única
       que se quedaba con el lavanda de marca en medio del recorrido, y se abre
       DESDE «antes de empezar»: cambiar de fondo al entrar y volver a cambiarlo
       al salir hacía parecer que se había ido a otro sitio. */
    $('#m-abogados').className = 'modal modal--' + propuesta.modo;
    abrirModal('m-abogados');
  }

  /* Una línea por personaje para que la elección no sea a ciegas: dos dibujos
     sin más no dicen en qué se diferencian, y en lo que se diferencian es
     justo en cómo van a decir lo tuyo. */
  /* CADA LÍNEA RESUME SU PERSONALIDAD, y la personalidad de verdad vive en
     `VOCES` de `supabase/functions/turno/index.ts`. Esto es un RESUMEN, no la
     fuente: si allí se le cambia el carácter a alguno, aquí hay que venir.

     Los cuatro nuevos decían «Todavía sin voz propia» y era cierto hasta que se
     les escribió una (2026-09-14); quedó sin actualizar y la pantalla siguió
     diciendo que no tenían lo que ya tenían. Cada línea nombra su EJE, que es
     en lo que se diferencian: en cómo van a decir lo tuyo. */
  var COMO_HABLAN = {
    kai: 'Directo y con frases cortas',
    luna: 'Cálida y va encadenando',
    nico: 'Tranquilo y lo pone por pasos',
    dante: 'Seco: dice poco y se queda',
    nina: 'Con chispa, y subraya lo tuyo',
    maya: 'Pausada y lo pone en imágenes'
  };
  function comoHabla(clave) { return COMO_HABLAN[clave] || ''; }

  /* El selector se repinta SOLO, sin tocar la pantalla entera: repintarla se
     llevaría por delante los dos nombres a medio escribir.

     HAY QUE LLAMARLA CADA VEZ QUE CAMBIA LA FICHA DEL INVITADO, no solo al
     encender la llave del abogado. La ficha de cada quien sale DOS VECES en
     esta pantalla —el círculo de al lado del nombre y la línea de «¿quién los
     representa?»— y los tres sitios que la cambiaban repintaban solo el
     círculo. Resultado: el invitado aparecía de amarillo arriba y de verde
     abajo, la misma persona con dos personajes, y lo que sale en la línea de
     abajo es lo que de verdad se va a jugar. */
  function refrescarRepresentantes() {
    var caja = $('#m-preparar .repres');
    if (!caja) return;
    caja.outerHTML = pintarRepresentantes();
    nombrarAbogados();
  }

  /* El botón del abogado dice el NOMBRE de cada quien en cuanto se escribe.
     «Mi abogado» y «Su abogado» funcionan, pero con dos fichas iguales al lado
     hay que pararse a pensar cuál es cuál, y esto se decide de un vistazo. */
  function nombrarAbogados() {
    var yo = datos.limpiarNombre(datos.perfil().nombre);
    var otro = ($('#p-otro') && $('#p-otro').value || '').trim();
    var a = $('#repre-yo'), b = $('#repre-otro');
    if (a) a.textContent = yo || 'Vos';
    if (b) b.textContent = otro || 'La otra parte';
  }

  function revisarPreparar() {
    nombrarAbogados();
    /* El botón se apaga con la MISMA regla con la que se rechaza al pulsarlo.
       Tenía la suya —dos letras y nada más— y eso dejaba encender el botón con
       un nombre que luego no pasaba, que es la peor de las dos opciones. */
    /* Solo por el invitado: el propio viene del perfil, que ya pasó por esta
       misma regla en la puerta, y aquí no hay campo donde corregirlo. */
    var mal = datos.errorDeNombre($('#p-otro') && $('#p-otro').value);
    $('#m-preparar .modal__pie button').disabled = Boolean(mal);
  }

  /* De momento se juega en un solo dispositivo, por turnos, que es el modo que
     el documento permite para los temas del catálogo. Con dos teléfonos hace
     falta el servidor y llega después. */
  function sortearYJugar() {
    var t = datos.tema(propuesta.temaId);
    var otro = datos.limpiarNombre($('#p-otro').value);
    var yo = datos.limpiarNombre(datos.perfil().nombre);

    /* El propio ya no se escribe aquí, pero se comprueba igual: un perfil de
       antes de la regla del nombre puede traer algo que no pasaría hoy, y
       enterarse en la sala sería tarde. Se manda a Perfil, que es donde se
       arregla. */
    if (datos.errorDeNombre(yo)) {
      $('#p-error').textContent = 'Tu nombre no vale para la sala. Cámbialo en Perfil.';
      return;
    }
    var malOtro = datos.errorDeNombre(otro);
    if (malOtro) {
      $('#p-error').textContent = malOtro.replace('Escribe tu nombre.', 'Escribe con quién juegas.');
      return;
    }
    if (otro.toLowerCase() === yo.toLowerCase()) {
      $('#p-error').textContent = 'Se llaman igual: ponle otro nombre para no confundirse en la sala.';
      return;
    }
    /* El campo viene de la ficha, así que si se cambia aquí se cambia la ficha:
       tener dos nombres distintos para la misma persona sería peor que no
       dejarla cambiarlo. */
    if (yo !== datos.perfil().nombre) {
      datos.actualizar({ nombre: yo });
      if (window.ATWI.auth && window.ATWI.auth.dentro()) {
        window.ATWI.auth.guardarPerfil({ nombre: yo }).catch(function () {});
      }
    }
    /* La ficha del invitado se recuerda AQUÍ, que es cuando por fin se sabe su
       nombre. No crea cuenta ni historial: es memoria de este teléfono para no
       volver a preguntárselo. */
    datos.recordarInvitado({ nombre: otro, avatar: propuesta.otroAvatar,
                             color: propuesta.otroColor });
    propuesta.otro = otro;

    /* Cada jugador viaja con su ficha entera —nombre, dibujo y color—, porque
       en la sala cada intervención se marca con la ficha de quien habló, no con
       una inicial. El primero defiende la postura A y el segundo la B: eso lo
       fija quien elige postura, no el sorteo. El sorteo decide solo QUIÉN ABRE. */
    var p = datos.perfil();
    /* EL AVATAR DEL DUELO, que no tiene por qué ser el del perfil. Con abogado
       manda el personaje elegido; sin abogado, el de la ficha de cada uno. */
    var fichaMia = { nombre: yo, avatar: propuesta.repreYo || p.avatar,
                     color: p.avatarBorde, abogado: Boolean(propuesta.repreYo) };
    var fichaSuya = { nombre: otro, avatar: propuesta.repreOtro || propuesta.otroAvatar,
                      color: propuesta.otroColor, abogado: Boolean(propuesta.repreOtro) };
    /* DOS FIGURAS IGUALES NO SE PUEDEN LANZAR. El veto de arriba se aplica al
       abrir la ficha del invitado, y eso no basta: se puede llegar aquí con las
       dos iguales cambiando de personaje DESPUÉS, o eligiendo el mismo de
       abogado. Pasó de verdad --dos Nico enfrentados en el versus-- y hasta la
       sala no se notaba.

       Se mira la ficha DEL DUELO y no la del perfil: con abogado manda el
       personaje elegido, y es ése el que se ve. */
    if (fichaMia.avatar === fichaSuya.avatar) {
      var comoSe = window.ATWI.nombrePersonaje(fichaMia.avatar);
      $('#p-error').textContent = 'Los dos van con ' + comoSe + ': en la sala serían ' +
        'la misma figura y no habría cómo distinguirlos. Cambiá uno de los dos.';
      return;
    }

    var abre = Math.random() < 0.5 ? 0 : 1;

    cerrarModales(['m-preparar', 'm-tema']);
    /* Una partida nueva devuelve a donde se armó: a la portada si salió de las
       cartas de modo, al catálogo si salió de un tema. */
    volverTrasLaPartida = vistaActual;
    window.ATWI.partida.empezar({
      tema: t,
      modo: propuesta.modo,
      turnos: propuesta.turnos || cfg.reglas.turnosPorDefecto,
      publico: modoPublico || 'pareja',
      posturas: [fichaMia, fichaSuya],
      abre: abre,                // índice sobre esa lista: quién habla primero
      juez: propuesta.juez || juezPorDefecto()
    });
  }

  function proponer() {
    var t = datos.tema(propuesta.temaId);
    var esPacto = propuesta.modo === 'negociacion';

    $('#m-invitar .modal__cuerpo').innerHTML =
      '<div class="centrado" style="padding:var(--e-6) 0">' +
        '<div style="font-size:3.5rem;margin-bottom:var(--e-3)">📨</div>' +
        '<h2 style="margin-bottom:var(--e-2)">Propuesta lista</h2>' +
        '<p class="suave chico" style="max-width:26rem;margin:0 auto">' +
          'Le vas a proponer <strong>' + esc(t.titulo) + '</strong> en modo ' +
          '<strong>' + (esPacto ? 'Negociación' : 'Debate') + '</strong>. ' +
          'Podrá aceptarlo o pedirte el otro modo.' +
        '</p>' +
      '</div>' +
      '<div class="tarjeta" style="background:var(--crema-hondo);box-shadow:none">' +
        '<p class="chico suave">' +
          'Todavía no hay servidor conectado, así que la invitación no sale de este teléfono. ' +
          'Cuando lo haya, aquí saldrá el enlace para mandar por WhatsApp.' +
        '</p>' +
      '</div>';

    cerrarModales(['m-tema']);
    abrirModal('m-invitar');
  }

  /* ======================================================================
     Pintado y eventos
     ====================================================================== */
  function pintar(nombre) {
    if (nombre === 'jugar') pintarJugar();
    else if (nombre === 'catalogo') pintarCatalogo();
    else if (nombre === 'historial') pintarHistorial();
    else if (nombre === 'perfil') pintarPerfil();
  }

  /* Para quien llegue de fuera con datos nuevos: la puerta, cuando se trae el
     perfil del servidor después de arrancar. */
  window.ATWI.repintar = function () { pintar(vistaActual); };

  /* --- EL AVISO QUE NO BLOQUEA -------------------------------------------------
     Petición del titular (2026-09-15), al salir de la sala. Ahí había un
     `confirm()` del navegador, que es lo peor que se puede poner en un juego a
     pantalla completa: rompe la inmersión, sale con la tipografía del sistema,
     no se puede escribir en LATAM sin que parezca un error, y sobre todo PIDE
     UNA DECISIÓN que ya no hace falta pedir --desde que la partida se retoma
     desde el historial, salir no pierde nada--.

     Lo que corresponde es informar, no preguntar. Aparece abajo, encima de
     todo, se va solo y no atrapa el toque de nadie: `pointer-events` en ninguno
     salvo el propio aviso, que se puede tocar para quitarlo antes.

     UNO SOLO A LA VEZ. Dos avisos apilados tapan la pantalla y el segundo pisa
     al primero antes de que se lea; el nuevo reemplaza al viejo. */
  var avisoFuera = null;
  window.ATWI.aviso = function (texto) {
    var viejo = $('.aviso-flotante');
    if (viejo) viejo.remove();
    clearTimeout(avisoFuera);

    var n = document.createElement('div');
    n.className = 'aviso-flotante';
    n.setAttribute('role', 'status');
    n.textContent = texto;
    (document.querySelector('.marco') || document.body).appendChild(n);
    /* Un fotograma antes de la clase que lo sube: sin esto el navegador pinta
       el estado final directamente y no hay transición que ver. */
    requestAnimationFrame(function () { n.classList.add('aviso-flotante--puesto'); });

    function irse() {
      clearTimeout(avisoFuera);
      n.classList.remove('aviso-flotante--puesto');
      setTimeout(function () { if (n.parentNode) n.remove(); }, 260);
    }
    n.addEventListener('click', irse);
    /* SEIS SEGUNDOS y no tres: esta frase dice DÓNDE quedó la partida, que es
       una instrucción y no un «listo». Tres segundos alcanzan para ver que algo
       apareció, no para leer dónde hay que ir a buscarlo. */
    avisoFuera = setTimeout(irse, 6000);
  };

  /* Al terminar una partida el historial que hay en memoria ya no es el de
     ahora: se tira para que se vuelva a pedir. */
  window.ATWI.olvidarHistorial = function () { historial = null; };
  /* Para quien abra algo a pantalla completa desde fuera de este archivo —el
     veredicto— y necesite que el atrás del teléfono lo cierre a él y no la app. */
  window.ATWI.pasoAtras = apilarPaso;
  /* De donde salió el ensayo es a donde vuelve. Lo llama `partida.js` al cerrar
     una escena ensayada, en vez de mandar a la portada: mirar diez escenas
     seguidas no puede costar diez viajes de ida y vuelta por el menú. */
  window.ATWI.alTerminarEnsayo = function () { abrirProbador(); };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-vista]');
    if (b) {
      /* La pestaña del catálogo SIEMPRE devuelve al principio. Si guardara por
         dónde iba, quien vuelve al rato se encuentra una lista de temas sin
         recordar que entró por una categoría, y no tiene cómo saber que hay que
         retroceder para cambiar de pareja a amigos. */
      if (b.dataset.vista === 'catalogo') reiniciarCatalogo();
      irA(b.dataset.vista);
      return;
    }

    var fil = e.target.closest('[data-filtro]');
    if (fil) { filtro = fil.dataset.filtro; pintarCatalogo(); return; }

    var pub = e.target.closest('[data-publico]');
    if (pub) { modoPublico = pub.dataset.publico; categoriaAbierta = null; entrar(); pintarCatalogo(); return; }

    var cat = e.target.closest('[data-categoria]');
    if (cat) { categoriaAbierta = cat.dataset.categoria; entrar(); pintarCatalogo(); return; }

    var ret = e.target.closest('[data-retocar]');
    if (ret) { abrirRetocar(ret.dataset.retocar); return; }

    var expli = e.target.closest('[data-explicar]');
    if (expli) { abrirExplicar(expli.dataset.explicar); return; }

    /* Empezar por el modo: se guarda y se va a buscar tema con él puesto. */
    var crear = e.target.closest('[data-crear]');
    if (crear) {
      propuesta.modo = crear.dataset.crear;
      propuesta.turnos = cfg.reglas.turnosPorDefecto;
      reiniciarCatalogo();
      irA('catalogo');
      return;
    }

    /* Antes que `[data-tema]`: el de personalizar vive dentro de la misma
       tarjeta y si se mirara después, el tema se abriría igualmente. */
    var edi = e.target.closest('[data-editar-tema]');
    if (edi) { abrirEscribir(edi.dataset.editarTema); return; }

    /* Antes que `[data-partida]`. Hoy son hermanos --la papelera esta FUERA del
       boton de abrir, porque un boton dentro de otro el navegador lo desarma--
       asi que no se pisan; se deja antes igual para que el dia que la papelera
       vuelva a entrar en la tarjeta no abra la partida al tocarla. */
    var donde = e.target.closest('[data-donde]');
    if (donde) { vistaHistorial = donde.dataset.donde; pintarHistorial(); return; }

    /* Desde un acta se va a su partida. Ya no hay modal que cerrar antes: la
       lista vive en el historial. */
    var acta = e.target.closest('[data-acta-de]');
    if (acta && acta.dataset.actaDe) { abrirPartida(acta.dataset.actaDe); return; }

    var pap = e.target.closest('[data-borrar]');
    if (pap) { abrirOlvidar(pap.dataset.borrar); return; }

    var yaOlvidar = e.target.closest('[data-olvidar-ya]');
    if (yaOlvidar) { olvidarPartida(yaOlvidar.dataset.olvidarYa, yaOlvidar); return; }

    var partida = e.target.closest('[data-partida]');
    if (partida && !partida.disabled) { abrirPartida(partida.dataset.partida); return; }

    var tema = e.target.closest('[data-tema]');
    if (tema) { abrirTema(tema.dataset.tema); return; }

    var tn = e.target.closest('[data-turnos]');
    if (tn) {
      propuesta.turnos = Number(tn.dataset.turnos);
      $$('#m-preparar [data-turnos]').forEach(function (x) {
        if (Number(x.dataset.turnos) === propuesta.turnos) x.setAttribute('aria-pressed', 'true');
        else x.removeAttribute('aria-pressed');
      });
      return;
    }

    /* El abogado se enciende y se apaga tocándolo. No se repinta la pantalla
       entera: hacerlo perdería los dos nombres a medio escribir. */
    /* La llave: encenderla abre el panel, apagarla devuelve a la voz propia. */
    var llave = e.target.closest('[data-abogado]');
    if (llave) {
      var k = llave.dataset.abogado;
      var campo = k === 'yo' ? 'repreYo' : 'repreOtro';
      if (propuesta[campo]) { propuesta[campo] = null; refrescarRepresentantes(); }
      else abrirAbogados(k);
      return;
    }

    /* Elegir juez. El renglón entero abre el selector. */
    var jz = e.target.closest('[data-accion="elegir-juez"]');
    if (jz) { abrirJueces(); return; }

    var jzEs = e.target.closest('[data-juez-es]');
    if (jzEs) {
      propuesta.juez = jzEs.dataset.juezEs;
      recordarJuez(propuesta.juez);
      cerrarModal('m-jueces');
      /* Se repinta SOLO el renglón, no la pantalla: repintarla se llevaría el
         nombre del invitado a medio escribir. Es la misma razón por la que
         `refrescarRepresentantes` existe. */
      var hueco = $('#m-preparar .juez-linea');
      if (hueco) hueco.outerHTML = pintarJuez();
      return;
    }

    /* Elegir uno del panel. Se cierra al elegir: una decisión, una pantalla. */
    var esc2 = e.target.closest('[data-abogado-es]');
    if (esc2 && !esc2.disabled) {
      propuesta[eligiendoPara === 'yo' ? 'repreYo' : 'repreOtro'] = esc2.dataset.abogadoEs;
      cerrarModal('m-abogados');
      refrescarRepresentantes();
      return;
    }

    /* AQUÍ SE ATENDÍA EL TOQUE EN UN ATAJO DE INVITADO. Los atajos se quitaron
       el 2026-09-14, así que este manejador ya no puede dispararse: ningún
       elemento lleva `data-invitado`. Se va con ellos —un manejador de algo que
       no existe es una pista falsa para quien venga a leer esto—.

       Lo que hacía sigue pasando por otro lado: al ESCRIBIR un nombre ya
       recordado, el manejador de `#p-otro` devuelve su ficha. */

    var col = e.target.closest('#m-perfil .colores [data-color]');
    if (col) {
      colorElegido = col.dataset.color;
      $$('#m-perfil [data-color]').forEach(function (x) {
        if (x.dataset.color === colorElegido) x.setAttribute('aria-pressed', 'true');
        else x.removeAttribute('aria-pressed');
      });
      /* LAS SEIS CARAS SE REPINTAN, que antes no hacía falta. El color ya no es
         un aro alrededor de una cara que no cambia: es la ropa del dibujo, así
         que al tocarlo todas las fichas de arriba pasan a ser otra imagen. */
      $$('#m-perfil [data-personaje]').forEach(function (b) {
        var q = b.dataset.personaje;
        b.style.setProperty('--pj', window.ATWI.colorPersonaje(colorElegido));
        var cara = b.querySelector('.avatar');
        if (cara) cara.outerHTML = window.ATWI.fichaHTML(q, 'personaje__cara', colorElegido);
      });
      refrescarMuestra();
      return;
    }

    var pj = e.target.closest('[data-personaje]');
    if (pj && !pj.disabled) {
      personajeElegido = pj.dataset.personaje;
      $$('#m-perfil [data-personaje]').forEach(function (x) {
        if (x.dataset.personaje === personajeElegido) x.setAttribute('aria-pressed', 'true');
        else x.removeAttribute('aria-pressed');
      });
      refrescarMuestra();
      return;
    }

    /* EL PROBADOR. Sus atributos llevan todos el prefijo `pb-` y ninguno
       reutiliza los nombres de más arriba —`data-personaje`, `data-juez-es`,
       `data-color`— a propósito: esos manejadores no están acotados a su
       pantalla, así que un nombre repetido aquí dispararía el de allá. Es el
       mismo choque que hizo que el «Salir» del veredicto cerrara la sesión. */
    var pbo = e.target.closest('#m-probador [data-pb]');
    if (pbo) {
      var campo = pbo.dataset.pb;
      if (campo === 'contesta') estadoProbador().contesta[estadoProbador().modo] = pbo.dataset.val;
      else estadoProbador()[campo] = pbo.dataset.val;
      /* Cambiar de modo cambia la lista de finales, y el que estaba puesto
         puede no existir en la nueva: se cae al primero de la lista. */
      if (campo === 'modo') probador.final = FINALES[probador.modo][0].clave;
      repintarProbador();
      return;
    }

    var pbj = e.target.closest('#m-probador [data-pb-juez]');
    if (pbj) { estadoProbador().juez = pbj.dataset.pbJuez; repintarProbador(); return; }

    var pbc = e.target.closest('#m-probador [data-pb-cara]');
    if (pbc) {
      estadoProbador()[pbc.dataset.pbCara].avatar = pbc.dataset.val;
      repintarProbador();
      return;
    }

    var pbk = e.target.closest('#m-probador [data-pb-color]');
    if (pbk) {
      estadoProbador()[pbk.dataset.pbColor].color = pbk.dataset.val;
      repintarProbador();
      return;
    }

    var cerrar = e.target.closest('[data-cerrar]');
    if (cerrar) { cerrarModal(cerrar.dataset.cerrar); return; }

    var acc = e.target.closest('[data-accion]');
    if (!acc) return;
    var a = acc.dataset.accion;

    if (a === 'buzon') { abrirBuzon(); }
    else if (a === 'nuevo') { reiniciarCatalogo(); irA('catalogo'); }
    else if (a === 'probador') { if (puedeProbar()) abrirProbador(); }
    /* NO SE CIERRA EL PROBADOR AL REPRODUCIR: la revelación se pinta encima
       —z-index 60 contra 41— y al salir de ella el probador vuelve a estar
       ahí, con todo lo elegido puesto, listo para cambiar una cosa y volver a
       mirar. Cerrarlo obligaría a rearmar la escena entera cada vez. */
    else if (a === 'pb-jugar') { window.ATWI.veredicto.revelar(veredictoDeMentira()); }
    /* LA VOTACIÓN DE NEGOCIACIÓN, con tres propuestas de mentira. Va aparte del
       botón de reproducir porque no es una escena del veredicto: es la pantalla
       ANTERIOR, la que decide cuál de las dos escenas sale. Termina cayendo en
       la revelación, así que de paso se ve el empalme entero. */
    else if (a === 'pb-votar') { ensayarDesdeElFinal(); }
    else if (a === 'pb-entrada') { ensayarLaEntrada(); }
    /* AL CERRARLO SE BORRA LO BUSCADO, y es lo que hace que plegarlo sea
       seguro: un campo escondido que sigue filtrando deja una lista recortada
       sin nada en pantalla que explique por qué faltan temas. Los chips no se
       tocan, que ésos se ven. */
    else if (a === 'buscar') {
      buscadorAbierto = !buscadorAbierto;
      if (!buscadorAbierto) busqueda = '';
      reponerFoco = buscadorAbierto;
      pintarCatalogo();
    }
    else if (a === 'catalogo-atras' || a === 'cambiar-publico') {
      /* Las flechas de dentro del catálogo hacen lo mismo que el atrás del
         teléfono, y por el mismo camino: si cambiaran el estado por su cuenta,
         la cuenta de entradas del historial se descuadraría. */
      if (profundidad > 0) history.back();
      else retroceder();
    }
    else if (a === 'jugar-explicado') {
      /* Del modal de la explicación directo a jugar ese mismo modo. */
      propuesta.modo = explicando;
      propuesta.turnos = cfg.reglas.turnosPorDefecto;
      reiniciarCatalogo();
      cerrarModal('m-explicar');
      irA('catalogo');
    }
    else if (a === 'ficha-invitado') { abrirFicha('invitado'); }
    else if (a === 'cambiar-modo') {
      /* Solo hay dos modos, así que «cambiar» es alternar. Mandar de vuelta a
         la portada para elegir entre dos era pedir tres toques donde basta uno,
         y encima perdía el sitio del catálogo. */
      propuesta.modo = propuesta.modo === 'debate' ? 'negociacion' : 'debate';
      pintarCatalogo();
    }
    else if (a === 'proponer') { proponer(); }
    else if (a === 'jugar-aqui') { abrirPreparar(); }
    else if (a === 'sortear') { sortearYJugar(); }
    else if (a === 'editar-ficha') { abrirFicha('yo'); }
    else if (a === 'guardar-ficha') { guardarFicha(); }
    else if (a === 'tema-nuevo') { abrirEscribir(null); }
    else if (a === 'editar-tema') { abrirEscribir(propuesta.temaId); }
    else if (a === 'guardar-tema') { guardarTema(); }
    else if (a === 'guardar-retoque') { guardarRetoque(); }
    else if (a === 'devolver-tema') {
      datos.devolverAlOriginal(escribiendo.id);
      cerrarModal('m-escribir');
      pintarCatalogo();
      abrirTema(escribiendo.id);
    }
    else if (a === 'borrar-tema') {
      if (confirm('Se borra este tema de la lista de ustedes. Lo ya debatido sigue en el historial.')) {
        datos.borrarTemaPropio(escribiendo.id);
        cerrarModales(['m-escribir', 'm-tema']);
        pintarCatalogo();
      }
    }
    else if (a === 'entrar') { location.href = location.pathname; }
    else if (a === 'salir') {
      /* Se cierra la sesión Y se borra lo que quedó en el aparato: si no, el
         siguiente en entrar vería el nombre y los contadores del anterior. */
      var salir = window.ATWI.auth ? window.ATWI.auth.salir() : Promise.resolve();
      salir.then(function () {
        datos.olvidar();
        location.href = location.pathname;
      });
    }
    else if (a === 'olvidar') {
      if (confirm('Se borrará tu perfil, tus partidas y tus actas de este dispositivo. No se puede deshacer.')) {
        datos.olvidar();
        pintarPerfil();
      }
    }
  });

  /* Escribir en el buscador repinta, pero el campo se recrea en cada pintado:
     hay que devolverle el foco y el cursor donde estaba. */
  var reponerFoco = false;
  document.addEventListener('input', function (e) {
    /* Los dos nombres del probador se guardan a cada tecla y NO repintan: el
       campo es el que tiene el foco, así que rehacerlo lo perdería en la
       primera letra. */
    var pbn = e.target.dataset && e.target.dataset.pbNombre;
    if (pbn) { estadoProbador()[pbn].nombre = e.target.value; guardarProbador(); return; }

    /* LA REGLA SE APLICA EN EL CAMPO, no al enviar. Un campo que sencillamente
       no admite un espacio ni una letra de más se explica solo, y por eso el
       párrafo que decía «una sola palabra» se pudo quitar. Desde 2026-09-16
       además capitaliza: mayúscula inicial y el resto en minúscula.

       LA MARCA `data-nombre` Y NO EL `id`: son cuatro campos en tres pantallas
       y dos archivos, y con el id había que acordarse de añadir cada uno aquí.
       El trabajo lo hace `datos`, que es donde vive la regla del nombre. */
    if (e.target.dataset && 'nombre' in e.target.dataset) {
      datos.pulirCampoDeNombre(e.target);
    }

    if (e.target.id === 'p-otro') {
      /* Se guarda según se escribe: un repintado —al retocar un texto desde
         aquí— dejaba el campo vacío porque solo se leía al sortear. */
      propuesta.otro = e.target.value.trim();
      /* Si el nombre escrito es de alguien con quien ya se jugó, vuelve su
         ficha: la gracia de recordarla es no tener que elegirla otra vez. */
      var g = datos.invitado(propuesta.otro);
      if (g) {
        propuesta.otroAvatar = distintoDeMi(g.avatar);
        propuesta.otroColor = g.color;
        var bf = $('#p-ficha-otro');
        /* Con `propuesta.otroAvatar` y no con `g.avatar`: lo guardado puede
           haber chocado con mi personaje y haberse movido una linea mas arriba.
           Pintando el crudo, la pantalla enseñaba una ficha y la partida salia
           con otra --y eso fue lo que hizo desconfiar de lo que se veia--. */
        if (bf) bf.outerHTML = window.ATWI.fichaHTML(propuesta.otroAvatar, 'avatar--chico', g.color)
          .replace('class="avatar', 'id="p-ficha-otro" class="avatar');
        refrescarRepresentantes();
      }
      revisarPreparar();
      return;
    }

    if (e.target.id !== 'q') return;
    busqueda = e.target.value;
    reponerFoco = true;
    pintarCatalogo();
  });

  function devolverFoco() {
    if (!reponerFoco) return;
    reponerFoco = false;
    var q = $('#q');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  /* --- La app se actualiza sola ---------------------------------------------
     UN PWA QUE NO SABE ACTUALIZARSE ES UN PWA ROTO. GitHub Pages manda
     `Cache-Control: max-age=600` en el HTML, así que un teléfono puede seguir
     con la versión de hace diez minutos. Y el `?v=` que pone el publicador
     sella el CSS y el JS DENTRO del HTML: no sirve de nada cuando lo cacheado
     es el HTML mismo. Pedirle a la gente que limpie la caché o reinstale no es
     una solución, es rendirse.

     `version.json` lo escribe el publicador, pesa sesenta bytes y se pide con
     `cache: 'no-store'`, así que siempre trae el sello de verdad. Si no coincide
     con el que lleva cargado, se recarga.

     SE RECARGA CON LA URL CAMBIADA y no con `location.reload()`: recargar vuelve
     a pedir la misma URL y el navegador la puede servir de la caché otra vez,
     que es justo el problema. Con `?v=` distinto, la clave de caché es otra y
     baja de verdad.

     Y NUNCA A MITAD DE PARTIDA. Recargar mientras alguien graba le borra el
     turno. Si la sala está abierta, se anota y se hace al salir. */
  var CLAVE_RECARGA = 'atwi.recargado.en';
  var selloNuevo = null;

  function mirarSiHayVersionNueva() {
    var mia = (cfg && cfg.version) || '';
    if (!mia) return;                       // en local no hay sello y no hay nada que mirar
    fetch('../version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.sello || d.sello === mia) return;
        /* Si ya se recargó por este mismo sello y sigue sin coincidir, el
           navegador está sirviendo HTML viejo de todas formas: recargar otra vez
           es un bucle. Se deja de insistir. */
        var ya = '';
        try { ya = sessionStorage.getItem(CLAVE_RECARGA) || ''; } catch (e) {}
        if (ya === d.sello) return;
        selloNuevo = d.sello;
        if (!$('#m-partida') || $('#m-partida').hidden) recargar();
      })
      .catch(function () { /* sin red no pasa nada: se mira la próxima vez */ });
  }

  function recargar() {
    if (!selloNuevo) return;
    try { sessionStorage.setItem(CLAVE_RECARGA, selloNuevo); } catch (e) {}
    var u = new URL(location.href);
    u.searchParams.set('v', selloNuevo);     // clave de caché distinta: baja de verdad
    location.replace(u.toString());
  }

  /** La llama la sala al cerrarse, por si la actualización quedó esperando. */
  window.ATWI.recargarSiTocaba = function () { if (selloNuevo) recargar(); };

  function vigilarLaVersion() {
    mirarSiHayVersionNueva();
    /* Al volver a la app: es cuando la gente la abre después de un rato, que es
       justo cuando más probable es que se haya publicado algo. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) mirarSiHayVersionNueva();
    });
    setInterval(mirarSiHayVersionNueva, 120000);
  }

  /* --- Arranque ------------------------------------------------------------ */
  function arrancar() {
    $$('.barra-item').forEach(function (b) {
      b.innerHTML = icono(b.dataset.vista, 30) + '<span>' + b.dataset.etiqueta + '</span>';
    });
    $$('[data-icono]').forEach(function (el) { el.innerHTML = icono(el.dataset.icono, Number(el.dataset.tam) || 22); });
    irA('jugar');
    refrescarPunto();
    // El catálogo llega por red: al tenerlo hay que repintar la portada, que
    // enseña el siguiente tema del recorrido.
    datos.catalogo().then(function () {
      if (vistaActual === 'jugar') pintarJugar();
    }).catch(function () {});
    vigilarLaVersion();
  }

  function abrir() {
    // Nadie entra al juego sin pasar por la puerta. En modo local basta el nombre.
    window.ATWI.entrada.exigir(arrancar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', abrir);
  else abrir();
})();
