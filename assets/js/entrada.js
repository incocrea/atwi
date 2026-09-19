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
  var iconoSVG = window.ATWI.iconoSVG;   // a la fuerza el de línea

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var estado = { paso: 'entrar', nombre: '', correo: '', captcha: '',
                 /* Lo último que dijo Turnstile cuando no dio token. Vacío
                    mientras todo va bien. */
                 captchaFallo: '', enviando: false };
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
      /* `always` Y NO `interaction-only` (2026-09-15). En `interaction-only` el
         widget no dibuja nada mientras Cloudflare no exija resolver un reto, y
         eso se ve precioso... en escritorio, donde casi nunca lo exige. En un
         teléfono lo exige MUCHO más --es táctil, la señal es peor, la IP es de
         móvil-- y entonces hay una casilla que hay que tocar. Si esa casilla
         tarda en aparecer, o aparece donde no se mira, la persona se queda
         mirando una pantalla que le dice que no puede entrar y no tiene nada
         que tocar.
         Eso es exactamente lo que el titular vivió: en su PC entra y en su
         móvil no, sin ningún código de error --porque no hubo error: el reto
         estaba esperando un toque que nadie sabía que había que dar--.
         Con `always` la casilla está siempre, se ve y se toca. Cuesta un hueco
         en la pantalla de entrar y vale lo que vale poder entrar. */
      appearance: 'always',
      /* EL TOKEN SE RENUEVA SOLO. Turnstile lo caduca a los cinco minutos, y
         quien abre la app, escribe su correo, busca la contraseña y vuelve
         tarda perfectamente eso. Sin esto el token muere en silencio, se manda
         vacío y Supabase contesta `captcha_failed`: es el «falló la primera y a
         la segunda entré» que reportó el titular el 2026-09-15. */
      'refresh-expired': 'auto',
      callback: function (t) { estado.captcha = t; estado.captchaFallo = ''; },
      /* Y SI AUN ASI CADUCA, SE PIDE OTRO SIN QUE NADIE HAGA NADA. Antes esto
         solo vaciaba el token y se quedaba esperando a que la persona fallara
         para renovarlo. */
      'expired-callback': function () { estado.captcha = ''; reintentarCaptcha(); },
      /* EL CODIGO DE ERROR SE GUARDA, QUE ES TODO EL DIAGNOSTICO. Esto era
         `function () { estado.captcha = ''; }`: Turnstile pasa un codigo y la
         app lo tiraba, asi que cuando el 2026-09-15 dejo de dejar entrar a nadie
         no habia forma de saber por que. Los que importan:
           110200  el dominio no esta en la lista del widget
           110100 / 110110  clave de sitio invalida o desconocida
           300xxx / 600xxx  el reto fallo o la interaccion fallo
           400xxx  problema del navegador --extension, reloj en hora falsa--
         Sin el numero, todo esto se parece a «no funciona». */
      'error-callback': function (codigo) {
        estado.captcha = '';
        estado.captchaFallo = String(codigo || 'sin codigo');
        if (window.console) console.warn('[ATWI] Turnstile error-callback: ' + estado.captchaFallo);
        pintarFalloCaptcha();
        reintentarCaptcha();
      },
      /* Y LOS OTROS DOS CAMINOS, que no son el mismo. `timeout` es que el reto
         caduco sin resolverse; `unsupported` es que este navegador no puede
         hacerlo --pasa en navegadores dentro de otras apps--. Los dos acababan
         en el mismo silencio. */
      'timeout-callback': function () {
        estado.captcha = '';
        estado.captchaFallo = 'caduco (timeout)';
        pintarFalloCaptcha();
      },
      'unsupported-callback': function () {
        estado.captcha = '';
        estado.captchaFallo = 'navegador no admitido (unsupported)';
        pintarFalloCaptcha();
      }
    });
  }

  /* NO SE MANDA SIN TOKEN, Y ESTE ES EL ARREGLO DE VERDAD. Las dos entradas
     mandaban `estado.captcha` fuera lo que fuera --incluido vacío, que es lo
     que queda cuando el reto todavía no terminó o cuando caducó-- y entonces
     quien contesta es Supabase, con un `captcha_failed` que la persona lee como
     «mi contraseña está mal».

     Ahora se espera al token hasta seis segundos. Si llega, se sigue; si no, se
     dice que el antirrobots no terminó, que es lo que pasó de verdad, y no se
     gasta un intento de contraseña fallido. */
  function conToken() {
    if (estado.captcha) return Promise.resolve(estado.captcha);
    if (!cfg.turnstileSiteKey) return Promise.resolve('');
    return new Promise(function (listo) {
      var t0 = Date.now();
      (function mirar() {
        if (estado.captcha) return listo(estado.captcha);
        if (Date.now() - t0 > 6000) return listo('');
        setTimeout(mirar, 200);
      })();
    });
  }

  /* UN REINTENTO SOLO, Y AUTOMÁTICO. Un reto que falla por red o por caducidad
     casi siempre va a la segunda --es lo que le pasó al titular a mano-- así que
     lo hace la app en vez de hacerlo la persona. Uno solo: si el segundo
     tampoco, es un problema de verdad y reintentar en bucle solo lo esconde. */
  var yaReintente = false;
  function reintentarCaptcha() {
    if (yaReintente || !window.turnstile) return;
    yaReintente = true;
    setTimeout(function () { montarCaptcha(); }, 800);
  }

  /* SE ENSEÑA EN PANTALLA, no solo en consola. Quien no puede entrar esta en un
     telefono, donde no hay consola que abrir; y quien puede arreglarlo necesita
     el numero. Va debajo del hueco del captcha, en chico. */
  function pintarFalloCaptcha() {
    var hueco = $('#captcha');
    if (!hueco || !estado.captchaFallo) return;
    var n = document.getElementById('captcha-fallo');
    if (!n) {
      n = document.createElement('p');
      n.id = 'captcha-fallo';
      n.className = 'chico';
      n.style.cssText = 'color:var(--peligro);margin-top:var(--e-2);text-align:center';
      hueco.parentNode.insertBefore(n, hueco.nextSibling);
    }
    n.textContent = 'Antirrobots: ' + estado.captchaFallo;
  }

  function refrescarCaptcha() {
    estado.captcha = '';
    /* Un refresco PEDIDO --tras un fallo de entrada-- devuelve el derecho a un
       reintento automático: el tope de uno es para no encadenar reintentos
       solos, no para castigar a quien vuelve a intentarlo a mano. */
    yaReintente = false;
    if (window.turnstile) montarCaptcha();
  }

  /* --- Piezas de pantalla ---------------------------------------------------- */
  /* `pieza` es el logotipo (null), un icono ILUSTRADO ya montado —que viene
     como HTML y trae su propio tamaño— o, mientras no haya dibujo para ese
     concepto, un emoji del sistema, que sí necesita que alguien le diga de qué
     tamaño va. De ahí el `charAt`: no es adivinar, es distinguir una pieza que
     ya sabe medirse de un carácter que no. */
  function cabeza(pieza, titulo, bajada) {
    var esHTML = typeof pieza === 'string' && pieza.charAt(0) === '<';
    return '<div class="centrado" style="padding:var(--e-5) 0 var(--e-5)">' +
        (pieza === null
          ? '<img src="../assets/img/logotipo-96.png" alt="ATWI" width="210" height="70" ' +
            'style="margin:0 auto;height:58px;width:auto">'
          : esHTML
            ? '<div style="line-height:1">' + pieza + '</div>'
            : '<div style="font-size:3.25rem;line-height:1">' + pieza + '</div>') +
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
    '<div class="aviso-ia" style="margin-top:var(--e-5)">' + iconoSVG('aviso', 20) +
      '<span>' + cfg.descargo + cfg.gancho + '</span>' +
    '</div>';

  var ERROR = '<p class="chico" id="c-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>';

  /* --- Pintado --------------------------------------------------------------- */
  function pintar() {
    var caja = $('#puerta .modal__cuerpo');
    var boton = $('#puerta .modal__pie button');
    var p = estado.paso;

    /* ⚠️ ESTE PASO SOLO EXISTE SIN SERVIDOR, y ya no es «la pantalla de
       registrarse»: es la que deja jugar en un ATWI sin Supabase configurado,
       donde no hay correo ni contraseña que valgan y lo único que hace falta
       es un apodo. Con servidor —el caso real— la puerta abre en `entrar` y el
       alta vive en el globo de «¡Soy nuevo!». */
    if (p === 'datos') {
      caja.innerHTML =
        cabeza(null, 'Entra a jugar', 'Solo el apodo. Nada más.') +
        '<div class="apilado-5">' +
          /* UNA SOLA PALABRA Y 16 LETRAS. El nombre acaba en el rótulo que
             flota sobre la figura en la sala, y los dos rótulos van uno al
             lado del otro: con nombre y apellido se salen de la pantalla. La
             regla y el porqué están en datos.js. */
          campo('c-nombre', 'Tu apodo en el juego',
                'type="text" data-nombre autocomplete="nickname" maxlength="' + datos.NOMBRE_MAX + '" ' +
                'placeholder="Tu apodo" value="' + esc(estado.nombre) + '"',
                'Una sola palabra.') +
          ERROR +
        '</div>' + AVISO_IA;
      enfocar('#c-nombre', !estado.nombre);
      boton.textContent = 'Jugar';

    } else if (p === 'contrasena') {
      caja.innerHTML =
        cabeza('🔑', 'Ya estás dentro',
               'Elige tu apodo y una contraseña para la próxima vez. El navegador te la va a guardar.') +
        '<div class="apilado-5">' +
          campo('c-nombre2', 'Tu apodo en el juego',
                'type="text" data-nombre autocomplete="nickname" maxlength="' + datos.NOMBRE_MAX + '" ' +
                'placeholder="Tu apodo" value="' + esc(estado.nombre) + '"',
                'Una sola palabra, y tiene que estar libre: no hay dos apodos iguales.') +
          campo('c-clave', 'Contraseña',
                'type="password" autocomplete="new-password" minlength="8" placeholder="Al menos 8 caracteres"',
                'Que puedas recordar. No hace falta que sea rara.') +
          ERROR +
        '</div>' + AVISO_IA;
      enfocar('#c-clave', true);
      boton.textContent = 'Guardar y jugar';

    } else if (p === 'entrar') {
      /* LA UNICA PANTALLA DE LA PUERTA (titular, 2026-09-19). Antes esto era
         «Hola otra vez», la alternativa a la de registrarse; ahora es la
         entrada y punto, así que el saludo no puede dar por hecho que ya se
         estuvo aquí. Y lleva el AVISO DE IA, que vivía en la pantalla de alta:
         al quedarse ésta sola, sin él el descargo no se leía en ningún sitio
         antes de jugar. */
      caja.innerHTML =
        cabeza(null, 'Entra a jugar', 'Tu correo y tu contraseña.') +
        '<div class="apilado-5">' +
          campo('c-correo2', 'Tu correo',
                'type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.com" value="' + esc(estado.correo) + '"') +
          campo('c-clave2', 'Contraseña', 'type="password" autocomplete="current-password" placeholder="Tu contraseña"') +
          '<div class="captcha"><div id="captcha"></div></div>' +
          ERROR +
        '</div>' +
        /* EL ALTA NO CAMBIA DE PANTALLA, ABRE UN GLOBO: es una pregunta de un
           campo y cambiar la pantalla entera para hacerla era lo que hacía
           confusa la puerta. */
        '<button class="boton boton--fantasma boton--bloque" data-accion="soy-nuevo" style="margin-top:var(--e-4)">' +
          '¡Soy nuevo!</button>' +
        AVISO_IA;
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
      /* Y SI TURNSTILE NO SE QUEJÓ, NO SE DECLARA ROTO. Sin `error-callback`,
         sin `timeout` y sin `unsupported`, lo único que sabemos es que todavía
         no hay token --puede estar esperando un toque, o la red del móvil--.
         Decir «no podemos dejarte entrar» ahí es acusar de avería a algo que
         está funcionando, y fue lo que le pasó al titular en su teléfono. */
      if (!estado.captchaFallo && !enLocalhost()) return;

      /* A quien juega se le dice algo que pueda entender y hacer. El diagnóstico
         —qué dominio hay que dar de alta y en qué widget— va a la consola, que
         es donde lo busca quien puede arreglarlo. */
      /* ESTE AVISO DECÍA LA CAUSA Y NO LA SABE. Afirmaba «casi siempre es que
         ese dominio no está en la lista», y el 2026-09-15 el titular comprobó
         dos veces que el dominio SÍ estaba: el fallo era otro y el aviso mandó
         a mirar donde no era. Ahora dice lo que ve --que a los cuatro segundos
         no hay token-- y el código, si Turnstile llegó a darlo.
         OJO CON `appearance: 'interaction-only'`: en ese modo el widget NO se
         dibuja mientras no haga falta interacción, así que «no se ve nada» es
         normal y lo único que decide es si hay token. */
      if (window.console && console.warn) {
        console.warn('[ATWI] Turnstile no dio token en «' + location.hostname +
          '» a los 4 s. Clave ' + cfg.turnstileSiteKey +
          (estado.captchaFallo ? '. Código: ' + estado.captchaFallo
                               : '. Sin código: no llamó a error-callback.') +
          '. Con el captcha obligatorio en Supabase Auth, entrar va a fallar ' +
          'con captcha_failed.');
      }
      pintarFalloCaptcha();
      error(enLocalhost()
        ? 'Aviso de local: el antirrobots no dio token para «localhost», así que ' +
          'entrar va a fallar aquí. Revisa los dominios del widget ' +
          cfg.turnstileSiteKey + ' en Cloudflare.'
        /* NO SE LE ECHA LA CULPA A SU RED. Esto decía «puede ser tu red o un
           bloqueador», y el 2026-09-15 falló para TODO EL MUNDO por una razón
           nuestra --el dominio no estaba en la lista del widget en Cloudflare--:
           cada persona que no podía entrar se fue a revisar su wifi. Cuando el
           aviso no sabe de quién es la culpa, no la reparte. */
        : 'No pudimos cargar la verificación antirrobots, así que no podemos ' +
          'dejarte entrar todavía. Probá a recargar la página. Si sigue igual, ' +
          'puede ser un bloqueador tuyo o un problema nuestro: no es algo que ' +
          'puedas arreglar desde aquí.');
      /* DOCE SEGUNDOS Y NO CUATRO. El plazo viejo medía una red de escritorio:
         en un móvil, entre que baja el script de Cloudflare, monta el iframe y
         resuelve el reto se van más de cuatro sin que nada vaya mal. */
    }, 12000);
  }

  /* --- El alta, en un globo ---------------------------------------------------
     EL REGISTRO ES UN AUTOINVITE (titular, 2026-09-19): *«prefiero una sola
     pantalla, la de login normal por defecto, y un botón o mensaje de "soy
     nuevo" que en vez de cambiar la screen completa abra un globo de sistema
     con el campo email y enviar enlace»*. Y lo que llega detrás ya existía: el
     enlace del correo abre la pantalla de apodo y contraseña, que es la misma
     que estrena cualquier invitado.

     LO QUE ESTO ARREGLA es que la puerta pedía elegir antes de nada —«Entra a
     jugar» con apodo y correo, o «Ya tengo cuenta» en letra chica— y las dos
     pantallas se parecían lo bastante como para no saber en cuál se estaba.
     Ahora hay UNA, la de siempre, y el alta es una pregunta de un campo.

     ⚠️ Y EL APODO SE PIDE DESPUÉS, NO AQUÍ. Antes se escribía en el primer
     paso, se guardaba en `localStorage` para sobrevivir al viaje por el correo
     —el enlace puede abrirse en otra pestaña— y se volvía a pedir al final por
     si se había perdido. Pidiéndolo solo al volver, ese guardado deja de
     existir y con él la única pieza del alta que podía llegar vacía. */
  var globoAlta = null;          // el botón del que cuelga, para reabrirlo

  function cuerpoAlta(mandado) {
    return '<div id="a-cuerpo">' + dentroDelAlta(mandado) + '</div>';
  }

  function dentroDelAlta(mandado) {
    if (mandado) {
      return '<p class="globo__texto">Te mandamos un enlace a <b>' + esc(estado.correo) + '</b>. ' +
        'Ábrelo en este mismo teléfono y entras solo.</p>' +
        '<p class="chico tenue" style="margin-top:var(--e-2)">¿No llega? Mira en el correo no ' +
        'deseado. El enlace caduca en una hora.</p>' +
        '<p class="chico" id="a-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>';
    }
    return '<p class="globo__texto">Escribe tu correo y te mandamos un enlace para entrar. ' +
        'El apodo y la contraseña los eliges al volver.</p>' +
      '<label style="display:block;margin-top:var(--e-3)">' +
        '<span class="solo-lectores">Tu correo</span>' +
        '<input class="campo" id="a-correo" type="email" autocomplete="email" inputmode="email" ' +
          'placeholder="tu@correo.com" value="' + esc(estado.correo) + '">' +
      '</label>' +
      '<p class="chico" id="a-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>';
  }

  /** Abre el globo del alta, o lo repinta si ya está abierto.
      ⚠️ NO SE REABRE DESDE EL MISMO BOTÓN PARA CAMBIARLE EL CONTENIDO: `abrirGlobo`
      trata el disparador como un INTERRUPTOR —tocar el mismo signo cierra el globo—,
      así que pedirlo otra vez desde «¡Soy nuevo!» lo cerraba justo cuando el
      correo acababa de salir, y la persona se quedaba en la pantalla de entrar
      sin saber si se había mandado. Lo que cambia es lo de dentro. */
  function abrirAlta(disparador, mandado) {
    if (disparador) globoAlta = disparador;
    if (!globoAlta || !window.ATWI.globo) return;

    var dentro = $('#a-cuerpo');
    if (dentro) {
      var titulo = document.querySelector('.globo .globo__titulo');
      var bot = document.querySelector('.globo [data-puerta="enviar"]');
      if (titulo) titulo.textContent = mandado ? 'Mira tu correo' : 'Entra por primera vez';
      dentro.innerHTML = dentroDelAlta(mandado);
      if (bot) { bot.disabled = false; bot.textContent = mandado ? 'Volver a mandarlo' : 'Enviar enlace'; }
      /* Lo que crece dentro de un globo no se recoloca solo: mide y se sitúa al
         abrirse, y este cuerpo cambia de alto. */
      window.ATWI.globo.recolocar();
      return;
    }

    window.ATWI.globo.abrir(globoAlta, { titulo: mandado ? 'Mira tu correo' : 'Entra por primera vez' }, {
      tinte: 'lavanda',
      /* LA CAMPANA Y NO LA BOMBILLA: aquí no se explica nada, se dice que va a
         llegar algo al correo, que es lo que esa pegatina significa en el resto
         del juego. */
      signo: 'buzon',
      etiqueta: 'Entrar por primera vez',
      cuerpo: cuerpoAlta(mandado),
      acciones: '<button class="boton boton--bloque" data-puerta="enviar">' +
        (mandado ? 'Volver a mandarlo' : 'Enviar enlace') + '</button>'
    });
    if (!mandado) setTimeout(function () { var c = $('#a-correo'); if (c) c.focus(); }, 80);
  }

  function errorAlta(texto) {
    var e = $('#a-error');
    if (e) e.textContent = texto || '';
  }

  function ocupadoAlta(si, textoQuieto) {
    estado.enviando = si;
    var b = document.querySelector('.globo [data-puerta="enviar"]');
    if (!b) return;
    b.disabled = si;
    b.textContent = si ? 'Mandando…' : (textoQuieto || 'Enviar enlace');
  }

  /* --- Acciones --------------------------------------------------------------- */
  function mandarEnlace() {
    var campoCorreo = $('#a-correo');
    var correo = ((campoCorreo ? campoCorreo.value : estado.correo) || '').trim().toLowerCase();
    if (!valeCorreo(correo)) return errorAlta('Ese correo no parece válido.');

    estado.correo = correo;
    errorAlta('');
    ocupadoAlta(true);
    return mandarElCorreo(correo);
  }
  function mandarElCorreo(correo) {
    /* La vuelta es esta misma pantalla. Tiene que estar dada de alta en el panel
       de Supabase, en Authentication -> URL Configuration -> Redirect URLs. */
    var vuelta = location.origin + location.pathname;
    /* ⚠️ EL ANTIRROBOTS ES EL DE LA PANTALLA DE DETRÁS, no uno propio del globo.
       Montar un segundo widget de Turnstile aquí dentro sería meter un iframe
       que crece cuando Cloudflare pide resolver un reto en una caja con
       `overflow`; y no hace falta, porque el token ya está resuelto abajo. Si
       todavía no lo está, se dice aquí y el reto sigue a la vista al cerrar. */
    conToken().then(function (ficha) {
      if (cfg.turnstileSiteKey && !ficha) {
        ocupadoAlta(false);
        reintentarCaptcha();
        return errorAlta('La verificación antirrobots de la pantalla de atrás no terminó. ' +
                         'Espera un momento y toca otra vez.');
      }
      return auth.mandarEnlace(correo, ficha, vuelta)
        .then(function () { estado.enviando = false; abrirAlta(null, true); });
    })
      .catch(function (e) {
        ocupadoAlta(false);
        errorAlta(porQue(e));
        refrescarCaptcha();
      });
  }

  /** Sin servidor no hay correo ni contraseña: con el apodo basta para jugar. */
  function jugarSinServidor() {
    var nombre = datos.limpiarNombre($('#c-nombre') ? $('#c-nombre').value : '');
    var malElNombre = datos.errorDeNombre(nombre);
    if (malElNombre) return error(malElNombre);
    datos.actualizar({ nombre: nombre });
    cerrar();
  }

  function guardarContrasena() {
    var nombre = datos.limpiarNombre($('#c-nombre2').value);
    var clave = $('#c-clave').value || '';
    var malElNombre = datos.errorDeNombre(nombre);
    if (malElNombre) return error(malElNombre);
    if (clave.length < 8) return error('La contraseña necesita al menos 8 caracteres.');
    error('');
    ocupado(true);

    auth.apodoLibre(nombre)
      .then(function (libre) {
        if (!libre) throw new Error('Ese apodo ya está en uso. Prueba otro.');
        return auth.ponerContrasena(clave);
      })
      .then(function () { return auth.miPerfil(); })
      /* EL APODO ESCRITO AQUÍ SE GUARDA (2026-09-18). El perfil ya existe --lo
         crea el alta al registrarse, con el correo como apodo provisional-- y
         antes lo que se escribía en este campo se ignoraba si había perfil. */
      .then(function (perfil) {
        if (!perfil) return auth.crearPerfil(nombre, '🙂');
        if (perfil.nombre !== nombre) return auth.guardarPerfil({ nombre: nombre }).then(function (p) { return p || perfil; });
        return perfil;
      })
      .then(function (perfil) {
        datos.actualizar({ nombre: (perfil && perfil.nombre) || nombre });
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

    conToken().then(function (ficha) {
      if (cfg.turnstileSiteKey && !ficha) {
        ocupado(false, 'Entrar');
        reintentarCaptcha();
        throw new Error('__sin_captcha');
      }
      return auth.entrarConContrasena(correo, clave, ficha);
    })
      .then(function () { return auth.miPerfil(); })
      .then(function (perfil) {
        datos.actualizar({ nombre: (perfil && perfil.nombre) || '' });
        ocupado(false, '');
        cerrar();
      })
      .catch(function (e) {
        /* El aviso de «no terminó el antirrobots» ya se pintó al lanzarlo; si
           lo volviera a pasar por `porQue()` saldría un mensaje de credenciales
           para algo que no tiene que ver con la contraseña. */
        if (e && e.message === '__sin_captcha') return;
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
    /* EL BOTON DEL GLOBO VIVE FUERA DE `#puerta` —el globo se cuelga del marco,
       no del modal—, así que se mira aparte y con marca propia: `data-accion`
       lo atiende también `app.js`. */
    var alta = ev.target.closest('.globo [data-puerta="enviar"]');
    if (alta) { if (!estado.enviando) mandarEnlace(); return; }

    var acc = ev.target.closest('#puerta [data-accion]');
    if (!acc || estado.enviando) return;
    var a = acc.dataset.accion;
    if (a === 'continuar') {
      if (estado.paso === 'datos') jugarSinServidor();
      else if (estado.paso === 'contrasena') guardarContrasena();
      else if (estado.paso === 'entrar') entrar();
    } else if (a === 'soy-nuevo') {
      abrirAlta(acc, false);
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var p = $('#puerta');
    if (!p || p.hidden || estado.enviando) return;
    if (ev.target.tagName === 'INPUT') ev.preventDefault();
    /* Con el globo abierto, el Enter es suyo: el botón del pie está detrás del
       velo y pulsarlo desde aquí sería entrar con la contraseña vacía. */
    var b = document.querySelector('.globo [data-puerta="enviar"]') ||
            $('#puerta .modal__pie button');
    if (b) b.click();
  });

  /* --- Arranque ---------------------------------------------------------------- */
  function modoPruebas() {
    var enLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    return enLocal && /[?&]local=1/.test(location.search);
  }

  window.ATWI.entrada = {
    /* LA PUERTA DE PRUEBAS, EXPUESTA. La mira el probador de resultados para
       saber si puede enseñarse: en modo local no hay sesión, así que no hay
       correo que comparar con el del titular. Se exporta en vez de repetir la
       comprobación allá, que es como se acaba teniendo dos definiciones de
       «esto es una prueba» y una de las dos mal. */
    dePruebas: modoPruebas,

    /* QUE ES UN CORREO SE DECIDE EN UN SOLO SITIO. Lo pide también «Antes de
       empezar», para invitar a jugar en línea, y escribir allá otra expresión
       regular es tener dos definiciones de lo mismo y que una de las dos se
       quede vieja — que es exactamente lo que ya pasó con el descargo. */
    valeCorreo: valeCorreo,

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
        estado.paso = 'entrar';
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
