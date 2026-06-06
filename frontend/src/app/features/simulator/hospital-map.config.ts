import { MapObjectState } from '../../core/models/simulation.model';

/** Scene map key for Escenario 1 — Hospital / urgencias. */
export const HOSPITAL_MAP_KEY = 'urgencias-crisis';

/** Node key for the first playable scene in the seed case. */
export const HOSPITAL_NODE_KEY = 'urgencias-crisis';

/** Visible pedagogical objective for the hospital scene. */
export const HOSPITAL_SCENE_OBJECTIVE =
  'Estabiliza emocionalmente a la familia y evita acciones prematuras que puedan aumentar la crisis.';

/** Frontend display labels — backend keys remain stable. */
export const INTERACTION_LABELS: Record<string, string> = {
  'escucha-segura': 'Iniciar escucha segura',
  'cuestionario-prematuro': 'Área médica restringida',
  'aviso-policial': 'Ruta de atención VBG',
  'tool-pap': 'Primeros Auxilios Psicológicos',
  'tool-bitacora': 'Bitácora reflexiva',
  PAP: 'Primeros Auxilios Psicológicos',
  Bitacora: 'Bitácora reflexiva',
  'Escucha segura': 'Iniciar escucha segura',
  'Cuestionario prematuro': 'Acción riesgosa: interrogatorio prematuro',
  'Aviso policial': 'Ruta de atención VBG',
};

/** Contextual descriptions shown on proximity hints. */
export const INTERACTION_DESCRIPTIONS: Record<string, string> = {
  'escucha-segura':
    'La familia está alterada y exige información inmediata. Debes intervenir sin aumentar la crisis.',
  'cuestionario-prematuro':
    'La sobreviviente se encuentra en atención médica crítica. No es momento de interrogarla.',
  'aviso-policial':
    'Consulta el marco técnico y normativo aplicable a casos de violencia basada en género.',
  'tool-pap':
    'Consulta o aplica una guía breve para estabilizar emocionalmente a la familia durante la crisis.',
  'tool-bitacora':
    'Registra tus observaciones, decisiones y dudas éticas durante la intervención.',
  'ambient:protocolo-noticia-dificil':
    'Revisa una guía para preparar la comunicación de una noticia sensible con acompañamiento ético y humano.',
  'ambient:familia-crisis':
    'La familia está alterada y exige información inmediata. Debes intervenir sin aumentar la crisis.',
  'Primeros Auxilios Psicológicos':
    'Consulta o aplica una guía breve para estabilizar emocionalmente a la familia durante la crisis.',
  'Bitácora reflexiva':
    'Registra tus observaciones, decisiones y dudas éticas durante la intervención.',
  'Iniciar escucha segura':
    'Comienza una interacción orientada a validar emociones y evitar revictimización.',
  'Ruta de atención VBG':
    'Consulta el marco técnico y normativo aplicable a casos de violencia basada en género.',
  'Acción riesgosa: interrogatorio prematuro':
    'Esta acción puede aumentar la revictimización o interferir con la atención médica prioritaria.',
};

/** Warning shown before allowing a risky backend interaction. */
export const RESTRICTED_AREA_WARNING_MESSAGE =
  'Acción sensible: la sobreviviente está en atención médica crítica. Interrogarla ahora puede aumentar revictimización. ¿Deseas continuar?';

/** Pedagogical block when interacting with the restricted clinical area. */
export const RESTRICTED_AREA_BLOCK_MESSAGE =
  'La entrevista no es procedente en este momento. La prioridad es la estabilización médica y la contención emocional de la familia.';

export const PROTOCOL_INFO_MESSAGE =
  'Protocolo EPICEE / SPIKES: prepara el entorno, valora qué sabe la familia, brinda información clara y acompaña la reacción emocional antes de documentar o activar rutas institucionales.';

export interface HospitalZoneDef {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tint: number;
  alpha: number;
}

/** Visual zone panels drawn on the hospital map (depth below markers). */
export const HOSPITAL_ZONES: HospitalZoneDef[] = [
  { key: 'entrada', label: 'Entrada a urgencias', x: 48, y: 380, width: 200, height: 130, tint: 0x1a2838, alpha: 0.55 },
  { key: 'familia', label: 'Familia en crisis', x: 48, y: 200, width: 280, height: 160, tint: 0x2a1f28, alpha: 0.5 },
  { key: 'contencion', label: 'Primeros Auxilios Psicológicos', x: 48, y: 300, width: 280, height: 90, tint: 0x1a3028, alpha: 0.45 },
  { key: 'espera', label: 'Sala de espera', x: 340, y: 300, width: 200, height: 120, tint: 0x182028, alpha: 0.4 },
  { key: 'informacion', label: 'Punto de información — Equipo médico', x: 520, y: 120, width: 200, height: 140, tint: 0x1a2535, alpha: 0.45 },
  { key: 'restringida', label: 'Área médica restringida', x: 620, y: 48, width: 290, height: 160, tint: 0x281820, alpha: 0.55 },
  { key: 'protocolo', label: 'Protocolo para noticia difícil', x: 520, y: 200, width: 200, height: 100, tint: 0x1f2530, alpha: 0.42 },
  { key: 'vbg', label: 'Ruta de atención VBG', x: 620, y: 320, width: 290, height: 130, tint: 0x1a2830, alpha: 0.45 },
];

/** Frontend collision walls for hospital layout (overrides generic seed zones). */
export const HOSPITAL_COLLISIONS = [
  { x: 48, y: 44, width: 864, height: 12 },
  { x: 48, y: 44, width: 12, height: 452 },
  { x: 900, y: 44, width: 12, height: 452 },
  { x: 48, y: 484, width: 864, height: 12 },
  { x: 600, y: 44, width: 8, height: 280 },
  { x: 600, y: 360, width: 8, height: 136 },
  { x: 330, y: 280, width: 8, height: 216 },
  { x: 620, y: 44, width: 290, height: 8 },
  { x: 620, y: 200, width: 290, height: 8 },
];

export interface AmbientZoneDef {
  key: string;
  label: string;
  x: number;
  y: number;
  radius: number;
}

/** Non-backend informational points on the hospital map. */
export const HOSPITAL_AMBIENT_ZONES: AmbientZoneDef[] = [
  {
    key: 'ambient:protocolo-noticia-dificil',
    label: 'Protocolo para noticia difícil',
    x: 620,
    y: 250,
    radius: 68,
  },
];

export function isHospitalMap(mapKey: string | undefined | null): boolean {
  return mapKey === HOSPITAL_MAP_KEY;
}

export function getDisplayLabel(obj: Pick<MapObjectState, 'key' | 'label'>): string {
  return INTERACTION_LABELS[obj.key] ?? INTERACTION_LABELS[obj.label] ?? obj.label;
}

export function getInteractionDescription(
  obj: Pick<MapObjectState, 'key' | 'label' | 'interactionPrompt' | 'interactionText'>
): string {
  const display = getDisplayLabel(obj);
  return (
    INTERACTION_DESCRIPTIONS[obj.key] ??
    INTERACTION_DESCRIPTIONS[display] ??
    obj.interactionText ??
    obj.interactionPrompt ??
    ''
  );
}

export function isRestrictedAreaInteraction(key: string): boolean {
  return key === 'cuestionario-prematuro';
}

/** @deprecated Prefer isRiskyInteraction from risky-interaction.config.ts */

export function isAmbientInteraction(key: string): boolean {
  return key.startsWith('ambient:');
}

/** Build a synthetic MapObjectState for ambient proximity hints. */
export function buildAmbientObject(zone: AmbientZoneDef): MapObjectState {
  return {
    key: zone.key,
    label: zone.label,
    type: 'OBJECT',
    x: zone.x,
    y: zone.y,
    width: 0,
    height: 0,
    color: '#6F8490',
    icon: 'info',
    shortCode: 'INFO',
    collision: false,
    interactionPrompt: zone.label,
    interactionText: INTERACTION_DESCRIPTIONS[zone.key] ?? '',
    decisionOptionId: null,
    toolCode: null,
    dialogue: null,
  };
}

export function applyHospitalDisplayLabels(objects: MapObjectState[]): MapObjectState[] {
  return objects.map(obj => ({
    ...obj,
    label: getDisplayLabel(obj),
  }));
}
