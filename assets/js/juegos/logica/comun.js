/* ATWI · minijuegos · lo que comparten los diez
   ==========================================================================
   Cuatro cosas, y las cuatro existen para que el TELÉFONO y el SERVIDOR no
   puedan discrepar, porque corren literalmente este mismo archivo
   (`tools/logica_al_borde.py` lo pega en la función de borde `juego`):

     · `tablero()`   qué tablero le toca a cada lado. El lado `invitado` ve
                     siempre el GEMELO —el mismo reto en espejo y con los colores
                     cambiados—, para que mirar de reojo al otro no sirva.
     · `repetir()`   vuelve a jugar una lista de jugadas sobre el tablero de
                     verdad. El cliente manda lo que HIZO, nunca su resultado: el
                     resultado sale de aquí, en el servidor.
     · `veredicto()` compara lo de los dos y dice quién gana. El juez no opina:
                     presenta esto.
     · el registro   cada juego se apunta con `registrar()` y tiene que traer el
                     contrato entero; si le falta una pieza, revienta al cargar y
                     no a mitad de una partida.

   LA MARCA. Cada juego reduce una ronda a una lista de enteros donde MAYOR ES
   MEJOR y se compara de izquierda a derecha: `[completo, -movimientos, -ms]`.
   Con eso una sola función cierra los diez juegos sin saber nada de ninguno.
   ⚠️ La primera componente tiene que ser de las que SUMAN a favor (completo,
   puntos, aciertos): es lo que hace que una ronda sin jugar no pueda ganarle el
   desempate por totales a una jugada.

   EL EMPATE ES UN RESULTADO (titular, 2026-09-21). No hay rondas extra ni
   desempates inventados: si lo que se compara sale igual, es `empate`, y la
   partida se vuelve a jugar entera. */
(function (raiz) {
  'use strict';
  raiz.ATWI = raiz.ATWI || {};
  var J = raiz.ATWI.juegos = raiz.ATWI.juegos || Object.create(null);

  /* Sube cada vez que cambie CUALQUIER cosa que altere un tablero, una regla o
     una marca. El cliente la manda en `empezar` y el servidor se niega ANTES de
     arrancar el reloj si no es la suya: un teléfono con el JS viejo generaría
     otro tablero y su ronda se rechazaría después de haberla jugado. */
  /* 0.4: el pivote del 2026-09-22 --dificultad unica-- cambia el tablero de
     Cuenta (siempre 4x4), asi que la version SUBE: con la misma, un telefono
     con el JS de ayer generaria un tablero distinto del que el servidor repite
     y su ronda se rechazaria despues de jugada. */
  /* 0.5: el reparto de colores de Calco se sortea (antes los cuatro
     garantizados caian por orden de lectura y eso regalaba medio juego), asi
     que sus tableros cambian y la version SUBE. */
  J.VERSION_REGLAS = '0.5';

  var MAX_JUGADAS = 600;
  var SAL_DEL_GEMELO = 0x67656D65;      // «geme»: la semilla hija del gemelo

  var registro = Object.create(null);

  /* --- El registro -------------------------------------------------------- */
  var PIEZAS = ['generar', 'inicial', 'aplicar', 'fin', 'resumen', 'marca', 'gemelo', 'resolver'];

  function registrar(modulo) {
    if (!modulo || typeof modulo.id !== 'string' || !modulo.id) {
      throw new Error('juegos: un juego sin id no se puede registrar');
    }
    if (registro[modulo.id]) throw new Error('juegos: «' + modulo.id + '» ya estaba registrado');
    /* Un juego «sin tablero» (Choque: se eligen elementos, no se juega sobre
       nada) trae su propio veredicto y no necesita el resto del contrato. */
    if (modulo.sinTablero) {
      if (typeof modulo.valida !== 'function' || typeof modulo.veredicto !== 'function') {
        throw new Error('juegos: «' + modulo.id + '» es sin tablero y le falta valida() o veredicto()');
      }
    } else {
      /* ⚠️ YA NO SE EXIGEN TRES NIVELES (pivote del titular, 2026-09-22:
         «los juegos tendrán dificultad única; por ejemplo, el de contar siempre
         muestra los 16 cuadritos»). Lo que gradúa una partida es CUÁNTAS
         rondas, no lo difícil que sea cada una. `niveles` sigue admitiéndose
         --un juego puede querer su tabla de parámetros-- pero con una sola
         entrada basta. */
      if (!modulo.niveles || !modulo.niveles.length) {
        throw new Error('juegos: «' + modulo.id + '» necesita al menos un nivel');
      }
      for (var i = 0; i < PIEZAS.length; i++) {
        if (typeof modulo[PIEZAS[i]] !== 'function') {
          throw new Error('juegos: a «' + modulo.id + '» le falta ' + PIEZAS[i] + '()');
        }
      }
    }
    registro[modulo.id] = modulo;
    return modulo;
  }

  function juego(id) {
    return registro[id] || null;
  }

  function ids() {
    return Object.keys(registro).sort();
  }

  /* ⚠️ DIFICULTAD ÚNICA (pivote del titular, 2026-09-22). Aquí había una rampa
     --con tres rondas se subía entera; con dos, fácil y medio-- y se cae: todas
     las rondas de un juego son EL MISMO reto, y lo que gradúa la partida es
     cuántas hay y de qué juegos. Se conserva la función, y no por pereza: la
     llaman la carcasa, la función de borde y `tablero()`, y las tres tienen que
     pedir el mismo nivel o el servidor generaría un tablero distinto del que se
     jugó. Un solo sitio que devuelve 0 es más seguro que quitar el parámetro de
     cinco firmas a la vez. */
  function nivelDe() { return 0; }

  /* --- El tablero de cada lado -------------------------------------------- */
  function tablero(id, semilla, nivel, lado) {
    var m = registro[id];
    if (!m || m.sinTablero) return null;
    var base = m.generar(semilla >>> 0, nivel);
    if (lado === 'invitado') return m.gemelo(base, J.azar.mezclar(semilla >>> 0, SAL_DEL_GEMELO));
    return base;
  }

  /* --- Repetir las jugadas ------------------------------------------------ */
  function salida(ok, motivo, en, resumen, marca, sospechosa) {
    return { ok: ok, motivo: motivo, en: en, resumen: resumen, marca: marca, sospechosa: sospechosa };
  }

  /* `ms` es el tiempo que cuenta (en el servidor, el oficial). Devuelve
     `ok: false` si las jugadas no se pueden haber hecho sobre ese tablero. Una
     ronda sin terminar NO es un fallo: es una ronda con `completo = 0`. */
  function repetir(id, semilla, nivel, lado, jugadas, ms) {
    var m = registro[id];
    if (!m || m.sinTablero) return salida(false, 'juego', -1, null, null, false);
    if (!jugadas || typeof jugadas.length !== 'number' || jugadas.length > (m.maxJugadas || MAX_JUGADAS)) {
      return salida(false, 'jugadas', -1, null, null, false);
    }
    var t = tablero(id, semilla, nivel, lado);
    var estado = m.inicial(t);
    for (var i = 0; i < jugadas.length; i++) {
      if (m.fin(estado)) return salida(false, 'sobran', i, null, null, false);
      var sig = m.aplicar(estado, jugadas[i]);
      if (sig === null || sig === undefined) return salida(false, 'ilegal', i, null, null, false);
      estado = sig;
    }
    var tiempo = Math.max(0, Math.floor(Number(ms) || 0));
    var resumen = m.resumen(estado, tiempo);
    var marca = m.marca(resumen);
    /* Por debajo del piso humano nadie juega tan rápido: no se rechaza aquí
       —lo decide quien llama— pero se dice. */
    var piso = typeof m.pisoMs === 'function' ? m.pisoMs(t) : 0;
    var sospechosa = Boolean(resumen.completo) && tiempo < piso;
    return salida(true, '', -1, resumen, marca, sospechosa);
  }

  /* --- Comparar ----------------------------------------------------------- */
  /* 1 si gana `a`, -1 si gana `b`, 0 si van iguales. Una marca nula es una
     ronda sin jugar: pierde contra cualquiera que sí se jugó. */
  function compararMarcas(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    var n = Math.max(a.length, b.length);
    for (var i = 0; i < n; i++) {
      var x = Number(a[i]) || 0;
      var y = Number(b[i]) || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  function sumarMarcas(rondas) {
    var suma = [];
    for (var i = 0; i < rondas.length; i++) {
      var marca = rondas[i] && rondas[i].marca;
      if (!marca) continue;
      for (var k = 0; k < marca.length; k++) suma[k] = (suma[k] || 0) + (Number(marca[k]) || 0);
    }
    return suma;
  }

  function jugadasDe(rondas) {
    var n = 0;
    for (var i = 0; i < rondas.length; i++) if (rondas[i] && rondas[i].marca) n++;
    return n;
  }

  function fallo(tipo, ganador, como, marcador, filas) {
    return { tipo: tipo, ganador: ganador, como: como, marcador: marcador, rondas: filas };
  }

  /* `dePropone` y `deInvitado` son listas de `rondas` casillas; cada una trae
     `{ marca, resumen }` de la ronda ENVIADA, o nulo si esa ronda no se jugó.

     Devuelve `tipo`: 'ganador' | 'empate' | 'anulada', y `como`:
       'rondas'   ganó más rondas
       'total'    empataron en rondas (o el juego compara por total) y decidió la suma
       'abandono' el otro no envió ni una ronda
       'empate'   todo igual: resultado válido, se vuelve a jugar entera
       'nadie'    nadie envió nada: la partida no existió */
  /* QUIÉN GANA UNA RONDA, con el juego DE ESA RONDA. Un juego puede traer su
     propio `ronda(p, q)` --Choque lo hace: fuego contra planta no es una marca
     mayor que otra, es una relación-- y si no, se comparan las marcas. */
  function ganadorDeRonda(id, p, q) {
    var m = registro[id];
    if (m && typeof m.ronda === 'function') return m.ronda(p, q);
    var c = compararMarcas(p && p.marca, q && q.marca);
    return {
      gana: c > 0 ? 'propone' : (c < 0 ? 'invitado' : 'empate'),
      propone: p ? p.resumen : null,
      invitado: q ? q.resumen : null
    };
  }

  /* ⚠️ EL VEREDICTO RECORRE RONDAS, Y CADA UNA PUEDE SER DE OTRO JUEGO (pivote
     del titular, 2026-09-22). `juegos` es la lista de ids, uno por ronda.
     Se admite todavía la firma vieja --`veredicto(id, rondas, a, b)`-- para no
     tener que migrar de golpe a la función de borde y al banco.

     ⚠️ Y CON JUEGOS MEZCLADOS NO HAY DESEMPATE POR MARCA TOTAL: sumar los
     segundos de Cuenta con los elementos de Choque no significa nada. El total
     solo desempata cuando TODAS las rondas son del mismo juego; si no, empatar
     en rondas es empatar. */
  function veredicto(juegos, dePropone, deInvitado) {
    if (typeof juegos === 'string') {
      var cuantas = arguments[1];
      var lista = [];
      for (var k = 0; k < cuantas; k++) lista.push(juegos);
      return veredicto(lista, arguments[2], arguments[3]);
    }
    if (!juegos || !juegos.length) throw new Error('juegos: el veredicto necesita la lista de rondas');
    for (var v = 0; v < juegos.length; v++) {
      if (!registro[juegos[v]]) throw new Error('juegos: no conozco «' + juegos[v] + '»');
    }

    var filas = [];
    var a = 0;
    var b = 0;
    for (var r = 0; r < juegos.length; r++) {
      var p = dePropone[r] || null;
      var q = deInvitado[r] || null;
      var res = ganadorDeRonda(juegos[r], p, q);
      if (res.gana === 'propone') a++;
      if (res.gana === 'invitado') b++;
      filas.push({
        ronda: r + 1,
        juego: juegos[r],
        propone: res.propone,
        invitado: res.invitado,
        gana: res.gana,
        frase: res.frase || ''
      });
    }

    var hizoA = jugadasDe(dePropone);
    var hizoB = jugadasDe(deInvitado);
    if (!hizoA && !hizoB) return fallo('anulada', null, 'nadie', [0, 0], filas);
    if (!hizoB) return fallo('ganador', 'propone', 'abandono', [a, b], filas);
    if (!hizoA) return fallo('ganador', 'invitado', 'abandono', [a, b], filas);

    /* ⚠️ `compara: 'total'` SIGUE MANDANDO, Y SOLO EN PARTIDA HOMOGÉNEA. Un juego
       puede declarar que lo que cuenta es la marca sumada y no cuántas rondas se
       llevó --lo comprueba el banco--, pero eso únicamente significa algo si
       TODAS las rondas son suyas: sumar los segundos de Cuenta con los elementos
       de Choque no da un número que quiera decir nada. Con juegos mezclados, lo
       que hay son rondas ganadas. */
    var unico = juegos.every(function (x) { return x === juegos[0]; }) ? registro[juegos[0]] : null;
    var porTotal = unico && (unico.compara || 'rondas') === 'total';

    if (!porTotal && a !== b) {
      return fallo('ganador', a > b ? 'propone' : 'invitado', 'rondas', [a, b], filas);
    }
    if (unico && typeof unico.ronda !== 'function') {
      var t = compararMarcas(sumarMarcas(dePropone), sumarMarcas(deInvitado));
      if (t !== 0) return fallo('ganador', t > 0 ? 'propone' : 'invitado', 'total', [a, b], filas);
    }
    if (a !== b) return fallo('ganador', a > b ? 'propone' : 'invitado', 'rondas', [a, b], filas);
    return fallo('empate', null, 'empate', [a, b], filas);
  }

  J.registrar = registrar;
  J.juego = juego;
  J.ids = ids;
  J.nivelDe = nivelDe;
  J.tablero = tablero;
  J.repetir = repetir;
  J.compararMarcas = compararMarcas;
  J.sumarMarcas = sumarMarcas;
  J.veredicto = veredicto;
  J.ganadorDeRonda = ganadorDeRonda;
})(typeof window !== 'undefined' ? window : globalThis);
