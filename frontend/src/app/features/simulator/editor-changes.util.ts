import { CaseEditorView } from '../../core/models/simulation.model';

interface TrackedCollection {
  key: 'nodes' | 'decisions' | 'maps' | 'objects' | 'tools';
  label: string;
  feminine: boolean;
}

/** Las colecciones que el editor muestra, en el orden en que se cuentan. */
const COLLECTIONS: readonly TrackedCollection[] = [
  { key: 'nodes', label: 'Nodos', feminine: false },
  { key: 'decisions', label: 'Decisiones', feminine: true },
  { key: 'maps', label: 'Mapas', feminine: false },
  { key: 'objects', label: 'Objetos', feminine: false },
  { key: 'tools', label: 'Herramientas', feminine: true },
];

/** «1 nuevo», «2 nuevas», «1 quitado»…: la palabra concuerda con el género y el número. */
function counted(count: number, stem: string, feminine: boolean): string {
  return `${count} ${stem}${feminine ? 'a' : 'o'}${count === 1 ? '' : 's'}`;
}

/**
 * La comparación del 409 `REVISION_CONFLICT` (RNF-08, REGLA-011): lo que la otra sesión cambió, por colección, entre
 * lo que esta pantalla muestra (`mine`) y el editor vigente del servidor (`current`). Si las colecciones coinciden
 * pero la revisión no, lo dice con las dos revisiones. Sin `current` (cuerpo recortado) no inventa diferencias.
 */
export function describeEditorChanges(mine: CaseEditorView, current: CaseEditorView | null): string[] {
  if (!current) return [];
  const lines: string[] = [];
  if (mine.title !== current.title) lines.push(`El título del caso cambió: «${current.title}».`);

  for (const { key, label, feminine } of COLLECTIONS) {
    const before = new Map<number, string>((mine[key] as { id: number }[] ?? []).map(item => [item.id, JSON.stringify(item)]));
    const after = new Map<number, string>((current[key] as { id: number }[] ?? []).map(item => [item.id, JSON.stringify(item)]));
    const added = [...after.keys()].filter(id => !before.has(id)).length;
    const removed = [...before.keys()].filter(id => !after.has(id)).length;
    const modified = [...after.entries()].filter(([id, json]) => before.has(id) && before.get(id) !== json).length;
    const parts = [
      added ? counted(added, 'nuev', feminine) : null,
      removed ? counted(removed, 'quitad', feminine) : null,
      modified ? counted(modified, 'modificad', feminine) : null,
    ].filter((part): part is string => part !== null);
    if (parts.length) lines.push(`${label}: ${parts.join(', ')}.`);
  }

  if (lines.length === 0 && mine.revision !== current.revision) {
    lines.push(
      `La otra sesión guardó cambios que esta pantalla no muestra (de la revisión ${mine.revision} a la ${current.revision}).`,
    );
  }
  return lines;
}
