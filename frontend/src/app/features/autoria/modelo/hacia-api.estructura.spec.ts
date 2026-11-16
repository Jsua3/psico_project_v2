import { describe, expect, it } from 'vitest';
import { CASO_HOSPITAL, MUNDO_HOSPITAL } from '../testing/hospital';
import { solicitudDeSala } from './hacia-api';
import { llegada } from './geometria';

const preparar = () => {
  const caso = structuredClone(CASO_HOSPITAL);
  const previo = structuredClone(MUNDO_HOSPITAL[0]);
  const contexto = { revision: caso.revision, catalogo: caso.catalogo, personajes: caso.personajes, personajesDelCaso: [], nodosPorSala: new Map([['pasillo', 'pasillo'], ['sala-espera', 'sala-espera']]) };
  return { sala: caso.salas[0], previo, contexto };
};
describe('guardar estructura y puertas', () => {
  it('guardar un cambio ajeno conserva structure y los metadatos de las puertas byte a byte', () => {
    const { sala, previo, contexto } = preparar(); sala.muebles[0].x += 8;
    for (const puerta of sala.puertas) {
      const destino = previo.objects.find(o => o.key === puerta.id)!.metadata['targetNodeKey'] as string;
      puerta.hacia = destino;
      contexto.nodosPorSala.set(destino, destino);
    }
    const solicitud = solicitudDeSala(sala, contexto, previo).solicitud;
    expect(JSON.stringify(solicitud.map.structure)).toBe(JSON.stringify(previo.map.structure));
    for (const base of previo.objects.filter(o => o.type === 'EXIT')) {
      expect(JSON.stringify(solicitud.objects.find(o => o.key === base.key)!.metadata)).toBe(JSON.stringify(base.metadata));
    }
  });
  it('conserva la escena original cuando varias escenas comparten la sala destino', () => {
    const { sala, previo, contexto } = preparar();
    previo.objects.find(o => o.key === 'a-pasillo')!.metadata['targetNodeKey'] = 'pasillo-otra-escena';
    const ampliado = { ...contexto, salaPorNodo: new Map([['pasillo', 'pasillo'], ['pasillo-otra-escena', 'pasillo']]) };
    expect(solicitudDeSala(sala, ampliado, previo).solicitud.objects.find(o => o.key === 'a-pasillo')!.metadata['targetNodeKey']).toBe('pasillo-otra-escena');
  });
  it('una estructura cambiada viaja en map.structure', () => {
    const { sala, previo, contexto } = preparar(); sala.estructura!.acabados.piso = 'madera';
    expect(solicitudDeSala(sala, contexto, previo).solicitud.map.structure).toEqual(sala.estructura);
  });
  it('mover una puerta cambia metadata.pos y no toca x, y', () => {
    const { sala, previo, contexto } = preparar(); sala.puertas[0].pos = 184;
    const objeto = solicitudDeSala(sala, contexto, previo).solicitud.objects.find(o => o.key === 'a-pasillo')!;
    expect(objeto.metadata['pos']).toBe(184); expect([objeto.x, objeto.y]).toEqual([150, 406]);
  });
  it('una puerta nueva sale como EXIT con targetNodeKey de la primera escena de su sala destino, muro, pos y modelo', () => {
    const { sala, previo, contexto } = preparar();
    sala.puertas.push({ id: 'nueva', hacia: 'pasillo', x: 0, y: 0, etiqueta: 'Pasillo', muro: 'fondo', pos: 400, modelo: 'madera' });
    const objeto = solicitudDeSala(sala, contexto, previo).solicitud.objects.find(o => o.key === 'nueva')!;
    expect(objeto).toMatchObject({ type: 'EXIT', width: 24, height: 40, ...llegada('fondo', 400, sala.encuadre, 1440), metadata: { targetNodeKey: 'pasillo', muro: 'fondo', pos: 400, modelo: 'madera' } });
  });
  it('una puerta quitada no se env?a', () => {
    const { sala, previo, contexto } = preparar(); sala.puertas = [];
    expect(solicitudDeSala(sala, contexto, previo).solicitud.objects.some(o => o.type === 'EXIT')).toBe(false);
  });
  it('una puerta sin destino no se env?a', () => {
    const { sala, previo, contexto } = preparar(); sala.puertas[0].hacia = null;
    expect(solicitudDeSala(sala, contexto, previo).solicitud.objects.some(o => o.key === 'a-pasillo')).toBe(false);
  });
  it('mover un mueble traslada su zona choque-* sin cambiar su forma', () => {
    const { sala, previo, contexto } = preparar(); sala.muebles[0].x += 24; sala.muebles[0].y -= 8;
    const zona = previo.collisionZones.find(z => z.key === 'choque-sillas-espera')!;
    expect(solicitudDeSala(sala, contexto, previo).solicitud.collisionZones.find(z => z.key === zona.key)).toEqual({ ...zona, x: zona.x + 24, y: zona.y - 8 });
  });
});
