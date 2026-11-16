/**
 * Validador de escenarios de la biblioteca.
 *
 * Primero revisa la forma del archivo con el esquema (esquema/escenario.schema.json).
 * Si la forma está bien, revisa la integridad: referencias, arte en disco, caras
 * de los personajes, entradas y puertas libres, y que todo quede dentro de la
 * zona caminable del encuadre.
 *
 * Uso: npm run validar -- escenarios/universidad
 *      npm run validar -- --todos   (todos los lugares de escenarios/indice.json)
 */
import { access, open, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  ALTO_SALA,
  ANCHO_SALA,
  cajaCentrada,
  cajaDeMueble,
  llegada,
  muebleEnZona,
  puntoEnZona,
  rectIntersecta,
  zonaCaminable,
} from './geometria.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_BIBLIOTECA = path.resolve(aqui, '..');
export const KIT_POR_DEFECTO = path.resolve(RAIZ_BIBLIOTECA, '../frontend/src/assets/characters/kit');
/** Seis caras: bond WITHDRAWN → triste, GUARDED → cautelosa, OPEN → alegre; activation CALM → neutral, TENSE → preocupada, CRISIS → en-crisis. */
export const EXPRESIONES = Object.freeze(['neutral', 'alegre', 'preocupada', 'triste', 'cautelosa', 'en-crisis']);
export const ESQUEMA_ACTUAL = 2;
export const CATALOGO_MODELOS = path.resolve(RAIZ_BIBLIOTECA, 'modelos', 'catalogo.json');
/** Campos de un objeto o herramienta que `desdeModelo` resuelve (los escribe modelos:aplicar). */
export const CAMPOS_DE_MODELO = Object.freeze(['arte', 'animacionCerca', 'alRevisar', 'textoInteraccion', 'efecto']);

/** Modelos interactivos de biblioteca/modelos, por id. */
export async function cargarModelos(ruta = CATALOGO_MODELOS) {
  const catalogo = JSON.parse(await readFile(ruta, 'utf8'));
  return new Map(catalogo.modelos.map((m) => [m.id, m]));
}

/**
 * Valores que un objeto o herramienta del lugar debe llevar cuando viene de un modelo:
 * el arte se copia a arte/<carpeta>/<id>.png y <id>-cerca.png; el resto se copia tal cual.
 */
export function camposResueltos(modelo, carpeta) {
  const base = `arte/${carpeta}/${modelo.id}`;
  return {
    arte: `${base}.png`,
    animacionCerca: { ...modelo.animacionCerca, hoja: `${base}-cerca.png` },
    alRevisar: modelo.alRevisar,
    textoInteraccion: modelo.textoInteraccion,
    efecto: modelo.efecto,
  };
}
export const MINIMO_DE_SALAS = 8;

let validadorDeEsquema;
async function esquema() {
  if (!validadorDeEsquema) {
    const texto = await readFile(path.join(RAIZ_BIBLIOTECA, 'esquema', 'escenario.schema.json'), 'utf8');
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false }); // los if/then del esquema 2 exigen campos definidos fuera de la rama
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
    case 'if':
    case 'not':
      return null; // el detalle lo dan los errores de las ramas (required, etc.)
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
export async function validarEscenario(dir, { kitDir = KIT_POR_DEFECTO, catalogoModelos = CATALOGO_MODELOS } = {}) {
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
      const mensaje = mensajeDeEsquema(e);
      if (mensaje) error('esquema', lugarDeEsquema(escenario, e.instancePath), mensaje);
    }
    return { errores, avisos };
  }
  if (escenario.esquema < ESQUEMA_ACTUAL) { // el 3 (salas por piezas) convive con el 2: no es «antiguo» ni «nuevo»
    aviso('esquema-antiguo', 'escenario', `El archivo usa el esquema ${escenario.esquema}; el actual es el ${ESQUEMA_ACTUAL} (hitos, nivel de riesgo y modelos compartidos).`);
  }

  // Objetos y herramientas que vienen de un modelo de biblioteca/modelos.
  const modelos = await cargarModelos(catalogoModelos);
  const pendientesDeModelo = new Set();
  const revisarModelo = (pieza, carpeta, donde) => {
    if (!pieza.desdeModelo) return;
    const modelo = modelos.get(pieza.desdeModelo);
    if (!modelo) {
      error('modelo-inexistente', donde, `El modelo "${pieza.desdeModelo}" no está en biblioteca/modelos/catalogo.json.`);
      pendientesDeModelo.add(pieza.id);
      return;
    }
    const propios = CAMPOS_DE_MODELO.filter((campo) => campo in pieza);
    if (propios.length === 0) {
      pendientesDeModelo.add(pieza.id);
      aviso('modelo-sin-aplicar', donde, `Viene del modelo "${pieza.desdeModelo}" y todavía no tiene su arte: ejecuta npm run modelos:aplicar -- <lugar>.`);
      return;
    }
    const esperados = camposResueltos(modelo, carpeta);
    const distintos = propios.filter((campo) => JSON.stringify(pieza[campo]) !== JSON.stringify(esperados[campo]));
    const debidos = carpeta === 'herramientas' ? CAMPOS_DE_MODELO.filter((c) => c !== 'textoInteraccion' && c !== 'efecto') : CAMPOS_DE_MODELO;
    const faltan = debidos.filter((campo) => !(campo in pieza));
    if (distintos.length === 0 && faltan.length > 0) {
      error('modelo-incompleto', donde, `Viene del modelo "${pieza.desdeModelo}" y le faltan ${faltan.join(', ')}: ejecuta npm run modelos:aplicar -- <lugar>.`);
      pendientesDeModelo.add(pieza.id);
      return;
    }
    if (distintos.length > 0) {
      error('desde-modelo-ambiguo', donde, `Viene del modelo "${pieza.desdeModelo}" pero ${distintos.join(', ')} no coinciden con el modelo (se editó la pieza o el modelo): ejecuta npm run modelos:aplicar -- <lugar>, o quita desdeModelo si la pieza es propia.`);
      pendientesDeModelo.add(pieza.id);
    }
  };
  for (const o of escenario.catalogo.objetos) revisarModelo(o, 'objetos', `objeto "${o.id}"`);
  for (const h of escenario.catalogo.herramientas) revisarModelo(h, 'herramientas', `herramienta "${h.id}"`);

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
  revisarIds((escenario.hitos ?? []).map((h) => ({ id: h.key })), 'hitos', 'hito');
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
    // `piezas/…` (esquema 3) es del catálogo de piezas, relativo a biblioteca/; `arte/…`, de la carpeta del lugar.
    const completa = ruta.startsWith('piezas/') ? path.join(RAIZ_BIBLIOTECA, ruta) : path.join(dir, ruta);
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
    if (sala.fondo) await revisarArte(sala.fondo, `sala "${sala.id}" › fondo`, { ancho: ANCHO_SALA, alto: ALTO_SALA });
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
    if (pendientesDeModelo.has(o.id)) continue; // sin arte todavía, o ya avisado
    await revisarArte(o.arte, `objeto "${o.id}"`);
    await revisarHoja(o, `objeto "${o.id}"`);
  }
  for (const h of escenario.catalogo.herramientas) {
    if (pendientesDeModelo.has(h.id)) continue;
    await revisarArte(h.arte, `herramienta "${h.id}"`);
    await revisarHoja(h, `herramienta "${h.id}"`);
  }

  // Caras de cada personaje en el kit (las seis).
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
    const ancho = sala.estructura?.ancho ?? ANCHO_SALA;
    const zona = zonaCaminable(sala.encuadre, ancho);
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
      // Con `huella` (esquema 3) choca la base en el piso, no la caja del dibujo, igual que en el servidor.
      const choque = mueble.huella
        ? { x: colocado.x - mueble.huella.ancho / 2, y: colocado.y - mueble.huella.fondo, ancho: mueble.huella.ancho, alto: mueble.huella.fondo }
        : caja;
      if (mueble.colision) conColision.push({ caja: choque, nombre: mueble.nombre });
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
      // Una puerta en el muro (esquema 3) se juzga en su umbral: la llegada de su (muro, pos).
      const umbral = puerta.muro ? llegada(puerta.muro, puerta.pos, sala.encuadre, ancho) : { x: puerta.x, y: puerta.y };
      if (!puntoEnZona(zona, umbral.x, umbral.y)) {
        error('fuera-de-la-zona', donde, `La puerta "${puerta.etiqueta}" queda fuera del suelo de la sala: nadie podría llegar a ella.`);
      }
      if (puerta.hacia === sala.id) {
        error('puerta-a-si-misma', donde, `La puerta "${puerta.id}" lleva a la misma sala en la que está.`);
      } else if (!salas.has(puerta.hacia)) {
        error('sala-inexistente', donde, `La puerta "${puerta.id}" lleva a una sala que no existe: "${puerta.hacia}".`);
      } else if (!puerta.sentidoUnico && !salas.get(puerta.hacia).puertas.some((p) => p.hacia === sala.id)) {
        aviso('puerta-sin-vuelta', donde, `Se puede ir de "${sala.id}" a "${puerta.hacia}", pero no hay puerta para volver.`);
      }
      for (const tapa of libre(umbral.x, umbral.y)) {
        error('entrada-bloqueada', donde, `El mueble "${tapa.nombre}" tapa la puerta "${puerta.etiqueta}".`);
      }
    }
  }

  // Hitos: los que marca cada objeto o herramienta deben existir, y un hito decisivo que nada
  // del lugar puede cumplir se avisa (lo cumple la autora con sus respuestas).
  const hitosDelLugar = new Set((escenario.hitos ?? []).map((h) => h.key));
  const hitosConForma = new Set();
  for (const [grupo, lista] of [['objeto', escenario.catalogo.objetos], ['herramienta', escenario.catalogo.herramientas]]) {
    for (const pieza of lista) {
      for (const key of pieza.hitos ?? []) {
        if (hitosDelLugar.has(key)) hitosConForma.add(key);
        else error('hito-inexistente', `${grupo} "${pieza.id}"`, `Marca el hito "${key}", que no está en los hitos del lugar.`);
      }
    }
  }
  for (const hito of escenario.hitos ?? []) {
    if (hito.decisive && !hitosConForma.has(hito.key)) {
      aviso('hito-sin-forma-de-cumplirse', `hito "${hito.key}"`, `Ningún objeto ni herramienta del lugar cumple el hito decisivo "${hito.key}" (${hito.label}); lo cumplirá la autora con sus respuestas.`);
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

export const DIR_ESCENARIOS = path.resolve(RAIZ_BIBLIOTECA, 'escenarios');

/**
 * Valida todos los lugares que nombra escenarios/indice.json y el índice mismo: cada entrada
 * debe existir en disco y sus cifras (`salas`, `hitos`) y banderas deben coincidir con el
 * escenario; un lugar en disco que el índice no nombra es aviso.
 * @returns {Promise<{ errores: Hallazgo[], avisos: Hallazgo[], lugares: string[] }>}
 */
export async function validarTodos(dirEscenarios = DIR_ESCENARIOS, { kitDir = KIT_POR_DEFECTO } = {}) {
  const errores = [];
  const avisos = [];
  const lugares = [];
  const archivo = path.join(dirEscenarios, 'indice.json');
  let indice;
  try {
    indice = JSON.parse(await readFile(archivo, 'utf8'));
  } catch (causa) {
    errores.push({ codigo: 'indice', donde: 'indice.json', mensaje: `No se pudo leer el índice: ${causa.message}` });
    return { errores, avisos, lugares };
  }
  if (!Array.isArray(indice.lugares)) {
    errores.push({ codigo: 'indice', donde: 'indice.json', mensaje: 'El índice necesita una lista "lugares".' });
    return { errores, avisos, lugares };
  }
  const prefijar = (lista, id) => lista.map((h) => ({ ...h, donde: `${id} › ${h.donde}` }));
  for (const [i, entrada] of indice.lugares.entries()) {
    if (!entrada || typeof entrada !== 'object' || typeof entrada.id !== 'string') {
      errores.push({ codigo: 'indice', donde: `indice.json › lugares[${i}]`, mensaje: 'Cada entrada del índice necesita un "id" de texto (el nombre interno del lugar).' });
      continue;
    }
    const dir = path.join(dirEscenarios, entrada.id);
    if (!(await existe(path.join(dir, 'escenario.json')))) {
      errores.push({ codigo: 'indice-lugar-inexistente', donde: `indice.json › ${entrada.id}`, mensaje: `El índice nombra el lugar "${entrada.id}" y no hay escenarios/${entrada.id}/escenario.json.` });
      continue;
    }
    lugares.push(entrada.id);
    const resultado = await validarEscenario(dir, { kitDir });
    errores.push(...prefijar(resultado.errores, entrada.id));
    avisos.push(...prefijar(resultado.avisos, entrada.id));
    if (resultado.errores.some((h) => h.codigo === 'esquema')) continue; // el archivo no se pudo leer o no tiene la forma: ya está reportado
    const escenario = JSON.parse(await readFile(path.join(dir, 'escenario.json'), 'utf8'));
    const cifras = {
      nombre: escenario.nombre, salas: escenario.salas?.length ?? 0, completo: escenario.completo,
      arteProvisional: escenario.arteProvisional, hitos: escenario.hitos?.length ?? 0,
    };
    for (const [campo, valor] of Object.entries(cifras)) {
      if (campo in entrada && JSON.stringify(entrada[campo]) !== JSON.stringify(valor)) {
        errores.push({ codigo: 'indice-no-coincide', donde: `indice.json › ${entrada.id}`, mensaje: `El índice dice ${campo} = ${JSON.stringify(entrada[campo])} y el escenario tiene ${JSON.stringify(valor)}.` });
      }
    }
  }
  const nombrados = new Set(lugares);
  for (const carpeta of await readdir(dirEscenarios, { withFileTypes: true })) {
    if (carpeta.isDirectory() && !nombrados.has(carpeta.name) && (await existe(path.join(dirEscenarios, carpeta.name, 'escenario.json')))) {
      avisos.push({ codigo: 'indice-falta-lugar', donde: 'indice.json', mensaje: `Hay un lugar en disco que el índice no nombra: "${carpeta.name}".` });
    }
  }
  return { errores, avisos, lugares };
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
    console.error('Uso: npm run validar -- <carpeta del escenario> | --todos [--kit <carpeta del kit>]');
    return 2;
  }
  const todos = objetivo === '--todos';
  const dir = todos ? DIR_ESCENARIOS : path.resolve(process.cwd(), objetivo);
  const { errores, avisos, lugares } = todos ? await validarTodos(dir, { kitDir }) : await validarEscenario(dir, { kitDir });
  if (todos) console.log(`Lugares del índice: ${lugares.join(', ')}`);
  for (const h of errores) console.log(`ERROR ${h.codigo} ${h.donde}: ${h.mensaje}`);
  for (const h of avisos) console.log(`AVISO ${h.codigo} ${h.donde}: ${h.mensaje}`);
  console.log(`${errores.length} error(es), ${avisos.length} aviso(s) en ${objetivo}`);
  return errores.length > 0 ? 1 : 0;
}

// import.meta.main (Node 24): también vale si el archivo se llama a través de un enlace de carpeta.
if (import.meta.main) {
  process.exitCode = await principal(process.argv.slice(2));
}
