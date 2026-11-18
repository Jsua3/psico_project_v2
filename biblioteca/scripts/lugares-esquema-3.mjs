import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDS = ['casa', 'comisaria', 'universidad'];
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


/**
 * Ajustes sobre la conversión de P1 (`tools/escenarios/piezas_convertir.py`): con la geometría de las reglas OCL-13 a 18
 * estos puntos quedan sobre una pared o fuera del suelo caminable. Se corrigen aquí, a la rejilla de 8, y no en
 * `piezas/lugares/*.json`, porque la prueba del convertidor exige que esos archivos sean su salida exacta. Si P1 los
 * corrige en el convertidor, esta tabla sobra (el script falla si un ajuste ya no encuentra su punto de partida).
 */
export const AJUSTES = Object.freeze({
  comisaria: [
    { sala: 'pasillo', grupo: 'muebles', indice: 1, ref: 'caneca-comisaria', de: 880, a: 840 },
    { sala: 'pasillo', grupo: 'muebles', indice: 2, ref: 'planta-oficina', de: 60, a: 120 },
  ],
  universidad: [
    { sala: 'pasillo', grupo: 'muebles', indice: 4, ref: 'planta', de: 890, a: 840 },
    { sala: 'cafeteria', grupo: 'muebles', indice: 5, ref: 'caneca', de: 880, a: 840 },
    { sala: 'cafeteria', grupo: 'entrada', de: 860, a: 840 },
  ],
});

function ajustar(id, salas) {
  for (const ajuste of AJUSTES[id] ?? []) {
    const sala = salas.find((s) => s.id === ajuste.sala);
    const punto = ajuste.grupo === 'entrada' ? sala?.entrada : sala?.[ajuste.grupo]?.[ajuste.indice];
    if (!punto || (ajuste.ref && punto.ref !== ajuste.ref) || punto.x !== ajuste.de) {
      throw new Error(`${id}/${ajuste.sala}: el ajuste de ${ajuste.ref ?? ajuste.grupo} ya no encuentra x=${ajuste.de}.`);
    }
    punto.x = ajuste.a;
  }
  return salas;
}

export function armarLugar(origen, anterior, manifiesto) {
  const id = anterior.id;
  if (origen.id !== id) throw new Error(`El id del origen no coincide con ${id}.`);
  const salas = ajustar(id, origen.salas.map(sala));
  const usados = [...new Set(salas.flatMap((s) => s.muebles.map((m) => m.ref)))].sort();
  const muebles = usados.map((ref) => {
    const original = anterior.catalogo.muebles.find((m) => m.id === ref);
    const pieza = manifiesto.muebles[`${id}/${ref}`];
    if (!pieza && !original) throw new Error(`Falta el mueble ${id}/${ref} en el manifiesto y el catálogo.`);
    if (!pieza) return original;
    const ficha = { id: ref, nombre: original?.nombre ?? pieza.nombre, arte: pieza.ruta,
      ancho: pieza.ancho, alto: pieza.alto, colision: original?.colision ?? true };
    if (pieza.huella) ficha.huella = { ...pieza.huella };
    return ficha;
  });
  // Los objetos se quedan como en el esquema 2: casi todos vienen de un modelo compartido (`desdeModelo`) y el
  // validador exige que su arte sea el del modelo. Cambiarles el arte por el de piezas es trabajo de la biblioteca.
  const objetos = anterior.catalogo.objetos.map((objeto) => ({ ...objeto }));
  for (const s of salas) {
    for (const [grupo, fichas] of [['muebles', muebles], ['objetos', objetos], ['personajes', anterior.personajes]]) {
      for (const item of s[grupo]) {
        if (!fichas.some((ficha) => ficha.id === item.ref)) throw new Error(`${id}/${s.id}: falta ${grupo}/${item.ref}.`);
      }
    }
  }
  return { ...anterior, esquema: 3, id, salas, catalogo: { ...anterior.catalogo, muebles, objetos } };
}

async function principal() {
  const leer = async (...partes) => JSON.parse(await readFile(path.join(RAIZ, ...partes), 'utf8'));
  const manifiesto = await leer('piezas', 'manifiesto.json');
  for (const id of IDS) {
    const lugar = armarLugar(await leer('piezas', 'lugares', `${id}.json`),
      await leer('escenarios', id, 'escenario.json'), manifiesto);
    const destino = path.join(RAIZ, 'escenarios', id, 'escenario-piezas.json');
    const texto = `${JSON.stringify(lugar, null, 2)}\n`;
    if (process.argv.includes('--verificar')) {
      if (await readFile(destino, 'utf8').catch(() => '') !== texto) {
        console.error(`${id}: escenario-piezas.json no está al día.`);
        process.exitCode = 1;
      }
    } else {
      await writeFile(destino, texto, 'utf8');
      console.log(`Escrito escenarios/${id}/escenario-piezas.json (${lugar.salas.length} salas).`);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
