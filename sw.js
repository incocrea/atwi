/* ATWI · el trabajador de servicio que guarda los dibujos.
   ==========================================================================

   QUE HACE, EN UNA LINEA: baja los 287 dibujos del juego una sola vez por
   navegador y, en cada publicacion, vuelve a bajar solo los que cambiaron.

   POR QUE EXISTE. El juego son 24 MB de dibujos. Sin esto, cada pantalla baja
   lo suyo la primera vez que se abre y se ve: la animacion de entrada arranca y
   la figura aparece a mitad del movimiento. Eso no se puede disimular despues
   —una animacion que ya empezo no se vuelve a empezar— asi que la unica salida
   es que la pieza ya este cuando la pantalla la pide.

   COMO SABE QUE VOLVER A BAJAR. `assets/datos/piezas.json` trae el hash del
   CONTENIDO de cada pieza. Aqui se guarda el manifiesto de lo que hay en la
   caché; al llegar uno nuevo se comparan hash a hash y se baja la diferencia.
   Retocar un sprite cuesta ese sprite, no los 24 MB.

   NO SE USA EL SELLO DE VERSION PARA ESTO, y es la decision de fondo. El sello
   (`?v=<commit>`) cambia en cada publicacion aunque no se haya tocado un dibujo:
   arreglar una coma en el CSS costaria 24 MB a cada telefono. El sello dice «hay
   version nueva»; el hash dice «cambiaron tres piezas».

   QUE NO TOCA, Y ES A PROPOSITO: ni HTML, ni CSS, ni JS. Solo `assets/img/`.
   Esos tres ya se actualizan con el sello y `version.json`, y una caché que
   manda mas que la red puede dejar la app servida con codigo viejo sin que nadie
   pueda hacer nada. Un dibujo viejo es un dibujo viejo; un JS viejo es una app
   rota. Lo grafico es el 95 % de los bytes de todos modos.

   SE PUEDE INTERRUMPIR SIN PERDER NADA. Bajar 22 MB puede tardar mas de lo que
   el navegador deja vivir a un trabajador de servicio. Por eso el manifiesto
   guardado se persiste cada 25 piezas: si lo matan a mitad, la siguiente visita
   sigue donde se quedo en vez de empezar de cero. */

var CACHE = 'atwi-piezas';
var CLAVE_MANIFIESTO = 'manifiesto-guardado';   /* clave sintetica dentro de la caché */
/* EL MANIFIESTO VIGENTE, guardado en la caché (auditoría gráfica, plan D,
   2026-09-23). Desde que las figuras NO se precargan --21 MB por teléfono, y una
   partida usa las de dos personajes-- se guardan al usarse, en el `fetch` de
   abajo. Para que un dibujo retocado no se quede viejo para siempre, esa pieza
   se anota con su hash, y el hash sale de aquí: el trabajador se despierta sin
   memoria, así que el manifiesto no puede vivir solo en una variable. */
var CLAVE_VIGENTE = 'manifiesto-vigente';
var A_LA_VEZ = 6;        /* mas peticiones a la vez no van mas rapido: compiten */
var CADA_CUANTO_ANOTO = 25;

/* Lo unico que se guarda. Se decide por la RUTA y no por el manifiesto porque un
   trabajador de servicio se duerme y se despierta sin memoria: preguntar por la
   ruta funciona siempre, tener el manifiesto cargado no. */
function esDibujo(url) {
  return url.indexOf(self.registration.scope + 'assets/img/') === 0;
}

self.addEventListener('install', function () {
  /* Sin precaché aqui: la instalacion no puede quedarse esperando 22 MB, y la
     pagina manda la orden de sincronizar en cuanto esta lista. */
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nombres) {
    return Promise.all(nombres.map(function (n) {
      return n !== CACHE ? caches.delete(n) : null;
    }));
  }).then(function () { return self.clients.claim(); }));
});

/* --- Servir --------------------------------------------------------------- */
/* De la caché primero, porque el objetivo es que no haya espera. La red solo
   entra cuando la pieza no esta, y entonces se guarda de paso: asi una pieza
   nueva que todavia no se sincronizo queda guardada al primer uso. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (!esDibujo(e.request.url)) return;
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request, { ignoreSearch: true }).then(function (hay) {
        if (hay) return hay;
        return fetch(e.request).then(function (r) {
          if (r && r.ok) {
            c.put(sinConsulta(e.request), r.clone()).then(function () {
              /* Guardada al usarse: se anota con el hash vigente, o la
                 sincronización siguiente no sabría si está al día. */
              return anotarUna(c, sinConsulta(e.request).url.slice(self.registration.scope.length));
            }).catch(function () {});
          }
          return r;
        });
      });
    })
  );
});

/* La consulta se quita de la clave. Las imagenes no llevan `?v=`, pero si alguna
   vez lo llevan, la misma pieza guardada dos veces son 90 KB tirados. */
function sinConsulta(peticion) {
  var u = new URL(peticion.url);
  u.search = '';
  return new Request(u.toString(), { credentials: 'same-origin' });
}

/* --- Las piezas guardadas al usarse ------------------------------------------ */
var vigente = null;              /* {ruta: hash}, leído de la caché una vez */
function hashesDe(manifiesto) {
  var h = {};
  Object.keys((manifiesto && manifiesto.olas) || {}).forEach(function (o) {
    Object.keys(manifiesto.olas[o]).forEach(function (r) { h[r] = manifiesto.olas[o][r][0]; });
  });
  return h;
}
function leerVigente(c) {
  if (vigente) return Promise.resolve(vigente);
  return c.match(new Request(self.registration.scope + CLAVE_VIGENTE))
    .then(function (r) { return r ? r.json() : {}; })
    .then(function (v) { vigente = v || {}; return vigente; })
    .catch(function () { return {}; });
}
/* De una en una: anotar es leer, cambiar y escribir el mismo registro, y dos a
   la vez se pisarían. */
var colaAnotar = Promise.resolve();
function anotarUna(c, ruta) {
  colaAnotar = colaAnotar.then(function () {
    return Promise.all([leerVigente(c), leerGuardado(c)]).then(function (p) {
      var hash = p[0][ruta];
      if (!hash) return;
      var g = p[1] || {};
      g[ruta] = hash;
      return anotarGuardado(c, g);
    });
  }).catch(function () {});
  return colaAnotar;
}

/* --- Sincronizar ---------------------------------------------------------- */
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.tipo !== 'sincronizar') return;
  e.waitUntil(sincronizar(d.manifiesto, d.olas || []));
});

function leerGuardado(c) {
  return c.match(new Request(self.registration.scope + CLAVE_MANIFIESTO))
    .then(function (r) { return r ? r.json() : {}; })
    .catch(function () { return {}; });
}

function anotarGuardado(c, guardado) {
  return c.put(new Request(self.registration.scope + CLAVE_MANIFIESTO),
               new Response(JSON.stringify(guardado),
                            { headers: { 'Content-Type': 'application/json' } }));
}

function contarATodos(mensaje) {
  return self.clients.matchAll().then(function (cs) {
    cs.forEach(function (c) { c.postMessage(mensaje); });
  });
}

function sincronizar(manifiesto, olas) {
  if (!manifiesto || !manifiesto.olas) return Promise.resolve();
  var cache, guardado, presentes;

  return caches.open(CACHE).then(function (c) {
    cache = c;
    return Promise.all([leerGuardado(c), c.keys()]);
  }).then(function (par) {
    guardado = par[0] || {};
    /* Lo que de verdad hay dentro. El manifiesto guardado dice lo que se bajo;
       esto dice lo que sobrevivio. El navegador puede vaciar una caché entera
       cuando le falta sitio, y entonces el manifiesto miente. */
    presentes = {};
    par[1].forEach(function (p) { presentes[sinConsulta(p).url] = true; });

    /* Lo que sobra: piezas que ya no estan en ningun manifiesto. Se van ahora,
       antes de bajar nada, por si lo que falta es sitio. */
    var vivas = {};
    olasDe(manifiesto).forEach(function (r) {
      vivas[self.registration.scope + r] = true;
    });
    var muertas = Object.keys(presentes).filter(function (u) {
      return !vivas[u] && u !== self.registration.scope + CLAVE_MANIFIESTO &&
             u !== self.registration.scope + CLAVE_VIGENTE;
    });
    /* Y LAS VIEJAS: una pieza que está en la caché con otro hash que el del
       manifiesto se va, se precargue su ola o no. Es lo que mantiene al día
       las figuras, que desde el plan D se guardan al usarse: la próxima vez que
       se pinten, se bajan con el dibujo nuevo. */
    var hashes = hashesDe(manifiesto);
    Object.keys(hashes).forEach(function (r) {
      var u = self.registration.scope + r;
      if (presentes[u] && guardado[r] !== hashes[r] && muertas.indexOf(u) === -1) {
        muertas.push(u);
        delete presentes[u];
      }
    });
    vigente = hashes;
    return Promise.all(muertas.map(function (u) {
      delete guardado[u.slice(self.registration.scope.length)];
      return cache.delete(new Request(u));
    }));
  }).then(function () {
    return cache.put(new Request(self.registration.scope + CLAVE_VIGENTE),
                     new Response(JSON.stringify(vigente),
                                  { headers: { 'Content-Type': 'application/json' } }));
  }).then(function () {
    return porOlas(manifiesto, olas, cache, guardado, presentes);
  });
}

function olasDe(manifiesto) {
  var todas = [];
  Object.keys(manifiesto.olas).forEach(function (o) {
    todas = todas.concat(Object.keys(manifiesto.olas[o]));
  });
  return todas;
}

/* Una ola detras de otra, en el orden que manda la pagina. Es lo que hace que
   los iconos de la barra esten antes que las figuras de 90 KB: si fueran todas a
   la vez, las 228 grandes se llevarian el ancho de banda de las 18 chicas. */
function porOlas(manifiesto, olas, cache, guardado, presentes) {
  return olas.reduce(function (antes, ola) {
    return antes.then(function () {
      var entradas = manifiesto.olas[ola];
      if (!entradas) return;

      var faltan = Object.keys(entradas).filter(function (r) {
        var hash = entradas[r][0];
        return guardado[r] !== hash || !presentes[self.registration.scope + r];
      });
      if (!faltan.length) {
        return contarATodos({ tipo: 'ola-lista', ola: ola, bajadas: 0 });
      }

      var hechas = 0, desdeLaUltima = 0;
      return enCola(faltan, function (r) {
        return cache.add(new Request(self.registration.scope + r,
                                     { credentials: 'same-origin' }))
          .then(function () {
            guardado[r] = entradas[r][0];
            presentes[self.registration.scope + r] = true;
          })
          /* Una pieza que no baja no puede parar las otras 227. Se queda sin
             anotar en `guardado`, asi que la proxima visita lo vuelve a
             intentar, y mientras tanto la red la sirve cuando haga falta. */
          .catch(function () {})
          .then(function () {
            hechas++;
            if (++desdeLaUltima >= CADA_CUANTO_ANOTO) {
              desdeLaUltima = 0;
              return anotarGuardado(cache, guardado);
            }
          });
      }).then(function () {
        return anotarGuardado(cache, guardado);
      }).then(function () {
        return contarATodos({ tipo: 'ola-lista', ola: ola, bajadas: hechas });
      });
    });
  }, Promise.resolve());
}

/* De seis en seis. Sin tope, 228 peticiones simultaneas se estorban entre si y
   ademas dejan sin turno a lo que la pantalla necesita AHORA, que es justo lo
   contrario de para lo que existe esto. */
function enCola(lista, hacer) {
  var i = 0;
  function siguiente() {
    if (i >= lista.length) return Promise.resolve();
    return hacer(lista[i++]).then(siguiente);
  }
  var obreros = [];
  for (var k = 0; k < Math.min(A_LA_VEZ, lista.length); k++) obreros.push(siguiente());
  return Promise.all(obreros);
}
