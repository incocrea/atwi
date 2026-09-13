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

  /* El nombre del modo con el «IA» resaltado: negoc·IA·ción, controvers·IA. */
  function nombreModo(clave) {
    var m = (cfg.modos || {})[clave];
    if (!m) return '';
    return esc(m.partido[0]) + '<b class="ia">' + esc(m.partido[1]) + '</b>' + esc(m.partido[2]);
  }
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
  /**
   * `posturas` son los dos nombres en el orden de las POSTURAS: el primero
   * defiende la A y el segundo la B. Eso lo decide quien propone, no el azar.
   * `abre` es el índice de quien habla primero, y ESO sí sale del sorteo.
   * Son dos cosas distintas y antes iban mezcladas en una sola lista.
   */
  var COLOR_POR_DEFECTO = ['#7A6AD8', '#F0B429'];

  function empezar(op) {
    var gente = (op.posturas || op.quien || ['Tú', 'La otra parte']).map(ficha);
    var abre = typeof op.abre === 'number' ? op.abre : 0;
    P = {
      tema: op.tema,
      modo: op.modo,                 // 'debate' | 'negociacion'
      turnos: op.turnos,             // por persona
      publico: op.publico || 'pareja',
      jugadores: [
        Object.assign({ letra: 'A', texto: op.tema.a }, gente[0]),
        Object.assign({ letra: 'B', texto: op.tema.b }, gente[1])
      ],
      orden: [abre, 1 - abre],       // índices sobre `jugadores`
      intervenciones: [],            // {jugador, turno, audio, tipo, segundos, url}
      i: 0,                          // intervención actual, 0..(turnos*2 - 1)
      borrador: null,                // lo grabado y todavía NO entregado
      estado: 'aviso'
    };
    separarFichas();
    abrir();
    /* Las poses del encuentro se piden YA, aunque falten cinco segundos para
       verlas: así la entrada no empieza con una figura a medio pintar. */
    window.ATWI.precargarPoses(
      P.jugadores.map(function (j) { return j.avatar; }),
      [P.modo === 'debate' ? 'plante' : 'puno']);
    pintarAviso();
  }

  /* Cada jugador llega con su ficha —nombre, dibujo y color—. Se admite también
     un nombre suelto por si alguna llamada vieja lo pasa así. */
  function ficha(x, i) {
    if (typeof x === 'string') x = { nombre: x };
    return {
      nombre: x.nombre || '?',
      avatar: x.avatar || (i ? 'luna' : 'kai'),
      color: x.color || COLOR_POR_DEFECTO[i] || COLOR_POR_DEFECTO[0]
    };
  }

  /* Dos fichas iguales no se distinguen, que es justo para lo que sirven. Pero
     lo que se separa es el ARO, no el personaje: dos Kai en la misma sala valen
     —cada uno con su aro— y cambiarle el personaje a alguien porque el otro
     eligió el mismo es decidir por él. */
  function separarFichas() {
    var a = P.jugadores[0], b = P.jugadores[1];
    if (a.color.toLowerCase() !== b.color.toLowerCase()) return;
    b.color = b.color.toLowerCase() === COLOR_POR_DEFECTO[1].toLowerCase()
      ? COLOR_POR_DEFECTO[0] : COLOR_POR_DEFECTO[1];
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
    if (P && P.limpiarEncuentro) P.limpiarEncuentro();
    cerrarReproductor();
    tirarBorrador();
    if (P) P.intervenciones.forEach(function (v) { if (v.url) URL.revokeObjectURL(v.url); });
    grabadora.cerrar();
    P = null;
  }

  /* Quién habla ahora, qué defiende y qué número de turno suyo es */
  function turnoActual() {
    var j = P.orden[P.i % 2];                 // índice del jugador
    return {
      jugador: j,
      nombre: P.jugadores[j].nombre,
      avatar: P.jugadores[j].avatar,
      color: P.jugadores[j].color,
      postura: P.jugadores[j].texto,
      letra: P.jugadores[j].letra,
      numero: Math.floor(P.i / 2) + 1,
      esUltima: P.i === P.turnos * 2 - 1,
      esPrimera: P.i === 0
    };
  }

  /** A quién acaba de escuchar quien habla ahora. */
  function elOtro() {
    return P.jugadores[P.orden[(P.i + 1) % 2]];
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
   * La tarjeta del borrador en revisión. El avance y la velocidad los lleva el
   * reproductor flotante, así que aquí solo hace falta el botón y el dato.
   */
  function pista(clave, titulo, meta) {
    return '<div class="pista pista--grande" data-pista="' + clave + '">' +
        '<button type="button" class="pista__play" data-oir="' + clave + '"' +
                ' aria-label="Escuchar ' + esc(titulo) + '">' +
          '<span class="pista__icono">' + iconoSVG('play', 26) + '</span>' +
        '</button>' +
        '<div class="pista__quien">' +
          '<span class="pista__titulo">' + esc(titulo) + '</span>' +
          '<span class="pista__meta">' + meta + '</span>' +
        '</div>' +
      '</div>';
  }

  /**
   * LO QUE SE DIJO, EN RUEDAS.
   * Una fila por cada seis intervenciones. Cada rueda ES LA FICHA de quien
   * habló: su dibujo sobre su color, igual que su avatar en el perfil. Se
   * reconoce de un vistazo sin gastar una fila entera por audio, y con 5 turnos
   * —diez audios— siguen cabiendo en dos líneas.
   *
   * El color no lo pone el modo sino cada persona: si una de las dos voces
   * llevara el coral de Juicio o el menta de Pacto, parecería que la sala es
   * suya.
   */
  function loDicho() {
    if (!P.intervenciones.length) return '';
    var total = P.intervenciones.length;
    return '<div class="dicho">' +
        '<p class="dicho__titulo">' + iconoSVG('historial', 16) + 'Lo que se dijo · toca para oírlo</p>' +
        '<div class="ruedas">' +
          P.intervenciones.map(function (v, n) {
            var j = P.jugadores[v.jugador];
            return '<button type="button" class="rueda' +
                     (n === total - 1 ? ' rueda--ultima' : '') + '"' +
                   ' style="--voz:' + esc(j.color) + '"' +
                   ' data-oir="i' + n + '" data-rueda="i' + n + '"' +
                   ' aria-label="Escuchar a ' + esc(j.nombre) + ', turno ' + v.turno + '">' +
                window.ATWI.fichaHTML(j.avatar, 'rueda__cara', j.color) +
                '<span class="rueda__n">' + v.turno + '</span>' +
              '</button>';
          }).join('') +
        '</div>' +
        '<p class="dicho__leyenda">' +
          P.jugadores.map(function (j) {
            return '<span class="leyenda">' +
              window.ATWI.fichaHTML(j.avatar, 'avatar--mini', j.color) +
              esc(j.nombre) + ' · ' + j.letra + '</span>';
          }).join('') +
        '</p>' +
      '</div>';
  }

  /* ==========================================================================
     EL REPRODUCTOR FLOTANTE
     Se levanta sobre la sala al tocar una rueda. Lleva lo que hace falta para
     volver a oír algo de verdad: barra que se puede arrastrar y velocidad,
     porque escuchar un minuto entero para pescar una frase es insufrible.
     ========================================================================== */
  var VELOCIDADES = [1, 1.25, 1.5, 2];
  var velocidad = 1;

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
        a.addEventListener(ev, function () { refrescarReproductor(ev); });
      });
    }
    return a;
  }

  function oir(clave) {
    var a = elAudio();
    var p = pistaDe(clave);
    if (!p || !p.url) return;
    if (sonando === clave) { if (a.paused) a.play(); else a.pause(); return; }
    sonando = clave;
    a.src = p.url;
    a.currentTime = 0;
    a.playbackRate = velocidad;
    a.play();
    pintarReproductor();
  }

  function pararEscucha() {
    var a = $('#sala-audio');
    if (a && !a.paused) a.pause();
  }

  function cerrarReproductor() {
    pararEscucha();
    sonando = null;
    var r = $('#reproductor');
    if (r) r.remove();
    $$('.rueda--sonando').forEach(function (e) { e.classList.remove('rueda--sonando'); });
  }

  /** Quién y qué es lo que suena. El borrador no es de nadie todavía. */
  function quienSuena() {
    if (sonando === 'b') {
      var yo = P.jugadores[turnoActual().jugador];
      return { nombre: 'Tu turno, sin mandar', meta: 'todavía no lo oyó nadie',
               color: yo.color, avatar: yo.avatar };
    }
    var v = P.intervenciones[Number(String(sonando).slice(1))];
    if (!v) return { nombre: '', meta: '', color: null, avatar: '' };
    var j = P.jugadores[v.jugador];
    return { nombre: j.nombre, meta: 'Turno ' + v.turno + ' · defiende ' + j.letra,
             color: j.color, avatar: j.avatar };
  }

  function pintarReproductor() {
    var q = quienSuena();
    var r = $('#reproductor');
    if (!r) {
      r = document.createElement('div');
      r.id = 'reproductor';
      r.className = 'reproductor';
      $('#m-partida').appendChild(r);
    }
    r.className = 'reproductor';
    r.style.setProperty('--voz', q.color || 'var(--ctx-acento)');
    r.innerHTML =
      '<div class="reproductor__alto">' +
        '<button type="button" class="reproductor__play" data-accion="r-play" aria-label="Reproducir o pausar">' +
          '<span id="r-icono">' + iconoSVG('pausa', 24) + '</span>' +
        '</button>' +
        '<div class="reproductor__quien">' +
          '<span class="reproductor__nombre">' + esc(q.nombre) + '</span>' +
          '<span class="reproductor__meta">' + esc(q.meta) + '</span>' +
        '</div>' +
        '<button type="button" class="reproductor__vel" data-accion="r-vel">' +
          '<span id="r-vel">' + velocidad + '×</span></button>' +
        '<button type="button" class="boton-icono reproductor__cerrar" data-accion="r-cerrar" ' +
          'aria-label="Cerrar el reproductor">' + iconoSVG('cerrar', 18) + '</button>' +
      '</div>' +
      '<div class="reproductor__pista">' +
        '<input type="range" id="r-barra" min="0" max="1000" value="0" step="1" ' +
          'aria-label="Avance de la grabación">' +
        '<span class="reproductor__t"><b id="r-t">0:00</b> / ' + relojTexto(duracionDe(sonando)) + '</span>' +
      '</div>';
    refrescarReproductor('play');
  }

  function duracionDe(clave) {
    var p = pistaDe(clave);
    return (p && p.segundos) || 0;
  }

  function refrescarReproductor(ev) {
    if (!P || !sonando) return;
    var a = $('#sala-audio');
    var r = $('#reproductor');
    if (!r) return;

    /* El avance se calcula sobre los segundos que contamos nosotros:
       `a.duration` de un WebM de MediaRecorder vale Infinity. */
    var total = duracionDe(sonando) || 1;
    if (ev === 'ended') { a.currentTime = 0; }

    var ic = $('#r-icono');
    if (ic) ic.innerHTML = iconoSVG(a.paused ? 'play' : 'pausa', 24);

    var barra = $('#r-barra');
    if (barra && !arrastrando) {
      var frac = Math.min(1, a.currentTime / total);
      barra.value = String(Math.round(frac * 1000));
      barra.style.setProperty('--avance', (frac * 100) + '%');
    }
    var t = $('#r-t');
    if (t) t.textContent = relojTexto(Math.floor(a.currentTime));

    $$('.rueda').forEach(function (e) {
      e.classList.toggle('rueda--sonando', e.dataset.rueda === sonando && !a.paused);
    });
    var ib = $('.pista--grande .pista__icono');
    if (ib) ib.innerHTML = iconoSVG(sonando === 'b' && !a.paused ? 'pausa' : 'play', 26);
  }

  var arrastrando = false;

  /* ==========================================================================
     1. EL SORTEO, ANTES DE EMPEZAR
     ========================================================================== */
  function pintarAviso() {
    caja().innerHTML =
      '<div class="sala sala--sorteo">' +
        /* EL MODO MANDA Y VA FUERA DE LA TARJETA. Dentro competía con el
           enunciado por el mismo sitio y acababa leyéndose como una etiqueta
           más; sacándolo arriba queda claro el orden en que hay que leer esto:
           a qué se juega, sobre qué, y cuántos turnos. */
        window.ATWI.rotuloModo(P.modo, 'sala__rotulo') +
        '<div class="sala__tema">' +
          '<p class="sala__enunciado">' + esc(P.tema.enunciado) + '</p>' +
          '<div class="sala__chips">' +
            '<span class="chip">' + P.turnos + (P.turnos === 1 ? ' turno' : ' turnos') + ' cada uno</span>' +
          '</div>' +
        '</div>' +
        /* EL SORTEO SE VE Y SE OYE. Antes ponía el resultado ya hecho, que es
           como enseñar el dado en la mesa en vez de tirarlo: quién abre es la
           primera cosa que el juego decide por ustedes y merece sus cuatro
           segundos. La ficha salta entre las dos, va frenando, y para. */
        '<div class="sorteo">' +
          '<p class="sorteo__que">Quién inicia</p>' +
          '<span class="avatar sorteo__ficha" id="sorteo-ficha"></span>' +
          '<p class="sorteo__quien" id="sorteo-quien">&nbsp;</p>' +
          /* Aquí iba «Salió por sorteo. En la revancha abre X». Se va: lo del
             sorteo acaba de verse en pantalla durante cuatro segundos, y quién
             abre la revancha no le importa a nadie antes de jugar esta. */
        '</div>' +
      '</div>';
    /* El botón espera al sorteo: si no, se puede pasar de largo y el juego
       habría decidido quién abre sin que nadie lo viera. */
    pie().innerHTML = principal('p-listo', 'Empezar', '', true);
    correrSorteo();
  }

  /**
   * LA TIRADA. Cuatro segundos: la ficha salta entre las dos personas, cada vez
   * más despacio, y se para en quien abre.
   *
   * Los saltos se calculan ANTES de empezar para saber cuántos van a ser, y con
   * eso se elige por cuál empezar: así el último cae exactamente en quien tiene
   * que caer. Forzar el resultado al final produciría un salto final que se ve,
   * justo cuando la vista está más atenta.
   */
  var DURACION_SORTEO = 4000;

  function saltosDelSorteo() {
    var t = 0, lista = [];
    while (t < DURACION_SORTEO) {
      /* De 55 ms a 655 ms. La potencia 2.4 concentra el frenado al final, que
         es donde está la gracia: al principio es un borrón, al final se lee. */
      t += 55 + 600 * Math.pow(t / DURACION_SORTEO, 2.4);
      lista.push(Math.min(t, DURACION_SORTEO));
    }
    return lista;
  }

  function correrSorteo() {
    var ficha = $('#sorteo-ficha');
    var quien = $('#sorteo-quien');
    if (!ficha) return;
    if (sonido.hay()) sonido.despertar();

    var tiempos = saltosDelSorteo();
    var total = tiempos.length;
    var gana = P.orden[0];
    /* Con dos jugadores basta la paridad para aterrizar donde toca. */
    var inicio = (gana - total % 2 + 2) % 2;

    function pinta(i) {
      var j = P.jugadores[i];
      ficha.innerHTML = window.ATWI.fichaHTML(j.avatar, 'sorteo__cara', j.color);
      quien.textContent = j.nombre;
    }
    pinta(inicio);

    var k = 0;
    var t0 = Date.now();
    (function siguiente() {
      if (k >= total) return aterrizar();
      var espera = tiempos[k] - (Date.now() - t0);
      setTimeout(function () {
        if (!P || P.estado !== 'aviso') return;      // se salió de la sala
        k++;
        pinta((inicio + k) % 2);
        if (sonido.hay()) sonido.clac(1 - k / total);
        siguiente();
      }, Math.max(0, espera));
    })();

    function aterrizar() {
      if (!P || P.estado !== 'aviso') return;
      ficha.classList.add('sorteo__ficha--parada');
      quien.classList.add('sorteo__quien--parada');
      var b = $('#m-partida [data-accion="p-listo"]');
      if (b) b.disabled = false;
      if (sonido.hay()) sonido.campana();
      /* Segundo y medio de silencio antes del encuentro. Encadenarlo a la
         campana pisaría el momento en que se lee quién abre, que es lo que se
         acaba de ganar con cuatro segundos de sorteo. */
      setTimeout(entrarAlEncuentro, MS_ANTES_DEL_ENCUENTRO);
    }
  }

  /* ==========================================================================
     EL ENCUENTRO
     Una cortinilla POR ENCIMA DE TODO, como la de un juego de pelea: los dos
     grandes, encuadrados de la cintura para arriba, entrando cada uno desde
     fuera del lienzo. Aguanta dos segundos y se va con un fundido.

     A la IZQUIERDA va SIEMPRE quien abre. El sorteo acaba de decirlo y la
     escena lo repite sin tener que escribirlo otra vez.

     Los dos modos usan la misma entrada para contar lo contrario: en
     Controversia se quedan separados y el VS cae en medio; en Negociación
     siguen hasta juntarse y chocan el puño. No es un versus, es un equipo.

     No lleva velo oscuro: en esta app no hay fondos oscuros. El que hay es un
     lavado del color del modo, que además dice de qué modo es la partida.
     ========================================================================== */
  var MS_ANTES_DEL_ENCUENTRO = 1500;   // desde que para la ficha del sorteo
  var MS_VIAJE = 620;                  // lo que tardan en llegar

  function entrarAlEncuentro() {
    if (!P || P.estado !== 'aviso') return;
    var m = $('#m-partida');
    if (!m || $('#encuentro')) return;

    var pacto = P.modo !== 'debate';
    var pose = pacto ? 'puno' : 'plante';
    var izq = P.jugadores[P.orden[0]];         // quien abre, a la izquierda
    var der = P.jugadores[P.orden[1]];

    /* Va colgado del MODAL y no del cuerpo: el cuerpo tiene relleno y scroll
       propio, y dentro de él las figuras acababan cortadas por la caja —por las
       piernas— en vez de por la pantalla. Aquí abajo lo único que las corta es
       el borde del aparato, que es lo que se busca. */
    var caja = document.createElement('div');
    caja.id = 'encuentro';
    caja.className = 'encuentro' + (pacto ? ' encuentro--pacto' : '');
    caja.setAttribute('aria-hidden', 'true');
    caja.innerHTML =
      '<span class="encuentro__lado encuentro__lado--izq">' +
        window.ATWI.retrato(izq.avatar, pose, { fondo: null, mira: 'derecha',
                                                clase: 'encuentro__fig' }) +
      '</span>' +
      '<span class="encuentro__lado encuentro__lado--der">' +
        window.ATWI.retrato(der.avatar, pose, { fondo: null, mira: 'izquierda',
                                                clase: 'encuentro__fig' }) +
      '</span>' +
      /* El destello del choque lo pone la interfaz y ya no el dibujo. Las
         figuras traían las suyas y al juntarse se montaban unas sobre otras y
         sobre el puño contrario; se regeneraron sin ellas. Este cae donde se
         tocan de verdad, que es lo único que el dibujo no puede saber. */
      (pacto ? '<span class="encuentro__chispa"></span>'
             : '<span class="encuentro__vs">VS</span>');
    m.appendChild(caja);

    /* El golpe suena cuando LLEGAN, no al salir: es el sonido del encuentro, y
       adelantarlo lo convierte en el de arrancar. */
    var alLlegar = setTimeout(function () {
      if (!P || P.estado !== 'aviso') return;
      caja.classList.add('encuentro--llegado');
      if (sonido.hay()) sonido.choque();
    }, MS_VIAJE);

    /* Si se sale de la sala a mitad, la escena se va con ella: colgada del
       modal, se quedaría flotando sobre la pantalla siguiente. */
    P.limpiarEncuentro = function () {
      clearTimeout(alLlegar);
      if (caja.parentNode) caja.remove();
    };
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
    /* La cortinilla del encuentro se va al empezar a jugar: estaba colgada del
       modal, no de la pantalla del sorteo, así que si no se quita a mano se
       queda debajo de los turnos hasta el final de la partida. */
    if (P.limpiarEncuentro) { P.limpiarEncuentro(); P.limpiarEncuentro = null; }

    var pacto = P.modo !== 'debate';
    /* QUÉ SE TIENE DELANTE MIENTRAS SE HABLA, y no es lo mismo en los dos modos.
       En Controversia es la POSTURA que le tocó defender a quien habla; en
       Negociación no se defiende nada, así que es el tema sobre el que se va a
       proponer. Si el tema no trae posturas escritas —los hay— se cae al
       enunciado en vez de dejar una tarjeta vacía, que era lo que pasaba. */
    var loSuyo = (!pacto && t.postura) ? t.postura : P.tema.enunciado;

    caja().innerHTML =
      '<div class="sala sala--turno">' +
        '<div class="turno">' +
          '<p class="turno__cual">Turno ' + t.numero + ' de ' + P.turnos +
            (pacto || !t.postura ? '' : ' · defiendes la ' + t.letra) + '</p>' +
          '<p class="turno__que">' + esc(loSuyo) + '</p>' +
        '</div>' +
        /* QUIEN HABLA, EN GRANDE Y EN EL CENTRO. Antes aquí estaba el icono del
           juez, que es el mismo en los dos turnos y no decía de quién era este.
           Jugando los dos en un teléfono, eso es lo primero que hay que saber. */
        '<div class="hablante">' +
          window.ATWI.retrato(t.avatar, 'hablando', { fondo: 'disco', mira: 'derecha',
                                                      clase: 'hablante__fig' }) +
          '<p class="turno__quien">' + esc(t.nombre) + '</p>' +
          '<p class="juez__dice" id="juez-dice">' +
            esc(t.esPrimera ? 'Abres tú. Te escucho.' : 'Te toca contestar. Te escucho.') +
          '</p>' +
        '</div>' +
        loDicho() +
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
    /* EL BOTÓN DICE DE QUIÉN ES EL TURNO. Jugando los dos en un solo teléfono,
       el botón es lo último que se mira antes de hablar, y «Grabar mi turno» no
       dice a quién le toca: el teléfono cambia de manos cada turno. Si no hay
       nombre todavía se queda la fórmula genérica, que es lo único que se puede
       decir sin mentir. */
    var t = turnoActual();
    var suyo = t.nombre && t.nombre !== 'Tú';
    return principal('p-grabar', suyo ? 'Turno de ' + t.nombre : 'Grabar mi turno',
                     iconoSVG('micro', 24));
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
          '<p class="turno__cual">Turno ' + t.numero + ' de ' + P.turnos + ' · defiende la ' + t.letra + '</p>' +
        '</div>' +
        pista('b', 'Tu turno, sin mandar',
          relojTexto(b.segundos) + ' · ' +
          (quedan > 0 ? 'te quedan ' + quedan + ' s' : 'sin tiempo de sobra')) +
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
        jugador: t.jugador, turno: t.numero,
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
      ultima ? 'Ver el resultado' : 'Le toca a ' + elOtro().nombre);
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
    cerrarReproductor();
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
    var ganador = alAzar(P.jugadores).nombre;
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
    else if (a === 'r-play') { var au = $('#sala-audio'); if (au.paused) au.play(); else au.pause(); }
    else if (a === 'r-vel') cambiarVelocidad();
    else if (a === 'r-cerrar') cerrarReproductor();
    else if (a === 'p-salir') {
      if (confirm('Si sales ahora, la partida se pierde y no cuenta para nadie. ¿Salir?')) cerrar();
    }
  });

  function cambiarVelocidad() {
    var i = VELOCIDADES.indexOf(velocidad);
    velocidad = VELOCIDADES[(i + 1) % VELOCIDADES.length];
    var a = $('#sala-audio');
    if (a) a.playbackRate = velocidad;
    var n = $('#r-vel');
    if (n) n.textContent = velocidad + '×';
  }

  /* Arrastrar la barra. Se marca `arrastrando` para que el `timeupdate` no
     pelee con el dedo y devuelva el pulgar a su sitio a media caricia. */
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'r-barra' || !sonando) return;
    arrastrando = true;
    var a = $('#sala-audio');
    var total = duracionDe(sonando) || 1;
    a.currentTime = (Number(e.target.value) / 1000) * total;
    e.target.style.setProperty('--avance', (Number(e.target.value) / 10) + '%');
  });
  ['change', 'pointerup', 'touchend'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (e.target && e.target.id === 'r-barra') arrastrando = false;
    });
  });

  window.ATWI.partida = { empezar: empezar, cerrar: cerrar };
})();
