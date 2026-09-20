/* ==========================================================================
   ATWI · config.js
   Valores PÚBLICOS de configuración. Aquí no va ningún secreto: la clave
   secreta de Turnstile, la de Anthropic y la service role de Supabase viven
   solo en el servidor, como secretos de las funciones de Supabase.

   Mientras apiBase y supabaseUrl estén vacíos, la app corre en MODO LOCAL:
   todo funciona contra el almacenamiento del navegador y no sale ni una
   petición. Es el modo en el que se construye y se prueba el diseño.
   ========================================================================== */
window.ATWI = window.ATWI || {};

/* NADIE NOS METE EN UN MARCO AJENO (docs/07, fase 5). `frame-ancestors` es la
   forma correcta y se IGNORA en un `meta`, así que en GitHub Pages --donde no
   se pueden poner cabeceras-- lo que queda es comprobarlo desde dentro.
   ⚠️ CON EXCEPCIÓN DE MISMO ORIGEN: la landing embebe `/app/?demo=1` para
   enseñar el juego, así que rechazar todo marco rompería su visor.
   `location.origin` del padre no se puede leer si es de otro sitio --y ese
   fallo ES la respuesta: si no se puede leer, no es nuestro--. */
(function () {
  if (window.top === window.self) return;
  var mismo = false;
  try { mismo = window.top.location.origin === window.location.origin; } catch (e) { mismo = false; }
  if (mismo) return;
  try { window.top.location = window.location.href; }
  catch (e) { document.documentElement.innerHTML = ''; }
})();

window.ATWI.config = {
  /* LOS DOS MODOS, CON SU JUEGO DE PALABRAS.
     Las dos palabras esconden «IA» y se resalta: negoc·IA·ción y controvers·IA.
     El resalte lleva el lavanda de la marca en los dos, no el color del modo, y
     es a propósito: la IA es la misma en los dos lados de la mesa.

     La CLAVE interna sigue siendo `debate`. Cambiarla arrastraría el enum
     `modo_juego` de la base, diez migraciones y los tokens de color; lo que
     cambia es cómo se llama de cara a quien juega. */
  modos: {
    debate: {
      nombre: 'Controversia',
      partido: ['Controvers', 'IA', ''],
      /* EL GANCHO DE LA CARTA, y no es un resumen de `que`: son dos trabajos
         distintos. `que` explica el modo a quien abrió «Cómo funciona» y puede
         ocupar lo que necesite; esto cabe en dos renglones bajo el dibujo y lo
         único que tiene que hacer es decir a qué se juega. Redacción del
         titular (2026-09-16). */
      gancho: 'Defiende tu postura de forma divertida',
      que: 'Un tema en común, ambos pueden estar a favor o en contra. ' +
           '¡Lo que cuenta para ganar es quién argumenta mejor su posición!',
      clave: 'No va de quién tiene la razón (eso no sirve de nada), va de que aprendas a ' +
             'defender mejor tu punto de vista.'
    },
    negociacion: {
      nombre: 'Negociación',
      partido: ['Negoc', 'IA', 'ción'],
      gancho: 'Dialoga, encuentra acuerdos y avanza',
      /* DOS Y NO TRES, y el número no es de redacción: `docs/02` §13 le dice al
         mediador «TU TRABAJO ES PROPONER DOS MANERAS DE QUEDAR», y el probador
         pinta dos. Aquí ponía «3» desde antes y era una promesa que la pantalla
         no iba a cumplir. Si algún día el mediador propone tres, se cambian el
         prompt y esta línea a la vez. */
      que: 'Ambos presentan sus argumentos e ideas, y un mediador IA experto propone ' +
           '2 posibles acuerdos para seleccionar o ajustar.',
      clave: 'Si ningún acuerdo satisface a las dos partes, se vale seguir en desacuerdo y ' +
             'reintentar la negociación más adelante.'
    },
    /* EL TERCER MODO (titular, 2026-09-16), y no es un tercer debate: aquí no
       se argumenta ni se acuerda nada. Se apuesta algo —«quien gane elige las
       próximas tres películas»— y se decide en un minijuego.
       Por eso lo que se elige antes de jugar NO es un tema sino un PREMIO, y
       por eso el catálogo tiene dos clases de ficha. Ver `clase` en
       `catalogo.json`.
       ⚠️ ESTÁ A MEDIAS A PROPÓSITO: llega hasta elegir premio. Lo que sigue
       —el selector de minijuego, que sustituye al de «local o invitación»— lo
       explicará el titular más adelante, así que aquí no hay nada de la sala. */
    competencia: {
      nombre: 'QuiénGane',
      /* Sin partir: los otros dos separan su «IA» para pintarla aparte y este
         nombre no la lleva dentro. El rótulo dibujado es el que manda. */
      partido: ['QuiénGane', '', ''],
      gancho: 'Definen un premio y se lo ganan jugando',
      que: 'Eligen qué se lleva quien gane —una comida, un favor, la próxima ' +
           'elección— y lo deciden jugando. Aquí no se discute: se compite.',
      clave: 'Lo que se apuesta tiene que poder cumplirse sin que a nadie le pese; ' +
             'si duele perderlo, no es un premio.'
    }
  },

  /* EL DESCARGO, EN UN SOLO SITIO. Sale en la portada del juego y en la puerta,
     y tener dos redacciones distintas según por dónde se entre sería peor que no
     tener ninguna. Vive aquí, y no en app.js, porque entrada.js se carga antes
     que app.js y también lo necesita.

     El GANCHO va aparte y no se pinta en la portada. Hacen trabajos distintos:
     el descargo protege y hay que tenerlo siempre a la vista; el gancho explica
     de qué va esto en una línea, y eso solo hace falta la primera vez. En una
     pantalla que se abre cada día, repetir la frase de presentación la gasta. */
  /* VA PARTIDO EN DOS, y no es un capricho de formato: la primera mitad cuenta
     qué hace la IA y la segunda es LA QUE PROTEGE. En el globo esa segunda va
     en negrita y en el color del tinte (titular, 2026-09-17), porque leída de
     corrido dentro del párrafo es justo la frase que se salta quien va con
     prisa. `descargo` se compone al final del archivo y sigue siendo el texto
     entero: así quien lo quiera de una pieza no se entera de esto, y las dos
     mitades no pueden desincronizarse de su suma. */
  descargoBase:
    'ATWI usa IA para facilitar la resolución de conflictos y promover el ejercicio ' +
    'del debate. Aunque ayuda a mediar diferencias y lograr acuerdos de forma ' +
    'divertida, ',
  descargoOjo:
    'no reemplaza la terapia ni asesoramiento profesional.',

  gancho:
    '<span class="aviso-ia__gancho">«Es como el UNO, pero en vez de provocar ' +
    'discusiones busca solucionarlas.»</span>',

  /* Sello de la versión publicada. En el repositorio va VACÍO a propósito:
     lo rellena tools/publicar.ps1 con el SHA corto del commit, en la copia que
     sube, y con el mismo sello va el `?v=` de los CSS, los JS y el catálogo.
     Sin esto el navegador del teléfono se queda con los archivos viejos aunque
     el sitio ya esté actualizado, que es justo lo que pasó el 2026-09-12. */
  version: '7f2aed7',

  /* Proyecto de Supabase (región us-west-2, Oregón: hay que declararla en la
     política de privacidad). La clave anon es PÚBLICA por diseño: viaja al
     navegador y la seguridad la dan las políticas RLS de la base de datos.
     Aquí no hay ningún secreto. La service role jamás aparece en este archivo. */
  supabaseUrl: 'https://vauarfofsfgwnuyjfpni.supabase.co',
  supabaseAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhdWFyZm9mc2Znd251eWpmcG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNzY4NDgsImV4cCI6MjEwNDc1Mjg0OH0.O3VbSmdOCFbk6hj6O7QDzjEevBFFngCnAkUZ9y8jlgI',

  /* URL base de las funciones de borde. Será
     'https://vauarfofsfgwnuyjfpni.supabase.co/functions/v1' en cuanto haya
     alguna desplegada; hasta entonces se queda vacía a propósito, para que
     nadie llame a un sitio que devuelve 404. Ahí vivirán el árbitro, el
     mediador, la transcripción y el cribado. Nunca se llama al modelo desde el
     navegador: la clave de Anthropic no puede salir del servidor. */
  apiBase: '',

  /* Site key pública de Cloudflare Turnstile, para proteger el registro. Es
     pública por diseño: viaja al navegador. La secret key correspondiente vive
     solo en el servidor, como secreto de las funciones de Supabase.
     Vacío = sin verificación antirrobots (solo aceptable en local). */
  turnstileSiteKey: '0x4AAAAAAEw9BYzCxS962FOp',

  /* Versión del texto legal que acepta la persona al registrarse. */
  versionPolitica: '2026-09',

  /* Dirección canónica, para compartir. */
  urlCanonica: 'https://atwi.app/',

  /* LA VOTACIÓN DE NEGOCIACIÓN. El mediador propone tres maneras de quedar y
     cada quien marca una a ciegas; si coinciden hay acuerdo y lo firman.

     VA FUERA DE `veredicto` A PROPÓSITO: esto ocurre en la SALA, antes de que
     haya resultado, y es la pantalla que decide cuál de las dos revelaciones
     sale. Metido ahí dentro se leería como parte del veredicto, que es
     justamente lo que no es.

     EL AVISO SE DA ANTES DE VOTAR, no después: saber que todavía se va a poder
     retocar el texto es lo que hace que se vote la idea y no la redacción, que
     es lo único que la votación puede decidir. */
  negociacion: {
    /* LA ELECCIÓN. En partida local los dos están delante y eligen juntos, así
       que la pantalla les habla a los dos y no a uno. */
    titulo: 'Elijan una, entre los dos',
    aviso: 'Si ninguna les convence, márquenlo: no acordar hoy también vale. La que ' +
           'elijan la van a poder ajustar antes de firmarla.',
    ninguna: 'Ninguna nos convence',

    /* CUANDO EL MEDIADOR NO PUDO PROPONER NADA. Puede pasar porque declaró que
       no hay terreno común, porque paró por seguridad, o porque lo que se dijo
       no da material para un acuerdo que se sostenga. Se ofrece repetir, y la
       única salida es una que ellos tocan: «por ahora» es la palabra que
       importa, porque no cierra el tema. */
    sinPropuestasTitulo: 'No hay acuerdo que proponerles',
    sinPropuestas: 'Con lo que se dijo hoy no sale ninguna propuesta que se sostenga en ' +
                   'lo que dijeron los dos, y preferimos no inventar una. El tema sigue ' +
                   'ahí: pueden repetir el ejercicio cuando quieran.',
    sinPropuestasOpcion: 'Sin acuerdo por ahora',

    /* EL ACTA. Se pregunta siempre, aunque no hayan tocado el texto. */
    actaTitulo: 'El acuerdo',
    actaPregunta: '¿Lo aceptan los dos tal como está?',
    actaEditando: 'Escríbanlo como quieran que quede. Es lo que se va a guardar.',
    actaFirmar: 'Sí, firmarlo',
    actaEditar: 'Queremos editarlo antes',
    /* El mínimo no es de la pantalla: es el `check` de la tabla `acuerdos`,
       que exige entre 10 y 600 caracteres. */
    actaCorto: 'Quedó demasiado corto para guardarlo. Escriban un poco más.',
    actaGuardar: 'Listo',

    /* EL ACTA DE CUANDO NO HUBO ACUERDO. Se guarda igual, con `tipo` en
       `desacuerdo`, y por eso necesita un texto: la tabla exige de 10 a 600
       letras y aquí no hay nada que la pareja haya escrito.

       ESTO NO ES UN RELLENO PARA CONTENTAR A LA RESTRICCIÓN. `docs/02` §13 le
       da permiso expreso al mediador para declarar que no hay terreno común, y
       marcar «Ninguna» es la pareja diciendo lo mismo: es un cierre legítimo y
       merece quedar escrito como los otros. Si solo se guardaran los acuerdos,
       el historial contaría una historia en la que siempre se acuerda.

       Y NO PROMETE NADA, que es la regla 1: no dice que el tema quede resuelto
       ni pendiente, solo lo que pasó. */
    actaSinAcuerdo: 'Esta vez no encontramos un acuerdo sobre este tema. Lo hablamos ' +
                    'por turnos y cada quien dejó dicha su posición.'
  },

  /* Reglas de juego que la interfaz necesita conocer. Las de verdad las
     aplica el servidor; estas son solo para no enseñar botones imposibles.
     Vienen de docs/02-modos-y-catalogo.md. */
  reglas: {
    /* TURNOS ALTERNOS, SIEMPRE. Nadie graba sin haber escuchado antes al otro,
       con la única excepción de quien abre, que no tiene a quién escuchar.
       NO hay turnos ciegos ni simultáneos, en ningún modo y con ningún número:
       eso no es como se discute en la vida real y es justo lo que la app imita.
       Decisión del titular, 2026-09-12, y supera lo que dicen docs/02 §3 y
       docs/03 §16.

       Quién abre se decide como en ajedrez: por sorteo o de común acuerdo, se
       enseña en pantalla antes de empezar, y en la revancha abre el otro.

       De 1 a 5 turnos por persona. A un turno la ronda sigue teniendo forma
       —enunciado, A, B que le responde, resultado— pero no se puede puntuar
       «escucha y reconocimiento», porque quien abrió no tuvo a nadie a quien
       escuchar: esa modalidad se puntúa con cuatro criterios y la app lo dice. */
    turnosAlternos: true,
    quienEmpieza: 'sorteo',        // 'sorteo' | 'acordado'
    turnosMin: 1,
    /* TRES COMO MUCHO. Decisión del titular (2026-09-13); eran cinco.
       Una ronda de cinco turnos por persona son diez intervenciones y doce
       minutos de partida, y cada una cuesta transcribirla, limpiarla y
       locutarla. Tres es lo que la rúbrica necesita para puntuar los cinco
       criterios --hay apertura, respuesta y cierre-- y es donde la partida
       todavía se termina de una sentada. */
    turnosMax: 3,
    /* Y DOS DE SERIE, no tres (titular, 2026-09-16). El tope sigue en tres: lo
       que cambia es dónde arranca el selector, que es lo que de verdad elige
       casi todo el mundo. Dos por persona son cuatro intervenciones y unos
       cinco minutos, y ahí la ronda todavía tiene forma —hay apertura y
       respuesta—; el tercer turno es el cierre, y quien lo quiera lo añade con
       un toque. Vale para los dos modos: el número de turnos no es una
       propiedad del modo sino de cuánto rato quieren estar. */
    turnosPorDefecto: 2,
    /* SE QUEDA VACÍO, y con ello desaparece la única pared de pago que había:
       4 y 5 turnos estaban fuera del nivel gratuito. Al no existir esas
       opciones no hay nada que cobrar aquí, así que el cobro tendrá que
       apoyarse en otra cosa --frecuencia, revanchas, historial-- y no en la
       longitud de la partida. Se deja la lista, no la regla: volver a poner un
       cupo es añadir un número. */
    turnosConCupo: [],
    /* CUÁNTO SE PUEDE HABLAR POR TURNO, Y NO ES LO MISMO EN LOS DOS MODOS
       (decisión del titular, 2026-09-14). En Controversia se acorta a la mitad:
       medio minuto obliga a decir lo que se sostiene y poco más, que es lo que
       la rúbrica puntúa. Con un minuto entero se llega al final rellenando, y
       relleno es lo primero que el abogado tiene que quitar.

       En Negociación se queda en sesenta: ahí no se compite, se propone, y una
       propuesta necesita sitio para decir qué se ofrece y a cambio de qué.

       El tiempo se gasta ENTRE TODAS las tomas del turno: se puede parar,
       escuchar y agregar, pero lo que queda es lo que queda. */
    segundosPorTurno: { debate: 30, negociacion: 60 },
    revanchasPorTema: 2,
    revanchasPorTemporada: 4,
    revanchaVentanaHoras: [24, 336],   // de 24 horas a 14 días
    actasActivasMax: 1,
    actasVisiblesMax: 3,

    /* En modo Negociación el juez propone SIEMPRE tres acuerdos posibles y las
       dos partes votan. El que ambas eligen queda editable por quien creó el
       debate, y solo queda en firme cuando los dos pulsan aceptar. */
    propuestasDeAcuerdo: 3
  },

  /* Lo que dice el juez al cerrar una intervención. Son frases FIJAS: no las
     escribe el modelo. Dos razones. Una, que los modelos son malos decidiendo
     cuándo intervenir, y aquí el cuándo lo fija el producto. Y dos, que si el
     juez comentara lo que acabas de decir estaría evaluando a mitad de partida,
     que es justo lo que no debe hacer hasta el final.

     Ninguna valora ni da la razón: solo acusan recibo y pasan el turno. */
  frasesDelJuez: [
    'Te escuché. Veamos qué dice la otra parte.',
    'Anotado tal cual lo dijiste. Turno de enfrente.',
    'Lo tengo. Ahora escucho a la otra persona.',
    'Registrado. Que hable la otra parte.',
    'Hasta aquí lo tuyo. Escuchemos el otro lado.'
  ],

  /* Al cerrarse la última intervención, antes de que el juez se retire a pensar.
     Tres variantes para que no suene a grabación. También fijas. */
  frasesDeCierre: [
    'Ya tengo todos los argumentos. Voy a deliberar.',
    'Con esto me basta. Denme un momento para pensarlo.',
    'Terminamos la ronda. Ahora me toca a mí.'
  ],

  /* El momento del resultado. Frase, cuenta atrás y redoble.
     El redoble NO puede sonar solo: la política de autoreproducción deja el
     audio suspendido hasta que hay un gesto, así que todo arranca del toque en
     «Ver el resultado» y nunca automáticamente (docs/01 §8.6). */
  veredicto: {
    /* De aquí sale el nombre de la app: And The Winner Is. Cada tramo es una
       pieza dibujada con su inicial grande y en color de marca, para que se lea
       ATWI un instante antes de leerse la frase.
       Cada tramo va como [archivo en img/atwi, lo que se lee en voz alta]. */
    frase: [['And', 'And'], ['The', 'The'], ['Winner', 'Winner'], ['Is', 'Is…']],

    /* `segundosCuentaAtras` VIVIA AQUI Y SE FUE (decision del titular,
       2026-09-14). Eran 3-2-1 con un numero grande y su redoble; se probo una
       tarde entera el timing corto del probador y es mejor: el 3-2-1 no anade
       tension, anade espera, y en un juego que se abre muchas veces la
       ceremonia larga es lo primero que cansa. Ahora la secuencia es frase ->
       un segundo quieto con redoble -> resultado, y ese segundo vive en
       `veredicto.js` porque es parte de la animacion, no una preferencia. */

    /* En Negociación no gana una persona: o ganan los dos o no gana nadie.
       CON ACUERDO DICE «AMBOS» Y NADA MÁS (decisión del titular, 2026-09-14).
       Decía «la relación» con pareja y «los dos» con amigos, y con el acuerdo
       los dos avatares entran grandes desde sus lados: el titular tiene que
       caber entre ellos, así que una palabra corta e igual para los dos. La
       frase que explicaba el acuerdo se fue entera a la pantalla del juez, que
       es quien lo presenta. */
    ganadorNegociacion: { pareja: 'Ambos', amigos: 'Ambos' },

    /* CUANDO NO LLEGA RESPUESTA. No se revela nada y no se inventa nada: la
       partida se queda donde estaba --deliberando-- y se ofrece volver a
       pedirlo. La ronda entera está grabada y guardada; lo que falló es UNA
       llamada, así que lo que se reintenta es la llamada y no la partida, y eso
       es lo que el texto tiene que dejar claro para que nadie tema perder lo
       que ya grabó. */
    /* NO CONTESTAR NO ES UN RESULTADO, Y ESTA PANTALLA TIENE QUE DECIRLO
       (queja del titular, 2026-09-15: «el no contesta no nos sirve de nada»).
       Decía «No pude traer el resultado», que se lee igual que «no hubo
       resultado», y las dos cosas no se parecen en nada: sin veredicto es una
       decisión del juez sobre la ronda —la leyó entera— y esto es una llamada
       que no llegó, con nadie habiendo leído nada. Por eso aquí se dice en voz
       alta que no pasó nada todavía y que la ronda sigue entera. */
    falloTitulo: 'No llegó la respuesta',
    fallo: 'Esto no es un resultado: nadie alcanzó a leer la ronda. Lo que ' +
           'grabaron está guardado entero y no se pierde. Volvemos a pedirlo y ya.',
    reintentar: 'Volver a pedirlo',

    /* SIN ACUERDO NO DICE «AMBOS», y el titular tiene que ser otro. Antes los
       dos finales compartían titular --«la relación»-- y ya chirriaba; con
       «Ambos» pasa a ser una contradicción de dos renglones: «Ambos» encima de
       «esta vez no hubo acuerdo». Aquí no ganó nadie y el titular lo dice sin
       adornarlo; que negociar valió igual lo dice la frase de debajo, y el juez
       lo desarrolla en la pantalla siguiente. */
    tituloSinAcuerdo: 'Sin acuerdo',

    /* AQUÍ ESTABA `tituloSinMediador`, «Ronda guardada», Y SE FUE (decisión del
       titular, 2026-09-15). Era el final de la partida cuyo mediador no
       contestaba, y el titular lo llamó por su nombre: no sirve de nada. Tenía
       el cartel grande, los dos avatares entrando y el botón de «qué dijo el
       juez» —toda la puesta en escena de un desenlace— para decir que no había
       ninguno. Ahora esa partida no llega a la revelación: se queda en
       deliberando y se vuelve a pedir. Ver `noContesto()` en `partida.js`. */
    /* `conAcuerdo` VIVÍA AQUÍ Y SE QUITÓ. Era la frase de debajo del titular
       cuando había acuerdo, y con los dos avatares entrando grandes no hay sitio
       ni falta hace: lo que el acuerdo dice lo presenta el juez en la pantalla
       siguiente, con el texto entrecomillado y `juezNegociacion.conAcuerdo`
       debajo. Un texto visible que ya no se pinta en ningún sitio es peor que no
       tenerlo: el día que alguien lo cambie va a creer que cambió algo.
       `sinAcuerdo` SE QUEDA: ahí no entra nadie grande y esa frase es lo único
       que hay en pantalla. */
    sinAcuerdo: 'Esta vez no hubo acuerdo, y no pasa nada. Practicaron el arte de diferir ' +
                'sin molestarse, y eso ya es una gran victoria.',

    /* AL EMPATE SE LLEGA POR CUATRO CAMINOS Y NO SIGNIFICAN LO MISMO. Aquí
       decía una sola frase, «los dos defendieron igual de bien», y era falsa en
       tres de los cuatro: cuando nadie llegó a sostener nada, cuando el juez se
       contradijo entre pasadas y cuando los dos puntuaron bajo y parecido.
       Felicitar por un empate que fue un desierto es de las pocas maneras de
       que un veredicto se lea como burla.
       La clave la manda el árbitro; `parejo` es la única que celebra. */
    /* LA FORMA DEL DESACUERDO, dicha por la pantalla (S8, 2026-09-18). El juez
       la clasifica en tres (v2.0) y la pantalla la lee: con `opuestas` no hace
       falta decir nada --es lo que se espera de un debate--; con `de_acuerdo`
       hay que decirlo antes que nada, porque cambia la lectura de todo el
       veredicto: gana quien lo sustentó mejor, no quien tenía otra idea. */
    forma: {
      de_acuerdo: 'Los dos respondieron lo mismo con palabras distintas. No es un fallo: ' +
                  'el juez puntuó quién sostuvo mejor esa idea.',
      sin_postura: 'Alguien no llegó a fijar una posición sobre el tema. El juez puntuó ' +
                   'solo lo que sí se sostuvo.'
    },
    /* LA VICTORIA POR ABANDONO (modo en línea, 2026-09-18): «el juez evalúa
       pero declara ganador por abandono a quien intervino de último». Se dice
       primero, porque el desglose de abajo es lo que el juez leyó y no lo que
       decidió. `{ganador}` es el nombre. */
    abandono: 'La otra parte no contestó en 24 horas: {ganador} gana por abandono. ' +
              'Lo de abajo es lo que el juez leyó de la ronda.',
    empate: {
      /* LOS 8 PUNTOS LOS DICE LA PANTALLA, NO EL JUEZ (v2.3, S16): la regla de
         los 8 la aplica el codigo con los totales, asi que el modelo escribe la
         justificacion sin saber si al final hubo ganador o empate. La frase
         «no llego a 8» que el prompt le pedia no podia escribirla; va aqui. */
      parejo: 'Quedaron muy parejos: la diferencia no llegó a los 8 puntos que hacen falta ' +
              'para dar un ganador. El empate es un resultado, no un fallo.',
      seDioVuelta: 'El juez leyó la ronda dos veces, y cada vez le dio el punto a uno ' +
                   'distinto. Cuando eso pasa, el resultado es empate: separarlos sería ' +
                   'fiarse de por dónde empezó a leer.',
      sinPostura: 'Ninguno de los dos llegó a fijar una posición, así que no hubo dos ' +
                  'cosas que comparar. Queda empate.',
      generico: 'La ronda quedó empatada. El empate es un resultado, no un fallo.'
    },

    /* LA FRASE DE CIERRE LA ESCRIBE EL CLIENTE, no el árbitro. Era un campo
       suyo (`texto_visible`) y salió del esquema el 2026-09-14: la propia §11
       del prompt dice dos renglones más arriba que el texto localizado va como
       CLAVE y lo resuelve el cliente, así que pedirle una frase libre se
       contradecía consigo mismo. Y hacía falta un hueco: la API topa en 16
       campos opcionales para este esquema, medido, y las dos frases nuevas de
       «qué defendió bien cada uno» valen más que una frase de cierre que
       siempre dice lo mismo. */
    conGanador: 'Defendió mejor su idea en esta ronda.',

    /* Mientras el árbitro trabaja: normalización más dos pasadas en serie, un
       minuto largo. Se dice cuánto va a tardar para que nadie crea que se colgó. */
    deliberando: 'El juez está leyendo las intervenciones. Suele tardar cerca de un minuto.',

    /* LAS DOS PARADAS. No hay ganador ni empate: la partida no cuenta para
       nadie. En la blanda se enseñan los dos párrafos de «lo que dijo cada uno»,
       que son lo único compartible; en la dura no se enseña nada y el sistema
       pone la pantalla de recursos (docs/02 §12.4), que todavía no existe. Ni
       una ni otra dicen por qué: nombrar el patrón está prohibido.

       EL TITULAR PIDIÓ QUE ESTO DIJERA «EMPATE» y aquí no puede (2026-09-14).
       «Sin resultado» sonaba a avería, y en eso tenía razón; pero empate es un
       resultado ganado por los dos, y a esta pantalla se llega sobre todo por
       el veto de sometimiento: alguien se estuvo rindiendo y el juez se negó a
       coronar al otro. Escribir «empataron, los dos defendieron muy bien» ahí
       es justo la mentira que el veto existe para evitar, y encima no hay
       puntuación que enseñar —en esa rama el juez no puntúa nada—. Va el
       vocabulario que el propio producto ya tenía para esto («hoy no había
       partido», docs/02 §13.1): no es una avería y no es un empate. */
    sinResultado: {
      /* «SIN VEREDICTO» Y NO «HOY NO HUBO PARTIDO» (2026-09-14). El titular
         dijo que la pantalla anterior se leía «como si el juez hubiese
         fallado», y tenía razón: «no hubo partido» describe algo que no
         ocurrió, y lo que ocurrió es que el juez MIRÓ la ronda y decidió no
         puntuarla. Ahora lo dice él y en primera persona, que es la diferencia
         entre una avería y una decisión. Lo que sigue sin decirse es POR QUÉ:
         nombrar el patrón está prohibido. */
      blandaTitular: 'Sin veredicto',
      blanda: 'El juez decidió no puntuar esta ronda. Lo que dijo cada quien queda registrado.',
      /* EN PACTO NO HAY VEREDICTO QUE NEGAR NI JUEZ QUE PUNTÚE (S26, 2026-09-18).
         La parada blanda del mediador salía con los textos del árbitro --«esta
         no la puntúo», «no siempre hay un veredicto que dar»-- en un modo donde
         nadie puntúa. El mediador dice lo suyo: leyó la ronda y hoy no propone.
         Lo que sigue sin decirse es POR QUÉ, igual que en el árbitro. */
      blandaTitularNegociacion: 'Sin propuestas',
      blandaNegociacion: 'El mediador leyó la ronda y decidió no proponer. Lo que dijo cada quien queda registrado.',
      diceBlandaNegociacion: 'Leí la ronda entera y la decisión es mía: hoy no propongo nada. No ' +
                             'siempre hay una manera de quedar que salga de los dos, y ' +
                             'fabricarla sería peor que no proponerla.',
      /* EL CIERRE (S12 en el árbitro desde su v2.2, S26 aquí): la única frase de
         la parada que deja algo que hacer. Los párrafos dicen qué pidió cada uno;
         esto es lo común. Se rotula para que no se lea como un tercer párrafo. */
      rotuloCierre: 'Para la próxima vez',

      /* LA DURA NO ES LA BLANDA Y NO PUEDE DECIR LO MISMO. La blanda es
         asimetría --la ronda no tuvo partido-- y lleva copy lúdico y su reporte.
         La dura salta con señales de otra clase: daño físico, amenazas, armas,
         ideación suicida, miedo explícito, control, un menor en riesgo
         (`docs/02` §578). Ahí el texto es EL MISMO PARA LOS DOS, neutro, y está
         escrito en el documento palabra por palabra. Se copia tal cual.

         Y NO SE DICE NI QUIÉN NI POR QUÉ, igual que en la blanda pero por otro
         motivo: aquí decirlo le enseñaría a quien amenaza qué detectó la app, y
         le pondría una etiqueta encima a quien tiene miedo. El prompt tiene
         prohibido hasta mencionar violencia, autolesión o salud mental: el
         sistema pinta el mensaje, no el modelo. */
      duraTitular: 'Esta partida se detiene aquí',
      dura: 'ATWI es un juego y hay conversaciones que no son para un juego.',
      /* LAS DOS PRIMERAS FRASES DICEN QUIÉN DECIDIÓ Y SOBRE QUÉ, porque de ahí
         venía la confusión del titular (2026-09-15: «no entiendo la diferencia
         entre parada dura y no contesta»). Las tres pantallas terminaban una
         ronda sin puntuación y ninguna decía en qué se diferencian, así que las
         tres se leían como la misma avería. Ahora cada una abre diciéndolo:
         la blanda, que el juez leyó la ronda y la decisión es suya; la dura,
         que la detiene el juego a propósito; y la de no contestar, que no pasó
         nada todavía (ver `fallo`, más arriba). Sigue sin decirse POR QUÉ en
         las dos paradas: nombrar el patrón está prohibido. */
      diceBlanda: 'Leí la ronda entera y la decisión es mía: esta no la puntúo. No ' +
                  'siempre hay un veredicto que dar, y forzarlo sería peor que no darlo.',
      /* LO QUE SE DICE EN LA PARADA DURA, Y LO QUE NO (decisión del titular,
         2026-09-18): la app solo dice que este tema no lo puede juzgar ni
         negociar, y que lo hablen. NO da números de líneas de ayuda, NO
         direcciona a buscar ayuda y NO recomienda nada más: eso es asumir una
         responsabilidad que no se quiere asumir. `docs/01` §327 y §735 pedían
         la pantalla de recursos por país; esa pantalla NO se construye. La
         partida queda detenida en el historial, no permite hacer nada más y se
         puede borrar. Y el mensaje es el mismo para los dos: la app no decide
         quién amenaza. */
      diceDura: 'ATWI es un juego y hay conversaciones que no son para un juego. Este ' +
                'tema no lo puedo juzgar ni negociar. La partida queda detenida: sin ' +
                'puntuación, sin ganador y sin propuestas.',

      /* EL REPORTE DE LA PARADA, que `docs/02` §594 llama obligatorio: «lo que
         dijo cada uno», con la misma maquetación y el mismo peso visual que la
         tarjeta de veredicto, sin ganador, sin desglose y sin valoración.
         Estaba produciéndose y se pintaba como dos renglones sueltos. */
      rotuloDichos: 'Lo que dijo cada uno',

      /* PROVISIONAL, Y SE VE QUE LO ES. Aquí va la pantalla de recursos por
         país que `docs/01` §327 y §735 exigen. Hasta que los números estén
         verificados, la pantalla dice lo único que se puede sostener sin
         ellos. */
      duraCierre: 'Este tema háblenlo fuera del juego. Aquí queda guardada la partida, ' +
                  'detenida, y la pueden borrar cuando quieran.',

      /* QUÉ PASA CON LA RONDA Y PARA QUÉ SIRVE LO QUE QUEDA. Esto faltaba
         entero y era la mitad de la queja del titular (2026-09-15): la pantalla
         decía que lo dicho quedaba registrado y no decía por qué ni para qué,
         así que se leía como un archivo muerto.
         Las tres cosas que sí se pueden decir sin nombrar el patrón: que nadie
         perdió, que la ronda no cuenta, y que lo guardado es la postura de cada
         uno con sus propias palabras --que es justo lo que hace falta para
         poder retomarlo sin empezar de cero, y lo que evita el «yo nunca dije
         eso»--.
         LO QUE NO SE DICE ES EL MOTIVO: ver la nota larga en veredicto.js.

         AQUÍ DECÍA «SIRVE PARA VOLVER SOBRE EL TEMA SIN EMPEZAR DE CERO» Y ERA
         MENTIRA (lo cazó el titular, 2026-09-15). No hay nada que reutilice el
         material de una ronda guardada: la revancha de Controversia arranca con
         las intervenciones en blanco y el árbitro no recibe la ronda anterior
         como contexto; lo único que hereda algo es la REVISIÓN de un acuerdo de
         Pacto, que toma el acta registrada (`docs/02` §5 y §13, llamada 4). Así
         que esa frase prometía una función que no existe, en la pantalla donde
         menos se puede prometer de más.
         Lo que sí es verdad es lo que dice ahora: queda en el historial y se
         puede volver a oír, con la voz del personaje. El día que la revancha
         lleve la ronda anterior como contexto, esta frase vuelve a crecer. */
      paraQue: 'Nadie perdió y la ronda no cuenta para ninguno de los dos. Lo que ' +
               'queda guardado son esas dos posturas, con las palabras de cada quien: ' +
               'les queda en el historial y la pueden volver a oír cuando quieran. ' +
               'El tema sigue ahí para jugarlo otra vez.'
    },

    /* LA NEGOCIACIÓN NO TIENE GANADOR, pero sí tiene resultado, y los dos
       avatares salen igual (decisión del titular, 2026-09-14). Con acuerdo, los
       dos en pose de victoria: aquí ganar es de los dos o no es de nadie. Sin
       acuerdo, los dos sentados, y el juez explica que negociar ya valió. */
    juezNegociacion: {
      conAcuerdo: 'Esto es lo que acordaron jugando. Es un recordatorio, no un ' +
                  'contrato: nadie está obligado a cumplirlo, y si deja de servirles lo ' +
                  'vuelven a hablar.',
      sinAcuerdo: 'No llegaron a un acuerdo, y negociar ya valió la pena: se escucharon ' +
                  'por turnos, sin pisarse, y cada quien sabe ahora dónde está el otro. ' +
                  'El tema sigue ahí y lo pueden volver a intentar cuando quieran.'

      /* AQUÍ ESTABA `sinMediador` Y SE FUE con «Ronda guardada» (2026-09-15).
         Era lo que el juez decía cuando nadie había propuesto nada, y no había
         nada que decir: una partida sin respuesta no llega a la pantalla del
         juez, se queda esperando la respuesta.
         Lo que sí conviene no olvidar es lo que había antes de eso: hasta el
         2026-09-14 Negociación presentaba como acuerdo de la pareja el campo
         `ejemplo` DEL CATÁLOGO, un párrafo escrito meses antes, entrecomillado
         en boca del juez como si lo hubieran escrito ellos jugando. */
    },

    /* El desglose por criterio, con nombres que se entienden sin leer la
       rúbrica. El orden es el del peso. */
    /* [clave, nombre, peso]. Hubo un cuarto elemento con el rotulo abreviado
       para la cabecera de la minitabla, y se fue: desde que va en diagonal caben
       los nombres enteros, y «Ejem.» era pedirle a alguien que adivine una
       palabra para ahorrar cinco pixeles que sobran. */
    criterios: [
      ['pertinencia', 'Al tema', 30],
      ['solidez', 'Razones', 25],
      ['evidencia', 'Ejemplos', 20],
      ['escucha', 'Escucha', 15],
      ['tono', 'Tono', 10]
    ],
    encabezadoTabla: 'Cómo argumentaron',
    conUnTurno: 'Con un solo turno no hay escucha que puntuar: son cuatro criterios.'
  }
};

/* El descargo entero, para quien no distinga sus dos mitades (la puerta de
   entrada lo pinta de corrido). Se compone aquí y no se escribe dos veces. */
window.ATWI.config.descargo =
  window.ATWI.config.descargoBase + window.ATWI.config.descargoOjo;
