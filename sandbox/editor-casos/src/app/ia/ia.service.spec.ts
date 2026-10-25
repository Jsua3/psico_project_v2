import { TestBed } from '@angular/core/testing';

import universidadJson from '../../../public/assets/biblioteca/universidad/escenario.json';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { IaService } from './ia.service';
import { MENSAJE_PROPUESTA_INVALIDA } from './propuestas';

const universidad = universidadJson as unknown as Escenario;
const caso = () => copiarEscenarioAlCaso(universidad, ['consultorio'], 'Caso');
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

describe('IaService', () => {
  let ia: IaService;
  beforeEach(() => {
    TestBed.resetTestingModule();
    ia = TestBed.inject(IaService);
  });
  afterEach(() => vi.restoreAllMocks());

  it('sin servidor el chat queda en modo sin conexión y responde con un ejemplo válido', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await ia.proponer(caso(), 'Escribe una línea', { pantalla: 'guion', seleccion: null });
    expect(ia.estado()).toBe('sin-conexion');
    expect(r.modo).toBe('sin-conexion');
    expect(r.invalida).toBe(false);
    expect(r.cambios!.length).toBeGreaterThan(0);
    expect(r.mensaje).toMatch(/sin conexión/i);
  });

  it('si el proxy responde sin JSON (servidor de IA apagado) también pasa a sin conexión', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Error</html>', { status: 504, headers: { 'content-type': 'text/html' } }));
    const r = await ia.proponer(caso(), 'Hola', { pantalla: 'mapa', seleccion: null });
    expect(ia.estado()).toBe('sin-conexion');
    expect(r.modo).toBe('sin-conexion');
  });

  it('el tope diario deja el estado en límite con el mensaje del servidor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ mensaje: 'Llegaste al límite de ayuda de la IA por hoy.' }, 429));
    const r = await ia.proponer(caso(), 'Hola', { pantalla: 'mapa', seleccion: null });
    expect(ia.estado()).toBe('limite');
    expect(r.mensaje).toBe('Llegaste al límite de ayuda de la IA por hoy.');
    expect(r.cambios).toEqual([]);
  });

  it('una propuesta que no cuadra con el caso se marca como inválida', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      mensaje: 'Listo', modo: 'conectado',
      cambios: [{ op: 'agregar-linea', escenaId: 'no-existe', personajeId: 'x', texto: 'Hola', expresion: 'neutral' }],
    }));
    const r = await ia.proponer(caso(), 'Hola', { pantalla: 'mapa', seleccion: null });
    expect(ia.estado()).toBe('conectado');
    expect(r.invalida).toBe(true);
    expect(r.mensaje).toBe(MENSAJE_PROPUESTA_INVALIDA);
  });

  it('envía el caso con sus avisos de caminos, la petición y el contexto', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ mensaje: 'Hola', modo: 'conectado', cambios: [] }));
    await ia.proponer(caso(), 'Explica los caminos', { pantalla: 'mapa', seleccion: null });
    const [url, init] = espia.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ia/proponer');
    const cuerpo = JSON.parse(init.body as string);
    expect(cuerpo.peticion).toBe('Explica los caminos');
    expect(cuerpo.contexto).toEqual({ pantalla: 'mapa', seleccion: null });
    expect(Array.isArray(cuerpo.avisos)).toBe(true);
    expect(cuerpo.caso.titulo).toBe('Caso');
  });
});
