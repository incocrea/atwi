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

   UN SOLO BOTÓN PARA TRES COSAS. Grabar, parar y agregar son el mismo control
   en tres estados, no tres botones en tres sitios: «Grabar mi turno» abre el
   micro, «Parar» lo cierra y «Agregar algo más» lo vuelve a abrir sobre lo ya
   grabado. Al lado, y solo cuando hay algo que borrar, está Borrar, que
   pregunta antes.

   PARAR NO ES MANDAR. Al parar se entra en revisión: se puede escuchar lo
   dicho, mandarlo sin escucharlo, agregar más si sobran segundos o borrarlo y
   empezar de nuevo. El juez no recibe nada hasta que se pulsa mandar. Nadie
   pierde un turno por un resbalón ni por quedarse corto de tiempo.

   LO DICHO SE QUEDA A MANO. Cada intervención cerrada entra en una lista que
   se puede volver a escuchar antes de contestar. Es la misma idea que los
   turnos en vivo: no se responde de memoria a algo que se oyó una sola vez.

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
  var iconoSVG = window.ATWI.iconoSVG;
  var grabadora = window.ATWI.grabadora;
  var veredicto = window.ATWI.veredicto;
  var sonido = window.ATWI.sonido;

  /* Menos de esto no es una intervención: es un resbalón. */
  var MINIMO = 2;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function alAzar(l) { return l[Math.floor(Math.random() * l.length)]; }
  function relojTexto(s) {
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  /* Estado de la partida en curso */
  var P = null;
  var abriendo = false;      // el permiso del micro tarda; dos toques no valen dos
  var sonando = null;        // clave de la pista que se está oyendo, o null

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
      intervenciones: [],            // {persona, turno, audio, tipo, segundos, url}
      i: 0,                          // intervención actual, 0..(turnos*2 - 1)
      borrador: null,                // lo grabado y todavía NO entregado
      estado: 'aviso'
    };
    abrir();
    pintarAviso();
  }

  function abrir() {
    var m = $('#m-partida');
    m.hidden = false;
    m.classList.add('modal--inmersivo');
    /* El color de la sala es el del modo. Juicio va en coral y Pacto en menta,
       y no se mezclan nunca: es la única regla de color que el juego no negocia. */
    m.setAttribute('data-ctx', 'sala-' + P.modo);
  }

  function cerrar() {
    var m = $('#m-partida');
    if (m) { m.hidden = true; m.removeAttribute('data-ctx'); }
    pararEscucha();
    tirarBorrador();
    if (P) P.intervenciones.forEach(function (v) { if (v.url) URL.revokeObjectURL(v.url); });
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

  /* La cara del juez es el icono ILUSTRADO del modo, no un emoji: el emoji lo
     dibuja cada teléfono a su manera y el juez tiene que ser el mismo en todos. */
  function cara() {
    return '<div class="juez__cara" aria-hidden="true">' + icono(P.modo, 46) + '</div>';
  }

  /* Dentro de la sala NO entra el lavanda de la marca: el botón principal lleva
     el color del modo. Un color por modo y no se mezclan. */
  function principal(accion, texto, ico, apagado) {
    return '<button class="boton boton--bloque boton--grande boton--' + P.modo + '"' +
      ' data-accion="' + accion + '"' + (apagado ? ' disabled' : '') + '>' +
      (ico || '') + esc(texto) + '</button>';
  }

  function juez(clase, dice) {
    return '<div class="juez' + (clase ? ' ' + clase : '') + '" id="juez">' + cara() +
      '<p class="juez__dice" id="juez-dice">' + esc(dice) + '</p></div>';
  }

  /* ==========================================================================
     LAS PISTAS
     Un solo <audio> para toda la sala: si suena una cosa, no suena otra. Cada
     pista lleva una clave —«b» el borrador, «i0», «i1»… las ya entregadas— y
     los eventos del audio buscan la fila de esa clave para pintarla.
     ========================================================================== */
  function pistaDe(clave) {
    if (clave === 'b') return P.borrador;
    return P.intervenciones[Number(clave.slice(1))];
  }

  /**
   * Una fila reproducible. `grande` es la del borrador en revisión, que manda
   * en la pantalla; las de la lista van compactas.
   */
  function pista(clave, titulo, meta, grande, ultima) {
    var p = pistaDe(clave);
    return '<div class="pista' + (grande ? ' pista--grande' : '') +
             (ultima ? ' pista--ultima' : '') + '" data-pista="' + clave + '">' +
        '<button type="button" class="pista__play" data-oir="' + clave + '"' +
                ' aria-label="Escuchar ' + esc(titulo) + '">' +
          '<span class="pista__icono">' + iconoSVG('play', grande ? 26 : 20) + '</span>' +
        '</button>' +
        '<div class="pista__quien">' +
          '<span class="pista__titulo">' + esc(titulo) + '</span>' +
          '<span class="pista__meta">' + meta + '</span>' +
        '</div>' +
        '<div class="pista__barra"><span></span></div>' +
      '</div>';
  }

  /** La lista de lo ya dicho, para volver a oírlo antes de contestar. */
  function loDicho() {
    if (!P.intervenciones.length) return '';
    var total = P.intervenciones.length;
    return '<div class="dicho">' +
        '<p class="dicho__titulo">' + iconoSVG('historial', 16) + 'Lo que se dijo hasta ahora</p>' +
        P.intervenciones.map(function (v, n) {
          var ultima = n === total - 1;
          return pista('i' + n, P.quien[v.persona],
            'Turno ' + v.turno + ' · ' + relojTexto(v.segundos) +
              (ultima ? ' <span class="dicho__nueva">lo último</span>' : ''),
            false, ultima);
        }).join('') +
      '</div>';
  }

  function elAudio() {
    var a = $('#sala-audio');
    if (!a) {
      a = document.createElement('audio');
      a.id = 'sala-audio';
      /* `auto` y no `metadata`: un WebM de MediaRecorder no trae duración, y si
         se le da al play con la mitad sin decodificar, el navegador da por
         terminado el audio a mitad de frase. Son blobs locales: no cuesta nada. */
      a.preload = 'auto';
      $('#m-partida').appendChild(a);
      ['play', 'pause', 'ended', 'timeupdate'].forEach(function (ev) {
        a.addEventListener(ev, function () { pintarPista(ev); });
      });
    }
    return a;
  }

  function oir(clave) {
    var a = elAudio();
    var p = pistaDe(clave);
    if (!p || !p.url) return;
    if (sonando === clave && !a.paused) { a.pause(); return; }
    if (sonando !== clave) {
      limpiarPista(sonando);
      sonando = clave;
      a.src = p.url;
      a.currentTime = 0;
    }
    a.play();
  }

  function pararEscucha() {
    var a = $('#sala-audio');
    if (a && !a.paused) a.pause();
  }

  function limpiarPista(clave) {
    if (!clave) return;
    var f = $('[data-pista="' + clave + '"]');
    if (!f) return;
    f.classList.remove('pista--sonando');
    var b = $('.pista__barra span', f);
    if (b) b.style.width = '0%';
    var ic = $('.pista__icono', f);
    if (ic) ic.innerHTML = iconoSVG('play', f.classList.contains('pista--grande') ? 26 : 20);
  }

  function pintarPista(ev) {
    if (!P || !sonando) return;
    var a = $('#sala-audio');
    var f = $('[data-pista="' + sonando + '"]');
    if (!f) return;
    var p = pistaDe(sonando);
    var grande = f.classList.contains('pista--grande');

    if (ev === 'ended') { a.currentTime = 0; limpiarPista(sonando); return; }

    f.classList.toggle('pista--sonando', !a.paused);
    var ic = $('.pista__icono', f);
    if (ic) ic.innerHTML = iconoSVG(a.paused ? 'play' : 'pausa', grande ? 26 : 20);
    var b = $('.pista__barra span', f);
    /* El ancho sale de los segundos que contamos nosotros: `a.duration` de un
       WebM de MediaRecorder vale Infinity y no sirve para nada. */
    if (b) b.style.width = Math.min(100, (a.currentTime / ((p && p.segundos) || 1)) * 100) + '%';
  }

  /* ==========================================================================
     1. EL SORTEO, ANTES DE EMPEZAR
     ========================================================================== */
  function pintarAviso() {
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
          '<p class="sorteo__que">Abre ' + (P.modo === 'debate' ? 'el debate' : 'la negociación') + '</p>' +
          '<p class="sorteo__quien">' + esc(P.quien[0]) + '</p>' +
          /* La revancha es cosa del modo Debate. En Negociación lo equivalente
             no revierte un resultado: encadena otra ronda. */
          '<p class="sorteo__como">Salió por sorteo. En la ' +
            (P.modo === 'debate' ? 'revancha' : 'próxima') + ' abre ' + esc(P.quien[1]) + '.</p>' +
        '</div>' +
        '<div class="sala__posturas">' +
          '<p class="chico"><strong>' + esc(P.quien[0]) + ':</strong> ' + esc(P.tema.a) + '</p>' +
          '<p class="chico"><strong>' + esc(P.quien[1]) + ':</strong> ' + esc(P.tema.b) + '</p>' +
        '</div>' +
      '</div>';
    pie().innerHTML = principal('p-listo', 'Empezar');
  }

  /* ==========================================================================
     2. EL TURNO
     El reloj no aparece aquí: a 0:00 no dice nada y ocupa el sitio de lo que sí
     importa antes de hablar, que es volver a oír lo que dijo el otro.
     ========================================================================== */
  function pintarTurno() {
    var t = turnoActual();
    P.estado = 'turno';
    tirarBorrador();

    caja().innerHTML =
      '<div class="sala">' +
        '<p class="sala__recordatorio">' + esc(P.tema.enunciado) + '</p>' +
        juez('', t.esPrimera ? 'Abres tú. Te escucho.' : 'Te toca contestar. Te escucho.') +
        '<div class="turno">' +
          '<p class="turno__quien">' + esc(t.nombre) + '</p>' +
          '<p class="turno__cual">Turno ' + t.numero + ' de ' + P.turnos + '</p>' +
          '<p class="turno__postura">' + esc(t.persona === 0 ? P.tema.a : P.tema.b) + '</p>' +
        '</div>' +
        loDicho() +
        (t.esPrimera
          ? '<p class="sala__nota">Abres tú, así que todavía no hay nada que escuchar.</p>'
          : '') +
      '</div>';

    pie().innerHTML = botonDeGrabar('grabar') +
      '<p class="chico centrado pie-nota">Tocas para empezar y tocas para parar. ' +
        'Podrás escucharlo antes de mandarlo.</p>';
  }

  /* ==========================================================================
     3. GRABAR · PARAR · AGREGAR — el mismo botón en tres estados
     ========================================================================== */
  function botonDeGrabar(estado) {
    if (estado === 'parar') {
      return '<button class="boton boton--bloque boton--grande boton--parar grabando"' +
                    ' data-accion="p-parar">' + iconoSVG('parar', 22) + 'Parar</button>';
    }
    if (estado === 'agregar') {
      return '<button class="boton boton--suave" data-accion="p-agregar">' +
               iconoSVG('micro', 20) + 'Agregar algo más</button>';
    }
    return principal('p-grabar', 'Grabar mi turno', iconoSVG('micro', 24));
  }

  /* Dos maneras de abrir el micro: empezar de cero y seguir sobre lo ya
     grabado. La segunda REANUDA la misma grabación en vez de abrir otra: dos
     archivos pegados no dan un archivo válido, una grabación reanudada sí. */
  function empezarAGrabar(agregando) {
    if (abriendo || grabadora.grabando()) return;
    if (!grabadora.sePuede()) return fallo(grabadora.porQueNo());

    pararEscucha();

    var aCadaSegundo = function (s) {
      var n = $('#reloj-n');
      if (n) { n.textContent = relojTexto(s); $('#reloj').classList.add('reloj--corriendo'); }
    };
    var alTope = function () { pausarGrabacion(); };

    if (agregando && grabadora.pausada()) {
      pintarGrabando(true);
      grabadora.reanudar();
      return;
    }

    abriendo = true;
    pintarGrabando(false);
    grabadora.empezar(aCadaSegundo, cfg.reglas.segundosPorTurno, alTope)
      .then(function () { abriendo = false; })
      .catch(function () {
        abriendo = false;
        /* Se vuelve al turno: dejar la pantalla de «grabando» sin grabar nada
           sería mentirle a quien está hablando. */
        pintarTurno();
        fallo('No se pudo abrir el micrófono. Comprueba el permiso del navegador.');
      });
  }

  /* Mientras el micro está abierto la pantalla es una sola cosa: el reloj y el
     botón de parar. Igual venga de grabar o de agregar. */
  function pintarGrabando(agregando) {
    var t = turnoActual();
    var tope = cfg.reglas.segundosPorTurno;
    P.estado = 'grabando';

    caja().innerHTML =
      '<div class="sala">' +
        '<p class="sala__recordatorio">' + esc(P.tema.enunciado) + '</p>' +
        juez('juez--escuchando', 'Te escucho.') +
        '<div class="turno">' +
          '<p class="turno__quien">' + esc(t.nombre) + '</p>' +
          '<p class="turno__cual">Turno ' + t.numero + ' de ' + P.turnos + '</p>' +
        '</div>' +
        '<div class="reloj reloj--corriendo" id="reloj">' +
          '<span id="reloj-n">' + relojTexto(grabadora.segundos()) + '</span>' +
          '<span class="reloj__tope">de ' + relojTexto(tope) + '</span></div>' +
        (agregando ? '<p class="sala__nota">Sigues sobre lo que ya grabaste.</p>' : '') +
      '</div>';

    pie().innerHTML = botonDeGrabar('parar') +
      '<p class="chico centrado pie-nota">Estás grabando. Toca para parar.</p>';
  }

  /* ==========================================================================
     4. LA REVISIÓN: parar no es mandar
     ========================================================================== */
  function pausarGrabacion() {
    if (!grabadora.grabando()) return;
    grabadora.pausar().then(function (r) {
      if (!r) return;
      tirarBorrador();
      P.borrador = {
        blob: r.audio, tipo: r.tipo, segundos: r.segundos,
        url: URL.createObjectURL(r.audio)
      };
      pintarRevision();
    });
  }

  function tirarBorrador() {
    if (P && P.borrador && P.borrador.url) URL.revokeObjectURL(P.borrador.url);
    if (P) P.borrador = null;
    if (sonando === 'b') { pararEscucha(); sonando = null; }
  }

  function pintarRevision(confirmandoBorrado) {
    var t = turnoActual();
    var tope = cfg.reglas.segundosPorTurno;
    var b = P.borrador;
    var quedan = Math.max(0, tope - b.segundos);
    var corto = b.segundos < MINIMO;
    /* Agregar solo tiene sentido si sobran segundos de verdad y el navegador
       sabe reanudar. Safari viejo no sabe: allí queda borrar y volver a grabar. */
    var puedeAgregar = quedan >= MINIMO && grabadora.pausada() && grabadora.sabeAnadir();
    P.estado = 'revision';

    caja().innerHTML =
      '<div class="sala">' +
        '<p class="sala__recordatorio">' + esc(P.tema.enunciado) + '</p>' +
        juez('', 'Todavía no lo he oído. Lo escucho cuando me lo mandes.') +
        '<div class="turno">' +
          '<p class="turno__quien">' + esc(t.nombre) + '</p>' +
          '<p class="turno__cual">Turno ' + t.numero + ' de ' + P.turnos + '</p>' +
        '</div>' +
        pista('b', 'Tu turno, sin mandar',
          relojTexto(b.segundos) + ' · ' +
          (quedan > 0 ? 'te quedan ' + quedan + ' s' : 'sin tiempo de sobra'), true, false) +
        (corto
          ? '<p class="sala__nota sala__nota--ojo">Eso duró ' + b.segundos + ' s. ' +
            (puedeAgregar ? 'Agrega algo antes de mandarlo.' : 'Bórralo y grábalo otra vez.') + '</p>'
          : '<p class="sala__nota">Escúchalo si quieres, o mándalo tal cual.</p>') +
        loDicho() +
      '</div>';

    pie().innerHTML =
      principal('p-mandar', t.esUltima ? 'Mandar y cerrar' : 'Mandar mi turno',
                iconoSVG('listo', 22), corto) +
      (confirmandoBorrado
        /* Se pregunta aquí dentro y no con un `confirm()` del navegador: eso
           rompe la pantalla completa y saca a la persona del juego. */
        ? '<div class="confirmar">' +
            '<p class="confirmar__que">¿Borrar lo grabado y empezar de nuevo?</p>' +
            '<div class="confirmar__opciones">' +
              '<button class="boton boton--suave" data-accion="p-borrar-no">Seguir con esto</button>' +
              '<button class="boton boton--suave boton--borrar" data-accion="p-borrar-si">' +
                iconoSVG('papelera', 18) + 'Sí, borrar</button>' +
            '</div>' +
          '</div>'
        : '<div class="revision__otras">' +
            (puedeAgregar ? botonDeGrabar('agregar') : '') +
            '<button class="boton boton--suave boton--borrar" data-accion="p-borrar">' +
              iconoSVG('papelera', 18) + 'Borrar</button>' +
          '</div>');
  }

  /* ==========================================================================
     5. MANDAR EL TURNO
     ========================================================================== */
  function mandar() {
    if (!P.borrador || P.borrador.segundos < MINIMO) return;
    pararEscucha();
    var t = turnoActual();
    grabadora.terminar().then(function (r) {
      var blob = r ? r.audio : P.borrador.blob;
      P.intervenciones.push({
        persona: t.persona, turno: t.numero,
        audio: blob,
        tipo: r ? r.tipo : P.borrador.tipo,
        segundos: r ? r.segundos : P.borrador.segundos,
        url: URL.createObjectURL(blob)
      });
      tirarBorrador();
      acusarRecibo(t);
    });
  }

  function borrar() {
    pararEscucha();
    grabadora.descartar();
    tirarBorrador();
    pintarTurno();
  }

  /* El juez acusa recibo con una de las cinco frases fijas. No evalúa, no
     comenta y no llama al modelo: aquí solo pasa el turno. */
  function acusarRecibo(t) {
    P.estado = 'recibo';
    var ultima = t.esUltima;

    caja().innerHTML =
      '<div class="sala">' +
        '<p class="sala__recordatorio">' + esc(P.tema.enunciado) + '</p>' +
        juez('juez--asiente', ultima ? alAzar(cfg.frasesDeCierre) : alAzar(cfg.frasesDelJuez)) +
        loDicho() +
      '</div>';

    pie().innerHTML = principal('p-seguir',
      ultima ? 'Ver el resultado' : 'Le toca a ' + P.quien[(P.i + 1) % 2]);
  }

  function seguir() {
    var t = turnoActual();
    if (t.esUltima) return deliberar();
    P.i++;
    pintarTurno();
  }

  /* ==========================================================================
     6. EL RESULTADO
     Todavía sin servidor: no hay transcripción ni juez de verdad, así que se
     enseña el efecto con un resultado simulado y se dice que lo es.
     ========================================================================== */
  function deliberar() {
    P.estado = 'deliberando';
    pararEscucha();
    caja().innerHTML =
      '<div class="sala sala--centrada">' +
        juez('juez--pensando', 'Deliberando…') +
        '<p class="sala__nota">' + P.intervenciones.length + ' intervenciones grabadas · ' +
          P.intervenciones.reduce(function (a, b) { return a + b.segundos; }, 0) + ' segundos</p>' +
      '</div>';
    pie().innerHTML = principal('p-revelar', 'Ver el resultado');
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
    var oirlo = e.target.closest('#m-partida [data-oir]');
    if (oirlo) return oir(oirlo.dataset.oir);

    var b = e.target.closest('#m-partida [data-accion]');
    if (!b) return;
    var a = b.dataset.accion;
    if (a === 'p-listo') pintarTurno();
    else if (a === 'p-grabar') empezarAGrabar(false);
    else if (a === 'p-agregar') empezarAGrabar(true);
    else if (a === 'p-parar') pausarGrabacion();
    else if (a === 'p-mandar') mandar();
    else if (a === 'p-borrar') pintarRevision(true);
    else if (a === 'p-borrar-no') pintarRevision(false);
    else if (a === 'p-borrar-si') borrar();
    else if (a === 'p-seguir') seguir();
    else if (a === 'p-revelar') revelar();
    else if (a === 'p-salir') {
      if (confirm('Si sales ahora, la partida se pierde y no cuenta para nadie. ¿Salir?')) cerrar();
    }
  });

  window.ATWI.partida = { empezar: empezar, cerrar: cerrar };
})();
