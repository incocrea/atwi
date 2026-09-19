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
    programarRefresco();
  }

  function caducada() {
    var s = sesion();
    if (!s || !s.expires_at) return false;
    return (s.expires_at * 1000) < Date.now() + 60000;   // un minuto de margen
  }

  /* --- LA SESIÓN SE MANTIENE VIVA SOLA --------------------------------------
     Pregunta del titular (2026-09-18): *«¿este token no se puede mantener vivo
     una vez el usuario se autentica, para no tener que estarlo reviviendo?»*.

     EL ACCESS TOKEN NO PUEDE SER ETERNO, y tampoco conviene: es un `bearer`, o
     sea que quien lo tenga ES la persona mientras dure, y un JWT no se puede
     revocar —solo caducar—. Por eso Supabase lo da para una hora. Subir ese
     plazo en el panel es posible y es la palanca equivocada: alarga justo la
     ventana en la que un token robado sigue valiendo.

     LO QUE SÍ ES DURADERO ES LA SESIÓN. El refresh token no caduca por tiempo,
     así que con él se pide un access token nuevo tantas veces como haga falta:
     la persona no vuelve a escribir la contraseña nunca. Lo que faltaba aquí no
     era hacer el token eterno, era **renovarlo antes de que nadie lo note** —lo
     que `supabase-js` hace con `autoRefreshToken`, y este proyecto no usa la
     librería (cuatro peticiones no valen un paquete de un CDN)—.

     TRES RELOJES, PORQUE UNO SOLO NO BASTA:
     · el temporizador renueva CINCO MINUTOS ANTES de caducar;
     · al volver a primer plano, porque un móvil con la pantalla apagada congela
       los `setTimeout` y el plazo puede haber pasado dormido;
     · y al recuperar la red, que es cuando el refresco que falló puede salir.
     La cuarta red ya estaba: `listo()` antes de consultar.

     ⚠️ Y UN SOLO REFRESCO EN VUELO. Supabase ROTA el refresh token en cada uso,
     así que dos refrescos a la vez hacen que el segundo llegue con uno ya
     gastado: 400 y sesión cerrada. Con `enVuelo` los que coincidan esperan al
     mismo. Entre PESTAÑAS distintas eso no se puede compartir, así que si una
     falla se relee el almacenamiento antes de darse por perdida: puede que la
     otra acabe de guardar una sesión nueva. */
  var ANTES_DE_CADUCAR = 5 * 60 * 1000;
  var temporizador = null;
  var enVuelo = null;
  /* ⚠️ UN REFRESH TOKEN QUE FALLÓ NO SE VUELVE A INTENTAR CADA SEGUNDO
     (2026-09-19). El log de Auth enseñó 151 refrescos con 400 y 62 con 429
     --rate limit-- en cuatro minutos, uno por segundo: un aparato con el refresh
     token MUERTO --«Salir» en otro aparato cerraba TODAS las sesiones de la
     cuenta-- entraba en la ventana entre cinco y un minutos antes de caducar, el
     refresco fallaba, se releía el almacenamiento, la sesión seguía «viva» por su
     access token y `programarRefresco` la volvía a citar en `max(1000, …)` = un
     segundo. Y el 429 de Supabase es POR IP: mientras eso corre, a quien intente
     entrar desde la misma red también le falla.
     Ahora el refresh token que ya falló se recuerda y no se vuelve a mandar: la
     sesión sigue valiendo hasta que su access token caduque, y ahí se cierra. Un
     429 se espera un minuto entero antes de volver a preguntar. */
  var refreshMuerto = '';
  var esperaTrasRateLimit = 60 * 1000;

  /** @param minimo cuánto esperar como poco; tras un fallo de red son 15 s, para
   *  que un refresco que no sale no se convierta en uno por segundo. */
  function programarRefresco(minimo) {
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    var s = sesion();
    if (!s || !s.refresh_token || !s.expires_at) return;
    if (s.refresh_token === refreshMuerto) {
      /* No hay con qué renovar: se cita para cuando venza, a cerrarla. */
      var vence = Math.max(1000, (s.expires_at * 1000) - Date.now());
      temporizador = setTimeout(function () { if (caducada()) guardarSesion(null); }, vence);
      return;
    }
    /* Nunca menos de un segundo: si ya está vencido, se renueva enseguida pero
       sin bloquear el hilo con un cero. */
    var falta = Math.max(minimo || 1000, (s.expires_at * 1000) - Date.now() - ANTES_DE_CADUCAR);
    temporizador = setTimeout(function () { refrescarYa(); }, falta);
  }

  function refrescarYa() {
    if (enVuelo) return enVuelo;
    var s = sesion();
    if (!s || !s.refresh_token) return Promise.resolve(null);
    if (s.refresh_token === refreshMuerto) {
      /* Ya se sabe que no sirve. Mientras el access token viva, se sigue con
         él; cuando no, se cierra y quien llame verá que no hay sesión. */
      if (caducada()) guardarSesion(null);
      return Promise.resolve(sesion());
    }
    var usado = s.refresh_token;
    enVuelo = pedir('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: cabeceras(false),
      body: JSON.stringify({ refresh_token: usado })
    }).then(function (nueva) {
      enVuelo = null;
      guardarSesion(nueva);
      return nueva;
    }).catch(function (e) {
      enVuelo = null;
      /* ANTES DE DARLA POR PERDIDA, MIRAR SI OTRA PESTAÑA LA RENOVÓ. Con la
         rotación, la pestaña que llega segunda recibe un 400 con un refresh
         token que ya sirvió; borrar la sesión ahí dejaría fuera a alguien que
         está dentro en la pestaña de al lado. */
      _sesion = undefined;
      var otra = sesion();
      if (otra && otra.refresh_token && otra.refresh_token !== usado) {
        /* Otra pestaña la renovó: ésa es la buena. */
        programarRefresco();
        return otra;
      }
      if (e && e.estado === 429) {
        /* Rate limit: no es que el token esté muerto, es que se preguntó de
           más. Se espera un minuto y se vuelve a citar. */
        if (temporizador) { clearTimeout(temporizador); }
        temporizador = setTimeout(function () { refrescarYa(); }, esperaTrasRateLimit);
        return otra;
      }
      if (e && (e.estado === 400 || e.estado === 401 || e.estado === 403)) {
        /* El servidor dijo que ese refresh token no vale: no se manda más. */
        refreshMuerto = usado;
      }
      if (otra && otra.access_token && !caducada()) { programarRefresco(15000); return otra; }
      guardarSesion(null);
      return null;
    });
    return enVuelo;
  }

  /* Y SI OTRA PESTAÑA GUARDA UNA SESIÓN, ÉSTA SE ENTERA. `storage` solo salta
     en las OTRAS pestañas, que es exactamente lo que hace falta: la que
     escribió ya la tiene en memoria. */
  window.addEventListener('storage', function (ev) {
    if (ev.key !== CLAVE_SESION) return;
    _sesion = undefined;
    programarRefresco();
  });

  /* Al volver a mirar la app y al recuperar la red. `caducada()` lleva su
     propio margen de un minuto, así que esto no pide refrescos de más. */
  function refrescarSiHaceFalta() {
    if (sesion() && caducada()) refrescarYa();
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refrescarSiHaceFalta();
  });
  window.addEventListener('online', refrescarSiHaceFalta);

  /* El primer reloj se pone al cargar el archivo, con la sesión que haya
     guardada de la visita anterior: sin esto, quien abre la app con el token a
     punto de vencer no tendría programado nada hasta la primera llamada. */
  programarRefresco();

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

    /** Renueva la sesión ahora. Pasa por el mismo carril que el temporizador,
     *  así que dos peticiones a la vez esperan al mismo refresco. */
    refrescar: function () { return refrescarYa(); },

    /** Asegura que hay sesión válida antes de una llamada. Con el refresco
     *  programado esto casi nunca tiene trabajo: es la red de abajo, para el
     *  caso en que el temporizador no llegara a correr. */
    listo: function () {
      if (!sesion()) return Promise.resolve(null);
      if (!caducada()) return Promise.resolve(sesion());
      return refrescarYa();
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
    /* EL APODO ES ÚNICO (migración 0053). Se pregunta ANTES de guardar --al
       registrarse todavía no hay sesión, por eso `apodo_libre` admite anon-- y
       el índice de la base es la red si dos lo piden a la vez. */
    apodoLibre: function (apodo) {
      return pedir('/rest/v1/rpc/apodo_libre', {
        method: 'POST',
        headers: cabeceras(Boolean(sesion() && sesion().access_token)),
        body: JSON.stringify({ p_apodo: apodo })
      }).then(function (r) { return r === true; })
        .catch(function () { return true; });   // sin red no se bloquea aquí: la base decide al guardar
    },
    /* LA ACEPTACION DE LOS TERMINOS, Y NO SE TRAGA EL FALLO (migración 0063).
       `apodoLibre` de aquí arriba devuelve `true` cuando no hay red —bloquear
       por una consulta que no llegó sería peor, y la base decide igualmente al
       guardar—; esto es lo contrario: si la constancia no se pudo escribir, no
       se ha aceptado nada y quien llama tiene que enterarse. */
    aceptarTerminos: function (version) {
      return pedir('/rest/v1/rpc/aceptar_terminos', {
        method: 'POST',
        headers: cabeceras(true),
        body: JSON.stringify({ p_version: String(version) })
      });
    },

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

    /* SALIR ES SALIR DE ESTE APARATO (2026-09-19). Sin `scope`, Supabase cierra
       TODAS las sesiones de la cuenta --el teléfono, la otra pestaña, el
       tablero--, y el juego en línea se juega justamente desde dos aparatos:
       cerrar sesión en la PC dejaba al teléfono con un refresh token muerto
       intentando renovarlo (ver arriba). `scope=local` cierra solo la sesión de
       este refresh token; las demás siguen. */
    salir: function () {
      var s = sesion();
      guardarSesion(null);
      refreshMuerto = '';
      if (!s) return Promise.resolve();
      return fetch(url('/auth/v1/logout?scope=local'), {
        method: 'POST',
        headers: { 'apikey': cfg.supabaseAnon, 'Authorization': 'Bearer ' + s.access_token }
      }).catch(function () { /* da igual: la sesión local ya no está */ });
    }
  };
})();
