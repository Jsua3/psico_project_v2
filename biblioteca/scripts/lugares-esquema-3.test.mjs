import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { armarLugar } from './lugares-esquema-3.mjs';

const leer = async (ruta) => JSON.parse(await readFile(new URL(`../${ruta}`, import.meta.url), 'utf8'));
for (const id of ['casa', 'comisaria', 'universidad']) {
  test(`${id}: salas y referencias por piezas`, async () => {
    const lugar = armarLugar(await leer(`piezas/lugares/${id}.json`), await leer(`escenarios/${id}/escenario.json`),
      await leer('piezas/manifiesto.json'));
    assert.deepEqual(lugar, await leer(`escenarios/${id}/escenario-piezas.json`));
    for (const sala of lugar.salas) {
      assert.ok(sala.estructura);
      for (const [grupo, catalogo] of [['muebles', lugar.catalogo.muebles], ['objetos', lugar.catalogo.objetos],
        ['personajes', lugar.personajes]]) {
        for (const item of sala[grupo]) assert.ok(catalogo.some((ficha) => ficha.id === item.ref), `${sala.id}: ${item.ref}`);
      }
    }
  });
}
test('los archivos generados están al día', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('./lugares-esquema-3.mjs', import.meta.url)),
    '--verificar']);
});
