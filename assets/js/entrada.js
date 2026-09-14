/* ==========================================================================
   ATWI · entrada.js
   La puerta. Registrarse una vez, y entrar siempre.

   REGISTRO, tres pasos:
     1. Nombre y correo            ->  se manda un enlace de acceso al correo
     2. Se pulsa el enlace         ->  se vuelve aquí ya con sesión abierta
     3. Se elige una contraseña    ->  y ya está dentro, sin volver a entrar

   ENTRADAS SIGUIENTES: correo y contraseña, que es lo que el navegador sabe
   guardar y rellenar solo. Nadie teclea códigos cada vez.

   NO pedimos nada más: ni edad, ni teléfono, ni ubicación, ni fecha de
   nacimiento. Cuando haya pagos, los datos de la tarjeta los pide y los guarda
   la pasarela; a ATWI no llegan nunca y no queremos que lleguen.

   Si no hay servidor configurado, la puerta deja pasar en MODO LOCAL con el
   nombre escrito, para poder trabajar el diseño sin backend.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var auth = window.ATWI.auth;
  var datos = window.ATWI.datos;
  var icono = window.ATWI.icono;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* El nombre se escribe antes de salir hacia el correo, así que se guarda para
     recuperarlo al volver. Si el enlace se abre en otro dispositivo no estará,
     y entonces se vuelve a pedir en el último paso. */
  var CLAVE_NOMBRE = 'atwi.nombre.pendiente';

  var estado = { paso: 'datos', nombre: '', correo: '', captcha: '', enviando: false };
  var alTerminar = null;

  /* --- Turnstile ------------------------------------------------------------ */
  function montarCaptcha() {
    if (!cfg.turnstileSiteKey) return;
    var hueco = $('#captcha');
    if (!hueco) return;
    if (!window.turnstile) {
      if (!document.getElementById('js-turnstile')) {
        var s = document.createElement('script');
        s.id = 'js-turnstile';
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true; s.defer = true;
        s.onload = montarCaptcha;
        document.head.appendChild(s);
      }
      return;
    }
    hueco.innerHTML = '';
    window.turnstile.render(hueco, {
      sitekey: cfg.turnstileSiteKey,
      language: 'es',
      theme: 'light',
      size: 'flexible',
      appearance: 'interaction-only',
      callback: function (t) { estado.captcha = t; },
      'expired-callback': function () { estado.captcha = ''; },
      'error-callback': function () { estado.captcha = ''; }
    });
  }

  function refrescarCaptcha() {
    estado.captcha = '';
    if (window.turnstile) montarCaptcha();
  }

  /* --- Piezas de pantalla ---------------------------------------------------- */
  function cabeza(emoji, titulo, bajada) {
    return '<div class="centrado" style="padding:var(--e-5) 0 var(--e-5)">' +
        (emoji === null
          ? '<img src="../assets/img/logotipo-96.png" alt="ATWI" width="210" height="70" ' +
            'style="margin:0 auto;height:58px;width:auto">'
          : '<div style="font-size:3.25rem;line-height:1">' + emoji + '</div>') +
        '<h1 style="margin-top:var(--e-3)">' + esc(titulo) + '</h1>' +
        '<p class="chico suave" style="margin-top:var(--e-2)">' + bajada + '</p>' +
      '</div>';
  }

  function campo(id, etiqueta, atributos, pista) {
    return '<label style="display:block">' +
        '<span class="chico" style="font-weight:700">' + esc(etiqueta) + '</span>' +
        '<input class="campo" id="' + id + '" ' + atributos + ' style="margin-top:6px">' +
        (pista ? '<span class="chico tenue" style="display:block;margin-top:6px">' + pista + '</span>' : '') +
      '</label>';
  }

  var AVISO_IA =
    '<div class="aviso-ia" style="margin-top:var(--e-5)">' + icono('aviso', 20) +
      '<span>' + cfg.descargo + cfg.gancho + '</span>' +
    '</div>';

  var ERROR = '<p class="chico" id="c-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>';

  /* --- Pintado --------------------------------------------------------------- */
  function pintar() {
    var caja = $('#puerta .modal__cuerpo');
    var boton = $('#puerta .modal__pie button');
    var p = estado.paso;

    if (p === 'datos') {
      caja.innerHTML =
        cabeza(null, 'Entra a jugar', 'Solo el nombre y el correo. Nada más.') +
        '<div class="apilado-5">' +
          /* UNA SOLA PALABRA Y 16 LETRAS. El nombre acaba en el rótulo que
             flota sobre la figura en la sala, y los dos rótulos van uno al
             lado del otro: con nombre y apellido se salen de la pantalla. La
             regla y el porqué están en datos.js. */
          campo('c-nombre', '¿Cómo te llamamos?',
                'type="text" autocomplete="given-name" maxlength="' + datos.NOMBRE_MAX + '" ' +
                'placeholder="Tu nombre" value="' + esc(estado.nombre) + '"',
                'Tu primer nombre o un apodo: una sola palabra.') +
          campo('c-correo', 'Tu correo',
                'type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.com" value="' + esc(estado.correo) + '"',
                'Te mandamos un enlace para entrar. La contraseña la eliges después.') +
          '<div class="captcha"><div id="captcha"></div></div>' +
          ERROR +
        '</div>' +
        '<button class="boton boton--fantasma boton--bloque" data-accion="ir-entrar" style="margin-top:var(--e-4)">' +
          'Ya tengo cuenta</button>' +
        AVISO_IA;
      montarCaptcha();
      avisarSiFaltaElCaptcha();
      enfocar('#c-nombre', !estado.nombre);
      boton.textContent = 'Mandarme el enlace';

    } else if (p === 'revisa') {
      caja.innerHTML =
        cabeza('📬', 'Mira tu correo',
               'Mandamos un enlace a <strong>' + esc(estado.correo) + '</strong>. Ábrelo en este mismo teléfono y entras solo.') +
        '<div class="tarjeta" style="background:var(--crema-hondo);box-shadow:none">' +
          '<p class="chico suave">¿No llega? Mira en el correo no deseado. El enlace caduca en una hora.</p>' +
        '</div>' +
        ERROR +
        '<button class="boton boton--fantasma boton--bloque" data-accion="otro-correo" style="margin-top:var(--e-4)">' +
          'Usar otro correo</button>';
      boton.textContent = 'Volver a mandarlo';

    } else if (p === 'contrasena') {
      caja.innerHTML =
        cabeza('🔑', 'Ya estás dentro',
               'Elige una contraseña para la próxima vez. El navegador te la va a guardar.') +
        '<div class="apilado-5">' +
          campo('c-nombre2', 'Tu nombre',
                'type="text" autocomplete="given-name" maxlength="' + datos.NOMBRE_MAX + '" ' +
                'placeholder="Tu nombre" value="' + esc(estado.nombre) + '"',
                'Tu primer nombre o un apodo: una sola palabra.') +
          campo('c-clave', 'Contraseña',
                'type="password" autocomplete="new-password" minlength="8" placeholder="Al menos 8 caracteres"',
                'Que puedas recordar. No hace falta que sea rara.') +
          ERROR +
        '</div>' + AVISO_IA;
      enfocar('#c-clave', true);
      boton.textContent = 'Guardar y jugar';

    } else if (p === 'entrar') {
      caja.innerHTML =
        cabeza(null, 'Hola otra vez', 'Correo y contraseña y listo.') +
        '<div class="apilado-5">' +
          campo('c-correo2', 'Tu correo',
                'type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.com" value="' + esc(estado.correo) + '"') +
          campo('c-clave2', 'Contraseña', 'type="password" autocomplete="current-password" placeholder="Tu contraseña"') +
          '<div class="captcha"><div id="captcha"></div></div>' +
          ERROR +
        '</div>' +
        '<button class="boton boton--fantasma boton--bloque" data-accion="ir-datos" style="margin-top:var(--e-4)">' +
          'Es mi primera vez</button>';
      montarCaptcha();
      avisarSiFaltaElCaptcha();
      enfocar('#c-correo2', !estado.correo);
      boton.textContent = 'Entrar';
    }
  }

  function enfocar(sel, si) {
    if (!si) return;
    setTimeout(function () { var e = $(sel); if (e) e.focus(); }, 60);
  }

  function error(texto) {
    var e = $('#c-error');
    if (e) e.textContent = texto || '';
  }

  function ocupado(si, textoQuieto) {
    estado.enviando = si;
    var b = $('#puerta .modal__pie button');
    if (b) { b.disabled = si; b.textContent = si ? 'Un momento…' : textoQuieto; }
  }

  function valeCorreo(c) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c); }

  function enLocalhost() {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  }

  /**
   * Qué salió mal, DE VERDAD.
   *
   * Supabase Auth contesta 400 a casi todo, y esto traducía cualquier 400 a
   * «correo o contraseña incorrectos». Es la peor mentira posible: manda a
   * cambiar la contraseña a quien la tenía bien. El caso real que lo destapó
   * fue `captcha_failed` en localhost, donde Turnstile ni siquiera dibuja el
   * widget porque la clave de sitio solo admite atwi.app.
   */
  function porQue(e) {
    var codigo = (e.cuerpo && e.cuerpo.error_code) || '';
    if (e.estado === 429 || codigo === 'over_request_rate_limit') {
      return 'Demasiados intentos seguidos. Espera unos minutos.';
    }
    if (codigo === 'captcha_failed') {
      return enLocalhost()
        ? 'No es tu contraseña: el antirrobots no dio token en localhost. ' +
          'Comprueba que «localhost» esté entre los dominios del widget ' +
          cfg.turnstileSiteKey + ' en Cloudflare, escrito sin http:// y sin puerto.'
        : 'No se pudo completar la verificación antirrobots. Recarga e inténtalo otra vez.';
    }
    if (codigo === 'invalid_credentials') return 'Correo o contraseña incorrectos.';
    if (codigo === 'email_not_confirmed') return 'Falta confirmar el correo. Mira tu bandeja.';
    if (codigo === 'user_not_found') return 'No hay ninguna cuenta con ese correo.';
    return e.message || 'No se pudo entrar.';
  }

  /**
   * Si el antirrobots no llega a dar token, se dice ANTES de que alguien teclee
   * su contraseña tres veces. Solo se avisa en local, que es donde pasa.
   *
   * Se mira el TOKEN y no el iframe: con `appearance: interaction-only` el
   * widget no dibuja nada cuando no hace falta desafío, así que la ausencia de
   * iframe no prueba nada. Lo que prueba que algo va mal es no tener token.
   */
  /* EL AVISO VA EN TODAS PARTES, NO SOLO EN LOCAL. Esta comprobación existía ya
     y llevaba `if (!enLocalhost()) return;`, escrita dando por hecho que un
     widget mal configurado solo podía pasar en desarrollo. Pasó en atwi.app: el
     dominio no estaba en la lista del widget, Turnstile se negó EN SILENCIO
     —sin iframe, sin token y sin `error-callback`— y la puerta se quedó muerta
     sin decir nada. La salvaguarda se callo justo donde hacía falta.

     Se mira el IFRAME y no el token: el token puede tardar en llegar por red
     lenta, pero si a los cuatro segundos no se dibujó ni el iframe es que
     Turnstile rechazó el dominio. Es la diferencia entre «va lento» y «no va». */
  function avisarSiFaltaElCaptcha() {
    if (!cfg.turnstileSiteKey) return;
    setTimeout(function () {
      if (estado.captcha) return;
      var hueco = $('#captcha');
      if (hueco && hueco.querySelector('iframe')) return;   // se dibujó: va lento, no roto

      /* A quien juega se le dice algo que pueda entender y hacer. El diagnóstico
         —qué dominio hay que dar de alta y en qué widget— va a la consola, que
         es donde lo busca quien puede arreglarlo. */
      if (window.console && console.warn) {
        console.warn('[ATWI] Turnstile no dibujó el widget en «' + location.hostname +
          '». Casi siempre es que ese dominio no está en la lista del widget ' +
          cfg.turnstileSiteKey + ' en Cloudflare. Con el captcha obligatorio en ' +
          'Supabase Auth, entrar va a fallar con captcha_failed.');
      }
      error(enLocalhost()
        ? 'Aviso de local: el antirrobots no dio token para «localhost», así que ' +
          'entrar va a fallar aquí. Revisa los dominios del widget ' +
          cfg.turnstileSiteKey + ' en Cloudflare.'
        : 'No pudimos cargar la verificación antirrobots. Probá a recargar la ' +
          'página; si sigue igual, puede ser tu red o un bloqueador.');
    }, 4000);
  }

  /* --- Acciones --------------------------------------------------------------- */
  function mandarEnlace() {
    var nombre = datos.limpiarNombre($('#c-nombre') ? $('#c-nombre').value : estado.nombre);
    var correo = ($('#c-correo') ? $('#c-correo').value : estado.correo || '').trim().toLowerCase();
    var malElNombre = datos.errorDeNombre(nombre);
    if (malElNombre) return error(malElNombre);
    if (!valeCorreo(correo)) return error('Ese correo no parece válido.');

    estado.nombre = nombre;
    estado.correo = correo;
    error('');
    try { localStorage.setItem(CLAVE_NOMBRE, nombre); } catch (e) {}

    if (!auth.hayServidor()) {          // modo local: sin backend no hay correo
      datos.actualizar({ nombre: nombre });
      return cerrar();
    }

    ocupado(true);
    /* La vuelta es esta misma pantalla. Tiene que estar dada de alta en el panel
       de Supabase, en Authentication -> URL Configuration -> Redirect URLs. */
    var vuelta = location.origin + location.pathname;
    auth.mandarEnlace(correo, estado.captcha, vuelta)
      .then(function () { estado.paso = 'revisa'; ocupado(false, 'Volver a mandarlo'); pintar(); })
      .catch(function (e) {
        ocupado(false, 'Mandarme el enlace');
        error(porQue(e));
        refrescarCaptcha();
      });
  }

  function guardarContrasena() {
    var nombre = datos.limpiarNombre($('#c-nombre2').value);
    var clave = $('#c-clave').value || '';
    var malElNombre = datos.errorDeNombre(nombre);
    if (malElNombre) return error(malElNombre);
    if (clave.length < 8) return error('La contraseña necesita al menos 8 caracteres.');
    error('');
    ocupado(true);

    auth.ponerContrasena(clave)
      .then(function () { return auth.miPerfil(); })
      .then(function (perfil) { return perfil || auth.crearPerfil(nombre, '🙂'); })
      .then(function (perfil) {
        datos.actualizar({ nombre: (perfil && perfil.nombre) || nombre });
        try { localStorage.removeItem(CLAVE_NOMBRE); } catch (e) {}
        ocupado(false, '');
        cerrar();
      })
      .catch(function (e) {
        ocupado(false, 'Guardar y jugar');
        error(e.message || 'No se pudo guardar.');
      });
  }

  function entrar() {
    var correo = ($('#c-correo2').value || '').trim().toLowerCase();
    var clave = $('#c-clave2').value || '';
    if (!valeCorreo(correo)) return error('Ese correo no parece válido.');
    if (!clave) return error('Escribe tu contraseña.');
    error('');
    ocupado(true);

    auth.entrarConContrasena(correo, clave, estado.captcha)
      .then(function () { return auth.miPerfil(); })
      .then(function (perfil) {
        datos.actualizar({ nombre: (perfil && perfil.nombre) || '' });
        ocupado(false, '');
        cerrar();
      })
      .catch(function (e) {
        ocupado(false, 'Entrar');
        error(porQue(e));
        refrescarCaptcha();
      });
  }

  function cerrar() {
    var p = $('#puerta');
    if (p) p.hidden = true;
    if (alTerminar) alTerminar();
  }

  /* --- Eventos ---------------------------------------------------------------- */
  document.addEventListener('click', function (ev) {
    var acc = ev.target.closest('#puerta [data-accion]');
    if (!acc || estado.enviando) return;
    var a = acc.dataset.accion;
    if (a === 'continuar') {
      if (estado.paso === 'datos' || estado.paso === 'revisa') mandarEnlace();
      else if (estado.paso === 'contrasena') guardarContrasena();
      else if (estado.paso === 'entrar') entrar();
    } else if (a === 'otro-correo' || a === 'ir-datos') {
      estado.paso = 'datos'; refrescarCaptcha(); pintar();
    } else if (a === 'ir-entrar') {
      estado.paso = 'entrar'; refrescarCaptcha(); pintar();
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var p = $('#puerta');
    if (!p || p.hidden || estado.enviando) return;
    if (ev.target.tagName === 'INPUT') ev.preventDefault();
    var b = $('#puerta .modal__pie button');
    if (b) b.click();
  });

  /* --- Arranque ---------------------------------------------------------------- */
  function modoPruebas() {
    var enLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    return enLocal && /[?&]local=1/.test(location.search);
  }

  window.ATWI.entrada = {
    /** Abre la puerta si hace falta. Llama a `hecho` cuando se puede jugar. */
    exigir: function (hecho) {
      alTerminar = hecho;
      var p = $('#puerta');

      if (modoPruebas()) {
        if (!datos.perfil().nombre) datos.actualizar({ nombre: 'Prueba' });
        p.hidden = true;
        return hecho();
      }

      if (!auth.hayServidor()) {
        if (datos.perfil().nombre) { p.hidden = true; return hecho(); }
        p.hidden = false; estado.paso = 'datos'; pintar(); return;
      }

      /* ¿Venimos de pulsar el enlace del correo? */
      var recogida = null;
      var fallo = null;
      try { recogida = auth.recogerDelEnlace(); }
      catch (e) { fallo = e.message; }

      if (recogida) {
        try { estado.nombre = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch (e) {}
        p.hidden = false;
        estado.paso = 'contrasena';
        pintar();
        /* El correo llega dentro del usuario, no del fragmento. */
        auth.quienSoy().then(function (u) { if (u) estado.correo = u.email || ''; });
        return;
      }

      auth.listo().then(function (s) {
        if (s) {
          p.hidden = true;
          hecho();
          /* El perfil vive en el servidor y el aparato solo lo copia. Si la
             copia local se perdió —otro teléfono, datos borrados, incógnito—
             había que volver a registrarse para que el nombre reapareciera.
             Se trae del servidor y se repinta. */
          auth.miPerfil().then(function (perfil) {
            if (!perfil) return;
            var local = datos.perfil();
            if (local.nombre === perfil.nombre && local.avatar === (perfil.avatar || local.avatar)) return;
            datos.actualizar({ nombre: perfil.nombre || '', avatar: perfil.avatar || local.avatar });
            if (window.ATWI.repintar) window.ATWI.repintar();
          }).catch(function () { /* sin red se juega con lo que haya en local */ });
          return;
        }
        p.hidden = false;
        estado.paso = 'datos';
        pintar();
        if (fallo) {
          error(/invalid or has expired/i.test(fallo)
            ? 'El enlace caducó. Pide otro y ábrelo antes de una hora.'
            : fallo);
        }
      });
    }
  };
})();
