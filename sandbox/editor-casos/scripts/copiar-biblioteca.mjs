/**
 * Copia la biblioteca de escenarios (P1) y los PNG del kit de personajes a public/assets/,
 * porque Angular no sirve archivos de fuera de su carpeta. La copia no va a git.
 *   node scripts/copiar-biblioteca.mjs
 */
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(raiz, '..', '..');
const destino = path.join(raiz, 'public', 'assets');

const copias = [
  { desde: path.join(repo, 'biblioteca', 'escenarios'), hacia: path.join(destino, 'biblioteca'), filtro: (f) => !/fuentes|hoja-contacto\.png$|\.md$/.test(f) },
  { desde: path.join(repo, 'frontend', 'src', 'assets', 'characters', 'kit'), hacia: path.join(destino, 'kit'), filtro: (f) => !/\.json$/.test(f) },
];

// Se copia encima sin borrar antes: si el servidor de desarrollo está corriendo, borrar la
// carpeta le hace perder los archivos hasta reiniciarlo (pasaba al correr las pruebas).
for (const { desde, hacia, filtro } of copias) {
  if (!existsSync(desde)) throw new Error(`No se encuentra ${desde}`);
  cpSync(desde, hacia, { recursive: true, force: true, filter: filtro });
}
// El esquema de P1, para que las pruebas validen la universidad contra el contrato real.
cpSync(path.join(repo, 'biblioteca', 'esquema', 'escenario.schema.json'), path.join(destino, 'biblioteca', 'escenario.schema.json'));
console.log(`biblioteca y kit copiados a ${path.relative(raiz, destino)}`);
