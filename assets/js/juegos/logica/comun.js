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
  J.VERSION_REGLAS = '0.2';

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
      if (!modulo.niveles || modulo.niveles.length !== 3) {
        throw new Error('juegos: «' + modulo.id + '» necesita sus tres niveles');
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

  /* Qué nivel toca en cada ronda. Con tres rondas se sube la rampa entera; con
     dos, fácil y medio; con una sola, la de en medio —ni un paseo ni un muro—. */
  function nivelDe(rondas, ronda) {
    if (rondas <= 1) return 1;
    var n = ronda - 1;
    return n < 0 ? 0 : (n > 2 ? 2 : n);
  }

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
  function veredicto(id, rondas, dePropone, deInvitado) {
    var m = registro[id];
    if (!m) throw new Error('juegos: no conozco «' + id + '»');
    /* UN JUEGO PUEDE TRAER SU PROPIO VEREDICTO, y hoy solo lo trae Choque: es
       el único cuyo resultado depende de LOS DOS a la vez —fuego contra planta
       no es una marca mayor que otra, es una relación— así que la comparación
       lexicográfica de abajo no puede decidirlo (docs/10 §5.1). */
    if (m.veredicto) return m.veredicto(rondas, dePropone, deInvitado);

    var filas = [];
    var a = 0;
    var b = 0;
    for (var r = 0; r < rondas; r++) {
      var p = dePropone[r] || null;
      var q = deInvitado[r] || null;
      var c = compararMarcas(p && p.marca, q && q.marca);
      if (c > 0) a++;
      if (c < 0) b++;
      filas.push({
        ronda: r + 1,
        propone: p ? p.resumen : null,
        invitado: q ? q.resumen : null,
        gana: c > 0 ? 'propone' : (c < 0 ? 'invitado' : 'empate')
      });
    }

    var hizoA = jugadasDe(dePropone);
    var hizoB = jugadasDe(deInvitado);
    if (!hizoA && !hizoB) return fallo('anulada', null, 'nadie', [0, 0], filas);
    if (!hizoB) return fallo('ganador', 'propone', 'abandono', [a, b], filas);
    if (!hizoA) return fallo('ganador', 'invitado', 'abandono', [a, b], filas);

    if ((m.compara || 'rondas') === 'rondas' && a !== b) {
      return fallo('ganador', a > b ? 'propone' : 'invitado', 'rondas', [a, b], filas);
    }
    var t = compararMarcas(sumarMarcas(dePropone), sumarMarcas(deInvitado));
    if (t === 0) return fallo('empate', null, 'empate', [a, b], filas);
    return fallo('ganador', t > 0 ? 'propone' : 'invitado', 'total', [a, b], filas);
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
})(typeof window !== 'undefined' ? window : globalThis);
