/**
 * Copia la biblioteca de escenarios (P1) y los PNG del kit de personajes a public/assets/,
 * porque Angular no sirve archivos de fuera de su carpeta. La copia no va a git.
 *   node scripts/copiar-biblioteca.mjs
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(raiz, '..', '..');
const destino = path.join(raiz, 'public', 'assets');

const copias = [
  { desde: path.join(repo, 'biblioteca', 'escenarios'), hacia: path.join(destino, 'biblioteca'), filtro: (f) => !/fuentes|hoja-contacto\.png$|\.md$/.test(f) },
  { desde: path.join(repo, 'frontend', 'src', 'assets', 'characters', 'kit'), hacia: path.join(destino, 'kit'), filtro: (f) => !/\.json$/.test(f) },
];

for (const { desde, hacia, filtro } of copias) {
  if (!existsSync(desde)) throw new Error(`No se encuentra ${desde}`);
  rmSync(hacia, { recursive: true, force: true });
  cpSync(desde, hacia, { recursive: true, filter: filtro });
}
console.log(`biblioteca y kit copiados a ${path.relative(raiz, destino)}`);
