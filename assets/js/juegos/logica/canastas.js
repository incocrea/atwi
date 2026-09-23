/* ATWI · minijuegos · «Frascos»
   ==========================================================================
   El «Water Sort» del guion, con stickers en vez de agua (docs/10 §8.3). Hay
   seis frascos donde caben cuatro stickers cada uno: cuatro llenos y
   revueltos, y dos vacíos. Se pasa el sticker de ARRIBA de un frasco a otro
   --solo sobre uno vacío o sobre su mismo sticker-- hasta que cada frasco tenga
   uno solo. Gana quien lo logra en menos movimientos.

   UN STICKER POR MOVIMIENTO, no «todo lo igual de golpe» como vierte el agua
   del original: con stickers, verter una pila entera no se entiende --se ven
   cuatro cosas separadas, no un líquido--, y un gesto tiene que mover lo que
   el dedo tocó.

   DIFICULTAD ÚNICA (pivote del 2026-09-22): 4 tipos en 6 frascos. El plan traía
   tres (3 en 5 · 4 en 6 · 5 en 7) y se queda el de en medio, como Calco.
   ⚠️ SIEMPRE DOS VACÍOS, Y ESTÁ MEDIDO: con uno solo --como pinta la infografía--
   se pueden completar 1.452 repartos de 3.000; con dos, los 3.000.

   EL TABLERO LLEVA SU SOLUCIÓN (`sol`), y no por comodidad: el banco exige que
   el tablero y su gemelo se completen en LOS MISMOS movimientos, y un buscador
   que recorre los frascos por orden encuentra caminos de largo distinto cuando
   los frascos cambian de sitio. Guardando la solución del tablero base y
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
    { tipos: 4, frascos: 6, cabe: 4 }
  ];

  /* Cuántos stickers hay en la hoja (`piezas/stickers.js` tiene los nombres).
     Aquí solo hace falta saber de cuántos se elige, porque eso SÍ cambia el
     tablero y tiene que ser igual en el teléfono y en el servidor. */
  var STICKERS = 24;

  /* Una jugada es `desde * F + hasta`. Entera y no un par, por lo mismo que en
     Calco: viaja al servidor y se repite allí, y cuanto menos forma tenga menos
     puede discrepar un JSON de otro. */
  var F = 8;

  /* «Reiniciar» devuelve el tablero como empezó SIN poner a cero los
     movimientos (docs/10 §8.3): es la salida de un callejón --en este juego se
     puede llegar a uno, porque un sticker que se movió no siempre puede volver--
     y no un borrón. Va como una jugada más para que el servidor la repita igual
     que las otras; es un número que ningún movimiento puede dar. */
  var REINICIAR = F * F;

  /* El buscador casi nunca pasa de cien nodos (medido: mediana 19, máximo 89
     en 3.000 repartos). El tope es la red para que un reparto raro no cuelgue
     a nadie: si se pasa, se prueba con la subsemilla siguiente. */
  var TOPE_NODOS = 20000;
  var SUBSEMILLAS = 64;

  /* Por debajo de esto el reparto sale demasiado ordenado: pocos stickers
     tendrían que moverse. Medido, el 5 % de los repartos queda por debajo de 9. */
  var MINIMO_DE_TRABAJO = 9;

  function copia(frascos) {
    var c = [];
    for (var i = 0; i < frascos.length; i++) c.push(frascos[i].slice());
    return c;
  }

  function cima(f) { return f.length ? f[f.length - 1] : -1; }

  /* Cuántos iguales hay arriba del todo. */
  function rachaArriba(f) {
    if (!f.length) return 0;
    var n = 1;
    while (n < f.length && f[f.length - 1 - n] === f[f.length - 1]) n++;
    return n;
  }

  /* Cuántos iguales hay abajo del todo. */
  function rachaAbajo(f) {
    if (!f.length) return 0;
    var n = 1;
    while (n < f.length && f[n] === f[0]) n++;
    return n;
  }

  function lleno(f, cabe) {
    return f.length === cabe && rachaAbajo(f) === cabe;
  }

  function resuelto(frascos, cabe) {
    for (var i = 0; i < frascos.length; i++) {
      if (frascos[i].length && !lleno(frascos[i], cabe)) return false;
    }
    return true;
  }

  function puede(frascos, cabe, d, h) {
    if (d === h || d < 0 || h < 0 || d >= frascos.length || h >= frascos.length) return false;
    var a = frascos[d], b = frascos[h];
    if (!a.length || b.length >= cabe) return false;
    return !b.length || cima(b) === cima(a);
  }

  /* LO MENOS QUE HAY QUE MOVER: todo sticker que tiene debajo uno distinto
     tiene que salir de ahí al menos una vez --por debajo de él no se puede
     tocar nada sin sacarlo antes--. Es un piso de verdad, nunca más que lo
     necesario, y por eso sirve para el piso humano de tiempo. */
  function trabajoMinimo(frascos) {
    var n = 0;
    for (var i = 0; i < frascos.length; i++) n += frascos[i].length - rachaAbajo(frascos[i]);
    return n;
  }

  /* Dos repartos que solo se diferencian en el ORDEN de los frascos son el
     mismo problema: la clave los junta, y eso es lo que deja al buscador en
     decenas de nodos y no en miles. */
  function clave(frascos) {
    var partes = [];
    for (var i = 0; i < frascos.length; i++) partes.push(frascos[i].join(''));
    partes.sort();
    return partes.join('|');
  }

  /* Los movimientos que merece la pena probar, en el orden en que se prueban.
     Van en TRES CUBOS y no con un `sort` con comparador: el orden de los empates
     de un comparador es de cada motor, y el teléfono y el servidor tienen que
     encontrar la misma solución. */
  function candidatos(frascos, cabe) {
    var sobrePuro = [], sobreIgual = [], aVacio = [];
    for (var d = 0; d < frascos.length; d++) {
      var a = frascos[d];
      if (!a.length) continue;
      var puro = rachaArriba(a) === a.length;
      var yaVacio = false;
      for (var h = 0; h < frascos.length; h++) {
        if (!puede(frascos, cabe, d, h)) continue;
        var b = frascos[h];
        if (!b.length) {
          /* Pasar a un vacío algo que ya está solo en su frasco no ordena nada;
             y los vacíos son todos iguales, así que basta con probar uno. */
          if (puro || yaVacio) continue;
          yaVacio = true;
          aVacio.push(d * F + h);
        } else if (rachaArriba(b) === b.length) {
          sobrePuro.push(d * F + h);
        } else {
          sobreIgual.push(d * F + h);
        }
      }
    }
    return sobrePuro.concat(sobreIgual, aVacio);
  }

  /* Búsqueda en profundidad con memoria de lo visto y tope de nodos. No busca
     la solución MÁS CORTA --no hace falta: nadie la ve, y la marca compara lo
     que hizo cada jugador contra lo que hizo el otro--; busca una. */
  function buscar(inicio, cabe) {
    var fr = copia(inicio);
    var visto = Object.create(null);
    var camino = [];
    var nodos = 0;
    function paso() {
      if (resuelto(fr, cabe)) return true;
      nodos++;
      if (nodos > TOPE_NODOS) return false;
      var k = clave(fr);
      if (visto[k]) return false;
      visto[k] = 1;
      var lista = candidatos(fr, cabe);
      for (var i = 0; i < lista.length; i++) {
        var d = Math.floor(lista[i] / F), h = lista[i] % F;
        fr[h].push(fr[d].pop());
        camino.push(lista[i]);
        if (paso()) return true;
        camino.pop();
        fr[d].push(fr[h].pop());
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
    /* QUÉ CUATRO STICKERS SALEN, de los 24: cada ronda trae otros, así que dos
       rondas seguidas de Frascos no se parecen. */
    var fichas = az.barajar(hoja).slice(0, n.tipos);
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
      var frascos = [];
      for (var f = 0; f < n.frascos; f++) {
        frascos.push(f < n.tipos ? mezcla.slice(f * n.cabe, (f + 1) * n.cabe) : []);
      }
      var yaLleno = false;
      for (var q = 0; q < frascos.length; q++) if (lleno(frascos[q], n.cabe)) yaLleno = true;
      if (yaLleno || trabajoMinimo(frascos) < MINIMO_DE_TRABAJO) continue;
      var sol = buscar(frascos, n.cabe);
      ultimo = { fichas: fichas, tipos: n.tipos, cabe: n.cabe, frascos: frascos, sol: sol || [] };
      if (sol) return ultimo;
    }
    /* No pasa --3.000 de 3.000 salen a la primera subsemilla--, pero si pasara
       no se puede devolver un tablero sin solución: se devuelve el último y el
       banco lo cazaría como «el resolvedor no lo completa». */
    return ultimo || { fichas: fichas, tipos: n.tipos, cabe: n.cabe, frascos: [], sol: [] };
  }

  function inicial(tablero) {
    return { tablero: tablero, frascos: copia(tablero.frascos), movimientos: 0 };
  }

  function iguales(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].length !== b[i].length) return false;
      for (var k = 0; k < a[i].length; k++) if (a[i][k] !== b[i][k]) return false;
    }
    return true;
  }

  function aplicar(estado, jugada) {
    if (typeof jugada !== 'number' || jugada % 1 !== 0 || jugada < 0) return null;
    var t = estado.tablero;
    /* Jugar después de haber ordenado el tablero no es una jugada de la app: la
       ronda ya terminó sola. */
    if (resuelto(estado.frascos, t.cabe)) return null;
    if (jugada === REINICIAR) {
      /* Reiniciar un tablero que está como empezó no lo produce la interfaz
         (el botón va apagado): una lista que lo traiga no salió de la app. */
      if (iguales(estado.frascos, t.frascos)) return null;
      estado.frascos = copia(t.frascos);
      return estado;
    }
    var d = Math.floor(jugada / F), h = jugada % F;
    if (!puede(estado.frascos, t.cabe, d, h)) return null;
    estado.frascos[h].push(estado.frascos[d].pop());
    estado.movimientos++;
    return estado;
  }

  function fin(estado) {
    return resuelto(estado.frascos, estado.tablero.cabe) ? { completo: 1 } : null;
  }

  function llenosDe(frascos, cabe) {
    var n = 0;
    for (var i = 0; i < frascos.length; i++) if (lleno(frascos[i], cabe)) n++;
    return n;
  }

  /* `tipos` va en el resumen para que la pantalla diga «2 de 4 frascos» sin
     escribir el 4 a mano: un número copiado de la lógica a la interfaz es el
     que se queda viejo el día que cambia el tablero. */
  function resumen(estado, ms) {
    var t = estado.tablero;
    var completo = resuelto(estado.frascos, t.cabe) ? 1 : 0;
    return {
      completo: completo,
      llenos: llenosDe(estado.frascos, t.cabe),
      tipos: t.tipos,
      movimientos: estado.movimientos,
      ms: ms
    };
  }

  /* ⚠️ LOS FRASCOS LLENOS VAN ANTES QUE LOS MOVIMIENTOS, y es un añadido al plan
     (que decía `[completo, −movimientos, −ms]`): sin ese término, entre dos que
     no terminan ganaría quien MENOS se movió --el que no tocó nada le ganaría al
     que dejó tres frascos hechos--. Cuando los dos terminan valen lo mismo
     (todos llenos) y decide lo del plan: menos movimientos, y después el reloj. */
  function marca(r) {
    return [r.completo, r.llenos, -r.movimientos, -r.ms];
  }

  /* El mismo reparto con los stickers permutados y los frascos llenos en otro
     orden: misma dificultad --los mismos movimientos, uno a uno-- y distinto
     dibujo. Los vacíos se quedan al final en los dos, que es donde se buscan.
     `fichas` NO se toca: los dos ven los mismos cuatro stickers. */
  function gemelo(tablero, semilla) {
    var az = J.azar.crear(semilla);
    var tipos = [];
    for (var i = 0; i < tablero.tipos; i++) tipos.push(i);
    var permuta = az.barajar(tipos);
    var llenosIdx = [], vaciosIdx = [];
    for (var k = 0; k < tablero.frascos.length; k++) {
      if (tablero.frascos[k].length) llenosIdx.push(k); else vaciosIdx.push(k);
    }
    var destinos = az.barajar(llenosIdx.slice()).concat(vaciosIdx);
    /* `pos[viejo]` = dónde queda en el gemelo el frasco que en el base estaba
       en `viejo`. */
    var orden = llenosIdx.concat(vaciosIdx);
    var pos = [];
    for (var p = 0; p < tablero.frascos.length; p++) pos.push(p);
    for (var o = 0; o < orden.length; o++) pos[orden[o]] = destinos[o];
    var frascos = [];
    for (var f = 0; f < tablero.frascos.length; f++) frascos.push([]);
    for (var v = 0; v < tablero.frascos.length; v++) {
      frascos[pos[v]] = tablero.frascos[v].map(function (x) { return permuta[x]; });
    }
    var sol = tablero.sol.map(function (j) {
      return pos[Math.floor(j / F)] * F + pos[j % F];
    });
    return { fichas: tablero.fichas.slice(), tipos: tablero.tipos, cabe: tablero.cabe, frascos: frascos, sol: sol };
  }

  function resolver(tablero) {
    return tablero.sol.slice();
  }

  /* Dos toques por movimiento, con el dedo, no bajan de un cuarto de segundo:
     y como mínimo hay que mover lo que dice `trabajoMinimo`. */
  function pisoMs(tablero) {
    return trabajoMinimo(tablero.frascos) * 250;
  }

  J.registrar({
    id: 'frascos',
    nombre: 'Frascos',
    como: 'Pasa el sticker de arriba de un frasco a otro hasta que cada frasco tenga uno solo. ' +
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
