/* ATWI · minijuegos · «Choque» (Fase 1, docs/10 §8.1)
   ==========================================================================
   Cinco elementos en un círculo y cada uno vence a los DOS que tiene delante:

       Fuego → Metal → Planta → Rayo → Agua → (Fuego)

   El orden del arreglo ES el círculo, y no es un adorno: `vence(a, b)` se
   reduce a mirar la distancia hacia delante. Se eligió para que salgan las
   siete relaciones que cualquiera adivinaría (el agua apaga el fuego, el fuego
   quema la planta…) y las otras tres salen forzadas; está comprobado por
   programa en el banco: cada uno vence a dos, pierde con dos y no hay ningún
   par que se venza mutuamente.

   UNA RONDA ES UN ELEMENTO, Y SE PUEDE REPETIR (titular, 2026-09-21: «se deben
   poder asignar varios turnos a la misma carta»). Aquí decía que los N tenían
   que ser DISTINTOS y que un repetido se anulaba; eso se cae. Repetir no es una
   trampa, es una apuesta: tres fuegos ganan las tres rondas contra quien no lo
   contrarresta y las pierden todas contra quien sí. Sin reloj que apure y sin
   gemelo: no hay tablero que mirar de reojo, lo secreto es la ELECCIÓN, y eso lo
   protege el servidor —en línea las cartas del otro no salen de ahí hasta el
   veredicto—.

   EL VEREDICTO ES PROPIO (docs/10 §5.1): ganar una ronda no es tener la marca
   mayor, es la relación entre las dos cartas. Y guarda la regla dura que queda:
   SIN DESEMPATE —el empate es un resultado (titular, 2026-09-21), y no hay total
   al que caer porque aquí no hay tiempo ni puntos que sumar—. */
(function (raiz) {
  'use strict';
  raiz.ATWI = raiz.ATWI || {};
  var J = raiz.ATWI.juegos = raiz.ATWI.juegos || Object.create(null);

  var ELEMENTOS = ['fuego', 'metal', 'planta', 'rayo', 'agua'];

  /* ¿`a` vence a `b`? Los dos por delante en el círculo (índices 0..4). */
  function vence(a, b) {
    var d = (b - a + 5) % 5;
    return d === 1 || d === 2;
  }

  /* La frase de cada cruce, con el GANADOR primero. Diez, las del plan. */
  var FRASES = {
    'fuego>metal': 'El fuego funde el metal',
    'fuego>planta': 'El fuego quema la planta',
    'metal>planta': 'El metal corta la planta',
    'metal>rayo': 'El metal atrapa el rayo',
    'planta>rayo': 'La planta manda el rayo a tierra',
    'planta>agua': 'La planta se bebe el agua',
    'rayo>agua': 'El rayo electrifica el agua',
    'rayo>fuego': 'El rayo domina al fuego: él lo enciende',
    'agua>fuego': 'El agua apaga el fuego',
    'agua>metal': 'El agua oxida el metal'
  };
  function frase(gana, pierde) {
    return FRASES[ELEMENTOS[gana] + '>' + ELEMENTOS[pierde]] || '';
  }

  /* El «tablero» son siempre los cinco elementos: aquí la semilla no decide
     nada —lo que cambia entre partidas es lo que cada quien elige— y el nivel
     tampoco: no hay rampa. Se declara igual porque el contrato lo pide y
     porque el dorado vigila que esto no cambie sin subir la versión. */
  function generar(semilla, nivel) {
    return { elementos: 5, nivel: nivel };
  }

  function inicial(tablero) {
    return { tablero: tablero, elegido: -1 };
  }

  /* La ÚNICA jugada de la ronda es el elemento elegido (0..4). Explorar el
     círculo —tocar para ver a quién vence— es de la pantalla y no llega aquí:
     lo que se registra es la decisión, confirmada. */
  function aplicar(estado, jugada) {
    if (typeof jugada !== 'number' || jugada % 1 !== 0) return null;
    if (jugada < 0 || jugada > 4) return null;
    if (estado.elegido !== -1) return null;
    estado.elegido = jugada;
    return estado;
  }

  function fin(estado) {
    return estado.elegido !== -1 ? { completo: 1 } : null;
  }

  function resumen(estado, ms) {
    return { completo: estado.elegido === -1 ? 0 : 1, elemento: estado.elegido, ms: ms };
  }

  /* La marca es el registro del elemento, no una puntuación: la comparación
     la hace el veredicto propio. Va `completo` delante para que una ronda
     recortada siga valiendo menos en las comprobaciones genéricas. */
  function marca(r) {
    return [r.completo, r.elemento];
  }

  /* SIN GEMELO: los dos ven las mismas cinco cartas, que es el juego. */
  function gemelo(tablero) { return tablero; }

  function resolver() { return [0]; }

  /* --- El veredicto propio -------------------------------------------------
     `dePropone` y `deInvitado` traen una casilla por ronda: {marca, resumen}
     o nulo si no se jugó. El elemento sale de `resumen.elemento`. */
  function elementoDe(fila) {
    if (!fila || !fila.resumen || !fila.resumen.completo) return -1;
    var e = fila.resumen.elemento;
    if (typeof e !== 'number' || e < 0 || e > 4) return -1;
    return e;
  }

  /* ⚠️ UNA RONDA, NO LA PARTIDA (pivote del titular, 2026-09-22: «se podrá
     seleccionar un minijuego diferente para cada ronda»). Antes Choque resolvía
     la partida entera --`veredicto(rondas, …)`-- y eso solo vale si TODAS las
     rondas son suyas. Ahora la ronda 2 puede ser de Cuenta, así que lo que este
     juego sabe decidir es SU ronda y el recuento lo lleva `comun`.
     Devuelve lo que la pantalla de resultados necesita: quién ganó, qué puso
     cada uno y la frase del cruce. */
  function ronda(p, q) {
    var eA = elementoDe(p);
    var eB = elementoDe(q);
    var gana = 'empate';
    var dicho = '';
    if (eA === -1 && eB === -1) gana = 'empate';
    else if (eB === -1) gana = 'propone';
    else if (eA === -1) gana = 'invitado';
    else if (eA === eB) gana = 'empate';
    else if (vence(eA, eB)) { gana = 'propone'; dicho = frase(eA, eB); }
    else { gana = 'invitado'; dicho = frase(eB, eA); }
    return {
      gana: gana,
      propone: eA === -1 ? null : { elemento: eA },
      invitado: eB === -1 ? null : { elemento: eB },
      frase: dicho
    };
  }

  function veredicto(rondas, dePropone, deInvitado) {
    var filas = [];
    var a = 0, b = 0;
    var jugoA = false, jugoB = false;
    for (var r = 0; r < rondas; r++) {
      var eA = elementoDe(dePropone[r]);
      var eB = elementoDe(deInvitado[r]);
      if (eA !== -1) jugoA = true;
      if (eB !== -1) jugoB = true;
      var gana = 'empate';
      var dicho = '';
      if (eA === -1 && eB === -1) gana = 'empate';
      else if (eB === -1) { gana = 'propone'; a++; }
      else if (eA === -1) { gana = 'invitado'; b++; }
      else if (eA === eB) gana = 'empate';
      else if (vence(eA, eB)) { gana = 'propone'; a++; dicho = frase(eA, eB); }
      else { gana = 'invitado'; b++; dicho = frase(eB, eA); }
      filas.push({
        ronda: r + 1,
        propone: eA === -1 ? null : { elemento: eA },
        invitado: eB === -1 ? null : { elemento: eB },
        gana: gana,
        frase: dicho
      });
    }
    if (!jugoA && !jugoB) return { tipo: 'anulada', ganador: null, como: 'nadie', marcador: [0, 0], rondas: filas };
    if (!jugoB) return { tipo: 'ganador', ganador: 'propone', como: 'abandono', marcador: [a, b], rondas: filas };
    if (!jugoA) return { tipo: 'ganador', ganador: 'invitado', como: 'abandono', marcador: [a, b], rondas: filas };
    if (a === b) return { tipo: 'empate', ganador: null, como: 'empate', marcador: [a, b], rondas: filas };
    return { tipo: 'ganador', ganador: a > b ? 'propone' : 'invitado', como: 'rondas', marcador: [a, b], rondas: filas };
  }

  J.registrar({
    id: 'choque',
    nombre: 'Choque',
    como: 'Reparte tus rondas entre cinco elementos, en secreto: cada uno vence a dos y pierde con dos.',
    compara: 'rondas',
    /* Sin reintentos y sin recibo: la seleccion se reasigna libre en la misma
       pantalla hasta confirmar (titular, 2026-09-21), asi que «pensarlo mejor»
       ya esta dentro del tablero. */
    reintentos: 0,
    deUnaVez: true,
    /* El tope solo acota el tiempo que se anota: aquí no hay reloj que apure
       (`sinReloj`) y el tiempo no puntúa. */
    topeS: 300,
    sinReloj: true,
    sinGemelo: true,
    rotulo: true,
    niveles: [{}, {}, {}],
    generar: generar,
    inicial: inicial,
    aplicar: aplicar,
    fin: fin,
    resumen: resumen,
    marca: marca,
    gemelo: gemelo,
    resolver: resolver,
    /* `ronda` es lo que usa `comun.veredicto` desde el pivote; `veredicto`
       se queda para el caso de una partida entera de Choque. */
    ronda: ronda,
    veredicto: veredicto,
    /* Lo que la pantalla necesita del círculo, sin copiarlo: el orden, quién
       vence a quién y la frase de cada cruce. */
    ELEMENTOS: ELEMENTOS,
    vence: vence,
    frase: frase
  });
})(typeof window !== 'undefined' ? window : globalThis);
