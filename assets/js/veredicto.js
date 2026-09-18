/* ==========================================================================
   ATWI · veredicto.js
   El momento del resultado, que es el clímax del juego.

   La secuencia, siempre igual y siempre disparada por un toque:

       frase  ->  un segundo quieto con redoble  ->  platillo y revelación

   Medido de punta a punta: 2,9 s. Antes eran 6,6 con una cuenta atrás 3-2-1
   delante; se quitó el 2026-09-14 y no vuelve.

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
  /* La salida de la revelación que está en pantalla, o null si no hay ninguna.
     Vive aquí y no dentro del manejador del botón porque la usan DOS: el botón
     y el atrás del teléfono. Ver `salir()`. */
  var salidaEnCurso = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function alAzar(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

  /* La frase del resultado es también el nombre de la app: And-The-Winner-Is.
     No es tipografía: cada tramo es una pieza dibujada, con su inicial de color
     y su perfil blanco, recortada de su lámina. Por eso la frase se lee como el
     nombre y no como una frase cualquiera puesta en negrita.

     Van en CUATRO piezas y no en una sola por la entrada: cada tramo vuela por
     separado, así que tienen que ser cuatro elementos con su propia caja. Las
     cuatro se dibujaron con la misma altura de caja y se recortaron sobre un
     lienzo de la misma altura, apoyadas abajo, de modo que darles a todas la
     misma altura en CSS las deja sobre la misma línea base.

     Se pinta siempre montada y en una sola línea: partirla en dos renglones
     rompe el logotipo. El drama lo pone la entrada, no el escalonado. */
  function fraseMarca() {
    var partes = cfg.veredicto.frase;
    if (typeof partes === 'string') return esc(partes);   // por si vuelve a ser texto plano
    return partes.map(function (par) {
      return '<span class="fm__palabra">' +
          '<img class="fm__tramo" src="../assets/img/atwi/' + par[0] + '.png" alt="' + esc(par[1]) + '">' +
        '</span>';
    }).join('');
  }

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ==========================================================================
     LA ENTRADA DE LA FRASE
     Cada tramo —And, The, Winner, Is…— aparece primero SOLO, grande y en el
     centro de la pantalla, aguanta un cuarto de segundo, y desde ahí vuela a su
     sitio y a su tamaño definitivos. Cuando el último aterriza se espera un
     segundo y sale el resultado.

     Se hace con un clon volando por encima y el tramo real escondido debajo:
     así el destino es la posición REAL que la maqueta le da, y no hay que
     adivinar coordenadas ni desactivar el flujo normal del texto.
     ========================================================================== */
  /* AL DOBLE, Y YA NO ES «EL MODO RÁPIDO DEL PROBADOR» (decisión del titular,
     2026-09-14). Estos números eran 500 y 380 y el probador los partía por dos
     para poder mirar una escena veinte veces seguidas; se miró así durante toda
     una tarde y lo rápido resultó ser lo bueno. Ahora es el único timing que
     hay: la bandera `rapido` se fue con la cuenta atrás. */
  var MS_GRANDE = 250;    // lo que aguanta cada tramo a tamaño completo
  var MS_VUELO = 190;     // lo que tarda en colocarse
  /* Cuanto mas ancho es el liston que la frase que lleva encima. Tiene que
     asomar lo justo: si no asoma, las estrellas de los costados caen DETRAS de
     las letras y no se ven --en el pliego la banda de la frase mide 1926 y la
     del liston 1970, casi lo mismo--; y si asoma de mas, las letras se quedan
     nadando en un charco de oro.

     Con 1,12 asoma un 5 % por cada lado y las letras ocupan el 79 % del alto
     del liston, que es donde se apoyan sin flotar. */
  var LISTON = 1.12;

  /**
   * La frase ocupa EL MISMO ANCHO que el botón de abajo, y para eso hay que
   * medir: no hay tamaño de letra fijo que cuadre en todos los anchos de
   * pantalla, y `vw` tampoco sirve porque en escritorio el juego vive dentro de
   * un marco de 430 px y no en la ventana entera. Así que se mide lo que ocupa
   * la frase a su tamaño de base y se escala hasta llenar la columna.
   */
  function ajustarAncho(p) {
    var f = p.querySelector('.revelacion__frase');
    if (!f) return;
    f.style.fontSize = '';
    var hueco = f.clientWidth;
    var tramos = [].slice.call(f.querySelectorAll('.fm__palabra'));
    if (!hueco || !tramos.length) return;

    /* El ancho real se suma a mano, tramo a tramo. `scrollWidth` NO sirve: la
       fila va centrada, y lo que se sale por la izquierda no entra en esa
       cuenta. Mide de menos, el factor sale grande y la frase acaba
       desbordando por los dos costados: medido, 399 px de contenido en 339 de
       hueco con scrollWidth diciendo 369. */
    var separacion = parseFloat(getComputedStyle(f).columnGap) || 0;
    var natural = tramos.reduce(function (suma, t) {
      return suma + t.getBoundingClientRect().width;
    }, 0) + separacion * (tramos.length - 1);
    if (!natural) return;

    var base = parseFloat(getComputedStyle(f).fontSize) || 16;
    /* La frase no ocupa la columna entera: le deja sitio al LISTÓN, que va
       detrás y es más ancho porque lleva sus estrellas a los costados. El
       listón ocupa el 100 % y la frase este trozo, así que asoma por igual a
       los dos lados. Si la frase llenara la columna, el listón tendría que
       salirse del lienzo, y aquí nada se sale de lado. */
    f.style.fontSize = (base * (hueco / LISTON / natural)).toFixed(2) + 'px';
  }

  /* Los tramos son imágenes: medir antes de que carguen da un ancho falso y
     la frase se queda a medias o se sale. */
  function conLasLetrasPuestas(p) {
    var imgs = [].slice.call(p.querySelectorAll('.fm__tramo'));
    return Promise.all(imgs.map(function (im) {
      if (im.complete && im.naturalWidth) return null;
      return new Promise(function (listo) {
        im.addEventListener('load', listo, { once: true });
        im.addEventListener('error', listo, { once: true });
        setTimeout(listo, 1200);      // si la imagen no llega, no se cuelga el juego
      });
    }));
  }

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
    }, Promise.resolve()).then(function () {
      capa.remove();
      /* Y recien ahora el liston: durante el vuelo no hay nada sobre lo que
         montarse todavia, y verlo esperando vacio delata el truco. */
      frase.classList.add('revelacion__frase--montada');
    });
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

      /* CON RELOJ, NO CON EL FOTOGRAMA (S29, decisión del titular, 2026-09-18).
         `vuelo.finished` solo se cumple cuando el navegador pinta el último
         cuadro, y un teléfono con la pantalla apagada --o el navegador
         integrado con el panel detrás-- no pinta ninguno: la secuencia se
         quedaba en «And The» hasta que alguien volvía a mirar. El reloj gana
         siempre: pase lo que pase con los cuadros, cada palabra se coloca a los
         `MS_VUELO` ms y la revelación llega al final sola. */
      var reloj = esperar(MS_VUELO + 40);
      return Promise.race([vuelo.finished.catch(function () {}), reloj]).then(function () {
        try { vuelo.finish(); } catch (e) {}
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
   * @param r.motivoEmpate  por cuál de los cuatro caminos se llegó:
   *                    'parejo' | 'seDioVuelta' | 'sinPostura' | 'generico'
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
      var p = pantalla();
      p.hidden = false;
      p.className = 'revelacion revelacion--' + (r.modo === 'negociacion' ? 'negociacion' : 'debate');
      /* Una entrada de historial para el veredicto: si no, el atrás del
         teléfono cerraría la app con el resultado en pantalla. */
      if (window.ATWI.pasoAtras) window.ATWI.pasoAtras();
      /* Tres filas fijas: la frase arriba, lo que cambia en medio y el botón
         abajo. La frase NO se vuelve a pintar al revelar el resultado, así que
         no se mueve ni cambia de tamaño: donde aterrizan los tramos es ya su
         sitio definitivo. */
      p.innerHTML =
        '<p class="revelacion__frase">' + fraseMarca() + '</p>' +
        '<div class="revelacion__centro" id="rev-centro"></div>' +
        '<div class="revelacion__abajo" id="rev-abajo"></div>';

      /* El contexto de audio se abre AQUÍ, dentro del gesto que llamó a
         revelar(), que es el único momento en que el navegador lo desbloquea. */
      if (sonido.hay()) sonido.despertar();

      /* SE ACABÓ LA CUENTA ATRÁS (decisión del titular, 2026-09-14, y es
         definitiva). Eran 3-2-1 con un número grande y su redoble de tres
         segundos. Se probó durante una tarde entera el timing corto del
         probador --frase al doble y sin cuenta-- y es mejor: el 3-2-1 no añade
         tensión, añade espera, y en un juego que se abre muchas veces la
         ceremonia larga es lo primero que cansa. Lo que queda es UN SEGUNDO
         quieto entre la frase montada y el resultado, que es el hueco donde
         cabe el redoble y donde el ojo se prepara.

         El redoble se queda porque un segundo mudo es un segundo roto, y dura
         lo que la espera: `redoble` acorta sus golpes de 90 a 22 ms sobre la
         duración que le den, así que a 1,2 s hace la rampa entera igual que
         hacía a 3,2. */
      var MS_ESPERA = 1000;

      return conLasLetrasPuestas(p).then(function () {
        ajustarAncho(p);
        return entradaDramatica(p);
      }).then(function () {
        var cortar = sonido.hay() ? sonido.redoble(MS_ESPERA / 1000 + 0.2)
                                  : function () {};
        return esperar(MS_ESPERA).then(function () {
          cortar();
          if (sonido.hay()) sonido.platillo();
          return mostrarResultado(p, r);
        });
      });
    },

    /**
     * Cierra la revelación DEVOLVIENDO la entrada de historial que se apiló al
     * abrirla. Lo llaman el botón y el atrás del teléfono, por el mismo camino:
     * `history.back()` dispara el `popstate` de `app.js`, que llama a
     * `retroceder()`, que ve esta pantalla abierta y ejecuta `alAtras()`.
     *
     * Si no hay historial que devolver --`pushState` falla en `file://`-- se
     * cierra a mano pasado un instante, para no dejar la pantalla clavada.
     */
    salir: function () {
      if (!salidaEnCurso) return;
      var pendiente = salidaEnCurso;
      try { history.back(); } catch (e) { pendiente(); return; }
      setTimeout(function () { if (salidaEnCurso === pendiente) pendiente(); }, 150);
    },

    /** La llama `retroceder()` de app.js cuando el atrás llega hasta aquí. */
    alAtras: function () {
      if (!salidaEnCurso) return false;
      salidaEnCurso();
      return true;
    },

    cerrar: function () {
      if (!caja) return;
      caja.hidden = true;
      /* El confeti se sigue dibujando aunque la pantalla esté oculta: cortarlo
         al salir evita dejar un requestAnimationFrame girando de fondo. */
      var c = caja.querySelector('.confeti');
      if (c) c.remove();
      /* Y los ganadores. Viven colgados de la pantalla y no de `#rev-centro`,
         así que no se los lleva el siguiente `innerHTML`: sin esto, la escena
         siguiente arrancaría con los campeones de la anterior todavía puestos. */
      Array.prototype.forEach.call(caja.querySelectorAll('.campeon, .campeon-n'),
        function (g) { g.remove(); });
    }
  };

  /* ==========================================================================
     EL CONFETI
     Dibujado en un canvas, sin librería ni imágenes: son dos cañones que
     disparan desde las esquinas de abajo hacia dentro, con gravedad y giro.
     Cada papelito es un rectángulo que rota sobre su eje, y por eso a ratos se
     ve de canto: es lo que hace que parezca papel y no una bolita de color.

     Va con el platillo y con la revelación del nombre, y es la mitad visible de
     la celebración: en iOS con el silencio puesto no suena nada, así que si la
     fiesta fuera solo sonora no habría fiesta.
     ========================================================================== */
  var COLORES = ['#F5C243', '#F07F55', '#EE9BBE', '#FFFFFF', '#7A6AD8', '#34B79B'];

  function confeti(p, modo) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var lienzo = document.createElement('canvas');
    lienzo.className = 'confeti';
    p.appendChild(lienzo);

    var ancho = p.clientWidth, alto = p.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    lienzo.width = ancho * dpr;
    lienzo.height = alto * dpr;
    lienzo.style.width = ancho + 'px';
    lienzo.style.height = alto + 'px';
    var g = lienzo.getContext('2d');
    g.scale(dpr, dpr);

    /* El color del modo entra en la mezcla para que la fiesta sea de ESTA
       partida y no un confeti genérico. */
    var paleta = COLORES.concat([modo === 'negociacion' ? '#34B79B' : '#F07F55']);
    var trozos = [];

    function canon(x, haciaLaDerecha) {
      for (var i = 0; i < 70; i++) {
        var angulo = (-Math.PI / 2) + (haciaLaDerecha ? 1 : -1) * (0.15 + Math.random() * 0.55);
        var fuerza = 9 + Math.random() * 9;
        trozos.push({
          x: x, y: alto + 10,
          vx: Math.cos(angulo) * fuerza,
          vy: Math.sin(angulo) * fuerza,
          an: Math.random() * Math.PI,
          van: (Math.random() - 0.5) * 0.35,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 7,
          color: paleta[Math.floor(Math.random() * paleta.length)]
        });
      }
    }
    canon(ancho * 0.12, true);
    canon(ancho * 0.88, false);

    var desde = null;
    function cuadro(ahora) {
      if (desde === null) desde = ahora;
      g.clearRect(0, 0, ancho, alto);
      var vivos = 0;

      for (var i = 0; i < trozos.length; i++) {
        var t = trozos[i];
        t.vy += 0.30;            // gravedad
        t.vx *= 0.992;           // el aire lo frena de lado
        t.x += t.vx;
        t.y += t.vy;
        t.an += t.van;
        if (t.y > alto + 40) continue;
        vivos++;

        g.save();
        g.translate(t.x, t.y);
        g.rotate(t.an);
        /* El ancho se encoge con el giro: así el papelito se ve de canto al
           pasar por el perfil, que es lo que delata que es papel. */
        g.fillStyle = t.color;
        g.fillRect(-t.w / 2, -t.h / 2, t.w * Math.abs(Math.cos(t.an)), t.h);
        g.restore();
      }

      if (vivos && ahora - desde < 4000) requestAnimationFrame(cuadro);
      else lienzo.remove();
    }
    requestAnimationFrame(cuadro);
  }

  /* LOS DOS, LADO A LADO, DESPUES DE LA SERPENTINA. Decision del titular
     (CLAUDE.md): en partida local el telefono es uno solo, asi que el resultado
     enseña las dos caras a la vez y cada una con su pose.

     NO HAY POSE DE DERROTA, y hay que decirlo: de las seis cortadas, `ganar`
     celebra, `plante` es guardia, `frente` es neutra y `sentado` es alguien
     sentado y sonriendo. Ninguna dibuja a alguien vencido. Se usa `sentado`
     para quien no gano, que se lee como «me sente» y no como «me humillaron»,
     y eso encaja con la regla del producto de que el veredicto no humilla a
     nadie: `nombra_perdedor` va en falso por contrato y no se dice «X perdio».
     Si algun dia se quiere una derrota de verdad, hace falta arte nueva.

     EL EMPATE YA NO SE PINTA AQUI (decision del titular, 2026-09-14). Decia
     «en empate los dos van sentados: nadie celebra», y se revoco: ahora entran
     los dos grandes con la pose de victoria, porque un empate no es no haber
     ganado --es haber argumentado igual de bien-- y dos figuras sentadas lo
     contaban como un resultado de consolacion. Ver `losQueEntran`. */
  function dueloHTML(r, entran) {
    if (!r.duelo || r.duelo.length !== 2) return '';
    /* Si entran los dos --acuerdo, o empate-- no queda nadie a quien pintar
       aqui, y una rejilla de dos celdas vacias sigue ocupando su alto y empuja
       el titular hacia arriba. */
    if (entran.length === 2) return '';
    var solo = entran.length === 1;
    /* `duelo--solo` cuando uno entra grande: el que queda se aparta hacia su
       costado y sube, para dejarle la escena al ganador. Va como clase y no
       como estilo suelto porque son dos números que se ajustan mirando. */
    return '<div class="duelo' + (solo ? ' duelo--solo' : '') + '">' +
      r.duelo.map(function (q, i) {
      /* CUANDO HAY GANADOR, EL SUYO NO SE PINTA AQUÍ: entra grande por su lado
         (ver `campeonesEnGrande`). Se deja la celda VACÍA y no se quita, para
         que quien perdió se quede exactamente donde estaba —en su lado— en vez
         de saltar al centro al quedarse solo en la rejilla. */
      if (entran.indexOf(i) !== -1) return '<div class="duelo__lado"></div>';
      var pose = q.gano ? 'ganar' : 'sentado';
      return '<div class="duelo__lado' + (q.gano ? ' duelo__lado--gana' : '') + '">' +
        window.ATWI.retrato(q.avatar, pose, { fondo: 'disco', color: q.color,
                                              clase: 'duelo__fig' }) +
        /* SIN NOMBRE CUANDO EL OTRO ENTRA GRANDE (decisión del titular,
           2026-09-14). Arriba y chico, el disco se lee como alguien mirando la
           escena desde lejos, y a esa distancia un rótulo no se sostiene: pide
           que se lo lea igual que al nombre del ganador, que está enfrente y a
           tres veces su tamaño. Quién es se ve en la cara y en el color, que es
           con lo que se le identificó toda la partida. */
        (solo ? '' : '<span class="duelo__n">' + esc(q.nombre) + '</span>') +
      '</div>';
    }).join('') + '</div>';
  }

  /* QUIEN GANA ENTRA GRANDE, COMO EN EL VERSUS (decisión del titular,
     2026-09-14). Antes la victoria eran dos discos del mismo tamaño y un nombre
     grande debajo: se leía como una tabla de resultados, no como ganar. Ahora la
     figura entra desde SU lado —el mismo en el que ha estado toda la pantalla—,
     grande, y el puño llega al centro justo cuando estallan las serpentinas.

     Y PUEDEN SER DOS, por dos caminos distintos: la Negociación CON ACUERDO
     --ahí ganan los dos-- y el EMPATE de Controversia, donde no gana nadie y
     entran igual (decisión del titular, 2026-09-14). El empate entró después y
     revoca lo que había: los dos salían sentados en sus discos, y eso lo contaba
     como un resultado de consolación. Un empate no es no haber ganado, es haber
     argumentado igual de bien, así que celebran los dos.

     El único final donde no entra nadie es la Negociación SIN acuerdo, y ahí es
     correcto: no hay nada que celebrar y el momento es la frase de debajo.

     Cuando son dos van MÁS CHICOS —ver `.campeon--dos`—: a tamaño de uno solo se
     comerían el centro y el titular quedaría detrás de ellos.

     LA POSE ES `ganar`, NO `puno`. Se probó con `puno` —el choque de puños del
     versus— y está mal: esa es la pose de saludar a alguien, y aquí no hay nadie
     enfrente a quien chocarle el puño. La de victoria es la del puño LEVANTADO,
     y lo que se orienta al centro es ese puño.

     EL PUÑO AL CENTRO SIN PENSARLO. Los seis levantan el puño hacia la derecha
     de la lámina, así que quien gana por la izquierda sale tal cual y quien gana
     por la derecha sale volteado: en los dos casos el puño queda del lado del
     centro. Es la misma mecánica del encuentro y por eso usa sus mismos números:
     el lienzo se ancla al centro y la figura se acerca con `--acerca`, porque lo
     que toca el centro es el borde del LIENZO y la figura lleva aire a los
     lados —un 18 % en `ganar`, medido sobre las seis piezas—.

     Y SE CORTA POR EL COSTADO, a propósito, igual que en el versus: con la
     figura entera dentro se ve una pegatina puesta en una esquina; cortada se
     ve a alguien que no cabe en la pantalla.

     Quien perdió NO se mueve: se queda con su disco en su lado, que es donde ya
     estaba. Nada de arrastrarlo al centro ni de encogerlo. */
  /** Qué lados entran grandes: [] , [0] , [1] o [0,1].
   *
   * ENTRAN SIEMPRE LOS DOS, SALVO CUANDO GANA UNO (decisión del titular,
   * 2026-09-14). Los cinco finales usan la misma entrada, el mismo tamaño y la
   * misma distancia; lo único que cambia entre ellos es la POSE --ver
   * `poseDeEntrada`-- y el titular. Antes cada final tenía su composición:
   * discos chicos aquí, figuras grandes allá, y se leían como pantallas de
   * juegos distintos.
   *
   * Con ganador sigue entrando uno solo, y tiene que ser así: es lo que
   * distingue ganar de todo lo demás. Quien no ganó se queda en su disco,
   * arriba y al costado.
   */
  function losQueEntran(r) {
    if (!r.duelo || r.duelo.length !== 2) return [];
    if (r.sinResultado || r.empate || r.modo === 'negociacion') return [0, 1];
    return [0, 1].filter(function (i) { return r.duelo[i].gano; });
  }

  /** Con qué pose entran. Celebrar o no celebrar, que es lo único que separa
   *  estos cuatro finales una vez que la composición es la misma.
   *
   *  NO SE VOLTEA, y eso sale solo: `MIRA` en personajes.js solo tiene `puno`,
   *  `plante` y `ganar`, que son las que están dibujadas mirando a un lado. Una
   *  figura sentada es frontal, y voltearla le daría la vuelta al logotipo de la
   *  camiseta sin ganar nada. */
  function poseDeEntrada(r) {
    if (r.sinResultado) return 'sentado';
    if (r.modo === 'negociacion' && !r.acuerdo) return 'sentado';
    return 'ganar';
  }

  /* EL NOMBRE NUNCA PARTE EN DOS RENGLONES: SI NO CABE, SE ACHICA (regla del
     titular, 2026-09-14). Un nombre partido deja de leerse como un nombre y
     pasa a leerse como dos cosas —«Maximilian / oooooo»—, y encima descoloca el
     rótulo, que está centrado sobre un punto. Achicarlo lo deja más chico pero
     lo deja siendo un nombre.

     SE MIDE, NO SE CALCULA. Cuántas letras entran depende de cuáles sean: una
     «M» ocupa el triple que una «i», así que un tope por número de caracteres
     corta nombres que caben y deja pasar otros que no. Se mide el texto de
     verdad contra el hueco de verdad.

     Y SE MIDE DOS VECES. La primera pasada divide por la razón, que casi acierta
     pero no del todo: el trazo blanco del borde no escala con la letra y el
     interletraje redondea distinto a cada tamaño. Las correcciones de a un
     píxel rematan; hay tope de vueltas porque una medida que no baje nunca
     colgaría la pantalla del resultado, que es el peor sitio donde colgarse. */
  var ROTULO_MINIMO = 13;   // px; por debajo el nombre deja de ser un titular

  function encajarRotulo(rotulo, texto) {
    /* SE MIDE CON `offsetWidth` Y NO CON `getBoundingClientRect`, y eso fue un
       fallo de verdad: el rótulo entra con una animación que arranca en
       `scale(.7)` y `fill: both`, o sea que la escala ya está puesta en el
       momento de medir. `getBoundingClientRect` devuelve lo que se ve —el 70 %—
       así que un nombre de 248 px medía 174, entraba de sobra en los 233 del
       hueco y no se achicaba nada; al terminar la animación crecía y se salía.
       `offsetWidth` es medida de MAQUETA: no la tocan las transformaciones. */
    var hueco = rotulo.clientWidth;
    if (!hueco) return;
    var ancho = function () { return texto.offsetWidth; };
    if (ancho() <= hueco) return;

    var base = parseFloat(getComputedStyle(rotulo).fontSize) || 24;
    var tam = Math.max(ROTULO_MINIMO, Math.floor(base * hueco / ancho()));
    rotulo.style.fontSize = tam + 'px';
    for (var v = 0; v < 24 && ancho() > hueco && tam > ROTULO_MINIMO; v++) {
      tam -= 1;
      rotulo.style.fontSize = tam + 'px';
    }
  }

  /* Y SE VUELVE A MEDIR CUANDO LLEGA LA LETRA. La familia del rótulo es Baloo 2
     y todavía no está autoalojada: la primera vez se mide con la letra de
     repuesto del sistema, que no ocupa lo mismo, y cuando la de verdad aterriza
     el nombre puede haber crecido. `document.fonts.ready` avisa de eso; donde no
     exista, se mide una vez y ya, que es lo que pasaba hasta ahora. */
  function encajarCuandoLlegueLaLetra(rotulo, texto) {
    encajarRotulo(rotulo, texto);
    if (!document.fonts || !document.fonts.ready) return;
    document.fonts.ready.then(function () {
      if (!rotulo.parentNode) return;
      rotulo.style.fontSize = '';
      encajarRotulo(rotulo, texto);
    });
  }

  function campeonesEnGrande(p, r, entran) {
    var cuantos = entran.length;
    if (!cuantos) return [];

    var figuras = [];
    var piezas = [];
    r.duelo.forEach(function (q, i) {
      if (entran.indexOf(i) === -1) return;
      var izq = i === 0;
      var caja = document.createElement('div');
      caja.className = 'campeon campeon--' + (izq ? 'izq' : 'der') +
                       (cuantos === 2 ? ' campeon--dos' : '');
      caja.setAttribute('aria-hidden', 'true');
      /* La pose también en la caja, no solo en el retrato de dentro: el tamaño
         de la caja depende de ella --`sentado` va más chica-- y desde el
         retrato no se puede cambiar el alto de su contenedor. */
      caja.dataset.pose = poseDeEntrada(r);
      caja.innerHTML = window.ATWI.retrato(q.avatar, poseDeEntrada(r), {
        fondo: null, color: q.color, clase: 'campeon__fig',
        mira: izq ? 'derecha' : 'izquierda'
      });
      p.appendChild(caja);
      figuras.push(caja);
      piezas.push(caja);

      /* EL NOMBRE, ENFRENTE DE ÉL (decisión del titular, 2026-09-14). El
         titular del centro se había quitado porque quedaba detrás de la figura;
         el nombre vuelve, pero al OTRO lado: en el hueco que la figura deja
         libre, a la altura de su cara, que es donde se mira.

         SOLO CUANDO ENTRA UNO. Con dos, ese hueco no existe --lo ocupan ellos--
         y además el titular ya dice lo que hay que decir: «Ambos» con acuerdo,
         «¡Empate!» en el empate. */
      if (cuantos !== 1) return;
      var rotulo = document.createElement('p');
      rotulo.className = 'campeon-n campeon-n--' + (izq ? 'izq' : 'der');
      /* EL COLOR ES EL DEL JUGADOR, el mismo con el que se le vio toda la
         partida: la ropa de su figura, su disco y su columna en la tabla. */
      rotulo.style.setProperty('--pj', window.ATWI.colorPersonaje(q.color));
      var texto = document.createElement('span');
      texto.className = 'campeon-n__t';
      texto.textContent = q.nombre;
      rotulo.appendChild(texto);
      p.appendChild(rotulo);
      piezas.push(rotulo);
      encajarCuandoLlegueLaLetra(rotulo, texto);
    });

    /* Los 40 ms son los mismos del encuentro y hacen falta: el navegador tiene
       que registrar la posición de partida —fuera del lienzo— o la figura
       aparece ya puesta en vez de entrar. */
    setTimeout(function () {
      figuras.forEach(function (c) { c.classList.add('campeon--puesto'); });
    }, 40);
    return piezas;
  }

  function mostrarResultado(p, r) {
    var v = cfg.veredicto;
    var titular, detalle;

    /* TODO VEREDICTO LLEVA EXPLICACIÓN. Regla del titular (2026-09-15), y la
       pantalla la estaba rompiendo: esto era `Boolean(r.juez) && (...)`, así que
       una partida con `debates.juez` en nulo --todas las jugadas antes de que
       hubiera jueces, migración 0027-- salía con «¡Empate!» y el botón de
       Salir, y nada más. Ni por qué, ni quién lo dijo, ni el desglose que SÍ
       estaba guardado. Un resultado sin explicación es peor que no darlo: deja
       a la pareja con un dictamen y sin nada con que discutirlo.

       Ahora depende solo de si hay algo que decir, que es lo que importa, y lo
       hay en los cinco finales: con ganador y en empate se explica la rúbrica,
       en Negociación se presenta el acuerdo o se explica por qué negociar valió
       igual, y en una parada el juez dice en primera persona que eligió no
       puntuar. `juezDeRespaldo()` pone la cara cuando no se guardó ninguna.
       SE CALCULA ANTES QUE EL TEXTO porque de esto depende si la frase de
       debajo se puede quitar: la composición apoya en que esta pantalla dice
       QUÉ pasó y la del juez POR QUÉ. */
    var hayJuez = r.modo === 'negociacion' || Boolean(r.sinResultado) ||
      Boolean(r.loMejor || r.justificacion || r.desglose || r.empate);
    var pie = function (texto) {
      return hayJuez || !texto ? '' : '<p class="revelacion__pie">' + esc(texto) + '</p>';
    };

    /* LA PARADA VA PRIMERO, ANTES QUE EL MODO, y estuvo al revés: como la
       rama de Negociación se preguntaba antes, una parada de seguridad en
       Negociación caía en «Sin acuerdo» y la pantalla decía que no llegaron
       a acordar cuando lo que pasó es que el juez vio algo y eligió no
       trabajar. Una parada es una parada en los dos modos.
       Lo cazó el ensayo de Negociación del probador, que es justo para lo
       que está: ese caso no se alcanza jugando hasta que haya mediador. */
    if (r.sinResultado) {
      /* LAS DOS PARADAS. Sin ganador ni empate, y sin decir por qué: nombrar
         el patrón está prohibido. En la blanda se enseñan los dos párrafos de
         «lo que dijo cada uno», que son lo único compartible, y van en la
         pantalla del juez. Por qué no dice «Empate», que es lo que se pidió:
         ver `cfg.veredicto.sinResultado`. */
      var sr = v.sinResultado || {};
      /* La blanda de Pacto tiene sus textos (S26); la dura es la misma en los dos
         modos, porque la detiene el juego y no quien media o juzga. */
      var neg = r.modo === 'negociacion' && r.sinResultado === 'blanda' ? 'Negociacion' : '';
      titular = sr[r.sinResultado + 'Titular' + neg] || sr[r.sinResultado + 'Titular'] || 'Hoy no hubo partido';
      detalle = pie(sr[r.sinResultado + neg] || sr[r.sinResultado] || '');
    } else if (r.modo === 'negociacion') {
      /* Aquí no gana una persona: o ganan los dos o no gana nadie, y las dos
         figuras lo dicen antes que el texto.

         CON ACUERDO: «Ambos», y nada más (decisión del titular, 2026-09-14).
         Los dos entran grandes desde sus lados, igual que el ganador de
         Controversia, y el titular tiene que caber ENTRE ellos: una palabra. La
         frase que explicaba el acuerdo no se pierde, se fue entera a la pantalla
         del juez, que es quien lo presenta y donde se lee con sitio.

         Y SIN ACUERDO, IGUAL (decisión del titular, 2026-09-14): misma entrada,
         mismo tamaño, misma distancia y el titular en el mismo sitio. Lo único
         que cambia es la pose. Antes eran dos discos chicos y un párrafo, y se
         leía como otra pantalla. */
      /* AQUÍ HUBO UN «RONDA GUARDADA» Y SE FUE (decisión del titular,
         2026-09-15). Era la pantalla de cuando el mediador no contestaba, y no
         era un resultado: era la app avisando de su propia avería con la
         puesta en escena de un final --el cartel grande, los dos avatares
         entrando, el botón de «qué dijo el juez»--. «No contestó» no le dice
         nada a la pareja, y quien lo ve no tiene ni qué pensar ni qué hacer.
         Lo que pasa ahora está en `noContesto()` de `partida.js`: si la llamada
         no llega no se revela nada, la partida se queda en deliberando y se
         ofrece volver a pedirla. Sin veredicto SÍ es una respuesta --el juez
         miró y decidió-- y esa se queda; no contestar no lo es. */
      if (r.acuerdo) {
        titular = (v.ganadorNegociacion && v.ganadorNegociacion[r.publico]) || 'Ambos';
        detalle = '';
      } else {
        titular = v.tituloSinAcuerdo || 'Sin acuerdo';
        detalle = pie(v.sinAcuerdo);
      }
    } else if (r.empate) {
      /* «¡EMPATE!» Y NADA MÁS (decisión del titular, 2026-09-14). Aquí iba la
         frase de `cfg.veredicto.empate`, que explica por cuál de los cuatro
         caminos se llegó; se fue entera a la pantalla del juez, igual que la del
         ganador y la del acuerdo. Las tres pantallas cuentan ahora lo mismo:
         esta enseña QUÉ pasó, y el juez explica POR QUÉ.
         La palabra lleva el signo porque es una celebración: entran los dos con
         el puño arriba y un «Empate» a secas al lado de eso se lee como un
         marcador. */
      titular = '¡Empate!';
      detalle = '';
    } else {
      /* NI NOMBRE NI FRASE EN EL CENTRO (decisión del titular, 2026-09-14): con
         el ganador entrando a pantalla completa, el nombre grande y el «defendió
         mejor su idea» quedaban justo detrás de la figura y competían con ella.
         Quién ganó ya lo dice la figura —es la única que entra, y entra por su
         lado—, y por qué ganó lo dice el juez en la pantalla siguiente, que es
         donde ese texto se lee entero y con la tabla al lado. */
      titular = '';
      detalle = '';
    }

    /* La frase se queda EXACTAMENTE como está: no se toca ni para bajarle la
       opacidad. Volver a pintarla la haría saltar de tamaño y de sitio justo
       después de haberla colocado tramo a tramo, y apagarla destiñe el
       logotipo. El nombre del ganador manda por tamaño, no por contraste
       prestado. */
    /* SE DICE QUE ES DE MENTIRA, y se dice AQUI. El arbitro no existe todavia:
       el ganador sale de un sorteo. Hasta ahora eso solo estaba escrito en un
       comentario del codigo, asi que la unica diferencia entre un veredicto de
       verdad y uno al azar era saberlo, y quien no lo supiera se lo iba a creer.

       En un juego que le dice a una pareja quien argumento mejor, dejar pasar
       eso no es un descuido de aviso: es dejar que alguien use como argumento
       un resultado que tiro una moneda.

       Se va solo: en cuanto el arbitro conteste de verdad, `r.simulado` llega en
       falso y esta linea no se pinta. */
    var entran = losQueEntran(r);
    /* CON DOS FIGURAS ENTRANDO, EL TITULAR SE VISTE DE ETIQUETA. Cae justo entre
       ellas, encima del dibujo, y un texto plano ahí se pierde: lleva el mismo
       borde blanco y la misma sombra que el nombre del ganador. Con una figura
       sola no hace falta --el titular no se pinta-- y sin ninguna tampoco: ahí
       está solo sobre el fondo. */
    var etiqueta = entran.length === 2 ? ' revelacion__ganador--etiqueta' : '';
    var centro = p.querySelector('#rev-centro');
    centro.innerHTML = dueloHTML(r, entran) +
      (titular ? '<p class="revelacion__ganador' + etiqueta + '">' + esc(titular) + '</p>' : '') + detalle +
      (r.simulado
        ? '<p class="revelacion__simulado">Resultado simulado, salido de un sorteo' +
          (r.motivoSimulado ? ': ' + esc(r.motivoSimulado) : '') + '.</p>'
        : '');

    /* EL BOTON LLEVA AL JUEZ. La revelacion enseña QUE paso --las dos caras y
       el titular-- y el juez explica POR QUE. Estuvieron juntos un rato y no
       cabian: el titular con el desglose debajo convertia el clímax del juego
       en una tabla. Sin explicacion que dar --Negociacion, o una parada-- el
       boton guarda y sale, porque abrir una pantalla vacia es peor que no
       abrirla. */
    /* `hayJuez` se calculó arriba, antes que el texto: de él depende si la frase
       de debajo se puede quitar. El de la parada es el que más falta hacía: sin
       esa pantalla se leía como que la app se rompió en vez de como una decisión
       del juez. */
    var abajo = p.querySelector('#rev-abajo');
    /* «Salir» lleva su puerta dibujada (titular, 2026-09-16). Es el único botón
       de esta pantalla que saca de ella, y la palabra sola competía con el
       «Qué dijo el juez» que ocupa el mismo sitio cuando hay juez. */
    var boton = function (accion, texto, ico) {
      return '<button class="boton boton--bloque boton--grande revelacion__boton" ' +
             'data-accion="' + accion + '">' +
             (ico ? window.ATWI.icono(ico, 26) : '') + texto + '</button>';
    };
    /* «Salir» a secas, y no «Guardar y salir» (decisión del titular): el
       resultado YA está guardado --lo escribió el árbitro en `resultados` antes
       de que esta pantalla existiera-- y el botón prometía un guardado que no
       hace. Prometer trabajo que ya está hecho enseña a desconfiar del resto de
       los avisos.

       PERO LA ACCIÓN SE LLAMA `rev-salir`, NO `salir`. El botón dice «Salir» y
       la acción no puede decir lo mismo: `data-accion="salir"` YA ESTÁ TOMADA
       en `app.js` por el «Salir» del perfil, que es CERRAR SESIÓN --tira el
       token, llama a `datos.olvidar()` y recarga en `location.pathname`, o sea
       sin `?local=1`--. Los dos escuchadores son de documento, así que el clic
       del veredicto burbujeaba hasta allí y hacía las dos cosas: cerraba la
       pantalla y de paso borraba el perfil y devolvía a la puerta. Eso es lo
       que el titular veía como «después de probar un resultado me saca y me
       pide entrar otra vez». Y no era solo una molestia: `olvidar()` borra los
       datos locales de verdad.

       Se arregla renombrando la acción, no parando la burbuja: un
       `stopPropagation` deja la colisión puesta para el siguiente que escriba
       un botón aquí. Los verbos genéricos --«salir», «cerrar», «volver»-- se
       prefijan con la pantalla. */
    abajo.innerHTML = hayJuez ? boton('ver-juez', r.modo === 'negociacion' ? 'Qué dijo el mediador' : 'Qué dijo el juez')
                              : boton('rev-salir', r.sinResultado ? 'Entendido' : 'Salir',
                                          r.sinResultado ? '' : 'salir');

    /* LAS SERPENTINAS ESTALLAN CUANDO EL PUÑO LLEGA AL CENTRO, no antes. Salían
       a la vez que el resultado y el ganador aterrizaba medio segundo después,
       sobre un confeti que ya iba cayendo: la explosión no celebraba nada porque
       todavía no había pasado nada. Los 450 ms son el punto de contacto de
       `campeon-izq`/`campeon-der` —el 72 % de sus 620 ms— y si se toca uno hay
       que tocar el otro. Sin campeón —empate, Negociación— sale enseguida, que
       ahí el momento es el titular. */
    var campeones = campeonesEnGrande(p, r, entran);
    /* NI SERPENTINAS EN UNA PARADA: no hay nada que celebrar, y una lluvia de
       confeti sobre una partida que se detuvo es exactamente la clase de
       adorno que hace desconfiar de los que si celebran algo. */
    if (!r.sinResultado) {
      if (campeones.length) {
        setTimeout(function () { if (caja && !caja.hidden) confeti(p, r.modo); }, 450);
      } else confeti(p, r.modo);
    }

    salidaEnCurso = function () {
      salidaEnCurso = null;
      window.ATWI.veredicto.cerrar();
      if (r.alCerrar) r.alCerrar();
    };

    abajo.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-accion]');
      if (!b) return;
      if (b.dataset.accion === 'ver-juez') {
        var c = p.querySelector('.confeti');
        if (c) c.remove();
        /* Los campeones se van con el confeti: la pantalla siguiente es del juez
           y dos figuras grandes a la vez no caben ni cuentan lo mismo. */
        campeones.forEach(function (c) { c.remove(); });
        p.querySelector('#rev-centro').innerHTML = juezExplicaHTML(r);
        juezSuelto(p, r);
        /* El botón se aparta a la izquierda para dejarle la derecha al juez. */
        abajo.classList.add('revelacion__abajo--conjuez');
        abajo.innerHTML = boton('rev-salir', 'Salir', 'salir');
        return;
      }
      if (b.dataset.accion !== 'rev-salir') return;
      /* EL BOTÓN NO CIERRA A MANO: PIDE UN ATRÁS. Al revelar se apila una
         entrada de historial --si no, el atrás del teléfono cerraría la app con
         el resultado en pantalla-- y cerrar por las bravas dejaba esa entrada
         colgada. La siguiente vez que algo consumía historial, el navegador se
         iba de `/app/` y volvía sin `?local=1`, o sea a la puerta: parecía que
         la app te echaba después de probar un resultado. Así hay UNA salida y
         la usan los dos caminos. */
      window.ATWI.veredicto.salir();
    });
    return Promise.resolve();
  }

  /* LA PANTALLA DEL JUEZ. Aparece GRANDE DESDE ABAJO, igual que un personaje
     cuando habla en la sala, con un globo encima donde explica el veredicto.

     POR AHORA SOLO TEXTO (decisión del titular, 2026-09-14). Locutarlo sería
     medio centavo por partida y, lo que importa, entre uno y dos segundos de
     espera justo en el momento más dramático del juego. Queda para decidir.

     LO QUE DICE NO ES UN RESUMEN QUE ESCRIBA ESTA PANTALLA: son los campos que
     el árbitro produjo --qué defendió bien cada uno y los tres criterios que
     más pesaron-- puestos en su boca. La tabla va debajo del globo porque es la
     prueba de lo que acaba de decir: sin los números, «la evidencia inclinó el
     resultado» es una afirmación sin respaldo. */
  function juezExplicaHTML(r) {
    var v = cfg.veredicto;
    var dice = '';

    if (r.sinResultado) {
      /* LA PARADA ANTES QUE EL MODO. Ver `mostrarResultado`.

         Y LLEVA REPORTE, con el mismo peso que la tarjeta de veredicto
         (petición del titular, 2026-09-15, y `docs/02` §594 lo llama
         obligatorio y no se estaba cumpliendo): el juez dice qué hizo, salen
         los dos párrafos de «lo que dijo cada uno» con su rótulo --no sueltos,
         como estaban-- y se cierra diciendo qué pasa con la ronda y PARA QUÉ
         sirve lo que queda guardado. Eso último faltaba entero, y era la mitad
         de la queja: la pantalla conservaba algo sin decir por qué.

         LO QUE NO LLEVA ES EL MOTIVO, y no es un olvido. `docs/02` §13.3 paso 2
         lo prohíbe con todas las letras --«no nombres el patrón, no señales a
         nadie y no expliques el motivo»-- y el esquema marca
         `senales_sometimiento` como «nunca visible, nunca se nombra al
         usuario». La razón está escrita al lado, con su número: el
         meta-análisis de demanda-retirada (74 estudios, N=14.255) mide
         asociación con SATISFACCIÓN Y AJUSTE, no con riesgo de violencia, así
         que las cinco señales no sostienen el diagnóstico que nombrarlas
         implicaría. Y encima lo nombrado se lee: en una app cuyo riesgo central
         documentado es el acta usada como munición, poner una etiqueta sobre
         una de las dos personas es entregarle a la otra con qué. */
      var sr0 = v.sinResultado || {};
      /* EN LA DURA NO HAY REPORTE Y NO PUEDE HABERLO. `docs/02` §389 y §578:
         «ningún veredicto, ningún punto, NINGÚN REGISTRO, mensaje idéntico y
         neutro, pantalla de recursos». El reporte de «lo que dijo cada uno» es
         de la blanda, que es otra cosa --asimetría, no seguridad-- y aquí se
         estaba pintando igual: la pantalla le devolvía a las dos personas un
         resumen de una conversación que la app acababa de decidir que no debía
         quedar guardada. */
      var dura = r.sinResultado === 'dura';
      var dichos = dura ? [] : (r.loQueDijo || []).filter(function (q) { return q.texto; });
      /* EL MEDIADOR HABLA COMO MEDIADOR (S26): en Pacto la blanda lleva su
         frase; la dura es la misma en los dos modos. */
      var frase = dura ? 'diceDura'
                : (r.modo === 'negociacion' && sr0.diceBlandaNegociacion) ? 'diceBlandaNegociacion'
                : 'diceBlanda';
      dice = '<p class="dice__linea">' + esc(sr0[frase] || '') + '</p>' +
             (dichos.length
               ? '<p class="dice__rotulo">' + esc(sr0.rotuloDichos || '') + '</p>' +
                 '<div class="lo-mejor">' + dichos.map(function (q) {
                   return '<p class="lo-mejor__linea"><b>' + esc(q.nombre) + '</b> ' +
                          esc(q.texto) + '</p>';
                 }).join('') + '</div>'
               : '') +
             /* EL CIERRE, que el contrato exige desde la v2.2 del árbitro y la v2.1
                del mediador y que ninguna pantalla enseñaba (S12, S26): es lo
                único de la parada que deja algo que hacer. */
             (!dura && r.cierre
               ? '<p class="dice__rotulo">' + esc(sr0.rotuloCierre || '') + '</p>' +
                 '<p class="dice__linea">' + esc(r.cierre) + '</p>'
               : '') +
             (!dura && sr0.paraQue
               ? '<p class="dice__linea">' + esc(sr0.paraQue) + '</p>' : '') +
             /* SIN PANTALLA DE RECURSOS, Y NO ES QUE FALTE (decisión del titular,
                2026-09-18). `docs/01` §327 y §735 pedían líneas de ayuda por
                país; el titular decidió que la app no da números ni direcciona
                a buscar ayuda --eso es asumir una responsabilidad que no se
                quiere-- y solo dice que el tema no se juzga ni se negocia aquí
                y que lo hablen. Ver `cfg.veredicto.sinResultado.duraCierre`. */
             (dura ? '<p class="dice__linea">' + esc(sr0.duraCierre || '') + '</p>' : '');
    } else if (r.modo === 'negociacion') {
      var n = v.juezNegociacion || {};
      /* El acuerdo se lee con SUS palabras, entrecomillado: lo escribieron
         ellos y el juez solo lo presenta. Las comillas afirman autoría, así que
         solo se ponen cuando hay un texto que la pareja firmó --hasta el
         2026-09-14 estaban puestas alrededor de un párrafo del catálogo--. */
      var queDice = r.acuerdo ? n.conAcuerdo : n.sinAcuerdo;
      dice = (r.acuerdo ? '<p class="dice__acuerdo">«' + esc(r.acuerdo) + '»</p>' : '') +
             '<p class="dice__linea">' + esc(queDice || '') + '</p>';
    } else {
      /* POR QUÉ FUE EMPATE, Y SE DICE AQUÍ PORQUE DEJÓ DE DECIRSE ALLÁ. Esta
         frase vivía debajo del titular de la revelación y se quitó al poner a
         los dos entrando grandes; si no se recogiera aquí desaparecería de la
         app, y no es adorno: al empate se llega por CUATRO caminos que no
         significan lo mismo --parejo, se dio vuelta, nadie sostuvo nada, o el
         genérico-- y felicitar por un empate que fue un desierto es de las pocas
         maneras de ofender con un resultado (ver `cfg.veredicto.empate`). Va la
         primera, antes de lo mejor de cada uno, porque es la respuesta a la
         pregunta con la que se llega a esta pantalla. */
      var e = v.empate || {};
      /* S8 (2026-09-18): LA FORMA DEL DESACUERDO SE DICE. `forma_del_desacuerdo`
         se creó en la v2.0 «para que la pantalla elija qué decir» y la pantalla
         no lo leía: con `de_acuerdo` la pareja solo se enteraba de que
         coincidían si la justificación lo decía, y tres veredictos seguidos
         traían «sin ceder su postura». Va primero: es lo que cambia la lectura
         de todo lo demás. */
      var forma = (v.forma || {})[r.forma] || '';
      dice = (forma ? '<p class="dice__linea dice__linea--forma">' + esc(forma) + '</p>' : '') +
      (r.empate ? '<p class="dice__linea">' +
                         esc(e[r.motivoEmpate] || e.generico || '') + '</p>' : '') +
      (r.loMejor || []).map(function (q) {
        return '<p class="dice__linea"><b>' + esc(q.nombre) + '</b> ' + esc(q.texto) + '</p>';
      }).join('') +
      (r.justificacion ? '<p class="dice__linea">' + esc(r.justificacion) + '</p>' : '');
    }

    return '<div class="juez-dice">' +
      '<div class="juez-dice__globo">' +
        (dice || '<p class="dice__linea">El desglose está abajo.</p>') +
        /* La tabla solo donde hay rúbrica: en Negociación no se puntúa a nadie
           --enseñarla sería convertir el Pacto en un Juicio encubierto, que es
           el fallo de diseño que más hay que evitar-- y en una parada el juez
           no puntuó nada. */
        (r.modo === 'debate' && !r.sinResultado ? tablaHTML(r) : '') +
      '</div>' +
    '</div>';
  }

  /* EL JUEZ NO VA DENTRO DEL CENTRO: se cuelga de la pantalla entera, abajo a la
     derecha, y LO CORTA EL BORDE DE ABAJO en vez de una altura fija. Decisión
     del titular. Es la diferencia entre una figura metida en una caja y alguien
     que está ahí de pie y al que la pantalla no le llega: lo segundo es lo que
     hace que parezca que salió, no que lo pegaron.

     Va a la derecha y asomando por fuera a propósito: recortado por dos lados
     se lee como que hay más juez del que cabe. El botón se queda con la
     izquierda, que es donde ya no hay nadie. */
  function juezSuelto(p, r) {
    var quien = juezDeRespaldo(r);
    var im = document.createElement('img');
    im.className = 'juez-suelto';
    im.src = window.ATWI.piezaJuez(quien, 'veredicto');
    im.alt = window.ATWI.nombrePersonaje(quien);
    p.appendChild(im);
  }

  /* QUIÉN PRESENTA CUANDO NO SE GUARDÓ NINGUNO. Las partidas jugadas antes de
     la migración 0027 tienen `debates.juez` en nulo, y sin esto se quedaban sin
     explicación --ver la nota de `hayJuez`--.

     NO ES UNA MENTIRA SOBRE QUIÉN JUZGÓ, y conviene tenerlo claro: quien puntúa
     es el árbitro, que es un modelo y es el mismo siempre; el juez de la
     pantalla es la CARA que la pareja eligió para que se lo cuente. Poner una
     en una ronda que no la eligió es elegir un presentador, no atribuirle un
     fallo a nadie.

     Y SALE EL MISMO SIEMPRE PARA LA MISMA RONDA. Se saca del identificador del
     debate, no al azar: abrir dos veces el mismo resultado y encontrarse dos
     jueces distintos haría dudar de todo lo demás de la pantalla. */
  function juezDeRespaldo(r) {
    if (r.juez && window.ATWI.esJuez(r.juez)) return r.juez;
    var lista = window.ATWI.jueces ? window.ATWI.jueces() : [];
    if (!lista.length) return 'bruno';
    var semilla = String(r.debate || r.tema || '');
    var n = 0;
    for (var i = 0; i < semilla.length; i++) n = (n * 31 + semilla.charCodeAt(i)) % 100000;
    return lista[n % lista.length].clave;
  }

  /* QUÉ DEFENDIÓ BIEN CADA UNO, y es lo primero que se lee después del titular.
     Decisión del titular (2026-09-14): el resultado decía quién ganó y no decía
     nada de lo que cada persona hizo. En el empate dejaba «empataron» como un
     número sin motivo, y con ganador dejaba a quien perdió sin una sola línea
     que reconociera algo suyo, que es como un veredicto se vuelve munición.
     Las dos frases las escribe el árbitro y nombran lo que cada quien DEFENDIÓ
     bien, nunca si tenía razón. */
  function loMejorHTML(r) {
    if (!r.loMejor || !r.loMejor.length) return '';
    return '<div class="lo-mejor">' + r.loMejor.map(function (q) {
      return q.texto
        ? '<p class="lo-mejor__linea"><b>' + esc(q.nombre) + '</b> ' + esc(q.texto) + '</p>'
        : '';
    }).join('') + '</div>';
  }

  /* LA MINITABLA: los cinco criterios con los dos números, y el total abajo.
     Aquí sí van los dos lado a lado, y no contradice la regla 3 del producto:
     lo que esa regla prohíbe es un MARCADOR ENTRE ELLOS —un acumulado de
     partidas, un Elo—. Esto es el desglose de UNA ronda, que la spec del
     árbitro exige visible siempre porque es el núcleo de la credibilidad del
     modo (docs/02 §13-bis.2), y sin los dos números juntos no se puede ver que
     una ronda quedó reñida. No se resalta quién sacó más en cada criterio: eso
     ya lo dice el total, y pintarlo cinco veces es hacer el marcador. */
  function tablaHTML(r) {
    var v = cfg.veredicto;
    var d = r.desglose;
    if (!d || !d.personas || d.personas.length !== 2) return '';
    var criterios = (v.criterios || []).filter(function (c) {
      return !(d.criterios === 4 && c[0] === 'escucha');
    });
    /* CADA PERSONA EN SU COLOR, el mismo con el que se le ve en la sala y en el
       duelo. Sin eso son dos filas de números y hay que volver a la cabecera
       para saber cuál es de quién. */
    var tono = function (p) {
      return p.color ? window.ATWI.colorPersonaje(p.color) : 'var(--tinta)';
    };
    return '<div class="tabla tabla--ancha">' +
      /* Cabecera: los criterios, cortos. */
      '<div class="tabla__fila tabla__fila--cabeza">' +
        '<span class="tabla__quien"></span>' +
        criterios.map(function (c) {
          /* EL NOMBRE ENTERO. `c[1]`, no el abreviado: en diagonal cabe
             --«Ejemplos» mide 28 px de proyeccion-- y «Ejem.» con punto es
             pedirle a alguien que adivine una palabra para ahorrar cinco
             pixeles que sobran. (Y ojo: `c[2]` es el PESO del criterio; estuvo
             puesto ahi un rato y la cabecera decia «30 25 20 15 10».) */
          return '<span class="tabla__n tabla__eti"><i>' + esc(c[1]) + '</i></span>';
        }).join('') +
        /* «Total» va igual que los demas rotulos: inclinado y centrado sobre
           su columna. Estaba recto y alineado abajo, y era la unica cabecera
           distinta de las seis sin que nada lo justificara. */
        '<span class="tabla__n tabla__n--total tabla__eti"><i>Total</i></span>' +
      '</div>' +
      /* Una fila por persona. */
      d.personas.map(function (p) {
        return '<div class="tabla__fila">' +
          '<span class="tabla__quien" style="color:' + tono(p) + '">' +
            esc(p.nombre) + '</span>' +
          criterios.map(function (c) {
            return '<span class="tabla__n">' +
                   esc(String(Math.round(Number((p.rubrica || {})[c[0]]) || 0))) +
                   '</span>';
          }).join('') +
          '<span class="tabla__n tabla__n--total" style="color:' + tono(p) + '">' +
            esc(String((p.rubrica || {}).total != null ? (p.rubrica || {}).total : '—')) +
          '</span>' +
        '</div>';
      }).join('') +
      (d.criterios === 4 ? '<p class="tabla__nota">' + esc(v.conUnTurno || '') + '</p>' : '') +
    '</div>';
  }

})();
