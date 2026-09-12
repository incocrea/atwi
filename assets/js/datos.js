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

  /* --- Estado de la persona ------------------------------------------------
     Contadores SEPARADOS y sin marcador comparativo entre los dos miembros de
     la pareja: es una decisión de diseño con evidencia detrás, no un descuido.
     Ver docs/02-modos-y-catalogo.md §11. */
  var PERFIL_NUEVO = {
    nombre: '',
    avatar: '🙂',
    nivel: 1,
    puntos: 0,
    puntosNivel: 100,
    juicios: 0,          // partidas jugadas en modo Juicio
    pactos: 0,           // actas registradas en modo Pacto
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
    return perfil;
  }

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(perfil)); } catch (e) { /* modo incógnito */ }
  }

  /* --- Catálogo ------------------------------------------------------------ */
  var catalogo = null;

  function pedirCatalogo() {
    if (catalogo) return Promise.resolve(catalogo);
    return fetch('../assets/datos/catalogo.json')
      .then(function (r) {
        if (!r.ok) throw new Error('No se pudo cargar el catálogo');
        return r.json();
      })
      .then(function (d) { catalogo = d; return d; });
  }

  window.ATWI.datos = {
    /** ¿Estamos hablando con un servidor o todo es local? */
    enLinea: function () { return Boolean(cfg.supabaseUrl && cfg.supabaseAnon); },

    perfil: cargar,

    actualizar: function (cambios) {
      Object.assign(cargar(), cambios);
      guardar();
      return perfil;
    },

    catalogo: pedirCatalogo,

    /** Temas de una categoría, con los del recorrido inicial primero. */
    temasDe: function (nombreCategoria) {
      if (!catalogo) return [];
      return catalogo.temas
        .filter(function (t) { return t.categoria === nombreCategoria; })
        .sort(function (a, b) { return (a.inicial || 99) - (b.inicial || 99); });
    },

    /** Los doce temas con los que arranca una pareja nueva, en orden. */
    recorridoInicial: function () {
      if (!catalogo) return [];
      return catalogo.temas
        .filter(function (t) { return t.inicial; })
        .sort(function (a, b) { return a.inicial - b.inicial; });
    },

    /** El siguiente tema sugerido: el primero del recorrido sin jugar. */
    siguienteSugerido: function () {
      var jugados = cargar().temasJugados;
      var pendientes = this.recorridoInicial().filter(function (t) {
        return jugados.indexOf(t.id) === -1;
      });
      return pendientes[0] || null;
    },

    tema: function (id) {
      if (!catalogo) return null;
      for (var i = 0; i < catalogo.temas.length; i++) {
        if (catalogo.temas[i].id === id) return catalogo.temas[i];
      }
      return null;
    },

    /** Borra todo lo local. Solo lo llama el botón de ajustes. */
    olvidar: function () {
      try { localStorage.removeItem(CLAVE); } catch (e) {}
      perfil = null;
    }
  };
})();
