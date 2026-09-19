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

  /* MAYÚSCULA INICIAL Y EL RESTO EN MINÚSCULA (regla del titular, 2026-09-16).
     El nombre se pinta en el rótulo que flota sobre cada figura en la sala, en
     el buzón y en el veredicto, y ahí «JUAN» grita y «juan» parece un error.
     Normalizarlo en vez de pedirlo bien tiene una ventaja que se nota: nadie
     tiene que corregir nada ni leer un aviso.

     La regla es literal y por eso predecible: la primera letra sube, todo lo
     demás baja. Un apóstrofo o un guion NO abren palabra nueva —«o'brien» queda
     «O'brien»—, y es deliberado: el campo admite una sola palabra de dieciséis
     letras, así que el caso es raro y una regla con excepciones es una regla que
     hay que explicar. */
  function capitalizar(s) {
    if (!s) return s;
    return s.charAt(0).toLocaleUpperCase('es') + s.slice(1).toLocaleLowerCase('es');
  }

  /** El nombre RECORTADO a la fuerza: primera palabra, 16 letras y capitalizado.
      Es lo que se le aplica a lo que ya estaba guardado —un perfil o un invitado
      de antes de esta regla traen el nombre entero— y por eso no puede rechazar
      nada: nadie lo está escribiendo, así que no hay a quién pedirle que lo
      corrija. */
  function recortarNombre(s) {
    return capitalizar(limpiarNombre(s).split(' ')[0].slice(0, NOMBRE_MAX));
  }

  /* LO QUE EL CAMPO NO DEJA ESCRIBIR, decisión del titular (2026-09-14). La
     regla se aplica TECLA A TECLA y no al enviar: un campo que no admite un
     espacio se explica solo, y el párrafo que decía «una sola palabra» sobra.

     Pasan letras —con acentos y con ñ—, cifras, y el guion, el apóstrofo y el
     punto, que sí salen en nombres reales. NO pasa nada más: ni espacios, ni
     emoji, ni signos. El nombre se copia en cada turno, viaja a la base y se
     pinta en pantalla, y cuanto menos superficie tenga, menos hay que confiar
     en que los cuatro sitios que lo escapan lo escapen bien.

     La clase se construye UNA vez y con red: `\p{L}` necesita la bandera `u` y
     un navegador viejo la rechaza al compilar. Si eso pasa, cae a un rango
     latino en vez de quedarse sin filtro, porque un filtro que no compila
     borraría el campo entero o no filtraría nada, y las dos son peores. */
  var PASAN;
  try {
    PASAN = new RegExp('[^\\p{L}\\p{N}\'.\\-]', 'gu');
  } catch (e) {
    PASAN = /[^A-Za-zÀ-ÖØ-öø-ÿ0-9'.\-]/g;
  }

  /** El nombre tal como puede quedarse en el campo mientras se escribe. */
  function filtrarNombre(s) {
    return capitalizar(String(s == null ? '' : s).replace(PASAN, '').slice(0, NOMBRE_MAX));
  }

  /* DEJA EL CAMPO YA NORMALIZADO, SIN PERDER EL CURSOR. Vive aquí, con el resto
     de la regla del nombre, y no repetida en cada formulario: se pide el nombre
     en CUATRO sitios —el registro, el paso de la contraseña, la ficha del perfil
     y la preparación de la partida local— y cuatro copias de esto son tres que
     se quedan viejas.

     Tocar `value` manda el cursor al final, así que corregir una letra en medio
     de un nombre ya escrito se volvería imposible. El cursor retrocede tantas
     posiciones como caracteres se hayan comido ANTES de él, que es donde estaría
     si nunca hubieran entrado. Capitalizar no come nada, así que esa cuenta
     sigue valiendo igual. */
  function pulirCampoDeNombre(campo) {
    if (!campo) return;
    var crudo = campo.value;
    var limpio = filtrarNombre(crudo);
    if (limpio === crudo) return;
    var cursor = campo.selectionStart == null ? crudo.length : campo.selectionStart;
    var comidos = cursor - filtrarNombre(crudo.slice(0, cursor)).length;
    campo.value = limpio;
    try { campo.setSelectionRange(cursor - comidos, cursor - comidos); } catch (e) {}
  }

  /** El motivo por el que este nombre no vale, o '' si vale. El texto se enseña
      tal cual, así que dice qué hacer y no solo qué está mal. */
  function errorDeNombre(s) {
    var n = limpiarNombre(s);
    /* APODO, NO NOMBRE (decisión del titular, 2026-09-18): nadie se identifica
       con su nombre real en la plataforma; se juega con un apodo, y el apodo es
       único (migración 0053). Los textos lo dicen así en los cuatro sitios. */
    if (!n) return 'Escribe tu apodo.';
    if (n.length < NOMBRE_MIN) return 'Escribe un apodo de al menos dos letras.';
    if (n.indexOf(' ') !== -1) {
      return 'Va una sola palabra: un apodo para el juego.';
    }
    if (n.length > NOMBRE_MAX) {
      return 'Máximo ' + NOMBRE_MAX + ' letras para el apodo.';
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
    /* EL COLOR ES LA ROPA DEL DIBUJO. Fue el fondo hasta el 2026-09-12, después
       un aro de diez tonos, y desde el 2026-09-13 es una de cuatro variantes
       ilustradas: elegirlo elige sprite. El nombre `avatarBorde` se queda
       porque es lo que hay guardado en los teléfonos y en la base; renombrarlo
       obligaría a migrar dos sitios para ganar una palabra. */
    avatarBorde: 'azul',
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
    /* Lo guardado antes del 2026-09-13 es un hexadecimal de los diez aros, y
       eso ya no apunta a ningún dibujo. Cae en el de serie en vez de dejar al
       personaje sin imagen; no hay forma honesta de repartir diez tonos entre
       cuatro variantes ilustradas. */
    if (window.ATWI.elColor) perfil.avatarBorde = window.ATWI.elColor(perfil.avatarBorde);
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

  /* CON QUIÉN SE ESTÁ JUGANDO, y no es un detalle de pantalla (2026-09-16, lo
     preguntó el titular). Un tema escrito jugando CON AMIGOS no tiene nada que
     hacer en la lista de la pareja: «lo de la suegra» y «el mejor portero de la
     historia» no se mezclan. Hasta hoy los propios se guardaban sin decir de
     qué mesa salieron, así que habrían aparecido en las dos.

     Hoy no se ve porque el catálogo de amigos está vacío y a «Mis propios
     temas» solo se llega desde pareja; en cuanto amigos tenga temas, se mezclan.

     LOS QUE YA ESTÁN GUARDADOS CUENTAN COMO DE PAREJA, y no es una suposición:
     es el único sitio desde el que se podían escribir. */
  var conQuien = null;          // 'pareja' | 'amigos' | null = no filtrar

  /* VALE PARA LOS DEL CATÁLOGO TAMBIÉN, y esto se amplió al poblar amigos y
     familia (2026-09-16): antes solo miraba los temas propios porque el
     catálogo entero era de la pareja. Ahora cada tema dice de qué mesa es, y
     los 105 de siempre no lo dicen porque no hacía falta: cuentan como pareja,
     que es de donde salieron. */
  function esDeEstePublico(t) {
    if (!conQuien) return true;
    return (t.publico || 'pareja') === conQuien;
  }

  /* DOS CLASES DE FICHA EN EL MISMO CATÁLOGO (2026-09-16, con QuiénGane). Los
     305 de Controversia y Pacto son TEMAS: preguntas con dos salidas, escritas
     para que los dos hablen. Los 150 de QuiénGane son PREMIOS: no preguntan
     nada, dicen qué se lleva quien gane.

     VAN JUNTOS Y NO EN DOS ARCHIVOS a propósito. Se eligen en la misma
     pantalla, se buscan igual, se marcan igual como jugados y una partida
     guardada los encuentra por el mismo `tema(id)`. Partirlos en dos habría
     duplicado esa pantalla entera para cambiar una palabra. Lo que los separa
     es un campo, y la lista se acota igual que se acota por mesa.

     Y LOS DE ANTES NO LO DICEN porque no había otra clase que ser: `tema` es
     el valor de respaldo en los dos lados —aquí y en el poblador—. */
  var claseDeLista = 'tema';    // 'tema' | 'premio'

  function esDeEstaClase(t) {
    return (t.clase || 'tema') === claseDeLista;
  }

  function propiosDeAhora() {
    return cargarTemas().propios.filter(function (t) {
      return esDeEstePublico(t) && esDeEstaClase(t);
    });
  }

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

  /** Un tema propio a la cuenta, sin esperar (0055). */
  function subirPropio(t) {
    var n = window.ATWI.nube;
    if (!n || !n.hay || !n.hay() || !n.guardarTemaPropio) return;
    n.guardarTemaPropio(t).catch(function () {});
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
    filtrarNombre: filtrarNombre,
    pulirCampoDeNombre: pulirCampoDeNombre,
    capitalizar: capitalizar,
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
      if (nombreCategoria === MIS_TEMAS) return propiosDeAhora().reverse();
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
        emoji: '✍️',
        /* DE QUÉ MESA SALIÓ. Se fija al CREARLO y no se toca al editarlo: un
           tema escrito para la pareja sigue siendo de la pareja aunque se
           corrija una coma estando en la otra lista. */
        publico: conQuien || 'pareja',
        /* Y DE QUÉ CLASE, por lo mismo: un premio escrito en QuiénGane no puede
           acabar en la lista de temas de Controversia porque se corrigiera
           desde allí. Va junto al público —se fijan los dos al nacer y ninguno
           se toca después— y no en el bloque de abajo, que es el que sí se
           reescribe en cada edición. */
        clase: claseDeLista
      }, {
        titulo: t.titulo,
        enunciado: t.enunciado,
        a: t.a,
        b: t.b,
        /* LA INTENSIDAD ES DE LOS TEMAS. Un premio no es ligero ni profundo, y
           con el valor de serie puesto salía un chip que decía «media» sin que
           eso significara nada. Los del catálogo traen ahí su familia
           —elige, libra, recibe—; los propios se quedan sin chip, que es más
           honesto que inventarles una. */
        intensidad: claseDeLista === 'premio' ? '' : (t.intensidad || 'media'),
        propio: true,
        editadoPor: quien,
        editado: new Date().toISOString()
      });
      if (!existente) lista.propios.push(tema);
      guardarTemas();
      /* Y A LA CUENTA (0055): el tema es de quien lo escribio, no del telefono.
         Se escribe sin esperar; si falla, la copia local sigue y la proxima
         sincronizacion lo vuelve a intentar. */
      subirPropio(tema);
      return tema;
    },

    borrarTemaPropio: function (id) {
      var lista = cargarTemas();
      lista.propios = lista.propios.filter(function (t) { return t.id !== id; });
      guardarTemas();
      var n = window.ATWI.nube;
      if (n && n.hay && n.hay() && n.borrarTemaPropio) n.borrarTemaPropio(id).catch(function () {});
    },

    /**
     * Los temas propios viven en la cuenta desde la 0055 (antes solo en
     * `localStorage`, o sea en el telefono). Al entrar se traen los del
     * servidor y MANDAN; los que solo estan aqui --escritos antes de hoy, o sin
     * red-- se suben una vez. Devuelve una promesa con cuantos cambiaron.
     */
    sincronizarPropios: function () {
      var n = window.ATWI.nube;
      if (!n || !n.hay || !n.hay() || !n.temasPropios) return Promise.resolve(0);
      return n.temasPropios().then(function (deLaCuenta) {
        if (!deLaCuenta) return 0;
        var lista = cargarTemas();
        var locales = lista.propios.slice();
        var porId = {};
        deLaCuenta.forEach(function (f) { porId[f.id] = f; });
        var cambios = 0;
        /* Lo del servidor, con la forma de siempre. */
        var nuevos = deLaCuenta.map(function (f) {
          var local = locales.filter(function (t) { return t.id === f.id; })[0];
          var t = Object.assign({}, local || { categoria: MIS_TEMAS, emoji: '✍️', propio: true }, {
            id: f.id, titulo: f.titulo, enunciado: f.enunciado,
            publico: f.publico || 'pareja', clase: f.clase || 'tema',
            intensidad: f.intensidad || '', propio: true, editado: f.editado
          });
          if (!local || local.titulo !== t.titulo || local.enunciado !== t.enunciado) cambios++;
          return t;
        });
        /* Lo que solo esta aqui: si NUNCA estuvo en la cuenta se sube y se
           queda; si ya estuvo (`enCuenta`) y ya no esta, lo borraron desde otro
           telefono y aqui tambien se va. Sin esa marca, un telefono viejo
           resucitaria cada tema borrado en el otro. */
        locales.forEach(function (t) {
          if (porId[t.id]) return;
          if (t.enCuenta) { cambios++; return; }
          nuevos.push(t);
          subirPropio(t);
        });
        nuevos.forEach(function (t) { t.enCuenta = true; });
        lista.propios = nuevos;
        guardarTemas();
        return cambios;
      }).catch(function () { return 0; });
    },

    cuantosPropios: function () { return propiosDeAhora().length; },

    /* Con quién se está jugando. Lo fija la pantalla del catálogo; con `null`
       no se filtra nada, que es lo que quiere el historial. */
    publicoDeJuego: function (x) {
      if (x !== undefined) conQuien = x || null;
      return conQuien;
    },

    /** Qué clase de ficha enseña la lista: los temas de debate o los premios. */
    claseDeJuego: function (x) {
      if (x !== undefined) claseDeLista = x === 'premio' ? 'premio' : 'tema';
      return claseDeLista;
    },

    /* --- Invitados locales --------------------------------------------------
       Fichas de quien juega enfrente en este teléfono sin tener cuenta. No son
       perfiles: no hay historial suyo, ni contadores, ni nada que les pertenezca.
       Es solo memoria de cortesía para no volver a preguntar el dibujo y el
       color cada vez que juega la misma persona. */
    invitados: function () { return cargarInvitados().slice(); },

    /* EL NOMBRE NO IDENTIFICA A UN INVITADO, y `recordarInvitado` ya lo decía:
       cuentan como el mismo quien repite NOMBRE Y PERSONAJE, así que puede haber
       dos Dianas con fichas distintas. Buscando solo por nombre se devuelve
       siempre la primera y la segunda es inalcanzable: tocar su atajo no hacía
       nada y los dos salían marcados a la vez.

       `avatar` es opcional porque al ESCRIBIR un nombre no se sabe cuál de las
       dos se quiere: ahí la primera es la mejor respuesta posible. Al tocar un
       atajo sí se sabe, y ahí se pasa. */
    invitado: function (nombre, avatar) {
      var lista = cargarInvitados();
      var primera = null;
      for (var i = 0; i < lista.length; i++) {
        if (!mismoNombre(lista[i].nombre, nombre)) continue;
        if (avatar && lista[i].avatar === avatar) return lista[i];
        if (!primera) primera = lista[i];
      }
      return avatar ? null : primera;
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
      /* UNO, Y SOLO UNO (decisión del titular, 2026-09-14). Fueron tres, luego
         dos, y al final ninguno hacía falta en pantalla: los atajos se quitaron.
         Lo que queda es la memoria, y para rellenar el campo con el de la última
         vez basta con el último. Guardar más sería guardar algo que ya no tiene
         dónde enseñarse. */
      invitados = [guardado];
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
        /* SE FILTRA AQUI Y NO EN `todos()`, a proposito: `todos()` es de donde
           sale `tema(id)`, y una partida guardada con un tema propio tiene que
           poder encontrarlo aunque ahora se este jugando con la otra mesa. Lo
           que se acota es la LISTA, no el archivo. */
        if (!esDeEstePublico(t)) return false;
        if (!esDeEstaClase(t)) return false;
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
    /* NO QUEDA NADA DEL JUEGO EN ESTE TELÉFONO, y se barre por PREFIJO en vez
       de por una lista de claves (titular, 2026-09-19).
       ⚠️ LA LISTA ESCRITA A MANO SE QUEDABA CORTA, que es el mismo fallo que
       este proyecto lleva anotado con los modos y con los iconos: nombraba el
       perfil, los temas, los invitados y el set del probador, y dejaba puestas
       `atwi-mesa`, `atwi-modo`, `atwi-donde`, la vuelta de los jueces y una
       `atwi.oidas.<partida>` por cada partida jugada. Ninguna es grave por sí
       sola; juntas son el rastro de quién usó este aparato y qué jugó.
       Con el prefijo, la clave que alguien añada mañana se va sola.
       LO LLAMA «SALIR», y solo él: es lo que significa dejar este teléfono. */
    olvidar: function () {
      try {
        var fuera = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('atwi') === 0) fuera.push(k);
        }
        for (var j = 0; j < fuera.length; j++) localStorage.removeItem(fuera[j]);
      } catch (e) {}
      perfil = null;
      listaTemas = null;
      invitados = null;
    }
  };
})();
