/* ATWI · los fondos elegidos en el tablero
   ==========================================================================
   Petición del titular (2026-09-23): «quiero poder seleccionar el background
   de cada interfaz y modal y tener el preview desde ahí mismo».

   CÓMO: cada fondo del CSS lee una variable propia con el dibujo de fábrica
   como valor por defecto —`var(--f-historial, url(../img/fondos/historial.webp))`—
   y aquí se ponen en la raíz las que el tablero cambió (tabla `fondos`, 0086).
   Sin filas, no se pone nada y todo se ve como siempre.

   SIN PARPADEO: lo último que se leyó se guarda en el teléfono y se aplica al
   cargar este archivo, antes de la primera pintada; la consulta a la base llega
   después y solo corrige si algo cambió.

   Y LA VISTA PREVIA: el tablero abre la app con `?previa=<espacio>&fondo=<archivo>`
   para enseñar una pantalla con un fondo que todavía no se ha guardado. Ese
   fondo manda solo en esa carga y no se guarda en ninguna parte.
   ========================================================================== */
(function () {
  'use strict';
  window.ATWI = window.ATWI || {};
  var cfg = window.ATWI.config || {};
  var CLAVE = 'atwi.fondos.v1';

  /* LOS ESPACIOS: dónde se ve cada fondo y cuál trae de fábrica. El tablero
     pinta su lista desde aquí, así que una pantalla nueva con fondo se añade
     en este sitio y en su regla de CSS, y en ninguno más. */
  var ESPACIOS = [
    { clave: 'inicio',                 grupo: 'Pantallas', nombre: 'Inicio',                    defecto: 'home.webp' },
    { clave: 'historial',              grupo: 'Pantallas', nombre: 'Historial',                 defecto: 'historial.webp' },
    { clave: 'buzon',                  grupo: 'Pantallas', nombre: 'Buzón de avisos',           defecto: 'notificaciones.webp' },
    { clave: 'puerta',                 grupo: 'Pantallas', nombre: 'Puerta de entrada',         defecto: 'home.webp' },
    { clave: 'invitacion',             grupo: 'Pantallas', nombre: 'Invitación enviada',        defecto: 'invitacion.webp' },
    { clave: 'catalogo-debate',        grupo: 'Controversia', nombre: 'Catálogo de temas',      defecto: 'debate.webp' },
    { clave: 'preparar-debate',        grupo: 'Controversia', nombre: 'Antes de empezar',       defecto: 'debate.webp' },
    { clave: 'sala-debate',            grupo: 'Controversia', nombre: 'Sala',                   defecto: 'sala-debate.webp' },
    { clave: 'revelacion-debate',      grupo: 'Controversia', nombre: 'Revelación',             defecto: 'sala-debate.webp' },
    { clave: 'catalogo-negociacion',   grupo: 'Pacto', nombre: 'Catálogo de temas',             defecto: 'negociacion.webp' },
    { clave: 'preparar-negociacion',   grupo: 'Pacto', nombre: 'Antes de empezar',              defecto: 'negociacion.webp' },
    { clave: 'sala-negociacion',       grupo: 'Pacto', nombre: 'Sala',                          defecto: 'sala-negociacion.webp' },
    { clave: 'revelacion-negociacion', grupo: 'Pacto', nombre: 'Revelación',                    defecto: 'sala-negociacion.webp' },
    { clave: 'catalogo-competencia',   grupo: 'QuiénGane', nombre: 'Catálogo de premios',       defecto: 'competencia.webp' },
    { clave: 'preparar-competencia',   grupo: 'QuiénGane', nombre: 'Antes de empezar',          defecto: 'competencia.webp' },
    { clave: 'sala-competencia',       grupo: 'QuiénGane', nombre: 'Sala',                      defecto: 'competencia.webp' },
    { clave: 'revelacion-competencia', grupo: 'QuiénGane', nombre: 'Revelación (reparto mixto)', defecto: 'competencia.webp' },
    { clave: 'juego-choque',           grupo: 'Minijuegos', nombre: 'Choque',                   defecto: 'game-choque.webp' },
    { clave: 'juego-cuenta',           grupo: 'Minijuegos', nombre: 'Cuenta',                   defecto: 'game-cuenta.webp' },
    { clave: 'juego-calco',            grupo: 'Minijuegos', nombre: 'Calco',                    defecto: 'game-calco.webp' },
    { clave: 'juego-canastas',         grupo: 'Minijuegos', nombre: 'Canastas',                 defecto: 'game-canastas.webp' }
  ];
  var CONOCIDOS = {};
  ESPACIOS.forEach(function (e) { CONOCIDOS[e.clave] = true; });

  /* Lo único que entra en un `url()`: el nombre de un WEBP de la carpeta de
     fondos. La base ya lo exige con un CHECK; esto es la segunda capa, porque
     lo guardado en el teléfono también se podría tocar. */
  function vale(espacio, archivo) {
    return CONOCIDOS[espacio] && /^[a-z0-9-]{1,60}\.webp$/.test(String(archivo || ''));
  }
  /* LOS SUBIDOS DESDE EL TABLERO viven en el cubo público `fondos` del almacén
     (0088) y se llaman `nube-…webp`; los demás, en la carpeta del sitio. */
  function urlDe(archivo) {
    if (/^nube-/.test(archivo) && cfg.supabaseUrl) {
      return cfg.supabaseUrl + '/storage/v1/object/public/fondos/' + archivo;
    }
    return new URL('../assets/img/fondos/' + archivo, location.href).href;
  }

  var puestos = {};
  function poner(espacio, archivo) {
    if (!vale(espacio, archivo)) return false;
    document.documentElement.style.setProperty('--f-' + espacio, 'url("' + urlDe(archivo) + '")');
    puestos[espacio] = archivo;
    return true;
  }
  function quitar(espacio) {
    document.documentElement.style.removeProperty('--f-' + espacio);
    delete puestos[espacio];
  }
  /** Deja puesto exactamente `mapa` ({espacio: archivo}); lo demás, de fábrica. */
  function aplicar(mapa) {
    Object.keys(puestos).forEach(function (e) { if (!mapa[e]) quitar(e); });
    Object.keys(mapa).forEach(function (e) { poner(e, mapa[e]); });
  }

  /* La vista previa del tablero: lo que venga en la dirección manda en esta
     carga y no se guarda. */
  var q = new URLSearchParams(location.search);
  var previa = q.get('previa');
  var fondoPrevio = q.get('fondo');
  function conPrevia(mapa) {
    var m = {};
    Object.keys(mapa).forEach(function (e) { m[e] = mapa[e]; });
    if (previa && fondoPrevio && vale(previa, fondoPrevio)) m[previa] = fondoPrevio;
    return m;
  }

  // 1 · Lo recordado, en el acto.
  var recordado = {};
  try { recordado = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { recordado = {}; }
  aplicar(conPrevia(recordado));

  // 2 · Lo de la base, cuando llegue. Sin sesión: la tabla la lee cualquiera.
  function leer() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnon || !window.fetch) return Promise.resolve(null);
    return fetch(cfg.supabaseUrl + '/rest/v1/fondos?select=espacio,archivo', {
      headers: { apikey: cfg.supabaseAnon, Authorization: 'Bearer ' + cfg.supabaseAnon }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (filas) {
        if (!Array.isArray(filas)) return null;
        var mapa = {};
        filas.forEach(function (f) { if (vale(f.espacio, f.archivo)) mapa[f.espacio] = f.archivo; });
        try { localStorage.setItem(CLAVE, JSON.stringify(mapa)); } catch (e) { /* sin sitio */ }
        aplicar(conPrevia(mapa));
        return mapa;
      })
      .catch(function () { return null; });
  }
  var listos = leer();

  window.ATWI.fondos = {
    ESPACIOS: ESPACIOS,
    poner: poner, quitar: quitar, aplicar: aplicar, vale: vale, leer: leer, urlDe: urlDe,
    listos: listos,
    /** El espacio que el tablero pidió enseñar, o nada. */
    previa: previa && CONOCIDOS[previa] ? previa : null
  };
})();
