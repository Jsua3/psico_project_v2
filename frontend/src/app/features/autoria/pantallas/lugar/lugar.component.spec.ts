import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BibliotecaService } from '../../modelo/biblioteca.service';
import { LugarComponent } from './lugar.component';

async function montar(lugares: () => Promise<unknown[]>) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [LugarComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { lugares } }],
  }).compileComponents();
  const fixture = TestBed.createComponent(LugarComponent);
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); await new Promise((r) => setTimeout(r, 0)); fixture.detectChanges(); };
  await listo();
  return { fixture, raiz: fixture.nativeElement as HTMLElement, listo };
}

describe('LugarComponent', () => {
  it('si los lugares no se pueden leer, lo dice y deja volver a intentarlo', async () => {
    const lugares = vi.fn().mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce([
      { id: 'universidad', nombre: 'Universidad', descripcion: 'Campus.', temas: [], completo: true, salas: 10, portada: '' },
    ]);
    const { raiz, listo } = await montar(lugares);
    const aviso = raiz.querySelector('[role="alert"]')!;
    expect(aviso.textContent).toContain('No pudimos cargar los lugares');
    expect(raiz.textContent).not.toContain('Cargando lugares…');

    aviso.querySelector('button')!.click();
    await listo();
    expect(raiz.querySelector('[role="alert"]')).toBeNull();
    expect(raiz.textContent).toContain('Universidad');
    expect(lugares).toHaveBeenCalledTimes(2);
  });
});
