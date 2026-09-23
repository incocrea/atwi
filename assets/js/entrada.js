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
                 captchaFallo: '',
                 /* Y si además está roto SIN ARREGLO —ya se reintentó, o el
                    navegador no puede—: lo único que se enseña en pantalla. */
                 captchaMuerto: '', enviando: false,
                 /* La invitación que trajo la llave del correo, si está viva, y
                    lo que hay que decir cuando no lo está. */
                 invitacion: null, avisoInvitacion: '' };

  /* --- Lo que sobrevive a que el enlace se gaste -----------------------------
     EL ENLACE DEL CORREO ES DE UN SOLO USO Y NO HAY MANERA DE QUE NO LO SEA:
     lo canjea el servidor de Supabase en el momento en que alguien lo abre, y
     desde aquí no se puede deshacer. Lo que sí se puede es que gastarlo no sea
     un callejón, y para eso hacen falta dos cosas guardadas en el aparato:

     · EL CORREO, para que «Mándamelo otra vez» sea un toque y no volver a
       escribirlo. Es el correo de quien está delante, en su propio teléfono, y
       ya conviven ahí la sesión entera y el perfil; «Salir» lo barre con todo
       lo demás porque `datos.olvidar()` va por prefijo.
     · EL ALTA A MEDIAS, porque la pantalla de apodo y contraseña solo se
       alcanzaba en el mismo ciclo de carga que consumía el fragmento: un
       refresco justo ahí —o una carga a medias, que es lo que le pasó al
       invitado— dejaba la cuenta creada, SIN CONTRASEÑA y con el apodo
       provisional, y sin ninguna vía de vuelta: a partir de ahí solo se podía
       entrar pidiendo otro enlace, cada vez. Con la marca puesta, esa pantalla
       vuelve a salir hasta que el alta se termina. */
  var CLAVE_CORREO = 'atwi.correo.v1';
  var CLAVE_ALTA   = 'atwi.alta.pendiente';
  var CLAVE_INVITA = 'atwi.invitacion.llave';
  function recordarCorreo(c) { try { localStorage.setItem(CLAVE_CORREO, c || ''); } catch (e) { /* incógnito */ } }
  function elCorreoRecordado() { try { return localStorage.getItem(CLAVE_CORREO) || ''; } catch (e) { return ''; } }
  function altaPendiente(si) {
    try {
      if (si === undefined) return !!localStorage.getItem(CLAVE_ALTA);
      if (si) localStorage.setItem(CLAVE_ALTA, '1'); else localStorage.removeItem(CLAVE_ALTA);
    } catch (e) { /* incógnito: se pierde la red, no el camino */ }
    return !!si;
  }

  /* --- La llave de la invitación (0074) --------------------------------------
     El correo enlaza a `/app/?inv=<llave>`. La llave se guarda en el aparato y
     SE QUITA DE LA BARRA en cuanto se lee, por dos motivos: no dejarla escrita
     en el historial del navegador, y que sobreviva a todo lo que viene después
     —el gate de los términos, un refresco, entrar con contraseña— sin tener que
     arrastrarla por la URL. Se borra sola cuando la invitación deja de estar
     viva: aceptada, rechazada o caducada. */
  function laLlaveDeLaUrl() {
    var llave = '';
    try {
      var u = new URL(location.href);
      llave = u.searchParams.get('inv') || '';
      if (llave) {
        u.searchParams.delete('inv');
        history.replaceState(null, '', u.pathname + (u.search || ''));
      }
    } catch (e) { /* URL rara: se sigue con lo guardado */ }
    if (llave) { try { localStorage.setItem(CLAVE_INVITA, llave); } catch (e) {} return llave; }
    try { return localStorage.getItem(CLAVE_INVITA) || ''; } catch (e) { return ''; }
  }
  function olvidarLaLlave() { try { localStorage.removeItem(CLAVE_INVITA); } catch (e) {} }

  function nombreDeModo(m) {
    var f = (cfg.modos || {})[m];
    return (f && f.nombre) || 'ATWI';
  }
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
    /* ⚠️ SE DESMONTA ANTES DE VACIAR EL HUECO. Vaciar el `innerHTML` se lleva
       el iframe pero NO le dice nada a Turnstile, que se queda con el widget
       registrado y avisa por consola —«Cannot find Widget …, consider using
       turnstile.remove()»— cada vez que quiere hablar con uno que ya no está.
       Y la puerta se repinta varias veces por carga, así que se acumulan.
       `remove()` con un id que ya no existe lanza: por eso va en `try`. */
    if (idCaptcha && window.turnstile.remove) {
      try { window.turnstile.remove(idCaptcha); } catch (e) { /* ya no estaba */ }
    }
    idCaptcha = null;
    hueco.innerHTML = '';
    /* Se monta de nuevo: lo que dijera el intento anterior deja de valer hasta
       que este conteste. Si vuelve a fallar, lo dirá él. */
    estado.captchaMuerto = '';
    quitarFalloCaptcha();
    idCaptcha = window.turnstile.render(hueco, {
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
      /* ⚠️ Y AL LLEGAR EL TOKEN SE BORRA LO QUE SE DIJO, que es lo que faltaba
         (lo vio el titular, 2026-09-19: «Antirrobots: 600010» EN ROJO debajo de
         un widget que decía «¡Operación exitosa!»). El rótulo lo pintaba el
         `error-callback` y no lo quitaba nadie: el reto falló una vez, la app
         reintentó sola, a la segunda salió bien —con su token y todo— y el
         aviso se quedó puesto. La app estaba lista para entrar y en pantalla
         ponía que estaba rota. */
      callback: function (t) {
        estado.captcha = t;
        estado.captchaFallo = '';
        estado.captchaMuerto = '';
        quitarFalloCaptcha();
      },
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
      /* ⚠️ UN FALLO QUE SE RECUPERA SOLO NO SE CUENTA (titular, 2026-09-19). El
         código se guarda y va a la consola SIEMPRE —es todo el diagnóstico—
         pero en pantalla no sale nada mientras quede un reintento: la mayoría
         de los 600xxx son el reto que se atragantó una vez y entra a la
         segunda, así que decirlo es asustar por algo que ya se arregló solo.
         Si el reintento TAMBIÉN falla, entonces sí: ahí la persona no va a
         poder entrar y tiene derecho a saberlo. */
      'error-callback': function (codigo) {
        estado.captcha = '';
        estado.captchaFallo = String(codigo || 'sin codigo');
        if (window.console) console.warn('[ATWI] Turnstile error-callback: ' + estado.captchaFallo);
        if (reintentosCaptcha >= REINTENTOS_CAPTCHA) { estado.captchaMuerto = 'error'; pintarFalloCaptcha(); }
        else reintentarCaptcha();
      },
      /* Y LOS OTROS DOS CAMINOS, que no son el mismo. `timeout` es que el reto
         caduco sin resolverse; `unsupported` es que este navegador no puede
         hacerlo --pasa en navegadores dentro de otras apps--. Los dos acababan
         en el mismo silencio. */
      /* El reto caducó sin resolverse: se pide otro y no se dice nada, porque
         no hay nada que la persona tenga que hacer. */
      'timeout-callback': function () {
        estado.captcha = '';
        estado.captchaFallo = 'timeout';
        if (reintentosCaptcha >= REINTENTOS_CAPTCHA) { estado.captchaMuerto = 'error'; pintarFalloCaptcha(); }
        else reintentarCaptcha();
      },
      /* Éste SÍ se dice a la primera, y es el único que no se arregla
         reintentando: el navegador no puede hacer el reto —pasa en los que van
         dentro de otra app, los de Instagram o Facebook— y lo único que sirve
         es abrirlo en un navegador de verdad. */
      'unsupported-callback': function () {
        estado.captcha = '';
        estado.captchaFallo = 'unsupported';
        estado.captchaMuerto = 'unsupported';
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

  /* TRES INTENTOS AUTOMÁTICOS, NO UNO (titular, 2026-09-21: «seguimos teniendo
     problemas con las verificaciones de Cloudflare, me preocupa esto», con un
     `300010` en atwi.app).
     Aquí ponía UNO, con este argumento: «si el segundo tampoco, es un problema
     de verdad y reintentar en bucle solo lo esconde». La mitad sigue siendo
     cierta —en bucle no— y la otra mitad la desmiente la familia del error: los
     `300xxx` son el reto FALLANDO AL EJECUTARSE, que es lo que pasa cuando la
     red se mueve debajo (el 4G cambiando de celda, el wifi que salta a datos),
     y eso se arregla solo volviéndolo a intentar un momento después. Dos
     reintentos con espera creciente cubren un corte de unos segundos y siguen
     estando lejos de un bucle: al tercero se dice y se deja en paz.
     ⚠️ **Y ESTO NO TOCA LA CAUSA**: el reto lo ejecuta Cloudflare en el
     navegador y desde aquí no se puede hacer que no falle. Lo que sí se puede
     es que fallar una vez no cueste una recarga. */
  var REINTENTOS_CAPTCHA = 2;
  /* El id que devuelve `render()`: hace falta para desmontarlo antes de
     volver a montarlo. */
  var idCaptcha = null;
  var reintentosCaptcha = 0;
  function reintentarCaptcha() {
    if (reintentosCaptcha >= REINTENTOS_CAPTCHA || !window.turnstile) return;
    reintentosCaptcha++;
    setTimeout(function () { montarCaptcha(); }, 800 * reintentosCaptcha);
  }

  /** El reintento que pide la persona: vuelve a empezar la cuenta, porque esto
      es una decisión suya y no un bucle del programa. */
  function reintentarCaptchaAMano() {
    reintentosCaptcha = 0;
    estado.captchaMuerto = '';
    quitarFalloCaptcha();
    montarCaptcha();
  }

  function quitarFalloCaptcha() {
    var n = document.getElementById('captcha-fallo');
    if (n && n.parentNode) n.parentNode.removeChild(n);
  }

  /* LO QUE SE DICE ES QUÉ HACER, NO EL NÚMERO (titular, 2026-09-19: «¿estos
     errores necesitamos mostrarlos o pueden ser de manejo interno para no
     asustar al user?»). Aquí ponía «Antirrobots: 600010», que a quien juega no
     le dice nada y parece una avería grave; y salía también cuando el reto ya
     se había arreglado solo.

     La regla que queda es la del proyecto de siempre —un aviso que dice algo
     falso se aprende a ignorar— partida en dos:
       · lo que se recupera solo NO SE DICE. Va a la consola y ya.
       · lo que deja a la persona sin poder entrar SE DICE EN PALABRAS, con lo
         que puede hacer, y con el código entre paréntesis al final: sin él, el
         día que alguien escriba «no puedo entrar» no hay por dónde empezar.

     Y SIGUE PEGADO AL WIDGET y no en un toast: el diagnóstico de la cosa que
     falló tiene que estar donde está la cosa que falló. */
  function pintarFalloCaptcha() {
    var hueco = $('#captcha');
    if (!hueco) return;
    if (!estado.captchaMuerto) return quitarFalloCaptcha();
    var n = document.getElementById('captcha-fallo');
    if (!n) {
      n = document.createElement('p');
      n.id = 'captcha-fallo';
      n.className = 'chico';
      n.style.cssText = 'color:var(--peligro);margin-top:var(--e-2);text-align:center';
      hueco.parentNode.insertBefore(n, hueco.nextSibling);
    }
    var codigo = estado.captchaFallo ? ' (' + estado.captchaFallo + ')' : '';
    /* ⚠️ Y EL AVISO TRAE SU BOTÓN EN VEZ DE MANDAR A RECARGAR (titular,
       2026-09-21). «Recarga la página» es la respuesta más cara posible a algo
       que se arregla remontando un widget: recargar vuelve a bajar la app, tira
       lo escrito en los campos y, si la persona venía de una invitación, la
       hace pasar otra vez por todo. `unsupported` no lleva botón porque ahí
       reintentar no arregla nada: ese navegador no puede, y punto. */
    n.innerHTML = '';
    var texto = document.createElement('span');
    texto.textContent = estado.captchaMuerto === 'unsupported'
      ? 'Este navegador no puede hacer la verificación. Abre atwi.app en Chrome, Safari o Firefox.' + codigo
      : 'No se pudo comprobar que no eres un robot.' + codigo;
    n.appendChild(texto);
    if (estado.captchaMuerto !== 'unsupported') {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'boton boton--suave boton--punteado';
      b.dataset.accion = 'reintentar-captcha';
      b.style.cssText = 'margin-top:var(--e-2);min-height:40px;padding:0 var(--e-4)';
      b.textContent = 'Reintentar la verificación';
      n.appendChild(b);
    }
  }

  function refrescarCaptcha() {
    estado.captcha = '';
    /* Un refresco PEDIDO --tras un fallo de entrada-- devuelve el derecho a un
       reintento automático: el tope es para no encadenar reintentos solos, no
       para castigar a quien vuelve a intentarlo a mano. */
    reintentosCaptcha = 0;
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

  /** Un campo con su signo dentro, sin rótulo encima. */
  /* El campo del rediseño de la invitación: rótulo encima, signo dentro y pista
     debajo. Es `campo()` y `campoConSigno()` juntos, y no sustituye a ninguno:
     en la pantalla de entrar el rótulo sobra —el sobre y el candado lo dicen— y
     aquí hace falta, porque «Tu apodo en el juego» no lo dibuja ningún icono. */
  function campoConRotulo(id, etiqueta, signo, atributos, pista, extra) {
    return '<label class="campo-rotulado">' +
        '<span class="campo-rotulado__eti">' + esc(etiqueta) + '</span>' +
        '<span class="campo-icono' + (extra ? ' ' + extra : '') + '">' +
          '<span class="campo-icono__signo">' + iconoSVG(signo, 22) + '</span>' +
          '<input class="campo" id="' + id + '" ' + atributos + '>' +
        '</span>' +
        (pista ? '<span class="campo-rotulado__pista">' + pista + '</span>' : '') +
      '</label>';
  }

  /* EL OJO SE MONTA APARTE porque es un botón dentro de un `<label>`: metido en
     la cadena de HTML, el navegador lo trata como parte de la etiqueta y
     tocarlo enfocaría el campo además de alternar. Y lleva a QUÉ campo mira
     (`data-para`): desde que hay dos contraseñas en la puerta —la de entrar y
     la del alta de invitado— buscar `#c-clave2` a mano dejaba el segundo ojo
     alternando el campo de la otra pantalla. */
  function montarElOjo(idCampo) {
    var cajaClave = $('#' + idCampo);
    cajaClave = cajaClave && cajaClave.closest('.campo-icono--clave');
    if (!cajaClave || cajaClave.querySelector('.campo-icono__ojo')) return;
    var ojo = document.createElement('button');
    ojo.type = 'button';
    ojo.className = 'campo-icono__ojo';
    ojo.dataset.accion = 'ver-clave';
    ojo.dataset.para = idCampo;
    ojo.setAttribute('aria-label', 'Ver la contraseña');
    ojo.innerHTML = iconoSVG('ojo', 24);
    cajaClave.appendChild(ojo);
  }

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

  /* La misma tarjeta con el documento al lado (rediseño del titular,
     2026-09-19): en el alta de invitado no hay botón, porque la tarjeta ENTERA
     es el disparador. Con el formulario, el logotipo y el tema por encima, un
     botón más en esa columna era la cuarta cosa pulsable de la pantalla. */
  var BLOQUE_TERMINOS_FICHA =
    '<button type="button" class="tarjeta terminos-caja terminos-caja--fila" id="c-terminos" ' +
      'data-accion="ver-terminos">' +
      '<span class="terminos-caja__signo">' + iconoSVG('documento', 26) + '</span>' +
      '<span class="terminos-caja__texto">' +
        '<b>Términos y condiciones</b>' +
        '<span class="chico suave" id="c-terminos-estado">Léelos y acéptalos para poder jugar.</span>' +
      '</span>' +
    '</button>';

  /* ⚠️ QUIEN ABRE EL GATE NO ESTA SIEMPRE EN EL MISMO SITIO (titular,
     2026-09-19: «si aun no acepto terminos y doy clic a ese boton debe abrirme
     los terminos para completarlos, sino el user cree que es falla del form»).
     Son DOS tarjetas: en el paso de la contrasena el disparador es un boton
     DENTRO de `#c-terminos`, y en el alta de invitado **la tarjeta entera es el
     boton** --el rediseño del 2026-09-19 lo hizo asi a proposito, para no poner
     una cuarta cosa pulsable en esa columna--. Buscando solo el descendiente
     (`#c-terminos [data-accion=…]`, con espacio) el alta de invitado devolvia
     null, y `abrirTerminos` se iba por su guarda **sin decir nada**: se pulsaba
     «Crear mi cuenta y jugar» y no pasaba absolutamente nada.
     Se mira la caja primero y despues dentro, asi que da igual cual de las dos
     formas tenga hoy y cual tenga la que se escriba mañana. */
  function disparadorDeTerminos() {
    var caja = $('#c-terminos');
    if (!caja) return null;
    return caja.matches('[data-accion="ver-terminos"]')
      ? caja
      : caja.querySelector('[data-accion="ver-terminos"]');
  }

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
    /* ⚠️ Y ESTA GUARDA NO PUEDE SER MUDA. El globo necesita de donde colgarse,
       asi que sin ancla no hay nada que abrir --pero esto es el gate LEGAL: que
       no se abra y no se diga por que es justo lo que el titular vio, un boton
       que no hace nada. Se cae a la tarjeta, que existe siempre que exista el
       bloque, y si tampoco esta se deja dicho en la consola: sin eso, «no pasa
       nada» no se puede investigar. */
    if (!disparador) disparador = $('#c-terminos');
    if (!disparador || !window.ATWI.globo) {
      console.warn('ATWI · no se pudo abrir el gate de términos: sin disparador');
      return;
    }
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
    /* ⚠️ EN EL ALTA DE INVITADO TODAVIA NO HAY CUENTA A LA QUE COLGAR LA
       CONSTANCIA, así que pedirla aquí es un 401 y el gate se queda puesto
       para siempre —comprobado en el navegador—. `aceptar_terminos` saca el
       dueño del JWT y aquí no hay JWT de nadie: la cuenta nace dos pasos más
       adelante. La constancia la escribe el servidor igual, con su fecha, pero
       dentro de `entrar_con_invitacion`, que es quien crea el perfil. Lo que se
       acepta se lleva en la misma petición, así que no hay hueco por el que
       alguien entre sin haber aceptado. */
    if (estado.paso === 'invitado') {
      terminosPuestos = true;
      if (window.ATWI.globo) window.ATWI.globo.cerrarFijo();
      pintarEstadoTerminos();
      if (alAceptarTerminos) { var g = alAceptarTerminos; alAceptarTerminos = null; g(); }
      return Promise.resolve();
    }
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
      /* Tampoco aquí, y es el mismo caso con un agravante: esta pantalla se
         abre SOLA al volver del enlace del correo, y el foco caía en el SEGUNDO
         campo —la contraseña— con el apodo todavía vacío encima. */
      pintarEstadoTerminos();
      boton.textContent = 'Guardar y jugar';

    } else if (p === 'invitado') {
      /* EL ALTA DE QUIEN LLEGA INVITADO (titular, 2026-09-19: «a alguien que no
         tiene cuenta deben ser links directos al registro donde la persona solo
         pone su apodo y clave»). Aquí no se pide el correo: ya lo sabemos —es
         aquel al que llegó la invitación— y por eso no hace falta un segundo
         correo con un enlace mágico, que es lo que se moría. Se enseña tapado
         para que se vea a qué cuenta se está dando de alta. */
      var inv = estado.invitacion || {};
      var modoInv = (cfg.modos || {})[inv.modo] ? inv.modo : 'debate';
      caja.innerHTML =
        /* EL LOGOTIPO MANDA, COMO EN LA PUERTA. Aquí no lleva eslogan: lo que
           tiene que leerse debajo es quién invita y a qué, no la marca otra
           vez. */
        '<div class="portal portal--corto">' +
          '<img class="portal__logo" src="../assets/img/logotipo-96.png" alt="ATWI" width="210" height="70">' +
        '</div>' +
        /* ⚠️ SIN TARJETA Y SIN GLOBO (titular, 2026-09-21: «quita el contenedor
           cuadrado y el que contiene el tema, deja los elementos solos»), que
           REVOCA el mockup del 2026-09-19. Lo de entonces agrupaba para que no
           se leyera como tres pantallas apiladas, y eso lo resuelve igual el
           orden —quién invita, a qué, el tema, los campos— sin meter dos cajas
           una dentro de otra: la ficha translúcida sobre el fondo dibujado y,
           dentro, el globo del tema con SU otro fondo. Dos velos apilados
           ensucian el dibujo que hay detrás en vez de dejarlo pasar.
           `.invita-ficha` se queda como agrupador —centra y reparte— pero sin
           caja: ni fondo, ni borde, ni relleno. */
        '<div class="invita-ficha">' +
          '<p class="invita-ficha__quien">' + esc(inv.propone_nombre || 'Alguien') + ' te invita a jugar</p>' +
          '<p class="invita-ficha__que">' + esc(nombreDeModo(modoInv)) + ' · ' +
            esc(String(inv.turnos || 2)) + (Number(inv.turnos) === 1 ? ' turno' : ' turnos') + ' cada uno</p>' +
          /* EL TEMA, CON LA ESCENA DEL MODO AL LADO. Y esas tres
             piezas son las que se quedaron huérfanas cuando el detalle del tema
             salió del flujo (2026-09-17): siguen publicadas y en el manifiesto,
             así que esto no baja un byte nuevo y deja de haber arte pagada que
             no pinta nadie. Los dos bocadillos dicen «aquí se discute» mejor
             que cualquier rótulo. */
          (inv.enunciado
            ? '<div class="invita-tema">' +
                '<img class="invita-tema__escena" src="../assets/img/iconos/escena-' + esc(modoInv) + '.png" ' +
                  'alt="" width="88" height="88">' +
                '<p class="invita-tema__texto">«' + esc(inv.enunciado) + '»</p>' +
              '</div>'
            : '') +
          '<div class="invita-ficha__campos">' +
            campoConRotulo('c-nombre3', 'Tu apodo en el juego', 'persona',
              'type="text" data-nombre autocomplete="nickname" maxlength="' + datos.NOMBRE_MAX + '" ' +
              'placeholder="Tu apodo" value="' + esc(estado.nombre) + '"',
              'Una sola palabra, y tiene que estar libre.') +
            campoConRotulo('c-clave3', 'Contraseña', 'candado',
              'type="password" autocomplete="new-password" minlength="8" placeholder="Al menos 8 caracteres"',
              inv.correo_tapado
                ? 'Tu cuenta se crea con <b>' + esc(inv.correo_tapado) + '</b>, el correo donde te llegó la invitación.'
                : 'Que puedas recordar. No hace falta que sea rara.',
              'campo-icono--clave') +
          '</div>' +
          BLOQUE_TERMINOS_FICHA +
        '</div>';
      montarElOjo('c-clave3');
      pintarEstadoTerminos();
      boton.textContent = 'Crear mi cuenta y jugar';

    } else if (p === 'entrar') {
      /* LA UNICA PANTALLA DE LA PUERTA (titular, 2026-09-19). Antes esto era
         «Hola otra vez», la alternativa a la de registrarse; ahora es la
         entrada y punto, así que el saludo no puede dar por hecho que ya se
         estuvo aquí. Y lleva el AVISO DE IA, que vivía en la pantalla de alta:
         al quedarse ésta sola, sin él el descargo no se leía en ningún sitio
         antes de jugar. */
      caja.innerHTML =
        /* VENGO DE UNA INVITACIÓN Y YA TENGO CUENTA (caso 2). La cinta dice a
           qué vengo, que si no el login es el mismo de siempre y la partida
           parece haberse perdido por el camino. Al entrar se va derecho a
           ella: la llave sigue guardada. */
        (estado.invitacion && estado.invitacion.estado === 'viva'
          ? '<p class="invita-cinta">' +
              esc(estado.invitacion.propone_nombre || 'Alguien') + ' te espera en una partida de ' +
              esc(nombreDeModo(estado.invitacion.modo)) + '. Entra y te llevamos.' +
            '</p>'
          : '') +
        '<div class="portal">' +
          '<img class="portal__logo" src="../assets/img/logotipo-96.png" alt="ATWI" width="210" height="70">' +
          /* Sin las tres rayas a cada lado (titular, 2026-09-22: «quita estas
             rayitas amarillas de decoración de los textos»). */
          '<p class="portal__eslogan"><span>¡Resuélvelo Jugando!</span></p>' +
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
      montarElOjo('c-clave2');
      /* ⚠️ Y AQUI NO VA EL DESCARGO DE IA (titular, 2026-09-19: «quita este
         disclaimer del login»). Estuvo unas horas: al quedarse ésta como única
         pantalla de la puerta se movió aquí para que no desapareciera de la
         vista. Lo que lo hace innecesario es el gate: el descargo es uno de los
         trece puntos de los términos, y **nadie juega sin haberlos aceptado**,
         así que ya no hace falta repetirlo donde solo entra quien ya los
         aceptó. */
      montarCaptcha();
      avisarSiFaltaElCaptcha();
      /* ⚠️ SIN AUTOFOCO (titular, 2026-09-19: «evita el autofocus en el campo
         email al entrar al login, esto abre el teclado de forma automática y es
         molesto; que el user sea quien decida dónde va a escribir»). En un
         teléfono el foco no es una sugerencia: **levanta el teclado**, que se
         come media pantalla y tapa justo lo que se acaba de rediseñar para que
         se viera. Y encima elige por la persona: quien viene con el correo
         recordado quiere ir a la contraseña. */
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
        raya.setAttribute('aria-hidden', 'true');
        var b = document.createElement('button');
        b.type = 'button';
        /* ⚠️ `boton--grande` COMO EL DE ARRIBA (titular, 2026-09-19: «los botones
           deben tener el mismo tamaño, el de soy nuevo está más pequeño»). Es la
           regla de los pares apilados del proyecto: son dos caminos, no una
           acción con su alternativa menor, y uno más bajo que el otro dice lo
           contrario de lo que son. Lo que los separa es el color. */
        b.className = 'boton boton--bloque boton--grande boton--suave';
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
  /* Lo que pasó con el enlace del correo, dicho en español y sin culpar a quien
     lo abrió. Los tres motivos —ya se usó, caducó, lo tocó antes un antivirus
     de correo— se arreglan igual: pedir otro. */
  function loQuePasoConElEnlace(e) {
    if (e && e.gastado) {
      return 'Ese enlace ya no vale: se abre una sola vez y caduca en una hora. ' +
             'Te mandamos otro ahora mismo.';
    }
    return (e && e.message) || 'No se pudo entrar con ese enlace.';
  }

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
      /* ⚠️ YA NO SE BUSCA UN `iframe`, Y POR ESO ESTO DISPARABA SIEMPRE
         (2026-09-19). Turnstile dejó de meter un iframe directo en el hueco:
         lo que crea al renderizar es un `<div>` y un
         `<input name="cf-turnstile-response">`, así que `querySelector('iframe')`
         no encontraba nada NUNCA y el widget se daba por no dibujado estando a
         la vista y pidiendo el toque. En localhost eso salía en cada carga.
         El `input` sí es señal de que el widget se montó: lo pone `render()`. */
      var hueco = $('#captcha');
      if (hueco && hueco.querySelector('iframe, input[name="cf-turnstile-response"]')) return;
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
      /* Aquí no hay reintento que valga: a los cuatro segundos no hay ni token
         ni iframe, así que el widget no llegó a montarse. Eso es de los que se
         dicen. */
      estado.captchaMuerto = 'sin-token';
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
          'dejarte entrar todavía. Prueba a recargar la página. Si sigue igual, ' +
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
    recordarCorreo(correo);
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
      abrirTerminos(disparadorDeTerminos(), guardarContrasena, true);
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
        /* El alta terminó: ya hay contraseña, así que esta pantalla deja de
           reclamarse y se entra como todo el mundo. */
        altaPendiente(false);
        ocupado(false, '');
        cerrar();
      })
      .catch(function (e) {
        ocupado(false, 'Guardar y jugar');
        error(e.message || 'No se pudo guardar.');
      });
  }

  /* EL ALTA DE QUIEN LLEGA INVITADO. Un solo viaje: la función de borde crea la
     cuenta ya confirmada —la llave prueba que el correo es suyo—, le pone el
     apodo y la constancia de los términos, y devuelve la sesión hecha. Al
     terminar no se cierra la puerta y ya: se va a la invitación, que es a lo
     que vino. */
  function crearDesdeInvitacion() {
    var nombre = datos.limpiarNombre($('#c-nombre3').value);
    var clave = $('#c-clave3').value || '';
    var malElNombre = datos.errorDeNombre(nombre);
    if (malElNombre) return error(malElNombre);
    if (clave.length < 8) return error('La contraseña necesita al menos 8 caracteres.');
    if (!terminosPuestos) {
      abrirTerminos(disparadorDeTerminos(), crearDesdeInvitacion, true);
      return;
    }
    estado.nombre = nombre;
    error('');
    ocupado(true);

    auth.apodoLibre(nombre)
      .then(function (libre) {
        if (!libre) throw new Error('Ese apodo ya está en uso. Prueba otro.');
        return auth.altaConInvitacion(laLlaveDeLaUrl(), nombre, clave, laVersionDeLosTerminos());
      })
      .then(function (r) {
        if (!r || !r.sesion) throw new Error((r && r.error) || 'No se pudo crear la cuenta.');
        datos.actualizar({ nombre: nombre });
        altaPendiente(false);
        ocupado(false, '');
        /* `cerrar()` es quien lleva a la invitación: los dos caminos que abren
           la app desde la puerta acaban ahí y no hace falta decirlo dos veces. */
        cerrar();
      })
      .catch(function (e) {
        ocupado(false, 'Crear mi cuenta y jugar');
        var clase = (e.cuerpo && e.cuerpo.clase) || '';
        var dicho = (e.cuerpo && e.cuerpo.error) || e.message;
        if (clase === 'ya_tienes_cuenta') {
          /* No es un fallo: es que esta persona ya estaba. Se le manda al login
             con la cinta de la invitación, que es el caso 2. */
          estado.paso = 'entrar';
          pintar();
          return error('Ya tienes una cuenta con ese correo. Entra con tu contraseña y te llevamos a la partida.');
        }
        if (clase === 'caducada' || clase === 'aceptada' || clase === 'no_existe') {
          olvidarLaLlave();
          estado.invitacion = null;
          estado.paso = 'entrar';
          pintar();
          return error('Esa invitación ya no está disponible.');
        }
        error(dicho || 'No se pudo crear la cuenta.');
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
    /* CASO 2: acaba de entrar con su contraseña y venía de una invitación. La
       app ya está montada, así que la invitación se abre encima en vez de
       dejarlo en la portada buscando la campana. Va aquí y no en `entrar()`
       porque los dos caminos que cierran la puerta —contraseña y alta de
       invitado— terminan en el mismo sitio. */
    if (estado.invitacion && window.ATWI.irALaInvitacion) {
      setTimeout(function () { window.ATWI.irALaInvitacion(estado.invitacion); }, 60);
    }
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
      else if (estado.paso === 'invitado') crearDesdeInvitacion();
      else if (estado.paso === 'entrar') entrar();
    } else if (a === 'reintentar-captcha') {
      reintentarCaptchaAMano();
    } else if (a === 'soy-nuevo') {
      abrirAlta(acc, false);
    } else if (a === 'ver-terminos') {
      /* La tarjeta solo existe en los dos pasos de alta —la contraseña tras el
         enlace y el invitado con su llave—: siempre es registro. */
      abrirTerminos(acc, null, true);
    } else if (a === 'ver-clave') {
      var c = $('#' + (acc.dataset.para || 'c-clave2'));
      if (!c) return;
      var oculta = c.type === 'password';
      /* ⚠️ EL FOCO SOLO VUELVE SI YA ESTABA. Cambiar `type` lo pierde, así que
         hay que devolverlo a quien estaba escribiendo; pero devolvérselo a
         quien NO lo tenía es abrirle el teclado por tocar un ojo, que es lo
         mismo que el autofoco por otra puerta. */
      var escribiendo = document.activeElement === c;
      c.type = oculta ? 'text' : 'password';
      acc.innerHTML = iconoSVG(oculta ? 'ojo-no' : 'ojo', 24);
      acc.setAttribute('aria-label', oculta ? 'Ocultar la contraseña' : 'Ver la contraseña');
      if (escribiendo) c.focus();
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

    /* LA LLAVE SE APAGA CUANDO LA INVITACIÓN DEJA DE ESTAR VIVA, y quien sabe
       eso es la app: la borra al aceptarla, al rechazarla y cuando la base dice
       que caducó. Mientras tanto se queda puesta y el enlace del correo sigue
       sirviendo tantas veces como haga falta, que es lo que se pidió. */
    olvidarLaInvitacion: olvidarLaLlave,

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
      catch (e) { fallo = e; }

      /* ¿Y venimos de una invitación? Se pregunta ANTES de decidir qué pintar,
         porque de la respuesta salen los tres caminos: sin cuenta al alta, con
         cuenta al login, y con sesión derecho a la partida. Si no hay red la
         llave se queda guardada y se vuelve a mirar en el arranque siguiente:
         eso es justamente lo que se pidió, que una caída no la mate. */
      var llave = laLlaveDeLaUrl();
      if (llave && !estado.invitacion) {
        return auth.invitacionPorLlave(llave)
          .then(function (inv) {
            if (inv && inv.estado === 'viva') { estado.invitacion = inv; return; }
            /* Aceptada, caducada o inventada: la llave ya no sirve y no se
               vuelve a preguntar por ella en cada arranque. */
            olvidarLaLlave();
            if (inv && inv.estado === 'caducada') estado.avisoInvitacion = 'Esa invitación caducó: las partidas esperan 24 horas.';
            else if (inv && inv.estado === 'aceptada') estado.avisoInvitacion = 'Esa invitación ya se aceptó.';
            else estado.avisoInvitacion = 'Esa invitación ya no existe.';
          })
          .catch(function () { /* sin red: la llave sigue guardada para el próximo arranque */ })
          .then(function () { seguir(); });
      }
      return seguir();

      function seguir() {
      if (recogida) {
        /* El alta empieza aquí y no termina hasta que hay apodo y contraseña.
           Si esta carga se cae en medio, la marca hace que se pueda retomar. */
        altaPendiente(true);
        p.hidden = false;
        estado.paso = 'contrasena';
        pintar();
        /* El correo llega dentro del usuario, no del fragmento. */
        auth.quienSoy().then(function (u) {
          if (u && u.email) { estado.correo = u.email; recordarCorreo(u.email); }
        }).catch(function () { /* el correo es para el texto del globo, no para entrar */ });
        return;
      }

      auth.listo().then(function (s) {
        if (s) {
          /* ⚠️ EL ALTA A MEDIAS MANDA SOBRE ENTRAR. Con sesión pero sin
             contraseña, dejar pasar a la app es dejar la cuenta atrapada en
             los enlaces de un solo uso para siempre. */
          if (altaPendiente()) {
            p.hidden = false;
            estado.paso = 'contrasena';
            if (!estado.correo) estado.correo = elCorreoRecordado();
            pintar();
            auth.quienSoy().then(function (u) {
              if (u && u.email) { estado.correo = u.email; recordarCorreo(u.email); pintar(); }
            }).catch(function () { /* con el recordado basta */ });
            return;
          }
          p.hidden = true;
          hecho();
          /* El enlace falló Y había sesión: antes esto no se decía nunca —el
             aviso vivía después del `return` de esta rama— así que quien
             volviera de un enlace gastado con la sesión puesta entraba sin
             enterarse de nada. Se dice, y con eso basta: ya está dentro. */
          if (fallo) error(loQuePasoConElEnlace(fallo));
          if (estado.avisoInvitacion) { error(estado.avisoInvitacion); estado.avisoInvitacion = ''; }
          /* CASO 3: con sesión y con invitación viva, a la partida. La app se
             acaba de montar con `hecho()`, así que la invitación se abre encima
             de la portada en vez de tener que ir a buscarla al buzón. */
          if (estado.invitacion && window.ATWI.irALaInvitacion) {
            setTimeout(function () { window.ATWI.irALaInvitacion(estado.invitacion); }, 60);
          }
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
        /* CASO 1 Y CASO 2. Lo único que los separa es si ese correo ya tiene
           cuenta, y eso lo dice la propia invitación: sin cuenta va al alta
           directa —apodo y contraseña, sin más correos— y con cuenta al login
           de siempre, con la cinta que dice a qué viene. */
        estado.paso = (estado.invitacion && !estado.invitacion.hay_cuenta) ? 'invitado' : 'entrar';
        if (!estado.correo) estado.correo = elCorreoRecordado();
        pintar();
        if (estado.avisoInvitacion) { error(estado.avisoInvitacion); estado.avisoInvitacion = ''; }
        /* SIN SESIÓN Y CON EL ENLACE GASTADO SE ABRE EL GLOBO, no un toast.
           Un aviso que dice «pide otro» y deja a la persona mirando la pantalla
           de entrar la obliga a encontrar sola el «¡Soy nuevo!»; el globo ES el
           sitio donde se pide otro, y viene con el correo puesto. */
        if (fallo) {
          if (fallo.gastado) {
            var donde = $('[data-accion="soy-nuevo"]');
            abrirAlta(donde || null, false);
            errorAlta(loQuePasoConElEnlace(fallo));
          } else {
            error(loQuePasoConElEnlace(fallo));
          }
        }
      });
      }
    }
  };
})();
