/* ATWI · minijuegos · «Cuenta»
   ==========================================================================
   NACIÓ COMO EL JUEGO DE MENTIRA DE LA FASE 0 y el titular decidió conservarlo
   (2026-09-21): «me gustaría conservarlo, guárdalo en el catálogo de juegos
   disponibles y lo mejoramos después». Así que es el juego número once, fuera
   del plan de los diez, y el único que ya está publicado para todo el mundo.

   La regla: una cuadrícula de números barajados; se tocan en orden, del 1 al
   último. Tocar uno que no toca es un fallo (cuenta en contra, no es ilegal);
   tocar una casilla que ya se quitó sí es ilegal: eso en pantalla no se puede
   hacer, así que una lista de jugadas que lo traiga no salió de la app.

   ⚠️ Le falta su rótulo dibujado (`juego-cuenta.webp`): está pedido en
   `arte/juegos/PEDIDO-DE-PLANCHAS.md` y mientras tanto el selector enseña la
   diana de aciertos. */
(function (raiz) {
  'use strict';
  raiz.ATWI = raiz.ATWI || {};
  var J = raiz.ATWI.juegos = raiz.ATWI.juegos || Object.create(null);

  /* ⚠️ DIFICULTAD ÚNICA: SIEMPRE LOS 16 (pivote del titular, 2026-09-22: «el de
     contar siempre muestra los 16 cuadritos»). Aquí había tres tableros --3x3,
     3x4 y 4x4-- que se repartían por ronda; lo que gradúa una partida pasa a ser
     cuántas rondas y de qué juegos, no lo grande que sea la cuadrícula.
     Se queda como lista de UNA entrada y no como dos constantes sueltas: el
     contrato de `registrar` pide `niveles`, y así el día que un juego quiera
     variantes no hay que reinventar la forma. */
  var NIVELES = [
    { cols: 4, filas: 4 }
  ];

  function generar(semilla, nivel) {
    var n = NIVELES[nivel] || NIVELES[0];
    var total = n.cols * n.filas;
    var numeros = [];
    for (var i = 1; i <= total; i++) numeros.push(i);
    return { cols: n.cols, filas: n.filas, celdas: J.azar.crear(semilla).barajar(numeros) };
  }

  function inicial(tablero) {
    var quitadas = [];
    for (var i = 0; i < tablero.celdas.length; i++) quitadas.push(false);
    return { tablero: tablero, sig: 1, fallos: 0, quitadas: quitadas };
  }

  function aplicar(estado, jugada) {
    var celdas = estado.tablero.celdas;
    if (typeof jugada !== 'number' || jugada % 1 !== 0) return null;
    if (jugada < 0 || jugada >= celdas.length) return null;
    if (estado.quitadas[jugada]) return null;
    if (celdas[jugada] === estado.sig) {
      estado.quitadas[jugada] = true;
      estado.sig++;
    } else {
      estado.fallos++;
    }
    return estado;
  }

  function fin(estado) {
    return estado.sig > estado.tablero.celdas.length ? { completo: 1 } : null;
  }

  function resumen(estado, ms) {
    var total = estado.tablero.celdas.length;
    return {
      completo: estado.sig > total ? 1 : 0,
      hechas: estado.sig - 1,
      fallos: estado.fallos,
      ms: ms
    };
  }

  function marca(r) {
    return [r.completo, r.hechas, -r.fallos, -r.ms];
  }

  /* El mismo tablero en espejo: izquierda-derecha, arriba-abajo o las dos,
     según la semilla. Los números son los mismos y se tocan en el mismo orden;
     lo que cambia es dónde está cada uno. */
  function gemelo(tablero, semilla) {
    var cual = 1 + J.azar.crear(semilla).entero(3);
    var cols = tablero.cols;
    var filas = tablero.filas;
    var celdas = [];
    for (var f = 0; f < filas; f++) {
      for (var c = 0; c < cols; c++) {
        var ff = (cual & 2) ? filas - 1 - f : f;
        var cc = (cual & 1) ? cols - 1 - c : c;
        celdas.push(tablero.celdas[ff * cols + cc]);
      }
    }
    return { cols: cols, filas: filas, celdas: celdas };
  }

  function resolver(tablero) {
    var donde = [];
    for (var i = 0; i < tablero.celdas.length; i++) donde[tablero.celdas[i] - 1] = i;
    return donde;
  }

  /* Nadie toca más de una docena de casillas por segundo. */
  function pisoMs(tablero) {
    return tablero.celdas.length * 80;
  }

  J.registrar({
    id: 'cuenta',
    nombre: 'Cuenta',
    /* Tiene su rotulo dibujado (titular, 2026-09-22): manda sobre el nombre
       en texto, como el logo del modo en el versus. */
    rotulo: true,
    como: 'Toca los números en orden, del 1 al último. Los fallos restan.',
    compara: 'rondas',
    reintentos: 2,
    topeS: 60,
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
