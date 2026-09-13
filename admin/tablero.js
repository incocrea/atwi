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
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function usd(n) { return '$' + Number(n || 0).toFixed(4); }
  function fecha(s) { return s ? String(s).slice(0, 16).replace('T', ' ') : '—'; }

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
  function entrar() {
    var correo = $('#correo').value.trim().toLowerCase();
    var clave = $('#clave').value;
    $('#error').textContent = '';
    if (!correo || !clave) { $('#error').textContent = 'Faltan datos.'; return; }

    $('#entrar').disabled = true;
    $('#error').textContent = 'Comprobando que no sos un robot…';
    $('#error').style.color = 'var(--suave)';

    conElToken().then(function (t) {
      $('#error').textContent = '';
      $('#error').style.color = 'var(--mal)';
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
          msg = 'El antirrobots no dio token. Recargá la página; si sigue igual, ' +
                'revisá que este dominio esté en la lista del widget de Turnstile.';
        }
        throw new Error(msg);
      }
      sesion = s;
      try { sessionStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) {}
      return comprobarQueEsAdmin();
    }).catch(function (e) {
      $('#error').textContent = e.message;
      $('#error').style.color = 'var(--mal)';
      sesion = null;
      /* El token de Turnstile es DE UN SOLO USO. Si el intento falló --por la
         contraseña o por lo que sea-- el siguiente saldría sin token y el error
         cambiaría a uno del captcha, que despista. Se pide uno nuevo. */
      captcha = '';
      if (window.turnstile && trasto !== null) {
        try { window.turnstile.reset(trasto); } catch (x) {}
      }
    }).then(function () { $('#entrar').disabled = false; });
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
       material: verMaterial, limites: verLimites })[pestana]();
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
        tabla(['Nombre', 'Personaje', 'Nivel', 'Partidas', 'Gastado', 'Alta', 'Id'],
          gente.map(function (p) {
            var d = porPersona[p.id] || { partidas: 0, usd: 0 };
            return [esc(p.nombre || '—') +
                      (admins[p.id] ? ' <span class="pastilla">admin</span>' : ''),
                    esc(p.avatar || '—'),
                    p.nivel,
                    d.partidas,
                    usd(d.usd),
                    fecha(p.creado),
                    '<span class="chico">' + esc(String(p.id).slice(0, 8)) + '</span>'];
          }), [false, false, true, true, true, false, false]) +
        '<p class="chico" style="margin-top:10px">El gasto por persona solo cuenta lo que ' +
        'se pudo atribuir: el invitado de una partida local no tiene cuenta, así que su ' +
        'consumo cuelga de quien la creó.</p>';
    }).catch(fallo);
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

  /* --- LÍMITES ---------------------------------------------------------------
     Hasta dónde se puede gastar. Los saldos de verdad viven en cada proveedor y
     no se pueden leer desde aquí sin meter sus claves en el navegador, que es
     justo lo que no se hace nunca. Así que esto es lo que SE SABE, con su
     fuente, y dice claramente qué hay que ir a mirar a mano. */
  function verLimites() {
    pedir('costos?select=proveedor,usd,creado').then(function (c) {
      var gastado = {};
      c.forEach(function (f) {
        gastado[f.proveedor] = (gastado[f.proveedor] || 0) + Number(f.usd || 0);
      });

      var CUENTAS = [
        { p: 'deepgram', nombre: 'Deepgram', credito: 200,
          fuente: 'Crédito inicial de 200 USD (docs/01 §8.2, verificado sep-2026).',
          donde: 'console.deepgram.com → Usage' },
        { p: 'anthropic', nombre: 'Anthropic', credito: null,
          fuente: 'De prepago. El saldo no se puede leer desde aquí sin poner la clave en el navegador.',
          donde: 'console.anthropic.com → Billing' },
        { p: 'azure', nombre: 'Azure Speech', credito: null,
          fuente: 'El nivel gratuito da 0,5 M de caracteres al mes de voz neuronal; el de pago cobra por carácter. SIN VERIFICAR.',
          donde: 'portal.azure.com → el recurso → Métricas' },
        { p: 'supabase', nombre: 'Supabase', credito: null,
          fuente: 'Gratis: 500 MB de base, 1 GB de almacén, 5 GB de egress, 500.000 invocaciones de función (docs/01 §8.4).',
          donde: 'supabase.com/dashboard → Usage' }
      ];

      $('#lienzo').innerHTML =
        '<div class="aviso">Lo gastado que se ve aquí es <b>lo que esta app anotó</b>, no lo ' +
        'que factura el proveedor. Sirve para ver la tendencia y repartir el gasto; el saldo ' +
        'real hay que mirarlo en cada panel. Leerlo desde aquí obligaría a meter las claves ' +
        'de cada servicio en una página del navegador, y eso no se hace.</div>' +

        '<h2>Cuentas y hasta dónde llegan</h2>' +
        tabla(['Servicio', 'Anotado por ATWI', 'Lo que se sabe del límite', 'Dónde se mira de verdad'],
          CUENTAS.map(function (x) {
            var g = gastado[x.p] || 0;
            return ['<b>' + esc(x.nombre) + '</b>',
                    usd(g) + (x.credito
                      ? '<br><span class="chico">' + (g / x.credito * 100).toFixed(2) +
                        '% de ' + x.credito + ' USD</span>' : ''),
                    '<span class="chico">' + esc(x.fuente) + '</span>',
                    '<span class="chico">' + esc(x.donde) + '</span>'];
          }), [false, true, false, false]) +

        '<h2>Cuánto cuesta jugar</h2>' +
        '<p class="chico" style="margin-bottom:12px">Con los precios de la tabla de tarifas y ' +
        'una partida de 3 turnos por persona a 60 s cada uno.</p>' +
        '<div class="tarjetas">' +
          tarjeta('Por partida', usd(estimarPartida(c)), '6 intervenciones') +
          tarjeta('Por pareja al mes', usd(estimarPartida(c) * 4), '4 partidas, el caso base') +
          tarjeta('Mil parejas al mes', '$' + (estimarPartida(c) * 4 * 1000).toFixed(0), 'a este precio') +
        '</div>';
    }).catch(fallo);
  }

  /** El costo real por partida, sacado de lo anotado. Si todavía no hay datos
      suficientes no se inventa un número: se dice que no los hay. */
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

  montarCaptcha();

  /* La sesión vive en `sessionStorage` y no en `localStorage`: al cerrar la
     pestaña se va. Es un tablero de administración, no una app de uso diario. */
  try {
    var g = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    if (g && g.access_token) { sesion = g; comprobarQueEsAdmin(); }
  } catch (e) {}
})();
