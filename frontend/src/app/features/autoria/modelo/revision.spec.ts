import { revisarCaminos } from './caminos';
import type { CasoBorrador, Escena, Respuesta } from './caso';
import { puedeEnviar } from './revision';

const resp = (id: string, destinoId: string | null): Respuesta =>
  ({ id, texto: `Respuesta ${id}`, clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: 'Bien.', destinoId, marcaIa: false });
const esc = (id: string, respuestas: Respuesta[] = [], esFinal = false): Escena =>
  ({ id, titulo: `Escena ${id}`, narracion: '', salaId: 'consultorio', lineas: [], respuestas, esFinal, posicion: { x: 0, y: 0 }, intensidad: 'MEDIUM', advertencia: null });

function completo(): CasoBorrador {
  return {
    id: 'c', revision: 0, hitos: [], nivelRiesgo: null, titulo: 'Caso', lugarId: 'universidad', salas: [], inicioId: 'a', modoFinales: 'automatico', finales: [],
    escenas: [esc('a', [resp('1', 'b'), resp('2', 'c')]), esc('b', [], true), esc('c', [], true)],
    personajes: [], catalogo: { muebles: [], objetos: [], herramientas: [] },
  };
}

describe('puedeEnviar', () => {
  it('un caso completo puede enviarse', () => {
    expect(puedeEnviar(completo())).toEqual({ ok: true, faltas: [] });
  });

  it('una línea con marcaIa bloquea el envío', () => {
    const caso = completo();
    caso.escenas[0].lineas = [{ id: 'l1', personajeId: 'p', texto: 'Hola', expresion: 'neutral', marcaIa: true }];
    const r = puedeEnviar(caso);
    expect(r.ok).toBe(false);
    expect(r.faltas).toEqual([{ mensaje: '1 parte generada por IA sin revisar.', ir: { ruta: '/editor/escena/a', accionId: 'aceptar-ia' } }]);
  });

  it('varias partes de IA se cuentan juntas, incluidos finales y escenas', () => {
    const caso = completo();
    caso.escenas[0].respuestas[0].marcaIa = true;
    caso.escenas[1].marcaIa = true;
    caso.finales = [{ id: 'f', nombre: 'F', texto: 'T', tono: 'neutral', condicion: { count: 'contraindicated', gte: 1 }, marcaIa: true }];
    expect(puedeEnviar(caso).faltas.map((f) => f.mensaje)).toEqual(['3 partes generadas por IA sin revisar.']);
  });

  it('cada aviso de camino bloquea el envío con su mensaje', () => {
    const casos: CasoBorrador[] = [];
    const sinSalida = completo(); sinSalida.escenas[1].esFinal = false; casos.push(sinSalida);
    const inalcanzable = completo(); inalcanzable.escenas.push(esc('d', [], true)); casos.push(inalcanzable);
    const sinDestino = completo(); sinDestino.escenas[0].respuestas.push(resp('3', null)); casos.push(sinDestino);
    const sinInicio = completo(); sinInicio.inicioId = null; casos.push(sinInicio);
    const sinFinal = completo(); sinFinal.escenas[1].esFinal = false; sinFinal.escenas[2].esFinal = false;
    sinFinal.escenas[1].respuestas = [resp('4', 'a')]; sinFinal.escenas[2].respuestas = [resp('5', 'a')]; casos.push(sinFinal);
    const tipos = new Set<string>();
    for (const caso of casos) {
      const r = puedeEnviar(caso);
      expect(r.ok).toBe(false);
      for (const aviso of revisarCaminos(caso)) {
        tipos.add(aviso.tipo);
        expect(r.faltas.map((f) => f.mensaje)).toContain(aviso.mensaje);
      }
    }
    expect([...tipos].sort()).toEqual(['inalcanzable', 'respuesta-sin-destino', 'sin-final', 'sin-inicio', 'sin-salida']);
  });

  it('un final que espera un hito que ya no existe lleva a la pantalla de finales', () => {
    const caso = completo();
    caso.modoFinales = 'propio';
    caso.finales = [{ id: 'f1', nombre: 'Cierre', texto: 'Fin', tono: 'neutral', condicion: { milestone: 'borrado' }, marcaIa: false }];
    expect(puedeEnviar(caso).faltas).toEqual([
      { mensaje: 'El final «Cierre» espera un paso del caso que ya no existe.', ir: { ruta: '/editor/finales', accionId: 'definir-finales' } },
    ]);
  });

  it('las respuestas sin clasificar bloquean el envío y llevan a la escena', () => {
    const caso = completo();
    caso.escenas[0].respuestas[1].clase = null;
    const r = puedeEnviar(caso);
    expect(r.ok).toBe(false);
    expect(r.faltas).toEqual([{ mensaje: 'Hay 1 respuesta sin clasificar.', ir: { ruta: '/editor/escena/a' } }]);
    caso.escenas[0].respuestas[0].clase = null;
    expect(puedeEnviar(caso).faltas[0].mensaje).toBe('Hay 2 respuestas sin clasificar.');
  });
});
