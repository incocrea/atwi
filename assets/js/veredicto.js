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

  /* La frase del resultado es también el nombre de la app: And-The-Winner-Is.
     La inicial NO es tipografía, es la letra de verdad del logotipo recortada
     de su lámina, y por eso la frase se lee como el nombre.

     Se pinta siempre montada y en una sola línea: partirla en dos renglones
     rompe el logotipo. El drama lo pone la entrada, no el escalonado de las
     letras. */
  function fraseMarca() {
    var partes = cfg.veredicto.frase;
    if (typeof partes === 'string') return esc(partes);   // por si vuelve a ser texto plano
    return partes.map(function (par) {
      return '<span class="fm__palabra">' +
          '<img class="fm__ini" src="../assets/img/letras/' + par[0] + '.png" alt="' + esc(par[0]) + '">' +
          '<span class="fm__resto">' + esc(par[1]) + '</span>' +
        '</span>';
    }).join('');
  }

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ==========================================================================
     LA ENTRADA DE LA FRASE
     Cada tramo —And, The, Winner, Is…— aparece primero SOLO, grande y en el
     centro de la pantalla, aguanta medio segundo, y desde ahí vuela a su sitio
     y a su tamaño definitivos. Cuando el último aterriza, la frase está
     montada y empieza la cuenta atrás.

     Se hace con un clon volando por encima y el tramo real escondido debajo:
     así el destino es la posición REAL que la maqueta le da, y no hay que
     adivinar coordenadas ni desactivar el flujo normal del texto.
     ========================================================================== */
  var MS_GRANDE = 500;    // lo que aguanta cada tramo a tamaño completo
  var MS_VUELO = 380;     // lo que tarda en colocarse

  function entradaDramatica(p) {
    var frase = p.querySelector('.revelacion__frase');
    var tramos = [].slice.call(frase.querySelectorAll('.fm__palabra'));
    /* Sin Web Animations —navegador viejo— la frase sale montada y ya: el
       efecto es un lujo, la frase no. */
    if (!tramos.length || !frase.animate) return Promise.resolve();

    var capa = document.createElement('div');
    capa.className = 'fm__capa';
    p.appendChild(capa);
    tramos.forEach(function (t) { t.style.visibility = 'hidden'; });

    return tramos.reduce(function (cadena, t) {
      return cadena.then(function () { return unTramo(capa, t); });
    }, Promise.resolve()).then(function () { capa.remove(); });
  }

  function unTramo(capa, tramo) {
    var clon = tramo.cloneNode(true);
    clon.className = 'fm__hero';
    clon.style.visibility = 'visible';
    capa.innerHTML = '';
    capa.appendChild(clon);
    if (sonido.hay()) sonido.tic();

    return esperar(MS_GRANDE).then(function () {
      var desde = clon.getBoundingClientRect();
      var hasta = tramo.getBoundingClientRect();
      if (!desde.width || !hasta.width) { tramo.style.visibility = ''; clon.remove(); return; }

      var k = hasta.width / desde.width;
      var dx = (hasta.left + hasta.width / 2) - (desde.left + desde.width / 2);
      var dy = (hasta.top + hasta.height / 2) - (desde.top + desde.height / 2);

      var vuelo = clon.animate([
        { transform: 'translate(0px,0px) scale(1)' },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')' }
      ], { duration: MS_VUELO, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });

      return vuelo.finished.catch(function () {}).then(function () {
        tramo.style.visibility = '';
        clon.remove();
      });
    });
  }

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
      p.innerHTML = '<p class="revelacion__frase">' + fraseMarca() + '</p>' +
                    '<div class="revelacion__numero" id="rev-n"></div>';

      /* El contexto de audio se abre AQUÍ, dentro del gesto que llamó a
         revelar(), que es el único momento en que el navegador lo desbloquea.
         El redoble ya no suena aquí: suena cuando empieza la cuenta atrás, que
         es a lo que acompaña. */
      if (sonido.hay()) sonido.despertar();

      var n = segundos;
      var hueco = p.querySelector('#rev-n');
      var cortar = function () {};

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

      return entradaDramatica(p).then(function () {
        if (sonido.hay()) cortar = sonido.redoble(segundos + 0.2);
        return tick();
      });
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
      '<p class="revelacion__frase revelacion__frase--hecha">' + fraseMarca() + '</p>' +
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
