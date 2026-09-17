/* ==========================================================================
   ATWI · demo.js  — LA PARTIDA DE EJEMPLO, CONGELADA

   NO SE EDITA A MANO: lo escribe `tools/demo_landing.py` leyendo una partida
   jugada de verdad. Aquí está porque la landing tiene que poder enseñar una
   partida SIN CONSULTAR NADA: si mañana se borra ese debate, o el cubo, o
   Supabase no contesta, el visor sigue funcionando igual, porque no hay
   ninguna petición que pueda fallar.

   Las `url` de las intervenciones apuntan a `assets/audio/demo/`, y eso no es
   un detalle: `partida.js` solo llama a `nube.oirDelAlmacen` cuando la url
   viene vacía, así que con ella puesta el reproductor no toca la red.

   Lo que suena es la VOZ DEL PERSONAJE —los dos lados jugaron con abogado—,
   o sea un dibujo leyendo un texto. No hay voz de ninguna persona aquí.
   ========================================================================== */
window.ATWI = window.ATWI || {};
window.ATWI.demo = {
  "abogado_invitado": true,
  "abogado_propone": true,
  "abre_lado": "propone",
  "enunciado": "Cuando se discute algo de hoy, ¿vale traer lo que pasó hace meses o hay que quedarse en lo de ahora?",
  "id": "demo",
  "invitado_avatar": "maya",
  "invitado_color": "verde",
  "invitado_nombre": "Julia",
  "juez": "vera",
  "modo": "debate",
  "propone": "demo-propone",
  "propone_avatar": "kai",
  "propone_color": "azul",
  "propone_nombre": "Harold",
  "resultado": {
    "acta": null,
    "cierre": null,
    "desglose": {
      "criterios": 5,
      "diferencia": 13.9,
      "invitado": {
        "escucha": 85,
        "evidencia": 70,
        "pertinencia": 85,
        "solidez": 78,
        "tono": 95,
        "total": 81.3
      },
      "propone": {
        "escucha": 40,
        "evidencia": 55,
        "pertinencia": 78,
        "solidez": 72,
        "tono": 90,
        "total": 67.4
      }
    },
    "empate": false,
    "forma_del_desacuerdo": "opuestas",
    "ganador_lado": "invitado",
    "justificacion": "Quien defendió separar los temas aportó un ejemplo concreto y verificable del episodio del martes. Esa misma postura reconoció con precisión el argumento contrario antes de matizarlo, algo que la otra parte no hizo.",
    "lo_mejor": {
      "invitado": "Propuso separar los temas por su nombre y momento, mostrando cómo mezclarlos impidió tratar ninguno a fondo.",
      "propone": "Sostuvo que ocultar lo anterior hace que la reacción actual parezca desproporcionada e injustificada."
    },
    "lo_que_dijo": null,
    "motivo_empate": null,
    "texto_visible": null,
    "tipo_resultado": "ganador"
  },
  "tema_catalogo": "T013",
  "turnos": 2,
  "turnos_grabados": [
    {
      "abogado": true,
      "avatar": "kai",
      "color": "azul",
      "guion": "Yo digo que sí vale traer lo de antes. Lo de hoy casi nunca es solo lo de hoy. <p640> Leí que el 80 por 100 de las discusiones de pareja son en realidad sobre cosas viejas que nunca se cerraron. <p1040> Si no se traen, no se cierran nunca. <p560> Lo del lavaplatos del martes no es el lavaplatos: es que llevo meses diciendo lo mismo. Y ya.",
      "nombre": "Harold",
      "numero": 1,
      "orden": 0,
      "perfil": "demo-propone",
      "segundos": 22,
      "transcripcion": "Yo digo que sí vale traer lo de antes, porque lo de hoy casi nunca es solo lo de hoy. Leí que el 80 por 100 de las discusiones de pareja son en realidad sobre cosas viejas que nunca se cerraron. Si no se traen, no se cierran nunca. Lo del lavaplatos del martes no es el lavaplatos, es que llevo meses diciendo lo mismo.",
      "url": "../assets/audio/demo/0.mp3"
    },
    {
      "abogado": true,
      "avatar": "maya",
      "color": "verde",
      "guion": "Yo creo que hay que quedarse en lo de ahora, porque cuando traes todo lo de antes ya no se puede arreglar nada. <p560> El martes yo quería hablar del lavaplatos y a los 2 minutos estábamos en lo de tu cumpleaños del año pasado. <p898> Ahí no arreglamos ni el lavaplatos ni el cumpleaños. <p720> Si es una cosa, se arregla. Si son diez, se pelea.",
      "nombre": "Julia",
      "numero": 1,
      "orden": 1,
      "perfil": null,
      "segundos": 22,
      "transcripcion": "Yo creo que hay que quedarse en lo de ahora, porque cuando traes todo lo de antes ya no se puede arreglar nada. El martes yo quería hablar del lavaplatos y a los 2 minutos estábamos en lo de tu cumpleaños del año pasado. Ahí no arreglamos ni el lavaplatos ni el cumpleaños. Si es una cosa, se arregla, si son 10, se pelea.",
      "url": "../assets/audio/demo/1.mp3"
    },
    {
      "abogado": true,
      "avatar": "kai",
      "color": "azul",
      "guion": "Lo de antes es la explicación de lo de ahora. <p720> Si te lo digo suelto, parece que me enojo por un plato. <p560> Y vuelvo a lo mismo: si el 80 por 100 de las peleas vienen de lo viejo, <p383> ignorarlo es pelearse por lo mismo cada semana con otro nombre. <p560> Yo prefiero decirlo entero una vez.",
      "nombre": "Harold",
      "numero": 2,
      "orden": 2,
      "perfil": "demo-propone",
      "segundos": 22,
      "transcripcion": "Entiendo lo de arreglar una cosa, pero es que lo de antes es la explicación de lo de ahora. Si te lo digo suelto parece que me enojo por un plato. Y vuelvo a lo mismo, si el 80 por 100 de las peleas vienen de lo viejo, ignorarlo es pelearse por lo mismo cada semana con otro nombre. Yo prefiero decirlo entero una vez.",
      "url": "../assets/audio/demo/2.mp3"
    },
    {
      "abogado": true,
      "avatar": "maya",
      "color": "verde",
      "guion": "Te entiendo que lo de antes explique por qué te pesa, y eso sí lo quiero saber. <p640> Lo que no quiero es que cada cosa chica abra el expediente entero. <p640> Podemos hablar lo de antes, pero en su momento y por su nombre, no metido en la discusión del lavaplatos. <p963> Así el martes arreglamos el martes, y lo del año pasado tiene su propio día.",
      "nombre": "Julia",
      "numero": 2,
      "orden": 3,
      "perfil": null,
      "segundos": 22,
      "transcripcion": "Te entiendo que lo de antes explique por qué te pesa, y eso sí lo quiero saber. Lo que no quiero es que cada cosa chica abra el expediente entero. Podemos hablar lo de antes, pero en su momento y por su nombre, no metido en la discusión del lavaplatos. Así el martes arreglamos el martes, y lo del año pasado tiene su propio día.",
      "url": "../assets/audio/demo/3.mp3"
    }
  ]
};
