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
   * Abre la partida en la base y devuelve su id, o null si no se pudo.
   *
   * La partida LOCAL no tiene relación: quien juega enfrente agarró este mismo
   * teléfono y no tiene cuenta. Su ficha viaja en el propio debate (migración
   * 0012), que es todo lo que hace falta para reconstruir después quién era.
   */
  function abrirPartida(p) {
    if (!hayNube()) return Promise.resolve(null);
    var yo = auth.sesion().user;
    if (!yo || !yo.id) return Promise.resolve(apuntar('la sesión no trae usuario'));

    var cuerpo = {
      propone: yo.id,
      relacion: null,
      tema_catalogo: p.tema && p.tema.id ? String(p.tema.id) : null,
      enunciado: String(p.tema && p.tema.enunciado || '').slice(0, 400),
      modo: p.modo === 'debate' ? 'debate' : 'negociacion',
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
      invitado_nombre: String(p.invitado && p.invitado.nombre || '').slice(0, 16),
      invitado_avatar: p.invitado && p.invitado.avatar || null,
      invitado_color: p.invitado && p.invitado.color || null
    };

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

  /** Deja constancia de con quien jugo cada lado. `lado` 0 es quien propone. */
  function apuntarRepresentacion(debate, p) {
    var yo = auth.sesion().user;
    var filas = [
      { debate: debate, lado: 0, perfil: yo.id,
        abogado: Boolean(p.abogadoYo), personaje: p.personajeYo },
      { debate: debate, lado: 1, perfil: null,
        abogado: Boolean(p.abogadoOtro), personaje: p.personajeOtro }
    ];
    return fetch(cfg.supabaseUrl + '/rest/v1/representacion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(filas)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { apuntar('representacion: ' + t.slice(0, 160)); });
    }).catch(function (e) { apuntar('representacion: ' + e.message); });
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
   * Las partidas de quien esta dentro, de la mas nueva a la mas vieja, con sus
   * turnos. En UNA sola peticion: PostgREST sabe traer la tabla hija anidada, y
   * pedir primero los debates y despues los turnos de cada uno serian N+1
   * viajes para pintar una lista.
   */
  function historial(cuantas) {
    if (!hayNube()) return Promise.resolve([]);
    var campos = 'id,creado,cerrado,modo,enunciado,tema_catalogo,turnos,invitado_nombre,' +
      'turnos_grabados:turnos(orden,numero,nombre,avatar,color,abogado,segundos,' +
      'voz_ruta,audio_ruta,transcripcion,guion,creado)';
    return fetch(cfg.supabaseUrl + '/rest/v1/debates' +
        '?select=' + encodeURIComponent(campos) +
        /* SOLO LAS QUE TERMINARON. Una ronda dejada a medias no es una partida,
           es un intento: no se puede oír entera, no tiene resultado, y verla en
           la lista ofrece algo que al abrirlo no está. Lo marca el servidor
           --`debates.cerrado`, migración 0022-- porque quien abandona cierra la
           pestaña y no queda navegador que lo apunte. */
        '&cerrado=not.is.null' +
        '&order=creado.desc&limit=' + (cuantas || 20), {
      headers: {
        'apikey': cfg.supabaseAnon,
        'Authorization': 'Bearer ' + conSesion(),
        'Accept': 'application/json'
      }
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        throw new Error('historial (' + r.status + '): ' + t.slice(0, 160));
      });
      return r.json();
    }).then(function (filas) {
      return (filas || []).map(function (d) {
        /* PostgREST no promete el orden de la tabla anidada. Se ordena aqui:
           una partida contada al reves no es una partida. */
        d.turnos_grabados = (d.turnos_grabados || [])
          .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
        return d;
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

  window.ATWI.nube = {
    historial: historial,
    oirDelAlmacen: oirDelAlmacen,
    olvidar: olvidar,
    hay: hayNube,
    abrirPartida: abrirPartida,
    mandarTurno: mandarTurno,
    ultimoFallo: function () { return ultimoFallo; }
  };
})();
