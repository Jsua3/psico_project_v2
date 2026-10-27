import { Intensity, NodeEditorState, ResponseClass } from '../../core/models/simulation.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { responseClassWord } from './outcome-text.util';

/** Una opción de un selector del editor: el valor que viaja al servidor y el texto que se lee. */
export interface EditorOption {
  value: string;
  label: string;
}

/** Temas visuales de un mapa (valores del servidor) con su nombre en español. */
export const MAP_THEMES: readonly EditorOption[] = [
  { value: 'clinical-soft', label: 'Clínico suave' },
  { value: 'protection-route', label: 'Ruta de protección' },
  { value: 'technical-record', label: 'Registro técnico' },
  { value: 'risk-assessment', label: 'Valoración de riesgo' },
  { value: 'child-protection', label: 'Protección NNA' },
  { value: 'follow-up', label: 'Seguimiento' },
];

/** Tipos de objeto que el formulario del editor deja crear (sus etiquetas salen de `labels.ts`). */
export const OBJECT_TYPES: readonly string[] = ['PERSON', 'OBJECT', 'ROUTE', 'TOOL', 'WARNING', 'EXIT'];

/** Las cuatro clases de respuesta, en el orden del contrato; su nombre sale de `responseClassWord` (una sola fuente). */
export const RESPONSE_CLASSES: readonly EditorOption[] = (
  ['RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED'] as const satisfies readonly ResponseClass[]
).map(value => ({ value, label: responseClassWord(value) ?? value }));

/**
 * Intensidad de una escena. BORRADOR (VD-23): los nombres esperan la aprobación de Psicología. El valor vacío no manda
 * nada: el servidor decide (Media, o Alta si la escena es sensible).
 */
export const INTENSITIES: readonly EditorOption[] = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
] satisfies readonly { value: Intensity; label: string }[];

export function mapThemeLabel(theme: string | null | undefined): string {
  return MAP_THEMES.find(option => option.value === theme)?.label ?? (theme || 'Sin tema');
}

/** «Sala de urgencias (urgencias-crisis)»: el título primero, que es lo que se reconoce, y la clave entre paréntesis. */
export function nodeOptionLabel(node: Pick<NodeEditorState, 'key' | 'title'>): string {
  return `${node.title} (${node.key})`;
}

/** Recorta un texto largo en una palabra completa y añade «…»; lo corto queda igual. */
export function shorten(text: string, max = 36): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** El tono de la insignia de estado de una versión de caso. */
export function statusTone(status: string | null | undefined): UiBadgeTone {
  const normalized = (status ?? '').toUpperCase();
  if (normalized === 'PUBLISHED') return 'success';
  if (normalized === 'IN_REVIEW') return 'info';
  return 'neutral';
}
