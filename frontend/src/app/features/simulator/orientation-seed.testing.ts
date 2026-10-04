import * as fs from 'fs';
import * as path from 'path';

/**
 * Lector del seed del caso PDF para los specs de orientación (SOLO pruebas: usa `fs`, no lo importa la app).
 * Se localiza con una ruta relativa robusta y falla si falta: así un cambio de lugar del seed no deja
 * los contratos «verdes por vacío». Extrae solo lo que la orientación necesita: nombres de objetos,
 * NPC del escenario y requisitos de las puertas.
 */
const SEED_RELATIVE = ['backend_django', 'apps', 'simulation', 'management', 'commands', 'seed_caso_pdf.py'];

function findRepoRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, ...SEED_RELATIVE))) return dir;
    dir = path.resolve(dir, '..');
  }
  throw new Error(`No se encontró ${SEED_RELATIVE.join('/')} subiendo desde ${from}`);
}

export const SEED_PATH = path.join(findRepoRoot(__dirname), ...SEED_RELATIVE);

export interface SeedObject { key: string; label: string; type: string; x: number | null; y: number | null }
export interface SeedDoor {
  key: string; label: string; targetNodeKey: string | null;
  requiresInspected: string[]; requiresNpcs: string[]; requiresTools: string[]; requiresNodes: string[];
}
export interface SeedNpc { key: string; x: number; y: number }

export interface SeedData {
  text: string;
  objects: SeedObject[];
  doors: SeedDoor[];
  ambientNpcs: SeedNpc[];
}

function listOf(segment: string, name: string): string[] {
  const match = new RegExp(`"${name}":\\s*\\[([^\\]]*)\\]`).exec(segment);
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]) : [];
}

export function readSeed(): SeedData {
  const text = fs.readFileSync(SEED_PATH, 'utf-8');
  const objects = [...text.matchAll(
    /"key":\s*"([^"]+)",\s*"label":\s*"([^"]+)",\s*"type":\s*"(PERSON|OBJECT|TOOL|EXIT|ROUTE|WARNING)",\s*(?:"pos":\s*\((\d+),\s*(\d+)\))?/g,
  )].map(m => ({
    key: m[1], label: m[2], type: m[3], x: m[4] === undefined ? null : Number(m[4]), y: m[5] === undefined ? null : Number(m[5]),
  }));

  const doors = [...text.matchAll(
    /"key":\s*"([^"]+)",\s*"label":\s*"([^"]+)",\s*"type":\s*"EXIT"([\s\S]*?)(?="key":|\n\s*\],)/g,
  )].map(m => ({
    key: m[1], label: m[2],
    targetNodeKey: /"targetNodeKey":\s*"([^"]+)"/.exec(m[3])?.[1] ?? null,
    requiresInspected: listOf(m[3], 'requiresInspected'),
    requiresNpcs: listOf(m[3], 'requiresNpcs'),
    requiresTools: listOf(m[3], 'requiresTools'),
    requiresNodes: listOf(m[3], 'requiresNodes'),
  }));

  const ambientNpcs = [...text.matchAll(/_ambient_npc\("([^"]+)",\s*(\d+),\s*(\d+)\)/g)]
    .map(m => ({ key: m[1], x: Number(m[2]), y: Number(m[3]) }));

  return { text, objects, doors, ambientNpcs };
}
