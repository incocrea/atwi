/* ATWI · minijuegos · «Calco»
   ==========================================================================
   Sale un patrón de STICKERS sobre una cuadrícula, se mira unos segundos, se
   esconde, y hay que calcarlo de memoria: se ARRASTRA cada sticker de la paleta
   a su casilla, y tocar una casilla que ya tiene uno lo quita. El reloj empieza
   cuando el patrón se esconde, no antes (docs/10 §8.2).

   DIFICULTAD ÚNICA (pivote del titular, 2026-09-22): 4×4 con 7 casillas y 4
   stickers distintos. El plan traía tres niveles; se queda el de en medio, y el
   motivo es que los otros dos miden otra cosa: con 5 casillas se calca sin
   esfuerzo y con 9 en 5×5 la ronda la decide la memoria bruta y no la atención.

   ⚠️ STICKERS Y NO COLORES CON FORMA (titular, 2026-09-22: «para Calco no
   usaremos colores y formas, usaremos stickers»). Cuatro colores obligaban a
   dibujarles una forma encima para no depender del tono; un sticker ya ES una
   cosa reconocible —un gato, una pizza, una luna— y se recuerda por lo que es,
   no por su color. Es además el primer uso de la hoja de stickers, que después
   heredan Frascos, Despensa, Dúos y Revoltijo.

   ⚠️ QUÉ CUATRO SALEN ES DEL TABLERO (`fichas`), no de la interfaz: si los
   eligiera la pantalla, el teléfono y el servidor verían rondas distintas. La
   lógica guarda el ÍNDICE dentro de `fichas` (0..3) y quién es cada uno lo dice
   `fichas`; la interfaz solo traduce ese índice a un archivo.

   LO QUE SE GUARDA ES LA CUADRÍCULA FINAL, no los aciertos: el resultado lo
   saca el servidor repitiendo las jugadas sobre el patrón de verdad. El cliente
   manda lo que HIZO. */
(function (raiz) {
  'use strict';
  raiz.ATWI = raiz.ATWI || {};
  var J = raiz.ATWI.juegos = raiz.ATWI.juegos || Object.create(null);

  var NIVELES = [
    { cols: 4, filas: 4, pintadas: 7, distintos: 4 }
  ];

  /* Cuántos stickers hay en la hoja. Los nombres viven en la interfaz --aquí no
     se sabe ni se quiere saber cómo se llama el archivo--; lo único que hace
     falta es de cuántos se puede elegir, porque eso SÍ cambia el tablero y
     tiene que ser igual en el teléfono y en el servidor. */
  var STICKERS = 24;

  var VACIA = -1;

  /* Una jugada es un entero: `celda * PASOS + k`, con k = 0 quitar y k = 1..4
     poner la ficha k-1. Entero y no objeto porque esta lista viaja al servidor
     y se repite allí: cuanto menos forma tenga, menos puede discrepar un JSON
     de otro. */
  var PASOS = 5;

  function celdaDe(jugada) { return Math.floor(jugada / PASOS); }
  function fichaDe(jugada) { return (jugada % PASOS) - 1; }   // -1 = quitar

  function generar(semilla, nivel) {
    var n = NIVELES[nivel] || NIVELES[0];
    var az = J.azar.crear(semilla);
    var total = n.cols * n.filas;
    var todas = [];
    for (var i = 0; i < total; i++) todas.push(i);
    var elegidas = az.barajar(todas).slice(0, n.pintadas);
    var patron = [];
    for (var c = 0; c < total; c++) patron.push(VACIA);
    /* QUÉ CUATRO STICKERS SALEN, de los 24 de la hoja: cada ronda trae otros,
       así que dos rondas seguidas de Calco no se parecen aunque el patrón caiga
       en las mismas casillas. */
    var hoja = [];
    for (var h = 0; h < STICKERS; h++) hoja.push(h);
    var fichas = az.barajar(hoja).slice(0, n.distintos);
    /* ⚠️ LOS CUATRO SALEN TODOS, y eso no es un adorno: si el azar deja uno
       fuera, la paleta enseña un sticker que no está en el patrón y la ronda se
       vuelve más fácil para quien lo note.
       ⚠️ Y A QUIÉN LE TOCA CADA UNO SE SORTEA, que costó reescribirlo: la
       primera versión repartía los cuatro garantizados por ORDEN DE LECTURA
       --la primera casilla siempre el primer sticker, la segunda el segundo…--
       así que quien lo notara solo tenía que recordar las posiciones y las tres
       últimas fichas. La mitad del juego, regalada. */
    var reparto = [];
    for (var k = 0; k < elegidas.length; k++) {
      reparto.push(k < n.distintos ? k : az.entero(n.distintos));
    }
    reparto = az.barajar(reparto);
    for (var j = 0; j < elegidas.length; j++) patron[elegidas[j]] = reparto[j];
    return {
      fichas: fichas,
      cols: n.cols, filas: n.filas, distintos: n.distintos,
      patron: patron
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
    var ficha = fichaDe(jugada);
    if (celda < 0 || celda >= estado.pintadas.length) return null;
    if (ficha < -1 || ficha >= estado.tablero.distintos) return null;
    /* Quitar de una casilla vacía, o poner la ficha que ya tiene, no lo puede
       producir la interfaz: la casilla cambia de estado con cada gesto. Una
       lista que lo traiga no salió de la app. */
    if (estado.pintadas[celda] === ficha) return null;
    estado.pintadas[celda] = ficha;
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
        demas++;   // casilla del patrón con OTRA ficha: ni acierto ni hueco
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
     llenar la cuadrícula entera de stickers sacaría los 7 aciertos por fuerza
     bruta. `completo` va primero porque es lo que suma a favor. */
  function marca(r) {
    return [r.completo, r.aciertos - r.demas, -r.ms];
  }

  /* El mismo patrón en espejo y con las fichas permutadas: misma dificultad
     --las mismas casillas que recordar y los mismos gestos-- y distinto dibujo. */
  function gemelo(tablero, semilla) {
    var az = J.azar.crear(semilla);
    var cual = 1 + az.entero(3);                 // 1 izq-der, 2 arr-abajo, 3 las dos
    var orden = [];
    for (var i = 0; i < tablero.distintos; i++) orden.push(i);
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
    /* `fichas` NO se toca: los dos ven los mismos cuatro stickers en la
       paleta --si no, la pantalla del otro sería otro juego-- y lo que cambia
       es dónde va cada uno. */
    return {
      fichas: tablero.fichas.slice(),
      cols: cols, filas: filas, distintos: tablero.distintos,
      patron: patron
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
    /* ⚠️ EN PRUEBAS TAMBIÉN EN EL CLIENTE (2026-09-22). La base lo rechaza para
       cualquier cuenta que no sea la del titular (`juego_en_pruebas()`), pero
       el globo «¿a qué juegan?» se lo ofrecía a todo el mundo: quien lo elegía
       se quedaba en «No se pudo crear la partida». CERRAR EL JUEGO SON DOS
       COSAS: quitar esta línea y la migración que lo saca de la lista. */
    soloPruebas: true,
    /* Tiene su rotulo dibujado (titular, 2026-09-22): manda sobre el nombre
       en texto, como el logo del modo en el versus. */
    rotulo: true,
    como: 'Mira el patrón y, cuando se esconda, cálcalo: arrastra cada sticker a su caja.',
    compara: 'rondas',
    reintentos: 2,
    /* 5 S PARA MIRAR Y 15 PARA CALCAR (titular, 2026-09-22; eran 3 y 30). Con
       más tiempo de mirada y menos de respuesta, lo que se mide es la memoria y
       no el tanteo: con 30 s se podía ir probando hasta dar con él. */
    topeS: 15,
    /* El patrón se mira DURANTE la cuenta atrás (`muestra`), así que su duración
       es la del conteo: `cuentaS` lo alarga a 5-4-3-2-1 solo en este juego. Lo
       leen la carcasa Y el servidor, que descuenta exactamente esos segundos
       del tiempo de la ronda: si solo lo supiera el teléfono, en línea los dos
       segundos de más contarían como tiempo de juego. */
    cuentaS: 5,
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
