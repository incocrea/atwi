/* ==========================================================================
   ATWI · grabadora.js
   Grabar la voz en el navegador. Es la pieza con más trampas de todo el
   proyecto, así que van escritas aquí.

   FORMATO. Cada navegador graba en lo suyo y no hay uno que valga en todos:
   Chrome y Firefox dan WebM con Opus, Safari da MP4 con AAC. No se puede fijar
   un formato: se pregunta cuál admite y se manda lo que salga. El servidor de
   transcripción acepta los dos.

   PERMISO. `getUserMedia` solo funciona en HTTPS o en localhost, y el permiso
   hay que pedirlo DENTRO de un gesto de la persona. Si se pide al cargar la
   pantalla, el navegador lo deniega sin preguntar.

   EL FLUJO SE MANTIENE VIVO. En iOS instalado hay un fallo conocido y viejo:
   funciona la primera vez y al reabrir la app no arranca. La mitigación que
   está documentada es no soltar el `MediaStream` entre turnos y no cambiar de
   ruta mientras se graba. Por eso aquí el flujo se abre una vez y se conserva.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var flujo = null;         // el MediaStream, vivo entre turnos a propósito
  var grabadora = null;
  var trozos = [];
  var arrancado = 0;
  var temporizador = null;

  function tipoQueAdmite() {
    if (!window.MediaRecorder) return '';
    var candidatos = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    for (var i = 0; i < candidatos.length; i++) {
      if (MediaRecorder.isTypeSupported(candidatos[i])) return candidatos[i];
    }
    return '';               // el navegador elegirá por su cuenta
  }

  window.ATWI.grabadora = {
    /** ¿Se puede grabar aquí? */
    sePuede: function () {
      return Boolean(navigator.mediaDevices &&
                     navigator.mediaDevices.getUserMedia &&
                     window.MediaRecorder);
    },

    /** Por qué no se puede, en una frase que se le pueda enseñar a alguien. */
    porQueNo: function () {
      if (!window.isSecureContext) {
        return 'El navegador solo deja grabar en páginas seguras. Abre ATWI con https.';
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return 'Este navegador no sabe grabar audio. Prueba con Chrome o Safari actualizados.';
      }
      if (!window.MediaRecorder) {
        return 'Este navegador no tiene grabadora de audio.';
      }
      return 'No se pudo abrir el micrófono.';
    },

    /**
     * Pide el micrófono. TIENE que llamarse dentro de un gesto de la persona.
     * El flujo se conserva abierto para los turnos siguientes.
     */
    abrir: function () {
      if (flujo && flujo.active) return Promise.resolve(flujo);
      return navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      }).then(function (f) { flujo = f; return f; });
    },

    /**
     * Empieza a grabar.
     * @param alSegundo  se llama cada segundo con los segundos transcurridos
     * @param tope       segundos máximos; al llegar, se para solo
     * @param alTope     se llama si se paró por llegar al tope
     */
    empezar: function (alSegundo, tope, alTope) {
      var yo = this;
      return this.abrir().then(function (f) {
        var tipo = tipoQueAdmite();
        trozos = [];
        grabadora = tipo ? new MediaRecorder(f, { mimeType: tipo }) : new MediaRecorder(f);
        grabadora.ondataavailable = function (e) {
          if (e.data && e.data.size) trozos.push(e.data);
        };
        grabadora.start(250);          // trozos de 250 ms: si algo falla, no se pierde todo
        arrancado = Date.now();

        temporizador = setInterval(function () {
          var s = Math.floor((Date.now() - arrancado) / 1000);
          if (alSegundo) alSegundo(s);
          if (tope && s >= tope) {
            clearInterval(temporizador);
            temporizador = null;
            if (alTope) alTope();
          }
        }, 250);
        return true;
      });
    },

    /** Para y devuelve el audio. El flujo del micrófono NO se cierra. */
    parar: function () {
      return new Promise(function (resolver) {
        if (!grabadora || grabadora.state === 'inactive') return resolver(null);
        if (temporizador) { clearInterval(temporizador); temporizador = null; }
        var segundos = Math.round((Date.now() - arrancado) / 1000);
        grabadora.onstop = function () {
          var tipo = grabadora.mimeType || 'audio/webm';
          var trozo = new Blob(trozos, { type: tipo });
          trozos = [];
          resolver({ audio: trozo, tipo: tipo, segundos: segundos, bytes: trozo.size });
        };
        grabadora.stop();
      });
    },

    grabando: function () {
      return Boolean(grabadora && grabadora.state === 'recording');
    },

    /** Suelta el micrófono. Solo al terminar la partida entera. */
    cerrar: function () {
      if (temporizador) { clearInterval(temporizador); temporizador = null; }
      if (grabadora && grabadora.state === 'recording') { try { grabadora.stop(); } catch (e) {} }
      grabadora = null;
      if (flujo) {
        flujo.getTracks().forEach(function (t) { t.stop(); });
        flujo = null;
      }
    }
  };
})();
