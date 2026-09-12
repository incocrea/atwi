/* ==========================================================================
   ATWI · sonido.js
   El redoble y el platillo, sintetizados con la Web Audio API. Sin archivos.

   Por qué sin archivos: un redoble decente en MP3 son 30-60 KB que hay que
   descargar, cachear y servir, y encima suena siempre igual. Sintetizado son
   dos kilobytes de código, arranca sin esperar a la red y cada redoble es
   ligeramente distinto.

   REGLA QUE NO SE PUEDE SALTAR (docs/01 §8.6): la política de autoreproducción
   de los navegadores mantiene el AudioContext suspendido hasta que hay un
   gesto del usuario. Por eso el redoble se dispara SIEMPRE desde el toque en
   «Ver el resultado» y jamás solo al terminar el último turno. Si se intenta
   sin gesto, no suena y encima no avisa.

   Y en iOS, con el interruptor de silencio puesto, Web Audio no suena. No hay
   truco que lo arregle desde la web, así que el suspense tiene que funcionar
   también en silencio: por eso la cuenta atrás es gráfica, no solo sonora.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var ctx = null;

  function contexto() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Ruido blanco reutilizable: es la materia prima del redoble y del platillo. */
  var bufferRuido = null;
  function ruido(c) {
    if (bufferRuido) return bufferRuido;
    var n = c.sampleRate * 2;
    bufferRuido = c.createBuffer(1, n, c.sampleRate);
    var d = bufferRuido.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return bufferRuido;
  }

  /** Un golpe seco de caja. `t` es el momento absoluto del contexto. */
  function golpe(c, destino, t, volumen) {
    var f = c.createBufferSource();
    f.buffer = ruido(c);
    f.playbackRate.value = 1 + Math.random() * 0.3;

    var paso = c.createBiquadFilter();
    paso.type = 'highpass';
    paso.frequency.value = 1400 + Math.random() * 400;

    var g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volumen, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

    f.connect(paso); paso.connect(g); g.connect(destino);
    f.start(t); f.stop(t + 0.08);
  }

  window.ATWI.sonido = {
    /** ¿Hay audio disponible? Si no, la cuenta atrás gráfica se basta sola. */
    hay: function () { return Boolean(window.AudioContext || window.webkitAudioContext); },

    /**
     * Abre el contexto sin hacer ruido. Hay que llamarlo DENTRO del gesto que
     * empieza la secuencia: el navegador solo lo desbloquea ahí, y el redoble
     * ya no suena en ese instante sino después de la entrada de la frase.
     */
    despertar: function () { contexto(); },

    /**
     * Redoble de circo: golpes cada vez más rápidos y cada vez más fuertes.
     * Devuelve una función para cortarlo antes de tiempo.
     * @param segundos cuánto dura
     */
    redoble: function (segundos) {
      var c = contexto();
      if (!c) return function () {};
      var dur = segundos || 3;
      var maestro = c.createGain();
      maestro.gain.value = 0.28;
      maestro.connect(c.destination);

      var t0 = c.currentTime + 0.03;
      var t = 0;
      var golpes = 0;
      /* El intervalo se acorta de 90 ms a 22 ms: es lo que hace que suene a
         que algo va a pasar, más que el volumen. */
      while (t < dur && golpes < 400) {
        var avance = t / dur;
        var intervalo = 0.090 - 0.068 * avance;
        var vol = 0.35 + 0.65 * avance;
        golpe(c, maestro, t0 + t, vol);
        t += intervalo;
        golpes++;
      }
      return function cortar() {
        try {
          maestro.gain.cancelScheduledValues(c.currentTime);
          maestro.gain.setValueAtTime(maestro.gain.value, c.currentTime);
          maestro.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
        } catch (e) { /* el contexto ya no está */ }
      };
    },

    /** El platillo del final, cuando se revela el resultado. */
    platillo: function () {
      var c = contexto();
      if (!c) return;
      var t = c.currentTime;

      var f = c.createBufferSource();
      f.buffer = ruido(c);

      var paso = c.createBiquadFilter();
      paso.type = 'highpass';
      paso.frequency.value = 5000;

      var g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);

      f.connect(paso); paso.connect(g); g.connect(c.destination);
      f.start(t); f.stop(t + 1.8);

      /* Un acorde corto y alegre debajo del platillo, para que suene a premio
         y no a accidente. */
      [523.25, 659.25, 783.99].forEach(function (hz, i) {
        var o = c.createOscillator();
        var og = c.createGain();
        o.type = 'triangle';
        o.frequency.value = hz;
        og.gain.setValueAtTime(0, t + i * 0.012);
        og.gain.linearRampToValueAtTime(0.16, t + 0.02 + i * 0.012);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(og); og.connect(c.destination);
        o.start(t + i * 0.012); o.stop(t + 1);
      });
    },

    /**
     * El clac de la ruleta: un golpe seco y corto, como el trinquete que va
     * pasando por los topes. Se dispara UNO POR CADA SALTO de la animación, no
     * en un patrón propio, para que el oído y el ojo vayan juntos: si el sonido
     * llevara su propio ritmo, al frenar se notaría que van por libre.
     *
     * `fuerza` baja de 1 a 0 según se frena, que es lo que hace que suene a
     * rueda perdiendo impulso y no a metrónomo.
     */
    clac: function (fuerza) {
      var c = contexto();
      if (!c) return;
      var t = c.currentTime;
      var v = 0.05 + 0.13 * (fuerza == null ? 1 : fuerza);

      var f = c.createBufferSource();
      f.buffer = ruido(c);
      f.playbackRate.value = 1.4;

      var paso = c.createBiquadFilter();
      paso.type = 'bandpass';
      paso.frequency.value = 2600;
      paso.Q.value = 3;

      var g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

      f.connect(paso); paso.connect(g); g.connect(c.destination);
      f.start(t); f.stop(t + 0.05);
    },

    /**
     * La campana del final: dos parciales y una cola larga. Un solo tono suena
     * a timbre de microondas; el segundo parcial, ligeramente desafinado y más
     * corto, es lo que lo convierte en campana.
     */
    campana: function () {
      var c = contexto();
      if (!c) return;
      var t = c.currentTime;
      [[1318.5, 0.22, 1.8], [2637, 0.09, 0.9], [3956, 0.04, 0.5]].forEach(function (voz) {
        var o = c.createOscillator();
        var g = c.createGain();
        o.type = 'sine';
        o.frequency.value = voz[0];
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(voz[1], t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + voz[2]);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + voz[2] + 0.05);
      });
    },

    /** Un tic por cada número de la cuenta atrás. */
    tic: function () {
      var c = contexto();
      if (!c) return;
      var t = c.currentTime;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = 'square';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.1);
    }
  };
})();
