/* ==========================================================================
   ATWI · grabadora.js
   Grabar la voz en el navegador. Es la pieza con más trampas del proyecto, así
   que van escritas aquí.

   FORMATO. Cada navegador graba en lo suyo y no hay uno que valga en todos:
   Chrome y Firefox dan WebM con Opus, Safari da MP4 con AAC. No se puede fijar
   un formato: se pregunta cuál admite y se manda lo que salga.

   PERMISO. `getUserMedia` solo funciona en HTTPS o en localhost, y hay que
   pedirlo DENTRO de un gesto de la persona. Si se pide al cargar la pantalla,
   el navegador lo deniega sin preguntar.

   EL FLUJO SE MANTIENE VIVO. En iOS instalado hay un fallo viejo y conocido:
   graba la primera vez y al reabrir la app no arranca. La mitigación
   documentada es no soltar el `MediaStream` entre turnos y no cambiar de ruta
   mientras se graba. Por eso el flujo se abre una vez y se conserva.

   AÑADIR SIN ROMPER EL ARCHIVO. Para poder seguir hablando después de haber
   parado NO se para y se vuelve a empezar: se usa `pause()` y `resume()` sobre
   la MISMA grabación. Dos archivos pegados no dan un archivo válido; una
   grabación pausada y reanudada, sí. Y como se graba por trozos, se puede
   montar una copia para escucharla sin haber terminado.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var flujo = null;          // el MediaStream, vivo entre turnos a propósito
  var grabadora = null;
  var trozos = [];
  var msAcumulados = 0;      // lo grabado antes de la última pausa
  var desde = 0;             // cuándo arrancó el tramo actual
  var temporizador = null;
  var alSegundo = null;
  var tope = 0;
  var alTope = null;

  /* --- El recorte de silencios ----------------------------------------------
     LAS PAUSAS NO SE RECORTAN DESPUES, SE EVITAN. Un turno de un minuto con
     veinte segundos de silencio cuesta un tercio mas de transcribir --Deepgram
     cobra por minuto de audio-- y sube un tercio mas de datos. Recortarlas una
     vez grabadas obligaria a descodificar, cortar y volver a codificar en el
     telefono, y eso tarda casi tanto como el audio dura.

     Asi que no se graban: se escucha el nivel en vivo y, cuando lleva un
     segundo largo en silencio, se PAUSA la grabadora. MediaRecorder ya sabe
     pausar y reanudar, y el archivo sale continuo y sin el hueco. Cuesta cero y
     no anade ni un milisegundo de espera.

     OJO CON LO QUE ESTO NO ES: no es un recortador de ruido. Lo que se graba
     sale tal cual; lo unico que desaparece son los tramos en los que no habla
     nadie. El ruido ambiental de fondo mientras se habla se queda, y da igual:
     lo que se reproduce despues no es esta grabacion, es la voz del personaje
     leyendo el texto. El ruido no llega al resultado por ningun camino.

     El segundo de espera es a proposito y no menos: pausar al primer respiro
     corta las palabras por la mitad. Al reanudar se pierden unos milisegundos
     del arranque de la palabra que vuelve, que es el precio, y es asumible. */
  var MS_PARA_CALLAR = 1000;   // silencio seguido antes de pausar
  var NIVEL_DE_VOZ = 0.012;    // RMS por debajo del cual no hay nadie hablando
  var escucha = null;          // { ctx, analizador, datos, latido }
  var enSilencioDesde = 0;
  var pausadoPorSilencio = false;
  var calladoDesde = 0;        // cuando se pauso, para medir lo recortado
  var msSilenciados = 0;

  /** Mide el nivel del micrófono y pausa o reanuda segun haya voz o no. */
  function vigilarElSilencio(f) {
    pararVigilancia();
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;                       // sin Web Audio se graba tal cual
    try {
      var ctx = new Ctx();
      var fuente = ctx.createMediaStreamSource(f);
      var an = ctx.createAnalyser();
      an.fftSize = 1024;
      fuente.connect(an);
      var datos = new Float32Array(an.fftSize);
      enSilencioDesde = 0;
      pausadoPorSilencio = false;
      msSilenciados = 0;
      var latido = setInterval(function () {
        if (!grabadora) return;
        an.getFloatTimeDomainData(datos);
        var suma = 0;
        for (var i = 0; i < datos.length; i++) suma += datos[i] * datos[i];
        var nivel = Math.sqrt(suma / datos.length);
        var ahora = Date.now();

        if (nivel >= NIVEL_DE_VOZ) {
          enSilencioDesde = 0;
          if (pausadoPorSilencio && grabadora.state === 'paused') {
            /* Lo recortado se mide con RELOJ, no contando latidos. Se conto
               `+= 60` por latido dando por hecho que caen cada 60 ms, y el
               navegador los estrangula a uno por segundo cuando la pestana no
               esta al frente: seis segundos de silencio se apuntaron como 0,3.
               El recorte era correcto --el audio si salia mas corto--, la
               cuenta no. */
            msSilenciados += ahora - calladoDesde;
            pausadoPorSilencio = false;
            try { grabadora.resume(); } catch (e) {}
            desde = ahora;
            arrancarReloj();
          }
          return;
        }
        if (pausadoPorSilencio) return;
        if (!enSilencioDesde) { enSilencioDesde = ahora; return; }
        if (ahora - enSilencioDesde < MS_PARA_CALLAR) return;

        if (grabadora.state === 'recording') {
          pausadoPorSilencio = true;
          calladoDesde = ahora;
          pararReloj();
          msAcumulados += ahora - desde;
          try { grabadora.pause(); } catch (e) {}
        }
      }, 60);
      escucha = { ctx: ctx, latido: latido };
    } catch (e) { /* si la medicion falla, se graba sin recortar */ }
  }

  function pararVigilancia() {
    /* Si se para MIENTRAS sigue callado, ese ultimo tramo tambien se recorto y
       tambien cuenta: sin esto, el silencio final no aparecia en la cuenta. */
    if (pausadoPorSilencio && calladoDesde) msSilenciados += Date.now() - calladoDesde;
    calladoDesde = 0;
    if (!escucha) return;
    clearInterval(escucha.latido);
    try { escucha.ctx.close(); } catch (e) {}
    escucha = null;
    pausadoPorSilencio = false;
  }

  function tipoQueAdmite() {
    if (!window.MediaRecorder) return '';
    var candidatos = [
      'audio/webm;codecs=opus', 'audio/webm',
      'audio/mp4;codecs=mp4a.40.2', 'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    for (var i = 0; i < candidatos.length; i++) {
      if (MediaRecorder.isTypeSupported(candidatos[i])) return candidatos[i];
    }
    return '';
  }

  /* EL BITRATE HAY QUE DECIRLO. Sin esto, Chrome graba a su por defecto —unos
     128 kbps— y un turno de 16 s pesaba 271 KB: cuatro veces lo que `docs/01`
     §8.1 da por supuesto (Opus a 32 kbps ≈ 240 KB/min). Cuatro veces la subida,
     el almacenamiento y el egress, y nadie lo notaría al oírlo: 32 kbps es de
     sobra para voz en Opus, que está diseñado justo para eso.

     AAC no aguanta lo mismo. Safari graba en MP4/AAC y a 32 kbps mono se oye
     mal, lo que además le daría trabajo de más al transcriptor. Va a 48, que
     sigue siendo la quinta parte de lo que salía antes. */
  function bitrate(tipo) {
    return /mp4|mpeg|aac/.test(tipo || '') ? 48000 : 32000;
  }

  function segundos() {
    var enCurso = grabadora && grabadora.state === 'recording' ? Date.now() - desde : 0;
    return Math.floor((msAcumulados + enCurso) / 1000);
  }

  function arrancarReloj() {
    if (temporizador) clearInterval(temporizador);
    temporizador = setInterval(function () {
      var s = segundos();
      if (alSegundo) alSegundo(s);
      if (tope && s >= tope) {
        clearInterval(temporizador);
        temporizador = null;
        if (alTope) alTope();
      }
    }, 250);
  }

  function pararReloj() {
    if (temporizador) { clearInterval(temporizador); temporizador = null; }
  }

  function montar() {
    var tipo = (grabadora && grabadora.mimeType) || tipoQueAdmite() || 'audio/webm';
    return new Blob(trozos, { type: tipo });
  }

  window.ATWI.grabadora = {
    sePuede: function () {
      return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    },

    porQueNo: function () {
      if (!window.isSecureContext) return 'El navegador solo deja grabar en páginas seguras. Abre ATWI con https.';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'Este navegador no sabe grabar audio. Prueba con Chrome o Safari actualizados.';
      if (!window.MediaRecorder) return 'Este navegador no tiene grabadora de audio.';
      return 'No se pudo abrir el micrófono.';
    },

    /** ¿El navegador sabe pausar y reanudar? Si no, «añadir» no se ofrece. */
    sabeAnadir: function () {
      return Boolean(window.MediaRecorder && MediaRecorder.prototype.pause && MediaRecorder.prototype.resume);
    },

    /** Pide el micrófono. Debe llamarse dentro de un gesto de la persona. */
    abrir: function () {
      if (flujo && flujo.active) return Promise.resolve(flujo);
      return navigator.mediaDevices.getUserMedia({
        /* EN MONO. Esto es una nota de voz de una persona hablando a un
           teléfono: el segundo canal es la misma señal otra vez y duplica todo
           lo que cuesta —subida, almacenamiento, egress— a cambio de nada. Va
           como preferencia y no como exigencia: si el aparato no sabe, graba
           como pueda en vez de fallar. */
        audio: { channelCount: 1, echoCancellation: true,
                 noiseSuppression: true, autoGainControl: true }
      }).then(function (f) { flujo = f; return f; });
    },

    /** Empieza una grabación NUEVA, desde cero. */
    empezar: function (cadaSegundo, topeSegundos, alLlegarAlTope) {
      alSegundo = cadaSegundo;
      tope = topeSegundos;
      alTope = alLlegarAlTope;
      return this.abrir().then(function (f) {
        var tipo = tipoQueAdmite();
        trozos = [];
        msAcumulados = 0;
        var opciones = { audioBitsPerSecond: bitrate(tipo) };
        if (tipo) opciones.mimeType = tipo;
        grabadora = new MediaRecorder(f, opciones);
        grabadora.ondataavailable = function (e) { if (e.data && e.data.size) trozos.push(e.data); };
        grabadora.start(250);       // por trozos: permite oírlo sin terminar
        desde = Date.now();
        arrancarReloj();
        vigilarElSilencio(f);
        return true;
      });
    },

    /**
     * Pausa y devuelve una copia de lo grabado hasta ahora, para escucharla.
     * NO termina la grabación: después se puede seguir añadiendo.
     */
    pausar: function () {
      var yo = this;
      return new Promise(function (resolver) {
        if (!grabadora) return resolver(null);
        /* Puede estar PAUSADA por el recorte de silencios y no grabando. Antes
           se comprobaba solo `recording` y, si alguien paraba justo despues de
           callarse, esto devolvia null y la revision se quedaba sin audio. */
        if (grabadora.state !== 'recording' && grabadora.state !== 'paused') {
          return resolver(null);
        }
        /* El estado se lee ANTES de parar la vigilancia, que lo cambia. Si el
           recorte de silencios ya habia pausado, el tramo actual ya esta sumado
           y `desde` se quedo viejo: sumarlo otra vez contaria el silencio como
           tiempo hablado, que es justo lo que este recorte quita. */
        var grabando = grabadora.state === 'recording';
        pararVigilancia();
        pararReloj();
        if (grabando) msAcumulados += Date.now() - desde;
        /* Se pide el trozo pendiente ANTES de pausar, o el último medio segundo
           se queda sin escribir y la copia sale corta. */
        var alLlegar = function () {
          grabadora.removeEventListener('dataavailable', alLlegar);
          setTimeout(function () {
            try { grabadora.pause(); } catch (e) {}
            resolver({ audio: montar(), tipo: grabadora.mimeType, segundos: segundos() });
          }, 0);
        };
        grabadora.addEventListener('dataavailable', alLlegar);
        grabadora.requestData();
      });
    },

    /** Sigue grabando sobre lo mismo. El archivo sale entero, no pegado. */
    reanudar: function () {
      if (!grabadora || grabadora.state !== 'paused') return false;
      grabadora.resume();
      desde = Date.now();
      arrancarReloj();
      return true;
    },

    /** Cierra el turno y devuelve el audio definitivo. */
    terminar: function () {
      return new Promise(function (resolver) {
        if (!grabadora || grabadora.state === 'inactive') return resolver(null);
        pararReloj();
        pararVigilancia();
        if (grabadora.state === 'recording') msAcumulados += Date.now() - desde;
        /* Hacia abajo, igual que el reloj: lo que se vio en la revisión y lo
           que se manda tienen que ser el mismo número. */
        var s = Math.floor(msAcumulados / 1000);
        grabadora.onstop = function () {
          var r = { audio: montar(), tipo: grabadora.mimeType, segundos: s };
          r.bytes = r.audio.size;
          /* Cuanto silencio se quito. Va en el resultado para poder MEDIR el
             ahorro en vez de confiar en que lo hay: es lo que se deja de subir
             y lo que se deja de pagarle al transcriptor, que cobra por minuto
             de audio. */
          r.silenciados = Math.round(msSilenciados / 100) / 10;
          trozos = [];
          msAcumulados = 0;
          msSilenciados = 0;
          resolver(r);
        };
        grabadora.stop();
      });
    },

    /** Tira lo grabado y deja todo listo para volver a empezar. */
    descartar: function () {
      pararVigilancia();
      pararReloj();
      if (grabadora && grabadora.state !== 'inactive') {
        grabadora.onstop = null;
        try { grabadora.stop(); } catch (e) {}
      }
      grabadora = null;
      trozos = [];
      msAcumulados = 0;
    },

    grabando: function () { return Boolean(grabadora && grabadora.state === 'recording'); },
    pausada: function () { return Boolean(grabadora && grabadora.state === 'paused'); },
    segundos: segundos,

    /** Suelta el micrófono. Solo al terminar la partida entera. */
    cerrar: function () {
      this.descartar();
      if (flujo) {
        flujo.getTracks().forEach(function (t) { t.stop(); });
        flujo = null;
      }
    }
  };
})();
