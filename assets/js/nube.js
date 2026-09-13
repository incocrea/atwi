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

  function hayNube() {
    return Boolean(cfg.supabaseUrl && cfg.supabaseAnon && auth && auth.dentro());
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
    if (!yo || !yo.id) return Promise.resolve(null);

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
      return (filas && filas[0] && filas[0].id) || null;
    }).catch(function (e) {
      /* Se avisa por consola y se sigue en local. Quien juega no tiene por qué
         enterarse de que el servidor no contestó: su partida funciona igual. */
      if (window.console) console.warn('[ATWI] ' + e.message);
      return null;
    });
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
    if (!hayNube() || !op.debate || !op.audio) return Promise.resolve(null);

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
    f.append('invitado', op.esInvitado ? '1' : '0');

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
      return r.json().catch(function () { return null; });
    }).catch(function (e) {
      if (window.console) console.warn('[ATWI] turno no subido: ' + e.message);
      return null;
    });
  }

  window.ATWI.nube = {
    hay: hayNube,
    abrirPartida: abrirPartida,
    mandarTurno: mandarTurno
  };
})();
