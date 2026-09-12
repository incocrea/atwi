/* ==========================================================================
   ATWI · partida.js
   La sala. Aquí se juega.

   CÓMO ES UNA PARTIDA (docs/00 y docs/03):
     · Turnos ALTERNOS y en vivo. Nadie graba sin haber escuchado antes al otro,
       salvo quien abre, que no tiene a quién escuchar.
     · Quién abre se decide como en ajedrez: por sorteo, y se enseña antes de
       empezar. En la revancha abre el otro.
     · De 1 a 5 turnos por persona, decididos al proponer.
     · El juez está presente todo el rato. Entre turno y turno dice una frase
       FIJA de las cinco: ni evalúa ni comenta, solo acusa recibo y pasa el
       turno. No se llama al modelo hasta el final.
     · Al cerrarse el último turno, una frase de cierre y a deliberar.

   Esta versión juega en UN SOLO DISPOSITIVO, por turnos. Es el modo que el
   documento permite para los temas del catálogo. El modo con dos teléfonos
   necesita el servidor, y llega después.
   ========================================================================== */
window.ATWI = window.ATWI || {};

(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var datos = window.ATWI.datos;
  var icono = window.ATWI.icono;
  var grabadora = window.ATWI.grabadora;
  var veredicto = window.ATWI.veredicto;
  var sonido = window.ATWI.sonido;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function alAzar(l) { return l[Math.floor(Math.random() * l.length)]; }

  /* Estado de la partida en curso */
  var P = null;

  function caja() { return $('#m-partida .modal__cuerpo'); }
  function pie() { return $('#m-partida .modal__pie'); }

  /* --- Arranque --------------------------------------------------------------
     `quien` son los dos nombres. El orden de la lista ES el orden de turno, y
     sale de un sorteo hecho antes de entrar aquí. */
  function empezar(op) {
    P = {
      tema: op.tema,
      modo: op.modo,                 // 'debate' | 'negociacion'
      turnos: op.turnos,             // por persona
      publico: op.publico || 'pareja',
      quien: op.quien,               // ['Harold', 'Marta'], ya sorteados
      intervenciones: [],            // {persona, turno, audio, tipo, segundos}
      i: 0,                          // intervención actual, 0..(turnos*2 - 1)
      estado: 'aviso'
    };
    abrir();
    pintarAviso();
  }

  function abrir() {
    var m = $('#m-partida');
    m.hidden = false;
    m.classList.add('modal--inmersivo');
  }

  function cerrar() {
    var m = $('#m-partida');
    if (m) m.hidden = true;
    grabadora.cerrar();
    P = null;
  }

  /* Quién habla ahora y qué número de turno suyo es */
  function turnoActual() {
    return {
      persona: P.i % 2,                       // 0 o 1
      nombre: P.quien[P.i % 2],
      numero: Math.floor(P.i / 2) + 1,
      esUltima: P.i === P.turnos * 2 - 1,
      esPrimera: P.i === 0
    };
  }

  /* --- 1. El sorteo, antes de empezar ---------------------------------------- */
  function pintarAviso() {
    var t = turnoActual();
    caja().innerHTML =
      '<div class="sala">' +
        '<div class="sala__tema">' +
          '<p class="sala__enunciado">' + esc(P.tema.enunciado) + '</p>' +
          '<div class="sala__chips">' +
            '<span class="chip chip--' + P.modo + '">' +
              (P.modo === 'debate' ? 'Debate' : 'Negociación') + '</span>' +
            '<span class="chip">' + P.turnos + (P.turnos === 1 ? ' turno' : ' turnos') + ' cada uno</span>' +
          '</div>' +
        '</div>' +
        '<div class="sorteo">' +
          '<p class="sorteo__que">Abre el debate</p>' +
          '<p class="sorteo__quien">' + esc(P.quien[0]) + '</p>' +
          '<p class="sorteo__como">Salió por sorteo. En la revancha abre ' + esc(P.quien[1]) + '.</p>' +
        '</div>' +
        '<div class="sala__posturas">' +
          '<p class="chico"><strong>' + esc(P.quien[0]) + ':</strong> ' + esc(P.tema.a) + '</p>' +
          '<p class="chico"><strong>' + esc(P.quien[1]) + ':</strong> ' + esc(P.tema.b) + '</p>' +
        '</div>' +
      '</div>';
    pie().innerHTML =
      '<button class="boton boton--bloque boton--grande" data-accion="p-listo">' +
        'Empezar' + '</button>';
  }

  /* --- 2. El turno ------------------------------------------------------------ */
  function pintarTurno() {
    var t = turnoActual();
    var tope = cfg.reglas.segundosPorTurno;
    P.estado = 'turno';

    caja().innerHTML =
      '<div class="sala">' +
        '<p class="sala__recordatorio">' + esc(P.tema.enunciado) + '</p>' +

        '<div class="juez" id="juez">' +
          '<div class="juez__cara" aria-hidden="true">' + (P.modo === 'debate' ? '⚖️' : '🤝') + '</div>' +
          '<p class="juez__dice" id="juez-dice">Te escucho.</p>' +
        '</div>' +

        '<div class="turno">' +
          '<p class="turno__quien">' + esc(t.nombre) + '</p>' +
          '<p class="turno__cual">Turno ' + t.numero + ' de ' + P.turnos + '</p>' +
          '<p class="turno__postura">' + esc(t.persona === 0 ? P.tema.a : P.tema.b) + '</p>' +
        '</div>' +

        '<div class="reloj" id="reloj"><span id="reloj-n">0:00</span>' +
          '<span class="reloj__tope">de 0:' + (tope < 10 ? '0' : '') + tope + '</span></div>' +

        (t.esPrimera
          ? '<p class="sala__nota">Abres tú, así que todavía no hay nada que escuchar.</p>'
          : '<p class="sala__nota">Acabas de oír a ' + esc(P.quien[(P.i - 1) % 2]) + '. Respóndele.</p>') +
      '</div>';

    pie().innerHTML =
      '<button class="boton boton--bloque boton--grande boton--' + P.modo + '" data-accion="p-grabar">' +
        icono('micro', 24) + 'Mantén para grabar' + '</button>' +
      '<p class="chico centrado" style="color:rgba(255,255,255,.6);margin-top:var(--e-2)">' +
        'Suelta cuando termines. Máximo ' + tope + ' segundos.</p>';
  }

  function relojTexto(s) {
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function empezarAGrabar() {
    if (grabadora.grabando()) return;
    if (!grabadora.sePuede()) return fallo(grabadora.porQueNo());

    var boton = $('[data-accion="p-grabar"]');
    boton.classList.add('grabando');
    boton.innerHTML = icono('micro', 24) + 'Grabando…';
    $('#juez-dice').textContent = 'Te escucho.';
    $('#juez').classList.add('juez--escuchando');

    grabadora.empezar(
      function (s) { $('#reloj-n').textContent = relojTexto(s); $('#reloj').classList.add('reloj--corriendo'); },
      cfg.reglas.segundosPorTurno,
      function () { pararDeGrabar(); }
    ).catch(function () {
      boton.classList.remove('grabando');
      fallo('No se pudo abrir el micrófono. Comprueba el permiso del navegador.');
    });
  }

  function pararDeGrabar() {
    if (!grabadora.grabando()) return;
    grabadora.parar().then(function (r) {
      var boton = $('[data-accion="p-grabar"]');
      if (boton) boton.classList.remove('grabando');
      $('#juez').classList.remove('juez--escuchando');

      if (!r || r.segundos < 2) {
        $('#juez-dice').textContent = 'Eso fue muy corto. Cuéntamelo otra vez.';
        if (boton) boton.innerHTML = icono('micro', 24) + 'Mantén para grabar';
        return;
      }

      var t = turnoActual();
      P.intervenciones.push({
        persona: t.persona, turno: t.numero,
        audio: r.audio, tipo: r.tipo, segundos: r.segundos
      });
      acusarRecibo(t);
    });
  }

  /* El juez acusa recibo con una de las cinco frases fijas. No evalúa, no
     comenta y no llama al modelo: aquí solo pasa el turno. */
  function acusarRecibo(t) {
    P.estado = 'recibo';
    var ultima = t.esUltima;
    $('#juez-dice').textContent = ultima
      ? alAzar(cfg.frasesDeCierre)
      : alAzar(cfg.frasesDelJuez);
    $('#juez').classList.add('juez--asiente');

    pie().innerHTML =
      '<button class="boton boton--bloque boton--grande" data-accion="p-seguir">' +
        (ultima ? 'Ver el resultado' : 'Le toca a ' + esc(P.quien[(P.i + 1) % 2])) +
      '</button>';
  }

  function seguir() {
    var t = turnoActual();
    if (t.esUltima) return deliberar();
    P.i++;
    pintarTurno();
  }

  /* --- 3. El resultado --------------------------------------------------------
     Todavía sin servidor: no hay transcripción ni juez de verdad, así que se
     enseña el efecto con un resultado simulado y se dice que lo es. */
  function deliberar() {
    P.estado = 'deliberando';
    caja().innerHTML =
      '<div class="sala sala--centrada">' +
        '<div class="juez juez--pensando">' +
          '<div class="juez__cara" aria-hidden="true">' + (P.modo === 'debate' ? '⚖️' : '🤝') + '</div>' +
          '<p class="juez__dice">Deliberando…</p>' +
        '</div>' +
        '<p class="sala__nota">' + P.intervenciones.length + ' intervenciones grabadas · ' +
          Math.round(P.intervenciones.reduce(function (a, b) { return a + b.segundos; }, 0)) + ' segundos</p>' +
      '</div>';
    pie().innerHTML = '<button class="boton boton--bloque boton--grande" data-accion="p-revelar">' +
      'Ver el resultado</button>';
  }

  function revelar() {
    var m = $('#m-partida');
    m.hidden = true;
    var ganador = alAzar(P.quien);
    veredicto.revelar({
      modo: P.modo,
      publico: P.publico,
      ganador: ganador,
      tema: P.tema.titulo,
      acuerdo: P.modo === 'negociacion' ? P.tema.ejemplo : null,
      alCerrar: function () {
        var p = datos.perfil();
        var jugados = p.temasJugados.slice();
        if (jugados.indexOf(P.tema.id) === -1) jugados.push(P.tema.id);
        datos.actualizar({
          temasJugados: jugados,
          debates: p.debates + (P.modo === 'debate' ? 1 : 0),
          acuerdos: p.acuerdos + (P.modo === 'negociacion' ? 1 : 0)
        });
        cerrar();
        if (window.ATWI.alTerminarPartida) window.ATWI.alTerminarPartida();
      }
    });
  }

  function fallo(texto) {
    var n = $('#juez-dice');
    if (n) n.textContent = texto;
  }

  /* --- Eventos ---------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('#m-partida [data-accion]');
    if (!b) return;
    var a = b.dataset.accion;
    if (a === 'p-listo') pintarTurno();
    else if (a === 'p-seguir') seguir();
    else if (a === 'p-revelar') revelar();
    else if (a === 'p-salir') {
      if (confirm('Si sales ahora, la partida se pierde y no cuenta para nadie. ¿Salir?')) cerrar();
    }
  });

  /* Mantener pulsado para grabar. Se escucha en el documento porque el botón se
     vuelve a pintar en cada turno. */
  ['mousedown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (e.target.closest('[data-accion="p-grabar"]')) {
        if (ev === 'touchstart') e.preventDefault();
        empezarAGrabar();
      }
    }, { passive: ev !== 'touchstart' });
  });
  ['mouseup', 'touchend', 'touchcancel'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (grabadora.grabando()) pararDeGrabar();
    });
  });

  window.ATWI.partida = { empezar: empezar, cerrar: cerrar };
})();
