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
      /* SIN POSTURA ASIGNADA. Cada jugador llegaba con una letra y el texto de
         «su» postura, y tenía que sostenerla los tres turnos aunque no la
         pensara. Ahora el tema plantea la discusión y cada quien va fijando la
         suya al hablar; el juez puntúa cómo argumentaron frente al enunciado,
         que es lo que su rúbrica dice desde el principio (docs/02 §13-bis). */
      jugadores: gente,
      orden: [abre, 1 - abre],       // índices sobre `jugadores`
      /* {jugador, turno, avatar, nombre, color, audio, tipo, segundos, url}
         `avatar`, `nombre` y `color` van COPIADOS en cada intervención y no se
         miran en `jugadores`: son los de la ronda, no los de la persona. Ver
         `mandar()`. */
      intervenciones: [],
      i: 0,                          // intervención actual, 0..(turnos*2 - 1)
      borrador: null,                // lo grabado y todavía NO entregado
      estado: 'aviso'
    };
    separarFichas();
    /* La partida se abre en el servidor EN PARALELO, sin esperarla. Nadie tiene
       que mirar una ruedita antes de jugar: para cuando el primer turno esté
       grabado --medio minuto largo-- el id ya llegó. Y si no llega, la partida
       sigue en local y lo único que falta es la voz del personaje. */
    P.debate = null;
    if (window.ATWI.nube && window.ATWI.nube.hay()) {
      window.ATWI.nube.abrirPartida({
        tema: P.tema, modo: P.modo, turnos: P.turnos,
        abogadoYo: P.jugadores[indiceDeLaCuenta()].abogado,
        abogadoOtro: P.jugadores[1 - indiceDeLaCuenta()].abogado,
        /* El personaje DEL DUELO. Con abogado es el elegido; sin abogado es el
           avatar de la ficha, que es lo que se ve aunque la voz sea humana. */
        personajeYo: P.jugadores[indiceDeLaCuenta()].avatar,
        personajeOtro: P.jugadores[1 - indiceDeLaCuenta()].avatar,
        invitado: P.jugadores[1 - indiceDeLaCuenta()]
      }).then(function (id) { P.debate = id; });
    }
    abrir();
    /* Las poses del encuentro se piden YA, aunque falten cinco segundos para
       verlas. Y se GUARDA LA PROMESA: el sorteo dura lo que dura y casi siempre
       llegan a tiempo, pero en un teléfono que abre la app por primera vez no, y
       sin esperarla la entrada arrancaba con las figuras a medio bajar. */
    P.poses = window.ATWI.precargarPoses(
      P.jugadores.map(function (j) { return j.avatar; }),
      [P.modo === 'debate' ? 'plante' : 'puno']);
    pintarAviso();
  }

  /* ==========================================================================
     EL REPASO: la misma sala, ya jugada
     Volver a oír una partida NO es otra pantalla. Es esta, con las casillas ya
     llenas y sin botón de grabar: como poner una película que ya se vio.

     Se escribio primero como una lista aparte dentro de un modal, y era peor lo
     mismo: perdia la figura grande, el reproductor sobre la cabeza y el
     encadenado, que son justo lo que hace que una partida se relea como una
     conversacion y no como una carpeta de audios.

     Lo unico que cambia es el pie --oir la partida en vez de grabar-- y que la
     figura grande arranca en quien abrio, porque no hay turno de nadie. */
  function repasar(d) {
    var t = (d.turnos_grabados || []).slice()
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
    if (!t.length) return;

    /* Los jugadores se reconstruyen DE LOS TURNOS y no del debate: ahi esta
       sellado con que personaje y con que nombre jugo cada uno ESA vez, que es
       lo que hay que volver a ver. El debate solo sabe como se llaman hoy. */
    var lados = [t[0], t.filter(function (x) { return x.orden % 2 === 1; })[0] || t[0]];
    P = {
      tema: { id: d.tema_catalogo, enunciado: d.enunciado, titulo: d.enunciado },
      modo: d.modo,
      turnos: d.turnos,
      publico: 'pareja',
      jugadores: lados.map(function (x, i) {
        return { nombre: x.nombre || (i ? 'La otra parte' : 'Vos'),
                 avatar: x.avatar || (i ? 'luna' : 'kai'),
                 color: x.color || COLOR_POR_DEFECTO[i],
                 abogado: Boolean(x.abogado) };
      }),
      orden: [0, 1],
      intervenciones: t.map(function (x, n) {
        return {
          jugador: n % 2, turno: x.numero || Math.floor(n / 2) + 1,
          avatar: x.avatar, nombre: x.nombre, color: x.color,
          abogado: Boolean(x.abogado),
          segundos: x.segundos || 0,
          transcripcion: x.transcripcion, guion: x.guion,
          /* La ruta, todavia sin bajar. El audio se trae al tocarlo: bajar seis
             de golpe al abrir es gastar datos de alguien por si acaso. */
          ruta: x.abogado ? x.voz_ruta : x.audio_ruta,
          url: null
        };
      }),
      i: 0,
      borrador: null,
      estado: 'repaso',
      repaso: true,
      debate: d.id
    };
    abrir();
    window.ATWI.precargarPoses(P.jugadores.map(function (j) { return j.avatar; }),
                               ['hablando']);
    pintarRepaso();
  }

  function pintarRepaso() {
    P.estado = 'repaso';
    pintarSala({
      dice: P.intervenciones.length + ' intervenciones · toca una para oírla',
      pie: '<button class="boton boton--bloque boton--grande" data-accion="p-oir-todo">' +
             iconoSVG('play', 22) + 'Oír la partida entera</button>' +
           '<button class="boton boton--suave boton--bloque" data-accion="p-revelar">' +
             'Ver el resultado otra vez</button>'
    });
  }

  /* CUÁL DE LOS DOS TIENE CUENTA. En la partida local juega quien abrió la app
     --el índice 0 de `jugadores`, que sale de su propia ficha-- contra alguien
     que agarró el teléfono. El de enfrente no tiene perfil en ninguna parte, y
     eso decide qué se guarda en `turnos.perfil`: el suyo va NULO. */
  function indiceDeLaCuenta() { return 0; }

  /* Cada jugador llega con su ficha —nombre, dibujo y color—. Se admite también
     un nombre suelto por si alguna llamada vieja lo pasa así. */
  function ficha(x, i) {
    if (typeof x === 'string') x = { nombre: x };
    return {
      nombre: x.nombre || '?',
      avatar: x.avatar || (i ? 'luna' : 'kai'),
      color: x.color || COLOR_POR_DEFECTO[i] || COLOR_POR_DEFECTO[0],
      abogado: Boolean(x.abogado)
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
    /* Solo los objetos LOCALES. Las URLs firmadas de la voz del personaje no
       son objetos de este navegador y `revokeObjectURL` con ellas no hace nada,
       pero da igual: se comprueba para decir en el codigo cual es cual. */
    if (P) P.intervenciones.forEach(function (v) {
      if (v.url && v.url.indexOf('blob:') === 0) URL.revokeObjectURL(v.url);
    });
    grabadora.cerrar();
    P = null;
    /* Si mientras se jugaba se publico una version nueva, la recarga quedo
       esperando: recargar a mitad de partida le borra el turno a alguien. */
    if (window.ATWI.recargarSiTocaba) window.ATWI.recargarSiTocaba();
  }

  /* Quién habla ahora, qué defiende y qué número de turno suyo es */
  function turnoActual() {
    /* EN REPASO NO LE TOCA A NADIE. Se devuelve quien abrio, que es la figura
       con la que arranca la pantalla; en cuanto se toque una intervencion, la
       figura pasa a ser la de quien la dijo, como en la sala. */
    if (P.repaso) {
      var q = P.jugadores[0];
      return { jugador: 0, nombre: q.nombre, avatar: q.avatar, color: q.color,
               numero: 1, esUltima: false, esPrimera: true };
    }
    var j = P.orden[P.i % 2];                 // índice del jugador
    return {
      jugador: j,
      nombre: P.jugadores[j].nombre,
      avatar: P.jugadores[j].avatar,
      color: P.jugadores[j].color,
      numero: Math.floor(P.i / 2) + 1,
      esUltima: P.i === P.turnos * 2 - 1,
      esPrimera: P.i === 0
    };
  }

  /** El turno, en la cabecera. Es estado, no contenido: se mira de refilón. */
  function marcarTurno(t) {
    var e = $('#p-turno');
    if (!e) return;
    e.textContent = t ? t.numero + '/' + P.turnos : '';
    e.hidden = !t;
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
  /**
   * El botón grande del pie. Normalmente lleva el color del MODO, que es el de
   * la sala. `color` lo cambia al de quien juega: se usa al mandar el turno,
   * donde lo que se confirma es algo tuyo y no algo del juego.
   */
  function principal(accion, texto, ico, apagado, color) {
    return '<button class="boton boton--bloque boton--grande boton--' + P.modo + '"' +
      ' data-accion="' + accion + '"' + (apagado ? ' disabled' : '') +
      (color ? ' style="--suyo:' + esc(color) + '"' : '') + '>' +
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
  /**
   * LOS TURNOS SE VEN DESDE EL PRIMER MINUTO. Antes esta lista aparecía de la
   * nada al cerrar la primera intervención; ahora están todos los huecos desde
   * el principio, vacíos, y se van llenando. Así se ve de un vistazo cuántos
   * quedan, que es la pregunta que se hace todo el mundo a mitad de partida.
   */
  function loDicho() {
    var total = P.intervenciones.length;
    var huecos = P.turnos * 2;
    return '<div class="dicho">' +
        '<p class="dicho__titulo">' + iconoSVG('historial', 16) +
          (total ? 'Lo que se dijo · toca para oírlo' : 'Aquí se van guardando los turnos') +
        '</p>' +
        '<div class="ruedas">' +
          P.intervenciones.map(function (v, n) {
            var j = P.jugadores[v.jugador];
            return '<button type="button" class="rueda' +
                     (n === total - 1 ? ' rueda--ultima' : '') +
                     (v.preparando ? ' rueda--preparando' : '') +
                     (v.falloLaNube ? ' rueda--sinvoz' : '') + '"' +
                   ' style="--voz:' + esc(j.color) + '"' +
                   ' data-oir="i' + n + '" data-rueda="i' + n + '"' +
                   ' aria-label="' + (v.preparando
                     ? esc(j.nombre) + ' está poniendo voz a su turno'
                     : 'Escuchar a ' + esc(j.nombre) + ', turno ' + v.turno) + '">' +
                window.ATWI.fichaHTML(j.avatar, 'rueda__cara', j.color) +
                '<span class="rueda__n">' + v.turno + '</span>' +
              '</button>';
          }).join('') +
          /* LO GRABADO Y TODAVÍA NO MANDADO va en SU casilla, la que le toca, no
             en una tarjeta aparte debajo. Es la misma cosa que las demás —un
             turno que se puede oír— y sacarlo fuera obligaba a encoger la
             figura para hacerle sitio. Aquí late y brilla para decir que está
             ahí y que es nuevo, y se toca igual que los otros. Lo que no hace
             es cerrar el turno: eso solo pasa al mandarlo. */
          (P.borrador ? (function () {
            var j = P.jugadores[turnoActual().jugador];
            return '<button type="button" class="rueda rueda--nueva"' +
                   ' style="--voz:' + esc(j.color) + '"' +
                   ' data-oir="b" data-rueda="b"' +
                   ' aria-label="Escuchar lo que acabas de grabar, sin mandar">' +
                window.ATWI.fichaHTML(j.avatar, 'rueda__cara', j.color) +
                '<span class="rueda__n">' + turnoActual().numero + '</span>' +
              '</button>';
          })() : '') +
          /* EL MOTIVO, EN PANTALLA. Esto se prueba en un teléfono, donde no hay
             consola que abrir: sin decirlo aquí, «falló» es todo lo que se sabe
             y averiguar por qué cuesta un día de ida y vuelta. */
          /* Los que faltan: sombras del tamaño exacto que va a ocupar la ficha.
             Sin ellos la fila crecía de la nada y saltaba la maqueta a cada
             turno cerrado. */
          Array.apply(null, { length: Math.max(0, huecos - total - (P.borrador ? 1 : 0)) })
            .map(function (_, n) {
              var i = total + (P.borrador ? 1 : 0) + n;
              return '<span class="rueda rueda--hueco" aria-hidden="true">' +
                  '<span class="rueda__n">' + (Math.floor(i / 2) + 1) + '</span>' +
                '</span>';
            }).join('') +
        '</div>' +
        /* Aquí iba una leyenda con «Diana · A» y «Prueba · B». Se va: quién es
           quién ya lo dicen la cara y el aro de cada ficha, y la letra de la
           postura no le importa a nadie mientras juega. */
        motivoDelFallo() +
      '</div>';
  }

  /* POR QUÉ NO SUBIÓ, DICHO EN LA PANTALLA. Esto se prueba en un teléfono, donde
     no hay consola que abrir: sin decirlo aquí, «falló» es todo lo que se sabe y
     averiguar el motivo cuesta un día de ida y vuelta. Solo aparece cuando hay
     una casilla marcada, así que en una partida sana no se ve nunca. */
  function motivoDelFallo() {
    /* El motivo DE LA CASILLA, no el ultimo global: si dos turnos fallaron por
       cosas distintas, el global solo recuerda el segundo. */
    var falla = null;
    P.intervenciones.forEach(function (v) { if (v.falloLaNube && !falla) falla = v; });
    if (!falla) return '';
    var m = falla.motivo ||
      (window.ATWI.nube && window.ATWI.nube.ultimoFallo && window.ATWI.nube.ultimoFallo());
    if (!m) return '';
    return '<p class="dicho__fallo">Sin voz de personaje: ' + esc(m) +
           '<br><span class="tenue">Toca la casilla para el detalle.</span></p>';
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
    if (!p) return;

    var i = String(clave).charAt(0) === 'i'
      ? P.intervenciones[Number(String(clave).slice(1))] : null;

    /* PRIMERO SE BAJA, Y DESPUES SE MIRA SI HAY URL. Este bloque estaba DEBAJO
       de un `if (!p.url) return`, asi que no se ejecutaba nunca: en el repaso
       las intervenciones nacen sin `url` --solo con la ruta en el almacen-- y la
       funcion salia antes de llegar aqui. Tocar una casilla no hacia nada y no
       dejaba ni un rastro, porque el `return` es silencioso.

       Se baja al tocarlo y no al abrir la partida: bajar seis audios de golpe
       es gastar los datos de alguien por si acaso, y casi siempre se quiere oir
       uno. Mientras baja, la casilla gira. */
    if (i && !i.url && i.ruta && window.ATWI.nube && window.ATWI.nube.oirDelAlmacen) {
      if (i.preparando) return;
      i.preparando = true;
      marcarRueda(P.intervenciones.indexOf(i));
      window.ATWI.nube.oirDelAlmacen(i.ruta).then(function (url) {
        if (!P) return;
        var n = P.intervenciones.indexOf(i);
        i.preparando = false;
        if (!url) {
          i.falloLaNube = true;
          i.motivo = 'no se pudo bajar el audio guardado';
          return marcarRueda(n);
        }
        i.url = url;
        marcarRueda(n);
        oir(clave);              // ahora si, con el audio en la mano
      });
      return;
    }

    /* MIENTRAS SE PREPARA NO SUENA NADA. En la sala, la URL que hay ahi todavia
       es la grabacion de verdad, y esa no se reproduce nunca: si suena una vez,
       el juego tiene dos registros --la voz real y la del personaje-- y el
       efecto se pierde justo al principio, que es cuando mas falta hace. */
    if (i && i.preparando) return contarQuePasa(i, 'Preparando la voz…',
      'Se está transcribiendo y poniéndole la voz del personaje. Tarda unos ' +
      'segundos y no se puede oír hasta que esté: lo que hay guardado todavía es ' +
      'la grabación, y esa no se reproduce nunca.');
    if (i && i.falloLaNube) return contarQuePasa(i, 'Se quedó sin voz',
      'Esta intervención cuenta para la partida igual —el juez la va a leer— pero ' +
      'no se le pudo poner la voz del personaje.');
    /* Y AHORA si: si despues de todo eso no hay nada que sonar, se sale. Antes
       este guardia estaba el PRIMERO y se comia los dos casos de arriba. */
    if (!p.url) return;
    if (siguiendo) { clearTimeout(siguiendo); siguiendo = null; }
    if (sonando === clave) { if (a.paused) a.play(); else a.pause(); return; }
    sonando = clave;
    a.src = p.url;
    /* Al saber lo que dura de verdad se repinta el total: hasta ese momento se
       enseña el de la grabacion, que con abogado no es el mismo. */
    a.onloadedmetadata = function () { pintarReproductor(); };
    a.currentTime = 0;
    a.playbackRate = velocidad;
    a.play();
    pintarReproductor();
  }

  /* ==========================================================================
     LA CONVERSACIÓN SE OYE SEGUIDA
     Al acabar una intervención NO se para: espera un segundo y sigue con la
     siguiente, cambiando de cara y de color según de quién sea. Oír la discusión
     de corrido es lo que hace falta antes de contestar; ir tocando una por una
     obliga a reconstruirla de memoria entre toque y toque.

     Entra también lo grabado y sin mandar, si ya está: es la última cosa que se
     dijo, aunque todavía no la haya oído nadie.

     El segundo de espera no es decoración. Sin él las dos voces se pegan y
     parece una sola grabación; con él se oye el turno del otro.
     ========================================================================== */
  var MS_ENTRE_PISTAS = 1000;
  var siguiendo = null;

  /** El orden en que se oye todo: los turnos cerrados y, al final, el borrador. */
  function ordenDePistas() {
    var l = P.intervenciones.map(function (_, n) { return 'i' + n; });
    if (P.borrador) l.push('b');
    return l;
  }

  function encadenar() {
    var l = ordenDePistas();
    var i = l.indexOf(sonando);
    if (i < 0 || i === l.length - 1) return;          // era la última
    var proxima = l[i + 1];
    if (siguiendo) clearTimeout(siguiendo);
    siguiendo = setTimeout(function () {
      siguiendo = null;
      /* Se comprueba otra vez: en ese segundo se pudo cerrar el reproductor,
         tocar otra pista o salirse de la sala. */
      if (!P || sonando !== l[i]) return;
      oir(proxima);
    }, MS_ENTRE_PISTAS);
  }

  function pararEscucha() {
    var a = $('#sala-audio');
    if (a && !a.paused) a.pause();
    if (siguiendo) { clearTimeout(siguiendo); siguiendo = null; }
    window.ATWI.animarBoca($('#m-partida .hablante__fig'), false);
  }

  function cerrarReproductor() {
    pararEscucha();
    sonando = null;
    var r = $('#reproductor');
    if (r) r.remove();
    $$('.rueda--sonando').forEach(function (e) { e.classList.remove('rueda--sonando'); });
    ponerHablante(null);
  }

  /**
   * QUIEN SE VE ES QUIEN SUENA. Al oír una intervención vieja, la figura grande
   * cambia a quien la dijo —con su color de fondo— y vuelve sola a la de quien
   * tiene el turno cuando se cierra el reproductor. Sin esto se oía la voz de
   * uno mientras en pantalla seguía la cara del otro, que es justo la confusión
   * que la figura está ahí para evitar.
   * @param j el jugador que suena, o null para volver al del turno
   */
  function ponerHablante(j) {
    var caja = $('#m-partida .hablante');
    if (!caja) return;
    var quien = j || P.jugadores[turnoActual().jugador];
    var fig = caja.querySelector('.hablante__fig');
    if (!fig) return;
    fig.outerHTML = window.ATWI.retrato(quien.avatar, 'hablando',
      { fondo: 'disco', mira: 'derecha', color: quien.color, clase: 'hablante__fig' });
    /* Y EL NOMBRE CON LA FIGURA. Cambiaba el dibujo y el rótulo se quedaba en
       el de quien tiene el turno: sonaba Harold, se veía a Kai y debajo ponía
       «Diana». El reproductor flotante suele taparlo, pero «suele» no es
       «siempre» —depende del alto de la pantalla— y una figura con el nombre
       del otro es justo la confusión que la figura existe para evitar. */
    var rotulo = caja.querySelector('.turno__quien');
    if (rotulo) rotulo.textContent = quien.nombre;
    caja.classList.toggle('hablante--ajeno', Boolean(j));
    /* La figura es otra, así que el latido de la boca hay que engancharlo al
       dibujo nuevo: el viejo ya no está en la página. */
    var a = $('#sala-audio');
    window.ATWI.animarBoca($('#m-partida .hablante__fig'), Boolean(a && !a.paused));
  }

  /**
   * El reproductor va SOBRE LA CABEZA de quien habla, no encima de él. Es lo que
   * lo hace leer como «esto es lo que está diciendo» y no como un control que se
   * le puso delante: tapándole la cara, lo que se ve es una tarjeta sobre un
   * dibujo, y la figura deja de servir para nada.
   *
   * Se mide en vez de fijarse en CSS porque el alto de la figura cambia con la
   * pantalla —es un `clamp` con `vh`— y cualquier número fijo acierta en un
   * teléfono y falla en el siguiente. Puede quedar por encima del nombre; eso da
   * igual, el nombre lo repite el propio reproductor.
   */
  function ponerloSobreLaCabeza(r) {
    var fig = $('#m-partida .hablante__fig');
    var m = $('#m-partida');
    if (!fig || !m) return;
    var caja = m.getBoundingClientRect();
    var f = fig.getBoundingClientRect();
    r.style.top = 'auto';
    r.style.bottom = Math.max(12, Math.round(caja.bottom - f.top + 10)) + 'px';
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
    /* De la INTERVENCIÓN, no del jugador. Hoy da lo mismo —la ficha no cambia a
       media partida—, pero es la misma regla que hace que el personaje se selle
       al mandar: lo que se oye de una ronda se ve como se vio esa ronda. Si un
       día se puede cambiar la ficha sin salir, esto ya está bien. */
    var j = P.jugadores[v.jugador];
    var ficha = { nombre: v.nombre || j.nombre, color: v.color || j.color,
                  avatar: v.avatar || j.avatar };
    return { nombre: ficha.nombre, meta: 'Turno ' + v.turno,
             color: ficha.color, avatar: ficha.avatar, jugador: ficha };
  }

  function pintarReproductor() {
    var q = quienSuena();
    /* La figura pasa a ser la de quien suena. El borrador es de quien tiene el
       turno, así que ahí no cambia nada. */
    ponerHablante(sonando === 'b' ? null : q.jugador);
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
    ponerloSobreLaCabeza(r);
    refrescarReproductor('play');
  }

  /* LA DURACION DEL AUDIO QUE SUENA, no la de lo que se grabo. Son dos cosas
     distintas en cuanto hay abogado: lo que suena es al personaje LEYENDO EL
     TEXTO, y ese texto va sin muletillas, sin repeticiones y sin las pausas.
     Once segundos hablando salen en seis leidos, y no hay nada roto: sobraban
     cinco segundos de «eh, o sea, que, que».

     Lo que SI estaba mal era enseñar 0:11 debajo de un audio de 0:06. Se toma
     del elemento de audio, que sabe lo que dura de verdad; `segundos` queda de
     respaldo mientras no ha cargado los metadatos. */
  function duracionDe(clave) {
    var p = pistaDe(clave);
    if (sonando === clave) {
      var a = $('#sala-audio');
      if (a && isFinite(a.duration) && a.duration > 0) return Math.round(a.duration);
    }
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
    if (ev === 'ended') { a.currentTime = 0; encadenar(); }

    var ic = $('#r-icono');
    if (ic) ic.innerHTML = iconoSVG(a.paused ? 'play' : 'pausa', 24);
    /* La boca se mueve mientras SUENA de verdad, no mientras el reproductor
       está abierto: en pausa la figura tiene que quedarse quieta. */
    window.ATWI.animarBoca($('#m-partida .hablante__fig'), !a.paused);

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
    marcarTurno(null);
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
      /* Un segundo para leer quién abre —es lo que se acaba de ganar con cuatro
         segundos de sorteo— y el ganador SALE DE ESCENA. Se quedaba, y su
         nombre acababa cruzado por el VS: dos cosas distintas peleando por el
         centro de la pantalla. Ahora el sitio queda libre para los dos. */
      setTimeout(function () {
        if (!P || P.estado !== 'aviso') return;
        /* NINGUNA ANIMACIÓN EMPIEZA SIN SUS IMÁGENES. Se esperaba solo el reloj,
           y en un teléfono que abre la app por primera vez las figuras llegaban
           a mitad del movimiento: aparecían a trozos o de golpe. Una animación
           que ya empezó no se puede volver a empezar sin que se note.
           `precargarPoses` nunca falla ni se cuelga --lleva su propio tope-- así
           que esperarla no puede dejar la partida parada. */
        (P.poses || Promise.resolve()).then(function () {
          if (!P || P.estado !== 'aviso') return;
          var s = $('#m-partida .sorteo');
          if (s) s.classList.add('sorteo--fuera');
          setTimeout(entrarAlEncuentro, MS_SALIDA_GANADOR);
        });
      }, MS_ANTES_DEL_ENCUENTRO);
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
  var MS_ANTES_DEL_ENCUENTRO = 1000;   // desde que para la ficha del sorteo
  var MS_SALIDA_GANADOR = 300;         // lo que tarda en irse quien abre
  var MS_VIAJE = 620;                  // lo que dura la entrada entera
  var MS_CONTACTO = 480;               // cuándo se tocan dentro de esa entrada

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
    /* Quién es cada uno, con su ficha y su nombre. Sin esto hay que deducirlo
       por el dibujo, y si los dos eligieron el mismo personaje no hay forma: se
       distinguen por el aro, y el aro solo se ve en la ficha. */
    function rotulado(j) {
      return '<span class="encuentro__quien">' +
          window.ATWI.fichaHTML(j.avatar, 'avatar--mini', j.color) +
          '<span>' + esc(j.nombre) + '</span>' +
        '</span>';
    }

    /* LOS DOS RÓTULOS VAN JUNTOS Y FUERA DE LAS FIGURAS. Estuvieron dentro de
       cada lado, colgados de la cabeza de su personaje: viajaban con él en la
       entrada y quedaban a distinta altura, porque Kai y Luna no se colocan a la
       misma. Dos nombres a dos alturas se leen como un desnivel, no como una
       pareja.

       Ahora son una línea suelta sobre la escena, los dos al mismo alto, y
       aparecen a la vez cuando se chocan. Al no ir dentro de los lados tampoco
       heredan su desplazamiento: las figuras entran y los nombres se revelan
       donde ya estaban. */
    caja.innerHTML =
      '<span class="encuentro__lado encuentro__lado--izq">' +
        window.ATWI.retrato(izq.avatar, pose, { fondo: null, mira: 'derecha',
                                                clase: 'encuentro__fig' }) +
      '</span>' +
      '<span class="encuentro__lado encuentro__lado--der">' +
        window.ATWI.retrato(der.avatar, pose, { fondo: null, mira: 'izquierda',
                                                clase: 'encuentro__fig' }) +
      '</span>' +
      '<span class="encuentro__rotulos">' + rotulado(izq) + rotulado(der) + '</span>' +
      /* El destello del choque lo pone la interfaz y ya no el dibujo. Las
         figuras traían las suyas y al juntarse se montaban unas sobre otras y
         sobre el puño contrario; se regeneraron sin ellas. Este cae donde se
         tocan de verdad, que es lo único que el dibujo no puede saber. */
      (pacto ? '<span class="encuentro__chispa"></span>'
             : '<span class="encuentro__vs">VS</span>');
    m.appendChild(caja);

    /* DOS MOMENTOS, NO UNO. La clase que arranca la entrada, el sonido del golpe
       y el destello salían los tres a la vez, y esa clase es la que PONE EN
       MARCHA el viaje: el golpe sonaba al salir, 620 ms antes de que se tocaran.

       Ahora la entrada arranca enseguida —hacen falta esos milisegundos para que
       el navegador registre la posición de partida y anime en vez de saltar— y
       el golpe suena en el instante del contacto, que es el 78% del recorrido. */
    var alEntrar = setTimeout(function () {
      if (!P || P.estado !== 'aviso') return;
      caja.classList.add('encuentro--llegado');
    }, 40);

    var alChocar = setTimeout(function () {
      if (!P || P.estado !== 'aviso') return;
      caja.classList.add('encuentro--chocado');
      if (sonido.hay()) sonido.choque();
    }, 40 + MS_CONTACTO);

    /* Si se sale de la sala a mitad, la escena se va con ella: colgada del
       modal, se quedaría flotando sobre la pantalla siguiente. */
    P.limpiarEncuentro = function () {
      clearTimeout(alEntrar);
      clearTimeout(alChocar);
      if (caja.parentNode) caja.remove();
    };
  }

  /* ==========================================================================
     2. EL TURNO
     El reloj no aparece aquí: a 0:00 no dice nada y ocupa el sitio de lo que sí
     importa antes de hablar, que es volver a oír lo que dijo el otro.
     ========================================================================== */
  /**
   * LA SALA ES UNA SOLA PANTALLA. Grabar, escuchar lo grabado y mandarlo no son
   * tres pantallas: son la misma, con el mismo tema arriba, los mismos turnos
   * en medio y la misma figura abajo. Lo único que cambia es lo que dice el
   * juez, lo que aparece encima de la figura —nada, el reloj o la pista— y los
   * botones del pie.
   *
   * Antes cada estado se pintaba entero por su cuenta, con su propia maqueta, y
   * al tocar grabar se saltaba a una pantalla distinta: se perdía de vista a
   * quien estaba hablando justo cuando más falta hacía saber de quién era el
   * turno, y el diseño cambiaba debajo de los pies.
   */
  function pintarSala(op) {
    var t = turnoActual();
    /* LO QUE SE TIENE DELANTE ES EL TEMA, el mismo para los dos. Antes aquí
       ponía la postura asignada a quien hablaba; ya no hay reparto, así que lo
       que hay que tener a la vista mientras se habla es la discusión. */
    var loSuyo = P.tema.enunciado;
    marcarTurno(t);

    caja().innerHTML =
      '<div class="sala sala--turno' + (op.medio ? ' sala--conmedio' : '') + '">' +
        '<div class="turno">' +
          '<p class="turno__que">' + esc(loSuyo) + '</p>' +
        '</div>' +
        loDicho() +
        /* El nombre y la frase van ENCIMA de la figura, no debajo: la figura
           baja a tocar el botón —asoma por detrás de él, como si saliera de
           ahí— y el texto entre medias rompía esa continuidad. */
        '<div class="hablante">' +
          '<p class="turno__quien">' + esc(t.nombre) + '</p>' +
          '<p class="juez__dice" id="juez-dice">' + esc(op.dice) + '</p>' +
          (op.medio || '') +
          window.ATWI.retrato(t.avatar, 'hablando', { fondo: 'disco', mira: 'derecha',
                                                      color: t.color,
                                                      clase: 'hablante__fig' }) +
        '</div>' +
      '</div>';

    pie().innerHTML = op.pie;
  }

  function pintarTurno() {
    var t = turnoActual();
    P.estado = 'turno';
    tirarBorrador();
    /* La cortinilla del encuentro se va al empezar a jugar: estaba colgada del
       modal, no de la pantalla del sorteo, así que si no se quita a mano se
       queda debajo de los turnos hasta el final de la partida. */
    if (P.limpiarEncuentro) { P.limpiarEncuentro(); P.limpiarEncuentro = null; }

    pintarSala({
      dice: t.esPrimera ? 'Abres tú. Te escucho.' : 'Te toca contestar. Te escucho.',
      pie: botonDeGrabar('grabar') +
        '<p class="chico centrado pie-nota">Tocas para empezar y tocas para parar. ' +
          'Podrás escucharlo antes de mandarlo.</p>'
    });
  }

  /* ==========================================================================
     3. GRABAR · PARAR · AGREGAR — el mismo botón en tres estados
     ========================================================================== */
  function botonDeGrabar(estado) {
    if (estado === 'parar') {
      return '<button class="boton boton--bloque boton--grande boton--parar grabando"' +
                    ' data-accion="p-parar">' + iconoSVG('parar', 22) + 'Parar' +
               '<span class="boton__reloj" id="reloj-n">' +
                 relojTexto(grabadora.segundos()) + '</span></button>';
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
      if (n) n.textContent = relojTexto(s);
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

    /* SIN `medio`: el reloj va DENTRO del botón de parar. Encima de la figura
       obligaba a encogerla y a achatarle el óvalo de color para hacerle sitio, y
       el tiempo no es una pieza de la escena: es un dato del control que lo
       está contando. */
    pintarSala({
      dice: agregando ? 'Sigues sobre lo que ya grabaste.' : 'Te escucho.',
      pie: botonDeGrabar('parar') +
        '<p class="chico centrado pie-nota">Estás grabando. Toca para parar. ' +
          'Máximo ' + relojTexto(tope) + '.</p>'
    });
    /* Mientras se graba, la figura habla. Es la misma señal que el punto rojo
       del botón, dicha por el dibujo. */
    window.ATWI.animarBoca($('#m-partida .hablante__fig'), true);
  }

  /* ==========================================================================
     4. LA REVISIÓN: parar no es mandar
     ========================================================================== */
  function pausarGrabacion() {
    /* TAMBIEN CUANDO ESTA PAUSADA. `grabando()` es solo `state === 'recording'`,
       y el recorte de silencios deja la grabadora en `paused` en cuanto alguien
       se calla un segundo. Al terminar de hablar y tocar «Parar» --que es el
       caso normal, no uno raro-- esto salia por aqui y EL BOTON NO HACIA NADA.
       El reloj ya se habia detenido solo, asi que parecia que si funcionaba. */
    if (!grabadora.grabando() && !grabadora.pausada()) return;
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
    /* Si lo que sonaba era el borrador, el reproductor se CIERRA, no solo se
       calla. Paraba el audio y ponía `sonando` a null, pero dejaba el panel en
       pantalla: al mandar el último turno se quedaba flotando un «Tu turno, sin
       mandar» de algo que acababa de mandarse, encima del botón de ver el
       resultado. */
    if (sonando === 'b') cerrarReproductor();
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

    pintarSala({
      dice: corto
        ? 'Eso duró ' + b.segundos + ' s. ' +
          (puedeAgregar ? 'Agrega algo antes de mandarlo.' : 'Bórralo y grábalo otra vez.')
        : 'Ahí está tu turno, sin mandar. ' + relojTexto(b.segundos) +
          (quedan > 0 ? ' · te quedan ' + quedan + ' s' : ' · sin tiempo de sobra'),
      /* Sin `medio`: lo grabado vive arriba, en su casilla. Así la figura no
         tiene que encogerse para hacerle sitio a una tarjeta que decía lo mismo
         que la casilla que ya estaba ahí. */
      pie:
      principal('p-mandar', t.esUltima ? 'Mandar y cerrar' : 'Mandar mi turno',
                iconoSVG('listo', 22), corto, t.color) +
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
          '</div>')
    });
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
      var j = P.jugadores[t.jugador];
      P.intervenciones.push({
        jugador: t.jugador, turno: t.numero,
        /* CON QUÉ PERSONAJE SE DIJO, copiado y no consultado. Se podría sacar
           de `P.jugadores[jugador].avatar` cada vez que hiciera falta, y hoy
           daría lo mismo. Pero la ficha se puede cambiar: quien jugó esta ronda
           de Kai puede ser Luna la semana que viene, y entonces la consulta
           devolvería el personaje de HOY para una ronda de ANTES.
           Eso no importaría si el personaje fuera un adorno. Importa porque va
           a ser la VOZ con la que se vuelva a escuchar esta intervención: una
           ronda grabada de Kai se relee con la voz de Kai, siempre, aunque
           quien la grabó ya no lo sea. El personaje es del turno, no de la
           persona. */
        avatar: j.avatar,
        nombre: j.nombre,
        color: j.color,
        audio: blob,
        tipo: r ? r.tipo : P.borrador.tipo,
        segundos: r ? r.segundos : P.borrador.segundos,
        /* CON QUE SE GRABO. Se sella aqui junto con el resto: el formato que
           eligio este navegador es un dato de ESTA grabacion, no del aparato
           que la vuelva a mirar despues. */
        navegador: (r && r.navegador) || (window.ATWI.grabadora.navegador &&
                                          window.ATWI.grabadora.navegador()),
        /* Sellado como el personaje: lo que decide cómo suena esta ronda es lo
           que se eligió ENTONCES. */
        abogado: Boolean(j.abogado),
        url: URL.createObjectURL(blob)
      });
      var v = P.intervenciones[P.intervenciones.length - 1];
      tirarBorrador();
      acusarRecibo(t);
      subirTurno(v, P.intervenciones.length - 1);
    });
  }

  /* ==========================================================================
     LA VOZ DEL PERSONAJE
     El turno sube en cuanto se manda y se procesa MIENTRAS la otra persona
     graba el suyo. Para cuando alguien quiera volver a oírlo, la voz ya está.

     Lo que vuelve reemplaza a la grabación en la lista: a partir de ahí lo que
     suena es el personaje leyendo el texto, y la grabación de verdad no se
     reproduce nunca. Mientras no haya vuelto, la casilla queda marcada como
     «preparándose» y no suena nada: sonaría la voz real, y tener dos registros
     --la de verdad y la del personaje-- rompe el efecto justo al principio, que
     es cuando más falta hace.
     ========================================================================== */
  function subirTurno(v, orden, intento) {
    /* TODO ESTO VA DENTRO DE UN TRY. Sin él, una excepción síncrona --un objeto
       que no es el que se esperaba, un método que no existe-- se lleva por
       delante el `.then` que apaga el reloj de la casilla, y lo que queda es un
       reloj girando para siempre y ningún motivo en ninguna parte. Pasó: cuatro
       partidas creadas, cero turnos, cero registros en el servidor y el aviso
       vacío, porque el fallo ocurría ANTES de cualquier sitio donde se anotara.
       Aquí no puede perderse nada: lo que reviente queda escrito en el turno. */
    try { intentarSubir(v, orden, intento); }
    catch (e) {
      v.preparando = false;
      v.falloLaNube = true;
      v.motivo = 'se rompió al subir: ' + (e && (e.message || e.name) || e);
      marcarRueda(orden);
    }
  }

  function intentarSubir(v, orden, intento) {
    if (!v) return;
    if (!window.ATWI.nube) {
      v.falloLaNube = true;
      v.motivo = 'no se cargó el puente con el servidor (nube.js)';
      return marcarRueda(orden);
    }
    if (!window.ATWI.nube.hay()) {
      v.falloLaNube = true;
      v.motivo = window.ATWI.nube.ultimoFallo() || 'sin servidor ni sesión';
      return marcarRueda(orden);
    }
    intento = intento || 0;
    if (!P || !P.debate) {
      /* La partida todavía no tiene id: se abrió en paralelo y puede tardar.
         Se espera unas cuantas veces —lo que cuesta grabar un turno— y SE DEJA:
         sin tope esto se reintentaba cada cuatro segundos para siempre, y una
         partida que nunca abrió en el servidor no va a abrir sola. */
      if (intento >= 5) {
        v.falloLaNube = true;
        v.motivo = window.ATWI.nube.ultimoFallo() ||
                   'la partida no llegó a abrirse en el servidor';
        return marcarRueda(orden);
      }
      v.preparando = true;
      marcarRueda(orden);
      return setTimeout(function () { subirTurno(v, orden, intento + 1); }, 4000);
    }
    v.preparando = true;
    marcarRueda(orden);
    window.ATWI.nube.mandarTurno({
      debate: P.debate, orden: orden, numero: v.turno,
      audio: v.audio, tipo: v.tipo, segundos: v.segundos,
      navegador: v.navegador,
      avatar: v.avatar, nombre: v.nombre, color: v.color,
      esInvitado: v.jugador !== indiceDeLaCuenta(),
      abogado: Boolean(v.abogado)
    }).then(function (r) {
      /* OJO: aquí NO se apaga `preparando` en general. En el camino de la voz se
         apaga más abajo, cuando el audio ya está descargado; apagarlo aquí sería
         encender la casilla con una promesa en vez de con un sonido. */
      if (r && r.voz) { /* lo apaga `bajarLaVoz` */ } else { v.preparando = false; }
      if (!r) {
        v.falloLaNube = true;
        v.motivo = window.ATWI.nube.ultimoFallo() || 'el servidor no devolvió nada';
        return marcarRueda(orden);
      }
      if (r.valido === false) {
        v.falloLaNube = true;
        v.motivo = (r.aviso || 'no se aceptó el audio') +
                   (r.motivo ? ' (' + r.motivo + ')' : '');
        return marcarRueda(orden);
      }
      v.transcripcion = r.transcripcion || '';
      v.guion = r.guion || '';
      if (r.voz) {
        /* LA CASILLA NO SE ENCIENDE HASTA QUE EL AUDIO ESTÁ AQUÍ. Se encendía
           al recibir la URL firmada, que es solo una dirección: al tocarla, el
           navegador empezaba a bajar el mp3 y el primer toque no sonaba. Había
           que tocar dos veces, y la segunda funcionaba porque para entonces ya
           había bajado.

           Se baja a un blob en vez de dejárselo al elemento de audio, y así se
           gana otra cosa: la URL firmada caduca en una hora y el blob no, así
           que una partida larga se puede seguir escuchando entera.

           `preparando` sigue en verdadero todo este rato --la casilla sigue
           girando-- que es la verdad: todavía no se puede oír. */
        return bajarLaVoz(r.voz).then(function (local) {
          if (!P) return;
          if (!local) {
            v.falloLaNube = true;
            v.motivo = 'la voz llegó pero no se pudo descargar';
            return marcarRueda(orden);
          }
          if (v.url && v.url.indexOf('blob:') === 0) {
            try { URL.revokeObjectURL(v.url); } catch (e) {}
          }
          v.url = local;
          v.conVoz = true;
          v.preparando = false;
          marcarRueda(orden);
        });
      } else if (r.abogado === false) {
        /* SIN ABOGADO NO HAY VOZ QUE ESPERAR, y eso NO es un fallo. Se queda la
           grabación de la persona, que es lo que esta partida acordó que suene.
           Sin distinguirlo, «no toca» y «no se pudo» se ven igual desde fuera
           --los dos llegan con `voz: null`-- y cada turno sin abogado saldría
           marcado en rojo. */
        v.conVoz = false;
      } else {
        v.falloLaNube = true;
        v.motivo = 'se transcribió pero no llegó la voz del personaje';
      }
      marcarRueda(orden);
    }, function (e) {
      /* El rechazo de la promesa también: si no se atrapa, el reloj se queda
         girando igual que con la excepción síncrona. */
      v.preparando = false;
      v.falloLaNube = true;
      v.motivo = 'falló la subida: ' + (e && e.message || e);
      marcarRueda(orden);
    });
  }

  /** El detalle de una casilla que no suena. Va en un modal y no en un aviso
      pequeño porque el motivo puede ser largo y hay que poder leerlo entero y
      copiarlo. */
  function contarQuePasa(v, titulo, explicacion) {
    var viejo = $('#p-detalle');
    if (viejo) viejo.remove();
    var m = document.createElement('div');
    m.id = 'p-detalle';
    m.className = 'detalle';
    m.innerHTML =
      '<div class="detalle__caja" role="dialog" aria-modal="true">' +
        '<p class="detalle__titulo">' + esc(titulo) + '</p>' +
        '<p class="detalle__que">' + esc(explicacion) + '</p>' +
        (v.motivo ? '<p class="detalle__motivo">' + esc(v.motivo) + '</p>' : '') +
        bitacoraHTML() +
        '<p class="detalle__quien">' + esc(v.nombre || '') + ' · turno ' + v.turno +
          ' · ' + (v.segundos || 0) + ' s' +
          (v.audio && v.audio.size ? ' · ' + Math.round(v.audio.size / 1024) + ' KB' : '') +
        '</p>' +
        '<button type="button" class="boton boton--bloque" data-accion="p-cerrar-detalle">' +
          'Entendido</button>' +
      '</div>';
    $('#m-partida').appendChild(m);
  }

  /** Se trae el audio de verdad y devuelve una URL local, o null si no se pudo.
      Sin esto, la casilla promete algo que todavía no está. */
  function bajarLaVoz(url) {
    return fetch(url)
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { return b && b.size ? URL.createObjectURL(b) : null; })
      .catch(function () { return null; });
  }

  /** La bitácora de la grabadora, para poder leerla EN EL APARATO. Aquí no hay
      consola que abrir, y los fallos de los controles de audio son de los que no
      dejan rastro: un botón que no hace nada no escribe nada en ningún sitio.
      Va plegada, que en lo normal no interesa a nadie. */
  function bitacoraHTML() {
    if (!grabadora.bitacora) return '';
    var b = grabadora.bitacora();
    if (!b.length) return '';
    return '<details class="detalle__bitacora">' +
        '<summary>Qué hizo la grabadora (' + b.length + ' pasos)</summary>' +
        '<pre>' + esc(b.map(function (x) {
          return (x.ms / 1000).toFixed(1) + 's  ' + x.que +
                 '  [' + x.estado + ' · ' + x.seg + 's]' +
                 (x.extra ? '  ' + x.extra : '');
        }).join('\n')) + '</pre>' +
      '</details>';
  }

  /** Repinta UNA casilla sin rehacer la pantalla: repintar entera cortaría la
      grabación en curso, y esto llega justo mientras el otro habla. */
  function marcarRueda(orden) {
    var r = $('#m-partida .rueda[data-oir="i' + orden + '"]');
    var v = P && P.intervenciones[orden];
    if (!r || !v) return;
    r.classList.toggle('rueda--preparando', Boolean(v.preparando));
    r.classList.toggle('rueda--sinvoz', Boolean(v.falloLaNube));
    refrescarElAviso();
  }

  /* EL AVISO DE LINEA TAMBIEN SE REFRESCA. Se dibujaba en `loDicho()`, que solo
     corre al repintar la pantalla entera --y el resultado de la subida llega
     DESPUES de ese repintado--, asi que la casilla se marcaba y el texto no
     aparecia nunca. Se actualiza aqui, junto a la casilla, que es cuando se sabe.
     No se repinta la pantalla: repintarla a mitad cortaria la grabacion en curso. */
  function refrescarElAviso() {
    var caja = $('#m-partida .dicho');
    if (!caja) return;
    var viejo = caja.querySelector('.dicho__fallo');
    var html = motivoDelFallo();
    if (!html) { if (viejo) viejo.remove(); return; }
    if (viejo) viejo.outerHTML = html;
    else caja.insertAdjacentHTML('beforeend', html);
  }

  function borrar() {
    pararEscucha();
    grabadora.descartar();
    tirarBorrador();
    pintarTurno();
  }

  /* El juez acusa recibo con una de las cinco frases fijas. No evalúa, no
     comenta y no llama al modelo: aquí solo pasa el turno.

     Y NO CAMBIA DE PANTALLA. Tenía la suya, con el icono del juez en grande y
     un «Registrado, que hable la otra parte», y era una pantalla de más en
     medio de la partida: lo único que pasa aquí es que le toca al otro. Así que
     el turno se pasa YA y se vuelve a pintar la misma sala con la figura de
     quien sigue. De una intervención a la otra, lo que cambia es la persona y
     el texto del botón; todo lo demás se queda quieto. */
  function acusarRecibo(t) {
    P.estado = 'recibo';
    P.cerrando = t.esUltima;

    if (P.cerrando) {
      pintarSala({
        dice: alAzar(cfg.frasesDeCierre),
        pie: principal('p-seguir', 'Ver el resultado')
      });
      return;
    }

    /* Y se pasa DIRECTO al turno de quien sigue. Había un paso intermedio que
       anunciaba a quién le tocaba y pedía un toque para continuar; decía lo
       mismo que el botón de la pantalla siguiente —«Turno de Diana»— y cobraba
       un toque por decirlo. Con dos teléfonos hará falta algo ahí, porque habrá
       que esperar a que el otro mande lo suyo; en un solo teléfono no hay nada
       que esperar. */
    P.i++;
    pintarTurno();
  }

  function seguir() {
    /* DIRECTO AL VEREDICTO, sin pantalla de espera en medio. Había una que
       decía «Deliberando…» y cobraba un toque más por no hacer nada: hoy no hay
       juez, así que esa espera era mentira, y el botón que la cerraba decía lo
       mismo que el que la abría.

       El toque sigue haciendo falta, y no es un capricho: la política de
       autoreproducción del navegador deja el audio bloqueado hasta que hay un
       gesto, y sin él no suena ni el redoble (docs/01 §8.6). Lo que cambia es
       que ese toque ya estaba —el botón del último turno— y ahora lleva al
       veredicto en vez de a una sala de espera.

       Cuando el árbitro exista sí habrá algo que esperar, y el sitio correcto
       para esa espera es DESPUÉS del toque: la cuenta atrás y el redoble tapan
       los segundos que el modelo tarde en pensar, en vez de enseñar una
       pantalla quieta antes. `deliberar()` se queda escrita para entonces. */
    if (P.cerrando) return revelar();
    pintarTurno();
  }

  /* ==========================================================================
     6. EL RESULTADO
     Todavía sin servidor: no hay transcripción ni juez de verdad, así que se
     enseña el efecto con un resultado simulado y se dice que lo es.
     ========================================================================== */
  /* SIN USO POR AHORA, a propósito. Es la pantalla del árbitro pensando, y hoy
     no hay árbitro: `seguir()` va directo al veredicto. Cuando lo haya, esta
     vuelve —pero DESPUÉS del toque, mientras el modelo trabaja. */
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
      /* DE UN SORTEO, y se dice en pantalla. El dia que el arbitro conteste de
         verdad, esto pasa a falso y el aviso desaparece solo. */
      simulado: true,
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
    if (a === 'p-cerrar-detalle') { var d = $('#p-detalle'); if (d) d.remove(); return; }
    if (a === 'p-oir-todo') { oir('i0'); return; }
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

  window.ATWI.partida = { empezar: empezar, repasar: repasar, cerrar: cerrar };
})();
