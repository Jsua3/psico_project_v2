/**
 * Resuelve los modelos compartidos dentro de un lugar.
 *
 * Por cada objeto o herramienta del catálogo del lugar con `desdeModelo`, copia el arte
 * del modelo (`modelos/arte/<id>.png` y `<id>-cerca.png`) a `arte/objetos/` o
 * `arte/herramientas/` del lugar y escribe en su `escenario.json` los campos resueltos
 * (`arte`, `animacionCerca`, `alRevisar`, `textoInteraccion`, `efecto`; la herramienta solo
 * los que su esquema admite), conservando `desdeModelo` como origen. Idempotente: si todo
 * está al día no copia ni escribe nada. Si algún modelo no existe, falla antes de copiar.
 *
 * Uso: npm run modelos:aplicar -- escenarios/casa
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CATALOGO_MODELOS, camposResueltos, cargarModelos, existe } from './validar.mjs';

/** Campos del modelo que recibe cada clase de pieza (el esquema de herramienta no tiene textoInteraccion ni efecto). */
const CAMPOS = Object.freeze({
  objetos: ['arte', 'animacionCerca', 'alRevisar', 'textoInteraccion', 'efecto'],
  herramientas: ['arte', 'animacionCerca', 'alRevisar'],
});

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param {string} dirLugar carpeta del lugar (con escenario.json)
 * @returns {Promise<{ copiados: string[] }>} rutas relativas copiadas en esta llamada
 */
export async function aplicarModelos(dirLugar, { catalogoModelos = CATALOGO_MODELOS } = {}) {
  const dirModelos = path.dirname(catalogoModelos);
  const modelos = await cargarModelos(catalogoModelos);
  const archivo = path.join(dirLugar, 'escenario.json');
  const texto = await readFile(archivo, 'utf8');
  const escenario = JSON.parse(texto);

  // Primero se resuelve todo en memoria: un modelo inexistente detiene el proceso sin copiar nada.
  const trabajos = [];
  for (const carpeta of ['objetos', 'herramientas']) {
    for (const pieza of escenario.catalogo[carpeta]) {
      if (!pieza.desdeModelo) continue;
      const modelo = modelos.get(pieza.desdeModelo);
      if (!modelo) {
        throw new Error(`${carpeta.slice(0, -1)} "${pieza.id}": el modelo "${pieza.desdeModelo}" no está en ${catalogoModelos}.`);
      }
      const resueltos = camposResueltos(modelo, carpeta);
      trabajos.push({
        pieza,
        campos: Object.fromEntries(CAMPOS[carpeta].map((campo) => [campo, resueltos[campo]])),
        copias: [
          [path.join(dirModelos, ...modelo.arte.split('/')), resueltos.arte],
          [path.join(dirModelos, ...modelo.animacionCerca.hoja.split('/')), resueltos.animacionCerca.hoja],
        ],
      });
    }
  }

  const copiados = [];
  let cambiado = false;
  for (const { pieza, campos, copias } of trabajos) {
    for (const [origen, relativa] of copias) {
      const destino = path.join(dirLugar, ...relativa.split('/'));
      if (await existe(destino) && (await readFile(destino)).equals(await readFile(origen))) continue;
      await mkdir(path.dirname(destino), { recursive: true });
      await copyFile(origen, destino);
      copiados.push(relativa);
    }
    for (const [campo, valor] of Object.entries(campos)) {
      if (!igual(pieza[campo], valor)) {
        pieza[campo] = valor;
        cambiado = true;
      }
    }
  }
  if (cambiado) await writeFile(archivo, `${JSON.stringify(escenario, null, 2)}\n`);
  return { copiados };
}

async function principal(argumentos) {
  const objetivo = argumentos[0];
  if (!objetivo) {
    console.error('Uso: npm run modelos:aplicar -- <carpeta del escenario>');
    return 2;
  }
  try {
    const { copiados } = await aplicarModelos(path.resolve(process.cwd(), objetivo));
    for (const r of copiados) console.log(`copiado: ${r}`);
    console.log(`${copiados.length} imagen(es) copiada(s) en ${objetivo}`);
    return 0;
  } catch (causa) {
    console.error(`ERROR ${causa.message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await principal(process.argv.slice(2));
}
