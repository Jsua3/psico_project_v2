/**
 * Valida la biblioteca de modelos interactivos (biblioteca/modelos):
 *
 *   npm run validar:modelos            # valida biblioteca/modelos
 *   npm run validar:modelos -- <dir>   # otra carpeta con un catalogo.json
 *
 * Sale con 1 si hay errores. Cada hallazgo se imprime como
 * "ERROR <codigo> <donde>: <mensaje>" o "AVISO ...".
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { existe, lugarDeEsquema, medidaPng, mensajeDeEsquema } from './validar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_BIBLIOTECA = path.resolve(aqui, '..');
export const LADO = 32;

let validadorDeEsquema;
async function esquema() {
  if (!validadorDeEsquema) {
    const texto = await readFile(path.join(RAIZ_BIBLIOTECA, 'esquema', 'modelo.schema.json'), 'utf8');
    validadorDeEsquema = new Ajv2020({ allErrors: true, strict: true }).compile(JSON.parse(texto));
  }
  return validadorDeEsquema;
}

/**
 * @returns {Promise<{ errores: Hallazgo[], avisos: Hallazgo[] }>} con Hallazgo = { codigo, donde, mensaje }
 */
export async function validarModelos(dir) {
  const errores = [];
  const avisos = [];
  const error = (codigo, donde, mensaje) => errores.push({ codigo, donde, mensaje });
  const aviso = (codigo, donde, mensaje) => avisos.push({ codigo, donde, mensaje });

  const archivo = path.join(dir, 'catalogo.json');
  let catalogo;
  try {
    catalogo = JSON.parse(await readFile(archivo, 'utf8'));
  } catch (e) {
    error('archivo', 'catalogo.json', `No se pudo leer el catálogo: ${e.message}`);
    return { errores, avisos };
  }

  const valida = await esquema();
  if (!valida(catalogo)) {
    for (const e of valida.errors) error('esquema', lugarDeEsquema(catalogo, e.instancePath), mensajeDeEsquema(e));
    return { errores, avisos };
  }

  const vistos = new Set();
  for (const m of catalogo.modelos) {
    const donde = `modelo "${m.id}"`;
    if (vistos.has(m.id)) error('id-repetido', donde, `Hay dos modelos con el id "${m.id}".`);
    vistos.add(m.id);

    const reposo = path.join(dir, ...m.arte.split('/'));
    if (!(await existe(reposo))) {
      error('arte-faltante', donde, `No se encuentra la imagen "${m.arte}".`);
    } else {
      const medida = await medidaPng(reposo);
      if (!medida) error('arte-invalido', donde, `"${m.arte}" no es una imagen PNG.`);
      else if (medida.ancho !== LADO || medida.alto !== LADO) {
        error('reposo-medida', donde, `"${m.arte}" mide ${medida.ancho}×${medida.alto} y debe medir ${LADO}×${LADO}.`);
      }
    }

    const { hoja, cuadros } = m.animacionCerca;
    const rutaHoja = path.join(dir, ...hoja.split('/'));
    if (!(await existe(rutaHoja))) {
      error('arte-faltante', donde, `No se encuentra la hoja de animación "${hoja}".`);
    } else {
      const medida = await medidaPng(rutaHoja);
      if (!medida) error('arte-invalido', donde, `"${hoja}" no es una imagen PNG.`);
      else if (medida.ancho !== LADO * cuadros || medida.alto !== LADO) {
        error('hoja-medida', donde, `"${hoja}" mide ${medida.ancho}×${medida.alto}; con ${cuadros} cuadros debe medir ${LADO * cuadros}×${LADO}.`);
      }
    }

    if (m.alRevisar.length > 120) aviso('texto-largo', donde, 'Lo que se lee al revisar pasa de 120 caracteres: en el juego se lee de un vistazo.');
  }

  return { errores, avisos };
}

async function principal(argumentos) {
  const dir = path.resolve(process.cwd(), argumentos[0] ?? path.join(RAIZ_BIBLIOTECA, 'modelos'));
  const { errores, avisos } = await validarModelos(dir);
  for (const a of avisos) console.log(`AVISO ${a.codigo} ${a.donde}: ${a.mensaje}`);
  for (const e of errores) console.error(`ERROR ${e.codigo} ${e.donde}: ${e.mensaje}`);
  console.log(errores.length === 0 ? `Modelos válidos (${avisos.length} aviso(s)).` : `${errores.length} error(es).`);
  return errores.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await principal(process.argv.slice(2));
}
