/* ATWI · minijuegos · «Canastas»
   ==========================================================================
   El «Water Sort» del guion, con cajas apiladas en vez de agua (docs/10 §8.3).
   Hay seis torres donde caben cuatro cajas cada una: cuatro llenas y
   revueltas, y dos vacías. Se arrastra la caja de ARRIBA de una torre a otra
   --solo a una vacía o encima de una caja igual-- hasta que cada torre tenga
   cajas iguales. Gana quien lo logra en menos movimientos.

   SE LLAMÓ «FRASCOS» HASTA EL 2026-09-22 (titular: «ya no se llamará frascos,
   se llamará canastas; ya no usaremos los tubos de cristal sino cajas
   stackeadas»). El id cambió con el nombre --el id ES el nombre en los diez,
   para que no nazca otra pareja como `debate` ↔ «Controversia»--, y la base lo
   sigue en la migración 0087. La regla del juego no cambió: solo el dibujo y el
   gesto, que ahora es arrastrar.

   UN TIPO ES UNA CAJA DE COLOR CON UN STICKER DENTRO, y los dos salen al azar
   según la partida: cuatro de las seis cajas de la plancha (`cajas`) y cuatro
   de los 24 stickers (`fichas`), emparejados por su índice. Que se distingan por
   dos vías --color y dibujo-- es lo que deja jugar rápido sin confundirse.

   ⚠️ UN MOVIMIENTO SE LLEVA TODAS LAS IGUALES DE ARRIBA (titular, 2026-09-22:
   «si son del mismo tipo debería poder arrastrar varias cajas stackeadas a la
   vez y, si el destino permite el movimiento, moverlas todas juntas»). Aquí
   decía lo contrario --una caja por movimiento--. Si en el destino no caben
   todas, pasan LAS QUE QUEPAN, como el agua del original: «todas o ninguna»
   prohibiría la jugada más común de todas, la que termina una torre a la que
   le falta una. Y cuenta como UN movimiento, que es lo que lo hace valer.

   DIFICULTAD ÚNICA (pivote del 2026-09-22): 4 tipos en 6 torres. El plan traía
   tres (3 en 5 · 4 en 6 · 5 en 7) y se queda el de en medio, como Calco.
   ⚠️ SIEMPRE DOS VACÍAS, Y ESTÁ MEDIDO: con una sola --como pinta la
   infografía-- se pueden completar 1.452 repartos de 3.000; con dos, los 3.000.

   EL TABLERO LLEVA SU SOLUCIÓN (`sol`), y no por comodidad: el banco exige que
   el tablero y su gemelo se completen en LOS MISMOS movimientos, y un buscador
   que recorre las torres por orden encuentra caminos de largo distinto cuando
   las torres cambian de sitio. Guardando la solución del tablero base y
   pasándola por la misma permutación que el gemelo, la igualdad sale por
   construcción. No regala nada que no estuviera ya: `resolver()` es parte del
   contrato de todos los juegos y está en este mismo archivo (docs/10 §6 acepta
   el resolvedor con segunda pantalla).

   Y LO QUE SE GUARDA SON LAS JUGADAS, no el tablero final: `desde * 8 + hasta`,
   y el servidor las repite. */
(function (raiz) {
  'use strict';
  raiz.ATWI = raiz.ATWI || {};
  var J = raiz.ATWI.juegos = raiz.ATWI.juegos || Object.create(null);

  var NIVELES = [
    { tipos: 4, torres: 6, cabe: 4 }
  ];

  /* Cuántos stickers hay en la hoja (`piezas/stickers.js` tiene los nombres) y
     cuántas cajas de color en la plancha (`ui/canastas.js`). Aquí solo hace
     falta saber de cuántos se elige, porque eso SÍ cambia el tablero y tiene
     que ser igual en el teléfono y en el servidor. */
  var STICKERS = 24;
  var CAJAS = 6;

  /* Una jugada es `desde * F + hasta`. Entera y no un par, por lo mismo que en
     Calco: viaja al servidor y se repite allí, y cuanto menos forma tenga menos
     puede discrepar un JSON de otro. */
  var F = 8;

  /* ⚠️ NO HAY «REINICIAR» (titular, 2026-09-22: «quítale también el botón de
     reiniciar»). El plan lo traía --volver al tablero de salida sin poner a
     cero los movimientos-- y estuvo unas horas como la jugada 64. Se quita
     también de aquí y no solo el botón: una jugada que la pantalla ya no puede
     producir no la tiene que aceptar el servidor. El precio, a sabiendas: en
     este juego se puede llegar a un callejón --una caja que se movió no siempre
     puede volver-- y sin «Reiniciar» se paga con el reloj. */

  /* El buscador casi nunca pasa de cien nodos (medido: mediana 19, máximo 89
     en 3.000 repartos). El tope es la red para que un reparto raro no cuelgue
     a nadie: si se pasa, se prueba con la subsemilla siguiente. */
  var TOPE_NODOS = 20000;
  var SUBSEMILLAS = 64;

  /* Por debajo de esto el reparto sale demasiado ordenado: pocas cajas
     tendrían que moverse. Medido, el 5 % de los repartos queda por debajo de 9. */
  var MINIMO_DE_TRABAJO = 9;

  function copia(torres) {
    var c = [];
    for (var i = 0; i < torres.length; i++) c.push(torres[i].slice());
    return c;
  }

  function cima(t) { return t.length ? t[t.length - 1] : -1; }

  /* Cuántas iguales hay arriba del todo. */
  function rachaArriba(t) {
    if (!t.length) return 0;
    var n = 1;
    while (n < t.length && t[t.length - 1 - n] === t[t.length - 1]) n++;
    return n;
  }

  /* Cuántas iguales hay abajo del todo. */
  function rachaAbajo(t) {
    if (!t.length) return 0;
    var n = 1;
    while (n < t.length && t[n] === t[0]) n++;
    return n;
  }

  function completa(t, cabe) {
    return t.length === cabe && rachaAbajo(t) === cabe;
  }

  function resuelto(torres, cabe) {
    for (var i = 0; i < torres.length; i++) {
      if (torres[i].length && !completa(torres[i], cabe)) return false;
    }
    return true;
  }

  /* Cuántas cajas se lleva un movimiento de `d` a `h`: todas las iguales de
     arriba de `d`, o las que quepan en `h`. */
  function cuantasVan(torres, cabe, d, h) {
    return Math.min(rachaArriba(torres[d]), cabe - torres[h].length);
  }

  function mover(torres, cabe, d, h) {
    var n = cuantasVan(torres, cabe, d, h);
    for (var i = 0; i < n; i++) torres[h].push(torres[d].pop());
    return n;
  }

  function puede(torres, cabe, d, h) {
    if (d === h || d < 0 || h < 0 || d >= torres.length || h >= torres.length) return false;
    var a = torres[d], b = torres[h];
    if (!a.length || b.length >= cabe) return false;
    return !b.length || cima(b) === cima(a);
  }

  /* CUÁNTAS CAJAS ESTÁN FUERA DE SITIO: toda caja que tiene debajo una distinta
     tiene que salir de ahí al menos una vez --por debajo de ella no se puede
     tocar nada sin sacarla antes--. Mide lo revuelto que está un reparto, y es
     lo que descarta los que salen demasiado ordenados. */
  function trabajoMinimo(torres) {
    var n = 0;
    for (var i = 0; i < torres.length; i++) n += torres[i].length - rachaAbajo(torres[i]);
    return n;
  }

  /* Dos repartos que solo se diferencian en el ORDEN de las torres son el
     mismo problema: la clave los junta, y eso es lo que deja al buscador en
     decenas de nodos y no en miles. */
  /* LO MENOS QUE HAY QUE MOVER, EN MOVIMIENTOS: desde que un movimiento se lleva
     todas las iguales de arriba, cada TRAMO de iguales que está encima de una
     distinta necesita al menos uno --un movimiento solo coge un tramo, el de
     arriba de una torre--. Es un piso de verdad y sirve para el piso humano. */
  function tramosFuera(torres) {
    var n = 0;
    for (var i = 0; i < torres.length; i++) {
      var t = torres[i];
      for (var k = rachaAbajo(t); k < t.length; k++) {
        if (k === rachaAbajo(t) || t[k] !== t[k - 1]) n++;
      }
    }
    return n;
  }

  function clave(torres) {
    var partes = [];
    for (var i = 0; i < torres.length; i++) partes.push(torres[i].join(''));
    partes.sort();
    return partes.join('|');
  }

  /* Los movimientos que merece la pena probar, en el orden en que se prueban.
     Van en TRES CUBOS y no con un `sort` con comparador: el orden de los empates
     de un comparador es de cada motor, y el teléfono y el servidor tienen que
     encontrar la misma solución. */
  function candidatos(torres, cabe) {
    var sobrePura = [], sobreIgual = [], aVacia = [];
    for (var d = 0; d < torres.length; d++) {
      var a = torres[d];
      if (!a.length) continue;
      var pura = rachaArriba(a) === a.length;
      var yaVacia = false;
      for (var h = 0; h < torres.length; h++) {
        if (!puede(torres, cabe, d, h)) continue;
        var b = torres[h];
        if (!b.length) {
          /* Pasar a una vacía algo que ya está solo en su torre no ordena nada;
             y las vacías son todas iguales, así que basta con probar una. */
          if (pura || yaVacia) continue;
          yaVacia = true;
          aVacia.push(d * F + h);
        } else if (rachaArriba(b) === b.length) {
          sobrePura.push(d * F + h);
        } else {
          sobreIgual.push(d * F + h);
        }
      }
    }
    return sobrePura.concat(sobreIgual, aVacia);
  }

  /* Búsqueda en profundidad con memoria de lo visto y tope de nodos. No busca
     la solución MÁS CORTA --no hace falta: nadie la ve, y la marca compara lo
     que hizo cada jugador contra lo que hizo el otro--; busca una. */
  function buscar(inicio, cabe) {
    var tt = copia(inicio);
    var visto = Object.create(null);
    var camino = [];
    var nodos = 0;
    function paso() {
      if (resuelto(tt, cabe)) return true;
      nodos++;
      if (nodos > TOPE_NODOS) return false;
      var k = clave(tt);
      if (visto[k]) return false;
      visto[k] = 1;
      var lista = candidatos(tt, cabe);
      for (var i = 0; i < lista.length; i++) {
        var d = Math.floor(lista[i] / F), h = lista[i] % F;
        /* Con la regla del juego: se lleva todas las iguales de arriba, o las
           que quepan. Si el buscador moviera de una en una, su solución no se
           podría repetir con la regla de verdad. */
        var n = mover(tt, cabe, d, h);
        camino.push(lista[i]);
        if (paso()) return true;
        camino.pop();
        for (var u = 0; u < n; u++) tt[d].push(tt[h].pop());
      }
      return false;
    }
    return paso() ? camino.slice() : null;
  }

  function generar(semilla, nivel) {
    var n = NIVELES[nivel] || NIVELES[0];
    var az = J.azar.crear(semilla);
    var hoja = [];
    for (var s = 0; s < STICKERS; s++) hoja.push(s);
    /* QUÉ CUATRO STICKERS SALEN, de los 24, y en QUÉ CUATRO CAJAS, de las seis:
       cada ronda trae otras, así que dos rondas seguidas de Canastas no se
       parecen. Las cajas se sortean DESPUÉS de los stickers con el mismo
       generador, así que los stickers de una semilla son los mismos que tenía
       cuando esto se llamaba Frascos. */
    var fichas = az.barajar(hoja).slice(0, n.tipos);
    var colores = [];
    for (var c = 0; c < CAJAS; c++) colores.push(c);
    var cajas = az.barajar(colores).slice(0, n.tipos);
    var bolsa = [];
    for (var t = 0; t < n.tipos; t++) {
      for (var k = 0; k < n.cabe; k++) bolsa.push(t);
    }
    var ultimo = null;
    /* EL REPARTO SE PRUEBA CON SUBSEMILLAS: si sale demasiado ordenado o el
       buscador no lo cierra, se baraja con la siguiente. Es determinista --la
       subsemilla sale de la semilla y del número de intento--, así que el
       teléfono y el servidor llegan al mismo tablero por el mismo camino. */
    for (var intento = 0; intento < SUBSEMILLAS; intento++) {
      var mezcla = J.azar.crear(J.azar.mezclar(semilla, intento + 1)).barajar(bolsa);
      var torres = [];
      for (var f = 0; f < n.torres; f++) {
        torres.push(f < n.tipos ? mezcla.slice(f * n.cabe, (f + 1) * n.cabe) : []);
      }
      var yaCompleta = false;
      for (var q = 0; q < torres.length; q++) if (completa(torres[q], n.cabe)) yaCompleta = true;
      if (yaCompleta || trabajoMinimo(torres) < MINIMO_DE_TRABAJO) continue;
      var sol = buscar(torres, n.cabe);
      ultimo = { fichas: fichas, cajas: cajas, tipos: n.tipos, cabe: n.cabe, torres: torres, sol: sol || [] };
      if (sol) return ultimo;
    }
    /* No pasa --3.000 de 3.000 salen a la primera subsemilla--, pero si pasara
       no se puede devolver un tablero sin solución: se devuelve el último y el
       banco lo cazaría como «el resolvedor no lo completa». */
    return ultimo || { fichas: fichas, cajas: cajas, tipos: n.tipos, cabe: n.cabe, torres: [], sol: [] };
  }

  function inicial(tablero) {
    return { tablero: tablero, torres: copia(tablero.torres), movimientos: 0 };
  }

  function aplicar(estado, jugada) {
    if (typeof jugada !== 'number' || jugada % 1 !== 0 || jugada < 0) return null;
    var t = estado.tablero;
    /* Jugar después de haber ordenado el tablero no es una jugada de la app: la
       ronda ya terminó sola. */
    if (resuelto(estado.torres, t.cabe)) return null;
    var d = Math.floor(jugada / F), h = jugada % F;
    if (!puede(estado.torres, t.cabe, d, h)) return null;
    mover(estado.torres, t.cabe, d, h);
    estado.movimientos++;
    return estado;
  }

  function fin(estado) {
    return resuelto(estado.torres, estado.tablero.cabe) ? { completo: 1 } : null;
  }

  function completasDe(torres, cabe) {
    var n = 0;
    for (var i = 0; i < torres.length; i++) if (completa(torres[i], cabe)) n++;
    return n;
  }

  /* `tipos` va en el resumen para que la pantalla diga «2 de 4 torres» sin
     escribir el 4 a mano: un número copiado de la lógica a la interfaz es el
     que se queda viejo el día que cambia el tablero. */
  function resumen(estado, ms) {
    var t = estado.tablero;
    return {
      completo: resuelto(estado.torres, t.cabe) ? 1 : 0,
      completas: completasDe(estado.torres, t.cabe),
      tipos: t.tipos,
      movimientos: estado.movimientos,
      ms: ms
    };
  }

  /* ⚠️ LAS TORRES COMPLETAS VAN ANTES QUE LOS MOVIMIENTOS, y es un añadido al
     plan (que decía `[completo, −movimientos, −ms]`): sin ese término, entre dos
     que no terminan ganaría quien MENOS se movió --el que no tocó nada le
     ganaría al que dejó tres torres hechas--. Cuando los dos terminan valen lo
     mismo (todas completas) y decide lo del plan: menos movimientos, y después
     el reloj. */
  function marca(r) {
    return [r.completo, r.completas, -r.movimientos, -r.ms];
  }

  /* El mismo reparto con los tipos permutados y las torres llenas en otro
     orden: misma dificultad --los mismos movimientos, uno a uno-- y distinto
     dibujo. Las vacías se quedan al final en los dos, que es donde se buscan.
     `fichas` y `cajas` NO se tocan: los dos ven las mismas cuatro cajas con los
     mismos cuatro stickers, en otros sitios. */
  function gemelo(tablero, semilla) {
    var az = J.azar.crear(semilla);
    var tipos = [];
    for (var i = 0; i < tablero.tipos; i++) tipos.push(i);
    var permuta = az.barajar(tipos);
    var llenas = [], vacias = [];
    for (var k = 0; k < tablero.torres.length; k++) {
      if (tablero.torres[k].length) llenas.push(k); else vacias.push(k);
    }
    var destinos = az.barajar(llenas.slice()).concat(vacias);
    /* `pos[vieja]` = dónde queda en el gemelo la torre que en el base estaba
       en `vieja`. */
    var orden = llenas.concat(vacias);
    var pos = [];
    for (var p = 0; p < tablero.torres.length; p++) pos.push(p);
    for (var o = 0; o < orden.length; o++) pos[orden[o]] = destinos[o];
    var torres = [];
    for (var f = 0; f < tablero.torres.length; f++) torres.push([]);
    for (var v = 0; v < tablero.torres.length; v++) {
      torres[pos[v]] = tablero.torres[v].map(function (x) { return permuta[x]; });
    }
    var sol = tablero.sol.map(function (j) {
      return pos[Math.floor(j / F)] * F + pos[j % F];
    });
    return {
      fichas: tablero.fichas.slice(), cajas: tablero.cajas.slice(),
      tipos: tablero.tipos, cabe: tablero.cabe, torres: torres, sol: sol
    };
  }

  function resolver(tablero) {
    return tablero.sol.slice();
  }

  /* Arrastrar de una torre a otra, con el dedo, no baja de un cuarto de
     segundo; y como mínimo hay tantos movimientos como `tramosFuera`. */
  function pisoMs(tablero) {
    return tramosFuera(tablero.torres) * 250;
  }

  J.registrar({
    id: 'canastas',
    nombre: 'Canastas',
    /* Tiene su rótulo dibujado (titular, 2026-09-22): manda sobre el nombre en
       texto, como el logo del modo en el versus. */
    rotulo: true,
    como: 'Arrastra la caja de arriba de una torre a otra --si hay varias iguales encima, van juntas-- ' +
          'hasta que cada torre tenga cajas iguales. ' +
          'Gana quien lo logra en menos movimientos.',
    compara: 'rondas',
    reintentos: 2,
    /* 60 S Y NO LOS 120 DEL PLAN: la solución que encuentra el buscador ronda
       los 17 movimientos (p95: 22), o sea medio minuto a ritmo tranquilo. Con dos
       minutos se podía ir probando a ciegas hasta que saliera, que es lo mismo
       que llevó a Calco de 30 a 15 s. Es una perilla: se cambia aquí. */
    topeS: 60,
    /* ⚠️ EN PRUEBAS: solo lo ve quien puede probar, hasta que el titular lo
       cierre. La base lo rechaza igual para cualquier otra cuenta
       (`juego_en_pruebas()`), pero sin esta marca el globo de «¿a qué juegan?»
       se lo ofrecía a todo el mundo y la partida moría al crearse. CERRAR EL
       JUEGO SON DOS COSAS: quitar esta línea y la migración que lo saca de
       `juego_en_pruebas()`. */
    soloPruebas: true,
    maxJugadas: 400,
    niveles: NIVELES,
    generar: generar,
    inicial: inicial,
    aplicar: aplicar,
    fin: fin,
    resumen: resumen,
    marca: marca,
    gemelo: gemelo,
    resolver: resolver,
    pisoMs: pisoMs
  });
})(typeof window !== 'undefined' ? window : globalThis);
