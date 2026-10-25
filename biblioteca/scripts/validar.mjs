/**
 * Validador de escenarios de la biblioteca.
 *
 * Primero revisa la forma del archivo con el esquema (esquema/escenario.schema.json).
 * Si la forma está bien, revisa la integridad: referencias, arte en disco, caras
 * de los personajes, entradas y puertas libres, y que todo quede dentro de la
 * zona caminable del encuadre.
 *
 * Uso: npm run validar -- escenarios/universidad
 */
import { access, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  ALTO_SALA,
  ANCHO_SALA,
  cajaCentrada,
  cajaDeMueble,
  muebleEnZona,
  puntoEnZona,
  rectIntersecta,
  zonaCaminable,
} from './geometria.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_BIBLIOTECA = path.resolve(aqui, '..');
export const KIT_POR_DEFECTO = path.resolve(RAIZ_BIBLIOTECA, '../frontend/src/assets/characters/kit');
export const EXPRESIONES = Object.freeze(['neutral', 'alegre', 'preocupada', 'triste']);
export const MINIMO_DE_SALAS = 8;

let validadorDeEsquema;
async function esquema() {
  if (!validadorDeEsquema) {
    const texto = await readFile(path.join(RAIZ_BIBLIOTECA, 'esquema', 'escenario.schema.json'), 'utf8');
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    validadorDeEsquema = ajv.compile(JSON.parse(texto));
  }
  return validadorDeEsquema;
}

export async function existe(ruta) {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Ancho y alto de un PNG leyendo solo su cabecera; null si no es un PNG. */
export async function medidaPng(ruta) {
  let archivo;
  try {
    archivo = await open(ruta, 'r');
    const cabecera = Buffer.alloc(24);
    const { bytesRead } = await archivo.read(cabecera, 0, 24, 0);
    if (bytesRead < 24 || !cabecera.subarray(0, 8).equals(FIRMA_PNG) || cabecera.toString('ascii', 12, 16) !== 'IHDR') {
      return null;
    }
    return { ancho: cabecera.readUInt32BE(16), alto: cabecera.readUInt32BE(20) };
  } catch {
    return null; // una carpeta con nombre de imagen, por ejemplo
  } finally {
    await archivo?.close();
  }
}

const TIPOS = {
  integer: 'un número entero',
  number: 'un número',
  string: 'un texto',
  boolean: 'verdadero o falso (true o false)',
  array: 'una lista',
  object: 'un grupo de campos entre llaves',
};

/** Traduce un error del esquema a una frase en español llano. */
export function mensajeDeEsquema(error) {
  const p = error.params ?? {};
  switch (error.keyword) {
    case 'required':
      return `Falta el campo "${p.missingProperty}".`;
    case 'additionalProperties':
      return `El campo "${p.additionalProperty}" no existe en este formato.`;
    case 'enum':
      return `El valor no es válido. Debe ser uno de: ${p.allowedValues.join(', ')}.`;
    case 'const':
      return `El valor debe ser ${JSON.stringify(p.allowedValue)}.`;
    case 'type':
      return `El valor debe ser ${TIPOS[p.type] ?? 'de otro tipo'}.`;
    case 'pattern':
      if (error.schemaPath.includes('/arte/')) {
        return 'La imagen debe ser un PNG dentro de la carpeta "arte/", con minúsculas, números y guiones (por ejemplo "arte/salas/aula.png").';
      }
      if (error.schemaPath.includes('/texto/')) return 'El texto no puede quedar vacío ni tener solo espacios.';
      return 'Usa solo minúsculas sin tildes, números y guiones (por ejemplo "sala-espera").';
    case 'minimum':
    case 'maximum':
      return `El número debe ser ${error.keyword === 'minimum' ? 'como mínimo' : 'como máximo'} ${p.limit}.`;
    case 'minItems':
      return `La lista necesita al menos ${p.limit} elemento(s).`;
    case 'minLength':
      return 'El texto no puede quedar vacío.';
    default:
      return `El valor no cumple el formato (${error.keyword}).`;
  }
}

export function lugarDeEsquema(escenario, rutaJson) {
  if (!rutaJson) return 'escenario';
  const partes = rutaJson.split('/').slice(1);
  let actual = escenario;
  const trozos = [];
  for (const parte of partes) {
    actual = actual?.[parte];
    if (/^\d+$/.test(parte)) {
      const id = actual && typeof actual === 'object' ? actual.id ?? actual.ref : undefined;
      trozos[trozos.length - 1] += `[${parte}]${id ? ` (${id})` : ''}`;
    } else {
      trozos.push(parte);
    }
  }
  return trozos.join(' › ');
}

/**
 * Valida la carpeta de un escenario.
 * @returns {Promise<{ errores: Hallazgo[], avisos: Hallazgo[] }>}
 *   con Hallazgo = { codigo, donde, mensaje }
 */
export async function validarEscenario(dir, { kitDir = KIT_POR_DEFECTO } = {}) {
  const errores = [];
  const avisos = [];
  const error = (codigo, donde, mensaje) => errores.push({ codigo, donde, mensaje });
  const aviso = (codigo, donde, mensaje) => avisos.push({ codigo, donde, mensaje });

  const archivo = path.join(dir, 'escenario.json');
  let escenario;
  try {
    escenario = JSON.parse(await readFile(archivo, 'utf8'));
  } catch (causa) {
    error('esquema', 'escenario.json', `No se pudo leer el archivo: ${causa.message}`);
    return { errores, avisos };
  }

  const validar = await esquema();
  if (!validar(escenario)) {
    for (const e of validar.errors) {
      error('esquema', lugarDeEsquema(escenario, e.instancePath), mensajeDeEsquema(e));
    }
    return { errores, avisos };
  }

  // Ids repetidos dentro de cada grupo.
  const revisarIds = (lista, grupo, donde) => {
    const vistos = new Set();
    for (const elemento of lista) {
      if (vistos.has(elemento.id)) {
        error('id-repetido', `${donde} "${elemento.id}"`, `Hay dos ${grupo} con el mismo nombre interno "${elemento.id}".`);
      }
      vistos.add(elemento.id);
    }
  };
  revisarIds(escenario.salas, 'salas', 'sala');
  revisarIds(escenario.recorridosSugeridos, 'recorridos', 'recorrido');
  revisarIds(escenario.catalogo.muebles, 'muebles en el catálogo', 'mueble');
  revisarIds(escenario.catalogo.objetos, 'objetos en el catálogo', 'objeto');
  revisarIds(escenario.catalogo.herramientas, 'herramientas', 'herramienta');
  revisarIds(escenario.personajes, 'personajes', 'personaje');
  for (const sala of escenario.salas) revisarIds(sala.puertas, 'puertas', `sala "${sala.id}" › puerta`);

  const salas = new Map(escenario.salas.map((s) => [s.id, s]));
  const muebles = new Map(escenario.catalogo.muebles.map((m) => [m.id, m]));
  const objetos = new Map(escenario.catalogo.objetos.map((o) => [o.id, o]));
  const personajes = new Map(escenario.personajes.map((p) => [p.id, p]));

  // Cantidad y variedad de salas.
  if (escenario.salas.length < MINIMO_DE_SALAS) {
    const mensaje = `Un lugar completo necesita al menos ${MINIMO_DE_SALAS} salas y este tiene ${escenario.salas.length}.`;
    (escenario.completo ? error : aviso)('pocas-salas', 'escenario', mensaje);
  }
  const encuadres = new Set(escenario.salas.map((s) => s.encuadre));
  if (escenario.salas.length > 1 && encuadres.size === 1) {
    aviso('encuadres-iguales', 'escenario', `Todas las salas usan el mismo encuadre ("${[...encuadres][0]}"). Conviene variar entre 3, 2 y 1 pared.`);
  }

  // Arte en disco: que exista, que sea PNG y, si es un fondo, que mida lo que mide una sala.
  const revisarArte = async (ruta, donde, tamano) => {
    const completa = path.join(dir, ruta);
    if (!(await existe(completa))) {
      error('arte-faltante', donde, `No se encuentra la imagen "${ruta}".`);
      return;
    }
    const medida = await medidaPng(completa);
    if (!medida) {
      error('arte-invalido', donde, `"${ruta}" no es una imagen PNG.`);
    } else if (tamano && (medida.ancho !== tamano.ancho || medida.alto !== tamano.alto)) {
      error('arte-invalido', donde, `"${ruta}" mide ${medida.ancho} × ${medida.alto} y un fondo de sala debe medir ${tamano.ancho} × ${tamano.alto}.`);
    }
  };
  for (const sala of escenario.salas) {
    await revisarArte(sala.fondo, `sala "${sala.id}" › fondo`, { ancho: ANCHO_SALA, alto: ALTO_SALA });
  }
  for (const m of escenario.catalogo.muebles) await revisarArte(m.arte, `mueble "${m.id}"`);
  // La hoja de cercanía mide lo mismo de alto que el reposo y `cuadros` veces su ancho.
  const revisarHoja = async (pieza, donde) => {
    if (!pieza.animacionCerca) return;
    const { hoja, cuadros } = pieza.animacionCerca;
    const reposo = await medidaPng(path.join(dir, pieza.arte));
    const completa = path.join(dir, hoja);
    if (!(await existe(completa))) {
      error('arte-faltante', donde, `No se encuentra la hoja de animación "${hoja}".`);
      return;
    }
    const medida = await medidaPng(completa);
    if (!medida) {
      error('arte-invalido', donde, `"${hoja}" no es una imagen PNG.`);
    } else if (reposo && (medida.ancho !== reposo.ancho * cuadros || medida.alto !== reposo.alto)) {
      error('hoja-medida', donde, `"${hoja}" mide ${medida.ancho} × ${medida.alto}; con ${cuadros} cuadros de ${reposo.ancho} × ${reposo.alto} debe medir ${reposo.ancho * cuadros} × ${reposo.alto}.`);
    }
  };
  for (const o of escenario.catalogo.objetos) {
    await revisarArte(o.arte, `objeto "${o.id}"`);
    await revisarHoja(o, `objeto "${o.id}"`);
  }
  for (const h of escenario.catalogo.herramientas) {
    await revisarArte(h.arte, `herramienta "${h.id}"`);
    await revisarHoja(h, `herramienta "${h.id}"`);
  }

  // Caras de cada personaje en el kit.
  for (const personaje of escenario.personajes) {
    const faltan = [];
    for (const expresion of EXPRESIONES) {
      if (!(await existe(path.join(kitDir, personaje.recipeId, `portrait-${expresion}.png`)))) faltan.push(expresion);
    }
    if (faltan.length > 0) {
      error(
        'faltan-expresiones',
        `personaje "${personaje.id}"`,
        `Al personaje "${personaje.nombre}" (apariencia "${personaje.recipeId}") le faltan caras: ${faltan.join(', ')}.`,
      );
    }
  }

  // Cada sala.
  for (const sala of escenario.salas) {
    const enSala = `sala "${sala.id}"`;
    const zona = zonaCaminable(sala.encuadre);
    const conColision = [];

    if (!puntoEnZona(zona, sala.entrada.x, sala.entrada.y)) {
      error('fuera-de-la-zona', `${enSala} › entrada`, 'La entrada queda fuera del suelo de la sala.');
    }

    sala.muebles.forEach((colocado, i) => {
      const donde = `${enSala} › mueble ${i + 1} ("${colocado.ref}")`;
      const mueble = muebles.get(colocado.ref);
      if (!mueble) {
        error('ref-inexistente', donde, `El mueble "${colocado.ref}" no está en el catálogo del lugar.`);
        return;
      }
      const caja = cajaDeMueble(colocado.x, colocado.y, mueble.ancho, mueble.alto);
      if (!muebleEnZona(zona, caja)) {
        error('fuera-de-la-zona', donde, `El mueble "${mueble.nombre}" se sale del suelo de la sala o queda contra una pared que este encuadre no tiene.`);
      }
      if (mueble.colision) conColision.push({ caja, nombre: mueble.nombre });
    });

    sala.objetos.forEach((colocado, i) => {
      const donde = `${enSala} › objeto ${i + 1} ("${colocado.ref}")`;
      if (!objetos.has(colocado.ref)) {
        error('ref-inexistente', donde, `El objeto "${colocado.ref}" no está en el catálogo del lugar.`);
      } else if (!puntoEnZona(zona, colocado.x, colocado.y)) {
        error('fuera-de-la-zona', donde, `El objeto "${objetos.get(colocado.ref).nombre}" queda fuera del suelo de la sala.`);
      }
    });

    sala.personajes.forEach((colocado, i) => {
      const donde = `${enSala} › personaje ${i + 1} ("${colocado.ref}")`;
      if (!personajes.has(colocado.ref)) {
        error('ref-inexistente', donde, `El personaje "${colocado.ref}" no está en la lista de personajes del lugar.`);
      } else if (!puntoEnZona(zona, colocado.x, colocado.y)) {
        error('fuera-de-la-zona', donde, `"${personajes.get(colocado.ref).nombre}" queda fuera del suelo de la sala.`);
      }
    });

    const libre = (x, y) => conColision.filter((m) => rectIntersecta(m.caja, cajaCentrada(x, y)));
    for (const tapa of libre(sala.entrada.x, sala.entrada.y)) {
      error('entrada-bloqueada', `${enSala} › entrada`, `El mueble "${tapa.nombre}" tapa la entrada: la persona quedaría atrapada.`);
    }

    for (const puerta of sala.puertas) {
      const donde = `${enSala} › puerta "${puerta.id}"`;
      if (!puntoEnZona(zona, puerta.x, puerta.y)) {
        error('fuera-de-la-zona', donde, `La puerta "${puerta.etiqueta}" queda fuera del suelo de la sala: nadie podría llegar a ella.`);
      }
      if (puerta.hacia === sala.id) {
        error('puerta-a-si-misma', donde, `La puerta "${puerta.id}" lleva a la misma sala en la que está.`);
      } else if (!salas.has(puerta.hacia)) {
        error('sala-inexistente', donde, `La puerta "${puerta.id}" lleva a una sala que no existe: "${puerta.hacia}".`);
      } else if (!salas.get(puerta.hacia).puertas.some((p) => p.hacia === sala.id)) {
        aviso('puerta-sin-vuelta', donde, `Se puede ir de "${sala.id}" a "${puerta.hacia}", pero no hay puerta para volver.`);
      }
      for (const tapa of libre(puerta.x, puerta.y)) {
        error('entrada-bloqueada', donde, `El mueble "${tapa.nombre}" tapa la puerta "${puerta.etiqueta}".`);
      }
    }
  }

  // Desde la primera sala se debe poder llegar a todas caminando por las puertas.
  const alcanzadas = new Set([escenario.salas[0].id]);
  const pendientes = [escenario.salas[0]];
  while (pendientes.length > 0) {
    for (const puerta of pendientes.pop().puertas) {
      if (salas.has(puerta.hacia) && !alcanzadas.has(puerta.hacia)) {
        alcanzadas.add(puerta.hacia);
        pendientes.push(salas.get(puerta.hacia));
      }
    }
  }
  for (const sala of escenario.salas) {
    if (!alcanzadas.has(sala.id)) {
      aviso('sala-inalcanzable', `sala "${sala.id}"`, `No se llega a "${sala.nombre}" desde "${escenario.salas[0].nombre}" por ninguna puerta.`);
    }
  }

  // Recorridos sugeridos.
  for (const recorrido of escenario.recorridosSugeridos) {
    for (const idSala of recorrido.salas) {
      if (!salas.has(idSala)) {
        error('sala-inexistente', `recorrido "${recorrido.id}"`, `El recorrido "${recorrido.nombre}" pasa por una sala que no existe: "${idSala}".`);
      }
    }
  }

  return { errores, avisos };
}

async function principal(argumentos) {
  const resto = [...argumentos];
  let kitDir = KIT_POR_DEFECTO;
  const iKit = resto.indexOf('--kit');
  if (iKit >= 0) {
    if (!resto[iKit + 1] || resto[iKit + 1].startsWith('--')) {
      console.error('Falta la carpeta del kit después de --kit.');
      return 2;
    }
    kitDir = path.resolve(process.cwd(), resto[iKit + 1]);
    resto.splice(iKit, 2);
  }
  const objetivo = resto[0];
  if (!objetivo) {
    console.error('Uso: npm run validar -- <carpeta del escenario> [--kit <carpeta del kit>]');
    return 2;
  }
  const dir = path.resolve(process.cwd(), objetivo);
  const { errores, avisos } = await validarEscenario(dir, { kitDir });
  for (const h of errores) console.log(`ERROR ${h.codigo} ${h.donde}: ${h.mensaje}`);
  for (const h of avisos) console.log(`AVISO ${h.codigo} ${h.donde}: ${h.mensaje}`);
  console.log(`${errores.length} error(es), ${avisos.length} aviso(s) en ${objetivo}`);
  return errores.length > 0 ? 1 : 0;
}

// import.meta.main (Node 24): también vale si el archivo se llama a través de un enlace de carpeta.
if (import.meta.main) {
  process.exitCode = await principal(process.argv.slice(2));
}
