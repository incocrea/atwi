/* ==========================================================================
   ATWI · app.js
   El caparazón del juego: navegación entre vistas, pintado de cada pantalla y
   el flujo de proponer un debate.

   Dos reglas de producto que este archivo hace cumplir y que no son negociables
   (docs/02-modos-y-catalogo.md):
     1. El modo NO se impone: quien crea el debate lo PROPONE y el invitado lo
        acepta o pide el otro. La interfaz nunca dice «empezar», dice «proponer».
     2. En ningún texto se promete que un tema quede superado ni que un conflicto
        quede resuelto. Hay una lista de palabras prohibidas en §9.4.7.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.ATWI.config;
  var datos = window.ATWI.datos;
  var icono = window.ATWI.icono;
  var iconoSVG = window.ATWI.iconoSVG;   // a la fuerza el de línea
  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  var $$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }


  /* El nombre del modo con el «IA» resaltado: negoc·IA·ción, controvers·IA. */
  function nombreModo(clave) {
    var m = cfg.modos[clave];
    if (!m) return '';
    return esc(m.partido[0]) + '<b class="ia">' + esc(m.partido[1]) + '</b>' + esc(m.partido[2]);
  }

  function modoLlano(clave) { return (cfg.modos[clave] || {}).nombre || ''; }

  /* El nombre del modo DIBUJADO: no es el nombre en negrita, es una pieza de
     arte con su placa y sus adornos, de la misma mano que los iconos. Se usa
     donde el nombre es el titular —la carta del home y su explicación—; en
     sitios pequeños sigue mandando el texto, que a ese tamaño se lee mejor. */
  function rotuloModo(clave, clase) {
    return '<img class="' + clase + '" src="../assets/img/rotulos/' + clave + '.png" ' +
           'alt="' + esc(modoLlano(clave)) + '" decoding="async">';
  }
  /* La sala también lo pinta, y no tiene por qué saber dónde viven los PNG. */
  window.ATWI.rotuloModo = rotuloModo;

  /* ======================================================================
     Navegación entre vistas
     ====================================================================== */
  var VISTAS = ['jugar', 'catalogo', 'historial', 'perfil'];
  var vistaActual = 'jugar';

  function irA(nombre) {
    if (VISTAS.indexOf(nombre) === -1) return;
    /* AL ENTRAR AL CATÁLOGO SE BARAJA, y solo al entrar. Rebarajar en cada
       pintada dejaría la lista saltando mientras se escribe en el buscador o se
       toca un filtro, que es lo contrario de poder elegir. */
    if (nombre === 'catalogo' && vistaActual !== 'catalogo') barajar();
    /* Salir de la portada cuesta una entrada de historial: así el atrás del
       teléfono devuelve a la portada en vez de cerrar la app. Saltar entre las
       otras pestañas no apila más, porque desde cualquiera de ellas el atrás
       lleva al mismo sitio. */
    if (vistaActual === 'jugar' && nombre !== 'jugar') entrar();
    vistaActual = nombre;
    $$('.vista').forEach(function (v) {
      if (v.id === 'v-' + nombre) v.setAttribute('data-activa', '');
      else v.removeAttribute('data-activa');
    });
    $$('.barra-item').forEach(function (b) {
      if (b.dataset.vista === nombre) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    var v = $('#v-' + nombre);
    if (v) v.scrollTop = 0;
    /* Cada pantalla inunda el marco con su color. */
    var marco = $('.marco');
    if (marco) marco.setAttribute('data-ctx', nombre);
    refrescarFichaCabecera();
    pintar(nombre);
  }

  /* El atajo al perfil vive en la cabecera, al lado del buzón, y SALE EN TODAS
     LAS VISTAS menos en el propio Perfil, donde no tendría a dónde llevar.
     Hasta el 2026-09-17 se escondía también en Jugar, porque allí la ficha
     grande del saludo hacía de atajo; con el saludo reducido a un título
     centrado (decisión del titular) ese atajo ya no existe, y además la ficha
     de la cabecera es la que se ve en el resto del juego: dejarla fuera justo
     en la portada la convertía en un elemento que aparece y desaparece. */
  /* EL DISCO DEL PROBADOR SE ENCIENDE AQUÍ, y no en el HTML, porque el HTML no
     sabe quién entró: `puedeProbar()` mira el correo de la sesión o el modo de
     pruebas, y las dos cosas pueden cambiar sin recargar la página. Va pegado
     al refresco de la ficha porque es la misma pregunta —qué enseña la
     cabecera a ESTA persona— hecha sobre dos piezas. */
  function refrescarProbadorCabecera() {
    var b = $('.ayuda-cabecera--probar');
    if (b) b.hidden = !puedeProbar();
  }

  function refrescarFichaCabecera() {
    refrescarProbadorCabecera();
    var b = $('#ficha-cabecera');
    if (!b) return;
    var p = datos.perfil();
    b.hidden = vistaActual === 'perfil';
    /* CON SU COLOR. Antes daba igual --el color era un aro y esta cara va sin
       aro-- pero ahora el color ES el dibujo: sin pasarlo, quien juega de
       amarillo se ve de azul en su propia cabecera. */
    b.innerHTML = window.ATWI.fichaHTML(p.avatar, 'avatar--cabecera-cara', p.avatarBorde);
  }

  /* ======================================================================
     EL ATRÁS DEL TELÉFONO
     Instalada como PWA, el botón atrás de Android sacaba de la app de golpe,
     tuviera lo que tuviera abierto: un modal a pantalla completa, el catálogo
     dentro de una categoría o una partida a medias. Es la queja más razonable
     que puede tener alguien con un juego instalado.

     Cómo se arregla: cada vez que se abre algo se mete una entrada en el
     historial, y cuando el teléfono va atrás se deshace UN nivel. La cuenta la
     lleva `profundidad`; si llega a cero, ya no hay a dónde volver y el atrás
     sale de la app, que es lo que la gente espera en la portada.

     `retroceder()` no reimplementa nada: pulsa el mismo control de salida que
     ya hay en pantalla. Así el atrás del teléfono hace EXACTAMENTE lo mismo que
     el aspa, incluida la pregunta de «¿seguro que sales de la partida?».
     ====================================================================== */
  var pilaModales = [];
  var profundidad = 0;      // entradas de historial nuestras, sin consumir
  var restaurando = false;  // dentro de retroceder(): no se apila nada

  function apilarPaso() {
    profundidad++;
    try { history.pushState({ atwi: profundidad }, ''); } catch (e) { /* file:// */ }
  }

  function entrar() {
    if (restaurando) return;
    apilarPaso();
  }

  /** Deshace un nivel. Devuelve false si ya no quedaba nada que deshacer. */
  function retroceder() {
    restaurando = true;
    var hecho = true;
    /* LA REVELACIÓN SE RECONOCE POR SU CAJA, no por un botón suyo. Aquí se
       buscaba `[data-accion="ver-desglose"]`, que dejó de existir al partir el
       resultado en dos pantallas, así que el atrás no encontraba nada, seguía
       de largo y acababa saliéndose de `/app/`: se volvía sin `?local=1`, o sea
       a la puerta, y parecía que la app te echaba después de probar un
       resultado. Un selector que nombra un botón concreto se rompe en silencio
       cada vez que ese botón cambia de nombre; la caja no cambia. */
    var revelacion = $('.revelacion:not([hidden])');
    var sala = $('#m-partida');

    /* ⚠️ EL GLOBO SE CIERRA ANTES QUE NADA (titular, 2026-09-18: «si hay un
       globo informativo abierto, el back del navegador debe cerrarlo, es decir
       cuenta como history para el browser»). Va el primero porque es lo último
       que se abrió: con el atrás cerrando la pantalla de debajo, el globo se
       quedaba flotando sobre otra cosa —vive fuera de la vista, así que un
       cambio de pantalla no se lo lleva—. */
    if (globoAbierto) {
      globoEnHistoria = false;
      quitarGlobo();
    } else if (revelacion) {
      /* Atrás hace lo mismo que «Salir»: la partida ya está guardada. */
      window.ATWI.veredicto.alAtras();
    } else if (sala && !sala.hidden) {
      $('#m-partida [data-accion="p-salir"]').click();
      /* Si dice que no quiere salir, se le devuelve su entrada: la partida
         sigue abierta y el siguiente atrás tiene que volver a preguntar. */
      if (!sala.hidden) apilarPaso();
    } else if (pilaModales.length) {
      ocultarModal(pilaModales[pilaModales.length - 1]);
    } else if (vistaActual === 'catalogo' && categoriaAbierta) {
      categoriaAbierta = null; pintarCatalogo();
    } else if (vistaActual !== 'jugar') {
      irA('jugar');
    } else {
      hecho = false;
    }

    restaurando = false;
    return hecho;
  }

  window.addEventListener('popstate', function () {
    if (profundidad > 0) profundidad--;
    if (!retroceder() && profundidad > 0) {
      /* Quedaban entradas de más —pasa al abrir la sala, que cierra tres
         modales de una vez—. Se consumen solas en vez de tragarse un toque. */
      history.back();
    }
  });

  /* ======================================================================
     Modales a pantalla completa
     ====================================================================== */
  function abrirModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    pilaModales.push(id);
    /* EL ÚLTIMO EN ABRIRSE ES EL QUE SE VE. Sin esto mandaba el orden del HTML,
       y como `m-preparar` está escrito después que `m-perfil`, la ficha del
       invitado se abría DETRÁS de «Antes de empezar»: respondía a los toques
       pero no se veía. El orden de apilado lo decide quien abre, no el archivo. */
    m.style.zIndex = 40 + pilaModales.length;
    var foco = $('.modal__cuerpo', m) || m;
    foco.scrollTop = 0;
    entrar();
  }

  /** Cierra de verdad. Solo lo llama retroceder(), que es quien manda. */
  function ocultarModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = true;
    m.style.zIndex = '';
    pilaModales = pilaModales.filter(function (x) { return x !== id; });
  }

  /**
   * Cerrar DESDE LA INTERFAZ. No oculta: va atrás en el historial, y es el
   * popstate el que cierra. Si no pasara por aquí, la cuenta de entradas se
   * desajustaría y el atrás del teléfono empezaría a tragarse toques.
   */
  function cerrarModal(id) {
    var objetivo = id || pilaModales[pilaModales.length - 1];
    if (!objetivo) return;
    if (profundidad > 0) history.back();
    else ocultarModal(objetivo);
  }

  /** Cierra varios de golpe, como al entrar a la sala. */
  function cerrarModales(ids) {
    ids.forEach(ocultarModal);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pilaModales.length) cerrarModal();
  });

  /* ======================================================================
     Vista: Jugar
     ====================================================================== */
  /* --- Lo que espera a quien entra ------------------------------------------
     ESTO ESTABA EN LA PORTADA Y SE FUE AL BUZÓN (decisión del titular,
     2026-09-15). Era una tarjeta grande encima del selector de modo que decía
     «Tu resultado está listo», y tenía dos problemas: se comía el sitio de lo
     que la pantalla viene a ofrecer —elegir modo y jugar— y duplicaba en la
     portada algo que ya tiene su sitio, que es la campana.

     Ahora la campana late cuando hay algo, y al abrirla está esto arriba.
     **No se borró el aviso: se mudó.** Quitarlo sin más habría dejado un
     resultado sin ver sin ninguna forma de enterarse, porque estos tres estados
     NO están en la tabla `avisos` —los calcula el cliente mirando el historial—
     y el buzón solo leía esa tabla. */
  var LO_QUE_ESPERA = {
    'sin-ver':         ['Tu resultado está listo', 'premio', 'Tocá para verlo'],
    'falta-veredicto': ['Falta el resultado', 'curso', 'Tocá para pedirlo otra vez'],
    'falta-acuerdo':   ['Falta cerrar la negociación', 'curso', 'Tocá para elegir y firmar'],
    'en-curso':        ['Partida sin terminar', 'curso', '']
  };

  /** Las partidas que piden algo, en orden de prisa. */
  function partidasQueEsperan() {
    var lista = historial || [];
    var fuera = [];
    ['sin-ver', 'falta-veredicto', 'falta-acuerdo', 'en-curso'].forEach(function (e) {
      /* Solo las que me esperan A MÍ: una en línea donde le toca al otro no
         pide nada de mí, y contarla enseñaría a ignorar la campana. */
      lista.forEach(function (d) { if (estadoDe(d) === e && meEspera(d)) fuera.push(d); });
    });
    return fuera;
  }

  /* ======================================================================
     EL MODO EN LÍNEA (decisiones del titular, 2026-09-18; migración 0055)
     ======================================================================
     Lo que la app hace de más cuando la partida es de dos teléfonos:
       · la INVITACIÓN sale desde «Antes de empezar» y es una propuesta que
         espera en el servidor con el correo del otro;
       · el BUZÓN enseña las invitaciones que me esperan, y aceptar es elegir
         con qué ficha —la del perfil, salvo que choque con la del host—;
       · la app PREGUNTA por novedades cada medio minuto y al volver a primer
         plano (`novedades()`: una llamada barata), y con eso refresca el
         historial, la campana, las vidas y la sala si estoy esperando. Sin
         push: no hay servidor de notificaciones y el titular pidió que el
         aviso empiece dentro de la app.
     ---------------------------------------------------------------------- */
  var invitaciones = [];          // lo último que trajo el buzón o el sondeo
  var ultimaNovedad = null;       // marca `ahora` del último sondeo
  var aceptando = null;           // {debate, host} mientras se elige ficha para aceptar

  function pintarVidas(n) {
    var e = $('#dato-vidas');
    if (e && n != null) e.textContent = String(n);
  }

  /** «¿Hay algo nuevo para mí?» Una llamada; lo que traiga decide qué repintar. */
  function sondear() {
    var n = window.ATWI.nube;
    if (!n || !n.hay || !n.hay() || !n.novedades) return;
    n.novedades(ultimaNovedad).then(function (r) {
      if (!r) return;
      var primera = !ultimaNovedad;
      ultimaNovedad = r.ahora || ultimaNovedad;
      pintarVidas(r.vidas);
      var tocadas = r.partidas_tocadas || [];
      var cambioInv = Number(r.invitaciones || 0) !== invitaciones.length;
      if (!primera && (tocadas.length || cambioInv || Number(r.avisos_nuevos || 0) > 0)) {
        /* El historial caduca —se repinta con lo viejo mientras llega lo
           nuevo— y la sala, si está esperando, se entera por su cuenta. */
        historialCaducado = true;
        if (vistaActual === 'historial') pintarHistorial();
        tocadas.forEach(function (id) {
          if (window.ATWI.partida && window.ATWI.partida.tocada) window.ATWI.partida.tocada(id);
        });
      }
      if (cambioInv) {
        n.invitaciones().then(function (l) { invitaciones = l || []; refrescarPunto(); });
      } else if (Number(r.avisos_nuevos || 0) > 0) {
        refrescarPunto();
      }
    });
  }

  function arrancarSondeo() {
    if (!window.ATWI.nube || !window.ATWI.nube.hay || !window.ATWI.nube.hay()) return;
    sondear();
    window.ATWI.nube.invitaciones().then(function (l) { invitaciones = l || []; refrescarPunto(); });
    setInterval(function () { if (!document.hidden) sondear(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sondear(); });
  }

  /* --- Enviar vidas a otro apodo ---------------------------------------- */
  function abrirEnviarVidas(disparador) {
    var cuerpo =
      '<div class="correo-editor">' +
        '<input class="campo" id="v-apodo" type="text" maxlength="' + datos.NOMBRE_MAX + '" ' +
          'autocomplete="off" spellcheck="false" placeholder="Apodo de quien las recibe">' +
        '<input class="campo" id="v-cuantas" type="number" inputmode="numeric" min="1" step="1" ' +
          'placeholder="Cuántas" style="margin-top:var(--e-2)">' +
        '<p class="chico tenue">Salen de las tuyas y le llegan al instante. Tienes ' +
          esc(($('#dato-vidas') || {}).textContent || '') + '.</p>' +
        '<p class="chico" id="v-error" style="color:var(--peligro)"></p>' +
      '</div>';
    abrirGlobo(disparador, { titulo: 'Enviar vidas' },
      { tinte: 'lavanda', signo: 'corazon', signoTam: 64, etiqueta: 'Enviar vidas', cuerpo: cuerpo,
        acciones: '<button class="boton boton--bloque" data-accion="enviar-vidas-ya">Enviar</button>' });
    setTimeout(function () { var n = $('#v-apodo'); if (n) n.focus(); }, 60);
  }

  function enviarVidasYa() {
    var apodo = ($('#v-apodo').value || '').trim();
    var n = Number($('#v-cuantas').value);
    var err = $('#v-error');
    if (!apodo) { err.textContent = 'Escribe el apodo.'; return; }
    if (!(n >= 1) || n !== Math.floor(n)) { err.textContent = 'Escribe cuántas, un número entero.'; return; }
    var b = $('[data-accion="enviar-vidas-ya"]');
    if (b) b.disabled = true;
    window.ATWI.nube.enviarVidas(apodo, n).then(function (quedan) {
      cerrarGlobo();
      pintarVidas(quedan);
      var pv = $('#perfil-vidas');
      if (pv) pv.textContent = String(quedan);
      if (window.ATWI.aviso) window.ATWI.aviso('Le mandaste ' + n + (n === 1 ? ' vida' : ' vidas') + ' a ' + apodo + '. Te quedan ' + quedan + '.');
    }).catch(function (e) {
      if (b) b.disabled = false;
      var m = String(e && e.message || '');
      err.textContent = m === 'sin_vidas' ? 'No tienes tantas.'
        : /apodo/.test(m) ? 'No hay nadie con ese apodo.'
        : /a ti/.test(m) ? 'Ese apodo es el tuyo.'
        : 'No se pudo enviar: ' + (m || 'inténtalo otra vez');
    });
  }

  /* --- La propuesta que espera: se mira y, si hace falta, se retira --------- */
  function abrirPropuesta(d) {
    var tarjeta = $('#v-historial [data-partida="' + d.id + '"]');
    var caduca = d.invitacion_caduca ? new Date(d.invitacion_caduca) : null;
    var texto = 'Le propusiste a <b>' + esc(d.invitado_correo || 'alguien') + '</b> jugar ' +
      '<b>«' + esc(d.enunciado) + '»</b>. Lo verá en su buzón al entrar con ese correo' +
      (caduca && !isNaN(caduca.getTime())
        ? ', y la invitación vale hasta ' + esc(cuandoCaduca(caduca)) + '.'
        : '.') +
      (d.modo === 'competencia' ? '' : ' Si la retiras, tu vida vuelve.');
    abrirGlobo(tarjeta || $('#v-historial'),
      { titulo: 'Esperando respuesta' },
      { tinte: d.modo, signo: 'buzon', signoTam: 64, etiqueta: 'Invitación pendiente',
        cuerpo: '<p class="globo__texto">' + texto + '</p>',
        acciones:
          '<button class="boton boton--suave boton--bloque boton--punteado" data-cerrar-globo>Dejarla</button>' +
          '<button class="boton boton--suave boton--bloque boton--borrar" data-retirar-inv="' + esc(d.id) + '">Retirar invitación</button>' });
  }

  function cuandoCaduca(f) {
    var hh = ('0' + f.getHours()).slice(-2) + ':' + ('0' + f.getMinutes()).slice(-2);
    var hoy = new Date();
    if (f.toDateString() === hoy.toDateString()) return 'hoy a las ' + hh;
    var man = new Date(hoy.getTime() + 86400000);
    if (f.toDateString() === man.toDateString()) return 'mañana a las ' + hh;
    return 'el ' + f.getDate() + '/' + (f.getMonth() + 1) + ' a las ' + hh;
  }

  function retirarInvitacion(id) {
    cerrarGlobo();
    window.ATWI.nube.rechazarInvitacion(id).then(function () {
      historial = (historial || []).filter(function (x) { return x.id !== id; });
      historialCaducado = true;
      if (vistaActual === 'historial') pintarHistorial();
      sondear();
      if (window.ATWI.aviso) window.ATWI.aviso('Invitación retirada.');
    }).catch(function (e) {
      if (window.ATWI.aviso) window.ATWI.aviso('No se pudo retirar: ' + (e.message || e));
    });
  }

  /* --- Las invitaciones que me esperan, en el buzón --------------------------- */
  function tarjetaDeInvitacion(d) {
    var m = cfg.modos[d.modo] || {};
    var turnos = d.turnos || cfg.reglas.turnosPorDefecto;
    return '<div class="tarjeta invitacion" data-modo="' + esc(d.modo) + '">' +
        '<span class="invitacion__eti">Te invitan a jugar</span>' +
        '<span class="invitacion__quien">' +
          window.ATWI.fichaHTML(d.propone_avatar || 'kai', 'jugaron__cara', d.propone_color) +
          '<b>' + esc(d.propone_nombre || 'Alguien') + '</b> · ' + esc(m.nombre || d.modo) +
          ' · ' + turnos + (turnos === 1 ? ' turno' : ' turnos') + ' cada uno' +
        '</span>' +
        '<span class="invitacion__tema">' + esc(d.enunciado || '') + '</span>' +
        '<span class="invitacion__botones">' +
          '<button class="boton boton--suave boton--punteado" data-rechazar-inv="' + esc(d.id) + '">No, gracias</button>' +
          '<button class="boton boton--' + esc(d.modo) + '" data-aceptar-inv="' + esc(d.id) + '">Aceptar</button>' +
        '</span>' +
      '</div>';
  }

  /**
   * Aceptar es entrar con MI ficha. La base aplica la regla del personaje
   * —distinto del host; en QuiénGane el mismo vale y lo que no puede coincidir
   * es el color— y si choca contesta `mismo_personaje` o `mismo_color`: ahí se
   * abre la ficha, con lo del host apartado, SOLO PARA ESTA PARTIDA; el perfil
   * no cambia.
   */
  function aceptarInvitacion(id, avatar, color) {
    var d = invitaciones.filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var p = datos.perfil();
    var n = window.ATWI.nube;
    n.aceptarInvitacion(id, avatar || p.avatar, color || p.avatarBorde).then(function (fila) {
      invitaciones = invitaciones.filter(function (x) { return x.id !== id; });
      cerrarGlobo();
      cerrarModales(['m-buzon']);
      historialCaducado = true;
      refrescarPunto();
      sondear();
      /* Derecho a la sala: el sorteo se revela y, si abro yo, se graba. */
      if (fila && fila.id) {
        historial = (historial || []).filter(function (x) { return x.id !== fila.id; }).concat([fila]);
        fila.turnos_grabados = fila.turnos_grabados || [];
        volverTrasLaPartida = vistaActual;
        window.ATWI.partida.enLinea(fila);
      }
    }).catch(function (e) {
      var clave = String(e && e.message || '');
      if (clave === 'mismo_personaje' || clave === 'mismo_color') {
        aceptando = { debate: id, host: d.propone_avatar, hostColor: d.propone_color,
                      soloColor: clave === 'mismo_color' };
        return abrirFichaParaAceptar($('[data-aceptar-inv="' + id + '"]'));
      }
      if (window.ATWI.aviso) {
        window.ATWI.aviso(clave === 'invitacion_caducada'
          ? 'Esa invitación ya caducó.'
          : 'No se pudo aceptar: ' + (e.pista || clave || 'inténtalo otra vez'));
      }
    });
  }

  function rechazarInvitacion(id) {
    window.ATWI.nube.rechazarInvitacion(id).then(function () {
      invitaciones = invitaciones.filter(function (x) { return x.id !== id; });
      refrescarPunto();
      abrirBuzon();
    }).catch(function (e) {
      if (window.ATWI.aviso) window.ATWI.aviso('No se pudo rechazar: ' + (e.message || e));
    });
  }

  /* La ficha para ESTA partida: la de siempre, con lo del host en gris. */
  function abrirFichaParaAceptar(disparador) {
    var p = datos.perfil();
    editandoFicha = 'aceptar';
    var soloColor = aceptando.soloColor;
    personajeElegido = p.avatar;
    colorElegido = window.ATWI.elColor(p.avatarBorde);
    if (!soloColor && personajeElegido === aceptando.host) personajeElegido = window.ATWI.otroPersonaje(aceptando.host);
    if (soloColor && colorElegido === window.ATWI.elColor(aceptando.hostColor)) {
      var libres = window.ATWI.colores().filter(function (c) { return c.clave !== colorElegido; });
      if (libres.length) colorElegido = libres[0].clave;
    }
    var cuerpo =
      '<div class="ficha-editor">' +
        '<div class="ficha-editor__cara" id="f-cara">' + caraGrande() + '</div>' +
        '<div class="caras-fila" role="group" aria-label="Personaje">' +
          window.ATWI.quienes().map(function (q) {
            var tomada = !soloColor && q.clave === aceptando.host;
            return '<button type="button" class="caras-fila__cara' +
              (tomada ? ' caras-fila__cara--tomada' : '') + '"' +
              ' data-personaje="' + q.clave + '"' + (tomada ? ' disabled' : '') +
              ' aria-pressed="' + (q.clave === personajeElegido) + '"' +
              ' aria-label="' + esc(q.nombre) + '" title="' + esc(q.nombre) + '"' +
              ' style="--pj:' + window.ATWI.colorPersonaje(colorElegido) + '">' +
              window.ATWI.fichaHTML(q.clave, 'caras-fila__f', colorElegido) +
            '</button>';
          }).join('') +
        '</div>' +
        '<div class="colores">' +
          window.ATWI.colores().map(function (c) {
            return '<button class="color" data-color="' + c.clave + '"' +
              (c.clave === colorElegido ? ' aria-pressed="true"' : '') +
              ' aria-label="' + esc(c.nombre) + '">' +
              '<i style="background:' + c.tono + '"></i></button>';
          }).join('') +
        '</div>' +
        '<p class="chico aviso-aro">' + (soloColor
          ? 'Los dos van con el mismo personaje y el mismo color. Elige otro color solo para esta partida.'
          : 'Ese personaje ya lo lleva quien te invita. Elige otro solo para esta partida: tu ficha no cambia.') +
        '</p>' +
        '<p class="chico" id="f-error" style="color:var(--peligro)"></p>' +
      '</div>';
    var dInv = invitaciones.filter(function (x) { return x.id === aceptando.debate; })[0];
    var tinte = dInv && dInv.modo || 'lavanda';
    abrirGlobo(disparador || $('#m-buzon .modal__cuerpo'), { titulo: 'Para esta partida' },
      { tinte: tinte, signo: 'lapiz', signoTam: 64, etiqueta: 'Tu ficha en esta partida', cuerpo: cuerpo,
        acciones: '<button class="boton boton--bloque' + (tinte === 'lavanda' ? '' : ' boton--' + tinte) +
                  '" data-accion="guardar-ficha">Aceptar y entrar</button>' });
  }

  function filaQueEspera(d) {
    var e = estadoDe(d);
    var q = LO_QUE_ESPERA[e] || ['', 'curso', ''];
    var pie = e === 'en-curso'
      ? (d.turnos_grabados || []).length + ' de ' + ((d.turnos || 3) * 2) +
        ' intervenciones · tocá para seguir'
      : q[2];
    return '<button class="tarjeta aviso-veredicto" data-tono="' + q[1] + '" ' +
        'data-partida="' + esc(d.id) + '">' +
        '<span class="aviso-veredicto__eti">' + esc(q[0]) + '</span>' +
        '<span class="aviso-veredicto__tema">' + esc(d.enunciado || 'Sin tema') + '</span>' +
        quienesJugaron(d) +
        '<span class="chico suave">' + esc(pie) + '</span>' +
      '</button>';
  }

  function pintarJugar() {
    var p = datos.perfil();
    var caja = $('#v-jugar');

    caja.innerHTML =
      /* EL SALUDO ES UN TÍTULO, NO UNA FICHA (titular, 2026-09-17). Ocupaba el
         primer tercio de la portada con la ficha grande, el nivel y la barra de
         progreso, y encima competía con las tres cartas, que son lo que de
         verdad se viene a elegir. Ahora es el mismo título centrado que usan el
         catálogo y las mesas —misma clase, mismo sitio— y el atajo al perfil es
         la ficha de la cabecera, como en el resto del juego.
         EL NIVEL SE OCULTA, NO SE BORRA: los puntos todavía no significan nada
         para quien juega, así que anunciarlos es prometer un sistema que no
         existe. El bloque `.saludo` sigue en `app.css` esperándolo. */
      tituloVista((p.nombre ? '¡Hola, ' + esc(p.nombre) + '!' : '¡Hola!'),
                  'margin-bottom:var(--e-4)') +

      /* EL VEREDICTO QUE TE ESTÁ ESPERANDO, delante de todo. Quien cerró la app
         mientras el juez leía no tiene por qué acordarse de ir al historial a
         buscarlo: si hay un resultado sin ver, lo primero que ve al entrar es
         que está ahí, y un toque lo abre con la ceremonia entera.
         MIENTRAS NO HAYA AVISO QUE LLEGUE DE FUERA, ÉSTA ES LA NOTIFICACIÓN.
         El titular eligió empezar solo por dentro de la app (2026-09-15), así
         que este es el único sitio donde eso se anuncia. */

      /* EL MODO SE ELIGE AQUÍ, AL PRINCIPIO. Antes se elegía al final, justo
         antes de grabar, después de haber buscado el tema: para entonces ya
         tenías medio pie dentro y la elección llegaba como un trámite. Y la
         explicación de cada modo vivía en otra tarjeta, de adorno, que nadie
         relacionaba con el botón. Ahora es una sola cosa: la tarjeta explica y
         la tarjeta empieza. */
      /* SIN TÍTULO ENCIMA (titular, 2026-09-16). Decía «Selecciona el modo» y
         es lo único que hay en esa parte de la portada: tres cartas grandes,
         cada una con su nombre dibujado y un botón de ayuda. Un rótulo que
         describe lo que ya se ve gasta el alto que necesitan las cartas. */
      /* Y NADA DEBAJO (titular, 2026-09-17). Aquí iba el botón del PROBADOR con
         su título «Solo para vos», y se fue a la cabecera: dos piezas de
         interfaz para una puerta de servicio, y encima ocupando el alto que
         ahora se reparten las tres cartas. Ver `.ayuda-cabecera--probar`. */
      '<div class="cartas-modo">' +
        cartaModo('debate') +
        cartaModo('negociacion') +
        cartaModo('competencia') +
      '</div>';
  }

  /* ========================================================================
     EL PROBADOR DE RESULTADOS
     Arma la escena del veredicto a mano y la reproduce: modo, cómo termina,
     qué juez la presenta y las dos fichas con su nombre, su personaje y su
     color. Existe para poder mirar la pantalla del resultado sin jugar una
     partida entera ni gastar un veredicto de verdad, que cuesta 0,19 USD y
     ochenta segundos.

     LO QUE SE ELIGE ES LA ESCENA; EL TEXTO SIGUE SIENDO DE MENTIRA. Las
     justificaciones, los números de la rúbrica y el acuerdo son fijos y salen
     de la partida de prueba que ya se juzgó (eccb39ff), así que son plausibles
     y no redondos. Lo que se prueba aquí es el ENCUADRE —dónde cae cada figura,
     qué tapa qué, cómo queda un nombre largo— y para eso el texto da igual con
     tal de que tenga el largo de uno real.

     QUIÉN LO VE: la cuenta del titular, por correo, y el modo de pruebas. Lo
     segundo no es una puerta abierta —`dePruebas()` exige localhost ADEMÁS de
     `?local=1`, así que en atwi.app no existe— y hace falta: en local no hay
     sesión, o sea que no hay correo que comparar, y sin esto el probador sería
     invisible justo donde se prueba.
     ======================================================================== */
  var SUPER_ADMIN = 'leoncitobravo2013@gmail.com';

  function puedeProbar() {
    var ent = window.ATWI.entrada;
    if (ent && ent.dePruebas && ent.dePruebas()) return true;
    var correo = window.ATWI.auth ? window.ATWI.auth.correo() : '';
    return String(correo).trim().toLowerCase() === SUPER_ADMIN;
  }

  /* LOS FINALES POSIBLES, por modo. No es una lista de adorno: es la lista
     REAL de lo que el árbitro puede devolver, y por eso Controversia tiene
     cuatro y Negociación dos. El día que aparezca un final nuevo se agrega
     aquí y el probador ya sabe reproducirlo. */
  var FINALES = {
    debate: [
      { clave: 'gana-1', nombre: 'Gana el de la izquierda' },
      { clave: 'gana-2', nombre: 'Gana el de la derecha' },
      { clave: 'empate', nombre: 'Empate' },
      /* LAS DOS PARADAS SON PANTALLAS DISTINTAS y hasta hoy solo se podia mirar
         una. La blanda es asimetria --la ronda no tuvo partido-- y lleva su
         reporte; la dura es senal de seguridad y no lleva NINGUN registro. */
      { clave: 'parada', nombre: 'Para: no hubo partido' },
      { clave: 'parada-dura', nombre: 'Para por seguridad' }
    ],
    /* NEGOCIACIÓN TIENE DOS FINALES Y NO TRES. Hubo un «Sin mediador (hoy)»
       aquí —descuido de cuando Negociación no tenía más final que ése— y
       después la pantalla a la que llevaba, «Ronda guardada», se quitó entera
       (decisión del titular, 2026-09-15): una llamada que no contesta no
       termina la partida, la deja esperando. Los finales de un modo son los
       desenlaces que la pareja puede alcanzar; una avería no es uno. */
    negociacion: [
      { clave: 'acuerdo', nombre: 'Con acuerdo' },
      { clave: 'sin-acuerdo', nombre: 'Sin acuerdo' }
    ]
  };

  /* EL ÚLTIMO SET SE RECUERDA, Y SOBREVIVE AL REFRESCO (decisión del titular,
     2026-09-14). Ajustar un encuadre es cambiar una cosa, mirar, recargar para
     ver el CSS nuevo y volver a mirar: si al recargar se pierden el juez, los
     dos personajes y el final elegidos, cada vuelta cuesta ocho toques de
     rearmar la escena, y el trabajo pasa a ser rearmarla. */
  var CLAVE_PROBADOR = 'atwi.probador.v1';
  /* QUÉ CONTESTA EL MODELO, que es otra cosa que «cómo termina». «Cómo termina»
     es la escena del final; esto es lo que devuelve la llamada, y de ello salen
     caminos que la pareja recorre de otra manera. Solo lo usa el ensayo, que
     arranca en el instante en que se mandó la última intervención (petición del
     titular, 2026-09-15).

     CADA MODO TIENE SU LISTA porque no contestan lo mismo: el árbitro puntúa y
     el mediador propone. Lo único que comparten es poder pararse por seguridad
     y poder no contestar, que son los dos fallos del sistema y no del juego. */
  var CONTESTA = {
    debate: [
      { clave: 'gana', nombre: 'Gana uno' },
      { clave: 'empate', nombre: 'Empate' },
      { clave: 'parada', nombre: 'Para: no hubo partido' },
      { clave: 'parada-dura', nombre: 'Para por seguridad' },
      { clave: 'no-contesta', nombre: 'No llega respuesta' }
    ],
    negociacion: [
      { clave: 'dos', nombre: 'Propone dos acuerdos' },
      { clave: 'sin-propuestas', nombre: 'No encuentra ninguno' },
      { clave: 'parada', nombre: 'Para por seguridad' },
      { clave: 'no-contesta', nombre: 'No llega respuesta' }
    ]
  };

  var probador = null;

  function probadorDeFabrica() {
    var p = datos.perfil();
    return {
      modo: 'debate',
      final: 'gana-2',
      contesta: { debate: 'gana', negociacion: 'dos' },
      juez: juezPorDefecto(),
      publico: 'pareja',
      uno: { nombre: p.nombre || 'Tú', avatar: p.avatar || 'kai',
             color: window.ATWI.elColor(p.avatarBorde) },
      dos: { nombre: 'Diana', avatar: distintoDeMi(p.avatar), color: 'verde' }
    };
  }

  /* LO GUARDADO NO SE CREE, SE REVISA CAMPO A CAMPO. Lo que hay en
     `localStorage` puede ser de una versión anterior: un personaje que se
     renombró, un juez que no existe, o —el más fácil de provocar— un `final`
     que era de Controversia guardado junto a un `modo` que ahora es Negociación.
     Cualquiera de esos deja la pantalla a medio pintar o revienta al reproducir,
     y el fallo aparecería días después sin nada que lo relacione con esto. Cada
     campo que no se reconozca cae en el de fábrica, que siempre es válido. */
  function enLista(lista, valor, porDefecto) {
    return lista.some(function (x) { return x.clave === valor; }) ? valor : porDefecto;
  }

  function probadorSaneado(e) {
    var base = probadorDeFabrica();
    if (!e || typeof e !== 'object') return base;
    var ficha = function (q, porDefecto) {
      q = q || {};
      return {
        nombre: typeof q.nombre === 'string' ? q.nombre.slice(0, datos.NOMBRE_MAX)
                                             : porDefecto.nombre,
        avatar: window.ATWI.esPersonaje(q.avatar) ? q.avatar : porDefecto.avatar,
        /* `elColor` ya devuelve el de serie si no lo reconoce. */
        color: window.ATWI.elColor(q.color)
      };
    };
    var s = {
      modo: FINALES[e.modo] ? e.modo : base.modo,
      publico: MESAS_PROBADOR.some(function (m) { return m.clave === e.publico; })
        ? e.publico : base.publico,
      juez: window.ATWI.esJuez(e.juez) ? e.juez : base.juez,
      /* UNA RESPUESTA POR MODO, no una sola compartida: «gana» no existe en
         Negociación ni «dos» en Controversia, así que con una sola cambiar de
         modo dejaba elegida una respuesta imposible. */
      contesta: {
        debate: enLista(CONTESTA.debate, (e.contesta || {}).debate, base.contesta.debate),
        negociacion: enLista(CONTESTA.negociacion, (e.contesta || {}).negociacion,
                             base.contesta.negociacion)
      },
      uno: ficha(e.uno, base.uno),
      dos: ficha(e.dos, base.dos)
    };
    /* El final se valida CONTRA EL MODO ya saneado, no contra la lista entera. */
    var finales = FINALES[s.modo].map(function (f) { return f.clave; });
    s.final = finales.indexOf(e.final) !== -1 ? e.final : finales[0];
    return s;
  }

  function estadoProbador() {
    if (probador) return probador;
    var crudo = null;
    try { crudo = JSON.parse(localStorage.getItem(CLAVE_PROBADOR) || 'null'); }
    catch (e) { crudo = null; }
    probador = probadorSaneado(crudo);
    return probador;
  }

  function guardarProbador() {
    try { localStorage.setItem(CLAVE_PROBADOR, JSON.stringify(probador)); }
    catch (e) { /* modo incógnito */ }
  }

  /* CON QUIÉN SE JUEGA, EN EL PROBADOR. Los nombres van sin el «Con» de las
     cartas del catálogo: aquí son tres opciones en una fila de chips, no tres
     cartas, y el «Con mi pareja» repetido tres veces no cabe ni hace falta. */
  var MESAS_PROBADOR = [
    { clave: 'pareja', nombre: 'Pareja' },
    { clave: 'amigos', nombre: 'Amigos' },
    { clave: 'familia', nombre: 'Familia' }
  ];

  function chipsProbador(campo, opciones, puesto) {
    return '<div class="filtros">' + opciones.map(function (o) {
      return '<button type="button" class="chip chip--filtro" data-pb="' + campo + '" ' +
        'data-val="' + o.clave + '"' + (o.clave === puesto ? ' aria-pressed="true"' : '') +
        '>' + esc(o.nombre) + '</button>';
    }).join('') + '</div>';
  }

  /* UNA FICHA DEL PROBADOR. Es el mismo trío que el perfil —nombre, cara,
     color— pero sin veto: aquí se puede poner a los dos iguales a propósito,
     que es justamente uno de los casos que hay que poder mirar. */
  function fichaProbador(cual, q, titulo) {
    return '<div class="pb-ficha">' +
      '<span class="pb-ficha__t">' + esc(titulo) + '</span>' +
      '<input class="campo" data-pb-nombre="' + cual + '" type="text" ' +
        'maxlength="' + datos.NOMBRE_MAX + '" placeholder="Nombre" ' +
        'value="' + esc(q.nombre) + '">' +
      '<div class="pb-caras">' +
        window.ATWI.quienes().map(function (x) {
          return '<button type="button" class="pb-cara" data-pb-cara="' + cual + '" ' +
            'data-val="' + x.clave + '"' +
            (x.clave === q.avatar ? ' aria-pressed="true"' : '') +
            ' aria-label="' + esc(x.nombre) + '" title="' + esc(x.nombre) + '">' +
            window.ATWI.fichaHTML(x.clave, 'pb-cara__f', q.color) +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="colores">' +
        window.ATWI.colores().map(function (c) {
          return '<button type="button" class="color" data-pb-color="' + cual + '" ' +
            'data-val="' + c.clave + '"' +
            (c.clave === q.color ? ' aria-pressed="true"' : '') +
            ' aria-label="' + esc(c.nombre) + '"><i style="background:' + c.tono + '"></i>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function cuerpoProbador() {
    var e = estadoProbador();
    return '<div class="apilado">' +
      '<div><span class="pb-ficha__t">El modo</span>' +
        chipsProbador('modo', [{ clave: 'debate', nombre: 'Controversia' },
                               { clave: 'negociacion', nombre: 'Negociación' }], e.modo) +
      '</div>' +

      '<div><span class="pb-ficha__t">Cómo termina</span>' +
        chipsProbador('final', FINALES[e.modo], e.final) +
      '</div>' +

      /* Y EL CONTROL VOLVIÓ, que es lo que decía aquí que pasaría. Se había
         quitado el 2026-09-14 porque no cambiaba nada de lo que esta pantalla
         sirve para mirar —`publico` solo lo leía `ganadorNegociacion[publico]`,
         y las dos ramas daban el mismo texto—, con la nota de que volvería el
         día que las mesas dijeran cosas distintas. Ese día es hoy: **el
         estallido del encuentro lleva el color de la mesa**, así que con este
         chip se miran los tres sin cambiar de partida. Son tres y ya no dos:
         Familia llegó el 2026-09-16. */
      '<div><span class="pb-ficha__t">Con quién se juega</span>' +
        '<p class="chico tenue" style="margin:2px 0 6px">Tiñe el VS y el choque ' +
          'de puños de «Reproducir la entrada».</p>' +
        chipsProbador('publico', MESAS_PROBADOR, e.publico) +
      '</div>' +

      /* LA NOTA VA ENCIMA DE LAS FICHAS (ajuste del titular, 2026-09-15). Debajo
         se leía como un pie de página de algo que ya se había tocado: cuando
         llegabas a ella ya habías elegido. Arriba dice para qué sirve el control
         ANTES de usarlo, que es cuando sirve de algo. */
      '<div><span class="pb-ficha__t">Qué contesta ' +
        (e.modo === 'negociacion' ? 'el mediador' : 'el juez') + '</span>' +
        '<p class="chico tenue" style="margin:2px 0 6px">Solo para «Reproducir fin ' +
          'de ronda», que arranca al mandar la última intervención.</p>' +
        chipsProbador('contesta', CONTESTA[e.modo], e.contesta[e.modo]) +
      '</div>' +

      '<div><span class="pb-ficha__t">Quién lo presenta</span>' +
        '<div class="jueces-rejilla" style="margin-top:var(--e-2)">' +
          window.ATWI.jueces().map(function (q) {
            return '<button type="button" class="juez-ficha' +
              (e.juez === q.clave ? ' juez-ficha--puesta' : '') + '" ' +
              'data-pb-juez="' + q.clave + '">' +
              window.ATWI.fichaJuezHTML(q.clave) +
              '<span class="juez-ficha__n">' + esc(q.nombre) + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      fichaProbador('uno', e.uno, 'La ficha de la izquierda') +
      fichaProbador('dos', e.dos, 'La ficha de la derecha') +

      '<p class="chico tenue">El texto del veredicto —las justificaciones, los ' +
        'números y el acuerdo— es siempre el mismo y es de mentira. Lo que cambia ' +
        'aquí es la escena.</p>' +
    '</div>';
  }

  /* TRES PROPUESTAS DE MENTIRA, con la forma de las de verdad: texto y las dos
     anclas. Las anclas son lo que hace comprobable el anclaje bilateral --cada
     propuesta tiene que apoyarse en algo que dijo CADA uno-- así que si aquí
     faltaran, la pantalla se vería bien en el ensayo y rota con el mediador. */
  /* DOS PROPUESTAS DE MENTIRA, con la forma de las de verdad: texto y las dos
     anclas. Las anclas son lo que hace comprobable el anclaje bilateral --cada
     propuesta tiene que apoyarse en algo que dijo CADA uno-- así que si aquí
     faltaran, la pantalla se vería bien en el ensayo y rota con el mediador.
     `--mirar` de la votación: poner la lista en vacío ensaya la otra salida, la
     de «no hay acuerdo que proponerles». */
  var PROPUESTAS_DE_MENTIRA = [
    { texto: 'Los platos se lavan antes de dormir, los lave quien los lave, y el que ' +
             'cocinó esa noche no lava.',
      recogeUno: 'Vos dijiste que no querés levantarte con la cocina sucia.',
      recogeDos: 'Vos dijiste que cocinar ya es tu parte del trabajo.' },
    { texto: 'Si cenamos después de las diez, quedan en remojo y se lavan a la mañana ' +
             'siguiente antes del café.',
      recogeUno: 'Vos dijiste que a esa hora ya no te da la cabeza.',
      recogeDos: 'Vos dijiste que lo que te molesta es encontrarlos al día siguiente.' }
  ];

  /* LO QUE LOS DOS ENSAYOS NECESITAN. Quién juega, en qué modo y con qué juez:
     es lo único del probador que la sala mira, y lo miran los dos igual. */
  function mesaDelProbador() {
    var e = estadoProbador();
    var ficha = function (q, porDefecto) {
      return { nombre: (q.nombre || '').trim() || porDefecto,
               avatar: q.avatar, color: q.color };
    };
    return { quien: [ficha(e.uno, 'Tú'), ficha(e.dos, 'La otra parte')],
             modo: e.modo, juez: e.juez, publico: e.publico };
  }

  /* EL SORTEO Y LA CORTINILLA, sin montar una partida (titular, 2026-09-16).
     El modo manda también aquí: en Controversia los dos se plantan y cae el VS,
     en Pacto siguen hasta chocar el puño. O sea que las dos escenas se miran
     con el mismo selector de arriba, sin tocar nada más. */
  function ensayarLaEntrada() {
    cerrarModales(['m-probador']);
    window.ATWI.partida.ensayarLaEntrada(mesaDelProbador());
  }

  function ensayarDesdeElFinal() {
    var e = estadoProbador();
    var mesa = mesaDelProbador();
    /* `cerrarModales` Y NO `cerrarModal`, que es lo que hace la partida de
       verdad al entrar en la sala. La diferencia no es de estilo: `cerrarModal`
       cierra PIDIENDO UN ATRÁS, y el atrás es asíncrono --pasa por `popstate`--
       así que la sala se abría antes de que el probador se fuera. Y como
       `m-partida` no pasa por `abrirModal`, se queda en el z-index 40 de serie
       mientras el probador estaba en 41: la sala quedaba debajo, invisible.
       Peor todavía, cuando el `popstate` llegaba, `retroceder()` ya veía la sala
       abierta y se iba por la rama de «¿seguro que salís de la partida?». */
    cerrarModales(['m-probador']);
    mesa.contesta = e.contesta[e.modo];
    mesa.propuestas = PROPUESTAS_DE_MENTIRA;
    window.ATWI.partida.ensayarDesdeElFinal(mesa);
  }

  function abrirProbador() {
    estadoProbador();
    repintarProbador();
    abrirModal('m-probador');
  }

  /* Repinta el cuerpo entero, y puede: aquí no hay nada a medio escribir que
     se pueda perder salvo los dos nombres, y esos se guardan en el estado a
     cada tecla.

     Y GUARDA. Toda la pantalla cambia el estado y después repinta, así que este
     es el único sitio por el que pasan TODOS los cambios menos uno —el nombre,
     que a propósito no repinta para no perder el foco— y ese guarda por su
     cuenta. Poner el guardado en cada manejador sería cuatro sitios donde
     olvidarse de uno. */
  function repintarProbador() {
    var m = $('#m-probador');
    if (!m) return;
    guardarProbador();
    m.className = 'modal modal--' + estadoProbador().modo;
    $('#m-probador .modal__cuerpo').innerHTML = cuerpoProbador();
    /* El ensayo vale para los dos modos: en Controversia recorre la
       deliberación y el veredicto, en Negociación la elección y la firma. */
    var votar = $('#pb-votar');
    if (votar) votar.hidden = false;
  }

  /* UN VEREDICTO DE MENTIRA, CON TODOS SUS CAMPOS. Existe para poder mirar la
     pantalla del resultado sin jugar una partida entera ni gastar un veredicto
     de verdad, que cuesta 0,19 USD y ochenta segundos.

     LLEVA LOS CAMPOS DEL ÁRBITRO DE VERDAD --`loMejor`, `justificacion`,
     `desglose` con su rúbrica de cinco criterios, `duelo` con las dos fichas y
     `juez`-- porque si trajera menos, la pantalla se vería bien aquí y rota con
     un veredicto real. Los números salen de la partida de prueba que ya se
     juzgó (eccb39ff), así que son plausibles y no redondos.

     `simulado` va en FALSO a propósito, aunque esto sea lo más simulado que
     hay: ese aviso dice «el juez no está conectado y esto salió de un sorteo»,
     y aquí lo que se está mirando es justamente cómo queda un veredicto que sí
     vino del juez. Para ver el otro aviso está el botón de la partida real sin
     servidor. */
  function veredictoDeMentira() {
    var e = estadoProbador();
    var uno = { nombre: (e.uno.nombre || '').trim() || 'Tú',
                avatar: e.uno.avatar, color: e.uno.color };
    var dos = { nombre: (e.dos.nombre || '').trim() || 'La otra persona',
                avatar: e.dos.avatar, color: e.dos.color };
    var r = {
      simulado: false, modo: e.modo, publico: e.publico, tema: 'La manta',
      juez: e.juez || juezPorDefecto(),
      duelo: [{ nombre: uno.nombre, avatar: uno.avatar, color: uno.color, gano: false },
              { nombre: dos.nombre, avatar: dos.avatar, color: dos.color, gano: false }],
      /* No hay nada que hacer al cerrar: el probador sigue abierto DEBAJO —la
         revelación va a z-index 60 y un modal a 41— así que al salir de la
         explicación se vuelve a él sin reabrir nada. Reabrirlo aquí sería
         además pelearse con el historial: esto corre dentro del `popstate`. */
      alCerrar: function () {}
    };

    /* NEGOCIACIÓN: los dos igual. Con acuerdo ganan los dos --aquí ganar es de
       los dos o no es de nadie-- y sin acuerdo los dos sentados, que no es
       derrota de nadie contra nadie sino que hoy no salió. */
    if (e.final === 'acuerdo' || e.final === 'sin-acuerdo') {
      r.tema = 'los platos';
      var hay = e.final === 'acuerdo';
      r.duelo[0].gano = r.duelo[1].gano = hay;
      r.acuerdo = hay
        ? 'Si cenamos después de las diez, los platos se quedan en remojo y se lavan a ' +
          'la mañana siguiente antes del café.'
        : null;
      return r;
    }

    if (e.final === 'parada' || e.final === 'parada-dura') {
      /* Sin puntuación y sin ganador: en esa rama el juez no puntúa nada, así
         que un `desglose` de mentira aquí enseñaría algo que nunca existe. */
      r.sinResultado = e.final === 'parada-dura' ? 'dura' : 'blanda';
      /* LA DURA NO TRAE «LO QUE DIJO CADA UNO» y no es un descuido: `docs/02`
         §578 dice «ningún registro». El probador tiene que enseñar la pantalla
         que la partida de verdad puede enseñar, no una parecida. */
      if (e.final === 'parada-dura') return r;
      r.loQueDijo = [
        { nombre: uno.nombre, texto: 'Habló de que gastar de más cuando hay gente le deja ' +
          'una sensación que le dura, y de que a veces siente que se gasta por la situación.' },
        { nombre: dos.nombre, texto: 'Sostuvo que con gente delante se gasta lo que ' +
          'corresponde, y que lo que representan fuera de casa importa.' }
      ];
      return r;
    }

    /* LA RÚBRICA FLOJA Y LA BUENA, y quien gana se lleva la buena. Con el
       empate las dos quedan a un punto, que es como se ve de verdad un empate:
       no dos columnas idénticas --eso no pasa nunca-- sino una diferencia que
       no llega al umbral. */
    var floja = { pertinencia: 78, solidez: 67, evidencia: 34, escucha: 52, tono: 90, total: 63.6 };
    var buena = e.final === 'empate'
      ? { pertinencia: 78, solidez: 68, evidencia: 33, escucha: 59, tono: 90, total: 64.6 }
      : { pertinencia: 80, solidez: 74, evidencia: 66, escucha: 71, tono: 90, total: 74.2 };
    var gana1 = e.final === 'gana-1';
    r.desglose = { criterios: 5, personas: [
      { nombre: uno.nombre, color: uno.color, rubrica: gana1 ? buena : floja },
      { nombre: dos.nombre, color: dos.color, rubrica: gana1 ? floja : buena }
    ] };
    r.loMejor = [
      { nombre: uno.nombre, texto: 'Sostuvo que el problema es el tamaño de la manta y no ' +
        'el número, y lo apoyó en algo que ya habían probado juntos.' },
      { nombre: dos.nombre, texto: 'Marcó que lo que la despierta es el movimiento y no la ' +
        'tela, y ofreció una prueba con plazo para comprobarlo.' }
    ];

    if (e.final === 'empate') {
      r.empate = true;
      r.motivoEmpate = 'parejo';
      r.justificacion = 'La pertinencia fue pareja: las dos respuestas se ajustaron al ' +
        'enunciado. En solidez, cada postura trajo una razón identificable. La evidencia ' +
        'concreta fue escasa en los dos casos, y eso dejó la diferencia bajo el umbral.';
      return r;
    }

    r.ganador = gana1 ? uno.nombre : dos.nombre;
    r.duelo[gana1 ? 0 : 1].gano = true;
    r.justificacion = 'La evidencia concreta inclinó el resultado: dos ocasiones frente a ' +
      'ninguna. En pertinencia quedaron parejas. La escucha sumó del lado que marcó el ' +
      'punto exacto de desacuerdo.';
    return r;
  }

  /* La carta de un modo: nombre, icono y dos salidas. NADA MÁS.
     La explicación se fue a su propio modal. En la carta ocupaba cinco
     renglones de letra pequeña que hay que leer para decidir, y quien ya sabe
     de qué va —o sea, a partir de la segunda partida— tenía que saltárselos
     cada vez para llegar al botón. Ahora la portada se lee de un vistazo y la
     explicación está a un toque de quien la necesite. */
  /* LAS DOS CARTAS VAN LADO A LADO Y EN COLUMNA (mockup del titular,
     2026-09-16). Estaban de lado —dibujo a la izquierda, botones a la derecha—
     y apiladas una sobre otra. La forma nueva es la de una carta de juego:
     dibujo arriba, una línea de qué se hace, las dos salidas abajo con su
     palabra, y una franja al pie. Lo que se gana es que los dos modos se ven
     a la vez y se comparan sin scroll, que es la decisión que pide la pantalla.

     Y LOS SIGNOS VUELVEN A TENER PALABRA. La quitaron porque al apilarse no
     cabía --«Explícame» partía en dos renglones--; en columna y con la carta a
     media pantalla sí cabe, y debajo del signo en vez de al lado. El signo
     sigue haciendo el trabajo de reconocerse a distancia y la palabra quita la
     duda de qué pasa al tocarlo, que en el teléfono no se puede resolver
     pasando el cursor por encima. */
  /* LA CARTA ENTERA ES EL BOTÓN DE JUGAR (titular, 2026-09-16), y el signo de
     ayuda es lo único que se toca aparte. El play se va: eran dos dianas
     compitiendo en una carta de 166 px, y la de verdad —«quiero este modo»— es
     la carta, que es lo que la mano va a tocar de todas formas.

     DOS BOTONES HERMANOS Y NO UNO DENTRO DE OTRO. Un `<button>` dentro de otro
     `<button>` no es HTML válido y el navegador lo desarma; con `role="button"`
     sobre un div habría que escribir a mano el Enter y el Espacio. Así que la
     carta es un botón de verdad y el de ayuda va a su lado, colocado encima con
     posición absoluta: los dos se tabulan, los dos se pulsan con teclado y no
     hay nada que emular.

     Y EL ORDEN DE LOS MANEJADORES YA RESOLVÍA EL SOLAPE: `data-explicar` se
     mira antes que `data-crear` y corta con `return`, así que tocar la ayuda no
     dispara además la carta. */
  /* LA CARTA DE MODO ES UNA FILA (mockup del titular, 2026-09-16), y esto revoca
     lo de ponerlas lado a lado que este archivo defendía hace unas horas.

     POR QUÉ CAMBIA EL ARGUMENTO. Apiladas se decía que «no se comparan, se lee
     una, se baja y se lee la otra», y eso valía con DOS cartas verticales de
     media pantalla. Con TRES, en columnas de 110 px, lo que no cabe es el
     nombre del modo: quedaba el rótulo dibujado y dos renglones apretados. En
     fila cabe el nombre escrito AL LADO del rótulo, que es lo que de verdad
     dice a qué se juega, y las tres se abarcan de una mirada igual: son tres
     renglones, no tres pantallas.

     TRES COLUMNAS DENTRO: el rótulo dibujado, el texto y el disco de ayuda.
     El disco es un botón hermano y no va dentro —un `<button>` dentro de otro
     no es HTML válido y el navegador lo desarma—, así que se coloca encima con
     posición absoluta y la carta le reserva el sitio con su `padding-right`. */
  function cartaModo(clave) {
    var m = cfg.modos[clave] || {};
    return '<div class="carta-modo-caja">' +
        '<button class="carta-modo carta-modo--' + clave + '" data-crear="' + clave + '" ' +
                'aria-label="Jugar a ' + esc(modoLlano(clave)) + '">' +
          rotuloModo(clave, 'carta-modo__rotulo') +
          /* SIN EL NOMBRE ESCRITO (titular, 2026-09-16): el rótulo dibujado ya
             dice «Controversia», y ponerlo otra vez al lado en letra normal era
             decir dos veces lo mismo en la misma fila. Queda la línea de qué se
             juega, que es lo único que el dibujo no puede decir. */
          (m.gancho ? '<span class="carta-modo__gancho">' + esc(m.gancho) + '</span>' : '') +
          /* El zócalo dibujado del pie: globos de diálogo en Juicio, brotes en
             Pacto, estrellas en QuiénGane. Va fuera del flujo y por detrás; el
             hueco se lo hace el `padding-bottom` de la carta. */
          '<img class="carta-modo__base" src="../assets/img/iconos/base-' + clave + '.png" ' +
            'alt="" aria-hidden="true" loading="lazy" decoding="async">' +
        '</button>' +
        /* EL SIGNO SE QUEDA, y sin palabra: una interrogación no hay que
           traducirla. El nombre va en `aria-label` —que es lo que anuncia un
           lector de pantalla— y en `title` para el escritorio. */
        '<button class="carta-modo__explica" data-explicar="' + clave + '" ' +
          'aria-label="Cómo funciona ' + esc(modoLlano(clave)) + '" title="Cómo funciona">' +
          window.ATWI.iconoDeModo('ayuda', clave, 46) +
        '</button>' +
      '</div>';
  }

  /* El modal de la explicación hace juego con su carta: mismo color de fondo y
     el mismo rótulo dibujado. Termina en «Jugar», porque quien acaba de
     entender un modo suele querer probarlo ahí mismo. */
  var explicando = null;

  function abrirExplicar(clave) {
    var m = cfg.modos[clave];
    if (!m) return;
    explicando = clave;

    $('#m-explicar').className = 'modal modal--' + clave;
    $('#m-explicar .modal__titulo').textContent = 'Cómo se juega';
    $('#m-explicar .modal__cuerpo').innerHTML =
      '<div class="explica explica--' + clave + '">' +
        rotuloModo(clave, 'explica__rotulo') +
        /* La frase que importa va en párrafo aparte, entrecomillada y en
           cursiva: leída de corrido dentro del texto se perdía entre lo demás,
           y es justo lo único que hay que llevarse de esta pantalla. */
        '<p class="explica__que">' + esc(m.que) + '</p>' +
        '<p class="explica__clave">«' + esc(m.clave) + '»</p>' +
      '</div>';

    $('#m-explicar .modal__pie button').className =
      'boton boton--bloque boton--grande boton--' + clave;
    abrirModal('m-explicar');
  }

  /* La tarjeta NO es un botón: dentro lleva otro —personalizar— y un botón
     dentro de otro no es HTML válido. Es una caja con el botón grande arriba
     —tocar el tema— y la fila de chips debajo, donde el de personalizar cabe
     como uno más porque eso es lo que parece. */
  /* ======================================================================
     LA RULETA DE TEMAS (titular, 2026-09-18)
     *«Deja estáticas las opciones y solo el área de los temas queda
     scrolleable… que nunca se queden cortadas las cards de tema, es decir que
     se deslicen suavemente y se acomoden siempre para que todas las visibles
     queden completas, mantendrás siempre 3 o 4 visibles según el viewport, como
     un estilo ruleta.»*

     Tres piezas, y las tres hacen falta:
     · **La cabecera no scrollea**: la cinta del modo, las mesas, los filtros y
       «Mis propios temas» son los MANDOS de la lista, y unos mandos que se van
       hacia arriba obligan a volver para tocarlos.
     · **El alto de la caja es un múltiplo exacto del paso de una tarjeta**, que
       es lo único que garantiza que la última visible esté entera. Se mide del
       DOM —tarjeta + hueco— en vez de escribirlo aquí, porque el CSS lo puede
       cambiar y dos números iguales en dos sitios se desincronizan.
     · **`scroll-snap` hace el resto**: al soltar el dedo, la lista se acomoda
       sola a la tarjeta más cercana en vez de quedarse a medias.
     ⚠️ Y PARA QUE ESTO SEA CIERTO, LAS TARJETAS MIDEN TODAS LO MISMO: con altos
     distintos no hay múltiplo que valga —la última entraría o no según de qué
     tema fuera—. Lo paga el enunciado, que se recorta a tres renglones.
     ====================================================================== */
  /* ⚠️ NO HAY MÍNIMO DE TARJETAS, Y ESE ERA EL FALLO (titular, 2026-09-18, con
     una foto de su móvil: *«¿ves cómo se corta la tercera card? No debería
     pasar: si el cálculo no confirma que las 3 salen completas, quita una y
     redistribuye»*). Aquí había un `MIN_VISIBLES = 3` que forzaba tres aunque
     solo cupieran dos, y entonces la ruleta medía más que su hueco y la última
     salía cortada —justo lo que la ruleta existe para que no pase—. **Lo que
     manda es lo que cabe**: el mínimo era una intención escrita como número, y
     una intención no cambia el alto de la pantalla.
     Y por el otro lado (su PC): *«sobra más espacio abajo que arriba; se podría
     reducir el espacio entre cards y meter una cuarta, o distribuir las 3
     equitativamente hasta el botnav»*. Las dos cosas, en este orden: primero se
     aprieta el hueco hasta el mínimo para ver si entra **una más** —una tarjeta
     de verdad vale más que aire repartido— y solo lo que sobre después se
     reparte. */
  var MAX_VISIBLES = 4;
  /* El hueco se mueve entre estos dos: 8 es lo más apretado en que dos tarjetas
     siguen leyéndose como dos, y 36 lo más suelto antes de que la lista parezca
     tres cosas sueltas. */
  var HUECO_MIN = 8, HUECO_MAX = 36, AIRE_PIE = 8;

  function ajustarRuleta(vueltas) {
    /* LA DE LA PANTALLA QUE SE ESTÁ VIENDO: el catálogo y el historial tienen
       la suya, y las dos se miden igual. */
    var r = $('.vista[data-activa] .ruleta');
    if (!r) return;
    var uno = r.firstElementChild;
    if (!uno) return;
    var alto = uno.offsetHeight;
    if (!alto) return;
    /* ⚠️ EL PASO SE MIDE ENTRE DOS TARJETAS, NO SE CALCULA. Sumar el alto y el
       `gap` da por hecho que no hay nada más entre ellas, y una tarjeta con
       `margin-bottom` propio —la del historial lo traía de cuando la lista era
       una pila— mete 12 px que el reparto no ve: el paso real eran 201 y la
       cuenta decía 189, así que la última visible se salía 24 px del hueco
       calculado. Con dos hermanas en pantalla, la distancia entre sus bordes de
       arriba es el paso, lleve lo que lleve en medio. */
    var dos = uno.nextElementSibling;
    var pasoReal = dos ? dos.offsetTop - uno.offsetTop : 0;

    /* Se mide SIN el margen de la vez anterior, o cada repintado lo acumularía:
       el margen es el resultado de esta cuenta, no un dato de entrada. */
    r.style.marginTop = '';
    if (!vueltas) delete r.dataset.tope;
    var caja = r.parentNode.getBoundingClientRect();
    var arriba = r.getBoundingClientRect().top;
    /* Lo que queda de pantalla por debajo de los mandos, menos el aire del pie:
       la última pegada al canto de la barra se lee como cortada aunque esté
       entera. */
    var libre = caja.bottom - arriba - AIRE_PIE;

    /* Lo que la tarjeta trae pegado y no se puede quitar desde aquí. Se
       descuenta el hueco QUE HAY PUESTO en este momento, no el mínimo: la
       primera medida se toma con el `gap` del CSS —12— y restando 8 salía un
       «margen propio» de 4 px que no existe, y con él la caja se iba 8 px por
       encima de lo que mide su contenido. */
    var gapAhora = parseFloat(getComputedStyle(r).rowGap) || 0;
    var extra = Math.max(0, pasoReal - alto - gapAhora);
    /* Cuántas caben DE VERDAD, con el hueco más apretado que se admite. */
    var n = Math.floor((libre + HUECO_MIN) / (alto + extra + HUECO_MIN));
    /* Con menos temas que sitio, la caja mide lo que hay: una ruleta con aire
       debajo se lee como una lista que se quedó corta. */
    n = Math.min(n, MAX_VISIBLES, r.children.length);
    /* Lo que dijo la comprobación de la pasada anterior, si la hubo. */
    if (r.dataset.tope) n = Math.min(n, parseInt(r.dataset.tope, 10) || n);
    if (n < 1) { r.style.height = ''; r.style.rowGap = ''; return; }

    /* EL ALTO QUE SOBRA SE REPARTE ENTRE LAS TARJETAS, hasta el tope del hueco;
       lo que no quepa ni así se va a un margen ARRIBA Y ABAJO por igual, que es
       lo que pidió el titular —«dejando margen arriba o abajo»—: todo el
       sobrante al pie se lee como que la lista se acabó.
       El snap no se entera de nada de esto: va por tarjeta, no por una
       distancia escrita. */
    var hueco = n > 1
      ? Math.max(HUECO_MIN, Math.min(HUECO_MAX, (libre - n * alto) / (n - 1) - extra))
      : HUECO_MIN;
    hueco = Math.round(hueco);
    var altura = n * alto + (n - 1) * (hueco + extra);
    r.style.rowGap = hueco + 'px';
    r.style.height = altura + 'px';
    r.style.marginTop = Math.max(0, Math.round((libre - altura) / 2)) + 'px';

    /* ⚠️ Y DESPUÉS SE COMPRUEBA, PORQUE LA CUENTA SE HACE CON LO QUE HAY EN ESE
       INSTANTE (lo vio el titular en su teléfono, 2026-09-18: la tercera
       tarjeta cortada donde aquí salían tres enteras). Lo que hay ENCIMA de la
       ruleta —el título, los chips, el renglón del recordatorio— puede cambiar
       de alto después de medir: las fuentes del juego no están autoalojadas, y
       mientras llegan el navegador pinta con la de respaldo, que mide otra
       cosa. Cuando eso pasa, `libre` valía más de lo que acabó valiendo y la
       última tarjeta se sale.
       Medir el resultado y corregirlo es lo único que no depende de acertar el
       momento: si la caja se pasó del hueco, se quita una tarjeta y se vuelve a
       repartir. Dos pasadas bastan —cada una quita una— y el tope evita que un
       layout que no se estabiliza deje esto dando vueltas. */
    if (!vueltas) vueltas = 0;
    if (vueltas < 2) {
      var sobresale = r.getBoundingClientRect().bottom - r.parentNode.getBoundingClientRect().bottom;
      if (sobresale > 1 && n > 1) {
        r.dataset.tope = String(n - 1);
        return ajustarRuleta(vueltas + 1);
      }
    }
    darLaVuelta(r, alto + hueco + extra, n);
    girarRuleta(r, alto + hueco + extra);
  }

  /* ======================================================================
     LA RULETA NO SE ACABA (titular, 2026-09-18: *«haz que la ruleta sea
     infinita, es decir, en vez de terminar de scrollear vuelves a mostrar los
     elementos iniciales»*)
     La lista se REPITE y, cuando el dedo para, el scroll salta un bloque entero
     hacia atrás. El salto es invisible porque lo que hay en el sitio nuevo es
     exactamente lo mismo que había en el viejo: es el truco de toda la vida de
     los carruseles, y la única parte delicada es CUÁNDO se hace.
     ⚠️ SE REPOSICIONA AL PARAR Y NUNCA DURANTE EL GESTO. Tocar `scrollTop`
     mientras corre la inercia la CORTA en seco —y la inercia es la otra mitad
     de lo que se pidió—, así que el salto espera a que la lista esté quieta. Lo
     que hace que eso baste es tener bloque de sobra: con tres copias y un
     mínimo de 60 tarjetas, ningún lanzón llega al final antes de que pare.
     ⚠️ Y CON POCOS TEMAS SE VEN REPETIDOS, que es lo que una ruleta hace: con
     cinco temas y cuatro a la vista no hay manera de dar la vuelta sin que el
     primero vuelva a salir. Por debajo de `n + 2` no se repite nada: ahí la
     lista es tan corta que el bucle solo confundiría.
     ====================================================================== */
  var VUELTAS_MIN = 3, TARJETAS_MIN = 60;

  function darLaVuelta(r, paso, n) {
    if (!pintaVuelta(r)) return;
    if (r.dataset.vuelta) return;            /* ya montada en este pintado */
    var cuantas = r.children.length;
    if (cuantas < n + 2) return;
    var copias = Math.max(VUELTAS_MIN, Math.ceil(TARJETAS_MIN / cuantas));
    var molde = r.innerHTML;
    var trozos = [];
    for (var i = 1; i < copias; i++) trozos.push(molde);
    r.insertAdjacentHTML('beforeend', trozos.join(''));
    r.dataset.vuelta = String(cuantas * paso);
    /* Se arranca en el segundo bloque para que la primera vez que alguien tire
       hacia ARRIBA también haya lista detrás. */
    r.scrollTop = cuantas * paso;
  }

  /** Devuelve el scroll al bloque de en medio, sin que se note. */
  function recolocarVuelta(r) {
    var bloque = parseFloat(r.dataset.vuelta || 0);
    if (!bloque) return;
    if (r.scrollTop >= bloque * 2) r.scrollTop -= bloque;
    else if (r.scrollTop < bloque) r.scrollTop += bloque;
  }

  /* LA CUENTA SE REHACE CUANDO CAMBIA EL SITIO. Girar el teléfono, abrir el
     teclado o —en escritorio— estirar la ventana cambian el alto disponible, y
     una ruleta calculada para el de antes es exactamente lo que se quería
     evitar: la última tarjeta cortada. */
  window.addEventListener('resize', function () { ajustarRuleta(); });
  /* LAS FUENTES LLEGAN DESPUÉS Y MUEVEN LO QUE HAY ENCIMA. No están
     autoalojadas (`site/assets/fonts/LEEME.txt`), así que la primera pintada va
     con la de respaldo y el título y los chips miden otra cosa. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ajustarRuleta(); });
  }
  /* ⚠️ Y EN EL MÓVIL EL SITIO CAMBIA SIN QUE HAYA `resize`: la barra de
     direcciones del navegador se esconde al deslizar y el viewport VISIBLE
     crece, igual que con el teclado. Es el mismo aviso que ya costó el globo:
     lo que hay que escuchar es `visualViewport`. */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { ajustarRuleta(); });
  }

  /* EL CLAC DE LA RULETA (titular, 2026-09-18). El sonido ya existía y estaba
     escrito para esto: `sonido.clac(fuerza)` nació para la ficha del sorteo y
     su propio comentario dice que la fuerza «baja de 1 a 0 según se frena, que
     es lo que hace que suene a rueda perdiendo impulso y no a metrónomo». Aquí
     la fuerza no baja sola: **sale de la velocidad del dedo**, que es lo que
     convierte un arrastre lento en un tic-tic y un lanzón en una carrera.
     UNO POR TARJETA Y NO POR EVENTO: `scroll` se dispara decenas de veces por
     gesto; lo que suena es el cambio de tarjeta, que es lo que la ruleta hace
     al pasar un diente. Y el que suena al final, cuando el snap asienta, es el
     de la rueda encajando: sale gratis y es el que corresponde.
     ⚠️ EL CONTEXTO DE AUDIO SE DESBLOQUEA DENTRO DE UN GESTO (docs/01 §8.6), y
     el primer toque sobre la lista es el sitio: sin eso el primer deslizamiento
     no sonaría y no avisaría de por qué.
     Los dos oyentes se van con el elemento: la lista se repinta entera en cada
     búsqueda y cada filtro, así que no hay que quitarlos a mano. */
  /* ======================================================================
     EL GIRO: el clac, el empujón de más y la vuelta, en un solo oyente
     Las tres cosas cuelgan del mismo dato —cada cuánto pasa una tarjeta— así
     que separarlas sería medir tres veces lo mismo.
     ====================================================================== */
  /* Cuánto se alarga el viaje por cada unidad de velocidad. 1 px/ms es un
     arrastre vivo; el empujón que se le suma ahí son ~2 tarjetas. */
  var EMPUJE = 260, EMPUJE_MAX = 6, FRENO = 0.93, QUIETO = 90;

  function girarRuleta(r, paso) {
    if (r.dataset.girando) return;
    r.dataset.girando = '1';
    var son = window.ATWI.sonido;
    var haySon = son && son.hay();
    var reloj = function () { return (window.performance && performance.now()) || 0; };

    if (haySon) {
      r.addEventListener('pointerdown', function () { son.despertar(); }, { passive: true });
    }
    /* Mientras el dedo esté puesto no hay ni empujón ni salto: los dos son cosas
       que pasan DESPUÉS de soltar. */
    var dedo = false, fueDedo = false;
    r.addEventListener('pointerdown', function (e) {
      dedo = true;
      /* ⚠️ EL EMPUJÓN ES COSA DEL DEDO, NO DE LA RUEDA (titular, 2026-09-18:
         «se frena como esperando cargar más… el user quiere fluidez siempre»).
         Con el ratón, la rueda manda eventos mientras mi animación corre y las
         dos se pelean por el mismo `scrollTop`: eso es exactamente un tirón. Y
         además no hace falta —la rueda no tiene inercia que continuar—. En
         táctil sí, que es donde se pidió. */
      fueDedo = e.pointerType !== 'mouse';
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(function (e) {
      r.addEventListener(e, function () { dedo = false; }, { passive: true });
    });
    /* Un giro de rueda cancela lo que estuviera corriendo: manda el usuario. */
    r.addEventListener('wheel', function () { fueDedo = false; cancelAnimationFrame(raf); },
      { passive: true });

    var ultimo = Math.round(r.scrollTop / paso);
    var cuando = reloj();
    var vel = 0;                 /* tarjetas por milisegundo, con signo */
    var espera = 0, raf = 0;

    r.addEventListener('scroll', function () {
      var i = Math.round(r.scrollTop / paso);
      if (i !== ultimo) {
        /* ⚠️ LA VELOCIDAD SE MIDE ENTRE TARJETAS, NO ENTRE EVENTOS DE `scroll`.
           Con lo segundo salía siempre el mínimo: el navegador dispara varios
           eventos por gesto y el que cruza el diente puede traer un salto de dos
           píxeles, así que lo medido era el ruido del muestreo y no el gesto. Lo
           que hace la ruleta es sonar UNA vez por diente, y lo que dice cuán
           fuerte es **cada cuánto pasa un diente**: es la misma cuenta que hace
           una rueda de verdad. */
        var ahora = reloj();
        var saltos = Math.abs(i - ultimo);
        var dt = Math.max(1, ahora - cuando) / Math.max(1, saltos);
        vel = (i > ultimo ? 1 : -1) / dt;
        cuando = ahora; ultimo = i;
        /* Una tarjeta cada 160 ms o menos es un lanzón; cada 800, arrastrar con
           el dedo. El suelo de 0,2 deja que el clac del asentado se oiga. */
        if (haySon) son.clac(Math.max(0.2, Math.min(1, 160 / dt)));
      }
      /* La lista se da por quieta cuando pasa un rato sin eventos: no hay un
         «fin de scroll» en el navegador, y `pointerup` no vale porque después
         de soltar todavía corre la inercia del sistema. */
      clearTimeout(espera);
      espera = setTimeout(function () {
        if (dedo) return;
        if (fueDedo) empujar(vel);
        else asentar();
      }, QUIETO);
    }, { passive: true });

    /* EL EMPUJÓN DE MÁS (titular: «más impulso por empuje y distancia
       lograda»). La inercia del sistema la decide el sistema y desde la web no
       se sube; lo que sí se puede es **seguir donde ella lo dejó**. Cuando el
       momentum nativo se agota, si el gesto venía rápido la rueda sigue girando
       un trecho y se va frenando, que es lo que hace una ruleta de verdad: el
       viaje sale del impulso, no de un número fijo.
       Va con `scrollTop` a pelo y no con `scrollBy({behavior:'smooth'})`
       porque eso último dura lo que el navegador quiera y aquí la curva del
       frenado es justo lo que se está buscando. */
    function empujar(v) {
      var tarjetas = Math.min(EMPUJE_MAX, Math.abs(v) * EMPUJE);
      if (tarjetas < 0.8) { asentar(); return; }
      var queda = tarjetas * paso * (v < 0 ? -1 : 1);
      cancelAnimationFrame(raf);
      (function paso1() {
        if (dedo) { queda = 0; asentar(); return; }
        var tramo = queda * (1 - FRENO);
        if (Math.abs(queda) < 1) { asentar(); return; }
        r.scrollTop += tramo;
        queda -= tramo;
        raf = requestAnimationFrame(paso1);
      })();
    }

    /* Y al final, la rueda encaja: el snap deja la tarjeta cuadrada y el bloque
       vuelve a su sitio para que la vuelta siguiente tenga lista por delante y
       por detrás. */
    function asentar() {
      cancelAnimationFrame(raf);
      recolocarVuelta(r);
    }
  }

  function tarjetaTema(t) {
    var hecho = datos.yaDebatido(t.id);
    var tocado = t.propio || datos.estaReescrito(t.id);
    /* ⚠️ SE FUERON LOS DOS CHIPS (titular, 2026-09-17): el de intensidad
       —«ligera», «profunda», o la familia del premio— y el de «Sin estrenar» /
       «Ya debatido». Eran una fila entera de adorno debajo de cada tema en una
       lista de 455, y la única de las dos cosas que alguien busca —lo ya
       jugado— tiene su propio filtro arriba y además apaga la tarjeta
       (`.tema--hecho`, opacidad .72). Lo que decía el chip sigue dicho.
       Y PERSONALIZAR SUBE A LA ESQUINA Y DEJA DE SER UN BOTÓN CON PALABRA: es
       solo el lápiz, frente al título. El nombre vive en el `aria-label` y en
       el `title`, que es lo que lee quien no ve el dibujo. */
    var que = tocado ? 'Editar' : 'Personalizar';
    return '<div class="tarjeta tema-caja' + (hecho ? ' tema--hecho' : '') + '">' +
        '<button class="tema" data-tema="' + esc(t.id) + '">' +
          '<span class="tema__titulo">' + esc(t.titulo) + '</span>' +
          '<span class="tema__enunciado">' + esc(t.enunciado) + '</span>' +
        '</button>' +
        /* Directo al editor, sin pasar por el detalle: quien ve un tema que
           no encaja con su discusión quiere arreglarlo ahí mismo. */
        /* ⚠️ EL LÁPIZ NO VA DIFERIDO (titular, 2026-09-18: *«a veces estoy
           dando scroll con el mouse y se frena como esperando cargar más»*).
           `icono()` escribe `loading="lazy"` para todo el juego, que es lo
           correcto en una pantalla normal y lo peor posible en una ruleta: cada
           tarjeta que entra pide su imagen, y aunque sea la MISMA de las otras
           cien —una sola petición, ya en caché— el navegador se guarda el
           trabajo para el momento en que aparece, que es justo el momento en
           que se está deslizando. Aquí se piden todas de una: es un icono
           repetido, así que cargarlas todas cuesta lo mismo que cargar una. */
        '<button class="tema__editar" data-editar-tema="' + esc(t.id) + '" ' +
          'aria-label="' + que + ' este ' + (t.clase === 'premio' ? 'premio' : 'tema') +
          '" title="' + que + '">' +
          icono('lapiz', 24).replace('loading="lazy"', 'loading="eager"') + '</button>' +
      '</div>';
  }

  /* ======================================================================
     Vista: Catálogo
     ====================================================================== */
  var categoriaAbierta = null;
  var buscadorAbierto = false;   // el campo de texto del catálogo, plegado de serie

  /* EL CATÁLOGO SE BARAJA EN CADA ENTRADA (titular, 2026-09-16): 105 temas en un
     orden fijo son la misma primera pantalla siempre, y a la tercera visita ya
     no se lee —se reconoce y se salta—. Barajándolo, lo que hay arriba cambia y
     vuelve a haber algo que mirar.

     SE GUARDA UN NÚMERO POR TEMA Y NO SE BARAJA LA LISTA. La lista se vuelve a
     pedir en cada pintada —al escribir, al filtrar—, así que barajarla ahí la
     dejaría saltando bajo el dedo. Con un número fijo por tema, el orden es el
     mismo hasta que alguien vuelva a entrar.

     Y los temas que aparezcan después —uno propio recién escrito— se atienden
     solos: piden su número la primera vez que se los ordena. */
  var azarDeTema = {};

  /* LAS TRES MESAS (mockup del titular, 2026-09-16). `familia` es la nueva: la
     que no se eligió y de la que no se puede uno ir —hermanos, primos, tíos—, y
     por eso sus temas no son ni los de la pareja ni los de los amigos.

     La frase de cada una dice DE QUÉ SE DISCUTE ahí, no quién es quién: al
     abrirla lo que se ve es una lista de temas, y esto tiene que dejar claro
     cuál de las tres listas va a salir. */
  /* UNA PALABRA Y NO TRES (titular, 2026-09-18): «Pareja», «Amigos», «Familia».
     El «Con mi…» venía de cuando esto era una PREGUNTA a pantalla completa
     —«¿Con quién juegas?»— y cada carta contestaba con una frase. Desde que es
     un selector con las tres a la vista, el «con» lo pone el propio gesto y lo
     que hace falta ahí es el sustantivo: además, tres títulos que empiezan
     igual obligan a leer hasta la tercera palabra para saber cuál está puesto. */
  var PUBLICOS = [
    ['pareja', 'Pareja', 'Convivencia, dinero del día a día, horarios y pantallas.',
      ['Convivencia', 'Dinero', 'Horarios']],
    ['amigos', 'Amigos', 'La cuenta, los planes, el grupo y los viajes juntos.',
      ['Planes', 'Viajes', 'La cuenta']],
    ['familia', 'Familia', 'Hermanos, primos y tíos: comidas, fiestas y costumbres.',
      ['Comidas', 'Fiestas', 'Costumbres']]
  ];

  /* Una carta por mesa: el dibujo arriba, el nombre, de qué va, y la peana de
     color al pie. La peana es un PNG y no un degradado de CSS porque tiene
     forma —corazones, estrellas, nubes— y es lo que le da el aire de carta de
     juego a una pantalla que si no sería una lista de tres botones. */
  /* El nombre de la mesa, de la misma tabla y en un solo sitio. Sigue quitando
     un `<br>` que ya no trae ninguna: lo ponían las cartas del paso 0 para que
     «Con mi pareja» cupiera en 108 px, y cuesta una línea dejarlo por si vuelve
     un sitio estrecho. */
  function nombrePublico(clave) {
    for (var i = 0; i < PUBLICOS.length; i++) {
      if (PUBLICOS[i][0] === clave) return PUBLICOS[i][1].replace('<br>', ' ');
    }
    return PUBLICOS[0][1];
  }

  /* LA CARTA DE MESA, TAMBIÉN EN FILA (mismo mockup). El dibujo a la izquierda,
     el nombre y de qué va, y debajo TRES PALABRAS de lo que se discute ahí.

     LAS TRES PALABRAS NO SON DECORACIÓN: la frase de debajo ya dice de qué va
     la mesa, pero se lee entera o no se lee; los chips se ven de refilón y son
     lo que deja comparar las tres mesas sin leer los tres párrafos. Salen de la
     misma tabla `PUBLICOS`, en la cuarta columna, para que nombre, frase y
     chips no se puedan desincronizar. */
  /* ⚠️ AQUI ESTABA `cartaPublico`, la carta grande de cada mesa, y se fue con el
     paso 0 (titular, 2026-09-18): con quién se juega se elige ahora en la
     cabecera de la lista, sin cambiar de pantalla. Las tres piezas que usaba
     --el icono de la mesa, su peana y sus tres palabras-- siguen vivas: el icono
     lo pinta el selector nuevo y los chips los lee `PUBLICOS`. */

  var ultimaMesa;               // para saber cuándo se cambió de mesa

  function barajar() { azarDeTema = {}; }

  /* SE BARAJA CADA VEZ QUE SE ABRE UNA LISTA, y abrir una lista es dos cosas:
     entrar a la vista Catálogo —eso lo ve `irA`— y elegir mesa, que no cambia
     de vista y por eso hacía falta mirarlo aquí. Vale para las tres.

     LO QUE NO CUENTA COMO ABRIR es repintar la misma lista: escribir en el
     buscador o tocar un filtro. Ahí la lista se vuelve a pedir varias veces por
     segundo, y rebarajarla dejaría los temas saltando bajo el dedo justo
     mientras se intenta leer uno. */
  function barajarSiEsOtraMesa() {
    if (modoPublico === ultimaMesa) return;
    ultimaMesa = modoPublico;
    barajar();
  }

  function azarDe(id) {
    if (!(id in azarDeTema)) azarDeTema[id] = Math.random();
    return azarDeTema[id];
  }
  /* CON QUIEN SE JUEGA YA NO ES UNA PANTALLA (titular, 2026-09-18: «ya no
     usaremos una pantalla completa para seleccionar con quién se juega»). Era el
     paso 0 del catálogo —tres cartas grandes— y ahora es un SELECTOR dentro de
     la lista, al lado del de modo: se toca, la lista cambia en vivo y no hay que
     salir de donde se está para mirar los temas de la otra mesa.
     POR ESO NUNCA ES NULA: el catálogo abre siempre en una lista de verdad. La
     última elegida se recuerda —como el modo, el juez y la ficha del invitado—
     porque quien juega con su pareja no cambia de mesa cada vez. */
  var MESA_RECORDADA = 'atwi-mesa';
  function mesaGuardada() {
    var m = null;
    try { m = localStorage.getItem(MESA_RECORDADA); } catch (e) {}
    for (var i = 0; i < PUBLICOS.length; i++) if (PUBLICOS[i][0] === m) return m;
    return PUBLICOS[0][0];
  }
  function recordarMesa(m) {
    try { localStorage.setItem(MESA_RECORDADA, m); } catch (e) {}
  }
  var modoPublico = mesaGuardada();
  var busqueda = '';        // texto del buscador
  var filtro = 'todos';     // 'todos' | 'sin' | 'con'

  /* La CLAVE de la categoría sigue siendo «Mis temas»: es lo que llevan
     guardados los temas ya escritos, y cambiarla obligaría a migrarlos. Lo que
     cambia es cómo se llama en pantalla. */
  var ETIQUETA_MIS = 'Mis propios temas';

  /* LO QUE SE ELIGE NO SE LLAMA IGUAL EN LOS TRES MODOS. En Controversia y en
     Pacto es un TEMA —algo de lo que hablar—; en QuiénGane es un PREMIO —algo
     que llevarse—. Son cuatro frases y estaban escritas a mano en cuatro
     sitios: puestas aquí, el día que entre un modo más se añade una columna y
     no hay que ir a buscarlas.
     Se decide por `propuesta.modo` y no por un parámetro, porque las cuatro
     salen de la misma pantalla y esa pantalla ya sabe a qué se está jugando. */
  /* LA VARIANTE DE COLOR DEL BOTÓN, según el modo que se está jugando. El
     respaldo NO es cadena vacía: `boton--` a secas es una clase que no existe y
     el botón saldría en el lavanda de fábrica sin que nada avisara. */
  function claseDeModo() {
    var m = propuesta.modo;
    return m === 'negociacion' || m === 'competencia' ? m : 'debate';
  }

  /* EL TITULO DE UNA VISTA, CON SU DECORACION (mockup del titular, 2026-09-17):
     tres destellos amarillos a cada lado y el texto virando de la tinta al
     lavanda. Vive aqui y no escrito cinco veces porque son CINCO titulos —el
     saludo, «¿Con quien juegas?», la mesa, «Mis propios temas» y «Historial»—
     y una decoracion repetida a mano se queda a medias a la primera que
     alguien toque uno.

     ⚠️ Y EL TEXTO VA SUELTO, SIN `span`. Lo llevo un rato, porque con el `h1`
     hecho caja flexible el texto quedaba en una caja anonima que
     `background-clip: text` no puede pintar. Se cayo al llevar la misma
     decoracion a los titulos de MODAL: alli el texto lo fija el JS con
     `textContent`, que borraria cualquier envoltorio. Asi que los destellos
     dejaron de ser cajas flexibles y pasaron a `inline-block`, y con eso el
     titulo vuelve a ser un elemento normal con su texto dentro —que es lo que
     `background-clip` sabe recortar— y los dos sitios comparten UNA regla. */
  function tituloVista(html, estilo) {
    return '<h1 class="vista__titulo"' + (estilo ? ' style="' + estilo + '"' : '') + '>' +
        html + '</h1>';
  }

  function palabras() {
    var premio = propuesta.modo === 'competencia';
    return premio ? {
      mis: 'Mis propios premios',
      hay: 'Los premios que escribiste, para jugártelos.',
      vacio: 'Lo que quieras poner en juego y no está en la lista, escríbelo aquí.',
      cambian: 'Los premios cambian según con quién estés jugando.',
      escribir: 'Escribir un premio',
      jugar: 'Jugar por este premio',
      primero: 'Escribir el primer premio',
      ninguno: 'El catálogo trae los premios de siempre, pero los suyos son suyos. ' +
               'Escribe qué se lleva quien gane y se juega igual que cualquier otro.'
    } : {
      mis: ETIQUETA_MIS,
      hay: 'Los temas que escribiste, para debatir o negociar.',
      vacio: 'Lo que discutes y no está en la lista, escríbelo aquí para debatir o negociar.',
      cambian: 'Los temas cambian según con quién estés debatiendo.',
      escribir: 'Escribir un tema',
      jugar: 'Jugar este tema',
      primero: 'Escribir el primer tema',
      /* SIN «LAS DOS POSTURAS» (2026-09-18): se eliminaron del catálogo hace
         semanas —el tema es una pregunta y nadie elige lado— y este renglón
         seguía pidiéndolas. Es el mismo texto viejo que el titular señaló en el
         editor, en la pantalla de al lado. */
      ninguno: 'El catálogo trae las discusiones más comunes, pero las suyas son suyas. ' +
               'Escribe la pregunta y se juega igual que las demás.'
    };
  }

  /** Deja el catálogo como recién abierto: la lista de la mesa recordada, sin
   *  filtros ni búsqueda. Antes volvía a «¿con quién juegas?», que ya no existe. */
  function reiniciarCatalogo() {
    modoPublico = mesaGuardada();
    categoriaAbierta = null;
    busqueda = '';
    filtro = 'todos';
  }

  /* Elegido el modo en la portada, hay que poder verlo —y cambiarlo— sin
     llegar hasta el final. La cinta va arriba de todas las pantallas del
     catálogo, con el color del modo. */
  /* EL MODO TAMBIEN SE RECUERDA, y por lo mismo que la mesa (2026-09-18). Desde
     que el catálogo es la pantalla y no un paso, se entra a él por la pestaña de
     abajo tanto como desde la portada, y quien entraba por ahí veía la lista
     **sin cinta**: ni a qué modo pertenece ni cómo cambiarlo, y al tocar un tema
     se jugaba el modo de fábrica sin que nadie lo hubiera dicho. */
  var MODO_RECORDADO = 'atwi-modo';
  function modoGuardado() {
    var m = null;
    try { m = localStorage.getItem(MODO_RECORDADO); } catch (e) {}
    return cfg.modos[m] ? m : Object.keys(cfg.modos)[0];
  }
  function recordarModo(m) {
    try { localStorage.setItem(MODO_RECORDADO, m); } catch (e) {}
  }

  function cintaModo() {
    /* Sin modo elegido se usa el recordado, y se deja puesto: lo que la cinta
       enseña tiene que ser lo que la partida va a llevar. */
    if (!propuesta.modo) propuesta.modo = modoGuardado();
    var m = cfg.modos[propuesta.modo] || {};
    return '<button class="cinta-modo cinta-modo--' + propuesta.modo + '" ' +
            'data-accion="cambiar-modo" aria-label="Cambiar de modo">' +
        /* El rótulo dibujado en lugar de icono más nombre: ya trae dentro su
           icono y su color, así que ponerle otro al lado era decirlo dos veces. */
        rotuloModo(propuesta.modo, 'cinta-modo__rotulo') +
        /* CON EL NOMBRE Y LA LÍNEA DE QUÉ SE JUEGA (mockup del titular,
           2026-09-16). La cinta llevaba el dibujo y un botón de «Cambiar modo»,
           y nada más: quien entra al catálogo sin venir de la portada veía un
           rótulo y no sabía a qué había entrado. La frase es la misma `gancho`
           que usan las cartas de la portada — un solo sitio. */
        '<span class="cinta-modo__texto">' +
          '<span class="cinta-modo__nombre">Modo ' + esc(m.nombre || '') + '</span>' +
          (m.gancho ? '<span class="cinta-modo__que">' + esc(m.gancho) + '</span>' : '') +
        '</span>' +
        /* SIN LA PALABRA (titular). Decía «Cambiar modo» al lado del icono de
           cambiar: el dibujo ya es el reciclaje, así que la palabra repetía lo
           que el signo dice, y aquí el sitio se lo come el texto descriptivo.
           El nombre vive en el `aria-label` del botón. */
        '<span class="cinta-modo__cambiar">' + icono('cambiar', 26) + '</span>' +
      '</button>';
  }

  function pintarCatalogo() {
    var caja = $('#v-catalogo');
    var cinta = cintaModo();
    /* EN QUE PASO VA, para que el CSS pueda poner el fondo que toca. Se marca
       aqui y no se deduce del contenido: el paso ya se decide en esta funcion y
       leerlo de la pantalla seria adivinar lo que ya se sabe. */
    /* CON QUIÉN SE JUEGA, A LA CAPA DE DATOS, y se fija AQUÍ —un solo sitio—
       en vez de en cada punto donde cambia `modoPublico`: así no hay manera de
       que la lista se pinte con el filtro de la otra mesa. */
    barajarSiEsOtraMesa();
    datos.publicoDeJuego(modoPublico);
    /* Y QUÉ CLASE DE FICHA TOCA. En QuiénGane no se elige un tema de qué hablar
       sino un premio que llevarse, y los dos viven en el mismo catálogo. Va
       aquí, junto a la mesa, porque las dos cosas acotan la misma lista y
       separarlas sería tener dos sitios donde acordarse de lo mismo. */
    datos.claseDeJuego(propuesta.modo === 'competencia' ? 'premio' : 'tema');
    caja.dataset.paso = modoPublico || 'modo';
    caja.dataset.modo = propuesta.modo || '';

    /* ⚠️ AQUI ESTABA EL PASO 0 —las tres cartas de «¿Con quién juegas?»— y se fue
       entero (titular, 2026-09-18). Lo que hacía ahora lo hace el selector de la
       cabecera, en vivo y sin cambiar de pantalla. */

    datos.catalogo().then(function (cat) {
      var buscando = busqueda.trim() !== '' || filtro !== 'todos';

      /* LA ÚNICA COLECCIÓN QUE SIGUE ABRIÉNDOSE APARTE SON LOS TEMAS PROPIOS, y
         no es una categoría que se salvó: es de quien juega, se escribe desde
         dentro y puede estar vacía, así que mezclada entre los 105 del catálogo
         no tendría dónde poner su botón de escribir ni su estado vacío.
         Aquí había además la rama de las doce categorías del catálogo; se fue
         con ellas. */
      if (categoriaAbierta === datos.MIS_TEMAS) {
        var mios = datos.temasDe(datos.MIS_TEMAS);
        var visibles = datos.buscar(busqueda, filtro);
        var temas = mios.filter(function (x) { return visibles.indexOf(x) !== -1; });

        caja.innerHTML = cinta +
          '<div class="fila fila--cabecera" style="margin-bottom:var(--e-3)">' +
            '<button class="boton-icono" data-accion="catalogo-atras" aria-label="Volver al catálogo">' + icono('atras', 22) + '</button>' +
            /* SIN LA MANITO ✍️ delante del título (titular, 2026-09-16): era un
               emoji —lo dibujaba el sistema— y encima decía lo mismo que el
               botón de debajo, que sí lleva el icono de la casa. */
            '<div class="centrado">' +
              tituloVista(esc(palabras().mis), 'font-size:var(--t-h2)') +
              '<p class="chico suave">' + temas.length + ' de ' + mios.length + '</p></div>' +
            /* EL ICONO DE CREAR VA JUNTO AL TITULO (titular, 2026-09-18), en la
               tercera columna de la cabecera —el mismo sitio donde el catalogo
               lleva la lupa—. De el sale el globo de escribir, y por eso se fue
               el boton grande que habia debajo: eran dos maneras de decir lo
               mismo, y la de abajo empujaba la lista una fila entera hacia
               abajo en la unica pantalla donde lo que se viene a ver es la
               lista. */
            '<button class="boton-icono" data-accion="tema-nuevo" ' +
              'aria-label="' + esc(palabras().escribir) + '" ' +
              'title="' + esc(palabras().escribir) + '">' + icono('mas', 26) + '</button>' +
          '</div>' +

          (temas.length
            ? '<div class="ruleta ruleta--vuelta">' + temas.map(tarjetaTema).join('') + '</div>'
            /* Y EL DIBUJO DEL HUECO ES EL MISMO «MÁS», y se toca: aquí solo hay
               una cosa que hacer, así que el sitio donde se mira es el sitio
               donde hay que poder tocar. */
            : estadoVacio(icono('mas', 76), 'Todavía no escribieron ninguno',
                palabras().ninguno, 'tema-nuevo', palabras().primero));
        ajustarRuleta();
        devolverFoco();
        return;
      }

      /* LA LISTA VA DIRECTA, SIN CARPETAS (petición del titular, 2026-09-16).
         Había un paso intermedio de doce categorías —«En la cocina y la mesa»,
         «En la alcoba»— y para llegar a un tema había que acertar primero en
         qué carpeta lo habían guardado. Ese acierto es trabajo de quien busca y
         lo hace sobre un reparto que no eligió: un tema de horarios puede estar
         en «rutinas» o en «pantallas» y las dos son defendibles.

         Lo que las categorías daban —el orden de «por dónde suele salir la
         discusión»— NO se pierde: `datos.todos()` mantiene ese orden, así que
         la lista corrida sigue empezando por lo que sale antes. Lo que
         desaparece es tener que abrir una carpeta para verlo. */
      /* DOS REGLAS DE ORDEN, Y LA PRIMERA MANDA (titular, 2026-09-16):

         1. LOS YA DEBATIDOS AL FINAL. Con 105 temas de corrido, los jugados
            quedaban repartidos por la lista y empujaban hacia abajo a los que
            todavía se pueden jugar, que son a los que se viene. No se ESCONDEN
            —el chip «Ya debatidos» los trae de vuelta—: solo dejan pasar.
         2. LOS PENDIENTES, AL AZAR. Ver `azarDeTema`.

         Los ya debatidos NO se barajan: ahí no se busca novedad sino volver a
         encontrar uno concreto, y para eso el orden estable ayuda. */
      var temas = datos.buscar(busqueda, filtro).slice().sort(function (a, b) {
        var da = datos.yaDebatido(a.id) ? 1 : 0;
        var db = datos.yaDebatido(b.id) ? 1 : 0;
        if (da !== db) return da - db;
        return da ? 0 : azarDe(a.id) - azarDe(b.id);
      });
      var propios = datos.cuantosPropios();

      caja.innerHTML = cinta +
        '<div class="fila fila--cabecera fila--mesas" style="margin-bottom:var(--e-3)">' +
          /* LAS TRES MESAS A LA VISTA, NO UNA QUE ROTA (titular, 2026-09-18). El
             disco que rotaba pedía tocar dos veces para llegar a la tercera y no
             decía cuántas hay ni cuál es la otra; con las tres puestas, cambiar
             es un toque y siempre el mismo. Es la fila del juez otra vez: seis
             piezas iguales de las que solo una está puesta, aquí con tres.
             El manejador es el de siempre —`data-publico`—, que se quedó vivo
             cuando se fueron las cartas del paso 0. */
          '<div class="mesas-fila" role="group" aria-label="Con quién juegas">' +
            PUBLICOS.map(function (x) {
              var puesta = x[0] === modoPublico;
              return '<button type="button" class="mesas-fila__mesa"' +
                ' data-publico="' + x[0] + '" aria-pressed="' + puesta + '"' +
                ' aria-label="' + esc(nombrePublico(x[0])) + '"' +
                ' title="' + esc(nombrePublico(x[0])) + '">' +
                /* 36 Y NO 30: estas pegatinas dejan como un tercio del cuadro en
                   transparente —lo mismo que ya está medido para las bombillas y
                   los play—, así que a 30 el dibujo se queda en 20 y la fila
                   parecía tres puntos. */
                icono(x[0], 36) + '</button>';
            }).join('') +
          '</div>' +
          tituloVista(nombrePublico(modoPublico), 'font-size:var(--t-h2)') +
          botonBuscar() +
        '</div>' +
        /* AQUÍ IBA «105 temas, ordenados por dónde y cuándo suele salir la
           discusión. Llevas 7 debatidos.» Lo quitó el titular: describía el
           reparto por categorías, que ya no existe, y además dos renglones
           fijos de letra chica en la primera pantalla son dos renglones que se
           leen una vez y se saltan siempre. */
        barraBusqueda() +
        /* La cuenta solo sale cuando se acotó algo. Fija era una descripción;
           así es la respuesta a lo que acabas de pedir. */
        (buscando
          ? '<p class="chico suave" style="margin:var(--e-3) 0 0">' +
              temas.length + ' de ' + cat.total + ' temas</p>'
          : '') +

        /* El catálogo es una plantilla: lo que no está, se escribe. Va ARRIBA
           de la lista, porque escribir el tema propio es lo que hace que la
           pareja vuelva cuando el catálogo se acaba. */
        /* SIN EMOJI A LA IZQUIERDA Y CON EL «MÁS» DIBUJADO A LA DERECHA
           (titular, 2026-09-16). Llevaba la manito ✍️ —un emoji, o sea la única
           pieza de esta tarjeta que dibujaba el sistema— y a la derecha un signo
           «+» escrito con la tipografía. Dos maneras distintas de decir «aquí se
           crea algo», y ninguna de las dos era el icono que el juego ya tiene
           para crear. Ahora la tarjeta dice una cosa sola, y la dice con el
           dibujo. Cuando ya hay temas propios, ese sitio lleva cuántos son:
           entonces el dato manda sobre la invitación. */
        '<button class="categoria categoria--propia categoria--sin-emoji" ' +
                'data-categoria="' + esc(datos.MIS_TEMAS) + '">' +
          '<span><span class="categoria__nombre">' + esc(palabras().mis) + '</span>' +
          '<span class="categoria__que">' +
            esc(propios ? palabras().hay : palabras().vacio) +
          '</span></span>' +
          '<span class="categoria__n">' + (propios || icono('mas', 34)) + '</span>' +
        '</button>' +

        (temas.length
          ? '<div class="ruleta ruleta--vuelta">' + temas.map(tarjetaTema).join('') + '</div>'
          : estadoVacio(icono('lupa', 76), 'Nada por aquí', 'Prueba con otra palabra o cambia el filtro.'));
      ajustarRuleta();
      devolverFoco();
    }).catch(function () {
      caja.innerHTML = estadoVacio('😕', 'No se pudo cargar el catálogo', 'Comprueba que estás sirviendo el sitio con tools/servir.ps1 y no abriendo el archivo directamente.');
    });
  }

  /* ======================================================================
     Vista: Historial
     ====================================================================== */
  /* EL HISTORIAL SALE DEL SERVIDOR, no de `localStorage`. Se escribio cuando no
     habia backend y leia `p.partidas`, que no se llena nunca: por eso salia
     vacio aunque hubiera partidas jugadas.

     Y se puede volver a oir, que es para lo que existe: la voz del personaje se
     guarda sin plazo, asi que una partida de hace meses se escucha igual. */
  var historial = null;
  /* DE DIEZ EN DIEZ (titular, 2026-09-18). La lista traía las veinte últimas de
     una vez, con sus turnos anidados, y hasta que llegaban no se pintaba nada.
     Diez es lo que cabe de sobra en la primera pantalla; el resto se pide
     tocando, que es cuando se sabe que hace falta. */
  var POR_TANDA = 10;
  /* Si la última tanda vino LLENA, puede haber más. Es lo único que se puede
     saber sin pedir la cuenta entera al servidor, y pedirla sería otra consulta
     para decidir si enseñar un botón. */
  var hayMasHistorial = true;
  var trayendoMas = false;
  /* CADUCA, NO SE BORRA (2026-09-18, al mirar por qué «tarda en refrescar»).
     Terminar una partida o borrar una ponía `historial = null`, así que al
     volver a la pantalla no había nada que pintar y salía «Buscando tus
     partidas…» hasta que contestara el servidor. Medido: el viaje a Oregón con
     RLS son ~250 ms de suelo pase lo que pase, o sea un cuarto de segundo de
     pantalla vacía cada vez que se vuelve. Ahora la lista vieja se queda puesta
     y la nueva la reemplaza cuando llega: lo único que cambia entre las dos es
     una tarjeta. */
  var historialCaducado = false;
  var refrescando = false;

  function pintarHistorial() {
    var caja = $('#v-historial');
    var titulo = tituloVista('Historial', 'margin-bottom:var(--e-4)');

    if (!window.ATWI.nube || !window.ATWI.nube.hay()) {
      caja.innerHTML = titulo + estadoVacio(icono('historial', 76), 'Entrá con tu cuenta',
        'El historial vive en el servidor, para que lo tengas en cualquier teléfono. ' +
        'Sin sesión no hay nada que traer.');
      return;
    }

    if (!historial) {
      caja.innerHTML = titulo + '<p class="chico tenue">Buscando tus partidas…</p>';
      window.ATWI.nube.historial(POR_TANDA).then(function (l) {
        historial = l || [];
        hayMasHistorial = historial.length >= POR_TANDA;
        /* Lo nuevo ya está aquí: si algo lo había marcado caducado, deja de
           estarlo. Sin esto, el primer repintado lanzaba OTRA consulta encima
           —medido: dos viajes de 642 y 279 ms para la misma lista—. */
        historialCaducado = false;
        if (vistaActual === 'historial') pintarHistorial();
      });
      /* ⚠️ Y LAS ACTAS YA NO SE PIDEN AQUI (2026-09-18). Se pedían en paralelo
         «sin esperarlas», y esperar no era el problema: **las llamadas a
         Supabase se encolan**, así que esa consulta le sumaba su turno a la que
         la persona sí está esperando. Medido en este navegador: cuatro
         consultas a la vez tardan 286, 547, 831 y 1.075 ms —una detrás de otra,
         ~270 ms cada una— mientras que cuatro al servidor local van en 3, 3, 4
         y 5 ms. O sea que cada llamada de más en el arranque del historial es un
         cuarto de segundo para la última de la cola.
         Y NO HACEN FALTA: el aviso de borrado solo necesita saber si ESA partida
         tiene acta, y eso viaja dentro de la propia partida —el `select` del
         historial trae `acuerdos(tipo,version,texto,…)` anidado desde el
         2026-09-18—. La lista entera solo la necesita el chip «Acuerdos», que
         la pide al tocarlo (`pintarActas`). */
      return;
    }

    /* LO VIEJO SE SIGUE VIENDO MIENTRAS LLEGA LO NUEVO. Se pide TODO lo que ya
       estaba cargado —no solo la primera tanda— o volver de una partida
       encogería una lista que la persona acababa de desplegar. */
    if (historialCaducado && !refrescando) {
      refrescando = true;
      historialCaducado = false;
      window.ATWI.nube.historial(Math.max(POR_TANDA, historial.length)).then(function (l) {
        refrescando = false;
        if (l) historial = l;
        if (vistaActual === 'historial') pintarHistorial();
      }).catch(function () { refrescando = false; });
    }

    if (!historial.length) {
      /* ESTE TEXTO DECÍA QUE LAS RONDAS A MEDIAS NO ENTRAN, y eso cambió
         (2026-09-15): ahora entran y se retoman. Lo que sí sigue siendo verdad
         es que una ronda sin ninguna intervención no aparece: no hay nada que
         oír ni que seguir. */
      caja.innerHTML = titulo + estadoVacio(icono('historial', 76), 'Todavía no hay nada',
        'Aquí van a estar sus partidas: las terminadas, con su resultado, y las que ' +
        'dejaron a medias, para seguirlas cuando quieran. El historial nunca se ' +
        'sobrescribe: una revancha añade una versión nueva y la anterior sigue ahí.');
      return;
    }

    /* LAS ACTAS SON OTRA VISTA DE ESTA PANTALLA, NO OTRA PANTALLA (corrección
       del titular, 2026-09-15). Estaban detrás de una tarjeta que abría un
       modal, y eso obliga a salir de donde estabas para volver a entrar. Como
       chip, se cambia de lo que se está mirando sin moverse de sitio: las
       partidas de este móvil, las de en línea, o lo que acordaron. */
    if (vistaHistorial === 'actas') return pintarActas(caja, titulo);

    /* EL FILTRO NO TIENE «TODAS» (decisión del titular, 2026-09-15). Local y en
       línea son dos maneras de jugar que esperan cosas distintas: en la local
       están los dos delante y la partida se termina de una sentada; en la de en
       línea se manda lo propio y se espera. Mezcladas en una lista, la de en
       línea --que es la que pide algo de vos-- se pierde entre las otras. */
    var lista = historial.filter(function (d) {
      return esEnLinea(d) === (vistaHistorial === 'linea');
    });

    /* LAS QUE PIDEN ALGO VAN PRIMERO, Y DESPUÉS MANDA LA FECHA (titular,
       2026-09-18). El orden era solo cronológico —`creado.desc` del servidor—,
       así que una partida que me espera desde el martes quedaba debajo de tres
       terminadas de hoy: la campana la señala, pero hay que bajar la lista para
       encontrarla, y eso es trabajo que la app puede hacer.

       ⚠️ SON DOS GRUPOS Y NO UNA PUNTUACIÓN. Dentro de cada uno el orden sigue
       siendo el de siempre —lo reciente arriba— porque `sort` es estable en JS
       desde ES2019 y la lista llega ya ordenada por fecha: comparando solo por
       «me espera» los empates no se tocan. Ordenar además por tipo de espera
       —primero las de grabar, luego los resultados— sería inventar una prioridad
       que nadie pidió y que cambiaría de sitio las tarjetas entre visitas.

       Y NO SE MARCA UN CORTE entre los dos grupos: la campana ya dice cuáles
       son, y una raya de «pendientes» partiría en dos una lista que se lee
       bajando. */
    lista.sort(function (a, b) {
      return (meEspera(b) ? 1 : 0) - (meEspera(a) ? 1 : 0);
    });

    caja.innerHTML = titulo + barraDondeJuego() +
      (lista.length ? '' : (vistaHistorial === 'linea'
        ? estadoVacio(icono('buzon', 76), 'Todavía no hay partidas en línea',
            'Cada quien juega desde su teléfono: mandas lo tuyo y te avisamos ' +
            'cuando conteste la otra parte. Se invita desde «Antes de empezar», ' +
            'eligiendo «Con invitación».')
        : estadoVacio(icono('historial', 76), 'Ninguna partida en este teléfono',
            'Aquí van las que juegan los dos sentados en el mismo móvil.'))) +
      /* LA MISMA RULETA QUE EL CATÁLOGO (titular, 2026-09-18), y por lo mismo:
         el título y los tres chips son los MANDOS de la lista y se quedan
         quietos; lo que se desliza es la lista, con sus tarjetas siempre
         enteras y el hueco repartido.
         ⚠️ PERO AQUÍ NO DA LA VUELTA: *«no será ruleta infinita, sino
         desplazamiento normal hasta terminar lista o encontrar el botón de
         cargar más»*. Y es la decisión correcta: el catálogo es un fichero de
         455 fichas donde nadie busca «la última», y esto es un registro con
         principio y final —el final significa algo, y dar la vuelta lo
         borraría—. La marca es `ruleta--vuelta`, que solo lleva el catálogo. */
      (lista.length ? '<div class="ruleta">' : '') +
      lista.map(function (d) {
        var t = d.turnos_grabados || [];
        /* EL ESTADO VA ARRIBA DEL TODO y no en el pie: es el motivo por el que
           esa fila se toca, y un aviso debajo de la duración se lee después de
           haber decidido. */
        var e = estadoDe(d);
        var rot = ROTULO_ESTADO[e];
        /* Y CUÁNTO LE FALTA, que en una partida a medias es el dato. «3 de 6»
           dice de un vistazo si queda una tarde o un minuto.
           NINGUNA FILA SE PINTA BLOQUEADA: todas llevan a algún sitio. */
        var total = (d.turnos || 3) * 2;
        /* EL AVANCE SE DICE SIEMPRE, incluso «0 de 6» (petición del titular,
           2026-09-15). Decía «sin intervenciones», que suena a partida rota;
           «0 de 6» dice lo mismo y además dice que está esperando el primer
           turno. Y en una partida remota eso no es un detalle: el invitado pudo
           haberla aceptado y no haber hablado todavía, y esa diferencia
           --aceptada pero sin empezar-- solo se ve con el contador puesto.

           VA PEGADO AL ESTADO Y SIN FRASE. Primero llevaba además un «seguir
           jugando» o un «pedir el resultado», y en 375 px esa fila competía con
           los dos nombres: los apretaba hasta «Mo…» y «Di…». La frase no hacía
           falta —el estado ya dice qué es— y los nombres sí. */
        var avance = t.length + ' de ' + total;
        /* LOS DATOS ARRIBA Y LA PREGUNTA DE CUERPO (rediseño pedido por el
           titular, 2026-09-15, sobre la tarjeta dibujada). Antes la pregunta iba
           en medio y todo lo demás repartido encima y debajo, así que para saber
           de qué partida se trataba había que leer la tarjeta entera de arriba
           abajo. Ahora hay dos zonas: una CABECERA con todo lo que identifica y
           sitúa --en qué estado está, cuándo fue, quiénes jugaron y por dónde
           van-- y debajo la pregunta sola, que es lo que se lee. */
        /* EL DÍA Y EL MODO VAN JUNTOS, EN LA MISMA LÍNEA (ajuste del titular,
           2026-09-15). El rótulo vivía en una columna aparte a la derecha y
           quedaba un par de píxeles por debajo del día, que es de esas cosas que
           no se saben nombrar pero se ven. Puestos en la misma fila se alinean
           solos y además se leen como lo que son: las dos señas de la partida
           --cuándo fue y a qué se jugó--. */
        /* EL MODO VA EN LA TARJETA, para que el CSS pueda teñir con él. Lo pide
           el rótulo de estado, que desde el 2026-09-18 lleva el color del modo
           de ESA partida y no el de su estado. */
        return '<div class="tarjeta partida-fila" data-familia="' +
            (FAMILIA[e] || 'hecha') + '" data-modo="' +
            esc(MODOS_CON_PEANA[d.modo] ? d.modo : 'debate') + '">' +
          '<button class="partida" ' +
            (rot ? 'data-tono="' + rot[1] + '" ' : '') +
            'data-partida="' + esc(d.id) + '">' +
            /* Fila 1: en qué estado está y por dónde va · cuándo y a qué. */
            '<span class="partida__alto">' +
              /* Sin clase por estado: el color lo pone el MODO desde la
                 tarjeta, así que aquí ya no se distingue lo terminado. */
              '<span class="partida__estado">' +
                esc(rot ? rot[0] : 'Terminada') +
                '<span class="partida__avance">' + esc(avance) + '</span>' +
              '</span>' +
              /* ⚠️ AQUI IBA EL ROTULO DEL MODO Y SE FUE (titular, 2026-09-18):
                 lo dice la PEANA del pie, que lleva su color y su dibujo. Con
                 las dos cosas, cada tarjeta decía dos veces de qué modo era —y
                 el rótulo, además, en la esquina donde menos se mira—. */
              '<span class="partida__senas">' +
                '<span class="partida__cuando">' + esc(cuando(d.creado)) + '</span>' +
              '</span>' +
            '</span>' +
            /* Fila 2: quiénes jugaron. */
            '<span class="partida__alto">' + quienesJugaron(d) + '</span>' +
            '<span class="partida__tema">' + esc(d.enunciado || 'Sin tema') + '</span>' +
          '</button>' +
          /* LA PAPELERA VA SIEMPRE, tenga turnos o no. Una partida vacia
             tambien ocupa sitio en la lista, y no poder quitarla obliga a
             cargar con ella para siempre. Abajo a la derecha: es lo ultimo que
             se decide sobre una tarjeta, y arriba competia con el modo. */
          /* LA QUE ME ESPERA LLEVA SU CAMPANA (titular, 2026-09-18). Antes era
             la TARJETA ENTERA la que respiraba con un halo dorado, y el titular
             la quiere como las demás: lo que late es un signo dentro, encima de
             la papelera. Dos motivos que se ven al ponerlo: una tarjeta que
             brilla entera no dice QUÉ hay que hacer ni dónde tocar, y con el
             velo y la peana nuevos el halo competía con el dibujo del pie.
             ES LA CAMPANA DEL BUZÓN, y no el disco rojo de aviso: en esta app la
             campana ya significa «hay algo para ti» —late en la cabecera cuando
             el buzón trae algo— y ninguna de las tres cosas que esperan aquí es
             un problema. Un rojo diría avería sobre una partida a medias. */
          (meEspera(d)
            /* DOS CAMPANAS EN LA MISMA CASILLA (titular, 2026-09-18: «lo que
               aparece y desaparece no es el icono, es el glow»). La de abajo
               lleva el brillo y es la que se desvanece; la de arriba, sin
               brillo, tapa el dibujo de la otra y se queda quieta. Un
               `drop-shadow` no se puede desvanecer solo --va pegado a su
               dibujo--, así que se desvanece un dibujo entero detrás de otro
               idéntico: lo único que se ve ir y venir es el halo. */
            ? '<span class="partida__espera" aria-hidden="true">' +
                '<span class="partida__espera-brillo">' + icono('buzon', 26) + '</span>' +
                icono('buzon', 26) + '</span>'
            : '') +
          '<button class="partida__borrar" data-borrar="' + esc(d.id) + '"' +
            ' aria-label="Borrar esta partida">' +
            icono('papelera', 22) + '</button>' +
          /* EL ZOCALO DIBUJADO, el mismo de las cartas de selección (titular,
             2026-09-18). Es lo que dice de qué modo fue la partida —por eso el
             rótulo de arriba sobra— y lo que convierte la fila en una carta de
             juego. Va al final del HTML y detrás de todo por `z-index`: no
             ocupa sitio, el hueco se lo hace el relleno de la tarjeta. */
          '<img class="partida__base" src="../assets/img/iconos/base-' +
            esc(MODOS_CON_PEANA[d.modo] ? d.modo : 'debate') + '.png" alt="" aria-hidden="true">' +
        '</div>';
      }).join('') +

      /* «CARGAR MÁS» AL FINAL, y solo si la última tanda vino llena. No dice
         cuántas quedan porque no se sabe: saberlo costaría una consulta de
         cuenta entera cada vez que se abre el historial, y eso es justo lo que
         esta pantalla viene a dejar de hacer.
         ⚠️ Y SOLO SI HAY LISTA QUE ALARGAR (titular, 2026-09-18: «el botón
         cargar más es solamente para cuando hay algo más que cargar y existan
         más de las que carga por bloque»). Aquí se contaba únicamente contra lo
         TRAÍDO, y el filtro de local / en línea es del cliente: en la pestaña de
         en línea —donde hoy no hay ninguna— salía el botón **debajo del estado
         vacío**, ofreciendo alargar una lista que no existe. Se defendió en su
         momento con que había más partidas que mirar; es verdad y da igual, lo
         que se lee es «cargar más» encima de «todavía no hay partidas».
         La cuenta que manda es la de lo que se VE: si la pestaña no tiene nada,
         no hay nada que alargar. */
      /* Y «CARGAR MÁS» ES LA ÚLTIMA TARJETA de la lista, no algo debajo de
         ella: así entra en el mismo reparto y en el mismo snap que las demás
         —el deslizamiento acaba en él— en vez de quedarse colgando al final de
         un contenedor que no scrollea. */
      (hayMasHistorial && lista.length
        /* ⚠️ EL HUECO ES DEL TAMAÑO DE UNA TARJETA, EL BOTÓN NO (titular,
           2026-09-18: «el botón ocupa el área pero es de tamaño normal»).
           Poniéndole el alto al propio botón salía uno de 153 px, que es medio
           teléfono de botón. Lo que necesita medir una tarjeta es la CASILLA
           —para que el reparto y el snap cuadren—, y dentro el botón va
           centrado con su alto de siempre. */
        ? '<div class="partida-mas">' +
            '<button class="boton boton--bloque boton--suave boton--punteado" ' +
              'data-accion="mas-historial"' + (trayendoMas ? ' disabled' : '') + '>' +
              (trayendoMas ? 'Trayendo…' : 'Cargar más') +
            '</button>' +
          '</div>'
        : '') +
      (lista.length ? '</div>' : '');

    ajustarRuleta();
  }

  /* LA TANDA SIGUIENTE. Se pide saltándose las que ya están, y se añaden al
     final: el orden del servidor es por fecha y el de la pantalla lo decide
     `pintarHistorial` cada vez que pinta.
     ⚠️ Y LO QUE ESPERA SOLO SUBE DENTRO DE LO CARGADO. Una partida que me espera
     y está en la tanda 3 no puede saltar a la primera pantalla sin traerla, y
     traerla es justamente lo que esto viene a no hacer de golpe. */
  function masHistorial() {
    if (trayendoMas || !hayMasHistorial || !historial) return;
    trayendoMas = true;
    pintarHistorial();
    window.ATWI.nube.historial(POR_TANDA, null, historial.length).then(function (l) {
      trayendoMas = false;
      var nuevas = l || [];
      hayMasHistorial = nuevas.length >= POR_TANDA;
      /* Sin repetidas: entre una tanda y otra puede haberse terminado una
         partida, y entonces el `offset` deja pasar dos veces la misma. */
      var yaEstan = {};
      (historial || []).forEach(function (d) { yaEstan[d.id] = 1; });
      historial = (historial || []).concat(nuevas.filter(function (d) {
        return !yaEstan[d.id];
      }));
      if (vistaActual === 'historial') pintarHistorial();
    }).catch(function () {
      trayendoMas = false;
      if (vistaActual === 'historial') pintarHistorial();
    });
  }

  /* QUE PEANAS HAY. Se mira antes de componer el nombre del archivo porque una
     partida vieja puede traer un modo que ya no exista, y un `src` a un PNG que
     no está deja un hueco roto en mitad de la lista. */
  var MODOS_CON_PEANA = { debate: 1, negociacion: 1, competencia: 1 };

  /* --- Borrar una partida ------------------------------------------------------
     SE PREGUNTA ANTES, Y SE DICE QUE SE LLEVA. Quien no usa abogado suena con su
     propia voz, y esa grabacion se conserva para poder volver a oirla: es la
     unica que hay. Borrar la partida la borra de verdad --el archivo, no solo la
     fila-- y eso no se deshace. Un boton de papelera que actua al primer toque
     seria perder una conversacion por rozar la pantalla.

     Y ES LA PERSONA QUIEN DECIDE, no un plazo. Decision del titular
     (2026-09-13): si se guarda indefinidamente, tiene que poder quitarse cuando
     se quiera, y sin dar explicaciones ni esperar a que caduque. */
  /* EN UN GLOBO Y NO EN UN MODAL (titular, 2026-09-17). Esto abría `m-olvidar`
     a pantalla completa, con su cabecera, su flecha de volver y el enunciado de
     la partida repetido dentro. Y el globo lo hace mejor por lo mismo que las
     ayudas del home: SALE DE LA PAPELERA QUE SE TOCÓ y deja ver la tarjeta
     debajo, así que no hay que repetir de qué partida se habla —se está viendo—.
     Un modal a pantalla completa es la ceremonia de ENTRAR a algo, y aquí no se
     entra a ningún sitio: se contesta que sí o que no.

     EL TINTE ES EL DEL MODO DE ESA PARTIDA, no el de lo que se esté jugando:
     puede ser de otro modo y de hace meses. Y el signo es la PAPELERA, no la
     bombilla: la bombilla es de las ayudas y aquí no se explica nada.

     SE PREGUNTA ANTES, Y SE DICE QUE SE LLEVA. Quien no usa abogado suena con su
     propia voz, y esa grabacion se conserva para poder volver a oirla: es la
     unica que hay. Borrar la partida la borra de verdad --el archivo, no solo la
     fila-- y eso no se deshace. Un boton de papelera que actua al primer toque
     seria perder una conversacion por rozar la pantalla.

     Y ES LA PERSONA QUIEN DECIDE, no un plazo. Decision del titular
     (2026-09-13): si se guarda indefinidamente, tiene que poder quitarse cuando
     se quiera, y sin dar explicaciones ni esperar a que caduque. */
  function abrirOlvidar(id, disparador) {
    var d = (historial || []).filter(function (x) { return x.id === id; })[0];
    if (!d || !disparador) return;
    var t = d.turnos_grabados || [];
    /* Cuantas se oyen con la voz de quien las dijo. Son las que de verdad
       desaparecen: las del abogado son un dibujo leyendo un texto. */
    /* Desde el 2026-09-18 no hay grabaciones propias: la original no se guarda
       nunca y todo se oye con la voz del personaje. */
    var texto = t.length
      ? 'Se van las ' + t.length + ' intervenciones y el resultado. ' +
        'Todas se oyen con la voz del personaje; tu voz nunca se guardó.'
      : 'Esta partida no llegó a tener intervenciones.';

    /* Y EL ACTA SE VA CON ELLA, que es lo que nadie espera (lo señaló el
       titular, 2026-09-15). `acuerdos.debate` es `on delete cascade`, así que
       borrar la partida se lleva el acuerdo que firmaron en ella --y eso se
       consulta meses después, cuando ya nadie se acuerda de qué partida
       salió--. Avisarlo aquí es la diferencia entre borrar una grabación y
       perder sin querer lo que quedaron. */
    if (actaDe(id)) {
      texto += ' Y se va el acuerdo que firmaron, el de «Lo que acordaron».';
    }

    /* LOS DOS DEL MISMO TAMAÑO Y EL BLANCO PUNTEADO, como todos los pares del
       juego. El globo se cierra tocando fuera, así que «dejarla donde está»
       podría no existir; se queda porque en un borrado que no se deshace la
       salida tiene que verse, no deducirse. */
    var acciones =
      '<p class="chico olvidar-fallo" hidden></p>' +
      '<button class="boton boton--bloque boton--suave boton--borrar"' +
        ' data-olvidar-ya="' + esc(id) + '">Borrarla</button>' +
      '<button class="boton boton--suave boton--bloque boton--punteado" ' +
        'data-cerrar-globo>Dejarla donde está</button>';

    abrirGlobo(disparador,
      { titulo: 'Borrar esta partida', texto: texto, clave: 'No se puede deshacer.' },
      /* 83 y no 96: es lo que deja el dibujo de la papelera del tamaño del de la
         bombilla —96 × 73/84—, medido sobre los dos PNG. */
      { tinte: d.modo || 'debate', signo: 'papelera', signoTam: 83,
        etiqueta: 'Borrar esta partida', acciones: acciones });
  }

  function olvidarPartida(id, boton) {
    boton.disabled = true;
    boton.textContent = 'Borrando…';
    window.ATWI.nube.olvidar(id).then(function (r) {
      if (!r || !r.borrado) {
        boton.disabled = false;
        boton.textContent = 'Reintentar';
        /* ENCIMA DE LOS BOTONES, no al final del modal: puesto al final cae
           debajo de «dejarla donde está» y se lee después de las dos salidas,
           cuando lo que dice es justo por qué una de ellas no funcionó. Vive en
           el pie, ya creado y escondido. */
        var aviso = document.querySelector('.globo .olvidar-fallo');
        if (!aviso) return;
        aviso.hidden = false;
        /* SE DICE QUE NO SE BORRO NADA, y es verdad: la funcion de borde no
           toca la fila si los audios no se fueron. Decir «puede que si, puede
           que no» sobre la voz de alguien es lo peor que se puede contestar.

           Y SE DICE POR QUE. Esto era una sola frase sin causa, asi que cuando
           fallo de verdad --el titular, 2026-09-15-- no habia nada que mirar ni
           en la pantalla ni en ningun sitio. El motivo ya lo tenia `nube.js`
           guardado en `ultimoFallo` y se estaba tirando. Ahora se enseña en
           pequeño y ademas se anota en la bitacora, que para eso esta. */
        var porque = window.ATWI.nube.ultimoFallo && window.ATWI.nube.ultimoFallo();
        aviso.innerHTML = 'No se pudo borrar, y no se borró nada. Probá otra vez.' +
          (porque ? '<br><span class="tenue">' + esc(porque) + '</span>' : '');
        if (window.ATWI.nube.anotar) {
          window.ATWI.nube.anotar('borrar_fallo', { debate: id, detalle: porque || '' });
        }
        return;
      }
      /* Se quita de la lista que ya esta en memoria en vez de volver a pedirla:
         la persona acaba de decir que se vaya y verla desaparecer es la
         respuesta. Pedir el historial otra vez son dos segundos de tarjeta
         todavia ahi. */
      historial = (historial || []).filter(function (x) { return x.id !== id; });
      /* Y EL ACTA CON ELLA, en memoria igual que en la base: `acuerdos.debate`
         es `on delete cascade`, así que la fila ya no está. Dejarla en la lista
         mostraría un acuerdo de una partida que acaba de desaparecer --y al
         tocarlo llevaría a una partida que ya no existe--. */
      actas = (actas || []).filter(function (a) {
        return !a.debate || a.debate.id !== id;
      });
      cerrarGlobo();
      pintarHistorial();
    });
  }

  /* «Hoy», «ayer» y la fecha. Un historial de partidas de pareja se lee por lo
     reciente: «hace dos días» dice mas que «13/09». */
  /* SIN LA HORA (decisión del titular, 2026-09-15). Un historial de partidas de
     pareja se lee por lo reciente que es algo, no por el minuto en que pasó:
     «Hoy» ya dice todo lo que hace falta para situarla, y «Hoy · 05:00» gastaba
     media fila de cabecera en un dato que nadie usa. Lo que ganó ese sitio es el
     rótulo del modo, que sí distingue una partida de otra. */
  function cuando(iso) {
    var d = new Date(iso);
    var hoy = new Date();
    var dias = Math.floor((hoy.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0))
                          / 86400000);
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    if (dias < 7) return 'Hace ' + dias + ' días';
    return d.toLocaleDateString('es', { day: 'numeric', month: 'long' });
  }

  /* --- Volver a oír una partida ------------------------------------------------
     SE ABRE LA SALA, no una pantalla nueva. Se escribio primero como una lista
     dentro de un modal propio --ficha, duracion y un boton de play por
     intervencion-- y era peor lo mismo: perdia la figura grande, el reproductor
     sobre la cabeza y el encadenado, que son justo lo que hace que una partida
     se relea como una conversacion y no como una carpeta de audios.

     Reproducir una partida es ponerla otra vez: la misma sala, con las casillas
     ya llenas y sin boton de grabar. */
  /* EN QUÉ PUNTO ESTÁ CADA PARTIDA. El historial dejó de ser la lista de lo
     terminado y pasó a ser donde viven todas (decisión del titular,
     2026-09-15), así que cada fila tiene que decir en qué punto está y qué se
     puede hacer con ella. Son cinco y solo cuatro se enseñan.

       · sin-empezar     ni una intervención  ->  «Empezar». AQUÍ SALÍAN
                         BLOQUEADAS y era un descuido: la fila se pintaba con el
                         botón `disabled` --heredado de cuando abrir una partida
                         solo servía para oírla, y sin audios no había nada que
                         oír-- así que el historial enseñaba cinco tarjetas
                         grises que no hacían nada y no decían por qué.
                         No hay que esconderlas: una partida sin empezar tiene
                         todo lo suyo decidido --el tema, el modo, los turnos,
                         quién juzga y con qué fichas-- y lo único que le falta
                         es la primera intervención. Se retoma como cualquier
                         otra y arranca en el turno 1.
       · en-curso        faltan intervenciones  ->  «Seguir jugando»
       · falta-veredicto están las seis y no hay resultado  ->  «Pedir el
                         resultado», que retoma en la pantalla de deliberar.
       · sin-ver         hay resultado y nadie lo miró  ->  «Ver el resultado»,
                         con la revelación entera.
       · terminada       se jugó y se vio  ->  repaso.

     `falta-veredicto` ES SOLO DE CONTROVERSIA, y no por capricho: en Negociación
     no hay árbitro todavía, así que una ronda de Pacto cerrada NUNCA tiene fila
     en `resultados`. Marcarla como «falta el resultado» pondría un aviso
     permanente sobre algo que no está roto. El día que exista el mediador, esta
     excepción se cae sola. */
  function estadoDe(d) {
    var hechos = (d.turnos_grabados || []).length;
    var total = (d.turnos || 3) * 2;
    /* EN LÍNEA HAY DOS ESTADOS MÁS (0055): la PROPUESTA que espera a que la otra
       persona acepte —todavía no hay invitado ni sorteo— y la ABANDONADA, que
       se cerró porque alguien no contestó en 24 horas. La segunda en Controversia
       trae resultado (victoria técnica) y sigue el camino normal; en Negociación
       no hay acta y se queda así. */
    if (d.en_linea && d.estado === 'propuesto') return 'propuesta';
    if (d.en_linea && d.abandono && d.modo === 'negociacion') return 'abandonada';
    if (!hechos) return 'sin-empezar';
    /* Una Controversia abandonada llega con menos intervenciones de las
       pactadas y AUN ASI tiene veredicto (o lo espera): no esta en curso. */
    if (hechos < total && !(d.en_linea && d.abandono)) return 'en-curso';
    /* UNA NEGOCIACION CON LAS INTERVENCIONES Y SIN ACTA NO ESTA TERMINADA
       (2026-09-18): le falta cerrarse --elegir una propuesta y firmarla, marcar
       «Ninguna», o que el mediador la haya parado--, y eso deja fila en
       `acuerdos` en los tres casos. Aqui decia `terminada` porque el mediador
       no existia y una ronda de Pacto nunca tenia nada que pedir; las seis
       rondas del banco se jugaron por el corredor y ninguna pudo votarse desde
       el historial hasta hoy. */
    if (d.modo === 'negociacion') return (d.acuerdos || []).length ? 'terminada' : 'falta-acuerdo';
    if (!d.resultado) return 'falta-veredicto';
    /* Cada quien estrena el suyo: el invitado con cuenta lleva su propia marca. */
    var visto = miLadoEn(d) === 'invitado' ? d.resultado.visto_invitado : d.resultado.visto;
    return visto ? 'terminada' : 'sin-ver';
  }

  /** De qué lado de una partida está esta cuenta: quien propuso, o el invitado con cuenta. */
  function miLadoEn(d) {
    var yo = window.ATWI.auth && window.ATWI.auth.sesion();
    yo = yo && yo.user && yo.user.id;
    return d && d.aceptado_por && d.aceptado_por === yo ? 'invitado' : 'propone';
  }

  /* QUIÉNES JUGARON, con su cara (petición del titular, 2026-09-15). La lista
     decía el tema y la fecha, y en una lista de partidas del mismo tema --que
     es lo que pasa al probar, y lo que va a pasar con las revanchas-- no había
     manera de distinguir una de otra.

     LOS DOS LADOS SIEMPRE, hablaran o no. La ficha sale del debate, que la sella
     al abrirse desde la migración 0031, y no de los turnos: así una partida que
     nadie empezó también enseña contra quién iba a ser. Para las partidas
     viejas, que no la tienen sellada, se cae a los turnos. */
  function quienesJugaron(d) {
    var t = d.turnos_grabados || [];
    function lado(cual, i) {
      /* EL LADO LO DICE `perfil`, y la regla vive en un solo sitio
         (`nube.ladoDeTurno`). Aquí se dedujo de la paridad de `orden` —copiado
         de `mesaDelDebate()`— y salió mal las dos veces que se tocó, porque la
         app numera `orden` desde 0 y el banco de pruebas lo hacía desde 1. */
      var x = t.filter(function (q) {
        return window.ATWI.nube.ladoDeTurno(q, d) === cual;
      })[0];
      /* Y PARA EL LADO `propone`, EL PERFIL DE ESTA CUENTA COMO ÚLTIMO RECURSO.
         Las partidas abiertas antes de la migración 0031 no sellaban su ficha,
         así que la tarjeta enseñaba UNA sola cara --la del invitado-- y un «vs»
         a medias. Quien propuso es quien está mirando la lista. */
      var mio = cual === 'propone' ? datos.perfil() : null;
      var nombre = d[cual + '_nombre'] || (x && x.nombre) || (mio && mio.nombre);
      var avatar = d[cual + '_avatar'] || (x && x.avatar) || (mio && mio.avatar);
      var color = d[cual + '_color'] || (x && x.color) || (mio && mio.color);
      /* Una propuesta en línea todavía no tiene invitado: se enseña a quién se
         invitó, sin cara, que es lo único que se sabe. */
      if (cual === 'invitado' && !nombre && d.en_linea && d.invitado_correo) {
        return '<span class="jugaron__uno"><span class="jugaron__nombre">' +
          esc(d.invitado_correo) + '</span></span>';
      }
      if (!nombre && !avatar) return null;
      return '<span class="jugaron__uno">' +
          window.ATWI.fichaHTML(avatar || (i ? 'luna' : 'kai'), 'jugaron__cara', color) +
          '<span class="jugaron__nombre">' + esc(nombre || '—') + '</span>' +
        '</span>';
    }
    var a = lado('propone', 0);
    var b = lado('invitado', 1);
    if (!a && !b) return '';
    /* «VS» EN CONTROVERSIA Y «Y» EN NEGOCIACIÓN (corrección del titular,
       2026-09-15). En Pacto no hay dos lados enfrentados: los dos proponen
       sobre el mismo tema y el resultado es de los dos o no es de nadie --por
       eso el veredicto dice «Ambos» y no un nombre--. Un «vs» ahí contradice el
       modo entero en dos letras, y encima en la pantalla donde la pareja repasa
       lo que hizo junta. */
    var junta = d.modo === 'negociacion';
    /* CÓMO ACABÓ VA AQUÍ, JUNTO A ELLOS (corrección del titular, 2026-09-16).
       Estaba arriba, al lado de «Terminada», y ahí se leía como un estado más
       de la partida. Pero «Empate» o «Ganó Harold» no dicen en qué punto está
       la ronda: dicen algo SOBRE ESTAS DOS PERSONAS, y puesto detrás de sus dos
       caras se lee solo, sin tener que buscar arriba de quién se habla. */
    var final = comoAcabo(d);
    return '<span class="jugaron">' + (a || '') +
      (a && b ? '<span class="jugaron__vs">' + (junta ? 'y' : 'vs') + '</span>' : '') +
      (b || '') +
      (final ? '<span class="jugaron__final">' + esc(final) + '</span>' : '') +
      '</span>';
  }

  /* LOS CINCO ESTADOS SE AGRUPAN EN TRES FAMILIAS, y de ahí sale el tinte de la
     tarjeta (decisión del titular, 2026-09-15). Los cinco hacen falta para
     saber qué pasa al tocar; tres son los que se ven de un vistazo bajando por
     la lista, y son los que el titular nombró: en curso, lista para veredicto y
     completada.

     EL TINTE ES MUY SUAVE A PROPÓSITO. Es para recorrer la lista con el ojo, no
     para llamar la atención: una tarjeta con color fuerte se lee como un aviso,
     y aquí ninguna de las tres es un problema. El rótulo de arriba sigue siendo
     quien dice exactamente cuál es. */
  var FAMILIA = {
    'propuesta': 'curso',
    'abandonada': 'hecha',
    'sin-empezar': 'curso',
    'en-curso': 'curso',
    'falta-veredicto': 'veredicto',
    'falta-acuerdo': 'veredicto',
    'sin-ver': 'veredicto',
    'terminada': 'hecha'
  };

  /* LOCAL O EN LÍNEA. La marca honesta es `aceptado_por`: en una partida local
     quien juega enfrente agarró este mismo teléfono y no tiene cuenta, así que
     nadie la aceptó. En una remota la acepta alguien con perfil.
     HOY TODAS SON LOCALES --la partida remota no existe-- y la pestaña de en
     línea sale vacía diciéndolo. No es un filtro de adorno: el día que exista,
     mezclar las dos en una sola lista sería mezclar dos maneras de jugar que
     esperan cosas distintas de vos. */
  /* Desde la 0055 la marca es `en_linea`: una propuesta todavía sin aceptar
     también es de en línea, y `aceptado_por` no la vería. */
  function esEnLinea(d) { return Boolean(d && (d.en_linea || d.aceptado_por)); }

  /* ¿ESTA PARTIDA ME ESTÁ ESPERANDO A MÍ? (regla del titular, 2026-09-16).
     Las que sí brillan en la lista; las demás, no.

     LA MITAD DEL VALOR ESTÁ EN LAS QUE NO BRILLAN. Una lista donde todo llama
     la atención no señala nada, y aquí la diferencia es concreta: entre «te
     toca» y «le toca al otro» hay una acción tuya o ninguna. Por eso una
     partida remota esperando al otro se queda apagada aunque esté a medias.

     TRES CASOS, y los tres son lo mismo dicho de tres maneras —hay algo que
     solo puedo hacer yo—:
       · a medias y me toca grabar,
       · terminada y sin veredicto, que hay que volver a pedirlo,
       · con el veredicto listo y sin abrir.
     `terminada` no entra: ahí no queda nada por hacer.

     Y EN PARTIDA LOCAL ME TOCA SIEMPRE, sea de quien sea el turno: el teléfono
     es uno solo y quien lo tiene en la mano soy yo. Es el único caso que hoy
     se puede ver —la remota no existe— y por eso la rama de en línea está
     escrita con el freno puesto: si no se puede saber de quién es el turno, no
     brilla. Encender de más es peor que no encender, porque lo que se aprende
     es a ignorar el brillo. */
  function meEspera(d) {
    var e = estadoDe(d);
    if (e === 'sin-ver' || e === 'falta-veredicto' || e === 'falta-acuerdo') return true;
    if (e !== 'en-curso' && e !== 'sin-empezar') return false;
    if (!esEnLinea(d)) return true;

    var yo = window.ATWI.auth && window.ATWI.auth.sesion();
    yo = yo && yo.user && yo.user.id;
    if (!yo) return false;
    /* MI LADO, Y EL LADO QUE TOCA. `orden` empieza en 1 y quien abre tiene los
       impares, así que la intervención que viene —la número `hechas + 1`— es de
       quien abre cuando es impar. Es la misma cuenta de `quienesJugaron`, y ahí
       ya estuvo al revés una vez, con las dos caras cambiadas de sitio. */
    var mio = d.propone === yo ? 'propone' : d.aceptado_por === yo ? 'invitado' : null;
    if (!mio) return false;
    var abre = d.abre_lado === 'invitado' ? 'invitado' : 'propone';
    var siguiente = ((d.turnos_grabados || []).length + 1) % 2 === 1
      ? abre : (abre === 'propone' ? 'invitado' : 'propone');
    return siguiente === mio;
  }

  /* QUÉ SE ESTÁ MIRANDO EN EL HISTORIAL. Tres vistas de la misma pantalla y una
     sola a la vez: las partidas de este móvil, las de en línea, o las actas.

     LAS ACTAS ENTRAN AQUÍ Y NO EN UN MODAL (corrección del titular,
     2026-09-15). Estaban detrás de una tarjeta que abría otra pantalla, y eso
     obliga a salir de donde estabas para volver a entrar. Como chip se cambia
     de vista sin moverse de sitio, que es lo que uno hace cuando va a comparar
     --«¿esto lo acordamos o solo lo hablamos?»--.

     SE RECUERDA mientras dure la pestaña: quien viene a mirar sus acuerdos los
     vuelve a mirar al minuto siguiente, y volver siempre a «local» le esconde
     lo que venía a ver. */
  var vistaHistorial = 'local';

  /* La de acuerdos solo sale si hay Negociaciones jugadas. Un chip que lleva
     siempre a una lista vacía es un chip que enseña a no tocarlo. */
  function hayNegociaciones() {
    return (historial || []).some(function (d) { return d.modo === 'negociacion'; });
  }

  function barraDondeJuego() {
    var op = [['local', 'En este móvil'], ['linea', 'En línea']];
    /* «Acuerdos» y no «Lo que acordaron» (titular, 2026-09-15): los otros dos
       chips son dos palabras y uno de cuatro los descolocaba. Además la frase
       larga ya está dentro, en el aviso de que es un recordatorio. */
    if (hayNegociaciones()) op.push(['actas', 'Acuerdos']);
    return '<div class="filtros filtros--donde">' +
      op.map(function (x) {
        /* `data-lista` Y NO `data-donde` (2026-09-18): los chips llevaban el
           mismo atributo que el interruptor «en este movil / por invitacion»
           de preparar partida, y el listener global atiende ese primero, asi
           que tocar «Acuerdos» o «En linea» aqui llamaba a `recordarDonde()` y
           `abrirPreparar()` y nunca llegaba a cambiar la vista. Se vio en la
           pasada de navegador de las actas: el chip estaba muerto desde que se
           escribio. */
        return '<button class="chip chip--filtro" data-lista="' + x[0] + '"' +
          (vistaHistorial === x[0] ? ' aria-pressed="true"' : '') + '>' + esc(x[1]) + '</button>';
      }).join('') +
    '</div>';
  }

  /* El rótulo de cada estado y su color. Los tres primeros son los que piden
     algo; `terminada` no lleva nada, que una lista donde todo grita no señala
     nada. */
  var ROTULO_ESTADO = {
    'propuesta': ['Esperando respuesta', 'curso'],
    'abandonada': ['Abandonada', 'curso'],
    'sin-empezar': ['Sin empezar', 'curso'],
    'en-curso': ['Sin terminar', 'curso'],
    'falta-veredicto': ['Falta el resultado', 'curso'],
    'falta-acuerdo': ['Falta cerrar la negociación', 'curso'],
    'sin-ver': ['Tu resultado está listo', 'premio']
  };

  /* CÓMO ACABÓ, en dos palabras (petición del titular, 2026-09-16). La fila de
     una partida terminada decía «Terminada» y nada más, así que para saber en
     qué quedó había que abrirla. En una lista de veinte, eso es abrirlas todas.

     Va junto al estado y no en su propia línea: es la MISMA pregunta —«¿qué
     pasó con esta?»— y partirla en dos renglones haría la tarjeta más alta sin
     decir nada más. */
  var COMO_ACABO_PACTO = { acuerdo: 'Acuerdo firmado', desacuerdo: 'Sin acuerdo', parada: 'Detenida', aplazado: 'Aplazado' };
  function comoAcabo(d) {
    /* EN NEGOCIACIÓN LO DICE EL ACTA (S27, 2026-09-18): firmaron, marcaron
       «Ninguna» o el mediador paró. Las de Controversia lo decían y las de Pacto
       no decían nada. La última versión manda, como en el chip de actas. */
    if (d.modo === 'negociacion') {
      var actas = (d.acuerdos || []).slice().sort(function (a, b) { return (b.version || 0) - (a.version || 0); });
      return actas.length ? (COMO_ACABO_PACTO[actas[0].tipo] || '') : '';
    }
    var r = d.resultado;
    if (r && d.en_linea && d.abandono && r.ganador_lado) {
      var q = d[r.ganador_lado + '_nombre'];
      return q ? 'Ganó ' + q + ' por abandono' : 'Ganó por abandono';
    }
    if (!r || !r.tipo_resultado) return '';
    if (r.tipo_resultado === 'empate_tecnico') return 'Empate';
    if (r.tipo_resultado === 'sin_resultado_blando') return 'Sin veredicto';
    if (r.tipo_resultado === 'sin_resultado_duro') return 'Partida detenida';
    if (r.tipo_resultado === 'ganador') {
      /* El nombre, no el lado. «Ganó propone» no se lo dice a nadie. */
      var lado = r.ganador_lado === 'invitado' ? 'invitado' : 'propone';
      var quien = lado === 'invitado'
        ? (d.invitado_nombre || 'la otra parte')
        : (d.propone_nombre || 'vos');
      return 'Ganó ' + quien;
    }
    return '';
  }

  /* DE DÓNDE SE ABRIÓ LA PARTIDA, para poder devolver ahí (corrección del
     titular, 2026-09-15). A una partida se entra por dos puertas --la tarjeta de
     la portada y la fila del historial-- y al salir volvía siempre al historial,
     así que abrirla desde la portada te dejaba en otra pantalla. */
  var volverTrasLaPartida = 'historial';

  /* UNA SOLA PUERTA PARA TODAS, y cada estado entra por donde le toca. Antes
     esto siempre abría el repaso, que era lo único que había. */
  function abrirPartida(id) {
    var d = (historial || []).filter(function (x) { return x.id === id; })[0];
    /* SI NO ESTÁ EN LA LISTA, SE PIDE. El historial trae DIEZ por tanda y las
       actas llegan hasta 50: una partida vieja puede tener acta y no estar
       cargada, y tocarla no puede no hacer nada. Desde el paginado esto pasa
       más a menudo —antes hacían falta más de veinte partidas— y por eso el
       camino ya estaba y no hubo que inventarlo. */
    if (!d) {
      if (!window.ATWI.nube || !window.ATWI.nube.partida) return;
      window.ATWI.nube.partida(id).then(function (traida) {
        if (!traida) return;
        historial = (historial || []).concat([traida]);
        abrirPartida(id);
      });
      return;
    }
    volverTrasLaPartida = vistaActual === 'jugar' ? 'jugar' : 'historial';
    var e = estadoDe(d);
    /* EN LÍNEA (0055): la propuesta se puede retirar y nada más; la aceptada
       entra por su propia puerta, que sabe de qué lado estoy, revela el sorteo
       una vez y espera al otro cuando no me toca. */
    if (e === 'propuesta') return abrirPropuesta(d);
    if (e === 'abandonada') return;
    if (esEnLinea(d) && (e === 'sin-empezar' || e === 'en-curso' || e === 'falta-veredicto' || e === 'falta-acuerdo')) {
      return window.ATWI.partida.enLinea(d);
    }
    /* Empezarla, seguirla o pedir el resultado que falta: las tres son retomar
       la misma partida, y `reanudar()` decide dónde deja a la persona. */
    if (e === 'sin-empezar' || e === 'en-curso' || e === 'falta-veredicto' || e === 'falta-acuerdo') {
      return window.ATWI.partida.reanudar(d);
    }
    /* ESTRENO O REPASO, y la diferencia es toda la pantalla: un veredicto que
       nadie vio se abre con la revelación entera --redoble, entrada,
       serpentinas-- porque es la primera vez, y uno ya visto se abre en repaso,
       a oír las intervenciones. */
    window.ATWI.partida.repasar(d, { estrenar: e === 'sin-ver' });
  }

  /* --- LAS ACTAS ---------------------------------------------------------------
     Todas juntas, abiertas desde el historial (petición del titular,
     2026-09-15). No son una pestaña propia porque son DE las partidas; lo que
     les da pantalla es que se consultan por otro motivo --«¿qué habíamos
     quedado?»-- y buscarlas partida por partida sería lo contrario de un
     recordatorio.

     SE GUARDAN EN MEMORIA como el historial, y por lo mismo: entrar y salir de
     la lista no puede costar una petición cada vez. Se tira al firmar una
     nueva. */
  var actas = null;

  /* Se pinta DENTRO del historial, en su sitio: el título y los chips se
     quedan, y lo único que cambia es la lista de abajo. */
  function pintarActas(caja, titulo) {
    var cabecera = titulo + barraDondeJuego();
    if (!actas) {
      caja.innerHTML = cabecera + '<p class="chico tenue">Buscando sus actas…</p>';
      window.ATWI.nube.acuerdos().then(function (l) {
        actas = l || [];
        if (vistaActual === 'historial') pintarHistorial();
      });
      return;
    }
    if (!actas.length) {
      caja.innerHTML = cabecera + estadoVacio(icono('negociacion', 76), 'Todavía no hay actas',
        'Cuando cierren una Negociación —con acuerdo o sin él— queda aquí lo que ' +
        'quedaron. Es un recordatorio, no un contrato.');
      return;
    }
    /* LAS ACTAS VAN EN LA MISMA RULETA QUE LAS PARTIDAS (titular, 2026-09-18:
       «aplícalo también en las cards de acuerdos»). Usan la misma tarjeta desde
       el 2026-09-15, así que heredan el reparto, el snap y las tarjetas enteras
       sin nada propio; lo único que no llevan es el botón de cargar más, porque
       las actas vienen de una sola consulta. */
    caja.innerHTML = cabecera +
      /* SE DICE LO QUE ES, Y ES LA REGLA 1 DEL PRODUCTO. `docs/02` §9.4.7
         prohíbe prometer que un tema queda resuelto: el acta es un recordatorio
         de lo que se acordó, nada más, y esta pantalla —que es donde se vuelve
         a leer— es justo donde hay que decirlo. */
      '<p class="chico tenue" style="margin-bottom:var(--e-4)">Un recordatorio de lo ' +
        'que quedaron, no un contrato: nadie está obligado a cumplirlo, y si deja de ' +
        'servirles lo vuelven a hablar.</p>' +
      /* ⚠️ LA RULETA EMPIEZA EN LA PRIMERA TARJETA, y el renglón de arriba se
         queda fuera: `ajustarRuleta` mide el PRIMER HIJO para saber el paso, y
         con el párrafo dentro medía 39 px —el alto del texto— y repartía la
         pantalla en casillas de 75. El resultado: una sola acta a la vista con
         un hueco enorme encima. Lo que va dentro son las piezas que se
         deslizan; lo que las presenta es cabecera. */
      '<div class="ruleta">' +
      /* MISMA TARJETA QUE EL HISTORIAL (titular, 2026-09-15): `.tarjeta` con
         `.partida` dentro, la cabecera de estado y fecha, y el enunciado de
         cuerpo. Lo que no lleva es la papelera, porque un acta no se borra por
         su cuenta: se va con su partida, y esa se borra desde el historial.
         Y SE TOCA: lleva a la partida de la que salió.
         ⚠️ Y LLEVA SU PEANA, que faltaba (titular, 2026-09-18). Desde que las
         tarjetas del historial son cartas, el hueco de la onda lo hace el
         relleno de abajo —48 px—, así que una tarjeta sin peana no se veía
         igual: se veía con un vacío al pie. Aquí decía además que el modo no
         hacía falta «porque todas son de Pacto», y eso lo dice el DIBUJO sin
         gastar un renglón; el día que haya actas de otro modo, sale sola. */
      actas.map(function (a) {
        var d = a.debate || {};
        var hubo = a.tipo === 'acuerdo';
        /* «Detenida» para la parada del mediador (S27): no es que no acordaran,
           es que el mediador leyó la ronda y no propuso. El texto del acta en
           ese caso es su cierre. */
        return '<div class="tarjeta partida-fila" data-tipo="' + esc(a.tipo) + '" ' +
            'data-modo="' + esc(MODOS_CON_PEANA[d.modo] ? d.modo : 'negociacion') + '">' +
            '<button class="partida" data-acta-de="' + esc(d.id || '') + '">' +
              '<span class="partida__alto">' +
                '<span class="partida__estado">' +
                  (hubo ? 'Acuerdo' : a.tipo === 'parada' ? 'Detenida' : 'Sin acuerdo') +
                '</span>' +
                '<span class="partida__cuando">' + esc(cuando(a.creado)) + '</span>' +
              '</span>' +
              '<span class="partida__tema">' + esc(d.enunciado || 'Sin tema') + '</span>' +
              '<span class="acta-fila__texto">' + esc(a.texto) + '</span>' +
            '</button>' +
            '<img class="partida__base" src="../assets/img/iconos/base-' +
              esc(MODOS_CON_PEANA[d.modo] ? d.modo : 'negociacion') + '.png" ' +
              'alt="" aria-hidden="true">' +
          '</div>';
      }).join('') + '</div>';
    ajustarRuleta();
  }

  /* ¿Esta partida tiene acta? Lo lee de la lista en memoria, que se trae JUNTO
     con el historial por este mismo motivo: el aviso de borrar tiene que decir
     siempre que el acuerdo se va, y uno que solo avisa a veces es peor que
     ninguno. La petición no se desperdicia --la puerta a las actas está en esa
     misma pantalla--. */
  function actaDe(debateId) {
    /* PRIMERO, LA QUE VIENE DENTRO DE LA PARTIDA. El historial trae las actas
       anidadas, así que para el aviso de borrado no hace falta la lista aparte
       —que es una consulta más en una cola donde cada turno cuesta ~270 ms—.
       La lista global se sigue mirando después: una partida que no está cargada
       (se llegó a ella desde el chip «Acuerdos») no trae la suya. */
    var d = (historial || []).filter(function (x) { return x.id === debateId; })[0];
    var dentro = d && d.acuerdos;
    if (dentro && dentro.length) {
      return dentro.slice().sort(function (a, b) {
        return (b.version || 0) - (a.version || 0);
      })[0];
    }
    return (actas || []).filter(function (a) {
      return a.debate && a.debate.id === debateId;
    })[0] || null;
  }

  /* Al firmar una nueva, la lista en memoria ya no es la de ahora. */
  window.ATWI.olvidarActas = function () { actas = null; };

  /* De vuelta al historial después de estrenar un veredicto guardado, con la
     lista recién pedida para que la insignia de «sin ver» ya no esté. */
  /* Se vuelve a donde se estaba, no a un sitio fijo. Y la fila se actualiza EN
     MEMORIA --`visto` puesto, que es justo lo que acaba de pasar en el
     servidor-- en vez de tirar el historial entero: tirándolo, la portada se
     quedaba sin saber si había OTRO resultado pendiente hasta que alguien
     entrara al historial a que se volviera a pedir. */
  window.ATWI.alEstrenarVeredicto = function (id) {
    var d = (historial || []).filter(function (x) { return x.id === id; })[0];
    if (d && d.resultado) d.resultado.visto = new Date().toISOString();
    irA(volverTrasLaPartida);
  };

  /* Y al terminar una partida jugada entera, lo mismo. Este enganche estaba
     declarado en `partida.js` y no lo definía nadie, así que cerrar el
     veredicto de una partida recién jugada dejaba al fondo la pantalla de
     antes con el historial viejo: la partida que se acababa de jugar no
     aparecía hasta recargar. */
  window.ATWI.alTerminarPartida = function () {
    historialCaducado = true;
    irA(volverTrasLaPartida);
  };

  /* Buscador y filtros. Van juntos porque responden a la misma pregunta:
     «¿qué me queda por debatir de esto?». */
  /* EL CAMPO DE TEXTO SE PLIEGA Y LOS FILTROS NO (petición del titular,
     2026-09-16). No es la misma clase de control: los tres chips son el estado
     de la lista —se leen sin usarlos y dicen que se puede acotar—, mientras que
     el campo de texto es una herramienta que solo sirve cuando ya sabes qué
     palabra buscar, y ocupaba una fila entera de la primera pantalla para eso. */
  function barraBusqueda() {
    var f = [['todos', 'Todos'], ['sin', 'Sin estrenar'], ['con', 'Ya debatidos']];
    return '<div class="buscador">' +
        (buscadorAbierto
          ? '<input class="campo" id="q" type="search" inputmode="search" placeholder="Buscar un tema…" ' +
            'value="' + esc(busqueda) + '" autocomplete="off">'
          : '') +
        '<div class="filtros">' +
          f.map(function (x) {
            return '<button class="chip chip--filtro" data-filtro="' + x[0] + '"' +
                   (filtro === x[0] ? ' aria-pressed="true"' : '') + '>' + x[1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  /* La lupa que lo abre y lo cierra. Cambia a una cruz cuando está abierto: el
     mismo botón hace las dos cosas y tiene que decir cuál va a hacer ahora. */
  function botonBuscar() {
    return '<button class="boton-icono boton-icono--derecha" data-accion="buscar" ' +
        'aria-expanded="' + (buscadorAbierto ? 'true' : 'false') + '" ' +
        'aria-label="' + (buscadorAbierto ? 'Cerrar la búsqueda' : 'Buscar un tema') + '">' +
        icono(buscadorAbierto ? 'cerrar' : 'lupa', 24) +
      '</button>';
  }

  /* EL DIBUJO DEL ESTADO VACÍO PUEDE SER LA SALIDA (titular, 2026-09-16). Donde
     el hueco tiene UNA manera de llenarse, el dibujo que anuncia el hueco es el
     sitio donde la mano va a ir a tocar; dejarlo inerte obliga a subir la vista
     a buscar el botón. `accion` y `queHace` van juntos: sin la etiqueta, un
     lector de pantalla anunciaría un botón sin nombre. */
  function estadoVacio(emoji, titulo, texto, accion, queHace) {
    var pieza = '<div class="vacio__emoji">' + emoji + '</div>';
    if (accion) {
      pieza = '<button class="vacio__boton" data-accion="' + accion + '" ' +
              'aria-label="' + esc(queHace || titulo) + '">' + pieza + '</button>';
    }
    return '<div class="vacio">' + pieza +
        '<h2 style="margin-bottom:var(--e-2)">' + esc(titulo) + '</h2>' +
        '<p class="chico">' + esc(texto) + '</p>' +
      '</div>';
  }

  /* ======================================================================
     Vista: Perfil
     ====================================================================== */
  function pintarPerfil() {
    var p = datos.perfil();
    var caja = $('#v-perfil');
    var insignias = ['🦷', '🍽️', '🐕', '🎬', '💶', '⏰', '😄', '🛋️'];

    /* LA TARJETA DE LA CUENTA NO DESAPARECE NUNCA cuando hay servidor. Antes
       dependía de que `dentro()` dijera que sí, y si la sesión se torcía —o si
       el correo aún no había llegado del servidor— la fila entera se esfumaba
       y no había por dónde cerrar sesión ni saber con qué cuenta se estaba.
       Ahora siempre está: con sesión enseña el correo y «Salir», y sin ella lo
       dice y ofrece entrar. */
    var auth = window.ATWI.auth;
    var hayServidor = Boolean(auth && auth.hayServidor());
    var dentro = Boolean(auth && auth.dentro());
    var correo = dentro ? auth.correo() : '';

    /* El correo vive dentro de la sesión y a veces llega después —al volver del
       enlace del correo la sesión no lo trae—. Se pregunta y se repinta. */
    if (dentro && !correo && !pintarPerfil.preguntando) {
      pintarPerfil.preguntando = true;
      auth.quienSoy().then(function () { pintarPerfil.preguntando = false; pintarPerfil(); })
                     .catch(function () { pintarPerfil.preguntando = false; });
    }

    caja.innerHTML =
      /* Toda la ficha es un botón: el nombre y el dibujo se cambian desde
         aquí. Antes solo decía «Sin nombre todavía» y no había por dónde
         escribirlo. */
      '<button class="ficha" data-accion="editar-ficha">' +
        avatarHTML(p, 'ficha__avatar') +
        '<span class="ficha__nombre">' +
          (p.nombre ? esc(p.nombre) : 'Ponte un nombre') +
          icono('lapiz', 22) +
        '</span>' +
        '<span class="chico suave">Nivel ' + p.nivel + '</span>' +
      '</button>' +

      /* La cuenta va ARRIBA, no enterrada bajo las insignias: quien busca
         cambiar de cuenta no debería tener que hacer scroll para encontrarlo. */
      (hayServidor
        ? '<div class="cuenta">' +
            '<span class="cuenta__quien">' +
              '<span class="cuenta__eti">' + (dentro ? 'Sesión iniciada' : 'Sin sesión') + '</span>' +
              '<span class="cuenta__correo">' +
                (dentro ? esc(correo || 'Tu cuenta') : 'Entra para jugar con otra persona') +
              '</span>' +
            '</span>' +
            (dentro
              ? '<button class="boton boton--suave cuenta__salir" data-accion="salir">' +
                  icono('salir', 22) + 'Salir</button>'
              : '<button class="boton boton--suave cuenta__salir" data-accion="entrar">Entrar</button>') +
          '</div>' +
          /* Qué se guarda y qué no, a un toque desde donde está la cuenta. Abre
             en pestaña nueva: es la página pública, fuera del juego. */
          '<p class="chico centrado" style="margin-top:var(--e-2)">' +
            '<a href="../#privacidad" target="_blank" rel="noopener">Privacidad y datos</a></p>'
        : '') +

      '<div class="contadores" style="margin-top:var(--e-4)">' +
        contador(p.debates, 'Debates', 'debate') +
        contador(p.acuerdos, 'Acuerdos', 'acuerdo') +
        contador(p.semanasActivas, 'Semanas', 'premio') +
      '</div>' +

      /* LAS VIDAS (titular, 2026-09-18): son de cada cuenta, se gastan al abrir
         una partida --salvo QuienGane-- y SE PUEDEN MANDAR a otro apodo: «si
         tengo 10 te mando 5». El numero es el mismo de la cabecera. */
      (dentro
        ? '<div class="cuenta" style="margin-top:var(--e-4)">' +
            '<span class="cuenta__quien">' +
              '<span class="cuenta__eti">Vidas</span>' +
              '<span class="cuenta__correo"><b id="perfil-vidas">' + esc(($('#dato-vidas') || {}).textContent || '') + '</b> ' +
                'para abrir partidas. QuiénGane no gasta.</span>' +
            '</span>' +
            '<button class="boton boton--suave cuenta__salir" data-accion="enviar-vidas">' +
              icono('corazon', 22) + 'Enviar</button>' +
          '</div>'
        : '') +

      /* Aquí había una tarjeta explicando que no hay marcador entre jugadores.
         La REGLA sigue en pie y no se negocia —contadores separados, jamás lado
         a lado, ni Elo ni clasificación de ningún tipo; ver CLAUDE.md—, pero no
         hace falta anunciarla en pantalla: una decisión de diseño que funciona
         no necesita defenderse cada vez que se abre el perfil. */
      '<h2 style="margin:var(--e-5) 0 var(--e-3)">Insignias</h2>' +
      '<div class="insignias">' +
        insignias.map(function (e, i) {
          var ganada = i < p.insignias.length;
          return '<div class="insignia' + (ganada ? '' : ' insignia--bloqueada') + '">' + (ganada ? e : '🔒') + '</div>';
        }).join('') +
      '</div>' +

      '<div class="apilado" style="margin-top:var(--e-6)">' +
        '<button class="boton boton--fantasma boton--bloque" data-accion="olvidar">Borrar mis datos de este dispositivo</button>' +
      '</div>';
  }

  function contador(n, que, familia) {
    return '<div class="contador' + (familia ? ' contador--' + familia : '') + '">' +
        '<div class="contador__n">' + n + '</div>' +
        '<div class="contador__que">' + que + '</div>' +
      '</div>';
  }

  /* --- Editar la ficha: el nombre y el personaje ------------------------------
     El nombre vive en el servidor y el aparato solo lo copia, así que se guarda
     en los dos sitios. Sin servidor se queda en local y ya está.

     Antes esto era un dibujo de una lista de emojis más un color de una lista de
     diez. Ahora son Kai y Luna, y con ellos se va la elección de color: el color
     es del personaje, y dejar elegirlo aparte permitía a Kai salir en rosa y a
     Luna en azul, que es romperles la identidad. */
  /* EL COLOR DEJÓ DE SER UN ARO. Había diez tonos y lo único que cambiaban era
     el borde del avatar; ahora hay cuatro y cada uno es un DIBUJO distinto, con
     la chaqueta y las zapatillas pintadas en la lámina. La lista vive en
     `personajes.js` junto a las piezas, no aquí: si se separan, el día que
     entre un color nuevo habrá un selector que ofrece un dibujo que no existe. */
  var personajeElegido = 'kai';
  var colorElegido = 'azul';

  /** El círculo del avatar: la cara del personaje, con su aro de color. */
  function avatarHTML(p, clase) {
    return window.ATWI.fichaHTML(p.avatar, clase, p.avatarBorde);
  }

  /* La misma pantalla sirve para mi ficha y para la del invitado. Lo único que
     cambia es de dónde salen los valores, si se pide el nombre, y que al
     invitado no se le deja mi color: dos fichas iguales no se distinguen en
     la sala, que es justo para lo que sirven. */
  var editandoFicha = 'yo';    // 'yo' | 'invitado'

  /* LA FICHA SE EDITA EN UN GLOBO, NO EN UNA PANTALLA (titular, 2026-09-18:
     «adapta y simplifica la edición de tu ficha a globo flotante y aplícalo en
     perfil y selección de personaje para partida, tanto para la ficha del host
     como del invitado»).

     POR QUÉ CABE AQUI. Esto era un modal a pantalla completa con tres bloques y
     sus tres párrafos de explicación, y lo que de verdad se decide son dos
     cosas: qué cara y de qué color. El globo sale DEL círculo que se tocó y deja
     ver debajo la pantalla a la que vuelve —el perfil o «Antes de empezar»— así
     que no hace falta repetir de quién es la ficha: se está viendo.

     LO QUE SE SIMPLIFICA, y lo que no. Se van los tres párrafos: quién habla por
     ti lo dice la propia línea de la pantalla de atrás, y lo del color —que es
     la ropa y no el borde— se ve al tocarlo. Se queda el aviso de personaje
     apartado, que no se ve solo: explica por qué una cara está en gris.
     EL APODO SOLO EN LA MIA, y por lo mismo de siempre: el invitado no tiene
     cuenta, su nombre se escribe en el campo de «Antes de empezar» y aquí sería
     un segundo sitio donde cambiarlo.

     TRES DISPARADORES Y UN SOLO GLOBO: `editar-ficha` (Perfil), `ficha-mia` y
     `ficha-invitado` (Antes de empezar). Los tres pasan por aquí con el botón
     que se tocó, que es de donde cuelga el pico. */
  /** El retrato de quien se está poniendo, con su nombre. Se rehace al tocar
   *  una miniatura o un color: es la única pieza del globo que enseña la
   *  decisión tomada, y si no se mueve parece que no pasó nada. */
  function caraGrande() {
    return window.ATWI.fichaHTML(personajeElegido, 'ficha-editor__f', colorElegido) +
      '<span class="ficha-editor__nombre">' +
        esc(window.ATWI.nombrePersonaje(personajeElegido)) + '</span>';
  }
  function refrescarCaraGrande() {
    var c = $('#f-cara');
    if (c) c.innerHTML = caraGrande();
  }

  /** Deja el editor de ficha enseñando lo que hay elegido: el retrato, la cara
      marcada en la fila y el color puesto. Lo llaman los dos manejadores del
      globo y la recuperación de la ficha de un invitado ya conocido, que cambia
      las tres cosas de una vez. */
  function sincronizarFichaEditor() {
    $$('.ficha-editor [data-color]').forEach(function (x) {
      if (x.dataset.color === colorElegido) x.setAttribute('aria-pressed', 'true');
      else x.removeAttribute('aria-pressed');
    });
    /* LAS SEIS CARAS SE REPINTAN, que antes no hacía falta. El color ya no es un
       aro alrededor de una cara que no cambia: es la ropa del dibujo, así que al
       tocarlo todas las fichas de arriba pasan a ser otra imagen. */
    $$('.ficha-editor [data-personaje]').forEach(function (b) {
      b.style.setProperty('--pj', window.ATWI.colorPersonaje(colorElegido));
      b.setAttribute('aria-pressed', String(b.dataset.personaje === personajeElegido));
      var cara = b.querySelector('.avatar');
      if (cara) cara.outerHTML = window.ATWI.fichaHTML(b.dataset.personaje, 'caras-fila__f', colorElegido);
    });
    refrescarCaraGrande();
  }

  function abrirFicha(quien, disparador) {
    var deInvitado = quien === 'invitado';
    editandoFicha = deInvitado ? 'invitado' : 'yo';
    var p = datos.perfil();
    var g = deInvitado ? fichaDelInvitado(propuesta.otro) : null;
    personajeElegido = deInvitado ? g.avatar : p.avatar;
    colorElegido = window.ATWI.elColor(deInvitado ? g.color : p.avatarBorde);

    /* EL VETO CAMBIÓ DE EJE, y no por gusto. Antes se apartaba MI COLOR —dos
       aros iguales no se distinguían— y dos Kai en la misma sala valían. Ahora
       el color ES el dibujo, así que dos Kai en azul son la misma figura
       exacta: indistinguibles de verdad, no solo parecidas. Lo que se aparta
       pasa a ser MI PERSONAJE, y el color queda libre —decisión del titular:
       «no podrán ser el mismo personaje, eso es suficiente»—. */
    var vetado = deInvitado ? p.avatar : '';
    var chocaba = deInvitado && personajeElegido === vetado;
    if (chocaba) personajeElegido = window.ATWI.otroPersonaje(vetado);

    /* EL TINTE ES EL DEL MODO cuando se edita dentro de una partida, y el
       lavanda de la marca en Perfil, que es donde no hay modo. */
    var tinteDeLaFicha = (!$('#m-preparar').hidden && propuesta.modo) || 'lavanda';

    var cuerpo =
      '<div class="ficha-editor">' +
        /* EL NOMBRE SE ESCRIBE AQUÍ, TAMBIÉN EL DEL INVITADO (titular,
           2026-09-18). Antes el suyo era un campo suelto en «Antes de empezar»
           y su dibujo vivía en este globo: dos sitios para una sola persona, y
           el de fuera obligaba a que la pantalla tuviera un formulario donde lo
           demás son retratos. El mío se guarda en el perfil y el suyo en la
           propuesta; lo que se escribe es lo mismo y la regla del nombre
           también (`data-nombre` la aplica tecla a tecla). */
        '<input class="campo" id="f-nombre" data-nombre type="text" maxlength="' +
          datos.NOMBRE_MAX + '" autocomplete="' + (deInvitado ? 'off' : 'nickname') + '" ' +
          'placeholder="' + (deInvitado ? '¿Con quién juegas?' : 'Tu apodo') + '" ' +
          'value="' + esc(deInvitado
              ? (propuesta.otro === INVITADO ? '' : (propuesta.otro || ''))
              : p.nombre) + '">' +

        /* UNA CARA GRANDE ARRIBA Y LA FILA DEBAJO, como el selector del juez
           (titular, 2026-09-18). Eran seis tarjetas con su nombre y su fondo, y
           en un globo eso es una rejilla dentro de una caja dentro de otra: tres
           cajas para elegir una cara. Ahora lo que se mira es el retrato —el
           dibujo a tamaño de verse— y lo que se toca es una fila de miniaturas.
           EL NOMBRE VIVE ARRIBA, junto al retrato: en la fila sobra —seis
           nombres de seis letras en 280 px no se leen— y arriba dice quién es el
           que se está poniendo. */
        '<div class="ficha-editor__cara" id="f-cara">' + caraGrande() + '</div>' +

        /* CADA PERSONAJE APARECE UNA VEZ, no cuatro: la cara se elige aquí y el
           color aparte, y al tocar un color se recargan las seis. Poner las
           veinticuatro fichas sería la misma decisión partida en dos pantallas. */
        '<div class="caras-fila" role="group" aria-label="Personaje">' +
          window.ATWI.quienes().map(function (q) {
            var suyo = q.clave === vetado;
            return '<button type="button" class="caras-fila__cara' +
              (suyo ? ' caras-fila__cara--tomada' : '') + '"' +
              ' data-personaje="' + q.clave + '"' + (suyo ? ' disabled' : '') +
              ' aria-pressed="' + (q.clave === personajeElegido) + '"' +
              ' aria-label="' + esc(q.nombre) + '" title="' + esc(q.nombre) + '"' +
              ' style="--pj:' + window.ATWI.colorPersonaje(colorElegido) + '">' +
              window.ATWI.fichaHTML(q.clave, 'caras-fila__f', colorElegido) +
            '</button>';
          }).join('') +
        '</div>' +

        '<div class="colores">' +
          window.ATWI.colores().map(function (c) {
            return '<button class="color" data-color="' + c.clave + '"' +
              (c.clave === colorElegido ? ' aria-pressed="true"' : '') +
              ' aria-label="' + esc(c.nombre) + '">' +
              '<i style="background:' + c.tono + '"></i></button>';
          }).join('') +
        '</div>' +

        /* El único texto que se queda: sin él, una cara en gris no se explica. */
        (chocaba
          ? '<p class="chico aviso-aro">Ese personaje ya es el tuyo, así que le pusimos otro.</p>'
          : '') +
        '<p class="chico" id="f-error" style="color:var(--peligro)"></p>' +
      '</div>';

    abrirGlobo(disparador,
      /* «Tu invitado», fijo: el título llevaba su nombre y ahora el nombre se
         escribe dos renglones más abajo —se leería el viejo mientras se teclea
         el nuevo—. */
      { titulo: deInvitado ? 'Tu invitado' : 'Tu ficha' },
      { tinte: tinteDeLaFicha,
        signo: 'lapiz', signoTam: 64,
        etiqueta: deInvitado ? 'Ficha del invitado' : 'Tu ficha',
        cuerpo: cuerpo,
        /* El botón lleva el color del globo, como el «Jugar ahora» de los
           globos de modo: dentro de una partida es el del modo y en Perfil el
           lavanda de la marca, que es el que `.boton` trae de serie. */
        acciones: '<button class="boton boton--bloque' +
                    (tinteDeLaFicha === 'lavanda' ? '' : ' boton--' + tinteDeLaFicha) +
                    '" data-accion="guardar-ficha">' +
                    (deInvitado ? 'Listo' : 'Guardar') + '</button>' });

    var vacio = deInvitado ? (!propuesta.otro || propuesta.otro === INVITADO) : !p.nombre;
    setTimeout(function () { var n = $('#f-nombre'); if (n && vacio) n.focus(); }, 60);
  }


  /* A QUIEN SE INVITA, EN UN GLOBO (titular, 2026-09-18). Era un campo suelto
     con su rótulo y su explicación, o sea tres piezas del formulario para un
     dato que casi siempre se escribe una vez. Ahora sale de la columna vacía,
     que es la que pregunta por él. */
  function abrirCorreo(disparador) {
    var cuerpo =
      '<div class="correo-editor">' +
        '<input class="campo" id="p-correo" type="email" inputmode="email" ' +
          'autocomplete="email" spellcheck="false" maxlength="254" ' +
          'placeholder="mona@correo.com" value="' + esc(propuesta.correo || '') + '">' +
        '<p class="chico tenue">Le llega un enlace para entrar a esta partida. ' +
          'Elige su personaje al entrar.</p>' +
        '<p class="chico" id="p-correo-error" style="color:var(--peligro)"></p>' +
      '</div>';
    abrirGlobo(disparador, { titulo: '¿A quién invitas?' },
      /* EL SIGNO ES EL «+» DEL HUECO, no el buzón: en esta app la campana del
         buzón significa «hay algo para ti», y aquí no hay ningún aviso. El
         globo nace del signo que se tocó, así que lleva el mismo. */
      { tinte: claseDeModo(), signo: 'mas', signoTam: 64,
        etiqueta: 'A quién invitas', cuerpo: cuerpo,
        acciones: '<button class="boton boton--bloque boton--' + claseDeModo() + '" ' +
                  'data-accion="guardar-correo">Listo</button>' });
    setTimeout(function () { var n = $('#p-correo'); if (n) n.focus(); }, 60);
  }

  function guardarCorreo() {
    var v = ($('#p-correo').value || '').trim();
    if (!window.ATWI.entrada.valeCorreo(v)) {
      $('#p-correo-error').textContent = 'Ese correo no parece válido.';
      return;
    }
    propuesta.correo = v;
    cerrarGlobo();
    var b = $('#m-preparar [data-accion="invitar-correo"]');
    if (b) b.outerHTML = huecoDeInvitar();
    revisarPreparar();
  }

  function guardarFicha() {
    /* La ficha SOLO PARA ESTA PARTIDA en línea (0055): no toca el perfil, va
       derecha a aceptar la invitación con lo elegido. */
    if (editandoFicha === 'aceptar' && aceptando) {
      var ac = aceptando;
      aceptando = null;
      return aceptarInvitacion(ac.debate, personajeElegido, colorElegido);
    }
    /* La del invitado no se guarda en ningún perfil: se queda en la propuesta y
       se recuerda al empezar la partida, cuando ya se sabe su nombre. */
    if (editandoFicha === 'invitado') {
      /* SU NOMBRE SE VALIDA DONDE SE ESCRIBE. Antes esto se miraba al pulsar
         «Sortear», o sea en otra pantalla y después de haber cerrado el globo:
         el aviso salía lejos del campo que lo causaba. */
      /* VACÍO NO ES UN ERROR: es quedarse con el nombre de siempre. Quien
         borra el campo no está pidiendo un aviso, está diciendo «da igual». */
      var suyo = datos.limpiarNombre($('#f-nombre').value) || INVITADO;
      var malSuyo = datos.errorDeNombre(suyo);
      if (malSuyo) {
        $('#f-error').textContent =
          malSuyo.replace('Escribe tu nombre.', 'Escribe con quién juegas.');
        return;
      }
      if (suyo.toLowerCase() === datos.limpiarNombre(datos.perfil().nombre).toLowerCase()) {
        $('#f-error').textContent =
          'Se llaman igual que tú: ponle otro nombre para no confundirse en la sala.';
        return;
      }
      propuesta.otro = suyo;
      propuesta.otroAvatar = personajeElegido;
      propuesta.otroColor = colorElegido;
      cerrarGlobo();
      refrescarInvitado();
      var av0 = $('#p-aviso-ficha');
      if (av0) av0.textContent = '';
      revisarPreparar();
      return;
    }

    var nombre = datos.limpiarNombre($('#f-nombre').value);
    var mal = datos.errorDeNombre(nombre);
    if (mal) { $('#f-error').textContent = mal; return; }
    /* EL APODO ES ÚNICO (migración 0053): si cambió, se pregunta antes de
       guardar; el viejo se libera solo al guardar el nuevo, y el historial no se
       entera porque cuelga del id, no del apodo. */
    if (window.ATWI.auth && window.ATWI.auth.dentro() && nombre !== datos.perfil().nombre) {
      window.ATWI.auth.apodoLibre(nombre).then(function (libre) {
        if (!libre) { $('#f-error').textContent = 'Ese apodo ya está en uso. Prueba otro.'; return; }
        guardarFichaDeVerdad(nombre);
      });
      return;
    }
    guardarFichaDeVerdad(nombre);
  }
  function guardarFichaDeVerdad(nombre) {
    var fichaElegida = personajeElegido;
    datos.actualizar({ nombre: nombre, avatar: fichaElegida, avatarBorde: colorElegido });
    cerrarGlobo();
    pintarPerfil();
    refrescarFichaCabecera();
    if (vistaActual === 'jugar') pintarJugar();
    /* Si se guardó desde «Antes de empezar», arriba de esa pantalla está mi
       personaje y tiene que enseñar el nuevo (y apartar al invitado si choca). */
    refrescarMiPersonaje();

    if (window.ATWI.auth && window.ATWI.auth.dentro()) {
      var auth = window.ATWI.auth;
      /* El color todavía no tiene columna en la base: va en la migración 0010,
         que está escrita y sin aplicar. Se intenta con él y, si el servidor lo
         rechaza por no conocerlo, se reintenta sin él para no perder el nombre
         por un campo de adorno. */
      auth.guardarPerfil({ nombre: nombre, avatar: fichaElegida, avatar_fondo: colorElegido })
        .catch(function () {
          return auth.guardarPerfil({ nombre: nombre, avatar: fichaElegida });
        })
        .catch(function () { /* sin red se queda en local y se reintenta al volver */ });
    }
  }

  /* ======================================================================
     El buzón
     ====================================================================== */
  /* Cada tipo lleva el icono ILUSTRADO que le corresponde de verdad, no un
     emoji del sistema —que cada teléfono dibuja a su manera— ni uno prestado
     por parecido. Seis de los ocho tipos tienen el suyo:

       invitacion → los bocadillos: alguien te habla
       tu_turno   → el micrófono: te toca grabar
       resultado  → la insignia: es el momento de premio
       revancha   → el mazo: una revancha es un debate
       revision   → las manos: revisar un acuerdo es negociar
       acuerdo    → las manos, por lo mismo

     `vinculo` y `plataforma` todavía NO tienen icono ilustrado propio y van con
     el de línea, que se recolorea solo con el tono del tipo. Generarlos cuesta
     crédito de la API de imagen, así que no se hace sin autorización. */
  var ICONO_AVISO = {
    invitacion: 'jugar', tu_turno: 'micro', resultado: 'perfil', revancha: 'debate',
    revision: 'negociacion', acuerdo: 'negociacion',
    vinculo: 'corazon', plataforma: 'aviso'
  };

  function haceCuanto(iso) {
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'ahora mismo';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    var d = Math.floor(h / 24);
    return d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }

  /* LA CAMPANA CUENTA LAS DOS COSAS: los avisos del buzón y las partidas que
     esperan algo. Contaba solo los primeros, así que un resultado sin ver dejaba
     la campana apagada —y desde que la tarjeta de la portada se fue, eso sería
     no avisar de nada—.

     Y LATE, no solo lleva un punto: la marca de «hay algo» tiene que verse sin
     mirar el número, porque el número es de 12 px en una esquina. La animación
     va en la campana entera y se para sola a las seis repeticiones: un adorno
     que se mueve para siempre deja de leerse como un aviso y pasa a ser parte
     del mueble. */
  function refrescarPunto() {
    datos.avisos().then(function (lista) {
      var sinLeer = lista.filter(function (a) { return !a.leido; }).length +
                    partidasQueEsperan().length +
                    /* Y las invitaciones que me esperan (0055): son lo más
                       urgente del buzón, porque caducan. */
                    invitaciones.length;
      var p = $('#buzon-punto');
      var b = $('.buzon-boton');
      if (!p) return;
      p.hidden = sinLeer === 0;
      p.textContent = sinLeer > 9 ? '9+' : String(sinLeer);
      if (b) {
        /* Se reinicia la animación quitando y poniendo la clase: si ya estaba
           puesta, el navegador no la vuelve a lanzar y un aviso nuevo pasaría
           sin que la campana se moviera. */
        b.classList.remove('buzon-boton--late');
        if (sinLeer) { void b.offsetWidth; b.classList.add('buzon-boton--late'); }
      }
    });
  }

  function abrirBuzon() {
    var caja = $('#m-buzon .modal__cuerpo');
    caja.innerHTML = '<p class="chico tenue centrado" style="padding:var(--e-6) 0">Un momento…</p>';
    abrirModal('m-buzon');

    /* Las invitaciones se piden aquí mismo, frescas: es donde se aceptan. */
    var n = window.ATWI.nube;
    var conInv = n && n.hay && n.hay() && n.invitaciones ? n.invitaciones() : Promise.resolve([]);
    Promise.all([datos.avisos(), conInv]).then(function (par) {
      var lista = par[0] || [];
      invitaciones = par[1] || [];
      /* LO QUE ESPERA VA ARRIBA, antes que el buzón. Estas son las partidas que
         piden algo —un resultado sin recoger, una ronda a medias— y son la razón
         por la que la campana late. Van primero porque se resuelven tocándolas:
         lo de abajo es correo, esto es una tarea.
         No salen de la tabla `avisos`: se calculan del historial, y por eso
         antes vivían en una tarjeta de la portada. */
      var esperan = partidasQueEsperan();
      if (!lista.length && !esperan.length && !invitaciones.length) {
        caja.innerHTML = estadoVacio(icono('buzon', 76), 'Buzón vacío',
          'Aquí llegan las invitaciones a debatir, los avisos de que te toca grabar y los resultados.');
        return;
      }
      caja.innerHTML =
        /* LAS INVITACIONES PRIMERO (0055): son una pregunta que caduca, y se
           contesta aquí mismo con dos botones. */
        (invitaciones.length
          ? '<div class="apilado" style="margin-bottom:var(--e-4)">' +
            invitaciones.map(tarjetaDeInvitacion).join('') + '</div>'
          : '') +
        (esperan.length
          ? '<div class="apilado" style="margin-bottom:var(--e-4)">' +
            esperan.map(filaQueEspera).join('') + '</div>'
          : '') +
        (lista.length ? '<div class="apilado">' + lista.map(function (a) {
        return '<button class="aviso' + (a.leido ? '' : ' aviso--nuevo') + '" ' +
            'data-tipo="' + esc(a.tipo) + '" ' +
            (a.debate ? 'data-ir-debate="' + esc(a.debate) + '"' : '') + '>' +
            '<span class="aviso__icono">' + icono(ICONO_AVISO[a.tipo] || 'aviso', 28) + '</span>' +
            '<span class="aviso__texto">' +
              '<span class="aviso__titulo">' + esc(a.titulo) + '</span>' +
              (a.cuerpo ? '<span class="aviso__cuerpo">' + esc(a.cuerpo) + '</span>' : '') +
              '<span class="aviso__cuando">' + haceCuanto(a.creado) + '</span>' +
            '</span>' +
          '</button>';
        }).join('') + '</div>' : '');

      /* Abrir el buzón es leerlo. Se marca todo lo que hay dentro.
         LAS PARTIDAS QUE ESPERAN NO SE MARCAN: no son correo, son tareas. Un
         resultado sin ver sigue sin verse aunque hayas abierto el buzón, y la
         campana tiene que seguir latiendo hasta que lo abras de verdad. */
      var nuevos = lista.filter(function (a) { return !a.leido; }).map(function (a) { return a.id; });
      if (nuevos.length) datos.marcarLeidos(nuevos).then(refrescarPunto);
    });
  }

  /* ======================================================================
     Flujo: proponer un debate
     ====================================================================== */
  var propuesta = { temaId: null, modo: null, turnos: null, juez: null, donde: null };

  /* DONDE SE JUEGA: EN ESTE MOVIL O CON UNA INVITACION (titular, 2026-09-17).
     ANTES ERA LA ULTIMA PANTALLA Y ERA EL SITIO EQUIVOCADO. Se preguntaba al
     final, con dos botones del mismo tamano en el pie del detalle del tema, y
     ahi la pregunta llega tarde y de sorpresa: quien ya eligio modo, mesa y
     tema tiene la cabeza en jugar, no en decidir por que via. Ahora es un
     interruptor de dos posiciones en «¿Con quien juegas?» --que es donde se
     decide con quien, o sea la misma pregunta-- y lo que elige es la pantalla
     que sale despues del tema.

     SE RECUERDA, como el juez y como la ficha del invitado: quien juega en el
     sofa lo hace casi siempre igual, y volver a elegirlo cada partida es
     trabajo que la app ya sabe hacer. */
  var DONDE = 'atwi-donde';
  function dondeSeJuega() {
    if (propuesta.donde) return propuesta.donde;
    var d = null;
    try { d = localStorage.getItem(DONDE); } catch (e) {}
    propuesta.donde = (d === 'linea') ? 'linea' : 'local';
    return propuesta.donde;
  }
  function recordarDonde(d) {
    propuesta.donde = d;
    try { localStorage.setItem(DONDE, d); } catch (e) {}
  }

  /* EL ULTIMO JUEZ SE RECUERDA, igual que la ficha del invitado. Quien
     encontro uno que le gusta no tiene que volver a buscarlo cada partida, y
     quien no lo ha tocado nunca se lleva uno AL AZAR la primera vez en vez de
     siempre el mismo: seis jueces de los que solo se ve uno no son seis. */
  var ULTIMO_JUEZ = 'atwi-juez';
  function juezPorDefecto() {
    var j;
    try { j = localStorage.getItem(ULTIMO_JUEZ); } catch (e) { j = null; }
    if (j && window.ATWI.esJuez(j)) return j;
    var todos = window.ATWI.jueces();
    return todos[Math.floor(Math.random() * todos.length)].clave;
  }
  function recordarJuez(j) {
    try { localStorage.setItem(ULTIMO_JUEZ, j); } catch (e) {}
  }
  /* Duración estimada de una partida según los turnos por persona. Sale de
     docs/03 §19: grabar, esperar al otro, transcribir y el veredicto. */
  /* Cuánto dura una partida según los turnos que se elijan. La tabla se queda
     completa aunque hoy solo se ofrezcan hasta tres: es una referencia de
     duración, no la lista de lo que se ofrece --eso sale de `turnosMax`--. */
  var MINUTOS = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 12 };

  function opcionesDeTurnos() {
    var l = [];
    for (var n = cfg.reglas.turnosMin; n <= cfg.reglas.turnosMax; n++) l.push(n);
    return l;
  }

  /* DEL CATALOGO SE PASA DERECHO A «ANTES DE EMPEZAR» (titular, 2026-09-17).
     Aquí se abría el DETALLE DEL TEMA —el enunciado en su tarjeta retocable, la
     ilustración del modo y un botón— y el titular lo sacó del flujo: la tarjeta
     del catálogo ya trae el título Y el enunciado, y su lápiz lleva al editor
     sin pasar por aquí, así que el detalle enseñaba por segunda vez lo que se
     acababa de leer y metía un toque entre elegir tema y preparar la partida.

     ⚠️ LO QUE QUEDA SIN PANTALLA, y hay que decidirlo: el modal `m-tema` sigue
     en el HTML —con su peana y su cabecera— pero **ya no lo abre nadie**, y con
     él quedan huérfanas las tres ilustraciones por modo (`escena-*`), que son de
     hoy. Están fuera del manifiesto para que no se bajen a cada teléfono
     mientras tanto. O se reubican o se borran las dos cosas; dejarlo así es
     tener una pantalla que nadie ve pareciendo que sirve. */
  function elegirTema(id) {
    var t = datos.tema(id);
    if (!t) return;
    propuesta.temaId = id;
    /* El modo NO se toca aquí: viene elegido desde la portada. Antes se ponía a
       null y se preguntaba después; ahora llegar hasta un tema sin modo sería
       llegar por un camino que ya no existe, pero se cubre por si acaso. */
    if (!propuesta.modo) propuesta.modo = 'debate';
    if (!propuesta.turnos) propuesta.turnos = cfg.reglas.turnosPorDefecto;
    abrirPreparar();
  }

  /* ======================================================================
     Retocar una sección suelta del tema
     ====================================================================== */
  /* Ya solo se retoca el enunciado: las posturas se fueron del tema. */
  var SECCIONES = {
    enunciado: { titulo: 'La pregunta', minimo: 15, max: 240,
                 /* Sin «las dos salidas dentro»: ver la ayuda del editor. */
                 pista: 'Una pregunta de opinión, sin inclinarse por ninguna ' +
                        'respuesta.',
                 corto: 'Escribe la pregunta.' }
  };
  var retocando = null;

  function abrirRetocar(campo) {
    var t = datos.tema(propuesta.temaId);
    var s = SECCIONES[campo];
    if (!t || !s) return;
    retocando = campo;

    $('#m-retocar').className = 'modal modal--' + propuesta.modo;
    $('#m-retocar .modal__titulo').textContent = s.titulo;
    $('#m-retocar .modal__cuerpo').innerHTML =
      '<p class="chico suave" style="margin-bottom:var(--e-4)">' +
        'Cambia solo esto. Lo demás del tema se queda como está.</p>' +
      '<textarea class="campo campo--parrafo" id="r-texto" rows="4" maxlength="' + s.max + '">' +
        esc(t[campo]) + '</textarea>' +
      '<p class="chico tenue" style="margin-top:6px">' + esc(s.pista) + '</p>' +
      '<p class="chico" id="r-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>';

    $('#m-retocar .modal__pie button').className =
      'boton boton--bloque boton--grande boton--' + propuesta.modo;
    abrirModal('m-retocar');
    setTimeout(function () { var c = $('#r-texto'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }, 80);
  }

  function guardarRetoque() {
    var s = SECCIONES[retocando];
    var valor = ($('#r-texto').value || '').trim();
    if (!valor) { $('#r-error').textContent = s.corto; return; }
    /* EL RETOQUE TAMBIÉN PASA POR EL REVISOR: es el mismo criterio que al
       guardar un tema entero, porque lo que cambia es lo que se juega. */
    var t0 = datos.tema(propuesta.temaId) || {};
    var b = $('#m-retocar .modal__pie button');
    if (b) { b.disabled = true; b.textContent = 'Revisando…'; }
    window.ATWI.nube.revisarTema({
      titulo: retocando === 'titulo' ? valor : t0.titulo,
      enunciado: retocando === 'enunciado' ? valor : t0.enunciado,
      modo: propuesta.modo
    }).then(function (r) {
      if (b) { b.disabled = false; b.textContent = 'Guardar'; }
      if (r && r.valido === false) {
        $('#r-error').textContent = (r.explicacion || 'Así no se puede jugar.') +
          (r.sugerencia && r.sugerencia.enunciado ? ' Podría ser: «' + r.sugerencia.enunciado + '».' : '');
        return;
      }
      guardarRetoqueDeVerdad(valor);
    });
  }

  function guardarRetoqueDeVerdad(valor) {
    var campos = {};
    campos[retocando] = valor;
    var guardado = datos.retocarTema(propuesta.temaId, campos);

    cerrarModal('m-retocar');
    pintarCatalogo();
    if (!guardado) return;

    /* Se vuelve a donde se estaba. Si el retoque salió de «Antes de empezar»,
       esa pantalla se repinta conservando la postura elegida y los nombres ya
       escritos: quien está a un toque de grabar no debería perder nada por
       corregir una frase. */
    if (!$('#m-preparar').hidden) {
      abrirPreparar(true);
      revisarPreparar();
    }
  }

  /* ======================================================================
     Escribir un tema · EN GLOBO, DESDE EL ICONO DE CREAR (titular, 2026-09-18)
     Era un modal a pantalla completa, con su cabecera, su flecha de volver y su
     pie. Se va por lo mismo que se fueron de ahí la confirmación de borrado y
     la ficha: un modal a pantalla completa es la ceremonia de ENTRAR a algo, y
     aquí no se entra a ningún sitio —se escriben dos renglones y se guarda—. El
     globo sale del icono de crear que está junto al título «Mis propios temas»,
     deja ver la lista debajo y se cierra tocando fuera.
     Dos cosas con el mismo globo, porque para quien escribe son la misma:
       · REESCRIBIR uno del catálogo. El original no se toca y se puede volver.
       · CREAR uno propio, que cae en «Mis temas».

     ⚠️ Y AQUÍ SE FUE EL AVISO DE «LAS DOS RESPUESTAS SE PUEDAN DEFENDER»
     (titular, 2026-09-18: «eso ya no aplica»), que era un bloque de cuatro
     renglones al pie. Y la razón es que el juego dejó de necesitarlo: desde que
     `revisar_tema` lee lo escrito AL GUARDAR, esa prueba exacta es uno de sus
     cuatro motivos de rechazo —`una_salida`— y la explica con las palabras del
     tema que se escribió, no en abstracto y por adelantado. Lo mismo el aviso
     del premio: «escrito desde el que gana», «concreto», «que no duela» y «no
     de grupo» son las reglas que ese mismo revisor comprueba. El aviso era la
     regla dicha dos veces, y la de arriba se leía antes de tener nada escrito,
     que es cuando menos sirve. Lo único que queda es una línea diciendo que al
     guardar se revisa, que es lo que explica el «Revisando…» del botón.
     ====================================================================== */
  var escribiendo = null;   // {id, propio} · id null = tema nuevo

  function abrirEscribir(id, disparador) {
    var t = id ? datos.tema(id) : null;
    var propio = Boolean(t && t.propio);
    var reescrito = Boolean(t && !propio && datos.estaReescrito(id));
    escribiendo = { id: id || null, propio: propio || !id };

    /* El globo cuelga de quien lo abrió: el icono de crear de la cabecera o el
       lápiz de la tarjeta. Si quien llama no lo dice, se cuelga del de crear,
       que es el sitio donde vive esta pantalla. */
    var d = disparador || $('[data-accion="tema-nuevo"]');
    if (!d) return;

    /* EL FORMULARIO ES EL MISMO Y PIDE OTRA COSA. En QuiénGane no se escribe
       una pregunta sino un premio, así que cambian el título, la ayuda, las dos
       etiquetas y los ejemplos. Lo que NO cambia es el mecanismo: mismo globo,
       mismo guardado, mismo borrado. Duplicarlo para cambiar seis frases habría
       dejado dos sitios donde arreglar el mismo fallo. */
    var esPremio = propuesta.modo === 'competencia';

    var cuerpo =
      '<div class="tema-editor globo__cede">' +
        '<p class="globo__texto">' +
          (t && !propio
            ? (esPremio
                ? 'Cámbialo para que se parezca a lo que ustedes se jugarían. ' +
                  'El original del catálogo no se toca.'
                : 'Cámbiala para que se parezca a la discusión de ustedes. ' +
                  'El original del catálogo no se toca.')
            : (esPremio
                ? 'Qué se lleva quien gane. Concreto, entre ustedes dos y para esta semana.'
                /* ⚠️ SIN «CON LAS DOS SALIDAS DENTRO» (titular, 2026-09-18:
                   «eso es falso para el proyecto»). Pedía escribir el tema como
                   una disyuntiva, y eso no es lo que el juego necesita ni lo
                   que el revisor comprueba: su prompt dice expresamente que la
                   pregunta «puede estar escrita sin signos de interrogación o
                   sin un "o" explícito» y que lo que importa es que haya dos
                   posturas que alguien razonable pueda sostener. Una cosa es
                   que el tema ADMITA dos respuestas —eso sí, y lo mira el
                   revisor al guardar— y otra que haya que escribirlas. */
                : 'Una pregunta de opinión sobre algo de ustedes. Nadie elige ' +
                  'lado: cada quien dice lo suyo al hablar.')) +
        '</p>' +

        (reescrito
          ? '<div class="reescrito">' + window.ATWI.iconoSVG('lapiz', 16) +
              '<span>Reescrito por <strong>' + esc(t.editadoPor || 'alguien') + '</strong>' +
              (t.editado ? ' · ' + haceCuanto(t.editado) : '') + '</span>' +
            '</div>'
          : '') +

        campoTexto('e-titulo', 'Título corto', t ? t.titulo : '', 'input',
                   esPremio ? 'En la lista: «El control remoto».'
                            : 'En la lista: «El tubo de pasta».',
                   /* 30 Y NO 60 (titular, 2026-09-17): el titulo tiene que
                      caber en UNA linea de la tarjeta sin llegar al lapiz de
                      editar. Medido a 375, que es el ancho mas estrecho: le
                      quedan 245 px, y con 30 caracteres ninguno de los 455 del
                      catalogo se pasa —con 32 se pasarian once—. Lo que explica
                      es el enunciado, que sigue en 175. */
                   30) +
        campoTexto('e-enunciado', esPremio ? 'El premio' : 'La pregunta',
                   t ? t.enunciado : '', 'textarea',
                   esPremio
                     ? 'Por ejemplo: «Quien gane elige la película del viernes».'
                     : 'Por ejemplo: «¿Los platos se lavan al terminar de comer o ' +
                       'pueden esperar?».', 240) +

        '<p class="chico" id="e-error" style="color:var(--peligro)"></p>' +
        /* LO QUE DIJO EL REVISOR, si el tema no pasó: por qué, y la reescritura
           que propone con su botón. Vacío no ocupa. */
        '<div class="tema-revision" id="e-revision" hidden></div>' +
      '</div>';

    /* LOS BOTONES VAN AL PIE DEL GLOBO, con las mismas variantes que el globo
       de borrado del historial: el que hace lo de esta pantalla en el color del
       modo, y los de salida en blanco —el punteado para «vuelve al de antes» y
       la tinta de peligro para el que borra—.
       ⚠️ `boton--punteado` SOLO PONE EL BORDE: la cara blanca la pone
       `boton--suave`. Con el punteado a secas los dos salían en el lavanda de
       serie con la letra roja encima, que no se leía. */
    var acciones =
      '<button class="boton boton--bloque boton--' + claseDeModo() + '" id="e-guardar" ' +
        'data-accion="guardar-tema">' +
        (esPremio ? 'Guardar el premio' : 'Guardar el tema') + '</button>' +
      (reescrito
        ? '<button class="boton boton--suave boton--bloque boton--punteado" ' +
          'data-accion="devolver-tema">' + icono('cambiar', 20) +
          'Volver al del catálogo</button>'
        : '') +
      (propio
        ? '<button class="boton boton--suave boton--bloque boton--borrar" ' +
          'data-accion="borrar-tema">Borrar este ' +
          (esPremio ? 'premio' : 'tema') + '</button>'
        : '');

    abrirGlobo(d,
      { titulo: !t
          ? (esPremio ? 'Tu propio premio' : 'Tu propio tema')
          : (esPremio ? 'Editar premio' : 'Editar tema') },
      /* EL TINTE ES EL DEL MODO que se está jugando, como toda esta pantalla. Y
         el signo dice qué se hace: el «más» cuando se crea, el lápiz cuando se
         edita, los dos a 64 como el de la ficha —la bombilla de las ayudas mide
         96 y encabezaría el globo—. */
      { tinte: claseDeModo(),
        signo: t ? 'lapiz' : 'mas', signoTam: 64,
        etiqueta: esPremio ? 'Escribir un premio' : 'Escribir un tema',
        cuerpo: cuerpo,
        acciones: acciones });

    setTimeout(function () { var n = $('#e-titulo'); if (n && !t) n.focus(); }, 60);
  }

  /* El peso del tema —ligera, media, profunda— ya no se elige al escribirlo:
     todos valen lo mismo a la hora de jugarlos. Se conserva el que traiga el
     tema del catálogo para no perder el dato, y los propios nacen en «media». */
  var intensidadElegida = 'media';

  function campoTexto(id, etiqueta, valor, tipo, pista, max) {
    var control = tipo === 'textarea'
      ? '<textarea class="campo campo--parrafo" id="' + id + '" rows="3" maxlength="' + max + '">' + esc(valor) + '</textarea>'
      : '<input class="campo" id="' + id + '" type="text" maxlength="' + max + '" value="' + esc(valor) + '">';
    return '<label style="display:block">' +
        '<span class="chico" style="font-weight:700">' + esc(etiqueta) + '</span>' +
        '<span style="display:block;margin-top:6px">' + control + '</span>' +
        '<span class="chico tenue" style="display:block;margin-top:6px">' + pista + '</span>' +
      '</label>';
  }

  /* GUARDAR UN TEMA: LOS CAMPOS LLENOS Y NADA MÁS POR CÓDIGO (titular,
     2026-09-18: «permite que el usuario guarde o edite temas como quiera, eso
     sí, mínimo ingresar los datos de campo»). Aquí había condicionales —un
     largo mínimo, un «o» obligatorio, «quien gane» en los premios— y
     rechazaban temas válidos escritos de otra manera.

     LO QUE SÍ SE MIRA ES SI SE PUEDE JUGAR, y eso lo mira el revisor
     (`revisar_tema`, una llamada de un centavo): que sea una pregunta de opinión
     con dos salidas defendibles, que no sea un galimatías ni una prueba, que no
     toque lo que el juego no puede tocar. Se hace AQUÍ, al guardar, y no al
     lanzar la partida (decisión del titular): así no se toca el ritmo de armar
     una partida y todo lo que hay en la lista ya es jugable. Si no pasa, se
     dice por qué y se ofrece la reescritura en el mismo editor, sin guardar; si
     el revisor no contesta, se guarda igual. */
  var revisandoTema = false;
  function guardarTema() {
    if (revisandoTema) return;
    var v = function (id) { return ($('#' + id).value || '').trim(); };
    var titulo = v('e-titulo'), enunciado = v('e-enunciado');
    var esPremio = propuesta.modo === 'competencia';
    var fallo = !titulo ? 'Ponle un título.' : !enunciado
      ? (esPremio ? 'Escribe el premio.' : 'Escribe la pregunta.') : '';
    $('#e-error').textContent = fallo;
    if (fallo) return;

    var caja = $('#e-revision');
    if (caja) { caja.hidden = true; caja.innerHTML = ''; }
    var b = $('#e-guardar');
    revisandoTema = true;
    if (b) { b.disabled = true; b.textContent = 'Revisando…'; }
    window.ATWI.nube.revisarTema({ titulo: titulo, enunciado: enunciado, modo: propuesta.modo })
      .then(function (r) {
        revisandoTema = false;
        if (b) { b.disabled = false; b.textContent = esPremio ? 'Guardar el premio' : 'Guardar el tema'; }
        if (r && r.valido === false) return pintarRevision(r, esPremio);
        guardarTemaDeVerdad(titulo, enunciado);
      });
  }

  /* El veredicto del revisor, en el editor: la explicación y, si la hay, la
     reescritura con su botón para usarla. La persona decide: puede tocar la
     sugerencia, escribir otra cosa o cerrar. Lo que no puede es guardar lo que
     el juego no podría juzgar. */
  function pintarRevision(r, esPremio) {
    var caja = $('#e-revision');
    if (!caja) return;
    var s = r.sugerencia;
    caja.innerHTML =
      '<p class="tema-revision__que">' + iconoSVG('aviso', 18) + '<span>' +
        esc(r.explicacion || 'Así no se puede jugar.') + '</span></p>' +
      (s && s.enunciado
        ? '<div class="tema-revision__sugerencia">' +
            '<span class="chico tenue">Podría ser:</span>' +
            (s.titulo ? '<strong>' + esc(s.titulo) + '</strong>' : '') +
            '<span>' + esc(s.enunciado) + '</span>' +
            '<button type="button" class="boton boton--suave boton--bloque" data-accion="usar-sugerencia">' +
              'Usar esta versión</button>' +
          '</div>'
        : (r.motivo === 'no_es_para_juego'
            ? '<p class="chico tenue" style="margin:6px 0 0">Este ' + (esPremio ? 'premio' : 'tema') +
              ' no es para el juego, así que no hay una versión que proponer.</p>'
            : ''));
    caja.dataset.titulo = (s && s.titulo) || '';
    caja.dataset.enunciado = (s && s.enunciado) || '';
    caja.hidden = false;
    /* EL GLOBO SE MIDE AL ABRIRSE, así que lo que crece dentro después hay que
       recolocarlo a mano: sin esto, la explicación del revisor se sale por
       abajo del marco —el globo se coloca contra su alto REAL, y ese alto
       cambió—. */
    recolocarGlobo();
  }

  function usarSugerencia() {
    var caja = $('#e-revision');
    if (!caja) return;
    if (caja.dataset.titulo) $('#e-titulo').value = caja.dataset.titulo;
    if (caja.dataset.enunciado) $('#e-enunciado').value = caja.dataset.enunciado;
    caja.hidden = true;
    caja.innerHTML = '';
    recolocarGlobo();
  }

  function guardarTemaDeVerdad(titulo, enunciado) {
    var t = datos.tema(escribiendo.id);
    var campos = { titulo: titulo, enunciado: enunciado,
                   intensidad: (t && t.intensidad) || intensidadElegida };
    if (escribiendo.propio) datos.guardarTemaPropio(Object.assign({ id: escribiendo.id }, campos));
    else datos.reescribir(escribiendo.id, campos);

    cerrarGlobo();
    /* SE VUELVE AL CATALOGO Y NADA MAS. Aquí se reabría el detalle del tema con
       lo recién escrito; desde que el detalle no está en el flujo, lo que hay
       detrás es la lista, y la lista ya enseña el enunciado nuevo al repintarse. */
    pintarCatalogo();
  }

  /* ======================================================================
     Antes de empezar: quién defiende qué, y con quién se juega
     Sin esto la partida arrancaba con «Tú» contra «La otra parte» y sin decir
     quién defendía cuál de las dos posturas, que es justo lo que el árbitro
     tiene que juzgar.
     ====================================================================== */
  /* Los invitados con los que ya se jugó en este teléfono, para no volver a
     escribirles el nombre ni volver a elegirles la ficha. */
  function invitadosPrevios() { return datos.invitados(); }

  /* AQUÍ ESTABAN LOS ATAJOS DE INVITADO y se quitaron (decisión del titular,
     2026-09-14). Eran una lista para tocar de un vistazo, pasaron de tres a dos
     por falta de sitio, y al final ni dos hacían falta: quien juega en este
     teléfono es casi siempre la misma persona, y para esa el campo ya viene
     relleno. Una lista de dos donde uno es siempre el bueno no es un atajo, es
     una pregunta de más.

     LO QUE SE RECUERDA SIGUE ESTANDO: `datos.recordarInvitado` guarda el último
     y `abrirPreparar` lo pone en el campo. Desaparece la pantalla, no la
     memoria. */

  /**
   * La ficha del invitado. Ya no se elige: es el personaje que no soy yo. Con
   * dos, la cuenta sale sola, y además garantiza lo que antes se pedía a mano
   * apartando mi color —que las dos fichas se distingan en la sala—.
   * Se ignora a propósito lo que hubiera guardado de partidas viejas: si me
   * cambio de personaje, el invitado tiene que moverse conmigo.
   */
  /** Un personaje que no sea el mío. Si el que viene ya lo es, el siguiente. */
  function distintoDeMi(quien) {
    var mio = datos.perfil().avatar;
    return quien === mio ? window.ATWI.otroPersonaje(mio) : quien;
  }

  /* LA MISMA PIEZA QUE `bloqueMio`, con el invitado dentro. Vive en una función
     porque se pinta al abrir la pantalla y se repinta cada vez que algo le
     cambia —al guardar su globo, y cuando mi personaje le pisa el suyo—: dos
     copias del mismo HTML se desincronizan a la primera. */
  /* LOS DOS PERFILES, LADO A LADO Y CON LA MISMA PRESENTACIÓN (titular,
     2026-09-18: «izquierda el host y el otro por defecto Invitado… nos
     deshacemos de la label, partimos el "habla por ti" y el "Cambiar" debajo…
     juez debajo y turnos de último parámetro»). El rótulo «Invitado» se va
     porque **su nombre ES el título**: con el mío enfrente diciendo el mío, no
     hace falta una etiqueta que diga de quién es cada columna.
     Los tres renglones van en su línea —nombre, quién habla, «Cambiar»— porque
     en media pantalla de ancho el renglón entero se partía por donde cayera. */
  function perfilEnDuo(o) {
    return '<button type="button" class="perfil-duo' + (o.vacio ? ' perfil-duo--vacio' : '') +
        '" data-accion="' + o.accion + '"' +
        (o.tono ? ' style="--suyo:' + o.tono + '"' : '') +
        ' aria-label="' + esc(o.etiqueta) + '">' +
        '<span class="perfil-duo__retrato">' + o.retrato + '</span>' +
        '<span class="perfil-duo__quien">' + esc(o.quien) + '</span>' +
        '<span class="perfil-duo__como">' + esc(o.como) + '</span>' +
        '<span class="perfil-duo__cambiar">' + esc(o.tocar) + '</span>' +
      '</button>';
  }

  function fichaGrandeDelInvitado() {
    /* Con el nombre genérico puesto, «Nico habla por Invitado» se lee como un
       error; se dice de quién habla sin repetir la etiqueta. */
    var suyo = propuesta.otro === INVITADO ? 'tu invitado' : propuesta.otro;
    return perfilEnDuo({
      accion: 'ficha-invitado',
      tono: window.ATWI.colorPersonaje(propuesta.otroColor),
      retrato: window.ATWI.fichaHTML(propuesta.otroAvatar, 'avatar--duelo', propuesta.otroColor),
      quien: propuesta.otro || INVITADO,
      como: window.ATWI.nombrePersonaje(propuesta.otroAvatar) + ' habla por ' + suyo,
      tocar: 'Cambiar',
      etiqueta: 'Cambiar la ficha de ' + (propuesta.otro || INVITADO)
    });
  }

  /* EN LINEA LA COLUMNA DE LA DERECHA ESTÁ VACÍA, Y ESO ES LO QUE DICE (titular,
     2026-09-18: «aparece vacío, gris y sin personaje, placeholder Invitar; al
     darle click sacamos un globo con el correo»). No es un hueco pendiente de
     rellenar por mí: el personaje de quien juegue ese lado **lo elige quien
     juegue ese lado**, en su teléfono. Lo único mío es a quién se lo mando. */
  function huecoDeInvitar() {
    var hay = Boolean(propuesta.correo);
    return perfilEnDuo({
      accion: 'invitar-correo',
      vacio: true,
      retrato: '<span class="avatar avatar--duelo perfil-duo__hueco">' +
                 iconoSVG(hay ? 'listo' : 'mas', 34) + '</span>',
      quien: hay ? propuesta.correo : 'Invitar',
      como: hay ? 'Le llega un enlace' : 'Elige su personaje al entrar',
      tocar: hay ? 'Cambiar' : 'Escribir el correo',
      etiqueta: hay ? 'Cambiar a quién invitas' : 'Escribir el correo de quien invitas'
    });
  }

  /** Repinta la ficha grande del invitado donde esté. */
  function refrescarInvitado() {
    var b = $('#m-preparar [data-accion="ficha-invitado"]');
    if (b) b.outerHTML = fichaGrandeDelInvitado();
  }

  function refrescarMiPerfilDuo() {
    var b = $('#m-preparar [data-accion="ficha-mia"]');
    if (!b) return false;
    var p = datos.perfil();
    b.outerHTML = perfilEnDuo({
      accion: 'ficha-mia',
      tono: window.ATWI.colorPersonaje(p.avatarBorde),
      retrato: window.ATWI.fichaHTML(p.avatar, 'avatar--duelo', p.avatarBorde),
      quien: p.nombre || 'Tú',
      como: window.ATWI.nombrePersonaje(p.avatar) + ' habla por ti',
      tocar: 'Cambiar',
      etiqueta: 'Cambiar tu personaje'
    });
    return true;
  }

  /* EL INVITADO YA TIENE NOMBRE ANTES DE ESCRIBIRLO (titular, 2026-09-18: «por
     defecto tiene como nombre: Invitado, o el último invitado que haya
     jugado»). Sin esto, la pantalla abría con un hueco que había que rellenar
     para poder jugar; con esto se puede sortear de una y el nombre se cambia
     solo si se quiere. Es un nombre de verdad —pasa la regla del nombre y viaja
     a la sala—, no un texto de relleno. */
  var INVITADO = 'Invitado';

  function fichaDelInvitado(nombre) {
    var g = nombre ? datos.invitado(nombre) : null;
    return {
      nombre: (g ? g.nombre : nombre) || '',
      /* Si ya jugó en este teléfono se le devuelve su ficha; si no, el personaje
         que yo NO soy, que es lo que suele querer.

         Y NUNCA EL MÍO, venga de donde venga. Lo guardado puede chocar sin que
         nadie haya hecho nada raro: basta que yo cambie de personaje después de
         la última partida con esa persona. Antes valían dos Kai porque los
         distinguía el aro; desde que el color es el dibujo, dos Kai en el mismo
         color son la misma figura exacta. */
      avatar: distintoDeMi((g && g.avatar) || propuesta.otroAvatar ||
                           window.ATWI.otroPersonaje(datos.perfil().avatar)),
      /* El color SÍ puede repetirse —lo que distingue ahora es la figura— así
         que el invitado hereda el mío si no tiene uno propio. Darle otro a la
         fuerza sería decidir por él algo que ya no hace falta decidir. */
      color: window.ATWI.elColor((g && g.color) || propuesta.otroColor ||
                                 datos.perfil().avatarBorde)
    };
  }

  /**
   * `repintando` vuelve a dibujar la pantalla SIN reabrirla: se usa al retocar
   * un texto desde aquí. Reabrirla apilaría otra entrada de historial y
   * perdería la postura ya elegida y los nombres escritos.
   */
  /* EL INTERRUPTOR DE LA VIA, arriba del todo de «Antes de empezar». Va aquí y
     no en una pantalla propia (titular, 2026-09-17): había un par de botones al
     final del detalle del tema —«Jugar los dos en este móvil» y «Enviar
     invitación»— y esa pregunta, hecha al final y en una pantalla entera, llega
     tarde y de sorpresa. Aquí es una línea en la pantalla donde ya se decide
     todo lo demás de la partida, y lo que elige cambia el resto del formulario.
     Dos botones de verdad y no un `checkbox` disfrazado: son dos caminos con
     nombre, y `aria-pressed` deja que un lector de pantalla diga cuál está
     puesto. */
  var DONDES = [
    ['local', 'En este móvil'],
    ['linea', 'Con invitación']
  ];
  function selectorDeDonde() {
    var puesto = dondeSeJuega();
    return '<div class="donde" role="group" aria-label="Dónde se juega">' +
      DONDES.map(function (d) {
        return '<button type="button" class="donde__op' +
                 (d[0] === puesto ? ' donde__op--puesto' : '') +
               '" data-donde="' + d[0] + '" aria-pressed="' + (d[0] === puesto) + '">' +
                 esc(d[1]) +
               '</button>';
      }).join('') +
    '</div>';
  }

  function abrirPreparar(repintando) {
    var t = datos.tema(propuesta.temaId);
    if (!t) return;
    var p = datos.perfil();
    /* EN LINEA SE PREGUNTA MENOS, y no es por simplificar: lo que se va es lo
       que NO es mío. La ficha del invitado y su abogado los elige él en su
       teléfono —decidirlos por él sería repartirle personaje sin preguntarle—,
       así que de esta pantalla solo quedan los turnos, el juez y a quién se
       invita. En local los dos están delante y se elige todo aquí.
       ⚠️ LA PARTIDA EN LINEA NO EXISTE TODAVIA: este camino termina en la
       pantalla de invitación, que dice que aún no hay servidor. */
    var enLinea = dondeSeJuega() === 'linea';
    /* El último con quien se jugó viene puesto: nombre, personaje y aro. En un
       teléfono compartido se repite casi siempre la misma pareja, y escribir el
       mismo nombre cada vez es trabajo que la app ya sabe hacer. */
    /* EL JUEZ SE SORTEA EN CADA PARTIDA (titular, 2026-09-18). Antes venía el
       último con el que se jugó —`juezPorDefecto()` leía `localStorage`—, que
       es lo correcto para la ficha del invitado y lo contrario de lo que se
       quiere aquí: el juez es del juego, no una preferencia.
       ⚠️ Y SE SORTEA AL ABRIR, NO AL REPINTAR (lo vio el titular, 2026-09-18:
       «el juez está cambiando al cambiar de modo, esto no debe pasar»). El
       formulario se vuelve a dibujar entero cada vez que se toca el interruptor
       de vía, y con el sorteo aquí suelto **cada toque echaba un juez nuevo**:
       la partida es la misma, así que el juez también. De paso, cada repintado
       se comía un juez de la vuelta —cuatro toques y la vuelta de seis se había
       gastado sin jugar una sola partida—. */
    if (!repintando || !propuesta.juez) propuesta.juez = sortearJuez();
    propuesta.otro = propuesta.otro || (invitadosPrevios()[0] || {}).nombre || INVITADO;
    var g = fichaDelInvitado(propuesta.otro);
    propuesta.otroAvatar = g.avatar;
    propuesta.otroColor = g.color;
    /* EL PERSONAJE DE CADA UNO ES SU FICHA, Y NO HAY «ABOGADO» APARTE (titular,
       2026-09-18: «el host juega con su personaje, que viene de su perfil, pero
       puede cambiarlo antes de cada partida; el del invitado se define en su
       ficha de invitado, no se selecciona aparte como abogado»). Desde que el
       personaje es obligatorio, elegirlo dos veces --una como ficha y otra como
       abogado-- era la misma decisión partida en dos filas. Lo que se ve arriba
       de esta pantalla es lo que habla por mí, y tocarlo abre MI FICHA: lo que
       se elija ahí queda en el perfil, o sea para esta partida y para las
       siguientes. Que los dos no sean el mismo lo cuida la ficha del invitado
       (`distintoDeMi`) y la red de `sortearYJugar`. */
    ['repreYo', 'repreOtro'].forEach(function (k) { delete propuesta[k]; });

    $('#m-preparar').className = 'modal modal--' + propuesta.modo;
    /* --- Las piezas del formulario, que se ordenan distinto en cada vía --- */

    /* MI PERSONAJE, CENTRADO Y ARRIBA DE TODO (titular, 2026-09-18): es lo
       primero que se decide porque es quien va a hablar por mí, y sale en las
       dos vías porque es lo único de esta pantalla que es mío en las dos. El
       bloque entero es un botón: abre la ficha del perfil, la misma de la
       pestaña Perfil, y al guardar se repinta aquí (`refrescarMiPersonaje`). */
    var bloqueMio = perfilEnDuo({
      accion: 'ficha-mia',
      tono: window.ATWI.colorPersonaje(p.avatarBorde),
      retrato: window.ATWI.fichaHTML(p.avatar, 'avatar--duelo', p.avatarBorde),
      quien: p.nombre || 'Tú',
      como: window.ATWI.nombrePersonaje(p.avatar) + ' habla por ti',
      tocar: 'Cambiar',
      etiqueta: 'Cambiar tu personaje'
    });

    /* EL INVITADO SE PRESENTA COMO YO (titular, 2026-09-18: «tiene una ficha
       similar a la del user en globo, démosle una igual, y quitamos el input de
       nombre de la interfaz y lo metemos en el globo también para el
       invitado»). Eran dos cosas distintas para la misma decisión: mi persona
       era un retrato centrado que se toca, y la suya un campo de texto con una
       ficha chica al lado. Ahora las dos son la misma pieza —retrato, nombre y
       en qué voz habla— y **todo lo suyo se edita en su globo**: el nombre
       estaba suelto en el formulario y el dibujo dos centímetros más allá,
       detrás de otro toque.
       No es una cuenta: es alguien que agarró este teléfono. Pero su ficha se
       recuerda, así que la próxima vez que juegue sale como salió. */
    var bloqueInvitado = fichaGrandeDelInvitado();

    /* EN LINEA NO SE INVITA A UN NOMBRE, SE INVITA A UN CORREO (titular,
       2026-09-17). El nombre vale mientras la persona está al lado; para
       mandarle una partida hace falta una dirección. El campo es `type="email"`
       de verdad —no un texto que parece uno— para que el teclado del teléfono
       salga con la arroba, y lo valida la MISMA función que la puerta de
       entrada: `ATWI.entrada.valeCorreo`.
       ⚠️ AQUI DEBAJO VAN A IR LOS CONTACTOS, y la regla ya está decidida: la
       lista son las personas con las que se COMPLETÓ al menos una partida, no
       las que se invitaron. Invitar no es jugar —una invitación que nadie
       aceptó no dice nada de nadie— y una lista llena de direcciones a las que
       se escribió una vez es una agenda, no unos contactos. Con ellos, reinvitar
       no pide volver a escribir el correo. */
    var bloqueCorreo = huecoDeInvitar();

    /* AQUÍ IBA «¿QUIÉN LOS REPRESENTA?» —una fila por lado con el abogado— y se
       fue entero el 2026-09-18: el abogado dejó de ser opcional el mismo día,
       y con eso el personaje de cada quien ES su ficha —la mía arriba, la del
       invitado al lado de su nombre—. Dos filas más para elegir por segunda vez
       lo que las dos fichas ya decían. Con ellas se fueron el panel
       `m-abogados`, la llave y `repreYo`/`repreOtro`. */

    /* EL JUEZ, y en local va DEBAJO DE LOS DOS: arriba de ellos se leería como
       el título de la sección; al lado, como un tercer duelista. Debajo se lee
       en el orden correcto: estos dos discuten, y este los juzga. */
    /* «JUEZ» Y LOS SEIS DISCOS A LA VISTA (titular, 2026-09-18): la tarjeta
       con el juez puesto y un «Cambiar» que abría otra pantalla se va; se toca
       el que se quiera y queda puesto. Igual en las dos vías. */
    /* SIN EL RÓTULO «Juez» ENCIMA (2026-09-18): con el retrato grande, el juez
       se presenta como los otros dos —nombre y una línea de qué hace—, y
       «Juzga esta partida» debajo del nombre dice lo mismo que el rótulo sin
       gastar un renglón ni romper la simetría de los tres. */
    var bloqueJuez = '<div class="prep__bloque">' + pintarJuez() + '</div>';

    $('#m-preparar .modal__cuerpo').innerHTML =
      /* ⚠️ EL INTERRUPTOR VA FUERA DEL ENVOLTORIO, y esto no es un detalle: el
         reparto del alto mete hueco entre TODOS los hijos de `.prep`, así que
         con él dentro salía un vacío entre la vía elegida y los dos retratos
         —110 px medidos— y el formulario se leía como si empezara a media
         pantalla. No es una sección del formulario: es el mando que lo cambia,
         y su sitio es arriba y pegado al título. */
      selectorDeDonde() +
      '<div class="prep">' +
      /* AQUÍ ARRIBA IBA EL ENUNCIADO, EN UNA TARJETA RETOCABLE, Y SE QUITÓ
         (decisión del titular, 2026-09-14). El argumento para tenerlo era que
         este es el último momento antes de grabar y es cuando se ve que una
         frase no dice lo que se discute de verdad. Pero el enunciado YA SE LEYÓ
         Y SE CONFIRMÓ en la pantalla anterior --`m-tema`, que lleva la misma
         tarjeta con su lápiz-- y va a estar presente TODA la ronda en la
         cabecera de la sala. Repetirlo aquí no añadía una oportunidad de
         corregirlo, añadía un renglón de leer lo mismo por tercera vez, y
         empujaba hacia abajo lo que esta pantalla sí decide: turnos, invitado,
         abogados y juez.
         El camino para corregirlo no se pierde: está una pantalla atrás, y
         desde aquí se llega con el botón de volver. */
      /* LA ETIQUETA Y LOS CÍRCULOS EN EL MISMO RENGLÓN. Al encogerlos a la
         mitad, el título ocupaba un renglón entero para presentar tres piezas
         que ya no lo llenaban, y la pantalla ganaba altura sin ganar nada. */

      /* LOS DOS, LADO A LADO Y EN SU SITIO: yo a la izquierda y quien juega
         enfrente a la derecha, que es como se van a ver en el choque de puños.
         El aviso de «tu personaje le pisó el suyo» va DEBAJO de los dos, no
         dentro de una columna: habla de la pareja, no de uno. */
      '<div class="duo prep__bloque">' + bloqueMio + (enLinea ? bloqueCorreo : bloqueInvitado) + '</div>' +
      '<p class="chico aviso-aro centrado" id="p-aviso-ficha"></p>' +

      /* JUEZ DEBAJO DE LOS DOS y TURNOS AL FINAL (titular, 2026-09-18): quién
         juzga es de la partida y los turnos son el último parámetro —cuánto
         rato quieren estar—, así que van en ese orden de importancia. */
      bloqueJuez +

      '<div class="turnos-linea prep__bloque">' +
        /* «Turnos por persona» y no «¿Cuántos turnos?» (decisión del titular):
           la pregunta no decía DE QUÉ eran los turnos, y tres turnos son tres
           de cada uno, o sea seis intervenciones. Quien leía la pregunta podía
           entender que eran tres en total y elegir pensando en la mitad de
           partida de la que iba a jugar. */
        /* «Turnos» a secas (titular, 2026-09-18): el «por persona» que se le
           puso el 2026-09-14 se fue; las cifras de minutos de debajo ya dicen
           cuánto dura la partida entera. */
        /* CON SU AIRE ARRIBA: desde que los turnos van los últimos, este título
           queda pegado a la fila del juez —que son seis discos sin caja— y los
           dos se tocaban. Antes iba el primero del formulario y no le hacía
           falta. */
        '<h3 class="centrado" style="margin:0">Turnos</h3>' +
        '<div class="turnos-fila">' +
        /* LA LISTA SALE DE LA CONFIGURACIÓN, no escrita a mano. Estaba fija en
           `[1,2,3,4,5]`, así que bajar `turnosMax` no habría cambiado nada:
           la pantalla habría seguido ofreciendo cinco y la base los habría
           rechazado al guardar. */
        opcionesDeTurnos().map(function (n) {
          var conCupo = cfg.reglas.turnosConCupo.indexOf(n) !== -1;
          return '<button class="turno-ficha' + (conCupo ? ' turno-ficha--cupo' : '') + '" ' +
            'data-turnos="' + n + '"' + (propuesta.turnos === n ? ' aria-pressed="true"' : '') + '>' +
            /* SIN LOS MINUTOS (titular, 2026-09-18). Eran una estimación —«3
               min», «5 min»— debajo de cada número, y decían lo que ya dice el
               número: más turnos, más rato. Lo que no decían es cuánto dura de
               verdad una partida, que depende de lo que hable cada quien. */
            '<span class="turno-ficha__n">' + n + '</span>' +
          '</button>';
        }).join('') +
        '</div>' +
      '</div>' +
      (cfg.reglas.turnosConCupo.length
        ? '<p class="chico tenue" style="margin:var(--e-2) 0 var(--e-5)">' +
            cfg.reglas.turnosConCupo.join(' y ') + ' turnos necesitan cupo.</p>'
        /* Sin relleno cuando no hay cupos: era un hueco fijo para que el
           bloque de turnos no quedara pegado a lo de abajo, y ahora el hueco lo
           pone el reparto. Dentro de `.prep` además contaba como una sección
           más y se llevaba su parte del alto. */
        : '') +

      /* AQUÍ NO SE ENSEÑA NINGUNA POSTURA. Ni para elegir ni como ejemplo: se
         probó a dejarlas de pista y siguen siendo punteros —leerlas antes de
         hablar ya te coloca en un lado—. El tema se plantea y cada quien opina
         libre. Si los dos acaban a favor de lo mismo con palabras distintas,
         vale igual, y el juez lo dice: es la discusión de horas en la que los
         dos defendían la misma idea sin enterarse. */

      /* SOLO EL INVITADO (decisión del titular, 2026-09-14). El campo del
         nombre propio se quitó: viene del perfil y ya se ve en la cabecera y en
         la línea de abogado, así que preguntarlo aquí era pedir dos veces algo
         que no cambia. Lo que sí cambia cada partida es con quién se juega, y
         eso es lo único que queda. Para cambiarse el nombre está Perfil. */

      /* La ficha del invitado se toca para elegirle dibujo y color. No es una
         cuenta: es alguien que agarró este teléfono. Pero su ficha se recuerda,
         así que la próxima vez que juegue sale como salió. */
      /* «Su nombre» se leía como «el nombre de uno» y había quien ponía el
         suyo dos veces. «Nombre de invitado» no admite esa lectura. */
      /* LOS ATAJOS VAN EN EL RENGLÓN DEL RÓTULO, a la derecha. Estaban debajo
         del campo y del texto de ayuda, o sea DESPUÉS de haber leído «escribí
         un nombre»: quien ya jugó con alguien lo escribía entero antes de ver
         que podía tocarlo. Arriba se ven antes de empezar a escribir, que es
         cuando sirven. */
      /* ⚠️ EL ORDEN NO ES EL MISMO EN LAS DOS VIAS (titular, 2026-09-17).
         En local: con quién juegas y quién juzga — el invitado primero porque
         está sentado al lado y es lo primero que se resuelve. En línea: **el
         juez y al final a quién se invita**, porque ahí el correo es lo último
         que se hace antes de mandar, y debajo de él va a ir la lista de
         contactos. Mi personaje va arriba en las dos. */
      /* EL MISMO ORDEN EN LAS DOS VIAS (titular, 2026-09-18): turnos, juez y al
         final a quién se juega. En local el invitado iba antes que el juez
         —porque está sentado al lado— y eso dejaba las dos vías con el
         formulario barajado: quien cambia el interruptor veía moverse las
         piezas. Con el juez fijo en medio, lo único que cambia entre una y otra
         es el último bloque, que es exactamente lo que el interruptor decide. */
      '<p class="chico" id="p-error" style="color:var(--peligro);margin-top:var(--e-3)"></p>' +
      /* LA PRUEBA DEL MICRÓFONO vive aquí, escondida hasta que se toca «Sortear»:
         el botón pide el permiso, la barra enseña el nivel mientras se dice
         algo, y en cuanto hay voz se sortea. Ver `conMicrofono()`. */
      /* El indicador del micrófono ya no vive aquí: está en el PIE, encima del
         botón, y en el HTML (titular, 2026-09-18). */

      /* Y aquí había un aviso diciendo que quién abre se sortea. También se
         fue: el botón dice «Sortear quién abre» y a continuación se ve la
         ruleta girando. Explicar por escrito lo que se va a ver en pantalla dos
         segundos después es contar el final antes de la película. */
      '</div>';

    var b = $('#m-preparar .modal__pie button');
    b.className = 'boton boton--bloque boton--grande boton--' + propuesta.modo;
    /* EL BOTON DICE LO QUE VA A PASAR, que es distinto en cada vía: en local se
       sortea quién abre y arranca la partida ahí mismo; en línea lo que sale de
       aquí es una invitación y la partida no empieza hasta que la acepten. */
    b.dataset.accion = enLinea ? 'proponer' : 'sortear';
    b.textContent = enLinea ? 'Enviar invitación' : 'Sortear quién abre';
    /* Se revisa AL ABRIR y no solo al escribir. Antes el botón nacía apagado y
       lo encendía elegir postura; sin ese paso, con los dos nombres ya puestos
       —que es el caso normal— el botón se quedaba apagado sin nada que hacer
       para encenderlo salvo tocar un campo. */
    revisarPreparar();
    /* EL MICRÓFONO VUELVE A CERO, no solo se esconde: el texto y el estado del
       icono son de la partida anterior, y esconder un bloque no lo limpia. */
    var mic = $('#p-micro');
    if (mic) {
      mic.hidden = true;
      var dc = $('#p-micro-dice'); if (dc) dc.textContent = '';
      var dd = $('#p-micro-disco');
      if (dd) { dd.dataset.suena = '0'; dd.style.setProperty('--nivel', '0'); }
    }
    if (!repintando) abrirModal('m-preparar');
    /* La ruleta arranca con la pantalla ya montada; al repintar —cambiar de vía,
       guardar una ficha— no se vuelve a sortear: el juez ya está echado. */
    if (!repintando) setTimeout(rodarJueces, 260);
  }

  /* LA FILA DE JUECES: seis discos, solo la cara, y el puesto lleva el aro del
     modo. Sin nombre debajo —el titular pidió solo el círculo con la miniatura—;
     el nombre va en `aria-label` y en `title`. Sin veto: el juez es UNO para
     toda la partida y no se enfrenta a nadie. */
  /* ======================================================================
     LOS JUECES SE TURNAN (titular, 2026-09-18: «se van rotando, es decir no se
     repite juez para quien crea la partida hasta que todos los otros hayan
     salido»)
     No es lo mismo que «al azar»: al azar puro, con seis jueces, uno se repite
     dos veces seguidas una de cada seis partidas y hay quien no sale en diez.
     Con la vuelta cerrada, en seis partidas salen los seis y el orden sigue
     siendo distinto cada vez. Es el mismo trato que reciben los temas del
     catálogo: barajados, pero sin repetir hasta agotar.
     ⚠️ SE GUARDA POR TELÉFONO Y NO POR PARTIDA: la lista de los que ya salieron
     vive en `localStorage`, porque la vuelta solo significa algo entre partidas
     distintas. Si el almacenamiento falla, cada sorteo es independiente y lo
     único que se pierde es la garantía de la vuelta.
     ====================================================================== */
  var JUECES_VISTOS = 'atwi.jueces.vistos.v1';

  function juecesVistos() {
    try { return JSON.parse(localStorage.getItem(JUECES_VISTOS) || '[]') || []; }
    catch (e) { return []; }
  }

  function sortearJuez() {
    var todos = window.ATWI.jueces().map(function (q) { return q.clave; });
    var vistos = juecesVistos().filter(function (c) { return todos.indexOf(c) !== -1; });
    var faltan = todos.filter(function (c) { return vistos.indexOf(c) === -1; });
    /* Vuelta cerrada: se empieza otra, y el último de la anterior no abre la
       siguiente —sería el único que se repetiría dos veces seguidas—. */
    if (!faltan.length) {
      var ultimo = vistos[vistos.length - 1];
      vistos = [];
      faltan = todos.filter(function (c) { return c !== ultimo; });
      if (!faltan.length) faltan = todos.slice();
    }
    var elegido = faltan[Math.floor(Math.random() * faltan.length)];
    vistos.push(elegido);
    try { localStorage.setItem(JUECES_VISTOS, JSON.stringify(vistos)); } catch (e) {}
    return elegido;
  }

  /* ======================================================================
     LA RULETA DEL JUEZ (titular, 2026-09-18)
     Tres segundos recorriendo la fila y frenando, como la ficha del sorteo de
     quién abre —mismo `clac` y misma idea—. **Donde para es el juez de la
     partida**: cada paso deja puesto (`aria-pressed`) al que toca y escribe
     `propuesta.juez`, así que lo que se ve marcado y lo que se juega son
     siempre lo mismo, pare donde pare y se corte cuando se corte.
     Lo que sí se decide antes de arrancar es a CUÁL va a llegar, y eso es a
     propósito: si el destino saliera de contar fotogramas, un teléfono lento
     daría una ruleta más corta y otro juez. Se elige primero y la animación
     lleva hasta él.
     ⚠️ LOS TIEMPOS SE CALCULAN, NO SE ACUMULAN. Cada paso se programa contra el
     reloj desde que empezó —`t0 + tiempoDe(k)`— y no sumando esperas: sumando,
     cada retraso del navegador se añade al siguiente y tres segundos acaban
     siendo cinco. Es lo mismo que hace el sorteo de la sala.
     Y SE PUEDE CORTAR: tocar un juez mientras rueda lo elige y para. Quien ya
     sabe a cuál quiere no tiene por qué esperar a que la rueda termine.
     ====================================================================== */
  var RULETA_JUEZ = 3000, VUELTAS_JUEZ = 3;
  var rodando = 0;

  function rodarJueces() {
    pararRuleta();
    if (!$('#m-preparar .juez-mesa')) return;
    var claves = window.ATWI.jueces().map(function (q) { return q.clave; });
    var n = claves.length;
    if (n < 2) return;

    var destino = claves.indexOf(propuesta.juez);
    if (destino < 0) destino = 0;

    /* Con el movimiento reducido no hay ruleta: el juez ya está elegido y lo
       único que se pierde es verlo girar. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      marcarJuez(claves[destino]);
      return;
    }

    /* Se arranca en el siguiente al que salió, para que el primer salto se vea
       moverse; empezando en el propio destino, la primera vuelta entera
       parecería que no pasa nada. */
    var desde = (destino + 1) % n;
    var total = VUELTAS_JUEZ * n + ((destino - desde + n) % n);
    var son = window.ATWI.sonido;
    var haySon = son && son.hay();
    var t0 = (window.performance && performance.now()) || 0;
    /* ⚠️ ARRANCA A TOPE Y FRENA, Y ESTUVO AL REVÉS (lo vio el titular,
       2026-09-18: «la animación va al revés, de máxima velocidad inicial hasta
       detenerse»). La curva se escribió como `1 - (1-p)³`, que es la de siempre
       para MOVER algo —empieza deprisa y llega suave—, y aquí lo que se reparte
       no es distancia sino CUÁNDO ocurre cada paso: con esa curva el 27 % del
       tiempo se iba en el 10 % de los pasos, o sea los primeros muy separados
       —lento— y los últimos amontonados —acelerando—. Justo lo contrario de una
       ruleta.
       Con `p³` el tiempo casi no avanza al principio, así que los pasos caen
       pegados, y se dispara al final, que es cuando se ven de uno en uno.
       Medido con 20 pasos en 3 s: los diez primeros en 375 ms y el último él
       solo en 430. */
    var tiempoDe = function (k) {
      var p = k / total;
      return RULETA_JUEZ * p * p * p;
    };

    var k = 0;
    marcarJuez(claves[desde]);
    (function siguiente() {
      k++;
      if (k > total) { rodando = 0; marcarJuez(claves[destino]); return; }
      var ahora = (window.performance && performance.now()) || 0;
      var espera = Math.max(0, t0 + tiempoDe(k) - ahora);
      rodando = setTimeout(function () {
        if (!rodando) return;
        marcarJuez(claves[(desde + k) % n]);
        if (haySon) son.clac(Math.max(0.2, 1 - k / total));
        siguiente();
      }, espera);
    })();
  }

  /* La vuelta es cosa del catálogo: el historial tiene final y darle la vuelta
     lo borraría. */
  function pintaVuelta(r) { return r.classList.contains('ruleta--vuelta'); }

  function pararRuleta() {
    if (rodando) { clearTimeout(rodando); rodando = 0; }
  }

  /** Deja puesto un juez en la fila, sin repintar la pantalla. */
  function marcarJuez(clave) {
    propuesta.juez = clave;
    $$('#m-preparar [data-juez-es]').forEach(function (x) {
      x.setAttribute('aria-pressed', String(x.dataset.juezEs === clave));
    });
  }

  /* EL JUEZ SALE COMO LOS JUGADORES (titular, 2026-09-18: «el juez aparece del
     mismo tamaño de los jugadores, ya no aparecen los 6 para escoger… el juez
     pasa a ser aleatorio, ya no lo decide el user»). Eran seis discos de 31 px
     donde había que elegir; ahora es UN retrato del tamaño de los de arriba, y
     con eso la pantalla enseña **los tres de la mesa** con el mismo peso: quien
     propone, quien juega enfrente y quien los juzga. Lo que se quita no es solo
     una fila: es una decisión que no aporta —da igual quién juzgue, la rúbrica
     es la misma— y que hacía elegir para poder seguir. */
  /** La ficha de un juez por su clave. `ATWI` expone la lista, no el buscador. */
  function datosDelJuez(clave) {
    var todos = window.ATWI.jueces();
    for (var i = 0; i < todos.length; i++) if (todos[i].clave === clave) return todos[i];
    return todos[0] || {};
  }

  function pintarJuez() {
    var j = datosDelJuez(propuesta.juez);
    return '<div class="juez-mesa" aria-live="polite">' +
        '<span class="juez-mesa__retrato">' +
          window.ATWI.fichaJuezHTML(propuesta.juez, 'avatar--duelo') +
        '</span>' +
        '<span class="juez-mesa__quien">' + esc(j.nombre || '') + '</span>' +
        '<span class="juez-mesa__que">Juzga esta partida</span>' +
      '</div>';
  }

  /** Cambia el juez que se ve, sin repintar la pantalla. */
  function marcarJuez(clave) {
    propuesta.juez = clave;
    var caja = $('#m-preparar .juez-mesa');
    if (!caja) return;
    var j = datosDelJuez(clave);
    caja.querySelector('.juez-mesa__retrato').innerHTML =
      window.ATWI.fichaJuezHTML(clave, 'avatar--duelo');
    caja.querySelector('.juez-mesa__quien').textContent = j.nombre || '';
  }

  /* MI PERSONAJE SE REPINTA SOLO al guardar la ficha del perfil con «Antes de
     empezar» abierto, sin tocar el resto de la pantalla —repintarla entera se
     llevaría el nombre del invitado a medio escribir—. Y arrastra al invitado:
     si el personaje que acabo de elegir era el suyo, el suyo se mueve al
     siguiente (la regla de `fichaDelInvitado`, aplicada al revés) y el renglón
     de aviso lo dice, porque una ficha que cambia sola sin explicación es lo
     que hace desconfiar de la pantalla. */
  function refrescarMiPersonaje() {
    if (!refrescarMiPerfilDuo()) return;
    apartarAlInvitado();
  }

  /** El invitado nunca lleva mi personaje: si lo lleva, se mueve y se avisa. */
  function apartarAlInvitado() {
    var aviso = $('#p-aviso-ficha');
    if (!aviso) return;
    var mio = datos.perfil().avatar;
    if (propuesta.otroAvatar !== mio) { aviso.textContent = ''; return; }
    var antes = window.ATWI.nombrePersonaje(mio);
    propuesta.otroAvatar = window.ATWI.otroPersonaje(mio);
    refrescarInvitado();
    aviso.textContent = antes + ' ahora es tu personaje, así que a ' +
      (propuesta.otro || 'tu invitado') + ' le pusimos ' +
      window.ATWI.nombrePersonaje(propuesta.otroAvatar) + '.';
  }

  function revisarPreparar() {
    /* El botón se apaga con la MISMA regla con la que se rechaza al pulsarlo.
       Tenía la suya —dos letras y nada más— y eso dejaba encender el botón con
       un nombre que luego no pasaba, que es la peor de las dos opciones. */
    var b = $('#m-preparar .modal__pie button');
    /* CADA VIA SE VALIDA CONTRA LO QUE PIDE. En línea lo que hay es un correo, y
       un nombre de una palabra no sirve para mandarle nada a nadie; la regla es
       la de la puerta de entrada, no una segunda escrita aquí. */
    if (dondeSeJuega() === 'linea') {
      /* El correo vive en la propuesta desde que su globo lo guarda; aquí ya no
         hay campo que leer. */
      b.disabled = !window.ATWI.entrada.valeCorreo(propuesta.correo || '');
      return;
    }
    /* Solo por el invitado: el propio viene del perfil, que ya pasó por esta
       misma regla en la puerta, y aquí no hay campo donde corregirlo. */
    /* Su nombre ya no está en un campo de esta pantalla: vive en la propuesta,
       que es lo que su globo guarda. */
    b.disabled = Boolean(datos.errorDeNombre(propuesta.otro));
  }

  /* EL MICRÓFONO SE PRUEBA ANTES DE SORTEAR (titular, 2026-09-18). Hasta hoy
     el permiso se pedía al primer toque de grabar, ya en la sala, y si fallaba
     salía «no se pudo abrir el micrófono» con la partida ya abierta en el
     servidor. Ahora el toque en «Sortear quién abre» hace tres cosas seguidas:
     pide el permiso, escucha unos segundos --«Di algo…», con la barra de
     nivel-- y, en cuanto capta voz, sortea. Si no hay permiso, no hay micro o
     no capta nada, lo dice ahí mismo y no lanza la ronda.
     UNA VEZ POR SESIÓN: el teléfono es uno y el permiso, una vez dado, se
     queda; volver a pedir «di algo» en cada partida sería un peaje. Se recuerda
     en `sessionStorage`, que muere con la pestaña: en la siguiente visita se
     vuelve a comprobar, que es cuando pueden haber cambiado el permiso. */
  var probandoMicro = false;
  function conMicrofono(sigue, queHace) {
    var g = window.ATWI.grabadora;
    if (!g || !g.probar) return sigue();
    if (probandoMicro) return;

    var caja = $('#p-micro'), dice = $('#p-micro-dice'), disco = $('#p-micro-disco');
    var b = $('#m-preparar .modal__pie button');
    var texto = b ? b.textContent : '';
    var err = $('#p-error');
    if (err) err.textContent = '';
    probandoMicro = true;
    if (caja) caja.hidden = false;
    if (disco) { disco.dataset.suena = '0'; disco.style.setProperty('--nivel', '0'); }
    if (dice) dice.textContent = 'Di «ok» para ' + (queHace || 'empezar');
    if (b) { b.disabled = true; b.textContent = 'Escuchando…'; }

    /* EN TIEMPO REAL: el disco toma el nivel en una variable CSS --de ahí salen
       el halo y cuánto crece-- y `data-suena` enciende el color y la vibración. */
    g.probar(function (n, suena) {
      if (!disco) return;
      disco.style.setProperty('--nivel', n.toFixed(2));
      disco.dataset.suena = suena ? '1' : '0';
    }, 6000)
      .then(function (r) {
        probandoMicro = false;
        if (b) { b.disabled = false; b.textContent = texto; }
        if (r.ok) {
          if (dice) dice.textContent = 'Te oí.';
          /* ⚠️ `ok` Y NO `1`: con `1` el icono se quedaba VIBRANDO para siempre
             --la animación es infinita-- y la partida siguiente abría con el
             micrófono temblando y un «Te oí» de la vez anterior (lo vio el
             titular). `ok` deja el color, que dice que se oyó, y para el
             temblor, que dice que está escuchando AHORA. */
          if (disco) { disco.dataset.suena = 'ok'; disco.style.setProperty('--nivel', '.5'); }
          /* UN SEGUNDO Y MEDIO ANTES DE LANZAR (titular, 2026-09-18). Sin la
             pausa, el «Te oí» y el sorteo caen en el mismo fotograma: nadie
             llega a ver que el micrófono respondió y la pantalla cambia como si
             el toque hubiera lanzado la partida sin más. Con la espera, lo que
             se ve es la respuesta —el icono encendido y la frase— y después el
             cambio de pantalla. */
          return setTimeout(sigue, 1500);
        }
        /* LO QUE FALLA SE DICE EN UN TOAST, NO EN LA PANTALLA (titular,
           2026-09-18: «los errores de micro muéstralos en toast, no escribas en
           la misma interfaz»). Un párrafo de tres renglones metido en el pie
           empujaba el botón y se quedaba puesto hasta el siguiente intento;
           el aviso flotante se va solo, no mueve nada y no compite con lo que
           esta pantalla decide. El micrófono se esconde con él: lo que tiene
           que quedar en pantalla es el botón, listo para volver a tocarlo. */
        if (caja) caja.hidden = true;
        window.ATWI.aviso(
          /* BLOQUEADO NO ES RECHAZADO, y no se arreglan igual. `denied` es el
             navegador negándose a PREGUNTAR —ahí no hay diálogo que aceptar y
             hay que ir al candado—; un rechazo en el diálogo se arregla
             tocando otra vez. */
          r.motivo === 'permiso' && r.permiso === 'denied'
            ? 'Este navegador tiene bloqueado el micrófono para ATWI. Actívalo en el candado de la barra de direcciones y vuelve a tocar el botón.'
          : r.motivo === 'permiso'
            ? 'Sin micrófono no se puede grabar la ronda. Toca otra vez y acepta el permiso.'
          : r.motivo === 'sin-micro'
            ? 'No se encontró ningún micrófono en este aparato.'
          : r.motivo === 'silencio'
            ? 'No te oí. Acércate, sube el volumen del micrófono o quita lo que lo tape, y vuelve a tocar el botón.'
          : (r.texto || 'Este navegador no puede grabar.'));
      });
  }

  /* EL AIRE ENTRE BLOQUES SE MIDE, NO SE ESCRIBE (titular, 2026-09-18: «estos
     espacios deben ser dinámicos: según el viewport se ajustan para que no se
     genere scroll y se pueden reducir si se necesita»). Se pone el aire a cero,
     se mide lo que ocupa el formulario desnudo, y lo que sobra del hueco visible
     se reparte entre las separaciones, con tope arriba y abajo. Una sola pasada
     y sin `vh`: `vh` es la ventana del navegador, y en escritorio el juego vive
     dentro de un teléfono dibujado que no mide lo mismo.
     Si no cabe ni con el mínimo, el cuerpo scrollea, que es lo correcto: antes
     que recortar el aire a cero y que los bloques se toquen. */
  /* ⚠️ AQUÍ VIVÍA `ajustarAire()`, que medía lo que sobraba en «Antes de
     empezar» y lo repartía como margen entre los bloques. Se va entero: lo hace
     el CSS con `justify-content: space-between`, que reparte **exactamente** lo
     que sobre sin tope ni medida —el tope de 38 px dejaba 39 muertos al pie con
     el formulario de hoy— y sin que haya que volver a llamarlo cada vez que
     algo cambia de alto. Dos mecanismos para el mismo hueco se pelean: el
     margen del JS se habría sumado al reparto del CSS. */


  /* De momento se juega en un solo dispositivo, por turnos, que es el modo que
     el documento permite para los temas del catálogo. Con dos teléfonos hace
     falta el servidor y llega después. */
  function sortearYJugar() {
    var t = datos.tema(propuesta.temaId);
    var otro = datos.limpiarNombre(propuesta.otro);
    var yo = datos.limpiarNombre(datos.perfil().nombre);

    /* El propio ya no se escribe aquí, pero se comprueba igual: un perfil de
       antes de la regla del nombre puede traer algo que no pasaría hoy, y
       enterarse en la sala sería tarde. Se manda a Perfil, que es donde se
       arregla. */
    if (datos.errorDeNombre(yo)) {
      $('#p-error').textContent = 'Tu nombre no vale para la sala. Cámbialo en Perfil.';
      return;
    }
    var malOtro = datos.errorDeNombre(otro);
    if (malOtro) {
      $('#p-error').textContent = malOtro.replace('Escribe tu nombre.', 'Escribe con quién juegas.');
      return;
    }
    if (otro.toLowerCase() === yo.toLowerCase()) {
      $('#p-error').textContent = 'Se llaman igual: ponle otro nombre para no confundirse en la sala.';
      return;
    }
    /* El campo viene de la ficha, así que si se cambia aquí se cambia la ficha:
       tener dos nombres distintos para la misma persona sería peor que no
       dejarla cambiarlo. */
    if (yo !== datos.perfil().nombre) {
      datos.actualizar({ nombre: yo });
      if (window.ATWI.auth && window.ATWI.auth.dentro()) {
        window.ATWI.auth.guardarPerfil({ nombre: yo }).catch(function () {});
      }
    }
    /* La ficha del invitado se recuerda AQUÍ, que es cuando por fin se sabe su
       nombre. No crea cuenta ni historial: es memoria de este teléfono para no
       volver a preguntárselo. */
    datos.recordarInvitado({ nombre: otro, avatar: propuesta.otroAvatar,
                             color: propuesta.otroColor });
    propuesta.otro = otro;

    /* Cada jugador viaja con su ficha entera —nombre, dibujo y color—, porque
       en la sala cada intervención se marca con la ficha de quien habló, no con
       una inicial. El primero defiende la postura A y el segundo la B: eso lo
       fija quien elige postura, no el sorteo. El sorteo decide solo QUIÉN ABRE. */
    var p = datos.perfil();
    /* EL PERSONAJE DEL DUELO ES LA FICHA DE CADA UNO (2026-09-18): el mío es el
       del perfil —que arriba de esta pantalla se puede cambiar y queda
       guardado— y el del invitado es el de su ficha. Siempre con personaje:
       `abogado` es true en los dos lados, y la función lo fuerza igual. */
    var fichaMia = { nombre: yo, avatar: p.avatar, color: p.avatarBorde, abogado: true };
    var fichaSuya = { nombre: otro, avatar: propuesta.otroAvatar,
                      color: propuesta.otroColor, abogado: true };
    /* DOS FIGURAS IGUALES NO SE PUEDEN LANZAR. El veto se aplica al abrir la
       ficha del invitado y al guardar la mía, y esto es la red: pasó de verdad
       --dos Nico enfrentados en el versus-- y hasta la sala no se notaba. */
    if (fichaMia.avatar === fichaSuya.avatar) {
      var comoSe = window.ATWI.nombrePersonaje(fichaMia.avatar);
      $('#p-error').textContent = 'Los dos van con ' + comoSe + ': en la sala serían ' +
        'la misma figura y no habría cómo distinguirlos. Cambiá uno de los dos.';
      return;
    }

    var abre = Math.random() < 0.5 ? 0 : 1;

    cerrarModales(['m-preparar', 'm-tema']);
    /* Una partida nueva devuelve a donde se armó: a la portada si salió de las
       cartas de modo, al catálogo si salió de un tema. */
    volverTrasLaPartida = vistaActual;
    window.ATWI.partida.empezar({
      tema: t,
      modo: propuesta.modo,
      turnos: propuesta.turnos || cfg.reglas.turnosPorDefecto,
      publico: modoPublico || 'pareja',
      posturas: [fichaMia, fichaSuya],
      abre: abre,                // índice sobre esa lista: quién habla primero
      juez: propuesta.juez || juezPorDefecto()
    });
  }

  /* AHORA SE LLEGA DESDE «ANTES DE EMPEZAR» y no desde el detalle del tema
     (titular, 2026-09-17), así que lo que se propone ya trae turnos, juez y a
     quién: se dicen aquí, porque una invitación que no dice a qué partida
     invita obliga a fiarse. */
  function proponer() {
    var t = datos.tema(propuesta.temaId);
    /* EL NOMBRE DEL MODO SALE DE LA CONFIGURACION. Aquí estaba escrito a mano y
       decía «Debate» y «Negociación», que son los nombres VIEJOS: los modos se
       llaman Controversia, Pacto y QuiénGane desde hace días y esta pantalla
       seguía usando los de antes. Es el mismo fallo que la landing tenía por
       siete sitios — nada avisa de que un texto dejó de ser verdad. */
    var m = cfg.modos[propuesta.modo] || {};
    var campo = $('#p-correo');
    var quien = ((campo && campo.value) || propuesta.correo || '').trim();
    var turnos = propuesta.turnos || cfg.reglas.turnosPorDefecto;
    /* SE COMPRUEBA AL PULSAR Y NO SOLO AL ESCRIBIR, con la misma regla que apaga
       el botón: un campo rellenado por el navegador o un repintado a destiempo
       pueden dejar el botón encendido con algo que no es una dirección. */
    if (!window.ATWI.entrada.valeCorreo(quien)) {
      var err = $('#p-error');
      if (err) err.textContent = 'Ese correo no parece válido.';
      return;
    }
    var yoMismo = window.ATWI.auth && window.ATWI.auth.sesion();
    yoMismo = yoMismo && yoMismo.user && yoMismo.user.email;
    if (yoMismo && quien.toLowerCase() === String(yoMismo).toLowerCase()) {
      var err2 = $('#p-error');
      if (err2) err2.textContent = 'Ese es tu propio correo.';
      return;
    }
    if (!window.ATWI.nube || !window.ATWI.nube.hay()) {
      var err3 = $('#p-error');
      if (err3) err3.textContent = 'Para invitar hace falta entrar con tu cuenta.';
      return;
    }

    /* LA PROPUESTA SE ESCRIBE EN EL SERVIDOR (0055): con mi ficha y el correo,
       sin invitado ni sorteo —eso lo pone la base cuando acepten—. Gasta una
       vida, salvo en QuiénGane, y la recupera si no aceptan. */
    var p = datos.perfil();
    var b = $('#m-preparar [data-accion="proponer"]');
    if (b) { b.disabled = true; b.textContent = 'Enviando…'; }
    window.ATWI.nube.abrirPartida({
      donde: 'linea', correo: quien,
      tema: t, modo: propuesta.modo, turnos: turnos, juez: propuesta.juez || juezPorDefecto(),
      yo: { nombre: datos.limpiarNombre(p.nombre), avatar: p.avatar, color: p.avatarBorde }
    }).then(function (id) {
      if (b) { b.disabled = false; b.textContent = 'Enviar invitación'; }
      if (!id) {
        var motivo = window.ATWI.nube.ultimoFallo() || '';
        var err4 = $('#p-error');
        if (err4) {
          err4.textContent = /sin_vidas/.test(motivo)
            ? 'No te quedan vidas para abrir una partida. Pídele a alguien que te mande, o juega QuiénGane, que es gratis.'
            : 'No se pudo enviar la invitación. ' + motivo.slice(0, 120);
        }
        return;
      }
      historialCaducado = true;
      sondear();
      /* Centrado en vertical y con la campana en el eje (titular, 2026-09-18):
         `.enviada` es una columna flex que reparte el alto del cuerpo. */
      $('#m-invitar .modal__cuerpo').innerHTML =
        '<div class="enviada">' +
          '<div class="enviada__signo">' + icono('buzon', 76) + '</div>' +
          '<h2 style="margin-bottom:var(--e-2)">Invitación enviada</h2>' +
          '<p class="suave chico" style="max-width:26rem;margin:0 auto">' +
            /* El correo y el título, separados. Pegados —«a mona@correo.com Mi
               rincón en zona común»— se leían como una sola cosa larga. */
            'Le propusiste a <strong>' + esc(quien) + '</strong> jugar ' +
            '<strong>«' + esc(t.titulo) + '»</strong> en modo <strong>' +
            esc(m.nombre || propuesta.modo) + '</strong>, ' + turnos +
            ' turno' + (turnos === 1 ? '' : 's') + ' cada uno.' +
          '</p>' +
        '<div class="tarjeta" style="background:var(--crema-hondo);box-shadow:none">' +
          '<p class="chico suave">' +
            'La verá en su buzón al entrar a ATWI con ese correo. Tiene 24 horas para ' +
            'aceptar; si no, la partida se anula y tu vida vuelve. Te avisamos aquí ' +
            'cuando conteste, y la partida espera en tu Historial.' +
          '</p>' +
        '</div></div>';
      cerrarModales(['m-preparar', 'm-tema']);
      abrirModal('m-invitar');
    });
  }

  /* ======================================================================
     EL GLOBO: una explicación que sale del signo que la pide
     ======================================================================

     PRUEBA PEDIDA POR EL TITULAR (2026-09-17), y empieza por UNA sola: el
     aviso de IA de la portada. Si convence, las demás ayudas —las bombillas de
     las cartas de modo, que hoy abren un modal a pantalla completa— se mudan
     aquí.

     POR QUÉ NO ES UN MODAL. Un modal a pantalla completa es la ceremonia
     correcta para entrar a algo —elegir modo, ver un veredicto— y es demasiada
     para contestar «¿qué es esto?»: tapa la pantalla entera, hay que cerrarlo
     para volver, y mientras está abierto se pierde de vista aquello sobre lo
     que se preguntaba. El globo sale DEL signo que se tocó, deja ver lo de
     detrás y se cierra con un toque en cualquier sitio.

     SE COLOCA SOLO, y esa es la parte que no se puede improvisar: mide dónde
     está el disparador dentro del MARCO —no del viewport del navegador, porque
     en escritorio el juego vive dentro de un teléfono dibujado— y elige arriba
     o abajo según dónde quepa, acotándose a los bordes. Si se saliera, el juego
     scrollearía de lado, y eso no pasa nunca.

     EL PICO ES LO QUE LO HACE UN GLOBO. Va pegado al centro del disparador
     —aunque la caja se haya corrido para no salirse— y de ahí NACE la
     animación: el `transform-origin` es el pico, no el centro de la caja, que
     es la diferencia entre «algo apareció» y «esto lo abrió ese botón». Misma
     idea que el estallido del choque de puños, que nace del punto de contacto.
     ---------------------------------------------------------------------- */

  var globoAbierto = null;
  /* Si el globo abierto tiene su entrada en el historial del navegador. Lo que
     la gasta es el atrás; lo que la pone, abrirlo. */
  var globoEnHistoria = false;

  /* ⚠️ CERRAR UN GLOBO ES RETROCEDER, no quitarlo a mano: es el mismo trato que
     reciben los modales (`cerrarModal`). Si se quitara aquí, la entrada que
     apiló al abrirse se quedaría puesta y el siguiente atrás se lo tragaría sin
     hacer nada visible. Quien quita el nodo es `quitarGlobo`, y a él llega el
     `popstate`. */
  function cerrarGlobo() {
    if (!globoAbierto) return;
    if (globoEnHistoria) { globoEnHistoria = false; history.back(); return; }
    quitarGlobo();
  }

  function quitarGlobo() {
    if (!globoAbierto) return;
    var g = globoAbierto;
    globoAbierto = null;
    if (g.disparador) {
      g.disparador.setAttribute('aria-expanded', 'false');
      /* El foco vuelve a quien lo abrió: si no, se queda en el aire y el
         siguiente tabulador empieza desde el principio de la pantalla. */
      if (document.activeElement === g.nodo || g.nodo.contains(document.activeElement)) {
        g.disparador.focus();
      }
    }
    if (g.disparador) delete g.disparador.dataset.globoAbierto;
    g.nodo.dataset.cerrando = '1';
    if (g.velo) g.velo.dataset.cerrando = '1';
    var fuera = function () {
      if (g.nodo.parentNode) g.nodo.parentNode.removeChild(g.nodo);
      if (g.velo && g.velo.parentNode) g.velo.parentNode.removeChild(g.velo);
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) fuera();
    else setTimeout(fuera, 160);
    window.removeEventListener('resize', g.recolocar);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', g.recolocar);
      window.visualViewport.removeEventListener('scroll', g.recolocar);
    }
  }

  /* CADA GLOBO LLEVA SU COLOR Y SU PEANA, como las cartas de modo: el de un
     modo sale con el tinte de ese modo, y el del aviso de IA con el lavanda de
     la marca. Las peanas son las MISMAS piezas de las cartas —medidas: amigos
     es lavanda, debate coral, negociacion menta, competencia azul— así que el
     globo y la carta de la que sale son la misma familia sin dibujar nada
     nuevo. */
  var TINTES = {
    debate:      { signo: 'ayuda-coral',  peana: 'base-debate' },
    negociacion: { signo: 'ayuda-menta',  peana: 'base-negociacion' },
    competencia: { signo: 'ayuda-azul',   peana: 'base-competencia' },
    lavanda:     { signo: 'ayuda-morado', peana: 'base-amigos' },
  };

  /** Abre un globo colgado de `disparador`.
      `dicho` es {titulo, texto, ojo, clave} y `opciones` {tinte, etiqueta,
      jugar, signo, signoTam, acciones, cuerpo}.
      `signo` cambia la pegatina que asoma —la bombilla es de las ayudas, y un
      globo que pregunta si se borra algo lleva la papelera—, `signoTam` la baja
      cuando ese dibujo llena más su cuadro que la bombilla, y `acciones` es el
      HTML de los botones que van al pie. */
  function abrirGlobo(disparador, dicho, opciones) {
    var marco = document.querySelector('.marco');
    if (!marco || !disparador) return;
    /* Tocar el mismo signo lo cierra: es un interruptor, no un botón de abrir. */
    var eraEste = globoAbierto && globoAbierto.disparador === disparador;
    if (globoAbierto) {
      /* Cerrando el de antes SIN tocar el historial: si se abre otro, su
         entrada se reutiliza —dos globos seguidos no son dos pasos atrás— y si
         era el mismo, se consume. */
      quitarGlobo();
      if (eraEste) { globoEnHistoria = false; history.back(); return; }
    } else {
      apilarPaso();
      globoEnHistoria = true;
    }

    var o = opciones || {};
    var tinte = TINTES[o.tinte] ? o.tinte : 'lavanda';
    var t = TINTES[tinte];

    /* EL CRISTAL (titular, 2026-09-17). Un velo esmerilado entre el globo y lo
       que hay detrás: la portada tiene un fondo dibujado y tres cartas con
       color, y el globo competía con todo eso. NO ES UN VELO OSCURO —el juego
       es claro entero y una capa negra lo convertiría en otra app—: es un
       cristal, blanco muy tenue y desenfoque, que aleja el fondo sin apagarlo.
       Va antes que el globo en el DOM, así que queda debajo de él. */
    var velo = document.createElement('div');
    velo.className = 'globo-velo';
    marco.appendChild(velo);

    var nodo = document.createElement('div');
    nodo.className = 'globo';
    nodo.dataset.tinte = tinte;
    /* ⚠️ CADA PEGATINA LLENA SU CUADRO DISTINTO, y con el mismo tamaño se ven de
       tamaños distintos: es la lección de siempre —lo que iguala a dos iconos es
       el CUERPO y no la caja— por un sitio nuevo. Medido el dibujo macizo de los
       dos PNG, la bombilla ocupa el 73 % de su cuadro y la papelera el 84 %, así
       que a 96 px la papelera pinta 81 de dibujo contra 70 —un 15 % más grande—
       y el globo de borrado salía encabezado por un iconazo. */
    if (o.signoTam) nodo.style.setProperty('--globo-signo', o.signoTam + 'px');
    nodo.setAttribute('role', 'dialog');
    nodo.setAttribute('aria-label', o.etiqueta || dicho.titulo || 'Información');
    nodo.tabIndex = -1;
    /* LA BOMBILLA VA DENTRO Y ASOMANDO, no fuera (mockup del titular). Y eso
       resolvió de paso un problema que no tenía arreglo limpio: con el signo
       fuera había que dejarlo nítido por encima del cristal, y no se podía
       —`main.vistas` tiene `z-index: 1`, o sea que CREA UN CONTEXTO DE
       APILAMIENTO y encierra dentro a todo lo suyo: un `z-index: 61` en el
       botón solo compite ahí dentro, nunca contra el velo—. Con el signo
       dentro del globo, el globo entero es nítido y el problema no existe.
       SIN ASPA DE CERRAR (titular, 2026-09-17): se cierra tocando fuera, con
       Escape o tocando otra vez el signo. Un aspa en una pieza que se va sola
       al primer toque en cualquier sitio es un botón para lo que ya pasa. */
    nodo.innerHTML =
      '<div class="globo__caja">' +
        /* LA ONDA SE RECORTA AQUÍ DENTRO Y NO EN LA CAJA (titular, 2026-09-17).
           Con `overflow: hidden` en la caja, lo que se recortaba TAMBIÉN era la
           bombilla, que asoma por fuera a propósito: le comía el borde
           izquierdo. Un envoltorio propio recorta la onda con el mismo radio y
           deja la caja visible. */
        '<span class="globo__recorte" aria-hidden="true">' +
          '<img class="globo__base" src="../assets/img/iconos/' + t.peana + '.png" alt="">' +
        '</span>' +
        /* ⚠️ EL TAMAÑO DE ESTE SIGNO LO PONE EL CSS —96 px— Y NO ESTE NÚMERO:
           la regla `.globo__signo` pisa el `width` que escribe `icono()`. El 82
           que había aquí no pintaba nada desde que la bombilla subió a 96. Lo
           que manda es `--globo-signo`, y lo declara `o.signoTam`. */
        window.ATWI.icono(o.signo || t.signo, 96)
          .replace('class="ico"', 'class="ico globo__signo"') +
        '<div class="globo__dicho">' +
          (dicho.titulo ? '<p class="globo__titulo">' + esc(dicho.titulo) + '</p>' : '') +
          /* UN CUERPO PROPIO, para los globos que no explican sino que dejan
             TOCAR algo —el primero es el editor de la ficha—. Va antes del
             texto y lo sustituye: quien manda HTML ya escribió lo que quería
             decir. */
          (o.cuerpo ? o.cuerpo : '') +
          (dicho.texto ? '<p class="globo__texto">' + esc(dicho.texto) +
            /* LA FRASE QUE PROTEGE, dentro del mismo párrafo y no aparte: es el
               final de la misma oración, y sacarla a un bloque propio la
               convertiría en una nota al margen —que es justo lo que se lee
               cuando ya se dejó de leer—. Lo que la separa es el peso y el
               color, no el sitio. */
            /* Sin espacio: `descargoBase` ya acaba en uno, que es lo que hace
               que el texto compuesto se lea bien donde va de una pieza. */
            (dicho.ojo ? '<b class="globo__ojo">' + esc(dicho.ojo) + '</b>' : '') +
          '</p>' : '') +
          /* La frase que importa, aparte y entrecomillada: es lo mismo que hacía
             el modal —leída de corrido se perdía entre lo demás, y es lo único
             que hay que llevarse—. */
          (dicho.clave ? '<p class="globo__clave">«' + esc(dicho.clave) + '»</p>' : '') +
          /* EL GLOBO DE UN MODO LLEVA SU BOTÓN (titular, 2026-09-17): quien lee
             de qué va el modo ya está decidiendo, y hacerle cerrar el globo y
             buscar la carta otra vez es un paso de más. Usa `data-crear`, el
             mismo camino que la carta. */
          (o.jugar ? '<button class="boton boton--bloque globo__jugar boton--' + o.jugar +
                     '" data-crear="' + o.jugar + '">Jugar ahora</button>' : '') +
          /* LOS BOTONES DE UN GLOBO QUE PREGUNTA. El de modo trae uno solo y
             hecho aquí; este los recibe armados, porque quien pregunta es quien
             sabe qué se responde. */
          (o.acciones ? '<div class="globo__acciones">' + o.acciones + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<span class="globo__pico" aria-hidden="true"></span>';
    marco.appendChild(nodo);

    /* Las dos piezas que pueden encoger: la que el cuerpo marque, y como
       último recurso el bloque entero. */
    var cede = nodo.querySelector('.globo__cede');
    var dicho = nodo.querySelector('.globo__dicho');

    /* ⚠️ EL GLOBO NO ACABA EN SU CAJA: EL SIGNO ASOMA POR FUERA (lo vio el
       titular, 2026-09-18: el lápiz mordido por el canto del teléfono). Es lo
       que lo hace una pegatina pegada al globo y no un icono metido dentro, y
       por eso vive en `top: -20; left: -22`. El cálculo medía la CAJA, así que
       colocaba el globo con sus 12 px de aire y el signo se salía por encima de
       ellos. Se mide lo que sobresale en vez de escribir los números aquí: el
       CSS los puede cambiar —ya pasó con `--globo-signo`— y dos sitios con el
       mismo número se desincronizan. */
    var sg = nodo.querySelector('.globo__signo');
    var asomaArriba = 0, asomaIzq = 0;
    if (sg) {
      var rs = sg.getBoundingClientRect(), rn = nodo.getBoundingClientRect();
      asomaArriba = Math.max(0, Math.round(rn.top - rs.top));
      asomaIzq = Math.max(0, Math.round(rn.left - rs.left));
    }

    var recolocar = function () {
      var m = marco.getBoundingClientRect();
      var d = disparador.getBoundingClientRect();

      /* ⚠️ «EL MARCO» SON DOS CAJAS DISTINTAS, Y EL GLOBO SE COLOCABA CONTRA LA
         QUE NO ES (lo vio el titular, 2026-09-18: la peana cortada por el canto
         del teléfono). En escritorio `.marco` lleva **10 px de borde** —el
         chasis dibujado—, así que su caja exterior mide 430×872 y el hueco de
         dentro **410×852**; y un hijo absoluto se coloca contra el de DENTRO,
         mientras que `getBoundingClientRect()` devuelve el de fuera. Con los
         dos mezclados, «12 px de aire contra el canto» dejaba el globo
         terminando en 860 dentro de un hueco de 852: **8 px por debajo del
         chasis, que los recorta**. En un móvil el marco no tiene borde y las dos
         cajas coinciden, y por eso esto no se veía midiendo a 375.
         `clientWidth`/`clientHeight` son el hueco, y `clientLeft`/`clientTop`
         el grosor del borde: lo que hay que descontar para pasar una medida de
         pantalla a coordenadas de colocación. */
      var bIzq = marco.clientLeft, bArr = marco.clientTop;
      var anchoM = marco.clientWidth, altoM = marco.clientHeight;
      var dIzq = d.left - m.left - bIzq, dArriba = d.top - m.top - bArr;
      var centroD = dIzq + d.width / 2;
      var AIRE = 12;          /* lo que respira contra el borde del marco */
      var PICO = 10;          /* cuánto sobresale el pico */

      /* EL PICO APUNTA AL SIGNO, NO A SU MILÍMETRO CENTRAL. El disco mide 34 o
         48 px, así que la punta vale en cualquier parte de él: exigirle el
         centro exacto corría el globo por 20 px que nadie ve. `PUNTA` es lo que
         se le deja de margen para que se lea encima del dibujo y no del canto. */
      var PUNTA = 8;
      var oIzq = dIzq + PUNTA, oDer = dIzq + d.width - PUNTA;
      var ALCANCE = 38;   /* lo que el pico se puede acercar al canto del globo */

      /* CENTRADO SI HAY ESPACIO (titular, 2026-09-17), y el espacio se USA:
         antes de correr el globo se le da ANCHO. Con el marco a 430 el globo
         de 330 centrado va de 50 a 380 y el signo de la carta está en 382 —o
         sea FUERA de la caja—, así que no había ningún sitio donde poner el
         pico y el globo se iba al canto derecho. Ensanchándolo hasta que la
         punta llegue, se queda centrado y apunta igual.
         Las dos condiciones —que el pico no se pase del signo por la izquierda
         ni se quede corto por la derecha— despejadas en `w` con `x` centrado:
         no hace falta probar anchos, sale el número. */
      var tope = anchoM - AIRE * 2;
      var ancho = Math.min(tope, Math.max(330,
        anchoM - 2 * (oDer - ALCANCE),
        2 * (oIzq + ALCANCE) - anchoM));
      nodo.style.width = ancho + 'px';

      /* ⚠️ EL SITIO NO ES EL MARCO ENTERO, ES LO QUE SE VE DE ÉL (titular,
         2026-09-18: «el modal debe garantizar siempre quedar completo dentro
         del viewport»). Dos cosas lo encogen y ninguna mueve el marco: en
         escritorio el teléfono dibujado puede ser más alto que la ventana, y en
         un móvil **el teclado** se come media pantalla en cuanto se toca un
         campo —que es justo lo que hacen los globos que traen formulario—. El
         sitio es la INTERSECCIÓN del marco con el viewport visible, en
         coordenadas del marco. */
      var vv = window.visualViewport;
      var vArriba = vv ? vv.offsetTop : 0;
      var vAlto = vv ? vv.height : window.innerHeight;
      /* El techo baja lo que el signo sube, así que lo que se acota es el
         globo ENTERO —caja y pegatina— y no solo su caja. */
      var techo = Math.max(0, vArriba - m.top - bArr) + AIRE + asomaArriba;
      var suelo = Math.min(altoM, vArriba + vAlto - m.top - bArr) - AIRE;
      var sitio = Math.max(160, suelo - techo - PICO);

      var alto = nodo.offsetHeight;

      /* ⚠️ UN GLOBO MAS ALTO QUE LA PANTALLA DEJA SUS BOTONES FUERA, y no hay
         forma de llegar a ellos: el globo no scrollea y el marco tampoco.
         Pasaba en cuanto el editor de temas enseñaba la explicacion del revisor
         con su reescritura —medido: 856 px de globo en un marco de 812, con el
         «Guardar» 56 px por debajo del canto—. Lo que cede es el CUERPO y no la
         caja entera: el titulo y los botones tienen que quedarse quietos, que
         son la salida. Un globo que explica dos frases no tiene nada que ceda y
         esto no le hace nada. */
      if (cede) {
        /* ⚠️ EL SCROLL SE PONE SOLO CUANDO HACE FALTA, y no de serie en el CSS.
           Un contenedor con `overflow` RECORTA lo que se salga de él, y el
           anillo de foco de un campo (`box-shadow: 0 0 0 2px`) se pinta FUERA
           de su caja: con el campo al 100 % del ancho, el anillo caía justo en
           el canto del área y se veía cortado por los dos lados —lo vio el
           titular en el editor de temas, en un globo que ni siquiera
           scrolleaba—. Sin tope no hay área de recorte y el problema no existe;
           cuando sí lo hay, el aire de `.globo__cede` le deja sitio. */
        cede.style.maxHeight = '';
        cede.style.overflowY = '';
        alto = nodo.offsetHeight;
        if (alto > sitio) {
          cede.style.maxHeight =
            Math.max(140, cede.offsetHeight - (alto - sitio)) + 'px';
          cede.style.overflowY = 'auto';
          alto = nodo.offsetHeight;
        }
      }

      /* ⚠️ Y SI AÚN NO CABE, CEDE EL BLOQUE ENTERO. Lo de arriba deja fuera dos
         casos y los dos salen en pantalla: un globo **sin** cuerpo que ceda —la
         ficha, una explicación larga— y uno cuyo cuerpo ya llegó a su mínimo.
         En los dos el globo se quedaba más alto que el hueco, y como la caja no
         scrollea y el marco tampoco, lo que sobraba **no se podía alcanzar**.
         Que el título y los botones se queden quietos es lo preferible, no lo
         obligatorio: antes que dejar algo fuera de la pantalla, scrollea todo.
         Con esto el globo cabe SIEMPRE, sea cual sea su contenido. */
      dicho.style.maxHeight = '';
      dicho.style.overflowY = '';
      alto = nodo.offsetHeight;
      if (alto > sitio) {
        dicho.style.maxHeight =
          Math.max(60, dicho.offsetHeight - (alto - sitio)) + 'px';
        dicho.style.overflowY = 'auto';
        alto = nodo.offsetHeight;
      }

      /* ARRIBA SI CABE, y si no abajo. Se mide contra el alto de verdad del
         globo, no contra un número inventado: un texto largo cabe o no cabe
         según lo que ocupe, no según lo que ocupara el día que se escribió. */
      var huecoArriba = dArriba - techo;
      var huecoAbajo = suelo - (dArriba + d.height);
      var arriba = huecoArriba >= alto + PICO || huecoArriba >= huecoAbajo;

      var y = arriba ? dArriba - alto - PICO : dArriba + d.height + PICO;
      /* Y SE ACOTA CONTRA LO QUE SE VE, no contra el marco: con el teclado
         abierto el canto de abajo del marco está debajo del teclado. */
      y = Math.max(techo, Math.min(y, suelo - alto));

      /* CENTRADO EN LA PANTALLA (titular, 2026-09-17), no colgado del signo.
         Colgado, un signo de la esquina dejaba el globo pegado a un lado y la
         portada se veía descuadrada; centrado siempre cae donde la vista ya
         está mirando. Lo que apunta al signo es el PICO.
         PERO EL PICO TIENE UN ALCANCE, y centrar a secas lo dejaba sin llegar:
         no puede pegarse a las esquinas redondeadas, así que con un signo muy
         a un lado se quedaba corto y señalaba al aire. Así que el centro es una
         PREFERENCIA, no una orden: si el signo cae fuera de lo que el pico
         alcanza —y eso, con el ancho ya estirado, solo pasa cuando el signo está
         pegado al borde del marco—, el globo se corre lo JUSTO para que la punta
         caiga encima de él. Centrado siempre que se pueda; apuntando siempre. */
      var x = Math.round((anchoM - ancho) / 2);
      x = Math.max(oIzq - (ancho - ALCANCE), Math.min(x, oDer - ALCANCE));

      x = Math.max(AIRE + asomaIzq, Math.min(x, anchoM - ancho - AIRE));
      nodo.style.left = Math.round(x) + 'px';
      nodo.style.top = Math.round(y) + 'px';
      nodo.dataset.lado = arriba ? 'arriba' : 'abajo';

      /* EL PICO APUNTA AL BOTÓN AUNQUE LA CAJA SE HAYA CORRIDO. Se acota para
         que no se salga por las esquinas redondeadas, donde dejaría de leerse
         como un pico y parecería un defecto. */
      /* EL MISMO `ALCANCE` que decidió dónde va el globo: si aquí se acotara
         con otro número, el globo se habría corrido para que el pico llegara y
         el pico se quedaría en otro sitio. Una cuenta, un número. */
      var px = Math.max(ALCANCE, Math.min(centroD - x, ancho - ALCANCE));
      nodo.style.setProperty('--pico-x', Math.round(px) + 'px');
      /* Y de ahí nace la animación. */
      nodo.style.transformOrigin = Math.round(px) + 'px ' + (arriba ? '100%' : '0');
    };

    recolocar();
    /* Se marca abierto DESPUÉS de colocarlo: la animación tiene que arrancar
       desde su sitio, o se ve viajar desde la esquina.
       ⚠️ Y SE MARCA A MANO, NO EN `requestAnimationFrame`. Con rAF el globo se
       quedó a medio aparecer: ese callback NO CORRE si la pestaña no está
       pintando —otra ventana delante, el móvil con la pantalla apagada— y el
       globo se queda invisible hasta que algo obligue a repintar. Lo único que
       hacía falta era que el navegador hubiera calculado el estado inicial
       antes de cambiarlo, y eso ya lo forzó `recolocar()` al leer
       `offsetHeight`: leer una medida vacía el lote de estilos pendientes. */
    void nodo.offsetHeight;
    nodo.dataset.abierto = '1';
    velo.dataset.abierto = '1';
    disparador.setAttribute('aria-expanded', 'true');
    disparador.dataset.globoAbierto = '1';
    nodo.focus();

    globoAbierto = { nodo: nodo, disparador: disparador, velo: velo, recolocar: recolocar };
    window.addEventListener('resize', recolocar);
    /* ⚠️ EL TECLADO NO DISPARA `resize` EN TODOS LOS NAVEGADORES: en iOS no
       cambia el tamaño de la ventana, encoge el viewport VISIBLE. Sin esto, el
       globo se quedaba colocado para una pantalla que ya no está. */
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', recolocar);
      window.visualViewport.addEventListener('scroll', recolocar);
    }
  }

  /* Se cierra tocando fuera y con Escape. El clic de dentro no cuenta —hay
     enlaces ahí— y el del propio disparador tampoco, que ya lo alterna él. */
  document.addEventListener('pointerdown', function (e) {
    if (!globoAbierto) return;
    if (globoAbierto.nodo.contains(e.target)) return;
    if (globoAbierto.disparador.contains(e.target)) return;
    cerrarGlobo();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && globoAbierto) { e.stopPropagation(); cerrarGlobo(); }
  }, true);

  /* LO QUE CRECE DENTRO DE UN GLOBO NO SE COLOCA SOLO. El globo se mide y se
     sitúa al abrirse —arriba o abajo según su alto de verdad—, así que un
     cuerpo que cambia después (la explicación del revisor de temas) lo deja
     mal puesto hasta que alguien gire el teléfono. Es la misma cuenta, pedida
     otra vez. */
  function recolocarGlobo() { if (globoAbierto) globoAbierto.recolocar(); }

  window.ATWI.globo = { abrir: abrirGlobo, cerrar: cerrarGlobo, recolocar: recolocarGlobo };

  /* ======================================================================
     Pintado y eventos
     ====================================================================== */
  function pintar(nombre) {
    if (nombre === 'jugar') pintarJugar();
    else if (nombre === 'catalogo') pintarCatalogo();
    else if (nombre === 'historial') pintarHistorial();
    else if (nombre === 'perfil') pintarPerfil();
  }

  /* Para quien llegue de fuera con datos nuevos: la puerta, cuando se trae el
     perfil del servidor después de arrancar. */
  window.ATWI.repintar = function () { pintar(vistaActual); };

  /* --- EL AVISO QUE NO BLOQUEA -------------------------------------------------
     Petición del titular (2026-09-15), al salir de la sala. Ahí había un
     `confirm()` del navegador, que es lo peor que se puede poner en un juego a
     pantalla completa: rompe la inmersión, sale con la tipografía del sistema,
     no se puede escribir en LATAM sin que parezca un error, y sobre todo PIDE
     UNA DECISIÓN que ya no hace falta pedir --desde que la partida se retoma
     desde el historial, salir no pierde nada--.

     Lo que corresponde es informar, no preguntar. Aparece abajo, encima de
     todo, se va solo y no atrapa el toque de nadie: `pointer-events` en ninguno
     salvo el propio aviso, que se puede tocar para quitarlo antes.

     UNO SOLO A LA VEZ. Dos avisos apilados tapan la pantalla y el segundo pisa
     al primero antes de que se lea; el nuevo reemplaza al viejo. */
  var avisoFuera = null;
  window.ATWI.aviso = function (texto) {
    var viejo = $('.aviso-flotante');
    if (viejo) viejo.remove();
    clearTimeout(avisoFuera);

    var n = document.createElement('div');
    n.className = 'aviso-flotante';
    n.setAttribute('role', 'status');
    n.textContent = texto;
    (document.querySelector('.marco') || document.body).appendChild(n);
    /* Un fotograma antes de la clase que lo sube: sin esto el navegador pinta
       el estado final directamente y no hay transición que ver. */
    requestAnimationFrame(function () { n.classList.add('aviso-flotante--puesto'); });

    function irse() {
      clearTimeout(avisoFuera);
      n.classList.remove('aviso-flotante--puesto');
      setTimeout(function () { if (n.parentNode) n.remove(); }, 260);
    }
    n.addEventListener('click', irse);
    /* SEIS SEGUNDOS y no tres: esta frase dice DÓNDE quedó la partida, que es
       una instrucción y no un «listo». Tres segundos alcanzan para ver que algo
       apareció, no para leer dónde hay que ir a buscarlo. */
    avisoFuera = setTimeout(irse, 6000);
  };

  /* Al terminar una partida el historial que hay en memoria ya no es el de
     ahora: se tira para que se vuelva a pedir. */
  /* Caduca en vez de borrar: quien entra al historial ve lo que había mientras
     llega lo de ahora, en vez de un cuarto de segundo en blanco. */
  window.ATWI.olvidarHistorial = function () { historialCaducado = true; };
  /* Para quien abra algo a pantalla completa desde fuera de este archivo —el
     veredicto— y necesite que el atrás del teléfono lo cierre a él y no la app. */
  window.ATWI.pasoAtras = apilarPaso;
  /* De donde salió el ensayo es a donde vuelve. Lo llama `partida.js` al cerrar
     una escena ensayada, en vez de mandar a la portada: mirar diez escenas
     seguidas no puede costar diez viajes de ida y vuelta por el menú. */
  window.ATWI.alTerminarEnsayo = function () { abrirProbador(); };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-vista]');
    if (b) {
      /* La pestaña del catálogo SIEMPRE devuelve al principio. Si guardara por
         dónde iba, quien vuelve al rato se encuentra una lista de temas sin
         recordar que entró por una categoría, y no tiene cómo saber que hay que
         retroceder para cambiar de pareja a amigos. */
      if (b.dataset.vista === 'catalogo') reiniciarCatalogo();
      irA(b.dataset.vista);
      return;
    }

    var fil = e.target.closest('[data-filtro]');
    if (fil) { filtro = fil.dataset.filtro; pintarCatalogo(); return; }

    var don = e.target.closest('[data-donde]');
    if (don) {
      /* LO ESCRITO NO SE PIERDE AL CAMBIAR DE VIA. El formulario se vuelve a
         dibujar entero y el correo vive en el DOM hasta que se pulsa el botón.
         El nombre del invitado ya no: se guarda en la propuesta al cerrar su
         globo, así que el interruptor no lo puede perder. */
      recordarDonde(don.dataset.donde);
      abrirPreparar(true);
      return;
    }

    var pub = e.target.closest('[data-publico]');
    /* Las cartas de mesa se fueron con el paso 0, pero el manejador se queda:
       el globo de ayuda de un modo podría volver a ofrecerlas, y cuesta una
       línea. Si en un mes nadie lo usa, se va. */
    if (pub) {
      /* SIN `entrar()`: esto ya no abre un paso nuevo —cambia la lista de la
         pantalla en la que se está—, así que apilar una entrada de historial
         dejaría el atrás del teléfono deshaciendo toques de selector. */
      modoPublico = pub.dataset.publico; recordarMesa(modoPublico);
      categoriaAbierta = null; pintarCatalogo(); return;
    }

    var cat = e.target.closest('[data-categoria]');
    if (cat) { categoriaAbierta = cat.dataset.categoria; entrar(); pintarCatalogo(); return; }

    var ret = e.target.closest('[data-retocar]');
    if (ret) { abrirRetocar(ret.dataset.retocar); return; }

    /* LAS AYUDAS DE MODO SALEN EN GLOBO Y NO EN MODAL (titular, 2026-09-17).
       Abrían `#m-explicar` a pantalla completa para decir dos frases; ahora la
       explicación sale de la misma bombilla que se tocó, con el color de su
       modo. `abrirExplicar` se queda por si hay que volver. */
    var expli = e.target.closest('[data-explicar]');
    if (expli) {
      var mo = cfg.modos[expli.dataset.explicar];
      if (mo) {
        abrirGlobo(expli, { titulo: mo.nombre || 'Cómo se juega', texto: mo.que, clave: mo.clave },
                   { tinte: expli.dataset.explicar, etiqueta: 'Cómo se juega',
                     jugar: expli.dataset.explicar });
      }
      return;
    }

    /* Los globos. Hoy solo hay uno —el descargo de IA de la portada—; la tabla
       existe para que añadir el siguiente sea una fila y no un `if` más. */
    var glo = e.target.closest('[data-globo]');
    if (glo) {
      if (glo.dataset.globo === 'descargo') {
        abrirGlobo(glo, { titulo: '¡Importante!', texto: cfg.descargoBase,
                          ojo: cfg.descargoOjo },
                   { tinte: 'lavanda', etiqueta: 'Qué hace la IA en ATWI' });
      }
      return;
    }

    /* Empezar por el modo: se guarda y se va a buscar tema con él puesto. */
    var crear = e.target.closest('[data-crear]');
    if (crear) {
      /* El globo vive fuera de la vista, así que un cambio de pantalla no se lo
         lleva: hay que cerrarlo a mano o se queda flotando sobre el catálogo. */
      cerrarGlobo();
      propuesta.modo = crear.dataset.crear;
      recordarModo(propuesta.modo);
      propuesta.turnos = cfg.reglas.turnosPorDefecto;
      reiniciarCatalogo();
      irA('catalogo');
      return;
    }

    /* Antes que `[data-tema]`: el de personalizar vive dentro de la misma
       tarjeta y si se mirara después, el tema se abriría igualmente. */
    var edi = e.target.closest('[data-editar-tema]');
    if (edi) { abrirEscribir(edi.dataset.editarTema, edi); return; }

    /* Antes que `[data-partida]`. Hoy son hermanos --la papelera esta FUERA del
       boton de abrir, porque un boton dentro de otro el navegador lo desarma--
       asi que no se pisan; se deja antes igual para que el dia que la papelera
       vuelva a entrar en la tarjeta no abra la partida al tocarla. */
    var lista = e.target.closest('[data-lista]');
    if (lista) { vistaHistorial = lista.dataset.lista; pintarHistorial(); return; }

    /* Desde un acta se va a su partida. Ya no hay modal que cerrar antes: la
       lista vive en el historial. */
    var acta = e.target.closest('[data-acta-de]');
    if (acta && acta.dataset.actaDe) { abrirPartida(acta.dataset.actaDe); return; }

    var pap = e.target.closest('[data-borrar]');
    if (pap) { abrirOlvidar(pap.dataset.borrar, pap); return; }

    /* El modo en línea (0055): aceptar o rechazar una invitación del buzón, y
       retirar una propuesta mía desde el historial. */
    var acInv = e.target.closest('[data-aceptar-inv]');
    if (acInv) { acInv.disabled = true; aceptarInvitacion(acInv.dataset.aceptarInv); return; }
    var noInv = e.target.closest('[data-rechazar-inv]');
    if (noInv) { noInv.disabled = true; rechazarInvitacion(noInv.dataset.rechazarInv); return; }
    var retInv = e.target.closest('[data-retirar-inv]');
    if (retInv) { retirarInvitacion(retInv.dataset.retirarInv); return; }

    /* «Dejarla donde está» es cerrar el globo: no hay modal que cerrar. */
    if (e.target.closest('[data-cerrar-globo]')) { cerrarGlobo(); return; }

    var yaOlvidar = e.target.closest('[data-olvidar-ya]');
    if (yaOlvidar) { olvidarPartida(yaOlvidar.dataset.olvidarYa, yaOlvidar); return; }

    var partida = e.target.closest('[data-partida]');
    if (partida && !partida.disabled) { abrirPartida(partida.dataset.partida); return; }

    /* UN AVISO QUE HABLA DE UNA PARTIDA LLEVA A ESA PARTIDA (titular, 2026-09-18:
       «la notificación de que es mi turno debe ser link directo a la partida en
       curso»). El atributo existía desde que se escribió el buzón y no lo
       atendía nadie. Se cierra el buzón antes: la sala se abre encima y al
       volver de ella el buzón ya no tiene por qué seguir ahí. */
    var avisoDe = e.target.closest('[data-ir-debate]');
    if (avisoDe && avisoDe.dataset.irDebate) {
      cerrarModales(['m-buzon']);
      abrirPartida(avisoDe.dataset.irDebate);
      return;
    }

    var tema = e.target.closest('[data-tema]');
    if (tema) { elegirTema(tema.dataset.tema); return; }

    var tn = e.target.closest('[data-turnos]');
    if (tn) {
      propuesta.turnos = Number(tn.dataset.turnos);
      $$('#m-preparar [data-turnos]').forEach(function (x) {
        if (Number(x.dataset.turnos) === propuesta.turnos) x.setAttribute('aria-pressed', 'true');
        else x.removeAttribute('aria-pressed');
      });
      return;
    }

    /* El abogado se enciende y se apaga tocándolo. No se repinta la pantalla
       entera: hacerlo perdería los dos nombres a medio escribir. */
    /* Elegir juez: se toca el disco y queda puesto (2026-09-18). Se marca en
       el sitio, sin repintar la pantalla, que se llevaría el nombre del
       invitado a medio escribir. */
/* ⚠️ AQUÍ SE ATENDÍA EL TOQUE EN UN JUEZ, y se va con la fila: el juez lo echa
       la suerte y no se elige (titular, 2026-09-18). `recordarJuez` y
       `juezPorDefecto` se quedan sin usar por el mismo motivo —lo que ahora
       decide es la vuelta de `sortearJuez()`—. */

    /* AQUÍ SE ATENDÍA EL TOQUE EN UN ATAJO DE INVITADO. Los atajos se quitaron
       el 2026-09-14, así que este manejador ya no puede dispararse: ningún
       elemento lleva `data-invitado`. Se va con ellos —un manejador de algo que
       no existe es una pista falsa para quien venga a leer esto—.

       Lo que hacía sigue pasando por otro lado: al ESCRIBIR un nombre ya
       recordado dentro de su globo, vuelve su ficha entera. */

    var col = e.target.closest('.ficha-editor .colores [data-color]');
    if (col) { colorElegido = col.dataset.color; sincronizarFichaEditor(); return; }

    var pj = e.target.closest('[data-personaje]');
    if (pj && !pj.disabled) {
      personajeElegido = pj.dataset.personaje;
      sincronizarFichaEditor();
      return;
    }

    /* EL PROBADOR. Sus atributos llevan todos el prefijo `pb-` y ninguno
       reutiliza los nombres de más arriba —`data-personaje`, `data-juez-es`,
       `data-color`— a propósito: esos manejadores no están acotados a su
       pantalla, así que un nombre repetido aquí dispararía el de allá. Es el
       mismo choque que hizo que el «Salir» del veredicto cerrara la sesión. */
    var pbo = e.target.closest('#m-probador [data-pb]');
    if (pbo) {
      var campo = pbo.dataset.pb;
      if (campo === 'contesta') estadoProbador().contesta[estadoProbador().modo] = pbo.dataset.val;
      else estadoProbador()[campo] = pbo.dataset.val;
      /* Cambiar de modo cambia la lista de finales, y el que estaba puesto
         puede no existir en la nueva: se cae al primero de la lista. */
      if (campo === 'modo') probador.final = FINALES[probador.modo][0].clave;
      repintarProbador();
      return;
    }

    var pbj = e.target.closest('#m-probador [data-pb-juez]');
    if (pbj) { estadoProbador().juez = pbj.dataset.pbJuez; repintarProbador(); return; }

    var pbc = e.target.closest('#m-probador [data-pb-cara]');
    if (pbc) {
      estadoProbador()[pbc.dataset.pbCara].avatar = pbc.dataset.val;
      repintarProbador();
      return;
    }

    var pbk = e.target.closest('#m-probador [data-pb-color]');
    if (pbk) {
      estadoProbador()[pbk.dataset.pbColor].color = pbk.dataset.val;
      repintarProbador();
      return;
    }

    var cerrar = e.target.closest('[data-cerrar]');
    if (cerrar) { cerrarModal(cerrar.dataset.cerrar); return; }

    var acc = e.target.closest('[data-accion]');
    if (!acc) return;
    var a = acc.dataset.accion;

    if (a === 'buzon') { abrirBuzon(); }
    else if (a === 'nuevo') { reiniciarCatalogo(); irA('catalogo'); }
    else if (a === 'probador') { if (puedeProbar()) abrirProbador(); }
    /* NO SE CIERRA EL PROBADOR AL REPRODUCIR: la revelación se pinta encima
       —z-index 60 contra 41— y al salir de ella el probador vuelve a estar
       ahí, con todo lo elegido puesto, listo para cambiar una cosa y volver a
       mirar. Cerrarlo obligaría a rearmar la escena entera cada vez. */
    else if (a === 'pb-jugar') { window.ATWI.veredicto.revelar(veredictoDeMentira()); }
    /* LA VOTACIÓN DE NEGOCIACIÓN, con tres propuestas de mentira. Va aparte del
       botón de reproducir porque no es una escena del veredicto: es la pantalla
       ANTERIOR, la que decide cuál de las dos escenas sale. Termina cayendo en
       la revelación, así que de paso se ve el empalme entero. */
    else if (a === 'pb-votar') { ensayarDesdeElFinal(); }
    else if (a === 'pb-entrada') { ensayarLaEntrada(); }
    /* AL CERRARLO SE BORRA LO BUSCADO, y es lo que hace que plegarlo sea
       seguro: un campo escondido que sigue filtrando deja una lista recortada
       sin nada en pantalla que explique por qué faltan temas. Los chips no se
       tocan, que ésos se ven. */
    else if (a === 'buscar') {
      buscadorAbierto = !buscadorAbierto;
      if (!buscadorAbierto) busqueda = '';
      reponerFoco = buscadorAbierto;
      pintarCatalogo();
    }
    else if (a === 'catalogo-atras' || a === 'cambiar-publico') {
      /* Las flechas de dentro del catálogo hacen lo mismo que el atrás del
         teléfono, y por el mismo camino: si cambiaran el estado por su cuenta,
         la cuenta de entradas del historial se descuadraría. */
      if (profundidad > 0) history.back();
      else retroceder();
    }
    else if (a === 'jugar-explicado') {
      /* Del modal de la explicación directo a jugar ese mismo modo. */
      propuesta.modo = explicando;
      propuesta.turnos = cfg.reglas.turnosPorDefecto;
      reiniciarCatalogo();
      cerrarModal('m-explicar');
      irA('catalogo');
    }
    else if (a === 'ficha-invitado') { abrirFicha('invitado', acc); }
    else if (a === 'invitar-correo') { abrirCorreo(acc); }
    else if (a === 'guardar-correo') { guardarCorreo(); }
    else if (a === 'enviar-vidas') { abrirEnviarVidas(acc); }
    else if (a === 'enviar-vidas-ya') { enviarVidasYa(); }
    /* Mi personaje desde «Antes de empezar»: la misma ficha del perfil, y al
       guardar queda para el juego entero, no solo para esta partida. */
    else if (a === 'ficha-mia') { abrirFicha('yo', acc); }
    else if (a === 'cambiar-modo') {
      /* ROTA ENTRE LOS MODOS QUE HAYA, y ya no alterna entre dos. Esto se
         escribió cuando eran dos —«cambiar» era alternar— y con QuiénGane
         dentro se quedó dando vueltas entre Juicio y Pacto sin pasar nunca por
         el tercero: lo vio el titular. Ahora la lista sale de `cfg.modos`, así
         que el día que entre un cuarto tampoco hay que tocar esto.
         Sigue sin mandar de vuelta a la portada: elegir desde aquí es un toque
         y volver serían tres, y encima perdería el sitio del catálogo. */
      var modos = Object.keys(cfg.modos);
      propuesta.modo = modos[(modos.indexOf(propuesta.modo) + 1) % modos.length];
      recordarModo(propuesta.modo);
      pintarCatalogo();
    }
    else if (a === 'mas-historial') { masHistorial(); }
    /* LA INVITACIÓN TAMBIÉN PASA POR EL MICRÓFONO (titular, 2026-09-18: «el
       permiso se debe consultar siempre antes de cada sorteo o envío de
       invitación»): quien invita va a grabar su turno en este mismo teléfono. */
    else if (a === 'proponer') { conMicrofono(proponer, 'enviar'); }
    else if (a === 'jugar-aqui') { abrirPreparar(); }
    else if (a === 'sortear') { conMicrofono(sortearYJugar, 'empezar'); }
    else if (a === 'editar-ficha') { abrirFicha('yo', acc); }
    else if (a === 'guardar-ficha') { guardarFicha(); }
    else if (a === 'tema-nuevo') { abrirEscribir(null, acc); }
    else if (a === 'usar-sugerencia') { usarSugerencia(); }
    else if (a === 'editar-tema') { abrirEscribir(propuesta.temaId, acc); }
    else if (a === 'guardar-tema') { guardarTema(); }
    else if (a === 'guardar-retoque') { guardarRetoque(); }
    else if (a === 'devolver-tema') {
      datos.devolverAlOriginal(escribiendo.id);
      cerrarGlobo();
      pintarCatalogo();
    }
    else if (a === 'borrar-tema') {
      if (confirm('Se borra este tema de la lista de ustedes. Lo ya debatido sigue en el historial.')) {
        datos.borrarTemaPropio(escribiendo.id);
        cerrarGlobo();
        pintarCatalogo();
      }
    }
    else if (a === 'entrar') { location.href = location.pathname; }
    else if (a === 'salir') {
      /* Se cierra la sesión Y se borra lo que quedó en el aparato: si no, el
         siguiente en entrar vería el nombre y los contadores del anterior. */
      var salir = window.ATWI.auth ? window.ATWI.auth.salir() : Promise.resolve();
      salir.then(function () {
        datos.olvidar();
        location.href = location.pathname;
      });
    }
    else if (a === 'olvidar') {
      if (confirm('Se borrará tu perfil, tus partidas y tus actas de este dispositivo. No se puede deshacer.')) {
        datos.olvidar();
        pintarPerfil();
      }
    }
  });

  /* Escribir en el buscador repinta, pero el campo se recrea en cada pintado:
     hay que devolverle el foco y el cursor donde estaba. */
  var reponerFoco = false;
  document.addEventListener('input', function (e) {
    /* Los dos nombres del probador se guardan a cada tecla y NO repintan: el
       campo es el que tiene el foco, así que rehacerlo lo perdería en la
       primera letra. */
    var pbn = e.target.dataset && e.target.dataset.pbNombre;
    if (pbn) { estadoProbador()[pbn].nombre = e.target.value; guardarProbador(); return; }

    /* LA REGLA SE APLICA EN EL CAMPO, no al enviar. Un campo que sencillamente
       no admite un espacio ni una letra de más se explica solo, y por eso el
       párrafo que decía «una sola palabra» se pudo quitar. Desde 2026-09-16
       además capitaliza: mayúscula inicial y el resto en minúscula.

       LA MARCA `data-nombre` Y NO EL `id`: son cuatro campos en tres pantallas
       y dos archivos, y con el id había que acordarse de añadir cada uno aquí.
       El trabajo lo hace `datos`, que es donde vive la regla del nombre. */
    if (e.target.dataset && 'nombre' in e.target.dataset) {
      datos.pulirCampoDeNombre(e.target);
    }

    /* EL NOMBRE DEL INVITADO SE ESCRIBE EN SU GLOBO, y ahí sigue valiendo lo de
       siempre: si es alguien con quien ya se jugó, vuelve su ficha entera. La
       gracia de recordarla es no tener que elegirla otra vez, y ahora además se
       ve al instante —la cara grande está justo encima del campo—. */
    if (e.target.id === 'f-nombre' && editandoFicha === 'invitado') {
      var g = datos.invitado(e.target.value.trim());
      if (g) {
        /* Con `distintoDeMi` y no con lo guardado a secas: lo de antes puede
           chocar con mi personaje de hoy, y pintar el crudo enseñaría una ficha
           mientras la partida saldría con otra. */
        personajeElegido = distintoDeMi(g.avatar);
        colorElegido = window.ATWI.elColor(g.color);
        sincronizarFichaEditor();
      }
      return;
    }

    /* El correo se guarda al pulsar «Listo» en su globo y no a cada tecla: ahí
       dentro no hay repintado que lo pueda borrar. Lo que sí hace falta es
       retirar el aviso mientras se corrige. */
    if (e.target.id === 'p-correo') {
      var errC = $('#p-correo-error');
      if (errC) errC.textContent = '';
      return;
    }

    if (e.target.id !== 'q') return;
    busqueda = e.target.value;
    reponerFoco = true;
    pintarCatalogo();
  });

  function devolverFoco() {
    if (!reponerFoco) return;
    reponerFoco = false;
    var q = $('#q');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  /* --- La app se actualiza sola ---------------------------------------------
     UN PWA QUE NO SABE ACTUALIZARSE ES UN PWA ROTO. GitHub Pages manda
     `Cache-Control: max-age=600` en el HTML, así que un teléfono puede seguir
     con la versión de hace diez minutos. Y el `?v=` que pone el publicador
     sella el CSS y el JS DENTRO del HTML: no sirve de nada cuando lo cacheado
     es el HTML mismo. Pedirle a la gente que limpie la caché o reinstale no es
     una solución, es rendirse.

     `version.json` lo escribe el publicador, pesa sesenta bytes y se pide con
     `cache: 'no-store'`, así que siempre trae el sello de verdad. Si no coincide
     con el que lleva cargado, se recarga.

     SE RECARGA CON LA URL CAMBIADA y no con `location.reload()`: recargar vuelve
     a pedir la misma URL y el navegador la puede servir de la caché otra vez,
     que es justo el problema. Con `?v=` distinto, la clave de caché es otra y
     baja de verdad.

     Y NUNCA A MITAD DE PARTIDA. Recargar mientras alguien graba le borra el
     turno. Si la sala está abierta, se anota y se hace al salir. */
  var CLAVE_RECARGA = 'atwi.recargado.en';
  var selloNuevo = null;

  function mirarSiHayVersionNueva() {
    var mia = (cfg && cfg.version) || '';
    if (!mia) return;                       // en local no hay sello y no hay nada que mirar
    fetch('../version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.sello || d.sello === mia) return;
        /* Si ya se recargó por este mismo sello y sigue sin coincidir, el
           navegador está sirviendo HTML viejo de todas formas: recargar otra vez
           es un bucle. Se deja de insistir. */
        var ya = '';
        try { ya = sessionStorage.getItem(CLAVE_RECARGA) || ''; } catch (e) {}
        if (ya === d.sello) return;
        selloNuevo = d.sello;
        if (!$('#m-partida') || $('#m-partida').hidden) recargar();
      })
      .catch(function () { /* sin red no pasa nada: se mira la próxima vez */ });
  }

  function recargar() {
    if (!selloNuevo) return;
    try { sessionStorage.setItem(CLAVE_RECARGA, selloNuevo); } catch (e) {}
    var u = new URL(location.href);
    u.searchParams.set('v', selloNuevo);     // clave de caché distinta: baja de verdad
    location.replace(u.toString());
  }

  /** La llama la sala al cerrarse, por si la actualización quedó esperando. */
  window.ATWI.recargarSiTocaba = function () { if (selloNuevo) recargar(); };

  function vigilarLaVersion() {
    mirarSiHayVersionNueva();
    /* Al volver a la app: es cuando la gente la abre después de un rato, que es
       justo cuando más probable es que se haya publicado algo. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) mirarSiHayVersionNueva();
    });
    setInterval(mirarSiHayVersionNueva, 120000);
  }

  /* --- Arranque ------------------------------------------------------------ */
  function arrancar() {
    $$('.barra-item').forEach(function (b) {
      b.innerHTML = icono(b.dataset.vista, 30) + '<span>' + b.dataset.etiqueta + '</span>';
    });
    $$('[data-icono]').forEach(function (el) { el.innerHTML = icono(el.dataset.icono, Number(el.dataset.tam) || 22); });
    irA('jugar');
    refrescarPunto();
    // El catálogo llega por red: al tenerlo hay que repintar la portada, que
    // enseña el siguiente tema del recorrido.
    datos.catalogo().then(function () {
      if (vistaActual === 'jugar') pintarJugar();
    }).catch(function () {});
    vigilarLaVersion();
    /* Y la app pregunta por novedades (0055): invitaciones, turnos del otro,
       resultados y vidas. Cada medio minuto en primer plano y al volver. */
    arrancarSondeo();
    /* Los temas propios bajan de la cuenta (0055): los de este teléfono que
       aún no estén allá se suben una vez. Si algo cambió y se está mirando el
       catálogo, se repinta. */
    if (datos.sincronizarPropios) {
      datos.sincronizarPropios().then(function (cambios) {
        if (cambios && vistaActual === 'catalogo') pintarCatalogo();
      });
    }
  }
  /* La sala la llama cuando una partida en línea se cerró debajo de ella. */
  window.ATWI.refrescarHistorial = function () {
    historialCaducado = true;
    if (vistaActual === 'historial') pintarHistorial();
  };

  /* EL VISOR DE LA LANDING (titular, 2026-09-17). Con `?demo=1` la app no es la
     app: es una partida de ejemplo corriendo sola dentro del marco de teléfono
     de la landing, que la embebe en un iframe. Se entra por aquí y no por una
     página aparte porque lo que hay que enseñar —el sorteo, el reproductor, el
     veredicto— es código del juego, y una copia se habría desincronizado a la
     primera semana.

     ⚠️ NO PASA POR LA PUERTA Y NO PUEDE HACERLO: la landing la ve alguien que
     todavía no tiene cuenta, que es justamente a quien hay que convencer. Es
     seguro porque el demo no escribe NADA —ni en la base, ni en el perfil, ni
     en el catálogo de jugados— y no lee nada de la red: los datos están
     congelados en `demo.js` y los audios en `assets/audio/demo/`.
     Y no se puede activar por accidente: hace falta escribir el parámetro.

     LA BARRA Y LA CABECERA NO SALEN. Son la navegación del juego —perfil,
     historial, buzón— y aquí no llevan a ninguna parte: lo que se enseña es una
     partida, no una app que se pueda recorrer. */
  function modoDemo() {
    return /[?&]demo=1/.test(location.search) && window.ATWI.demo;
  }

  function arrancarDemo() {
    document.body.dataset.demo = '1';
    var p = $('#puerta');
    if (p) p.hidden = true;
    $$('[data-icono]').forEach(function (el) {
      el.innerHTML = icono(el.dataset.icono, Number(el.dataset.tam) || 22);
    });
    /* Salir de cualquiera de las tres escenas vuelve a empezar, que es lo que
       pidió el titular: «con el botón salir se reinicia el demo». */
    window.ATWI.alTerminarEnsayo = function () { window.ATWI.partida.demoDeLanding(); };
    window.ATWI.partida.demoDeLanding();
  }

  function abrir() {
    if (modoDemo()) return arrancarDemo();
    // Nadie entra al juego sin pasar por la puerta. En modo local basta el nombre.
    window.ATWI.entrada.exigir(arrancar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', abrir);
  else abrir();
})();
