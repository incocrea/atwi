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
    /* El turno único está PROHIBIDO en los dos modos (docs/03 §14). En Juicio,
       porque sin réplica el criterio de escucha no tiene sobre qué puntuarse;
       en Pacto, porque dos turnos son el bucle completo de la mediación. */
    turnosMin: 2,
    turnosMax: 5,
    turnosPorDefecto: 3,
    turnosConCupo: [4, 5],       // fuera del nivel gratuito
    segundosPorTurno: 60,
    revanchasPorTema: 2,
    revanchasPorTemporada: 4,
    revanchaVentanaHoras: [24, 336],   // de 24 horas a 14 días
    actasActivasMax: 1,
    actasVisiblesMax: 3
  }
};
