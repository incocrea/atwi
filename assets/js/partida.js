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
    /* LA COMILLA SIMPLE TAMBIÉN (2026-09-19, docs/07). Hoy ningún atributo del
       juego va entre comillas simples, así que no se explotaba; el día que
       alguien escriba uno, esto ya está puesto. */
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function alAzar(l) { return l[Math.floor(Math.random() * l.length)]; }

  /* El nombre del modo con el «IA» resaltado: negoc·IA·ción, controvers·IA. */
  function nombreModo(clave) {
    var m = (cfg.modos || {})[clave];
    if (!m) return '';
    return esc(m.partido[0]) + '<b class="ia">' + esc(m.partido[1]) + '</b>' + esc(m.partido[2]);
  }
  /* Cuánto se puede hablar en ESTE modo. Un solo sitio que lo sepa: el tope se
     usa para abrir el micro, para el reloj y para decidir si se puede agregar
     más, y con tres lecturas sueltas de la configuración basta con cambiar una
     para que el reloj cuente hasta un sitio y el micro corte en otro. */
  function topeDeTurno() {
    var t = cfg.reglas.segundosPorTurno;
    if (typeof t === 'number') return t;          // por si vuelve a ser uno solo
    /* SI EL MODO NO ESTÁ EN LA TABLA, SE DA EL TIEMPO MÁS LARGO. `P.modo` es
       'debate' o 'negociacion' y son las claves de la tabla, pero si algún día
       dejan de coincidir el fallo tiene que caer del lado bueno: cortar a
       alguien a la mitad de una frase porque una clave no casaba es invisible
       --nadie sospecha del reloj-- y da un turno peor. Sobrar tiempo se nota y
       se arregla. */
    var suyo = t[P && P.modo];
    if (typeof suyo === 'number') return suyo;
    return Math.max.apply(null, Object.keys(t).map(function (k) { return t[k]; }));
  }

  function relojTexto(s) {
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  /* Estado de la partida en curso */
  var P = null;
  /* El oyente de `pagehide` mientras se espera el veredicto. Vive fuera de `P`
     porque hay que poder quitarlo, y `P` se reemplaza entero al abrir otra. */
  var dejandoLaEspera = null;
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
  /* Dos de los cuatro colores ilustrados, para cuando una partida guardada no
     trae el suyo. Eran hexadecimales de los diez aros viejos: eso ya no apunta
     a ningún dibujo y dejaba a la figura sin imagen. */
  var COLOR_POR_DEFECTO = ['azul', 'amarillo'];

  function empezar(op) {
    var gente = (op.posturas || op.quien || ['Tú', 'La otra parte']).map(ficha);
    var abre = typeof op.abre === 'number' ? op.abre : 0;
    P = {
      /* QUIEN JUZGA ESTA RONDA. Se elige antes de empezar y no cambia a mitad,
         igual que el abogado: el juez esta presente toda la partida --dice las
         frases entre turnos-- y es quien presenta el resultado. */
      juez: (op.juez && window.ATWI.esJuez(op.juez)) ? op.juez : 'bruno',
      tema: op.tema,
      modo: op.modo,                 // 'debate' | 'negociacion' | 'competencia'
      /* QUIÉNGANE: qué minijuego se juega (docs/10). En los otros modos, nulo.
         ⚠️ Y DESDE EL PIVOTE (2026-09-22) EL QUE MANDA ES `juegos`: uno por
         ronda, en orden. `juego` se conserva porque los textos --la invitación,
         el chip de la tarjeta, el correo-- hablan en singular y no pueden
         escribir tres nombres; es el primero del reparto, derivado. */
      juego: op.modo === 'competencia' ? (op.juego || null) : null,
      juegos: op.modo === 'competencia' ? (op.juegos || null) : null,
      turnos: op.turnos,             // por persona (en QuiénGane, RONDAS)
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
    /* ⚠️ Y SE PUEDE VOLVER A PEDIR (titular, 2026-09-22: una partida local de
       QuiénGane jugada entera terminó en «No se pudo mandar · faltan datos» y
       no salió en el historial). La creación había fallado --un permiso de la
       0084, arreglado en la 0085-- y la partida siguió sin id: en QuiénGane
       local eso es jugar todas las rondas sobre una partida que no existe. La
       carcasa ya no deja empezar sin id (`abiertaSinId`) y ofrece `reabrir`. */
    P.reabrir = abrirEnElServidor;
    abrirEnElServidor();
    function abrirEnElServidor() {
    if (!P) return Promise.resolve(null);
    P.abiertaSinId = false;
    if (window.ATWI.nube && window.ATWI.nube.hay()) {
      /* Y SE GUARDA LA PROMESA (`P.abriendo`): en QuiénGane la primera ronda
         genera su tablero con el id de la partida —la semilla local sale de
         él— así que la carcasa tiene que poder esperarlo si todavía no llegó.
         En los otros modos nadie la mira. */
      P.abriendo = window.ATWI.nube.abrirPartida({
        tema: P.tema, modo: P.modo, turnos: P.turnos, juez: P.juez, juego: P.juego, juegos: P.juegos,
        abogadoYo: P.jugadores[indiceDeLaCuenta()].abogado,
        abogadoOtro: P.jugadores[1 - indiceDeLaCuenta()].abogado,
        /* El personaje DEL DUELO. Con abogado es el elegido; sin abogado es el
           avatar de la ficha, que es lo que se ve aunque la voz sea humana. */
        personajeYo: P.jugadores[indiceDeLaCuenta()].avatar,
        personajeOtro: P.jugadores[1 - indiceDeLaCuenta()].avatar,
        invitado: P.jugadores[1 - indiceDeLaCuenta()],
        /* Para poder RETOMARLA después: con qué ficha juega esta cuenta en esta
           ronda, y qué lado abrió. Las dos se deciden aquí y en ningún otro
           sitio quedan. Ver la migración 0031. */
        yo: P.jugadores[indiceDeLaCuenta()],
        abreLado: P.orden[0] === indiceDeLaCuenta() ? 'propone' : 'invitado'
      }).then(function (id) { if (P) { P.debate = id; P.abiertaSinId = !id; } return id; });
      return P.abriendo;
    }
    return Promise.resolve(null);
    }
    abrir();
    /* Las poses del encuentro se piden YA, aunque falten cinco segundos para
       verlas. Y se GUARDA LA PROMESA: el sorteo dura lo que dura y casi siempre
       llegan a tiempo, pero en un teléfono que abre la app por primera vez no, y
       sin esperarla la entrada arrancaba con las figuras a medio bajar. */
    P.poses = Promise.all([
      window.ATWI.precargarPoses(
        P.jugadores.map(function (j) { return j.avatar; }),
        [poseDelEncuentro()],
        /* El color va en paralelo: cada lado tiene el suyo y la pieza que hay que
           bajar es la de ESE color, no una cualquiera del personaje. */
        P.jugadores.map(function (j) { return j.color; })),
      /* Y EL ESTALLIDO ENTRA EN LA MISMA ESPERA. Desde que es un dibujo de
         200 KB y no dos letras ni un degradado, puede llegar tarde; y llega
         justo en el fotograma del golpe, que es el peor sitio posible: sale de
         un `scale(2.2)` en 460 ms y una animación que ya empezó no se puede
         volver a empezar. */
      window.ATWI.precarga.listas([piezaDelEncuentro(P.modo, P.publico)])
    ]);
    precargarElFinal();
    pintarAviso();
  }

  /* LAS PIEZAS DEL FINAL SE PIDEN AL PRINCIPIO, que es cuando sobra tiempo.
     Entre abrir la sala y ver al juez deliberando pasan varios minutos de grabar
     y escuchar; pedirlas al llegar allí es pedirlas tarde, y ahí es donde peor
     se ve —el juez entra desde abajo y las dos posturas se funden una en otra:
     con la pieza a medio bajar, el movimiento arranca contra un hueco—.
     No se espera a nada: es fondo puro. Para cuando la pantalla llegue, están. */
  function precargarElFinal() {
    var quien = (P.juez && window.ATWI.esJuez(P.juez)) ? P.juez : 'bruno';
    P.piezasDelJuez = window.ATWI.precargarJuez(
      quien, POSTURAS_DELIBERAR.concat(['veredicto']));
    /* Y las dos poses de la revelación, que llegan justo después. */
    window.ATWI.precargarPoses(
      P.jugadores.map(function (j) { return j.avatar; }),
      ['ganar', 'sentado'],
      P.jugadores.map(function (j) { return j.color; }));
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
  /* ABRIR UNA PARTIDA DEL HISTORIAL, de dos maneras que no son la misma.
     `repasar(d)` es lo de siempre: se vuelven a oír las intervenciones.
     `repasar(d, {estrenar: true})` es lo nuevo (petición del titular,
     2026-09-15) y contesta a «si la ronda se guarda pero el veredicto no se
     visualiza, ¿cómo lo ve después?»: si esa partida tiene resultado y nadie lo
     vio nunca --`resultados.visto` en nulo-- no se abre en repaso, se ESTRENA,
     con la revelación entera. Un veredicto que nadie vio no es material de
     archivo: es la primera vez, y la primera vez lleva su ceremonia. */
  /* VOLVER A SENTAR A LOS DOS, con la ficha de ESTA ronda. Lo usan el repaso, el
     estreno de un veredicto guardado y la retoma, que necesitan exactamente lo
     mismo: quién es cada lado, quién habla primero y qué se dijo ya.

     LOS ÍNDICES SON POR LADO Y NO POR ORDEN DE PALABRA, y aquí había un fallo
     de verdad. `jugadores[0]` es SIEMPRE quien propuso y `jugadores[1]` el
     invitado; quién abre lo dice `orden`. El repaso lo hacía al revés
     --`jugadores[0]` era quien hablaba primero-- y daba igual mientras el
     repaso no enseñara resultado, porque nadie leía esos índices. Desde que una
     partida del historial puede ESTRENAR su veredicto sí se leen:
     `delArbitro()` da por hecho que `jugadores[0]` es el lado `propone`, así
     que en una ronda abierta por el invitado habría coronado al otro. Un
     veredicto con el nombre cambiado es de los peores fallos que esta app puede
     tener.

     LA FICHA SALE DEL TURNO SI LO HAY, y del debate si no. El turno la sella
     intervención a intervención, que es lo más preciso; desde la migración 0031
     el debate también la sella al abrirse, y eso cubre al lado que todavía no
     habló --una ronda retomada después de una sola intervención--. */
  function mesaDelDebate(d, t) {
    var abreP = d.abre_lado !== 'invitado';
    function fichaDeLado(lado, i) {
      /* DE QUÉ LADO ES UN TURNO LO DICE `perfil`, NO LA PARIDAD DE `orden`.
         Es la misma regla que usa el árbitro (`ladoDe`): el turno cuyo `perfil`
         es quien propone es de `propone`, y lo demás —nulo en partida local— es
         del invitado.

         ⚠️ ESTO SE INTENTÓ DOS VECES POR LA PARIDAD Y LAS DOS SALIÓ MAL, una en
         cada sentido. La app manda `orden` EMPEZANDO EN 0
         (`subirTurno(v, P.intervenciones.length - 1)`), así que quien abre lleva
         los PARES; el 2026-09-16 se cambió a impares creyendo que empezaba en 1,
         porque el ejercicio 1 del banco de pruebas estaba numerado desde 1 y el
         banco parecía dar la razón. Lo zanja el CHECK de la base —`orden entre 0
         y 5`—: con numeración desde 1 una ronda de tres turnos necesitaría un 6
         y no cabría. Lo descubrió el ejercicio 10, que es la primera de tres
         turnos que se corre.

         Y NO SE ARREGLA INVIRTIENDO EL NÚMERO OTRA VEZ, porque entonces queda
         una tercera convención esperando a fallar. Se usa el dato que dice lo
         que hay que saber. Lo que había en juego: `delArbitro()` da por hecho
         que `jugadores[0]` es el lado `propone`, así que con los lados cambiados
         un veredicto abierto desde el historial corona a la otra persona, que es
         el fallo que `CLAUDE.md` llama el peor que esta app puede tener. */
      var x = t.filter(function (q) {
        return window.ATWI.nube.ladoDeTurno(q, d) === lado;
      })[0];
      if (x) {
        return { nombre: x.nombre || (i ? 'La otra parte' : 'Vos'),
                 avatar: x.avatar || (i ? 'luna' : 'kai'),
                 color: x.color || COLOR_POR_DEFECTO[i],
                 abogado: Boolean(x.abogado) };
      }
      /* Y SI EL DEBATE TAMPOCO LA TIENE, el perfil de esta cuenta --pero solo
         para el lado `propone`, que es quien está sentado aquí--. Pasa con las
         partidas abiertas ANTES de la migración 0031, que no sellaba la ficha
         de quien propone: sin esto arrancarían de Kai aunque la persona sea
         Maya. Para el invitado no hay de dónde sacarla, y ahí sí van los
         valores de reserva. */
      var mio = lado === 'propone' && datos && datos.perfil ? datos.perfil() : null;
      return { nombre: d[lado + '_nombre'] || (mio && mio.nombre) || (i ? 'La otra parte' : 'Vos'),
               avatar: d[lado + '_avatar'] || (mio && mio.avatar) || (i ? 'luna' : 'kai'),
               color: d[lado + '_color'] || (mio && mio.color) || COLOR_POR_DEFECTO[i],
               abogado: Boolean(lado === 'propone' ? d.abogado_propone : d.abogado_invitado) };
    }
    var orden = abreP ? [0, 1] : [1, 0];
    return {
      jugadores: [fichaDeLado('propone', 0), fichaDeLado('invitado', 1)],
      orden: orden,
      intervenciones: t.map(function (x, n) {
        return {
          /* El índice del JUGADOR, no la paridad: en una ronda que abrió el
             invitado, la intervención 0 es suya y ésa es `jugadores[1]`. */
          jugador: orden[n % 2],
          turno: x.numero || Math.floor(n / 2) + 1,
          avatar: x.avatar, nombre: x.nombre, color: x.color,
          abogado: Boolean(x.abogado),
          segundos: x.segundos || 0,
          transcripcion: x.transcripcion, guion: x.guion,
          /* La ruta, todavia sin bajar. El audio se trae al tocarlo: bajar seis
             de golpe al abrir es gastar datos de alguien por si acaso. */
          /* Siempre la voz del personaje (2026-09-18): el original no existe. Las
             partidas anteriores sin abogado se quedaron sin audio a propósito. */
          ruta: x.voz_ruta || null,
          /* SALVO QUE EL TURNO YA TRAIGA LA URL. De la base nunca viene —alli
             solo esta la ruta dentro del cubo— pero la demo de la landing llega
             con los audios ya servidos desde `assets/`, y esto es lo que hace
             que no tenga que pedirle nada al almacen. Escrito `url: null` a
             secas, la url congelada se perdia aqui y el reproductor se quedaba
             mudo sin decir por que. */
          url: x.url || null
        };
      })
    };
  }

  /** Los turnos de un debate del historial, en orden y sin sorpresas. */
  function turnosDe(d) {
    return (d.turnos_grabados || []).slice()
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
  }

  function repasar(d, op) {
    op = op || {};
    var t = turnosDe(d);
    /* QUIÉNGANE NO SE VUELVE A OÍR: no hay intervenciones. Lo que tiene es un
       resultado, y volver a abrirlo es volver a verlo con su tabla de rondas.
       `estrenar` sigue decidiendo el sello y la contabilidad, como siempre. */
    if (d.modo === 'competencia') {
      if (!d.resultado) return;
      var mesaJ = mesaDelDebate(d, t);
      P = {
        tema: { id: d.tema_catalogo, enunciado: d.enunciado, titulo: d.enunciado },
        modo: 'competencia', juego: d.juego || null, juegos: d.juegos || null, turnos: d.turnos, publico: 'pareja',
        jugadores: mesaJ.jugadores, orden: mesaJ.orden, intervenciones: [], i: 0, borrador: null,
        estado: 'repaso', repaso: !op.estrenar, estrenando: Boolean(op.estrenar),
        juez: d.juez || null, veredicto: d.resultado, enLinea: Boolean(d.en_linea),
        miLado: miLadoEn(d), abandono: d.abandono || null, debate: d.id
      };
      return revelar();
    }
    if (!t.length) return;
    /* Al repaso se viene a OÍR. Nada de esta pantalla graba. */
    window.ATWI.grabadora.soltar('repaso');

    var mesa = mesaDelDebate(d, t);
    P = {
      tema: { id: d.tema_catalogo, enunciado: d.enunciado, titulo: d.enunciado },
      modo: d.modo,
      turnos: d.turnos,
      publico: 'pareja',
      jugadores: mesa.jugadores,
      orden: mesa.orden,
      intervenciones: mesa.intervenciones,
      i: 0,
      borrador: null,
      estado: 'repaso',
      repaso: !op.estrenar,
      estrenando: Boolean(op.estrenar),
      /* SIN ESTO EL VEREDICTO SALE SIN JUEZ. `juez` vive en el debate --se
         elige antes de empezar y vale para toda la partida-- y el repaso nunca
         lo había necesitado porque no enseñaba resultado. */
      juez: d.juez || null,
      /* EL RESULTADO VA SIEMPRE, se estrene o no.
         ⚠️ Aquí decía `op.estrenar ? (d.resultado || null) : null`, y eso hacía
         que **un veredicto solo se pudiera ver una vez**: al volver a abrirlo
         desde el repaso, `P.veredicto` llegaba en nulo, `delArbitro()` no corría
         y la revelación salía vacía —el listón, los dos avatares y un botón de
         «Salir»—, sin desglose, sin justificación y sin el botón de «Qué dijo el
         juez», que aparece solo si hay algo que enseñar.
         Lo encontró el titular al reabrir el ejercicio 1 del banco (2026-09-16).

         `estrenar` decide LA CEREMONIA —el redoble, las serpentinas, sellar
         `visto`—, no si hay datos. Confundir las dos cosas convirtió «ver el
         resultado otra vez» en una pantalla que no dice nada. */
      veredicto: d.resultado || null,
      /* En línea puedo ser el invitado: sin esto el resultado se leería desde
         el lado de quien propuso, con los nombres al revés para mí. */
      enLinea: Boolean(d.en_linea),
      miLado: miLadoEn(d),
      abandono: d.abandono || null,
      debate: d.id
    };
    /* EN NEGOCIACIÓN EL RESULTADO ES EL ACTA (2026-09-18). El repaso de una
       Negociación terminada pasaba por `arrancarVotacion()` sin propuestas
       cargadas y caía en «no contestó»: el cierre no se podía volver a ver. Se
       monta aquí desde la última acta --firmada, «Ninguna» o parada del
       mediador--, que es lo que la pareja dejó, y `revelar()` lo pinta como la
       primera vez. La parada trae sus párrafos y su cierre en `lo_que_dijo`. */
    if (d.modo === 'negociacion') {
      var actas = (d.acuerdos || []).slice().sort(function (a, b) { return (b.version || 0) - (a.version || 0); });
      var acta = actas[0] || null;
      P.propuestasListas = Boolean(acta);
      P.cerrada = Boolean(acta);
      P.acuerdo = acta && acta.tipo === 'acuerdo' ? { texto: acta.texto } : null;
      /* La fila de la parada dice si fue dura (`lo_que_dijo.parada`) o blanda
         (con parrafos y cierre). Las dos terminan la partida (titular, 2026-09-18). */
      P.paradaNegociacion = acta && acta.tipo === 'parada'
        ? ((acta.lo_que_dijo && acta.lo_que_dijo.parada === 'dura') ? 'dura' : 'blanda') : null;
      var lqd = acta && acta.lo_que_dijo;
      if (lqd && lqd.parada !== 'dura') {
        /* P1 = quien propone = `jugadores[0]`, sea yo o no (0055). */
        P.loQueDijoNegociacion = [
          { nombre: P.jugadores[0].nombre, texto: lqd.p1 || '' },
          { nombre: P.jugadores[1].nombre, texto: lqd.p2 || '' }
        ].filter(function (q) { return q.texto; });
        P.cierreNegociacion = lqd.cierre || null;
      }
    }
    /* EN LÍNEA, ABRIR LA PARTIDA CERRADA CUMPLE SU AVISO (0060): «resultado» y
       «la negociación se cerró» se van del buzón al abrirla, no al leerlos. En
       Negociación no hay fila en `resultados` que sellar y aun así hace falta. */
    if (P.enLinea && window.ATWI.nube && window.ATWI.nube.marcarVisto) window.ATWI.nube.marcarVisto(d.id);
    if (op.estrenar) {
      /* SE SELLA AL ABRIR Y NO AL CERRAR. Quien abre la revelación ya la vio; y
         esperar al final dejaría sin sellar justo a quien cierra la app a mitad
         del redoble, que es la persona para la que existe todo esto. */
      var n = window.ATWI.nube;
      if (n && n.marcarVisto) n.marcarVisto(d.id);
      /* No se abre la sala: se va derecho a la revelación, igual que hace el
         probador. `revelar()` esconde `#m-partida` de todas maneras. */
      return revelar();
    }
    abrir();
    window.ATWI.precargarPoses(P.jugadores.map(function (j) { return j.avatar; }),
                               ['hablando'],
                               P.jugadores.map(function (j) { return j.color; }));
    pintarRepaso();
  }

  /* ==========================================================================
     RETOMAR UNA PARTIDA A MEDIO JUGAR
     Decisión del titular (2026-09-15). El historial centraliza las partidas: las
     terminadas y las EN CURSO, y una en curso se abre justo donde se quedó.

     No es solo para cuando algo falla. Es una manera de jugar: rondas sueltas en
     sesiones distintas --se graban dos turnos hoy y los demás mañana-- y, cuando
     exista la partida remota, en aparatos distintos. Ahí retomar no es un
     rescate, es EL flujo: mando lo mío, cierro, y vuelvo cuando me avisan.

     LO QUE HACE FALTA YA ESTABA GUARDADO, casi todo: los turnos suben uno a uno
     en cuanto se mandan, con su audio, su transcripción y su personaje. Lo que
     faltaba era saber quién abrió y con qué ficha jugó quien propuso, y eso lo
     puso la migración 0031. Sin esas dos cosas la mesa se volvía a montar a
     ojo.

     Y NO SE VUELVE A PASAR POR EL SORTEO. Quién abre ya se decidió y se jugó;
     repetir la ceremonia sería volver a tirar un dado que ya cayó. Se entra
     derecho al turno que toca. */
  function reanudar(d) {
    var t = turnosDe(d);
    var total = (d.turnos || 3) * 2;
    /* SIN NINGÚN TURNO TAMBIÉN SE RETOMA, y arranca en el primero. La partida
       ya tiene decidido todo lo suyo --tema, modo, cuántos turnos, quién juzga
       y con qué fichas--; lo único que le falta es que alguien hable. Salían
       bloqueadas en el historial y no era una decisión, era el botón heredado
       de cuando abrir una partida solo servía para oírla. */
    /* CON TODOS LOS TURNOS, LO QUE FALTA ES EL VEREDICTO, no una intervención.
       Es la partida de quien cerró la app mientras el juez leía: se retoma en la
       pantalla de deliberar, con el botón de volver a pedirlo, que es la misma
       de la sala. Retomar es una sola puerta y lleva a donde haga falta. */
    var faltaElVeredicto = t.length >= total;

    var mesa = mesaDelDebate(d, t);
    /* QUIÉNGANE SE RETOMA EN SU PROPIA SALA (lo vio el titular, 2026-09-21:
       «al recargar una partida en curso de juego carga como si fuera un
       debate»). Esta función montaba la sala de VOZ —casillas de turnos y el
       micrófono— para una partida donde no se graba nada: cada juego carga su
       estado en su propio timeline. Sin sorteo —ya se sorteó al abrirla— y
       derecho a la carcasa, que en local retoma del progreso guardado en el
       teléfono y en línea le pregunta al servidor por dónde va. */
    if (d.modo === 'competencia') {
      P = {
        juez: (d.juez && window.ATWI.esJuez(d.juez)) ? d.juez : 'bruno',
        tema: { id: d.tema_catalogo, enunciado: d.enunciado, titulo: d.enunciado },
        modo: 'competencia', juego: d.juego || null, juegos: d.juegos || null, turnos: d.turnos, publico: 'pareja',
        jugadores: mesa.jugadores, orden: mesa.orden, intervenciones: [], i: 0,
        borrador: null, estado: 'juego', repaso: false, reanudada: true,
        enLinea: Boolean(d.en_linea), miLado: miLadoEn(d),
        abandono: d.abandono || null, debate: d.id
      };
      abrir();
      precargarElFinal();
      return arrancarJuego();
    }
    P = {
      juez: (d.juez && window.ATWI.esJuez(d.juez)) ? d.juez : 'bruno',
      tema: { id: d.tema_catalogo, enunciado: d.enunciado, titulo: d.enunciado },
      modo: d.modo,
      turnos: d.turnos,
      publico: 'pareja',
      jugadores: mesa.jugadores,
      orden: mesa.orden,
      intervenciones: mesa.intervenciones,
      /* DONDE SE QUEDÓ. La siguiente intervención es la que sigue a las que ya
         están: con cuatro grabadas, la que toca es la quinta, índice 4. Y como
         `turnoActual()` saca de aquí el jugador y el número de turno, con esto
         solo la sala ya sabe de quién es la palabra. */
      i: t.length,
      borrador: null,
      estado: 'turno',
      /* NO ES UN REPASO y hay que decirlo: `turnoActual()` se corta en seco si
         `repaso` está puesto y devuelve siempre el primer jugador. */
      repaso: false,
      reanudada: true,
      debate: d.id
    };
    separarFichas();
    abrir();
    /* Va antes del desvío a deliberar: una partida que se retoma a pedir su
       veredicto entra en esa pantalla de inmediato, sin los minutos de grabar
       que en una partida nueva dan tiempo de sobra a bajar al juez. */
    precargarElFinal();
    /* EN NEGOCIACION SE PIDE SIN PREGUNTAR: `mediar()` es idempotente --las
       propuestas ya guardadas vuelven sin llamar al modelo, y la parada blanda
       tambien desde la migracion 0052-- asi que retomar una Negociacion con las
       intervenciones hechas lleva derecho a votar. En Controversia se pregunta
       antes porque pedir el veredicto cuesta. */
    if (faltaElVeredicto && P.modo === 'negociacion') {
      P.juicio = pedirPropuestas();
      return deliberar();
    }
    if (faltaElVeredicto) return deliberar(true);
    window.ATWI.precargarPoses(P.jugadores.map(function (j) { return j.avatar; }),
                               ['hablando'],
                               P.jugadores.map(function (j) { return j.color; }));
    pintarTurno();
  }

  function pintarRepaso() {
    P.estado = 'repaso';
    pintarSala({
      dice: P.intervenciones.length + ' intervenciones · toca una para oírla',
      pie: '<button class="boton boton--bloque boton--grande" data-accion="p-oir-todo">' +
             iconoSVG('play', 22) + 'Oír la partida entera</button>' +
           /* MISMO TAMANO QUE EL DE ARRIBA --le faltaba `--grande`-- y punteado
              por ser el que queda en blanco. Regla del titular. */
           '<button class="boton boton--suave boton--bloque boton--grande boton--punteado" ' +
             'data-accion="p-revelar">Ver el resultado otra vez</button>'
    });
  }

  /* CUÁL DE LOS DOS TIENE CUENTA. En la partida local juega quien abrió la app
     --el índice 0 de `jugadores`, que sale de su propia ficha-- contra alguien
     que agarró el teléfono. El de enfrente no tiene perfil en ninguna parte, y
     eso decide qué se guarda en `turnos.perfil`: el suyo va NULO.
     EN LÍNEA (0055) los dos tienen cuenta y esta puede ser la del INVITADO:
     `jugadores[0]` sigue siendo quien propuso --es lo que `delArbitro()` da
     por hecho-- y lo que cambia es cuál de los dos soy yo. */
  function indiceDeLaCuenta() { return P && P.miLado === 'invitado' ? 1 : 0; }

  /* ==========================================================================
     LA PARTIDA EN LÍNEA (decisiones del titular, 2026-09-18; migración 0055)
     Dos cuentas, dos teléfonos, un turno cada 24 horas como mucho. Lo que
     cambia respecto a la local cabe en cuatro cosas:
       · quién soy yo lo dice la partida (`miLado`), no el índice 0;
       · el sorteo LO DECIDIÓ EL SERVIDOR al aceptar (`abre_lado`) y aquí solo
         se REVELA, una vez por lado (`intro_visto_*`): los dos ven la misma
         ruleta caer en el mismo sitio, cada uno en su teléfono;
       · después de mandar lo mío no viene el turno del otro, viene ESPERAR:
         una pantalla que dice a quién le toca y hasta cuándo, y que se
         actualiza sola cuando la app pregunta por novedades;
       · y grabar solo se ofrece cuando me toca. La función `turno` lo vuelve a
         comprobar del otro lado, por si acaso.
     ========================================================================== */
  /** De qué lado de esta partida está la cuenta que la abrió. */
  function miLadoEn(d) {
    var yo = window.ATWI.auth && window.ATWI.auth.sesion();
    yo = yo && yo.user && yo.user.id;
    return d.aceptado_por && d.aceptado_por === yo ? 'invitado' : 'propone';
  }

  function enLinea(d) {
    var miLado = miLadoEn(d);
    var t = turnosDe(d);
    var mesa = mesaDelDebate(d, t);
    P = {
      juez: (d.juez && window.ATWI.esJuez(d.juez)) ? d.juez : 'bruno',
      tema: { id: d.tema_catalogo, enunciado: d.enunciado, titulo: d.enunciado },
      modo: d.modo,
      turnos: d.turnos,
      publico: 'pareja',
      jugadores: mesa.jugadores,
      orden: mesa.orden,
      intervenciones: mesa.intervenciones,
      i: t.length,
      borrador: null,
      estado: 'turno',
      repaso: false,
      reanudada: t.length > 0,
      enLinea: true,
      /* QuiénGane: el minijuego de la partida; la carcasa pregunta al servidor
         por dónde va (`estado_del_juego`). */
      juego: d.juego || null,
      juegos: d.juegos || null,
      miLado: miLado,
      plazo: d.plazo || null,
      /* Quien no contesto en 24 h (0056): con esto la ronda esta cerrada
         aunque falten intervenciones, y lo que toca es el veredicto. */
      abandono: d.abandono || null,
      debate: d.id
    };
    separarFichas();
    abrir();
    precargarElFinal();
    P.poses = Promise.all([
      window.ATWI.precargarPoses(P.jugadores.map(function (j) { return j.avatar; }),
        [poseDelEncuentro()],
        P.jugadores.map(function (j) { return j.color; })),
      window.ATWI.precarga.listas([piezaDelEncuentro(P.modo, P.publico)])
    ]);
    window.ATWI.precargarPoses(P.jugadores.map(function (j) { return j.avatar; }),
                               ['hablando'],
                               P.jugadores.map(function (j) { return j.color; }));
    /* La revelación del sorteo, UNA VEZ POR LADO: el host que invitó y volvió
       cuando el otro ya grabó también la ve —es su primera vez en esta sala—
       y la ruleta cae donde el servidor dijo. Vista una vez, se entra derecho.
       ⚠️ Y SI YA JUGUÉ UN TURNO, YA VI EL SORTEO, diga lo que diga el flag
       (titular, 2026-09-21). El fallo: se abre la partida desde el buzón, que
       usa la copia del historial en memoria; si esa copia se cargó ANTES de que
       yo entrara la primera vez, trae `intro_visto_*` en null aunque el servidor
       ya lo tenga puesto, y el intro se repite «como si apenas empezara» con dos
       intervenciones ya jugadas. El flag por sí solo depende de que la copia
       local esté fresca; haber jugado un turno no depende de nada y no miente:
       si hay una intervención mía, es imposible no haber visto el sorteo. */
    var vista = miLado === 'invitado' ? d.intro_visto_invitado : d.intro_visto_propone;
    var yaJugue = P.intervenciones.some(function (v) { return v.jugador === indiceDeLaCuenta(); });
    if (!vista && !yaJugue) {
      P.estado = 'aviso';
      /* Se marca también en la copia local, no solo en el servidor: reabrir la
         misma partida desde el buzón, sin que el historial se haya refrescado,
         no puede volver a mostrar el intro. `d` es la entrada del historial en
         memoria (`abrirPartida` la pasa por referencia). */
      if (miLado === 'invitado') d.intro_visto_invitado = true; else d.intro_visto_propone = true;
      if (window.ATWI.nube && window.ATWI.nube.marcarIntroVista) window.ATWI.nube.marcarIntroVista(d.id);
      return pintarAviso();
    }
    loQueToca();
  }

  /** En línea, después de la revelación o de un refresco: grabar, esperar o el resultado. */
  function loQueToca() {
    /* QuiénGane: la carcasa decide sola —mis rondas, la espera o el resultado—
       preguntándole al servidor por dónde va la partida. */
    if (P.modo === 'competencia') return arrancarJuego();
    var total = P.turnos * 2;
    if (P.abandono || P.intervenciones.length >= total) {
      if (P.cerrando && P.juicio) return;   // ya se pidió al mandar el último
      P.cerrando = true;
      /* SE PIDE Y SE ESPERA, en los dos modos. Aqui iba `deliberar(true)` --la
         pantalla de «volver a pedirlo»-- copiada de `reanudar()`, y en linea el
         veredicto casi siempre esta en camino por la cola: enseñar el fallo
         antes de preguntar era enseñar al juez solo. `pedirVeredicto()` es
         idempotente y sondea hasta que esta. */
      P.juicio = P.modo === 'negociacion' ? pedirPropuestas() : pedirVeredicto();
      return deliberar();
    }
    P.i = P.intervenciones.length;
    var j = P.orden[P.i % 2];
    if (j === indiceDeLaCuenta()) return pintarTurno();
    pintarEspera();
  }

  /** Le toca al otro: se dice a quién, hasta cuándo, y se sale sin perder nada. */
  function pintarEspera() {
    P.estado = 'espera';
    /* AQUÍ NO SE GRABA Y PUEDE TARDAR UN DÍA: le toca al otro. Sin esto, mandar
       el turno en una partida en línea dejaba el micrófono abierto hasta que
       alguien cerrara la sala. */
    window.ATWI.grabadora.soltar('en línea: le toca al otro');
    var cab = $('#t-partida');
    if (cab) cab.textContent = 'La sala';
    if (P.limpiarEncuentro) { P.limpiarEncuentro(); P.limpiarEncuentro = null; }
    var otro = P.jugadores[P.orden[P.i % 2]];
    var hasta = P.plazo ? ' Tiene hasta ' + cuandoVence(P.plazo) + '.' : '';
    pintarSala({
      dice: 'Le toca a ' + otro.nombre + '.' + hasta + ' Te avisamos cuando conteste.',
      /* AQUÍ NO HAY NADA QUE PULSAR, ASÍ QUE NO HAY BOTÓN (titular, 2026-09-19:
         «en la pantalla de quien espera al otro, en vez de volver al inicio
         aquí pones "Esperando…"»). «Volver al inicio» era la única pieza grande
         de la pantalla y proponía irse, que es lo contrario de lo que esta
         pantalla cuenta: que la partida sigue viva y que ya avisamos. El estado
         ocupa su sitio —mismo alto, mismo radio— y late, que es lo que dice que
         esto no está colgado. La salida sigue estando donde está siempre, en el
         atrás de la cabecera, y la nota de abajo la nombra. */
      pie: esperandoHTML() +
           '<p class="chico centrado pie-nota">Puedes cerrar la app: la partida sigue en el Historial.</p>'
    });
  }

  /** El indicador de espera: la forma de un botón sin serlo. */
  function esperandoHTML(texto) {
    return '<p class="esperando" aria-live="polite">' + (texto || 'Esperando') +
             '<span class="esperando__puntos" aria-hidden="true"><i></i><i></i><i></i></span>' +
           '</p>';
  }

  /* El plazo, en palabras que se leen de un vistazo: la hora si vence hoy, el
     día y la hora si no. Sin segundos. */
  function cuandoVence(iso) {
    var f = new Date(iso);
    if (isNaN(f.getTime())) return '';
    var hoy = new Date();
    var hh = ('0' + f.getHours()).slice(-2) + ':' + ('0' + f.getMinutes()).slice(-2);
    if (f.toDateString() === hoy.toDateString()) return 'las ' + hh;
    var man = new Date(hoy.getTime() + 86400000);
    if (f.toDateString() === man.toDateString()) return 'mañana a las ' + hh;
    return 'el ' + f.getDate() + '/' + (f.getMonth() + 1) + ' a las ' + hh;
  }

  /**
   * La app preguntó por novedades y ESTA partida tiene algo nuevo. Si estoy
   * esperando, se vuelve a pedir y se sigue donde toque: mi turno, o el
   * resultado si el otro mandó el último.
   */
  function tocada(id) {
    if (!P || !P.enLinea || P.debate !== id) return;
    /* Esperando el voto del otro: se relee el estado de la votacion. */
    if (P.estado === 'esperando-voto' || P.estado === 'distintos') return refrescarVoto();
    if (P.estado !== 'espera') return;
    var n = window.ATWI.nube;
    if (!n || !n.partida) return;
    n.partida(id).then(function (d) {
      if (!P || !P.enLinea || P.debate !== id || P.estado !== 'espera' || !d) return;
      /* QuiénGane esperando las rondas del otro: lo único que puede llegar es
         el resultado, y se revela; si no está, se sigue esperando. */
      if (P.modo === 'competencia') {
        if (!d.resultado) return;
        P.veredicto = d.resultado;
        P.abandono = d.abandono || null;
        P.estado = 'deliberando';
        return revelar();
      }
      var t = turnosDe(d);
      if (t.length <= P.intervenciones.length && !d.cerrado && !d.abandono) return;
      var mesa = mesaDelDebate(d, t);
      P.intervenciones = mesa.intervenciones;
      P.plazo = d.plazo || null;
      if (d.abandono) {
        /* Se cerró por abandono mientras esperaba. En Controversia hay
           veredicto (victoria técnica) y se va a esperarlo; en Negociación no
           hay nada que revelar: se sale y la tarjeta lo dice. */
        P.abandono = d.abandono;
        if (P.modo === 'debate') return loQueToca();
        cerrar();
        if (window.ATWI.aviso) window.ATWI.aviso('La negociación quedó abandonada: la otra parte no contestó a tiempo.');
        if (window.ATWI.refrescarHistorial) window.ATWI.refrescarHistorial();
        return;
      }
      loQueToca();
    });
  }

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

  /* LA REGLA VIEJA ERA SEPARAR POR COLOR, y ya no vale. Cuando el color era un
     aro alrededor de una cara que no cambiaba, dos fichas del mismo color eran
     indistinguibles y se le movia el aro a uno. Desde que el color es EL DIBUJO,
     dos personas del mismo color siguen siendo dos dibujos distintos, y en
     cambio dos del mismo personaje son la misma figura exacta.

     Asi que lo que tiene que diferir es el PERSONAJE, y eso ya no se arregla
     aqui a escondidas: se avisa antes de lanzar, en la pantalla de preparar,
     donde todavia se puede cambiar. Cambiarle el color a alguien a espaldas
     suyas solo conseguia que la sala no se pareciera a lo que habia elegido.

     Se deja la funcion vacia y no se borra la llamada porque el sitio donde se
     llamaba sigue siendo el bueno el dia que haga falta otra comprobacion. */
  function separarFichas() {}

  function abrir() {
    var m = $('#m-partida');
    m.hidden = false;
    m.classList.add('modal--inmersivo');
    /* El color de la sala es el del modo. Juicio va en coral y Pacto en menta,
       y no se mezclan nunca: es la única regla de color que el juego no negocia. */
    m.setAttribute('data-ctx', 'sala-' + P.modo);
    /* En QuiénGane, el minijuego marca su propio fondo (`#m-partida[data-juego]`):
       Choque y Cuenta tienen el suyo. En los otros modos no aplica.
       ⚠️ AQUÍ SE MARCA EL DE LA PARTIDA Y SOLO SI ES UNA SOLA (pivote, 2026-09-22):
       la revelación y el duelo son de la partida entera, así que con reparto
       mixto no hay «su» fondo --poner el de la ronda 1 diría que la partida fue
       de ése-- y se queda el genérico de QuiénGane. Mientras se JUEGA manda la
       ronda, y eso lo marca la carcasa. */
    marcarJuegoDeLaPartida();
  }

  /* El fondo que le toca a la PARTIDA: el del juego solo si TODAS sus rondas
     son de ése. Se llama desde la sala y desde la revelación, que son las dos
     pantallas que no pinta la carcasa --la carcasa marca el de su ronda y borra
     la marca al cerrar--. */
  function marcarJuegoDeLaPartida() {
    var m = $('#m-partida');
    if (!m || !P) return;
    var reparto = (P.juegos && P.juegos.length) ? P.juegos : (P.juego ? [P.juego] : []);
    var unico = reparto.length && reparto.every(function (x) { return x === reparto[0]; })
      ? reparto[0] : null;
    if (P.modo === 'competencia' && unico) m.setAttribute('data-juego', unico);
    else m.removeAttribute('data-juego');
  }

  /* EL ASPA RETROCEDE UN PASO ANTES DE SACAR A NADIE, y esto era un fallo de
     verdad (lo encontró el titular, 2026-09-15): estando EDITANDO el acuerdo, el
     aspa cerraba la partida entera. Quien toca ahí está cancelando una edición
     --que es lo que el aspa significa en cualquier campo de texto del mundo--
     y se encontraba fuera de la sala.

     LA REGLA: si la pantalla de ahora está DENTRO de otra, el aspa vuelve a la
     de fuera. Solo cuando no queda nada detrás, sale. Los dos casos que hay:

       editando el acta  ->  vuelve al acta, con el texto como estaba
       firmando          ->  vuelve a elegir propuesta, con la suya marcada

     Y ESO ARREGLA TAMBIÉN EL ATRÁS DEL TELÉFONO, sin tocarlo: `retroceder()` en
     app.js no reimplementa nada, pulsa este mismo aspa. Un sitio, dos entradas.

     Lo que NO cambia: grabando y en revisión sigue preguntando, porque ahí sí
     hay algo que se pierde. En el repaso y en un ensayo no pregunta, porque ahí
     no hay nada que perder y avisar de una pérdida falsa enseña a no creer el
     aviso el día que es verdad. */
  function salirDeLaSala() {
    if (!P) return cerrar();

    if (P.estado === 'firmando' && P.actaEditando) {
      /* CANCELAR ES DESCARTAR, y se vuelve al texto de ANTES de abrir el campo
         --no al que propuso el mediador--: si ya lo habían editado y guardado
         una vez, ese trabajo no se tira por cancelar el segundo retoque. */
      P.actaTexto = P.actaAntes || P.actaTexto;
      P.actaEditando = false;
      return firmar();
    }
    if (P.estado === 'firmando' && hayQueElegir()) {
      /* Volver a elegir: «no, mejor la otra» es una cosa razonable de querer, y
         hasta ahora la única manera de hacerlo era salir de la partida. */
      return votar();
    }

    if (P.repaso) {
      /* En la demo, salir no es irse: es volver a empezar —la navegacion del
         visor es ficticia y no hay ningun sitio al que volver—.
         ⚠️ LA BANDERA SE LEE ANTES DE CERRAR, y esto fallaba: `cerrar()` acaba
         poniendo `P = null`, asi que preguntar por `P.demo` DESPUES lanza y el
         reinicio no llega a ocurrir nunca. Lo que quedaba era el modal cerrado
         sobre la vista de la app, que en el visor esta vacia: un telefono en
         blanco. Lo vio el titular dando al atras desde la ronda. */
      var eraDemo = P.demo;
      cerrar();
      if (eraDemo && window.ATWI.alTerminarEnsayo) window.ATWI.alTerminarEnsayo();
      return;
    }
    if (P.ensayo) {
      cerrar();
      if (window.ATWI.alTerminarEnsayo) window.ATWI.alTerminarEnsayo();
      return;
    }
    /* AQUÍ HABÍA UN `confirm()` Y SE FUE (petición del titular, 2026-09-15).
       Primero decía «si salís ahora, la partida se pierde», que dejó de ser
       verdad en cuanto las partidas en curso empezaron a retomarse desde el
       historial. Y después sobraba entero: preguntar «¿seguro?» antes de una
       acción que no destruye nada es enseñar a contestar que sí sin leer, y el
       día que un aviso sí importe nadie lo va a mirar.

       Encima un `confirm()` del navegador es lo peor que se puede poner en un
       juego a pantalla completa: rompe la inmersión y sale con la tipografía
       del sistema.

       Se sale y se avisa DESPUÉS, sin bloquear, diciendo lo que la persona
       necesita saber: dónde quedó la partida y que se retoma donde iba. Lo
       único que se pierde de verdad es el borrador sin mandar, y de eso avisa
       su propio botón antes. */
    var mandadas = (P.intervenciones || []).length;
    var total = P.turnos * 2;
    var esJuego = P.modo === 'competencia';
    cerrar();
    if (window.ATWI.aviso && esJuego) {
      /* EN QUIÉNGANE EL PROGRESO NO SE PIERDE (titular, 2026-09-21): en línea
         cada ronda confirmada ya está en el servidor, y en local las enviadas
         quedan guardadas en este teléfono; retomar desde el Historial sigue
         exactamente donde iba. Lo único que se pierde es la ronda a medio
         jugar, y ni eso cambia el reto: la semilla es de la ronda, así que al
         volver sale el mismo. */
      window.ATWI.aviso('Las rondas enviadas quedan guardadas. Sigue desde el Historial, justo donde iban.');
      return;
    }
    if (window.ATWI.aviso) {
      window.ATWI.aviso(mandadas
        ? 'Guardamos la partida con ' + mandadas + ' de ' + total +
          ' intervenciones. Seguila desde el Historial, justo donde ibas.'
        : 'La partida queda en el Historial, lista para empezarla cuando quieran.');
    }
  }

  function cerrar() {
    var m = $('#m-partida');
    if (m) { m.hidden = true; m.removeAttribute('data-ctx'); }
    dejarDeAvisar();
    pararPosturas();
    if (P && P.limpiarEncuentro) P.limpiarEncuentro();
    /* El juez se calla y su temporizador se para. Sin esto queda un intervalo
       vivo sobre una pantalla cerrada, y la voz podría seguir sonando encima de
       otra cosa. */
    pararJuez();
    try { vozJuez.pause(); vozJuez.onended = vozJuez.onerror = null; } catch (e) {}
    cerrarReproductor();
    tirarBorrador();
    /* Y la carcasa del minijuego, si la había: su reloj y sus temporizadores
       no pueden seguir corriendo sobre una sala cerrada. El duelo igual. */
    if (window.ATWI.juego) window.ATWI.juego.cerrar();
    if (P && P.pararDuelo) { P.pararDuelo(); P.pararDuelo = null; }
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
    /* GRABANDO DE NUEVO UN TURNO RECHAZADO (2026-09-18): el turno en pantalla
       es el que falló, no el que sigue. `P.regrabando` es su índice en
       `intervenciones`, y coincide con el `P.i` que tenía cuando se mandó. */
    var i = P.regrabando != null ? P.regrabando : P.i;
    var j = P.orden[i % 2];                   // índice del jugador
    return {
      jugador: j,
      nombre: P.jugadores[j].nombre,
      avatar: P.jugadores[j].avatar,
      color: P.jugadores[j].color,
      numero: Math.floor(i / 2) + 1,
      esUltima: i === P.turnos * 2 - 1,
      esPrimera: i === 0,
      regrabando: P.regrabando != null
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
  /* EL COLOR QUE GUARDA UNA PARTIDA ES UNA CLAVE --«azul», «verde»--, NO UN
     COLOR CSS. Desde que el color pasó a ser el dibujo del personaje se guarda
     por su nombre, y meterlo tal cual en un `style` deja una declaración
     inválida: el navegador la descarta entera y en silencio. El botón de mandar
     el turno salía transparente por esto. Se traduce aquí, en el único sitio
     donde la clave se convierte en pintura. */
  function tono(color) {
    return window.ATWI.colorPersonaje(color);
  }

  function principal(accion, texto, ico, apagado, color) {
    /* LA LETRA LA DECIDE EL COLOR, no el diseño. Sobre el amarillo y el verde de
       los personajes el texto blanco casi no se ve --1,27:1 y 1,70:1 medidos--,
       así que se pregunta cuál se lee mejor encima. Lo contesta
       `ATWI.letraSobre`, que vive con la tabla de colores. */
    var suyo = color ? tono(color) : null;
    var oscura = suyo && window.ATWI.letraSobre(suyo) === 'oscura';
    return '<button class="boton boton--bloque boton--grande boton--' + P.modo +
      (oscura ? ' boton--letra-oscura' : '') + '"' +
      ' data-accion="' + accion + '"' + (apagado ? ' disabled' : '') +
      (suyo ? ' style="--suyo:' + esc(suyo) + '"' : '') + '>' +
      (ico || '') + esc(texto) + '</button>';
  }

  function juez(clase, dice) {
    return '<div class="juez' + (clase ? ' ' + clase : '') + '" id="juez">' + cara() +
      '<p class="juez__dice" id="juez-dice">' + esc(dice) + '</p></div>';
  }

  /* ==========================================================================
     EL JUEZ EN LA SALA
     Un globo chico al lado de quien habla. Tres cosas y ninguna más:

       · ESTÁ. Mientras alguien graba, el juez escucha, y se le ve escuchar.
         Tres poses que se turnan cada tres segundos con un fundido.
       · ACUSA RECIBO. Al mandar un turno cambia a la pose de hablar, sale su
         burbuja con la frase y suena su voz.
       · Y NO HACE NADA MÁS. No valora, no comenta y no adelanta nada: si
         comentara lo que acabás de decir estaría evaluando a mitad de partida.

     POR QUÉ SU VOZ TAPA UNA ESPERA DE VERDAD. Al mandar el turno, la función de
     borde transcribe, pule y locuta: 2,7 s medidos. Sin nada en pantalla ese
     hueco se lee como que la app se colgó. Con el juez diciendo «te escuché»,
     el hueco es la app haciendo algo.

     LAS OCHO FRASES ESTÁN PREGRABADAS, una por juez, en `assets/audio/juez/`.
     Generarlas al vuelo añadiría su propia espera al hueco que vienen a tapar,
     y costaría en cada partida. Las graba `tools/frases_juez.py`.
     ========================================================================== */
  /* CINCO SEGUNDOS, no tres. A tres el juez cambiaba de postura demasiado
     seguido para lo que es --alguien escuchando-- y en 30 s de turno daba diez
     vueltas: eso no es escuchar, es inquietud. A cinco da seis, que es el ritmo
     de alguien que se reacomoda mientras atiende. */
  var MS_POSE = 5000;
  var vueltaJuez = null;      // el temporizador de las poses
  var vozJuez = new Audio();

  function figurasDelJuez() {
    var poses = window.ATWI.posesDeEscucha().concat(['hablando']);
    return poses.map(function (pose, i) {
      return '<img class="juez-globo__fig" data-pose="' + pose + '"' +
        (i === 0 ? '' : ' hidden') +
        ' src="' + window.ATWI.piezaJuez(P.juez, pose) + '" alt="" ' +
        'loading="eager" decoding="async">';
    }).join('');
  }

  /* LAS CUATRO SE PINTAN DE UNA Y SE ESCONDEN TRES, en vez de cambiarle el
     `src` a una sola. Cambiando el `src` la primera vuelta parpadea --el
     navegador vacía la imagen mientras baja la siguiente-- y justo la que más
     importa, la de hablar, llegaría tarde. Pesan 25 KB las cuatro. */
  function globoDelJuez() {
    /* EL DISCO ABAJO Y LA BURBUJA ENCIMA. Estuvo arriba a la derecha y no podía
       quedarse: ahí es donde sale el REPRODUCTOR cuando se oye una intervención
       --va sobre la cabeza de quien habla-- y le caía encima al juez. Abajo a la
       derecha de la figura no hay nada que tapar ni que lo tape, y la burbuja
       cabe por encima, sobre el torso.

       No se pone debajo del todo: el botón de grabar se sube un 5 % del alto de
       la figura para taparle los pies, así que el disco se aparta de ese borde. */
    return '<div class="juez-globo" id="juez-globo">' +
      '<p class="juez-globo__burbuja" id="juez-burbuja" hidden></p>' +
      '<span class="juez-globo__disco">' + figurasDelJuez() + '</span>' +
    '</div>';
  }

  function ponerPose(pose) {
    var g = document.getElementById('juez-globo');
    if (!g) return;
    [].forEach.call(g.querySelectorAll('.juez-globo__fig'), function (im) {
      im.hidden = im.dataset.pose !== pose;
    });
  }

  /* SOLO SE MUEVE CUANDO HAY ALGO QUE ESCUCHAR: mientras el micrófono está
     abierto o mientras suena una intervención. Decisión del titular, y es lo
     que convierte el bucle en una reacción: un juez que cambia de postura sobre
     una pantalla quieta es un adorno girando, y encima le roba la mirada al
     botón de grabar, que es lo único que hay que tocar ahí.

     Se comprueba EN CADA VUELTA en vez de encender y apagar el temporizador
     desde los sitios donde se empieza a grabar y a reproducir. Son seis sitios
     --empezar, pausar, reanudar, terminar, oír, cerrar el reproductor-- y el
     día que aparezca un séptimo nadie se acordaría de este.

     Cuando no hay nada que escuchar NO se vuelve a una pose fija: se queda en la
     que esté. Volver haría que el juez pegara un salto cada vez que termina un
     audio, que es justo el movimiento que esto viene a quitar. */
  /* «GRABANDO» NO ES SOLO `state === 'recording'`, Y POR ESO EL JUEZ SE QUEDABA
     QUIETO (lo cazó el titular, 2026-09-15: «la animación no corre mientras la
     grabadora está en modo grabar»).

     La grabadora RECORTA SILENCIOS: en cuanto alguien se calla un segundo se
     pone en `paused`, y vuelve a `recording` al hablar otra vez. O sea que
     durante un turno normal el estado va y viene todo el rato. Como esto se
     comprueba EN CADA VUELTA, la mayoría de las vueltas caían en un silencio,
     devolvían falso y se saltaban el cambio de postura: el juez se quedaba diez
     o quince segundos en la misma, que es justo lo que se veía --y lo que
     también explica la impresión de «se repitió la pose»--.

     Es la MISMA trampa que ya estaba escrita en `pausarGrabacion()`, donde el
     botón de parar no hacía nada por preguntar solo por `grabando()`. Aquí la
     pregunta correcta es si el micrófono está ABIERTO, que es grabando O
     pausada: en las dos hay un turno en curso y hay a quién escuchar. */
  function microAbierto() {
    var g = window.ATWI.grabadora;
    return Boolean(g && (g.grabando() || g.pausada()));
  }

  function hayQueEscuchar() {
    if (microAbierto()) return true;
    var a = $('#sala-audio');
    return Boolean(a && !a.paused && !a.ended);
  }

  /* SIGUE DESDE LA POSE QUE YA ESTÁ PUESTA, no desde la primera. `pintarSala()`
     llama aquí cada vez que la pantalla cambia --turno, grabando, revisión-- y
     arrancando siempre en `poses[0]` el juez volvía a la misma postura en cada
     salto. Visto seguido, dos veces la misma. */
  function juezEscucha() {
    pararJuez();
    var poses = window.ATWI.posesDeEscucha();
    /* La que se ve es la única sin `hidden`: `ponerPose()` las esconde todas
       menos una, no las marca con una clase. */
    var puesta = document.querySelector('#juez-globo .juez-globo__fig:not([hidden])');
    var i = Math.max(0, poses.indexOf(puesta && puesta.dataset.pose));
    ponerPose(poses[i]);
    vueltaJuez = setInterval(function () {
      if (!document.getElementById('juez-globo')) return pararJuez();
      if (!hayQueEscuchar()) return;
      i = (i + 1) % poses.length;
      ponerPose(poses[i]);
    }, MS_POSE);
  }

  function pararJuez() {
    if (vueltaJuez) { clearInterval(vueltaJuez); vueltaJuez = null; }
  }

  /**
   * El juez dice una frase: pose de hablar, burbuja y voz. Devuelve una promesa
   * que se cumple cuando termina, pero NADIE LA ESPERA para seguir jugando: si
   * el audio no carga o el navegador lo bloquea, el turno sigue igual. La frase
   * escrita se ve siempre; la voz es el extra.
   */
  function juezDice(texto, archivo) {
    var burbuja = document.getElementById('juez-burbuja');
    if (!burbuja) return Promise.resolve();
    pararJuez();
    ponerPose('hablando');
    burbuja.textContent = texto;
    burbuja.hidden = false;
    var volver = function () {
      if (!document.getElementById('juez-globo')) return;
      burbuja.hidden = true;
      juezEscucha();
    };
    return new Promise(function (listo) {
      var fin = function () { volver(); listo(); };
      /* Un tope por si el audio no llega: la burbuja no se puede quedar puesta
         para siempre porque un mp3 dio 404. */
      var red = setTimeout(fin, 6000);
      vozJuez.onended = function () { clearTimeout(red); fin(); };
      vozJuez.onerror = function () { clearTimeout(red); setTimeout(fin, 1800); };
      try {
        vozJuez.src = '../assets/audio/juez/' + P.juez + '-' + archivo + '.mp3';
        var t = vozJuez.play();
        if (t && t.catch) t.catch(function () { /* sin gesto todavía: queda el texto */ });
      } catch (e) { /* lo mismo */ }
    });
  }

  /** Una de las cinco de entre turnos, con su archivo. */
  function fraseEntreTurnos() {
    var l = cfg.frasesDelJuez;
    var i = Math.floor(Math.random() * l.length);
    return { texto: l[i], archivo: 'entre-' + (i + 1) };
  }

  /** Una de las tres de cerrar. */
  function fraseDeCierre() {
    var l = cfg.frasesDeCierre;
    var i = Math.floor(Math.random() * l.length);
    return { texto: l[i], archivo: 'cierre-' + (i + 1) };
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
          '<span class="pista__icono">' + icono('play', 26) + '</span>' +
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
                     (v.falloLaNube ? ' rueda--sinvoz' : '') +
                     (porOir(n, v) ? ' rueda--por-oir' : '') + '"' +
                   ' style="--voz:' + esc(tono(j.color)) + '"' +
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
                   ' style="--voz:' + esc(tono(j.color)) + '"' +
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
    var n = P.intervenciones.indexOf(falla);
    return '<p class="dicho__fallo">Turno ' + falla.turno + ' de ' + esc(falla.nombre || '') +
           ' sin guardar: ' + esc(m) +
           '<br><span class="tenue">Toca la casilla ' + (n + 1) + ' para ' +
           (falla.regrabable ? 'grabarlo de nuevo' : 'volver a mandarlo') + '.</span></p>';
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
    if (i && i.falloLaNube) return contarFallo(i, P.intervenciones.indexOf(i));
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

  /** Devuelve true si dejó programada la siguiente pista; false si ésta era la
     última y no hay nada más que oír. Quien llama usa eso para cerrar el
     reproductor al terminar la cadena. */
  function encadenar() {
    var l = ordenDePistas();
    var i = l.indexOf(sonando);
    if (i < 0 || i === l.length - 1) return false;    // era la última
    var proxima = l[i + 1];
    if (siguiendo) clearTimeout(siguiendo);
    siguiendo = setTimeout(function () {
      siguiendo = null;
      /* Se comprueba otra vez: en ese segundo se pudo cerrar el reproductor,
         tocar otra pista o salirse de la sala. */
      if (!P || sonando !== l[i]) return;
      oir(proxima);
    }, MS_ENTRE_PISTAS);
    return true;
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
    r.style.setProperty('--voz', q.color ? tono(q.color) : 'var(--ctx-acento)');
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
          'aria-label="Cerrar el reproductor">' + icono('cerrar', 22) + '</button>' +
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
    if (ev === 'ended') {
      /* ESCUCHADA ENTERA (modo en línea): la condición para poder grabar el
         turno siguiente es haber oído la del otro, y «oída» es hasta el final,
         no darle al play. Se anota por índice de intervención. */
      if (String(sonando).charAt(0) === 'i') {
        P.escuchadas = P.escuchadas || {};
        P.escuchadas[Number(String(sonando).slice(1))] = true;
        /* Y SE RECUERDA EN EL TELÉFONO: quien la oyó anoche y vuelve hoy a
           contestar no tiene que oírla otra vez para que se le abra el micro. */
        if (P.enLinea && P.debate) {
          try { localStorage.setItem('atwi.oidas.' + P.debate, JSON.stringify(P.escuchadas)); } catch (e) {}
          /* Y EL DORADO SE APAGA EN EL ACTO. El halo dice «esto está sin oír»,
             así que el momento en que deja de ser verdad es éste y no el
             siguiente repintado: una llamada que sigue puesta después de
             atenderla es de las que enseñan a ignorar el aviso. */
          apagarPorOir(Number(String(sonando).slice(1)));
        }
      }
      /* SE CIERRA SOLO AL TERMINAR (titular, 2026-09-21). Antes el reproductor
         se quedaba abierto cuando la cadena se acababa, y con él la figura del
         que habló: el botón decía «Turno de X» y en pantalla seguía la cara del
         otro —se oyó su turno y nadie cerró el control—, que es justo la
         confusión que la figura existe para evitar. Ahora, cuando ésta era la
         última pista y no hay nada más que encadenar, se cierra y se vuelve al
         turno y al personaje actual (`cerrarReproductor` → `ponerHablante(null)`).
         Si la cadena sigue, no se toca: se cierra al final de todo. */
      a.currentTime = 0;
      if (!encadenar()) { cerrarReproductor(); return; }
    }

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
    if (ib) ib.innerHTML = icono(sonando === 'b' && !a.paused ? 'pausa' : 'play', 26);
  }

  var arrastrando = false;

  /* ==========================================================================
     1. EL SORTEO, ANTES DE EMPEZAR
     ========================================================================== */
  function pintarAviso() {
    marcarTurno(null);
    /* SIN «LA SALA» EN LA CABECERA, y solo en esta pantalla (titular,
       2026-09-16). Aquí el rótulo del modo es lo que hay que mirar —es lo
       primero que dice a qué se va a jugar— y tenerlo debajo de un título
       escrito era decir dos cosas en el mismo sitio, con la de arriba diciendo
       menos. En las pantallas de turno el título vuelve: allí el rótulo ya no
       está y la cabecera es lo único que sitúa.
       Se repone en `pintarTurno()`, que es la siguiente pantalla que se pinta
       pase lo que pase. */
    var rotulo = $('#t-partida');
    if (rotulo) rotulo.textContent = '';
    var esJuego = P.modo === 'competencia';
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
            /* En QuiénGane lo configurado son RONDAS de un minijuego, y el chip
               dice cuál: es lo único de esta pantalla que no se ve en el dibujo. */
            (P.modo === 'competencia'
              /* Sin el chip de rondas (titular, 2026-09-22): leyendo los juegos
                 --uno por ronda-- ya se sabe cuántas son. */
              ? '<span class="chip">' + esc(nombreDelJuego()) + '</span>'
              : '<span class="chip">' + P.turnos + (P.turnos === 1 ? ' turno' : ' turnos') + ' cada uno</span>') +
          '</div>' +
        '</div>' +
        /* EL SORTEO SE VE Y SE OYE. Antes ponía el resultado ya hecho, que es
           como enseñar el dado en la mesa en vez de tirarlo: quién abre es la
           primera cosa que el juego decide por ustedes y merece sus cuatro
           segundos. La ficha salta entre las dos, va frenando, y para.
           ⚠️ EN QUIÉNGANE NO SE SORTEA NADA A LA VISTA (titular, 2026-09-21:
           «no hay un orden de importancia entre quién inicia, ya que ambos
           juegan por separado; puede pasar directo a la entrada de los
           personajes»). Y es exacto: en los otros dos modos quién abre CAMBIA
           la partida —se abre a ciegas y se contesta habiendo oído—, así que
           merece su ceremonia; aquí cada quien juega su tablero solo y el orden
           es nada más el del relevo. Cuatro segundos de tambores para decidir
           algo que no decide nada es justo lo que hace que la gente aprenda a
           saltarse las animaciones. `abre` se sigue sorteando —alguien tiene que
           empezar el relevo—, lo que se va es contarlo. */
        (esJuego ? '' :
        '<div class="sorteo">' +
          '<p class="sorteo__que">Quién inicia</p>' +
          '<span class="avatar sorteo__ficha" id="sorteo-ficha"></span>' +
          '<p class="sorteo__quien" id="sorteo-quien">&nbsp;</p>' +
          /* Aquí iba «Salió por sorteo. En la revancha abre X». Se va: lo del
             sorteo acaba de verse en pantalla durante cuatro segundos, y quién
             abre la revancha no le importa a nadie antes de jugar esta. */
        '</div>') +
      '</div>';
    /* El botón espera al sorteo: si no, se puede pasar de largo y el juego
       habría decidido quién abre sin que nadie lo viera. En QuiénGane no hay
       nada que esperar, así que nace encendido. */
    pie().innerHTML = principal('p-listo', 'Empezar', '', !esJuego);
    if (!esJuego) return correrSorteo();
    /* Derecho a la entrada de los personajes. Espera a las poses por lo mismo
       que el sorteo: una animación que empieza sin sus dibujos se ve a trozos
       y no se puede volver a empezar. */
    (P.poses || Promise.resolve()).then(function () {
      if (!P || P.estado !== 'aviso') return;
      entrarAlEncuentro();
    });
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
  /* LO QUE ESTALLA EN EL ENCUENTRO. Dos ejes, y cada uno responde a una
     pregunta distinta:

     QUÉ SALE lo dice el MODO. En Controversia los dos se plantan y cae un VS;
     en Pacto siguen hasta chocar el puño y sale un corazón. El dibujo dice de
     qué va el modo antes que cualquier rótulo.

     DE QUÉ COLOR lo dice la MESA (decisión del titular, 2026-09-16): rosa con
     la pareja, azul con la familia, dorado con los amigos. Es la misma
     distinción que ya tiñe el catálogo, y aquí cae en el único fotograma de la
     partida donde se ven las dos personas juntas y sin nada más alrededor.
     ⚠️ El dorado de amigos NO es su color: su mesa es lavanda (`#EDE6FF`) y
     ninguna de las dos planchas trae morado. Es lo más neutro de lo que hay, y
     se cambia en esta línea el día que el morado exista. */
  var TINTE_DE_MESA = { pareja: 'rosa', amigos: 'sol', familia: 'azul' };

  /* EL CORAZÓN ES SOLO DE PACTO, y esto estaba escrito como «lo que no es
     Controversia» cuando había dos modos: QuiénGane caía en el choque de puños
     y en el corazón, que es lo contrario de un duelo por un premio (docs/10 §3).
     Ahí los dos se plantan y cae el VS, como en Controversia. Es la quinta vez
     que una lista de dos modos escrita a mano se queda coja con el tercero. */
  function esPacto() { return P && P.modo === 'negociacion'; }
  function poseDelEncuentro() { return esPacto() ? 'puno' : 'plante'; }

  function piezaDelEncuentro(modo, publico) {
    return '../assets/img/iconos/' + (modo === 'negociacion' ? 'choque' : 'vs') +
           '-' + (TINTE_DE_MESA[publico] || 'sol') + '.png';
  }

  var MS_ANTES_DEL_ENCUENTRO = 1000;   // desde que para la ficha del sorteo
  var MS_SALIDA_GANADOR = 300;         // lo que tarda en irse quien abre
  var MS_VIAJE = 620;                  // lo que dura la entrada entera
  var MS_CONTACTO = 480;               // cuándo se tocan dentro de esa entrada

  function entrarAlEncuentro() {
    if (!P || P.estado !== 'aviso') return;
    var m = $('#m-partida');
    if (!m || $('#encuentro')) return;

    var pacto = esPacto();
    var pose = poseDelEncuentro();
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
        /* CON SU COLOR. Iba sin el, asi que `retrato` caia en el de serie y las
           dos figuras salian SIEMPRE EN AZUL por mucho que cada uno hubiera
           elegido el suyo. Los rotulos de abajo si llevaban el color bueno, que
           es lo que hacia que no cuadraran: el chip verde y la figura azul. */
        window.ATWI.retrato(izq.avatar, pose, { fondo: null, mira: 'derecha',
                                                color: izq.color,
                                                clase: 'encuentro__fig' }) +
      '</span>' +
      '<span class="encuentro__lado encuentro__lado--der">' +
        window.ATWI.retrato(der.avatar, pose, { fondo: null, mira: 'izquierda',
                                                color: der.color,
                                                clase: 'encuentro__fig' }) +
      '</span>' +
      '<span class="encuentro__rotulos">' + rotulado(izq) + rotulado(der) + '</span>' +
      /* EL ESTALLIDO LO PONE LA INTERFAZ Y NO EL DIBUJO. Las figuras traían el
         suyo y al juntarse se montaban unos sobre otros y sobre el puño
         contrario; se regeneraron sin ellos. Este cae donde se tocan de verdad,
         que es lo único que el dibujo no puede saber.

         LOS DOS SON YA PIEZAS DIBUJADAS (planchas del titular, 2026-09-16). El
         VS eran dos letras con `-webkit-text-stroke` y el choque un
         `repeating-conic-gradient` con máscara: los dos imitaban en código algo
         que no existía, y ahora existe. Cuál toca y de qué color lo decide
         `piezaDelEncuentro`. */
      '<img class="encuentro__golpe encuentro__golpe--' + (pacto ? 'choque' : 'vs') + '" ' +
        'src="' + piezaDelEncuentro(P.modo, P.publico) + '" ' +
        'alt="" aria-hidden="true" decoding="async">';
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
          /* EL JUEZ VA DENTRO DE `.hablante` Y NO SUELTO EN LA SALA, para que
             flote AL LADO de quien habla: así se ve que le está escuchando a
             ÉL, no a la pantalla. Se pinta después de la figura y se coloca
             encima con posición absoluta. */
          globoDelJuez() +
        '</div>' +
      '</div>';

    pie().innerHTML = op.pie;
    juezEscucha();
  }

  function pintarTurno() {
    /* El título vuelve: lo quita el sorteo, que es la pantalla de antes. */
    var cab = $('#t-partida');
    if (cab) cab.textContent = 'La sala';
    var t = turnoActual();
    P.estado = 'turno';
    tirarBorrador();
    /* La cortinilla del encuentro se va al empezar a jugar: estaba colgada del
       modal, no de la pantalla del sorteo, así que si no se quita a mano se
       queda debajo de los turnos hasta el final de la partida. */
    if (P.limpiarEncuentro) { P.limpiarEncuentro(); P.limpiarEncuentro = null; }

    /* En línea, hasta cuándo: es el reloj de las 24 horas, y quien lo pierde
       pierde la partida. */
    var hasta = P.enLinea && P.plazo && !t.regrabando ? ' Tienes hasta ' + cuandoVence(P.plazo) + '.' : '';
    pintarSala({
      dice: t.regrabando
        ? 'Tu turno ' + t.numero + ' no se entendió. Grábalo otra vez: te escucho.'
        : (t.esPrimera ? 'Abres tú. Te escucho.' : 'Te toca contestar. Te escucho.') + hasta,
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
                    ' data-accion="p-parar">' + icono('parar', 26) + 'Parar' +
               '<span class="boton__reloj" id="reloj-n">' +
                 relojTexto(Math.max(0, topeDeTurno() - grabadora.segundos())) +
               '</span></button>';
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
  /* EN LÍNEA NO SE GRABA SIN HABER OÍDO AL OTRO (titular, 2026-09-18: «si la
     persona no ha escuchado la intervención anterior de la otra persona no
     podrá grabar su nuevo turno; es condicional haber escuchado al otro para
     poder ejercer mi turno, excepto si soy el primero»). En local no hace falta:
     el otro acaba de hablar delante. Aquí el otro habló en su teléfono hace
     horas, y contestar sin oírlo es contestar a lo que uno se imagina.
     Devuelve el índice de la intervención que falta oír, o -1. */
  /** Lo escuchado en esta partida, traído del teléfono la primera vez. */
  function lasEscuchadas() {
    if (!P.escuchadas && P.debate) {
      try { P.escuchadas = JSON.parse(localStorage.getItem('atwi.oidas.' + P.debate) || '{}'); }
      catch (e) { P.escuchadas = {}; }
    }
    return P.escuchadas || {};
  }

  /* ¿ESTA CASILLA ESTÁ PIDIENDO QUE LA OIGAN? (titular, 2026-09-19). Es del
     otro, está lista y no se ha oído. `faltaOir()` mira solo la ANTERIOR
     —porque es la que bloquea grabar— y aquí se marcan TODAS las suyas sin oír:
     al retomar una partida de ayer pueden ser dos, y dejar una apagada sería
     decir que ésa ya está. Solo en línea: en local el otro acaba de hablar
     delante y no hay nada que recuperar. */
  function porOir(n, v) {
    if (!P || !P.enLinea || !v) return false;
    if (v.preparando || v.falloLaNube) return false;
    if (v.jugador === indiceDeLaCuenta()) return false;
    return !lasEscuchadas()[n];
  }

  /** Quita el halo de una casilla sin repintar la sala: repintar cortaría el
      audio que se acaba de oír y la figura que lo acompaña. */
  function apagarPorOir(n) {
    var b = document.querySelector('#m-partida [data-rueda="i' + n + '"]');
    if (b) b.classList.remove('rueda--por-oir');
  }

  function faltaOir() {
    if (!P || !P.enLinea || P.regrabando != null) return -1;
    var i = P.i;
    if (i <= 0) return -1;                       // abro yo: no hay nada que oír
    var anterior = P.intervenciones[i - 1];
    if (!anterior || anterior.jugador === indiceDeLaCuenta()) return -1;
    return lasEscuchadas()[i - 1] ? -1 : i - 1;
  }

  function pedirQueOiga(cual, disparador) {
    var v = P.intervenciones[cual];
    var quien = v && v.nombre || 'la otra parte';
    var g = window.ATWI.globo;
    if (!g || !g.abrir) return fallo('Primero escucha lo que dijo ' + quien + '.');
    g.abrir(disparador || $('#m-partida [data-accion="p-grabar"]'),
      { titulo: 'Primero escucha a ' + quien,
        texto: 'Para contestar hay que haber oído su intervención entera. Toca su casilla ' +
               'arriba —«lo que se dijo»— y, cuando termine, el micrófono se abre.' },
      { tinte: P.modo, signo: 'micro', signoTam: 64, etiqueta: 'Escucha antes de grabar',
        acciones: '<button class="boton boton--bloque boton--' + P.modo + '" data-oir-ahora="' + cual + '">' +
                  'Oír a ' + esc(quien) + '</button>' });
  }

  function empezarAGrabar(agregando) {
    if (abriendo || grabadora.grabando()) return;
    var falta = faltaOir();
    if (falta >= 0 && !agregando) return pedirQueOiga(falta);
    if (!grabadora.sePuede()) return fallo(grabadora.porQueNo());

    pararEscucha();

    /* EL RELOJ CUENTA HACIA ATRÁS (decisión del titular, 2026-09-14). Subiendo
       de 0 a 1:00 había que acordarse del tope para saber cuánto quedaba, y
       justo lo que hace falta saber mientras se habla es cuánto queda. Bajando,
       el número YA es la respuesta.

       Se calcula sobre lo GRABADO EN TOTAL y no sobre esta toma: el tiempo se
       gasta entre todas, así que al agregar sigue bajando donde se quedó. */
    var aCadaSegundo = function (s) {
      var n = $('#reloj-n');
      if (n) n.textContent = relojTexto(Math.max(0, topeDeTurno() - s));
    };
    var alTope = function () { pausarGrabacion(); };

    if (agregando && grabadora.pausada()) {
      pintarGrabando(true);
      grabadora.reanudar();
      return;
    }

    abriendo = true;
    pintarGrabando(false);
    grabadora.empezar(aCadaSegundo, topeDeTurno(), alTope)
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
    var tope = topeDeTurno();
    P.estado = 'grabando';

    /* SIN `medio`: el reloj va DENTRO del botón de parar. Encima de la figura
       obligaba a encogerla y a achatarle el óvalo de color para hacerle sitio, y
       el tiempo no es una pieza de la escena: es un dato del control que lo
       está contando. */
    pintarSala({
      dice: agregando ? 'Sigues sobre lo que ya grabaste.' : 'Te escucho.',
      pie: botonDeGrabar('parar') +
        /* El reloj ya dice cuánto queda, así que aquí NO se repite el número:
           dos cuentas del mismo tiempo en la misma pantalla es una de más, y la
           que baja sola es la que se mira. Lo que sí hay que decir es que ese
           tiempo se gasta entre todas las tomas del turno. */
        '<p class="chico centrado pie-nota">Estás grabando. Toca para parar. ' +
          'El reloj dice lo que te queda del turno.</p>'
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
    var tope = topeDeTurno();
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
                icono('papelera', 20) + 'Sí, borrar</button>' +
            '</div>' +
          '</div>'
        : '<div class="revision__otras">' +
            (puedeAgregar ? botonDeGrabar('agregar') : '') +
            '<button class="boton boton--suave boton--borrar" data-accion="p-borrar">' +
              icono('papelera', 20) + 'Borrar</button>' +
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
      /* SI ERA UN TURNO RECHAZADO, OCUPA SU SITIO y la partida vuelve a donde
         estaba (2026-09-18): el que sigue, o la pantalla de cierre si ya se
         había mandado el último. No se acusa recibo otra vez: el juez ya lo
         hizo cuando este turno se mandó la primera vez. */
      if (P.regrabando != null) {
        var orden = P.regrabando;
        P.regrabando = null;
        P.intervenciones.pop();
        var viejo = P.intervenciones[orden];
        if (viejo && viejo.url && viejo.url.indexOf('blob:') === 0) {
          try { URL.revokeObjectURL(viejo.url); } catch (e) {}
        }
        P.intervenciones[orden] = v;
        if (P.cerrando) volverAlCierre(); else pintarTurno();
        subirTurno(v, orden);
        return;
      }
      acusarRecibo(t);
      subirTurno(v, P.intervenciones.length - 1);
    });
  }

  /** Después de regrabar con la ronda ya cerrada: la pantalla de «ver el
      resultado» otra vez, y se vuelve a pedir el veredicto porque el de antes
      cayó con «la partida no terminó» (faltaba justo este turno). */
  function volverAlCierre() {
    P.estado = 'recibo';
    /* El juicio de antes cayó con «la partida no terminó» --faltaba justo este
       turno-- así que se pide otra vez. Pero NO desde aquí: el turno se está
       subiendo ahora mismo y volveríamos a preguntar demasiado pronto, que es
       el fallo que esto arregla. Lo arranca `arrancarElJuicio()` al guardarse. */
    P.juicio = null;
    pintarSala({ dice: '', pie: botonDeResultado() });
  }

  /* EL BOTON NO SE ENCIENDE HASTA QUE EL RESULTADO ESTA (titular, 2026-09-18:
     «el boton de ver resultado no debe estar activo si no ha llegado; se debe
     esperar y poner deliberando..., para no pasar a una pantalla donde este el
     juez solo sin veredicto»). Mientras el juicio corre dice «Deliberando...» y
     esta apagado; al llegar, «Ver el resultado». Si la llamada fallo, ahi si la
     pantalla de deliberar con «volver a pedirlo», que es para eso. */
  function botonDeResultado() {
    var listo = P.modo === 'negociacion' ? P.propuestasListas : P.veredictoListo;
    return listo ? principal('p-seguir', 'Ver el resultado')
                 : principal('p-seguir', 'Deliberando\u2026', '', true);
  }
  function esperarElResultado() {
    var cuando = P.juicio;
    if (!cuando) return;   // todavía no se pidió: ver `arrancarElJuicio`
    cuando.then(function () {
      if (!P || P.estado !== 'recibo') return;
      if (noContesto()) {
        bitacora('veredicto_no_llego', { detalle: P.veredictoMotivo || '' });
        return deliberar(true);
      }
      pie().innerHTML = botonDeResultado();
    });
  }

  /** ¿Se puede volver al turno `orden` ahora mismo? Solo con la sala quieta:
      nadie grabando ni con un borrador sin mandar. */
  function puedeRegrabar(orden) {
    var v = P && P.intervenciones[orden];
    if (!v || !v.falloLaNube || !v.regrabable) return false;
    if (P.repaso || P.regrabando != null) return false;
    if (P.borrador || grabadora.grabando() || abriendo) return false;
    return P.estado === 'turno' || P.estado === 'recibo';
  }

  function regrabar(orden) {
    if (!puedeRegrabar(orden)) return;
    var d = $('#p-detalle');
    if (d) d.remove();
    cerrarReproductor();
    P.regrabando = orden;
    pintarTurno();
  }

  /** El mismo audio, otra vez: para los fallos de voz o de red. */
  function remandar(orden) {
    var v = P && P.intervenciones[orden];
    if (!v || !v.audio) return;
    var d = $('#p-detalle');
    if (d) d.remove();
    v.falloLaNube = false;
    v.motivo = '';
    v.reintentos = 0;
    subirTurno(v, orden);
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
        return noSubio(v, orden, { clase: 'red', reintentar: true,
          aviso: window.ATWI.nube.ultimoFallo() || 'el servidor no devolvió nada' });
      }
      if (r.valido === false) return noSubio(v, orden, r);
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
            return noSubio(v, orden, { clase: 'red', reintentar: true,
              aviso: 'la voz llegó pero no se pudo descargar' });
          }
          if (v.url && v.url.indexOf('blob:') === 0) {
            try { URL.revokeObjectURL(v.url); } catch (e) {}
          }
          v.url = local;
          v.conVoz = true;
          v.preparando = false;
          marcarRueda(orden);
          arrancarElJuicio();
          pasarAEsperar(orden);
        });
      } else if (r.abogado === false) {
        /* SIN ABOGADO NO HAY VOZ QUE ESPERAR, y eso NO es un fallo. Se queda la
           grabación de la persona, que es lo que esta partida acordó que suene.
           Sin distinguirlo, «no toca» y «no se pudo» se ven igual desde fuera
           --los dos llegan con `voz: null`-- y cada turno sin abogado saldría
           marcado en rojo. */
        v.conVoz = false;
      } else {
        /* Desde el 2026-09-18 el servidor no contesta válido sin voz --si Azure
           falla, rechaza con `clase: voz`--, así que esto es un servidor viejo
           o una respuesta rara: se trata como fallo de voz, con reintento. */
        return noSubio(v, orden, { clase: 'voz', reintentar: true,
          aviso: 'se transcribió pero no llegó la voz del personaje' });
      }
      marcarRueda(orden);
      arrancarElJuicio();
      pasarAEsperar(orden);
    }, function (e) {
      /* El rechazo de la promesa también: si no se atrapa, el reloj se queda
         girando igual que con la excepción síncrona. */
      noSubio(v, orden, { clase: 'red', reintentar: true,
        aviso: 'falló la subida: ' + (e && e.message || e) });
    });
  }

  /* EL JUICIO SE PIDE CUANDO LA RONDA ESTÁ COMPLETA DE VERDAD, y este es el
     único sitio que lo sabe: el turno acaba de guardarse en el servidor.
     Tres guardas, y las tres hacen falta:
       · `P.cerrando` --era el último turno--, que lo puso `acusarRecibo`;
       · `!P.juicio` --no se pide dos veces--, porque por aquí se pasa también
         al regrabar y al volver de un fallo;
       · la sala sigue en el recibo: si alguien ya se fue de esta pantalla, lo
         que toque lo decide `seguir()` o el historial, no esto.
     Y repinta el pie, porque el botón dice «Deliberando…» hasta que llega. */
  /** ¿Están TODAS las intervenciones guardadas en el servidor? Una que sigue
      subiendo --o que falló-- significa que la ronda no está completa, y pedir
      el veredicto con un hueco es lo que devolvía «la partida no terminó». */
  function rondaSubidaEntera() {
    if (!P || !P.intervenciones || !P.intervenciones.length) return false;
    if (P.intervenciones.length < P.turnos * 2) return false;
    for (var i = 0; i < P.intervenciones.length; i++) {
      var v = P.intervenciones[i];
      if (v.preparando || v.falloLaNube) return false;
    }
    return true;
  }

  function arrancarElJuicio() {
    if (!P || !P.cerrando || P.juicio) return;
    /* Las dos pantallas donde se puede estar esperando: el recibo --con el
       botón en «Deliberando…»-- y la de deliberar, si ya se tocó. En cualquier
       otra (el historial, la revelación) lo que toque lo decide quien esté
       allí, no esto. */
    if (P.estado !== 'recibo' && P.estado !== 'deliberando') return;
    P.juicio = P.modo === 'negociacion' ? pedirPropuestas() : pedirVeredicto();
    if (P.estado === 'deliberando') return deliberar();
    pie().innerHTML = botonDeResultado();
    esperarElResultado();
  }

  /* EL SERVIDOR NO ACEPTÓ EL TURNO, Y DICE DE QUÉ CLASE FUE (2026-09-18). Tres
     clases y dos salidas:
       audio / argumento -> no se entendió o no era una intervención: hay que
                            GRABAR OTRA VEZ (`regrabable`)
       voz / red         -> se transcribió pero Azure no puso la voz, o no llegó:
                            el MISMO audio se vuelve a mandar. Primero solo, dos
                            veces con tres segundos entre medio --casi siempre
                            sale a la segunda--, y si insiste, el botón.
     En todos los casos el turno NO ESTÁ en el servidor: la casilla lo dice y
     `pedir_veredicto` no cerraría la ronda sin él. Aquí decía «cuenta para la
     partida igual», y era falso. */
  var REINTENTOS = 2;
  function noSubio(v, orden, r) {
    v.clase = r.clase || 'red';
    v.regrabable = Boolean(r.regrabar);
    v.remandable = Boolean(r.reintentar) && Boolean(v.audio);
    v.motivo = (r.aviso || 'no se aceptó el audio') +
               (r.motivo && r.motivo !== r.aviso ? ' (' + r.motivo + ')' : '');
    v.reintentos = v.reintentos || 0;
    if (v.remandable && v.reintentos < REINTENTOS && P) {
      v.reintentos++;
      v.preparando = true;
      marcarRueda(orden);
      return setTimeout(function () { if (P && P.intervenciones[orden] === v) subirTurno(v, orden); }, 3000);
    }
    v.preparando = false;
    v.falloLaNube = true;
    marcarRueda(orden);
    seOfreceOtraVez(v, orden);
  }

  /* NO SE ENTENDIÓ: OTRA OPORTUNIDAD EN EL ACTO (titular, 2026-09-21: «si esto
     sucede, que no entendamos lo que el user dijo por ruido o volumen, debe
     poder intentarlo nuevamente de una vez, no bloquearlo y solo notificar el
     error»). Quien acaba de hablar está delante y lo único que necesita es el
     botón de grabar otra vez; hacerle buscar la casilla roja, abrir su detalle
     y encontrar ahí el botón son tres toques para repetir algo que dura medio
     minuto.
     ⚠️ Y SOLO DESDE EL RECIBO. Si ya se fue a otra pantalla —el historial, otra
     partida— aparecerle de golpe la sala de grabar sería secuestrarle el sitio
     donde está; ahí la casilla marcada y su detalle siguen siendo el camino.
     Los fallos de RED no entran: ésos no se vuelven a grabar, se vuelven a
     mandar, y para eso está el detalle con «Volver a mandar». */
  function seOfreceOtraVez(v, orden) {
    if (!P || P.estado !== 'recibo') return;
    if (!v.regrabable || !puedeRegrabar(orden)) return;
    if (window.ATWI.aviso) {
      window.ATWI.aviso(v.clase === 'audio'
        ? 'No se entendió bien: grábalo otra vez, cerca del micrófono.'
        : 'Ese turno no se guardó: grábalo otra vez.');
    }
    regrabar(orden);
  }

  /** La casilla rechazada: qué pasó, y el botón que lo arregla. */
  function contarFallo(v, orden) {
    var titulo, que, boton = '';
    if (v.clase === 'audio' || v.clase === 'argumento') {
      titulo = v.clase === 'audio' ? 'No se entendió' : 'No se aceptó como intervención';
      que = 'Esta intervención NO está guardada y no cuenta para la partida: hay ' +
            'que grabarla otra vez. ' +
            (v.clase === 'audio'
              ? 'Acércate al micrófono y habla sin ruido de fondo.'
              : 'Di lo que piensas sobre el tema.');
      if (puedeRegrabar(orden)) {
        boton = '<button type="button" class="boton boton--bloque" data-accion="p-regrabar" ' +
                'data-orden="' + orden + '">' + iconoSVG('micro', 20) + 'Grabar de nuevo</button>';
      } else if (P && !P.repaso) {
        que += ' Cuando se mande o se borre lo que se está grabando, vuelve a esta casilla.';
      }
    } else {
      titulo = v.clase === 'voz' ? 'Falta la voz del personaje' : 'No se pudo mandar';
      que = 'Esta intervención NO está guardada todavía y no cuenta para la partida. ' +
            (v.clase === 'voz'
              ? 'Se transcribió, pero no se le pudo poner la voz del personaje. '
              : 'No llegó al servidor. ') +
            'Se intentó ' + (1 + (v.reintentos || 0)) + ' veces; vuelve a mandarla.';
      if (v.remandable && P && !P.repaso) {
        boton = '<button type="button" class="boton boton--bloque" data-accion="p-remandar" ' +
                'data-orden="' + orden + '">Volver a mandar</button>';
      }
    }
    contarQuePasa(v, titulo, que, boton);
  }

  /** El detalle de una casilla que no suena. Va en un modal y no en un aviso
      pequeño porque el motivo puede ser largo y hay que poder leerlo entero y
      copiarlo. `acciones` es el botón que lo arregla, si lo hay. */
  function contarQuePasa(v, titulo, explicacion, acciones) {
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
        (acciones || '') +
        '<button type="button" class="boton boton--bloque' + (acciones ? ' boton--suave boton--punteado' : '') +
          '" data-accion="p-cerrar-detalle">' + (acciones ? 'Ahora no' : 'Entendido') + '</button>' +
      '</div>';
    $('#m-partida').appendChild(m);
  }

  /** Se trae el audio de verdad y devuelve una URL local, o null si no se pudo.
      Sin esto, la casilla promete algo que todavía no está. */
  /* ⚠️ Y SE REINTENTA ANTES DE DARLO POR PERDIDO (titular, 2026-09-21: «sobre
     el error de descarga, más que notificar al user debemos hacer al menos un
     par de retrys de descarga más»). Un `fetch` suelto convertía cualquier
     microcorte —el ascensor, el cambio de celda, el wifi que salta a datos— en
     un turno marcado en rojo que decía «no se pudo bajar el audio guardado»
     sobre un archivo que estaba perfectamente ahí. Y aquí duele el doble: el
     turno SÍ se guardó en el servidor, así que lo único que falló fue traerse
     la voz de vuelta, y la casilla lo contaba como si la intervención se
     hubiera perdido.
     Tres intentos con espera creciente, que es lo que cubre un corte corto sin
     dejar a nadie mirando una casilla que gira medio minuto. */
  function conReintentos(pedir, veces, espera) {
    return pedir().then(function (r) {
      if (r || veces <= 1) return r;
      return new Promise(function (listo) { setTimeout(listo, espera); })
        .then(function () { return conReintentos(pedir, veces - 1, espera * 2); });
    });
  }

  function bajarLaVoz(url) {
    return conReintentos(function () {
      return fetch(url)
        .then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (b) { return b && b.size ? URL.createObjectURL(b) : null; })
        .catch(function () { return null; });
    }, 3, 700);
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

    /* LA FRASE SUENA AQUÍ, que es donde está el hueco. Se lanza y no se espera:
       la sala se repinta igual y el juez habla encima. Esperar a que terminara
       de hablar para pasar el turno sería añadir dos segundos a mano a un hueco
       que ya existe, en vez de taparlo. */
    var f = P.cerrando ? fraseDeCierre() : fraseEntreTurnos();

    if (P.cerrando) {
      /* EL JUEZ EMPIEZA A LEER EN CUANTO EL ÚLTIMO TURNO ESTÁ GUARDADO, no
         aquí (titular, 2026-09-19: «carga al juez diciendo que va a deliberar
         pero inmediatamente dice que no llegó respuesta»).
         ⚠️ POR QUÉ ESTABA MAL: `acusarRecibo` corre ANTES que `subirTurno` --se
         llaman en ese orden, y subir tarda lo que tardan Deepgram, el abogado y
         Azure-- así que pedir el juicio aquí era pedirlo con el último turno
         todavía sin fila. El servidor contestaba lo correcto, «la partida no
         terminó: 3 de 4 intervenciones» (visto en `sucesos` el 2026-09-19 a las
         17:07), el cliente lo leía como un fallo de la llamada y pintaba «No
         llegó la respuesta» **un segundo después de mandar el turno**, con el
         botón de volver a pedirlo. Un fallo real y un «todavía no» no son lo
         mismo, y aquí se veían igual.
         Ahora esto solo PINTA la espera --el juez pensando y el botón apagado--
         y quien arranca el juicio es el camino de subida, en su `.then`, que es
         el primer instante en que la ronda está completa de verdad. */
      pintarSala({ dice: '', pie: botonDeResultado() });
      juezDice(f.texto, f.archivo);
      return;
    }

    /* Y se pasa DIRECTO al turno de quien sigue. Había un paso intermedio que
       anunciaba a quién le tocaba y pedía un toque para continuar; decía lo
       mismo que el botón de la pantalla siguiente —«Turno de Diana»— y cobraba
       un toque por decirlo. Con dos teléfonos hará falta algo ahí, porque habrá
       que esperar a que el otro mande lo suyo; en un solo teléfono no hay nada
       que esperar. */
    /* EN LÍNEA ESO ES EXACTAMENTE LO QUE HAY: el otro está en su teléfono, así
       que se pasa a esperar en vez de al turno siguiente.
       ⚠️ PERO EL JUEZ SÍ HABLA, Y AQUÍ NO HABLABA (titular, 2026-09-19: «el juez
       no está dando la confirmación de te escuché, con su audio, cada vez que el
       participante manda su turno»). El `return` cortaba antes de `juezDice`,
       con este motivo escrito al lado: «el juez no le habla a quien no está
       delante». Eso vale para ANUNCIAR el turno del otro —ése no está mirando—
       y es falso para el acuse de recibo: **quien acaba de mandar su turno sí
       está delante**, es la única persona que hay en esta pantalla, y lo que
       espera es que le confirmen que se le escuchó. Las cinco frases dicen justo
       eso y encajan igual («Te escuché. Veamos qué dice la otra parte»).
       El orden es el mismo que en local —pintar y después hablar—: `juezDice`
       necesita la burbuja en el DOM, y la pinta `pintarSala`, que es por donde
       pasan las dos pantallas. */
    /* ⚠️ Y EN LÍNEA NO SE PASA A ESPERAR HASTA QUE EL TURNO ESTÉ GUARDADO
       (titular, 2026-09-21: «cuando me paró el turno que no se guardó quedé
       bloqueado, el jugador quedó esperando un turno que nunca llegará porque
       no completé el mío; tuve que salir y volver a entrar»).
       ES EL MISMO FALLO QUE EL DEL VEREDICTO, POR EL OTRO LADO: `acusarRecibo`
       corre ANTES que `subirTurno`, así que pintar aquí «Le toca a X» es
       anunciar un turno que todavía puede ser rechazado —y si lo es, la
       pantalla ya dijo lo contrario—. Peor: `pintarEspera` deja
       `P.estado = 'espera'` y `puedeRegrabar()` solo admite `turno` o
       `recibo`, así que el botón «Grabar de nuevo» **desaparecía** y el
       detalle de la casilla decía que volviera cuando terminara de grabar algo
       que no estaba grabando. Un callejón sin salida salvo recargar.
       Ahora se queda en el recibo —el juez confirmando que escuchó— mientras
       sube, y quien decide a dónde va es el `.then` de la subida, que es el
       único que sabe si el turno existe. Lo mismo que se hizo con el juicio. */
    if (P.enLinea) {
      P.estado = 'recibo';
      pintarSala({ dice: '', pie: esperandoHTML('Guardando tu turno') });
      juezDice(f.texto, f.archivo);
      return;
    }
    P.i++;
    pintarTurno();
    juezDice(f.texto, f.archivo);
  }

  /** Ya está guardado en el servidor: recién ahora se puede decir que le toca
      al otro. Vale solo para la pantalla del recibo en línea; si quien jugó ya
      se fue a otra parte, manda esa otra parte. */
  function pasarAEsperar(orden) {
    if (!P || !P.enLinea || P.cerrando) return;
    if (P.estado !== 'recibo' || P.regrabando != null) return;
    if (orden !== P.i) return;
    P.i++;
    pintarEspera();
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
    if (P.cerrando) {
      /* EN NEGOCIACIÓN NO SE REVELA NADA TODAVÍA: primero votan. El resultado
         lo deciden ellos eligiendo entre las tres propuestas, así que la
         revelación va después de la votación y no en su lugar. */
      if (P.modo === 'negociacion') {
        if (P.propuestasListas) return arrancarVotacion();
        return deliberar();
      }
      /* Si el juez ya contestó, directo al veredicto y el toque desbloquea el
         audio. Si todavía está leyendo, la pantalla de deliberar, que espera
         por él y ofrece el botón cuando llega. */
      if (P.veredictoListo) return revelar();
      return deliberar();
    }
    pintarTurno();
  }

  /* ==========================================================================
     6. EL RESULTADO
     ========================================================================== */
  /* Le pide el veredicto al servidor y lo deja en P. Se llama AL MANDAR LA
     ÚLTIMA INTERVENCIÓN --no al entrar al último turno: eso juzgaría una ronda
     a la que le falta una intervención-- así que el minuto largo del juez se
     solapa con la frase de cierre y con lo que quede por oír.

     SI NO CONTESTA, DEJA `veredicto` EN NULO Y YA. Antes eso llevaba a un
     resultado sorteado; ahora la partida se queda en `deliberar()` y se ofrece
     volver a pedirlo. `veredictoMotivo` se guarda para poder decir POR QUÉ
     falló: no es lo mismo «no hay servidor» que «el juez no devolvió nada». */
  function pedirVeredicto(reintento) {
    P.veredicto = null;
    P.veredictoListo = false;
    P.veredictoMotivo = '';
    var n = window.ATWI.nube;
    var listo = function (res, motivo) {
      P.veredicto = res || null;
      P.veredictoMotivo = motivo || '';
      P.veredictoListo = true;
      return P.veredicto;
    };
    if (P.modo !== 'debate') return Promise.resolve(listo(null, 'en Negociación no hay árbitro'));
    if (!n || !n.hay() || !P.debate) return Promise.resolve(listo(null, 'partida sin servidor'));
    return n.arbitrar(P.debate, null, { reintentar: !!reintento }).then(function (d) {
      if (d && d.resultado) return listo(d.resultado, '');
      return listo(null, n.ultimoFallo() || 'el juez no devolvió nada');
    }, function (e) {
      return listo(null, String(e && e.message || e));
    });
  }

  /* Le pide las propuestas al mediador. MISMA FORMA que `pedirVeredicto`, y la
     misma regla: si no contesta no se revela nada y se ofrece reintentar.

     AQUÍ SE DISTINGUÍA «NO HAY MEDIADOR» DE «FALLÓ LA LLAMADA» Y YA NO (decisión
     del titular, 2026-09-15). Eran dos estados porque el primero terminaba la
     partida en «Ronda guardada» y el segundo se reintentaba; quitada esa
     pantalla, las dos son lo mismo visto desde la pareja --nadie miró la
     ronda-- y las dos terminan igual: en deliberando, con el botón de volver a
     pedirlo. Que el reintento de hoy no pueda funcionar mientras la función no
     exista es cierto y no cambia nada: la alternativa era enseñar un final que
     no lo es. */
  function pedirPropuestas() {
    P.propuestas = null;
    P.propuestasListas = false;
    P.paradaNegociacion = null;
    P.loQueDijoNegociacion = null;
    P.cierreNegociacion = null;
    var n = window.ATWI.nube;
    if (!n || !n.mediar || !n.hay() || !P.debate) return Promise.resolve(null);
    return n.mediar(P.debate).then(function (d) {
      if (!d) return null;
      P.propuestasListas = true;
      P.paradaNegociacion = d.parada || null;
      /* LA FILA DE `propuestas` NO TIENE LA FORMA DE LA PANTALLA, y se traduce
         aquí y en un solo sitio. En la base son `recoge_a` y `recoge_b` --los
         dos textos anclados, uno por persona-- y la tarjeta los pinta como
         `recogeUno` y `recogeDos`. Es el mismo trabajo que hace `delArbitro()`
         con la fila del veredicto: la base guarda por lado y la pantalla pinta
         por persona. */
      P.propuestas = (d.propuestas || []).map(function (p, k) {
        /* `orden` (1..2) es lo que el voto en linea manda al servidor. */
        return { texto: p.texto, recogeUno: p.recoge_a, recogeDos: p.recoge_b, orden: p.orden || (k + 1) };
      });
      if (!P.propuestas.length) P.propuestas = null;
      /* LOS DOS PÁRRAFOS DE LA PARADA BLANDA. Vienen de su propia llamada y son
         lo único compartible cuando no hubo partido; sin esto la pantalla del
         juez saldría con el titular y sin el reporte que `docs/02` §594 llama
         obligatorio. */
      /* P1 ES QUIEN PROPONE Y P2 EL INVITADO, POR LADO Y NO POR ORDEN DE HABLA
         (S5, 2026-09-17). El mediador etiqueta con `ladoDe()`: P1 = propone
         siempre, abra quien abra. Aquí se leía `P.orden[0]` --quien habló
         primero--, así que en una ronda abierta por el invitado (N2, N6) el
         párrafo de cada uno habría salido con el nombre del otro. Es el mismo
         fallo que `mesaDelDebate()` tuvo con el veredicto, por el otro lado. */
      if (d.lo_que_dijo) {
        /* `jugadores[0]` ES quien propone, no «yo»: en línea puedo ser el
           invitado (0055) y ahí `indiceDeLaCuenta()` da 1. */
        P.loQueDijoNegociacion = [
          { nombre: P.jugadores[0].nombre, texto: d.lo_que_dijo.p1 || '' },
          { nombre: P.jugadores[1].nombre, texto: d.lo_que_dijo.p2 || '' }
        ].filter(function (q) { return q.texto; });
        /* El cierre viaja dentro de `lo_que_dijo` (mediador v2.1, S12). */
        P.cierreNegociacion = d.lo_que_dijo.cierre || null;
      }
      return null;
    }, function () { return null; });
  }

  /* LAS DOS POSTURAS DE DELIBERAR. `pensando` es la barbilla y `escucha-2` es
     tomando notas: las dos únicas que se leen como «está trabajando en esto».
     NO se usan `escucha-1` ni `escucha-3` aunque también tengan la boca cerrada:
     la 1 y la 3 son casi la misma que `pensando` --cambia poco más que el
     ángulo, y ya está escrito en `CLAUDE.md`-- así que alternarlas se vería como
     un parpadeo en vez de como un cambio de postura. */
  var POSTURAS_DELIBERAR = ['pensando', 'escucha-2'];
  /* CUATRO SEGUNDOS, que es el triple que el ciclo de escuchar de la sala. Allí
     el juez acompaña a quien graba y el movimiento tiene que notarse; aquí no
     pasa nada más en pantalla, y a tres segundos el cambio se convierte en el
     protagonista. A cuatro, con el fundido largo, respira. */
  var MS_POSTURA = 4000;
  var relojPostura = null;

  function pararPosturas() {
    clearInterval(relojPostura);
    relojPostura = null;
  }

  /* EL JUEZ DE DELIBERAR: grande, de la cintura para arriba y saliendo desde
     abajo (decisión del titular, 2026-09-15, para los dos modos).

     ANTES ERA UN DISCO DE 84 px con «Deliberando…» debajo, el párrafo de qué
     está haciendo y un renglón con el recuento de intervenciones y segundos. En
     una pantalla donde no pasa nada más y que puede durar un minuto largo, eso
     es un cartel de carga con adornos: se lee una vez y después solo queda
     esperar mirando un icono pequeño.

     Con la figura grande la espera tiene a alguien dentro. Las dos posturas se
     turnan cada cuatro segundos con un fundido, así que la pantalla está viva
     sin pedir nada: se ve que hay alguien trabajando, que es exactamente lo que
     está pasando. Y el recuento se va: quien acaba de grabar sus turnos sabe
     cuántos fueron. */
  function juezDeliberando() {
    var quien = (P.juez && window.ATWI.esJuez(P.juez)) ? P.juez : 'bruno';
    return '<div class="delibera" id="delibera">' +
      POSTURAS_DELIBERAR.map(function (pose, i) {
        return '<img class="delibera__fig' + (i ? '' : ' delibera__fig--puesta') + '" ' +
          'src="' + window.ATWI.piezaJuez(quien, pose) + '" alt="" ' +
          'decoding="async">';
      }).join('') +
    '</div>';
  }

  /* LA ROTACIÓN NO ARRANCA HASTA QUE LAS DOS POSTURAS ESTÁN DECODIFICADAS.
     Es el fallo que pidió arreglar el titular, en el sitio donde peor se ve: si
     el fundido empieza con la segunda pieza todavía bajando, la figura se
     desvanece hacia un hueco y vuelve. Esperar aquí no cuesta nada —a esta
     pantalla se llega minutos después de que `precargarElFinal()` las pidiera—
     y `listas()` lleva su propio tope de tres segundos, así que una red mala
     retrasa la rotación pero no la cuelga. */
  function rotarPosturas() {
    pararPosturas();
    (P.piezasDelJuez || Promise.resolve()).then(function () {
      if (P.estado === 'deliberando') girarPosturas();
    });
  }

  function girarPosturas() {
    pararPosturas();
    relojPostura = setInterval(function () {
      var figs = $$('#delibera .delibera__fig');
      if (!figs.length) return pararPosturas();
      var puesta = 0;
      figs.forEach(function (f, i) { if (f.classList.contains('delibera__fig--puesta')) puesta = i; });
      figs[puesta].classList.remove('delibera__fig--puesta');
      figs[(puesta + 1) % figs.length].classList.add('delibera__fig--puesta');
    }, MS_POSTURA);
  }

  /* La pantalla del juez leyendo. Solo se ve si la persona toca antes de que
     el veredicto llegue; el botón aparece cuando llega, para que el toque que
     revela sea también el que desbloquea el audio del redoble. */
  function deliberar(fallado) {
    P.estado = 'deliberando';
    /* La ronda está entera: ya no queda nada que grabar, y entre esto, la
       revelación y el veredicto pasan minutos. */
    window.ATWI.grabadora.soltar('la ronda ya está entera');
    avisarSiSeVan();
    pararJuez();
    cerrarReproductor();
    /* SIN TEXTO MIENTRAS SE ESPERA, y con texto cuando algo falló: son dos
       pantallas distintas con la misma figura. En la espera no hay nada que
       decir que la figura no diga; en el fallo hay que explicar qué pasó y
       ofrecer volver a pedirlo, que es la mitad del sentido de esa pantalla. */
    caja().innerHTML =
      '<div class="sala sala--centrada sala--delibera' +
          (fallado ? ' sala--delibera-dice' : '') + '">' +
        (fallado
          ? '<div class="delibera__dice">' +
              '<p class="delibera__titular">' + esc(cfg.veredicto.falloTitulo) + '</p>' +
              '<p class="sala__nota">' + esc(cfg.veredicto.fallo) + '</p>' +
            '</div>'
          : '') +
        juezDeliberando() +
      '</div>';
    pie().innerHTML = fallado
      ? '<button class="boton boton--suave boton--bloque boton--grande boton--punteado" ' +
          'data-accion="p-reintentar">' + esc(cfg.veredicto.reintentar) + '</button>'
      : '';
    rotarPosturas();
    if (fallado) return;

    /* ⚠️ SIN JUICIO PEDIDO NO HAY NADA QUE CONCLUIR (2026-09-19). Esto era
       `P.juicio || Promise.resolve(null)`, o sea que si nadie había pedido el
       veredicto todavía --porque el último turno se está subiendo-- la promesa
       resolvía en el acto, `noContesto()` decía que sí y la pantalla anunciaba
       «No llegó la respuesta» sin que nadie hubiera preguntado nada. Se queda
       el juez pensando; quien pida el juicio repinta (`arrancarElJuicio`). */
    var cuando = P.juicio;
    if (!cuando) {
      /* Y SI LA RONDA YA ESTÁ SUBIDA ENTERA, SE PIDE DESDE AQUÍ. Sin esto había
         un callejón: llegar a esta pantalla con el juicio sin pedir --porque el
         estado cambió justo cuando el turno terminaba de subir-- dejaba al juez
         pensando para siempre y sin botón. Si todavía hay algo subiendo, no se
         hace nada: lo arranca el `.then` de esa subida. */
      if (rondaSubidaEntera()) arrancarElJuicio();
      return;
    }
    cuando.then(function () {
      if (P.estado !== 'deliberando') return;
      /* SI NO HUBO RESPUESTA, NO SE REVELA NADA: se queda aquí y se ofrece
         volver a pedirlo (decisión del titular, 2026-09-15). La ronda ya está
         grabada y guardada entera; lo que falló es UNA llamada, así que lo que
         hay que reintentar es la llamada y no la partida. */
      if (noContesto()) {
        bitacora('veredicto_no_llego', { detalle: P.veredictoMotivo || '' });
        return deliberar(true);
      }
      pie().innerHTML = principal('p-revelar', 'Ver el resultado');
    });
  }

  /* LO QUE PASA CUANDO SE VAN DE AQUÍ, que es la pregunta del titular
     (2026-09-15): «¿qué pasa si el user abandona la aplicación?». La ronda no
     se pierde --los seis turnos ya están guardados-- pero el veredicto sí,
     porque quien lo estaba pidiendo era esta pestaña. Mientras eso no se
     encole en el servidor, lo mínimo es que quede anotado: una partida que se
     quedó esperando no aparece en ninguna otra tabla, y sin esto nadie se
     entera nunca de cuántas hay.
     Va en `pagehide` y no en `beforeunload`: el segundo no dispara en iOS
     cuando se cambia de app, que es la manera normal de irse en un teléfono. */
  function avisarSiSeVan() {
    if (dejandoLaEspera) return;
    dejandoLaEspera = function () {
      if (P && P.estado === 'deliberando' && !P.ensayo) {
        bitacora('ronda_abandonada_esperando', { alIrse: true, nivel: 'aviso' });
      }
    };
    window.addEventListener('pagehide', dejandoLaEspera);
  }

  function dejarDeAvisar() {
    if (!dejandoLaEspera) return;
    window.removeEventListener('pagehide', dejandoLaEspera);
    dejandoLaEspera = null;
  }

  /* Un solo sitio por donde pasa todo lo que se anota desde la sala, para que
     el `debate` y el `ensayo` no haya que acordarse de ponerlos. UN ENSAYO NO
     ANOTA: el probador dispara fallos a propósito y llenaría la bitácora de
     averías que nunca ocurrieron. */
  function bitacora(suceso, op) {
    if (!P || P.ensayo) return;
    var n = window.ATWI.nube;
    if (!n || !n.anotar) return;
    op = op || {};
    op.debate = P.debate || null;
    op.datos = { modo: P.modo, turnos: P.intervenciones ? P.intervenciones.length : 0 };
    n.anotar(suceso, op);
  }

  /* SI NO LLEGÓ RESPUESTA, NO HAY NADA QUE REVELAR. En Controversia es no tener
     veredicto; en Negociación, no tener ni propuestas ni parada.

     NO CONTESTAR NO ES UN RESULTADO (decisión del titular, 2026-09-15). Sin
     veredicto sí lo es --el juez leyó la ronda entera y decidió no puntuarla, y
     eso se sostiene y se explica--; que una llamada no llegue no le dice nada a
     nadie. Por eso ninguna de las dos ramas produce pantalla de final: las dos
     se quedan aquí, con la ronda entera guardada y el botón de volver a pedirlo. */
  function noContesto() {
    if (P.modo === 'negociacion') return !P.propuestasListas;
    return !P.veredicto;
  }

  function reintentar() {
    bitacora('veredicto_reintento', { nivel: 'aviso' });
    if (P.modo === 'negociacion') {
      P.juicio = pedirPropuestas();
    } else {
      P.juicio = pedirVeredicto(true);
    }
    deliberar();
  }

  /* ==========================================================================
     LA NEGOCIACIÓN: ELEGIR, AJUSTAR Y FIRMAR
     El mediador propone DOS maneras de quedar y la pareja elige una. Si eligen,
     ajustan el texto si quieren y lo firman; recién ahí se revela el resultado.

     EL ORDEN IMPORTA Y ESTUVO MAL UN RATO (corrección del titular, 2026-09-15):
     primero se cierra la negociación y DESPUÉS se celebra. La revelación llega
     cuando el acuerdo queda en firme o cuando queda claro que no lo hay, no
     entre medio. Celebrar antes de firmar deja la fiesta apoyada en algo que
     todavía se puede caer, y encima pone un formulario después del clímax.

     DOS PROPUESTAS Y NO TRES (decisión del titular, 2026-09-15). Pedir tres
     obliga al modelo a inventar una tercera distinta de las otras dos cuando el
     material da para dos; la tercera sale peor y encima ensucia la elección.

     EL VOTO ES UNO SOLO, Y AQUÍ ESO ES LO CORRECTO. Se construyó primero con
     voto ciego y pasarse el teléfono, copiando la regla de los turnos, y el
     titular lo corrigió: en partida local LOS DOS ESTÁN DELANTE y eligen juntos,
     así que no hay nada que ocultar. Si no se ponen de acuerdo, para eso está
     «Ninguna». La confidencialidad hace falta cuando cada quien está en su
     teléfono, y eso es la partida remota, que no existe todavía; cuando exista,
     cada voto va por su cuenta con la RLS de `votos` --«veo mi voto y, si ya
     voté, el del otro»-- y si eligen distinto se le enseña a cada uno lo que
     eligió el otro y se le ofrece cambiarse o quedarse. Esa segunda vuelta es de
     la remota y se construye con ella: escrita hoy sería una pantalla que nadie
     puede alcanzar.

     Y CADA PROPUESTA ENSEÑA QUÉ RECOGE DE CADA UNO. No es adorno: `docs/02` §13
     llama «el peor error posible de este sistema» a emitir un acuerdo que no
     está anclado en los dos. Enseñar las dos anclas pone esa comprobación en
     manos de la pareja: si una de las líneas no les suena a algo que dijeron,
     esa propuesta no es de ellos y lo van a ver.
     ========================================================================== */
  /* CADA ANCLA DICE DE QUIÉN ES, con su cara y con su color (petición del
     titular, 2026-09-15). Salían como dos frases anónimas una debajo de otra, y
     eso les quita justo lo que hace que sirvan: la pantalla las enseña para que
     cada quien reconozca SU frase --«esto lo dije yo»-- y así puedan ver si la
     propuesta está anclada de verdad en los dos. Sin saber cuál es de quién, la
     comprobación no se puede hacer.

     `recogeUno` es P1 y `recogeDos` es P2, y P1 es quien abrió la ronda: eso lo
     fija el mediador al etiquetar los turnos, y aquí `orden[0]` es el mismo.

     Y SE FUE LA BARRA DECORATIVA de la izquierda: con la cara y el nombre
     delante ya se sabe dónde empieza cada una, y la barra decía lo mismo una
     tercera vez. */
  function anclaDe(texto, lado) {
    if (!texto) return '';
    var q = P.jugadores[P.orden[lado]];
    return '<span class="ancla">' +
        window.ATWI.fichaHTML(q.avatar, 'ancla__cara', q.color) +
        '<span class="ancla__dice">' +
          '<b class="ancla__quien" style="--pj:' +
            window.ATWI.colorPersonaje(q.color) + '">' + esc(q.nombre) + '</b> ' +
          esc(texto) +
        '</span>' +
      '</span>';
  }

  function tarjetaPropuesta(p, n, marcada) {
    return '<button class="propuesta' + (marcada ? ' propuesta--marcada' : '') + '" ' +
        'data-propuesta="' + n + '">' +
      '<span class="propuesta__texto">' + esc(p.texto) + '</span>' +
      (p.recogeUno || p.recogeDos
        ? '<span class="propuesta__anclas">' +
            anclaDe(p.recogeUno, 0) +
            anclaDe(p.recogeDos, 1) +
          '</span>'
        : '') +
    '</button>';
  }

  /* LO QUE EL MEDIADOR PUEDE DEVOLVER, Y NO ES LO MISMO. Los dos finales se
     parecen --en los dos acaba sin acuerdo-- pero dicen cosas distintas:

       · PARÓ POR SEGURIDAD  ->  «Sin veredicto». Miró y eligió no trabajar.
       · MIRÓ Y NO ENCONTRÓ NADA  ->  la pantalla de elegir, con una sola
         opción: «Sin acuerdo por ahora».

     Y NO CONTESTAR NO ES NINGUNO DE LOS DOS: no se llega hasta aquí. Eso lo
     ataja `noContesto()`, que deja la partida en deliberando con el botón de
     volver a pedirlo. Decirle a la pareja que no se pusieron de acuerdo cuando
     lo que pasó fue que se cayó una llamada es la mentira que esto evita. */
  function arrancarVotacion() {
    if (!P.propuestasListas) return deliberar(true);
    if (P.paradaNegociacion) return revelar();
    /* Cerrada --firmada o «Ninguna»-- no se vuelve a votar: se enseña lo que
       quedó (repaso de una Negociación terminada). */
    if (P.cerrada) return revelar();
    /* EN LINEA EL VOTO VIVE EN EL SERVIDOR (0059): si ya vote, no se vuelve a
       preguntar; se enseña en que va. */
    if (P.enLinea) return refrescarVoto();
    P.voto = null;
    return votar();
  }

  /* ==========================================================================
     EL VOTO EN LINEA (titular, 2026-09-18: «me dejo votar y decidir el acuerdo
     a mi solo desde esa cuenta; esa es una pantalla de espera que es el estado
     de la partida hasta que los dos voten»). Cada quien vota desde su telefono
     sin ver el del otro; el acta la escribe el servidor cuando coinciden. Si
     eligen distinto, cada uno ve lo del otro y decide UNA vez: aceptar la suya
     o quedarse con la propia; si siguen distintos, sin acuerdo. Sin editar el
     texto antes de firmar: habria que ponerse de acuerdo tambien sobre eso.
     ========================================================================== */
  function refrescarVoto() {
    var n = window.ATWI.nube;
    if (!n || !n.estadoVotacion || !P.debate) return votar();
    n.estadoVotacion(P.debate).then(function (e) {
      if (!P || !P.enLinea) return;
      pintarVoto(e);
    });
  }

  function pintarVoto(e) {
    if (!e) { P.voto = null; return votar(); }
    if (e.fase === 'cerrada' && e.acta) {
      P.cerrada = true;
      P.acuerdo = e.acta.tipo === 'acuerdo' ? { texto: e.acta.texto } : null;
      if (window.ATWI.olvidarActas) window.ATWI.olvidarActas();
      if (window.ATWI.nube.marcarVisto) window.ATWI.nube.marcarVisto(P.debate);
      return revelar();
    }
    if (e.fase === 'sin_votar') { P.voto = null; return votar(); }
    if (e.fase === 'distintos') return pintarDistintos(e);
    return pintarEsperaVoto(e);
  }

  function nombreDelOtro() { return P.jugadores[1 - indiceDeLaCuenta()].nombre; }
  function textoDeEleccion(k) {
    if (k === -1 || k == null) return (cfg.negociacion || {}).ninguna || 'Ninguna';
    var p = (P.propuestas || []).filter(function (q) { return q.orden === k; })[0] || (P.propuestas || [])[k - 1];
    return p ? p.texto : 'una propuesta';
  }

  /* Ya vote: la partida queda esperando al otro. Se sale sin perder nada y el
     sondeo trae la novedad. */
  function pintarEsperaVoto(e) {
    P.estado = 'esperando-voto';
    var otro = nombreDelOtro();
    caja().innerHTML =
      '<div class="votacion">' +
        '<p class="votacion__quien">Tu elecci\u00f3n est\u00e1 guardada</p>' +
        '<div class="acta__texto">' + esc(textoDeEleccion(e.mio)) + '</div>' +
        '<p class="acta__pregunta">Falta que ' + esc(otro) + ' elija. Te avisamos cuando lo haga: ' +
          'si coinciden, queda firmado; si no, cada uno ver\u00e1 lo del otro y podr\u00e1 cambiarse.</p>' +
      '</div>';
    /* La misma decisión que en la espera del turno: aquí no hay nada que
       pulsar, así que lo que va es el estado. */
    pie().innerHTML = esperandoHTML();
  }

  /* Eligieron distinto: lo del otro a la vista y una decision. */
  function pintarDistintos(e) {
    P.estado = 'distintos';
    var otro = nombreDelOtro();
    caja().innerHTML =
      '<div class="votacion">' +
        '<p class="votacion__quien">Eligieron distinto</p>' +
        '<p class="sala__nota">T\u00fa elegiste:</p>' +
        '<div class="acta__texto">' + esc(textoDeEleccion(e.mio)) + '</div>' +
        '<p class="sala__nota" style="margin-top:var(--e-3)">' + esc(otro) + ' eligi\u00f3:</p>' +
        '<div class="acta__texto">' + esc(textoDeEleccion(e.suyo)) + '</div>' +
        '<p class="acta__pregunta">Puedes aceptar la de ' + esc(otro) + ' o quedarte con la tuya. ' +
          'Si los dos se quedan, la negociaci\u00f3n termina sin acuerdo.</p>' +
      '</div>';
    pie().innerHTML =
      '<button class="boton boton--suave boton--bloque boton--grande boton--punteado" ' +
        'data-accion="p-voto-quedarme" data-eleccion="' + e.mio + '">Quedarme con la m\u00eda</button>' +
      '<button class="boton boton--bloque boton--grande boton--' + P.modo + '" ' +
        'data-accion="p-voto-aceptar" data-eleccion="' + e.suyo + '">Aceptar la de ' + esc(otro) + '</button>';
  }

  function votarEnLinea(eleccion) {
    var n = window.ATWI.nube;
    if (!n || !n.votar) return;
    $$('#m-partida .modal__pie .boton').forEach(function (b) { b.disabled = true; });
    n.votar(P.debate, eleccion).then(function (e) {
      if (!P) return;
      bitacora('voto_en_linea', { nivel: 'nota', detalle: String(eleccion) });
      pintarVoto(e);
    }).catch(function (err) {
      $$('#m-partida .modal__pie .boton').forEach(function (b) { b.disabled = false; });
      var m = String(err && err.message || '');
      fallo('No se pudo guardar tu elecci\u00f3n: ' + (m || 'int\u00e9ntalo otra vez'));
      /* «tu voto ya esta puesto»: alguien se adelanto; se relee el estado. */
      if (/ya est/.test(m)) refrescarVoto();
    });
  }

  function hayQueElegir() {
    return Boolean(P.propuestas && P.propuestas.length);
  }

  /* SIN PROPUESTAS NO HAY NADA QUE ELEGIR, Y ESO NO ES UNA AVERÍA. El mediador
     tiene permiso explícito para declarar que no hay terreno común (`docs/02`
     §13, paso 5g) y también puede pararse por seguridad; y a veces las seis
     intervenciones sencillamente no dan material para proponer nada que se
     sostenga. En esos casos la pantalla enseña UNA sola opción --«Sin acuerdo
     por ahora»-- y sugiere repetir el ejercicio (decisión del titular,
     2026-09-15). Sigue siendo un toque suyo y no un cartel: lo que no hay es
     acuerdo, no partida. */
  function votar() {
    P.estado = 'votando';
    pararJuez();
    cerrarReproductor();
    var n = cfg.negociacion;

    if (!hayQueElegir()) {
      P.voto = -1;
      caja().innerHTML =
        '<div class="votacion">' +
          '<p class="votacion__quien">' + esc(n.sinPropuestasTitulo) + '</p>' +
          '<p class="sala__nota">' + esc(n.sinPropuestas) + '</p>' +
          '<div class="propuestas">' +
            '<button class="propuesta propuesta--ninguna propuesta--marcada" ' +
              'data-propuesta="-1">' + esc(n.sinPropuestasOpcion) + '</button>' +
          '</div>' +
        '</div>';
      pie().innerHTML = principal('p-voto-listo', 'Entendido');
      return;
    }

    /* UNA SOLA PROPUESTA NO SE «ELIGE ENTRE LAS DOS» (titular, 2026-09-21). El
       mediador puede devolver una —dos candidatas con las mismas anclas son una
       (H16)— y entonces el título «Elijan una, entre los dos» y el botón
       «Ninguna nos convence» hablaban de algo que no está: no hay dos ni varias.
       Con una, la elección es aceptar ésta o ninguna. */
    var una = P.propuestas.length === 1;
    caja().innerHTML =
      '<div class="votacion">' +
        '<p class="votacion__quien">' + esc(una ? n.tituloUna : n.titulo) + '</p>' +
        /* SIN `--tenue`: esa clase baja al 60 % y es para lo accesorio. Esto no
           lo es --es la condición de la elección, y saberla cambia cómo se
           elige-- así que va a pleno. */
        '<p class="sala__nota">' + esc(una ? n.avisoUna : n.aviso) + '</p>' +
        '<div class="propuestas">' +
          P.propuestas.map(function (p, k) {
            return tarjetaPropuesta(p, k, P.voto === k);
          }).join('') +
          '<button class="propuesta propuesta--ninguna' +
            (P.voto === -1 ? ' propuesta--marcada' : '') + '" data-propuesta="-1">' +
            esc(una ? n.ningunaUna : n.ninguna) + '</button>' +
        '</div>' +
      '</div>';
    pie().innerHTML = principal('p-voto-listo', 'Listo', '', P.voto === null);
  }

  /* Elegida una, se pasa a firmarla. «Ninguna» se va derecho a la revelación:
     no hay texto que ajustar. */
  function cerrarVotacion() {
    if (P.voto === null) return;
    /* En linea el voto va al servidor (0059): «ninguna» es -1 y una propuesta
       su orden (1..2); el acta la escribe el cuando los dos coincidan. */
    if (P.enLinea) return votarEnLinea(P.voto < 0 ? -1 : (P.propuestas[P.voto].orden || P.voto + 1));
    if (P.voto < 0) {
      P.acuerdo = null;
      /* SIN ACUERDO TAMBIÉN SE GUARDA, y es la mitad del sentido de la tabla.
         `docs/02` §13 le da permiso expreso al mediador para declarar que no
         hay terreno común, y marcar «Ninguna» es la pareja diciendo lo mismo:
         las dos son maneras legítimas de cerrar una Negociación, no averías.
         Si solo se guardaran los acuerdos, el historial contaría una historia
         en la que siempre se acuerda, que no es la de nadie. */
      guardarElActa('desacuerdo', (cfg.negociacion || {}).actaSinAcuerdo || '');
      return revelar();
    }
    P.acuerdo = P.propuestas[P.voto];
    P.actaTexto = P.acuerdo.texto;
    /* EL TEXTO TAL COMO LO PROPUSO EL MEDIADOR, guardado aparte. Sirve para una
       sola cosa y hace falta: saber si el acta que se firma es la suya o la que
       la pareja reescribió. No se puede comparar contra `P.acuerdo` al firmar,
       porque para entonces `P.acuerdo` ya es el texto final. */
    P.actaOriginal = P.acuerdo.texto;
    P.actaEditando = false;
    return firmar();
  }

  /* MANDA EL ACTA Y NO ESPERA. Igual que la bitácora: lo que no puede pasar es
     que la celebración se quede colgada porque el servidor tarda, y lo que se
     va a enseñar ya está en `P.acuerdo`. Si falla, queda anotado --con su
     motivo-- y el texto sigue en pantalla.

     UN ENSAYO NO ESCRIBE NADA. El probador recorre este camino entero para
     mirar las pantallas, y sin esto cada vuelta dejaría un acta inventada en el
     historial de alguien. */
  function guardarElActa(tipo, texto) {
    if (!P || P.ensayo || !P.debate) return;
    var n = window.ATWI.nube;
    if (!n || !n.guardarActa) return;
    n.guardarActa({
      debate: P.debate,
      texto: texto,
      tipo: tipo,
      version: 1,
      /* Editada = el texto final no es el que propuso el mediador. */
      editada: Boolean(P.actaOriginal && P.actaOriginal !== texto)
    }).then(function (fila) {
      if (fila) {
        /* LA LISTA EN MEMORIA YA NO ES LA DE AHORA. Sin esto se firmaba un
           acuerdo, se iba al chip «Acuerdos» y no estaba: la lista se guarda
           entre visitas a propósito --para no pedirla cada vez-- así que hay
           que tirarla justo cuando deja de ser cierta. `app.js` ya tenía el
           enganche escrito y no lo llamaba nadie. */
        if (window.ATWI.olvidarActas) window.ATWI.olvidarActas();
        return bitacora('acta_guardada', { nivel: 'nota', detalle: tipo });
      }
      bitacora('acta_no_se_guardo', { detalle: n.ultimoFallo ? n.ultimoFallo() : '' });
    });
  }

  /* ==========================================================================
     EL ACTA: se ajusta y se firma ANTES de celebrar
     El texto que propuso el mediador es editable antes de guardarse. Si no lo
     tocan, se pregunta si lo aceptan tal cual; si quieren cambiarlo, el campo se
     abre y se edita aquí mismo, como se retoca el enunciado de un tema antes de
     lanzar la ronda.

     LA PREGUNTA SE HACE AUNQUE NO HAYAN TOCADO NADA, y es a propósito: firmar
     sin que nadie diga «sí, así» convierte el acta en algo que pasó mientras
     miraban. `docs/02` §13 cuenta la aceptación en menos de diez segundos y sin
     edición humana entre las señales de rendición.
     ========================================================================== */
  function firmar() {
    P.estado = 'firmando';
    var n = cfg.negociacion;
    caja().innerHTML =
      '<div class="votacion">' +
        '<p class="votacion__quien">' + esc(n.actaTitulo) + '</p>' +
        (P.actaEditando
          ? '<textarea class="campo acta__campo" id="acta-texto" rows="6" ' +
              'maxlength="600">' + esc(P.actaTexto) + '</textarea>'
          : '<div class="acta__texto">' + esc(P.actaTexto) + '</div>') +
        /* LA PREGUNTA NO ES UNA NOTA AL PIE. `sala__nota` es la letra chica de
           lo accesorio, y aquí la pregunta ES la pantalla: es lo que hay que
           contestar con los dos botones de abajo. Va en su propia clase y más
           grande (ajuste del titular, 2026-09-15). */
        '<p class="acta__pregunta' + (P.actaCorto ? ' acta__pregunta--corto' : '') + '">' +
          esc(P.actaCorto ? n.actaCorto
            : P.actaEditando ? n.actaEditando : n.actaPregunta) + '</p>' +
      '</div>';
    /* LOS DOS DEL MISMO TAMAÑO, Y EDITAR ARRIBA (ajuste del titular,
       2026-09-15). Al secundario le faltaba `boton--grande` y salía más bajo
       que el otro, como si fuera la opción menor: no lo es. Son las dos
       respuestas a la pregunta de arriba y las dos valen lo mismo; lo que las
       distingue es el color, que ya basta.
       Y el de editar va ENCIMA porque el de firmar es el que cierra: en un
       teléfono el de abajo es el que cae bajo el pulgar, y ahí tiene que estar
       el que confirma, no el que se echa atrás. */
    pie().innerHTML = P.actaEditando
      ? principal('p-acta-guardar', n.actaGuardar)
      : '<button class="boton boton--suave boton--bloque boton--grande boton--punteado" ' +
          'data-accion="p-acta-editar">' + esc(n.actaEditar) + '</button>' +
        principal('p-acta-firmar', n.actaFirmar);
  }

  /* La fila de `resultados` traducida a lo que la pantalla sabe pintar. Los
     lados vienen como `propone`/`invitado` y aquí son personas con nombre: la
     cuenta es siempre `propone`, la otra ficha es el invitado. */
  function delArbitro(res) {
    /* POR LADO, NO POR «YO»: `jugadores[0]` es siempre quien propuso. Aquí se
       leía con `indiceDeLaCuenta()`, que daba 0 mientras la única cuenta era la
       de quien propone; en línea (0055) el invitado también abre su veredicto
       y con ese índice habría visto los nombres al revés. */
    var quien = { propone: P.jugadores[0], invitado: P.jugadores[1] };
    var persona = function (lado) { return quien[lado] || { nombre: '?' }; };
    var tipo = res.tipo_resultado;
    var d = res.desglose;
    return {
      simulado: false,
      ganador: res.ganador_lado ? persona(res.ganador_lado).nombre : null,
      empate: tipo === 'empate_tecnico',
      motivoEmpate: res.motivo_empate || 'generico',
      sinResultado: tipo === 'sin_resultado_blando' ? 'blanda'
                  : tipo === 'sin_resultado_duro' ? 'dura' : null,
      justificacion: res.justificacion || '',
      /* S8: la FORMA del desacuerdo (v2.0) llega a la pantalla, que la lee en
         `veredicto.js`: con `de_acuerdo` dice que los dos defendieron lo mismo;
         con `sin_postura`, que alguien no llegó a sostener nada. */
      forma: res.forma_del_desacuerdo || null,
      loMejor: res.lo_mejor ? ['propone', 'invitado'].map(function (l) {
        return { nombre: persona(l).nombre, texto: (res.lo_mejor || {})[l] || '' };
      }).filter(function (q) { return q.texto; }) : null,
      /* LOS DOS, EN EL ORDEN DE LA MESA --quien propuso primero-- y no en el
         del resultado. Ponerlos «ganador a la izquierda» sería un podio, y la
         regla 3 del producto prohíbe el marcador entre los dos. */
      duelo: ['propone', 'invitado'].map(function (l) {
        var q = persona(l);
        return { nombre: q.nombre, avatar: q.avatar, color: q.color,
                 gano: res.ganador_lado === l };
      }),
      juez: P.juez,
      desglose: d ? {
        criterios: d.criterios || 5,
        personas: ['propone', 'invitado'].map(function (l) {
          return { nombre: persona(l).nombre, avatar: persona(l).avatar,
                   color: persona(l).color, rubrica: d[l] || {} };
        })
      } : null,
      /* El `cierre` (árbitro v2.2) viaja con los párrafos en `lo_que_dijo`. */
      cierre: (res.lo_que_dijo && res.lo_que_dijo.cierre) || null,
      loQueDijo: res.lo_que_dijo ? ['propone', 'invitado'].map(function (l) {
        return { nombre: persona(l).nombre, texto: res.lo_que_dijo[l] || '' };
      }) : null
    };
  }

  function revelar() {
    var m = $('#m-partida');
    /* El fondo vuelve a ser el de la PARTIDA: la carcasa lo dejó en el de la
       última ronda jugada y lo borró al cerrar. Va al principio, antes del
       duelo y antes de la ceremonia, que son las dos cosas que se pintan aquí. */
    marcarJuegoDeLaPartida();
    /* EL DUELO DE CARTAS DE CHOQUE VA ANTES DEL ANUNCIO (docs/10 §8.1): el
       volteo ronda a ronda con la frase del cruce ocupa el sitio de la
       deliberación; después llega la ceremonia de siempre. Solo la primera
       vez —en el repaso ya se sabe quién ganó y el suspenso sería teatro— y
       solo si el juego trae la escena (`ui.<id>.duelo`). */
    if (P.modo === 'competencia' && P.veredicto && !P.repaso && !P.dueloHecho) {
      var dj = (P.veredicto.desglose || {});
      /* ⚠️ LA ESCENA ES DE TODO EL MODO Y NO DE UN JUEGO (pivote del titular,
         2026-09-22). Se pedía `ui[dj.juego].duelo`, así que una partida mixta
         la habría montado el juego de la PRIMERA ronda --y las demás filas
         salían como «No jugó»-- y un juego sin escena propia se saltaba la
         revelación entera. */
      var J = window.ATWI.juegos;
      if (J && J.duelo && (dj.filas || []).length) {
        P.dueloHecho = true;
        m.hidden = false;
        marcarTurno(null);
        var rotulo0 = $('#t-partida');
        if (rotulo0) rotulo0.textContent = '';
        pie().innerHTML = '';
        P.pararDuelo = J.duelo(caja(), dj.filas,
          [P.jugadores[0], P.jugadores[1]],
          function () { P.pararDuelo = null; revelar(); });
        return;
      }
    }
    if (P.pararDuelo) { P.pararDuelo(); P.pararDuelo = null; }
    /* LO QUE SONABA SE CALLA ANTES DE CAMBIAR DE PANTALLA. Esto no estaba y se
       oía: bastaba poner una intervención —o «oír la partida entera»— y tocar
       «ver el resultado» para que la voz del personaje siguiera de fondo sobre
       la revelación, encima del redoble y de la voz del juez. Esconder el modal
       con `hidden` no para un `<audio>`: el elemento sigue vivo y sonando.
       `deliberar()` y `votar()` ya lo hacían; esta era la única salida de la
       sala que no. Lo encontró el titular con el ejercicio 1 (2026-09-16). */
    pararJuez();
    cerrarReproductor();
    window.ATWI.grabadora.soltar('se revela el resultado');
    m.hidden = true;
    /* VER LA REVELACIÓN ES HABERLA VISTO, JUEGUE DONDE JUEGUE (titular,
       2026-09-19: «jugué una partida local en la cual vi el resultado en
       directo… al ir al historial tenía campanita y al dar clic me mostró
       automáticamente el resultado en vez de abrirla para reproducción»).
       Aquí decía `P.enLinea &&`, y se escribió mirando los AVISOS —lo que la
       0060 quiere es que abrir la partida cumpla el aviso del buzón, que solo
       existe en línea—: el sello de `resultados.visto` se coló dentro de esa
       condición sin que nadie lo pensara. El resultado era que **la única
       manera de sellar una partida local era abrirla desde el historial**, o
       sea que quien la veía en vivo —el caso normal— la dejaba marcada como
       sin estrenar, con su campana y con la revelación entera esperándole.
       Un estreno que se le hace a quien ya lo vio no es una ceremonia: es un
       botón que no lleva donde dice.
       Sigue siendo AL ABRIR y no al cerrar, por lo de siempre: esperar al
       final dejaría sin sellar justo a quien cierra la app a mitad del redoble.
       Y es idempotente (`where visto is null`), así que volver a revelar desde
       el repaso no hace nada.
       ⚠️ El ensayo del probador y la demo de la landing quedan fuera: en la
       demo no hay sesión y su `debate` es una etiqueta congelada, y pedirle
       algo a Supabase desde ahí rompería el «cero llamadas» que esa página
       tiene medido. */
    if (P.debate && !P.ensayo && !P.demo && window.ATWI.nube && window.ATWI.nube.marcarVisto) {
      window.ATWI.nube.marcarVisto(P.debate);
    }
    var real = P.modo === 'debate' && P.veredicto ? delArbitro(P.veredicto)
             : P.modo === 'competencia' && P.veredicto ? delJuego(P.veredicto) : null;
    /* Por abandono (0056): la pantalla del juez lo dice antes del desglose. */
    if (real && P.abandono) real.abandono = P.abandono;
    veredicto.revelar(Object.assign({
      /* AQUÍ SE SORTEABA UN GANADOR A CARA O CRUZ, Y SE FUE (decisión del
         titular, 2026-09-15). Cuando el árbitro no contestaba, la app elegía un
         ganador al azar y lo rotulaba «resultado simulado, salido de un
         sorteo». Dos cosas mal: en un juego que le dice a una pareja quién
         argumentó mejor, inventar ese dato y avisar en letra chica es dejar que
         alguien use como argumento el resultado de una moneda; y desde que el
         nombre del ganador se pinta sobre la figura que entra, el sorteo ni se
         veía --la pantalla anunciaba la moneda y no enseñaba de qué lado había
         caído--.
         Ahora sin respuesta no se revela nada: la partida se queda en
         `deliberar()` y se ofrece volver a pedirlo. Ver `noContesto()`. */
      juez: P.juez,
      /* Los dos, con `gano` en falso: lo que ponga el árbitro en `real` pisa
         esto entero. En Negociación no hay `real`, y ahí quien «gana» lo decide
         la firma del acuerdo, no esta línea. */
      duelo: P.jugadores.map(function (q) {
        return { nombre: q.nombre, avatar: q.avatar, color: q.color, gano: false };
      }),
      modo: P.modo,
      publico: P.publico,
      tema: P.tema.titulo,
      /* Para que la pantalla pueda elegir SIEMPRE EL MISMO juez de respaldo
         cuando la ronda se jugó sin ninguno. Ver `juezDeRespaldo()`. */
      debate: P.debate || null,
      /* AQUÍ IBA UN `sinMediador` Y SE FUE (decisión del titular, 2026-09-15).
         Marcaba la partida cuyo mediador no llegó a proponer nada y llevaba a
         «Ronda guardada», que no era un resultado sino un aviso de avería con
         la puesta en escena de un final. Ahora esa partida no llega hasta aquí:
         se queda en deliberando y se vuelve a pedir (ver `noContesto()`).
         El antepasado de aquello fue peor y conviene no perderlo de vista: hasta
         el 2026-09-14 esta rama mandaba `P.tema.ejemplo` --el campo de EJEMPLO
         DEL CATÁLOGO, escrito meses antes-- y el juez lo presentaba
         entrecomillado como el acuerdo que la pareja acababa de escribir
         jugando. La app afirmando algo falso sobre la pareja es el riesgo que
         `CLAUDE.md` señala como el que puede matar el producto. */
      /* EL ACUERDO ES LA PROPUESTA QUE ELIGIERON Y FIRMARON, con el texto tal
         como lo dejaron. Si marcaron «ninguna», aquí va nulo y la pantalla cae
         en la escena de sin acuerdo, que es la que corresponde. */
      acuerdo: P.acuerdo ? P.acuerdo.texto : null,
      /* LA PARADA DEL MEDIADOR. En Controversia esto lo trae `real`, que pisa
         todo lo de aquí; en Negociación no hay árbitro que lo traiga, así que
         va por su cuenta. Nulo cuando no hubo parada, que es casi siempre. */
      sinResultado: P.paradaNegociacion || null,
      /* Y SU REPORTE. Los dos párrafos de «lo que dijo cada uno» son lo único
         compartible cuando el mediador para en blando, y `docs/02` §594 los
         llama obligatorios. En Controversia los trae `real`; aquí, su propia
         llamada. */
      loQueDijo: P.loQueDijoNegociacion || null,
      cierre: P.cierreNegociacion || null,
      alCerrar: function () {
        /* UN ENSAYO NO ES UNA PARTIDA Y NO SE ANOTA. Esto contaba el tema como
           jugado y subía el contador de debates o de acuerdos CADA VEZ que el
           titular miraba una escena en el probador: al cabo de una tarde de
           ajustar píxeles, su perfil decía que había jugado cuarenta veces y el
           catálogo daba por estrenados temas que nadie tocó. Y termina donde
           empezó --el probador-- y no en la portada, que obligaba a volver a
           entrar para mirar la escena siguiente. */
        if (P.ensayo) {
          cerrar();
          if (window.ATWI.alTerminarEnsayo) window.ATWI.alTerminarEnsayo();
          return;
        }
        /* ESTRENADO DESDE EL HISTORIAL. La contabilidad SÍ corre, y no es un
           doble conteo: quien cerró la app esperando el veredicto nunca llegó a
           cerrar esta pantalla, así que esa partida no se había contado nunca.
           Y se vuelve al historial, que es de donde salió: la insignia de «sin
           ver» tiene que desaparecer delante de sus ojos. */
        if (P.estrenando) {
          var pe = datos.perfil();
          var je = pe.temasJugados.slice();
          if (P.tema.id && je.indexOf(P.tema.id) === -1) je.push(P.tema.id);
          datos.actualizar({
            temasJugados: je,
            debates: pe.debates + (P.modo === 'debate' ? 1 : 0),
            acuerdos: pe.acuerdos + (P.modo === 'negociacion' ? 1 : 0)
          });
          var cual = P.debate;
          cerrar();
          if (window.ATWI.alEstrenarVeredicto) window.ATWI.alEstrenarVeredicto(cual);
          return;
        }
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
    }, real));
  }

  function fallo(texto) {
    var n = $('#juez-dice');
    if (n) n.textContent = texto;
  }

  /* --- Eventos ---------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var oirlo = e.target.closest('#m-partida [data-oir]');
    if (oirlo) return oir(oirlo.dataset.oir);

    /* El botón del globo «Primero escucha a X»: vive fuera de la sala —el globo
       cuelga del marco— así que no lleva el prefijo. Cierra el globo y suena. */
    var ahora = e.target.closest('[data-oir-ahora]');
    if (ahora && P) {
      if (window.ATWI.globo && window.ATWI.globo.cerrar) window.ATWI.globo.cerrar();
      return oir('i' + ahora.dataset.oirAhora);
    }

    /* Marcar una propuesta no cierra nada: deja el botón de abajo encendido y
       se puede cambiar de idea hasta pulsarlo. */
    var voto = e.target.closest('#m-partida [data-propuesta]');
    if (voto) {
      P.voto = Number(voto.dataset.propuesta);
      return votar();
    }

    var b = e.target.closest('#m-partida [data-accion]');
    if (!b) return;
    var a = b.dataset.accion;
    if (a === 'p-cerrar-detalle') { var d = $('#p-detalle'); if (d) d.remove(); return; }
    if (a === 'p-regrabar') { regrabar(Number(b.dataset.orden)); return; }
    if (a === 'p-remandar') { remandar(Number(b.dataset.orden)); return; }
    if (a === 'p-oir-todo') { oir('i0'); return; }
    if (a === 'p-listo') {
      if (P.demo) demoLaRonda();
      else if (P.modo === 'competencia') arrancarJuego();
      else if (P.enLinea) loQueToca();
      else pintarTurno();
    }
    /* `p-espera-volver` se fue con «Volver al inicio»: las dos pantallas de
       espera llevan ahora el estado «Esperando…» y la salida es el atrás. */
    if (a === 'p-voto-quedarme' || a === 'p-voto-aceptar') { votarEnLinea(Number(b.dataset.eleccion)); return; }
    else if (a === 'p-grabar') empezarAGrabar(false);
    else if (a === 'p-agregar') empezarAGrabar(true);
    else if (a === 'p-parar') pausarGrabacion();
    else if (a === 'p-mandar') mandar();
    else if (a === 'p-borrar') pintarRevision(true);
    else if (a === 'p-borrar-no') pintarRevision(false);
    else if (a === 'p-borrar-si') borrar();
    else if (a === 'p-seguir') seguir();
    else if (a === 'p-revelar') { if (P.modo === 'negociacion') arrancarVotacion(); else revelar(); }
    /* LA VOTACIÓN. `p-voto-listo` cierra el voto de quien está delante: si es
       el primero, a pasar el teléfono; si es el segundo, a comparar. */
    else if (a === 'p-reintentar') reintentar();
    else if (a === 'p-voto-listo') cerrarVotacion();
    else if (a === 'p-acta-editar') { P.actaAntes = P.actaTexto; P.actaEditando = true; firmar(); }
    else if (a === 'p-acta-guardar') {
      /* Se lee del campo ANTES de repintar: repintar lo destruye. */
      var campo = $('#acta-texto');
      var texto = campo ? campo.value.trim() : P.actaTexto;
      /* DEMASIADO CORTO NO SE TRAGA EN SILENCIO. Esto hacía
         `if (texto.length >= 10) P.actaTexto = texto;` y se quedaba tan ancho:
         quien vaciara el campo y pulsara «Listo» veía volver el texto viejo sin
         una palabra, como si la app hubiera ignorado lo que escribió. El tope
         no es un capricho de la pantalla, es el `check` de la tabla `acuerdos`
         --entre 10 y 600--, así que hay que decirlo y quedarse aquí.
         Lo escrito NO se pierde: se guarda igual en `actaTexto` y el campo lo
         conserva; lo único que no pasa es salir del modo edición. */
      P.actaTexto = texto;
      P.actaCorto = texto.length < 10;
      P.actaEditando = P.actaCorto;
      firmar();
    }
    else if (a === 'p-acta-firmar') {
      /* FIRMADA: el acuerdo que va a la revelación es el TEXTO FINAL, el que
         ellos dejaron, y no el que propuso el mediador. */
      P.acuerdo = { texto: P.actaTexto };
      guardarElActa('acuerdo', P.actaTexto);
      revelar();
    }
    else if (a === 'r-play') { var au = $('#sala-audio'); if (au.paused) au.play(); else au.pause(); }
    else if (a === 'r-vel') cambiarVelocidad();
    else if (a === 'r-cerrar') cerrarReproductor();
    else if (a === 'p-salir') salirDeLaSala();

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

  /* ENSAYAR LA VOTACIÓN SIN JUGAR UNA RONDA. Lo usa el probador de resultados,
     que solo ve el titular. Existe por la misma razón que el probador: mirar el
     encuadre de esta pantalla cuesta, si no, grabar seis intervenciones y
     esperar al mediador, y ajustar una medida así no se hace nunca.
     Monta el MÍNIMO de partida que la votación necesita --dos jugadores, quién
     abre, el modo y las propuestas-- y nada más: no abre partida en el
     servidor, no graba y no escribe. Al terminar cae en `revelar()`, o sea que
     también sirve para ver el empalme entero. */
  /* EL TEMA DEL ENSAYO. La sala lo pinta entero en el sorteo, así que no puede
     ir vacío: un enunciado en blanco deja la tarjeta con el chip de turnos
     flotando y lo que se está mirando es justo cómo queda esa tarjeta. */
  var TEMA_DE_ENSAYO = {
    titulo: 'los platos',
    enunciado: 'Al terminar de comer, ¿los platos se lavan en ese momento o pueden ' +
               'esperar a más tarde?'
  };

  /* LA MESA DE MENTIRA, EN UN SOLO SITIO. La montaban las dos funciones de
     ensayo con veinticinco líneas cada una, y son la misma partida mirada desde
     dos momentos distintos: si a `P` le nace un campo, hay que acordarse de
     ponerlo en los dos o el ensayo se rompe solo en uno. Lo que de verdad
     cambia entre ellas son tres cosas y van por parámetro. */
  function mesaDeEnsayo(op, extra) {
    var base = {
      juez: (op.juez && window.ATWI.esJuez(op.juez)) ? op.juez : 'bruno',
      tema: op.tema || TEMA_DE_ENSAYO,
      modo: op.modo === 'negociacion' ? 'negociacion' : op.modo === 'competencia' ? 'competencia' : 'debate',
      /* De la config y no un 3 escrito aquí: el ensayo pinta el chip de «N
         turnos cada uno» en la misma tarjeta que la partida de verdad, así que
         con el número a mano se quedaba enseñando el de antes en cuanto alguien
         moviera el de serie. Pasó el 2026-09-16, que bajó de 3 a 2. */
      turnos: cfg.reglas.turnosPorDefecto,
      publico: op.publico || 'pareja',
      jugadores: op.quien.map(ficha),
      orden: [0, 1],
      intervenciones: [],
      i: 0,
      borrador: null,
      estado: 'aviso',
      debate: null,
      veredicto: null,
      veredictoListo: false,
      veredictoMotivo: '',
      propuestas: null,
      propuestasListas: false,
      paradaNegociacion: null,
      ensayo: true
    };
    Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
    return base;
  }

  /* ENSAYAR EL SORTEO Y LA ENTRADA (petición del titular, 2026-09-16). El otro
     ensayo empieza donde termina la ronda; éste empieza donde empieza, que era
     lo único de la sala que seguía costando una partida entera para poder
     mirarlo: cuatro segundos de sorteo y una cortinilla de dos, escondidos
     detrás de elegir tema, invitado, turnos y fichas.

     QUIÉN ABRE SE SORTEA DE VERDAD, sin forzarlo. Un sorteo con el resultado
     puesto no se puede mirar: lo que hay que ver es que la ficha frene y caiga
     donde sea, y si siempre cayera del mismo lado no se estaría ensayando eso.
     Repetirlo cuesta un toque.

     Y SIGUE HASTA LA SALA si se pulsa «Empezar», que es lo que hace la partida
     de verdad: el empalme entre la cortinilla y el primer turno también es una
     costura y también hay que poder verla. Para salir está el atrás, que en un
     ensayo no pregunta nada y devuelve al probador. */
  function ensayarLaEntrada(op) {
    P = mesaDeEnsayo(op, { orden: Math.random() < 0.5 ? [0, 1] : [1, 0] });
    separarFichas();
    abrir();
    /* Las poses del encuentro, igual que en la partida de verdad: sin esperarlas
       la cortinilla arranca con las figuras a medio bajar, y es justo la
       animación que se ha venido a mirar. */
    P.poses = Promise.all([
      window.ATWI.precargarPoses(
        P.jugadores.map(function (j) { return j.avatar; }),
        [poseDelEncuentro()],
        P.jugadores.map(function (j) { return j.color; })),
      window.ATWI.precarga.listas([piezaDelEncuentro(P.modo, P.publico)])
    ]);
    pintarAviso();
  }

  function ensayarDesdeElFinal(op) {
    P = mesaDeEnsayo(op, {
      /* SEIS INTERVENCIONES DE MENTIRA, y no por capricho: la pantalla de
         deliberar dice cuántas hubo y cuántos segundos duraron. Con la lista
         vacía saldría «0 intervenciones · 0 segundos», que es la única línea de
         esa pantalla que no se estaría ensayando. */
      intervenciones: [{ segundos: 41 }, { segundos: 38 },
                       { segundos: 52 }, { segundos: 44 },
                       { segundos: 36 }, { segundos: 49 }]
    });
    separarFichas();
    abrir();

    /* EL ENSAYO ARRANCA DONDE ARRANCA LA PARTIDA DE VERDAD: en el instante en
       que se mandó la última intervención (petición del titular, 2026-09-15).
       Por eso pasa por `deliberar()` y por su espera, en vez de saltar al
       resultado: lo que hay que poder mirar es la secuencia entera, incluida la
       pausa, que es donde cae el minuto largo del modelo.

       LA ESPERA ES FALSA Y CORTA. Aquí no hay llamada que esperar; se dejan
       1,6 s, que es lo justo para ver la pantalla sin volverla un peaje. El día
       que el mediador exista, esta promesa se cambia por la llamada de verdad y
       no cambia nada más --en Controversia ya es así: `pedirVeredicto()`--. */
    P.juicio = new Promise(function (listo) { setTimeout(listo, 1600); })
      .then(function () {
        if (P.modo === 'negociacion') {
          /* «No llega respuesta» no deja propuestas, y eso es todo lo que hace
             falta: `noContesto()` lo lee de aquí y deja la partida en
             deliberando con el botón de volver a pedirlo. */
          P.propuestasListas = op.contesta !== 'no-contesta';
          /* La dura tampoco deja propuestas: para antes de mirarlas. */
          P.paradaNegociacion = op.contesta === 'parada' ? 'blanda'
                              : op.contesta === 'parada-dura' ? 'dura' : null;
          P.propuestas = op.contesta === 'dos' ? op.propuestas : null;
        } else {
          /* EN CONTROVERSIA EL ENSAYO MONTA LA FILA CRUDA DE `resultados`, no
             el objeto ya traducido. Así el ensayo pasa por `delArbitro()`, que
             es donde se convierten los lados `propone`/`invitado` en personas
             con nombre y donde se arma el desglose: si eso se rompiera, el
             probador que salta directo a la revelación no se enteraría. */
          P.veredicto = op.contesta === 'no-contesta' ? null : filaDeMentira(op.contesta);
          P.veredictoMotivo = op.contesta === 'no-contesta'
            ? 'el juez no contestó' : '';
          P.veredictoListo = true;
        }
        return null;
      });
    return deliberar();
  }

  /* Una fila de `resultados` como la que escribe el árbitro. Los números salen
     de la partida de prueba que ya se juzgó (eccb39ff), así que son plausibles
     y no redondos. */
  function filaDeMentira(caso) {
    var floja = { pertinencia: 78, solidez: 67, evidencia: 34, escucha: 52, tono: 90, total: 63.6 };
    var buena = caso === 'empate'
      ? { pertinencia: 78, solidez: 68, evidencia: 33, escucha: 59, tono: 90, total: 64.6 }
      : { pertinencia: 80, solidez: 74, evidencia: 66, escucha: 71, tono: 90, total: 74.2 };

    if (caso === 'parada' || caso === 'parada-dura') {
      /* LA DURA NO TRAE `lo_que_dijo` y no es un descuido: `docs/02` §578 dice
         «ningun registro». Devolverlo aqui haria que el ensayo ensenara una
         pantalla que la de verdad no puede ensenar. */
      if (caso === 'parada-dura') return { tipo_resultado: 'sin_resultado_duro' };
      return {
        tipo_resultado: 'sin_resultado_blando',
        lo_que_dijo: {
          propone: 'Habló de que gastar de más cuando hay gente le deja una sensación ' +
                   'que le dura, y de que a veces siente que se gasta por la situación.',
          invitado: 'Sostuvo que con gente delante se gasta lo que corresponde, y que ' +
                    'lo que representan fuera de casa importa.'
        }
      };
    }
    return {
      tipo_resultado: caso === 'empate' ? 'empate_tecnico' : 'gana_uno',
      ganador_lado: caso === 'empate' ? null : 'invitado',
      motivo_empate: caso === 'empate' ? 'parejo' : null,
      justificacion: caso === 'empate'
        ? 'La pertinencia fue pareja: las dos respuestas se ajustaron al enunciado. En ' +
          'solidez, cada postura trajo una razón identificable. La evidencia concreta ' +
          'fue escasa en los dos casos, y eso dejó la diferencia bajo el umbral.'
        : 'La evidencia concreta inclinó el resultado: dos ocasiones frente a ninguna. ' +
          'En pertinencia quedaron parejas. La escucha sumó del lado que marcó el punto ' +
          'exacto de desacuerdo.',
      lo_mejor: {
        propone: 'Sostuvo que el problema es el tamaño de la manta y no el número, y lo ' +
                 'apoyó en algo que ya habían probado juntos.',
        invitado: 'Marcó que lo que la despierta es el movimiento y no la tela, y ofreció ' +
                  'una prueba con plazo para comprobarlo.'
      },
      desglose: { criterios: 5, propone: floja, invitado: buena }
    };
  }

  /* ==========================================================================
     QUIÉNGANE: LA SALA LE PASA EL MANDO A LA CARCASA (docs/10, bloque 0.4)
     Después del sorteo y la cortinilla —que son los de siempre— en QuiénGane
     no se graba: se juega. La carcasa (`juegos/carcasa.js`) pinta dentro de
     esta misma sala —mismo modal, misma cabecera, mismo pie— y cuando termina
     devuelve la fila de `resultados`, que se revela con la ceremonia de siempre.
     ========================================================================== */
  /* ⚠️ CON REPARTO MIXTO NO HAY «EL» JUEGO (pivote del titular, 2026-09-22):
     con el nombre del primero, una partida de tres juegos distintos se
     anunciaría como si fuera de ése, que es la app afirmando algo falso sobre
     la partida. Si todas las rondas llevan el mismo, su nombre; si no, los tres
     en orden, que es lo que se va a jugar. */
  function nombreDelJuego() {
    var J = window.ATWI.juegos;
    if (!J || !P) return 'Minijuego';
    var l = (P.juegos && P.juegos.length) ? P.juegos : (P.juego ? [P.juego] : []);
    var nombre = function (id) { var m = J.juego(id); return (m && m.nombre) || 'Minijuego'; };
    if (!l.length) return 'Minijuego';
    if (l.every(function (x) { return x === l[0]; })) return nombre(l[0]);
    return l.map(nombre).join(' · ');
  }

  function arrancarJuego() {
    if (!P) return;
    if (P.limpiarEncuentro) { P.limpiarEncuentro(); P.limpiarEncuentro = null; }
    /* Aquí no se graba nada: el micrófono se suelta como en cualquier pantalla
       que no graba, por si el sorteo lo dejó abierto. */
    window.ATWI.grabadora.soltar('minijuego');
    P.estado = 'juego';
    var carcasa = window.ATWI.juego;
    if (!carcasa) return fallo('El minijuego no está cargado en esta versión.');
    carcasa.arrancar(P, {
      terminado: function (fila) {
        if (!P) return;
        P.veredicto = fila;
        P.veredictoListo = true;
        P.estado = 'deliberando';
        revelar();
      },
      esperar: function (otroLado) {
        if (!P) return;
        pintarEsperaDelJuego(otroLado);
      },
      fallo: function (texto) {
        if (window.ATWI.aviso) window.ATWI.aviso(texto);
      }
    });
  }

  /* En línea, mis rondas están enviadas y faltan las del otro: la misma espera
     que la del turno, con el plazo, y el sondeo trae el resultado (`tocada`). */
  function pintarEsperaDelJuego(otroLado) {
    P.estado = 'espera';
    P.esperaDelJuego = true;
    var cab = $('#t-partida');
    if (cab) cab.textContent = nombreDelJuego();
    var otro = P.jugadores[otroLado === 'invitado' ? 1 : 0];
    var hasta = P.plazo ? ' Tiene hasta ' + cuandoVence(P.plazo) + '.' : '';
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--relevo">' +
        '<p class="jg-relevo__t">Tus rondas están enviadas</p>' +
        '<p class="chico centrado jg-aviso">Faltan las de ' + esc(otro.nombre) + '.' + esc(hasta) +
          ' Te avisamos cuando el juez tenga el resultado.</p>' +
      '</div>';
    pie().innerHTML = esperandoHTML() +
      '<p class="chico centrado pie-nota">Puedes cerrar la app: la partida sigue en el Historial.</p>';
  }

  /* La fila de `resultados` de una partida de QuiénGane, traducida a lo que la
     revelación sabe pintar: como `delArbitro()`, pero sin rúbrica —aquí no hay
     justificación, hay una tabla de rondas— y con el juego dentro para que la
     pantalla del juez la enseñe (bloque 0.5). */
  function delJuego(res) {
    var quien = { propone: P.jugadores[0], invitado: P.jugadores[1] };
    var persona = function (lado) { return quien[lado] || { nombre: '?' }; };
    var d = res.desglose || {};
    return {
      simulado: false,
      ganador: res.ganador_lado ? persona(res.ganador_lado).nombre : null,
      empate: res.tipo_resultado === 'empate_tecnico',
      motivoEmpate: res.motivo_empate || 'parejo',
      sinResultado: null,
      justificacion: '',
      forma: null,
      loMejor: null,
      duelo: ['propone', 'invitado'].map(function (l) {
        var q = persona(l);
        return { nombre: q.nombre, avatar: q.avatar, color: q.color, gano: res.ganador_lado === l };
      }),
      juez: P.juez,
      desglose: null,
      cierre: null,
      loQueDijo: null,
      juego: {
        id: d.juego || P.juego,
        nombre: nombreDelJuego(),
        como: d.como || null,
        marcador: d.marcador || null,
        rondas: (d.filas || []).map(function (f) {
          return { ronda: f.ronda, gana: f.gana === 'empate' ? null : (f.gana ? persona(f.gana).nombre : null),
                   propone: f.propone, invitado: f.invitado };
        }),
        personas: ['propone', 'invitado'].map(function (l) {
          var q = persona(l);
          return { nombre: q.nombre, avatar: q.avatar, color: q.color, lado: l };
        })
      }
    };
  }

  /* ENSAYAR UN MINIJUEGO desde el probador: la mesa de mentira, el sorteo y la
     cortinilla de siempre, y después la carcasa con el juego pedido. Sin
     partida en el servidor: la semilla sale de un texto al azar y el veredicto
     lo calcula la carcasa con la misma lógica. */
  function ensayarElJuego(op) {
    P = mesaDeEnsayo(op, {
      modo: 'competencia',
      juego: op.juego || 'prueba',
      juegos: op.juegos || null,
      turnos: op.rondas || 1,
      /* Lo que el probador fijó para este juego; vacío en una partida real. */
      ajustes: op.ajustes || {},
      orden: Math.random() < 0.5 ? [0, 1] : [1, 0]
    });
    separarFichas();
    abrir();
    P.poses = Promise.all([
      window.ATWI.precargarPoses(
        P.jugadores.map(function (j) { return j.avatar; }),
        [poseDelEncuentro()],
        P.jugadores.map(function (j) { return j.color; })),
      window.ATWI.precarga.listas([piezaDelEncuentro(P.modo, P.publico)])
    ]);
    precargarElFinal();
    /* ⚠️ DIRECTO AL TABLERO SI SE PIDE (titular, 2026-09-22: «solo quiero poder
       probar los juegos reales directa y rápidamente»). El sorteo y la
       cortinilla son cuatro segundos de escena, y valen cuando lo que se ensaya
       ES la escena; cuando lo que se va a mirar es el tablero, se pagan en cada
       tirada. El probador entra derecho; el resto de caminos siguen igual. */
    if (op.directo) return arrancarJuego();
    pintarAviso();
  }

  /* LA PANTALLA DE COMPARACIÓN, SOLA (titular, 2026-09-22: «quiero poder
     reproducir directamente la pantalla de resultados de comparación de los
     juegos»). Hasta ahora había que jugar la partida entera --dos lados, sus
     rondas y el relevo-- para ver seis segundos de escena, que es el tipo de
     pantalla que por eso no se ajusta nunca.
     ⚠️ EL RESULTADO SE SORTEA, no se escribe: cada ronda saca una jugada al azar
     del juego que le toque y **quién gana lo decide la lógica de verdad**
     (`ganadorDeRonda`), no un `Math.random` sobre el ganador. Con el ganador
     puesto a mano la escena podría enseñar una fila que el juego nunca
     produciría --un empate imposible, un elemento que gana al que le gana-- y
     entonces lo que se estaría ajustando no es la pantalla del juego. */
  function ensayarLosResultados(op) {
    var J = window.ATWI.juegos;
    if (!J || !J.duelo) return;
    var juegos = (op.juegos && op.juegos.length) ? op.juegos : [op.juego || 'cuenta'];
    P = mesaDeEnsayo(op, {
      modo: 'competencia', juego: juegos[0], juegos: juegos,
      turnos: juegos.length, ajustes: op.ajustes || {},
      orden: Math.random() < 0.5 ? [0, 1] : [1, 0]
    });
    separarFichas();
    abrir();
    marcarJuegoDeLaPartida();
    var titulo = $('#t-partida');
    if (titulo) titulo.textContent = '';
    pie().innerHTML = '';
    var filas = juegos.map(function (id, i) {
      var p = jugadaDeEnsayo(id), q = jugadaDeEnsayo(id);
      var r = J.ganadorDeRonda(id, p, q);
      return { ronda: i + 1, juego: id, propone: r.propone, invitado: r.invitado,
               gana: r.gana, frase: r.frase || null };
    });
    P.pararDuelo = J.duelo(caja(), filas, [P.jugadores[0], P.jugadores[1]], function () {
      /* Se para ANTES de soltarlo: las figuras cuelgan del modal y no de la
         caja, así que si nadie llama a `parar()` se quedan dentro del modal
         oculto hasta el ensayo siguiente. */
      if (P.pararDuelo) P.pararDuelo();
      P.pararDuelo = null;
      /* Se sale por donde se entró: al probador, sin veredicto que enseñar.
         Montar además la ceremonia sería reproducir OTRA cosa, y para eso está
         su propio atajo.
         ⚠️ `cerrar()` SOLO NO BASTA (titular, 2026-09-22: «cuando salgo de la
         pantalla de comparación me envía al home, debe devolverme al panel de
         simulación»). Cerrar la partida deja a la vista lo que hubiera debajo
         --la portada--, y lo que reabre el probador es `alTerminarEnsayo`, que
         es lo que ya hacen el atrás de un ensayo y el final de la revelación.
         Este era el único camino que se lo saltaba. */
      cerrar();
      if (window.ATWI.alTerminarEnsayo) window.ATWI.alTerminarEnsayo();
    });
  }

  /* Una ronda de mentira, jugada con la lógica de verdad. ⚠️ NO SE INVENTAN
     JUGADAS AL AZAR: cada juego sabe resolver su tablero (`resolver`), así que
     se parte de ahí --la secuencia siempre es legal-- y lo que se sortea es
     CUÁNTO se llegó a hacer y en cuánto tiempo. Después se pasa por `repetir()`,
     que es exactamente lo que hace el servidor, así que el resumen tiene la
     misma forma que tendría en una partida de verdad. */
  function jugadaDeEnsayo(id) {
    var J = window.ATWI.juegos;
    var m = J.juego(id);
    if (!m || !m.resolver) return null;
    var nivel = J.nivelDe();
    var semilla = J.azar.deTexto('ensayo:' + id + ':' + Math.random());
    var tablero = J.tablero(id, semilla, nivel, 'propone');
    var base = m.resolver(tablero) || [];
    var jugadas = base.slice();
    var completo = true;
    if (base.length > 1) {
      /* Lo dejó a medias una de cada tres veces: si siempre saliera completo, la
         escena no enseñaría nunca el caso que más se mira --el que no llegó--. */
      if (Math.random() < 0.34) {
        jugadas = base.slice(0, Math.max(1, Math.round(base.length * (0.4 + Math.random() * 0.5))));
        completo = false;
      }
    } else if (base.length === 1) {
      /* Un juego de una sola jugada --elegir un elemento-- necesita variedad, o
         los dos lados sacarían siempre lo mismo. Se prueba una al azar y se
         comprueba contra la lógica; si no la acepta, se queda la resuelta. */
      var v = Math.floor(Math.random() * 5);
      if (J.repetir(id, semilla, nivel, 'propone', [v], 3000).ok) jugadas = [v];
    }
    var ms = (completo ? 1500 : 4000) + Math.floor(Math.random() * 5000);
    var rep = J.repetir(id, semilla, nivel, 'propone', jugadas, ms);
    if (!rep.ok) return null;
    return { marca: m.marca(rep.resumen), resumen: rep.resumen };
  }

  /* ==========================================================================
     EL VISOR DE LA LANDING (peticion del titular, 2026-09-17)

     Ensena una partida de verdad a quien todavia no ha entrado: el sorteo, la
     ronda ya jugada con su reproductor y el veredicto con su ceremonia. Tres
     escenas que el juego YA SABE HACER, asi que aqui no se dibuja nada nuevo:
     se encadenan `ensayarLaEntrada` -> `repasar` -> `revelar`, que son las
     mismas funciones que corren en una partida real. Lo que se ve en la landing
     no se parece al juego: ES el juego.

     ⚠️ Y NO CONSULTA NADA, que es la pregunta que hizo el titular —«¿como
     logramos que si se elimina esa partida no se rompa la landing?»—. Los datos
     estan congelados en `demo.js` y los audios en `assets/audio/demo/`, los dos
     escritos una sola vez por `tools/demo_landing.py`. Las intervenciones
     llegan con su `url` ya puesta, y eso es lo que evita la unica llamada que
     quedaba: `oirDelAlmacen` solo se pide cuando la url viene vacia.

     EL SORTEO ES DE VERDAD, sin el resultado puesto: la ficha cae donde caiga,
     como en una partida. Lo que viene detras es la ronda que se jugo, y esa si
     tiene su orden fijo —lo dice `abre_lado`—, asi que las dos cosas no se
     contradicen: el sorteo de la escena 1 decide quien ABRE la ceremonia, y el
     repaso de la escena 2 se monta con el orden real de la partida. */
  function demoDeLanding() {
    var d = window.ATWI.demo;
    if (!d) return;
    ensayarLaEntrada({
      modo: d.modo,
      juez: d.juez,
      publico: 'pareja',
      tema: { id: d.tema_catalogo, enunciado: d.enunciado, titulo: d.enunciado },
      quien: [
        { nombre: d.propone_nombre, avatar: d.propone_avatar,
          color: d.propone_color, abogado: d.abogado_propone },
        { nombre: d.invitado_nombre, avatar: d.invitado_avatar,
          color: d.invitado_color, abogado: d.abogado_invitado }
      ]
    });
    /* Marca las DOS escenas. `ensayo` ya viene de `mesaDeEnsayo` y sirve para
       que nada se anote; `demo` es lo que decide que al pulsar «Empezar» se
       vaya al repaso en vez de a la grabadora, y que al salir se reinicie. */
    P.demo = true;
  }

  /* La segunda escena: la ronda ya jugada. Se entra por `repasar`, el mismo
     camino que una partida del historial, con el debate congelado como si
     viniera del servidor. */
  function demoLaRonda() {
    /* ⚠️ LA CORTINILLA SE QUITA A MANO, Y AQUI SE OLVIDABA. El encuentro —las
       dos figuras y el estallido— cuelga del MODAL y no de la pantalla del
       sorteo, asi que no se va solo al cambiar de escena: lo retira
       `P.limpiarEncuentro()`, y en una partida de verdad eso lo llama
       `pintarTurno()`. La demo no pasa por ahi, va a `repasar()`, que reemplaza
       `P` ENTERO —y con el la referencia a esa funcion— antes de que nadie la
       llame. Resultado: las dos figuras del versus se quedaban detras de la
       ronda hasta el final. Lo vio el titular.
       Por eso se limpia ANTES de montar la mesa nueva. */
    if (P && P.limpiarEncuentro) { P.limpiarEncuentro(); P.limpiarEncuentro = null; }
    repasar(window.ATWI.demo, {});
    P.demo = true;
    P.ensayo = true;   /* que no cuente ni sello ni contadores al cerrarse */
  }

  window.ATWI.partida = { empezar: empezar, repasar: repasar, reanudar: reanudar,
                          /* La partida en línea (0055): entrar, y enterarse de que
                             hay algo nuevo mientras se espera. */
                          enLinea: enLinea, tocada: tocada,
                          cerrar: cerrar, ensayarDesdeElFinal: ensayarDesdeElFinal,
                          ensayarLaEntrada: ensayarLaEntrada,
                          ensayarElJuego: ensayarElJuego,
                          ensayarLosResultados: ensayarLosResultados,
                          demoDeLanding: demoDeLanding,
                          /* La usa tambien el detalle del tema, para ensenar la
                             escena de lo que va a pasar. Se exporta en vez de
                             copiar `TINTE_DE_MESA` a `app.js`: dos tablas del
                             mismo dato se desincronizan a la primera mesa nueva. */
                          piezaDelEncuentro: piezaDelEncuentro };
})();
