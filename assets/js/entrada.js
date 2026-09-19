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
    /* LA COMILLA SIMPLE TAMBIÉN (2026-09-19, docs/07). Hoy ningún atributo del
       juego va entre comillas simples, así que no se explotaba; el día que
       alguien escriba uno, esto ya está puesto. */
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
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

  /* TRES RAYAS A CADA LADO DEL ESLOGAN, como en el mockup. Se giran con el
     mismo path para no tener dos dibujos que mantener. */
  var CHISPA =
    '<svg class="portal__chispa" width="22" height="30" viewBox="0 0 22 30" fill="none" ' +
      'stroke="currentColor" stroke-width="3.4" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M4 7h7M2.6 15h6M4 23h7"/></svg>';

  /** Un campo con su signo dentro, sin rótulo encima. */
  function campoConSigno(id, signo, atributos, extra) {
    return '<label class="campo-icono' + (extra ? ' ' + extra : '') + '">' +
        '<span class="solo-lectores">' + esc(signo === 'sobre' ? 'Tu correo' : 'Contraseña') + '</span>' +
        '<span class="campo-icono__signo">' + iconoSVG(signo, 24) + '</span>' +
        '<input class="campo" id="' + id + '" ' + atributos + '>' +
      '</label>';
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

  /* ⚠️ AQUI HABIA UN RENGLON ROJO Y SE FUE (titular, 2026-09-19: «quita los
     mensajes en rojo del login, saca las notificaciones de error en toast»). Es
     la misma decisión que ya se tomó con los fallos del micrófono: un párrafo
     de dos renglones dentro del formulario **empuja lo de abajo** —el botón se
     mueve justo cuando la mano va a pulsarlo— y se queda puesto hasta el
     intento siguiente. El aviso flotante dice lo mismo, no mueve nada y se va
     solo.
     `ERROR` ya no existe: quien avisa es `error()`, que ahora es un toast. */

  /* --- El gate legal -----------------------------------------------------------
     EL DESCARGO DE IA DEJA SITIO A LOS TERMINOS (titular, 2026-09-19): *«este
     disclaimer ya no va, lo vamos a reemplazar por los términos y condiciones
     —a mostrar en un globo estilizado con botón de aceptar— que debe leerse y
     aceptarse para poder continuar la primera vez; la cuenta no se crea y
     activa sin esto: es nuestro gate de aprobación legal»*.

     El descargo no se pierde: es uno de los trece puntos de los términos, y
     sigue estando a la vista en la pantalla de entrar.

     ⚠️ LA CONSTANCIA VA AL SERVIDOR ANTES DE DEJAR JUGAR (migración 0063). Un
     gate que solo marca una casilla en el teléfono no demuestra nada y no se
     puede volver a pedir: aquí queda QUE VERSION se aceptó y CUANDO, con el
     reloj del servidor. */
  var terminosPuestos = false;      // aceptados en esta sesión de la puerta

  function laVersionDeLosTerminos() {
    var t = document.getElementById('tpl-terminos');
    return (t && t.dataset.version) || '0';
  }

  /* El texto vive en el HTML y no aquí: es lo que hay que poder leer y corregir
     sin tocar código. */
  function elTextoDeLosTerminos() {
    var t = document.getElementById('tpl-terminos');
    if (!t) return '<p>No se pudieron cargar los términos.</p>';
    return t.innerHTML;
  }

  var BLOQUE_TERMINOS =
    '<div class="tarjeta terminos-caja" id="c-terminos">' +
      '<p class="chico"><b>Términos y condiciones</b></p>' +
      '<p class="chico suave" id="c-terminos-estado">Léelos y acéptalos para poder jugar.</p>' +
      '<button class="boton boton--suave boton--bloque" data-accion="ver-terminos" ' +
        'style="margin-top:var(--e-3)">Leer y aceptar</button>' +
    '</div>';

  function pintarEstadoTerminos() {
    var caja = $('#c-terminos');
    if (!caja) return;
    caja.dataset.listo = terminosPuestos ? '1' : '';
    var est = $('#c-terminos-estado');
    var bot = caja.querySelector('[data-accion="ver-terminos"]');
    /* Sin aceptar se dice que se puede volver: quien cerró el globo sin aceptar
       necesita saber que no perdió nada y por dónde volver a abrirlo. */
    if (est) est.textContent = terminosPuestos
      ? 'Aceptados. Ya puedes jugar.'
      : 'Léelos y acéptalos para poder jugar.';
    if (bot) bot.textContent = terminosPuestos ? 'Volver a leerlos' : 'Leer y aceptar';
  }

  /* ⚠️ EL MISMO GATE EN DOS SITIOS, Y NO SE COMPORTA IGUAL (titular, 2026-09-19:
     *«si le digo ahora no, me cancela el registro y me manda al login; NO quiero
     eso: si cierro el modal permanecemos esperando y permitimos revisarlos de
     nuevo, no sacamos al user de la pantalla de registro»*).

     EN EL REGISTRO no hace falta encerrar a nadie: la cuenta todavía no está
     hecha --falta la contraseña-- y quien cierre el globo se queda donde estaba,
     con la tarjeta diciendo que faltan y el botón para volver a leerlos. El gate
     sigue siendo un gate porque **«Guardar y jugar» lo vuelve a abrir**: sin
     aceptar no se crea la cuenta. Sacarlo a la puerta era cobrarle el precio más
     caro posible --perder la sesión del enlace del correo-- por cerrar un modal.

     DENTRO DE LA APP es otra cosa: ahí ya hay cuenta y se puede jugar, así que
     un globo que se va solo dejaría jugar sin aceptar, que es exactamente lo que
     el gate existe para impedir. Ahí sigue `fijo` y «Ahora no» cierra la sesión.

     @param enElRegistro  true en la puerta (paso «contrasena»), false en la app. */
  var gateEnElRegistro = false;

  function abrirTerminos(disparador, alAceptar, enElRegistro) {
    if (!disparador || !window.ATWI.globo) return;
    gateEnElRegistro = !!enElRegistro;
    window.ATWI.globo.abrir(disparador, { titulo: 'Términos y condiciones' }, {
      tinte: 'lavanda',
      etiqueta: 'Términos y condiciones',
      /* Dentro de la app no se cierra tocando fuera, ni con Escape, ni con el
         atrás: un gate que se va solo no es un gate, y la salida es el botón.
         En el registro sí se cierra por donde sea: no hay nada detrás que
         proteger, porque sin aceptar no se pasa de esa pantalla. */
      fijo: !enElRegistro,
      /* `globo__cede` es lo que hace que esto quepa SIEMPRE: el globo mide el
         hueco visible y le da al cuerpo el alto que sobra, con scroll. */
      cuerpo: '<div class="globo__cede legal-globo" id="t-scroll">' +
        elTextoDeLosTerminos() + '</div>',
      acciones:
        '<button class="boton boton--bloque" data-puerta="acepto" disabled>Acepto</button>' +
        '<button class="boton boton--bloque boton--suave boton--punteado" data-puerta="ahora-no">' +
          'Ahora no</button>'
    });
    /* LO QUE SE ESTABA HACIENDO NO SE PIERDE AL CERRAR Y VOLVER A ABRIR: quien
       pulsó «Guardar y jugar», cerró el globo y después lo reabre desde la
       tarjeta, al aceptar sigue guardando sin tener que pulsar otra vez. */
    alAceptarTerminos = alAceptar || (enElRegistro ? alAceptarTerminos : null);
    vigilarLectura();
  }

  var alAceptarTerminos = null;

  /* ⚠️ «DEBE LEERSE», Y ESO SE COMPRUEBA: el botón de aceptar nace apagado y se
     enciende al llegar al final del texto. Si el texto cabe entero sin scroll
     —una pantalla alta— ya está leído y se enciende solo, o el gate sería
     imposible de pasar. */
  function vigilarLectura() {
    var caja = $('#t-scroll');
    var bot = document.querySelector('.globo [data-puerta="acepto"]');
    if (!caja || !bot) return;
    function mirar() {
      var alFinal = caja.scrollTop + caja.clientHeight >= caja.scrollHeight - 24;
      if (alFinal) { bot.disabled = false; bot.textContent = 'Acepto'; }
      else { bot.disabled = true; bot.textContent = 'Baja para leerlos'; }
    }
    caja.addEventListener('scroll', mirar);
    mirar();
  }

  /* SIN ACEPTAR NO SE JUEGA, PERO HAY QUE PODER IRSE. Un gate sin salida deja a
     la persona encerrada en una pantalla, y eso no lo arregla ningún término.
     Lo que cambia es A DÓNDE se va, y son dos respuestas distintas: */
  function rechazarTerminos() {
    if (window.ATWI.globo) window.ATWI.globo.cerrarFijo();
    terminosPuestos = false;

    /* EN EL REGISTRO NO SE VA A NINGÚN SITIO: se queda donde estaba, con la
       tarjeta esperando. No se cierra la sesión --la del enlace del correo, que
       cuesta otro correo recuperar-- ni se borra lo que llevara escrito. */
    if (gateEnElRegistro) {
      pintarEstadoTerminos();
      return;
    }

    /* Dentro de la app sí: ahí hay cuenta y se podría jugar, así que la única
       manera de no aceptar es salir. */
    alAceptarTerminos = null;
    var p = $('#puerta');
    auth.salir().catch(function () {}).then(function () {
      datos.actualizar({ nombre: '' });
      estado.paso = 'entrar';
      if (p) p.hidden = false;
      pintar();
      /* Tampoco aquí: quien acaba de pulsar «Ahora no» sabe perfectamente por
         qué está de vuelta en la pantalla de entrar. */
    });
  }

  function aceptarTerminosYa() {
    var bot = document.querySelector('.globo [data-puerta="acepto"]');
    if (bot) { bot.disabled = true; bot.textContent = 'Guardando…'; }
    return auth.aceptarTerminos(laVersionDeLosTerminos())
      .then(function () {
        terminosPuestos = true;
        if (window.ATWI.globo) window.ATWI.globo.cerrarFijo();
        pintarEstadoTerminos();
        if (alAceptarTerminos) { var f = alAceptarTerminos; alAceptarTerminos = null; f(); }
      })
      .catch(function (e) {
        if (bot) { bot.disabled = false; bot.textContent = 'Acepto'; }
        error('No se pudo guardar tu aceptación: ' + porQue(e));
      });
  }


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
        '</div>' + BLOQUE_TERMINOS;
      enfocar('#c-clave', true);
      pintarEstadoTerminos();
      boton.textContent = 'Guardar y jugar';

    } else if (p === 'entrar') {
      /* LA UNICA PANTALLA DE LA PUERTA (titular, 2026-09-19). Antes esto era
         «Hola otra vez», la alternativa a la de registrarse; ahora es la
         entrada y punto, así que el saludo no puede dar por hecho que ya se
         estuvo aquí. Y lleva el AVISO DE IA, que vivía en la pantalla de alta:
         al quedarse ésta sola, sin él el descargo no se leía en ningún sitio
         antes de jugar. */
      caja.innerHTML =
        '<div class="portal">' +
          '<img class="portal__logo" src="../assets/img/logotipo-96.png" alt="ATWI" width="210" height="70">' +
          '<p class="portal__eslogan">' + CHISPA +
            '<span>¡Resuélvelo Jugando!</span>' +
            '<span style="transform:scaleX(-1);display:flex">' + CHISPA + '</span>' +
          '</p>' +
        '</div>' +
        '<div style="margin-top:var(--e-5)">' +
          campoConSigno('c-correo2', 'sobre',
            'type="email" autocomplete="email" inputmode="email" ' +
            'placeholder="tu@correo.com" value="' + esc(estado.correo) + '"') +
          campoConSigno('c-clave2', 'candado',
            'type="password" autocomplete="current-password" placeholder="Tu contraseña"',
            'campo-icono--clave') +
          '<div class="captcha" style="margin-top:var(--e-3)"><div id="captcha"></div></div>' +
        '</div>';
      /* EL OJO SE PONE APARTE porque es un botón dentro de un `<label>`: metido
         en la cadena de arriba, el navegador lo trata como parte de la etiqueta
         y tocarlo enfocaría el campo además de alternar. */
      var caja2 = $('.campo-icono--clave');
      if (caja2) {
        var ojo = document.createElement('button');
        ojo.type = 'button';
        ojo.className = 'campo-icono__ojo';
        ojo.dataset.accion = 'ver-clave';
        ojo.setAttribute('aria-label', 'Ver la contraseña');
        ojo.innerHTML = iconoSVG('ojo', 24);
        caja2.appendChild(ojo);
      }
      /* ⚠️ Y AQUI NO VA EL DESCARGO DE IA (titular, 2026-09-19: «quita este
         disclaimer del login»). Estuvo unas horas: al quedarse ésta como única
         pantalla de la puerta se movió aquí para que no desapareciera de la
         vista. Lo que lo hace innecesario es el gate: el descargo es uno de los
         trece puntos de los términos, y **nadie juega sin haberlos aceptado**,
         así que ya no hace falta repetirlo donde solo entra quien ya los
         aceptó. */
      montarCaptcha();
      avisarSiFaltaElCaptcha();
      enfocar('#c-correo2', !estado.correo);
      boton.textContent = 'Entrar a jugar';
      /* LA RAYA Y EL «¡SOY NUEVO!» VAN EN EL PIE, debajo del botón: son la
         segunda puerta y el mockup los pone juntos. En el cuerpo se irían con
         el scroll justo cuando hace falta verlos.
         Se montan a mano y no en `caja.innerHTML` porque el pie es del modal y
         no se repinta con el cuerpo. */
      var pie = $('#puerta .modal__pie');
      var alta = $('#puerta [data-accion="soy-nuevo"]');
      if (pie && !alta) {
        var raya = document.createElement('p');
        raya.className = 'o-bien';
        raya.textContent = 'o';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'boton boton--bloque boton--suave boton--punteado';
        b.dataset.accion = 'soy-nuevo';
        b.textContent = '¡Soy nuevo!';
        pie.appendChild(raya);
        pie.appendChild(b);
      }
    } else {
      /* Las demás pantallas de la puerta no llevan la segunda puerta. */
      var sobra = $('#puerta .o-bien');
      if (sobra) sobra.remove();
      var sobra2 = $('#puerta [data-accion="soy-nuevo"]');
      if (sobra2) sobra2.remove();
    }
  }

  function enfocar(sel, si) {
    if (!si) return;
    setTimeout(function () { var e = $(sel); if (e) e.focus(); }, 60);
  }

  function error(texto) {
    /* Sin texto no hay nada que decir: con un renglón fijo había que borrarlo,
       con un toast simplemente no se saca. */
    if (!texto) return;
    if (window.ATWI && window.ATWI.aviso) return window.ATWI.aviso(texto);
    /* Respaldo para el caso imposible de que la puerta corra sin `app.js`. */
    if (window.console) console.warn('[ATWI] ' + texto);
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
        'deseado. El enlace caduca en una hora.</p>';
    }
    return '<p class="globo__texto">Escribe tu correo y te mandamos un enlace para entrar. ' +
        'El apodo y la contraseña los eliges al volver.</p>' +
      '<label style="display:block;margin-top:var(--e-3)">' +
        '<span class="solo-lectores">Tu correo</span>' +
        '<input class="campo" id="a-correo" type="email" autocomplete="email" inputmode="email" ' +
          'placeholder="tu@correo.com" value="' + esc(estado.correo) + '">' +
      '</label>';
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

  /* ⚠️ TAMBIEN EN TOAST, Y AQUI HAY UN MOTIVO DE MAS: el globo se mide y se
     coloca AL ABRIRSE, así que un renglón que aparece después lo deja mal
     puesto hasta que alguien lo recoloque a mano. El aviso flotante vive fuera
     del globo y no le cambia el alto. */
  function errorAlta(texto) { error(texto); }

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
    /* EL GATE. No se crea la cuenta sin esto: si no los aceptó, se le abren aquí
       mismo y al aceptar sigue el alta sola, sin tener que volver a pulsar. */
    if (!terminosPuestos) {
      /* SIN AVISO (titular, 2026-09-19: «esta no la pongas, esto es obvio
         cuando se intenta jugar por primera vez»). El gate se abre solo y se
         explica solo: decir además «falta aceptar los términos» encima del
         globo que los enseña es contar dos veces lo que ya se está viendo. */
      abrirTerminos($('#c-terminos [data-accion="ver-terminos"]'), guardarContrasena, true);
      return;
    }
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

    var acep = ev.target.closest('.globo [data-puerta="acepto"]');
    if (acep) { aceptarTerminosYa(); return; }
    var noAhora = ev.target.closest('.globo [data-puerta="ahora-no"]');
    if (noAhora) { rechazarTerminos(); return; }

    var acc = ev.target.closest('#puerta [data-accion]');
    if (!acc || estado.enviando) return;
    var a = acc.dataset.accion;
    if (a === 'continuar') {
      if (estado.paso === 'datos') jugarSinServidor();
      else if (estado.paso === 'contrasena') guardarContrasena();
      else if (estado.paso === 'entrar') entrar();
    } else if (a === 'soy-nuevo') {
      abrirAlta(acc, false);
    } else if (a === 'ver-terminos') {
      /* La tarjeta solo existe en el paso de la contraseña: siempre es registro. */
      abrirTerminos(acc, null, true);
    } else if (a === 'ver-clave') {
      var c = $('#c-clave2');
      if (!c) return;
      var oculta = c.type === 'password';
      c.type = oculta ? 'text' : 'password';
      acc.innerHTML = iconoSVG(oculta ? 'ojo-no' : 'ojo', 24);
      acc.setAttribute('aria-label', oculta ? 'Ocultar la contraseña' : 'Ver la contraseña');
      c.focus();
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
            /* ⚠️ Y TAMBIEN A QUIEN YA ESTABA DENTRO (titular, 2026-09-19). Si
               esto es el gate legal, las cuentas de antes tampoco han aceptado
               nada nunca; y el día que los términos cambien, la versión nueva
               vuelve a pedirse a todo el mundo sin tocar una línea. El globo va
               `fijo` sobre la app: su velo ya captura los clics, así que por
               debajo no se puede jugar mientras esté puesto. */
            terminosPuestos = perfil.terminos_version === laVersionDeLosTerminos();
            if (!terminosPuestos) {
              var colgarDe = document.querySelector('.cabecera__titulo');
              if (colgarDe) setTimeout(function () { abrirTerminos(colgarDe, null); }, 400);
            }
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
