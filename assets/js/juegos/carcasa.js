/* ATWI · minijuegos · LA CARCASA
   ==========================================================================
   La sala donde se juega, común a los diez juegos (docs/10 §5, bloque 0.4).
   Un juego no sabe nada de rondas, de relojes, de reintentos ni del servidor:
   dibuja un tablero y avisa de cada jugada. Todo lo demás vive aquí, una sola
   vez, para que el segundo juego cueste el tablero y nada más.

   LO QUE HACE, EN ORDEN, PARA CADA RONDA:
     presentación  → quién juega, qué ronda, cuánto tiempo, «Comenzar ronda»
     cuenta atrás  → 3-2-1, que NO es tiempo de juego (la función lo descuenta)
     el tablero    → el juego pinta, la carcasa lleva el reloj y anota jugadas
     el recibo     → lo que hizo, «Enviar» o «Reintentar (quedan N)»
   Y entre las rondas de uno y las del otro, EN LOCAL, el relevo: «Pásale el
   teléfono a X», sin enseñar nada de lo que hizo el primero (titular, D4).

   EL RELOJ NO SE PARA NUNCA (titular, D13): corre con `performance.now()` y con
   temporizadores, jamás con `requestAnimationFrame` --lo que cuelga del ciclo
   de pintado no ocurre si la pestaña no pinta, y es la lección de S29--. Si la
   app se va al fondo, al volver el reloj está donde tiene que estar.

   LAS JUGADAS SE ENTREGAN SOLAS AL ACABAR LA RONDA y «Enviar» solo confirma:
   si el final se sellara al pulsar, los segundos de duda entre enviar y
   reintentar contarían como tiempo de juego. En línea eso es `terminar` +
   `confirmar` en la función de borde; en local se guarda aquí y se manda todo
   junto al final (`accion: local`), porque el otro jugador está al lado y no
   hay reloj de servidor que sellar.

   EL CONTRATO CON UN JUEGO (`ATWI.juegos.ui[id]`):
     pintar(contenedor, estado, ctx) -> opcional: actualizar(estado, jugada)
   `ctx.jugar(jugada)` es lo único que el juego llama. La carcasa aplica la
   lógica (`m.aplicar`), anota la jugada, mira si terminó y repinta --o llama
   al `actualizar` que el juego devolvió, si prefiere no volver a dibujarse--.
   `ctx.bloqueado` dice si el tablero debe ignorar los toques (cuenta atrás,
   ronda terminada).
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function J() { return window.ATWI.juegos; }
  function nube() { return window.ATWI.nube; }
  function sonido() { return window.ATWI.sonido; }

  /* Los mismos que la función de borde (`CUENTA_ATRAS_MS`): el 3-2-1 no cuenta. */
  var CUENTA_ATRAS_MS = 3000;
  var MS_TIC = 100;

  var C = null;   // la carcasa viva, o nulo

  function caja() { return $('#m-partida .modal__cuerpo'); }
  function pie() { return $('#m-partida .modal__pie'); }

  /** Una pieza de `assets/img/juegos/` (pegatina, sin disco detrás). */
  function pieza(nombre, px, clase) {
    return '<img class="jg-pieza' + (clase ? ' ' + clase : '') + '" ' +
      'src="../assets/img/juegos/' + nombre + '.webp" width="' + px + '" height="' + px + '" ' +
      'alt="" aria-hidden="true" decoding="async">';
  }

  /** El botón grande del pie, en el color del modo (azul: es QuiénGane). */
  function principal(accion, texto, apagado) {
    return '<button class="boton boton--bloque boton--grande boton--competencia" ' +
      'data-jg="' + accion + '"' + (apagado ? ' disabled' : '') + '>' + esc(texto) + '</button>';
  }
  function secundario(accion, texto, apagado) {
    return '<button class="boton boton--suave boton--bloque boton--grande boton--punteado" ' +
      'data-jg="' + accion + '"' + (apagado ? ' disabled' : '') + '>' + esc(texto) + '</button>';
  }
  function esperandoHTML(texto) {
    return '<p class="esperando" aria-live="polite">' + esc(texto || 'Esperando') +
      '<span class="esperando__puntos" aria-hidden="true"><i></i><i></i><i></i></span></p>';
  }

  function jugador(lado) {
    return C.P.jugadores[lado === 'invitado' ? 1 : 0];
  }
  function elOtroLado(lado) { return lado === 'invitado' ? 'propone' : 'invitado'; }

  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  /* --- Temporizadores: todos apuntados, para poder pararlos al salir -------- */
  function luego(fn, ms) {
    var id = setTimeout(function () { if (C && C.vivo) fn(); }, ms);
    if (C) C.temporizadores.push(id);
    return id;
  }
  function pararTodo() {
    if (!C) return;
    C.temporizadores.forEach(clearTimeout);
    C.temporizadores = [];
    if (C.reloj) { clearInterval(C.reloj); C.reloj = null; }
  }

  /* ==========================================================================
     ARRANQUE
     `P` es la mesa de `partida.js`: `juego`, `turnos` (aquí son RONDAS),
     `jugadores` (0 = quien propone), `orden` (quién abre), `debate`,
     `abriendo` (la promesa del id, en una partida nueva), `enLinea`, `miLado`,
     `ensayo`. `ganchos` es lo que la carcasa devuelve a la sala:
       terminado(fila)  la fila de `resultados`, para revelar
       esperar(lado)    en línea: mis rondas están y faltan las del otro
       fallo(texto)     algo que no se pudo (se dice y se ofrece reintentar)
     ========================================================================== */
  function arrancar(P, ganchos) {
    cerrar();
    var m = J().juego(P.juego);
    if (!m) {
      ganchos.fallo('El juego «' + P.juego + '» no está en esta versión de la app.');
      return;
    }
    C = {
      P: P, m: m, ganchos: ganchos,
      rondas: Number(P.turnos) || 1,
      /* En local juegan los dos, por turnos de RONDAS COMPLETAS: primero
         todas las de quien abre, después todas las del otro. En línea solo
         juego yo, y el servidor reparte tablero y reloj. */
      lados: P.enLinea ? [P.miLado || 'propone']
                       : P.orden.map(function (i) { return i === 0 ? 'propone' : 'invitado'; }),
      cual: 0,                  // índice en `lados`
      ronda: 1,
      intento: 1,
      gastados: 0,              // reintentos ya usados en esta ronda
      hechas: { propone: [], invitado: [] },   // en local: las rondas enviadas
      temporizadores: [], reloj: null, vivo: true
    };
    C.lado = C.lados[0];
    /* En línea, lo que ya hice lo sabe el servidor (`estado_del_juego`): se
       sigue donde toque. Sin él --local o ensayo-- se empieza por la ronda 1. */
    if (P.enLinea) return seguirEnLinea();
    pintarPresentacion();
  }

  function cerrar() {
    if (!C) return;
    C.vivo = false;
    pararTodo();
    C = null;
  }

  /* ==========================================================================
     1 · LA PRESENTACIÓN DE LA RONDA
     ========================================================================== */
  function pintarPresentacion(aviso) {
    if (!C) return;
    C.estado = 'presentacion';
    var q = jugador(C.lado);
    var m = C.m;
    var nivel = J().nivelDe(C.rondas, C.ronda);
    var titulo = $('#t-partida');
    if (titulo) titulo.textContent = m.nombre || 'Minijuego';
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--presenta">' +
        '<div class="jg-quien">' +
          window.ATWI.fichaHTML(q.avatar, 'avatar--duelo', q.color) +
          '<p class="jg-quien__nombre">' + esc(q.nombre) + '</p>' +
          '<p class="jg-quien__que">Te toca jugar</p>' +
        '</div>' +
        '<div class="jg-ficha-ronda">' +
          '<p class="jg-ficha-ronda__t">Ronda ' + C.ronda + ' de ' + C.rondas + '</p>' +
          '<p class="jg-ficha-ronda__nivel">' + esc(nombreDeNivel(nivel)) + '</p>' +
          '<div class="jg-datos">' +
            '<span class="jg-dato">' + pieza('jg-tiempo', 28) + esc(mmss(topeMs())) + '</span>' +
            (m.reintentos ? '<span class="jg-dato">' + pieza('jg-pasos', 28) +
              (C.gastados ? (m.reintentos - C.gastados) : m.reintentos) + ' reintento' +
              ((m.reintentos - C.gastados) === 1 ? '' : 's') + '</span>' : '') +
          '</div>' +
          (m.como ? '<p class="jg-ficha-ronda__como">' + esc(m.como) + '</p>' : '') +
        '</div>' +
        (aviso ? '<p class="chico centrado jg-aviso">' + esc(aviso) + '</p>' : '') +
      '</div>';
    /* Y SI LA PARTIDA TODAVÍA SE ESTÁ ABRIENDO EN EL SERVIDOR --la primera
       ronda de una partida nueva--, el botón espera al id: la semilla local
       sale de él y sin él no hay tablero que generar. Nadie mira una ruedita:
       abrir tarda menos que leer esta pantalla. */
    var listo = Boolean(C.P.debate) || Boolean(C.P.ensayo) || !C.P.abriendo;
    pie().innerHTML = principal('comenzar', C.intento > 1 ? 'Volver a jugar la ronda' : 'Comenzar ronda', !listo);
    if (!listo && C.P.abriendo) {
      C.P.abriendo.then(function () {
        if (!C || C.estado !== 'presentacion') return;
        var b = $('#m-partida [data-jg="comenzar"]');
        if (b) b.disabled = false;
      });
    }
  }

  var NIVELES = ['Para entrar en calor', 'Nivel normal', 'Nivel difícil'];
  function nombreDeNivel(n) { return NIVELES[n] || NIVELES[1]; }
  function topeMs() { return (C.topeMs || (C.m.topeS || 60) * 1000); }

  /* ==========================================================================
     2 · COMENZAR: la semilla, el tablero y la cuenta atrás
     ========================================================================== */
  function comenzar() {
    if (!C || C.estado !== 'presentacion') return;
    var s = sonido();
    if (s && s.hay()) s.despertar();
    if (C.P.enLinea) return comenzarEnLinea();
    /* LA SEMILLA LOCAL NO LLEVA SECRETO: id de la partida y ronda, como la
       función (`azar.deTexto`). El otro jugador está al lado; no hay nadie de
       quien esconderla. En un ensayo no hay partida: vale cualquier texto,
       distinto cada vez para que el tablero cambie entre ensayos. */
    var texto = C.P.debate ? C.P.debate + ':' + C.ronda
                           : 'ensayo:' + (C.P.ensayoSemilla || (C.P.ensayoSemilla = String(Math.random()))) + ':' + C.ronda;
    C.semilla = J().azar.deTexto(texto);
    C.nivel = J().nivelDe(C.rondas, C.ronda);
    C.topeMs = (C.m.topeS || 60) * 1000;
    cuentaAtras(jugarRonda);
  }

  /* El 3-2-1. Tres segundos con su sonido, y el tablero ya está debajo pintado
     y bloqueado: al llegar al «¡Ya!» se ve lo que hay que jugar, no un hueco. */
  function cuentaAtras(fin) {
    C.estado = 'cuenta';
    montarTablero(true);
    var velo = $('#m-partida .jg-cuenta');
    var n = 3;
    var s = sonido();
    function paso() {
      if (!C) return;
      if (n === 0) {
        if (velo) { velo.textContent = '¡Ya!'; velo.classList.add('jg-cuenta--ya'); }
        if (s && s.hay()) s.campana();
        luego(function () { if (velo) velo.remove(); fin(); }, 350);
        return;
      }
      if (velo) { velo.textContent = String(n); velo.classList.remove('jg-cuenta--late'); void velo.offsetWidth; velo.classList.add('jg-cuenta--late'); }
      if (s && s.hay()) s.clac(0.6);
      n--;
      luego(paso, (CUENTA_ATRAS_MS - 350) / 3);
    }
    paso();
  }

  /* ==========================================================================
     3 · EL TABLERO Y EL RELOJ
     ========================================================================== */
  function montarTablero(bloqueado) {
    var q = jugador(C.lado);
    C.tablero = J().tablero(C.P.juego, C.semilla, C.nivel, C.lado);
    C.estadoJuego = C.m.inicial(C.tablero);
    C.jugadas = [];
    C.bloqueado = bloqueado;
    caja().innerHTML =
      '<div class="jg jg--juego">' +
        '<div class="jg-cabecera">' +
          '<span class="jg-pildora jg-pildora--quien">' +
            window.ATWI.fichaHTML(q.avatar, 'avatar--mini', q.color) +
            '<span>' + esc(q.nombre) + '</span>' +
          '</span>' +
          '<span class="jg-pildora">Ronda ' + C.ronda + '/' + C.rondas + '</span>' +
          '<span class="jg-pildora jg-pildora--reloj" id="jg-reloj">' + pieza('jg-tiempo', 22) +
            '<span id="jg-reloj-n">' + esc(mmss(topeMs())) + '</span></span>' +
        '</div>' +
        '<div class="jg-tablero" id="jg-tablero"></div>' +
        (bloqueado ? '<div class="jg-cuenta" aria-live="assertive">3</div>' : '') +
      '</div>';
    pie().innerHTML = '';
    pintarJuego();
  }

  function contexto() {
    var area = $('#jg-tablero');
    return {
      jugar: jugar,
      lado: C.lado,
      nivel: C.nivel,
      bloqueado: C.bloqueado,
      /* Medido contra el hueco real, y no contra el viewport: en escritorio el
         juego vive dentro de un teléfono dibujado. `clientWidth` es el hueco
         interior, sin bordes. */
      ancho: area ? area.clientWidth : 300,
      alto: area ? area.clientHeight : 300
    };
  }

  function pintarJuego() {
    var ui = (J().ui || {})[C.P.juego];
    var area = $('#jg-tablero');
    if (!ui || !area) {
      if (area) area.innerHTML = '<p class="chico centrado">Este juego todavía no tiene tablero.</p>';
      return;
    }
    var actualizar = ui.pintar(area, C.estadoJuego, contexto());
    C.actualizar = typeof actualizar === 'function' ? actualizar : null;
  }

  function jugarRonda() {
    if (!C) return;
    C.estado = 'jugando';
    C.bloqueado = false;
    C.t0 = performance.now();
    pintarJuego();   // desbloqueado
    C.reloj = setInterval(tic, MS_TIC);
    tic();
  }

  function tic() {
    if (!C || C.estado !== 'jugando') return;
    var queda = topeMs() - (performance.now() - C.t0);
    var n = $('#jg-reloj-n');
    if (n) n.textContent = mmss(queda);
    var r = $('#jg-reloj');
    if (r) r.classList.toggle('jg-pildora--urge', queda < 10000);
    if (queda <= 0) terminarRonda('tiempo');
  }

  /** Lo único que el juego llama. */
  function jugar(jugada) {
    if (!C || C.estado !== 'jugando' || C.bloqueado) return false;
    var sig = C.m.aplicar(C.estadoJuego, jugada);
    if (sig === null || sig === undefined) return false;   // ilegal: el tablero no lo permite
    C.estadoJuego = sig;
    C.jugadas.push(jugada);
    if (C.actualizar) C.actualizar(C.estadoJuego, jugada); else pintarJuego();
    if (C.m.fin(C.estadoJuego)) terminarRonda('completo');
    return true;
  }

  /* ==========================================================================
     4 · EL FINAL DE LA RONDA Y EL RECIBO
     ========================================================================== */
  function terminarRonda(motivo) {
    if (!C || C.estado !== 'jugando') return;
    C.estado = 'terminando';
    C.bloqueado = true;
    if (C.reloj) { clearInterval(C.reloj); C.reloj = null; }
    C.ms = Math.min(topeMs(), Math.max(0, Math.round(performance.now() - C.t0)));
    pintarJuego();   // bloqueado, para que se vea el tablero final quieto
    var s = sonido();
    if (s && s.hay()) { if (motivo === 'completo') s.campana(); else s.clac(0.3); }
    if (C.P.enLinea) return terminarEnLinea();
    /* En local el resumen lo calcula la misma lógica que el servidor va a
       correr después: si aquí saliera otra cosa, el servidor tendría razón. */
    var r = J().repetir(C.P.juego, C.semilla, C.nivel, C.lado, C.jugadas, C.ms);
    C.resumen = r.ok ? r.resumen : C.m.resumen(C.estadoJuego, C.ms);
    luego(pintarRecibo, 700);
  }

  function pintarRecibo() {
    if (!C) return;
    C.estado = 'recibo';
    var q = jugador(C.lado);
    var m = C.m;
    var quedan = Math.max(0, (m.reintentos || 0) - C.gastados);
    var ui = (J().ui || {})[C.P.juego];
    var detalle = ui && ui.resumenHTML ? ui.resumenHTML(C.resumen) : resumenGenerico(C.resumen);
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--recibo">' +
        '<div class="jg-quien jg-quien--chica">' +
          window.ATWI.fichaHTML(q.avatar, 'avatar--duelo', q.color) +
          '<p class="jg-quien__nombre">' + esc(q.nombre) + '</p>' +
        '</div>' +
        '<div class="jg-ficha-ronda">' +
          '<p class="jg-ficha-ronda__t">' + (C.resumen.completo ? '¡Ronda completa!' : 'Se acabó el tiempo') + '</p>' +
          '<p class="jg-ficha-ronda__nivel">Ronda ' + C.ronda + ' de ' + C.rondas +
            (C.intento > 1 ? ' · intento ' + C.intento : '') + '</p>' +
          detalle +
        '</div>' +
        /* SOLO CUENTA LO QUE SE ENVÍA (titular, D13): si reintenta, lo de ahora
           se reemplaza. Se dice antes de que elija, no después. */
        '<p class="chico centrado jg-aviso">' + (quedan
          ? 'Si reintentas, se juega la misma ronda otra vez y cuenta solo la que envíes.'
          : 'No quedan reintentos: esta es la que cuenta.') + '</p>' +
      '</div>';
    /* Los dos del mismo tamaño y el blanco punteado: regla de los pares. */
    pie().innerHTML = (quedan ? secundario('reintentar', 'Reintentar (' + (quedan === 1 ? 'queda 1' : 'quedan ' + quedan) + ')') : '') +
                      principal('enviar', 'Enviar');
  }

  function resumenGenerico(r) {
    var partes = [];
    if (r.hechas != null) partes.push('<span class="jg-dato">' + pieza('jg-aciertos', 28) + r.hechas + '</span>');
    if (r.fallos != null) partes.push('<span class="jg-dato">' + r.fallos + ' fallo' + (r.fallos === 1 ? '' : 's') + '</span>');
    partes.push('<span class="jg-dato">' + pieza('jg-tiempo', 28) + esc(mmss(r.ms || 0)) + '</span>');
    return '<div class="jg-datos">' + partes.join('') + '</div>';
  }

  function reintentar() {
    if (!C || C.estado !== 'recibo') return;
    if (C.gastados >= (C.m.reintentos || 0)) return;
    C.gastados++;
    C.intento++;
    if (C.P.enLinea) return reintentarEnLinea();
    /* MISMO TABLERO (titular): la semilla es la de la ronda, no la del intento. */
    pintarPresentacion();
  }

  function enviar() {
    if (!C || C.estado !== 'recibo') return;
    if (C.P.enLinea) return confirmarEnLinea();
    C.hechas[C.lado][C.ronda - 1] = {
      lado: C.lado, ronda: C.ronda, jugadas: C.jugadas.slice(), ms: C.ms, intento: C.intento,
      resumen: C.resumen
    };
    siguiente();
  }

  /* Después de enviar: otra ronda, el relevo, o el final. */
  function siguiente() {
    C.gastados = 0;
    C.intento = 1;
    if (C.ronda < C.rondas) { C.ronda++; return pintarPresentacion(); }
    C.cual++;
    if (C.cual < C.lados.length) {
      C.ronda = 1;
      C.lado = C.lados[C.cual];
      return pintarRelevo();
    }
    terminarLocal();
  }

  /* ==========================================================================
     5 · EL RELEVO (solo en local)
     Sin enseñar nada de lo que hizo el primero: el segundo tiene que jugar sin
     saber qué tiene que superar (titular, D4). Lo que se ve es a quién le toca.
     ========================================================================== */
  function pintarRelevo() {
    C.estado = 'relevo';
    var q = jugador(C.lado);
    var titulo = $('#t-partida');
    if (titulo) titulo.textContent = C.m.nombre || 'Minijuego';
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--relevo">' +
        pieza('jg-relevo', 96, 'jg-relevo__signo') +
        '<p class="jg-relevo__t">Pásale el teléfono a ' + esc(q.nombre) + '</p>' +
        '<div class="jg-quien">' +
          window.ATWI.fichaHTML(q.avatar, 'avatar--duelo', q.color) +
          '<p class="jg-quien__nombre">' + esc(q.nombre) + '</p>' +
          '<p class="jg-quien__que">Le tocan sus ' + (C.rondas === 1 ? 'ronda' : C.rondas + ' rondas') + '</p>' +
        '</div>' +
        '<p class="chico centrado jg-aviso">Lo que hizo ' + esc(jugador(elOtroLado(C.lado)).nombre) +
          ' se ve al final, con el resultado.</p>' +
      '</div>';
    pie().innerHTML = principal('relevo-listo', 'Soy ' + q.nombre + ', empiezo');
  }

  /* ==========================================================================
     6 · EL FINAL EN LOCAL: todo junto al servidor, y de vuelta la fila
     ========================================================================== */
  function terminarLocal() {
    C.estado = 'enviando';
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--enviando">' +
        pieza('jg-copa', 96, 'jg-relevo__signo') +
        '<p class="jg-relevo__t">Las rondas de los dos están jugadas</p>' +
        '<p class="chico centrado jg-aviso">El juez las compara y presenta el resultado.</p>' +
      '</div>';
    pie().innerHTML = esperandoHTML('Comparando');
    var rondas = [];
    ['propone', 'invitado'].forEach(function (lado) {
      C.hechas[lado].forEach(function (r) {
        if (r) rondas.push({ lado: r.lado, ronda: r.ronda, jugadas: r.jugadas, ms: r.ms, intento: r.intento });
      });
    });
    /* UN ENSAYO NO LLAMA A NADIE: el veredicto se calcula aquí con la misma
       lógica, y la fila se arma como la escribiría la función. Es lo que hace
       que el probador enseñe la revelación de verdad sin gastar una partida. */
    if (C.P.ensayo || !nube() || !nube().juego) {
      return luego(function () {
        var porLado = function (lado) {
          var lista = [];
          for (var r = 1; r <= C.rondas; r++) {
            var f = C.hechas[lado][r - 1];
            lista.push(f ? { marca: C.m.marca(f.resumen), resumen: f.resumen } : null);
          }
          return lista;
        };
        var v = J().veredicto(C.P.juego, C.rondas, porLado('propone'), porLado('invitado'));
        entregar(filaDe(v));
      }, 900);
    }
    nube().juego('local', { debate: C.P.debate, version: J().VERSION_REGLAS, rondas: rondas })
      .then(function (r) {
        if (!C) return;
        if (r && r.resultado) return entregar(r.resultado);
        fallar((r && r.error) || 'El servidor no devolvió el resultado.', terminarLocal);
      });
  }

  function filaDe(v) {
    return {
      tipo_resultado: v.tipo === 'empate' ? 'empate_tecnico' : 'ganador',
      ganador_lado: v.ganador || null,
      motivo_empate: v.tipo === 'empate' ? 'parejo' : null,
      justificacion: null, forma_del_desacuerdo: null, lo_mejor: null, lo_que_dijo: null,
      desglose: { juego: C.P.juego, rondas: C.rondas, como: v.como, marcador: v.marcador, filas: v.rondas },
      visto: null, visto_invitado: null, creado: new Date().toISOString()
    };
  }

  function entregar(fila) {
    var g = C.ganchos;
    cerrar();
    g.terminado(fila);
  }

  /* Algo no se pudo: se dice en la propia pantalla y se ofrece volver a
     intentar lo mismo. Las jugadas siguen en memoria: no se pierde nada. */
  function fallar(texto, otraVez) {
    if (!C) return;
    C.estado = 'fallo';
    C.otraVez = otraVez;
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--fallo">' +
        '<p class="jg-relevo__t">No se pudo mandar</p>' +
        '<p class="chico centrado jg-aviso">' + esc(texto) + '</p>' +
      '</div>';
    pie().innerHTML = principal('otra-vez', 'Volver a intentar');
  }

  /* ==========================================================================
     7 · EN LÍNEA: el servidor reparte el tablero y sella el reloj
     `empezar` da la semilla, el nivel, el tope y cuántos reintentos quedan;
     `terminar` recibe las jugadas y contesta el resumen oficial; `confirmar`
     cierra la ronda. Lo que ya hice lo cuenta `estado_del_juego`.
     ========================================================================== */
  function seguirEnLinea() {
    var n = nube();
    if (!n || !n.estadoDelJuego) return fallar('Sin conexión con el servidor.', seguirEnLinea);
    C.estado = 'cargando';
    caja().innerHTML = '<div class="sala sala--centrada jg"></div>';
    pie().innerHTML = esperandoHTML('Cargando');
    n.estadoDelJuego(C.P.debate).then(function (e) {
      if (!C) return;
      if (!e) return fallar('No se pudo leer el estado de la partida.', seguirEnLinea);
      /* `mias` son las rondas que ya envié; la siguiente es la que sigue. La
         RPC solo dice SI hay resultado; la fila la trae `partida()`, que es la
         misma forma que lee el historial. */
      var enviadas = (e.mias || []).filter(function (r) { return r.estado === 'enviada'; }).length;
      if (e.hay_resultado) {
        return n.partida(C.P.debate).then(function (d) {
          if (!C) return;
          if (d && d.resultado) return entregar(d.resultado);
          fallar('El resultado está, pero no se pudo leer.', seguirEnLinea);
        });
      }
      if (enviadas >= C.rondas) { var g = C.ganchos; cerrar(); return g.esperar(elOtroLado(C.lados[0])); }
      C.ronda = enviadas + 1;
      C.gastados = 0;
      C.intento = 1;
      pintarPresentacion();
    });
  }

  function comenzarEnLinea(reintentar) {
    var n = nube();
    C.estado = 'pidiendo';
    var b = $('#m-partida [data-jg]');
    if (b) b.disabled = true;
    n.juego('empezar', { debate: C.P.debate, ronda: C.ronda, version: J().VERSION_REGLAS, reintentar: Boolean(reintentar) })
      .then(function (r) {
        if (!C) return;
        /* LA VERSIÓN SE COMPRUEBA ANTES DE ARRANCAR EL RELOJ: con el JS viejo
           este teléfono generaría otro tablero y la ronda se rechazaría después
           de jugada. Aquí no ha empezado nada, así que recargar no pierde nada. */
        if (r && r.error === 'version_vieja') {
          return fallar('Hay una versión nueva del juego: recarga la app para seguir.', function () { location.reload(); });
        }
        if (!r || r.error) {
          return fallar((r && r.error) || 'No se pudo pedir el tablero.', function () { pintarPresentacion(); });
        }
        C.semilla = r.semilla >>> 0;
        C.nivel = r.nivel;
        C.lado = r.lado;
        C.topeMs = r.tope_ms;
        C.intento = r.intento;
        C.gastados = r.gastados;
        /* Si la ronda ya venía corriendo --se cerró la app a mitad-- el reloj
           del servidor ya descontó lo que pasó: aquí se arranca con eso menos. */
        C.transcurrido = r.transcurrido_ms || 0;
        cuentaAtras(function () {
          jugarRonda();
          if (C && C.transcurrido) C.t0 -= C.transcurrido;
        });
      });
  }

  function terminarEnLinea() {
    nube().juego('terminar', { debate: C.P.debate, ronda: C.ronda, jugadas: C.jugadas, ms: C.ms })
      .then(function (r) {
        if (!C) return;
        if (!r || r.error) return fallar((r && r.error) || 'No se pudo entregar la ronda.', terminarEnLinea);
        C.resumen = r.resumen;
        C.intento = r.intento;
        pintarRecibo();
      });
  }

  function confirmarEnLinea() {
    C.estado = 'confirmando';
    var b = $('#m-partida [data-jg="enviar"]');
    if (b) b.disabled = true;
    nube().juego('confirmar', { debate: C.P.debate, ronda: C.ronda })
      .then(function (r) {
        if (!C) return;
        if (!r || r.error) { C.estado = 'recibo'; return fallar((r && r.error) || 'No se pudo confirmar.', pintarRecibo); }
        if (r.resultado) return entregar(r.resultado);
        C.gastados = 0;
        C.intento = 1;
        if (C.ronda < C.rondas) { C.ronda++; return pintarPresentacion(); }
        var g = C.ganchos;
        cerrar();
        g.esperar(elOtroLado(C.lados[0]));
      });
  }

  function reintentarEnLinea() {
    C.estado = 'presentacion';
    pintarPresentacion();
    comenzarEnLinea(true);
  }

  /* --- Los toques --------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    if (!C) return;
    var b = e.target.closest('#m-partida [data-jg]');
    if (!b) return;
    var a = b.dataset.jg;
    if (a === 'comenzar') comenzar();
    else if (a === 'reintentar') reintentar();
    else if (a === 'enviar') enviar();
    else if (a === 'relevo-listo') pintarPresentacion();
    else if (a === 'otra-vez') { var f = C.otraVez; C.otraVez = null; if (f) f(); }
  });

  /* Si la pestaña estuvo dormida, el reloj sigue: al volver se recalcula en
     el primer tic, y si el tiempo pasó dormido la ronda termina ahí mismo. */
  document.addEventListener('visibilitychange', function () {
    if (C && C.estado === 'jugando' && !document.hidden) tic();
  });

  window.ATWI.juego = { arrancar: arrancar, cerrar: cerrar, activa: function () { return Boolean(C); } };
})();
