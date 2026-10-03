import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PLAYABLE_CAST } from '../simulator/baked-cast.util';
import { V1_ROSTER } from '../simulator/v1-avatar.util';

/**
 * T15.5 — desajuste documentado entre `roster.v1.json` y las carpetas de hojas v1.
 *
 * El roster declara 10 identidades, pero solo 8 tienen carpeta con hojas (las que lista
 * `V1_ROSTER`, la fuente de verdad en tiempo de ejecución). Mariana y Mateo no tienen hojas v1:
 * el juego las resuelve con el elenco horneado (`cast/<id>.png`), así que nunca se ofrece un
 * personaje sin sprite. No se recorta el roster porque es una autoridad con hash fijo en
 * `scripts/character-manifest-lib.mjs` (`AUTHORITY_HASHES.roster`) y el generador exige
 * exactamente 10 identidades: recortarlo rompería `npm run test:character-assets`. Cuando se
 * produzcan las dos hojas, o se recorte el roster junto con ese script, esta lista debe quedar vacía.
 */
const SIN_HOJAS_V1 = ['mariana', 'mateo'] as const;

const assetsRoot = join(__dirname, '..', '..', '..', 'assets', 'characters');
const v1Root = join(assetsRoot, 'v1');
const roster = JSON.parse(readFileSync(join(v1Root, 'roster.v1.json'), 'utf-8')) as {
  defaultCharacterId: string;
  identities: { characterId: string; provenance: { sourceAsset: string } }[];
};
const declared = roster.identities.map(identity => identity.characterId);
const manifestLib = readFileSync(join(__dirname, '..', '..', '..', '..', 'scripts', 'character-manifest-lib.mjs'), 'utf-8');

describe('roster.v1.json frente a las hojas v1 (T15.5)', () => {
  it('lo declarado = identidades con hojas v1 + el desajuste documentado, sin sorpresas', () => {
    expect([...declared].sort()).toEqual([...V1_ROSTER, ...SIN_HOJAS_V1].sort());
  });

  it('cada identidad de V1_ROSTER tiene su carpeta con las hojas que usa el juego', () => {
    for (const id of V1_ROSTER) {
      for (const sheet of ['idle', 'walk', 'portrait']) {
        expect(existsSync(join(v1Root, id, 'base', `${sheet}.png`))).toBe(true);
      }
    }
  });

  it('las identidades sin hojas v1 no tienen carpeta y sí un respaldo horneado en el selector', () => {
    for (const id of SIN_HOJAS_V1) {
      expect(existsSync(join(v1Root, id))).toBe(false);
      expect(PLAYABLE_CAST.some(member => member.id === id)).toBe(true);
      expect(existsSync(join(assetsRoot, 'cast', `${id}.png`))).toBe(true);
    }
  });

  it('el personaje por defecto tiene hojas v1 y toda procedencia declarada existe', () => {
    expect(V1_ROSTER).toContain(roster.defaultCharacterId);
    for (const identity of roster.identities) {
      expect(existsSync(join(assetsRoot, identity.provenance.sourceAsset))).toBe(true);
    }
  });

  it('el roster no se recorta aquí: sigue fijado por hash y por «exactamente 10» en el generador', () => {
    // Si alguien relaja el generador a 8, esta prueba avisa de que SIN_HOJAS_V1 ya no hace falta.
    expect(manifestLib).toContain('AUTHORITY_HASHES');
    expect(manifestLib).toMatch(/roster\.identities\.length !== 10/);
    expect(declared).toHaveLength(10);
  });
});
