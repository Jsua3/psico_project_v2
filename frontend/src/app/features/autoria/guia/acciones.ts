/**
 * Acciones que la guía y el buscador saben mostrar. Cada una vive en una pantalla y tiene un
 * elemento marcado con `data-accion="<id>"` (puede haber varias ids separadas por espacio).
 * En `ruta`, «:sala» y «:escena» se cambian por la sala o escena elegida (o la primera).
 */
export interface Accion {
  id: string;
  nombre: string;
  /** Cómo se llama la pantalla ante el docente. */
  pantalla: string;
  ruta: string;
  /** Otras palabras con las que el docente la buscaría. */
  palabras?: string;
  pasos?: string[];
  /** Por paso, los selectores (por prioridad) del elemento que se señala; si ninguno está, queda el anterior. */
  objetivos?: string[][];
  /** Lo que dice la guía al mostrarla. */
  ayuda: string;
}

export const PANTALLAS = {
  inicio: 'Mis casos',
  lugar: 'Elegir un lugar',
  salas: 'Elegir salas',
  mapa: 'Escenas y caminos',
  sala: 'Editar una sala',
  guion: 'Guion de una escena',
  finales: 'Finales del caso',
  probar: 'Probar como estudiante',
  revision: 'Enviar a revisión',
  cabecera: 'Cualquier pantalla (arriba)',
} as const;

export const ACCIONES: readonly Accion[] = [
  { id: 'crear-caso', nombre: 'Crear un caso nuevo', pantalla: PANTALLAS.lugar, ruta: '/lugar', palabras: 'empezar nuevo comenzar', ayuda: 'Desde aquí empiezas un caso nuevo eligiendo un lugar.' },
  { id: 'elegir-lugar', nombre: 'Elegir el lugar del caso', pantalla: PANTALLAS.lugar, ruta: '/lugar', palabras: 'universidad casa comisaria sitio', ayuda: 'Elige el lugar donde pasa tu caso; recibes una copia de sus salas y personajes.' },
  { id: 'elegir-salas', nombre: 'Elegir las salas del caso', pantalla: PANTALLAS.salas, ruta: '/salas', palabras: 'recorrido idea lugares cuartos', ayuda: 'Marca las salas que usará tu caso, o usa una idea para empezar.' },
  { id: 'abrir-sala', nombre: 'Abrir la sala de una escena', pantalla: PANTALLAS.mapa, ruta: '/editor', palabras: 'ver lugar decorado muebles', ayuda: 'Con una escena elegida, «Abrir sala» te lleva a editar su sala.' },
  { id: 'mover-mueble', nombre: 'Mover un mueble o un personaje en la sala', pantalla: PANTALLAS.sala, ruta: '/editor/sala/:sala', palabras: 'arrastrar ubicar posición cambiar de lugar', ayuda: 'Arrastra lo que quieras mover, o elígelo y usa las flechas del teclado.' },
  {
    id: 'cambiar-expresion', nombre: 'Cambiar la expresión de un personaje', pantalla: PANTALLAS.sala, ruta: '/editor/sala/:sala',
    palabras: 'cara gesto emocion triste alegre preocupada',
    pasos: ['Elige al personaje en la lista «En esta sala».', 'En «Detalles», abre «Expresión» y elige la cara.', 'El retrato cambia al instante. Ctrl+Z lo deshace.'],
    objetivos: [['[data-accion~="cambiar-expresion"]'], ['#expresion', '.columna-detalles'], ['.escenario [data-elemento^="personaje"]', '.escenario']],
    ayuda: 'Elige al personaje en la lista; su expresión se cambia en «Detalles».',
  },
  { id: 'agregar-mueble', nombre: 'Agregar un mueble, un objeto o un personaje a la sala', pantalla: PANTALLAS.sala, ruta: '/editor/sala/:sala', palabras: 'catalogo poner sumar silla mesa', ayuda: 'En el catálogo del lugar eliges qué agregar; aparece en el centro de la sala.' },
  { id: 'quitar-elemento', nombre: 'Quitar algo de la sala', pantalla: PANTALLAS.sala, ruta: '/editor/sala/:sala', palabras: 'borrar eliminar sacar', pasos: ['Elige lo que quieres quitar en la sala o en la lista.', 'Pulsa «Quitar de la sala» o la tecla Supr.'],
    objetivos: [['.escenario'], ['.quitar', '.columna-detalles']], ayuda: 'Elige algo y pulsa «Quitar de la sala» (o Supr).' },
  { id: 'volver-sala-original', nombre: 'Volver a la sala original', pantalla: PANTALLAS.sala, ruta: '/editor/sala/:sala', palabras: 'deshacer restaurar como venia original', ayuda: 'Deja la sala como viene en el lugar. Se puede deshacer.' },
  { id: 'agregar-escena', nombre: 'Agregar una escena', pantalla: PANTALLAS.mapa, ruta: '/editor', palabras: 'nueva escena sumar', ayuda: 'Agrega una escena después de la que tienes elegida.' },
  { id: 'conectar-escenas', nombre: 'Conectar una escena con otra', pantalla: PANTALLAS.mapa, ruta: '/editor', palabras: 'unir camino flecha llevar', ayuda: 'En «Acciones» de la escena elegida, usa «Conectar con…».' },
  { id: 'marcar-final', nombre: 'Marcar una escena como final', pantalla: PANTALLAS.mapa, ruta: '/editor', palabras: 'terminar cierre fin', ayuda: 'En «Acciones» de la escena elegida, usa «Marcar como final».' },
  { id: 'abrir-guion', nombre: 'Escribir el guion de una escena', pantalla: PANTALLAS.mapa, ruta: '/editor', palabras: 'diálogo líneas libreto texto', ayuda: 'Con una escena elegida, «Abrir guion» te lleva a escribir lo que dicen.' },
  { id: 'agregar-linea', nombre: 'Agregar una línea de diálogo', pantalla: PANTALLAS.guion, ruta: '/editor/escena/:escena', palabras: 'diálogo dice personaje habla texto', ayuda: 'Agrega lo que dice un personaje, con su expresión.' },
  { id: 'agregar-respuesta', nombre: 'Agregar una respuesta del estudiante', pantalla: PANTALLAS.guion, ruta: '/editor/escena/:escena', palabras: 'opción decisión elegir contestar', ayuda: 'Agrega una respuesta, con su clasificación y lo que lee el estudiante después.' },
  {
    id: 'respuesta-a-escena-nueva', nombre: 'Hacer que una respuesta abra un camino nuevo', pantalla: PANTALLAS.guion, ruta: '/editor/escena/:escena',
    palabras: 'camino nuevo rama llevar a escena nueva',
    pasos: ['En una respuesta, abre «Lleva a…».', 'Elige «Una escena nueva».', 'Pulsa «Crear la escena nueva»: queda conectada.'],
    objetivos: [['select[id^="rl"]', '[data-accion~="respuesta-a-escena-nueva"]'], ['select[id^="rl"]', '[data-accion~="respuesta-a-escena-nueva"]'], ['.crear-escena-nueva', 'select[id^="rl"]', '[data-accion~="respuesta-a-escena-nueva"]']],
    ayuda: 'En «Lleva a…» de una respuesta, elige «Una escena nueva» y pulsa «Crear la escena nueva».',
  },
  { id: 'revisar-caminos', nombre: 'Revisar los caminos del caso', pantalla: PANTALLAS.mapa, ruta: '/editor', palabras: 'avisos problemas errores sin salida', ayuda: 'Aquí están los avisos de caminos; «Llévame ahí» te lleva a la escena.' },
  { id: 'hitos-del-caso', nombre: 'Ver los hitos del caso y dónde se cumplen', pantalla: PANTALLAS.mapa, ruta: '/editor', palabras: 'pasos profesionales cumplir decisivo inalcanzable valorar riesgo', ayuda: 'En «Hitos del caso» ves cada paso profesional, dónde se cumple y si nadie podría lograrlo.' },
  { id: 'intensidad-escena', nombre: 'Cambiar la intensidad de una escena y su aviso', pantalla: PANTALLAS.guion, ruta: '/editor/escena/:escena', palabras: 'baja media alta fuerte sensible advertencia aviso contenido', ayuda: 'Elige qué tan intensa es la escena; si es alta, escribe el aviso que lee el estudiante antes de empezar.' },
  { id: 'definir-finales', nombre: 'Definir los finales del caso', pantalla: PANTALLAS.finales, ruta: '/editor/finales', palabras: 'final cierre puntaje resultado', ayuda: 'Elige si los finales se calculan solos o escribes los tuyos.' },
  { id: 'deshacer', nombre: 'Deshacer el último cambio de la sala', pantalla: PANTALLAS.sala, ruta: '/editor/sala/:sala', palabras: 'atras volver error ctrl z', ayuda: 'Deshace el último cambio de la sala. También funciona Ctrl+Z.' },
  { id: 'ordenar-mapa', nombre: 'Ordenar el mapa de escenas', pantalla: PANTALLAS.mapa, ruta: '/editor', palabras: 'acomodar organizar automático', ayuda: 'Acomoda las escenas de izquierda a derecha según sus caminos.' },
  { id: 'pedir-a-la-ia', nombre: 'Pedirle algo al asistente de IA', pantalla: PANTALLAS.cabecera, ruta: '', palabras: 'inteligencia artificial ayuda escribir generar', ayuda: 'Abre el asistente: tú pides, la IA propone y tú decides qué entra.' },
  { id: 'aceptar-ia', nombre: 'Aceptar lo que sugirió la IA', pantalla: PANTALLAS.cabecera, ruta: '', palabras: 'revisar sugerido marca aprobar', ayuda: 'Lo que agrega la IA queda marcado «Sugerido por la IA» con un botón «Aceptar» en cada parte.' },
  { id: 'probar', nombre: 'Probar el caso como estudiante', pantalla: PANTALLAS.cabecera, ruta: '', palabras: 'jugar ensayar ver como estudiante', ayuda: 'Recorre el caso como lo vería un estudiante.' },
  { id: 'enviar-revision', nombre: 'Enviar el caso a revisión', pantalla: PANTALLAS.cabecera, ruta: '', palabras: 'psicología publicar terminar revisar', ayuda: 'Revisa qué falta y envía el caso a Psicología.' },
  { id: 'buscar', nombre: 'Buscar una acción por su nombre', pantalla: PANTALLAS.cabecera, ruta: '', palabras: 'buscador encontrar ctrl k', ayuda: 'Escribe con tus palabras qué quieres hacer.' },
];

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Acciones que coinciden con lo que escribió el docente, las mejores primero. */
export function buscarAcciones(consulta: string, acciones: readonly Accion[] = ACCIONES): Accion[] {
  const palabras = sinTildes(consulta).split(/[^a-zñ0-9]+/).filter((p) => p.length > 1);
  if (!palabras.length) return [...acciones];
  const puntuadas = acciones.map((a) => {
    const texto = sinTildes(`${a.nombre} ${a.palabras ?? ''} ${a.pantalla}`);
    const nombre = sinTildes(a.nombre);
    let puntos = 0;
    for (const p of palabras) {
      const raiz = p.length > 4 ? p.slice(0, p.length - 1) : p;
      if (nombre.includes(raiz)) puntos += 3;
      else if (texto.includes(raiz)) puntos += 2;
    }
    return { a, puntos };
  });
  return puntuadas.filter((x) => x.puntos > 0).sort((x, y) => y.puntos - x.puntos).map((x) => x.a);
}
