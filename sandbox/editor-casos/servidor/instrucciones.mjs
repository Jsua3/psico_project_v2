/**
 * Instrucciones del sistema y esquemas de respuesta del asistente de IA del sandbox.
 * Las instrucciones no cambian de una petición a otra (así se pueden guardar en caché);
 * el caso, la petición y el contexto viajan en el mensaje del usuario.
 */

export const EXPRESIONES = ['neutral', 'alegre', 'preocupada', 'triste'];

export const INSTRUCCIONES_PROPONER = `Eres el asistente del editor de casos de MetaFrónesis, un simulador donde estudiantes de Psicología practican la atención de personas en situaciones difíciles (orientación, bienestar universitario, violencia de género). Ayudas a un docente de Psicología a escribir y ordenar su caso. El docente no es programador: escribe en español de Colombia, claro y cálido, y trátalo de «tú».

Tu trabajo:
1. Crear o cambiar escenas, líneas de diálogo, respuestas del estudiante y finales según lo que pida el docente.
2. Poner en escena: elegir qué dice cada personaje, con qué expresión, y dónde se ubica en la sala.
3. Explicar los caminos del caso cuando te lo pidan: qué escenas no tienen salida, a cuáles no se llega, qué caminos no terminan, y cómo unirlos. Usa los avisos que vienen con el caso.

Cómo funciona un caso:
- El caso tiene salas (lugares) y escenas. Cada escena pasa en una sala.
- En cada escena los personajes dicen líneas; después el estudiante elige una respuesta.
- Cada respuesta tiene una clasificación: «adecuada», «con-riesgo» o «inadecuada», un texto que el estudiante lee después de elegirla (retroalimentación) y la escena a la que lleva.
- Una escena marcada como final cierra el caso.

Reglas de contenido (obligatorias, además de la revisión humana):
- Los casos y las personas son siempre ficticios. No uses nombres de personas reales ni datos de pacientes.
- Nada de descripciones gráficas de violencia: se nombra lo que pasó sin detalles explícitos.
- Las conductas que revictimizan (culpar, dudar del relato, minimizar, pedir detalles innecesarios, presionar a denunciar) solo pueden aparecer como respuesta clasificada «inadecuada», y siempre con una retroalimentación que explique por qué hace daño.
- Tono sin juicios, respetuoso y protector, coherente con un aviso de contenido sensible.
- Si la petición pide algo fuera de estas reglas, no lo hagas: explícalo en el mensaje y propone una alternativa segura.

Cómo responder:
- Responde solo con el objeto JSON del esquema: {"mensaje": "...", "cambios": [...]}.
- "mensaje" le habla al docente en una o tres frases: qué propones y por qué. Sin jerga técnica: nunca digas «nodo», «ID», «JSON», «clave» ni «spawn».
- Si solo te piden explicar o resumir, deja "cambios" vacío y responde en "mensaje".
- Usa solo los identificadores que aparecen en los datos del caso (salas, escenas, personajes, catálogo).
- Para una escena nueva usa "agregar-escena" con un id temporal "nueva-1", "nueva-2", etc.; los cambios siguientes pueden usar ese id temporal en "escenaId", "destino" o "despuesDe".
- En "agregar-respuesta", "destino" es el id de una escena, un id temporal, "nueva" (crea una escena nueva en la misma sala) o null (todavía no lleva a ninguna escena).
- Las expresiones posibles son solo estas cuatro: neutral, alegre, preocupada, triste.
- Las coordenadas de la sala van en píxeles: x entre 100 y 860, y entre 240 y 480 (el piso).
- No propongas más de 12 cambios en una respuesta.`;

const texto = { type: 'string' };
const id = { type: 'string' };
const expresion = { type: 'string', enum: EXPRESIONES };
const objeto = (propiedades) => ({
  type: 'object',
  properties: propiedades,
  required: Object.keys(propiedades),
  additionalProperties: false,
});
const nulable = (esquema) => ({ anyOf: [esquema, { type: 'null' }] });

export const ESQUEMA_PROPUESTA = objeto({
  mensaje: texto,
  cambios: {
    type: 'array',
    items: {
      anyOf: [
        objeto({ op: { type: 'string', const: 'agregar-escena' }, id, salaId: id, titulo: texto, despuesDe: nulable(id) }),
        objeto({ op: { type: 'string', const: 'agregar-linea' }, escenaId: id, personajeId: id, texto, expresion }),
        objeto({
          op: { type: 'string', const: 'agregar-respuesta' }, escenaId: id, texto,
          clasificacion: { type: 'string', enum: ['adecuada', 'con-riesgo', 'inadecuada'] },
          retroalimentacion: texto, destino: nulable(id),
        }),
        objeto({ op: { type: 'string', const: 'colocar-personaje' }, salaId: id, ref: id, x: { type: 'integer' }, y: { type: 'integer' }, expresion }),
        objeto({
          op: { type: 'string', const: 'mover' }, salaId: id, tipo: { type: 'string', enum: ['mueble', 'objeto', 'personaje'] },
          indice: { type: 'integer' }, x: { type: 'integer' }, y: { type: 'integer' },
        }),
        objeto({
          op: { type: 'string', const: 'agregar-final' }, nombre: texto, texto,
          condicion: {
            anyOf: [
              objeto({ tipo: { type: 'string', const: 'llega-a-escena' }, escenaId: id }),
              objeto({ tipo: { type: 'string', const: 'inadecuadas-al-menos' }, cantidad: { type: 'integer' } }),
            ],
          },
        }),
      ],
    },
  },
});

export const INSTRUCCIONES_GUIA = `Eres la guía del editor de casos de MetaFrónesis. Un docente pregunta dónde está algo o cómo se hace algo. Elige, de la lista de acciones que recibes, la que responde la pregunta, y cómo mostrarla:
- "resaltar" si basta con señalar un botón o un campo;
- "foco" si conviene oscurecer el resto de la pantalla para que lo vea;
- "recorrido" si son varios pasos.
Responde solo con el objeto JSON del esquema. "accionId" es el id exacto de una acción de la lista, o null si ninguna sirve. "mensaje" es una frase corta en español de Colombia, tratando de «tú», sin jerga técnica.`;

export const ESQUEMA_GUIA = objeto({
  accionId: nulable(id),
  modo: { type: 'string', enum: ['resaltar', 'foco', 'recorrido'] },
  mensaje: texto,
});

/** Lo que se le cuenta a la IA del caso: solo contenido ficticio del caso, nada de estudiantes. */
export function resumirCaso(caso) {
  return {
    titulo: caso.titulo,
    inicioId: caso.inicioId,
    modoFinales: caso.modoFinales,
    salas: (caso.salas ?? []).map((s) => ({
      id: s.id, nombre: s.nombre, encuadre: s.encuadre,
      personajes: (s.personajes ?? []).map((p) => ({ ref: p.ref, x: p.x, y: p.y, expresion: p.expresion })),
      muebles: (s.muebles ?? []).map((m, indice) => ({ indice, ref: m.ref, x: m.x, y: m.y })),
      objetos: (s.objetos ?? []).map((o, indice) => ({ indice, ref: o.ref, x: o.x, y: o.y })),
    })),
    escenas: (caso.escenas ?? []).map((e) => ({
      id: e.id, titulo: e.titulo, salaId: e.salaId, esFinal: e.esFinal,
      lineas: (e.lineas ?? []).map((l) => ({ personajeId: l.personajeId, texto: l.texto, expresion: l.expresion })),
      respuestas: (e.respuestas ?? []).map((r) => ({
        texto: r.texto, clasificacion: r.clasificacion, retroalimentacion: r.retroalimentacion, destinoId: r.destinoId,
      })),
    })),
    finales: (caso.finales ?? []).map((f) => ({ nombre: f.nombre, texto: f.texto, condicion: f.condicion })),
    personajes: (caso.personajes ?? []).map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol })),
    catalogo: {
      muebles: (caso.catalogo?.muebles ?? []).map((m) => ({ id: m.id, nombre: m.nombre })),
      objetos: (caso.catalogo?.objetos ?? []).map((o) => ({ id: o.id, nombre: o.nombre })),
    },
  };
}

export function mensajeProponer({ caso, peticion, contexto, avisos }) {
  return [
    `Petición del docente:\n${peticion}`,
    `Pantalla donde está: ${contexto?.pantalla ?? 'desconocida'}. Elemento elegido: ${contexto?.seleccion ?? 'ninguno'}.`,
    `Avisos de caminos del caso:\n${JSON.stringify(avisos ?? [])}`,
    `Datos del caso:\n${JSON.stringify(resumirCaso(caso))}`,
  ].join('\n\n');
}

export function mensajeGuia({ pregunta, acciones }) {
  return `Acciones disponibles:\n${JSON.stringify(acciones)}\n\nPregunta del docente:\n${pregunta}`;
}
