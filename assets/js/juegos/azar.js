/* ATWI · minijuegos · azar con semilla
   ==========================================================================
   Los tableros de QuiénGane NO se guardan: se GENERAN, y los generan tres
   sitios distintos a partir del mismo número —el teléfono de cada jugador y la
   función de borde `juego`, que repite las jugadas para verificarlas—. Si los
   tres no sacan exactamente el mismo tablero, el servidor rechaza una ronda
   bien jugada. Por eso aquí no hay `Math.random()` y por eso todo es aritmética
   ENTERA:

     · `Math.imul` y `>>>` dan lo mismo en V8 (Chrome, Node, Deno) y en
       JavaScriptCore (Safari), bit a bit. `Math.sin`, `Math.pow` y compañía NO:
       cada motor redondea el último decimal a su manera.
     · nada de `sort()` con un comparador al azar: el orden en que el motor
       pregunta no está especificado.
     · `entero(n)` descarta y vuelve a tirar en vez de hacer `% n` a secas, para
       que ningún valor salga favorecido.

   ⚠️ ESTE ARCHIVO SE COPIA A LA FUNCIÓN DE BORDE. `tools/logica_al_borde.py` lo
   pega, tal cual, en `supabase/functions/juego/logica.ts`. Por eso empieza y
   acaba con las dos líneas EXACTAS de abajo (el generador las busca) y por eso
   está escrito en un JavaScript que TypeScript también acepta: los objetos se
   declaran con todos sus campos de entrada, nunca se les cuelgan después.

   ⚠️ CAMBIAR UNA LÍNEA DE AQUÍ CAMBIA TODOS LOS TABLEROS de todas las partidas
   abiertas. `node tools/probar_juegos.js` lo caza con sus valores dorados, y no
   deja volver a dorarlos sin subir `VERSION_REGLAS`. */
(function (raiz) {
  'use strict';
  raiz.ATWI = raiz.ATWI || {};
  var J = raiz.ATWI.juegos = raiz.ATWI.juegos || Object.create(null);

  /* Junta dos enteros de 32 bits en uno bien revuelto (el remate de
     MurmurHash3). Sirve para sacar semillas hijas de una madre sin que se
     parezcan: la del gemelo, la de cada subintento de un generador. */
  function mezclar(a, b) {
    var h = (a ^ Math.imul((b | 0) + 0x7F4A7C15, 0x9E3779B1)) | 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85EBCA6B);
    h ^= h >>> 13;
    h = Math.imul(h, 0xC2B2AE35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /* Un texto → 32 bits (FNV-1a). En línea la semilla la deriva el servidor con
     su secreto; esto es para lo que no tiene servidor: la partida local y la
     práctica, que la sacan del id de la partida y del número de ronda. */
  function deTexto(texto) {
    var h = 0x811C9DC5;
    var s = String(texto);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /* El generador: mulberry32. Pequeño, rápido y de sobra para barajar fichas. */
  function crear(semilla) {
    var a = semilla >>> 0;

    function u32() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    }

    /* Un entero en [0, n). Descarta la cola que no reparte parejo. */
    function entero(n) {
      n = n >>> 0;
      if (n < 2) return 0;
      var tope = 4294967296 - (4294967296 % n);
      var x = u32();
      while (x >= tope) x = u32();
      return x % n;
    }

    /* Un entero en [desde, hasta], los dos incluidos. */
    function entre(desde, hasta) {
      return desde + entero(hasta - desde + 1);
    }

    /* Fisher–Yates sobre una COPIA: quien pasa su lista la conserva. */
    function barajar(lista) {
      var copia = lista.slice();
      for (var i = copia.length - 1; i > 0; i--) {
        var j = entero(i + 1);
        var x = copia[i];
        copia[i] = copia[j];
        copia[j] = x;
      }
      return copia;
    }

    function elegir(lista) {
      return lista[entero(lista.length)];
    }

    return { u32: u32, entero: entero, entre: entre, barajar: barajar, elegir: elegir };
  }

  J.azar = { crear: crear, mezclar: mezclar, deTexto: deTexto };
})(typeof window !== 'undefined' ? window : globalThis);
