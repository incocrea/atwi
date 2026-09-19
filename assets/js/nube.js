/* ==========================================================================
   ATWI · nube.js
   El puente entre la sala y el servidor. Dos cosas y nada más:

     1. Abrir la partida en la base, para que los turnos tengan dónde colgarse.
     2. Mandar cada turno a la función `turno`, que lo guarda, lo transcribe, lo
        limpia y lo devuelve LOCUTADO CON LA VOZ DEL PERSONAJE.

   POR QUÉ ESTÁ APARTE DE `partida.js`. La sala ya sabe demasiado: turnos,
   sorteo, reproducción, animación de boca. Meterle además reintentos de red y
   estados de subida la convierte en el sitio donde se toca todo, y esa es la
   clase de archivo que nadie se atreve a cambiar. Aquí dentro no hay ni una
   línea de interfaz.

   NADA DE ESTO ES OBLIGATORIO PARA JUGAR. Si no hay servidor, o no hay sesión, o
   la red falla, todas estas funciones devuelven `null` y la sala sigue como
   siempre: en local, con su audio en memoria. Lo único que se pierde es la voz
   del personaje. Una partida no se cae porque el servidor tenga un mal día.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var auth = window.ATWI.auth;

  /* EL ULTIMO MOTIVO POR EL QUE ALGO NO SUBIO. Existe porque esto se depura en
     un telefono, donde no hay consola que abrir: sin esto, «falló» es todo lo
     que se sabe, y adivinar por que fallo cuesta un dia. Se enseña en la sala,
     en pequeño, debajo de las casillas. */
  var ultimoFallo = '';

  function apuntar(que) {
    ultimoFallo = String(que || '').slice(0, 200);
    if (window.console) console.warn('[ATWI] ' + ultimoFallo);
    return null;
  }

  /* ANOTAR EN LA BITACORA (migración 0029, petición del titular 2026-09-15).
     `apuntar` deja el motivo en ESTE teléfono y se pierde al cerrar la pestaña;
     esto lo manda al servidor, que es el único sitio donde alguien lo va a
     leer. Va por la función `anotar()` y no por un insert: ahí se fija el
     origen, se comprueba que el debate sea de quien llama y se topa en veinte
     por minuto.

     NO DEVUELVE NADA Y NO SE ESPERA. Una anotación que hiciera esperar al
     juego, o que pudiera romperlo al fallar, costaría más de lo que vale: lo
     que se está anotando ya es un fallo.

     Y TIENE UN LÍMITE QUE CONVIENE SABER: si lo que falló es la conexión
     entera, esta llamada también falla y la anotación se pierde. Justo el caso
     que más interesa es el que el navegador no puede contar, y es otro motivo
     para que el veredicto acabe encolándose en el servidor. */
  function anotar(suceso, op) {
    op = op || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnon || !auth || !auth.dentro()) return;
    try {
      fetch(cfg.supabaseUrl + '/rest/v1/rpc/anotar', {
        method: 'POST',
        /* `keepalive` PARA LO QUE SE ANOTA AL IRSE. Una petición normal se
           cancela cuando la pestaña se cierra, que es justo cuando hay que
           mandar «se fue esperando el veredicto». `sendBeacon` no sirve aquí:
           no deja poner la cabecera de sesión. */
        keepalive: Boolean(op.alIrse),
        headers: {
          'apikey': cfg.supabaseAnon,
          'Authorization': 'Bearer ' + conSesion(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_suceso: String(suceso || 'sin_nombre').slice(0, 40),
          p_nivel: op.nivel || 'error',
          p_detalle: String(op.detalle || ultimoFallo || '').slice(0, 500) || null,
          p_debate: op.debate || null,
          p_datos: op.datos || null
        })
      }).catch(function () {});
    } catch (e) { /* ni eso puede tumbar una partida */ }
  }

  /* SELLA QUE ESTE VEREDICTO YA SE VIO (migración 0030). Se llama al ABRIR la
     revelación y no al cerrarla: quien la abre ya lo vio, y esperar al final
     dejaría sin sellar a quien cierra la app a mitad del redoble --que es
     justamente la persona que este arreglo existe para atender--.
     Como `anotar`, no se espera y no puede romper nada: si el sello se pierde,
     lo peor que pasa es que la próxima vez se lo vuelvan a estrenar. */
  function marcarVisto(debate) {
    if (!debate || !hayNube()) return;
    try {
      fetch(cfg.supabaseUrl + '/rest/v1/rpc/marcar_visto', {
        method: 'POST',
        headers: {
          'apikey': cfg.supabaseAnon,
          'Authorization': 'Bearer ' + conSesion(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_debate: debate })
      }).catch(function () {});
    } catch (e) {}
  }

  /**
   * Guarda el acta de una Negociación. Devuelve la fila escrita, o null.
   *
   * SE ESCRIBE AL FIRMAR Y NO AL CERRAR LA REVELACIÓN, que es lo que la hace
   * un acta: lo que se guarda es lo que los dos dijeron que sí, en el momento
   * en que lo dijeron. Esperar al final la dejaría colgando de que nadie cierre
   * la app durante la celebración.
   *
   * `tipo` DICE CÓMO CERRÓ y no es adorno: `acuerdo` cuando firmaron un texto,
   * `desacuerdo` cuando marcaron «Ninguna» o el mediador no encontró terreno
   * común. Las dos son cierres legítimos --`docs/02` §13 le da permiso expreso
   * al mediador para declarar que no hay acuerdo-- y el historial las enseña
   * distinto. `aplazado` existe en el enum y todavía no lo usa nadie.
   *
   * LA VERSIÓN LA CUENTA EL CLIENTE porque hoy no hay revisiones: la primera
   * acta de un debate es la 1 y no hay segunda. El día que exista la revisión
   * (`docs/02` §5) esto tiene que pasar a resolverse en el servidor, o dos
   * teléfonos pueden pedir la misma versión a la vez; el índice único
   * `(debate, version)` de la migración 0032 hará que la segunda falle, que es
   * lo correcto, pero entonces habrá que reintentar con la siguiente.
   */
  function guardarActa(op) {
    if (!hayNube() || !op || !op.debate) return Promise.resolve(null);
    var texto = String(op.texto || '').trim();
    /* EL MÍNIMO NO ES DE LA PANTALLA, ES DE LA TABLA: `check (10..600)`, y vale
       IGUAL para el acta de desacuerdo --ahí el texto es la frase de cierre, no
       está vacío--. Si no llega, no se manda: un 400 de PostgREST aquí no diría
       nada útil. */
    if (texto.length < 10 || texto.length > 600) {
      return Promise.resolve(apuntar('el acta tiene que medir entre 10 y 600 letras'));
    }
    var ahora = new Date().toISOString();
    return fetch(cfg.supabaseUrl + '/rest/v1/acuerdos', {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        debate: op.debate,
        texto: texto,
        tipo: op.tipo === 'desacuerdo' ? 'desacuerdo' : 'acuerdo',
        version: op.version || 1,
        /* LAS DOS FIRMAS A LA VEZ, y es verdad en partida local: los dos están
           delante del mismo teléfono y el toque que firma es de los dos. En
           remota cada una se sella por su lado y esto deja de valer. */
        firma_uno: ahora,
        firma_dos: ahora,
        /* Quién tocó el texto, solo si lo tocaron. Sirve para saber si el acta
           es la que propuso el mediador o la que ellos reescribieron. */
        editado_por: op.editada ? (auth.sesion().user || {}).id || null : null
      })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) return apuntar('no se pudo guardar el acta (' + r.status + '): ' +
                                  ((d && (d.message || d.error)) || ''));
        return (d && d[0]) || null;
      }, function () { return apuntar('el servidor contestó algo raro al guardar el acta'); });
    }).catch(function (e) { return apuntar('no se pudo guardar el acta: ' + e.message); });
  }

  /**
   * Le pide al mediador las dos maneras de quedar. Devuelve lo que devuelve la
   * función --`{propuestas, parada, lo_que_dijo}`-- o null con el fallo
   * apuntado.
   *
   * MISMA FORMA QUE `arbitrar`, y por lo mismo: es IDEMPOTENTE del lado del
   * servidor --pedirlo dos veces devuelve las mismas propuestas y no cuesta la
   * segunda-- así que se puede pedir en cuanto entra el último turno, sin
   * esperar a que nadie toque nada.
   *
   * TARDA MÁS QUE EL ÁRBITRO: son dos llamadas al modelo en serie y el prompt
   * es medio más largo. La pantalla de deliberar está hecha para eso.
   */
  function mediar(debate, variante) {
    if (!hayNube()) return Promise.resolve(apuntar('sin servidor ni sesión'));
    var desde = Date.now();
    function mal(clave, que) {
      apuntar(que);
      anotar(clave, { debate: debate, datos: { ms: Date.now() - desde } });
      return null;
    }
    return fetch(cfg.supabaseUrl + '/functions/v1/mediador', {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ debate: debate, variante: variante || 'es-419' })
    }).then(function (r) {
      return r.json().then(function (d) {
        /* UN 422 NO ES UN FALLO DE RED: es el mediador diciendo que no pudo
           cumplir su propio contrato en dos intentos. Se distingue porque se
           arregla de otra manera --mirando `fallos`, no reintentando--. */
        if (r.status === 422) {
          return mal('mediador_no_cumplio',
                     'el mediador no cumplió el contrato: ' +
                     ((d && d.fallos && d.fallos.join('; ')) || ''));
        }
        if (!r.ok) return mal('mediador_http_' + r.status,
                              'el mediador dijo ' + r.status + ': ' + ((d && d.error) || ''));
        if (d && d.error) return mal('mediador_error', d.error);
        return d;
      }, function () {
        return mal('mediador_no_es_json',
                   'el mediador contestó algo que no es JSON (' + r.status + ')');
      });
    }).catch(function (e) {
      return mal('mediador_sin_red', 'no se pudo llamar al mediador: ' + e.message);
    });
  }

  /**
   * Las actas de esta cuenta, de la más nueva a la más vieja, con el tema de la
   * partida de la que salieron.
   *
   * SE PIDEN LAS SUYAS, EXPLÍCITAMENTE, igual que el historial y por lo mismo:
   * la cuenta del titular es admin y tiene una política que le deja ver todas
   * las actas --que es para el tablero, no para jugar--. El filtro va sobre la
   * tabla ANIDADA, con `!inner` para que el join filtre de verdad en vez de
   * devolver el acta con el debate en nulo.
   */
  /** Una partida suelta, con la misma forma que las del historial. Hace falta
   *  para abrir desde un acta una partida que el historial no trajo: llega
   *  hasta 20 y las actas hasta 50. */
  function partida(id) {
    if (!hayNube() || !id) return Promise.resolve(null);
    return historial(1, id).then(function (l) { return (l && l[0]) || null; });
  }

  function acuerdos(cuantos) {
    if (!hayNube()) return Promise.resolve([]);
    var yo = auth.sesion().user;
    if (!yo || !yo.id) return Promise.resolve([]);
    var campos = 'id,texto,tipo,version,creado,firma_uno,firma_dos,editado_por,' +
      'debate:debates!inner(id,enunciado,modo,creado)';
    return fetch(cfg.supabaseUrl + '/rest/v1/acuerdos' +
        '?select=' + encodeURIComponent(campos) +
        '&debate.or=(propone.eq.' + yo.id + ',aceptado_por.eq.' + yo.id + ')' +
        '&order=creado.desc&limit=' + (cuantos || 50), {
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Accept': 'application/json'
      }
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        apuntar('actas (' + r.status + '): ' + t.slice(0, 160));
        return [];
      });
      return r.json();
    }).catch(function (e) { apuntar('no se pudieron traer las actas: ' + e.message); return []; });
  }

  function hayNube() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnon) { apuntar('sin servidor configurado'); return false; }
    if (!auth || !auth.dentro()) { apuntar('sin sesión: entra con tu cuenta'); return false; }
    return true;
  }

  function conSesion() {
    var s = auth.sesion();
    return s && s.access_token ? s.access_token : null;
  }

  /**
   * Una función de la base (`/rpc/<nombre>`), con la sesión puesta. Resuelve
   * con lo que devuelva; si la base contesta con error, RECHAZA con un Error
   * cuyo `message` es el `message` de PostgREST --que en las funciones del
   * modo en línea es una clave corta («sin_vidas», «mismo_personaje»)-- y con
   * `hint` en `.pista`, que es la frase para la persona.
   */
  function rpc(nombre, args) {
    return fetch(cfg.supabaseUrl + '/rest/v1/rpc/' + nombre, {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var dato = null;
        try { dato = t ? JSON.parse(t) : null; } catch (e) { dato = t; }
        if (!r.ok) {
          var e2 = new Error((dato && dato.message) || ('la base contestó ' + r.status));
          e2.pista = dato && dato.hint || '';
          e2.estado = r.status;
          throw e2;
        }
        return dato;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* EL MODO EN LÍNEA (migración 0055)                                   */
  /* ------------------------------------------------------------------ */

  /** Las invitaciones que me esperan: las que llevan MI correo y siguen vivas. */
  function invitaciones() {
    if (!hayNube()) return Promise.resolve([]);
    return rpc('invitaciones_pendientes').then(function (l) { return l || []; })
      .catch(function (e) { apuntar('invitaciones: ' + e.message); return []; });
  }

  /**
   * Acepto una invitación con la ficha que voy a llevar. La base aplica la
   * regla del personaje --distinto del host, salvo QuiénGane, donde lo que no
   * puede coincidir es el color-- y sortea quién abre. Rechaza con
   * `mismo_personaje` / `mismo_color` / `invitacion_caducada`.
   */
  function aceptarInvitacion(debate, avatar, color) {
    if (!hayNube()) return Promise.reject(new Error('sin sesión'));
    return rpc('aceptar_invitacion', { p_debate: debate, p_avatar: avatar || null, p_color: color || null });
  }

  /** La rechazo (invitado) o la retiro (host): la propuesta se borra y la vida vuelve. */
  function rechazarInvitacion(debate) {
    if (!hayNube()) return Promise.reject(new Error('sin sesión'));
    return rpc('rechazar_invitacion', { p_debate: debate });
  }

  /** Mi voto en una Negociación en línea (0059): una propuesta (1..2) o -1. Devuelve el estado. */
  function votar(debate, eleccion) {
    if (!hayNube()) return Promise.reject(new Error('sin sesión'));
    return rpc('votar_en_linea', { p_debate: debate, p_eleccion: Number(eleccion) });
  }
  /** En qué va la votación: sin_votar · esperando · distintos · cerrada. */
  function estadoVotacion(debate) {
    if (!hayNube()) return Promise.resolve(null);
    return rpc('estado_votacion', { p_debate: debate }).catch(function () { return null; });
  }

  /** Ya vi el sorteo de esta partida: que no se me vuelva a enseñar. */
  function marcarIntroVista(debate) {
    if (!debate || !hayNube()) return;
    rpc('marcar_intro_visto', { p_debate: debate }).catch(function () {});
  }

  /** Cuántas vidas tengo. */
  function vidas() {
    if (!hayNube()) return Promise.resolve(null);
    return rpc('mis_vidas').catch(function (e) { apuntar('vidas: ' + e.message); return null; });
  }

  /** «Si tengo 10 te mando 5»: por apodo. Devuelve las que me quedan. */
  function enviarVidas(apodo, cuantas) {
    if (!hayNube()) return Promise.reject(new Error('sin sesión'));
    return rpc('enviar_vidas', { p_apodo: String(apodo || '').trim(), p_cuantas: Number(cuantas) || 0 });
  }

  /**
   * «¿Hay algo nuevo para mí desde tal hora?»: una sola llamada barata con la
   * que la app se refresca sola. Trae `avisos_nuevos`, `sin_leer`,
   * `invitaciones`, `partidas_tocadas` (ids con algo nuevo desde `desde`) y
   * `vidas`, más `ahora`, que es la marca para la siguiente pregunta.
   */
  function novedades(desde) {
    if (!hayNube()) return Promise.resolve(null);
    return rpc('novedades', { p_desde: desde || null }).catch(function () { return null; });
  }

  /* Los temas propios, ahora en la cuenta y no en el teléfono. La forma es la
     misma que guardaba localStorage --`id`, `titulo`, `enunciado`, `publico`,
     `clase`, `intensidad`-- para que `datos.js` no tenga que traducir. */
  function temasPropios() {
    if (!hayNube()) return Promise.resolve(null);
    return fetch(cfg.supabaseUrl + '/rest/v1/temas_propios?select=*&order=creado.asc', {
      headers: { 'apikey': cfg.supabaseAnon, 'Authorization': 'Bearer ' + conSesion(), 'Accept': 'application/json' }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function (e) { apuntar('temas propios: ' + e.message); return null; });
  }

  function guardarTemaPropio(t) {
    if (!hayNube()) return Promise.resolve(false);
    var yo = auth.sesion().user;
    var fila = {
      id: String(t.id), perfil: yo.id,
      titulo: String(t.titulo || '').slice(0, 60),
      enunciado: String(t.enunciado || '').slice(0, 400),
      publico: t.publico || 'pareja',
      clase: t.clase === 'premio' ? 'premio' : 'tema',
      intensidad: t.intensidad || null,
      editado: new Date().toISOString()
    };
    return fetch(cfg.supabaseUrl + '/rest/v1/temas_propios?on_conflict=perfil,id', {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnon, 'Authorization': 'Bearer ' + conSesion(),
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify([fila])
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (x) { apuntar('tema propio: ' + x.slice(0, 160)); return false; });
      return true;
    }).catch(function (e) { apuntar('tema propio: ' + e.message); return false; });
  }

  function borrarTemaPropio(id) {
    if (!hayNube()) return Promise.resolve(false);
    return fetch(cfg.supabaseUrl + '/rest/v1/temas_propios?id=eq.' + encodeURIComponent(String(id)), {
      method: 'DELETE',
      headers: { 'apikey': cfg.supabaseAnon, 'Authorization': 'Bearer ' + conSesion() }
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /**
   * Abre la partida en la base y devuelve su id, o null si no se pudo.
   *
   * La partida LOCAL es una cuenta y un teléfono: quien juega enfrente lo
   * agarró y no tiene cuenta. Su ficha viaja en el propio debate (migración
   * 0012), que es todo lo que hace falta para reconstruir después quién era.
   *
   * LA PARTIDA EN LÍNEA (0055) nace como PROPUESTA: `en_linea` con el correo
   * del invitado y sin ficha de invitado ni sorteo --las dos cosas las pone la
   * base cuando la otra persona acepta--. Gasta una vida al crearse (salvo
   * QuiénGane) y la recupera si se rechaza o caduca; si no quedan vidas el
   * INSERT falla con `sin_vidas` y aquí se devuelve null con ese fallo en
   * `ultimoFallo()`.
   */
  function abrirPartida(p) {
    if (!hayNube()) return Promise.resolve(null);
    var yo = auth.sesion().user;
    if (!yo || !yo.id) return Promise.resolve(apuntar('la sesión no trae usuario'));
    var enLinea = p.donde === 'linea' || Boolean(p.correo);

    var cuerpo = {
      propone: yo.id,
      tema_catalogo: p.tema && p.tema.id ? String(p.tema.id) : null,
      enunciado: String(p.tema && p.tema.enunciado || '').slice(0, 400),
      modo: p.modo === 'debate' ? 'debate' : p.modo === 'competencia' ? 'competencia' : 'negociacion',
      turnos: p.turnos,
      /* `estado` nace en 'propuesto' y la partida local ya está aceptada por los
         dos —están sentados juntos—, pero la restricción `aceptacion_coherente`
         de la 0001 exige que si el estado no es 'propuesto' haya un
         `aceptado_por`, y ahí solo caben perfiles. Se deja en 'propuesto': es
         verdad que nadie con cuenta la aceptó. */
      /* QUIÉN ELIGIÓ ABOGADO, por separado. Va en el debate y no en cada turno
         porque se decide antes de empezar y vale para toda la partida: el
         servidor lo lee de aquí y no de lo que diga cada petición. */
      abogado_propone: Boolean(p.abogadoYo),
      abogado_invitado: Boolean(p.abogadoOtro),
      /* Y quien juzga, por lo mismo: se elige antes de empezar y vale para toda
         la partida. Sin esto, una partida abierta desde el historial no sabria
         quien la juzgo y habria que inventarle uno. */
      juez: p.juez || null,
      /* LAS TRES COSAS QUE HACEN FALTA PARA VOLVER A SENTARLOS (migración 0031),
         y ninguna estaba. La ficha del invitado ya viajaba aquí desde la 0012
         «para reconstruir después quién era»; la de quien propone vivía en el
         perfil local, que se puede cambiar --y una ronda empezada como Kai se
         retoma como Kai, que el personaje es del turno--. Y quién abrió no se
         guardaba en ninguna parte: `abre` es un uuid a perfiles y el invitado
         de una partida local no tiene cuenta. */
      propone_nombre: String(p.yo && p.yo.nombre || '').slice(0, 16),
      propone_avatar: p.yo && p.yo.avatar || null,
      propone_color: p.yo && p.yo.color || null
    };
    if (enLinea) {
      cuerpo.en_linea = true;
      cuerpo.invitado_correo = String(p.correo || '').trim().toLowerCase();
      cuerpo.invitacion_caduca = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    } else {
      cuerpo.invitado_nombre = String(p.invitado && p.invitado.nombre || '').slice(0, 16);
      cuerpo.invitado_avatar = p.invitado && p.invitado.avatar || null;
      cuerpo.invitado_color = p.invitado && p.invitado.color || null;
      cuerpo.abre_lado = p.abreLado === 'invitado' ? 'invitado' : 'propone';
    }

    return fetch(cfg.supabaseUrl + '/rest/v1/debates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        /* El disparador de las vidas contesta con la clave a secas: se deja
           llegar tal cual para que la pantalla la reconozca. */
        if (/sin_vidas/.test(t)) throw new Error('sin_vidas');
        throw new Error('no se abrió la partida (' + r.status + '): ' + t.slice(0, 200));
      });
      return r.json();
    }).then(function (filas) {
      var id = (filas && filas[0] && filas[0].id) || null;
      /* PostgREST puede devolver 201 con una lista VACIA: la fila entra pero la
         politica de lectura no la deja ver de vuelta. Eso dejaria `P.debate`
         nulo con la partida creada, que es exactamente lo que pasaria sin
         enterarse nadie. */
      if (!id) apuntar('la partida se creó pero el servidor no la devolvió');
      return id;
    }).catch(function (e) { return apuntar(e.message); });
  }

  /**
   * Manda un turno y devuelve lo que salió del otro lado:
   *   { valido, transcripcion, guion, voz, ms }  ·  o null si no se pudo.
   *
   * `voz` es una URL FIRMADA y de vida corta al audio con la voz del personaje.
   * Es lo único reproducible que devuelve el servidor: la grabación original no
   * vuelve nunca, ni firmada.
   */
  function mandarTurno(op) {
    if (!hayNube()) return Promise.resolve(null);
    if (!op.debate) return Promise.resolve(apuntar('el turno no tiene partida en el servidor'));
    if (!op.audio) return Promise.resolve(apuntar('el turno no trae audio'));
    if (!op.audio.size) return Promise.resolve(apuntar('el audio pesa 0 bytes'));

    var f = new FormData();
    /* El nombre del archivo importa: la función deduce la extensión del tipo,
       pero algunos navegadores mandan el tipo vacío en un Blob sin nombre. */
    var ext = /mp4|m4a|aac/.test(op.tipo || '') ? 'm4a'
            : /ogg/.test(op.tipo || '') ? 'ogg' : 'webm';
    f.append('audio', op.audio, 'turno.' + ext);
    f.append('debate', op.debate);
    f.append('orden', String(op.orden));
    f.append('numero', String(op.numero));
    f.append('avatar', op.avatar);
    f.append('nombre', op.nombre || '');
    f.append('color', op.color || '');
    f.append('segundos', String(op.segundos || 0));
    /* El tipo COMPLETO, con sus parametros. El servidor lo recorta para guardar
       el archivo, pero lo anota entero: sin el codec no se puede saber que
       produjo este navegador, que es justo lo que se quiere medir. */
    f.append('mime', op.tipo || '');
    f.append('navegador', op.navegador || '');
    f.append('bytes', String((op.audio && op.audio.size) || 0));
    f.append('invitado', op.esInvitado ? '1' : '0');
    /* Se manda, pero el servidor NO se fía: lo comprueba contra el debate. Va
       solo para que los registros cuadren si algún día divergen. */
    f.append('abogado', op.abogado ? '1' : '0');

    return fetch(cfg.supabaseUrl + '/functions/v1/turno', {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion()
        /* SIN Content-Type: lo pone el navegador con el `boundary` del
           multipart. Ponerlo a mano rompe el cuerpo entero. */
      },
      body: f
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) return apuntar('el servidor dijo ' + r.status + ': ' +
                                  ((d && (d.error || d.msg)) || ''));
        if (d && d.error) return apuntar(d.error);
        return d;
      }, function () { return apuntar('el servidor contestó algo que no es JSON (' + r.status + ')'); });
    }).catch(function (e) { return apuntar('no se pudo llamar al servidor: ' + e.message); });
  }

  /**
   * Le pide el veredicto al arbitro. Tarda: normalizacion mas dos pasadas en
   * serie, un minuto largo con Opus 5. Devuelve lo que devuelve la funcion
   * --`{resultado, uso, ms}`-- o null con el fallo apuntado.
   *
   * Es IDEMPOTENTE del lado del servidor: pedirlo dos veces devuelve el mismo
   * veredicto y no cuesta nada la segunda. Asi que se puede pedir en cuanto
   * entra el ultimo turno, sin esperar a que la persona toque nada.
   */
  /**
   * EL VEREDICTO SE ENCOLA Y SE SONDEA; YA NO SE LLAMA AL JUEZ Y SE ESPERA
   * (migración 0046, 2026-09-17). Dos motivos, los dos medidos en el banco:
   * si la persona cierra la app en «deliberando» no quedaba nadie pidiendo, y
   * una ronda pareja hace razonar al juez más de lo que cabe en una petición
   * —cuatro 504 sobre el mismo material—. Ahora el trabajo vive en la base:
   * `pedir_veredicto()` asegura la fila en la cola (es idempotente: pulsarlo
   * diez veces no gasta diez veces) y esto pregunta cada pocos segundos hasta
   * `listo` o `fallido`. Devuelve la MISMA forma que antes —`{resultado}`—
   * para que `partida.js` no cambie ni una línea.
   */
  function arbitrar(debate, variante, opciones) {
    if (!hayNube()) return Promise.resolve(apuntar('sin servidor ni sesión'));
    var desde = Date.now();
    var cab = { 'apikey': cfg.supabaseAnon, 'Authorization': 'Bearer ' + conSesion(),
                'Content-Type': 'application/json' };
    function mal(clave, que) {
      apuntar(que);
      anotar(clave, { debate: debate, datos: { ms: Date.now() - desde } });
      return null;
    }
    function consultar() {
      return fetch(cfg.supabaseUrl + '/rest/v1/cola_veredictos?debate=eq.' + debate +
                   '&select=estado,paso,error', { headers: cab })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (f) { return f && f[0] || null; });
    }
    function resultado() {
      return fetch(cfg.supabaseUrl + '/rest/v1/resultados?debate=eq.' + debate + '&select=*',
                   { headers: cab })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (f) { return f && f[0] ? { resultado: f[0] } : mal('veredicto_sin_fila', 'la cola dice listo y no hay fila'); });
    }
    /* Hasta veinte minutos: tres pasos de hasta cuatro minutos más el recogedor,
       que vuelve a empujar a los siete. Más que eso es un fallo, y se dice. */
    var tope = Date.now() + 20 * 60 * 1000;
    function esperar() {
      return consultar().then(function (c) {
        if (!c) return mal('veredicto_sin_cola', 'la partida no está en la cola');
        if (c.estado === 'listo') return resultado();
        if (c.estado === 'fallido') return mal('veredicto_fallido', c.error || 'el juez no terminó');
        if (Date.now() > tope) return mal('veredicto_tarda', 'el juez lleva más de veinte minutos');
        return new Promise(function (ok) { setTimeout(ok, 4000); }).then(esperar);
      });
    }
    return fetch(cfg.supabaseUrl + '/rest/v1/rpc/pedir_veredicto', {
      method: 'POST', headers: cab,
      /* `p_reintentar` (H12, migración 0051): SOLO desde el botón de volver a
         pedirlo. Una fila `fallido` arranca de cero cuando la persona lo pide,
         no cada vez que abre la partida: una ronda que falla siempre gastaría
         en cada visita. */
      body: JSON.stringify({ p_debate: debate, p_variante: variante || null,
                             p_reintentar: !!(opciones && opciones.reintentar) })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { return mal('veredicto_http_' + r.status, 'no se pudo encolar: ' + t.slice(0, 200)); });
      return esperar();
    }, function (e) {
      return mal('veredicto_red', 'sin red al encolar: ' + String(e && e.message || e));
    });
  }

  /* El camino viejo: llamar al juez y esperar la respuesta. Se queda para el
     tablero y las herramientas, y como testigo de por qué se cambió. */
  function arbitrarDirecto(debate, variante) {
    if (!hayNube()) return Promise.resolve(apuntar('sin servidor ni sesión'));
    /* CADA CAMINO DE FALLO SE ANOTA, Y CON SU NOMBRE. Un solo
       `veredicto_fallo` para los cuatro obligaría a leer el texto libre para
       saber si se cayó la red, si contestó 500 o si devolvió algo que no es
       JSON, y son tres averías distintas con tres arreglos distintos. La clave
       es lo que se agrupa; el detalle solo acompaña. */
    var desde = Date.now();
    function mal(clave, que) {
      apuntar(que);
      anotar(clave, { debate: debate, datos: { ms: Date.now() - desde } });
      return null;
    }
    return fetch(cfg.supabaseUrl + '/functions/v1/arbitro', {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ debate: debate, variante: variante || 'es-419' })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) return mal('veredicto_http_' + r.status,
                              'el juez dijo ' + r.status + ': ' + ((d && d.error) || ''));
        if (d && d.error) return mal('veredicto_error', d.error);
        return d;
      }, function () {
        return mal('veredicto_no_es_json',
                   'el juez contestó algo que no es JSON (' + r.status + ')');
      });
    }).catch(function (e) {
      return mal('veredicto_sin_red', 'no se pudo llamar al juez: ' + e.message);
    });
  }

  /**
   * Las partidas de quien esta dentro, de la mas nueva a la mas vieja, con sus
   * turnos. En UNA sola peticion: PostgREST sabe traer la tabla hija anidada, y
   * pedir primero los debates y despues los turnos de cada uno serian N+1
   * viajes para pintar una lista.
   */
  /** @param uno  si viene, trae SOLO ese debate. Lo usa `partida()`. */
  /** Las partidas de quien está dentro. `desde` es cuántas saltarse: la lista
   *  se trae de diez en diez y el botón «Cargar más» pide la tanda siguiente,
   *  así que la primera pantalla no espera por partidas que nadie va a mirar. */
  function historial(cuantas, uno, desde) {
    if (!hayNube()) return Promise.resolve([]);
    /* Y EL RESULTADO ANIDADO, que hasta el 2026-09-15 no se traía: el historial
       enseñaba las partidas sin saber si habían llegado a tener veredicto, así
       que una ronda cuyo resultado nadie vio se veía igual que una ya vista.
       Con `visto` nulo, la entrada se estrena con la revelación entera.

       SIN `veredicto`, a propósito. Esa columna es el expediente completo del
       árbitro --normalización, las dos pasadas, los reintentos-- y pesa; aquí
       solo hacen falta los campos que pinta `delArbitro()`. Bajar el expediente
       de veinte partidas para dibujar una lista sería gastar los datos de
       alguien por si acaso.
       `juez` VIENE DEL DEBATE y también faltaba: sin él, un veredicto abierto
       desde el historial no sabría quién lo dictó. */
    /* ⚠️ `propone` —EL UUID— HACE FALTA, y faltaba. Sin él `ladoDeTurno` compara
       `t.perfil` contra `undefined`, así que NINGÚN turno sale del lado
       `propone` y los dos lados acaban cogiendo el primero: las dos figuras de
       la sala salían con la misma ficha y el veredicto nombraba dos veces a la
       misma persona. Lo vio el titular en el ejercicio 10.
       Estaban `propone_nombre/avatar/color` pero no la columna que dice de
       quién es la partida, porque hasta ahora nadie la miraba desde el cliente. */
    var campos = 'id,creado,cerrado,modo,enunciado,tema_catalogo,turnos,juez,propone,' +
      /* Lo del modo en línea (0055): con quién, si aceptaron, hasta cuándo, si
         ya vi el sorteo y quién abandonó. `estado` dice si sigue propuesta. */
      'estado,en_linea,aceptado_por,invitado_correo,invitacion_caduca,plazo,' +
      'intro_visto_propone,intro_visto_invitado,abandono,' +
      'abre_lado,abogado_propone,abogado_invitado,' +
      'propone_nombre,propone_avatar,propone_color,' +
      'invitado_nombre,invitado_avatar,invitado_color,' +
      /* `perfil` DICE DE QUÉ LADO ES CADA TURNO, y sin él había que deducirlo
         por la paridad de `orden`, que es justo donde se falló dos veces. Es la
         misma columna con la que el árbitro decide el lado (`ladoDe`): nulo es
         el invitado de una partida local, y lo demás se compara con `propone`. */
      /* ⚠️ SIN `transcripcion` NI `guion`, y no los usaba nadie (2026-09-18, al
         mirar por qué tarda la lista). Son los dos textos largos de cada turno
         —lo que el STT oyó y lo que se locuta—, o sea ~800 caracteres por
         intervención y hasta seis por partida: con veinte partidas son decenas
         de KB que el servidor lee, serializa y manda para pintar una lista que
         solo necesita CUÁNTAS intervenciones hay. `partida.js` los copiaba a
         `intervenciones` y no los leía ni una vez —comprobado con una búsqueda
         en los cinco archivos—: lo que se oye es el audio, y el texto solo vive
         en el momento de grabar, donde llega en la respuesta de `turno`.
         El día que una pantalla quiera enseñar el literal, se pide para ESA
         partida, no para las veinte de la lista. */
      'turnos_grabados:turnos(orden,numero,perfil,nombre,avatar,color,abogado,segundos,' +
      'voz_ruta,audio_ruta,creado),' +
      'resultado:resultados(tipo_resultado,ganador_lado,motivo_empate,justificacion,forma_del_desacuerdo,' +
      'desglose,lo_mejor,lo_que_dijo,visto,visto_invitado,creado),' +
      /* Y LAS ACTAS (2026-09-18): sin ellas el historial no sabia si una
         Negociacion terminada estaba cerrada --firmada, «Ninguna» o parada-- o
         si le faltaba justo eso, y las marcaba todas `terminada`. Solo los
         campos que decide `estadoDe()`; el texto del acta lo trae el chip
         «Acuerdos» por su cuenta. */
      'acuerdos(tipo,version,texto,lo_que_dijo,creado)';
    /* Y SE PIDEN LAS MÍAS, EXPLÍCITAMENTE. Esto no estaba y costó una tarde
       (2026-09-15): la consulta traía «los debates que RLS me deje ver» y se
       daba por hecho que eran los míos. Para casi todo el mundo lo son, pero la
       cuenta del titular es ADMIN, y la migración 0014 le dio una política
       `el admin ve todos los debates` para el tablero. Resultado: su historial
       de JUGAR se llenaba de las partidas de otra cuenta, y al intentar
       borrarlas la función de borde contestaba «esa partida no es tuya» --que
       era verdad-- sin que nada explicara de dónde habían salido.

       RLS dice lo que se PUEDE ver; la consulta tiene que decir lo que se
       QUIERE ver. Confundir las dos cosas es cómodo hasta que una política nueva
       ensancha lo primero, y entonces la pantalla enseña de más sin que nadie
       haya tocado la pantalla.

       LAS DOS ORILLAS, no solo `propone`: en una partida remota el invitado
       también la jugó y también es suya, así que va por `aceptado_por`. Hoy
       todas son locales y esa mitad no devuelve nada, pero escribirlo ahora
       evita que el día de la remota el invitado no encuentre sus partidas. */
    var yo = auth.sesion().user;
    if (!yo || !yo.id) return Promise.resolve([]);
    var mias = 'or=(propone.eq.' + yo.id + ',aceptado_por.eq.' + yo.id + ')';

    /* CUÁNTO CUESTA ESTA LISTA, en el registro del navegador. Se puso al
       preguntar el titular por qué tarda en refrescar (2026-09-18): sin un
       número, «va lento» solo se puede contestar con teorías. Es un
       `console.debug`, así que no se ve salvo que alguien abra la consola con el
       nivel de detalle puesto. */
    var arranque = Date.now();

    /* ⚠️ Y SE RENUEVA LA SESIÓN ANTES DE PREGUNTAR (2026-09-18). `conSesion()`
       lee el token guardado y no mira si sigue vivo: caduca en una hora, y
       `auth.listo()` —que es quien lo renueva— solo corre al ARRANCAR la app,
       en la puerta de entrada. Así que dejar la app abierta una hora y volver al
       historial mandaba un JWT muerto: 401 del servidor y «no se pudieron traer
       las partidas», sin nada que explicara por qué. Medido en una sesión con el
       token vencido: la lista tardó **9,9 s** entre los rechazos y el refresco,
       contra 290 ms con la sesión al día.
       `listo()` no cuesta nada cuando el token vale: resuelve al instante y solo
       pide el refresco si le falta menos de un minuto.
       ⚠️ LAS DEMÁS LLAMADAS SIGUEN SIN ESTO —`turno`, `arbitrar`, `mediar`,
       `olvidar`— y tienen el mismo agujero: son de un solo uso dentro de una
       partida, así que se nota menos, pero el día que una ronda dure más de una
       hora hay que subir esta espera a un envoltorio común. */
    return auth.listo().then(function () {
      return fetch(cfg.supabaseUrl + '/rest/v1/debates' +
          '?select=' + encodeURIComponent(campos) + '&' + mias +
          /* AQUÍ HABÍA UN `&cerrado=not.is.null` Y SE FUE (decisión del titular,
             2026-09-15). Dejaba fuera todo lo que no hubiera terminado, con este
             motivo escrito: «una ronda dejada a medias no es una partida, es un
             intento: no se puede oír entera, no tiene resultado, y verla en la
             lista ofrece algo que al abrirlo no está».
             Era verdad mientras al abrirla no hubiera nada. Desde que se puede
             RETOMAR, al abrirla hay exactamente lo que promete: la ronda donde se
             quedó. Y esconderlas costaba caro en las dos direcciones --se juega
             por sesiones y por aparatos, y cerrar la pestaña a mitad del tercer
             turno se llevaba cinco grabaciones sin dejar rastro--.
             Lo que sí sigue siendo verdad: una partida sin NINGÚN turno no se
             puede retomar ni oír, y ésa la filtra el cliente, no esta consulta.
             OJO CON `limpiar_abandonadas.py`: su regla vieja --`cerrado` nulo y
             más de una hora-- borraba justo lo que ahora hay que conservar. Se
             cambió en la misma tanda. */
          (uno ? '&id=eq.' + uno : '') +
          '&order=creado.desc&limit=' + (cuantas || 20) +
          (desde ? '&offset=' + desde : ''), {
        headers: {
          'apikey': cfg.supabaseAnon,
          'Authorization': 'Bearer ' + conSesion(),
          'Accept': 'application/json'
        }
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          throw new Error('historial (' + r.status + '): ' + t.slice(0, 160));
        });
        /* Se lee el texto para poder PESARLO. `r.json()` hace lo mismo por dentro
           —lee el cuerpo entero y lo parsea— así que esto no añade trabajo. */
        return r.text().then(function (txt) {
          try {
            console.debug('ATWI · historial: %s KB en %s ms',
              Math.round(txt.length / 1024), Date.now() - arranque);
          } catch (e) {}
          return JSON.parse(txt);
        });
      }).then(function (filas) {
        return (filas || []).map(function (d) {
          /* PostgREST no promete el orden de la tabla anidada. Se ordena aqui:
             una partida contada al reves no es una partida. */
          d.turnos_grabados = (d.turnos_grabados || [])
            .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
          /* Y EL RESULTADO SE DESENVUELVE AQUÍ. PostgREST devuelve la tabla
             anidada como ARRAY aunque la relación sea de uno a uno --`debate` es
             `unique` en `resultados`--, y quien la recibe no tiene por qué
             saberlo. Costó una vuelta: `delArbitro()` leyó el array, no encontró
             `ganador_lado` en él y pintó un veredicto sin ganador y sin desglose,
             sin que nada fallara por ninguna parte. */
          var res = d.resultado;
          d.resultado = Array.isArray(res) ? (res[0] || null) : (res || null);
          return d;
        });
      });
    }).catch(function (e) { apuntar(e.message); return []; });
  }

  /**
   * Se trae un audio del almacen y devuelve una URL local, o null.
   *
   * Va por `/object/authenticated/` y NO por una URL firmada: firmar es una
   * peticion mas para conseguir una direccion que caduca, y aqui ya se tiene la
   * sesion. Quien puede oirlo lo decide RLS --la politica «oigo el audio de mis
   * partidas»--, que es donde tiene que decidirse.
   *
   * Se baja a blob en vez de dejarle la URL al elemento de audio para que el
   * primer toque suene: con la URL suelta, el navegador empieza a bajar CUANDO
   * se toca y el primer toque no hace nada.
   */
  function oirDelAlmacen(ruta) {
    if (!hayNube() || !ruta) return Promise.resolve(null);
    return fetch(cfg.supabaseUrl + '/storage/v1/object/authenticated/audios/' + ruta, {
      headers: { 'Authorization': 'Bearer ' + conSesion() }
    }).then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { return b && b.size ? URL.createObjectURL(b) : null; })
      .catch(function (e) { return apuntar('audio: ' + e.message); });
  }

  /**
   * Borra una partida del historial: sus audios y sus filas.
   *
   * LO HACE EL SERVIDOR, no esto. Seria mas corto mandar dos peticiones desde
   * aqui --el archivo y la fila-- pero hay que retirarlas EN ORDEN: quien puede
   * tocar un audio se decide leyendo el debate al que pertenece, asi que si la
   * fila se va primero los archivos quedan huerfanos y ya nadie puede
   * borrarlos. Y son la voz de una persona. Un telefono que se apaga entre las
   * dos peticiones deja eso hecho; la funcion de borde termina igual.
   */
  function olvidar(debate) {
    if (!hayNube() || !debate) return Promise.resolve(null);
    return fetch(cfg.supabaseUrl + '/functions/v1/olvidar', {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ debate: debate })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok || (d && d.error))
          return apuntar('no se pudo borrar: ' + ((d && d.error) || r.status));
        return d;
      }, function () { return apuntar('el servidor contestó algo raro (' + r.status + ')'); });
    }).catch(function (e) { return apuntar('no se pudo borrar: ' + e.message); });
  }

  /**
   * De qué lado es un turno. UNA SOLA DEFINICIÓN, y a propósito: esto se
   * dedujo de la paridad de `orden` en dos archivos distintos y salió mal las
   * dos veces, una en cada sentido. Es la misma regla que aplica el árbitro en
   * `ladoDe`, así que el cliente y el juez no pueden discrepar sobre quién es
   * quién — que es exactamente el fallo que no nos podemos permitir.
   */
  function ladoDeTurno(t, d) {
    /* Y SI FALTA `propone`, SE DICE. Sin esta guarda el fallo es MUDO: la
       comparación da falsa siempre, todos los turnos salen del lado invitado y
       lo que se ve es una partida con la misma ficha en los dos lados. Eso ya
       pasó una vez, y lo que costó encontrarlo fue que no se quejaba nadie. */
    if (d && !d.propone && window.console) {
      console.warn('[atwi] el debate llegó sin `propone`: no se puede saber de ' +
                   'qué lado es cada turno. Falta la columna en la consulta.');
    }
    return t && t.perfil && d && t.perfil === d.propone ? 'propone' : 'invitado';
  }

  /**
   * ¿ESTE TEMA SE PUEDE JUGAR? (titular, 2026-09-18). Se pregunta AL GUARDAR
   * un tema propio o una reescritura, y no al lanzar la partida: así el ritmo
   * de armar una partida no se toca y lo que hay en la lista ya es jugable.
   * Devuelve {valido, motivo, explicacion, sugerencia} o, si el servidor no
   * contesta, {valido: true, sin_revisar: true}: una puerta que se cae no puede
   * dejar a nadie sin guardar su tema.
   */
  function revisarTema(op) {
    if (!hayNube()) return Promise.resolve({ valido: true, sin_revisar: true });
    return fetch(cfg.supabaseUrl + '/functions/v1/revisar_tema', {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ titulo: op.titulo, enunciado: op.enunciado, modo: op.modo })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (r.status === 429) return { valido: false, motivo: 'tope', explicacion: d.error, sugerencia: null };
        if (!r.ok || !d || (d.error && d.valido === undefined)) {
          apuntar('no se pudo revisar el tema: ' + ((d && d.error) || r.status));
          return { valido: true, sin_revisar: true };
        }
        return d;
      }, function () { return { valido: true, sin_revisar: true }; });
    }).catch(function (e) {
      apuntar('no se pudo revisar el tema: ' + e.message);
      return { valido: true, sin_revisar: true };
    });
  }

  /* EL TOKEN VIVO ANTES DE CADA LLAMADA, EN UN SOLO SITIO (2026-09-18). El
     historial ya esperaba a `auth.listo()` y las demás no —`turno`, `arbitrar`,
     `mediar`, `olvidar`…—: `conSesion()` lee el token guardado sin mirar si
     sigue vivo, y caduca en una hora. Una ronda que se retoma al día siguiente,
     o que dura más de una hora, mandaba un JWT muerto y el servidor contestaba
     401 con un motivo que no explicaba nada. `listo()` no cuesta nada cuando el
     token vale —resuelve al instante— y nunca rechaza: si el refresco falla, la
     llamada sale igual y falla como fallaba, con su aviso. Se envuelve la
     exportación y no cada `fetch`: catorce sitios son catorce olvidos posibles. */
  function conTokenVivo(f) {
    return function () {
      var args = arguments;
      if (!auth || !auth.listo || !auth.dentro()) return f.apply(null, args);
      return auth.listo().then(function () { return f.apply(null, args); });
    };
  }

  window.ATWI.nube = {
    revisarTema: conTokenVivo(revisarTema),
    /* El modo en línea (0055). */
    invitaciones: conTokenVivo(invitaciones),
    aceptarInvitacion: conTokenVivo(aceptarInvitacion),
    rechazarInvitacion: conTokenVivo(rechazarInvitacion),
    marcarIntroVista: conTokenVivo(marcarIntroVista),
    votar: conTokenVivo(votar),
    estadoVotacion: conTokenVivo(estadoVotacion),
    vidas: conTokenVivo(vidas),
    enviarVidas: conTokenVivo(enviarVidas),
    novedades: conTokenVivo(novedades),
    temasPropios: conTokenVivo(temasPropios),
    guardarTemaPropio: conTokenVivo(guardarTemaPropio),
    borrarTemaPropio: conTokenVivo(borrarTemaPropio),
    ladoDeTurno: ladoDeTurno,
    historial: historial,
    oirDelAlmacen: conTokenVivo(oirDelAlmacen),
    olvidar: conTokenVivo(olvidar),
    hay: hayNube,
    abrirPartida: conTokenVivo(abrirPartida),
    mandarTurno: conTokenVivo(mandarTurno),
    arbitrar: conTokenVivo(arbitrar),
    mediar: conTokenVivo(mediar),
    anotar: conTokenVivo(anotar),
    marcarVisto: conTokenVivo(marcarVisto),
    guardarActa: conTokenVivo(guardarActa),
    acuerdos: conTokenVivo(acuerdos),
    partida: conTokenVivo(partida),
    ultimoFallo: function () { return ultimoFallo; }
  };
})();
