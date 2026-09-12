/* ==========================================================================
   ATWI · auth.js
   Cuentas contra Supabase Auth, sin librerías. Son cuatro peticiones y no
   merece la pena arrastrar un paquete entero desde un CDN a un sitio público.

   QUÉ DATOS PEDIMOS: nombre y correo. Nada más. Ni edad, ni teléfono, ni
   ubicación, ni fecha de nacimiento. Cuando haya pagos, los datos de pago los
   pide y los guarda la pasarela (Stripe), nunca ATWI.

   CÓMO ENTRA LA GENTE: la primera vez, un enlace al correo. Al volver de ese
   enlace se elige contraseña y se queda dentro. Las siguientes veces, correo y
   contraseña, que es lo que el navegador guarda y rellena solo.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var CLAVE_SESION = 'atwi.sesion.v1';

  function url(camino) { return cfg.supabaseUrl + camino; }

  function cabeceras(conSesion) {
    var h = { 'Content-Type': 'application/json', 'apikey': cfg.supabaseAnon };
    var s = sesion();
    h['Authorization'] = 'Bearer ' + ((conSesion && s && s.access_token) || cfg.supabaseAnon);
    return h;
  }

  function pedir(camino, opciones) {
    return fetch(url(camino), opciones).then(function (r) {
      return r.text().then(function (texto) {
        var cuerpo = null;
        try { cuerpo = texto ? JSON.parse(texto) : null; } catch (e) { cuerpo = { mensaje: texto }; }
        if (!r.ok) {
          var e = new Error((cuerpo && (cuerpo.msg || cuerpo.error_description || cuerpo.message)) || ('Error ' + r.status));
          e.estado = r.status;
          e.cuerpo = cuerpo;
          throw e;
        }
        return cuerpo;
      });
    });
  }

  /* --- Sesión --------------------------------------------------------------
     Se guarda en localStorage. En Safari normal, ITP borra el almacenamiento
     tras siete días sin visitas, así que la sesión es una comodidad, no la
     fuente de verdad: la fuente de verdad siempre es el servidor. */
  var _sesion;

  function sesion() {
    if (_sesion !== undefined) return _sesion;
    try { _sesion = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); }
    catch (e) { _sesion = null; }
    return _sesion;
  }

  function guardarSesion(s) {
    _sesion = s;
    try {
      if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
      else localStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* modo incógnito */ }
  }

  function caducada() {
    var s = sesion();
    if (!s || !s.expires_at) return false;
    return (s.expires_at * 1000) < Date.now() + 60000;   // un minuto de margen
  }

  window.ATWI.auth = {
    hayServidor: function () { return Boolean(cfg.supabaseUrl && cfg.supabaseAnon); },

    sesion: sesion,

    /** ¿Hay alguien dentro? */
    dentro: function () { return Boolean(sesion() && sesion().access_token); },

    /**
     * REGISTRO, paso 1: manda al correo un enlace de acceso.
     * Al pulsarlo se vuelve aquí ya con sesión, y entonces se define la
     * contraseña. A partir de ahí se entra con correo y contraseña, que es lo
     * que el navegador sabe guardar y rellenar solo.
     *
     * @param correo       dirección de correo
     * @param captchaToken token de Turnstile, si está activado en el panel
     * @param vuelta       a dónde vuelve el enlace
     */
    mandarEnlace: function (correo, captchaToken, vuelta) {
      var cuerpo = { email: correo, create_user: true };
      if (vuelta) cuerpo.options = { email_redirect_to: vuelta };
      if (captchaToken) cuerpo.gotrue_meta_security = { captcha_token: captchaToken };
      return pedir('/auth/v1/otp?redirect_to=' + encodeURIComponent(vuelta || ''), {
        method: 'POST',
        headers: cabeceras(false),
        body: JSON.stringify(cuerpo)
      });
    },

    /**
     * REGISTRO, paso 2: el enlace del correo vuelve con la sesión colgada del
     * fragmento de la URL. Se recoge, se guarda y se limpia la barra de
     * direcciones, para que la sesión no se quede escrita donde cualquiera la
     * pueda copiar del historial.
     */
    recogerDelEnlace: function () {
      var h = (location.hash || '').replace(/^#/, '');
      if (!h) return null;
      var d = {};
      h.split('&').forEach(function (par) {
        var i = par.indexOf('=');
        if (i > 0) d[decodeURIComponent(par.slice(0, i))] = decodeURIComponent(par.slice(i + 1));
      });
      if (d.error_description) {
        history.replaceState(null, '', location.pathname + location.search);
        var e = new Error(d.error_description);
        e.esDelEnlace = true;
        throw e;
      }
      if (!d.access_token) return null;
      var s = {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        token_type: d.token_type,
        expires_in: Number(d.expires_in || 3600),
        expires_at: Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600),
        user: null
      };
      guardarSesion(s);
      history.replaceState(null, '', location.pathname + location.search);
      return s;
    },

    /** Quién es el dueño de la sesión actual. Hace falta tras el enlace. */
    quienSoy: function () {
      var s = sesion();
      if (!s) return Promise.resolve(null);
      return pedir('/auth/v1/user', { method: 'GET', headers: cabeceras(true) })
        .then(function (u) { s.user = u; guardarSesion(s); return u; });
    },

    /** REGISTRO, paso 3: define la contraseña y deja la sesión abierta. */
    ponerContrasena: function (clave) {
      return pedir('/auth/v1/user', {
        method: 'PUT',
        headers: cabeceras(true),
        body: JSON.stringify({ password: clave })
      });
    },

    /** Entradas siguientes: correo y contraseña, que el navegador ya rellena. */
    entrarConContrasena: function (correo, clave, captchaToken) {
      var cuerpo = { email: correo, password: clave };
      if (captchaToken) cuerpo.gotrue_meta_security = { captcha_token: captchaToken };
      return pedir('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: cabeceras(false),
        body: JSON.stringify(cuerpo)
      }).then(function (s) { guardarSesion(s); return s; });
    },

    /** Renueva la sesión si está a punto de caducar. */
    refrescar: function () {
      var s = sesion();
      if (!s || !s.refresh_token) return Promise.resolve(null);
      return pedir('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: cabeceras(false),
        body: JSON.stringify({ refresh_token: s.refresh_token })
      }).then(function (nueva) { guardarSesion(nueva); return nueva; })
        .catch(function () { guardarSesion(null); return null; });
    },

    /** Asegura que hay sesión válida antes de una llamada. */
    listo: function () {
      if (!sesion()) return Promise.resolve(null);
      if (!caducada()) return Promise.resolve(sesion());
      return this.refrescar();
    },

    /**
     * Asegura que sabemos QUIÉN es el dueño de la sesión. Al volver del enlace
     * del correo la sesión llega sin usuario, así que hay que preguntarlo antes
     * de tocar nada que lleve su id.
     */
    conUsuario: function () {
      var s = sesion();
      if (!s) return Promise.resolve(null);
      if (s.user && s.user.id) return Promise.resolve(s);
      return this.quienSoy().then(function () { return sesion(); });
    },

    /** Lee el perfil de quien está dentro; null si todavía no lo ha creado. */
    miPerfil: function () {
      return this.conUsuario().then(function (s) {
        if (!s || !s.user) return null;
        return pedir('/rest/v1/perfiles?select=*&id=eq.' + s.user.id, {
          method: 'GET', headers: cabeceras(true)
        }).then(function (filas) { return (filas && filas[0]) || null; });
      });
    },

    /** Crea el perfil la primera vez. Solo nombre y avatar. */
    crearPerfil: function (nombre, avatar) {
      return this.conUsuario().then(function (s) {
        if (!s || !s.user) throw new Error('Sin sesión');
        var h = cabeceras(true);
        h['Prefer'] = 'return=representation';
        return pedir('/rest/v1/perfiles', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ id: s.user.id, nombre: nombre, avatar: avatar || '🙂' })
        }).then(function (filas) { return (filas && filas[0]) || null; });
      });
    },

    /** Cambia el nombre o el avatar de quien está dentro. */
    guardarPerfil: function (cambios) {
      return this.conUsuario().then(function (s) {
        if (!s || !s.user) throw new Error('Sin sesión');
        var h = cabeceras(true);
        h['Prefer'] = 'return=representation';
        return pedir('/rest/v1/perfiles?id=eq.' + s.user.id, {
          method: 'PATCH',
          headers: h,
          body: JSON.stringify(cambios)
        }).then(function (filas) { return (filas && filas[0]) || null; });
      });
    },

    /** Los últimos avisos de mi buzón. */
    pedirBuzon: function () {
      return pedir('/rest/v1/avisos?select=*&order=creado.desc&limit=50', {
        method: 'GET', headers: cabeceras(true)
      });
    },

    /** Marcar como leídos. Es lo único que el navegador puede cambiar aquí. */
    marcarLeidos: function (ids) {
      if (!ids || !ids.length) return Promise.resolve();
      return pedir('/rest/v1/avisos?id=in.(' + ids.join(',') + ')', {
        method: 'PATCH',
        headers: cabeceras(true),
        body: JSON.stringify({ leido: new Date().toISOString() })
      });
    },

    correo: function () {
      var s = sesion();
      return (s && s.user && s.user.email) || '';
    },

    salir: function () {
      var s = sesion();
      guardarSesion(null);
      if (!s) return Promise.resolve();
      return fetch(url('/auth/v1/logout'), {
        method: 'POST',
        headers: { 'apikey': cfg.supabaseAnon, 'Authorization': 'Bearer ' + s.access_token }
      }).catch(function () { /* da igual: la sesión local ya no está */ });
    }
  };
})();
