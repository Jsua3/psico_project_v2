import Ajv2020 from 'ajv/dist/2020';

import esquema from '../../../public/assets/biblioteca/escenario.schema.json';
import universidad from '../../../public/assets/biblioteca/universidad/escenario.json';
import { BibliotecaService } from './biblioteca.service';

describe('Biblioteca', () => {
  it('la universidad cumple el esquema de P1', () => {
    const validar = new Ajv2020({ allErrors: true, strict: true }).compile(esquema);
    const ok = validar(universidad);
    expect(validar.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('la universidad tiene al menos 8 salas', () => {
    expect(universidad.salas.length).toBeGreaterThanOrEqual(8);
  });

  it('lugares lista la universidad completa y la casa y la comisaría como «Pronto»', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(universidad)));
    const lugares = await new BibliotecaService().lugares();
    expect(lugares).toEqual([
      { id: 'universidad', nombre: 'Universidad', completo: true, salas: universidad.salas.length },
      { id: 'casa', nombre: 'Casa', completo: false, salas: 0 },
      { id: 'comisaria-familia', nombre: 'Comisaría de familia', completo: false, salas: 0 },
    ]);
    vi.restoreAllMocks();
  });

  it('escenario lee el JSON del lugar desde assets', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(universidad)));
    const escenario = await new BibliotecaService().escenario('universidad');
    expect(espia).toHaveBeenCalledWith('assets/biblioteca/universidad/escenario.json');
    expect(escenario.id).toBe('universidad');
    vi.restoreAllMocks();
  });
});
