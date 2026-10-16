import { NodeEditorState } from '../../core/models/simulation.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';

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

/** Clasificación de una decisión. */
export const CLASSIFICATIONS: readonly EditorOption[] = [
  { value: 'ADEQUATE', label: 'Adecuada' },
  { value: 'RISKY', label: 'Riesgosa' },
  { value: 'INADEQUATE', label: 'Inadecuada' },
];

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
