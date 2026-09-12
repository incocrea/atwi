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

  /* ======================================================================
     Navegación entre vistas
     ====================================================================== */
  var VISTAS = ['jugar', 'catalogo', 'historial', 'perfil'];
  var vistaActual = 'jugar';

  function irA(nombre) {
    if (VISTAS.indexOf(nombre) === -1) return;
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
    pintar(nombre);
  }

  /* ======================================================================
     Modales a pantalla completa
     ====================================================================== */
  var pilaModales = [];

  function abrirModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    pilaModales.push(id);
    var foco = $('.modal__cuerpo', m) || m;
    foco.scrollTop = 0;
  }

  function cerrarModal(id) {
    var objetivo = id || pilaModales[pilaModales.length - 1];
    var m = document.getElementById(objetivo);
    if (!m) return;
    m.hidden = true;
    pilaModales = pilaModales.filter(function (x) { return x !== objetivo; });
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
    var sugerido = datos.siguienteSugerido();

    caja.innerHTML =
      '<div class="saludo">' +
        '<div class="avatar">' + esc(p.avatar) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<h1>' + (p.nombre ? '¡Hola, ' + esc(p.nombre) + '!' : '¡Hola!') + '</h1>' +
          '<p class="chico suave">Nivel ' + p.nivel + ' · ' + p.puntos + ' de ' + p.puntosNivel + ' puntos</p>' +
          '<div class="nivel-barra"><i style="width:' + Math.min(100, Math.round(p.puntos / p.puntosNivel * 100)) + '%"></i></div>' +
        '</div>' +
      '</div>' +

      '<button class="boton boton--bloque boton--grande" data-accion="nuevo" style="margin-bottom:var(--e-4)">' +
        icono('mas', 22) + 'Proponer un debate' +
      '</button>' +

      (sugerido
        ? '<h2 style="margin:var(--e-5) 0 var(--e-3)">Siguiente del recorrido</h2>' +
          tarjetaTema(sugerido)
        : '') +

      '<h2 style="margin:var(--e-5) 0 var(--e-3)">Los dos modos</h2>' +
      '<div class="modos">' +
        fichaModo('debate', 'Debate', 'Dos partes compiten por quién argumenta mejor. Un juez imparcial evalúa, declara ganador y explica por qué.') +
        fichaModo('negociacion', 'Negociación', 'Un negociador de IA propone tres acuerdos, votan, y el elegido lo firman los dos. También vale seguir en desacuerdo.') +
      '</div>' +

      '<div class="aviso-ia" style="margin-top:var(--e-5)">' +
        icono('aviso', 20) +
        '<span>Los resultados los genera una inteligencia artificial. ATWI es un juego: no es terapia ni asesoramiento profesional.</span>' +
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

  function fichaModo(clave, nombre, que) {
    return '<div class="modo modo--' + clave + '">' +
        '<span class="modo__icono">' + icono(clave, 30) + '</span>' +
        '<span><span class="modo__nombre">' + nombre + '</span>' +
        '<span class="modo__que">' + que + '</span></span>' +
      '</div>';
  }

  function tarjetaTema(t) {
    var hecho = datos.yaDebatido(t.id);
    return '<button class="tarjeta tarjeta--pulsable tema' + (hecho ? ' tema--hecho' : '') + '" ' +
        'data-tema="' + esc(t.id) + '">' +
        '<span class="tema__titulo">' + esc(t.titulo) + '</span>' +
        '<span class="tema__enunciado">' + esc(t.enunciado) + '</span>' +
        '<span class="tema__pie">' +
          '<span class="chip chip--' + esc(t.intensidad) + '">' + esc(t.intensidad) + '</span>' +
          (hecho
            ? '<span class="chip chip--hecho">' + icono('listo', 13) + ' Ya debatido</span>'
            : '<span class="chip chip--nuevo">Sin estrenar</span>') +
        '</span>' +
      '</button>';
  }

  /* ======================================================================
     Vista: Catálogo
     ====================================================================== */
  var categoriaAbierta = null;
  var modoPublico = null;   // 'pareja' | 'amigos'; null = todavia no ha elegido
  var busqueda = '';        // texto del buscador
  var filtro = 'todos';     // 'todos' | 'sin' | 'con'

  function pintarCatalogo() {
    var caja = $('#v-catalogo');

    // Paso 0: con quien se juega. De eso depende que temas tienen sentido.
    if (!modoPublico) {
      caja.innerHTML =
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
      caja.innerHTML =
        '<div class="fila" style="margin-bottom:var(--e-4)">' +
          '<button class="boton-icono" data-accion="cambiar-publico" aria-label="Cambiar de modo">' + icono('atras', 22) + '</button>' +
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

        caja.innerHTML =
          '<div class="fila" style="margin-bottom:var(--e-3)">' +
            '<button class="boton-icono" data-accion="catalogo-atras" aria-label="Volver a las categorías">' + icono('atras', 22) + '</button>' +
            '<div><h1 style="font-size:var(--t-h2)">' + esc(meta.emoji || '') + ' ' + esc(categoriaAbierta) + '</h1>' +
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
        caja.innerHTML =
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

      caja.innerHTML =
        '<div class="fila" style="margin-bottom:var(--e-2)">' +
          '<button class="boton-icono" data-accion="cambiar-publico" aria-label="Cambiar de modo">' + icono('atras', 22) + '</button>' +
          '<h1 style="font-size:var(--t-h2)">Con mi pareja</h1>' +
        '</div>' +
        '<p class="chico suave" style="margin-bottom:var(--e-3)">' +
          cat.total + ' temas, ordenados por dónde y cuándo suele salir la discusión. ' +
          'Llevas ' + datos.perfil().temasJugados.length + ' debatidos.' +
        '</p>' +
        barraBusqueda() +
        '<div style="height:var(--e-3)"></div>' +

        /* El catálogo es una plantilla: lo que no está, se escribe. Va ARRIBA
           y no al final de 12 categorías, porque escribir el tema propio es lo
           que hace que la pareja vuelva cuando el catálogo se acaba. */
        '<button class="categoria categoria--propia" data-categoria="' + esc(datos.MIS_TEMAS) + '">' +
          '<span class="categoria__emoji">✍️</span>' +
          '<span><span class="categoria__nombre">' + esc(datos.MIS_TEMAS) + '</span>' +
          '<span class="categoria__que">' +
            (propios
              ? 'Los que escribieron ustedes.'
              : 'Lo que discuten y no está en la lista, escríbanlo aquí.') +
          '</span></span>' +
          '<span class="categoria__n">' + (propios || '+') + '</span>' +
        '</button>' +
        '<div style="height:var(--e-3)"></div>' +

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
  function pintarHistorial() {
    var p = datos.perfil();
    var caja = $('#v-historial');

    if (!p.partidas.length && !p.actas.length) {
      caja.innerHTML =
        '<h1 style="margin-bottom:var(--e-4)">Historial</h1>' +
        estadoVacio('📜', 'Todavía no hay nada',
          'Aquí quedarán tus partidas y las actas de los acuerdos. El historial nunca se sobrescribe: una revancha añade una versión nueva y la anterior sigue ahí.');
      return;
    }
    caja.innerHTML = '<h1 style="margin-bottom:var(--e-4)">Historial</h1>';
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

    var dentro = window.ATWI.auth && window.ATWI.auth.dentro();

    caja.innerHTML =
      /* Toda la ficha es un botón: el nombre y el dibujo se cambian desde
         aquí. Antes solo decía «Sin nombre todavía» y no había por dónde
         escribirlo. */
      '<button class="ficha" data-accion="editar-ficha">' +
        '<span class="avatar ficha__avatar">' + esc(p.avatar) + '</span>' +
        '<span class="ficha__nombre">' +
          (p.nombre ? esc(p.nombre) : 'Ponte un nombre') +
          window.ATWI.iconoSVG('lapiz', 18) +
        '</span>' +
        '<span class="chico suave">Nivel ' + p.nivel + '</span>' +
      '</button>' +

      /* La cuenta va ARRIBA, no enterrada bajo las insignias: quien busca
         cambiar de cuenta no debería tener que hacer scroll para encontrarlo. */
      (dentro
        ? '<div class="cuenta">' +
            '<span class="cuenta__quien">' +
              '<span class="cuenta__eti">Sesión iniciada</span>' +
              '<span class="cuenta__correo">' + esc(window.ATWI.auth.correo()) + '</span>' +
            '</span>' +
            '<button class="boton boton--suave cuenta__salir" data-accion="salir">' +
              window.ATWI.iconoSVG('salir', 18) + 'Salir</button>' +
          '</div>'
        : '') +

      '<div class="contadores" style="margin-top:var(--e-4)">' +
        contador(p.debates, 'Debates', 'debate') +
        contador(p.acuerdos, 'Acuerdos', 'acuerdo') +
        contador(p.semanasActivas, 'Semanas', 'premio') +
      '</div>' +

      '<div class="tarjeta" style="margin-top:var(--e-4);background:var(--negociacion-tinte);box-shadow:none">' +
        '<p class="chico" style="color:var(--negociacion-oscuro);font-weight:700">' +
          'Aquí no hay marcador entre ustedes dos. Cada quien ve sus propios contadores, ' +
          'y nunca se comparan lado a lado. Es a propósito.' +
        '</p>' +
      '</div>' +

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

  /* --- Editar la ficha: el nombre y el dibujo --------------------------------
     El nombre vive en el servidor y el aparato solo lo copia, así que se guarda
     en los dos sitios. Sin servidor se queda en local y ya está.

     Los dibujos NO son personas. Es la misma regla que la pestaña de Perfil:
     mientras no haya una dirección de personaje decidida, no se insinúa una. */
  var DIBUJOS = ['🙂', '🦊', '🐙', '🐢', '🦉', '🌻', '🍀', '🎈',
                 '⭐', '🧩', '🎸', '🫐', '🌙', '🔥', '🌵', '🎲'];

  function abrirFicha() {
    var p = datos.perfil();
    fichaElegida = p.avatar || '🙂';

    $('#m-perfil .modal__cuerpo').innerHTML =
      '<div class="apilado-5">' +
        '<label style="display:block">' +
          '<span class="chico" style="font-weight:700">¿Cómo te llamamos?</span>' +
          '<input class="campo" id="f-nombre" type="text" maxlength="40" autocomplete="given-name" ' +
            'placeholder="Tu nombre" value="' + esc(p.nombre) + '" style="margin-top:6px">' +
          '<span class="chico tenue" style="display:block;margin-top:6px">' +
            'Es el nombre que ve la otra persona en la sala y en el resultado.</span>' +
        '</label>' +
        '<div>' +
          '<span class="chico" style="font-weight:700">Tu dibujo</span>' +
          '<div class="dibujos" style="margin-top:var(--e-2)">' +
            DIBUJOS.map(function (d) {
              return '<button class="dibujo" data-dibujo="' + d + '"' +
                (d === fichaElegida ? ' aria-pressed="true"' : '') + '>' + d + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<p class="chico" id="f-error" style="color:var(--peligro)"></p>' +
      '</div>';
    abrirModal('m-perfil');
    setTimeout(function () { var n = $('#f-nombre'); if (n && !p.nombre) n.focus(); }, 60);
  }

  var fichaElegida = '🙂';

  function guardarFicha() {
    var nombre = ($('#f-nombre').value || '').trim();
    if (nombre.length < 2) { $('#f-error').textContent = 'Escribe un nombre de al menos dos letras.'; return; }

    datos.actualizar({ nombre: nombre, avatar: fichaElegida });
    cerrarModal('m-perfil');
    pintarPerfil();
    if (vistaActual === 'jugar') pintarJugar();

    if (window.ATWI.auth && window.ATWI.auth.dentro()) {
      window.ATWI.auth.guardarPerfil({ nombre: nombre, avatar: fichaElegida })
        .catch(function () {
          /* El cambio ya se ve; si el servidor no contestó, se reintenta solo
             la próxima vez que se abra la ficha. No se le grita a nadie. */
        });
    }
  }

  /* ======================================================================
     El buzón
     ====================================================================== */
  var ICONO_AVISO = {
    invitacion: '📨', tu_turno: '🎙️', resultado: '🏁', revancha: '⚔️',
    revision: '🤝', acuerdo: '🤝', vinculo: '💞', plataforma: '📣'
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
            (a.debate ? 'data-ir-debate="' + esc(a.debate) + '"' : '') + '>' +
            '<span class="aviso__icono">' + (ICONO_AVISO[a.tipo] || '•') + '</span>' +
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
  var MINUTOS = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 12 };

  function abrirTema(id) {
    var t = datos.tema(id);
    if (!t) return;
    propuesta.temaId = id;
    propuesta.modo = null;
    propuesta.turnos = cfg.reglas.turnosPorDefecto;

    var tocado = t.propio || datos.estaReescrito(id);

    $('#m-tema .modal__titulo').textContent = t.titulo;
    $('#m-tema .modal__cuerpo').innerHTML =
      '<div class="tarjeta tarjeta--aire" style="margin-bottom:var(--e-3)">' +
        '<p style="font-family:var(--display);font-weight:800;font-size:var(--t-h3);line-height:1.25">' + esc(t.enunciado) + '</p>' +
      '</div>' +

      /* Reescribir el tema de una discusión es algo que la otra persona tiene
         derecho a ver, así que la marca dice quién y cuándo. */
      (tocado
        ? '<div class="reescrito" style="margin-bottom:var(--e-3)">' +
            window.ATWI.iconoSVG('lapiz', 16) +
            '<span>' + (t.propio ? 'Tema suyo' : 'A su manera') +
            ', por <strong>' + esc(t.editadoPor || 'alguien') + '</strong>' +
            (t.editado ? ' · ' + haceCuanto(t.editado) : '') + '</span>' +
          '</div>'
        : '') +

      '<div class="fila fila--entre" style="margin-bottom:var(--e-2)">' +
        '<h3>Las dos posturas</h3>' +
        '<button class="boton boton--suave boton--chico" data-accion="editar-tema">' +
          window.ATWI.iconoSVG('lapiz', 16) + (tocado ? 'Cambiar' : 'A nuestra manera') + '</button>' +
      '</div>' +
      '<div class="apilado" style="margin-bottom:var(--e-5)">' +
        posturaCaja('A', t.a) +
        posturaCaja('B', t.b) +
      '</div>' +
      '<div class="aviso-ia">' + icono('aviso', 20) +
        '<span>Las dos se pueden defender. Si una no encaja con la discusión de ustedes, ' +
        'reescríbela: el tema es una plantilla, no una sentencia.</span>' +
      '</div>';

    abrirModal('m-tema');
  }

  function posturaCaja(letra, texto) {
    return '<div class="tarjeta" style="display:grid;grid-template-columns:28px 1fr;gap:var(--e-3);align-items:start">' +
        '<span class="chip chip--marca" style="justify-content:center">' + letra + '</span>' +
        '<span class="chico">' + esc(texto) + '</span>' +
      '</div>';
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
      !t ? 'Tu propio tema' : (propio ? 'Tu tema' : 'A su manera');

    $('#m-escribir .modal__cuerpo').innerHTML =
      '<p class="chico suave" style="margin-bottom:var(--e-4)">' +
        (t && !propio
          ? 'Cambia el enunciado o las posturas para que se parezcan a la discusión de ustedes. ' +
            'El tema original del catálogo no se toca: puedes volver a él cuando quieras.'
          : 'Escribe la discusión como es en casa. El enunciado plantea el desacuerdo, ' +
            'y cada postura es lo que defiende una de las dos partes.') +
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
        campoTexto('e-enunciado', 'El enunciado', t ? t.enunciado : '', 'textarea',
                   'La disputa, en una frase, con las dos salidas dentro. ' +
                   'Por ejemplo: «Los platos se lavan al terminar de comer, o pueden esperar a la mañana».', 240) +

        '<div class="postura-campo postura-campo--a">' +
          campoTexto('e-a', 'Postura A', t ? t.a : '', 'textarea',
                     'Lo que defiende quien está de un lado.', 240) +
        '</div>' +
        '<div class="postura-campo postura-campo--b">' +
          campoTexto('e-b', 'Postura B', t ? t.b : '', 'textarea',
                     'Lo que defiende quien está del otro.', 240) +
        '</div>' +

        '<div>' +
          '<span class="chico" style="font-weight:700">¿Cuánto pesa?</span>' +
          '<div class="filtros" style="margin-top:var(--e-2)">' +
            [['ligera', 'Ligera'], ['media', 'Media'], ['profunda', 'Profunda']].map(function (x) {
              var puesta = (t ? t.intensidad : 'media') === x[0];
              return '<button class="chip chip--filtro" data-intensidad="' + x[0] + '"' +
                     (puesta ? ' aria-pressed="true"' : '') + '>' + x[1] + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<p class="chico" id="e-error" style="color:var(--peligro)"></p>' +
      '</div>' +

      '<div class="aviso-ia" style="margin-top:var(--e-4)">' + icono('aviso', 20) +
        '<span>Las dos posturas tienen que poder defenderse. Si una es indefendible, ' +
        'el árbitro no tiene nada que arbitrar y el resultado no vale nada.</span>' +
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

    intensidadElegida = (t && t.intensidad) || 'media';
    abrirModal('m-escribir');
    setTimeout(function () { var n = $('#e-titulo'); if (n && !t) n.focus(); }, 60);
  }

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
    var titulo = v('e-titulo'), enunciado = v('e-enunciado'), a = v('e-a'), b = v('e-b');
    var fallo =
      titulo.length < 3 ? 'El título necesita al menos tres letras.' :
      enunciado.length < 15 ? 'El enunciado se queda corto: tiene que plantear la disputa entera.' :
      a.length < 5 ? 'Falta lo que defiende la postura A.' :
      b.length < 5 ? 'Falta lo que defiende la postura B.' :
      a.toLowerCase() === b.toLowerCase() ? 'Las dos posturas dicen lo mismo: entonces no hay debate.' : '';
    if (fallo) { $('#e-error').textContent = fallo; return; }

    var campos = { titulo: titulo, enunciado: enunciado, a: a, b: b, intensidad: intensidadElegida };
    var guardado = escribiendo.propio
      ? datos.guardarTemaPropio(Object.assign({ id: escribiendo.id }, campos))
      : datos.reescribir(escribiendo.id, campos);

    cerrarModal('m-escribir');
    pintarCatalogo();
    /* Si se estaba mirando ese tema, se vuelve a abrir ya con lo nuevo. */
    if (propuesta.temaId === guardado.id || !$('#m-tema').hidden) abrirTema(guardado.id);
  }

  function abrirModo() {
    var t = datos.tema(propuesta.temaId);
    if (!t) return;

    $('#m-modo .modal__cuerpo').innerHTML =
      '<p class="suave chico" style="margin-bottom:var(--e-4)">' +
        'Eliges cómo quieres jugar <strong>' + esc(t.titulo) + '</strong>. ' +
        'Es una propuesta: la otra persona tiene que aceptarla antes de empezar.' +
      '</p>' +
      '<div class="apilado">' +
        opcionModo('debate', 'Debate', 'Compiten por quién argumenta mejor. El juez declara ganador y explica por qué. Queda en tu historial.') +
        opcionModo('negociacion', 'Negociación', 'Sin ganador. El negociador propone tres acuerdos, votan y firman el que les convenza. Pueden seguir en desacuerdo.') +
      '</div>' +

      '<h3 style="margin:var(--e-5) 0 var(--e-2)">¿Cuántos turnos?</h3>' +
      '<div class="turnos-fila">' +
        [1, 2, 3, 4, 5].map(function (n) {
          var conCupo = cfg.reglas.turnosConCupo.indexOf(n) !== -1;
          return '<button class="turno-ficha' + (conCupo ? ' turno-ficha--cupo' : '') + '" ' +
            'data-turnos="' + n + '"' + (propuesta.turnos === n ? ' aria-pressed="true"' : '') + '>' +
            '<span class="turno-ficha__n">' + n + '</span>' +
            '<span class="turno-ficha__min">' + MINUTOS[n] + ' min</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<p class="chico tenue" style="margin-top:var(--e-2)">4 y 5 turnos necesitan cupo.</p>' +
      '<div class="aviso-ia" style="margin-top:var(--e-4)">' + icono('aviso', 20) +
        '<span>Si no se ponen de acuerdo en el modo, el debate no se juega. Nadie puede imponerle un Debate al otro.</span>' +
      '</div>';

    $('#m-modo').className = 'modal';
    $$('#m-modo .modal__pie button').forEach(function (b, i) {
      b.disabled = true;
      if (i === 0) b.className = 'boton boton--bloque boton--grande';
    });
    abrirModal('m-modo');
  }

  function opcionModo(clave, nombre, que) {
    return '<button class="opcion" data-modo="' + clave + '" aria-pressed="false">' +
        '<span style="display:grid;grid-template-columns:44px 1fr;gap:var(--e-3);align-items:center">' +
          '<span class="modo__icono" style="width:44px;height:44px;border-radius:14px;' +
            'background:var(--' + clave + '-tinte);color:var(--' + clave + '-oscuro)">' + icono(clave, 24) + '</span>' +
          '<span><span class="modo__nombre">' + nombre + '</span>' +
          '<span class="modo__que">' + que + '</span></span>' +
        '</span>' +
        '<span class="opcion__marca">' + icono('listo', 16) + '</span>' +
      '</button>';
  }

  function elegirModo(clave) {
    propuesta.modo = clave;
    $$('#m-modo .opcion').forEach(function (o) {
      o.setAttribute('aria-pressed', String(o.dataset.modo === clave));
    });
    /* Desde que se elige el modo, el flujo entero lleva SU color. Antes seguía
       en lavanda de marca hasta entrar a la sala, y el lavanda es la identidad,
       no el modo: un color por modo y no se mezclan. */
    $('#m-modo').className = 'modal modal--' + clave;
    $$('#m-modo .modal__pie button').forEach(function (b, i) {
      b.disabled = false;
      if (i === 0) b.className = 'boton boton--bloque boton--grande boton--' + clave;
    });
  }

  /* ======================================================================
     Antes de empezar: quién defiende qué, y con quién se juega
     Sin esto la partida arrancaba con «Tú» contra «La otra parte» y sin decir
     quién defendía cuál de las dos posturas, que es justo lo que el árbitro
     tiene que juzgar.
     ====================================================================== */
  function abrirPreparar() {
    var t = datos.tema(propuesta.temaId);
    if (!t) return;
    var p = datos.perfil();
    propuesta.miPostura = null;
    propuesta.otro = propuesta.otro || '';

    $('#m-preparar').className = 'modal modal--' + propuesta.modo;
    $('#m-preparar .modal__cuerpo').innerHTML =
      '<p class="sala__enunciado" style="color:var(--tinta);margin-bottom:var(--e-4)">' +
        esc(t.enunciado) + '</p>' +

      '<h3 style="margin-bottom:var(--e-2)">¿Cuál defiendes tú?</h3>' +
      '<div class="apilado" style="margin-bottom:var(--e-5)">' +
        opcionPostura('a', 'A', t.a) +
        opcionPostura('b', 'B', t.b) +
      '</div>' +

      '<h3 style="margin-bottom:var(--e-2)">¿Quiénes juegan?</h3>' +

      /* Si la ficha todavía no tiene nombre se pide AQUÍ. Antes se rellenaba
         solo con «Tú», y en la sala el botón y las ruedas acababan diciendo
         «Tú» en vez del nombre de nadie. */
      (p.nombre
        ? ''
        : '<label style="display:block;margin-bottom:var(--e-3)">' +
            '<span class="chico" style="font-weight:700">Tu nombre</span>' +
            '<input class="campo" id="p-yo" type="text" maxlength="24" autocomplete="given-name" ' +
              'placeholder="Tu nombre" style="margin-top:6px">' +
          '</label>') +

      '<label style="display:block">' +
        (p.nombre ? '' : '<span class="chico" style="font-weight:700">Su nombre</span>') +
        '<input class="campo" id="p-otro" type="text" maxlength="24" autocomplete="off" ' +
          'placeholder="Su nombre" value="' + esc(propuesta.otro) + '"' +
          (p.nombre ? '' : ' style="margin-top:6px"') + '>' +
        '<span class="chico tenue" style="display:block;margin-top:6px">' +
          'Van a jugar los dos en este teléfono, por turnos. Los nombres son para saber ' +
          'de quién es cada intervención y qué dice el resultado.</span>' +
      '</label>' +
      '<p class="chico" id="p-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>' +

      '<div class="aviso-ia" style="margin-top:var(--e-5)">' + icono('aviso', 20) +
        '<span>Quién abre se sortea, como en ajedrez, y se enseña antes de empezar. ' +
        'En la revancha abre ' + (propuesta.modo === 'debate' ? 'el otro' : 'la otra parte') + '.</span>' +
      '</div>';

    var b = $('#m-preparar .modal__pie button');
    b.disabled = true;
    b.className = 'boton boton--bloque boton--grande boton--' + propuesta.modo;
    abrirModal('m-preparar');
  }

  function opcionPostura(clave, letra, texto) {
    return '<button class="opcion opcion--postura" data-postura="' + clave + '" aria-pressed="false">' +
        '<span style="display:grid;grid-template-columns:32px 1fr;gap:var(--e-3);align-items:start">' +
          '<span class="chip chip--marca" style="justify-content:center">' + letra + '</span>' +
          '<span class="chico" style="line-height:1.45">' + esc(texto) + '</span>' +
        '</span>' +
        '<span class="opcion__marca">' + icono('listo', 16) + '</span>' +
      '</button>';
  }

  function elegirPostura(clave) {
    propuesta.miPostura = clave;
    $$('#m-preparar .opcion').forEach(function (o) {
      o.setAttribute('aria-pressed', String(o.dataset.postura === clave));
    });
    revisarPreparar();
  }

  function revisarPreparar() {
    var otro = ($('#p-otro') && $('#p-otro').value || '').trim();
    var yo = $('#p-yo') ? ($('#p-yo').value || '').trim() : (datos.perfil().nombre || '');
    $('#m-preparar .modal__pie button').disabled =
      !(propuesta.miPostura && otro.length >= 2 && yo.length >= 2);
  }

  /* De momento se juega en un solo dispositivo, por turnos, que es el modo que
     el documento permite para los temas del catálogo. Con dos teléfonos hace
     falta el servidor y llega después. */
  function sortearYJugar() {
    var t = datos.tema(propuesta.temaId);
    var otro = ($('#p-otro').value || '').trim();
    var yo = $('#p-yo') ? ($('#p-yo').value || '').trim() : (datos.perfil().nombre || '');

    if (yo.length < 2) { $('#p-error').textContent = 'Escribe tu nombre.'; return; }
    if (otro.length < 2) { $('#p-error').textContent = 'Escribe con quién juegas.'; return; }
    if (otro.toLowerCase() === yo.toLowerCase()) {
      $('#p-error').textContent = 'Se llaman igual: ponle otro nombre para no confundirse en la sala.';
      return;
    }
    /* El nombre que se escribe aquí es el de la ficha: se guarda, y de paso
       deja de preguntarse en la siguiente partida. */
    if (!datos.perfil().nombre) {
      datos.actualizar({ nombre: yo });
      if (window.ATWI.auth && window.ATWI.auth.dentro()) {
        window.ATWI.auth.guardarPerfil({ nombre: yo }).catch(function () {});
      }
    }
    propuesta.otro = otro;

    /* `quien[0]` defiende la postura A y `quien[1]` la B: eso lo fija quien
       elige postura, no el sorteo. El sorteo decide solo QUIÉN ABRE. */
    var porPostura = propuesta.miPostura === 'a' ? [yo, otro] : [otro, yo];
    var abre = Math.random() < 0.5 ? 0 : 1;

    cerrarModal('m-preparar');
    cerrarModal('m-modo');
    cerrarModal('m-tema');
    window.ATWI.partida.empezar({
      tema: t,
      modo: propuesta.modo,
      turnos: propuesta.turnos || cfg.reglas.turnosPorDefecto,
      publico: modoPublico || 'pareja',
      posturas: porPostura,      // [quien defiende A, quien defiende B]
      abre: abre                 // índice sobre `posturas`
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

    cerrarModal('m-modo');
    cerrarModal('m-tema');
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

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-vista]');
    if (b) { irA(b.dataset.vista); return; }

    var fil = e.target.closest('[data-filtro]');
    if (fil) { filtro = fil.dataset.filtro; pintarCatalogo(); return; }

    var pub = e.target.closest('[data-publico]');
    if (pub) { modoPublico = pub.dataset.publico; categoriaAbierta = null; pintarCatalogo(); return; }

    var cat = e.target.closest('[data-categoria]');
    if (cat) { categoriaAbierta = cat.dataset.categoria; pintarCatalogo(); return; }

    var tema = e.target.closest('[data-tema]');
    if (tema) { abrirTema(tema.dataset.tema); return; }

    var tn = e.target.closest('[data-turnos]');
    if (tn) {
      propuesta.turnos = Number(tn.dataset.turnos);
      $$('#m-modo [data-turnos]').forEach(function (x) {
        if (Number(x.dataset.turnos) === propuesta.turnos) x.setAttribute('aria-pressed', 'true');
        else x.removeAttribute('aria-pressed');
      });
      return;
    }

    var modo = e.target.closest('[data-modo]');
    if (modo) { elegirModo(modo.dataset.modo); return; }

    var post = e.target.closest('[data-postura]');
    if (post) { elegirPostura(post.dataset.postura); return; }

    var dib = e.target.closest('[data-dibujo]');
    if (dib) {
      fichaElegida = dib.dataset.dibujo;
      $$('#m-perfil [data-dibujo]').forEach(function (x) {
        if (x.dataset.dibujo === fichaElegida) x.setAttribute('aria-pressed', 'true');
        else x.removeAttribute('aria-pressed');
      });
      return;
    }

    var inten = e.target.closest('[data-intensidad]');
    if (inten) {
      intensidadElegida = inten.dataset.intensidad;
      $$('#m-escribir [data-intensidad]').forEach(function (x) {
        if (x.dataset.intensidad === intensidadElegida) x.setAttribute('aria-pressed', 'true');
        else x.removeAttribute('aria-pressed');
      });
      return;
    }

    var cerrar = e.target.closest('[data-cerrar]');
    if (cerrar) { cerrarModal(cerrar.dataset.cerrar); return; }

    var acc = e.target.closest('[data-accion]');
    if (!acc) return;
    var a = acc.dataset.accion;

    if (a === 'buzon') { abrirBuzon(); }
    else if (a === 'nuevo') { irA('catalogo'); }
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
    else if (a === 'catalogo-atras') { categoriaAbierta = null; pintarCatalogo(); }
    else if (a === 'cambiar-publico') { modoPublico = null; categoriaAbierta = null; pintarCatalogo(); }
    else if (a === 'elegir-modo') { abrirModo(); }
    else if (a === 'proponer') { proponer(); }
    else if (a === 'jugar-aqui') { abrirPreparar(); }
    else if (a === 'sortear') { sortearYJugar(); }
    else if (a === 'editar-ficha') { abrirFicha(); }
    else if (a === 'guardar-ficha') { guardarFicha(); }
    else if (a === 'tema-nuevo') { abrirEscribir(null); }
    else if (a === 'editar-tema') { abrirEscribir(propuesta.temaId); }
    else if (a === 'guardar-tema') { guardarTema(); }
    else if (a === 'devolver-tema') {
      datos.devolverAlOriginal(escribiendo.id);
      cerrarModal('m-escribir');
      pintarCatalogo();
      abrirTema(escribiendo.id);
    }
    else if (a === 'borrar-tema') {
      if (confirm('Se borra este tema de la lista de ustedes. Lo ya debatido sigue en el historial.')) {
        datos.borrarTemaPropio(escribiendo.id);
        cerrarModal('m-escribir');
        cerrarModal('m-tema');
        pintarCatalogo();
      }
    }
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
    if (e.target.id === 'p-otro' || e.target.id === 'p-yo') { revisarPreparar(); return; }
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
  }

  function abrir() {
    // Nadie entra al juego sin pasar por la puerta. En modo local basta el nombre.
    window.ATWI.entrada.exigir(arrancar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', abrir);
  else abrir();
})();
