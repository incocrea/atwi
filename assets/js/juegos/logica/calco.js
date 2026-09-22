/* ATWI · minijuegos · «Calco»
   ==========================================================================
   Sale un patrón de colores sobre una cuadrícula, se mira unos segundos, se
   esconde, y hay que calcarlo de memoria: tocar un color, tocar una celda.
   Tocar otra vez la misma celda la borra. El reloj empieza cuando el patrón se
   esconde, no antes (docs/10 §8.2).

   DIFICULTAD ÚNICA (pivote del titular, 2026-09-22): 4×4 con 7 celdas y 4
   colores. El plan traía tres niveles; se queda el de en medio, y el motivo es
   que los otros dos miden otra cosa: con 5 celdas se calca sin esfuerzo y con 9
   en 5×5 la ronda la decide la memoria bruta y no la atención.

   ⚠️ CADA COLOR LLEVA ADEMÁS UNA FORMA, y no es decoración: la pista no puede
   depender solo del color (docs/10 §10, punto 6). La forma vive en la interfaz;
   aquí lo que se guarda es el índice, y el índice ES la forma.

   LO QUE SE GUARDA ES LA CUADRÍCULA FINAL, no los aciertos: el resultado lo
   saca el servidor repitiendo las jugadas sobre el patrón de verdad. El cliente
   manda lo que HIZO. */
(function (raiz) {
  'use strict';
  raiz.ATWI = raiz.ATWI || {};
  var J = raiz.ATWI.juegos = raiz.ATWI.juegos || Object.create(null);

  var NIVELES = [
    { cols: 4, filas: 4, pintadas: 7, colores: 4, muestraMs: 3000 }
  ];

  var VACIA = -1;

  /* Una jugada es un entero: `celda * PASOS + k`, con k = 0 borrar y k = 1..4
     pintar del color k-1. Entero y no objeto porque esta lista viaja al
     servidor y se repite allí: cuanto menos forma tenga, menos puede discrepar
     un JSON de otro. */
  var PASOS = 5;

  function celdaDe(jugada) { return Math.floor(jugada / PASOS); }
  function colorDe(jugada) { return (jugada % PASOS) - 1; }   // -1 = borrar

  function generar(semilla, nivel) {
    var n = NIVELES[nivel] || NIVELES[0];
    var az = J.azar.crear(semilla);
    var total = n.cols * n.filas;
    var todas = [];
    for (var i = 0; i < total; i++) todas.push(i);
    var elegidas = az.barajar(todas).slice(0, n.pintadas);
    var patron = [];
    for (var c = 0; c < total; c++) patron.push(VACIA);
    /* ⚠️ LOS CUATRO COLORES SALEN TODOS, y eso no es un adorno: si el azar deja
       uno fuera, la paleta enseña un color que no está en el patrón y la ronda
       se vuelve más fácil para quien lo note.
       ⚠️ PERO EL QUE SE LLEVA CADA UNO SE SORTEA, y esto costó reescribirlo: la
       primera versión repartía los cuatro garantizados por ORDEN DE LECTURA
       --la primera celda pintada siempre coral, la segunda azul, la tercera
       verde, la cuarta morada-- así que quien lo notara solo tenía que
       recordar las posiciones y el color de las tres últimas. La mitad del
       juego, regalada. Ahora los colores obligatorios caen en cuatro de las
       siete al azar. */
    var reparto = [];
    for (var k = 0; k < elegidas.length; k++) {
      reparto.push(k < n.colores ? k : az.entero(n.colores));
    }
    reparto = az.barajar(reparto);
    for (var j = 0; j < elegidas.length; j++) patron[elegidas[j]] = reparto[j];
    return {
      cols: n.cols, filas: n.filas, colores: n.colores,
      muestraMs: n.muestraMs, patron: patron
    };
  }

  function inicial(tablero) {
    var pintadas = [];
    for (var i = 0; i < tablero.patron.length; i++) pintadas.push(VACIA);
    return { tablero: tablero, pintadas: pintadas, pasos: 0 };
  }

  function calcado(estado) {
    var p = estado.tablero.patron;
    for (var i = 0; i < p.length; i++) {
      if (estado.pintadas[i] !== p[i]) return false;
    }
    return true;
  }

  function aplicar(estado, jugada) {
    if (typeof jugada !== 'number' || jugada % 1 !== 0 || jugada < 0) return null;
    /* Jugar después de haber calcado el patrón entero no es una jugada de la
       app: ahí la ronda ya terminó sola. */
    if (calcado(estado)) return null;
    var celda = celdaDe(jugada);
    var color = colorDe(jugada);
    if (celda < 0 || celda >= estado.pintadas.length) return null;
    if (color < -1 || color >= estado.tablero.colores) return null;
    /* Borrar una celda vacía, o pintar el color que ya tiene, no lo puede
       producir la interfaz: la celda cambia de estado con cada toque. Una lista
       que lo traiga no salió de la app. */
    if (estado.pintadas[celda] === color) return null;
    estado.pintadas[celda] = color;
    estado.pasos++;
    return estado;
  }

  function fin(estado) {
    return calcado(estado) ? { completo: 1 } : null;
  }

  function resumen(estado, ms) {
    var p = estado.tablero.patron;
    var aciertos = 0, demas = 0, faltan = 0;
    for (var i = 0; i < p.length; i++) {
      var puso = estado.pintadas[i];
      if (p[i] === VACIA) {
        if (puso !== VACIA) demas++;
      } else if (puso === p[i]) {
        aciertos++;
      } else if (puso === VACIA) {
        faltan++;
      } else {
        demas++;   // celda del patrón con el color cambiado: ni acierto ni hueco
      }
    }
    return {
      completo: (demas === 0 && faltan === 0) ? 1 : 0,
      aciertos: aciertos, demas: demas, faltan: faltan,
      pasos: estado.pasos, ms: ms
    };
  }

  function contarVacias(p) {
    var n = 0;
    for (var i = 0; i < p.length; i++) if (p[i] === VACIA) n++;
    return n;
  }

  /* ⚠️ LO DE MÁS RESTA, y por eso no basta con contar aciertos: sin ese término
     pintar la cuadrícula entera de los cuatro colores sacaría los 7 aciertos
     por fuerza bruta. `completo` va primero porque es lo que suma a favor. */
  function marca(r) {
    return [r.completo, r.aciertos - r.demas, -r.ms];
  }

  /* El mismo patrón en espejo y con los colores permutados: misma dificultad
     --las mismas celdas que recordar y los mismos toques-- y distinto dibujo. */
  function gemelo(tablero, semilla) {
    var az = J.azar.crear(semilla);
    var cual = 1 + az.entero(3);                 // 1 izq-der, 2 arr-abajo, 3 las dos
    var orden = [];
    for (var i = 0; i < tablero.colores; i++) orden.push(i);
    var permuta = az.barajar(orden);
    var cols = tablero.cols, filas = tablero.filas;
    var patron = [];
    for (var f = 0; f < filas; f++) {
      for (var c = 0; c < cols; c++) {
        var ff = (cual & 2) ? filas - 1 - f : f;
        var cc = (cual & 1) ? cols - 1 - c : c;
        var v = tablero.patron[ff * cols + cc];
        patron.push(v === VACIA ? VACIA : permuta[v]);
      }
    }
    return {
      cols: cols, filas: filas, colores: tablero.colores,
      muestraMs: tablero.muestraMs, patron: patron
    };
  }

  function resolver(tablero) {
    var pasos = [];
    for (var i = 0; i < tablero.patron.length; i++) {
      if (tablero.patron[i] !== VACIA) pasos.push(i * PASOS + tablero.patron[i] + 1);
    }
    return pasos;
  }

  /* Tocar un color y una celda, con el dedo, no baja de medio segundo por
     pareja cuando hay que recordar dónde iba. */
  function pisoMs(tablero) {
    return (tablero.patron.length - contarVacias(tablero.patron)) * 300;
  }

  J.registrar({
    id: 'calco',
    nombre: 'Calco',
    como: 'Mira el patrón, y cuando se esconda cálcalo: toca un color y toca su celda.',
    compara: 'rondas',
    reintentos: 2,
    topeS: 30,
    /* El patrón se mira antes de que arranque el reloj: la carcasa lo pinta y
       espera esto, que es del TABLERO y no del reloj de la ronda. */
    muestra: true,
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
