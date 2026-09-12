/* ==========================================================================
   ATWI · veredicto.js
   El momento del resultado, que es el clímax del juego.

   La secuencia, siempre igual y siempre disparada por un toque:

       frase  ->  cuenta atrás 3-2-1 con redoble  ->  platillo y revelación

   En modo DEBATE gana una persona.
   En modo NEGOCIACIÓN no gana nadie por separado: con pareja gana la relación,
   y hay dos finales posibles. Si hay acuerdo, se lee el acuerdo. Si no lo hay,
   también gana la relación: haber practicado diferir sin molestarse cuenta.

   Una nota de redacción que viene de docs/02 §9.4.7 y de la revisión del 03:
   aquí NO se afirma que la pareja «se ha entendido mejor». Eso es un estado
   mental que la app no puede comprobar. Se describe lo que sí consta: que hay
   un acuerdo escrito por ellos mismos y firmado por los dos.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var sonido = window.ATWI.sonido;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function alAzar(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

  /* La frase del resultado es también el nombre de la app. Las cuatro iniciales
     entran primero, una a una, y solo después aparece el resto de las letras:
     durante un segundo en pantalla pone A T W I y luego se convierte en la
     frase entera. Si `cortas` es true se pinta ya montada, sin animación. */
  function fraseMarca(cortas) {
    var partes = cfg.veredicto.frase;
    if (typeof partes === 'string') return esc(partes);   // por si vuelve a ser texto plano
    return partes.map(function (par, i) {
      var retardoI = (i * 0.16).toFixed(2);
      var retardoR = (0.70 + i * 0.06).toFixed(2);
      return '<span class="fm__palabra">' +
        '<span class="fm__ini"' + (cortas ? '' : ' style="animation-delay:' + retardoI + 's"') + '>' + esc(par[0]) + '</span>' +
        '<span class="fm__resto"' + (cortas ? '' : ' style="animation-delay:' + retardoR + 's"') + '>' + esc(par[1]) + '</span>' +
      '</span>';
    }).join(' ');
  }

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var caja = null;

  function pantalla() {
    if (!caja) {
      caja = document.createElement('div');
      caja.className = 'revelacion';
      caja.hidden = true;
      (document.querySelector('.marco') || document.body).appendChild(caja);
    }
    return caja;
  }

  /**
   * Lanza la secuencia completa.
   *
   * @param r.modo      'debate' | 'negociacion'
   * @param r.publico   'pareja' | 'amigos'
   * @param r.ganador   nombre de quien gana, solo en modo debate
   * @param r.empate    true si el debate quedó en empate
   * @param r.tema      título del tema, para el texto de negociación
   * @param r.acuerdo   texto del acuerdo firmado, o null si no lo hubo
   * @param r.alCerrar  se llama cuando la persona toca «Ver el desglose»
   */
  window.ATWI.veredicto = {
    /** La frase que dice el juez al cerrar la última intervención. */
    fraseDeCierre: function () { return alAzar(cfg.frasesDeCierre); },

    /** La frase con la que acusa recibo de cada turno. */
    fraseDeEscucha: function () { return alAzar(cfg.frasesDelJuez); },

    revelar: function (r) {
      var v = cfg.veredicto;
      var p = pantalla();
      var segundos = v.segundosCuentaAtras || 3;

      p.hidden = false;
      p.className = 'revelacion revelacion--' + (r.modo === 'negociacion' ? 'negociacion' : 'debate');
      p.innerHTML = '<p class="revelacion__frase">' + fraseMarca(false) + '</p>' +
                    '<div class="revelacion__numero" id="rev-n"></div>';

      /* El redoble arranca aquí, dentro del gesto que llamó a revelar(). */
      var cortar = sonido.hay() ? sonido.redoble(segundos + 0.2) : function () {};

      var n = segundos;
      var hueco = p.querySelector('#rev-n');

      function tick() {
        if (n > 0) {
          hueco.textContent = n;
          hueco.style.animation = 'none';
          void hueco.offsetWidth;                       // reinicia la animación
          hueco.style.animation = '';
          if (sonido.hay()) sonido.tic();
          n--;
          return esperar(1000).then(tick);
        }
        cortar();
        if (sonido.hay()) sonido.platillo();
        return mostrarResultado(p, r);
      }

      return esperar(900).then(tick);
    },

    cerrar: function () { if (caja) caja.hidden = true; }
  };

  function mostrarResultado(p, r) {
    var v = cfg.veredicto;
    var titular, detalle;

    if (r.modo === 'negociacion') {
      /* Aquí no gana una persona. */
      titular = (v.ganadorNegociacion && v.ganadorNegociacion[r.publico]) || 'los dos';
      if (r.acuerdo) {
        detalle = '<p class="revelacion__acuerdo">«' + esc(r.acuerdo) + '»</p>' +
                  '<p class="revelacion__pie">' +
                  esc(v.conAcuerdo.replace('{tema}', r.tema || 'este tema')) + '</p>';
      } else {
        detalle = '<p class="revelacion__pie">' + esc(v.sinAcuerdo) + '</p>';
      }
    } else if (r.empate) {
      titular = 'Empate';
      detalle = '<p class="revelacion__pie">Los dos defendieron igual de bien. ' +
                'El empate es un resultado, no un fallo.</p>';
    } else {
      titular = r.ganador || '—';
      detalle = '<p class="revelacion__pie">Mira el desglose para ver por qué.</p>';
    }

    p.innerHTML =
      '<p class="revelacion__frase revelacion__frase--hecha">' + fraseMarca(true) + '</p>' +
      '<p class="revelacion__ganador">' + esc(titular) + '</p>' +
      detalle +
      '<button class="boton boton--bloque boton--grande revelacion__boton" data-accion="ver-desglose">' +
        'Ver el desglose</button>';

    var b = p.querySelector('[data-accion="ver-desglose"]');
    b.addEventListener('click', function () {
      window.ATWI.veredicto.cerrar();
      if (r.alCerrar) r.alCerrar();
    });
    return Promise.resolve();
  }
})();
