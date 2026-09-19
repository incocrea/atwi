/* ==========================================================================
   ATWI · tablero.js
   El tablero de administración. Cinco pestañas: costos, gente, partidas,
   material y límites.

   NO CARGA NADA DEL JUEGO salvo `config.js`, que trae la URL del proyecto y la
   clave anon —las dos públicas—. Ni auth.js ni datos.js: el juego tiene su
   sesión, su perfil y sus reglas, y compartirlos significaría que un cambio en
   la sala puede romper el tablero y al revés.

   LA SEGURIDAD ESTÁ EN LA BASE, NO AQUÍ. Todo lo que se pide pasa por RLS con
   `es_admin()`. Quien entre con una cuenta de jugar va a ver todas las
   pestañas vacías, porque la base no le devuelve ni una fila. Este archivo no
   decide nada: solo dibuja lo que le dejan leer.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var CLAVE = 'atwi.admin.sesion';
  var sesion = null;
  var pestana = 'costos';

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    /* LA COMILLA SIMPLE TAMBIÉN (2026-09-19, docs/07). Hoy ningún atributo del
       juego va entre comillas simples, así que no se explotaba; el día que
       alguien escriba uno, esto ya está puesto. */
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) { return '$' + Number(n || 0).toFixed(4); }
  /* LA HORA SE ENSEÑA EN LA DEL NAVEGADOR, y antes no.
     Esto cortaba el texto que devuelve PostgREST —`2026-09-16T03:02:44+00:00`—
     y pintaba «2026-09-16 03:02», que es UTC. El titular está en UTC-5, así que
     el tablero decía las 03:02 de una llamada que él hizo a las 22:02, y al
     compararlo con el registro de Anthropic —que sí usa la hora del navegador—
     no cuadraba nada por cinco horas exactas.

     Una hora que hay que traducir mentalmente para comparar es una hora que se
     compara mal. */
  function fecha(s) {
    if (!s) return '—';
    var d = new Date(s);
    if (isNaN(d)) return String(s).slice(0, 16).replace('T', ' ');
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /** Qué zona se está enseñando, para decirlo en pantalla y que no haya dudas. */
  function laZona() {
    var m = -new Date().getTimezoneOffset() / 60;
    return (Intl.DateTimeFormat().resolvedOptions().timeZone || 'local') +
           ' (UTC' + (m >= 0 ? '+' : '') + m + ')';
  }

  /* --- Hablar con la base ----------------------------------------------------
     Con el token de la persona, NUNCA con la clave de servicio: la de servicio
     se salta RLS y en una página que vive en el navegador eso convierte
     cualquier sesión robada en acceso total. Aquí manda `es_admin()`. */
  function pedir(camino) {
    return fetch(cfg.supabaseUrl + '/rest/v1/' + camino, {
      headers: {
        apikey: cfg.supabaseAnon,
        Authorization: 'Bearer ' + sesion.access_token,
        Accept: 'application/json'
      }
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t.slice(0, 200)); });
      return r.json();
    });
  }

  /* El tablero es de LEER, y esta es la única excepción: el selector de modelo.
     Va por el mismo sitio y con el mismo token, así que la política
     `es_admin()` sigue mandando igual que en las lecturas. */
  function guardar(camino, cuerpo) {
    return fetch(cfg.supabaseUrl + '/rest/v1/' + camino, {
      method: 'PATCH',
      headers: {
        apikey: cfg.supabaseAnon,
        Authorization: 'Bearer ' + sesion.access_token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t.slice(0, 200)); });
      return r.json();
    });
  }

  /* --- El antirrobots --------------------------------------------------------
     Supabase Auth tiene el captcha obligatorio y lo exige TAMBIEN en la entrada
     por contraseña, no solo en el alta. Sin token devuelve `captcha_failed` y
     no deja pasar: esta puerta se escribió sin él y no habría funcionado.

     Si el widget no se dibuja, se dice y no se deja intentar a ciegas: el error
     de Supabase sería `captcha_failed`, que no le explica nada a nadie. */
  var captcha = '';
  var trasto = null;          // el id del widget, para poder preguntarle luego

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
    /* VISIBLE, no `interaction-only`. En el juego va invisible porque ahí hay
       que escribir nombre y correo y al llegar al botón el token lleva rato
       hecho. Aquí el navegador rellena las dos casillas de golpe y se pulsa
       enseguida: si el widget es invisible, lo que se ve es un botón que no
       hace nada. Viéndolo, se entiende que hay algo comprobándose. */
    trasto = window.turnstile.render(hueco, {
      sitekey: cfg.turnstileSiteKey,
      language: 'es', theme: 'light', size: 'flexible',
      /* El token caduca a los cinco minutos; que el widget lo renueve solo, como
         en el juego, o quien deja la puerta abierta un rato manda uno muerto. */
      'refresh-expired': 'auto',
      callback: function (t) { captcha = t; },
      'expired-callback': function () { captcha = ''; },
      'error-callback': function () { captcha = ''; }
    });
  }

  /** Espera al token en vez de mandar la petición sin él.
      Se mandaba `if (captcha)` y, si todavía no había llegado, salía SIN token
      y Supabase contestaba `captcha_failed`: un fallo que parecía del captcha
      cuando en realidad era prisa nuestra. Turnstile tarda uno o dos segundos
      en pasar en silencio, y el navegador rellena correo y contraseña de golpe.
      Se le dan ocho segundos, que es de sobra, y solo entonces se dice que no. */
  function conElToken() {
    return new Promise(function (listo, no) {
      var hasta = Date.now() + 8000;
      (function mirar() {
        if (captcha) return listo(captcha);
        if (window.turnstile && trasto !== null) {
          var t = window.turnstile.getResponse(trasto);
          if (t) { captcha = t; return listo(t); }
        }
        if (Date.now() > hasta) {
          return no(new Error('El antirrobots no respondió. Recargá la página; si ' +
            'sigue igual, revisá que este dominio esté en la lista del widget de Turnstile.'));
        }
        setTimeout(mirar, 250);
      })();
    });
  }

  /* --- La puerta ------------------------------------------------------------- */
  /* ⚠️ UN INTENTO A LA VEZ, Y EL TOKEN SE GASTA AL MANDARLO (2026-09-19). El log
     de Auth lo enseñó con segundos: 14:54:10 entrada correcta (200) y 14:54:16 el
     MISMO token otra vez, «captcha protection: request disallowed
     (timeout-or-duplicate)». Lo que pasó: la comprobación de admin tardó --el DNS
     de la máquina, 12 s en frío--, en pantalla no se veía nada, el titular pulsó
     Enter otra vez, y el Enter no miraba `disabled`. El segundo intento salió con
     el token que el primero ya había gastado --Turnstile es de UN solo uso--, y
     su `catch` borró la sesión que el primero acababa de conseguir. Cloudflare no
     tuvo nada que ver, y el mensaje lo culpaba a él. */
  var entrando = false;

  function entrar() {
    if (entrando) return;
    var correo = $('#correo').value.trim().toLowerCase();
    var clave = $('#clave').value;
    $('#error').textContent = '';
    if (!correo || !clave) { $('#error').textContent = 'Faltan datos.'; return; }

    entrando = true;
    $('#entrar').disabled = true;
    $('#error').textContent = 'Comprobando que no sos un robot…';
    $('#error').style.color = 'var(--suave)';

    conElToken().then(function (t) {
      /* Gastado: si algo vuelve a llamar a `entrar` tendrá que esperar a uno
         nuevo en vez de mandar este por segunda vez. */
      captcha = '';
      $('#error').textContent = 'Entrando…';
      return fetch(cfg.supabaseUrl + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnon },
        body: JSON.stringify({
          email: correo, password: clave,
          gotrue_meta_security: { captcha_token: t }
        })
      });
    }).then(function (r) { return r.json(); }).then(function (s) {
      if (!s || !s.access_token) {
        var msg = (s && (s.error_description || s.msg)) || 'No se pudo entrar.';
        /* El mensaje de Supabase para esto es «captcha protection: request
           disallowed», que no le dice nada a nadie. Se traduce a lo que de
           verdad hay que hacer. */
        if (s && s.error_code === 'captcha_failed') {
          /* El antirrobots SÍ dio token; lo que pasó es que llegó gastado o
             caducado. Decirlo bien evita que alguien vaya a revisar Cloudflare
             cuando lo que hay que hacer es volver a intentar. */
          msg = 'La verificación antirrobots caducó. Probá otra vez.';
        }
        throw new Error(msg);
      }
      sesion = s;
      try { sessionStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) {}
      $('#error').textContent = 'Comprobando la cuenta…';
      return comprobarQueEsAdmin();
    }).catch(function (e) {
      $('#error').textContent = e.message;
      $('#error').style.color = 'var(--mal)';
      sesion = null;
    }).then(function () {
      /* El token de Turnstile es DE UN SOLO USO y este intento ya lo gastó,
         haya salido bien o mal: se pide uno nuevo para el siguiente. */
      captcha = '';
      if (window.turnstile && trasto !== null) {
        try { window.turnstile.reset(trasto); } catch (x) {}
      }
      entrando = false;
      $('#entrar').disabled = false;
      if (sesion) { $('#error').textContent = ''; $('#error').style.color = 'var(--mal)'; }
    });
  }

  /** Que la cuenta esté en `admins`. Lo dice la BASE, no esta página: se pide la
      fila y si RLS no la devuelve, no es admin. */
  function comprobarQueEsAdmin() {
    return pedir('admins?select=id,nota').then(function (filas) {
      if (!filas || !filas.length) {
        sesion = null;
        try { sessionStorage.removeItem(CLAVE); } catch (e) {}
        $('#error').textContent = 'Esa cuenta existe, pero no es de administración.';
        return;
      }
      $('#puerta').hidden = true;
      $('#tablero').hidden = false;
      $('#quien').textContent = (sesion.user && sesion.user.email) || '';
      pintar();
    });
  }

  /* --- Las pestañas ---------------------------------------------------------- */
  function pintar() {
    document.querySelectorAll('nav button').forEach(function (b) {
      if (b.dataset.pest === pestana) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#lienzo').innerHTML = '<p class="chico">Cargando…</p>';
    ({ costos: verCostos, gente: verGente, partidas: verPartidas,
       material: verMaterial, bitacora: verBitacora, navegadores: verNavegadores,
       llamadas: verLlamadas, modelos: verModelos, limites: verLimites,
       reportes: verReportes })[pestana]();
  }

  /* --- Las llamadas: lo que se pidió, lo que costó y lo que contestó ---------
     Petición del titular (2026-09-15). La pestaña de costos suma; ésta detalla,
     y son dos preguntas distintas: «cuánto llevamos» contra «qué pasó en ESTA
     llamada».

     LOS NÚMEROS SON LOS QUE DEVUELVE LA API, no una estimación nuestra. Vienen
     del `usage` de cada respuesta y se guardan en `consumos` tal cual llegan.
     Por eso las cuatro columnas están separadas: entrada, salida, caché escrita
     y caché leída se facturan a precios distintos —1x, 5x, 1,25x y 0,1x— y
     sumarlas en un solo número escondería justo lo que hay que vigilar. */
  function tokens(n) {
    return n == null ? '<span class="chico">—</span>'
                     : Number(n).toLocaleString('es');
  }

  /* QUÉ REVIVE CADA LATIDO. Los once se llamaban `latido` a secas y la tabla no
     decía cuál era cuál; ahora la operación trae la clave técnica
     —`latido:abogado:kai`— y aquí se traduce a lo que uno buscaría leyendo.
     Si aparece una etiqueta que este mapa no conoce, se enseña cruda: es
     preferible una clave fea a una fila que miente. */
  var QUE_REVIVE = {
    'arbitro:normalizacion': 'Juez Controversia · normalización',
    'arbitro:veredicto':     'Juez Controversia · veredicto',
    'mediador:normalizacion': 'Juez Negociación · normalización',
    'mediador:devolucion':    'Juez Negociación · propuestas',
    'limpieza':               'Sin abogado · limpieza'
  };
  function queRevive(operacion) {
    var resto = String(operacion).slice('latido:'.length);
    if (QUE_REVIVE[resto]) return QUE_REVIVE[resto];
    if (resto.indexOf('abogado:') === 0) {
      var q = resto.slice(8);
      return 'Abogado · ' + q.charAt(0).toUpperCase() + q.slice(1);
    }
    return resto;
  }

  function verLlamadas() {
    Promise.all([
      pedir('consumos?select=id,creado,proveedor,operacion,modelo,tokens_entrada,' +
            'tokens_salida,tokens_cache_escritura,tokens_cache_lectura,ms,ok,error,debate,' +
            'peticion_id&order=creado.desc&limit=150'),
      pedir('llamadas?select=id,consumo'),
      pedir('tarifas?select=modelo,unidad,usd_por_unidad'),
      pedir('latidos?select=*'),
      pedir('ajustes?clave=eq.latido_activo&select=valor,cambiado')
    ]).then(function (r) {
      var filas = r[0], hay = {}, precio = {}, latidos = r[3];
      var activo = ((r[4] || [])[0] || {}).valor === 'si';
      r[1].forEach(function (l) { hay[l.consumo] = l.id; });
      r[2].forEach(function (t) { (precio[t.modelo] = precio[t.modelo] || {})[t.unidad] = Number(t.usd_por_unidad); });

      function cuesta(f) {
        var p = precio[f.modelo];
        if (!p) return null;
        return (f.tokens_entrada || 0) * (p.token_entrada || 0)
             + (f.tokens_salida || 0) * (p.token_salida || 0)
             + (f.tokens_cache_escritura || 0) * (p.token_cache_escritura || 0)
             + (f.tokens_cache_lectura || 0) * (p.token_cache_lectura || 0);
      }

      /* EL LATIDO ARRIBA Y NO ABAJO. Es lo único de esta pantalla que hay que
         mirar sin buscarlo: si el latido murió, la próxima llamada de verdad
         paga la escritura entera y nadie se entera hasta ver la factura. */
      /* EL INTERRUPTOR DEL LATIDO (titular, 2026-09-18: «mantengamos el latido
         vivo y agrégame un control en el tablero que me permita activarlo o
         desactivarlo manualmente»). Va por `latir()`, que exige `es_admin()`:
         desde aquí es un botón; desde la terminal, `sql.py` no pasa esa guarda.
         Lo que cuesta encendido con el juego parado: ~0,015 USD por ronda,
         ~0,40 al día. Apagado, la primera partida de cada hora paga ~0,13 más. */
      var interruptor =
        '<div class="tarjetas"><div class="tarjeta" style="grid-column:1/-1">' +
          '<div class="eti">Latido de la caché</div>' +
          '<div class="dato">' + (activo ? '● Encendido' : '○ Apagado') + '</div>' +
          '<div class="pie">' +
            (activo
              ? 'Cada familia late cuando lleva 50 min sin usarse: ~0,015 USD por ronda, ~0,40 al día parado.'
              : 'Sin latido, la caché muere a la hora y la primera partida de cada hora paga ~0,13 USD más.') +
            ' <button id="b-latido" class="boton" style="margin-left:8px">' +
              (activo ? 'Apagar' : 'Encender') + '</button> ' +
            '<span id="r-latido" class="chico"></span>' +
          '</div>' +
        '</div></div>';

      var cabeza = interruptor + (latidos.length
        ? '<div class="tarjetas">' + latidos.map(function (l) {
            return tarjeta(
              (l.vivo ? '● ' : '○ ') + 'Latido · ' + esc(l.modelo || '—'),
              l.vivo ? 'vivo' : 'MUERTO',
              'último hace ' + esc(String(l.hace || '').slice(0, 8)) +
              ' · ' + (l.en_24h || 0) + ' en 24 h · ' +
              tokens(l.leidos_24h) + ' leídos / ' + tokens(l.escritos_24h) + ' escritos');
          }).join('') + '</div>' +
          (latidos.some(function (l) { return (l.escritos_24h || 0) > 0; })
            ? '<div class="aviso">Algún latido <b>escribió</b> caché en vez de leerla: ' +
              'llegó tarde y la entrada ya había expirado. Si se repite, hay que acortar ' +
              'el intervalo.</div>' : '')
        : '<div class="aviso">Todavía no hay latidos. Sin ellos, la caché del prompt ' +
          'muere a la hora y cada veredicto vuelve a pagar la escritura entera.</div>');

      $('#lienzo').innerHTML = cabeza +
        '<h2>Las últimas 150 llamadas</h2>' +
        '<p class="chico" style="margin-bottom:12px">Los tokens son los que devolvió ' +
        'la API en su <code>usage</code>, no una estimación. <b>Real</b> es lo que se ' +
        'procesó en total; el costo aplica la tarifa de cada tramo.<br>' +
        'Las horas van en <b>' + esc(laZona()) + '</b>, la misma de este navegador, ' +
        'para poder comparar con el registro de Anthropic sin restar nada.</p>' +
        tabla(['Cuándo', 'Operación', 'Modelo', 'Entrada', 'Salida',
               'Caché escr.', 'Caché lect.', 'Real', 'USD', 'ms', ''],
          filas.map(function (f) {
            var real = (f.tokens_entrada || 0) + (f.tokens_salida || 0) +
                       (f.tokens_cache_escritura || 0) + (f.tokens_cache_lectura || 0);
            var c = cuesta(f);
            return [
              fecha(f.creado),
              (String(f.operacion).indexOf('latido:') === 0
                ? '<span class="' + (f.ok ? '' : 'mal') + '">latido</span>' +
                  '<br><span class="pastilla">' + esc(queRevive(f.operacion)) + '</span>'
                : '<span class="' + (f.ok ? '' : 'mal') + '">' + esc(f.operacion) + '</span>') +
                (f.error ? '<br><span class="chico mal">' + esc(String(f.error).slice(0, 80)) + '</span>' : '') +
                /* EL NUMERO DE LA PETICION, que es la columna «ID» del registro
                   de Anthropic. Comparar los dos registros por hora y por
                   tokens no funciona —la hora depende de la zona de cada
                   pantalla y esa consola no cuenta la caché en «tokens de
                   entrada»— y con esto la comparación es buscar una cadena.
                   Se puede copiar de un clic. */
                (f.peticion_id
                  ? '<br><code class="chico copiable" data-copiar="' + esc(f.peticion_id) + '" ' +
                    'title="Copiar para buscarlo en el registro de Anthropic">' +
                    esc(f.peticion_id) + '</code>'
                  : ''),
              '<span class="chico">' + esc(f.modelo || f.proveedor) + '</span>',
              tokens(f.tokens_entrada), tokens(f.tokens_salida),
              /* La escritura en rojo: es la que cuesta 12,5 veces la lectura y
                 la que no debería estar ahí si la caché va bien. */
              (f.tokens_cache_escritura ? '<span class="ojo">' + tokens(f.tokens_cache_escritura) + '</span>'
                                        : tokens(f.tokens_cache_escritura)),
              (f.tokens_cache_lectura ? '<span class="bien">' + tokens(f.tokens_cache_lectura) + '</span>'
                                      : tokens(f.tokens_cache_lectura)),
              '<b>' + tokens(real) + '</b>',
              c == null ? '<span class="chico">—</span>' : usd(c),
              String(f.ms == null ? '—' : f.ms),
              hay[f.id]
                ? '<button class="boton boton--chico" data-detalle="' + hay[f.id] + '">Detalle</button>'
                : '<span class="chico">—</span>'
            ];
          }), [false, false, false, true, true, true, true, true, true, true, false]);

      var bLatido = $('#b-latido');
      if (bLatido) bLatido.addEventListener('click', function () {
        var r = $('#r-latido');
        r.textContent = '…';
        fetch(cfg.supabaseUrl + '/rest/v1/rpc/latir', {
          method: 'POST',
          headers: { apikey: cfg.supabaseAnon, Authorization: 'Bearer ' + sesion.access_token,
                     'Content-Type': 'application/json' },
          body: JSON.stringify({ p_que: activo ? 'no' : 'si' })
        }).then(function (x) {
          if (!x.ok) return x.text().then(function (t) { throw new Error(t.slice(0, 200)); });
          return x.json();
        }).then(function (dicho) {
          r.textContent = String(dicho);
          setTimeout(verLlamadas, 700);
        }).catch(function (e) { r.textContent = 'No se pudo: ' + e.message; });
      });
    }).catch(fallo);
  }

  /* --- El detalle, en dos caras ---------------------------------------------- */
  var loQueSeVe = { peticion: null, respuesta: null };

  /* Colorea sin librería. Se escapa ANTES de meter las etiquetas: si no, un
     JSON con un `<` dentro de una cadena rompe la página, y aquí dentro va
     texto que escribió otra persona. */
  function pintarJson(v) {
    var t = JSON.stringify(v, null, 2) || '';
    return esc(t).replace(
      /("(\\.|[^"\\])*")(\s*:)?|(\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b)|\b(true|false|null)\b/g,
      function (m, cad, _a, dosp, num) {
        if (cad) return '<span class="' + (dosp ? 'j-clave' : 'j-texto') + '">' + cad + '</span>' + (dosp || '');
        if (num) return '<span class="j-num">' + num + '</span>';
        return '<span class="j-bool">' + m + '</span>';
      });
  }

  function pintarCara(cual) {
    document.querySelectorAll('#detalle .pestanas button').forEach(function (b) {
      if (b.dataset.cara === cual) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    var v = loQueSeVe[cual];
    $('#d-cuerpo').innerHTML = v == null
      ? '<span class="chico">No se guardó nada en esta cara.</span>'
      : pintarJson(v);
  }

  function abrirDetalle(id) {
    $('#d-titulo').textContent = 'Cargando…';
    $('#d-cuerpo').textContent = '';
    $('#detalle').setAttribute('data-abierto', '');
    pedir('llamadas?id=eq.' + encodeURIComponent(id) + '&select=id,creado,peticion,respuesta')
      .then(function (f) {
        var l = f[0];
        if (!l) { $('#d-titulo').textContent = 'No está'; return; }
        loQueSeVe = { peticion: l.peticion, respuesta: l.respuesta };
        $('#d-titulo').textContent = 'Llamada ' + l.id + ' · ' + fecha(l.creado);
        pintarCara('peticion');
      })
      .catch(function (e) { $('#d-cuerpo').textContent = 'No se pudo leer: ' + e.message; });
  }

  function cerrarDetalle() { $('#detalle').removeAttribute('data-abierto'); }

  /* --- Qué modelo juzga y qué modelo limpia ----------------------------------
     Petición del titular (2026-09-15), para poder comparar Opus contra Sonnet
     sobre partidas reales sin redesplegar tres funciones cada vez.

     DOS SELECTORES Y NO UNO, porque son dos decisiones distintas. El juez corre
     UNA vez por partida sobre la ronda entera y razona: ahí se va el dinero. El
     abogado corre SEIS veces sobre textos de sesenta palabras y lo que hace es
     formato. Subir el abogado de modelo multiplica por cinco la parte que más
     veces corre, a cambio de una limpieza que Haiku ya hace bien.

     LO QUE SE ELIGE AQUÍ NO ES LO QUE SE CORRIÓ. Cada llamada anota su modelo
     en `consumos.modelo`, y el veredicto guarda el suyo en el expediente. Este
     selector dice qué se usará la próxima vez; la pestaña de costos dice qué se
     usó de verdad. */
  var MODELOS_JUEZ = [
    { id: 'claude-opus-5', nombre: 'Opus 5', entrada: 5, salida: 25,
      nota: 'El de fábrica. Medido: 0,19 USD por veredicto con la caché tibia, ~78 s.' },
    { id: 'claude-sonnet-5', nombre: 'Sonnet 5', entrada: 2, salida: 10,
      nota: '2,5 veces más barato que Opus en los dos sentidos. Sin medir todavía en este juego.' },
    { id: 'claude-haiku-4-5', nombre: 'Haiku 4.5', entrada: 1, salida: 5,
      nota: 'Está para poder probarlo, no para usarlo: la rúbrica son cinco criterios sobre seis intervenciones.' }
  ];
  var MODELOS_ABOGADO = [
    { id: 'claude-haiku-4-5-20251001', nombre: 'Haiku 4.5', entrada: 1, salida: 5,
      nota: 'El de fábrica. Quitar muletillas sin tocar la idea es trabajo de formato.' },
    { id: 'claude-sonnet-5', nombre: 'Sonnet 5', entrada: 2, salida: 10,
      nota: 'El doble de caro, y corre seis veces por partida.' },
    { id: 'claude-opus-5', nombre: 'Opus 5', entrada: 5, salida: 25,
      nota: 'Cinco veces el gasto de la parte que más veces corre.' }
  ];

  function verModelos() {
    Promise.all([
      pedir('ajustes?select=clave,valor,cambiado&order=clave'),
      /* Lo que se usó DE VERDAD, que es lo único que contesta «¿con cuál salió
         este veredicto?». Sin esto el selector diría qué está puesto hoy y nada
         sobre las partidas de ayer. */
      pedir('consumos?select=modelo,operacion,tokens_entrada,tokens_salida,creado' +
            '&proveedor=eq.anthropic&order=creado.desc&limit=400')
    ]).then(function (par) {
      var puesto = {};
      par[0].forEach(function (a) { puesto[a.clave] = a; });
      var uso = {};
      par[1].forEach(function (c) {
        var fam = /^(arbitro|mediador)/.test(c.operacion || '') ? 'juez' : 'abogado';
        var k = fam + '|' + c.modelo;
        uso[k] = uso[k] || { llamadas: 0, entrada: 0, salida: 0, ultima: c.creado };
        uso[k].llamadas++;
        uso[k].entrada += Number(c.tokens_entrada || 0);
        uso[k].salida += Number(c.tokens_salida || 0);
      });

      function selector(clave, lista, titulo, explica) {
        var ahora = (puesto[clave] || {}).valor;
        return '<h2>' + esc(titulo) + '</h2>' +
          '<p class="chico">' + explica + '</p>' +
          '<div class="modelos">' + lista.map(function (m) {
            var u = uso[(clave === 'modelo_juez' ? 'juez' : 'abogado') + '|' + m.id];
            return '<label class="modelo' + (m.id === ahora ? ' modelo--puesto' : '') + '">' +
              '<input type="radio" name="' + esc(clave) + '" value="' + esc(m.id) + '"' +
                (m.id === ahora ? ' checked' : '') + '>' +
              '<b>' + esc(m.nombre) + '</b> ' +
              '<span class="chico">' + m.entrada + ' / ' + m.salida + ' USD por millón</span>' +
              '<div class="chico">' + esc(m.nota) + '</div>' +
              (u ? '<div class="chico">Ya se usó: ' + u.llamadas + ' llamada' +
                   (u.llamadas === 1 ? '' : 's') + ', ' +
                   (u.entrada + u.salida).toLocaleString('es') + ' tokens.</div>' : '') +
            '</label>';
          }).join('') + '</div>' +
          (puesto[clave] ? '<p class="chico">Puesto el ' + fecha(puesto[clave].cambiado) + '.</p>' : '');
      }

      $('#lienzo').innerHTML =
        '<div class="aviso">Lo que se elija aquí vale <b>desde la próxima llamada</b>: las tres ' +
        'funciones leen este ajuste al empezar cada petición, así que no hay que desplegar nada. ' +
        'Una partida que ya se está jugando termina con el modelo que tenía.</div>' +

        selector('modelo_juez', MODELOS_JUEZ, 'El juez',
          'El árbitro de Controversia y el mediador de Negociación. Corre <b>una vez por ' +
          'partida</b> sobre la ronda entera, con razonamiento. Es donde se va el dinero.') +

        selector('modelo_abogado', MODELOS_ABOGADO, 'El abogado',
          'La limpieza y el abogado de cada turno. Corre <b>seis veces por partida</b> sobre ' +
          'textos de sesenta palabras, y lo que hace es formato: quitar muletillas sin tocar ' +
          'la idea.') +

        '<div class="aviso"><b>La caché es de cada modelo.</b> El prompt del árbitro son ~6.100 ' +
        'tokens y va en caché; al cambiar de modelo esa caché no se hereda, así que la primera ' +
        'llamada después de cambiar se paga en frío aunque el prompt sea idéntico. Probar un ' +
        'modelo con una sola partida sale más caro por llamada que correr varias seguidas.</div>' +

        '<p><button id="b-modelos" class="boton">Guardar</button> ' +
        '<span id="r-modelos" class="chico"></span></p>';

      $('#b-modelos').addEventListener('click', function () {
        var juez = document.querySelector('input[name="modelo_juez"]:checked');
        var abo = document.querySelector('input[name="modelo_abogado"]:checked');
        var aviso = $('#r-modelos');
        aviso.textContent = 'Guardando…';
        Promise.all([
          guardar('ajustes?clave=eq.modelo_juez',
                  { valor: juez.value, cambiado: new Date().toISOString() }),
          guardar('ajustes?clave=eq.modelo_abogado',
                  { valor: abo.value, cambiado: new Date().toISOString() })
        ]).then(function () {
          aviso.textContent = 'Guardado. Vale desde la próxima llamada.';
          setTimeout(verModelos, 900);
        }).catch(function (e) {
          aviso.textContent = 'No se pudo guardar: ' + e.message;
        });
      });
    }).catch(fallo);
  }

  function fallo(e) {
    $('#lienzo').innerHTML = '<div class="aviso">No se pudo leer: ' + esc(e.message) + '</div>';
  }

  /* --- COSTOS ---------------------------------------------------------------- */
  function verCostos() {
    Promise.all([
      pedir('costos?select=*&order=creado.desc&limit=300'),
      pedir('tarifas?select=*&order=proveedor,unidad')
    ]).then(function (r) {
      var c = r[0], tarifas = r[1];
      var total = 0, porProveedor = {}, fallidas = 0, sinTarifa = 0;
      var hoy = new Date().toISOString().slice(0, 10);
      var deHoy = 0;
      c.forEach(function (f) {
        var v = Number(f.usd || 0);
        total += v;
        if (String(f.creado).slice(0, 10) === hoy) deHoy += v;
        if (!f.ok) fallidas++;
        if (f.sin_tarifa) sinTarifa++;
        var k = f.proveedor + ' · ' + f.operacion;
        porProveedor[k] = porProveedor[k] || { usd: 0, n: 0, ms: 0 };
        porProveedor[k].usd += v;
        porProveedor[k].n++;
        porProveedor[k].ms += Number(f.ms || 0);
      });

      var avisos = '';
      if (sinTarifa) {
        avisos += '<div class="aviso"><b>' + sinTarifa + ' llamadas sin tarifa.</b> ' +
          'Están contando como cero, así que el total de abajo es MENOR que el real. ' +
          'Falta el precio de ese proveedor y modelo en la tabla de tarifas.</div>';
      }
      if (tarifas.some(function (t) { return !t.verificado; })) {
        avisos += '<div class="aviso"><b>Hay tarifas sin verificar.</b> Las de locución ' +
          'son estimaciones: la investigación de mercado nunca miró precios de TTS. ' +
          'Los importes son orientativos hasta comprobarlas.</div>';
      }

      $('#lienzo').innerHTML = avisos +
        '<div class="tarjetas">' +
          tarjeta('Gastado en total', usd(total), c.length + ' llamadas registradas') +
          tarjeta('Hoy', usd(deHoy), '') +
          tarjeta('Por partida', c.length ? usd(total / Math.max(1, contarDebates(c))) : '$0', 'promedio') +
          tarjeta('Llamadas fallidas', String(fallidas),
                  fallidas ? 'se facturan igual' : 'ninguna') +
        '</div>' +

        '<h2>Por servicio</h2>' +
        tabla(['Servicio', 'Llamadas', 'Tiempo medio', 'Gastado', '% del total'],
          Object.keys(porProveedor).sort(function (a, b) {
            return porProveedor[b].usd - porProveedor[a].usd;
          }).map(function (k) {
            var d = porProveedor[k];
            return ['<span class="pastilla">' + esc(k) + '</span>',
                    d.n, Math.round(d.ms / d.n) + ' ms', usd(d.usd),
                    total ? (d.usd / total * 100).toFixed(1) + '%' : '—'];
          }), [false, true, true, true, true]) +

        '<h2>Últimas llamadas</h2>' +
        tabla(['Cuándo', 'Servicio', 'Unidades', 'Tardó', 'Costo', ''],
          c.slice(0, 60).map(function (f) {
            return [fecha(f.creado),
                    esc(f.proveedor) + ' · ' + esc(f.operacion),
                    unidades(f),
                    (f.ms || 0) + ' ms',
                    usd(f.usd),
                    f.ok ? '' : '<span class="mal" title="' + esc(f.error || '') + '">falló</span>'];
          }), [false, false, false, true, true, false]);
    }).catch(fallo);
  }

  function contarDebates(filas) {
    var s = {};
    filas.forEach(function (f) { if (f.debate) s[f.debate] = 1; });
    return Object.keys(s).length || 1;
  }

  function unidades(f) {
    var p = [];
    if (f.segundos) p.push(Number(f.segundos).toFixed(1) + ' s de audio');
    if (f.tokens_entrada) p.push(f.tokens_entrada + ' tok. entrada');
    if (f.tokens_salida) p.push(f.tokens_salida + ' tok. salida');
    if (f.caracteres) p.push(f.caracteres + ' caracteres');
    if (f.bytes) p.push((f.bytes / 1024).toFixed(0) + ' KB');
    return p.join(' · ') || '—';
  }

  /* --- GENTE ----------------------------------------------------------------- */
  function verGente() {
    Promise.all([
      pedir('perfiles?select=*&order=creado.desc'),
      pedir('debates?select=id,propone,creado,modo,estado'),
      pedir('costos?select=perfil,usd'),
      pedir('admins?select=id')
    ]).then(function (r) {
      var gente = r[0], debates = r[1], costos = r[2];
      /* TODA CUENTA DE ADMIN ES TAMBIEN UNA DE JUGADOR: el disparador del alta
         crea un perfil para cada usuario nuevo y no puede saber para qué se hizo
         la cuenta. Contarlas como jugadores infla la cifra, así que se separan.
         No se les quita el perfil: la misma persona puede querer jugar. */
      var admins = {};
      (r[3] || []).forEach(function (a) { admins[a.id] = true; });
      var jugadores = gente.filter(function (p) { return !admins[p.id]; });
      var porPersona = {};
      debates.forEach(function (d) {
        porPersona[d.propone] = porPersona[d.propone] || { partidas: 0, usd: 0 };
        porPersona[d.propone].partidas++;
      });
      costos.forEach(function (c) {
        if (!c.perfil) return;
        porPersona[c.perfil] = porPersona[c.perfil] || { partidas: 0, usd: 0 };
        porPersona[c.perfil].usd += Number(c.usd || 0);
      });

      $('#lienzo').innerHTML =
        '<div class="tarjetas">' +
          tarjeta('Jugadores', String(jugadores.length),
                  Object.keys(admins).length + ' de administración aparte') +
          tarjeta('Partidas', String(debates.length), '') +
        '</div>' +
        '<h2>Cuentas</h2>' +
        tabla(['Nombre', 'Personaje', 'Nivel', 'Partidas', 'Gastado', 'Alta', 'Id', ''],
          gente.map(function (p) {
            var d = porPersona[p.id] || { partidas: 0, usd: 0 };
            return [esc(p.nombre || '—') +
                      (admins[p.id] ? ' <span class="pastilla">admin</span>' : ''),
                    esc(p.avatar || '—'),
                    p.nivel,
                    d.partidas,
                    usd(d.usd),
                    fecha(p.creado),
                    '<span class="chico">' + esc(String(p.id).slice(0, 8)) + '</span>',
                    /* BORRAR UNA CUENTA ENTERA, solo el super admin y nunca la
                       propia (titular, 2026-09-19). El boton solo se pinta si
                       quien mira es el super admin; la funcion de borde lo
                       vuelve a comprobar con el JWT, que es lo que manda. */
                    (esSuperAdmin() && p.id !== (sesion.user && sesion.user.id)
                      ? '<button class="peligro" data-borrar-cuenta="' + esc(p.id) +
                        '" data-apodo="' + esc(p.nombre || '') + '">Borrar</button>'
                      : '')];
          }), [false, false, true, true, true, false, false, false]) +
        '<p class="chico" style="margin-top:10px"><b>Borrar</b> se lleva la cuenta entera: ' +
        'sus partidas —también del historial de quien jugó con ella—, los audios de esas ' +
        'partidas, sus temas, sus vidas y la cuenta de acceso. No se deshace. Los consumos ' +
        'se quedan sin nombre, para que la factura cuadre.</p>' +
        '<p class="chico" style="margin-top:10px">El gasto por persona solo cuenta lo que ' +
        'se pudo atribuir: el invitado de una partida local no tiene cuenta, así que su ' +
        'consumo cuelga de quien la creó.</p>';
    }).catch(fallo);
  }

  var SUPER_ADMIN = 'leoncitobravo2013@gmail.com';   // el mismo que app.js y borrar_cuenta
  function esSuperAdmin() {
    var c = sesion && sesion.user && sesion.user.email;
    return String(c || '').trim().toLowerCase() === SUPER_ADMIN;
  }

  /* Se confirma escribiendo el apodo: un «¿seguro?» se acepta sin leer, y esto
     no se deshace. `prompt` nativo, que aqui no hay globos y es una pantalla
     del titular. */
  function borrarCuenta(id, apodo) {
    var escrito = window.prompt('Vas a borrar la cuenta «' + apodo + '» con TODO lo suyo, ' +
      'también las partidas que otros jugaron con ella. No se deshace.\n\n' +
      'Escribe el apodo tal cual para confirmar:');
    if (escrito === null) return;
    if (String(escrito).trim().toLowerCase() !== String(apodo).trim().toLowerCase()) {
      window.alert('El apodo no coincide. No se borró nada.');
      return;
    }
    var b = document.querySelector('[data-borrar-cuenta="' + id + '"]');
    if (b) { b.disabled = true; b.textContent = 'Borrando…'; }
    fetch(cfg.supabaseUrl + '/functions/v1/borrar_cuenta', {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnon,
        Authorization: 'Bearer ' + sesion.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ perfil: id })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j || !x.j.borrada) throw new Error((x.j && x.j.error) || 'no se pudo borrar');
        window.alert('Cuenta «' + (x.j.apodo || apodo) + '» borrada: ' + x.j.partidas +
          ' partida(s) y ' + x.j.audios + ' audio(s).');
        pintar();
      }).catch(function (e) {
        window.alert('No se borró: ' + e.message);
        if (b) { b.disabled = false; b.textContent = 'Borrar'; }
      });
  }

  /* --- REPORTES ---------------------------------------------------------------
     Lo que alguien denuncio de otra cuenta (migracion 0071). Un reporte que no
     lee nadie es teatro, asi que tiene su pestana desde el primer dia. Lo sin
     ver sale arriba --lo ordena la funcion-- y se marca con un toque.
     EL CONTEXTO LO PUSO EL SERVIDOR, no quien reporta: es el ultimo enunciado
     que la persona reportada le mando. Es lo que hay que poder leer para
     decidir, y no se puede falsear desde el cliente. */
  function verReportes() {
    pedir('rpc/reportes_del_tablero').then(function (filas) {
      var sinVer = filas.filter(function (f) { return !f.visto; }).length;
      $('#lienzo').innerHTML =
        '<div class="tarjetas">' +
          tarjeta('Sin revisar', String(sinVer), '') +
          tarjeta('En total', String(filas.length), '') +
        '</div>' +
        (filas.length
          ? tabla(['Cuándo', 'Quién reporta', 'A quién', 'Motivo', 'Lo que contó', 'Lo que le mandaron', ''],
              filas.map(function (f) {
                return [fecha(f.creado),
                        esc(f.de),
                        esc(f.reportado) + '<br><span class="chico">' + esc(String(f.reportado_id).slice(0, 8)) + '</span>',
                        '<span class="pastilla">' + esc(f.motivo) + '</span>',
                        f.texto ? esc(f.texto) : '<span class="chico">—</span>',
                        f.contexto ? '«' + esc(f.contexto) + '»' : '<span class="chico">—</span>',
                        f.visto
                          ? '<span class="chico">revisado</span>'
                          : '<button class="boton boton--chico" data-visto-reporte="' + f.id + '">Marcar revisado</button>'];
              }), [false, false, false, false, false, false, false])
          : '<p class="chico">Nadie ha reportado a nadie.</p>') +
        '<p class="chico" style="margin-top:10px">Para actuar sobre una cuenta reportada, ' +
        'la pestaña <b>Gente</b> tiene el borrado. Bloquear es de cada persona y no se hace desde aquí.</p>';
    }).catch(fallo);
  }

  function marcarReporteVisto(id) {
    guardar('reportes?id=eq.' + encodeURIComponent(id), { visto: new Date().toISOString() })
      .then(function () { pintar(); })
      .catch(function (e) { window.alert('No se pudo marcar: ' + e.message); });
  }

  /* --- PARTIDAS -------------------------------------------------------------- */
  function verPartidas() {
    Promise.all([
      pedir('debates?select=*&order=creado.desc&limit=100'),
      pedir('turnos?select=debate,orden,segundos,voz_ruta'),
      pedir('costos?select=debate,usd')
    ]).then(function (r) {
      var debates = r[0], turnos = r[1], costos = r[2];
      var porDebate = {};
      turnos.forEach(function (t) {
        porDebate[t.debate] = porDebate[t.debate] || { turnos: 0, seg: 0, conVoz: 0, usd: 0 };
        porDebate[t.debate].turnos++;
        porDebate[t.debate].seg += Number(t.segundos || 0);
        if (t.voz_ruta) porDebate[t.debate].conVoz++;
      });
      costos.forEach(function (c) {
        if (!c.debate) return;
        porDebate[c.debate] = porDebate[c.debate] || { turnos: 0, seg: 0, conVoz: 0, usd: 0 };
        porDebate[c.debate].usd += Number(c.usd || 0);
      });

      $('#lienzo').innerHTML =
        '<h2>Partidas</h2>' +
        tabla(['Cuándo', 'Modo', 'Tema', 'Con quién', 'Turnos', 'Audio', 'Con voz', 'Costo'],
          debates.map(function (d) {
            var x = porDebate[d.id] || { turnos: 0, seg: 0, conVoz: 0, usd: 0 };
            return [fecha(d.creado),
                    '<span class="pastilla">' + esc(d.modo) + '</span>',
                    '<span class="chico">' + esc(String(d.enunciado || '').slice(0, 70)) + '…</span>',
                    esc(d.invitado_nombre || 'partida remota'),
                    x.turnos + '/' + (d.turnos * 2),
                    Math.round(x.seg) + ' s',
                    x.conVoz === x.turnos && x.turnos
                      ? '<span class="bien">todos</span>'
                      : '<span class="ojo">' + x.conVoz + '/' + x.turnos + '</span>',
                    usd(x.usd)];
          }), [false, false, false, false, true, true, false, true]);
    }).catch(fallo);
  }

  /* --- MATERIAL --------------------------------------------------------------
     Lo que sale del circuito: qué se oyó, qué se limpió y con qué voz se dijo.
     Los dos textos VAN JUNTOS a propósito. El literal y el guion separados en
     dos pantallas no sirven de nada: lo único que importa mirar es si la
     limpieza le cambió algo a alguien, y eso solo se ve comparándolos. */
  function verMaterial() {
    pedir('turnos?select=*&order=creado.desc&limit=40').then(function (t) {
      if (!t.length) {
        $('#lienzo').innerHTML = '<div class="aviso">Todavía no hay turnos grabados.</div>';
        return;
      }
      $('#lienzo').innerHTML =
        '<h2>Lo que se dijo y lo que se locutó</h2>' +
        '<p class="chico" style="margin-bottom:12px">Izquierda: lo que oyó el transcriptor, ' +
        'literal. Derecha: el guion que leyó el personaje. Si la limpieza le cambió la idea ' +
        'a alguien, se ve aquí.</p>' +
        tabla(['Cuándo', 'Quién', 'Literal', 'Guion locutado', 'Voz'],
          t.map(function (f) {
            var cambio = (f.transcripcion || '') !== (f.guion || '');
            return [fecha(f.creado),
                    esc(f.nombre || '—') + ' <span class="chico">(' + esc(f.avatar || '?') + ')</span>',
                    '<pre>' + esc(f.transcripcion || '—') + '</pre>',
                    '<pre>' + esc(f.guion || '—') + '</pre>' +
                      (cambio ? '' : '<span class="chico">sin cambios</span>'),
                    f.voz_ruta
                      ? '<span class="bien">sí</span><br><span class="chico">' +
                        esc(String(f.voz_modelo || '').replace('azure:', '')) + '</span>'
                      : '<span class="mal">no</span>'];
          }), [false, false, false, false, false]);
    }).catch(fallo);
  }

  /* --- BITÁCORA ---------------------------------------------------------------
     QUÉ SALIÓ Y QUÉ NO, en una sola lista (petición del titular, 2026-09-15:
     «debemos tener una consola de errores... log de veredictos y errores»).

     Y LOS ACIERTOS VAN AL LADO DE LOS FALLOS a propósito. Un log que solo
     enseña lo roto no deja contestar la única pregunta que importa —¿esto pasa
     mucho?—: tres fallos son una catástrofe si hubo cinco veredictos y ruido de
     fondo si hubo doscientos. La proporción está arriba.

     Tres fuentes, y la vista `bitacora` (migración 0029) las une donde ya
     viven: `sucesos` --lo que no deja rastro en ningún otro sitio--, los
     `consumos` con `ok=false` --las llamadas de pago que fallaron, que estaban
     anotadas y nadie miraba-- y `resultados` --los veredictos emitidos--. */
  function verBitacora() {
    pedir('bitacora?order=creado.desc&limit=200').then(function (f) {
      if (!f.length) {
        $('#lienzo').innerHTML = '<div class="aviso">La bitácora está vacía. Se llena ' +
          'sola: cada veredicto que sale, cada llamada de pago que falla y cada vez ' +
          'que a alguien no le llega la respuesta.</div>';
        return;
      }
      var malos  = f.filter(function (x) { return x.nivel === 'error'; });
      var jueces = f.filter(function (x) { return x.suceso.indexOf('veredicto_') === 0 &&
                                                  x.nivel === 'nota'; });
      /* LAS DOS QUE SE MIRAN PRIMERO, y las dos salen de la pregunta del
         titular: cuántas rondas se quedaron esperando el veredicto, y cuántas
         de ésas se fueron de la app sin él. La segunda es la que no tiene
         arreglo desde el navegador: si nadie vuelve, ese veredicto no llega
         nunca, porque quien lo pedía era la pestaña. */
      var esperando = f.filter(function (x) { return x.suceso === 'veredicto_no_llego'; }).length;
      var idas = f.filter(function (x) { return x.suceso === 'ronda_abandonada_esperando'; }).length;

      $('#lienzo').innerHTML =
        '<h2>Bitácora</h2>' +
        '<div class="tarjetas">' +
          tarjeta('Veredictos emitidos', String(jueces.length), 'de las tres fuentes') +
          tarjeta('Fallos', String(malos.length),
                  f.length ? Math.round(malos.length / f.length * 100) + ' % de lo anotado' : '') +
          tarjeta('Rondas sin respuesta', String(esperando), 'se ofreció reintentar') +
          tarjeta('Se fueron esperando', String(idas), 'sin veredicto y sin nadie pidiéndolo') +
        '</div>' +
        (idas
          ? '<div class="aviso"><b>' + idas + ' ronda(s) se quedaron sin veredicto y ' +
            'nadie las está pidiendo.</b> La petición la hace el navegador, así que al ' +
            'cerrar la app no queda nadie preguntando, y el historial no ofrece volver ' +
            'a pedirlo. Hasta que el trabajo se encole en el servidor, esto es lo único ' +
            'que las señala.</div>'
          : '') +
        '<p class="chico" style="margin-bottom:12px">Lo último arriba. ' +
        'Las últimas 200 anotaciones.</p>' +
        tabla(['Cuándo', 'Origen', 'Qué pasó', 'Detalle', 'Partida', 'ms'],
          f.map(function (x) {
            var clase = x.nivel === 'error' ? 'mal' : x.nivel === 'aviso' ? '' : 'bien';
            return [fecha(x.creado),
                    esc(x.origen),
                    '<span class="' + clase + '">' + esc(x.suceso) + '</span>',
                    '<pre>' + esc(x.detalle || '—') + '</pre>' +
                      (x.datos ? '<span class="chico">' +
                        esc(JSON.stringify(x.datos).slice(0, 160)) + '</span>' : ''),
                    x.debate ? '<span class="chico">' + esc(String(x.debate).slice(0, 8)) +
                               '</span>' : '—',
                    x.ms == null ? '—' : String(x.ms)];
          }), [false, false, false, false, false, true]);
    }).catch(fallo);
  }

  /* --- NAVEGADORES -----------------------------------------------------------
     «¿Funciona en todos los navegadores?» contestado con datos y no con una
     lista de memoria. Cada navegador graba a su manera --Chrome WebM con Opus,
     Safari MP4 con AAC, Firefox puede mandar Ogg-- y cada versión puede cambiar
     de idea. Esto enseña qué mandó cada uno DE VERDAD y si sirvió. */
  function verNavegadores() {
    pedir('compatibilidad?select=*').then(function (f) {
      if (!f.length) {
        $('#lienzo').innerHTML = '<div class="aviso">Todavía no se grabó nada. ' +
          'Esta tabla se llena sola: cada grabación anota con qué navegador y en ' +
          'qué formato se hizo, y si el transcriptor la aceptó.</div>';
        return;
      }
      var rotos = f.filter(function (x) { return Number(x.rechazadas) > 0; });
      var avisos = rotos.length
        ? '<div class="aviso"><b>' + rotos.length + ' combinación(es) con rechazos.</b> ' +
          'Ese navegador está grabando en un formato que no pasa. Es lo que hay ' +
          'que convertir o pedir de otra manera.</div>'
        : '<div class="aviso">Ningún formato rechazado hasta ahora. Ojo: eso vale ' +
          'para los navegadores que aparecen abajo, no para los que todavía no ' +
          'probó nadie.</div>';

      $('#lienzo').innerHTML = avisos +
        '<h2>Qué graba cada navegador</h2>' +
        tabla(['Navegador', 'Formato que eligió', 'Grabaciones', 'Aceptadas',
               'Rechazadas', 'Con voz', 'Duración media', 'Bitrate real', 'Última'],
          f.map(function (x) {
            var mal = Number(x.rechazadas) > 0;
            return [esc(x.navegador),
                    '<span class="chico">' + esc(x.mime) + '</span>',
                    x.grabaciones,
                    '<span class="bien">' + x.aceptadas + '</span>',
                    mal ? '<span class="mal">' + x.rechazadas + '</span>' : '0',
                    x.con_voz,
                    (x.segundos_medios || '—') + ' s',
                    /* El bitrate delata a un navegador que ignoró
                       `audioBitsPerSecond`: si sale muy por encima de 33 kbps,
                       está grabando a su antojo y subiendo de más. */
                    (x.kbps_medios
                      ? (Number(x.kbps_medios) > 60
                          ? '<span class="ojo">' + x.kbps_medios + ' kbps</span>'
                          : x.kbps_medios + ' kbps')
                      : '—'),
                    '<span class="chico">' + fecha(x.ultima) + '</span>'];
          }), [false, false, true, true, true, true, true, true, false]) +

        '<p class="chico" style="margin-top:12px">El bitrate debería rondar los ' +
        '33 kbps (48 en Safari, que graba AAC). Muy por encima significa que ese ' +
        'navegador ignoró el bitrate que se le pidió y está subiendo de más.</p>';
    }).catch(fallo);
  }

  /* --- LÍMITES ---------------------------------------------------------------
     Hasta dónde se puede gastar. Los saldos de verdad viven en cada proveedor y
     no se pueden leer desde aquí sin meter sus claves en el navegador, que es
     justo lo que no se hace nunca. Así que esto es lo que SE SABE, con su
     fuente, y dice claramente qué hay que ir a mirar a mano. */
  /* --- Los topes: verlos venir con meses de margen --------------------------
     Petición del titular (2026-09-15). La pestaña enseñaba lo gastado por
     proveedor y un párrafo con los límites escritos a mano —que además eran los
     del plan gratuito y estaban mal—. Eso contesta «cuánto llevamos» y no
     contesta la única pregunta que importa aquí: **¿cuánto falta para que algo
     se rompa, y qué hago cuando falte poco?**

     EN EL PLAN PRO EL TOPE DE GASTO VIENE ACTIVADO DE FÁBRICA: al pasarse no se
     cobra de más, se BLOQUEA. Una base que deja de aceptar escrituras con la
     partida de alguien a medias es peor que una factura sorpresa, y llega sin
     avisar. De ahí que cada barra traiga su plan de acción escrito ANTES de
     hacer falta: el día que haga falta, nadie está para investigar. */
  var PANEL_USO = 'https://supabase.com/dashboard/project/vauarfofsfgwnuyjfpni/settings/billing/usage';
  var COMO_SE_ARREGLA = {
    almacen: {
      cuando: 'Cuando pase del 70 % (70 GB ≈ 260.000 partidas)',
      pasos: [
        'Mirar primero si son audios que <b>ya deberían haberse borrado</b>: ' +
          '<code>select count(*) from turnos where audio_caduca &lt; now()</code>. ' +
          'Si son muchos, correr el borrado de caducados y volver a medir.',
        'Si el almacén es de verdad, mover los audios a <b>Cloudflare R2</b>: cuesta ' +
          '$0,015/GB y <b>el egress es gratis</b>, que es lo que de verdad crece en una ' +
          'app donde el contenido se reproduce.',
        'Migrar toca tres sitios: la subida en <code>turno</code>, el borrado en ' +
          '<code>olvidar</code> y las URLs firmadas de la reproducción.'
      ],
      enlaces: [['Precios de R2', 'https://developers.cloudflare.com/r2/pricing/']]
    },
    base: {
      cuando: 'Cuando pase del 70 % (5,6 GB)',
      pasos: [
        'Casi todo es <code>llamadas</code>, los JSON de auditoría. Bajar la retención: ' +
          '<code>select public.limpiar_llamadas(3)</code> y cambiar el cron.',
        'Comprobar qué tabla pesa de verdad: <code>select relname, pg_size_pretty(' +
          'pg_total_relation_size(relid)) from pg_statio_user_tables order by ' +
          'pg_total_relation_size(relid) desc limit 10</code>.',
        'Si no es <code>llamadas</code>, subir el disco desde el panel antes de llegar al ' +
          'tope: $0,125 por GB extra.'
      ],
      enlaces: [['Panel de uso', 'PANEL']]
    },
    azure: {
      cuando: 'Cuando pase del 70 % (350.000 caracteres en el mes)',
      pasos: [
        '<b>Verificar primero el cupo y la tarifa</b>, que están sin comprobar desde el ' +
          'primer día: si el recurso está en nivel S0 y no F0, no hay cupo gratuito y se ' +
          'cobra desde el primer carácter. Se ve en el recurso de Speech, en ' +
          '<b>Pricing tier</b>.',
        'Si el cupo es real y se agota: subir a S0 y pagar por carácter, o dejar de ' +
          'locutar al abogado hasta el mes siguiente.',
        /* ⚠️ DOS SITIOS DISTINTOS, Y NO DAN EL MISMO NÚMERO (titular, 2026-09-19,
           al preguntar si Cost Management era el sitio). Lo que esta barra mide
           son CARACTERES, y Cost Management enseña DÓLARES: los caracteres solo
           salen en las métricas del recurso (`Synthesized Characters`). El de
           dinero sirve para lo otro que esta ficha dice sin comprobar --si hay
           cupo gratis o si se está cobrando desde el primer carácter--: si en
           Cost Management aparece gasto de Speech, el nivel es S0 y el cupo de
           0,5 M no existe. */
        '<b>Los caracteres y el dinero se miran en sitios distintos</b>: esta barra cuenta ' +
          'caracteres y sale de lo que anotamos nosotros; el portal los enseña en las ' +
          'métricas del recurso. En Cost Management solo hay dólares — y eso responde la ' +
          'otra pregunta: <b>si ahí aparece gasto de Speech, el recurso no es gratuito</b> ' +
          'y el cupo de 0,5 M de esta ficha no existe.'
      ],
      /* Sin el id de suscripción en la URL: esta página se publica en atwi.app y
         no hay por qué dejar ahí un identificador de la cuenta de Azure. Sin
         `scope`, el portal abre con la suscripción de quien entra. */
      enlaces: [['Caracteres (métricas del recurso)', 'https://portal.azure.com/#browse/Microsoft.CognitiveServices%2Faccounts'],
                ['Gasto (Cost Management)', 'https://portal.azure.com/#view/Microsoft_Azure_CostManagement/Menu/~/costanalysis'],
                ['Precios de Azure Speech', 'https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/']]
    },
    invocaciones: {
      cuando: 'Cuando pase del 70 % (1,4 M en el mes)',
      pasos: [
        'Mirar cuánto se lleva el latido: 3 invocaciones por ronda y hasta ~26 rondas al ' +
          'día, o sea unas 2.300 al mes. Si es una parte grande del total, subir ' +
          '<code>ajustes.latido_minutos</code> o apagarlo.',
        'Este número es <b>estimado por lo bajo</b>: no cuenta las invocaciones que ' +
          'fallaron antes de anotar nada. El real está en el panel.'
      ],
      enlaces: [['Panel de uso', 'PANEL']]
    },
    deepgram: {
      cuando: 'Cuando pase del 70 % (140 de los 200 USD)',
      pasos: [
        'Este crédito <b>no se renueva</b>. Al agotarse, sin tarjeta las transcripciones ' +
          'fallan y <b>no se puede cerrar ningún turno</b>.',
        'Poner método de pago antes de llegar, y comprobar el precio por minuto entonces: ' +
          'el que usamos se verificó en septiembre de 2026.'
      ],
      enlaces: [['Consola de Deepgram', 'https://console.deepgram.com/usage'],
                ['Facturación de Deepgram', 'https://console.deepgram.com/billing']]
    },
    anthropic: {
      cuando: 'Siempre: es prepago y no hay cupo que avise',
      pasos: [
        'Sin saldo las llamadas fallan y <b>el juego deja de dar veredictos</b>. La ronda ' +
          'no se pierde —se queda en deliberando y ofrece reintentar— pero nadie recibe ' +
          'resultado hasta recargar.',
        'Activar el aviso de saldo bajo en la consola: es lo único que avisa.',
        'A ~$0,13 la partida de Controversia, 20 USD dan para unas 150 partidas.'
      ],
      enlaces: [['Facturación de Anthropic', 'https://console.anthropic.com/settings/billing'],
                ['Uso por día', 'https://console.anthropic.com/settings/usage']]
    },
    egress: {
      cuando: 'No se puede medir desde aquí: hay que mirarlo en el panel',
      pasos: [
        'Cada reproducción de una partida entera son ~282 KB. Con 250 GB al mes caben ' +
          '~931.000 reproducciones.',
        'Si se acerca, la solución es la del almacén: <b>R2, con egress gratis</b>. Es el ' +
          'motivo principal para migrar, más que el precio del disco.'
      ],
      enlaces: [['Panel de uso', 'PANEL']]
    }
  };

  function pesa(n) {
    n = Number(n || 0);
    var u = ['B', 'kB', 'MB', 'GB', 'TB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(n < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
  }
  function cantidad(v, unidad) {
    if (unidad === 'bytes') return pesa(v);
    if (unidad === 'USD') return usd(v);
    return Number(v || 0).toLocaleString('es');
  }

  function verLimites() {
    pedir('topes?select=*').then(function (filas) {
      /* El orden lo decide lo cerca que está cada uno, no el alfabeto: lo que
         está a punto de romperse sale arriba sin buscarlo. */
      filas.forEach(function (f) {
        f.pct = Number(f.tope) > 0 ? Number(f.usado) / Number(f.tope) * 100 : null;
      });
      filas.sort(function (a, b) {
        return (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct);
      });
      var alertas = filas.filter(function (f) { return f.pct != null && f.pct >= 70; });

      $('#lienzo').innerHTML =
        (alertas.length
          ? '<div class="aviso"><b>' + alertas.length + ' tope(s) por encima del 70 %.</b> ' +
            'En el plan Pro el límite de gasto viene activado de fábrica: al pasarse no se ' +
            'cobra de más, <b>se bloquea</b>. Abajo está qué hacer en cada caso.</div>'
          : '<div class="aviso">Ningún tope por encima del 70 %. El <b>egress</b> y el ' +
            '<b>saldo de Anthropic</b> no se pueden leer desde aquí: esos hay que mirarlos ' +
            'en su panel, y por eso salen sin barra.</div>') +

        filas.map(function (f) {
          var pct = f.pct;
          var estado = pct == null ? 'nd' : pct >= 90 ? 'mal' : pct >= 70 ? 'ojo' : 'bien';
          var g = COMO_SE_ARREGLA[f.clave] || { cuando: '', pasos: [], enlaces: [] };
          return '<div class="tope tope--' + estado + '">' +
            '<div class="tope__cab">' +
              '<b>' + esc(f.titulo) + '</b> ' +
              '<span class="pastilla">' + esc(f.fiabilidad) + '</span>' +
              '<span class="tope__cifra">' +
                (pct == null
                  ? '<span class="chico">no medible aquí</span>'
                  : cantidad(f.usado, f.unidad) + ' de ' + cantidad(f.tope, f.unidad) +
                    ' · <b>' + (pct < 0.01 ? '&lt;0,01' : pct.toFixed(2)) + ' %</b>') +
              '</span>' +
            '</div>' +
            (pct == null ? ''
              : '<div class="barra"><i style="width:' +
                Math.max(0.4, Math.min(100, pct)) + '%"></i></div>') +
            '<div class="chico">' + f.nota + '</div>' +
            /* El plan de acción se despliega solo cuando hace falta, pero está
               escrito siempre: se puede leer con calma un día tranquilo, que es
               cuando hay que leerlo. */
            '<details class="tope__que"' + (estado === 'mal' || estado === 'ojo' ? ' open' : '') + '>' +
              '<summary>Qué hacer · ' + esc(g.cuando) + '</summary>' +
              '<ol>' + g.pasos.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
              (g.enlaces || []).map(function (e) {
                var url = e[1] === 'PANEL' ? PANEL_USO : e[1];
                return '<a class="chico" href="' + esc(url) + '" target="_blank" ' +
                       'rel="noopener noreferrer">' + esc(e[0]) + ' ↗</a> ';
              }).join('') +
            '</details>' +
          '</div>';
        }).join('') +

        '<p class="chico">Topes del <b>plan Pro</b> (25 USD/mes), verificados contra ' +
        'supabase.com/pricing el 2026-09-15. Si el plan cambia se cambian en la vista ' +
        '<code>topes</code> y en ningún sitio más.</p>';
    }).catch(fallo);
  }

  function estimarPartida(c) {
    var debates = {};
    c.forEach(function (f) { if (f.debate) debates[f.debate] = 1; });
    var n = Object.keys(debates).length;
    if (!n) return 0;
    var total = c.reduce(function (a, f) { return a + Number(f.usd || 0); }, 0);
    return total / n;
  }

  /* --- Piezas ---------------------------------------------------------------- */
  function tarjeta(eti, dato, pie) {
    return '<div class="tarjeta"><div class="eti">' + esc(eti) + '</div>' +
           '<div class="dato">' + dato + '</div>' +
           (pie ? '<div class="pie">' + esc(pie) + '</div>' : '') + '</div>';
  }

  function tabla(cabeceras, filas, numerica) {
    if (!filas.length) return '<p class="chico">Nada todavía.</p>';
    return '<table><thead><tr>' +
      cabeceras.map(function (c, i) {
        return '<th' + (numerica && numerica[i] ? ' class="num"' : '') + '>' + esc(c) + '</th>';
      }).join('') +
      '</tr></thead><tbody>' +
      filas.map(function (f) {
        return '<tr>' + f.map(function (celda, i) {
          return '<td' + (numerica && numerica[i] ? ' class="num"' : '') + '>' + celda + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  /* --- Arranque -------------------------------------------------------------- */
  $('#entrar').addEventListener('click', entrar);
  $('#clave').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
  $('#salir').addEventListener('click', function () {
    sesion = null;
    try { sessionStorage.removeItem(CLAVE); } catch (e) {}
    location.reload();
  });
  document.querySelector('nav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pest]');
    if (!b) return;
    pestana = b.dataset.pest;
    pintar();
  });

  /* El detalle: abrir, cambiar de cara y cerrar. Todo por delegación desde el
     documento, porque los botones de «Detalle» se repintan con la tabla y
     atarlos uno a uno obligaría a volver a atarlos en cada recarga. */
  document.addEventListener('click', function (e) {
    /* El numero de peticion se copia de un clic: es una cadena de treinta
       caracteres que hay que pegar en otra pestaña, y seleccionarla a mano
       dentro de una celda de tabla es la clase de friccion que hace que nadie
       compruebe nada. */
    var cp = e.target.closest('[data-copiar]');
    if (cp) {
      navigator.clipboard.writeText(cp.dataset.copiar).then(function () {
        var antes = cp.textContent;
        cp.textContent = 'copiado';
        setTimeout(function () { cp.textContent = antes; }, 900);
      }).catch(function () {});
      return;
    }
    var vr = e.target.closest('[data-visto-reporte]');
    if (vr) return marcarReporteVisto(vr.dataset.vistoReporte);
    var bc = e.target.closest('[data-borrar-cuenta]');
    if (bc) return borrarCuenta(bc.dataset.borrarCuenta, bc.dataset.apodo);
    var d = e.target.closest('[data-detalle]');
    if (d) return abrirDetalle(d.dataset.detalle);
    var c = e.target.closest('#detalle .pestanas button');
    if (c) return pintarCara(c.dataset.cara);
    /* Cerrar con la × o tocando fuera de la caja: el velo es el propio
       `#detalle`, así que un clic que llega hasta él es un clic fuera. */
    if (e.target.closest('[data-cerrar]') || e.target.id === 'detalle') cerrarDetalle();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') cerrarDetalle();
  });

  montarCaptcha();

  /* La sesión vive en `sessionStorage` y no en `localStorage`: al cerrar la
     pestaña se va. Es un tablero de administración, no una app de uso diario. */
  try {
    var g = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    if (g && g.access_token) { sesion = g; comprobarQueEsAdmin(); }
  } catch (e) {}
})();
