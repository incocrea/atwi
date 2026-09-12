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

  var datos = window.ATWI.datos;
  var icono = window.ATWI.icono;
  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  var $$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ======================================================================
     Navegación entre vistas
     ====================================================================== */
  var VISTAS = ['jugar', 'catalogo', 'historial', 'perfil'];
  var vistaActual = 'jugar';

  function irA(nombre) {
    if (VISTAS.indexOf(nombre) === -1) return;
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
    pintar(nombre);
  }

  /* ======================================================================
     Modales a pantalla completa
     ====================================================================== */
  var pilaModales = [];

  function abrirModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    pilaModales.push(id);
    var foco = $('.modal__cuerpo', m) || m;
    foco.scrollTop = 0;
  }

  function cerrarModal(id) {
    var objetivo = id || pilaModales[pilaModales.length - 1];
    var m = document.getElementById(objetivo);
    if (!m) return;
    m.hidden = true;
    pilaModales = pilaModales.filter(function (x) { return x !== objetivo; });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pilaModales.length) cerrarModal();
  });

  /* ======================================================================
     Vista: Jugar
     ====================================================================== */
  function pintarJugar() {
    var p = datos.perfil();
    var caja = $('#v-jugar');
    var sugerido = datos.siguienteSugerido();

    caja.innerHTML =
      '<div class="saludo">' +
        '<div class="avatar">' + esc(p.avatar) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<h1>' + (p.nombre ? '¡Hola, ' + esc(p.nombre) + '!' : '¡Hola!') + '</h1>' +
          '<p class="chico suave">Nivel ' + p.nivel + ' · ' + p.puntos + ' de ' + p.puntosNivel + ' puntos</p>' +
          '<div class="nivel-barra"><i style="width:' + Math.min(100, Math.round(p.puntos / p.puntosNivel * 100)) + '%"></i></div>' +
        '</div>' +
      '</div>' +

      '<button class="boton boton--bloque boton--grande" data-accion="nuevo" style="margin-bottom:var(--e-4)">' +
        icono('mas', 22) + 'Proponer un debate' +
      '</button>' +

      (sugerido
        ? '<h2 style="margin:var(--e-5) 0 var(--e-3)">Siguiente del recorrido</h2>' +
          tarjetaTema(sugerido)
        : '') +

      '<h2 style="margin:var(--e-5) 0 var(--e-3)">Los dos modos</h2>' +
      '<div class="modos">' +
        fichaModo('juicio', 'Juicio', 'Hay ganador. La IA hace de árbitro y puntúa con la rúbrica a la vista.') +
        fichaModo('pacto', 'Pacto', 'No hay ganador. La IA media y vosotros registráis el acuerdo al que llegasteis.') +
      '</div>' +

      '<div class="aviso-ia" style="margin-top:var(--e-5)">' +
        icono('aviso', 20) +
        '<span>Los resultados los genera una inteligencia artificial. ATWI es un juego: no es terapia ni asesoramiento profesional.</span>' +
      '</div>';
  }

  function fichaModo(clave, nombre, que) {
    return '<div class="modo modo--' + clave + '">' +
        '<span class="modo__icono">' + icono(clave, 30) + '</span>' +
        '<span><span class="modo__nombre">' + nombre + '</span>' +
        '<span class="modo__que">' + que + '</span></span>' +
      '</div>';
  }

  function tarjetaTema(t) {
    return '<button class="tarjeta tarjeta--pulsable tema" data-tema="' + esc(t.id) + '">' +
        '<span class="tema__titulo">' + esc(t.titulo) + '</span>' +
        '<span class="tema__enunciado">' + esc(t.enunciado) + '</span>' +
        '<span class="tema__pie">' +
          '<span class="chip chip--' + esc(t.intensidad) + '">' + esc(t.intensidad) + '</span>' +
        '</span>' +
      '</button>';
  }

  /* ======================================================================
     Vista: Catálogo
     ====================================================================== */
  var categoriaAbierta = null;

  function pintarCatalogo() {
    var caja = $('#v-catalogo');

    datos.catalogo().then(function (cat) {
      if (categoriaAbierta) {
        var temas = datos.temasDe(categoriaAbierta);
        var meta = cat.categorias.filter(function (c) { return c.nombre === categoriaAbierta; })[0] || {};
        caja.innerHTML =
          '<div class="fila" style="margin-bottom:var(--e-4)">' +
            '<button class="boton-icono" data-accion="catalogo-atras" aria-label="Volver a las categorías">' + icono('atras', 22) + '</button>' +
            '<div><h1 style="font-size:var(--t-h2)">' + esc(meta.corto || categoriaAbierta) + '</h1>' +
            '<p class="chico suave">' + temas.length + ' temas</p></div>' +
          '</div>' +
          '<div class="apilado">' + temas.map(tarjetaTema).join('') + '</div>';
        return;
      }

      caja.innerHTML =
        '<h1 style="margin-bottom:var(--e-2)">Catálogo</h1>' +
        '<p class="chico suave" style="margin-bottom:var(--e-4)">' +
          cat.total + ' temas sobre los que discuten las parejas de verdad. ' +
          'Para cuando no tenéis nada por lo que discutir.' +
        '</p>' +
        '<div class="categorias">' +
          cat.categorias.map(function (c) {
            return '<button class="categoria" data-categoria="' + esc(c.nombre) + '">' +
                '<span class="categoria__emoji">' + c.emoji + '</span>' +
                '<span><span style="font-weight:800;font-family:var(--display)">' + esc(c.corto) + '</span></span>' +
                '<span class="categoria__n">' + c.total + '</span>' +
              '</button>';
          }).join('') +
        '</div>';
    }).catch(function () {
      caja.innerHTML = estadoVacio('😕', 'No se pudo cargar el catálogo', 'Comprueba que estás sirviendo el sitio con tools/servir.ps1 y no abriendo el archivo directamente.');
    });
  }

  /* ======================================================================
     Vista: Historial
     ====================================================================== */
  function pintarHistorial() {
    var p = datos.perfil();
    var caja = $('#v-historial');

    if (!p.partidas.length && !p.actas.length) {
      caja.innerHTML =
        '<h1 style="margin-bottom:var(--e-4)">Historial</h1>' +
        estadoVacio('📜', 'Todavía no hay nada',
          'Aquí quedarán tus partidas y las actas de los pactos. El historial nunca se sobrescribe: una revancha añade una versión nueva y la anterior sigue ahí.');
      return;
    }
    caja.innerHTML = '<h1 style="margin-bottom:var(--e-4)">Historial</h1>';
  }

  function estadoVacio(emoji, titulo, texto) {
    return '<div class="vacio">' +
        '<div class="vacio__emoji">' + emoji + '</div>' +
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

    caja.innerHTML =
      '<div class="centrado" style="padding:var(--e-4) 0 var(--e-5)">' +
        '<div class="avatar" style="width:104px;height:104px;font-size:3rem;margin:0 auto var(--e-3)">' + esc(p.avatar) + '</div>' +
        '<h1>' + (p.nombre ? esc(p.nombre) : 'Sin nombre todavía') + '</h1>' +
        '<p class="chico suave">Nivel ' + p.nivel + '</p>' +
      '</div>' +

      '<div class="contadores">' +
        contador(p.juicios, 'Juicios') +
        contador(p.pactos, 'Pactos') +
        contador(p.semanasActivas, 'Semanas') +
      '</div>' +

      '<div class="tarjeta" style="margin-top:var(--e-4);background:var(--pacto-tinte);box-shadow:none">' +
        '<p class="chico" style="color:var(--pacto-oscuro);font-weight:700">' +
          'Aquí no hay marcador entre vosotros dos. Cada quien ve sus propios contadores, ' +
          'y nunca se comparan lado a lado. Es a propósito.' +
        '</p>' +
      '</div>' +

      '<h2 style="margin:var(--e-5) 0 var(--e-3)">Insignias</h2>' +
      '<div class="insignias">' +
        insignias.map(function (e, i) {
          var ganada = i < p.insignias.length;
          return '<div class="insignia' + (ganada ? '' : ' insignia--bloqueada') + '">' + (ganada ? e : '🔒') + '</div>';
        }).join('') +
      '</div>' +

      '<div style="margin-top:var(--e-6)">' +
        '<button class="boton boton--fantasma boton--bloque" data-accion="olvidar">Borrar mis datos de este dispositivo</button>' +
      '</div>';
  }

  function contador(n, que) {
    return '<div class="contador"><div class="contador__n">' + n + '</div><div class="contador__que">' + que + '</div></div>';
  }

  /* ======================================================================
     Flujo: proponer un debate
     ====================================================================== */
  var propuesta = { temaId: null, modo: null };

  function abrirTema(id) {
    var t = datos.tema(id);
    if (!t) return;
    propuesta.temaId = id;
    propuesta.modo = null;

    $('#m-tema .modal__titulo').textContent = t.titulo;
    $('#m-tema .modal__cuerpo').innerHTML =
      '<div class="tarjeta tarjeta--aire" style="margin-bottom:var(--e-4)">' +
        '<p style="font-family:var(--display);font-weight:800;font-size:var(--t-h3);line-height:1.25">' + esc(t.enunciado) + '</p>' +
      '</div>' +
      '<h3 style="margin-bottom:var(--e-2)">Las dos posturas</h3>' +
      '<div class="apilado" style="margin-bottom:var(--e-5)">' +
        posturaCaja('A', t.a) +
        posturaCaja('B', t.b) +
      '</div>' +
      '<div class="aviso-ia">' + icono('aviso', 20) +
        '<span>Las dos se pueden defender. Si una te parece indefendible, el tema no está bien escrito: avísanos.</span>' +
      '</div>';

    abrirModal('m-tema');
  }

  function posturaCaja(letra, texto) {
    return '<div class="tarjeta" style="display:grid;grid-template-columns:28px 1fr;gap:var(--e-3);align-items:start">' +
        '<span class="chip chip--marca" style="justify-content:center">' + letra + '</span>' +
        '<span class="chico">' + esc(texto) + '</span>' +
      '</div>';
  }

  function abrirModo() {
    var t = datos.tema(propuesta.temaId);
    if (!t) return;

    $('#m-modo .modal__cuerpo').innerHTML =
      '<p class="suave chico" style="margin-bottom:var(--e-4)">' +
        'Eliges cómo quieres jugar <strong>' + esc(t.titulo) + '</strong>. ' +
        'Es una propuesta: la otra persona tiene que aceptarla antes de empezar.' +
      '</p>' +
      '<div class="apilado">' +
        opcionModo('juicio', 'Juicio', 'La IA hace de árbitro, puntúa con la rúbrica y declara ganador o empate. Queda en tu historial.') +
        opcionModo('pacto', 'Pacto', 'La IA hace de mediador. No hay ganador: registráis el acuerdo al que llegasteis, como recordatorio.') +
      '</div>' +
      '<div class="aviso-ia" style="margin-top:var(--e-4)">' + icono('aviso', 20) +
        '<span>Si no os ponéis de acuerdo en el modo, el debate no se juega. Nadie puede imponerle Juicio al otro.</span>' +
      '</div>';

    $('#m-modo [data-accion="proponer"]').disabled = true;
    abrirModal('m-modo');
  }

  function opcionModo(clave, nombre, que) {
    return '<button class="opcion" data-modo="' + clave + '" aria-pressed="false">' +
        '<span style="display:grid;grid-template-columns:44px 1fr;gap:var(--e-3);align-items:center">' +
          '<span class="modo__icono" style="width:44px;height:44px;border-radius:14px;' +
            'background:var(--' + clave + '-tinte);color:var(--' + clave + '-oscuro)">' + icono(clave, 24) + '</span>' +
          '<span><span class="modo__nombre">' + nombre + '</span>' +
          '<span class="modo__que">' + que + '</span></span>' +
        '</span>' +
        '<span class="opcion__marca">' + icono('listo', 16) + '</span>' +
      '</button>';
  }

  function elegirModo(clave) {
    propuesta.modo = clave;
    $$('#m-modo .opcion').forEach(function (o) {
      o.setAttribute('aria-pressed', String(o.dataset.modo === clave));
    });
    $('#m-modo [data-accion="proponer"]').disabled = false;
  }

  function proponer() {
    var t = datos.tema(propuesta.temaId);
    var esPacto = propuesta.modo === 'pacto';

    $('#m-invitar .modal__cuerpo').innerHTML =
      '<div class="centrado" style="padding:var(--e-6) 0">' +
        '<div style="font-size:3.5rem;margin-bottom:var(--e-3)">📨</div>' +
        '<h2 style="margin-bottom:var(--e-2)">Propuesta lista</h2>' +
        '<p class="suave chico" style="max-width:26rem;margin:0 auto">' +
          'Le vas a proponer <strong>' + esc(t.titulo) + '</strong> en modo ' +
          '<strong>' + (esPacto ? 'Pacto' : 'Juicio') + '</strong>. ' +
          'Podrá aceptarlo o pedirte el otro modo.' +
        '</p>' +
      '</div>' +
      '<div class="tarjeta" style="background:var(--crema-hondo);box-shadow:none">' +
        '<p class="chico suave">' +
          'Todavía no hay servidor conectado, así que la invitación no sale de este teléfono. ' +
          'Cuando lo haya, aquí saldrá el enlace para mandar por WhatsApp.' +
        '</p>' +
      '</div>';

    cerrarModal('m-modo');
    cerrarModal('m-tema');
    abrirModal('m-invitar');
  }

  /* ======================================================================
     Pintado y eventos
     ====================================================================== */
  function pintar(nombre) {
    if (nombre === 'jugar') pintarJugar();
    else if (nombre === 'catalogo') pintarCatalogo();
    else if (nombre === 'historial') pintarHistorial();
    else if (nombre === 'perfil') pintarPerfil();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-vista]');
    if (b) { irA(b.dataset.vista); return; }

    var cat = e.target.closest('[data-categoria]');
    if (cat) { categoriaAbierta = cat.dataset.categoria; pintarCatalogo(); return; }

    var tema = e.target.closest('[data-tema]');
    if (tema) { abrirTema(tema.dataset.tema); return; }

    var modo = e.target.closest('[data-modo]');
    if (modo) { elegirModo(modo.dataset.modo); return; }

    var cerrar = e.target.closest('[data-cerrar]');
    if (cerrar) { cerrarModal(cerrar.dataset.cerrar); return; }

    var acc = e.target.closest('[data-accion]');
    if (!acc) return;
    var a = acc.dataset.accion;

    if (a === 'nuevo') { irA('catalogo'); }
    else if (a === 'catalogo-atras') { categoriaAbierta = null; pintarCatalogo(); }
    else if (a === 'elegir-modo') { abrirModo(); }
    else if (a === 'proponer') { proponer(); }
    else if (a === 'olvidar') {
      if (confirm('Se borrará tu perfil, tus partidas y tus actas de este dispositivo. No se puede deshacer.')) {
        datos.olvidar();
        pintarPerfil();
      }
    }
  });

  /* --- Arranque ------------------------------------------------------------ */
  function arrancar() {
    $$('.barra-item').forEach(function (b) {
      var n = b.dataset.vista;
      b.innerHTML = icono(n === 'jugar' ? 'jugar' : n === 'catalogo' ? 'catalogo' : n === 'historial' ? 'historial' : 'perfil', 26) +
        '<span>' + b.dataset.etiqueta + '</span>';
    });
    $$('[data-icono]').forEach(function (el) { el.innerHTML = icono(el.dataset.icono, Number(el.dataset.tam) || 22); });
    irA('jugar');
    // El catálogo llega por red: al tenerlo hay que repintar la portada, que
    // enseña el siguiente tema del recorrido.
    datos.catalogo().then(function () {
      if (vistaActual === 'jugar') pintarJugar();
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
