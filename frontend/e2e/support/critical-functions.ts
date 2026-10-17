/**
 * Las funciones críticas contra las que se mide el «100 %» de RNF-004 (plan visual §11.3, F9-2): cada una se recorre
 * SOLO con teclado en `e2e/keyboard-critical.e2e.ts`, y `critical-functions.spec.ts` exige que ninguna quede sin su
 * prueba y que ninguna prueba cuelgue de una función que la tabla no nombra. Si el plan agrega o retira una función, se
 * cambia aquí y en la prueba al mismo tiempo.
 */
export type CriticalRole = 'todos' | 'estudiante' | 'profesor' | 'admin';

export interface CriticalFunction {
  /** Código corto: letra del rol (T, E, P, A) y número; encabece el título de la prueba entre corchetes. */
  id: string;
  role: CriticalRole;
  label: string;
}

export const CRITICAL_FUNCTIONS: readonly CriticalFunction[] = [
  { id: 'T01', role: 'todos', label: 'Iniciar sesión' },
  { id: 'T02', role: 'todos', label: 'Cerrar sesión' },
  { id: 'T03', role: 'todos', label: 'Solicitar acceso' },
  { id: 'T04', role: 'todos', label: 'Saltar al contenido y a la navegación' },
  { id: 'T05', role: 'todos', label: 'Usar el menú y el menú de cuenta' },
  { id: 'T06', role: 'todos', label: 'Abrir y cerrar diálogos con el foco correcto' },

  { id: 'E01', role: 'estudiante', label: 'Abrir el catálogo' },
  { id: 'E02', role: 'estudiante', label: 'Ver la ficha del caso' },
  { id: 'E03', role: 'estudiante', label: 'Aceptar el aviso de contenido' },
  { id: 'E04', role: 'estudiante', label: 'Comenzar, continuar y pausar un intento' },
  { id: 'E05', role: 'estudiante', label: 'Moverse y acercarse a personas y objetos («Ir a…»)' },
  { id: 'E06', role: 'estudiante', label: 'Hablar y elegir opciones' },
  { id: 'E07', role: 'estudiante', label: 'Usar una herramienta' },
  { id: 'E08', role: 'estudiante', label: 'Abrir la bitácora y guardar' },
  { id: 'E09', role: 'estudiante', label: 'Abrir la ayuda y los ajustes' },
  { id: 'E10', role: 'estudiante', label: 'Salida segura' },
  { id: 'E11', role: 'estudiante', label: 'Ver el resultado y la retroalimentación' },
  { id: 'E12', role: 'estudiante', label: 'Ver el historial' },
  { id: 'E13', role: 'estudiante', label: 'Editar el avatar (elegir, guardar, restablecer)' },

  { id: 'P01', role: 'profesor', label: 'Crear un grupo' },
  { id: 'P02', role: 'profesor', label: 'Agregar o importar estudiantes' },
  { id: 'P03', role: 'profesor', label: 'Asignar un caso' },
  { id: 'P04', role: 'profesor', label: 'Ver reportes y exportar CSV' },
  { id: 'P05', role: 'profesor', label: 'Revisar la traza y calificar con rúbrica' },
  { id: 'P06', role: 'profesor', label: 'Crear y activar una rúbrica' },

  { id: 'A01', role: 'admin', label: 'Gestionar usuarios y solicitudes' },
  { id: 'A02', role: 'admin', label: 'Crear y editar un caso' },
  { id: 'A03', role: 'admin', label: 'Editar el grafo y el mundo (colocar, mover, borrar con teclado)' },
  { id: 'A04', role: 'admin', label: 'Validar y publicar' },
];
