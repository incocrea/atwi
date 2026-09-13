/* ==========================================================================
   ATWI · datos.js
   Capa de datos. Tiene dos modos y la interfaz no nota la diferencia:

     · MODO LOCAL (config.supabaseUrl vacío): todo vive en localStorage. Sirve
       para construir y probar el diseño sin backend. Es el modo por defecto.
     · MODO SERVIDOR: Supabase para cuentas y datos, y las funciones de borde
       para transcribir y para el juez. Se activa solo con rellenar config.js.

   El catálogo siempre se lee del JSON estático: son 99 KB y no cambia entre
   sesiones, así que no tiene sentido pedirlo a una base de datos.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var CLAVE = 'atwi.perfil.v1';
  /* La lista de temas NO es del perfil: es de la relación. Dos personas que
     juegan juntas comparten reescrituras y temas propios, y la misma persona
     con otra pareja tiene otra lista. Mientras no haya servidor solo existe
     una relación, pero la clave va aparte para que el día que la haya se
     migre sola. Ver docs/00 «El catálogo es una plantilla». */
  var CLAVE_TEMAS = 'atwi.temas.v1';
  /* Quien juega enfrente en una partida local NO tiene cuenta: es alguien que
     agarró este teléfono. No hay perfil suyo en ningún sitio, pero su ficha
     —dibujo y color— sí se recuerda aquí, para que la próxima vez que juegue
     salga como salió. La partida va al historial igual; lo que no existe es un
     perfil de oponente al que colgarla. */
  var CLAVE_INVITADOS = 'atwi.invitados.v1';

  /* --- El nombre: UNA SOLA PALABRA, 16 LETRAS COMO MUCHO -------------------
     No es un capricho de formulario. El nombre sale en el rótulo que flota
     sobre cada figura en la sala, y esos dos rótulos van uno al lado del otro
     en 375 px de ancho: «María Fernanda» y «Juan Sebastián» juntos no caben y
     se salen de la pantalla, que es el único fallo que en este proyecto no se
     negocia. Así que se pide el primer nombre o un apodo y ya está.

     Dieciséis es lo que mide el rótulo más largo que cabe con el otro al lado,
     medido a 375 px con la ficha de 34 px dentro.

     La regla vive AQUÍ, en la capa de datos, y no en cada formulario: se pide
     el nombre en cuatro sitios —el registro, el paso de la contraseña, la ficha
     del perfil y la preparación de la partida local— y cuatro copias de la
     misma comprobación es una que se queda vieja. */
  var NOMBRE_MAX = 16;
  var NOMBRE_MIN = 2;

  /** Quita los espacios de los bordes y junta los de dentro. No corta ni parte:
      solo deja el texto en su forma canónica para poder juzgarlo. */
  function limpiarNombre(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  /** El nombre RECORTADO a la fuerza: primera palabra y 16 letras. Es lo que se
      le aplica a lo que ya estaba guardado —un perfil o un invitado de antes de
      esta regla traen el nombre entero— y por eso no puede rechazar nada: nadie
      lo está escribiendo, así que no hay a quién pedirle que lo corrija. */
  function recortarNombre(s) {
    return limpiarNombre(s).split(' ')[0].slice(0, NOMBRE_MAX);
  }

  /** El motivo por el que este nombre no vale, o '' si vale. El texto se enseña
      tal cual, así que dice qué hacer y no solo qué está mal. */
  function errorDeNombre(s) {
    var n = limpiarNombre(s);
    if (!n) return 'Escribe tu nombre.';
    if (n.length < NOMBRE_MIN) return 'Escribe un nombre de al menos dos letras.';
    if (n.indexOf(' ') !== -1) {
      return 'Va una sola palabra: tu primer nombre o un apodo.';
    }
    if (n.length > NOMBRE_MAX) {
      return 'Máximo ' + NOMBRE_MAX + ' letras. Usa tu primer nombre o un apodo.';
    }
    return '';
  }

  /* --- Estado de la persona ------------------------------------------------
     Contadores SEPARADOS y sin marcador comparativo entre los dos miembros de
     la pareja: es una decisión de diseño con evidencia detrás, no un descuido.
     Ver docs/02-modos-y-catalogo.md §11. */
  var PERFIL_NUEVO = {
    nombre: '',
    /* El avatar es una CLAVE DE PERSONAJE —'kai' o 'luna'—, no un dibujo. Fue
       un emoji con un color a elegir hasta el 2026-09-12; lo guardado de
       entonces se normaliza al cargar, porque un perfil viejo traería un emoji
       aquí y la sala intentaría pintarlo como si fuera una cara. */
    avatar: 'kai',
    /* El color YA NO ES EL FONDO: el fondo lo pone el tinte del personaje. Esto
       es el aro que lo rodea, y sí se elige, porque es lo que distingue mi ficha
       de la del otro sin obligarnos a ser personajes distintos. */
    avatarBorde: '#7A6AD8',
    nivel: 1,
    puntos: 0,
    puntosNivel: 100,
    debates: 0,          // partidas jugadas en modo Debate
    acuerdos: 0,         // acuerdos firmados en modo Negociación
    semanasActivas: 0,   // sustituye a la racha: solo sube, nunca se rompe
    insignias: [],
    temasJugados: [],
    partidas: [],
    actas: []
  };

  var perfil = null;

  function cargar() {
    if (perfil) return perfil;
    try {
      var crudo = localStorage.getItem(CLAVE);
      perfil = crudo ? Object.assign({}, PERFIL_NUEVO, JSON.parse(crudo)) : Object.assign({}, PERFIL_NUEVO);
    } catch (e) {
      perfil = Object.assign({}, PERFIL_NUEVO);
    }
    if (!window.ATWI.esPersonaje || !window.ATWI.esPersonaje(perfil.avatar)) {
      perfil.avatar = PERFIL_NUEVO.avatar;
    }
    /* `avatarFondo` fue el color de relleno hasta el 2026-09-12. Se hereda como
       color de borde en vez de tirarlo: quien ya habia elegido el suyo se lo
       encuentra donde toca y no de vuelta en el de por defecto. */
    if (!perfil.avatarBorde) perfil.avatarBorde = perfil.avatarFondo || PERFIL_NUEVO.avatarBorde;
    delete perfil.avatarFondo;
    /* Lo guardado antes de la regla del nombre viene entero. Aquí se recorta, y
       no se le pide a nadie que lo arregle: el rótulo de la sala tiene que caber
       hoy, con lo que haya, sin pasar por un formulario. */
    perfil.nombre = recortarNombre(perfil.nombre);
    return perfil;
  }

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(perfil)); } catch (e) { /* modo incógnito */ }
  }

  /* Buzón de mentira para poder trabajar el diseño sin backend. */
  function demoAvisos() {
    if (!demoAvisos.cache) {
      demoAvisos.cache = [
        { id: 'd1', tipo: 'invitacion', titulo: 'Marta te propone un debate',
          cuerpo: 'Los platos, ¿ya o luego? · Modo Debate · 3 turnos', leido: null,
          creado: new Date(Date.now() - 3 * 60000).toISOString() },
        { id: 'd2', tipo: 'tu_turno', titulo: 'Te toca grabar',
          cuerpo: 'Marta ya grabó su turno 2 en «El teléfono en el dormitorio»', leido: null,
          creado: new Date(Date.now() - 90 * 60000).toISOString() },
        { id: 'd3', tipo: 'revancha', titulo: 'Marta te pide la revancha',
          cuerpo: 'Sobre «La propina». Tú decides si la aceptas.', leido: null,
          creado: new Date(Date.now() - 26 * 3600000).toISOString() },
        { id: 'd4', tipo: 'resultado', titulo: 'Ya hay acta',
          cuerpo: 'Firmaron el acuerdo sobre «El botón de posponer la alarma»',
          leido: new Date(Date.now() - 50 * 3600000).toISOString(),
          creado: new Date(Date.now() - 52 * 3600000).toISOString() }
      ];
    }
    return demoAvisos.cache;
  }

  /* --- La lista de temas de esta relación -----------------------------------
     El catálogo de 105 temas es una PLANTILLA y no cambia nunca. Encima van
     dos cosas: temas reescritos (el original sigue ahí, se puede volver) y
     temas propios. La lista que se ve es la plantilla con lo reescrito
     sustituido, más lo propio. */
  var MIS_TEMAS = 'Mis temas';
  var listaTemas = null;

  function cargarTemas() {
    if (listaTemas) return listaTemas;
    try {
      var crudo = localStorage.getItem(CLAVE_TEMAS);
      listaTemas = crudo ? JSON.parse(crudo) : { propios: [], reescritos: {} };
    } catch (e) {
      listaTemas = { propios: [], reescritos: {} };
    }
    if (!listaTemas.propios) listaTemas.propios = [];
    if (!listaTemas.reescritos) listaTemas.reescritos = {};
    return listaTemas;
  }

  function guardarTemas() {
    try { localStorage.setItem(CLAVE_TEMAS, JSON.stringify(listaTemas)); } catch (e) {}
  }

  /** Un tema del catálogo con la reescritura de esta relación encima. */
  function conReescritura(t) {
    var r = cargarTemas().reescritos[t.id];
    if (!r) return t;
    return Object.assign({}, t, r, { id: t.id, reescrito: true });
  }

  /* --- Los invitados locales ------------------------------------------------ */
  var invitados = null;

  function cargarInvitados() {
    if (invitados) return invitados;
    try { invitados = JSON.parse(localStorage.getItem(CLAVE_INVITADOS) || '[]'); }
    catch (e) { invitados = []; }
    if (!Array.isArray(invitados)) invitados = [];
    /* Por lo mismo que el perfil: los invitados recordados de antes traen el
       nombre como se escribió, y también salen en un rótulo. */
    invitados.forEach(function (g) { if (g) g.nombre = recortarNombre(g.nombre); });
    return invitados;
  }

  function guardarInvitados() {
    try { localStorage.setItem(CLAVE_INVITADOS, JSON.stringify(invitados)); } catch (e) {}
  }

  function mismoNombre(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  /* --- Catálogo ------------------------------------------------------------ */
  var catalogo = null;

  function pedirCatalogo() {
    if (catalogo) return Promise.resolve(catalogo);
    /* El sello de versión va también aquí. Los CSS y los JS los sella el
       publicador en el HTML, pero este archivo lo pide el navegador por su
       cuenta y se quedaría con la copia vieja del catálogo. `config.version`
       la rellena tools/publicar.ps1; en local está vacía y no estorba. */
    var v = (window.ATWI.config && window.ATWI.config.version) ? '?v=' + window.ATWI.config.version : '';
    return fetch('../assets/datos/catalogo.json' + v)
      .then(function (r) {
        if (!r.ok) throw new Error('No se pudo cargar el catálogo');
        return r.json();
      })
      .then(function (d) { catalogo = d; return d; });
  }

  window.ATWI.datos = {
    /** ¿Estamos hablando con un servidor o todo es local? */
    enLinea: function () { return Boolean(cfg.supabaseUrl && cfg.supabaseAnon); },

    /* La regla del nombre, para los cuatro formularios que lo piden. */
    NOMBRE_MAX: NOMBRE_MAX,
    limpiarNombre: limpiarNombre,
    recortarNombre: recortarNombre,
    errorDeNombre: errorDeNombre,

    perfil: cargar,

    actualizar: function (cambios) {
      Object.assign(cargar(), cambios);
      guardar();
      return perfil;
    },

    catalogo: pedirCatalogo,

    /** El nombre de la categoría donde caen los temas que escribe la gente. */
    MIS_TEMAS: MIS_TEMAS,

    /** Todos los temas jugables: la plantilla reescrita más los propios. */
    todos: function () {
      if (!catalogo) return cargarTemas().propios.slice();
      return catalogo.temas.map(conReescritura).concat(cargarTemas().propios);
    },

    /** Temas de una categoría, con los del recorrido inicial primero. */
    temasDe: function (nombreCategoria) {
      if (nombreCategoria === MIS_TEMAS) return cargarTemas().propios.slice().reverse();
      if (!catalogo) return [];
      return catalogo.temas
        .filter(function (t) { return t.categoria === nombreCategoria; })
        .map(conReescritura)
        .sort(function (a, b) { return (a.inicial || 99) - (b.inicial || 99); });
    },

    /* --- Escribir temas -----------------------------------------------------
       Dos operaciones distintas que la interfaz enseña casi igual:
         · REESCRIBIR un tema del catálogo. El original no se toca: se guarda
           encima lo que esta relación prefiere, y se puede devolver.
         · CREAR un tema propio, que cae en «Mis temas» y no existe en ningún
           catálogo.
       Se guarda quién lo escribió y cuándo, porque reescribir el tema de una
       discusión es algo que la otra persona tiene derecho a ver. */
    reescribir: function (id, campos) {
      var t = cargarTemas();
      t.reescritos[id] = Object.assign({}, t.reescritos[id], campos, {
        editadoPor: cargar().nombre || 'alguien',
        editado: new Date().toISOString()
      });
      guardarTemas();
      return this.tema(id);
    },

    /**
     * Cambia SOLO los campos que se le pasen, sea el tema del catálogo o
     * propio. Es lo que usa el retoque de una sección suelta: quien está a
     * punto de empezar y quiere afinar una postura no debería tener que abrir
     * el editor entero ni volver a escribir lo que ya estaba bien.
     */
    retocarTema: function (id, campos) {
      var t = this.tema(id);
      if (!t) return null;
      if (t.propio) return this.guardarTemaPropio(Object.assign({}, t, campos));
      return this.reescribir(id, campos);
    },

    /** Devuelve un tema reescrito a como estaba en el catálogo. */
    devolverAlOriginal: function (id) {
      delete cargarTemas().reescritos[id];
      guardarTemas();
      return this.tema(id);
    },

    /** ¿Este tema está reescrito respecto al catálogo? */
    estaReescrito: function (id) {
      return Boolean(cargarTemas().reescritos[id]);
    },

    /** Crea o actualiza un tema propio. Devuelve el tema guardado. */
    guardarTemaPropio: function (t) {
      var lista = cargarTemas();
      var quien = cargar().nombre || 'alguien';
      var existente = null;
      for (var i = 0; i < lista.propios.length; i++) {
        if (lista.propios[i].id === t.id) { existente = lista.propios[i]; break; }
      }
      var tema = Object.assign(existente || {
        id: 'propio-' + Date.now().toString(36),
        categoria: MIS_TEMAS,
        emoji: '✍️'
      }, {
        titulo: t.titulo,
        enunciado: t.enunciado,
        a: t.a,
        b: t.b,
        intensidad: t.intensidad || 'media',
        propio: true,
        editadoPor: quien,
        editado: new Date().toISOString()
      });
      if (!existente) lista.propios.push(tema);
      guardarTemas();
      return tema;
    },

    borrarTemaPropio: function (id) {
      var lista = cargarTemas();
      lista.propios = lista.propios.filter(function (t) { return t.id !== id; });
      guardarTemas();
    },

    cuantosPropios: function () { return cargarTemas().propios.length; },

    /* --- Invitados locales --------------------------------------------------
       Fichas de quien juega enfrente en este teléfono sin tener cuenta. No son
       perfiles: no hay historial suyo, ni contadores, ni nada que les pertenezca.
       Es solo memoria de cortesía para no volver a preguntar el dibujo y el
       color cada vez que juega la misma persona. */
    invitados: function () { return cargarInvitados().slice(); },

    invitado: function (nombre) {
      var lista = cargarInvitados();
      for (var i = 0; i < lista.length; i++) {
        if (mismoNombre(lista[i].nombre, nombre)) return lista[i];
      }
      return null;
    },

    recordarInvitado: function (ficha) {
      if (!ficha || !ficha.nombre) return null;
      var lista = cargarInvitados();
      /* El mismo cuenta como el mismo cuando repite NOMBRE Y PERSONAJE. Una
         Diana que juega como Luna y una Diana que juega como Kai son dos fichas
         distintas, y las dos tienen que poder estar en la lista. */
      var guardado = null;
      for (var k = 0; k < lista.length; k++) {
        if (mismoNombre(lista[k].nombre, ficha.nombre) &&
            (!ficha.avatar || !lista[k].avatar || lista[k].avatar === ficha.avatar)) {
          guardado = lista[k];
          break;
        }
      }
      if (guardado) {
        guardado.nombre = ficha.nombre;      // respeta mayúsculas nuevas
        if (ficha.avatar) guardado.avatar = ficha.avatar;
        if (ficha.color) guardado.color = ficha.color;
      } else {
        guardado = { nombre: ficha.nombre, avatar: ficha.avatar, color: ficha.color };
        lista.push(guardado);
      }
      /* El último con quien se jugó primero: es casi siempre el de la próxima. */
      /* Tres. Es una lista para tocar de un vistazo antes de empezar, no un
         historial: con doce, la cuarta en adelante no la mira nadie. */
      invitados = [guardado].concat(lista.filter(function (x) { return x !== guardado; })).slice(0, 3);
      guardarInvitados();
      return guardado;
    },

    olvidarInvitado: function (nombre) {
      invitados = cargarInvitados().filter(function (x) { return !mismoNombre(x.nombre, nombre); });
      guardarInvitados();
    },

    /** Los doce temas con los que arranca una pareja nueva, en orden. */
    recorridoInicial: function () {
      if (!catalogo) return [];
      return catalogo.temas
        .filter(function (t) { return t.inicial; })
        .map(conReescritura)
        .sort(function (a, b) { return a.inicial - b.inicial; });
    },

    /**
     * El siguiente tema del recorrido sin jugar. Ya NO se enseña en la portada
     * —se quitó esa tarjeta— pero el recorrido inicial de doce temas sigue
     * siendo una decisión del producto y esto es lo que lo calcula, así que se
     * queda para cuando se enganche donde toque.
     */
    siguienteSugerido: function () {
      var jugados = cargar().temasJugados;
      var pendientes = this.recorridoInicial().filter(function (t) {
        return jugados.indexOf(t.id) === -1;
      });
      return pendientes[0] || null;
    },

    /** ¿Esta cuenta ya debatió este tema alguna vez? El resultado da igual:
        lo que interesa es saber qué queda por estrenar. */
    yaDebatido: function (id) {
      return cargar().temasJugados.indexOf(id) !== -1;
    },

    /** Busca por palabra en el título, el enunciado y las dos posturas. */
    buscar: function (texto, estado) {
      var q = (texto || '').trim().toLowerCase();
      var yo = this;
      return this.todos().filter(function (t) {
        if (estado === 'sin' && yo.yaDebatido(t.id)) return false;
        if (estado === 'con' && !yo.yaDebatido(t.id)) return false;
        if (!q) return true;
        return (t.titulo + ' ' + t.enunciado + ' ' + t.a + ' ' + t.b).toLowerCase().indexOf(q) !== -1;
      });
    },

    tema: function (id) {
      var lista = this.todos();
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === id) return lista[i];
      }
      return null;
    },

    /** El tema tal y como está en el catálogo, sin la reescritura encima. */
    temaOriginal: function (id) {
      if (!catalogo) return null;
      for (var i = 0; i < catalogo.temas.length; i++) {
        if (catalogo.temas[i].id === id) return catalogo.temas[i];
      }
      return null;
    },

    /* --- Buzón -------------------------------------------------------------
       Con servidor se lee de la base; sin servidor se inventa algo para poder
       ver el diseño. Los avisos los CREAN las funciones de borde, nunca el
       navegador: si no, cualquiera podría meter mensajes en el buzón ajeno. */
    avisos: function () {
      if (!this.enLinea() || !window.ATWI.auth || !window.ATWI.auth.dentro()) {
        return Promise.resolve(demoAvisos());
      }
      return window.ATWI.auth.pedirBuzon().catch(function () { return []; });
    },

    marcarLeidos: function (ids) {
      if (!this.enLinea() || !window.ATWI.auth || !window.ATWI.auth.dentro()) {
        (demoAvisos.cache || []).forEach(function (a) {
          if (ids.indexOf(a.id) !== -1) a.leido = new Date().toISOString();
        });
        return Promise.resolve();
      }
      return window.ATWI.auth.marcarLeidos(ids).catch(function () {});
    },

    /** Borra todo lo local. Solo lo llama el botón de ajustes. */
    olvidar: function () {
      try {
        localStorage.removeItem(CLAVE);
        localStorage.removeItem(CLAVE_TEMAS);
        localStorage.removeItem(CLAVE_INVITADOS);
      } catch (e) {}
      perfil = null;
      listaTemas = null;
      invitados = null;
    }
  };
})();
