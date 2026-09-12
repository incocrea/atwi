/* ==========================================================================
   ATWI · entrada.js
   La puerta: registro y entrada. Dos pasos y nada más.

     1. Nombre y correo  ->  te mandamos un código de seis dígitos
     2. Código           ->  dentro

   NO pedimos contraseña, ni edad, ni teléfono, ni ubicación, ni fecha de
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

  var estado = { paso: 'datos', nombre: '', correo: '', captcha: '', enviando: false };
  var alTerminar = null;

  /* --- Turnstile ------------------------------------------------------------
     Solo se carga si hay site key. El widget devuelve un token que Supabase
     valida contra la secret key, que vive en el panel del proyecto y no aquí. */
  function montarCaptcha() {
    if (!cfg.turnstileSiteKey) return;
    var hueco = $('#captcha');
    if (!hueco) return;
    if (!window.turnstile) {
      if (!document.getElementById('js-turnstile')) {
        var s = document.createElement('script');
        s.id = 'js-turnstile';
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.defer = true;
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
      /* La caja gris de Cloudflare no aparece salvo que de verdad haga falta
         resolver algo. Para casi todo el mundo el token se genera en silencio y
         la pantalla se queda limpia, que es lo que pide una pantalla de entrada
         de un juego. Si el visitante parece un robot, entonces sí se dibuja. */
      appearance: 'interaction-only',
      callback: function (t) { estado.captcha = t; },
      'expired-callback': function () { estado.captcha = ''; },
      'error-callback': function () { estado.captcha = ''; }
    });
  }

  /* --- Pintado -------------------------------------------------------------- */
  function pintar() {
    var caja = $('#puerta .modal__cuerpo');
    if (estado.paso === 'datos') {
      caja.innerHTML =
        '<div class="centrado" style="padding:var(--e-5) 0 var(--e-6)">' +
          '<img src="../assets/img/logotipo-96.png" alt="ATWI" width="190" height="58" style="margin:0 auto;height:58px;width:auto">' +
          '<h1 style="margin-top:var(--e-3)">Entra a jugar</h1>' +
          '<p class="chico suave" style="margin-top:var(--e-2)">' +
            'Solo el nombre y el correo. Nada más.</p>' +
        '</div>' +
        '<div class="apilado-5">' +
          '<label style="display:block">' +
            '<span class="chico" style="font-weight:700">¿Cómo te llamamos?</span>' +
            '<input class="campo" id="c-nombre" type="text" autocomplete="given-name" ' +
              'maxlength="40" placeholder="Tu nombre" value="' + esc(estado.nombre) + '" style="margin-top:6px">' +
          '</label>' +
          '<label style="display:block">' +
            '<span class="chico" style="font-weight:700">Tu correo</span>' +
            '<input class="campo" id="c-correo" type="email" autocomplete="email" inputmode="email" ' +
              'placeholder="tu@correo.com" value="' + esc(estado.correo) + '" style="margin-top:6px">' +
            '<span class="chico tenue" style="display:block;margin-top:6px">' +
              'Te mandamos un código de seis dígitos. No hay contraseña que recordar.</span>' +
          '</label>' +
          '<div class="captcha"><div id="captcha"></div></div>' +
          '<p class="chico tenue" id="c-error" style="color:var(--peligro)"></p>' +
        '</div>' +
        '<div class="aviso-ia" style="margin-top:var(--e-5)">' + icono('aviso', 20) +
          '<span>ATWI es un juego y los resultados los genera una inteligencia artificial. ' +
          'No es terapia ni asesoramiento profesional.</span>' +
        '</div>';
      montarCaptcha();
      setTimeout(function () { var n = $('#c-nombre'); if (n && !estado.nombre) n.focus(); }, 60);
    } else {
      caja.innerHTML =
        '<div class="centrado" style="padding:var(--e-5) 0 var(--e-6)">' +
          '<div style="font-size:3.5rem;line-height:1">📬</div>' +
          '<h1 style="margin-top:var(--e-3)">Mira tu correo</h1>' +
          '<p class="chico suave" style="margin-top:var(--e-2)">' +
            'Mandamos un código de seis dígitos a <strong>' + esc(estado.correo) + '</strong>.</p>' +
        '</div>' +
        '<label style="display:block">' +
          '<span class="chico" style="font-weight:700">El código</span>' +
          '<input class="campo" id="c-codigo" type="text" inputmode="numeric" autocomplete="one-time-code" ' +
            'maxlength="6" placeholder="000000" style="margin-top:6px;letter-spacing:.4em;text-align:center;' +
            'font-family:var(--display);font-size:1.5rem;font-weight:800">' +
        '</label>' +
        '<p class="chico tenue" id="c-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>' +
        '<button class="boton boton--fantasma boton--bloque" data-accion="otro-correo" style="margin-top:var(--e-4)">' +
          'Usar otro correo</button>';
      setTimeout(function () { var c = $('#c-codigo'); if (c) c.focus(); }, 60);
    }
    $('#puerta .modal__pie button').textContent =
      estado.paso === 'datos' ? 'Mandarme el código' : 'Entrar';
  }

  function error(texto) {
    var e = $('#c-error');
    if (e) e.textContent = texto || '';
  }

  function ocupado(si) {
    estado.enviando = si;
    var b = $('#puerta .modal__pie button');
    if (b) { b.disabled = si; b.textContent = si ? 'Un momento…' : (estado.paso === 'datos' ? 'Mandarme el código' : 'Entrar'); }
  }

  /* --- Pasos ---------------------------------------------------------------- */
  function mandarCodigo() {
    var nombre = ($('#c-nombre').value || '').trim();
    var correo = ($('#c-correo').value || '').trim().toLowerCase();
    if (nombre.length < 2) return error('Escribe tu nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return error('Ese correo no parece válido.');
    if (cfg.turnstileSiteKey && !estado.captcha) return error('Marca la casilla de seguridad de aquí arriba.');

    estado.nombre = nombre;
    estado.correo = correo;
    error('');

    /* Sin servidor: modo local, se entra con el nombre y ya. */
    if (!auth.hayServidor()) {
      datos.actualizar({ nombre: nombre });
      return cerrar();
    }

    ocupado(true);
    auth.pedirCodigo(correo, estado.captcha)
      .then(function () { estado.paso = 'codigo'; ocupado(false); pintar(); })
      .catch(function (e) {
        ocupado(false);
        if (e.estado === 429) error('Demasiados intentos. Espera unos minutos y vuelve a probar.');
        else error(e.message || 'No se pudo mandar el código.');
        if (window.turnstile) { estado.captcha = ''; montarCaptcha(); }
      });
  }

  function entrar() {
    var codigo = ($('#c-codigo').value || '').replace(/\D/g, '');
    if (codigo.length !== 6) return error('El código son seis dígitos.');
    error('');
    ocupado(true);
    auth.verificarCodigo(estado.correo, codigo)
      .then(function () { return auth.miPerfil(); })
      .then(function (perfil) {
        if (perfil) return perfil;
        return auth.crearPerfil(estado.nombre, '🙂');
      })
      .then(function (perfil) {
        datos.actualizar({ nombre: (perfil && perfil.nombre) || estado.nombre });
        ocupado(false);
        cerrar();
      })
      .catch(function (e) {
        ocupado(false);
        error(e.estado === 403 || e.estado === 401 ? 'Código incorrecto o caducado.' : (e.message || 'No se pudo entrar.'));
      });
  }

  function cerrar() {
    var p = $('#puerta');
    if (p) p.hidden = true;
    if (alTerminar) alTerminar();
  }

  /* --- Eventos --------------------------------------------------------------- */
  document.addEventListener('click', function (ev) {
    var acc = ev.target.closest('#puerta [data-accion]');
    if (!acc) return;
    if (estado.enviando) return;
    if (acc.dataset.accion === 'continuar') {
      if (estado.paso === 'datos') mandarCodigo(); else entrar();
    } else if (acc.dataset.accion === 'otro-correo') {
      estado.paso = 'datos'; estado.captcha = ''; pintar();
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var p = $('#puerta');
    if (!p || p.hidden || estado.enviando) return;
    if (ev.target.tagName === 'INPUT') { ev.preventDefault(); }
    if (estado.paso === 'datos') mandarCodigo(); else entrar();
  });

  /* Salida de desarrollo: con ?local=1 se salta la puerta y se entra con un
     nombre de prueba, para poder revisar el diseño de las pantallas sin gastar
     un correo en cada recarga. SOLO funciona en localhost: en el sitio
     publicado esta condición es falsa y la puerta se comporta normal. */
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
        /* Modo local: con que haya nombre guardado basta. */
        if (datos.perfil().nombre) { p.hidden = true; return hecho(); }
        p.hidden = false; pintar(); return;
      }
      auth.listo().then(function (s) {
        if (s) { p.hidden = true; return hecho(); }
        p.hidden = false; pintar();
      });
    }
  };
})();
