/* ==========================================================================
   ATWI · auth.js
   Cuentas contra Supabase Auth, sin librerías. Son cuatro peticiones y no
   merece la pena arrastrar un paquete entero desde un CDN a un sitio público.

   QUÉ DATOS PEDIMOS: nombre y correo. Nada más. Ni edad, ni teléfono, ni
   ubicación, ni fecha de nacimiento. Cuando haya pagos, los datos de pago los
   pide y los guarda la pasarela (Stripe), nunca ATWI.

   CÓMO ENTRA LA GENTE: código de seis dígitos al correo. Sin contraseña, que
   es una cosa menos que olvidar y una cosa menos que se nos pueda filtrar.
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
     * Paso 1: pide el código de seis dígitos.
     * @param correo      dirección de correo
     * @param captchaToken token de Turnstile, si está activado en el panel
     */
    pedirCodigo: function (correo, captchaToken) {
      var cuerpo = { email: correo, create_user: true };
      if (captchaToken) cuerpo.gotrue_meta_security = { captcha_token: captchaToken };
      return pedir('/auth/v1/otp', {
        method: 'POST',
        headers: cabeceras(false),
        body: JSON.stringify(cuerpo)
      });
    },

    /** Paso 2: canjea el código por una sesión. */
    verificarCodigo: function (correo, codigo) {
      return pedir('/auth/v1/verify', {
        method: 'POST',
        headers: cabeceras(false),
        body: JSON.stringify({ email: correo, token: codigo, type: 'email' })
      }).then(function (s) {
        guardarSesion(s);
        return s;
      });
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

    /** Lee el perfil de quien está dentro; null si todavía no lo ha creado. */
    miPerfil: function () {
      var s = sesion();
      if (!s) return Promise.resolve(null);
      return pedir('/rest/v1/perfiles?select=*&id=eq.' + s.user.id, {
        method: 'GET', headers: cabeceras(true)
      }).then(function (filas) { return (filas && filas[0]) || null; });
    },

    /** Crea el perfil la primera vez. Solo nombre y avatar. */
    crearPerfil: function (nombre, avatar) {
      var s = sesion();
      if (!s) return Promise.reject(new Error('Sin sesión'));
      var h = cabeceras(true);
      h['Prefer'] = 'return=representation';
      return pedir('/rest/v1/perfiles', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ id: s.user.id, nombre: nombre, avatar: avatar || '🙂' })
      }).then(function (filas) { return (filas && filas[0]) || null; });
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
