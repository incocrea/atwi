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
    var desglose = $('.revelacion:not([hidden]) [data-accion="ver-desglose"]');
    var sala = $('#m-partida');

    if (desglose) {
      /* En el veredicto, atrás es el mismo botón: así se guarda la partida en
         vez de tirarla por la ventana. */
      desglose.click();
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

      /* EL MODO SE ELIGE AQUÍ, AL PRINCIPIO. Antes se elegía al final, justo
         antes de grabar, después de haber buscado el tema: para entonces ya
         tenías medio pie dentro y la elección llegaba como un trámite. Y la
         explicación de cada modo vivía en otra tarjeta, de adorno, que nadie
         relacionaba con el botón. Ahora es una sola cosa: la tarjeta explica y
         la tarjeta empieza. */
      '<h2 class="titulo-centrado">Selecciona el modo</h2>' +
      '<div class="cartas-modo">' +
        cartaModo('debate') +
        cartaModo('negociacion') +
      '</div>' +

      '<div class="aviso-ia" style="margin-top:var(--e-5)">' +
        icono('aviso', 20) +
        '<span>' + DESCARGO + '</span>' +
      '</div>' +

      /* PROVISIONAL: para probar el efecto de revelación mientras no hay partida
         de verdad. Se quita en cuanto el duelo funcione de extremo a extremo. */
      '<h2 style="margin:var(--e-6) 0 var(--e-3)">Probar el efecto</h2>' +
      '<div class="apilado">' +
        '<button class="boton boton--suave boton--bloque" data-accion="demo-debate">Resultado de un Debate</button>' +
        '<button class="boton boton--suave boton--bloque" data-accion="demo-acuerdo">Negociación con acuerdo</button>' +
        '<button class="boton boton--suave boton--bloque" data-accion="demo-sin-acuerdo">Negociación sin acuerdo</button>' +
      '</div>';
  }

  /* La carta de un modo: nombre, icono y dos salidas. NADA MÁS.
     La explicación se fue a su propio modal. En la carta ocupaba cinco
     renglones de letra pequeña que hay que leer para decidir, y quien ya sabe
     de qué va —o sea, a partir de la segunda partida— tenía que saltárselos
     cada vez para llegar al botón. Ahora la portada se lee de un vistazo y la
     explicación está a un toque de quien la necesite. */
  function cartaModo(clave) {
    return '<div class="carta-modo carta-modo--' + clave + '">' +
        '<div class="carta-modo__alto">' +
          rotuloModo(clave, 'carta-modo__rotulo') +
        '</div>' +
        '<div class="carta-modo__salidas">' +
          '<button class="boton boton--suave carta-modo__explica" data-explicar="' + clave + '">' +
            window.ATWI.iconoSVG('aviso', 16) + 'Explícame</button>' +
          '<button class="boton carta-modo__jugar boton--' + clave + '" data-crear="' + clave + '">' +
            window.ATWI.iconoSVG('play', 16) + 'Jugar</button>' +
        '</div>' +
      '</div>';
  }

  /* El modal de la explicación hace juego con su carta: mismo color de fondo,
     mismo disco blanco con el icono, mismo nombre. Termina en «Jugar», porque
     quien acaba de entender un modo suele querer probarlo ahí mismo. */
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
          '<span class="chip chip--' + esc(t.intensidad) + '">' + esc(t.intensidad) + '</span>' +
          (hecho
            ? '<span class="chip chip--hecho">' + icono('listo', 13) + ' Ya debatido</span>'
            : '<span class="chip chip--nuevo">Sin estrenar</span>') +
          /* Directo al editor, sin pasar por el detalle: quien ve un tema que
             no encaja con su discusión quiere arreglarlo ahí mismo. */
          '<button class="chip chip--editar" data-editar-tema="' + esc(t.id) + '">' +
            window.ATWI.pegatina('lapiz', 15) +
            (tocado ? 'Editar' : 'Personalizar') + '</button>' +
        '</div>' +
      '</div>';
  }

  /* ======================================================================
     Vista: Catálogo
     ====================================================================== */
  var categoriaAbierta = null;
  var modoPublico = null;   // 'pareja' | 'amigos'; null = todavia no ha elegido
  var busqueda = '';        // texto del buscador
  var filtro = 'todos';     // 'todos' | 'sin' | 'con'

  /* La CLAVE de la categoría sigue siendo «Mis temas»: es lo que llevan
     guardados los temas ya escritos, y cambiarla obligaría a migrarlos. Lo que
     cambia es cómo se llama en pantalla. */
  var ETIQUETA_MIS = 'Mis propios temas';

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
    return '<button class="cinta-modo cinta-modo--' + propuesta.modo + '" data-accion="cambiar-modo">' +
        /* El rótulo dibujado en lugar de icono más nombre: ya trae dentro su
           icono y su color, así que ponerle otro al lado era decirlo dos veces.
           «Van a jugar» delante partía la cinta en dos renglones, y tampoco
           está. */
        rotuloModo(propuesta.modo, 'cinta-modo__rotulo') +
        /* Dice siempre lo mismo. Nombrar el destino —«Negociar», «Debatir»—
           obligaba a leer dos veces para separar en qué modo estás de a cuál
           irías; el botón es un interruptor y se comporta como uno. */
        '<span class="cinta-modo__cambiar">' +
          window.ATWI.iconoSVG('volver', 14) + 'Cambiar modo' +
        '</span>' +
      '</button>';
  }

  function pintarCatalogo() {
    var caja = $('#v-catalogo');
    var cinta = cintaModo();
    /* EN QUE PASO VA, para que el CSS pueda poner el fondo que toca. Se marca
       aqui y no se deduce del contenido: el paso ya se decide en esta funcion y
       leerlo de la pantalla seria adivinar lo que ya se sabe. */
    caja.dataset.paso = modoPublico || 'modo';
    caja.dataset.modo = propuesta.modo || '';

    // Paso 0: con quien se juega. De eso depende que temas tienen sentido.
    if (!modoPublico) {
      caja.innerHTML = cinta +
        '<h1 style="margin-bottom:var(--e-2)">¿Con quién juegas?</h1>' +
        '<p class="chico suave" style="margin-bottom:var(--e-4)">' +
          'Los temas cambian según con quién estés debatiendo.</p>' +
        '<div class="modos">' +
          '<button class="modo modo--negociacion" data-publico="pareja">' +
            '<span class="modo__icono" style="font-size:1.6rem">💞</span>' +
            '<span><span class="modo__nombre">Con mi pareja</span>' +
            '<span class="modo__que">Convivencia, dinero del día a día, horarios, pantallas. ' +
            'Los temas por los que discuten las parejas de verdad.</span></span>' +
          '</button>' +
          '<button class="modo modo--debate" data-publico="amigos">' +
            '<span class="modo__icono" style="font-size:1.6rem">🎉</span>' +
            '<span><span class="modo__nombre">Con amigos</span>' +
            '<span class="modo__que">Debates de los de sobremesa. Sin convivencia de por medio.</span></span>' +
          '</button>' +
        '</div>';
      return;
    }

    if (modoPublico === 'amigos') {
      caja.innerHTML = cinta +
        '<div class="fila" style="margin-bottom:var(--e-4)">' +
          '<button class="boton-icono" data-accion="cambiar-publico" aria-label="Volver">' + icono('atras', 22) + '</button>' +
          '<h1 style="font-size:var(--t-h2)">Con amigos</h1>' +
        '</div>' +
        estadoVacio('🚧', 'Todavía no hay temas de amigos',
          'El catálogo que existe son 105 temas de convivencia en pareja: tareas, dinero del día a día, ' +
          'pantallas. Entre amigos no pegan. Los temas de amigos necesitan su propio catálogo y está por hacer.') +
        '<button class="boton boton--suave boton--bloque" data-accion="cambiar-publico">Jugar con mi pareja</button>';
      return;
    }

    datos.catalogo().then(function (cat) {
      var buscando = busqueda.trim() !== '' || filtro !== 'todos';

      if (categoriaAbierta) {
        var esMia = categoriaAbierta === datos.MIS_TEMAS;
        var enCategoria = datos.temasDe(categoriaAbierta);
        var visibles = datos.buscar(busqueda, filtro);
        var temas = enCategoria.filter(function (x) { return visibles.indexOf(x) !== -1; });
        var meta = esMia
          ? { emoji: '✍️', total: enCategoria.length }
          : (cat.categorias.filter(function (c) { return c.nombre === categoriaAbierta; })[0] || {});

        caja.innerHTML = cinta +
          '<div class="fila" style="margin-bottom:var(--e-3)">' +
            '<button class="boton-icono" data-accion="catalogo-atras" aria-label="Volver a las categorías">' + icono('atras', 22) + '</button>' +
            '<div><h1 style="font-size:var(--t-h2)">' + esc(meta.emoji || '') + ' ' +
              esc(esMia ? ETIQUETA_MIS : categoriaAbierta) + '</h1>' +
            '<p class="chico suave">' + temas.length + ' de ' + (meta.total || 0) + '</p></div>' +
          '</div>' +

          (esMia
            ? '<button class="boton boton--bloque" data-accion="tema-nuevo" style="margin-bottom:var(--e-3)">' +
                icono('mas', 20) + 'Escribir un tema</button>'
            : barraBusqueda()) +

          (temas.length
            ? '<div class="apilado">' + temas.map(tarjetaTema).join('') + '</div>'
            : esMia
              ? estadoVacio('✍️', 'Todavía no escribieron ninguno',
                  'El catálogo trae las discusiones más comunes, pero las suyas son suyas. ' +
                  'Escribe el enunciado y las dos posturas, y se juega igual que cualquier otro tema.')
              : estadoVacio('🔍', 'Nada por aquí', 'Prueba con otra palabra o cambia el filtro.'));
        devolverFoco();
        return;
      }

      /* Con búsqueda o filtro activos se salta la lista de categorías y se
         enseñan los temas directamente: quien busca quiere el tema, no la
         carpeta donde vive. */
      if (buscando) {
        var hallados = datos.buscar(busqueda, filtro);
        caja.innerHTML = cinta +
          '<h1 style="margin-bottom:var(--e-3)">Catálogo</h1>' +
          barraBusqueda() +
          '<p class="chico suave" style="margin:var(--e-3) 0">' +
            hallados.length + ' de ' + cat.total + ' temas</p>' +
          (hallados.length
            ? '<div class="apilado">' + hallados.map(tarjetaTema).join('') + '</div>'
            : estadoVacio('🔍', 'Nada por aquí', 'Prueba con otra palabra o cambia el filtro.'));
        devolverFoco();
        return;
      }

      var propios = datos.cuantosPropios();

      caja.innerHTML = cinta +
        '<div class="fila" style="margin-bottom:var(--e-2)">' +
          '<button class="boton-icono" data-accion="cambiar-publico" aria-label="Volver">' + icono('atras', 22) + '</button>' +
          '<h1 style="font-size:var(--t-h2)">Con mi pareja</h1>' +
        '</div>' +
        '<p class="chico suave" style="margin-bottom:var(--e-3)">' +
          cat.total + ' temas, ordenados por dónde y cuándo suele salir la discusión. ' +
          'Llevas ' + datos.perfil().temasJugados.length + ' debatidos.' +
        '</p>' +
        barraBusqueda() +

        /* El catálogo es una plantilla: lo que no está, se escribe. Va ARRIBA
           y no al final de 12 categorías, porque escribir el tema propio es lo
           que hace que la pareja vuelva cuando el catálogo se acaba. */
        '<button class="categoria categoria--propia" data-categoria="' + esc(datos.MIS_TEMAS) + '">' +
          '<span class="categoria__emoji">✍️</span>' +
          '<span><span class="categoria__nombre">' + ETIQUETA_MIS + '</span>' +
          '<span class="categoria__que">' +
            (propios
              ? 'Los temas que escribiste, para debatir o negociar.'
              : 'Lo que discutes y no está en la lista, escríbelo aquí para debatir o negociar.') +
          '</span></span>' +
          '<span class="categoria__n">' + (propios || '+') + '</span>' +
        '</button>' +

        '<div class="categorias">' +
          cat.categorias.map(function (c) {
            return '<button class="categoria" data-categoria="' + esc(c.nombre) + '">' +
                '<span class="categoria__emoji">' + c.emoji + '</span>' +
                '<span><span class="categoria__nombre">' + esc(c.nombre) + '</span>' +
                (c.descripcion ? '<span class="categoria__que">' + esc(c.descripcion) + '</span>' : '') +
                '</span>' +
                '<span class="categoria__n">' + c.total + '</span>' +
              '</button>';
          }).join('') +
        '</div>';
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
    var titulo = '<h1 style="margin-bottom:var(--e-4)">Historial</h1>';

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
      return;
    }

    if (!historial.length) {
      /* SE DICE QUE SOLO ENTRAN LAS TERMINADAS. Quien dejó una ronda a medias y
         no la encuentra aquí va a pensar que se perdió algo; y no es eso, es
         que nunca llegó a ser una partida. */
      caja.innerHTML = titulo + estadoVacio('📜', 'Todavía no hay nada',
        'Aquí quedarán las partidas que terminaron —una ronda dejada a medias no ' +
        'entra— y las actas de los acuerdos. El historial nunca se sobrescribe: una ' +
        'revancha añade una versión nueva y la anterior sigue ahí.');
      return;
    }

    caja.innerHTML = titulo +
      historial.map(function (d) {
        var t = d.turnos_grabados || [];
        /* SOLO LAS QUE TIENEN ALGO QUE OIR se ofrecen para oir. Una partida
           abandonada antes del primer turno esta en la lista --paso, y
           esconderla seria mentir sobre lo que hiciste-- pero no promete un
           audio que no existe. */
        var hay = t.length > 0;
        return '<div class="tarjeta partida-fila">' +
          '<button class="partida" data-partida="' + esc(d.id) + '"' +
            (hay ? '' : ' disabled') + '>' +
            '<span class="partida__cuando">' + esc(cuando(d.creado)) + '</span>' +
            '<span class="partida__tema">' + esc(d.enunciado || 'Sin tema') + '</span>' +
            '<span class="partida__pie">' +
              window.ATWI.rotuloModo(d.modo === 'debate' ? 'debate' : 'negociacion',
                                     'partida__modo') +
              '<span class="chico tenue">' +
                (hay ? t.length + ' intervenciones · ' +
                       t.reduce(function (a, b) { return a + (b.segundos || 0); }, 0) + ' s'
                     : 'sin intervenciones') +
              '</span>' +
            '</span>' +
          '</button>' +
          /* LA PAPELERA VA SIEMPRE, tenga turnos o no. Una partida vacia
             tambien ocupa sitio en la lista, y no poder quitarla obliga a
             cargar con ella para siempre. */
          '<button class="partida__borrar" data-borrar="' + esc(d.id) + '"' +
            ' aria-label="Borrar esta partida">' +
            window.ATWI.iconoSVG('papelera', 20) + '</button>' +
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
      '<p class="chico tenue" style="margin-bottom:var(--e-5)">No se puede deshacer.</p>' +
      /* Suave y con el tono aparte, no un bloque rojo: es el mismo criterio que
         el borrar de la sala --esto es un juego, no un formulario-- y el mismo
         gesto, asi que se ve igual. */
      '<button class="boton boton--bloque boton--grande boton--suave boton--borrar"' +
        ' data-olvidar-ya="' + esc(id) + '">Borrarla</button>' +
      '<button class="boton boton--suave boton--bloque" data-cerrar="m-olvidar">' +
        'Dejarla donde está</button>';
    abrirModal('m-olvidar');
  }

  function olvidarPartida(id, boton) {
    boton.disabled = true;
    boton.textContent = 'Borrando…';
    window.ATWI.nube.olvidar(id).then(function (r) {
      if (!r || !r.borrado) {
        boton.disabled = false;
        boton.textContent = 'Reintentar';
        var aviso = $('#m-olvidar .modal__cuerpo .olvidar-fallo');
        if (!aviso) {
          aviso = document.createElement('p');
          aviso.className = 'chico olvidar-fallo';
          aviso.style.cssText = 'color:var(--peligro);margin-bottom:var(--e-3)';
          /* ENCIMA DEL BOTON, no al final del modal. Puesto al final cae debajo
             de «dejarla donde está» y se lee despues de las dos salidas, cuando
             lo que dice es justo por que una de ellas no funciono. */
          boton.parentNode.insertBefore(aviso, boton);
        }
        /* SE DICE QUE NO SE BORRO NADA, y es verdad: la funcion de borde no
           toca la fila si los audios no se fueron. Decir «puede que si, puede
           que no» sobre la voz de alguien es lo peor que se puede contestar. */
        aviso.textContent = 'No se pudo borrar, y no se borró nada. Probá otra vez.';
        return;
      }
      /* Se quita de la lista que ya esta en memoria en vez de volver a pedirla:
         la persona acaba de decir que se vaya y verla desaparecer es la
         respuesta. Pedir el historial otra vez son dos segundos de tarjeta
         todavia ahi. */
      historial = (historial || []).filter(function (x) { return x.id !== id; });
      cerrarModal('m-olvidar');
      pintarHistorial();
    });
  }

  /* «Hoy», «ayer» y la fecha. Un historial de partidas de pareja se lee por lo
     reciente: «hace dos días» dice mas que «13/09». */
  function cuando(iso) {
    var d = new Date(iso);
    var hoy = new Date();
    var dias = Math.floor((hoy.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0))
                          / 86400000);
    var hora = d.toTimeString().slice(0, 5);
    if (dias === 0) return 'Hoy · ' + hora;
    if (dias === 1) return 'Ayer · ' + hora;
    if (dias < 7) return 'Hace ' + dias + ' días · ' + hora;
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
  function abrirPartida(id) {
    var d = (historial || []).filter(function (x) { return x.id === id; })[0];
    if (!d || !(d.turnos_grabados || []).length) return;
    window.ATWI.partida.repasar(d);
  }

  /* Buscador y filtros. Van juntos porque responden a la misma pregunta:
     «¿qué me queda por debatir de esto?». */
  function barraBusqueda() {
    var f = [['todos', 'Todos'], ['sin', 'Sin estrenar'], ['con', 'Ya debatidos']];
    return '<div class="buscador">' +
        '<input class="campo" id="q" type="search" inputmode="search" placeholder="Buscar un tema…" ' +
          'value="' + esc(busqueda) + '" autocomplete="off">' +
        '<div class="filtros">' +
          f.map(function (x) {
            return '<button class="chip chip--filtro" data-filtro="' + x[0] + '"' +
                   (filtro === x[0] ? ' aria-pressed="true"' : '') + '>' + x[1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  function estadoVacio(emoji, titulo, texto) {
    return '<div class="vacio">' +
        '<div class="vacio__emoji">' + emoji + '</div>' +
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
          window.ATWI.iconoSVG('lapiz', 18) +
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
                  window.ATWI.iconoSVG('salir', 18) + 'Salir</button>'
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
                '<input class="campo" id="f-nombre" type="text" maxlength="' + datos.NOMBRE_MAX + '" ' +
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

  function refrescarPunto() {
    datos.avisos().then(function (lista) {
      var sinLeer = lista.filter(function (a) { return !a.leido; }).length;
      var p = $('#buzon-punto');
      if (!p) return;
      p.hidden = sinLeer === 0;
      p.textContent = sinLeer > 9 ? '9+' : String(sinLeer);
    });
  }

  function abrirBuzon() {
    var caja = $('#m-buzon .modal__cuerpo');
    caja.innerHTML = '<p class="chico tenue centrado" style="padding:var(--e-6) 0">Un momento…</p>';
    abrirModal('m-buzon');

    datos.avisos().then(function (lista) {
      if (!lista.length) {
        caja.innerHTML = estadoVacio('📭', 'Buzón vacío',
          'Aquí llegan las invitaciones a debatir, los avisos de que te toca grabar y los resultados.');
        return;
      }
      caja.innerHTML = '<div class="apilado">' + lista.map(function (a) {
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
      }).join('') + '</div>';

      /* Abrir el buzón es leerlo. Se marca todo lo que hay dentro. */
      var nuevos = lista.filter(function (a) { return !a.leido; }).map(function (a) { return a.id; });
      if (nuevos.length) datos.marcarLeidos(nuevos).then(refrescarPunto);
    });
  }

  /* ======================================================================
     Flujo: proponer un debate
     ====================================================================== */
  var propuesta = { temaId: null, modo: null, turnos: null };
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
        '<span class="retocable__lapiz">' + window.ATWI.pegatina('lapiz', 18) + '</span>' +
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
      '<div class="aviso-ia">' + icono('aviso', 20) +
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
      var yoActual = ($('#p-yo') && $('#p-yo').value || '').trim();
      abrirPreparar(true);
      if (yoActual && $('#p-yo')) $('#p-yo').value = yoActual;
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

    $('#m-escribir .modal__titulo').textContent =
      !t ? 'Tu propio tema' : 'Editar tema';

    $('#m-escribir .modal__cuerpo').innerHTML =
      '<p class="chico suave" style="margin-bottom:var(--e-4)">' +
        (t && !propio
          ? 'Cambia la pregunta para que se parezca a la discusión de ustedes. ' +
            'El tema original del catálogo no se toca: puedes volver a él cuando quieras.'
          : 'Escríbelo como una pregunta de opinión, con las dos salidas dentro. ' +
            'Nadie elige lado: cada quien dice lo suyo al hablar.') +
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
                   'Cómo lo van a ver en la lista. Por ejemplo: «El tubo de pasta».', 60) +
        campoTexto('e-enunciado', 'La pregunta', t ? t.enunciado : '', 'textarea',
                   'Una pregunta de opinión. Por ejemplo: «¿Los platos se lavan al ' +
                   'terminar de comer o pueden esperar a la mañana?».', 240) +

        '<p class="chico" id="e-error" style="color:var(--peligro)"></p>' +
      '</div>' +

      /* LA PRUEBA QUE ANTES HACÍAN LAS POSTURAS. Se pedían dos y si una era
         indefendible el tema no valía. Sin ellas, la prueba se hace sobre la
         propia pregunta, y por eso este aviso dice qué tiene que cumplir: si
         solo admite una respuesta decente, no es un desacuerdo, es un acusado y
         un fiscal, y el árbitro no tendría nada que arbitrar. */
      '<div class="aviso-ia" style="margin-top:var(--e-4)">' + icono('aviso', 20) +
        '<span>Escríbelo como <strong>pregunta</strong>, y que las dos respuestas se ' +
        'puedan defender. Si solo hay una respuesta decente, eso no es un desacuerdo: ' +
        'es una acusación, y el resultado no valdría nada.</span>' +
      '</div>' +

      (reescrito
        ? '<button class="boton boton--fantasma boton--bloque" data-accion="devolver-tema" ' +
          'style="margin-top:var(--e-5)">' + window.ATWI.iconoSVG('volver', 18) +
          'Volver al tema del catálogo</button>'
        : '') +
      (propio
        ? '<button class="boton boton--fantasma boton--bloque" data-accion="borrar-tema" ' +
          'style="margin-top:var(--e-3);color:var(--peligro)">Borrar este tema</button>'
        : '');

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
    var fallo =
      titulo.length < 3 ? 'El título necesita al menos tres letras.' :
      enunciado.length < 15 ? 'La pregunta se queda corta: tiene que plantear el desacuerdo entero.' :
      /* No se exige el signo de interrogación —hay preguntas sin él— pero sí que
         ofrezca dos salidas, que es lo que hace que haya algo que discutir. */
      !/\bo\b/i.test(enunciado) ? 'Falta la otra salida: la pregunta tiene que ofrecer dos.' : '';
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

  /**
   * La ficha del invitado. Ya no se elige: es el personaje que no soy yo. Con
   * dos, la cuenta sale sola, y además garantiza lo que antes se pedía a mano
   * apartando mi color —que las dos fichas se distingan en la sala—.
   * Se ignora a propósito lo que hubiera guardado de partidas viejas: si me
   * cambio de personaje, el invitado tiene que moverse conmigo.
   */
  function fichaDelInvitado(nombre) {
    var g = nombre ? datos.invitado(nombre) : null;
    return {
      nombre: (g ? g.nombre : nombre) || '',
      /* Si ya jugó en este teléfono se le devuelve su ficha. Si no, se propone
         el personaje que yo NO soy —que es lo que suele querer— pero se puede
         cambiar: dos Kai en la misma sala valen, los distingue el aro. */
      avatar: (g && g.avatar) || propuesta.otroAvatar ||
              window.ATWI.otroPersonaje(datos.perfil().avatar),
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
    propuesta.otro = propuesta.otro || (invitadosPrevios()[0] || {}).nombre || '';
    var g = fichaDelInvitado(propuesta.otro);
    propuesta.otroAvatar = g.avatar;
    propuesta.otroColor = g.color;

    $('#m-preparar').className = 'modal modal--' + propuesta.modo;
    $('#m-preparar .modal__cuerpo').innerHTML =
      /* El enunciado y las dos posturas se retocan AQUÍ MISMO. Es el último
         momento antes de grabar y es cuando se ve que una frase no dice lo que
         se discute de verdad; obligar a volver atrás para cambiarla hacía que
         se jugara con el texto que no era. */
      '<button class="tarjeta retocable" data-retocar="enunciado" ' +
              'style="width:100%;margin-bottom:var(--e-4)">' +
        '<span class="retocable__texto sala__enunciado" style="color:var(--tinta)">' +
          esc(t.enunciado) + '</span>' +
        '<span class="retocable__lapiz">' + window.ATWI.pegatina('lapiz', 18) + '</span>' +
      '</button>' +

      '<h3 style="margin-bottom:var(--e-2)">¿Cuántos turnos?</h3>' +
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

      '<h3 style="margin-bottom:var(--e-2)">¿Quiénes juegan?</h3>' +

      /* Los dos nombres se ven SIEMPRE, y el propio viene ya puesto desde la
         ficha. Antes solo se preguntaba cuando faltaba, así que quien ya tenía
         nombre no veía con qué nombre iba a salir en la sala ni podía
         cambiarlo sin irse a Perfil. Lo que se escriba aquí actualiza la ficha. */
      '<label style="display:block;margin-bottom:var(--e-3)">' +
        '<span class="chico" style="font-weight:700">Tu nombre</span>' +
        '<input class="campo" id="p-yo" type="text" maxlength="' + datos.NOMBRE_MAX + '" ' +
          'autocomplete="given-name" placeholder="Tu nombre" value="' + esc(p.nombre) + '" ' +
          'style="margin-top:6px">' +
      '</label>' +

      /* La ficha del invitado se toca para elegirle dibujo y color. No es una
         cuenta: es alguien que agarró este teléfono. Pero su ficha se recuerda,
         así que la próxima vez que juegue sale como salió. */
      /* «Su nombre» se leía como «el nombre de uno» y había quien ponía el
         suyo dos veces. «Nombre de invitado» no admite esa lectura. */
      '<span class="chico" style="font-weight:700;display:block">Nombre de invitado</span>' +
      '<div class="con-ficha" style="margin-top:6px">' +
        '<button type="button" class="avatar-boton" data-accion="ficha-invitado" ' +
          'aria-label="Elegir el aro de su ficha">' +
          window.ATWI.fichaHTML(propuesta.otroAvatar, 'avatar--chico', propuesta.otroColor)
            .replace('class="avatar', 'id="p-ficha-otro" class="avatar') +
        '</button>' +
        '<input class="campo" id="p-otro" type="text" maxlength="' + datos.NOMBRE_MAX + '" ' +
          'autocomplete="off" placeholder="¿Con quién juegas?" value="' + esc(propuesta.otro) + '">' +
      '</div>' +
      '<span class="chico tenue" style="display:block;margin-top:6px">' +
        'Su primer nombre o un apodo, una sola palabra. Van a jugar los dos en este ' +
        'teléfono, por turnos: toca el círculo para elegirle personaje y aro.</span>' +

      /* Los tres últimos, y solo tres: es una lista para tocar de un vistazo, no
         un historial. Cuentan como el mismo quien repite NOMBRE Y PERSONAJE;
         el mismo nombre con otro personaje es otra ficha. */
      (invitadosPrevios().length
        ? '<div class="invitados" style="margin-top:var(--e-3)">' +
            invitadosPrevios().slice(0, 3).map(function (g) {
              return '<button type="button" class="invitado" data-invitado="' + esc(g.nombre) + '">' +
                  window.ATWI.fichaHTML(g.avatar || propuesta.otroAvatar, 'avatar--mini', g.color) +
                  esc(g.nombre) +
                '</button>';
            }).join('') +
          '</div>'
        : '') +
      /* EL ABOGADO. Se elige POR SEPARADO y antes de empezar: uno puede jugar
         con abogado y el otro a pelo, y esa asimetría es parte de la gracia.
         Va aquí y no dentro de la sala porque cambiar las reglas a mitad de
         partida no es una opción, y porque cambia lo que cuesta cada turno. */
      '<h3 style="margin:var(--e-5) 0 var(--e-2)">¿Quién los representa?</h3>' +
      /* UNA LÍNEA, y el resto en el modal. Aquí estaba el párrafo entero
         explicando qué hace un abogado y qué riesgo tiene: cuatro renglones
         para una decisión que la mayoría va a dejar como viene, y encima
         repetidos, porque el modal lo vuelve a decir justo cuando hace falta
         leerlo —al elegir—. */
      '<p class="chico tenue" style="margin-bottom:var(--e-3)">' +
        'Cada quien se representa a sí mismo. Prendé la llave para que un ' +
        'personaje te haga de abogado.</p>' +
      pintarRepresentantes() +

      '<p class="chico" id="p-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>' +

      '<div class="aviso-ia" style="margin-top:var(--e-5)">' + icono('aviso', 20) +
        '<span>Quién abre se sortea, como en ajedrez, y se enseña antes de empezar. ' +
        'En la revancha abre ' + (propuesta.modo === 'debate' ? 'el otro' : 'la otra parte') + '.</span>' +
      '</div>';

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
      return '<div class="repre' + (conAbogado ? ' repre--conabogado' : '') + '">' +
          /* SIEMPRE EN EL COLOR DEL CLIENTE, también con abogado. Aquí se
             pasaba `null` cuando había abogado, porque el color era un aro y un
             aro ajeno confundía. Ahora el color es la ropa y la regla del
             titular es al revés: el abogado sale en el color de perfil de quien
             lo contrata, que es lo que lo hace reconociblemente suyo. */
          window.ATWI.fichaHTML(suyo, 'avatar--mini', x.color) +
          '<span class="repre__quien" id="repre-' + x.k + '"></span>' +
          '<span class="repre__como">' +
            (conAbogado ? esc(window.ATWI.nombrePersonaje(x.repre)) + ' lo defiende'
                        : (x.k === 'yo' ? 'Tu voz' : 'Su voz')) +
          '</span>' +
          '<button type="button" class="repre__llave" data-abogado="' + x.k + '"' +
            (conAbogado ? ' aria-pressed="true"' : '') +
            ' aria-label="Usar abogado"></button>' +
        '</div>';
    }).join('') + '</div>';
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
    var nombre = ($(cual === 'yo' ? '#p-yo' : '#p-otro') || {}).value || '';

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
    abrirModal('m-abogados');
  }

  /* Una línea por personaje para que la elección no sea a ciegas: dos dibujos
     sin más no dicen en qué se diferencian, y en lo que se diferencian es
     justo en cómo van a decir lo tuyo. */
  var COMO_HABLAN = {
    kai: 'Directo y con frases cortas',
    luna: 'Cálida y va encadenando',
    /* LOS CUATRO DE ABAJO NO TIENEN PERSONALIDAD ESCRITA TODAVÍA. Kai y Luna la
       tienen en la función de borde, con sus reglas y sus guardas, y se midió
       que respetaran los marcadores de opinión; éstos entraron con el dibujo,
       no con el prompt. Lo que dice aquí es una promesa, así que hasta que la
       tengan se dice lo único que es verdad: que hablan como el personaje. */
    nico: 'Todavía sin voz propia',
    dante: 'Todavía sin voz propia',
    nina: 'Todavía sin voz propia',
    maya: 'Todavía sin voz propia'
  };
  function comoHabla(clave) { return COMO_HABLAN[clave] || ''; }

  /* El selector se repinta SOLO, sin tocar la pantalla entera: repintarla se
     llevaría por delante los dos nombres a medio escribir. */
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
    var yo = ($('#p-yo') && $('#p-yo').value || '').trim();
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
    var mal = datos.errorDeNombre($('#p-otro') && $('#p-otro').value) ||
              datos.errorDeNombre($('#p-yo') && $('#p-yo').value);
    $('#m-preparar .modal__pie button').disabled = Boolean(mal);
  }

  /* De momento se juega en un solo dispositivo, por turnos, que es el modo que
     el documento permite para los temas del catálogo. Con dos teléfonos hace
     falta el servidor y llega después. */
  function sortearYJugar() {
    var t = datos.tema(propuesta.temaId);
    var otro = datos.limpiarNombre($('#p-otro').value);
    var yo = datos.limpiarNombre($('#p-yo').value);

    var malYo = datos.errorDeNombre(yo);
    if (malYo) { $('#p-error').textContent = malYo; return; }
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
    var abre = Math.random() < 0.5 ? 0 : 1;

    cerrarModales(['m-preparar', 'm-tema']);
    window.ATWI.partida.empezar({
      tema: t,
      modo: propuesta.modo,
      turnos: propuesta.turnos || cfg.reglas.turnosPorDefecto,
      publico: modoPublico || 'pareja',
      posturas: [fichaMia, fichaSuya],
      abre: abre                 // índice sobre esa lista: quién habla primero
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

  /* Al terminar una partida el historial que hay en memoria ya no es el de
     ahora: se tira para que se vuelva a pedir. */
  window.ATWI.olvidarHistorial = function () { historial = null; };
  /* Para quien abra algo a pantalla completa desde fuera de este archivo —el
     veredicto— y necesite que el atrás del teléfono lo cierre a él y no la app. */
  window.ATWI.pasoAtras = apilarPaso;

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

    /* Elegir uno del panel. Se cierra al elegir: una decisión, una pantalla. */
    var esc2 = e.target.closest('[data-abogado-es]');
    if (esc2 && !esc2.disabled) {
      propuesta[eligiendoPara === 'yo' ? 'repreYo' : 'repreOtro'] = esc2.dataset.abogadoEs;
      cerrarModal('m-abogados');
      refrescarRepresentantes();
      return;
    }

    /* Tocar a alguien con quien ya se jugó rellena su nombre y su ficha. */
    var inv = e.target.closest('[data-invitado]');
    if (inv) {
      var g = datos.invitado(inv.dataset.invitado);
      if (g) {
        propuesta.otro = g.nombre;
        propuesta.otroAvatar = g.avatar;
        propuesta.otroColor = g.color;
        $('#p-otro').value = g.nombre;
        var bf = $('#p-ficha-otro');
        if (bf) bf.outerHTML = window.ATWI.fichaHTML(g.avatar, 'avatar--chico', g.color)
          .replace('class="avatar', 'id="p-ficha-otro" class="avatar');
        $$('#m-preparar [data-invitado]').forEach(function (x) {
          if (x.dataset.invitado === g.nombre) x.setAttribute('aria-pressed', 'true');
          else x.removeAttribute('aria-pressed');
        });
        revisarPreparar();
      }
      return;
    }

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

    var cerrar = e.target.closest('[data-cerrar]');
    if (cerrar) { cerrarModal(cerrar.dataset.cerrar); return; }

    var acc = e.target.closest('[data-accion]');
    if (!acc) return;
    var a = acc.dataset.accion;

    if (a === 'buzon') { abrirBuzon(); }
    else if (a === 'nuevo') { reiniciarCatalogo(); irA('catalogo'); }
    else if (a === 'demo-debate') {
      window.ATWI.veredicto.revelar({
        modo: 'debate', publico: 'pareja',
        ganador: datos.perfil().nombre || 'Tú'
      });
    }
    else if (a === 'demo-acuerdo') {
      window.ATWI.veredicto.revelar({
        modo: 'negociacion', publico: 'pareja',
        tema: 'los platos',
        acuerdo: 'Si cenamos después de las diez, los platos se quedan en remojo y se lavan a la mañana siguiente antes del café.'
      });
    }
    else if (a === 'demo-sin-acuerdo') {
      window.ATWI.veredicto.revelar({
        modo: 'negociacion', publico: 'pareja', tema: 'los platos', acuerdo: null
      });
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
    if (e.target.id === 'p-otro') {
      /* Se guarda según se escribe: un repintado —al retocar un texto desde
         aquí— dejaba el campo vacío porque solo se leía al sortear. */
      propuesta.otro = e.target.value.trim();
      /* Si el nombre escrito es de alguien con quien ya se jugó, vuelve su
         ficha: la gracia de recordarla es no tener que elegirla otra vez. */
      var g = datos.invitado(propuesta.otro);
      if (g) {
        propuesta.otroAvatar = g.avatar;
        propuesta.otroColor = g.color;
        var bf = $('#p-ficha-otro');
        if (bf) bf.outerHTML = window.ATWI.fichaHTML(g.avatar, 'avatar--chico', g.color)
          .replace('class="avatar', 'id="p-ficha-otro" class="avatar');
      }
      revisarPreparar();
      return;
    }
    if (e.target.id === 'p-yo') { revisarPreparar(); return; }
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
