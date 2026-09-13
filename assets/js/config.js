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
      que: 'Un tema en común, ambos pueden estar a favor o en contra. Un juez IA escucha ' +
           'sus argumentos, consulta qué dicen los expertos al respecto y evalúa quién ' +
           'argumenta mejor su posición frente al tema. 100% neutral: lo que cuenta para ' +
           'ganar es qué tan bien defiendes tu opinión, ¡no cuál es!',
      clave: 'No va de quién tiene la razón (eso no sirve de nada), va de que aprendas a ' +
             'defender mejor tu punto de vista.'
    },
    negociacion: {
      nombre: 'Negociación',
      partido: ['Negoc', 'IA', 'ción'],
      que: 'Un tema en el que cueste ponerse de acuerdo. Ambos presentan sus argumentos ' +
           'e ideas, y un mediador IA que escucha las dos posiciones consulta qué dicen ' +
           'los expertos sobre el tema y, según eso, propone 3 posibles acuerdos.',
      clave: 'Si ningún acuerdo satisface a las dos partes, se vale seguir en desacuerdo y ' +
             'reintentar la negociación más adelante.'
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
  descargo:
    'ATWI se apoya en modelos de IA para facilitar la resolución de conflictos y ' +
    'promover el ejercicio del debate de forma divertida. Aunque puede ayudar a mediar ' +
    'diferencias y lograr acuerdos, no reemplaza la terapia ni asesoramiento profesional.',

  gancho:
    '<span class="aviso-ia__gancho">«Es como el UNO, pero en vez de provocar ' +
    'discusiones busca solucionarlas.»</span>',

  /* Sello de la versión publicada. En el repositorio va VACÍO a propósito:
     lo rellena tools/publicar.ps1 con el SHA corto del commit, en la copia que
     sube, y con el mismo sello va el `?v=` de los CSS, los JS y el catálogo.
     Sin esto el navegador del teléfono se queda con los archivos viejos aunque
     el sitio ya esté actualizado, que es justo lo que pasó el 2026-09-12. */
  version: '7794e16',

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
    turnosPorDefecto: 3,
    /* SE QUEDA VACÍO, y con ello desaparece la única pared de pago que había:
       4 y 5 turnos estaban fuera del nivel gratuito. Al no existir esas
       opciones no hay nada que cobrar aquí, así que el cobro tendrá que
       apoyarse en otra cosa --frecuencia, revanchas, historial-- y no en la
       longitud de la partida. Se deja la lista, no la regla: volver a poner un
       cupo es añadir un número. */
    turnosConCupo: [],
    segundosPorTurno: 60,
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
    'Hemos terminado la ronda. Ahora me toca a mí.'
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
    segundosCuentaAtras: 3,

    /* En Negociación no gana una persona. Con pareja gana siempre la relación. */
    ganadorNegociacion: { pareja: 'la relación', amigos: 'los dos' },

    conAcuerdo: 'Tienen un acuerdo sobre {tema}, escrito por ustedes y firmado por los dos.',
    sinAcuerdo: 'Esta vez no hubo acuerdo, y no pasa nada. Practicaron el arte de diferir ' +
                'sin molestarse, y eso ya es una gran victoria.'
  }
};
