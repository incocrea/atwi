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

  /* ⚠️ EL FONDO ES DEL JUEGO DE LA RONDA, Y SE MARCA AQUÍ (pivote del titular,
     2026-09-22). Cada juego con lámina propia la pinta por
     `#m-partida[data-juego]`, y `partida.js` lo escribe una vez con el juego de
     la PARTIDA: con reparto mixto eso dejaría el fondo de la ronda 1 puesto
     durante las tres. Se marca en `caja()` --el único punto por el que pasan
     TODOS los pintados de la sala-- en vez de acordarse en cada pantalla: una
     lista escrita a mano se queda coja a la primera que se escriba, que es la
     lección que este proyecto tiene anotada cinco veces. */
  function marcarFondo() {
    var m = document.getElementById('m-partida');
    if (!m || !C) return;
    var id = juegoActual();
    if (id && m.getAttribute('data-juego') !== id) m.setAttribute('data-juego', id);
  }
  function caja() { marcarFondo(); return $('#m-partida .modal__cuerpo'); }
  function pie() { return $('#m-partida .modal__pie'); }

  /** Una pieza de `assets/img/juegos/` (pegatina, sin disco detrás). */
  /* LA CABECERA DEL MODAL (titular, 2026-09-22: «tanto en los intros de los
     juegos como en la partida quita el título del modal; en la partida en
     curso reemplázalo por el logo del juego actual»). En la presentación y en
     el relevo manda el rótulo grande del centro, y un título arriba decía lo
     mismo dos veces; así que ahí va VACÍA. Mientras se juega, el rótulo ya no
     está y lo que sitúa es el logo, en el sitio del título.
     Es el logo del juego de ESTA ronda: con reparto mixto cambia entre rondas.
     Sin rótulo dibujado, el nombre en texto, que es mejor que una cabecera
     muda en medio de un tablero. */
  function cabecera(conLogo) {
    var t = $('#t-partida');
    if (!t) return;
    var m = M();
    t.classList.toggle('modal__titulo--logo', Boolean(conLogo && m.rotulo));
    if (!conLogo) { t.textContent = ''; return; }
    if (m.rotulo) {
      t.innerHTML = '<img class="jg-logo-cabecera" src="../assets/img/juegos/rotulo-' + esc(juegoActual()) +
        '.webp" alt="' + esc(m.nombre || '') + '" decoding="async">';
    } else {
      t.textContent = m.nombre || 'Minijuego';
    }
  }

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

  /* ⚠️ EL JUEGO ES DE LA RONDA, NO DE LA PARTIDA (pivote del titular,
     2026-09-22). `C.reparto` trae uno por ronda; una partida de antes del
     pivote --o del probador-- trae uno solo, y entonces su reparto es ése
     repetido.
     Y el módulo se DERIVA en vez de guardarse: `M()` se fijaba al arrancar, y
     con un juego por ronda habría que acordarse de actualizarlo en los cinco
     sitios donde cambia `C.ronda`. Una lista escrita a mano se queda coja a la
     primera que entra --es la lección que este proyecto tiene anotada cuatro
     veces--, así que aquí no hay lista: se pregunta. */
  function juegoDeRonda(r) {
    var l = C.reparto || [];
    return l[Math.min(Math.max(1, r), l.length) - 1] || C.P.juego;
  }
  function juegoActual() { return juegoDeRonda(C.ronda || 1); }
  function M() { return J().juego(juegoActual()) || C.mBase; }

  /* ⚠️ LOS AJUSTES DEL PROBADOR SON POR JUEGO, y con reparto mixto eso deja de
     ser un detalle: `P.ajustes` es un MAPA `{ <juego>: {...} }` y cada tablero
     recibe el suyo. Si se le pasara el mapa entero, Cuenta leería `ajustes.set`
     como undefined --el suyo está bajo `ajustes.cuenta.set`-- y el set fijado se
     perdería en cuanto la partida tuviera dos juegos. */
  function ajustesDelJuego() {
    var todo = (C.P && C.P.ajustes) || {};
    return todo[juegoActual()] || {};
  }

  /* ⚠️ UN JUEGO «DE UNA VEZ» RESUELVE SU TRAMO, NO LA PARTIDA ENTERA. Choque
     pide los elementos de varias rondas en una sola pantalla, y hasta el pivote
     eso eran TODAS las que quedaban --el juego era uno solo--. Con reparto
     mixto, pedirle a Choque los elementos de una ronda que se juega a Cuenta
     sería jugar por adelantado un juego que no es el suyo. Se le da el tramo
     CONSECUTIVO que sí es suyo desde la ronda actual. */
  /* Lo que cubre ESTA pantalla, dicho en palabras. ⚠️ Antes decía siempre «N
     rondas» --el juego era uno solo, así que su selección cubría la partida
     entera-- y con reparto mixto eso mentía: una pantalla de Choque que resuelve
     la ronda 1 de 3 anunciaba tres. */
  /* Lo mismo dicho para la ficha de la presentación, donde se habla en primera
     persona: «Tus 3 rondas» solo es verdad si esta pantalla las cubre las tres. */
  function tituloDelTramo() {
    var d = C.ronda || 1, h = finDelTramo();
    if (d === h) return C.rondas === 1 ? 'Tu ronda' : 'Ronda ' + d + ' de ' + C.rondas;
    if (d === 1 && h === C.rondas) return 'Tus ' + C.rondas + ' rondas';
    return 'Tus rondas ' + d + ' a ' + h;
  }
  function rondasDelTramo() {
    var d = C.ronda || 1, h = finDelTramo();
    if (d === 1 && h === C.rondas) return C.rondas === 1 ? '1 ronda' : C.rondas + ' rondas';
    if (d === h) return 'Ronda ' + d + '/' + C.rondas;
    return 'Rondas ' + d + '-' + h + '/' + C.rondas;
  }
  /* ⚠️ UNA RONDA POR PANTALLA, AUNQUE LAS TRES SEAN DEL MISMO JUEGO (titular,
     2026-09-22: «ahora solo se posiciona 1 elemento por casilla y cada selección
     es una ronda aparte»). Choque repartía de una vez todas las rondas seguidas
     que fueran suyas --con tres de Choque salían tres círculos-- y eso venía de
     cuando el juego era de la PARTIDA: entonces asignar los tres turnos juntos
     ERA la partida. Desde el pivote cada ronda se elige, se juega y se cierra
     por su cuenta, así que juntarlas volvía a mezclar lo que el pivote separó.
     `deUnaVez` sigue queriendo decir «este juego no tiene tablero con reloj,
     tiene una pantalla de selección»; lo que cambia es que esa pantalla cubre SU
     ronda y nada más. */
  function finDelTramo() { return C.ronda || 1; }
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
    /* ⚠️ SE COMPRUEBAN TODOS LOS DE LA PARTIDA, no solo el primero: con un
       reparto mixto, un juego que esta versión no conoce reventaría al llegar a
       SU ronda, o sea a mitad de partida y con lo jugado ya entregado. */
    var reparto = (function () {
      var n = Number(P.turnos) || 1;
      var l = (P.juegos || []).filter(Boolean);
      if (l.length === n) return l.slice();
      var u = []; for (var i = 0; i < n; i++) u.push(P.juego);
      return u;
    })();
    var falta = reparto.filter(function (id) { return !J().juego(id); })[0];
    if (falta) {
      ganchos.fallo('El juego «' + falta + '» no está en esta versión de la app.');
      return;
    }
    var m = J().juego(reparto[0]);
    C = {
      P: P, mBase: m, ganchos: ganchos,
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
      /* Uno por ronda. `P.juegos` lo trae la partida desde el pivote; sin él,
         el mismo juego en todas. */
      reparto: reparto,
      temporizadores: [], reloj: null, vivo: true
    };
    C.lado = C.lados[0];
    /* En línea, lo que ya hice lo sabe el servidor (`estado_del_juego`): se
       sigue donde toque. En LOCAL lo sabe el teléfono (titular, 2026-09-21:
       «cada juego debe cargar su state exactamente donde iba»): el progreso
       vive en `atwi.juego.<debate>` --se escribe al enviar cada ronda y se va
       al publicar-- y aquí se repone. La ronda a medio jugar no se guarda y
       tampoco hace falta: la semilla es de la ronda, así que al volver sale
       EL MISMO reto. */
    if (P.enLinea) return seguirEnLinea();
    if (cargarProgreso()) {
      /* Dónde iba: el primer lado con rondas por enviar. Si le toca al
         segundo y no ha empezado, el momento es el relevo. */
      for (var i = 0; i < C.lados.length; i++) {
        var suyas = (C.hechas[C.lados[i]] || []).filter(Boolean).length;
        if (suyas < C.rondas) {
          C.cual = i;
          C.lado = C.lados[i];
          C.ronda = suyas + 1;
          if (i > 0 && suyas === 0) return pintarRelevo();
          return pintarPresentacion();
        }
      }
      /* Los dos completos y sin resultado: se cayó al comparar; se compara. */
      return terminarLocal();
    }
    pintarPresentacion();
  }

  /* --- El progreso local, en el teléfono ----------------------------------- */
  function claveProgreso() { return 'atwi.juego.' + C.P.debate; }
  function guardarProgreso() {
    if (!C || !C.P.debate || C.P.enLinea || C.P.ensayo) return;
    try { localStorage.setItem(claveProgreso(), JSON.stringify({ hechas: C.hechas })); } catch (e) {}
  }
  function cargarProgreso() {
    if (!C.P.debate || C.P.ensayo) return false;
    var crudo = null;
    try { crudo = JSON.parse(localStorage.getItem(claveProgreso()) || 'null'); } catch (e) {}
    if (!crudo || !crudo.hechas) return false;
    C.hechas = { propone: crudo.hechas.propone || [], invitado: crudo.hechas.invitado || [] };
    return (C.hechas.propone.filter(Boolean).length + C.hechas.invitado.filter(Boolean).length) > 0;
  }
  function borrarProgreso() {
    if (!C || !C.P.debate) return;
    try { localStorage.removeItem(claveProgreso()); } catch (e) {}
  }

  function cerrar() {
    if (!C) return;
    C.vivo = false;
    pararTodo();
    C = null;
    /* ⚠️ Y SE QUITA LA MARCA DEL JUEGO DE LA RONDA. Lo que viene después --la
       revelación-- es de la PARTIDA, y con reparto mixto no tiene «su» juego:
       dejarla puesta le pegaba el fondo del último que se jugó, como si la
       partida entera hubiera sido de ése. Quien la repone según lo que la
       partida sea es `partida.js`. */
    var m = document.getElementById('m-partida');
    if (m) m.removeAttribute('data-juego');
    /* Y el logo de la cabecera: lo que viene después pone su propio título con
       `textContent`, que se lleva la imagen pero no la clase. */
    var t = document.getElementById('t-partida');
    if (t && t.classList.contains('modal__titulo--logo')) {
      t.classList.remove('modal__titulo--logo');
      t.textContent = '';
    }
  }

  /* ==========================================================================
     1 · LA PRESENTACIÓN DE LA RONDA
     ========================================================================== */
  function pintarPresentacion(aviso) {
    if (!C) return;
    C.estado = 'presentacion';
    var q = jugador(C.lado);
    var m = M();
    cabecera(false);
    /* El rótulo dibujado, si el juego lo tiene (`rotulo-<id>.webp`): manda
       sobre el nombre en texto, como el logo del modo en el versus. */
    var cabeza = m.rotulo
      ? '<img class="jg-rotulo" src="../assets/img/juegos/rotulo-' + esc(juegoActual()) + '.webp" alt="' +
          esc(m.nombre || '') + '" decoding="async">'
      : '';
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--presenta">' +
        cabeza +
        '<div class="jg-quien">' +
          window.ATWI.fichaHTML(q.avatar, 'avatar--duelo', q.color) +
          '<p class="jg-quien__nombre">' + esc(q.nombre) + '</p>' +
          '<p class="jg-quien__que">Te toca jugar</p>' +
        '</div>' +
        '<div class="jg-ficha-ronda">' +
          /* Con `deUnaVez` las rondas de su TRAMO se asignan juntas en una
             pantalla, así que la presentación es una sola y lo dice en plural
             --pero solo de las que cubre: con reparto mixto pueden ser una--. */
          '<p class="jg-ficha-ronda__t">' + esc(m.deUnaVez ? tituloDelTramo()
            : 'Ronda ' + C.ronda + ' de ' + C.rondas) + '</p>' +
          '<div class="jg-datos">' +
            (m.sinReloj ? '' : '<span class="jg-dato">' + pieza('jg-tiempo', 28) + esc(mmss(topeMs())) + '</span>') +
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

  /* ⚠️ EL RENGLÓN DE NIVEL SE FUE CON LA RAMPA (pivote del titular,
     2026-09-22: «los juegos tendrán dificultad única»). Decía «Para entrar en
     calor / Nivel normal / Nivel difícil» según la ronda, y con un solo nivel
     eso era un rótulo que afirmaba algo falso sobre la ronda que viene. */
  function topeMs() { return (C.topeMs || (M().topeS || 60) * 1000); }

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
    C.nivel = J().nivelDe();
    C.topeMs = (M().topeS || 60) * 1000;
    /* SIN RELOJ NO HAY CUENTA ATRÁS (Choque): el 3-2-1 existe para que nadie
       pierda segundos que puntúan mirando cómo aparece el tablero, y aquí el
       tiempo ni apura ni puntúa. Se entra derecho a elegir. */
    if (M().deUnaVez) return montarSeleccion();
    if (M().sinReloj) { montarTablero(false); jugarRonda(); return; }
    cuentaAtras(jugarRonda);
  }

  /* ==========================================================================
     2b · LA SELECCIÓN DE TODAS LAS RONDAS EN UNA PANTALLA (`deUnaVez`)
     Petición del titular (2026-09-21) para Choque: en vez de elegir un
     elemento, aceptar y elegir otro, se ASIGNAN los turnos en la misma
     interfaz --tocar marca con un 1, el siguiente con un 2, tocar uno marcado
     lo libera-- hasta repartir las rondas disponibles, y un solo «Confirmar».
     Reasignar es libre, así que aquí no hay recibo ni reintentos: pensarlo
     mejor es quitar un número y ponerlo en otro sitio.

     La UI del juego pone `seleccion(area, ctx)` en vez de `pintar`, y llama a
     `ctx.confirmar(elementos)` con una jugada por ronda pendiente, en orden.
     Si venimos a medias --en línea con rondas ya enviadas-- se asignan solo
     las que faltan, con `ctx.previas` para agotar lo ya usado. */
  function montarSeleccion() {
    C.estado = 'jugando';
    C.t0 = performance.now();
    var q = jugador(C.lado);
    cabecera(true);
    caja().innerHTML =
      '<div class="jg jg--juego">' +
        '<div class="jg-cabecera">' +
          '<span class="jg-pildora jg-pildora--quien">' +
            window.ATWI.fichaHTML(q.avatar, 'avatar--mini', q.color) +
            '<span>' + esc(q.nombre) + '</span>' +
          '</span>' +
          '<span class="jg-pildora">' + esc(rondasDelTramo()) + '</span>' +
        '</div>' +
        '<div class="jg-tablero" id="jg-tablero"></div>' +
      '</div>';
    pie().innerHTML = '';
    var ui = (J().ui || {})[juegoActual()];
    var area = $('#jg-tablero');
    if (!ui || !ui.seleccion || !area) {
      if (area) area.innerHTML = '<p class="chico centrado">Este juego todavía no tiene tablero.</p>';
      return;
    }
    ui.seleccion(area, {
      desde: C.ronda,
      hasta: finDelTramo(),
      previas: previas(),
      ancho: area.clientWidth,
      alto: area.clientHeight,
      /* Los mismos ajustes del probador que reciben los de tablero: un juego de
         selección también puede tener variantes que auditar. */
      ajustes: ajustesDelJuego(),
      confirmar: enviarSeleccion
    });
  }

  /** `elementos[i]` es la jugada de la ronda `C.ronda + i`. */
  function enviarSeleccion(elementos) {
    if (!C || C.estado !== 'jugando') return;
    C.estado = 'terminando';
    var ms = Math.min(topeMs(), Math.max(0, Math.round(performance.now() - C.t0)));
    if (C.P.enLinea) return secuenciaEnLinea(elementos, ms);
    for (var i = 0; i < elementos.length; i++) {
      var r = C.ronda + i;
      var texto = C.P.debate ? C.P.debate + ':' + r
                             : 'ensayo:' + (C.P.ensayoSemilla || (C.P.ensayoSemilla = String(Math.random()))) + ':' + r;
      var semilla = J().azar.deTexto(texto);
      var nivel = J().nivelDe();
      var rep = J().repetir(juegoDeRonda(r), semilla, nivel, C.lado, [elementos[i]], ms);
      C.hechas[C.lado][r - 1] = {
        lado: C.lado, ronda: r, jugadas: [elementos[i]], ms: ms, intento: 1,
        resumen: rep.ok ? rep.resumen : null
      };
    }
    guardarProgreso();
    C.ronda = C.ronda + elementos.length - 1;
    siguiente();
  }

  /* En línea, la asignación se entrega ronda a ronda con las tres llamadas de
     siempre --empezar sella, terminar entrega, confirmar cierra--, en serie y
     con su pantalla de espera. Si algo se cae a mitad, el botón vuelve por
     `seguirEnLinea()`, que pregunta qué quedó enviado y ofrece asignar solo lo
     que falta. `empezar` puede encontrarse un intento «por confirmar» de una
     caída anterior: se confirma y se sigue. */
  /* ⚠️ UNA LLAMADA QUE RECHAZA NO PUEDE QUEDARSE SIN CONTESTAR (titular,
     2026-09-21: «al invitado, una vez jugó sus turnos, se le quedó paralizado en
     enviando; tuve que salir y volver a entrar»). `secuenciaEnLinea` encadena
     TRES llamadas por ronda --empezar, terminar, confirmar--, o sea NUEVE
     seguidas con tres rondas, y ninguna tenía `.catch`: bastaba que una sola se
     cayera --un hipo de red, la pestaña dormida, cualquier cosa-- para que la
     promesa quedara sin manejar y la pantalla se quedara en «Enviando» sin
     salida. Aquí el rechazo se traduce a `{error}`, que es lo que el código de
     abajo ya sabe atender: enseña el fallo y ofrece «Volver a intentar», y
     `seguirEnLinea` recalcula desde el servidor sin perder nada --las tres
     acciones son idempotentes--. */
  function pedirJuego(accion, cuerpo) {
    return nube().juego(accion, cuerpo).catch(function (e) {
      return { error: (e && e.message) || 'no se pudo conectar con el servidor' };
    });
  }

  function secuenciaEnLinea(elementos, ms) {
    C.estado = 'enviando';
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--enviando">' +
        pieza('jg-copa', 96, 'jg-relevo__signo') +
        '<p class="jg-relevo__t">Enviando tus rondas</p>' +
      '</div>';
    pie().innerHTML = esperandoHTML('Enviando');
    var k = 0;
    (function una() {
      if (!C) return;
      if (k >= elementos.length) {
        var g = C.ganchos;
        cerrar();
        return g.esperar(elOtroLado(C.lados[0]));
      }
      var r = C.ronda + k;
      function confirma(ronda) {
        pedirJuego('confirmar', { debate: C.P.debate, ronda: ronda }).then(function (c) {
          if (!C) return;
          if (!c || c.error) return fallar((c && c.error) || ('No se pudo confirmar la ronda ' + ronda + '.'), seguirEnLinea);
          if (c.resultado) return entregar(c.resultado);
          k++;
          una();
        });
      }
      pedirJuego('empezar', { debate: C.P.debate, ronda: r, version: J().VERSION_REGLAS })
        .then(function (e) {
          if (!C) return;
          if (e && e.error && /por confirmar/.test(e.error)) return confirma(r);
          if (!e || e.error) return fallar((e && e.error) || ('No se pudo sellar la ronda ' + r + '.'), seguirEnLinea);
          pedirJuego('terminar', { debate: C.P.debate, ronda: r, jugadas: [elementos[k]], ms: ms })
            .then(function (x) {
              if (!C) return;
              if (!x || x.error) return fallar((x && x.error) || ('No se pudo entregar la ronda ' + r + '.'), seguirEnLinea);
              confirma(r);
            });
        });
    })();
  }

  /* Lo que se pinta en el 3-2-1: si el juego trae `conteo(estado, n)` (Cuenta
     usa una ficha de un set distinto al del tablero), su HTML; si no, el número
     a secas. El número siempre va en un `solo-lectores` para que la región
     `aria-live` lo anuncie aunque la vista sea un dibujo. */
  function conteoContenido(n) {
    var ui = (J().ui || {})[juegoActual()];
    if (ui && typeof ui.conteo === 'function') {
      return '<span class="solo-lectores">' + n + '</span>' + ui.conteo(C.estadoJuego, n);
    }
    return String(n);
  }

  /* El 3-2-1. Tres segundos con su sonido, y el tablero ya está debajo pintado
     y bloqueado: al llegar al «¡Ya!» se ve lo que hay que jugar, no un hueco. */
  function cuentaAtras(fin) {
    C.estado = 'cuenta';
    montarTablero(true);
    var velo = $('#m-partida .jg-cuenta');
    /* Con muestra, el número no puede plantarse en medio del tablero: es justo
       lo que hay que mirar. Se va a una esquina y deja ver lo de debajo. */
    if (velo && M().muestra) velo.classList.add('jg-cuenta--muestra');
    /* ⚠️ Y SI EL TABLERO MARCA UN SITIO (`[data-conteo]`), FLOTA AHÍ (titular,
       2026-09-22: «el conteo flotante, que no ocupe interfaz ni mueva nada»).
       Sin marca iba al pie de la sala, y en Calco caía justo donde ahora está la
       paleta —que se enseña desde la muestra para que la rejilla no salte al
       empezar— y el número salía medio cortado por el borde. Se mide una vez:
       durante el 3-2-1 no cambia nada de sitio, que es justo lo que se busca. */
    var ancla = velo && $('#jg-tablero [data-conteo]');
    if (ancla) {
      var base = velo.parentNode.getBoundingClientRect(), r = ancla.getBoundingClientRect();
      velo.classList.add('jg-cuenta--anclada');
      velo.style.inset = 'auto';
      velo.style.left = (r.left - base.left) + 'px';
      velo.style.top = (r.top - base.top) + 'px';
      velo.style.width = r.width + 'px';
      velo.style.height = r.height + 'px';
    }
    var n = 3;
    var s = sonido();
    function paso() {
      if (!C) return;
      if (n === 0) {
        /* ⚠️ SIN «¡Ya!» (titular, 2026-09-22: «solo pasa la cuenta regresiva e
           inicia»). Era medio segundo de cartel entre el 1 y el primer toque,
           y lo que de verdad dice que se empieza es que el tablero se
           desbloquea: el cartel solo retrasaba eso. La campana se queda, que es
           la señal de salida sin ocupar la pantalla. */
        if (s && s.hay()) s.campana();
        if (velo) velo.remove();
        fin();
        return;
      }
      if (velo) { velo.innerHTML = conteoContenido(n); velo.classList.remove('jg-cuenta--late'); void velo.offsetWidth; velo.classList.add('jg-cuenta--late'); }
      if (s && s.hay()) s.clac(0.6);
      n--;
      /* Los tres pasos se reparten los 3 s ENTEROS: los 350 ms que antes se
         apartaban eran los del «¡Ya!», y el servidor descuenta 3.000 exactos
         (`CUENTA_ATRAS_MS`), así que la cuenta tiene que durar eso. */
      luego(paso, CUENTA_ATRAS_MS / 3);
    }
    paso();
  }

  /* ==========================================================================
     3 · EL TABLERO Y EL RELOJ
     ========================================================================== */
  function montarTablero(bloqueado) {
    var q = jugador(C.lado);
    cabecera(true);
    C.tablero = J().tablero(juegoActual(), C.semilla, C.nivel, C.lado);
    C.estadoJuego = M().inicial(C.tablero);
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
          (M().sinReloj ? '' :
            '<span class="jg-pildora jg-pildora--reloj" id="jg-reloj">' + pieza('jg-tiempo', 22) +
              '<span id="jg-reloj-n">' + esc(mmss(topeMs())) + '</span></span>') +
        '</div>' +
        '<div class="jg-tablero" id="jg-tablero"></div>' +
        (bloqueado ? '<div class="jg-cuenta" aria-live="assertive">' + conteoContenido(3) + '</div>' : '') +
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
      /* ⚠️ LA MUESTRA ES LA CUENTA ATRÁS, NO UN TIEMPO APARTE (Calco, 2026-09-22).
         Un juego que se mira antes de jugarse (`m.muestra`) enseña su tablero
         DURANTE el 3-2-1 y lo esconde al empezar. Se aprovecha esa cuenta en vez
         de añadir una pausa propia porque el servidor descuenta `CUENTA_ATRAS_MS`
         exactos del tiempo de la ronda: con una espera aparte, los segundos de
         mirar contarían como tiempo de juego. Y de paso el 3-2-1 dice cuánto
         queda para que el patrón desaparezca, que es lo que hace falta saber. */
      muestra: !!(M().muestra && C.estado === 'cuenta'),
      /* Medido contra el hueco real, y no contra el viewport: en escritorio el
         juego vive dentro de un teléfono dibujado. `clientWidth` es el hueco
         interior, sin bordes. */
      ancho: area ? area.clientWidth : 300,
      alto: area ? area.clientHeight : 300,
      /* Los resúmenes de MIS rondas anteriores ya enviadas: Choque agota con
         ellos los elementos usados. En local salen de lo jugado aquí; en línea,
         de lo que contó `estado_del_juego`. */
      previas: previas(),
      /* LOS AJUSTES DEL PROBADOR (titular, 2026-09-22: «deseo poder escoger por
         juego ciertas configuraciones; por ejemplo, para Cuenta poder escoger
         una variante de números y que todas las partidas salgan con ese set,
         para auditar mejor sus ilustraciones sin esperar que me salgan al
         azar»). Van SIEMPRE en el contexto y en una partida de verdad llegan
         vacíos: un juego los lee como «si hay algo puesto, respétalo; si no,
         sortea», así que la partida real no cambia de comportamiento. */
      ajustes: ajustesDelJuego()
    };
  }

  function pintarJuego() {
    var ui = (J().ui || {})[juegoActual()];
    var area = $('#jg-tablero');
    /* ⚠️ Y SE COMPRUEBA QUE `pintar` SEA UNA FUNCIÓN, no solo que haya `ui`: un
       juego de selección (`deUnaVez`) expone `seleccion` y NO `pintar`, así que
       llegar aquí con uno de ésos reventaba con «ui.pintar is not a function» en
       la cara de quien juega. Quien enruta es `comenzar`/`comenzarEnLinea`; esto
       es la red para que el próximo olvido se lea en vez de romper. */
    if (!ui || !area || typeof ui.pintar !== 'function') {
      if (area) area.innerHTML = '<p class="chico centrado">Este juego todavía no tiene tablero.</p>';
      return;
    }
    var actualizar = ui.pintar(area, C.estadoJuego, contexto());
    C.actualizar = typeof actualizar === 'function' ? actualizar : null;
  }

  /* Cuánto dura la salida de una jugada, si el tablero la anima. Lo declara el
     juego (`msSalida`) porque el número vive con la animación que describe: la
     carcasa no puede saber cuánto tarda una ficha en romperse. Sin declararlo,
     cero: el final de la ronda congela en el acto, como hacía antes. */
  function msSalida() {
    var ui = (J().ui || {})[juegoActual()];
    return (ui && ui.msSalida) || 0;
  }

  function previas() {
    if (!C) return [];
    if (C.P.enLinea) {
      return (C.enviadasEnLinea || []).map(function (r) { return r.resumen; }).filter(Boolean);
    }
    return (C.hechas[C.lado] || []).map(function (r) { return r && r.resumen; }).filter(Boolean);
  }

  function jugarRonda() {
    if (!C) return;
    C.estado = 'jugando';
    C.bloqueado = false;
    C.t0 = performance.now();
    pintarJuego();   // desbloqueado
    if (!M().sinReloj) { C.reloj = setInterval(tic, MS_TIC); tic(); }
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
    var sig = M().aplicar(C.estadoJuego, jugada);
    if (sig === null || sig === undefined) return false;   // ilegal: el tablero no lo permite
    C.estadoJuego = sig;
    C.jugadas.push(jugada);
    if (C.actualizar) C.actualizar(C.estadoJuego, jugada); else pintarJuego();
    if (M().fin(C.estadoJuego)) terminarRonda('completo');
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
    /* ⚠️ EL CONGELADO SE LLEVABA POR DELANTE LA ÚLTIMA ANIMACIÓN (titular,
       2026-09-22: «el último elemento que se rompe en el conteo no está
       mostrando su animación de ruptura»). `actualizar` acababa de poner esa
       ficha en su estado roto y `pintarJuego` vuelve a dibujar el tablero
       ENTERO desde `estado`, donde esa celda ya está quitada: se pintaba
       directamente fuera, así que la rotura de la jugada que CIERRA la ronda no
       se veía nunca —y es justo la que remata—. Ahora el congelado espera a que
       la salida termine. No hay riesgo de tocar de más: `jugar()` ya rechaza
       todo lo que no esté en `jugando`. */
    var salida = motivo === 'completo' ? msSalida() : 0;
    luego(function () { if (C && C.estado === 'terminando') pintarJuego(); }, salida);
    var s = sonido();
    /* ⚠️ COMPLETAR EL RETO SE CELEBRA EN EL ACTO (titular, 2026-09-22: «en
       Cuenta y en Calco dispara las serpentinas de celebración tan pronto el
       user completa el reto, con sonido»). Son las MISMAS serpentinas y el
       mismo platillo de la revelación del veredicto —no un efecto nuevo—, así
       que el juego entero celebra de una sola manera. Antes sonaba la campana,
       que es la señal de SALIDA del 3-2-1: al final decía «empieza» en vez de
       «lo lograste».
       El confeti cuelga del MODAL y no del tablero: el recibo reemplaza el
       tablero entero a los 700 ms y se lo llevaría a mitad de la caída; en el
       modal sigue cayendo por encima de la pantalla que venga y se quita solo. */
    if (motivo === 'completo') {
      if (s && s.hay()) s.platillo();
      var modal = $('#m-partida'), v = window.ATWI.veredicto;
      if (modal && v && typeof v.confeti === 'function') v.confeti(modal, 'competencia');
    } else if (s && s.hay()) s.clac(0.3);
    if (C.P.enLinea) return terminarEnLinea(salida);
    /* En local el resumen lo calcula la misma lógica que el servidor va a
       correr después: si aquí saliera otra cosa, el servidor tendría razón. */
    var r = J().repetir(juegoActual(), C.semilla, C.nivel, C.lado, C.jugadas, C.ms);
    C.resumen = r.ok ? r.resumen : M().resumen(C.estadoJuego, C.ms);
    /* El recibo reemplaza la pantalla entera, así que si llega antes de que la
       última ficha acabe de irse se lleva la rotura igual que el congelado. Los
       700 de siempre cuando no hay nada que esperar; con salida, un respiro
       después de ella. */
    luego(pintarRecibo, Math.max(700, salida + 150));
  }

  function pintarRecibo() {
    if (!C) return;
    C.estado = 'recibo';
    var q = jugador(C.lado);
    var m = M();
    var quedan = Math.max(0, (m.reintentos || 0) - C.gastados);
    var ui = (J().ui || {})[juegoActual()];
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
    if (C.gastados >= (M().reintentos || 0)) return;
    C.gastados++;
    C.intento++;
    if (C.P.enLinea) return reintentarEnLinea();
    /* ⚠️ REINTENTAR ARRANCA EL JUEGO, NO VUELVE A LA PRESENTACIÓN (titular,
       2026-09-22: «el botón de reintento debe lanzar inmediatamente el juego
       sin pantalla previa de confirmación»). Volvía a «Comenzar ronda», o sea
       que pedía confirmar dos veces lo mismo: quien pulsa «Reintentar» ya
       decidió. La cuenta atrás se queda —no es una confirmación, es el 3-2-1
       que evita perder segundos que puntúan mirando aparecer el tablero—.
       MISMO TABLERO: la semilla es la de la ronda, no la del intento. */
    C.estado = 'presentacion';
    comenzar();
  }

  function enviar() {
    if (!C || C.estado !== 'recibo') return;
    if (C.P.enLinea) return confirmarEnLinea();
    C.hechas[C.lado][C.ronda - 1] = {
      lado: C.lado, ronda: C.ronda, jugadas: C.jugadas.slice(), ms: C.ms, intento: C.intento,
      resumen: C.resumen
    };
    guardarProgreso();
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
    cabecera(false);
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
            lista.push(f ? { marca: (J().juego(juegoDeRonda(r)) || M()).marca(f.resumen), resumen: f.resumen } : null);
          }
          return lista;
        };
        var v = J().veredicto(C.reparto, porLado('propone'), porLado('invitado'));
        entregar(filaDe(v));
      }, 900);
    }
    /* Por `pedirJuego`, que traduce un rechazo a `{error}`: sin él, la partida
       local se quedaba en «Comparando» para siempre ante cualquier hipo de red,
       que es el mismo cuelgue que el titular vio en línea. */
    pedirJuego('local', { debate: C.P.debate, version: J().VERSION_REGLAS, rondas: rondas })
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
      desglose: { juego: C.P.juego, juegos: C.reparto, rondas: C.rondas, como: v.como, marcador: v.marcador, filas: v.rondas },
      visto: null, visto_invitado: null, creado: new Date().toISOString()
    };
  }

  function entregar(fila) {
    borrarProgreso();
    var g = C.ganchos;
    cerrar();
    g.terminado(fila);
  }

  /* Algo no se pudo: se dice en la propia pantalla y se ofrece volver a
     intentar lo mismo. Las jugadas siguen en memoria: no se pierde nada.

     ⚠️ SALVO CUANDO REINTENTAR NO PUEDE FUNCIONAR (titular, 2026-09-21: mandó
     sus jugadas de Choque y le salió «No se pudo mandar · version_vieja» con un
     «Volver a intentar» que iba a fallar siempre). `version_vieja` es el
     servidor diciendo que este teléfono lleva el JS de antes de un cambio de
     reglas: reenviar manda exactamente la misma versión, así que el botón era
     un callejón con el código crudo por toda explicación. El camino EN LÍNEA ya
     lo contaba bien desde `empezar`; el LOCAL no, y son el mismo aviso. Se
     resuelve aquí, en el único sitio por el que pasan todos los fallos, y no
     llamador por llamador —que es la lista escrita a mano que este proyecto ya
     tiene anotada media docena de veces—. */
  function fallar(texto, otraVez) {
    if (!C) return;
    var recargar = texto === 'version_vieja' || /versión nueva/.test(texto);
    C.estado = 'fallo';
    C.otraVez = recargar ? function () { location.reload(); } : otraVez;
    caja().innerHTML =
      '<div class="sala sala--centrada jg jg--fallo">' +
        '<p class="jg-relevo__t">' + (recargar ? 'Hay una versión nueva' : 'No se pudo mandar') + '</p>' +
        '<p class="chico centrado jg-aviso">' + esc(recargar
          ? 'El juego se actualizó mientras jugabas. Recarga la app y vuelve a elegir: no se guardó nada de esta ronda.'
          : texto) + '</p>' +
      '</div>';
    pie().innerHTML = principal('otra-vez', recargar ? 'Recargar la app' : 'Volver a intentar');
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
      C.enviadasEnLinea = (e.mias || []).filter(function (r) { return r.estado === 'enviada'; });
      var enviadas = C.enviadasEnLinea.length;
      if (e.hay_resultado) {
        /* ⚠️ CON `.catch`: sin él, si `partida()` fallaba o colgaba la pantalla
           se quedaba en «Cargando» para siempre —lo vio el titular al reabrir una
           partida en línea terminada—. Y `resultado` se acepta como objeto o como
           array de uno, según cómo PostgREST resuelva la relación embebida. */
        return n.partida(C.P.debate).then(function (d) {
          if (!C) return;
          var res = d && d.resultado;
          if (Array.isArray(res)) res = res[0];
          if (res) return entregar(res);
          fallar('El resultado está, pero no se pudo leer.', seguirEnLinea);
        }).catch(function (err) {
          if (!C) return;
          fallar('No se pudo leer el resultado. ' + ((err && err.message) || ''), seguirEnLinea);
        });
      }
      if (enviadas >= C.rondas) { var g = C.ganchos; cerrar(); return g.esperar(elOtroLado(C.lados[0])); }
      C.ronda = enviadas + 1;
      C.gastados = 0;
      C.intento = 1;
      pintarPresentacion();
    }).catch(function (err) {
      if (!C) return;
      fallar('No se pudo leer el estado de la partida. ' + ((err && err.message) || ''), seguirEnLinea);
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
        /* ⚠️ EL JUEGO DE LA RONDA LO DICE EL SERVIDOR, aunque el cliente ya lo
           tenga en su reparto. Son la misma red que la versión: si los dos no
           coinciden, este teléfono pintaría un tablero y el servidor juzgaría
           otro, y eso solo se vería al rechazarle la ronda ya jugada. */
        if (r.juego) C.reparto[C.ronda - 1] = r.juego;
        if (!J().juego(juegoActual())) {
          return fallar('El juego «' + juegoActual() + '» no está en esta versión de la app: recarga.',
            function () { location.reload(); });
        }
        /* ⚠️ EL MISMO REPARTO QUE `comenzar()`, QUE AQUÍ FALTABA (titular,
           2026-09-21: «ui.pintar is not a function» al cargar Choque en línea).
           La rama local enruta por `deUnaVez` y `sinReloj`; ésta iba siempre a
           `cuentaAtras(jugarRonda)`, y `jugarRonda` pinta con `ui.pintar` —que
           un juego de selección como Choque no tiene: expone `ui.seleccion`—.
           Por eso Choque funcionaba en local y reventaba en línea. */
        if (M().deUnaVez) return montarSeleccion();
        if (M().sinReloj) {
          montarTablero(false);
          jugarRonda();
          if (C && C.transcurrido) C.t0 -= C.transcurrido;
          return;
        }
        cuentaAtras(function () {
          jugarRonda();
          if (C && C.transcurrido) C.t0 -= C.transcurrido;
        });
      }).catch(function (err) {
        if (!C) return;
        fallar('No se pudo pedir el tablero. ' + ((err && err.message) || ''),
          function () { pintarPresentacion(); });
      });
  }

  /* `salida` son los milisegundos que le quedan a la animación de la última
     jugada. La PETICIÓN sale igual de inmediata —el final de la ronda lo sella
     el servidor con lo que se le manda, no con lo que se pinta—; lo único que
     espera es el recibo, y solo lo que le falte a la salida. */
  function terminarEnLinea(salida) {
    var t0 = performance.now();
    nube().juego('terminar', { debate: C.P.debate, ronda: C.ronda, jugadas: C.jugadas, ms: C.ms })
      .then(function (r) {
        if (!C) return;
        if (!r || r.error) return fallar((r && r.error) || 'No se pudo entregar la ronda.', terminarEnLinea);
        C.resumen = r.resumen;
        C.intento = r.intento;
        luego(pintarRecibo, Math.max(0, (salida || 0) - (performance.now() - t0)));
      }).catch(function (err) {
        if (!C) return;
        fallar('No se pudo entregar la ronda. ' + ((err && err.message) || ''), terminarEnLinea);
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
        /* La ronda confirmada pasa a las previas: la siguiente agota con ella. */
        C.enviadasEnLinea = (C.enviadasEnLinea || []).concat([{ resumen: C.resumen, estado: 'enviada' }]);
        C.gastados = 0;
        C.intento = 1;
        if (C.ronda < C.rondas) { C.ronda++; return pintarPresentacion(); }
        var g = C.ganchos;
        cerrar();
        g.esperar(elOtroLado(C.lados[0]));
      }).catch(function (err) {
        /* ⚠️ SIN ESTE `.catch` EL BOTÓN «ENVIAR» SE QUEDABA APAGADO PARA SIEMPRE
           (lo vio el titular: «al enviar la segunda ronda uno de los jugadores se
           quedó así y no pasa nada»). `confirmar` en el servidor hace veredicto y
           POST a `resultados`, así que puede tardar o fallar; sin manejarlo, la
           promesa rechazada dejaba la pantalla en «Ronda completa» con el botón
           muerto. Se vuelve al recibo, desde donde se puede reintentar. */
        if (!C) return;
        C.estado = 'recibo';
        fallar('No se pudo confirmar. ' + ((err && err.message) || ''), pintarRecibo);
      });
  }

  /* En línea el tablero lo reparte el servidor, así que entre el toque y el
     3-2-1 hay un viaje. Lo que se ve mientras tanto es la presentación de la
     ronda —no hay otro sitio donde esperar— pero SIN ofrecer confirmar nada:
     el botón dice lo que está pasando. */
  function reintentarEnLinea() {
    C.estado = 'presentacion';
    pintarPresentacion();
    var b = $('#m-partida [data-jg]');
    if (b) { b.disabled = true; b.textContent = 'Preparando…'; }
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
