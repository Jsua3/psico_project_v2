/**
 * Arma `escenarios/hospital/escenario.json` (esquema 3, salas por piezas) a partir de lo que dibujó P1:
 * las salas de `piezas/lugares/hospital.json` y el catálogo de `piezas/manifiesto.json`. Agrega el hospital
 * a `escenarios/indice.json` si no está. Los otros tres lugares siguen en esquema 2, con su imagen fija: conviven.
 *
 * Lo que P1 no trae y un lugar de la biblioteca necesita lo pone este script: los nombres y roles de los
 * personajes (cada uno con su receta del kit), el catálogo de muebles (arte, medida y huella del manifiesto)
 * y unos hitos del lugar. Todo el contenido nuevo queda marcado como por validar con Psicología.
 *
 * Uso: node scripts/hospital-esquema-3.mjs [--verificar]   (con --verificar sale con 1 si el archivo no está al día)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = path.join(RAIZ, 'piezas', 'lugares', 'hospital.json');
const MANIFIESTO = path.join(RAIZ, 'piezas', 'manifiesto.json');
const DESTINO = path.join(RAIZ, 'escenarios', 'hospital', 'escenario.json');
const INDICE = path.join(RAIZ, 'escenarios', 'indice.json');

// BORRADOR: nombres, roles y hitos del hospital, pendientes de la revisión de Psicología.
export const PERSONAJES = Object.freeze([
  { id: 'enfermera-urgencias', nombre: 'Enfermera de urgencias', rol: 'Enfermera jefe del turno de noche' },
  { id: 'medico-guardia', nombre: 'Médico de guardia', rol: 'Médico de urgencias' },
  { id: 'trabajadora-social', nombre: 'Trabajadora social', rol: 'Trabajadora social del hospital' },
  { id: 'abuela-familia', nombre: 'Abuela', rol: 'Familiar de la paciente' },
  { id: 'madre-acompanante', nombre: 'Acompañante', rol: 'Familiar que acompaña en la sala de espera' },
  { id: 'paciente-espera', nombre: 'Paciente en espera', rol: 'Persona que espera turno en urgencias' },
  { id: 'seguridad', nombre: 'Vigilante', rol: 'Personal de seguridad del hospital' },
]);

export const HITOS = Object.freeze([
  { key: 'primer-contacto', label: 'Primer contacto', description: 'Observar y presentarse antes de intervenir (primeros auxilios psicológicos).', decisive: false },
  { key: 'entorno-preparado', label: 'Entorno preparado', description: 'Buscar un lugar seguro y privado para hablar.', decisive: false },
  { key: 'equipo-coordinado', label: 'Equipo coordinado', description: 'Acordar con el equipo de salud una sola voz para la familia.', decisive: false },
  { key: 'familia-contenida', label: 'Familia contenida', description: 'Contener a la familia antes de informar.', decisive: false },
]);

const ORIENTACIONES = new Set([
  'izquierda', 'derecha', 'abajo', 'arriba', 'abajo-izquierda', 'abajo-derecha', 'arriba-izquierda', 'arriba-derecha',
]);

function punto(entrada) {
  return Array.isArray(entrada) ? { x: entrada[0], y: entrada[1] } : { x: entrada.x, y: entrada.y };
}

function sala(origen) {
  return {
    id: origen.id,
    nombre: origen.nombre,
    descripcion: origen.descripcion,
    encuadre: origen.encuadre,
    estructura: origen.estructura,
    entrada: punto(origen.entrada),
    muebles: (origen.muebles ?? []).map((m) => ({ ref: m.ref, x: m.x, y: m.y, espejo: Boolean(m.espejo) })),
    objetos: (origen.objetos ?? []).map((o) => ({ ref: o.ref, x: o.x, y: o.y })),
    personajes: (origen.personajes ?? []).map((p) => ({
      ref: p.ref, x: p.x, y: p.y,
      mirando: ORIENTACIONES.has(p.mirando) ? p.mirando : 'abajo',
      expresion: p.expresion ?? 'neutral',
    })),
    puertas: (origen.puertas ?? []).map((p) => {
      const puerta = { id: p.id, hacia: p.hacia, muro: p.muro, pos: p.pos, modelo: p.modelo, etiqueta: p.etiqueta };
      if (p.par) puerta.par = p.par;
      if (p.sentidoUnico) puerta.sentidoUnico = true;
      return puerta;
    }),
  };
}

/** El escenario del hospital en esquema 3, a partir de las salas de P1 y su manifiesto. */
export function armarHospital(origen, manifiesto) {
  const salas = origen.salas.map(sala);
  const usados = [...new Set(salas.flatMap((s) => s.muebles.map((m) => m.ref)))].sort();
  const muebles = usados.map((ref) => {
    const m = manifiesto.muebles[`hospital/${ref}`];
    if (!m) throw new Error(`El manifiesto de piezas no tiene el mueble "hospital/${ref}".`);
    const mueble = { id: ref, nombre: m.nombre, arte: m.ruta, ancho: m.ancho, alto: m.alto, colision: true };
    if (m.huella) mueble.huella = { ancho: m.huella.ancho, fondo: m.huella.fondo, alto: m.huella.alto };
    return mueble;
  });
  const enSalas = new Set(salas.flatMap((s) => s.personajes.map((p) => p.ref)));
  const personajes = PERSONAJES.filter((p) => enSalas.has(p.id)).map((p) => ({ ...p, recipeId: p.id }));
  return {
    esquema: 3,
    id: 'hospital',
    nombre: origen.nombre ?? 'Hospital',
    descripcion: origen.descripcion,
    // Temas que el editor ya sabe nombrar (`features/autoria/modelo/textos.ts`): uno nuevo dejaría su filtro sin nombre.
    temas: ['violencia-genero', 'rutas-proteccion'],
    completo: true,
    arteProvisional: false,
    nivelRiesgoPorDefecto: 'SEVERE',
    hitos: HITOS.map((h) => ({ ...h })),
    salas,
    recorridosSugeridos: [
      {
        id: 'urgencias-de-noche',
        nombre: 'Urgencias de noche',
        descripcion: 'De la entrada de urgencias a la sala de escucha, pasando por la sala de espera y el pasillo.',
        salas: ['entrada-urgencias', 'sala-espera', 'pasillo', 'estacion-enfermeria', 'sala-escucha', 'trabajo-social'],
      },
    ],
    catalogo: { muebles, objetos: [], herramientas: [] },
    personajes,
  };
}

function entradaDelIndice(hospital) {
  return {
    id: hospital.id, nombre: hospital.nombre, salas: hospital.salas.length, completo: hospital.completo,
    arteProvisional: hospital.arteProvisional, temas: hospital.temas, hitos: hospital.hitos.length,
  };
}

const texto = (valor) => `${JSON.stringify(valor, null, 2)}\n`;

async function principal(argumentos) {
  const origen = JSON.parse(await readFile(ORIGEN, 'utf8'));
  const manifiesto = JSON.parse(await readFile(MANIFIESTO, 'utf8'));
  const hospital = armarHospital(origen, manifiesto);
  const indice = JSON.parse(await readFile(INDICE, 'utf8'));
  const otros = indice.lugares.filter((l) => l.id !== 'hospital');
  const nuevoIndice = { ...indice, lugares: [...otros, entradaDelIndice(hospital)] };
  if (argumentos.includes('--verificar')) {
    const actual = await readFile(DESTINO, 'utf8').catch(() => '');
    const indiceActual = await readFile(INDICE, 'utf8');
    if (actual !== texto(hospital) || indiceActual !== texto(nuevoIndice)) {
      console.error('escenarios/hospital no está al día: corre node scripts/hospital-esquema-3.mjs');
      process.exitCode = 1;
    }
    return;
  }
  await mkdir(path.dirname(DESTINO), { recursive: true });
  await writeFile(DESTINO, texto(hospital), 'utf8');
  await writeFile(INDICE, texto(nuevoIndice), 'utf8');
  console.log(`Escrito ${path.relative(RAIZ, DESTINO)} (${hospital.salas.length} salas, ${hospital.catalogo.muebles.length} muebles).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
