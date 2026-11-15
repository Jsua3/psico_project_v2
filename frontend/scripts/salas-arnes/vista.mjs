// Arma la página publicable del arnés (`vista.html` con todo incrustado): el arnés empaquetado y minificado, el manifiesto
// de piezas, el lugar y cada imagen que las salas piden de día y de noche, calculadas con los módulos reales del juego.
//
//   node scripts/salas-arnes/vista.mjs <salida.html> [--lugar=hospital]
import '../world-art/ts-sin-extension.mjs';

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(AQUI, '..', '..');
const BIBLIOTECA = path.resolve(FRONTEND, '..', 'biblioteca');
const ASSETS = path.join(FRONTEND, 'src', 'assets');
const SALIDA = process.argv.slice(2).find(a => !a.startsWith('--'));
const LUGAR = process.argv.find(a => a.startsWith('--lugar='))?.slice('--lugar='.length) ?? 'hospital';
if (!SALIDA) throw new Error('uso: node scripts/salas-arnes/vista.mjs <salida.html> [--lugar=hospital]');

const { planDeSala, rutasDelPlan } = await import('../../src/app/features/simulator/sala/composicion.ts');
const { MANIFIESTO_DE_PIEZAS_URL, urlDePieza } = await import('../../src/app/features/simulator/sala/catalogo.ts');

const manifiesto = JSON.parse(readFileSync(path.join(BIBLIOTECA, 'piezas', 'manifiesto.json'), 'utf8'));
const lugar = JSON.parse(readFileSync(path.join(BIBLIOTECA, 'piezas', 'lugares', `${LUGAR}.json`), 'utf8'));

const recursos = {
  [MANIFIESTO_DE_PIEZAS_URL]: JSON.stringify(manifiesto),
  [urlDePieza(`piezas/lugares/${LUGAR}.json`)]: JSON.stringify(lugar),
};
const png = archivo => `data:image/png;base64,${readFileSync(archivo).toString('base64')}`;
const kit = new Set(['valentina:idle', 'valentina:walk']);
for (const sala of lugar.salas) {
  for (const momento of ['dia', 'noche']) {
    for (const ruta of rutasDelPlan(planDeSala(sala, manifiesto, momento))) recursos[urlDePieza(ruta)] ??= png(path.join(BIBLIOTECA, ...ruta.split('/')));
  }
  for (const m of sala.muebles ?? []) {
    const ficha = manifiesto.muebles[`${LUGAR}/${m.ref}`];
    if (ficha) recursos[urlDePieza(ficha.ruta)] ??= png(path.join(BIBLIOTECA, ...ficha.ruta.split('/')));
  }
  for (const p of sala.personajes ?? []) kit.add(`${p.ref}:idle`);
}
for (const clave of kit) {
  const [ref, hoja] = clave.split(':');
  recursos[`/assets/characters/kit/${ref}/${hoja}.png`] = png(path.join(ASSETS, 'characters', 'kit', ref, `${hoja}.png`));
}

const empaquetado = await build({
  entryPoints: [path.join(AQUI, 'arnes.ts')], bundle: true, write: false, format: 'iife', target: 'es2022', minify: true,
  legalComments: 'none', logLevel: 'silent', tsconfig: path.join(FRONTEND, 'tsconfig.json'),
});
// Un `</script>` dentro del código cerraría la etiqueta antes de tiempo.
const codigo = empaquetado.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const salas = lugar.salas.map(s => ({ id: s.id, nombre: s.nombre, ancho: s.estructura.ancho }));

const plantilla = readFileSync(path.join(AQUI, 'vista.html'), 'utf8');
for (const marca of ['/*__RECURSOS__*/', '/*__ARNES_JS__*/', '/*__SALAS__*/']) {
  if (!plantilla.includes(marca)) throw new Error(`la plantilla no tiene la marca ${marca}`);
}
const html = plantilla
  .replace('/*__RECURSOS__*/', () => JSON.stringify(recursos).replace(/<\//g, '<\\/'))
  .replace('/*__ARNES_JS__*/', () => codigo)
  .replace('/*__SALAS__*/', () => JSON.stringify(salas));
writeFileSync(SALIDA, html);
console.log(`${SALIDA}: ${(html.length / 1024 / 1024).toFixed(2)} MB, ${Object.keys(recursos).length} recursos, arnés ${(codigo.length / 1024).toFixed(0)} KB`);
